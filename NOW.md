# NOW, the one thing being worked on

*One screen. If any other doc disagrees about the current state, this file wins. State, not
narrative.*

---

## CATALOGUE WORK, 2026-09-26: plan in `docs/catalogue-build-plan-2026-09-26.md`, MVP cut applied

Everything doable without an account, a licence or money, as `queued` units with acceptance tests,
split into a catalogue lane and a price lane that cannot write the same rows. **Build: 0, 11, then
2, 3, 15, 4, 6a, 13 together, then 5, 7, 9, 8, 14. Parked with a number: 1, 6b, 10, most of 12.**

Five findings in it correct earlier readings, all counted:

- The phone reads a packed binary dated **2026-09-05**, and no unit rebuilt it. Now unit 0.
- The food loader discards **4,636,853** rows against decision 28, but they arrive flagged
  not-Canadian and the packer takes only Canada-flagged rows, so none can reach a phone. Parked.
- The miss log in `catalogue/data/gaps.db` is **not** empty: 94 text misses, **zero** barcode
  misses, last written 2026-09-19, its heaviest entries our own test strings. **Fixed in `364eb25`**:
  the barcode path now asks the catalogue and records `catalogue_miss`, and records nothing when no
  catalogue is attached. Three parks in `docs/decisions.md` promote back on that log, so it had to
  start working before any of them can fire.
- **Quebec and Nova Scotia publish no usable liquor price list**, closed 2026-09-26 by opening SAQ,
  NSLC, both open-data portals and Divert NS rather than one search. NSLC prints an internal article
  number and **no barcode**, so that province is closed, not deferred. BC and New Brunswick stay the
  only two price sources.
- **Prices transfer between provinces and a province adjustment is worth nothing.** 754 identical
  barcodes priced in both NB and BC: median ratio **0.990**, and applying the best province factor
  leaves the median error at **10.8%**, exactly where no adjustment leaves it. Statistics Canada's
  provincial price levels agree independently: the country spans **7.6%**. Exceptions are dairy and
  fresh produce only.

## CURRENT, 2026-09-23: the tester launch is QUEUE.md bands 7 and 7B

What stands between the MVP and 10 to 20 testers is one list, QUEUE.md band 7 (launch) and 7B (the
cheaper lookup, `docs/cheap-lookup-logistics-2026-09-23.md`). Settled today in code: a typed name
answers only from Shin's own data (no Gemini call), and the barcode button sends no photo. Settled
in `docs/decisions.md`: CA$3.99 a month, CA$29.99 a year, 5 free barcode scans a week once
purchases work. The invite code is set on the Mac (D-164).

## SETTLED IN CODE, 2026-09-21: the catalogue no longer identifies, and two things below are now history

**`d3e4f0b` (Jamin, 2026-09-19) retired the catalogue-pick identify pipeline** -- `identify.ts`,
most of `model.ts`, `gauge.ts`'s dead sandbox-verification pair, the `/api/alternatives` route and
the orphaned `identifyPhoto` in `server.ts`. The ruling recorded two sections below was executed.

**So read the two sections below as the record of why the question was asked, not as state.** The
2026-09-18 trace -- *"`/api/identify/photo` -> `IdentifyStage.fromCrop`, where the model reads the
crop and then Shin's own catalogue ranks and picks"* -- no longer describes the code.
`IdentifyStage` and `fromCrop` survive only as prose inside comments; `app/server.ts:893` reads
"WHAT THIS REPLACED". Nothing had updated this file in the two days since, which is how the top of
the one screen that wins came to describe a deleted path.

**Consequence for retrieval, and it is the one that costs money if missed.** *"Retrieval is 32 of
the 52 failures and needs no key at all"* was measured while the catalogue still picked. That is
exactly the work the deletion removed from the critical path, so the figure describes a component
that may no longer be on it. **Aurik's ruling, 2026-09-21: re-measure before building.** No
retrieval work starts on the 32/52 number, and nobody should quote it as current.

**The key blocker is narrower than this file says elsewhere.** A `GEMINI_API_KEY` now exists in
`.env`. **It is free tier**, and `app/server.ts:3646` refuses to serve shopper photos on free tier
because Google trains on free-tier input, so the photo path is still shut. The blocker is not "no
key", it is **"no PAID key"**, and that ask to Jamin has stood since 2026-09-15. Everywhere below
that says the measurement is waiting on "the key", read it as the paid one.

## ANSWERED by Jamin in the walkthrough doc, 2026-09-16/17: Gemini identifies

*"The server will not check shins own product list for now. The only thing the server will do is
call gemini."* The catalogue *"will not be in use until more user data comes in."* Also answered
there: global now, units normalised with originals kept, alternatives in scope, barcodes read from
every frame with a "Scan barcode" button, no offline, no browser product, no Claude inside Shin.
All of it, and the four points he then decided (defaults, 2026-09-18): `docs/jamin-gemini-rules.md`, "Walkthrough rulings". Read
that before the question below, which stays as the record of why it was asked.

## BLOCKING QUESTION, 2026-09-18: does Gemini identify the product, or does the catalogue?

**Jamin pushed `Shin_Gemini_Pricing_Engine.zip` (f828606): GEMINI_SYSTEM.md, PRICING_GUIDE.md,
scan_prompt.md, response_schema.json.** It is the rule-1 fix for the photo path, which this file
already admits is two calls. **Until it is answered, retrieval work has an unknown payoff**, and
that is why it sits above everything else here.

Traced in code 2026-09-18, a photo scan runs `/api/identify/photo` -> `IdentifyStage.fromCrop`,
where the model reads the crop and then **Shin's own catalogue ranks and picks**, then
`/api/price` -> `groundedPrice.lookupPrice` for offers. **Identification is local; Gemini only
prices.** Jamin's package has Gemini do both in one call, with search as the identifier.

If his version wins: the 200-photo eval measures the cascade and nothing else, so **the 180/200
target would be measuring a component off the critical path, and no harness exists for the
replacement**; cost moves from free to about **5.6 cents a scan past ~1,250 scans a month** (one
observed grounded search used four queries at $14/1,000), a floor rather than an estimate.

**One fact may settle it without a decision.** Making the photo path one call means putting the
image INTO the grounded request, which the guard forbids and which Google has not confirmed
works. `scan_prompt.md` does exactly that. If the API refuses it, the design is not buildable yet.
Six numbered questions are with Jamin in `notes/catch-up.md` (2026-09-18).

**Credit where it is due, because three of these are gaps here:** his schema has NO estimated
price at all (rule 3 held more strictly than the document it came from), it carries a **condition
axis** this repo lacks entirely, and it preserves advertised pricing structure -- `2 for $5` as
price 5, quantity 2 -- which is **D-113's cause fixed at the source** rather than guarded
downstream.

---

## The 90% target, and what actually blocks it, 2026-09-18

**Aurik's ruling 2026-09-17: the headline is definition (b), strict -- a confidently NAMED correct
row, hedges counted as failures. 145/200 today. Target 180/200.**

**The blocker is bilingual, and it is not a ranking problem.** 82% of Canadian catalogue rows
carry a name in ONE language only (58,565 French-only, 42,734 English-only, 19,723 both).
Photograph the face the catalogue does not hold and the query shares no token with the target, so
no ordering of candidates can be correct. Measured leak-free, a language flip costs about 33
points of recall@10.

**Corrected 2026-09-18, later the same day: that reading was argued from the MANIFEST, and the manifest is
the answer key.** Scoring the REAL 09-16 run by what language the catalogue holds for each expected row:

| catalogue holds | rows | true code off the candidate list | accuracy |
| --- | --- | --- | --- |
| bilingual | 136 | 11.0% | **78.7%** |
| **French only** | **45** | **35.6%** | **57.8%** |
| English only | 15 | 6.7% | 80.0% |

**French-only rows fail retrieval at 3.2x the bilingual rate and land 21 points less accurate.** Those
queries came from a model reading photographs, not from the manifest, so this split is not leaked.

**What is NOT established, said before anyone builds on it.** That language is the CAUSE -- French-only
rows may be harder for other reasons (thinner catalogue data, more obscure products), and this is a
correlation in 45 rows. And that the backfill RECOVERS them: applied to the live catalogue on 09-18, it
gives cross-language text to 23 of those 45 rows and to **12 of the 33 off-list rows**; the other 21 get
nothing. Twelve is a ceiling on what it could rescue, not a gain. **The gain itself cannot be measured
without a keyed run**, because the only offline query text available is the manifest's, which is the
answer key.

---

**The original 09-18 reading, kept because the reasoning behind it is still right about the eval's shape:**
**A correction that matters: the cross-language backfill does NOT move this number.** It ships
(292bcb1) and it earns its place for real shoppers, but it will move the 200-photo eval by **at
most one row** -- only 20 of the 200 expected products are single-language at all, and that run's
query text equals the catalogue row on 200/200, so the eval contains no language flip to fix. It
is insurance against a case the current eval structurally cannot produce. Getting to 180/200 has
to come from somewhere else.

**A second correction, so nobody rebuilds on it:** `cascadeNumbersReal: true` in a dry-run result
means only `!args.fakeCatalogue` -- the real database was queried. It does NOT mean the dry run is
a valid proxy for a real photo run. The dry run's query text IS the answer key (manifest name and
brand equal the catalogue row's on 200/200), so it scores 195/200 and cannot detect a paraphrase
or a language change. **Do not measure retrieval changes with it.** The only honest offline shape
is leak-free: index one language, query with the other.

**What nobody can answer yet, and the work in flight.** No run records what the model actually
READ off the photograph, so every account of the 32 cascade misses -- including both of this
week's -- is inferred from index properties rather than observed. Two investigations disagreed and
neither could adjudicate. Recording the reading is in progress in `identify/eval/`; `readAs` and
`ModelReading` already exist on `IdentifyOutcome` and are simply dropped in `observationOf`.

**Shipped toward this on 2026-09-17/18:** D-122 (the size pin was inert on one sized row in six;
recall@1 173->179, 8 rows improved, none worsened), D-123 (bm25 weights were positional and
unchecked), and the cross-language derived-name column with a real FTS migration.

---

## HIGHEST PRIORITY, set by him 2026-09-15: his Gemini rules, and a repo cleanup against them

Read `docs/jamin-gemini-rules.md` first; it outranks everything below and every other doc. Two
jobs: (1) Aurik performs a cleanup of the repo for anything that contradicts those rules (Jamin's
ask); (2) then Aurik rebuilds the Gemini path as one call per scan (barcode scan: digits as text, no image;
photo scan: the image), product, prices, reviews and price math out, nothing priced from Shin's own data, everything recorded.

---

## Active, set by him 2026-09-11 evening: the beta build plan, code done by Sunday night

**His words:** *"build a plan to build all of the items listed that are not assigned to aurik.
when the plan is done and auriks work is in, the app should be ready to beta test."* The plan
is `docs/the-beta-build-plan.md`: 46 items, the steps under each, eight lanes on disjoint
packages, a thirteen-line exit checked on a phone or on the Mac, and his ten day-0 inputs with
a default for each. Decisions of the day are in `docs/decisions.md` (six-person store-track
beta, a stored scan rating).
The server for the beta runs on his Mac through a Cloudflare tunnel on the domain he already
holds there. Nothing waits on a reply: every input has a default, and the beta starts the day
both store accounts clear.

---

## Top priority, set by him 2026-09-11: prices with every product, cheaper model calls, competitors

**His words:** *"mark these as the highest priority to do right now: Expand our product catalogue
by finidng all possible methods to gain more infomation(product and price catalogue come hand in
hand, knowing the product without the price is meaningless), figuring out the most efficient and
effective way to operate the llms. How can we prompt to ensure efficiency with credit and effective answers. And
Among all of this, we should aggresively resesarch everythign about what competitors do and how
they do that and take the best parts."*

