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
  Open for Aurik with a decision or a phone: "Bad price" at full strength on a weak estimate (D-270
  A2, screen half), the Shaded caption clipped under the button (B6, needs a look at phone size),
  no undo on removing a past scan (D21). Waiting on Jamin: D-264's price-first order. Mac asked for
  build 7 from abe6fea. None of it seen on a phone.

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
is not built yet, so an item with no Shin price shows no range. The Mac serves it once it pulls
main and restarts the server. The old
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
- **Aurik: does build 3 still crash?** (D-250, D-249.) TestFlight build 3 went up 2026-11-04
  17:17:19 local from 18cb7b1, which contains 42fe730, the D-249 fix; Apple reports it VALID and
  IN_BETA_TESTING, and it is in the "Family and team" group where his install sits, so his app
  updates on its own. Until then D-249 is unproven on a real phone and D-250's cause is inference.
  The build he reported on (2026-11-01) was build 2, from before the fix: the app has had only
  those two builds, read from the App Store Connect API. No crash has ever come through TestFlight
  feedback (`betaFeedbackCrashSubmissions` is empty), so there is no log on Apple's side and the
  answer has to come from him.
- **Aurik:** the range ask on Claude with no web search (his claim, 2026-09-28 17:00 UTC). The
  server makes no range ask until it is wired back in.

## Next steps

1. Ship `QUEUE.md` bands 7 and 7B to get to 10-20 testers.
2. Confirm unit 16 is live on the Mac server and close the catalogue plan out fully.
