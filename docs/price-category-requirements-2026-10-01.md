# Price category system: requirements, 2026-10-01

The reference requirements for the price category system. His words, 2026-10-01: *"record these
requirnemtns as reference unless a proven better requirement takes its place"*. A requirement here is
replaced only by one shown better (on the bench, or by an outcome), never by preference; the old line
goes to docs/decisions.md.

Asked for as requirements only (RULINGS.md, "Requirements, when asked for, are requirements only"):
nothing below chooses a method, a tool or an architecture. Each line is testable.

Source column: **You** = his words on that date; **Existing** = a pass mark already in the Shin plan;
**Proposed** = Claude's starting number, changeable on his word, its cost shown by the tests.

Built from: his 2026-09-27 category message (RULINGS.md "How Shin predicts a price it has not seen"),
his 2026-10-01 follow-ups (similar price range; scalability, customer data, new sources, Claude's
answers), every price ruling in RULINGS.md, docs/verdict-distribution-design-2026-09-30.md,
docs/price-data-design-2026-09-28.md, docs/price-system-build-plan-2026-09-28.md.

## Scope and terms

- **Item:** anything a shopper can identify: a barcode, a typed name, text read off a package, a
  store listing with no barcode.
- **Category:** a group of items whose unit prices fall in a similar range. Categories nest.
- **Observed price:** a price someone actually saw (store, flyer, shopper, receipt).
- **Estimate:** a price produced by a model (Claude, offline seeding). Never an observed price.
- **Range:** a typical price plus the spread around it, drawn as the verdict chart.

## 1. Categories

| # | The system shall | Pass when | Source |
|---|---|---|---|
| 1.1 | Place every catalogue item in exactly one category at each level of a nested hierarchy | 100% of items have a category path | You, 2026-09-27 |
| 1.2 | Make each category a set of items with a similar price range, measured on unit price | Every category with 20+ priced items has its middle 80% within 1.5x, or is flagged wide | You, 2026-10-01; 1.5x proposed |
| 1.3 | Split a wide category when data allows; never split a narrow one unless that narrows ranges on unseen prices | Every split narrows the range on held-out prices; no split fails that | You, 2026-09-27 |
| 1.4 | Create no subcategory with fewer than 20 priced items | 0 subcategories under 20 | Proposed |
| 1.5 | Allow splits by any recorded attribute (brand tier, pack size, region, chain, season), not only product type | Shown on at least one category per attribute once data exists | Proposed |
| 1.6 | Rebuild the hierarchy from data with no hand edits, without re-placing items | A rebuild runs with zero placement calls | Proposed |
| 1.7 | Keep every hierarchy version; any past answer is reproducible from the version it used | 50 random past answers reproduce exactly | You, "never changes" rule |
| 1.8 | Cover every department, and turn one on only after it passes section 7 | No department serves answers before passing | You, 2026-09-28 (electronics) |

## 2. Placing items

| # | The system shall | Pass when | Source |
|---|---|---|---|
| 2.1 | Place every item a shopper can identify, by any route, in a category | 100% placed at some level | You, 2026-09-30 "ALWAYS" |
| 2.2 | Place items correctly | 95%+ right at category-or-parent on 50+ random hand-checked items, per route | Existing (2026-09-30: 70% to 78%) |
| 2.3 | Place an item only as deep as it is sure of, and record that confidence | Every placement carries a level and a confidence | Proposed |
| 2.4 | Record shopper picks and corrections as placement evidence, and re-score as they accrue | 2.2 re-run after every 500 new confirmations | You, 2026-09-17 "record everything" |

## 3. The range for an item

| # | The system shall | Pass when | Source |
|---|---|---|---|
| 3.1 | Return a range for every request that has a scan left | 0 requests end without a range | You, 2026-09-30 |
| 3.2 | Build the range from the item's own observed prices, and from its category where they are thin or missing | Every answer names its basis | You, 2026-09-27 |
| 3.3 | Never pool prices across unrelated categories (no all-of-Shin median) | No answer has that basis | You, 2026-10-01 |
| 3.4 | Never answer with a single store's price | Every answer is a range | You, 2026-09-30 |
| 3.5 | Express the range for this item's size | Per-unit and pack price both correct on 50 checked items | Existing size system |
| 3.6 | Keep sale prices out of the typical price, stored and shown on their own | 0 sale prices in any centre | Existing |
| 3.7 | Use a relationship between items (store brand cheaper, bigger pack cheaper per unit) only after it passes section 7 | Each relationship has a passing test on file | You, 2026-09-27 |
| 3.8 | Record on every answer: basis, how many prices, confidence, hierarchy version | 100% of answers | Proposed |
| 3.9 | Never change an answer already shown; store a better one separately | 0 edits to shown answers | Existing |

## 4. Data intake and growth

