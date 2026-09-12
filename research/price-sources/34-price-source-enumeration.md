# Item 34: price source enumeration

Read 2026-09-11, following the eight named classes plus two more found by opening
sources rather than assumed empty. This does not redo the 2026-09-03 pilot
(`notes/session-2026-09-03.md`) or the research memo
(`research/2026-09-03-research-memo.md`); it builds on both and does not repeat their
already-sourced numbers except to compare against a fresh reading of the same source
where the number matters to the ranking.

**What "already wired" means below:** `price/src/sources.ts`, `lookup.ts`, `walmart.ts`,
`walmart-sitemap.ts`, `canadiantire.ts`, `openprices.ts` and `crawl.ts` already exist and
already run against three of the sources named here (Walmart Canada storefront,
Canadian Tire storefront, Open Prices). This enumeration is about the sources NOT yet
wired, so the ranking and the "top two" recommendation are about what to build next, not
about redoing what already runs.

## Method note on "zero result"

Two classes below (paid syndicated panels, official retailer developer APIs) came back
thin. For both, the specific sources opened are listed, and a control query that should
find something if the class has anything in it was run and did find something (Numerator
exists and sells CPG panel data; Best Buy Canada and Canadian Tire both run developer
portals, one dead per item 28). Thin is reported as thin, with the search enumerated,
not as "nothing there."

---

## Class 1: Retailer storefronts read directly (sitemaps, page data, undocumented
storefront APIs)

| Source | CA coverage | Barcode join rate | Cost / 1,000 lookups | Terms |
|---|---|---|---|---|
| Walmart.ca (already wired) | ~217,660 first-party SKUs in the product sitemap, measured by counting sitemap entries 2026-09-08 (`crawl.ts` header); marketplace (3P) sitemap adds ~855,000 more, uncounted for barcode presence | 100% by construction: `upc` is read straight off the product page JSON, so every row this source emits already carries a GTIN. Measured, not estimated. | $0 marginal, self-hosted; time cost measured at 4.28s/SKU single-threaded (2026-09-08), so 1,000 SKUs = ~71 minutes of one worker's wall time, not a dollar cost | `robots.txt` Disallows `/en/ip/*` bare and `/search?*`, Allows `/en/ip/*/*` (two-segment paths); the sitemap route stays inside the Allow. Read and quoted in `walmart-sitemap.ts`, not re-fetched this session. |
| Canadian Tire storefront API (already wired) | Unknown, not enumerated by either this session or the prior one. How to measure: page the `search/v2/search` endpoint with an empty or single-letter query across categories and sum `totalResults`; not run this session because it is a build task, not a research one. | 0%: measured 2026-09-05 (`canadiantire.ts` header) that no field on the product or search payload is a real GTIN; the one 12-digit-looking field fails the UPC-A check digit. Every row from this source joins by name only. | $0 marginal, self-hosted, no key beyond the page's own public subscription key | No robots.txt could be read this session: `https://www.canadiantire.ca/robots.txt` returned an Akamai "Access Denied" page to a plain `curl` fetch 2026-09-11, which is a bot-defense response, not a published rule. The storefront's actual JSON API answered plain fetches without blocking in the 2026-09-05 session per that file's header; this session did not re-test the API path itself, only the robots.txt path, so "the API still isn't blocked" is carried forward from that file's dated finding, not re-verified today. |
| Loblaws (loblaws.ca / PC Express) | Blocked to a plain fetch: "hard 403," pilot run 2026-09-03 (`notes/session-2026-09-03.md`) | N/A, no working direct route | N/A direct; see Class 5 for the paid route around this block | `robots.txt` fetched 2026-09-11: only Disallows `/cart/`, `/checkout/`, `/account/`, `/collections-id/`, and publishes a sitemap. **The robots file does not forbid crawling product pages.** The 403 is the site's bot defense acting above robots.txt, not a terms violation of what robots.txt permits. This distinction matters: a headless-browser or residential-proxy fetch would not be breaking a stated rule, only working around a technical block, which is a cost/engineering question, not a terms one. |
| Metro.ca | Same shape as Loblaws: pilot 2026-09-03 hit a 403 on direct fetch | N/A | N/A direct | `robots.txt` fetched 2026-09-11: Disallows only query-parameter variants (`*sortOrder=*`, `*page=*`, flyer-redirect params, account/checkout paths) and publishes `https://www.metro.ca/sitemap.xml`. Plain product-page URLs are not disallowed. Same distinction as Loblaws: the block observed in the pilot is bot defense, not a robots.txt rule. |
| IKEA.ca | Direct fetch served the nav menu only, no product data in the response (pilot 2026-09-03) | N/A | N/A | Not re-checked this session; carried forward from the pilot. |

