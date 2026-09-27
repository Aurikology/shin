---
name: price-by-hand
description: Price one item by hand the way the app would, and record what happened. Use for the 30-item pilot, before building anything in a new category, and whenever someone claims a category has no price data. Seven items are done; the method that failed on three of them is written down here so it is not repeated.
---

# price-by-hand

The test that gates everything: **can this item be priced at all, from sources a built app could
query.** Seven items were run 2026-09-03 and are written up in `notes/session-2026-09-03.md`.
Twenty-three remain.

## The rule that came out of the first seven

The first run reported that new tech, new furniture and produce had no usable price data. Two of
those three were wrong, and the error was the method: a search engine was asked for a live price
where a price tracker or a retailer API would have answered. Direct retailer fetches went zero
for four, three of them hard 403s. Search returned a usable multi-retailer range for one item out
of seven. Both numbers are facts about the method, not about the market.

**A zero is UNKNOWN until something proves the search could have found a hit.** Before writing
"no data" for a category, enumerate the source classes and name the ones not opened.

## Procedure

1. **Settle identity first, before looking at any price.** This is the order that matters. A
   confident price attached to the wrong product is the worst output the system can produce, and
   it is the failure the pilot actually hit: a used camera body query returned a different model
   with lenses at roughly double. Write down the exact model, size, or package format. If
   identity cannot be settled, stop here and record it as an identity failure, not a price
   failure. The two are fixed by different work.
2. **Pick the source class for the category, in this order:**
   - an official retailer API where one exists
   - a price tracker that already aggregates the category
   - a marketplace's live listings, for used goods
   - a retailer page fetched directly, expecting to be blocked
   - a search engine, last, and only to find which of the above exists
3. **Collect points.** Each one gets: the price, the seller, the date, and whether it is a
   regular price or a promotion. A promotion recorded as a regular price poisons the comparison
   the app is built on.
4. **Decide what the verdict sentence would be.** It differs by category and this is deliberate,
   one sentence per category rather than one screen:
   - grocery: regular price against this week's promotion
   - tech: against other retailers
   - used: against live comparable asking prices, which are upward biased and must be labelled so
   - furniture: against its own history, because there is usually no second seller
5. **Record the row**, including the failures. A row that returned nothing is recorded as
   nothing. Wrong rows from earlier runs stay in the table with the correction beside them rather
   than being edited away, so the method error stays visible.

## Known results, do not re-derive

- **Grocery works and swings hard.** One 225g item moved 3.6x across banners in a single week,
  all of it promotional. This is the category that most needs the regular-versus-promo split.
- **New tech is the best-served of the five**, not the worst: an official retailer developer API
  exists, several Canadian trackers compare dozens of retailers, and cross-border tools cover
  cameras and computers.
- **Used goods work and the data is free**, from marketplace listings. Asking prices, upward
  biased, and the app must say so.
- **New furniture has data but usually no second seller**, so the verdict is against its own
  history. That makes rolling promotions visible where the product page never shows them.
- **Produce is the one genuinely hard category.** Three stacked problems: a produce code names a
  category rather than a product, package formats break unit comparison, and public price
  movement is underlying inflation rather than promotional. Shopper-reported shelf prices are the
  only source, not a supplement. **Superseded 2026-09-13, see docs/decisions.md, "Produce becomes
  the beta's test case, on the condition already written for it":** he chose produce as the beta's
  test case, so it is not out of v1; it stays refused in the price verdict until promoted (two
  independent shopper reports clearing the existing thresholds, RULINGS.md, "Product identity and
  catalogue matching").

## Learnings log

- 2026-09-03 — Created with the repo. Step 1 exists because the pilot's one wrong-item failure
  was an identity failure that read as a price failure. Step 2's ordering exists because the
  first run inverted it and produced three false negatives, two of which were reversed the same
  day when he asked why those categories did not work.
