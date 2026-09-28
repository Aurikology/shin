# Reference research for Shin: capture, matching, storage, crowdsourced trust

Rules of evidence applied: every item below was opened this session (WebSearch to find it, then WebFetch or, when WebFetch returned only a binary/JS-shell page, a direct Read of the fetched file) before being listed. Items I could not open are listed separately as "not opened" per stage.

---

## Stage 1: Capturing prices from web pages, PDFs, screenshots

### 1. Open Prices (Open Food Facts)
- URL: https://prices.openfoodfacts.org/about , https://github.com/openfoodfacts/open-prices
- What it is: a live, public crowdsourced price database run by Open Food Facts. Contributors submit "proofs" (receipt photos, shelf/price-tag photos, or web page screenshots), which get OCR/AI-assisted parsing to pull out product + price; there's a REST API and a wiki-documented schema (proof, price, location, product).
- Take for Shin: this is the closest existing analog to Shin's whole capture stage (photos of shelf tags, plus web/receipt proofs) tied into a food product catalogue. Worth reading `docs/guides/data.md` in that repo before designing Shin's own price/proof schema, since it will have already hit the edge cases (multiple prices per proof, discount flags, unit price vs total price).
- Stated accuracy: none found on the pages opened. The about/homepage and the open-prices GitHub README describe capture and API but give no OCR or matching accuracy numbers.

### 2. Robotoff (Open Food Facts)
- URL: https://openfoodfacts.github.io/robotoff/introduction/architecture/ , https://github.com/openfoodfacts/robotoff
- What it is: the ML/prediction backend behind Open Food Facts' contributor pipeline. Every uploaded image is OCR'd via Google Cloud Vision; Robotoff then runs pattern matching plus CV models (logo detection via CLIP embeddings + k-NN, Nutri-Score detection, a LayoutLMv3-based nutrition-table token classifier) over the OCR text/image to produce "insights" that are either auto-applied (high confidence) or sent to human moderation.
- Take for Shin: directly reusable pattern for stage 1 (turning a photo into structured fields) and stage 4 (insights below a confidence threshold go to moderation, not straight into the database). LayoutLMv3-for-token-classification is the concrete architecture to borrow for reading a price tag or receipt line into (product name, size, price) fields.
- Stated accuracy: none on the pages opened (architecture page explicitly has no benchmark numbers).

### 3. SROIE (ICDAR 2019 Scanned Receipt OCR and Information Extraction)
- URL: https://arxiv.org/abs/2103.10213
- What it is: the standard receipt-OCR benchmark/competition: 1,000 scanned receipts, three tasks (text localization, OCR, key-info extraction of company/date/address/total).
- Take for Shin: use as the benchmark task definition when evaluating any receipt-OCR component (e.g., if shoppers upload receipt photos). Note it only extracts *whole-receipt* totals/fields, not per-line-item prices, so it's a partial fit for line-item price capture.
- Stated accuracy: abstract confirms the competition reports "performance of submitted methods" but the specific F1/accuracy numbers were not visible in the portion fetched.

### 4. CORD (Consolidated Receipt Dataset for Post-OCR Parsing)
- URL: https://github.com/clovaai/cord
- What it is: ~11,000 Indonesian receipts (1,000 published: 800/100/100 train/dev/test), with OCR + multi-level semantic labels (line items, quantities, prices, discounts, subtotal/total): unlike SROIE, it labels individual menu/line-item prices.
- Take for Shin: the better dataset if Shin ever needs to parse itemized receipts (price per line, not just receipt total): closer to what "receipt → per-product price" capture needs.
- Stated accuracy: not present in the README fetched; benchmark numbers live in the paper, not the repo page.

### 5. SKU-110K
- URL: https://github.com/eg4000/SKU110K_CVPR19 (paper: arxiv 1904.00853, "Precise Detection in Densely Packed Scenes")
- What it is: ~11,700 shelf photos, 1.7M+ bounding boxes, one generic "product" class, built for detecting densely packed retail-shelf items (not classifying them).
- Take for Shin: relevant only if Shin's phone-camera flow needs to first *locate* individual products/price tags on a shelf photo before reading them: this is the standard box-detection benchmark for that sub-problem, distinct from the OCR/reading step.
- Stated accuracy: page states the method achieves "far fewer misdetections and better fitting bounding boxes" than RetinaNet but no AP number was visible on the fetched page.

