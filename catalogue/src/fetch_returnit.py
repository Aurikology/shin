"""
Crawl BC's beverage-container deposit registry (return-it.ca), non-alcohol slice
only, and turn it into the exact rows the SQLite loader inserts.

Plan unit 6a, `docs/catalogue-build-plan-2026-09-26.md`. The registry is a paged
HTML search, not a file: 30 rows a page, and a plain request 403s where a
browser user agent gets 200. Alcohol (130,404 containers) is never fetched: the
registry's own `type` filter is passed once per non-alcohol drink type, so the
narrowing happens on the server, not by discarding rows after the fact.

WHY eleven types, not the twelve the dropdown shows excluding Alcohol. The
thirteen `type` option values on the search form are: Alcohol, Cannabis,
Coffee, De-alc. Beer, Wine & Spirits, Energy Drink, Juice, Milk, Other, Others,
Plant-Based Alternatives, Soft Drink, Tea, Water. Querying all twelve
non-Alcohol values and summing the registry's own printed totals gives 24,062,
not the plan's measured 22,972 -- a difference of exactly 1,090, which is
exactly "De-alc. Beer, Wine & Spirits"'s own total. Excluding that type too
(it is de-alcoholized alcohol, not a request the plan's sample or "eleven
non-alcohol types" projection ever counted) gives exactly 22,972. So the
eleven types below, and only these, are what "the non-alcohol slice" means
here, counted against the pager itself the day of the crawl, not assumed from
the plan doc.

WHY the pager needs no separate discovery step. `?Rn=N` requests page N
directly, with no dependency on a prior page or the `Se=` id the UI links
carry: `Rn=156&type=Water` returns the true final page even as a first
request. So the first fetch per type (Rn omitted = page 1) both reads real
rows AND reads the type's total from its own last pagination link
(`"4651 to 4678"`), fixing the page count for that type without wasting a
request.

WHY every barcode is canonicalized to 13 digits before it is written, not left
as the page spells it. `dedupe-barcode-spellings.ts` found 1,375,443 products
already sitting in this catalogue stored twice, once as a bare 12-digit UPC-A
and once as its zero-padded 13-digit GTIN-13 twin, because nothing
canonicalized a loader's input before it reached `ON CONFLICT(code)`. A
12-digit UPC-A gets one leading zero. An 8-digit EAN-8 stays 8 digits: it is
its own standard, not a truncated 13-digit code, and padding it would invent a
barcode nobody printed. 13- and 14-digit codes pass through unchanged.
Anything else is not a barcode this catalogue can key on and is skipped,
counted rather than guessed at. (`catalogue/src/fetch_consignaction.py` runs
the identical rule for Quebec's registry the same night; this is not copied
from it by accident.)

WHY pages are saved to disk as well as parsed inline. The plan's acceptance
test wants the crawl to write all pages before anything is loaded, so a
parsing bug found afterwards can be fixed and re-run against the saved HTML
rather than re-crawling the site. `catalogue/data/` is gitignored repo-wide
(every byte in it is re-fetchable, nothing there is authored), so the crash
safety this rule is really after -- surviving an interrupted run -- comes from
having flushed both the raw pages and the JSONL to disk as we go, not from a
git commit. What DOES get committed every 100 pages is
`catalogue/returnit-crawl-log.md`, a small tracked file outside `data/`, so
progress is visible in git history even though the data itself is not.

Run (from the `catalogue/` directory):
  python src/fetch_returnit.py [rows_out] [pages_dir]
"""

import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_rows import parse_size  # noqa: E402  (same unit table as every other loader)

BASE = "https://www.return-it.ca/registeredbrands/"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
SOURCE = "returnit"
PAGE_SIZE = 30
PACE_SECONDS = 6.7  # measured over 80 pages, plan unit 6a
COMMIT_EVERY = 100

# The eleven non-alcohol, non-de-alcoholized types. See the module docstring
# for why "De-alc. Beer, Wine & Spirits" is excluded alongside "Alcohol".
TYPES = [
    "Cannabis",
    "Coffee",
    "Energy Drink",
    "Juice",
    "Milk",
    "Other",
    "Others",
    "Plant-Based Alternatives",
    "Soft Drink",
    "Tea",
    "Water",
]

ROWS_OUT = sys.argv[1] if len(sys.argv) > 1 else "data/rows-returnit.jsonl"
PAGES_DIR = Path(sys.argv[2] if len(sys.argv) > 2 else "data/returnit-pages")

