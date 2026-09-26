# Catalogue build plan, 2026-09-26

Twelve units that grow or repair the catalogue, each one shippable on its own. Written to the
`QUEUE.md` convention: every unit carries a state, an acceptance test checked where its consumer
meets it, a falsifier, and what reopens it. Nothing here is built yet; every row is `queued`.

**Every number below is labelled.** `counted` means read out of a file or a database this session.
`projected` means measured on a stated sample and extrapolated. `unmeasured` means nobody has
looked yet, and the unit's first step is to look.

> **REVISED SAME DAY, after a gap pass and his ruling that this is an MVP and low-return work
> waits.** Read `## The MVP cut` below before any unit. Nine gaps were found; two of them
> reorder the plan. Unit 0 is new and comes before everything. Unit 1 loses its first place.
> Units 6, 10 and most of 12 are `parked` with the numbers that parked them.

## One correction to the numbers this plan was asked from

The miss log is **not** empty, and an earlier reading of it said so. There are two of them. The
table inside the catalogue database has 0 rows and always has. The separate log beside it,
`catalogue/data/gaps.db`, has **94 entries over 250 hits, counted**, last written 2026-09-19.

What that log says, counted:

- **Every one of the 94 is a text miss. Zero are barcode misses.** The recorder classifies both
  (`catalogue/src/gaps.ts`, `classify`) and the search path calls it with a barcode
  (`catalogue/src/search.ts:1289`), so the barcode side is wired and has never once fired.
- Its heaviest entries are test traffic: `zzzz nonexistent product qqqq` 34 hits, `MacBook Charger`
  51, `thunderbolt` 47. So the log works, and what is in it is ours, not a user's.

This changes unit 5 from "turn the log on" to "find out why the barcode half never fires", which is
a different and smaller job. It does not change any other unit.

## The MVP cut, set by him 2026-09-26

*"we are just building the mvp right now. We will take whats accessible and leave the low roi
items for later"*, and on the BC crawl, *"nine hours is not worth it for just 100000 products where
the majority is alcohol. maybe we can take the things we actually need and forget the rest"*.

**Build now, in this order.** 0, 11, then 2, 3, 15, 4, 6a, 13 together, then 5, 7, 9, 8, 14.
**Parked with a number, not an opinion:** 1, 6b, 10, and three quarters of 12.

| Unit | Verdict | The number that decided it |
| --- | --- | --- |
| **0 Rebuild the shipped pack** | **build, first** | The pack on disk is dated **2026-09-05, counted**. The phone reads it and nothing else. Every other unit ships nothing until this runs. |
| 11 Delete the junk | build, needs his word | 16 junk products, 6,210 unlinked observations, counted |
| 2 Québec | build | 45,044 new, counted, all Canadian, all sized |
| 3 BC liquor prices | build | 7,556 priced barcodes against 438 held, counted, zero overlap |
| **15 New Brunswick liquor prices** | **build** | **6,731 priced barcodes, 6,487 new to the catalogue, 5,977 that BC does not have, counted.** One PDF. |
| 4 Metro | build | 9,438 new plus 6,782 categories filled, counted |
| 5 Barcode miss logging | build | 0 barcode misses ever recorded, counted. Nothing else can be aimed without it. |
| **6a BC non-alcohol only** | **build** | **22,972 rows, 764 pages, 1.4 h**, exact off the pager |
| 7, 9, 8 Sizes, categories, parts list | build after the loads | 99,598 sizeless and 134,865 categoryless, counted |
| **1 The 4.6M food rows** | **parked** | They arrive flagged not-Canadian, and **the packer selects only Canada-flagged rows**, so none reaches a phone. Reachable by server search only. 8 GB download for that. |
| **6b BC alcohol** | **parked** | **130,404 rows, 8.1 h**, and the liquor file can price **at most 5.8% of them, counted**. The rest is a hit with no price. |
| **10 Embeddings** | **parked** | 718,662 of 5,182,591 embedded, counted; the word search already covers all of them |
| **12 Books, music, Discogs** | **parked** | ~30M editions and 2,581,558 barcoded releases, none of which a grocery tester scans. Keep only the USDA food file as worth measuring. |

**Promotes back:** unit 1 when a scan of a non-Canadian barcode is shown to matter to a real user;
6b when alcohol prices exist for more than 5.8% of it; 10 when a 10,000-row slice is timed; 12 when
someone scans a book.

### The BC slice, exact, off the registry's own pager

| Slice | Rows | Pages | Hours at the measured 6.7 s/page |
| --- | --- | --- | --- |
| Alcohol | 130,404 | 4,347 | 8.1 |
| Juice | 6,693 | 224 | 0.4 |
| Soft Drink | 4,766 | 159 | 0.3 |
| Water | 4,678 | 156 | 0.3 |
| Other | 2,163 | 73 | 0.1 |
| Tea | 1,891 | 64 | 0.1 |
| De-alcoholised | 1,090 | 37 | 0.1 |
| Energy Drink | 913 | 31 | 0.1 |
| Milk, Coffee, Plant-Based, Cannabis, Others | 1,868 | 65 | 0.1 |
| **Everything except alcohol** | **22,972** | **764** | **1.4** |

Yield of that slice, **measured on 1,839 rows sampled across all eleven types, projected**: about
**15,699 new, falling to about 10,053 once Québec is loaded**, because 39% of the sample is in the
Québec list already, counted. Per type the new rate runs 78 to 91% for juice, tea, coffee, soft
drinks and the odd categories, and 31 to 39% for water, milk and plant-based, so trimming those
three saves about twenty minutes and is not worth deciding.

**What is honest about cutting the alcohol:** per hour it is the better deal, roughly 15,800 new
products an hour against 7,200, and the crawl is unattended so hours are nearly free. It is cut on
the price argument, not the throughput one.

