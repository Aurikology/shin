# The Mac beta setup, start to finish

Written from a Windows laptop with no Mac present, so nothing below has
been run. Every step names the exact command and what its output should
look like; a check that did not run never passed. This file is the ordered
list; the numbered files it points to carry the detail and the reasoning.

One thing this whole runbook depends on and cannot itself supply: before
step 0, `mac/config.env.example` needs to be copied to `mac/config.env` and
filled in with real values (the domain, the tunnel token, the repo path,
the database paths, the model key, the invite code once it exists). That
copy is not committed -- ask whoever owns `.gitignore` in this repo (a root
file, outside what this Mac-prep work is allowed to touch) to add
`mac/config.env` to it before it is ever filled in with a real secret, since
right now nothing stops it from being committed by accident.

## Order

1. **`01-cloudflare-tunnel.md`** -- item 1a. Install cloudflared (it is not
   on the Mac today), add one subdomain record, create a named tunnel with
   a dashboard token, install it as a system service. Ends with the tunnel
   answering (a 502/503 from Cloudflare, since the app is not running yet).

2. **`02-install-node.sh`** -- item 1b, and the version-parity gate the boss
   added after the Mac inventory. The Mac already has node v26.7.0, ahead
   of the >=22.18 floor every package declares, but that floor being met is
   not the same claim as the tests passing on it -- node:sqlite is an
   evolving API and this code imports `DatabaseSync` from it in at least
   five files. Step 2 of this file is a mandatory full-test-suite run on
   the Mac's own Node before the server ever gets pointed at the tunnel;
   step 3 is the fallback (pin to node 24.14.0 via nvm) if that gate fails.
   Actually run in full only after step 3 below has put the code and
   `node_modules` on the Mac.

3. **`03-copy-packages.sh`** -- item 1c. UPDATED: the Mac has no clone of
   this repo and no GitLab credential today. Two paths, clone (recommended,
   needs one credential input from the founder, a read-only GitLab access
   token) or copy (no credential, goes stale after every lane's commits).
   Either way, ends with `npm install` run in each of app, spine, price,
   catalogue, identify.

4. **On Windows, before step 5**: `node checkpoint-wal.mjs
   C:\shin\catalogue\data\catalogue.db` then `powershell -File
   ..\scripts\mac-catalogue-checksum.ps1 -DbPath
   C:\shin\catalogue\data\catalogue.db`. Produces the expected SHA-256 for
   the 4.13 GB catalogue before it travels anywhere.

5. **`04-verify-catalogue-checksum.sh`** -- item 1d, the Mac half. Copy
   catalogue.db, catalogue.db.sha256, pack-grocery.bin.br and
   pack-canada.bin.br into `catalogue/data/` on the Mac (by whichever path
   step 3 used), then recompute the hash there and compare. A size match
   alone is not this check; a download once reached the right size and
   still failed to decompress.

6. **Now go back and finish `02-install-node.sh` step 2** (the test gate)
   with the code and the catalogue both in place, and step 3 if it fails.

7. **`run-server.sh` + `launchd/com.shin.server.plist` + `05-install-launchd.sh`**
   -- item 1e. Installs the server as a restarting LaunchAgent. The tunnel
   half of 1e is already covered by step 1 above if the dashboard token
   path was used (`cloudflared service install` installs its own daemon);
   `05-install-launchd.sh` only additionally installs a tunnel LaunchAgent
   if the CLI-managed fallback (`cloudflared/config.yml.example` +
   `launchd/com.shin.tunnel.plist`) had to be used instead.

8. **`06-verify-no-sleep.sh`** -- item 1f. UPDATED: the Mac inventory found
   sleep already fully disabled on AC power. This is a verify-only check
   now, with the fix commands kept for the case something has changed the
   profile since.

9. **`07-backup.sh`** then **`07-restore.sh`** -- item 1g. Backs up the
   four live databases (scans, prices, corrections, gaps -- not the
   read-only catalogue) and then actually restores the newest backup into
   a throwaway path and reads a real row out of it. The restore step is
   the whole point; a backup nobody has restored is a claim, not a fact.

10. **`08-cellular-check.md`** -- item 1k. Run from a phone genuinely off
    the home wifi, against the tunnel hostname. UNVERIFIED: the exact
    identify-route URL is written from the plan text's wording, not from
    reading the Server lane's route table (out of scope for this brief);
    confirm the real path before trusting a pass or fail here.

11. **`09-e12-checks.sh`** -- E12, the founder's own exit gate: one backup
    restored (same shape as step 9's restore proof), the server survives a
    `kill -9` (proves the LaunchAgent's KeepAlive from step 7 actually
    works), and a call without the invite code is refused. That third
    check is UNVERIFIED for a structural reason, not carelessness: item 1j
    (the invite code) was being built by the Server lane in `app/` at the
    same time this was written, and this brief was explicitly told not to
    write that file. Get the real header/param name from whoever lands 1j
    and fix the placeholder in this script before running it.

## The one file every script above reads from

`mac/config.env` (copied from `mac/config.env.example`, never committed).
Every placeholder used anywhere in `mac/` is named there, once, with a
comment saying where it comes from and what a wrong value looks like.

## What is UNVERIFIED, named plainly rather than buried

- Every single command in every file above: none of it has been run.
  There is no Mac reachable from where this was written.
- The invite-code header, env var and route/query shape were confirmed by
  reading `app/src/invite.ts` and `app/server.ts` directly (header
  `x-shin-invite`, env var `SHIN_INVITE_CODE`, route `GET /api/identify`
  with a `gtin` query parameter, not `barcode`). What is still open: at
  the time of that read, `app/server.ts` had no call to `invite.ts`'s
  `inviteAllows` anywhere in its dispatch, so the guard may exist without
  being wired into any route yet. `08-cellular-check.md` and
  `09-e12-checks.sh` both name the exact grep to run first to find out.
- Whether the Mac is Apple Silicon or Intel (changes which cloudflared
  .pkg to fetch in the Homebrew-absent path of `01-cloudflare-tunnel.md`).
- Whether Homebrew is present on the Mac at all (checked for, with a
  fallback, in `01-cloudflare-tunnel.md`, but not measured by the
  inventory).
- Whether the founder wants the server to survive a full reboot with
  nobody logged in (needs a LaunchDaemon, not the LaunchAgent written
  here) -- flagged in `launchd/com.shin.server.plist`'s own comment and in
  `05-install-launchd.sh`, not decided either way.
- Whether a GitLab access token can actually be issued tonight for the
  clone path in `03-copy-packages.sh`, and if not, whether the copy path's
  staleness is acceptable for the beta's short life.
