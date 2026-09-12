# Cashback and coupon apps

Read date for all sources below: 2026-09-11, unless a source carries its own date.

Control query run: "Rakuten cashback app" returned correct, known-current results (17M
members claimed, $4B paid out claimed, 3,500 partner brands, 1-10%+ cashback rates), confirming
the search tool surfaces real results for this class. Control passed.

Candidates found by name: 9 (Rakuten, Checkout 51, Caddle, Great Canadian Rebates, Ibotta,
Fetch Rewards, Drop, PayPal Honey, Reebee). Reebee turned out not to belong in this class (see
below). Opened in real depth: 5 (Rakuten's model, Checkout 51, Caddle, Great Canadian Rebates,
Drop), with search-level detail on Ibotta, Fetch Rewards, PayPal Honey, Reebee.

Zip.ca: searched for in two broader queries, no hit identifying it as a current grocery
cashback app. This is not proof it does not exist under this description; a dedicated
single-term search ("Zip.ca cashback", "Zip.ca rebate") was not run. Marked UNKNOWN, not
absent.

## Rakuten

Operates US, Canada, and internationally. Canadian availability confirmed:
https://apps.apple.com/ca/app/rakuten-cash-back-app/id723134859 (read 2026-09-11).

- Data source: online cashback runs on click-through affiliate tracking; in-store cashback ties
  to a linked payment card. Not a barcode or vision product-matching system.
- Identification: none in the barcode/photo sense; it is link and card-linked transaction
  matching.
- Model/pricing: no AI model disclosed. Free to the user, no membership fee. Business model
  (third-party estimate, not Rakuten-disclosed, labelled as an estimate): retailers pay Rakuten
  roughly 4-10% commission per completed sale; Rakuten passes back an estimated 50-70% of that
  to the user and keeps the rest. Example arithmetic from the source: a $200 purchase at 10%
  commission ($20) yields about $12 to the user, about $8 kept by Rakuten. Source:
  https://sharetribe.com/how-to-build/how-does-rakuten-make-money,
  https://financebuzz.com/how-rakuten-makes-money (read 2026-09-11). Marketing claim, labelled
  as such: "17 million members, $4B+ paid out" is Rakuten's own blog post
  (rakuten.com/blog), not independently verified here.
- ONE PART WORTH TAKING: automatic promo-code testing at checkout. At any retailer's online
  cart/checkout page, auto-test a small saved list of known promo codes and apply the best one
  with no user action. For Shin: at a grocery retailer's online checkout, auto-check for known
  promo or loyalty codes before the user pays.

## Checkout 51

Toronto-founded 2012, expanded to the US; about 150 Canadian retailers, about 400 US retailers.
Source: https://moneycrashers.com/checkout-51-review (read 2026-09-11).

- Data source: brand and retailer partnerships that pay to run rebate offers; the specific
  commission or per-offer fee is not disclosed in the source read. UNKNOWN beyond that.
- Identification: three distinct mechanisms in the same source:
  1. Receipt photo (date, store, total, claimed offers), matched by OCR or manual review, not
     specified which.
  2. In-app barcode scanner, triggered only when a specific offer needs strict SKU
     verification.
  3. Loyalty-card linking, which auto-matches purchases with no receipt photo at all.
- Model/pricing: no AI model disclosed. Free; payout $0.50-$5.00 per claimed item, $20 cash-out
  threshold via cheque or PayPal.
- ONE PART WORTH TAKING: selective barcode scanning. Only force a barcode scan when an offer
  needs strict SKU-level matching; fall back to cheaper receipt-OCR matching otherwise. For
  Shin: do not force a barcode scan on every check if a lighter method (photo/OCR) is
  sufficient for that class of item.

## Caddle

Canada-only. Source: https://canadianfreestuff.com/caddle-works-canada-rebates (read
2026-09-11). Offers refresh weekly (Thursdays per the source).

- Data source: brand partnerships for marketing and purchasing-behaviour insight, plus a second
  revenue lane of paid surveys, ad-watching, and reviews. The exact receipt-processing mechanism
  (OCR vs manual review) is not specified in the source read. UNKNOWN.
- Identification: receipt photo upload, verification "up to 48 hours" (implies human or
  semi-automated review, not confirmed which).
- Model/pricing: no AI model disclosed. Free; $20 cash-out via cheque; $1.00 per referral
  disclosed. Dragons' Den appearance is a media fact, not a financial disclosure, labelled as
  such.
- ONE PART WORTH TAKING: Caddle sells aggregated purchase-behaviour insight to brands as a
  distinct revenue stream, separate from the rebate payouts themselves. For Shin: anonymized,
  aggregated "what people are actually paying at store X" data has standalone value to brands
  and retailers once there is real scan volume, a possible second revenue lane.

## Great Canadian Rebates

Canada-specific cashback app positioned as a Canadian-brand counterpart to Rakuten. Source:
https://apps.apple.com/ca/app/great-canadian-rebates/id1542374356 (read 2026-09-11).

- Data source: none in the price/product sense; this is a click-through/redirect cashback model
  like Rakuten, not a scanner. Retailer commission rate not disclosed in the listing.
- Identification: none; belongs in this class as a cashback comparator only.
- Model/pricing: no AI model disclosed. Free; monthly payout via PayPal, e-gift card, or direct
  deposit.
- Independent finding (not marketing): the same App Store listing's reviews (read 2026-09-11)
  show a pattern of unresolved rebate disputes, including one user describing a three-month
  investigation ending in denial. This is an independently observed complaint pattern, not a
  vendor claim.
