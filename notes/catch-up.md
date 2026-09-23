# Catch-up: what changed, and what each person has to do

Read at session start by any Claude session on Shin, so its human hears what changed while they
were away and what they have to set up. Newest day first. Each day has **To do** (named person,
steps that need a human) and **What changed** (for the session to explain in plain words).
Never put a secret here: links with codes and tokens travel privately between Jamin and Aurik.

A session that has told its human everything under a day adds a line to that day's **Read by**.

---

## 2026-09-23 (Jamin's PC): typing searches only Shin's own data, the barcode button sends no photo, and the launch list is in the queue

### To do

- **Aurik: nothing is asked of you.** Read "What changed" before touching typed search, the test
  setup or `onBarcode`.
- **Jamin: the launch list is QUEUE.md band 7 and 7B.** Start with the Apple enrolment (7.2) if it is
  not done, since it has the longest wait, then the DataForSEO account (7B.2).
- **Whoever runs the Mac:** nothing to set yet. `SHIN_FREE_SCANS_PER_WEEK=5` goes on only once a
  test purchase works (7.15).

### What changed

- **D-164 answered: the invite code is set on the Mac.** D-155 to D-159 are reachable only by
  invited testers; they still need fixing before any public build (7.9).
- **Typed search (D-142 closed).** Jamin's ruling, recorded in decisions: a typed name searches
  only Shin's own data and answers only with the item and a price. No Gemini call on typing, so it
  is free and not counted against the weekly limit. This reverses two of his Gemini rules for the
  typed path only. New `app/src/own-prices.ts`.
- **Tests no longer write into the real user catalogue.** `npm test` now runs a global setup that
  points every test process at a temp file and fails the run if the real file changes. A test file
  run on its own, outside `npm test`, still skips that setup, so run through `npm test`. The Mac's
  deploy stage was checked: it runs tests with a stripped environment in the stage copy, so its
  live catalogue was never at risk.
- **D-147 closed.** The barcode button uploads a frame only with photo ID on and photo consent on.
  The shelf stream (D-148) is unchanged and still sends crops.
- **Price and free scans decided** (decisions, 2026-09-23): CA$3.99 a month, CA$29.99 a year, 5 free
  barcode scans a week, switched on only when purchases work.
- **The cheaper lookup has a logistics plan**, `docs/cheap-lookup-logistics-2026-09-23.md`. One
  correction made in review: DataForSEO's Shopping API has no live mode, so the plan uses its live
  Google results endpoint instead, and the 50-barcode test now also has a speed threshold.
- **The Notion page was cleaned** and rule 10 added (Jamin: keep it short, clean it every visit).
  Stopping now deletes your line instead of moving it to Finished.

### Read by

- Jamin (PC), 2026-09-23

---

## 2026-09-22 (Aurik's PC), evening: the server routes were swept, and one answer from you decides how bad six of them are

### To do

- **Jamin, one question, and it ranks above everything else on this list: is `SHIN_INVITE_CODE`
  set on the beta Mac?** (D-164.) With it set, D-155 to D-159 are a closed-beta annoyance among
  six testers who each got a link. **Unset, every one of them is open to anyone who can reach the
  host.** It is unset in every scope on Aurik's machine and no route discloses it, so nobody here
  can answer it. One line back from you settles the severity of six rows.
- **Jamin, D-155, the worst of the sweep.** Any caller can **write another device's consent
  record, including switching photo consent ON**. `server.ts:3451` takes `deviceId` from the body
  and authenticates nothing. The damaging direction is not turning someone's consent off, it is
  turning it on: `shelf.ts:79` gates frame storage on exactly that table, so forging a stranger's
  row makes the server accept and keep their camera frames. This is the consent record Law 25
  rests on.
- **Jamin, D-160 and D-161, disk.** One client wrote **42 MB in 788 ms** through
  `/api/shutter/frame` -- no rate cap, no per-device cap (the route carries no device id at all),
  no disk guard. At that rate a 250 GB disk goes in about 80 minutes. And the shutter request log
  writes **before** the invite gate, so an unauthenticated caller makes directories at ~589 a
  second; a few hours of it makes your own `/api/admin/shutter` unusable, because it stats every
  entry.
- **Whoever runs the Mac, D-163.** `SHIN_DATA_DIR` does **not** control where shopper photos land
  -- `photosDir` falls back to a path relative to the source file, unlike `shutterDir`. So **a
  backup of `SHIN_DATA_DIR` contains no photos**, while the comment above that function says
  photos live there precisely so the nightly backup copies them. Not fixed here on purpose: the
  consistent fix relocates photos on any server that sets the variable, without migrating what is
  already written.
- **Still open from the entries below:** D-147/D-148 (the barcode button sending photos with
  consent off), D-139, D-141, D-142, D-146, D-150.

### What changed

**`/api/admin/` is fine, and that was the first thing checked because it would have outranked
everything.** Off unless `SHIN_ADMIN_TOKEN` is set, and unset every admin path answers 404 rather
than advertising itself. Constant-time compare. Read-only by construction, not by inspecting SQL:
`CREATE TABLE` gets "attempt to write a readonly database", `readfile()` gets "no such function",
and both `?path=../../server.ts` and `?path=C:/Windows/win.ini` get "path must stay inside the data
folder". Verified at the consumer in all three states.

**Nothing was fixed this run,** which is the honest outcome: every finding is either a product
call, an operations call, or waiting on the invite-code answer. Ten rows logged, D-155 to D-164.

**What was checked and found FINE,** and this is the substantial half of the report: **no error
leakage anywhere** -- not a stack trace, absolute path, SQL fragment, provider error string or
internal id in any shopper-facing body across all 25 routes and their malformed variants; refusals
are one plain sentence. `readBody` caps before accumulating, refuses a declared oversize without
reading it, and answers rather than hangs on a **lying** content-length. Every hostile body tested
(`[]`, `"string"`, `null`, `42`, `{{{`, 2000-deep nesting) answers a sentence and a correct status.
**Nothing wedged the server:** 40 concurrent heavy requests, 10 slowloris half-open bodies, an
absolute-form request line, a 20 MB refused body -- `/api/health` answered throughout and the
process never died. The invite gate itself works as documented. Two claims were **refuted**:
`/api/price` does not write onto another device's scan row, and `scan-rating/delete` returning true
for a nonexistent id is deliberate.

**Not verified:** anything on a real paid Gemini path, the Overpass outbound on `/api/stores` (the
run was localhost-only by instruction), and real disk exhaustion -- the write rate was measured and
the outcome extrapolated, not reproduced.

### Read by

- Aurik, 2026-09-22.

---

## 2026-09-22 (Aurik's PC), later still: the camera was swept, and the barcode button is sending photos

### To do

