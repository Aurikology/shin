# Did tonight's duplicate-spelling cleanup change an answer, unit 14

**Answer: for a shopper it changed nothing at query time, because a pre-existing
app-side guard was already hiding the duplicate; the cleanup removed the hidden
1,375,443 redundant rows that guard was masking, and it did not delete, lose a
field on, or worsen the name of any of the 200 collapsed products sampled here.**

Scope: read-only. Both databases were opened with `openCatalogueReadOnly` from
`catalogue/src/schema.ts`, `PRAGMA busy_timeout = 120000` was set on each
connection, and only `schema.ts`, `search.ts` and `barcode.ts` were imported.
`load.ts` was never imported. Neither database file was written.

- BEFORE: `catalogue/data/catalogue.db.before-dedupe` (5,182,591 products, 1,375,443 twelve-digit rows)
- AFTER: `catalogue/data/catalogue.db` (3,852,199 products, 0 twelve-digit rows)

**Caveat that applies to every number below**: these two files differ by the
dedupe AND by one 45,051-row Quebec load. A product or a candidate that
appears in AFTER but not in BEFORE is not necessarily the dedupe's doing.

The measurement script was written to `catalogue/src/_measure_dedupe.ts`,
run with `node _measure_dedupe.ts` (Node 24, native TypeScript), and deleted
after use; it is not part of this commit. A second scratch file,
`_diag2.ts`, spot-checked one specific documented pair and was also deleted.

---

## Measurement 1: does text search show the same product twice

**Method.** `app/server.ts`'s own attach logic (`attachCatalogue`, around line
289-320) sets `vectorsOn = false` whenever the embedded-row count is over
90,000, which this catalogue is by roughly 40x, so the live app's real search
path is `Catalogue.search({ text, limit: 5, vectors: false })` -- confirmed by
reading `app/server.ts` line 3024 (`limit` default 5) and the `attachCatalogue`
function. That is the exact call used here, against a `Catalogue` built with
`openCatalogueReadOnly` and a stub embedder whose `embedQuery`/`embedPassages`
throw (never called, because `vectors:false` short-circuits the vector arm at
`search.ts` line ~1300).

**Queries.** 25 real product names read out of the BEFORE table's own
duplicated pairs (`SELECT DISTINCT p.name FROM product p JOIN product q ON
q.code = substr(p.code,2) WHERE length(p.code)=13 AND p.code LIKE '0%'`,
spread across the whole result set, not just its head), plus 5 everyday
queries: `coca cola`, `peanut butter`, `tylenol`, `milk`, `cheerios`.

Pair-derived queries used: Caramel au beurre; Symmetra LX module; RS160-E4/PA4;
SPP7346WB/17; ID9651B/37; K52F-EX699V; p7-1030be; 7000059522; 16GB DDR3-1600MHz
ECC; 340831116; PFI-207 MBK; HyperX FURY Pro Gaming Mouse Pad (extra large);
FC8516/81; E5-553-T5K4; IDSLCMS-I2561P-584; NVIDIA RTX PRO 2000 Blackwell;
MGAA4AM/A; 7000005818; Playstation 4 Slim 500GB + PS Live Card;
UN45H-VM338M; Recycled Series 15.6-inch Backpack; 046677548872; Busy Activity
Hive; VX3276-MHD-3; 046677563912.

**Duplicate test.** For each query, on each database, the returned candidates'
`code` fields were normalised by stripping leading zeros, grouped, and any
group with more than one member counted as duplicate answers.

**Result, via the real search path:**

| | queries with a duplicate in the answer |
|---|---|
| BEFORE (5,182,591 rows, 1,375,443 dup rows) | **0 of 30** |
| AFTER (3,852,199 rows, 0 dup rows) | **0 of 30** |

Worst case in either file: 0 repeated results, for every query tried. No
answer visibly changed from a shopper's seat, because none showed a duplicate
either before or after.

