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

**What is built and not turned on.** A file holding every Canadian product's barcode, name, brand
and size. Two versions exist: groceries only, 122,101 products at 1.5 MB, and everything
Canadian, 618,310 products at 6.5 MB. Nothing serves them and nothing reads them.

**What has to be built around that file.**

1. An address that hands it out already compressed, with a long cache life.
2. A version stamp the phone can check cheaply, so it can learn a new file exists without
   downloading 6.5 MB to find out it has not changed.
3. Somewhere on the phone to keep it. The browser has permanent storage for exactly this. The app
   currently keeps everything in the small store meant for preferences, nowhere near large enough.
4. A weekly refresh, never blocking a scan.
5. Your decision: does a new user get the grocery slice on first run, or on first scan.
   Downloading up front costs a megabyte and a half once and makes the first aisle work.

**What the file can never do**, and the screen has to say so: it knows what a thing is, never what
it should cost. A phone holding it still needs a signal before anyone sees a verdict.

**The other half of offline, also written and switched off.** A queue in the browser that stores a
photo taken with no signal and sends it when the signal returns. Complete, working, never started.

---

## Part 2. The moment of the shutter

**No photograph has ever left a phone.** There is no door on the server that accepts one. This is
the largest hole in the system, because three of the four ways to identify a product start with a
picture.

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

## Part 3. Working out what it is

### 3.1 The correction: meaning search is not settled, and I said it was

I reported one measurement as a verdict on the whole idea. That was wrong, and the shape of the
error matters more than the conclusion.

**What the test actually measured.** Forty French queries, run against catalogue rows that carry
both an English and a French name, using clean catalogue product names as the query text, fused
with word search at equal weight by rank position. On that, words alone got thirty right in four
tenths of a second and the fused version got twenty-five in two and a half seconds.

**What follows from that, honestly.** For one query shape, against rows where the word index can
already read the French string, equal-weight fusion loses. That indicts the fusion weighting on
that shape. It says nothing about the four query shapes that matter more.

**The four it did not test, each a real path in this product.**

1. **A query written by a model reading a photograph.** This is the entire photo tier. What comes
   back is a paraphrase, not a catalogue string: "crunchy peanut butter, large glass jar" against
   a stored row reading "Kraft Peanut Butter Crunchy 1 kg". Word search punishes paraphrase by
   construction. Meaning search exists for exactly this. The test used clean catalogue names,
   which is the one query shape word search handles best, so it tested the easiest case and
   generalised from it.
2. **A product stored under an English name only, searched in French.** Untested, and the
   electronics half of the catalogue is largely English-only.
3. **A user typing what they want rather than what it is called.** "Cheap oat milk", "the blue
   Tide bottle". Nobody types a catalogue name.
4. **Recognising that two rows from two source databases are the same product**, and finding
   substitutes that are not in the same category tag. The cheaper-options feature currently falls
   back on category membership alone because it has nothing better.

**So the position is:** off for the shape it lost on, untested on the four that matter, and the
weighting is a knob nobody has turned. Not dead. And if it earns its place, the cost problem has a
known fix, which is to compress the vectors and split the index by category and country, projected
at about 92 milliseconds. The routing in 3.3 makes it affordable without even that.

### 3.2 The ladder: answer before a model is ever asked

The design goal is aggressive: every rung below should absorb as many scans as it can, so the
model is a last resort rather than the mechanism. Ordered cheapest first.

1. **Barcode on the phone.** Free, instant, no server, no limit. Most packaged grocery.
2. **The phone's own product file.** A barcode not in the local file, or a name typed in, matched
   on the device.
3. **The server's word search.** Hundredths of a second.
4. **The shared answer cache.** Somebody already scanned this exact product, and we stored what it
   turned out to be. See 3.3. This is the rung that grows on its own.
5. **The store's assortment.** If we know which store they are standing in, the candidate set is
   thousands of products, not five million, and matching against thousands is nearly free and far
   more accurate.
6. **The shelf tag text.** The phone already extracts every string in the frame. A tag usually
   carries the product name, and often the barcode in a readable font. That is an identification
   for free, before any picture is sent anywhere.
7. **The model.** Only now.

**The rule that keeps this invisible to the user.** Attempts run in order with a deadline each,
and the next starts the moment the previous one misses, not after a fixed wait. No rung may add
time to a path that would have succeeded on its own. The user never chooses a rung, never sees a
retry, and never waits on a cache probe.

**And the same idea one level up, in the product.** The best search is the one nobody had to run:
prices for the aisle they are standing in, alerts on the things they already watch, a weekly note
about what got cheaper. All of that is served from the corpus, and none of it costs a model call.

### 3.3 What everyone else's scans buy us

Four uses, in order of how much computation they remove.

**One, route the search before it runs.** The setup survey and a user's own history say which of
the five kinds of thing they shop for. A grocery shopper's query should search the 122,101
Canadian grocery rows, not all 5,182,591. That is a forty-two times smaller candidate set, it is
more accurate because there is less to be wrong about, and it is what makes meaning search
affordable: scanning grocery vectors is about a third of a second where scanning everything is
fourteen seconds. Routing is the single largest computational lever in the system.

