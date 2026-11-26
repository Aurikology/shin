#!/bin/sh
# linux/notify-stop.sh -- ExecStopPost of pexi-server.service: say so when the server stopped for a bad reason.
#
# systemd sets SERVICE_RESULT: "success" for a normal stop or a `systemctl restart` (a deploy), anything
# else (exit-code, signal, core-dump, timeout, oom-kill) for a crash. A crash loop restarts every 5 s
# (Restart=always), so this can run many times; the alert service collapses repeats (one check per job on
# Healthchecks, which mails only when a check changes to down).

set -eu

RESULT="${SERVICE_RESULT:-unknown}"
[ "$RESULT" = "success" ] && exit 0

REPO="${SHIN_REPO_DIR:-/opt/pexi/live}"
NODE="${NODE_BIN:-/usr/local/bin/node}"
DETAIL="pexi-server stopped: result=$RESULT exit_code=${EXIT_CODE:-?} exit_status=${EXIT_STATUS:-?} at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Best effort: a failed alert must never stop systemd from restarting the server.
"$NODE" "$REPO/linux/alert.mjs" fail server-crash "$DETAIL" || true
exit 0
