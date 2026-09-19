# The backend, walked end to end

Written 2026-09-05, revised the same day after his correction on meaning search, on using what
everyone scans to make each scan cheaper, and on what the privacy policy has to permit.

Everything counted here was counted, not estimated, and the count sits beside the claim. Where
something is written but nothing calls it, it says so, because a built feature with no caller is
not a feature.

The order is the order one scan travels, then the machinery that runs when nobody is scanning,
then what has to exist before a stranger can use any of it.

---

## Part 0. Where any of this runs

**Today.** One program, started by hand, on your laptop. No address on the internet. It answers
only the browser on the same machine. Nothing restarts it if it dies, nothing runs on a schedule,
there are no accounts, and no request has ever come from a person who is not you.

**What it needs to be.** A machine that stays on, with the catalogue on its own disk beside it,
reachable over an encrypted connection, because a phone will not even turn the camera on without
one. A way to put a new catalogue in place without the app going dark. Something that notices a
crash and starts it again. Somewhere the errors go that is not a terminal window you closed.

**The size question, settled.** The catalogue is 4.1 GB and holds 5,182,591 products, with 7.4 GB
of raw source files beside it. None of that goes near a phone. It lives on the server, where a
barcode lookup against all five million rows takes two tenths of a millisecond. What a phone gets
is a slice, and the slice is 1.5 MB.

---

## Part 1. The phone, before it asks for anything

**What already works.** The camera reads barcodes on the phone itself, every preview frame, free,
no server. It waits for several frames to agree before believing a read and will not fire the
same code twice within four seconds. It also picks the sharpest frame from a burst, finds the
object, crops to it, and encodes that crop without losing the fine print.

**The other half of offline, also written and switched off.** A queue in the browser that stores a
photo taken with no signal and sends it when the signal returns. Complete, working, never started.

---

## Part 2. The moment of the shutter

**No photograph has ever left a phone.** There is no door on the server that accepts one.

How close it is: the phone already takes the burst, scores each frame for focus, picks the
sharpest, finds the object, crops to it, and encodes the crop losslessly. That finished crop is
held in one variable, used to draw a thumbnail, and overwritten by the next shot. Finished work,
thrown away every time.

**What has to be built.** A door that accepts the crop, the text the phone already read off the
packaging, and the full frame only when the crop failed. Sending the text costs almost nothing and
saves the server from redoing the cheapest useful work.

Around that door, four things that are not optional:

- **A size limit**, enforced before anything is read into memory.
- **A rate limit per device**, before any model is called. Without it, the first person who points
  a script at this spends your model budget in an afternoon.
- **A rule about the photograph.** A shelf photo can show a face, a hand, a loyalty card. See
  Part 15: the policy has to permit keeping it, and the screen has to say so where it is taken.
- **A timeout on the whole thing**, so a bad connection produces an explanation, not a spinner.

---

## Part 7. What arrives after the verdict

Comparable stores and cheaper options land after the verdict and never hold it up.

The cheaper-options piece is **written, tested, and called by nothing**. It finds same-category
Canadian products, compares by unit price when both sizes are known, falls back to ticket price
when they are not (true for 82% of the catalogue) and says "sizes may differ" in its own sentence,
drops anything under 5% cheaper, returns the best three.

It needs one thing it does not have: prices for the products it compares against. It asks its
caller for them, and until Part 6 is done there is nothing to ask. Finished work, blocked behind
one connection.

---

## Part 8. The machine that runs when nobody is scanning

The largest thing that does not exist, and the actual product.

**What exists.** A crawler that reads Walmart Canada, paces itself at three seconds a request,
backs every worker off together when one is throttled, records the outcome of every attempt
including failures, and resumes without losing work. Run twice by hand. On 60 Canadian grocery
products it got a usable price for 35%, nothing throttled, nothing errored.

**What is missing is everything that makes it a service rather than a script.**