### 6. Unstructured (Unstructured-IO)
- URL: https://github.com/Unstructured-IO/unstructured
- What it is: open-source Python ETL library that parses 60+ document formats (PDF, HTML, images, scanned docs) into structured elements, with a `hi_res` layout-detection + OCR strategy specifically for extracting tables from PDFs.
- Take for Shin: the practical tool for the "saved browser printouts (PDFs)" capture path: turning a printed retailer category page into structured rows (product name / price cells) before the barcode-matching step.
- Stated accuracy: none stated on the page opened.

### 7. Instacart PARSE (Product Attribute Recognition System for E-commerce)
- URL: https://company.instacart.com/tech-innovation/scaling-catalog-attribute-extraction-with-multi-modal-llms
- What it is: Instacart's in-house self-serve platform for extracting catalogue attributes from product text + images using multi-modal LLMs, replacing hand-built per-attribute pipelines.
- Take for Shin: a company actually doing "read a product image/listing and extract structured attributes" at grocery scale, with a directly comparable engineering shape to Shin's screenshot/listing-extraction problem.
- Stated accuracy: **yes, concrete numbers**: multi-modal LLMs "increased recall by 10% over text-only models" on the attributes tested; simple attributes (e.g., "organic") hit "95% accuracy" with ~1 day of setup vs ~1 week the old way; cheaper/smaller LLMs gave a "70% cost reduction" but showed a "60% accuracy drop" on harder attributes.

### 8. Flipp flyer parser
- URL: https://github.com/FriendlyUser/flipp_flyer_parser
- What it is: a Selenium-based scraper that extracts promo price, savings, valid-dates, product description, size/quantity and store code directly from Flipp's flyer iframe for Canadian grocers (Loblaws, Superstore named specifically), writing into a Postgres schema with per-store uniqueness constraints.
- Take for Shin: a working, narrow example of exactly one of Shin's listed sources (flyers) already solved for the Canadian market: worth reading before writing a Flipp scraper from scratch, and its Postgres schema (store code + validity window + uniqueness constraint) is a usable starting point for stage 3's schema.
- Stated accuracy: none stated.

**Not opened (stage 1):** Trax Retail's shelf/price-tag recognition (traxretail.com blog pages and its patents describe the product but I did not fetch a page with methodology or accuracy: patent PDFs were found via search only, not opened). GPT-4V/VLM OCR benchmarks (MM-Vet, OCRBench) were found via search snippets only; I did not WebFetch the benchmark leaderboard pages themselves this session, so they are not listed as items despite being clearly relevant.

---

## Stage 2: Product matching / entity resolution without a shared ID

### 1. Splink
- URL: https://github.com/moj-analytical-services/splink
- What it is: UK Ministry of Justice's Python library for probabilistic record linkage using the Fellegi-Sunter model with EM parameter estimation; runs on DuckDB, Spark, or Postgres; unsupervised (no labeled training pairs required).
- Take for Shin: strong candidate for the "propose candidates from title text" matcher: unlike a single hand-tuned string-similarity score, Splink learns per-field match weights (brand, size token, pack count) via EM, and is specifically built for "datasets that lack unique identifiers," which is Shin's exact situation when a store page has no barcode.
- Stated accuracy: no F1/precision numbers, but a concrete performance claim: "capable of linking a million records on a laptop in around a minute," scaling to 100M+ records on Spark.

### 2. Dedupe (dedupeio)
- URL: https://github.com/dedupeio/dedupe
- What it is: Python library for fuzzy matching / entity resolution using active learning (you label a small number of pairs, it learns blocking + similarity rules), based on Bilenko's dissertation on learnable similarity functions.
- Take for Shin: lighter-weight alternative to Splink when there's a labeling budget (a human confirms candidate pairs); good fit for bootstrapping training data for the barcode matcher from a small hand-checked sample.
- Stated accuracy: none stated on the page opened.

### 3. Ditto (Megagon Labs)
- URL: https://github.com/megagonlabs/ditto/blob/master/README.md (paper: "Deep Entity Matching with Pre-Trained Language Models," VLDB 2020)
- What it is: BERT-fine-tuning based entity matcher: serializes each record pair into a tagged text sequence (`COL title VAL ... COL manufacturer VAL ...`) and does sequence-pair classification, with domain-knowledge span-tagging and data augmentation (MixDA: token/attribute deletion, shuffling) to boost quality on hard pairs.
- Take for Shin: the reference architecture if a learned matcher (rather than rule/EM-based Splink/Dedupe) is wanted, and it was evaluated on exactly the type of size/variant-confusable product pairs Shin cares about (its ER_Magellan benchmark suite and the WDC product benchmark both stress this).
- Stated accuracy: paper claims "up to 29% F1 improvement" over prior SOTA on benchmark datasets, but that specific number was in the paper, not confirmed on the README page fetched (README says evaluation used ER_Magellan and WDC benchmarks without repeating the F1 figures).

