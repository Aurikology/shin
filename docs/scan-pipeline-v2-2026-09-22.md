# The scan pipeline, rebuilt from what others ship, 2026-09-22

Jamin, 2026-09-22: *"this is still not refined. You also didn't look at what open source tools exist
or research how other companies online do it."* This file replaces the method in
`docs/cheap-scan-pipeline-2026-09-22.md` step by step. Each step names the company whose method it
copies and the open-source tool that does the work, or says none exists. Everything outside the repo
was read on 2026-09-22 from the source named (GitHub via `gh`, company pages, public API docs,
robots.txt). UNKNOWN means not confirmed in this pass, not evidence of absence.

## 0. What the research changed

1. **Nobody does this with one AI search call.** Every price-comparison company found runs tiered
   data ingestion, with search as the last resort. ShopSavvy's own data page describes three tiers:
   crawl the product markup retailers already publish, take merchant feeds in Google's format, then
   formal data partners (shopsavvy.com/data). Google Shopping, PriceRunner, Idealo and PriceSpy all
   run on merchant feeds.
2. **The barcode is Shin's advantage, not a formality.** Instacart's engineering blog calls matching
   the same product across retailers "ongoing work", unsolved at their scale
   (company.instacart.com). heisse-preise.io (Austria, open source) never cross-matches at all. A
   scanned barcode is the join key those companies lack, so every step below matches on the barcode
   first and on names only when it must.
3. **The feeds with barcodes are free and public.** Impact.com's Partner API documents a `Gtin`
   field (EAN/UPC/ISBN/JAN) next to price (integrations.impact.com, catalogs model). AWIN's feed spec
   documents `gtin` the same way (help.awin.com, enhanced feed spec). Best Buy Canada, Canadian Tire
   and Home Depot Canada run programs on Impact; Walmart runs on Rakuten (network per retailer from
   third-party pages, first-party confirmation UNKNOWN; whether each feed actually fills the GTIN
   field is UNKNOWN until one sample is pulled after approval).
4. **A direct Canadian competitor exists.** Vynn (vynnapp.com): free app, 30+ Canadian retailers
   (Loblaws, Metro, Walmart, Costco, Sobeys named), scans UPC/EAN/GTIN, compares unit prices,
   launching fall 2026. It publishes a read-only MCP server (github.com/todamoonjoey21/vynn-gemini-extension,
   endpoint api.vynn.ai/consumer/mcp/gemini) that looks products up by barcode from "nightly-observed"
   prices. Probed 2026-09-22: every call returns 503 "Account sign-in is not available for this
   channel yet". So their data is not usable today, and their method (nightly crawl of 30+ grocers)
   is the bar Shin is measured against.
5. **Buying the whole answer costs about the same as today.** ShopSavvy's data API: $49 a month for
   1,000 credits, $199 for 10,000, $499 for 50,000; one all-retailer offers lookup is 3 credits, so
   $0.147, $0.060 or $0.030 a lookup. Canada coverage is not stated. At every tier but the top it
   is no cheaper than today's $0.062 (itself derived from one measured scan).

## 1. The rebuilt steps

### Step 1. Read and route the barcode (code, free)

- **Copies:** GS1's own rules; every scanner SDK (Scandit reads, it does not look up).
- **Tools:** `pmigut/gtin-validator` (MIT, pushed 2026-04) for check digits on GTIN-8/12/13/14;
  `gs1/GS1DigitalLinkToolkit.js` (Apache-2.0) for the new QR-style GS1 Digital Link codes that are
  replacing barcodes on some packs.
- **No open-source option found, write in-house (small):** UPC-E to UPC-A expansion (a fixed
  table, about 20 lines) and the variable-measure decoder for store-printed weight and price labels
  (prefix 02 and 20 to 29; layout per GS1 Canada's variable-measure guideline, still to read). No
  repo on GitHub decodes these.
- **Routes before any lookup:** 02 and 20 to 29 read the price off the label; 04 is in-store only;
  978/979 books; 05 and 99 coupons; a GTIN-14 with a packaging digit is a case, not a unit.

### Step 2. The repeat-scan cache (built)

Unchanged from the previous file: identity forever, price refreshed on the next scan after 6 hours.
Vynn and heisse-preise both refresh nightly; a 6-hour price is fresher than either.

### Step 3. Identity: barcode to brand, name and size (free)

- **Copies:** ShopSavvy and Basket key everything on the barcode; Google Shopping requires GTIN.
- **Order:** Shin's own catalogue (local, 618,365 rows marked sold in Canada; needs his ruling
  reversed), then Open Food / Beauty / Products Facts through `openfoodfacts/openfoodfacts-js`
  (Apache-2.0, pushed 2026-09-21; the app already calls the API directly in
  `app/src/open-food-facts.ts`), then UPCitemdb (100 a day free).
