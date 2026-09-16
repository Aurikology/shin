# Catch-up: what changed, and what each person has to do

Read at session start by any Claude session on Shin, so its human hears what changed while they
were away and what they have to set up. Newest day first. Each day has **To do** (named person,
steps that need a human) and **What changed** (for the session to explain in plain words).
Never put a secret here: links with codes and tokens travel privately between Jamin and Aurik.

A session that has told its human everything under a day adds a line to that day's **Read by**.

---

## 2026-09-16 (Aurik's PC): the price guard is in, and the eval stops being invisible

### To do

- **Jamin, one question ahead of the other five.** Aurik built a guard so that ONE grounded price no
  longer produces a verdict line. Measured case: a single Walmart offer of $9.97 against a
  hand-priced $1.74 told the shopper their ordinary price was *"83% under the middle of 1 prices"*.
  The guard withholds the LINE and keeps the ANSWER -- offers, reviews and description all still
  show, with the sentence *"Only one price found, so there is no middle to compare against."*
  **Does that satisfy your rule 6 for you?** If you read "always an answer" as "always a line", then
  the defect has no fix that satisfies it and Aurik needs to hear that. Everything else below assumes
  a line may sometimes be withheld.
- **Jamin, five more points, written up in `docs/decisions.md` under "D-113 is closed with a guard,
  and six points come out of it rather than being built".** Short version: (1) your pushed
  `gauge-math.md` calls the outlier behaviour *"exactly as specified"*, and the guard clips it -- the
  sentence predates the measurement; (2) rule 3 says the price is not ours, and the argument for the
  guard is that a plausibility band is not a price source, since every number still comes from your
  offers and the band only moves one into a labelled list; (3) `gauge.ts`'s header claims production
  never runs it on a grounded price, and production runs it three times per scan -- rule 5 says that
  marks and never blocks, so nothing stopped; (4) about 250 lines of Python proof are now dead and
  deleting them should be seen rather than inferred; (5) whether a `clearance` price belongs on the
  line at all.
- **Jamin, the two things only you can send are still outstanding** from 09-15: the data token
  (`SHIN_ADMIN_TOKEN` is still unset in every scope here) and a paid key that can ground. Neither
  moved today, and both still block the same things. **The key got more important tonight.** Shin
  searches for prices on the cheapest model Google sells, and that now looks like the reason seven
  of ten searches found no price at all. Asked the same question in the browser, the cheap model
  returned an empty answer for Tide and the better one returned two Canadian shops; the obscure
  cream that had returned nothing twice came back with Loblaws and No Frills. Changing it is one
  environment variable. Proving it at the API rather than in a browser needs your key.
- **Aurik:** the guard has NOT been seen on a phone. The three screens -- one offer, two, three --
  have not been photographed, and `DEFECTS.md` records that twenty-two of the first thirty defects
  were found by looking at a rendered screen. No row moves on this until that runs.

### What changed

- **D-113 closed, both guards** (`d91c37f`). A price more than 2.5x away from, or less than half of,
  the median of the OTHER prices found is held off the line and named to the reader rather than
  placed. Below two prices there is no line at all. The hold can never empty the set, which is the
  rule carried over from Shin's own engine so that there is always something to show.
- **Three new defects while building it, D-114 to D-116, two caught by tests that already existed.**
  The band as first written held an HONEST price -- a 12 x 355 mL case against a 2 L bottle is a 2.1x
  spread between two real prices -- so it now needs three prices before it may hold anything. The new
  confidence flag was called "low", which is on the banned grading-word list. And that ban sweep only
  checks five places on the screen, so both new sentences were initially unchecked by it.
- **The 200-photo eval was real all along and nobody outside this machine could see it** (`6576137`).
  Three runs against a real model exist; the latest is 148 of 200 correct, 74.0%. They were hidden by
  an ignore rule, which is why a walkthrough doc still said the eval had never made a real model
  call. That paragraph is corrected in place, the ignore now covers dry runs only, and the three real
  runs are tracked.
- **Both remotes carry all of it.** GitHub was two commits behind at the start of the session and is
  now level; `git ls-remote` on both returns the same commit.

### Read by


---

## 2026-09-15, night (Aurik's PC): the nine-rules cleanup, four built and three raised

### To do

