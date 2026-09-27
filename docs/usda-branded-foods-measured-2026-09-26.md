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

## Prepare step, run -- 2026-09-26

The prepare step only: `catalogue/src/prepare_rows_usda.py` reads
`branded_food.csv` and `food.csv` (extracted from the zip into
`catalogue/data/usda_branded_csv/FoodData_Central_branded_food_csv_2025-12-18/`)
and writes `catalogue/data/rows-usda.jsonl`, one `PreparedRow` per distinct
canonical barcode. It does not import or run `catalogue/src/load.ts`; nothing
was written to the live catalogue by this step.

**Run it with:**

```
cd catalogue
python3 src/prepare_rows_usda.py
```

(defaults to the paths above; three positional args override branded CSV,
food CSV, and output path). Took a few minutes end to end on the full
1,993,975-row file. Then, to check the output the way this file is checked
below:

```
python3 src/verify_rows_usda.py data/rows-usda.jsonl
```

### Counts, from the OUTPUT file (`wc -l` and a second pass over the JSON),
### not from the script's own loop counters

| Metric | Count |
| --- | --- |
| Lines written | 432,132 |
| Distinct `code` values in the file | 432,132 (zero duplicates) |
| Rows with a non-empty `name` | 432,132 (100%) |
| Rows with a non-null `size_value` | 377,635 (87.4%) |
| Rows skipped, barcode not a usable canonical length (8/12/13/14 digits) | 1,561,843 |
| Rows skipped, no name after picking the best `fdc_id` per barcode | 0 |

The barcode-length skip count is `1,993,975` CSV rows minus `432,132` distinct
canonical barcodes that survive; it is not a separate counted pass over "junk
length" rows the way the measurement doc's histogram is, because this script's
job was dedup-to-one-row-per-barcode, not re-deriving that histogram.

Multiple `fdc_id`s canonicalising to the same barcode are resolved by a fully
ordered rule (has a name, then has a `package_weight`, then most recent
`modified_date`, then highest `fdc_id`): **the fourth key was added after the
first hand-check run found two `fdc_id`s for the Gatorade barcode below tied
on all three of the first keys** (identical `description`, neither had a
`package_weight`, identical `modified_date`), which meant the row actually
written was picked by DuckDB's internal, undocumented order for ties rather
than any rule this file stated. `fdc_id` is USDA's own incrementing surrogate
key, so its highest value is at least a real, reproducible ordering. The
script was rerun after adding it; the distinct-barcode count did not change
(432,132 both times) and only the `with_size` count moved, from 377,351 to
377,635, because a handful of formerly-tied pairs now resolve to whichever
side actually had the size.

**87.4% with a size is lower than the measurement doc's 97.7%, on purpose.**
That 97.7% counted a row as having "a usable size" if `serving_size` and
`serving_size_unit`, OR `household_serving_fulltext`, OR `package_weight` was
present. This script only ever computes `size_value`/`size_unit` from
`package_weight`, because `package_weight` is the only one of those three that
measures the whole package rather than a single serving; using a serving size
as a package size would put a wrong, not missing, number into every
price-per-unit comparison built on it (see the WHY comment in
`parse_package_weight()`). 860,410 of 1,993,975 raw rows (43%) carry a
`package_weight` at all; of the 432,132 rows written here, 377,635 (87.4%)
parsed one, which means the small remainder either had no `package_weight` on
the winning `fdc_id` or had one this parser could not read (a bare count unit
like `EA` or `TABLET`, or free text that does not match `<number><unit>`).

### Ten rows checked by hand against the source CSVs

