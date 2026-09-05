"""
Turn the Open Icecat index into the rows the SQLite loader inserts.

Written against the file, not against Icecat's manual, and the difference was
not academic. The manual lists `EAN_UPCS` among the fields of a `<file>` entry,
which reads as an attribute and is not one: barcodes are child elements,
`<EAN_UPCS><EAN_UPC Value="..."/></EAN_UPCS>`. A parser built the manual's way
finds no barcodes at all in a file that holds 4,981,204 of them, and nothing
raises. That is the whole reason this step waited for the download.

What the index actually gives, per entry:

  Model_Name    the product name, in whatever language the supplier filed it
  Prod_ID       the manufacturer part number
  Supplier_id   a brand, as a number, resolved through SuppliersList.xml.gz
  Catid         a category, as a number, resolved through CategoriesList.xml.gz
  On_Market     whether it is still sold
  EAN_UPCS      the barcodes, as children
  Country_Markets  the markets it is listed for, as children

Three judgements are made here.

**One row per barcode, not per product.** A product with three barcodes becomes
three rows. The catalogue is keyed by barcode and the product's whole purpose is
that scanning any code on the shelf resolves, so a product reachable by only the
first of its three codes is broken for the other two.

**Off-market products are kept.** Someone scanning a four-year-old monitor still
deserves to be told what it is; the price stage refuses separately when it has no
sellers. Identity and availability are different questions.

**The category path is rebuilt from the parent chain**, broad to specific, and
written in the same `en:slug` shape Open Food Facts uses, so ring widening and
the readable-label rule work on Icecat rows without a second code path.
"""

import gzip
import json
import re
import sys
from xml.etree import ElementTree

from prepare_rows import size_from_name

INDEX = sys.argv[1] if len(sys.argv) > 1 else "data/icecat-index.xml.gz"
OUT = sys.argv[2] if len(sys.argv) > 2 else "data/rows-icecat.jsonl"
SUPPLIERS = "data/icecat-SuppliersList.xml.gz"
CATEGORIES = "data/icecat-CategoriesList.xml.gz"

# langid 1 is English and 3 is French in Icecat's reference files, confirmed by
# reading them: category 7 is "Operating Systems" at 1 and "Systemes
# d'exploitation" at 3.
LANG_EN = "1"
LANG_FR = "3"

SLUG_STRIP = re.compile(r"[^a-z0-9]+")


def slug(text: str) -> str:
    return SLUG_STRIP.sub("-", text.lower()).strip("-")


def load_suppliers(path: str) -> dict:
    """Supplier id to brand name."""
    out = {}
    with gzip.open(path, "rb") as fh:
        for _, el in ElementTree.iterparse(fh, events=("end",)):
            if el.tag == "Supplier":
                sid = el.attrib.get("ID")
                name = (el.attrib.get("Name") or "").strip()
                if sid and name:
                    out[sid] = name
                el.clear()
    return out


def load_categories(path: str) -> dict:
    """Category id to (english name, french name, parent id)."""
    out = {}
    with gzip.open(path, "rb") as fh:
        for _, el in ElementTree.iterparse(fh, events=("end",)):
            if el.tag != "Category":
                continue
            cid = el.attrib.get("ID")
            if not cid:
                el.clear()
                continue
            en = fr = None
            parent = None
            for child in el:
                if child.tag == "ParentCategory":
                    parent = child.attrib.get("ID")
                elif child.tag == "Names":
                    for nm in child:
                        if nm.tag != "Name":
                            continue
                        if nm.attrib.get("langid") == LANG_EN and not en:
                            en = (nm.attrib.get("Value") or "").strip() or None
                        elif nm.attrib.get("langid") == LANG_FR and not fr:
                            fr = (nm.attrib.get("Value") or "").strip() or None
                elif child.tag == "Name":
                    if child.attrib.get("langid") == LANG_EN and not en:
                        en = (child.attrib.get("Value") or "").strip() or None
                    elif child.attrib.get("langid") == LANG_FR and not fr:
                        fr = (child.attrib.get("Value") or "").strip() or None
            out[cid] = (en, fr, parent)
            el.clear()
    return out