- **Jamin:** three of your nine rules reverse a ruling Aurik made on 09-14, and one of them is a
  contract with Google rather than a preference. They are written up in `docs/decisions.md` under
  "Three of Jamin's nine rules are raised as points rather than built", with the cost of each
  counted rather than guessed. Short version:
  1. **The grounded guard is what makes rule 4 legal, not what blocks it.** The same clause that
     forbids caching grounded results permits keeping their text for two years in that user's own
     history, and `GROUNDED_RETENTION_DAYS = 730` is that clause's own number. Deleting the guard
     does not unlock "record everything"; it removes the permission. Aurik's own argument carries
     its weakness out loud: Shin already crosses the *analysing* half of that same sentence on
     purpose, and says so at `gemini-grounded.ts:780-784`.
  2. **The tier words** ("factually a bad, reasonable or good price") against hard rule 2 and
     Competition Act s.74.01(1)(b). That decision names its own reversal condition and it is Aurik
     amending hard rule 2 himself.
  3. **Gemini as the price source**, which orphans 2,294 lines and 380 tests. Possibly the narrowest
     of the three: your ruling 10 already says Shin's own prices are not shown until enough are
     collected, so what is in dispute is deletion versus dark.
- **Jamin, two things only you can send.** (1) **The data token.** Your 09-15 to-do says to send
  Aurik his invite link and the data token; the invite link arrived by email on 09-14 and the
  token did not. Checked tonight: `SHIN_ADMIN_TOKEN` is unset in every scope on Aurik's machine,
  it is in no email, and `GET /api/admin/tables` on the relay answers 401 as it should. The relay
  itself is up (200 in 0.29 s), so this is the only thing between Aurik and the beta data.
  (2) **A grounded call needs your paid key.** Measured tonight on Aurik's free key: an
  UNGROUNDED image identification succeeds, and the same key answers HTTP 429 `exceeded your
  current quota` on a grounded search 450 ms in. So grounding has no free quota -- it is not the
  key being exhausted, the two were separated by running one of each. That matters because the
  one-call merge below has never been sent to Google: whether identity + offers + reviews fit in
  2,600 output tokens is reasoned, not measured, and a truncated array returns nothing for the
  whole scan. The first grounded run has to happen where the paid key is, which is your Mac.
- **Jamin:** two of your rules contradict each other and one contradicts itself. Rule 2 wants
  barcodes because they are cheaper than an image and forbids reading them automatically, which
  sends the default path back to the shutter. Rule 7 and rule 6 cannot both hold the moment a
  Gemini call fails. Neither is fixed; both are recorded.

### What changed

Four of the seven live contradictions on your sweep are built, and the cleanup of the two planning
docs is done. Every row below was checked by Aurik at the consumer, not accepted on an agent's word.

- **Rule 1, one call per scan.** A barcode miss was making **three** grounded calls, not two:
  `lookupBarcode`, a `prefetchPrice` fired inside it, and `lookupPrice`. The two request builders are
  merged into one prompt that returns identity, offers, reviews and description together. A barcode
  miss is now **one** call. The photo path is still two (one ungrounded read, one grounded search) and
  that is stated plainly rather than claimed: making it one would mean sending the image into the
  grounded request, which the guard forbids and which Google has not confirmed works.
- **Rule 4's plumbing.** The phone never sent a scan id, so nothing the phone showed could be
  recorded. It does now. Separately, the grounded search had been **running twice per scan** because
  the prefetch cache key never matched: the server keyed on brand + name, the phone sent a different
  string. The server now echoes the exact query it prefetched under. Proof: a real scan on a live
  server wrote `verdict_tier`, `verdict_confidence` and `verdict_sellers` into the scan row, three
  columns that have been uniformly NULL until today.
- **Rule 7.** `makeProvider` no longer hands the scan to Claude when Gemini is named with no key --
  it throws. And a machine in that state now refuses to start, naming the fix, instead of booting and
  answering every scan with a model nobody asked for.
- **Rule 2**, the "Scan barcode" button, in the same pass.
- **The docs.** `plan-gemini.md` section 4.3 described a second Gemini call for the price maths. That
  call was written and never wired, and rule 1 has now made it unwireable, so it is deleted and the
  section says the maths runs locally. Two of its eight algorithm steps had drifted from the code and
  are corrected against it.

**One thing rule 1 costs, so it is not discovered on a phone:** a failed search now loses the product
identity AND the prices. Before, a failed price search still left the name on screen. That cuts
against rule 6, and a test pins it.