- **Jamin, D-147, read this one first.** Pressing the barcode button uploads a **full-resolution
  1280x720 JPEG of whatever the camera is pointed at**, to the server's disk, **with photo consent
  switched OFF**. `camera.js:3115` calls `beginShutter(video)` inside `onBarcode` with no
  `FLAGS.photoId` guard and no consent read, and the server does not check either:
  `saveShutterFrame` tests only `SHIN_SHUTTER_LOG !== 'off'`, so it is **on by default**. The
  frame collection itself is yours and deliberate (your comment, 2026-09-13/17, "collecting
  everything"), and it predates the flag. What is new is that `flags.js:43` now promises that with
  `photoId` off the camera **"never sends a photo"**. It does, on the only scan button the MVP
  leaves anyone. Proven with a file on disk, 28,913 bytes. **Two questions, both yours: does the
  shutter log obey the photo switch, and does `photoId` off silence it?** Until one is answered
  the flag file says something untrue about the build testers are about to get.
- **Jamin, D-148, the same shape.** The shelf capture still streams a crop every 5 seconds, up to
  40 a visit, gated only on `consent().photos` -- which **defaults to true** in both places. And
  the Photos row on You still reads "Keeps the picture from a photo scan, tied to that scan": it
  describes the one path that cannot run, while what it actually authorises is the barcode frame
  and the shelf stream. The wording is a defect on its own even if both streams stay.
- **Jamin, D-150.** On a keyless or misconfigured server, 100% of scans tell the tester *"That is
  a gap in what I have been taught, not a fact about the market"* -- when the truth is
  `model_client_error`, the call never left the building. There is no branch for that reason, so
  it falls through to the no-match refusal. Needs a new line in voice.js in three personalities
  and two locales, so it is not a one-liner.
- **Aurik, D-151, wants a phone.** The "Point me at the barcode" line that `photoId` off promises
  is pre-empted whenever the eye has a coaching hint (`sayNoBarcode` returns early on `coachKey`).
  The lane only reached the promised line with the camera denied. Its frames were synthetic, so
  how often a real aisle silences the eye is unknown.
- **Still open from the entries below:** D-139 (location asked twice), D-141, D-142, D-144, D-146.

### What changed

**Fixed here, D-149.** A selected button on the price pad was **white on white in dark theme,
1.09:1**, because `camera.css:669` ended `color: var(--bg, #fff)` and **`--bg` is defined nowhere
in the app**. The fallback always won; light theme survived by luck. Now `var(--surface)`, the
token that means this, with no fallback: an undefined token should fail visibly rather than hide
behind a literal. Dark is 16.33:1, light 18.11.

**Also logged, not fixed:** D-152 leaving the shop picker by the X throws away the typed price and
the whole scan, D-153 three more sub-44px tap targets (the grabber at 86x24 is the main way to open
any sheet), D-154 one button at 4.45:1, a hair under the floor.

**What was checked and found FINE,** so nobody redoes it: the shutter button really is gone with
`photoId` off, no dead photo affordance and no photo wording anywhere in the camera's visible text,
`/api/identify/photo` never called once; **both pins hold under a hostile test** (a `fr-CA` phone
with a stored US market still renders English, Canada, `$2.99` not `2,99 $`, and sends
`market=Canada&currency=CAD&language=en-CA`); the live barcode path decodes and runs end to end in
a real browser; no sideways scroll, nothing clipped, no console errors at 390px in both themes
across five states.

**Not verified, and the lane said so:** the Gemini answer sheet (a87/a88/a89) was never reached,
because with no paid key every scan lands on the refusal sheet instead. Those three tags are still
unphotographed at 390px. Nor was a real printed barcode through real optics.

### Read by

- Aurik, 2026-09-22.

---

## 2026-09-22 (Aurik's PC), later: your paywall and quota were run for the first time, and two of the six findings are yours to decide

### To do

- **Jamin, D-142, and this one costs money.** The weekly free-scan limit only covers BARCODE
  scans. `app/server.ts:2631` is `const overLimit = gtin ? await scanLimitRefusal(...) : null;`
  and that ternary is the only call to it in the server. A shopper at their limit taps the
  keyboard instead of the barcode button and gets unlimited paid Gemini calls. Reproduced on one
  device in one second: gtin request 402, text request 200. **Does a typed scan spend one of the
  week's free scans?** Almost certainly yes, but that changes what a shopper gets and it sits
  under the subscription revenue, so it is yours, not a lane's. (`/api/identify/photo` has no
  check at all either; flag-off today, so latent.)
- **Jamin, D-141, your call and it may be the right one.** With `REVENUECAT_SECRET_KEY` unset,
  `isPlus` trusts the `x-shin-plus: 1` header, so `localStorage.setItem('shin.plus','1')` in
  devtools grants Shin Plus: no purchase, no receipt, limit never fires. Your code names it a
  beta seam and prints a startup warning, so this is logged rather than reported as a surprise.
  Worth deciding before testers have the build, because it defeats the one thing the paywall
  enforces.
- **Jamin, D-139 still open** from the entry below: permissions and consent both carry the same
  location switch, back to back.
- **Jamin: still owed.** `SHIN_GEMINI_TIER` on the Mac, and the paid key.

### What changed

**A debugging lane now exists and this was its first run.** `.claude/agents/debugger.md`: the only
lane that hunts defects, never builds, never commits, never picks a defect number. It walked the
paywall at 390x844 in both themes and drove the quota against a real server.

**Fixed here, D-143.** "Restore purchases" drew as an unreadable grey slab in dark mode, **1.59:1**.
`.btn--ghost` set a colour and no background and no border, and the app has no global `button`
reset, so the browser's own grey filled it in. One line each way; dark is now 5.82:1, light 5.06.
It is the only user of that class and it had never been seen rendered, which is the whole point of
walking a screen.

**Also logged, not fixed:** D-144 the Terms and Privacy links still point at `.invalid` on a screen
that is reachable today, D-145 `/api/quota` answers for any device id with no auth, and **D-146 the
server never reads `.env`** -- no dotenv, no `--env-file`, and the "no key" startup warning is gated
on `SHIN_MODEL_PROVIDER`, which nobody sets. That last one probably explains more than one "the key
is set and it still refuses".

**What was checked and found fine,** so nobody redoes it: both paywall states at 390px in both
themes (no overflow, no clipped text, no tap target under 44px, no console errors), both prices
come from the store rather than being hard-coded, plan selection and the buy loop work against a
stubbed store, the OFF default for `SHIN_FREE_SCANS_PER_WEEK` really is off (verified at the
consumer, not read off the code), and `/api/quota` agrees with the server's own count to the
millisecond, including correctly not charging a shopper for our own failures.

**Not verified:** a real barcode 402 landing on the paywall at the consumer. Both ends are proven,
the hop between them is code-read only; it needs a phone or a printed barcode at a webcam.

### Read by

- Aurik, 2026-09-22.

---

## 2026-09-22 (Aurik's PC): your MVP flag batch is merged, and the permission ask is back in the product

### To do

