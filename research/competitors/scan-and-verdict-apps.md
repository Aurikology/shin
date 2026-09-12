# Scan-and-verdict apps

Read date for all sources below: 2026-09-11, unless a source carries its own date. This class
is Shin's most direct competitor set. The 2026-09-03 research memo already named several of
these (OLMA, Underpriced AI, Price AI, Price Snap, Deal Hunter, Thrift AI, ReSell AI,
Underpriced.app, Value AI, Price Checker) without full data-source sourcing for most; this file
verifies and deepens that, and adds apps not on the original list.

Control query run: "OLMA scan compare app olmaapp.com" returned the correct App Store listing
(apps.apple.com/co/app/olma-scan-compare/id6790042890) and olmaapp.com as the top two hits.
Confirms search is retrieving real, current results. Control passed.

Candidate apps considered (surfaced across all searches): 20 - OLMA, Underpriced AI,
Underpriced.app, Price AI, Price Snap (com.appusta.ai.pricesnap), PriceSnap
(pricesnap.ai/price-snap.com, a separate product despite the similar name), Deal Hunter,
ThriftAI: Profit Identifier (com.fulcra.thriftai), Thrift Pal, ThriftValue AI, Thrift Scanner,
SnapPrice AI, "Resell AI" by Sean Amm (now a dead listing), ReSell AI: Value AI, Value AI: Item
Price Scanner, ResaleScan, Resellbot, Valuify, Price Checker: Price Scanner, plus several
generic barcode-only apps excluded from this class (Price Check Scanner, Store Price checker,
Barcode Scanner: AI & Prices) because they compare listed prices rather than render a fairness
verdict from a photo. Opened in depth (primary source fetched, not just a search snippet): 12 -
OLMA, Underpriced AI, Underpriced.app, Price AI, Price Snap, Deal Hunter, ThriftAI, ReSell AI,
Value AI, Price Checker, ResaleScan, PriceSnap (pricesnap.ai).

IMPORTANT NAME COLLISIONS to disambiguate before citing sourcing elsewhere in this repo:
- "Price Snap" the app (com.appusta.ai.pricesnap, iOS id6749811323) and "PriceSnap" the site
  (pricesnap.ai / price-snap.com) are DIFFERENT PRODUCTS with different mechanisms (subscription
  photo-scanner vs a free multi-modal UK-leaning tool).
- "Underpriced AI" and "underpriced.app" are disputed by at least one Hacker News commenter as
  copies of each other, not variants of the same company (see below). Not resolved here.

## OLMA (olmaapp.com, iOS/macOS/visionOS; developer Evan Kim)

- Identification: photo of item or price tag, or text search. No barcode.
- Data source: UNKNOWN beyond marketing. Its own site (olmaapp.com, read 2026-09-11) says only
  "OLMA identifies what you're looking at and runs a fresh web search for current prices from
  retailers" - no named retailer, API, or partner. The App Store listing
  (apps.apple.com/co/app/olma-scan-compare/id6790042890, read 2026-09-11) confirms photo/text
  input but names no data source either. Searched: official site, App Store listing, App Store
  developer page, Google Play data-safety page - none name a source. Genuinely unverifiable at
  the "how do you know" level; "fresh web search" is the only mechanism claimed, and it is a
  marketing claim, not a sourced one.
- Model: not disclosed anywhere found.
- Pricing: 5 free scans/month, no account required; OLMA Pro for unlimited scans (price shown
  only in App Store regional currency; a USD figure was not found).
- ONE PART WORTH TAKING: verdict against your two locations - it explicitly compares the price
  where you are against the price at home or a reference location, not just a generic market
  average. A distinct axis from competitors who only score against sold comps.

## Underpriced AI (underpricedai.com; Chrome/Firefox extension + Android app
com.underpricedai.android)

- Identification: photo of item.
- Data source: VERIFIED, unusually well for this class. The creator posted the tech stack
  directly on Hacker News (news.ycombinator.com/item?id=46478740, read 2026-09-11): "Next.js,
  Claude API for vision/analysis, eBay API for market research and listing." Its own docs page
  (underpricedai.com/docs, read 2026-09-11) adds that comparable-sales sourcing spans "eBay,
  Poshmark, Mercari, Facebook, Depop, and auction archives," with images stored in AWS S3 and
  marketplace connections via OAuth.
