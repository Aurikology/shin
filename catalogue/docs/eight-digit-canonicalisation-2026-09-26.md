# Eight-digit barcode canonicalisation, 2026-09-26

## The problem

`canonicalCode()` in `src/barcode.ts` pads an 8-digit EAN-8 out to 13 digits with
five leading zeros -- GS1 writes an EAN-8 right-aligned in a 13-digit field
exactly as it writes a 12-digit UPC-A as a GTIN-13, and the check digit
(computed from the right) does not change. `load.ts` always writes the padded
spelling, but older food-database rows were still stored unpadded, so one
barcode was two rows: an 8-digit row and its zero-padded 13-digit twin.
`export-pack.ts` groups the Canadian pack by the NUMBER a code spells, so both
spellings are one key, and it refuses to write a pack once more than 50 rows
share a key with another row. It refused the Canadian pack on this class of
row on the night this was run.

Counted live on 2026-09-26, before this script ran: 422 pairs (844 rows) where
an 8-digit code and `'00000' + that code` were both present as separate
`product` rows -- more than the 396 pairs / 792 rows measured earlier the same
night, because a USDA load landed in between and added 26 more pairs, none of
them `sold_in_canada` on both sides. The 396/792 figure and this run's 422/844
are the same phenomenon at two points in a catalogue that kept loading; both
are reported here rather than picking one.

## What the script does

`src/canonicalise-eight-digit-codes.ts`, dry run by default, `--apply` to
write, one transaction, rolled back on error.

1. **FOLD**, for an 8-digit row whose padded twin already exists and the two
   plausibly name the same product (see "Matching rule" below). The 13-digit
   row survives; nullable, non-primary-key columns (read from
   `PRAGMA table_info(product)`, not hand-typed) that are NULL on the survivor
   and set on the dying row move across, `sold_in_canada` rises to the max of
   the two, then the dying row and its `product_vec` / `product_category` rows
   are deleted by rowid.
2. **RENAME**, for an 8-digit row with NO padded twin at all:
   `UPDATE product SET code = '00000' || code`. This is the durable half --
   once every un-twinned 8-digit code is written in `canonicalCode()`'s own
   spelling, no future load can write a second spelling of it, because that
   spelling is the only one left in the table.
3. Rebuilds `product_fts` (`INSERT INTO product_fts(product_fts) VALUES('rebuild')`)
   and deletes `product_category` rows by `rowid_ref`, the same way
   `dedupe-barcode-spellings.ts` does both.

## Matching rule, and why it needed more than the name column

A literal "share a 4+ letter word, minus a stopword list" rule over `name`
alone folds 369 of 422 pairs and leaves 53 standing (106 rows, 102 of them
both-Canadian) -- most of them genuinely the same product, just named in the
other official language ("Jus de raisin" / "Tropicana Pure Premium - Grape")
or by a brand the free-text name never repeats ("Aha" /
"AHA - Peach Honey Sparkling Water"). Left at 53, the residual collision count
for the Canadian pack (102 both-Canadian rows) was still over
`export-pack.ts`'s 50-row line, so `brands` -- the column this schema already
carries for exactly this kind of identity check -- was brought in too, in two
narrow, high-precision ways.

**Stopwords**, judged against what the live pair list actually contains, in
two groups:

- category nouns that say only "this is a drink," not which one: `water`,
  `juice`, `soda`, `drink(s)`, `beverage(s)`, `boisson(s)` (French "drink"),
  `gazeuse(s)` (French "carbonated"), `sparkling`, `mineral`, `spring`.
- marketing adjectives describing the whole category: `original`, `natural`,
  `select`.

Deliberately **not** stopped, after checking each would break a real pair:
`zero`, `sugar`, `free`, `diet`, `lemon`, `lime`, `punch`, `cola`, `cherry`,
`berry`, and other flavour/formulation words. These name the thing that tells
two rows apart from two unrelated products under the same brand ("Coke Zero"
/ "Coca-Cola - Coca-Cola Zero" shares only `zero`, and folding it is right).
Every pair here is already fixed by the barcode before any text is read --
the token check only decides whether to *trust* a pair the barcode already
produced, never to *find* one among unrelated rows -- so a generic shared word
carries real evidence for `name` that it would not carry if used to search
the whole catalogue.

