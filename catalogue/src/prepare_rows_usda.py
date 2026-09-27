"""
Turn USDA FoodData Central's Branded Foods CSV release into the exact rows the
SQLite loader inserts. Measured before this file was written:
`docs/usda-branded-foods-measured-2026-09-26.md` counted 1,993,975 rows,
1,948,474 with a usable-length barcode, 432,132 distinct after canonicalisation,
429,871 of those new to us. Re-measuring any of that here would be redoing work
someone already did; this file's only job is the prepare step that measurement
recommended.

`branded_food.csv` and `food.csv` are joined 1:1 on `fdc_id` (both files hold
exactly 1,993,975 rows, both keyed uniquely on `fdc_id`, checked before writing
this rather than assumed). `branded_food.csv` carries the barcode, brand, size
and ingredient fields; `food.csv` carries the only name field this release has,
`description`.

Five judgements are made here, each one argued in place rather than imported,
because none of the existing `prepare_rows*.py` files have faced a US federal
nutrition database before:

  sold_in_canada is hardcoded 0 for every row of this source. See the comment
  on SOLD_IN_CANADA below; do not change this without a Canadian source saying
  a specific product is sold here.

  The barcode is canonicalised by hand because Python cannot import
  `catalogue/src/barcode.ts`. See canonical_code() below, which mirrors that
  file's `canonicalCode` rule exactly and cites it.

  Size comes from `package_weight` only, never from `serving_size`. See
  parse_package_weight() below for why mixing them would silently corrupt the
  unit-price math on most rows, not just some of them.

  `branded_food_category` is a flat string with no hierarchy USDA declares, so
  it becomes a one-element category_path rather than a guessed tree. See
  the comment on CATEGORY handling in write_batch().

  Nutri-Score, NOVA and additive counts are not fields FDC publishes at all
  (checked against "Download API Field Descriptions.xlsx" shipped with this
  release), so they are left NULL rather than computed from anything else in
  this file.
"""

import json
import re
import sys

import duckdb

# Every physical unit constant (grams per ounce, per pound, per litre) comes
# from here rather than being retyped, so a correction to one of them reaches
# every source that has ever needed it. Same pattern as prepare_rows_icecat.py
# importing size_from_name from the same file.
from prepare_rows import UNIT_TO_BASE as OFF_UNITS

BRANDED = (
    sys.argv[1]
    if len(sys.argv) > 1
    else "data/usda_branded_csv/FoodData_Central_branded_food_csv_2025-12-18/branded_food.csv"
)
FOOD = (
    sys.argv[2]
    if len(sys.argv) > 2
    else "data/usda_branded_csv/FoodData_Central_branded_food_csv_2025-12-18/food.csv"
)
OUT = sys.argv[3] if len(sys.argv) > 3 else "data/rows-usda.jsonl"

# ---------------------------------------------------------------------------
# THE BARCODE
#
# Mirrors `canonicalCode` in `catalogue/src/barcode.ts` exactly (read before
# writing this, not assumed from memory): an 8-digit code gains five leading
# zeros to become its 13-digit form, a 12-digit code gains one leading zero, a
# 14-digit code that starts with '0' loses that leading zero, a 13-digit code
# passes through untouched, and a 14-digit code that does NOT start with '0'
# also passes through untouched (that file's own fallthrough, not an omission
# here). This is the rule, not a paraphrase of it; if `barcode.ts` changes,
# this function is now out of sync and has to change with it.
#
# THE ONE DIFFERENCE FROM barcode.ts, AND IT IS DELIBERATE. That file leaves
# an 11-digit or 15-plus-digit or non-numeric code untouched, because a loader
# has to do *something* with a row that is already in the table under that
# spelling. This is not a loader; it is deciding whether a brand-new row is
# worth admitting at all, and a code of a length no scanner has ever produced
# is not a barcode this catalogue can key on. So here, and only here, that
# case is a SKIP, counted under "not a usable barcode length", rather than a
# pass-through that would insert an un-keyable row and call it done.
def canonical_code(raw: str) -> str | None:
    digits = (raw or "").strip()
    if not digits or not digits.isdigit():
        return None
    n = len(digits)
    if n == 8:
        return "00000" + digits
    if n == 12:
        return "0" + digits
    if n == 13:
        return digits
    if n == 14:
        return digits[1:] if digits.startswith("0") else digits
    return None


