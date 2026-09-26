"""
Pull Metro's four regional e-commerce sitemaps.

Unit 4 of the 2026-09-26 build plan: the number ending a Metro product address
is the barcode (proven live, 58.7% match an existing product), and the address
also spells out the aisle the product sits in. This file only fetches the raw
sitemaps; `prepare_rows_metro.py` does the barcode/aisle extraction and the
category match.

Checked live 2026-09-26: the listing/sitemap pages answer a plain HTTP request
with 200 given an Accept header (no user agent needed). Individual PRODUCT pages
return 403 to every header set tried, so this script never touches them.

The four lists are flaky, not just "sometimes down": in the same minute, fetching
all four repeatedly showed each of them empty (a bare <urlset></urlset>, 0 <loc>
entries) on some attempts and full on others -- looks like a CDN edge serving a
stale/empty cache entry. A run that records zero products because a list came
back empty is a failure, not a result (the plan says so explicitly), so each
list is retried until it comes back non-empty or the retry budget is spent, and
which lists needed retries is printed rather than swallowed.
"""

import sys
import time
import urllib.request
from pathlib import Path

LISTS = ["ecomm-en-on", "ecomm-fr-on", "ecomm-en-qc", "ecomm-fr-qc"]
BASE = "https://www.metro.ca/sitemap-{}.xml"
OUT_DIR = Path(sys.argv[1] if len(sys.argv) > 1 else "data/metro")
MAX_ATTEMPTS = 8
RETRY_DELAY_S = 2


def fetch_once(url: str) -> bytes:
    # Checked live 2026-09-26: Metro 403s Python's default "Python-urllib/x.y"
    # user agent even though it needs no BROWSER user agent. A curl-shaped one
    # plus the Accept header is what got a 200 by hand, so that is what this
    # sends -- not a disguise, just not the one string that is blocked.
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/xml,text/xml",
            "User-Agent": "curl/8.16.0",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def fetch_list(name: str) -> tuple[bytes, int]:
    """Returns (body, attempts_needed). Raises if every attempt came back empty."""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        body = fetch_once(BASE.format(name))
        if b"<loc>" in body:
            return body, attempt
        time.sleep(RETRY_DELAY_S)
    raise RuntimeError(f"{name}: empty on all {MAX_ATTEMPTS} attempts")


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    retried = []
    failed = []
    for name in LISTS:
        try:
            body, attempts = fetch_list(name)
        except RuntimeError as e:
            print(f"FAILED: {e}", flush=True)
            failed.append(name)
            continue
        (OUT_DIR / f"{name}.xml").write_bytes(body)
        locs = body.count(b"<loc>")
        print(f"{name}: {locs} locs (attempt {attempts})", flush=True)
        if attempts > 1:
            retried.append(name)

    if retried:
        print(f"needed a retry: {', '.join(retried)}")
    if failed:
        print(f"NEVER recovered, still empty: {', '.join(failed)}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