**P3, study competitors and take what works.** Enumerate, never sample: every app that tells a
shopper a price, or identifies a product from a photo or barcode, by class (flyer aggregators,
price trackers and history, scan-and-verdict apps, resale comps, cashback and coupon apps,
retailer apps, visual search). For each: where its product and price data comes from, how it
identifies a product, which models it runs and what it charges, and the one part worth taking.
No single competitor study exists; the word
appears scattered across 17 files, with `research/2026-09-03-research-memo.md` the fullest.
Every claim carries a source (the product's page, store listing, job posting, engineering blog);
anything else goes in as unknown.
## The 74% is mostly NOT the model reading photos, and the eval is now blocked on the key, 2026-09-17

**Three lanes took the 200-photo eval apart. The headline is that "74% right" is a misleading
summary of what is wrong.** Of the 52 failures: **32 are retrieval** -- the catalogue never
surfaced the product -- **7 are the pick pass erroring**, 7 are the pick *deliberately abstaining*
(these are FAILURES, not wins -- see the correction below), 5 are the
model genuinely choosing wrong, and 1 photo was unreadable.

**Every one of the 200 expected products is in the catalogue.** All 32 cascade misses resolve under
their exact code, checked by direct query. **Loading Icecat would recover zero rows here**,
including all 20 tech rows, which are already present. This is a ranking problem, not a coverage
problem, and no new data is needed to work on it.

**The retrieval ceiling is 167 of 200 (83.5%).** recall@10 is 164 of 196 plus 3 barcode
short-circuits. 148 sits 19 below it, and fixes to ranking and to the pick compete for the SAME 19
rows -- they do not add to 32.

**The 125 to 148 improvement was entirely the pick pass, and the latency story was wrong.** On
09-15 the pick errored on 195 of 195 -- not the "43 times" this repo has been saying, including in
a doc correction written yesterday; 43 was only the rows that were also wrong. And the p50 drop
from 9,996 ms to 3,568 ms was **not a code change**: 182 of those 195 rows sit in one
9,750-10,250 ms band, which is `SHIN_MODEL_MIN_INTERVAL_MS` pacing at about five seconds times two
calls a row. An operator's environment variable, never recorded, read for two days as an
engineering result. Retrieval did not improve between those runs; recall@1 actually fell, 121 to 117.

**Both of those readings are now impossible to repeat**: `run.ts` records the pick's failure class,
status, attempts and its own latency, plus a `knobs` block naming the environment every run was
produced under.

### The run Aurik authorised could not be completed, and that is the finding

Two pilots on the free key, 18 rows, with the pick clock raised to 4,500 ms as planned:

| pilot | pacing | result |
| --- | --- | --- |
| 12 rows | none | 12 unreadable: **9 `model_rate_limited`** (569-715 ms), 3 `model_timeout` |
| 6 rows | 5,000 ms | 6 unreadable: **5 `model_rate_limited`**, 1 `model_timeout` |

**The free key is rate-limited and pacing does not fix it.** Nine of twelve calls were rejected in
under a second. Running the full 200 would have bought 200 fast rejections, so it was stopped at 18
rather than spending the quota to learn the same thing again.

This retroactively explains 09-15: its five-second pacing was not slowness, it was **what made that
run possible at all**. And it leaves the pick-timeout hypothesis untested -- the extract pass now
fails before the pick is ever reached.

**So the photo eval joins the price harness in waiting on the same thing: the paid key from Jamin.**
That ask has been outstanding since 09-15 and this is the third measurement it now blocks.

### What can still be done without it

Retrieval is 32 of the 52 failures and needs **no key at all** -- the cascade is catalogue queries
against a local database. That is the largest single bucket and the only one currently workable.

`identify/eval/zone-truth.ts` also landed, grading the price VERDICT rather than the median. It
reports honestly that the truth set is too thin: **5 cases, all of which correctly refuse to draw a
line.** Leave-one-out on two regular points leaves one offer and the D-113 guard fires, and
`navel-oranges-3lb` carries no size field at all. **One thing it did catch:** in a fenced
sensitivity pass, the lone-claim band moved a shopper across a zone boundary -- holding a $0.55 promo
shifted the median from $1.25 to $1.625 and moved the verdict from `over_your_line` to `middle`.
That is the first recorded case of the D-113 guard CHANGING a verdict rather than withholding one,
and it should be looked at before the band is treated as free.

## What "74%" counts as a win, corrected 2026-09-17

**This file said 7 abstentions were scored as correct answers. They are not, and they never were.**
`metrics.ts:233` checks `chosenCode === o.code` BEFORE it looks at the pick at all, so a row only
reaches the `pick_null` bucket by having already failed that test. All 7 are failures. The claim
that `PICK_SYSTEM` counts an abstention as a win was prose written about the pick prompt's intent,
never checked against the scorer, and it was repeated to Aurik before it was checked.

**The real leak runs the other way and is smaller: 3 rows.** Reading the predicate
`namedACatalogueRow` against all 200 rows rather than one bucket, **24** rows made no confident
claim (band `low` AND `pickedCode` null) -- not 7. Twenty of those are wrong and sit under
`cascade_miss`; one is the unreadable row; and **three** have a `chosenCode` that happens to equal
the true code (`06746102`, `0041390001055`, `0055653688006`) and are counted inside the 148.
Whether that is a leak or a correct answer is a real question, not a bug: Shin did display the
right product. It only reads as a leak if "correct" is defined as a CONFIDENT naming.

**Four candidate definitions of the number, each computed against `results/2026-09-16.json`:**

| definition | 09-16 score | what 90% needs |
| --- | --- | --- |
| (a) today's headline, top1/rowsRun | **148/200, 74.0%** | 180/200 |
| (b) strict: correct NAMED row, hedges are failures | **145/200, 72.5%** | 180/200, a 35-row gap |
| (c) shopper-facing, incl. the 20 negatives | **not computable** | 198/220 |
| (d) false-claim rate, (200 - 31)/200 | **169/200, 84.5%** | false claims 31 -> 20 |

(c) is unmeasurable because `negative.scored` is 0: the 20 produce rows have no photos, and
`metrics.ts:319-355` counts a pending row as nothing rather than as a trial. Bounded, it is 67.3%
(0/20 negatives right) to 76.4% (20/20). **Even a perfect negative set reaches only 168/220**, so
under (c) 90% needs the negative set built AND top1 at about 178/200.

**The warning that goes with (d), stated before anyone picks it.** (d) counts an honest hedge as a
non-miss, which is right from the shopper's side -- a hedge is not a lie. But it means **a system
that refuses everything scores well on it.** (d) is also the ONLY one of the four that does not
bind against the 167/200 retrieval ceiling, because a cascade miss that hedges honestly is not a
false claim. So (d) is the definition under which 90% is reachable WITHOUT the product getting
better at finding products. That is not a reason to reject it; it is the reason it must not be
adopted quietly.

**The 1 unreadable photo is genuinely unreadable**, checked by opening it: `0012009012168.jpg`,
400x270, an A&W egg sandwich crop with no packaging, brand or text in frame. Not a harness bug.
**The 20 pending rows are a grocery trip, not code** -- loose produce with no barcode, named in
`identify/eval/manifest.json` as `produce-01` to `produce-20`.

**No scoring code was changed.** Which definition is the headline is Aurik's ruling.

---

## A price source that could answer nothing was calling itself healthy, 2026-09-16

D-119. `ObservedSource` said `ok` whenever its database opened, while `prices()` matches on the
barcode -- so a row with no code is invisible to it. `price/data/prices.db` holds **ten
observations and none of them has a code**: the Walmart rows from the 2026-09-08 crawl, stopped by
the rate block before anything was joined. The source answered every query with nothing and
reported itself fine, which is verbatim the failure `sources/source.ts:26-30` warns about.

It now counts joined rows at open and refuses with a reason. Checked against the real file, not a
fixture:

> `price/data/prices.db holds 10 observations and none of them is joined to a catalogue product,
> so every lookup by barcode returns nothing`

"no rows yet" and "rows nobody joined" are deliberately two different sentences, because they have
two different fixes.

**This adds no prices, and that is the point.** Under rule 3 this source is truth-set data and
never a shopper's answer. Its value is that every measurement built on top of a silent source would
have been wrong in a way nothing would have flagged. **The joiner is still not written** and is not
claimed: joining ten rows nobody is allowed to show is motion, not progress.

spine 226 pass / 0 fail, typecheck clean.

## Rule 4: what a scan costs is recorded now, not estimated, 2026-09-16

Jamin's rule 4 is *"we will record EVERYTHING that happens when the user interacts with the app
which was asked for multiple times but never done."* What a call cost was one of the parts nobody
was keeping, and after D-117 the functions to work it out finally worked, so this closes the loop.

**Three new columns on `scan`, migration 10:** `grounded_cost_cents`, `grounded_model`,
`grounded_queries`. Written by `keepGroundedForOwner`, which already had the box and the row.

**They do NOT overwrite `model_cost_cents`,** and the distinction matters: that column holds
`estimatedCostCents`, a flat per-tier figure typed into a table and charged identically whatever the
vendor did, for the IDENTIFICATION call. These three are the grounded PRICE search, measured from
what Google reported. A scan makes both calls, and collapsing them would destroy the ability to say
which half costs what -- which is the exact question the flash-lite-versus-flash decision turns on.

**REAL and not INTEGER**, asserted by a test: one call costs 0.2238 of a cent, and an integer column
would have recorded every scan as free. That is D-117's mistake one layer down and it was designed
out rather than discovered.

**The recorded figure is a FLOOR, said here rather than found later.** `alreadyThisMonth` is passed
as 0 because this repo has no meter for how many grounded searches a month has used, and the first
5,000 are free. `grounded_queries` beside it is what a real meter would be built from.

**Not analysis of a Grounded Result**, and the argument is the one `provenanceOf` already makes for
counting searches: every figure describes OUR request and OUR bill. A token count is the size of the
envelope, never a fact about any Link or Suggestion in it. The cost columns also outlive
`grounded_json`'s two-year clock on purpose, so a cost history survives the reaper.

**D-118 fell out of building it.** `app/tsconfig.json` does not typecheck `test/`, so when
`GroundedModule` gained a fourth method, three test doubles silently stopped implementing it, the
typechecker stayed clean, and 804 tests passed -- because the caller catches, so the missing method
just wrote nulls. The stubs are fixed and the new tests assert real numbers; **adding `test/**` to
the include is the real fix and is deliberately left for its own pass**, because it would compile
about forty never-compiled files at once.

**Counted:** app 810 pass / 0 fail, identify 293 / 0, spine 223 / 0, typecheck clean in all three.
**Still never run against a live key**, so no real cost has been recorded yet -- what exists is the
path, proven on fixtures.

## What the better model would actually cost: 1.83x, and that is a fifth of a cent, 2026-09-16

**The 2.5x figure quoted earlier today was wrong** and it was the number the model decision was
about to be made on. It came from comparing the two INPUT rates. Priced properly over a realistic
call -- 2,459 input tokens for a 1568 px crop, 600 output for a whole prices-and-reviews answer:

| model | tokens, cents per call |
| --- | --- |
| `gemini-3.5-flash-lite` (today) | **0.2238** |
| `gemini-3.8-flash` | **0.4094** |

**1.83x, not 2.5x**, because input and output rates do not scale by the same factor and this mix is
mostly output. In absolute terms the upgrade costs **about a fifth of a cent per scan** in tokens,
and the search charge does not change with the model at all: it is $14 per thousand queries past a
free 5,000 a month, and one grounded price search ran four queries.

**D-117, and it is why no such figure existed before.** `app/src/model-cost.ts` was reading token
counts by names the adapter stopped sending on 2026-09-14 -- it wanted `promptTokenCount`, the
adapter emits `inputTokens`. The shapes share no field, so every grounded call would have priced as
NULL. It never showed because `tokenCostCents`, `searchCostCents` and `realCostCents` had zero
callers in the whole repo, tests included. `gemini.ts:517-528` warns about this exact failure in its
own file -- *"a failure that looks like working software"* -- and the warning did not travel one
package over. Fixed, with nine tests, including one pinning both usage shapes to the same number.

**Still not wired to production**, said plainly: the functions are correct now and nothing calls
them. `scans.ts` already has the `model_cost_cents` column to receive it, and `provenanceOf`
(`identify/src/grounded.ts:366`) is the metadata-only door built for exactly this and still without
a caller. Carrying the model id and `usage` through the grounded envelope into that door is the
remaining step, and it is queued rather than claimed.

## The zero-offer problem looks like the MODEL, not the prompt and not obscurity, 2026-09-16

Seven of ten grounded calls returned no price. The protocol in
`research/2026-09-16-grounded-yield.md` -- written and committed BEFORE the run -- named three
candidate causes: the prompt, product obscurity, and Canada. **The cause appears to be a fourth
one that protocol did not list: the model tier.**

Production runs its grounded price search on the CHEAPEST tier. `gemini-grounded.ts:1093` defaults
to `'claude-haiku-4-5'`, which `gemini.ts:141` maps to `gemini-3.5-flash-lite`.

Same prompt, same browser, same session, three products (rule 8's method, Claude in Chrome on
gemini.google.com, never the API):

| product | production API, flash-lite | web Flash-Lite | web Pro |
| --- | --- | --- | --- |
| Kraft Dinner 225 g | 1 offer, Walmart $9.97 | not run | **4 offers** |
| Tide Original 2.72 L | **0** | the literal text `1` | **2 offers** |
| Neilson 5% cream (obscure) | **0**, both ask forms | not run | **2 offers** |

**Obscurity is dead as an explanation**, and that is the conclusion this run can actually carry:
the obscure catalogue row that returned nothing under both ask forms returned Loblaws $3.50 and
No Frills $4.24 here, with the market clause still in the prompt. The clause cannot be suppressing
what it just let through. The prompt is dead too, on the same evidence -- it was identical in every
cell; only the model moved.

**It also corroborates D-113 sideways.** Pro's four Kraft offers are $2.27, $2.49, $2.99 and
$21.49-for-twelve: per 100 g, median 1.06. The API's lone $9.97 is 4.43 per 100 g, more than four
times that and outside the new 2.5x ceiling -- so the guard would have held it and the three honest
prices would have drawn the line. $9.97 was not a pack-size confusion. It was wrong, and better
prices were available to the same search on a better model.

**Hold it loosely, and the caveats are in the research note in full.** The web app is not the
grounding API; n is 3; the flash-lite `1` is one observation and may be a UI artefact; the cream
answer drifted to a "5% dairy creamer" 1 L, so it counts as "found Canadian offers" and not as a
correct identification; and nothing here measures whether any returned price is CORRECT.

**The next step is cheap and blocked on Jamin, not on work.** `SHIN_GEMINI_GROUNDED_MODEL` is
already an environment variable, so pointing it at `gemini-3.8-flash` and re-running
`identify/eval/price-truth.ts` over the seven hand-priced products would answer this at the API
instead of in a browser. That needs a paid key -- one of the two things only he can send. The trade
is roughly 2.5x the token cost per scan ($0.30/$2.50 against $0.75/$3.75 per million,
`model-cost.ts:130-133`) against a path that currently returns nothing usable on most scans.

## D-113 is closed: one price is no longer a verdict, 2026-09-16

**Aurik's ruling: both guards, not either.** Reading the code showed that was not belt-and-braces
but necessary. `isLoneClaim` measures a price against a leave-one-out median (the spine's own shape,
`spine.ts:1099-1131`), so at one offer there is nothing to be an outlier FROM and the band cannot
fire at all. The band catches the n>=2 case; the minimum-offer rule catches the n=1 case that was
the one actually measured.

**What a shopper sees now.** At one offer: the offer, the reviews and the description, and the
sentence *"Only one price found, so there is no middle to compare against."* No line, no zone word,
no percentage. At two, or where a claim was held: the line, plus a sentence saying what it rests on.
At three or more with nothing held: unchanged. The offers never disappear -- only the verdict does,
which is the reading of rule 6 this rests on and the one point to put to Jamin first.

**Ported from the engine rule 3 would retire**, and the argument for why that is allowed: a
plausibility band is not a price source. Every number still comes from Gemini's offers;
`isLoneClaim` reads only those offers, compares them only against each other, produces no price of
its own, and can do nothing but move one into a labelled list. Shin's price database and engine are
not consulted. The hold can never empty the set (`spine.ts:417`, carried across deliberately).

**Three defects were found while closing it, D-114 to D-116, and two of the three were found by
tests that already existed.** The band as specified held an honest price at two offers (a 12-pack
against a 2 L bottle is a legitimate 2.1x spread); the new confidence flag was called `'low'`, which
the grading-word ban forbids; and the ban sweep turns out to reach only five selectors, so both new
sentences were initially unswept. The full write-ups are in `DEFECTS.md`.

**Counted:** 4 source files and 4 test files changed. identify 287 pass / 0 fail, spine 223 / 0,
app 795 / 0, typecheck clean in all three. **Fifteen existing tests failed on the first run and
that was the signal, not the noise** -- thirteen of them used one offer as a minimal fixture and
were given a second at the same unit price, so no measured expectation had to be re-typed. Three
were genuinely about the old behaviour and were inverted with their old numbers preserved in a
comment, including one named *"a single offer is still a line, never a refusal"*, written by a lane
on 2026-09-15 in the commit that turned the search on, one day before anyone measured what a single
grounded offer is worth.

**NOT VERIFIED, and this is the honest limit of tonight.** Nothing here has been run against a live
Gemini key, and nothing has been seen on a phone. Rule 8 restricts the key to live phone testing, so
the guard was checked against the recorded D-113 numbers and against stubbed wire fixtures, never
against a real search. **The three screens -- one offer, two offers, three offers -- have not been
photographed, and `DEFECTS.md` records that twenty-two of the first thirty defects were found by
looking at a rendered screen.** That check is outstanding and no row should move on it until it runs.

## The price harness exists now, and it found the thing that matters most, 2026-09-16

`identify/eval/price-truth.ts`, new. The eval beside it measures whether the product was
IDENTIFIED; nothing measured whether the number under it is TRUE, which is the product. Ground truth
is `spine/data/observations.json` -- seven products priced by hand off public Canadian pages on
2026-09-03, seller by seller, in cents, promotions marked. Small and real. Nothing grounded is
written to disk: counts and medians are computed in memory and printed.

**Coverage 6/7.** Six of the seven got at least one Canadian price. **This corrects the section
below**, which read seven-of-ten with no price and drew that from a sample of obscure catalogue rows
(a Neilson creamer, an Italissima noodle, a Massimo panettone). Coverage tracks how prominent the
product is, not how the question is asked: mainstream products answer, obscure catalogue rows do
not. Both numbers are real; the earlier conclusion was drawn too wide from the narrower one.

**D-113, and it is the one to fix before a tester sees a price.** Kraft Dinner 225g came back at
**+473%**: one Walmart offer of $9.97 against a hand-priced truth of $1.74, carrying confident
metadata -- `sizeValue 225 g`, `packCount 1`, `dealKind clearance`. So it is not a pack-size mix-up
that the unit scaling would catch. It is simply wrong, and it arrived alone.

`computeGauge` took the median of one offer, which is that offer, and drew a line reading
`under_your_line` at **-83%** -- an ordinary $1.74 presented to the shopper as far below the going
rate. **Shin's own engine has guarded this since the pilot**: `LONE_CLAIM_FLOOR = 0.5` and
`LONE_CLAIM_CEILING = 2.5` reject a lone claim outside half to two-and-a-half times the going rate
(`spine/src/spine.ts:921-922`, applied at `:1130`). The grounded gauge has no floor, no ceiling and
no minimum offer count.

Not fixed tonight on purpose: the shape of the guard is a product decision -- refuse a line under N
offers, port the lone-claim band across, or both -- and it is Aurik's. **It also bears on the third
raised point:** the engine rules 3 and 6 would retire is the one that already has this guard.

Also closed: **D-112**, the eval refusing a paid key with a message telling the reader to use a paid
key. Found by doing what the message said.

Error figures elsewhere in that run (Tide +9%, oranges -8%) mix model error with thirteen days of
real price drift and cannot separate them. Coverage and the lone-offer failure do not depend on
drift, which is why they are the two to read.
## Seven of ten grounded searches came back with no price at all -- CORRECTED BELOW, the sample was skewed, 2026-09-16

Measured on Jamin's grounding key, ten real calls, no retries. This was not what was being looked
for -- the question was whether a barcode-only ask yields fewer offers than one carrying text -- and
that question turned out to be the wrong one.

| asked | offers |
| --- | --- |
| Kraft Dinner (gtin + text) | 1, Walmart |
| Coca-Cola Classic 2L | 1, Loblaws |
| Cheerios Original 570g | 2, Loblaws and Metro |
| Tide Original 2.72L | **0** |
| Neilson creamer, Massimo Pandoro, Italissima noodles -- barcode only AND gtin + text, six calls | **0** |

**The ask form is not the variable.** The three obscure catalogue rows returned zero offers whether
asked by code alone or by code plus name, so the earlier one-observation guess (barcode-only yields
no offers) is retired. What separates them is how findable the product's Canadian retail price is:
three mainstream products returned 1, 1 and 2 offers, and one mainstream product returned none.

**Identity is not the problem; price is.** The same calls that found no offers still named the
product -- *Neilson 5% Dairy Cream*, *Pandoro Panettone* -- and often carried a description. Gemini
knows what the thing is. It frequently cannot say what it costs in Canada.

**Where this lands, and it is not a small place.** Jamin's rules 3 and 6 together make Gemini the
price and retire Shin's own engine. On this sample the grounded search has no price to give seven
times in ten, and gives one or two when it does -- against a price line that wants several before it
means anything. Rule 6 is *"always an answer"*; this is the measurement that says the proposed
source cannot supply one most of the time. It is evidence for the third raised point in
`docs/decisions.md`, which until now rested on the cost of deleting 380 tests rather than on whether
the replacement works.

**Hold it loosely: n = 10**, one session, one key, no retries, arbitrary asking prices, and all ten
finished inside the 9 s timeout so nothing was cut off. It is a signal worth a real run, not a law.
The honest next step is the 200-photo eval pointed at the grounded path, which now has a key that
can run it.
## The one-call merge met Google for the first time, and it holds, 2026-09-16

Jamin sent a Gemini credential that can ground (the free key in this repo's `.env` cannot: it
answers HTTP 429 `exceeded your current quota` on a grounded search while an ungrounded image
identification on the SAME key succeeds -- one of each was run, so the two are separated and it is
grounding that has no free quota, not the key being spent).

**What was unverified until now.** Lane B merged two grounded prompts into one at 2,600 output
tokens and that number was reasoned from the added payload, never measured. A truncated answer cuts
the JSON mid-array and the whole scan returns nothing.

**It does not truncate.** A barcode lookup on `0068100084245` came back in 2,883 ms with identity
populated -- *Kraft Smooth Peanut Butter / Kraft / 1 KG* -- 3 fact rows and 4 search queries. A full
price query on a fresh device came back in 4,600 ms with an offer (Walmart, 9.97 CAD), a review, a
description and a computed verdict line, and the offer carried all eighteen fields including the
four item-rule ones (`marketplace`, `memberOnly`, `dealKind`, `organic`, `storeBrand`,
`soldByWeight`). `computeGauge` therefore ran on real grounded offers for the first time.

**One search per scan is real, not inferred.** After the barcode lookup, `lookupPrice` on the same
device returned in **1 ms** -- it collected the cached promise instead of starting a second search.
That is what rules 1 and 4 were built for, now measured against Google rather than a double.

**Latency: 2,883 and 4,600 ms.** Comfortably inside the beta's seven-second promise, and a different
world from the free key's 9,032 / 43,965 ms.

**One observation to carry, from two calls and therefore not a law.** The barcode-only lookup
returned identity and **zero offers**; the query carrying text, gtin, asking price and size returned
offers. Since the merge makes ONE answer serve both halves, a catalogue-miss scan that asks with the
code alone may hand the shopper a name and no price line. Worth a wider run before it is believed,
and worth knowing before a tester meets it.

**Not stored.** The credential was used in-process only and written nowhere: where a secret lives is
Aurik's call, and it arrived in a chat transcript, so it should be rotated once a permanent key is
placed.
## Jamin's nine rules: four built, three raised, and the search that was running twice, 2026-09-15

**State:** `main` at the five commits below, both remotes verified equal by `ls-remote`. **Tests: app
797 (792 pass, 5 skipped), identify 283, spine 223, price 157, catalogue 133; 0 fail; typecheck clean
in all five; `shin-gate.sh --all` exit 0.**

Jamin pushed 19 commits and set `docs/jamin-gemini-rules.md` above everything else in the repo. His
sweep found seven contradictions still live. **Four are built and three are raised as points**, which
is what his own file asks for when a contradiction should not be fixed. Run as five lanes on disjoint
packages, every lane's diff reviewed here and every row checked at the consumer before it moved.

**Rule 1, one call per scan.** A barcode miss was making **three** grounded calls, not the two the
plan assumed: `lookupBarcode`, a `prefetchPrice` fired inside it, and `lookupPrice`. The two request
builders are merged into one prompt returning identity, offers, reviews and description together, and
`lookupBarcode` now shares the promise the price route later awaits. **One call.** Counted by
transport invocations, not inferred. The photo path is still two and that is said plainly rather than
rounded down: one ungrounded read and one grounded search. Making it one would mean putting the image
into the grounded request, which the guard forbids and which Google has not confirmed works.

**The search was running twice on every scan, and nobody had noticed.** The prefetch is cached under
`${device}|gtin:…` or `|text:…`. The phone sent neither a device id nor a scan id on `/api/price`, so
`groundedOwner()` minted a fresh uuid per request and the key never matched. Sending the device id
alone would not have fixed it: the server keyed on brand + name, the phone sent `productLabel()`,
which drops the brand when the name already starts with it and appends the quantity. It only ever
worked by accident, when the code matched 8-14 digits and the gtin branch won. The identify routes
now echo the exact query they prefetched under and the phone returns it verbatim.

**Rule 4's plumbing.** The scan id was already on the client and was simply never put in the body.
**Verified at the consumer:** a real identify on a live server returned `scanId 24` with its
`priceQuery` echoed; a real `/api/price` carrying both wrote `verdict_tier='walk_away'`,
`verdict_confidence='low'`, `verdict_sellers=4`, read back out of `scans.db`. Those three columns have
been uniformly NULL until today. **What this turns on:** `/api/price` now writes to the scan store in
production for the first time, so `dropInterimGroundedFor`, `historyText`, `grounded_at` and the
two-year reaper all start running on real traffic; and nothing outside `migrations.ts` and `scans.ts`
names those columns, so the exposure is `SELECT *` -- every export, admin listing and summary built on
`allScans()` starts carrying three values it has only ever seen as null.

**Rule 7.** `makeProvider` threw nothing and quietly returned Claude whenever Gemini was named with no
key; Jamin's sweep found this machine's `.env` in exactly that state. It throws now, and a machine in
that state refuses to start rather than answering scans with a model nobody asked for -- driven for
real, exit 1, one sentence, normal boot still 200. An inconsistency it creates is recorded rather than
smoothed: `xai` with no key still fails at `read()` time as a `ModelCallError`, so the same category of
mistake now fails at two different phases.

**Rule 2.** zxing ran at the top of every frame and fired with no gate. A Photo | Barcode toggle now
gates it; in photo mode nothing scans for codes at all. **Walked in a browser** at 390x844 and 375x575
in both locales through the real consent gate: the toggle is 44px, exactly one middle face is ever
visible, *"Scanner le code-barres"* fits at 228px without wrapping, and nothing overflows.

**The docs.** `plan-gemini.md` §4.3 described a second Gemini call for the price maths that was
written and never wired; rule 1 has now made it unwireable. Two of its eight algorithm steps had
drifted from the code and are corrected against it.

**Two Gemini questions answered by a real call, both against me.** `resolution` on the image part is
accepted -- my `970017a` removed `media_resolution` after a 400 and concluded the field did not exist
on this surface; Jamin's spelling and placement were right. And plain lowercase JSON Schema is
accepted, so the uppercase translation I argued for was never needed. I had called it "confirmed
live"; it was not, my one call never varied it. Proof the adapter was really on the wire: pointing
`SHIN_GEMINI_BASE_URL` at a dead port turns the same row unreadable in 235 ms against 9,032 ms
answering correctly. Third latency sample: **9,032 ms**. The beta's 7-second promise is not free-tier
weather.

**Three rules raised, not built** (`docs/decisions.md`, "Three of Jamin's nine rules are raised as
points"): the grounded guard, the tier words, and Gemini as the price source. Each carries its cost
counted rather than guessed, and point 1 carries its own weakness out loud -- Shin already crosses the
*analysing* half of the same Google clause on purpose (D-111).

**Open, and Aurik's:** the barcode tap cost (0 taps before, 2 then 1 now, while a photo stays at 1 --
rule 2's own economics now point at the expensive path); whether `msSinceCameraStart` is renamed;
and that one failed search now loses the identity **and** the prices, where a failure used to leave
the name on screen. That is what rule 1 costs and it cuts against rule 6. A test pins it.

## "Do everything but fund the API key", and his two rulings, 2026-09-14 evening

**His words:** *"do everything but fund the api key."* Asked the two questions the morning left
open, he ruled: **consent is off until answered, the cell stays coarse, no exact position is
stored** (his 2026-09-13 design, over Jamin's *"collect EVERYTHING"* of the same morning), and
**pushing green work in Shin needs nobody's yes** (Jamin's rule, adopted; the gate is the
committed tree). Both are in `docs/decisions.md`; the push rule is in his global instructions too.

**Six lanes, all Opus, disjoint packages, each verified here before its commit:**
- **spine** (`c55bed1`): the produce refusal carries `whyCode: produce_no_shelf_price_source` and
  raw facts (`problemCount 3`, PLU `4011`, bananas, 1990) beside its unchanged English paragraph,
  so the last English tail on a French refusal can be rebuilt from facts. `PricePoint.limit`
  ("limit 8") is recorded shelf text, not spine prose, left alone.
- **catalogue** (`6cc4573`): D-097's producer half. Every swap carries `structuredLine` and the
  heading has a structured twin; the English is byte-identical and a test reproduces it from the
  facts for every scenario. The stray second `labelForTag` copy is gone.
- **identify/eval** (`85ed230`): D-096 closed with 20 real tech codes from the catalogue, and the
  set is **200 photos** (was 40; 4.8 MB, CC BY-SA, attributed per file). Dry run: top-1 195/200,
  recall@1 179/200, MRR 0.9255, five real cascade misses. Still a ceiling, not a score: no key.
- **app/stores** (`83e291d`): the shop shortlist asks Overpass for an allow-list of 29 retail
  `shop` values plus `amenity=pharmacy|marketplace`. Live, same cells: Hamilton 0 pharmacies and
  19 non-retail rows before, 11 pharmacies and 0 non-retail after; Montreal 0/38 before, 10/0
  after. `shop=grocery` added on one measured Montreal row.
- **Quebec French review** (read-only, OQLF and Usito cited): *fourchette*, *à peine assez*,
  *l'usagé* and *une personne* stand, with fiches; *prix saisi* becomes *prix entré*; *sur la même
  boîte* becomes *sur le même article*; and eleven more findings, the largest being *"Tu regardes
  4,99 $"* (a calque, seven renderers) becoming *"Devant toi, c'est 4,99 $"*, a raw ISO date in
  one renderer, *prix courants* vs *régulier*, and *"avec un prix dessus"*. Applied in the client
  lane below and in `voice-fr.js` by hand. One thing it found that is not French: the French
  refusal for an unreadable price tells the reader to use a *point* as the decimal while every
  French price on screen uses a comma; the pad hardcodes `.`. A pad decision, open.
- **app client lane** (`9769fc3`): the ten swap codes and the produce reason in French,
  `server.ts` passing `structuredHeading`, `swapRow` reading the structured line, and the review's
  prose.js fixes. Read off a page in `fr-CA`: *"0,44 $ par 100 g chez Fortinos, Kingston, contre
  0,80 $. Vu le 28 août 2025."* **D-097 closed.** The leaf label stays the English taxonomy word.

**Verified through a fresh server after the consent commit (`e9b577b`):** both consent switches
`aria-checked="false"` with the approved copy in both languages, `/api/consent` for a never-asked
device answers `photos false, location false`, the French verdict sheet reads *"Devant toi, c'est
4,99 $"*. **Tests: app 722, spine 223, identify 155, catalogue 133, price 157; 0 fail.** Open after
tonight: the API key (his call, not tonight); the English
leaf label under French headings; `(limit 8)` as recorded shelf text; a native French speaker's
read of the sentences the review judged rather than cited. **Later:** his word, *"fix the pad
decimal key for french"*: D-104 closed, the French pad shows `,` and `4,99 $`, the buffer and parser
unchanged; both pad hosts rendered and pressed through a fresh server.

**Late, two things his to know.** (1) The gate that printed and pushed anyway did it twice today
(D-105); it is now `~/bin/shin-gate.sh`, an exit code, build standard 7, and on its first run it
held a red push back. (2) Jamin pushed `ccbd0cc`, unfinished Gemini grounded-price code, red on
typecheck in identify and app by its own message, wired into the server, with a *good / reasonable
/ bad* gauge over search-grounded retailer prices. **Asked, Aurik ruled: revert it on main now**
(`b19ad75`); nothing is lost, and the decision row carries Jamin's position verbatim and the two
questions it lands again behind: the Gemini terms that made search-derived prices a contract kill,
and hard rule 2 on tier words. Main is green again on all five packages and both remotes match.
One flake seen on the way (D-106, a fixed port in a server test).

**The consent revert, by hand, on his ruling:** `app/src/consent.ts` and `store.js` default to
off; the consent screen's switches start off; `api.js` no longer sends `lat`/`lon`; the 2026-09-13
copy for the intro, photo and location lines is back in both languages; Jamin's footer (what is
kept is used to answer other shoppers and to train Shin) and his camera line (every scan sends a
frame to be read) stay, because they are true under either default. `server.ts`'s `locationFor`
writes null into the exact columns whatever a client sends, so an old client cannot reopen the
door; migration 8's columns stay, empty. The route tests say so now.

## The no-comparison refusal, the flavour word, and the French that was not there, 2026-09-14

**State:** `main` merged with Jamin's five pushes of the day (the pushes crossed twice; each time a
`--no-ff` merge on `main`, never a force), both remotes verified equal by `ls-remote` at `d0c2012`
after the second merge. Three more commits since, unpushed at time of writing (see the end).
**Tests: app 680, spine 212, price 157, identify 149, catalogue 123; 0 fail; typecheck clean in all
five.**

