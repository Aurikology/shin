# The cheap scan pipeline, refined, 2026-09-22

Jamin asked to refine the four-step method in `docs/unit-economics-2026-09-22.md`: every possibility,
edge cases, a manual walkthrough, open-source tools. Outside facts were read 2026-09-22 from the
source named; anything else says estimate. The walkthrough was run by hand the same day.

## 1. Manual walkthrough

### Identity, 19 real barcodes

Barcodes from this repo's scans, cache, notes and a spread of catalogue rows (national brands, three
store brands, a multipack, beauty, electronics, one barcode nobody could identify). Script:
Open Food / Beauty / Products / Pet Food Facts live API, then UPCitemdb's trial endpoint, then
Shin's own catalogue for the misses.

| Result | Count |
| --- | --- |
| Open Facts gave a name | 15 of 19 |
| of those, junk or doubtful | 2 (Stabilo pen returned "Diagnostic Test Product DELETE ME"; Trident gum returned "fruit crunchy bars") |
| UPCitemdb gave a name | 10 of 19 |
| of those, flatly wrong | 1 (Kirkland spring water returned a Clinique face cream) |
| of those, different size | 1 (Nescafe: Open Facts 18 x 22 g, UPCitemdb 18 x 19 g) |
| Shin's catalogue added | 2 (both Epson, named only by model number) |
| No free source knew it | 2 of 19 (060410048108, 0067000008191) |

Also found: this PC's repeat-cache holds `0068100084245` as "Kraft Dinner Original" while Open Facts,
UPCitemdb and the catalogue all say Kraft Smooth Peanut Butter 1 kg. The rows carry test-style
markets (Kazakhstan, Bangladesh), so they look like test fixtures written into the real data folder;
worth checking the Mac's cache for the same.

### Price search, Google Shopping Canada in a browser (what Serper and similar services resell)

| Query | What came back |
| --- | --- |
| The barcode digits `068100084245` | 40 unrelated products (watches, hiking shoes, chargers). **Searching by barcode does not work.** |
| Kraft Smooth Peanut Butter 1kg | 40 results. About 3 are the same single 1 kg jar (London Drugs $5.99, Eraa $7.49, HalalHub $7.99), two of those without the flavour in the title. The rest: other flavours (crunchy, light, extra creamy, roasted), 2-, 3-, 4-, 12- and 15-packs, eBay resellers priced in USD, and one Voila listing titled "12X1KG" at $6.99, a single-jar price. No Walmart or Loblaws listing. |
| Great Value Original Whipped Topping 1 L (Walmart store brand) | Walmart $4.43, and No Name at Real Canadian Superstore $4.50: the store brand has no second seller, but a comparable store brand appears. |
| Epson T543600 (model number from the catalogue) | The exact cartridge at $98.95, a "compatible" copy at $19.95, and about 30 sibling cartridges. |
| Nescafe Cafe cremeux 18x22g (French name from Open Facts) | Stores sell the product as 18 x 19 g ($8.97 Walmart, $9.99 Bulk Mart), with French and English titles mixed and 6-packs, 18-packs and other flavours around it. |

**What the walkthrough changes:** matching is the hard part, not a formality. Out of 40 results
typically 1 to 3 are the same item, and titles are unreliable (wrong pack counts, missing flavour,
changed size). Barcode search is useless, so step 2 must succeed for step 3 to work at all.

## 2. The refined pipeline

0. **Clean the barcode (code, free).** Check digit; pad to 14 digits; expand UPC-E. Route before any
   lookup: prefix 02 and 20 to 29 are store-printed weight or price labels (decode the price in the
   code, no lookup); 04 is in-store only; 978/979 are books; 05 and 99 are coupons; a GTIN-14 with a
   packaging digit is a case, not a unit. Library: `gtin` on npm (maintenance unverified).
1. **Repeat-scan cache (built).** Keep identity forever. Change price refresh from "background every
   hour while scanned" to "on the next scan after 6 hours": a popular item then costs at most 4
   searches a day instead of 24 (derived from `app/src/repeat-cache.ts` constants).
2. **Identity, free, in this order:** Shin's catalogue (local, indexed, 0.017 ms, 618,365 rows marked
   sold in Canada; needs his ruling reversed), then Open Facts live, then UPCitemdb (100 a day free).
   Trust a name only if its brand agrees across two sources or comes from the catalogue or Open
   Facts; reject known junk ("DELETE ME", names that are only a model number get brand + model
   searched instead). Wikidata (CC0) and Icecat Open Catalog are further free sources for brands and
   electronics. **No identity (2 of 19 in the walkthrough): ask the shopper to type the name, one
   field,** and only then fall back to the paid grounded call.
3. **One shopping search by name, brand and size, Canada.** Options:

| Provider | Cost per 1,000 | Risk | Source |
| --- | --- | --- | --- |
| Serper.dev Shopping | $0.30 to $1 | Terms call it a B2B service that "does not provide end-user services"; over 100 outage events since March 2026 on StatusGator | serper.dev/terms, statusgator.com |
| DataForSEO Merchant (Google Shopping) | about $1 to $2 (derived from its $0.001 to $0.002 per task; live versus queued pricing to confirm) | not named in any lawsuit found | dataforseo.com/pricing |
| Bright Data SERP | $1.31 to $1.50 | medium | brightdata.com/pricing/serp |
| SerpApi | $2.75 to $7.50 | **Google is suing SerpApi** (5:25-cv-10826, amended complaint August 2026); terms bar resale | serpapi.com/legal, searchengineland.com |
| eBay Browse API | free, 5,000 calls a day | low; marketplace listings only | developer.ebay.com |
| Open Prices (Open Food Facts) | free | 666 Canadian prices in total, too thin | prices.openfoodfacts.org |
| Project Hammer | free download | 8 Canadian grocers incl. Walmart, Loblaws, Metro, No Frills; no stated licence | jacobfilipp.com/hammer |
| SearXNG, self-hosted | free | no Shopping engine; Google engine widely blocked | github.com/searxng/searxng |

   Walmart.ca's terms require written consent for automated access; Best Buy Canada and Walmart.ca
   have no public price API; Amazon's product API needs 10 affiliate sales in 30 days first.

4. **Filter in code, before any model:** drop non-CAD, used, refurbished, "compatible"/"for <brand>",
   and anything whose title or size says a pack or case the shelf item is not; parse the size from
   the title; convert to unit price (`identify/src/gauge.ts` already does unit price, median and
   outliers as plain code).
5. **Match.** Exact brand + name + size in code first. Only the ambiguous remainder goes to ONE cheap
   model call without web search. Fuzzy rules alone score about 0.45 F1 on noisy product titles
   (arxiv 2409.08185; Zenodo 20089436), so a model is needed for the middle, not for all of it.
   Cheapest sourced options: Gemini 3.5 Flash-Lite $0.30 / $2.50 per 1M tokens; Gemini 2.5 Flash-Lite
   $0.10 / $0.40 (probably blocked for this account like 2.5 Flash; untested); GPT-5 nano about $0.05 /
   $0.40 (secondary sources); Claude Haiku 4.5 $1 / $5. A local model on the Mac (Qwen3 via Ollama)
   is free per call but unvalidated for accuracy.
6. **The answer is code.** Unit price, percent against the median, the verdict zones
   (`identify/src/gauge.ts`) and the price-match rules (`app/src/price-match.ts`) need no model.
7. **Fallback.** Nothing matched: today's grounded Gemini call runs instead of step 5, so a scan is
   still one AI call.

## 3. Edge cases and the guard for each

| Case | Guard |
| --- | --- |
| Store brand, no other seller (Kirkland, PC, Great Value, No Name) | Say so, then show the nearest comparable store brand (the walkthrough found No Name next to Great Value); the repo's alternatives path already has a mode for this |
| Multipack in the results, single in hand (or the reverse) | Compare unit price, never sticker price |
| Size changed under the same barcode (Nescafe 22 g to 19 g) | Prefer the size the shopper sees; show both when sources disagree |
| Listing title wrong ("12X1KG" at a single-jar price) | Unit price far below the median is an outlier; `gauge.ts` already flags lone claims |
| USD prices on google.ca (eBay resellers) | Drop non-CAD |
| Marketplace resellers at 2 to 10 times retail | Keep separate from first-party store prices; never in the median |
| Compatible or refurbished items | Drop by title words and condition field |
| Membership prices (Costco) | Label as membership |
| Shipping not included | Show "+ shipping" unless free delivery is stated |
| Regional grocery prices | Show the store and "online price"; never imply it holds in every branch |
| Price is old | Always show when it was checked (the cache already stores it) |
| Weighed items (02, 20 to 29) | Read the price from the barcode; compare per kg only if a unit is known |
| French-only names | Search with brand + size + both names when the catalogue has both |
| Search service down | Fall back to the grounded call, then to "could not check right now" |

## 4. Cost, refined

Per scan not served from the cache (derived): search $0.0003 to $0.002, matching call about $0.001
only when needed, everything else free. **About $0.002 to $0.003.** The unknown that decides the
average is the fallback share f, since each fallback costs today's $0.062 (itself derived from one
measured scan):

average cost per uncached scan = $0.0025 + f x $0.062

| Fallback share | Average | Against today |
| --- | --- | --- |
| 5% | $0.0056 | 11 times cheaper |
| 10% | $0.0087 | 7 times cheaper |
| 30% | $0.021 | 3 times cheaper |

So the design goal is keeping fallbacks rare: the type-the-name step for unknown barcodes matters
more than which search provider is chosen.

## 5. Decisions that are his

1. Reverse the ruling that keeps Shin's catalogue off the scan path (it is the best free identity
   source for Canada and the only local one).
2. Accept a paid search provider in the path (Serper is cheapest but its terms say B2B; DataForSEO
   looks safer; neither has been tried).
3. Ask the shopper to type a name when no source knows the barcode.

## 6. The test before building

50 real beta barcodes, run through steps 0 to 6 and through today's call, compared row by row with
pass marks fixed first (paired, per the testing rule). Record per scan: identity found (and by
which source), results returned, results kept after filtering, whether the model was needed, the
answer, and the number of searches today's call ran. The last one replaces the single measured scan
behind the $0.062.
