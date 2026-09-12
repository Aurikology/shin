# Price tracker apps

Read date for all sources below: 2026-09-11, unless a source carries its own date.

Control query run: "camelcamelcamel price tracker Amazon" returned camelcamelcamel.com's own
homepage, a ProductHunt listing, and three independent how-to/review sites with consistent,
specific detail (free tiers, country coverage, the Camelizer extension). This confirms the
search channel can find known, well-documented results, so a thin result on any app below is a
property of that app's own disclosure, not a search failure.

Candidates found by name: 18 (CamelCamelCamel, Keepa, ShopSavvy, PayPal Honey's price-history
feature, Distill.io, PricedOut.ca, RetailRadar.ca, GroceryPulse.ca, Groceries Tracker, "Barcode
Scanner for Walmart", "Price Tracker for Walmart", "Price Tracker for BestBuy", Flipp (a flyer
aggregator, adjacent not identical, covered in its own file), idealo, PriceSpy, Slickdeals
price tracking, Google Shopping price tracking, Price2Spy/Prisync (B2B monitoring, adjacent
category)). Opened in depth: 7 (CamelCamelCamel, Keepa, ShopSavvy, GroceryPulse.ca, Groceries
Tracker, PricedOut.ca, RetailRadar.ca). "Frenzy" was searched by name per instruction; the only
match, "Frenzy Go," is a hyperlocal delivery app, not a price tracker, noted rather than left as
a silent gap.

idealo, PriceSpy, Slickdeals, and Google Shopping were confirmed to exist as real services in
this class but not fetched/read in depth in this pass (time budget went to the apps closest to
Shin's grocery/retail barcode use case). All fields for them are UNKNOWN, not "no data
source" - that would misstate a time-budget choice as a fact about those apps.

## CamelCamelCamel

Operates US, with coverage extended to Germany, Australia, Canada, Spain, France, Italy, UK
per its own homepage text (https://camelcamelcamel.com/, read via search cache 2026-09-11;
direct fetch returned HTTP 403 twice, so the company's own explanation could not be read
firsthand).

- Data source: secondary sourcing (a Quora answer and a data-scraping blog, aggregated via
  search) says it runs "a custom API to track and update product prices from Amazon and
  third-party vendors," and separately that "Amazon funnels the data" to it, per a Bloomberg
  citation on a third-party site (https://titannetwork.com/camel-camel-camel/, read
  2026-09-11). LABELLED AS THIRD-PARTY CLAIM, not confirmed on the company's own page (which
  could not be reached). The two secondary sources partly disagree (scraping vs an informal
  Amazon data relationship). UNKNOWN which is true, or whether both apply.
- Identification: Amazon product page/ASIN via the "Camelizer" browser extension, which
  overlays a price-history chart on the live Amazon page; no barcode scan, no independent
  catalog.
- Model/pricing: no AI model disclosed. Free to browse and view charts with no account; account
  required only for saved watches, email alerts, and the Wishlist Importer (per
  ProductHunt/GOBankingRates summaries, read 2026-09-11).
- ONE PART WORTH TAKING: let anyone view a product's full price-history chart for free with no
  account, and only require sign-in at the moment they want to set a threshold alert. This
  removes friction from the discovery/trust step and only asks for commitment where Shin would
  actually need to notify someone.

## Keepa

Global, Amazon marketplaces (US, CA, UK, DE, and others).

- Data source: Keepa's own API documentation (https://keepa.com/api-docs/, read 2026-09-11,
  reached via search-engine summary since a direct fetch to keepa.com returned 403) states it
  exposes "complete price histories, detailed product data, marketplace offers, deals, best
  seller lists and seller information," and notes a data-quality caveat: it "only shows the
  price if there is a change" (interpolates flat between changes). It does not name Amazon's
  PA-API as the source in the excerpt retrieved; the exact ingestion mechanism (official API vs
  crawl) is UNKNOWN from what was read.
- Identification: ASIN/product page primarily; the mobile app also has "a built-in barcode
  scanner to check online prices while in a retail store" (Apple App Store listing summary,
  read 2026-09-11).
