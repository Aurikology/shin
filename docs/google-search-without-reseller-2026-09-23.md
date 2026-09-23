# Searching Google without a reseller, 2026-09-23

Jamin's ask, 2026-09-23: "find a way to search on google without paying a company that runs the
searchs for you. Think outside the box, think of all possibilities. These can include extreme
examples like having people sit there 24 7 to do the searches or having the mac run the searches."
Two sweeps (Sonnet workers): part A, sanctioned and free routes; part B, doing the searches
ourselves, with a 5-request probe of google.ca from the PC. Both kept verbatim below.

## Corrections and limits from the reviewing session

- **Part A's "Gemini grounding gives neither name nor prices" is wrong for Shin.** Shin's live scan
  path today is a grounded Gemini 3.x call that returns prices; the model reads the search results
  and writes the prices out. What part A means is that the API returns no structured shopping
  items. Grounding is today's route, not a new one: 5,000 free search queries a month on 3.x, then
  US$14 per 1,000 queries, and one observed Shin scan used 4 queries (NOW.md, 2026-09-18), so about
  1,250 free scans a month, then about 5.6 US cents a scan in search fees alone (derived).
- **Part B's SerpApi paragraph is out of date.** Part B could not verify the suit because web search
  had run out. The earlier lookup-alternatives sweep the same day sourced it: Google sued SerpApi in
  December 2025, the DMCA claims were dismissed in July 2026, the terms-breach claims are unresolved
  (`docs/lookup-alternatives-2026-09-23.md`, part A section 3).
- **Unverified in part B, because web search ran out:** offshore assistant and Mechanical Turk
  rates, how many searches one IP can run before Google blocks it, the Century 21 v. Rogers
  citation, and App Store / Play policy on hidden web views. The probe result is first-hand.
- **Added by the reviewing session, untested:** a visible in-app browser where the shopper runs the
  Google search themselves and Shin reads the page they are looking at. It is closer to what any
  browser does than a hidden web view, but whether that still counts as "automated means" under
  Google's terms is a legal question nobody has asked.

---


# Part A, sanctioned and free routes


Checked 2026-09-23. Every fact below is sourced from the provider's own page (URL given). Target: near US$0.002/scan, under ~10s, no paid reseller (DataForSEO). Current baseline: one Gemini grounded call, ~US$0.062/scan.

**Headline finding, stated once so it isn't lost in the table: no route found, at any price, returns Google-Shopping-style multi-retailer Canadian prices to a non-merchant app.** Every Google product that touches shopping data (Merchant API, Cloud Retail/AI Commerce Search) requires you to own the product catalog being searched. Every search API checked (Google and non-Google) returns organic web links/snippets, not a structured price-comparison result. This is true independent of budget, it is not a pricing-tier problem, it is an availability-of-data-shape problem. The reseller (or a self-built live scrape/comparison pipeline, out of this task's scope) is the only route to (b) found anywhere in this research.

## Full table

