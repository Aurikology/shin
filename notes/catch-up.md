# Catch-up: what changed, and what each person has to do

Read at session start by any Claude session on Shin, so its human hears what changed while they
were away and what they have to set up. Newest day first. Each day has **To do** (named person,
steps that need a human) and **What changed** (for the session to explain in plain words).
Never put a secret here: links with codes and tokens travel privately between Jamin and Aurik.

A session that has told its human everything under a day adds a line to that day's **Read by**.

---

## 2026-09-15, early morning (Jamin's Mac): HIGHEST PRIORITY

### To do

- **Aurik:** Jamin asks you to perform a cleanup of this repo for anything that goes against his
  Gemini rules in `docs/jamin-gemini-rules.md`. Those rules now outrank everything else here. Fix
  each contradiction to match them, or raise it with Jamin as a point if you think it should not
  change. The file lists the contradictions already found.

### What changed

- Jamin set nine rules for Shin's Gemini path, in his own words, as the highest priority in the
  repo: one Gemini call per scan returns the product, prices, reviews and the price math; the
  barcode goes to Gemini; prices never come from Shin's own data; everything a user does in the app
  is recorded; legal issues are marked as issues and never block a feature; every scan ends with an
  answer; Claude does not take over from Gemini; the Gemini key is used only for live phone tests;
  the decisions from the night of the switch rank highest.
- The Gemini search half is back on main (09b86ec), the Claude fallback is removed (3ef4cc8), and
  the Mac's live server runs with Gemini on. Jamin's first two phone scans showed Shin saying it did
  not know the price and nothing saved; the one-call rebuild is under way on the Mac.

### Read by

---

## 2026-09-14, evening (Jamin's Mac)

### What Jamin is building next, so Aurik hears it before the commits arrive

Jamin is starting a new session on his Mac to work through the Gemini pieces that until now waited
on a real Gemini connection. There is still no paid key (his ruling 1 in "Twelve rulings on the
Gemini branch, answered together"), so every test runs by driving the Gemini website
(`gemini.google.com/app`) by hand in Chrome, the way the nine website tests in
`docs/the-gemini-tree.md` were produced. The seven pieces:

1. The request and response shapes, stood in for by hand, with a record of what the website cannot
   prove and only a real key can.
2. Identifying a product from a photo, without search.
3. Looking up a barcode the catalogue does not have, with search.
4. Prices, reviews and a product description in one searched request; reviews shown even with no
   link, flagged.
5. The price line resubmission with code execution, checking that the code Gemini runs is Shin's
   own fixed function and not one it wrote.
6. Image resolution: low, medium and high compared on real photos for quality and cost, nothing
   decided.
7. Trusting a read only when several camera frames agree, never by calling the model twice.

**First, no code.** The session starts by writing down how it will do each piece: which agents it
launches, how it prompts Gemini, how it reads the answers, and how it turns them into data Shin's
code and tests can use. Jamin reviews that before anything is built.

**What it will not land without both of you.** Anything that stores or scores search-derived prices
waits on the two points Aurik's revert names (Google's terms on storing and analysing grounded
results, and tier words), and nothing inside `identify/src/model.ts` lands without Aurik's own yes
(Jamin's ruling 3 is his go-ahead, not Aurik's). The session builds on what Aurik's sessions
already landed today (the request body, `gauge.ts`, the item rules, the grounded block and the
price line) and follows Aurik's ruling that the line names the shopper's own range with neutral
zone codes, not good, reasonable or bad. Only green commits are pushed, in small pieces.

### To do

- **Aurik:** say on the Notion page (Needs attention) if any of the seven pieces collides with
  work you have in flight, or if you want the `model.ts` branch done differently.

### Read by

---

## 2026-09-14, later (Aurik's PC, Fable session)

### The revert, which Jamin should hear from Aurik and not from a commit log

`ccbd0cc`, the unfinished Gemini provider, was **reverted on main** (`b19ad75`). It was red on
typecheck in `identify` and `app` and six tests were failing, by its own commit message, and the Mac
deployer blocks on those, so every commit after it would have been undeployable. Nothing is lost:
the code is one `git show` away, and the clean half of it is back in `main` today.