## Prices transfer between provinces. Do not build a province adjustment.

His question, 2026-09-26: can one province's prices estimate another's, and can the difference be
measured and used in the math. Measured twice, by two methods on two unrelated datasets, and both
say the same thing: **yes they transfer, and no adjustment is worth applying.**

**The trap that was avoided.** The obvious dataset is the Consumer Price Index, and it cannot answer
this. CPI measures how prices change **over time within** a province, never the level **between**
provinces. Using it here would have produced a confident wrong multiplier.

### Measurement one: identical barcodes in two provinces, counted

New Brunswick's public liquor price list joined to BC's on barcode. **754 products are the same
bottle priced in both provinces, counted.** No categories and no inference.

| | |
| --- | --- |
| Median New Brunswick price over BC price | **0.990** |
| Middle half | 0.87x to 1.08x |
| 10th to 90th percentile | 0.76x to 1.19x |
| Within 10% of each other | **48%**, counted |
| Within 20% | **77%**, counted |
| Worst | **2.04x**, a Cabernet at $18.99 in NB and $9.29 in BC |

**The decisive line:** BC's price times the best province factor gives a **median error of 10.8%**.
BC's price with no adjustment at all gives a **median error of 10.8%**. Identical to one decimal.
A province multiplier buys nothing.

### Measurement two: Statistics Canada's own provincial price levels

Table 18-10-0245, average retail price **in dollars** by province, monthly, 110 products, free,
July 2026. A level, so provinces are comparable.

Median against the national average: Quebec **0.980**, Ontario 0.986, Saskatchewan 1.000,
Manitoba 1.002, Alberta 1.021, BC 1.026, New Brunswick 1.043, Newfoundland 1.049, Nova Scotia
1.052, PEI **1.054**. **The whole country spans 7.6%, counted**, which is smaller than the
variation between products inside any one province.

Split by whether the product carries a barcode at all:

| | Products | Median spread, dearest province over cheapest | p90 | Worst |
| --- | --- | --- | --- | --- |
| **Packaged, has a barcode** | 74 | **1.16x** | 1.38x | 1.94x |
| Fresh or by weight, no barcode | 34 | 1.39x | 1.64x | 1.98x |

**Taking another province's price for a barcoded packaged good costs a median 7.8%, 19.1% at p90,
46.8% at worst, counted over 74 products.** Set against the **23% median error of a blind Claude
guess** measured earlier this session: different product sets, so not a strict head to head, but a
threefold gap sits far outside that caveat.

### The rule to build

1. **Treat a price observed anywhere in Canada as valid nationally.** Carry about **10%**
   uncertainty for liquor and about **8%** for packaged groceries.
2. **Build no province adjustment.** Two measurements say it is worth nothing.
3. **Two exceptions, and they are named rather than guessed at.** Dairy and fresh produce. Milk is
   the worst packaged product in the country at **1.94x**, Ontario $3.97 against Manitoba $2.05,
   because provinces regulate dairy directly. After milk: strawberries 1.85x, potatoes 1.78x,
   mushrooms 1.60x. All dairy or produce, and produce has no barcode anyway.
4. **Falsifier for the whole rule:** a third province's list, joined on barcode, shows a median
   ratio further than 0.10 from 1.00. That would mean these two provinces happen to agree and the
   country does not.

**One more thing this measurement is worth, beyond the rule.** Statistics Canada republishes those
110 products monthly, by province, in dollars. For the most commonly scanned groceries in the
country that is a free authoritative price anchor, not a guess. Mapping the 110 onto our own
categories is about an hour of hand work on a 110-row table, and it is unbuilt.

## The nine gaps found in the first draft of this plan

1. **The phone reads a packed binary, not the database, and no unit rebuilt it.** Now unit 0.
   The exporter's own record: 122,101 grocery rows at 1.70 MB brotli, 618,310 Canadian rows at
   7.47 MB brotli, counted from `catalogue/src/export-pack.ts`.
2. **Unit 1's rows cannot reach a phone.** The packer's clause is `WHERE sold_in_canada = 1`.
   Checked: the server search ranks Canadian rows first but filters nothing out, so those rows are
   reachable online and nowhere else.
3. **No unit measures whether the answer improved.** Every acceptance test counts rows. The product
   measure is a held set of barcodes that miss today, re-run after loading, and that needs unit 5
   to have fired at least once. Unit 5 is a prerequisite, not an extra.
4. **No unit merges duplicates across sources.** Counted: 39% of the BC sample is in Québec's list,
   58.7% of Metro's barcodes are already held. Source ownership stops collisions and permits the
   same product three times under three source names.
5. **No size ceiling for what a phone downloads.** 618,310 rows is 7.47 MB brotli, counted. The
   four MVP loads scale that to roughly 8.4 MB, **derived, not measured**. No ceiling was ever set.
6. **No rollback.** Only unit 11 keeps a copy. Copy the 4.1 GB database before any reload; it is
   far cheaper than re-downloading 8 GB.
7. **The nameless rows are uncovered.** `docs/catalogues.md` already counted **45,135 rows with no
   name in any language**. Unit 8 covers short names, not absent ones.
8. **Reuse terms unchecked for three of the four sources.** Québec, BC's registry and Metro are
   free and need no login, verified. What they permit is **unmeasured**. BC liquor is BC open
   licence and Open Food Facts is share-alike, both known. Twenty minutes, before loading.
9. **Two units had no actor.** Unit 11 needs his word and unit 8 is his decision; both now carry a
   default so silence resolves them instead of stalling them.

## Unit 0. Rebuild the shipped pack

