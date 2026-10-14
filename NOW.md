# NOW, the one thing being worked on

*One screen. If any other doc disagrees about the current state, this file wins. State, not
narrative. RULINGS.md outranks this file on any specific ruling; if the two disagree, fix here.
History moved out of NOW.md on 2026-09-27: `docs/archive/now-history-2026-09-27.md`.*

---

## Price-category plan, 2026-10-09 (docs/price-category-plan-2026-10-02.md)

- **Stage 1 (keep everything): built, all 11 items pushed** (c0f3f1d, ff3ff00, cec3e63, f7dc01a,
  35e50a4, 55a3b52, eb6d06d, e7aa8df, bed4384, c619c07). Canadian Tire terms read 2026-10-12
  (c619c07): its Policies page bars copying or republishing site content, so its automated reader
  is refused like Save-On-Foods, Walmart and ANBL. No seller's basis is unknown now (the PC's
  prices.db carries the appended entry). 4.8's audit still FAILS on one count: 187 Save-On and 10
  Walmart rows collected before the gate, with no gated reader run; removing them is a delete and
  waits on Aurik's yes. Enforced is still false.
- **Stage 0 (trustworthy tests): tooling built** (442bc30). Every bench rebuild now stops with exit 3
  on real data: each of the 17 priced products is alone in its category, so the whole-category
  control cannot fail on width. 4.9 (Ontario prices on 2+ dates: 0 rows), 7.7 (a person marks the
  hand-audit sheet; the 45 marks in reread-sheet.csv are Claude's and do not count) and 7.4's
  Claude arm (no key) wait on people.
- **Stage 2 (hierarchy): 1.1, 1.6, 1.7 built** (eb6d06d); **D-223 fixed in code 2026-10-12**
  (cd7823a, c98a0e2): a parent must contain its child, and beauty, general and pet read their own
  Open Facts taxonomies (fetch once per machine: `node src/fetch-categories.ts --department
  beauty|general|pet`). Against each department's own taxonomy: wrong parents 329 to 0, items under
  a wrong chain 25,369 to 0. **1.2 to 1.5 built 2026-10-13** (9780d2f), proven on synthetic data
  only (12 tests red first); unvalidated on real prices, thresholds chosen not tuned. Read-only run,
  1,269 priced products placed in memory: 18 groups, 2 split by pack size, 16 wide, 4 thin. Every
  load now ends with the placement build (`--no-placement` skips it, out loud).
- **Stage 3 (placing items): 2.1 to 2.4 built** (270c053), Claude slot an interface with no
  chooser. Top-level-only share, all 212,340 items on a copy (bar 5%): 18.9% on the old tree, 31.5%
  with containment alone (beauty 2.0% to 36.1%, pet 3.8% to 54.0%, general 23.9% to 36.9%, food
  26.0% unchanged); with the department taxonomies, being measured. The old beauty and pet passes
  came from the wrong chains. Read of the food items left at the top level: ordinary named products
  ("Frozen Strawberry", "Bacon rounds"), so the routes abstain on split votes, not on missing names.
  **2.1 "Next" built and FAILED 2026-10-13** (label route, off by default; Claude chooser behind the
  slot, top 8 route candidates, no live call). 55,000-item sample: top-level-only food 11.1 to 8.8%,
  beauty 38.2 to 33.2, general 40.7 to 36.4, pet 48.6 to 43.7 at a diagnostic 0.90; no threshold
  reaches 95% right (16 of 65 on the answer key), so coverage at the bar is zero. **The existing
  text route scored 5 of 54 on food answer-key items: read the wrong ones before placing live.**
  Why (read 10-13): food holds two unlinked vocabularies, USDA flat labels (19,471 sample rows) and
  Open Food Facts en: chains (1,042); 40 of 49 misses are USDA labels the en:-only key cannot score.
  **Linked 10-14** (barcode overlap, 144 of 348 labels, 89.8% of USDA items, held-out containment
  93.5%; 186 labels at the food top): food key 15 of 200 (cascade, was 8), still far from 190.
  The PC's main node_modules transformers model.onnx (17.8 MB) fails to load. The 2.2 sheet (819 rows, bench/results/placement-audit-sheet-2026-10-09.csv) is unmarked, so
  accuracy is unmeasured and the 0.6 bar uncalibrated. Live catalogue.db not placed yet.
  onnxruntime-node declared (cd7823a).
- **Stage 4 (the range), out of order 2026-10-13 (Aurik: "continue working not in order"): 3.3,
  3.4, 3.6, 6.4 built and pushed** (efc2c60, 53aacf7, e53cc53, 6dafa8a). No pool crosses a department
  (`global_prior` gone; an item with no price in its department shows no verdict, 63 of 88 unpriced
  sampled items on the PC), no range is one price (8 of 17 PC barcodes were, now 0), sale-flagged
  and unverified printout rows are out of the range ladder, a Claude range is asked at most once per
  item per 90 days (was 30). **3.1, 6.1, 6.3, 6.7 built 2026-10-13** (1c32463): every request ends
  in a range (random-input test: 1,484 of 2,000 had none, now 0; the too-thin answer shows the broad
  bell, the phone draws it), Claude asked only with no range and no tools, estimates gated out of
  5+-price categories, Claude down still answers. Unverified: real-key breaker, phone-size render;
  when 6.1 refuses Claude the verdict can show no zone. Mac not restarted onto it. Still open in
  Stage 4: 3.2, 3.5, 3.8, 6.6. 3.8's
  hierarchy version waits on the live catalogue being placed (Stage 2/3); 3.2, 3.5, 6.6 need prices. Logged: docs/decisions.md "No price pool crosses a department".
- Open for a person: an Ontario source; the 7.7 sheet; the 2.2 sheet; the outlier numbers (19%, 4
  prices); deletes waiting on Aurik's yes: the PC user catalogue's test rows (D-222: 21 products,
  5,132 observations, 16,593 offers, 27 branch rows, 0 pass the real-scan test) and the 197
  pre-gate Save-On/Walmart rows in prices.db.

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
- The ux test suite (`npm run test:ux` in `app/`) was 241 red on 2026-10-09; **12 red on 2026-10-13**
  after build 6, the verdict screen (8489dca): builds 1, 2, 5, 6 at 0 red; left: build 3 camera
  permission (8), build 4 refusal copy (2, both red-defect), build 7 motion (2). Build 6's five calls
  against its own spec: docs/decisions.md "UI build 6, the verdict screen". Not yet seen at phone
  size (Playwright install stopped by low memory). The main `npm test` stays green.

What stands between the MVP and 10-20 testers is one list: `QUEUE.md` bands 7 (launch) and 7B (the
cheaper lookup, `docs/cheap-lookup-logistics-2026-09-23.md`). Settled in code: a typed name
answers only from Shin's own data (no Gemini call), and the barcode button sends no photo. Settled
in `docs/decisions.md`: CA$3.99 a month, CA$29.99 a year, 5 free barcode scans a week once
purchases work (this matches RULINGS.md, "Shin Plus pricing and free scans": 5 a week for the
beta, 3 a week at public launch). The invite code is set on the Mac (D-164).

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

**The paid Gemini key EXISTS, Jamin 2026-09-28:** *"The paid ai key already exists"*. It is not
in the Windows PC's `.env` (only `ICECAT_*` and `EBAY_*` there), so where it lives is the Mac's
config, and whether the live server runs on it is asked of the Mac (mail 2026-09-28): `/api/health`
must report the paid tier and a real barcode scan must return prices. The refusal path lives in
`photoTierRefusal` (`app/server.ts:823`) and `geminiKeyProblem` (`app/server.ts:4103`).

## Waiting on Jamin or Aurik
- **Aurik:** the range ask on Claude with no web search (his claim, 2026-09-28 17:00 UTC). The
  server makes no range ask until it is wired back in.
- **The Mac:** pull, restart onto catalogue first, verify own prices on barcode scans, and move
  the iOS project to CocoaPods for the ML Kit plugins (mail 2026-09-28, see mailbox).
- **The Mac (asked by mail 2026-09-27, no receipt yet):** is SHIN_GEMINI_TIER paid (unset or free
  refuses every shopper photo), SHIN_REQUIRE_DB, SHIN_GEMINI_GROUNDED_MODEL, and SHIN_GEMINI_SPLIT;
  then pull main and restart the beta server (becf7d8 removed the 2.5 split).

## Next steps

1. Ship `QUEUE.md` bands 7 and 7B to get to 10-20 testers.
2. Once the paid key lands, re-measure retrieval before building against the old 32/52 number.
3. Confirm unit 16 is live on the Mac server and close the catalogue plan out fully.
