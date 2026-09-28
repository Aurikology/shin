# Price data: what is kept, what trains the model, and how the range is judged, 2026-09-28

Asked by Jamin 2026-09-28, about the store-printout pipeline (`docs/screenshot-matcher-design-2026-09-28.md`)
and everything after it: how much useful data is thrown away, what happens to an item that matches
no barcode, how new sites and electronics come in, how the price model works and whether it is
tested, how tests are designed when a test can itself be wrong, what model to build, how shopper
data is weighed, and how the range the shopper sees is chosen. Rulings from the same turn:
RULINGS.md, "Everything is an assumption until tested, and a test can be wrong" and "Priced store
items that match no barcode still train prices".

Design only, except the measurements, which were run 2026-09-28 on the Windows PC.

## What was measured today

| Measured (read-only, `price/data/prices.db`, `catalogue/data/catalogue.db`) | Count |
| --- | --- |
| Price rows stored | 15,193 |
| Of those, no barcode, so `range.ts` never reads them | **6,208 (41%)** |
| ANBL rows with no barcode | 6,108 of 6,741 |
| Sale rows (`kind = 'promotional'`), which `range.ts` also skips | 252 |
| Products with a barcode and a regular price | 8,480 |
| Of those, with a catalogue category AND a size, so the category step can use them | **983 (12%)** |
| Tests in `price/test/range.test.ts` | 14, every one checks arithmetic; **none compares a prediction to a real price** |

**Leave-one-out test of the category step** (method of `range.ts` re-implemented in Python, not its
code; no 90-day window; script kept outside the repo). Each of the 983 products was hidden and its
range built from the other products in its leaf category (else parent, at least 5), scaled to its size:

| Result | Value |
| --- | --- |
| Got a range | 654 (329 had too few neighbours) |
| Real price inside the range | **325 of 654, 49.7%** |
| Typical miss of the range's middle against the real price | 25% (1 in 10 misses by 149% or more) |
| Typical range width, high over low | 2.36x (1 in 10 is 4.8x or wider) |
| Share of the 654 in two liquor leaves (beer; alcoholic drinks) | 565, 86% |

What it means:

1. **The range is the middle half of the category, so about half of real prices fall outside it by
   construction.** 49.7% is that construction showing, not bad luck. The range answers "what do
   things in this category cost", not "what does this item cost".
2. **A 2.36x range cannot tell a good price from a bad one.** From $4.00 to $9.44 almost any shelf
   price lands inside.
3. **There is no evidence yet about groceries.** 86% of what could be tested is beer and liquor from
   BC and New Brunswick. Nothing here says how the method does on cereal in Ontario.

## 1. Keep everything, decide identity later

Today the printout design writes a price only when the match is accepted; everything else "stays
unmatched: no price attached". That is replaced: **identity is a link added later, never a gate at
intake.** Three layers, each kept:

- **Raw capture, never edited or deleted:** the PDF or screenshot file itself, the tile crop, every
  word on the tile, retailer product id and URL, store, region or store address, capture time.
- **Observation, one per tile per capture:** full title as printed and, when read, the full title
  from the product page; brand, size and variant parsed from it; price; unit price and per-weight
  flag; **sale or regular, and the regular ("was") price when the tile shows it**; the store's own
  category (the page it came from, e.g. Walmart "Cooking Oils"); the source.
- **Identity link, optional and replaceable:** barcode with how it was found (stated by the store,
  matched and checked, or none) and a confidence. A later matcher can add or fix it without
  re-capturing anything.

The `observation` table already allows a row with no barcode (`code` NULL, `page_gtin`,
`image_url`, `kind`). Missing: the store's category, the "was" price, the tile crop, the source's
trust, the parsed size for unmatched rows.

## 2. Unmatched items train the price model

An item with no barcode still has a category, a brand, a size and a price. What it needs is a
category in Shin's terms:

- **Store category to Shin category, mapped once per store page**, not per item. Walmart's 29
  printouts are 29 category pages; a few hundred mappings cover a store. Each mapping is checked
  like everything else.
- **Size and brand from the title** (the parser in the matcher design, stage 1).
- With those, the item is a data point for the category's price spread and for the model below,
  weighted by how sure the category and size are. It never enters the catalogue.
- **Near misses count too.** Of the 12 wrong picks in the matcher test, 10 had the right brand and
  product and the wrong size or flavour: those still say what that brand charges per 100 g.

`range.ts` then reads rows with no barcode for the category steps. Today a test there
("an unjoined row (code NULL) never counts") forbids it; that test changes with this design.

## 3. Sale prices are the most useful data we skip

`range.ts` leaves sale prices out so the range shows the regular price. Kept apart instead, they
answer the shopper's real question: how low this item goes and how often. A "was $6.29, now $4.99"
tile gives both prices in one row. Sale prices are also a free test set (section 6): a price a store
marked as a deal should land low in Shin's answer.

## 4. New sites, and things that are not groceries

- **One intake contract for every source.** Each site's reader outputs the three layers above and
  declares what it can supply: barcode (Walmart page, Metro URL, Save-On-Foods), store category,
  region, sale flag. A new site is a new reader, nothing downstream changes.
- **Groceries and drinks** compare by unit price (per 100 g, per 100 ml, each). The current method
  only works there, and only when the size is known (79% of Canadian food rows have none).
