# Price system build plan, 2026-09-28

Asked by Jamin 2026-09-28: *"create a plan to build all of this"*, after the process in RULINGS.md,
"How a Shin system is designed". Plan only; nothing here is built. Inputs:
`docs/price-data-design-2026-09-28.md` (first design guess, now a list of things to test),
`research/price-system-references-*-2026-09-28.md` (47 outside items, 45 with content),
`docs/screenshot-matcher-design-2026-09-28.md` (the printout matcher, being tested by another
session), `docs/price-access-sweep-2026-09-27.md` (sources, re-ranked by what users scan).

## The one purpose

**A shopper holding a product gets an answer they can trust, in seconds: is this shelf price low,
typical or high for this item near them.** Every unit below names how it moves that, and is kept
only if the top check moves.

**Top check (run after every phase from B on):** on held-back real prices whose truth is known,
(1) store-marked sale prices land in the low zone, (2) the range holds the real price as often as
it claims, per category, (3) the range is narrow enough to separate the two. Default bar, set now,
changeable by Jamin: sale prices read low at least 80% of the time; an item with its own prices gets
a range no wider than 1.5x high over low; a predicted range states its measured hit rate.

## Facts the plan is built on (measured 2026-09-28)

- 6,208 of 15,193 stored prices (41%) have no barcode and never reach a range; 252 sale prices are skipped.
- Category range, leave-one-out: real price inside 325 of 654 (49.7%), median width 2.36x, 86% liquor.
  Its answer key (liquor board lists) is itself unaudited.
- Printout matcher, other session, held-out 77 products: right product in the shortlist 40 of 57
  (70%, bar 80%, fails as built); **20 of 77 not in the catalogue at all** (produce, Walmart fresh
  brands, imports); 88 of 898 tiles had picked up a neighbour's name (fixed); Walmart's bot check
  stopped the barcode reader after 77 pages.
- Used goods are out (RULINGS.md, 2026-09-28). What users scan: groceries weekly, and new bigger
  purchases in store (electronics, tools, appliances).

## Order, by what cannot be taken back

A price not captured today is lost; a model can be rebuilt any day. So: **A (stop losing data) and
B (the test bench) first, in parallel.** C (matching) continues in the other session. D and E
change answers, so they wait for B. F waits for testers. G is the product, built on whatever wins E.

Each unit: what it is for · what gets built · **done when** (pass mark set before building, plus a
case it must fail) · borrowed from. Every unit is handed to a worker with its done-when written first.

## A. Stop losing data

**A1. Three-layer store.** For: every later unit trains and tests on what is kept here.
Build: raw captures kept unedited (file, hash, tile crop, every word); observation rows gain store
category, "was" price, sale flag, tile image, parsed brand/size/variant, capture id, source; identity
link (barcode + how found + confidence) optional and replaceable.
Done when: the 29 printouts give 898 rows for 898 products, every drop has a logged reason; the
observation table rebuilt from raw alone matches the stored one exactly; deleting one raw file turns
that rebuild check red. Borrowed: Project Hammer's product table + raw price history split, and its
habit of labelling bad rows rather than deleting them; Keepa's price-type split.

**A2. Printout intake keeps every tile.** For: unmatched and sale tiles are the training data.
Done when: 20 tiles re-read by hand for name, price, sale flag and "was" price all agree; the
neighbour-name defect (88 tiles) is caught by a standing check that fails when reintroduced.

**A3. New sources, one reader contract.** For: prices on what shoppers scan. Order: groceries
(Flipp flyers, PC Express, Save-On-Foods, Walmart pages), then new electronics and tools (Best Buy,
Canadian Tire). Each reader checks the page's own schema.org Offer markup before any custom parsing.
Browser workers where a page needs Chrome, one per Chrome profile, no evasion (RULINGS.md, price feed
sourcing). Done when, per source: 20 rows re-read by hand; count of top-scanned items it prices;
the legal notes in the price sweep checked for that store. Borrowed: flipp_flyer_parser (Canadian
flyers, schema with store + validity window), Project Hammer's known failures (product ids that
change daily, same-day duplicates, Save-On-Foods brand mix-ups), Instacart's attribute extraction
(95% on simple attributes; 60% worse on hard ones with cheaper models, so the reading model is
tested per attribute).

## B. The test bench (before any answer changes)

**B1. Answer keys, audited.** For: every score below is only as good as its key.
Build: (a) products with their own prices at 3+ stores, for prediction; (b) sale prices with their
regular price, and convenience-store prices, for the low/high check; (c) store-page barcodes, for
matching (the other session's key). Audit: flag suspicious prices by model disagreement (cleanlab
method) and re-read 50 by hand. Done when: the key's own error rate is measured and written beside
it. Borrowed: Northcutt et al. (3.4% average label errors in famous test sets; ~6% more reordered
model rankings).

