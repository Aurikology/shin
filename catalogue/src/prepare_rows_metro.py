"""
Unit 4 of the 2026-09-26 catalogue build plan: turn Metro's four sitemap dumps
(`fetch_metro.py`) into PreparedRow JSONL for `load.ts`.

What a Metro product address is:

    https://www.metro.ca/en/online-grocery/aisles/<aisle>/.../<slug>/p/<barcode>
    https://www.metro.ca/epicerie-en-ligne/allees/<rayon>/.../<slug>/p/<barcode>

The trailing number is the barcode (proven live: 58.7% match a product we
already hold). Everything between "aisles"/"allees" and the slug is the aisle
path, most general first. The slug itself is a product name, English on the
`/en/` addresses and French on the others.

Category matching, and why it stops where it stops: the catalogue's categories
are Open Food Facts taxonomy tags (`en:chips`, `fr:craquelin`, ...), and Metro's
aisle words are not that taxonomy -- they are retailer aisle names that happen
to overlap it in places. Building a translation table from one to the other is
exactly the thing the plan's falsifier exists to justify or refuse. So this
file does the smallest defensible thing instead: for each aisle level, from
most specific to most general, ask "is `<lang>:<that-exact-segment>` already a
tag this catalogue uses anywhere?" and take the first yes. No stemming, no
plurals, no synonyms -- an exact hit against a tag the catalogue already
believes in, or nothing. That keeps every assigned category falsifiable against
the rows that already had one, which is the whole point of measuring the
falsifier before loading anything.

A barcode is only ever assigned a category through this exact-tag walk. A
barcode with no match at any aisle level gets no category from this run, full
stop -- for a NEW barcode that means it is not inserted at all (an uncategorised
new row would only add to the no-leaf-category count this unit is supposed to
shrink), and for an EXISTING barcode it is simply left alone.
"""

import json
import re
import sqlite3
import sys
from pathlib import Path
from urllib.parse import urlparse

IN_DIR = Path(sys.argv[1] if len(sys.argv) > 1 else "data/metro")
DB_PATH = sys.argv[2] if len(sys.argv) > 2 else "data/catalogue.db"
OUT_PATH = sys.argv[3] if len(sys.argv) > 3 else "data/rows-metro.jsonl"
STATS_PATH = sys.argv[4] if len(sys.argv) > 4 else "data/metro-stats.json"

LOC_RE = re.compile(r"<loc>([^<]+)</loc>")
PRODUCT_RE = re.compile(r"/p/(\d+)$")


def canonical_barcode(raw: str) -> str | None:
    """13-digit form: a 12-digit UPC-A gets one leading zero, 8-digit stays 8.
    Anything else (Metro's internal 4-6 digit stock numbers) is not a barcode."""
    n = len(raw)
    if n == 12:
        return "0" + raw
    if n == 13:
        return raw
    if n == 8:
        return raw
    return None


def parse_address(url: str):
    """Returns (lang, aisle_segments, slug, barcode) or None if this address
    is not a product page (Metro's sitemaps also carry static pages)."""
    m = PRODUCT_RE.search(url)
    if not m:
        return None
    barcode = canonical_barcode(m.group(1))
    if barcode is None:
        return None
    path = urlparse(url).path.strip("/").split("/")
    # en:  en / online-grocery / aisles / <...aisle...> / <slug> / p / <barcode>
    # fr:  epicerie-en-ligne / allees / <...rayon...> / <slug> / p / <barcode>
    if path[:3] == ["en", "online-grocery", "aisles"]:
        lang = "en"
        middle = path[3:-2]  # drop the fixed prefix and the trailing "p/<barcode>"
    elif path[:2] == ["epicerie-en-ligne", "allees"]:
        lang = "fr"
        middle = path[2:-2]
    else:
        return None
    if len(middle) < 2:
        return None  # need at least one aisle segment plus the slug
    *aisle_segments, slug = middle
    return lang, aisle_segments, slug, barcode


def slug_to_name(slug: str) -> str:
    words = slug.replace("_", "-").split("-")
    return " ".join(w.capitalize() if w.isalpha() else w for w in words)


def match_category(lang: str, aisle_segments: list[str], tags: set[str]) -> str | None:
    """Only the leaf (most specific, last) aisle segment counts as a category
    candidate. Falling back to a broader ancestor segment when the leaf does
    not match would compare a coarse aisle level against a specific existing
    leaf_category and manufacture disagreement that has nothing to do with
    whether aisle tracks category -- checked live: doing that walk-up first
    produced 98% disagreement on the falsifier, and leaf-only is the fair
    test of the plan's actual claim ("aisle IS category")."""
    if not aisle_segments:
        return None
    candidate = f"{lang}:{aisle_segments[-1]}"
    return candidate if candidate in tags else None


def load_tags(db: sqlite3.Connection) -> set[str]:
    return {row[0] for row in db.execute("SELECT DISTINCT tag FROM product_category")}


