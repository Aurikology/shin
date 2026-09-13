# Item 38: the Lens pipeline, its metrics, and Google's product data through a front door

Researched 2026-09-13. His words: **"or if we could use its metrics and pipelines for SHIN."**
That is a different question from whether Lens may be *called*, which another lane answers.
This item asks what Shin can legitimately **learn and rebuild** from how Lens-class visual
product search works, what this field **measures** and what `identify/eval/run.ts` should
adopt, and what Google product and price data Shin can obtain **through a front door**.

Copying an architecture is not copying a product. Ideas and methods do not carry the
protection code and trademarks do, so Part A is an engineering exercise with one eye on what
Google **documents** versus what engineers **infer**. Part C is the opposite: it is entirely a
terms question, and it is the part most likely to change the plan.

**What this builds on and does not repeat.** `research/price-sources/36-visual-product-search.md`
(2026-09-13) enumerates the six *callable* routes and their prices; none of that is restated.
`research/competitors/retailer-apps-and-visual-search.md` (lines 128-159) records the consumer
Lens product, the 45-billion-product Shopping Graph figure **labelled a company claim**, that
the model is **not confirmed to be Gemini**, and that the one part worth taking is image plus
text refinement in the same query. Those findings stand; this file builds past them.

---

## Method note

Every stage in Part A is marked **DOCUMENTED** (Google or a Google-authored paper says it),
**INFERRED** (a published method exists and the behaviour is consistent, but Google has not
said Lens uses it), or **UNKNOWN** (nothing sourced; not estimated). A patent is evidence of
what Google **filed**, never of what Lens **runs**, and is marked INFERRED at best.

**Control query for Part A:** "Google Research blog Google Lens how it works image retrieval
embedding index ScaNN reranking" returned no Google blog post describing the Lens architecture
end to end. That is the honest state of this class: **Google has never published a Lens
architecture paper.** The search did surface a Google-authored paper that describes Lens in
two sentences in passing (Encyclopedic-VQA, below), which is the best primary description
found. Control passed in the sense that the class is not empty, but it is much thinner than a
reader would expect.

**What could not be fetched.** `https://arxiv.org/pdf/2306.09224` returned binary PDF content
and could not be read directly; its text was read through
`https://ar5iv.labs.arxiv.org/html/2306.09224` instead (2026-09-13). The UCP specification
repository (`https://github.com/Universal-Commerce-Protocol/ucp`) was **not opened** this
session; every UCP claim below comes from Google's developer blog and `ucp.dev`, and the one
question that matters most about UCP is explicitly left unresolved in Part C.

---

# PART A — the pipeline, stage by stage, and what is actually published

## The one primary Google description of Lens that exists

Google Research's own Encyclopedic-VQA paper (Mensink, Uijlings, Castrejón et al., Google
Research, arXiv 2306.09224, June 2023, read 2026-09-13) describes Lens in full as:

> "Google Lens is an image retrieval system which indexes a huge amount of web images. Given a
> query image, it finds other images based on their visual similarity and relevance to objects
> it recognizes in the query image. It returns the most similar indexed images along with an
> entity prediction based on these top-ranked images."

Four things are DOCUMENTED by that sentence and nothing else in it is: (1) it is **retrieval
over an index of web images**, not a generative model answering from weights; (2) the index is
of **images**, and the products come later; (3) there is an explicit **object recognition step
on the query** that retrieval is scoped to; (4) the final answer is an **entity prediction
aggregated over the top-ranked results**, i.e. there is a second stage after retrieval.

That last point is the architectural claim worth the most to this repo, and it is Google's own
words: **Lens does not classify the photo. It retrieves, then decides over what it retrieved.**

---

## Stage 1 — region proposal: which part of the image is the product

