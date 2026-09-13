# Item 36: visual product search, the routes to a Lens-like image-to-product lookup

Researched 2026-09-13. Beta-plan item 23 is titled "Google Lens" and has never been
specified. Aurik has decided the direction: **the official Google Cloud Vision route,
not the SerpApi Lens-scraping proxy.** This item does not re-open that decision; it
makes it costed and concrete, enumerates the alternatives by class so the choice is
visibly a choice, and names the one seam in this repo where any of it could plug in.

**What this builds on and does not repeat.** `research/competitors/retailer-apps-and-visual-search.md`
(lines 128-159) already records the consumer-facing Google Lens product: that it runs
on Google's Shopping Graph, "more than 45 billion products," **labelled there and here
as a COMPANY CLAIM** about Google's own product
(https://blog.google/products-and-platforms/products/shopping/visual-search-lens-shopping/,
read 2026-09-11); that the underlying model is **not confirmed to be Gemini** and must
not be described as such; and that the one part worth taking is image plus text
refinement in the same query. That finding stands unchanged. The gap it leaves, and the
only gap this item fills, is that **the consumer Lens product has no API.** Nothing in
that file is a buildable route. Everything below is.

---

## The closed register, restated, and whether anything here falls under it

`QUEUE.md`'s closed register kills exactly two methods. Both are restated in full here
because two of the six routes below sit close enough to them that silence would read as
a quiet re-proposal.

| Killed method | Falsifier that fired | Reopens on (new observation only) |
|---|---|---|
| **Direct retailer page scraping** | Returned a price 0 times out of 4 attempts on 2026-09-03. Loblaws, Best Buy Canada and Metro all answered 403. IKEA served its navigation menu instead of the product. | A recorded fetch showing a named retailer serving prices to an unauthenticated request, or an official feed or API that makes the question moot. Not a new argument that it ought to work. |
| **Asking a search engine for a live price** | The 2026-09-03 pilot got a usable range for a small minority of the seven items; the exact count is disputed and logged as D-001. Recorded as the decision "Real feed from day one, never live search". | A search-derived range reproduced against a live source and written into the scoreboard. |

**Ruling, route by route.**

- Routes 1, 2, 3, 4 and 6 are **identity** routes, not price routes. They answer "which
  catalogue row is this," and the price still comes from the wired price sources
  (`price/src/sources.ts`). None of them falls under either kill. This distinction is
  the whole reason the item is live: the closed register killed two ways of getting a
  **price**, and said nothing about ways of getting an **identity**.
- **Route 1 (Web Detection) is the one to watch.** It returns pages from Google's web
  index. If its output were used to *read a price off a returned retailer page*, that is
  direct retailer page scraping and it is killed. If its output is used only to recover
  a product name or a GTIN string that is then looked up in this repo's own catalogue,
  it is not. The recommendation below takes only the second use, and any lane that
  implements it must not follow the returned URLs.
- **Route 5 (SerpApi Google Lens) is not killed by the register** — it returns identity
  and visual matches, not a live price range, so the "asking a search engine for a live
  price" kill does not literally cover it. It is nonetheless out on Aurik's 2026-09-13
  direction decision, and it is listed here for completeness with its risks, not as a
  live candidate. If a future lane reaches for its `products` search type to get a
  **price**, that use *is* the killed method wearing a different name, and the register
  applies.
- **Vision Warehouse (route 6) and every self-hosted embedding index** are the parked
  items from `docs/the-photo-path.md` in commercial clothing. That park has a stated
  reopen condition — "They come back only if the measured top-1 says the text path
  cannot get there" — and that measurement does not exist. See the third closing section.

---

## Method note

Every route below is enumerated **by class**, not by sampling vendors. Six classes were
named in the brief; all six are answered, and no seventh was found that is both real and
reachable by a team this size — the search for one is shown in route 6 rather than left
as an assumed empty.

**Control query for the class:** "visual product search API vendor pricing image to SKU
2026" returned three named commercial vendors that are not Google (Ximilar, ViSenze,
Syte), confirming the class has non-Google members and that a Google-only enumeration
would have been under-searched. Control passed.

**What could not be fetched.** `https://cloud.google.com/vertex-ai/pricing` and
`https://cloud.google.com/products/vision-ai/pricing` both exceeded the fetch size limit
and returned truncated content on 2026-09-13. Numbers that originate from those two
pages are therefore carried below **from search-result extraction, labelled as such**,
not from a page this session read end to end. The Cloud Vision pricing page
(`https://cloud.google.com/vision/pricing`) and the Product Search pricing page
(`https://cloud.google.com/vision/product-search/pricing`) both fetched cleanly and
their numbers are first-hand.

