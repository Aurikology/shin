#!/bin/sh
# 1c. The five packages on the Mac, installed.
#
# Not run. Cannot be run from Windows: it operates on the Mac's own clone
# and its own npm caches.
#
# FACT, not a plan: a session on the Mac already ran `git status` and
# `git log` there and confirmed the repo is cloned at /Users/worker/shin
# from git@gitlab.com:shin3223636/shin.git, on main at commit 840d70c,
# 149 commits, 392 tracked files, authenticated as @jaminke through an SSH
# key that was already present on that machine -- nothing else to set up,
# no credential to request from the founder. The clone-vs-copy question an
# earlier draft of this file raised is closed: it is already a clone, and
# staying current is one command.
#
# What the clone does NOT carry, because it is not in git: the 10 MB clone
# measured on the Mac is code and tests only. The 4+ GB catalogue and its
# WAL files are a separate step -- see mac/04-catalogue-acquire.md -- and
# must not be assumed to arrive with `git pull`.

echo "This script is not run. It is the exact command list for the Mac session."
echo "Fill in mac/config.env first (SHIN_REPO_DIR; the measured value,"
echo "/Users/worker/shin, is already the default in config.env.example)."
echo

echo "Step 1. Stay current. Run this before every restart of the server,"
echo "not just once tonight, since other lanes are landing commits all"
echo "weekend:"
echo "  cd \"\$SHIN_REPO_DIR\" && git pull"
echo
echo "Expected output: either \"Already up to date.\" or a fast-forward"
echo "summary naming the files that changed. Never a merge conflict (this"
echo "repo's own rule is no branches, everyone works on main); if one"
echo "appears, stop and resolve it in the open rather than guessing, per"
echo "this repo's own GIT section."
echo
echo "Confirm the clone is what it claims to be, once, the first time:"
echo "  cd \"\$SHIN_REPO_DIR\" && git remote -v && git log -1 --oneline"
echo "Expected: the gitlab.com/shin3223636/shin URL for both fetch and"
echo "push, and a commit hash that is at or after 840d70c."

echo
echo "Step 2. Install each package's own dependencies. CLAUDE.md's own repo"
echo "map is explicit that each of these five carries its own package.json"
echo "and node_modules, and a fresh checkout has none of them installed yet"
echo "(the 10 MB clone size confirms node_modules is not in git either):"
echo
for pkg in app spine price catalogue identify; do
  echo "  cd \"\$SHIN_REPO_DIR/${pkg}\" && npm install"
done
echo
echo "Expected output: each npm install exits 0. A red flag specific to"
echo "this repo (a real prior incident, not a theory): identify's tests"
echo "failing with \"Cannot find package '@anthropic-ai/sdk'\" or app's"
echo "check script failing outright both mean an install was skipped or"
echo "failed silently -- re-run npm install in that one package before"
echo "believing any red result from it."
echo
echo "Do not run the Node version-parity test gate (mac/02-install-node.sh"
echo "step 2) until mac/04-catalogue-acquire.md's transfer has also"
echo "finished, since the packages that read the catalogue need it in"
echo "place for their own tests to mean anything."
