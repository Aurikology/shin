# Catalogue build plan, 2026-09-26

Twelve units that grow or repair the catalogue, each one shippable on its own. Written to the
`QUEUE.md` convention: every unit carries a state, an acceptance test checked where its consumer
meets it, a falsifier, and what reopens it. Nothing here is built yet; every row is `queued`.

**Every number below is labelled.** `counted` means read out of a file or a database this session.
`projected` means measured on a stated sample and extrapolated. `unmeasured` means nobody has
looked yet, and the unit's first step is to look.

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

## The two lanes, and why they cannot collide

| Lane | Writes | Units |
| --- | --- | --- |
| **Catalogue lane** | `product`, `product_category`, `product_fts`, `product_vec` in `catalogue/data/catalogue.db` | 1, 2, 4, 6, 7, 8, 9, 10, 12 |
| **Price lane** | `observation` in `price/data/prices.db` | 3 |
| **Neither** | the two logs, and the user store | 5, 11 |

One rule makes the catalogue lane safe to run in parallel with itself: **a loader may only insert or
update rows whose `source` it owns.** Each unit below names its source string. Two loaders with
different source strings never touch the same row, so units 2, 4, 6 and 12 can run at the same time
in any order. Units 7, 8, 9 and 10 read every source and must run after the loads, or run twice.

## The order, set by what cannot be taken back

Nothing here is spent-once, so ordering is by what blocks what, not by risk:

1. **Unit 11 first, alone.** It deletes rows. Anything that computes on the user store before it
   runs computes on junk, and any measurement taken before it is void.
2. **Unit 1 next, alone.** It multiplies the food table by roughly forty and rewrites the size of
   every later count. Measuring anything else first means measuring it twice.
3. **Units 2, 3, 4, 6, 12 in parallel** once 1 has landed. Different sources, different files.
4. **Units 7, 8, 9, 10 after the loads**, because each one reads across all sources.
5. **Unit 5 whenever.** It blocks nothing and nothing blocks it, and until it lands, every unit
   here is aimed by argument instead of by evidence.

---

## The units

### 1. Stop discarding 97% of the food data

| Field | |
| --- | --- |
| **State** | `queued`. First. |
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

### 4. Take Metro's barcodes and its aisle paths

| Field | |
| --- | --- |
| **State** | `queued` |
| **Owner** | Jamin |
| **Source string** | `metro` for new rows; existing rows get only a category, never a name or a flag |
| **What** | Metro publishes its product page addresses, and the number ending each address **is the barcode**. Proven, not assumed: **58.7% of them, 13,412 of 22,850, match a product we already hold, by barcode, counted.** A private stock number would match nothing. The address also spells out the aisle the product sits in, and the slug is a product name in French. |
| **Numbers** | **25,265 product addresses, counted. 22,850 with a 12 or 13 digit barcode, counted. 9,438 barcodes new to us, counted. 6,782 of the products it matches are ones we hold with no category at all, counted.** Two of Metro's four regional lists were empty at fetch time, counted, so the run must tolerate that and retry rather than record a zero. |
| **Acceptance test** | Two separate checks. The `no leaf_category` count across the whole catalogue drops by at least 6,000 from 134,865. And at least 9,000 rows exist at source `metro`, each with a name and a category, five of them opened in a browser by hand and confirmed to be the product the row claims. |
| **Falsifier** | The category filled in from an aisle path disagrees with the category the product already had on more than 5% of the rows where both exist, which would mean aisle is not category and the mapping needs a table. A run that records zero rows because a regional list was empty is also a failure, not a result. |
| **Reopens on** | Metro republishes; the lists carry today's date. |

### 5. Find out why the barcode half of the miss log has never fired

| Field | |
| --- | --- |
| **State** | `queued`. Blocks nothing, and blocks the aim of everything. |
| **Owner** | Jamin |
| **What** | The log records text misses and has **94 of them over 250 hits, counted**. It has recorded **zero barcode misses, counted**, though the recorder classifies them and the search path passes a barcode to it. Either no barcode scan has ever missed, which the 6,210 unmatched rows in the user store argue against, or the app's barcode path does not reach that recorder. Find which, in the running app, and fix it if it is the second. |
| **Numbers** | **94 entries, 250 hits, 0 with a barcode, last written 2026-09-19, counted.** The heaviest entries are our own test strings, counted. So there is no real-user signal in it yet, from either half. |
| **Acceptance test** | A barcode that is genuinely absent is scanned in the running app and appears in the log as a barcode miss within a minute, read out of the log file by a second process, not asserted by the code that wrote it. Then five real absent barcodes scanned in a store produce five entries. |
| **Falsifier** | The scan produces no entry, or produces a text entry instead of a barcode entry. |
| **Reopens on** | Not applicable while queued. |
| **Why it is worth its place** | Every other unit here decides what to add by argument. This is the only one that makes the next decision evidence. |

