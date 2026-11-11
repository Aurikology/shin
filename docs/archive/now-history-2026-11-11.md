# NOW.md history, moved out 2026-11-11

## Price-category plan, 2026-10-09 (docs/price-category-plan-2026-10-02.md)

- **Stage 1 (keep everything): built, all 11 items pushed** (c0f3f1d, ff3ff00, cec3e63, f7dc01a,
  35e50a4, 55a3b52, eb6d06d, e7aa8df, bed4384, c619c07). Canadian Tire terms read 2026-10-12
  (c619c07): its Policies page bars copying or republishing site content, so its automated reader
  is refused like Save-On-Foods, Walmart and ANBL. No seller's basis is unknown now (the PC's
  prices.db carries the appended entry). The 197 pre-gate rows (187 Save-On, 10 Walmart) were
  deleted 2026-10-22 on Aurik's yes (backup price/data/prices.db.before-pregate-delete-2026-10-22;
  the log holds 197 delete events). The audit now lists no ungated rows; it fails only because
  enforced is still false (`node src/registry.ts enforce` not run).
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
  reaches 95% right (16 of 65 on the answer key), so coverage at the bar is zero. Text route 5 of
  54 on food: USDA flat labels were unlinked to the en: tree (40 of 49 misses). **Linked 10-14** (barcode overlap, 144 of 348 labels, 89.8% of USDA items, held-out containment
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
  prices); the 5,605 user_review rows left from the D-222 fixture
  (the rest of D-222 deleted 2026-10-22 on Aurik's yes).
