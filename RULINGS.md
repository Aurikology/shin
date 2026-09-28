# RULINGS: Shin's current rulings
This file outranks every other file in the repo, including docs/jamin-gemini-rules.md and the Google Doc "Shin Full Walkthrough" (docs/decisions.md, "One list of current rulings outranks every other file").
To change an entry: rewrite it here, move the old text to docs/decisions.md, then run node scripts/checks.mjs.
Process rows (git, commits, claiming, lanes, hooks, comms channel) live in CLAUDE.md, not here; one entry per live ruling below.
## Scanning and Gemini
### Catalogue first; Claude, with no web search, is the capped price-range fallback
Shin names a product from its own catalogue: a barcode by lookup; anything else by reading every
piece of text on the object (price tag, cereal box, container) and searching the catalogue with it,
returning the top 3 for the shopper to pick, never one row forced out of millions; manual entry
when nothing matches. The price range comes from Shin's own data by math: the product's own
prices, else a prediction through its categories (see "How Shin predicts a price it has not
seen"). When that gives nothing, Claude is asked for a typical price range from its own knowledge,
with no web search, capped per month, to save credits, and every answer is saved as data. Gemini is not
used in this version, for identity or price. Every new feature is planned without Gemini. The beta
keeps today's Gemini behaviour until one setting flips, which both founders decide; the code behind
it is Aurik's. Jamin's half is given: flip it on now, with the Gemini range ask capped to 0 until
the Claude one is built (2026-09-28, *"do 3 and 4"*, 3 being confirm scanned barcodes show Shin's
own prices, 4 being flip catalogue-first on); Aurik's is not yet recorded. · 2026-09-28 · Jamin: *"this is probably the 10th time saying this, we are not using gemini, we are using claude for a typical range without having it search the web, this way we save a lot of credits"* · 2026-09-27 · Jamin: *"why do you still think we use gemini, even after all the work done yesturday"* (09-26: *"there seems to be a communication problem, why are you still thinking about gemini"*); Aurik: *"THAT IS THE PLAN WE WILL FOLLOW, WE ARE SHIFTING SHIN AND THAT IS THE MOST RECENT PLAN"* · log: docs/decisions.md#Catalogue first, Gemini a capped fallback
Retired wording: `no catalogue-first free path`, `The server calls Gemini for identity`, `Gemini is still called on every scan`, `catalogue-pick identify pipeline is retired`, `Gemini is only a monthly-capped`
Governs: to fill (the one setting Aurik's session is adding)
### Gemini switch and call architecture
Gemini replaced Claude (measured: 7/7 price requests refused, 9/30 barcodes absent, Claude
refusing 4/15 photos on Jamin's phone). That swap covers the running beta only: once the
catalogue-first setting flips, Gemini is not used and Claude, with no web search, is the price-range
fallback (catalogue-first ruling, 2026-09-28). While Gemini is called, it is one call, never split. · 2026-09-14 · *"we will be swithcing to gemini... Shin will adopt this"* · log: docs/decisions.md#Gemini for identification, and grounded prices display-only
Retired wording: `Claude for product identification`, `two Gemini calls per scan`
Governs: identify/src/model.ts, identify/src/providers/gemini-scan.ts, SHIN_MODEL_PROVIDER
### Default Gemini model is gemini-3.8-flash
Drifted three times: cheap-first tiering (3.5-flash-lite, escalate to 3.8-flash on doubt,
2026-09-14) → gemini-2.5-flash flat default "for now" (2026-09-18) → both tested side by side, 3.x
to replace 2.5 only if testing said so (2026-09-19). 2.5 also can't combine a response schema with
Google Search, forcing a prompt-text JSON parse. On 2026-09-22 Jamin found "gemini 2.5 is not
accessible" on the beta server, so code now sends every scan to 3.x by default
(`DEFAULT_GEMINI_3='gemini-3.8-flash'`). The per-device `SHIN_GEMINI_SPLIT=1` hash split this
ruling introduced as an escape hatch was itself removed 2026-09-27 as dead code: it never ran
outside tests, because the thing it would have turned back on (Gemini 2.5 access) never came
back. Flagged in the 2026-09-27 decisions.md entry as one of two places the log had drifted from
the running system. Any cost or pricing projection (per-user, per-scan, or free-tier math) must
assume Gemini 2.5 stays unavailable, never re-derive or re-guess it: a session on either machine
carries forward a fact the other one already established instead of re-deriving it from scratch. ·
2026-09-22 · *"gemini 2.5 is not accessible"* (same day: *"you should knwo based on the mac that
gemini 2.5 is not accessible"*) · log: identify/src/providers/gemini-scan.ts:74-87 (quote at line 75; docs/decisions.md#One list of current rulings outranks every other file)
Retired wording: `gemini-2.5-flash as the flat default`, `Gemini 2.5 by default`, `SHIN_GEMINI_MODEL=gemini-2.5-flash`, `default decided only by an offline test`
Governs: SHIN_GEMINI_MODEL, SHIN_GEMINI_MODEL_3 (the family-comparison eval tools this paragraph also names are eval/, not live code, and outside settings/src/index.ts on purpose)
### Barcode plumbing: digits only, through Shin's server
A barcode scan sends Gemini only the digits, never the image or a full photo (the frame is taken
only when photo identification and photo consent are both on, which is never under tester-launch
settings). The digits do go through Shin's server after all, since a phone cannot hold the Gemini
key safely: this reverses the 2026-09-16/17 line that the barcode would bypass the server; the
server also runs a zero-padded retry against cache and Open Food Facts before ever calling Gemini,
so exactly one canonical digit string reaches the model. · 2026-09-23 · *"Fix the barcode full photo"* · log: docs/decisions.md#A barcode scan sends no photo
Retired wording: `barcode will not be sent to shins servers as of now`
Governs: app/server.ts, identify/src/providers/gemini-scan.ts
### Verifying Gemini never means calling it twice
A single ungrounded AI read is never trusted by calling the model again; agreement is checked by
scanning multiple camera frames instead. Shin's own price range is computed by math from its own
data (catalogue-first ruling above). A hidden background check may recompute Gemini's math, and a mismatch
marks that scan (image/digits plus the exact prompt) for later review, never shown to the user; a
page-fetch verifier extends the same idea: it fetches only an allowlisted host, only a URL the
grounded search itself returned, and records agreement or mismatch without changing what the user
sees. No new mechanism is built whose purpose is to find out whether an answer is wrong; effort
goes to getting answers right (Jamin 2026-09-20). The hidden checks above stay as built and are not
extended. · 2026-09-19, 2026-09-20 · *"there can be measures in place but definitely not calling the ai a second time"*; *"You keep trying to put things in place that find out if the answer is wrong. To me, thats not important at all and to the user, that provides them no value. We need to figure out how to GET more accurate answers"* · log: docs/decisions.md#Nine rulings so the competitor-survey build could start (item 3)
Retired wording: none
Governs: app/server.ts (checkMath), allowlist config, to fill
### Caching and cancellation
A cached Gemini answer is Gemini's own answer, not Shin's price: identity caches with no expiry,
price caches six hours with a background refresh past one hour, and a recalled price always
carries the timestamp of the call that actually produced it. Grounding is skipped only when the
whole answer came from cache or the scan has no searchable identity at all, never because of
Shin's own catalogue. A scene change may cancel a request before it is sent, but never hides an
answer once the one permitted call has been spent. · 2026-09-21 · log: docs/decisions.md#Nine rulings so the competitor-survey build could start (item 1 addendum, pinned 2026-09-21)
Retired wording: `0.68 US cents a call`
Governs: cache key = barcode + market + currency, SHIN_REPEAT_CACHE, app/test/repeat-cache.test.ts
### Founder's words outrank the system and any provider's terms
Claude's role inside Shin is the catalogue-first price-range fallback, asked with no web search
(2026-09-28, reversing the 2026-09-17 exclusion of Claude); nothing holds higher precedence than the
founder's words, not the system's own machinery and not Gemini's terms: breaking a term should
never crash the system, and legal issues with Gemini are marked as an issue, never used to block a
feature from functioning. Left open and unresolved: Jamin flagged that Claude's own research on
what Gemini's Grounded Results terms forbid (reinterpretation, tone change, training, cataloguing)
contradicts Gemini's own published research on what is actually allowed; nobody has re-checked
this against the terms' real wording. · 2026-09-17 · *"nothing should hold higher precedency than the words of the founder"* · log: docs/walkthrough/jamin-notes-2026-09-17.md#notes-typed-into-the-tabs
Retired wording: `Claude fallback behind Gemini`, `Claude is never used inside Shin`
Governs: to fill (see his-call.md item 1)
### Gemini's Grounded Results carry real contract limits
Grounded Results (the `google_search` tool on) cannot be modified, interspersed, cached, framed,
syndicated, resold, analyzed, or trained on, though up to two years' storage is allowed to
evaluate/optimize or resubmit; ungrounded Gemini output has none of these restrictions. This is
separate from Shin's own rule never to ask a search engine for a live price itself (see Catalogue
and data sources); the `Grounded<T>` opaque box (WeakMap-held payload, throwing toJSON/toString,
seal() deep-freeze) enforces it in code. · 2026-09-18 · log: identify/src/providers/gemini-grounded.ts (docs/jamin-gemini-rules.md#walkthrough-rulings-2026-09-1617-his-notes-and-comments-on-the-google-doc-walkthrough)
Retired wording: none
Governs: identify/src/providers/gemini-grounded.ts
### Parked and open Gemini questions
Google Lens means Cloud Vision Web Detection, specified but not built (catalogue-miss branch fires
zero times in a 40-photo dry run). Model choice is measured as cost per correct identification,
never per call, via a provider seam, never actually measured (no key existed at the time). The
unfinished `gemini-grounded.ts` price/gauge provider was reverted off main pending both founders
settling in writing whether it meets the Grounded Results contract and whether gauge words violate
hard rule 2. Image resolution is decided by a test not yet run; a better model identifying photos
while another searches (two calls), and a better barcode encoding for Gemini, are open questions in
the Gemini tree, not decided. That resolution test also decides cost tradeoff: a lower resolution
found cheaper may be gated to a lower Shin subscription tier. Branch testing before a paid key runs
via Claude in Chrome on gemini.google.com. · 2026-09-13/14 (2026-09-14: *"test different resolutions to determine which one produces the best returns, furthermore, consider the price, also, a lower resolution can be used for a lower tier of shin subscription"*) · log: docs/decisions.md#Google Lens means Google Cloud Vision Web Detection, and it is specified but not built; docs/decisions.md#A model call goes through a provider seam, and the measure is cost per correct identification; docs/decisions.md#The unfinished grounded-price provider comes off main until it is green and the two questions are settled; docs/decisions.md#Twelve rulings on the Gemini branch, answered together (items 1, 12); docs/the-gemini-tree.md
Retired wording: none
Governs: to fill
### LLM prompting efficiency and research approach
Reviews and descriptions are fetched in the same call as the product/price lookup, not a separate
step. A pipeline design must explicitly address how the model is prompted and how to produce
results efficiently (call cost, context reuse) as a required piece, never a gap left implicit.
Combining multiple LLMs (Grok alongside Claude, raised 2026-09-11 to cut cost) no longer applies:
Claude is now the price-range fallback, with no web search (catalogue-first ruling, 2026-09-28). Open research
questions here (prompting strategy, catalogue coverage) are tracked as living, adapting as data
comes in, rather than answered once upfront; asked how he'd build such a plan, the answer is the
approach for building it, not the plan's contents. Beta-readiness testing waits on already-
identified gaps (catalogue/price coverage, prompting strategy) being fixed first, never run against
a product already known to be incomplete there. · 2026-09-11 · *"Can we use multiple llms like grok and claude together since grok is cheaper? How can we prompt to ensure efficiency with credit and effective answers"* (*"i'm not asking you to build a plan, i want you to figure out how to build the plan"*; *"there a many things you should be doing before these. These are mostly tests on a product we know isn't ready"*) · 2026-09-12: *"reviews should be gathered alongside the api call"* · log: to fill
Retired wording: none
Governs: to fill
### Explaining how Shin works: the docs are the source, not the code
When he asks how Shin works, what the plan is, or what a shopper will see, answer from the current
documentation (RULINGS.md, NOW.md, QUEUE.md, docs/decisions.md, the latest comms messages). Do not
send agents through the app code to answer it. · 2026-09-28 · *"it shouldn't have to go through code, you can just look at the current documentation"* · *"you just need to give me a high level rundown"*
Retired wording: none
Governs: to fill
## Prices and verdicts
### A scanned barcode answers with Shin's own prices too
YES. A barcode scan's offers list now includes Shin's own collected prices, each marked as Shin's
own data, untrusted, dated. Under the beta's current settings Gemini is also called on each barcode
scan; the catalogue-first ruling replaces that when its setting flips.
This reverses the 2026-09-15 rule that the price answer never comes from Shin's own price
database, price engine or lookups, and the 2026-09-14 rule that Shin's own prices are not shown
anywhere. Typed-name search (not barcode) still only searches Shin's own catalogue; when the item is
known and its price is not, it answers with the predicted range (2026-09-28, "How Shin predicts a
price it has not seen"). Enumerated over the
whole price store, not sampled: 17,994 barcode strings, all 17,994 answered, 13,975 distinct trade
items. · 2026-09-26 · *"there seems to be a communication problem, why are you still thinking about gemini"* · log: docs/decisions.md#A scanned barcode answers with Shin's own prices too, not Gemini's alone
Retired wording: `THE PRICE SHOULD NOT COME FROM US`, `no price from Shin's own data`, `Shin's own prices are not shown anywhere`
Governs: SHIN_BARCODE_OWN_PRICES, app/test/barcode-own-prices-route.test.ts
### Always answer, never refuse for wasting time
An unchecked response beats telling the user the app doesn't know after a wait; confidence carries
the doubt instead. This reverses an earlier Claude-authored, non-human "a wrong verdict is worse
than no verdict" line. For a known name-brand item Shin has no price data on, the estimate is that
brand's average category markup, not a refusal. A specific paywall pitch he floated the same week
("pro identifies 99% of items... average $1,000/year saved") is not adopted as written: it collides
with the unmeasured-claims ban below (No savings claim ships until it is measured), which is the
one that actually shipped. · 2026-09-15 · *"Having a repsonse that is not checked is infinitly better than having the user scan something, wait 10 seconds, only to get told the app doesn't know, because that will make the user just uninstall the app"* · log: docs/jamin-gemini-rules.md#the-rules-in-jamins-words-from-2026-09-15 · 2026-09-06: *"If its a name brand that we don't have info on, we can take the average mark up for name brands and apply it to the product... on average, our pro model can correctlly identify 99% of items and find their exact price, store, your nearest good deal, ratings. On average, our pro users save 1000 dollars a year."*
Retired wording: `a wrong verdict is worse than no verdict`
Governs: to fill
### How Shin predicts a price it has not seen
Priority now is a product that always gives an answer; accuracy is deferred, not ignored. Prices
are predicted through nested categories, subcategories and deeper, split as the assistant designs:
a group whose prices vary little (apples, oranges) stays whole, one that varies a lot (wine) is
split further. Priced products inform unpriced ones, including known relationships (one product
typically costing so much less than another). Ranges start broad while data is thin and narrow as
price coverage grows. Every Claude answer a shopper's scan produces is saved to improve the server
data. Each data source carries its own confidence level, set by the assistant. Seeding may use
Jamin's Gemini Pro subscription offline (not a runtime call in the app): a long list of the items
that most affect others, asked for their price ranges. · 2026-09-28 · *"We need to provide a product that at least gives an answer"* · *"a set of products will typically have a set of price variation. An orange or an apple will probably have similar price variation. However, something like wine will have far more price variation"* · *"I have access to gemini pro and unlimited tokens on it, you can very well create a long list of items(important items that affect others) and ask it for the price ranges"*
Retired wording: none
Governs: to fill (price/src/range.ts is the first version)

### The price line speaks the shopper's own range, never Shin's opinion
Zone words name where the shelf price falls against the shopper's own set thresholds (defaults 10%
under/over), returned as neutral codes (under_your_line, middle, over_your_line), never
good/reasonable/bad against a grounded search median, which are performance-claim words barred by
hard rule 2 without measured testing. This dissolves the tension between Jamin's own "tell the
user factually good/bad" instinct and the Competition Act rule, rather than bending either.
· 2026-09-14 · *"The price line speaks the shopper's own range, never Shin's opinion"* · log: docs/decisions.md#The price line speaks the shopper's own range, never Shin's opinion
Retired wording (single words, too common to search; guarded by identify/src/gauge.ts): good, reasonable, bad, factually
Governs: identify/src/gauge.ts, four price-line ban-list tests
### Reviews: Gemini's reviews ship, shown even without a source link
Gemini's reviews win over the earlier rule that reviews show only from a licensed source with
nothing generated; a Gemini review with no source link is still shown, flagged with a heads-up
that it lacks one, never suppressed and never presented as a number Shin stands behind: full
transparency is not worth making the product worse. Where no licensed review source exists (food),
the "how good is it" signal instead comes from Open Food Facts' own fields. · 2026-09-14 · *"we don't have to push for super transparency when it makes our product worse, we just have to give a way for the user to know where our info comes from"* · log: docs/decisions.md#Gemini's reviews ship, and beta plan item 30 is amended
Retired wording: `shown only when a licensed source has a row; nothing generated`
Governs: to fill
### Judge and gauge mechanics
Where a category's own filters leave the comparison set empty, `judge()` still answers off a
single seller with doubt expressed as a confidence number, retiring three refusal reasons; a
zero-width band (one price, or sellers agreeing) compares the asking price directly to that number
rather than nonsensical "low/high end" wording. A lone claim or fewer than two offers suppresses
the verdict line entirely (both guards used together, not either). A price that fails a currency
or plausibility guard is withheld, never replaced with a substitute number: the product, verdict
and reason still show, and the suppression is recorded. Whether median is the right centralization
measure for the gauge is questioned and not decided. · 2026-09-19 · log: docs/decisions.md#D-113 is closed with a guard, and six points come out of it rather than being built
Retired wording: `at the low end`, `at the high end`
Governs: identify/src/gauge.ts (LONE_CLAIM_CEILING, LONE_CLAIM_FLOOR)
### What the price line covers
With no asking price, Shin shows a neutral going-rate card instead of refusing. Nearby-cheaper and
dupe features are out of v1 (no verified store-level feed/location; category volume too thin).
Of twelve awkward item kinds specified, only four reach beta (sold by weight, store brands, deals,
member prices); marketplace/US listings stay off the price line. Background enrichment writes a
later, better answer into its own column with its own timestamp; the value the user was first shown
never changes. More generally, Shin never prints a claim it cannot back with a real feed: no "in
stock", no "cheaper 1.2 km away", nothing beyond what a chain's actual per-store feed supports.
· 2026-09-19 · log: docs/decisions.md#Nine rulings so the competitor-survey build could start (item 7) · 2026-09-05: *"Never print \"in stock\" and never print \"cheaper 1.2 km away\". You do not know either until a chain gives you a real per-store feed."*
Retired wording: `no_asking_price refusal`
Governs: to fill
## Catalogue and data sources
### Price feed sourcing: real feed, official APIs, no evasion
Shin ships a real price feed from day one, never live search for it; categories chosen for
official APIs over blocked direct-retailer fetches. Walmart's crawl dropped search() (robots.txt
disallows /search?*) for the product sitemap (~217,660 SKUs); an unjoined observation keeps the
seller's own barcode to rejoin later. Crawl rate was never measured: the residential address gets
a PerimeterX challenge outlasting 13+ hours idle; rotating addresses/spoofing headers is ruled out,
now doubly so under Copyright Act s.41.1 (circumventing a protection measure). Client-side parsing
(Karma/Honey style) is rejected on the same ground plus store policy. BC's 130,404-container
alcohol registry is parked: at most 5.8% could ever carry a price. Expanding the product-and-price
catalogue by every possible method stays Shin's highest priority, restated 2026-09-11 and
2026-09-26: a product identified without a price is meaningless. Every possible method means the
unconventional ones too, down to reading websites by hand, inside the law line above. This is the
long-run goal, not the immediate build list: MVP mode (09-26, see Catalogue scope) narrows what
gets built right now to what is accessible and actually needed, deferring low-ROI sourcing work
rather than chasing every method at once. ·
2026-09-26 · *"keep searching for EVERYTHING we can possibly do to build up our catalogue. think
crazy, unreasonable things, i need you to think outside of the box, even to the point of manually
reading through websites. Think really really outside the box"* · 2026-09-13 · log: docs/decisions.md#Never circumvent a bot block, and now for a second reason · 2026-09-11: *"Expand our product catalogue by finidng all possible methods to gain more infomation(product and price catalogue come hand in hand, knowing the product without the price is meaningless)"* · 2026-09-26: *"we need more items in the catalogue"*
Retired wording: `roughly ten minutes lockout`, `search() in walmart.ts`
Governs: price/src/walmart-sitemap.ts (discoverSkus, --indexes)

### Task-list split: Aurik owns the heart-marked items, the rest are the founder/assistant's
He shared the Shin task list and marked which items are Aurik's: the ones with a heart under
them are Aurik's to work, everything else on that list is worked by the founder and the
assistant. Narrower than this: the same day, for the catalogue-expansion plan specifically, he
moved Aurik's pieces of that one plan to Claude too (see the entry below); that reassignment is
scoped to the catalogue-expansion plan, not a standing reversal of who owns the rest of the
heart-marked list. · 2026-09-26 · *"these are the things that need to be worked on, of which,
aurik will work on the things that have a heart under them"*
Retired wording: none
Governs: the Shin task list (image-shared, not a repo file)
### Catalogue-expansion plan: Claude owns all of it, Aurik's share included
The catalogue-expansion plan's pieces that were assigned to Aurik are Claude's to do; the open
calls inside that plan (then: deleting the 16 junk products, who does Aurik's eight pieces, and
merging the 12- and 13-digit spellings of one barcode) are Claude's to decide and state, not to
wait on. · 2026-09-26 · Jamin · *"for the three things, i give you permission to do what you think
is right. For the things assigned to aurik, just take over them"*
Retired wording: none
Governs: the catalogue-expansion plan, QUEUE.md catalogue bands
### Product identity and catalogue matching
Shin's own catalogue names the product (catalogue-first ruling above). Aurik earlier accepted a
live-vs-imported distinction, not yet built: imported Open Food Facts answers first, a live OFF
call is only the fallback, and the answer records which was used (open: snapshot staleness). A
matched scan attaches at the closest of two stored quantities, converting units but keeping the
original; user data is never fully trusted; an unknown product becomes a new grouped entry, stored
per store branch. Substitutes draw on leaf category, one step to parent if empty, never
grandparent, labelled when looser. Alternatives split validation (farm/used price can still
validate) from genuine switching (rejected); tech items are never compared by weight. Produce
stays refused, promoted once two independent shopper reports clear the existing thresholds.
Furniture is a named, unresolved coverage gap raised alongside tech and produce, both answered
above. The category tag is stored lower-cased on match. A store is never counted as its own price
competitor. · 2026-09-21 · log: docs/decisions.md#Nine rulings so the competitor-survey build could start (item 5 addendum, Aurik's answer 2026-09-21) · 2026-09-03: *"why does it not work for new tech, furniture and fresh produce"* · 2026-09-05: *"Lower-case the category tag on match"* · 2026-09-11: *"A store is never counted as its own competitor"*
Retired wording: none
Governs: catalogue/, product.ring field (leaf/parent)
### Catalogue scope: in, out, and parked
MVP mode (09-26): build only what is accessible and actually needed right now; skip low-ROI
items and defer them for later rather than build everything possible up front. This is the
general rule the parked items below are instances of, not a one-off call on the BC registry
alone.
The rule: country-in-Canada is a column on the product row, never a load-time filter, and
anything that needs only Canadian products filters at read time (the phone's downloadable pack is
built from sold_in_canada = 1). One loader breaks it and that stays, for now: the Canadian food
loader keeps only rows tagged en:canada (122,158 of 4,759,011), so the other 4,636,853 food
products from outside Canada are NOT in the catalogue; loading them is parked (8 GB, 2026-09-26,
docs/decisions.md#The four and a half million food products from outside Canada stay out, for now). The fuzzy vector-search embedding pass
stays parked at 718,662 of 5,182,591 products; word search already covers all products by name.
Shin finds the price of anything, not only groceries: food, furniture, tech and more (Jamin
2026-09-03 *"we are not only scanning food but also furniture, tech and much more"*, 09-06 *"its a
search and find the price of anything app"*, 09-11 *"don't forget that we don't just focus on
groceries"*). Books, music and Discogs records are parked for the MVP as low return for now (09-26
*"we will take whats accessible and leave the low roi items for later"*), not because of scope;
they come back the first time the miss log records an ISBN or music barcode. Shin is global from the
start, not Canada-only: same-country products compare, cross-country generally does not, except
provinces that differ sharply or EU-like regions, the Gemini prompting for this still needs design.
Shin is a phone app: no architecture decision assumes multi-gigabyte on-device data is feasible
(the reason behind the 8 GB and embedding parks above). · 2026-09-26 · log: docs/decisions.md#Country is a column in the catalogue, not a filter applied while loading · 2026-09-05: *"consider that this is a phone app and having multiple gbs of data is impossible"*
Retired wording: `grocery/shelf-price scanner`, `grocery and shelf-price scanner`
Governs: sold_in_canada column, embedder coverage
### Attribution, provenance and correction data
Allergen comparisons stay two-state (the source can't say "checked and clean"); allergens print,
never filter. A price row may name the shop it was seen in plus a date, joined by barcode and a
store name: this is provenance, not the nearby-cheaper feature. Open Prices' contributor handle is
deliberately not stored; ODbL attribution names the source databases, frozen in attribution.ts, not
assembled from live data. eBay's Browse API answers only for used/tech, asking prices only, filtered
to Canadian fixed-price listings, never for groceries. A price a person types into the correction
screen enters the next verdict's comparison set; one person/shop/product/day overwrites rather than
duplicates, a shop name is required, sale-price is a separate opt-in flag. Best Buy's API key is
likewise a live seller-price source, not catalogue data. An invented "in stock" flag and inaccurate
allergen wording are hard-rule problems (fabricated evidence), fixed on sight, never deferred behind
another feature. · 2026-09-05 · log: docs/decisions.md#A price somebody types in is a price, and it reaches the next verdict · 2026-09-05: *"Best Buy and eBay keys are free, but those are not catalogues. They return live prices, so they belong with the other sellers, not in the product table."*; *"Fix the invented stock flag and the allergen wording. Both are hard-rule problems that exist now and neither waits on this feature."*
Retired wording: `gate keyed on openprices denylist`, `collected, applied to nothing yet`
Governs: app/src/attribution.ts
## Money and plans
### Scans are not metered in v1
A metering switch exists but defaults off, with a refusal never spending a scan at any setting.
Nothing would ever earn a scan back until a contributed price is confirmed by a second independent
observation; the old "no fabricated price data" hard rule and its accuracy-first priority (both
Claude-authored, not his) were retired on his word, but the underlying reasoning, no mechanic pays
for a reported price because that pays for noise or for inventing good prices, still stands on its
own. · 2026-09-06 · log: docs/decisions.md#No v1 mechanic pays for a reported price
Retired wording: `no fabricated price data hard rule`, `accuracy-first priority rule`
Governs: to fill
### Reward mechanics: five in, four killed
The v1 reward set is five things (unrewarded thumbs, attitude picker/share card as identity,
watched item as stake, a weekly line from the user's own record, record-only "Shin was right"),
all pay in acknowledgement, never a scarce resource. Streak, leaderboard, badges and collection
completion are killed: each pays for more scanning and is gamed by re-scanning a cupboard. Draws,
sweepstakes and cash bounties are out on the data argument (whatever an entry is priced against
gets manufactured) before any legal question. The home-screen widget and co-watch wait on a
re-queryable per-item price source, not a design decision. · 2026-09-03 · log: docs/decisions.md#Volume mechanics are killed: streak, leaderboard, badges, collection completion
Retired wording (single words, too common to search): streak, leaderboard, badges, collection completion
Governs: to fill
### No savings claim ships until it is measured
The "$1,000 a year" figure was never measured and mirrors a published forecast: measure first or
say nothing, per Competition Act s.74.01(1)(b). A "Shin saved you $X" tally is not shipped in v1;
its only honest future form is a spread between asking price and the lowest comparable Shin held,
counted only over certain/fairly-sure scans, never using the word "saved". · 2026-09-03 · log: docs/decisions.md#The saved-money tally is not shipped, and its only honest form is a spread
Retired wording: `Shin saved you $412`, `Pays for Itself, With one good find`, `$1,000 a year`
Governs: to fill
### Shin Plus pricing and free scans
CA$3.99/month, CA$29.99/year, set in each store's own product config, not the app. Free scans: 5 a
week for the beta, 3 a week at public launch, on the cheaper lookup path; typed searches are free
and uncounted, revised same-day after Jamin corrected the payer-rate assumption to 1-in-100 and
flagged the per-scan cost assumption as stale given the cheaper system planned.
`SHIN_FREE_SCANS_PER_WEEK=5` switches on only once a test purchase works end to end, so no tester
hits the wall against a subscribe button that can't yet take a purchase. The price and free-scan
numbers are Claude's to set at the most reasonable value until he or Aurik changes them. ·
2026-09-23 · *"For now, you decide the most reasonable for price and free scans. Figure out the
logistics of the cheaper looup design and add all items not already added to the work item list"*
· 2026-09-23 · *"we should assume only 1 in 100 people pay"* · log: docs/decisions.md#Shin Plus price and the weekly free scans
Retired wording: `assuming a scan cost 0.6 cents`
Governs: SHIN_FREE_SCANS_PER_WEEK, app/public/js/plus-config.js
### Model spend cap
Model calls (Gemini in the running beta, Claude as the catalogue-first price-range fallback) stay
under a daily and a hard dollar cap. The 2026-09-18 acceptance of roughly 5.6 cents on every scan
is superseded: the catalogue now answers first and Claude, with no web search, is the monthly-capped
fallback (catalogue-first ruling, 2026-09-28). Shin is never designed to lose money every month: a cost model
that runs negative is a red flag, answered by researching every way to cut it (one search per
query, a free database first, what to charge, how many scans to give, other model providers),
not by accepting it. · 2026-09-22 · Jamin · *"this pricing model is a huge red flag for us. With
this model we will be in the negatives every month. I want you to research all possible avenues
these are some but not limited to these examples: how do we fine tune grounding with google search
to only search once per query, how can we reduce costs in other ways by first searching a free
database, how much can we charge, how many scans should we provide, is claude also an option etc"*
· 2026-09-18, revised 2026-09-27 · *"go with the defaults for all four."* · log: docs/jamin-gemini-rules.md#walkthrough-rulings-2026-09-1617-his-notes-and-comments-on-the-google-doc-walkthrough
Retired wording: none
Governs: SHIN_PHOTO_DAILY_CAP_CAD, SHIN_PHOTO_HARD_CAP_CAD, SHIN_SPEND_CAP_STORE_PATH, identify/src/cap.ts
## Privacy, recording and consent
### Location and photo consent default off until answered
Consent defaults to off until answered; only a coarse kilometre-wide cell is stored, never exact
GPS; the server writes null into exact-location columns regardless of what an old client sends.
This is Aurik's ruling, overriding a same-day build (shipped both toggles on by default with exact
GPS stored, migration 8) that had followed Jamin's literal "build everything for collecting
EVERYTHING" instruction. · 2026-09-14 · *"build everything for collecting EVERYTHING"* (overridden) · log: docs/decisions.md#Consent is off until answered, and the cell stays coarse: his ruling over the one-push "everything"
Retired wording: `photos: true, location: true default`, `exact GPS position stored beside coarse cell`
Governs: app/public/js/api.js, exact-location columns
### Record everything the user does
Every request, every Gemini request/response, every screen/tap/answer the phone shows, is
recorded: photo or barcode, typed price, location, store, and the user's own good/bad/great verdict
on their own scale (not Gemini's), so a median can later be computed against it. Anything he
mentioned that is not currently recorded should prompt a review of the data collection system.
· 2026-09-17 · *"Shin should try to save as much data as possible... all user data should be recorded"* · log: docs/walkthrough/jamin-notes-2026-09-17.md#notes-typed-into-the-tabs
Retired wording: none
Governs: SHIN_ACCESS_LOG, SHIN_SHUTTER_LOG, SHIN_SHUTTER_DIR
### Collective user data reduces computation, and the privacy policy names both uses
Shin is designed to use aggregated, collective user data (a setup survey, past shopping history) to
cut the computation a scan needs and to proactively surface an answer before the user has to
search, without hurting the experience. The privacy policy states plainly that all of a user's
scanned data is collected, and that it is used both to train Shin's models and to answer other
users, with a system in place for someone to report an incorrect price. · 2026-09-05 · *"collective user data can be used to heavily reduce the computation required... we should aggresively design systems that provide the user with the answer before they need to search with the llms... our privacy policy must say that we will collect all of a users' scanned data, and all of it will be used to both train our models and also to answer other people"* · log: to fill
Retired wording: none
Governs: to fill
### Zero data retention sought, built assuming refusal
Seek zero-data-retention approval from Google, but build as if it will be refused. · 2026-09-14 · log: docs/decisions.md#Twelve rulings on the Gemini branch, answered together (item 2)
Retired wording: none
Governs: docs/gemini-work-list.md item 10
### Consent wording delegated
The drafted consent wording naming Gemini and the 30-day retention period is delegated to a
session's own reading; it ships unless a later pass finds a problem. · 2026-09-14 · *"you decide"* · log: docs/decisions.md#Twelve rulings on the Gemini branch, answered together (item 7)
Retired wording: none
Governs: to fill
### Continuous shelf-photo data collection: parked
Whether Shin should continuously send cropped photos of everything in view (not just the focused
item) to the server, especially shelf tags showing price/name/product together, is raised as
valuable data, not a decided build item. · 2026-09-17 · *"This is very valuable data"* · log: docs/walkthrough/jamin-notes-2026-09-17.md#comments
Retired wording: none
Governs: to fill
## Legal and name
### Shin name: risk carried knowingly
"Shin Ramen" is dead as a name (Nongshim's SHIN RAMYUN, first use 1987). Plain "Shin" for software
passed CIPO's Canadian classes 9/42 clean twice (2026-09-04, 2026-09-11); the store listing goes
out under "Shin" with risks carried knowingly, not cleared: Nongshim's food marks and two live US
class 42 design marks that transliterate to "Shin", one covering product-rating software. No
public use (handle, posted video) until a name has passed this kind of search. · 2026-09-22 · *"we wwant to create the store listing under shin"* · log: docs/decisions.md#The store listing goes out under the name Shin
Retired wording (every live mention already says it is dead, so not searched): Shin Ramen
Governs: to fill
### Product identification takes a string or GTIN, never an image
Based on Trader Corporation v CarGurus (2017 ONSC 1841, $305,064 in statutory damages for scraping
152,532 photos), infringement there applied exclusively to photographs, not factual listing data
like price. Framing/hotlinking a retailer's image is infringement exactly as copying it. This
governs Cloud Vision Web Detection design and Open Food Facts photo use. · 2026-09-13 · log: docs/decisions.md#Take the string, never the image
Retired wording: none
Governs: to fill
### Age gate is a Terms-of-Service checkbox
An 18+ checkbox in the Terms of Service, not an age gate, removes Shin's own liability regardless
of what Google's clause turns out to mean; built now rather than held pending Google's written
answer. · 2026-09-14 · *"just put in our terms and services that you need to be 18+, if the user checks that, then we don't have any liability"* · log: docs/decisions.md#Twelve rulings on the Gemini branch, answered together (item 8)
Retired wording: none
Governs: to fill
### Legal review before launch, not before build
Legal review of the Gemini branch happens before launch, not before build, and is not skipped.
· 2026-09-14 · log: docs/decisions.md#Twelve rulings on the Gemini branch, answered together (item 6)
Retired wording: none
Governs: to fill
## Design and screens
### V1 verdict screen mechanics
The verdict is one Shin face per tier, not a number. The primary action (Save/Watch, tier-keyed)
sits in the peek detent, needing no drag; Correct and Share sit at half detent since correction
applies even to a refusal. A refusal hands back exactly one action (record the price the user read,
dated and attributed) and never promises to look again. The primary CTA after a verdict is Save,
not Buy: the primary user is a window shopper, not a buyer. · 2026-09-03 · log: docs/decisions.md#The primary action sits in the verdict's peek detent
Retired wording: `every action in the full detent`, `Move back instruction`
Governs: to fill
### Sharing, notifications and attitude
Share exports carry no download link (Wordle's example; a link reads as an ad). The v1 return
trigger is the store visit itself, not a push notification: no price-drop notifications ship, and
the permission is not requested. Shin ships three user-selectable attitudes (Deadpan, Warm, Blunt),
defaulting Deadpan, tripling every string and face variant; attitude changes wording only, never
the number. · 2026-09-03 · log: docs/decisions.md#Shin's attitude is the user's choice, not ours
Retired wording: none
Governs: to fill
### Camera UX: guidance, target size, torch, continuous scan
Camera-first app; refusal is a designed state. Guidance acts first, speaks last: silently fixes
what it can, speaks only on four measured conditions. Barcode reading is continuous, highlighted
every frame like a shift register; Scan sends only digits. Price-pad keys are at least 44×44 CSS
px, 48-52px on the primary target. Torch is a user setting: auto-on at a slider brightness, or off
with an on-screen too-dark prompt. · 2026-09-17 · log: docs/walkthrough/jamin-notes-2026-09-17.md#notes-typed-into-the-tabs
Retired wording: `Move back instruction`, `The lighting is bad instruction`, `no automatic barcode detection`
Governs: to fill
### Localization and onboarding
Bilingual (Canadian French/English) from the first beta. French money prints 4,99 $ (comma
decimal, symbol after the number, no-break space) client-side, server English stays the fallback;
the export that does this could not be located in the currently tracked client files
(`spine/src/money.ts`'s `cad()` stays English on purpose) and needs a session's re-check. Welcome
screens are Cal AI's onboarding screens with his replacement text, plus screens asking shopping
habits, good/bad/great price ranges, location. Social-proof numbers (10,000 shoppers, 4.8 rating,
$15/$180 savings) stay hidden until real, never invented placeholders. Bilingual French/English is
the shipped beachhead for the first beta, not the ceiling: the standing requirement is that Shin
works in every language, since it is used worldwide (see Catalogue scope: global from the start).
Onboarding pages must be watchable more than once during the beta test. · 2026-09-13 (bilingual, money format) · 2026-09-16/17 (onboarding) · 2026-09-18 (placeholders) · log: docs/decisions.md#The app ships in French and English from the first beta, not English-only; docs/decisions.md#Money is written the way the reader's language writes money, and only the client does it; docs/jamin-gemini-rules.md#walkthrough-rulings-2026-09-1617-his-notes-and-comments-on-the-google-doc-walkthrough · 2026-09-19: *"shin should work for all laungauges"*; *"for the beta test, the onboarding pages should be able to be watched multiple times"*
Retired wording: `$4.99 in French UI`, `Join over 10,000 smart shoppers placeholder`, `4.8 star rating placeholder`
Governs: app/public/js/shin.js, app/public/js/ui-strings.js, spine/src/money.ts
### Scan-time asks and feedback
Asking the user's shelf price at scan time (so it rides in the one Gemini prompt) is proposed, not
built, parked. A shopper can rate a scan via thumbs on the verdict sheet, with an optional one-tap
reason on thumbs-down; the four-second undo is kept. Prices visualize as a colored line, a large dot
for the photographed item, smaller dots for other sources, quantities scaled to a common unit and
each dot labelled with its actual quantity. · 2026-09-17 · *"These thresholds are crucial and non negotiable"* · log: docs/walkthrough/jamin-notes-2026-09-17.md#notes-typed-into-the-tabs
Retired wording: none
Governs: to fill
### Parked UI ideas, not investigated
The Continue button on welcome screens works no matter what is entered (which screens, and what
"no matter what" means, is unstated). Pop-ups should guide the user through the UI after finishing
welcome (once or replayable, unstated). The price verdict screen needs refinement (unspecified).
· 2026-09-19 · log: docs/parked-list.md#p2-the-continue-button-on-the-welcome-screens-works-no-matter-what-2026-09-19
Retired wording: none
Governs: to fill
### Front-end craft: measured contrast, shared components, no build step
Tier-palette text-on-tier contrast was measured, not asserted: two of four pairings failed WCAG, so
walk/unknown field colours were darkened 19%/22%, and light theme's tier bases (never themed before)
were added. A shared components.css layer (one .btn base, focus ring, row/field/label/money-figure
styles) matches shell screens to the camera surface's existing craft. The frontend has no build step
by design: screens.css @imports its stylesheets, custom properties give the scale, tests import
browser modules directly under node --test. · 2026-09-06 · log: docs/decisions.md#The camera's standard is applied outward, and the tier palette is measured
Retired wording: none
Governs: app/public/css/components.css, app/public/css/screens.css
### Avatar / mascot and competitor-inspired design
The mascot is one of Shin's most important features. It behaves like Duolingo's bird: present
throughout the UI, reacting emotionally (happy at a good price, mad at a bad one), with its own
animations and screen-by-screen dialogue; placeholders stand in for its visuals until it is
designed separately. Inspiration from Duolingo, Olma or any other app is never copied directly,
only applied where it specifically fits Shin's own use case; Olma's screens are analysed one by one
for individual features worth pulling in, without copying its UI. Analysing a competitor app is not
the deliverable: it has to turn into implemented, shipped changes. · 2026-09-03 · *"The avatar for our app is one of our most important features"* (2026-09-04: *"we plan on having this avatar function similar to the duolingo bird that pops up constantly throughout the ui... Sometimes the avatar might be mad at bad prices, sometimes itll be really happy with good prices"*; *"go ahead. rememebr we are not trying to copy duolingo or any other app, we are taking inspiration that applies to us"*; *"how come basically nothing in the app changed even after i told you to analyse duolingo and olma"*; *"what is the avatars role in the ui. I originally asked about that and the avatar is not present at all"*) · log: to fill
Retired wording: none
Governs: to fill
### Method for AI-assisted redesign work
When an AI redesigns a Shin screen, the deliverable is a written description, not a built page. The
AI gets no prior knowledge of Shin's current screens: it redesigns each one from scratch for an
innovative, non-"AI slop" look, covering the popups that appear through the UI too (for example, a
paid-plan upsell screen when the free scan limit is hit), with full detail on how each pops up and
looks. The prompt given to the AI carries much more descriptive information about the app than
before, still without showing the actual current screens, plus constraints that push for a
thorough answer rather than the AI's most efficient, minimal-effort one. · 2026-09-21 · *"the design is supposed to just be in words and not actrually created"* (*"I wanted the ais to completely redesign each screen without prior knowladge of what our screens look like. I wanted a non ai slop look and innovative aspects... maybe when usage limit is hit for the free plan, a screen pops up and advertises the paid plan"*; *"regenerate a new prompt that doesn't assume the ais have context... create constraints that make sure tehy give high quality answers"*) · log: to fill
Retired wording: none
Governs: to fill
### Screen and page tagging
Every single page and screen carries a short tag (a1, a2, a3, ...) so he can refer to it by tag
when talking to Claude Code; this includes screens that only half pop up, such as the price-verdict
result. · 2026-09-19 · *"delegate an agent to add a tag like a1, a2, a3, etc. to every single page and screen so i can refer to it but its tag when i communicate with claude code"* (*"i said before tht every screen should carry a tag. That includes all screens that half pop up like when the price verdict is determined"*) · log: to fill
Retired wording: none
Governs: to fill
### UI rebuilds: old UI is the feature record, new UI is the design
When Shin's UI is rebuilt or restyled, the old UI (even with bad design) is the source of truth for
the feature instructions he actually gave; the new UI's design is adopted for its design quality,
and specific features it happens to have are pulled into the backend only where judged genuinely
worthwhile. · 2026-09-08 · *"Although the current ui is bad, it contains the instructions I gave shin on certain features. Although the new ui has good design, none of its features are what i instructed"* · log: to fill
Retired wording: none
Governs: to fill
## Build, servers and infrastructure
### Repo, deployment and scope cuts
The repo lives on GitLab at gitlab.com/shin3223636/shin, private, Aurik Disler as Maintainer. Beta
is a native build on TestFlight/Google Play internal testing (six testers: Jamin, Aurik, their
parents), the web app wrapped rather than rewritten, native barcode plugin as fallback. Leftover
uncommitted Gemini branch code is reused where it can be, not rewritten clean or committed as-is;
that reuse principle is general across the 2026-09-14 twelve-item set, not just the Gemini branch.
Shin does not run in a browser except for testing, and is not usable offline for now. A real GitLab
Group was the original ask; it was blocked technically, so Aurik holds Maintainer on this
personal-namespace repo instead. The backend (API, catalogue, backups, migrations) is hosted on his
own Mac rather than a paid hosted API service. The GitLab repo is mirrored to GitHub: origin pushes
to both remotes. · 2026-09-17 · log: docs/jamin-gemini-rules.md#walkthrough-rulings-2026-09-1617-his-notes-and-comments-on-the-google-doc-walkthrough · 2026-09-03: *"i changed my mind. Create a shin repo on this laptop and then create a shin group in gitlab and invite aurik"* · 2026-09-12: *"instead of Hosted API with HTTPS, catalogue, backups, migrations. can i host on my mac."* · 2026-09-14: *"reuse what can be used"* · 2026-09-26: *"shin's gitlab should be mirror to github"*
Retired wording: `gitlab.com/jaminke/shin`
Governs: to fill
### Server-side guards and limits
The vision identification call gets a 1,800ms timeout, exactly one retry (only on rate-limit/5xx/
no-status, never on timeout or malformed response), and a 2,000-calls-per-process-per-UTC-day cap
charged per attempt. Paid API calls are rate-limited per invite code (200/10min, 1,500/day) and per
network address (90/10min, 600/day), each overridable by env, refusing with 429 and Retry-After
before any Gemini call or counting. A missing Origin header is allowed and marked (a native wrapper
can legitimately send none); a present-and-mismatched Origin is refused outright. · 2026-09-19 · log: docs/decisions.md#Calls that cost money are limited per invite code and per address, and the cap charges the search fee
Retired wording: none
Governs: SHIN_RATE_CODE_PER_10MIN, SHIN_RATE_CODE_PER_DAY, SHIN_RATE_IP_PER_10MIN, SHIN_RATE_IP_PER_DAY, app/src/rate-limit.ts (the 2,000-calls-per-process cap this paragraph also describes is not read from any environment variable in the code today)
## Anything else
### A plan covers every case involved, not the path where everything works
A plan is not acceptable until it names every case the feature meets: each input the user can
give, each way a step can fail or return nothing, and what happens then. · 2026-09-27 · Jamin ·
*"this plan is so flawed, it doesn't consider all cases invovled"*, said of a photo-to-catalogue
matching plan that covered only the case where the photo holds readable text that matches.
Retired wording: none
Governs: every plan written for Shin

### Mission and principles
Fixed problem statement: sellers know what things are worth and buyers are guessing, so Shin makes
the check instant enough that guessing stops being the default. Every change must be useful, easy,
visually appealing: one that can't name which it serves is not made. Channel is short-form video
(the objective function, not defensibility); primary user is a window shopper, browse over
purchase frequency; Shin is a fast follower, not a feature inventor. Every pass ships or kills
something. Aggressive tone points at the price/store/brand, never the user. No past decision is
final; the only hard constraint is the law. The backend vision every improvement answers to: build
something users want and become reliant on, and make money. A "moonshot" for Shin means the hardest
realistic thing a small company and a founder of his influence could pull off by ordinary means,
never something literally impossible. Shin is built to hold up long-term, not just for a demo. MVP
direction: simplify and stop chasing perfection over an elegant, complicated system.
· 2026-09-04 · *"useful to the user, easy to use, and visually appealling"* (2026-09-03: *"there are no hard rules outside things like breaking the law. Nothing should be final"*; 2026-09-06: *"create something that users will want and become reliant on and to make money"*; *"i wanted the moonshot to be something thats impossible to achieve for an app and a small comapny with people of my influence. Yours is impossible to achieve unless i have supernatrual abilities"*; 2026-09-22: *"make sure shin works for the future"*; 2026-09-26: *"We want to simply everything and stop chasing perfection"*) · log: CLAUDE.md#intro
Retired wording: none
Governs: to fill
### Marketing and positioning
The hook pairs a capability with an antagonist ("Shin tells you if you're getting ripped off"),
following Yuka's growth pattern. The launch video test runs on borrowed audiences (3-5 micro
creators, or Reddit), never a cold new account, since TikTok seeds new posts to existing followers
first. Marketing videos may show real Gemini answers, framed as showing what the app produced, not
as showing the answer to the person who asked, a reading not yet checked against Gemini's terms'
actual wording. Growth does not require being broadly better than or different from competitors:
one killer, easily viral feature or phrase (the working example: "scan anything and it tells you if
the price is right", or the mascot) beats trying to be better, since users rarely install two
similar apps to compare them. Following Yuka's growth pattern is not the same as copying its
purpose: Shin does something different, arguably more important for users. Any claimed capability
in marketing or specs cites the concrete backend mechanism and a real, measured metric behind it,
never asserted bare. · 2026-09-03 (hook, borrowed audiences) · 2026-09-14 (filming, *"we will show the real answers in the videos, we are not showing the answers to users, we are just showing what we see on an app"*) · 2026-09-03: *"popular apps will have on killer, viral feature, or selling point"* · 2026-09-06: *"our app does something different, arguably more important for users"*; *"For everything you say that the app does, the backend should be clearly listed... there should be metrics for everything"* · log: docs/decisions.md#The hook is a capability plus a villain; docs/decisions.md#The video test runs on borrowed audiences; docs/decisions.md#Twelve rulings on the Gemini branch, answered together (item 9)
Retired wording: none
Governs: to fill
### v1 floor: what the MVP ships, and how photo identification returns
The MVP keeps what is already built, like the mascot, and still needs the subscription screen; the
welcome screen, photo identification and languages stay off for now (Jamin 2026-09-21). Photo
identification comes back as the catalogue-first plan of 2026-09-27: every piece of text on the
object is read and searched in Shin's own catalogue, top 3 returned, and a missing price answered by
Claude with no web search (see "Catalogue first; Claude, with no web search, is the capped
price-range fallback"). The 2026-09-09 floor, *"the user must take a picture and Shin must be able
to identify. Nothing less."*, is the goal that plan serves, not a requirement of the MVP.
Image-embedding search stays parked. · 2026-09-09, 2026-09-21, 2026-09-27 · *"Things like the welcome screen, the photo id, the languages etc. should be kept off for now. Plan out in detail what the mvp should include. Also, we still need the subscription screen etc."* · log: docs/decisions.md#Live photo recognition is load-bearing, and the photo door opens
Retired wording: `live photo recognition cut from v1`, `barcode and screenshot input only`
Governs: POST /api/identify/photo, SHIN_GEMINI_TIER
### Decision-analysis and calibration discipline
A competitor already building a feature is not a reason to reject it: copying what works and adding
Shin's own spin is fine, not a negative, and this applies to every decision, not just features.
Whenever a decision is concluded positive or negative, the "why" gets asked again rather than
stopping at a surface reason like "a competitor already does this." An app's model being unpopular
is not evidence it was wrong (Olma). A test failing once does not mean the whole approach is dead
(meaning search): it could be a false positive, and could work applied elsewhere. When critiquing a
plan, name a flaw's available workaround and the underlying intent being served before calling the
plan bad, and re-check any economics used in the critique. A stated flaw with a solution
available is not a flaw in the plan: his example, Electronics holding 4,972,249 of 5.2 million
products with exactly 2 prices, is solved by asking a model the typical price for that type of
tech, testable, not a reason to devalue the plan. Simplification is judged by why it was wanted
(results were inaccurate, the product would not turn a profit, the cheaper alternative was too
complicated to build): steps that are low-level, simple to build and near impossible to get wrong,
such as sorting into categories, count as simple even when time-consuming. An audit for contradictions checks his
full instruction history, not just the item most recently raised, and watches for logical fallacies
specifically. Before refining a design, research existing open-source tools and how other companies
solve the same problem. Project timeline and history are stated only from verified fact, never
hallucinated. An invented rule or figure is never attributed to him as something he said.
· 2026-09-03 · *"Just because a competitor already builds something, doesn't mean we can't build the exact same feature... if your why is that competitors already do that, you should know to ask why again"* (2026-09-04: *"olma's model is accurate... just because olma is not popular doesn't mean the idea is dead"*; 2026-09-05: *"Don't fall for logical fallacies: even thouse meaning search failed at one test doesn't mean it shouldn't be used in the product at all"*; 2026-09-06: *"crticially analyse this against what i've been asking for in this repo... consider... faults with logical fallacies"*; *"a price the app cannot source is absent, not estimated. $20 is not my number, i never stated it"*; 2026-09-11: *"you seem to be hallucinating a lot with timing"*; 2026-09-19: *"contradictions are not just limited to these, i'm talking about contradictions of instructions i gave"*; 2026-09-22: *"You also didn't look at what open source tools exist or research how other companies online do it"*; 2026-09-26: *"you failed to consider... underlying intentions"*) · log: to fill
Retired wording: none
Governs: to fill
### Build only when asked; decide small things without stalling
Asked how something would be built, the answer is the analysis or plan, never starting to build it;
this holds every time it is restated. Within a plan already agreed, small decisions are made and
work continues rather than raising blocking questions back to him; that autonomy is for judgment
calls inside agreed work, not for whether to start building a new feature. · 2026-09-11 · *"i didn't ask you to build, i asked you how you would build it"* (2026-09-12: *"Why do you need 5. and 7. for 8. you can make these decisions"*; 2026-09-26: *"i didn't ask you to build anything"*) · log: to fill
Retired wording: none
Governs: to fill
### Walkthroughs and explanations of Shin: full detail, verified, plain language
A walkthrough of Shin written for him breaks every tool, mechanism and surface into its granular
substeps (camera capture, barcode tracking, barcode identified, lookup triggered, server call,
server search, and so on, built or only planned) and states the reasoning behind every design
decision that shapes the system. It is written at a systems-designer, pseudocode level: no
file:line citations, no unexplained function names, no "contradicts your rule" claim without
restating the rule, no assumption he knows what a named function does. Every claim is backed by
actually reading the code, never reported as assumed. No step is summarized in one line, even if a
similar step was already explained earlier: a Gemini call states the exact prompt sent and how the
response is interpreted; a math step states the exact formula. It eventually covers the frontend
too, not only backend and Gemini logic. · 2026-09-16 · *"perform a thorough walkthrough of every single tool, mechanism, surface etc of shin"* (*"this is for me to read... i only need to understand similar to how high level engineers will write Pseudocode"*; *"everything should be backed up with evidence, all claims should be from looking inside the code"*; *"for step 8, you still did not detail exactly what is sent to gemini. What is the prompt sent ot it?? For 11, it says it sends the math function but it doesn't say what the math function is"*; *"fruther more, you did not talk about the frontend at all which is okay but should be remembered for the full walkthrough"*) · log: to fill
Retired wording: none
Governs: to fill
### Running lists: defects and parked items
A running defects document accumulates every defect found as Shin gets built, rather than each one
being scattered or dropped. A separate list holds Shin work items for later (docs/parked-list.md);
items go on it only when he explicitly says so, and nothing on it is worked on automatically for
being listed. · 2026-09-06 · *"write these in a defects document that gets built together will all other defects that will pop up as the proudct is getting built"* (2026-09-19: *"create a new list for items that need to be worked on. These itmes will not automatically be worked on, they are just stored"*) · log: docs/parked-list.md
Retired wording: none
Governs: docs/parked-list.md
### Governance: which document outranks which
RULINGS.md (this file) outranks every other file in the repo, including docs/jamin-gemini-rules.md
and the Google Doc "Shin Full Walkthrough": both feed into it rather than compete with it. Before
this file existed, the Google Doc outranked every older repo note from 2026-09-16 onward; a
pre-2026-09-16 line contradicting it was deleted and named in the commit message. Jamin chose to
start the Shin pilot without waiting for Aurik's agreement, taking the four offered defaults; Aurik
was informed through comms/, not asked (both process, recorded in CLAUDE.md, not here). To change a
ruling: rewrite its entry here, move the old text to docs/decisions.md, search for the old wording
and fix every hit in the same commit. · 2026-09-27 · *"yes to all four defaults, start the Shin pilot without auriks agrement"* · log: docs/decisions.md#One list of current rulings outranks every other file
Retired wording: none
Governs: RULINGS.md (this file), docs/jamin-gemini-rules.md, docs/walkthrough/jamin-notes-2026-09-17.md
