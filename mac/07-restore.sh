#!/bin/sh
# mac/07-restore.sh -- item 1g, second half.
#
# Restores a backup mac/07-backup.sh made, into a CLEAN target folder, then
# verifies every restored sqlite database's per-table row counts, every
# plain file's size and every folder's file count against that backup's
# manifest.tsv. "The backup works" is not a fact until something outside
# the backup script itself proves it -- this is that something.
#
# Refuses two targets on purpose: a non-empty directory (so a restore can
# never silently merge into or overwrite something already there) and the
# live SHIN_DATA_DIR (so a restore can never overwrite the running
# server's real data -- restore into a throwaway path, look at it, then
# move it into place by hand if that is really what is wanted).
#
# Usage:
#   mac/07-restore.sh <backup-name-or-path> <clean-target-dir> [config.env]
# <backup-name-or-path> is either a timestamp folder name under
# $SHIN_BACKUP_DIR (e.g. 20260928-040000) or a direct path to a backup
# folder (anything containing a manifest.tsv). With no config.env
# argument, sources mac/config.env next to this script, same as
# mac/07-backup.sh.

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

usage() {
  echo "usage: 07-restore.sh <backup-name-or-path> <clean-target-dir> [config.env]" >&2
  exit 2
}

[ $# -ge 2 ] || usage
BACKUP_ARG=$1
TARGET=$2
CONFIG_FILE="${3:-$SCRIPT_DIR/config.env}"

if [ -f "$CONFIG_FILE" ]; then
  set -a
  . "$CONFIG_FILE"
  set +a
fi

if ! command -v node >/dev/null 2>&1; then
  echo "07-restore.sh: node is not on PATH; node:sqlite is required to verify a restore" >&2
  exit 1
fi

NODE_NO_WARNINGS=1
export NODE_NO_WARNINGS

if [ -d "$BACKUP_ARG" ]; then
  SRC_DIR=$BACKUP_ARG
else
  if [ -z "${SHIN_BACKUP_DIR:-}" ]; then
    echo "07-restore.sh: SHIN_BACKUP_DIR is not set and '$BACKUP_ARG' is not itself a directory" >&2
    exit 1
  fi
  # Same rule as mac/07-backup.sh: a relative SHIN_BACKUP_DIR is refused,
  # not silently resolved against the launch directory -- this is the same
  # variable, sourced from the same config.env, and a corrupted or
  # relative value here would read from the wrong tree just as readily as
  # the backup script would write to or delete the wrong one.
  case "$SHIN_BACKUP_DIR" in
    /*) ;;
    [A-Za-z]:/*) ;;
    *)
      echo "07-restore.sh: SHIN_BACKUP_DIR must be an absolute path, got '$SHIN_BACKUP_DIR' -- refusing to treat it as relative to the working directory" >&2
      exit 1
      ;;
  esac
  SRC_DIR="$SHIN_BACKUP_DIR/$BACKUP_ARG"
fi

if [ ! -d "$SRC_DIR" ]; then
  echo "07-restore.sh: no such backup directory: $SRC_DIR" >&2
  exit 1
fi

MANIFEST="$SRC_DIR/manifest.tsv"
if [ ! -f "$MANIFEST" ]; then
  echo "07-restore.sh: no manifest.tsv in $SRC_DIR -- cannot verify a restore without one" >&2
  exit 1
fi

# Resolve an absolute path even if it does not exist yet, so the
# live-directory refusal below cannot be fooled by a relative path or a
# trailing slash.
abspath() {
  case "$1" in
    /*) _dir=$(dirname -- "$1"); _base=$(basename -- "$1") ;;
    *) _dir="$PWD/$(dirname -- "$1")"; _base=$(basename -- "$1") ;;
  esac
  if [ -d "$_dir" ]; then
    (CDPATH= cd -- "$_dir" && printf '%s/%s\n' "$PWD" "$_base")
  else
    printf '%s/%s\n' "$_dir" "$_base"
  fi
}

TARGET_ABS=$(abspath "$TARGET")

if [ -n "${SHIN_DATA_DIR:-}" ]; then
  LIVE_ABS=$(abspath "$SHIN_DATA_DIR")
  if [ "$TARGET_ABS" = "$LIVE_ABS" ]; then
    echo "07-restore.sh: refusing to restore over the live SHIN_DATA_DIR ($LIVE_ABS)" >&2
    exit 1
  fi
fi

if [ -e "$TARGET" ]; then
  if [ ! -d "$TARGET" ]; then
    echo "07-restore.sh: target exists and is not a directory: $TARGET" >&2
    exit 1
  fi
  if [ -n "$(ls -A "$TARGET" 2>/dev/null)" ]; then
    echo "07-restore.sh: refusing to restore into a non-empty target: $TARGET" >&2
    exit 1
  fi
else
  mkdir -p "$TARGET"
fi

echo "07-restore.sh: restoring $SRC_DIR -> $TARGET"
cp -R "$SRC_DIR/." "$TARGET/"

VERIFY_JS=$(cat <<'JS'
const { DatabaseSync } = require("node:sqlite");
const path = process.argv[1];
try {
  const db = new DatabaseSync(path, { readOnly: true });
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all();
  const parts = [];
  for (const t of tables) {
    const row = db.prepare('SELECT COUNT(*) AS c FROM "' + t.name.replace(/"/g, '""') + '"').get();
    parts.push(t.name + ":" + row.c);
  }
  db.close();
  process.stdout.write(parts.length ? parts.join(",") : "-");
} catch (err) {
  process.stderr.write(String((err && err.stack) || err) + "\n");
  process.exit(1);
}
JS
)

FAILED=0
CHECKED=0
TAB=$(printf '\t')

while IFS="$TAB" read -r type name file size extra; do
  case "$type" in
    \#*|"") continue ;;
  esac
  case "$type" in
    database)
      CHECKED=$((CHECKED + 1))
      restored="$TARGET/$file"
      if [ ! -f "$restored" ]; then
        echo "07-restore.sh: MISMATCH $name -- $restored missing after restore" >&2
        FAILED=1
        continue
      fi
      if actual=$(node -e "$VERIFY_JS" "$restored"); then
        if [ "$actual" = "$extra" ]; then
          echo "07-restore.sh: OK $name ($file): $actual"
        else
          echo "07-restore.sh: MISMATCH $name ($file): manifest says '$extra', restored has '$actual'" >&2
          FAILED=1
        fi
      else
        echo "07-restore.sh: FAILED reading restored $name ($file) -- see node error above" >&2
        FAILED=1
      fi
      ;;
    file)
      CHECKED=$((CHECKED + 1))
      restored="$TARGET/$file"
      if [ ! -f "$restored" ]; then
        echo "07-restore.sh: MISMATCH $name -- $restored missing after restore" >&2
        FAILED=1
        continue
      fi
      actual_size=$(wc -c < "$restored" | tr -d ' ')
      if [ "$actual_size" = "$size" ]; then
        echo "07-restore.sh: OK $name ($file): $actual_size bytes"
      else
        echo "07-restore.sh: MISMATCH $name ($file): manifest says $size bytes, restored has $actual_size" >&2
        FAILED=1
      fi
      ;;
    folder)
      CHECKED=$((CHECKED + 1))
      restored="$TARGET/$file"
      if [ ! -d "$restored" ]; then
        echo "07-restore.sh: MISMATCH $name -- $restored missing after restore" >&2
        FAILED=1
        continue
      fi
      actual_count=$(find "$restored" -type f | wc -l | tr -d ' ')
      want_count=$(echo "$extra" | sed -n 's/^files://p')
      if [ "$actual_count" = "$want_count" ]; then
        echo "07-restore.sh: OK $name ($file): $actual_count files"
      else
        echo "07-restore.sh: MISMATCH $name ($file): manifest says $want_count files, restored has $actual_count" >&2
        FAILED=1
      fi
      ;;
    skipped|failed)
      # This item was already not-backed-up or failed at backup time;
      # nothing to verify on the restore side.
      ;;
    *)
      ;;
  esac
done < "$MANIFEST"

if [ "$CHECKED" -eq 0 ]; then
  echo "07-restore.sh: manifest had nothing to verify (no database/file/folder rows) -- refusing to call this proven" >&2
  exit 1
fi

if [ "$FAILED" -ne 0 ]; then
  echo "07-restore.sh: restore verification FAILED -- see above" >&2
  exit 1
fi

echo "07-restore.sh: OK -- $CHECKED item(s) verified against $MANIFEST"