- ONE PART WORTH TAKING: none strong as a feature; the actual takeaway is a caution, not a
  feature. Dispute-resolution and an audit trail need building in from day one, or do not
  promise a rebate/verdict that cannot be backed up when challenged.

## Ibotta

Confirmed US and Puerto Rico only, NOT available in Canada. Two independent sources:
https://savvynewcanadians.com/ibotta-vs-rakuten and search-aggregated confirmation that it does
not appear in the Canadian app store (read 2026-09-11). Not opened in full depth (search-level
detail only) given confirmed no Canadian presence.

- Data source: brand-funded offers; retailer commission rate not found in sources read.
  UNKNOWN.
- Identification: in-app barcode scan pre-purchase, in-aisle, checked against active offers
  with an immediate match/no-match signal; plus post-purchase receipt photo for redemption.
- Model/pricing: no AI model disclosed. Free; cash or gift-card payout.
- ONE PART WORTH TAKING: real-time, pre-purchase, in-aisle barcode scanning with an immediate
  green-check or red-x, rather than after-the-fact receipt review. This is the closest analog to
  Shin's own core loop (scan now, get an answer now) found in this class.

## Fetch Rewards

Confirmed US only. Source: search-aggregated ("if you live in Canada, you cannot get the app"),
consistent across cnbc.com and fetch.com/faq (read 2026-09-11). Not opened in full depth given
confirmed no Canadian presence.

- Data source: not independently verified beyond search snippets. UNKNOWN.
- Identification: receipt photo scan, any store, any receipt; points on the whole receipt plus
  bonus points on specific partner brands.
- Model/pricing: no AI model disclosed. Free; points redeemable for gift cards. Brand
  commission rate not disclosed in sources read.
- ONE PART WORTH TAKING: reward every receipt a little, not only matched offers, as a retention
  mechanic that lowers the bar to open the app even with no specific deal active.

## Drop

Toronto-founded, available in both US and Canada. Source:
https://frugalforless.com/drop-app-review (read 2026-09-11).

- Data source: none in the receipt/barcode sense. Drop links to a user's bank or card account
  via login credentials and infers purchases from transaction data (merchant-name matching),
  fully passive. Retailer commission rate explicitly not disclosed in the source read
  ("the article provides no transparency regarding Drop's specific commission rates").
  UNKNOWN.
- Identification: bank-transaction inference, no scan and no photo at all.
- Model/pricing: no AI model disclosed. Free to the user.
- ONE PART WORTH TAKING: full passivity via bank-linking removes all user action, at the cost of
  a much higher trust and security bar than a camera scan. Useful to Shin only as a reference
  point for where a camera-scan app sits on the effort spectrum, not as something to copy
  (Shin's model is deliberately camera-first, not bank-linked).

## PayPal Honey

Global, browser-extension-first (Chrome, Safari, Firefox, Edge, Opera) plus a mobile app.
Source: https://paypal.com/us/money-hub/article/guide-to-using-paypal-honey and the Chrome Web
Store listing (read 2026-09-11).

- Data source: none in the receipt/barcode sense; this is online promo-code testing at checkout
  plus a price-history tracker ("Droplist") watching a product over a rolling 30/60/90/120-day
  window, and multi-seller price comparison specifically on Amazon.
- Identification: none; browser-based checkout automation, not a scan of any kind.
- Model/pricing: no AI model disclosed. Free to the user; PayPal-owned, monetized via affiliate
  commission from merchants when a Honey code is used, plus PayPal Rewards points on qualifying
  purchases with no code. Exact commission rate not disclosed in sources read. UNKNOWN.
- ONE PART WORTH TAKING: a standalone per-SKU price-history watchlist with drop alerts,
  independent of any specific store. This is directly adjacent to Shin's price-checking core:
  track a product's price over time and surface "this is a new low" or "it was cheaper three
  weeks ago" as a distinct feature from the point-of-scan verdict.

## Reebee (checked, does not belong in this class)

Canada, founded Kitchener ON 2012, acquired by Flipp in 2022. Source:
https://apps.apple.com/ca/app/reebee and https://savvynewcanadians.com (read 2026-09-11).

Finding: Reebee does not do cashback or rebates. It is a flyer-aggregation and
price-comparison app (95+ Canadian retailers claimed) with a shopping list and loyalty-card
storage. Multiple sources state it has no digital coupons or cashback and is commonly "stacked
with Checkout 51 or Caddle" by users for the missing rebate layer. Logged here rather than
force-fit into this class; it belongs under flyer aggregators instead.

## Data sources not verified in this pass

- Checkout 51's fee/commission charged to brands.
- Caddle's exact receipt-processing mechanism (OCR vs manual review).
- Drop's retailer commission rate (source states this is not disclosed anywhere it checked).
- Ibotta's brand commission rate.
- PayPal Honey's affiliate commission rate.
- Zip.ca as a grocery cashback app: no hit in two broad searches; needs one dedicated search
  before concluding either way.

## Marketing claims, labelled separately from independent sourcing

- Rakuten's "17M members, $4B+ paid out" is Rakuten's own blog claim, not third-party verified
  here.
- Caddle's Dragons' Den appearance is a media fact, not a financial disclosure.
- Great Canadian Rebates' app-store description ("replicates GreatCanadianRebates.ca") is
  vendor-written; the independently found counter-signal is the unresolved-dispute pattern
  visible in that same listing's reviews.
</content>
