# Shin research: price prediction, honest ranges, deal verdicts, test validity, Canadian law

Every item below was opened this session (WebSearch to find, then WebFetch to open). Items found
but not opened are listed separately at the end of each part. Where WebFetch could not extract
real page content (JS-rendered SPA, blocked, or binary PDF it could not parse), that is noted
explicitly rather than presented as a real finding.

---

## Part 1: Price prediction from attributes and text

### 1. Mercari Price Suggestion Challenge: Kaggle competition
- URL: https://www.kaggle.com/c/mercari-price-suggestion-challenge
- What it is: the reference Kaggle competition for predicting a resale-marketplace price from
  structured fields (category, brand, item condition, shipping) plus free-text name/description.
  Same shape of problem as Shin: sparse structured attributes + text, one price target.
- Note: the page is JS-rendered; WebFetch returned only the title, no dataset/metric detail could
  be extracted directly from this URL this session (confirmed via the GitHub solution repos below).
- Take for Shin: this is the closest public analogue to "predict a price from category + brand +
  size + free text": worth mining for feature engineering ideas (name/description text handling),
  not for a ready-made model.

### 2. Mercari 1st place solution: GitHub (pjankiewicz/mercari-solution)
- URL: https://github.com/pjankiewicz/mercari-solution
- What it is: winning team's (Paweł Jankiewicz & Konstantin Lopukhov) actual solution code and
  approach for the Mercari challenge.
- Accuracy figure, quoted: **"Final Score: RMSLE of 0.3733"**: achieved via a stacked ensemble
  (Huber regression + classification-based models across three differently-preprocessed dataset
  variants, weighted-averaged, e.g. "0.0604 * data1_huber + 0.1051 * data1_huber + 0.0911 *
  data1_clf..."). Evaluation metric was Root Mean Squared Logarithmic Error (RMSLE), i.e. the
  competition scored on log-price error, not raw dollar error: directly relevant since Shin's
  prices span cheap groceries to costlier electronics.
- Take for Shin: log-scale error metric (RMSLE) is the right family to benchmark a point-estimate
  price model against; ensembling multiple weak models beat any single strong model. Use for the
  point-prediction/scoring-metric side, not for uncertainty ranges (this competition scored point
  predictions only).

### 3. Grinsztajn, Oyallon & Varoquaux (2022): "Why do tree-based models still outperform deep
   learning on tabular data?"
- URL: https://arxiv.org/abs/2207.08815 (NeurIPS 2022, Datasets and Benchmarks track)
- Confirmed exact title and authors: Léo Grinsztajn, Edouard Oyallon, Gaël Varoquaux.
- What it is: a 45-dataset, ~20,000-compute-hour benchmark of tree ensembles (XGBoost, Random
  Forest) vs. deep nets on tabular data.
- Quoted finding: **"tree-based models remain state-of-the-art on medium-sized data (~10K
  samples) even without accounting for their superior speed."** Three inductive-bias reasons
  named: robustness to uninformative features, preserving data orientation, and learning
  irregular functions easily.
- Take for Shin: at ~15,000 price rows and a 4.3M-row catalogue (i.e. medium tabular data, not
  huge), this is direct evidence for choosing gradient-boosted trees over a neural net as the
  first real model, deferring NN approaches until data volume or embedding needs justify them.

### 4. Bambi hierarchical modeling notebook (bambinos.github.io)
- URL: https://bambinos.github.io/bambi/notebooks/hierarchical_binomial_bambi.html
- What it is: worked Bambi (PyMC wrapper) example of a hierarchical/multilevel model using
  formula syntax `(1|group)`.
- Take for Shin: concretely shows partial pooling: "players with extreme empirical [rates]...
  have their posterior estimates pulled toward the global mean" via `γᵢ ~ Normal(0, σ_γ)`: and
  gives the exact formula pattern (`outcome ~ 1 + (1|category) + (1|brand) + (1|store) +
  (1|region)`, or crossed `(1|category:brand)`) to build the candidate hierarchical price model
  described in the brief (category × brand × store × region × size × time).

### 5. "What Is in a Price? Estimating Willingness-to-Pay with Bayesian Hierarchical Models"
- URL: https://arxiv.org/abs/2509.11089
- What it is: uses a Bayesian Hierarchical Logit Model on choice-conjoint data (iPhone
  configurations) to estimate the dollar value of individual product features, producing a full
  posterior (not a point estimate) per feature.