### 4. WDC Products benchmark
- URL: https://arxiv.org/abs/2301.09521 ("WDC Products: A Multi-Dimensional Entity Matching Benchmark")
- What it is: a benchmark built from the Web Data Commons product corpus specifically to vary three difficulty axes: amount of "corner-case" pairs, generalization to unseen entities, and training-set size; tested Ditto, HierGAT and R-SupCon as baselines.
- Take for Shin: the closest published benchmark to Shin's stated failure mode ("wrong size or variant of the right brand," i.e. corner-case pairs), and its finding that "all matching systems struggle with unseen entities to varying degrees" is a direct warning for a catalogue as broad as Shin's 4.3M rows: a matcher tuned on seen brands will likely degrade on new/unseen ones.
- Stated accuracy: abstract confirms the corner-case/unseen-entity framing; specific F1 numbers were in the PDF body, which did not render as readable text through WebFetch this session, so no number is quoted.

### 5. Leipzig database group's Abt-Buy / Amazon-Google benchmarks
- URL: https://dbs.uni-leipzig.de/en/research/projects/object_matching/benchmark_datasets_for_entity_resolution
- What it is: the original, still-widely-used entity-resolution benchmarks: Abt-Buy (1,081 vs 1,092 entities, 1,097 matches; fields: name/description/price) and Amazon-GoogleProducts (1,363 vs 3,226 entities, 1,300 matches; fields: name/description/manufacturer/price), both from a VLDB 2010 study, with ground-truth "perfect mapping" files.
- Take for Shin: the standard sanity-check datasets to run any candidate matcher (Splink/Dedupe/Ditto) against before trusting it on Shin's real catalogue, since they're small, well-understood, and explicitly noted in the source as "not sufficiently solved with conventional approaches": i.e., a documented difficulty floor.
- Stated accuracy: none stated on this page (it hosts the datasets and ground truth, not benchmark scores).

### 6. quantulum3
- URL: https://github.com/nielstron/quantulum3
- What it is: Python library extracting quantities/measurements/units from free text (290+ units, 75 entities), disambiguating similar-looking units via GloVe-vector k-NN plus Wikipedia context.
- Take for Shin: directly usable for the "size/unit parsing" sub-problem (500 mL vs 500 g vs 500 mL x 6-pack) that the task calls out as the main driver of match failures: run it on both the store listing title and the catalogue product name/size field, then require unit+quantity agreement as a hard filter before accepting a text-matched candidate.
- Stated accuracy: none stated on the page opened.

**Not opened (stage 2):** Zingg and Ditto's actual VLDB paper (PDF, not fetched as readable text). The WDC Products benchmark's own quoted F1 numbers (PDF rendering failed via WebFetch).

---

## Stage 3: Storing raw and derived price data

### 1. Project Hammer
- URL: https://jacobfilipp.com/hammer/
- What it is: a running, public Canadian grocery price-tracking project (8 retailers: Voila, T&T, Loblaws, No Frills, Metro, Galleria, Walmart, Save-On-Foods; scraping since Feb 2024) that publishes both CSV (separate `product` metadata table + `raw` time-series price table) and a SQLite database.
- Take for Shin: the single most directly relevant existing artifact: same country, same retailers, same problem (in-store pickup pricing), and it documents its own known failure modes explicitly: daily-changing product IDs (use SKU/UPC instead for cross-day identity), duplicate same-day product rows, and inconsistent brand/name matching specifically at Save-On-Foods. This is a ready-made list of pitfalls to design around, and the product/raw table split is a usable schema pattern (immutable raw observations vs a normalized product dimension).
- Stated accuracy: no formal accuracy metric, but it explicitly documents known data-quality issues (see above) rather than claiming clean data: itself a useful modeling choice (label bad rows instead of silently dropping them).

