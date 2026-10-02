# Methods for requirements 1.1-1.8 and 2.1-2.4 (research, 2026-10-01)

Legend: [V] I opened the source and read the number/claim. [S] taken from a search-result summary, page not opened or unreadable. [U] could not verify. [I] my own inference or arithmetic, not from a source.

Already covered in `category-research.md` and not redone here: Google/GPC/OFF/COICOP/NAPCS taxonomies, multilevel Bayes and partial pooling (Gelman-Hill, Bambi), Smith-Griffin shrinkage along a product tree, Bayesian CART (Chipman-McCulloch), Mondrian conformal (MAPIE, crepes), interval score, StatCan/BLS/ONS imputation notes. This file adds methods for building the hierarchy and for placing items.

Shin's data, for sizing: ~15,000 price rows, ~8,500 priced barcodes, 983 with category+size. A 20-priced-item floor means at most ~425 leaves, and in practice far fewer [I]. Placement training data is the real constraint: 983 labelled items is tiny, but Open Food Facts holds a very large labelled catalogue under its own category taxonomy [U on exact size], which is the lever for 2.2.

Two facts from the numbers that change how several tests should be read:
- 1.5x on the middle 80% (p90/p10 <= 1.5) equals a log-price standard deviation of about 0.158 if prices are lognormal (ln 1.5 = 0.405, divided by 2 x 1.2816) [I]. Useful as a split-search stopping target.
- 2.2's pass test (95%+ on 50 items) cannot demonstrate 95%. Exact (Clopper-Pearson) 95% lower bounds [I, computed]: 47/50 right gives 83.5%; 48/50 gives 86.3%; 50/50 gives 92.9%. Proving at least 95% needs 59/59 right (95% one-sided lower bound 95.0%), or about 200+ items at 95% observed (lower bound 91%). With "per route" this multiplies. This is a flag for the requirement author, not a method.

---

## 1. Categories

### 1.1 Every item in exactly one category at each level of a nested hierarchy (100% have a path)

Tension to flag [I]: Open Food Facts categories are a DAG (entries can have several parents, per `category-research.md` item 3), which breaks "exactly one". And 2.3 lets an item stop at a shallow level, which conflicts with "a category at each level". Both need a ruling: path with a recorded stop level, or forced full path.

**Method A. Collapse the DAG to one canonical parent per node by a fixed, written rule, then enforce one path per item in the schema.**
- What: choose each node's primary parent deterministically (e.g. the parent with most products, or the shortest path to root); store `(item_id, level) -> node_id` with a primary key so duplicates are impossible. Shopify runs a single-parent tree today and says it plans to move to a DAG for multiple valid paths, which shows the tree-first choice is normal. [V] https://shopify.engineering/evolution-product-classification
- Evidence: structural, not statistical. Shopify taxonomy: 10,000+ categories, tree-based. [V]
- Fit: trivial at 8,500 items. Cost: one script plus a uniqueness constraint.
- Pass test: SQL `count(*) where path is null` = 0, and `group by item_id, level having count(*) > 1` returns zero rows. Negative control: insert a duplicate and a null row and confirm the check fails.

**Method B. Use a standard single-parent taxonomy as the fixed top spine (GS1 GPC segment/family/class/brick, or Google Product Taxonomy), and attach the price-derived splits underneath it.**
- What: GPC is 4 levels with fixed codes [S] https://www.gs1.org/standards/gpc ; Google's is a path list with 5,595 paths, "Food, Beverages & Tobacco" 364 paths, max depth 6 [V in earlier file] https://www.google.com/basepages/producttype/taxonomy.en-US.txt . Both are trees, so "exactly one" is automatic. Wine is a leaf in Google's, so the price split must be derived (see 1.3).
- Evidence: Brinkmann and Bizer classify web offers into the first three GPC levels, 222 leaf categories in their Icecat/WDC task [V from PDF text]. Licence of both files [U].
- Fit: good; removes the need to maintain your own spine. Cost: a mapping from OFF tags to the spine (many-to-one, can be built once from the OFF category names and checked by hand on the top ~200 tags).
- Pass test: same SQL as A, plus every OFF-tagged item resolves through the mapping.

