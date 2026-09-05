"""
Pull the Open Icecat index, the free electronics catalogue, and report its shape.

Open Icecat is the only free bulk source that covers consumer electronics with
brand-approved data sheets rather than crowd-entered rows, which is the category
the 2026-09-03 pricing correction called the best-served of the five. It is free,
and it is the one free source that needs an account, so the credentials are the
only thing this script cannot supply for itself.

Two steps, deliberately separated:

  fetch    downloads the index. Schema-independent, so it is written and can be
           trusted before anyone has seen the file.
  inspect  prints the element and attribute names actually present, with counts.

There is no prepare step yet, and that is on purpose. Icecat's public manual
names some of the index fields (Product_ID, Prod_ID, EAN_UPCS, Supplier_id,
Catid, path) but not all of them, and not which carry a usable product name. A
parser written against a manual instead of against the file is the kind of thing
that loads 500,000 rows of confident nonsense, and this catalogue's whole value
is being trusted about identity. `inspect` exists so the prepare step is written
against the real file, which takes minutes once the file is here.

Credentials come from the environment, never from this repo (no secrets in git):

  ICECAT_USER       the Open Icecat account username
  ICECAT_PASSWORD   its password

Signing up is free at icecat.biz and is a person's act, not this script's.
"""

import gzip
import os
import sys
import time
import urllib.request
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree

INDEX_URL = "https://data.icecat.biz/export/freexml/EN/files.index.xml.gz"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "data/icecat-index.xml.gz")

USER = os.environ.get("ICECAT_USER")
PASSWORD = os.environ.get("ICECAT_PASSWORD")


def fetch() -> int:
    if not USER or not PASSWORD:
        print("ICECAT_USER and ICECAT_PASSWORD are not set.")
        print("Open Icecat access is free but needs an account; sign up at icecat.biz,")
        print("then set both variables and run this again.")
        return 2

    opener = urllib.request.build_opener(
        urllib.request.HTTPBasicAuthHandler(
            _password_manager(INDEX_URL, USER, PASSWORD)
        )
    )
    opener.addheaders = [("Accept-Encoding", "gzip")]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    # Written aside and renamed, for the same reason as the Open Facts fetch: a
    # truncated gzip reads as a short complete file rather than as an error.
    tmp = OUT.with_suffix(".gz.part")
    started = time.time()
    print(f"fetching {INDEX_URL}", flush=True)
    with opener.open(INDEX_URL) as response, open(tmp, "wb") as fh:
        while True:
            chunk = response.read(1 << 20)
            if not chunk:
                break
            fh.write(chunk)
    tmp.replace(OUT)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes) in {time.time() - started:.0f}s")
    return 0


def _password_manager(url, user, password):
    mgr = urllib.request.HTTPPasswordMgrWithDefaultRealm()
    mgr.add_password(None, url, user, password)
    return mgr


def inspect(limit: int = 20000) -> int:
    """Print what the index actually contains, so the prepare step is written against it."""
    if not OUT.exists():
        print(f"{OUT} is not here yet. Run the fetch step first.")
        return 2

    tags = Counter()
    attrs = Counter()
    with_ean = 0
    seen = 0
    samples = []

    with gzip.open(OUT, "rb") as fh:
        for event, el in ElementTree.iterparse(fh, events=("end",)):
            tags[el.tag] += 1
            for k in el.attrib:
                attrs[f"{el.tag}@{k}"] += 1
            if el.tag.lower().endswith("file"):
                seen += 1
                # The question the prepare step turns on: how many index entries
                # carry a barcode at all. A datasheet with no GTIN cannot answer
                # a scan, whatever else it holds.
                ean = el.attrib.get("EAN_UPCS") or el.findtext("EANCode")
                if ean:
                    with_ean += 1
                if len(samples) < 3:
                    samples.append(dict(el.attrib))
                if seen >= limit:
                    break
            el.clear()

    print(f"entries examined     {seen}")
    print(f"carrying a barcode   {with_ean}  ({100 * with_ean / max(seen, 1):.1f}%)")
    print("\nelements:")
    for tag, n in tags.most_common(15):
        print(f"  {tag:30} {n}")
    print("\nattributes:")
    for a, n in attrs.most_common(30):
        print(f"  {a:40} {n}")
    print("\nfirst entries:")
    for s in samples:
        print(f"  {s}")
    return 0


def main() -> int:
    step = sys.argv[1] if len(sys.argv) > 1 else "fetch"
    if step == "fetch":
        return fetch()
    if step == "inspect":
        return inspect()
    print(f"unknown step {step!r}, expected 'fetch' or 'inspect'")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
