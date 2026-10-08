# Category system: loud safeguards and the pain-point tests, 2026-10-08

His words, 2026-10-08: *"one critical mistake in these systems is that errors go unoticed. I need
you to prepare two things. First, make sure every system has safeguards in place that fail loudly
which is a common engineering practice. Furthermore, before building, write a test that targets
all the pain points we are addressing"* (RULINGS.md, "Errors never go unnoticed").

Scope: every system that picks, stores or reads a product's category: the catalogue prepare step
(`catalogue/src/prepare_rows.py`, `prepare_rows_jsonl.py`), the load and category rebuild
(`catalogue/src/load.ts`, `schema.ts`), the substitute ring (`catalogue/src/search.ts`
`chooseRingTag`, `alternatives.ts`), the price range ladder (`price/src/range.ts`, read only: it is
under Aurik's claim, so its safeguard sits in the app layer that calls it), the verdict, and the
planned price-category system (docs/price-category-plan-2026-10-02.md). The fixes themselves are
NOT built here; he decides those. This builds the safeguards and the tests only.

## What "fail loudly" means here, and the practice it comes from

- **Offline jobs stop.** The catalogue load, category fill and any rebuild are batch jobs. They run
  every check below, print every count every run, and exit non-zero when a count rises above its
  recorded baseline or a reference file is missing. This is the data-test practice of dbt, a batch
  pipeline tool: a test counts failing rows and errors or warns on thresholds (`error_if`,
  `warn_if`, default `!=0`; https://docs.getdbt.com/reference/resource-configs/severity). The
  baseline is a ratchet: today's known counts may not grow, and a fix lowers them by hand.
- **A shopper's answer is never blocked.** Shore, "Fail Fast" (IEEE Software, 2004): *"a crash is
  never appropriate"*; use a *"global exception handler to gracefully handle unexpected exceptions,
  such as assertions, and bring them to the developers' attention"*, and *"avoid catch-all
  exception handlers in the rest of your application"*
  (https://martinfowler.com/ieeeSoftware/failFast.pdf). So at serve time every fault is recorded on
  the answer, logged with one fixed tag, and counted where `/api/health` shows it. "Always answer"
  (RULINGS.md) stands.
- **A missing reference is a fault, never a skip.** A check that cannot run says so loudly; it
  never reads as zero.

## Part A. Safeguards (built now; each tested on a bad fixture it must catch and a good one it must pass)

Reference file: Open Food Facts' category taxonomy,
https://static.openfoodfacts.org/data/taxonomies/categories.json, fetched by a script to
`catalogue/data/off-categories.json`, its sha256 and fetch date recorded in the baseline so a
changed file is noticed.

| # | Fault | Where it is caught | Count today (PC catalogue, Canadian OFF rows, 2026-10-07) |
|---|---|---|---|
| A1 | A product's tags hold two or more deepest categories on separate branches, and one was picked with no record | load check | 6,003 of 43,087 |
| A2 | The tag read as "parent" (the one before the last) is not an ancestor of the last in the taxonomy | load check; serve time in range and ring | 3,242 of 30,955 |
| A3 | A tag that is not an entry in the taxonomy (raw labels, other spellings, other-language duplicates such as "Juice" and "Jus") | load check | 12,469 products carry one |
| A4 | The chosen leaf is an ancestor of another of the product's own tags | load check | 74 |
| A5 | The taxonomy file is missing, unreadable or changed since the baseline | load check, server start | n/a |
| A6 | `category_source` is NULL on a row that has tags (the schema documents values no code writes) | load check | 462,000 Canadian rows NULL |
| A7 | A catch-all handler in the category or range path that swallows an error (Shore: remove or refactor) | code audit, listed in the build report | to count |

Serve time (app layer, never inside `price/src/`): when an answer's range or substitute ring used a
parent rung, check A2 against the taxonomy loaded at server start; on a fault, add it to the
answer's record, log `[category-fault] <kind> <barcode>`, and count it by kind in `/api/health`. If
the taxonomy did not load, `/api/health` says the category check is off, in those words.

## Part B. The pain-point tests (written now, before any fix; red on today's code)

Each is a `node:test` test marked `todo` with its pain point, so every run of the normal suite
lists it as open without failing the build, until the fix lands and the fix's commit removes the
`todo`. Each test also carries its own controls: a known-good case it must pass and a known-bad
case it must fail (RULINGS.md, "Everything is an assumption until tested"). Where the code under
test is not built yet, the test fixes the interface the build must meet (named below) and imports
it dynamically, so a missing module fails that one test, not the file.

| # | Pain point | Test passes when | Red today because |
|---|---|---|---|
| B1 | Two-branch products picked silently | every product with 2+ deepest tags has a chosen leaf by the written rule (the branch with more priced products) and the other recorded | the last tag is taken, nothing recorded |
| B2 | Parent fallback reads a non-parent | the parent used by the range ladder and the ring is the taxonomy parent of the leaf, on a fixture where the second-last tag is not the parent | position, not taxonomy, picks it |
| B3 | One idea under two names | "Juice" and "Jus" (and an `en:`/`fr:` pair from the fixture) land in one group; no product on a label outside the taxonomy | each label is its own group |
| B4 | Store, region, season split the tree | `buildPriceTree(items, prices)` (planned) gives an item priced at two chains exactly one path, and a store adjustment exists for the chain gap | not built |
| B5 | Rebuilt tree unstable | two rebuilds on data differing by a random 5% of prices: for items with no new own prices, the same shelf price gets the same verdict in 95%+ of cases | not built |
| B6 | Category-only answers call ordinary prices good or bad | on ordinary (non-sale) prices with a category-only basis at the 1.5x target width, the verdict calls 10% or fewer good or great, and 10% or fewer bad | today's 20% thresholds give about 8% good and 12.5% bad (derived, log-normal); the test measures the real verdict function |
| B7 | Substitutes read the price groups | with a price tree that splits store brand from name brand, substitutes for the name brand still offer the cheaper store brand | cannot be red until the price tree exists; its broken-stub control (substitutes reading price groups) must fail |
| B8 | Placement scored only for correctness | the scorer reports depth too, and a placer that always stops one level short fails (10% or fewer above the parent of the true category) | no depth score exists |
| B9 | Width flag lenient at 20 items | `flagWide(prices)` (planned) flags a simulated category truly at 1.5x, with 20 items, at least half the time (seeded) | the point measurement flags it 28% of the time |

Numbers 95%, 10% and half are Claude's proposals (2026-10-07 chat), changeable on his word.

## Done when

- Part A: each safeguard's test catches its bad fixture and passes its good one; the load check
  run on the PC catalogue prints the seven counts and exits 0 at baseline, and exits non-zero when
  a fixture pushes a count above it.
- Part B: every B test is listed as todo in the suite, each fails today for the stated reason, and
  each control behaves (good passes, bad fails).
- App, catalogue and price suites and typecheck green apart from the todos.
