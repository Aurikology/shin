# Methods for requirements 3.1-3.9 and 7.1-7.8 (Shin price system), 2026-10-01

Marks: [V] = I opened the page or ran the numbers myself this session. [S] = taken from a search-result summary, page not opened. [U] = from memory or not checked; verify before relying. "Computed" = my own arithmetic, script `scratchpad/stats.py`. Costs are my own estimates in engineer-days, not sourced.

## Facts about Shin's data that change which methods are usable (all [V], read-only queries of `price/data/prices.db` and `bench/results/*.json`)

1. 15,193 observation rows: BC liquor (bcldb) 7,556, NB liquor (anbl) 6,741, openprices 874, walmart.ca 22. Dates 2020-02-01 to 2026-09-26.
2. **No (seller, sku) appears on more than one date** (0 of them). There is no per-item price time series. Any method that needs a series (modal-price reference, V-shaped sale filter, drift tests, "later dates" splits) cannot run today. The bench agrees: its `by_time` split is "impossible", and `by_product` has 0 scored test points (only 1 product has 3 truth points).
3. The 252 promotional rows carry **no printed was-price** (`base_price_cents` is null on all 252). The bench pairs 207 of them to a regular price by same seller and barcode; 45 have no pair. 6,741 regular rows (the NB ones) carry a `base_price_cents` whose meaning I did not check [U].
4. The bench already has a bar block: `saleLowMin 0.8` (requirement 7.3 says 70%), `ownWidthMedianMax 1.5`, `calibrationTolerance 0.05`, `perCategoryMinProducts 30`. 7.3's 70% and the bench's 0.8 disagree; one of them is stale.
5. The re-read sheet on disk: 50 rows, all sale rows (44 random, 6 flagged); 32 right, 13 wrong, 5 blank. Its audit field says the key error rate is "not measured" in that run. I could not find where 17.9% comes from [U].
6. The runtime is TypeScript on Node 22 with SQLite. Conformal calibration reduces to a per-group table of residual quantiles (a multiplier per category) computed offline in Python and shipped as data; the runtime step is one multiplication. So Python libraries below are bench-side only.

## Findings about the requirements themselves (read these first)

A. **7.1 cannot be verified as written at n = 30.** If the 80% range is exactly calibrated, a category with 30 test items lands outside 75-85% observed coverage 49% of the time (exact binomial, computed). At 50 items 38%, at 100 items 17%, at 250 items 5%. The 95% CI half-width at n=30 is 14 points. The "within 5 points in every category with 30+ test items" check is a coin flip until categories have about 250 test items. For the overall "78% to 82%" band, a 95% CI of +/-2 points needs about 1,537 test items (computed); the old test had 654 scored items (+/-3.1 points). Suggested statistical form of the same pass test: an exact binomial test (or Wilson interval) that does not reject 80%, with the per-category band applied only where n supports it. This is a note for him; I changed nothing.
B. **Design rung 8 (`global_prior`, "all regular prices Shin holds in that currency") is the exact basis 3.3 forbids.** With today's data that median is a liquor price. Either rung 8 goes, or it is allowed only inside a department.
C. **7.5 "weighted to Ontario groceries" has no Ontario grocery rows to weight.** Weights are undefined where the sample has zero rows. The test set has to be collected, not reweighted.
D. **7.2's 1.5x needs a log spread of 0.158; the old category range had 0.335** (ratio = exp(2 x 1.2816 x sigma), computed). Halving the spread inside a category means the split is the lever, not more data (the earlier research file makes the same point: item spread inside a category does not shrink with more data).
E. **7.7 arithmetic** (Clopper-Pearson, 95% one-sided, computed): to show an error rate under 2% you need 149 audited rows with 0 errors, 236 with 1 error, 313 with 2, 386 with 3. A 50-row sheet can only ever prove "under about 6%" (3/50).
F. **7.3 has an unstated ceiling.** A sale lands good only if it is 20% or more under the centre. If fewer than 70% of sales are that deep, 70% is unreachable even with a perfect centre. Sale depth has to be measured on the 207 paired rows before the mark is argued about.

---

# Section 3. The range for an item

## 3.1 Return a range for every request that has a scan left (0 requests end without one)

**Method A (recommended first): total fallback ladder, proven total by property-based fuzzing.**
- What: keep the existing rung ladder (own, other size, leaf, parent, brand markup, Claude, category prior). Make "every rung returns or yields to the next, last rung cannot fail" a tested property: generate thousands of random item descriptors (null size, null category, unknown barcode, empty string, huge price, wrong currency) and assert a well-formed range comes back. Tool: fast-check (TypeScript property testing) https://github.com/dubzzz/fast-check [U]; Python equivalent Hypothesis https://hypothesis.readthedocs.io [U].
- Why it should work: the failure mode is an unhandled input on some rung, which is exactly what fuzzing finds. Statistical-agency practice is the same shape: StatCan imputes a missing price from the class average, then a wider class, so a price always exists https://www150.statcan.gc.ca/n1/pub/62-553-x/2023001/chap-7-eng.htm [V, sec 7.8]. Evidence of a number: none found for this specific technique [U].
- Fit: tiny; the ladder is already coded (design doc). Cost 1 day.
- Pass test: (1) fuzz run, 10,000 cases, 0 without a range; (2) every request writes a terminal row, and the check is `count(requests with scan left) == count(answers with a range)` over the live log, so a request that dies mid-way is counted rather than missing.

