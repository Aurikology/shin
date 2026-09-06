# The moonshot: Shin with the walls removed

Written 2026-09-06 on his instruction, after two chat drafts. His brief for it: impossible for an
app and a company of our size to build, possible for a company with Loblaw's or Google's reach,
no new physics, and still in line with the vision (`docs/the-vision.md`): so useful people cannot
separate from it, and it makes money. This file is the root of the build tree; every improvement
is a step toward one node in it.

His instruction for this edit: for everything the app does, the backend that does it is listed in
full, every tool and every operation, and everything carries a metric.

## How to read the numbers

Every number is one of four things and says which.

- **target**: a moonshot figure, chosen, with the reason it was chosen beside it.
- **derived**: computed from other numbers on this page; the chain is shown.
- **measured**: read off the current repo, with the date.
- **sourced**: a published figure; the link is at the bottom.

Nothing here is a fact about Shin today unless it says measured. The price, the free allowance
and the paywall shape are unset and his; no number on this page assumes them.

## One sentence

Every price at every major Canadian chain, in every store, live; every purchase a person makes,
itemised, arriving in Shin on its own; and a guarantee, backed by money, that a Shin user never
pays more than the fair line.

## The scale it is built for

| Figure | Value | Kind |
|---|---|---|
| Installs in Canada | 10,000,000 | target: Yuka has 85M users worldwide and made 6.35M euros in 2024 (sourced); 84% of Canadians carried a smartphone in 2020 (sourced), so the ceiling is most of the country |
| Weekly active | 4,000,000 | target: 40% of installs, the return figure the vision measures |
| Store trips per active person per week | 2 | target |
| Tags seen per trip | 50 | target: one aisle's worth of shelf tags in view over a trip |
| Tag verdicts per week | 400,000,000 | derived: 4,000,000 × 2 × 50 |
| Tag verdicts per second, average | 661 | derived: 400,000,000 / 604,800 seconds |
| Tag verdicts per second, peak | 6,600 | target: ten times average, for Saturday afternoon |
| Cold recognitions (a model call) per week | 40,000,000 | target: one tag in ten misses every cache |
| For scale: Google Lens visual searches | 20,000,000,000 a month, about 7,700 a second | sourced (October 2024); derived per second: 20,000,000,000 / 2,592,000 seconds. Shin's peak above is below Lens's average |

## The five walls, and what "past the wall" measures

1. **Live per-store price and stock feeds from the chains, under contract.** Loblaw, Sobeys,
   Metro, Walmart, Costco, Canadian Tire, Best Buy: 7,079 stores between them (derived from the
   sourced counts in section 3). The feed exists (Statistics Canada collects food prices from
   nearly 500 grocery outlets for the price index, sourced; delivery platforms show per-store
   prices today); the reason to give it to an app that sends customers next door does not. Past
   the wall: 7 chains, every store, price change to index under 5 minutes (target).
2. **Itemised purchase history without a scan.** Loyalty programs hold every item bought at their
   chain; Canada's open banking law (assented March 2026; draft regulations published June 2026;
   phase one is read-only and covers transaction records, not the items in them, sourced) lets a
   person share bank transactions with an app. The items come from the loyalty feed; the bank
   confirms the total. Past the wall: 90% of a person's spend captured with no photo (target).
3. **Platform presence.** The phone's camera and wallet already recognise things and hold
   receipts at the operating-system level. Past the wall: the verdict in the camera app, zero
   installs needed, reach = every Canadian phone on that platform (derived from what platform
   means).
4. **Tens of millions of installs.** The guarantee and seller-pays money only work when a high
   price is a price nobody pays. Past the wall: 10,000,000 installs (target above).
5. **A model trained on Canadian shelves and receipts at that scale.** Recognition of anything in
   any condition, priced from what identical things sold for, trained on the purchase graph of
   wall 2. Past the wall: 1,000,000,000 labelled rows (image, product, store, price, minute)
   (target), and the model runs on the phone (target: under 50 MB, 10 frames a second on a
   mid-range 2024 phone).

## What the app does, and what does it