- Take for Shin: a live example of a hierarchical Bayesian *pricing* model (not just a textbook
  toy), and a reminder that the hierarchy technique generalizes to any nested grouping (their
  individual-consumer level ↔ Shin's category/brand/store/region levels).

### 6. LightGBM for Quantile Regression (Towards Data Science)
- URL: https://towardsdatascience.com/lightgbm-for-quantile-regression-4288d0bb23fd/
- What it is: tutorial on using LightGBM's `objective='quantile'` / pinball loss with `alpha` to
  produce upper/lower/median quantile models (e.g. alpha 0.1/0.5/0.9).
- Take for Shin: this is literally the "gradient-boosted trees with quantile loss" candidate
  named in the brief, with the exact API (`LGBMRegressor(objective='quantile', alpha=...)`).
  Caveat found: the article's own worked example does not formally report coverage/interval-width
  numbers: it eyeballs a plot: so it is a how-to, not proof the method is well-calibrated
  out of the box (see Part 2 for that).

### 7. Mercari Price Suggestion Challenge writeup page (Kaggle "1st place solution")
- URL: https://www.kaggle.com/competitions/mercari-price-suggestion-challenge/writeups/pawe-and-konstantin-1st-place-solution
- Note: opened, but like the main competition page this is a JS-rendered Kaggle page; WebFetch
  could not extract body text (title only). The actual winning numbers/method came from the
  GitHub repo (#2) instead. Listed here only so the gap is explicit, not silently dropped.

**Not opened (found, not fetched):** Kaggle "Grocery Dataset" (elvinrustam/grocery-dataset,
scraped Costco listings) and "Retail Price Dataset" (omrastogi): both are JS-rendered Kaggle
dataset pages; one open attempt on the Grocery Dataset page returned title only, no fields/row
count, so it is not counted as a real finding.

---

## Part 2: Honest ranges / uncertainty

### 1. MAPIE: Conformalized Quantile Regression tutorial
- URL: https://mapie.readthedocs.io/en/v0.8.5/examples_regression/4-tutorials/plot_cqr_tutorial.html
- What it is: worked tutorial for `MapieQuantileRegressor` (CQR) using an LGBMRegressor with
  `objective="quantile"`, compared against naive / CV+ / Jackknife+-after-Bootstrap intervals.
- Quoted: target coverage set via `alpha=0.2` ("target coverage of 0.8"); result: "CQR better
  adapt[s] to large prices" with intervals "shorter when the estimator is more certain," while
  the naive/CV+ methods keep "fixed interval widths regardless of price level."
- Take for Shin: this is a directly reusable recipe: MAPIE's `ConformalizedQuantileRegressor` /
  `MapieQuantileRegressor` sits on top of the LightGBM quantile model from Part 1 and turns it
  into a range with a real finite-sample coverage guarantee instead of a raw 25th-75th percentile
  cut, which is exactly the failure mode described in the brief (49.7% actual coverage).

### 2. Romano, Patterson & Candès (2019): "Conformalized Quantile Regression"
- URL: https://arxiv.org/abs/1905.03222 (NeurIPS 2019)
- What it is: the original CQR paper MAPIE implements.
- Quoted: "valid coverage in finite samples, without making distributional assumptions"; method
  "tends to produce shorter intervals" than other conformal approaches by adapting width to
  local difficulty instead of using one constant width.
- Take for Shin: the theoretical backing for why CQR (not the current percentile-scaling method)
  is the right target: coverage guarantee holds regardless of how mis-specified the underlying
  quantile model is, which matters because Shin's category-level quantiles are noisy at low
  sample counts.

### 3. Chung, Neiswanger, Char & Schneider (2020): "Beyond Pinball Loss: Quantile Methods for
   Calibrated Uncertainty Quantification"
- URL: https://arxiv.org/abs/2011.09588
- What it is: critique of relying on pinball loss alone for quantile regression, proposing a
  calibration objective that works with any regression model and lets you trade off calibration
  vs. sharpness directly, rather than just minimizing pinball loss and hoping coverage follows.
- Take for Shin: a check on candidate #1 in the brief (LightGBM+quantile loss): pinball loss
  minimization does not by itself guarantee correct coverage; if Shin sees the same 49.7%-style
  miscalibration after switching to quantile GBM, this is the paper to go to next, not a bigger
  model.

### 4. Winkler / interval score: scoringutils (CRAN) vignette
- URL: https://cran.r-project.org/web/packages/scoringutils/vignettes/scoring-rules.html
- What it is: R package vignette on proper scoring rules for probabilistic/interval forecasts.
- Take for Shin: confirms the framing needed for evaluating any replacement range method -
  "scoring rules are usually negatively oriented... the best possible score is usually zero,"
  and that sharpness (narrow) and coverage (correct) must be scored jointly, not coverage alone
  (a range that's always [$0, $1000] gets 100% coverage and is useless). Caveat: this specific
  vignette page did not surface the actual interval-score/pinball formulas in the fetched
  content: treat as confirmation of the framing, not a formula reference; get the formulas from
  the Gneiting & Raftery / Winkler literature it cites.

### 5. Romano, Barber, Sabatti & Candès (2020): "With Malice Toward None: Assessing Uncertainty
   via Equalized Coverage"
- URL: https://arxiv.org/abs/1908.05428 (Harvard Data Science Review)
- What it is: extends conformal prediction so that coverage is equal across specified groups, not
  just marginally correct overall; works as "a wrapper around any predictive algorithm" with a
  distribution-free finite-sample guarantee.
- Take for Shin: apply "protected group" = product category or brand or store. This is the direct
  method for the calibration-by-subgroup requirement in the brief: check per-category coverage,
  not just overall coverage, since a range that's well-calibrated on average across 15,000 rows
  could still be badly wrong for, say, liquor vs. produce specifically.

### 6. "Equal Opportunity of Coverage in Fair Regression" (Binned Fair Quantile Regression, BFQR)
- URL: https://arxiv.org/abs/2311.02243
- What it is: follow-on to equalized coverage, arguing plain equalized coverage still breaks down
  for fine-grained subgroups, and proposing a post-processing calibration method (BFQR) that
  keeps intervals narrow while holding both per-group and population coverage near target.
- Take for Shin: a second-generation method if Part 2 item 5 (equalized coverage) turns out too
  conservative (too-wide intervals) once applied per fine category: useful precisely because
  Shin's category tree is deep and many leaf categories will be low-sample.

---

## Part 3: "Is this a good deal" verdicts shipped to consumers

### 1. CarGurus: Instant Market Value (IMV) / Deal Ratings
- URL: https://cargurus.helpscoutdocs.com/article/10-what-is-imv
- What it is: CarGurus' own help-center explanation of IMV, the estimate compared against listing
  price to produce the Great/Good/Fair/High/Overpriced deal rating shown to shoppers.
- Quoted: IMV is "an estimated fair retail price for a vehicle based on a detailed analysis of
  comparable current and previous car listings in your market," computed daily via "a complex
  algorithm that takes into account millions of data points including make, model, trim, year,
  mileage, options, and vehicle history." Explicit disclaimer: **"IMV is intended to provide
  pricing guidance but is not an official appraisal or guarantee"**: no accuracy/validation
  number is published anywhere on this page.
- Take for Shin: this is the closest existing product to Shin's own verdict UX (a five-bucket
  label derived from a fair-value estimate vs. observed price). Note what's missing: no published
  error rate, no stated sample-size floor per vehicle segment: i.e. even a shipped, trusted
  consumer product in this space does not publish the accuracy number Shin is being asked to be
  honest about. That absence is itself useful: it sets a (low) bar Shin can beat by publishing one.

### 2. Kelley Blue Book: Fair Purchase Price / Fair Market Range definitions
- URL: https://b2b.kbb.com/kbb-vehicle-values/definitions-of-our-values/
- What it is: KBB's own B2B definitions page for how Fair Purchase Price is derived.
- Quoted: "Updated weekly, the Kelley Blue Book Fair Purchase Price for new cars is generally the
  midpoint of the Fair Market Range," itself built from "Dealership Retail Sales Transactions /
  Economic Data / Consumer Search Analytics / OEM Incentive, Production, Search Data" (used cars
  add "Auction Sales Transactions," "Online Vehicle Listings," "Trade-In Marketplace Offers,"
  "Dealership Appraisals"). No validation methodology or accuracy figure is disclosed on this page.
- Take for Shin: KBB's range (Fair Market Range, with Fair Purchase Price as its midpoint) is
  structurally identical to what Shin is trying to build: a real range from real transaction
  data, refreshed on a fixed cadence, rather than a static percentile band. The listed data-source
  categories are a template for what Shin's own price rows should be tagged with (transaction vs.
  listing vs. auction vs. search-derived), which matters for weighting sources of different
  reliability.