| # | The system shall | Pass when | Source |
|---|---|---|---|
| 4.1 | Take prices from any source through one intake format | A new test source runs end to end with no change outside its reader | Existing plan |
| 4.2 | Keep every captured price whole, unmatched and sale included; delete nothing; hold outliers flagged | 0 deletions; count in equals count stored | You, 2026-09-28 |
| 4.3 | Give each source a trust value: a starting guess, replaced by measured agreement with barcode-checked prices | Replaced for every source with 30+ overlapping prices | You, 2026-09-27; 30 proposed |
| 4.4 | Record store, region and date on every price where known | 100% where the source has them | Proposed |
| 4.5 | Lower an old price's weight with age; nothing over 2 years in a typical price | Checked on the oldest 100 rows | Existing |
| 4.6 | Narrow ranges as data grows | Median width falls as prices per category rise, tracked each rebuild | You, 2026-09-27 |
| 4.7 | Keep every requirement here at 100x today's data (1.5 million prices) | Load test at 100x passes sections 7 and 8 | Proposed |
| 4.8 | Record each source's licence; take nothing with no licence | 0 unlicensed sources | Proposed |

## 5. Customer data

| # | The system shall | Pass when | Source |
|---|---|---|---|
| 5.1 | Record every scan: item, typed shelf price, store, time, the shopper's own good/bad/great call, picks, corrections; photo and area only with consent | Every field stored for 100 test scans | You, 2026-09-17 |
| 5.2 | Turn a typed shelf price into an observed price, marked as a shopper report | 100% of typed prices stored that way | You, 2026-09-28 |
| 5.3 | Count a shopper report in a range only once an independent source agrees for that store and week | 0 lone reports in any range | Existing |
| 5.4 | Count one shopper once per item, store and week | 15 fake accounts cannot move a range | Existing, test built |
| 5.5 | Weight each shopper by how well past reports checked out | Weight differs measurably between accurate and inaccurate test accounts | You, 2026-09-27 |
| 5.6 | Keep consent off by default; store only a coarse area, never exact GPS | 0 exact positions stored | Aurik's ruling |
| 5.7 | Turn an unknown barcode or unmatched name into a pending catalogue item | 100% stored | You, 2026-09-17 |
| 5.8 | Measure how often shoppers' own calls agree with Shin's verdict | Reported each rebuild | You, 2026-09-17 |

## 6. Claude's answers

| # | The system shall | Pass when | Source |
|---|---|---|---|
| 6.1 | Call Claude only when the catalogue cannot produce a range: cheapest model, no web search, under the monthly cap | 0 calls with a search tool; 0 calls where a range existed | You, 2026-09-30 |
| 6.2 | Store every Claude answer with item, model, date and category | 100% stored | You, 2026-09-27 |
| 6.3 | Store Claude answers as estimates, never observed prices, and keep them out of any category with 5+ observed prices | 0 estimates in those categories | Proposed; 5 existing |
| 6.4 | Reuse a stored answer for the same item, at most one call per item per 90 days | Repeat scans make 0 new calls | Proposed |
| 6.5 | Score each stored answer when observed prices arrive, and set Claude's trust per category from that | Scored for every item that gains a price | Proposed |
| 6.6 | Let estimates (Claude, offline Gemini Pro seeding) start an empty category's range, marked low confidence | Every such range labelled | You, 2026-09-28 |
| 6.7 | Fall to the next basis when Claude is down, capped or slow, and still answer | Outage test answers 100% | You, 2026-09-30 |

## 7. Accuracy, checked on every rebuild

| # | The system shall | Pass when | Source |
|---|---|---|---|
| 7.1 | Give honest ranges | An 80% range holds 78% to 82% of unseen prices overall, and within 5 points in every category with 30+ test items | Existing |
| 7.2 | Give useful ranges | Median high-to-low 1.5x or less on category-based answers | Proposed |
| 7.3 | Separate good prices from bad | 70%+ of known sale prices land good or great | Proposed |
| 7.4 | Beat what exists | Beats the 2026-09-28 category range (49.7% inside, 2.36x wide) and Claude alone, by more than run-to-run noise | Existing |
| 7.5 | Test on unseen products and later dates, in the mix shoppers scan | Test set held out by product and date, weighted to Ontario groceries | Existing |
| 7.6 | Prove the test works | Shuffled prices fail; a whole-category range fails on width | Existing |
| 7.7 | Check the answer key by hand before scoring | Under 2% wrong (2026-09-30: 17.9%) | Proposed |
| 7.8 | Not serve a rebuild that fails 7.1 to 7.4; the last passing version stays | Demonstrated once with a deliberately bad rebuild | Proposed |

## 8. Running limits

| # | The system shall | Pass when | Source |
|---|---|---|---|
| 8.1 | Answer fast | 95% of catalogue-based answers within 2 seconds | Proposed; you, 2026-09-15 "wait 10 seconds" |
| 8.2 | Keep model spend under the daily and hard caps, never designed to lose money monthly | Cost model positive at 100x users | You, 2026-09-22 |
| 8.3 | Show no Gemini output in any shopper answer | 0 | You, 2026-09-28 |
| 8.4 | Let the phone draw a range offline from its own category table | Airplane-mode scan shows a range | Existing, second phase |

## Proposed numbers, changeable on his word

1.5x width (from his 20% good and bad thresholds), 20 priced items per subcategory, trust replaced
after 30 overlapping prices, 90 days between Claude calls per item, 70% of sale prices called good
or great, answer key under 2% wrong, 2 seconds per answer, 100x scale.
