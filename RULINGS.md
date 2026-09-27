# RULINGS: Shin's current rulings
This file outranks every other file in the repo, including docs/jamin-gemini-rules.md and the Google Doc "Shin Full Walkthrough" (docs/decisions.md, "One list of current rulings outranks every other file").
To change an entry: rewrite it here, move the old text to docs/decisions.md, then run node scripts/checks.mjs.
Process rows (git, commits, claiming, lanes, hooks, comms channel) live in CLAUDE.md, not here; one entry per live ruling below.
## Scanning and Gemini
### Gemini switch and call architecture
Gemini replaces Claude for identification (measured: 7/7 price requests refused, 9/30 barcodes
absent, Claude refusing 4/15 photos on Jamin's phone). One Gemini call returns product, prices,
reviews and price math together, never split; photo scans are also one call. Rollout order:
identification, guard, grounded prices, reviews, price line. · 2026-09-14 · *"we will be swithcing to gemini... Shin will adopt this"* · log: docs/decisions.md#Gemini for identification, and grounded prices display-only
Retired wording: `Claude for product identification`, `two Gemini calls per scan`
Governs: identify/src/model.ts, identify/src/providers/gemini-scan.ts, SHIN_MODEL_PROVIDER
### Default Gemini model is gemini-3.8-flash
Drifted three times: cheap-first tiering (3.5-flash-lite, escalate to 3.8-flash on doubt,
2026-09-14) → gemini-2.5-flash flat default "for now" (2026-09-18) → both tested side by side, 3.x
to replace 2.5 only if testing said so (2026-09-19). 2.5 also can't combine a response schema with
Google Search, forcing a prompt-text JSON parse. On 2026-09-22 Jamin found "gemini 2.5 is not
accessible" on the beta server, so code now sends every scan to 3.x by default
(`DEFAULT_GEMINI_3='gemini-3.8-flash'`) unless `SHIN_GEMINI_SPLIT=1`. Flagged in the 2026-09-27
decisions.md entry as one of two places the log had drifted from the running system. · 2026-09-22 · *"gemini 2.5 is not accessible"* · log: identify/src/providers/gemini-scan.ts:82-88 (quote at line 86; docs/decisions.md#One list of current rulings outranks every other file)
Retired wording: `gemini-3.5-flash-lite`, `gemini-2.5-flash as the flat default`, `Gemini 2.5 by default`, `SHIN_GEMINI_MODEL=gemini-2.5-flash`, `default decided only by an offline test`
Governs: SHIN_GEMINI_MODEL, SHIN_GEMINI_MODEL_25, SHIN_GEMINI_MODEL_3, SHIN_GEMINI_SPLIT
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
scanning multiple camera frames instead. Built on top of that: Shin never runs or shows its own
price math to the user, but a hidden background check may recompute Gemini's math, and a mismatch
marks that scan (image/digits plus the exact prompt) for later review, never shown to the user; a
page-fetch verifier extends the same idea: it fetches only an allowlisted host, only a URL the
grounded search itself returned, and records agreement or mismatch without changing what the user
sees. · 2026-09-19 · *"there can be measures in place but definitely not calling the ai a second time"* · log: docs/decisions.md#Nine rulings so the competitor-survey build could start (item 3)
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
Governs: cache key = barcode + market + currency, app/test/repeat-cache.test.ts
### Claude excluded; founder's words outrank the system and Gemini's terms
Claude is never used inside Shin once Gemini is in; nothing holds higher precedence than the
founder's words, not the system's own machinery and not Gemini's terms: breaking a term should
never crash the system, and legal issues with Gemini are marked as an issue, never used to block a
feature from functioning. Left open and unresolved: Jamin flagged that Claude's own research on
what Gemini's Grounded Results terms forbid (reinterpretation, tone change, training, cataloguing)
contradicts Gemini's own published research on what is actually allowed; nobody has re-checked
this against the terms' real wording. · 2026-09-17 · *"nothing should hold higher precedency than the words of the founder"* · log: docs/walkthrough/jamin-notes-2026-09-17.md#notes-typed-into-the-tabs
Retired wording: `Claude fallback behind Gemini`
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
the Gemini tree, not decided. Branch testing before a paid key runs via Claude in Chrome on
gemini.google.com. · 2026-09-13/14 · log: docs/decisions.md#Google Lens means Google Cloud Vision Web Detection, and it is specified but not built; docs/decisions.md#A model call goes through a provider seam, and the measure is cost per correct identification; docs/decisions.md#The unfinished grounded-price provider comes off main until it is green and the two questions are settled; docs/decisions.md#Twelve rulings on the Gemini branch, answered together (items 1, 12); docs/the-gemini-tree.md
Retired wording: none
Governs: to fill
## Prices and verdicts
### A scanned barcode answers with Shin's own prices too
YES. A barcode scan's offers list now includes Shin's own collected prices, each marked as Shin's
own data, untrusted, dated; Gemini is still called on every scan for identity and its own offers.
This reverses the 2026-09-15 rule that the price answer never comes from Shin's own price
database, price engine or lookups, and the 2026-09-14 rule that Shin's own prices are not shown
anywhere. Typed-name search (not barcode) still only searches Shin's own catalogue and answers
only when both item and price are known; that narrower rule is unchanged. Enumerated over the
whole price store, not sampled: 17,994 barcode strings, all 17,994 answered, 13,975 distinct trade
items. · 2026-09-26 · *"there seems to be a communication problem, why are you still thinking about gemini"* · log: docs/decisions.md#A scanned barcode answers with Shin's own prices too, not Gemini's alone
Retired wording: `THE PRICE SHOULD NOT COME FROM US`, `no price from Shin's own data`, `Shin's own prices are not shown anywhere`
Governs: SHIN_BARCODE_OWN_PRICES, app/test/barcode-own-prices-route.test.ts
### Always answer, never refuse for wasting time
An unchecked response beats telling the user the app doesn't know after a wait; confidence carries
the doubt instead. This reverses an earlier Claude-authored, non-human "a wrong verdict is worse
than no verdict" line. · 2026-09-15 · *"Having a repsonse that is not checked is infinitly better than having the user scan something, wait 10 seconds, only to get told the app doesn't know, because that will make the user just uninstall the app"* · log: docs/jamin-gemini-rules.md#the-rules-in-jamins-words-from-2026-09-15
Retired wording: `a wrong verdict is worse than no verdict`
Governs: to fill
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
never changes. · 2026-09-19 · log: docs/decisions.md#Nine rulings so the competitor-survey build could start (item 7)
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
alcohol registry is parked: at most 5.8% could ever carry a price. · 2026-09-13 · log: docs/decisions.md#Never circumvent a bot block, and now for a second reason
Retired wording: `roughly ten minutes lockout`, `search() in walmart.ts`
Governs: price/src/walmart-sitemap.ts (discoverSkus, --indexes)
### Product identity and catalogue matching
The server calls Gemini for identity, not Shin's own catalogue: Aurik later accepted a
live-vs-imported distinction, not yet built: imported Open Food Facts answers first, a live OFF
call is only the fallback, and the answer records which was used (open: snapshot staleness). A
matched scan attaches at the closest of two stored quantities, converting units but keeping the
original; user data is never fully trusted; an unknown product becomes a new grouped entry, stored
per store branch. Substitutes draw on leaf category, one step to parent if empty, never
grandparent, labelled when looser. Alternatives split validation (farm/used price can still
validate) from genuine switching (rejected); tech items are never compared by weight. Produce
stays refused, promoted once two independent shopper reports clear the existing thresholds.
· 2026-09-21 · log: docs/decisions.md#Nine rulings so the competitor-survey build could start (item 5 addendum, Aurik's answer 2026-09-21)
Retired wording: none
Governs: catalogue/, product.ring field (leaf/parent)
### Catalogue scope: in, out, and parked
Country-in-Canada is a column on the product row, never a load-time filter: the exception is the
phone's downloadable pack, which is built by filtering to sold_in_canada = 1 and so excludes the
4,636,853 non-Canadian food rows, an 8 GB size tradeoff. The fuzzy vector-search embedding pass
stays parked at 718,662 of 5,182,591 products; word search already covers all products by name.
Books, music and Discogs records stay out of the catalogue (it is a grocery/shelf-price scanner);
the US branded-foods file is not parked with them because it is food. Shin is global from the
start, not Canada-only: same-country products compare, cross-country generally does not, except
provinces that differ sharply or EU-like regions, the Gemini prompting for this still needs design.
· 2026-09-26 · log: docs/decisions.md#Country is a column in the catalogue, not a filter applied while loading
Retired wording: none
Governs: sold_in_canada column, embedder coverage
### Attribution, provenance and correction data
Allergen comparisons stay two-state (the source can't say "checked and clean"); allergens print,
never filter. A price row may name the shop it was seen in plus a date, joined by barcode and a
store name: this is provenance, not the nearby-cheaper feature. Open Prices' contributor handle is
deliberately not stored; ODbL attribution names the source databases, frozen in attribution.ts, not
assembled from live data. eBay's Browse API answers only for used/tech, asking prices only, filtered
to Canadian fixed-price listings, never for groceries. A price a person types into the correction
screen enters the next verdict's comparison set; one person/shop/product/day overwrites rather than
duplicates, a shop name is required, sale-price is a separate opt-in flag. · 2026-09-05 · log: docs/decisions.md#A price somebody types in is a price, and it reaches the next verdict
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
hits the wall against a subscribe button that can't yet take a purchase. · 2026-09-23 · *"we should assume only 1 in 100 people pay"* · log: docs/decisions.md#Shin Plus price and the weekly free scans
Retired wording: `assuming a scan cost 0.6 cents`
Governs: SHIN_FREE_SCANS_PER_WEEK, app/public/js/plus-config.js
### Per-scan cost accepted, no catalogue-first free path
The roughly 5.6-cent per-scan cost past ~1,250 scans a month is accepted; there is no catalogue-
first free path in front of Gemini. · 2026-09-18 · *"go with the defaults for all four."* · log: docs/jamin-gemini-rules.md#walkthrough-rulings-2026-09-1617-his-notes-and-comments-on-the-google-doc-walkthrough
Retired wording: none
Governs: to fill
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
$15/$180 savings) stay hidden until real, never invented placeholders. · 2026-09-13 (bilingual, money format) · 2026-09-16/17 (onboarding) · 2026-09-18 (placeholders) · log: docs/decisions.md#The app ships in French and English from the first beta, not English-only; docs/decisions.md#Money is written the way the reader's language writes money, and only the client does it; docs/jamin-gemini-rules.md#walkthrough-rulings-2026-09-1617-his-notes-and-comments-on-the-google-doc-walkthrough
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
## Build, servers and infrastructure
### Repo, deployment and scope cuts
The repo lives on GitLab at gitlab.com/shin3223636/shin, private, Aurik Disler as Maintainer. Beta
is a native build on TestFlight/Google Play internal testing (six testers: Jamin, Aurik, their
parents), the web app wrapped rather than rewritten, native barcode plugin as fallback. Leftover
uncommitted Gemini branch code is reused where it can be, not rewritten clean or committed as-is.
Shin does not run in a browser except for testing, and is not usable offline for now. · 2026-09-17 · log: docs/jamin-gemini-rules.md#walkthrough-rulings-2026-09-1617-his-notes-and-comments-on-the-google-doc-walkthrough
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
Governs: SHIN_RATE_CODE_PER_10MIN, SHIN_MODEL_DAILY_CALLS, app/src/rate-limit.ts
## Anything else
### Mission and principles
Fixed problem statement: sellers know what things are worth and buyers are guessing, so Shin makes
the check instant enough that guessing stops being the default. Every change must be useful, easy,
visually appealing: one that can't name which it serves is not made. Channel is short-form video
(the objective function, not defensibility); primary user is a window shopper, browse over
purchase frequency; Shin is a fast follower, not a feature inventor. Every pass ships or kills
something. Aggressive tone points at the price/store/brand, never the user. · 2026-09-04 · *"useful to the user, easy to use, and visually appealling"* · log: CLAUDE.md#intro
Retired wording: none
Governs: to fill
### Marketing and positioning
The hook pairs a capability with an antagonist ("Shin tells you if you're getting ripped off"),
following Yuka's growth pattern. The launch video test runs on borrowed audiences (3-5 micro
creators, or Reddit), never a cold new account, since TikTok seeds new posts to existing followers
first. Marketing videos may show real Gemini answers, framed as showing what the app produced, not
as showing the answer to the person who asked, a reading not yet checked against Gemini's terms'
actual wording. · 2026-09-03 (hook, borrowed audiences) · 2026-09-14 (filming, *"we will show the real answers in the videos, we are not showing the answers to users, we are just showing what we see on an app"*) · log: docs/decisions.md#The hook is a capability plus a villain; docs/decisions.md#The video test runs on borrowed audiences; docs/decisions.md#Twelve rulings on the Gemini branch, answered together (item 9)
Retired wording: none
Governs: to fill
### v1 floor: live photo recognition is load-bearing
The original v1 floor (six systems, barcode/screenshot input only, live photo recognition cut as
the weakest input) is reversed: photo recognition is load-bearing and required, "the user must
take a picture and Shin must be able to identify. Nothing less." The photo path (IdentifyStage,
catalogue search, second-pass model pick) opens via POST /api/identify/photo; web search on a
catalogue miss and image-embedding search stay parked pending a measured top-1 eval. · 2026-09-09 · *"the user must take a picture and Shin must be able to identify. Nothing less."* · log: docs/decisions.md#Live photo recognition is load-bearing, and the photo door opens
Retired wording: `live photo recognition cut from v1`, `barcode and screenshot input only`
Governs: POST /api/identify/photo
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
