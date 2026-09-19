# SHIN SINGLE-SCAN PROMPT TEMPLATE

Analyze ALL supplied scan information together.

## SCAN TYPE
{{SCAN_TYPE}}

## BARCODE
{{BARCODE_OR_NULL}}

## USER MARKET
Country/market: {{MARKET}}
Currency: {{CURRENCY}}
Language: {{LANGUAGE}}

## USER INPUT
Shelf price: {{SHELF_PRICE_OR_NULL}}
Additional user information: {{USER_INPUT_OR_NULL}}

## USER PRICE RANGE
These are the user's own boundaries, set by the user, and they are
authoritative for this scan ({{THRESHOLDS_SOURCE}}):
Under line: {{UNDER_PCT}}% below the median
Over line: {{OVER_PCT}}% above the median
Use exactly these two numbers in the price math below. Never substitute
your own.

## IMAGE
{{IMAGE_NOTE}}

## TASK
Identify the scanned product as accurately as possible.

If a barcode is supplied, use the exact barcode as a primary search
signal. If an image is supplied, inspect it for product name, brand,
model, variant, size, pack count, specifications, barcode, condition,
and identifying text.

When Google Search is available:
1. Search the exact barcode when available.
2. Confirm identity against image and other evidence.
3. Search current relevant retail offers in the user's market.
4. Distinguish direct retailers from marketplace sellers.
5. Preserve advertised currency and pricing structure.
6. Find customer review information when available.
7. Return supporting source information.

Do not invent missing information.
Do not silently convert currencies.
Do not treat marketplace, used, refurbished, auction, or historical
prices as equivalent to current direct retail offers.

## PRICE MATH (you do it; Shin does not)
Fill `price_verdict` and the per-offer `unit_price`, `in_median`,
`exclusion_reason`, `pct_vs_median` and `position` fields with this
procedure. Shin shows your numbers as they stand.
1. Comparison unit: per 100 g for weight, per 100 mL for volume, per item
   for everything else (count, electronics, clothing). Compare tech by
   model and specification, never by weight. Set `comparison_unit` to
   "100 g", "100 mL" or "item".
2. `unit_price` of each offer: its advertised price as a price for ONE
   item, then per comparison unit. "2 for 5" is 2.50 an item; buy one get
   one free halves the price; a by-weight price is converted to the
   comparison unit. Never convert currencies. Keep the original size in
   `size`, and give `size_value` and `size_unit` as advertised.
3. `in_median` is true only for a direct-retailer offer, in the user's
   currency, with no membership needed, of the same kind as the scanned
   item (same organic status, same store-brand kind, new against new),
   with a size that can be put on the same unit. Every other offer gets
   `in_median` false and a short `exclusion_reason` (member_only,
   marketplace, other_currency, no_size, different_organic,
   different_brand_kind, used_or_refurbished, other).
4. `median_unit_price` is the median of the `unit_price` of the
   `in_median` offers, and `offers_in_median` is how many there are. With
   fewer than 2, set `verdict_available` false and `no_verdict_reason` to
   "single_offer" or "no_offers_on_line"; with no shelf price given, the
   verdict can still be available and `shelf` is null.
5. `pct_vs_median` = (unit_price - median) / median * 100, for every
   `in_median` offer and for the shelf price. Null when not in the median.
6. The shelf price, when given, becomes `shelf.unit_price` on the same
   unit (borrow the size most offers share when the scanned size is
   unknown, and then set `size_assumed` true). `shelf.zone` is
   "under_your_line" when its pct is at or below minus the under number,
   "over_your_line" when above the over number, otherwise "middle".
   `shelf.label` is the quantity and price as sold, e.g. "6 x 355 mL, 4.49".
7. Positions for drawing: `span_pct` = the larger of the biggest absolute
   pct among the median offers and the shelf, 1.5 times the under number
   and 1.5 times the over number, rounded UP to a multiple of 5 (at least
   5). `position` = 50 + pct / span_pct * 50, for each `in_median` offer
   and for `shelf`. `zone_under_boundary` = 50 - under / span_pct * 50 and
   `zone_over_boundary` = 50 + over / span_pct * 50.
8. `confidence` is "thin" with only two median offers, otherwise "ok".
   `thresholds_used` repeats the two numbers you used.
Also set `uncertainty.overall_confidence` honestly: an answer you are not
fully sure of is still returned, marked by a low number.

## OUTPUT
{{OUTPUT_FORMAT}}
