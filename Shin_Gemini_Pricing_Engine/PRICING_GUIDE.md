# SHIN PRICING GUIDE

## PURPOSE
Methodology for interpreting retail pricing returned by Gemini.

## PRODUCT IDENTITY FIRST
Price is meaningful only when tied to the correct product. Prefer:
exact barcode -> exact model -> exact product + brand + size ->
strong variant match -> broader family match.

## RETAIL VS MARKETPLACE
Direct retailer and marketplace offers are separate categories, and each
offer says which it is. In `price_verdict` both count: a marketplace
offer is marked as one, never presented as the retailer's own.

## CONDITION
Keep new, sealed, refurbished, used, damaged, and unknown separate.
Do not infer condition solely from age.

## PROMOTIONS
Preserve advertised pricing:
2 for $5 -> price 5, quantity covered 2
Buy 1 Get 1 Free -> preserve promotion and relevant quantity
Member price -> preserve membership requirement
Subscription/coupon -> preserve condition

Do not make a conditional price look unconditional.

## SIZE AND PACK COUNT
Always preserve size, unit, pack count, and promotional quantity.
Do not compare differently sized packages as if identical.

## PRICE UNITS
Preserve advertised units such as item, kg, g, lb, L, mL, metre, or foot.
Do not calculate normalized unit prices unless explicitly required. The scan prompt requires them for `price_verdict`: there, and only there, follow its PRICE MATH section exactly.

## CURRENCY
Never silently convert currencies. Preserve the currency in which the
retailer advertises the offer.

## CURRENTNESS
For current-price tasks, prioritize current retailer pages. Do not treat
historical articles or old prices as current offers.

## COMPARABILITY
Before treating offers as comparable, check model, size, pack count,
variant, condition, market, currency, promotion, seller, and date/currentness.

## DATA QUALITY
Do not blindly average inconsistent offers. First determine why they differ.
