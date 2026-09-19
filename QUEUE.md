# Queue

**Superseded in its ordering, 2026-09-04, by him.** The gate-first sequence below (band 1's
100-item corpus and fresh-agent audit before a product exists, band 2's stand-in tests before
the floor) was written for a world where building is the expensive part. It is not: iterations
are the cheapest thing available. Read `NOW.md` for the pipeline and the order that replace it.
The falsifiers and the killed register here stay valid as evidence; the sequencing does not.

The written-down, finite queue that the master plan's first two start-of-pass invariants
require. `pages/shin-terminating-loop.html` is the plan; this file is its operational form,
and if the two disagree the plan wins and this file gets fixed.

## The two rules that govern this file

1. **Every pass ships or kills something.** A pass that does neither is a stall. One stall is a
   bad week. Three stalls in a row means the queue is wrong rather than the work, and the next
   pass is spent rewriting this file instead of working it. The counter lives in `PASS.md`.
2. **Re-entry costs a new observation, never a new opinion.** Anything below that is killed or
   parked can come back, because nothing here is permanent except the law. It comes back when
   something outside this repo changed and was written down. An argument is not an observation.
   This is the rule that makes "nothing is final" and "eventually finished" both true at once.

## The four states, and there is no fifth

| State | Means |
| --- | --- |
| `built` | Its acceptance test passed and a person checked it where its consumer meets it. |
| `killed` | Its falsifier fired. It leaves the queue and takes its expensive version with it. |
| `parked` | It left with a named condition that would promote it back. Parked is not pending. |
| `queued` | Not started. Nothing is built that is not in this list. |

There is deliberately no "in progress". Work that is unfinished at the end of a pass goes back
to `queued` with what was learned attached, which either moves it up or moves it out.

Every row below carries exactly four fields: state, acceptance test, falsifier, and the
condition that promotes it back (parked rows) or the new observation that would reopen it
(killed rows). Where the master plan already wrote an "exits when" sentence, that sentence is
the falsifier and it is carried across rather than reworded. Falsifiers written here rather
than in the plan are marked **[written here]**.

---

## Top priority, set by him 2026-09-11, ahead of every band below

His words and the starting point for each row are in `NOW.md`, top entry.

| Item | State | Acceptance test | Falsifier | Reopens / promotes on |
| --- | --- | --- | --- | --- |
| **P0 The beta build plan: code done by Sunday 2026-09-13, six-person beta on TestFlight and Play internal testing** | `queued`, top priority | Every line of the thirteen-line exit in `docs/the-beta-build-plan.md` is checked on a phone or on the Mac, never asserted: builds installed on two testers' phones, a real-store barcode answered over cellular, a real photo named by a real model, the scan row complete, consent true, rating stored, a typed price shown to the next tester, food quality and a US tech rating shown, produce never reaching the model, a description shown, the name cleared, backup restored and the invite code enforced. P1 to P3 fold in as items 13 to 18, 20, 34 and 36 of that plan. | Sunday night passes with any exit line unchecked, in which case the plan's day columns were wrong and are re-cut by lane, not stretched; or a store account is still unapproved, which stops the install lines only and nothing else. **[written here]** | Not applicable while queued. |
| **P3 Study every competitor and take the best parts** | `queued`, top priority | One written study covering every competitor class, each app with its data source, how it identifies a product, its models and its price, every claim sourced, and a named list of parts to take, each turned into a row here or rejected with a reason. | The study names nothing Shin does not already do, which would mean the search was too narrow, not that nothing exists. **[written here]** | Not applicable while queued. |

---

## Pass zero, outside the loop

Neither of these can be delegated to an agent. They are the only two items in the plan with no
agent named against them, and both are spent once: a form is refilled in minutes, but a name, a
store listing and a first video are not. Nothing in the queue below is worth starting before
these, because pass zero is what chooses the category, the caption and the name.