**His sentence, 2026-09-14:** *"if the item is overpriced say that it is. if there is no comparison
say that it is expensive and there is no comparison, we can offer another item for this that is
worth their money but not identical. also there should be a feature where the user can manually add
the price in and name it. this should also run if we cannot identify it."*

What ships, and the one word that does not:
- **Overpriced is said** when it is measured: the verdict path is unchanged (`walk_away` for Kraft
  Dinner at $2.99, p50 27 ms yesterday).
- **"Expensive" without a comparison does not ship.** Hard rule 2, Competition Act s.74.01(1)(b),
  and `docs/plan-always-a-price.md` section 3 all say the same thing: a tier word is a number in
  disguise and there is no number. The refusal says *no comparison, so I cannot call it*, and then
  hands over the substitute, which is the half that was always useful.
- **A priced substitute under a thin refusal** landed yesterday; today the lane finished its last
  variant, `cam_similar_failed` (six variants), for the case where the swaps lookup itself fails on a
  refusal, so the verdict sentence about "cheaper" things never appears on a sheet that judged nothing.
  A test sweeps both no-comparison keys x 2 locales x 3 personalities against the forbidden list.
- **Name it and price it** landed yesterday (`What is it? (optional)` on the pad, `label` on the
  observation), and runs on every refusal including "could not identify".

