# Methods for requirements 4.1-4.8 and 5.1-5.8 (data intake, growth, customer data)

Written 2026-10-01. Research only; nothing in any repo was changed.

## How to read this

Evidence labels used on every claim:
- **OPENED**: page or PDF read in full or in the relevant part this session (PDFs read with pdftotext).
- **SNIPPET**: only a search-result summary seen; the page itself was not opened. Treat as unverified.
- **MEMORY**: well-known reference I did not open this session. Treat as unverified until opened.
- **MY REASONING**: my inference, not from a source.

Known ground NOT redone (already in `C:\shin\research\price-system-references-*-2026-09-28.md` and `C:\shin\docs\price-data-design-2026-09-28.md`): Open Prices basics, Robotoff, Project Hammer schema, schema.org Offer/PriceSpecification, GTIN normalisation, Robinson-Arbia post-sampling weights, Waze Sybil paper (15 bots), Zheng et al. VLDB 2017 truth-inference survey (majority vote above 20 answers per task, Dawid-Skene when sparse), Splink/dedupe, MAPIE/conformal. I reuse those only where they carry weight and say so.

## Problems in the requirements themselves (found while researching; his call, not mine)

1. **4.8 versus the current sources.** "Take nothing with no licence" would remove today's sources. Walmart's category pages saved by hand have no licence; Walmart's terms (SNIPPET, secondary mirror, walmart.com rather than .ca) forbid robots/scraping and say "manual or automatic device ... without express prior written consent". Project Hammer's data page states no licence (OPENED). Save-On-Foods barcode lookups: no licence known. Open Prices (ODbL) and Statistics Canada (Open Licence) are the only clearly licensed sources. Needs his decision on a status list (for example: open licence / written permission / none recorded and accepted by him / prohibited), because as written the pass test would be met only by deleting the main sources, which also contradicts 4.2 "delete nothing".
2. **5.3 and 5.4 together leave a hole.** The design doc (section 7) lets "another shopper" count as the independent source. Fifteen fake accounts can then corroborate each other, each counting once, and move a range. The "15 fake accounts" test must include fakes agreeing with each other, not only fakes reporting separately. Independence needs a definition (at least one non-shopper source, or shoppers above a trust floor).
3. **5.1 versus 5.6.** "Store" is stored on every scan with no consent, and scans carry a time. Store plus time is a location trace even with no GPS. de Montjoye et al. (OPENED via search page, PMC3607247): four spatio-temporal points identified 95% of 1.5M people even at cell-tower resolution, and coarsening helps slowly (uniqueness falls roughly as the 1/10 power of resolution). "0 exact positions stored" will pass while the store trail still identifies someone. Needs a decision on keeping user id next to fine timestamps.
4. **5.8 anchoring.** If the shopper sees Shin's verdict before making their own call, agreement measures the display, not the shopper. Log the shopper's call before reveal, or randomise a share of scans.
5. **4.6 may be unachievable as worded.** A range that is the spread of prices in a category converges to the true spread; it does not shrink to zero with more data. What shrinks is estimation error (small-sample inflation), and widths shrink when splits (1.3) or item-level models replace category spread. The pass test needs a floor and a held-out learning curve (see 4.6). MY REASONING.
6. **4.5 may pass vacuously.** Hammer data starts 2024-02-28 and Shin's own rows are recent, so "oldest 100 rows" may all be well under 2 years. Test with synthetic aged rows (see 4.5).
7. **4.3 needs barcodes.** Walmart pages carry no barcode, so overlap with barcode-checked prices (the 30-price rule) cannot be measured for them until an identity link exists; their trust stays a guess. State this rather than let it look like a failure.
8. **4.7 at 100x.** Resampled synthetic rows test speed but cannot test accuracy (section 7). Say which of sections 7 and 8 the load test really covers.

---

# Section 4. Data intake and growth

## 4.1 One intake format for any source (pass: a new test source runs end to end with no change outside its reader)

### Method A (recommended first): one canonical observation record, one adapter per source, contract test with a toy source
- **What:** Define one record type for an observation (price, currency, unit/size fields, sale flag, was-price, store, region, observed_at, valid_from/valid_through, source id, raw reference, optional identity link). Each source gets a reader that only maps source rows to that record. Canonical field list borrows from Open Prices, whose price object has price, price_is_discounted, price_without_discount, currency, product barcode, location as an OpenStreetMap id, date, proof type (OPENED, data.gouv.fr dataset page; its ODbL licence also OPENED). schema.org Offer/PriceSpecification (priceType strikethrough, validFrom/validThrough) gives names for the sale and validity fields (already in references). GTIN normalised to one canonical form (already in references).
- **URLs:** https://www.data.gouv.fr/datasets/open-prices ; https://github.com/openfoodfacts/open-prices ; https://schema.org/PriceSpecification
- **Evidence it works:** Open Prices runs this shape in production: 150,000 prices, 4,500 locations, 48,000 proofs, 2,300 contributors, 8,000+ prices per month (OPENED, FOSDEM 2026 slides). Its stated rule is that every entry has price + product + location + date + contributor + proof. No accuracy number applies; this is a design pattern.
- **Fit to Shin:** Exact fit. The design doc (section 4) already says "one intake contract; a new site is a new reader". TypeScript side: a strict runtime schema (Zod or JSON Schema) at the boundary; offline Python readers emit JSON lines in the same schema.
- **Cost:** Days of work, no money. **Legal:** none; but record the source's licence at the reader (see 4.8).
- **How to run the pass test:** write a throwaway reader for an invented store (CSV of 50 rows, including one sale row and one row with no barcode). Run it through intake, observation table and range code. The check is mechanical: `git diff --name-only` after adding the reader lists only files inside that reader's folder plus its fixture; the end-to-end run produces 50 stored rows and a range. Make the check go red once by editing a shared file.

