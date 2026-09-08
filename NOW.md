# NOW, the one thing being worked on

*One screen. If any other doc disagrees about the current state, this file wins. State, not
narrative.*

---

## The app counts what it does now, 2026-09-07

**Every scan is written down and read back, and the profile screen shows it.** This is the second
item in the order the vision sets, the instruments, and it was the one unblocked thing at the top
of that list. Three of the vision's four Want-and-Reliance figures said "Nothing measures this
today", and one of them named the reason out loud: the scan record existed and had no reader. It
had no writer either. Both ends are attached now.

What a person sees: a block on the profile screen, under the coverage list, saying how often Shin
could name the thing, split by whether the person scanned a barcode or typed, plus corrections per
hundred, second-week return, and their own week. Every rate can say "not yet" instead of a number,
because a share over no scans is unknown and printing 0% for it would be claiming a failure nobody
has measured.

What it counts and what it does not: the log is one row per "what is this thing", so the rate is
how often the catalogue could NAME it, not how often anyone got a price. Those are far apart, three
products can be priced in a store, and the screen says which of the two it is showing.

Checked through the path a person takes, not through the endpoint: a scan typed into the running
app appears against that browser's own random id and moves the number on the profile screen, in
both themes, with no console errors. Also fixed on the way: a request body could be any size, and
the first cap written for it answered with a hang-up rather than a status, which the aisle
correction queue would have retried forever.

Still uncalled, and the next of this shape: the offline aisle has no screen importing it, the
ranked-candidate search and the cheaper-options route have no caller, and the camera still shows a
hand-written list because the photo path needs a model key nobody has set.

## Read this first, 2026-09-06

**`docs/the-vision.md` is what every improvement is judged against.** Written on his instruction
from the 09-05/06 conversations: two goals as numbers (share of scans that end the decision;
payers per hundred downloads and what each leaves), eight principles, and the order of the next
stretch. It is "scan anything", not a grocery app; grocery only had a free catalogue first.

## The build tree, skeleton pass, 2026-09-06

**`docs/the-tree.md` exists as of this pass: the root and the two levels under it, drawn from the
four documents only** and following `docs/the-tree-rules.md`. Root is the moonshot sentence; nine
first-level branches (identity, price supply, the verdict in the frame, the purchase record, the
money, reach, permission and anti-abuse, the instruments, and running it); every second-level line
carries its kind, the goal number it moves, its source, and **not decomposed yet**.

**Nothing in it is marked built or not built.** State marking reads the code and opens every
citation, and it is the pass after the branches. Three walls sit in the tree as slots with their
go-arounds named but not drawn; five things are marked blocked outside rather than a wall, each
with what lifts it, including the phone platform, which fails the rule that a wall is about our
size.

**Three levels now, and a correction pass after two more fresh readers, 2026-09-06.** The third
level opened 85 lines into about 290. Then a logic reader and a structure reader went over all
three levels together. The three that mattered: the fair line had been written as a middle, which
is a defect this repo already found and fixed, and which under the refund promise pays out on
about half of all purchases; the way around the chain wall was drawn as if it delivered per-store
prices and stock, and it delivers neither, with five things depending on it; and the metering
problem was lost, so the paid path only fires on the two kinds that are blocked from outside. All
three are fixed, along with a bootstrap cycle, a limit keyed to a value a reinstall regenerates,
nine duplicate pairs, and a goal figure that could not move. Added with no previous home: whether
the answers were right, who operates it, the legal surface, the payout inside the guarantee, and
reading the shelf tag. Recorded rather than fixed: rule 3 was amended so the measuring branch
would pass, which is the wrong direction of fit, and that now says so on the rule.

**The skeleton was checked by a fresh reader before he saw it, and redrawn.** The first draft had
no node for the app itself, which took two thirds of his stated purpose with it, and cited the
combined pipeline nowhere while claiming it as a source. Also missing and now in: the free
catalogue lookup between a code and a paid reader, the model key as his call, the correction as a
thing rather than a number, the photo door, the crawl, the retailer-to-catalogue join that is the
measured cap, the estimate at the bottom of the evidence ladder, the person's location, per-feed
permission, the meter, the way money is taken, the seller audit, video production and the caption
test, and what brings a person back. Lines that named a category of figure instead of a figure
were rewritten, six "all kinds" claims that were chain retail only were narrowed, and three joins
that were policies rather than pieces were replaced. `docs/the-tree-rules.md` rule 3 gained one
amendment: the branch that measures does not move a figure by itself and is not cut for it.

