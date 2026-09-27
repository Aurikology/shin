# Unit 9, fill the category gap -- run 2026-09-26

Script: `catalogue/src/fill-categories.ts`. Dry run by default; `--apply` writes. Never imports
`load.ts`. Opens `openCatalogueReadOnly` with `PRAGMA busy_timeout = 120000` for every read; the
one writer path (`--apply` only) opens its own connection and was never invoked tonight.

## The recount, done first

The plan's number was **134,865** with no category at all, counted before tonight's dedupe
(1,375,443 duplicate rows deleted), Quebec load (50,166 rows) and food repair (5,115 rows).
Re-run against the post-cleanup catalogue (3,852,199 products, 465,323 Canadian, both matching
the plan's own re-stated totals exactly):

```
no category (path = [])   131,502
  of which canadian        87,000
```

**Down 3,363 from the plan's figure**, not up. The dedupe removed duplicate rows, some of them
uncategorised, which is the expected direction: the gap did not grow, the population it is drawn
from shrank.

## Who the uncategorised rows actually are

The plan's own hypothesis, carried over from unit 8 next door (electronics part numbers), was
that most of this number would turn out to be unreadable codes. **Measured, it is not:**

| source | rows | canadian | bare part number | readable name |
|---|---:|---:|---:|---:|
| openfoodfacts | 86,109 | 86,109 | 66 | 86,043 |
| openbeautyfacts | 23,589 | 308 | 90 | 23,499 |
| openproductsfacts | 13,448 | 436 | 138 | 13,310 |
| openpetfoodfacts | 8,349 | 146 | 10 | 8,339 |
| icecat (electronics) | 8 | 1 | 7 | 1 |

98.5% of the gap is the four Open *Facts sources, every one of them with a human-readable name.
Electronics contributes 8 rows total. The honest finding is the opposite of the hypothesis: this
is overwhelmingly real, nameable products upstream simply never tagged, most of them food, and
87,000 of them Canadian.

## Checked and dropped: read the category back from the source

Sampled the raw files behind these sources directly for uncategorised codes (`openbeautyfacts
.jsonl.gz`'s own `categories_tags` field, and `canada.parquet`'s `categories_tags` column via
DuckDB for the `openfoodfacts` rows). In every sample, `categories_tags` is empty or `NULL` at
the source too. This is not a loader bug eating a category the source published; upstream never
had one. Nothing to read back -- a rule has to be built or the gap stays a gap.

## The rule tried and killed: brand affinity

Built as ranked: if a brand's own already-categorised products agree on one leaf category, give
a new product from that brand the same one. At 90% agreement (>=3 members), it assigned "Pearl
Couscous Salad" (brand Fontaine Sante, which mostly makes hummus) to `en:hummus` -- wrong.
Tightened to **unanimous** (100% of >=3 members, 824 brands qualify, 496 rows fillable): still
wrong, and not from noise. A random sample of 25 unanimous assignments found:

- **"Milk" (brand "Black & White") -> `en:anti-perspirants`.** A Nova Scotia evaporated-milk
  brand and an unrelated antiperspirant sub-line print the identical brand string, and the
  antiperspirant SKUs outnumber the milk ones in this catalogue.
- **"Shampoo" (brand "Vita Coco") -> `en:coconut-waters`.** Same shape.
- Deduped-by-leaf listing (not the random sample) also turned up "Talc en poudre" filed under
  `en:open-beauty-facts` -- a source-project name, not a real category, that had leaked into the
  category data itself and become a brand's "unanimous" answer.

This is unit 4's own failure shape one column over: a string matches by coincidence, not
meaning, and no agreement threshold fixes a collision, because the collision produces its own
unanimous agreement. **The brand arm ships OFF** (`--brand-arm` reopens it). Left in the code,
off by default, so the evidence and the kill travel together.

## The rule that ships: name phrase against this catalogue's own vocabulary

The vocabulary is enumerated from the table, not invented: every leaf category already in use
(`leaf_category` on rows that have one), kept only where its readable form (`en:lean-ground-beef`
-> "lean ground beef") is **2 to 4 words** and has **>=3 members**. A single word is exactly the
collision risk that killed unit 4 (`en:food` catching purees by aisle-string coincidence).
Requiring a multi-word phrase to appear verbatim, as a run of adjacent tokens, in the product's
own name is a narrower claim than any substring match.

Two guards, both found by measuring, not assumed:

- **Negation.** "sans produits laitiers" ("dairy-free") contains "produits laitiers" ("dairy
  products"). A match immediately preceded by sans/without/non/sin is skipped. 72 of the initial
  9,161 matches were preceded by one of these words; checked by hand, only the dairy ones were
  real problems (all now correctly skipped, verified: zero "produits laitiers" rows remain in the
  fill list) -- "gluten-free", "free-run" etc. do not negate the matched phrase and were correctly
  left alone.
- **Contradiction, found while judging the 30-row sample below.** "Alcoholic Ginger Beer" matched
  "ginger beer", whose own stored path is `beverages > non-alcoholic-beverages >
  non-alcoholic-beers > ginger-beer` -- the vocabulary's own ancestor chain says non-alcoholic,
  the product's own name says the opposite. Added a guard: skip when the word immediately before
  the match is "alcoholic" and the matched category's own path contains "non-alcoholic". Caught
  2 rows (both ginger beer).

**Also fixed, found while building the vocabulary:** 1,236 of 3,807 candidate leaf tags (32%) are
stored under more than one distinct ancestor path across their own already-categorised members --
OFF's own tagging is inconsistent, not the leaf wrong (e.g. `en:plant-based` sometimes comes
through `pastas > spaghetti`, sometimes not). Taking "whichever row loads first" assigned a chili
the ancestor chain of spaghetti. Fixed to take the **mode** -- the path this leaf's own members
agree on most -- which is what the evidence actually supports.

Bare part numbers (`isBarePartNumber`, unit 8's own rule) are skipped outright: a code has no
words to match.

## The numbers

```
no-category rows before:        131,502
would fill (phrase rule only):    9,150   (7.0%)
  of which Canadian:              5,947
projected no-category after:    122,352
```

## The 30-row judged sample

Deliberately includes the hardest matches the rule reaches: five rows ambiguous between food and
something else (marked), the shortest (riskiest) 2-word matches, foreign-language matches, and
compound dish names where a sub-ingredient could be mismatched for the whole product.

| # | Product name | Matched phrase | Assigned category | Verdict |
|---|---|---|---|---|
| 1 | Rice noodles | rice noodles | en:rice-noodles | Right |
| 2 | Peanut Butter Snack Bar | snack bar | en:snack-bar | Right (broad but accurate) |
| 3 | Vegetable pad thai | pad thai | en:pad-thai | Right |
| 4 | Le Male Elixir Eau de Parfum 75 ml | eau de parfum | en:eau-de-parfum | Right |
| 5 | Double Chocolate Muffins | chocolate muffins | en:chocolate-muffins | Right |
| 6 | Moisturizing Cream | moisturizing cream | en:moisturizing-cream | Right |
| 7 | Plant based chili | plant based | en:plant-based | Right, but broad (ancestor path still carries `pastas`, an OFF taxonomy quirk, not this rule's error) |
| 8 | Jamaican style vegan patties | vegan patties | en:vegan-patties | Right |
| 9 | Broccoli And Cheddar Cheese Stuffed Chicken | cheddar cheese | en:cheddar-cheese | **Wrong** -- a stuffed-chicken entree filed as a cheese product |
| 10 | Lean Ground Beef | lean ground beef | en:lean-ground-beef | Right |
| 11 | Teriyaki Chicken Thighs | chicken thighs | en:chicken-thighs | Right |
| 12 | Butter chicken | butter chicken | en:butter-chicken | Right |
| 13 | Influence Beauty Lipstick Balm Glow Injection 06 Synthesis - Moisturizing Lip Balm with Glossy Finish | lip balm | en:lip-balm | Right |
| 14 | Buffalo Chicken Wings | chicken wings | en:chicken-wings | Right |
| 15 | Grass Fed Beef Patties | beef patties | en:beef-patties | Right |
| 16 | Blue Dog Food | dog food | en:dog-food | Right |
| 17 | crema viso nutriente all'argan | crema viso | it:crema-viso | Right |
| 18 | Organic Black Beans | black beans | en:black-beans | Right |
| 19 | Fresh blueberries chocolate coated | fresh blueberries | en:fresh-blueberries | **Wrong** -- a chocolate-covered-blueberry confection filed as fresh produce |
| 20 | Vitamin C | vitamin c | en:vitamin-c | Right (ambiguous: food-supplement vs. medicine shelf) |
| 21 | Omega 3 Fish Oil Vitamin Supplement | vitamin supplement | en:vitamin-supplement | Right (ambiguous: food vs. supplement; sourced from the beauty-facts file, category still accurate) |
| 22 | Rose Water | rose water | en:rose-water | Right (ambiguous: food flavouring vs. cosmetic toner; can't tell which from the name alone, category name covers both) |
| 23 | Turmeric powder | turmeric powder | en:turmeric-powder | Right (ambiguous: spice vs. supplement) |
| 24 | Energy drink | energy drink | en:Energy drink | Right (ambiguous: beverage vs. supplement category; note the stored tag's own casing is inconsistent, a pre-existing data-quality issue, not this rule's) |
| 25 | Fish food | fish food | en:fish-food | Right |
| 26 | Dishwashing liquid | dishwashing liquid | en:dishwashing-liquid | Right |
| 27 | Essuie Tout 4x51 | essuie tout | fr:essuie-tout | Right |
| 28 | HAND SANITIZER 1LTR | hand sanitizer | en:hand-sanitizer | Right |
| 29 | Sardines in Tomato Sauce | sardines in tomato sauce | en:sardines-in-tomato-sauce | Right |
| 30 | Grana Padano | grana padano | en:grana-padano | Right |

**Result: 2 of 30 wrong (6.7%). Falsifier (fires above 10%, i.e. more than 3 of 30) did NOT
fire.** Both wrong cases share one shape worth naming plainly: the matched phrase names a real
ingredient or component correctly, but the product is a compound item (a stuffed dish, a coated
confection) whose overall identity the ingredient-phrase does not represent. This rule has no
guard against that shape yet, and it is not zero -- expect more like these two in the 9,150.

One case (Alcoholic Ginger Beer, 2 rows) was caught by hand during this judging pass and fixed
with the contradiction guard above rather than shipped and reported wrong; the numbers in this
document are after that fix.

## What this run did not touch

Nothing was written. `--apply` was not passed. The `catalogue/data/catalogue.db` file was opened
read-only for every query in this document.