### Method B: Singer-style stream protocol (SCHEMA then RECORD messages) between readers and the loader
- **What:** Readers (taps) print JSON lines: a SCHEMA message, then RECORD messages; one loader (target) validates and writes. Any language can be a reader.
- **URL:** https://hub.meltano.com/singer/spec/ ; wrapper that lets Singer run Airbyte sources: https://github.com/meltanolabs/tap-airbyte-wrapper
- **Evidence:** OPENED (spec summary via search): SCHEMA must precede RECORDs; the Airbyte wrapper adds "over 250" extractors (SNIPPET). No price-specific number.
- **Fit:** Good for the nightly Python side (readers in Python, loader in TypeScript or Python), and it forces the schema-first habit. Heavier than needed if all readers are in one language.
- **Cost:** free (Apache/MIT style licences, MEMORY). **Legal:** none.
- **Pass test:** same toy-source test; additionally a malformed record must be rejected by the loader and counted (feeds 4.2).

### Method C: Frictionless Data Table Schema / dlt for declarative validation
- **What:** Describe the canonical record as a Table Schema (types, constraints) so validation is data, not code; dlt (Python) loads with schema contracts.
- **URLs:** https://specs.frictionlessdata.io/table-schema/ (MEMORY, not opened) ; https://dlthub.com (MEMORY, not opened).
- **Evidence:** none gathered. **Fit:** optional; only worth it if readers multiply past about 10. **Pass test:** as Method A.

**Recommendation: Method A**, with Singer-style message framing borrowed only if Python readers proliferate.

---

## 4.2 Keep every captured price whole; delete nothing; hold outliers flagged (pass: 0 deletions; count in equals count stored)

### Method A (recommended first): append-only raw plus observation tables, enforced in the database, with a per-batch reconciliation ledger
- **What:** (1) Raw layer: the file itself stored content-addressed (sha256 filename), never edited. (2) Observation layer: one row per tile/line, never updated or deleted; corrections are new rows that reference the old one. In SQLite enforce it with `BEFORE UPDATE`/`BEFORE DELETE` triggers that `RAISE(ABORT)`. (3) Batch ledger: each import writes `rows_read`, `rows_stored`, `rows_rejected_with_reason`, file hash; "count in equals count stored" is `rows_read = rows_stored + rows_rejected` where rejected rows are also stored in a rejects table (so nothing is lost). This is the bronze/silver layering used in data lakes (MEMORY) and is the "three layers" of the design doc section 1.
- **URL:** design in `C:\shin\docs\price-data-design-2026-09-28.md`; SQLite triggers: https://www.sqlite.org/lang_createtrigger.html (MEMORY).
- **Evidence:** Project Hammer publishes a separate immutable `raw` price table plus a `product` table and documents its own defects instead of deleting rows (OPENED: duplicates for about 6,500 products/day, Save-On-Foods name mismatches fixed after 2024-12-24, UPC reliability varies). It is the same practice. No accuracy number.
- **Fit:** Perfect for SQLite; storage at 1.5M rows is a few hundred MB.
- **Cost:** hours. **Legal:** raw files hold third-party content: see 4.8 (copyright in page layout/images is separate from the price fact).
- **Pass test:** import three batches (normal, one with sale and no-barcode rows, one with malformed rows). Assert ledger balance per batch. Attempt `DELETE` and `UPDATE` on observation and raw rows: the triggers must abort. Then drop the trigger and show the test goes red (per his "a check is not a check until it has gone red").

### Method B: outlier holding by robust score on log unit price within category, flag not drop
- **What:** Modified z-score (Iglewicz-Hoaglin): M = 0.6745 (x - median) / MAD, flag when |M| > 3.5, computed on log unit price within the finest category with enough rows (fall back to parent). Flagged rows get `held = 1` and are excluded from ranges until something agrees (matches design doc section 7: "held, not dropped, until something agrees").
- **URL:** https://itl.nist.gov/div898/handbook/eda/section3/eda35h.htm
- **Evidence:** OPENED (via search summary of NIST page): 3.5 threshold recommended; uses median and MAD so contamination does not hide the outlier. How shipped products do it: GasBuddy says it uses "automated algorithms" to detect "obviously wrong information" and lets users report other users' false prices; the rate of such errors is not published (OPENED, EIA JSM 2018 paper, `ww2.amstat.org/meetings/proceedings/2018/data/assets/pdf/867118.pdf`). Spatial-neighbour outlier flag from Robinson-Arbia is the alternative (already in references).
- **Fit:** Good, 20 lines. Caveat: a genuine sale looks like an outlier; hold only on the high side and on non-sale rows, and treat sale rows as their own distribution (3.6). MY REASONING.
- **Cost:** none. **Legal:** none.
- **Pass test:** inject 20 rows at 10x and 0.1x category median plus 20 normal sale rows; assert all 40 stored, the 20 extreme flagged, sale rows not flagged as errors, and no range uses a flagged row. Negative control: flag threshold set absurdly high must fail to flag.

### Method C: declarative data tests in the nightly job (Great Expectations / dbt style)
- **What:** the count-in equals count-stored rule and the no-delete rule written as nightly assertions that fail the build. URL: https://greatexpectations.io (MEMORY). Fit: only if the nightly Python job grows; the ledger in Method A is simpler.

**Recommendation: Method A for storage, Method B for holding.**

---

## 4.3 Source trust: a starting guess, replaced by measured agreement with barcode-checked prices once 30+ overlap (pass: replaced for every source with 30+ overlapping prices)

### Method A (recommended first): direct measured agreement against the verified anchor, shrunk toward the guess
- **What:** For each source, over rows that overlap a barcode-verified price (same product, store, week): compute the median absolute log ratio (or share within 5%). Trust = shrinkage between the starting guess and the measured value: (n x measured + k x guess) / (n + k), with k chosen so that n = 30 mostly replaces the guess. Mark `trust_basis = 'guess'` until n >= 30 then `'measured'`. This is the simplest form of "gold standard" calibration used in crowdsourcing; the EIA paper treats commercial and crowdsourced gas prices exactly this way, linking them to a probability survey (EIA-878, about 1,000 stations weekly) and judging coverage, measurement and missing-data error (OPENED).
- **URLs:** EIA/GasBuddy/OPIS paper above; empirical-Bayes shrinkage (MEMORY).
- **Evidence:** EIA matched 98-99% of its sample stations to commercial sources, and found about 6% missing regular-grade prices for one source versus about 22% (and about 40% for other grades) for another (OPENED, table in the paper). That shows source error differs widely and can be measured by linking to a verified set.
- **Fit:** Right size. Needs an overlap of verified prices; see problem 7 above (Walmart has no barcode).
- **Cost:** none. **Legal:** none.
- **Pass test:** SQL recomputation: for every source with at least 30 overlaps, `trust_basis = 'measured'` and the stored value equals an independent recomputation. Negative control: a synthetic source that is exact and another with 20% noise must come out ranked correctly; a source with 29 overlaps must still read 'guess'.

