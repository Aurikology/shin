# Resale comparison apps

Read date for all sources below: 2026-09-11, unless a source carries its own date.

Control query run: "StockX app" returned StockX's own store listings and press coverage,
confirming the search tool works for this class. Control passed.

Candidates found by name: 10 (StockX, GOAT, Flyp, Vinted's price-suggestion feature, Decluttr,
CeX plus third-party barcode scanners built on it, FlipAI/ScanFlip AI/FlipList AI, Poshmark
Smart Sell, Underpriced AI, FlipScan). Opened in real depth: 4 (StockX, GOAT, FlipAI,
Decluttr). Checked at feature/help-page level, not a full teardown: Vinted, Poshmark. Only
surface-searched, not opened: CeX, Underpriced AI, FlipScan, FlipList AI.

## StockX

Global marketplace: sneakers, streetwear, apparel, collectibles, watches, handbags,
electronics, trading cards.

- Data source: StockX is itself the exchange; prices come from its own buyers' and sellers'
  bids and asks, resolved into completed sales. Source: https://stockx.com/news/stockx-android-app-now-available/
  (read 2026-09-11), which describes placing a bid/ask the same way as on stockx.com and a
  "price guide" tracking market value. Fetching stockx.com/about for the exact bid/ask
  calculation method (e.g. weighting recent sales vs live asks) returned thin, unusable content
  (403-adjacent). The general "it's their own transaction data" claim is well established but
  the precise formula is UNVERIFIED here.
- Identification: browse/search by model name or SKU; this is a marketplace app, not a
  scan-in-the-field app.
- Model/pricing: no ML pricing model claimed; price is the market-clearing price on their own
  exchange. Free to browse; a seller transaction fee plus processing fee applies at sale, not
  itemized in the pages opened (flagging as unsourced for this report).
- Marketing claim, labelled: "real-time market data" is StockX's own language, not
  independently verified beyond what the app displays.
- ONE PART WORTH TAKING: show an actual live bid/ask spread plus last-sale price (low, median,
  high recent sale) instead of one point estimate. This is a more calibrated presentation and
  maps directly onto Shin's own calibration priority: give a range, not a single confident
  number.

## GOAT

Global marketplace, same buy/sell/authenticate model as StockX, sneakers/apparel/collectibles.