### 3. Kayak Price Forecast: official FAQ
- URL: https://www.kayak.com/c/help/pricing/how-does-kayak-price-forecast-work.62022.faq
- What it is: Kayak's own explanation of its Book-now/Wait recommendation.
- Quoted: "We analyze these queries to forecast whether the price for a given destination and
  dates is likely to go up or down over the next seven days." On accuracy: **"Predictions based
  on past history can never be perfect, so we can't guarantee they'll be correct, which is why we
  also let you know the confidence of the statistical analysis."** States they track "a certain
  number of flights throughout the next seven days... and verify whether they turned out to be
  right or wrong": i.e. Kayak runs its own live backtest, but does not publish the resulting
  number on this page.
- Take for Shin: Kayak explicitly attaches a confidence/uncertainty label to each individual
  forecast rather than a single blanket accuracy percentage: same principle as pairing Shin's
  verdict with a per-item confidence (e.g. based on how many comparable price rows back it),
  not a single repo-wide accuracy claim.

### 4. Google Flights: price prediction help page (official)
- URL: https://support.google.com/travel/answer/7664728?hl=en
- What it is: Google's own support documentation for the "prices are low/typical/high" and
  "prices unlikely to drop" / "prices likely to increase" tips.
- Quoted: predictions are "based on an analysis of price trends of past flights," shown only
  "when Google Flights predicts with a high degree of confidence," with the explicit caveat
  "there is always a chance that future prices will not behave as we expect." No accuracy
  percentage is published on this official page (third-party estimates elsewhere cite very
  different self-reported numbers, e.g. mid-70s to 80%-plus, but none independently audited).