## Read this second, 2026-09-05

**`docs/the-combined-pipeline.md` is the spine.** It supersedes `docs/pipeline-decisions-and-plan.md`
wherever the two disagree, on his instruction: take OLMA's pipeline as the base, put the barcode
and the catalogue in front of it, and drop the accuracy-first posture. His words:

> *"You also created your own rules and said that accuracy is the most important thing. When in
> reality, its not and it impeeds so much of our design. I believe almost everything olma did is
> correct except they didn't integrate our barcode and cateloge system."*

The rule now is **always answer, and let the confidence carry the doubt**. Twenty-one of the old
plan's fifty-four decisions refused to show the user something and none of them carried his
words. The one thing kept: the good/fair/high call is arithmetic, never asked of a model.

**The camera guidance system shipped 2026-09-05, uncommitted in the tree.** His ask: a system in
the camera view that massively helps with object selection, with the feature calls left to this
side. The decision is in `docs/decisions.md`, "The viewfinder acts first and speaks last". What
landed: a mark on a barcode while it is still being read, with the agreement filling as a bar;
every object the detectors found drawn as a tappable box, so decision 9's promised tap finally
exists; the reticle drawing the padded rectangle that actually gets sent rather than the bare
box; auto-zoom toward a small object, and the torch putting itself back out when the torch is
what is blowing the label out; and one measured coaching line at a time in the docked face, from
four measurements and no others. Rejected on the record: "move back", "the lighting is bad", and
a general "bad angle". New file `app/src/eye/framing.ts`, 11 tests in `app/test/framing.test.ts`,
`npm test` added to the app package. Typechecks, bundle rebuilt, marks verified rendering and
hit-testable in Chrome against both a dark and a bright ground.

**The corrections are wired, 2026-09-05, uncommitted in the tree.** His ask, in two parts: wire the
corrections, and this is going to be an iOS and Android app. What a person types into the correction
screen now reaches the next verdict on that product instead of being collected and dropped. New
`price/src/corrections.ts` (the store, one row per person per shop per day, never rebuildable, and
the only file in a gitignored directory that a re-crawl cannot replace), new
`spine/src/sources/corrections.ts` (reads them back as price points, identifies nothing, ranks above
the crawled feed because it names its shop), `POST /api/correction`, and a client offline queue that
writes locally first because the aisle is where the signal is worst. Decision on the record: "A
price somebody types in is a price, and it reaches the next verdict". 27 new tests, 271 across the
four packages, all four typecheck, and both new files were broken on purpose to confirm the
typecheck reaches them.

Measured on the running app, not reasoned about: Lay's Classic at an asking $4.99 went from one
price and "1 price where groceries and household usually needs 2" to two prices and "about $3.73
across 2 stores" after one $3.99 correction at No Frills; the same query standing in No Frills drops
that correction from its own comparison; a re-sent correction comes back as the same row.

**The mascot line had gone false and was rewritten.** "Counts once a second tag agrees" was written
to be honest when corrections went nowhere. Since the thresholds came out earlier the same day, one
price is enough to answer, so a single correction already moves the verdict and that line was
understating what the person's contribution does. It now says it counts from now and firms up when a
second tag agrees.

**Two things this leaves for the phone app, named rather than discovered later.** The per-device id
lives in browser storage, so on iOS and Android it has to move into the Keychain and the keystore or
a reinstall quietly becomes a new person with no history. And the corrections file is the only data
here that cannot be rebuilt from a re-crawl, while it sits in a directory ignored by git because
everything else in that directory can be.

**State as of 2026-09-05 02:20.** Both judges now answer instead of refusing: the new one in
`price/src/verdict.ts` and the old one in `spine/src/spine.ts` that the app actually serves.
Nine thresholds gone between them, each replaced by a named low confidence sentence. All four
packages typecheck and 133 tests pass. The app is live against the real 5,182,591 row catalogue:
a barcode answers in 1 ms, a text search in 22 ms.

**The finding that matters more than the deletion.** Removing every threshold moved pilot
coverage by exactly zero, 2 of 7 before and after. All five refusals were empty hands, not
thresholds. **Thresholds were never what capped this product. Supply is.** One retailer covers
35% of Canadian grocery, and the biggest single loss is not missing stock but 65% of products
finding candidates it cannot confirm are the same item.