**Brand matching, tried the same way first and reverted.** A shared single
word between the two `brands` fields folds 398 of 422 -- but it also folds
`00128582` (`Natural Spring Water` [brand `Shell Select`] against
`SHELL SELECT SprPETDC168(12x0.5L) LCPCA : Eau de Source` [brand `Shell`]),
one of the two pairs this run must never touch, because both brand fields
contain the bare word "Shell." That pair is a genuine data fault -- the task
names it explicitly, and nothing in the text says which of the two products
is wrong about its own barcode. A shared brand *word* cannot tell that pair
apart from a legitimate brand-family match ("Powerade" / "Powerade Zero" is
the identical shape and IS the same product), so word-level brand matching is
not used. What is used instead, both requiring exact-string agreement rather
than a shared word:

- **brand-exact**: the two `brands` fields are the same manufacturer once
  lowercased, punctuation stripped, and a small set of corporate suffixes
  removed (`inc`, `ltd`, `llc`, `corp`, `canada`, `company`, `co`) --
  "Coca-Cola Canada" and "Coca-Cola" canonicalise to the same string; "Shell
  Select" and "Shell" do not (different strings, not a suffix relationship).
- **name-is-brand**: one row's name, reduced to just its first word, IS the
  other row's `brands` value -- "Aha" / "Aha!" against a row whose own
  `brands` column says "AHA." This is exact equality, not substring
  containment, precisely because `"shellselect".includes("shell")` is true and
  a substring rule would silently re-introduce the Shell false fold.

One named alias: `coke` maps to the same canonical string as `cocacola`,
because Coke is Coca-Cola's own short name for its own product. No other
alias was added. Real near-misses left standing because of this restraint:
Mountain Dew against a USDA row branded `MTN DEW`, and three "7up"/"7 UP"/
"7-Up" pairs where the brand token itself is under 4 letters. All are named
below and none was forced.

## Numbers

Before (this run, live catalogue): 4,290,328 products, 8,010 eight-digit
codes, 422 colliding pairs (844 rows) among codes of 14 digits or fewer, of
which 396 pairs (792 rows) were the figure measured earlier the same night --
the 26-pair difference is a USDA load that landed in between, none of it
`sold_in_canada` on both sides.

Decision: **399 folds**, by reason -- 369 name-token, 24 brand-exact, 6
name-is-brand. **23 left alone** (46 rows), all printed below with both names
and brands. **7,588 renames** (8-digit rows with no twin at all).

Left alone, and why -- every one of these has been read by hand:

