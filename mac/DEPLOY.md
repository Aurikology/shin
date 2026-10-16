# Mac deploys: how the beta server gets new code

The Mac puts pushed code on the beta server by itself, and reports through the PC-Mac mailbox
(a private git repo both computers sync; `~/claude-mailbox` on the Mac). Two lines answer the
usual questions: the **Status** line (is the checker on, what is live, the queue, any hold) and
the **App** line (can you test right now).

## Where it reports (`SHIN_DEPLOY_REPORT` in `mac/config.env`)

`mailbox` is the default. `notion` is the optional old sink (sections below); it
stays working, but Notion's free block limit refuses writes, so the mailbox is what runs.

- **Read the status.** On the Mac: `~/.shin-deploy/status.md` (the same Status, App, Queue and
  Mac log text the page used to get, plus a Needs attention list; rewritten on every check, a
  local write that cannot fail a check). On the PC: `node C:\claude-mailbox\mail.mjs job shin-deploy`
  shows every update; a line saying `GONE QUIET` means the checker sent nothing for 60 minutes.
- **What the Mac sends.** `progress --job shin-deploy --to pc` carrying the Status line, only when
  that line changed (its "last check" time alone is not a change), plus a heartbeat at most every
  45 minutes when nothing changed. Each call is a git commit and push, so never more often. One
  `send --to pc` per distinct needs-attention notice (a deploy failed, someone put a hold, the
  app is down), remembered so it is not re-sent every check.
- **Send a request.** Mail to `mac` whose subject starts with `deploy:` (body optional; sender
  and time come from the mail):

  ```
  node ~/claude-mailbox/mail.mjs send --to mac --subject "deploy: pin <sha>" --body ""
  ```

  Subjects: `deploy: latest` · `deploy: pin <sha>` (a commit hash) · `deploy: hold <reason>` ·
  `deploy: release` · `deploy: start checking` · `deploy: stop checking`. The body becomes
  the "what changed" note of a deploy. A subject already in the page's own line format
  (`deploy: deploy · from WHO · TIME · latest · note`) also works. Each check the Mac pulls the
  mailbox, acts on unacknowledged `deploy:` mail through the same queue/hold/pin logic as before,
  and writes a receipt whose note says what it did (`mail sent` shows it on the sender side).
  Mail without the `deploy:` prefix is never touched or acknowledged; a Claude session on the Mac
  reads that.
- **If the mailbox cannot be reached** (spawn error, nonzero exit, 60 s timeout) the checker
  backs off like for a network error (30 s doubling, at most 10 min) and tries again. It is never
  counted as a broken key, never writes `~/.shin-deploy/stopped`, and never stops the checker.
  Requests wait unacknowledged in the repo until the mailbox is reachable again.
- A `~/.shin-deploy/stopped` file left by the Notion era is ignored under `mailbox`; delete it
  (and `~/.worker-state/shin-checker-stopped`) so the Mac's health email stops reporting it.

## How it works

- **The server runs from `~/shin-live`**, a clone nobody edits (`SHIN_REPO_DIR` in
  `mac/config.env`). `~/shin` is a working copy again: editing it changes nothing live.
  The checker and deployer code itself runs from `~/shin/mac/deploy/`.
- **`~/shin-stage`** is where a commit is installed, built and tested first.
- **The checker** (`mac/deploy/checker.mjs`, LaunchAgent `com.shin.checker`) runs every 30 s,
  one at a time (a lock). A check: one `git ls-remote` (a fetch only if main moved), one GET of
  the public `/api/health`, and one report sync through the sink (default: pull the mailbox, read
  `deploy:` requests, write `status.md`, send progress or notices only when something changed; the
  "last check" time alone is refreshed every 5 minutes). Mailbox, network, 429 and 5xx failures
  back the checker off (30 s doubling, at most 10 min) without ever stopping it. With the
  optional Notion sink, calls are spaced 350 ms apart (Notion allows about 3 requests/s) and a
  429 waits for Retry-After. It starts the deployer if the queue has work.