- **Nothing schedules it.** No timer, no job runner, no notion of "last refreshed" anywhere.
- **Nothing decides what to price next.** A full pass over 76,965 Canadian grocery products takes
  15.7 days of continuous crawling, timed rather than guessed. That is only frightening if the
  order is arbitrary. Ordered by what people actually scan, the thousand products your users touch
  are priced within a day and the tail fills in behind. That queue needs scans to be recorded,
  which is Part 11, and it is the same record the meter needs.
- **Nothing expires anything.** Freshness is computed when asked, which is right, but nothing goes
  back to re-price what has gone stale. The cycle should be shorter for things scanned often.
- **The join is the problem, not the pacing.** 65% found candidates it could not confirm were the
  same item. Some is fixable with better matching. Some never will be: 11.7% of Canadian grocery
  products are another chain's own store brand, which the one readable store will never stock.
- **One store is structurally not enough.** Of four Canadian retailers examined, one is readable
  and joins by barcode, one is readable but joins only by name, and two block outright. Each chain
  is the only possible source for its own house brand.

---

## Part 9. Prices from the people using it

The only source that compounds, and the only way to ever see a competitor's house-brand price,
because that price exists only on a shelf in that chain's store.

**The door exists as of 2026-09-05.** This part used to open "nothing exists", and it was right:
corrections were saved on the phone and sent nowhere. There is now a second POST beside the verdict
request. A price a person types is stored on the server, read back as an ordinary price point, and
in the next verdict for that product. Measured the day it shipped: an asking $4.99 bag of chips went
from one price and "1 price where groceries and household usually needs 2" to two prices and "about
$3.73 across 2 stores", off a single $3.99 correction at No Frills.

What it carries is most of the list this section asked for: which product, which shop, when it was
seen, and whether it was everyday or sale, which is one tap on the correction screen and matters
because averaging a sale into an everyday price is the most expensive mistake in the engine. One
person can file one price per shop per day, so nobody agrees with themselves.

**What is still missing.** The town, and any real store concept: the shop is one text field, so two
branches of one chain are one shop to us. The photo of the tag. And the trust system in Part 15,
which is untouched: one person cannot become two, but two devices reporting the same fake number are
indistinguishable from two honest shoppers, and what limits the damage today is only that they still
count as one seller, so confidence cannot read high on them. The first person who submits a fake
price to move a verdict will do it on purpose.

**Your open question sits here**, and it is one mechanism rather than three: does reporting a price
earn extra scans, a place on a leaderboard, or a draw entry. Whichever it is, it answers the
metering problem, the harvesting incentive, and the seed of the corpus at once. One refinement
worth building in from the start: a report that later gets corroborated should be worth more than
one that does not, so the reward pays for accuracy rather than volume.

---

## Part 10. Keeping the catalogue alive

**What runs now.** A job filling the meaning index, resumable, currently around 461,000 of 4.93
million rows at 230 a second, so roughly five and a half hours left. It was designed to be
interrupted, which is why it survives.

**What has to exist.**

- **A refresh from upstream.** Built from downloaded snapshots of four public databases plus an
  electronics feed. Nothing re-downloads them. Products appear, get renamed and change packaging
  continuously, so this is monthly.
- **The refresh is half manual and partly broken.** Three sources have a single command; the
  grocery and electronics legs run by hand, in another language, in a specific order, and the one
  command named "fetch" points at a file that does not exist. Nobody remembers this in a month.
- **A rebuild that does not take the app down.** Build beside the old one, then swap. The serving
  side is already read-only and cannot migrate itself, which was deliberate.
- **Rebuild the phone slices with it**, and bump the version stamp.
- **Changing how meaning is measured is a rebuild, not an upgrade.** The index has a fixed width,
  so swapping the model means dropping and rebuilding it, and mixing two models in one index
  returns confident nonsense with no error.

---

## Part 11. Who someone is, and what they have used up

**Nothing exists.** No accounts, no sign-in, no cookie, no session, no rate limit, no metering.
Every route is open to anyone who can reach it. The settings screen honestly tells the user
nothing is metered in this build.

Right for the first scan. Not viable the moment a photo costs money.

