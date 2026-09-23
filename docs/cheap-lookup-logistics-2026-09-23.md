# Logistics for the cheaper lookup, 2026-09-23

Jamin's ask, 2026-09-23: "Figure out the logistics of the cheaper lookup design." This is that plan:
every account the design in `docs/scan-pipeline-v2-2026-09-22.md` and `docs/cheap-scan-pipeline-2026-09-22.md`
needs, who does each one, what it costs, how long approval takes, the order to do them in, the test
that has to pass before any of it is built into production, the build steps after that test passes,
and his open calls (six from the session record, plus two more this pass surfaced) with a default
and a reversing fact for each.

Every price and term below was checked live today, 2026-09-23, on the provider's own site, cited
with a URL. Where a primary source could not confirm something, it says "not confirmed" rather than
guessing. Where a number already sits in an earlier Shin doc, it was re-checked here rather than
copied; a mismatch is called out.

## 1. Every account, who does it, and what it actually says today

### Search / shopping data (tier D, one paid call per uncached scan)

| Provider | Who signs up | Requirements | Cost | Approval | Restricting terms |
| --- | --- | --- | --- | --- | --- |
| **DataForSEO Merchant API (Google Shopping)** | Jamin (payment card, deposit) | No business number or tax form found on the pricing/FAQ pages. | Standard queue $0.001/task, about 45 minutes to answer. Priority queue $0.002/task, about 1 minute. The Products endpoint bills per 40 results returned, not per task, so a real lookup can cost more than one task if it pages results. There is no synchronous "live" Google Shopping endpoint; Priority is the closest thing to real time. Signup itself is free with a $1 trial credit and no card; production use needs a $50 minimum deposit. Checked 2026-09-23: docs.dataforseo.com/v3/merchant-google-overview, dataforseo.com/pricing/merchant/google-shopping-api, dataforseo.com/help-center/minimum-payment. | Instant, self-serve. | Caching/resale terms not confirmed from a page reachable pre-login. |
| **Serper.dev** | Jamin, if used at all | none stated beyond signup | 2,500 free queries, no card, confirmed on serper.dev. Paid per-1,000 pricing (the "$0.30 to $1" figure already in Shin's docs) could only be found on third-party aggregator pages today, not on serper.dev itself while logged out; **not confirmed from a primary source**. | Instant | **Confirmed verbatim, checked 2026-09-23, serper.dev/terms: "Serper is a business-to-business service and does not provide end-user (consumer) services."** Shin is a consumer app. This is a real conflict, not a maybe, and is why DataForSEO is the recommended default, matching his call #3. |
| **UPCitemdb** | nobody, at the free tier; Jamin if volume forces the paid tier | none for free tier (no signup at all); paid tier needs a card | Free: 100 requests/day, up to 20 of those searches, no key. Paid DEV $99/mo (20,000 lookups + 2,000 searches/day), PRO $699/mo (150,000 + 20,000/day), overage $0.04/100 lookups. Matches the "free 100 a day" figure already in Shin's docs. Checked 2026-09-23: devs.upcitemdb.com, upcitemdb.com/wp/docs/main/development/plan. | Instant | Terms of service (devs.upcitemdb.com/termsofservice) grant a non-exclusive licence for the customer's own use; no explicit caching-duration or general resale clause found, so **not confirmed either way**. One explicit rule: Amazon/eBay sale data may be shown on our own product page only, never redistributed. |
| **Go-UPC** (fallback identity source only, not needed at launch) | Jamin | card, PayPal, check or ACH; payment required before service starts | Developer $74.95/mo, 5,000 requests (~$0.015/lookup); Startup $245/mo, 45,000 (~$0.0054); Enterprise $795/mo, 450,000 (~$0.0018). Matches the range already in Shin's docs exactly. Checked 2026-09-23: go-upc.com/plans/api. | Instant, trial key available on request | **Explicitly bars reselling, redistributing, or making the product data publicly available, and requires deleting all previously received data on termination** (go-upc.com/terms-and-conditions). Caching is allowed only while subscribed. |

**Correction added by the reviewing session, 2026-09-23: the Shopping API cannot answer a shopper
standing at a shelf.** DataForSEO's own docs: *"Google Shopping API supports only the Standard method
of data retrieval. It requires making separate POST and GET requests"* (docs.dataforseo.com/v3/merchant-google-overview,
checked 2026-09-23). No live mode, and even the priority queue is quoted at about a minute. The
endpoint that can answer during a scan is the **Google Organic SERP API in Live mode, Advanced
format**, which returns Google's shopping pack (product, price, merchant) as structured items when
Google shows one: **US$0.002 a call, "up to 6 seconds on average"** (dataforseo.com/pricing/google-serp/google-organic-serp-api,
checked 2026-09-23). So tier D is one Live Advanced SERP call, not a Shopping API task, and it costs
twice what section 1's table says. Whether google.ca shows a shopping pack for the product names
testers scan is unknown; threshold 4 and the new threshold 5 in section 3 measure exactly that.

