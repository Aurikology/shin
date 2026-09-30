# Screenshot matcher, version 1 test (2026-09-28)

The prototype behind "Test results, version 1" in `docs/screenshot-matcher-design-2026-09-28.md`.
Python 3 with PyMuPDF; reads `data/WalmartScreenShots/*.pdf` and `catalogue/data/catalogue.db`
read-only. Every script reads and writes files in this folder.

1. `OUT=walmart-rows.json python extract.py`: stage 1, one row per product link in the PDFs.
2. `python pipeline.py [sku ...]`: stages 3 and 4, writes `stage3.json` and `stage4.json`.
3. `python make_review.py`: stage 5 input, six 50-row sheets for Gemini (example: `gemini-chunk-example.txt`);
   Gemini's replies are in `gemini-answers/`, with `letters.json` mapping each letter back to a barcode.
4. `python evaluate.py truth.json`: scores stages 3 and 4 on the 20 tuning products.
5. `python score_all.py`: scores every stage on the held-out key `key-truth.jsonl` (barcodes read
   from walmart.ca product pages in Chrome; the product list is `key-urls.txt`).

All paths (`data/WalmartScreenShots`, `catalogue/data/catalogue.db`) are read from `WALMART_PDFS`
/ `CATALOGUE_DB` environment variables, defaulting to `C:\dev\shin-main\...` (the repo moved off
`C:\shin`, which no longer exists, some time after this folder's scripts were written).

## Unit D1, 2026-09-28: sorting each item into a Shin category on its own

`sort_categories.py` implements build-plan unit D1 (`docs/price-system-build-plan-2026-09-28.md`):
skip candidates with no category, merge the catalogue's split vocabularies, search `name_fr`,
match brands loosely, drop brand-only rows, collapse duplicates, and vote. Run order:
`OUT=walmart-rows.json python extract.py`, `python pipeline.py` (writes `stage3.json`, used only
for the page-majority baseline), then `python sort_categories.py` (writes `category.json` and
`category-reread-50.csv`, prints the scoring below to stdout).

**No tuning on the held-out key.** The only free parameter, `k` (how many categorised candidates
enter the vote), was chosen against `truth.json` alone (10 of 14 scorable tuning products right at
k=3; k=5/8 scored 9, k=10 tied at 10 but k=3 was found first) before `key-truth.jsonl` was read at
all. `key-truth.jsonl` was then read exactly once, by `score_on_key()`, for the numbers below.

**The vocabulary merge (design point 2) is not the literal OFF/USDA pair the design doc named.**
That pair does not exist in this `catalogue.db`: `product.source` holds only
`openfoodfacts`/`openbeautyfacts`/`openpetfoodfacts`/`openproductsfacts` (212,340 rows, exactly
the sum of those four -- no `usda` rows are loaded yet, though `catalogue-build-plan-2026-09-26.md`
unit 12 plans to add ~425,000 of them), and no product carries two tags at its own deepest depth,
so there is no per-product "two leaves on one row" to mine directly. Two real, catalogue-native
problems behave the same way and were fixed instead, both computed once from the whole catalogue
and applied identically to every predicted and true leaf (a structural fix, not a key-specific
tune):

1. **Language-orphaned leaves.** ~1,700 distinct leaf tags are not `en:`-prefixed
   (`fr:dentifrices`, `nl:fixing-sprays`, ...) because OFF's taxonomy sync never resolved them to
   an English canonical node, even though 4,596 products carry a mixed-language chain in the same
   row (e.g. `es:fusilli-de-trigo-duro` sitting under `en:durum-wheat-pasta`). For each foreign
   leaf, across every product whose chain contains it, count which `en:` tag is deepest in that
   *same* chain -- literal "products carrying both" co-occurrence -- and map the foreign leaf to
   its most-common English co-occurrent, kept only with 2+ supporting products: 281 mappings from
   1,696 candidate foreign leaves (`fr:savons-liquides` -> `en:soaps`, 58 products;
   `fr:dentifrices` -> `en:toothpaste`, 34 products; mostly personal care, some grocery).
2. **Garbled concatenations.** 215 of 76,844 categorised products (0.3%) have a `leaf_category`
   that runs several taxonomy nodes together with no separator (`en:plant-based-foods-and-
   drinksplant-based-foodssnackscereals-and-potatoessalty-snacksappetizerschips-and-frieschips
   potato-chips`, on a Lay's Classic row whose real leaf, one level up in its own chain, is
   `en:potato-crisps`) -- a catalogue ingestion bug, not a vocabulary split, but it fails
   exact-leaf matching the same way. Detected as a leaf slug over 55 characters; repaired by
   falling back to that product's own parent tag. (A related, smaller anomaly surfaced in the
   50-item re-read sheet: a numeric suffix glued onto a short tag, `en:pasta1233` -- not filtered,
   since it is under the 55-character threshold; flagged for whoever re-reads the sheet.)

**Other fixes, per design point:** candidates with no category are skipped, not treated as a
`none` vote (point 1). `name_en : (...) OR name_fr : (...)` is queried explicitly rather than
relying on FTS5's implicit whole-row match, which also hits `brands`/`leaf_category`/
`name_derived` and adds noise (point 3). Brand matching folds accents/apostrophes (reusing
`pipeline.fold`) and additionally strips a trailing `canada`/`inc`/`ltd`/`corp` token before
comparing, both when splitting the tile's own brand and when relating it to the catalogue's
(point 4). A catalogue candidate whose name, minus its own brand tokens, has nothing left (the
"Great Value" / "Heinz"-with-nothing-else junk rows the design doc named) is dropped before
scoring (point 5). Candidates are deduped by (folded name, folded brands, quantity) before voting
so one product padded across several near-identical catalogue rows doesn't dominate (point 6).
The vote is weighted `(1/rank) * max(0.1, pipeline.score)` over the top-k *categorised* survivors,
not a flat count (point 7).