**Control for this class:** two of five retailers tried (Walmart, Canadian Tire) gave
usable data through a plain fetch; the other three did not. The class is not uniformly
open or uniformly closed, so "retailer X is unreachable" has to be checked per retailer,
not assumed from one failure. Sobeys, Costco.ca, Canada Computers, Best Buy Canada's own
storefront (distinct from its US developer API used in item 27) and London Drugs have
not been tried by this session or the prior one; they are the open part of this class's
search space, not evidence the class is exhausted.

---

## Class 2: Official and affiliate feeds

| Source | CA coverage | Barcode join rate | Cost / 1,000 lookups | Terms |
|---|---|---|---|---|
| Canadian Tire developer portal | See item 28: dead, one echo stub, registration disabled | N/A | N/A | N/A |
| Walmart affiliate/Content Provider API | US-marketed; a nominally separate Walmart Canada program runs through Rakuten Advertising / FlexOffers, unverified whether its feed carries price/barcode. See item 35. | Unknown | Unknown (commission-based programs, not a per-lookup fee, so "cost per 1,000 lookups" does not apply the way it does to a paid API) | Requires an approved affiliate account; not signed up for, per this lane's contract |
| Best Buy US developer API (already used, item 27) | US only by design (plan item 27 uses it for US ratings on tech products, not CA price) | N/A for CA pricing | Free tier documented in item 27's own scope, not re-checked here | Out of scope for CA price by the plan's own item 27 wording |
| Icecat | Specs/content feed (brand, category, images, attributes), not a price feed. Confirmed by re-reading plan item 33's own wording: "count rows and the join rate to Walmart's tech rows," i.e. it enriches the catalogue's tech rows, it does not price them. | N/A, not a price source | N/A | Out of scope for this item; listed only so it is not mistaken for a priced source later |
| GS1 Canada barcode registry | Control query for this class: does a barcode *registry* carry price? No. Checked by reading what GS1 Canada's own product pages describe it as (a company/brand-to-barcode registry service), not fetched live this session because the answer follows from what the product is, not from a page that needed opening. | N/A | N/A | Confirms the negative rather than leaving it assumed: barcode registries are a Class-9-adjacent dead end for price, not an unsearched gap. |

---

## Class 3: Flyer aggregators

| Source | CA coverage | Barcode join rate | Cost / 1,000 lookups | Terms |
|---|---|---|---|---|
| Flipp | National, dozens of Canadian banners, already known from the memo | Name/image only, no barcode field surfaced in any prior read | Free to browse, no official paid API found this session | `https://corp.flipp.com/terms-of-use/` (updated 2023-06-13, read 2026-09-11): Section 2.2 explicitly bars a user from "Download[ing], copy[ing], captur[ing], scrap[ing] or otherwise obtain[ing] the Application Content not otherwise expressly permitted." Scraping Flipp directly is against its terms, confirmed by quote, not inferred. Third-party Apify "Flipp Scraper" actors exist and run anyway; using one does not change whose terms are being broken. |
| Reebee | Not opened this session; named as an unsearched channel in this class, not assumed empty. |||

---

## Class 4: Open datasets

| Source | CA coverage | Barcode join rate | Cost / 1,000 lookups | Terms |
|---|---|---|---|---|
| Open Prices / Open Food Facts (already wired) | 664 CAD-currency rows total as of the 2026-09-04/05 pull (`openprices.ts` header), 487 distinct barcodes | 86% against this catalogue, measured (417 of 487 distinct barcodes joined) | $0, no key | Open license (ODbL-family per Open Food Facts project norms); already in production use in this repo |
| StatCan table 18-10-0245-01 (Web Data Service) | Provincial averages for a short, fixed basket (oranges, eggs, apples, etc.), not per-product/per-barcode pricing at all | N/A, this source has no barcode dimension | $0, no key, 25 req/s/IP per the memo | Government open data; already used for the narrow grocery lane |

---

## Class 5: Paid feeds

