# Catch-up: what changed, and what each person has to do

Read at session start by any Claude session on Shin, so its human hears what changed while they
were away and what they have to set up. Newest day first. Each day has **To do** (named person,
steps that need a human) and **What changed** (for the session to explain in plain words).
Never put a secret here: links with codes and tokens travel privately between Jamin and Aurik.

A session that has told its human everything under a day adds a line to that day's **Read by**.

---

## 2026-09-14 (Jamin's worker Mac session, Jamin at the keyboard)

### To do: Aurik

1. **Pull.** `git pull` in your copy of the repo.
2. **Get two things from Jamin, privately** (a direct message, never Notion, GitLab or a group
   chat):
   - **Your own invite link** (`https://relay.anjiawenda.com/#invite=...`). Open it once on your
     phone; the phone remembers it. Everything you scan is then recorded as yours, not "family".
     The old family link keeps working too.
   - **The data token.** Save it on your computer as the environment variable
     `SHIN_ADMIN_TOKEN` (macOS/Linux: `export SHIN_ADMIN_TOKEN=...` in your shell profile;
     Windows: `setx SHIN_ADMIN_TOKEN ...` and open a new terminal). Never in the repo, never in
     a commit. If it leaks, tell Jamin and it gets replaced.
3. **Connect Notion to your Claude**, after Jamin shares the page
   `Shin: who is working on what` with your Notion account. Every session reads that page before
   editing (rules in `CLAUDE.md`, section WHO IS WORKING ON WHAT). Without Notion your Claude
   will tell you it cannot see the page, rather than assuming nobody else is working.
4. **Check the data window works** (only after Jamin's Mac restarts the server, see "Not live
   yet" below):
   `curl -s -H "x-shin-admin: $SHIN_ADMIN_TOKEN" https://relay.anjiawenda.com/api/admin/tables`
   answers a list of tables. The recipe for reading scans, photos and camera frames is in
   `CLAUDE.md`, section BETA DATA.

**There is no login and no access to the Mac itself**, on purpose. You change code on your own
machine and push to GitLab; a session on the Mac puts it live. Getting into the Mac (commands,
restarts) would need Jamin to approve a key for your computer, and nothing today needs it.

### To do: Jamin

- Share the Notion page with Aurik.
- Send Aurik his invite link and the data token, privately.
- Open your own new link (`jamin`) on your phone once, so your scans say they are yours.

### What changed

**How you two work (rules now in `CLAUDE.md`):**
- **Pushing needs nobody's approval**, either direction. Jamin: *"aurik does not need to approve
  before i push, neither do i need to approve his push, neither of us actrually read the code"*.
  Still: pull first, tests and typecheck pass, then push.
- **Coordination between sessions.** Your Claude and Jamin's run on different accounts and cannot
  message each other. The only things all sessions share are GitLab and the Notion page. So:
  claim a line on the page before editing; the later claim on the same part of the app gives way;
  refresh the line's time at every push and hourly; a line quiet for 3 hours is stale and can be
  taken over after 24 hours with no answer; to get another session's unpushed work, ask it to
  push (under Needs attention on the page), never copy its files; stopping with unpushed work
  means marking the line paused; one working copy of the repo per session. Full list: `CLAUDE.md`.
- **Slack: not set up.** Judged not needed yet; the Notion page does the job. Worth it later if
  you want the server to post alerts or a daily summary, or family feedback needs one place.

**The app, all pushed:**
- **Barcode scanning works on Jamin's iPhone now.** Three separate faults: the reader switched
  itself off for good when its download was slow; Chrome on iPhone failed to load the reader the
  first time (it now retries, and reports what happened); and short can barcodes (8 digits, like
  Coke Zero cans) never matched the catalogue's form of the same code.
- **New app code reaches phones straight away.** The offline cache used to serve the old copy
  first; it now fetches fresh and falls back to the cache only offline. The offline product pack
  was being refused by the invite check and now carries the invite.
- **Every request is logged** on the server (path, status, time, which phone, whose link), and
  every shutter press keeps the full camera frame plus every request and answer it caused.
- **Named invite links:** `jamin`, `aurik`, and `family` (the old shared link). Scans and the
  request log record whose link a phone came through.
- **Read-only data window for the team** (`/api/admin/...`, behind the data token): tables, any
  read-only SQL, people, request log, shutter presses, and files such as frames and photos. It
  cannot change or delete anything; a test proves writes fail.
- **Photo identify works end to end** on the Mac: Coke Zero 355 ml in about 9.5 seconds.

**Collecting everything testers do** (Jamin: *"build everything for collecting EVERYTHING"*):
photos and location saved by default, every tap, screen and abandoned scan, and a privacy notice
that says so. Built on the Mac on 2026-09-14; see the git log for its commit. **Before any public
launch** this has to become privacy-by-default (Quebec's Law 25); fine for the family beta.

**What went wrong today, so it is not repeated:** the beta server serves the app straight from
the Mac's working folder, and a half-finished edit there (a screen importing a file that did not
exist yet) took the app down for a while. That is why each session gets its own copy of the repo,
and why a separate live copy is being built.

### Not live yet, as of 2026-09-14 04:30 UTC

- The named links and the data window are in the code but the server has not restarted onto
  them; until then the data routes answer "closed beta". The Mac session restarts it once the
  collection work passes its tests, and updates the Notion page when it has.
- **Planned, not built:** a separate live copy of the server on the Mac that updates only from
  GitLab after tests pass, so nobody's half-finished edit can reach testers.

### Open decisions (Jamin's)

- Copying the PC's price database to the Mac (needs a temporary key and his yes).
- Whether to run the Walmart crawl, and whether to pay for SerpApi.
- Approving parts 1 and 2 of the always-a-price plan (`docs/plan-always-a-price.md`): a labelled
  price on every answer, and wiring in the shelf-tag reader.

### Read by

- Jamin (in the session that wrote it)
