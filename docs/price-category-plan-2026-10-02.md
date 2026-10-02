# Price category system: plan to meet the requirements, 2026-10-02

His words, 2026-10-02: *"consider all the requirenments. Now build a plan to achieve these
requiremtns. Don't assume your plan will work. It will 100 percent to reach the requirements. THe
plan should determine what to do when it doesn't reach requiremnts. It should knwo how to improve
and analyse its own errors."*

Meets: docs/price-category-requirements-2026-10-01.md (the reference; RULINGS.md "The price category
requirements are the reference"). Methods: research/price-category-methods-2026-10-01/ (A is the
first method for each requirement, B and C the next). Plan only: nothing here is built until he asks
(RULINGS.md "Build only when asked").

## The one purpose

Every requirement passes its own test, on data the system never saw, and keeps passing on every
rebuild. No method is trusted until its test passes, and no test is trusted until it has gone red on
a known-broken system.

## Part 1. The loop every requirement runs

Every requirement, at every stage, goes through the same seven steps. The loop does not end at
"built"; it ends at "passing and still passing".

1. **Prove the test first.** Before any method is judged, its test is run on a known-good case and a
   known-broken case (7.6). If the broken case passes or the good case fails, the test is fixed
   before anything else. A test that has never gone red is not a test.
2. **Seal the data the decision is made on.** The test set is fixed and sealed before the method is
   tuned (7.5). Nothing tuned on it may be judged on it.
3. **Run the first method (A).** Record the score, its noise floor (7.4), and what it cost.
4. **Pass:** release through the gate (7.8), add the test to the regression suite that every rebuild
   runs, and move to monitoring (step 7).
5. **Fail: diagnose before changing anything.** The failure is sorted into exactly one cause, by the
   checks in Part 2:
   - **Test wrong** (the controls misbehave, or the answer key is wrong): fix the test, re-run step 1.
   - **Data missing or wrong** (failures cluster where prices are thin, old, from one source, or
     mislabelled): the item goes to the data queue (Part 3); the method is not blamed.
   - **Method wrong** (the test is sound, the data is enough, and it still fails): improve within the
     method (step 6), then move to the next method.
   - **Requirement unreachable** (every method failed on a sound test with enough data): the
     evidence goes to him (Part 5). Never decided alone.
6. **Improve, with a budget.** A method gets at most 3 improvement rounds. A round counts only if it
   beats the last by more than the noise floor. Two rounds in a row inside the noise floor end the
   method early. Each round is judged on a fresh sealed set, never the one its errors were read on.
   Then the next method (B, then C). Every method retired is recorded with one of four verdicts: idea
   bad, version bad, test bad, never properly tested; only "idea bad" removes it for good.
7. **Monitor after release.** Real prices that arrive later (shopper reports, new store reads, sale
   prices) score every answer already given. If a passing requirement drops below its mark on live
   data for two rebuilds in a row, it re-enters at step 5. A change that fixes one requirement and
   breaks another is not released: the whole regression suite runs on every rebuild.

## Part 2. How the system analyses its own errors

Run on every failure, in this order; the first that explains the failure decides the cause.

1. **Controls.** Did the known-good pass and the known-broken fail? If not: test wrong.
2. **Answer key.** A fresh hand audit of the rows behind the failures (7.7). Error rate above 2%:
   test wrong. (The key was 17.9% wrong on 2026-09-30, so the first failure of every accuracy test is
   expected to land here.)
3. **Slice the failures** by: category and its depth, department, route (barcode, typed, read text,
   no-barcode store item), source, province, price age, number of prices behind the answer, price
   level, pack size, sale or regular, the basis the answer used. A failure concentrated in one slice
   is that slice's problem, not the system's.
4. **Thin or skewed data.** If the failing slice has fewer prices than the requirement's minimum, or
   one source supplies most of it, or it is outside what shoppers scan: data missing.
5. **Read the 30 worst errors by hand.** Each gets one line: what was expected, what was given, why.
   Patterns are counted, not described: "12 of 30 are multipacks priced per unit" is a finding,
   "multipacks seem off" is not.