Each capability: what the person sees, then the backend in the order it runs, one operation per
line, a metric on every line.

### 1. Point at anything and it is already answered

**What the person sees.** Every tag in view carries the face (good, fair, high). No button. In
any store, on any kind of thing.

**Backend, in the order it runs.**
1. On-device object detector: boxes every product and every shelf tag in the frame. 30 frames a
   second at 640×480 (target); the current detector boxes whole objects only (measured
   2026-09-06, whole-object boxes, no tag region).
2. On-device tracker: keeps a box's identity across frames so one tag is looked up once, not
   thirty times a second. Under 5% re-lookups per tag (target).
3. On-device tag reader: reads price, unit price and product name off the shelf tag. 98%
   character accuracy on chain tags (target); 100 ms per new tag (target).
4. On-device barcode read when a barcode is in frame: 100% within the catalogue (derived: a
   read barcode is a key), 1 ms lookup (measured 2026-09-05, laptop).
5. Index lookup: tag or barcode → this store's live price and every price within the radius.
   150 ms round trip (target), 50 ms with no signal from the offline pack (section 12).
6. Verdict arithmetic (section 4): under 20 ms (target).
7. Face drawn on the tag: first face within 350 ms of the tag entering the frame (derived:
   33 + 100 + 150 + 20 = 303 ms, plus the draw).
8. Cold path when no tag and no barcode: recognition (section 2), under 1 second p50, 2 seconds
   p99 (target: his example, "results return in 1 second").
9. Every look is recorded: product, store, minute, the price read off the tag. This is the
   harvest that corrects the feeds; 100% of looks recorded (target), 0 bytes of image kept
   unless the person's data policy says otherwise (his wording, open).

### 2. It knows what the thing is, in any condition, with or without a barcode

**What the person sees.** A name, a size, and for used things a condition, before the price.

**Backend, in the order it runs.**
1. Kind classifier: packaged, tech, used, produce, unlisted. 99% (target) on the in-store
   frame, so the right path runs (vision: anything, with a path per kind).
2. Barcode → catalogue: 100% of catalogued codes (derived); catalogue size 100,000,000 products
   (target: his example; half of the 200,000,000 product codes GS1's registry held in 2022,
   sourced; Open Food Facts holds 4,000,000 products, sourced; today 5,180,000 rows, measured
   2026-09-05: 4,970,000 electronics, 122,000 grocery).
3. Front-of-pack recognition without a barcode: top-1 90% packaged, 90% tech (target). Cost per
   cold call $0.0034 on the basic model, $0.0068 on the pro model (derived 2026-09-05 from
   2,459 image tokens at 1568 px; no key exists in the repo's environment, measured 2026-09-06).
4. Same-product check: the person's crop against the catalogue's photo, one call. 97% agreement
   with a human on "same thing" (target); today no code sends the catalogue photo (measured
   2026-09-06).
5. Used goods: model identification plus a condition grade in four steps, 80% agreement with a
   human grader (target); today no condition field exists (measured 2026-09-06).
6. Produce: variety and grade from the image, 90% top-1 (target); priced per unit from the
   index; today the price engine declines produce (measured 2026-09-06).
7. Unlisted things (no catalogue row anywhere): the model names it and the verdict runs on
   whatever prices exist, with the confidence carrying the doubt. Answer rate 100% by design
   (vision principle 1); share with a priced comparable is the metric, 95% packaged and tech,
   80% used, 90% produce (target).
8. Recognition cache: same product in the same store within a day is not re-recognised. 90%
   hit rate (target; the cold-call figure in the scale table assumes it).
9. On-device model (wall 5) takes the common case off the server: cold server calls fall from
   one in ten to one in a hundred (target), which is the difference between $136,000 and
   $13,600 a week in model bills (derived: 40,000,000 and 4,000,000 cold calls × $0.0034).

### 3. It knows the price everywhere, now

**What the person sees.** This store's price, the cheapest within reach, and how far.

**Backend, in the order it runs.**
1. Chain feed adapters, one per chain, contractual (wall 1): price and stock per store, pushed
   on change. 7 chains (target); price change to index under 5 minutes, stock under 15 minutes
   (target). Today: two retailer scrapers and one open dataset with 200,000 prices in it
   (sourced, February 2026), no contract (measured 2026-09-05).
2. The price index: one row per product per store per price change. Live rows: about
   141,000,000 (derived: 4,241 grocery-format stores × 33,248 items; the item count is the
   US supermarket average, sourced 2025, no Canadian figure found; pharmacies and the two
   general chains carry fewer and are left out of this product). History kept 24 months
   (target: the guarantee needs minutes, the personal model needs seasons).
3. The store graph: every store of every chain, location, hours, stock. Store counts, all
   sourced from the chains' own filings and pages: Loblaw 2,504 (566 corporate, 562 franchise,
   1,376 associate-owned drug stores, January 2026); Sobeys more than 1,600 (May 2026); Metro
   about 1,000 food stores and 640 pharmacies; Walmart Canada 401 (July 2026); Costco Canada
   112 (November 2025); Canadian Tire 502 (end of 2025); Best Buy Canada over 320. Total
   7,079 (derived); grocery-format 4,241 (derived: 1,128 + 1,600 + 1,000 + 401 + 112).
   Geocoded 100% (target).
