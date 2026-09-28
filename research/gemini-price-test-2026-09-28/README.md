# Pricing without data: the design, the flawed first plan, and the Gemini liquor test

2026-09-27/28, one session on the PC (agent repo, working in C:\shin). Everything below is either
counted from a file named here, quoted from Jamin, or labelled as judgment. Ruling text lives in
RULINGS.md; this file is the evidence and the history.

---

## 1. Where the catalogue and the app stood

Read from NOW.md, docs/catalogue-build-plan-2026-09-26.md, comms/, and git log on 2026-09-27.

- Catalogue: 4,289,929 products, 473,773 sold in Canada. Phone pack 473,677 rows, 6.50 MB.
- Built for catalogue-first, all behind `SHIN_CATALOGUE_FIRST` (off): catalogue answer, type the
  name, pick one of 3 screens (dd557a2); server wiring (5e52e6d); price range by math (2fb9ad9);
  a capped range ask (30112e2) which calls Gemini, ungrounded.
- Being built by Aurik: the on-device text reader. On main, but iOS needs the Mac's iOS project
  rebuilt with CocoaPods first (comms 2026-09-27 22:30).
- Parked on purpose: 4,636,853 non-Canadian food rows; BC alcohol (130,404 rows, at most 5.8%
  priceable); embeddings (718,662 of 5,182,591 done); books and music.

## 2. Corrections Jamin made in this session (all now in RULINGS.md)

- **Shin does not use Gemini.** *"this is probably the 10th time saying this, we are not using
  gemini, we are using claude for a typical range without having it search the web, this way we
  save a lot of credits"* (2026-09-28). Root cause of the repeated error: docs/decisions.md had
  glossed Aurik's plan text *"Call claude"* as Gemini. Five RULINGS entries rewritten (13bc04e,
  d0a7498); the settings registry follows the renamed rulings.
- **Answer questions about how Shin works from the docs, not the code** (26b866f).
- **Flip catalogue-first on:** Jamin's *"do 3 and 4"* (3 = confirm scanned barcodes show Shin's
  own prices, 4 = flip catalogue-first). His half of the both-founders flip is recorded; Aurik's
  is not.
- **The mailbox is checked automatically**, unasked (*"why are you not automatically checking the
  mailbox"*). Agent repo RULINGS.md and the mailbox skill.
- **Always give an answer; accuracy is deferred, not ignored.** Price prediction through nested
  categories (RULINGS.md, "How Shin predicts a price it has not seen"). Typed search now answers
  with the predicted range instead of nothing.

## 3. What the Mac reported (mail 20260928020135-mac-3c6c6c)

- Live server now at 39b60cd, restarted 02:00:09Z, 2,293 tests pass.
- `SHIN_BARCODE_OWN_PRICES` unset, so on by default, but **unverifiable**: the server's
  prices.db is 0 bytes and the user-catalogue it reads (shin-data/user-catalogue.db) does not
  exist. A 1,967-offer copy sits unread in shin-live/app/data.
- Catalogue-first **not flipped**: held for Aurik's half.
- `SHIN_GEMINI_TIER` unset, so **photo scans are refused live**.
- Asked of Jamin, still open: Aurik's yes, and which price data to load onto the Mac (default:
  the PC's full store).

## 4. The price math as built, and what it has to run on

`price/src/range.ts` (2fb9ad9), per its commit message: the product's own regular prices (3+
shops, 90 days), else its leaf category's unit prices scaled to size (5+ products), else one step
up the category, else "none". Range is 25th to 75th percentile. Ignores promo and shopper-typed
prices. Tested on fixtures only.

This PC's `price/data/prices.db`, counted 2026-09-28: **15,193 observations, 13,402 codes**.

| Source | Rows |
|---|---|
| bcldb (BC liquor) | 7,556 |
| anbl (NB liquor) | 6,741 |
| openprices (shopper-typed) | 874 |
| walmart.ca | 22 |

So for groceries the math has 22 usable prices; liquor has one board per product, so the
3-shop rule almost never fires.

## 5. Jamin's design (2026-09-28, verbatim in RULINGS.md)

Categories, subcategories, sub-subcategories; groups with little price variation stay whole
(apples, oranges), groups with a lot get split further (wine). Priced products predict unpriced
ones, including relationships ("one product is typically this much less than another"). Ranges
start broad and narrow as coverage grows. Every Claude answer a scan produces is saved. Each source
gets its own confidence. Seeding may use his Gemini Pro subscription offline: *"create a long list
of items (important items that affect others) and ask it for the price ranges."*

## 6. My first plan, and why it was flawed

The first plan: seed about 1,171 categories with one Claude question each, never let an LLM
answer narrow a range, cap range width, per-scan Claude for the rest. Jamin: *"this plan is so
flawed figure out why."* Counted from `catalogue/data/catalogue.db` (read-only), Canadian rows:

| Measure | Count |
|---|---|
| Canadian products | 473,773 |
| from Icecat (electronics, office) | 296,300 (63%) |
| from Open Food Facts (grocery) | 121,949 |
| from deposit lists (consignaction 44,862, returnit 8,940) | 53,802 |
| grocery + drinks, all food-type sources | 177,473 |
| with a leaf category | 394,118 |
| distinct leaf categories | 6,452 |
| leaves with 10+ products | 1,171, holding 384,084 |
| no category | 79,655 |
| with a size value | 85,294 (18%); grocery + drinks 82,188 of 177,473 (46%) |
| category x brand groups, grocery + drinks | 41,422 (60,861 rows have no brand) |
| category x brand groups, Icecat | 3,750 |

