# Catalogues, what exists and what it costs

Researched 2026-09-05. Every number here came off the vendor's own page on that date unless the
row says otherwise, and the rows that could not be confirmed say so rather than carrying a
plausible number. Sources are listed at the bottom so nothing here gets looked up twice.

## The shape of the cost, before any vendor

A catalogue lookup is one-time per distinct product. A price lookup is recurring per watched
item, forever. A barcode's identity does not change; its price changes weekly. So the catalogue
is the cheap half of the data problem and the price feed is the expensive half, and the
$675/mo watched-item figure already derived in `notes/session-2026-09-03.md` is a price number,
not a catalogue number.

The whole cost argument below rests on caching an identity once and never paying for it again.
That assumption is not yet verified against any vendor's terms. See "What would make this
wrong", item 2.

## What is loaded, 2026-09-05

Every free source that needs no account is now in the catalogue. Counts are read out of the
database after loading, not off the loader's own tally.

| Source | Rows | Of those, sold in Canada |
|---|---|---|
| Open Food Facts (was already loaded) | 122,157 | 122,157 |
| Open Beauty Facts | 48,968 | 801 |
| Open Products Facts | 28,426 | 741 |
| Open Pet Food Facts | 12,295 | 214 |
| **Total** | **211,846** | **123,913** |

**The finding that matters more than the total.** The three new databases add 89,688 rows and
1,756 Canadian ones. Free coverage outside groceries is not 90,000 products in Canada, it is
about 1,756, which is one and a half percent of what the grocery catalogue holds. The world's
cosmetics are now searchable; Canada's are barely. Anyone reading the 211,846 as coverage will
be wrong by two orders of magnitude in the categories these sources were added for.

They are loaded whole rather than filtered to Canada because decision 28 says country is a
column and not a load-time filter, and because a scan of an imported product should still be able
to say what the thing is even when no Canadian price exists for it. The alternatives path already
filters to Canada on its own, so cheaper-swap suggestions cannot wander offshore.

What the export threw away, counted rather than glossed: 45,135 rows across the three files carry
no product name in any language, so they can neither be shown nor matched. That is 34% of what
was downloaded. One barcode, `0850005324706` (Bone Broth), existed in both the food and the
general-products databases; the loader's upsert kept the newer row, which is why the food count
reads 122,157 rather than 122,158.

Reproduce the whole thing with `npm run fetch:open-facts`, then `prepare:beauty`,
`prepare:products`, `prepare:petfood`, then `node src/load.ts data/rows-<source>.jsonl` for each,
then `node src/embed-all.ts`, which only embeds what has no vector yet.

### Open Icecat, loaded 2026-09-05

The account exists and the electronics catalogue is in. This is the category the 2026-09-03
pricing correction called the best served of the five, and it was the largest hole in the
catalogue.

| Measured over the whole index | |
|---|---|
| Index entries | 7,670,733 |
| Carrying at least one barcode | 2,826,327 (36.8%) |
| Barcode values in total | 4,981,204 |
| Listed for the Canadian market | 167,545 (2.2%) |
| Still on market | 3,610,677 (47.1%) |
| Brands, from the reference file | 44,321 |
| Categories, with a parent chain | 6,812 |

**36.8%, not "about 70%".** The 70% figure in the paid-source notes came from a third-party
article. Measured against the file it is half that. The rows without a barcode are dropped: a
data sheet that cannot be reached by a scan is not catalogue for this product.

Rows are written one per barcode rather than one per product, because the catalogue is keyed by
barcode and a product reachable by only the first of its four codes is broken for the other
three. That turned 2,826,327 products into 4,972,274 rows, of which 4,972,252 barcodes are
distinct; the 22 collisions are Icecat's own warning that brands reuse GTINs.

**What it added, counted in the database.** The catalogue is now 5,182,591 rows and the Canadian
part of it went from 123,913 to 618,364. Icecat contributed 494,513 Canadian rows covering 80,443
distinct product names. Canadian coverage is five times what it was this morning, and almost all
of the growth is electronics.

