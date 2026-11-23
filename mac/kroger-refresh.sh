#!/bin/sh
# mac/kroger-refresh.sh -- daily re-price of the barcodes Kroger has already priced, so US shelf prices stay fresh.
#
# Picks the barcodes Kroger answered about longest ago (mac/kroger-codes.mjs) and runs price/src/kroger-api.ts
# on them at the same 10 stores the one-off bulk run used (5 ZIPs, 2 stores each). Budget: 6,000 product calls
# a run (Kroger allows about 10,000 a day); each call carries 50 ids for one store, so one run covers
# 6000 * 50 / 10 = 30,000 barcodes at every store. Stopping at the call budget is the normal end (exit 0).
#
# Usage: mac/kroger-refresh.sh [path-to-config.env]
# Needs SHIN_PRICES, SHIN_CATALOGUE, KROGER_CLIENT_ID and KROGER_CLIENT_SECRET in config.env (the secret is
# never printed) and node on PATH. Run daily by com.shin.kroger (mac/launchd-daemons/com.shin.kroger.plist).
# Skips cleanly (exit 0, one logged line) while the one-off bulk driver (kroger-bulk/driver.sh) is running.
#
# Fails loudly: any step that fails stops the run with a non-zero exit and a line on stderr naming the step.
# There is no refresh mark: the exit code and the log are the record (a stale newest Kroger seen_on is the
# sign of failed runs).

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
  echo "kroger-refresh: FAILED at $1" >&2
  exit 1
}

ZIPS="45202,30303,75201,90012,98101"
STORES=10
IDS_PER_CALL=50
MAX_CALLS=6000
MAX_CODES=$((MAX_CALLS * IDS_PER_CALL / STORES))
BULK_PATTERN="${KROGER_BULK_PATTERN:-kroger-bulk/driver.sh}"

NODE="${NODE_BIN:-node}"
command -v "$NODE" >/dev/null 2>&1 || fail "node: $NODE not found (set NODE_BIN in config.env)"
[ -n "${SHIN_PRICES:-}" ] || fail "config: SHIN_PRICES is not set"
[ -n "${SHIN_CATALOGUE:-}" ] || fail "config: SHIN_CATALOGUE is not set"
[ -f "$SHIN_PRICES" ] || fail "config: SHIN_PRICES does not exist ($SHIN_PRICES)"
[ -f "$SHIN_CATALOGUE" ] || fail "config: SHIN_CATALOGUE does not exist ($SHIN_CATALOGUE)"
[ -n "${KROGER_CLIENT_ID:-}" ] || fail "config: KROGER_CLIENT_ID is not set"
[ -n "${KROGER_CLIENT_SECRET:-}" ] || fail "config: KROGER_CLIENT_SECRET is not set"

# Two runs would share one day's call allowance: stand down while the one-off bulk run is going.
if command -v pgrep >/dev/null 2>&1; then
  if pgrep -f "$BULK_PATTERN" >/dev/null 2>&1; then
    echo "kroger-refresh: skipped, the one-off bulk driver ($BULK_PATTERN) is still running"
    exit 0
  fi
else
  echo "kroger-refresh: warning, pgrep not found, cannot check for the bulk driver" >&2
fi

CODES_FILE=$(mktemp "${TMPDIR:-/tmp}/kroger-codes.XXXXXX") || fail "temp file"
trap 'rm -f "$CODES_FILE"' EXIT

cd "$REPO_DIR"
"$NODE" mac/kroger-codes.mjs "$SHIN_PRICES" "$CODES_FILE" "$MAX_CODES" || fail "select barcodes"
[ -s "$CODES_FILE" ] || fail "select barcodes: none found (no Kroger rows in $SHIN_PRICES)"

echo "kroger-refresh: re-pricing up to $MAX_CODES barcodes at $STORES stores into $SHIN_PRICES"
"$NODE" price/src/kroger-api.ts --zips "$ZIPS" --stores-per-zip 2 --codes "$CODES_FILE" \
  --db "$SHIN_PRICES" --catalogue "$SHIN_CATALOGUE" --max-calls "$MAX_CALLS" --id-form body \
  || fail "import (kroger-api.ts)"

echo "kroger-refresh: done"