### Barcode/product identity, free tier (already partly built)

| Source | Who signs up | Requirements | Cost/limits | Terms |
| --- | --- | --- | --- | --- |
| **Open Food / Beauty / Products Facts** | nobody (Claude sets a header in code) | a custom `User-Agent` naming the app and a contact email is mandatory on every call; no account or key | Rate limits: 15 requests/min/IP on product GETs, 10/min/IP on search; go over and the IP risks a ban. Checked 2026-09-23: openfoodfacts.github.io/openfoodfacts-server/api/. | Attribution required: "mention the licence and attribute authorship to Open Food Facts with a link to openfoodfacts.org" (world.openfoodfacts.org/terms-of-use, checked 2026-09-23), already implemented in `app/src/attribution.ts`. Commercial use is explicitly permitted under ODbL. |
| **Open Prices** | nobody | none stated for reads | Read-side rate limit **not confirmed**; prices.openfoodfacts.org's API.md only says some endpoints need auth, without naming which GETs are open. Check prices.openfoodfacts.org/api/docs directly before relying on bulk reads. | Same ODbL family: cite the source, do not mix with non-free data. |
| **Wikidata** | nobody | none confirmed | CC0, confirmed 2026-09-23 at wikidata.org/wiki/Wikidata:Licensing. Whether the public read API needs no key for reasonable volume is the common understanding but **not confirmed from a primary source** today. | none beyond CC0 |
| **Icecat Open Catalog** | Claude, with the team address (useshinapp@gmail.com), unless Jamin wants it under his own name | free email registration for API access | Licence is Icecat's own "Open Content License." Checked 2026-09-23 via Icecat's own FAQ/manual pages (iceclog.com), not the base OPL text itself, so the exact conditions are **not fully confirmed**; read the OPL text before depending on this source. | One stated condition: delete a brand's data if that brand demands it. |

### One cheap model call to match/filter the search results (tier D step 2)