Three numbers measured 2026-09-05 that a plan should not re-guess. The catalogue is 618,364
Canadian rows but only **76,965 of them are grocery**; the rest is an electronics feed, so any
sample has to name its source. **Open Prices** joins to our barcodes at **86%** but holds only
487 Canadian products. And walmart.ca is readable, at two requests per product, with one
booby trap recorded in `price/src/walmart.ts` that cost most of a session.

---

## The pipeline and the ordering, his call, 2026-09-04

He read the plan below and rejected its shape rather than its facts. It put a hundred
hand-priced items and a fresh-agent audit in front of a working product, which is the right
order when building is the expensive part. His words: *"the cheapest thing in the current world
is producing iterations because I'm vibecoding and not manually working on something... What you
said takes months only really takes a couple of days... Its actually faster to just build the
product than to perform all these tests."* **The gate-first ordering in `QUEUE.md` is retired.**
Band 1's 100-item gate, its fresh-agent check, and the band 2 stand-in tests no longer sit in
front of the build.

### His pipeline, as he stated it

Two tiers.

**Basic.** Search the catalogue freely, plus three image searches a week. An image search starts
with a guidance system that helps the user frame the object correctly, then excess image is cut
out automatically, then the cropped image goes to a weaker model than the pro tier for
identification. The identified item is looked up in the catalogue, and the average price and the
alternatives are displayed. If the item is not found, the screen shows similar items (a specific
type of orange missing shows other oranges), and an option to use the pro tier appears.

**Pro.** Two versions: catalogue search, and if the catalogue misses, an online LLM search.

His standing note on all of it: *"The specifics of this system are very open to changes, anything
can be changed if there appears to be a better option for something."*

### The one component, and it is the whole product

Four of the five steps are one thing: a searchable catalogue with embeddings. Matching an
identified name to a product, showing similar items on a miss, and showing alternatives are the
same query at three thresholds (exact, nearest neighbour, nearest neighbour filtered to lower
unit price). Build it once and three steps light up together. The catalogue is therefore the
first build, not the identification model.

**Identity and price are two different datasets and only one is free.**

- Identity, usable now, free, no key: Open Food Facts, roughly 4M products with barcodes, names,
  brands and images, ODbL. Its price data is not usable.
- Price, narrow and paid or scraped, per chain: Savvi sells a daily Canadian grocery feed over
  Superstore, No Frills, Save-On, PriceSmart and T&T; Apify has scrapers on the same chains;
  Parse.bot has Super C. Best Buy's official API remains the tech candidate and has still never
  been run with a real key.

Consequence for the screens: the not-found path fires far more often on **price** than on
identity. "We know exactly what this is and not what it costs near you" is a different state
from "we do not know what this is", and the app currently has only the second.

### Proposals against his pipeline, not decisions

Four, each with the reason. None is built and none is decided.

1. **Split the tiers by what the object is, not by model strength.** Most retail objects are
   identified by the text and barcode printed on them. Cheap path: barcode anywhere in frame,
   then OCR the label and match the catalogue text, then a model only if both miss. Basic becomes
   cheap because most scans never reach a model; pro earns its price on the unlabeled objects
   (produce, used goods, furniture) where reasoning is the actual work.
2. **Framing by detection, not instruction.** Run a small on-device detector, draw the box found,
   let the user confirm or drag it, then crop to it. Same crop, less user effort, and a bad crop
   is visible before it spends a search.
3. **Cheapest and the spread, not the average.** An average across sellers hides the two things a
   person acts on: the cheapest place to get it, and how far above it they are standing. The
   spine already computes the comparison set to do this.
4. **The weekly limit is a conversion lever, not a cost control.** Haiku 4.5 is $1/MTok input and
   Opus 5 is $5/MTok (cached 2026-06-24, `claude-api` skill); a cropped product photo is small
   enough that a scan is a fraction of a cent on either tier. Set the number where it converts,
   not where the bill allows.

### What this retires in the written record

- The 100-hand-priced-item gate and the fresh-agent check ahead of the build.
- *Nearby-cheaper and dupes are out of v1* (`docs/decisions.md`): alternatives are now inside the
  main loop, displayed beside the price. Nearby-cheaper still needs a store-level feed before it
  can claim a location.
- *Scans are not metered in v1* (`docs/decisions.md`): three image searches a week is metering.
  Reversed by him, 2026-09-04.
