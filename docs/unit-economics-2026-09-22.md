# Shin unit economics, 2026-09-22

Jamin, 2026-09-22: *"this pricing model is a huge red flag for us. With this model we will be in the
negatives every month."* This file is the research behind the answer. Every price was read on
2026-09-22 from the source named; anything else says estimate.

## 1. What a scan costs today

One Gemini 3.x call with Google Search grounding. Search bills per QUERY: $14 per 1,000 after 5,000
free a month (ai.google.dev/gemini-api/docs/pricing). One observed scan ran 4 queries, so about
$0.056 of search plus about $0.0064 of tokens: **about $0.062 per scan not served from the cache.**
Gemini 2.5 bills per prompt ($35 per 1,000) but returns "no longer available to new users" to new
projects ahead of its 2026-10-16 shutdown (discuss.ai.google.dev), which matches what the Mac saw.

**There is no parameter that caps searches per request on Gemini 3.x.** `dynamic_threshold` decides
whether it searches, not how many times (Google Cloud grounding docs). A "search once" line in the
prompt may lower the count but nothing enforces it.

## 2. Cheaper ways to get the same answer

| Option | Cost | Source |
| --- | --- | --- |
| Gemini 3.x grounding | $14 / 1,000 queries, ~4 a scan | ai.google.dev pricing |
| Claude web search tool | $10 / 1,000 searches; `max_uses` caps it at 1 | platform.claude.com web-search-tool docs |
| Brave Search API | $5 / 1,000 | api-dashboard.search.brave.com pricing |
| Tavily | $8 down to $5 / 1,000 | docs.tavily.com |
| Exa | $7 / 1,000 | exa.ai pricing |
| SerpApi, Google Shopping, google.ca supported | about $15 to $25 / 1,000 | serpapi.com |
| Serper.dev, incl. Google Shopping | $1 down to $0.30 / 1,000 | serper.dev |
| Google Custom Search JSON API | closed to new customers | developers.google.com/custom-search |
| Gemini 3.5 Flash-Lite, no grounding | $0.30 in / $2.50 out per 1M tokens | ai.google.dev pricing |
| Claude Haiku 4.5 | $1 in / $5 out per 1M tokens | platform.claude.com pricing |

Free or cheap identity (barcode to product name):

| Source | Cost | Note |
| --- | --- | --- |
| Open Food / Beauty / Products Facts live API | free | ODbL, attribution; `app/src/open-food-facts.ts` already calls it |
| UPCitemdb | free 100 a day | upcitemdb.com/api |
| Go-UPC | $0.015 down to $0.0018 a lookup | go-upc.com/plans/api |
| Shin's own catalogue | free, 5.18M rows, 618k marked sold in Canada | ruled out of the scan path until user data comes in |

Shin's own price data is not a source yet: 896 observations over 438 products, 874 of them crowd
receipts (`price/data/prices.db`, queried 2026-09-22).

## 3. The proposed pipeline

1. Repeat-scan cache (built, `app/src/repeat-cache.ts`): any scan of a product checked in the last
   6 hours costs nothing.
2. Identity from the barcode: Open Facts, then UPCitemdb's free allowance. Free.
3. ONE Serper Google Shopping query for Canada, with the product name: $0.001 (starter) to $0.0003
   (scale).
4. ONE model call WITHOUT grounding (Gemini 3.5 Flash-Lite) reads those results and writes the same
   answer the app shows today, price math included. About 1,200 tokens in and 250 out (estimate):
   about $0.001.
5. Only if step 3 finds nothing, the current grounded Gemini call runs INSTEAD of step 4, so a scan
   is still one AI call (rule 1 in `docs/jamin-gemini-rules.md`).

**About $0.002 per uncached scan, against $0.062: roughly 30 times cheaper.** With Haiku 4.5 in step 4
it is about $0.0035. Claude's own web search would be about $0.0185, only 3 times cheaper.

Untested, and it decides everything: whether Serper's Google Shopping results cover the Canadian
stores and products testers actually scan. Test before building: take 50 real barcodes from beta
scans, run each through steps 2 to 4 and through today's call, and compare the answers row by row
(paired, thresholds set before the run, per the testing rule). Serper resells Google results; read
its terms before relying on it.

## 4. What to charge, and how many free scans

Comparables (read 2026-09-22): Flipp, Basket, Honey, Checkout 51, Rakuten and CamelCamelCamel are free
and unlimited, paid for by ads, affiliate commission or selling data. ShopSavvy charges $1.99 to
$3.99 a month or $29.99 to $34.99 a year. Yuka Premium is about $10 to $20 a year.

Benchmarks (RevenueCat State of Subscription Apps 2026; Adapty 2026): freemium download-to-paid
median 2.1 percent, **Shopping category 1.3 percent, the lowest tracked**; hard paywall 10.7 percent;
median annual price $34.80; year-one annual churn about 72 percent. Store fee 15 percent (Apple Small
Business Program under US$1M; Google Play subscriptions).

Affiliate (estimates where marked): Amazon Associates 1 to 10 percent by category, and Amazon's
product API unlocks after 10 sales in 30 days; Best Buy Canada 1 percent; Walmart Canada unclear.

## 5. The month at 10,000 users

Assumed (estimates): 8 scans per user a month, 60 percent served from the cache, so 32,000 paid
lookups; 1.5 percent of users on US$29.99 a year, which is US$2.12 a month each after the store fee.

| | Today's call | Proposed pipeline |
| --- | --- | --- |
| Lookup cost | about $1,900 | about $64 |
| Subscription revenue | about $320 | about $320 |
| Result before server costs | about -$1,580 | about +$256 |

A free user who scans 40 times a month costs about $1.00 today and about $0.03 on the proposed
pipeline (estimate, cache included). That is what decides the free allowance: at today's cost every
free scan loses money; on the new pipeline free scans are close to free.