### Method B: CRH truth discovery (joint estimate of true values and source weights, continuous data)
- **What:** Alternate two steps: estimate each true price as the weighted combination of sources; set each source's weight as minus the log of its share of total loss. Handles continuous values directly, so it suits prices. Useful where there is no barcode-verified anchor (it infers reliability from agreement across sources).
- **URL:** https://cse.buffalo.edu/~jing/doc/sigmod14_crh.pdf (Li, Li, Gao, Zhao, Fan, Han, SIGMOD 2014).
- **Evidence:** OPENED (Table 6). Mean absolute normalised distance (MNAD), lower better. Stock data: CRH 2.64, Median 3.93, Mean 7.19, TruthFinder 2.77. Flight data: CRH 4.86, Median 7.85, Mean 8.29, TruthFinder 7.20. Weather: CRH 4.69, TruthFinder 5.19, Median 4.99. So against the plain median CRH cut error 33% (stock) and 38% (flight); TruthFinder is competitive only on stock. A companion study found simple voting reaches only 0.908 (stock) and 0.864 (flight) precision, and that removing copied sources lifts flight precision from 0.864 to 0.927 (OPENED, Li et al., VLDB 2013, https://arxiv.org/abs/1503.00303).
- **Fit:** Small enough to run nightly in Python on 15k rows (hundreds of lines). Risk: agreement among sources that copy each other (aggregators repeating Walmart) is not independence; apply a copy flag first.
- **Cost:** none (papers; reimplementable). **Legal:** none.
- **Pass test:** simulate 5 sources with known noise (1%, 3%, 5%, 20%, 40%) over 500 products; CRH weights must order them correctly and its estimate must beat the median on error; then add a duplicate (copy) source and show the copy flag stops it gaining weight.

### Method C: Knowledge-Based Trust style estimation and Dawid-Skene for yes/no checks
- **What:** Estimate a source's accuracy from how many of its facts are correct. Google applied it to 2.8 billion facts from 119 million web pages (https://arxiv.org/abs/1502.03519, OPENED via search page). Dawid-Skene for categorical decisions (for example "is this match correct"): Crowd-Kit has it (https://github.com/Toloka/crowd-kit, OPENED via search page: `DawidSkene(n_iter=100).fit_predict(df)` on task/worker/label data).
- **Fit:** Method C is overbuilt for prices. Dawid-Skene is the right tool for 5.5/5.8-type categorical labels, not for price values. Use only if source-level agreement is on decisions.
- **Survey for choosing:** Li et al., "A Survey on Truth Discovery", https://arxiv.org/abs/1505.02463 (OPENED via search page).

**Recommendation: Method A first (it is exactly what the requirement says); add CRH only where overlap with barcode-verified prices is impossible.**

---

## 4.4 Record store, region and date on every price where known (pass: 100% where the source has them)

### Method A (recommended first): per-source capability declaration plus null-rate test
- **What:** Each reader declares which of store / region / date / sale flag it can supply (design doc section 4). Constraints: where declared, the column is `NOT NULL` in the reader's validation. Store identity via an OpenStreetMap shop node or a retailer store id, as Open Prices does (locations by OSM id, OPENED). Distinguish dates: `observed_at` (when seen), `valid_from`/`valid_through` (flyer week; schema.org PriceSpecification fields, already in references) and `source_updated_at`.
- **URLs:** https://www.data.gouv.fr/datasets/open-prices (location by OSM id) ; https://schema.org/PriceSpecification
- **Evidence:** Open Prices rule "price + product + location + date + contributor + proof" with 4,500 locations (OPENED). Hammer has the timestamp (`nowtime`) on every row and a fixed store per run (OPENED).
- **Fit:** Direct. Region: province and population centre match Statistics Canada geography (OPENED, table 18-10-0245-01), so region keys can join the one government series.
- **Cost:** low. **Legal:** OSM data is ODbL (attribution); store addresses are facts.
- **Pass test:** `SELECT source, COUNT(*) FILTER (WHERE store IS NULL) ...` grouped by source, compared with the declared capability table; zero gaps where declared. Negative control: delete the date from one fixture row and see the check fail.

### Method B: store registry reconciled by geocoding (Nominatim/Overpass) for sources that only give an address
- **What:** map addresses to a registry of stores once. Hammer shows why: product ids and brand/name matching vary by retailer (OPENED). MEMORY for Nominatim/Overpass; not opened. Fit: only for sources that print an address (flyers, receipts).

**Recommendation: Method A.**

---

## 4.5 Lower an old price's weight with age; nothing over 2 years in a typical price (pass: checked on the oldest 100 rows)

### Method A (recommended first): exponential decay weight, hard cutoff at 730 days, weighted quantiles
- **What:** weight = 0.5^(age / half-life) per category class; rows older than 730 days get weight 0 and are excluded from centres but kept in the table (4.2). Range edges come from weighted quantiles (the typical price and the spread), not weighted means.
- **URL (implementation trick):** forward decay (Cormode, Shkapenyuk, Srivastava, Xu, ICDE 2009): weight each row by g(t_i - L) from a fixed landmark L so a stored weight never needs rewriting as time passes. https://dimacs.rutgers.edu/~graham/pubs/html/CormodeShkapenyukSrivastavaXu09.html
- **Evidence:** OPENED (via search): used in practice, since Apache Solr uses forward-decaying priority reservoir sampling. No grocery-specific half-life exists in anything I opened; Statistics Canada warns that product rotation, quality and quantity change make over-time comparisons unreliable (OPENED, derivation page), which supports a hard cutoff and not an infinite tail.
- **Fit:** one column, one formula. The half-life per category class is a parameter to be fitted, not guessed (Method B).
- **Cost:** none. **Legal:** none.
- **Pass test:** insert 100 synthetic rows aged 400 to 1,000 days (real rows may all be recent; see problem 6). Assert every row over 730 days has weight 0 and is absent from every centre; weights are strictly decreasing with age; recompute one range by hand. Negative control: set the cutoff to 5 years and the test must fail.

### Method B: fit the half-life on held-out later prices
- **What:** choose the half-life that minimises the interval score or pinball loss on prices from later dates, per category class (links to 7.1 and 7.5). Interval score tool: scoringutils (already in references).
- **Evidence:** none for groceries; MY REASONING. **Fit:** small search, runs nightly offline in Python.
- **Pass test:** the fitted half-life must beat "no decay" and "30-day decay" on held-out error by more than run-to-run noise (7.4 style).

**Recommendation: Method A now; Method B once there are 6+ months of dated prices.**

---

## 4.6 Narrow ranges as data grows (pass: median width falls as prices per category rise, tracked each rebuild)

### Method A (recommended first): learning-curve test on held-out categories
- **What:** For categories with enough data, subsample to n = 5, 10, 20, 40, 80 prices, build the range each time with the same method, and plot median width (high over low) at fixed coverage. This measures "narrows as data grows" directly instead of waiting for calendar growth. Track the number and the floor each rebuild. Use conformalised quantile intervals so small-n widths are honestly inflated (the (n+1) correction) and fall as n grows.
- **URL:** conformalised quantile regression (Romano, Patterson, Candes 2019) and MAPIE tutorial, both already in references (prediction-verdict file, Part 2).
- **Evidence:** the mechanism (quantile error and small-sample inflation shrink roughly with 1/sqrt(n); spread does not) is MY REASONING and standard statistics; no external number gathered.
- **Fit:** easy once the harness (design doc section 6) exists.
- **Cost:** none. **Legal:** none.
- **Pass test:** Spearman correlation of n versus median width, negative and significant, with a stated floor; plus a rebuild-over-rebuild series saved in a log. Negative control: shuffled prices must show no narrowing trend.

### Method B: partial pooling (multilevel model) so thin categories borrow from parents and narrow as their own data accumulates
- **What:** hierarchical model on log price; posterior for a thin category is wide and shrinks toward its parent, then tightens with its own data. Bambi/PyMC notebook already in references (prediction-verdict, Part 1 item 4).
- **Fit:** matches the design doc model family. **Evidence:** already in references.
- **Pass test:** same learning curve, run on the model's predictive interval.

**Recommendation: Method A (the test) and Method B (the model) together; plan for the floor.**

---

## 4.7 Keep every requirement at 100x data (1.5 million prices) (pass: load test at 100x passes sections 7 and 8)

### Method A (recommended first): stay on SQLite for requests, add DuckDB for nightly analytics, prove it with a 1.5M-row load test
- **What:** SQLite in WAL mode with covering indexes serves point lookups (category, store, item). The nightly rebuild (hierarchy, quantiles, model fit, section 7 scoring) runs in DuckDB attached read-only to the SQLite file, or exports to Parquet.
- **URLs:** https://sqlite.org/whentouse.html ; https://duckdb.org/docs/current/core_extensions/sqlite
- **Evidence:**
  - OPENED (sqlite.org): "Any site that gets fewer than 100K hits/day should work fine with SQLite" (a conservative estimate); one writer at a time per file; database size limit 281 TB. 1.5M rows is well inside this.
  - SNIPPET (blog benchmarks, vendor-adjacent, not independently checked): DuckDB 12-35x faster cold and 8-20x faster warm on aggregations; one 850K-row full-table aggregation 2.90 ms in DuckDB versus 2,722 ms in SQLite; SQLite about 14.7x faster on primary-key point lookups. Direction is credible, magnitudes unverified (https://kdnuggets.com/we-benchmarked-duckdb-sqlite-and-pandas-on-1m-rows).
  - OPENED (DuckDB docs via search): `ATTACH 'file.db' AS x (TYPE sqlite)` reads a SQLite file in place.
- **Fit:** matches the stack (TypeScript server, nightly offline Python allowed). Postgres is not needed until there is more than one writer or more than one server.
- **Cost:** none (both free). **Legal:** none.
- **Pass test:** (1) generate 1.5M rows by resampling real rows with jitter and mixed sources, keeping the real distribution of nulls; (2) run the request path with an HTTP load tool (k6 or autocannon, MEMORY) at the target concurrency and require 8.1 (95% of catalogue answers within 2 s) with `EXPLAIN QUERY PLAN` showing no full scans; (3) run the whole nightly rebuild and require it to finish in a stated time and produce the same section 7 numbers on the real rows as before (see problem 8: resampled rows prove speed, not accuracy). Include an insert-rate test while serving (single-writer behaviour).

### Method B: Postgres (optionally with pg_duckdb) if concurrency or multiple servers appear
- **What:** move the store to Postgres; pg_duckdb 1.0 exists for analytics on a read replica (SNIPPET). URL: https://motherduck.com/blog/pg-duckdb-release/.
- **Fit:** not needed at 1.5M rows; the migration cost is real. **Pass test:** same load test, run against Postgres to compare. Cost: hosting money, which also hits 8.2 (cost model).

### Method C: scale out the nightly step only
- Keep both stores, add Parquet snapshots for the offline model fit. Fit: this is what Open Prices does for outside users (daily JSONL and Parquet dumps, OPENED), so it is a proven pattern.

**Recommendation: Method A.**

---

## 4.8 Record each source's licence; take nothing with no licence (pass: 0 unlicensed sources)

### Method A (recommended first): a source-licence registry the database enforces
- **What:** table `source_licence(source_id, licence_id, url, attribution_text, share_alike, commercial_ok, status, evidence_file, checked_on)`; every observation row references a source, every source must have a registry row, enforced with a foreign key and `NOT NULL`. Use SPDX ids where they exist (ODbL-1.0 does); custom ids for others (Statistics Canada Open Licence has no SPDX id as far as I know, MEMORY). `status` needs the values his decision on problem 1 above settles.
- **Evidence for what the known licences require:**
  - **Open Prices:** ODbL for the database, Database Contents Licence for contents, Creative Commons BY-SA 4.0 for proof images (OPENED, data.gouv.fr dataset page; GitHub data guide says ODbL "requires attribution and prohibits combining with proprietary data you cannot legally release openly", OPENED but paraphrased by the fetch tool). The project's own stance: no web scraping, "no long-term legal risks" (OPENED, FOSDEM 2026 slides). Share-alike risk: a Shin database that publishes derived Open Prices rows must itself be ODbL; keep Open Prices rows in a separate layer and legal-check before publishing (MY REASONING, needs a lawyer).
  - **Statistics Canada Open Licence:** worldwide, royalty-free, commercial use and resale allowed; two required notices (reproduced: "Source: Statistics Canada, [product], [date]. Reproduced and distributed on an 'as is' basis with the permission of Statistics Canada."; adapted: "Adapted from Statistics Canada, ... This does not constitute an endorsement ..."); no logos; may not merge data to identify individuals or businesses (OPENED, https://www.statcan.gc.ca/en/terms-conditions/open-licence).
  - **Project Hammer:** no licence stated on the data page (OPENED). Under 4.8 it cannot be taken until the author states one. The system can draft a request; he sends it (hard rule 2).
  - **Retailer pages:** Walmart terms bar robots/scraping without written consent (SNIPPET, secondary mirror). Canadian law: facts are not copyrightable, but originality needs only "skill and judgment" (CCH v Law Society, SNIPPET), and contract and anti-circumvention claims are used against scrapers in Canada (SNIPPET: Toronto Real Estate Board v Mongohouse, 2019). A single price is a fact; a saved page is a reproduction. Not legal advice.
- **Fit:** a table and one constraint. **Cost:** hours; legal review of the share-alike and Walmart questions is the real cost.
- **Pass test:** `SELECT` finds zero sources without a registry row with a non-null status and evidence file; negative control: insert a source with no licence row and the foreign key must reject it. Run on every build.

### Method B: dataset documentation as metadata (Frictionless `licenses`, Datasheets for Datasets)
- Same information in a portable form (MEMORY, not opened). Only worth adding if Shin publishes data.

### Method C: ask for permission
- Walmart's own terms name the route: "express prior written consent". Flipp and the retailers sell or licence flyers through partnerships (below). A permission email is a message: drafted by the system, sent by him.

**Recommendation: Method A, after his ruling on problem 1.**

---

## Cross-cutting: new Canadian data sources, and how to get them legally

| Source | What it gives | Legal route | Evidence / status | Fit |
|---|---|---|---|---|
| **Statistics Canada table 18-10-0245-01** | Monthly average retail prices for selected products; Canada, province, population centre; Jan 2017 on; last release 2026-09-02 | Statistics Canada Open Licence (attribution strings above) | OPENED: derived from scanner (point-of-sale) data from retailers; expanded to more grocery retailers Jan 2024; specific size or standardised size; not every CPI product; StatCan itself says use the CPI for inflation, not this table. Scanner data in the CPI: "millions of transactions", weekly, since 2015 (OPENED via search) | Free sanity anchor for category level by province; no barcodes and no stores, so it cannot satisfy 4.3 by barcode but can bound 4.2 outlier holding and 4.6 |
| **Open Prices (Open Food Facts)** | crowdsourced shelf and receipt prices with proofs; you already hold 674 CAD prices | ODbL plus CC BY-SA 4.0 for images; no scraping by design | OPENED: 150,000 prices worldwide; 8,000+ a month; daily JSONL/Parquet dumps | Already in; needs the 4.8 share-alike decision; contributing Shin scans back would publish them openly (his call) |
| **Flyer data (Flipp, Reebee)** | weekly flyer prices from about 800 retailers (SNIPPET); Flipp acquired Reebee 2022 (SNIPPET) | No public developer API (SNIPPET: apievangelist listing); Flipp takes retailer feeds by partnership. Legal routes: a licence deal with Flipp (likely paid, UNKNOWN), a licence or permission from each retailer, or hand-saved public flyer pages with the same legal risk as the Walmart PDFs | Flipp ToS on scraping NOT opened | Highest-value unknown; ask Flipp for a research or startup licence (system drafts, he sends) |
| **Receipt scanning by Shin's own users** | real paid prices with store and date, including member and sale prices | The shopper uploads their own receipt with consent (PIPEDA express consent for sensitive data); Open Prices' proof model | Fetch, Checkout 51 and Caddle get receipts by paying users and sell the purchase data to brands (SNIPPET: terms.law Fetch page). Basket's earlier app StockUp paid users in gift cards and banked 10 million prices from 5,000 "citizen price checkers" in year one (SNIPPET, laughingsquid/northernvirginiamag; US, 2014-15) | OCR approach already in references (Robotoff/LayoutLMv3, SROIE, CORD). Incentives cost money; evidence is old and US |
| **Loyalty program purchase history, shopper-initiated** | a person's own item prices at store and date | PIPEDA gives a right of access; Quebec Law 25 gives a right to portable data in a structured format, in force 2024-09-22, 30-day response (OPENED via search, DLA Piper) | The OPC found in March 2026 that Loblaw (PC Optimum) kept purchase history after account deletion and that removing names and emails was not enough anonymisation (OPENED via search, https://www.priv.gc.ca/en/opc-actions-and-decisions/investigations/investigations-into-businesses/2026/pipeda-2026-001/). Whether a loyalty program returns itemised prices in a usable file is UNVERIFIED | Possible later; prices there can be member prices, so store them as their own price kind |
| **Retailer APIs** | one search result says Instacart's API offers store-level pricing for 1,400+ US and Canadian retailers | UNVERIFIED, page not opened; developer terms unknown | SNIPPET from a scraper vendor's marketing page, so low trust | Open question: ask Instacart's developer programme whether Canadian price data may be stored |
| **Commercial scrapers on Apify (Loblaws, No Frills, Save-On-Foods, Sobeys, T&T)** | normalised prices and unit prices | Not a licence: the vendor's scraping does not transfer rights from the retailer | SNIPPET listings | Do not count as licensed under 4.8 |
| **Project Hammer** | daily Canadian grocery prices since 2024-02-28, 8 retailers, CSV and SQLite | no licence stated (OPENED) | OPENED | Ask the author for a licence |

Methods that let a shopper-supplied or partner feed pass 4.1 with no change outside its reader: Method A of 4.1.

---

# Section 5. Customer data

## 5.1 Record every scan with all fields; photo and area only with consent (pass: every field stored for 100 test scans)

### Method A (recommended first): append-only scan-event table with a client-generated id, offline-safe, consent columns on the row
- **What:** one table `scan_event`: `client_event_id` (UUIDv7, unique, lets an offline phone retry without duplicates), item reference (barcode or typed name), typed shelf price, store, `scanned_at` (device) and `received_at` (server), the shopper's own call (good/bad/great), picks, corrections, `consent_photo`, `consent_area` stored with the consent text version and time, `photo_ref` and `area_code` that are NULL unless the matching consent is true. Photos go to a file store keyed by sha256. Never updated: a correction is a new event.
- **URL:** shape follows Open Prices (a price plus a separate proof record, OPENED) and GasBuddy (every submitted price is displayed tagged with the user's id; users earn points for activity; OPENED, EIA paper). Scale of a shipped crowd product: GasBuddy gets 2-3 million price data points a day across the US and Canada (SNIPPET, Harvard D3 page).
- **Fit:** a single SQLite table is enough; at 100 scans per day it is trivial.
- **Cost:** none. **Legal:** this is personal information: PIPEDA purpose limitation, retention (see 5.6).
- **Pass test:** drive 100 scripted scans through the real HTTP API (varied consent states, offline replays of 10 of them to test idempotency). Assert each column per scan; consent-off scans have NULL photo and area; replay produces no duplicate. Property-based test (fast-check, MEMORY) over random field combinations. Negative control: a client that omits the shopper's call must fail validation.

### Method B: a product-analytics event pipeline (PostHog self-hosted or Snowplow self-describing events)
- Gives dashboards for free but ships a second system and a second copy of personal data; consent handling per event is the same work. URLs: https://posthog.com , https://snowplow.io (MEMORY, not opened). Fit: overbuilt now.

**Recommendation: Method A.**

---

## 5.2 Turn a typed shelf price into an observed price marked as a shopper report (pass: 100% of typed prices stored that way)

### Method A (recommended first): an `origin` field plus a typed-price parser, set only by the server
- **What:** each observation carries `origin` in {store_page, flyer, receipt, shopper_report, ...} set by the server from the authentication context, never by the client. Parser normalises "4.99", "$4.99", "2/$5", "99c", "per kg", "was 6.29 now 4.99" to price, multi-buy count, unit and sale flag. Evidence strength as a separate field: typed only (low), typed plus photo that reads the same (high), per design doc section 7.
- **Evidence:** GasBuddy marks station-submitted prices "GB_Direct" and shows user prices tagged by user id (OPENED, EIA paper). Open Prices ties every price to a proof of a given type (OPENED).
- **Fit:** trivial. **Cost:** none. **Legal:** none beyond 5.1.
- **Pass test:** 100 test scans with typed prices in 10 formats; assert 100 observation rows with `origin = 'shopper_report'`; attempt a client request that sets `origin = 'store_page'` and require rejection. Negative control: a trigger removed makes the second check fail.

### Method B: photo cross-check by OCR (Robotoff-style) to raise confidence
- Design doc already says a photographed tag matching the typed price is high weight. References: Robotoff (OCR via Google Cloud Vision, confidence threshold, moderation for low confidence) in the capture file. Evidence number: none in references. Pass test: 50 tag photos with hand-read answers; report the share where OCR matches typed, with the hand-read key checked for errors (7.7).

**Recommendation: Method A now; B later.**

---

## 5.3 Count a shopper report in a range only once an independent source agrees for that store and week (pass: 0 lone reports in any range)

### Method A (recommended first): corroboration gate in the range query
- **What:** a report becomes `corroborated` only when a row from an independent source (different source id; not derived from the same upstream; for shoppers, a different account above a trust floor, see problem 2) agrees within a tolerance (design doc: "within a few percent"; the exact number is a proposal, unverified) at the same store in the same ISO week (or a rolling 7-day window, to avoid the Sunday/Monday cliff). Range code reads only `corroborated` or non-shopper rows.
- **Evidence:** copying changes the answer: removing copied sources lifts flight precision from 0.864 to 0.927 (OPENED, Li et al. 2013), so "independent" must exclude copies. Weighting by exposure reduced variance 125-fold in the Nigeria food-price study (already in references). Truth-inference evidence that a single answer is weak: accuracy about 65-68% with 1 answer per task rising to about 94-96% with 20 (already in references, Zheng et al.).
- **Fit:** a view plus one rule; no new infrastructure.
- **Cost:** none. **Legal:** none.
- **Pass test:** property test over random mixtures of sources and reports: for every range produced, the set of contributing rows contains no row with status `lone_report`. Cases that must pass: a lone extreme report moves nothing; a corroborated report moves the range; a report one week off does not corroborate. Negative control: disable the gate and see the lone report move the range.

### Method B: probabilistic combination on top (CRH-style weights, section 4.3 Method B)
- A lone report enters with a small weight rather than zero. This violates "0 lone reports", so use only for the shopper-facing "one report" display, not for ranges. Evidence as in 4.3.

**Recommendation: Method A.**

---

## 5.4 Count one shopper once per item, store and week (pass: 15 fake accounts cannot move a range)

### Method A (recommended first): uniqueness constraint plus corroboration plus influence cap
- **What:** `UNIQUE(account, item, store, iso_week)` with upsert; a report from an account counts at most once. Because Sybil accounts defeat per-account limits, also cap the total weight unverified or young accounts can contribute to one store-item-week, and require the 5.3 corroboration with the independence fix in problem 2.
- **Evidence for the threat:** 15 bot accounts faked a persistent traffic jam on Waze, with no identity checks and with anti-detection turned off making no difference (already in references; paper at https://nimrodpar.github.io/assets/publications/waze.pdf). Douceur (2002): without a logically centralised authority certifying identities, Sybil attacks are always possible except under unrealistic assumptions (OPENED via search, https://www.microsoft.com/en-us/research/publication/the-sybil-attack/). So the defence is cost raising and weight limiting, never "prevention".
- **Fit:** the constraint is trivial; the cap is a few lines.
- **Cost:** none. **Legal:** none.
- **Pass test:** the already-built 15-account test, extended three ways: (1) 15 accounts reporting 3x the real price at the same store and week; (2) the same 15 corroborating each other; (3) 150 accounts. Assert the range is byte-identical before and after, for items with honest data and for items with none (where the range must not appear at all from fakes). Negative control: remove the cap and the corroboration and show the range moves.

### Method B: raise the cost of an account (identity binding, device attestation, rate limits)
- **What:** sign in with Apple or Google, or phone verification (the Waze paper's authors recommend carrier or phone verification as the most effective simple mitigation, already in references); Apple App Attest and Google Play Integrity return tokens that the server must verify (OPENED via search: the value comes from server-side signature and replay checks); per-account and per-device token-bucket rate limits on the report endpoint. GasBuddy uses geolocation: a user must be near the station to submit (SNIPPET, search summary).
- **URLs:** https://expo.dev/blog/expo-app-integrity.md (SNIPPET); Apple and Google official docs MEMORY, not opened.
- **Fit:** App Attest and Play Integrity matter once there is a native or Expo app; rate limiting in the TypeScript server is cheap. **Cost:** low; some friction for honest users.
- **Legal:** phone numbers and device ids are personal information; collect only if used (5.6).
- **Pass test:** burst test: 100 reports per minute from one account, one device and one IP must be throttled to the stated limit (HTTP 429); a second account on the same device must share the device bucket.

### Method C: reward-incentive risk check
- If rewards are ever paid (StockUp did gift cards, SNIPPET), payouts raise the incentive to cheat; GasBuddy uses points for activity (OPENED, EIA paper) and reputation by activity is what the Waze attack farmed. Do not pay per report; pay on corroborated reports only. MY REASONING.

**Recommendation: Method A, then Method B's rate limits.**

---

## 5.5 Weight each shopper by how well past reports checked out (pass: weight differs measurably between accurate and inaccurate test accounts)

### Method A (recommended first): Beta reputation scored against later independent prices
- **What:** for each shopper, count reports that later agreed with an independent or verified price (r) and ones that did not (s); weight = (r + 1) / (r + s + 2) with an ageing factor so old results count less; new accounts start at 0.5 or lower, capped. Score only against external prices, never by activity.
- **URL:** Jøsang and Ismail, "The Beta Reputation System", Bled 2002, https://mn.uio.no/ifi/english/people/aca/josang/publications/ji2002-bled.pdf
- **Evidence:** OPENED (via search): beta density combines positive and negative feedback, with a forgetting parameter; simple and statistically grounded. No grocery number. Lesson from Waze: reputation farmed by simulated activity makes the weight meaningless (already in references), so weights must come from accuracy against outside truth.
- **Fit:** 20 lines. **Cost:** none. **Legal:** profiling a person's reliability is personal information use; disclose in the privacy notice (MY REASONING).
- **Pass test:** create 10 accurate test accounts (noise about 2%) and 10 inaccurate (about 25%), 30 reports each against known prices; require the weight distributions to separate (for example AUC of 0.9 or more, or Mann-Whitney p below 0.01; the threshold is a proposal). Negative control: accounts with random accuracy must not separate.

### Method B: CRH-style iterative weights (the same loss-based weights as 4.3)
- weight = minus log of the account's share of total loss, re-estimated each rebuild. Evidence: see 4.3 Method B (CRH error 33-38% below the median on stock and flight data, OPENED). Fit: reuse of the same code as 4.3, so one implementation covers sources and shoppers. Pass test: the same 10-versus-10 test.

**Recommendation: Method A first (interpretable, one number per person); share code with 4.3.**

---

## 5.6 Consent off by default; coarse area only; never exact GPS (pass: 0 exact positions stored)

### Method A (recommended first): consent defaults and an area that is coarse by construction
- **What:** (1) Every consent flag defaults to false, recorded with text version and time, per purpose (photo, area), revocable. (2) The phone asks only for approximate location (iOS reducedAccuracy, reported as 1-20 km, SNIPPET; Android coarse permission, MEMORY), and the server accepts only a code from a fixed list: the forward sortation area (first 3 characters of the postal code, for example L6A), or a geohash of length 5 (a cell of roughly 5 km, MEMORY; the Wikipedia table I opened gives only coarser and finer lengths), never raw latitude and longitude. The API schema rejects lat/lon fields so they cannot reach logs. (3) Letting the shopper pick the store from a list replaces GPS for the common case.
- **Evidence (Canadian law and regulators):**
  - The OPC says express consent is the default and sensitive data, including persistent granular location, attracts a higher standard (SNIPPET: BLG, Fasken, McMillan summaries of the 2018 meaningful consent guidelines, https://www.blg.com/en/insights/2022/06/key-takeaways-for-businesses-when-using-location-tracking-technologies).
  - Tim Hortons app (joint OPC/provincial finding, 2022): it collected precise coordinates even when the app was closed, about ten points per user a day across 1.6 million active users; the commissioners found consent invalid and the practice unlawful (OPENED, BLG summary). Directly in Shin's lane: an app, groceries, location.
  - Joint guidance for app developers: https://www.priv.gc.ca/en/privacy-topics/ai-technology-and-innovation/mobile-and-digital-devices/mobile-apps/gd_app_201210/ (OPENED via search; contents not read in full).
  - Retention and anonymisation: PIPEDA principle 4.5.3 (destroy or anonymise when no longer required) and the March 2026 PC Optimum finding that deleting names and emails was not sufficient anonymisation (OPENED via search).
- **Evidence (limits):** coarse place plus time still identifies: de Montjoye et al. (OPENED via search) 95% unique from four points; see problem 3.
- **Fit:** easy to build; the hard part is the store-trail question in problem 3. **Cost:** none. **Legal:** this is the legal core; not legal advice, and the Quebec Law 25 default (privacy by default settings) is MEMORY, not opened.
- **Pass test:** fresh install must send nothing with consent off; schema scan finds no lat/lon-typed columns; fuzz every endpoint with lat/lon fields and require rejection and absence from the access logs; every `area_code` value is in the allowed list; count of rows with exact coordinates is 0. Negative control: insert one exact coordinate row and the scan must find it. Include IP-derived location in the check (the server must not store raw IPs beyond what rate limiting needs).

### Method B: privacy-impact assessment before launch
- Recommended by the commissioners in the Tim Hortons finding (OPENED, BLG summary). Template: OPC PIA guidance (MEMORY, not opened). Cost: a day. Pass test: the written PIA exists and names the store-plus-time trail decision.

**Recommendation: Method A, plus the decision on problem 3.**

---

## 5.7 Turn an unknown barcode or unmatched name into a pending catalogue item (pass: 100% stored)

### Method A (recommended first): pending-item table with the raw string kept, identity link added later
- **What:** table `catalogue_pending(id, raw_code, gtin14 (nullable), check_digit_ok, typed_name, first_seen, sightings, evidence_refs, status)` with status pending, enriched, merged or rejected. A scan with no catalogue match always writes an event (5.1) and a pending row or a sighting increment; invalid check digits are stored with `check_digit_ok = 0` and not dropped. Normalise UPC-A and EAN-13 to one GTIN form (already in references) so a duplicate does not become two items. Enrichment by lookup in Open Food Facts (ODbL; 4M products, OPENED via FOSDEM slides) and Icecat (already in the design doc) fills the item later; a later matcher adds the identity link (Splink or dedupe, already in references).
- **Evidence:** the three-layer principle in the design doc ("identity is a link added later, never a gate at intake"). Open Prices accepts submissions for products with a barcode and a proof; how it treats an unknown product page is UNVERIFIED (not opened).
- **Fit:** one table and one rule. **Cost:** none. **Legal:** product facts are low risk; photos from shoppers are personal data (5.1 consent).
- **Pass test:** replay 100 unknown barcodes (including 10 with bad check digits, 10 repeats, 10 UPC-A/EAN-13 pairs of the same product) and 20 typed names: assert 100% have a pending row or sighting, repeats increment sightings and add no new item, and rows in equals rows stored. Negative control: an unknown code with the table dropped must fail loudly, not silently continue.

### Method B: moderation queue with confidence threshold (Robotoff pattern)
- Auto-accept enrichment above a confidence threshold, human review below (already in references: Robotoff insights auto-applied or sent to moderation). Evidence number: none in references. Fit: later, when volume justifies it.

**Recommendation: Method A.**

---

## 5.8 Measure how often shoppers' own calls agree with Shin's verdict (pass: reported each rebuild)

### Method A (recommended first): agreement table with weighted kappa, exact and within-one rates, bootstrap intervals
- **What:** each rebuild computes, over scans with both a shopper call and a verdict: percent exact agreement, percent within one level (great, good, reasonable, bad ordered), quadratic-weighted Cohen's kappa (agreement beyond chance, ordinal-aware), the confusion matrix, and a bootstrap 95% interval. Report also the direction of disagreement (does Shin say good when shoppers say bad).
- **URLs:** `sklearn.metrics.cohen_kappa_score(..., weights='quadratic')` https://scikit-learn.org/stable/modules/generated/sklearn.metrics.cohen_kappa_score.html (MEMORY, not opened). Krippendorff's alpha when several shoppers rate the same scan.
- **Evidence:** standard method for agreement between two raters on an ordinal scale; no grocery-specific benchmark found. Interpretation bands (Landis and Koch 1977) are MEMORY and conventional, not law.
- **Fit:** an offline Python script in the nightly job. **Cost:** none. **Legal:** aggregate numbers only, no personal data.
- **Pass test:** the rebuild log contains the table with n, kappa, intervals. Negative control: shuffle shoppers' calls and kappa must fall to about 0; feed Shin's own verdict back as the shopper call and kappa must be 1. Fix anchoring (problem 4) first or the number is meaningless.

### Method B: Dawid-Skene on shoppers' calls to separate shopper noise from Shin error
- Treats each shopper as an annotator with a confusion matrix and estimates a latent "true" verdict; Crowd-Kit has it (OPENED via search, https://github.com/Toloka/crowd-kit). Zheng et al. recommend Dawid-Skene when answers per item are sparse (already in references). Fit: useful once many shoppers rate overlapping scans, which Shin lacks for months. Pass test: simulated shoppers with known confusion matrices; recovered matrices within a stated error.

**Recommendation: Method A.**

---

# Recommended first method, one line each

- 4.1: canonical observation record plus one adapter per source, tested with a toy source.
- 4.2: database-enforced append-only layers with a batch ledger; modified z-score (3.5) outlier flag, never a drop.
- 4.3: measured agreement against barcode-verified prices, shrunk toward the guess; CRH only where no verified overlap exists.
- 4.4: per-source capability declaration plus per-source null-rate test.
- 4.5: exponential decay with a 730-day hard cutoff, tested with synthetic aged rows.
- 4.6: held-out learning-curve test with a stated floor.
- 4.7: SQLite for requests, DuckDB attached for the nightly rebuild, 1.5M-row load test.
- 4.8: a source-licence registry enforced by foreign key, after his ruling on the unlicensed current sources.
- 5.1: append-only scan-event table with client ids and consent columns.
- 5.2: server-set `origin = shopper_report` plus a typed-price parser.
- 5.3: corroboration gate in the range query.
- 5.4: uniqueness constraint plus corroboration plus an influence cap, tested with fakes that agree with each other.
- 5.5: Beta reputation scored against later independent prices.
- 5.6: consent defaults off, area accepted only from a fixed coarse list, lat/lon rejected at the API.
- 5.7: pending-item table keeping the raw code, identity added later.
- 5.8: quadratic-weighted kappa with exact and within-one rates, shopper call logged before verdict reveal.

# Not opened or unverified (do not rely on without checking)

Flipp terms of use; Walmart Canada's own terms (only a walmart.com mirror seen); Instacart Canadian price API; whether any loyalty program returns itemised prices; Apple/Google attestation docs; GasBuddy's own help pages (blocked in the earlier session); PIA templates; the OPC 2018 consent guidelines text itself; Quebec Law 25 privacy-by-default wording; geohash length-5 cell size; Landis-Koch bands; fast-check, k6, autocannon, Great Expectations details; DuckDB-versus-SQLite benchmark magnitudes (blog-level); Open Prices handling of unknown barcodes; StockUp and Fetch figures (search snippets). The Open Prices dataset page does not state a total price count; the 150,000 figure is from the FOSDEM 2026 slides (OPENED) and is a world total, not Canada.
