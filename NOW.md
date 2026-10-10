# NOW, the one thing being worked on

*One screen. If any other doc disagrees about the current state, this file wins. State, not
narrative. RULINGS.md outranks this file on any specific ruling; if the two disagree, fix here.
History moved out of NOW.md on 2026-09-27: `docs/archive/now-history-2026-09-27.md`.*

---

## Price-category plan, 2026-10-09 (docs/price-category-plan-2026-10-02.md)

- **Stage 1 (keep everything): built, all 11 items pushed** (c0f3f1d, ff3ff00, cec3e63, f7dc01a,
  35e50a4, 55a3b52, eb6d06d, e7aa8df, bed4384). 4.8's registry audit still FAILS on one unknown
  basis, Canadian Tire: its site hangs Chrome on every page (robots.txt reads: Allow, Crawl-delay
  10). Save-On-Foods terms read 2026-10-09 forbid automated reading, so saveonfoods-run is refused,
  like the Walmart crawl and ANBL loader (read 2026-10-06). The audit names 187 Save-On and 10
  Walmart rows with no gated reader run; the registry in price/data/prices.db exists now, enforced
  is still false.
- **Stage 0 (trustworthy tests): tooling built** (442bc30). Every bench rebuild now stops with exit 3
  on real data: each of the 17 priced products is alone in its category, so the whole-category
  control cannot fail on width. 4.9 (Ontario prices on 2+ dates: 0 rows), 7.7 (a person marks the
  hand-audit sheet; the 45 marks in reread-sheet.csv are Claude's and do not count) and 7.4's
  Claude arm (no key) wait on people.
- **Stage 2 (hierarchy): 1.1, 1.6, 1.7 built** (eb6d06d). All 212,340 items have exactly one path;
  90,487 Canadian items sit in "unplaced" (decision 2026-10-09). 1.2 to 1.5 need prices: 15 priced
  items join the catalogue. load.ts does not run the placement build yet.
- **Stage 3 (placing items): 2.1 to 2.4 built** (270c053), Claude slot an interface with no
  chooser. Run on a copy: 0 unplaced (was 135,496), but 25.9% of Canadian items end at the top
  level only, against 2.1's 5% bar (food 26.0%, general 23.9% fail; pet, beauty pass). The 2.2
  sheet (819 rows, bench/results/placement-audit-sheet-2026-10-09.csv) is unmarked, so accuracy is unmeasured and the 0.6 confidence
  bar uncalibrated. Stage 2's parent chains are wrong in places (D-223). Live catalogue.db not
  placed yet (`npm run place -- --live`). onnxruntime-node is imported but not declared.
- Open for a person: Canadian Tire terms (read by hand); an Ontario source; the 7.7 sheet; the
  outlier numbers (19%, 4 prices); D-222's leftovers (the 595 rows are gone, e3f020e; 6 fixture
  products, 4,729 unpriced observations, 15,558 offers, 7 branch rows still need Aurik's yes; the
  Mac copy is still open).

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
  raw tags kept); `npm run check:categories` must exit 0 after it. Backup before the first pass:
  `catalogue/data/catalogue.db.before-category-canon`. The phone pack needs a re-export to carry it.

**Pricing without data, 2026-09-28:** Jamin's nested-category design, the flawed first plan and
why, and the Gemini liquor test (typical within 20% for 61%, its own ranges catch only 53%, 0.7x
to 1.4x of its typical catches 80%; skips 23% of lines): `research/gemini-price-test-2026-09-28/`.

## What is being worked on: the tester launch

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

## Tester-launch fixes, 2026-09-28 (Jamin: *"do all 1-12 including the iphone build, switching the new catalogue path on"*)

**Pushed and checked on the PC** (1d9dd38, d155d3c; per-row detail in `DEFECTS.md`): device
isolation (D-145, D-155, D-156, D-158, D-159 closed for bound devices; D-157 partly: an invented
device id still gets fleet figures), frame caps (D-160, D-162), nothing written before the invite
gate (D-161), settings file (D-146), provider failure wording (D-150), buy and restore taps
recorded, location asked once (D-139), shelf stream off without photo ID and photo consent off by
default (D-148), photos under SHIN_DATA_DIR (D-163, code), the 0068100084245 "Kraft Dinner" cache
row (a leaked test fixture; deleted on the PC), terms and privacy at /legal/ (D-144), app name Shin
and id com.useshinapp.shin (Android; iOS on the Mac), store listing and privacy declarations, an
Android debug APK built on this PC. App tests 1558 of 1558; 9 of 9 live server checks.

**Not done yet:** the Mac has not picked up either mail (iPhone build + paid-key check,
20260928053407-pc-806590; pull, restart, photo move, cache row, 20260928063225-pc-252cb2): no
Mac session was open. Catalogue first is on in code (2026-09-28); the Mac has not yet restarted onto it.
Nothing has been opened on a real phone.

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
