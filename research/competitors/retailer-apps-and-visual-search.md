# Retailer's own apps and visual search

Read date for all sources below: 2026-09-11, unless a source carries its own date.

## Class A: retailer's own apps

Control query run: "Walmart app barcode scanner price check" returned Walmart's own "Check a
price" page (walmart.com/cp/check-a-price/8525999), confirming the feature exists and is
officially documented. Control passed.

Candidates found: 7 (Walmart Canada, Loblaws/PC Optimum/PC Express/"pcogo", Real Canadian
Superstore, Sobeys/Voila, Metro/My Metro, Costco Canada, Amazon in-store Price
Check/Scan&Go). Opened in depth: 4 (Walmart, Loblaws/PC Optimum, Costco, Amazon). Lighter
coverage (search snippets only, not a full teardown): Superstore, Sobeys/Voila, Metro.

### Walmart

Canada + US, same app/feature.

- Data source: Walmart's own POS/inventory system. Confirmed by Walmart's own support page
  (walmart.com/cp/check-a-price/8525999), which describes scanning a barcode to see current
  in-store price, availability, offers, reviews - it pulls from Walmart's live product/price
  system, not a third-party catalog. A direct WebFetch of that exact URL was blocked by a
  CAPTCHA wall; this is sourced from the WebSearch snippet of that page plus independent
  corroboration (thekrazycouponlady.com/tips/store-hacks/walmart-clearance,
  cheapsimpleliving.com/post/walmart-price-checker-mobile-app, both read 2026-09-11) -
  partially verified, flagged as such.
- Identification: camera-based barcode scan, auto-detects without a shutter press.
- Model/pricing: no AI model named; a barcode lookup, not visual recognition. Free, no
  membership needed (unlike the discontinued Scan & Go).
- History note: Walmart Canada's original "Scan & Go" (customer-held physical scanner) was
  discontinued after a limited rollout, per CBC News
  (cbc.ca/news/business/walmart-canada-self-checkout-scan-and-go-amazon-go-1.4899698, read
  2026-09-11). The current app-based barcode price-check is a separate, still-live feature.
- ONE PART WORTH TAKING: auto-detect on camera focus, no shutter tap, no confirm button - the
  scan-to-result latency is the whole UX. Shin should aim for zero-tap barcode detection rather
  than a capture button.

### Loblaws / PC Optimum / PC Express / "pcogo"

Canada, Real Canadian Superstore + No Frills banners.

- Data source: a named third-party vendor, not built in-house. CP24
  (cp24.com/local/toronto/2025/11/06/loblaw-launches-pcogo-pilot-at-select-toronto-no-frills-grocery-stores-what-is-it/)
  and Grocery Business Magazine
  (grocerybusiness.ca/loblaw-launches-scan-and-shop-pilot-at-three-toronto-no-frills-for-faster-shopping-experience/),
  both read 2026-09-11, report Loblaw Digital integrated "Shopreme's white-label SDK" into the
  PC Optimum app for the "pcogo" pilot. So the price/product data is Loblaw's own inventory
  feed, delivered through a licensed third-party scan-and-pay SDK (Shopreme), not built from
  scratch.
- Identification: barcode scan while walking the store; running total shown live; PC Optimum
  points tracked automatically as items are scanned.
- Pilot scope (independent reporting, not marketing puffery): 3 Toronto No Frills locations,
  launched November 2025, restricted to PC Optimum members with 30,000+ lifetime points, a
  6-month pilot measured on usage/efficiency/wait-time/feedback before wider rollout. A real,
  dated, bounded pilot, not a claim of nationwide availability.
- Older/parallel feature: "shop and scan" via PC Express at Real Canadian Superstore, existing
  since about 2018 (cbc.ca/news/business/loblaws-walmart-shop-and-scan-technology-1.4912024,
  read 2026-09-11) - scan as you shop, get a single checkout barcode, pay at cashier/
  self-checkout/kiosk (payment itself was not yet in-app as of that reporting).
- Model/pricing: no AI/vision model; straight barcode. Free, tied to a PC Optimum loyalty
  account.
