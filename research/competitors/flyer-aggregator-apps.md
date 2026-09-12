# Flyer aggregator apps

Read date for all sources below: 2026-09-11, unless a source carries its own date.

Control query run: "Flipp app weekly flyers" confirmed the search tool surfaces a known target
correctly - results included flipp.com, the Apple App Store and Google Play listings, and a
TechCrunch article, all on the first page. Control passed before concluding anything about this
class's size.

Candidates found: 15 distinct apps/products (list below). Opened in depth: 4 (Flipp, reebee,
Flyerify, Instacart's Flyers feature).

## Full candidate list

1. Flipp (Wishabi/Flipp Corporation) - Canada + US - opened
2. reebee (owned by Flipp Corporation) - Canada - opened
3. Flyerify (Shop Doctor Inc.) - US + Canada - opened
4. Instacart "Flyers" / grocery flyers feature - US (a feature within a delivery app, not a
   standalone flyer app) - opened
5. Weekly Flyer (weeklyflyer.com) - Canada - found, not opened
6. Circularss - US - found, not opened
7. Grocery Deal Hub - US - found, not opened
8. Weekly Ads: Store Flyers App (com.shoppingbegins.usa) - US - found; a WebFetch of the Play
   Store page returned no usable content (truncated); not verified
9. Flyerdeals.ca - Canada - found, not opened
10. "Canadian Grocery Flyers & Deal" (App Store id6753903055) - Canada - found, not opened
11. Folders.nl - Netherlands - found, not opened
12. Prospekte und Angebote - Germany - found, not opened
13. Alle Prospekte & Angebote App - Germany - found, not opened
14. Checkout 51 - Canada - a cashback app with a secondary flyer-browsing feature (see the
    cashback-coupon-apps.md file for its cashback mechanics); found, not opened in depth here
15. Caddle - Canada - a cashback app with a flyer-browsing feature (see cashback-coupon-apps.md);
    found, not opened in depth here

Bring! (the Swiss shopping-list app) was checked because it was named as worth checking; could
not confirm it has a flyer feature. A search for "Bring! app flyer feature grocery ads
partnership" returned only its retail-media/sponsored-product ad platform, not a flyer browser.
Marked UNVERIFIED / possibly does not exist as described, not reported as the class being
smaller because of this gap.

More class members almost certainly exist beyond these 15 (e.g. regional European and
Australian equivalents were not searched at all); the searches run here (US/Canada-centric plus
one Europe pass) do not cover Australia, Latin America, or store-specific circular apps for
chains not named above. This is an acknowledged gap in search coverage, not a claim the class is
this small.

## Flipp (Flipp Corporation, formerly Wishabi)

Canada + US.

- Data source: retailer-supplied content via direct integration. Flipp's own B2B page
  (corp.flipp.com/platforms/, read 2026-09-11) states retailers transfer "merchandising and
  savings content from any source... whether that be an API or feed, Flipp will do the heavy
  lifting for you." LABELLED AS FLIPP'S OWN MARKETING LANGUAGE, not independently verified.
  Flipp/Wishabi's public API surface is otherwise undocumented per an API-cataloging site
  (apis.io/providers/flipp-wishabi/, read 2026-09-11), which notes "Flipp publishes no public
  developer API."
- Identification: text search (e.g. "eggs"), browse by store/category, deal clipping,
  price-watch lists. No barcode or photo scan found in the App Store listing
  (apps.apple.com/ca/app/flipp-flyers-shopping-deals/id725097967, read 2026-09-11).
- Model/pricing: free, ad-supported (the App Store listing discloses "Third-Party Advertising"
  data use). A secondary source (businessmodelcanvastemplate.com, a low-quality/likely
  AI-generated blog, NOT independently verified) claimed "machine-learning and
  image-recognition systems that process 300,000+ flyer pages weekly" and "AI personalization
  added 2022" - LABELLED AS UNVERIFIED, since this is not a primary source and the specific
  numbers could not be corroborated on flipp.com or corp.flipp.com.
- ONE PART WORTH TAKING: the "Shopping List" feature reverse-searches a user's list against
  every local flyer to surface matching deals per item - a concrete matching-engine pattern
  (list items, query across all indexed flyer SKUs, rank by store proximity/price) rather than
  a vague "personalization" claim.
- Sourcing label: the retailer list and business-model claims are company marketing
  (flipp.com, corp.flipp.com); the "10M Canadians/week" and "$46/week savings" figures are
  Flipp's own claims, not independently audited.

## reebee (Flipp Corporation)

Canada.

- Data source: same parent company as Flipp (Flipp Operations Inc., per the App Store listing
  apps.apple.com/ca/app/reebee-flyers-grocery-list/id558297215, read 2026-09-11). No separate
  sourcing pipeline found; reebee is effectively Flipp's second consumer-facing brand aimed at a
  different retailer mix (Giant Tiger, Super C, Staples).
- Identification: search plus browse by category plus manual "clip/circle" deals onto a list.
  No scan feature disclosed. (Note: reebee has no cashback/rebate feature; it was checked and
  ruled out of the cashback class in cashback-coupon-apps.md.)
- Model/pricing: free, ad-supported. No AI/ML mentioned in the listing.
- ONE PART WORTH TAKING: running two branded apps (Flipp/reebee) off one backend to split
  retailer relationships or audiences without duplicating the data pipeline - a build-once,
  launch-twice pattern.
- Sourcing label: the App Store listing is a primary source for features/developer; the
  retailer count ("2,000+ stores") is the company's own claim.

## Flyerify (Shop Doctor Inc.)

US + Canada.

- Data source: UNKNOWN. The App Store and Play Store listings
  (apps.apple.com/us/app/flyerify/id711697159, read 2026-09-11) describe "collects weekly ads
  and deals from hundreds of America's most popular stores" but disclose no retailer
  partnership, license, or scraping method. Searched "Flyerify app how it works data source
  retailers" and found no primary source beyond the app's own marketing copy.
- Identification: browse an alphabetized store list, search by store name, zoom-to-read for
  in-store price matching. No product-level search across all flyers at once described
  (weaker than Flipp/reebee, which search item names across every flyer).
- Model/pricing: free. The developer states it "does not collect any data from this app" per
  its App Store privacy label, though it processes location.
- ONE PART WORTH TAKING: nothing distinctive beyond a plain flyer-image viewer; this is the
  weakest-engineered of the three consumer apps opened here (no cross-flyer item search found).
- Sourcing label: all claims here are the app's own store-listing marketing; sourcing is
  independently unverified.

## Instacart "Flyers" (grocery flyer digitization feature)

US. Not a standalone flyer app, but the strongest documented technical example found in this
class, and directly relevant to Shin's own product (turning a photo/scan into structured,
matched product data).

