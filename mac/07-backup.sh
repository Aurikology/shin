#!/bin/sh
# mac/07-backup.sh -- item 1g, first half.
#
# A REAL, RUNNABLE nightly backup. Backs up every database and store the
# running server writes at runtime, into $SHIN_BACKUP_DIR/<timestamp>/,
# plus a manifest.tsv (file, size, per-table row counts) that
# mac/07-restore.sh checks a restore against.
#
# What this covers, read from settings/src/index.ts (the one place every
# SHIN_* env var the live code reads is listed) and mac/config.env.example:
#   sqlite databases (VACUUM INTO, see below): SHIN_SCANS, SHIN_REPEAT_CACHE,
#     SHIN_PEOPLE_DB, SHIN_PRICES, SHIN_CORRECTIONS, SHIN_GAPS,
#     SHIN_USER_CATALOGUE
#   small JSON stores (plain copy): SHIN_SPEND_CAP_STORE_PATH,
#     SHIN_RANGE_ASK_STORE_PATH
#   the access log (plain copy): SHIN_ACCESS_LOG
#   folders of image files (plain copy): SHIN_PHOTOS, SHIN_SHUTTER_DIR
#
# What this SKIPS, on purpose: SHIN_CATALOGUE (catalogue.db). It is
# read-only at runtime -- nothing in app/, price/ or catalogue/'s runtime
# code writes to it, only the offline load/embed/infer scripts do, and none
# of those run on the beta Mac -- and it is ~4 GB, which would make a
# nightly backup take longer than the night. If it is ever lost, it is
# reacquired the same way mac/04-catalogue-acquire.md describes, not
# restored from here.
#
# A var not set in mac/config.env is treated as "not configured on this
# deployment" and skipped (noted in the manifest), not as a failure -- this
# is also what lets a small test config back up just the two or three
# stores it actually created. A var that IS set but whose file is missing
# IS a failure: it means a database the server is supposed to be writing
# is not there, and the script exits non-zero rather than silently
# producing a partial backup that looks complete.
#
# Each sqlite database is opened read-only and copied with SQLite's own
# VACUUM INTO (node:sqlite's DatabaseSync, since node is always present on
# this box -- the server itself requires it). VACUUM INTO is SQLite's
# supported online-backup equivalent to the old `sqlite3 db .backup`
# command: it reads a consistent snapshot even while the server holds the
# file open in WAL mode (catalogue/src/schema.ts, catalogue/src/gaps.ts and
# app/src/scans.ts all set PRAGMA journal_mode = WAL). A plain `cp` of a
# live .db file can copy it mid-write and silently produce a torn,
# unusable copy -- this script never does that to a .db file. Image files
# in the photos/shutter folders do not have this problem (a JPEG is
# written once, atomically, by the shutter/photo code, then never touched
# again) so those are a plain recursive copy, which item 5 of the brief
# that asked for this script explicitly allows.
#
# The two small JSON stores (spend-cap.json, range-ask.json) and the
# access log are also plain copies. This is a considered simplification,
# not an oversight: VACUUM INTO is a SQLite operation and does not apply
# to a JSON file, these files are small and written rarely (a spend
# increment, a monthly cap reset, one log line per request) compared to a
# live WAL database under constant read/write traffic, and a torn read of
# a single small write is a real but much smaller risk than of a live
# multi-file WAL database. If that risk ever matters, the fix is the
# app writing these through write-then-rename, not this script.
#
# Usage:
#   mac/07-backup.sh [path-to-config.env]
# With no argument, sources mac/config.env next to this script (the same
# convention every other mac/*.sh script uses). Every var above must be set
# there for a full production backup; an unset one is skipped, not failed.

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

CONFIG_FILE="${1:-$SCRIPT_DIR/config.env}"
if [ -f "$CONFIG_FILE" ]; then
  set -a
  . "$CONFIG_FILE"
  set +a
fi

if [ -z "${SHIN_BACKUP_DIR:-}" ]; then
  echo "07-backup.sh: SHIN_BACKUP_DIR is not set (fill it in config.env first)" >&2
  exit 1
fi

