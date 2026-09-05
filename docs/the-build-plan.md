# The build plan

Written 2026-09-05. Builds everything in `the-backend-walkthrough.md`, in an order where each
piece makes the next one cheaper, run by parallel agents.

Thirteen lanes, four waves, never more than four agents at once. Every lane has one sentence
saying what it delivers, and one check that proves it from outside its own claim.

---

## How this is actually run

**Agents work in the one working tree, not in separate copies.** Two reasons, both checked rather
than assumed:

1. The launcher this system normally uses for parallel sessions refuses to run on any project with
   a remote, and this one has yours. That is a hard rule, not a setting.
2. A separate checkout starts with **no catalogue and no prices**. Both data folders are
   deliberately untracked, because the catalogue is 4.1 GB, one of its source files is 7.4 GB, and
   a crawled price a week old is worse than no price. An agent in a fresh copy would have nothing
   to search and nothing to price.

**So the safety mechanism is file ownership.** Within a wave, no two agents own the same file. The
table in the appendix is not documentation, it is the thing that stops two agents overwriting each
other. Any lane that needs a file another lane owns waits for the next wave.

**I stay the conductor.** I hand out the lanes, I run every test and every typecheck between
waves, and I do the merging judgement. Agents run on the middle tier unless a lane says otherwise;
the expensive tier is for the conductor and for you.

**Long jobs are processes, not agents.** The crawl and the embedding fill are background
processes that run for hours or days. An agent starts one and reports; it does not sit and watch
it.

**Between every wave I run:** all four test suites (67, 29, 27 and 10 tests), a typecheck on all
five packages, and the live checks that a barcode still answers in milliseconds and the seven
hand-priced items still return the same verdicts they do today. A wave that breaks any of those
does not hand off to the next one.

---

## What happened when wave 1 actually started, 2026-09-05

Checked before launching, and it changed the wave. **Three other terminals were live in this tree,
one of them busy writing.** Between them they held every file wave 1 wanted:

- the observation store, the catalogue search and the request handler: all three claimed by a busy
  terminal making the price row honest (nullable stock flag, real store name and date on
  cheaper-option rows, lower-cased category tags, data attribution)
- the camera screen: edited by two other terminals
- the request handler and the catalogue search again: also edited by a third

So wave 1 was re-scoped rather than delayed. **Every lane now creates new files only.** The two-line
registrations they need in the request handler and the search path are held back and applied by
hand once the other terminals release those files. Nothing was overwritten and nothing waited.

Two things came out of talking to the busy terminal rather than around it. The cheaper-options
route is theirs, so it is dropped from this plan. And they are about to rebuild the category
membership table, which deletes and reinserts 17.2 million rows and takes about two minutes, during
which anything reading category membership returns nothing. The measurement lane timestamps every
run so a result that lands inside that window can be identified and thrown out rather than read as
a finding.

**The general rule this produced:** check who holds a file before planning to own it, and prefer
re-scoping a lane to new files over waiting for a release. A lane that owns only files it created
can start immediately no matter who else is working.

---

## Wave 1. Four lanes, nothing depends on anything

### Lane 1. Real prices reach the app
**Delivers:** the app answers from the 896 collected prices instead of the seven hand-written ones.
**Builds:** a price source that reads the observation database and hands points to the judge the app
already serves, mapping seller, everyday-or-sale, date seen and how it was matched onto the shape
that judge expects. Plus a path override on the observation store, which today is hardcoded next to
its own source file and is the reason nothing else can open it.
**Proved by:** a barcode with recorded observations returns a verdict naming a range and a real
seller count; the seven hand-priced items answer exactly as they do today, word for word; 67 tests
still pass.
**Size:** medium. **This is the highest-value lane in the plan.**

### Lane 2. The miss log writes
**Delivers:** every product we could not answer is written down, and one command prints the list.
**Builds:** a small writable file of its own beside the catalogue, because the serving connection is
read-only on purpose and always will be. The recorder writes there. A report command prints the
most-missed searches and barcodes, counted rather than listed.
**Proved by:** a nonsense search produces a row; a hundred nonsense searches produce a count, not a
hundred rows; the catalogue's 29 tests pass.
**Size:** small.

### Lane 3. The aisle works with no signal
**Delivers:** a barcode is named on the phone with the network off.
**Builds:** serving the compressed slice with a version stamp the phone can check cheaply; on the
phone, keeping it in the browser's permanent storage rather than the small preference store,
searching it directly, and asking it before asking the server; a weekly refresh that never blocks a
scan; and a line on screen saying a price still needs a signal.
**Proved by:** load the app, turn the network off, scan a known barcode, get the product name. With
the network on, the answer is identical.
**Size:** large.

