#!/usr/bin/env bash
# linux/load-test.sh -- the pre-cutover load test on the new box, with the memory numbers recorded.
#
#   SHIN_INVITE=<code> bash linux/load-test.sh [steps]     (default steps 1,4,16,64,128,256,512)
#
# Runs scripts/load/load-test.mjs --spawn: a THROWAWAY server (its own temp data folder, port 4199) over the real catalogue
# and prices copied to /var/lib/pexi, so no scan or event ever lands in the live data and the live server (if running) is
# not touched. Records, into /var/lib/pexi/health/loadtest-<time>.txt:
#   * free -m before, after, and the lowest "available" memory seen (sampled every 2 s by vmstat) and swap used
#   * the cold first answer: how long the first search takes right after the throwaway server starts
#   * the load test's own table (requests per second, p50/p95, where it breaks)
# The Mac broke at 16 non-stop users while swapping (mailbox 2026-11-25); the pass bar is Jamin's launch target.

set -eu

REPO="${SHIN_REPO_DIR:-/opt/pexi/live}"
DATA="${PEXI_DATA:-/var/lib/pexi}"
STEPS="${1:-1,4,16,64,128,256,512}"
OUT="$DATA/health/loadtest-$(date +%Y%m%d-%H%M%S).txt"
mkdir -p "$DATA/health"

[ -f "$DATA/catalogue.db" ] || { echo "no $DATA/catalogue.db: copy the data first (CUTOVER step 5)" >&2; exit 1; }
[ -n "${SHIN_INVITE:-}" ] || echo "note: SHIN_INVITE not set; the throwaway server runs with no invite code, which is fine"

{
  echo "== load test $(date -u +%FT%TZ) on $(hostname), $(nproc) cores"
  echo "== free before"; free -m
  echo "== disk"; df -h "$DATA" | tail -1
} | tee "$OUT"

# Sample available memory and swap every 2 s while the test runs.
SAMPLES=$(mktemp)
( while :; do free -m | awk '/^Mem:/{a=$7} /^Swap:/{s=$3} END{print a, s}' >> "$SAMPLES"; sleep 2; done ) &
SAMPLER=$!
trap 'kill "$SAMPLER" 2>/dev/null || true' EXIT

cd "$REPO"
SHIN_CATALOGUE="$DATA/catalogue.db" SHIN_PRICES="$DATA/prices.db" NODE_NO_WARNINGS=1 \
  /usr/local/bin/node scripts/load/load-test.mjs --spawn --port 4199 --steps "$STEPS" --seconds 10 \
  --catalogue "$DATA/catalogue.db" ${SHIN_INVITE:+--invite "$SHIN_INVITE"} 2>&1 | tee -a "$OUT"
rc=${PIPESTATUS[0]}

kill "$SAMPLER" 2>/dev/null || true
{
  echo "== free after"; free -m
  echo "== lowest available memory (MB) and highest swap used (MB) during the run"
  sort -n "$SAMPLES" | head -1 | awk '{print "lowest available: " $1 " MB"}'
  sort -k2 -n "$SAMPLES" | tail -1 | awk '{print "highest swap used: " $2 " MB"}'
  echo "== load-test exit code: $rc"
} | tee -a "$OUT"
rm -f "$SAMPLES"
echo "recorded in $OUT"
exit "$rc"