**The minimum, and it is small:**

- **An identity that is not an account.** A random identifier the phone makes on first run and
  sends with every request. No email, no password, no sign-up in front of the first scan.
- **A count and a week boundary.** Three photo searches a week free. Barcodes and catalogue
  searches unlimited and never counted.
- **Our failures are free.** A search counts only when it produced an identification the user
  accepted. A wrong answer, a refusal, or a correction costs them nothing. Without this the meter
  punishes people for our mistakes.
- **A record of what was scanned.** Needed for the meter, and it is the same record that feeds the
  crawler's queue, the priors, and the shared answer cache. One thing, four uses.
- **A real account later, for one reason:** the moment somebody pays, they need to keep what they
  paid for when they change phones. Everything a user has today lives in one browser and vanishes
  with it.

---

## Part 12. What happens when a piece breaks

- **Catalogue not loaded.** Handled: the app starts, every screen works, scans say the catalogue is
  not up and why.
- **A store blocks us.** Handled correctly and worth protecting: a blocked request is recorded as
  unknown, never as a zero, and never counted in a coverage figure. Reporting our own request rate
  as a fact about what a store stocks is the exact mistake the whole thing exists to avoid.
- **Price data is old.** Answer anyway and say how old.

The one thing that must never break is the barcode path, because it is the free tier and the reason
anyone opens the app twice.

---

## Part 13. Cost of running it

- **Barcode scans cost nothing.** After Part 1, not even a request.
- **Catalogue searches cost nothing but the machine.**
- **Photo searches cost model calls.** The only part that scales with users. Part 14 is the detail.
- **The crawl costs time, not money**, and the time is real: two weeks of continuous requests for
  one national pass at one store.
- **The server holds at least five gigabytes and keeps the indexes warm.** A real machine, not the
  smallest tier of anything. On current numbers this, not the model, is the larger bill.

---

## Part 15. What we keep, what we train on, and what stops a fake price

**The policy has to permit all of it, and it does not exist yet.** What is collected: the picture,
the crop, what it was identified as, the price seen, the store, the town, the time, the verdict
shown, and whether the user corrected it. What it is used for: improving identification, and
answering other people.

**Say honestly what "training" means here**, because the policy should permit broadly and the
description should be true. In practice it is three things, and none of them is training a
foundation model:

1. **Corrections and verifications become the test set** that says whether identification is
   getting better or worse. That is the only honest measure this product can have, and it arrives
   free from people tapping "not this".
2. **Resolved scans become the shared answer cache**, which is a direct answer to somebody else's
   scan tomorrow.

Write the permission wide enough to cover training a model later. Describe the use in the words
above, so the policy is not promising something the system does not do.

**Three things that have to be settled before the first upload, not after.**

- **Consent has to be where the collection happens.** One plain line on the camera screen saying
  scans are kept and used to answer other people, with the full statement behind it. In Canada the
  purpose has to be stated meaningfully at the point of collection, not only in a document nobody
  opens.
- **A shelf photo can contain a person.** A face, a hand, a card. Decide whether the full frame is
  kept or discarded after use, and say which.
- **Deletion.** When someone leaves, their photos and their history go; the prices they contributed
  stay, stripped of them, because the corpus cannot be unwound and everyone else's answers depend
  on it. Say that up front or it becomes a promise broken later.

**The trust system, because people will report wrong prices, some by accident and some not.**

- **No single report moves a verdict.** A new report enters at low weight and gains weight when a
  second person's reading agrees.
- **A photographed tag outweighs a typed number.** The picture can be checked; the number cannot.
- **A report far outside the known range is held, not published**, and queued for a look.
- **A reliability score per person**, built from how often their reports were later corroborated by
  someone else or by a crawl. Reports from a reliable reporter clear faster.
- **One person, one product, one store, one vote a day.** Otherwise a single motivated user is a
  crowd.
- **A price with no store and no date is not evidence** and does not enter the corpus.
- **Show the provenance on screen.** "Seen by three shoppers at this store this week" is both more
  convincing and more honest than a bare number.
