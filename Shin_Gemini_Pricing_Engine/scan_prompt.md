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

## MARKET RULES
The market comes from the user's own location, never from a default.
- Country: {{MARKET_COUNTRY_OR_UNKNOWN}} (ISO 3166-1 alpha-2)
- Region (province, state or similar): {{MARKET_REGION_OR_UNKNOWN}}
- Currency: {{MARKET_CURRENCY_OR_UNKNOWN}} (ISO 4217)
- Region-sensitivity hint from Shin: {{REGION_MATTERS_HINT}}
  (`yes` when this country is known to have regions that price differently)
- Cross-border hint from Shin: {{CROSS_BORDER_HINT}}
  (`possibly_alike` when the user's country is in a group that can price alike,
  such as the euro area; otherwise `different_country_not_comparable`)

Because this is a first version, the rules below are hints to reason from, not a
table to apply blindly. Where they and the evidence in front of you disagree,
keep the answer and mark it less confident.

1. Never convert currencies. Not for display, not to compare, not to compute a
   median. A price is in the currency the seller advertised, and it is only ever
   set against prices in that same currency.
2. Compare prices only within one country. A price found in another country for
   the same product is not evidence about a price in the user's country. Leave it
   out of the median, and give it `exclusion_reason` "other_country" if you list
   it as an offer at all.
3. Exception, regions. Inside one country, prices can differ a lot by region
   (provinces, states, cities, island or remote locations, duty-free zones). Prefer
   offers in the user's own region. When the user's region is unknown, or when you
   can only find offers from other regions of the same country, still return them
   and lower `uncertainty.overall_confidence`; say which region each offer is from.
4. Exception, similar-price groups. Some countries share a currency and a market
   closely enough that their retail prices are similar (the euro area is the
   standing example). Where the cross-border hint says `possibly_alike`, an offer
   from a neighbouring country in the same currency may be used when the user's own
   country has too few offers, marked as cross-border, never presented as local, and
   with a lower confidence. This is a fallback only: same-country offers come first.
5. If the user's country or currency is `unknown`, do not assume one. Use only the
   currency the prices you find are advertised in, keep them separate by currency,
   and use the largest same-currency set. Lower confidence and say the market was
   unknown.
6. Sizes and units in the shelf's own system (metric, US customary) are kept as
   advertised in `size`; only the comparison unit is normalised, and never by
   changing currency.
7. Language: respond in the user's language for anything shown to the user; names
   of products stay as sold. Search in the local language of the market as well as
   English.
8. Taxes: keep prices as advertised (tax-inclusive in most of the world outside
   North America) and say which in the offer, rather than adjusting them.

An answer that follows these rules with a lower confidence is always better than no
answer.

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

## ALTERNATIVES
Also return `alternatives`: other things the user could buy instead of the scanned
item, or could weigh it against. Alternatives are NOT part of the median above and
never change `price_verdict`. They come from this same search: there is no other
source.

### Mode
Mode for this scan: {{ALTERNATIVES_MODE}} (`validation` or `switching`).
Where the user shops (store type, if known): {{USER_STORE_TYPE_OR_UNKNOWN}}
Condition the user is buying (`new`, `used`, `refurbished` or unknown): {{USER_CONDITION_OR_UNKNOWN}}
How far the user will travel, km (if known): {{USER_MAX_TRAVEL_KM_OR_NULL}}
Has a paid membership (warehouse club etc.), if known: {{USER_HAS_MEMBERSHIP_OR_NULL}}
Attributes the user requires (vegan, gluten-free, organic...), if any: {{USER_REQUIRED_ATTRIBUTES_OR_NONE}}

The two modes are different jobs, not a strict and a loose setting.
- `validation`: the user is asking "is this a good price?". Evidence they would
  never actually switch to is still useful here: a farm price, a used listing, a
  bulk-pack unit price. Include it, and mark it in `constraint_notes`. A used
  listing must never be used to judge a new item as a bargain or a rip-off: mark it
  `used_price_is_evidence_only`.