Aurik ruled the revert. The reasoning and Jamin's own position, quoted from the file headers, are in
`docs/decisions.md` under "The unfinished grounded-price provider comes off main until it is green
and the two questions are settled".

### Gemini is adopted. What changed today

Aurik: *"we will be swithcing to gemini... it has so many legal rules we need to build around. Shin
will adopt this."* The three Gemini documents were read end to end and are now built against. Six
rulings, all his, in `docs/decisions.md` under "Gemini for identification, and grounded prices
display-only":

1. A **free** Gemini key on his PC for the eval only (public Open Food Facts photographs, no user
   data, no grounding); Jamin's **paid** key still goes in `mac/config.env` for live traffic.
2. Everything, built in the legal order: identification, then the guard, then grounded prices.
3. **Gemini reviews ship, and beta plan item 30 is amended** (work-list item 4, his call). Recorded
   in the decision log rather than by editing `docs/the-beta-build-plan.md`, which is Jamin's file.
4. Of the twelve awkward item kinds, the four that reach beta testers.
5. **The price line's words name the range the shopper set, never Shin's opinion of the price.**
   `good / reasonable / bad` do not ship: they are tier words, hard rule 2 forbids an unmeasured
   performance claim, and four test files enforce it. The function returns neutral zone codes.
6. Models: `gemini-3.5-flash-lite` by default, `gemini-3.8-flash` only on low confidence.

### What is built and pushed

- The live photo route **now uses the provider the setting names**. It never did: `modelOnce` built
  an Anthropic client by hand, so `SHIN_MODEL_PROVIDER` reached every caller except the one route
  that answers a shopper. That is work-list item 14 and it is why the switch had to start there.
- `identify/src/providers/gemini.ts` on the **Interactions API**, key in the `x-goog-api-key`
  header, no tools, cheap-first with escalation.
- `identify/src/grounded.ts`: the guard. A Grounded Result is an opaque box whose payload lives off
  the object, so it cannot reach a database write, cannot be JSON-stringified into a response body,
  cannot be spliced into a Shin sentence, and cannot be re-sorted. Eleven tests, four shown red by
  breaking the code.
- `identify/src/gauge.ts`: the fixed Python Gemini runs, its TypeScript twin, and the code-match
  check. Python and the twin agree over 20 cases with zero mismatches.
- `app/src/grounded-record.ts`: the per-user row, the two-year sweep, and an interim reaper that is
  time-driven so nobody has to remember to delete anything.
- `app/server.ts` **refuses to start** if it sees `SHIN_GEMINI_TIER=free`.

### For Jamin

- **The paid key** in `mac/config.env` as `GEMINI_API_KEY` is still the gate on everything live
  (work-list item 1). Nothing calls Gemini until it exists.
- **The Notion page is still not shared with Aurik's account** (it 404s for him), so his sessions
  cannot read it and say so rather than assuming nobody else is working.
- Aurik still needs **his invite link and the data token**, privately.
- Two questions are yours: whether the item-30 amendment is acceptable, and whether a legal review
  happens before build, before launch, or not at all (work-list item 7).

## 2026-09-14, later: test Notion from Aurik's side (Jamin's worker Mac session)

### To do: Aurik (and his Claude), about 10 minutes

The goal is to prove your Claude can read and write the shared Notion page, because from now on
that page is how your sessions and Jamin's talk, and soon how you ask the Mac to put your pushes
live. Your Claude walks you through it:

1. **Pull**, so this file and the latest rules are on your machine.
2. **Check you can open the page yourself** in Notion: `Shin: who is working on what`,
   https://app.notion.com/p/3db09fb15fcf8155bc04ef261e4e1d9c. If Notion says you have no access,
   ask Jamin to share it with your Notion account (Share, then invite your email, "Can edit").
3. **Connect Notion to your Claude.** In the Claude app or claude.ai: Settings, Connectors,
   Notion, Connect, and allow access to that page. In Claude Code, run `/mcp` and check Notion
   is listed and connected. (This is your own connection. The Mac has a separate key of its own;
   you never need it.)
4. **Read test.** Your Claude fetches the page and tells you, in plain words, what is under
   **Needs attention** and **Working on now**. If it cannot find the page or its tools have no
   Notion in them, step 3 did not take; stop there and tell Jamin.
