"""
Turn the Canadian Parquet slice into the exact rows the SQLite loader inserts.

All of the awkward work happens here rather than in the loader, so that the
loader is a dumb fast writer and every judgement about what a row *means* lives
in one file that can be argued with.

Four judgements are made here, each one a decision from
`docs/pipeline-decisions-and-plan.md`:

  20  Names are split by language, not collapsed. English and French are pulled
      out by tag; anything else becomes the fallback display name only when
      neither exists, so an Italian-only product is still reachable rather than
      dropped.
  19/37  Size is identity and unit price needs it. `product_quantity` is trusted
      when present because OFF has already normalised it to grams or millilitres;
      the free-text `quantity` is parsed only as a fallback, and a multipack
      ("12 x 355 mL") is multiplied out rather than recorded as 355.
  27  The category path is kept in OFF's own broad-to-specific order. Ring
      widening walks it in reverse, so the order is the data structure and
      flattening it to one label would delete the feature.
  40  Allergen tags are carried through untouched. They are printed on an
      alternative row and are the one place where being helpful can hurt someone.
"""

import json
import re
import sys

import duckdb

IN = sys.argv[1] if len(sys.argv) > 1 else "data/canada.parquet"
OUT = sys.argv[2] if len(sys.argv) > 2 else "data/rows.jsonl"

# "12 x 355 mL", "4x100g" -- a multipack's size is the product of both numbers.
MULTIPACK = re.compile(r"(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)")
SINGLE = re.compile(r"(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)")

# Everything reduces to grams, millilitres, or "each". The spine compares unit
# prices per 100 g / 100 ml, so a litre stored as a litre would silently be a
# thousandth of the comparison it should be.
UNIT_TO_BASE = {
    "g": ("g", 1.0), "gr": ("g", 1.0), "gram": ("g", 1.0), "grams": ("g", 1.0),
    "kg": ("g", 1000.0), "kgs": ("g", 1000.0),
    "mg": ("g", 0.001),
    "oz": ("g", 28.349523125), "lb": ("g", 453.59237), "lbs": ("g", 453.59237),
    "gramme": ("g", 1.0), "grammes": ("g", 1.0),
    "ml": ("ml", 1.0), "milliliter": ("ml", 1.0), "millilitre": ("ml", 1.0),
    "millilitres": ("ml", 1.0), "milliliters": ("ml", 1.0),
    "cl": ("ml", 10.0), "dl": ("ml", 100.0),
    "l": ("ml", 1000.0), "lt": ("ml", 1000.0), "litre": ("ml", 1000.0), "liter": ("ml", 1000.0),
    "litres": ("ml", 1000.0), "liters": ("ml", 1000.0),
    "floz": ("ml", 29.5735295625),
}

# Upstream Open Food Facts fields are untrusted, so a value that will not parse is
# never fatal and never silent: it is counted by kind, and the end summary prints
# each count with up to three of the bad values. A row with a bad field is still
# written (the field is absent, as it always was); only the count is new.
FAULT_LABELS = {
    "name_size": "size in name unparseable",
    "product_quantity": "product_quantity unparseable",
    "additives_n": "additives_n not an integer",
    "nova_group": "nova_group not an integer",
    # Counted by prepare_rows_jsonl.py only; a Parquet file has no lines to be malformed.
    "malformed_json": "malformed json",
}
FAULT_KINDS = [k for k in FAULT_LABELS if k != "malformed_json"]
FAULT_EXAMPLES = 3
_faults = {}


def warn_fault(kind, value):
    """Count one untrusted value that would not parse; keep the first few as examples."""
    count, examples = _faults.get(kind, (0, []))
    if len(examples) < FAULT_EXAMPLES:
        examples = examples + [repr(value)[:80]]
    _faults[kind] = (count + 1, examples)


def reset_faults():
    _faults.clear()


def fault_count(kind):
    return _faults.get(kind, (0, []))[0]


def fault_lines(kinds=None):
    """The end-summary lines: every kind with its count, and examples when there are any."""
    out = []
    for kind in kinds or list(FAULT_KINDS):
        label = FAULT_LABELS[kind]
        count, examples = _faults.get(kind, (0, []))
        line = f"{label:<28} {count}"
        if examples:
            line += "  e.g. " + ", ".join(examples)
        out.append(line)
    return out


