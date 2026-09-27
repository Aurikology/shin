# USDA Branded Foods, measured -- 2026-09-26

Unit 12 of `docs/catalogue-build-plan-2026-09-26.md`, USDA slice only. The other three
sources named in that unit (Open Library, MusicBrainz, Discogs) stay `parked` and were
not touched here.

**Release taken:** FoodData Central, Branded Foods, full CSV download,
`https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_csv_2025-12-18.zip`,
dated 2025-12-18 on USDA's own download page (`fdc.nal.usda.gov/download-datasets/`),
confirmed by a HEAD request the same day: 447,249,518 bytes, server `Last-Modified`
2026-01-21. This is the current release as of 2026-09-26; USDA republishes this file
periodically and does not date-stamp the bytes themselves, only the file name and the
download page, so a later session re-measuring this must re-check that page rather than
assume this URL is still current.

Every count below was produced by enumerating the whole file, not sampling it: both
`branded_food.csv` (1,993,975 data rows) and `food.csv` (1,993,975 data rows, joined
1:1 on `fdc_id`) were streamed in full through a quoted-field CSV reader. Every barcode
was passed through `canonicalCode` (`catalogue/src/barcode.ts`) before being looked up
against `product.code` in the live catalogue, opened with `openCatalogueReadOnly`
(`catalogue/src/schema.ts`) and `PRAGMA busy_timeout = 120000`, no writes made.

**Negative control:** 20 barcodes pulled from our own catalogue (spread across the
first 5,000 rows by rowid) were looked up the same way, through the same prepared
statement, before the USDA barcodes were run. 20 of 20 were found. The lookup can find
a hit; a zero from it would mean the data is new, not that the lookup is broken.

## The table

| Metric | Count |
| --- | --- |
| Release | Branded Foods CSV, 2025-12-18, `fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_csv_2025-12-18.zip` |
| Rows downloaded (`branded_food.csv` data rows) | 1,993,975 |
| Rows with a non-empty `gtinUpc` field | 1,993,975 (none blank) |
| Rows with a usable barcode length (8, 12, 13 or 14 digits after trim) | 1,948,474 |
| Rows junk (non-numeric, or a digit length no scanner produces) | 45,501 |
| Unique canonical barcodes among the usable rows (after `canonicalCode`) | 432,132 |
| Of those, already in our catalogue | 2,261 |
| Of those, **new to us** | **429,871** |
| Of the new ones, carrying both a usable name and a usable size | 419,891 (97.7% of new) |

Length histogram, every usable-length and junk-length bucket, no bucket folded away:

| Digits | Rows |
| --- | --- |
| 6 | 13 |
| 7 | 38 |
| 8 | 9,310 |
| 9 | 10 |
| 10 | 334 |
| 11 | 44,986 |
| 12 | 1,722,305 |
| 13 | 60,034 |
| 14 | 156,825 |
| 15 | 2 |
| 16 | 1 |
| non-numeric | 117 |

The gap between 1,948,474 usable-length rows and 432,132 unique canonical barcodes is
USDA's own history: the same GTIN reappears under many `fdc_id`s as the product's
listing was revised over the years. The overlap and new-row counts above are barcode
counts, not row counts, because that is what a catalogue upsert keys on.

A "usable name" means `food.csv`'s `description` field is non-empty; a "usable size"
means `serving_size` and `serving_size_unit` are both present, or
`household_serving_fulltext` is present, or `package_weight` is present. The 9,980 new
rows failing that (2.3%) are mostly missing size only, not name; a sampled ten showed
real product names (e.g. "GWALTNEY, CHICKEN HOT DOGS, ORIGINAL", "BACK TO NATURE,
MACARONI & CHEESE") with no parseable size field at all.

## Does it clear the plan's bar

**Yes, by roughly 86 times.** The falsifier kills the source under 5,000 new barcodes;
this measured 429,871, all counted by direct lookup with a passing negative control.

## What a load would cost -- estimate, labelled as one

Not measured, not built. A rough figure: parsing 429,871 new rows into `product` rows
(name from `food.csv.description`, size parsed from the same three fields checked
above, brand from `brand_owner`/`brand_name`, category from `branded_food_category`
mapped into our path shape, `sold_in_canada = 0` since this is a US database) is the
same shape of work as unit 15 (ANBL, 6,731 rows), just two orders of magnitude bigger.
That unit's own parse-and-load pass ran in minutes; a naive scale-up puts a load-and-
upsert pass at low tens of minutes plus whatever the FTS and category rebuild add on
432,132 new rows, not a multi-hour job, but this is an estimate from one much smaller
unit's shape, not a timed run of this loader.

## What is NOT in this file that our rows need

- **No Canadian rows.** `market_country` in `branded_food.csv` is overwhelmingly
  "United States"; this is a US federal database. Every row would load with
  `sold_in_canada = 0`, which is correct but means this source cannot fill the gap
  the plan keeps returning to (Canadian barcode coverage). It is a US-catalogue
  breadth source, not a Canadian one.
- **No French name.** `name_fr` has nothing to come from; `description` is English
  only, so cross-language retrieval gets nothing from this source (`name_derived`
  would have to carry the whole load, same as other English-only sources already
  in the catalogue).
- **No structured size for 2.3% of new rows** (see above) -- `size_value`/`size_unit`
  would be NULL on those until parsed from the freeform description text, if at all.
- **No image, no allergens tags, no Nutri-Score/NOVA/additives fields** in this
  download; those are `food_nutrient.csv` / other FDC endpoints this file does not
  carry, and OFF-style quality fields are simply absent from FDC's schema.
- **No price.** Same as every other catalogue source; not specific to USDA.

## Queued load unit (plan shape, not built)

| Field | |
| --- | --- |
| **State** | `queued` |
| **Owner** | Jamin |
| **Writes** | New `product` rows at `source = 'usda'`, `sold_in_canada = 0` |
| **What** | Load the 429,871 USDA Branded Foods barcodes measured above and not already in our catalogue, canonicalising every barcode with `canonicalCode` before upsert (the exact bug that cost the 2026-09-26 dedupe pass) and skipping the 2,261 barcodes already present. |
| **Numbers** | 429,871 new barcodes projected, of which 419,891 (97.7%) carry both a name and a size and 9,980 carry a name with no parseable size. |
| **Acceptance test** | The catalogue's distinct-barcode count rises by at least 425,000. A sample of 20 newly-loaded USDA barcodes, read back by `code`, matches `food.csv`'s `description` and `branded_food.csv`'s `gtin_upc` for the same `fdc_id`, by hand. Zero rows with `sold_in_canada = 1` from this source (this file has none to claim). |
| **Falsifier** | Fewer than 400,000 new rows land, which means the canonicalisation or the dedupe-against-catalogue step silently dropped rows rather than the source being smaller than measured here. |
| **Reopens on** | USDA republishes Branded Foods with a materially different row count (the dataset is refreshed periodically; re-check `fdc.nal.usda.gov/download-datasets/` for the current file before reusing this URL). |