### Lane 4. Does meaning search earn its place
**Delivers:** an answer on the four query shapes that were never tested, and a recommendation.
**Builds:** one measurement, read-only on both databases, over four shapes: a model-style paraphrase
against catalogue names; rows stored in English only, queried in French; loose typed queries the way
a person writes them; and recognising the same product across two source databases. Each shape run
three ways, words alone, meaning alone, and fused at three different weightings, because the earlier
test used one weighting and never varied it.
**Proved by:** the numbers printed with the shape and the sample size beside each, and the file
stating in its own text what it did not test.
**Size:** medium. **Must open the catalogue read-only. The embedding job is writing to it.**

---

## Wave 2. Three lanes

### Lane 5. Every scan is recorded
**Delivers:** one record per scan, which is the same record the meter, the crawler's queue, the
priors and the shared answer cache all need.
**Builds:** a random identifier the phone makes on first run and sends with every request, with no
email, no password and no sign-up in front of the first scan. A store holding what was asked, what
came back, and whether the user accepted or corrected it. A weekly count per device, where our own
failures do not count.
**Proved by:** three scans make three rows; a correction marks its row; the count resets on a week
boundary; nothing beyond the random identifier identifies anybody.
**Waits for:** lane 3 to finish with the request handler.

### Lane 6. Search only where the answer can be
**Delivers:** a grocery shopper searches 122,000 rows instead of 5,182,591.
**Builds:** a route decision from the setup answer plus the person's own history, a search that
accepts a restriction, a restriction that fades as real history accumulates, and a barcode that is
never restricted.
**Proved by:** a grocery query is measurably faster and no less accurate; a restricted search that
finds nothing falls back to the whole catalogue rather than returning nothing; and someone flagged
as a grocery shopper can still find a laptop.
**Waits for:** lane 2 to finish with the search file, lane 5 for the history.

### Lane 7. The crawler becomes a service
**Delivers:** it runs on its own, prices what people actually scanned first, and returns to stale
rows.
**Builds:** a queue ordered by how often something was scanned and then by how old its price is; a
schedule; a re-price cycle that is shorter for popular products; and Canadian Tire wired into the
driver, which it never has been despite its reader being built and verified by hand.
**Proved by:** started cold, it prices the most-scanned products first; a throttle still records
unknown and never zero; a second seller's rows appear in the store.
**Waits for:** lane 1's path change, lane 5's scan record.

---

## Wave 3. Three lanes

### Lane 8. A photo reaches the model
**Delivers:** the metered photo path, end to end, with every cost fix built in from the first call
rather than retrofitted.
**Builds:** the upload door with a size limit, a rate limit per device and a timeout. The four
attempts running in order and stopping at the first that answers. One model call carrying the crop,
the tag as text where the phone read it, and the tag as a picture only where it did not. The cheap
model first, escalating to the expensive one only when the confidence the system already computes
comes back low.
**Proved by:** a photo of a real product returns a name; the tokens spent per call are printed and
land within a stated margin of the plan's estimate; a fourth photo search in a week is refused
politely; a refusal or a wrong answer costs nothing.

### Lane 9. The answer everyone else already paid for
**Delivers:** the second person to scan a product does not pay for a model call.
**Builds:** a store of resolved scans keyed on the barcode, and on a fingerprint of the crop where
there is no barcode; an expiry so a wrong cached answer cannot live forever; and a correction that
replaces the cached answer rather than sitting beside it.
**Proved by:** two scans of the same product, one model call. A correction changes what the next
person gets.
**The seam with lane 8, agreed before both start:** lane 9 writes the store and a single lookup
function with a fixed name and shape. Lane 8 calls it. Neither edits the other's file.

### Lane 10. Checking it is the right product
**Delivers:** the verification step, which is what turns a ranked list into an answer.
**Builds:** the catalogue's own product photo and the user's crop to a model with one question; a no
that shows the top candidate with an easy correction and never silently falls to the second, because
the second is usually a near-duplicate that fails the same way; and every yes and no stored as a
labelled example, which is the cheapest training data this product will ever get.
**Proved by:** a deliberately mismatched pair returns a no with the difference named, and the label
lands in the store.

---

## Wave 4. Three lanes

### Lane 11. Prices from users
**Delivers:** the only source of prices that compounds, and the only way to ever see a competitor's
house-brand price.
**Builds:** the door, with which product, which store, which town, when, everyday or sale, and the
tag photo. Then the trust rules, all of them, because the first person who submits a fake price to
move a verdict will do it deliberately: no single report moves a verdict; a photographed tag
outweighs a typed number; a report far outside the known range is held rather than published; a
reliability score per person built from how often their reports were later corroborated; one vote
per person per product per store per day; a price with no store and no date is not evidence; and low
outliers held harder than high ones, because a fake low price tells somebody a bad deal is good.
**Proved by:** one report does not move a verdict, two agreeing reports do, and a report far below
the range appears in a held queue rather than on a screen.

