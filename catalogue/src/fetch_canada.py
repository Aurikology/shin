"""
Pull the Canadian slice of the Open Food Facts product database.

Why this reads the Parquet and not the CSV export, which is six times smaller:
the CSV collapses every language into one `product_name` column. Decision 20
says a French query must reach an English row and the other way round, and the
only way to index both is to have both. The Parquet keeps `product_name` as a
list of {lang, text}, and carries `allergens_tags` and `product_quantity_unit`
that the CSV drops. Decisions 20, 37 and 40 all need columns the CSV has not got.

Why it reads the file over HTTP instead of downloading it: DuckDB pushes the
projection and the filter into the Parquet reader and fetches only the row groups
and column chunks it needs, so the Canadian slice costs a fraction of the 7.8 GB
the whole file weighs.

This loader DOES filter non-Canadian products out at load time (the WHERE clause
below keeps only rows tagged en:canada), which breaks decision 28's rule that
country is a column, not a load filter. That breach is known and parked
(RULINGS.md, "Catalogue scope"; docs/decisions.md 2026-09-26). `sold_in_canada`
is still written as a column, so dropping the WHERE clause is the whole change.
"""

import sys
import time
import duckdb

REMOTE = (
    "https://huggingface.co/datasets/openfoodfacts/product-database"
    "/resolve/main/food.parquet"
)

OUT = sys.argv[1] if len(sys.argv) > 1 else "data/canada.parquet"

# Reading the file over HTTP is the tidy version and it is not the one that
# works: HuggingFace answers thousands of small range requests with 429, and the
# one connection that survives the rate limiter reads slower than downloading the
# whole file. A local copy is used when it exists; the URL is the fallback.
SOURCE = sys.argv[2] if len(sys.argv) > 2 else REMOTE

# Kept deliberately narrow. Every column here is read by the loader; anything
# else is 7.8 GB of bandwidth for a field nothing consumes.
#
# Item 25 added the last five: nutriscore_grade, nova_group, additives_n and
# ingredients_text are the quality fields the product answer now carries;
# generic_name was already read here but never carried past this file until
# prepare_rows.py was updated in the same change to write it out.
QUERY = f"""
COPY (
  SELECT
    code,
    product_name,
    generic_name,
    brands,
    quantity,
    product_quantity,
    product_quantity_unit,
    categories_tags,
    allergens_tags,
    countries_tags,
    images,
    lang,
    nutriscore_grade,
    nova_group,
    additives_n,
    ingredients_text
  FROM read_parquet('{SOURCE}')
  WHERE list_contains(countries_tags, 'en:canada')
) TO '{OUT}' (FORMAT PARQUET, COMPRESSION ZSTD)
"""


def main() -> int:
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    # The default is small and this file's row groups are large; a bigger read
    # ahead is the difference between minutes and an hour on a remote Parquet.
    con.execute("SET http_keep_alive=true;")
    con.execute("SET enable_progress_bar=false;")

    started = time.time()
    print(f"reading {SOURCE}", flush=True)
    con.execute(QUERY)
    rows = con.execute(f"SELECT count(*) FROM read_parquet('{OUT}')").fetchone()[0]
    print(f"wrote {rows} Canadian products to {OUT} in {time.time() - started:.0f}s")
    return 0 if rows > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