- Model: the Claude API (Anthropic) for vision/identification, disclosed by the creator on HN -
  a company-disclosed fact from a technical forum answering "how does this work," not marketing
  copy, but still self-reported, not third-party verified.
- Pricing: first scan free, no card; scan packs from $4 (no subscription), or $5/mo for 20
  scans.
- Caveat found: an HN commenter alleged Underpriced AI (this Android/extension product) is "a
  fake replica of an actual app - underpriced.app" and that "they copied the app, couldn't even
  come up with a new name" (same HN thread). Could not independently confirm which came first;
  flagged as an open dispute, not a resolved fact.
- ONE PART WORTH TAKING: auto-sync that pulls back "sale price, actual fees, and shipping
  charges" once an item actually sells on a connected marketplace - a feedback loop that could
  calibrate the app's own verdicts against real outcomes, not just against comps at the moment
  of the scan.

## Underpriced.app (a separate product from Underpriced AI, per the HN dispute above)

- Identification: photo, per its own marketing.
- Data source: its own blog (underpriced.app/blog, read via search 2026-09-11) states it "pulls
  completed sale data directly from eBay's Browse API." LABELLED AS A COMPANY CLAIM, not
  independently verified; no third-party source (dev blog, HN, docs) was found confirming this
  eBay Browse API claim the way Underpriced AI's HN post confirmed its own stack.
- Reviews: Trustpilot TrustScore 3.8/5 (trustpilot.com/review/underpriced.app, read 2026-09-11);
  12% one-star, citing unexpected subscription charges, a strict refund policy, and "estimates
  that were sometimes off" - independent user evidence that accuracy is inconsistent, which is
  consistent with any comps-based approach running on sparse data.
- Pricing: markets itself as "#1 free AI pricing app," 5,127+ users claimed (a marketing number,
  unverified).
- ONE PART WORTH TAKING: nothing distinct found beyond the eBay Browse API claim; functionally
  similar to Underpriced AI.

## Price AI (trypriceai.app)

- Identification: point camera at item (photo-based).
- Data source: marketing only. Its own site (trypriceai.app, read via search 2026-09-11) claims
  comparison "across 50+ retailers including Nike, Best Buy, Walmart, Target, and eBay" -
  retailer names given, but no API or partner named, so the mechanism (scrape? aggregator API?
  which one?) is UNKNOWN. Searched: official site only found via search snippet; no separate
  "how it works," support, or privacy page surfaced.
