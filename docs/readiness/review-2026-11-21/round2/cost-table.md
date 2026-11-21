# Pexi running cost and limits at 1,000, 10,000 and 50,000 weekly active users (2026-11-21)

Job `cost`, round 2. Money in US dollars unless marked CA$. FX: 1 USD = 1.4325 CAD (Bank of Canada FXUSDCAD, 2026-11-20,
https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1), so CA$3.99 = US$2.785.
WAU = weekly active users. Every number marked (A) is an assumption, not a measurement.

## 1. Every outside service, and how its use grows with users

| Service | What Pexi uses it for | Runtime or offline | Price or free-tier limit (vendor page, read 2026-11-21) | Grows with users? |
|---|---|---|---|---|
| Anthropic API, `claude-haiku-4-5-20251001` | Typical price range when Pexi's own data has none (identify/src/range-ask.ts, text only, no tools, max 1,024 output tokens, cached 90 days per product). Frame read (identify/src/pack-read.ts) is developer-only, so shoppers never trigger it (server.ts:1771-1775) | Runtime | Haiku 4.5 US$1 in / US$5 out per MTok; Haiku 5.5 US$0.10 / US$0.50 (https://platform.claude.com/docs/en/about-claude/pricing). Haiku 4.5 listed Active, "Not sooner than October 15, 2026" (https://platform.claude.com/docs/en/about-claude/model-deprecations). Own cap: 1,000 asks a month (catalogue-first.ts:150) | Yes, per uncached no-price lookup by a consenting shopper |
| Cloudflare (zone anjiawenda.com, tunnel relay.anjiawenda.com) | Public door to the Mac | Runtime | Free plan US$0/month "For personal or hobby projects that aren't business-critical"; Pro US$20/mo billed annually (https://www.cloudflare.com/plans/). Free plan: 1 rate-limiting rule, counted by IP, 10 s period (https://developers.cloudflare.com/waf/rate-limiting-rules/) | Bytes only; the 6.8 MB pack dominates |
| RevenueCat (`api.revenuecat.com/v1/subscribers`) | Is this phone Plus; purchases | Runtime | "Once you reach $2.5K MTR, you'll be charged 1%. For $2.5K, we'll charge you $25. No charges apply on months when you don't hit the $2.5K threshold"; card needed before $2.5k or "parts of the product will become unavailable" (https://www.revenuecat.com/pricing/). MTR is counted before the store's cut (RevenueCat staff, community forum; secondary, not on the pricing page) | With revenue; lookups per active phone every 10 min (scan-quota.ts:52), process ceiling 120 a minute (scan-quota.ts:57) |
| Apple commission | Cut of each subscription | n/a | 70% to developer in a subscriber's first year, 85% after one year; 85% from the start under the Small Business Program (https://developer.apple.com/app-store/subscriptions/ ; program: https://developer.apple.com/app-store/small-business-program/ "reduced commission rate of 15%", up to US$1 million prior-year proceeds) | With revenue |
| Apple Developer Program | Membership | n/a | US$99 per membership year (https://developer.apple.com/programs/whats-included/) | Fixed |
| Open Food Facts live lookup (`world.openfoodfacts.org/api/v2/product/`) | Names a barcode the local catalogue lacks (open-food-facts.ts) | Runtime | "15 req/min/IP address for all read product queries"; "If you need to fetch more than a few hundred products, we ask you to download the data"; limit reached means "IP address ban" (https://openfoodfacts.github.io/openfoodfacts-server/api/). Code spaces calls 600 ms apart, about 100 a minute (open-food-facts.ts:45, 58) | Per catalogue miss |
| OSM Overpass (`overpass-api.de/api/interpreter`) | Nearby shops for a 1 km cell, cached 24 h, cache ceiling 500 cells (stores.ts:338-340) | Runtime | "No more than 10,000 queries per day", "If you set something up that uses the Overpass API regularly, then divide those numbers by 100", "Commercial use should use self-hosted or paid Overpass servers" (https://wiki.openstreetmap.org/wiki/Overpass_API) | Per distinct cell per day |
| Open Prices (prices.openfoodfacts.org) | Bulk pull of prices into prices.db (price/src/openprices.ts) | Offline batch | No limit stated on its docs page (https://prices.openfoodfacts.org/api/docs shows only the title) | No |
| Project Hammer (jacobfilipp.com/hammerdata/hammer-5-csv.zip) | Weekly zip import (mac/hammer-refresh.sh, Sunday 05:30) | Offline batch | No price published; a file download | No |
| Icecat, USDA FoodData Central, Statistics Canada, BC liquor list | Catalogue and price imports | Offline batch | USDA FDC "1,000 requests per hour per IP address" (http://fdc.nal.usda.gov/api-guide/); not called at runtime (grep, see below) | No |
| Domain anjiawenda.com | The only zone on the Cloudflare account (mac/01-cloudflare-tunnel.md:29) | Fixed | Paid through 2027-08-19 (REGISTER R01 line 49); yearly price not found | Fixed |
| App Store Connect API | Mac expiry check only (mac/expiry-check.mjs) | Internal | Not per user | No |
| Notion API | Mac deploy notes (mac/deploy/notion.mjs) | Internal | Not per user | No |

Checked by grep over app/server.ts, app/src, mac, native/package.json: no Sentry, PostHog, Firebase, APNs, email or SMS
service is called. Only two npm dependencies (mediapipe, zxing, both run on the phone). Gemini is not called from any shopper
path (RULINGS 2026-11-07, "Pexi uses Gemini for nothing"; server.ts:3246).

## 2. Usage per user from real data

Source: REPORT.md, Mac scan table: 19 devices, 109 scans, 64 typed searches in 14 days; 44% of scans got any answer, 17.4%
a shop price and verdict. I could not open the Mac's table, so these are quoted from REPORT.md.

| Quantity | Value | Basis |
|---|---|---|
| Barcode scans per device per week | 109 / 19 / 2 = 2.87 | derived from REPORT.md |
| Typed searches per device per week | 64 / 19 / 2 = 1.68 | derived |
| Scans and typed per WAU per month (x4.33) | 12.4 and 7.3 | derived; assumes a tester device behaves like a WAU (A) |
| Scans that got an answer but no shop price | 44% - 17.4% = 26.6% | derived; this is the most that can reach Claude, because category, brand-markup and Statistics Canada rungs answer first (estimate.ts:1366-1440) |
| Claude is called only when | the ladder has no answer, the shopper consented, the product is not cached, and the device passed its limiters (12 per 10 min, 40 a day, weekly 10 free / 100 Plus, shared address buckets) | code: estimate.ts:1481, server.ts:986, 1609-1620, 1667-1690, range-ask.ts:376-398 |
| Evidence that Claude fires | none live: all 191 popular-barcode probes ran without consent and show `rangeAskedAt` empty in 191 of 191 (work/answers.jsonl). 93 of 191 ended with no basis (`fixed_prior`, `pool_too_wide`), which is the case where a consenting shopper would trigger Claude | checked |
| Claude asks per WAU per month, no cache, full consent | (12.4 + 7.3) x 26.6% = 5.2 (upper bound) | derived |
| Same, with 70% consent and 30% cache hits (central) | 2.5 | (A) |
| Same, with 50% consent and 60% cache hits (low) | 1.0 | (A) |
| Tokens per ask | central about 400 in and 60 out; upper about 1,000 in and 250 out (docs/decisions.md 2026-11-05 estimate). Code says the answer is "about 60 tokens in practice" (range-ask.ts:215) | prompt text is about 130 tokens; schema overhead unknown; not measured, no API key used |
| Cost per ask, Haiku 4.5 | central US$0.0007; upper US$0.00225 | derived at US$1 / US$5 |
| Cost per ask, Haiku 5.5 (x1.3 tokens for the newer tokenizer) | central US$0.00009; upper US$0.00029 | derived at US$0.10 / US$0.50 |
| Bytes per scan answer | mean 1,389, max 2,313 (work/answers.jsonl, 191 bodies) | checked |
| Pack download | 44,143,820 bytes uncompressed; about 6.8 MB compressed from the Mac (blind.jsonl round 1, app/public/js/pack.js:259-294); every pack version change re-sends it to every installed phone | checked by round 1 |

## 3. Monthly cost by service

Claude rows use the central and upper ask rates above. "Capped" is the shipped 1,000-a-month cap.

| | 1,000 WAU | 10,000 WAU | 50,000 WAU |
|---|---|---|---|
| Claude asks wanted, central to upper | 2,500 to 5,200 | 25,000 to 52,000 | 125,000 to 260,000 |
| Claude bill as shipped (cap 1,000, Haiku 4.5) | US$0.70 to 2.25 | US$0.70 to 2.25 | US$0.70 to 2.25 |
| Claude bill if the cap is lifted, Haiku 4.5 | US$1.75 to 11.70 | US$17.50 to 117 | US$87.50 to 585 |
| Claude bill if the cap is lifted, Haiku 5.5 | US$0.23 to 1.52 | US$2.27 to 15.24 | US$11.38 to 76.18 |
| Cloudflare Free | US$0 | US$0 | US$0 |
| RevenueCat | US$0 (under US$2.5K MTR) | US$0 (US$1,393 MTR at 5% is the most) | US$27.85 at 2%, US$69.58 at 5% (1% of all MTR once it is over US$2.5K, my reading of the quoted example) |
| Apple Developer Program | US$8.25 | US$8.25 | US$8.25 |
| Domain (price not found; US$15 a year assumed) | US$1.25 (A) | US$1.25 (A) | US$1.25 (A) |
| Open Food Facts, Overpass, Open Prices, Hammer, USDA, Icecat | US$0 | US$0 | US$0 (but see limits) |
| Mac power and home internet | not measured, excluded | not measured | not measured |
| **Fixed plus Claude as shipped** | **about US$10 to 12** | **about US$10 to 12** | **about US$10 to 12, plus RevenueCat above** |

## 4. Revenue at CA$3.99 a month (monthly plan only, all subscribers paying the monthly price)

Paying share is of WAU (A). Gross = subscribers x US$2.785. Net = gross x 85% (Small Business Program, or a subscriber past
one year) or x 70% (first year, not enrolled), less RevenueCat. Before sales tax. A yearly plan at CA$29.99 is CA$2.50 a month,
37% lower per subscriber.

| | 1,000 WAU | 10,000 WAU | 50,000 WAU |
|---|---|---|---|
| Subscribers at 2% / 5% | 20 / 50 | 200 / 500 | 1,000 / 2,500 |
| Gross a month, 2% | US$56 | US$557 | US$2,785 |
| Net at 15% Apple, 2% | US$47 | US$474 | US$2,340 |
| Net at 30% Apple, 2% | US$39 | US$390 | US$1,922 |
| Gross a month, 5% | US$139 | US$1,393 | US$6,963 |
| Net at 15% Apple, 5% | US$118 | US$1,184 | US$5,849 |
| Net at 30% Apple, 5% | US$97 | US$975 | US$4,805 |
| Cost as shipped as share of 2% net (15%) | about 21% to 26% | about 2% to 3% | about 0.5% (1.7% with RevenueCat) |

At every size the bill is small beside the revenue; the 15% versus 30% choice moves more money than any service
(US$84 a month at 10,000 WAU and 2%, US$418 at 50,000 and 2%). Break-even on the fixed costs needs about 4 paying
subscribers at 15% (US$9.50 / US$2.37 each).

## 5. First limit hit at each size

| Size | First limit that bites | Why (assumptions in brackets) |
|---|---|---|
| 1,000 WAU | Claude cap of 1,000 a month | 1,000 / 5.2 = 192 WAU at the upper rate, 1,000 / 2.5 = 400 at central, 1,000 / 1.0 = 1,000 at low. After it, no-price products get the broad-guess range (server.ts:1703-1710). Also Overpass's "regularly used" guidance of 100 queries a day: about 75 a day at 1,000 WAU (25% daily active, 50% share location, 60% new cell: A) |
| 10,000 WAU | Claude cap (about 10 times over), Overpass regular-use guidance (about 750 a day against 100) | Claude asks wanted: 25,000 to 52,000 against 1,000. Overpass hard daily limit of 10,000 not reached |
| 50,000 WAU | Open Food Facts 15 a minute per address at the evening peak; the Overpass 500-cell cache thrashing; the home upload on every pack rebuild | OFF: 0.41 scans per WAU per day x 50% reach OFF (A) x 10% in the peak hour = about 17 a minute (26,000 WAU if 56% of scans reach OFF and 15% fall in the peak hour). Pack: 50,000 x 6.8 MB = 340 GB, 3.2 hours of the measured 234 Mbps upload per rebuild (0.6 hours at 10,000). RevenueCat starts charging at 2% share, and wants a card on file |

What did not bite in these sizes: RevenueCat lookups (about 60 a minute at the 50,000 peak against the 120 ceiling: A),
Anthropic's own rate limits (not found on a fetched page), bytes through Cloudflare (1.4 KB a scan).

## 6. Not checked

- The Mac's real count of Claude asks (`identify/data/range-ask.json`, `.answers.jsonl`) and consent rate: not on this PC.
  This one number moves every Claude figure above by a factor of 5.
- Tester stats come from REPORT.md; 19 early testers are not a weekly-active population.
- Anthropic rate limits, RevenueCat REST rate limit (pages returned 404), the domain's renewal price, the home ISP's data cap,
  electricity, whether the Small Business Program is enrolled (App Store Connect not signed in, money.jsonl 1).