- **The deployer** (`mac/deploy/deployer.mjs`) takes the queue in order. For each item:
  fetch, check out in stage, `npm ci` where a lockfile changed, build the camera bundle,
  run app tests + typecheck + spine/identify/catalogue tests (price's tests are not run).
  Red: the live copy is not touched and the failing test names are posted. Green: wait out
  any hold, check the same commit out in live, install and build there, restart the server,
  then require: health locally from a process started after the restart, that process still
  up 30 s later, one real catalogue search answering inside the server's 5 s search timeout
  (retried for up to 4 minutes; `/api/health` alone says the catalogue is up before its search
  is warm), the same process through the public address, live at the expected commit, and the
  server process running from `~/shin-live/app`. Any of that fails: live goes back to the
  previous commit and restarts, and the page says so.
- **Restarts by hand during a deploy** are not taken as a crash: if the server process changes
  during the 30 s check and launchd reports it was stopped by a signal (someone ran
  `launchctl kickstart -k`), the new process is checked instead. Only an exit code counts as a
  crash.
- **The server is restarted only by a deploy that changes the live commit.** A second request
  for a commit that a later deploy already put live is marked done without a restart.
- **Pushes with no request are queued too** ("unrequested push by <author>"). A commit
  whose deploy failed is not queued again by itself.
- **A request for an older commit pins it**: unrequested pushes do not replace it until a
  newer commit is pushed or someone asks for `latest`. The status line shows `(pinned by who)`.

## The App line

- `App: ready to test (live <commit>, since HH:MM UTC)`
- `App: updating to <commit>, will restart in a few minutes; the current version works until then`
  from the moment a deploy starts testing in stage (back to ready if the tests are red).
- `App: restarting now, back within a minute` just before the live restart, until every check
  above has passed.
- `App: NOT working since HH:MM UTC (<what failed>)` when the public `/api/health` fails on
  2 checks in a row outside a deploy's restart. It goes back to ready by itself.

If the server process changes with no deploy running (someone restarted it by hand), the log
says `server restarted outside a deploy at HH:MM`.

## Notion sink (optional): writing to the Mac (any session, one line under "Requests to the Mac")

Only with `SHIN_DEPLOY_REPORT=notion`. The Mac then reports in the **Mac server** section at the
bottom of the Notion page "Shin: who is working on what" and reads these lines instead of the
mailbox. The request words are the same ones the mailbox subjects use.

```
deploy · from WHO · 2026-09-14 05:08 UTC · latest · what changed      (or a commit hash)
hold · from WHO · TIME · reason        (you are changing the server by hand; deploys wait)
release · from WHO · TIME
start checking · from WHO · TIME       (acts on requests, reading every 30 s)
stop checking · from WHO · TIME        (paused: still reads every 30 s, acts only on start checking)
```

The Mac appends ` → seen HH:MM, queue position N`, then ` → done HH:MM, live <commit>` or
` → failed HH:MM: <reason>`. A hold not refreshed within an hour expires (refresh by
writing a new hold line or changing the time on yours). Finished lines go after a day.

## Notion sink (optional): if the Notion key breaks

This applies only to `SHIN_DEPLOY_REPORT=notion`; the mailbox sink has no key and no stop. "Broken" means Notion refuses the key for this page (401 unauthorized, 403 restricted, or
object_not_found) on 3 checks in a row. Then, once: a headless `claude -p` (haiku, only the
Notion fetch and update tools, about $0.03) adds this at the top of "Needs attention":
`to jamin · from the Mac · <time> · Notion key is broken (<error>); the Mac stopped checking
this page. ...` and sets the status line to `checker STOPPED: Notion key broken since <time>`.
The checker then stops: it writes `~/.shin-deploy/stopped` and
`~/.worker-state/shin-checker-stopped`, makes no more Notion, claude or git calls, and the
Mac's health email (`~/bin/worker-heartbeat.sh`) reports `Shin Notion checker stopped: key
broken`. That claude call is the only paid call this system ever makes.

Fix and restart: make a new Notion integration key, connect it to the page, replace the
`NOTION_TOKEN=` line in `mac/config.env`, then

```
rm ~/.shin-deploy/stopped ~/.worker-state/shin-checker-stopped
launchctl kickstart -k gui/$(id -u)/com.shin.checker
```

and delete the notice under "Needs attention". The checker repairs its own status line.

## Where things are

- State and logs: `~/.shin-deploy/` (`state.json`, `status.md`, `logs/checker.log`, `logs/deployer.log`,
  `logs/claude-cost.log`, `runs/<time>-<id>/` with every command's output).
- Files a clean clone lacks and no build makes, copied into both clones after each build:
  `~/shin-data/deploy/repo-overlay/` (the detector model, the catalogue offline packs, and the
  catalogue's downloaded embedding model under `catalogue/node_modules/.../.cache`; without
  that last one the server crashes seconds after starting). If one of these is rebuilt,
  replace it there.
- `~/shin-live/app/data/photos` is a link to `~/shin-data/photos`.
- Tests for the report sinks, page, queue, health and state logic: `node --test mac/deploy/test/*.test.mjs`
  (`report.test.mjs` covers the mailbox sink with a fake mail runner; no real mailbox is touched).

## Stop it

```
launchctl bootout gui/$(id -u)/com.shin.checker      # no more checks or new deploys
pkill -f mac/deploy/deployer.mjs                     # stop a deploy in progress
```

Killing a deploy mid-way can leave `~/shin-live` checked out at a commit the server is not
running; the next deploy fixes it, or check out the commit in `state.json` → `live`.
Start again: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.shin.checker.plist`.

## Point the server back at ~/shin

Stop the checker (above), then set `SHIN_REPO_DIR=/Users/worker/shin` in `mac/config.env`
(the line before the switch is saved in `~/.shin-deploy/config.env.before-live-switch`) and
`launchctl kickstart -k gui/$(id -u)/com.shin.server`. The server runs `~/shin/mac/run-server.sh`
and reads `~/shin/mac/config.env` either way.

## Backup

The beta serves real tester data (`scans.db`, the repeat cache, the people database, the
photos and shutter folders, prices, corrections, gaps, the user catalogue, the spend-cap and
range-ask stores) that exists nowhere else. `mac/07-backup.sh` backs up every one of those into
`$SHIN_BACKUP_DIR/<timestamp>/`, skips only the read-only ~4 GB `catalogue.db` (reacquired from
`mac/04-catalogue-acquire.md`, never restored from a backup), and writes a `manifest.tsv`
(file, size, per-table row counts) next to what it copied. `mac/07-restore.sh` restores a named
backup into a clean, non-live target folder and checks every restored item against that
manifest -- read both scripts' own header comments for exactly what each covers and why.

**Install (nightly, 04:00 local):**

```
mkdir -p "$SHIN_REPO_DIR/mac/logs"
sed "s|__SHIN_REPO_DIR__|$SHIN_REPO_DIR|g" \
  "$SHIN_REPO_DIR/mac/launchd/com.shin.backup.plist" \
  > ~/Library/LaunchAgents/com.shin.backup.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.shin.backup.plist
```

Stop it: `launchctl bootout gui/$(id -u)/com.shin.backup`.

**Before trusting the schedule**, run it once by hand and prove the restore actually works --
a backup nobody has restored is a claim, not a fact:

```
sh "$SHIN_REPO_DIR/mac/07-backup.sh"
LATEST=$(ls -t "$SHIN_BACKUP_DIR" | head -1)
sh "$SHIN_REPO_DIR/mac/07-restore.sh" "$LATEST" /tmp/shin-restore-proof
```

Expected: the backup prints `OK -- backup complete: ...` and exits 0; the restore prints one
`OK <name> (<file>): <table:count,...>` line per database and folder, ending
`OK -- N item(s) verified against <manifest path>`, and also exits 0. Then delete the throwaway
copy (`rm -rf /tmp/shin-restore-proof`) so it is never mistaken for a live database. This is
the same restore shape E12's first check ("one backup restored") uses.

A run that instead prints `FAILED ...` or `MISMATCH ...` and exits non-zero means exactly that:
something is missing, unreadable, or does not match what the backup recorded -- fix it and
re-run before installing the schedule, never install a schedule nobody has watched succeed.