6. **Compare with the next method on the same items.** If the next method fails the same items, the
   cause is upstream (data or placement), not this method.
7. **Write it down.** Every failure gets one row in the error ledger: date, requirement, slice,
   cause, the change tried, the result. Before any change is tried, the ledger is searched: a change
   that already failed for the same cause is not tried again.

The ledger also corrects the plan itself: when the same cause beats the same method family on two
requirements, the next requirement that would use that family starts with its second method.

## Part 3. The data queue

Failures caused by missing data do not wait for a method change; they go here.

- **Ranked by** shopper scans in that category times how far its range is from the mark. The most
  scanned, worst-served categories are filled first.
- **Sources, in order:** pages he browses and saves by hand; store readers that ask by barcode
  (Save-On-Foods); Open Prices; flyers; shopper reports once testers start; Gemini Pro offline seeding
  for categories with no prices at all (low confidence, 6.6 and 8.3).
- **Ontario groceries on repeat dates come first (4.9)**, because until they exist the accuracy
  tests in section 7 cannot run.
- **Done when** the slice reaches its minimum count; the failing requirement is then re-run from
  step 3 of the loop.

## Part 4. Order, by what each step needs and what cannot be taken back

Each stage runs the loop for its requirements. A stage starts when the stages it needs pass; stages
with no shared need run side by side.

| Stage | Requirements | Needs | Why here |
|---|---|---|---|
| 0. Trustworthy tests | 7.6, 7.7, 7.4, 7.5, 4.9 | nothing | Every later pass or fail is read off these; a sealed set must be sealed before anything is tuned on it |
| 1. Keep everything, safely | 4.1, 4.2, 4.4, 4.8, 3.9, 5.1, 5.2, 5.6, 5.7, 5.9, 6.2 | nothing | Data not kept is gone for good, and a privacy leak cannot be taken back |
| 2. The hierarchy | 1.1, 1.6, 1.7, then 1.2, 1.3, 1.4, 1.5 | 0, 1 | Placement and ranges both stand on it |
| 3. Placing items | 2.1, 2.3, 2.2, 2.4 | 2 | A range is only as right as the category it reads |
| 4. The range | 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8, 6.1, 6.3, 6.4, 6.6, 6.7 | 2, 3 | |
| 5. Accuracy gate | 7.1, 7.2, 7.3, 7.4, 7.8, 1.8 | 0, 4 | Nothing ships above low confidence until this passes |
| 6. Learning from outcomes | 3.7, 4.3, 4.5, 4.6, 5.3, 5.4, 5.5, 5.8, 6.5 | 5, live data | These need answers already given and real prices arriving after them |
| 7. Running limits | 4.7, 8.1, 8.2, 8.3, 8.4 | 4 | Checked on the real system at 100x data |

Until stage 5 passes, every answer still ships (3.1), marked low confidence (1.8).

## Part 5. When a requirement cannot be reached

"Unreachable" is claimed only when all of these hold: every method in the research failed with a
recorded verdict; the test passed its controls; the answer key was under 2% wrong; the failing slice
had its minimum data. Then he gets: the requirement, the best score reached and by what, the
closest number that does pass, what it would take to reach the original (data, time, money), and the
cost to the shopper of each choice. He decides. A requirement is replaced only by one proven better
(RULINGS.md); the old line goes to docs/decisions.md.

## Part 6. Every requirement: first method, how a failure shows, what comes next

"Next" lists the methods tried in order after the first; "Last" is what happens after the last
method fails. Methods are named in research/price-category-methods-2026-10-01/.

