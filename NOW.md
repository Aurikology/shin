# NOW, the one thing being worked on

*One screen. If any other doc disagrees about the current state, this file wins. State, not
narrative. RULINGS.md outranks this file on any specific ruling; if the two disagree, fix here.
History moved out of NOW.md on 2026-09-27: `docs/archive/now-history-2026-09-27.md`; the 2026-10-09
price-category plan on 2026-11-11: `docs/archive/now-history-2026-11-11.md`.*

---

## Current state of the beta: the catalogue

The catalogue build plan has run (`docs/catalogue-build-plan-2026-09-26.md`). Every unit is built,
parked with a number, or killed with the number that killed it. Built and verified: 0, 2, 3, 5,
6a, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18. Parked: 1, 6b, 10, three of 12's four sources. Killed
by its own falsifier: 4 (Metro, 95.4% disagreement). Unit 16 answered YES 2026-09-26 (RULINGS.md, "A scanned barcode answers with Shin's own prices
too"); whether the Mac server has it on is being checked (mail 20260928011752-pc-32d55a).

The catalogue tonight: 4,289,929 products, 473,773 of them sold in Canada. The phone's Canadian
pack is 473,677 rows, 6.50 MB brotli, 0 duplicate and 0 out-of-order keys (the pack shipping before
this run had 198,095 barcodes, 32%, on an ambiguous key). Grocery pack 121,896 rows, 1.47 MB. App
suite 1,378 of 1,378 (becf7d8 removed one test of deleted code).

Full findings (the answer-change measurement, the two defects found by something going red, the
five corrected readings) are in the archive under "CATALOGUE WORK, 2026-09-26":
`docs/archive/now-history-2026-09-27.md`.

**Procedural notes for the next catalogue load, still true:**
- Run the canonical-spelling pass AFTER the load, not before. Last time the duplicate cleanup ran
  an hour ahead of the British Columbia load and the load recreated the class behind it.
- After any category fill, restart the search workers: `rebuildCategories` invalidates their
  memoised tag sizes.
- Categories (2026-10-08): every load ends with the canonicalize pass (real Open Food Facts chain,
  raw tags kept); `npm run check:categories` must exit 0 after it. The PC's four pre-change
  backups (before-8digit-canon, before-category-canon, both before-dedupe) were deleted 2026-10-13
  on Jamin's word to free disk; the raw tags in catalogue.db are the undo. The phone pack needs a re-export to carry it.

**Pricing without data, 2026-09-28:** Jamin's nested-category design, the flawed first plan and
why, and the Gemini liquor test (typical within 20% for 61%, its own ranges catch only 53%, 0.7x
to 1.4x of its typical catches 80%; skips 23% of lines): `research/gemini-price-test-2026-09-28/`.

## What is being worked on: the tester launch

- **Build 14 IS uploaded (2026-11-27 01:40Z, per the Mac mailbox as read in `notes/launch-readiness-2026-11-26/review-2026-11-27.md` C4):** from 8167364, delivery 2061BD0F-CB63-4977-8F12-DA5E95347199, CFBundleVersion 14; the earlier "Unauthenticated" cleared on a plain retry. Not yet attached to iOS 1.0 (Jamin) and not yet seen on a phone. It does not carry the depth pass (34c0148) or anything after 592f42f; the next build comes from newest main. Launch review 11-27 is the current open list (Jamin's PC); its class (a) items LEG-8, AND-6, AND-9 and G5 (BC liquor job) were closed on Aurik's PC 11-27 (d6a7d1a, 5aa2858, 9f4c4ee); the live server named the App Review barcode 055773000795 with a known price in 0.26 s (preview, 11-27 04:40Z).
- **Build 13 is live in TestFlight (2026-11-26):** processed, "Ready to Submit", 1 install in "Family and team"
  (Jamin's console sweep, `notes/launch-readiness-2026-11-26/consoles.md`; Aurik confirmed). It carries the build 12
  phone review fixes (D-281 to D-285) and the scans-left line. Its commit and .ipa size were not reported back to the
  PC. Next on it: Jamin attaches it to iOS 1.0 (his yes). **Build 13 is the one to install.**
- **Build 12, 2026-11-24 19:20 EST: VALID, in TestFlight's "Family and team"** (from bad2d1f: build 11
  plus the price pad contrast fix 5176dec; delivery a63259f2-cd2d-4e2b-8a1a-e9d865348c71). .ipa
  37.7 MB, 6.4 MB under build 11: the Mac's untracked efficientdet_lite0.tflite was absent this run,
  which only photo scans read (off for 1.0, eye-attach.js), so nothing a shopper uses changed.
  Superseded by build 13.
- **Builds, 2026-11-24:** **build 11 is uploaded to TestFlight** (from 6949171, which carries
  2ee048c; CFBundleVersion 11 read from the archive; .ipa 44.1 MB; delivery
  37ac9f73-b444-4cf0-be63-a54af8b98a31; Apple was still processing it at 13:10 EST). It is the
  first build with everything since 10: R79 restore, D-275, D-276 (photo engine left out), the
  haptics and walkthrough, the five-screen welcome, the Progress tab, the camera redesign and D-277.
  Build 10's size was never recorded, so D-276's saving on the phone is unmeasured. Nothing since
  build 9 has been seen on an iPhone: build 11 is the one to install. Building Android here needs
  JDK 21 (portable, `C:\dev\jdk-21.0.13.1+2`) and `npm ci` in `native/` first.

- **Accessibility, 2026-11-24 (Aurik's PC, R80 desk half):** `scripts/a11y-sweep.mjs` (axe-core
  plus a pixel contrast check, 16 states at iPhone 13 size) gives 0 problems on 5176dec. Its one
  finding, the price pad's faint 0.00 at 1.88:1, was fixed in 5176dec. The VoiceOver pass on a
  phone is still R80's open half.

- **2026-11-21 launch review (Jamin's PC):** not ready to submit; result and per-job findings in
  `docs/readiness/review-2026-11-21/REPORT.md`, phone checklist beside it.

- The design-evidence document (`docs/design/ux-evidence-2026-10-09.md`) exists with 98 blocks and a build order (its section 13).
- The ux test suite (`npm run test:ux` in `app/`) was 241 red on 2026-10-09, 12 red on 2026-10-13,
  2 red by 2026-10-28 (the bell's timing, R-89), **0 red on 2026-11-01** after Aurik said yes to
  260/400 ms (first draw ends by 260 ms, a better answer morphs in 360 ms). The main `npm test` is
  green (1,989 pass, 0 fail). The 2026-10-28 walk's bugs D-240, D-241, D-242 and D-245 are fixed
  (docs/decisions.md "A broad guess is saved, a typed miss gets one, and the bell moves faster"),
  seen in desktop Chromium at phone size only.

- **2026-11-11 bug sweep, screen half (Aurik's PC):** 20 screen fixes pushed (ef44c26 to abe6fea),
  each with a test seen red first; listed in DEFECTS D-259, D-260, D-265, D-268. The server, data and
  search halves went to Jamin in `comms/messages/2026-11-11-aurik-to-jamin-server-halves-of-the-bug-sweep.md`.
  Closed since (checked 2026-11-15): B6 caption 18a859b, D21 past-scan undo 8a81e26, D-264 order
  (Jamin ruled preview first, built 0a44202). D-270 A2 screen half needs no change: a low-confidence
  verdict is already drawn hollow with the plain face (RULINGS "The top of the verdict is for useful
  information only"; AVATAR.md row 25), and Jamin's ba2820d/f60a700 fixed the word and the confidence.
  D-268 A3's phone half (the retry outbox) pushed b106208. Build 8 is on TestFlight (e39310c); build 9 from 7aa7138 asked of the Mac 2026-11-16;
  none of it seen on a phone.
- **2026-11-15, early access (Aurik's ask):** the camera shows "Pexi is in early access" on the first
  visit and an Early access badge after (18db691, tag a113), so a shopper hears before a miss that
  Pexi knows everyday groceries best for now.
- **2026-11-14/15, Jamin's side built every screen ask** from his two 11-14 notes (tap to scan, price
  pad default, hidden dead features, answer sheet layout, connection message, "Pexi doesn't know this
  one yet", "No price here yet", saved-price count, first-run tip, miss-run line, produce amounts).
  Only 27% of 176 real scans had a shop price.

What stands between the MVP and 10-20 testers is one list: `QUEUE.md` bands 7 (launch) and 7B (the
cheaper lookup, `docs/cheap-lookup-logistics-2026-09-23.md`). Settled in code: a typed name
answers only from Shin's own data (no Gemini call), and the barcode button sends no photo. Settled
in `docs/decisions.md`: CA$3.99 a month, CA$29.99 a year; RULINGS.md, "Shin Plus pricing and
free scans" (2026-11-05): 10 barcode scans a week free, 100 with Plus, once a test purchase works.
The invite code is set on the Mac (D-164).

**Shin is catalogue first, switched on for testers 2026-09-28 (RULINGS.md, "Catalogue first;
Claude, with no web search, is the capped price-range fallback").** The catalogue names the product
(text on the object searched, top 3 returned, manual entry on no match), Shin's own math gives the
price range, and when Shin has no price, Claude is asked for a typical range with no web search,
capped per month. No shopper answer comes from Gemini (Jamin, 2026-09-28: *"We are not using gemini
at all for the client side answers"*). The setting is on by default in code; the Claude range ask
is built (identify/src/range-ask.ts, 2026-10-13) and wired into the barcode and typed paths
(typed path fixed a551c4a, D-274). The old
single-row photo matcher removed in `d3e4f0b` (2026-09-19) stays removed: the new search returns
three for the shopper to pick, never one row forced out of millions.

**Do not quote the old "32 of 52 failures is retrieval" figure as current.** It was measured while
the catalogue still picked the product, which is exactly the work the deletion above removed from
the critical path. Aurik's ruling, 2026-09-21: re-measure before building any retrieval work on it.
No one should quote 32/52 as current.

## Open blockers

**App Store submission of 1.0 (Jamin 2026-11-05: submit, manual release, EU left out).** All that
is left, each item owned by Jamin or Aurik (RULINGS "Who owns what"), is one list:
`docs/launch-gaps-2026-11-06.md`. Top item: the packaged app never completed a server call (fixed in
9a1a9c1, not live yet). Older blockers: `docs/archive/now-history-2026-11-05.md`.

## Waiting on Jamin or Aurik
- **Paywall go-live, 2026-11-17:** `docs/paywall-go-live-2026-11-17.md`. 10 a week free kept. Stage 1 (seller line, cancel row on the iPhone) pushed 4c561dd; build 10 asked of the Mac; Stage 3 with Jamin (trial, store text); next is Aurik's sandbox purchase on build 10, then the limit goes on.
- **D-250 closed 2026-11-17:** Aurik, *"the app does not crash, and the phone screen looks good"*, on the build his phone holds (8 or 9). Paywall purchase (launch gaps 7) still not run.
- **Claude range ask, 2026-11-18 (D-274): live.** Typed unpriced groceries answer with Claude's range
  (Rao's marinara $5.99 to $7.99 a jar); the earlier "no ask" was a probe with no country.
- **The free limit is ON live (2026-11-18 15:10Z, `/api/quota` answers `limit: 10`)**, ahead of
  Stage 4 (the sandbox purchase). Asked of Jamin: keep it on or unset it until the purchase works.

- **Readiness register, 2026-11-20:** 45 of 93 items named in commits since 11-18; Aurik's side built or waiting on his phone. What is left (server code for Aurik's sessions on Jamin's yes, and Jamin-only account steps) is in `comms/messages/2026-11-20-aurik-to-jamin-readiness-register-what-is-left.md`.
- **Desk pass 2026-11-19 (Aurik's PC), for Aurik to read:** storage audit (R79): a wiped phone now gets back its look, language, the newest watchlist entries and Past scans (2026-11-20, not yet on a phone); 4 smaller gaps left in the audit. The invite-code gap is browser-only. Support replies drafted (`docs/support/replies.md`, French needs his read; the one-phone restore paragraph waits on the two-phone sandbox test, R21).

## Next steps

1. Ship `QUEUE.md` bands 7 and 7B to get to 10-20 testers.
2. Confirm unit 16 is live on the Mac server and close the catalogue plan out fully.