**Recommended first: A** (smallest change to the current OFF-tag catalogue), with B kept as the reference for department coverage in 1.8.

### 1.2 Each category has a similar price range on unit price (middle 80% within 1.5x, or flagged wide)

**Method A. A dispersion audit: robust per-category p10/p90 on log unit price with a bootstrap interval, flag "wide" when the interval's upper end exceeds 1.5x.**
- What: compute per category (items with 20+ priced items), one price per item (median across rows) so one popular item cannot dominate; bootstrap items to get the CI on p90/p10. This is the pass test itself and also the stopping rule for splitting.
- Evidence: the closest published homogeneity check is ONS CLIP: 137 breakfast-cereal products clustered into 3 groups with geometric-mean prices from 2.19 to 2.52 pounds (ratio 1.15). [V] https://www.ons.gov.uk/economy/inflationandpriceindices/articles/researchindicesusingwebscrapedpricedata/clusteringlargedatasetsintopriceindicesclip
- Fit: seconds on 8,500 items. Cost: very low.
- Pass test: run on every category; add a negative control (a deliberately mixed category such as "all beverages" must flag wide) and a positive control (a known tight category passes). Needs unit-price normalisation to be correct first (3.5).

**Method B. Grow the hierarchy by variance reduction on log unit price with a width target (CART).**
- What: regression tree on log unit price using product-type and attribute features; `criterion="squared_error"` is variance reduction; `min_samples_leaf`, `ccp_alpha`, `max_leaf_nodes` control depth. [V] https://scikit-learn.org/1.9/modules/generated/sklearn.tree.DecisionTreeRegressor.html Stop growing a node when its p90/p10 is under 1.5x.
- Evidence: standard method; no grocery number found. The ONS CLIP result above is the nearest grocery evidence.
- Fit: ideal at 8,500 items. Cost: low. Caveat [I]: variance reduction targets the mean; a category can have a good mean and a fat tail, so tail-aware checks (Method A) still decide pass/fail.

**Method C. Mean-shift or agglomerative clustering on price plus name features, then a decision tree to assign new items without using price (ONS CLIP).**
- What: base-period clustering with price, product name, shop, discount marker; a decision tree then learns assignment rules from name similarity, shop and discount marker only, and price is deliberately excluded so items do not migrate clusters when their price moves. [V] same ONS URL.
- Evidence: CLIP tracked published CPI food trends over June 2014 to July 2016 and followed GEKSJ better than a unit-price index. [V] Limits stated by ONS: online retailer data only, not suitable for items with fewer than 3 average daily prices. [V]
- Fit: workable but heavier than B for a taxonomy that must stay human-readable [I]. It matters here because it shows how to keep assignment independent of price, which feeds 1.6.

**Recommended first: A to measure, B to build.**

### 1.3 Split a wide category when data allows; never split a narrow one unless it narrows held-out prices

**Method A. Honest, cross-fitted split validation: choose the split on one part of the items, judge it on other items.**
- What: Athey and Imbens' "honest" trees use one sample to build the partition and an independent one to estimate leaf values, so leaf estimates are unbiased. [V summary] https://arxiv.org/abs/1504.01132 (alphaxiv listing). Applied here: for each candidate split, fit child quantiles on training items and score parent versus children on held-out items (grouped by item, and by brand for the harder case) using pinball loss or the interval score. Accept the split only if the paired-bootstrap interval of the improvement excludes zero.
- Evidence: a statistical principle with published use in causal trees; no grocery number [U].
- Fit: fine at this size; with ~20-item leaves a single holdout is noisy, so repeated grouped K-fold is needed [I]. Selection effect [I]: if many splits are tried and judged on the same holdout, accepted gains are optimistic, so keep a final untouched test set for the "no split fails" claim.
- Pass test: for every accepted split, held-out width and pinball loss of children beat the parent; run a negative control with shuffled prices, and no split should be accepted.