**The failure branch had never been seen in a browser, so it was rendered, and it found two things.**
Driving the text route through the real delegated handler at 390x844 with `/api/alternatives` made
to fail: the box read the right sentence in both languages. Above it the refusal still said *"Here
is something similar that has a price on it."* That is **D-101**, fixed the same hour: the promise
line carries `data-swap-promise` and `fillCheaper` removes it when the answer is empty or the call
throws. Re-rendered after: promise gone, failure sentence kept, both locales.

The second thing was worse. In `fr-CA` the refusal detail read *"Could not work out what this is.
Scan the barcode, or type the model number."* in English. **D-100:** the spine emits every sentence
as code plus facts (52 codes, all round-tripping), and `prose.js` renders **9** of them in French.
The 2026-09-13 report called item 31 done on the strength of the verdict headline. Every refusal
detail, confidence line, shortfall, basis and asking-versus-range sentence fell back to English for a
French reader. A lane is writing the 43, with a test that reads the `LineCode` union out of
`spine/src/contract.ts` and fails the moment the two sets differ.

**D-099, his Cherry Coke Zero, is built and measured on the catalogue, not on a photograph.**
The plain can `06731906` is named *Coke Zero*; the cherry one `06781901` is named
*Cherry-flavoured calorie-free cola* (`name_fr` *Coca-cola cerise*). A transcription of brand
Coca-Cola, name Coke Zero, variant Cherry matched the plain row on more tokens, and nothing treated
the flavour word as special: `pickRows` never showed the pick model `name_fr` or `generic_name`.
Three additive changes (`6376c4d`): identify refuses to settle on a leader that lacks the variant
tokens while another candidate carries them; the pick model sees the two other names; the catalogue
gains `variantAgrees` beside brand and size, and `app/server.ts` forwards the word (without that line
the catalogue half was dead at the consumer, which the lane could not see from its package).
Measured on the real 212,340 rows with brand and 355 ml pinned: without the variant, plain first
and cherry-zero fifth; with it, the cherry rows first and second; with the likelier transcription
*Coca-Cola Zero Sugar Cherry*, `06781901` first. Band stays `ambiguous` in all three, so the pick
pass runs. **Still open inside D-099:** the pick model has to tell *Cherry Coke* from
*Cherry-flavoured calorie-free cola* with no "zero" in the second name, and no photograph has been
run, because there is still no key on this machine. The shutter frame on the Mac is the test.

**What Jamin changed today that Aurik has not ruled on** (his commits `d0a1c2e`, `338ddc6`,
`3942df3`, `a5bc9c9`; read, merged, not reverted, because they are his lanes and this file is where
the disagreement goes):
1. **Consent defaults flipped to ON, including the exact position.** `app/src/consent.ts` now reads
   `EVERYTHING = { photos: true, location: true }` for a device that never answered, and `api.js`
   sends `lat`/`lon` with each scan when the toggle is on. The approved copy from 09-13 said the
   cell stays coarse, the usual-shop memory lives on the phone only, and *"Off, no location is kept
   at all."* The new copy says *"Keeps your exact position at the moment of each scan... On by
   default."* His word for it: *"build everything for collecting EVERYTHING"*. `notes/catch-up.md`
   itself says this must become privacy-by-default before public launch (Law 25). Two founders,
   two rulings on the same screen; the beta testers see Jamin's.
2. **"Pushing needs nobody's approval, either direction"** is in `CLAUDE.md` on his word. Aurik's
   standing rule in his global instructions is the opposite. Today's pushes were under Aurik's own
   "push everything", so nothing here relied on the new rule.
3. **A Notion heartbeat hook runs after every tool call in every session** (`.claude/hooks/
   notion-heartbeat.mjs`, local file only, no network) and the coordination page must be refreshed
   every 20 minutes. The page is not shared with Aurik's Notion account (fetch 404, search finds
   nothing), so this session could not comply and said so rather than pretend.
4. The catch-up's to-do for Aurik: pull; get his own invite link and the data token from Jamin
   privately (never in the repo); connect Notion once the page is shared; check the data window.

**Unpushed at time of writing:** `6376c4d` (D-099), `afa2b1f` (D-101), and the docs commit this
section rides in.

**Later the same day, after the first push.** D-100 closed (`f8346fa`): all 52 codes render in French,
`prose-coverage.test.mjs` holds the two sets equal. Reading the French sheet after that green check
found D-103, the small English words the codes never covered ("at Metro", "you", "promotional",
"$4.44 less", the disagreement line rendered raw), and D-102, a heading over an empty swaps box;
both closed in `0af801f`. D-099 got its second half (`b828b6b`): "Zero Sugar" on the can now matches
"calorie-free" and `en:diet-sodas` in the catalogue through one word-family table both sides read;
the zero can moved from rank 7 to rank 1 on the real catalogue. Six French sentences the prose lane
was least sure of, for a French speaker: *fourchette* for a price band; *À peine assez pour répondre*;
*prix saisi*; *l'usagé* for the used category; *Une personne a vu*; *sur la même boîte*.

**A lesson from this afternoon, mine.** The first push went out while `app` read 686 tests, 1 fail.
The red was a lane's in-flight `prose.js` on disk, not the committed tree, and the failing test read
only files whose committed versions were unchanged from the green run; but the guard that should have
stopped the push did not, because it printed the tally and carried on. The check that gates a push
runs on the committed tree, and a red tally stops the push, whatever its cause turns out to be.

**One more, mine, before the push:** `b828b6b` went into history without its `FAMILIES` table. Moving the
word file from `identify/` to `catalogue/` I rewrote its header paragraph with a script that cut to the
next blank comment line, and that line was inside the NEXT comment, so the table between them went
with it; every package check went red and the commit had already been made. Rebuilt from the lane's
own specification and the twelve tests that pin its words, re-measured on the real catalogue (`06781901`
rank 1 again, Cherry Coke `variantAgrees` false), committed on top. Never commit on a `;` after a check;
the check's exit code is the gate.

**Unpushed at time of writing (second batch):** `f8346fa`, `0af801f`, `b828b6b`, the docs commit, and the fix. Push follows under his "push everything and continue working", GitLab first, GitHub
only if GitLab accepts, `ls-remote` on both as the proof.

## Client-side parsing looked like a way round the wall, and is not, 2026-09-13 night

**His words:** *"look into the client side parsing route."* `research/price-sources/40-client-side-extraction.md`.

**The analogy fails on a product fact.** Karma and Honey read a DOM the user's browser already
fetched on a page the user chose to open; the operative fact is the human gesture, not where the
parser runs. Shin's shopper is in an aisle on no page at all. So client-side here means fetching
with no gesture — automation from a residential IP — and Century 21's agency line keeps the
contracting party as Shin. It changes who gets blocked, and that is the shopper.

**Store policy kills it before the law is reached.** Apple 5.2.2 requires being *"specifically
permitted ... under the service's terms of use"* with *"authorization must be provided upon
request"* — verified verbatim, and file 39 §11 already has Loblaws, Walmart Canada and Best Buy
Canada forbidding automated extraction, so there is nothing to produce. Play's Spam policy forbids a
webview of a site *"without permission"* and uses a shopping-comparison wrapper as its own example.

**Killed in the register**, with a three-part reopen condition and the explicit note that
*"it runs on the phone now"* is an argument, not an observation. The three things that would make it
fit are a product redesign, a licensing deal, and the row already killed — none of them a
client-side finding.

