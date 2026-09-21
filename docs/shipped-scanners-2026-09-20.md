# What the shipped scanners do, read from outside

## What this is, and what it is not

`docs/competitor-scanners-2026-09-19.md` read TEN OPEN SOURCE REPOS in source and found 278
mechanisms; twenty-two were chosen and built in `553218e`. That survey is about how a scanner is
engineered. It has no overlap with this file and nothing here repeats it.

This file reads the OTHER kind of competitor: the apps a Canadian shopper actually has on their
phone. None of them is open source, so none of them can be read in source, and every claim here
therefore comes from a published source with a link, never from code. Where two sources disagree
the disagreement is written down rather than resolved.

Judged against the same six objectives the build order uses, and nothing else: cheap, accurate,
instant, effortless, unsurprising, always answering. Plus the one thing the build order does not
cover, because a scanner's source code cannot show it: **what makes a person scan a second time.**

Nothing here is a decision. Section 6 is a list of candidates for Aurik to order.

---

## 1. The headline: Shin's verdict has no Canadian action attached to it

**What they do.** Price matching is the Canadian grocery behaviour, and Flipp is built on it.
Flipp is a flyer aggregator whose stated job is price matching at the till, it covers Loblaws,
Metro, No Frills, Sobeys and FreshCo, it is free, it makes its money on advertising, and the
company's own user research claims active users save $46 to $49 a week. Reebee is the same shape
with Walmart, Giant Tiger, Superstore, Sobeys, No Frills, Costco and Super C, with a grocery list
and price matching built in.

**The policy detail, which is the part that makes this buildable.** It is not uniform, and the
shape of the rule is exactly the shape of an answer Shin could give:

| Retailer | Matches a competitor? | The constraint |
| --- | --- | --- |
| No Frills | yes | four price-matched items per transaction, ad shown at the till in print OR digital form, same brand, size and weight, competitor must be in the same trade area |
| Real Canadian Superstore | yes | approved competitors, four unit limit |
| Maxi | yes | Quebec, identical items |
| FreshCo | yes | beats the competitor by one cent, within 14 days |
| Giant Tiger | yes | matches a local competitor by one cent |
| Best Buy | yes | within 30 days of purchase |
| **Walmart Canada** | **no** | ended competitor matching; still matches its own walmart.ca |
| Metro, Food Basics, Sobeys, Costco, Amazon | no | no competitor match policy |

Sources disagree on one point and it is not settled here: moneyGenius describes No Frills as
matching "within 7 days of purchase", Wealth Awesome describes the four-item at-the-till rule and
mentions no refund window. Both agree on four items and on digital-or-print proof. One source
dates Walmart Canada's exit to 2020; the other states the exit with no date.

**What Shin does today.** Nothing. `grep` for "price match" across `app/`, `docs/`, `NOW.md` and
`QUEUE.md` returns exactly one hit: "price match scripts" inside QUEUE 4.2, "the middle nineteen",
`parked`, with no write-up of its own. The verdict tiers end at walk away.

**Why this is the strongest thing in this file.** Three separate rules in this repo point at it
and none of them was written with this in mind:

- `USAGE.md`: "Every outcome, including a refusal, hands back exactly one thing to do." Walk away
  is a judgment, not a thing to do. "Show this at the till here, you can match up to four" is.
- `GAMIFICATION.md` section 0: a Shin mechanic "has to pay for something a second party can
  confirm, and the pool of confirmable behaviours is far smaller than Duolingo's". A price match
  is confirmed by a cashier and printed on a receipt. It may be the largest confirmable behaviour
  the product has access to.
- `CLAUDE.md` hard rule 3: "The aggression points at the price, the store, or the brand. Never at
  the user." A price match points the user at the store with the store's own policy in hand.

**What it would cost.** The cheaper offer and its seller are already in the answer Gemini returns.
The missing piece is a table of which banner matches whom under what limit, which is policy text
and not a price, so rule 3 ("the price should not come from us") does not reach it. The hard part
is knowing which store the person is standing in, and location permission is already asked for on
the permissions step.

**Needs a call from Jamin,** because it adds a line to the verdict and the verdict is his.