- Model: not disclosed.
- Pricing: 3-day free trial, then $9.99/mo or $39.99/yr, auto-charges unless cancelled 24h
  before trial ends (own site's terms, legal/marketing copy, not independently confirmed).
- ONE PART WORTH TAKING: an explicit "Deal Score" that factors in used/refurbished listings with
  condition labels, rather than only comparing new-to-new.

## Price Snap: AI Value Scanner (com.appusta.ai.pricesnap; iOS id6749811449, Android)

- Identification: photo, no barcode required.
- Data source: marketing claim from its own App Store listing
  (apps.apple.com/us/app/price-snap-ai-value-scanner/id6749811449, read 2026-09-11): sold-price
  data from "eBay, Poshmark, Depop, and more"; resale-platform integration also names
  "Poshmark, Mercari, and OfferUp." No API or partnership named, no independent confirmation
  found (unlike Underpriced AI's HN disclosure).
- Model: not disclosed.
- Pricing: free with in-app purchases; "Price Snap Pro Weekly $7.99," annual up to $59.99 (App
  Store listing).
- Rating: 3.95/5 (91 ratings); a review calls out an "aggressive 3-day trial" and a pre-use
  rating prompt (independent user evidence, not marketing).
- ONE PART WORTH TAKING: a separate "High/Medium/Low confidence" label attached to each
  estimate - a calibration signal shown to the user at the point of the verdict, close to
  Shin's own known-vs-unknown instinct.

## Deal Hunter: AI Shopping Deals (iOS id6760399719; developer Michal Strba)

- Identification: NOT photo-based. It tracks/searches listings across marketplaces and scores
  discounts; the App Store listing (apps.apple.com/us/app/deal-hunter-ai-shopping-deals/id6760399719,
  read 2026-09-11) does not mention a camera, barcode, or photo at all. FLAGGING THIS AS A
  PROBABLE MISCATEGORIZATION in the existing 2026-09-03 memo: this likely does not belong in
  the scan-and-verdict class and should be checked before being cited as a direct competitor.
- Data source: marketing claim only - "Amazon, eBay and StockX," no API/partner named.
- Model: not disclosed.
- Pricing: $1.99 one-time purchase - unusual in this set, no subscription.
- ONE PART WORTH TAKING: the one-time-purchase pricing model itself, which no scan app in this
  set uses; worth noting as a pricing option even though the product itself is not a direct
  scan competitor.

## ThriftAI: Profit Identifier (com.fulcra.thriftai; iOS id6746565278)

- Identification: photo.
- Data source: marketing only, and vaguer than most: "Our AI is trained on millions of actual
  sales from major secondhand marketplaces" (App Store listing, read 2026-09-11) - no
  marketplace named, no API named. Searched: App Store listing, an attempted separate
  developer site (none found distinct from the listing), a Google Play mirror page
  (finds.thriftai.thrifty, a different bundle ID, possibly an unrelated or copycat app, not
  confirmed same developer). This is the weakest-sourced app in the whole set, weaker even than
  OLMA (which at least names a mechanism, "web search"); ThriftAI names neither mechanism nor
  source.
- Model: not disclosed.
- Pricing: 3-day free trial, then $9.99/mo or $19.99-49.99/yr; add-ons "Multi Mode" $4.99,
  "Sell Through Rate" $19.99-39.99 (a la carte feature pricing, unusual in this set).
- Rating: 4.8/5 with 20K ratings (high volume), but reviews flag brand/artist misidentification
  and inconsistent valuations - an independent negative signal despite the high aggregate
  score.
- ONE PART WORTH TAKING: a la carte paid add-ons (sell-through rate sold separately) rather
  than one subscription tier - a monetization pattern worth considering even though the
  sourcing itself is weak.

## ReSell AI: Value AI (iOS id6757677053)

Note: the plain "Resell AI" by Sean Amm (id6749002508) returned a 404 on 2026-09-11 - that
listing is gone or delisted. Searched the App Store directly to confirm, no cached alternative
found. Treat the original memo's "ReSell AI" citation as referring to a now-dead app, unless it
meant this different one.

- Identification: photo.
- Data source: marketing claim from the listing (read 2026-09-11): target marketplaces "eBay,
  Poshmark, Mercari, Depop, and other platforms" - but this is framed as where you'd sell it,
  not explicitly as the sold-comp source for the valuation. The listing does not clearly state
  its price data comes FROM those platforms as opposed to just recommending them as sale
  channels. Data source: UNKNOWN/AMBIGUOUS pending a clearer disclosure; searched the App Store
  listing only, no separate site found.
- Model: not disclosed. Claims "AI-powered authentication" (counterfeit risk) as an unusual
  extra feature.
- Pricing: Weekly $2.99, Monthly $6.99, Yearly $19.99 - noticeably cheaper than Underpriced AI
  or Price AI.
- ONE PART WORTH TAKING: counterfeit/authentication red-flagging bundled into the same scan,
  not sold separately.

## Value AI: Item Price Scanner (iOS id6756802065)

- Identification: photo, with one-tap listing to eBay.
- Data source: marketing claim, but more specific than most: "live and recent resale data from
  platforms such as eBay, Facebook Marketplace, Mercari, OfferUp, and other resale platforms"
  (App Store listing, read 2026-09-11). Still no API or partnership named, but the platform
  list is explicit rather than vague.
- Model: "AI-powered item identification" and "real-time resale data powered by live market
  grounding" - no model name. A v1.8 changelog note claims "Major backend AI upgrade delivering
  ~60% better pricing and item accuracy" - an unverifiable self-reported number, no methodology
  given. LABELLED AS MARKETING.
- Pricing: Weekly $7.99, Monthly $12.99, Annual $99.99-124.99 - among the highest in this set.
- Explicit disclaimer in the listing: "Value.ai provides informational estimates only... does
  not guarantee sales, profits, or specific outcomes" - a liability-disclaimer pattern, useful
  to know app-store reviewers expect this framing.
- ONE PART WORTH TAKING: the disclaimer language itself is a template worth reusing in spirit
  for Shin's own verdict screen, to manage expectation without hedging the number shown.

## Price Checker: Price Scanner (iOS id6755660779)

- Identification: photo, explicitly "no barcode needed."
- Data source: UNKNOWN. Listing (read 2026-09-11): "advanced image recognition technology
  analyzes visual details to provide you with reliable price estimates based on current market
  data" - no retailer, marketplace, or API named at all, the vaguest disclosure in the group.
  Searched: App Store listing only; no separate company site found.
- Model: not disclosed.
- Pricing: Weekly $5.99-7.99, Annual $39.99; a review complains "Only 2 free scans."
- ONE PART WORTH TAKING: nothing distinct found; the least differentiated app in the set.

## PriceSnap (pricesnap.ai / price-snap.com - NOT the same product as Price Snap above)

- Identification: the most flexible input method found in this research - "Photograph the
  item, scan its barcode, or describe it in a few words" - photo, barcode, and text, plus
  receipt and grocery-list mentions found in search snippets.
- Data source: marketing claim, but names specific retailers rather than staying generic: "We
  search amazon, eBay, TESCO, ASDA +100s" (pricesnap.ai, read 2026-09-11) - TESCO/ASDA are UK
  grocery chains, suggesting UK market focus, distinct from the mostly US-facing apps above. No
  API or partnership named beyond the retailer list itself.
- Model: "AI combines item identity, condition, and market evidence" - no model named.
- Pricing: markets itself as fully free - "no trial timer, no card, no download," no
  subscription tier found on the homepage.
- ONE PART WORTH TAKING: UK grocery-chain coverage (Tesco, ASDA) is a market this research found
  nowhere else in the set - worth checking whether any Canadian equivalent exists (Loblaws,
  Sobeys, No Frills) since none of the 12 apps opened here named a single Canadian retailer or
  showed CAD pricing anywhere.

## ResaleScan: AI Value Scanner (iOS id6742344304)

- Identification: photo.
- Data source: marketing claim, vague: "photo to price technology that analyzes thousands of
  marketplace listings" (App Store listing, read 2026-09-11) - no marketplace named for the
  pricing data itself, though export targets are named ("eBay, Facebook Marketplace, and other
  platforms"), again conflating sale-channel with data-source the way ReSell AI's listing does.
- Model: not disclosed.
- Pricing: Weekly PRO $4.99-6.99, Monthly $11.99, Yearly $34.99-39.99, Lifetime $79.99 (a
  lifetime tier not seen elsewhere in this set).
- Independent signal: a user review flags the price "changing... every other week and doubled"
  between promo and standard rates - independent evidence of pricing-page instability, not a
  marketing claim.
- ONE PART WORTH TAKING: a lifetime-purchase option alongside subscriptions - no other app in
  this set offers a one-time buyout.

## Data sources that remain genuinely unverifiable

- OLMA: no source named anywhere; searched official site, App Store listing (two regions),
  developer page, Google Play data-safety page.
- ThriftAI (com.fulcra.thriftai): weakest disclosure in the set - "trained on millions of actual
  sales," no marketplace or API named; searched App Store listing, an attempted separate
  developer/company site (none found), a Google Play mirror (different bundle ID, not confirmed
  same product).
- Price Checker (id6755660779): "current market data," no source at all; searched App Store
  listing only, no company site surfaced.
- Price AI (trypriceai.app): retailers named (Nike, Best Buy, Walmart, Target, eBay) but no
  mechanism/API/partnership disclosed; searched official site via search snippets only.
- ReSell AI (id6757677053) and ResaleScan (id6742344304): both name marketplaces but only as
  sale/export destinations, not clearly as the sold-comp data source - ambiguous rather than
  fully unknown, flagged above per-app.

## Cross-cutting notes

Only one app in this class (Underpriced AI) had its AI model and data-source API named by
anyone other than its own sales-facing marketing copy, and even that was the founder's own
words on Hacker News, not a third party - "sourced" here still means self-disclosed, just
disclosed in a technical register rather than a sales one. No app in this set had its pricing
mechanism independently audited by a journalist, academic, or third-party review site in
anything this research surfaced.

No app opened in this research names a Canadian retailer, shows CAD, or claims Canada
coverage. This is a gap in the market AS SEARCHED, not proof no Canadian competitor exists in
this class - the searches run were English-language app-store and general web queries; a
dedicated Canadian-retailer-name search (Loblaws, Sobeys, Canadian Tire, No Frills scan app)
was not run in this pass and should be treated as an unopened search, not a confirmed absence.
</content>
