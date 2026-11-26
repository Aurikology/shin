#!/bin/sh
# mac/16-rotate-logs.sh -- R10: the server's output logs must not grow until the disk is full.
#
#   mac/16-rotate-logs.sh             rotate now
#   mac/16-rotate-logs.sh --dry-run   list what it would rotate and delete, change nothing
#
# Run daily at 05:00 by the com.shin.logrotate LaunchDaemon. For every *.log in each log folder:
#   - non-empty: gzip a copy to <name>.log.<YYYYmmdd-HHMMSS>.gz, then EMPTY the live file in place;
#   - archives (<name>.log.<stamp>.gz) of SHIN_LOG_KEEP_DAYS days (default 14) or older are deleted.
# Nothing else in the folder is ever touched or deleted.
#
# Why "empty in place" (copytruncate) and not rename-and-recreate: launchd opens StandardOutPath once
# and the server keeps writing to that open file. A renamed file would keep receiving the server's
# output under the new name while a fresh empty one sat unused. Emptying in place is the only
# rotation that works without restarting the server. Two honest limits:
#   * lines written in the few milliseconds between the copy and the empty are lost;
#   * it relies on launchd opening the log in append mode (as far as I know it does, about 80% sure,
#     NOT verified on this Mac). If it does not, the server's next write lands at its old offset and the
#     file becomes sparse (a run of zero bytes, then the new text): harmless to read, and the size shown
#     by ls is misleading until the next rotation. The first-night check is in mac/README.md.
#
# Folders: SHIN_LOG_DIRS (separated by |, each must exist) else $SHIN_REPO_DIR/mac/logs, plus
# ~/.shin-deploy/logs when that exists (the deploy checker's own log).
#
# Loud failure: health marker `logrotate` (logrotate.FAILED while failing). A full disk is also caught
# by the separate disk marker (mac/nightly-checks.mjs).

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DRY=0
for _a in "$@"; do
  case "$_a" in
    --dry-run) DRY=1 ;;
    *) echo "16-rotate-logs.sh: unknown argument '$_a'" >&2; exit 2 ;;
  esac
done

CONFIG_FILE="${SHIN_CONFIG_FILE:-$SCRIPT_DIR/config.env}"
if [ -f "$CONFIG_FILE" ]; then
  set -a
  . "$CONFIG_FILE"
  set +a
fi
# shellcheck source=lib/health.sh
. "$SCRIPT_DIR/lib/health.sh"

DONE=0
FAILS=''
if [ "$DRY" = 0 ]; then
  trap '_rc=$?; if [ "$DONE" != 1 ]; then health_fail logrotate "16-rotate-logs.sh stopped before it finished (exit $_rc)${FAILS:+: $FAILS}"; fi' EXIT
fi

KEEP="${SHIN_LOG_KEEP_DAYS:-14}"
case "$KEEP" in
  ''|*[!0-9]*) echo "16-rotate-logs.sh: SHIN_LOG_KEEP_DAYS must be a whole number, got '$KEEP'" >&2; exit 1 ;;
esac
[ "$KEEP" -ge 1 ] || { echo "16-rotate-logs.sh: SHIN_LOG_KEEP_DAYS must be at least 1" >&2; exit 1; }
# The privacy document keeps request logs 90 days at most (app/src/retention.ts), and these logs carry the
# same request lines, so no setting can keep an archive longer than that.
if [ "$KEEP" -gt 90 ]; then
  echo "16-rotate-logs.sh: SHIN_LOG_KEEP_DAYS=$KEEP is over the 90 days the privacy document promises; using 90" >&2
  KEEP=90
fi
OLDER=$((KEEP - 1)) # find -mtime +N means "more than N whole days old", i.e. KEEP days or older when N = KEEP-1

if [ -n "${SHIN_LOG_DIRS:-}" ]; then
  DIRS=$SHIN_LOG_DIRS
else
  DIRS="${SHIN_REPO_DIR:-$SCRIPT_DIR/..}/mac/logs"
  [ -d "$HOME/.shin-deploy/logs" ] && DIRS="$DIRS|$HOME/.shin-deploy/logs"
fi

STAMP=$(date +%Y%m%d-%H%M%S)
ROTATED=0
DELETED=0

OLD_IFS=$IFS
IFS="|"
for D in $DIRS; do
  IFS=$OLD_IFS
  if [ ! -d "$D" ]; then
    echo "16-rotate-logs.sh: log folder $D does not exist" >&2
    FAILS="${FAILS:+$FAILS; }$D does not exist"
    IFS="|"
    continue
  fi
  for F in "$D"/*.log; do
    [ -f "$F" ] || continue
    [ -s "$F" ] || continue
    if [ "$DRY" = 1 ]; then
      echo "16-rotate-logs.sh (dry run): would rotate $F ($(wc -c < "$F" | tr -d ' ') bytes) to $F.$STAMP.gz"
      continue
    fi
    ARCH="$F.$STAMP.gz"
    if gzip -c "$F" > "$ARCH.tmp" && gzip -t "$ARCH.tmp"; then
      : > "$F"
      mv "$ARCH.tmp" "$ARCH"
      ROTATED=$((ROTATED + 1))
      echo "16-rotate-logs.sh: rotated $F"
    else
      rm -f "$ARCH.tmp"
      echo "16-rotate-logs.sh: could not archive $F (left as it is)" >&2
      FAILS="${FAILS:+$FAILS; }could not archive $(basename "$F")"
    fi
  done
  # Old archives. Only files named <something>.log.<digits>-<digits>.gz are ever deleted.
  find "$D" -maxdepth 1 -type f -name '*.log.[0-9]*-[0-9]*.gz' -mtime "+$OLDER" 2>/dev/null | while IFS= read -r OLDF; do
    if [ "$DRY" = 1 ]; then
      echo "16-rotate-logs.sh (dry run): would delete $OLDF"
    else
      rm -f "$OLDF" && echo "16-rotate-logs.sh: deleted $OLDF"
    fi
  done
  IFS="|"
done
IFS=$OLD_IFS

if [ "$DRY" = 1 ]; then
  echo "16-rotate-logs.sh (dry run): nothing changed, no marker written"
  [ -z "$FAILS" ] || exit 1
  exit 0
fi

if [ -n "$FAILS" ]; then
  echo "16-rotate-logs.sh: FAILED: $FAILS" >&2
  health_fail logrotate "$FAILS"
  DONE=1
  exit 1
fi
DONE=1
health_ok logrotate "rotated $ROTATED log(s), keeping $KEEP days"
echo "16-rotate-logs.sh: OK, rotated $ROTATED log(s)"
