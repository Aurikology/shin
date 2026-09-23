# How other companies do barcode lookups, and alternatives to the cheaper lookup, 2026-09-23

Jamin's ask, 2026-09-23: "research how other comapnies or tools online do barcode product lookups.
Look for more alternatives to our system." Two sweeps ran in parallel (Sonnet workers, WebSearch
and WebFetch only): part A enumerates data sources (identity and price), part B works out how shipped
apps do it and which whole approaches the cheaper lookup (`docs/cheap-lookup-logistics-2026-09-23.md`)
does not use. Both are kept verbatim below.

## Read these first: limits and corrections from the reviewing session

- **Neither sweep is complete.** Both ran out of web searches (200 each). Each ran a negative
  control: it swept first, then read Shin's earlier docs and listed what it had missed. Part A
  missed 11 things Shin's docs already name, part B missed 11, and both missed Project Hammer,
  the PC Express reverse-engineered client, heisse-preise.io and cijene-api. Whatever else
  exists at that rate is not in this file. Prisync, Skuuudle and Numerator were never searched.
- **No source here has been tested on a Canadian barcode.** Every "Canada: confirmed" is the
  provider's own claim, not a measured hit rate.
- **Part B's "proving it is legally doable" (alternative 2) is wrong as stated.** GroceryPulse.ca
  and eezly running a scraper proves it is practically doable; it proves nothing about legality.
- **Part B's Flipp finding does not contradict the earlier doc's "no public API".** The endpoint is
  undocumented and unlicensed, which is not a public API. Its terms were not read, it returned
  HTTP 429 when looped, and flyer data carries sale prices only, never the regular shelf price.
- **Part B alternative 6 (benchmark Google Lens) has no evidence of Lens's Canadian retailer breadth.**
- Open Products Facts, part A's alternative 2, is already in the chain (the logistics doc names
  "Open Food / Beauty / Products Facts"). Only EAN-DB in that item is new.

## The reviewing session's ranking, merging both parts

1. **Read the shelf tag in the same camera frame as the barcode.** It gives this store's price
   without asking anyone else, and every scan adds to Shin's own Canadian price table (the 874 crowd
   rows are the start). GroceryChop (Canada, June 2026, 0 ratings) confirms crowd prices by tag
   photo; Basket's predecessor StockUp built a US grocery price base from shopper scans; Open Prices
   takes prices from shelf photos. Limits: it prices only the store the shopper is in, other stores
   fill in only as scans accumulate, and it needs photo consent on. Unproven at any Canadian scale.
2. **License already-collected Canadian grocery prices: eezly (claims 40M prices, 28 banners) and
   Savvi Prices (16 named chains).** One email each for an API price. Neither states a barcode key,
   so matching by name stays. Unknown: whether either sells data at all, and at what price.
3. **EAN-DB as the paid identity step after UPCitemdb**, EUR9 for 5,000 (about EUR0.0018 a call),
   70.7M products. Test on the 19 walkthrough barcodes before anything else; terms page was a 404.
4. **Ask GS1 Canada about ECCnet**, the one bilingual Canadian product registry (700,000+ items).
   No self-serve route or price found; one phone call settles it.
5. **Flipp's flyer endpoint for an "on sale this week at" line only.** Sale prices only, terms
   unread, rate-limited: not a price source for the regular shelf price.
6. **DataForSEO's queued Shopping endpoint to refresh cached products in the background**, same
   vendor, more stores per call than the live shopping box, never for a shopper at the shelf.

Unchanged by this research: no search reseller beats DataForSEO's live call at Shin's volume;
Serper stays a no on its own terms. Confirmed dead ends: Best Buy Canada API (unresponsive since
2021), Kroger (US only), Google's Content API (sunset August 2026), Semantics3 (domain gone), GEPIR
(retired 2023), USDA branded foods (US and New Zealand only), Edamam and Spoonacular (display and
cache terms), Go-UPC and Barcode Spider (ban showing data publicly).

---


# Part A


Method: three parallel researchers used WebSearch and WebFetch only, no Chrome browser tools,
against each provider's own pricing/docs/terms page. Where a primary source could not confirm a
fact it is marked "not confirmed", never guessed. All prices below are "checked 2026-09-23" unless
marked otherwise. This sweep ran BEFORE the existing Shin docs were read (negative control, section
5 below). Shin's current chain for reference: barcode -> Open Food Facts / Open Beauty Facts (free)
-> UPCitemdb (free 100/day) -> shopper types a name -> one DataForSEO Google Organic SERP Live call
on google.ca (US$0.002, about 6s) -> code filter + rules -> one cheap Gemini call (no search) ->
fallback: today's single grounded Gemini call (about US$0.062/scan).

## 1. Barcode -> identity databases

