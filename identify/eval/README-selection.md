# How the 40 codes were picked

Source: `catalogue/data/catalogue.db`, read-only, `node:sqlite` `DatabaseSync`. Every row
verified against `source = 'openfoodfacts' AND sold_in_canada = 1`.

Selection query pattern (run per bucket, then hand-picked from the results):

```sql
SELECT code, name, brands, quantity, size_value, size_unit, leaf_category, source, sold_in_canada
FROM product
WHERE source = 'openfoodfacts' AND sold_in_canada = 1
  AND ...bucket condition...
```

Buckets, 40 codes total:

- **6 size-pairs (12 codes)** — same `brands` + `name`, two different `size_value`s. Found with
  `GROUP BY brands, lower(trim(name)) HAVING count(*) >= 2`, then the two most different sizes of
  each product picked by hand: Heinz Tomato Ketchup, French's Tomato Ketchup, Cadbury Mini Eggs,
  Kellogg's Corn Flakes, Sprite Lemon-Lime Soda, General Mills Cinnamon Toast Crunch. This is the
  failure mode section 1 of `docs/the-photo-path.md` names explicitly: two boxes that look
  identical from the front and are two different catalogue rows.
- **4 store brands** — `brands LIKE '%<name>%'` for Selection, No Name, Great Value, Compliments,
  Kirkland, and PC/President's Choice; one pick kept from whichever names actually exist in this
  catalogue (all six do). One code each from No Name, Great Value, Compliments, Kirkland.
- **4 multipacks** — `name` or `quantity` matching `%x %` or `%pack%`, filtered by hand to real
  multipacks (Kashi bars, Danone Danette, Cheemo perogies, SunRype juice), discarding matches that
  were multipacks in name only (e.g. a single-serve bar whose *variety pack* sibling wasn't picked).
- **20 ordinary items** — one per leaf category, sampled across `en:honeys`, `en:hummus`,
  `en:breads`, `en:kombuchas`, `en:protein-powders`, `en:breakfast-cereals`, `en:potato-crisps`,
  `en:teas`, `en:biscuits`, `en:salad-dressings`, `en:confectioneries`, `en:peanuts`,
  `en:corn-chips`, `en:cheeses` (x2), `en:flours`, `en:crackers-appetizers`,
  `en:instant-noodles`, `en:yogurts`, `en:chickens` — each with `brands IS NOT NULL` and
  `size_value IS NOT NULL`, so every row carries a real brand and a real size.

35 distinct leaf categories appear across the 40 (well past the 8 asked for). Full row detail
lives in `manifest.json`; this file explains the *how*, not the *what*.

## Image fetch note

Open Food Facts' `world` API soft-throttled a fast pass at 500 ms/request: 16 of 40 codes came
back "no product record" on the first pass. A slower retry at 1.2 s/request recovered all 16,
including the two codes a same-run fallback had already swapped out for backups — those swaps
were reverted once the originals proved fine, so the final 40 photos match this selection with
**no swaps**. `run.ts` and any future re-fetch should budget for that throttle rather than assume
a miss means no image exists.
