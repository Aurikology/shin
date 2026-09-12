#!/bin/sh
# 1g. Nightly backup of the scans, prices, corrections and gaps databases.
#
# Not run. Cannot be run from Windows: it reads live database files that
# only exist on the Mac once the server has been running there.
#
# Backs up the four databases app/server.ts and the price/catalogue
# packages write to at runtime -- SHIN_SCANS, SHIN_PRICES, SHIN_CORRECTIONS,
# SHIN_GAPS, all named in mac/config.env -- NOT the 4.13 GB catalogue,
# which is read-only at runtime (nothing in app/, price/ or catalogue/'s
# runtime code writes to catalogue.db; only the offline load/embed/infer
# scripts do, none of which run on the beta Mac) and would make a nightly
# backup take longer than the night.
#
# Each database is opened in WAL mode by the code that created it
# (catalogue/src/schema.ts, catalogue/src/gaps.ts, app/src/scans.ts all
# call PRAGMA journal_mode = WAL). Copying the .db file alone while the
# server is running can copy a file mid-write; SQLite's own backup API
# handles this correctly where a plain cp does not, which is why this uses
# .backup rather than cp.

echo "This script is not run. It is the exact command list for the Mac session."
echo "Fill in mac/config.env first (all five SHIN_*_DB paths plus SHIN_BACKUP_DIR)."
echo

echo "Run this once by hand to confirm it works, before trusting it to a"
echo "cron/launchd schedule:"
echo
echo "  mkdir -p \"\$SHIN_BACKUP_DIR\""
echo "  STAMP=\$(date +%Y%m%d-%H%M%S)"
echo "  mkdir -p \"\$SHIN_BACKUP_DIR/\$STAMP\""
for var in SHIN_SCANS SHIN_PRICES SHIN_CORRECTIONS SHIN_GAPS; do
  echo "  sqlite3 \"\$${var}\" \".backup '\$SHIN_BACKUP_DIR/\$STAMP/$(echo ${var} | tr '[:upper:]' '[:lower:]' | sed 's/^shin_//').db'\""
done
echo
echo "Expected output: no error from any of the four sqlite3 .backup"
echo "commands, and:"
echo "  ls -la \"\$SHIN_BACKUP_DIR/\$STAMP\""
echo "shows four .db files, each nonzero, each roughly the size of the live"
echo "database it was copied from (a backup a fraction of the live file's"
echo "size is the same silent-truncation risk item 1d's checksum step"
echo "exists for, just with no checksum step written for these four since"
echo "they are small enough that a restore-and-query proof, item 1g's own"
echo "second half, catches it directly instead)."

echo
echo "If sqlite3 is not on the Mac's PATH (macOS has historically shipped"
echo "an old one under a different name in some versions), confirm with:"
echo "  sqlite3 -version"
echo "and if that fails, node's own bundled SQLite can do the same backup:"
echo "  node -e \"const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec(\\\"VACUUM INTO '\\\"+process.argv[2]+\\\"'\\\");db.close();\" \"\$SHIN_SCANS\" \"\$SHIN_BACKUP_DIR/\$STAMP/scans.db\""
echo "(repeat per database; VACUUM INTO is SQLite's own equivalent to"
echo ".backup and is available from the same node:sqlite module already"
echo "required for the server to run at all)."

echo
echo "To run nightly unattended, add a launchd job"
echo "(~/Library/LaunchAgents/com.shin.backup.plist) with a StartCalendarInterval"
echo "instead of RunAtLoad/KeepAlive -- a template is not written here"
echo "since it is a straightforward variant of mac/launchd/com.shin.server.plist"
echo "with Hour/Minute keys added under StartCalendarInterval and this"
echo "script's path in ProgramArguments; set it up only once the by-hand run"
echo "above, and the restore proof in mac/07-restore.sh, have actually run"
echo "and succeeded -- a backup schedule nobody has watched succeed once is"
echo "not yet a backup."