### 1. Categories
| # | First | Fails when | Diagnose by | Next | Last |
|---|---|---|---|---|---|
| 1.1 | One parent per node by a written rule, one path per item enforced by the database | An item with 0 or 2+ paths | Count items by number of paths; read the 30 with conflicts | A single-parent standard tree (GS1 GPC) as the fixed top | Part 5 |
| 1.2 | Grow by splitting on log unit price toward the 1.5x target; measure each category's middle 80% with a bootstrap interval | A category with 20+ priced items over 1.5x and not flagged | Is it wide from wrong placements (stage 3), mixed units, or real variety? | Price-similarity clustering, then a tree to place new items | Data queue for that category; then Part 5 on the 1.5x number |
| 1.3 | Choose a split on one half of the items, judge it on the other half | A kept split that widens held-out ranges | Re-run with a different half; a split that flips is noise | Pruning with the one-standard-error rule; then shrinkage instead of hard splits | Keep the parent whole |
| 1.4 | Minimum 20 distinct items per subcategory at build time | Any subcategory under 20 | Count items, not rows (one item in 5 stores is 1) | Merge undersized siblings into the parent after the build | n/a: enforced |
| 1.5 | Screen which attributes explain price, then split on those | An attribute that clearly moves price is never used | Read the screen's size for each attribute against held-out narrowing | Partitioning with attributes as split variables; then boosted trees read for importance | Record the attribute as tried, none helped |
| 1.6 | A stable placement layer under a rebuilt price layer | A rebuild makes any placement call | Count placement calls during a rebuild | Bottom-up merging of placement leaves into price groups | Part 5 |
| 1.7 | Append-only version tables holding each version's numbers | A past answer does not reproduce | Replay 50 random past answers against their version | Immutable snapshot files with a content hash | Part 5 |
| 1.8 | A gate reading a stored passing record per department; shadow answers scored before it opens | A department above low confidence without a pass | Audit the gate log | n/a | n/a: enforced |

### 2. Placing items
| # | First | Fails when | Diagnose by | Next | Last |
|---|---|---|---|---|---|
| 2.1 | A cascade: barcode, then text match, then Claude choosing from a fixed list, then the top level | An item unplaced, or over 5% at the top level only | Which route and which department the top-level items come from | A classifier that can name categories from their labels alone | Data queue: labelled examples for those departments |
| 2.2 | Name-meaning match against Open Food Facts' labelled products; Claude only on unsure items | Under 190 of 200 right at category-or-parent, on any route | Answer key first (Part 2.2); then slice by route and department; read the 30 wrong | Claude choosing from retrieved candidates on every item; Open Food Facts' own classifier as a baseline | Clean the labels (confident learning) and re-run; then Part 5 |
| 2.3 | Climb from the best leaf until confidence clears the bar, on calibrated confidence | Placements at a level that is wrong more often than its confidence says | Confidence against hit rate, per level | Per-level thresholds; then coverage-guaranteed sets of categories | Part 5 |
| 2.4 | A feedback log feeding the match index; 2.2 re-run every 500 confirmations | 2.2 not re-run on schedule, or confirmations not reaching the index | Count confirmations against re-runs | Ask shoppers to confirm the items the system is least sure of | Part 5 |

### 3. The range for an item
| # | First | Fails when | Diagnose by | Next | Last |
|---|---|---|---|---|---|
| 3.1 | A fallback ladder that ends in an answer, proven by random-input testing | Any request with a scan left and no range | Replay the failing request; which rung threw | Kill each dependency in turn on a day of real requests | n/a: must be fixed |
| 3.2 | Partial pooling of own prices with the category, its weight measured from data | Answers with own prices do worse than the category alone | Slice by number of own prices | Keep the built centre, calibrate the spread; then a quantile model | Part 5 |
| 3.3 | Fallback stops at the item's department; an assertion fails any wider pool | Any answer built from more than one department | Audit answer bases | Calibrate inside each category only | n/a: enforced |
| 3.4 | Every answer is a range with a minimum width | A one-price or zero-width answer | Audit answers | A full predictive distribution per item | n/a: enforced |
| 3.5 | Pack-size bands plus a learned size curve per category | Over 1 in 50 of the checked items wrong per unit or per pack | Read each wrong item: unit parse, missing size, multipack | Unit value as statistics agencies define it; a units library | Data queue: sizes for the failing category |
| 3.6 | The source's sale flag, with every centre's rows logged | A sale price in any centre | Audit the logged rows | Most-common-price filter once repeat dates exist; sale filters from price-index work | Part 5 |
| 3.7 | Each relationship tested in and out on held-out products | A relationship in use without a pass on file | Audit | Price-index regression with attribute terms; matched pairs | Drop the relationship |
| 3.8 | The answer table refuses a row missing any field | A missing field | Database refuses the write | Per-version lineage records | n/a: enforced |
| 3.9 | Database triggers forbid editing a shown answer | Any edit | Trigger log | A hash chain checked nightly | n/a: enforced |