- The assumption that identification needs a vision model months away. It does not; it needs a
  catalogue.

### The decisions and the build order

`docs/pipeline-decisions-and-plan.md`, written 2026-09-04 on his instruction that Claude always
defaults to the easier option and that every decision must be made now, on user experience rather
than build cost. Fifty-four decisions, all made, eight of them reversals of the cheap answer given
earlier the same day; then ten build stages, each naming libraries rather than capabilities, with
every decision assigned to one. Two measurements taken first: Open Food Facts holds 125,751
Canadian products (grocery-first survives its kill check), and the browser's native barcode reader
does not exist on iOS and fails silently (so the barcode reader is WebAssembly on every platform).

The four proposals above are superseded by that file, which decides all four and 50 more. The app's
no-dependency, no-build-step property is deliberately ended there.

### Every free catalogue that needs no account is loaded, 2026-09-05

The catalogue went from 122,158 rows to **211,846**, by loading Open Beauty Facts (48,968), Open
Products Facts (28,426) and Open Pet Food Facts (12,295) through a new JSONL prepare step that
shares its size and unit judgements with the Parquet one. Counts read out of the database, not
off the loader.

**The number that matters is not the total.** Only **1,756** of the 89,688 new rows are sold in
Canada, against 122,157 Canadian grocery rows. Free coverage outside groceries is roughly 1,756
products in this market, not 90,000. The world's cosmetics are searchable; Canada's are barely.

Two things came out of doing it. The package's own `npm test` had been broken since some Node
version bump and ran zero tests while reporting a failure; it now runs the 29 that exist. And the
embedder was rescanning the whole product table for every batch of 64, which at this size meant
five rows a second instead of 130; measured before and after, and the fix is a page rather than a
per-batch query.

### The electronics catalogue is in, 2026-09-05

He made the Icecat account, so the largest hole is filled. The catalogue is now **5,182,591 rows
and 618,364 of them Canadian**, up from 123,913 Canadian this morning, a five-fold increase that
is almost entirely electronics. Icecat's index holds 7,670,733 entries; 36.8% carry a barcode and
the rest are dropped, because a data sheet no scan can reach is not catalogue here. That 36.8% is
measured against the file and is half the "about 70%" a third-party article claimed. Rows are one
per barcode, not one per product, so all four codes on a box resolve rather than only the first.

The Sony WH-1000XM5 that the hand-pricing test could not identify now resolves from the catalogue.

Two things to know. 1,507 rows already loaded shared a barcode with an Icecat entry and were
overwritten, 1,478 of them from the general-merchandise source; brand-approved rows are probably
better rows, but it happened silently and is written down. And the vector half of search is still
building, Canada first, about seven hours for the whole thing; barcode lookup and text search
already work on every row.

Best Buy refused the signup, since it rejects free and .edu email addresses and wants a domain we
own. eBay registered but is held for review for at least a business day. Both are price sources
rather than catalogue rows and belong with the other sellers.

Cost research, vendor pages only, is in `docs/catalogues.md`. Buy nothing yet: the number that
decides any purchase is the per-category miss rate on real scans, which does not exist. Two open
risks written up there, the share-alike licence on the open food data, and whether any paid
vendor permits caching an identity, on which the entire per-lookup cost argument rests.

### What of it is built, 2026-09-04

Nine of the ten stages have code and tests. In package order:

`catalogue/` holds 122,158 Canadian grocery products with a full-text index and a 384-dimension
vector for every one of them, searched together and fused by rank rather than by score. It answers
by barcode in three digit forms, decides between confident, ambiguous and missing, records every
miss as a gap, and widens to a named neighbour ring when it cannot find the exact thing.
`alternatives.ts` is the cheaper-swap stage: same category, comparable size, lower unit price, a
seller with a real price, three at most, and allergen differences printed on the row rather than
used to hide it.

`app/src/eye/` is the camera: a barcode reader that runs on iOS (nineteen symbologies, three
agreeing frames before it fires), a framing pass that unions a trained detector with a hand-written
saliency detector so packaging that no model knows still gets a box, a burst that keeps the
sharpest frame and crops to the object losslessly, and an offline queue that never drops a capture.
Bundled at 77 kB before the camera runs, with the detector in a chunk fetched later. Attached to
the camera screen through `app/public/js/eye-attach.js`, which falls back to the screen's old
camera whenever any part of it will not start.