- **Jamin: one product call, D-139.** With the welcome off, the permission screen and the consent
  screen are adjacent, and the location switch on each is the SAME switch (both go through
  `consent-actions.js`). So a first launch is asked for location twice, on two screens in a row.
  Inside the welcome flow twenty steps separated them. **Which screen owns that row?** Not fixed
  here on purpose: the panel is shared with your live step 24, so dropping the row would change
  the welcome flow too.
- **Jamin: still owed from yesterday.** `SHIN_GEMINI_TIER` on the Mac, and the paid key.
### What changed

**Your flag batch (`7e784d7`) and the permission screen are now one tree, and they needed each
other.** `FLAGS.onboarding = false` shipped with `firstScreen` going Consent then Camera, which
**dropped the camera and location ask out of the product entirely** (D-138). Not your oversight
so much as an impossible ask: the screen did not exist. The ask is step 24 INSIDE the welcome
flow, so no flag could have kept it. That is what yesterday's finding 2 was about.

It is now:

- `permissions-panel.js` -- the two switches, the phone's own prompt, the denied note and the
  demo card, as one function that step 24 and the new screen both draw. A test fails if either
  grows its own copy.
- `screens/permissions.js` -- that panel as a screen, **tag a97** (a94 was yours, the paywall;
  tags are permanent so mine renumbered).
- `firstScreen` with the flag off is now **Permissions, Consent, Camera**. The ask keeps step 24's
  place, in front of consent, because that is where it sits inside the flow.
- `permissionsSeen` records that this device has been asked. Walking step 24 sets it, so with the
  welcome back on nobody is asked twice; a replay never sets it, per the replay contract.

**Seen at 390x844, in a real Chromium, both themes.** Renders correctly, no sideways scroll,
nothing wider than the viewport, no clipped text, no console errors, the demo link came back with
a real answer (Kraft Dinner Original, 225 g) off the live route, and Continue lands on consent.
One defect found and fixed there: **D-140**, the two switches were 32px high to the thumb, under
the 44px minimum, and with the welcome off they are the only controls on the first screen anyone
sees. An invisible `::before` grows the hit area to 44 and the pill still draws at 32, so the
screenshot is pixel-identical and your step 24 is unchanged.

**Everything of yours is kept.** The paywall, the quota, `flags-boot.js`, the price-match line,
the four flags and their tests are untouched apart from the two assertions that encoded the old
order, which now expect Permissions first and say why.

1340 tests, 1335 pass, 0 fail, 5 skipped. Typecheck clean. Seen at 390px, both themes.

### Read by

- Aurik, 2026-09-22.

---

## 2026-09-21 (Aurik's PC), later: the photo guard was failing open, and three things in the MVP plan are already answered by the code

### To do

- **Jamin / the Mac, set `SHIN_GEMINI_TIER` on the beta server now.** `db1b8d9` is deployed and
  **the photo path refuses until you do.** That is deliberate and it is the fix, not a regression:
  the guard meant to stop a shopper's photograph reaching Google's training pipeline only fired on
  the exact string `free`, so an **unset** variable read as safe -- and unset is what every machine
  here is, `.env` included. It was inert on precisely the machines it was written for. Undeclared
  now means free and refuses; `paid` is the only thing that opens the door. Set it to `paid` if
  that server holds a paid key, `free` if it does not. Either way the server boots and the barcode
  and typed paths are untouched -- declaring `free` no longer bricks it, which is the other half of
  why nobody ever declared it. Same principle you already settled for the eval half in D-112.
- **Aurik still owes the `votes.ts:184` design call** (500 ms barcode linger, wrong-product risk),
  and the paid-key ask stands for the eval.

### What changed, and what it means for `docs/mvp-plan.md`

Three findings from reading the code against your plan. Two of them save work, one is a blocker.

**1. The thumbs up/down is already built, end to end. Do not build it.** `app/src/ratings.ts` has
`rateScan`/`deleteRating`/`ratingFor`/`ratingHistory`/`ratingCounts`, keyed on `scanId` +
`deviceId`, with a closed reason list for thumbs-down. Two tables written in one transaction:
`scan_rating` (latest, `migrations.ts:168`) and `scan_rating_history` (append-only, every tap,
`migrations.ts:449`). Routes `POST /api/scan-rating` and `/api/scan-rating/delete`
(`server.ts:3242,3282`), firing a `thumbs` telemetry event. Client renders on **both** answer
sheets -- the own-engine verdict (`camera.js:818`) and the Gemini sheet via `thumbsBlock()`
(`camera.js:1262`, called at `:1398`) -- with an undo toast, and `you.js:309` shows the device's own
counts. Votes key on `scan_id`, so they already join to the answer. **The only gap is aggregation
across users:** nothing exports `ratingCounts` beyond one device's own profile view. That is a
reporting job, not a feature.

**2. The permission screen cannot become the first screen by switching onboarding off, because it
lives inside onboarding.** This is the one blocker in the build order. It is not a standalone
screen: it is step `n:24` of the welcome flow (`onboarding-flow.js:132`), rendered by
`permissionsBody()`/`paintPermissions()` (`onboarding.js:235,313,460`) and coupled to onboarding's
own render loop and a demo-scan fetch. Switch the welcome screen off and the permission ask goes
with it. It has to be **extracted into its own registered screen first** -- a prerequisite for step
1, not a consequence of it. Related: the consent screen is next in line, but it only asks
photos/location as data toggles; it is not an OS permission prompt and never asks for camera
access, which is deferred to the first shutter press (`main.js:17-20`).

**3. Two smaller corrections.** *"Savings overview -- it's already off"* is not true:
`screens/savings.js` is a complete registered screen (`main.js:49,52`) and `you.js:289-292` renders
a live row whose handler at `:640` navigates to it. Nothing gates either today. And *"the country
picker is one line to undo"* is half right -- flipping the default really is about one line
(`store.js:117`), and the lookup genuinely does work worldwide because `scan-body.js:69-93` only
forwards market strings into the prompt with no server-side branching, but *pinning* also means
hiding a live picker screen and its You row, which is a second change.

**Also worth knowing before step 4.** The free-scan counter wants "10 a week per phone, survives
reinstall". `189eb83` built `KeyedLimiter`, but it keys on **invite code and network address**, in
memory, reset on restart (`rate-limit.ts:11-13,81-94`). A `deviceId` exists and is threaded
everywhere, but `rate-limit.ts:7-8` says it was deliberately rejected for money-relevant limits:
*"the device id is whatever the phone says it is, so a script can send a new one every time."* So
that counter is either a knowingly spoofable limit or real device attestation. It sits directly
under the subscription revenue, so it is a founders' call rather than an implementation detail.

**And the price-match line is not quite "a small job".** `priceMatchAdvice()`
(`app/src/price-match.ts:541`) needs a competitor `offer.priceCents` and the shelf
`bannerPriceCents`, neither of which is currently threaded through the verdict-rendering path in
`camera.js`; it deliberately returns `messageKey`/`messageVars` with no English string, so it needs
new copy in both locales; and its one unresolved provenance disagreement (the No Frills 7-day
window) has to be surfaced or suppressed by the caller.