- **Rule from the walkthrough (19 barcodes):** trust a name when two sources agree on the brand, or
  it comes from the catalogue or Open Facts and is not on the junk list. The walkthrough found one
  flatly wrong UPCitemdb name (Kirkland water named as a Clinique cream) and two junk Open Facts
  names.
- **Nobody knows it (2 of 19):** ask the shopper to type the name. Basket and Open Prices both grow
  their databases exactly this way; the typed name is saved against the barcode so the next shopper
  never sees the question.
- **Gap:** no Canadian barcode dataset exists on GitHub. `EventideSystems/brocade.io` is archived;
  do not depend on it.

### Step 4. Prices, in four tiers (ShopSavvy's shape, Canadian sources)

Each tier runs only for what the one before missed.

| Tier | Source | Method copied from | Cost | Status |
| --- | --- | --- | --- | --- |
| A | Affiliate product feeds with GTIN: Impact (Best Buy, Canadian Tire, Home Depot), AWIN, Rakuten (Walmart) | Google Shopping, PriceRunner, Idealo, PriceSpy (merchant feeds) | free once approved (inferred from the networks' no-publisher-fee model); also earns commission on click-through | apply now; approval and GTIN fill UNKNOWN |
| B | Product-page markup (schema.org JSON-LD) on retailers that publish a barcode and allow the page in robots.txt | ShopSavvy tier 1 (crawls JSON-LD and Open Graph tags) | free, one page fetch | Staples.ca confirmed (real `gtin` in JSON-LD); Giant Tiger has price but no barcode; Shoppers Drug Mart hides the UPC inside its SKU string |
| C | Shin's own crowd prices: every price a shopper types at the shelf, saved with store and time | Basket (receipt photos, paid human moderators); Open Food Facts Open Prices (`openfoodfacts/open-prices`, AGPL, self-host only) | free | already collecting (874 crowd rows in `price/data/prices.db`); needs moderation before it is shown |
| D | ONE shopping search by brand, name and size, Canada | what every AI-search app does; DataForSEO Merchant or Serper resell Google Shopping | $0.0003 to $0.002 | his call; walkthrough showed barcode search is useless, so this runs on the step-3 name |

What was checked and left out, and why:

- **Loblaw banners (Loblaws, No Frills, Superstore):** `FireBall1725/pcexpress-mcp-server` (AGPL,
  pushed 2026-08-21) reverse-engineers PC Express's private login API. It shows the data exists;
  embedding it breaks both the AGPL (Shin is closed source) and, per below, likely Loblaw's terms.
  Study only.
- **Stealth headless scrapers** (the `frugal` project and similar, which disguise a browser to get
  past bot walls): a court reads that as knowing the site said no. Out.
- **Walmart.ca, Costco.ca, Metro, Sobeys/Voila, Safeway, IGA:** bot walls or robots.txt blocks on
  product or API paths (Costco blocks catalog and API calls; Sobeys and Voila block `/api/`; Walmart
  allows product pages but its terms require written consent for automated access). Only the
  affiliate feed (Walmart) or a partnership reaches them.
- **Amazon.ca:** its robots.txt disallows ClaudeBot on everything; the product API (PA-API 5) is
  being replaced by a Creators API and needs 10 affiliate sales in 30 days first.
- **Flipp and reebee:** licensed flyer data from retailer partnerships, no public API.
- **Project Hammer** (jacobfilipp.com/hammer, 8 Canadian grocers): no stated licence, so not a
  production source; usable to test matching offline.

**Canadian law that shapes tiers B and D** (plain terms, not legal advice): a bare price is a fact
and not copyrightable (*CCH Canadian*, 2004 SCC 13), but Canadian courts have enforced a website's
terms against a scraper without any click-to-agree (*Century 21 Canada v. Rogers*, the Zoocasa
case, 2011 BCSC 1196; *TREB v. Mongohouse*, Federal Court 2019). So tier B reads a page only where
robots.txt allows it AND the terms do not forbid automated access, one product at a time, when a
shopper scans it, never a bulk crawl. Each retailer's terms get read before it is switched on.

### Step 5. Matching (code first, a cheap model last)

- **Copies:** Google Shopping (barcode exact first, then title and image clustering); PriceSpy
  (feeds plus human catalogue review).
- **Order:**
  1. Barcode exact: tiers A, B and C carry the barcode, so most matches need no judgement at all.
  2. Rules on the leftovers (tier D results have no barcode): parse the size with
     `nielstron/quantulum3` (MIT, Python) or, since the server is TypeScript, extract with a small
     regex set and convert with `gentooboontoo/js-quantities` (MIT); then brand, size and pack count
     must agree. `moj-analytical-services/splink` (MIT, 2.4k stars, pushed 2026-09-19) is the
     reference for weighting those agreements, but it runs on Python and batches of records; copy
     its method (score each field, add the scores), not the library.
  3. Only what the rules cannot decide goes to one cheap model call without web search. Fuzzy rules
     alone score about 0.45 F1 on noisy product titles (arxiv 2409.08185), which is why this third
     step exists.
- **Local model option:** Ollama (MIT) or MLX (MIT, fastest on Apple silicon) running a small model
  on the Mac makes step 3 free per call. Accuracy against the paid model is untested.

### Step 6. The answer is code

Unit price, percent against the median, outliers and verdict zones are already plain code in
`identify/src/gauge.ts`; price-match rules in `app/src/price-match.ts`. `jez500/pricebuddy` (1.1k
stars) normalises unit prices the same way, a check that the approach is standard.

**Legal guard:** Competition Act s.52 bars a misleading impression even when each fact is true, and
s.74.01 sets rules on "was $X" style claims. So every price shown carries its store and when it was
seen (four design models out of four also demanded this), crowd prices say they came from shoppers,
and Shin never shows a "regular price" it did not observe.

### Step 7. Fallback

Nothing found in tiers A to D: today's grounded Gemini call runs, so a scan is still one AI call.
Cost stays: average per uncached scan = $0.0025 + f x $0.062, where f is the share of scans that
fall through. Tiers A to C push f down at no per-scan cost; that is where the effort goes.

## 2. Gaps with no open-source answer

1. Variable-measure (weighed item) barcode decoding: zero repos. Write it.
2. UPC-E expansion as a maintained package: none found. Write it.
3. A Canadian barcode dataset: none. Build one from the catalogue plus shoppers' typed names.
4. Canadian grocery prices outside Loblaw: no open repo for Metro, Sobeys, Walmart.ca, Costco.ca,
   Canadian Tire or Best Buy. Countries that have open price apps (Croatia's `cijene-api`, Austria's
   heisse-preise) have them because the law makes grocers publish prices; Canada has no such law.

## 3. Vynn

Same promise (scan, compare, Canada), free, more stores on day one if its claims hold. Where Shin
differs today: exact-barcode matching with the source and time on every price, the shopper's own
shelf price as the reference, and the repeat cache (fresher than a nightly crawl). Worth one hour:
install Vynn when it ships, scan the 19 walkthrough barcodes, record hits and misses. That turns
"30+ retailers" from their claim into a measured number.

## 4. Decisions that are his

1. Apply to Impact, AWIN and Rakuten as a publisher now (free, days to weeks of approval, the only
   step on the critical path that waits on someone else). Needs a public website and a name.
2. Reverse the ruling that keeps Shin's catalogue off the scan path.
3. Allow one paid search (tier D): DataForSEO over Serper, since Serper's terms say B2B only.
4. Ask the shopper to type a name when nobody knows the barcode.
5. Show crowd prices once moderated, labelled as from shoppers.

## 5. The test before building

Unchanged: 50 real beta barcodes, paired against today's call, pass marks fixed first. Added
columns: which tier answered, whether the match was barcode-exact, rules, or model, and the Vynn
result for the same barcode once Vynn ships.