# A size read out of a product name, e.g. "Cheerios Original 340 g".
#
# Worth the risk it carries because the alternative is worse: only 19% of the
# Canadian rows carry a quantity field at all, and without a size there is no
# unit price (decision 37) and no comparable alternative (decision 38), which is
# two features silently unavailable on four products in five.
#
# The risk is a number in a name that is not a size: "Cereal 12 Grain",
# "Product 2%". It is contained by requiring the unit to be a real unit from the
# table above and by requiring the number to touch it, so "12 Grain" cannot match
# and "2%" has no unit at all.
NAME_SIZE = re.compile(
    r"(?<![\w.])(\d+(?:[.,]\d+)?)\s?"
    r"(kg|g|gr|mg|ml|mL|cl|dl|l|L|oz|lb|lbs|litre|litres|liter|liters)"
    r"(?![\w])"
)


def size_from_name(name):
    """Last-resort size, read off the product name. Returns (value, unit) or (None, None)."""
    if not name:
        return None, None
    m = NAME_SIZE.search(str(name))
    if not m:
        return None, None
    try:
        v = float(m.group(1).replace(",", "."))
    except ValueError:
        warn_fault("name_size", m.group(1))
        return None, None
    base_unit = UNIT_TO_BASE.get(m.group(2).lower())
    if not base_unit or v <= 0:
        return None, None
    base, mult = base_unit
    value = round(v * mult, 4)
    # A name-derived size above 50 kg or 50 L is a model number or a lot count
    # wearing a unit, not a package. Rejecting it costs one real bulk product and
    # avoids a per-100g price that is wrong by three orders of magnitude.
    if value > 50000:
        return None, None
    return value, base


def parse_size(quantity, product_quantity, product_quantity_unit):
    """Returns (value_in_base_unit, base_unit) or (None, None) when unknowable."""
    # OFF's own normalised number first. It is the same field the site uses to
    # show unit prices, so disagreeing with it here would put two different
    # sizes on one product across two surfaces.
    if product_quantity:
        try:
            v = float(str(product_quantity).replace(",", "."))
            if v > 0:
                unit = (product_quantity_unit or "g").strip().lower()
                base, mult = UNIT_TO_BASE.get(unit, ("g", 1.0))
                return round(v * mult, 4), base
        except (TypeError, ValueError):
            # Falls through to the free-text quantity below, as it always did; the
            # bad value is counted so a rising number shows the export changed shape.
            warn_fault("product_quantity", product_quantity)

    if not quantity:
        return None, None
    q = str(quantity).strip().lower()

    m = MULTIPACK.search(q)
    if m:
        count = float(m.group(1).replace(",", "."))
        each = float(m.group(2).replace(",", "."))
        base_unit = UNIT_TO_BASE.get(m.group(3))
        if base_unit and count > 0 and each > 0:
            base, mult = base_unit
            return round(count * each * mult, 4), base

    m = SINGLE.search(q)
    if m:
        v = float(m.group(1).replace(",", "."))
        base_unit = UNIT_TO_BASE.get(m.group(2))
        if base_unit and v > 0:
            base, mult = base_unit
            return round(v * mult, 4), base

    return None, None


def name_by_lang(entries):
    """OFF stores names as a list of {lang, text}. Returns (en, fr, fallback)."""
    en = fr = fallback = None
    if not entries:
        return None, None, None
    for e in entries:
        lang = (e.get("lang") or "").lower()
        text = (e.get("text") or "").strip()
        if not text:
            continue
        if lang == "en" and not en:
            en = text
        elif lang == "fr" and not fr:
            fr = text
        elif lang in ("main", "xx") and not fallback:
            fallback = text
        elif not fallback:
            fallback = text
    return en, fr, fallback


def first_image(images):
    """The front image if OFF has one. Anything else is not what a shopper saw."""
    if not images:
        return None
    for key in ("front_en", "front_fr", "front"):
        entry = images.get(key) if isinstance(images, dict) else None
        if entry:
            return entry
    return None