- **Hold low outliers harder than high ones.** A fake high price makes us look wrong. A fake low
  price tells somebody a bad deal is good, which is the one mistake on this screen that costs them
  money and the one they cannot undo by looking again.

---

## Part 16. The order to build it in

Ordered by what unblocks the most, reversible before expensive.

1. **Connect the real price data to the app.** One piece of code. Seven priceable products becomes
   several hundred, and it unblocks the finished cheaper-options feature.
4. **Record scans.** One record, feeding the meter and the crawler's queue. Everything clever
   later depends on this existing now.
8. **Put the crawler on a schedule with a queue ordered by scans, and a re-price cycle.**
9. **Accept prices from users**, with the trust rules, once you have decided what a report earns.
11. **A place to run, with a real address**, at the point a person who is not you opens it.

---

## Appendix, for whoever builds it

| Piece | Where it is | State |
| --- | --- | --- |
| Identification chain, four attempts in order | `identify/src/identify.ts` | Complete, tested, zero importers |
| Vision read of product and shelf tag | `identify/src/model.ts` | Complete, never called; two calls where one would do; `claude-haiku-4-5` / `claude-opus-5` |
| Second price judge, built for the real price store | `price/src/verdict.ts` | Complete, only its own test calls it |
| Cheaper options | `catalogue/src/alternatives.ts` | Complete, only its own test calls it |
| Offline capture queue | `app/src/eye/queue.ts` | Complete, `startCaptureQueue` never called |
| Ranked candidate list endpoint | `/api/search` in `app/server.ts` | Live, no client calls it |
| Real price observations | `price/data/prices.db`, 896 rows, 547 attempts | Not read by the app |
| Prices the app serves | `spine/data/observations.json`, 7 products | Hand-recorded pilot data |
| Judge the app serves | `spine/src/spine.ts` via `defaultDeps()` | Live; `RecordedSource` plus an unkeyed Best Buy adapter |
| Miss log | `catalogue_gap`, 0 rows | Write fails on the read-only serving handle; caught and counted in `gapsDropped`, read by nobody |
| Phone packs | `catalogue/data/pack-grocery.bin.br` 1.5 MB, `pack-canada.bin.br` 6.5 MB | Built, gitignored, unserved |
| Canadian Tire reader | `price/src/canadiantire.ts` | Built, verified by hand once, zero rows, not in the crawl driver |
| Catalogue | `catalogue/data/catalogue.db`, 4.1 GB, 5,182,591 rows, 618,364 Canadian | Live, read-only in serving |
| Meaning-search measurement | `catalogue/src/vector-worth-it.ts` | Valid for one query shape only |

**Model facts behind Part 14**, current as of 2026-09-05: input/output per million tokens, Haiku
4.5 $1/$5, Sonnet 5 $2/$10, Opus 5 $5/$25. Images bill by area at roughly one token per 28x28
patch; Haiku 4.5 caps at 1568 px on the long edge and about 1,600 tokens an image, Opus 5 and
Sonnet 5 at 2576 px and up to 4,784. Minimum cacheable prefix: Opus 5 512 tokens, Sonnet 5 1024,
**Haiku 4.5 4096**, which is why caching cannot fire on the current free-tier prompt. Cache reads
cost 0.1x, writes 1.25x at the five minute lifetime and 2x at the hour. Batch work runs at half
price. The crop encoder currently caps at 1568 px, which is the Haiku ceiling and below the Opus 5
one.

Measurements not to re-derive: full grocery crawl 15.7 days at 17.7 s a product; Walmart 60 product
run 35% usable, 65% unconfirmed; meaning search 30/40 at 436 ms text-only against 25/40 at 2,405 ms
fused, on bilingual rows queried with clean catalogue names; barcode lookup 0.2 ms; vector scan 2.8
microseconds a row, so 122,101 grocery rows is about 340 ms and 5.18 million is about 14 s;
observation ages 13 from 2020, 284 from 2024, 524 from 2025, 75 from 2026.