Top leaf categories: "Biere, boisson a base de malt" 24,856 (a French label from the Quebec
deposit list, not the taxonomy), laptops 17,022, PCs 14,298, toner 11,918, monitors 11,601.

The flaws:
1. Planned for a grocery catalogue; 63% is electronics, priced by model spec, where a category
   range (a laptop from $300 to $5,000) is no answer.
2. Splitting wine "by price tier" is circular: the tier is what is being predicted. Splits must
   use what can be read off the product (brand, type, origin, size, series).
3. "LLM answers never narrow a range" contradicts his priority: with 22 grocery prices, ranges
   would stay broad forever.
4. The categories are not one tree (French deposit labels, 79,655 uncategorised).
5. The product-to-product link needs size; most products have none.
6. Catalogue row counts are not importance; toner and rack parts top the counts.
7. Nothing tested whether an estimate is sane, though 14,297 real liquor prices exist.
8. A per-scan fallback for leftovers, when unlimited offline Gemini can precompute them.

## 7. The improved plan (proposed, not built)

- Two engines. Electronics: priced per model, in batches, consumer categories first. Groceries and
  drinks: Jamin's nested tree, with the key-items list = one common-size product per category x
  brand group (41,422), priced by Gemini, plus per-category size curves and store-brand discounts.
- Split a category where the measured spread of its key items is wide, on readable attributes.
- Fix the tree in the same batches (fold French labels in, categorise the 79,655).
- Source order to start: real shelf or feed price, shopper-typed, Gemini seed, runtime Claude. The
  Gemini weight is now measured (section 8).
- LLM answers narrow ranges down to a floor; only real prices narrow further.
- Open risks, flagged not blocking: Gemini Pro may cap prompts per day despite unlimited tokens;
  its consumer terms may limit building a commercial database from its answers.

## 8. The Gemini liquor test

**How it was generated.** `make_liquor_prompt.py`, seed 20260928, read-only on
`C:/shin/price/data/prices.db`: 100 random `bcldb` and 100 random `anbl` rows with kind
'regular', a price above 0 and a non-blank name, shuffled together and numbered 1 to 200. The
prompt (`liquor_prompt.txt`) gives id, province, barcode (when known) and name, never the price;
it asks for low, typical and high regular shelf price in CAD at that province's liquor store (BC
before tax, NB as listed with tax), answer every line, no web search, CSV only. The real prices
are in `liquor_answer_key.json`. Jamin pasted the prompt into Gemini Pro (consumer app) himself.
NB names carry the size; BC names mostly do not. Rows 51 ("DO NOT USE Twisted Lemonade") and 170
("2011 12") are junk in the source data and excluded: 198 scorable.

**What came back.** Two CSV blocks in one reply: `gemini_run1_partial.csv` (cut off at id 184)
and `gemini_run2.csv` (to id 200). Both skipped the same 46 ids, in runs of 3 to 9 in a row,
despite "answer every line": 20-22, 43-48, 64-72, 88-96, 112-117, 133-141, 176-179.

**Scores** (`score_liquor.py <csv>`; full output in `score-output-run1.txt`,
`score-output-run2.txt`). With about 150 scored, each percentage is roughly plus or minus 8
points.

| Run 2, n = 152 | Real price inside Gemini's range | Typical within 20% | Median typical / real |
|---|---|---|---|
| All | 53% | 61% | 1.00 |
| BC (no size) | 48% | 60% | 0.94 |
| NB (size given) | 58% | 61% | 1.09 |
| Real under $30 | 65% | 66% | 1.07 |
| $30 to $100 | 45% | 60% | 1.03 |
| $100 and up | 39% | 50% | 0.80 |

Run 1 (n = 136): 49% inside range, 61% within 20%. The two runs' typical prices agree closely:
median difference 5%, 102 of 136 within 10%, 7 more than 25% apart (`run-agreement.txt`).

**Width needed** (run 2, real / typical): 10th percentile 0.81, 25th 0.88, 75th 1.19, 90th 1.44.
A range of 0.7x to 1.4x Gemini's typical catches 80%; 0.6x to 1.6x catches 92%; 0.8x to 1.25x
catches 68%. Gemini's own ranges were a median 32% wide.

**Worst misses were size or pack**, not identity: Heineken Silver "CAN" priced as one can
($2.89 to $3.99) against $25.79 real; Rum's Revenge 12 x 50 ml $40 to $60 against $249.99;
Bacardi Superior $23 to $28 against $13.99; El Dorado 3 x 375 ml gift pack $40 to $59 against
$90.99.

**Findings.**
1. Gemini's typical price is unbiased and within 20% for about 3 in 5 products: enough for
   "always give an answer".
2. Its ranges are overconfident. Use its typical; set the width from this measurement.
3. It skips lines silently. Batches of about 50, and a script that checks every id came back and
   re-asks the rest.
4. Size and pack decide the big misses. Send them with every product.
5. Expensive items run low.

**Not tested.** Groceries (22 real prices, too few). Electronics. Whether Gemini searched despite
being told not to.

## 9. Next

- The batch pipeline: 50 per prompt, completeness check, size and pack attached.
- Aurik's yes on the flip; the price data load onto the Mac server.
- Rebuild the range ask on Claude with no web search (currently Gemini, capped to 0 on the Mac
  request).

## Files here

| File | What |
|---|---|
| make_liquor_prompt.py | builds the prompt and the answer key |
| liquor_prompt.txt | the exact prompt given to Gemini |
| liquor_answer_key.json | the 200 rows with real prices |
| gemini_run1_partial.csv, gemini_run2.csv | Gemini's answers, verbatim |
| score_liquor.py | the scorer (argument: the CSV) |
| score-output-run1.txt, score-output-run2.txt, run-agreement.txt | the results |
