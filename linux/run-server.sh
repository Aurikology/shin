#!/bin/sh
# linux/run-server.sh -- what pexi-server.service runs (the Linux twin of mac/run-server.sh).
#
# systemd has already loaded /etc/pexi/pexi.env into the environment (EnvironmentFile=), so there is no
# config file to source here. It does the one thing the Mac script did besides starting node: it marks the
# folder as the live server's, because app/test/setup/global.mjs refuses to run the test suite while that
# file exists (so no test run can touch the data testers use). exec keeps this shell's PID, so systemd's
# MainPID is node itself and SIGTERM (the 12 s drain in app/src/shutdown.ts) reaches it directly.

set -eu

REPO="${SHIN_REPO_DIR:-/opt/pexi/live}"
NODE="${NODE_BIN:-/usr/local/bin/node}"

[ -f "$REPO/app/server.ts" ] || { echo "run-server.sh: no server at $REPO/app/server.ts" >&2; exit 1; }
[ -x "$NODE" ] || { echo "run-server.sh: node not found at $NODE" >&2; exit 1; }

printf 'live Pexi server started %s, pid %s, by linux/run-server.sh\n' "$(date)" "$$" > "$REPO/.shin-live-server"

cd "$REPO/app"
exec "$NODE" server.ts