`identify/` turns a crop into a named product, with the confidence derived from independent signals
rather than taken from the model's own opinion of itself, and asks a two-button question rather
than guessing when two sizes of the same product are both plausible.

`price/` judges. Two sellers minimum, never an average, regular and promotional never mixed, the
age of the oldest number always in words on screen, and no tier at all below the evidence floor.
`sources.ts` carries what the storefront check actually found (Walmart Canada publishes barcodes,
Loblaws publishes none) and refuses any name-only join that the catalogue cannot make confidently.

`spine/src/meter.ts` and `spine/src/run.ts` are the tiers and the surface: a search counts only
when the user accepted the identification, the verdict is the only thing the limit gates, and the
three answers arrive one at a time in the order they finish, each step named, nothing held behind
the slowest call.

127 tests across the packages, all passing, all five typechecking clean.

### Four things the real catalogue said that the plan had wrong

These were all decided by feel before there was data, and all four were replaced by a measurement
rather than by a second guess.

**How sure the catalogue is cannot be read off similarity.** Twenty probes, ten naming one exact
product and ten naming a kind of thing: the two groups score identically on every distance measure
tried. What separates them is whether the leader agrees with a brand or a size the label actually
showed, and whether it is alone in agreeing. The threshold that decided this was unreachable
against real data, so every photo would have asked the user to choose, forever.

**Backfilling the missing categories the obvious way does not run.** Asking the vector index for
each product's nearest neighbours costs a fifth of a second a query and six hours for the
catalogue. Collapsing each category to its own centre first does the same job in two minutes.

**The held out accuracy number was a lie by 12 points.** It scores products that already had
categories, and the job only ever runs on products that did not. Hand reading 25 real assignments
at each setting found the honest one: two Clif bars filed as kefir at the loose setting, 25 of 25
correct one notch tighter. Set from the hand read, not the table.

**His own example did not work, twice.** Ask for a kind of orange the catalogue does not stock and
it showed no other oranges, though it holds 367. Two causes: the neighbour list was read off the
top result only, which is usually an uncategorised duplicate of a row just below it that knows
what it is, and nothing stopped it drawing a ring from a tag holding 15,226 things. Both fixed and
both now tested. It answers with other navel oranges.

Not built: the live price feed itself, which is a purchase or a crawler and is his call, and the
result screen that consumes the run stream (the existing camera screen still runs the hand-priced
pilot flow underneath).

### Open, and his

Which category leads, because that picks the price feed bought. The identity layer is the same
either way.

Second, and raised by the decision list rather than by him: barcodes are free and do not touch the
weekly meter, and nearly every packaged grocery item has one, so if grocery leads almost nobody
reaches the limit and the meter only charges for produce, used goods and furniture, the categories
where the answer is least likely to be good. Three ways out, all his: count catalogue lookups too,
lead with a category where photos are the normal path, or sell pro on something other than image
count.

---

## Where this stands

**The price spine and the camera-first app are built and running.** `spine/` is the engine that
answers or refuses, at 44 passing tests and a clean typecheck. `app/` is a camera app: six
screens, no framework, no dependencies, no build step. Start it with `cd app && npm start` and
open `http://localhost:4173`. It opens on a live viewfinder with the shutter under the thumb.

**What that does not mean.** The engine answers **2 of the 7** hand-priced items and refuses the
other five, which is the pilot's own headline rather than a regression, and the app now says so on
its face instead of implying coverage it does not have. Nothing is deployed, nobody outside this
machine has opened it, and the three things below still gate everything that matters.

**The app has been rebuilt to the new design and the spec and the running app now agree.** What
shipped before was thirteen stages as thirteen pages with no camera anywhere, and a home screen
that described a camera in prose instead of showing one. What runs now opens on the viewfinder;
scan, identify, verdict and the follow-on actions are one sheet over the frozen frame; a refusal
is a designed grey state with its own face and its own repair, never an error and never red; and
the same tier colour is solid when Shin is certain and hollow when the evidence is thin, so
calibration is visible in the shape rather than claimed in a footnote. Behind the camera there
are four pages: watching, teach Shin a price, post it, and you. Eleven walkthrough screens were
deleted. The spec is `docs/design/DESIGN.md` and it still wins over any screen; the drawn
mockups are `docs/design/mockups.html`.