### Results, scored once on key-truth.jsonl

| Measured | Result |
| --- | --- |
| Tiles regenerated from the 29 real PDFs | 898 (894 named, 872 priced) -- matches the design doc exactly |
| Tiles with a category assigned at all | 891/894 (99.7%) -- the skip-uncategorised-candidate fix (point 1) essentially closes this gap by itself |
| Tiles with a size or unit price | 747/898 (83%) -- matches the design doc's 747 of 898 exactly (351 from title/link, +396 more from the tile's own printed unit price) |
| Key items scored (true barcode in catalogue, with a category) | 46 -- the design doc's run found 47; `key-truth.jsonl` has grown (87 rows now vs. the ~81 implied on 2026-09-28) and stage 3's candidate retrieval is not perfectly reproducible run-to-run (FTS tie-breaking), so this is the closest reproducible match, not the identical 47 rows |
| **`sort_categories.py` exact leaf** | **34/46 = 74%**, 95% Wilson [59.7%, 84.4%] |
| **`sort_categories.py` leaf-or-parent** | **36/46 = 78%**, 95% Wilson [64.4%, 87.7%] |
| Page-majority baseline (same vocabulary merge applied, for a fair comparison) | 14/46 = 30%, 95% Wilson [19.1%, 44.8%] |
| Version-1 method (`category_test.py`, unmodified, no vocabulary merge), rerun today on the same 46 items | exact leaf 28/46 = 61%; leaf-or-parent 30/46 = 65%; its own page-majority baseline (no vocabulary merge) 11/46 = 24% |
| Design doc's original numbers (2026-09-28, 47 items) | exact leaf 27/47 = 57%; leaf-or-parent 31/47 = 66%; page-majority baseline 8/47 = 17% |

**The pass mark (95% at leaf-or-parent) is NOT met.** 78% is a real improvement over both the
57%/66% originally reported and the 61%/65% this session's unmodified rerun gets on the identical
46 items -- roughly halving the remaining gap to the bar -- but it is nowhere near 95%, and the
confidence interval's lower end (64%) is nowhere near it either. Per the design doc's own framing,
this says sorting is still far easier than matching (74-78% vs. matching's 57-70% shortlist recall
on a much stricter exact-barcode bar), but not yet safe to treat as ground truth for range-building
without the hand re-read this unit was scoped to stop short of.

### The 50-item re-read, and produce refused, 2026-09-30

Both sheets were marked by Claude reading the tile name against the chosen leaf and parent
(column `reread_by`), not by a person. Right means the leaf or the parent is a category the item
belongs in at a granularity a price range can use; a wrong canned/dried or canned/frozen split is
counted wrong.

| Sheet | Method | Leaf-or-parent right |
| --- | --- | --- |
| `category-reread-50.csv` (seed 20260928) | before the produce rule | **34/50 = 68%** |
| `category-reread-50-b.csv` (seed 20260930, unseen until scored) | with the produce rule | **35/50 = 70%** |

The bar is 95%; **D1 does not pass**. On the first sheet 7 of 16 misses were loose produce voted
into packaged categories (lime -> fruit juices, ginger -> biscuits, yu choy -> teas), which is why
`is_produce()` now refuses produce instead of sorting it (RULINGS.md, "Produce stays refused"): 99
of 894 tiles, 0 of the 46 key items, 1 wrong refusal seen (a lower-case "cilantro seasoning
paste"). The misses left are retrieval picking a wrong neighbour (red wine vinegar -> red wines,
almond butter -> tahini, cream-style corn -> beverages, SunChips -> bagel breads), which no vote
over the same shortlist can fix. The plan's next step is a model choosing the leaf from the
catalogue's own list, scored on these same two sheets; it needs an API key where it runs, and
this PC has none.

### What could not be verified

- **A person's re-read.** The sheets above were marked by Claude, which is not the hand re-read
  the plan asks for.
- **The 50-item hand re-read itself (superseded by the section above).** `category-reread-50.csv` (50 random tiles, seed 20260928,
  across all 894 named tiles, with the tile name, chosen leaf, chosen parent, and an empty
  right/wrong column) is produced but not filled in -- that step needs a human and was out of
  scope for this lane.
- **Whether 46/47 is the "same" held-out set the design doc scored.** The exact list of 47 SKUs
  used on 2026-09-28 was not persisted anywhere in the repo; `key-truth.jsonl` has since grown to
  87 rows. The 46-item set here is category_test.py's/sort_categories.py's current reproducible
  intersection (true barcode in catalogue, has a category, has a stage-3/sort_categories
  candidate list) -- almost certainly a near-superset/near-identical set, not a byte-for-byte match.
- **The literal Open Food Facts / USDA vocabulary pair the design doc named.** As detailed above,
  it does not exist in this catalogue.db snapshot; the vocabulary-merge method built here targets
  the two real, verifiable splits that were found instead (language-orphaned leaves, garbled
  concatenations). If USDA rows are loaded later (catalogue-build-plan unit 12), `build_canon()`
  will pick up any USDA/OFF co-occurrence automatically since it operates on whatever tags exist,
  but that is untested since no USDA rows are present to test it against.
- **`stage3.json`/`stage4.json` are not bit-for-bit reproducible.** Rerunning `pipeline.py`
  produced 46 scorable key items and a 61% method-A baseline against the design doc's 47 and 57%;
  close enough to trust the comparison but not an exact replay (FTS `rank` ties and dict-ordering
  in `candidates()` are not fully deterministic across runs).
