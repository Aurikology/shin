# Competitor study (item 36)

Research for the beta build plan's item 36 (competitor study) and item 34 (price source
enumeration, which this feeds). Read date for all sources: 2026-09-11, unless a source carries
its own date. Method: for each class, a control query proved the search channel could find
known results before any class was reported thin; a thin result is labelled UNKNOWN, never
reported as the class being small.

Files, one per class:

- `flyer-aggregator-apps.md` - 15 candidates found, 4 opened in depth.
- `price-tracker-apps.md` - 18 candidates found, 7 opened in depth.
- `scan-and-verdict-apps.md` - 20 candidates found, 12 opened in depth. This is Shin's most
  direct competitor class; verifies and deepens sourcing on apps the 2026-09-03 research memo
  already named, and adds new ones.
- `resale-comparison-apps.md` - 10 candidates found, 4 opened in depth.
- `cashback-coupon-apps.md` - 9 candidates found, 5 opened in depth.
- `retailer-apps-and-visual-search.md` - two classes in one file: retailer apps (7 candidates,
  4 opened) and visual search (5 candidates, 3 opened).

Totals: 79 candidate apps/services named across the six classes (some appear in more than one
file where a feature crosses class lines, e.g. Checkout 51 and Caddle appear in both the
cashback file and as flyer-browsing features in the flyer file; reebee appears in the flyer
file and was checked and ruled OUT of the cashback class). 35 opened in real depth (fetched a
primary source, not just a search-result snippet).

## The three parts most worth taking (across all six classes)

1. Instacart's flyer-to-structured-data pipeline (`flyer-aggregator-apps.md`): a named,
   published architecture, not a vague AI claim, Segment Anything Model for per-product
   segmentation, PaddleOCR for text extraction, an LLM to structure the extracted text into
   queryable attributes, then approximate-nearest-neighbor matching against a product catalog.
   Instacart's own stated numbers: processing time cut from 3-4 hours manual to under 30
   minutes, 75-90% bounding-box accuracy, 95% recall for the correct product in the top match.
   This is the single most concretely buildable finding in the whole study and maps directly
   onto Shin's own photo-to-verdict pipeline.
2. Showing a range instead of a point estimate (StockX/GOAT in `resale-comparison-apps.md`,
   the confidence label in Price Snap and the "High/Medium/Low confidence" tag in
   `scan-and-verdict-apps.md`): the strongest apps in the resale and scan classes present a
   low/median/high spread or an explicit confidence tag next to the number, rather than one
   bare figure asserted as fact. This is the same instinct as Shin's own calibration priority
   (never a confidently wrong verdict) and is worth building into the verdict card directly,
   not just as inspiration.
3. Selective, cost-aware identification (Checkout 51's barcode-only-when-needed pattern in
   `cashback-coupon-apps.md`, and Ibotta's real-time pre-purchase scan in the same file): only
   force the expensive identification step (barcode scan, or an escalated vision model) when a
   cheaper method (receipt OCR, a lower-tier model) cannot resolve the match with confidence.
   This is directly relevant to Shin's own cascade (cheap model first, escalate only when
   triggers fire) and is independent validation that other apps in adjacent classes converged
   on the same cost-control shape.

## What could not be verified (named, not glossed over)

- Most scan-and-verdict apps (OLMA, ThriftAI, Price Checker, Price AI, ReSell AI, ResaleScan)
  disclose no data source beyond their own marketing copy; only Underpriced AI had its stack
  (Claude API + eBay API) disclosed by its own founder in a technical forum (Hacker News), which
  is still self-reported, not third-party audited.
- No app opened in ANY of the six classes names a Canadian grocery retailer or shows CAD
  pricing, except the Canadian-specific price trackers (GroceryPulse.ca, PricedOut.ca,
  RetailRadar.ca) and the Canadian retailer apps themselves (Walmart, Loblaws/PC
  Optimum/pcogo, Costco, Sobeys/Voila, Metro). This is a gap in the market AS SEARCHED (the
  scan-and-verdict searches were English-language and mostly US-app-store-centric); a dedicated
  Canadian-retailer-name search within the scan-and-verdict class specifically (e.g. "Loblaws
  scan app," "No Frills price scanner") was not run and should be treated as an unopened search,
  not a confirmed absence.
- Whether Costco's Scan & Pay pilot or Sobeys/Voila have any Canada-specific in-app scan feature
  is unverified, not confirmed absent (see `retailer-apps-and-visual-search.md`).
- Several apps' fee/commission structures to retailers or brands (Checkout 51, Drop, Ibotta,
  PayPal Honey, GOAT) are not disclosed anywhere found; third-party estimates exist only for
  Rakuten's cut, and that estimate is explicitly labelled as an estimate with its arithmetic
  shown in `cashback-coupon-apps.md`.
- PricedOut.ca and RetailRadar.ca disclose no data-source mechanism at all on their own pages,
  despite being fully readable; PricedOut.ca says it is open source, so a follow-up read of its
  GitHub repo (not done in this pass) would resolve that one from primary evidence.

## Method note on the zero-result rule

Every class file above records its own control query and result before any class is reported
thin, per the method rule that a zero or thin result is UNKNOWN until something proves the
search could have found more. Two explicit examples: Bring!'s claimed flyer feature could not
be confirmed to exist (marked UNVERIFIED, not "Bring! has no flyer feature"), and Zip.ca could
not be confirmed as a current cashback app in two broad searches (marked UNKNOWN, with the
specific follow-up search named that would resolve it).
</content>
