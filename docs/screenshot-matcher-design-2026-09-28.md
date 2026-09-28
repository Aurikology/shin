# Store printouts to catalogue barcodes: the matcher design, 2026-09-28

Asked by Jamin 2026-09-28: *"design a system that will actrually be able to take a large amount of
these screenshots and match with our catalogue. This requires many steps, it might include: a pure
text matcher, an automatic checker, and then it could also send a large csv file to gemini asking
for if each product is a correct match etc"*

**Status 2026-09-28: version 1 tested and failed the bar (see "Test results, version 1"); matching is
paused and items are sorted into subcategories instead (see the last section).** Design only.
Nothing here is built into the app. Every number below was measured 2026-09-27/28 on the 29 Walmart
Canada printouts in `data/WalmartScreenShots/` (gitignored, on the Windows PC only).

## What the measurements say, before any design

| Measured | Count |
| --- | --- |
| Printouts (browser "save as PDF" of category pages, links kept) | 29 |
| Distinct products (one per product link in the PDF) | 898 |
| With a name read from the tile | 894 |
| With a price read from the tile (inside the link rectangle; the text layer spells $5.98 as `5$ 98` or `$598`) | 872 |
| Answer key: products whose true UPC was read off walmart.ca's own product page in Chrome | 20 of 20 read, no challenge |
| Same read by `price/src/walmart.ts` `detail()` from a script | blocked on the first page (`Throttled`) |
| True barcode already in `catalogue.db` | **19 of 20** |
| `name-match.ts` as used by `rejoin.ts` (FTS OR, first 20 rows unranked, brand + 0.5 overlap) | right **4 of 9** it answered; "confident" 4 of 7 |
| Same rule with ranked FTS (top 60) and a size-conflict reject | right **7 of 18**; "confident" 2 of 5 |
| Of the 12 wrong picks: right brand and product, wrong size, flavour, variant or country | **10** |
| Of the 12: answer key itself wrong (a spinach tile whose product page is a pickle) | 1 |
| Of the 12: true product not in the catalogue | 1 |
| Canadian food rows with no size at all (`docs/size-fill-2026-09-26.md`) | 96,088 of 122,157 (79%) |

Twenty is a small key: it says the current matcher is far off any usable bar, not what a new one
will score. The three findings the design is built on:

1. **The answer is almost always in the catalogue; the matcher is what fails.** 19 of 20.
2. **The failure is size and variant, not identity.** Natrel "Milk" exists as two rows with no size
   on either; French's Tomato Ketchup as 1 l and 375 mL; Kellogg's Corn Pops as the Canadian 515 g
   box and a US 0.95 oz cup. Text cannot separate two rows that say the same thing.
3. **The printout cuts the title short** ("Family Size," with the 515g gone; "Gluten-Free" with the
   750 ml gone). The store's product page carries the full title, and for Walmart, the barcode itself.

## The pipeline

Six stages. Each writes a file the next reads, so any stage can be re-run alone and measured alone.

### 1. Intake: one row per product tile

- **Input kinds.** (a) Browser PDFs with links kept (what exists now): read with PyMuPDF; one tile =
  one product link rectangle; name, price, "avg price / by weight" flag, badges (Rollback, Flyer)
  are the words inside it; crop the tile image from the page. (b) Plain screenshots (PNG/JPG, no
  links): no text layer and no link, so a vision pass extracts the same fields per tile. That pass
  is the one place a model reads the page; its output is checked by re-reading 20 tiles by hand.
- **Row:** store, capture time, category page, retailer product id (if a link), retailer URL,
  title as printed, price cents, per-weight flag, tile image path, source file and page.
