#!/bin/sh
# E12. Three checks the founder runs on the Mac: one backup restored, the
# server comes back after being killed, a call without the invite code is
# refused.
#
# Not run. Cannot be run from Windows: every one of the three touches the
# live Mac (its databases, its running process, its own tunnel hostname).
#
# These are meant to be run in this order, by the founder himself, once
# items 1a through 1k are all in place, as the actual exit gate -- not a
# lane's own word that it works.

echo "This script is not run. It is the exact three commands and their"
echo "expected output, for the founder to run on the Mac."
echo

echo "===== Check 1: one backup restored ====="
echo "Same three-step shape as mac/07-restore.sh: restore the newest"
echo "backup to a throwaway path and read a real row out of it."
echo
echo "  LATEST=\$(ls -t \"\$SHIN_BACKUP_DIR\" | head -1)"
echo "  cp \"\$SHIN_BACKUP_DIR/\$LATEST/scans.db\" /tmp/e12-restore-check.db"
echo "  sqlite3 /tmp/e12-restore-check.db 'SELECT COUNT(*) FROM scan;'"
echo "  rm /tmp/e12-restore-check.db"
echo
echo "Expected output: the COUNT query returns a number greater than 0."
echo "This is only meaningful the first time after mac/07-backup.sh has"
echo "actually run at least once with real scans already recorded; if the"
echo "beta has not had a single real scan yet, this check has nothing to"
echo "restore and should wait, not be marked passed on an empty count."

echo
echo "===== Check 2: the server comes back after being killed ====="
echo "This is what mac/launchd/com.shin.server.plist's KeepAlive is for;"
echo "this check is what proves that setting actually does something,"
echo "rather than trusting the plist's own claim."
echo
echo "  launchctl list | grep com.shin.server"
echo "  (note the PID in the first column, call it OLD_PID)"
echo "  kill -9 \$OLD_PID"
echo "  sleep 3"
echo "  launchctl list | grep com.shin.server"
echo "  curl -sS http://localhost:\$PORT/"
echo
echo "Expected output: the second launchctl list shows a DIFFERENT PID"
echo "(proving launchd actually restarted the process, not that it never"
echo "died), and the curl call returns the app's HTML, not a connection"
echo "refused error."

echo
echo "===== Check 3: a call without the invite code is refused ====="
echo "Route, header and env var confirmed by reading app/src/invite.ts and"
echo "app/server.ts directly: the header is x-shin-invite, the env var the"
echo "server reads is SHIN_INVITE_CODE (matches mac/config.env already),"
echo "and /api/identify takes the barcode as a gtin query parameter, not"
echo "barcode."
echo
echo "  curl -sS -o /dev/null -w '%{http_code}\n' \"https://\$SHIN_TUNNEL_HOSTNAME/api/identify?gtin=KNOWN_BARCODE\""
echo "  curl -sS -o /dev/null -w '%{http_code}\n' -H 'x-shin-invite: WRONG_CODE' \"https://\$SHIN_TUNNEL_HOSTNAME/api/identify?gtin=KNOWN_BARCODE\""
echo "  curl -sS -o /dev/null -w '%{http_code}\n' -H \"x-shin-invite: \$SHIN_INVITE_CODE\" \"https://\$SHIN_TUNNEL_HOSTNAME/api/identify?gtin=KNOWN_BARCODE\""
echo
echo "Expected output: the first two calls (no code, wrong code) print a"
echo "non-200 status, never 200; the third call (the real code) prints 200."
echo
echo "ONE REMAINING GAP, found while confirming the above by reading the"
echo "code rather than assuming it: app/src/invite.ts defines the guard"
echo "function (inviteAllows), the header name and the exempt-route list,"
echo "but at the time this was checked app/server.ts had no call to"
echo "inviteAllows anywhere in its request dispatch -- the check existed as"
echo "a module but was not yet wired into any route. Confirm which is true"
echo "before running this check:"
echo "  grep -n inviteAllows \"\$SHIN_REPO_DIR/app/server.ts\""
echo "If that prints nothing, the first two calls above will WRONGLY print"
echo "200 -- that is a real finding (1j not finished, not gating any route"
echo "yet), not a mistake in this script. Report it rather than treating a"
echo "200 as a pass."
