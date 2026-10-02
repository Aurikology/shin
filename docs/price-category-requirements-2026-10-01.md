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
| 1.1 | Give every catalogue item exactly one path through the hierarchy, from the top level down to one deepest category (how deep an answer goes is 2.3) | 100% of items have exactly one path | You, 2026-09-27; amended 2026-10-02 |
| 1.2 | Make each category a set of items with a similar price range, measured on unit price | Every category with 20+ priced items has its middle 80% within 1.5x, or is flagged wide | You, 2026-10-01; 1.5x proposed |
| 1.3 | Split a wide category when data allows; never split a narrow one unless that narrows ranges on unseen prices | Every split narrows the range on held-out prices; no split fails that | You, 2026-09-27 |
| 1.4 | Create no subcategory with fewer than 20 priced items | 0 subcategories under 20 | Proposed |
| 1.5 | Allow splits by any recorded attribute (brand tier, pack size, region, chain, season), not only product type | Shown on at least one category per attribute once data exists | Proposed |
| 1.6 | Rebuild the hierarchy from data with no hand edits, without re-placing items | A rebuild runs with zero placement calls | Proposed |
| 1.7 | Keep every hierarchy version; any past answer is reproducible from the version it used | 50 random past answers reproduce exactly | You, "never changes" rule |
| 1.8 | Cover every department; a department that has not passed section 7 still answers (3.1), every answer marked low confidence, until it passes | 0 answers above low confidence from a department that has not passed | Proposed, amended 2026-10-02 |

## 2. Placing items

| # | The system shall | Pass when | Source |
|---|---|---|---|
| 2.1 | Place every item a shopper can identify, by any route, in a category | 100% placed at some level, and no more than 5% placed only at the top level | You, 2026-09-30 "ALWAYS"; 5% proposed 2026-10-02 |
| 2.2 | Place items correctly | 95%+ right at category-or-parent (190 of 200) on 200+ random hand-checked items per route, with the 95% lower bound reported | Existing bar; sample size amended 2026-10-02 (50 items cannot prove 95%: 48 of 50 proves only 0.879) |
| 2.3 | Answer from the deepest level the placement is sure of, and record that level and confidence | Every placement carries a level and a confidence | Proposed |
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
| 4.8 | Record each source's basis for use: a licence, the site's terms, or pages he browses and saves by hand; run no automated reader on a site whose terms forbid one | Every source has a recorded basis; 0 automated readers on a forbidding site | You, 2026-10-02 |
| 4.9 | Hold prices for what shoppers scan (Ontario groceries first), each item on more than one date, so section 7 can run | 30+ test items with prices on 2+ dates in every top grocery category | Proposed 2026-10-02 |

## 5. Customer data

| # | The system shall | Pass when | Source |
|---|---|---|---|
| 5.1 | Record every scan: item, typed shelf price, store, time, the shopper's own good/bad/great call, picks, corrections; photo and area only with consent | Every field stored for 100 test scans | You, 2026-09-17 |
| 5.2 | Turn a typed shelf price into an observed price, marked as a shopper report | 100% of typed prices stored that way | You, 2026-09-28 |
| 5.3 | Count a shopper report in a range only once an independent source agrees for that store and week. Independent means a source that is not a shopper (store page, flyer, receipt, photographed tag), or a shopper on a different device with 3+ past reports already confirmed | 0 lone reports in any range; a ring of new accounts agreeing with each other moves no range | Existing; independence defined 2026-10-02 |
| 5.4 | Count one shopper once per item, store and week | 15 fake accounts cannot move a range | Existing, test built |
| 5.5 | Weight each shopper by how well past reports checked out | Weight differs measurably between accurate and inaccurate test accounts | You, 2026-09-27 |
| 5.6 | Keep consent off by default; store only a coarse area, never exact GPS | 0 exact positions stored | Aurik's ruling |
| 5.7 | Turn an unknown barcode or unmatched name into a pending catalogue item | 100% stored | You, 2026-09-17 |
| 5.8 | Measure how often shoppers' own calls agree with Shin's verdict, counting only calls given before the verdict was shown, asked on no more than 1 scan in 20 | Reported each rebuild | You, 2026-09-17; before-the-verdict rule 2026-10-02 |
| 5.9 | Never let one shopper's store-and-time trail reach anyone else: what is used to answer others is pooled across 5+ shoppers or carries no store-and-time detail | 0 answers expose a single shopper's store and time | Proposed 2026-10-02 |

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

A check that cannot run for lack of data is recorded as not run, never as passed; answers still
ship (3.1), marked low confidence (1.8).

| # | The system shall | Pass when | Source |
|---|---|---|---|
| 7.1 | Give honest ranges | An 80% range holds 78% to 82% of unseen prices overall; within 5 points in every category with 250+ test items; in every category with 30 to 249, not rejected by an exact binomial test at 1% | Existing; per-category test amended 2026-10-02 (at 30 items, a perfectly calibrated range lands within 5 points only 50.6% of the time) |
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
| 8.3 | Show no Gemini output in any shopper answer, except a range Gemini Pro seeded offline for an empty category (6.6), labelled low confidence | 0 other Gemini output | You, 2026-09-28; seeding exception, you, 2026-10-02 |
| 8.4 | Let the phone draw a range offline from its own category table | Airplane-mode scan shows a range | Existing, second phase |

## Proposed numbers, changeable on his word

1.5x width (from his 20% good and bad thresholds), 20 priced items per subcategory, trust replaced
after 30 overlapping prices, 90 days between Claude calls per item, 70% of sale prices called good
or great, answer key under 2% wrong, 2 seconds per answer, 100x scale; added 2026-10-02: 5% at
top level only, 200 items per placement check, 250 items for the 5-point check, 3 confirmed reports
for an independent shopper, 1 scan in 20 asked for the shopper's own call, 5 shoppers to pool,
30 items on 2+ dates per top grocery category.

## Changes, 2026-10-02

His words on the research's nine problems: *"2. gemini pro will be used to seed empty categories 4.
follow the requirments 5. its not automated copying, i'm manually browsing the web pages // you can
make the call for the rest of the points"*. 8.3 and 4.8 changed on his word; 3.3 stands (the verdict
chart's all-of-Shin rung goes); 1.1, 1.8, 2.1, 2.2, 5.3, 5.8, 7.1, the section 7 note, and new 4.9
and 5.9 are Claude's calls on his permission. Old lines in docs/decisions.md.
