# Methods for requirements 6.1-6.7 and 8.1-8.4 (Shin), researched 2026-10-01

Scope: C:\shin\docs\price-category-requirements-2026-10-01.md sections 6 and 8. Known ground not repeated: conformal/CQR/interval score/hierarchical Bayes/test-validity are already in C:\shin\research\price-system-references-prediction-verdict-2026-09-28.md (Part 1 items 4-5, Part 2 items 1-6, Part 4); the ladder, the log-price bell and the response contract are in docs/verdict-distribution-design-2026-09-30.md; per-scan cost of the Gemini path ($0.062) is in docs/unit-economics-2026-09-22.md.

"Verified" below means I opened the page this session. "Unverified" means from memory or a search snippet only.

## Facts that apply to every requirement

1. **Cheapest current Claude model: Claude Haiku 4.5, id `claude-haiku-4-5`.** $1 input / $5 output per MTok; 5-minute cache write $1.25, cache read $0.10; Batch API $0.50 / $2.50 (50 percent off). Verified: https://platform.claude.com/docs/en/about-claude/pricing. The only cheaper listed row is Haiku 3.5 ($0.80/$4), marked "retired, except on Bedrock and Google Cloud", so it is not a first-party option. Context 200K, 64K max output (the skill's cached model table, 2026-09-25; unverified on the live Models page).
2. **Prompt caching does not help this call.** Minimum cacheable prefix on Haiku 4.5 is 4,096 tokens (verified, https://platform.claude.com/docs/en/build-with-claude/prompt-caching). A price-range prompt is a few hundred tokens, so a cache marker silently does nothing. Padding to 4,096 tokens would cost 4,096 x $0.10/MTok = $0.0004 per hit, more than the whole uncached call.
3. **Batch API cannot serve a live scan** (asynchronous, "most batches finishing in less than 1 hour", verified, https://platform.claude.com/docs/en/build-with-claude/batch-processing). It can pre-fill the estimate table for items likely to be scanned (see 6.4, 8.2).
4. **Per-call cost, my arithmetic, not measured:** assume 300 input and 60 output tokens. 300 x $1/1M + 60 x $5/1M = $0.0003 + $0.0003 = **$0.0006 (0.06 cents) per call**; $0.0003 in batch. The Gemini grounded path in the repo is $0.062 a scan, about 100x more. Real tokens must come from `response.usage` on the first 50 calls.
5. **No published benchmark covers "zero-shot, no-search LLM, Canadian grocery price".** I found none. The closest numbers are below; none is a grocery number. So the accuracy of Claude here is UNKNOWN until Shin's own bench measures it (requirement 7.4 already says to beat "Claude alone").
   - Few-shot Claude-3.5-Sonnet, MAPE on Amazon product prices: 38.5 percent, against 16.86 percent for a fine-tuned Mistral-7B quantile model (Amazon Products 500K train rows); on used cars 275 percent, boats 30 percent. Verified: https://arxiv.org/html/2506.06657v1 (Quantile Regression with LLMs for Price Prediction, ACL Findings 2025). Few-shot, with examples, so a zero-shot number would likely be no better (inference, unverified).
   - LLM "optimal price" predictions were above survey-derived prices in 81 percent of cases, often by more than 25 percent (six LLMs, one premium CPG product, willingness-to-pay, not shelf price). Verified: https://aapor.org/newsletters/can-generative-ai-replace-market-research-not-yet/. Suggests an upward bias to test for in Shin's bench, not a grocery measurement.
   - A "Price Is Right" benchmark repo exists (https://github.com/pymc-labs/PriceIsRightLLM, 19 models, MAPE/over-bid rate) but its README publishes no numbers (verified). Usable as a harness idea only.
6. **Raw LLM intervals are far too narrow; this is the best-documented finding and it hits 6.5/6.6 directly.**
   - FermiEval (500 train + 500 test Fermi questions; GPT-4o-mini, Claude-3.5-Haiku, Grok-3-mini): nominal 90 percent intervals covered about 28-31 percent, 95 percent covered 56-64 percent, 99 percent covered about 65 percent. Split-conformal recalibration restored near-nominal coverage and cut Winkler score 25.2 percent (90), 27.8 percent (95), 59.4 percent (99). Verified: https://arxiv.org/html/2510.26995v1.
   - "Bayesian Elicitation with LLMs" (9 LLMs incl. Claude Opus/Sonnet/Haiku 4.5, 3 effort levels, population statistics): raw 95 percent intervals covered 9-44 percent; conformal quantiles were typically 2 to 5, i.e. intervals had to be 2-5x wider. Verified: https://arxiv.org/html/2604.01896v1. Extra "reasoning" effort did not reliably fix it.
   - Consequence for Shin: Claude's low/high must NOT be read as a true p10/p90 (the verdict design currently does exactly that, "low/high read as p10/p90"). Treat them as an uncalibrated hint and widen by a factor learned from scored pairs (6.5).

---

## 6.1 Call Claude only when the catalogue cannot produce a range; cheapest model; no web search; under the monthly cap

Pass test: 0 calls with a search tool; 0 calls where a range existed.

### Method A (recommended first): single guarded call function plus a request-capture test
- What: one function `claudeRange(item)` is the only code that touches the Anthropic SDK. It (1) re-runs the ladder rungs 1-5 and returns early if any gives a basis, (2) checks the month counter and daily/hard dollar caps, (3) builds the request with a hard-coded model constant `claude-haiku-4-5`, a `max_tokens` of about 120, and NO `tools` key and no `tool_choice`. Web search is a server tool that runs only when declared in `tools` (verified: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool, "When you add the web search tool to your API request"). Omitting `tools` also avoids the 496-token tool-use system prompt Haiku 4.5 adds when any tool is present (verified, pricing page tool-use table).
- Evidence it works: documentation-level guarantee only. Shin already caps spend with a counter (RULINGS "Model spend cap", identify/src/cap.ts) and already limits a model call by timeout/retry (RULINGS ~line 611), so this is an extension of an existing pattern.
- Fit: direct. Cost: nothing at runtime. Pitfall: stop at "tools omitted", but also reject a response if `usage.server_tool_use` is present or any content block is not `text` (belt and braces).
- How to run the pass test: (a) unit test with a fake HTTP transport that captures every outgoing body and fails if it contains `tools`, `tool_choice`, or any string starting `web_`; (b) replay: take N=1,000 logged scans, snapshot the catalogue as of each scan, and count Claude calls whose catalogue-ladder re-run returns a range (must be 0); (c) negative control (his rule 09-12): add a deliberate `tools:[{type:"web_search_20250305",...}]` and confirm test (a) goes red.

### Method B: organisation-level kill of web search in the Claude Console
- What: an admin can disable web search for the whole organisation in Console settings; a request that includes the tool then fails with 400 `invalid_request_error` "web search is not enabled" (verified quote, same web-search docs page, https://platform.claude.com/settings/capabilities). Applies to Messages API only.
- Evidence: documented behaviour. Fit: strongest guarantee because it holds even if the code regresses. Cost: none. Caveat: org-wide, so it also blocks any other Anthropic web-search use on that account (Jamin's other projects), so check that before flipping it; a separate organisation would avoid that.
- Pass test: send one request WITH the tool from a test script; expect HTTP 400. That is the "check goes red" proof for "0 calls with a search tool".

### Method C: separate workspace with a Console spend limit as the cap backstop
- What: put Shin's key in its own workspace; a workspace can have a monthly spend limit and rate limits (verified, https://platform.claude.com/docs/en/manage-claude/workspaces, "Spend limits ... cap monthly spending"). At the limit the API returns 400 (verified, https://platform.claude.com/docs/en/api/errors). Note: you cannot set limits on the Default Workspace.
- Fit: enforces "under the monthly cap" outside the code. Cost: none. Test: set the limit very low in a scratch workspace and confirm the 400, then confirm 6.7's fallback fires on it.

---

## 6.2 Store every Claude answer with item, model, date and category

Pass test: 100% stored.

### Method A (recommended first): append-only `estimates` table, written before the answer returns
- What: one row per call: item key, `category_path` + hierarchy version, model id as requested AND the `model` string returned in the response, prompt version hash, `request-id` response header (verified present on every response, errors page), `anthropic-workspace-id` header, created_at, low/typical/high, currency, raw response text, input/output tokens, outcome (ok / parse_fail / capped). Never updated, matching 3.9.
- Evidence: standard audit-log practice; the field set mirrors W3C PROV-O: Entity (the estimate) wasGeneratedBy Activity (the call) wasAttributedTo Agent (model) (verified definitions, https://www.w3.org/TR/prov-o/).
- Fit: Shin already stores scan rows with basis and confidence. Cost: negligible.
- Pass test: reconcile counts. Count of `request-id`s in the app log of outgoing calls must equal rows in `estimates` (including failed parses), for 100 test scans and then weekly. Also a kill test: make the DB write throw and confirm the call is not billed silently, i.e. the answer is withheld or the failure is logged as a red alert.

### Method B: reuse OpenTelemetry GenAI attribute names for the columns
- What: OpenTelemetry has GenAI semantic conventions (`gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.usage.input_tokens`, etc.). I confirmed only that the spec "moved to the OpenTelemetry GenAI semantic conventions repository" (https://github.com/open-telemetry/semantic-conventions-genai); attribute names are from memory, UNVERIFIED. Use as naming guidance if Shin ever exports traces. Not needed first.

### Method C: lineage tooling (OpenLineage, https://openlineage.io) 
- Heavy for one table; mention only to say it was considered. Not recommended.

---

## 6.3 Estimates are never observed prices; none in a category with 5+ observed prices

Pass test: 0 estimates in those categories.

### Method A (recommended first): physical separation plus a read-time gate, with a negative control
- What: Claude answers live in their own table (6.2) and the observed-price tables have no foreign key to it, so no aggregate over observed prices can include one by accident. The range builder reads estimates only through one function that first checks the category's observed count (>= 5, by the same rule the ladder uses for leaf/parent categories) and returns nothing if so. Add a CHECK-style guard: `source_class` column with values `observed | estimate` and a constraint that `estimate` rows can never be inserted into the observed table.
- Evidence: this is the provenance-separation pattern (PROV above); no benchmark applicable.
- Fit: exact. Cost: one SQL view.
- Pass test: SQL assertion run on every rebuild: count of estimate rows that were used in a range for a category whose observed count at that time was >= 5 equals 0. Negative control: seed a category with 5 observed prices and one estimate, confirm the assertion detects a deliberately broken gate (it must go red when the gate is disabled).

### Method B: down-weight to zero with a power prior
- What: instead of a hard cutoff, estimates enter as pseudo-observations multiplied by a discount a0 in [0,1] (power prior, Ibrahim and Chen; verified summary: https://cran.r-project.org/web/packages/bayprior/vignettes/robust-priors.html). Set a0 = 0 once observed n >= 5. Same effect as the gate, smooth below 5.
- Fit: good, also serves 6.6. Slightly more machinery than A; adopt together with 6.6.

---

## 6.4 Reuse a stored answer for the same item; at most one call per item per 90 days

Pass test: repeat scans make 0 new calls.

### Method A (recommended first): exact-key result cache in the database, expiry column, normalised key
- What: key = the same canonical item identity the catalogue uses (barcode + market + currency, as in app/src/repeat-cache.ts, plus normalised brand/name/size for typed items). Look up `estimates` where key matches and `created_at > now - 90 days` BEFORE calling Claude. Today's repeat cache is 6 hours and in-process (RULINGS: cache key = barcode + market + currency); this requirement needs it in the database so it survives restarts.
- Evidence: standard HTTP-style freshness semantics (RFC 5861 `stale-while-revalidate` / `stale-if-error`, https://www.rfc-editor.org/rfc/rfc5861; fetched from memory, UNVERIFIED this session).
- Cost: none. Risk: two spellings of the same item make two calls; that breaks the pass test only for typed names. Mitigate by running the typed text through the existing name normaliser and size-fill before keying.
- Pass test: scan 100 items twice and three times; assert the outgoing-call counter (6.2 table row count) rises only on the first scan; then fast-forward the clock 91 days in the test and assert exactly one new call.

### Method B: pre-fill the table in bulk with the Batch API for likely items
- What: a nightly job takes the most-scanned items that still have no range from the catalogue and sends them through the Batch API at $0.50/$2.50 per MTok, about $0.0003 per item by my arithmetic (so 100,000 items about $30). Shopper scans then hit the cache with no live call and no latency. Same trick Shin already plans with Gemini offline seeding (RULINGS 2026-09-28).
- Fit: good for 8.2 and for the latency of the Claude path. Cost as above. Limit: only for items you can predict; expiry still 90 days.

### Method C (not first): semantic cache, e.g. GPTCache (https://github.com/zilliztech/GPTCache)
- Embeds the query and reuses an answer for a "similar" one. Dangerous here: "Coke 355 ml" and "Coke 2 L" are near neighbours and need different prices. No evidence it is safe for numeric answers. Not recommended.
- Note: Anthropic's own prompt cache (5-minute or 1-hour TTL) is NOT a way to meet 6.4.

---

## 6.5 Score each stored answer when observed prices arrive; set Claude's trust per category from that

Pass test: scored for every item that gains a price.

### Method A (recommended first): log-ratio scoring plus a shrunken per-category widening factor
- What: when an observed regular price y (not a sale, not a lone shopper report, per 3.6/5.3) arrives for an item with a stored estimate, compute `r = ln(y / typical)` and the hit flag `low <= y <= high`; store both in an `estimate_scores` table keyed to the estimate row. Per category, maintain the quantile (say 80th percentile) of `|r|` divided by the model's own stated half-width, shrunk toward the parent category's value (empirical-Bayes, same hierarchy Shin already has). That ratio is the multiplier applied to Claude's spread when it is used (6.6, rung 6). Trust shown to the verdict = the hit rate's Beta posterior mean, with a Beta prior pooled from the parent.
- Evidence: the multiplier mechanism is the split-conformal recalibration that restored near-nominal coverage in FermiEval (28-31 percent raw to near 90 percent) and needed 2-5x widening in the Bayesian-elicitation study (both verified, URLs in the shared facts above); both used calibration sets of a few hundred items (500 train in FermiEval, a 30 percent calibration split in the other). Pair scoring with the interval/Winkler score already listed in the repo references.
- Fit: re-uses Shin's hierarchy; needs observed prices that Shin does not have yet (RULINGS note: bench cannot score, "1 product at 3+ shops"), so until a category has about 30 scored pairs, use one global factor as a prior. Starting guess 2x on log-spread, taken from the literature range, UNVERIFIED for groceries, to be replaced by Shin's own number.
- Cost: one table and a rebuild-time job.
- Pass test: SQL assertion each rebuild: count of items having both an estimate and an observed price dated after the estimate and no score row equals 0. Negative control: insert a fake estimate 10x too high and one oracle estimate equal to the observed price; trust for the first must fall and the second rise (fails if both stay equal).
- Bias warnings (mine, from the data shape): items that gain observed prices are the popular ones, so scores are not a random sample of what Claude was asked; and Claude's "typical" is across shops while an observed price is one shop, so compare against the item's multi-shop median where possible.

### Method B: isotonic quantile recalibration (Kuleshov, Fenner, Ermon, ICML 2018)
- What: fit a monotone map from nominal quantile level to empirical level on the score pairs, then use the mapped levels to build the interval. Paper: https://arxiv.org/pdf/1807.00263 (verified by search snippet only; claim is calibrated intervals "given enough data"; sklearn `IsotonicRegression` implements the fit).
- Fit: more flexible than A's single factor but needs a few hundred pairs per group; use globally after A has data.

### Method C: prediction-powered inference for per-category bias (Angelopoulos et al., 2023)
- What: use many cheap Claude estimates plus the few observed prices to get a valid confidence interval for a category's mean or quantile, with no assumption about Claude (https://arxiv.org/pdf/2301.09633; verified summary). A 2026 follow-on, Generative Augmented Inference, reports halving estimation error and over 75 percent fewer labels in a conjoint study (https://arxiv.org/abs/2604.14575; verified abstract numbers, not a price-shelf study).
- Fit: later, when each category has a handful of labels; it gives a statistically valid way to say "Claude is off by X in this category".

---

## 6.6 Let estimates start an empty category's range, marked low confidence

Pass test: every such range labelled.

### Method A (recommended first): estimate as a discounted pseudo-observation (power prior) inside the existing blend
- What: the verdict design already blends `mu = (n*mu_own + k*mu_cat)/(n+k)`. Treat the Claude (or offline seed) estimate as a category-level prior with effective weight n0 (start 1) multiplied by a trust discount a0 from 6.5; the first real prices dominate; at 5 observed the estimate weight is 0 (6.3). Spread = Claude's spread times the 6.5 widening factor, then the floor already in the design. Output `confidence: 'low'` and `notes: ['claude_estimate']` (both already in the contract).
- Evidence: power prior (verified summary: https://cran.r-project.org/web/packages/bayprior/vignettes/robust-priors.html). LLM-built priors cut error against uninformative priors with fewer labels in AutoElicit, ICML 2025 (https://arxiv.org/pdf/2411.17284; "saves over 6 months of labelling" in one clinical case; not a price test).
- Fit: matches his nested-category design. Cost: none.
- Pass test: replay or load-test; assert 100% of answers whose `basis` is `claude_typical` or `category_prior` from seeds carry `confidence='low'` and the label note (assertion over the response JSON, including the offline phone table); negative control: strip the label in one code path and confirm the assertion goes red. Reversal test: add 5 observed prices to a seeded category and confirm the estimate weight is 0.

### Method B: robust mixture prior (Schmidli et al. 2014 style)
- What: mix the estimate-informed prior with a vague component, `w*informed + (1-w)*vague`, so a confidently wrong Claude estimate cannot pin the range; w comes from 6.5 scores (https://pmc.ncbi.nlm.nih.gov/articles/PMC4626399 appears in the search results as a related reference; the exact Schmidli URL was not opened, UNVERIFIED).
- Fit: protects priority 1 (calibration) given FermiEval-type overconfidence and the possible upward bias above. Use together with A, second.

### Method C: borrow from the nearest observed ancestor first, estimate second
- What: hierarchical shrinkage (Bambi/PyMC notebook already cited in the repo references) gives an empty leaf the parent's distribution before any Claude call; the Claude estimate only starts a category with no observed ancestor. This is already the ladder order (parent_category is rung 4, claude_typical rung 6).
- Fit: already in the design; the test is that no estimate is used where an ancestor with 5+ observed exists.

---

## 6.7 Fall to the next basis when Claude is down, capped or slow, and still answer

Pass test: outage test answers 100%.

### Method A (recommended first): per-call timeout + circuit breaker + ordered fallback, with fault injection
- What: wrap `claudeRange` with a library breaker: opossum (https://github.com/nodeshift/opossum; options `timeout`, `errorThresholdPercentage`, `resetTimeout`, a `fallback` function, AbortController support; verified from the README via search) or cockatiel (https://github.com/connor4312/cockatiel; policy-based timeout/retry/breaker; UNVERIFIED this session). Fall to `category_prior`, then `global_prior` (the existing rungs 7-8) on: timeout, 429, 500, 504, 529, 400 workspace-spend-limit, malformed or non-JSON output, a low/high that is not monotone, or breaker open. Anthropic specifics (verified, https://platform.claude.com/docs/en/api/errors): 529 overloaded; a tier-spend-cap 429 has no `retry-after` and keeps failing, so do not retry it; the SDK retries transient errors 2 times by default with backoff, so set `maxRetries` to 0 or 1 and a per-request `timeout` so total wall-clock (about timeout x (retries+1), per the claude-api skill) stays inside the budget. Shin's own vision call already uses a 1,800 ms timeout with one retry (RULINGS ~611); copy that shape.
- Evidence: standard resilience pattern; opossum and cockatiel exist for exactly this. No Shin-specific number until measured.
- Cost: none. Fit: this is what the verdict design lists as case 27.
- Pass test: fault-injection matrix, each run through the real HTTP stack against a stub server (or Toxiproxy, https://github.com/Shopify/toxiproxy, latency/timeout "toxics"; UNVERIFIED this session): 500, 529, 429 with and without `retry-after`, 400 spend-limit, 10-second hang, truncated JSON, empty content, unset API key, DNS failure. Pass = 100 scans per fault, 100 percent get a range within the timeout budget, each tagged with the right fallback basis. Include a real outage drill once: revoke the key and scan.

### Method B: answer now, refine later (hedging with stale-while-revalidate)
- What: return the fallback range immediately if Claude has not answered within a short budget, let the call finish in the background, store it (6.2) and show the better range next time or animate it in, as the verdict doc case 28 already plans. Pattern names: hedged requests ("The Tail at Scale", Dean and Barroso 2013, https://research.google/pubs/the-tail-at-scale/, UNVERIFIED) and RFC 5861 stale-while-revalidate.
- Fit: protects the 2-second budget when Claude is slow. Risk: background work after the response is lost on a serverless host; needs a queue.

### Method C: serve a stale estimate before dropping to the prior
- What: `stale-if-error` semantics: if the 90-day entry for the item has expired and Claude fails, serve the expired estimate labelled "older" rather than the category prior (it is item-specific). Cheap; adds one extra rung. Test: expire an entry, fail Claude, expect the stale value and the label.

---

## 8.1 Answer fast: 95 percent of catalogue-based answers within 2 seconds

Pass test: p95 under 2 s.

### Method A (recommended first): scripted load test with a threshold, open-model arrivals
- What: k6 with `thresholds: { http_req_duration: ['p(95)<2000'] }` (exact syntax verified, https://grafana.com/docs/k6/latest/using-k6/thresholds/; `abortOnFail` also supported). Drive it from the real scan mix (barcode, typed name, read-text) at the 100x data size (1.5 million prices, requirement 4.7) and use an arrival-rate (open model) executor, not a fixed number of looping users, so slow responses do not slow the generator down (the "coordinated omission" error; Gil Tene, "How NOT to measure latency", https://qconsf.com/sf2012/dl/qcon-sanfran-2012/slides/GilTene_HowNotToMeasureLatency.pdf; arrival-rate executor names from memory, UNVERIFIED).
- Cost: free (open source). Pass test as written: at least 1,000 catalogue-answered requests (about 50 tail samples), cold and warm cache runs reported separately, p95 and a bootstrap confidence interval; pass only if the upper bound is under 2 s. Negative control: add a 2.5 s sleep to 10 percent of requests and confirm the threshold fails.

### Method B: always-on server histogram
- What: record each answer's duration in the scan row and in a Prometheus-style histogram with a bucket edge at exactly 2.0 s (`prom-client`, https://github.com/siimon/prom-client; PromQL `histogram_quantile(0.95, ...)`; both from memory, UNVERIFIED). Exclude Claude-based answers from this metric (the requirement says catalogue-based) by labelling `basis`.
- Fit: gives the p95 on every rebuild and in production for free. Caveat: server-side time misses the phone network; add a client timer reported with the scan for the user-visible number.

### Method C: exact percentile from the scan table
- What: nearest-rank p95 computed by SQL over the logged durations, with HdrHistogram if volumes get large (Tene above). Simplest and exact; use as the cross-check on A and B.

---

## 8.2 Spend under daily and hard caps; never designed to lose money monthly; cost model positive at 100x users

Pass test: cost model positive at 100x users.

### Method A (recommended first): parametric per-scan cost model with sensitivity bands
- What: monthly Claude cost = S x m x (1 - r) x c, where S scans, m share of scans the catalogue cannot answer, r share served from the 90-day cache (6.4), c cost per call ($0.0006 by my arithmetic; $0.0003 via batch pre-fill). Illustration only (assumed inputs): S = 1,000,000, m = 0.15, r = 0.5 gives 75,000 calls = $45 a month; worst case m = 1, r = 0 gives $600. A $50 monthly cap buys about 83,000 calls at $0.0006. Run the model over ranges of each input (a Monte Carlo or a simple tornado table) and require a positive margin at the bad end, not the middle. Extend the repo's existing sheet (docs/unit-economics-2026-09-22.md, its row for "Claude Haiku 4.5 $1 in / $5 out").
- Evidence: arithmetic from the verified price table; the model structure matches how that repo file already prices a scan. Revenue side (1 in 100 pay, RULINGS 2026-09-23, and the plan price) must come from RULINGS; I did not recompute it.
- Pass test: run at the 100x load (4.7), with S, m and r measured from the load test (not guessed), and show margin per paying user above zero at the 10th-percentile inputs.

### Method B: meter real cost per call and reconcile weekly
- What: compute cost from `response.usage` x the rate table on every call (as app/src/model-cost.ts already does, though it labels its numbers an estimate), store it in the 6.2 row, and once a week reconcile against Anthropic's Usage and Cost API filtered by workspace id (https://platform.claude.com/docs/en/manage-claude/usage-cost-api; endpoint shape verified in the workspaces page example; Admin key required). Alert when the two differ by more than 10 percent (threshold is my proposal).
- Pass test: the weekly diff is on file and inside the band.

### Method C: layered caps (code counter + workspace spend limit)
- What: the app counter enforces the daily/hard dollar caps and the monthly call cap; the workspace spend limit (6.1 Method C) is the backstop the code cannot override. Treat the spend-limit 400 as "capped" in 6.7.
- Pass test: spike test with a stub model priced at the real rate: send 10x the daily volume, assert spend stops at the cap to within one call, every later scan gets a fallback range.
- Levers considered and rejected: prompt caching (below the 4,096-token Haiku 4.5 minimum), Batch for live calls (asynchronous), web search (forbidden, and $10 per 1,000 searches would be $0.01 a call, 17x the token cost; verified pricing).

---

## 8.3 Show no Gemini output in any shopper answer

Pass test: 0.

### Method A (recommended first): provenance allowlist at the answer serializer
- What: every number in a response carries `source` (`observed`, `claude`, `seed`, `prior`). The serializer refuses to emit any source not on the allowlist, and every stored seed or estimate row records its provider. Test: replay 500 scans and grep every response and stored basis for provider `gemini`; count must be 0.
- Fit: uses the 6.2 columns. Cost: small.

### Method B: build-time import ban plus an egress block in tests
- What: a lint or dependency rule that the answer path may not import the Gemini client (`eslint no-restricted-imports`, or dependency-cruiser, https://github.com/sverweij/dependency-cruiser; both from memory, UNVERIFIED), and the test environment resolves `generativelanguage.googleapis.com` to nothing so any call throws. Negative control: add a Gemini import deliberately and confirm CI fails. Note the repo's own setting `SHIN_CATALOGUE_FIRST` already turns the Gemini call off on barcode scans (RULINGS ~line 142).

### CONFLICT TO RESOLVE (needs his word, not mine): 6.6 vs 8.3
- 6.6 lets offline Gemini Pro seeds start an empty category's range, and 8.3 says no Gemini output in any shopper answer. A range started by a Gemini seed shows Gemini-derived numbers. Either 8.3 means "no live Gemini call and no Gemini text", with seeds allowed, or seeds must not reach a shopper. If the second, re-seed with Claude Haiku through the Batch API ($0.50/$2.50 per MTok, about $0.0003 an item) and the conflict disappears. Marked as a requirements conflict, not decided here.

---

## 8.4 Let the phone draw a range offline from its own category table

Pass test: airplane-mode scan shows a range.

### Method A (recommended first): versioned static table in the app pack, loaded into memory
- What: export one row per category (id, parent id, log-centre, log-spread, n, basis, hierarchy version) as a small binary or JSON file. Size estimate, my arithmetic: 2,000 categories x about 20 bytes = about 40 KB. Ship it inside the Capacitor app (Shin is a Capacitor wrapper, native/README.md) and refresh it by download when online; RULINGS already says the phone's pack is built from `sold_in_canada = 1`. The phone computes the bell from centre and spread exactly as the server does, with `confidence: 'low'` and the offline note.
- Evidence: the offline-first pattern is standard; no published number needed; correctness is by test, below.
- Fit: smallest, no database. Catch: the phone must place the item in a category. Barcode scanning is already on-device (`@capacitor-mlkit/barcode-scanning` is installed), so the missing piece is a barcode-to-category map. Size estimate, my arithmetic: 618,000 sold-in-Canada rows x about 10 bytes = about 6 MB uncompressed. Typed-name search offline is a separate, bigger job (needs full-text search on device); treat it as a later phase.
- Pass test: put the device in airplane mode and scan 50 items spanning departments; every scan shows a range with zero network requests (check the request log), and each offline range equals the server range for the same table version when the server is forced to the same rung.

### Method B: on-device SQLite with the same pack
- What: `@capacitor-community/sqlite` (https://github.com/capacitor-community/sqlite; native iOS/Android/web, optional SQLCipher; JSON import exists but at least one user reports `importFromJson` failing silently, from search results, so verify the import path with a test). Load the barcode-to-category map and the category table, and use FTS5 for typed names.
- Fit: needed once typed-name offline is in scope. Cost: bigger bundle and a migration story (RULINGS pack versioning). Not first.

### How to automate the offline test
- Web build: Playwright `context.setOffline(true)` (https://playwright.dev/docs/api/class-browsercontext, from memory, UNVERIFIED) with the request log asserted empty.
- Android: toggle airplane mode via `adb` (`cmd connectivity airplane-mode enable` on Android 11+, from memory, UNVERIFIED) and drive with a UI tool such as Maestro (https://maestro.mobile.dev; its airplane-mode command UNVERIFIED).
- iOS: the simulator has no airplane mode, so use a real device or Network Link Conditioner "100% Loss" profile (from memory, UNVERIFIED).
- Rejected: shipping a machine-learning model on the phone. RULINGS says ML is used only after beating the simpler method on held-out data, and a table is simpler.

---

## Recommended first method per requirement

| Req | First method | Why |
|---|---|---|
| 6.1 | A: one guarded call function, no `tools` key, request-capture test; add B (disable web search in Console) as the independent proof | Guarantee does not rest on code alone |
| 6.2 | A: append-only `estimates` table with model, request-id, category, hierarchy version | Same fields serve 6.3-6.5 |
| 6.3 | A: separate table plus read-time gate, tested with a negative control | Hard "0" requirement needs a structural separation |
| 6.4 | A: DB result cache keyed on canonical item, 90-day expiry; B (Batch pre-fill) as the second step | Exact key avoids wrong-size hits |
| 6.5 | A: log-ratio scoring with shrunken per-category widening factor (global 2x prior until about 30 pairs per group) | Raw LLM intervals cover 9-44 percent of truth at stated 90-95 percent (verified papers) |
| 6.6 | A: discounted pseudo-observation in the existing blend, low-confidence label, weight 0 at 5 observed; B robust mixture second | Fits the ladder already designed |
| 6.7 | A: timeout + circuit breaker (opossum) + fallback rungs, fault-injection matrix | Direct test of "outage answers 100%" |
| 8.1 | A: k6 `p(95)<2000` on an open-model replay at 100x data, n >= 1,000; B histogram for production | Measures what the user feels without coordinated omission |
| 8.2 | A: S x m x (1-r) x c model with sensitivity bands, fed by measured m and r; C layered caps | Cost per call is about $0.0006 so volume assumptions decide the result |
| 8.3 | A: provenance allowlist at the serializer; resolve the 6.6 conflict first | Conflict with offline Gemini seeding |
| 8.4 | A: 40 KB category table plus barcode-to-category map in the pack; airplane-mode test | Smallest thing that satisfies the test |

Open items I could not close: Haiku 4.5 real latency (Artificial Analysis page values did not load), any grocery-specific LLM price accuracy figure, Batch API expiry window and per-batch limits (page fetched but the numbers were not extracted), whether structured-output or assistant prefill works on Haiku 4.5 (the errors page says prefill is rejected on "Claude 4.6 and later", which suggests Haiku 4.5 still accepts it; UNVERIFIED), and whether Anthropic exposes token log-probabilities (I believe not, which rules out FermiEval's log-prob method; UNVERIFIED).
