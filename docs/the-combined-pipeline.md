# The pipeline, combined

Written 2026-09-05 on his instruction: take OLMA's pipeline as the base, put the barcode and the
catalogue in front of it, drop the accuracy-first posture, and describe the whole thing.

His correction, which governs every line below:

> *"You also created your own rules and said that accuracy is the most important thing. When in
> reality, its not and it impeeds so much of our design. I believe almost everything olma did is
> correct except they didn't integrate our barcode and cateloge system."*

This file supersedes `docs/pipeline-decisions-and-plan.md` wherever the two disagree. That file
stays as the record of what was decided and why, including the parts now reversed.

---

## 0. What was counted before anything was changed

Fifty-four decisions in the old plan. **Twenty-one of them refuse to show the user something.**
Of those twenty-one, **none carry his words.** One, never showing an average, is marked in the
file itself as a reversal of a line he had given.

The premise underneath all twenty-one is a sentence in `docs/design/brief-usage-and-avatar.md`
that reads "this product's only value is being trusted about a number." It sits outside his
quotes. A session wrote it while summarising him.

One thing that is his and was filed in three separate places as three unsolved problems:

> *"If users find good prices, can they gain more scans per month or join a leaderboard, or enter
> a draw etc."*

That single line is the answer to the meter problem, the incentive for price harvesting, and the
seed of the price corpus. It is one mechanism, not three.

---

## 1. The rule that replaced the refusals

**Always answer. The confidence carries the doubt.**

Not a slogan. A concrete swap, already in the code: `price/src/verdict.ts` used to return a null
verdict whenever fewer than two sellers had been found, with a sentence explaining why it would
not say. It now returns a verdict from one seller and a `confidence` between zero and one, with a
`confidenceBasis` list in plain words ("one seller", "the newest price is over three weeks old",
"only sale prices to compare against", "one seller matched by name, not barcode").

The only two cases left with no verdict are arithmetic, not judgement: nothing to compare
against, and nothing to compare.

**Both judges now follow the rule, not just the new one.** `spine/src/spine.ts` is the older
pipeline and it is the one `app/server.ts` actually serves today, so its thresholds were the ones
a real user hit. Four of them are gone: the newest price being outside the category window, too
few current prices, too few prices at all, and too few distinct sellers, plus the check that
refused when a comparison set disagreed with itself. Each is now a named shortfall on a low
confidence band ("1 price where groceries usually needs 2"), and the category minimums still
exist to separate a low band from a high one. What still refuses there: no usable price at all,
and no price on the thing in front of the shopper. Neither is a threshold.

**Removing every threshold moved coverage by zero, and that is the finding.** The pilot corpus
scored 2 of 7 before and 2 of 7 after (`node --experimental-strip-types src/cli.ts corpus`,
2026-09-05). Every one of the five refusals is an empty hand rather than a threshold: the only
Tide price is the shopper's own store so excluding it leaves nothing; the only headphone price is
a manufacturer list price; the Canon has no usable points and a 0.55 identity; produce is a
declined category; the new POANG returned no prices at all. **Thresholds were never what capped
this. Supply is.** So the crawl and harvest lanes are worth more than this deletion was, and no
further relaxing of rules will buy a point of coverage.

**A bug the deletion exposed.** The seller gate counted sellers after normalising, and the
confidence sentence beside it counted raw strings. While the gate stood in front, a five-spelling
Best Buy set was rejected before confidence was ever computed. With the gate gone that set became
a cheerful "3 sellers" on screen. `confidenceOf` now normalises too. Removing a check can promote
the thing behind it from dead code to the user's only number.

---

## 2. The pipeline, stage by stage

### Stage A. The viewfinder does nothing

No live detection, no box tracking the object, no name appearing as you aim. OLMA does nothing
here either and it is right: everything before the shutter is battery and heat spent on a frame
the user is about to replace.

One exception, and it is the whole reason our version is different. **A barcode read runs on
every preview frame, locally, for free.** It is not a model, it costs nothing, and when it hits,
identification is over before the shutter is pressed. Nearly every packaged grocery item carries
one. This is the single thing OLMA does not have and it is what turns their three photo searches
a month into an unlimited free tier.

### Stage B. The shutter, and the honest trade

One full photo, uncropped. Also captured at the same instant, on the phone, in about a tenth of a
second and for nothing:

- every barcode in the frame
- every string of text, with its box and its size on screen
- a crop of the salient object

The upload is the crop, the full frame at low resolution, and the text strings. Sending the text
costs nothing and saves the server from redoing the cheapest useful thing.

### Stage C. The price sheet, and what runs behind it

A keypad, a Skip button, and an automatic price read that is allowed to fail. OLMA's version
spun for its whole life and never returned; ours attempts the shelf tag from the text already
extracted and falls back to the keypad without ceremony.

**Identification runs here, behind the sheet.** OLMA does this and it is the best thing in their
build: by the time the user taps Analyze, the product name is already on the next screen. The
user's typing is the latency budget. Nothing is wasted.

Order of attempts, cheapest first:

1. **Barcode.** Exact. Done. Free, unmetered, no model, no server.
2. **Catalogue.** Text from the photo into the hybrid index. Keyword and vector search fused by
   rank position. Free, unmetered. Size and shape as measured 2026-09-05, after his reload:
   **5,182,591 products, 3.6 GB**, of which icecat 4,972,252, openfoodfacts 122,154,
   openbeautyfacts 48,943, openproductsfacts 26,948, openpetfoodfacts 12,294. Canadian rows
   carrying a brand: 618,364, being icecat 494,513 and grocery 76,965. The `sold_in_canada` flag
   has not been recomputed for the newly loaded rows.
3. **Model read plus catalogue.** A vision model turns the crop into fields (brand, product line,
   variant, size, unit, category) and those fields query the catalogue. This is the metered
   photo search.
4. **Online search.** Paid tier only, and only when the catalogue misses. Not a second opinion on
   a hit.

**The half-built half of that index, measured 2026-09-05 and worth knowing before trusting it.**
The full text index covers all 5,182,591 rows. **The vector index covers 437,574.** Broken down:
every one of the 122,154 grocery rows has a vector, as do all the beauty, products and pet food
rows, but only 230,947 of 4,972,252 electronics rows do, which is 4.6%.

So the semantic half of retrieval is complete for grocery and effectively absent for electronics.
A photo of a laptop cable is matched on keywords alone. That is a real gap and it should be
stated rather than papered over, but it is not the gap it first looks like: grocery, which is the
lead category, is fully served.

Checked rather than assumed: 4.97 million electronics rows do NOT drown grocery text queries.
"orange juice", "peanut butter" and "milk chocolate" all return grocery rows in the top five,
because the ranking favours short exact names over long electronics part descriptions. No source
filter is needed for correctness on the text path.

### Stage D. Verification, which is the step everybody skips

Take the winning catalogue row's own product image and the user's crop, show a vision model both,
and ask one question: same product, and if not, what differs.

This is almost certainly what OLMA's "Verifying results" step is. It turns a ranking into a
decision. Without it we ship a sorted list wearing the costume of an answer.

If it says no, we do not fall back to the second-ranked row. The second row is usually a near
duplicate of the first and fails the same way. We show the top candidate with a "not this?"
affordance and let the user correct it, which is free and does not count against the meter.

### Stage E. The three named steps

One connection held open, one event per stage. The client draws each payload as it lands.

OLMA's step names, adapted: identify, then price, then verify. The name appears the moment it is
known, which is roughly nine seconds before the price. That early reveal buys the entire wait,
and it is why the wait is tolerable at all.

One thing measured in their frames and not copied: their name appeared while the step under it
still said it was identifying. Our steps report real events.

### Stage F. The verdict

The yardstick is a **national typical range**, computed from stored observations over a recency
window, never an average, promotions kept separate. This is a database query, not a search, and
it answers in milliseconds.

The confidence is computed from seller count, age, and whether the join was by barcode or by
name.

A written sentence arrives from the model a moment later and replaces the fast local one. OLMA
does exactly this, and the frames show the swap happening inside a single quarter second. It is
right, with one fix: **the saved record and the screen must read from the same object.** OLMA's
does not, which is why their list badge said "Fair Price" over the same scan their detail screen
called "Outrageous", and still said it thirty seconds later.

### Stage G. The late arrivals

Comparable retailer rows and cheaper options land after the verdict and never hold it up. Served
from our own corpus immediately, with a live refresh replacing them if it returns in time.

OLMA has only the live half, which is why their evidence panel spun for eight seconds, found
nothing, and was still spinning when the user walked away.

