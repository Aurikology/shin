#!/bin/sh
# mac/hammer-refresh.sh -- re-import Project Hammer's grocery prices and names.
#
# Project Hammer republishes its data regularly (hammer-5-csv.zip was refreshed
# 2026-11-07). This downloads it, loads the latest price per barcoded product
# into the live price database (price/src/hammer.ts) and the product names into
# the live catalogue (catalogue/src/load.ts, which keeps the first writer, so a
# product another source already holds keeps its row). Ruling: RULINGS.md
# "Project Hammer prices are imported".
#
# Usage: mac/hammer-refresh.sh [path-to-config.env]
# Needs SHIN_PRICES and SHIN_CATALOGUE from config.env, about 5 GB free, and
# node on PATH. Meant to be run weekly by the Mac's job supervisor.
#
# Fails loudly: any step that fails stops the run with a non-zero exit and a
# line on stderr naming the step. The temp folder is removed either way.

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
  echo "hammer-refresh: FAILED at $1" >&2
  exit 1
}

[ -n "${SHIN_PRICES:-}" ] || fail "config: SHIN_PRICES is not set"
[ -n "${SHIN_CATALOGUE:-}" ] || fail "config: SHIN_CATALOGUE is not set"
[ -f "$SHIN_PRICES" ] || fail "config: SHIN_PRICES does not exist ($SHIN_PRICES)"
[ -f "$SHIN_CATALOGUE" ] || fail "config: SHIN_CATALOGUE does not exist ($SHIN_CATALOGUE)"

URL="https://jacobfilipp.com/hammerdata/hammer-5-csv.zip"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/hammer-refresh.XXXXXX")
trap 'rm -rf "$TMP"' EXIT INT TERM

# Free space: the zip is about 0.5 GB and unpacks to about 4 GB.
FREE_KB=$(df -Pk "$TMP" | awk 'NR==2 {print $4}')
[ "$FREE_KB" -gt 6000000 ] || fail "disk: under 6 GB free where the temp folder is ($FREE_KB KB)"

echo "hammer-refresh: downloading $URL"
curl -fsSL --retry 3 -o "$TMP/hammer.zip" "$URL" || fail "download"
unzip -q "$TMP/hammer.zip" -d "$TMP" || fail "unzip"
[ -s "$TMP/hammer-4-product.csv" ] || fail "unzip: hammer-4-product.csv missing (did the publisher rename the files?)"
[ -s "$TMP/hammer-4-raw.csv" ] || fail "unzip: hammer-4-raw.csv missing (did the publisher rename the files?)"

cd "$REPO_DIR"
echo "hammer-refresh: loading prices into $SHIN_PRICES"
node price/src/hammer.ts "$TMP" || fail "price load"

echo "hammer-refresh: loading product names into $SHIN_CATALOGUE"
node price/src/hammer.ts "$TMP" --catalogue-rows "$TMP/hammer-catalogue-rows.jsonl" || fail "catalogue rows"
(cd catalogue && node src/load.ts --no-placement "$TMP/hammer-catalogue-rows.jsonl") || fail "catalogue load"

echo "hammer-refresh: done"