- ONE PART WORTH TAKING: gating an in-app-scan pilot to loyalty members above a points
  threshold (30,000+) lets a retailer test hardware/ops risk on its most trusted, least-likely-
  to-shoplift users before opening wider. Shin could use the same "prove reliability on a small
  trusted cohort before wide launch" sequencing for its own beta gating.

### Costco

Canada + US, same app/program.

- Data source: Costco's own inventory/POS, expanding via a named pilot. Fortune
  (fortune.com/2025/05/30/costco-scan-pay-phone-app-sams-club) and RetailWire
  (retailwire.com/costco-technology-27-stores/), both read 2026-09-11, report Scan & Pay moved
  from lab test to a 27-warehouse pilot (a mix of existing high-volume clubs and new FY2025
  openings) as of the 2026 Q1 earnings call. Costco executives stated on that call that
  scan-and-go improved checkout speed "up to 20%" at adopting locations - LABELLED AS COMPANY
  CLAIM, from an earnings call, not independently audited.
- Identification: barcode scan in-app while shopping; exits require scanning a QR code at a
  kiosk (mentalfloss.com/food/grocery-stores/costco-scan-and-pay-lets-customers-skip-lines,
  read 2026-09-11).
- Model/pricing: no vision model, barcode-based. Free with membership (feature is
  membership-gated, unlike Walmart's open price-checker).
- Canada-specific note: could not verify whether the Scan & Pay pilot includes any Canadian
  warehouses; all sourced reporting names US pilot locations only. UNKNOWN for Canada, not
  confirmed absent - a Canada-specific search was not run in this pass.
- ONE PART WORTH TAKING: a dual-track pilot design - deploy to both a few existing high-traffic
  stores (stress-test against real crowding) and brand-new stores from day one (no legacy
  workflow to retrain around). Shin's own pilot rollout could mirror testing against both a
  high-load existing user base and a fresh cohort at once.

### Amazon app (in-store scan features)

Class A (barcode/price check) with a Class B feature (StyleSnap) in the same app.

- Data source: Amazon's own catalog/pricing. Feature history: "Price Check" launched in the
  Amazon app in 2015 to compare Amazon's own price against a scanned barcode; description via a
  secondary source (soporte.colineal.com/article/how-to-scan-in-amazon-app-the-hidden-tricks-for-faster-shopping,
  read 2026-09-11) - moderate confidence, not Amazon's own page, flagged as such.
- "Scan & Go" / "Just Walk Out" (Amazon Go/Whole Foods) is a separate, computer-vision-based
  system (shelf cameras + weight sensors, not phone-camera scanning); not deep-fetched in this
  pass, noted as a gap rather than claimed coverage.
- Identification: barcode (Price Check) vs image-based visual similarity (StyleSnap, see Class
  B below).
- Model/pricing: barcode lookup for Price Check, no AI model. Free.
- ONE PART WORTH TAKING: putting a price-comparison scanner inside the same app as the
  retailer's own storefront (Amazon's own Price Check compares Amazon's own price against what
  you scanned) is a trust signal - a retailer app doubling as a competitive price-check tool
  against itself. Shin's neutral, belongs-to-no-retailer positioning is the sharper version of
  the same instinct.

### Lighter-coverage retailer apps (search snippets only)

- Real Canadian Superstore / PC Express (pre-pcogo): shop-and-scan since about 2018,
  barcode-based, checkout barcode generated for cashier/self-checkout, PC Optimum points
  integrated (canadiangrocer.com/loblaw-lets-shoppers-scan-they-go, read 2026-09-11).
- Sobeys/Voila: could not verify a customer-facing in-app barcode scanner. Sobeys' scanning tech
  (supermarketnews.com/finance/sobeys-eyes-an-even-smarter-shopping-cart, read 2026-09-11) is a
  smart-cart pilot, not the phone app; Voila itself is delivery/pickup ordering (Scene+
  points), no scan feature found. UNVERIFIED ABSENCE: search covered "Sobeys Voila app scan
  barcode features grocery pickup" and found only the smart-cart pilot and delivery features;
  Sobeys' own newsroom and app-store listing text were not directly fetched.