- **Fix the text before matching:** repair mojibake (`Campbell’s®`), strip ®/™/*, split a size
  out of the title (`320g`, `2L`, `12/10 oz` means 12 × 10 oz), note when the title is visibly cut.
- **Dedupe** on retailer product id (the 29 PDFs held 898 ids across 1,112 link hits).

### 2. Barcode first, whenever the store will say it

Matching is the fallback, not the route. Where the retailer states the barcode, read it:

- **Walmart:** the product page's `__NEXT_DATA__` holds `upc`. Read in a real Chrome (20/20 tonight)
  because the script reader is blocked; one browser worker, one tab, ~4 s between pages. Untested
  beyond 20 pages: the first run of 200 is itself the test of whether Chrome keeps passing.
- **Metro:** the product URL ends in the barcode (`docs/catalogue-build-plan-2026-09-26.md`, unit 4).
- **Save-On-Foods:** answers a barcode directly (`docs/price-access-sweep-2026-09-27.md`).

Every barcode read this way is also an **answer-key row** for stages 3 to 5. For a store that never
states a barcode, the answer key comes from buying/scanning or from the same product found at a
store that does.

### 3. Text matcher: produce candidates, never decide

The matcher's job is recall: put the right product in a short list. It is scored by one number,
**"right product is in the top 10"**, on the answer key.

- Query the FTS index ranked (`ORDER BY rank`), brand words required when a brand is known, then
  a second query without the brand for store brands whose catalogue rows carry none (Great Value
  Basmati's right row has `brands` empty and a French name, `Basmati Riz`).
- Brand dictionary built from the catalogue's own `brands` column so the title's leading words can
  be split into brand and product (Great Value, Club House, Yoplait Source).
- Keep the top 10 per tile with features: brand agrees, overlap both directions, size agrees /
  unknown / conflicts, variant words on one side only (organic, lactose free, 0%, gluten free,
  flavour names), `sold_in_canada`, source.

### 4. Automatic checker: rules that reject, and a verdict per tile

Deterministic, no model. Hard rejects: size conflict; a variant word present on one side only;
brand conflict; a US-only row (`sold_in_canada = 0`) when a Canadian row with the same name exists.
Then one of four verdicts per tile:

- **single**: exactly one candidate survives and it has a size that agrees.
- **tie**: several survive and they say the same thing in text (the Natrel case). Text cannot decide.
- **weak**: one survives but its size is unknown.
- **none**: nothing survives.

### 5. Gemini review in bulk

For every **single**, **weak** and **tie**, one CSV row: the printed title, the full product-page
title where stage 2 read one, price, per-weight flag, and each surviving candidate's code, name,
brand, size and image URL. Gemini answers per row: the chosen code, or `none`, or `cannot tell`,
with one line of reason. Output is a CSV back, parsed strictly (a row it skipped or garbled is
`cannot tell`, never a default).

- **Route:** Jamin's Gemini Pro subscription, offline, as RULINGS.md already permits for seeding
  ("I have access to gemini pro and unlimited tokens on it"). This is not a runtime call in the app,
  so the 2026-09-28 "Gemini is not used in this version" ruling does not reach it. It runs as a
  browser worker uploading CSV chunks to gemini.google.com (chunk size found by the first run; start
  at 200 rows). The PC `.env` has no `GEMINI_API_KEY`, so the API route is not available and is not
  needed.
- **Ties need pictures, not words.** For a tie, the only thing that separates the rows is the
  package: the tile crop against each candidate's `image_url`. That goes to Gemini as images, a
  smaller second pass, only for ties.
- **Blind to the answer key.** Gemini never sees which rows are key rows or what stage 4 thought.

### 6. Accept, hold, or leave unmatched

- **Accepted:** stage 4 says single and Gemini picks the same code; or stage 4 says tie/weak and
  Gemini picks one code with a reason naming the size or the package. Written to `observation` as
  `join_method = 'name'`, with the store, capture date and, for per-weight items, the unit price.
- **Everything else gets no barcode, and is still kept as a price.** No barcode is attached, because
  a wrong match is a verdict about a product the shopper is not holding (`sources.ts`'s header). The
  tile is still stored whole and trains category prices and the model (RULINGS.md, "Priced store
  items that match no barcode still train prices"; `docs/price-data-design-2026-09-28.md`).
- **Stale by design:** Walmart's own page says "New deals every Thursday". Each price carries its
  capture date; Rollback and Flyer prices are marked as sale prices.

## How it is judged, set before anything is built

- **Answer key:** 300 products whose barcode was read from the store's own product page (stage 2),
  drawn at random across all categories, plus the 20 already read. Re-read 20 key rows by hand
  first: tonight's key had 1 wrong row in 20, so the key is checked like everything else.
- **Negative controls:** key rows whose true barcode is not in the catalogue (1 of 20 tonight). The
  system passes only if it says `none` for them. A system that never says `none` fails.
- **The bar:** among accepted matches, wrong ones at most 2%, judged by the upper end of the 95%
  interval, not the point estimate. With about 200 accepted key rows that means at most 1 wrong.
- **Reported with it, every run:** coverage (share of tiles accepted), stage 3's top-10 recall,
  and stage 4 alone versus stage 4 plus Gemini on the same key rows, paired, so the Gemini pass
  has to earn its place by more than the noise between runs.
- **Kill line:** if stage 3's top-10 recall is under 80% on the key, stages 4 and 5 cannot fix it;
  fix candidates first. If accepted-wrong stays above 2% after the image pass, text-and-picture
  matching is not good enough for prices, and only stage 2 (barcode-first) writes prices.

## Order to build

1. Stage 1 for PDFs, and stage 2 for Walmart as the answer-key reader (300 pages in Chrome).
2. Stage 3, scored on the key. Stop if recall is under 80%.
3. Stage 4, scored on the key.
4. Stage 5 text CSV, then the image pass for ties, each scored paired against the stage before.
5. Stage 6 writes, only after the bar is met.
6. Stage 1 for plain screenshots, when screenshots without links arrive.

## Test results, version 1, 2026-09-28: the bar is NOT met

Asked by Jamin 2026-09-28: *"test your system"*. Prototype scripts (Python, read-only against
`catalogue/data/catalogue.db`) were built for stages 1, 3, 4 and 5 and run on all 898 products. Tuning
used only the first 20 answer-key products; the pipeline was frozen before any held-out answer was read.

**Held-out answer key:** 300 products drawn at random (seed 20260928) from the 874 not used for tuning.
Walmart showed its bot check after 77 pages read at 3 s apart ("Verify Your Identity"), so 77 are
scored here; the rest are being read at 6 s apart and will serve as the test set for version 2.

| Stage | Result on 77 held-out products |
| --- | --- |
| 1. Intake | 898 products, 894 named, 872 priced. **88 printed names belonged to the neighbouring tile** (a link rectangle overlaps the next tile's text); fixed by taking the full title from the product link. Prices were not checked against the page and may carry the same fault. |
| Catalogue coverage | **21 of 77 (27%) have a barcode that is not in the catalogue at all**: fresh produce and herbs, Walmart's own "Your Fresh Market", imports, a toaster, two loose-produce store codes. No matcher can match these. |
| 3. Shortlist | Right product in the top 10 for **39 of 56 (70%)**. Below the 80% kill line. |
| 4. Checker alone | 4 accepted without review, **1 wrong**. |
| 5. Gemini 3.1 Pro (extended thinking), 300 rows in 6 chunks via the Gemini app | Picked a letter 21 times: **15 right, 6 wrong**. Said NONE 41 times (10 of them when the right product was in its list), UNSURE 15 times. |
| 6. Accept rule | **21 accepted, 6 wrong. 95% range of the wrong rate 13.8% to 50.0%.** Bar: upper end at most 2%. Two of the 21 not-in-catalogue products still got a match. |

**Why the shortlist missed (17 of 56):** 6 true rows carry only a French name ("Graines de sésame",
"Gingembte moulu", "Pomme de terre tranchees"); 6 brand spellings differ from the title ("Hunts",
"Sun Chips", "Kraft Canada", "Nestlé" for Nesquik, "General Mills" for Cinnamon Toast Crunch, "QUIRKER");
3 lists were filled by junk rows named just "Great value" or ten rows named "Heinz"; 1 size stored as
"250" with no unit; 1 other.

**The six wrong accepts, read one by one:** a Great Value hazelnut spread whose true row is named in
French; Tilda basmati picked at 240 g where the true row is 250 g; Great Value coconut oil whose true row
is named just "Great Value"; Great Value crushed chili whose true row has no brand. Two more look like
the same product under a second barcode (Your Fresh Market mini yellow potatoes 680 g, Yupik organic
French lentils): Walmart's page carries a barcode the catalogue lacks, while the catalogue holds a row
with the same brand, name and size. That is unverified from here; even counting both as right, 4 of 21
wrong is far above the bar.

**What this says, per the design's own kill line:** text matching plus a text-only Gemini review is not
good enough to attach prices by name, on this catalogue, today. The two largest causes are in the
catalogue, not the matcher: French-only names and junk names on store-brand rows, and a quarter of
Walmart's grocery products missing entirely. Until version 2 meets the bar on fresh products, only
stage 2 (barcode read from the store's own page) attaches prices; everything else is kept as unmatched
price data, per the stage 6 ruling above.

**Version 2, to be tested on the products the first run did not reach:** search `name_fr` and the
semantic index as well as `name`; match brands loosely (apostrophes, "Canada" suffixes, owner names);
drop rows whose name is only the brand; collapse identical rows before the top 10; the image pass for
ties; and Gemini told that a size missing on one side is not agreement.

## Sorting into subcategories instead of matching, measured 2026-09-28

Jamin 2026-09-28: *"another possibility: for now we don't match at all, we sort all of the items in
the subcatagoeis that it belongs in and it helps to imporve the layered statistcal system"*. This is
what "Priced store items that match no barcode still train prices" (RULINGS.md) needs, and it does not
need the exact barcode, only the category. Measured on the same held-out key, version 1 shortlist, no
tuning:

| Measured | Result |
| --- | --- |
| Key products whose true barcode is in the catalogue with a category | 47 of 81 (the other 34 are not in the catalogue, or their row has no category) |
| Top shortlist candidate's leaf category equals the true product's leaf | **27 of 47 (57%)** |
| Vote of the top 5 candidates' leaves | 27 of 47 (57%) |
| Same leaf or the parent one step up (what `price/src/range.ts` reads: leaf, then parent, never grandparent) | **31 of 47 (66%)** |
| Baseline to beat: the most common leaf on the same printout page | 8 of 47 (17%) |
| Tiles with a size readable from the printed title or the link | **351 of 898 (39%)**; produce sold by weight shows a per-100 g price on the tile, not yet counted |

What this says:

- **Sorting is far easier than matching**: a crude shortlist gets the category right three times as
  often as the lazy baseline, including for products whose exact barcode it gets wrong. Most category
  misses are the top candidate having no category at all (skip to the next categorised one), or two
  vocabularies in the catalogue for one thing (`en:crisps` from Open Food Facts against "Chips,
  Pretzels & Snacks" from USDA).
- **Size is the harder limit.** `range.ts` compares unit prices scaled to the product's size and
  drops a price with no size (`no_size`). 61% of tiles carry no readable size, so their price cannot
  enter a category range as it stands. A size guessed by a model would be a fabricated unit price;
  the size must come from the page (Walmart's product page carries it and a unit price, behind the
  same bot check) or stay unknown.
- **Next test, same key:** Gemini assigns each tile a leaf from the catalogue's own leaf list,
  scored against the true product's leaf, paired against the shortlist vote above; pass mark set
  before it runs.
