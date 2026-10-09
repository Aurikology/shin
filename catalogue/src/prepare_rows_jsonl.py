"""
Turn a sibling Open Facts JSONL export into the exact rows the SQLite loader inserts.

The Parquet path (`prepare_rows.py`) and this one produce the same row shape and
have to keep producing the same row shape, so every judgement that is not about
the file format is imported from there rather than copied. Unit conversion and
size parsing in particular: a fix to the ounce constant has to reach both paths
or the catalogue holds two different sizes for the same kind of product, and
unit price is the number the whole verdict turns on.

What is genuinely different here is the name shape, and it is the reason this
file exists at all:

  Parquet   product_name is a list of {lang, text}, all languages in one column.
  JSONL     product_name is one string in the product's own language, plus
            product_name_en and product_name_fr as separate keys that exist only
            when a contributor filled them in.

Reading the JSONL the Parquet way returns nothing, silently, for every row. So
the language split is rewritten here and `lang` is used to decide which language
the bare `product_name` is actually in, rather than assuming English.

Country is carried, never filtered (decision 28). These files are small enough
that the whole world fits, so a Canadian filter here would be a product decision
disguised as a performance one.
"""

import gzip
import json
import sys

# Every judgement that is not about the file format lives in one place.
from prepare_rows import FAULT_KINDS, fault_lines, parse_size, size_from_name, warn_fault

IN = sys.argv[1] if len(sys.argv) > 1 else "data/openbeautyfacts.jsonl.gz"
OUT = sys.argv[2] if len(sys.argv) > 2 else "data/rows-obf.jsonl"
# Which database a row came from. Stored on every row so a bad source can be
# withdrawn later without reloading the good ones.
SOURCE = sys.argv[3] if len(sys.argv) > 3 else "openbeautyfacts"


def clean(v):
    """A trimmed non-empty string, or None. OFF exports use '' for absent."""
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def names_from_jsonl(r):
    """Returns (en, fr, fallback) from the JSONL key shape."""
    en = clean(r.get("product_name_en"))
    fr = clean(r.get("product_name_fr"))
    generic = clean(r.get("product_name"))

    # The bare product_name is in the product's own language. Treating it as
    # English is how a French-only row ends up indexed as an English name and
    # then fails to match either query (decision 20 fails in both directions).
    lang = (r.get("lang") or "").lower()
    if generic:
        if lang == "en" and not en:
            en = generic
        elif lang == "fr" and not fr:
            fr = generic

    return en, fr, generic


def main() -> int:
    total = 0
    written = 0
    skipped_no_code = 0
    skipped_no_name = 0
    with_size = 0
    canada = 0

    opener = gzip.open if IN.endswith(".gz") else open
    with opener(IN, "rt", encoding="utf-8", errors="replace") as fh_in, \
            open(OUT, "w", encoding="utf-8") as fh_out:
        for line in fh_in:
            line = line.strip()
            if not line:
                continue
            total += 1
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                # Its own counter, with the first few bad lines shown: a line that
                # will not parse used to hide inside "skipped, no code", and a rising
                # number here means the export changed shape.
                warn_fault("malformed_json", line)
                continue

            code = clean(r.get("code"))
            if not code:
                skipped_no_code += 1
                continue

            en, fr, fallback = names_from_jsonl(r)
            display = en or fr or fallback
            if not display:
                skipped_no_name += 1
                continue

            size_value, size_unit = parse_size(
                r.get("quantity"),
                r.get("product_quantity"),
                r.get("product_quantity_unit"),
            )
            size_source = "quantity" if size_value else None
            if not size_value:
                size_value, size_unit = size_from_name(display)
                if size_value:
                    size_source = "name"
            if size_value:
                with_size += 1

            cats = [c for c in (r.get("categories_tags") or []) if c]
            countries = [c for c in (r.get("countries_tags") or []) if c]
            in_canada = 1 if "en:canada" in countries else 0
            canada += in_canada

            fh_out.write(json.dumps({
                "code": code,
                "name": display,
                "name_en": en,
                "name_fr": fr,
                "brands": clean(r.get("brands")),
                "quantity": clean(r.get("quantity")),
                "size_value": size_value,
                "size_unit": size_unit,
                "size_source": size_source,
                "category_path": cats,
                "leaf_category": cats[-1] if cats else None,
                "allergens": [a for a in (r.get("allergens_tags") or []) if a],
                "image_url": None,
                "sold_in_canada": in_canada,
                "source": SOURCE,
            }, ensure_ascii=False) + "\n")
            written += 1

    print(f"source               {SOURCE}")
    print(f"lines in export      {total}")
    print(f"written              {written}")
    print(f"skipped, no code     {skipped_no_code}")
    print(f"skipped, no name     {skipped_no_name}")
    print(f"with a parsed size   {with_size}  ({100 * with_size / max(written, 1):.1f}%)")
    print(f"sold in Canada       {canada}  ({100 * canada / max(written, 1):.1f}%)")
    for line in fault_lines(FAULT_KINDS + ["malformed_json"]):
        print(line)
    return 0 if written > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
