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
- (Resolved by mac/10-boot-survival.sh, see the last section.) Whether the founder wants the server to survive a full reboot with
  nobody logged in (needs a LaunchDaemon, not the LaunchAgent written
  here) -- flagged in `launchd/com.shin.server.plist`'s own comment and in
  `05-install-launchd.sh`, not decided either way.
- One anomaly, resolved: an earlier version of `mac/config.env.example`
  briefly held an unexplained domain value between two reads of this file.
  The boss identified the source (the Mac session's zone lookup, landing
  between the two reads) and it is now recorded as the provenance note at
  the top of that file's domain section rather than a live question.

---

# Surviving a restart, encrypted, backed up, hardened (readiness lane fix-mac, 2026-11-18)

Written on the Windows laptop with no Mac to try it on. Every script has a `--dry-run` (or `--audit`), is `bash -n`
clean, and has tests against fake macOS commands (`node --test mac/test/*.test.mjs`). Those tests prove the scripts'
own logic. They cannot prove how the real `launchctl`, `fdesetup` or firewall behave, which is why each step below ends
in a check you run on the Mac. Anything not run on a Mac is UNVERIFIED.

Covers readiness rows R04, R07, R08, R10, R16, R52, R55, R58, R66, R69, R72 and findings D1 to D5.

## What still needs a person (the plain statement)

This Mac is Apple silicon (arm64, seen in the 2026-11-16 check) running macOS 27.0.1. With FileVault on:

| Event | Comes back by itself? | Why |
|---|---|---|
| Server crash, tunnel crash, a job overruns | Yes | launchd KeepAlive and boot-time daemons |
| Planned restart with `11-planned-restart.sh` (macOS update) | Yes, if authrestart works as documented | `fdesetup authrestart` hands the disk key to the next boot once (fdesetup(8)). On Apple silicon the credential is single use (Apple developer forums thread 774703) |
| Power cut, crash, forced shutdown | **No, not by itself.** It stops at the FileVault unlock screen until someone unlocks it | Apple silicon cannot start macOS until the disk is unlocked. Apple Platform Deployment, "Use FileVault with Mac computers with Apple silicon" (support.apple.com/guide/deployment/dep24dbdcf9e) |
| Same, with nobody home | Maybe: unlock over SSH from the home network (LAN) | Reported for macOS 26 and later when Remote Login is on and the Mac has a network connection before unlock. Secondhand (a web search summary and a Jeff Geerling write-up), NOT checked against Apple's own page and NOT tried on this Mac. Wi-Fi before unlock was reported as version dependent, and this Mac is a laptop |

Tailscale is not running before the disk is unlocked, so the SSH unlock works from the home network only, never from outside.
The MacBook's battery rides out short power cuts, so a power cut rarely reaches the third row.

The trade this makes: R08 (the disk must be encrypted) and R04 (comes back with nobody logged in) pull against each other on a
power cut. The design gives full automation for crashes and planned restarts and needs a person only for an unplanned power loss.
If nobody can be reached and uptime matters more than encryption, FileVault stays off. That is Jamin's call
(`docs/readiness/needs-jamin.md`).

## The ordered procedure

Run on the Mac as `worker`, from `~/shin`. `sudo` asks for the password; a Claude session on the Mac cannot type it.
Dry runs and audits change nothing.

0. **Get this branch's code onto the Mac** (it is not merged when this is written).
1. **Config.** Open `mac/config.env` (mode 600) and add the keys from the "boot, health, off-site backup, checks" block at the end of
   `mac/config.env.example`. Keep what is there. Set `SHIN_BACKUP_DIR=/Users/worker/shin-backup` (see "the old backup script").