| Field | |
| --- | --- |
| **State** | `queued`. Before everything, and again after every load. |
| **Owner** | Aurik (catalogue) |
| **What** | `catalogue/src/export-pack.ts` writes `pack-grocery` and `pack-canada`, raw plus gzip plus brotli, and `app/src/pack-route.ts` streams the brotli straight to the phone. Selection is `WHERE sold_in_canada = 1`, and for the grocery pack also `source = 'openfoodfacts'`. |
| **Numbers** | The files on disk are dated **2026-09-05, counted**: 44.1 MB raw and 6.77 MB brotli for the Canadian pack, 5.6 MB raw and 1.50 MB brotli for grocery. The exporter's own record is 618,310 Canadian rows at 7.47 MB brotli. |
| **Acceptance test** | Run the exporter, then read the row count out of the pack's own 4-byte header rather than the exporter's log, and confirm it equals the Canadian row count in the database. Then fetch the pack over the route and binary-search five barcodes loaded after 2026-09-05, which today's pack cannot contain. |
| **Falsifier** | The header count disagrees with the database, or a barcode loaded this week is absent from the fetched pack, either of which means the phone is still being served stale data. |
| **Reopens on** | Every load. This unit runs again after each one, which is why it is numbered zero rather than first. |

## The two lanes, and why they cannot collide

| Lane | Writes | Units |
| --- | --- | --- |
| **Catalogue lane** | `product`, `product_category`, `product_fts`, `product_vec` in `catalogue/data/catalogue.db` | 1, 2, 4, 6a, 7, 8, 9, 10, 12, 13, 15 |
| **Price lane** | `observation` in `price/data/prices.db` | 3, 15 |
| **Neither** | the two logs, and the user store | 5, 11, 14 |

One rule makes the catalogue lane safe to run in parallel with itself: **a loader may only insert or
update rows whose `source` it owns.** Each unit below names its source string. Two loaders with
different source strings never touch the same row, so units 2, 4, 6 and 12 can run at the same time
in any order. Units 7, 8, 9 and 10 read every source and must run after the loads, or run twice.

## The order, set by what cannot be taken back

Nothing here is spent-once, so ordering is by what blocks what, not by risk. **Revised 2026-09-26
by the MVP cut above; unit 1 no longer leads.**

1. **Unit 0 first.** The phone reads the packed file and nothing else, and it is 21 days old. Until
   this runs, no unit below changes anything a tester can see. It runs again after every load.
2. **Unit 11 next, alone, once he says so.** It deletes rows. Anything that computes on the user
   store before it runs computes on junk, and any measurement taken before it is void.
3. **Units 2, 3, 4, 6a, 12, 13, 15 in parallel.** Different sources, different files, and only
   units 3 and 15 touch the price database. Copy the catalogue database before the first of them,
   per gap 6.
4. **Unit 0 again**, so the loads reach a phone.
5. **Units 7, 9, 8 after the loads**, because each reads across all sources.
6. **Unit 5 as early as anyone has a spare hour.** It blocks nothing and nothing blocks it, and
   until it lands every unit here is aimed by argument instead of by evidence.

**Before any load, per gap 8:** read what Québec, BC's registry and Metro permit us to do with the
data. Twenty minutes. They are free and need no login, verified; the permission is unmeasured.

## Is it ready to run, checked on 2026-09-26 rather than assumed

Every source re-opened today, and every write path looked up in the code, because a plan naming a
file that has moved or a table that does not exist wastes a worker's whole pass.

**Every source still resolves, and four of the five match this plan to the byte.** Québec 3,122,979
bytes, last modified 2026-09-24. BC's price CSV 988,625 bytes, 8,211 rows, **7,556 carrying a
barcode, which is the number this plan already quotes**, arrived at independently. New Brunswick
2,699,189 bytes, exactly the 2.70 MB claimed. BC's registry search still answers only to a browser
user agent, 403 to a plain one, with its `upc`, `type`, `flvr` and `size` fields live. The fifth,
Metro, differs and is written into unit 4: aisle pages answer, product pages refuse every header.

**Every write path already exists. No unit needs new infrastructure.** The price store's
`observation` table is `price/src/store.ts:112`, with seller, currency, country and region columns,
and `recordObservation` at `:286` is already called by three existing scrapers, so units 3 and 15
need a parser, not a schema. Catalogue rows go through `catalogue/src/load.ts`, which takes a
prepared JSONL row and upserts on the barcode, so units 2, 4 and 6a need a fetch-and-prepare script
and nothing more. `product.source` is free text, so a new source string collides with nothing.

**What is actually in the way, all of it:**

1. **Unit 11 needs his word and it is second in the order.** It deletes 16 rows of his own data.
   Nothing else is waiting on him.
2. **Eight of the fifteen units name Aurik as owner and he has not agreed to that.** This is the
   one blocker that decides whether the plan is a plan or a wish list.
3. **Unit 13 is not what it says it is**, and the correction is inside it now: the loader already
   collapses a barcode loaded twice as the same string, but nothing canonicalizes the barcode
   first, so **1,375,443 products sit in the catalogue right now under two spellings, 198,095 of
   them Canadian, which is 32% of what the phone downloads.** That is a defect the new loads would
   multiply, and it is worth fixing before unit 0 rebuilds the pack rather than after.

**Unit 5 is built** and its row says how it was checked. Nothing else has moved.

---

## The units

### 1. Stop discarding 97% of the food data  --  PARKED for the MVP