| Route | Gives name / prices / both | Cost per 1,000 (free quota) | Latency | Terms that matter | Verdict |
|---|---|---|---|---|---|
| Gemini API grounding, Gemini 3.x | Neither (web snippets + readable citations/queries only) | $14.00 (paid tier only; 5,000/mo free pooled across 3.x models; no free-tier API key at all) | Not stated | Billed per underlying search query, not per prompt, a scan that fires 2 queries bills 2x | Cheapest official Google grounding; still 7x target; no shopping data |
| Gemini API grounding, Gemini 2.5 Pro/Flash/Flash-Lite | Neither | $35.00 (500–1,500 RPD free depending on tier/model) | Not stated | Billed per prompt | More expensive than 3.x; likely what the $0.062 baseline is using |
| Vertex AI grounding with Google Search | Neither | Identical to Gemini API, no Vertex discount; "Web Grounding for Enterprise" variant $45/1,000 | Not stated | Same as above | No cheaper path via Vertex |
| Vertex AI Search / Agent Search (Google-web-grounding path) | Neither | $35/1,000, same as plain grounding | Not stated | Cheap $2.50–4/1,000 tiers only apply when grounding on YOUR OWN uploaded data, irrelevant here | No backdoor discount |
| Cloud Vision API, Web Detection | Name only (bestGuessLabels + matching-page URLs); no price | $3.50 (1,000/mo free) | Not stated | None found that block use | **Closest-to-target confirmed price**; name-fallback only, unverified accuracy |
| Google Shopping (Merchant API / old Content API) | N/A | N/A | N/A | Requires an owned, administered Merchant Center account | Closed to non-merchants, confirmed negative |
| Custom Search JSON API (Programmable Search Engine) | Neither (plain web/image results; `pagemap` only reflects markup already on the page) | $5.00 (100/day free) | Not stated | **Closed to new customers; whole product discontinued 2027-01-01**; full-web search restricted to pre-2026 engines only | Dead end for a new build |
| Free PSE embeddable element/widget | Neither (widget, not a feed) | Free | N/A | ToS explicitly bars caching, storing, framing, or feeding results to an app backend (§1.3, §1.4 f/g/l) | Legally unusable for Shin |
| Knowledge Graph Search API | Neither (no "Product" entity type exists; only people/places/orgs/media) | Quota/price **not confirmed** (login-gated) | Not stated | N/A | Wrong data shape regardless of cost |
| Google Books API | Name only, ISBN subset (books only) | Quota **not confirmed** | Not stated | ToS bars charging users without separate written Google permission | Free-ish sliver of coverage (books only) |
| Google Cloud Retail API / "AI Commerce Search" | Neither (searches only your own imported catalog) | $2.50/1,000, no free daily quota | Not stated | Merchandising tool for a retailer's own store | Not applicable |
| Brave Search API | Neither (no shopping vertical) | $5.00 (~1,000/mo free via $5 credit) | Not stated | CA country-param support not confirmed | Cheapest non-Google general web API found, still no price data |
| Bing Web Search API | N/A | N/A | N/A | **Retired 2025-08-11**, per Microsoft's own docs | Dead |
| Grounding with Bing Search (Bing's replacement) | Neither, Microsoft's own docs state raw output is withheld from developers/end users | $14.00 | Not stated | Structurally can't return raw data to you | Unusable even though price looks competitive |
| Mojeek Search API | Not mentioned | £2 CPM (Startup) / £3 CPM (Business); no published free tier | Not stated | AI use explicitly permitted; caching allowed on paid tiers | Roughly Brave-competitive, less documented |
| Yandex Search API | Not mentioned | $0.21–$4.00 depending on sync/async; deferred (cheap) mode is async, fails <10s | No confirmed USD billing path for Canada | Billing only confirmed for Serbia/Dubai/Russia | Not usable from Canada as documented |
| You.com API | Not confirmed for paid tier | Free MCP: 100 queries/day, no key | Not confirmed | Not confirmed | Free tier interesting but underdocumented |
| Exa API | Not mentioned | $7.00 ($10/mo free + one-time $20 credit) | Not stated | Not confirmed | No shopping data found |
| Tavily API | Not confirmed | $8.00 PAYG (1,000/mo free) | Not stated | Not confirmed | No shopping data confirmed |
| Kagi Search API | Not confirmed | $12.00; no free API tier found | Not stated | Not confirmed | Priciest of the group |
| Marginalia Search API | Not mentioned (small independent index) | Commercial price undisclosed; free tier is non-commercial only (CC-BY-NC-SA) | Not stated | Non-commercial licence blocks Shin's use outright unless a paid deal is struck | Not usable free |
| Common Crawl (raw) | Neither directly, raw HTML, no product extraction | Free | N/A (offline) | Commercial use permitted, "seek legal counsel" | Needs your own parser; use WDC instead |
| Web Data Commons, schema.org Product extraction (offline) | Name confirmed (GTIN/`mpn` field present); price sometimes present via nested `Offer.price`, not guaranteed | Free to fetch; extraction code Apache-2.0; **data licence for the actual dataset not confirmed** | N/A (offline, build a local index) | Commercial licence of the data itself unconfirmed from official pages | Most promising offline name-index candidate, with an open licensing question |
| Open Food Facts (full dump) | Name only, confirmed no price in core dump | Free (ODbL/DbCL, explicitly commercial-use-permitted) | N/A (offline) | Food-only; Canada-specific count not confirmed (site blocked during check) | Free, real, but narrow (food barcodes only) |
| Open Prices (separate OFF project) | Price only | Free (AGPL-3.0) | N/A | Size/coverage not confirmed, site unreachable during check | Promising but unverified |
| Wikidata | Name/brand only, GTIN property P3962 confirmed to exist | Free (CC0, unrestricted commercial reuse) | N/A (offline) | None found | Right property, but no product-count stat given anywhere, coverage likely thin outside major brands |

## Ranked shortlist, what to actually try, and the fact that reverses each

1. **Cloud Vision Web Detection, $0.0035/scan, 1,000/mo free**, name-fallback only, no price. Reverses if: bestGuessLabels tested against real Shin barcode-miss cases turn out too generic/wrong to trust (this is an accuracy test nobody has run yet, not a pricing question).
2. **Web Data Commons Product extraction, built offline, near-$0 marginal cost per scan**, has a GTIN field, 279M+ product URLs from the Oct 2024 crawl. Reverses if: the dataset's actual commercial-use licence (not stated on any official page checked) turns out to prohibit redistributing extracted names inside a commercial app.
3. **Gemini 3.x grounding (paid tier), $14/1,000 = $0.014/scan, 5,000/mo free pooled**, still 7x the target and still no shopping data, but roughly 2.5x cheaper than whatever produces the current $0.062 baseline (likely 2.5-series billing). Reverses if: the model fires more than one search query per scan in practice, since 3.x bills per query not per prompt.
4. **Google Books API, free-ish, ISBN-only**, covers only the book-barcode slice of scans. Reverses if: Shin's actual scan mix is mostly non-book (makes this route marginal), or if Shin ever charges users, which needs Google's separate written permission per this API's own ToS.
5. **Open Food Facts full dump, free, food-only**, barcode-to-name for food products, no price data at all (Open Prices is a separate, unverified-size project). Reverses if: Shin's user base scans mostly non-food products, or Canadian-specific coverage (not stated anywhere official) turns out thin.

Everything else checked is either dead (Bing retired, Custom Search JSON API closed to new customers and sunsetting 2027-01-01, free PSE element ToS-barred from app use), structurally unusable (Bing's replacement withholds raw output), priced above Brave/Mojeek with no shopping data anyway, or simply does not carry the data shape (b) needs. No confirmed route anywhere in this survey delivers Canadian multi-store prices outside a paid reseller.


# Part B, doing the searches ourselves


Baseline being replaced: DataForSEO Google Organic SERP API, Live mode, US$0.002 per SERP,
turnaround "up to 6 seconds on average." SOURCED: https://dataforseo.com/pricing/google-serp/google-organic-serp-api
(checked 2026-09-23). This matches the number given in the brief.

## Facts that bound everything

**Google's robots.txt disallows /search.** SOURCED: fetched https://www.google.com/robots.txt
directly, 2026-09-23:
```
Disallow: /search
Allow: /search/about
Allow: /search/howsearchworks
...
Allow: /search?*tbm=map
...
Disallow: /shopping/search
```
The general search path is disallowed with narrow, unrelated carve-outs (about page, howsearchworks,
map-mode queries). Nothing in the file allows programmatic querying of ordinary web or shopping
results.

**Google's Terms of Service ties automated access directly to robots.txt.** SOURCED: fetched
https://policies.google.com/terms, section "Don't abuse our services," 2026-09-23. Verbatim:
"using automated means to access content from any of our services in violation of the
machine-readable instructions on our web pages (for example, robots.txt files that disallow
crawling, training, or other activities)." Given the robots.txt Disallow above, any automated
query of google.ca/search is a defined ToS violation, full stop, regardless of which machine or
whose IP issues it.

**hiQ Labs v. LinkedIn (9th Cir., settled Nov 2022).** SOURCED: https://en.wikipedia.org/wiki/HiQ_Labs_v._LinkedIn
(checked 2026-09-23). Scraping publicly accessible pages does NOT violate the US federal
anti-hacking statute (CFAA) even after a cease-and-desist and even after the Supreme Court's
Van Buren decision narrowed CFAA further (9th Cir. reaffirmed hiQ on remand, April 2022).
BUT: in November 2022 the N.D. Cal. district court ruled hiQ had breached LinkedIn's User
Agreement (contract, not CFAA), and the parties settled on undisclosed terms shortly after.
Net rule: scraping public data is not "hacking," but doing it against a site's stated Terms is
still a live contract claim, and that's the claim that actually won. This maps directly onto the
Google ToS clause above.

**Google v. SerpApi (alleged filed Dec 2025): UNVERIFIED THIS SESSION.** I could not confirm
this filing through any tool available to me. WebSearch was already at its 200/200 session
budget before I started (exhausted by earlier work in this session, not by this task). I tried:
Bing's HTML endpoint (returned a stripped bot-shell page, zero real results, one curl request),
DuckDuckGo's HTML endpoint (returned a CAPTCHA challenge to one curl request), SerpApi's own
blog (no mention of any lawsuit as of its current front page), JD Supra's search page (no
results), and courtlistener.com (HTTP 403, blocked). Treat "Google sued SerpApi in Dec 2025" as
an unverified premise from the brief, not a fact, until someone checks a working docket search
(courtlistener.com/PACER) or a search engine with working access. If confirmed, it materially
raises legal exposure for EVERY route below that runs automated Google queries at commercial
volume, because it would show Google enforcing the ToS clause above against a paid reseller
already, i.e. going after the operator of automation, not just individual IPs.

**Canada.** No Canadian case squarely on "scraping Google specifically" that I could verify this
session (same search-budget constraint). RECOLLECTION, NOT VERIFIED THIS SESSION, flag before
relying on it: Century 21 Canada Limited Partnership v. Rogers Communications Inc., 2011 BCSC
1196, where a BC court found a real-estate listings scraper liable for copyright infringement
and breach of the source site's browse-wrap Terms of Use. If accurate, it means Canadian courts
do enforce website Terms of Use against scrapers on ordinary contract grounds, consistent with
the US hiQ outcome. Confirm on CanLII before citing it to anyone outside this file.

**Ontario minimum wage.** SOURCED: https://www.ontario.ca/document/your-guide-employment-standards-act-0/minimum-wage
(checked 2026-09-23): general minimum wage $17.60/hour, effective Oct 1 2025 to Sep 30 2026.

## The probe (run from this PC, 5 requests, 10+ seconds apart)

Command: `curl` with a Chrome-128 desktop User-Agent and `Accept-Language: en-CA`, to
`https://www.google.ca/search?q=Kirkland+Signature+Organic+Virgin+Coconut+Oil+1.36L`, saved
headers and body separately. No loops beyond the 5, no browser automation.

| # | UTC time | HTTP | bytes | result |
|---|---|---|---|---|
| 1 | 17:42:28 | 200 | 92,146 | JS wall |
| 2 | 17:42:44 | 200 | 91,951 | JS wall |
| 3 | 17:43:09 | 200 | 92,051 | JS wall |
| 4 | 17:43:20 | 200 | 92,120 | JS wall |
| 5 | 17:43:32 | 200 | 92,128 | JS wall |

Every response was HTTP 200 (not a hard block, not a CAPTCHA) but the body's `<title>` was just
"Google Search" and the only content was a `<noscript>` block with a meta-refresh to
`/httpservice/retry/enablejs?sei=...` and the text "Please click here if you are not redirected
within a few seconds." Zero `/url?q=` result links, zero `<cite>` tags, in any of the 5 bodies.
This is a mandatory JavaScript wall, not a CAPTCHA and not a rate-limit response: it did not
escalate or change in character across 5 requests in ~64 seconds, meaning it looks like a
blanket policy applied to any client that doesn't execute JS, independent of pacing or volume.
Practical read: **plain HTTP fetch (no JS engine) cannot get real results from google.ca/search
at all, ever, regardless of IP, pacing, or rotation.** This matches the "JavaScript requirement
introduced ~January 2025" claim in the brief; my probe is independent, direct evidence of the
current state, not a re-confirmation of that date (I couldn't verify the date itself this
session, budget exhausted).

Side data point: my own attempts to use Bing's and DuckDuckGo's plain HTML search endpoints from
this same PC, with one curl request each, were also bot-walled (a stripped result-free shell
page from Bing, an outright CAPTCHA page from DuckDuckGo). Anecdote, but a live one: major search
engines are bot-walling even single, correctly-headered, non-abusive curl requests in 2026, not
just Google.

Full logs, headers and raw bodies:
`C:\Users\xujam\AppData\Local\Temp\claude\C--agent\28e5875e-b4a9-4710-aa59-37b7f25c123c\scratchpad\probe\`

## Route table

| Route | Cost per search | Latency | Block risk | Terms/legal exposure | Verdict |
|---|---|---|---|---|---|
| **1a. Mac, plain HTTP fetch (curl/requests, no JS)** | ~$0 marginal (home power/bandwidth) | fast when it "succeeds," but never gets real content | **Confirmed dead by probe**, not a matter of risk | Automated /search access = ToS breach per quoted clause, regardless of outcome | Dead. Proven this session, not theoretical. |
| **1b. Mac, headless Chrome/Playwright (JS-rendering)** | ~$0 marginal + dev/maintenance time | 2-8s typical (page load + render) DERIVED from normal headless-browser page-load times, not measured here | Real, unmeasured this session (no browser automation allowed under the probe limit). ANECDOTE from general industry experience with scraping tools: CAPTCHA/blocking risk rises sharply with query volume and with headless-specific fingerprints (`navigator.webdriver`, missing plugins) that Google's anti-bot systems are known to check for | Same ToS breach as above, executed by Shin's own infrastructure = Shin is the identifiable operator | Technically the only Mac-side route that can render real results at all. Viable at LOW, spaced volume; unproven at beta-to-10k-user volume from one home IP. |
| **1c. Mac, real (headful) Chrome driven by automation, ideally with a real, logged-in Google account** | ~$0 marginal + more dev time (harder to script than headless) | similar to 1b | Lower fingerprint risk than headless (real browser process), but a machine-cadence query PATTERN (structured product names, regular intervals) is still a giveaway independent of browser fingerprint | Same ToS breach; a logged-in account ties the activity to a real Google account that can be individually banned | More durable than 1b technically, same legal exposure, adds "losing the account" as a new failure mode |
| **1d. Mac, home IP only, no tricks** | ~$0 | as above | One IP, one home connection; if it gets flagged, Shin's whole home internet is degraded for the household too | Same ToS breach | Simplest, but a single point of failure and the easiest pattern for Google to flag (one IP, thousands of structured queries/day at 10k-user scale) |
| **1e. Multiple ISPs / phone hotspot rotation** | ~$0 marginal + cost of extra SIMs/lines (real dollars, small) | same as 1b/1c | Spreads volume across a handful of IPs; still trivially correlated by query pattern/timing/UA if anyone looks | Same ToS breach, now on multiple lines Shin pays for = still Shin as operator | Marginal improvement over 1d, doesn't change the legal picture, adds real recurring cost (SIM/hotspot plans) |
| **1f. IPv6 range rotation** | ~$0 marginal | same | A /64 or larger IPv6 block gives huge address-space rotation cheaply; RECOLLECTION (not verified this session): major sites increasingly rate-limit by IPv6 /64 prefix, not by individual address, specifically to close this loophole | Same ToS breach | Cheaper than proxies but likely rate-limited by prefix, not address; unverified this session |
| **1g. Tor** | ~$0 (free network) | Tor adds real latency, often 1-5s+ extra hop time on top of page load, risking the <10s budget on its own | RECOLLECTION: Tor exit-node IPs are extremely well-known and near-universally CAPTCHA'd/blocked by major sites including Google, because they're a public, finite, reused list | Same ToS breach; also Tor exit-node abuse is itself grounds for network-level blocking of legitimate traffic too | Effectively non-viable; near-certain CAPTCHA wall on top of the ToS issue |
| **1h. Cheap VPS (DigitalOcean/AWS/etc.)** | Real dollars: a small VPS runs roughly US$5-20/month, DERIVED against volume this is negligible per-search cost, but see block risk | same as 1b | RECOLLECTION: datacenter IP ranges (cloud providers) are heavily pre-classified and blocklisted by Google's anti-bot systems, often blocked FASTER than a fresh residential IP | Same ToS breach, now from an easily-attributed datacenter ASN | Likely worse than the home IP, not better; cheap in dollars, not in success rate |
| **1i. Residential proxy pool (Bright Data / Oxylabs / Smartproxy style)** | This is explicitly paying a company again. RECOLLECTION ballpark: residential proxy bandwidth commonly runs several to ~15 USD/GB; a single rendered SERP page can be several hundred KB to low MB with all assets, so DERIVED rough cost per search can land in the same order of magnitude as, or above, DataForSEO's $0.002, once you also count your own scraping dev/maintenance time | same as 1b | Lower block risk than 1h (real residential IPs), but not zero | Same ToS breach, now laundered through a third party whose own ToS may itself prohibit this use | Say so plainly: this is not a DIY savings, it's substituting one paid vendor for another, likely at similar or worse cost once engineering time is counted |
| **2a. Hidden in-app WKWebView (iOS), app injects JS to read the rendered page** | ~$0 marginal to Shin per search (borne by shopper's own data plan, negligible) | WKWebView is a real WebKit engine, so it CAN pass the JS wall my probe hit; realistic load+read time is a few seconds, plausibly under 10s | Volume per individual shopper IP is naturally tiny (their own stated usage: ~8 scans/month), which looks like ordinary human search behavior, not obviously botlike per-IP; but Shin ships the automation code, so Google (or anyone inspecting app traffic/network calls) can identify the pattern by User-Agent/App bundle, not just by IP | Same ToS breach; distributes DETECTABILITY across thousands of consumer IPs, but does NOT distribute legal liability, since Shin wrote and ships the code that triggers it, Shin is still "the automated means." Also a live IP-scraping-and-republishing-Google's-content question distinct from ToS: reusing Google's SERP content commercially inside another product is the same category of conduct the alleged Google v. SerpApi suit would be about, if confirmed | Technically the most promising route to actually get past the JS wall at scale without one concentrated home IP eating all the block risk. Legal exposure does not go away, it just becomes harder for Google to detect quickly. This is the one worth a real legal read before building, not after. |
| **2b. Hidden in-app WebView, Android (android.webkit.WebView, Chromium-based)** | same as 2a | same as 2a, Android's WebView is a full Chromium engine | same as 2a | same as 2a | Same analysis as 2a; Android's WebView is arguably even closer to real desktop Chrome (same rendering engine family) |
| **2c. Visible in-app browser the shopper looks at (SFSafariViewController on iOS, Chrome Custom Tabs on Android)** | ~$0 | shopper-paced, could be 10-30s of human interaction, may miss the <10s target | Very low: this is exactly what a human opening Safari/Chrome and searching looks like, because it structurally IS that, isolated from the host app (SFSafariViewController in particular gives the host app NO DOM access, no cookie access by default) | Lowest ToS exposure of any automated-feeling route, because the app plausibly isn't "automating" anything, the human is looking at and driving a real browser tab; but then the app can't read the result programmatically, defeating the point unless the shopper manually reports back | Safe on paper, but it isn't automation at all: if Shin's app can't read the DOM, someone/something else still has to extract the answer, which pushes the problem to the shopper or to a hybrid with 3e below |
| **2d. Handoff to Google app / Google Lens / Circle to Search** | ~$0 to Shin | shopper-paced, plus context-switch away from Shin's app, likely well over 10s and the shopper leaves the app entirely | Zero, this is Google's own first-party product being used exactly as designed | None; this is using Google the way Google intends | Lowest risk of anything on this list, but it isn't "Shin runs the search," it's Shin bailing out to Google's own UI, and it breaks the in-app flow entirely |
| **3a. Staff, 24/7 shifts, Canadian minimum wage** | DERIVED: Ontario minimum wage $17.60/hr (sourced above); loaded cost with CPP/EI/vacation pay roughly 1.15x, call it ~$20.24/hr loaded. Generous assumption: 60 manual searches/hour (one search, read, and re-key every 60 seconds, sustained, which is itself optimistic for a real shift). $20.24 / 60 = **$0.337 per search**, about 168x the $0.002 target | Real-time if staffed and idle-waiting, but bursty/queued if not; minutes if any queue forms | None from Google's side (this is literally a human doing what a human does), but this is a real person, real payroll, real labour law | No scraping-ToS exposure at all; the exposure here is ordinary employment law (Ontario ESA: minimum wage, hours of work, overtime, breaks) if Shin actually runs 24/7 shifts | Economically dead on its own arithmetic before any coverage/headcount question even comes up |
| **3b. Offshore VA (e.g., Philippines-based, common freelance-platform rate)** | RECOLLECTION, NOT VERIFIED THIS SESSION (no live listing pulled, search budget exhausted): a commonly cited informal VA rate is roughly US$3-6/hr for general admin/data-entry work. DERIVED at $4/hr midpoint and the same 60/hr assumption: $4/60 = **$0.067 per search**, about 33x target | Async by default: submit a request, wait for a human on the other side of the world to see it, search, and respond. Realistically minutes, not seconds, unless someone is paid to sit idle and watch a queue in real time, which reintroduces the staffing-coverage cost of 3a | None from Google's side | Same employment/contractor-law questions, jurisdiction-dependent, not scraping-ToS exposure | Cost is closer but still far above target, and latency alone fails the <10s requirement for live, per-scan use |
| **3c. Amazon Mechanical Turk / microtask platforms** | RECOLLECTION: simple HITs often price in the few-cents range; Amazon also takes a requester-side fee, commonly cited around 20% (NOT VERIFIED THIS SESSION). Even optimistically, likely still several x the $0.002 target once the fee is added | MTurk is explicitly a batch/queue system; workers pick up HITs on their own schedule. Realistic turnaround is minutes to hours, not seconds | None from Google's side directly (a human worker does the search on their own browser/account) | Exposure shifts to individual workers using their own Google access, murky and not something Shin controls or wants to rely on | Latency alone disqualifies this for live per-scan search. Could fit ONLY the offline/nightly batch idea (route 4c), never the real-time path |
| **3d. Beta testers / volunteers** | $0 cash, real cost in goodwill and reliability | Depends entirely on whether someone happens to be available; not a dependable <10s SLA | None from Google's side | If it's disguised unpaid labour at any real volume, that is a labour-law question in its own right, not a scraping question | Might barely cover the stated 100 scans/day beta with one or two committed people; does not scale toward the 10k-user target at all, by design (that's not what volunteers are for) |
| **3e. Shopper does the search themselves (guided in-app flow)** | $0 to Shin | Shopper-paced, likely 10-30s of their own attention, may miss the <10s target | None; it's just a person using Google | None beyond ordinary use | A real fallback/degrade path, not a genuine substitute for automated lookup; it trades the app's core promise (instant answer) for the shopper's own time |
| **4a. Browser extension on desktop, does the search when the shopper is at a computer** | ~$0 | Same JS-wall considerations as 1b/1c since the browser is a real engine, but the search only happens when the shopper happens to be on a desktop | Same as 2a/2c in spirit: one real browser, one real (if occasional) query, looks human | Same ToS breach if it automates the query without the shopper actively typing/reading it themselves | Doesn't fit Shin's actual product (a phone barcode-scan app); listed for completeness, not a real candidate |
| **4b. Shared cache: search a given product once, ever, serve every future scan from cache** | Not a route on its own; a MULTIPLIER on top of whichever route above actually executes the search | Cache hits: near-instant, well under 10s. Cache misses: whatever the underlying route's latency is | Cuts total search VOLUME across all users by however many times a given product gets rescanned by different shoppers; directly reduces exposure to whichever channel's per-IP/per-day block threshold, for every route above | Does not remove the ToS question for whichever route does the actual first-time lookup, but shrinks how often it's invoked | The single highest-leverage move in this whole list: it doesn't replace a route, it makes every other route's weaknesses matter less by making them run less often |
| **4c. Nightly batch: one search per distinct/stale product on the Mac, not per scan** | ~$0 marginal, using route 1b/1c under the hood, at LOW paced volume (once per night per distinct product, not per live scan) | Doesn't need to be fast, it's a batch job; shoppers are served from the cache built by this batch (see 4b), so THEIR latency is the cache-hit latency, not the batch's | Low volume, well-spaced, from one known home IP overnight is the best-case scenario for staying under whatever per-IP-per-day threshold exists; still unproven without a real, sustained run (which the probe limit here did not allow) | Same ToS breach as 1b/1c, at lower volume, still Shin as the identifiable operator if ever inspected | Combined with 4b (cache), this is the strongest practical DIY pattern in the whole list, and it's the one to actually build first: batch + cache does most of the volume near-free, with the current $0.002 paid API kept ONLY as the fallback for genuine cache misses, which could land the BLENDED cost per scan under $0.002 even without touching Google's block wall at high volume |

## Ranked shortlist, each with the fact that would reverse it

1. **Hybrid: nightly Mac batch (headless Chrome/Playwright, real JS engine) + shared product
   cache + DataForSEO kept only for cache misses (routes 4c + 4b, backstopped by the current
   paid API).** Near-$0 marginal cost on the large majority of scans, sub-10s latency for
   shoppers because they're served from cache, and low enough live-scrape volume that it plausibly
   stays under whatever unblocked-volume threshold exists. Reverses if: a sustained real run (not
   the 5-request probe here) shows Google CAPTCHAs or blocks the home IP at low, spaced, nightly
   volume too, not just at high live-query volume, in which case the batch has to move off the
   home IP or off Google entirely.

2. **In-app hidden WebView on the shopper's own phone (routes 2a/2b).** The only route that both
   passes the JS wall (real WebKit/Chromium engine) and distributes query volume across thousands
   of low-frequency residential IPs that individually look like ordinary human search behavior.
   Reverses if: the alleged Google v. SerpApi suit (unverified above) is confirmed and shows
   Google pursuing the operator of automated access regardless of where the query physically
   originates, which would mean distributing across shopper phones only helps against
   IP-based detection, not against Google identifying Shin as the operator by other means
   (app traffic patterns, User-Agent, the product itself being publicly known).

3. **Staff or offshore VA doing live manual searches (3a/3b).** Ranked low on purpose: the
   arithmetic already kills it (best case ~$0.067/search, 33x target) before latency does.
   Reverses if: the real bottleneck turns out to be Shin needing a HUMAN judgment call on
   ambiguous barcode matches rather than raw price lookup at volume, in which case a small human
   review layer (not 24/7, not per-scan) could be worth its cost for a different reason than
   this brief's cost-per-search framing.

4. **Mac headless Chrome/Playwright as the LIVE per-scan path (route 1b/1c) without cache or
   batching.** Technically viable against the JS wall but concentrates all volume on one or a
   few IPs at full 10k-user scale, which is exactly the pattern anti-bot systems are built to
   catch. Reverses if: a real sustained-volume test (which the probe limit here didn't allow)
   shows Google tolerating far higher per-IP daily volume than commonly assumed, at which point
   this could stand on its own without needing the batch/cache hybrid in #1.

5. **Residential proxy pool (1i) or any paid IP-rotation service.** Ranked last on purpose per
   the brief's own instruction: this is not DIY, it's paying a different company, likely at
   similar or worse blended cost than DataForSEO once proxy bandwidth and engineering/maintenance
   time are counted. Reverses if: a specific proxy vendor's real per-GB price, checked against
   actual measured page weight for a rendered google.ca/search page, comes in reliably under
   $0.002/search AND under DataForSEO's $0.0006 standard-queue rate, which I could not verify
   this session (both proxy pricing pages I tried 404'd).

## What I could not verify this session, and why

WebSearch was already at 200/200 of its session budget before this task began (used by earlier
work in the same session, not by anything done here). Everything above that needed a live web
search instead relied on direct WebFetch to specific URLs (which worked for robots.txt, the
Google ToS, Wikipedia's hiQ v. LinkedIn page, Ontario's minimum wage page, and DataForSEO's
pricing page) or is flagged as recollection/anecdote where it could not be independently
re-checked: the Dec 2025 Google v. SerpApi filing, the Jan 2025 date for Google's JS requirement
(the JS wall itself is independently confirmed by my probe, just not that specific date),
realistic searches-per-IP-per-day before blocking, offshore VA and MTurk pricing, residential
proxy $/GB pricing, the Century 21 Canada v. Rogers Communications citation, and Apple/Google
Play policy specifics on WebView use. Anyone acting on this should re-run the search-dependent
items with a fresh WebSearch budget before treating them as settled.