**Negative control, and the actual finding.** A duplicate detector that finds
nothing on both sides is unproven, so the same 25 pair-derived queries were
run again as a raw FTS probe (`SELECT p.code FROM product_fts f JOIN product p
... WHERE product_fts MATCH ?`), reproducing `search.ts`'s own `ftsTokens` /
`joinFts` token construction exactly, but bypassing the ranking and
`dedupeListings()` step that the real `.search()` call applies afterward. That
raw probe found the normalized-barcode duplicate sitting at the very top of
the match list in **24 of the 25** pair-derived queries in the BEFORE file
(e.g. "Symmetra LX module" returns codes `0731304233855` and `731304233855`
tied for rank 1). The detector works; the data really was duplicated at the
row level. The one miss, "Caramel au beurre", is the one documented
name-disagreeing pair in `dedupe-barcode-spellings.ts` (barcode
`0045496590161`): its 12-digit twin was a food label's text on an electronics
barcode and never shared a word with the 13-digit row, so no textual collision
was ever possible for that pair regardless of row count.

So the reason 0 duplicates ever reach a shopper, before or after tonight: read
`search.ts` lines 722-740, `dedupeListings()`. It already collapses candidates
by `code.replace(/\D/g,'').replace(/^0+/,'')` -- the identical normalization
this measurement uses -- and by a `brand|name|size` listing key, before
`.search()` returns anything. That function ran on every search before
tonight's cleanup too. **Tonight's row-level delete did not fix a visible
duplicate; it deleted the 1,375,443 redundant rows that `dedupeListings()` was
already hiding from the answer, one search at a time, at query cost.**