- Data source: confirmed via Instacart's own engineering blog
  (company.instacart.com/tech-innovation/from-print-to-digital-making-weekly-flyers-shoppable-at-instacart-through-computer-vision-and-llms,
  read 2026-09-11): "dozens of retailers uploading weekly flyers" through the Instacart
  Platform Portal. Corroborated by Instacart's own product docs
  (docs.instacart.com/storefront/learn_about_your_storefront/shopping/flyers, read 2026-09-11),
  which describe retailers uploading flyer files via "data ingestion" or managing them through
  the Platform Portal for clickable/digital flyer types.
- Identification: a two-phase computer-vision pipeline, primary-sourced from the engineering
  blog:
  1. Segmentation built on Meta's Segment Anything Model (SAM), with text-box removal, weighted
     box fusion, model ensembling, and heuristic filtering to isolate one bounding box per
     product/deal (handles overlapping items, decorative text, varied layouts).
  2. PaddleOCR extracts text from each segmented box; an LLM parses that text plus the image
     into structured queries/attributes per product; approximate-nearest-neighbor search
     matches these against Instacart's product catalog, then ranks candidates by retrieved
     attributes.
  - Stated results (Instacart's own numbers, from the same primary source): processing time cut
    from 3-4 hours (manual) to under 30 minutes; 75-90% bounding-box extraction accuracy
    (varies by flyer design); 95% recall for the correct product in the top-ranked match.
- Model/pricing: free feature within the free-to-browse, commission/ad-based Instacart
  platform. Explicitly named models: Segment Anything Model (SAM), PaddleOCR, an unnamed LLM.
- ONE PART WORTH TAKING: the exact two-phase pipeline is concrete and buildable: SAM-based
  segmentation tuned to avoid over-segmenting (e.g. treating each coffee bean as a separate
  object) by grouping into single product boxes, followed by OCR-to-LLM structured extraction,
  then ANN search against a product catalog for matching, rather than fuzzy text search. This
  is a real, published architecture with named models and numeric accuracy figures, not a vague
  "AI-powered" claim - the strongest single sourcing in this whole class.
- Sourcing label: primary source, Instacart's own engineering blog and product docs -
  company-published but technically specific, a stronger evidentiary tier than the
  marketing-only claims from Flipp/Flyerify.

## Could not verify a data source for

Flyerify (only the "we collect from hundreds of stores" claim, no partnership/API/scrape
evidence found); Weekly Flyer, Circularss, Grocery Deal Hub, Flyerdeals.ca, "Canadian Grocery
Flyers & Deal," Folders.nl, the two German Prospekte apps, Checkout 51's flyer feature, and
Caddle's flyer feature - all found via search but not opened in this pass, so their data source
is UNKNOWN (not "unsourced" as a confirmed fact, just unexamined here). Bring!'s flyer feature
could not be confirmed to exist at all under this search; its absence from results is not proof
it doesn't exist.
</content>