| Field | |
| --- | --- |
| **State** | `parked` 2026-09-26. **Promotes back when a scan of a non-Canadian barcode is shown to matter to a real user.** Parked because the packer selects only Canada-flagged rows, so none of these 4,636,853 rows can reach a phone; they are reachable by server search alone, and that costs an 8 GB download and unmeasured disk on a database already at 4.1 GB. |
| **Owner** | Aurik (catalogue) |
| **Source string** | `openfoodfacts`, unchanged |
| **What** | `catalogue/src/fetch_canada.py` ends `WHERE list_contains(countries_tags, 'en:canada')`. Remove that clause. Its own docstring already says the loader can be pointed at a wider pull with no schema change, and **decision 28 says country is a column and not a load-time filter**, so this is a defect against a decision already made, not a new decision. |
| **Numbers** | The source holds **4,759,011 food products, counted from the publisher's own row index**. We keep **122,158, counted from our database**. So **4,636,853 rows are discarded at load time by one clause, counted.** How many of those are worth keeping is `unmeasured`. |
| **Acceptance test** | After the reload, a count run against the database, not the loader's tally, shows the `openfoodfacts` row count above four million, and the Canadian subset is **no smaller than 122,158**. Three barcodes known to be Canada-only and three known to be import-only are each looked up by hand and land on the right side of the flag. |
| **Falsifier** | The Canadian subset shrinks, or the flag comes back wrong on the six hand-checked barcodes, either of which means the wider pull overwrote the country signal instead of widening it. |
| **Reopens on** | Not applicable while queued. |
| **Cost** | One 8 GB download, a reload, and disk. The database is already 4.1 GB, `unmeasured` where it lands after. |

### 2. Load Québec's deposit registry

| Field | |
| --- | --- |
| **State** | `queued` |
| **Owner** | Aurik (catalogue) |
| **Source string** | `consignaction` (new, so it collides with nothing) |
| **What** | One spreadsheet, 3 MB, no login, published 2026-09-24, holding every beverage container registered for deposit in Québec. Producer, product name, deposit value, volume in millilitres, drink classification, container material, barcode. |
| **Numbers** | **50,166 rows, counted. 50,159 usable barcodes, all distinct, counted. 45,044 not in our catalogue, counted by looking up every one of them.** Every row has a name and a volume, counted. |
| **Acceptance test** | The database reports at least 45,000 rows at source `consignaction`, all with `sold_in_canada` true, all with a size, and a hand check of five of them against the spreadsheet's own cells. Five barcodes the spreadsheet does **not** contain are confirmed absent from that source, so the load did not invent rows. |
| **Falsifier** | More than 5% of loaded rows land with no size or no name, which would mean the column mapping is wrong, not that the source is thin. |
| **Reopens on** | A newer spreadsheet is published; it is dated in the file name. |

### 3. Load BC's liquor price list

| Field | |
| --- | --- |
| **State** | `queued` |
| **Owner** | Aurik (prices) |
| **Writes** | `observation` in the price database, seller `bcldb`, not the catalogue |
| **What** | Government open data under the BC open licence. Barcode, full product name, litres per container, three levels of category, alcohol percent, and a price, for every product in BC liquor stores. |
| **Numbers** | **7,556 rows carrying a barcode and a price, counted, every one of them priced. 7,555 distinct barcodes, counted.** The price store today holds **896 observations over 438 barcodes, counted**, and **the overlap is zero, counted**. So this is a **17-fold increase in priced barcodes** and **7,354 products new to the catalogue as well, counted**. |
| **Acceptance test** | The price database reports at least 7,500 observations at seller `bcldb`, all currency CAD and country CA, and five prices are read back and matched by hand against the government file's own cells. The distinct-barcode count rises from 438 to above 7,900. |
| **Falsifier** | Any loaded price is zero, negative, or absent, which the source never contains, so it would mean the parse is wrong. |
| **Reopens on** | The monthly file is republished; the current one is dated June 2026. |
| **Known limit, counted** | It can price **at most 7,555 of BC's 130,404 registered alcohol containers, 5.8%**, because that is all the distinct barcodes it holds. Unit 6 does not inherit prices from this. |

### 4. Take Metro's barcodes and its aisle paths  --  FALSIFIER FAILED, NOT LOADED

| Field | |
| --- | --- |
| **State** | `blocked` 2026-09-26. Run live: all four sitemaps fetched (each needed 1-8 retries against the empty-cache flakiness, none failed outright), 26,563 distinct 12/13/8-digit barcodes counted today. Exact-string match of each product's own leaf aisle segment (`en:<segment>` / `fr:<segment>`) against this catalogue's existing tag vocabulary matched 4,817 of them. Where a matched product already had a category, **the aisle-derived one disagreed on 1,188 of 1,245 rows, 95.4%** -- nineteen times the 5% limit -- so **nothing was loaded**, per the plan's own falsifier clause. Checked by hand on a sample (e.g. code 087692007470, aisle leaf `coolers`, existing category `Boisson alcoolisée`; several `baby/food-formula/food/*` purées all landing on the generic `en:food` instead of their real `en:baby-foods` / `en:apple-compotes` / `en:compotes`): aisle segments collide with real tag strings by coincidence, not by meaning. Aisle is not category here; reopening this unit needs an actual Metro-aisle-to-taxonomy table, not a closer string match. `catalogue/src/fetch_metro.py` and `catalogue/src/prepare_rows_metro.py` are built and committed for whoever builds that table. |
| **Owner** | Jamin |
| **Source string** | `metro` for new rows; existing rows get only a category, never a name or a flag |
| **What** | Metro publishes its product page addresses, and the number ending each address **is the barcode**. Proven, not assumed: **58.7% of them, 13,412 of 22,850, match a product we already hold, by barcode, counted.** A private stock number would match nothing. The address also spells out the aisle the product sits in, and the slug is a product name in French. |
| **Numbers** | **25,265 product addresses, counted. 22,850 with a 12 or 13 digit barcode, counted. 9,438 barcodes new to us, counted. 6,782 of the products it matches are ones we hold with no category at all, counted.** Two of Metro's four regional lists were empty at fetch time, counted, so the run must tolerate that and retry rather than record a zero. |
| **Acceptance test** | Two separate checks. The `no leaf_category` count across the whole catalogue drops by at least 6,000 from 134,865. And at least 9,000 rows exist at source `metro`, each with a name and a category, five of them opened in a browser by hand and confirmed to be the product the row claims. |
| **Falsifier** | The category filled in from an aisle path disagrees with the category the product already had on more than 5% of the rows where both exist, which would mean aisle is not category and the mapping needs a table. A run that records zero rows because a regional list was empty is also a failure, not a result. |
| **Reopens on** | Metro republishes; the lists carry today's date. |
| **Fetch limit, checked live 2026-09-26** | The listing and aisle pages answer a plain HTTP request with **200** and carry the barcodes in their addresses, so everything this unit needs, a barcode and an aisle path, arrives without a browser. **Individual product pages return 403 to every header set tried, including a full browser one**, so they need a real browser session with cookies. That only bites a later unit wanting a name or a size off the product page itself, and it means the five hand-checks in the acceptance test above are done in a signed-in browser, not with a fetch. |

