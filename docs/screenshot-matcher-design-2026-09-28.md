# Store printouts to catalogue barcodes: the matcher design, 2026-09-28

Asked by Jamin 2026-09-28: *"design a system that will actrually be able to take a large amount of
these screenshots and match with our catalogue. This requires many steps, it might include: a pure
text matcher, an automatic checker, and then it could also send a large csv file to gemini asking
for if each product is a correct match etc"*

Design only. Nothing here is built. Every number below was measured 2026-09-27/28 on the 29 Walmart
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
- **Everything else is unmatched**, and stays unmatched: no price attached. `sources.ts`'s header is
  the reason: a wrong match is a verdict about a product the shopper is not holding.
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