# A relative SHIN_BACKUP_DIR is refused outright, not silently resolved
# against whatever directory this happened to be launched from. This
# script both creates (mkdir -p) and DELETES (the pruning step's rm -rf)
# inside $SHIN_BACKUP_DIR -- a relative value landing on an unintended
# working directory is not a cosmetic bug, it is this script creating or
# deleting the wrong folder tree. Accepts a POSIX absolute path (/...,
# what config.env.example and every real Mac deployment use) or a Windows
# drive-letter absolute path (C:/..., only ever seen running this script
# under Git Bash for a test on this PC, never in production).
case "$SHIN_BACKUP_DIR" in
  /*) ;;
  [A-Za-z]:/*) ;;
  *)
    echo "07-backup.sh: SHIN_BACKUP_DIR must be an absolute path, got '$SHIN_BACKUP_DIR' -- refusing to treat it as relative to the working directory" >&2
    exit 1
    ;;
esac

if ! command -v node >/dev/null 2>&1; then
  echo "07-backup.sh: node is not on PATH; node:sqlite is required for a live-safe backup" >&2
  exit 1
fi

NODE_NO_WARNINGS=1
export NODE_NO_WARNINGS

mkdir -p "$SHIN_BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
DEST="$SHIN_BACKUP_DIR/$STAMP"
mkdir -p "$DEST"

FAILED=0
MANIFEST="$DEST/manifest.tsv"
TAB=$(printf '\t')
{
  printf '# shin backup manifest\n'
  printf '# created %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '# type%sname%sfile%ssize_bytes%sextra\n' "$TAB" "$TAB" "$TAB" "$TAB"
} > "$MANIFEST"

# node:sqlite VACUUM INTO one database, then read back table:count pairs
# from the COPY (never the live source, so this never re-touches a live
# WAL file after the snapshot is taken). Single-quoted SQL literal,
# internal single quotes doubled, since VACUUM INTO needs a string
# literal, not a bareword/identifier.
BACKUP_ONE_JS=$(cat <<'JS'
const { DatabaseSync } = require("node:sqlite");
const [src, dest] = process.argv.slice(1);
try {
  const db = new DatabaseSync(src, { readOnly: true });
  const lit = dest.replace(/'/g, "''");
  db.exec("VACUUM INTO '" + lit + "'");
  db.close();
  const out = new DatabaseSync(dest, { readOnly: true });
  const tables = out.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all();
  const parts = [];
  for (const t of tables) {
    const row = out.prepare('SELECT COUNT(*) AS c FROM "' + t.name.replace(/"/g, '""') + '"').get();
    parts.push(t.name + ":" + row.c);
  }
  out.close();
  process.stdout.write(parts.length ? parts.join(",") : "-");
} catch (err) {
  process.stderr.write(String((err && err.stack) || err) + "\n");
  process.exit(1);
}
JS
)

backup_sqlite() {
  # $1 = manifest name  $2 = env var NAME holding the source path  $3 = dest filename
  _name=$1; _envvar=$2; _destfile=$3
  eval "_src=\${$_envvar:-}"
  if [ -z "$_src" ]; then
    echo "07-backup.sh: $_envvar not set; skipping $_name" >&2
    printf 'skipped\t%s\t-\t-\t%s not set\n' "$_name" "$_envvar" >> "$MANIFEST"
    return 0
  fi
  if [ ! -f "$_src" ]; then
    echo "07-backup.sh: FAILED $_name -- $_envvar=$_src does not exist" >&2
    printf 'failed\t%s\t%s\t-\tsource missing\n' "$_name" "$_src" >> "$MANIFEST"
    FAILED=1
    return 0
  fi
  _destpath="$DEST/$_destfile"
  if _tables=$(node -e "$BACKUP_ONE_JS" "$_src" "$_destpath"); then
    _size=$(wc -c < "$_destpath" | tr -d ' ')
    printf 'database\t%s\t%s\t%s\t%s\n' "$_name" "$_destfile" "$_size" "$_tables" >> "$MANIFEST"
    echo "07-backup.sh: backed up $_name ($_src -> $_destfile, $_size bytes, tables: $_tables)"
  else
    echo "07-backup.sh: FAILED $_name -- VACUUM INTO $_src -> $_destpath (see node error above)" >&2
    printf 'failed\t%s\t%s\t-\tvacuum into failed\n' "$_name" "$_src" >> "$MANIFEST"
    FAILED=1
  fi
}

backup_file() {
  # Plain copy: JSON stores and the access log. $1 name $2 envvar $3 dest filename
  _name=$1; _envvar=$2; _destfile=$3
  eval "_src=\${$_envvar:-}"
  if [ -z "$_src" ]; then
    echo "07-backup.sh: $_envvar not set; skipping $_name" >&2
    printf 'skipped\t%s\t-\t-\t%s not set\n' "$_name" "$_envvar" >> "$MANIFEST"
    return 0
  fi
  if [ ! -f "$_src" ]; then
    echo "07-backup.sh: FAILED $_name -- $_envvar=$_src does not exist" >&2
    printf 'failed\t%s\t%s\t-\tsource missing\n' "$_name" "$_src" >> "$MANIFEST"
    FAILED=1
    return 0
  fi
  _destpath="$DEST/$_destfile"
  if cp "$_src" "$_destpath"; then
    _size=$(wc -c < "$_destpath" | tr -d ' ')
    printf 'file\t%s\t%s\t%s\t-\n' "$_name" "$_destfile" "$_size" >> "$MANIFEST"
    echo "07-backup.sh: backed up $_name ($_src -> $_destfile, $_size bytes)"
  else
    echo "07-backup.sh: FAILED $_name -- copy $_src -> $_destpath" >&2
    printf 'failed\t%s\t%s\t-\tcopy failed\n' "$_name" "$_src" >> "$MANIFEST"
    FAILED=1
  fi
}

backup_dir() {
  # Plain recursive copy: image folders. $1 name $2 envvar $3 dest subfolder name
  _name=$1; _envvar=$2; _destsub=$3
  eval "_src=\${$_envvar:-}"
  if [ -z "$_src" ]; then
    echo "07-backup.sh: $_envvar not set; skipping $_name" >&2
    printf 'skipped\t%s\t-\t-\t%s not set\n' "$_name" "$_envvar" >> "$MANIFEST"
    return 0
  fi
  if [ ! -d "$_src" ]; then
    echo "07-backup.sh: FAILED $_name -- $_envvar=$_src is not a directory" >&2
    printf 'failed\t%s\t%s\t-\tsource missing\n' "$_name" "$_src" >> "$MANIFEST"
    FAILED=1
    return 0
  fi
  _destpath="$DEST/$_destsub"
  if mkdir -p "$_destpath" && cp -R "$_src/." "$_destpath/"; then
    _count=$(find "$_destpath" -type f | wc -l | tr -d ' ')
    _size=$(find "$_destpath" -type f -exec wc -c {} + 2>/dev/null | awk '{sum+=$1} END {print sum+0}')
    printf 'folder\t%s\t%s\t%s\tfiles:%s\n' "$_name" "$_destsub" "$_size" "$_count" >> "$MANIFEST"
    echo "07-backup.sh: backed up $_name ($_src -> $_destsub/, $_count files, $_size bytes)"
  else
    echo "07-backup.sh: FAILED $_name -- copy $_src -> $_destpath" >&2
    printf 'failed\t%s\t%s\t-\tcopy failed\n' "$_name" "$_src" >> "$MANIFEST"
    FAILED=1
  fi
}

if [ -n "${SHIN_CATALOGUE:-}" ]; then
  echo "07-backup.sh: skipping SHIN_CATALOGUE ($SHIN_CATALOGUE) -- read-only at runtime, ~4 GB, reacquired per mac/04-catalogue-acquire.md, not backed up here" >&2
  printf 'skipped\tcatalogue\t%s\t-\tread-only, not backed up (item 1g)\n' "$SHIN_CATALOGUE" >> "$MANIFEST"
fi

backup_sqlite scans          SHIN_SCANS               scans.db
backup_sqlite repeat_cache   SHIN_REPEAT_CACHE        repeat-cache.db
backup_sqlite people         SHIN_PEOPLE_DB           people.db
backup_sqlite prices         SHIN_PRICES              prices.db
backup_sqlite corrections    SHIN_CORRECTIONS         corrections.db
backup_sqlite gaps           SHIN_GAPS                gaps.db
backup_sqlite user_catalogue SHIN_USER_CATALOGUE      user-catalogue.db

backup_file spend_cap   SHIN_SPEND_CAP_STORE_PATH  spend-cap.json
backup_file range_ask   SHIN_RANGE_ASK_STORE_PATH  range-ask.json
backup_file access_log  SHIN_ACCESS_LOG            access.log

backup_dir photos   SHIN_PHOTOS        photos
backup_dir shutter  SHIN_SHUTTER_DIR   shutter

# Keep the newest 14 backups, remove older ones -- ONLY directory entries
# directly under $SHIN_BACKUP_DIR whose name matches this script's own
# timestamp pattern exactly (case is a full-string match, not a prefix or
# substring match), so this can never reach into a folder it did not
# create or touch anything outside $SHIN_BACKUP_DIR.
prune_old_backups() {
  _count=0
  for _d in $(ls -1 "$SHIN_BACKUP_DIR" 2>/dev/null | LC_ALL=C sort -r); do
    case "$_d" in
      [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9])
        _count=$((_count + 1))
        if [ "$_count" -gt 14 ]; then
          _target="$SHIN_BACKUP_DIR/$_d"
          if [ -d "$_target" ]; then
            echo "07-backup.sh: pruning old backup $_target"
            rm -rf -- "$_target"
          fi
        fi
        ;;
      *)
        ;;
    esac
  done
}
prune_old_backups

if [ "$FAILED" -ne 0 ]; then
  echo "07-backup.sh: one or more backups FAILED -- see above. Partial backup left at: $DEST" >&2
  exit 1
fi

echo "07-backup.sh: OK -- backup complete: $DEST"
echo "07-backup.sh: manifest: $MANIFEST"