4. Harvest corrections: a tag read that disagrees with the feed by more than 2% is recorded as
   a correction and shown on the next verdict (target threshold); corrections per hundred
   verdicts is the vision's downward signal. Today the correction store exists and is read by
   the verdict (measured 2026-09-06); no training consumer.
5. Marketplace feeds for used goods: sold prices, not asking prices. Today the marketplace
   adapter returns asking prices only, because sold data is closed to new accounts (measured
   2026-09-06); blocked outside, lifts with a data agreement.
6. Freshness monitor: a store whose feed is silent for 30 minutes is marked stale and the
   verdict's confidence says so (target).

### 4. It says fair or not, and where cheaper

**What the person sees.** Good, fair, or high, with the reason in one line, and the cheaper one
with the distance.

**Backend, in the order it runs.**
1. The fair line: for chain goods, the median of live prices within the person's radius at that
   minute; for used goods, the median of the last 30 sold prices of the same model and
   condition within 90 days (target definitions; the statistic is a decision, not a fact).
2. The verdict: arithmetic, never a model call (vision principle 1). Under 20 ms (target).
   Returns the face, the confidence and its basis, on every answer (measured 2026-09-05: the
   verdict returns a confidence and its basis; refusals removed).
3. Same product cheaper within radius: 100% of index-covered products (derived from the index).
4. Equivalent product cheaper: top 3 within 200 ms (target). Today 143 of 438 priced codes
   produce an alternative (measured 2026-09-05).
5. The reason line: written from the numbers, not by a model; one sentence, no identifiers.

### 5. The week's basket is priced before the trip

**What the person sees.** The one store where the whole basket is fair, or the split if the
split is worth the drive; the item that will be gone by evening is reserved.

**Backend, in the order it runs.**
1. Basket prediction (section 11): the next basket, 70% of items right (target).
2. Basket pricing: every item at every store within the radius from the live index. 40 items ×
   30 stores under 1 second (derived from index lookups at 150 ms, batched).
3. Split optimiser: one store or two, drive cost included, answer under 3 seconds (target).
4. Stock check per line from the store graph, under 15 minutes old (target).
5. Reservation through the chain's own API, held 4 hours (target; needs wall 1).
6. Notification: the plan arrives the morning of the usual trip day (learned, section 11);
   open rate is the metric (target 40%).

### 6. Out of stock means a swap, not a shrug

**What the person sees.** The shelf is empty; the app already names the nearest store that has
it, or the equivalent on this shelf that is fair.

**Backend.**
1. Stock truth from the feed (section 3, step 1), under 15 minutes old (target).
2. Nearest-with-stock query on the store graph, under 100 ms (target).
3. Equivalent-on-shelf from the alternatives finder (section 4, step 4).

### 7. Receipts arrive on their own

**What the person sees.** Nothing. The purchase is in the app before they reach the car.