### 5. Find out why the barcode half of the miss log has never fired  --  BUILT

| Field | |
| --- | --- |
| **State** | **`built` 2026-09-26**, `364eb25` and `02a542c`. It was the second cause: the barcode path never consulted the catalogue, so "we do not hold this" was unobservable, and the only barcode gap the server could write came from the model path and meant "the model could not name it". Both are now recorded separately. Acceptance met **as worded below**: a genuinely absent barcode scanned over HTTP against the running app with the real 4.13 GB catalogue attached, and the row read out of the log file by a second process that never wrote to it. The barcode the catalogue DOES hold came back marked not-missing in the same run, from the same log, which is the negative control. The second commit exists because the first passed its unit tests and did not work in the running app: the model path writes to the same row microseconds later and the log's upsert gave it the note, so the fact moved into a column that cannot be cleared. **Still owing: the five real absent barcodes scanned in a store**, which needs a phone in a shop, not code. |
| **Owner** | Jamin |
| **What** | The log records text misses and has **94 of them over 250 hits, counted**. It has recorded **zero barcode misses, counted**, though the recorder classifies them and the search path passes a barcode to it. Either no barcode scan has ever missed, which the 6,210 unmatched rows in the user store argue against, or the app's barcode path does not reach that recorder. Find which, in the running app, and fix it if it is the second. |
| **Numbers** | **94 entries, 250 hits, 0 with a barcode, last written 2026-09-19, counted.** The heaviest entries are our own test strings, counted. So there is no real-user signal in it yet, from either half. |
| **Acceptance test** | A barcode that is genuinely absent is scanned in the running app and appears in the log as a barcode miss within a minute, read out of the log file by a second process, not asserted by the code that wrote it. Then five real absent barcodes scanned in a store produce five entries. |
| **Falsifier** | The scan produces no entry, or produces a text entry instead of a barcode entry. |
| **Reopens on** | Not applicable while queued. |
| **Why it is worth its place** | Every other unit here decides what to add by argument. This is the only one that makes the next decision evidence. |

### 6a. Crawl BC's deposit registry, the non-alcohol slice only  --  BUILD

**6b, the alcohol slice, is `parked`: 130,404 rows, 4,347 pages, 8.1 h, and the liquor price file can
price at most 5.8% of it, counted. Promotes back when alcohol prices exist for more than that.**
The unit below is the 22,972-row, 764-page, 1.4-hour slice: every drink type except `Alcohol`. The
registry's own type filter does the cutting, so this is a narrower crawl, not a filtered one.

| Field | |
| --- | --- |
| **State** | `queued`. 1.4 h, not the 9.6 h a full crawl takes. |
| **Owner** | Aurik (catalogue) |
| **Source string** | `returnit` |
| **What** | BC publishes the same registry as Québec but as a paged search rather than a file. The pager prints its own totals, so every denominator is exact: **154,401 containers in all, 130,404 of them alcohol, 22,972 everything else, counted off the pager.** Thirty rows a page, so **764 page reads for this slice** against 5,147 for the whole thing. Pass the registry's own `type` filter, once per drink type, and the alcohol never gets fetched. Every row carries brand, flavour, drink type, container size and material, and a barcode. It needs a browser user agent; plain requests get 403, and the PDF links that were thought to exist return 404. |
| **Numbers** | The 98.6%-new figure from the first pass came off a sample that was 94% alcohol and does **not** describe this slice. Re-measured on **1,839 rows sampled across all eleven non-alcohol types: about 15,699 new to the catalogue, falling to about 10,053 once Québec is loaded, projected**, because **39% of the sample is already in the Québec list, counted**. Per type the new rate runs 78 to 91% for juice, tea, coffee, soft drinks and the odd categories and 31 to 39% for water, milk and plant-based, counted, so trimming those three saves about twenty minutes and is not worth deciding. Also counted: **4.8% of rows repeat a barcode already in the sample**, so the row count is not the product count and the loader must collapse duplicates. |
| **Acceptance test** | The crawl writes all 764 pages to disk before anything is loaded, so the load can be re-run without re-crawling. The database then reports rows at source `returnit` within 10% of the 10,053 projection, every one with a size, and ten barcodes are searched back through the registry's own page by hand and match. Zero rows of type `Alcohol` are present, which is what proves the slice held. |
| **Falsifier** | The new-row count is out by more than 10% either way, which means the 1,839-row sample was not random over the eleven types; or an alcohol row lands, which means the type filter does not filter; or the site rate-limits the crawl so 764 pages cannot finish in an evening, in which case this unit parks with the pages already banked rather than restarting. |
| **Reopens on** | Parked by rate limiting promotes back when a slower schedule is shown to finish. |
| **Cost** | **1.4 hours**, from 764 pages at a **measured 6.7 seconds per page over 80 pages**. The full registry would be 9.6 hours. Unattended either way. |