| Item | State | Acceptance test | Falsifier | Reopens / promotes on |
| --- | --- | --- | --- | --- |
| **0.1 Trademark search at CIPO** | `queued` | Twenty minutes at CIPO, searching plain "Shin" against Nongshim's marks in the software classes, with the result written down. It gates the store listing, the handle and the first video. | The search finds a live registration covering software classes, in which case the name changes before anything is posted. **[written here, as the negation of the plan's own gate; the two-word "Shin Ramen" is already dead on the registered SHIN RAMYUN mark, first use 1987]** | Not applicable while queued. |
| **0.2 Two-caption video test on borrowed audiences** | `queued` | Two captions run through three to five micro creators, or a forum where distribution is not follower-gated. It passes when one caption outperforms the other, because the plan's stated output of pass zero is a category, a caption and a name each chosen because something outperformed. | Neither caption travels on a borrowed audience. **[written here, as the direct negation of the plan's acceptance]** This is the cheap read on the plan's third exit, shipped and correct and nobody watches, against a base rate of 68.07% of apps never reaching a thousand downloads. | Not applicable while queued. |

A new handle is not an option for 0.2 and that is a recorded decision: fresh posts seed to
existing followers first, so a cold account can return near zero views and hand back a false
negative on the one test the whole queue is ordered behind.

---

## Band 1, the price spine, alone, no parallelism

**The band as a whole is `queued`, and its gate has not been met and cannot currently be run.**
Parts of it are built and they are split out below so that neither fact hides the other.

The honest state, in numbers that come from the spine's own output:

- The spine runs. `cd spine && npm test` passes **58 of 58 tests**, and
  `node src/cli.ts corpus` produces a report.
- The corpus holds **7 items**, not the 100 the gate requires. Those 7 are the real hand-priced
  pilot from 2026-09-03.
- Measured coverage is **28.6%**, which is 2 verdicts and 5 refusals out of 7. The pilot
  baseline is **28.6%**, which is 2 of 7. Coverage is therefore **exactly equal to the
  baseline, not above it**, and `beatsBaseline` in the scoreboard file reads `false`.
- Coverage is how often the spine answers at all. It is not correctness. **No verdict it has
  produced has ever been checked against a live source.**

That is the state, not a failure being hidden. The gate was written to need 100 items and a
fresh agent checking 20 verdicts against live sources, and neither of those has happened, so
band 1 has not passed and cannot pass yet.

| Item | State | Acceptance test | Falsifier | Reopens / promotes on |
| --- | --- | --- | --- | --- |
| **1.1 The spine and the contract** | `built` | `npm test` passes and `node src/cli.ts corpus` runs the corpus end to end without hand editing. Both do, at 32 of 32 tests. The spine returns a verdict object carrying the comparison set, the point count, the date of each point, and the category's own sentence, or it refuses. There is no third outcome. | The contract does not hold: adding a second implementation of `PriceSource` forces a change to `source.ts`. It did not. Adding the Best Buy adapter changed no interface, which is the only evidence so far that band 3's lane split can rest on this file. | Not applicable. See the note below on what `built` does and does not cover here. |
| **1.2 Fill the corpus to 100 hand-priced items** | `queued` | `spine/data/corpus.json` holds 100 items, each priced by hand from a named public source, and `gateRunnable` in the scoreboard output flips to `true`. **Hand work. This cannot be delegated to an agent**, because an agent asking a search engine for a live price is the exact method the 2026-09-03 pilot showed to be broken. | It has no separate falsifier and does not need one. It exists only to make band 1's gate runnable, so band 1's falsifier is its falsifier. | Not applicable while queued. |
| **1.3 Fresh-agent check of 20 verdicts against live sources** | `queued`, blocked on 1.2 | The master plan's own test: one hundred items run through the spine, then a fresh agent takes twenty of those verdicts and goes and checks them against live sources. The agent gets the verdicts and nothing else, no project instructions loaded. | "Killed if it cannot comfortably beat the pilot's 2 of 7, in which case the next category is tried rather than the logic patched." Carried from the plan. Note that the threshold itself is uncertain by one item until defect D-001 is settled. | Not applicable while queued. |
| **1.4 What one Best Buy or Keepa token actually buys** | `queued` | Run `spine/src/sources/bestbuy.ts` against the live endpoint with a real key. Two answers get written down: whether the base URL serves Canadian pricing, and what one token buys per lookup and per day. The source's `verified` flag flips to `true` and the result goes in the scoreboard, or the source is killed. | The token buys fewer lookups than a category needs, or the endpoint serves US pricing only, in which case tech needs a different source and this adapter is killed rather than patched. **[written here. The plan records the same thing as unestablished rather than as a gate: "whether one token of the Amazon price API buys one product lookup, which is what would turn its throughput ceiling from unknown into known"]** | Not applicable while queued. |
| **1.4b What one SoldComps request actually returns for ebay.ca** | `queued` | Run `spine/src/sources/soldcomps.ts` against the live endpoint with a real key, on the corpus's used items (the POÄNG and the Canon). Four numbers get written down for each: how many ebay.ca sold listings the 90-day window holds, how many of those are 30 days old or newer, which is the only age the used rule tiers on, what share come back in a currency other than CAD and are therefore dropped, and how many survive the parts-only and identity guards. The source's `verified` flag flips to `true` and the result goes in the scoreboard, or the source is killed. Free tier is 100 requests a month, so the run is budgeted at 10. | ebay.ca holds fewer than four sold listings inside 30 days for either item, which is what the used rule needs before a sold basis replaces an asking one, or most of what it holds is priced in USD, in which case used goods need a different sold-price feed and this adapter is killed rather than converted. Currency conversion is not a repair: a converted sale is a number nobody observed. **[written here]** | Not applicable while queued. |
| **1.5 Band 1 itself** | `queued` | 1.2, 1.3 and 1.4 all done, and the fresh agent's check comfortably beats 2 of 7. | "Killed if it cannot comfortably beat the pilot's 2 of 7." That is the plan's second exit, killed on the price before any interface exists, and it costs one pass. | Not applicable while queued. |