2. **Boot survival (R04).**
   ```
   sh mac/10-boot-survival.sh --dry-run          # reads the plan
   sudo sh mac/10-boot-survival.sh               # installs 9 daemons, moves old agents aside
   sudo sh mac/10-boot-survival.sh --verify      # the FileVault line may fail until step 3
   ```
   It renders `mac/launchd-daemons/*.plist` into `/Library/LaunchDaemons` (server, checker, integrity, backup, offsite,
   logrotate, hammer, restoretest, expiry), all run as `worker`, never root; stops the old login agents and keeps them in
   `~/Library/LaunchAgents.shin-disabled`; converts the existing tunnel agent into a daemon in place; writes
   `/etc/sudoers.d/shin-deploy` (worker may restart `com.shin.server` and nothing else); sets `SHIN_LAUNCHD_DOMAIN=system`;
   sets macOS to download updates but not install and restart on their own; `pmset autorestart 1` as best effort.
   Undo: `sudo sh mac/10-boot-survival.sh --rollback`. The site is down for a few seconds while the server swaps over.
3. **FileVault on (R08, D1). Jamin only, at the Mac, needs his password.** System Settings > Privacy and Security > FileVault >
   Turn On. Choose a recovery key (not iCloud) and write it down somewhere that is not this Mac. Encryption runs in the background.
   Then `sudo sh mac/10-boot-survival.sh --verify` should be all green.
4. **Planned restart drill (D5).**
   ```
   sudo sh mac/11-planned-restart.sh --dry-run
   sudo sh mac/11-planned-restart.sh              # installs updates (27.2.1), asks for the FileVault password
   sudo sh mac/11-planned-restart.sh --after      # a few minutes later: waits for the server, lists pending updates, runs --verify
   ```
   UNVERIFIED: that a staged macOS update finishes installing across an authrestart boot. If `--after` still lists the update, run
   the script once more; failing that, install it from System Settings and unlock at the screen afterwards.
