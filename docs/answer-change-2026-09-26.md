# Unit 14: did the loads change an answer, counted both ways

Every other acceptance test in `docs/catalogue-build-plan-2026-09-26.md` counts rows loaded.
This is the one that asks the app's real question -- `Catalogue.byGtin` in
`catalogue/src/search.ts`, exactly the call a barcode scan makes, tries the padded/stripped/UPC-E
forms the app tries -- against the catalogue as it stood the night before tonight's loads
(`catalogue/data/catalogue.db.before-dedupe.2026-09-14`) and against it live
(`catalogue/data/catalogue.db`). Nothing was written to any database to produce this. The
re-runnable measurement is `catalogue/src/answer-change-2026-09-26.ts`.

## Why the held set is not real user scans

Unit 14 as written wants a held set built from real scans. It cannot be met that way tonight:
`app/data/scans.db` holds **3 distinct barcodes, counted, and all 3 already resolve**, and the
miss log (`catalogue/data/gaps.db`) has **94 text misses and 0 barcode misses, counted**.
There is no demand-weighted set to hold out of that. Inventing one would be worse than not having
one, so this reports two things instead: what the loads themselves made scannable (partly
circular by construction, said plainly below), and an independent set nobody built for this test.

## Controls (decided before looking)

Four checks, two barcodes against two databases. All four came back as expected, so the
measurement below is trusted. Had any one of the four gone the other way, this document would say
so instead of reporting numbers.

| Barcode | Expected | Before | After | Held? |
| --- | --- | --- | --- | --- |
| `0068100084245` | resolves in BOTH | true | true | yes |
| `0000000000093` | resolves in NEITHER | false | false | yes |

## Set 1: what the loads made scannable

Each new source's own barcodes, asked of both databases. **A rise here is partly by construction**
-- these are exactly the barcodes the loads carried in, so of course more of them resolve after.
This set cannot by itself say the work mattered to anyone; set 2 below is the honest half.

| Source | Population (distinct codes) | Asked | Sampling | Before hits | Before rate | After hits | After rate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| consignaction (Quebec) | 50,166 | 50,166 | full population, enumerated | 5,325 | 10.6% | 50,166 | 100.0% |
| returnit (BC) | 18,631 | 18,631 | full population, enumerated | 4,587 | 24.6% | 18,593 | 99.8% |
| usda (branded foods) | 432,132 | 20,000 | RANDOM sample, n=20,000 of 432,132, seed fixed for reproducibility | 54 | 0.3% | 20,000 | 100.0% |

usda's after-rate lands at essentially 100% because the sample is drawn from the exact rows the
load carried; at a sample proportion this close to 1 the normal-approximation margin of error is
degenerate (computes to ~0), which is a known limit of that formula near the extremes, not a claim
of certainty. What the sample size buys is confidence in the population-level rate this
represents (20,000 of 432,132, about 4.6%), not confidence about any single barcode. returnit's
99.8% (not 100%) is real: 38 of its 18,631 barcodes do not resolve after tonight's loads --
consistent with tonight's dedupe folding or renaming some of them under a different code than the
one the row file carries, which is exactly the kind of thing this unit exists to surface, not
paper over.

## Set 2: the price store's own barcodes -- the independent, honest half

`price/data/prices.db`, table `observation`, sellers `bcldb` (BC liquor) and `anbl` (NB liquor),
found via how `app/src/own-prices.ts` opens and queries this file. These barcodes were put there
by the price lanes, not chosen to make this number move -- the one set here that was not selected
for this test. A barcode's value lives in either `code` (padded) or `page_gtin` (the seller's raw,
often unpadded claim); both are read and folded to one canonical key so a bcldb row that carries
both spellings of the same barcode is not double-counted as two barcodes.

| Set | Rows in price store | Distinct barcodes | Before hits | Before rate | After hits | After rate |
| --- | --- | --- | --- | --- | --- | --- |
| bcldb + anbl | 14,297 | 13,537 | 344 | 2.5% | 862 | 6.4% |

**Falsifier, decided before looking:** the independent set's hit rate rose (2.5% to 6.4%). **The
falsifier did not fire.** Had it not risen, that would have been the result, reported as the
result, unsoftened -- it did rise, so it is reported as risen.

## Set 3: for barcodes that resolve both before and after, did the answer get better?

Of the 344 price-store barcodes that resolved in *both* databases, whether the row now carries a
size, a category, a leaf brand it did not carry before. A barcode that resolved before and now
resolves with a size is a changed answer, not just a present one.

| Field | Denominator (resolves both) | Before count | Before rate | After count | After rate | Gained (missing -> present) | Lost (present -> missing) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| size | 344 | 49 | 14.2% | 155 | 45.1% | 106 | 0 |
| category | 344 | 98 | 28.5% | 186 | 54.1% | 88 | 0 |
| brand | 344 | 118 | 34.3% | 171 | 49.7% | 53 | 0 |

Every field improved and nothing regressed (0 lost on all three). This is the tonight's size and
category fills and the second-witness loader fix showing up where a user would actually see them:
not just "more barcodes hit," but the same barcode's answer carrying more of what a shopper looks
at, for products the catalogue loads did not put there.

## What is still unknown

**The demand-weighted question -- do these loads help barcodes people actually scan -- is
unanswered tonight**, because there is no sample of real scans large enough to ask it: 3 distinct
scanned barcodes, all already resolving. That is not evidence the loads help real demand; it is
evidence there is no sample yet.

**How this gets found, over time, without fabricating anything:** `catalogue/src/gaps-from-scans.ts`
is the offline pass built for exactly this. It reads `app/data/scans.db`'s scan log (every barcode
a real scan hit, kept separate from the request path -- the server itself never checks the
catalogue during a live scan, by his rule), looks up each distinct scanned barcode against the
catalogue once, and records which ones the catalogue does not hold into the miss log
(`catalogue/data/gaps.db`) -- watermarked, safe to re-run, writes nothing on a dry run. As real
scanning volume accumulates, re-running it (`node src/gaps-from-scans.ts --apply` from
`catalogue/`) grows the miss log into the demand-weighted held set unit 14 wants, built from what
people actually typed and scanned rather than from what happened to be downloadable. Until that
log has enough real misses in it, any "does this matter to users" number is unmeasured, not zero
and not assumed positive.