5. **Write test.** Your Claude adds exactly this line under **Needs attention**, with the real
   time:
   `to jamin · from aurik · <YYYY-MM-DD HH:MM UTC> · Notion test from Aurik's machine: reading and writing work`
   It must add the line with an edit that leaves every other line alone (never rewrite the
   whole page: Jamin's sessions and the Mac edit it too). Then it fetches the page again and
   confirms the line is there.
6. **Round trip.** A session on Jamin's side answers on the same line with ` → seen <time>`.
   Once your Claude sees that, delete the line. That proves both directions work.
7. **Reminder check.** Make any small edit in the repo with Claude Code, without touching Notion
   first. Claude should get a reminder to update the Notion page (a check that ships in the repo
   and runs every time your Claude does something). If no reminder appears, tell Jamin: your
   Claude Code may not be loading the repo's settings.

### Coming soon: asking the Mac to put your push live (do not use until it appears)

Being built on the Mac now. **Wait until the page has a section called `Mac server` with a
`Status:` line** before relying on it; until then, pushes do not go live on their own.

- The Mac reads the page every 5 minutes, day and night. Post `start checking · from aurik ·
  <time>` under **Requests to the Mac** and it reads every minute, dropping back to 5 minutes
  after 60 minutes with nothing new from you.
- After you push: `deploy · from aurik · <time> · <commit short or latest> · <what changed>`.
  The Mac tests that exact code in a separate copy, puts it live only if tests pass, checks the
  live server answers on it, and posts every step (seen, queue position, tests, restart, live
  check, done or failed) in the `Mac log`. Failed tests leave the old version running.
- If someone else's deploy is running, yours joins the **Queue** and the log says so.
  `hold · from <who> · <time> · <reason>` makes deploys wait (expires after 1 hour unless
  refreshed); `release` ends it. Naming an older commit rolls back and pins it until a newer push.
- Nothing waits on a silent person: a request you posted still runs if you go quiet.

### Read by

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
  re-read the page and refresh the line's time every 20 minutes and at every push (a reminder
  built into the repo nudges the session when it is overdue); a line quiet for 1 hour is stale and can be
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
that says so. Also: exact location beside the rough area, the barcode frame kept, torch and
typed-search use, and the reader's failures reported. Built and live on 2026-09-14. **Before any public
launch** this has to become privacy-by-default (Quebec's Law 25); fine for the family beta.

**What went wrong today, so it is not repeated:** the beta server serves the app straight from
the Mac's working folder, and a half-finished edit there (a screen importing a file that did not
exist yet) took the app down for a while. That is why each session gets its own copy of the repo,
and why a separate live copy is being built.

### Live as of 2026-09-14 04:27 UTC (checked through the public address, not assumed)

- Server restarted onto all of the above. Checked live: a request with Aurik's link is let in and
  recorded as `aurik`; the family link still opens; no link is refused; the data window lists
  tables with the token and refuses a wrong one; batched events are stored; the 8-digit can
  barcode `0067000008191` now finds its product. The checks left a test phone named
  `verify-mac-0914` in the data (recorded under `aurik`); ignore it.
- The collection work is commit `d0a1c2e`. **Its commit title is wrong** (it repeats the title of
  the catch-up commit before it, a slip while committing); its content is the collection work,
  20 app files. App tests 649 of 649 pass, typecheck clean.
- **Bug found:** the can was a Cherry Coke Zero (Jamin). The barcode found it correctly; the
  photo said plain Coke Zero, dropping the flavour. Logged as D-099 in `DEFECTS.md`, not yet fixed.
- **Planned, not built:** a separate live copy of the server on the Mac that updates only from
  GitLab after tests pass, so nobody's half-finished edit can reach testers.

### Open decisions (Jamin's)

- Copying the PC's price database to the Mac (needs a temporary key and his yes).
- Whether to run the Walmart crawl, and whether to pay for SerpApi.
- Approving parts 1 and 2 of the always-a-price plan (`docs/plan-always-a-price.md`): a labelled
  price on every answer, and wiring in the shelf-tag reader.

### Read by

- Jamin (in the session that wrote it)