- Take for Shin: Google gates the tip on an internal confidence threshold: it suppresses the
  claim entirely rather than showing a low-confidence prediction. That's the "Unknown, and here
  is how to find out" pattern from Shin's own priority order 1: suppress the verdict below a
  confidence floor instead of forcing a Good/Bad label on a near-empty category.

### 5. Hopper price predictions: 95% accuracy claim, discussed
- URL: https://aiinstitute.hbs.edu/platform-digit/submission/to-wait-or-not-to-wait-hopper-takes-the-guesswork-out-of-flight-purchases/
- What it is: HBS Digital Innovation write-up on Hopper's price-prediction product.
- Quoted: **"The company claims that their predictions are 95% accurate,"** built from a
  "proprietary algorithm" trained on "over five billion price quotes every day" with "several
  trillion quotes" archived in total. The write-up explicitly flags that this figure has no
  independent verification and no stated methodology for how "accurate" is defined or measured.
- Take for Shin: a cautionary example, not a template: a large, well-known travel app is
  shipping an unaudited, self-reported accuracy number with no visible definition (accurate
  against what ground truth? measured how? what's excluded?). Shin's rule of "a zero result is
  UNKNOWN until something proves the search could have found a hit" is exactly the discipline
  Hopper's public claim is missing; do not copy this pattern even though it's a market leader.

### 6. Zillow Zestimate median error rate (opened via secondary source; Zillow's own pages
   returned HTTP 403 to WebFetch this session)
- URL opened: https://sacramentoappraisalblog.com/2019/05/01/two-things-to-understand-about-zillows-accuracy-rate/
  (a real-estate appraiser's analysis quoting Zillow's own published figures directly)
- Quoted from Zillow (as relayed by this source): median error rate "is 5% for the United
  States," measured by "comparing the final sale price to the Zestimate on or before the sale
  date": using the **most recent** Zestimate, not the original one made months earlier.
- Key methodological critique quoted: **"a median error rate means the Zestimate is within 5% of
  the purchase price only half the time"**: i.e. the other half is worse than 5%, and because
  Zillow re-scores using the most-recent (not original) estimate, the published number flatters
  Zillow's actual forward-looking predictive accuracy versus what a shopper saw when they first
  looked the home up. (I could not reach zillow.com/z/zestimate or zillow.com/learn directly -
  both returned 403 to the fetch tool: so the on-market-vs-off-market split (elsewhere reported
  as roughly 2% vs. 7-8%) is not independently confirmed from Zillow's own page this session;
  flag as needing a direct re-check, e.g. via browser rather than WebFetch.)
- Take for Shin: two lessons. (1) A median error/coverage number is easy to state and easy to
  misread: Shin should always publish "within X% Y% of the time," not just one summary number,
  and should say what Y is. (2) Using the most-recently-updated estimate (vs. the original
  estimate a user actually saw) as the accuracy denominator is a specific, named way to inflate a
  published accuracy figure: Shin's own eventual accuracy claims must be measured against the
  estimate as it existed when the shopper actually looked at the product, not a version updated
  after the fact.