### Lane 12. The screen fills as the answer arrives
**Delivers:** the name roughly nine seconds before the price, which is what makes the wait bearable.
**Builds:** one connection per scan, an event as each stage finishes, survival of the phone locking
and the app going to the background, and the saved record and the screen reading from one object.
**Proved by:** the name appears before the price; closing the app mid-scan and coming back shows the
finished answer rather than a lost one.

### Lane 13. The refresh is one command
**Delivers:** rebuilding the catalogue is one command instead of a sequence nobody will remember.
**Builds:** one command that fetches, prepares, loads, fills the meaning index and rebuilds the
phone slices, stopping loudly at the first failure. The command that points at a file which does not
exist is removed rather than left to be discovered.
**Proved by:** run end to end on a small slice, and the phone slice's version stamp changes.

---

## What never goes to an agent

- **Anything that spends money.** Hosting, the model key, a paid price feed.
- **Publishing the privacy policy, or any promise to a user.** An agent drafts it. You publish it.
- **The first full-scale crawl against a retailer.** Rate and reputation, and it is not undoable.
- **Pushing to the shared remote,** which Aurik can read.
- **Committing.** I name the exact paths in every commit and you approve them. No agent commits, and
  nothing is ever staged blind, because that has already swept another session's half-written code
  into a shared push once.

---

## What every agent is told, before its own lane

- Work only in this project. Do not touch the other repositories on this machine.
- Own only the files your lane names. If you need a file another lane owns, stop and say so rather
  than editing it.
- Open the catalogue read-only. A background job is writing to it right now.
- Never build a file with a shell heredoc, and never route file contents through a shell. It turns
  backslashes into invisible control characters and it has already broken a word-boundary match
  here once.
- Do not write into the two data folders except through the code that owns them, do not read or
  write the credentials file, and do not commit anything.
- Your lane is done when its check passes, run from outside your own code. A check that did not run
  never passed.
- Report what you did, what you could not do, and anything you found that contradicts the plan. A
  finding that the plan is wrong is worth more than a finished lane.

---

## Appendix: file ownership, the thing that stops collisions

| Wave | Lane | Owns exclusively | Reads only |
| --- | --- | --- | --- |
| 1 | 1 Real prices | `spine/src/sources/observed.ts` (new), `spine/src/sources/registry.ts`, `price/src/store.ts`, `spine/test/observed.test.ts` (new) | `spine/src/spine.ts`, `spine/src/contract.ts`, `price/src/verdict.ts` |
| 1 | 2 Miss log | `catalogue/src/gaps.ts` (new), `catalogue/src/gaps-report.ts` (new), `catalogue/src/search.ts`, `catalogue/test/gaps.test.ts` (new) | `catalogue/src/schema.ts` |
| 1 | 3 Offline aisle | `app/server.ts`, `app/public/js/pack.js` (new), `app/public/js/api.js`, `app/public/js/screens/camera.js` | `catalogue/src/export-pack.ts` |
| 1 | 4 Meaning shapes | `catalogue/src/vector-shapes.ts` (new) | everything, read-only, both databases read-only |
| 2 | 5 Scan record | `app/server.ts`, `app/src/scans.ts` (new), `app/public/js/store.js`, `app/public/js/api.js` | lane 3's output |
| 2 | 6 Routing | `catalogue/src/search.ts`, `app/src/category-map.ts`, `app/src/routing.ts` (new) | lane 5's store |
| 2 | 7 Crawl service | `price/src/crawl.ts`, `price/src/queue.ts` (new), `price/src/canadiantire.ts` | `price/src/store.ts`, lane 5's store |
| 3 | 8 Photo path | `app/server.ts`, `app/src/upload.ts` (new), `identify/src/model.ts`, `identify/src/identify.ts` | lane 9's lookup function |
| 3 | 9 Answer cache | `app/src/answers.ts` (new), `app/test/answers.test.ts` (new) | nothing lane 8 owns |
| 3 | 10 Verification | `identify/src/verify.ts` (new), `app/src/verify-route.ts` (new) | `identify/src/model.ts` |
| 4 | 11 Harvest | `app/src/harvest.ts` (new), `price/src/trust.ts` (new), `price/src/store.ts` | |
| 4 | 12 Streaming | `app/server.ts`, `app/public/js/screens/camera.js` | |
| 4 | 13 One-command refresh | `catalogue/package.json`, `catalogue/src/refresh.mjs` (new) | every fetch and prepare script |

Three files carry all the collision risk and are assigned to exactly one lane per wave: the request
handler, the catalogue search, and the observation store.

**Gate commands.** Per package: `npm test` and `npm run typecheck`. Live: a barcode through the
identify route, a text search, and the seven hand-priced items through the price route. Current
baseline to beat, measured today: 67, 29, 27 and 10 tests passing, barcode 0.2 ms, text search
0.28 s, and two of the seven items answerable.