**Not built, and known.** There is no vision model, so identification is a list of the items the
corpus actually holds and the user picks one; any asking price that was a stated stand-in rather
than an observed tag is labelled as one on the screen where it is read. The share card is a still
image, not a clip. The build pass of 2026-09-04 is recorded below.

The research and the plan that produced it were made 2026-09-03 in one session, now in this repo
so they stop living in a temp folder.

The master plan is `pages/shin-terminating-loop.html`. It supersedes the two other plans and
contains the queue, the weekly pass, and the three ways this project ends.

## What the design pass decided

Six phases, run 2026-09-03 and folded into the spec 2026-09-04. Deliverables:
`docs/design/USAGE.md`, `docs/design/AVATAR.md`, `docs/design/GAMIFICATION.md`,
`notes/olma/audit.md`, `notes/duolingo-owl.md`, and the edits to `docs/design/DESIGN.md`. Twelve
new entries in `docs/decisions.md`.

**The loop.** Barcode, then the user types the tag price, then the verdict. Moment of value is the
verdict at peek: 9.5 seconds warm in an aisle, 7.2 on a couch, where there is no tag and the
outcome is the going rate rather than a refusal. The primary action moved into the peek detent,
labelled by tier; correct it and share sit one detent down. Every timing there is a design budget
the build is held to, not a measurement of anyone.

**The refusal.** Five of seven scans end here, so it gets one action and never two, it never
spends anything, the step that came up empty is named as the repair, and the session ends on a
live viewfinder. It never promises to look again.

**The avatar.** Forty screens, thirteen states, fifty four rows of contract, thirteen animations,
thirty nine strings required before a state ships. The intense faces are gated: 25% under the
going rate for delight, 40% over for anger, neither on thin evidence, and anger only when the
seller's name is on the same screen as the price. Interruptions the user did not ask for: two per
session, four per day, and zero notifications in v1.

**Gamification.** In: a thumbs signal that earns nothing, the attitude picker, the watched item, a
weekly line from the user's own record, and a callback to a verdict Shin already gave. Out:
streak, leaderboard, badges, collection completion, draws, cash bounties, and the saved-money
tally, each with the condition that reverses it. Nothing in v1 pays for a reported price.

**The scan meter.** Not in v1. The switch is built and defaults to off, and nothing earns a scan
back until a contributed price is confirmed by a second independent observation.

## What the build pass did, 2026-09-04

**All forty screens are drawn** in `docs/design/mockups.html`, in the five groups and the numbering
of `DESIGN.md` section 7. The six mockups the sequence file had made stale were redrawn, the
twenty seven missing ones were drawn from their traced rows, and every face on every screen was
checked against the size token on its `AVATAR.md` row by an enumerating script, after a fresh
verifier found nine of them wrong on the first pass. Stand-in asking prices on the steal and
rip-off screens are labelled as stand-ins in visible text.

**The running app now honours the contract where it has a screen for it.** The face draws all
thirteen states in three personality treatments with the state name printed under it behind one
flag; the six size tokens live in the stylesheet and every face call uses one. The watching line
says what was saved and no longer promises to look again; the promising form exists behind a feed
switch that is off. The verdict sheet has three detents: the peek carries the one primary,
labelled by tier from the string table (Save it on good, Watch it otherwise, Watching once saved);
half adds Correct it and Share with the spread and provenance; full adds the thumbs row, which
earns nothing. Every refusal carries one action. No line Shin says is written inside a screen.
Walked in Chrome 2026-09-04: picker, viewfinder, unsure refusal, thin fair verdict, save
acknowledged, no console errors. Spine still 44 passing, typecheck clean.

**Second pass the same evening, after he opened the app and said nothing had changed.** He was
right: of the 58 OLMA rows marked take or adapt and the 24 owl mappings, five had reached the
app. Now built and walked in Chrome: the asking price pad with a confirm key (never a pause that
submits for you), Skip to a going-rate card, three named working steps with the item name and a
cancel, torch and the hint that escalates after four seconds, a text route out of the no-identity
refusal, the going rate as a range with the market named, thumbs acknowledged with undo, the
intense faces gated exactly as the contract says (a $2.49 tag on a $1.25 going rate at a named
seller lands angry), the thirteen animations, past scans, recently removed, the market picker,
and the You page rows including the weekly line from his own record. The peek sizes to its
content so the primary is visible on a short window.