---

## Route 1: Google Cloud Vision **Web Detection**

| Field | Finding |
|---|---|
| **What it returns** | Not a SKU and not a price. Per Google's own docs: "labels obtained from the Web," site URLs that have matching images, URLs to web images that fully or partially match, and URLs to visually similar images. The response fields are `webEntities` (extracted entities, each with a description and a score), `pagesWithMatchingImages`, `fullMatchingImages`, `partialMatchingImages`, `visuallySimilarImages`, `bestGuessLabels`. https://docs.cloud.google.com/vision/docs/detecting-web (read 2026-09-13). The usable output for Shin is **a text string** — a best-guess label or a web entity description — which is the same kind of thing pass 1 already produces, arriving from a different direction. |
| **Cost / 1,000 lookups** | **$3.50 per 1,000 images**, first 1,000 units/month free, tier 1,001 to 5M. Above 5M units/month the page says "contact Google" rather than naming a rate — the only feature on that page that does. https://cloud.google.com/vision/pricing (read 2026-09-13, first-hand). |
| **Canadian product coverage** | **Unknown and not measurable from outside.** Google publishes no index-composition figure, nothing Canada-specific, and no per-locale breakdown for Web Detection. The only way to get a number is to run the API against the 40-photo eval set in `identify/eval/photos/` and count. Not estimated here. |
| **Catalogue upload required** | **No.** This is the route's single structural advantage: zero index to build, zero index to store, zero index to keep fresh. It works against Google's web index on the first call. |
| **Terms** | Governed by the Google Cloud Platform Terms of Service (https://cloud.google.com/terms/) and the Service Specific Terms (https://cloud.google.com/terms/service-terms). No clause forbidding this use was found; **those documents were not read end to end this session**, so "permitted" is stated as "no prohibition found," not as "cleared." The live constraint is the one named in the closed-register ruling above: the API returning a retailer URL does not make fetching that URL permitted. |
| **Latency** | **Not published.** Google publishes no latency figure or latency SLA for Vision API. An availability SLA exists at https://cloud.google.com/vision/sla but that page returned truncated content this session and its percentage is **not reproduced here rather than guessed**. |

---

## Route 2: Google Cloud Vision **Product Search**

| Field | Finding |
|---|---|
| **What it returns** | A ranked list of matches **against your own uploaded catalogue** — the matched product's resource name, display name, category and labels; a **confidence score between 0 and 1**; which reference image the match came from; an `indexTime` naming which index version answered. With multi-object detection it also returns **normalized bounding-box vertices** and `productGroupedResults` when several products appear in one photo. https://docs.cloud.google.com/vision/product-search/docs and .../docs/quickstart (read 2026-09-13). This is the only route in the list that returns *your own SKU identifier* rather than a string you then have to match. |
| **Cost / 1,000 lookups** | **$4.50 per 1,000 images queried** (1,001-5M/month), falling to **$1.80 per 1,000** above 5M/month; first 1,000/month free. Storage is billed separately at **$0.10 per 1,000 catalogue images per month**, same free first 1,000. https://cloud.google.com/vision/product-search/pricing (read 2026-09-13, first-hand). |
| **Canadian product coverage** | **100% by construction, and that is not a virtue.** The index contains exactly what you upload, so "Canadian coverage" is a restatement of this repo's own catalogue coverage, not new information. The route adds zero products; it only adds a way to reach the ones already there by photo. |
| **Catalogue upload required** | **Yes, and this is the route's whole cost.** Products and reference images must be created and grouped into product sets, bulk-importable by CSV. Storage arithmetic against this repo's known numbers: Walmart.ca's first-party sitemap holds **~217,660 SKUs** (measured 2026-09-08, `crawl.ts` header). One reference image each = 217,660 images = **$21.77/month** in Product Search storage, plus the Cloud Storage bill for the image bytes themselves, plus the wall time to acquire 217,660 product photos, which this repo does not have and which is by far the larger cost. Open Food Facts front images keyed by GTIN — already the eval set per `docs/the-photo-path.md` — are the only image corpus this project actually holds today, and it is **40 photos**, not 217,660. |
| **Terms** | Same GCP ToS as route 1. Additional constraint worth naming: the reference images you upload must be images you are entitled to upload, which for Open Food Facts photos is an open-licence question this session did not resolve. **Unknown.** |
| **Latency** | Query latency **not published**. Index freshness *is* published and is the problem: **"The Product Search index of products is updated approximately every day"** — a newly added product is not findable until the next daily rebuild, confirmable via the product set's `indexTime` field (quickstart, read 2026-09-13). A catalogue that moves faster than daily cannot be served by this. |
| **Product state** | **In maintenance mode.** Quoted from Google's own docs: *"The Product Search feature is in maintenance mode. For better scalability and the same functionality as Product Search, use the Vision Warehouse."* (https://docs.cloud.google.com/vision/product-search/docs, read 2026-09-13). It does **not** appear on the Vision deprecations page (https://docs.cloud.google.com/vision/docs/deprecations, read 2026-09-13, which lists only Celebrity Recognition and OCR On-Prem, both shut down 2025-09-16), so **there is no announced shutdown date**. Maintenance mode with no shutdown date is not the same as deprecated, and is not reported here as if it were. |

---

## Route 3: Vertex AI **multimodal embeddings** plus a vector index (build your own)

| Field | Finding |
|---|---|
| **What it returns** | Nothing product-shaped on its own. `multimodalembedding` returns a **vector**; the product identity comes from whatever you do with it. The retrieval step is a separate service and a separate bill. |
| **Cost / 1,000 lookups** | Embedding: **$0.0001 per image = $0.10 per 1,000 images**, with text input at $0.80 per 1M tokens. **Labelled second-hand**: extracted from https://futureagi.com/llm-cost-calculator/vertex-ai/multimodalembedding (that page carries a verified date of 2026-08-06; read 2026-09-13) because https://cloud.google.com/vertex-ai/pricing exceeded the fetch limit and could not be read directly this session. **Retrieval is where the real money is** and it is not per-lookup: Vertex AI Vector Search bills **~$3.00 per GiB of data processed** for index building and **per node-hour** for serving (figures quoted around $0.38/node-hour for optimized online serving, ~$1.20/node-hour for Bigtable serving), with third-party write-ups placing a moderate index on three replicas at **$700-$800/month**. All Vector Search numbers here are **second-hand** from https://www.nops.io/blog/vertex-ai-pricing/ and https://www.finout.io/blog/top-16-vertex-services-in-2026 (read 2026-09-13); the primary page could not be fetched. **Treat them as an order of magnitude, not as a quote.** |
| **Canadian product coverage** | Same as route 2: exactly your own catalogue, nothing more. **Not new coverage.** |
| **Catalogue upload required** | **Yes, plus an index you now operate.** Every catalogue photo must be embedded once ($0.10/1,000) and the resulting vectors hosted on nodes billed by the hour whether or not anyone scans anything. This is the only route in the list with a **non-zero floor cost at zero usage**. For a beta with no users, that floor is the entire bill. |
| **Terms** | GCP ToS as above. No prohibition found; not exhaustively read. |
| **Latency** | Not published as a figure. Vector Search is designed for low-latency approximate-nearest-neighbour serving; **no number is asserted here.** |
| **Note** | This is `docs/the-photo-path.md`'s parked "SigLIP/CLIP embeddings over catalogue photos" with Google operating the GPUs instead of us. Its park condition is unchanged and unmet. |

---

## Route 4: Vertex AI / Gemini vision as a direct describe-and-match call

| Field | Finding |
|---|---|
| **What it returns** | Whatever the prompt asks for — a JSON object with brand/name/size, i.e. **structurally the same thing `identify/src/identify.ts` pass 1 already produces**, from a different vendor. It returns no SKU, no bounding box and no similarity score unless the prompt manufactures one, and any such score is the model's self-report, which `docs/the-photo-path.md` section 1 already flags as the thing to avoid ("Structured JSON with an enum confidence, not a free number"). |
| **Cost / 1,000 lookups** | Token-priced, so it depends on image size. Images cost **258 tokens if both dimensions are 384 px or under**, and larger images are tiled at **258 tokens per 768x768 tile** (https://ai.google.dev/gemini-api/docs/image-understanding, read 2026-09-13). The repo's crop is 1568 px (`docs/the-photo-path.md` section 2), which tiles to several thousand tokens. Against the 2026 paid-tier rates on https://ai.google.dev/pricing (read 2026-09-13): Gemini 3.5 Flash-Lite $0.30/1M in, $2.50/1M out; Gemini 3.8 Flash $0.75/1M in, $3.75/1M out; Gemini 3.1 Pro Preview $2.00/1M in (prompts 200k tokens or under), $12.00/1M out. At roughly 2,000 image tokens plus prompt and a short JSON reply, one Flash-Lite call lands **well under $0.01**, in the same band as the repo's own measured Anthropic figures ($0.007/extract call, $0.007/pick call, `docs/the-photo-path.md` section 6). |
| **Canadian product coverage** | Not a coverage question — the model reads the pack in front of it. Coverage is the **catalogue's**, not the model's, and is therefore unchanged by this route. The relevant unknown is the French-face-on-an-English-catalogue failure mode already named in `docs/the-photo-path.md` section 1, and swapping vendor does not address it. |
| **Catalogue upload required** | No. |
| **Terms** | Google's Generative AI Prohibited Use Policy (https://policies.google.com/terms/generative-ai/use-policy) plus GCP ToS. Nothing found prohibiting this use. |
| **Latency** | Not published per-model as a guarantee. **Unknown.** |
| **Verdict on this route specifically** | **It is not a visual-search route at all.** It is a second-vendor version of the call this repo already makes. It belongs in the enumeration so the class is complete, and it should not be confused with routes 1-3: it adds no new identification mechanism, only a price comparison against the incumbent model, and that comparison cannot be made because the incumbent's real numbers do not exist yet (see below). |

---

## Route 5: the reseller class (SerpApi and equivalents) — listed for completeness, already chosen against

| Field | Finding |
|---|---|
| **What it returns** | The richest output of any route: `visual_matches` (title, link, source, thumbnail, dimensions), an `exact_matches` search type, and a **`products` search type** that carries price and seller. https://serpapi.com/google-lens-api (read 2026-09-13). This is the only route that returns identity *and* price from one call. |
| **Cost / 1,000 lookups** | Plan-priced, not per-call. From https://serpapi.com/pricing (read 2026-09-13): Free 250/mo; Starter $25 / 1,000; Developer $75 / 5,000 ($15/1k); Production $150 / 15,000 ($10/1k); Big Data $275 / 30,000 ($9.17/1k); Searcher $725 / 100,000 ($7.25/1k); up to Cloud tiers $3,750-$106,050. So the realistic beta cost is **$25.00 per 1,000 lookups**, falling to about $7.25 per 1,000 only at 100k/month. That is **7x route 1's $3.50** at the volume a beta would actually run at. Cached searches are free and not counted, per the Lens API page. |
| **Canadian product coverage** | **Unknown.** SerpApi proxies Google, so its Canadian coverage is Google's Canadian coverage seen through a `gl=ca` parameter — the same unmeasurable quantity as route 1, with an extra party in the middle. Item 34 already ran into this for the `google_shopping` engine and recorded the same honest gap. |
| **Terms** | This is the risk, and it is why it is out. The service scrapes Google; SerpApi's own answer to that is commercial indemnity, not permission: **"U.S. Legal Shield provides up to $2 million in coverage for the scraping and parsing of search engine data, as long as your use of the data or service is not illegal,"** included at Production tier and above ($150/mo minimum) — i.e. **not at the $25 Starter tier a beta would buy**. A vendor offering to insure you against a legal question is evidence the legal question is live. Nothing here establishes that scraping Google Lens is permitted by Google. |
| **Latency** | Three published speed modes — Best Effort, Ludicrous Speed (2x price multiplier), Ludicrous Speed Max (4x) — with no millisecond figure attached to any of them. So latency is **priced but not specified**, which means the photo path's 7,000 ms budget (`identify/src/identify.ts`, the cascade comment) cannot be checked against it without running it. |
| **Second-order risk not on any pricing page** | A reseller's product exists at Google's sufferance. Microsoft retired **all** Bing Search APIs, the Bing Visual Search API included, on **2025-08-11**, decommissioning existing instances (https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement). That is the whole second-place option in this category gone inside the last thirteen months. Building the miss path on a proxy to somebody else's consumer product is a dependency with a demonstrated failure mode. |

---

## Route 6: everything else real that turned up

**Google Vision Warehouse / Image Warehouse** — the thing Google's own docs point Product
Search users at. Same shape as route 3 (embed, index, serve) with Google operating more
of it. Pricing extracted from search results as **$0.02 per GB per month storage, $3 per
1,000 search requests, plus index node-hours, with image index build costed at roughly
0.043 node-hours per 1,000 images**; the primary pages
(https://cloud.google.com/products/vision-ai/pricing,
https://docs.cloud.google.com/vision-ai/docs/image-warehouse-overview) exceeded the fetch
limit this session, so **these four numbers are second-hand and should be re-read before
anyone budgets on them.** Carries the same node-hour floor cost at zero usage as route 3.

**Commercial visual-search vendors (ViSenze, Ximilar, Syte).** Real, aimed at retailers
with their own catalogues — fashion, furniture, eyewear are the named verticals. They are
route 2's shape sold as a SaaS. Third-party write-ups place entry pricing at
**"$200-$500 per month for stores with up to 50,000 SKUs"**; this is a **third-party
figure, not read off any vendor's own pricing page** (https://www.ximilar.com/pricing/
and https://www.visenze.com/ai-visual-search/ exist and were not opened in depth this
session). None publishes a per-1,000-lookup rate, so none is comparable in the ranking
below. Canadian coverage is not a meaningful question for them either — like route 2,
they index your catalogue, not the country.

**Microsoft Bing Visual Search API — dead.** Retired 2025-08-11 with all Bing Search
APIs, existing instances decommissioned, no new signup
(https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement).
Recorded so that a future session does not spend an hour rediscovering it. The
successor Microsoft names is Grounding with Bing Search inside Azure AI Agents, which is
an LLM grounding feature, not an image-to-product lookup, and does not replace it.

**Self-hosted open-weight embeddings (SigLIP/CLIP + FAISS).** Not re-enumerated here.
This is `docs/the-photo-path.md`'s own parked item, it has a stated reopen condition, and
it is parked on a measurement rather than on a price. Listed so the class is complete.

---

## Ranking: identity per dollar, for routes with a sourced per-lookup number

Only routes with an actual sourced per-lookup price are ranked. Route 3, Vision Warehouse
and the SaaS vendors are excluded for lacking a usable denominator — they bill by
node-hour and by month, not by lookup — **not because they were judged worse.** Same rule
item 34 used.

| Rank | Route | Cost / 1,000 lookups | Catalogue to build first? | Note |
|---|---|---|---|---|
| 1 | **Vision Web Detection** | **$3.50** | No | Cheapest route that adds a genuinely new signal, and the only one with no index to build or keep. Returns a string, not a SKU. |
| 2 | Gemini vision direct call | **under $10**, arithmetic from Flash-Lite token pricing rather than a per-lookup line item | No | Adds no new mechanism; it is the incumbent call from a second vendor. |
| 3 | Vision Product Search | **$4.50** plus $0.10/1,000 images/month storage | **Yes** — and the catalogue photos do not exist | Only route returning a real SKU and a real score. Blocked on an image corpus, not on money. Daily index refresh. Maintenance mode. |
| 4 | SerpApi Google Lens | **$25.00** at the tier a beta buys, $7.25 only at 100k/month | No | Out on Aurik's direction decision. Richest output, 7x the price, legal exposure the vendor prices rather than resolves, and a proxy dependency whose nearest competitor was switched off in 2025. |

---

## Where it would plug in

**One seam, and only one.** `identify/src/identify.ts`, in `IdentifyStage.fromCrop`,
after the three-query cascade's union and immediately before this branch (line ~326):

```ts
const result = union(await Promise.all(queries.map((q) => this.#lookup(q))));
...
if (result.candidates.length === 0) {
  return { kind: 'not_in_catalogue', readAs, ring: result.ring, reading, tier };
}
```

That `not_in_catalogue` return is the **only** place a visual-search call belongs. The
code's own comment above it is the argument for why: *"The only real refusal left is
arithmetic: nothing came back at all, which is the one case a confidence number cannot
paper over because there is no candidate for it to be a confidence about."* A visual
search manufactures a candidate where arithmetic has none. Everywhere else in the
function there already is a candidate, and decision 17's ranked-candidates-with-a-"not
this?"-affordance already covers it.

Concretely: a `VisualSearch` port alongside the existing `CatalogueLookup` port — the
file's own header records that "the catalogue arrives as a function rather than an
import," so the shape is already established and a fake is already testable. On zero
candidates, one call; its returned string re-enters `this.#lookup` as a fourth query;
if *that* is still zero, `not_in_catalogue` returns exactly as it does today.

**What this is not.** It is not a replacement for the two-pass model. Pass 1 (EXTRACT)
and the pick pass are untouched. It does not run on the barcode path, which short-
circuits earlier and where "fact beats opinion" already holds. It does not run when the
cascade returns anything at all. On the repo's own dry-run numbers — 40 of 40 handed to
the catalogue from a perfect reading — **this code path would have executed zero times.**
That is the honest size of the prize as currently measured, and it is measured against a
perfect reading rather than a real one, which is the next section.

---

## What would have to be true for this to pay

The condition is one number, and **that number does not exist.**

`docs/the-photo-path.md` section 6 states the position plainly, and it has not changed:
*"No photo has gone through the real model, because this machine has no Anthropic key."*
The eval set is forty Open Food Facts photos; the only result ever produced is the dry
run — a perfect reading handed to the catalogue — which scored 40 of 40 and measures the
catalogue lookup, not the model. Section 5 of that same doc makes the dependency
explicit: *"`node identify/eval/run.ts` prints a top-1 number. That number, not this
document, decides whether the parked items come back."*

So: **this item cannot be justified today, and this document does not pretend otherwise.**
Every route above is priced against a benefit whose size is unknown. The miss rate that
would make a $3.50/1,000 call worth adding is the miss rate nobody has measured. If the
real top-1 comes back high, the `candidates.length === 0` branch fires rarely, and a
route that only runs on that branch is worth close to nothing regardless of its price. If
it comes back low, the same doc's recorded reverses-if applies — *"the photo path is
demoted to a suggestion and the barcode stays the only identity"* — and a cheaper visual
search does not rescue a demoted path.

The unblock is unchanged and is not a research task: **$5 of prepaid Anthropic credit,
about eight full eval runs at roughly $0.60 each, key in repo-root `.env`**
(`docs/the-photo-path.md` section 6). Until that runs, item 23 is a priced option, not a
decision.

---

## Recommendation, and its falsifier

**Recommendation.** Do not build any of the six routes now. Hold item 23 as **specified
and blocked on `identify/eval/run.ts`**, with Google Cloud Vision **Web Detection**
($3.50/1,000, no index, no catalogue, no vendor in the middle) named as the route it
would take if it is ever built, plugged in at the `candidates.length === 0` branch of
`IdentifyStage.fromCrop` and used **only** to recover a name or GTIN string that
re-enters `this.#lookup` — never to follow the URLs it returns, which is the killed
scraping method under another name.

**Falsifier.** A real eval run whose top-1 is at or above the floor, *and* whose
`not_in_catalogue` count across forty photos is zero or one. Either of those kills this
item outright rather than deferring it: a path that fires on one photo in forty does not
earn a vendor, a key and a seam. Conversely, if the run shows a `not_in_catalogue` rate
above one in five, Web Detection gets a 40-photo bake-off of its own against that same
set, and its Canadian coverage — unknown and unmeasurable from outside today — becomes a
measured number for the first time.

**Reopens on.** Vision Product Search leaving maintenance mode *and* this repo acquiring
a product-photo corpus large enough to index, which are two separate things and both are
currently absent. SerpApi reopens only on Aurik reversing the 2026-09-13 direction
decision with new evidence, not on a price change.

---

Sources not otherwise inlined: https://cloud.google.com/vision/pricing (2026-09-13),
https://cloud.google.com/vision/product-search/pricing (2026-09-13),
https://docs.cloud.google.com/vision/docs/detecting-web (2026-09-13),
https://docs.cloud.google.com/vision/docs/deprecations (2026-09-13),
https://docs.cloud.google.com/vision/product-search/docs and .../docs/quickstart (2026-09-13),
https://ai.google.dev/pricing (2026-09-13),
https://ai.google.dev/gemini-api/docs/image-understanding (2026-09-13),
https://serpapi.com/pricing and https://serpapi.com/google-lens-api (2026-09-13),
https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement (2026-09-13),
https://futureagi.com/llm-cost-calculator/vertex-ai/multimodalembedding (2026-09-13, second-hand),
https://www.nops.io/blog/vertex-ai-pricing/ and https://www.finout.io/blog/top-16-vertex-services-in-2026 (2026-09-13, second-hand),
https://www.ximilar.com/pricing/ and https://www.visenze.com/ai-visual-search/ (named, not opened in depth),
plus the repo files cited inline (`identify/src/identify.ts`, `docs/the-photo-path.md`,
`QUEUE.md`, `research/competitors/retailer-apps-and-visual-search.md`,
`research/price-sources/34-price-source-enumeration.md`) at the dates their own headers carry.
