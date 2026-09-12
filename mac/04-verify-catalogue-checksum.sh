#!/bin/sh
# 1d (Mac half). Verify the catalogue arrived intact -- the exact bytes
# that were hashed on Windows, not just a plausible size.
#
# Not run. Cannot be run from Windows: it reads files that only exist on
# the Mac once mac/04-catalogue-acquire.md's transfer step has finished.
#
# Reads scripts/mac-catalogue-checksum.ps1's manifest
# (catalogue.manifest.sha256) and recomputes SHA-256 over every file it
# names, wherever that file actually landed ($SHIN_DATA_DIR for the
# database set, $SHIN_REPO_DIR/catalogue/data for the two pack files --
# see mac/04-catalogue-acquire.md for why they split).

echo "This script is not run. It is the exact command list for the Mac session."
echo

echo "Step 1. The manifest travelled with the database set into"
echo "\$SHIN_DATA_DIR (mac/04-catalogue-acquire.md step 5). Read it:"
echo "  cat \"\$SHIN_DATA_DIR/catalogue.manifest.sha256\""
echo
echo "Expected: one line per file that was present on Windows at hash"
echo "time, each \"<64 hex chars>  <filename>  <size in bytes>\". At least"
echo "one line, for catalogue.db, always; catalogue.db-wal and"
echo "catalogue.db-shm lines are only present if they were nonzero on"
echo "Windows."

echo
echo "Step 2. Recompute and compare each line named in the manifest. macOS"
echo "ships shasum, not sha256sum:"
echo "  cd \"\$SHIN_DATA_DIR\""
echo "  while read -r expected name size; do"
echo "    actual=\$(shasum -a 256 \"\$name\" | awk '{print \$1}')"
echo "    actual_size=\$(stat -f%z \"\$name\")"
echo "    if [ \"\$actual\" = \"\$expected\" ] && [ \"\$actual_size\" = \"\$size\" ]; then"
echo "      echo \"OK   \$name\""
echo "    else"
echo "      echo \"FAIL \$name  expected \$expected/\$size  got \$actual/\$actual_size\""
echo "    fi"
echo "  done < catalogue.manifest.sha256"
echo
echo "Expected output: \"OK\" on every line the manifest named. Any \"FAIL\""
echo "line means that file did not arrive as hashed -- do not proceed to"
echo "pointing the server at this catalogue, and do not run the Node test"
echo "gate (mac/02-install-node.sh step 2), until the failing file is"
echo "re-transferred and this check is re-run clean. A size match with a"
echo "hash mismatch is exactly this item's own founder-remembered incident:"
echo "a download that reached the right size and still would not"
echo "decompress -- do not treat a size-only match as a pass."

echo
echo "Step 3. Confirm the two pack files landed in the repo clone itself,"
echo "not in \$SHIN_DATA_DIR (app/src/pack-route.ts resolves them relative"
echo "to its own file location, never from an environment variable, so the"
echo "wrong directory here fails silently as a missing-file error the"
echo "first time a screen needing alternatives is opened, not at startup):"
echo "  ls -la \"\$SHIN_REPO_DIR/catalogue/data/pack-grocery.bin.br\" \"\$SHIN_REPO_DIR/catalogue/data/pack-canada.bin.br\""
echo "Expected sizes: pack-grocery.bin.br about 1.5M, pack-canada.bin.br"
echo "about 6.5M (checked directly on Windows at time of writing; a few"
echo "percent drift is fine if a lane has touched the catalogue since, a"
echo "byte count near zero or wildly smaller is not)."

echo
echo "Step 4. Confirm SHIN_CATALOGUE in mac/config.env actually points at"
echo "the file just verified, not somewhere else stale from an earlier"
echo "attempt:"
echo "  ls -la \"\$SHIN_CATALOGUE\""
echo "Expected: the same catalogue.db, same size, in \$SHIN_DATA_DIR."