**One correction upstream:** file 39's Honey row is unverified and looks incomplete — a 30,000-site
index with 120 days of price history cannot be built by a content script, so the script is probably
the display surface and the index is Honey's own infrastructure.

## Gala offers Honeycrisp, and the decision D-036 waited six days for is made, 2026-09-13 night

**His words:** *"if there are gala apples Shin needs to compare prices with other gala apples in other
stores. however if there are no gala apples it can offer similar item of honey crisp apples at nearby
locations."* Two decisions when asked: a substitute is the **same leaf, then one step up and labelled**,
never a shelf; and **produce becomes the beta's test case** on the reversal condition its own rule
already carries (one city, a produce item reaching two independent reports more often than not).

**The alternatives feature already existed and was switched off** by D-036 — ginger oat cookies as a
cheaper swap for tortilla chips, both `en:whole-grains`, *"the word 'cheaper' doing the lying"*. D-068
capped shelf-sized tags and then stopped on purpose, because what counts as a substitute needed the
founder. The walk it declined to write is written: `chooseRingTag` consults only the leaf and its
parent, never a middle tag, and a test asserts the probe is never even asked about one.

**Two corrections from the live catalogue, not from argument.** 33,633 Canadian rows. 951 (2.83%) end
in a junk tag (`en:groceries`, `en:open-beauty-facts`) after the true leaf — the naive rule would have
labelled a perfect match as looser, D-036 inverted — so trailing non-kinds are stripped first. And
1,807 rows (5.4%) end in a genuine kind of 1,001–1,500 members (`en:candies` 1,104, `en:breads` 1,373,
`en:cheeses` 1,251) that the 1,000 cap treated as shelves, so every candy, bread and cheese got no swap.
`MAX_RING_TAG` is 1,500, with the boundary named: between `en:cheeses` and `en:confectioneries` (2,030).
Final rule over the live catalogue: **83.8% leaf, 5.0% parent, 11.2% none** — eligibility, not priced
swaps.

**The client owns the wording.** Every swap carries `ring`; the app labels a parent swap looser in both
locales, a swap with no `ring` is never looser, and the English looser sentence one lane put in `line`
was removed so the shopper is not told twice. The raw taxonomy id (`en:apples`) reached the badge in the
first render and is humanised (`Apples`) — matching `labelForTag` so heading and badge spell a category
one way on one sheet. Badge in the UI face at 12.5px, contrast 5.88, per FLAWS item 6: mono uppercase
stays for the measurement.

**A verification lesson that cost two wrong diagnoses, kept because it will recur.** I twice declared
the lane's CSS broken from a render whose fixture lacked the production wrapper (`<div class="cheaper"
data-cheaper>`); every rule scoped under `.cheaper` failed to match and I was measuring the old styling.
The lane's answer — *"I cannot reproduce your diagnosis; the most likely cause is your harness"* — was
right. A render fixture must carry the production wrapper or it tests a page that does not exist.

**D-097, filed before the feature was enabled so a tester does not find it:** `line` and the heading are
English server prose — *"$5.99 at Metro, seen 2026-09-12."* under a French badge. The spine's fix from
this morning (code plus facts, client renders) one package over. A contract change, not a rider.

**catalogue 88 → 113, app 604 → 628.**

## The price capture proved through the real server, both sides of the consent gate, 2026-09-13 night

The feature had been verified by source and by rendering the card; **nobody had ever posted an
observation through the running server and read it back.** Done now, against a scratch scan database
(`SHIN_SCANS` pointed at a temp file) so the real scan log was never written to.

An unresolved scan (a barcode the catalogue does not hold), then a correction carrying a price and a
shop and **no product code**, answered `{"stored":true,"observation":true,"scanId":N}`. Read back
from the database:

- **consent OFF** — `typed_price_cents: 499`, and `cell`, `store_id`, `store_name` all **null**.
- **consent ON** — `typed_price_cents: 1299`, `cell 43.26,-79.87`, `store_id node/442755688`,
  `store_name Metro`.

Which is exactly the design on both sides: the price is kept either way, because a price with no shop
is still worth recording, and the location is kept only when the shopper said it may be. The gate is
not a comment; it was watched refusing.

**Two things the attempt turned up on the way.**

The observation path fires on the scan's OWN resolution, not on what the body omits:
`const code = str(c.code) ?? scanRow?.resolved_code ?? null`. So a correction against a scan that
DID resolve takes the ordinary path and needs a seller, which is right. It also means the
observation path is reached only when identification genuinely failed.

And **the text route resolves almost anything**. `?text=qqzzxx nonexistent thing zzz` came back with
a product, resolved on the word "thing", and wrote a `resolved_code` to the scan. Not a defect on
its own — fuzzy matching is the point of that route, and the band and confidence still govern what a
shopper is shown — but it means the price-capture path will in practice be reached through barcodes
and photos rather than through typed text, and it is worth knowing before anyone concludes the
capture is rarely used.

## Working the unblocked backlog, and two things it turned up, 2026-09-13 night

**A concern I raised myself does not survive checking.** I worried the app asks the OS for location
outside the shop shortlist. Both callers are consent-gated — `main.js:91` is
`if (store.consent().location)` and `consent-actions.js` fires only when the toggle is switched ON,
which is the right moment to ask, not a leak. The brief's rule was wrong and the code is better than
the instruction. Recorded because a flag withdrawn is worth as much as a flag raised.

**D-094 proved at the consumer, both directions.** `GET /api/stores?cell=43.2537:-79.9208`, the
format this app shipped with, returns **400** — the failure every call it ever made would have hit.
The server's own grid returns **200 with three real OpenStreetMap shops**. That route had never once
answered successfully before tonight. One Overpass request, not a load test.

**And the first real answer raises a question for him.** Downtown Hamilton returned a supermarket, a
brewery and a beauty bar. The query is `nwr["shop"]` — anything tagged a shop. Defensible, since a
beauty bar sells barcoded goods, but `out center 60` means a dense area could list sixty, and the
sharper risk is the reverse: **anything not tagged `shop` is invisible**, so a Shoppers Drug Mart
mapped as `amenity=pharmacy` would simply not appear to the shopper standing in it. The "No shop"
row keeps that safe rather than wrong. Narrowing or broadening the query are opposite failure modes
and it is his call, on more than one city's worth of evidence.

**A seam test, because D-094's lesson generalises.** `app/test/wire-seam.test.mjs`: where the client
encodes and the server parses, something must run the two against each other. It reads the server's
predicates out of its own source rather than restating them, so a guard that changes shape fails
here instead of passing against a copy of a rule that no longer exists. Four tests; the price seam
holds and is now pinned.

**D-096: plan item 14b cannot be executed as written.** "Add 20 produce and 20 tech photos" reads
like an afternoon of fetching. **All 20 tech codes are absent from the catalogue and from both Open
Facts APIs** — placeholders carrying a brand, a name and a category, so nothing about the file
suggests they are invented. If photos appeared, all 20 would score as `cascade_miss` by
construction, and the new stage split would blame retrieval for a cascade that was working. The
catalogue holds 648 tech-looking rows, so the item is achievable after the products are re-selected
— a different job from the one the plan describes. The 20 produce rows are a separate matter and
not a defect: `code: null` is correct for loose produce, and they are the closest thing this eval
has to the **negative set** the stage split reported it structurally lacks.

**Every screen walked again** at 390x844 and 375x575 in French after a day of heavy change: the same
four decorative camera elements as this morning, identical in English, no page errors. The language
switch driven through the UI: en-CA to Français, live, and it survives a reload. **1,092 tests pass** (app 604, spine 212, price 157, identify 119).

## The shop a shopper is standing in, asked once instead of every time, 2026-09-13 night

**His words:** *"can we allow shin to use their location and then asses instead of them having to
input the store their in multiple times. Also Shin must be able to indentify the pattern of where
the user often goes."* His two calls when asked: the record of usual shops lives **on the phone
only**, and the cell **stays coarse** with a shortlist plus one tap rather than finer location.
Both keep the privacy screen true as written, which matters because item 6f says he approves that
wording.

**Most of it was already built and none of it worked.** `geocell.js` (item 11a) and
`app/src/stores.ts` (item 11) were both marked done. **D-094: they never agreed what a cell looks
like.** The phone wrote `"43.2537:-79.9208"` and the server's `parseCell` wanted `"43.26,-79.92"`,
so every cell ever sent parsed to `null`. `/api/stores` would have answered 400 to every request,
and the correction route dropped the cell in silence — because **a null cell and consent being
switched off are the same shape**. A broken feature and a correctly-disabled one looked identical.
Found by a lane proving the two formats against each other before writing code.

**Built:** a shortlist from the cell, the usual shop first, the last shop confirmed in a cell
preselected so the second visit is no taps at all, the chosen shop finally reaching `sellerNow()`
so corrections and observations carry a real shop. Switching location consent off wipes the device
record. **578 tests to 600.**

**D-095, and only a render could have found it.** Every row in the picker drew a tick: `rowCheck()`
emits one per row and the base stylesheet only colours it, leaving each list to hide its own — which
`you.css` does twice and the new list did not. Markup and `aria-checked` were correct on exactly one
row the whole time, so a screen reader was told the truth while the screen showed four shops chosen.
Third CSS-only defect in this file, and evidence for build standard 3 rather than a new standard:
nothing in `app/test` renders a screen.

**Why the shop matters more than the convenience:** the spine cannot compare prices across markets,
and D-081 split a seller's identity from its display name for counting. Every price a tester has
typed so far has been, in `stores.ts`'s own words, "a Canadian price with no shop on it".

**Waiting on him:** the location consent copy is still true but now incomplete — with the toggle on,
the phone keeps which shop was confirmed in each square. Wording is drafted in the lane report for
his approval; approved consent copy is not changed without him.

## The eval stops reporting one number and starts saying which stage failed, 2026-09-13 night

The eval could not tell *"the cascade never surfaced the right row"* from *"the row was there and
the pick chose wrong"*. Those have opposite fixes — one is catalogue and query, the other is prompt
and model — and both showed up as a single wrong answer, so the number could not direct any work.
`identify/eval/metrics.ts` splits them. **104 tests to 119**, typecheck clean, no pre-existing test
edited.

**It immediately found something. Cascade recall@1 is 38/40, not 40/40** — the first number this
eval has ever produced that is not perfect, and it is REAL: real catalogue, real three-query
cascades. recall@3 and recall@10 are both 40/40, so the retrieval ceiling is intact and **two rows
are being carried by the pick pass rather than by retrieval**, at cascade rank 2: `0065633132115`
General Mills Cinnamon Toast Crunch 354g, a **size-pair**, and `0055498027121` Krinos Feta 200g,
plain. Under the old single number both were invisible, because the answer still shipped correct.

That matters beyond tidiness: those two ship correct only because the pick rescues them, and in a
dry run the pick is an **oracle handed the expected code**. A real model may not rescue them. So the
40/40 end-to-end is the ceiling, not a forecast, and the runner now says so in its own output before
printing it.

**The report also prints what it cannot measure**, rather than burying it in a comment: every
manifest row is in the catalogue by construction, so there is **no negative set**, and the
false-positive rate is not low — it is unmeasured. That is precisely why the `not_in_catalogue`
branch fires zero times, which was the measured reason item 23's visual search was held.

Also added: MRR rather than mAP (one correct row per photo makes mAP the same number under a
misleading name), a **Wilson interval printed beside top-1** so nobody quotes a point estimate that
40 photos cannot support, per-bucket slicing, and two failure classes beyond the five asked for —
`size_question_override` and `pick_error` — because both are reachable branches of `identify.ts` and
calling either `pick_wrong` would send blame to the wrong stage.

One source file changed, additively: `union` in `identify/src/identify.ts` is exported rather than
copied, so recall is measured over the exact candidate list production builds.

## The CanLII survey ran, and the design rule it tested survives, 2026-09-13 night

A Gemini Deep Research run in his browser closed the gap file 37 named and could not fill: nobody
had searched CanLII. Captured to `research/price-sources/39-canadian-scraping-law.md`, 742 lines,
**with a provenance header saying plainly that it is unverified model output and a spot-check list
in priority order.** A language model citing case law is exactly the shape of thing that invents a
citation, so nothing here is evidence until somebody opens it on CanLII.

**The question that mattered is answered favourably.** "Take the string, never the image" was
written as a cautious margin around Trader v CarGurus. It turns out to be the exact line the case
draws: the infringement finding *"applied exclusively to photographs"*, and the court *"awarded no
damages and made no finding of infringement regarding the automated collection, indexing, or display
of vehicle pricing or technical specifications."* The string side was litigated and produced nothing.

Two riders: **framing is not an escape** — CarGurus argued it only hotlinked the dealers' images and
lost under s.2.4(1.1) — and **$305,064 was a reduction, not a ceiling**: the statutory minimum was
$76M across 152,532 photos and was compressed to $2 each on findings of good faith, no actual loss
and no Canadian profit, which a different defendant would not get.

**Criminal exposure: none found, now for a stated reason.** s.342.1 needs "fraudulently and without
colour of right"; an unauthenticated HTTP GET carries no deceit. Its reported use is credential
bypass, rogue insiders, spyware and DDoS.

**A price is a fact.** CCH ended sweat-of-the-brow; Tele-Direct held a mechanical listing compilation
unprotected; one extracted price is not a substantial part.

**One finding lands on an existing defect.** Circumventing bot detection or an IP block is framed as
TPM circumvention under s.41.1 — statutory damages and injunctions, not nominal contract damages.
D-049 already forbade rotating IPs and spoofing headers on engineering grounds; that now has a legal
reason under it, and a new decision records it. A 403 is an answer, never an obstacle.

**The strategic finding, and it is the uncomfortable one.** No Canadian competitor obtains prices the
way this repo has been trying to. Flipp and Reebee run **direct publisher agreements with retailers —
including Loblaws, Walmart, Metro and Canadian Tire**, the exact four this repo keeps failing to
crawl. RedFlagDeals uses affiliate networks. Karma and Honey do **client-side DOM parsing in the
shopper's own browser**, which the report reads as avoiding centralised scraping liability
altogether. The three parties that relied on unconsented scraping — Zoocasa, CarGurus, Mongohouse —
were all litigated. **That is a route question for him, not a lane.**

## Google Lens answered on law and on pipeline, and the answer is mostly no, 2026-09-13 evening

**His words:** *"research if it is possible to use google lense to search for this item without
getting into any legal problems. or if we could use its metrics and pipelines for SHIN."* Two lanes,
`research/price-sources/37-google-lens-legal-position.md` (702 lines) and
`38-lens-pipeline-and-google-data.md` (438).

**The biggest finding is not about Lens.** Grounding with Google Search is the one licensed Google
product that could answer "what does this cost", and its terms forbid what Shin does with an answer:
*"cache, frame, syndicate, resell, analyze, train on, or otherwise learn from Grounded Results"*,
with the exact attempt named as a violation, *"using Links to identify destination pages for crawling
or scraping"*. Identical wording on the Vertex side, so there is no escape. **`QUEUE.md`'s
"asking a search engine for a live price" kill now stands on contract as well as on the 2026-09-03
measurement**, and that row's reopen condition has been updated because a better measurement can no
longer satisfy it.

**The Canadian case that becomes a design rule.** Trader Corporation v CarGurus, 2017 ONSC 1841:
$305,064 in statutory damages against a scraper of product photographs, $2 an image across 152,532.
So: **take the string, never the image.** Century 21 v Rogers, 2011 BCSC 1196 confirms browse-wrap
terms bind in Canada, with the injunction as the real remedy.

**Clean, and worth saying because most of this section is negative:** plain Gemini/Vertex multimodal
calls on a cropped photo are unrestricted for this use. Cloud Vision Web Detection is fine when it
recovers a STRING and the returned URLs are never followed.

**Through the front door, there is no door.** The Merchant API price-competitiveness report returns
a GTIN-keyed cross-retailer benchmark for free, and forbids exactly Shin's product: *"Pricing data
can't be resold, publicly displayed, advertised, or aggregated across businesses."* CSS is EEA,
Switzerland and the UK, Canada excluded, and it is an ads channel rather than a feed. UCP looked like
the one live thread; **measured, twelve retailers, zero manifests, including walmart.com and
target.com which co-developed it.**

**On the pipeline: there is nothing published to copy.** Google has never released a Lens
architecture paper; the only primary description is two sentences in Encyclopedic-VQA (arXiv
2306.09224). What that does confirm is that Google never derives a price from a picture either — the
image selects an identity and the price arrives GTIN-keyed from feeds, which is already Shin's shape.
The pick pass already IS the published re-ranking stage and the cascade already IS candidate
generation.

**The one buildable idea needs no vendor, no key and no model call:** text refinement on the unsure
branch, a typed qualifier re-entering `this.#lookup` as a fourth query.

