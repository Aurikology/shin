# The Mac beta setup, start to finish

Written from a Windows laptop, mostly without a Mac present -- except
where marked "FACT", every line below is unrun. Where a fact came back
from a session actually on the Mac partway through this work, it is
stated as a fact and dated in place, not as a plan.

Before step 0: copy `mac/config.env.example` to `mac/config.env` and fill
in what is still a placeholder there (the tunnel UUID once step 1 below
creates it, the invite code, the model API key, `WINDOWS_SOURCE_HOST`).
`mac/config.env` has been added to the root `.gitignore` (done by the
boss directly), so it is safe to fill in without it landing in a commit.

## Order

1. **`01-cloudflare-tunnel.md`** -- item 1a. FACT as of this write-up: the
   Mac already has cloudflared 2026.9.1 (Homebrew), and `cloudflared
   tunnel login` has already been run against the founder's own
   Cloudflare account -- the one browser-click step in this whole item is
   done. His account carries exactly one zone, `anjiawenda.com`, which is
   therefore `SHIN_DOMAIN_APEX`. Remaining, all scripted: create the named
   tunnel, route the one subdomain record, write the ingress config,
   install it as a service, verify.

2. **`02-install-node.sh`** -- item 1b, and the version-parity gate. FACT:
   the Mac runs node v26.7.0, ahead of the >=22.18 floor every package
   declares. That floor being met is not the same claim as the tests
   passing on it -- node:sqlite is an evolving API and this code imports
   `DatabaseSync` from it in at least five files. Step 2 of this file is a
   mandatory full-test-suite run on the Mac's own Node before the server
   ever gets pointed at the tunnel; step 3 is the fallback (pin to node
   24.14.0 via nvm) if that gate fails. Run in full only after step 3
   below has the code, and step 5 below has the catalogue, in place.

3. **`03-copy-packages.sh`** -- item 1c. FACT: the repo is already cloned
   at `/Users/worker/shin` from `git@gitlab.com:shin3223636/shin.git`, on
   main at 840d70c, authenticated as `@jaminke` through an SSH key already
   on the machine. Nothing to request from the founder; staying current
   is `git pull`. This step is now just that plus `npm install` in each of
   app, spine, price, catalogue, identify.

4. **`mac/04-catalogue-acquire.md`** -- item 1d, the single largest step in
   the whole setup and the one with a real trap in it. The clone is 10 MB;
   the catalogue is 4+ GB and is NOT in git. Worse: `catalogue.db` is
   opened in WAL mode, and at the time this was measured another lane was
   actively writing to it (a 241 MB `-wal` file, changing). Copying
   `catalogue.db` alone while that log has real content in it produces a
   database that opens cleanly, reports a plausible row count, and is
   silently missing whatever the log held -- it looks like success. This
   file lays out the two ways to make the copy safe (checkpoint-then-copy
   via `mac/checkpoint-wal.mjs`, or copy-the-three-files-as-a-set) and
   which to pick depending on whether something is writing right now, the
   exact files the server needs (not the ~16 GB `catalogue/data/` holds in
   total -- `food.parquet` and `off.csv.gz` etc are rebuild sources, never
   read by the running server), the transfer commands (guarded: it refuses
   to run with a named error if `WINDOWS_SOURCE_HOST` is still unset,
   rather than silently trying a placeholder network address), and
   `mac/04-verify-catalogue-checksum.sh`'s job of confirming the exact
   bytes that were hashed on Windows are the bytes that landed.

5. **Go back and finish `02-install-node.sh` step 2** (the test gate) with
   the code and the catalogue both in place, and step 3 if it fails.

6. **`run-server.sh` + `launchd/com.shin.server.plist` + `05-install-launchd.sh`**
   -- item 1e. Installs the server as a restarting LaunchAgent. The
   tunnel half of 1e is already covered by step 1 above
   (`cloudflared service install` installs its own daemon);
   `05-install-launchd.sh`'s tunnel section is only needed if that command
   itself cannot be used for some reason not yet encountered.

7. **`06-verify-no-sleep.sh`** -- item 1f. FACT from the Mac inventory:
   sleep is already fully disabled on AC power (SleepDisabled 1, sleep 0,
   disksleep 0). This is a verify-only check, with the fix commands kept
   in case something changes the profile later.

8. **`07-backup.sh`** then **`07-restore.sh`** -- item 1g. Backs up the
   four live databases (scans, prices, corrections, gaps -- not the
   read-only catalogue) and then actually restores the newest backup into
   a throwaway path and reads a real row out of it. A backup nobody has
   restored is a claim, not a fact.

9. **`08-cellular-check.md`** -- item 1k. Run from a phone genuinely off
   the home wifi, against the tunnel hostname, with the invite header set.
   Route (`GET /api/identify?gtin=...`), header (`x-shin-invite`) and env
   var (`SHIN_INVITE_CODE`) all confirmed by reading the code, and the
   guard confirmed WIRED into `app/server.ts`'s dispatch, not just defined.

10. **`09-e12-checks.sh`** -- E12, the founder's own exit gate: one backup
    restored (same shape as step 8's restore proof), the server survives a
    `kill -9` (proves the LaunchAgent's KeepAlive from step 6 actually
    works), and a call without the invite code is refused (trustworthy as
    written; see step 9).

## The one file every script above reads from

`mac/config.env` (copied from `mac/config.env.example`, gitignored).
Every placeholder used anywhere in `mac/` is named there once, with a
comment saying where it comes from and what a wrong value looks like.
`SHIN_DOMAIN_APEX` and `SHIN_TUNNEL_HOSTNAME` hold the founder's real
domain rather than a placeholder -- deliberate, and explained in that
file's own comment: a hostname is visible in every request the app makes,
so it is not a secret the way the tunnel credential, the invite code and
the model key are, and those three stay placeholders.

## What is still UNVERIFIED, named plainly

- Every command in every file above that is not marked FACT: none of it
  has been run end to end. The facts above came back piecemeal, mid-task,
  from sessions actually on the Mac; nobody has yet run this runbook start
  to finish in one sitting.
- Whether the Mac is Apple Silicon or Intel (the Homebrew cloudflared
  install already covers this either way, but it would matter if the
  Homebrew-absent fallback in an earlier draft were ever needed -- it is
  not, cloudflared is already installed).
- Whether `mac/04-catalogue-acquire.md`'s transfer actually completes over
  the available LAN in reasonable time, or needs the external-drive
  fallback instead -- not knowable without trying it.
- Whether the founder wants the server to survive a full reboot with
  nobody logged in (needs a LaunchDaemon, not the LaunchAgent written
  here) -- flagged in `launchd/com.shin.server.plist`'s own comment and in
  `05-install-launchd.sh`, not decided either way.
- One anomaly, resolved: an earlier version of `mac/config.env.example`
  briefly held an unexplained domain value between two reads of this file.
  The boss identified the source (the Mac session's zone lookup, landing
  between the two reads) and it is now recorded as the provenance note at
  the top of that file's domain section rather than a live question.