**Two questions your Gemini adapter answered today**, both in your favour and both previously resting
on documentation alone. A real call on the free key confirms that `resolution` on the image part is
accepted (Aurik's earlier commit had removed `media_resolution` after a 400 and concluded the field
did not exist on this surface -- your spelling and placement were right), and that plain lowercase
JSON Schema is accepted, so the uppercase translation Aurik had argued for was not needed. Third
latency sample: 9,032 ms.

### Read by

---

## 2026-09-15, later (Jamin's PC): the nine-rules sweep

### To do

- **Aurik:** two of these are not on the "known contradictions already found" list below.
  Rule 2, the camera still auto-reads a barcode with no button gate. Rule 7, `makeProvider`
  in `identify/src/model.ts` silently answers with Claude whenever `SHIN_MODEL_PROVIDER` is
  unset or misconfigured, with no warning logged, on purpose. Everything else here is one of
  the already-known contradictions, checked directly against the code on this pull and
  confirmed still live, not yet fixed.

### What changed

A full sweep of the code (not the docs) against Jamin's nine rules in
`docs/jamin-gemini-rules.md`, done from a fresh pull.

- **Rule 1, one call per scan:** still two. `/api/identify/photo` calls Gemini once for the
  product; a separate client request, `/api/price`, calls Gemini again for price and reviews.
- **Rule 3, the price does not come from Shin:** `/api/price` still calls Shin's own price
  engine for the verdict first, and only attaches a Gemini grounded price as a second, separate
  field. `server.ts` says this is on purpose: "Google's answer sits beside ours. It is never
  mixed into it."
- **Rule 4, record everything:** the phone's price request (`camera.js`, the call to
  `ctx.api.price`) still never sends a scan id, so the server still has nowhere to keep what the
  phone actually showed the user.
- **Rule 5, legal marks and never blocks:** `identify/src/grounded.ts`'s guard still makes a
  grounded result impossible to store, by design, because of Google's terms.
- **Rule 6, always an answer:** same cause as rule 3. Shin's own engine can still answer "don't
  know" on a scan Gemini could have priced, because Gemini is attached as a supplement rather
  than the source.
- **Rule 2, no auto barcode read (new):** the camera still reads a barcode the instant one is in
  frame, no "Scan barcode" button gate. Its own comment says so: "it reads a barcode without
  anybody pressing anything."
- **Rule 7, Claude never takes over (new):** the `withFallback` wrapper being removed
  (commit `3ef4cc8`) is not the whole picture. `makeProvider` falls back to `AnthropicProvider`
  whenever the provider env var is unset, misspelled, or named `gemini` with no key present.
  Checked live: this machine's `.env` has it unset right now.
- A stale comment in `app/server.ts` still describes a "Gemini with a Claude fallback" choice
  that `model.ts`'s own header three lines away says was removed 2026-09-15.

Rule 8, the key only for live phone testing, checked clean: every test referencing
`GEMINI_API_KEY` uses a fake string or asserts its absence.

### Read by

---

## 2026-09-15, early morning (Jamin's Mac): HIGHEST PRIORITY

### To do

- **Aurik:** Jamin asks you to perform a cleanup of this repo for anything that goes against his
  Gemini rules in `docs/jamin-gemini-rules.md`. Those rules now outrank everything else here. Fix
  each contradiction to match them, or raise it with Jamin as a point if you think it should not
  change. The file lists the contradictions already found. Then build Gemini so it never calls twice,
  fix the pricing, and send the image of the object in one prompt that returns its details and the
  price math as discussed the night of the switch (a barcode scan sends only the digits, from a Scan
  barcode button).

### What changed

- Jamin set nine rules for Shin's Gemini path, in his own words, as the highest priority in the
  repo: one Gemini call per scan returns the product, prices, reviews and the price math; a
  barcode scan sends only the digits as text and a photo scan sends the image; prices never come from Shin's own data; everything a user does in the app
  is recorded; legal issues are marked as issues and never block a feature; every scan ends with an
  answer; Claude does not take over from Gemini; the Gemini key is used only for live phone tests;
  the decisions from the night of the switch rank highest.
- The Gemini search half is back on main (09b86ec), the Claude fallback is removed (3ef4cc8), and
  the Mac's live server runs with Gemini on. Jamin's first two phone scans showed Shin saying it did
  not know the price and nothing saved. Nothing further is being built on the Mac.

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