**Composition still moved.** 8 of the 30 queries returned a different set or
order of candidates before vs. after (Caramel au beurre, RS160-E4/PA4,
E5-553-T5K4, Playstation 4 Slim 500GB + PS Live Card, Recycled Series
15.6-inch Backpack, Busy Activity Hive, coca cola, milk). None of the before
or after lists contained a duplicate in either version. The Quebec load is the
likely source of some new codes (e.g. "coca cola" AFTER includes
`5449000000996`, not present in BEFORE's top 5) -- per the caveat above, that
addition is not attributable to the dedupe.

---

## Measurement 2: did a barcode's answer survive

**Sample.** 200 pairs chosen with `ORDER BY RANDOM() LIMIT 200` from
`FROM product p JOIN product q ON q.code = substr(p.code,2) WHERE
length(p.code)=13 AND p.code LIKE '0%' AND length(q.code)=12` in the BEFORE
file (the exact join `dedupe-barcode-spellings.ts` uses to define a pair).

**Lookup.** `Catalogue.byGtin()` in the AFTER file, once with the 13-digit
spelling and once with the bare 12-digit spelling.

**Result: 200 of 200 answered under both spellings. 0 answered under
neither.** No barcode was lost.

**A caveat on what that number means.** `byGtin` (search.ts ~998-1036) builds
a set of candidate spellings from whatever it is handed -- the normalized
form, the form zero-padded to 13, and the form with leading zeros stripped --
and tries all of them. So `byGtin('0068...')` and `byGtin('68...')` query the
*same* underlying set of row spellings; they are not an independent test of
two different lookups; and any dedupe-generated `code = ?` query works either
way. It is still the honest measurement, though, because it is the real
lookup path the app uses (`app/server.ts`'s `fastLookup`), and it still
returns null for a barcode that is truly gone -- which is the failure this
measurement exists to catch, and did not find.

To also show the raw, unnormalised fact, a plain `code = ?` lookup (no
fallback forms) was run against the same 200 in AFTER: **200 of 200 matched
exactly on the 13-digit spelling, 0 of 200 matched exactly on the bare
12-digit spelling.** That is exactly the expected shape after a cleanup that
canonicalises every pair onto its 13-digit form: the row is not lost, it now
exists under one spelling, and the app's own normalization in `byGtin` is
what makes either spelling still answer for a user or an upstream feed.

---

## Measurement 3: did an answer get worse

**Method.** For the same 200 collapsed pairs, the survivor's raw row was read
directly from AFTER by `code = ?` (not through `Catalogue`/`Candidate`,
because `search.ts`'s `SELECT_COLS`, the columns `byGtin` actually returns,
omits `image_url` entirely -- verified by reading the constant at
`search.ts` line 564; a `Candidate` can never carry an image URL today,
dedupe or no dedupe). Nine fields were compared against BOTH original BEFORE
rows: `name_en`, `name_fr`, `brands`, `quantity`, `size_value`, `size_unit`,
`leaf_category`, `image_url`, `ingredients_text`.

**Result: 0 of 200 survivors lost a field that either original row had.
0 worse-name cases** (every survivor's `name` matched one of its two
original rows' names, including the one hand-corrected pair below).

**Spot check of the one hand-corrected pair.** Barcode `0045496590161` did
not land in the random 200, so it was checked directly, since
`dedupe-barcode-spellings.ts` documents it by name as the one pair fixed by
hand rather than by the general rule (a food database's "Caramel au beurre"
sitting on a Nintendo barcode against the electronics database's real "Switch
Pro Controller"):

| | code | name | brands | source |
|---|---|---|---|---|
| BEFORE 13-digit (kept by the rule) | 0045496590161 | Caramel au beurre | null | openfoodfacts |
| BEFORE 12-digit (deleted by the rule) | 045496590161 | Switch Pro Controller | Nintendo | icecat |
| AFTER (surviving row) | 0045496590161 | **Switch Pro Controller** | **Nintendo** | **icecat** |

The hand fix worked exactly as documented: the surviving row carries the
correct name, brand and source, not the food label's.

**A gap the sample cannot rule out.** `dedupe-barcode-spellings.ts`'s `RESCUE`
list (the fields copied from a dying row onto its survivor before deletion)
is `name_en, name_fr, brands, quantity, leaf_category, image_url,
ingredients_text` -- seven fields. It does **not** include `size_value` or
`size_unit`, the *parsed* size, only `quantity`, the display string. If a
dying row had ever carried a parsed size the surviving row lacked, that value
would not have been rescued by this code path. The dedupe script's own
dry-run only ever counted rescues for its own seven-field list (and reported
6 total instances across all 1,375,443 pairs: 1 `name_en`, 1 `brands`, 2
`leaf_category`, 2 `image_url` -- read from its file header comment, not
re-derived here), so this specific `size_value`/`size_unit` combination was
never counted globally by anything, including this measurement's 200-row
sample, which found zero cases but is 0.015% of the population. That
combination is **unknown**, not clean, until someone widens the check.

---

## Summary

| Measurement | Before | After | Changed a user-visible answer? |
|---|---|---|---|
| 1. Text search duplicate | 0 / 30 queries | 0 / 30 queries | No -- `dedupeListings()` already hid it |
| 2. Barcode still answers | -- | 200 / 200 (0 lost) | No barcode deleted |
| 3. Field or name got worse | -- | 0 / 200 | No loss found in sample; size_value/size_unit rescue is an unmeasured gap |

The cleanup was a row-count fix, not an answer fix, for every case this
measurement could exercise: nothing a shopper searches for or scans changed
what came back. What it removed was 1,375,443 rows a search-layer guard was
already filtering out one query at a time, and the risk it carried (deleting
instead of collapsing) did not materialise in the 200-pair sample checked
here.

---

## Follow-up, same night: the unmeasured gap, measured on all 1,375,443 pairs

The "unknown" flagged above (`size_value`/`size_unit` not in the rescue
step's field list) was measured directly, over the full population rather
than a sample, using `PRAGMA table_info(product)` on both files (read-only,
same rule as above) to enumerate every column and diff it against what
`dedupe-barcode-spellings.ts`'s `RESCUE` constant actually copied.

**Columns already rescued** (name_en, name_fr, brands, quantity,
leaf_category, image_url, ingredients_text): counted again from scratch
against the backup, this reproduced the file's own documented totals exactly
-- name_en 1, brands 1, leaf_category 2, image_url 2, name_fr 0, quantity 0,
ingredients_text 0 -- confirming the counting method matches the script's own
math.

**Columns never rescued, counted over all 1,375,443 pairs:** size_value 0,
size_unit 0, category_source 0, generic_name 0, nutriscore_grade 0,
nova_group 0, additives_n 0, allergens 0 -- and **category_path: 2**. Two
`name_derived`/`derived_source` are not counted: those columns did not exist
in the 2026-09-13 backup, so there is nothing to diff.

`size_value`/`size_unit` are genuinely clean, not merely unsampled: zero
pairs, out of all 1,375,443, ever disagreed. The one real gap is
`category_path`, a NOT NULL column whose schema default `'[]'` stands in for
"no data" (schema.ts's own words), so a plain `IS NULL` test -- which is what
every other check here and in the original script uses -- never catches it.

**Confirmed against the live file**, not inferred: both barcodes' `category_path`
is `[]` there today, even though `leaf_category` (which the original rule did
rescue) is correct on both:

| barcode | leaf_category (live) | category_path (live) | category_path the dying row had |
|---|---|---|---|
| 0045496590161 | en:gaming-controllers | `[]` | `["en:entertainment-hobby","en:video-games-consoles","en:gaming-controllers"]` |
| 0023942947769 | en:blank-cds | `[]` | `["en:computers-peripherals","en:data-storage","en:data-storage-mediums","en:blank-cds"]` |

Consequence: `rebuildCategories()` (`schema.ts`) populates `product_category`
-- what the neighbour ring reads -- from `category_path`, not from
`leaf_category`. Both products show the right category label but belong to
no ring: "other gaming controllers" and "other blank CDs" can never surface
either one, and neither can ever be found as a member of its own category
walk. This is the answer that changed, and it is two barcodes, not zero.

**Root cause and repair**, in two pieces:

1. `catalogue/src/dedupe-barcode-spellings.ts`: `RESCUE` was a seven-column
   list typed by hand. It is now `rescueColumns(db)`, derived at run time from
   `PRAGMA table_info(product)` (every non-key, nullable column), so a future
   column addition is rescued or excluded by the same rule that already
   governs `name`/`category_path`/`allergens`/`sold_in_canada`/`source`
   (NOT NULL, the survivor's own identity/classification, never overwritten)
   rather than by whoever last edited a hand-written array. Lines touched:
   the `RESCUE` constant became a `rescueColumns()` function (was line 81,
   now the block above `open()`), and one call site,
   `const RESCUE = rescueColumns(ro);`, added right after `const ro =
   open(true);` in `main()`. Nothing else in the file moved; the 8/13-digit
   work another session has open in this same file was not touched. This
   fix is scoped to nullable columns only, per the brief ("every column that
   can be null") -- it does not add sentinel handling for `category_path`/
   `allergens` to this shared file, since that is a different kind of check
   (emptiness, not nullness) and a bigger, riskier edit to make mid-edit by
   someone else.
2. `catalogue/src/repair-dedupe-rescue.ts` (new): reads the same 1.37M pairs
   out of the backup and fills any live 13-digit survivor's empty column from
   the dying 12-digit row's value, for every nullable column both schemas
   share plus `category_path`/`allergens` as a separate sentinel-aware pass.
   Guarded so a live value that is already present is never touched. Dry run
   by default; `--apply` is behind an explicit flag and was **not run** in
   this session -- the dry run against the live file confirms exactly 2 cells
   would change, both `category_path`, matching the count above, and 0 for
   every already-rescued column (confirming the original apply already fixed
   those correctly).

Scope note: everything in this follow-up, including the dry run of
`repair-dedupe-rescue.ts`, was read-only against both database files. No
`--apply` was run on anything.