**B2. Harness.** Build: split by product (never the same product both sides) and by time (learn on
older, score on newer), plus one **sealed batch** collected after tuning stops and opened once.
Scores: hit rate per category, width, interval score, log error, the low/high check, reported as
"within X%, Y% of the time". Borrowed: scikit-learn grouped and time splits; interval scoring
(scoringutils); the backtest-overfitting paper for the sealed batch; Zillow's lesson (score the
answer as it was shown, never a later updated one).

**B3. Test the test.** Done when all four behave: a shuffled-price model fails; a model returning
the whole category fails on width; a planted wrong row in the key gets flagged; a perfect oracle
passes. The bench is not used for any decision until this holds.

**B4. Baselines on record.** Today's category range; category median; Claude's no-web-search guess
on a 200-item sample (cost logged). Every later model must beat all three on the same items.

## C. Matching (the other session's test continues; this plan does not duplicate it)

Done when: shortlist holds the right product for 80%+ of held-out key items; wrong accepted matches
2% or fewer, judged by the upper end of the 95% interval; not-in-catalogue items return no match.
Next fixes named by that session: French names, Splink-learned weights for brand/size/pack,
size parsing (quantulum3). Borrowed: Splink, Ditto, the WDC Products benchmark (built around
right-brand-wrong-size pairs; warns of unseen brands), Abt-Buy and Amazon-Google as sanity sets.
Items not in the catalogue (1 in 4 so far) go to D as data, and to a list of what the catalogue lacks.

## D. Unmatched items become data

**D1. Store category to Shin category, once per store page.** Done when: 50 random unmatched items'
mapped categories re-read by hand, 95%+ right.
**D2. The range reads unmatched rows and sale rows** (sale rows kept apart as their own kind).
Done when: on B's bench it beats the B4 baselines by more than run-to-run noise, or it is not
merged. The standing test "an unjoined row never counts" is replaced by one proving an unmatched row
counts in its category and never as a product's own price.

## E. The model

Trained offline in Python; its output is a table in the price database that the server reads by
lookup, so the app keeps no model at runtime and stays pure math.
**E1. Layered model** (Bambi/PyMC): log price from nested category, brand, store, region, size curve,
time. **E2. Tree model** (LightGBM, quantile loss) with a ready-made embedding of the product name.
**E3. Honest ranges:** conformalized quantile regression (MAPIE) on whichever wins, checked per
category (equalized coverage). **E4. Export and serve:** nightly table; the app's answer for 50 items
equals the table.
Done when: on the sealed batch it beats all B4 baselines; each category with 30+ test items is
within 5 points of its stated hit rate; width under the usefulness line. A neural network is tried
only when the data is many times larger and it beats the trees on the same bench. Borrowed: Mercari
price challenge (category + brand + text to price; winners blended simple models, scored on log
error), Grinsztajn et al. 2022 (trees win at ~10K rows), Romano/Patterson/Candès 2019 (CQR),
Chung et al. 2020 (quantile loss alone does not make ranges honest).

## F. Shopper reports (starts with testers)

Build: each report kept with photo-or-typed, account, store, time; one per account per item per
store per week; outliers against neighbouring stores held, not dropped; weight by agreement,
Dawid-Skene style while reports are few. Done when: 15 planted fake accounts cannot move any range;
real reports' agreement with verified prices is measured and sets their weight. Borrowed: Zheng et
al. 2017 (truth inference: ~65% at 1 answer to 94-96% at 20), the Nigeria food-price study (outliers
vs neighbours, reweighting), the Waze Sybil paper (15 bots faked a jam; tie reports to verified
accounts).

## G. The answer the shopper sees

Build: usual price nearby, lowest recent price and where, how low it goes on sale; for predicted
items, the item's own range with how many prices stand behind it. The range always shows (Always
answer); the low/typical/high label shows only when its confidence check passes (Google Flights
pattern). Log exactly what was shown, for scoring. Done when: the top check passes on the sealed
batch. Wording: RULINGS.md "The price line speaks the shopper's own range" holds until Jamin decides
(open question, 2026-09-28); Competition Act "general impression" standard (fines up to $10M or 3%).
Borrowed: CarGurus deal ratings, Kelley Blue Book fair range, Kayak per-forecast confidence.

## H. After launch

Weekly re-score on new prices against what was shown; an alarm that separates a real decline from
a noisy week (confidence sequences, arXiv 2110.06177).

## Electronics, its own track after groceries pass

Identity by model number (Icecat catalogue), price from brand, line, specs and months since launch,
the item's own history first. Same bench, its own answer key; no result carried over from groceries.

## Who does what

Sonnet workers build, one unit each, briefed with its done-when; browser workers read store pages,
one per Chrome profile; the conductor sets the done-whens, checks each result from outside the
worker's own claim, and runs the bench. Workers commit per unit, spawn no sub-agents.

## Open, and not blocking

- Jamin: whether a passed top check unlocks the words good/bad (G).
- Not opened in research: Keepa and CamelCamelCamel methods, Zillow's own error page. A browser pass
  before G relies on them.
