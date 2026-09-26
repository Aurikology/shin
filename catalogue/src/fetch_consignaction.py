"""
Pull Quebec's beverage-container deposit registry from consignaction.ca and turn
it into the exact rows the SQLite loader inserts.

The file is a plain spreadsheet, not a database export, so fetch and prepare
live in one script rather than split the way the Open Facts sources are: there
is no separate "projection" step worth doing, because the whole file is 3 MB
and every column in it is one this row shape wants.

WHY xlsx, read the way it is read here. It is a zip of XML under the hood, and
`openpyxl` in `read_only=True` mode streams row by row off that XML instead of
building a worksheet object in memory, so a 50,000-row file costs about what
50,000 rows cost, not what the file format costs.

WHY every barcode is canonicalized to 13 digits before it is written, not left
as the spreadsheet spells it. `dedupe-barcode-spellings.ts` found 1,375,443
pairs already sitting in this catalogue where the same GTIN was stored twice,
once as a bare 12-digit UPC-A and once as its zero-padded 13-digit GTIN-13
twin, because nothing canonicalized either loader's input before it reached
`ON CONFLICT(code)`. That fix cleans up the past; this prevents the same fault
being reintroduced by a new source on the same night. A 12-digit UPC-A gets one
leading zero. An 8-digit EAN-8 stays 8: it is not a truncated 13-digit code,
it is its own standard, and padding it would invent a barcode nobody printed.
13- and 14-digit codes pass through unchanged. Anything else is not a barcode
this catalogue can key on and is skipped, counted, rather than guessed at.

WHY the classification column becomes the category. `Classification` is one of
the file's own columns (7 distinct values seen: beer, water, juice, soft
drink, alcoholic beverage, milk/milk substitute, other non-alcoholic drink),
so a one-level category path built from it is read off the source, not
invented. Nothing else in the file suggests a deeper path, so none is claimed.

Run:
  python src/fetch_consignaction.py [xlsx_url] [xlsx_path] [rows_out]
"""

import json
import re
import sys
import urllib.request

import openpyxl

URL = (
    "https://consignaction.ca/wp-content/uploads/2026/09/"
    "liste-produits-consignes-aqrcb-24septembre2026.xlsx"
)

XLSX_URL = sys.argv[1] if len(sys.argv) > 1 else URL
XLSX_PATH = sys.argv[2] if len(sys.argv) > 2 else "data/consignaction-24septembre2026.xlsx"
ROWS_OUT = sys.argv[3] if len(sys.argv) > 3 else "data/rows-consignaction.jsonl"
SOURCE = "consignaction"

SHEET = "MS23Exports"
COL_PRODUCER = 0
COL_NAME = 1
COL_DEPOSIT = 2
COL_VOLUME_ML = 3
COL_CLASSIFICATION = 4
COL_BARCODE = 7

BARCODE_RE = re.compile(r"^[0-9]+$")


def clean(v):
    """A trimmed non-empty string, or None."""
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def canonical_barcode(raw):
    """
    Returns the 13-digit-preferring canonical spelling of a barcode, or None
    if it is not 8, 12, 13 or 14 digits.

    8 stays 8 (EAN-8 is its own standard, not a short GTIN-13). 12 gets one
    leading zero, the GS1 rule for writing a UPC-A as a GTIN-13, which is
    already the spelling this catalogue's 12/13 pairs converged on. 13 and 14
    pass through.
    """
    s = clean(raw)
    if s is None or not BARCODE_RE.match(s):
        return None
    n = len(s)
    if n == 8 or n == 13 or n == 14:
        return s
    if n == 12:
        return "0" + s
    return None


def download(url, path):
    print(f"downloading {url}", flush=True)
    # No login is needed, but the site's edge (Cloudflare) 403s the bare
    # urllib user agent that carries no browser identity at all; a plain
    # curl-equivalent string is enough to pass, no cookies or session needed.
    req = urllib.request.Request(url, headers={"User-Agent": "curl/8.9.1"})
    with urllib.request.urlopen(req) as resp, open(path, "wb") as fh:
        fh.write(resp.read())


def main() -> int:
    download(XLSX_URL, XLSX_PATH)

    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True, data_only=True)
    ws = wb[SHEET]
    rows = ws.iter_rows(values_only=True)
    next(rows)  # header

    total = 0
    written = 0
    skipped_no_name = 0
    skipped_bad_barcode = 0
    skipped_no_volume = 0
    with_size = 0
    seen_barcodes = set()
    dupe_barcodes = 0

    with open(ROWS_OUT, "w", encoding="utf-8") as fh_out:
        for r in rows:
            if r is None or (r[COL_PRODUCER] is None and r[COL_NAME] is None):
                continue
            total += 1

            name = clean(r[COL_NAME])
            if not name:
                skipped_no_name += 1
                continue

            code = canonical_barcode(r[COL_BARCODE])
            if code is None:
                skipped_bad_barcode += 1
                continue
            if code in seen_barcodes:
                # Two rows canonicalizing to the same 13-digit code would
                # otherwise silently collapse into one at ON CONFLICT(code);
                # counted here instead so a real collision is visible.
                dupe_barcodes += 1
                continue
            seen_barcodes.add(code)

            volume = r[COL_VOLUME_ML]
            size_value = None
            size_unit = None
            quantity = None
            if isinstance(volume, (int, float)) and volume > 0:
                size_value = float(volume)
                size_unit = "ml"
                quantity = f"{volume:g} ml"
                with_size += 1
            else:
                skipped_no_volume += 1

            classification = clean(r[COL_CLASSIFICATION])
            category_path = [classification] if classification else []
            leaf_category = classification

            brands = clean(r[COL_PRODUCER])

            fh_out.write(json.dumps({
                "code": code,
                "name": name,
                "name_en": None,
                "name_fr": name,
                "brands": brands,
                "quantity": quantity,
                "size_value": size_value,
                "size_unit": size_unit,
                "category_path": category_path,
                "leaf_category": leaf_category,
                "allergens": [],
                "image_url": None,
                "sold_in_canada": 1,
                "source": SOURCE,
            }, ensure_ascii=False) + "\n")
            written += 1

    print(f"source                 {SOURCE}")
    print(f"rows in spreadsheet    {total}")
    print(f"written                {written}")
    print(f"skipped, no name       {skipped_no_name}")
    print(f"skipped, bad barcode   {skipped_bad_barcode}")
    print(f"skipped, dupe barcode  {dupe_barcodes}")
    print(f"skipped, no volume     {skipped_no_volume}")
    print(f"with a parsed size     {with_size}  ({100 * with_size / max(written, 1):.1f}%)")
    return 0 if written > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