**The metric gap worth closing first, at $0:** the eval cannot distinguish "the cascade never
surfaced the row" from "the row was there and the pick chose wrong", and those have opposite fixes.
Also recorded: at n=40 an observed 90% top-1 has a 95% interval of roughly 77-97%, so **forty photos
cannot tell 85% from 95%**; 200 photos is about $3 a run against $0.60.

**Not done:** no CanLII full-text search was run, so "s.342.1 has never been applied to scraping" is
an absence of found precedent, not proven absence. A Gemini Deep Research run was started in his
browser to close that gap and was left at its plan step.

## His five items get their steps written and four of them get built, 2026-09-13

**His words:** *"LLM - model identifies the image, that model identifies the image / Look for a way
to get into google lenses. We want to search / Language translate / Account creation - these are
the things we must complete today."* Items 21, 22, 23, 31 and 44 were the five the beta plan listed
by title only, with no steps under them, because they were Aurik's. They have steps now, and five
lanes on disjoint packages built them in one pass with Fable reviewing every diff.

**First, the branch came home.** `feature/ui-polish` held `1e326c9` alone while main moved 23
commits ahead. The no-branches rule of 2026-09-07 says work lands on `main` and a conflict is
resolved there in the open, so the branch merged into main rather than the reverse. One conflict,
`NOW.md`, resolved by keeping both sides in this file's own order. All seven `feature/*` branches
are now fully contained in `main` and strand nothing.

**The mirror was 25 commits behind and the file said it could not be.** See D-088 and build
standard 5. Both hosts are at `cf06c6c`, proved by `ls-remote` on each rather than by reading a
remote out of a config.

**The key is still the gate, and a second gate was hiding under it.** Aurik chose not to add an
Anthropic or xAI key today, so items 21 and 22 are BUILT AND UNMEASURED by design, not by
oversight. Underneath that, D-089: `catalogue.db` was missing five columns `search.ts` had started
selecting, so every catalogue search on this machine was dead and **the eval could not have run
even with a funded key**. Migrated (15 -> 20 columns, 212,340 rows intact); the five values are
still NULL and populating them is item 25b, Jamin's.

**21 and 22, `identify/`.** `model.ts` no longer imports the Anthropic SDK. A neutral seam carries
the call; `providers/anthropic.ts` and `providers/xai.ts` implement it; `SHIN_MODEL_PROVIDER`
selects and defaults to `anthropic`. Five levers, all default-off, all unit-tested: usage capture,
prompt caching, per-call token caps, cheap-first escalation, provider select. The eval scores a
matrix in **cost per correct identification**, never cost per call. **66 -> 96 tests, zero existing
test files edited**, which was the acceptance bar for a behaviour-preserving refactor. The Grok
adapter has never run and its eleven wire assumptions are in its file header.

**23, `research/`.** There is no public Google Lens API. The route is Cloud Vision Web Detection at
$3.50/1,000, and it is **specified and not built**: the only seam is the catalogue-miss branch of
`IdentifyStage.fromCrop`, and on this repo's own 40-of-40 dry run that branch fires zero times.
Decision logged with a two-part falsifier so it cannot be reopened on an argument.

**31, `spine/` + `app/`.** The app is bilingual. The server was the blocker and stopped being one:
every sentence in `categories.ts` and `spine.ts` now emits a line code plus RAW facts beside the
English it already sent, additive, with **all 65 sentences asserted to round-trip byte for byte**.
The client grew `locale x variant` in `voice.js`, a separate chrome catalogue with no personality
axis, a language row on You, and `name_fr` for product display. **spine 181 -> 212, app 514 -> 546.**

**44, `docs/`.** `docs/the-store-accounts-packet.md`. **No agent can do this one** and it was never
going to be done today: enrolment needs his legal identity, ID and card, which is the boundary
`memory/lessons.md` recorded on 2026-09-12. Three things in the packet change how he does it:
TestFlight internal testers must be USERS on his developer account, not just emails; a bundle id can
be permanently burned by a TestFlight-only build, so `com.placeholder.pricecheck` must never touch
either console; and the Play internal track needs neither the data-safety form nor a finished app
setup, so the privacy work does not block getting builds to testers. Two figures in
`native/README.md` were corrected: Apple publishes no processing time, and Google's "near-instant"
describes the pre-2023 signup.

**Walked, not asserted.** Eleven screens at 390x844 and 375x575 in `fr-CA`: `lang` correct
everywhere, **zero document-level horizontal scroll on any screen at either size**. Four elements
flag wide on camera and share; the identical walk in `en-CA` flags the same four, so it is
pre-existing camera-fallback geometry and the French work introduces no layout regression.

**1,006 tests pass, 0 fail, 5 skipped** across app 541, spine 212, price 157, identify 96; four
typechecks clean. Four defects filed, D-088 to D-091, one of them earning build standard 5.

**Two of those gaps closed the same day, on his call.** Money is now written the way the reader's
language writes it — `4,99 $` in French, `$4.99` in English, from the same cents, with the digits
asserted identical across both — and the thirteen face states have screen-reader labels in both
languages instead of a raw English id. **D-092 came out of the second one:** the label was
localised where the face is DRAWN and not where it CHANGES, so a French screen reader reverted to
"Shin: walk" on every verdict. The markup was right and the running app was wrong. Found by
reading `aria-label` off a real page in a browser; invisible to the unit tests, the eleven-screen
French walk, and the typecheck, all of which were green. The test that now guards it asserts the
render path and the update path AGREE, which is the shape of the defect rather than the instance.

**D-090 also closed**, negative-tested both ways: `eval/` is in the typecheck include and
`identify/test/eval-run.test.ts` imports the runner, so a syntax error in the script that chooses
the model tiers now fails `npm test` at 1 fail where the same break previously left 96 pass.

**D-093, found by asking where ELSE a language had been baked in.** The 39 committed face SVGs
rooted an English `aria-label` into every file. They never reached a shopper, because nothing
links them, but they sit under `public/` so the server serves them and the wrapper bundles them.
They now carry identity (`data-who`, `data-state`, a `title` of the two identifiers AVATAR.md
defines as the artist interface) and no language; the accessible NAME belongs to the embedder,
which looks it up in both languages. The existing test compared each file to the module byte for
byte and would have passed just as happily with both sides wrong, and did — so the new guard
reads the BYTES ON DISK.

**Two occurrences of one shape in one day earns build standard 6:** a language is looked up where
the reader is, never baked in where the thing is made. The test that catches it is not "the label
is right" — it is that the render path and the update path AGREE, and for a generated file, the
bytes rather than the generator.

**Still not done, and named rather than hidden:** every number about model cost and accuracy,
because there is no key; the Grok adapter, never executed; and the French register wants a human
speaker's read, starting with `Gardés` for Saved, which appears in eighteen keys plus the nav bar.

## The last four screens brought up to standard, and the doc that was lying about colour, 2026-09-11

**Every screen has now been walked and measured.** Three lanes on disjoint files, every claim
checked at the consumer before it moved a row. Four defects filed, one build standard earned, and
two of the four were found by recomputing a lane's own report rather than by reading the screen.

**The two sheets on the camera.** The candidate picker was eight separate cards with gaps and read
as eight objects; it is one grouped card now, `raised` rather than `surface` because it sits on a
sheet that is already `surface`, rows 56px, divider inset 16. Its footnote was a line of mono caps
across the glass and is now a sentence in the UI face. The price pad: Clear and Skip align to the
sheet's own gutter, Clear is inert until there is a digit, the amount, the modifier pills and the
keypad are one block at 16 and 20, and the disabled confirm key is visible at 38 percent instead of
being the same colour as an ordinary key. All of it resets at short viewport so the pad cannot grow
there, which is a regression this repo has already fixed twice.

**The three lists.** Saved, Past scans and Recently removed were a row card, a gap, then a separate
box holding an x, so every item read as two objects. One card per list now, the remove control
inside the row at 44x44 with no box of its own, divider inset 16. Recently removed loses about 40px
a row. The permanent delete stays a second tap and now says so in its accessible name as well as
its colour, because the visible word was the only thing carrying it.

**Two faces on one screen, on Recently removed.** With the list empty the header said "Kept for 30
days" with a face and the empty state said "Nothing removed" with another. The retention line is a
fact about rows, so it appears when there are rows. All three empty lists now render the same
thing: `asleep` at 96px, centred, breathing.

**The share card, which is the channel.** It drew a tier FILL colour as small text on `surface`.
Measured: dark fails on walk at 3.25 and unknown at 3.09, and LIGHT fails on the other two instead,
good at 3.42 and fair at 3.39, so checking one theme proved nothing. It uses `-bright` now, 6.26 to
7.80. The sticky footer was also covering the bottom 36px of the card, which is the row carrying
both prices, and the header drew Shin at 220px above a 270px card while repeating the card's own
sentence. The face is gone, the card is the subject, the primary action is a filled pill again, and
the page fits exactly at 390x844 and at 375x575.

**The correction screen said "This screen never scrolls" and overflowed by 170px at 375x575.** The
claim is deleted, the measurement is in its place, and a short-viewport block at the same 640px
breakpoint the camera already uses drops the face and compresses the pad: overflow 48px and the
Save button now lands above the fold at 553 on a 575 tall screen.

**The document was lying about colour, and that is the important one.** `DESIGN.md` opens by
declaring itself the source for colour. Ten of its eleven two-theme rows disagreed with
`tokens.css`, having drifted through two palette passes. A lane read `--ink-faint` out of that
table, reported it failing contrast everywhere, changed two lines and filed a third as a defect;
every number was stale and the token had cleared 4.5 since the day it was fixed. Section 1 no
longer states a value. It owns what each token is FOR, `tokens.css` owns what each token IS, and
`app/test/design-doc.test.mjs` fails if a hex literal returns to the document. Negative-tested: it
names the line and the value.

**A test was green on the wrong button.** `sheet.test.mjs` asserted the confirm key's disabled
state with a substring search over the whole sheet. The pad grew a second disableable control and
from that moment the assertion was satisfied by Clear and said nothing about the confirm key. It
would have stayed green with the key wrongly pressable. Scoped to the named button, both controls
asserted, negative-tested against markup where confirm is enabled.

**Verified at the consumer, not from a lane report:** app 415 pass, 0 fail, 5 skipped, typecheck
clean. Every screen walked at 390x844, the short ones re-measured at 375x575, light theme checked
on You and Saved, computed styles compared across three screens for the button defect. The three
lanes could not see a screen; every visual claim here was measured by the boss afterwards.

**Not done.** The mascot art itself, which is the founders' asset and a conversation rather than a
lane. Two voice lines where Shin pre-refuses a choice the shopper has not made (`cam_candidate_none`
and `cam_notthis_keep`). `.btn` supplies a transition that bare `.cta` does not, so a shell comment
claiming otherwise is wrong. USAGE.md still records that correct and share should be detents of the
verdict sheet rather than routes. Nothing is committed.