5. **Harden (R55, D3).**
   ```
   sh mac/12-harden.sh --audit                      # read-only: firewall, SSH, listeners, file modes
   sudo sh mac/12-harden.sh --dry-run
   sudo sh mac/12-harden.sh                         # firewall + SSH drop-in + private files
   ```
   The firewall step checks the site answers locally and through the tunnel before and after; if it stops answering it turns the
   firewall off again and exits 1. Not done by default: `--ssh-keys-only` (SSH passwords off: only after key login is tested and
   you have decided it does not break the SSH unlock above) and `--screen-sharing-off` (Jamin's call). `--undo` reverses all of it.
   The audit names the unknown program on port 8787 (finding D3) with its command and folder; a person decides what it is.
6. **Off-site backup (R07, R52).** Jamin picks the destination (`docs/readiness/needs-jamin.md`). In `mac/config.env` set
   `SHIN_RESTIC_REPOSITORY` and `SHIN_RESTIC_PASSWORD_FILE` (create that file, mode 600, one long random password, and keep a second
   copy in his password manager: without it the backup cannot be opened). `brew install restic`. Then:
   ```
   sh mac/14-offsite-backup.sh --dry-run
   sh mac/14-offsite-backup.sh --init              # once
   sh mac/07-backup.sh && sh mac/14-offsite-backup.sh
   sh mac/15-restore-test.sh --dry-run && sh mac/15-restore-test.sh
   ```
7. **The rest, run once by hand to see them work** (the daemons run them on schedule):
   ```
   sh mac/run-job.sh integrity        # nightly database check and free disk (R16)
   sh mac/16-rotate-logs.sh --dry-run # (R10) keeps 14 days
   sh mac/run-job.sh expiry           # (R66, R69) days left on certificate, profiles, App Store Connect key, Tailscale key
   ```
8. **Reboot drill, the final proof (Jamin at the Mac the first time).** Planned: step 4 again. Unplanned: only when he is willing to
   unlock it at the screen: `sudo shutdown -r now`, unlock, then `sudo sh mac/10-boot-survival.sh --verify`.

## After any restart: checklist

`sudo sh mac/10-boot-survival.sh --verify` (daemons loaded, server and tunnel up, public `/api/health`, FileVault state), then look
at `~/shin-data/health/` (no `*.FAILED` files) and the status page.

## Where the health markers are (for the fix-watch lane)

Folder: `/Users/worker/shin-data/health/` (`SHIN_HEALTH_DIR`, default `$SHIN_DATA_DIR/health`). One file per job:

| File | Written by | Meaning |
|---|---|---|
| `<job>.json` | every run, pass or fail: job, ok, at, detail | stale = the job stopped (periods below) |
| `<job>.FAILED` | exists only while the last run failed, removed on the next pass | its presence is the alarm |
| `~/.worker-state/shin-<job>-failed` | same, for the old `~/bin/worker-heartbeat.sh` mail | |

Jobs and staleness: `backup` (04:00, 36 h), `offsite` (04:45, 36 h), `integrity` (03:30, 36 h), `disk` (with integrity),
`restore-test` (Sunday 06:30, **10 days**), `certs` (1st of the month, **40 days**), `logrotate` (daily, 36 h), `checker` (every
30 s, the heartbeat: it carries `lastCheckAt`, `transientFailures` and the live commit; older than 5 minutes means the checker or
the Mac is down). One mail per failure streak through the mailbox (`SHIN_HEALTH_MAIL=off` silences it).
UNVERIFIED on the Mac: that `~/bin/worker-heartbeat.sh` reads the `shin-*-failed` flags (that script is not in this repo).

## Moving the server off the admin account (D4): a plan, not a script

The server runs as `worker`, an admin. Moving it needs passwords and moves live data and the Git, tunnel and Tailscale logins, so it
is not scripted. Plan, each step reversible:
1. Jamin creates a standard (non-admin) account `shinsvc` in System Settings > Users and Groups (his password).
2. As `shinsvc`: clone the repo (a read-only GitLab deploy key for that account, added in GitLab by him), `npm install` in each package,
   copy `mac/config.env` (mode 600) and set `SHIN_DATA_DIR` to the new home.
3. Stop the daemons, `rsync -a` the data folder to the new home (the catalogue is 4+ GB), run `node mac/nightly-checks.mjs --check-only`
   on the copy, then run `SHIN_SERVICE_USER=shinsvc sudo sh mac/10-boot-survival.sh` and `--verify`.
4. Copy the tunnel credentials file and change its owner. Tailscale is system level and is unaffected.
5. `worker` stays as the admin Jamin logs in to; it no longer runs anything.
Until then D4 is open. What is in place meanwhile: Umask 077 on every daemon and the 600/700 file modes from step 5.

## The old backup script, and what changed

`~/bin/shin-backup.sh` (the agent `com.shin.backup`, seen in the 2026-11-16 check) is replaced by `mac/07-backup.sh` by default.
Behaviour change to know about: the old script kept 3 nights and copied the catalogue; the new one keeps 14 nights, does NOT copy the
4 GB catalogue (rebuild sources: `mac/04-catalogue-acquire.md`), writes a manifest and markers, and checks integrity first.
To keep the old job instead: `SHIN_KEEP_LEGACY_BACKUP=1 sudo sh mac/10-boot-survival.sh`.

## Restore (R58)

`sh mac/07-restore.sh <backup> <clean-target>` verifies the copy against its manifest, then re-runs every deletion in the data-request
log (`SHIN_REQUEST_LOG`, default `~/shin-privacy/request-log.csv`) against the restored data, so a person who asked to be deleted after
the backup was taken does not come back. A missing log is a loud failure ("NO REQUEST LOG"). `SHIN_RESTORE_SKIP_REDELETE=1` skips it and
prints "NOT re-running deletions": only for a test restore that never goes live (the weekly restore test does exactly that).

## Caveats, named

- Daemons run with a locked login keychain, so `expiry-check` may list the signing certificate as "unknown" there. Also run
  `sh mac/run-job.sh expiry` from a Terminal once a month until the daemon is seen to read it.
- Log rotation uses copy-then-truncate and assumes launchd opens the log files in append mode (about 80% sure, not seen). If a rotated
  log keeps its old size after truncation, switch to rotate-by-restart.
- `mac/launchd/*.plist` (login agents) stay in the repo as the fallback; `mac/launchd-daemons/` replaces them.
- The App Store Connect key has no expiry date; the check asks Apple whether the key still works (one request) and treats 401 or 403 as expired.