| Source | Input | Output | Canada | Price per call | Terms that matter | Latency | Verdict vs OFF/OBF -> UPCitemdb |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Verified by GS1 | GTIN/UPC/EAN, GLN | Brand owner/company, not full name+size | not confirmed | not confirmed, no published price, enterprise by quote | terms snippet says "solely within your business, excluding commercial use", not confirmed from the PDF itself (403) | live (batch for enterprise) | no unless commercial use is confirmed |
| GS1 Canada / ECCnet Registry | GTIN | Full bilingual product record: brand, description, size/pack, images | confirmed, 700,000+ products, gs1ca.org/new-item-setup/eccnet-registry/ | not confirmed; only found price is a 2017 sheet for a different add-on service ("The Vault"), CAD $1,500-5,000/yr | no published terms; built for manufacturers/retailers, access likely per trading partner | not confirmed | best Canadian data found but no self-serve route; worth a direct call to GS1 Canada |
| GS1 Registry Platform | GTIN, GLN | Core attributes, verification layer | no, global backend reached only through national GS1 offices | not sold directly; nearest analog GS1 US Data Hub add-on US$6,500 flat, US-scoped | not confirmed | live | no, this is the infrastructure behind Verified by GS1, not a Canada-facing product |
| Barcode Lookup (barcodelookup.com) | UPC/EAN/ISBN | Name, brand, category, images, description | not confirmed | not confirmed, site returned 403; third-party snippet says ~$99/mo for 5,000 | not confirmed (terms page 403) | live + bulk | not confirmed, treat price as unverified |
| EAN-Search.org | EAN/UPC/GTIN or name | Name, category; brand/size not confirmed | not confirmed | EUR9/mo 100, EUR19/5,000, EUR39/50,000, EUR99/150,000, EUR149/300,000 | not confirmed (terms 403) | live + batch | supplement, cheap at volume, test on Canadian barcodes |
| upcdatabase.org | UPC/EAN | not confirmed | not confirmed | free 100/day, $2.50/mo 1,000, $10/mo 10,000, $25/mo 100,000, resets nightly | not confirmed; crowd-editable so quality unverified | live | supplement: a second free 100/day fallback after UPCitemdb |
| Barcode Spider | UPC/EAN/ISBN/ASIN | Name, image, description, specs, category, prices | not confirmed | $39/mo 10,000 (~$0.0039), $89/mo 50,000, $249/mo 200,000 (~$0.0012); 7-day trial | explicitly bans making data "publicly available", sell or resell; must delete data on termination | live + bulk | no without written permission, ban reads against showing results to shoppers |
| Digit-Eyes | UPC/EAN/GTIN, REST/SOAP/CSV | Description, brand, manufacturer, unit/weight, ingredients, nutrition, image | not confirmed | $1 per 100 (~$0.01), +$1/100 each for thumbnail/category/price, first 500 free, $99 one-time activation | bans rent/lease/loan/sell/distribute/derivative works, but provider ships its own consumer apps so not B2B-only | live + batch | supplement, pay-per-use with a size field; resale clause needs a legal read |
| Go-UPC | UPC/EAN/ISBN | Name, image, description; brand/size not confirmed | not confirmed | $74.95/mo 5,000 (~$0.015), $245/mo 45,000 (~$0.0054), $795/mo 450,000 (~$0.0018) | explicitly bans reselling, redistributing, or making data publicly available; must delete data on termination | live | no without written permission, same clause problem as Barcode Spider |
| UPCitemdb (current) | UPC/EAN/GTIN/ISBN or name | not fully confirmed field list | not confirmed | free 100/day, DEV $99/mo 20,000/day (overage $0.04/100), PRO $699/mo 150,000/day | only term found: Amazon/eBay sale data may not be redistributed | live, up to 10 barcodes/request paid | keep; DEV tier is the upgrade if 100/day is the real bottleneck |
| Nutritionix | UPC or food name | Food name, brand, serving size, nutrients | not confirmed | not confirmed, provider pages returned 402 | not confirmed | live | not confirmed, food only anyway |
| USDA FoodData Central, Branded | search string with UPC | gtinUpc, description, brandOwner, brandName, servingSize | no, confirmed: "market countries currently US and New Zealand" | free, 1,000 req/hr/IP with key | CC0 public domain, credit requested | live | no for Canada, catches US-made imports only |
| Edamam Food DB | name or UPC/EAN | Food label, ID, image; brand/size not confirmed | not confirmed | $14/mo 100,000, $69/mo 750,000, $299/mo 5,000,000 | data usable only behind a password in the end user's account, cannot be cached without permission, logo/link required | live | no, the password-only display rule conflicts with a scan-without-login app |
| Spoonacular | UPC (grocery-by-UPC endpoint listed) | not confirmed | not confirmed | free 50 pts/day, $29/mo 1,500/day, $79/mo 4,500, $149/mo 10,000; points per UPC call not confirmed | cache max 1 hour then must delete; free plan needs a backlink | live | no, 1-hour cache limit and food only |
| Syndigo | not confirmed | not confirmed | not confirmed | not published, sales contact only | brand-to-retailer syndication, no public API found | not confirmed | no |
| 1WorldSync (now part of Syndigo) | not confirmed | not confirmed | not confirmed | not published | trading-partner data sharing via GS1's network, no public lookup API found | not confirmed | no |
| Salsify | not confirmed | not confirmed | not confirmed | not published, demo only | login per organization, appears to cover only the customer's own catalogue | live, customers only | no |
| Icecat | GTIN/EAN/UPC, brand+code | Brand, name, category, specs incl. dimensions, images | not confirmed | Open Icecat free but only for "sponsoring brands" (others get error 9); Full Icecat price not confirmed | images must be downloaded/stored not hotlinked; some brands restrict reseller access | live | supplement for electronics/durables only |
| Wikidata (GTIN property P3962) | GTIN via SPARQL | Name, brand, editor-entered; size inconsistent | not confirmed | free, public endpoint | CC0, no attribution needed | live, rate limits not confirmed | free last-resort pass; grocery coverage likely sparse, unmeasured |
| Semantics3 | not confirmed | not confirmed | not confirmed | not confirmed, domain does not resolve (DNS failure) | not confirmed | not confirmed | no, appears shut down |
| Buycott | UPC-A/E, EAN-13/8, ISBN, ASIN | Name, description, images, category, brand, price; claims 150M+ products | not confirmed | $49/mo 500/day, $99/mo 15,000/day, $499/mo 100,000/day, overage $0.09/100 | not confirmed | live, batch up to 10 barcodes | possible supplement, confirm who currently operates it first |
| EAN-DB (ean-db.com) | EAN/UPC/ISBN | Title, category, manufacturer, images, ingredients; 70.7M products, manufacturer on 86%, images on 41% | not confirmed | 250 free calls, then EUR9/5,000, EUR69/50,000, EUR249/300,000 (~EUR0.0008-0.0018); bulk EUR0.005/barcode | terms page 404, not confirmed | live | most promising new supplement, cheap and large catalog, test on Canadian barcodes |
| Open Products Facts | barcode | Non-food/cosmetics/pet-food general goods, ~46,000 products | free, open project | free | "anyone can re-use it for any purpose" | live | free extra step for non-food, non-beauty items, same family as Shin's current chain |
| EANdata.com | barcode | not confirmed | not confirmed | limited free tier, paid not published, accounts must be manually enabled | "not to be reproduced without prior permission" | not confirmed | not confirmed, gated signup |
| barcode.monster | barcode | consumer lookup, 5.5M+ items | not confirmed | no API found on homepage | n/a | n/a | no, no API |
| GS1 US Data Hub API | GTIN | not confirmed | no, US-scoped | 60-day free trial, then US$6,500 flat unlimited add-on | not confirmed | not confirmed | no, wrong country |
| GEPIR | GTIN | company data only | n/a | n/a | discontinued end of 2023, replaced by Verified by GS1 | n/a | dead, do not use |

## 2. Price sources: retailers, marketplaces, flyers, crowd data