**Two, the shared answer cache.** A popular product is scanned thousands of times. The first scan
pays for the model; every scan after it is a lookup. Keyed on the barcode where there is one, and
on a fingerprint of the crop where there is not. This is the mechanism that makes the free tier
sustainable at scale, and it gets better the more people use it, which is the whole argument for
collecting scans in the first place.

**Three, reorder candidates, never decide.** A prior says this person buys this brand, in this
store, at this time of week. It may move a candidate up the list. It may never invent a candidate,
never override a barcode, and it must lower the confidence shown when it was the deciding factor.
Break that rule and the system tells somebody they are holding what they usually buy when they are
holding something else, which is the one failure that costs them money and the one they cannot
catch by looking again.

**Four, preload.** When the app opens, or when the phone recognises a store, fetch the prices for
the products this person has scanned before and the ones most scanned in that store. The verdict
is then already on the device before the shutter is pressed.

The survey answer is a weak signal and should fade as real history accumulates. Someone who says
"groceries" at setup and then scans forty laptops is a tech shopper.

### 3.4 The four attempts, and their real state

**Barcode.** Built, two tenths of a millisecond, unmetered forever, correctly.

**Catalogue by text.** Built, and rebuilt today to be seven to thirty times faster. Runs on its own
worker so a slow search cannot block a barcode.

**Model reads the picture.** Written, tested, called by nothing. It turns a crop into brand,
product line, variant, size, unit, category, the text it could read, the readings it rejected, and
how sure it is. It reads a shelf tag in the same pass and keeps the everyday, sale and loyalty
prices as three separate numbers, which is the thing most price apps get wrong. Complete, and no
code path reaches it. See Part 14 for what a call costs and how to make it cost less.

**Searching the open web on a miss.** Nothing exists. Paid tier only, only on a catalogue miss,
never as a second opinion on a hit.

**The chain itself does not exist.** The piece that runs those in order and stops at the first that
answers is written, tested, and imported by nothing. Connecting it is wiring, not new code, and it
is the highest-value wiring in the project.

**The record of what we could not answer is broken.** Every miss should be written down so gaps
can be filled. The serving connection is deliberately read-only, so the write fails. It used to
turn a clean miss into an error on the user's screen; that is now caught and counted, and the
count is read by nothing. The catalogue's record of misses holds exactly zero rows. The fix is a
small writable file of its own.

---

## Part 4. Checking the answer is the right product

Take the winning product's own photograph, and the user's crop, show a model both, ask one
question: same product, and if not, what differs.

**Nothing here exists.** This is the step that turns a ranked list into an answer.

What it needs: the catalogue's product images have to be reachable, and today they are web
addresses pointing at somebody else's servers, which is worth knowing before it is load-bearing.
A second model call inside the same wait, which roughly doubles the model cost of a photo scan. A
rule for a no: do not fall to the second-ranked product, because it is usually a near-duplicate of
the first and fails the same way. Show the top one with an easy way to say "not this", and never
count that against the meter.

Verification is also the cheapest place to earn training data. Every yes and every no is a labelled
example of whether our identification was right, produced by the person best placed to know.

---

## Part 5. The wait, and how the screen fills

**Today it is one question and one answer.** Everything at once, or nothing.

**What the plan needs** is one connection held open for a scan, with an event as each stage
finishes: the name as soon as it is known, then the price, then the verification. The name lands
roughly nine seconds before the price, and that early reveal is what makes the wait bearable.

What has to be built: a scan gets an identity so it can be followed and resumed, the connection
survives the phone locking, and closing the app mid-scan finishes the work rather than discarding
it.

One rule from the app we are learning from: **the saved record and the screen must read from the
same object.** Theirs did not, which is why one scan read "Fair Price" in the list and
"Outrageous" on the detail screen, thirty seconds apart, forever.

---

## Part 6. The verdict

**The biggest disconnect in the system is here.**

The app answers prices from a hand-written file of **seven products**. The real price data,
**896 observations**, sits in a different database nothing in the app has ever read. 874 came from
a free open feed, 22 from Walmart, none from Canadian Tire, whose reader was built and never run.

There is also a **second price judge**, written against that real database, complete, tested, and
called by nothing. Two judges, two stores, and the app uses the small hand-written one of each.

**The first real build is connecting them.** One piece of code that reads the real observations and
hands them to the judge the app already uses, in the shape it already expects. That turns seven
priceable products into several hundred.

**What has to be built around it.**

- **The range query.** A national typical range over a recency window, never an average, sale
  prices kept separate from everyday ones. The data already records which is which: 644 everyday,
  252 promotional.
- **The freshness rule, load-bearing rather than cosmetic.** Those prices run from 2020 to today
  and **only 75 were seen this year**. 524 are from 2025, 284 from 2024. A price that old is not
  evidence about today's shelf and the confidence must say so.
- **Confidence from count, age, and how the match was made.** 782 matched by barcode, 14 by name.
  A name match deserves less confidence, and that is already recorded per row.
- **The judged store never sits inside its own comparison.** Already handled. Including it makes
  every answer read "fair" and nothing looks broken.

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