**Method B. Cost-complexity pruning plus the one-standard-error rule, selected by grouped cross-validation.**
- What: grow a large tree, prune back with `ccp_alpha` chosen on held-out items; `DecisionTreeRegressor.cost_complexity_pruning_path`. [V] sklearn URL above.
- Evidence: textbook CART practice. Cost: very low.
- Pass test: every surviving split passes Method A's held-out check.

**Method C. Shrink instead of hard-splitting: hierarchical shrinkage or Bayesian tree priors, so a split with no evidence reverts to the parent.**
- What: Hierarchical Shrinkage (Agarwal et al., ICML 2022) shrinks each node's prediction toward its ancestors' means with a single parameter, post hoc on any fitted tree; in the `imodels` package. [V summary] https://arxiv.org/pdf/2202.00858 . Bayesian alternatives: Chipman and McCulloch Bayesian CART (earlier file) and BART (pymc-bart) https://arxiv.org/pdf/2206.03619 [S].
- Evidence: the paper reports substantially higher predictive performance than unshrunk trees; I do not have a figure [U].
- Fit: it softens "never split a narrow category" (a wasteful split costs little) but does not literally forbid it, so it supports rather than satisfies 1.3.

**Recommended first: A, with B generating the candidate splits.**

### 1.4 No subcategory with fewer than 20 priced items

**Method A. Enforce at build time as a minimum leaf size counted in items (not rows).**
- What: aggregate to one row per item before fitting, then `min_samples_leaf=20`; or pass item weights and use `min_weight_fraction_leaf`. partykit's `mob` has a `minsize` argument [S] https://www.rdocumentation.org/packages/partykit/versions/1.2-29/topics/mob . Row counting is a trap: 15,000 rows over 8,500 barcodes means a "20-row" leaf can hold 10 items [I].
- Pass test: SQL count of priced items per non-root node, minimum >= 20. Negative control: build once with `min_samples_leaf=5` and confirm the check goes red.

**Method B. Bottom-up merge of undersized siblings into the parent (post-pass).**
- What: after any build, any node under 20 priced items is dissolved into its parent. Cheap, deterministic, makes 1.4 hold even when a different builder is used.
- Pass test: same as A.

**Recommended first: A, with B as a safety net.**

### 1.5 Allow splits by any recorded attribute (brand tier, pack size, region, chain, season)

**Method A. Model-based recursive partitioning with the attributes as partitioning variables.**
- What: MOB fits a model, tests for parameter instability against each candidate partitioning variable, splits on the most unstable one, and repeats. Zeileis, Hothorn, Hornik, J. Computational and Graphical Statistics 17(2):492-514, 2008. [V] https://mirror.linux.duke.edu/cran/web/packages/partykit/vignettes/mob.pdf ; R package partykit. Using the intercept (mean log price) as the model, then tests whether attribute levels move it.
- Evidence: established method; no grocery number [U]. Note [I]: plain `lmtree` tests the mean, not spread; testing dispersion needs a custom fit returning both mean and variance scores.
- Fit: fine at this size; needs R (partykit) or a hand-rolled Python version. Cost: medium.