### Read by

- Aurik, 2026-09-21.

## 2026-09-21 (Aurik's PC): your two rulings answered, the seven UI faults closed, and the key ask is narrower than we thought

### To do

- **Jamin, the key ask is still open, and it is narrower than the files have been saying.** There
  IS a `GEMINI_API_KEY` in `.env` now. **It is free tier**, and `app/server.ts:3646` refuses to
  serve shopper photos on a free-tier key because Google trains on free-tier input. So the blocker
  was never "no key", it is **"no paid key"**, and that ask has stood since 09-15. It now blocks a
  third measurement. Nothing in the photo path can be measured until it lands.
- **Jamin, your 2.5 question may be answerable on the free key, and if so it is worth doing
  today.** Your own note says `gemini-scan.ts:407` sends `resolution` unconditionally while
  `gemini.ts:54` records it as Gemini-3-only, and that one request against a real key settles it.
  The thing being asked is whether 2.5 **rejects the field** -- a 400 against a 200 -- not whether
  the answer is any good. That is an API-acceptance question, and a free key returns the same
  status code a paid one would. If it does 400, roughly half of all devices are getting a total
  failure on every photo scan right now. It is one request either way.
- **Jamin, two numbers before ruling 5 can be built** (see below): how stale our imported Open Food
  Facts snapshot is, and how often OFF identity actually changes for a barcode. Neither of our
  notes states either, and the ruling's shape depends on both.
- **Jamin, your other two to-dos are untouched and still yours.** `shelf.grade` asked for, paid for
  and dropped at `gemini-scan.ts:902`, and absent from the schema's `required`; and the inaccurate
  band comment at `gemini-scan.ts:964`.
- **Aurik, the design call you owe back.** `votes.ts:184` keeps a barcode confirmed 500 ms after it
  leaves frame. Wrong-product risk, and still not answered.

### What changed

**Your ruling 1 is met, not disputed, and I want to correct how my last note framed it.** The
clause that carries it is your own: *"the price is cached for six hours and always shown with when
it was checked"*. On 09-19 that was the ruling's promise rather than the app's behaviour. `a7987cd`
made it true -- a recalled answer now carries the timestamp of the call that produced it
(`server.ts:2947` passes `recalled.at` through), `:1677` falls back to now **only** for an answer
this request genuinely checked, and `app/test/repeat-cache.test.ts` holds it. There is no
disagreement here for you to answer. The only part still open is the half no code can settle: no
tester has yet been shown a price that moved inside the six hours, so nobody knows if they mind.

**Your ruling 5: accepted, with a condition, and not built.** The distinction is real -- a live
Open Food Facts call is not Shin's product list -- so the ruling stands and the live call is
allowed. The condition is the shape ruling 1 already set: **the imported copy answers first, live
OFF is the fallback when it misses, and the answer records which of the two it used.** Being
permitted is not the same as being first: a network round trip on every scan, for bytes already on
our disk, is paid by the shopper in latency and in a third party learning what they scanned. Both
rulings are annotated in `docs/decisions.md` where you can reverse them.

**The seven faults from your 09-20 sweep are closed** -- five in code, two as decisions.
D-131 Savings' dead You tab (checked all seven `pageBar` callers first; it was an instance, not a
class -- every other sub-page already wired it). D-132 the Licences door, now on You, which
`lib/pagebar.js:94` already said was where it belonged. D-133 **half**: consent gets a back, setup
deliberately does not, because first run is a state-machine gate and back from setup means clearing
`onboarding.doneAt` and throwing away answers already written to the store and the events queue.
D-134 the 1400 ms timer is gone and both exits go through `goBack` -- note the thank-you state had
**no exit control at all**, so removing the timer alone would have stranded people; it has a Done
button now. D-136 the plan step keeps your prices and marks them NOT LIVE, same badge-plus-one-line
shape the demo scan already uses. D-135 the sign-in step stays, recorded as deliberate rather than
deleted. Verified in a browser at 390x844, nine checks, not by reading the diff.

**The status files had drifted from the code and are reconciled.** The head of NOW.md still
described `/api/identify/photo -> IdentifyStage.fromCrop` -- the path your `d3e4f0b` deleted two
days earlier -- and nothing had updated it since, so the one screen that wins was describing code
that no longer exists. Also recorded: the *"retrieval is 32 of the 52 failures"* figure was measured
while the catalogue still picked, so it is **re-measured before any retrieval work starts** rather
than quoted. And DEFECTS.md's own count said 127 when there were 137 rows, with a breakdown summing
to 128 -- it is flagged for a proper recount rather than patched, because a plausible miscount is
worse than an admitted gap.

**One of your list items was already done.** `beta-gaps` rule 13 says to clean a CLAUDE.md line up
(*"the good/fair/high call is arithmetic, never asked of a model"*). You deleted it yourself in
`a171dbd`, hours before that list was saved. CLAUDE.md has no occurrence of "arithmetic" today, and
the line was never in priority 1 anyway.

### Read by

- Aurik, 2026-09-21.

## 2026-09-20 (Aurik's PC): six bugs in the new scanner code, and one question worth a single request

### To do

- **Jamin, one check is worth more than everything else on this list, and it needs a key we do not
  have.** `gemini-scan.ts:407` sends `resolution` on the image part unconditionally, but
  `gemini.ts:54` records that per-item media resolution is documented as Gemini 3 only. If 2.5
  rejects it, **every 2.5 photo scan returns a 400, and the model split sends about half of all
  devices to 2.5.** One request against a real key settles it. Please run it before the next beta
  session.
- **Jamin, `shelf.grade` is asked for, paid for and then dropped.** `scan_prompt.md:145` tells
  Gemini to return great / good / bad / middle against the shopper's three ranges, which is the
  "factually a bad, reasonable or good price" you asked for and called non negotiable.
  `readAnswer` (`gemini-scan.ts:902`) reads only `zone` and `label`, so it never reaches the phone
  and "great" collapses into "under your line". It is also missing from the schema's `required`
  list, so on 3.x the model may legitimately omit it. Surfacing it changes the verdict and touches
  `Shin_Gemini_Pricing_Engine/response_schema.json`, so it is yours.
- **Jamin, a comment in `gemini-scan.ts:964` is inaccurate and the difference costs a guard.** It
  says the plausibility band is "the same band `gauge.ts` already uses". It is not: `gauge.ts:594`
  deliberately uses a leave-one-out median and its own comment says that with the offer inside the
  median "the band cannot fire". `gemini-scan.ts:1053` tests the offer against a median that
  includes it. Fixing it means computing a median we own, which rule 3 forbids, so the question is
  yours rather than a lane's.
