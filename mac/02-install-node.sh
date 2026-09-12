#!/bin/sh
# 1b. The same Node major the tests run on, and the risk that "same major"
# is not enough.
#
# Not run. Cannot be run from Windows: it checks and if needed changes
# software on the Mac.
#
# UPDATED after the Mac inventory (a session on the Mac ran `node --version`
# for real): the Mac already has node v26.7.0 and npm 11.19.0. This Windows
# laptop, where the code was written and tested, runs node v24.14.0. Every
# package's engines field only says ">=22.18" (app/package.json,
# spine/package.json, price/package.json, catalogue/package.json,
# identify/package.json, all identical), so v26.7.0 satisfies the written
# floor. That is not the same claim as "the tests pass on it."
#
# The real risk: app/server.ts, app/src/scans.ts, price/src/corrections.ts,
# price/src/store.ts and catalogue/src/schema.ts (at least five files) all
# import `DatabaseSync` from `node:sqlite`, which Node itself still ships as
# an evolving API (it moved from experimental to stable across Node 22's
# life and its shape has changed between majors). A test run on this
# Windows laptop's v24.14.0 is evidence for v24, not for v26. So node
# version parity is not a install-and-move-on step, it is a gate: the full
# test suite of every package has to actually run, and pass, on the Mac's
# own Node before the server is ever pointed at the tunnel.

echo "This script is not run. It is the exact command list for the Mac session."
echo

echo "Step 1. Confirm what is actually on the Mac (do this first, do not"
echo "assume the inventory number is still current if time has passed):"
echo "  node --version"
echo "  npm --version"
echo "Expected: v22.18.0 or higher. The inventory found v26.7.0, which"
echo "clears that floor; if a different Mac or a later check shows less"
echo "than v22.18, stop and install a newer Node before continuing (brew"
echo "install node, or nvm install --lts, either is fine for a floor-only"
echo "requirement -- the gate below is what actually decides if it is safe,"
echo "not this number)."

echo
echo "Step 2. THE GATE. Run the real test suite of every package on the"
echo "Mac's Node, not just a typecheck. Run this from SHIN_REPO_DIR after"
echo "mac/03-copy-packages.sh has put the code and node_modules there:"
echo
echo "  cd \"\$SHIN_REPO_DIR/spine\"     && npm run check"
echo "  cd \"\$SHIN_REPO_DIR/price\"     && npm run check"
echo "  cd \"\$SHIN_REPO_DIR/catalogue\" && npm run check"
echo "  cd \"\$SHIN_REPO_DIR/identify\"  && npm run check"
echo "  cd \"\$SHIN_REPO_DIR/app\"       && npm run check"
echo
echo "(check that each package.json actually defines a \"check\" script"
echo "before relying on this; app/package.json's is \"npm run typecheck &&"
echo "npm test\" as of this write-up. If a package's script name differs,"
echo "run its typecheck and test scripts separately instead.)"
echo
echo "Expected output: every one of the five exits 0, with no failing test"
echo "named. Pay special attention to any failure whose message mentions"
echo "sqlite, DatabaseSync, or a SQLITE_ error code -- that is exactly the"
echo "node:sqlite shape-change risk this gate exists to catch, and it means"
echo "do not proceed to running the server until step 3 is done."

echo
echo "Step 3. FALLBACK if step 2 fails and the failure looks like a"
echo "node:sqlite or DatabaseSync problem: pin the Mac to the same major"
echo "and minor this was written and tested on, node 24, with nvm, rather"
echo "than trying to patch code against an API that changed underneath it."
echo
echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
echo "  (open a new terminal, or: . \"\$HOME/.nvm/nvm.sh\")"
echo "  nvm install 24.14.0"
echo "  nvm alias default 24.14.0"
echo "  node --version"
echo
echo "Expected output after this: node --version prints v24.14.0. Then"
echo "repeat step 2's five \"npm run check\" commands in a NEW terminal"
echo "(nvm's alias only takes effect in shells opened after it is set)."
echo "This also means whatever process manager runs the server long-term"
echo "(mac/launchd/com.shin.server.plist) must point at the nvm-installed"
echo "node binary's absolute path, not a bare \"node\" on PATH, since"
echo "launchd does not read the interactive shell's nvm setup. Find the"
echo "path with: nvm which 24.14.0"

echo
echo "Step 4. Whichever Node ends up in use, confirm node:sqlite loads at"
echo "all (loading is necessary but not sufficient -- step 2 is the real"
echo "check):"
echo "  node --input-type=module -e \"import('node:sqlite').then(() => console.log('node:sqlite OK')).catch((e) => console.log('MISSING:', e.message))\""
echo "Expected output: node:sqlite OK"
