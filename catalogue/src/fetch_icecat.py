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

Both are read from the real environment first, and from a `.env` file at the repo
root second. The file is there because the shell that runs this script is not
always the shell someone typed the password into, and because a password typed
into a chat is a password in a transcript forever. `.env` is gitignored, its
values are never printed, and this loader never overwrites a variable that the
real environment already set.

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
# Not argv: the second positional is the inspect limit, and having one slot mean
# two things turned `inspect 0` into a fetch that wrote to a file called "0".
OUT = Path(os.environ.get("SHIN_ICECAT_INDEX", "data/icecat-index.xml.gz"))

def load_dotenv() -> None:
    """Fill ICECAT_* from a .env file, without printing anything it read."""
    # Repo root, then the package directory, so either place works.
    here = Path(__file__).resolve()
    for candidate in (here.parents[2] / ".env", here.parents[1] / ".env"):
        if not candidate.exists():
            continue
        for raw in candidate.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            # A real environment variable always wins, so a shell export can
            # override the file without anyone editing the file.
            if key and key not in os.environ:
                os.environ[key] = value.strip().strip('"').strip("'")


load_dotenv()

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
    markets = Counter()
    with_ean = 0
    ean_values = 0
    in_canada = 0
    on_market = 0
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
                #
                # This is read off children, not off an attribute. Icecat's own
                # manual lists EAN_UPCS among the <file> fields, which reads as an
                # attribute and is not one: the barcodes are <EAN_UPCS><EAN_UPC
                # Value="..."/></EAN_UPCS> underneath. Written the manual's way it
                # reported 0.0% against a file where a third of the rows have one.
                eans = [
                    e.attrib.get("Value")
                    for e in el.iter()
                    if e.tag.endswith("EAN_UPC") and e.attrib.get("Value")
                ]
                if eans:
                    with_ean += 1
                    ean_values += len(eans)
                seen_markets = {
                    e.attrib.get("Value")
                    for e in el.iter()
                    if e.tag.endswith("Country_Market")
                }
                markets.update(m for m in seen_markets if m)
                if "CA" in seen_markets:
                    in_canada += 1
                if el.attrib.get("On_Market") == "1":
                    on_market += 1
                if len(samples) < 3:
                    samples.append(dict(el.attrib))
                if limit and seen >= limit:
                    break
                # Cleared only here, once the whole entry has been read.
                #
                # Clearing every element as it ends is the obvious way to keep
                # memory flat and it silently destroys the answer: iterparse
                # fires a child's end event before its parent's, so clearing the
                # EAN_UPC child empties the attributes the parent is about to be
                # asked for. Both earlier runs reported 0.0% barcodes against a
                # file holding 4,981,204 of them, and nothing errored.
                el.clear()

    print(f"entries examined     {seen}")
    print(f"carrying a barcode   {with_ean}  ({100 * with_ean / max(seen, 1):.1f}%)")
    print(f"barcode values       {ean_values}")
    print(f"listed for Canada    {in_canada}  ({100 * in_canada / max(seen, 1):.1f}%)")
    print(f"still on market      {on_market}  ({100 * on_market / max(seen, 1):.1f}%)")
    print(f"\ntop country markets: {markets.most_common(12)}")
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
        # 0 means the whole file. A sample off the front is not representative:
        # the index is ordered by Product_ID, so the first entries are the oldest
        # products Icecat ever held.
        return inspect(int(sys.argv[2]) if len(sys.argv) > 2 else 20000)
    print(f"unknown step {step!r}, expected 'fetch' or 'inspect'")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