### 6. Crawl BC's deposit registry

| Field | |
| --- | --- |
| **State** | `queued`, and the only unattended long-runner |
| **Owner** | Aurik (catalogue) |
| **Source string** | `returnit` |
| **What** | BC publishes the same registry as Québec but as a paged search rather than a file. The pager prints its own totals, so the denominators are exact: **154,401 containers, of which 130,404 are alcohol and 1,090 de-alcoholised, counted off the pager.** Thirty rows a page, so **5,147 page reads**. Every row carries brand, flavour, drink type, container size and material, and a barcode. It needs a browser user agent; plain requests get 403, and the PDF links that were thought to exist return 404. |
| **Numbers** | Measured on **2,400 rows sampled from 80 random pages: 96% carry a barcode, 100% carry the brand and container size, 98.6% are not in our catalogue.** That **projects to about 146,000 new products, projected, not counted**, and stays projected until the crawl runs. Also counted on that sample: **4.8% of rows repeat a barcode already in the sample**, so the row count is not the product count and the loader must collapse duplicates. |
| **Acceptance test** | The crawl writes 5,147 pages to disk before anything is loaded, so the load can be re-run without re-crawling. The database then reports rows at source `returnit` within 10% of the projection, every one with a size, and ten barcodes are searched back through the registry's own page by hand and match. |
| **Falsifier** | The projection is out by more than 10% in either direction, which means the 80-page sample was not random over the registry; or the site rate-limits the crawl to the point that a full pass cannot finish in a day, in which case this unit is parked with the pages already banked rather than restarted. |
| **Reopens on** | Parked by rate limiting promotes back when a slower schedule is shown to finish. |
| **Cost** | About two and a half hours at one second a page, `projected` from a measured 6.7 seconds per page over 80 pages, which is slower than one a second and makes the real figure nearer nine hours. **Take the nine.** |

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
| **State** | `queued`, last of the catalogue lane |
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

### 12. Measure four more sources before loading any of them

| Field | |
| --- | --- |
| **State** | `queued` |
| **Owner** | Jamin |
| **Source strings** | `usda`, `openlibrary`, `musicbrainz`, `discogs`, one each |
| **What** | Four free sources with a barcode column that we hold nothing from. Books and music are real objects people point a phone at, and the catalogue has none of them. |
| **Numbers, all from the publishers themselves and none checked against our rows** | USDA branded foods, a 427 MB public-domain file with a barcode column. Open Library, around 30 million editions where the ISBN **is** the barcode, CC0. MusicBrainz, **2,581,558 releases of 5,804,963 carry a barcode**, CC0. Discogs, monthly, CC0. **Overlap with what we already hold is `unmeasured` for all four.** |
| **Acceptance test** | One written table, one row per source, giving rows downloaded, rows with a usable barcode, and rows not already in our catalogue, every figure counted by looking each barcode up rather than estimated from a sample. Each source then becomes its own `queued` load unit or is killed with the count that killed it. |
| **Falsifier** | A source's new-row count comes back under 5,000, in which case it is killed and the count is recorded, because a source that small is not worth a loader. |
| **Reopens on** | Killed on size reopens if the publisher's row count changes by an order of magnitude. |

---

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
- **Prices from anywhere but unit 3.** Three of the four growth units add names and sizes, not
  prices. Only unit 3 raises the chance the price is right; the rest raise the chance a scan
  finds anything at all. Saying otherwise would oversell the plan.
- **The sources already ruled out**, so nobody spends a second pass on them: Alberta publishes no
  public list, Ontario's is behind a login, Loblaws and No Frills and Dollarama publish no product
  pages, Giant Tiger's pages carry a price and a stock number but no barcode, Flipp's flyer feed
  has no barcode field by design, Home Depot refuses automated reads, no Canadian open data goes
  below category averages, and every manufacturer and distributor catalogue checked routes to a
  sales rep. Evidence in `docs/lookup-alternatives-2026-09-23.md` and this session's sweeps.

## Totals, and what is honest about them

| | Counted | Projected |
| --- | --- | --- |
| New products from units 2, 3, 4 | **61,836** | |
| New products from unit 6 | | about **146,000** |
| Food rows unit 1 stops discarding | **4,636,853** | how many are worth keeping is unmeasured |
| Priced barcodes, today to after unit 3 | **438 to 7,994** | |
| Categories filled by unit 4 | **6,782** | |

Against **618,365 Canadian products held today, counted**. Units 2, 3 and 4 alone are three
downloads and no crawling.