**Backend, in the order it runs.**
1. Loyalty feed per chain (wall 2): every itemised purchase within 60 minutes (target).
2. Open banking feed: completed, pending and pre-authorised transactions, which is merchant,
   amount and time, not the items (sourced, draft regulations June 2026); lag one business day
   (target; the regulations set no latency).
3. Matcher: bank transaction to loyalty receipt by merchant, amount and minute; 98% matched
   (target).
4. Receipt photo reader, the fallback for cash and for sellers with no feed: 97% of line items
   right (target); today no receipt reader exists (measured 2026-09-06).
5. Purchase graph write: person, product, store, price, minute. Coverage: 90% of a person's
   spend (target, the wall 2 metric).

### 8. The ledger fills itself, for everyone

**What the person sees.** What they paid, what the fair line was at that minute at that store,
what they would have paid elsewhere. No tap.

**Backend, in the order it runs.**
1. On every purchase-graph row: fair line at that minute at that store, cheapest within the
   radius at that minute, from the price index history. Under 1 second per receipt (target).
2. Savings measured, not self-reported: 100% of captured purchases (derived from the graph).
   This replaces the outcome tap the vision calls a biased sample.
3. The instruments, daily (target): installs, installs per video, return in week two, answer
   rate per kind, scans per returning person, corrections per hundred, measured savings per
   person. Today none of these has a reader (measured 2026-09-05).
4. Failure is loud: any instrument that reads zero for a day pages someone (target: under 1
   hour to a human).

### 9. The guarantee: pay above the fair line and get the difference back

**What the person sees.** A refund, without asking.

**Backend, in the order it runs.**
1. Trigger: a purchase-graph row where paid exceeds the fair line (section 8, step 1).
2. Counterfactual proof: a price at an alternative store within the radius, observed within 60
   minutes either side of the purchase, kept with the claim (target rule; this is also what
   makes the savings claim lawful under the Competition Act, hard rule 2 of this repo).
3. Decision within 24 hours, payment within 5 business days (target).
4. Fraud limits: one claim per receipt, receipt matched to a bank transaction (section 7, step
   3) before payment (target rule).
5. Reserve: the overpay rate measured in section 8 sets the reserve and the tier's price (the
   price is his and unset).

### 10. Sellers pay to be shown fair, and paying cannot move the face

**What the person sees.** A "verified fair" mark on a chain's tag, on the same arithmetic as
every other tag.

**Backend.**
1. Verification job: a chain's prices scored by the same verdict service, nightly, per store
   (target).
2. The mark is a label beside the face; the face itself is never an input the fee can touch.
   Audit: 100% of marked tags re-scored by an unpaid path daily; any divergence pulls the mark
   (target rule).
3. Fee billed per store per month (amount unset, his); needs wall 4 first.

### 11. It knows what you will buy before you do

**What the person sees.** The basket, the radius and the alerts fit them without being set.

**Backend.**
1. Personal model per person: next basket (70% of items, target), usual trip day and hour,
   radius from actual trips, flinch price per category from walks versus buys.
2. Trained nightly on the person's own purchase graph and the population's (target).
3. Nothing leaves the phone that the data policy does not allow (his wording, open).

### 12. It works with no signal in the store

**What the person sees.** The same faces in a basement grocery.

**Backend.**
1. Offline pack builder: the person's radius, 30 stores × the top 5,000 items each, prices
   only. About 4.5 MB (derived: 150,000 rows × 30 bytes); refreshed daily on wifi (target).
2. On-device lookup under 50 ms (target).
3. Looks made offline are synced as harvest when signal returns (target: 100%).

### 13. It is already on the phone

**What the person sees.** The verdict inside the camera app; the receipt in the wallet.

**Backend.**
1. Platform integration (wall 3): the recognition and verdict surface exposed to the camera
   app; reach = every Canadian phone on the platform (derived).
2. Wallet receipts as a purchase-graph source, same matcher as section 7.

### 14. Every answer is a moment someone can share

**What the person sees.** A card: the thing, the face, the price, the link that opens the app on
that product. Once the name is cleared (hard rule 1 of this repo).

**Backend.**
1. Share card service: rendered under 200 ms (target); today the card exists and carries no link
   by design (measured 2026-09-06).