### 7. Fill the missing sizes

| Field | |
| --- | --- |
| **State** | `queued`, after the loads |
| **Owner** | Aurik (catalogue) |
| **What** | A product with no size cannot be priced per unit and cannot be compared to anything, which is most of what the price range is for. |
| **Numbers** | **99,598 of our 123,854 Canadian food and drink rows have no size at all, counted.** Units 2, 3 and 6 each carry a size on every row, so the beverage overlap fills for free as a side effect of loading them. How much of the 99,598 that covers is `unmeasured` until they land. |
| **Acceptance test** | The no-size count over Canadian food and drink rows is reported before and after, from the database, and the after is lower. Twenty rows that gained a size are checked against the source that gave it. |
| **Falsifier** | A gained size disagrees with the size printed in the product's own name on more than 5% of a hand-checked sample, which means the unit is writing wrong sizes rather than missing ones, and wrong is worse than missing here. |
| **Reopens on** | Not applicable while queued. |

### 8. Decide what to do with the electronics parts list

| Field | |
| --- | --- |
| **State** | `queued`. A decision with a default, not a build. |
| **Owner** | Jamin, decision; Aurik, execution |
| **Numbers** | Of **494,511 Canadian electronics rows, counted: 312,324 have a name of twelve characters or fewer, and 267,073 are a bare part number, counted.** Those cannot be found by a word search and cannot be shown to a person. They are reachable by barcode and nothing else. |
| **The choice** | Keep them, reachable by barcode, and exclude them from the word search so they stop diluting it. Or spend effort naming them, which needs a source we do not have. |
| **Default if nobody decides** | Exclude from the word search, keep for barcode lookup. It is reversible in one line and it is the only option that costs nothing. |
| **Acceptance test** | The same twenty typed searches are run before and after. After, no result is a bare part number, and no result that was useful before has disappeared. The barcode path still finds all twenty of a set of part-number barcodes. |
| **Falsifier** | A typed search that used to return the right product no longer does, which means the exclusion rule caught real names too. |
| **Reopens on** | A source of real names for these products appears. |

### 9. Fill the category gap

| Field | |
| --- | --- |
| **State** | `queued`, after unit 4 |
| **Owner** | Aurik (catalogue) |
| **Numbers** | **134,865 products have no category whatsoever, counted**, which means the category price range has nothing to compute from for any of them. Unit 4 closes **6,782 of them for free, counted**. The remaining 128,083 need a source or a rule, and which is `unmeasured`. |
| **Acceptance test** | The no-category count is read from the database before and after and has dropped. For 30 rows that gained a category, the category is judged right by a person reading the product name, with the judgements written down and the wrong ones counted rather than glossed. |
| **Falsifier** | More than 10% of the 30 are judged wrong, in which case a guessed category is worse than no category, because a wrong category produces a confident wrong price range instead of no range. |
| **Reopens on** | Not applicable while queued. |

### 10. Finish the embeddings

| Field | |
| --- | --- |
| **State** | `parked` 2026-09-26. **Promotes back when a 10,000-row slice has been timed.** The word search already covers all 5,182,591 rows, counted, so this only affects the fuzzy path. |
| **Owner** | Aurik (catalogue) |
| **Numbers** | **718,662 of 5,182,591 products are embedded, counted.** The word search covers all of them, which is why this is last: it only affects the fuzzy path. After unit 1 the denominator is roughly forty times larger, so the run time is `unmeasured` and should be measured on a 10,000-row slice before anyone starts the full pass. |
| **Acceptance test** | Every row that has a name has a vector, counted from the database, and the same twenty fuzzy searches return at least as good a first result as before, judged by a person and written down. |
| **Falsifier** | The measured 10,000-row slice extrapolates to more than a day, in which case this unit is parked with the slice time recorded, not started and abandoned. |
| **Reopens on** | Parked promotes back when the embedder gets faster or the row set gets narrower. |

### 11. Delete the test junk from the scan store

| Field | |
| --- | --- |
| **State** | `queued`. First of everything, and **it needs his word** because it is his data. |
| **Owner** | Jamin, after he says so |
| **Numbers** | Counted: **nine products with barcodes "1" through "9", all named Kraft Dinner; one named "broken"; one with 5,623 scans recorded; 6,210 observations, none of which link to a real catalogue product; 645 of them carrying a price.** Sixteen products in total. |
| **What** | Anyone who computes on that store today gets a wrong answer, and units 5 and 7 both want to read it. |
| **Acceptance test** | The store holds zero products with a barcode shorter than eight digits, zero named "broken", and no observation whose scan count exceeds the number of observations that exist. A copy of the deleted rows is written to a file first so the delete is undoable. |
| **Falsifier** | A row that turns out to be a real scan is in the deleted set, which is why the copy is written before the delete and not after. |
| **Reopens on** | Not applicable while queued. |

### 12. Measure four more sources  --  THREE PARKED, USDA ONLY

| Field | |
| --- | --- |
| **State** | `queued` for USDA only. **Open Library, MusicBrainz and Discogs are `parked` 2026-09-26: around 30 million editions and 2,581,558 barcoded releases, none of which a grocery tester scans. They promote back when someone scans a book.** |
| **Owner** | Jamin |
| **Source strings** | `usda`, `openlibrary`, `musicbrainz`, `discogs`, one each |
| **What** | Four free sources with a barcode column that we hold nothing from. Books and music are real objects people point a phone at, and the catalogue has none of them. |
| **Numbers, all from the publishers themselves and none checked against our rows** | USDA branded foods, a 427 MB public-domain file with a barcode column. Open Library, around 30 million editions where the ISBN **is** the barcode, CC0. MusicBrainz, **2,581,558 releases of 5,804,963 carry a barcode**, CC0. Discogs, monthly, CC0. **Overlap with what we already hold is `unmeasured` for all four.** |
| **Acceptance test** | One written table, one row per source, giving rows downloaded, rows with a usable barcode, and rows not already in our catalogue, every figure counted by looking each barcode up rather than estimated from a sample. Each source then becomes its own `queued` load unit or is killed with the count that killed it. |
| **Falsifier** | A source's new-row count comes back under 5,000, in which case it is killed and the count is recorded, because a source that small is not worth a loader. |
| **Reopens on** | Killed on size reopens if the publisher's row count changes by an order of magnitude. |