# ---------------------------------------------------------------------------
# SIZE
#
# `package_weight` is USDA's package-size column: a string like "6 LBR",
# "1 GLL", or a dual-labelled "12 oz/340 g" (imperial first, metric last,
# checked against 2,000,000 sampled values before relying on it). Its units
# are a mix of plain abbreviations (g, ml, oz, lb) and GDSN codes (GRM, MLT,
# ONZ, OZA, LBR, GLL, QUART, PT, ...). `serving_size`/`serving_size_unit` is a
# DIFFERENT and smaller quantity, deliberately never used here: it is present
# on 1,983,220 of 1,993,975 rows (99.5%) against 860,410 (43%) for
# `package_weight`, so falling back to it would look like it raises the
# "with a size" count -- and it would, while making most of those sizes
# wrong. A can of soup's serving_size is "240 ml"; the can itself, priced on
# the shelf, is not 240 ml. Recording the serving as the package size would
# put a unit price on every one of those rows that is off by whatever the
# servings-per-container ratio is, silently, and the plan is explicit that a
# wrong size is worse than a missing one because unit-price comparison is
# built on it. So a row with no parseable `package_weight` gets NULL/NULL
# here, not a borrowed number from a different question.
SEG_RE = re.compile(r"^\s*([\d.]+)\s*([A-Za-z]+)\s*$")

_G = OFF_UNITS["g"]
_KG = OFF_UNITS["kg"]
_MG = OFF_UNITS["mg"]
_OZ = OFF_UNITS["oz"]
_LB = OFF_UNITS["lb"]
_ML = OFF_UNITS["ml"]
_L = OFF_UNITS["l"]
_CL = OFF_UNITS["cl"]
_FLOZ = OFF_UNITS["floz"]

# Every unit token seen in package_weight (collected by sampling the real
# column, not guessed from a spec sheet) mapped to (base_unit, multiplier).
# GLL/QUART/PT are not in OFF_UNITS at all -- groceries don't carry them --
# so their conversion factors are the standard US liquid measures, added here
# rather than in the shared table because no other source needs them.
UNIT_TABLE = {
    "G": _G, "GM": _G, "GR": _G, "GRM": _G, "GRAM": _G, "GRAMS": _G,
    "KG": _KG, "KGM": _KG, "KGS": _KG,
    "MG": _MG,
    "OZ": _OZ, "ONZ": _OZ, "OZA": _OZ, "OZS": _OZ, "OUNCE": _OZ, "OUNCES": _OZ,
    "LB": _LB, "LBR": _LB, "LBS": _LB, "POUND": _LB, "POUNDS": _LB,
    "ML": _ML, "MLT": _ML,
    "L": _L, "LT": _L, "LTR": _L, "LITER": _L, "LITERS": _L, "LITE": _L,
    "LITRE": _L, "LITRES": _L,
    "CL": _CL, "CLT": _CL,
    "GAL": ("ml", 3785.411784), "GLL": ("ml", 3785.411784),
    "QUART": ("ml", 946.352946), "QT": ("ml", 946.352946), "QTL": ("ml", 946.352946),
    "PT": ("ml", 473.176473), "PTN": ("ml", 473.176473),
    "FLOZ": _FLOZ,
}
# Deliberately excluded: EA (a count of items, not a weight or volume -- "6 EA"
# converted through this table would turn "six of something" into a mass),
# TABLET, KT and bare "M", all seen in the real column and all either a count
# or too ambiguous a unit to trust with the price-per-unit math.
METRIC_TOKENS = {
    "G", "GM", "GR", "GRM", "GRAM", "GRAMS", "KG", "KGM", "KGS", "MG",
    "ML", "MLT", "L", "LT", "LTR", "LITER", "LITERS", "LITE", "LITRE", "LITRES",
    "CL", "CLT",
}


