# Category / price-range research (web only, 2026-10-01)

Legend: [V] = I opened the source or ran the data myself. [S] = taken from a search-result summary only, source page not opened. [U] = could not verify.

## 1. Taxonomies usable as the category tree

1. **Google Product Taxonomy** [V, downloaded and counted]
   - URL: https://www.google.com/basepages/producttype/taxonomy.en-US.txt (explainer: https://support.google.com/merchants/answer/6324436)
   - File version header 2021-09-21; 5,595 paths. "Food, Beverages & Tobacco" has 364 paths, max depth 6 (3 at depth 2, 40 at 3, 163 at 4, 130 at 5, 27 at 6). Apples are at depth 5 (Food Items > Fruits & Vegetables > Fresh & Frozen Fruits > Apples).
   - **Wine is a leaf** ("Beverages > Alcoholic Beverages > Wine"), no children. Spirits split by type only.
   - Licence: [U] file states none; publicly downloadable for Merchant Center use. Check before redistributing.
   - Gives: a free, flat-ish, shopper-friendly top of the tree, but it will NOT supply the wine subdivision. The price-dispersion split has to come from elsewhere.

2. **GS1 GPC (Global Product Classification)** [S + partial V]
   - URL: https://www.gs1.org/standards/gpc (returned 403 to my fetcher); browser: https://www.gs1.org/articles/gpc-browser-makes-standards-more-accessible ; overview https://product.okfn.org/gs1-product-classification/index.html
   - 4 levels: Segment, Family, Class, Brick; bricks carry **attribute types and values** on top. Updated twice a year. Free to download from gs1.org (okfn page and search summary say "freely available"); exact licence text [U].
   - Worked wine example [S]: Segment 50000000 Food/Bev/Tobacco > Family 50200000 Beverages > Class 50202200 Alcoholic Beverages > Brick 10000276 "Wine - Still"; attributes include Colour of Wine, Grape Variety, Origin of Wine. Source: https://www.gs1au.org/services/data-and-content/national-product-catalogue/npc-data-dictionary/data-attribute/gpc-attribute-type-code
   - Gives: the only tree here whose below-brick split dimensions (colour, grape, origin) are already named for wine. Also the taxonomy retailers' barcode feeds actually use, so mapping scanned items to it is plausible.
   - "~40,000 categories" figure is from a search summary of a third-party guide (https://wisepim.com/guides/product-taxonomy/gs1-gpc) [U].

3. **Open Food Facts categories taxonomy** [V, downloaded and parsed]
   - URL: https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/taxonomies/food/categories.txt (docs: https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/)
   - 9,254 English category entries, multilingual (incl. French, useful for Canada), a DAG (entries can have several parents). Depth by shortest path to a root: up to 11 levels, most entries at depth 3 to 4 (my parse, approximate because of multiple parents).
   - Wine is subdivided: Wines > Red/White/Sparkling/Dessert/Flavoured/Non-alcoholic, then appellation (Bordeaux wines, Medoc wines depth 7 in my count), plus % alcohol entries (e.g. "12% red wine").
   - Licence: database is ODbL (share-alike on derived databases), contents DbCL. Whether the taxonomy file itself falls under ODbL or a code licence [U].
   - Gives: the deepest free tree and it already splits wine and fruit. Share-alike is the cost: a published derived category DB must stay ODbL.

4. **COICOP 2018** (UN) [S]
   - URL: https://unstats.un.org/unsd/statcom/49th-session/documents/BG-Item3l-COICOP-E.pdf
   - 15 divisions / 63 groups / 187 classes / 337 subclasses, plus an official 6-digit extension for food (Division 01). Too coarse alone, but it is the tree statistics agencies' price indices use, so any imputation benchmark from CPI literature maps to it.
   - Gives: a bridge to CPI-style class definitions and weights.

5. **NAPCS Canada (StatCan)** [S]
   - URL: https://www.statcan.gc.ca/en/subjects/standard/napcs/2012/introduction2
   - 7-digit, 4 levels: 156 groups, 506 classes, 1,389 subclasses, 2,635 details (2012 v1.2). StatCan classifies scanner-data product descriptions to NAPCS with ML (https://statcan.gc.ca/en/data-science/projects) [S].
   - Gives: Canadian-official product tree plus a precedent for text-to-category classification of retailer item names.

6. **UNSPSC** [S]: https://en.wikipedia.org/wiki/UNSPSC. 4 levels, 158,448 items (v26.0801), "free of licensing fees" per Wikipedia summary. Procurement-oriented, thin on grocery detail; I would skip it.

## 2. Methods for splitting by price dispersion and borrowing across levels

1. **Multilevel / hierarchical Bayes with partial pooling on log price** (category > subcategory > brand > item random intercepts).
   - Gelman and Hill, *Data Analysis Using Regression and Multilevel/Hierarchical Models* (2006), has a section on predictions for new observations and new groups [S]. Book PDF mirror: https://www.stat.cmu.edu/~brian/valerie/617-2022/0%20-%20books/0521867061%20-%20Andrew%20Gelman%20-%20Data%20Analysis%20Using%20Regression%20and%20Multilevel~Hierarchical%20Models%20%5b2006%5d.PDF
   - Libraries (not opened, standard): lme4, brms, Stan, PyMC, statsmodels MixedLM [U on versions].
   - Gives: exactly the "broad when thin, narrow as data grows" behaviour. Children with few items shrink toward the parent mean; with many items they stand alone. A new unpriced item's predictive distribution is parent mean plus within-group spread. (My inference, not from a source: two parts to the width, the uncertainty of the category mean, which shrinks with data, and the spread of items inside the category, which does not. The second is the range shown to the shopper, so a tight range needs a split, not more data.)

2. **Empirical Bayes / James-Stein**: Efron and Morris, "Data analysis using Stein's estimator and its generalizations," JASA 1975. https://www.medicine.mcgill.ca/epidemiology/hanley/bios602/MultilevelData/EfronMorrisJASA1975.pdf [S, search hit]. Gives: a cheap non-MCMC way to set the per-category shrinkage weight from the data (precision-weighted average of category mean and parent mean).

3. **Shrinkage along a product tree in retail data**: Smith and Griffin, "Shrinkage priors for high-dimensional demand estimation," Quantitative Marketing and Economics, 2022, doi 10.1007/s11129-022-09260-7 (title and authors checked via Crossref [V]). Hierarchical global-local priors where shrinkage follows the product classification tree and goes toward the higher-level group, not toward zero. Gives: a published precedent for "shrink to the parent category" on retail scanner data, with sparsity so only categories that really differ break away from the parent (this is the "split when dispersion justifies it" mechanism). Their target is elasticities, not price levels [S on abstract].

4. **Tree-based splitting**: Chipman and McCulloch, "Hierarchical priors for Bayesian CART shrinkage," Statistics and Computing, 2000 (Crossref [V]). doi 10.1023/A:1008980332240. Gives: shrinkage inside a regression tree. Plain CART/gradient boosting on log price (variance-reduction splits) is the non-Bayesian equivalent; sklearn/LightGBM quantile loss gives intervals [U, standard].

5. **Hedonic regression on product attributes, ML flavour**: Bajari et al., "Hedonic Prices and Quality Adjusted Price Indices Powered by AI," J. Econometrics 251 (2025), https://arxiv.org/pdf/2305.00044 [S]. Neural-net attributes from text and images; out-of-sample R^2 80 to 90% on Amazon apparel (apparel, not grocery). Gives: attribute-based prediction of a price for an item with no price, and the framing that out-of-sample R^2 is how it was judged.

6. **Known price ratios between products** (my mapping, [U] as a single source).
   - CPI practice: time-product-dummy and hedonic time-dummy regressions put every item on one log scale with additive item effects, so a ratio between two products is a coefficient difference that transfers to a third item with the same attributes. StatCan describes a time-dummy hedonic method for used cars (https://www150.statcan.gc.ca/n1/pub/62-553-x/2023001/chap-7-eng.htm, sec 7.22) [V].
   - Pack size: unit price usually falls with pack size (quantity discounts), sometimes rises. Evidence base: https://pubsonline.informs.org/doi/10.1287/mksc.1080.0381 and https://ageconsearch.umn.edu/record/21419/files/sp06ab01.pdf [S titles only]. Gives: do not assume a flat per-100 g price across sizes; model size as an attribute inside the category.

## 3. How shipped products and statistics agencies do it

**Data sources the app could borrow**
- **Open Prices (Open Food Facts)**: crowdsourced receipts and price tags, REST API https://prices.openfoodfacts.org/api/v1/prices , dataset on https://huggingface.co/datasets/openfoodfacts/open-prices and https://www.data.gouv.fr/datasets/open-prices ; ODbL. [V, queried the API 2026-10-01]. Fields include price, currency, `price_per` (e.g. KILOGRAM, UNIT), proof type (RECEIPT, PRICE_TAG), and `category_tag` for products with no barcode (fruit and vegetables), using the OFF category taxonomy. **Canada is thin: the API returned 674 prices with currency=CAD, against 319,561 total** (the country-code filter name I tried was silently ignored, so the CAD count is the one I trust). Gives: the exact schema for per-unit prices with a confidence-bearing proof type, and a ready category_tag to join to taxonomy 3.
- **Project Hammer** (scraped Canadian grocery prices): https://jacobfilipp.com/hammer/ [V]. 8 vendors (Voila, T&T, Loblaws, No Frills, Metro, Galleria, Walmart, Save-On-Foods), from 2024-02-28, CSV/SQLite, columns include price, old price, price per unit, unit size, brand, UPC. Licence stated nowhere on the page [V]; caveats on the page: one Toronto-area pickup location, duplicates, unstable SKUs, UPC reliability varies by vendor. Gives: a Canadian training/evaluation set for ratios and spreads, with a legal question to settle before using it commercially.
- **StatCan average retail prices, table 18-10-0245-01**: scanner-data-based monthly average prices for selected products, by province; StatCan says use for price levels, not for price change. [S] https://www150.statcan.gc.ca/n1/daily-quotidien/250702/dq250702a-eng.htm . Gives: an official anchor to check category medians against (list is of selected products only).

**Shipped consumer products** (none of these, as far as I could find, estimate a price for an unpriced item; absence not proven)
- **Flipp**: Canadian flyer aggregator, search by item shows current deals near a postal code; watch lists [S]. https://apps.apple.com/ca/app/flipp-flyers-shopping-deals/id725097967 . I found nothing on price history or ranges.
- **Basket (Canada)**: [U] nothing found.
- **Keepa / CamelCamelCamel**: price-history charts built by tracking Amazon pages [S, from third-party blog posts, low reliability]. Gives: the "history" side only.
- **PriceSpy**: retailer product feeds, updated 3 to 5 times a day, stores price history [S] https://pricespy.ie/information/faq . Gives: data-source confidence idea (feed vs scrape vs crowd).
- **Google Flights price insights**: labels a fare low / typical / high against historical prices; exact method not published [S] https://venturebeat.com/technology/google-brings-airfare-insights-and-travel-recommendations-to-trips . Gives: the product pattern of showing a typical range plus a verdict.
- **Zillow Zestimate**: closest shipped analog of "estimate a price you were not told, publish its error." Headline metric is median absolute percent error of the estimate made just before the sale versus the sale price over a 3-month window, and the share within 5%, 10%, 20% of the sale price [S] https://www.zillow.com/zestimate/ and https://www.zillow.com/research/putting-accuracy-in-context-3255/amp/ . Quoted 1.83% (on-market) and 7.01% (off-market) national medians come from search summaries [U]. Gives: a metric set and the point that accuracy differs sharply with data richness.

**Statistics agencies (missing-price imputation)**
- **Statistics Canada CPI Reference Paper, chapter 7**: https://www150.statcan.gc.ca/n1/pub/62-553-x/2023001/chap-7-eng.htm [V via fetch]. "Overall mean imputation" (sec 7.8): price movement for an entering item is the average movement of all other items of the same representative product; link-to-show-no-change (sec 7.9) is being reduced because it makes prices look too stable; hedonic regressions used for a short list (computers, rent, used cars, cell services, internet). Chapter 5 https://www150.statcan.gc.ca/n1/pub/62-553-x/2023001/chap-5-eng.htm : for heterogeneous low-weight aggregates, price movement is imputed from a donor class [S]. Gives: official endorsement of "use the class average for an item with no price," and a named failure mode (carry-forward understates change).
- **BLS CPI missing-price study**: https://www.bls.gov/osmr/research-papers/2018/st180110.htm [V abstract only]. Tests whether missing prices are MCAR / MAR / MNAR and evaluates group-mean imputation with periodic group redefinition. BLS imputation order (same-area cell mean, then other-area cell mean, then carry-forward) came from a search summary and I did not locate its source page [U]. Gives: the warning that missingness is not random (a price you lack is not a random draw), which matters for crowd data where cheap and sale items get recorded more.
- **ILO CPI Manual 2020, chap. 6**: explicit vs implicit imputation, self-correcting overall mean imputation [S via https://search.r-project.org/CRAN/refmans/piar/html/impute_prices.html]. I did not open the manual itself [U].
- **Eurostat Practical Guide for Processing Supermarket Scanner Data (2017)**: EAN-to-COICOP mapping, unit values [S]; listed at https://ec.europa.eu/eurostat/web/hicp/publications [U on direct PDF URL].
- **ONS**: classification of new data sources with ML (https://www.ons.gov.uk/economy/inflationandpriceindices/articles/classificationofnewdatainukconsumerpricestatistics/2021-04-06) and CLIP, which clusters products into price-similar groups with unsupervised plus supervised methods (https://www.ons.gov.uk/economy/inflationandpriceindices/articles/researchindicesusingwebscrapedpricedata/clusteringlargedatasetsintopriceindicesclip) [S]. Gives: the closest official precedent for building categories from price behaviour rather than from a fixed taxonomy.
- **How agencies measure accuracy**: I did not find any agency publishing interval coverage or width for imputed grocery prices [U, not found is not the same as absent]. The CPI literature judges imputation by index bias and by missingness diagnostics, not by prediction intervals. So the coverage tests below have no CPI template to copy; they come from forecasting statistics.

## 4. Standard checks for a prediction-interval system

1. **Split conformal / distribution-free coverage**: Angelopoulos and Bates, "A Gentle Introduction to Conformal Prediction and Distribution-Free Uncertainty Quantification," https://arxiv.org/abs/2107.07511 [S]. Gives: wrap any model (even a plain category quantile) so that intervals cover the true price at least 1-alpha of the time on exchangeable held-out data.
2. **Conformalized Quantile Regression**: Romano, Patterson, Candes, NeurIPS 2019, https://arxiv.org/abs/1905.03222 [S]. Gives: intervals whose width adapts to category dispersion while keeping the coverage guarantee.
3. **Mondrian conformal (per-category coverage)**: Vovk et al. 2003; explained in MAPIE docs https://mapie.readthedocs.io/en/latest/content/conformal-prediction/conditional-guarantees/ [V]. Coverage guaranteed within each disjoint group, not just overall. MAPIE has no dedicated Mondrian class (docs say to split by group and calibrate per group) [V]. Gives: the fix for "90% overall but 60% for wine." Needs enough calibration items per category; thin categories must fall back to the parent.
4. **Libraries**: MAPIE (https://mapie.readthedocs.io/en/latest/api/ ; split, cross, CQR, jackknife+) [S]; **crepes** (https://pypi.org/project/crepes/ ; BSD-3; standard, normalized and Mondrian conformal regressors and predictive systems) [S].
5. **Calibration and sharpness diagnostics**: Gneiting, Balabdaoui, Raftery, "Probabilistic forecasts, calibration and sharpness," JRSS-B 2007 (PIT histogram, marginal calibration, sharpness diagram) https://sites.stat.washington.edu/people/raftery/Research/PDF/Gneiting2007jrssb.pdf [S].
6. **Interval score (Winkler) and proper scoring**: Gneiting and Raftery, "Strictly proper scoring rules, prediction, and estimation," JASA 2007, eq. 43. Implementations: https://scoringrules.readthedocs.io/en/latest/generated/scoringrules.interval_score.html and https://www.rdocumentation.org/packages/scoringutils/versions/2.1.1/topics/interval_score [S]. Gives: ONE number that punishes both width and misses, so narrowing cannot hide as a win.
7. **Checklist assembled from the above (my synthesis)**: empirical coverage at 80% and 90% overall AND per category and per data-source tier; mean/median width in log units (or as a high/low ratio); interval score; MAPE or median absolute percent error of the midpoint on log price, Zillow-style, with share within 10/20/30%; reliability by number of priced items in the category (coverage should hold while width falls as n rises); baselines to beat (parent-category median, then global grocery median per unit); the split must be by held-out ITEM (leave-item-out, and leave-brand-out for the harder case), never by row, or priced siblings leak; time-based split too, since prices drift; a negative control (a deliberately wrong tree, e.g. shuffled categories, should show wider intervals and worse score, otherwise the check cannot go red).

## Not found / could not verify
- GPC licence text; Google taxonomy licence; whether the OFF taxonomy file is ODbL or code-licensed.
- Any shipped consumer app that states an estimated range for an unpriced grocery item.
- Any agency report of interval coverage for imputed prices.
- Basket app details; Flipp price-history details.
- Exact Zillow numbers (summaries only).