2. Per-card and per-video links: installs per card and per video counted (vision: installs per
   video; planning figure 0.1% to 0.3% of views become installs, derived, weak).

## The backend as one list, every tool

| System | What it holds or does | Metrics |
|---|---|---|
| Chain feed adapters | one per chain, price and stock per store, on change | 7 chains (target); under 5 min price, 15 min stock (target) |
| Price index | product × store × price change, 24 months | about 141,000,000 live rows (derived, section 3); lookup 150 ms (target) |
| Store graph | every store, location, hours, stock | 7,079 stores across 7 chains (derived from sourced counts, section 3); 100% geocoded (target) |
| Catalogue | identity, size, variant, kind, photo | 100,000,000 products (target); 5,180,000 today (measured 2026-09-05); barcode 1 ms, text 22 ms (measured 2026-09-05, laptop) |
| On-device detector and tracker | boxes and identities per frame | 30 fps at 640×480 (target); under 5% re-lookups (target) |
| Tag reader | price, unit price, name off a shelf tag | 98% character accuracy, 100 ms (target) |
| Recognition service | kind, product, same-product, condition, produce | 90/90/97/80/90% as in section 2 (target); $0.0034 per cold call (derived) |
| Recognition cache | product per store per day | 90% hit (target) |
| On-device model (wall 5) | the common case off the server | under 50 MB, 10 fps mid-range 2024 phone, cold calls 1 in 100 (target) |
| Training pipeline (wall 5) | purchase graph + corrections → model | 1,000,000,000 labelled rows (target); retrain monthly; eval set 10,000 held-out photos per kind (target) |
| Verdict service | the fair line, the face, confidence and basis | arithmetic only; under 20 ms (target); confidence on every answer (measured 2026-09-05) |
| Alternatives finder | same cheaper, equivalent cheaper | 100% index-covered (derived); top 3 in 200 ms (target); 143 of 438 today (measured) |
| Basket planner | price the basket, split, reserve | 40 items × 30 stores under 1 s; plan under 3 s; hold 4 h (target) |
| Purchase graph | loyalty + bank + receipt photo, matched | 60 min loyalty, 1 business day bank, 98% matched, 90% of spend (target) |
| Receipt reader | the photo fallback | 97% line items (target); none today (measured) |
| Ledger and instruments | paid, fair, elsewhere; the seven measures | per receipt under 1 s; instruments daily; zero-day page under 1 h (target) |
| Settlement | refunds, affiliate and card-linked payouts, seller fees | decision 24 h, pay 5 days; 100% of payouts tied to a graph row (target); affiliate 1 to 15% (sourced) |
| Personal model | basket, trip day, radius, flinch price | 70% of items; retrain nightly (target) |
| Offline pack | radius prices on the phone | 4.5 MB (derived); daily; 50 ms (target) |
| Platform surface | camera app and wallet | reach = every phone on the platform (derived) |
| Share cards | one per answer, with its link | 200 ms (target); installs per card counted |
| Consent and deletion | the data policy, made real | delete everything about a person within 24 h of the ask (target); wording his, open |
| Infrastructure | serving all of it | 6,600 verdicts/s peak (target); 99.95% up, 22 min a month (derived); under $0.0005 per tag verdict excluding cold calls (target) |

## The money, in order of fit with the vision

1. **Paid from measured savings.** Possible here because the purchase graph makes savings
   measurable for everyone, not only those who tap. Payers per hundred downloads: planning
   figure 2 to 3 (sourced: 2.6% North American download-to-paid, 2.1% freemium trial-to-paid);
   price unset.
2. **The price guarantee** as the paid tier: insurance against overpaying, priced off the
   measured overpay rate (section 9, step 5); price unset.
