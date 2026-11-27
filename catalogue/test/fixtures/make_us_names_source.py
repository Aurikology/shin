"""
Writes us-names-source.parquet, the tiny stand-in for food.parquet that the US names index
builder is tested against (catalogue/test/us-names-builder.test.ts). Same column names and
types as the real file for the six columns the builder reads. Rows are made up for the test,
except that the Poland Spring barcode is the real one for the product named.

  python3 catalogue/test/fixtures/make_us_names_source.py catalogue/test/fixtures/us-names-source.parquet
"""
import sys
import duckdb

OUT = sys.argv[1]
con = duckdb.connect()
con.execute(
    """
    CREATE TABLE t (
      code VARCHAR,
      product_name STRUCT(lang VARCHAR, "text" VARCHAR)[],
      brands VARCHAR,
      quantity VARCHAR,
      categories_tags VARCHAR[],
      countries_tags VARCHAR[]
    )
    """
)
rows = [
    # kept: a US-only water, the popular-product case
    ("0075720000814", [{"lang": "en", "text": "Poland Spring Natural Spring Water"}], "Poland Spring, Nestle", "1 L",
     ["en:beverages", "en:waters", "en:spring-waters", "en:non-sparkling-waters"], ["en:united-states"]),
    # kept: an 8-digit code that is a valid EAN-8 and a valid UPC-E (see app/test/barcode-ean8-retry.test.ts)
    ("06104696", [{"lang": "main", "text": "Fixture Mint Candy"}], "Fixtureco", "50 g", ["en:snacks"], ["en:united-states"]),
    # kept: name only in French, no brand, no quantity
    ("0041000000011", [{"lang": "fr", "text": "Biscuits au chocolat"}], None, None, None, ["en:united-states", "en:mexico"]),
    # left out: also sold in Canada, so the Canada catalogue holds it
    ("0068100084245", [{"lang": "en", "text": "Kraft Dinner Original"}], "Kraft", "225 g", ["en:pastas"], ["en:united-states", "en:canada"]),
    # left out: not sold in the US
    ("3017620422003", [{"lang": "en", "text": "Nutella"}], "Ferrero", "400 g", ["en:spreads"], ["en:france"]),
    # left out: no name in any language
    ("0049000000002", [], "Nobody", "1 L", None, ["en:united-states"]),
    # left out of the build that is given a catalogue holding it: the catalogue already has this one
    ("0049000028911", [{"lang": "en", "text": "Cola Test"}], "Fizzco", "355 ml", ["en:beverages", "en:colas"], ["en:united-states"]),
    # left out: not a barcode
    ("not-a-code", [{"lang": "en", "text": "Junk"}], None, None, None, ["en:united-states"]),
]
for r in rows:
    con.execute("INSERT INTO t VALUES (?,?,?,?,?,?)", list(r))
con.execute(f"COPY t TO '{OUT}' (FORMAT PARQUET)")
print(f"wrote {len(rows)} rows to {OUT}")