def main() -> int:
    con = duckdb.connect()
    cur = con.execute(f"SELECT * FROM read_parquet('{IN}')")
    columns = [d[0] for d in cur.description]

    total = 0
    written = 0
    skipped_no_name = 0
    with_size = 0
    with open(OUT, "w", encoding="utf-8") as fh:
        # Streamed in chunks rather than materialised: the Canadian slice fits in
        # memory today and the same script has to survive being pointed at the
        # whole four-million-row file the day another country is added.
        while True:
            chunk = cur.fetchmany(5000)
            if not chunk:
                break
            batch = [dict(zip(columns, row)) for row in chunk]
            total += len(batch)
            written, skipped_no_name, with_size = write_batch(
                fh, batch, written, skipped_no_name, with_size
            )

    print(f"rows in parquet      {total}")
    print(f"written              {written}")
    print(f"skipped, no name     {skipped_no_name}")
    print(f"with a parsed size   {with_size}  ({100 * with_size / max(written, 1):.1f}%)")
    for line in fault_lines():
        print(line)
    return 0 if written > 0 else 1


# Open Food Facts prints 'unknown' and 'not-applicable' in the same column
# a real grade lives in, and neither is a grade: 'unknown' means nobody has
# graded it yet and 'not-applicable' means the product cannot be graded at
# all (an unprepared ingredient, for instance). Item 25 asks for the Nutri-
# Score, not for a string that happens to sit in that column, so both collapse
# to the same absence a true NULL already gets.
VALID_NUTRISCORE = {"a", "b", "c", "d", "e"}


def clean_grade(v):
    s = (v or "").strip().lower()
    return s if s in VALID_NUTRISCORE else None


def clean_int(v, field="additives_n"):
    """additives_n and nova_group arrive as floats from Parquet; 0 is real, keep it."""
    if v is None:
        return None
    try:
        return int(v)
    except (TypeError, ValueError, OverflowError):
        # NaN and inf land here too: not an integer, not a crash, and counted.
        warn_fault(field, v)
        return None


def write_batch(fh, rows, written, skipped_no_name, with_size):
        for r in rows:
            code = (r.get("code") or "").strip()
            if not code:
                continue

            en, fr, fallback = name_by_lang(r.get("product_name"))
            display = en or fr or fallback
            if not display:
                # A row with no name in any language cannot be shown to anyone
                # and cannot be matched. Counted, not silently dropped.
                skipped_no_name += 1
                continue

            size_value, size_unit = parse_size(
                r.get("quantity"), r.get("product_quantity"), r.get("product_quantity_unit")
            )
            size_source = "quantity" if size_value else None
            if not size_value:
                size_value, size_unit = size_from_name(display)
                if size_value:
                    size_source = "name"
            if size_value:
                with_size += 1

            cats = list(r.get("categories_tags") or [])
            countries = list(r.get("countries_tags") or [])

            # generic_name and ingredients_text are the same {lang, text} list
            # shape as product_name (verified against a live sample of
            # canada.parquet, not assumed from the column name), so the same
            # language cascade applies: English first, French second, whatever
            # the contributor marked as the product's own language last.
            generic_en, generic_fr, generic_fallback = name_by_lang(r.get("generic_name"))
            generic_name = generic_en or generic_fr or generic_fallback
            ing_en, ing_fr, ing_fallback = name_by_lang(r.get("ingredients_text"))
            ingredients_text = ing_en or ing_fr or ing_fallback

            fh.write(json.dumps({
                "code": code,
                "name": display,
                "name_en": en,
                "name_fr": fr,
                "brands": (r.get("brands") or None),
                "quantity": (r.get("quantity") or None),
                "size_value": size_value,
                "size_unit": size_unit,
                # Where the size came from, because a size read off a name is
                # weaker evidence than one the packaging declared, and decision
                # 19 makes size part of identity. A verdict that turned on a
                # guessed size should be able to say so.
                "size_source": size_source,
                "category_path": cats,
                "leaf_category": cats[-1] if cats else None,
                "allergens": list(r.get("allergens_tags") or []),
                "image_url": None,
                "sold_in_canada": 1 if "en:canada" in countries else 0,
                "source": "openfoodfacts",
                # Item 25's five quality fields.
                "generic_name": generic_name,
                "nutriscore_grade": clean_grade(r.get("nutriscore_grade")),
                "nova_group": clean_int(r.get("nova_group"), "nova_group"),
                "additives_n": clean_int(r.get("additives_n")),
                "ingredients_text": ingredients_text,
            }, ensure_ascii=False) + "\n")
            written += 1

        return written, skipped_no_name, with_size


if __name__ == "__main__":
    raise SystemExit(main())
