#!/bin/sh
# mac/bcldb-refresh.sh -- load BC Liquor's newest monthly price list, once per month it is published.
#
# Launch review 2026-11-27 (G5): the BC liquor list was loaded by hand only, with no job on the Mac
# or the Linux box, so its prices aged with nothing saying so. This asks BC's open-data catalogue
# (CKAN package_show) for the dataset's newest CSV, downloads it under its own file name (the loader
# reads the month from that name, price/src/bcldb.ts bcSeenOn), loads it, and leaves a
# <file>.loaded mark beside it. A month already marked is skipped, so the job can run weekly and
# picks up a new month within a week of BC publishing it (BC publishes mid-month, a few months behind).
#
# Usage: mac/bcldb-refresh.sh [path-to-config.env]
# Needs SHIN_PRICES from config.env, node and curl. Files go to SHIN_BCLDB_DIR, default a bcldb/
# folder beside the price database. Fails loudly: any step that fails stops the run with a non-zero
# exit and a line on stderr naming the step; a failed load leaves no mark, so the next run retries.

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
CONFIG_FILE="${1:-$SCRIPT_DIR/config.env}"
if [ -f "$CONFIG_FILE" ]; then
  set -a
  . "$CONFIG_FILE"
  set +a
fi

fail() {
  echo "bcldb-refresh: FAILED at $1" >&2
  exit 1
}

NODE="${NODE_BIN:-node}"
CURL="${CURL_BIN:-curl}"
command -v "$NODE" >/dev/null 2>&1 || fail "node: $NODE not found (set NODE_BIN in config.env)"
command -v "$CURL" >/dev/null 2>&1 || fail "curl: $CURL not found"
[ -n "${SHIN_PRICES:-}" ] || fail "config: SHIN_PRICES is not set"
[ -f "$SHIN_PRICES" ] || fail "config: SHIN_PRICES does not exist ($SHIN_PRICES)"

DATA_DIR="${SHIN_BCLDB_DIR:-$(dirname -- "$SHIN_PRICES")/bcldb}"
mkdir -p "$DATA_DIR" || fail "data folder: cannot make $DATA_DIR"

# BC Liquor Store Product Price List, the dataset price/src/bcldb.ts names.
API='https://catalogue.data.gov.bc.ca/api/3/action/package_show?id=e43be180-7511-4e6f-84d3-ad6c9f5c3e2b'
LOOKUP='
const api = process.argv[1];
fetch(api, { signal: AbortSignal.timeout(60000) })
  .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
  .then((d) => {
    const csv = (d.result?.resources ?? []).filter((x) => /csv/i.test(x.format ?? "") || /\.csv$/i.test(x.url ?? ""));
    csv.sort((a, b) => String(b.last_modified ?? b.created ?? "").localeCompare(String(a.last_modified ?? a.created ?? "")));
    if (!csv[0]?.url) throw new Error("no CSV resource in the dataset");
    console.log(csv[0].url);
  })
  .catch((e) => { console.error(String(e)); process.exit(2); });
'
URL=$("$NODE" -e "$LOOKUP" "$API") || fail "lookup (BC open-data catalogue)"
NAME=$(basename -- "$URL")
case "$NAME" in
  *.csv|*.CSV) ;;
  *) fail "lookup: the newest file is not a CSV ($URL)" ;;
esac

if [ -f "$DATA_DIR/$NAME.loaded" ]; then
  echo "bcldb-refresh: $NAME already loaded, nothing to do"
  exit 0
fi

echo "bcldb-refresh: downloading $NAME"
rm -f "$DATA_DIR/$NAME.part"
"$CURL" -fsSL --max-time 600 -o "$DATA_DIR/$NAME.part" "$URL" || { rm -f "$DATA_DIR/$NAME.part"; fail "download ($URL)"; }
# The June 2026 file was 988,625 bytes; anything under 100 kB is an error page or a cut-off file.
SIZE=$(wc -c < "$DATA_DIR/$NAME.part" | tr -d ' ')
if [ "$SIZE" -lt 100000 ]; then
  rm -f "$DATA_DIR/$NAME.part"
  fail "download: $NAME is only $SIZE bytes"
fi
mv "$DATA_DIR/$NAME.part" "$DATA_DIR/$NAME"

cd "$REPO_DIR"
echo "bcldb-refresh: loading $NAME into $SHIN_PRICES"
"$NODE" price/src/bcldb.ts "$DATA_DIR/$NAME" || fail "load ($NAME)"

# Last: the mark. Only a whole successful load reaches this line.
: > "$DATA_DIR/$NAME.loaded" || fail "mark loaded"
echo "bcldb-refresh: done"