**Nothing exists.** No way to send a price. The one place the app accepts a POST is the verdict
request. Corrections users type are saved on their own phone and sent nowhere; the code says so.

**What has to be built.** A door that accepts a price, and with it: which product, which store,
which town, when it was seen, whether it was everyday or sale, and ideally the photo of the tag.
A store and location concept, which does not exist today beyond one text field. And the trust
system in Part 15, because the first person who submits a fake price to move a verdict will do it
on purpose.

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
- **No signal in the aisle.** Should still name the product from the file on the phone and say the
  price needs a connection. Needs Part 1.
- **Model down or refusing.** Fall back to the catalogue search, say the picture could not be read,
  never charge a search.
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

## Part 14. How the model is asked, and what that costs

Prices are current: the small model is $1 per million tokens in and $5 out; the large one is $5 in
and $25 out. The code already names both, and both are current models.

**The picture is the entire bill. Text is a rounding error.** Images are charged by area, roughly a
token per 28 by 28 patch. The small model tops out around 1,600 tokens for one image; the large one
takes bigger pictures and can reach 4,784. The whole instruction and answer schema together are
about a thousand tokens. So every decision about cost is a decision about pictures.

**What a scan costs, with the sizes above.**

- Free tier, small model, one crop plus the tag text as text: about **four tenths of a cent**.
- Paid tier, large model, two full-size images the way the code sends them today: about
  **six cents**.
- Paid tier, large model, one crop at 1280 wide plus the tag as text: **under two cents**.

Same model, same answer, three times cheaper. Which gives the levers, in order of size.

1. **Do not send the tag as a picture when the phone already read it.** Sixty tokens instead of
   sixteen hundred. The phone extracts every string in the frame already. Send the picture only
   when the text read failed.
2. **Do not send the full frame as well as the crop** unless the crop failed.
3. **Send the smallest picture that still reads the fine print.** This is a real tradeoff, not a
   free win: the crop is deliberately lossless at a large size to keep small type legible. It has
   to be measured on real shelf photos, not assumed. It is worth measuring, because it is worth
   more than every other lever combined.
4. **One call, not two.** The code makes a separate call for the tag, repeating the whole
   instruction and paying a second round trip. One call with two images does the same work.
5. **Escalate instead of defaulting to the big model.** Run the small one, and re-ask the large one
   only when the confidence the system already computes comes back low. If one scan in seven
   escalates, the blended cost is about two thirds of a cent against two cents for always using the
   large model, and the hard cases still get the better reader.
6. **Half price for anything not in front of a person.** Re-reading the stored scan corpus to build
   the shared answer cache, filling in missing categories, checking our own accuracy against
   corrections. All of that runs as batch work at half rate.
7. **Keep the answer bounded.** Already done: the schema constrains the reply and the reply cap is
   small. A larger cap buys nothing but the chance of a slow response.

**One thing that looks like a lever and is not, and it is exactly the kind of thing that gets
assumed to be working.** Caching the instructions will not fire on the free tier at all: the small
model only caches a prompt of 4,096 tokens or more, and ours is around a thousand. The large model
caches from 512, so it does fire there, and saves under a tenth of a scan, because the picture is
the cost. Worth turning on for the paid tier, worth measuring rather than trusting, and worth
knowing it is doing nothing for the free tier no matter what the code says.

**And the real lever is not on this list.** Every rung of the ladder in 3.2 that answers a scan is a
model call that never happens. Three photo searches a week works out to about five cents a month
for a heavy free user. The model is not what will cost money here. The crawl and the machine are.

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
3. **The aggregate becomes the priors** in 3.3, which is how the system gets cheaper as it grows.

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
2. **Give the miss log its own writable file.** Until it works we throw away the list of exactly
   which products to add next.
3. **Serve the phone file and read it on the phone.** Built already. Makes the aisle work with no
   signal.
4. **Record scans.** One record, feeding the meter, the crawler's queue, the priors, and the shared
   answer cache. Everything clever later depends on this existing now.
5. **Route searches by category before running them.** The largest computational lever in the
   system, and it needs only the setup answer plus the scan record from step 4.
6. **Wire up the identification chain that already exists**, with the upload door, the key, and the
   meter. This is the step that makes the paid tier real, and Part 14's savings should be built in
   from the first call rather than retrofitted.
7. **The shared answer cache**, which turns steps 4 and 6 into a system that gets cheaper with use.
8. **Put the crawler on a schedule with a queue ordered by scans, and a re-price cycle.**
9. **Accept prices from users**, with the trust rules, once you have decided what a report earns.
10. **Test meaning search on the four shapes it was never tested on**, and finish or drop it on the
    answer. It is cheap to test and it currently sits in an undecided state, which is the worst of
    both.
11. **A place to run, with a real address**, at the point a person who is not you opens it.

Items 1, 2 and 3 are each a few hours and each is finished work being connected. Items 4 through 7
are the real build, and they are in that order because each one makes the next cheaper.

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
| Meaning-search measurement | `catalogue/src/vector-worth-it.ts` | Valid for one query shape only; see 3.1 |

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