---

### 13. Merge the duplicates the new sources create  --  BUILD, with the loads

| Field | |
| --- | --- |
| **State** | `queued`. Runs with units 2, 4 and 6a, not after them. |
| **Owner** | Aurik (catalogue) |
| **What** | Closes gap 4. Source ownership stops two loaders fighting over a row and therefore permits the same product to land three times under three source names. Rule: a barcode already present keeps its existing row and the new source contributes only fields that row is missing, a size, a category, a French name, plus its source recorded as a second witness. |
| **Numbers** | Counted: **39% of the BC non-alcohol sample is already in Québec's list**, **58.7% of Metro's barcodes are already in the catalogue**, and **4.8% of BC rows repeat a barcode inside BC itself**. Without this the totals inflate and a user sees the same drink twice. |
| **Half of this is already built, and the other half is worse than described.** Checked in the code 2026-09-26. `catalogue/src/load.ts:56` already ends `ON CONFLICT(code) DO UPDATE`, keyed on `product.code PRIMARY KEY`, so a barcode loaded twice as the **same string** updates one row and cannot duplicate. That is the 4.8%-within-BC case, handled. What is NOT handled: **nothing canonicalizes `code` before the insert**, so one barcode written two ways is two rows. Counted in the live catalogue: **1,375,443 products are stored under both a 12-digit and a zero-padded 13-digit spelling**, which is every 12-digit code in the table, 1,375,441 of them written by the electronics loader under both forms with the same name. **198,095 of those pairs are Canadian**, so **32% of the 618,365 rows the phone downloads are a second spelling of a product already in it.** Two pairs are genuine cross-source collisions with different names, a food name sitting on a games-controller barcode. So this unit's real job is a canonical form at load time plus one cleanup pass, not a merge rule. |
| **Acceptance test** | After all loads, no barcode appears on more than one row **in any spelling**: group by the digits with leading zeros stripped, not by the stored string, which is the check that would have caught the 1,375,443 above. Ten products that exist in two sources are read by hand and each shows one row carrying the better name and a size. |
| **Falsifier** | A merge overwrites a name or size that was better than the one it took, found on a hand-checked sample of twenty, which means the field-preference rule is wrong and merging is doing damage rather than tidying. |
| **Reopens on** | Not applicable while queued. |

### 14. Prove the catalogue work changed an answer  --  BUILD, last

| Field | |
| --- | --- |
| **State** | `queued`. Needs unit 5 to have fired at least once. |
| **Owner** | Jamin |
| **What** | Closes gap 3. Every other acceptance test in this plan counts rows, and rows are not answers. This one holds a set of barcodes and typed names that miss **today**, re-runs them after the loads, and counts how many now hit. It is the only unit here whose result could say the whole effort was not worth it. |
| **Numbers** | The held set comes from the miss log, which today has **94 text misses and 0 barcode misses, counted**, and whose heaviest entries are our own test strings. So the set has to be built from real scans first, which is unit 5's job. **Size of the held set: unmeasured until unit 5 runs.** |
| **Acceptance test** | A written before-and-after table, one row per held barcode, run by a process that did not do the loading. It passes if the hit rate rises. It is still a pass if the rate does not rise, and the number is recorded either way. |
| **Falsifier** | The hit rate does not move, which means the sources added products nobody scans, and the next catalogue decision is aimed at the miss log instead of at whatever is downloadable. |
| **Reopens on** | Not applicable while queued. |

### 15. Load New Brunswick's liquor price list  --  BUILD

| Field | |
| --- | --- |
| **State** | `queued`, alongside unit 3 |
| **Owner** | Aurik (prices) |
| **Writes** | `observation` in the price database, seller `anbl`, and new catalogue rows at source `anbl` |
| **What** | ANBL publishes its whole public price list as a free PDF with no login, `https://www.anbl.com/medias/PriceList-Public.pdf`, 2.70 MB. Columns: class, **UPC**, description with the container size in the name, base price, HST, deposit, and shelf price. Extract with `pdftotext -table`; `-layout` mangles the columns. |
| **Numbers** | **6,731 rows parsed of about 6,789, counted**, every one with a barcode and a price. **6,487 are new to the catalogue. 5,977 are priced barcodes BC does not have. Zero are in the price store today.** By class: 3,251 wine, 1,484 spirits, 1,468 beer, 471 other. Loading it with unit 3 takes the price store from **438 distinct barcodes to about 13,970**. |
| **Acceptance test** | The price database reports at least 6,700 observations at seller `anbl`, currency CAD, country CA, region NB, and five prices are read back and matched by hand against the PDF's own rows. The distinct-barcode count rises past 13,900. Store the **shelf** price and the **base** price in separate fields; New Brunswick's HST is inside the shelf figure and BC's is not, which is why the two provinces' numbers must not be averaged naively. |
| **Falsifier** | Fewer than 6,000 rows parse, which means the PDF layout shifted and the regular expression is silently dropping rows rather than the file being thin. A price of zero also fails, since the source contains none. |
| **Reopens on** | ANBL republishes the PDF; it carries no date in its name, so the file's own bytes are the version. |
| **Skipped deliberately** | **Manitoba.** It publishes the same shape with a barcode column, but about **874 rows dated 2021**, five years stale and an eighth the size. Reopens if MBLL publishes a current one. |
| **Searched properly and not found** | **Quebec and Nova Scotia**, closed 2026-09-26 by opening the liquor boards' own sites, not just the portals. Quebec: SAQ publishes no export, and the only alcohol data on the province's open-data portal is RACJ's **licence-holder lists**, retailers and manufacturers, with no products and no barcode column. Nova Scotia: NSLC's product pages carry an internal **article number and no barcode at all**, and its price lists are agency and licensee accounts only. Nova Scotia is the harder no of the two, because crawling its storefront would not produce a barcode even if we paid the hours. Quebec's no is about files only; its storefront was never crawled. |