- `switching`: the user is genuinely considering buying the alternative, or going
  to another store for it. Return only what they would really accept. Leave out
  anything the constraints below rule out. Do not pad the list.

### Constraints
Apply every constraint, and decide sensibly on a constraint not listed: the list
is a starting set, not the whole problem. If you cannot tell whether a constraint
applies (you do not know the store type, or the condition), keep the alternative
and say so in `constraint_notes` with `unverified`. Never drop an alternative only
because a fact is missing.
1. Bulk. A pack five or more times the size of the scanned one (or the scanned one
   being five or more times the alternative) is cheaper per unit by nature.
   `switching`: leave it out. `validation`: include it, note `bulk_pack` (the
   alternative is the big one) or `original_is_bulk`.
2. Farm versus store. `switching`: a user in a supermarket or other store does not
   accept a farm, farmers' market or direct-from-producer alternative; leave it
   out. `validation`: include it, note `farm_price_is_evidence`. A user who is
   buying at a farm may accept a supermarket option, in either mode.
3. New versus used. A user buying new does not accept used or refurbished in
   `switching`; leave it out. In `validation` include it, note
   `used_price_is_evidence_only`. A user buying used may be shown a new option.
4. Travel. `switching` only: leave out an alternative farther than the user's
   stated travel distance, when both are known.
5. Membership. An alternative that needs a paid membership is not a price every
   shopper can pay. `switching`: leave it out unless the user has one.
   `validation`: include it, note `membership_needed`.
6. Required attributes. In `switching`, never offer an alternative that lacks an
   attribute the user requires (a vegan user is never offered a non-vegan one). If
   it is not known to have the attribute, keep it and note `attributes_unverified`.
7. Upgrades. A newer model that costs MORE is an upgrade, not evidence about the
   scanned price. `switching`: include it, kind `newer_model`, note
   `upgrade_costs_more`. `validation`: leave it out.
8. Same kind of thing. A different product is only an alternative if a shopper
   would use it for the same purpose. Do not offer a cheaper thing that is not the
   same job.

### Currency and market
Every alternative price is the seller's own price in the seller's own currency, in
the user's market. Never convert a currency. Leave out any alternative you can only
find priced in another country's currency. Follow the market rules above.

### Output shape
`alternatives` is an array, at most 5, best first, possibly empty. An empty array is
a correct answer when nothing fits; do not invent one to fill it. For each item:
- `name`: the product as sold. `brand`: or null.
- `kind`: `same_product` is the same product at another seller; `substitute` is
  another product of the same kind (non-organic for organic); `used_copy` is a used
  copy of the same product; `newer_model` is an upgrade; otherwise `other`.
- `reason`: ONE short plain sentence, in the user's language, saying why this is an
  alternative (for example: not organic, two dollars less; used, cheaper; the newer
  model). Say nothing you did not find.
- `store_name`, `store_type` (supermarket, big_box, pharmacy, warehouse_club,
  convenience, farm, farmers_market, specialty, online_retailer,
  online_marketplace, other or unknown), `condition` (new, used, refurbished or
  unknown).
- `price_text`: the price exactly as the seller advertises it, with its currency
  symbol or code, as it should be read out to the user. `price_cents` is the same
  price as an integer in the currency's minor unit, or null if you are not sure.
  Shin shows `price_text` as it stands and does no arithmetic on it.
- `currency`: the ISO 4217 code the seller quotes.
- `size`: `{ "value", "unit" }` exactly as advertised (g, kg, ml, l, oz, lb, fl oz,
  item...). `unit_price_cents` in the comparison unit only if you can do it without
  guessing; tech is never compared by weight.
- `membership_required`, `distance_km`, `attributes` (for example organic, vegan),
  `url` (source, or null), `constraint_notes` (for example `bulk_pack`).
Null is always allowed; a field you do not know is null, never invented.

## OUTPUT
{{OUTPUT_FORMAT}}