- **Aurik, one design call.** `votes.ts:184` keeps a barcode confirmed for 500 ms after it leaves
  the frame, so swinging from one barcode to the next and pressing inside that half second sends
  the first one's digits. It is a wrong-product risk. The fix is a choice about how recently the
  leader must have been seen, not a defect with one right answer.

### What changed

Three lanes on disjoint files. Six bugs found, every one of them reproduced by a test that was red
before it was green, and each one re-checked here by reverting the source and watching the red come
back.

**The photo path, in `identify/`.** A reply holding two unfenced JSON blocks took the truncated
first one and served it as a repaired answer, so the shopper saw a draft with one offer and no
price line while the real answer sat further down the same string; two complete blocks returned no
answer at all, which rule 6 forbids. A price block with a null verdict and a null reason drew
neither a line nor an explanation, which is the exact defect `grounded.js`'s own comment already
records. And a retailer page saying `"price":"1,299.99"` was read as one dollar, so the verifier
stamped correct scans as mismatches against a price nobody charges.

**The capture path, in `app/src/eye/`.** `StabilityGate` could never settle, because the history
was pruned to the samples inside the hold window and then asked whether the oldest survivor was
older than it. Auto-capture is switched off in the shipped app, so this cost nobody anything yet;
it was a trap for whoever turned it on. Live today, though: a scene-change cancellation fired
neither event, and the screen has no stand-in timer by design (D-083), so pressing the shutter
while turning away left the thinking dots up for good. A crop that threw also leaked its whole
burst.

**Price matching, new and wired to nothing.** `app/src/price-match.ts` holds the eleven Canadian
banner policies with their sources. It produces no number, ever. It is inert until the question
above is answered.

App 1200 to 1241 tests, identify 248 to 252, both green, typecheck clean in both, run after all
three lanes finished and again after merging your eight design commits.

### Read by

- Aurik, 2026-09-20.

---

## 2026-09-20 (Aurik's PC): the other kind of competitor, read from outside

### To do

- **Jamin, one finding is worth your time before anything else here.** Price matching is the
  Canadian grocery behaviour, it is the whole of what Flipp and Reebee are for, and Shin says
  nothing about it. No Frills, Real Canadian Superstore and Maxi match a competitor, four items a
  transaction, digital or print ad shown at the till. Walmart Canada stopped matching competitors.
  Metro, Food Basics, Sobeys and Costco never did. So on a walk-away verdict there is often a real
  action Shin could hand back instead of a judgment, and the cheaper offer and its seller are
  already inside the answer Gemini returns. It changes what the verdict says, so it is yours.
  `docs/shipped-scanners-2026-09-20.md` section 1, with the policy table and the sources.
- **Aurik, six candidates are listed unranked in section 6** and none was started, because the
  ranking is his.

### What changed

A second competitor survey, with no overlap with the ten-repo one. That survey read source code,
so it can only see how a scanner is engineered. This one reads the apps a Canadian shopper
actually has installed (Flipp, Reebee, Yuka, ShopSavvy, Google Lens), which are all closed, so
every claim carries a public link instead of a file and line, and the two places the sources
disagree are written down rather than resolved.