| code | dropped name / brand | kept name / brand | why left alone |
|---|---|---|---|
| 00004770 | Avocado / (none) | PanzerGlass Screen Protector Google Pixel 6a / PanzerGlass | genuine data fault, named by the task; zero overlap in name or brand |
| 00128582 | Natural Spring Water / Shell Select | SHELL SELECT SprPETDC168... Eau de Source / Shell | genuine data fault, named by the task; brand words overlap ("Shell") but the exact-match rule correctly refuses it |
| 01223305 | Mountain Dew / PepsiCo Beverages Canada | SODA / MTN DEW | brand is the same product abbreviated ("MTN DEW"), no alias added for it -- a real near-miss, not forced |
| 04853238 | Jus de raisin / PepsiCo Beverages Canada | Tropicana Pure Premium - Grape / Tropicana Pure Premium | cross-language, no shared word or brand identity |
| 05500602 | Thé glacé / (none) | Good Host - Iced Tea / Good Host | cross-language, no brand on the dying row |
| 05661105 | Canada Dry / Canada Dry Mott's Inc. | Crush - Birch Beer / Crush | different brands recorded on each side -- plausible fault or plausible mislabel, left alone |
| 05672004 | PepsiCrush Cerise591 mlPlastique / (none) | Crush - Cherry / Crush | run-together source string, no brand to match against |
| 05966735 | Limonade à la framboise / (none) | Simply - Lemonade with Raspberry / Simply | cross-language, no brand on the dying row |
| 06212410 | Soda Diète au Gingembre et Canneberge / Canada Dry Mott's Inc. | Canada Dry - Diet Cranberry Ginger Ale / Canada Dry | cross-language name, brand-exact narrowly misses ("Canada Dry Mott's Inc." reduces to "canadadrymotts", not "canadadry") |
| 06229119 | Banana / Del Monte | Canada Dry - Cranberry Ginger Ale / Canada Dry | different brand, different product on the face of it -- a plausible third fault, left alone on purpose |
| 06250915 | Boisson gazeuse / Canada Dry Mott's Inc. | C plus - Orange Burst / C plus | different named brand once suffix-stripped, no name overlap |
| 06547339 | 2L 7up / PepsiCo Beverages Canada | 7 UP - Lemon Lime / 7 UP | brand token "7up" is 3 letters, under this rule's floor |
| 06647995 | Eau minérale pétillante / (none) | Clearly Canadian - Sparkling Mineral Water 4Pk / Clearly Canadian | cross-language, no brand on the dying row |
| 06700100 | Power ade ultra / Coca-Cola Canada | Powerade - Melon / Powerade | manufacturer recorded, not the product brand; no exact or first-word match |
| 06720007 | Water / Coca-Cola Canada | Dasani - Demineralized Water / Dasani | manufacturer recorded, not "Dasani"; only stopword "water" shared |
| 06772806 | Soda aromatisé pamplemousse et agrumes / Coca-Cola Canada | Fresca Soda Water Beverage - Grapefruit Citrus / Fresca Soda Water Beverage | cross-language, manufacturer not product brand |
| 06784005 | Thé vert / Coca-Cola Canada | Gold Peak - Green Tea / Gold Peak | cross-language, manufacturer not product brand |
| 06784102 | Thé glacé saveur pêche / Gold Peak tea | Gold Peak - Peach Tea / Gold Peak | brand-exact narrowly misses ("Gold Peak tea" vs "Gold Peak") |
| 06790802 | Coca-Cola - Vanille Grillée / Coca-Cola Canada | Diet Coke - Xtra Toasted Vanilla / Diet Coke | regular vs Diet -- plausible formulation fault, left alone on purpose |
| 06791607 | Soda Cerise Épicée / Coca-Cola Canada | Barq's - Spiced Cherry / Barq's | manufacturer recorded, not "Barq's"; weak signal, left alone |
| 06793605 | Sparkling water / Coca-Cola Canada | AHA - Blueberry Pomegranate / AHA | manufacturer recorded, not "AHA"; only stopwords shared in the name |
| 06793809 | Eau petillante / Coca-Cola Canada | AHA - Peach Honey / AHA | same as above, in French |
| 07853001 | 7 UP cerise / Pepsi Alex Coulombe Ltée | 7-Up - Cherry / 7-Up | brand token "7up" is 3 letters, under this rule's floor |

## Falsifier

Decided before the sample was drawn: hand-judge 30 folds picked at random
(seeded shuffle, reproducible) against both names and brands; if more than 3
of 30 are not plausibly the same product, the fold rule is wrong and the
script should ship with folding disabled (rename only).