### 4. Data intake and growth
| # | First | Fails when | Diagnose by | Next | Last |
|---|---|---|---|---|---|
| 4.1 | One standard record, one reader per source, proven by a toy source | The toy source needs a change outside its reader | Which component changed | A stream protocol between readers and the loader | Part 5 |
| 4.2 | Append-only raw and observation tables; outliers flagged by a robust score | Count stored differs from count in, or any delete | The per-batch reconciliation ledger | Declarative data tests in the nightly job | n/a: must be fixed |
| 4.3 | Agreement with barcode-checked prices, pulled toward the guess until 30 overlaps | A source with 30+ overlaps still on its guess, or trust that predicts its error badly | Trust against measured error on held-out overlaps | Joint estimation of true prices and source weights | Part 5 |
| 4.4 | Each reader declares what it supplies; null rate tested | A declared field missing | Null rate per source | Store registry reconciled by address lookup | Record the source as not supplying it |
| 4.5 | Exponential age weight, 2-year cutoff | Old prices hurt accuracy, or a price over 2 years in a centre | Accuracy by price age | Fit the half-life on later prices | Part 5 |
| 4.6 | Width against prices per category, on held-out categories, each rebuild | Width does not fall as prices rise | Slice by category; is the floor the cause? | Partial pooling so thin categories narrow as they fill | Part 5 |
| 4.7 | Current database for answers, an analytics database for rebuilds, tested at 1.5M prices | Any requirement fails at 100x | Which step is slow or wrong at scale | A server database; scale out the nightly step only | Part 5 |
| 4.8 | A source registry the database enforces, each with its basis | A source with no basis, or an automated reader on a forbidding site | Registry audit | Dataset documentation; ask the owner (he sends) | Drop the source |
| 4.9 | Data queue (Part 3), Ontario groceries on repeat dates first | Under 30 items on 2+ dates in a top grocery category | Count by category | More sources from Part 3 | Part 5 |

### 5. Customer data
| # | First | Fails when | Diagnose by | Next | Last |
|---|---|---|---|---|---|
| 5.1 | An append-only scan-event table, consent on each row | A field missing in the 100 test scans | Which screen dropped it | A self-hosted event pipeline | n/a: must be fixed |
| 5.2 | The server alone marks a typed price as a shopper report | A typed price stored any other way | Audit | Photo cross-check of the tag | n/a: must be fixed |
| 5.3 | An agreement gate in the range query, using the independence definition | A lone report, or a ring of new accounts, moves a range | Replay the fake-ring test | Probabilistic source weights on top | Part 5 |
| 5.4 | One report per shopper, item, store and week; capped influence | The 15-fake test moves a range | Which cap failed | Raise the cost of an account (device checks, rate limits) | Part 5 |
| 5.5 | A running right-or-wrong score per shopper | Weights do not separate accurate from inaccurate test accounts | Weight against later verified prices | Loss-based iterative weights | Part 5 |
| 5.6 | Consent off by default; area coarse by construction | Any exact position stored | Column audit | Privacy-impact review before launch | n/a: must be fixed |
| 5.7 | A pending-item table keeping the raw text | An unknown barcode or name lost | Count in against stored | A review queue with a confidence bar | n/a: must be fixed |
| 5.8 | Agreement table, only calls given before the verdict, 1 in 20 scans | A call counted after the verdict was shown | Audit timestamps | Separate shopper noise from Shin error statistically | Part 5 |
| 5.9 | Pooling across 5+ shoppers before anything reaches others | One shopper's store-and-time visible to others | Audit every outward answer | Coarser time and place | n/a: must be fixed |