Four things it establishes. Price matching is a shipped competitor behaviour with no answer in
this repo, and three separate rules already written here point at it. Yuka is cited twice in
`docs/decisions.md` for strategy and never for mechanism; four of its mechanisms are visible from
outside, and Shin already has one of them (Gemini's own alternatives, `camera.js:1275`). Google
Lens now does identify-and-price in a physical store for free, so the part Shin shares with it is
not the part worth competing on, and the verdict is. And the category answers in about three
seconds while Shin's own scan-to-answer time has never been measured, which `553218e`'s per-stage
timings now make a one-run question.

Nothing was built off it. Section 6 lists the candidates and who decides each.

### Read by

- Aurik, 2026-09-20.

---

## 2026-09-20 (Aurik's PC): the demo scan was on screen with no styling at all

### To do

- **Jamin, one question, and it is yours because it touches the verdict.** The demo scan answer
  carries no price and no verdict: `DEMO_SAMPLE` in `app/server.ts` has a label, a brand, a name,
  a size and a zone, and nothing else. So the card a person sees before granting camera permission
  names a box of Kraft Dinner and stops. The client already draws a price line and a verdict line,
  each badged, the moment the route sends `askingCents` and `verdictWord`; both are dead today. A
  demo that shows no price does not demonstrate the thing the app is for, but inventing a price is
  yours to allow, not mine to add, so nothing was added.

### What changed

**Item 19's demo shipped with seven class names and not one CSS rule**, so on the permissions step
the link rendered as the browser's own grey button and the answer as two bare lines of text. It was
the only place in the flow that looked like a default. Seen at 390 px in both themes before and
after, not read off the source.

It now uses the tokens the rest of onboarding uses: the link is quiet and underlined in the
register the "Skip the rest" link already has, because "Continue" is the one committing action on
that page; the answer is the same surface card with a hairline and a 16 px radius that the two
permission rows are; the DEMO badge is mono, uppercase and filled, drawn as a marker rather than
decoration. The rule that the badge repeats beside a price and a verdict is kept, with the inline
copies sized down. Measured in the live DOM: 8.64 and 5.21 on the link, 6.71 and 4.68 on the badge
(dark, light), 44 px tap target, no horizontal scroll.

**And the card said "Kraft Kraft Dinner Original".** Brand and name were glued together, and most
catalogue names already carry the brand. The route sends a written label and it is used now, with
the glue kept only as a fallback and only when the name does not already start with the brand.
Two tests hold it.

App suite 1198 to 1200, 0 failures, typecheck clean, run after the dev server was stopped, because
a live server holds the database and turns unrelated tests red.

### Read by

- Aurik, 2026-09-20.

---

## 2026-09-20 (Jamin's PC): twenty-two scanner features landed in one commit, 553218e

### To do

- **Aurik, pull before you touch the scan path.** `553218e` changes `app/server.ts`,
  `app/src/eye/*`, `identify/src/providers/*`, `app/public/js/*` and adds schema versions 15 and
  16. Anything you have in flight on those files will conflict.
- **Aurik, two rulings are worth your disagreement if you have one**, because they shape the cost
  model: a repeat scan of a known barcode is now answered from a stored Gemini answer rather than a
  new call, and a live Open Food Facts call is allowed for identity while our own imported copy of
  that same data stays unconsulted. Both are in `docs/decisions.md` under "Nine rulings so the
  competitor-survey build could start", each with the condition that reverses it.

### What changed

Ten open-source scanners were read in source (`docs/competitor-scanners-2026-09-19.md`, 278
mechanisms we did not have). Twenty-two of them were chosen, specified with their dependencies
(`docs/scanner-build-order-2026-09-19.md`), and built.

**The camera path:** an absolute sharpness floor and a motion gate with a forced-capture escape, a
second decode attempt with grayscale and contrast preprocessing, continuous autofocus and an
explicit readiness wait, median-smoothed box tracking, an explicit busy flag with a dropped-frame
count, and scene-change cancellation that can only cancel an unsent capture, never hide a paid
answer.

**The model call:** thinking level per model tier, a hardened response schema that counts unknown
keys instead of ignoring them, the currency and plausibility guards moved onto the live path where
a failing price is withheld rather than replaced, per-stage timings, grounding skipped only when
nothing is searchable, and `price-verifier.ts`, which fetches one cited allowlisted retailer page
and marks the scan when its price disagrees with Gemini's. It never changes what is shown.

**The server:** check-digit validation before anything is spent, a persistent repeat-scan cache
(identity forever, price six hours, background refresh after one hour), a live Open Food Facts
lookup for identity only, background enrichment that writes beside the shown value and never over
it, Gemini-path misses wired into the gap table, streaming payload-cap enforcement, same-origin
enforcement that allows a missing Origin and refuses a mismatched one, and a demo scan route whose
rows are marked so they can never count as real scans.

**The client:** an in-flight guard, honest copy for each of the eight failure codes with a real
countdown from the server's own retry-after header, iterative image shrinking, and a labelled demo
scan before camera permission.

**Two real defects fell out of writing the tests red first:** a spend-cap refusal was being cached
as though it were Gemini's answer, poisoning later scans of that barcode, and the gap recorder
checked a variable that always falls back to the barcode digits, so barcode misses never wrote a
gap row.

App suite 1087 to 1198, identify 229 to 248, both green, typecheck clean, run again from a separate
session after the build agents reported. `npm start`, `dev` and `check` now build the camera bundle
themselves, so a fresh checkout no longer has a dead camera.

### Read by

- Aurik, 2026-09-20. Told both to-dos: pulled before touching the scan path, and the two rulings
  are with him to disagree with.

---

## 2026-09-19 (Aurik's PC): the shared Notion page has never been reachable from this side

### To do

- **Jamin, share the page with Aurik's Notion account.** `Shin: who is working on what`
  (`3db09fb15fcf8155bc04ef261e4e1d9c`). Share, invite **aurikdisler@gmail.com**, Can edit.
  Diagnosed precisely rather than guessed: the Notion connector on this machine IS connected and
  working -- a workspace search returns Aurik's own pages -- and a fetch of that specific page
  returns `404 object_not_found: Check that you have access`. So this is step 2 of the setup in
  the 2026-09-14 entry below, not step 3, and that entry's own instruction for this case is
  *"stop there and tell Jamin"*.

### What changed

**Nothing, and that is the point: this has never worked from Aurik's side, on any day.** The
rules in `CLAUDE.md` make that page one of the only two things every session shares -- GitLab for
the code, the page for intent -- and they turn on it:

- Rule 2, **claim what you are working on**, so two sessions do not take the same part.
- Rule 3, **refresh every 20 minutes and at every push**.
- Rule 7, **whoever finds main red writes it at the top of Needs attention**.

Aurik's sessions have been doing none of that, because the page 404s for them. Every message from
this side has gone through `notes/catch-up.md` instead, which only arrives when you pull.

**This is the mechanical cause of yesterday's collision, and it is worth naming plainly.** On
09-17 and 09-18 Aurik fixed four defects in the photo-identification path -- D-122, D-123, D-125,
D-126 -- and overnight you replaced that path with `gemini-scan.ts`. Nobody did anything wrong.
The rule that exists to prevent exactly that (claim your part, see the other claim) could not run,
because one end of it has no access. Two commits today, `76528b2` and its inventory doc, are
partly a consequence.

**Also, under rule 7 and late:** main's app suite was red on Aurik's machine this morning after
your push. It was NOT your push -- the tests could not tell a busy laptop from a dead server, and
it is fixed (D-127). Rule 7 says that belongs at the top of Needs attention within minutes. It
went into a commit message instead, because there was nowhere else to put it. That is the cost of
the missing access, shown once concretely.

**Nothing here is a request to change the rules.** They are good rules and the 20-minute heartbeat
is the right shape. They need one Share click to start applying.

### Read by

---

## 2026-09-19 (Aurik's PC): the server can die at boot, and the red suite was not your fault

### To do

- **Jamin, check this on the Mac before the next beta session.** `node app/server.ts` can print its
  banner and then EXIT, with *"catalogue worker did not answer a warm within 5000 ms"*. It happens
  here. The `warm` job is a pre-load -- one tiny embed to pull the ONNX model into memory -- and on a
  cold disk it can take longer than the 5-second budget. Nothing in the repo awaits that promise, so
  the rejection is unhandled and Node 24 exits the process. **It was dying waiting for the embedder it
  had just printed `meaning search off: 0 rows embedded` about.** Fixed (D-129): the failure is caught,
  says *"catalogue warm did not land, serving anyway"* on stderr, and the server stays up. Pull before
  you next start it.
- **Jamin, the catalogue command from yesterday, if it has not been run.** `npm run backfill:derived`
  in `catalogue/`. The cross-language work does nothing without it and it does not travel with the
  commit. Back the database up first.

### What changed

**Your audit's item-1 concern is fixed, and it was worth more than a concern.** You found that one
decode slower than 1.5 s sets `#wedged` and nothing clears it, and wrote *"Not a verdict change, a
concern"*. It is a user-facing failure with no recovery: one slow frame on a cold phone, or a
backgrounded tab where timers are throttled, ends barcode scanning for the visit and the only way
back is leaving the screen. D-128.

The wedge itself is right and stays -- an aborted module's `readBarcodes` never settles and never
rejects, so awaiting it stops the frame loop. What was wrong is reading ONE timeout as that death.
A dead module never settles at all; a slow one settles LATE, so the outstanding promise is now
watched instead of abandoned and its late arrival clears the wedge. Three consecutive
never-settling decodes still wedge, which bounds the leaked promises.

**The app suite was red on my machine and it was NOT your push.** Four tests in
`hostile-request.test.mjs` reported the server dying on hostile requests. It never died. Their
`alive()` was one fetch with a 2,000 ms timeout and `catch { return false }`, so "no reply in two
seconds" and "the process is gone" were the same value -- and `node --test` runs files in parallel,
so a loaded laptop reads as a corpse. Five of five pass alone; the whole suite passes at
`--test-concurrency=1`. Fixed by distinguishing the two (a dead process REFUSES the connection, at
once and every time), not by raising the number, which would only move the flake to a busier
machine -- probably yours. D-127.

**Those three earned two build standards**, under the rule that a shape logged twice becomes a rule:
slow and dead are different states and a check that cannot tell them apart must not act as if it
can; and a pre-load must never be able to kill the thing it was speeding up.

**There is now a harness for the scan path you built.** The 200-photo eval still calls
`IdentifyStage.fromCrop`, so it measures the component you replaced and nothing measured the live
one. `identify/eval/scan-run.ts` runs manifest rows through `runGeminiScan` and reports parse status
split by family, identification, offer yield (0 / 1 / 2+), and `checkMath` disagreement. It includes
the counter you specified: the share of 2.5 answers that do not parse, which is the "testing says
otherwise" that moves the default to 3.x.

Scoring had to change shape. The old eval asked whether the expected catalogue CODE came back, which
is exact; Gemini returns a NAME. The matcher combines brand, name-token coverage and size, and it
reports a third bucket -- **uncertain** -- rather than forcing every row into right or wrong, with
those rows printed for hand review. Seven error modes are written into the file's own header.

**THE NUMBER YOU WILL CARE ABOUT: a full 200-row run costs $0.00 of search.** At list price it is
$7.00 on 2.5 and $12.48 on 3.x, but 200 grounded prompts sits under the 1,500-a-day free allowance
and 800 search queries under the 5,000-a-month one. The bill prints before anything is spent and a
live run is refused twice -- once without `--yes-spend`, again without a key. So the paid key is a
permissions question now, not a cost one. (No token rate for `gemini-2.5-flash` exists anywhere in
the repo, so that column prints UNKNOWN rather than being guessed.)

**Two problems with the eval set, counted rather than worked around.** All 20 `expect:'refuse'` rows
are the produce rows and **none of their photos exist**, so refusal behaviour -- whether Shin names a
product when shown a loose banana -- is not measurable at all, dry or live. And 16 identify rows
carry fewer than two substantive name tokens ("Almond", "Chips", "Cheezies"): fine for the code eval
the set was built for, unreliable for a name eval.

### Read by

---

## 2026-09-18 (Aurik's PC): the catalogue on your Mac needs one command run against it

### To do

- **Jamin, one command on the machine that serves the beta.** A cross-language fix shipped today, and
  **the code alone does nothing** -- it needs a one-off pass over the catalogue database, which is
  gitignored and so does not travel with the commit. On the Mac, in `catalogue/`:

      npm run backfill:derived

  It is offline and deterministic: no network, no key, no translation service (rule 8). It took under a
  minute here. Back the database up first; `catalogue.db` is not recoverable from the repo.
  Without it the beta server keeps the old four-column index and every claim below is inert on your
  machine. `openCatalogue` will migrate the COLUMNS on open, but it will not fill them.

### What changed

**Why it matters, measured on the real 200-photo run rather than argued.** Scoring each row by what
language the catalogue holds for the product that was photographed:

| catalogue holds | rows | true row missing from the shortlist | got it right |
| --- | --- | --- | --- |
| both languages | 136 | 11.0% | 78.7% |
| **French only** | **45** | **35.6%** | **57.8%** |
| English only | 15 | 6.7% | 80.0% |

French-only rows fail retrieval at over three times the bilingual rate and land 21 points less accurate.
Photograph the face the catalogue does not hold and the query shares no word with the target.

**What the pass did here, verified by querying the database afterwards rather than trusting its own
output:** 55,908 rows given a derived name, index rebuilt to five columns, and **28,038 rows that were
invisible to search entirely are now findable** -- their only name sat in a column the index never
covered. The iPhone 8 row is the checkable example: `MATCH "iphone"` did not return it before and does
now.

**What it does NOT do, stated so nobody reports it as a win.** It gives cross-language text to 23 of the
45 French-only rows in the eval and to 12 of the 33 rows whose true product never reached the shortlist.
The other 21 get nothing. Twelve is a CEILING on what it could rescue, not a gain, and the gain itself
cannot be measured without a real keyed run -- the only offline query text available is the eval
manifest's, which is copied from the catalogue and so is the answer key.

**A derived name is never shown to anyone.** It lives in its own column with its provenance beside it,
is indexed for matching only, and a test fails if it ever reaches a response. It is a machine alignment,
not the product's name.

### Read by

---

## 2026-09-18 (Aurik's PC): your pricing-engine package, and the one question it forces

### What changed

Nothing built. Your `Shin_Gemini_Pricing_Engine.zip` (f828606) was read end to end and checked
against the code. It raises one structural question that should be answered before more work goes
into either path.

**What the package gets right first, because three of these are things this repo has been missing
or has already bled on.**

- **No estimated price anywhere.** `pricing_summary` carries the shelf price the user typed,
  `observed_low`, `observed_high`, and a count of relevant offers. There is no `estimated_price`,
  no `fair_price`, no model guess. That is rule 3 held exactly, and it is stricter than the
  architecture document this was written from.
- **A condition axis** -- new, sealed, like_new, refurbished, used, damaged -- with its own
  confidence and evidence. This repo has none. It is also exactly the axis Aurik asked for on
  09-17 ("buy the used version for 200 dollars less"), which the entry below records as
  unsupported. Your package answers that ask.
- **Advertised pricing structure preserved.** `2 for $5` becomes price 5 with quantity_covered 2;
  member prices carry a flag; `$20/kg` keeps its unit. **This is D-113's cause, fixed at the
  source.** D-113 was one grounded offer of $9.97 for a 225 g box of Kraft Dinner whose real price
  is $1.74, which drew a line telling the shopper their ordinary price was 83% under the middle. A
  multipack or a per-unit price read as a single ticket is that shape. Shin catches it downstream
  today with a guard that withholds the line; your rule stops it being wrong in the first place.
- **Marketplace separated from direct retailer**, which this repo does not distinguish at all.

### The question: does Gemini identify the product, or does the catalogue?

**This is not two competing ideas. Your package is the rule-1 fix for the photo path, and this
repo has openly not done it.** `NOW.md` says so in those words: the barcode path is one call now,
and *"the photo path is still two and that is said plainly rather than rounded down: one
ungrounded read and one grounded search."*

Traced in the code today, a photo scan runs:

    POST /api/identify/photo -> IdentifyStage.fromCrop -> the model reads the crop, then
                                SHIN'S OWN CATALOGUE ranks candidates and picks one
    POST /api/price          -> groundedPrice.lookupPrice -> Gemini searches for offers

Identification is Shin's local catalogue. Gemini only prices. Your package has Gemini do both in
one call, with search as the identifier: barcode first, confirmed against the image.

**What follows if your version wins, counted rather than guessed:**

1. **The 200-photo eval measures the catalogue cascade and nothing else.** Its whole vocabulary --
   recall@1/@3/@10, cascade_miss, pick precision -- describes ranking rows in Shin's database. If
   Gemini identifies, that harness measures a component no longer on the critical path, **and
   there is no harness at all for the new one.** Aurik set a target of 180 of 200 on 09-17. Under
   your design that target measures the wrong thing.
2. **Cost moves from near zero to per scan.** The cascade is a local query and is free. Grounded
   search is $14 per thousand queries past 5,000 free a month, and one observed grounded price
   search used FOUR queries. That is about 1,250 scans a month free, then roughly 5.6 cents a
   scan, which is about twenty-five times the token cost of the call itself. Identification
   through search adds queries on top, so treat 5.6 as a floor rather than an estimate.
3. **The catalogue does not become useless** and nobody should read this as delete it. It still
   holds category, size and variant discrimination, and the alternatives feature, and it answers
   with no key and no network. The question is whether it is the IDENTIFIER or a cross-check.

**One thing may decide it for us.** `NOW.md` records why the photo path was left at two calls:
*"Making it one would mean putting the image into the grounded request, which the guard forbids
and which Google has not confirmed works."* Your `scan_prompt.md` sends the image and enables
Google Search in the same request. If that combination does not work on the API, the one-call
photo design is not buildable yet and the question answers itself for now.

### Three places your own files disagree with something you said

1. **Unit pricing.** `PRICING_GUIDE.md`: *"Do not calculate normalized unit prices unless
   explicitly required."* On 2026-09-14 you said *"everything should be scaled down or up to a
   spcific unit. natrually a 4l will be cheaper than a 1l but thats fine."* Shin's price line is
   built on normalising. These are opposite instructions and the line cannot follow both.
2. **Canada.** `GEMINI_SYSTEM.md`: *"Use the market supplied dynamically by Shin. Do not assume
   Canada."* The catalogue is 124,120 Canadian rows with a `sold_in_canada` column, the eval set
   is Canadian, and the retailers are Canadian. Global is a bigger product than the one that
   exists -- worth saying whether that is the intent now or later.
3. **Grounded results.** Your `README.md` warns not to assume grounded output can be *"persisted,
   analyzed, ranked, blended, or reused for arbitrary purposes"* and says to check the terms. That
   is the CAUTIOUS side of the exact argument where your rules 4 and 5 took the other side, and
   where Aurik was told a legal issue marks and never blocks. D-111 is still open on this. Your
   README moves the position, and it would help to know whether that is deliberate.

### For Jamin

Numbered so they can be answered one at a time. None of them is decided.

1. **Does Gemini become the identifier, or does the catalogue stay the identifier and Gemini
   price?** Everything else here depends on this one.
2. **Have you confirmed that an image plus Google Search grounding works in a single Gemini
   request?** If not, that is the first measurement, and it needs the paid key outstanding since
   09-15.
3. **If Gemini identifies, what replaces the 200-photo eval?** Accuracy would have to be measured
   against live search results rather than catalogue rows: a different harness and a different
   truth set.
4. **Is roughly 5.6 cents a scan past 1,250 scans a month acceptable**, or does the catalogue stay
   in front as the free path with Gemini used only on a miss?
5. **Unit pricing: normalise, or preserve as advertised?**
6. **Is the global-market instruction the intent now, or after Canada?**

### Read by

---

## 2026-09-17 (Aurik's PC): Aurik wants competitive alternatives, not just matches — and it collides with rules 1 and 3

### What Aurik wants, in his words

*"not only does shin find matching products, it should also find competitive alternatives. This
can be anywhere from recommending non organics for an organic product scan: non organic spinach
for 2 dollar less, or tech products: buy the used version for 200 dollars less. or: buy the new
model for 200 dollars more"*

### What changed

Nothing built. This is a rule-9 raise: *"If a decision in the near future wants to contradict
this, bring up those points."* No decision has been made.

**The feature already exists and it is dead, not a foundation.** `catalogue/src/alternatives.ts`
(867 lines, decisions 38-42) is wired to a live route, `GET /api/alternatives` in `app/server.ts`
around line 3158, with a full round-trip test suite in `catalogue/test/alternatives.test.ts`
(1023 lines). It cannot return anything today. The route needs a `code` (barcode) and a price,
looks the product up, then calls `lookupPrices` in `price/src/lookup.ts`, which reads
`price/data/prices.db`'s `observation` table on `WHERE code IN (...) AND code IS NOT NULL`.
Counted directly against the live file: **10 rows, 0 with a code.** They're the Walmart rows from
the 2026-09-08 crawl that PerimeterX blocked before anything joined. An empty list is the
documented correct answer on this route, so nothing has ever flagged it as broken. This is D-119's
shape (`DEFECTS.md`) one layer up — same ten rows, same zero joins, different source class.
`price/src/lookup.ts`'s own header still claims *"the table it reads is 896 rows today"* — that
number was real once (`docs/decisions.md`, the Walmart sitemap crawl measurement), it just isn't
anymore. Logged as D-121.

**The route is barcode-only.** No `code`, no query — 400. A photo scan has no barcode. Aurik's
whole ask is framed around scanning a product and being offered alternatives, and two of his three
examples are photo-shaped (an organic spinach scan, a physical item in hand), so the one entry
point this feature has today can't be reached from the case he's describing.

**Two of his three examples break the feature's own design on purpose, not by oversight.**
Decision 38 in `alternatives.ts`'s header: an alternative is *"something a shopper could actually
buy instead, which is a category-and-unit-price question, not a vector one"* — same category,
same unit, strictly lower price, nothing else. Organic → non-organic cheaper fits that exactly.
Used/refurbished at $200 less does not: there's no condition axis in the catalogue (it holds
new-product identity rows), and the one adapter that could price a used item, `SoldComps`
(`spine/src/sources/soldcomps.ts`), is written and has never been run against a real key —
`QUEUE.md` row 1.4b, still `queued`. "Buy the newer model for $200 more" doesn't fit the design at
all: recommending an upgrade is a different question from "is the thing in your hand a steal or a
ripoff," which is the frame the whole app verdict is built on.

