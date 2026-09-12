#!/bin/sh
# 1e. Run the server (and, only in the rare fallback, the tunnel client)
# under a process manager that restarts them.
#
# Not run. Cannot be run from Windows: launchctl and the log paths only
# exist on the Mac.
#
# The primary tunnel path (mac/01-cloudflare-tunnel.md step 4,
# `sudo cloudflared service install`, using the certificate already on
# this Mac from `cloudflared tunnel login`) already installs and starts
# its own launchd daemon for the tunnel -- this script does NOT touch that.
# This script installs only the server's LaunchAgent
# (mac/launchd/com.shin.server.plist), and, ONLY if `cloudflared service
# install` itself cannot be used for some reason, the tunnel's LaunchAgent
# (mac/launchd/com.shin.tunnel.plist) as a hand-rolled fallback.

echo "This script is not run. It is the exact command list for the Mac session."
echo "Fill in mac/config.env first (SHIN_REPO_DIR at minimum, NODE_BIN if"
echo "the nvm fallback in 02-install-node.sh step 3 was used)."
echo

echo "Step 1. Make the log directory the plists write to:"
echo "  mkdir -p \"\$SHIN_REPO_DIR/mac/logs\""

echo
echo "Step 2. Make run-server.sh executable:"
echo "  chmod +x \"\$SHIN_REPO_DIR/mac/run-server.sh\""

echo
echo "Step 3. Substitute the real repo path into the server plist and"
echo "install it (sed writes a filled copy, the template in mac/launchd/"
echo "stays a template, and this is why the template is never loaded"
echo "directly):"
echo "  sed \"s|__SHIN_REPO_DIR__|\$SHIN_REPO_DIR|g\" \\"
echo "    \"\$SHIN_REPO_DIR/mac/launchd/com.shin.server.plist\" \\"
echo "    > ~/Library/LaunchAgents/com.shin.server.plist"
echo "  launchctl load ~/Library/LaunchAgents/com.shin.server.plist"
echo
echo "Expected output from load: nothing (silence is success for"
echo "launchctl load). Proof it is actually running:"
echo "  launchctl list | grep com.shin.server"
echo "Expected: one line, PID in the first column, not \"-\". Then:"
echo "  curl -sS http://localhost:\$PORT/"
echo "Expected: HTML back (the app's own index page), not a connection"
echo "refused error."

echo
echo "===== ONLY if \`cloudflared service install\` (mac/01-cloudflare-tunnel.md"
echo "step 4) could not be used and the tunnel must be launched by hand: ====="
echo "Step 4. Find where cloudflared actually installed:"
echo "  which cloudflared"
echo "Step 5. Substitute that path, the tunnel name, and the repo path,"
echo "then install:"
echo "  sed -e \"s|__CLOUDFLARED_BIN__|\$(which cloudflared)|g\" \\"
echo "      -e \"s|__TUNNEL_NAME__|\$CLOUDFLARE_TUNNEL_NAME|g\" \\"
echo "      -e \"s|__SHIN_REPO_DIR__|\$SHIN_REPO_DIR|g\" \\"
echo "    \"\$SHIN_REPO_DIR/mac/launchd/com.shin.tunnel.plist\" \\"
echo "    > ~/Library/LaunchAgents/com.shin.tunnel.plist"
echo "  launchctl load ~/Library/LaunchAgents/com.shin.tunnel.plist"
echo
echo "Expected output and proof: same pattern as step 3, substituting"
echo "com.shin.tunnel for com.shin.server in both the grep and the load"
echo "check."

echo
echo "NOTE carried forward from the plist template's own comment: this"
echo "installs a LaunchAgent, which only starts after someone is logged in"
echo "on the Mac. If the founder wants the server to survive a full reboot"
echo "with nobody logged in (not just a kill of the process, which is what"
echo "E12 actually asks for), that needs a LaunchDaemon in"
echo "/Library/LaunchDaemons instead, installed with sudo, with a"
echo "UserName key added so it still runs as him. That is a different"
echo "install step than the one above and is not written here since it"
echo "was not asked for; flagging it rather than assuming either way."