**Not opened / attempted but no content retrieved:** Keepa (keepa.com: fetched, JS-rendered,
returned title only, no methodology text) and CamelCamelCamel (camelcamelcamel.com: WebFetch
returned HTTP 403). Both are relevant (price-history deal detection for Amazon) but nothing
substantive was actually opened this session; do not cite specific claims about either as
findings without a follow-up pass on a real backend (browser tool, not WebFetch).

---

## Part 4: Designing tests that can themselves be wrong

### 1. Northcutt, Athalye & Mueller (2021): "Pervasive Label Errors in Test Sets Destabilize
   Machine Learning Benchmarks"
- URL opened: https://l7.curtisnorthcutt.com/label-errors (project page with the findings;
  arXiv:2103.14749 is the paper itself: the raw PDF was also fetched but returned only binary
  stream data WebFetch could not parse, so the project page is the source actually used for the
  quotes below)
- Quoted: average of **3.4% label errors** across 10 widely-used test sets (vision/text/audio),
  with CIFAR-100 at ~6%, Amazon Reviews at ~4% (~390,000 mislabeled instances), even MNIST
  containing 15 confirmed errors, QuickDraw the worst at ~10%. Method: algorithmic "confident
  learning" flagging, then human (Mechanical Turk) validation, with 54% of flagged candidates
  confirmed as genuine errors.
- Quoted consequence: **"just 6% additional mislabeling could reverse ImageNet model rankings"**
 : one model's rank shifted from 1st to 29th once labels were corrected.
- Take for Shin (Part 4, but really underlies everything): the "ground truth" test set itself
  needs its own audit before trusting a leave-one-out coverage number. If Shin's real observed
  prices used as the answer key contain data-entry errors, stale prices, or wrong unit/size
  matches, a model can look worse (or a bad model look better) purely from label noise in the
  15,000-row price database: cleanlab (open-sourced by the same authors) is the direct tool to
  run against that price database before trusting any accuracy claim built on it.

### 2. scikit-learn: Cross-validation: evaluating estimator performance (official docs)
- URL: https://scikit-learn.org/stable/modules/cross_validation.html
- What it is: canonical reference on leakage-safe cross-validation, `GroupKFold`, `TimeSeriesSplit`.
- Quoted: standard shuffled k-fold "will likely lead to a model that is overfit and an inflated
  validation score" whenever rows aren't independent: e.g. rows ordered by time (as Shin's price
  history is) or grouped (multiple price rows per product/store). Also flags that
  `cross_val_predict` "is not an appropriate measure of generalization error" if misused for
  scoring.
- Take for Shin: any leave-one-out or k-fold check of the price-prediction model must group by
  product (and probably by store and by time window): otherwise the model is implicitly allowed
  to see a near-duplicate price row (same product, same store, adjacent week) in training while
  being tested on its twin, which would inflate the apparent 49.7%-style coverage number in either
  direction without meaning anything about real generalization.

### 3. Bailey, Borwein, López de Prado & Zhu: "The Probability of Backtest Overfitting" (PBO)
- URL: https://sdm.lbl.gov/oapapers/ssrn-id2507040-bailey.pdf (SSRN paper, PDF opened and parsed)
- What it is: statistical method (PBO) for estimating the probability that a backtested strategy's
  apparent performance is curve-fit noise rather than a real, generalizing pattern.
- Quoted framing: overfitting happens because "optimization algorithms exploit historical noise
  rather than discovering genuine market patterns," and the paper states plainly that **"many
  published backtests"** likely suffer from this.
- Take for Shin: directly transferable warning for iterating on the price-prediction model itself
 : if the hierarchical/GBM model is tuned repeatedly against the same 15,000-row backtest until
  its coverage number looks good, that number is contaminated by the same mechanism PBO
  quantifies. Any reported "coverage improved from 49.7% to X%" claim needs an *untouched* holdout
  batch (new price rows collected after the tuning was frozen), not a re-check on the same rows
  the model was iterated against.

### 4. "What Are We Really Testing in Mutation Testing for Machine Learning? A Critical
   Reflection"