**The conflict is rules 1 and 3 in `docs/jamin-gemini-rules.md`.** Rule 3: *"THE PRICE SHOULD NOT
COME FROM US."* Shin's own price database, price engine and "cheaper" lookups are named
specifically as not the answer source — and `alternatives.ts` is exactly that: a local catalogue
query against Shin's own price table. Rule 1: *"one gemini call will return the object, the price,
the reviews, etc."* — one prompt, never two. A real alternatives feature can't be a local query
under rule 3; it has to come out of the same Gemini call's output under rule 1, which means
growing that call's schema, not adding a second call.

### For Jamin

Rule 9 says a decision that would contradict last night's rules gets raised with you first, not
made quietly. These aren't ranked and none of them is decided:

1. Does the one-call Gemini schema grow a fourth field for alternatives, alongside object, price
   and reviews — or does alternatives stay out of that call entirely?
2. Is "buy the new model for $200 more" in scope at all? It's a different product than the one
   scanned, not a cheaper way to buy the same thing — does that fit inside the verdict frame, or
   is it a different feature?
3. Does the used/refurbished axis (his "$200 less, used") justify actually running `QUEUE.md`
   1.4b — SoldComps against ebay.ca, budgeted 10 of the monthly 100 requests — to find out if it
   can answer at all, given the catalogue has no condition axis today?
4. `alternatives.ts` is a local catalogue query end to end. Under rule 3, can that code ship as
   the alternatives feature in any form, or does every path here have to become "ask Gemini,"
   same as price?
5. His examples are photo-shaped but the only entry point today needs a barcode. Does alternatives
   need to work off a photo-only scan with no barcode at all?

### Read by

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