### 2. Keepa API
- URL: https://keepa.com/api-docs/
- What it is: commercial Amazon price-history tracking API; stores "complete price histories" per ASIN across price types (Amazon, third-party new, third-party used) plus sales rank, using a compact "Keepa time" (minutes since Jan 1, 2011) encoding for timestamps.
- Take for Shin: a proof that a compact epoch-minute timestamp encoding is a viable way to store dense price-history time series without bloating storage; also a model for splitting "price type" as its own dimension (their Amazon/3rd-party-new/3rd-party-used split maps onto Shin's regular/sale/clearance split).
- Stated accuracy: none found: the API overview page didn't expose the underlying Product Object schema in the content fetched.

### 3. schema.org PriceSpecification / Offer
- URL: https://schema.org/PriceSpecification
- What it is: the web-standard vocabulary retailers already embed in their page markup for prices: `PriceSpecification` (price, priceCurrency, minPrice/maxPrice, validFrom/validThrough) and its subtype `UnitPriceSpecification` with a `priceType` property (e.g., `MaximumRetailPrice` vs sale price) used to represent list price alongside sale price on the same offer.
- Take for Shin: this is often already sitting in the HTML of the retailer pages Shin scrapes: checking for `schema.org/Offer` structured data before building a custom scraper for a given retailer could shortcut a lot of stage-1 work, and its regular-vs-sale-price pattern (`priceType: StrikethroughPrice` etc.) is a ready vocabulary for Shin's own sale-flag field.
- Stated accuracy: not applicable (it's a data vocabulary, not a measured system).

### 4. GTIN standard (GS1)
- URL: https://en.wikipedia.org/wiki/Global_Trade_Item_Number
- What it is: the barcode-number standard itself: GTIN-8/12/13/14 formats, each mapping to a specific barcode symbology (EAN-8, UPC-A/UPC-E, EAN-13, ITF-14/GS1-128), built from a GS1 company prefix + item reference + check digit, and it subsumes ISBN/ISSN/ISMN as special cases.
- Take for Shin: the identifier Shin's whole catalogue join depends on: worth knowing that GTIN-12 (UPC-A) and GTIN-13 (EAN-13) are just zero-padded/leading-digit variants of the same number space, so a naive string-equality barcode join will silently miss matches unless both sides are normalized to one canonical GTIN-14-style representation first (a likely, easy-to-miss bug source).
- Stated accuracy: not applicable (identifier standard, not a measured system).

**Not opened (stage 3):** CamelCamelCamel's actual data model (only its user-facing "how to use" pages were found via search; I did not WebFetch a page describing its storage internals, so it's omitted as an item despite being a well-known price tracker).

---

## Stage 4: Crowdsourced price data and trust

### 1. Robinson-Arbia et al., "Post-sampling crowdsourced data to allow reliable statistical inference: the case of food price indices in Nigeria" (also published as Arbia, Solano-Hermosilla, Micale, Nardelli, Genovese, JRC/EU Commission working paper; Scientific Data version DOI 10.1038/s41597-023-02211-1)
- URL: https://arxiv.org/pdf/2003.12542 (working-paper version; opened and read directly since WebFetch's HTML conversion failed on this PDF)
- What it is: a two-phase statistical method for validating crowdsourced food-price reports: (1) pre-processing: flag "spatial outliers," defined as a price that exceeds *r* standard deviations from the average of its geographic neighbours (neighbours found via geocoding/Google Maps distance), and replace flagged values with the neighbourhood average; (2) post-sampling: reweight the (non-probability) crowdsourced sample against a formal spatial sampling design (Local Pivotal Method 2) using a per-location "post-sampling ratio" as a weight, so overrepresented locations get downweighted and underrepresented ones upweighted.
- Take for Shin: directly transferable to weighting/deduplicating shopper-submitted shelf prices by store/region density before trusting an aggregate: e.g., don't let one over-eager reporter at one store distort the "market price" for a product. It also validates the general approach with numbers, not just theory.
- Stated accuracy: **yes**: simulation (1,000 replications) shows all three estimators (simple, stratified-reweighted, LPM2-reweighted) have "very small absolute relative bias" (average 0.005), but the two reweighting strategies produce a variance "125 and, respectively, 124 times smaller" than the naive crowdsourced-as-is estimate. On real data (Guinea Corn prices, Kaduna State, Nigeria, AMIS-FAO 2016-17), the post-sampling correction moved the average price from 211.61 to 221.01, a 4.4% correction versus the naive uncorrected average.

### 2. Ben Sinai, Partush, Yadid, Yahav, "Exploiting Social Navigation" (Technion, on Waze)
- URL: https://nimrodpar.github.io/assets/publications/waze.pdf (opened and read directly; WebFetch's text conversion failed but the underlying PDF was fetched and readable)
- What it is: a Sybil-attack paper against Waze's crowdsourced trust/reputation system. Key findings: Waze's registration has no identity validation; bot accounts can farm "reputation" points automatically by simulating driving; as few as **15** bot drivers, with a specific speed-ramp pattern (70 kph -> stepping down to 8 -> 2 kph with staged stops), successfully faked a persistent traffic jam and changed real users' routes; disabling anti-detection measures (randomized spawn timing, varied per-bot movement) made no difference: "WAZE makes no observable effort to differentiate human from machine behavior."
- Take for Shin: a concrete cautionary data point for stage 4: a large, mature crowdsourced platform's reputation system was trivially game-able with no identity binding. If Shin ever weights shopper price reports by a reputation/point score, this paper is evidence that reputation alone (without an external anchor like carrier/phone verification, which the authors recommend as the most effective and simplest mitigation) is not sufficient to resist coordinated fake reports.
- Stated accuracy: not an accuracy claim in the traditional sense, but a concrete attack-cost number: only 15 bot accounts, run from a single 16-core machine, were sufficient to fake a traffic jam and alter routing.

### 3. Zheng, Li, Li, Shan, Cheng, "Truth Inference in Crowdsourcing: Is the Problem Solved?" (VLDB 2017)
- URL: https://dbgroup.cs.tsinghua.edu.cn/ligl/papers/yudian_truth_infer.pdf (WebFetch's text conversion failed on the PDF binary; the file was then read directly via the Read tool, which rendered the slide-deck-style paper content: same authors/venue as the canonical VLDB survey)
- What it is: a systematic comparison of 17 truth-inference algorithms (including the classic Dawid-Skene 1979 model, majority voting, GLAD, Minimax, BCC, CATD, and others) across task types (decision/single-choice/numeric), worker models (a single probability, a confusion matrix, or bias+variance), and objective functions (probabilistic graphical model vs. direct optimization), tested on 3 real datasets including one literally called "Product" (8,315 product-pair matching tasks, 3 answers/task, 85 workers: a crowdsourced entity-matching dataset).
- Take for Shin: gives a concrete decision rule rather than "use Dawid-Skene": their recommendation is **majority voting once you have >20 answers per task**, but **Dawid-Skene specifically when data is sparse** (the realistic case for Shin, where most individual shelf prices will get very few independent shopper confirmations), with Minimax/Multi as fancier fallbacks. Also flags that worker answer counts follow a "long-tail" distribution and that not all workers are high-quality: matches what Shin should expect from its shopper base.
- Stated accuracy: **yes**: on their Sentiment Analysis dataset (1,000 tasks, up to 20 answers/task, 185 workers), accuracy for most methods rises from ~65-68% (1 answer/task) to ~94-96% (20 answers/task), while plain majority voting lags behind other methods at low answer counts (e.g., mid-70s% vs mid-80s% for others around 3-5 answers/task) and only catches up near 20 answers/task. On the "Product" (entity-matching) dataset, F1 ranges roughly 40-70% depending on method and number of answers per task, underscoring that entity-matching-style crowdsourced tasks are harder than simple labeling.

### 4. Waze reliability/confidence scoring (as described by GS1... no: by Waze itself, cross-checked against the attack paper above)
- (Folded into item 2 above rather than double-listed; see the Waze paper's description of the reliability score, 0-10, and confidence score, -1 to 5, based on reporter level and other users' "thumbs up"/"not there" reactions: that mechanism description came from search snippets, not a page I opened directly, so it is not separately verified. Treat Waze's official scoring formula as unconfirmed; only the Sybil-attack paper's findings above are opened-and-verified.)

**Not opened (stage 4):** GasBuddy's own help-center pages on "Top Spotter" and price-report weighting (help.gasbuddy.com returned HTTP 403 on every URL tried, including via web.archive.org, which this session's WebFetch tool could not reach at all). Open Food Facts' NutriPatrol moderation tool (searched but not found referenced on the Robotoff pages opened; no separate NutriPatrol page was fetched this session, so it's omitted despite being named in search snippets).

---

## Summary of coverage

- Stage 1 (capture): 8 items opened, 2 named-but-not-opened.
- Stage 2 (matching): 6 items opened, 2 named-but-not-opened.
- Stage 3 (storage): 4 items opened, 1 named-but-not-opened.
- Stage 4 (crowdsourced trust): 3 items opened (one folds in a 4th sub-point), 2 named-but-not-opened.