- URL: https://arxiv.org/abs/2103.01341
- What it is: a critique of naively porting software-engineering mutation testing to ML systems.
- Quoted: classical mutation testing's "competent programmer hypothesis" and "coupling effect
  hypothesis" "do not trivially translate to ML system development," because "the distinction
  between production and test code is blurry" once training-produced models are involved.
- Take for Shin: relevant to the brief's own "mutation testing" candidate for validating the
  price-model test suite: do not blindly inject code mutations and check the price-model tests
  catch them; first define, explicitly, what "production code" vs. "test/label code" even means
  for a data-driven pricing model (e.g. is the category-tree scaling factor "production code" or
  is it effectively a label-generation step?), or the mutation score will measure nothing real.

### 5. Tracking the risk of a deployed model and detecting harmful distribution shifts (2021)
- URL: https://arxiv.org/abs/2110.06177
- What it is: sequential statistical testing method ("time-uniform confidence sequences") for
  telling a genuine, harmful performance drop apart from ordinary noise as new labeled data
  arrives continuously.
- Take for Shin: this is the backtesting-in-production analogue for after a price model ships -
  as new crowd receipts/store-website prices come in, this gives a principled way to decide
  "the model's coverage has really degraded, re-check it" versus "this week's batch is just noisy,"
  rather than eyeballing a moving accuracy number or over-reacting to a single bad week.

---

## Part 5: Canadian legal angle (Competition Bureau, price claims)

### 1. Competition Bureau Canada: Ordinary selling price (official)
- URL: https://competition-bureau.canada.ca/en/deceptive-marketing-practices/types-deceptive-marketing-practices/ordinary-selling-price
- Quoted: **"It is illegal to advertise fake discounts by promoting a made-up 'regular price.'"**
  Two tests for a valid reference/"regular" price: **Volume Test**: "More than 50% of sales of
  the product were at that price or higher within a reasonable period (usually within a year)";
  **Time Test**: "The product was offered for sale, in good faith, at that price or higher for a
  substantial period of time (usually within a year)." Also: "Avoid making ambiguous and
  unverifiable savings claims" even when no explicit regular price is stated (e.g. "20% off our
  regular price!").
- Take for Shin: Shin's verdict is not a discount claim about Shin's own price (it doesn't sell
  anything), but if a future version ever says something like "this store's regular price is
  inflated" or implies a merchant's posted "regular"/"was" price is fake, that specific
  representation is squarely inside this provision and would need Volume/Time-Test-grade evidence
  behind it, not just Shin's own predicted range. A pure "this shelf price looks high/low relative
  to the market" verdict (no claim about the store's own regular/sale price) sits outside this
  specific provision, but see item 2 for the broader "general impression" standard.

### 2. BLG: "Discount Deception: Demystifying Ordinary Selling Price Claims under the Canadian
   Competition Act" (2025)
- URL: https://www.blg.com/en/insights/2025/05/discount-deception-demystifying-ordinary-selling-price-claims-under-the-canadian-competition-act
- Quoted: the Bureau is "increasingly cracking down on potentially misleading pricing practices,
  particularly where claims may misrepresent the nature and duration of promotions and ordinary
  selling prices." Compliance requires satisfying either the Volume Test (50%+ of sales at that
  price or higher in the past year) or Time Test (offered at that price for more than 50% of the
  preceding six months). Crucially: **"both the literal meaning and general impressions" of a
  price representation matter: a claim can be misleading even if technically accurate**, judged
  by whether it creates a false general impression, not whether anyone was actually deceived.
  Penalties: administrative fines up to $10 million or 3% of global annual revenue, with
  potential criminal liability (up to 14 years) in egregious cases.
- Take for Shin: the "general impression" standard is the one that actually reaches a verdict app
 : a "Good Deal" / "Bad Deal" label read by a shopper creates an impression regardless of how
  the backend computed it, so if the underlying range is as wide/unreliable as the current 49.7%
  coverage check shows, shipping a confident-looking verdict on top of it is closer to the kind of
  "general impression" risk this doctrine targets than the narrower "fake regular price" scenario
  in item 1: one more reason (on top of decision-quality grounds) to suppress or hedge the
  verdict below a confidence floor rather than force a label.

---

## Item counts
- Part 1 (price prediction from attributes/text): 7 opened, 2 not opened
- Part 2 (honest ranges / uncertainty): 6 opened
- Part 3 (deal verdicts shipped to consumers): 6 opened, 2 not opened
- Part 4 (tests that can themselves be wrong): 5 opened
- Part 5 (Canadian legal): 2 opened