3. **Card-linked and affiliate revenue** on the purchases Shin steered: affiliate 1% to 15% of
   the purchase (sourced, Honey's model); card-linked fees are negotiated per campaign and no
   platform publishes a rate (searched 2026-09-06, not found); free to the person.
4. **Seller verification fees**, only after wall 4 and only if paying cannot move the face
   (section 10); amount unset.
5. **The live index** sold to the institutions that already buy monthly scanner data; amount
   unset.

## Why it is impossible for us and not for them

The loop: the chains sign when you have the users; the users come when you have the chains'
prices. A platform owner or a bank breaks it with reach it already has; a large company breaks
it with money. We go around it: every scan as a harvest for wall 1, the receipt photo for wall
2, the share card and the video for wall 3, the first ten thousand people for wall 4, corrections
as the training signal for wall 5. Each go-around is a node in the tree under its wall, and the
day a chain calls, the adapter slot is already there.

## Sources

Every "sourced" figure above, with where it was read on 2026-09-06.

- Yuka: 85 million users, 85 products scanned a second, press kit, https://yuka.io/en/press/ ;
  2024 revenue 6,349,223 euros, filed accounts via societe.com.
- Loblaw: 566 corporate, 562 franchise, 1,376 associate-owned drug stores, 2,504 total, as at
  January 3, 2026, 2025 Annual Report,
  https://dis-prod.assetful.loblaw.ca/content/dam/loblaw-companies-limited/creative-assets/loblaw-ca/investor-relations-reports/annual/2025/LCL_2025%20Annual%20Report.pdf
- Sobeys: "more than 1,600 stores in all 10 provinces", Empire Annual Information Form, June
  2026, https://www.empireco.ca/uploads/2026/06/Empire-Annual-Information-Form-2026.pdf
- Metro: "some 1,000 food stores" and "640 pharmacies", https://corpo.metro.ca/en/home.html
- Walmart Canada: 401 retail units as of July 31, 2026,
  https://corporate.walmart.com/about/international/markets/canada
- Costco: 112 warehouses in Canada at November 23, 2025, 10-Q,
  https://www.sec.gov/Archives/edgar/data/909832/000090983225000169/cost-20251123.htm
- Canadian Tire: 502 stores, 2025 Annual Information Form,
  https://s201.q4cdn.com/326551073/files/doc_financials/2025/ar/AIF-EN.pdf
- Best Buy Canada: "over 320 stores",
  https://www.bestbuy.ca/en-ca/about/about-us/blt6d2c74aaa5bd3e78
- GS1 Registry Platform: "Over 200 million GTIN records", June 2022 (the newest figure GS1 has
  published; it understates today),
  https://www.gs1.org/resources/articles/over-200-million-products-gs1-registry-platform-growth-continues
- Open Food Facts: "4 000 000+ products from 150 countries", https://world.openfoodfacts.org/discover ;
  Open Prices: "more than 200,000 prices", February 19, 2026,
  https://blog.openfoodfacts.org/en/news/open-prices-200000-prices-and-beyond
- Google Lens: "nearly 20 billion visual searches every month", October 3, 2024,
  https://blog.google/products-and-platforms/products/search/google-search-lens-october-2024-updates/
- Supermarket item count: "supermarkets carry 33,248 items in the store in 2025", FMI, United
  States, https://www.fmi.org/our-research/supermarket-facts
- Open banking scope: "(e) data pertaining to completed, pending or pre-authorized
  transactions", proposed Consumer-Driven Banking regulations, Canada Gazette, June 27, 2026,
  https://gazette.gc.ca/rp-pr/p1/2026/2026-06-27/html/reg3-eng.html ; timeline (Royal Assent
  March 2026, read access first): flinks.com, openbankingtracker.com.
- Statistics Canada: food prices "collected from nearly 500 grocery retailer outlets", May 21,
  2024, https://www150.statcan.gc.ca/n1/daily-quotidien/240521/dq240521a-eng.htm
- Smartphones: "84% relied on a smartphone for personal use in 2020", Statistics Canada,
  https://www150.statcan.gc.ca/n1/daily-quotidien/210622/dq210622b-eng.htm
- Flipp: retailers pay to be seen (vizologi.com). Honey: PayPal paid $4 billion, affiliate
  model (retaildive.com).
- Conversion rates: RevenueCat State of Subscription Apps, download-to-paid and trial-to-paid.
- Card-linked offer rates: searched Cardlytics filings and industry guides; none published.