**Method B: fault injection on the dependencies.** Kill Claude, make the DB slow, cut the network, and replay a day of real requests. Circuit-breaker libraries (opossum https://github.com/nodeshift/opossum [U]) give the "fall to next rung on timeout" step. This is 6.7's test and 3.1's together. Cost 1 day.

**Method C: conformal predictive systems give a distribution for any item given a point prediction** (crepes `ConformalPredictiveSystem`), so even a category-less item has a calibrated range from a global model. Only usable under 3.3's rule inside a department. Cost 2 days. [S on capability: https://pypi.org/project/crepes/]

## 3.2 Build the range from own observed prices, and from the category where thin or missing; every answer names its basis

**Method A (recommended first): empirical-Bayes partial pooling on log price, estimated shrinkage weight.**
- What: for item i in category g with n_i own prices, centre mu_i = w * mean(log own) + (1 - w) * mu_g, with w = tau^2 / (tau^2 + sigma_w^2 / n_i). tau^2 is the spread of item means inside the category, sigma_w^2 the spread of repeat prices of one item (store to store). Both are estimated from data (method of moments or REML), per category with a pooled fallback. This is James-Stein / Efron-Morris shrinkage: https://www.medicine.mcgill.ca/epidemiology/hanley/bios602/MultilevelData/EfronMorrisJASA1975.pdf [S]. Library: statsmodels MixedLM https://www.statsmodels.org/stable/mixed_linear.html [U], or Bambi/PyMC `(1|category) + (1|brand)` https://bambinos.github.io/bambi/notebooks/hierarchical_binomial_bambi.html [V in earlier file].
- Behaviour at n = 1: w = tau^2/(tau^2 + sigma_w^2). It is not a free choice; it is whatever the data say. The built design fixes k = 1, which is the same as asserting sigma_w^2 = tau^2 (own price and category equally informative). If store-to-store spread is small next to between-item spread, w goes toward 1 (trust the one own price); if large, toward 0 (trust the category). Illustration only, invented numbers: tau 0.30, sigma_w 0.12 gives w = 0.86 for one price [computed]. Real values must come from the 125 two-store barcodes (the only within-item evidence; 34 of them within 5%).
- Evidence: Efron and Morris: predictions of later batting averages from early-season averages were more accurate with shrinkage than raw averages [S: https://gwern.net/doc/statistics/bayes/1977-efron.pdf]; the "3.5x lower total squared error" figure I have in memory was NOT confirmed by search [U]. Shrinkage down a product tree on retail data has a published precedent: Smith and Griffin 2022, doi 10.1007/s11129-022-09260-7 [V title/authors via Crossref in the earlier file; target there was elasticities, not price levels].
- Fit: 15k rows is tiny for this; the weak point is that within-item variance is only estimable from ~125 repeated barcodes, so it needs partial pooling across categories itself (a global sigma_w with a category adjustment).
- Cost: 2 days for method-of-moments in the bench, 3 days for a fitted multilevel model.
- Pass test: the answer record's `basis` field is non-null and drawn from the enumerated set (a CHECK constraint, see 3.8). Quality test, run on the bench: hold out store B's price for each two-store barcode, predict it from store A plus category, and compare k=1 (current) vs estimated w vs no pooling vs category only on interval score and log error with a product-clustered paired bootstrap (see 7.4). Only 125 pairs: expect to detect a large difference in k and nothing subtle; report that.

**Method B: conformal-calibrated blend (the ladder's centre unchanged, the spread calibrated).** Keep the design's centre but let a split-conformal step set the width per basis (own, leaf, parent, Claude), so each rung's honesty is measured, not assumed. This is what 7.1 needs anyway. See 7.1. Cost: 2 days after A.

**Method C: gradient-boosted quantile model with category/brand/size as features** (LightGBM `objective='quantile'`). Trees beat nets at ~10k rows: Grinsztajn et al. 2022, https://arxiv.org/abs/2207.08815 [V in earlier file]. Does not do n=1 own-price blending natively (own prices are labels, not features), so it is a competitor to test against Method A, not a replacement. Cost 3 days.

## 3.3 Never pool prices across unrelated categories (no all-of-Shin median)

**Method A (recommended first): department-bounded backoff, enforced by an assertion.**
- What: hierarchical backoff stops at the department root; there is no level above it. The estimator takes a `department` argument and refuses any pool whose rows have a different department. This is the "elementary aggregate" idea in price indices: StatCan's overall-mean imputation averages only items of the same representative product https://www150.statcan.gc.ca/n1/pub/62-553-x/2023001/chap-7-eng.htm [V, sec 7.8]; the ILO CPI Manual homogeneity requirement for elementary aggregates is the same principle [U, manual not opened].
- Needed change from the design: rung 8 `global_prior` has to go or be scoped to a department (finding B above). When no category can be placed, the answer goes to the Claude rung or to a labelled estimate, never to an all-Shin median.
- Fit: trivial. Cost 0.5 day.
- Pass test: (1) query the answer log: `count(*) where basis = 'global_prior'` must be 0, and (2) a unit test that builds an answer for an item whose department has 0 rows while another department has thousands, and asserts the basis is not a cross-department pool (negative control: temporarily re-enable `global_prior` and watch the test go red). (3) The logged `row ids used` for each answer all share one department; a join checks it.

**Method B: Mondrian grouping as the calibration unit.** Calibrating residuals only inside a group (category) means no cross-group pooling in the calibration step either. MAPIE has no Mondrian class, its docs say to split by group and calibrate each separately [V https://mapie.readthedocs.io/en/latest/content/conformal-prediction/conditional-guarantees/]; crepes has `MondrianCategorizer` [V https://crepes.readthedocs.io/en/latest/getting_started.html]. Cost 1 day (overlaps 7.1).

## 3.4 Never answer with a single store's price (every answer is a range)

**Method A (recommended first): invariant on the response object plus a minimum log width.**
- What: the response type cannot be built with p10 equal to p90; a floor on sigma_log (the design has 0.05, which gives only a 1.14x band, +/-6.6%, computed). A band that narrow around one store's price is a range in name only; the floor should come from the category's measured spread, which the design already requires ("never below the category's spread"), and the test should check that rule is what fires for n=1.
- Pass test: property test over random single-price items: assert p90/p10 >= the leaf category's spread ratio (or a stated minimum), and that the centre differs from the lone own price whenever a category centre exists (the blend does this).

**Method B: predictive distribution, not a point estimate.** Hierarchical posterior predictive (Bambi/PyMC) or conformal predictive system (crepes) returns a distribution by construction. https://crepes.readthedocs.io/ [V]. Cost 2-3 days; only worth it if Method A in 3.2 is already a multilevel model.

## 3.5 Express the range for this item's size (per-unit and pack price both correct on 50 checked items)

**Method A (recommended first): same-pack-size-band comparison (already designed) plus a learned size slope per category.**
- What: within a category fit log(unit price) = a_g + b_g * log(size); b_g < 0 is a bulk discount, b_g > 0 a surcharge. Partially pool b_g across categories. Evidence that the sign is not safe to assume: a study of consumer scanner data found almost 10% of products charge more per unit for larger packs [S: https://ageconsearch.umn.edu/record/21419]; theory predicts discounts when demand is unobservable. So the slope has to be learned and tested (3.7), not assumed flat or negative.
- Fit: needs several sizes of one product or one category with spread in sizes. Shin's own data: 79% of Canadian food has no size (design doc), so the slope will first exist only for liquor.
- Cost 2 days.
- Pass test: 50 random items stratified by unit family (ml, g, each, kg), each checked by hand against the shelf tag or product page: per-unit and pack price arithmetic both right. State what 50 can prove: with 0 errors the 95% upper bound on the error rate is about 6% (3/50, computed), so "correct on 50" supports "under about 6%" and no better. Add an automatic round-trip check on all items: per-unit price x size recovers the pack price within rounding (catches parsing bugs on every item, not 50).

**Method B: unit-value convention from official price statistics.** Unit value = expenditure / quantity, the convention in Eurostat's scanner-data guide [S via the earlier file; guide URL not verified] and StatCan scanner work. It fixes the definition of "per unit"; it does not give the size curve. Cost 0.

**Method C: a units library for the normalisation step** (Python `pint` https://pint.readthedocs.io [U]; npm `convert-units` [U]) in place of hand-rolled conversion, since Shin already has a size system in `units.ts` this only matters for the cases that fail the round-trip check. Cost 1 day if needed.

## 3.6 Keep sale prices out of the typical price, stored and shown on their own (0 sale prices in any centre)

**Method A (recommended first): trust the source's sale flag, and make the exclusion checkable.**
- What: the store's own flag (`kind = 'promotional'`, "was/now" printed) decides. The BLS data used by Nakamura and Steinsson carry sale flags and the paper's headline facts use them (median frequency of nonsale price change 9-12% a month vs 19-20% with sales) [S: https://business.columbia.edu/sites/default/files-efs/pubfiles/3556/fivefacts.pdf]. Project Hammer's CSV also has an old-price column [V earlier file].
- Fit: works on today's data; 252 flagged rows. Limit: a sale that the store did not flag leaks into the centre, and today no method can find those (finding 2, no time series).
- Cost 0.5 day: record the ids of every row used for each answer.
- Pass test: join each logged answer's row ids to `kind`; 0 promotional. Negative control: add a synthetic promotional row at half price to a fixture and assert the centre is unchanged. That is a structural test only; it does not measure unflagged-sale leakage.

**Method B: reference (modal) price once repeat observations exist.** Eichenbaum, Jaimovich and Rebelo define the reference price as the most common price in a quarter; weekly prices change about every two weeks but reference prices last about a year [S: https://www.nber.org/papers/w13829; AER 2011]. Use the mode of the last quarter per (store, item) as the "regular" price and flag observations well below it. Needs several observations per item per store; Shin has none today. Cost 2 days, blocked on data.

**Method C: sale filters from the scanner-data literature** (Nakamura-Steinsson V-shaped filter, Kehoe-Midrigan temporary-price-change filter); a recent paper compares four such filters against actual regular prices, found by search but the PDF would not parse [S: https://www.arxiv.org/pdf/2306.17309]. Same blocker (needs a series). Evidence that filters misclassify across store formats is in that paper's title/abstract only [S]. Do not build before the series exists.

## 3.7 Use a relationship between items only after it passes section 7 (each has a passing test on file)

**Method A (recommended first): ablation test on the bench, the relationship in or out.**
- What: a relationship (store brand ratio, bulk slope, chain level) is a parameter in the model. Fit the model with and without it on training products, score both on held-out products by interval score (see 7.2) and coverage (7.1). It passes only if the with-relationship model improves interval score with a paired, product-clustered bootstrap CI that excludes zero, and coverage stays in band. File the result next to the relationship.
- Evidence the relationships are real but variable: USDA ERS found private-label prices 21% below national brands in a recession period and 25% after, in two US chains over 14-month periods [V: https://ers.usda.gov/amber-waves/2012/march/food-retailers-adjust-private-label-prices]; PLMA industry surveys claim 33-35% basket savings [S, advocacy source, high bias risk]. A single global ratio would be wrong in some categories, so estimate it per category with pooling (3.2 Method A, a brand-tier coefficient) and let the test decide where it is used.
- Fit: Shin has almost no private-label groceries yet (liquor mostly; store brand identification needs a brand-to-chain map), so right now every grocery relationship fails to even have a test set. Under 3.7 that means they stay off, which is the requirement working as written.
- Cost 2 days of harness plus data collection.
- Pass test: the filed result exists, shows the with/without comparison on held-out products, and the relationship flag in code is off for any relationship with no filed passing result (a test that lists enabled relationships and asserts each has a result file).

**Method B: hedonic regression with attribute dummies** (private-label dummy, pack-size slope, chain effect on log price). The CPI practice: time-dummy hedonic regressions put items on one log scale with additive effects [V: StatCan https://www150.statcan.gc.ca/n1/pub/62-553-x/2023001/chap-7-eng.htm sec 7.22 for used cars]; Bajari et al 2025 hedonic prices powered by AI reported out-of-sample R^2 of 80-90% on Amazon apparel [S: https://arxiv.org/abs/2305.00044] (apparel, not grocery). Cost 3 days. Same ablation test applies.

**Method C: matched-pair ratios with bootstrap intervals.** For store-brand vs national brand inside one category and chain, compute the median log ratio over matched pairs, bootstrap a CI, and accept only if the CI excludes 1 and the ablation test passes. Cheapest to explain to him; weakest as a predictor. Cost 1 day.

## 3.8 Record on every answer: basis, how many prices, confidence, hierarchy version (100%)

**Method A (recommended first): schema-enforced answer table.** SQLite `STRICT` table with NOT NULL columns and CHECK constraints (`basis IN (...)`, `n >= 0`, `confidence IN ('high','medium','low')`), a hierarchy version column holding a content hash of the hierarchy file (git-style, so the version is the content), plus a request id. Validate with a schema library (zod) before the write. The record also stores the ids of the rows used (this serves 3.3, 3.6 and 1.7 tests).
- Evidence: none needed beyond the DB engine enforcing it; the test is that a bad insert fails.
- Fit: the stack is already SQLite. Cost 1 day.
- Pass test: `select count(*) from answers where basis is null or n is null or confidence is null or hierarchy_version is null` = 0, and reconcile `count(answers) = count(requests served)` so a missing record is visible as a count gap, not a null.

**Method B: record-per-model-version lineage as MLflow does** (run id, parameters, artifacts). Overkill for one server, but the idea (every output points at the exact model artifact) is the same as the hash column. https://mlflow.org [U]. Cost 0 (idea only).

## 3.9 Never change an answer already shown; store a better one separately (0 edits)

**Method A (recommended first): append-only table enforced by SQLite triggers.**
- What: `CREATE TRIGGER ... BEFORE UPDATE ON answers BEGIN SELECT RAISE(ABORT, 'answers are immutable'); END;` and the same for DELETE. A better answer is a new row with `supersedes_id`. SQLite docs: https://www.sqlite.org/lang_createtrigger.html [S for the RAISE form]; the pattern is described in general write-ups on audit-log immutability [S: https://qaskills.sh/blog/audit-log-testing-immutability-ordering].
- Fit: exact; cost 0.5 day.
- Pass test: the test tries UPDATE and DELETE and asserts both abort (it goes red the moment someone drops the trigger, which is its negative control). Add a count of triggers present to the rebuild check.

**Method B: tamper-evident hash chain.** Each row stores sha256(previous hash + row content); a verifier recomputes the chain nightly. Catches edits made with a trigger disabled or the file edited offline, which Method A cannot. Pattern described at https://appmaster.io/de/blog/manipulationssichere-audit-trails-postgresql-hashverkettung [S]. Cost 1 day.

**Method C: an immutable database (immudb)** https://github.com/codenotary/immudb [U]. Heavier than the problem; list only so the option is on file. Cost 3+ days and a new service.

---

# Section 7. Accuracy, checked on every rebuild

## 7.1 Honest ranges: 80% range holds 78-82% overall, within 5 points in every category with 30+ test items

**Method A (recommended first): split conformal on log price with Mondrian categories (per-category calibration), thin categories fall back to the parent.**
- What: take the existing log-price centre and spread; compute normalised residuals |log y - mu| / sigma on a calibration set of held-out products; per category take the ceil((n+1)(1-alpha))/n quantile of those; that quantile replaces the fixed 1.2816. Library: crepes (BSD-3 per the earlier research file [S], source https://github.com/henrikbostrom/crepes; docs [V] https://crepes.readthedocs.io/en/latest/getting_started.html) which has standard, normalised and Mondrian regressors; paper https://proceedings.mlr.press/v179/bostrom22a.html [S]. MAPIE https://mapie.readthedocs.io has split and CQR but no Mondrian class [V]. Theory: Angelopoulos and Bates https://arxiv.org/abs/2107.07511 [V from the PDF text]; per-group guarantee P(Y in C | G = g) >= 1 - alpha in the MAPIE docs [V].
- Evidence of a number: the calibration set size controls how much realised coverage wobbles: coverage given the calibration set is Beta(n+1-l, l), l = floor((n+1) alpha) [V formula in the paper]. For alpha 0.2 (computed from that formula): n=30 gives sd 7.0 points, n=100 gives 3.9, n=300 gives 2.3, n=1000 gives 1.3. The authors say n = 1000 calibration points is sufficient for most purposes [V]. So a category needs about 300 calibration items for the coverage to sit within +/-2.3 points (1 sd), and thin categories cannot be certified individually; they inherit the parent's multiplier.
- Fit: the guarantee is marginal and needs exchangeability between calibration and test. Calibrate on held-out PRODUCTS (grouped split), not held-out rows, or sibling rows leak and the coverage is inflated. Today's usable calibration set is the 654 leave-one-out items, 86% liquor, so no grocery category can be calibrated yet.
- Cost: 2-3 days for the bench harness; shipped artifact is a table of multipliers.
- Pass test: on the held-out test set, compute coverage overall and per category with Wilson intervals; pass overall if the interval lies within 78-82 (needs about 1,537 items, finding A); per category apply the band only to categories whose test n supports it. Negative control in 7.6.

**Method B: conformalized quantile regression** (CQR; Romano, Patterson, Candes, https://arxiv.org/abs/1905.03222 [S]) on top of LightGBM quantiles; MAPIE tutorial shows `MapieQuantileRegressor` adapting width to the price level: https://mapie.readthedocs.io/en/v0.8.5/examples_regression/4-tutorials/plot_cqr_tutorial.html [V in the earlier file]. Use if the model uses attributes beyond category (brand tier, size, chain). Cost 3 days.

**Method C: clustered conformal for many thin groups** (Ding et al. 2023, https://arxiv.org/abs/2306.09335 [S]): clusters groups with similar score distributions and calibrates per cluster; built for the case with many classes and little data per class, which is Shin's category tree. Gives a principled way to pool thin categories with similar spread instead of falling to the parent. Cost 3 days.

**Drift add-ons (use once there is a series):** adaptive conformal inference (Gibbs and Candes, https://arxiv.org/abs/2106.00170 [S], long-run coverage whatever the shift) and weighted conformal under covariate shift (Tibshirani et al., https://arxiv.org/abs/1904.06019 [S]) for the Ontario mix in 7.5.

## 7.2 Useful ranges: median high-to-low 1.5x or less on category-based answers

**Method A (recommended first): interval score as the one number, plus the width ratio reported beside it.**
- What: Winkler / interval score, IS = (u - l) + (2/alpha)(l - y) 1{y < l} + (2/alpha)(y - u) 1{y > u} (Gneiting and Raftery, JASA 2007, eq. 43 [S]); implementations https://scoringrules.readthedocs.io/en/latest/generated/scoringrules.interval_score.html [S]; it is five lines in TypeScript. Strictly proper, so narrowing without keeping coverage cannot win. The scoringutils vignette states the point that coverage and sharpness must be scored jointly (an always-wide range covers 100% and is useless) [V in earlier file].
- Pass test: report median(p90/p10) over category-based test answers with a bootstrap CI (pass if the upper CI bound is at most 1.5, or state the point estimate rule), computed AFTER conformal calibration (7.1) so the width is at honest coverage.
- Reachability check (finding D): 1.5x = sigma_log 0.158; the old category range was 0.335. Measure the achievable width first: the spread of the same item across stores (the 125 two-store barcodes) is the floor an own-price answer can reach; the spread of items within a leaf is the floor of a category answer. If a leaf's within-leaf spread already exceeds 0.158, only a split (1.3) can reach 1.5x, not any calibration method.

**Method B: difficulty-adaptive intervals** (crepes normalised conformal with a kNN-sigma difficulty estimate, or CQR) make easy items narrow and hard ones wide while holding coverage; MAPIE's tutorial: "CQR adapts to large prices" [V earlier file]. Cost 2 days.

**Method C: price-similarity clustering to build categories that are narrow by construction.** ONS CLIP clusters products into price-similar groups https://www.ons.gov.uk/economy/inflationandpriceindices/articles/researchindicesusingwebscrapedpricedata/clusteringlargedatasetsintopriceindicesclip [S via earlier file]. Feeds requirement 1.3, listed here because it is the only lever that lowers category-level width. Cost 4 days.

## 7.3 Separate good from bad: 70%+ of known sale prices land good or great

**Method A (recommended first): leave-the-sale-out replay with a specificity control.**
- What: for each of the 252 flagged sale rows (207 with a paired regular price), rebuild the answer for that item without any sale rows (and without that row), take the verdict zone, count good or great. Report with a Wilson interval (example, computed: 189 of 252 = 75% has 95% CI 69.3% to 80.0%, so a point estimate at 75% would not demonstrably clear 70% with this n). Add the control: the same replay on regular rows must NOT land good or great much more often than chance, else "call everything good" passes. Report sensitivity and false-good rate together (balanced accuracy, AUC; sklearn metrics).
- Needed first (finding F): the depth distribution of sales (price / paired regular price) from the 207 pairs, to see what share are 20%+ deep, which caps what any model can score.
- Evidence of fit: the bench already contains this test (`saleLowMin` 0.8, `regularFalseLowMax` 0.2; bar mismatch with the 70% in the requirement). Cost 1 day to align.

**Method B: validate the key first.** The sale-pairing key has errors: in the re-read sheet 13 of 45 re-read rows were marked wrong, 5 blank (a 29% rate on a sheet that is mostly flagged/odd rows, not a random sample). A 7.3 score computed against an unaudited key is meaningless; this is 7.7's job. Link, not a method.

## 7.4 Beat what exists: beat the 49.7% / 2.36x category range and Claude alone, by more than run-to-run noise

**Method A (recommended first): product-clustered paired bootstrap on per-item interval score, noise floor from repeated grouped splits.**
- What: score every method on the same held-out items; per item take score_new - score_old; bootstrap over PRODUCTS (not rows) for a CI on the mean difference (`scipy.stats.bootstrap` with `paired=True`, vectorised; https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.bootstrap.html [U url]). The noise floor is the sd of the metric across repeated random group splits with different seeds; "more than noise" = the lower CI bound is above zero AND the gain exceeds that sd. "Beats" must be one number (interval score) because the old range is 49.7% coverage at 2.36x, and a method with lower coverage and a narrower range is not comparable on two separate axes.
- Why not a plain paired t-test across random splits: Dietterich 1998 showed that test has high Type I error and recommended 5x2cv [S: https://web.engr.oregonstate.edu/~tgd/publications/dietterich-approximate-statistical-tests-nc1998.pdf]; Nadeau and Bengio 2003 give a variance correction for overlapping training sets [S via correctR/metricgate search results].
- Cost 1 day.

**Method B: 5x2cv or Nadeau-Bengio corrected resampled t-test** on the same scores. Standard, small-sample proof; mlxtend `paired_ttest_5x2cv` [U]. Cost 0.5 day. Use as a cross-check on A.

**Method C: "Claude alone" noise by repeated runs.** The LLM baseline is stochastic: run it K times per item (K = 5) and treat the run-to-run sd as that arm's noise floor; the comparison uses the mean score per item. Cost: items x K calls on the cheapest model, no web search (6.1 forbids search); for 300 items that is 1,500 calls. The pre-existing project rule that anything judged is judged by a clean process fits: score in a fresh process, not the session that built the system.

## 7.5 Test on unseen products and later dates, in the mix shoppers scan: held out by product and date, weighted to Ontario groceries

**Method A (recommended first): grouped split by product, forward-chaining by crawl date, purged at the boundary.**
- What: sklearn `GroupKFold` / `GroupShuffleSplit` on a normalised product key (barcode, else brand+name) and `TimeSeriesSplit` for later dates; docs state a shuffled k-fold on rows that are not independent gives "an inflated validation score" [V in earlier file: https://scikit-learn.org/stable/modules/cross_validation.html]. For leakage near the date boundary, purged k-fold with an embargo (Lopez de Prado, Advances in Financial ML) [U]. Add leave-brand-out as the hard version.
- Fit and blocker: no item has repeated dates (finding 2), so "later dates" is currently a split by crawl cohort and says nothing about drift. Start now: each crawl must write dated observations so a drift split exists in a few months. The bench already says `by_time` is impossible [V].
- Cost 1 day.

**Method B: importance weights to the shopper mix.** Post-stratify: weight each test item by (target share of its category) / (sample share). Target shares from StatCan CPI basket weights for Ontario [U: table id not verified] now, and from Shin's own scan log once it exists. Weighted metrics are weighted means of the per-item scores; weighted conformal (Tibshirani et al., https://arxiv.org/abs/1904.06019 [S]) keeps coverage valid under the shift. Weights are undefined where the sample has no rows (finding C). Cost 1 day.

**Method C: build an Ontario grocery holdout by survey design.** A stratified random sample of, say, 300 SKUs drawn in proportion to the CPI-weight strata, with shelf or web prices recorded and dated, sealed away from tuning (the bench already has a "sealed" split). Candidate sources that exist: Project Hammer CSV (8 vendors, one Toronto-area pickup location, no licence stated, so licence question open under 4.8) [V earlier file]; Open Prices (674 CAD prices of 319,561 total on 2026-10-01) [V earlier file]; StatCan table 18-10-0245-01, average retail prices by province for selected products, price levels not change [S]. Cost: collection effort, 2-3 days plus a licence check. Held-out data tuned against repeatedly stops being held-out: Bailey et al., "The Probability of Backtest Overfitting" [V in earlier file], so freeze before looking.

## 7.6 Prove the test works: shuffled prices fail; a whole-category range fails on width

**Method A (recommended first): three controls run in every rebuild: shuffled, known-bad, known-good.**
- What: (1) Shuffled: permute prices across items so item attributes no longer predict price; coverage must collapse and interval score must worsen sharply. Permutation tests for classifier performance: Ojala and Garriga, JMLR 2010 https://www.jmlr.org/papers/v11/ojala10a.html [S]; sklearn `permutation_test_score` https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.permutation_test_score.html [S]. Caution I derived: shuffle ACROSS categories (or across items), not within a category. Within a category the shuffled test set has the same distribution as the real one, so coverage stays nominal and the control cannot go red. (2) Known-bad: the whole-category range and the old 49.7% / 2.36x method; the test must fail them on width and coverage respectively. (3) Known-good: an oracle (true quantiles of the held-out set) or data simulated from a known hierarchical model, where honest coverage is guaranteed; the test must pass it. Simulation-based calibration (Talts et al. 2018, https://arxiv.org/abs/1804.06788 [U]) is the formal version.
- Pass test: each rebuild reports the three control outcomes; the run is invalid if any control gives the wrong colour (shuffled passes, bad passes, or good fails). This makes the rulings "a check is not a check until it has gone red, and not by its own hand" operational: the controls are created by the harness, not by the model being tested.
- Cost 1 day.

**Method B: mutation testing of the estimator itself.** Deliberately break it (halve sigma, swap two categories, ignore the sale flag) and check some test goes red. The mutation-testing-for-ML critique (https://arxiv.org/abs/2103.01341 [V in earlier file]) warns that the production/test boundary is blurry in data-driven systems, so define the mutations by hand (a short list) rather than auto-generating them. Cost 1 day.

## 7.7 Check the answer key by hand before scoring: under 2% wrong

**Method A (recommended first): stratified hand audit sized by the Clopper-Pearson bound, fresh sample every round.**
- What: draw a random sample stratified by source and key type, check each row against the original proof (receipt image, shelf tag, page), count errors, report an exact CI. Sizes to show under 2% at 95% (computed): 149 rows with 0 errors, 236 with 1, 313 with 2, 386 with 3. To estimate a 17.9% rate to +/-5 points takes about 226 rows. Fix-and-re-audit uses a NEW random sample each round; re-auditing the rows you just fixed gives a falsely low rate. The current sheet (50 rows, 44 random) can only prove under about 6% with zero errors. Industrial analogue: acceptance sampling plans (ISO 2859-1 / ANSI Z1.4, AQL) [U].
- Cost: the hand time is the cost, about 150-400 rows. Since the rulings say the key is checked "by hand" and a clean process or him can be the checker, rows can be split between him and a fresh `claude -p` reader, with disagreements going to him.

**Method B: let a detector find the errors, then hand-confirm.** Confident-learning flagging (cleanlab, https://github.com/cleanlab/cleanlab [U url]; Northcutt, Athalye, Mueller 2021 found 3.4% average label error across 10 benchmark test sets, 54% of algorithm-flagged items confirmed by people, and that about 6% extra mislabelling could reorder model rankings [V in earlier file]). For Shin the detector is mostly rule-based: sale price not below its regular price (the sheet's "sale 449 is not below its regular 399" flag), unit price implausible against the category by median absolute deviation, size/name conflict (the 473 ml vs 1750 ml case in the design doc). Use it to fix the 17.9% fast, NOT to measure the final rate (flagged rows are a biased sample; the bench itself says the flagged half alone cannot give a rate [V]). Cost 2 days.

**Method C: two independent labellers and an agreement statistic** (Cohen's kappa) on a subset, to estimate how often the "hand check" itself is wrong. Cost: second labeller's time.

## 7.8 Not serve a rebuild that fails 7.1 to 7.4; the last passing version stays (demonstrated once with a deliberately bad rebuild)

**Method A (recommended first): promotion gate with a pointer file, test suite as the gate.**
- What: the rebuild writes to a candidate directory; a gate script runs 7.1 to 7.4 plus the 7.6 controls; only on a full pass does it move a `current` pointer (a small file or a symlink; the server reads the pointer at start). On failure the pointer does not move, so the last passing version stays. The "demonstrate once" test: feed the gate a deliberately bad rebuild (for instance sigma halved) and show it is refused and the pointer unchanged; keep that run as the stored demonstration. Pattern = champion/challenger with a model registry alias; MLflow's validation thresholds do the same in code (`MetricThreshold` with absolute threshold, min_absolute_change vs a baseline model) https://mlflow.org/docs/latest/api_reference/_modules/mlflow/models/evaluation/validation.html [S]. For Shin, MLflow is a new service for a table of multipliers; the pointer file does the same job.
- Cost 1 day. Cite as a checklist: Breck et al., "The ML Test Score" rubric of production-readiness tests [U: https://research.google/pubs/the-ml-test-score-a-rubric-for-ml-production-readiness-and-technical-debt-reduction/].
- Pass test: the demonstration above, plus a CI check that fails if the served version's hash differs from the last passing record.

**Method B: sequential monitoring after release.** "Tracking the risk of a deployed model and detecting harmful distribution shifts" (https://arxiv.org/abs/2110.06177 [V in earlier file]) gives time-uniform confidence sequences for deciding whether a live coverage drop is real or noise; useful after launch when scans bring new observations. Cost 2 days; later.

**Method C: MLflow Model Registry with a `champion` alias** if models ever multiply (per-country, per-department). Not now.

---

## Recommended first method per requirement (one line each)

| Req | First method |
| --- | --- |
| 3.1 | Fuzz-proven total ladder, plus a request-vs-answer reconciliation |
| 3.2 | Empirical-Bayes partial pooling with estimated weight (replace the fixed k = 1), tested by leave-one-store-out on the two-store barcodes |
| 3.3 | Department-bounded backoff; drop or scope rung 8 `global_prior`; assert 0 such answers |
| 3.4 | Response-object invariant with a minimum log width taken from category spread |
| 3.5 | Same-size-band comparison plus learned per-category size slope; round-trip check on all items, 50-item hand check |
| 3.6 | Source sale flag, with the used-row ids logged and joined to `kind`; reference-price filter only when repeat observations exist |
| 3.7 | With/without ablation on held-out products, clustered bootstrap; relationship stays off until its result file exists |
| 3.8 | SQLite STRICT table with NOT NULL and CHECK constraints, hierarchy content hash, row ids used |
| 3.9 | Append-only SQLite triggers, `supersedes_id`; optional hash chain |
| 7.1 | Split conformal on log price, Mondrian by category (crepes), parents for thin groups, calibrated on held-out products |
| 7.2 | Interval (Winkler) score with median width; measure the achievable width floor first |
| 7.3 | Leave-the-sale-out replay with a specificity control and Wilson CI; measure sale depth first |
| 7.4 | Product-clustered paired bootstrap on interval score, noise floor from repeated grouped splits |
| 7.5 | Grouped by product, forward by crawl date, importance-weighted, plus a purpose-built Ontario holdout |
| 7.6 | Shuffled (across categories), known-bad and known-good controls run every rebuild |
| 7.7 | Stratified hand audit sized by Clopper-Pearson (149 / 236 / 313 rows), fresh sample each round |
| 7.8 | Gate script that moves a `current` pointer only on a full pass; demonstrate with a bad rebuild |

## Not verified or not found
- The 3.5x James-Stein figure, the 17.9% origin, the meaning of NB `base_price_cents`, StatCan basket-weight table id, ILO CPI Manual homogeneity text, crepes licence text, all [U].
- I did not open: Gneiting-Raftery eq. 43, Nakamura-Steinsson body text (only summaries), the 2306.17309 filters paper (PDF unparsed), Dietterich and Nadeau-Bengio full text, Talts SBC, MLflow docs beyond the validation source summary.
- No shipped consumer product or statistics agency found that publishes interval coverage for grocery price estimates (consistent with the earlier research file; absence not proven).