def category_path(cid, categories):
    """Broad to specific tags. Guards the self-parent root and any cycle."""
    chain = []
    seen = set()
    current = cid
    # Category 1's parent is category 1. Walking that without a guard is an
    # infinite loop on the first row, not a rare edge case.
    while current and current not in seen and len(chain) < 20:
        seen.add(current)
        entry = categories.get(current)
        if not entry:
            break
        en, _fr, parent = entry
        if en:
            chain.append("en:" + slug(en))
        current = parent
    chain.reverse()
    return chain


def main() -> int:
    print("loading references", flush=True)
    suppliers = load_suppliers(SUPPLIERS)
    categories = load_categories(CATEGORIES)
    print(f"  {len(suppliers)} brands, {len(categories)} categories", flush=True)

    entries = 0
    written = 0
    no_barcode = 0
    no_name = 0
    with_size = 0
    canada = 0
    on_market = 0
    duplicate_codes = 0
    seen_codes = set()

    with gzip.open(INDEX, "rb") as fh, open(OUT, "w", encoding="utf-8") as out:
        for _, el in ElementTree.iterparse(fh, events=("end",)):
            if el.tag != "file":
                continue
            entries += 1

            model = (el.attrib.get("Model_Name") or "").strip()
            eans = [
                e.attrib.get("Value")
                for e in el.iter()
                if e.tag == "EAN_UPC" and (e.attrib.get("Value") or "").strip()
            ]
            markets = {e.attrib.get("Value") for e in el.iter() if e.tag == "Country_Market"}

            if not eans:
                no_barcode += 1
                el.clear()
                continue
            if not model:
                no_name += 1
                el.clear()
                continue

            in_canada = 1 if "CA" in markets else 0
            canada += in_canada
            if el.attrib.get("On_Market") == "1":
                on_market += 1

            brand = suppliers.get(el.attrib.get("Supplier_id") or "")
            cats = category_path(el.attrib.get("Catid"), categories)

            # Icecat writes sizes into the model name with a hyphen, "175-ml"
            # and "680-ml", which the shared size reader will not match because
            # it expects the number to touch the unit or be separated by a
            # space. Normalised for the read only; the stored name is untouched.
            size_value, size_unit = size_from_name(model.replace("-", " "))
            if size_value:
                with_size += 1

            row = {
                "name": model,
                # The index is the English export, but Model_Name carries
                # whatever the supplier filed, French included. It goes in the
                # English column because the text index reads name_en, name_fr,
                # brands and leaf_category, and never `name`: a row with both
                # language columns empty is a row no text query can reach. The
                # tokenizer folds diacritics, so a French name here is still
                # matched by a French query.
                "name_en": model,
                "name_fr": None,
                "brands": brand,
                "quantity": None,
                "size_value": size_value,
                "size_unit": size_unit,
                "size_source": "name" if size_value else None,
                "category_path": cats,
                "leaf_category": cats[-1] if cats else None,
                "allergens": [],
                "image_url": el.attrib.get("HighPic") or None,
                "sold_in_canada": in_canada,
                "source": "icecat",
            }

            for ean in eans:
                code = ean.strip()
                if code in seen_codes:
                    # Icecat's own manual says brands reuse GTINs. Counted, and
                    # the later entry wins, which is what the loader would do
                    # anyway; recording it means the number is known rather than
                    # discovered later as a mystery.
                    duplicate_codes += 1
                seen_codes.add(code)
                out.write(json.dumps({**row, "code": code}, ensure_ascii=False) + "\n")
                written += 1

            el.clear()
            if entries % 500000 == 0:
                print(f"  {entries} entries, {written} rows", flush=True)

    print(f"index entries        {entries}")
    print(f"rows written         {written}")
    print(f"distinct barcodes    {len(seen_codes)}")
    print(f"duplicate barcodes   {duplicate_codes}")
    print(f"skipped, no barcode  {no_barcode}  ({100 * no_barcode / max(entries, 1):.1f}%)")
    print(f"skipped, no name     {no_name}")
    print(f"with a parsed size   {with_size}")
    print(f"listed for Canada    {canada}")
    print(f"still on market      {on_market}")
    return 0 if written > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