- Metro/My Metro: app supports scanning barcodes to see product attributes/dietary filters (not
  price-check specific); a separate 2018 scan-and-go pilot in a Quebec store, current status
  unverified (pressreader.com/canada/the-hamilton-spectator/20180131/282222306196030, a 2018
  source, read 2026-09-11).

## Class B: visual search

Control query run: "Google Lens shopping visual search feature price comparison how it works"
returned Google's own blog post
(blog.google/products-and-platforms/products/shopping/visual-search-lens-shopping/), confirming
the search works for this class. Control passed.

Candidates found: 5 (Google Lens, Amazon StyleSnap, Pinterest Lens, CamFind, Samsung Bixby
Vision). Opened in depth: 3 (Google Lens, Pinterest Lens, Amazon StyleSnap). Lighter coverage:
CamFind, Bixby Vision.

### Google Lens (shopping feature)

Global including Canada.

- Data source: Google's own Shopping Graph, "more than 45 billion products," per Google's own
  blog (blog.google/products-and-platforms/products/shopping/visual-search-lens-shopping/, read
  2026-09-11). LABELLED AS COMPANY CLAIM about its own product, though the mechanism (a large
  aggregated merchant feed) is consistent with how Google Shopping has always worked.
- Identification: photo/screenshot visual similarity matching against the Shopping Graph;
  supports combining an image with typed text refinement (photograph a couch, type "brown
  velvet" to narrow results).
- Model: the blog post as fetched does not name Gemini explicitly (says "the power of Google's
  AI" generically) - do not claim Gemini-specific attribution beyond what is sourced. A
  secondary, lower-confidence source (imagga.com) references Gemini more broadly across Lens,
  but that is trend commentary, not a hard product spec.
- Pricing: free, built into the Google app/Chrome, no subscription.
- Rollout: began October 2024 for select countries, initially toys/electronics/beauty
  categories per the same blog post.
- ONE PART WORTH TAKING: image plus text refinement in the same query (photo of couch + typed
  "brown velvet"), a hybrid input mode instead of forcing photo-only or text-only search. Shin
  should support adding a text qualifier after a scan when a visual match is ambiguous, rather
  than treating that as a dead end.

### Pinterest Lens

Global including Canada.

- Data source: named and specific - "hundreds of millions of shoppable Product Pins based on
  catalogs from retailers around the world, of all sizes," per an AWS case study of Pinterest
  (aws.amazon.com/blogs/industries/aws-is-how-pinterest-lens-helps-pinners-find-and-buy-the-perfect-item/,
  read 2026-09-11). LABELLED AS VENDOR-PUBLISHED (an AWS case study about a customer), though
  the architecture description (retailer catalogs feeding Product Pins) is a factual claim, not
  a performance claim.
- Identification: camera or uploaded photo, object recognition plus attribute detection, an ML
  model rebuilt nightly, matched against Product Pins.
- Model: not named specifically beyond "machine learning engine rooted in years of computer
  vision work" - Pinterest does not publicly name the model architecture in this source; no
  model name should be fabricated here.
- Pricing: free within the app.
- Scale claim, LABELLED AS COMPANY-REPORTED: "hundreds of millions of visual searches" monthly
  across 459 million users - Pinterest/AWS's own reported metric, not third-party verified.
- ONE PART WORTH TAKING: a nightly model/index rebuild cadence rather than a static index, to
  keep the catalog fresh as retailers add or remove inventory daily. Shin's own price index
  needs an explicit, stated refresh cadence rather than an unstated "sometimes updated."

### Amazon StyleSnap (and "StyleSnap for Home")

Global including Canada, fashion-only, plus a Home variant for furniture/decor.

- Data source: Amazon's own product catalog, confirmed directly by Amazon's own technical blog
  (amazon.science/latest-news/the-science-behind-amazons-new-stylesnap-for-home-feature, read
  2026-09-11) - first-party and technical, higher confidence than a marketing page.
- Identification: a multi-stage CNN pipeline - (1) a detection/classification network
  identifies and categorizes the object (e.g. "home office" to "chair"), (2) a second, larger
  comparison network turns both the customer photo and catalog images into vector embeddings,
  (3) nearest-neighbor style matching against the catalog, (4) post-processing filters for
  duplicates/ratings/relevance.
- Notable engineering detail, independently verifiable via the same first-party source (not a
  marketing claim): training on Amazon's catalog photos alone created a "domain gap" between
  clean catalog images and messy real-world customer photos, so Amazon synthetically generated
  training data by segmenting objects out of real photos and pasting them onto varied
  backgrounds - a concrete, named technical fix to a named problem.
- Model: CNN-based; not named as a specific published architecture (e.g. ResNet, CLIP) in the
  fetched excerpt - do not over-specify beyond "CNN."
- Pricing: free within the Amazon app, fashion category only for the original StyleSnap (per
  wwd.com and socialmediatoday.com coverage, read 2026-09-11), with the Home variant as a
  separate expansion.
- Adoption claim, LABELLED AS COMPANY-REPORTED (aboutamazon.eu, read 2026-09-11): "tens of
  millions" of users since a 2019 US launch, later expanded to EU and India.
- ONE PART WORTH TAKING: solve the training-domain-gap by synthetically compositing real-world
  object crops onto varied backgrounds, rather than assuming more scraped real photos alone
  will close the gap. Shin should expect the same gap (clean catalog photos vs a shopper's
  messy in-aisle photo) and can borrow this exact synthetic-augmentation fix.

### Lighter-coverage visual search apps (search snippets only)

- CamFind: third-party general visual search app powered by the CloudSight API (per
  camfindapp.com and a Wikipedia listing, read 2026-09-11), claims "42 million downloads" and
  "550 million images identified" - both COMPANY-REPORTED adoption figures, unverified
  independently. Provides price comparison and shopping results as one of several
  general-purpose identification outputs (also translation, QR/barcode). Worth noting as a
  precedent for a general-purpose (not retailer-specific) visual search product surviving as a
  standalone app rather than a feature bolted onto a larger platform.
- Samsung Bixby Vision: an on-device camera feature (not a separate app); does barcode scan
  plus visual object recognition, returns "shopping assistant" results with price comparisons
  across retailers (samsung.com/us/explore/bixby/sees/, read 2026-09-11 - Samsung's own page,
  labelled as a company claim about its own feature). Not independently deep-dived beyond this.

## Verification gaps named explicitly

- Walmart's official "check a price" page could not be directly fetched (CAPTCHA-blocked);
  relied on the WebSearch snippet plus independent coupon-blog corroboration. A
  partial-verification flag, not a failed search.
- Real Canadian Superstore's own help page (realcanadiansuperstore.ca/en/help/pc-express-pass-info)
  returned no substantive content on fetch (navigation-only render); PC Express/pcogo mechanics
  were instead sourced from CP24, Grocery Business Magazine, and CBC, all independent news
  reporting, not Loblaw's own page.
- Whether Costco's Scan & Pay pilot includes any Canadian locations: unverified, not confirmed
  absent. All sourced pilot-location reporting names US warehouses only; a Canada-specific
  search was not run in this pass.
- Whether Sobeys/Voila has any customer-facing in-app barcode scanner: unverified, not
  confirmed absent. Search surfaced a smart-cart pilot and delivery-app features only; Sobeys'
  own newsroom and app-store listing text were not directly fetched.
- Amazon's "Just Walk Out"/Amazon Go computer-vision checkout system was named but not
  deep-dived in this pass (scope focus was phone-camera scan features); flagged as a real gap,
  not covered as claimed depth.
- Google Lens's exact underlying model (Gemini vs another architecture) is not confirmed by
  Google's own blog post as fetched; a secondary source references Gemini in general Lens
  commentary but that source is lower-confidence trend writing, not a Google product spec, so
  this stays labelled unconfirmed.
</content>