- Model/pricing: no AI model disclosed. App free; Keepa PRO subscription reported at roughly
  EUR 29/month or EUR 290/year (about 17% off annually, EUR 24/month equivalent) per a
  third-party aggregator (https://revenuegeeks.com/software/keepa/pricing, read 2026-09-11) -
  third-party reporting, not Keepa's own pricing page (blocked), so treat the exact figure as
  likely-correct-but-unverified-at-source.
- ONE PART WORTH TAKING: an in-store barcode scan that looks up an already-built historical
  database, so the scan is a lookup, not a live re-crawl. Concretely: key every tracked product
  by barcode/UPC in addition to any retailer SKU, so a scan returns instantly from a
  pre-populated history table rather than waiting on a live fetch.

## ShopSavvy

US/Canada. Canadian availability confirmed:
https://apps.apple.com/ca/app/shopsavvy-barcode-scanner/id338828953 (read 2026-09-11).

- Data source: shopsavvy.com/app (fetched directly, 200 OK, read 2026-09-11) describes
  "real-time shopping intelligence" that "finds every retailer selling an item in real-time,
  then collects all the prices" - this is ShopSavvy's own marketing language and does NOT
  disclose the mechanism (crawl vs API vs partnership). UNKNOWN data source; the page simply
  does not say.
- Identification: camera barcode scan (UPC/EAN/ISBN/QR), keyword/brand/category text search,
  and share-sheet URL sharing from other apps into ShopSavvy.
- Model/pricing: no model disclosed. Page states "The Free Price Comparison App for iPhone &
  Android"; no paid tier disclosed on this page.
- ONE PART WORTH TAKING: OS share-sheet integration - a product URL copied from Amazon, Walmart,
  or a retailer app opens directly into a "track this" flow instead of requiring the user to
  search again inside the app. Concrete for Shin: register a share-target/deep-link handler for
  this.

## GroceryPulse.ca

Canada, 13 cities (Vancouver, Calgary, Edmonton, Saskatoon, Winnipeg, Toronto, Ottawa,
Montreal, Quebec City, Moncton, Halifax, Charlottetown, St. John's). The most methodologically
transparent app found in this class.

- Data source: grocerypulse.ca (fetched directly, 200 OK, read 2026-09-11) states plainly on
  its own page: "Data from public retailer websites. Not affiliated with any retailer." This
  is a first-party, explicit statement of method (a crawl of public retailer sites) - the
  clearest-sourced app found in this whole class. Prices gathered weekly (Thursdays, with
  Friday catch-up runs) across "22 banners across 6 retailer families" (about 160 stores),
  explicitly excluding Walmart and Costco.
- Identification: a fixed, standardized basket of 50 everyday grocery items tracked identically
  at every location; a store is only ranked if at least 48 of 50 basket items are matched.
- Model/pricing: no AI model disclosed. Consumer tool free, "no accounts and no paywalls"; a
  Commercial API/Team Data program monetizes institutional access.
- ONE PART WORTH TAKING: the fixed comparison basket for apples-to-apples store ranking.
  Concretely: define one canonical basket, price it identically across every tracked banner
  every week, and only surface a "cheapest store" ranking when a store has priced at least
  about 96% of the basket - this avoids ranking stores off partial or mismatched coverage.

## Groceries Tracker

Receipt-based, Canada-relevant.

- Data source: per a third-party aggregator (groceriestracker.com/blog, read 2026-09-11,
  quoting the app's own copy), this is receipt OCR, not a crawl: "Scan your receipt and see
  which store charges more for the same items," with automatic line-item OCR plus a
  manual-entry fallback (20 hand-entered receipts/month on the free tier). This is the app's
  own marketing copy relayed by a third-party blog, not read directly at the source, so treat
  the literal OCR claim as likely-accurate-but-secondhand.
- Identification: whatever a receipt line item says; the mechanism for cross-store item
  matching is not disclosed in what was read. UNKNOWN.
- Model/pricing: no AI model named. Free tier (13 receipt scans, 20 hand-entered/month, groups
  of 2, history never expires); paid tier for unlimited tracking.
- ONE PART WORTH TAKING: ground-truth price history built from what people actually paid, not
  advertised or flyer prices. Concretely: an OCR-to-catalog pipeline where a scanned receipt
  line item is matched to a canonical product record and becomes a first-party price point -
  this captures in-store-only discounts a crawl would miss.

## PricedOut.ca

Data source could not be verified. Direct fetch of pricedout.ca (200 OK, read 2026-09-11) only
says it is an "Open source Canadian grocery price tracker" covering Loblaws, No Frills,
Walmart, Sobeys, Metro, Superstore, FreshCo, Food Basics. No statement anywhere on the page
about crawling, an API, a retailer partnership, or user submissions, and no pricing
information. UNKNOWN data source and UNKNOWN pricing - a real gap in disclosure, not a search
failure (the page was fully readable). Since it says "open source," a follow-up worth doing
later is searching its GitHub repo directly for a scraper, which would resolve this from
primary evidence.

## RetailRadar.ca

Data source could not be verified. Direct fetch of retailradar.ca (200 OK, read 2026-09-11)
only says it "compares recently observed prices across major Canadian retailers" (Best Buy
Canada, Canadian Tire, Walmart Canada, Costco Canada, Home Depot Canada) and helps "find price
drops, review price history, and create alerts." No mechanism, no pricing disclosed. UNKNOWN
data source and UNKNOWN pricing.

## Summary: verified vs claimed

- First-party, explicit method statement: only GroceryPulse.ca ("Data from public retailer
  websites"). Strongest single sourcing statement found in the class.
- First-party but mechanism-vague: Keepa (own API docs describe data available, not how it is
  gathered), ShopSavvy (own site says "real-time," no mechanism).
- Blocked at the primary source, relying on secondary reporting: CamelCamelCamel (site returned
  403 twice; the Amazon-partnership claim is a Bloomberg citation on a third-party blog,
  unconfirmed).
- No mechanism disclosed anywhere found: PricedOut.ca, RetailRadar.ca.
- Different data class entirely (receipt OCR, not crawl): Groceries Tracker - the one genuinely
  different sourcing model in the set, and the most directly relevant "one part worth taking"
  for Shin if it wants ground-truth prices rather than advertised ones.
</content>