---

## The camera's standard applied outward: one bar everywhere, grouped lists, the caption under the frame, 2026-09-10

**The finding this closes is FLAWS.md's own opening verdict**, that the camera surface was
designed and everything behind it ran on defaults. Aurik said the design was not good and the
walk agreed: the wordmark and Shin's bubble fought for the top of the viewfinder, the pages ended
in a lone shutter with no bar under it, You's last line ran beneath that shutter, and the
settings were a stack of grey boxes. Direction came from eleven references (Open Food Facts,
vaul, Apple sheets, Material 3 navigation bar, inset grouped lists, Snap Camera Kit, Duolingo's
empty states) distilled to ten rules with numbers; the camera and the sheets were kept.

**Camera.** Chrome lives in two bands and the centre stays clear. Shin's caption sits under the
frame, centred, 14px above the bar, face at 36px. Reticle 216px, brackets 30 at 2.5px, and the
feed outside it a quarter darker at idle. The bar's two targets carry labels (Saved, You) with a
pill on press, on a gradient band. Sheets rise on cubic-bezier(.32,.72,0,1) over 420ms with a
24px grabber hit area. Walked at 390 x 844 and 375 x 575 with Playwright: no overlap either way.

**Pages.** Every page ends in the same three-target bar (`app/public/js/lib/pagebar.js`, 84px
plus safe area, active item marked) so Saved to You no longer routes through the camera; sub-pages
get a 44px back chevron. Lists are inset grouped cards with 52px rows, an inset hairline and a
chevron or a tick; the attitude picker, the market picker, You's settings and stats, Saved's two
rows and the licence sources all use it. The 40px coverage numerals are rows now. Section headings
are sentence case in the UI face; mono uppercase stays reserved for a measurement (FLAWS item 6
wins). Light theme checked on You and Saved.

**Docs moved with it**: DESIGN.md section 4 and the motion table, AVATAR.md rows 7 and 11 and the
`idle` line, and the index.html comment that said there was no tab bar.

**app 413 pass, 5 skipped, typecheck clean** on the finished tree, before the incident below.

**Incident, same session, not the app's fault.** A scratch worktree of main was made for
before/after screenshots with its dependency folders junctioned into this tree; deleting it
followed the junctions and emptied `app`, `catalogue`, `identify` and `spine` dependencies. All
four reinstalled from their lockfiles; the embedding model cache under catalogue was re-fetched.
Nothing tracked by git was touched. The lesson is recorded outside this repo.

**Not done:** the mascot itself, which Aurik named as weak and which is the founders' committed
asset, so it is a conversation, not a lane. Past scans rows keep their old two-box shape (row plus
a separate remove button); the grouped-list treatment there is a follow-up. Nothing is committed.

---

## A seller has an identity and a name, the brand prints once, and one floor is written but unfired, 2026-09-10

**D-081 closed with the second field the row asked for.** `PricePoint.sellerId` is the identity
for counting and `seller` stays the name for display and matching; two branches of one chain
count as two and both still drop out when the shopper types the chain. Fixture-only until the
live `prices.db` grows a `store_osm` column. The client-side count on the going-rate card keys
the same way. spine 168 pass.

**D-014 closed.** The brand printed twice because the brand-in-name check compared raw strings
across a scraped name's casing; it folds case and accents now, and the photo and typed candidate
lists share one row helper. The model-down refusal says it once instead of three times.
app 413 pass, 5 skipped.

**D-028: four deny rules written, not proven.** The boss fired one live and the Edit went
through, because this session runs with permissions bypassed; the row closes when a default-mode
session is refused.

**Unchanged: the model call is unmeasured**, pending the founders' meeting on the key
(`docs/the-photo-path.md` section 6). Nothing from b453086 on is pushed.

---

## The ceiling is forty of forty, the keypad fits a thumb, and the screens were walked, 2026-09-09

**D-082 was the size pin labelling instead of ranking.** `brandAgrees` / `sizeAgrees` were
computed after the slice, so a pinned size never shaped the order and the 151 g row sat outside
the ten-row union. A pin tier now sits ahead of the score in `catalogue/src/search.ts` and in
identify's union, promote-only on evidence (demoting lost two multipacks). Then the multipack
pin itself: a 4 x 100 g reading pins 400 g, because the catalogue stores the net. **Dry run 40
of 40**, all twelve size-pair rows and all four multipacks top-1. This is still the catalogue
side alone; the model has not been measured.

**D-050's keypad is closed, on the founder's go-ahead.** Every key at least 44 x 44 on both
hosts, 51 tall on the 390 x 844 target, and the short-viewport rule that had never applied
(shadowed by a later rule) now does, paid for at 375 x 575 by the avatar row, the peek gap and a
line-height, never a key. Measured by Playwright bounding boxes; not looked at by a person.

**The four photo screens were walked at 390 px with the real eye and a fake model.** Fake media
device, the real shutter, the real `handlePhotoCapture`: identity lands on the pad with the
product name; candidates show brand and size; timeout, unreadable and offline each say their
sentence in the app's voice and no raw class reached the glass; offline kept the photo in the
queue. The walk found D-083: the shutter's 420 ms stand-in timer fired regardless of the eye and
could paint the demo list over a real answer. Fixed the same session. Suites: identify 48,
catalogue 87, app 403 with 5 skipped, spine 160.

**Not done, unchanged: the model call.** Aurik set up the console and chose not to add a card
yet. When funded, the key goes in repo-root `.env` and `node identify/eval/run.ts --tier pro`
is the first real measurement, about $0.60 for forty photos. Nothing from 1e43e29 on is pushed.

---

## The photo door is open, the picture is read twice, and the first number is a ceiling, 2026-09-09

**Aurik reversed the six-systems floor: "the user must take a picture and Shin must be able to
identify. Nothing less."** Logged as "Live photo recognition is load-bearing" in
`docs/decisions.md`. The design and the lane contract are `docs/the-photo-path.md`.

**The chain runs, end to end, on this machine, with fakes.** `POST /api/identify/photo` (3 MiB
cap, PNG or JPEG by magic bytes, 30 per device per 10 minutes) → `IdentifyStage.fromCrop`,
which now transcribes the pack before naming it, tries the printed barcode as a fact, runs a
three-query catalogue cascade, and when that cannot settle it makes one more vision call that
picks from the catalogue's own ten rows → the same `Identified` shape the barcode door returns,
plus `passes`, `failure`, `candidates`. `camera.js` sends the eye's 1568 px crop it had been
holding since 2026-09-05, and each of the four answers has a screen; the capture queue has its
caller (D-026 closed). D-024 and D-047 are closed. Suites: identify 43, app 394, spine 160.

**Checked at the consumer.** A real PNG posted to the running server: 200, `failure` named, a
`kind = 'photo'` scan row; garbage 400; GET 405. That check found two things and both are
fixed: a missing key read as an outage (now a client error, never retried), and every image was
sent as PNG (now sniffed; the eval set is JPEG).

**The eval set exists: forty Open Food Facts photos, `identify/eval/`.** Six size pairs, four
store brands, four multipacks. The dry run, a fake model returning the exact reading, scores
**39 of 40 top-1 on the catalogue side alone**; the miss is a size pair and is D-082. That is
the ceiling, not a model measurement.

**Not done, and it is one thing: no `ANTHROPIC_API_KEY` on this machine.** No photo has gone
through the real model. `node identify/eval/run.ts --tier pro` is the command that produces the
first real top-1; the prompts, the 3,500 / 3,000 ms clocks and the per-scan cost are all
unmeasured until it runs. Nothing from 1c13f34 on is pushed.

---

## The branch is home, seven rows closed, and the address is still shut at thirteen hours, 2026-09-09

**`feature/ui-excellence` is folded into `main` and the no-branches rule holds again.** Fifteen
commits, twenty-nine audit fixes, the D-050..D-081 renumber; two conflicts, both by
construction, resolved from the pre-merge files. Every suite green on the merged tree before
the fast-forward.

**Seven defect rows closed on main, four lanes, each verified at its consumer.** D-061: "per
each" was a hundred times the price, staleness read the oldest number; the file's "no importer"
claim was false, `/api/price` reaches `judge()` through `thinAnswer`. D-010, D-011, D-013: the
state word was white on a pale tint (1.19, now 4.54 to 5.50, computed from the stylesheet and
locked by test), three refusal codes had no thin title, a verdict can carry its evidence.
D-018, D-019: the ring ranks instead of decorating, the Canada preference is a boost that can
fire, twins collapse before the slice. D-020: `explain` says "usually needs". D-045's row moved
to Fixed where it had been since 09-08. Suites: spine 160, price 113, catalogue 86, identify 19,
app 361 pass with 5 skipped. Tide through the running server: `fair`, low, one seller. XM5 with
the corpus's own query: `fair`. Corpus coverage unchanged at 4 of 7, so no scoreboard row.

**The probe was made and the address is still shut.** 13:47, twelve hours fifty-seven minutes
after the last challenge, retries off, one page at offset 40: challenged in 565 ms. The lockout
outlives thirteen hours; the 09-09 decision stands unreversed. One request spent.

**Not verified:** no screen was walked in a browser; every contrast ratio is computed. The
Icecat search path is covered by test only, since the local catalogue holds none of its rows.
The first catalogue CLI run fetched the e5-small weights, an unplanned network fetch, now
cached. Nothing from the merge on is pushed.

---

## The address is shut, the catalogue is local, and the photo door is one decision away, 2026-09-09

**Walmart's rate could not be measured because the address is still blocked.** Three one-page
probes at 30 s spacing (00:28, 00:48, 00:50), the second after a 20 minute idle and 47 minutes
past the last challenge, the third on a different SKU: all three challenged on page one;
sitemaps fetch fine. The lockout outlives fifty minutes. `crawl.ts --discover` now has
`--delay-ms` (refused below the 3,000 floor), `--offset` and `--stop-on-throttle`; price 105
pass. Challenge retries in `walmart.ts` re-feed the block (four requests per challenge), so they
become an env override for the next probe, which should wait hours, not minutes. **The crawl
mechanism is proven; a residential origin is not the shape for it.**

**A 212,340-row local catalogue exists on this machine for the first time.** Open Food Facts
Canada (122,349, all sold in Canada) plus Beauty, Products and Pet Food Facts; every code
distinct. The 7.86 GB parquet was downloaded twice: the first copy reached the right size and
failed Snappy decompression, the second was sha256-checked against HuggingFace's LFS etag before
anything read it. `rejoin --dry-run` against it joins 1 of the 10 Walmart rows from last night
(the one grocery item); the other nine are Icecat's territory, and Icecat still needs
`ICECAT_USER` / `ICECAT_PASSWORD`.

**The photo door is blocked on a decision, not code.** "The v1 floor is six systems"
(2026-09-03, active) cuts live photo recognition and nothing supersedes it; the lane that went to
build the route stopped at that gate. `run.ts`'s `scan()`, the `failure_class` column, the
reserved body limit and the camera's JPEG data URL are all in place (D-047). The founders decide.

**Scoreboard has its first row above baseline:** 2026-09-09, 4 of 7, 57.1% vs 28.6%. Six
commits from the night were pushed to GitLab and to the GitHub mirror (which was 70 commits
stale and is not a server-side mirror), both verified by `ls-remote`.

---

## Two things that were written and in no list, 2026-09-08

**The sold-listings adapter is registered.** `soldcomps.ts` was written, tested and reviewed, and
was not in `defaultSources()`, so nothing ever constructed it. It is the only path this system has
to a SOLD price, which `categories.ts` calls the one number that records what somebody was
actually willing to pay, and the corpus holds zero of them.

It is registered last, and that is argued rather than assumed. On the kind of number it returns it
probably belongs above eBay and Best Buy for used goods. It is last because this array's order is
trust, trust is earned by being run, and nobody has run it: `verified` is false on all three. That
reverses the day someone points it at the live endpoint with a real key. Registering it now costs
nothing and buys the thing that was actually missing: `node src/cli.ts sources` lists it as
unavailable because `SOLDCOMPS_API_KEY` is not set, which is a reportable absence instead of a
file nobody imported.

The guard that would have caught this did not exist. Five tests on the registry do now.

**And a JSON endpoint was answering with a static-file 404.** `/api/pack-version` let a missing
pack throw into the catch-all written for missing static files, so it returned
`text/plain: not found` and was indistinguishable from a mistyped URL, on every fresh checkout.
Its sibling over the same file had always named that state. It does now too.

---

## The app knows what you shop for, 2026-09-08

**Type a word two shelves share and you get the shelf you have been buying from.** "chips" is a
bag of tortilla chips to somebody whose last six scans were groceries and a laptop to somebody
whose were not. That is `catalogue/src/routing.ts`, written and tested since 2026-09-05 and called
by nothing until today.

**What it needed was one column.** The router wants the five-kind verdict for each past scan;
`category-map.ts` computes that at scan time from the product's own tags, and the scan log never
stored it. Deriving it later needs the catalogue attached, which is exactly what a phone in an
aisle does not have. `scan.category` is added with an explicit `ALTER`, because
`CREATE TABLE IF NOT EXISTS` does nothing to a table that already exists and a missing migration
would be silent: every route in the field built from an empty history, and nothing to see.

**A route guesses about the person, never about the product**, and the three rules that keep it
honest were checked through the app rather than read: a barcode is never narrowed, a grocery
shopper can still find a ThinkPad, and a narrowed answer is never reported as a confident one.
The route is on the answer too. An app that quietly narrows a search on a guess about somebody,
without being able to say it did, is the thing the priority-1 rule exists to prevent.

Walked at 390px: six grocery scans through the real typed route, then "chips", then "not this?",
whose list is grocery-only because the same route narrows that call too.