| Source | Input | Output | Canada | Price per call | Terms that matter | Latency | Verdict vs current DataForSEO google.ca call |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Amazon Creators API (PA-API 5 successor) | ASIN, keyword | product details; price/offer fields not confirmed | confirmed, Canada listed in supported locales | free but needs 10 qualifying sales in 30 days first; PA-API 5 old apps get HTTP 403 | affiliate-only, gated on Amazon sales | live | add later for amazon.ca only, not usable at launch |
| eBay Browse API | keyword, category, ePID; GTIN reported | price, availability, seller | not confirmed, developer.ebay.com returned 403 | not confirmed | production access needs eBay Partner Network approval; possible ban on mixing eBay content with other content in a public display | live | maybe, marketplace listings not shelf prices, read the licence first |
| Best Buy Canada API | product/store query | price, availability | no, dead: GitHub issue open since Jan 2021, "no response from server"; US API is US/Puerto Rico only | n/a | n/a | n/a | no |
| Walmart affiliate (Impact) / walmart.io / walmart.ca Marketplace API | feed or link generation; CA API is for sellers | feed prices/links; CA seller API only lets sellers set their own prices, does not read prices | walmart.io US only; walmart.ca affiliate via Rakuten not confirmed | not confirmed | seller API needs approved seller account | batch feed | no, no live price lookup for walmart.ca exists |
| Kroger API | product/location query | price, availability | no, no Canadian stores, no Canada in docs | not confirmed | partner tier needs signed contract | live, US only | no |
| Instacart Developer Platform / Connect | product search, postal code + country, cart | product data, carts; whether prices come back not confirmed | Instacart operates in Canada with Loblaw, Sobeys, Walmart CA, Costco per Instacart's own blog; API docs do not name Canada | not published, "negotiated individually" | Connect built for retailer partners | live if approved | needs a partner inquiry, the only approved route to many Canadian grocers at once |
| Loblaw / PC Express | n/a | n/a | no public API | n/a | terms reportedly ban bots/scraping, exact page not confirmed | n/a | no first-party route, only unofficial scrapers |
| Voila by Sobeys | n/a | n/a | no API found | n/a | none found | n/a | no |
| Canadian Tire | unknown | unknown | developer.cantire.com exists but its cert is expired and no public signup found | not confirmed | not readable | n/a | no, for now |
| Costco Canada | n/a | n/a | no price API, only a US membership-referral affiliate scheme found | n/a | most prices need a member login | n/a | no |
| Metro / IGA | n/a | n/a | no API | n/a | n/a | n/a | no |
| Flipp | not published | flyer prices, gated | confirmed, Toronto company, Canadian flyers, ~12 major chains | no public pricing, FAQ sends integration questions to "book a call" | partner programme only | unknown | worth a sales call, the single broadest Canadian sale-price source found |
| Reebee | n/a | n/a | Canada | none published | owned by Flipp | n/a | same route as Flipp, not a second source |
| Open Prices (Open Food Facts) | barcode, location, currency, date | price, store, date | confirmed but thin: live query returned 667 CAD prices in total | free | ODbL, commercial use allowed with attribution, dataset changes shared back | live | free extra layer at best, far too sparse to be a main source |
| Fetch Rewards | n/a | n/a | not confirmed from a primary source (secondary source says no) | n/a | n/a | n/a | no |
| Checkout 51 | n/a | reports for brands, not a price feed | confirmed, Toronto | brands pay per redeemed coupon, no data sold | contact form only | n/a | no |
| Keepa | ASIN | price history, offers | not confirmed, site scripts blocked fetch | not confirmed (third-party quotes EUR49/mo+) | not confirmed | live | unverified, Amazon only |
| PriceAPI.com | URL, keyword, GTIN | price, availability, seller | "among supported markets" per docs, no Canadian store list | not confirmed, pricing page empty, 1,000 free trial credits | not confirmed | queued jobs | unverified |
| Traject Data Rainforest API | ASIN, keyword, URL | price, buy box, seller | confirmed: "US, UK, DE, FR, CA, IN" | $23/mo 500 credits (~$0.046 ea) down to Production $375/mo 250k (~$0.0015), annual billing | terms not read | live or webhook | add for amazon.ca, bypasses Amazon's 10-sale gate, costs about today's call at Production tier |
| Oxylabs E-Commerce Scraper API | URL, keyword | parsed JSON | not confirmed, generic "195 countries" claim | Amazon $0.50/1,000, Google $1.00/1,000, other sites $1.15/1,000 | bans reselling/sublicensing without written agreement; customer must respect target site's own terms | live, usually under 10s | possible scraper backbone, no Canadian stores documented, resale clause needs legal read |
| Zyte API | URL | parsed product JSON | not specified | plain requests $0.13-1.27/1,000; browser-rendered $1.01-16.08/1,000 PAYG | terms not read | live | possible backbone, real per-Canadian-store cost unknown until tested |
| Bright Data Web Scraper API | URL, keyword, SKU | price, availability, seller | not confirmed, no .ca stores named | free 5,000 records/mo, then $1.50/1,000 | bans reselling the service "in whole or in part" without authorization | batch, likely async | possible backbone, resale clause needs reading |
| Apify Loblaws Grocery Scraper (community actor) | store group, keyword/category, postal code; no barcode input | name, price, sale price, unit price, store | confirmed: 12 Loblaw store groups, all provinces | US$0.70/1,000 results | scraping likely breaks Loblaw's terms; single-maintainer actor, 125 users | async run | best grocery add-on found, but name-search only and terms/maintainer risk |
| Apify Sobeys Grocery Scraper (community actor) | store group, keyword/category | name, price, sale price, unit price, store | confirmed: 6 Empire store groups, ~64k SKUs | US$0.75/1,000 + $0.00005/start | same terms risk as above | async run | same verdict as Loblaws actor |
| Datasembly | not self-serve | dashboards, 3+ years history | not mentioned, "US alone" language on site | contact sales only | business subscription | managed product | no, wrong shape for a per-scan lookup |
| Savvi Prices Grocery Data API | item list + postal code | matches with unit prices, sale flags | confirmed: 16 Canadian chains (12 Loblaw groups, Save-On-Foods family, T&T) plus Costco, delivered via Apify | not published | not confirmed | not confirmed | best-shaped Canadian grocery source found, needs a pricing inquiry |
| Metoda Price API | GTIN | Amazon, eBay, Google Shopping in 30+ countries incl. Canada | confirmed | EUR99/mo 5,000 credits up to EUR1,499/mo 500,000 | monthly minimum | not confirmed | possible add for GTIN-keyed cross-retailer pricing, confirm terms |
| Sovrn Price Comparison API | product URL | merchant, price | not confirmed | not confirmed | not confirmed | not confirmed | unverified |
| OpenWeb Ninja | not confirmed | price monitoring, names Walmart Canada and Costco Canada | claimed, not independently confirmed | not confirmed | not confirmed | not confirmed | unverified |
| Price2Spy | not confirmed | competitor price monitoring | not confirmed | API only on Premium tier, priced on request | business subscription | not confirmed | no |
| Google Content API for Shopping | merchant's own feed | merchant's own listings only, not competitor prices | n/a | free, quota-based | deprecated, sunset Aug 18 2026, "progressive errors" from Sept 1 2026 | n/a | no, dead and wrong shape (own listings only) |
| Google Merchant API (Content API's replacement) | merchant's own account | same own-account-only shape | n/a | quota-based, no per-call billing found | same own-account restriction | n/a | no, never designed to answer cross-retailer price questions |
| Statistics Canada Food Price Data Hub | n/a | free national average prices, not per store | Canada | free | government open data | n/a | background context only, not a per-scan source |
| Barcode Lookup (price-history feature) | barcode | product identity, historical pricing, merchant offers | not confirmed | not confirmed | not confirmed | live | needs direct verification |

## 3. SERP resellers and Google's own APIs

| Source | Input | Output | Canada | Price per call | Terms that matter | Latency | Verdict vs today's DataForSEO google.ca Live call |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DataForSEO Google Organic SERP Live (current) | query | Google's shopping box | confirmed, google.ca | Live $0.002; Priority $0.0012; Standard/queued $0.0006 | "SERP data shall not be used to compete with or adversely affect the business interests of the search engine providers"; task results retrievable free 30 days | Live ~6s, Priority ~1min, Standard ~5min | baseline; the Standard queue is a same-vendor add for background refresh, not the real-time fallback |
| DataForSEO Google Shopping (Merchant) API | keyword + location | full list of Google Shopping offers, stores+prices | google.ca via location params | $0.001/40 results standard (up to 45 min) or $0.002 priority (up to 1 min); no live/synchronous mode | same provider as today | queued only | add for a background refresh path, many more stores per lookup, not for the in-session fallback |
| SerpApi | keyword; dedicated Google Shopping endpoint | organic + shopping | confirmed via google_domain=ca/gl=ca | Starter $25/mo (1,000) down to ~$1.96-1.97/1,000 at 30M+/mo | bans resale/exploitation of results; Google sued SerpApi Dec 2025 (DMCA claims dismissed July 2026, ToS-breach exposure unresolved) | live | no at Shin's volume, 5-12x DataForSEO Live, plus active litigation exposure |
| SearchAPI.io | keyword; Google Shopping/Product Offers endpoints | shopping data | confirmed gl=ca (google_domain param superseded per their own docs) | Developer $40/mo (1,000) down to $1/1,000 at 5M/mo tier | explicit resale ban without written consent | live, rate-limited to 20% of credits/hr | no at entry volume, 20x DataForSEO Live; only competitive at 5M+/mo |
| Scrapingdog | keyword; Google Search + Google Shopping APIs | shopping | confirmed via country=ca | entry $2/1,000, Pro $0.667/1,000, enterprise $0.333-0.378/1,000 | not confirmed, terms page 404 | live, failed requests not charged | no at entry volume, matches DataForSEO Live only |
| ValueSERP | keyword; search_type=shopping | shopping | confirmed via gl/google_domain/location | PAYG $2.50/1,000, packs from $2.00/1,000 down to $0.90/1,000 at 1M | not confirmed | live | no, pricier than DataForSEO Live at every checked tier |
| HasData | keyword | Google SERP incl. shopping block | confirmed via gl string, 245 codes | Startup $59/mo (20,000, ~$2.95/1,000) down to $0.69/1,000 at Growth tier | not confirmed | live, failed requests not charged | no at entry volume |
| Zenserp | keyword | SERP incl. shopping/knowledge graph | not independently confirmed for CA | $49.99/mo 25,000 (~$2.00/1,000) down to $0.90/1,000 at 1M | not confirmed | live, only successful responses billed | no |
| Serper | keyword; dedicated /shopping endpoint | shopping | gl=ca supported per docs (CA listed among 74 Shopping countries per third-party source) | not confirmed from Serper's own page (404 on fetch); third-party figures claim $0.30-1.00/1,000 | separately confirmed in Shin's own docs: "business-to-business service... does not provide end-user (consumer) services" | advertised 1-2s, unconfirmed independently | conflicts with a consumer app per its own terms; even if cheap, this is a hard no, not a maybe |
| Serpstack | keyword | SERP incl. shopping | not confirmed | Free 100/mo, Basic $29.99/mo 5,000 (~$6.00/1,000) | not confirmed | live | no, pricier than DataForSEO Live at every visible tier |
| SerpWow | keyword | SERP | not confirmed | "$45-2,000/mo" range only, no per-call figure confirmed | not confirmed | live | not confirmed, insufficient to rank |
| Apify Google Shopping Scraper actor | keyword | per-product Google Shopping listings | not confirmed for Canada | $0.004/product + $0.008/product for retailer links | Apify platform ToS, actor-specific terms not confirmed | queued, actor run | no, 2x DataForSEO Live and queued not live |
| Google Custom Search JSON API | keyword | general web organic only, no Shopping vertical | n/a to shopping use case | $5/1,000 beyond 100 free/day, capped 10,000/day | governed by Google APIs ToS + Programmable Search Engine ToS; closed to new customers, existing must migrate off by Jan 1 2027 per reporting | live | no, 2.5x pricier, returns no shopping data, being sunset |

## 4. Top alternatives to Shin's chain, ranked

1. **GS1 Canada / ECCnet Registry as the primary identity source, ahead of Open Facts.** Why: it is
   the only confirmed Canadian, bilingual, 700,000+-product registry found in this whole sweep, built
   for exactly this purpose. Reversing fact: no self-serve signup or published price exists; a phone
   call to GS1 Canada could return "enterprise only, six-figure minimum" and kill this outright.

2. **Add EAN-DB and Open Products Facts as extra free/cheap identity fallbacks before the shopper
   types a name.** Why: EAN-DB is large (70.7M products) and cheap (~EUR0.0008-0.0018/call after 250
   free) with no resale ban found; Open Products Facts is free and covers non-food items the current
   Open Facts family misses. Reversing fact: neither has confirmed Canadian coverage; both need
   testing against real Canadian barcodes before trusting them.

3. **Traject Data Rainforest API for amazon.ca pricing, in place of waiting on Amazon's Creators API
   sales gate.** Why: Amazon's own affiliate API needs 10 sales in 30 days before it works at all;
   Rainforest has confirmed Canada coverage today and costs about the same as today's call at its
   Production tier. Reversing fact: its terms were not read in this pass, and it only covers Amazon,
   not the multi-store comparison Shin needs.

4. **DataForSEO's own Standard/Priority queue as a background price-refresh path, separate from the
   real-time Live fallback.** Why: same vendor, zero new integration, 3.3x to 1.7x cheaper than the
   Live call, and the Merchant/Shopping endpoint returns many stores per lookup instead of one shopping
   box. Reversing fact: it is queued (1 to 45 minutes), so it can never answer a shopper standing at
   the shelf; it only helps the repeat-scan cache's periodic refresh, not the cold-scan fallback.

5. **Savvi Prices Grocery Data API and the Apify Loblaws/Sobeys grocery scraper actors, as a
   Canada-specific grocery layer ahead of the general Google SERP call.** Why: Savvi names 16
   Canadian grocery chains by name and Google Shopping returns at most 1 to 3 correct matches out of
   40 per the existing walkthrough, so a grocery-specific source could raise the hit rate directly.
   Reversing fact: Savvi's price is unpublished (needs a sales inquiry) and the Apify actors scrape
   sites whose own terms likely ban it (Loblaw's terms were quoted elsewhere in Shin's docs as banning
   bots), so both carry real legal exposure the current chain does not.

No SERP reseller found beats DataForSEO's existing $0.002 Live google.ca call at Shin's actual
fallback-only call volume; every alternative reseller either matches or costs more, unless volume
reaches the hundreds of thousands to millions of calls a month. Serper specifically is a hard no
regardless of price, its own terms say business-to-business only.

## 5. Recall control

**Providers named in the existing Shin docs that this sweep did NOT surface on its own** (from
`cheap-scan-pipeline-2026-09-22.md`, `scan-pipeline-v2-2026-09-22.md`, and section 1 of
`cheap-lookup-logistics-2026-09-23.md`, read only after the sweep above was written):

- Project Hammer (jacobfilipp.com/hammer, 8 Canadian grocers), missed entirely
- SearXNG (self-hosted, no Shopping engine), missed entirely
- ShopSavvy (data API, $49-499/mo tiers, competitor's tiered-ingestion method), missed entirely
- Vynn (Canadian competitor app, read-only MCP server), missed entirely
- Impact.com (affiliate network with a GTIN field, Best Buy/Canadian Tire/Home Depot Canada run on
  it), missed entirely; also missing from this sweep's own seed list, a gap in the sweep's design,
  not just its search
- AWIN (affiliate network, gtin field confirmed in its Enhanced Feed spec), same gap as above
- Rakuten Advertising (Walmart's affiliate network), mentioned only in passing by one sub-agent
  ("Walmart affiliate via Rakuten: not confirmed"), never given its own row or terms check
- heisse-preise.io (Austria, open-source, never cross-matches), missed, cited in Shin's docs as a
  comparison case, not a Canada source
- cijene-api (Croatia, open price law), missed, same comparison-only role
- Staples.ca / Giant Tiger / Shoppers Drug Mart JSON-LD product-page markup, missed entirely, this
  sweep never searched for schema.org scraping of individual Canadian retailer product pages
- PC Express reverse-engineered API (`FireBall1725/pcexpress-mcp-server`), missed; the sweep found
  "no public API" for Loblaw but never found the unofficial reverse-engineered repo Shin's docs cite

**What this measures:** 11 misses. Two (Impact.com, AWIN) were gaps in this sweep's own design, not
its search execution, since Shin's chain description already named them as "later" sources and they
were not included in the seed prompts. The rest (Project Hammer, SearXNG, ShopSavvy, Vynn, Rakuten as
its own entry, heisse-preise.io, cijene-api, the three retailer-specific JSON-LD targets, and the
PC Express repo) are genuine recall failures: none surfaced despite broad searching across three
parallel agents and roughly 96 tool calls and 200+ web searches total.

**New findings from this sweep not in the existing Shin docs:** EAN-DB, Open Products Facts,
EANdata.com, barcode.monster, GS1 US Data Hub API, GS1 Switzerland/UK national API pricing pattern,
GEPIR (confirmed discontinued), Barcode Lookup, EAN-Search.org, upcdatabase.org, Barcode Spider,
Digit-Eyes, Go-UPC, Nutritionix, USDA FoodData Central Branded, Edamam, Spoonacular, Syndigo,
1WorldSync, Salsify, Semantics3 (confirmed dead), Buycott, Verified by GS1, GS1 Registry Platform,
GS1 Canada ECCnet Registry (named but not priced/detailed in Shin's docs), SearchAPI.io, Scrapingdog,
ValueSERP, HasData, Zenserp, Serpstack, SerpWow, Apify Google Shopping Scraper actor, Apify
Loblaws/Sobeys grocery scraper actors, Savvi Prices Grocery Data API, Metoda Price API, Sovrn Price
Comparison API, OpenWeb Ninja, Price2Spy, Statistics Canada Food Price Data Hub, Traject Data
Rainforest API, Oxylabs, Zyte, PriceAPI.com, Keepa, Datasembly, Instacart Developer Platform, Best Buy
Canada API (confirmed dead), Kroger API (confirmed no Canada), Google Content API for Shopping
(confirmed sunset Aug 2026), Google Merchant API.

## 6. Gaps this sweep did not close

- Web search hit its per-session call limit before finishing on the price-sources agent; Prisync,
  Skuuudle, Numerator, and a few Canada-specific query variants never ran.
- Several provider pages returned 403/404 on fetch (Barcode Lookup, Barcode Spider terms,
  EAN-Search.org terms, developer.ebay.com, Semantics3 domain dead), so those rows rest on
  third-party snippets or are marked not confirmed rather than a primary source.
- No source in this entire sweep was tested against actual Canadian barcodes; every Canada-coverage
  "confirmed" above is a claim on the provider's own marketing/docs page, not a measured hit rate.


# Part B


Research date 2026-09-23. WebSearch ran out (200/200) partway through; past that point every
finding below came from WebFetch against named URLs, or from trained-knowledge inference, and
every inference is labelled "inference" in place. No unsourced claim is presented as fact.

## Table 1: Apps and services

| App / service | Identity source | Price source | Matching method | Canada relevance | Cost | Source (checked 2026-09-23) |
| --- | --- | --- | --- | --- | --- | --- |
| Google Lens / Shopping Graph | image match (logos, shape, pattern) against Google's Shopping Graph, 45B+ listings | Shopping Graph, fed by retailer Merchant Center feeds (feed mechanism itself is inference) | image recognition, "exact" vs "visual" matches; ranking undisclosed | live in Canada; in-store local inventory feature launched against beauty/toys/electronics at stores sharing inventory with Google | free to consumer, no public API price found | https://blog.google/products-and-platforms/products/shopping/visual-search-lens-shopping/ |
| Amazon app scanner | barcode/image match to Amazon's own catalogue only | Amazon-first-party listing price, not cross-retailer | barcode + image recognition | Amazon.ca presumed same app (inference, not directly confirmed) | free | https://sell.amazon.com/blog/scan-barcodes-upc |
| Generic "scan to Google/Shopping" apps (ZXing-based "Barcode Scanner"; also Price Scanner Barcode/BuyVia, PriceLens/Cloudaid, Barcode Scanner - Price Finder, QR and Barcode Scanner/TeaCapps, all listed on the Canadian App Store) | barcode only, no owned catalogue | hands the code/query to Google, Amazon, eBay or "major online retailers" and shows what comes back | barcode as a search term, no owned identity resolution | all confirmed listed on the Canada App Store; underlying data not Canada-specific | free, ad-supported | https://en.wikipedia.org/wiki/ZXing checked 2026-09-23; https://apps.apple.com/ca/app/price-scanner-barcode/id728175625 checked 2026-09-23; https://apps.apple.com/ca/app/pricelens-barcode-scanner/id1672178435 checked 2026-09-23 |
| Deal Dish (Canada) | barcode scan | "reads weekly grocery sales and flyers" for Loblaws, No Frills, Superstore, Sobeys, Safeway, Metro | scan a barcode, check it against flyer sale data | Canadian, App Store listing | free (not stated) | https://apps.apple.com/ca/app/deal-dish-grocery-deals/id6739932023 checked 2026-09-23 |
| GroceryChop (Canada) | not stated | crowd-reported prices across "100+ stores," verified by a shopper photographing the shelf tag ("GroceryChop reads it and confirms your report") | user report plus tag-photo OCR confirmation | Canadian App Store listing; released 2026-06-18, 0 ratings, unproven | not stated | https://apps.apple.com/ca/app/grocerychop-compare-prices/id6776418172 checked 2026-09-23 |
| Canadian Grocery Flyers and Deal | flyer items | prices/deals/flyers from Loblaws, No Frills, Superstore and others | cross-store compare, price-drop alerts | Canadian App Store listing | not stated | https://apps.apple.com/ca/app/canadian-grocery-flyers-deal/id6753903055 checked 2026-09-23 |
| Scandit (SDK, not a consumer app) | n/a, provides scan engine (barcode/ID/text/label CV) only, no catalogue or price data itself | n/a | camera-based scan/recognition | enterprise SDK, geography-agnostic (inference); confirmed customers include Instacart, FlashFood (Smart Label Capture for partner item entry), NHS, Decathlon, FedEx | tiered Core/Standard/Advanced, contact-sales, not published | https://www.scandit.com/pricing/ ; https://www.scandit.com/resources/case-studies/yuka/ (cited in Shin's own doc, ties Scandit to Yuka's offline recognition, not independently re-confirmed here) |
| Bing Visual Search | image entity match against Microsoft's index | returns links to "places to buy," not an owned price database; sourcing mechanism undisclosed | image recognition | Bing operates in Canada; API region-agnostic (inference) | consumer tool free; API requires paid Bing Search API subscription | https://learn.microsoft.com/en-us/bing/search-apis/bing-visual-search/overview (Microsoft flags this page as possibly archived) |
| Walmart in-store scanner (Scan & Go / "check a price") | first-party Walmart catalogue | first-party Walmart pricing only | barcode | confirmed operating in Canada per older press; current 2026 footprint not verified (only a stale prior-year report found) | free; Scan & Go self-checkout requires Walmart+ membership, price-check does not | search snippet only, page fetch blocked by CAPTCHA |
| Target in-store scanner | first-party Target catalogue | first-party Target pricing only, separate price-match-at-checkout policy for select online competitors | barcode | **not applicable: Target closed all 133 Canadian stores by April 2015 and has not returned** | free | https://www.cbc.ca/news/business/target-closes-all-133-stores-in-canada-gets-creditor-protection-1.2901618 |
| ShopSavvy | proprietary UPC/EAN/ISBN/ASIN/MPN database, construction method undisclosed | claims real-time checks across "tens of thousands of retailers" via own API/feeds; three tiers per Shin's own prior research: crawled product markup, merchant feeds, formal data partners | barcode scan, sub-1-second, ranking undisclosed | not stated on public pages; inference: US-heavy coverage | consumer app free, unlimited scans; Data API $49/mo (1,000 credits) to $499/mo (50,000), enterprise custom | https://shopsavvy.com/data |
| Basket | crowdsourced: predecessor app StockUp (2014) paid users to scan and log in-store prices; later added ML | same crowdsourced base, 1M+ items across 165,000 US stores (Walmart, Target, CVS, Walgreens, Sam's Club, Whole Foods) plus Amazon/Jet.com online | barcode scan against crowdsourced DB | not mentioned; US-only per this source (inference: no Canada) | not stated; app appears to have shut down/changed hands as of a 2026 notice found | https://techcrunch.com/2015/12/16/baskets-new-app-helps-you-find-the-best-prices-on-groceries/ |
| Vynn | barcode scan against its own Canadian retailer database (30+ named, incl. Loblaws, Metro, Walmart, Costco, Sobeys) | "nightly-observed" prices per Shin's own prior research; site itself does not disclose sourcing method, implies partial/gapped coverage | barcode scan, unit-price compare | Canada-only, confirmed | free at fall-2026 launch; currently pre-launch/waitlist; its read-only MCP API returned 503 "not available" when probed 2026-09-22 | https://vynnapp.com |
| Flipp | retailer-supplied flyer/merchandising feeds ingested directly ("transfer all your merchandising and savings content from any source"), not scraping | same flyer feeds; monetized by retailers paying to publish and brands paying for placement | flyer/item matching; **no primary evidence found of barcode scanning** in this app | strong Canadian signals (Canadian media partners, French-language support); HQ not confirmed in fetched pages (widely reported Toronto-based, treated here as inference) | free to consumers | https://corp.flipp.com/ |
| Honey (PayPal) | n/a (coupon/checkout tool, not identity) | browses 30,000+ retailer sites for codes, tests them at checkout; "Droplist" watches saved items for price drops, mechanism (scrape vs feed) undisclosed | client-side, operates at checkout across participating sites | site shows a Canada region option (not explicitly confirmed as full feature parity) | free to consumer; monetized via affiliate commission (industry-standard, inference) | https://www.joinhoney.com/ |
| Klarna | not built in-house; acquired PriceRunner in 2022 for "product discovery, price comparison and review tools" | PriceRunner's feeds (see below); Klarna's own data is BNPL transaction data, not retailer price feeds | inherited from PriceRunner | unclear; Klarna states "26 countries" without listing them | comparison feature free to consumer; Klarna monetizes via merchant/BNPL fees | https://en.wikipedia.org/wiki/Klarna |
| PriceRunner / PriceSpy | hybrid: "screen scraping retailers' websites and files supplied by the retailers themselves" | same hybrid feed; PriceSpy (sister Nordic/UK brand, same corporate lineage) could not be independently confirmed this session | fuzzy-logic automated matching plus manual staff review | Sweden/Denmark/UK/US operation at various points; **no Canada operation found (inference)** | pay-per-click advertiser model | https://en.wikipedia.org/wiki/PriceRunner |
| Keepa | ASIN-based Amazon product data | complete price histories/marketplace offers via a token-bucket API; underlying crawl method undisclosed | ASIN match | domain parameter implies multi-marketplace support; amazon.ca not explicitly confirmed (inference: likely supported, unverified) | token-based paid API tiers, amounts not captured | https://api.keepa.com/ |
| CamelCamelCamel | ASIN-based Amazon product data | direct Amazon price tracking; suspended in some regions during COVID at Amazon's request, implying scraping/crawling rather than a licensed feed (inference from that fact) | ASIN match | **tracks 8 regions including Canada, explicitly confirmed** | free; ~$11,000/month disclosed operating cost | https://en.wikipedia.org/wiki/CamelCamelCamel |
| Trolley.co.uk | n/a (UK grocery only) | 14+ UK stores, "live discount alerts as soon as a price changes," method (feed vs scrape) undisclosed | organizes a shopping list by cheapest store per item | **UK-only, not applicable to Canada** | free, "powered by sponsors" | https://www.trolley.co.uk |
| Yuka | help pages did not state the database source directly; widely reported (inference, unconfirmed by fetch) to use Open Food Facts for packaged food and Open Beauty Facts for cosmetics, plus own curation | **none**, health/ingredient scorer, not a price app | barcode lookup; unknown products can be submitted for later grading | France-origin, expanded to US/Canada/EU (not confirmed by fetch) | free app; no price feature to price | https://help.yuka.io/l/en/ |
| Buycott | own UPC database (claimed 150M+ UPCs) plus crowdsourcing when data is missing | **none**, values/boycott campaign matcher, not pricing | barcode lookup, falls back to user submission | not stated; app appears inactive since ~2016 | not stated; a same-domain 2026 rebrand claims 642M+ barcodes and a paid API with pricing data, not verified as the same entity | https://en.wikipedia.org/wiki/Buycott.com |
| Fooducate | **no primary evidence found**; help center blocked, no Wikipedia article | none confirmed | unknown | unknown | unknown | none reachable this session |
| MyFitnessPal barcode scanner | help/about pages blocked (403); widely reported (inference, unconfirmed) to be predominantly crowd/user-submitted, with Nutritionix reported as a supplier in some periods | **none** | barcode lookup | not confirmed | premium tier exists since 2015; scanner itself free | https://en.wikipedia.org/wiki/MyFitnessPal (existence of premium tier only) |
| Cronometer barcode scanner | "database of over 1M verified foods," company states it verifies entries; underlying blend (USDA / Canadian Nutrient File / manufacturer) is inference, not confirmed by fetch | **none** | barcode scan | Canadian Nutrient File inclusion would imply Canada relevance but is not confirmed by a fetched source | free tier; paid "Cronometer Gold," amount not shown | https://cronometer.com/ |
| Checkout 51 (Canada) | n/a | **none as cross-store comparison**, this is a receipt-based cashback app; "barcode offers" scan a purchased product's barcode only to verify a specific rebate | barcode scan used for rebate verification, not price lookup | Canadian app | free, cash out at $20 | https://support.checkout51.com/hc/en-us/articles/115011661587-What-is-a-barcode-offer- |
| Flashfood (Canada) | partner-store employees scan barcodes via Scandit's Smart Label Capture to list surplus items | first-party, set by the partner store (discount on near-date stock) | barcode scan (partner side); browse/buy, not price comparison (consumer side) | Canadian app, partners include Loblaws, Giant, Tops, Meyer | free to browse; savings up to 50% off listed items | https://flashfood.com/en/press/Flashfood-Launches-Flashfood-For-Partners-a-New-App-for-Grocers |
| PC Optimum / PC Express (Canada) | first-party Loblaw-banner catalogue | first-party Loblaw pricing/loyalty only; **no cross-retailer comparison found or confirmed** (inference from absence, not a direct statement) | n/a | Canadian, Loblaw-banner only | PC Express Pass $2.50/mo promo, $99/yr regular | https://en.wikipedia.org/wiki/PC_Optimum |
| Instacart Canada | per-retailer catalogue, one retailer per order | per-retailer pricing (often marked up vs in-store, general industry knowledge, inference); **no cross-retailer comparison found** | n/a | Canadian since Nov 2017 (Loblaw, Toronto/Vancouver), expanded to Metro/Giant Tiger/Galleria (2022), Whole Foods Canada (2024) | delivery/service fees, varies | https://en.wikipedia.org/wiki/Instacart |
| Gofer.run (Canada) | not disclosed on its own page | claims "real-time pricing," "weekly flyer specials," and a "snap + search all stores" photo feature to find products and pricing; underlying method (scrape/feed) not disclosed | photo/text search across stores, method undisclosed | Canadian, built in North Bay, Ontario; claims ~25% average savings | free | https://www.cbc.ca/news/canada/sudbury/gofer-run-9.7116628 |
| GroceryPulse.ca (Canada) | n/a (index/comparison tool, not per-product identity) | **explicit scheduled scraping**: "data from public retailer websites," collected weekly (Thursdays, Friday backup if coverage <90%) | fixed 50-item standardized basket, stores must match ≥48/50 items to rank; "matched-model weighted Jevons" index (IMF/Eurostat method) | Canadian, 12 cities, retailers include Loblaws, No Frills, Real Canadian Superstore, Metro, Food Basics, Sobeys, FreshCo, Farm Boy, IGA, Safeway, Maxi, Super C | free | https://grocerypulse.ca/ |
| eezly (Canada) | not disclosed | claims 40M+ grocery prices across 2.7K+ stores and 28 banners in Canada, tagline "every price already checked" (implies scheduled/batch collection); method not disclosed | not disclosed | Canadian | not disclosed | https://eezly.com/ |

## Table 2: Whole approaches Shin's chain does not use

| Approach | Who ships it | How it works | Canada relevance | Cost | Source (checked 2026-09-23) |
| --- | --- | --- | --- | --- | --- |
| Shelf price-tag OCR at the point of shelf | Trax (traxretail.com): "automated price detection" from shelf images, billions processed yearly, CPG clients incl. AB InBev, Unilever, Heineken, Labatt (Canada via Labatt is inference). Focal Systems: shelf-edge cameras (Morrisons, ShopRite, Village Super Market), price-audit as an adjacent capability to out-of-stock detection. Google Lens does general camera OCR of any printed text, not price-specific. | fixed/robot/staff-captured shelf images processed by CV for price and planogram compliance | Canada relevance via Labatt is inference only, not confirmed for Trax/Focal directly | not disclosed (enterprise, demo-gated) | https://en.wikipedia.org/wiki/Google_Lens ; Trax content from traxretail.com |
| Receipt-scanning crowd prices | Fetch Rewards, Receipt Hog: users photograph any store receipt for cash/points; Fetch states "verified purchases reveal how, where and when people purchase" and reports "Observed GMV" to brand partners | aggregated, monetized B2B to CPG brands (Numerator is the likely downstream aggregator, inference on that link); **not exposed as a public per-store price database to consumers** | not confirmed for Canada | not disclosed | https://business.fetch.com/ ; https://www.receipthog.com/ |
| Flyer/circular ingestion as a price source | Flipp: "Content Collection" step transfers merchandising/savings content "from any source" into structured item-level data; exact OCR-vs-manual-vs-feed mix not disclosed. Separately: an undocumented, keyless public backend, `backflipp.wishabi.com/flipp/items/search` (params `q`, `postal_code`), returns merchant, item name, price, unit price and valid_to, no login and no API key; at least 5 GitHub projects use it, one running a daily 6am ET job over Maxi/Super C/Metro/IGA/Provigo/Walmart/Costco with bilingual fuzzy matching, and it returned HTTP 429 when looped. **This directly contradicts Shin's own doc's line "Flipp and reebee: licensed flyer data from retailer partnerships, no public API."** Flipp's Terms of Use were not read, so legality of automated use is unconfirmed. | retailer-supplied content turned into structured, item-level flyer data | Flipp is Canada-relevant (see Table 1); the backend is queried by Canadian postal code | free to consumer; the backend is free but unrate-limited-safety unconfirmed | https://corp.flipp.com/ checked 2026-09-23; https://github.com/thomas-chong/flipp-cli checked 2026-09-23; https://github.com/alexoutest2000-del/grocery-price-tracker checked 2026-09-23 |
| Retailer internal/partner APIs used by third parties | Kroger runs an official public developer API (developer.kroger.com); at least 10 GitHub projects wrap it (CupOfOwls/kroger-api, CupOfOwls/kroger-mcp, jayhogan/clicklist-client, agg23/kroger, others) | third parties register for API keys and build clients against a retailer's own official public API | **no Canadian retailer example found this session** (Walmart/Target/Loblaws wrapper repos did not surface; search-limited, not evidence of absence) | free/developer-tier (typical for this API class) | GitHub search results via WebFetch |
| Crowd-submitted prices | Open Prices (Open Food Facts' sister project): live REST API + web/mobile UI where users manually submit a price "from a shelf image" or "from a receipt," open-sourced under the Open Food Facts org | same crowd-contribution model as Open Food Facts' product data, applied to price instead of identity | same global/Canada coverage uncertainty as Open Food Facts itself (crowd density dependent) | free, open API | https://openfoodfacts.github.io/open-prices/ |
| On-device / package-only product recognition (no barcode) | Google Cloud Vision Product Search: matches a query photo against a retailer's own product-image set by visual similarity, no barcode required; Google flags it "in maintenance mode," superseded by Vision Warehouse. Google Lens does the same as a consumer feature. | image embedding + nearest-neighbour match against a merchant-supplied product-image index | not Canada-specific; global cloud API | $300 trial credit; further pricing not retrieved | https://docs.cloud.google.com/vision/product-search/docs |
| Store-by-store price scraping on a schedule (batch, not per-scan) | Profitero: "accurate, complete daily data" across 1,400+ retailers in 70+ countries, 40TB+ dataset, serves 9,000+ CPG brands (3M, P&G, Kraft Heinz, etc.) | nightly/scheduled crawl of retailer sites, contrasted with a live per-scan query | not confirmed for Canada on the fetched page (GroceryPulse.ca and eezly in Table 1 are the confirmed Canadian instances of this same architecture) | not disclosed, demo-gated | https://www.profitero.com/ |
| Licensed data from a retail panel or aggregator | Circana (formerly IRI): tiered "Liquid Data" products (Go/Engage/Collaborate/Essentials) combining POS measurement with AI image-recognition store audits, sold to CPG brands/retailers. GS1 Canada's ECCnet: a real, Canada-specific industry product-data registry (eCommerce content, nutrition content, planogram, pharma content) under "TrueSource," login-gated. Caution for anyone tempted to use GS1's own registry as an identity source instead: GS1's GEPIR / "Verified by GS1" lookup returns only the brand-owner company behind a GTIN, not the product name or size, per a prior GEPIR check in this sweep (inference that Verified by GS1 has the same limit, not independently confirmed) | brands/retailers pay for syndicated measurement and product-content data, not built for consumer per-scan lookup | GS1 Canada ECCnet is explicitly Canada-specific and confirmed real; Circana Canada presence not confirmed | sales-gated, no public pricing found for either | https://www.circana.com/solutions/ checked 2026-09-23; https://www.gs1ca.org/pages/eccnet/ checked 2026-09-23; https://en.wikipedia.org/wiki/GEPIR checked 2026-09-23 |

## Alternatives worth testing against Shin's chain, ranked

1. **Flipp's undocumented, keyless public flyer-search backend (`backflipp.wishabi.com/flipp/items/search`,
   query by postal code) as a free Canadian price tier ahead of the paid search.** Why: it is already
   working with no login and no API key, returns merchant, item name, price, unit price and expiry, is
   used by at least 5 public GitHub projects (one running a daily job across 7 Canadian chains with
   bilingual fuzzy matching), and a live Canadian consumer app (Deal Dish) already ships scan-to-flyer-
   price on top of it. It also directly contradicts a stated assumption in Shin's own doc that "Flipp
   and reebee" have "no public API." The fact that would reverse it: a 50-barcode test shows flyer
   items rarely match a scanned product by name (flyer data is this-week's-sale only, not the regular
   shelf price, by construction), or Flipp's Terms of Use (not read in this sweep) forbid automated or
   commercial use, or the endpoint's observed HTTP 429 under load means it cannot hold Shin's scan
   volume.

2. **Scheduled/batch price scraping of Canadian retailer sites (GroceryPulse.ca / eezly / Profitero
   model) as a cache layer ahead of any paid search.** Why: two Canadian services (GroceryPulse.ca,
   eezly) already run exactly this at meaningful scale (eezly claims 40M+ prices, 2.7K+ stores, 28
   banners; GroceryPulse runs a weekly, publicly-documented pipeline), proving it is legally and
   practically doable against Canadian grocers. The fact that would reverse it: if intraday price
   changes (a sale starting or ending mid-day) turn out to matter to a shopper standing at the
   shelf, then a 24-to-168-hour-old batch price is stale in exactly the moment Shin promises
   "current" pricing, and Shin's own 6-hour repeat-scan cache is already stricter than either of
   these services claims to be.

3. **Affiliate product feeds keyed by GTIN (Impact, AWIN, Rakuten) as a zero-marginal-cost price
   tier before any paid search.** This was already identified in Shin's own prior research
   (`scan-pipeline-v2-2026-09-22.md`), not by this sweep, so it is listed here as a candidate to
   re-test, not a new finding. Why it is worth testing anyway: it removes matching ambiguity
   entirely, since the barcode is the join key, and it is free with commission upside. The fact
   that would reverse it: if the GTIN field is empty on most Canadian retailer feeds in practice
   (an open UNKNOWN in that same document) or coverage stays limited to the handful of retailers
   already named (Best Buy Canada, Canadian Tire, Home Depot Canada, Walmart via Rakuten), this
   tier answers too few scans to change the average cost, and the paid-search fallback still
   dominates.

4. **Crowd-submitted prices via Open Food Facts' own Open Prices API, not just crowd-submitted
   identity.** Why: Shin's chain already depends on Open Food Facts for identity, so adding Open
   Prices costs an integration, not a new vendor relationship or trust decision, and it directly
   answers the "nobody knows this barcode" case with price, not just name. The fact that would
   reverse it: Open Prices is fed by the same food/grocery-skewed contributor base as Open Food
   Facts; if its Canadian coverage turns out to be near-zero for non-grocery categories (electronics,
   household goods, pharmacy) that Shin also needs to price, it only helps the grocery slice of scans.

5. **A retailer partner/public API (the Kroger precedent), sought directly rather than reverse-
   engineered.** Why: Kroger's own public developer API and the ecosystem of third-party wrapper
   libraries around it (at least 10 found on GitHub) prove that at least one major grocer treats
   this as a legitimate, sanctioned integration path rather than a scraping target, which is a
   different risk profile than the PC Express reverse-engineering Shin's own research already
   flagged as legally risky. The fact that would reverse it: if no Canadian grocer offers anything
   equivalent to Kroger's public API (nothing found in this sweep, and Shin's own research found
   only a reverse-engineered, AGPL-licensed PC Express client), this alternative has no live Canadian
   target today and is a business-development bet, not an engineering one.

6. **Treat Google Lens as the price-lookup layer to benchmark against, not compete with, and put the
   saved effort into the verdict/score layer instead.** Why: Lens already does free, uncapped,
   in-store identify-and-price for a shopper standing at a shelf in Canada, using the same class of
   model Shin calls; Yuka's own growth (cited elsewhere in this repo) shows the score, not the raw
   price list, is the thing people act on and share. The fact that would reverse it: if Lens's
   Canadian coverage turns out to be as thin in practice as ShopSavvy's apparent US-centric coverage
   (nothing found in this sweep confirms Lens's actual Canadian retailer breadth, only that the
   feature exists and launched against beauty/toys/electronics), then Shin's cross-retailer,
   grocery-inclusive breadth is still the real differentiator, and shrinking the lookup-chain
   investment in favour of the verdict layer would be premature.

## Recall control (negative control, sweep done first)

Sweep was completed (all searches run, all fetches attempted, four research clusters run in
parallel plus direct research) before either `C:\shin\docs\scan-pipeline-v2-2026-09-22.md` or
`C:\shin\docs\shipped-scanners-2026-09-20.md` was opened. Below: everything those two files name
that this sweep did not surface on its own, and which of this sweep's findings are new versus
already in those files.

**Misses (named in the Shin docs, not surfaced by this sweep):**

- **reebee**, Canadian flyer/price-match app (Walmart, Giant Tiger, Superstore, Sobeys, No Frills,
  Costco, Super C), named in `shipped-scanners-2026-09-20.md`. Not found by this sweep.
- **Retailer price-match policy as the answer surface** (No Frills, Real Canadian Superstore, Maxi,
  FreshCo, Giant Tiger, Best Buy price-match rules), a distinct approach, not one of the eight this
  sweep was scoped to check, and genuinely new: using a store's own published policy text as the
  "what to do" answer instead of a competitor's live price. Not found by this sweep.
- **Idealo**, named alongside PriceRunner/PriceSpy/Google Shopping as running on merchant feeds, in
  `scan-pipeline-v2-2026-09-22.md`. Not researched by this sweep.
- **Instacart's own engineering blog** stating cross-retailer product matching is "ongoing work,
  unsolved at scale" (company.instacart.com), this sweep only reached Instacart's Wikipedia page,
  not the engineering blog itself.
- **heisse-preise.io** (Austria, open-source grocery price scraper, no cross-matching) and
  **Croatia's cijene-api**, both cited in `scan-pipeline-v2-2026-09-22.md` as examples of
  law-driven open grocery price transparency. Not found by this sweep.
- **Impact.com / AWIN / Rakuten affiliate feed specs carrying a GTIN field**, the specific mechanism
  Shin's own research found (Best Buy Canada, Canadian Tire, Home Depot Canada on Impact; Walmart on
  Rakuten). This sweep found "affiliate networks" only in general terms via PriceRunner/Google
  Shopping's merchant-feed model, not this specific GTIN-field detail.
- **Vynn's MCP server / GitHub repo** (`github.com/todamoonjoey21/vynn-gemini-extension`), this
  sweep found Vynn's marketing site only, not the technical API artifact or its 503 probe result.
- **Staples.ca's schema.org JSON-LD `gtin` markup** as a concrete confirmed example of the
  "crawl product-page markup" tier, this sweep found the general mechanism (via ShopSavvy's
  described tiers) but not this specific retailer example.
- **FireBall1725/pcexpress-mcp-server** (reverse-engineered PC Express login API), this sweep's
  whole-approaches search for retailer-API wrapper repos found Kroger's ecosystem but explicitly
  turned up nothing for Loblaws/PC Express, Walmart, or Target.
- **Project Hammer** (jacobfilipp.com/hammer, price data from 8 Canadian grocers), not found by
  this sweep.
- **The Scandit-to-Yuka tie** specifically (Scandit case study naming Yuka as a customer for offline
  recognition), this sweep found Scandit generally and its other named customers (Instacart,
  FlashFood, NHS, Decathlon, FedEx) but did not independently surface the Yuka case study.

**New (found by this sweep, not named in either Shin doc):** Amazon's own app scanner, Bing Visual
Search, Walmart Scan & Go / price-check, Target's defunct Canadian footprint, Honey/PayPal, Klarna,
Keepa, CamelCamelCamel, Trolley.co.uk, Buycott, Fooducate (absence of evidence noted), MyFitnessPal
and Cronometer's barcode scanners, Checkout 51, Flashfood, PC Optimum/PC Express, Instacart Canada,
Gofer.run, GroceryPulse.ca, eezly, Trax and Focal Systems (shelf-tag OCR), Fetch Rewards and Receipt
Hog (receipt-scanning), the Kroger public API and its GitHub client ecosystem, Google Cloud Vision
Product Search, Profitero (scheduled batch scraping), Circana/IRI, GS1 Canada's ECCnet registry, the
GEPIR/Verified-by-GS1 brand-owner-only limitation, three Canadian scan-to-flyer apps (Deal Dish,
GroceryChop, Canadian Grocery Flyers and Deal) not named in either Shin doc, and Flipp's own
undocumented keyless public backend (`backflipp.wishabi.com/flipp/items/search`) which directly
contradicts the "no public API" line in `scan-pipeline-v2-2026-09-22.md`.

**Already there, confirmed by this sweep too (not misses, not new):** Flipp, Yuka, ShopSavvy,
Google Lens's in-store price/inventory feature, Basket, Vynn (marketing-page level), Open Food
Facts / Open Beauty Facts / Open Products Facts, Open Prices, ShopSavvy's tiered data-sourcing
shape, and the ShopSavvy Data API's approximate pricing.