## What makes this plan checkable rather than asserted

Four rules, each already the repo's practice or a standing instruction:

1. **Counts come out of the database after loading, never off the loader's own tally.**
   `docs/catalogues.md` already says this and it is why the food count there reads 122,157.
2. **Every load carries a negative control.** A handful of barcodes known to be absent from the
   source are checked absent after loading. Without it, a loader that invents rows passes.
3. **Every unit's acceptance test is checked where its consumer meets it** and by something other
   than the code that did the work.
4. **A unit that cannot finish is parked with its measurement attached**, never left half-run.

## What is deliberately not in this plan

- **Anything needing an account, a licence negotiation or money.** Every unit above is free and
  needs no signup.
- **Prices from anywhere but units 3 and 15.** The growth units add names and sizes, not prices.
  Only the two liquor lists raise the chance the price is right; the rest raise the chance a scan
  finds anything at all. Saying otherwise would oversell the plan.
- **A province price adjustment.** Measured worthless twice, see the section above. Not a gap.
- **The sources already ruled out**, so nobody spends a second pass on them: Ontario's liquor file
  is paid and agents-only with terms forbidding third-party distribution, Loblaws and No Frills and
  Dollarama publish no product pages, Giant Tiger's pages carry a price and a stock number but no
  barcode, Flipp's flyer feed has no barcode field by design, Home Depot refuses automated reads,
  no Canadian open data goes below category averages, and every manufacturer and distributor
  catalogue checked routes to a sales rep. Evidence in `docs/lookup-alternatives-2026-09-23.md`
  and this session's sweeps.
- **Open Food Facts' crowd-sourced price project, and the reason is a control that nearly went
  unrun.** Its API reported 317,460 prices and 7,384 Canadian stores. **Passing a nonsense country
  name returned the identical totals**, so those filters are ignored and both figures are
  meaningless. The one filter that does work gives **667 prices in Canadian dollars, counted**, and
  we already hold 874 rows from that project. Not a growth source. Anyone quoting the big numbers
  as Canadian coverage is wrong by nearly three orders of magnitude.
- **The Consumer Price Index, for anything about where prices are higher.** It measures change over
  time within a province, never the level between provinces.

## Provincial liquor lists, the full status

| Province | Free file with a barcode and a price | Status |
| --- | --- | --- |
| British Columbia | **yes**, open data CSV | **unit 3**, 7,556 rows |
| New Brunswick | **yes**, public PDF | **unit 15**, 6,731 rows |
| Manitoba | yes, public PDF | skipped: about 874 rows **dated 2021** |
| Alberta | no downloadable file on the pages opened | browsable catalogue only |
| Saskatchewan | no downloadable file on the pages opened | browsable catalogue only |
| Ontario | has one, but **paid, agents-only, no third-party distribution** | ruled out |
| Ontario Cannabis Store | login-gated B2B portal | out of scope |
| Quebec | **no file found**, after opening SAQ itself | SAQ has no export; the portal's only alcohol data is RACJ **licence-holder** lists, no products, no barcode |
| Nova Scotia | **no barcode exists to find** | NSLC product pages carry an internal article number only; price lists are licensee-account gated; Divert NS publishes no container registry |

Quebec and Nova Scotia were written as unknown in the first draft because one portal search had
returned nothing, which is a fact about the search. They were closed on 2026-09-26 by opening the
two liquor boards' own sites, the provincial open-data portals under six terms each, and Nova
Scotia's deposit agency: **SAQ**, **donneesquebec.ca**, **racj.gouv.qc.ca**, **mynslc.com**,
**data.novascotia.ca** and **divertns.ca**. Both are now negatives with a named search space, and
they are not the same kind of negative. Quebec might still yield to a storefront crawl of the kind
unit 6a runs on British Columbia, which was not attempted. Nova Scotia would not: the barcode is
not on the page, so no amount of crawling produces one, and that closes the province rather than
deferring it. Reopens if NSLC ever prints a UPC on a public product page.

## Totals, and what is honest about them

**What the MVP build delivers**, units 0, 11, 2, 3, 4, 5, 6a:

| | Counted | Projected |
| --- | --- | --- |
| New products from units 2, 3, 4 | **61,836** | |
| New products from unit 6a, the non-alcohol slice | | about **10,053** after Québec is loaded |
| New products from unit 15, New Brunswick | **6,487** | |
| Priced barcodes, today to after units 3 and 15 | **438 to about 13,970** | |
| Categories filled by unit 4 | **6,782** | |
| Sizes filled by units 2, 3, 6a | | unmeasured until they land, against 99,598 missing |
| Shipped pack size, brotli | **7.47 MB at 618,310 rows** | about **8.4 MB**, derived by scaling |

So about **78,000 new Canadian products and a 32-fold larger price store**, from five downloads and
one 1.4-hour crawl, against **618,365 Canadian products held today, counted**.

**What parking costs**, so the choice is visible rather than buried: 4,636,853 food rows reachable
online only, about 128,000 alcohol containers of which at most 5.8% could be priced, the fuzzy
search left covering 14% of the catalogue, and no books or music at all.