| | |
|---|---|
| **Status** | **INFERRED.** Google's paper says Lens finds images relevant to "objects it recognizes in the query image," which states that objects are recognized but not how they are proposed. |
| **What is documented adjacent to it** | Google's *own commercial* product built by the adjacent team documents exactly this stage: Cloud Vision Product Search's multi-object detection returns **normalized bounding-box vertices** and `productGroupedResults` when several products appear in one photo (item 36, from Google's Product Search docs, 2026-09-13). The Lens UI's draggable selection box is the same thing exposed to a user. |
| **Patents (INFERRED only)** | Google holds filings covering this exact stage: `US20140089326A1` "Image Search by Query Object Segmentation" (query-object localization, segmentation and retrieval against a database using spatially constrained similarity), `US8494983B2` / `US20120123976A1` "Object-Sensitive Image Search", and `US20130013578A1` "Object retrieval using visual query context" (a saliency map used as a prior over search intent). Read via patents.google.com 2026-09-13. **These prove what Google filed, not what Lens runs.** |
| **UNKNOWN** | Which detector, whether it runs on-device or server-side, and whether it is class-agnostic or trained on a product taxonomy. |

## Stage 2 — embedding and index

| | |
|---|---|
| **Status** | Index **DOCUMENTED in kind** ("indexes a huge amount of web images", "visual similarity"), **UNKNOWN in construction.** No embedding model, dimensionality, index type or ANN algorithm is published for Lens. |
| **What is documented** | Google built, published and open-sourced the ANN algorithm that a system of this shape would use: **ScaNN**, presented at ICML 2020 as "Accelerating Large-Scale Inference with Anisotropic Vector Quantization" (Guo, Sun, Lindgren, Geng, Simcha, Chern, Kumar, Google Research; https://proceedings.mlr.press/v119/guo20h/guo20h.pdf and https://research.google/blog/announcing-scann-efficient-vector-similarity-search/, read 2026-09-13). Its stated problem is that maximum-inner-product search over a database "easily in the millions or even billions" is the inference bottleneck, so the database vectors are compressed and the quantization objective is aligned to MIPS rather than to reconstruction error. ScaNN is what Vertex AI Vector Search runs on — i.e. **route 3 of item 36 is ScaNN sold by the node-hour.** |
| **INFERRED** | That Lens uses ScaNN or a close relative. Consistent, unstated, and not asserted here. |
| **Refresh cadence** | **UNKNOWN for the image index.** The only published refresh figure Google gives anywhere in this area is for the *Shopping Graph*, not the image index: "more than 50 billion product listings" of which "every hour more than 2 billion of those product listings are refreshed on Google" (https://blog.google/products/shopping/google-shopping-ai-mode-virtual-try-on-update/, 2025-05-20, read 2026-09-13). **COMPANY CLAIM about its own product.** Note this supersedes the 45-billion figure recorded in the competitors file; that file's number was correct at its date. |
| **The contrast worth keeping** | Google's *commercial* index, Cloud Vision Product Search, rebuilds **approximately daily** (item 36). Google's *consumer* Shopping Graph claims hourly at the two-billion-row scale. Whatever Lens runs on, the thing Google will sell a small team is two to three orders of magnitude slower to refresh than the thing Google runs for itself. |

## Stage 3 — re-ranking

| | |
|---|---|
| **Status** | **DOCUMENTED that a second stage exists** — "an entity prediction based on these top-ranked images" is by definition a decision made *after* retrieval, over the retrieved set. **UNKNOWN what performs it and what signals feed it.** |
| **What is documented in the open field** | The two-stage shape is standard and published: a fast embedding search returns a small candidate set and a more expensive model reorders it. The Google-Landmark-competition literature is the closest published instance — "Two-stage Discriminative Re-ranking for Large-scale Landmark Retrieval" (https://arxiv.org/pdf/2003.11211, read 2026-09-13) — and it is **landmarks, not products, and not Lens.** |
| **Signals** | **UNKNOWN.** No source found names what Lens re-ranks on. Do not assume text, popularity, or merchant-feed agreement. |

## Stage 4 — how text refinement combines with the image query

| | |
|---|---|
| **Status** | The **feature** is DOCUMENTED. The **mechanism** is UNKNOWN, and one common assumption about it is documented to be wrong. |
| **What Google says** | Multisearch, announced 2022-04-07: "With multisearch in Lens, you can go beyond the search box and ask questions about what you see" — take a photo, "swipe up and tap the '+ Add to your search' button to add text." Examples given: a screenshot of an orange dress plus the query "green"; a photo of a dining set plus "coffee table". https://blog.google/products-and-platforms/products/search/multisearch/ (read 2026-09-13). |
| **The correction** | The same post says only that it is "made possible by our latest advancements in artificial intelligence" and that Google is "exploring ways in which this feature might be enhanced by MUM." **Multisearch did not launch on MUM.** Anyone describing Lens's image-plus-text fusion as MUM-powered, or Gemini-powered, is stating something Google has not. This is the same discipline the competitors file already applied to the Gemini question, applied to the second model name. |
| **Why it still matters** | The *mechanism* being unknown does not diminish the *idea*, which is the one part the competitors file already flagged as worth taking. The idea is cheap and vendor-free: a second, cheaper query with a user-supplied qualifier, run against the same index, instead of a dead end. |

## Stage 5 — how a visual match becomes a SKU with offers attached

This is the stage where the published record is clearest, and it is the most important stage
for Shin because it is the one Shin has already got right.

- **DOCUMENTED:** the offers do not come from the image. They come from the Shopping Graph,
  which is an aggregation of **merchant feeds** — "product listings, from global retailers to
  local mom and pop shops, each with details like reviews, prices, color options and
  availability" (blog.google, 2025-05-20, COMPANY CLAIM). Merchants push that data to Google
  through Merchant Center; Part C is entirely about that pipe.
- **DOCUMENTED that the join key is GTIN**, from a completely independent direction: Google's
  own price-competitiveness benchmark is computed from "all retailers selling a product with
  the same GTIN in Shopping ads and organic listings" (Merchant API reports docs, Part C).
  Google's own price aggregation is GTIN-keyed.
- **UNKNOWN:** how a retrieved image is bound to a product cluster, and therefore how Google
  handles the exact failure this repo already names — a visual match to the wrong size variant
  or the wrong multipack.

**The transferable conclusion, and it is the single most valuable sentence in Part A:** Google
never derives a price from a picture. The visual stage only selects an identity; the price
arrives separately, from feeds, keyed by GTIN. **That is already Shin's architecture** —
`identify/src/` produces an identity, `price/src/sources.ts` produces the price, and the two
meet on `code`. Part A's main finding is therefore a confirmation, not a change: the most
sophisticated system in this category separates identity from price exactly the way this repo
already does, and any proposal to have a vision model "read the price off the shelf" is moving
*away* from the reference architecture, not toward it.

---

## Stage by stage against Shin's two-pass path

| Lens-class stage | Shin today | Verdict |
|---|---|---|
| **Region proposal** | **Shin has it, and earlier.** `app/src/eye/capture.ts` `cropTo` does a burst-scored, object-cropped, 1568 px long-edge PNG **on the device**, before any call (decision 12, `docs/the-photo-path.md` section 0). Lens does this server-side on a full frame. | **Already built, and structurally cheaper** — the bytes never leave the phone uncropped, so the tokens are never paid for. Nothing to take. Specifically: this is why the parked **YOLO tag detector** stays parked. Shin already has a proposal step; a second one would propose inside a crop. |
| **Embedding + ANN index** | **Absent, deliberately.** `docs/the-photo-path.md` parks "SigLIP/CLIP embeddings over catalogue photos" with the reopen condition "only if the measured top-1 says the text path cannot get there." | **Not transferable today, and not for want of money.** The repo holds **212,340 catalogue rows and 40 product photos.** An image index needs a photo per row. The blocker is a corpus, not a GPU, and item 36 priced the same wall a second way. |
| **First-stage retrieval (candidate generation)** | **Shin has one — it is just not visual.** The three-query cascade in `IdentifyStage.fromCrop` (q1 brand+name+variant pinned, q2 brand+name, q3 name+front_text unpinned), union, dedupe by code, top 10. | **This IS the candidate-generation stage**, running over text instead of vectors. Recognising that renames the eval problem in Part B: Shin has a retriever whose **recall has never been measured separately.** |
| **Re-ranking** | **Shin has it, and it is the same shape Google's paper describes.** The pick pass sends the image plus ten catalogue rows to Sonnet 5 and asks for one index. A large model scoring a small candidate set is a cross-encoder re-ranker. | **Already built.** This is the one stage where Shin matches the published architecture directly rather than approximating it — and per the Gemini research pass it is where the 85-92% cascade number comes from. Nothing to take; something to defend. |
| **Image + text refinement in one query** | **Absent.** The unsure path ends at `identity_unsure` with candidates and a "not this?" affordance (decision 17); there is nowhere to type "the 750 mL one". | **The one genuinely transferable idea, and it needs no vendor, no key and no model call.** A typed qualifier re-entering `this.#lookup` as a fourth query is a catalogue search, not an API call. |
| **Visual match → SKU with offers** | **Shin already separates them**, identity in `identify/`, price in `price/src/sources.ts`, joined on `code`. | **Confirmed by the reference architecture.** No change. |
| **Web search on a miss** | Parked. Item 36 keeps it parked and prices the door. | Unchanged by this file. Part A adds one argument *against* reopening it: on the repo's own dry run the `candidates.length === 0` branch fires **zero times in forty**. |

**The transferable set, in full: one idea (text refinement), one confirmation (identity and
price are separate stages, joined on GTIN), one defence (the pick pass is already the
re-ranker; do not let it be replaced by a single-pass classifier), and one measurement
(Part B).** Everything else Lens does, Shin either already has or cannot feed.

---

# PART B — the metrics

## What the field measures

| Metric | What it is | Fit for Shin |
|---|---|---|
| **top-1 / top-k accuracy** | Fraction of queries whose correct item is ranked first / in the first k. The standard number on classification-framed product datasets (Products-10K, RP2K). | **Already measured** (top-1, top-3). |
| **Recall@K** | Fraction of queries for which the correct instance appears anywhere in the top K. The standard metric for instance-level retrieval (Stanford Online Products, ABO). | **The gap.** Shin measures end-to-end top-1/top-3 and never measures the *cascade's* recall@10 on its own — which is exactly the number that says whether a miss was the retriever's fault or the pick pass's. |
| **mAP** | Mean average precision over a ranking with several relevant items. Standard in landmark/instance retrieval. | **Do not adopt.** Shin has exactly **one** correct row per photo, so mAP collapses to mean reciprocal rank. **Adopt MRR instead** if a single ranking scalar is wanted; it is the same computation without the false implication of multiple relevant items. |
| **cost per correct identification** | Shin's own comparator in `run.ts --matrix`. | **Keep it.** The published literature ranks by accuracy at fixed compute; it does not rank by cost per correct answer. This repo's comparator is better suited to the decision it actually faces and should not be traded for a field-standard one. |

## The benchmarks

| Dataset | Size | Shape | Relevance to Shin |
|---|---|---|---|
| **Products-10K** (arXiv 2008.10545, 2020) | ~10,000 SKU-level products, ~150,000 images, from JD.com; every image checked by at least three human experts, stated noise rate under 0.5% | Catalogue-style product photos, classification framing | Closest to a **catalogue-image** index. Note the labelling standard — three experts per image — against Shin's 40-row manifest. |
| **RP2K** (arXiv 2006.12634, 2020) | 500,000+ images of 2,000 products, **captured manually in physical retail stores under natural lighting**, annotated with size, shape and flavour/scent | Shelf photography, fine-grained | **The closest published analogue to Shin's actual use case** — a phone, a shelf, bad light — and the only one whose annotations name *size and flavour*, which are precisely the failure modes `docs/the-photo-path.md` section 1 lists. |
| **Amazon Berkeley Objects (ABO)** (CVPR 2022) | 147,702 product listings, 398,212 catalogue images | Cross-domain multi-view retrieval | Carries the most useful calibration number in this section: an **ImageNet-trained ResNet-50 baseline reaches Recall@1 of only 5%** on ABO's cross-domain retrieval task. Off-the-shelf embeddings are *bad* at instance-level product retrieval. That is an argument against the parked CLIP/SigLIP item that does not depend on Shin's own unmeasured top-1. |
| **Stanford Online Products (SOP)** | 120,053 images, 22,634 product instances, 12 categories | The standard deep-metric-learning retrieval benchmark | Reference only. |
| **Visual Product Search Benchmark** (arXiv 2603.17186, 2026-03-17, Govindappa; results at benchmark.nyris.io) | Not stated in the abstract | Image-to-image retrieval, **no post-processing**, comparing foundation embedding models, proprietary multimodal embedding systems and vision-only models across manufacturing / automotive / DIY / retail | The **newest** thing in the class and the only one framed as a vendor bake-off. **Its numbers were not read this session** — only the abstract was fetched, and the abstract gives none. Anyone planning on it must open the paper. |

## Published accuracy numbers for Lens

**One measured number exists in the open literature, and Google published it about itself.** In
Encyclopedic-VQA (Google Research, 2023), Lens is used as the retrieval backend and graded:

> "the correct Wikipedia article corresponding to the subject of the question is retrieved in
> the first position only 47.4% of the time"

with 45.6% at the finer KB-section granularity (ar5iv.labs.arxiv.org/html/2306.09224, read
2026-09-13).

**Read this carefully.** It is Wikipedia-article retrieval over fine-grained natural-world and
landmark subjects, **not product retrieval**, and it must never be quoted as "Lens is 47%
accurate on products." What it *is* good for is calibration in the other direction: the one
time Google measured Lens in public, on a hard fine-grained task, with its own authors holding
the ruler, the top-1 was **not** a nineties number. Any internal target that assumes a Lens-like
system trivially reaches 95% is not supported by anything published.

**Company claims, labelled as such, with no accuracy content:** ~20 billion Lens visual
searches per month with roughly 20% shopping-related, attributed to Google in October 2024 —
**second-hand this session**, reported by multiple outlets; Google's own primary post was not
fetched, so the figure is carried as reported, not as read. 50 billion Shopping Graph listings
with 2 billion refreshed hourly — **first-hand** from blog.google (2025-05-20), and a claim
about scale, not quality. **No competitor (Amazon StyleSnap, Pinterest Lens) publishes a
retrieval accuracy figure either.** That absence is itself the finding: nobody in this category
publishes an accuracy number, so there is no external bar for Shin to hit, and the only bar
that will ever exist is the one `identify/eval/run.ts` prints.

## What is missing from Shin's eval, and what it costs to add

`run.ts` currently prints: top-1, top-3, unreadable count, pass-2 rate, p50/p95 ms, estimated
cost, and `--matrix` cost per correct identification. Five things are missing. Four are free.

| Missing | Why it matters | Cost to add |
|---|---|---|
| **1. Cascade recall@10, measured separately from the pick pass** | This is the field's core diagnostic and the biggest single gap. Today a wrong answer is one number and could mean either "the catalogue never surfaced the right row" or "the right row was there and the pick pass chose wrong." Those two failures have opposite fixes — one is a catalogue/query problem, the other is a prompt/model problem — and the eval cannot tell them apart. | **$0 and a small change.** The candidate list is already in the outcome; count whether `row.code` appears anywhere in it, before the pick. Roughly the same code that already computes `top3`. **Do this first.** |
| **2. A negative set — photos of products known to be absent from the catalogue** | All 40 manifest rows are in-catalogue by construction. The false-positive rate is therefore **structurally unmeasurable**, and 40/40 on the dry run cannot distinguish "correct" from "always names something." This also makes the one branch item 36 is about — `not_in_catalogue` — untestable, which is why that branch fires zero times. | **$0 in money, hand work in photos.** Ten Open Food Facts images whose GTIN is *not* in the local catalogue, with `code: null` as the expected answer. The runner already skips rows with no recorded answer, so the grading arm has to be written. |
| **3. n=40 is too small to separate the hypotheses that matter** | At n=40, an observed top-1 of 90% carries a 95% binomial confidence interval of roughly **77% to 97%**. A run cannot distinguish 85% from 95%, and "did prompt tuning help" cannot be answered by two runs at this size. | **About $3 per run at 200 photos** (the repo's own $0.015 worst-case per scan), against $0.60 today. The photos are free from Open Food Facts; the labour is the manifest. |
| **4. Per-failure-mode slicing** | `docs/the-photo-path.md` section 1 names four failure modes — identical-looking size variants, multipack vs single, mimicking store brands, French-face packaging on an English catalogue. The eval slices by **none** of them, so a top-1 number cannot say which one is costing the points, and RP2K's annotators thought size and flavour were worth labelling for exactly this reason. | **$0.** Four boolean columns in `manifest.json`, hand-set on 40 rows, and a per-slice breakdown in the summary block. |
| **5. MRR in place of a second ranking scalar** | Gives one number for ranking quality without mAP's wrong assumption of multiple relevant rows. | **$0**, a few lines. Optional; item 1 is worth more. |

**Nothing in this list needs an API key.** Items 1, 4 and 5 improve the dry run *today*, and
item 2 makes the not-in-catalogue branch testable for the first time. That matters to Part D.

---

# PART C — Google's data through a front door

P1 is growing the catalogue counted **by price, not rows**. This part asks what Google will
hand over legitimately. Item 36 does not cover any of it.

**Headline:** Google operates exactly one product that returns other retailers' prices to a
third party through a front door, it is real, it is free, **and its terms forbid the thing Shin
exists to do.** That sentence is the finding.

## C1 — Merchant API `products` (successor to Content API for Shopping)

| Field | Finding |
|---|---|
| **What it is** | Programmatic management of product inventory in Google Merchant Center: create, read, update, delete. https://developers.google.com/merchant/api/guides/products/overview (read 2026-09-13). |
| **Does it READ?** | **Yes, but only your own.** The `Product` resource is explicitly read-only — "You use this resource for all read operations (`get`, `list`)" — and every access-control reference is to "your account" and to "client accounts" (sub-accounts you already manage). **No mechanism exists for reading another merchant's data,** which is the expected answer and is now confirmed rather than assumed. |
| **Eligibility (Canadian, pre-revenue)** | A Merchant Center account requires being a merchant with products to list. Shin sells nothing. |
| **Cost** | $0 for the API. |
| **Barrier** | You must *be* the merchant. **Value to Shin's P1: zero.** |
| **Timing trap** | The predecessor, Content API for Shopping v2.1, is **deprecated and shuts down 2026-08-18**, with progressive errors from **2026-09-01** — i.e. **already begun**. Merchant API v1beta was discontinued 2026-02-28. Any tutorial or third-party library targeting Content API is writing dead code today. (https://developers.google.com/merchant/api/latest-updates and https://developers.google.com/shopping-content/guides/rel-notes, read 2026-09-13.) |

## C2 — Merchant API **Reports / Market Insights**: the price competitiveness report

**This is the one that returns other retailers' prices, and the one that is closed by terms.**

| Field | Finding |
|---|---|
| **What it returns** | `accounts.reports.search` over `price_competitiveness_product_view` returns `id`, `title`, `brand`, `price`, `report_country_code` and **`benchmark_price`** — "how other retailers are pricing the same products that you sell." https://developers.google.com/merchant/api/guides/reports/understand-the-market (read 2026-09-13). |
| **How the benchmark is built** | "the prices used to calculate a benchmark are taken from **all retailers selling a product with the same GTIN** in Shopping ads and organic listings." This is real aggregated multi-retailer price data, GTIN-keyed, from Google's own feed corpus. |
| **Sibling report** | `best_sellers_product_cluster_view` returns `rank`, `previous_rank`, `relative_demand`, `relative_demand_change`, `title`, `brand`, `category_l1/l2/l3`, **`variant_gtins`**, `inventory_status` — best-selling products and brands on Google by category and country. **No price.** As a *catalogue prioritisation* signal ("which GTINs to price first") it is interesting; whether the same restriction below covers the non-price fields is **UNKNOWN**. |
| **Eligibility** | Two gates. (a) "Your account must meet minimum eligibility requirements" and comply with Merchant Center terms — the minimum is stated only as participation thresholds in Shopping ads/Shopping Actions, and **the specific numbers were not found on any page read this session (UNKNOWN)**. (b) Price benchmarks require "a valid GTIN for your products" (https://support.google.com/merchants/answer/13798101, read 2026-09-13). Both presuppose being a merchant. |
| **Cost** | **$0.** The report is free with the account. |
| **Canada** | **UNKNOWN.** The report is country-scoped via `report_country_code` and every example on the pages read is US. No page read this session states Canadian availability either way. Not estimated. |
| **THE BARRIER, quoted** | From Google's own help page (support.google.com/merchants/answer/13798101, read 2026-09-13): **"The Pricing reports are only available for the internal use of the retailer or those acting on the retailer's behalf. Pricing data can't be resold, publicly displayed, advertised, or aggregated across businesses."** |

**Why that quote matters more than any price in this file.** Shin's entire product is showing a
shopper a price verdict. That is *publicly displaying* price data, and doing it across
retailers is *aggregating across businesses*. Both are named prohibitions. This route is not
expensive and not technically hard — **it is closed, and closed by a sentence, not by a
paywall.** It would only ever be open to Shin as a merchant reasoning about its own pricing,
which Shin is not. Record it as closed on terms so that a future session that rediscovers
`benchmark_price` does not spend a day being excited about it.

## C3 — the Comparison Shopping Service (CSS) programme

| Field | Finding |
|---|---|
| **What it is** | Google's remedy programme from the EU Shopping antitrust case. A CSS places Shopping ads and free product listings **on behalf of merchants**. https://support.google.com/css-center/answer/7524491 (read 2026-09-13). |
| **Is it open to Canada?** | **No.** The programme operates in 21 named countries: Austria, Belgium, Czechia, Denmark, Finland, France, Germany, Greece, Hungary, Ireland, Italy, the Netherlands, Norway, Poland, Portugal, Romania, Slovakia, Spain, Sweden, Switzerland and the United Kingdom — the EEA plus Switzerland and the UK. **Canada is not among them**, and a CSS must "have a registration in at least one country where the CSS programme is available." |
| **What it takes to become one** | Operate a public comparison shopping website that lets users "search and compare different products" and "compare the price and selling conditions"; a working search box "not primarily based on licensed Google technology"; sort/filter by price **and at least one other dimension**; **"show products offered by at least 50 distinct merchant domains for every country"**; public access with no sign-up; **not** primarily a marketplace transacting on your own domain; and no shared name or logo with a business that sells physical goods. |
| **Cost** | **UNKNOWN.** The requirements page states no fee. Not estimated. |
| **The deeper reason it does not help** | Even setting geography aside: **a CSS is an ads placement channel, not a data feed.** Nothing on the requirements page grants a CSS read access to other merchants' prices; the 50-merchant-domain rule is a *precondition* you must already satisfy — you must already have the price data to qualify — not a benefit you receive. For a Canadian pre-revenue app it is doubly out: wrong geography, and it asks for the thing P1 is trying to obtain. |

## C4 — Google Shopping affiliate / partner programmes

**Searched; nothing found that returns structured offers to a third party.** The search
"Google Shopping affiliate program structured product offers API 2026" surfaced only the
Merchant API itself, the Promotions sub-API (publish *your own* promotions), and non-Google
affiliate networks. The one adjacent thing Google does operate is **YouTube Shopping affiliate
analytics** in the Reports sub-API (v1alpha), which reports performance of creators and
products **in your own account** — analytics, not a catalogue. **This is a reported thin
result, not a proven absence**: no Google page saying "there is no such programme" was found,
and the honest state is that one session's search did not find one.

## C5 — Content API `products` / `productstatuses`: can a third party read another merchant?

**No. Confirmed, as expected.** Both the deprecated Content API v2.1 and its Merchant API
successor scope every read to the authenticated Merchant Center account and its own client
sub-accounts (C1 above). There is no cross-merchant read, no public product lookup by GTIN, and
no third-party authorization path that exposes another merchant's price. Recorded as a
confirmed negative so nobody re-checks it.

## C6 — Universal Commerce Protocol (UCP) — the one live thread

| Field | Finding |
|---|---|
| **What it is** | An **open standard for agentic commerce**, published by Google and co-developed with Shopify, Etsy, Wayfair, Target and Walmart, endorsed by 20+ others. Spec at https://github.com/Universal-Commerce-Protocol/ucp; developer post https://developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/ (2026-01-11, read 2026-09-13); site https://ucp.dev/ (read 2026-09-13). |
| **The shape that matters** | **"Businesses publish the services they support and corresponding capabilities in a standard JSON manifest located at `/.well-known/ucp`."** Capabilities are described as "core commerce building blocks such as checkout and product discovery," and "UCP's discovery mechanism allows agents to dynamically discover business capabilities and payment options via profiles." `ucp.dev` names **"Catalog Search and Lookup"** among supported capabilities. |
| **Who may build a client** | Apparently **any developer** — "an evolving open-source standard designed to be community-driven... We invite you to build." Google's *own* implementation (the checkout button in AI Mode and Gemini) requires the merchant to hold a Merchant Center account, but that is a gate on Google's surface, not on the protocol. |
| **Cost** | **$0.** It is a specification. |
| **The unresolved question, stated plainly** | **Whether UCP's catalog capability returns searchable products with prices, or only resolves items an agent has already identified in order to build a cart, is UNKNOWN.** `ucp.dev` names the capability; neither page read this session specifies an endpoint, a request shape, or a response containing a price. **The spec repo was not opened.** Everything about UCP's value to P1 hangs on that one question, and it is answerable by reading one repository. |
| **Why it is not the killed method** | A merchant publishing a machine-readable manifest at `/.well-known/ucp` is the same class of artefact as `robots.txt` or a sitemap: an endpoint the retailer has deliberately published for machines. The closed register's kill is "direct retailer page **scraping**" — reading prices off HTML the site serves to browsers, which four Canadian retailers answered with 403 or a nav menu. Reading a published manifest is not that. **This distinction is flagged for the boss to rule on, not assumed settled by this lane.** |
| **The measurement nobody has run** | How many Canadian retailers serve `/.well-known/ucp` **today** is **UNKNOWN**. It is one HTTP GET per retailer against the names already in this repo — Walmart.ca, Loblaws, Metro, Canadian Tire, Best Buy Canada, Costco.ca, IKEA.ca, Sobeys, London Drugs, Canada Computers. Ten requests. Walmart is a named co-developer of the protocol, which makes Walmart.ca the highest-probability hit and is the reason this thread is worth an afternoon. |

## C7 — everything else Google operates, briefly

- **Custom Search JSON API** — returns web and image results from a Programmable Search Engine.
  100 free queries/day, then **$5 per 1,000 up to 10,000/day**. **Closed to new customers**,
  with existing users required to migrate by **2027-01-01**; Google points at Vertex AI Search
  instead. https://developers.google.com/custom-search/v1/overview (read 2026-09-13). A new
  signup cannot use it, and it returns no prices. **Door shut.**
- **Vertex AI Search for commerce / Retail API** — search and recommendations over **your own**
  uploaded catalogue. Same shape as item 36's routes 2, 3 and 6 and adds no external data.
- **Knowledge Graph / entity APIs** — entities, not offers. No price dimension.
- **Cloud Vision Web Detection** — item 36 route 1; returns strings and URLs, not prices, and
  the closed register forbids following those URLs to read a price.

## Part C summary table

| Route | Returns other merchants' prices? | Cost | Canadian pre-revenue eligibility | Barrier |
|---|---|---|---|---|
| Merchant API `products` | No — own account only | $0 | Must be a merchant | Not a data source at all |
| **Merchant API price competitiveness** | **Yes — `benchmark_price`, GTIN-keyed** | **$0** | Must be a merchant with GTINs and meet unstated Shopping minimums; **Canada availability UNKNOWN** | **Closed by terms: "can't be resold, publicly displayed, advertised, or aggregated across businesses"** |
| Best sellers report | No price; `variant_gtins` + demand rank | $0 | Same merchant gate | Same terms umbrella, scope on non-price fields UNKNOWN |
| CSS programme | No — an ads channel | UNKNOWN | **Ineligible: Canada not in the 21 countries** | Geography, plus it presupposes the data |
| Google Shopping affiliate | None found | n/a | n/a | Thin result, not a proven absence |
| Content API cross-merchant read | **No — confirmed** | n/a | n/a | Does not exist |
| **UCP `/.well-known/ucp`** | **UNKNOWN — the open question** | **$0** | **No Google gate on the client side** | Unread spec; unmeasured Canadian adoption |
| Custom Search JSON API | No | $5/1,000 | **Closed to new customers** | Shut before it starts |

---

# PART D — the honest close, and the ranking

## The constraint that dominates

Two facts govern everything above, and neither has moved:

1. **No photo has ever gone through a real model from this repo.** The only result that exists
   is the dry run — a perfect reading handed to the catalogue — scoring 40 of 40. That measures
   the catalogue lookup, not the model (`docs/the-photo-path.md` sections 5 and 6).
2. **The catalogue-miss branch that any visual search would serve fires zero times in that
   run.** `candidates.length === 0` never happened across forty photos.

So any proposal to *add a stage* is a proposal to serve a branch that has never fired, priced
against a benefit whose size is unknown. That is Part A's problem, and it is why Part A ranks
last despite being the most interesting part of this file.

## The ranking

**1. PART C.** It is the only one of the three that serves **P1, the stated top priority**, and
the only one **not blocked on the missing API key.** It produced one closed door worth
recording permanently (the price-competitiveness terms, which will otherwise be rediscovered
and misread as an opportunity) and one live thread that is an afternoon of work: read the UCP
spec's catalog capability, then GET `/.well-known/ucp` on the ten Canadian retailers this repo
already names. Ten requests answer whether a free, published, machine-readable Canadian price
feed exists in 2026. Nothing else in this file has that ratio.

**2. PART B.** Four of the five missing measurements cost **$0 and no key**, and one of them —
splitting cascade recall@10 from pick-pass precision — converts every future eval run from one
number into a diagnosis. It ranks below C only because it improves the resolution of a
measurement **nobody has funded yet**; a sharper instrument aimed at nothing still measures
nothing. If the $5 lands, B moves to first the same hour.

**3. PART A.** Its honest yield is one buildable idea (a typed qualifier re-entering
`this.#lookup` on the unsure branch — no vendor, no key, no model call), one confirmation that
the existing identity/price split is the reference architecture, and one defence of the pick
pass as a genuine re-ranker. Everything else it describes, Shin either already has (the crop,
the candidate generation, the re-rank) or cannot feed (an image index needs a photo per row;
the repo has 40 for 212,340). It ranks last because building from it means building for a
branch that fires zero times.

## Falsifier for this ranking

**C loses first place if** the UCP specification's catalog capability turns out to be
checkout-scoped — resolving items an agent has already identified in order to build a cart,
rather than a searchable catalogue returning prices — **or** if `/.well-known/ucp` returns 404
on all ten named Canadian retailers. Either observation kills C's first place outright rather
than deferring it, and B takes first, because C's entire rank rests on one unread document.

**A promotes above B if** a real eval run prints a top-1 below the floor **and** a
`not_in_catalogue` rate above one in five. That is the same condition item 36 already wrote,
and it is the only observation that makes the miss branch real enough to deserve a stage.

**B promotes above C the moment a key exists**, because at that point the measurements in Part
B are no longer an instrument aimed at nothing.

**Reopens on.** The price-competitiveness route reopens only if Google changes the quoted
internal-use clause, or if Shin ever becomes a merchant with its own GTIN'd listings — a
business change, not an engineering one. CSS reopens only if Google extends the programme
beyond the EEA/Switzerland/UK, which would be a published announcement, not an inference.

---

## What this lane could not verify

- **The UCP catalog capability.** The spec repo was not opened. This is the single largest
  unread thing in the file and the ranking above depends on it.
- **Canadian availability of the Merchant Center price-competitiveness report.** Every example
  on every page read was US. Unknown either way.
- **The "minimum eligibility requirements"** for Market Insights. Stated as existing, never
  quantified on any page read.
- **CSS programme fees.** Not stated on the requirements page.
- **Whether the best-sellers report's non-price fields carry the same no-public-display
  restriction** as the pricing reports. The restriction quote is specific to Pricing; the
  broader "complies with Merchant Center terms" sentence covers Market Insights generally.
- **The Lens 20-billion-searches-per-month figure**, carried second-hand from reporting of an
  October 2024 Google statement; Google's primary post was not fetched.
- **The Visual Product Search Benchmark's actual numbers.** Only the abstract was read; the
  21-page paper and benchmark.nyris.io were not opened.
- **Everything about Lens's internals below the four things Google's own paper states.** No
  embedding model, no index type, no re-ranking signals, no refresh cadence. Google has never
  published a Lens architecture paper, and this file does not fill that gap with inference
  dressed as fact.

---

Sources not otherwise inlined: https://ar5iv.labs.arxiv.org/html/2306.09224 (2026-09-13),
https://proceedings.mlr.press/v119/guo20h/guo20h.pdf and
https://research.google/blog/announcing-scann-efficient-vector-similarity-search/ (2026-09-13),
https://arxiv.org/pdf/2003.11211 (2026-09-13),
https://blog.google/products-and-platforms/products/search/multisearch/ (2026-09-13),
https://blog.google/products/shopping/google-shopping-ai-mode-virtual-try-on-update/ (2026-09-13),
patents.google.com US20140089326A1, US8494983B2, US20120123976A1, US20130013578A1 (2026-09-13),
https://arxiv.org/abs/2008.10545, https://arxiv.org/abs/2006.12634,
https://openaccess.thecvf.com/content/CVPR2022/papers/Collins_ABO_Dataset_and_Benchmarks_for_Real-World_3D_Object_Understanding_CVPR_2022_paper.pdf,
https://arxiv.org/abs/2603.17186 (all 2026-09-13),
https://developers.google.com/merchant/api/guides/products/overview,
https://developers.google.com/merchant/api/guides/reports/understand-the-market,
https://developers.google.com/merchant/api/latest-updates,
https://developers.google.com/shopping-content/guides/rel-notes,
https://support.google.com/merchants/answer/13798101,
https://support.google.com/css-center/answer/7524491,
https://developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/,
https://ucp.dev/, https://developers.google.com/custom-search/v1/overview (all 2026-09-13),
plus the repo files cited inline (`identify/src/identify.ts`, `identify/eval/run.ts`,
`app/src/eye/capture.ts`, `docs/the-photo-path.md`, `QUEUE.md`,
`research/price-sources/36-visual-product-search.md`,
`research/competitors/retailer-apps-and-visual-search.md`) at the dates their own headers carry.