Result: **0 of 30 clearly wrong.** The closest call: "Root beer" [brand
`Coca-Cola Canada`] against "Barq's - Crafted Soda Root Beer" [brand
`Barq's`], matched on the shared name tokens `root` and `beer`. Root beer is
generic enough that, in principle, a different Coca-Cola root beer could sit
under a reused code the way `01223305` and `00128582` do -- but Barq's is
Coca-Cola's own root beer line, and nothing else on either row disagrees, so
it was judged correct. The other 29 were plain matches (exact-name repeats,
French/English cognates, or a brand appearing on one side and only in the
other side's name). The falsifier did not fire; folding shipped.

Full 30-row sample (fold reason in brackets):

```
[name-token:peace] "Peace Tea - Lemon Love - Lemon" <-> "Peace Tea - Lemon Love"
[name-token:sauce] "Soy Sauce" <-> "SOY SAUCE, SOY"
[name-token:coca] "Coca Cola Artisanal" <-> "Coca-Cola - Cola"
[name-token:canada] "Canada Dry Ginger Ale" <-> "CANADA DRY - Ginger Ale"
[name-token:fresca] "Fresca" <-> "Fresca - Grapefruit"
[name-token:dasani] "Dasani Water" <-> "Dasani - Remineralized Water"
[name-token:powerade] "Powerade ION4 - Orange Tangerine" <-> "Powerade - Orange Tangerine"
[name-token:coca] "Coca-Cola Zero Move" <-> "Coca-Cola Zero Sugar - Move"
[name-token:coca] "Coca-Cola Zero Dream Flavored" <-> "Coca-Cola Zero Sugar - Dreamworld"
[name-token:shasta] "Shasta - Tiki Punch" <-> "Shasta - Tiki Punch"
[name-token:perrier] "Perrier Mineral Water" <-> "Perrier - Carbonated Natural Spring Water"
[name-token:schweppes] "Schweppes Ginger Ale Canneberge Framboise" <-> "Schweppes - Cranberry Raspberry Ginger Ale"
[name-token:diet] "Diet Coke" <-> "Coca-Cola - Diet Coke"
[name-token:coke] "Coke diète fraise et goyave" <-> "Diet Coke - Strawberry Guava"
[name-token:peace] "Peace Tea Fizz - Cerise Coquine" <-> "Peace Tea Fizz - Cheeky Cherry Sparkling"
[name-token:fruit] "Fruit Punch Flavour Sports Drink" <-> "Powerade - Fruit Punch"
[brand-exact:peacetea] "Raspberry Iced Tea" <-> "Peace Tea - Razzleberry"
[name-token:ginger] "ginger ale" <-> "Canada Dry - Ginger Ale"
[name-token:sprite] "Sprite 1L" <-> "Sprite - Lemon Lime"
[name-token:schweppes] "Schweppes Ginger Ale" <-> "Schweppes - Ginger Ale"
[name-token:mountain] "Mountain Blackberry Sparkling Water Beverage" <-> "Clearly Canadian - Mountain Blackberry"
[name-token:sprite] "Sprite - Lemon Lime" <-> "Sprite"
[name-token:canada] "Canada Dry - Soda Club Petits Fruits" <-> "Canada Dry - Club Soda Triple Berry"
[name-token:fresca] "Fresca" <-> "Fresca - Grapefruit"
[name-token:tonic] "Soda tonic léger premium" <-> "Canada Dry - Light Tonic Water"
[name-token:sprite] "Sprite Lemonade" <-> "Sprite - Lemonade"
[name-token:shasta] "Shasta - Twist Lemon Lime" <-> "Shasta Twist - Lemon Lime"
[name-token:root] "Root beer" <-> "Barq's - Crafted Soda Root Beer"   <- closest call
[name-token:canada] "Canada Dry Ginger Ale Diet" <-> "Canada Dry - Diet Ginger Ale"
[brand-exact:7up] "7 UP" <-> "7 UP - Lemon Lime"
```

## Result of `--apply`, verified from a separate process

Ran `node --experimental-strip-types src/canonicalise-eight-digit-codes.ts --apply`.
Backup taken first at `data/catalogue.db.before-8digit-canon` (own file, never
`catalogue.db.before-dedupe` or `catalogue.db.before-dedupe.2026-09-14`). The
script's own in-process check printed PASS (products fell by exactly 399,
`noTwin` reached 0, `eightDigit` left equals the 23 left-alone rows).

A second, separate `node` process then re-opened the database read-only and
found the same numbers independently:

- products: 4,290,328 -> 4,289,929 (down by exactly 399)
- eight-digit codes: 8,010 -> 23 (the left-alone rows only)
- collision groups (any digit code <=14 long, grouped by the number it
  spells): 422 -> 23; rows: 844 -> 46
- both `00004770` (Avocado / PanzerGlass) and `00128582` (Shell Select /
  Shell) are still present, untouched, exactly as required
- negative control `0000000000093` is absent both before and after, so the
  zero result above is not a broken lookup

## Exporter verdict

`node --experimental-strip-types src/export-pack.ts --scope=canada`, run as
the external judge, from a separate process, after `--apply`:

Exit code 0. No "REFUSING TO WRITE THE PACK" line. `data/pack-canada.bin`
freshly written. Last 8 lines:

```
dropped 42 rows in total to keep every key unique
scope           canada
rows            473,677
skipped         54 codes no scanner can produce (over 14 digits)
raw             31.65 MB  data/pack-canada.bin
gzip            10.39 MB  data/pack-canada.bin.gz
brotli          6.50 MB  data/pack-canada.bin.br
built in        14.9s
```

42 rows dropped, matching the 21 both-Canadian left-alone pairs exactly (2
rows each), including `128582` (Shell Select / Shell). No other key collided.
The exporter, as the external judge of this work, wrote the pack.