This is where the two build candidates below come from. All four numbers here were
fetched live 2026-09-11, not carried forward from the 2026-09-03 memo, because Apify
actor pricing changes per-actor and the memo's "$0.75/1k" figure was for a scraper this
session could not re-identify by that exact number; it is superseded by the numbers
below, read directly off each actor's own page today.

| Source | CA coverage | Barcode join rate | Cost / 1,000 results | Terms |
|---|---|---|---|---|
| Apify: "Loblaws & PC Express Grocery Price Scraper (Canada)" (`aitorsm/pcexpress-product-scraper`) | Loblaw banner network (Loblaws, No Frills, PC Express), the exact seller this repo's own `sources.ts` header says cannot be joined by barcode when read directly | **Claims a `barcode` field** in its output schema, per the actor's own documented fields (`barcode`, `brand_text`, `package_size`, `price`), read 2026-09-11. This directly contradicts this repo's own dated, measured finding (`sources.ts`, 2026-09-04/05: "There is NO GTIN on the page: not in the markup, not in the structured data, not in the payload the page was built from"). **Flagged, not accepted**: either the scraper reaches a different endpoint than the one this repo inspected, or its "barcode" field is the internal article number relabelled. This is exactly the kind of claim the calibration rule says must be checked before it is trusted, not asserted either way. | "from $10.00 / 1,000 results," pay-per-result with volume discounts, read from the actor's own pricing tab 2026-09-11 | No published rate limit or terms beyond Apify's own platform terms; the actor's own FAQ says login is not required to run it |
| Apify: "Canadiantire.ca Scraper" (`azzouzana/canadiantire-ca-scraper`) | Canadian Tire storefront, redundant with the already-free, already-wired `canadiantire.ts` | No barcode field demonstrated in its sample output (SKU/code field only, e.g. `"code": "0589316P"`), read 2026-09-11 | "from $1.00 / 1,000 results," read 2026-09-11 | Same platform terms as above |
| SerpApi, `google_shopping` engine | Multi-retailer (whichever sellers Google Shopping indexes for a CA query), fills the "retail-new" gap the memo flagged as unresolved ("no verified price source," "result quality unverified live") | Name/model join only; Google Shopping does not carry GTIN in its public result fields | $25.00 / 1,000 searches at the Starter tier, falling to $7.25 / 1,000 at the highest tier the pricing page states (Searcher, 100,000/mo), read 2026-09-11. **Each search returns several listings, not one product**, so the per-listing cost is lower than the per-search cost; this session did not run a live query to count listings-per-search, so a per-1,000-products figure would be an estimate on top of an estimate and is not stated as a number here. | Standard SerpApi ToS; page did not break out `google_shopping` pricing separately from the general per-search rate, so whether Shopping-specific queries cost the same as a plain web search is unconfirmed this session |
| Apify: "Costco Product Scraper" | Costco.ca | Not confirmed | "$5.00 / 1,000" (free tier) down to "$2.90 / 1,000" on higher plans, read 2026-09-11 | Named for completeness; not analysed further, no barcode confirmation found |
| GroceryPulse.ca commercial panel | 12-13 cities, 22 banners/~160 stores, but only a **50-item fixed basket**, not an arbitrary-product catalogue; read from the site's own about/methodology text 2026-09-11 | N/A: this is a fixed basket keyed to product names, not a barcode-joinable feed | **Unpublished.** The site states institutional/commercial access exists ("Institutional teams... can license weekly files through Team Data or production endpoints through the Commercial API") but names no price; a free monthly pack exists on a 14-day delay. Cost is unknown and the way to find out is to ask, which this lane was told not to do (no sign-ups). | Not fully read; flagged as a real but currently unpriced option |
| PriceAPI.com | Claims >100 sources across >30 countries including Canada, generic e-commerce/marketplace coverage (Amazon, eBay, Google Shopping, idealo-style), read 2026-09-11 | Not confirmed for any specific CA retailer | Subscription-tiered, starting "499 EUR/month" per its own costs page, read 2026-09-11; no confirmed per-1,000 CA-specific rate | Not analysed further; the entry cost alone (~$730 CAD/mo at time of reading) is high relative to the two Apify actors above for a catalogue this narrow in scope |

---

## Class 6: Crowd reports