**What `built` does and does not cover on 1.1.** The plan's definition of built has two halves:
the acceptance test passed, and a person checked it where its consumer meets it. The first half
is done. The second is not, because the consumer of the contract is band 3's lanes and they do
not exist. Its only consumer today is the corpus harness, which is code that was written
alongside it. Treat 1.1 as built on its test and unchecked by its real consumer, and expect the
first band 3 lane to be the thing that actually tests it.

**The adapters that have never run.** `spine/src/sources/bestbuy.ts` and
`spine/src/sources/soldcomps.ts` are written and have never been executed. Their `verified`
flags are `false` and must stay false until 1.4 and 1.4b run them. This matters more than it
looks: an unverified adapter that returns nothing looks exactly like a category that has no
prices. SoldComps is the only route in the tree to a `sold` basis, which the used rule ranks
above every asking price, and the corpus today holds zero sold prices.

---

## Closed register: what is already killed or parked

| Item | State | Acceptance test it was held to | Falsifier that fired | Reopens on (new observation only) |
| --- | --- | --- | --- | --- |
| **Direct retailer page scraping** | `killed` | Fetch a retailer product page and get the price off it. | It returned a price 0 times out of 4 attempts on 2026-09-03. Loblaws, Best Buy Canada and Metro all answered 403. IKEA served its navigation menu instead of the product. | A recorded fetch showing a named retailer serving prices to an unauthenticated request, or an official feed or API that makes the question moot. Not a new argument that it ought to work. **[written here]** |
| **Deriving a cross-language name for a LOPSIDED bilingual row** | `killed on measurement, 2026-09-18` | Give a cross-language name to a row that has both language names but where one says nothing, and improve retrieval without costing ranks elsewhere. | **Built, measured, reverted the same hour.** The population is real and was counted, not guessed: **5,360 of 21,201 bilingual rows (25.3%, 5,101 of them Canadian) are lopsided** -- one name at least twice as rich as the other -- and **4 of the 15 bilingual rows whose true product never reached the shortlist in the 2026-09-16 eval are exactly this shape** (`name_en` of 'Almond', 'tropicana', 'Activia', 'Instant Coffee', each against a full French name). The gate was widened, the backfill re-run over the real catalogue, and every one of the 200 eval queries re-ranked against the live index: **0 ranks improved, 6 worsened, 1 row dropped out of the top ten.** Tightening the gate to only degenerate names (2 content tokens or fewer) moved it to 0 improved and 5 worsened. Reverted, and the database was re-backfilled and re-measured back to the exact baseline (189 of 200 in the top ten, 111 at rank one). | **A keyed eval run that records the model's reading.** Stated precisely because the kill has a KNOWN blind spot and should not be treated as settled: that harness queries with the manifest's own names, which are copied from the catalogue, so a row whose English name is impoverished is queried with that same impoverished name. **It can measure the noise this change adds and is structurally incapable of measuring the gain.** What it establishes is that the cost is real; it establishes nothing about the benefit. `captureOf` and the cascade-miss language split landed 2026-09-18 (c7dd4c3) precisely so a real run records what the model actually read -- reopen when such a run shows lopsided rows missing on words that exist only in their richer name. **An argument that it obviously helps is not that observation.** |
| **Asking a search engine for a live price** | `killed` | Return a usable multi-retailer range for an item. | The 2026-09-03 pilot got a usable range for a small minority of the seven items, and the exact count is itself disputed and logged as D-001. The same-day correction found that two of the three category failures were the method, not the market: opening a price tracker or a retailer API succeeds where search does not. Recorded as the decision "Real feed from day one, never live search". | A search-derived range reproduced against a live source and written into the scoreboard reopens it. **[written here]** |
| **Client-side retailer fetching (hidden WebView on the shopper's device)** | `killed` | Return a second retailer's price for a scanned item, from the user's device, inside the 7,000 ms photo budget, without tripping bot detection and without breaching a store guideline. | **Fails at three independent points, any one fatal.** *Store policy:* Apple 5.2.2 requires you be *"specifically permitted ... under the service's terms of use"* and that *"authorization must be provided upon request"* (read 2026-09-13) — and Loblaws, Walmart Canada and Best Buy Canada all forbid automated extraction in their terms, so there is no authorization to produce; Play's Spam policy forbids *"apps whose primary purpose is to provide a webview of a website without permission"* and uses a shopping-comparison wrapper as its own example. *Measurement:* D-049, walmart.ca challenges a residential address and holds the block past thirteen hours. *Contract:* Century 21 makes an automated agent the agent of whoever commands it, so moving execution to the phone does not move the contracting party off Shin — it only changes whose IP gets blocked, and that IP is a shopper's. | **All three together, each with new evidence.** (1) A named retailer serving prices to an unauthenticated request, or granting written permission — the existing scraping row's condition, unchanged; **a residential IP is not new evidence of it.** (2) A named shipped app that renders or extracts a third-party retailer's page and passed review, or written guidance from Apple or Google. (3) A measured fetch from a real device inside the budget. **"It runs on the phone now" is a new argument, not a new observation, and this register does not reopen on arguments.** **[written here]** |
| **Showing a shopper the prices Google's search found, for their own scan only** | `open, building 2026-09-14` | A shopper whose scan Shin's own sources cannot price sees Canadian retailer prices and reviews for that product, with Google's Search Suggestions, and a line showing where the shelf price falls inside the range they themselves set. | Not fired. | **This is NOT a reopening of the killed row above, and must not be read as one.** That row's method is to obtain a multi-retailer range and *keep* it: store it, compare against it, and serve it to other shoppers. Its reopen condition is *"a licensed source whose terms permit storing and publicly comparing prices"*, and Gemini's terms permit neither, so it stays killed exactly as written. **This row is a different method:** nothing is stored beyond the asking user's own scan row for at most two years (the terms' own chat-history carve-out), nothing is served to any other user, nothing enters the catalogue or the price database, and the arithmetic runs inside Google's own code-execution sandbox rather than on Shin's server, under the carve-out permitting resubmission *"to obtain a refined or improved Grounded Result to display to the end user"*. It dies if any one of those four stops being true. See the decision "Gemini for identification, and grounded prices display-only". **Falsifiers that would kill it:** Google answering work-list item 6 in a way Shin's layout cannot satisfy; a legal review rejecting the per-user display reading; or a measured grounded answer whose prices are wrong often enough that showing them is worse than showing nothing. **[written here]** |
| **Produce as a v1 category** | `parked` | Would have been a verdict sentence for produce like the other four categories. | Three problems stack and none is solved by a better feed. A PLU names a category rather than a product, 4011 has meant bananas since 1990. Package formats break unit comparison. The public series measures underlying inflation rather than what is on the shelf this week. `spine/src/categories.ts` refuses the whole category with `category_unsupported` and the thresholds are recorded for the day it is promoted. | Quoted from `spine/src/categories.ts`: *"Crowdsourced shelf-price volume in one city reaching the point where a produce item has two independent reports more often than not. That is band 2.3, and produce is the first thing promoted if it survives."* |

---

## Band 2, the cheap versions of the twelve hard features

Information, not surface. Days each. Each row answers the same question as a much more
expensive row in band 5, and a row that dies here deletes its band 5 version outright rather
than deferring it. The "exits when" text is the plan's own and is carried unchanged.

| Item | State | Acceptance test | Falsifier | Reopens / promotes on |
| --- | --- | --- | --- | --- |
| **2.1 Barcode, then three thumbnails** | `queued` | Stands in for live camera recognition, which measures 77.0% top-1 and 94.5% top-5. It passes when barcode plus a three-thumbnail pick resolves items on real shelves. | Killed if more than one scan in five needs correcting on real shelves. | Not applicable while queued. |
| **2.2 Collect corrections, apply none** | `queued` | Stands in for corrections that train the next scan. Corrections are stored and reviewed by hand; nothing feeds back. | Killed if a hand review of the first two hundred finds most useless or adversarial. | Not applicable while queued. |
| **2.3 Reports stored, shown only to the reporter** | `queued` | Stands in for a corrected price reused for that store. | Killed if two independent reports on one shelf disagree more often than they agree. | Not applicable while queued. This row also holds produce's promoting condition. |
| **2.4 Daily check, five free watches, threshold from the item's own low** | `queued` | Stands in for continuous price watching, the recurring cost that scales with saves rather than users. | Killed if distinct products over total scans stays near one, meaning caching saves nothing. | Not applicable while queued. |
| **2.5 Recheck alternatives on open, not on a schedule** | `queued` | Stands in for telling users when something appears cheaper elsewhere. | Killed if a month of watched items produces almost no cross-retailer wins. | Not applicable while queued. |
| **2.6 "Cheaper per 100 grams", never "tastes the same"** | `queued` | Stands in for alternatives, and for the product liability that arrives with a taste claim once allergens differ. | Killed if people tap alternatives and buy nothing. | Not applicable while queued. |
| **2.7 One item a day, chosen by hand** | `queued` | Stands in for a feed of price drops on things like what you scan. | Killed if the hand-picked item gets no taps, since no recommender rescues that. | Not applicable while queued. |
| **2.8 Caption a verdict with the public national series** | `parked` | Stands in for "back in season", which otherwise needs a year of regional baselines. | The plan writes no falsifier for this row. It writes a park instead. | "Parked while produce stays a small share of scans." Carried from the plan. Produce is unserved today, so this row cannot move before 2.3 does. |
| **2.9 "You checked 47 things, Shin told you to walk away from 12"** | `queued` | Stands in for a monthly savings figure, which is a performance claim needing adequate and proper testing before publication under Competition Act s.74.01(1)(b). The counting version makes no claim and needs no test. | The plan writes: "Never killed. The claim version stays unavailable until the number is tested." **This row has no falsifier, which start-of-pass invariant (ii) says every row must have. Flagged, not resolved.** | Not applicable. The claim version sits in band 5 and is promoted only by a measured number. |
| **2.10 Data rights written into the terms on day one** | `queued`, then parked on completion | Stands in for selling aggregate pricing intelligence. An afternoon of work on the terms. | The plan writes no falsifier here either. It writes: "An afternoon, then parked until one city has real coverage." | One city with real coverage. Carried from the plan. |
| **2.11 Show every number on the tag, let the user tap the price** | `queued` | Stands in for shelf-tag reading and its per-retailer layout problem. | Killed if users abandon the tap step. | Not applicable while queued. |
| **2.12 One voice, set by the winning caption** | `queued` | Stands in for letting users pick Shin's attitude, which triples every string in the product forever. One voice ships; the setting does not. | The plan writes: "Reopened only by reviews asking for a gentler Shin." **That is a promoting condition for the band 5 attitude setting, not a falsifier for shipping one voice.** Flagged, not resolved. | Reviews asking for a gentler Shin. That promotes the setting in 5.6, not this row. |

**Ordering note, flagged for the founder and not acted on.** The plan runs band 2 before band 3,
and band 2 comes before band 3 here too. But most of these falsifiers need something band 3
ships: real shelves for 2.1, two hundred collected corrections for 2.2, two independent reports
on one shelf for 2.3, a scan-to-distinct-product ratio for 2.4, a month of watched items for
2.5, taps for 2.6, 2.7 and 2.11. Those rows cannot be run before the floor exists no matter
where they sit in the list. 2.9, 2.10 and 2.12 can run now. This is a real ordering conflict in
the plan and it needs a founder call, not a quiet reordering here.

---

## Band 3, the shippable floor, five lanes in parallel once band 1 has fixed the contract

The plan's caption says four lanes and its table lists five. The five are below. Lane 3.5 is
not a coding lane, which is the likeliest reason the caption says four, but that is a guess and
the caption is worth correcting in the plan rather than here.

**The whole band's falsifier is the eight-pass cap:** if band 3 has not shipped in eight
passes, the floor was too big and gets cut rather than extended. The plan labels that number a
judgment rather than a benchmark, and shows its reasoning: unshipped time is the most expensive
thing in the plan, since 68.07% of apps never reach a thousand downloads, 0.57% of non-gaming
apps ever earn a hundred thousand dollars, and none of that improves while you build.

The plan gives each lane a consumer-side check but no per-lane falsifier. Those are written in
step 2 of the pass that takes the lane, by the conductor, before any code. They are not
invented here.

| Lane | State | Acceptance test (the plan's consumer-side check) | Falsifier | Reopens / promotes on |
| --- | --- | --- | --- | --- |
| **3.1 Identity** | `queued` | Twenty items scanned off real shelves. The pilot's worst failure was identity: a used camera search returned a newer model bundled with lenses at nearly triple, presented as the answer. | To be written in step 2, before any code. The band-level eight-pass cap applies. | Not applicable while queued. |
| **3.2 Verdict surface** | `queued` | A stranger reads a screenshot cold and says out loud what the app told the person. Grocery gets two lines, regular against this week's promotion, because one box of pasta swung 3.6 times in a week. | To be written in step 2, before any code. | Not applicable while queued. |
| **3.3 Shell** | `queued` | A save made on day one fires a correct notification days later on a device that was closed in between. | To be written in step 2, before any code. | Not applicable while queued. |
| **3.4 Scoreboard** | `queued` | It produces a number for a week in which nobody looked at it. Ships every verdict logged with its comparison set, the weekly sampling job, and three day-one metrics: scans per user per week split by whether a purchase followed, watch rate, and distinct products over total scans. | To be written in step 2, before any code. | Not applicable while queued. |
| **3.5 Shin himself** | `queued` | Recognisable in a friend's screenshot by someone who has not installed it. Three faces and the share card. Not a coding lane: this goes to a person or a design tool, and it is the most repeated asset in the product. | To be written in step 2, before any code. | Not applicable while queued. |

---

## Band 4, gated on the floor shipping

Ordered by the scoreboard rather than by taste. Every row here is parked, because the gate is
the same for all of them and it has not happened.

| Group | State | Acceptance test | Falsifier | Promotes back on |
| --- | --- | --- | --- | --- |
| **4.1 The 37 easy rows** | `parked` | Each is a week or less: setup questions, introduction variants, scan entry paths, verdict presentation variants, disagreement paths, list saving, offer drafting, paywall shapes, home screen shapes, streak nudges. Each gets its own acceptance test when it is pulled, not before. | None written, per row or per group. Each row gets one in step 2 of the pass that pulls it. | "Nothing gates these individually. They are a week or less each and get pulled when the scoreboard says the surface they sit on matters." Carried from the plan. |
| **4.2 The middle nineteen** | `parked` | Unit price display, calibrated confidence gating, link pasting, the share sheet extension, last-screenshot detection, resale maths, price match scripts, affiliate and affiliate-on-the-watch, fake reporting, showing the comparison set, send-to-a-friend, the daily pick, Shin was right, Shin's voice, free-text questions, before-and-after shares, the reseller tier. | None written. Each gets one in step 2 when it is pulled. | "Each takes more than a week for a named reason." Two are already inside band 3 because the floor needs them: the regular and promotional split, and storing the comparison set behind every verdict, which is cheap on day one and expensive to retrofit. Both of those are already in the contract. |
| **4.3 More categories** | `parked` | The other three of the four that work. New tech leads on cost of data: an official retailer API, a free Amazon.ca tracker, and one comparison service already covering 32 Canadian retailers. | None written. The category-level falsifier is band 1's, applied again per category: it must comfortably beat 2 of 7. | "The first category retaining users. Not before." Carried from the plan. |

---

## Band 5, the full versions of the hard twelve

Each is gated on its own band 2 result. A band 2 row that dies deletes its band 5 row from the
queue outright rather than deferring it, which is how eleven of the twelve hard features get
settled for days of work each. Every row here is parked.

| Item | State | Acceptance test | Falsifier | Promotes back on ("only entered if") |
| --- | --- | --- | --- | --- |
| **5.1 Continuous watching at scale** | `parked` | Watching that scales with saved items times retailers times check frequency. Cost, derived from the feed's published $0.75 per thousand rows and three stated assumptions: about $675 a month at a thousand users, arriving before revenue. | Band 2.4's falsifier firing deletes this row. Carried from the plan's termination argument. | Band 2.4 survived and the distinct-product ratio is favourable. |
| **5.2 The trusted reported-price layer** | `parked` | Expiry rules, conflict resolution, store-level identity, and defence against reports that suit the reporter. The one asset no competitor can buy, which is exactly why it is the most work. | Band 2.2 or 2.3 dying deletes this row. | Bands 2.2 and 2.3 both survived, and reports agree more than they disagree. |
| **5.3 Cheaper at a store near you** | `parked` | Less work than assumed. Store-level grocery feeds resolve the nearest store from a postal code and return normalised unit prices; a weekly panel covers 50 basket items across 22 banners and roughly 160 stores. Open only for arbitrary products across all retailers. | None written in the plan. | The floor retains users in one city. |
| **5.4 The rendered vertical clip** | `parked` | A template and a queue. Rendering runs $0.20 to $0.30 a minute, or a cent per render above a $100 monthly floor. A fifteen second card is cents. | None written in the plan. | The still card is being shared at all. |
| **5.5 Live camera recognition** | `parked` | The one obstacle money cannot move. Never one guess on screen, always a correctable name, because the gap between 77% and 94.5% is the whole design. | Band 2.1's falsifier firing deletes this row: more than one scan in five needing correction on real shelves. | Band 2.1 showed people tolerate correcting it. |
| **5.6 The feed, the savings claim, brand data, seasonality, the attitude setting** | `parked` | Five separate things, each entered by its own condition. Two of them are not engineering: the savings claim needs measurement before publication, and brand data is a business question. | None written in the plan. The savings claim additionally cannot be published without adequate and proper testing under Competition Act s.74.01(1)(b), which is law and not a falsifier. | Each by its own condition above. None before the floor retains. The attitude setting is promoted by reviews asking for a gentler Shin. |

---

## Never in the loop, at any pass

These are not queue items and they never become queue items. They are listed so that no pass
tries to schedule one.

- **The video test.** It needs a real audience. The captions can be drafted; the watching
  cannot be arranged.
- **The store submission.** Spent once, and the founder's. Everything up to the button is the
  system's to prepare, listing copy and assets included.
- **Twenty verdicts checked against a real shelf.** One trip, one hour, and the only check here
  that cannot be faked by something that wants to report success. This is a different check
  from item 1.3, which is a fresh agent against live sources rather than a person in a store.
  Both exist and neither substitutes for the other.
- **The name.** Trademark exposure is carried, not searched. Item 0.1 is the search; the
  decision to live with the answer is not delegatable.