Cheaper options now always look. When both products have a size, the comparison is per 100 g or
100 ml. When either does not, and 82% of the catalogue has no recorded size, it compares the
ticket price and says "Sizes may differ" in its own sentence. The old version returned nothing
for four products in five.

---

## 3. The tiers

His design, unchanged in shape:

| | Free | Paid |
| --- | --- | --- |
| Barcode | unlimited | unlimited |
| Catalogue search | unlimited | unlimited |
| Photo search | three a week | unlimited |
| Online search on a catalogue miss | no | yes |
| Priority | no | yes |

A search counts only when it produced an identification the user accepted. Our own failures are
free.

**The meter problem, and his own answer to it.** Barcodes are free and nearly every packaged
grocery item has one, so if grocery leads, almost nobody reaches three photo searches a week and
the paid tier only ever fires on produce, secondhand goods and furniture, which are the
categories identification is worst at. His line about earning scans by reporting good prices
resolves it: the meter stops being a wall and becomes a currency, and the thing it pays for is
the price observations that build the corpus.

Not decided, and his: whether reporting a price earns a scan, a leaderboard place, or a draw
entry.

---

## 4. The price corpus, which is the actual product

Nothing above works without stored price observations. What is now known, measured today rather
than assumed:

**Walmart Canada is readable.** Search and product pages both embed their own JSON. About 800 ms
a page, no key, no auth. Search by UPC returns zero, so the join costs two requests: text search
for candidates, then the product page, which is the only place the barcode appears. The Kraft 1
kg jar reads $5.97, 30 cents per 100 g, UPC 068100084245, which zero padded is exactly our
catalogue's code.

**What one seller actually covers, measured on 60 Canadian grocery products.** 35% came back
with a usable price: 11.7% joined by barcode, 23.3% by brand and name. Zero throttled and zero
errors across the whole run, so the header fix holds at scale. **The dominant failure is not
supply, it is the join: 65% found candidates and could not confirm one was the same product.**
Five of those were opened by hand: one catalogue row is junk, one query was French and matched a
CD player, one was a genuine near miss on pasta shape, and two were competitors' private labels
Walmart will never stock. So the 65% is part join defect and part the private-label ceiling,
which means it is partly fixable and partly a fact about retail.

**The full crawl is 15.7 days, not seven.** Timed, not estimated: 17 min 40 s for 60 products at
one worker, which is 17.7 s each, because every unmatched product scans four candidate detail
pages before giving up. 76,965 grocery rows works out to about 15.7 days of continuous crawling.
The lever is the 65%, not the pacing.

**The 7.5 kB stub, and it was our bug, not their defence.** For most of a session the crawler got
a 7,535 byte stub instead of the 350 to 700 kB page. It was diagnosed twice as bot defence, once
as PerimeterX rate limiting and once as intermittent throttling, and both were wrong. The cause:
**sending `accept-language` and `accept` together makes the site serve the stub, three times out
of three with controls either side. Either header alone is fine.** `price/src/walmart.ts` carries
a comment saying not to add the header back.

Two things hid it, and both are worth remembering for the next adapter. A stub leaves the next
request or two also likely to stub, so an A/B test without a control between every case looks
random. And a background crawl was hitting the same host throughout, so every probe was
contending with a forgotten process.

The retry and backoff written during the wrong diagnosis is kept, because a real throttle is
still possible and the important property is the one it enforces: a throttled row is recorded as
unknown, never as a zero, and never enters the denominator of a coverage figure. Reporting our
own request rate as a fact about what Walmart stocks is the exact failure the whole file exists
to avoid.

**The second seller, and where it came from.** Metro blocks outright (403). **Loblaws blocks too,
and harder than Walmart ever did:** every page returns a 370 to 474 byte Akamai "Access Denied",
under every header combination tried with controls between each, so this is a wall rather than
the header pairing bug Walmart had. Its real backend, `api.pcexpress.ca`, was found by reading
the storefront's own network calls in a browser and answers 401 without OAuth client credentials,
which is a door we are not going through.