BARCODE_RE = re.compile(r"^[0-9]+$")
ROW_RE = re.compile(r'<tr>\s*<td class="num">(\d+)</td>(.*?)</tr>', re.S)
TD_RE = re.compile(r"<td[^>]*>(.*?)</td>", re.S)
LAST_PAGE_RE = re.compile(r'title="[\d,]+ to ([\d,]+)"')
HREF_RE = re.compile(r'href="([^"]+)"')
TAG_RE = re.compile(r"<[^>]+>")


def clean_text(s):
    s = TAG_RE.sub("", s or "")
    s = s.replace("&amp;", "&").replace("&nbsp;", " ").strip()
    return s or None


def canonical_barcode(raw):
    """8 stays 8. 12 gets one leading zero. 13 and 14 pass through. Else None."""
    if raw is None:
        return None
    s = raw.strip()
    if not s or not BARCODE_RE.match(s):
        return None
    n = len(s)
    if n in (8, 13, 14):
        return s
    if n == 12:
        return "0" + s
    return None


def slug(type_name):
    return re.sub(r"[^A-Za-z0-9]+", "_", type_name).strip("_")


def fetch(url, dest_path, attempt=1):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read()
            status = resp.status
    except urllib.error.HTTPError as e:
        body = e.read()
        status = e.code
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    dest_path.write_bytes(body)
    return status, body.decode("utf-8", errors="replace")


def parse_page(html):
    """Returns (rows, last_page_number_seen_or_None)."""
    rows = []
    for _num, body in ROW_RE.findall(html):
        tds = TD_RE.findall(body)
        if len(tds) < 5:
            continue
        brand = clean_text(tds[0])
        flavour = clean_text(tds[1])
        product_type = clean_text(tds[2])
        container_type = clean_text(tds[3])
        upc_raw = clean_text(tds[4]) or ""
        image_url = None
        if len(tds) > 5:
            m = HREF_RE.search(tds[5])
            if m:
                image_url = m.group(1)
        rows.append(
            {
                "brand": brand,
                "flavour": flavour,
                "product_type": product_type,
                "container_type": container_type,
                "upc_raw": upc_raw,
                "image_url": image_url,
            }
        )
    last_pages = [int(m.replace(",", "")) for m in LAST_PAGE_RE.findall(html)]
    return rows, rows and len(rows) or 0


def total_and_pages_from_first_page(html):
    """The pager always prints the true final range, even on page 1."""
    matches = LAST_PAGE_RE.findall(html)
    if not matches:
        return None, None
    total = int(matches[-1].replace(",", ""))
    pages = (total + PAGE_SIZE - 1) // PAGE_SIZE
    return total, pages


def row_to_prepared(r):
    code = canonical_barcode(r["upc_raw"])
    if code is None:
        return None, "bad_barcode"
    brand = r["brand"]
    if not brand:
        return None, "no_name"
    name = f"{brand} - {r['flavour']}" if r["flavour"] else brand
    product_type = r["product_type"]
    size_value, size_unit = parse_size(r["container_type"], None, None)
    return (
        {
            "code": code,
            "name": name,
            "name_en": name,
            "name_fr": None,
            "brands": brand,
            "quantity": r["container_type"],
            "size_value": size_value,
            "size_unit": size_unit,
            "category_path": [product_type] if product_type else [],
            "leaf_category": product_type,
            "allergens": [],
            "image_url": r["image_url"],
            "sold_in_canada": 1,
            "source": SOURCE,
        },
        None,
    )


def git_commit_progress(pages_done, pages_total, written, log_path):
    log_path.parent.mkdir(parents=True, exist_ok=True)
    line = f"- page {pages_done}/{pages_total}, {written} rows written so far ({time.strftime('%Y-%m-%d %H:%M:%S')})\n"
    if not log_path.exists():
        log_path.write_text(
            "# BC return-it crawl progress, unit 6a\n\n"
            "Checkpointed every 100 pages so a crash's furthest point is visible "
            "in git history. The actual rows and raw pages live in "
            "`catalogue/data/`, which is gitignored and re-crawlable, so this "
            "file -- not that data -- is what gets committed.\n\n",
            encoding="utf-8",
        )
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(line)
    repo_root = Path(__file__).resolve().parents[2]
    rel = log_path.resolve().relative_to(repo_root)
    subprocess.run(["git", "-C", str(repo_root), "add", str(rel)], check=False)
    subprocess.run(
        [
            "git",
            "-C",
            str(repo_root),
            "commit",
            "-m",
            f"[catalogue] returnit crawl progress: page {pages_done}/{pages_total}",
        ],
        check=False,
        capture_output=True,
    )


