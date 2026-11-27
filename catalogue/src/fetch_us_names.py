"""
Build the US names index: barcode -> product name, for Open Food Facts products sold in the
United States that the Canada catalogue does not hold.

WHY. The catalogue is Canada-only (fetch_canada.py keeps only en:canada), so a US-only barcode
used to depend on one live Open Food Facts call, throttled to stay under OFF's published
15 requests a minute per IP. When that call is throttled or fails, the shopper is told "not in
catalogue". RULINGS.md "A scan never ends with no result" (2026-10-10). This file is the offline
answer: the server reads it after a catalogue miss and BEFORE the live call
(app/src/us-names-index.ts), and a hit is treated exactly like a live Open Food Facts name.

It reads the same Parquet as fetch_canada.py, by the same access method (DuckDB over a local
copy of food.parquet, or the HuggingFace URL as fallback; the header of fetch_canada.py says why a
local copy is the one that works). It never touches the Canada catalogue build or its schema; the
catalogue file is only READ, to leave out barcodes it already holds.

OUTPUT. One small SQLite file (names only, no ingredients, no images, no prices):

  us_name(key TEXT PRIMARY KEY, code TEXT, name TEXT, brand TEXT, quantity TEXT, categories TEXT)
  meta(k TEXT PRIMARY KEY, v TEXT)

`key` is the barcode's NUMERIC spelling: the digits with leading zeros removed. That is how the
server looks it up (app/src/us-names-index.ts `indexKey`), so 0075720000814, 075720000814 and
75720000814 are one row, the same rule catalogue/src/barcode.ts uses for 8- and 13-digit codes.
`categories` holds up to three of OFF's categories_tags, most specific first, comma-separated.

BUILD (on the Mac, where the local food.parquet lives):

  python3 catalogue/src/fetch_us_names.py <out.db> <food.parquet> [<catalogue.db>]

  e.g. python3 catalogue/src/fetch_us_names.py catalogue/data/us-names.db \\
         /path/to/food.parquet catalogue/data/catalogue.db

  out.db        default catalogue/data/us-names.db
  food.parquet  default the HuggingFace URL (rate-limited: prefer a local copy)
  catalogue.db  optional; codes it already holds are left out (the server only asks the index
                after a catalogue miss, so they would be dead weight)

The file is a build product and is not committed. The server finds it at SHIN_US_NAMES_INDEX, or
catalogue/data/us-names.db when that is unset.
"""

import os
import pathlib
import sqlite3
import sys
import time

import duckdb

REMOTE = (
    "https://huggingface.co/datasets/openfoodfacts/product-database"
    "/resolve/main/food.parquet"
)

DEFAULT_OUT = "catalogue/data/us-names.db"
BATCH = 50_000
MAX_CATEGORIES = 3


def index_key(code):
    """The numeric spelling of a barcode: digits only, leading zeros removed. None if it is not a code."""
    digits = (code or "").strip()
    if not digits.isdigit() or not (6 <= len(digits) <= 14):
        return None
    key = digits.lstrip("0")
    return key or None


def pick_name(entries):
    """OFF stores names as a list of {lang, text}. English first, then the product's own, then French."""
    en = fr = fallback = None
    for e in entries or []:
        lang = (e.get("lang") or "").lower()
        text = (e.get("text") or "").strip()
        if not text:
            continue
        if lang == "en" and not en:
            en = text
        elif lang == "fr" and not fr:
            fr = text
        elif not fallback:
            fallback = text
    return en or fallback or fr


def first_brand(brands):
    if not brands:
        return None
    first = brands.split(",")[0].strip()
    return first or None


def top_categories(tags):
    """The most specific few of OFF's categories_tags, which run from broad to specific."""
    clean = [t for t in (tags or []) if t]
    return ",".join(reversed(clean[-MAX_CATEGORIES:])) or None


def catalogue_keys(path):
    """Numeric keys of every code the Canada catalogue holds (read-only), or an empty set."""
    if not path:
        return set()
    con = sqlite3.connect(pathlib.Path(path).resolve().as_uri() + "?mode=ro", uri=True)
    try:
        return {index_key(r[0]) for r in con.execute("SELECT code FROM product")}
    finally:
        con.close()


def build(out, source, catalogue=None):
    """Write the index at `out` from `source`. Returns the number of rows written."""
    skip = catalogue_keys(catalogue)
    tmp = out + ".building"
    if os.path.exists(tmp):
        os.remove(tmp)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)

    src = duckdb.connect()
    if source.startswith("http"):
        src.execute("INSTALL httpfs; LOAD httpfs;")
        src.execute("SET http_keep_alive=true;")
    src.execute("SET enable_progress_bar=false;")
    cur = src.execute(
        """
        SELECT code, product_name, brands, quantity, categories_tags
        FROM read_parquet(?)
        WHERE list_contains(countries_tags, 'en:united-states')
          AND NOT list_contains(countries_tags, 'en:canada')
        """,
        [source],
    )

    dst = sqlite3.connect(tmp)
    dst.execute(
        "CREATE TABLE us_name (key TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL,"
        " brand TEXT, quantity TEXT, categories TEXT) WITHOUT ROWID"
    )
    dst.execute("CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)")
    while True:
        batch = cur.fetchmany(BATCH)
        if not batch:
            break
        rows = []
        for code, names, brands, quantity, cats in batch:
            key = index_key(code)
            name = pick_name(names)
            if key is None or key in skip or not name:
                continue
            rows.append((key, code, name, first_brand(brands), (quantity or "").strip() or None, top_categories(cats)))
        dst.executemany("INSERT OR IGNORE INTO us_name VALUES (?,?,?,?,?,?)", rows)
    count = dst.execute("SELECT count(*) FROM us_name").fetchone()[0]
    dst.executemany(
        "INSERT INTO meta VALUES (?,?)",
        [
            ("built_at", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())),
            ("source", source),
            ("rows", str(count)),
        ],
    )
    dst.commit()
    dst.execute("VACUUM")
    dst.close()
    os.replace(tmp, out)
    return count


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    source = sys.argv[2] if len(sys.argv) > 2 else REMOTE
    catalogue = sys.argv[3] if len(sys.argv) > 3 else None
    started = time.time()
    print(f"reading {source}", flush=True)
    rows = build(out, source, catalogue)
    mb = os.path.getsize(out) / 1e6
    print(f"wrote {rows} US names to {out} ({mb:.1f} MB) in {time.time() - started:.0f}s")
    return 0 if rows > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