**The crawl ordering answers too, and its answer is the useful one.** `npm run what-to-price`
prints, most-scanned first, the products people asked about that nothing here can price. That
list is the gap between what the crowd wants and what this system can do, and it is what says
which seller to add next. `nextToPrice` had been able to produce it since it was written and
never had: the scan reader it takes defaults to empty, and an empty reader makes that result
empty by construction, so the module answered nothing without ever looking broken.

Running it for the first time found a fault in the report itself. `nextToPrice` returns the same
empty answer for "no prices database", "no observation table" and "nothing is due", and there is
no prices database on a fresh checkout, so the first run said every scanned product already had a
price. The report names the three apart now and refuses to compute rather than reassure.

Still uncalled of D-026's four: only the capture queue, which waits on the photo path and so on a
model key nobody has set.
## A price can be kept before the catalogue arrives, and Walmart's real rate limit is found, 2026-09-08

**An unjoined observation now carries the page's barcode, and `rejoin.ts` resolves it later.**
`observation.page_gtin` is added in place on open; `node price/src/rejoin.ts` fills `code` for
any row a catalogue can now name, idempotently. A live crawl on a machine with no catalogue wrote
10 Walmart rows with barcodes; a dry-run rejoin joined one against a stand-in catalogue offline.
price 98 pass, typecheck clean. A `lookup.ts` bug that hid a product behind a pending rejoin is
fixed (D-048).

**The finding that changes the plan: PerimeterX challenged at page 11.** The bounded live run,
one request every 4.3 s, got ten real pages and then eight challenge responses in a row. Aborted
on the rule. The 10.8-day first-party crawl is not viable at that rate from this address (D-049,
open). Next is finding the rate that is tolerated, and spending it on the SKUs `queue.ts` says
matter, not on all 217,660.

**A local subset catalogue exists for the first time.** `catalogue/data/catalogue.db` holds
89,991 rows from Open Beauty / Products / Pet Food Facts, all with distinct GTINs, built in 5.5
minutes. The Open Food Facts Canadian slice (the grocery bulk) 429'd on HuggingFace's
range-request path; the 7.8 GB parquet is being pulled once as the documented cache. Icecat, 96%
of the real catalogue, still needs `ICECAT_USER` / `ICECAT_PASSWORD`, which only the founder can
create.

---

## The vision call is hardened, and it turns out nothing calls it, 2026-09-08

**Timeout, one retry, a daily cap, and a failure class that survives into the scan log.**
`identify/src/model.ts` now wraps both Anthropic calls in an 1,800 ms clock, retries once on
429/5xx/network only, refuses past 2,000 calls a day, and throws a `ModelCallError` whose class
(`unreadable_photo`, `model_timeout`, `model_rate_limited`, `model_outage`, `model_malformed`,
`model_client_error`, `spend_cap_reached`) rides the refusal event into a new `failure_class`
column on `app/data/scans.db`. The user-facing sentence is unchanged on purpose. identify 19 pass,
spine 152 pass, app 285 pass with 5 skipped, all three typecheck clean.

**The finding that outranks the fix: the vision path has no caller.** `IdentifyStage` /
`Identifier` are reachable only from `identify/test`. The photo upload door in `app/server.ts` is
named there as not built. So the audit's "vision identification path has never been tested against
the real thing" is true for a reason it did not name: the app that ships cannot reach it yet.

**Not done:** no `ANTHROPIC_API_KEY` on this machine, so no real photo through the real API.

---

## Walmart discovery is alive: a barcode we have never priced can now be found, 2026-09-08

**The sitemap crawler that three file headers have been pointing at since 2026-09-05 exists.**
`price/src/walmart-sitemap.ts` streams Walmart's own product sitemap, the one their robots file
publishes and their robots file allows, and `node price/src/crawl.ts --discover` feeds what it
finds into the barcode confirmation and the join that were already there. Until today the price
side could only ask again about the 21 products it had already priced. It can now find products it
has never seen.

**Walked, not asserted.** robots.txt fetched live first, before anything was crawled: search still
closed, `/en/ip/<slug>/<sku>` still explicitly allowed, no crawl delay published for us. Five real
SKUs off the live first-party sitemap opened cleanly at the polite rate, all five returned the real
page with a price and a barcode, none returned the bot challenge. Re-run against a stand-in
catalogue, two of the five joined by barcode and three were kept as unjoined evidence with the
barcode written down.

**The number that decides the shape.** 1,277 ms a page measured over ten pages, plus the measured
3 second delay, is 4.28 seconds a product. Walmart's own inventory is about 217,660 products, so a
full pass is 10.8 days. Their marketplace is about 83 million, which is eleven years, so that half
is reachable only by asking for it by name and is not something a default run can wander into. The
way that comes down is choosing which products are worth opening, not crawling faster.

**What this does not yet do.** There is no catalogue database on this machine (it is 9.1 GB and not
in the repo), so the live pass could not join against the real 5.18 million rows, only against a
two row stand-in. The first real number, how many discovered Walmart products match something the
catalogue already knows, is one run away and has not been taken.
## The price judge is in production, and thin evidence stops being a blank screen, 2026-09-08

**The fix he asked for on 2026-09-05 was never connected to the app, and now it is.** `judge()` in
`price/src/verdict.ts` was rewritten that day on his correction, to answer off a single seller with
the doubt in a confidence number. It was imported by nothing but its own test. The app kept serving
a path that refused while holding prices, which is the outcome he named as the worst this app can
produce, and it did that for three days.

**Two of the pilot's five refusals were holding a seller's price the whole time.** Tide, refused
over a Walmart price because Walmart was also the shop being stood in. The WH-1000XM5, refused over
a manufacturer list price. The 2026-09-05 note in this repo said all five refusals were empty hands
and it was wrong about both of them: it was checked against the count thresholds, which had just
been removed, and never against the filter stage sitting in front of them.

**Measured through `/api/price` on the running server, not from the test suite.** Tide at $11.97
now answers "$11.97 matches the only price we have. Walmart has it at $11.97 too." with confidence low, one
seller, and the sentence "Every price we have is this same store, so this is against its own
history rather than against anybody else." The XM5 answers the same shape off its list price. POÄNG
new still refuses, because there is genuinely no price. Navel oranges still refuses, on the recorded
produce decision.

**Pilot corpus coverage moved for the first time: 2 of 7 to 4 of 7.** That number is how often the
spine will answer and it is not correctness; two of the four now rest on a single price. The
2026-09-05 finding that thresholds were never the cap still stands for thresholds. What was capping
these two was a filter, not a threshold, and not supply either.

**Found on the same pass and closed the same day.** Where the only price we hold equals the price
on the tag the band has zero width, and `judge()` called that position zero, so the first two
answers read "at the low end" over a set with no low end. That was D-045; it is resolved: a
zero-width band now compares the tag to the one number directly and says "matches the only price
we have", or "matches what every seller charges" when several sellers agree. The three refusal
codes the cascade can no longer emit were pruned from the camera screen's thin list too.

Counts on this tree, run directly: price 76 pass, spine 152 pass, app 283 pass with 5 skipped,
and app, price and spine all typecheck clean.

---

## "Not this?", and the UI branch caught up with main, 2026-09-08

**Type a name, get the wrong product, and there is now something to press.** Under the item name
on the price pad, after a typed scan that turned up more than one plausible row, a shopper can
reopen the same search and pick a different one. That is the ranked-candidate endpoint's first
caller: it has been live and unreachable since it was built.

**The gate is the part worth knowing.** The obvious one, "offer this when the search says
ambiguous", is wrong and looks right. A typed query is ambiguous by construction, because the
band scores how much of what the caller pinned the top row agrees with and text pins neither
brand nor size. Gating on it alone puts the offer under every typed scan, including the ones
where pressing it opens a list saying there was nothing else. `/api/identify` now also says how
many other rows the same search found, and both have to be true.

Walked, not asserted: typed "tortilla chips", got Santitas, pressed the offer, got the other
three with the Santitas row dropped, picked Tostitos and landed on a fresh pad for it. No console
output at all through the route. Contrast measured on the rendered control in both themes.

**The branch also merged main**, which was five conflicts and none of them textual: both sides had
fixed the request-body cap and both had touched the camera's failure path. What that surfaced is
the useful part. Main's scan-log block predates this branch's rule that no screen writes a
sentence Shin says, so five of its lines were inline; they are keys with three personalities now.
Both branches had also spent the same five defect numbers on different defects, so DEFECTS.md is
renumbered with main's numbers standing.

**First 390px pass on this branch**, driven with Playwright because Chrome cannot emulate that
viewport. Nothing scrolls sideways and no text on the screens this branch touched is under its
contrast floor in either theme. What it did find is D-050: nearly every control on the price pad
is under a thumb's size, the keypad's own digits included, on the one screen this product exists
for. The new affordance was in that list and is fixed; the keypad is a layout decision and is
not.

Still open on the profile screen and the camera, unchanged by this: the photo path needs a model
key nobody has set, and D-036 says the cheaper-options ring is not safe to show anybody yet.

---

## The aisle with no signal answers now, 2026-09-07

**Point the camera at a barcode with the phone offline and it tells you what you are holding.**
122,101 grocery products come down as a 1.5 MB file the first time the app is opened and stay on
the phone. A scan asks the server first, because the server is the only one of the two that can
lead to a price; when the server cannot be reached, the phone's own copy answers with the name,
the brand and the size, and says plainly that it cannot tell you the price and why. The repair on
that screen still works: a price typed there is kept and sent when the signal comes back.

**Running that check for the first time is what mattered.** It had been written down when the pack
was built and never actually performed, and performing it found three things, one of which was
serious. The camera's barcode reader loads a piece of compiled code when the camera opens; that
piece was being served in a way the browser refuses, so it was downloaded twice every time, and
when it could not be downloaded at all the whole camera stopped for good. Not just the barcode:
the framing box, the coaching lines and the automatic shot all stopped too, and the screen kept
saying "no barcode there" while pointed straight at one. All three are fixed. The app also loads
with no signal at all now, which it never did, and that is what makes the offline pack reachable
rather than a file sitting on a phone behind an app that cannot start.

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

Still uncalled, and the next of this shape: the camera still shows a hand-written list because
the photo path needs a model key nobody has set. The offline aisle and the ranked-candidate
search have both been wired since this was written, on 2026-09-07 and 2026-09-08.

## Two bugs the walk found, and they were bigger than the feature, 2026-09-07

**The app was identifying a product by its barcode and then throwing the barcode away.** Every
scan that went through the catalogue, by code or by name, reached the judge as words only, and the
judge did the right thing with words and said it was not sure enough. Walking the typed route on
Lay's Classic, a product we hold fresh prices for under its own barcode, produced a refusal.
Fixed, and the line that caused it had a comment on it explaining why it must never happen.

**Then fixing that made things worse, and that is the second bug.** With the code restored, a
barcode we hold no prices for made the answer go from "pick the right one" to "no clue", because
identity stopped the moment a code resolved nothing. More information, worse answer, which is the
one shape the first rule of this project forbids. The words now get their own attempt when a code
comes back empty. Most catalogue codes have no prices, so without this the first fix would have
made most scans worse.

**Cheaper options is wired and it shows nothing, and that is the honest state.** Zero of the sixty
most-priced products in the store both produce a verdict and have a cheaper option, so the block
prints its one line saying so. Supply is the cap, exactly as the vision says. One thing to know
before this is ever shown to anybody: the single populated result the store can produce offers
ginger oat cookies as the cheaper option for tortilla chips, because the swap is drawn on one
shared category tag. The price, the shop and the date on that row are true; the word cheaper is
the part that lies, because it implies "instead of this".

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
words.

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
packages typecheck and 133 tests pass. The app was live against the real 5,182,591 row catalogue
on that date: a barcode answered in 1 ms, a text search in 22 ms.

> **Not true on this machine as of 2026-09-07, and read this before trusting any number below.**
> `catalogue/data/` is gitignored, at 9.1 GB with one file of 7.4 GB, and a git worktree does not
> carry ignored files. There is no catalogue database anywhere on this laptop: searched by name
> and by size across the whole drive. Every running server answers `catalogueUp: false, "unable
> to open database file"`.
>
> What that means for anything demonstrated here: **the app is answering off the seven-item hand
> pricing corpus, not off five million rows.** Identities come back `resolvedBy: "recorded"`. A
> walk of the app looks exactly the same either way, which is precisely why this is worth writing
> down rather than rediscovering.
>
> Restoring it means re-fetching 9.1 GB and re-embedding, or pointing `SHIN_CATALOGUE` at a copy.
> Any work on search ranking is blocked until then, because the evidence it would need cannot be
> produced.

**The barcode reader works, and this is the first time anyone has shown that.** Same day, and it
matters because `app/public/js/eye.js` is a build artifact, is gitignored, and is therefore absent
from a fresh worktree: the camera falls back to a plain video element and nothing on screen says
so. Every walk of this app before 2026-09-07 evening ran with no reader and no framing pass.

Rebuilt with `node app/scripts/build-eye.mjs`, which is wired into no npm script. Then an EAN-13
for Kraft Dinner, `0060383689247`, was drawn to a canvas, fed to the app's own `<video>` as a
MediaStream, and the app left alone to do the rest. It fired `onBarcode` with no shutter press,
drew its frame marks on the code, and requested **`/api/identify?gtin=0060383689247`**: the exact
thirteen digits, decoded off a live stream by zxing.

It then fell through to the stand-in candidate list, because identify has no catalogue to answer
from. **So the whole barcode path is built and correct, and the one thing standing between it and
a working scan is the missing file above.** That is the strongest argument for restoring the
catalogue being the highest-leverage thing available: it does not unblock one defect, it turns on
the product's primary input.

Two faults were found and fixed on the way, both invisible until the reader actually ran: `.wasm`
was served as `application/octet-stream`, so `WebAssembly.compileStreaming` refused it and the
loader silently fell back to buffering a 1.1 MB module and compiling from an ArrayBuffer; and the
trained detector swallowed every failure into one silent `false`.

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
