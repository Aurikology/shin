#!/usr/bin/env bash
# linux/probe-collectors.sh -- from THIS box, can it reach what the server and the price collectors need?
#
#   bash linux/probe-collectors.sh
#
# Datacentre addresses are sometimes refused by retailers and APIs (an ASSUMPTION in server-decision.md, never measured).
# This measures it, with one cheap request per host and no key, no login and no write. A host counts as REACHABLE when
# it answers at all with an HTTP status below 500, even 401/403/404: those mean the host talked to us. It counts as
# BLOCKED on a refused connection, a timeout, a TLS failure, or a 5xx. (A 403 from a retailer's WAF is reported
# separately as REFUSED-403, because for a crawler that is a block even though the host "answered".)
#
# Exit 0: every host the SERVER itself needs is reachable. Collectors are reported per source; a blocked collector
# is simply not enabled on this box (it stays on the Mac): the exit code does not depend on it.
# Output ends with the exact enable line for the collectors that passed.

set -u

UA="curl/8.16.0"
fail=0

probe() { # probe <label> <url>
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -A "$UA" "$2" 2>/dev/null) || code="000"
  case "$code" in
    000) printf 'BLOCKED       %-18s %s (no answer)\n' "$1" "$2"; return 1 ;;
    403) printf 'REFUSED-403   %-18s %s\n' "$1" "$2"; return 2 ;;
    5??) printf 'BLOCKED       %-18s %s (HTTP %s)\n' "$1" "$2" "$code"; return 1 ;;
    *) printf 'REACHABLE     %-18s %s (HTTP %s)\n' "$1" "$2" "$code"; return 0 ;;
  esac
}

echo "== the server itself (must all be reachable)"
for pair in \
  "anthropic|https://api.anthropic.com/v1/models" \
  "revenuecat|https://api.revenuecat.com/v1/subscribers/probe" \
  "openfoodfacts|https://world.openfoodfacts.org/api/v2/product/737628064502.json" \
  "overpass|https://overpass-api.de/api/status" \
  "cloudflare|https://api.cloudflare.com/client/v4/ips"; do
  probe "${pair%%|*}" "${pair#*|}" || fail=1
done

echo "== collectors that may run on this box"
ok_collectors=""
probe kroger "https://api.kroger.com/v1/products?filter.term=milk" && ok_collectors="$ok_collectors kroger"
probe openprices "https://prices.openfoodfacts.org/api/v1/prices?size=1" && ok_collectors="$ok_collectors openprices"
probe hammer "https://jacobfilipp.com/hammerdata/hammer-5-csv.zip" && ok_collectors="$ok_collectors hammer"
probe bcldb "https://catalogue.data.gov.bc.ca/api/3/action/package_show?id=e43be180-7511-4e6f-84d3-ad6c9f5c3e2b" && ok_collectors="$ok_collectors bcldb"

echo "== retailer sites the Mac crawlers use (informational: these stay on the Mac either way)"
probe metro "https://www.metro.ca/" || true
probe canadiantire "https://www.canadiantire.ca/" || true
probe saveonfoods "https://www.saveonfoods.com/" || true
probe bcliquor "https://www.bcliquorstores.com/" || true

echo
if [ -n "$ok_collectors" ]; then
  echo "Collectors reachable from here:$ok_collectors"
  echo "Enable their timers with: sudo bash /opt/pexi/live/linux/install-units.sh --with-collectors"
  echo "(that enables kroger, hammer and openprices together; disable one with: sudo systemctl disable --now pexi-<name>.timer)"
else
  echo "No collector is reachable from this box: leave them on the Mac."
fi
[ "$fail" = 0 ] || echo "A host the SERVER needs is unreachable: do not cut over until that is understood."
exit "$fail"