- Data source: GOAT's own marketplace transactions (same exchange model as StockX). Source:
  https://support.goat.com/hc/en-us/articles/115004770188-How-does-GOAT-work and
  https://www.goat.com/verification (both read 2026-09-11). Independent confirmation the
  pricing itself is exchange-native and publicly scrapable: a commercial scraper
  (https://apify.com/ruslanzotkin/goat-resale-price-scraper, read 2026-09-11) sells access to
  "retail, resale lowest ask, instant buy-now, and computed premium per model" pulled from
  GOAT's public pages.
- Identification: browse/search, plus physical authentication on receipt (not app-side
  scanning). GOAT's own verification page claims "digital authentication, hands-on
  verification, and machine learning technology" and "hundreds of thousands of data points" for
  counterfeit detection. LABELLED AS MARKETING: this is GOAT's own claim about its own process,
  not independently verified.
- Model/pricing: ML used for authenticity/counterfeit detection per the claim above, not for
  price prediction (pricing is bid/ask on their exchange). Free to browse; commission fee
  25-30% depending on price tier for "GOAT Clean" resale, per a third-party review
  (mywifequitherjob.com, read 2026-09-11) - secondary-sourced, not GOAT's own fee page.
- ONE PART WORTH TAKING: pair a physical or ML authentication signal with the price display, so
  the number itself carries a trust flag. For Shin: flag "condition unverified" as a confidence
  discount on any price comp shown to the user, rather than presenting a bare number.

## FlipAI (same product family as ScanFlip AI, FlipList AI)

US-centric reseller tool covering eBay, Poshmark, Mercari, Amazon; not a marketplace itself.

- Data source: names eBay, Poshmark, Mercari, Amazon as the platforms it pulls "real sold
  prices" from, and states it is "Powered by Amazon SP-API" for the Amazon leg specifically -
  a named, real API partnership. Source: https://flipai.app/whats-it-worth and
  https://flipai.app/features (both read 2026-09-11). The eBay/Poshmark/Mercari sourcing
  method (official API vs scraping) is NOT stated on either page fetched. UNVERIFIED for those
  three; only the Amazon leg has a named source.
- Identification: photo scan (works without a barcode) or barcode scan; AI extracts "brand,
  model, year, size, variant, any stamps or markings" per the same page. No underlying model
  name (e.g. GPT-4V, custom) is disclosed.
- Model/pricing: generic unnamed "AI." Free tier = 10 lifetime scans; Pro = $9.99/mo unlimited
  scans; Power Seller = $14.99/mo (batch scanning, price alerts, weekly reports). Source:
  flipai.app/whats-it-worth, read 2026-09-11.
- CALIBRATION FLAG: the page states its valuation is the "median of what identical items have
  actually sold for in the last 30 to 90 days, adjusted for condition and completeness" with a
  "confidence score," stated as fact with no accuracy disclaimer or margin-of-error language.
  This is exactly the kind of confidently-stated number that should not be copied verbatim
  without Shin's own arithmetic behind it.
- ONE PART WORTH TAKING: the shape of attaching a confidence score to each estimate (value plus
  confidence, not just value) is right; the specific confidence math behind FlipAI's own score
  is unverified and should not be copied, only the shape.

## Decluttr

US/UK trade-in service (buys the item directly from the user, resells at markup; not a peer
marketplace).

- Data source: described by third-party reviews (androidpolice.com, dollarsprout.com,
  thepennyhoarder.com, all read 2026-09-11) as "AI and real-time market data." Could NOT verify
  this from Decluttr's own site: fetching
  support.decluttr.com/hc/en-gb/articles/4852049333650 returned HTTP 403. So the "AI +
  real-time market data" description is THIRD-PARTY CHARACTERIZATION only. One review
  (dollarsprout.com) states directly: "Decluttr isn't transparent about how their pricing
  algorithm works" - a relevant calibration finding: even independent reviewers cannot verify
  Decluttr's method.
- Identification: model search/typing (e.g. "iPhone 15") on web/app, or barcode scan via phone
  camera in the mobile app.
- Model/pricing: unnamed "AI" per third-party coverage only, not confirmed by Decluttr itself in
  what was accessible. Free instant valuation, locked for 28 days; no fee to the seller
  (Decluttr's revenue is its own resale markup, not a fee model).
- ONE PART WORTH TAKING: a 28-day price lock on a quoted value. Concrete and buildable for
  Shin: lock a comp-based value for a stated window so the number the user saw does not
  silently drift while they decide.

## Vinted (feature-level check, not a full app teardown)

Europe-centric peer marketplace (France, UK, Germany, etc.) with a price-suggestion tool for
sellers listing an item.

- Data source claim, flagged as CONTRADICTED: a third-party blog (blog.vinta.app, read
  2026-09-11) states "Vinted's own auto-suggested prices run 10 to 15 percent below actual
  market medians." Vinted's own help center page (vinted.com/help/10/258, read 2026-09-11)
  does not describe any automated price-suggestion algorithm at all, only a manual buyer/seller
  "Make an offer" negotiation feature capped at 40% off. This is a direct contradiction: either
  the documented feature changed, the third-party claim describes a different or older feature,
  or the claim is simply wrong. UNVERIFIED, not resolved here.
- Not opened deep enough to extract a buildable mechanic with confidence.

## Poshmark (feature-level check, not a full app teardown)

- Smart Sell: seller sets a private floor price; the app auto-accepts offers at or above it and
  counters low ones. Source: secondary (poshsidekick.com, exportyourstore.com, read
  2026-09-11) citing Poshmark's own help content; Poshmark's own help page was not fetched
  directly, so this is SECONDARY sourcing.
- Notable per the same secondary sources: Poshmark does not expose sold-listing browsing the
  way eBay does, so sellers rely on third-party tools (e.g. Underpriced AI) for comps. This is a
  real product gap worth naming for Shin (a platform withholding its own sold data creates room
  for a comps layer on top), but Poshmark's app itself was not independently opened to confirm
  the data is actually absent.

## Not opened (surface search only)

- CeX: official app has an in-store barcode scanner tied to CeX's own buy/sell prices;
  unofficial third-party scanners (Chex, "Barcode Scanner for CEX") piggyback on CeX's public
  pricing pages. Does not appear to operate in Canada per the CeX country list surfaced in
  search (read 2026-09-11) - this is a gap in the Canadian competitive set as searched, not
  proof CeX has zero Canada presence; cex.com's own store locator was not checked directly.
- Underpriced AI / Underpriced.app: claims to pull sold data from Poshmark, eBay, Mercari "in
  one scan"; not independently verified beyond underpricedai.com's own marketing pages.
- FlipScan: $9.99/mo after a 3-day trial per flipscan.app marketing copy in search results; not
  opened.

## Data sources not verified in this pass

- StockX's precise price-calculation formula (beyond "it's their own bid/ask exchange").
- GOAT's fee schedule (third-party review sourced only).
- FlipAI's actual method for pulling eBay/Poshmark/Mercari data (no named API unlike the Amazon
  leg).
- Decluttr's pricing algorithm (support page returned 403; even outside reviewers call it
  opaque).
- Vinted's auto-suggestion algorithm (contradicted by Vinted's own help page).
- Poshmark's Smart Sell mechanics and sold-comp visibility (secondary-sourced only).
- CeX's Canada footprint.
</content>