def parse_package_weight(raw):
    """Returns (size_value, size_unit) or (None, None).

    `package_weight` sometimes carries one unit ("6 LBR") and sometimes several
    slash-separated equivalents USDA's own data entry supplied ("12 oz/340
    g"). When a metric segment (g/ml family) is present it wins even if it is
    not first, because it is the number the manufacturer or USDA data entry
    declared directly rather than one this function converted; an oz-to-g
    conversion is exact arithmetic but a second-hand number all the same.
    Falling back to the first parseable segment only when no metric segment
    exists at all.
    """
    if not raw:
        return None, None
    best_metric = None
    best_any = None
    for seg in raw.split("/"):
        m = SEG_RE.match(seg.strip())
        if not m:
            continue
        try:
            v = float(m.group(1))
        except ValueError:
            continue
        if v <= 0:
            continue
        unit_token = m.group(2).upper()
        conv = UNIT_TABLE.get(unit_token)
        if not conv:
            continue
        base, mult = conv
        value = round(v * mult, 4)
        # Same cap as prepare_rows.py's size_from_name: a package above 50 kg
        # or 50 L is a data-entry error (a case count or a typo'd decimal
        # point) wearing a unit, not a real shelf package, and admitting it
        # would put a per-100g price three-plus orders of magnitude off.
        if value > 50000:
            continue
        if best_any is None:
            best_any = (value, base)
        if unit_token in METRIC_TOKENS and best_metric is None:
            best_metric = (value, base)
    return best_metric or best_any or (None, None)


