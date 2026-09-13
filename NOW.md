# NOW, the one thing being worked on

*One screen. If any other doc disagrees about the current state, this file wins. State, not
narrative.*

---

## Active, set by him 2026-09-11 evening: the beta build plan, code done by Sunday night

**His words:** *"build a plan to build all of the items listed that are not assigned to aurik.
when the plan is done and auriks work is in, the app should be ready to beta test."* The plan
is `docs/the-beta-build-plan.md`: 46 items, the steps under each, eight lanes on disjoint
packages, a thirteen-line exit checked on a phone or on the Mac, and his ten day-0 inputs with
a default for each. Decisions of the day are in `docs/decisions.md` (six-person store-track
beta, review scores only through official APIs, a stored scan rating). The three priorities
below fold into it: P1 is items 15 to 18 and 34, P2 is items 13, 14 and 20, P3 is item 36.
The server for the beta runs on his Mac through a Cloudflare tunnel on the domain he already
holds there. Nothing waits on a reply: every input has a default, and the beta starts the day
both store accounts clear.

---

## Top priority, set by him 2026-09-11: prices with every product, cheaper model calls, competitors

**His words:** *"mark these as the highest priority to do right now: Expand our product catalogue
by finidng all possible methods to gain more infomation(product and price catalogue come hand in
hand, knowing the product without the price is meaningless), figuring out the most efficient and
effective way to operate the llms. Can we use multiple llms like grok and claude together since
grok is cheaper? How can we prompt to ensure efficiency with credit and effective answers. And
Among all of this, we should aggresively resesarch everythign about what competitors do and how
they do that and take the best parts."*

These three sit above every band in `QUEUE.md` (rows P1 to P3) and above every entry below. What
each starts from, so nothing is looked up twice:

**P1, grow the catalogue, counted by price, not by rows.** A product with no price is not
coverage, so the number this moves is products holding a current price from two sellers (the
verdict floor in decision 31), never catalogue rows. Today: 211,846 identity rows plus Icecat
(`docs/catalogues.md`); Walmart discovery through its own sitemap, about 217,660 products at 4.28 s
each and rate-blocked as of 2026-09-09; Open Prices joins at 86% but holds 487 Canadian products;
the Canadian Tire adapter; Best Buy and SoldComps adapters written and never run (`QUEUE.md` 1.4,
1.4b). Method: enumerate every source class before picking one (retailer sitemaps and embedded
page data, official and affiliate feeds, flyer data, open datasets, paid feeds, crowd reports,
receipts), and record each with its Canadian product-and-price coverage and its cost per thousand
lookups. Two methods are already killed with stated reopen conditions (direct page scraping,
search-engine prices; closed register in `QUEUE.md`); they reopen only on the observation each
row names, never on an argument.

**P2, run the models for less without worse answers.** Today: Haiku 4.5 on basic, Sonnet 5 on pro
and on the pick-from-ten call (`identify/src/model.ts`), and none of it measured, because no photo
has gone through a real model. The Grok question has one honest answer path: the forty-photo eval
set (`identify/eval/`) run through each candidate, scored as cost per correct identification, not
cost per call; a cheaper model that is wrong more often can cost more per right answer. Whether
Grok is cheaper, and whether it reads a pack photo as well, is unknown until that runs; it needs an
Anthropic key and an xAI key. Levers to test in the same run: caching the fixed instructions, the
crop size (1568 px is 2,459 image tokens), cheap-first with escalation only on low confidence, and
output length. Second scope, same question: what the build sessions themselves spend, already
governed by the boss-and-lanes rule in `CLAUDE.md`.

**P3, study competitors and take what works.** Enumerate, never sample: every app that tells a
shopper a price, or identifies a product from a photo or barcode, by class (flyer aggregators,
price trackers and history, scan-and-verdict apps, resale comps, cashback and coupon apps,
retailer apps, visual search). For each: where its product and price data comes from, how it
identifies a product, which models it runs and what it charges, and the one part worth taking.
The data-source column feeds P1 and goes first. No single competitor study exists; the word
appears scattered across 17 files, with `research/2026-09-03-research-memo.md` the fullest.
Every claim carries a source (the product's page, store listing, job posting, engineering blog);
anything else goes in as unknown.
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
