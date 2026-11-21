#!/bin/sh
# mac/14-offsite-backup.sh -- R07: an ENCRYPTED copy of the nightly backup that lives off this Mac.
#
# Why: the nightly backup (mac/07-backup.sh) sits on the same disk as the live data. A dead SSD, a
# theft or a fire takes both. restic encrypts on this Mac before anything leaves it, so the
# destination never sees a readable shopper phone id, photo or database.
#
#   mac/14-offsite-backup.sh              copy the newest nightly backup, check, prune
#   mac/14-offsite-backup.sh --dry-run    say what it would do, touch nothing
#   mac/14-offsite-backup.sh --init       one time: create the restic repository (needs the destination to exist)
#
# Config (mac/config.env):
#   SHIN_RESTIC_REPOSITORY     where the copies go, e.g. /Volumes/BackupDisk/shin-restic, sftp:user@host:/srv/shin,
#                              b2:bucket:shin, s3:s3.amazonaws.com/bucket/shin. Jamin picks it (docs/readiness/needs-jamin.md).
#   SHIN_RESTIC_PASSWORD_FILE  file holding the repository password, mode 600, owned by worker. The ONLY copy of
#                              this password on this Mac; the master copy is in Jamin's password manager. A repository
#                              without its password is unreadable by design.
#   RESTIC_BIN                 optional, path to restic (default: restic on PATH)
#   SHIN_OFFSITE_MAX_AGE_H     optional, the newest nightly backup must be younger than this (default 36)
#
# Retention in the repository: every snapshot from the last 15 days (restic forget --keep-within 15d --prune), the
# same "about 15 days" the privacy policy tells shoppers. The
# nightly folder on this Mac keeps its own 14 nights (07-backup.sh).
#
# Loud failure: health marker `offsite` (mac/lib/health.sh). The EXIT trap makes every early exit
# leave offsite.FAILED, so a missing password file or an unreachable destination is never only a log line.
# Not verified on a Mac from this PC: restic's exact messages. The script only relies on restic's exit status.

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DRY=0
INIT=0
for _a in "$@"; do
  case "$_a" in
    --dry-run) DRY=1 ;;
    --init) INIT=1 ;;
    *) echo "14-offsite-backup.sh: unknown argument '$_a'" >&2; exit 2 ;;
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
if [ "$DRY" = 0 ]; then
  trap '_rc=$?; if [ "$DONE" != 1 ]; then health_fail offsite "14-offsite-backup.sh stopped before it finished (exit $_rc); see mac/logs/offsite.err.log"; fi' EXIT
fi

die() {
  echo "14-offsite-backup.sh: $1" >&2
  if [ "$DRY" = 1 ]; then
    echo "14-offsite-backup.sh: (dry run) this would be a FAILURE" >&2
  fi
  exit 1
}

RESTIC="${RESTIC_BIN:-restic}"
command -v "$RESTIC" >/dev/null 2>&1 || die "restic not found ($RESTIC). Install it: brew install restic (needs-jamin.md step)"
[ -n "${SHIN_RESTIC_REPOSITORY:-}" ] || die "SHIN_RESTIC_REPOSITORY is not set in config.env (Jamin picks the destination)"
[ -n "${SHIN_RESTIC_PASSWORD_FILE:-}" ] || die "SHIN_RESTIC_PASSWORD_FILE is not set in config.env"
[ -f "$SHIN_RESTIC_PASSWORD_FILE" ] || die "password file $SHIN_RESTIC_PASSWORD_FILE does not exist"
[ -s "$SHIN_RESTIC_PASSWORD_FILE" ] || die "password file $SHIN_RESTIC_PASSWORD_FILE is empty"
[ -n "${SHIN_BACKUP_DIR:-}" ] || die "SHIN_BACKUP_DIR is not set"
[ -d "$SHIN_BACKUP_DIR" ] || die "SHIN_BACKUP_DIR $SHIN_BACKUP_DIR does not exist"

RESTIC_REPOSITORY=$SHIN_RESTIC_REPOSITORY
RESTIC_PASSWORD_FILE=$SHIN_RESTIC_PASSWORD_FILE
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE

if [ "$INIT" = 1 ]; then
  if [ "$DRY" = 1 ]; then
    echo "14-offsite-backup.sh (dry run): would run: $RESTIC init   (repository $RESTIC_REPOSITORY)"
    exit 0
  fi
  "$RESTIC" init || die "restic init failed"
  DONE=1
  echo "14-offsite-backup.sh: repository created. Write the password somewhere that is not this Mac."
  exit 0
fi

# Newest nightly folder: names are YYYYmmdd-HHMMSS, so the last in sort order is the newest.
NEWEST=''
for _d in "$SHIN_BACKUP_DIR"/[0-9]*-[0-9]*; do
  [ -d "$_d" ] && NEWEST=$_d
done
[ -n "$NEWEST" ] || die "no nightly backup found in $SHIN_BACKUP_DIR (has 07-backup.sh ever succeeded?)"
[ -f "$NEWEST/manifest.tsv" ] || die "newest backup $NEWEST has no manifest.tsv (an incomplete backup is never copied off-site)"

# Age: the stamp in the folder name is local time. Compare against the manifest file's own mtime
# so no date arithmetic on names is needed. find -mmin works on macOS and Git Bash.
MAX_H="${SHIN_OFFSITE_MAX_AGE_H:-36}"
MAX_MIN=$((MAX_H * 60))
if [ -z "$(find "$NEWEST/manifest.tsv" -mmin "-$MAX_MIN" 2>/dev/null)" ]; then
  die "newest nightly backup ($NEWEST) is older than $MAX_H hours: last night's backup did not happen, so there is nothing fresh to copy"
fi

if [ "$DRY" = 1 ]; then
  echo "14-offsite-backup.sh (dry run): would copy $NEWEST"
  echo "  into restic repository $RESTIC_REPOSITORY (password file $RESTIC_PASSWORD_FILE)"
  echo "  then: restic check, restic forget --keep-within 15d --prune"
  echo "  and record health marker offsite"
  exit 0
fi

echo "14-offsite-backup.sh: copying $NEWEST"
(
  cd "$NEWEST"
  "$RESTIC" backup . --tag shin-nightly --host shin-mac --quiet
) || die "restic backup failed (destination unreachable, wrong password file, or repository not initialised: run --init once)"

echo "14-offsite-backup.sh: checking the repository"
"$RESTIC" check || die "restic check failed: the off-site repository is damaged; do not prune, investigate"

echo "14-offsite-backup.sh: pruning old snapshots"
"$RESTIC" forget --tag shin-nightly --keep-within 15d --prune --quiet || die "restic forget/prune failed (the new copy IS stored; only the clean-up failed)"

DONE=1
health_ok offsite "copied $(basename "$NEWEST") to $RESTIC_REPOSITORY"
echo "14-offsite-backup.sh: OK"
