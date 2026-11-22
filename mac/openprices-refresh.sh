#!/bin/sh
# mac/openprices-refresh.sh -- re-import Open Prices (Open Food Facts) shelf prices, CAD and USD.
#
# Pulls every price row the API holds for each currency (price/src/openprices.ts makes one
# pass per currency: Canadian dollars, then US dollars) into the live price database. Each
# row keeps its own currency; online rows take their country from the currency of the pass.
# Rows are keyed by the API's own row id, so a re-run updates rather than duplicates.
#
# Usage: mac/openprices-refresh.sh [path-to-config.env]
# Needs SHIN_PRICES and SHIN_CATALOGUE from config.env and node on PATH. Meant to run weekly
# (a launchd job is NOT installed by this script; add one the way com.shin.hammer.plist does).
#
# Fails loudly: any step that fails stops the run with a non-zero exit and a line on stderr
# naming the step. The refresh mark is written only after a whole successful import, so a
# stale mark (store_meta key openprices_refreshed_at) means a failed or missing refresh.

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
  echo "openprices-refresh: FAILED at $1" >&2
  exit 1
}

# launchd does not read the shell's PATH or nvm setup: NODE_BIN in config.env
# names the exact binary, as mac/run-server.sh uses it.
NODE="${NODE_BIN:-node}"
command -v "$NODE" >/dev/null 2>&1 || fail "node: $NODE not found (set NODE_BIN in config.env)"
[ -n "${SHIN_PRICES:-}" ] || fail "config: SHIN_PRICES is not set"
[ -n "${SHIN_CATALOGUE:-}" ] || fail "config: SHIN_CATALOGUE is not set"
[ -f "$SHIN_PRICES" ] || fail "config: SHIN_PRICES does not exist ($SHIN_PRICES)"
[ -f "$SHIN_CATALOGUE" ] || fail "config: SHIN_CATALOGUE does not exist ($SHIN_CATALOGUE)"

cd "$REPO_DIR"
echo "openprices-refresh: importing CAD and USD prices into $SHIN_PRICES"
"$NODE" price/src/openprices.ts || fail "import (CAD and USD passes)"

# Last: the mark. Only a whole successful import reaches this line.
"$NODE" price/src/openprices.ts --mark-refreshed || fail "mark refreshed"

echo "openprices-refresh: done"