def clean(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def main() -> int:
    con = duckdb.connect()

    # Run and fully consume this BEFORE the main query below: DuckDB's Python
    # cursor is the connection itself, so a second con.execute() call while
    # the first query's rows are still being streamed replaces the active
    # result set out from under the first cursor, silently returning zero
    # rows from it rather than raising. Found by a smoke test on a 5,000-row
    # sample returning "written 0" with no error at all.
    total_rows = con.execute(
        f"SELECT count(*) FROM read_csv_auto('{BRANDED}', all_varchar=True)"
    ).fetchone()[0]

    # all_varchar=True keeps gtin_upc's leading zeros intact and keeps fdc_id
    # a plain string for the join key; nothing here needs DuckDB's own type
    # inference and letting it run would only cost a second pass over both
    # files to sniff types this script does not use.
    query = f"""
        WITH src AS (
            SELECT
                b.fdc_id AS fdc_id,
                b.gtin_upc AS gtin_upc,
                b.brand_owner AS brand_owner,
                b.brand_name AS brand_name,
                b.ingredients AS ingredients,
                b.branded_food_category AS branded_food_category,
                b.package_weight AS package_weight,
                b.modified_date AS modified_date,
                f.description AS description
            FROM read_csv_auto('{BRANDED}', all_varchar=True) b
            LEFT JOIN read_csv_auto('{FOOD}', all_varchar=True) f
                ON f.fdc_id = b.fdc_id
        ),
        canon AS (
            SELECT
                *,
                CASE
                    WHEN NOT regexp_matches(trim(gtin_upc), '^[0-9]+$') THEN NULL
                    WHEN length(trim(gtin_upc)) = 8 THEN '00000' || trim(gtin_upc)
                    WHEN length(trim(gtin_upc)) = 12 THEN '0' || trim(gtin_upc)
                    WHEN length(trim(gtin_upc)) = 13 THEN trim(gtin_upc)
                    WHEN length(trim(gtin_upc)) = 14 AND trim(gtin_upc) LIKE '0%'
                        THEN substr(trim(gtin_upc), 2)
                    WHEN length(trim(gtin_upc)) = 14 THEN trim(gtin_upc)
                    ELSE NULL
                END AS canonical_barcode
            FROM src
        ),
        -- ONE ROW PER BARCODE, PICKED BY A FULLY ORDERED RULE. The same GTIN
        -- reappears under many fdc_ids as a listing is revised over the
        -- years (the measurement doc's own finding: 1,948,474 usable-length
        -- rows, 432,132 distinct). The winner is: has a name, then has a
        -- package_weight, then the most recently modified_date, and FINALLY
        -- the highest fdc_id -- added after a hand-check turned up two
        -- fdc_ids for the same Gatorade barcode tied on all three of the
        -- first keys (same description, neither had a package_weight, same
        -- modified_date), which meant the row actually written was decided
        -- by DuckDB's internal, undocumented order for ties rather than any
        -- rule this file states. fdc_id is USDA's own incrementing surrogate
        -- key, so the highest one is the most recently created database
        -- entry, which is at least a real ordering rather than none.
        ranked AS (
            SELECT
                *,
                row_number() OVER (
                    PARTITION BY canonical_barcode
                    ORDER BY
                        (description IS NOT NULL AND trim(description) != '') DESC,
                        (package_weight IS NOT NULL AND trim(package_weight) != '') DESC,
                        modified_date DESC NULLS LAST,
                        TRY_CAST(fdc_id AS BIGINT) DESC
                ) AS rn
            FROM canon
            WHERE canonical_barcode IS NOT NULL
        )
        SELECT
            canonical_barcode, description, brand_owner, brand_name,
            ingredients, branded_food_category, package_weight
        FROM ranked
        WHERE rn = 1
    """
    cur = con.execute(query)
    columns = [d[0] for d in cur.description]

    written = 0
    skipped_no_name = 0
    with_size = 0
    distinct_barcodes = 0

    with open(OUT, "w", encoding="utf-8") as fh:
        while True:
            chunk = cur.fetchmany(5000)
            if not chunk:
                break
            for row in chunk:
                r = dict(zip(columns, row))
                distinct_barcodes += 1
                code = r["canonical_barcode"]

                name = clean(r["description"])
                if not name:
                    # Counted, not guessed at: 1 row measured with a NULL
                    # food.csv match (LEFT JOIN, not assumed to be 1:1 even
                    # though both files hold the same row count).
                    skipped_no_name += 1
                    continue

                brand_name = clean(r["brand_name"])
                brand_owner = clean(r["brand_owner"])
                brands = brand_name or brand_owner

                size_value, size_unit = parse_package_weight(r["package_weight"])
                if size_value:
                    with_size += 1

                ingredients_text = clean(r["ingredients"])
                category = clean(r["branded_food_category"])

                fh.write(json.dumps({
                    "code": code,
                    "name": name,
                    # FDC's Branded Foods release is a US register with no
                    # translated fields; name_en carries the same string OFF
                    # rows carry in name_en, and name_fr stays NULL rather
                    # than a fabricated translation (decision 20's rule
                    # applied to a source that has nothing but English).
                    "name_en": name,
                    "name_fr": None,
                    "brands": brands,
                    # The declared package-size text itself, same role as
                    # OFF's raw "quantity" column: the human-readable string
                    # size_value/size_unit were parsed out of.
                    "quantity": clean(r["package_weight"]),
                    "size_value": size_value,
                    "size_unit": size_unit,
                    # branded_food_category is one flat string ("Oils Edible",
                    # "Herbs/Spices/Extracts", 447 distinct values total, none
                    # of them a path). Turning it into a fake broad-to-specific
                    # tree would invent a hierarchy USDA never declared, so it
                    # becomes the whole category_path, one element long, same
                    # as its own leaf.
                    "category_path": [category] if category else [],
                    "leaf_category": category,
                    # FDC's Branded Foods release carries no allergen tags at
                    # all (checked against the field list this release ships
                    # with); an empty list here means "not in this source",
                    # not "this product has none".
                    "allergens": [],
                    "image_url": None,
                    # THE MOST IMPORTANT LINE IN THIS FILE. This is a US
                    # federal register (`market_country` on almost every row
                    # reads "United States"); it is not a claim that nothing
                    # here reaches Canadian shelves -- a US-packaged product
                    # often IS sold here too, and the catalogue is built to
                    # answer a barcode scan regardless of which country's
                    # database first named the product, so these rows still
                    # earn their place. But `sold_in_canada = 1` is what
                    # selects a row into the phone's Canadian download pack,
                    # and nothing in this file says any specific one of these
                    # 432,132 products crossed the border. Writing 1 here on
                    # an assumption would put roughly 430,000 American
                    # products into the exact download every Canadian
                    # shopper pulls. Promoting any one of these rows to 1
                    # needs a Canadian source naming that product, not this
                    # file guessing on its behalf.
                    "sold_in_canada": 0,
                    "source": "usda",
                    "generic_name": None,
                    # Not fields FDC publishes in this release at all (Nutri-
                    # Score and NOVA are Open Food Facts computations over
                    # ingredient lists FDC does not run), so NULL rather than
                    # a value this file invented.
                    "nutriscore_grade": None,
                    "nova_group": None,
                    "additives_n": None,
                    "ingredients_text": ingredients_text,
                }, ensure_ascii=False) + "\n")
                written += 1

    print(f"rows in branded_food.csv    {total_rows}")
    print(f"distinct canonical barcodes {distinct_barcodes}")
    print(f"written                     {written}")
    print(f"skipped, no name            {skipped_no_name}")
    print(f"with a parsed size          {with_size}  ({100 * with_size / max(written, 1):.1f}%)")
    return 0 if written > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