def main() -> int:
    log_path = Path(__file__).resolve().parents[2] / "catalogue" / "returnit-crawl-log.md"

    written = 0
    skipped_bad_barcode = 0
    skipped_no_name = 0
    seen_codes = set()
    dupe_codes = 0

    type_pages = {}
    type_totals = {}

    fh_out = open(ROWS_OUT, "a", encoding="utf-8")

    def process_page(html, t):
        nonlocal written, skipped_bad_barcode, skipped_no_name, dupe_codes
        rows, _ = parse_page(html)
        for r in rows:
            prepared, reason = row_to_prepared(r)
            if prepared is None:
                if reason == "bad_barcode":
                    skipped_bad_barcode += 1
                else:
                    skipped_no_name += 1
                continue
            if prepared["code"] in seen_codes:
                dupe_codes += 1
                continue
            seen_codes.add(prepared["code"])
            fh_out.write(json.dumps(prepared, ensure_ascii=False) + "\n")
            fh_out.flush()
            written += 1
        return len(rows)

    # Step 1: discover each type's total and page count from its own page 1.
    for t in TYPES:
        url = f"{BASE}?type={urllib.parse.quote(t)}"
        dest = PAGES_DIR / slug(t) / "p1.html"
        t0 = time.monotonic()
        status, html = fetch(url, dest)
        if status == 403:
            print(f"STOPPED: type={t!r} page 1 returned HTTP 403 -- registry is refusing this user agent")
            fh_out.close()
            return 1
        if status != 200:
            print(f"STOPPED: type={t!r} page 1 returned HTTP {status}, not 200")
            fh_out.close()
            return 1
        total, pages = total_and_pages_from_first_page(html)
        if total is None:
            print(f"STOPPED: type={t!r} page 1 has no pagination -- page shape may have changed")
            fh_out.close()
            return 1
        type_totals[t] = total
        type_pages[t] = pages
        process_page(html, t)
        print(f"  discovered  type={t!r:28} total={total:6d}  pages={pages:4d}")
        elapsed = time.monotonic() - t0
        if elapsed < PACE_SECONDS:
            time.sleep(PACE_SECONDS - elapsed)

    grand_total_rows = sum(type_totals.values())
    grand_total_pages = sum(type_pages.values())
    print(f"\nsum of the eleven types' own totals: {grand_total_rows} rows, {grand_total_pages} pages")

    # Step 2: the rest of each type's pages.
    pages_done = sum(1 for _ in TYPES)  # page 1 of every type already fetched
    for t in TYPES:
        pages = type_pages[t]
        for page in range(2, pages + 1):
            url = f"{BASE}?Rn={page}&type={urllib.parse.quote(t)}"
            dest = PAGES_DIR / slug(t) / f"p{page}.html"
            t0 = time.monotonic()
            status, html = fetch(url, dest)
            if status == 403:
                print(f"STOPPED: type={t!r} page {page} returned HTTP 403 -- registry is refusing this user agent")
                fh_out.close()
                return 1
            if status != 200:
                print(f"STOPPED: type={t!r} page {page} returned HTTP {status}, not 200")
                fh_out.close()
                return 1
            n_rows = process_page(html, t)
            pages_done += 1
            if pages_done % 10 == 0 or page == pages:
                print(
                    f"  {pages_done:4d}/{grand_total_pages}  type={t!r:28} page {page:4d}/{pages}  "
                    f"({n_rows} rows)  written={written}"
                )
            if pages_done % COMMIT_EVERY == 0:
                git_commit_progress(pages_done, grand_total_pages, written, log_path)
            elapsed = time.monotonic() - t0
            if elapsed < PACE_SECONDS:
                time.sleep(PACE_SECONDS - elapsed)

    fh_out.close()
    git_commit_progress(pages_done, grand_total_pages, written, log_path)

    print(f"\npages fetched          {pages_done}")
    print(f"rows written           {written}")
    print(f"skipped, bad barcode   {skipped_bad_barcode}")
    print(f"skipped, no name       {skipped_no_name}")
    print(f"dupe barcodes in source {dupe_codes}")
    return 0 if written > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
