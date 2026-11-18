#!/bin/sh
# mac/15-restore-test.sh -- R07 + R52: prove the OFF-SITE copy can actually be restored.
#
# A backup nobody has restored is a hope. Every Sunday this takes the newest snapshot out of the
# encrypted off-site repository (mac/14-offsite-backup.sh), restores it into a temporary folder, and
#   1. checks it is fresh (the manifest inside is under SHIN_RESTORE_TEST_MAX_AGE_H old, default 48),
#   2. runs mac/07-restore.sh on it (every table and folder matches the manifest's counts),
#   3. runs PRAGMA integrity_check on every restored database (mac/nightly-checks.mjs --check-only),
# then deletes the temporary folder. Deletions are NOT re-run here (SHIN_RESTORE_SKIP_REDELETE=1): the
# restored folder never goes into service, and R58's re-deletion belongs to a real restore.
#
#   mac/15-restore-test.sh             run it
#   mac/15-restore-test.sh --dry-run   say what it would do, touch nothing
#
# Loud failure: health marker `restore-test` (restore-test.FAILED while failing). The fix-watch lane
# treats restore-test.json older than 10 days as "the weekly test stopped running".
# Needs room: the restore is a full copy of the newest nightly backup (everything except catalogue.db),
# so the data volume needs that much free. The temp folder is $SHIN_RESTORE_TEST_DIR, else $TMPDIR, else /tmp.
# The restored copy holds real shopper data: the folder is created mode 700 and always removed on exit.

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DRY=0
for _a in "$@"; do
  case "$_a" in
    --dry-run) DRY=1 ;;
    *) echo "15-restore-test.sh: unknown argument '$_a'" >&2; exit 2 ;;
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
TMP=''
cleanup() {
  _rc=$?
  if [ -n "$TMP" ] && [ -d "$TMP" ]; then rm -rf "$TMP"; fi
  if [ "$DRY" = 0 ] && [ "$DONE" != 1 ]; then
    health_fail restore-test "15-restore-test.sh stopped before it finished (exit $_rc); see mac/logs/restore-test.err.log"
  fi
}
trap cleanup EXIT

die() {
  echo "15-restore-test.sh: $1" >&2
  [ "$DRY" = 1 ] && echo "15-restore-test.sh: (dry run) this would be a FAILURE" >&2
  exit 1
}

RESTIC="${RESTIC_BIN:-restic}"
NODE="${NODE_BIN:-node}"
command -v "$RESTIC" >/dev/null 2>&1 || die "restic not found ($RESTIC)"
command -v "$NODE" >/dev/null 2>&1 || die "node not found ($NODE)"
[ -n "${SHIN_RESTIC_REPOSITORY:-}" ] || die "SHIN_RESTIC_REPOSITORY is not set in config.env"
[ -n "${SHIN_RESTIC_PASSWORD_FILE:-}" ] && [ -s "$SHIN_RESTIC_PASSWORD_FILE" ] || die "SHIN_RESTIC_PASSWORD_FILE is unset, missing or empty"

RESTIC_REPOSITORY=$SHIN_RESTIC_REPOSITORY
RESTIC_PASSWORD_FILE=$SHIN_RESTIC_PASSWORD_FILE
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE
NODE_NO_WARNINGS=1
export NODE_NO_WARNINGS

BASE="${SHIN_RESTORE_TEST_DIR:-${TMPDIR:-/tmp}}"
MAX_H="${SHIN_RESTORE_TEST_MAX_AGE_H:-48}"
MAX_MIN=$((MAX_H * 60))

if [ "$DRY" = 1 ]; then
  echo "15-restore-test.sh (dry run): would restore the newest snapshot of $RESTIC_REPOSITORY"
  echo "  into a new mode-700 folder under $BASE, then:"
  echo "  - require its manifest to be under $MAX_H hours old"
  echo "  - run 07-restore.sh on it (SHIN_RESTORE_SKIP_REDELETE=1), then PRAGMA integrity_check on every restored database"
  echo "  - remove the folder, and record health marker restore-test"
  exit 0
fi

umask 077
mkdir -p "$BASE"
TMP=$(mktemp -d "$BASE/shin-restore-test.XXXXXX") || die "cannot create a temp folder under $BASE"

echo "15-restore-test.sh: restoring the newest off-site snapshot into $TMP/raw"
"$RESTIC" restore latest --tag shin-nightly --target "$TMP/raw" || die "restic restore failed (destination unreachable, wrong password, or no snapshot yet)"

MANIFEST=$(find "$TMP/raw" -name manifest.tsv 2>/dev/null | head -n 1)
[ -n "$MANIFEST" ] || die "the restored snapshot contains no manifest.tsv: it is not a nightly backup"
SRC=$(dirname "$MANIFEST")

if [ -z "$(find "$MANIFEST" -mmin "-$MAX_MIN" 2>/dev/null)" ]; then
  die "the newest off-site snapshot is older than $MAX_H hours: the nightly copy to the off-site repository has stopped"
fi

echo "15-restore-test.sh: verifying against the manifest"
SHIN_RESTORE_SKIP_REDELETE=1 sh "$SCRIPT_DIR/07-restore.sh" "$SRC" "$TMP/out" "$CONFIG_FILE" || die "07-restore.sh could not verify the restored copy (see above)"

echo "15-restore-test.sh: integrity check on every restored database"
DBS=''
for _f in "$TMP"/out/*.db; do
  [ -f "$_f" ] && DBS="$DBS $_f"
done
[ -n "$DBS" ] || die "the restored copy contains no database files"
# shellcheck disable=SC2086
"$NODE" "$SCRIPT_DIR/nightly-checks.mjs" --check-only $DBS || die "a restored database failed its integrity check (see above): the off-site copy is damaged"

DONE=1
health_ok restore-test "restored $(basename "$SRC") from $RESTIC_REPOSITORY: manifest and integrity ok"
echo "15-restore-test.sh: OK"
