#!/bin/sh
# 1c. Get the five packages onto the Mac, and install each one's own
# dependencies.
#
# Not run. Cannot be run from Windows: it needs to execute on the Mac, and
# either a working credential to the private GitLab repo or a working LAN
# path to this Windows laptop, neither of which exists on this machine.
#
# UPDATED after the Mac inventory: a session on the Mac searched
# ~/shin, ~/Documents/shin, ~/Developer/shin, ~/code/shin, ~/src/shin and a
# depth-4 find over /Users/worker and found no clone anywhere, and the Mac
# has no GitLab remote credential of any kind today. So this is a real
# fork, not a formality: two ways to get the code there, and they are not
# equivalent.
#
# ---- Path A: clone. RECOMMENDED. ----
# Needs one input from the founder: authenticate this Mac to
# gitlab.com/shin3223636/shin once. Default if he does not otherwise say:
# a GitLab personal access token, scope read_repository only, generated in
# the GitLab UI (User Settings > Access Tokens), used once for
#   git clone https://oauth2:<token>@gitlab.com/shin3223636/shin.git
# and then cached so it is never typed again:
#   git config --global credential.helper osxkeychain
# A token is the default because it needs no key exchange step and a
# read-only scope cannot push, which matters since a Mac left logged in for
# a beta is not where a stray `git push` should be possible. If the founder
# would rather use an SSH deploy key instead (better if this Mac will also
# need write access later), that is his call to make, not a default this
# script assumes.
#
# Why clone over copy: this repo has lanes landing work in parallel all
# weekend (Server, Client, Spine and price, Catalogue, Identify, per the
# beta build plan's lane table). A one-time copy is stale the moment any of
# those lands a commit. A clone plus `git pull` before each server restart
# keeps the Mac current for the price of one credential.
#
# ---- Path B: copy. Only if a GitLab credential truly cannot be issued
# tonight. ----
# No credential needed, but every one of app/, spine/, price/, catalogue/,
# identify/ has to be re-copied by hand after every lane's commits land, or
# the Mac runs stale code the whole beta and nobody notices until a check
# fails for a reason that is actually "this file was already fixed on
# Windows two hours ago." Use rsync over the LAN (needs OpenSSH Server
# turned on on this Windows laptop, a Windows optional feature, off by
# default) so re-running the same command later only sends what changed.

echo "This script is not run. Two paths follow; PATH A is recommended."
echo "Fill in mac/config.env first (SHIN_REPO_DIR, and for path B,"
echo "WINDOWS_SOURCE_USER / WINDOWS_SOURCE_HOST / WINDOWS_SHIN_REPO_PATH)."
echo

echo "===== PATH A: clone (recommended) ====="
echo "One-time, on the Mac, after the founder has generated a token as"
echo "described above and it is pasted in place of <token>:"
echo
echo "  git config --global credential.helper osxkeychain"
echo "  git clone https://oauth2:<token>@gitlab.com/shin3223636/shin.git \"\$SHIN_REPO_DIR\""
echo
echo "Expected output: a normal git clone progress log ending with no"
echo "error, and afterward:"
echo "  cd \"\$SHIN_REPO_DIR\" && git remote -v"
echo "prints the gitlab.com/shin3223636/shin URL for both fetch and push."
echo
echo "Every later restart (and definitely before E12's kill-and-recover"
echo "check), pull first:"
echo "  cd \"\$SHIN_REPO_DIR\" && git pull"
echo "Expected output: either \"Already up to date.\" or a fast-forward"
echo "summary naming the files that changed, never a merge conflict (this"
echo "repo's own rule is no branches, everyone works on main)."

echo
echo "===== PATH B: copy (only if path A's credential cannot be issued) ====="
echo "Needs OpenSSH Server enabled on this Windows laptop first (Settings >"
echo "System > Optional Features > OpenSSH Server, or:"
echo "  Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0"
echo "run in an elevated PowerShell on Windows, not here)."
echo
echo "From the Mac, for each of the five packages, excluding node_modules"
echo "(each package installs its own) and excluding catalogue/data (that is"
echo "mac/04-verify-catalogue-checksum.sh's job, the file is too big and too"
echo "important to trust to a plain rsync with no checksum step):"
echo
for pkg in app spine price catalogue identify; do
  echo "  rsync -avz --exclude node_modules --exclude data \\"
  echo "    \"\${WINDOWS_SOURCE_USER}@\${WINDOWS_SOURCE_HOST}:\${WINDOWS_SHIN_REPO_PATH}/${pkg}/\" \\"
  echo "    \"\${SHIN_REPO_DIR}/${pkg}/\""
done
echo
echo "Expected output: an rsync summary with a nonzero \"Number of files"
echo "transferred\" the first time and near-zero on a later re-run of the"
echo "same command if nothing changed. Re-run this whole block after every"
echo "lane lands a commit; there is no automatic sync in path B."

echo
echo "===== Both paths: install each package's own dependencies ====="
echo "CLAUDE.md's own repo map is explicit that each of these five carries"
echo "its own package.json and node_modules, and a fresh checkout has none"
echo "of them installed yet:"
echo
for pkg in app spine price catalogue identify; do
  echo "  cd \"\$SHIN_REPO_DIR/${pkg}\" && npm install"
done
echo
echo "Expected output: each npm install exits 0. A red flag specific to"
echo "this repo (seen before, per spine/'s own CLAUDE.md note): identify's"
echo "tests failing with \"Cannot find package '@anthropic-ai/sdk'\" or"
echo "app's check script failing outright both mean an install was skipped"
echo "or failed silently -- re-run npm install in that one package before"
echo "believing any red result from it."
echo
echo "Do not run the test gate yet (mac/02-install-node.sh step 2) until"
echo "this script and mac/04-verify-catalogue-checksum.sh have both"
echo "finished, since the gate needs the catalogue database in place to"
echo "mean anything for the packages that read it."