**What it overwrote, which was not free.** 1,507 rows already in the catalogue shared a barcode
with an Icecat entry and the loader's upsert replaced them. 1,478 of those came from Open Products
Facts, which is 5% of that source, and the overlap makes sense: general merchandise is Icecat's
own territory. Brand-approved data sheets are better rows than crowd-entered ones, so this is
probably an improvement, but it happened silently and is recorded here rather than discovered
later.

**Where the manual was wrong, and why the parser waited for the file.** Icecat's published manual
lists `EAN_UPCS` among the fields of a `<file>` entry, which reads as an attribute. It is not one:
the barcodes are child elements underneath it. A parser written from the manual finds zero
barcodes in a file holding 4,981,204 of them and raises nothing. The first two measurement passes
here reported 0.0% for exactly that reason, plus a second bug of the same family: clearing each
XML element as it ended wiped a child's attributes before its parent was read.

**Vectors are still filling.** Text search and barcode lookup work on all 5.18 million rows now.
The vector half is being built at roughly 196 rows a second, Canada-ordered so the useful rows
come first, which is about forty minutes for the Canadian ones and seven hours for the rest. It
is resumable: stop it and run `node src/embed-all.ts` again whenever, and pass
`SHIN_EMBED_PAGE=200000` because the default page makes the query dominate at this size.

Reproduce with `npm run fetch:icecat`, then `python src/prepare_rows_icecat.py`, then
`node src/load.ts data/rows-icecat.jsonl`. Credentials come from `.env` at the repo root, which is
gitignored, and the two reference files (brands, categories) come from
`data.icecat.biz/export/freexml/refs/`, which the free account can read.

### Still free, but not yet had

- **Best Buy** refused the signup: their portal rejects free email and .edu addresses outright,
  so the key needs an email on a domain we own. It is a price source rather than a catalogue in
  any case, so it belongs with the sellers in `price/src/sources.ts`.
- **eBay** registered but the account is held for review, stated as at least one business day.
  Also a price source, and the one that covers used goods.

## Free, bulk-downloadable, no key

| Source | Covers | Size | Cost |
|---|---|---|---|
| Open Food Facts | Food and drink, worldwide, barcoded | 4,729,125 products; the Canadian slice already loaded here is 122,158 | Free, ODbL |
| Open Beauty Facts | Cosmetics and personal care | 74,522 | Free, ODbL |
| Open Products Facts | Everything that is not food, beauty or pet food | 45,202 | Free, ODbL |
| USDA FoodData Central | US branded food | Bulk download plus API | Free, 1,000 requests/hour per IP with a data.gov key |
| Open Icecat | Consumer electronics and IT, sponsoring brands only | 600+ brands; their own two pages say 18 million datasheets on one and 2+ million on the other | Free after registration |

Open Products Facts is the one that would extend Shin past groceries on the free tier, and at
45,202 rows it is thin. It is a fifth of the size of the Canadian grocery slice already loaded.

Open Icecat is the real find for the new-tech category, which the 2026-09-03 pilot correction
already named as the best-served of the five. It is brand-approved datasheets rather than
crowd-entered rows, which is a higher grade of identity than anything else on this list.

## Paid lookup APIs, for filling the misses

Ordered by cost per thousand lookups at each vendor's best published tier.

**Every per-1,000 figure in this table is derived, not quoted.** The vendors publish a monthly
price and an included call count; the third column is the first divided by the second, by me, on
2026-09-05. No vendor advertises a per-1,000 rate except UPCitemdb, whose published overage rate
is in the notes below. The two UPCitemdb rows carry a second derivation on top: that vendor meters
by day, not by month, so the monthly volume assumes 30 days at the full daily allowance. A month
that does not use the full daily quota every day pays the same price for fewer lookups, which
makes the real rate worse than the number shown.