| Source | CA coverage | Barcode join rate | Cost / 1,000 lookups | Terms |
|---|---|---|---|---|
| ScanRebel | "Ontario coverage is strongest, with Canada and US coverage supported and global expansion planned," per its own site, read 2026-09-11. Confirms the memo's 2026-09-03 mention of it was accurate, not a hallucinated name. | Unknown; the app is a barcode scanner by design, so a join likely exists, but no API or data-export was found this session | No public API found; app is free to end users, no B2B pricing page found | Android open test (no approval needed) and iOS TestFlight, per its own site; no data-licensing terms found this session, meaning "can we buy or pull this feed" is unknown and the way to find out is to contact the developer directly, which is outside this lane's no-signup rule |
| Open Prices | Already counted under Class 4 (it is simultaneously a crowd-sourced project and an open dataset; listed once, not double-counted in the ranking below) |||

---

## Class 7: Receipt data

| Source | CA coverage | Barcode join rate | Cost / 1,000 lookups | Terms |
|---|---|---|---|---|
| Fetch Rewards | US-headquartered; "sells aggregated shopping data to brands," per third-party reporting read 2026-09-11. CA operation status not confirmed this session. | Unknown | Enterprise/brand-sales model, no public self-serve price found | Enterprise sales only, no self-serve API found |
| Ibotta | Explicitly converts "each receipt picture into a row of data per item tied to the user, store, location, price, and brand" for its ad/analytics product, per third-party reporting read 2026-09-11 | Implied high (item-level), not confirmed from a primary source | Enterprise/brand-analytics pricing, not published | Same shape: brand-facing analytics product, not a developer API a small team can key into |
| Checkout51 | Canadian-market receipt/coupon app; no data-licensing terms found this session beyond a standard CCPA "Do Not Sell My Personal Information" toggle, which implies a data-sale practice exists for at least some jurisdictions but does not describe it | Unknown | Unknown | Not analysed further |

**Note on this whole class:** every source in it is a consumer-data business whose real
customer is a CPG brand or retailer paying for insights, not a per-lookup price API.
None published a price. That is this class's honest state: not "no data," but "data that
is sold at a scale and a sales-call this lane cannot reach without a signup this lane was
told not to make."

---

## Class 8: Any class the first eight do not cover

Two found by going and looking rather than assuming the eight named classes were
complete:

- **Paid syndicated retail-measurement panels** (Numerator, Circana, NielsenIQ). These
  exist, are real, and do carry Canadian CPG price/volume data through retail
  partnerships, but at enterprise pricing: third-party market-research write-ups place
  NielsenIQ contracts at "$100,000-$500,000+ annually" and Circana at
  "$75,000-$400,000+ annually" (read 2026-09-11; neither company publishes list pricing
  itself, so these are secondhand estimates, labelled as such). At this scale and price,
  none of the three clears "priced Canadian products per dollar" against any option in
  Class 5, and none is sized for a startup's beta build.