def load_existing(db: sqlite3.Connection) -> dict[str, sqlite3.Row]:
    db.row_factory = sqlite3.Row
    cols = [
        "code", "name", "name_en", "name_fr", "brands", "quantity", "size_value",
        "size_unit", "category_path", "leaf_category", "allergens", "image_url",
        "sold_in_canada", "source", "generic_name", "nutriscore_grade", "nova_group",
        "additives_n", "ingredients_text",
    ]
    rows = db.execute(f"SELECT {', '.join(cols)} FROM product").fetchall()
    return {r["code"]: r for r in rows}


def main() -> int:
    db = sqlite3.connect(DB_PATH)
    tags = load_tags(db)
    existing = load_existing(db)
    print(f"tags known to the catalogue: {len(tags)}", flush=True)
    print(f"existing products: {len(existing)}", flush=True)

    # barcode -> best (lang, aisle_segments, slug) seen, preferring the first
    # sighting that yields a category match, else the first sighting at all.
    seen: dict[str, tuple[str, list[str], str]] = {}
    matched_tag: dict[str, str] = {}
    total_addresses = 0
    skipped_bad_length = 0

    for xml_file in sorted(IN_DIR.glob("*.xml")):
        text = xml_file.read_text(encoding="utf-8")
        for loc in LOC_RE.findall(text):
            parsed = parse_address(loc)
            if parsed is None:
                if PRODUCT_RE.search(loc):
                    skipped_bad_length += 1
                continue
            lang, aisle_segments, slug, barcode = parsed
            total_addresses += 1
            if barcode not in seen:
                seen[barcode] = (lang, aisle_segments, slug)
            if barcode not in matched_tag:
                tag = match_category(lang, aisle_segments, tags)
                if tag:
                    matched_tag[barcode] = tag
                    seen[barcode] = (lang, aisle_segments, slug)

    unique_barcodes = len(seen)
    with_category = len(matched_tag)
    print(f"product addresses seen (12/13/8-digit barcode): {total_addresses}", flush=True)
    print(f"skipped, not a 12/13/8-digit barcode: {skipped_bad_length}", flush=True)
    print(f"unique barcodes: {unique_barcodes}", flush=True)
    print(f"unique barcodes with a matched category: {with_category}", flush=True)

    # Falsifier: among barcodes we ALREADY hold with a category, and where our
    # aisle walk also produced a category, how often do they disagree.
    falsifier_total = 0
    falsifier_disagree = 0

    new_rows = 0
    existing_filled = 0
    out_lines = []

    for barcode, tag in matched_tag.items():
        lang, aisle_segments, slug = seen[barcode]
        row = existing.get(barcode)
        if row is None:
            name = slug_to_name(slug)
            prepared = {
                "code": barcode,
                "name": name,
                "name_en": name if lang == "en" else None,
                "name_fr": name if lang == "fr" else None,
                "brands": None,
                "quantity": None,
                "size_value": None,
                "size_unit": None,
                "category_path": [tag],
                "leaf_category": tag,
                "allergens": [],
                "image_url": None,
                "sold_in_canada": 1,
                "source": "metro",
            }
            out_lines.append(json.dumps(prepared))
            new_rows += 1
        else:
            existing_leaf = row["leaf_category"]
            if existing_leaf:
                falsifier_total += 1
                if existing_leaf != tag:
                    falsifier_disagree += 1
                continue  # already categorised: contribute nothing, rule 1
            # No category on file: contribute ONLY category_path/leaf_category,
            # every other field copied through unchanged (source stays whatever
            # it was -- never rewritten to "metro" for a row we did not create).
            prepared = {
                "code": row["code"],
                "name": row["name"],
                "name_en": row["name_en"],
                "name_fr": row["name_fr"],
                "brands": row["brands"],
                "quantity": row["quantity"],
                "size_value": row["size_value"],
                "size_unit": row["size_unit"],
                "category_path": [tag],
                "leaf_category": tag,
                "allergens": json.loads(row["allergens"]) if row["allergens"] else [],
                "image_url": row["image_url"],
                "sold_in_canada": row["sold_in_canada"],
                "source": row["source"],
                "generic_name": row["generic_name"],
                "nutriscore_grade": row["nutriscore_grade"],
                "nova_group": row["nova_group"],
                "additives_n": row["additives_n"],
                "ingredients_text": row["ingredients_text"],
            }
            out_lines.append(json.dumps(prepared))
            existing_filled += 1

    Path(OUT_PATH).write_text("\n".join(out_lines) + ("\n" if out_lines else ""), encoding="utf-8")

    falsifier_pct = (falsifier_disagree / falsifier_total * 100) if falsifier_total else 0.0

    stats = {
        "total_addresses": total_addresses,
        "skipped_bad_length": skipped_bad_length,
        "unique_barcodes": unique_barcodes,
        "unique_barcodes_with_category": with_category,
        "new_rows": new_rows,
        "existing_rows_filled": existing_filled,
        "falsifier_total_compared": falsifier_total,
        "falsifier_disagree": falsifier_disagree,
        "falsifier_disagree_pct": round(falsifier_pct, 2),
    }
    Path(STATS_PATH).write_text(json.dumps(stats, indent=2), encoding="utf-8")

    print(json.dumps(stats, indent=2))
    print(f"wrote {len(out_lines)} rows to {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