**Third pass, redone from his original prompt (2026-09-04, late).** He said everything done from the
prompt got nowhere near its intentions, and added the purpose every change is judged by: useful to
the user, easy to use, visually appealing (now in `CLAUDE.md`). The pass was re-planned from the
prompt, not from the design documents, which are no longer the reference: where the app and
`docs/design/*.md` disagree, the app wins and the documents are behind. Two audits of the running
app first (37 states, Shin absent or 28px on 12; 58 useful OLMA elements, 36 in, 9 partial, 10
missing), then three build lanes, a fresh verifier, and two walks at the short desktop window he
opens the app in. Built: one face-and-bubble unit on every screen; Shin docked on the viewfinder at
64px, breathing, blinking, glancing at the reticle, opening a second visit with a callback to the
last scan; every sheet, page and empty state carries Shin at 48 or larger with a line; a labelled
way back on every sheet; percent-off and N-for on the pad; the shutter ring as progress; a neutral
rail with the dot in the verdict hue; the cheapest seller marked; Done at full; the produce refusal
repairs on the sheet with the engineering prose behind Why; the stand-in list labelled as one;
saved rows open their verdict; "Watching" replaced by saved-with-price-seller-day; the correction
ack honest; the You page opens on Shin with the weekly line; a buzz toggle; legal rows inert.

**Not built, his decision, put to him in chat:** anything that meters, charges or rewards
(paywall, trial, meter pill, earned scans, leaderboard, draw). **Not built, known:** the frozen
frame thumbnail has only its no-camera branch tested (no camera on the build machine); the working
sheet has a face and no bubble (three steps do not fold into one line); `docs/design/AVATAR.md`
sizes and "none, because" rows are superseded by the app and not yet rewritten; the mockups page
is behind the app.

Nothing in this pass moved the three things below, which still gate the product.

## The next three things, in order

1. **CIPO trademark search** on "Shin" in the software classes. **Run 2026-09-04**, record in
   `notes/trademark-search-2026-09-04.md`: no live SHIN mark in classes 9, 35 or 42 in Canada;
   Nongshim's SHIN marks are all class 30. What it does not clear: the s.22 association with
   Nongshim on grocery shelves, the US register, and the app store name checks. The name is
   still his call. Until he makes it, no public name, no handle, no listing, no video.
2. **The two-caption video test**, on borrowed audiences. Three to five micro creators, or
   Reddit. Not a new account: a cold handle can return near zero views and give a false
   negative that reads like a real one.
3. **Thirty items priced by hand.** Seven are done and written up in
   `notes/session-2026-09-03.md`, along with a same-day correction that reversed two of the
   three category failures.

Nothing in this list needs code, and the first two are cheap. **The code existing does not move
any of them**, which is the point: the app was built to be walked through and argued with, not to
substitute for the trademark search or the video test.

## What the pilot actually showed

Direct retailer fetches: zero of four returned a price. Search for a live price: one usable
multi-retailer range out of seven items. **That is a finding about the method, not the market.**
New tech turned out to be the best-served category of the five once a price tracker was opened
instead of a search engine. Produce is the only genuinely hard one and is out of v1.

## Open, and mine to decide

- The name, pending the search above.
- ~~Shin's attitude.~~ Decided 2026-09-03: the user picks it, from three. It still triples every
  string, and now that cost buys the choice being his rather than ours. See `docs/decisions.md`.
- Whether Aurik is building this or reading it. He has Maintainer access on the repo either
  way; the answer changes how the plan is written from here.

---

## Interface review, 2026-09-04

A ranked flaw list against `DESIGN.md` is at `docs/design/FLAWS.md`. Contrast computed, overlap
measured in the running app, hit-testing done rather than eyeballed.

The through-line: **the camera surface is designed, the shell behind it is on defaults.** The
camera has authored focus rings on all seven controls, transitions, and a state machine that
clears the bottom bar for the verdict. `shell.css` has no focus rules, no transitions and no
hover gating, and its four controls carry nine screens.

Two findings cost a user something outright: white on the walk-away field computes to 3.80, and
2.51 once the verdict copy opacity is applied, against a 4.5 floor; and light theme never
re-themes the four verdict bases, so `good` sits at 2.62 and `fair` at 2.22 on white.

The light palette in code also drifted from the one in `DESIGN.md` on every token, warm to cool.
Per that file the screen gets fixed, but closing the drift alone will not clear contrast.

Uncommitted. Nothing in the app was changed.
