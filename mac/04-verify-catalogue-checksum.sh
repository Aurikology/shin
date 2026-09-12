#!/bin/sh
# 1d. Copy the 4.13 GB catalogue and verify the checksum after the copy.
#
# Not run. Cannot be run from Windows: it checks a file that only exists on
# the Mac once copied there.
#
# The catalogue on this Windows laptop, checked directly, is
# catalogue/data/catalogue.db at exactly 4,130,869,248 bytes (4.13 GB), plus
# the pack files app/src/pack-route.ts serves at runtime
# (catalogue/data/pack-grocery.bin.br, 1.5 MB, and pack-canada.bin.br,
# 6.5 MB). Copy all three; only catalogue.db needs the checksum dance,
# because a corrupted multi-megabyte .br file fails loudly (the server
# refuses to decompress it), while a corrupted multi-gigabyte SQLite file
# can pass a naive size check and still be unreadable, which is exactly the
# founder's own remembered incident (a download once reached the right
# size and still failed to decompress).
#
# Order of operations, all on WINDOWS before this file runs on the Mac:
#   1. node mac/checkpoint-wal.mjs C:\shin\catalogue\data\catalogue.db
#      (folds the WAL journal into the single file being copied)
#   2. powershell -File scripts\mac-catalogue-checksum.ps1 -DbPath C:\shin\catalogue\data\catalogue.db
#      (writes catalogue.db.sha256 next to the database)
#   3. Copy catalogue.db, catalogue.db.sha256, pack-grocery.bin.br and
#      pack-canada.bin.br to the Mac, into
#      "$SHIN_REPO_DIR/catalogue/data/" -- by the same rsync/clone-adjacent
#      path chosen in mac/03-copy-packages.sh, or by external drive if
#      neither Path A nor Path B there is available for a file this size
#      (4+ GB over even a fast LAN is real minutes; an external drive plug
#      is sometimes actually faster).
#
# THIS script is step 4, run on the Mac after that copy finishes.

echo "This script is not run. It is the exact command list for the Mac session."
echo

echo "Step 1. Recompute SHA-256 over the copied file:"
echo "  cd \"\$SHIN_REPO_DIR/catalogue/data\""
echo "  shasum -a 256 catalogue.db"
echo
echo "(shasum, not sha256sum: shasum -a 256 ships with macOS by default,"
echo "sha256sum does not unless coreutils is separately installed.)"

echo
echo "Step 2. Compare against the value Windows computed:"
echo "  cat catalogue.db.sha256"
echo
echo "Expected: the 64 hex characters printed by step 1 match the 64 hex"
echo "characters in catalogue.db.sha256 exactly, character for character."
echo "A shortcut that does the comparison instead of eyeballing it:"
echo
echo "  shasum -a 256 -c catalogue.db.sha256"
echo
echo "Expected output: \"catalogue.db: OK\". Anything else (\"FAILED\", a"
echo "different byte count, a truncated read) means the copy is bad and"
echo "must be redone before the server ever opens this file -- a database"
echo "that opens without erroring but is missing pages or rows is a worse"
echo "failure than one that refuses to open at all, since nothing before"
echo "item E9 (\"the model call counter is unchanged after a banana scan\")"
echo "or a real search would necessarily catch it."

echo
echo "Step 3. Confirm the two pack files arrived intact (smaller, but still"
echo "worth a size check since app/src/pack-route.ts fails loudly if either"
echo "is truncated, which is a cheaper failure mode but still worth catching"
echo "before it does):"
echo "  ls -la pack-grocery.bin.br pack-canada.bin.br"
echo "Expected sizes: pack-grocery.bin.br about 1.5M, pack-canada.bin.br"
echo "about 6.5M (checked directly on Windows at time of writing; a few"
echo "percent drift is fine if a lane has touched the catalogue since, a"
echo "byte count near zero or wildly smaller is not)."
