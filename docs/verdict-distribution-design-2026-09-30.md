# The price verdict as a distribution chart: design, 2026-09-30

His words, 2026-09-30: *"for the price verdict, the app will provide an animated normal distribution
chart and where their product price falls on it. It will ALWAYS provide the answer(unless the user
runs out of scans). So now the question is, what are all the edge cases, and how will you provide
the best answer possible for each case"*, then *"go ahead and build. make sure you don't go any of
the most recent calls i've made(a call from the past doesn't count if i've contradicted it in the
future). Other than that, you can make any calls"*.

Governing rulings (RULINGS.md): catalogue first; Claude (cheapest, never a web search) when the
catalogue cannot answer; the answer is always a range estimated for this item, never one store's
price; one store's price counts as evidence; sizes build on the existing size system; always answer;
no Gemini in any shopper answer; typed searches are free and uncounted.

## The one idea

Every case reduces to two numbers for this item: a **centre** (the typical price) and a **spread**
(how much prices vary). With those two the bell can always be drawn. Cases differ only in where the
two numbers come from and how sure Shin is; less sure means a wider bell and the confidence line
beside the answer (his 2026-09-17 words: an answer with *"we are not fully confident in this
answer beside its answer"*, never nothing).

The bell is fitted on **log price** and drawn on a **log price axis**: on that axis it is an exact
normal curve, it can never reach a negative price, and wide categories (wine) stay honest.
`centre = exp(mu)`, `sigmaLog = sigma`, p10/p90 = `exp(mu -/+ 1.2816 sigma)`.

## Claude's calls (made on his 2026-09-30 permission; each reverses on his word)

1. **Log-price bell** (above).
2. **Bulk:** compare within the same pack-size band (half to double this item's size, same unit
   family); a bigger pack's unit price is shown as a side note, never folded into the bell. His
   2026-09-17 *"There needs to be constraints in place for things like buying things in massive
   bulk"* is later than 2026-09-14 *"if that makes the 1l a bad deal, its a bad deal"*.
3. **Verdict words are his:** great, good, reasonable, bad, against the shopper's own thresholds
   (2026-09-14 *"we tell the user based on their preference, this is factrually a bad, resonable or
   good price"*; 2026-09-17 *"good, bad, and great price ranges"*; his verdict screen *"GREAT DEAL
   (25% below average)"*). Hard rule 2 (no savings claim until measured) is untouched: no "saved",
   no tally. Legal review before public launch still stands.
4. **Default thresholds are his numbers** (2026-09-17 setup screens): good = 20% or more under the
   centre, great = 30% or more under, bad = 20% or more over, reasonable between. A shopper's own
   thresholds replace these when set.
5. **Confidence** is high (own prices from 3+ shops, fresh), medium (own prices from 1-2 shops, or a
   same-product other size, or a leaf category with 20+ priced products), low (everything else).

## The ladder

**Centre**, first source that has evidence:
1. `own_prices`: this item's own regular prices, any count from one shop up, latest per shop,
   90-day window first, then up to 2 years with age weighting. Median of shops.
2. `other_size`: the same product (same normalised brand and name) in another size, unit price
   scaled to this size.
3. `leaf_category`: priced products in its leaf category, same unit family and pack-size band,
   unit prices scaled to this size; median. Needs 5+.
4. `parent_category`: the same one level up. Needs 5+.
5. `brand_markup`: when only the brand is known, the brand's median ratio to its categories' medians
   times the nearest category centre (his 2026-09-06 name-brand markup).
6. `claude_typical`: the cheapest Claude, no tools, asked for low/typical/high; typical = centre,
   low/high read as p10/p90. Saved as data. Capped monthly.
7. `category_prior`: the widest category Shin can place it in, any size, per item.
8. `global_prior`: all regular prices Shin holds in that currency. Never reached in practice; it
   exists so the answer is always drawable.

**Blending own prices with the category** (one or two own prices are thin): the centre is a
precision-weighted mix, `mu = (n * mu_own + k * mu_cat) / (n + k)`, k = 1, when a category centre
exists; own prices dominate from 3 shops up. This is his nested-category design in one line: own
prices inform, the category fills in.

**Spread**, first that applies: own prices' log spread when 5+ shops; else the leaf category's log
spread (robust: IQR / 1.349 on log unit prices); else parent category; else Claude's p10/p90; else
the prior. **Floor**: never below the category's spread (all-same provincial prices cannot collapse
the bell) and never below 0.05. Old data (newest price over 1 year) and other-region data widen it
by 25% each.

## The response contract

Every answer that has a scan left carries `verdict`:

```
verdict: {
  kind: 'distribution',
  currency: 'CAD',
  centreCents, sigmaLog, p10Cents, p90Cents,
  basis: 'own_prices'|'other_size'|'leaf_category'|'parent_category'|'brand_markup'|'claude_typical'|'category_prior'|'global_prior',
  spreadFrom: 'own_prices'|'leaf_category'|'parent_category'|'claude'|'prior',
  confidence: 'high'|'medium'|'low',
  n,                                   // prices standing behind the centre
  perUnit: { label: 'per 100 g'|'per 100 ml'|'each'|'per kg', centreCents } | null,
  scaledTo: '750 ml' | null,
  dots: [{ cents, store, city, seenOn, kind: 'regular'|'sale', quantity }],   // at most 12, newest first
  biggerPack: { quantity, perUnitCents, store } | null,
  shopper: { cents, zone: 'great'|'good'|'reasonable'|'bad', offByPct, beyond: 'low'|'high'|null,
             suspect: { suggestCents } | null } | null,
  thresholds: { greatPct: 30, goodPct: 20, badPct: 20, fromShopper: false },
  notes: ['size_assumed'|'other_region'|'old_prices'|'identity_conflict'|'claude_estimate'|'few_prices']
}
```

`shopper` is null until a shelf price exists; `beyond` is set when the price sits past p1/p99 (the
dot is pinned at the edge with a multiple, "3x the typical price"); `suspect` is set when the price
is more than 4 sigma out and a x100 / /100 reading, or a per-kg reading, lands inside p10-p90.

## Every case, and its answer

Identity
1. Barcode in catalogue, own prices: centre blended own + category, spread from category.
2. Priced barcode missing from the catalogue (7,211, all BC liquor): name from the store's own
   product name; category from sorting that name (existing search); own-price centre; category spread.
3. In catalogue, no price: category unit price times size.
4. No size (79% of Canadian food): size from the name (size-fill); else per-item category bell,
   note `size_assumed`, wider.
5. No category: sort the name; else `claude_typical`.
6. Barcode nothing knows: ask the name; then the typed path.
7. Typed name matches: shopper picks one of 3; then as 1-4.
8. Typed name matches nothing: `claude_typical` from the typed name; saved as data.
9. Catalogue identity disagrees with the store row (size or name, e.g. 0048415411325 473 ml vs
   1750 ml): the store row's size is used for the price; note `identity_conflict`; row logged.
10. Loose produce / weighed items: per kg bell; a weighed label's embedded price is the shelf price.
11. Bulk / multipacks: pack-size band; `biggerPack` side note.
12. Store brand: own prices from one chain; category spread.
13. Electronics: own prices, else `claude_typical` for the exact model; no unit price.

Price data
14. One own price (8,376 of 8,501 priced barcodes): blended centre, category spread.
15. Two stores far apart: both are dots; blended centre.
16. All stores equal (34 of 125 two-store barcodes within 5%): spread floor.
17. Old prices (804 rows over a year): age-weighted, bell widened, note `old_prices`.
18. Sale prices (252): never in the centre; shown as `sale` dots.
19. Wrong rows: medians; a price more than 5x off its category median is left out of the centre.
20. Prices with no barcode (6,208): category centre and spread only, never an item's own price.
21. Region: prefer the shopper's province; else use what exists, note `other_region`, wider.
22. Tax / deposit: compare like with like where the row says which; otherwise noted.

The shopper's price
23. No price typed: bell drawn, the dot appears when typed.
24. Likely typo or per-kg price: `suspect`, one-tap "Did you mean $4.99?"; the chart still shows.
25. Far outside: pinned at the edge with the multiple.
26. Other currency: converted and said.

System
27. Claude down, capped, slow or no key: next rung (`category_prior`, then `global_prior`).
28. Slow: the first answer is drawn at once; a better one animates the bell into place.
29. Offline: the phone draws from a per-category table in its pack (second phase).
30. Out of scans: the paywall, the only exception. Typed searches stay free.

Shown
31. Log-price bell. 32. Sizes kept apart, sales as separate dots. 33. Zones from the shopper's
thresholds, defaults above. 34. Each dot labelled store and quantity (his 2026-09-14 *"label each
dot on the graph with its actrual quantity"*). 35. Reduced motion: drawn still.

## Build units

- **Server** (one lane): `price/src/estimate.ts` (new; reads `range.ts` and `units.ts`, edits
  neither), wired into the catalogue-first barcode, typed and read-text answers and the
  not-in-catalogue priced path; the scan row records basis, confidence, zone. A test per case above.
- **Screen** (one lane): the animated bell on the result sheet, built to the contract with fixtures.
- **Offline** (after both): the per-category table in the phone pack.

Every case's test is also a bench case: when the bench can score (it cannot yet: 1 product at 3+
shops, no time span), each rung's hit rate is measured and replaces the confidence guesses above.
