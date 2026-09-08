# Decision memo — scan-to-verdict app, v1

Skeptic-filtered. One claim was **refuted and dropped**: "timezone is a permission-free proxy for province" (C.questions / C.device_inference) — America/Toronto is the canonical zone for both Ontario and Quebec, and New Brunswick is America/Moncton, not Halifax (https://en.wikipedia.org/wiki/List_of_tz_database_time_zones). Also dropped as fact: "olmaaap.com does not resolve" (A.wedge_hypotheses) — the real domain is olmaapp.com and it is live (https://olmaapp.com/).

## 1. v1 product-class scope

| Class | v1? | Why |
|---|---|---|
| Electronics, second-hand | **Ship** | The one class where the whole pipeline is verified end-to-end: model/variant fields exist in the vision output, SoldComps returns `soldPrice`, `soldCurrency`, `endedAt`, `condition`, `itemLocation` (B.soldcomps, https://sold-comps.com/docs). It is also the fraud-prone class SUSPICIOUS is for. |
| Apparel, second-hand (brand-name) | **Ship** | Same pipeline; Underpriced AI / Price Snap already cover "brand-name clothing" with eBay comps, so the data path is known to work (A.competitors, https://apps.apple.com/us/app/underpriced-ai/id6757161449). |
| Home, second-hand (furniture, small appliances) | **Ship, with a higher minimum-n** | Same pipeline, but SoldComps' sold window is 90 days, so slow movers (Aeron, older iPads on ebay.ca) may fall under the comps threshold and return INSUFFICIENT_DATA often (B skeptic, holds, https://sold-comps.com/). |
| Electronics / apparel / home, **retail-new** (store rack) | **Ship only when a model or style number is read** | eBay "new" comps are not a retail price — sealed items resell below shelf and "new" labels hide refurbs (C skeptic, weakened, https://forums.macrumors.com/threads/new-and-sealed-iphones-on-ebay.2179980/). Retail needs SerpApi google_shopping, which was not called live for any of Aeron/iPad/Zara (B.retail_sources, https://serpapi.com/pricing). Without a tag number the vision call can query on, return INSUFFICIENT_DATA. A bare "Zara wool coat" is unpriceable (B.retail_sources). |
| Grocery | **Ship narrow** | Chosen source: **Statistics Canada table 18-10-0245-01 via the Web Data Service** (free, no key, 25 req/s/IP, provincial, monthly, ~5-week lag; live pull 2026-09-03: Oranges $4.48/kg Canada, Eggs 1 dozen $5.00 Ontario, Apples $6.45/kg Canada) (B.grocery_sources, https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810024501); BLS APU for the US (https://www.bls.gov/cpi/factsheets/average-prices.htm). **No legal store-level source; produce returns the typical regional price only.** Flipp's ToS bans scraping (https://corp.flipp.com/terms-of-use/); Loblaws/Metro/Walmart CA have no public API (B.grocery_sources). Weakened by the skeptic in two ways that set the narrow scope: (a) StatCan is a till-price, promo-weighted unit value, so a regular shelf price sits structurally above it and reads OVERPRICED unless the band is asymmetric (https://www150.statcan.gc.ca/n1/pub/62f0014m/62f0014m2020008-eng.htm); (b) oranges and apples exist only per-kg or as a 1.36 kg bag, so a loose orange priced "each" is INSUFFICIENT_DATA without weight, while lemons, limes, cucumber, avocado, lettuce, broccoli, cantaloupe have per-unit rows (B skeptic, weakened). **v1 grocery = items with a printed unit or a per-unit StatCan row** (egg cartons, milk, bagged apples/oranges, per-unit produce), verdict labelled "vs. provincial average paid, July 2026". Branded packaged SKUs and loose per-each produce → INSUFFICIENT_DATA. Skeptic A rates this a "high", not "med", line item (A skeptic, weakened) — accept that and budget it as its own lane. |

## 2. The cascade

Model-choice caveat up front: the Haiku 61.6% vs Sonnet 5 91.7% OCR gap came from two different Roboflow boards; on the same legacy board Sonnet 4.5 scored 67.25% and Gemini 2.5 Flash 79.04% at $0.0003/task (B skeptic, weakened, https://playground.roboflow.com/models/anthropic/claude-4-5-sonnet, https://playground.roboflow.com/models/google/gemini-2-5-flash). The cascade shape holds; the model at step 2 is provisional until a 50-photo in-house eval (iPad backs, care tags, shelf tags) is run.

| Step | What | Trigger | Cost/scan | Measured or estimated |
|---|---|---|---|---|
| 0 | Client-side resize to ≤1092 px long edge; crop tag regions using OCR boxes | every scan | $0 | — (A skeptic on token pricing, https://platform.claude.com/docs/en/build-with-claude/vision) |
| 1 | On-device ML Kit OCR + barcode: `react-native-vision-camera-ocr-plus` PhotoRecognizer (2.0.6, 2026-08-20) or `@infinitered/react-native-mlkit-text-recognition` (5.0.1); `expo-camera` barcode when visible. **Needs a development build** — no OCR library runs in Expo Go (B.ocr_libraries, https://github.com/jamenamcinteer/react-native-vision-camera-ocr-plus, https://docs.expo.dev/versions/latest/sdk/camera/) | every scan | $0 | measured (release dates from npm/GitHub); Expo SDK 57 / New Architecture compatibility **unverified** |
| 2 | Cheap vision classification, existing structured output, with OCR transcript as context. Candidate: claude-haiku-4-5 (Roboflow measured $0.0030/task at 2.3K tokens, legacy board) (B.model_ocr_evidence, https://playground.roboflow.com/models/anthropic/claude-4-5-haiku) | every scan | $0.003–0.006 | $0.0030 measured on Roboflow's tasks; our token mix estimated |
| 3 | Escalate to claude-sonnet-5 (OCR 91.7%, $0.0064–0.0078/sample on the current board) (https://playground.roboflow.com/models/anthropic/claude-sonnet-5) | **exact trigger:** class ∈ {electronics, apparel, home} AND (`match_rung` ≤ `visual_probable` OR `variant_candidates` disagree on storage/chip/size OR `fraud_flags` non-empty). Never for grocery. | +$0.006–0.008 when fired | measured per-sample cost; escalation rate estimated at ~30% |
| 4 | Second-hand comps: SoldComps `GET /v1/scrape`, `ebaySite` by country, `sold=true`, `exactMatch=true`, `itemCondition=used`, `aspectFilter` for storage/size. If ebay.ca `totalItems` < 8, re-query ebay.com and FX-convert. Map 502/503/empty → INSUFFICIENT_DATA; 60 rpm cap; no retry storm (B.soldcomps, B.recommended_cascade, https://sold-comps.com/docs) | class second-hand AND `match_rung` ≥ `visual_probable` | $0.0045 (Starter $9/2,000) or $0.003 (credits $3/1,000); 1–2 requests | measured from pricing page; requests/scan estimated |
| 5 | Retail-new: SerpApi google_shopping `gl=ca/us` (B.retail_sources, https://serpapi.com/pricing) | user/vision marks new-in-store AND a model/style number is in the query; else INSUFFICIENT_DATA | $0.010–0.025 | measured price tiers; result quality **unverified live** |
| 6 | Grocery: StatCan WDS (province from the just-in-time pick), BLS APU; cache monthly with reference period attached (B.grocery_sources) | class = grocery AND unit-normalised price available from OCR or user | $0 | measured (live calls 2026-09-03) |
| 7 | Existing pure verdict logic; store only derived stats (quantiles, n, date range), not raw listings, per SoldComps' redistribution clause (B skeptic, https://sold-comps.com/terms) | always | $0 | — |

**Per-scan cost (estimated from the measured unit prices above):**
- Second-hand electronics/apparel/home: ~$0.012 typical (Haiku + 1.5 comps calls), ~$0.014 with 30% Sonnet escalation, ~$0.03 worst case (Haiku + Sonnet + 2 comps) (B.recommended_cascade).
- Retail-new with model number: ~$0.02–0.03 (Haiku + SerpApi).
- Grocery: ~$0.004–0.005 (Haiku only).
- Blended, assuming 60/15/25 second-hand/retail/grocery: **~$0.013/scan**. Mix is an assumption, not measured.
- Consequence for the free tier (A skeptic, weakened): 150 scans/month costs $1.35–$6.75 in API spend depending on model and resizing, against OLMA's $4.99/mo (https://platform.claude.com/docs/en/about-claude/pricing). Meter free scans **per month** (OLMA: 5/month), not per day; one INSUFFICIENT_DATA retake per scan maximum.

## 3. Onboarding

Zero pre-scan questions; the only pre-scan screen is character idle + "Point at anything. Get a verdict." + Scan (C.proposed_onboarding). Verdict-before-account/paywall holds: Duolingo +20% DAU from deferring sign-up, 55.4% of 3-day-trial cancellations on day 0, the Underpriced AI prospect who quit at sign-up (C skeptic, holds, https://review.firstround.com/the-tenets-of-a-b-testing-from-duolingos-master-growth-hacker/, https://www.revenuecat.com/state-of-subscription-apps, https://news.ycombinator.com/item?id=46478740).

| Question | ask_when | Rule |
|---|---|---|
| Country (CA/US) | **never** — inferred, shown as a tappable "CA · CAD" chip on **every** verdict | Weakened: Android <16 derives `regionCode` from the language locale ("Android has no separate region selection"), so a Canadian on en-US gets US/USD. **Android: `timeZone` first, `regionCode` as hint. iOS: `regionCode`, pin expo-localization ≥16.0.0 (SDK 52+).** VPN has no effect (holds) (C skeptic, https://raw.githubusercontent.com/expo/expo/main/packages/expo-localization/android/src/main/java/expo/modules/localization/LocalizationModule.kt, https://docs.expo.dev/versions/latest/sdk/localization/) |
| Currency | **never** | Derived from country, never read from `currencyCode` (C.questions) |
| Province | **just_in_time**, first grocery scan, persisted, re-derived when `timeZone` changes | A real question, not pre-filled. For America/Toronto show ON/QC (fr-CA locale as QC hint); America/Moncton → NB. Wrong pre-fills stick — <5% of users ever change a setting (C skeptic, https://archive.uie.com/brainsparks/2011/09/14/do-users-change-their-settings/) |
| **Retail-new vs second-hand** — lives **on the verdict card, per scan**, pre-set from the vision call's condition evidence | **just_in_time**: when vision confidence on new/used is low, a one-tap confirmation **before** the verdict; otherwise a toggle on the card | Flipping re-runs only the comps/retail query, not the vision call. Retail side routes to SerpApi or INSUFFICIENT_DATA; eBay "new" comps are labelled "resale-new", never presented as retail (C skeptic, weakened). Grocery skips the toggle. |
| City / stores / account / location permission / notifications | **never** — cut | City moves nothing; a store list moves nothing computable (holds in part); location duplicates the province pick; notifications have no v1 feature (C.questions, https://foursquare.com/resources/blog/ad-tech/ios-14-heres-how-the-new-privacy-permissions-could-impact-apps/, https://batch.com/ressources/etudes/benchmark-notifications-push-crm-mobile) |
| Camera permission | on Scan tap | Denied → photo-library fallback (C.proposed_onboarding) |
| Paywall | after monthly free scans are spent, store billing, no account | Benchmark against OLMA $4.99/mo, $40/yr, 5 free/month — not Price AI's $9.99 (A skeptic, https://olmaapp.com/) |

## 4. Character

- **Tech: Rive state machine**, one `.riv`, verdict tier as a named input. Duolingo's precedent: Rive state machines, files "under a megabyte", a deliberately simple body that is cheap to animate (A.character_precedents, https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life). Runtime integration in Expo (rive-react-native 9.8.5, no config plugin found) is **unverified** — see section 7.
- **States (9 + variants):** idle; thinking/loading; STEAL → ecstatic; BUY_NOW → confident nod; FAIR → easy shrug-ok; OVERPRICED → wince; RIPOFF → outrage; SUSPICIOUS → side-eye; INSUFFICIENT_DATA → squint and point at the `next_photo` request. Certainty modifier from `match_rung` + comp count (squint for `category_only`/thin comps) instead of a "Confidence 90%" widget (A.take_and_improve).
- **Cost quote:** riveanimator.com Starter $250 (idle + 1 state) + $100 per extra state ≈ **$950 for 9 states** with your own artwork, 5–7 days; Professional Character $1,200+ for 6–8 states including design (A.character_cost_quotes, https://riveanimator.com/pricing/, https://riveanimator.com/rive-character-animation/). CC-BY Rive Marketplace remixes are $0 but commercial/attribution terms for a paid app are unverified (https://rive.app/docs/community/marketplace-overview).
- **What to avoid:** (1) Never notify or guilt — Duolingo's Trustpilot 1.6/5 is about nagging (https://au.trustpilot.com/review/duolingo.com). (2) **Repetition** — the weakened part: 9% of Duolingo iOS complaints are a mascot's repetitive commentary and users asked for a mute toggle; Clippy and Microsoft Bob were removed for the same reason (A skeptic, https://approast.app/duolingo, https://en.wikipedia.org/wiki/Office_Assistant). Ship 2–3 clip variants per tier and a **settings toggle to hide/minimise the character**, with verdict word and range bar fully legible without it. (3) Do not model it as retention: Duolingo's own numbers are +1.7% D7 for animations and +5% DAU for notification copy (https://blog.duolingo.com/how-duolingo-streak-builds-habit/). Count it for differentiation and the share screenshot only.

## 5. Take and improve

| Incumbent feature (who) | Our version | Complexity | v1 |
|---|---|---|---|
| Five verdict tiers + Confidence % (OLMA; Underpriced.app; Deal Hunter) — https://apps.apple.com/us/app/olma-scan-compare/id6790042890 | Same 5 tiers + SUSPICIOUS + INSUFFICIENT_DATA; the character is the verdict, tier word as caption, no numeric score; sold-price based (A.take_and_improve) | low | **yes** |
| "Insufficient Data" instead of a fake score (Price AI) — https://www.trypriceai.app/support.html | INSUFFICIENT_DATA + character asks for `next_photo`, one retake max (A.take_and_improve; A skeptic on cost) | low | **yes** |
| "Add More Details" / chat refine (OLMA 1.0.5, Price AI) | `variant_candidates` as 2–4 tap chips; tapping re-runs only the comps query (A.take_and_improve) | low | **yes** |
| Typical-price range bar with tagged price (OLMA) | P25–P75 for the condition band, asking price pinned, character stands at the pin (A.take_and_improve) | low | **yes** |
| "Tagged at $X" from the price tag (OLMA OCR; Price AI barcode) | `visible_price` from on-device ML Kit (step 1) pre-fills the asking price; user confirms (A.take_and_improve, B.recommended_cascade) | low | **yes** |
| Confidence % / "based on N sold comps" (OLMA, Underpriced AI, Price AI) | Provenance line "Exact model match · 12 sold in Canada, last 60 days" from `match_rung` + count + median only (A.take_and_improve; weakened — store derived stats, not raw listings, B skeptic) | low | **yes** |
| Authenticity score (Thrift AI, ReSell AI, Underpriced.app) | SUSPICIOUS changes the verdict rather than adding a score; side-eye pose (A.take_and_improve). Threshold currently unevidenced. | low | **yes** |
| Share a find (Underpriced AI link, What is it Worth card, Price Snap feed, OLMA 1.0.3) | On-device share card via react-native-view-shot + expo-sharing, share-sheet only, no save-to-photos (no new permission) (A skeptic, holds, https://docs.expo.dev/versions/latest/sdk/captureRef/, https://docs.expo.dev/versions/latest/sdk/sharing/) | low | **yes** |
| Free tier 5/mo (OLMA) vs 1/day, 2 free, 3-day trial (Price Snap, Price Checker, Price AI) | Monthly meter, never gate the verdict; every 1-star review recovered is about paywall/ads/trial (A.wedge_hypotheses; weakened to a unit-economics choice, A skeptic) | low | **yes** |
| Comparable listings with outbound links (OLMA, Underpriced AI, Price AI) | 3 sold comps with eBay links — **weakened**: data is scraped via logged-in sessions against eBay's User Agreement, SoldComps pushes indemnity to us (B skeptic, https://www.ebay.com/help/policies/member-behaviour-policies/user-agreement?id=4259) | med | no |
| New vs used in one flow; per-unit multipack (Price AI 1.2.4) | Retail/used toggle is in; grocery $/kg normalisation is the narrow grocery lane in section 1 (weakened to high, A skeptic) | high | grocery-narrow only |
| Scan history / Collection (OLMA, Price AI, Value AI) | Local-only list, no account (A.take_and_improve) | med | no |
| Deal Score 1–100, chat, streak + savings counter, travel mode (Price AI, Price Snap, OLMA) | Do not build; each is a new screen or new per-scan cost (A.take_and_improve) | high | no |

## 6. Risk register

- **eBay closed all signed-out sold-data routes (Jul 22 / Aug 19, 2026); SoldComps runs on cookie sessions, is "Degraded", has no SLA, and its terms indemnify it against eBay ToS claims** — put comps behind an interface with a null provider; apply for eBay Marketplace Insights anyway (B skeptic, holds, https://www.openwebninja.com/blog/how-to-get-ebay-sold-and-completed-listings, https://sold-comps.com/status).
- **ebay.ca comps depth for any specific variant is unmeasured** (ebay.ca returned 403); "same-country preferred" may push CA scans to INSUFFICIENT_DATA or to USD fallback, and a thin CA set + FX boundary can produce false SUSPICIOUS/RIPOFF — decide whether SUSPICIOUS may fire below the same-country threshold (B skeptic, C skeptic).
- **FX and cross-border shipping adjustment rule for ebay.com fallback is unspecified**; Bank of Canada Valet gives FXUSDCAD without a key (critic, https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1).
- **Grocery verdicts against a promo-weighted till average bias toward OVERPRICED**; province averages differ widely (oranges Jan 2026: ON $2.89/kg vs QC $5.55/kg) and StatCan says differences "may reflect brand and quality" — asymmetric band, calibration set needed (C skeptic, B skeptic, https://canstatlens.ca/product/oranges-per-kilogram/quebec).
- **Android wrong-country default is common, not an edge case** (language-derived region on Android ≤15; Android 16 adds a real region setting on 7.5% of devices) — timezone-first inference, prominent chip (C skeptic, https://www.androidauthority.com/android-16-region-measurement-settings-3521970/).
- **Uncorrected defaults**: the new/used toggle is the input that flips the comps distribution and SUSPICIOUS, and most users never change defaults; vision accuracy on new/used from one photo has no data (C skeptic).
- **Model choice rests on cross-board benchmarks Roboflow calls non-comparable**; no in-house eval exists; Gemini Flash-class may be cheaper and better at OCR (B skeptic).
- **On-device OCR requires a dev build**, and library compatibility with Expo SDK 57 / New Architecture is untested (B.ocr_libraries; critic).
- **Retail-new has no verified price source**; the store-rack jacket returns INSUFFICIENT_DATA in v1 unless a style number is read (B.retail_sources, C skeptic).
- **Character repetition is the documented mascot failure that applies to once-per-scan reactions**; hide toggle + pose variety are v1 scope (A skeptic).
- **Free tier is unit economics**: 150 scans/month = $1.35–$6.75 API spend vs a $4.99 price point (A skeptic).
- **Demand evidence is absent**: Reddit blocked, HN empty; paid entrants top out ~10K Play installs while Google Lens does 20B visual searches/month with 1 in 4 commercial — "underserved" vs "small niche" is undetermined (A skeptic, https://abc.xyz/2024-q3-earnings-call/).
- **OLMA is live, iOS-only, cross-border by design** ("Know the fair price, anywhere"); Canada-first is a quality bar, not a moat (A skeptic, weakened, https://olmaapp.com/).
- **Legal exposure is one hop away**: linking to or displaying data obtained by scraping logged-in eBay sessions; Canadian retailer ToS unread (403/404) — log it as a decision (B skeptic).
- **Price Snap-style misidentification is the other 1-star theme**, alongside paywalls; honest INSUFFICIENT_DATA is the mitigation (A.competitors, https://apps.apple.com/us/app/price-snap-thrift-scanner-ai/id6749811323).

## 7. Open questions handed to Gemini Deep Research

1. **Free incumbents, Android competitors, and character-in-utility precedents** (lane A)
2. **Live comps depth, Marketplace/Kijiji pricing, and Canadian grocery SKU sources** (lane B)
3. **Onboarding walkthroughs, camera-permission benchmarks, Quebec and Play policy** (lane C)
## Gemini Deep Research runs (submitted 2026-09-04 from Aurik's Gemini Pro account)

| Lane | Chat |
|---|---|
| A. Free incumbents, Android competitors, character-in-utility precedents | https://gemini.google.com/app/e370c30a85e06af2 |
| B. Live comps depth, Marketplace/Kijiji pricing, Canadian grocery SKU sources | https://gemini.google.com/app/5793063b1aed9316 |
| C. Onboarding walkthroughs, camera-permission benchmarks, Quebec and Play policy | https://gemini.google.com/app/b9ec6ba905b0bdf7 |

Prompts are the three `gemini-prompt-*.txt` files beside this memo. Reports are not yet folded in.
