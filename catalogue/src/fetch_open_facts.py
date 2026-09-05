"""
Pull the three sibling Open Facts databases: beauty, general products, pet food.

Why these three and why now: they are the only catalogue sources that extend Shin
past groceries at zero cost, no key, and no account. Everything else free needs a
signup (Icecat, Best Buy, eBay) and everything else complete needs an invoice.

Why JSONL and not Parquet like `fetch_canada.py`: the sibling projects publish no
Parquet. Their whole export is small enough that the reason `fetch_canada.py`
reaches for Parquet does not apply here. Open Food Facts is 7.8 GB and had to be
filtered to Canada before it could be handled; these three together are 156 MB
compressed, so the whole file is taken and nothing is filtered away at fetch time.

That difference matters for decision 28. The Canadian filter in `fetch_canada.py`
is a bandwidth measure, not a product decision, and repeating it here would turn
it into one. Country is carried as a column and filtered at query time, which is
what decision 28 actually asks for.

The name shape is different too, which is why these files get their own prepare
step: the Parquet stores `product_name` as a list of {lang, text}, the JSONL
export stores `product_name` as one string plus `product_name_en` and
`product_name_fr` as separate keys that exist only when somebody filled them in.
"""

import sys
import time
import urllib.request
from pathlib import Path

# Each project publishes at its own static host, same file naming.
SOURCES = {
    "openbeautyfacts": "https://static.openbeautyfacts.org/data/openbeautyfacts-products.jsonl.gz",
    "openproductsfacts": "https://static.openproductsfacts.org/data/openproductsfacts-products.jsonl.gz",
    "openpetfoodfacts": "https://static.openpetfoodfacts.org/data/openpetfoodfacts-products.jsonl.gz",
}

OUT_DIR = Path(sys.argv[1] if len(sys.argv) > 1 else "data")


def fetch(name: str, url: str, out_dir: Path) -> int:
    out = out_dir / f"{name}.jsonl.gz"
    started = time.time()
    print(f"fetching {name}", flush=True)
    # A partial download that keeps the old file's name is the failure mode here:
    # gzip stops at the truncation without an error and the prepare step reads a
    # short file as a complete one. Written aside, renamed only once finished.
    tmp = out.with_suffix(".gz.part")
    urllib.request.urlretrieve(url, tmp)
    tmp.replace(out)
    size = out.stat().st_size
    print(f"  {name}: {size} bytes in {time.time() - started:.0f}s")
    return size


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    wanted = sys.argv[2:] or list(SOURCES)
    total = 0
    for name in wanted:
        if name not in SOURCES:
            print(f"unknown source {name}, expected one of {list(SOURCES)}")
            return 2
        total += fetch(name, SOURCES[name], OUT_DIR)
    print(f"total {total} bytes across {len(wanted)} sources")
    return 0 if total > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