| Vendor | Best tier | Per 1,000 lookups (derived) | Entry tier | Claimed size |
|---|---|---|---|---|
| UPCitemdb | Pro, $699/mo, 150,000 lookups/day | $0.155 ($699 / 4,500,000) | Free, 100/day, no signup; Dev $99/mo for 20,000/day, which is $0.165 | Not published |
| upcdatabase.org | Professional, $25/mo, 100,000 lookups | $0.25 ($25 / 100,000) | Free 100/mo; Hobbyist $2.50/mo for 1,000 | Not published |
| EAN-Search | Gold, EUR 149/mo, 300,000 queries | EUR 0.497 (149 / 300,000) | Trial EUR 1 first month then EUR 9; Pro EUR 19/mo for 5,000 | 1.2 billion barcodes |
| Go-UPC | Enterprise, $795/mo, 450,000 requests | $1.767 ($795 / 450,000) | Developer $74.95/mo for 5,000 | 500 million products |
| Barcode Lookup | Enterprise, $949/mo, 500,000 calls | $1.898 ($949 / 500,000) | Starter $99/mo for 5,000 | Not published |

The one rate a vendor states outright rather than leaving to arithmetic is UPCitemdb's overage:
$0.04 per 100 lookups, which is $0.40 per 1,000, and $0.03 per 10 search calls, which is $3.00
per 1,000. Overage is what gets paid past quota, so on any month that runs over, $0.40 is the
real marginal rate rather than the $0.155 in the table.

Two of these are worth more than their rank suggests.

**UPCitemdb** is the cheapest at volume by a factor of ten against the two best-known vendors,
and its free tier needs no signup at all, so it can be tested against a real miss list this week
without a card.

**Barcode Lookup** is the only one that is a catalogue and a price source in the same call. Its
API takes a `Geo` parameter with `CA` as a value, and the response carries a `Stores` array with
store name, price, currency and link. If those Canadian store prices are real and current, it
collapses two of Shin's problems into one vendor, which would be worth paying five times the
per-lookup rate for. It offers a free test account, so this is checkable before spending.

## Quote-only, no published price

- **GS1 Canada.** The authoritative Canadian source, and the only one where the data comes from
  the brand owner rather than from a crowd or a scrape. Subscriber-based: a small-business
  subscription starts at $26.25, and the service fee schedules scale by annual Canadian sales
  revenue. The published fee schedule found is for product recall, not for catalogue access, so
  the real number needs a call to 1.800.567.7084 ext. 3721.
- **Verified by GS1.** The global registry that confirms a barcode is real and names its owner.
  Batch and API access is enterprise and routes through the local GS1 office. It verifies
  identity, it does not hand over a rich datasheet, so it is a trust layer rather than a
  catalogue.
- **Nutritionix.** Claims 92% coverage of US and Canadian groceries and 600,000+ UPCs, which is
  the strongest Canadian grocery claim on this page. No self-serve tier. A third-party listing
  says pricing starts at $1,850/mo; their own pricing page returned HTTP 402 to an automated
  fetch, so that number is unconfirmed and should be treated as hearsay until they quote it.
- **Syndigo, which acquired 1WorldSync in September 2025.** The CPG industry's own syndication
  layer. No public price; third-party contract data puts the SMB average near $45,839/yr. Out
  of range and out of shape for this stage.
- **Full Icecat.** 40,000+ brands against Open Icecat's 600. Billed yearly, quote only.

## Retailer catalogues, which carry identity and live price together

- **Best Buy developer API.** Free key, no card. More than one million current and historical
  products with pricing, availability, specifications and images, updated near real time. Rate
  limits are not published in the documentation and have to be read off the dashboard after
  signup, so the free ceiling is currently unknown. Best Buy Canada publishes its own separate
  public docs whose sample datasets include competitor price data.
- **eBay Browse API.** Free, 5,000 calls/day by default, raised after a free application growth
  check. This is the comparable set for the used categories, the used POAENG and the used camera
  that the pilot could not price.
- **Amazon.** The Product Advertising API is free but is deprecated on 2026-05-15 and is already
  closed to new customers. Its replacement, the Creators API, requires 10 qualified affiliate
  sales in the trailing 30 days before access is granted. Treat Amazon as unavailable to Shin
  until it has affiliate volume, which it cannot have before it ships.
- **Rainforest API** is the paid way into Amazon and covers amazon.ca: $83/mo for 10,000 credits,
  $375/mo for 250,000 ($1.50 per 1,000), falling to $0.45 per 1,000 at 20 million.

## What would make this wrong

