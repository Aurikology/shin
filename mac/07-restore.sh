#!/bin/sh
# 1g (second half). A restore that is actually run once to prove the
# backup is real.
#
# Not run. Cannot be run from Windows: it restores files that only exist
# on the Mac.
#
# A backup nobody has restored is a claim, not a fact: "the backup works"
# is not true until something outside the backup script itself proves it.
# This restores into a SEPARATE throwaway path, never over the live
# databases, reads a real row out of the restored copy, and only then is
# the backup allowed to be called proven.

echo "This script is not run. It is the exact command list for the Mac session."
echo "Run this the FIRST time only after mac/07-backup.sh has produced at"
echo "least one dated backup folder."
echo

echo "Step 1. Pick the newest backup and restore it into a throwaway"
echo "directory, never over the live databases:"
echo "  LATEST=\$(ls -t \"\$SHIN_BACKUP_DIR\" | head -1)"
echo "  mkdir -p /tmp/shin-restore-proof"
echo "  cp \"\$SHIN_BACKUP_DIR/\$LATEST/scans.db\" /tmp/shin-restore-proof/scans.db"
echo
echo "Expected output: no error, and:"
echo "  ls -la /tmp/shin-restore-proof/scans.db"
echo "shows a nonzero file."

echo
echo "Step 2. Read a real row out of the restored copy, not just its"
echo "existence -- this is the actual proof, since a zero-byte or"
echo "truncated file can still \"exist\":"
echo "  sqlite3 /tmp/shin-restore-proof/scans.db 'SELECT COUNT(*) FROM scan;'"
echo
echo "Expected output: a number greater than 0 (assuming at least one real"
echo "scan has happened on the Mac by the time this runs; if the count is"
echo "genuinely 0 because no tester has scanned anything yet, that is a"
echo "true empty result, not a restore failure -- rerun this same check"
echo "again after the first real scan lands, and do not call the restore"
echo "proven until a nonzero count comes back)."
echo
echo "Then a specific row, to prove the restored file is not just"
echo "structurally valid but actually holds real content:"
echo "  sqlite3 /tmp/shin-restore-proof/scans.db 'SELECT id, device_id, kind, scanned_at FROM scan ORDER BY id DESC LIMIT 1;'"
echo "Expected output: one row, with values that match a real scan you can"
echo "independently remember happening (a device id you recognise, a"
echo "timestamp from earlier today)."

echo
echo "Step 3. Clean up the throwaway copy so it is not mistaken for a live"
echo "database later:"
echo "  rm -rf /tmp/shin-restore-proof"

echo
echo "This exact three-step shape (restore to a throwaway path, count rows,"
echo "read one specific row, delete the throwaway copy) is also E12's first"
echo "check (\"one backup restored\") -- mac/09-e12-checks.sh runs the same"
echo "commands against whichever database currently has the most rows in"
echo "it, so this script and that one should never disagree about what"
echo "\"restored and proven\" looks like."