Picked at random from the output file, then looked up in `branded_food.csv`
by reversing the canonicalisation (matching every `gtin_upc` whose
`canonical_code()` equals the row's `code`) and cross-checked against
`food.csv`'s `description` for the same `fdc_id`. All ten matched: the
`name` is that `fdc_id`'s `description`, `brands` is that `fdc_id`'s
`brand_name` (or `brand_owner` when `brand_name` was blank), and where more
than one `fdc_id` shared the barcode, the one this script kept was the one
the four-key rule above picked.

```
{"code": "0052000102963", "name": "Gatorade Strawberry Lemonade Thirst Quncher 32 Fluid Ounce Bottle.", "brands": "Gatorade", "size_value": null, "size_unit": null, "leaf_category": "Non Alcoholic Beverages  Ready to Drink"}
  -> fdc_id 1458894 (of 4 candidates for this barcode, two with brand_name "Gatorade": 1166892 and 1458894). Both had an identical description, no package_weight, and the same modified_date -- true ties on the first three keys, so the fourth key (highest fdc_id) decided it: 1458894 over 1166892. This is the pair that surfaced the tie in the first place, and is why the fourth key exists (see above). One real finding from checking it: 1166892's branded_food_category contains a genuine UTF-8 en dash ("Non Alcoholic Beverages – Ready to Drink", byte-checked against the raw CSV: \xe2\x80\x93, not a corrupted byte), which this terminal's console codepage rendered as a replacement-character glyph when printed -- a display artifact on this machine, not a data problem, and not present in either the CSV or the JSONL either way this tie resolves. size null is correct either way: neither candidate has a package_weight.

{"code": "0688267032240", "name": "AHOLD, COLA", "brands": "AHOLD", "size_value": 240.0, "size_unit": "ml", "quantity": "8 fl oz/240 mL"}
  -> fdc_id 1877191 (of 5 candidates; two, 1877191 and 1771747, tied on package_weight-present and on modified_date, decided by the fourth key): package_weight "8 fl oz/240 mL", metric segment "240 mL" taken.

{"code": "0099482473778", "name": "CHICKEN ORGANIC BROTH, CHICKEN", "brands": "365 WHOLE FOODS MARKET", "size_value": 5680.0, "size_unit": "ml", "quantity": "1.5 GAL/5.68 L/946 mL"}
  -> fdc_id 2278962 (of 8 candidates, decided by modified_date alone: 2022-03-21, strictly newer than the four other candidates sharing this same package_weight text): metric segment "5.68 L" taken over the first segment "1.5 GAL", both correct.

{"code": "0020601401013", "name": "ORANGE CALCIUM & VITAMIN D PULP FREE 100% PREMIUM JUICE, ORANGE", "brands": "HEINEN'S", "size_value": 1530.0, "size_unit": "ml", "quantity": "52 fl oz/1.6 Quart/1.53 L"}
  -> fdc_id 2468121 (of 8 candidates; three, including 2468121, tied on package_weight-present and modified_date 2021-08-23, decided by the fourth key): package_weight "52 fl oz/1.6 Quart/1.53 L"; metric segment "1.53 L" taken.

{"code": "0035826094100", "name": "100% ORANGE JUICE", "brands": "FOOD LION", "size_value": 3780.0, "size_unit": "ml", "quantity": "128 fl oz/1 GAL/3.78 L"}
  -> fdc_id 2046950 (of 4 candidates): the only one carrying a package_weight, "128 fl oz/1 GAL/3.78 L"; metric segment "3.78 L" taken.

{"code": "0073651162021", "name": "MEDITERRANEAN MIX, GREEK OLIVES...", "brands": "MARIO", "size_value": 200.0, "size_unit": "g", "quantity": "7.05 oz/200 g"}
  -> fdc_id 2116909 (of 4 candidates): the only one with a package_weight, "7.05 oz/200 g"; metric segment "200 g" taken.

{"code": "0041735051448", "name": "WHITE CHEDDAR CHEESE & YOGURT COVERED RAISINS SNACK PACK...", "brands": "PICS", "size_value": 42.0, "size_unit": "g", "quantity": "1.5 oz/42 g"}
  -> fdc_id 2175853 (of 2 candidates): correctly preferred over fdc_id 1835501, which had no package_weight.

{"code": "0757528046804", "name": "MARSHMALLOW WITH CHOCOLATE FLAVORED COATING PALETA PAYASO...", "brands": "RICOLINO", "size_value": 540.0, "size_unit": "g", "quantity": "540 g/45 g"}
  -> fdc_id 2178082 (of 2 candidates, both carrying the same package_weight text; decided by modified_date, 2021-07-13 over 2021-06-26): both segments are metric, so the FIRST one, 540 g (the whole pack; 45 g reads as the per-piece weight of this multi-piece lollipop assortment), was taken.

{"code": "0053600001373", "name": "PROBIOTIC PIA COLADA AND MANGO BLENDED LOWFAT YOGURT", "brands": "LA YOGURT", "size_value": 170.0971, "size_unit": "g", "quantity": "6 oz"}
  -> fdc_id 2530465 (the only candidate; this gtin_upc was stored as "0053600001373", already 13 digits, passed through unchanged): package_weight "6 oz" converted at 28.349523125 g/oz.

{"code": "0853358000969", "name": "TOASTED SESAME BROWN RICE & CHICKPEA CRACKERS", "brands": "HARVEST STONE", "size_value": 100.0, "size_unit": "g", "quantity": "3.54 oz/100 g"}
  -> fdc_id 2640677 (of 4 candidates, decided by modified_date alone: 2023-08-01, strictly newer than 1887060's 2017-07-14, the only other candidate sharing this package_weight text): metric segment "100 g" taken over "3.54 oz".
```

### Distinct-barcode agreement with the measurement lane

**Exact agreement.** This run: 432,132 distinct canonical barcodes. The
measurement section above this one, run earlier the same day by a different
pass over the same release: 432,132. Not "within a few hundred" -- the same
number, which is expected since both passes apply the same `canonicalCode`
rule to the same release and both count distinct results, but it is still
worth stating plainly rather than waved through: two independently written
passes over the same 1,993,975-row file landed on the identical
distinct-barcode count.

### What was NOT done here

This is the prepare step only. `catalogue/data/rows-usda.jsonl` (432,132
lines, gitignored under `catalogue/data/`) exists on disk but was never loaded
-- `load.ts` was not imported, not run, and the live catalogue was not
touched. The queued load unit above is unchanged by this run except that its
raw-material file, `rows-usda.jsonl`, now exists for whichever lane picks it
up.