**1. The ODbL share-alike on Open Food Facts.** Commercial use is permitted and attributed reuse
is expected; Yuka started on this exact database. The catch is that a Derivative Database which
is publicly used must be offered under the same licence. Shin's catalogue is OFF plus its own
additions, which is a derivative database. The verdict shown to a user is a Produced Work and is
not caught by the share-alike; the table behind it may be. The cheap version of the fix is
structural rather than legal: keep OFF-derived rows in their own table, so that if share-alike
does apply it applies to a table Shin could publish without giving away anything of its own.
This needs a read before the catalogue carries anything proprietary, not before the next build.

**2. Whether paid vendors permit caching.** Every per-lookup number above is a one-time cost only
if an identity can be stored once and reused. Go-UPC's terms require deleting all product data on
termination and forbid resale or redistribution, which does not settle whether an active
subscriber may cache. If caching turns out to be forbidden, the cost becomes recurring per scan
and the ranking on this page changes completely. Confirm in writing with whichever vendor is
picked, before the first invoice.

## Recommendation

Buy nothing yet. In order:

1. Grocery identity is already solved and already free. Nothing on this page improves it enough
   to pay for.
2. Extend on the free tier first: Open Beauty Facts and Open Products Facts as bulk loads, Open
   Icecat for the tech category, a free Best Buy key for tech identity with live price, a free
   eBay key for used comparables. That is five sources and zero dollars.
3. Only then measure the miss rate on real scans, per category. The miss rate is the number that
   decides whether anything gets bought, and it does not exist yet.
4. When it does, the two to test are UPCitemdb's free tier, which needs no signup, and Barcode
   Lookup's free test account, specifically to see whether its Canadian store prices are real.

**Reverses if:** the measured miss rate is high in a category none of the free sources cover, or
if Barcode Lookup's Canadian store prices check out, either of which turns a purchase from
premature into obvious.

## What was not opened, so nobody assumes it was

Spoonacular and Edamam, which are nutrition-first rather than identity-first and duplicate what
OFF already gives. Datakick and Brocade, whose current status is unverified. Walmart's
marketplace API. Loblaw, Metro and Sobeys, none of which publish a catalogue API and all of which
returned 403 to the 2026-09-03 pilot's direct fetches. Health Canada's Canadian Nutrient File,
which carries no barcodes and so cannot resolve a scan. Apify's Loblaw feed at $0.75 per 1,000
rows and SerpApi at $25 per 1,000, both already recorded in the session notes as price sources
rather than catalogues.

## Sources

- Open Food Facts data and licence: https://world.openfoodfacts.org/data and
  https://world.openfoodfacts.org/terms-of-use
- Open Beauty Facts: https://world.openbeautyfacts.org/
- Open Products Facts: https://world.openproductsfacts.org/
- USDA FoodData Central API guide: https://fdc.nal.usda.gov/api-guide/
- Open Icecat: https://icecat.com/structured-data-content-users/ and
  https://icecat.com/content-subscription/
- UPCitemdb plans: https://devs.upcitemdb.com/ and
  https://www.upcitemdb.com/wp/docs/main/development/plan/
- upcdatabase.org: https://upcdatabase.org/api-pricing
- EAN-Search: https://www.ean-search.org/ean-database-api.html
- Go-UPC: https://go-upc.com/plans/api and https://go-upc.com/terms-and-conditions/
- Barcode Lookup: https://www.barcodelookup.com/api (blocks automated fetch, read in a browser)
- GS1 Canada: https://gs1ca.org/help/ and https://gs1ca.org/files/Prod_Recall_Fee.pdf
- Verified by GS1: https://www.gs1.org/services/verified-by-gs1
- Nutritionix: https://www.nutritionix.com/database (pricing page returned 402)
- Syndigo and 1WorldSync: https://syndigo.com/news/syndigo-acquires-1worldsync/
- Best Buy: https://developer.bestbuy.com/ and https://bestbuyapis.github.io/api-documentation/
  and https://best-buy-canada.github.io/
- eBay rate limits: https://developer.ebay.com/develop/get-started/api-call-limits
- Amazon PA-API: https://webservices.amazon.com/paapi5/documentation/
- Rainforest API: https://trajectdata.com/pricing/rainforest-api