- **Electronics do not work that way.** A TV has no unit price. Identity is a model number, not
  text; price depends on specs (size, storage, generation) and falls with age since launch. The
  electronics model predicts from brand, product line, specs and months since launch, using that
  item's own price history first. The Icecat catalogue already holds model numbers and specs.
- **Everything else** (tools, household, toys) is its own group. No group is assumed to behave like
  another until tested (section 6).

## 5. The model

**Can prices from all categories predict something?** Not the price level: a beer says nothing about
cereal's price. What does carry across categories, and has to be tested per category before it is
trusted:

- a store's level (one chain costing some percent less than another across most of the shelf),
- store brand against national brand,
- the bulk curve (a bigger pack costing less per 100 g, at a similar rate across many foods),
- region, and how deep and how often sales go.

**The model family:** a price is a category's base, multiplied by brand, store, region, size and
time effects. A thin category borrows its base from its parent; a thick one stands on its own data.
This is the ruling's "apples stay whole, wine is split further" done by the data rather than by hand:
the split happens where the data shows the spread differs. Two ways to fit it, both run and compared:

- **A multilevel (hierarchical) regression** on log price. Transparent: every effect is a number
  that can be read and checked.
- **Gradient-boosted trees (LightGBM) with quantile loss** giving the low, middle and high directly,
  with a text embedding of the product name (a ready-made embedding model, not one we train) as a
  feature so that similar names count as neighbours.

**A neural network trained from scratch: not now.** With about 15,000 price rows, tree models are
the established winner on table-shaped data (Grinsztajn et al., 2022, "Why do tree-based models
still outperform deep learning on tabular data?"). It comes back when there are hundreds of
thousands of rows and it beats the trees on the same held-out test.

**Every model must beat two baselines, on the same items:** the current category middle half, and
Claude's no-web-search guess (the fallback in RULINGS.md). One that does not beat both is not used.

## 6. How it is tested, when the test can be wrong

Set before anything runs:

- **Held out by product and by time.** The same product (at another store) is never in both
  training and test. The model is trained on prices before a date and scored on prices after it,
  which is how it is used.
- **Scored on two numbers together:** calibration (a range meant to hold 80% of real prices holds
  about 80%) and width (high over low). Either alone can be gamed: $0 to $1,000 is always right,
  a single number is never right.
- **Scored on what shoppers will scan.** The test set is drawn to match scans (groceries, Ontario,
  the stores in the price sweep), not whatever data is easiest. Today's data would test liquor.
- **Discrimination, the shopper's actual question.** Sale prices should land in the low zone;
  convenience-store prices in the high zone. Counted: what share of known deals Shin calls low.
- **The test is tested:**
  - A deliberately broken model (prices shuffled across products) must fail. If it passes, the test
    is broken.
  - A model that returns the whole category must fail on width.
  - The answer key is re-read by hand on a sample every time. The matcher key had 1 wrong row in 20.
  - A result inside the run-to-run noise counts as no result.
- **Accurate, for a data source, means agreeing with barcode-verified prices** for the same product,
  store and week. Each source's trust starts as a guess and is replaced by its measured agreement
  once overlap exists.

## 7. Shopper data

A price a shopper reports at a shelf is the best data point there is (real item, store, date,
location) and the least checked. It earns weight, it is not given it:

- **A photographed price tag** read and matching the typed price: high. **Typed only:** low.
- **Agreement:** a shopper's price counts fully once a second independent source (another shopper,
  a store page, a flyer) agrees within a few percent for that store and week. Until then it shows as
  one report, never as the range.
- **Track record:** a shopper whose past reports agreed with verified prices gets more weight; one
  whose reports were outliers gets less. One shopper counts once per item per store per week, so
  repeated reports cannot move a range.
- **Outliers** far outside the category's spread are held, not dropped, until something agrees.

Today these rows sit in `user_observation` with trusted = 0 and never reach a range, which is the
safe starting point.

## 8. The range the shopper sees

The shopper wants to know whether the price in front of them is a good one. An answer that cannot
separate a good price from a bad one is worthless, whatever its accuracy. So:

- **For an item Shin has prices for:** the usual price (middle of recent regular prices across
  stores near the shopper), the lowest recent price and where, and how low it goes on sale. These
  are facts, which the neutral-wording ruling allows.
- **For an item Shin predicts:** the model's range for that item (not the category's middle half),
  with the number of prices behind it and how wide it is.
- **Usefulness line, set before launch and then measured:** a range wider than a set ratio (for
  example 1.5x high over low) still answers, per "Always answer", but says it is a rough figure for
  the kind of product, not this item.
- **The verdict words stay neutral** (RULINGS.md, "The price line speaks the shopper's own range,
  never Shin's opinion"): "good price" and "bad price" are barred without measured testing. Section
  6's discrimination test is that measurement.

## Order to build

1. Store the three layers for printouts, unmatched tiles included, with sale and "was" prices.
2. The test harness (section 6), run first on today's `range.ts` so the baseline is on record.
3. Store category to Shin category mapping for Walmart's pages; let `range.ts` read unmatched rows;
   re-run the harness.
4. The multilevel model and the tree model, each scored against both baselines.
5. The shopper-facing answer (section 8) on whichever model wins.
6. Electronics as its own model, after groceries have passed.