Sources: [Flipp vs other flyer apps](https://masemaine.ca/en/blog/flipp-vs-grocery-flyer-apps-canada),
[reebee on Google Play](https://play.google.com/store/apps/details?id=com.reebee.reebee),
[moneyGenius price match policies](https://moneygenius.ca/blog/canadian-price-match-policies),
[Wealth Awesome, No Frills](https://wealthawesome.com/no-frills-price-match-policy),
[money.ca](https://money.ca/managing-money/budgeting/stores-where-you-can-price-match-in-canada)

---

## 2. Yuka is the growth model this repo already cites, and the citation is about scale, not mechanism

`docs/the-moonshot.md` and `docs/the-vision.md` cite Yuka for its numbers. `docs/decisions.md`
cites it twice for strategy: "Yuka reached 80M users by threatening brands, not by being right",
and "Yuka's real asset is the score people screenshot, not the scan". Both are correct and neither
is a mechanism. Read from outside, four mechanisms are visible.

**a. The answer requires no reading.** A score out of 100 plus one of four colour-coded words:
Bad (0 to 24), Poor (25 to 49), Good (50 to 74), Excellent (75 to 100). The detail sheet exists
but is a second screen you choose. Reviewers describe the interface as not requiring you to read
anything, because the colour and the number are immediate.

Shin's own `DESIGN.md` Law 2 already says hue for the judgment and fill for the confidence, which
is the same idea. Whether the running answer sheet honours it is **unverified here**: the verdict
sheet cannot be reached on this machine without a Gemini key, so it was not measured. That is a
check to run, not a finding.

**b. Alternatives are the return loop, not a feature.** When a product scores badly the app
independently recommends genuinely similar better-scoring items, and reviewers report finding
things they would not have considered, sometimes cheaper. Shin has this: `alternativesBlock` in
`camera.js:1275` renders Gemini's own alternatives, and Jamin's walkthrough ruling keeps
alternatives in scope. `/api/alternatives` and the catalogue-side fill were deleted on 09-19,
correctly, because rule 3 forbids Shin's own data being the source. So the mechanism is present
and sourced from the right place. What is not established is whether it is good, because it has
never been seen with a real answer behind it.

**c. An unknown product is an invitation, not a dead end.** Scan something Yuka does not have and
it prompts you to fill in the product; the team analyses it and it enters the database with a
rating. Shin's equivalent is the gap table, which records a miss silently and asks the person for
nothing. Shin never says "unknown" (priority 1 forbids it), but a scan it could not confidently
name is exactly the moment a person knows the answer and Shin does not.

**d. The growth was entirely organic and entirely video.** No paid marketing, ever. It went viral
in the US off one consumer's TikTok, user-made TikToks reached 7 to 8 million views unpaid, US
expansion ran at about 25,000 new users a day, and the company reached profitability without
spending on traditional marketing. A 2024 US impact study claims 85% of users changed purchasing
habits and 94% stopped buying products flagged for dangerous additives.

`CLAUDE.md` already names short-form video as the objective function. This is the evidence that
the objective function is the right one, and it locates the asset precisely: the thing people
filmed was a screen with a number and a colour on it that fit in a phone frame and needed no
narration. That is a design constraint on the answer sheet, and it is testable: can the verdict
be read from a screenshot with the sound off.

Sources: [Wallet & Wellness review](https://www.walletandwellness.com/blog/yuka-app-review),
[Yuka help, unknown products](https://help.yuka.io/l/en/article/cigfcr86v0-add-unknown-product),
[Yuka help, offline mode](https://help.yuka.io/l/en/article/uppz9huie0-how-activate-the-offline-mode),
[US Chamber interview with the founder](https://www.uschamber.com/co/good-company/the-leap/yuka-app-organic-growth),
[Marketer Gems on the growth](https://www.marketergems.com/p/yuka-app-viral-marketing-strategy),
[WWD](https://wwd.com/beauty-industry-news/beauty-features/yuka-app-food-beauty-viral-app-ingredients-clean-1236907300/)

---

## 3. ShopSavvy is the direct functional competitor, and it answers a question Shin does not

ShopSavvy scans UPC, EAN, ISBN and QR and compares prices across retailers, free, unlimited scans.
Four things it ships that Shin does not:

- **Price history**, and advice on when to buy. Shin stores every scan but shows no history of a
  price over time.
- **Price drop alerts** on a watchlist. Shin has a Saved screen; `grep` for "alert" or "notif" in
  `screens/watchlist.js` returns nothing. A watchlist that does not tell you anything is a list.
- **Price match assistance** using the store's own policy. The same finding as section 1, arrived
  at from a different direction, which is worth noting: the one American competitor in this list
  already treats the store's policy as part of the answer.
- **A browser extension** that compares while shopping online. `CLAUDE.md` records Jamin's ruling
  that there is no browser product, so this one is closed and is listed only for completeness.

The recurring complaint in its reviews is ad load slowing the app down. Shin's plan is a paid tier
rather than ads, so that is a differentiator that already exists and costs nothing to keep.

Sources: [ShopSavvy barcode scanner](https://shopsavvy.com/features/barcode-scanner),
[ShopSavvy app page](https://shopsavvy.com/app),
[Google Play listing](https://play.google.com/store/apps/details?id=com.biggu.shopsavvy&hl=en_GB)

---

## 4. The competitor that matters most is free, installed, and not an app

Google Lens now does product insights, price comparison and local inventory for a photo taken in a
physical store: point at a product at Target, get reviews, similar items in stock at that location,
and whether it is cheaper at Amazon or Walmart. It launched against beauty, toys and electronics,
limited to stores that share local inventory with Google.

This is the honest competitive picture and it should be written down rather than worked around.
Lens is preinstalled, free, has no scan cap, and does the identify-then-price job with the same
vendor's model Shin calls. Shin's answer to it cannot be "we also identify and price", because
that is the part Lens does for nothing.

What Lens does not do is give a verdict. It returns a list of prices and leaves the judgment to
the shopper, which is precisely the problem statement this repo adopted verbatim: "Sellers know
what things are worth and buyers are guessing". Lens hands you more numbers to guess with. Yuka's
lesson in section 2 is that the score is the asset, not the data behind it.

That is not a new strategy, it is the existing one, but it is now the answer to a specific named
threat, and the threat is growing. Two things follow and both are testable: the verdict has to be
faster to read than a list of prices, and the verdict has to survive being screenshotted alone.

Sources: [Google Lens in-store price and inventory](https://finance.yahoo.com/news/google-lens-now-check-prices-140000319.html),
[TechCrunch](https://www.techcrunch.com/2024/11/19/google-lens-new-feature-makes-it-easier-to-shop-products-in-store),
[DataFeedWatch on the shopping features](https://www.datafeedwatch.com/blog/new-google-lens-shopping-features)

---

## 5. Speed, and the one number nobody here has

Yuka's recognition is described as about a second, and reviewers describe scan to score in under
three seconds. It achieves that partly by cheating in a way Shin cannot copy: offline mode
downloads the product database to the phone, without photos, because the database is large.
Shin's rule 1 puts a live grounded Gemini call on the critical path of every scan that is not a
cache hit, so a local database is not available to it and should not be chased.

**Shin's own scan-to-answer time has never been measured.** It is not in `SCOREBOARD.md`, whose
only columns are coverage and verdict counts, and it could not be measured on this machine, which
has no Gemini key. Per-stage timings were added to the model call in `553218e`, so the
instrumentation now exists and the number is one keyed run away.

Three seconds is the bar the category has set. Whether Shin clears it is unknown, and "instant" is
one of the six objectives the whole build order is justified against, so this is the cheapest
missing measurement in the repo.

Sources: [Scandit case study on Yuka](https://www.scandit.com/resources/case-studies/yuka/),
[Yuka help, offline mode](https://help.yuka.io/l/en/article/uppz9huie0-how-activate-the-offline-mode)

---

## 6. Candidates, unordered, for Aurik to rank

Deliberately not ranked, and deliberately not started. Each says who has to decide it.

| # | Candidate | Decides |
| --- | --- | --- |
| A | Price match as the action on a walk-away verdict: which banner matches whom, under what limit, shown at the till | Jamin, it changes the verdict |
| B | Measure scan to answer against the category's three seconds, using the per-stage timings `553218e` added, and put the column in `SCOREBOARD.md` | nobody, it is a measurement, but it needs a Gemini key |
| C | The screenshot test: can the verdict be read alone, in a phone frame, with no sound. This is the growth channel's actual requirement | Aurik, it is design |
| D | Price history behind a scan, and what a watchlist is for if it never speaks | Jamin, alerts are a product surface |
| E | Turn a scan Shin could not confidently name into an invitation to tell it, the way Yuka turns a database miss into a contribution | Jamin, it touches identity |
| F | Write Google Lens into the strategy docs as the named competitor, replacing the current framing where the competitors are other apps | Aurik |

## What was checked, and what was not

Checked: every claim above carries a public source, and the Shin-side claims were checked in the
tree (`grep` for price match, for alert in the watchlist screen, `alternativesBlock` at
`camera.js:1275`, the QUEUE 4.2 parking, the `/api/alternatives` deletion in `2d748c1`).

Not checked, and not to be repeated as fact: the verdict sheet was never seen with a real answer
behind it, because there is no Gemini key on this machine. Everything in sections 2a, 4 and 5
about how Shin's answer reads or how long it takes is a question, not a finding.