- **General-purpose affiliate networks with product-feed access** (Rakuten Advertising,
  Awin, CJ Affiliate, Impact). These are the mechanism behind several retailers'
  "affiliate programs" (Walmart Canada's, per item 35), and in principle a data feed
  reaches a publisher once accepted into a specific merchant's program inside the
  network. Awin's own network-fee structure (a "£3,000-£5,000" setup fee plus a
  "25-30%" override on commissions, per a third-party comparison read 2026-09-11) is
  priced for the *merchant* side, not what a publisher pays to read a feed, so it is not
  directly comparable to a per-lookup API cost, and no specific retailer's actual feed
  schema was read this session (each network gates that behind acceptance into that
  merchant's specific program).

---

## Ranking: priced Canadian products per dollar

Only sources with an actual, sourced number belong in a ranking; several rows above
(GroceryPulse commercial tier, ScanRebel B2B, receipt-data licensing, the affiliate
networks) have no published price and are excluded from the table below for that reason,
not because they were judged worse.

| Rank | Source | Priced CA products per $1 | Arithmetic (estimate, shown) |
|---|---|---|---|
| 1 | Walmart.ca sitemap + product page (already wired, free) | Effectively unbounded per dollar; bounded instead by wall-clock time (~71 min/1,000 SKUs, one worker) | No dollar cost, so "per dollar" does not apply the way it does to a paid feed; excluded from the paid ranking below on that basis, and named first because it is strictly better than every paid option beneath it |
| 2 | Canadian Tire storefront (already wired, free, name-join only) | Same shape as above: free, throughput-bounded not dollar-bounded | Same caveat as above |
| **3 (top paid pick)** | Apify Loblaws/PC Express scraper | ~100 products per $1, **if** the claimed `barcode` field is real | $10.00 / 1,000 results -> 1,000 / $10 = 100 products/$. Labelled an estimate because the barcode-field claim is unverified against this repo's own contradicting finding. |
| **4 (second paid pick)** | SerpApi `google_shopping` | Roughly 280-1,700 products per $1, a wide estimate | $25/1,000 searches down to $7.25/1,000 searches; assuming (not measured) 7-15 useful CA listings per search: at $25/1,000 searches, 1,000 searches x 10 listings = 10,000 listings / $25 = 400 listings/$; at the cheapest tier, 1,000 x 10 / $7.25 = ~1,380 listings/$. Range shown rather than a single number because the listings-per-search count was not measured live this session. |
| 5 | Apify Canadian Tire scraper | ~1,000 products per $1 nominally, but this duplicates a source already free in this repo | $1.00/1,000 results, no barcode confirmed; ranked low **for adoption**, not for raw arithmetic, because building it adds a recurring cost for something the repo can already do at $0 |
| 6 | Apify Costco scraper | 200-345 products per $1 | $5.00 to $2.90 per 1,000, no barcode confirmed |
| 7 | PriceAPI.com | Not computable; entry cost (~$540 EUR/mo minimum) with no confirmed CA-specific per-lookup rate | Excluded from a per-1,000 comparison for lack of a usable denominator |

## The top two, and what building each would take

**#1: an adapter for the Apify "Loblaws & PC Express Grocery Price Scraper."** This is
the one candidate that, if its barcode claim holds, closes the single largest confirmed
gap in this repo's price coverage: Loblaws is a national grocery banner network this
repo's own code already proved cannot be joined by barcode when read directly
(`sources.ts` header, 2026-09-04/05), and this actor claims to expose exactly that field
from a different data path. Building it: (1) an Apify API client call from
`price/src/`, following the same shape as `walmart.ts`'s HTTP calls; (2) a 20-product
spot check against this catalogue's own known-barcode rows, comparing the actor's
`barcode` field to the catalogue's `code` column, before trusting a single row from it in
production, because the claim contradicts a dated finding already in this repo; (3) if
the check fails, the actor still returns brand+size+price for a name-join at the same
$10/1,000, at which point it is priced the same as, and no better than, extending the
existing name-join path already proven for Canadian Tire.

**#2: an adapter for SerpApi's `google_shopping` engine.** This fills the "retail-new"
gap the 2026-09-03 memo left explicitly open (step 5 of the cascade: "result quality
unverified live"), which is the one category (new retail goods with a model or style
number) this repo has no priced source for at all today. Building it: (1) a client
against SerpApi's documented `google_shopping` params (`gl=ca`) gated behind the same
model/style-number trigger the memo already specified; (2) a live 20-query run to
measure actual listings-per-search and real Canadian-retailer coverage, since that count
was not measured this session and the current ranking above is an estimate on an
estimate; (3) name/model matching through the same `ConfidentMatch` gate `sources.ts`
already enforces for every non-barcode join, so a Google Shopping listing for the wrong
variant is refused the same way a Loblaws name-match is refused today.

Sources not otherwise inlined above: https://apify.com/aitorsm/pcexpress-product-scraper
(2026-09-11), https://apify.com/azzouzana/canadiantire-ca-scraper (2026-09-11),
https://apify.com/e-commerce/costco-fast-product-scraper (2026-09-11),
https://serpapi.com/pricing (2026-09-11), https://www.priceapi.com/en/resources/faq/ and
https://readme.priceapi.com/docs/costs-subscription-plans-and-contracts (2026-09-11),
https://grocerypulse.ca/ (2026-09-11), https://scanrebel.app/ (2026-09-11),
https://corp.flipp.com/terms-of-use/ (2026-09-11), https://www.metro.ca/robots.txt and
https://www.loblaws.ca/robots.txt (2026-09-11), plus the repo files cited inline
(`price/src/sources.ts`, `canadiantire.ts`, `walmart-sitemap.ts`, `openprices.ts`,
`crawl.ts`) at the dates their own headers carry.