| Model | Price per 1M tokens, checked 2026-09-23 | Signup | Verdict |
| --- | --- | --- | --- |
| Gemini 2.5 Flash-Lite | $0.10 in / $0.40 out (ai.google.dev/gemini-api/docs/pricing) | self-serve | Cheapest on paper, but excluded: Jamin already found Gemini 2.5 inaccessible on the Mac (session record item 8), and the whole 2.5 line is headed for its 2026-10-16 shutdown per `docs/unit-economics-2026-09-22.md`. |
| **Gemini 3.1 Flash-Lite** | $0.25 in / $1.50 out | self-serve | **Correction to the existing docs**: `cheap-scan-pipeline-2026-09-22.md` and `unit-economics-2026-09-22.md` both cost the matching step on Gemini 3.5 Flash-Lite at $0.30/$2.50. 3.1 Flash-Lite is a live, cheaper, current 3.x model. Recommended default. |
| Gemini 3.5 Flash-Lite | $0.30 in / $2.50 out | self-serve | Still fine, just not the cheapest 3.x option available today. |
| **Claude Haiku 4.5** | $1 in / $5 out, confirmed, matches the existing docs exactly (platform.claude.com/docs/en/about-claude/pricing) | Anthropic Console, self-serve, card on file | **Excluded, and this is a real conflict, not a detail.** `docs/jamin-gemini-rules.md` rule 7 (2026-09-15, never reversed): *"Claude does not take over... With Gemini on, no Claude fallback."* And: *"Claude should currently not be used anywhere inside Shin."* Both cheap-scan-pipeline-2026-09-22.md and unit-economics-2026-09-22.md priced Claude Haiku as an option without addressing this standing rule. Nothing written on or after 2026-09-16 (the date that would let a note override an older rule per this repo's own CLAUDE.md) reverses rule 7. Default here is Gemini only. This is his call #7 below, not something resolved quietly. |
| GPT-5 nano | $0.05 in / $0.40 out (developers.openai.com/api/docs/pricing; platform.openai.com/pricing itself returned an error today) | self-serve, card + phone verification | Cheaper than any Gemini option, but OpenAI is not an approved vendor anywhere in Shin's rules. Adding a third AI vendor is a bigger decision than this document should make; naming it here for him to consider, not on the default path. |

**Setup either way:** Jamin needs a Google Cloud project and billing account separate from the
existing Gemini key, because rule 8 in `docs/jamin-gemini-rules.md` restricts that key to phone
testing only. He creates the project and attaches billing (his payment, instant, no approval wait,
$5 minimum prepay); Claude then generates and wires the API key.

### Affiliate/publisher networks (tier A, free feeds with a GTIN field)

| Network | Who | Requirements | Cost | Approval | Feed-use terms |
| --- | --- | --- | --- | --- | --- |
| **Impact.com** | Jamin (business identity, profile) | name, email, phone, business category, a profile with logo and description; a live, public "verified media property" is recommended but its site does not say it is mandatory. Tax forms, minimum traffic and cost are **not confirmed**: they sit behind the signup flow or the Partner Program Agreement, neither reachable pre-login. Checked 2026-09-23: help.impact.com, impact.com/terms-of-use. | not confirmed (should be free to join, per Shin's existing docs, but not re-confirmed here) | **not confirmed**; treat as the longest lead time on this list until proven otherwise | **Not confirmed whether GTIN/catalog data can power a comparison feature or is restricted to click-through affiliate links.** This is the single biggest open risk in tier A: read the actual Partner Program Agreement the day the account is approved, before writing a line of tier-A code. Best Buy Canada, Canadian Tire and Home Depot Canada run their own advertiser programs inside Impact and each needs its own separate approval after the base account exists. |
| **AWIN** | Jamin (small deposit, business identity) | standard publisher signup | Refundable deposit, region-dependent: $1 USD (awin.com/us/faqs) or £5 GBP for a UK entity (awin.com/gb/compliance-and-regulations/application-process-and-joining-fee), credited back once the first payout threshold is reached. Checked 2026-09-23. | **Confirmed fast: "aim to process all publisher applications within 24 hours"** (same GB page). | The `gtin` field is confirmed present in AWIN's Enhanced Feed spec (help.awin.com/developers/docs/enhanced-feeds-prod-spec, checked 2026-09-23). Whether feed use is restricted to click-through is **not confirmed**: the publisher terms link out to jurisdiction PDFs not reachable without an account. |
| **Rakuten Advertising** | Jamin (live site, traffic numbers, business description) | site URL, monthly visitor/pageview numbers, a business description | Free to join, no cost | "Usually within a couple of business days" (pubhelp.rakutenadvertising.com, checked 2026-09-23, retrieved through a search cache since a direct fetch returned an access error, so treat as lower-confidence than the others) | Whether Walmart is an active advertiser on the network today is **not confirmed from a Rakuten source**; only third-party affiliate sites list it. Feed-use restrictions are **not confirmed**; the Publisher Member Agreement needs a login. **Flag:** Rakuten Advertising and Impact.com announced a strategic alliance on 2026-05-18 (blog.rakutenadvertising.com, checked 2026-09-23), migrating advertisers onto Impact's platform in waves through 2026 and 2027, which may change how these two networks' feed access works later. |

### Subscriptions

| Item | Who | Requirements | Cost | Notes |
| --- | --- | --- | --- | --- |
| **RevenueCat** | Jamin (it touches the Apple/Google accounts that are his) | Just an email to create the account; no business entity requirement found on any RevenueCat page. Checked 2026-09-23: revenuecat.com/docs/welcome/set-up-revenuecat. | Free up to $2,500/month tracked revenue, then 1% of tracked revenue, no minimum commitment (revenuecat.com/pricing). | Needs an App Store Connect API key (a `.p8` file, minimum role "App Manager") and a Google Play service-account JSON with "Manage orders and subscriptions" permission, both pulled from the Apple Developer Program and Google Play Console accounts already covered in `docs/the-store-accounts-packet.md` (checked 2026-09-13, not redone here). **Google's own permission propagation for the Play service account can take 24 to 36 hours**, which is the real bottleneck, not the SDK integration, which RevenueCat's own docs describe as "a few lines of code." |

## 2. Order and rough dates, starting 2026-09-23

Two tracks run in parallel. Track 1 is what actually fixes the $0.062/scan cost. Track 2 (tier A,
the affiliate feeds) is free money and better coverage later, but nothing in Track 1 waits on it.

**Track 1: ship the cheap pipeline (tiers B to D)**

- **2026-09-23.** Jamin: create the DataForSEO account, add the $50 deposit. Create a new Google
  Cloud project and billing account for the production Gemini key (separate from the phone-testing
  key). Both instant. Claude: start building the free-identity cascade, the DataForSEO client, the
  filter/match code and the new ungrounded matching call, all behind a dark flag, and pull a count
  of how many distinct real barcodes the beta has actually scanned so far (`app/src/scans.ts`,
  `kind='barcode' AND outcome='answered'`, excluding demo rows). **This count is not known yet** and
  is the one thing that can genuinely slow this track down if it is under 50: the 50 barcodes must
  be real scans, and there is no shortcut for a number the beta has not produced yet.
- **2026-09-23 to about 2026-09-27** (4 days): build the pieces in section 4 below.
- **As soon as 50 real scans exist**, run the 50-barcode test (section 3). If the beta is already
  past 50, this can run the same week as the build; if not, this date moves out with the beta's own
  pace and that is a fact to report, not to guess past.
- **1 to 2 days after the test**: read the results against the fixed thresholds, decide ship / fix /
  kill, and if it ships, flip the flag for a slice of traffic first.
- **Best case, done 2026-09-30**, one week out. Realistic range: 1 to 3 weeks, paced by beta scan
  volume, which nobody has counted yet.

**Track 2: tier A, the affiliate feeds (does not block Track 1)**

- **2026-09-23 to 24**: Jamin confirms or buys the domain (useshin.com was free when checked
  2026-09-22, purchase status **not confirmed** in this pass) and picks any free-tier static host;
  Claude builds and deploys a minimal public page (what Shin is, one screenshot, a contact address).
  A live public site is what Impact and Rakuten's signup pages both ask for.
- **2026-09-24**: Jamin applies to AWIN, Rakuten and Impact.com the same day, since none of the three
  applications depend on each other.
- **AWIN approved by about 2026-09-25** (24-hour SLA, confirmed).
- **Rakuten approved by about 2026-09-28** ("a couple of business days", lower-confidence source).
- **Impact.com: no confirmed date.** Using the existing docs' own placeholder ("days to weeks"),
  worst case is roughly **2026-10-14** (three weeks out). This is the least certain number in this
  whole plan, and it is also the one the docs already flagged as "the only step on the critical path
  that waits on someone else."
- **After any of the three base accounts is approved**, apply to the specific retailer programs
  (Best Buy Canada, Canadian Tire, Home Depot Canada on Impact; Walmart on Rakuten, once its
  presence there is actually confirmed). **No lead time for this second approval was found
  anywhere**; treat it as an unknown add-on of at least several days to a few weeks on top of the
  base network's own approval.
- **The moment any feed account is live, read its actual Partner/Publisher Agreement before writing
  code against it.** None of the three networks' terms could be confirmed today on whether GTIN feed
  data may power an independent price-comparison feature versus click-through links only. If the
  answer is "click-through only," tier A as designed does not work and this is a fact to bring back
  to him, not a corner to build around quietly.
- **Realistic full tier-A timeline: 4 to 7 weeks from today**, dominated by two unconfirmed waits
  stacked on top of each other (network approval, then retailer approval), neither of which Track 1
  needs.

**The three longest single steps in the whole plan:** Impact.com's base publisher approval
(unconfirmed, treated as the worst case here), the retailer-specific advertiser approval that stacks
after it (also unconfirmed), and accumulating 50 real beta scans if the beta has not already produced
them (paced by organic use, not by anyone's effort).

## 3. The 50-barcode paired test

**Source of the 50 barcodes.** Real beta scans only, pulled from the scans table
(`app/src/scans.ts`), filtered to `kind = 'barcode'`, `outcome = 'answered'`, not a demo row, most
recent 50 distinct barcodes. Not the 19-barcode walkthrough sample, not the catalogue, not invented
test barcodes: the point of "real beta scans" is that the mix of products, sizes and store brands is
whatever testers actually scanned, not a curated set that happens to work.

**Exact procedure.** For each of the 50 barcodes, run both arms and record one row:

- **Arm A, today's call.** The existing single grounded Gemini 3.x call
  (`identify/src/providers/gemini-scan.ts`), run fresh (not served from the repeat-cache, so the
  comparison is apples to apples). Record: product name, price, verdict, number of search queries
  the call made, and its cost.
- **Arm B, the new pipeline.** Steps 0 to 6 from `cheap-scan-pipeline-2026-09-22.md` section 2, run
  with the repeat-cache bypassed the same way. Record: which identity source answered (catalogue, Open
  Facts, UPCitemdb, typed name, or none), the DataForSEO query sent, how many results came back, how
  many survived the code filters, whether the matching model was invoked, the product/price/verdict
  it produced, and its cost. If nothing usable came back, record that the fallback to Arm A's call
  fired.

**Paired design, per-row outcome.** Every row is the same barcode run through both arms; the
comparison is row by row (agree, disagree, or Arm B fell back), never two separate samples averaged
and compared as group means. This is the shape the rest of this repo already calls "the testing
rule": pair the runs, set the threshold before looking at results, and treat anything under the
noise floor as nothing.

**Noise floor.** With n = 50 and outcomes that are essentially yes/no per row, the sampling
uncertainty on any single proportion (match rate, fallback rate) is about ±14 percentage points at
95% confidence (binomial standard error ≈ 7%). Any difference smaller than that between two
proportions is noise, not a finding, and should be reported as such rather than as a result.

**Pass thresholds, fixed here before the test runs (open to Jamin's revision, but fixed, not decided
after seeing the numbers):**

1. **Match quality.** Arm B identifies the same product and a price within 5% (or $0.50, whichever
   is larger) of what Arm A found, on at least 45 of 50 rows (90%). Below 45/50 but above 35/50
   (70%), the identity/matching steps need work before shipping, not a kill. Below 35/50, the design
   does not work as specified and needs a real rethink, not a patch.
2. **Fallback share f.** At most 15 of 50 rows (30%) fall through to Arm A. At f ≤ 30% the pipeline
   is still at least 3x cheaper than today per the existing cost model; above 30% the savings shrink
   fast, and above 25 of 50 (50%) the savings drop toward roughly 2x, at which point the added
   vendor accounts and code are not obviously worth it and that trade is his to make, not a default.
3. **Zero tolerance for a confidently wrong verdict.** Any row where Arm B shows a price for the
   wrong product, wrong size, wrong currency, or a stale price as current, when Arm A got it right,
   is a defect. More than 2 of 50 (4%) such defects means the matching step is not caught by its
   guards and the design does not ship until that is fixed. This mirrors decisions.md's own ruling 4
   ("a price that fails a guard is withheld, never replaced") rather than adding a new bar.
4. **Search-provider viability.** At least 30 of 50 rows (60%) must get at least one DataForSEO
   result that is actually a match for the scanned item, per the manual walkthrough's own finding
   that most raw search results are not the same product. Below that, the failure is the search
   provider, not the pipeline shape, and the next move is trying an alternate provider (Bright Data
   SERP was the next cheapest untested option in the existing docs), not abandoning the design.

5. **Speed at the shelf** (added by the reviewing session, 2026-09-23). Record each arm's time from
   request to answer on every row. Arm B's median must be no slower than Arm A's median on the same
   rows, and Arm B's 90th percentile must be under 10 seconds. A cheaper answer the shopper walks
   away from before it arrives is not an answer. Failing this points at the search step's latency,
   and the next move is a faster provider, not a bigger timeout.

**What a result changes or kills.** Threshold 1 failing below 35/50 or threshold 3 failing kills the
design as specified and sends it back to redesign, not to a quiet patch. Threshold 2 landing between
30% and 50% changes the design (invest more in identity coverage and the typed-name fallback before
shipping) rather than killing it. Threshold 4 failing points at the search provider, not the whole
pipeline.

## 4. Build steps, after the test passes

Small steps, in order, naming the files the design docs already point at:

1. **UPC-E expansion and variable-measure decoding.** No open-source package covers either
   (confirmed in `scan-pipeline-v2-2026-09-22.md`). New small file, e.g.
   `identify/src/gtin-variants.ts`, alongside the existing check-digit code in `identify/src/gtin.ts`
   and the routing already wired in `app/src/barcode.ts`.
2. **Repeat-cache refresh window.** Already implemented and pinned per `docs/decisions.md` ruling 1
   (`app/server.ts:2947`, `app/test/repeat-cache.test.ts`); no new code needed here.
3. **Free identity cascade.** `app/src/open-food-facts.ts` already calls Open Food Facts live; add a
   small UPCitemdb client, e.g. `app/src/upcitemdb.ts`, as the next fallback. Shin's own catalogue
   stays out of this cascade until Jamin reverses the ruling in his call #2 below; if he does, the
   catalogue lookup goes first in the cascade, per Aurik's already-accepted condition (imported copy
   first, live Open Facts call only on a miss).
4. **Ask-the-shopper-to-type-a-name.** One small server route plus one client text field, wired to
   fire only when the whole free cascade misses (2 of 19 in the walkthrough sample).
5. **Shopping search client.** New file, e.g. `identify/src/providers/dataforseo.ts`, using the
   Google Organic SERP Live Advanced endpoint on google.ca (not the queued Shopping API, which has no
   live mode; see the correction in section 1), gated behind a new env flag (e.g. `SHIN_CHEAP_LOOKUP=1`) following the
   same dark-flag pattern `SHIN_GEMINI_SPLIT` already uses, so it can ship without touching live
   traffic until the flag flips.
6. **Result filtering, in code, no model.** New small pure function, e.g.
   `identify/src/shopping-filter.ts`: drop non-CAD, used, refurbished, "compatible with" listings and
   wrong pack counts; parse size from the title with a small regex set (no `quantulum3` dependency,
   per the design doc's own note that the server is TypeScript); feed the result into the unit-price
   math that already exists in `identify/src/gauge.ts`.
7. **Matching.** Exact brand+name+size first, in the same filter file or a sibling
   `identify/src/shopping-match.ts`. Only the ambiguous remainder goes to one Gemini call with no
   `tools` array, following the "never grounds" pattern already documented in
   `identify/src/providers/gemini.ts`; a new sibling adapter (e.g.
   `identify/src/providers/gemini-match.ts`) is cleaner than repurposing `gemini.ts`, which is
   already the photo-vision adapter.
8. **Answer assembly.** Reuse `identify/src/gauge.ts` (unit price, median, outliers, verdict zones)
   and `app/src/price-match.ts` unchanged; this step is wiring, not new logic.
9. **Fallback.** If steps 5 to 7 produce nothing usable, call the existing
   `identify/src/providers/gemini-scan.ts` path exactly as it runs today. No change to that file.
10. **Route wiring.** In `app/server.ts`, try the new pipeline first when the flag is on, falling
    back to the existing single-call path, matching the existing flag-gating style
    (`SHIN_FREE_SCANS_PER_WEEK`, `SHIN_GEMINI_SPLIT`).
11. **Telemetry.** Extend the existing cost-recording (`app/src/model-cost.ts`) to log which path
    answered a given scan and its real cost, so the fallback share f is a measured production number
    within a week or two of shipping, replacing the 50-barcode test's estimate of it.

## 5. Jamin's open calls

1. **Apply to Impact, AWIN and Rakuten as a publisher.** Default: yes, apply to all three now
   (section 2); the cost is a small refundable deposit at AWIN and staff time elsewhere, and none of
   it blocks Track 1. **Reverses if:** the Partner/Publisher Agreement, read after any one account is
   approved, restricts GTIN feed data to click-through affiliate links only and forbids using it to
   power an independent comparison feature. That single clause, found and quoted, ends tier A as
   designed.
2. **Let Shin's own catalogue identify products on the scan path.** Default: yes, reverse the
   ruling. It is free, the fastest identity source measured (0.017 ms), and Aurik's 2026-09-21 answer
   already accepted the distinction and set the shape (imported copy first, live Open Facts call only
   on a miss); nothing has built or measured against that shape yet. **Reverses if:** a direct
   comparison shows the imported catalogue snapshot disagrees with a fresh Open Facts call often
   enough to matter, which is exactly the number Aurik's note said was still unmeasured.
3. **Allow one paid search (tier D): DataForSEO over Serper.** Default: yes, DataForSEO, on its live Google
   results endpoint (US$0.002 a call, about 6 seconds), not the queued Shopping API. Serper's own terms, read again today, still say in plain words that it is a
   business-to-business service that does not serve consumers, and Shin serves consumers directly.
   **Reverses if:** DataForSEO's Priority endpoint proves too slow or expensive once real per-lookup
   costs (including paginated results) are measured, and a legal read finds Serper's B2B clause does
   not actually apply to how Shin would use it. That is a real legal question, not an assumption to
   make either way from this document.
4. **Ask the shopper to type a name when nobody knows the barcode.** Default: yes; cheap, and it is
   exactly how Basket and Open Prices grow their own databases. Only 2 of 19 barcodes needed it in
   the walkthrough sample. **Reverses if:** beta testers abandon the scan at a measurably higher rate
   right at that prompt, once that is actually tracked.
5. **Show crowd prices once moderated, labelled as from shoppers.** Default: yes, once even a
   lightweight periodic moderation pass exists; 874 crowd rows sit unused today. **Reverses if:** a
   first moderation pass finds a high rate of wrong or bad-faith submissions, meaning "periodic"
   moderation is not enough to trust the data at all.
6. **RevenueCat and store setup, and a Terms page, before the paywall can take money.** Default: yes,
   start now, in parallel with everything else; RevenueCat's own account is free and instant, and the
   Apple/Google enrollment is already fully documented in `docs/the-store-accounts-packet.md`.
   **Reverses if:** Jamin decides the paywall itself is not ready to go live yet, which is a product
   timing call, not a logistics one.
7. **New, surfaced by this pass: does rule 7 in `docs/jamin-gemini-rules.md` ("Claude should
   currently not be used anywhere inside Shin") cover an invisible, internal matching call that the
   shopper never sees, or only the visible answer/fallback path it was written about?** Default:
   read it literally and use Gemini only for the matching step, since rule 7 was never reversed and
   two later design docs priced Claude Haiku without addressing it. **Reverses if:** Jamin says the
   rule was aimed at the user-facing answer and fallback specifically, in which case Claude Haiku
   ($1/$5 per 1M tokens, confirmed) becomes a real option again for this one internal step.
8. **New, surfaced by this pass: the cheap pipeline returns no reviews.** Rule 1 in
   `docs/jamin-gemini-rules.md` has the one Gemini call return "the object, the price, the reviews,
   etc.", and `docs/decisions.md` ("Gemini's reviews ship") confirms reviews are live on screen
   today. Tiers B to D return a price only; nothing in the cheap-lookup design sources a review.
   Default: ship cheap-path answers without a reviews line, since a shopper standing at a shelf is
   asking about price, and note it on screen as absent rather than silently blank. **Reverses if:**
   beta feedback or ratings show shoppers miss the reviews line specifically on cheap-path answers,
   in which case a review source (store page markup, or falling through to the grounded call for
   this one field) needs designing before wider rollout.

## 6. Work items

1. Confirm how many distinct real barcodes the beta has already scanned (`app/src/scans.ts`, answered, non-demo). [Claude]
2. Create the DataForSEO account and fund the $50 deposit. [Jamin]
3. Create a new Google Cloud project and billing account for a production-only Gemini key, separate from the phone-testing key. [Jamin]
4. Confirm or purchase the useshin.com (or getshin.app) domain if not already done. [Jamin]
5. Build and deploy a minimal public site: what Shin is, one screenshot, a contact address. [Claude]
6. Apply to AWIN as a publisher. [Jamin]
7. Apply to Rakuten Advertising as a publisher, including site URL and traffic numbers. [Jamin]
8. Apply to Impact.com as a publisher. [Jamin]
9. Once approved on each network, read the actual Partner/Publisher Agreement for GTIN feed-use restrictions before any tier-A code is written. [Jamin or Claude, whoever has the login]
10. Apply to the Best Buy Canada, Canadian Tire and Home Depot Canada programs inside Impact once the base account is approved. [Jamin]
11. Apply to the Walmart program inside Rakuten once its presence there is confirmed. [Jamin]
12. Reverse or confirm the ruling that keeps Shin's own catalogue off the scan path. [Jamin]
13. Decide whether rule 7's Claude ban covers the invisible matching call or only the visible answer path. [Jamin]
14. Build the UPC-E expansion and variable-measure barcode decoder (`identify/src/gtin-variants.ts`). [Claude]
15. Build the UPCitemdb client as the next free identity fallback (`app/src/upcitemdb.ts`). [Claude]
16. Build the ask-the-shopper-to-type-a-name route and field. [Claude]
17. Build the DataForSEO shopping-search client behind a dark flag (`identify/src/providers/dataforseo.ts`, `SHIN_CHEAP_LOOKUP`). [Claude]
18. Build the result filter (drop non-CAD, used, refurbished, wrong pack; parse size) (`identify/src/shopping-filter.ts`). [Claude]
19. Build the rules-first matcher and the one ungrounded Gemini matching call for the ambiguous remainder (`identify/src/shopping-match.ts`, `identify/src/providers/gemini-match.ts`). [Claude]
20. Wire the new pipeline into `app/server.ts` ahead of the existing single-call fallback, behind the flag. [Claude]
21. Extend `app/src/model-cost.ts` to log which path answered each scan and its real cost. [Claude]
22. Pull the 50-barcode real-beta-scan sample once it exists. [Claude]
23. Run the paired test (Arm A and Arm B) on all 50 barcodes and record the per-row table in section 3. [Claude]
24. Score the test against the fixed thresholds and report ship / fix / kill. [Claude]
25. If it ships, flip `SHIN_CHEAP_LOOKUP` on for a slice of live traffic first. [Jamin]
26. Set up a lightweight periodic moderation pass on the 874 crowd price rows. [Jamin or Aurik]
27. Ship moderated crowd prices, labelled as from shoppers. [Claude]
28. Create the RevenueCat account. [Jamin]
29. Generate the App Store Connect API key (.p8, App Manager role) and upload it to RevenueCat. [Jamin]
30. Create the Google Play service account, grant it "Manage orders and subscriptions," and upload the JSON to RevenueCat (allow 24 to 36 hours for the permission to propagate). [Jamin]
31. Write the Terms page the paywall needs before it can take money. [Jamin, with Claude drafting]
32. Decide whether cheap-path answers ship without a reviews line, or need a review source before wider rollout. [Jamin]