**Canadian Tire is the readable second seller**, and it is built: `price/src/canadiantire.ts`,
same shape as the Walmart adapter, verified end to end on a Kraft 1 kg jar at $6.99. Its page
carries no product data; the search and product APIs are named in the page's own inline script,
and the subscription key and default store id they need are printed in the unauthenticated HTML.
**Its `partNumber` field looks like a barcode and is not one**, checked two ways rather than
assumed: it fails a UPC-A check digit, and for the one product we can compare it disagrees with
our catalogue's code outright. So Canadian Tire joins by name, like Loblaws would have, not by
barcode, and it publishes no unit price at all.

The shape of the seller problem, stated plainly: of the four Canadian retailers looked at, one is
readable and joins by barcode, one is readable and joins only by name, and two are closed.

**Open Prices, the Open Food Facts price database, is free, open, needs no key, and joins on the
same barcode namespace we already use.** Measured: 307,186 price rows worldwide, **664 of them in
Canadian dollars**, covering **487 distinct barcodes**, dated 2020-02-01 to 2026-08-26. **417 of
those 487 join to our catalogue exactly**, an 86% join rate.

487 products against 78,389 usable Canadian rows is 0.6%. It is not a corpus. What it is worth:
proof that the barcode join works at 86% against a real external source, a free baseline that
costs nothing to ingest, and the natural place to contribute harvested prices back to.

**Why one retailer can never be enough, measured 2026-09-05.** The early Walmart grocery misses
are not random and are mostly not fixable with better queries. Reading them:

- `Compliments Hot Chocolate Mix`, `Selection Distilled Water`, `Co-Op Gold Seasoned Chicken Wing`
  are **another chain's own store brand**. Compliments is Sobeys, Selection is Metro, Co-op Gold
  is Co-op. Walmart will never stock any of them, at any price, ever.
- `Bofrost Jagerpfanne`, `Dececco Pasta Conchigliette no. 52`, `Bliss Ball Pistachio Crunch` are
  imports and niche lines a mass retailer does not carry.
- `Mars Milk Chocolate M&M's 200 g` is a national brand Walmart certainly sells, and it still
  missed on barcode, because **the same product in a different pack size is a different barcode**.
  Our row is a 200 g bag; Walmart's shelf may hold a 230 g or a 49 g.

Counted, on the 76,965 Canadian grocery rows carrying a brand: **9,016 of them, 11.7%, are a
supermarket's own label.** Compliments 1,862, President's Choice 1,729, Great Value 1,689,
Kirkland 1,201, Selection 1,060, No Name 898, Irresistibles 301, Co-op Gold 276. Only Walmart's
own 1,689 can ever be priced at Walmart, so roughly one row in ten is structurally out of reach of
any single retailer.

Three consequences, and they change the shape of the corpus rather than its size:

1. **Multiple retailers is a requirement, not an optimisation.** Each chain is the only possible
   source for its own label, and pack sizes differ between them.
2. **The name join carries most of the weight, not the barcode join.** Which is exactly the
   refusal deleted earlier today. That deletion now has evidence behind it rather than only his
   instruction.
3. **Harvesting from users climbs in value.** A shopper photographs the shelf tag in the store
   that actually stocks the thing, which is the only place a competitor's private label price
   exists at all.

**The three ways to a real corpus, and the recommendation.** Crawl, buy a feed, or harvest from
users. Crawling the storefronts already proven readable, with user harvesting on from the first
shipped build, is the recommendation. Harvesting is the only one of the three that compounds, and
it is the reason the user typing the price is a feature and not a failure to read the tag.

The seam is left open so a purchased feed drops in as another source.

---

## 5. What OLMA got wrong and we do not copy

1. **Ten seconds to a verdict**, which is what live searching per scan costs. A corpus makes it
   a database query.
2. **The verdict drawn before the evidence set is closed** is fine; **the evidence panel having
   no power to change it** is not. Ours updates the confidence when late sources land.
3. **One scan, two answers.** Their list badge and their detail screen disagreed and never
   reconciled. Ours render from one object.
4. **No barcode path at all.** The single biggest omission and the whole reason our free tier can
   be unlimited where theirs is three a month.
5. **The whole uncropped photo as the unit of work**, with a hair dryer and a protein bag in
   frame. We crop first.

## 6. What OLMA got right and we take

Identification behind the price sheet. Named ordered progress steps. The answer drawn whole
rather than dribbled in. A stated national range as the headline. Late evidence that never blocks
the verdict. Scan history on the device. Metering the expensive path only. And answering every
single time.