**Method B. Variance-components screen: a multilevel model on log price, with random intercepts for category, brand tier, size bucket, chain, region, season.**
- What: the share of variance each term explains within a category says which attribute is worth splitting by. Bambi formula pattern `log_price ~ 1 + (1|category) + (1|chain) + (1|size_bucket)` is already in `price-system-references-prediction-verdict-2026-09-28.md` item 4 (https://bambinos.github.io/bambi/notebooks/hierarchical_binomial_bambi.html). Also Gelman-Hill (earlier file).
- Evidence: Smith and Griffin 2022 [V title via Crossref] use shrinkage along a product tree for retail data.
- Cost: medium (MCMC) or low with statsmodels MixedLM [U on versions].

**Method C. CART/gradient boosting on the attributes inside a category, read off feature importances.**
- Cost: low. It shows which attributes carry dispersion but does not make the splits legitimate; they still pass 1.3.

Flags [I]:
- "Chain", "region" and "season" belong to the price row, not the item, so a split by chain means the answer is keyed (category, chain), a change to the data model.
- "Brand tier" is not in the data; if derived from price rank, splitting on it is circular and will always look like it narrows the range. Derive it from a non-price source (own-label flag, brand owner) or the 1.3 test is contaminated.
- No attribute can be shown until the data exists; the pass test says "once data exists", so mark attributes not yet testable as such, not passed.

**Recommended first: B as the screen, then A or the CART split from 1.2 to make the actual splits.**

### 1.6 Rebuild the hierarchy from data with no hand edits, without re-placing items

**Method A. Two layers: a stable placement layer (item to product-type node) and a derived price layer (grouping of nodes and attributes into price categories), where the rebuild reads placements and prices and never calls a placer.**
- What: ONS CLIP does the same split in spirit: the clusters are built from base data, and new items are assigned by a decision tree that does not use price. [V] ONS URL above. Eurostat/StatCan CPI practice likewise separates the item-to-classification map from the aggregation. [S]
- Evidence: structural. Fit: matches the "taxonomy layer under a derived price layer" idea directly. Cost: a table split and a build script.
- Pass test: run a rebuild with the classifier and LLM clients disabled (raise on any call) and count calls: 0. Also hash the placement table before and after: identical. Negative control: wire in one placement call and confirm the test fails.

**Method B. Bottom-up merging of taxonomy leaves with statistical similarity (agglomerative clustering with a tree-connectivity constraint).**
- What: start with the taxonomy's leaves; repeatedly merge adjacent siblings whose log-price distributions are indistinguishable (Wasserstein or KS distance on item prices), stop when a merge would widen the range past 1.5x; scikit-learn `AgglomerativeClustering(connectivity=...)` [S] enforces adjacency. Deterministic, no hand edits, no placements touched.
- Evidence: not a published grocery result [U]. ONS CLIP is the nearest precedent.
- Cost: low to medium.

**Recommended first: A, with B as the way to derive the price layer from it.**

### 1.7 Keep every hierarchy version; reproduce any past answer exactly

**Method A. Append-only version tables: `hierarchy_version(version_id, built_at, code_hash)`, `node(version_id, node_id, parent_id, stats...)`, `item_path(version_id, item_id, node_id)`; answers record `version_id` (this matches 3.8).**
- What: SCD Type 2 style rows with validity ranges, queried as-of a version. [S] https://learn.microsoft.com/en-us/training/modules/design-implement-data-modeling-unity-catalog/7-implement-slowly-changing-dimension-type-2 ; CRAN SCDB vignette https://ftp.fau.de/cran/web/packages/SCDB/vignettes/slowly-changing-dimension.html [S].
- Evidence: standard data-warehouse practice, no accuracy number. Fit: trivial in SQLite/Postgres. Cost: low.
- Key point [I]: "reproduce exactly" fails unless the range statistics are stored per version (the node's quantiles, counts, basis), not recomputed from live price rows, because price rows keep growing. Store the leaf range table inside the version so an answer is a lookup, not a recomputation. Also store any RNG seed and the cut-off timestamp of the prices used.
- Pass test: draw 50 random past answers, re-derive each from its stored `version_id` through the answer code path, compare byte-for-byte. Negative control: edit one stored node statistic and confirm a mismatch is detected.

**Method B. Immutable snapshot files with content hashes (a version = a Parquet/JSON file plus its SHA-256, referenced by the answer).**
- What: git/DVC style content addressing; table formats such as Apache Iceberg and Delta Lake offer time travel by snapshot id [U, not opened]. Overkill at this size; the file-hash idea is enough.
- Cost: low.

Contrast worth knowing [V]: Eurostat's switch to ECOICOP version 2 in January 2026 recalculated the back series from 1999 to 2025, left headline inflation unchanged but changed sub-component indices and weights, with the largest effect in food aggregates. https://www.ecb.europa.eu/press/economic-bulletin/focus/2026/html/ecb.ebbox202603_07~c015bf3c71.en.html Agencies revise history; Shin's "never changes" rule requires versioning instead.

**Recommended first: A.**

### 1.8 Cover every department; turn one on only after it passes section 7

**Method A. A release gate keyed to a stored passing evaluation record per department.**
- What: `department_status(dept, version_id, eval_run_id, passed_at)`; serving code returns "no answer" unless the current version has a passing record. Department list taken from the top level of a standard taxonomy (GPC segments or Google top level) so "every department" is a diff against a reference, not a judgement.
- Evidence: standard ML production-readiness practice (the "ML Test Score" rubric, Breck et al. 2017, Google) [U, not opened]. No number.
- Pass test: for each department without a passing record, requests return no answer 100%; for each with one, requests are served. Negative control: delete one record and confirm the department goes dark. The "every department" half is a set difference against the reference list.

**Method B. Shadow mode before enabling: serve nothing, log what the system would answer, score it against later observed prices, then enable.**
- Evidence: standard canary practice; no number. Cost: low; gives the departments with no observed prices (electronics) a pathway.
- Pass test: shadow log scored with the section 7 checks (Mondrian conformal coverage per department, from the earlier file) before the flag flips.

**Recommended first: A, using B's shadow log as the evidence it reads.**

---

## 2. Placing items

### 2.1 Every item a shopper can identify, by any route, is placed at some level (100%)

Flag [I]: if placement may stop at the root, 100% is trivially satisfiable and says nothing. Pair it with a minimum useful level (e.g. department) reported separately.

**Method A. A route cascade with a guaranteed terminal: barcode lookup, then text classifier, then constrained LLM choice, then root-level placement plus a pending catalogue item (5.7).**
- What: barcode hits resolve through the catalogue's own category tags; the text paths use the classifier from 2.2; anything below the confidence floor climbs to the parent via 2.3 and in the worst case lands at the root. Hierarchical selective classification does exactly this "retreat to a less specific node" and never has no answer. [V] https://arxiv.org/html/2405.11533v2
- Evidence: structural. Fit: simple. Cost: low.
- Pass test: replay a labelled set of requests for every route (barcode, typed name, OCR text, listing without barcode) and a fuzz set (empty, emoji, French, OCR garbage, 500-character strings); assert a non-null path in 100% of cases. Negative control: remove the terminal fallback and confirm the fuzz set fails.

**Method B. Zero-shot taxonomy-aware classifier that can label never-seen classes from label text alone.**
- What: Zero-shot hierarchical classification on the EU Common Procurement Vocabulary taxonomy, using a pretrained language model with label descriptions and respecting the tree; reported to beat three baselines on low-frequency classes and to predict never-seen classes (no figures in the abstract). [V] https://arxiv.org/abs/2405.09983
- Use here: covers new categories with no training items, which keeps 2.1 true when a department is new (1.8).

**Recommended first: A.**

### 2.2 Place items correctly: 95%+ at category-or-parent, per route (today 70% to 78%)

Prerequisite [I]: 7.7 says the current answer key is 17.9% wrong; part of the 70-78% gap may be label error, not model error. Audit before concluding the model is the problem.

**Method A. Frozen multilingual sentence embeddings, then a nearest-neighbour or logistic-regression head trained on a large labelled catalogue (Open Food Facts), with Shin's 983 labelled items as the check set.**
- What: embed the product name (BGE-M3, multilingual-e5, or a sentence-transformers model; multilingual matters because Canadian packaging is bilingual) and classify by kNN or a linear head. In FEAST, BGE-M3 retrieval plus an LLM reranker (Llama 3.1-8B) reached accuracy@1 of 91.01% for FoodEx2 base terms and 96.39% and 96.03% on two facet tasks [V, read from the paper's text]. https://arxiv.org/pdf/2603.03176 This is food text, retrieval over a fixed label list, close to Shin's task.
- Other evidence: Rakuten SIGIR eCom 2018, 1M product titles (0.8M train), top weighted F1 0.8513 over 26 teams [S] https://ceur-ws.org/Vol-2319/ecom18DC_paper_13.pdf ; Brinkmann and Bizer 2021 report nearly 89% wF1 for transformers with domain pretraining and that fastText is clearly worse [S from search summary; PDF unreadable to my fetcher] https://www.uni-mannheim.de/media/Einrichtungen/dws/Files_Research/Web-based_Systems/pub/Brinkmann-Bizer-Improving_Hierarchical_Product_Classification_using_domain_specific_laguage_modelling-PKG4Ecommerce2021.pdf . Both are harder tasks (hundreds to thousands of leaves, noisy offers), so 95% at category-or-parent is plausible for the top levels but not shown for leaves [I].
- Fit: 8,500 names embed in minutes on CPU; kNN needs no training, so new confirmations (2.4) are usable immediately. Cost: low. Caveat [I]: OFF names are product-pack text, while Shin's routes include typed names and OCR, so the per-route test matters.
- Pass test: 50+ random items per route, hand checked, reported with an exact binomial interval (see the arithmetic at the top). Negative control: randomised labels must score near chance.

**Method B. Retrieve-then-choose with an LLM: candidate labels from embedding retrieval, the LLM picks only from the listed candidates.**
- What: constrain the model to a closed list so it cannot invent a category; shown in FEAST above. Vendor and talk evidence: Veepee multimodal LLM with a "label book" 94% top-1 with no heavy training [S, unopened] https://www.ai-pulse.eu/agenda/cracking-product-taxonomy-at-scale:-a-multimodal-zero-shot-approach ; Instacart's LLM taxonomy classification gained over 18 points precision on tail queries [S] https://www.ai.engineer/talks/PjaVHm_3Ljg-instacart-transformed-its-search-discovery-using ; Netscribes case study (GPT-3.5 few-shot with dynamic taxonomy) accuracy ~85% to ~78% while retrain turnaround dropped from ~2 weeks to ~2 days [S, vendor claim].
- Counter-evidence: a 2025 study of ten LLMs, zero-shot with a hierarchical taxonomy, got about 34% average accuracy on 8,660 human-annotated samples [S] https://arxiv.org/html/2510.13885v1 ; its data was unstructured text, not product names, and it did not use retrieval, so it supports "do not ask an LLM to label from memory", not "LLMs cannot do this".
- Fit: 8,500 short names is a small LLM bill with the cheapest model [I, order of cents to a few dollars, not verified]. Complexity: low.
- Pass test: same sample protocol as A, run per route.

**Method C. Use Open Food Facts' own category classifier as a free baseline.**
- What: Robotoff predicts categories from name, ingredients, OCR and image embeddings, trained on categories with at least 10 products, about 3,500 of the 12,500+ taxonomy categories, and returns parent, child and sibling scores. [V] https://openfoodfacts.github.io/robotoff/references/predictions/category-prediction/ ; model https://huggingface.co/openfoodfacts/category_classifier (AGPL-3.0 [V], accuracy not stated on the page [U]).
- Fit: matches Shin's current tag system. Cost: low to run; the AGPL licence needs checking before it ships inside a closed app [U].
- Pass test: same.

**Recommended first: A, with B only on items A is unsure of (the cheapest high-accuracy design in the evidence), and C run once as a baseline to beat.**

### 2.3 Place an item only as deep as it is sure of, and record the confidence

**Method A. Hierarchical selective classification, "climbing" inference: start at the most likely leaf and climb until an ancestor's probability clears a threshold.**
- What: Goren, Galil, El-Yaniv, NeurIPS 2024. The threshold is set on a calibration set by an algorithm with a stated guarantee (Theorem 1: the achieved accuracy is within a margin of the target with high probability). [V] https://arxiv.org/html/2405.11533v2 ; code https://github.com/shanigoren/Hierarchical-Selective-Classification
- Evidence [V]: about 15% hierarchical gain over a plain selective baseline across 1,115 ImageNet-1k models, up to 2x the coverage of the DARTS method at high target accuracies. Image data; no product-text number [U].
- Fit: sums class probabilities over a subtree, so it needs a probability model per class (a softmax head from 2.2 Method A). Cost: low.
- Pass test: schema check (no placement row lacks level and confidence); on held-out items, accuracy at the recorded level is at least the stated target.

**Method B. Per-level calibration with temperature scaling or isotonic regression, plus top-down thresholds.**
- What: Guo et al., ICML 2017, one parameter fitted on held-out data. [V] https://proceedings.mlr.press/v70/guo17a.html A top-down acceptance rule that rejects low-reliability routes is also in the hierarchical text classification literature [S] https://core.ac.uk/works/2412511 .
- Cost: very low. Test: reliability table per level: of placements stamped 0.9, about 90% are right.

**Method C. Hierarchical conformal classification: prediction sets of taxonomy nodes with a coverage guarantee, placement level = lowest common ancestor of the set.**
- What: Hierarchical Conformal Classification (2025), prediction sets mixing nodes at different levels with a coverage guarantee, plus a user study where annotators preferred hierarchical sets. [S] https://arxiv.org/abs/2508.13288 ; Mortier et al., "Conformal Prediction in Hierarchical Classification" [S, title only, URL not found].
- Fit: needs a calibration set of a few hundred hand-checked items. Cost: medium.

**Recommended first: A on top of B-calibrated probabilities.** Cross-link [I]: this is also where the stop level for 1.1 gets recorded.

### 2.4 Record shopper picks and corrections as evidence; re-run 2.2 after every 500 new confirmations

**Method A. Append-only feedback log plus a kNN index that includes confirmed items immediately, with a scheduled re-score.**
- What: every confirmation becomes a labelled example; kNN or a refit linear head picks it up with no retraining; a counter triggers the 2.2 evaluation at every 500th confirmation.
- Selection-bias warning [I]: confirmations arrive where shoppers choose to confirm (often the already-correct or the glaringly wrong), so a re-score on confirmations alone is not a random sample. Keep the random hand-checked set from 2.2 as the yardstick and report confirmation-based accuracy separately.
- Pass test: after 500 confirmations the job fired exactly once and wrote a scorecard; negative control: inject 499 and confirm it does not fire.

**Method B. Active learning: ask for confirmation on the items the model is least sure of.**
- What: pool-based uncertainty sampling (breaking ties works as a drop-in for entropy), library small-text. [S] https://arxiv.org/pdf/2107.10314 Evidence [S]: uncertainty sampling with BERT beats random selection, and the advantage shrinks as the query pool grows.
- Fit: Shin has little shopper volume today, so the gain is modest [I]. Use for "what to ask next", not for the yardstick (see bias warning).

**Method C. Confident learning to clean the labels and shopper corrections.**
- What: Northcutt, Jiang, Chuang, JAIR 70 (2021), the algorithm in the `cleanlab` package; finds likely label errors and ranks them, shown on text sentiment data. [V summary] https://arxiv.org/abs/1911.00068
- Use here: audit the 17.9%-wrong answer key (7.7) and screen suspicious shopper corrections; combined with 5.4/5.5, treat a correction as strong evidence only when independent shoppers agree [I].

**Recommended first: A, with C run once now on the existing 983 labels because label noise caps any measured accuracy.**

---

## Not found or not verified
- Any published accuracy for classifying Canadian grocery product names into a price-homogeneous hierarchy; Rakuten, Brinkmann, and FEAST are the nearest.
- Veepee, Instacart, Netscribes numbers: summaries or vendor material only.
- Robotoff category classifier accuracy: not stated on the pages opened.
- ML Test Score (Breck et al.), Iceberg/Delta time travel, Mortier et al. URL: named from memory or titles, not opened.
- The US Census paper on UPC to NAPCS classification (aclanthology W19-3623, "all of our algorithms surpassed over 90 percent") is US Census, not Statistics Canada; the abstract gives no model names or level counts [V abstract only]. Statistics Canada itself uses SVM (CPI) and XGBoost on character n-grams (retail surveys) for NAPCS [S] https://statcan.gc.ca/en/data-science/projects .
