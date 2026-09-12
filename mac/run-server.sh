#!/bin/sh
# mac/run-server.sh
#
# The actual command launchd runs (via mac/launchd/com.shin.server.plist).
# Kept as its own script rather than inline in the plist so the environment
# variables the server reads (PORT, SHIN_CATALOGUE, SHIN_SCANS,
# SHIN_CORRECTIONS, SHIN_PRICES, SHIN_GAPS, ANTHROPIC_API_KEY, etc, all
# named in app/server.ts, price/src/*.ts and catalogue/src/*.ts) come from
# one file (mac/config.env) instead of being duplicated into the plist's own
# XML, which is exactly the kind of second place a value could drift from
# the one config file this brief calls for.
#
# Not run. launchd will run it once mac/05-install-launchd.sh has been run
# on the Mac.

set -a
. "$(dirname "$0")/config.env"
set +a

# If the Node version gate (mac/02-install-node.sh) ended in the nvm
# fallback, NODE_BIN in config.env should point at the exact binary
# ("nvm which 24.14.0" prints it) since launchd does not read the
# interactive shell's nvm setup. If NODE_BIN is unset, this falls back to
# whatever "node" resolves to on launchd's own minimal PATH, which is only
# reliable if node was installed system-wide (Homebrew's /opt/homebrew/bin
# or /usr/local/bin, both of which are NOT on launchd's default PATH either
# -- so in practice NODE_BIN should almost always be set explicitly. Leaving
# the fallback in rather than hard-failing so a first run's error message
# names the missing PATH instead of this script silently doing nothing.
NODE_BIN="${NODE_BIN:-node}"

cd "$SHIN_REPO_DIR/app" || exit 1
exec "$NODE_BIN" server.ts