### 6. Claude's answers
| # | First | Fails when | Diagnose by | Next | Last |
|---|---|---|---|---|---|
| 6.1 | One guarded call with no tools, captured and checked in tests | Any call with a search tool, or a call where a range existed | Request capture | Web search switched off for the whole account; a separate account with its own spend limit | n/a: must be fixed |
| 6.2 | An append-only estimates table written before the answer returns | An answer with no stored row | Count calls against rows | Standard field names for model calls | n/a: must be fixed |
| 6.3 | Estimates kept apart, with a gate at read time and a control | An estimate inside a category with 5+ observed prices | Control test | Weight estimates to zero once 5 prices exist | n/a: enforced |
| 6.4 | Cache by item for 90 days | A repeat scan makes a new call | Count repeats against calls | Fill the most-scanned unpriced items overnight in bulk | Part 5 |
| 6.5 | Score each estimate on log ratio; widen per category by a shrunken factor | Claude's ranges miss real prices more than their stated rate | Coverage per category | Recalibrate its ranges; correct per-category bias statistically | Stop calling Claude for that category |
| 6.6 | An estimate as one discounted extra price, labelled low confidence | Seeded ranges miss real prices worse than the parent's range does | Compare with the nearest priced parent | A robust mixture; borrow from the nearest priced parent first | Seed nothing for that category |
| 6.7 | Timeout, circuit breaker, ordered fallback, with forced failures in tests | Any answer lost when Claude is down | Fault injection | Answer now, refine later; serve a stale estimate | n/a: must be fixed |

### 7. Accuracy
| # | First | Fails when | Diagnose by | Next | Last |
|---|---|---|---|---|---|
| 7.1 | Per-category calibration of the range, thin categories borrowing from parents | Outside 78% to 82% overall, or a category fails its check | Part 2 in full | Quantile model with calibration; clustering thin categories for calibration | Part 5 |
| 7.2 | Interval score as the one number, width beside it | Median width over 1.5x | Slice: wide because the category is wide (1.2) or the method is loose? | Ranges that adapt to how hard the item is; narrower categories (1.2) | Part 5 |
| 7.3 | Hide a known sale, check where its price lands, with a control | Under 70% land good or great | Check the sale key first (13 of 45 were wrong on re-read) | Validate the key, then re-run | Part 5 |
| 7.4 | Paired comparison resampled by product, noise floor from repeated splits | Not ahead of both by more than the noise | Per-item score differences | A corrected paired test; Claude run 5 times per item for its own noise | Part 5 |
| 7.5 | Held out by product and date; Ontario grocery holdout | Any product or date on both sides | Leak audit | Weight the test to the shopper mix; a surveyed Ontario sample | Data queue (4.9) |
| 7.6 | Shuffled, known-bad and known-good controls every rebuild | A control behaves wrongly | The control's own result | Deliberately broken versions of the estimator | Fix the test; nothing else runs |
| 7.7 | Hand audit sized by its confidence bound, fresh sample each round | Over 2% wrong | Which kind of row is wrong | A detector to flag likely errors, then hand-check; two labellers | Rebuild the key |
| 7.8 | A gate that moves a pointer only when every test passes | A failing rebuild served | Gate log | Monitoring after release that pulls a bad version back | n/a: must be fixed |

### 8. Running limits
| # | First | Fails when | Diagnose by | Next | Last |
|---|---|---|---|---|---|
| 8.1 | Load test at 100x data, failing if 95% are not under 2 seconds | Slower | Time each step of a slow answer | An always-on timing record; exact timings from the scan table | Part 5 |
| 8.2 | A per-scan cost model with ranges, checked against real billing weekly | Cost model negative at 100x users | Which cost line drives it | Layered caps; fewer calls through 6.4 | Part 5 (pricing, scans given) |
| 8.3 | Only allowed sources can reach the answer; Gemini only as a labelled seed | Any other Gemini output reaches a shopper | Provenance audit | Ban the import at build time | n/a: enforced |
| 8.4 | A versioned category table in the app pack | No range in airplane mode | Airplane-mode test | On-device database with the same table | Part 5 |

## What would make this plan wrong

- Tuning on the sealed set by accident: every diagnosis reads a different set from the one the fix is
  judged on (loop step 6).
- Blaming a method for missing data: Part 2 checks data before method.
- A test that cannot fail: step 1 runs before every judgement.
- The plan's own method order being wrong: the ledger moves a method family down after it loses
  twice (Part 2, last paragraph).
