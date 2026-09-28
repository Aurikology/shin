# Decisions

Newest last. Each one: title, date, status, why, and the condition that reverses it. A decision
here is not a wall. It is reversed by new evidence, never by a new opinion.

---

## The problem statement is fixed
**Date:** 2026-09-03 · **Status:** active

"Sellers know what things are worth and buyers are guessing, so we're making the check instant
enough that guessing stops being the default." Adopted verbatim. Every feature argument gets
checked against this sentence, and the sentence deliberately does not require live photo
recognition, which is why that feature is out of v1.

**Reverses if:** the pricing work shows the check cannot be made instant for any category, in
which case the promise, not the feature list, is what was wrong.

## The hook is a capability plus a villain
**Date:** 2026-09-03 · **Status:** active

"Scan anything. Shin tells you if you're getting ripped off." A neutral framing like "is this
price right" has no antagonist. Yuka reached 80M users by threatening brands, not by being
informative.

**Reverses if:** the video test shows the accusatory framing depresses completion rather than
sharing.

## The verdict output is a face, not a number
**Date:** 2026-09-03 · **Status:** active

One Shin face per verdict tier. Yuka's real asset is the score people screenshot, not the scan
itself. A face is the same asset and is ours.

**Reverses if:** users cannot tell two adjacent tiers apart in testing.

## The button after the verdict is save, not buy
**Date:** 2026-09-03 · **Status:** active

The primary user is a window shopper. 70.22% of carts are abandoned and 58.6% of that is people
who were just browsing. Optimizing for a purchase optimizes for the smaller half.

**Reverses if:** watched-item costs make saving the thing that kills the margin, since re-pricing
cost scales with saves rather than users.

## The v1 floor is six systems

**Superseded in part by RULINGS.md: "v1 floor: live photo recognition is load-bearing" (2026-09-09). RULINGS.md is current; this entry is history.**
**Date:** 2026-09-03 · **Status:** reversed 2026-09-09, see "Live photo recognition is load-bearing" below

One category, barcode and screenshot input only, three faces, save and watch, a still share
card, and a branch for when the user disagrees. Live photo recognition is cut: it is the weakest
input and the problem statement does not require it.

**Reverses if:** the pricing work shows barcode plus screenshot cannot cover the chosen
category, which would make recognition load-bearing rather than optional.

## Share exports carry no download link
**Date:** 2026-09-03 · **Status:** active

Wardle left the link out of Wordle's share grid deliberately and it spread anyway. A link makes
the export read as an ad.

**Reverses if:** measured shares are high and installs from them are near zero.

## Real feed from day one, never live search
**Date:** 2026-09-03 · **Status:** active

The 2026-09-03 pilot asked search engines for live prices and got one usable range out of seven
items, with all four direct retailer fetches blocked. Same day correction: two of the three
category failures were method. New tech has an official retailer API and multiple Canadian
trackers, and new furniture has trackers plus the fact that a single seller means the verdict is
price against its own history rather than against other stores.

**Reverses if:** feed costs at real volume exceed what the product can carry, which is a live
risk since cost scales with watched items forever.

## Produce is out of v1
**Date:** 2026-09-03 · **Status:** active

Three stacked problems and no clean fix: a PLU names a category rather than a product, package
formats break unit comparison, and the public price movement is underlying inflation rather than
promotional. Shopper-reported shelf prices are the only source here, not a supplement.

**Reverses if:** crowdsourced shelf prices reach volume, at which point produce is the category
the asset unlocks rather than the one it cannot serve.

## "Shin Ramen" is dead as a name
**Date:** 2026-09-03 · **Status:** active

Nongshim's SHIN RAMYUN is registered, first use 1987, and "Shin Ramen" is the English-market
form of it.

**Reverses if:** a CIPO search clears the software classes, which would only ever revive plain
"Shin", not the two-word version.

## The video test runs on borrowed audiences
**Date:** 2026-09-03 · **Status:** active

TikTok seeds new posts to existing followers first, so a cold handle can return near zero views.
A new account cannot produce a trustworthy negative. Three to five micro creators, or Reddit.

**Reverses if:** a borrowed-audience test proves impossible to arrange, in which case a cold
account with a stated floor on what counts as a signal is better than no test.

## The repo lives on GitLab, private, with Aurik on it
**Date:** 2026-09-03 · **Status:** active

`gitlab.com/shin3223636/shin`, private, Aurik Disler (`Aurikology`) at Maintainer. A top-level
GitLab group was asked for and could not be created by the API: the account creates projects
fine but `POST /groups` is refused for every path, which is gitlab.com's identity check on new
top-level groups. The project was first pushed to the personal namespace,
`gitlab.com/jaminke/shin`. A group named "shin" (path `shin3223636`) was then made by hand and
the project transferred into it. Verified 2026-09-04 on the project's members page: two direct
members, roles unchanged, so membership survived the transfer.

**Reverses if:** Shin stops being shared work, in which case Aurik comes off the member list.

## Shin's attitude is the user's choice, not ours
**Date:** 2026-09-03 · **Status:** active

Picked by him when the redesign forced the question. `NOW.md` had this open and called it the
most underestimated decision in the plan, because it triples every string in the product forever.
It still does: every user-facing string now exists three times and the face system carries three
variants of six expressions. What changed is that the cost buys something. The riskiest tone call
stops being a guess, and which Shin someone has is itself worth screenshotting, which feeds the
borrowed-audience video test. Three personalities: Deadpan, Warm, Blunt. Default at first run is
Deadpan, because a price tool that is wrong while being cute is worse than one that is wrong
while being flat. The attitude changes the words and never the number.

**Reverses if:** the string count starts costing more than the picker returns, measured as
personalities nobody switches to. Then the two least used are cut and the default stands alone.

## The app is camera-first, and a refusal is a designed state
**Date:** 2026-09-03 · **Status:** active

The built walkthrough app was thirteen stages as thirteen pages, with no camera anywhere and a
home screen that described a camera in prose instead of showing one. The redesign makes the live
viewfinder the default route, collapses scan, identify and verdict into one surface over the
frozen frame, and gives the refusal its own colour, face and action. Refusal is not an edge case:
five of the seven known items refuse, so it is the most common outcome of the primary action.
Hue carries the verdict, saturation carries the confidence, and grey means no data so that red
keeps meaning the price is bad. Spec in `docs/design/DESIGN.md`, which wins over any screen.

**Reverses if:** the camera turns out not to be how people reach for this, which would show up as
scans per session near zero against watchlist opens. Then the list becomes the default and the
camera becomes a button on it.

## The primary action sits in the verdict's peek detent
**Date:** 2026-09-03 · **Status:** active

Decided in `docs/design/USAGE.md` section 7. `DESIGN.md` section 4 put every action in the full
detent. Save is the decided primary act and the only entry to the return loop, so requiring a drag
to reach it costs saves for nothing, and the peek is where the user is already looking. The label
is keyed by tier: Save it on a good price, Watch it on fair and walk away, because telling someone
to watch a price that is already good is telling them to wait for no reason. Correct it and Share
sit at half, in that order, because correction is the only action that exists on every outcome
including a refusal.

**Reverses if:** the button at peek is mis-tapped while reading, which would show up as saves
immediately followed by an unsave.

## A refusal hands back exactly one action and never spends anything
**Date:** 2026-09-03 · **Status:** active

Decided in `docs/design/USAGE.md` section 4. Refusal is the most common outcome, five of seven.
Two equally weighted pills at the moment of disappointment is a choice about how to feel and the
user takes the exit, so the second one becomes the downward drag that already dismisses the sheet.
The one action gives before it asks: Shin records the price the user read, dated and attributed to
a named seller, which is a thing it verifiably did rather than a favour it requested. The refusal
never promises to look again, because there is no re-queryable source and a capability claim the
app cannot honour sits in the same family as a fabricated price.

**Reverses if:** the correction rate after refusals is near zero, in which case the action is wrong
rather than the count.

## With no asking price, Shin shows the going rate rather than refusing
**Date:** 2026-09-03 · **Status:** active

Decided in `docs/design/USAGE.md` section 2. The couch is the majority install case, because the
video that installs the app is watched on a couch, and an object on a desk has no price tag. The
engine's `no_asking_price` refusal would put the majority install case into the product's grey
state while Shin is holding a complete comparison set and is short of exactly one number. So that
case draws as a neutral going-rate card with the range as the hero and one action, and it reaches
value faster than the aisle does because nobody types a price.

**Reverses if:** users read the range as a verdict, which would show up as saves and shares of a
card that never carried a judgment.

## Nearby-cheaper and dupes are out of v1
**Date:** 2026-09-03 · **Status:** active

Decided in `docs/design/USAGE.md` section 7. Nearby-cheaper needs store-level price and stock plus
a location, and the pilot's four direct retailer fetches returned zero prices with three 403s. A
wrong "cheaper 1.6 km away" sends a person on a trip on a fabricated claim, which is the worst
failure available to this product. Dupes are easy, since the notes establish a dupe is same
category with a lower unit price rather than a similarity model, and they wait on volume instead:
seven corpus items cannot return a recognisable alternative.

**Reverses if:** for nearby-cheaper, a store-level feed for the lead category exists and has been
checked against a shelf by hand; for dupes, the lead category holds enough items that the query
returns something a person recognises as the same kind of thing.

## The v1 return trigger is the store, not a notification
**Date:** 2026-09-03 · **Status:** active

Decided in `docs/design/USAGE.md` section 5. Ranked by dependence on data Shin does not have, the
strongest return trigger is a watched price dropping, and it is also the only one that needs a
per-item source re-queried on a schedule forever, at a cost that scales with saves rather than
users. Shin has never successfully queried such a source. Building the notification before the
feed produces either silence or a drop that did not happen. So v1 ships no push notifications and
does not ask for the permission, since asking before there is a message spends the one ask the app
gets, and the in-app badge is the whole system until then.

**Reverses if:** a re-queryable source ships for the lead category, at which point the price-drop
notification is built first and the permission is asked immediately after the first save.

## Scans are not metered in v1, and nothing earns one back until a price is confirmed
**Date:** 2026-09-03 · **Status:** active

Drafted twice and merged here, because `docs/design/USAGE.md` section 6 and
`docs/design/GAMIFICATION.md` section 5 decide the same thing from two sides: whether Shin meters,
and what could ever refill the meter.

OLMA meters and shows "3 Scans Remaining", and the fast-follower rule says copy what works, but
the reason does not transfer: OLMA's meter is priced against an image identification cost that the
v1 floor cuts, the primary user is a window shopper and a cap taxes exactly the browse behaviour
the product is for, and five of seven scans refuse, so a meter either charges for the product's
own gap or does not tick. The switch is built and defaults to off, and the zero state, the daily
allowance floor and the earning condition are specified so that turning it on is a release rather
than a rewrite. A refusal never spends a scan, at any setting.

Nothing earns a scan back until a contributed price is confirmed by a second independent
observation, because paying for asserted prices pays for invented ones. That confirmation is not a
check to add later, it is a layer with six preconditions Shin has none of: a contribution object
rather than a typed number, a seller identity resolvable in an aisle, a per-category freshness
window, independence defined mechanically rather than assumed, a disagreement rule that keeps
unconfirmed prices out of every comparison set, and enough users per store for a second
observation to arrive at all. Independence requires accounts, so accounts are a precondition of
earning rather than a separate roadmap item. When the meter turns on, earned scans are the first
mechanic in the product, because the meter creates the scarcity and no other reward gets a person
a verdict; they are the second thing in the build order, because granting the scarce resource for
an unchecked number is the exploit rather than the feature. The earning path is not advertised on
the zero state until it demonstrably fires.

**Reverses if:** per-scan cost at real volume exceeds what a free tier carries, or the first
thousand scans show a distinct-products-over-total-scans ratio near 1:1, which is the point at
which caching does not rescue the unit economics. Either one turns the meter on. Separately, if
per-store density stays too low for second observations to arrive, earning is not a mechanic that
can exist at this size, and the meter, if it is ever on, has only the subscription behind it.

## No v1 mechanic pays for a reported price
**Date:** 2026-09-03 · **Status:** active

Shin's core act produces the data Shin is judged on, which is the difference between this product
and every gamified app it could borrow from: a Duolingo lesson produces nothing but learning, so
paying for lesson volume is safe, while paying for scan volume pays for price noise and paying for
"good prices found" pays for inventing them. (This paragraph originally leaned on a "no fabricated
price data" hard rule and an accuracy-first priority; both were Claude's, not his, and were
retired 2026-09-06 on his word. The decision still stands on its own reason: paying for scan
volume pays for price noise, and the open question of whether reporting a price earns anything
is his, recorded in NOW.md.) So no v1 mechanic is
denominated in scans, cash, entries, rank or badges, and the only price-touching behaviour that
will ever be paid for is one a second party confirmed. The full enumeration of eighteen mechanics
with the exploit and the corruption path for each is in `docs/design/GAMIFICATION.md` section 2.

**Reverses if:** a confirmation layer exists that makes a reported price checkable by a second
independent observation, at which point what is paid for is the confirmation and never the report.

## The v1 reward set is four things the user already does, plus a thumb that earns nothing
**Date:** 2026-09-03 · **Status:** active

Decided in `docs/design/GAMIFICATION.md` section 6. Five mechanics ship: the thumbs signal on a
verdict rewarded with nothing, the attitude picker and share card as identity, the watched item as
a stake the person placed, a weekly line drawn from their own record, and the record-only form of
"Shin was right". Every one pays in acknowledgement rather than in a scarce resource, so none can
be counterfeited into a price, and every one applies to a window shopper in an aisle rather than
to a person with a daily habit. The thumbs tap ships deliberately unrewarded: it is the highest
value tap on the verdict surface because a person can tell a verdict is wrong faster than they can
tell you the right number, and attaching a reward to it would destroy the only calibration signal
that user can give. The walkthrough's version of "Shin was right" claims a skipped item stayed
overpriced and is labelled there as needing no data; that form asserts a price fact with no
re-check and is not shipped, so what ships restates what Shin already said, on a date, about a
named seller.

**Reverses if:** the thumbs rate is near zero, in which case the tap is in the wrong place rather
than wrongly unrewarded; or the weekly line reads as manufactured, which would show up as it being
dismissed rather than opened.

## Volume mechanics are killed: streak, leaderboard, badges, collection completion
**Date:** 2026-09-03 · **Status:** active

Decided in `docs/design/GAMIFICATION.md` section 6. Each pays for more of the core act and each is
gamed by re-scanning a cupboard. The streak and the badges corrupt the
distinct-products-over-total-scans ratio, which is the instrumented number that decides whether
caching rescues the unit economics, and they spend real per-scan money to do it. The leaderboard
is the sharpest case: it carries Duolingo's largest published retention effect, CURR up 21% and
daily churn down over 40%, and it is also the mechanic that most directly pays a person for a
number nobody checked. Priority 1 decides between those two facts and decides against the
leaderboard. Collection completion asks a window shopper to shop for the app over categories that
are partial by design.

**Reverses if:** for the streak, browse sessions with no store visit turn out to be daily and a
confirmation layer can distinguish a real aisle scan from a repeat, both rather than either; for
the leaderboard, confirmations become the rankable unit, at which point the surface returns
ranking confirmations rather than reports; for badges, they attach to confirmations rather than
counts; for collection completion, the lead category's catalogue is complete enough that a set
means something to a person.

## Draws, sweepstakes and cash bounties are out of v1, on the data argument before the legal one
**Date:** 2026-09-03 · **Status:** active

Whatever a draw entry is priced against is what gets manufactured, and paying cash per reported
price is a purchase order for fiction, since the payout curve and the fraud curve are the same
curve. With no accounts in the v1 floor there is no one-entry-per-person to enforce either.
Separately, and to be checked by him rather than asserted here, Canadian contest law is unsourced
anywhere in this repo: the questions to put to counsel before any draw is announced are listed in
`docs/design/GAMIFICATION.md` section 3 and cover lottery treatment, promotional contest
disclosure, Quebec's separate obligations, app store promotion rules, and what paying a person for
a shelf price does to their status. The kill does not depend on how those resolve, because the
data argument stands whatever the legal answer is.

**Reverses if:** a confirmation layer exists so entries are earned by confirmed contributions, the
legal questions come back clear, and there is money for a prize. All three.

## The saved-money tally is not shipped, and its only honest form is a spread
**Date:** 2026-09-03 · **Status:** active

Decided in `docs/design/GAMIFICATION.md` section 4. Hard rule 2 and Competition Act s.74.01(1)(b)
require adequate and proper testing before a performance claim is published, and "Shin saved you
$412" is a claim about money that never moved for a user who did not buy the thing. The repo
already rejected this claim on someone else's screen: the OLMA audit rejects the paywall's "Pays
for Itself, With one good find" for the same reason. The only form that may ever ship is the gap
between the asking price and the lowest comparable Shin actually held, named as that gap, counted
only over scans where a comparable set existed and confidence was certain or fairly sure, shown
beside the count of scans it does not cover, and excluded from every export, because on the device
it is an observation and off the device it is a published performance claim. It is not in v1
because the engine answers two items in seven, so the number would be computed from the minority
of scans and read as though it covered all of them.

**Reverses if:** a comparable set exists on the majority of scans in the lead category, at which
point the spread form ships as specified and the word "saved" still never appears.

## The widget and co-watch wait on the feed, not on a design decision
**Date:** 2026-09-03 · **Status:** active

Decided in `docs/design/GAMIFICATION.md` section 6. The owl analysis names the widget the
strongest take available, because it reaches the person without asking for their schedule and
Shin's value arrives at a moment it cannot predict. Co-watch is the Friend Streak with the trigger
changed from a person being idle to a price moving, which is the only version that survives hard
rule 4. Both are gated on the same thing as the price-drop notification: a per-item source
re-queried on a schedule, which Shin has never successfully queried once. A widget whose number
never changes shows a stale price as a current one, which is a fabricated price with a nice
layout, so the honest form carries the date it was checked and the face tracks the price and never
the person's inactivity.

**Reverses if:** a re-queryable source ships for the lead category, at which point the widget is
built immediately after the price-drop notification, and co-watch after accounts.

## The viewfinder acts first and speaks last, and only four things earn a sentence
**Date:** 2026-09-05 · **Status:** active

The camera guidance system, decided against the OLMA walkthrough. OLMA taught the same five
photography rules on four separate surfaces (audit rows 14, 31, 32, 87), all of them before
anything had gone wrong, and the recording shows the user acting on none of it. An instruction
delivered before the failure teaches nothing, because none of it has happened yet.

So the ordering is: the camera does everything it can about a bad frame itself, silently, and
only asks the person once its own moves are spent. It reads a barcode every frame, marks the one
it is part way through reading, boxes the object, offers the other objects as taps, lights the
shelf, puts its own torch back out when the torch is what is blowing the label out, and zooms
toward a small object. Only then does it say one line.

Four measurements earn a line, each mapped to one action: a barcode agreeing with itself (hold
it there), clipped pixels inside the box (tilt it), a crop too narrow to carry fine print with
no zoom left (step closer), and more than one object in frame (tap the one you mean, said once
per session because it teaches a control rather than fixing a shot).

Three of the obvious candidates are deliberately absent. "Move back" is not a real aisle failure,
and where it does happen the camera zooms out instead of asking. "The lighting is bad" states a
fact the person can see and cannot change; glare replaces it, because glare is the light failure
a single small movement fixes. "Bad angle" has no cheap measurement for arbitrary packaging and
angled packaging photographs fine; the only place angle actually breaks something is a barcode,
and that case is covered exactly.

**Reverses if:** a measured refusal rate falls when a rule is shown before the failure rather
than at it, or a fifth measurement is found that predicts a wrong identification.

## Allergens are two-state, because the source cannot say "checked and clean"
**Date:** 2026-09-05 · **Status:** active

The comparison between two products says either what changed or that it does not know, and it may
never say an item was checked and found clear of something.

This is a property of the data, not a choice about wording. `catalogue/data/canada.parquet` carries
exactly one allergen column, `allergens_tags`: 13,209 rows have values, 111,437 are empty and 217
are null. There is no `states_tags` and no `ingredients_text` to derive intent from, and
`catalogue/src/prepare_rows.py:243` collapses what is left with `or []`. Open Icecat's 494,513 rows
are empty by literal assignment. Coverage over the Canadian food rows is 13,037 of 122,154, which
is 10.7%.

An empty array therefore means two different things that the data cannot separate: nobody has
entered allergens for this product, and this product genuinely contains none. Every wording that
treats empty as the second reading is a fabricated claim about food, which is the worst category of
claim this system could make. "Same allergens recorded" is the specific sentence that is banned,
because a shopper reading it about two items that both have empty arrays has been told they match
when nothing was compared.

So: both sides carry tags, and the row names what is added and removed. Either side is empty, and
the row says the allergens are not recorded for one of them and to check the packaging. In the
second case the added and removed lists are left empty rather than computed, because no comparison
happened and a partial one presented as whole is the same error in a smaller font.

Two states of knowledge, three sentences. The third is the case where both products carry tags and
the tags agree, and it reads "No difference in the allergens recorded." That is a statement about
two records agreeing, which is true and checkable. It is deliberately not "Same allergens", which
would be a statement about the products, and it is not the banned wording, which claims the pair was
checked and found clean. The distinction is thin on the page and total in meaning, so it is written
down here rather than left to whoever next edits the string: the sentence may describe what the
records say, and may never describe what is in the food.

This changes the wording and not the policy. Allergens are printed and never used to filter, for
the reason already on record: filtering silently shrinks the list with no explanation, and 89.3% of
products would be filtered on absence of data rather than on presence of an allergen.

**Reverses if:** a source ships that distinguishes "no allergens present" from "no allergens
entered", at which point the third state is added and the not-recorded sentence stops covering both.

## The store name is provenance, and it is not the nearby-store feature
**Date:** 2026-09-05 · **Status:** active

A price row may name the shop the price was seen in, and a date. That is the whole of it. There is
no distance, no map, no tap through to directions, and no ordering of results by how close a store
is.

The distinction matters because the two look identical on a screen and are completely different
promises. Naming the shop says where this observation came from, which is checkable against the
photograph it came from. Telling someone a store near them is cheaper says the price is true there
now, which requires a store-level feed nobody has checked against a shelf. The condition for
building the second one is already on record and is unchanged: a category with a store-level feed
someone has verified against a shelf. This entry does not meet it and does not reverse it.
"Nearby-cheaper and dupes are out of v1" still stands.

The store name is printed only when the price was joined to the product by barcode AND a store name
exists. Both conditions, each for its own reason. Counted 2026-09-05 over 896 rows: 782 joined by
barcode, of which 700 carry a store name across 377 distinct products; 82 barcode-joined rows have
no store, so a join-method-only gate would print a blank; 14 rows joined by name, all from
walmart.ca, none of which carries a store name today, so the join-method half of the gate cannot
currently fire on any row. It is kept anyway, because walmart.ca is the only name-joining seller and
is exactly the one that could gain store names later. A name join can attach a price to the wrong
product, and a real shop's name beside a wrong price is worse than no shop at all, because the shop
name is precisely what makes it feel checkable.

The date goes on every row regardless of join method, and is not decoration. Prices in the table run
from 2020 to 2026. It is the only thing stopping a shelf tag photographed in 2024 from reading as
today's price.

Every row on a screen carries a provenance clause or none does. One row saying where it came from
beside two that do not reads as those two being unsourced rather than differently sourced.

Display is by name; identity is never the name. Two Fortinos are two stores, and the composite
`store_osm` value, of the form "WAY/120689533", is what distinguishes them. Self-exclusion and
distinct-seller counting key on that and never on the printed name.

What goes wrong if you key on the name anyway is the half that makes this non-obvious, because
keying on the name looks like a strict improvement over keying on nothing. The failure is
symmetrical. It fixes the shopper's own store failing to be excluded from its own comparison, and it
creates the mirror: a genuine competitor across town sharing a banner gets excluded as though it
were the shopper's own store. Both come out on screen as the word fair. Only one of them is ever
visible in testing, because two Fortinos in a comparison set look like a duplicate and a missing
Fortino looks like nothing at all.

The seller field gets the same treatment one level up, and for the same reason. A seller is printed
as a shop only if it is on an explicit list of places a shopper can actually walk into. The first
version of that check asked whether the seller was not "openprices", which is a denylist of one: it
fixes the string that had already caused the bug and silently re-creates it for the next donated
feed added, whose name would print as a shop on its first run with no test failing, because no test
covers a seller that did not exist when it was written. Inverted, forgetting to add a real shop
costs a vaguer sentence instead of a false one.

**Reverses if:** a category gets a store-level feed checked against a shelf, at which point distance
and the map tap are reconsidered on their own merits and this entry stops being the reason not to.

## The Walmart search leg is dropped, and the sitemap is its named replacement
**Date:** 2026-09-05 · **Status:** active

`search()` in `price/src/walmart.ts` fetched `/search?q=...`. `walmart.ca/robots.txt` disallows
`/search?*` under `User-agent: *` while explicitly allowing `/en/ip/*/*`, which is what `detail()`
already used. The discovery half of the crawl was therefore fetching a path we were asked not to
fetch, and the fix is deletion rather than a delay between requests. The crawl now works from SKUs
already in the observation table.

Deleting the code did not delete what it taught, and both things it taught are kept in the file
header. Walmart does not index barcodes, which is why search-by-barcode never worked. And the same
robots.txt publishes a product sitemap index whose five shards carry 43,532 product URLs each,
roughly 217,660 in total, all under the allowed path, with the SKU as the last path segment.

That matters for a reason worth stating plainly, because it was got wrong twice in conversation
before it was checked: dropping the search leg does NOT freeze Walmart at its current 22 rows
permanently. The sitemap is a sanctioned route to the same discovery. Nothing is built against it
here, deliberately. It is recorded so the next person does not rediscover it and so the decision to
use it is taken on purpose.

One rule attaches to it in advance. Walmart's product URLs carry a human-readable slug before the
SKU, and the slug is not a product identity. The slug may choose what to open, never what it
matched. Anything harvested this way is confirmed by fetching the detail page and reading the
barcode, exactly as `detail()` already does.

The 15.7-day crawl estimate was removed rather than corrected, because it described a
search-and-confirm shape that no longer exists and a stale estimate is worse than none.

**Reverses if:** robots.txt changes to allow the search path, which would still not bring `search()`
back, because the sitemap route is cheaper and more complete than paging search results.

## The contributor's handle is not collected, and attribution names the databases
**Date:** 2026-09-05 · **Status:** active

Open Prices returns the contributor's username on every price. Checked against the live API on
2026-09-05: the payload carries `owner`, a real handle, and `owner_comment` beside it. Shin parses
neither and stores neither, and the `ApiItem` type deliberately does not declare them.

That is the right default and it is not a licensing shortcut. The Open Database Licence requires
attributing the database, not each person who contributed a row, and the attribution screen does
exactly that: Open Food Facts, Open Beauty Facts, Open Pet Food Facts, Open Products Facts, Open
Prices and OpenStreetMap named as ODbL sources, with Open Icecat named separately because its terms
are its own and are not ODbL.

The reason for not storing the handle is the shape of what would be built with it. A handle beside a
store name and a date is a record of where a named individual shops and when, assembled by us out of
rows they contributed to a database for a different purpose. Storing it costs nothing today and
creates that record permanently. Not parsing it is the version that cannot leak.

The attribution list is a frozen literal in `app/src/attribution.ts` and is never assembled by
querying the databases. It is a legal statement, and a legal statement that changes silently
depending on what happened to be loaded is not one.

**Reverses if:** the founder decides contributors should be credited individually, which is his call
and not a technical one. If it ever happens, it is a display of a handle the contributor already
published, never a stored per-person history, and the licence obligation is unchanged either way
because it was already met by naming the databases.

## eBay answers for used and tech, in asking prices only, and never for groceries
**Date:** 2026-09-05 · **Status:** active

The eBay account cleared review, so the Browse key is available. What it buys is narrower than the
plan on record assumed, and the scope is set here so it is not re-litigated later.

IT CANNOT SEE WHAT ANYTHING SOLD FOR. Sold and completed listings live behind the Marketplace
Insights API, which eBay describes as a Limited Release, restricted and not open to new users, and
which recent developer reports say is granted to major partners only. The free Browse key does not
reach it. So every point this source can ever produce is an asking price, which the price contract
already defines as upward-biased and never a clearing price.

That is the same wall the 2026-09-03 pilot hit from the other side. Pricing a used Canon EOS R6 it
recorded eBay sold listings "under US$2,000" and correctly refused to use them, for two reasons that
both still stand: a bound is not a point, and it was in another currency. Nothing about the key
changes either. The adapter is built so neither can recur structurally rather than by anyone
remembering, and the price type admits only Canadian dollars, so a US listing cannot be represented
even by accident.

NOT A GROCERY SOURCE. The adapter covers used and tech and deliberately not grocery. eBay grocery
listings are bulk cases, imports and collectible packaging, and none of those is a comparable for a
single box on a Canadian shelf. Adding grocery would put pantry-sized prices beside single units and
be wrong in the app's lead category, which is the one place it can least afford to be.

Four filters, each preventing a wrong number rather than a noisy one, because a missing comparable
makes the app refuse, which is an outcome it is designed for, while a wrong comparable produces a
confident verdict about a price that does not exist:

- Canadian marketplace requested, and every item's own currency checked against CAD regardless. The
  marketplace header is a request; the per-item currency is the fact.
- Fixed price only. An auction's current bid is not an asking price, and one $1 opening bid would
  enter the comparison set as a $1 camera and drag a verdict to walk-away.
- The delivered price, item plus stated shipping. A listing whose shipping is not stated is skipped
  rather than assumed free, because an unknown read as zero is the same shape as the invented stock
  flag: an absence recorded as a favourable fact.
- Located in Canada, since duties and weeks of delay are not in the price.

Unverified until it is run. `verified` is false and stays false until somebody runs it with a real
key and puts the result in the scoreboard, because an unverified adapter returning nothing looks
exactly like a category with no prices. Setting the two credentials is the only step left.

One thing left open rather than settled quietly. Every listing becomes its own point with its own
seller, because ten people asking ten prices for a used lens genuinely are ten independent
observations. But confidence counts distinct sellers, and no previous source could produce ten of
them from one marketplace in a single call. If a confidence band ever reads high on the strength of
eBay usernames alone, the repair is a per-source seller cap in the spine, not a change to the
adapter.

**Reverses if:** eBay grants Marketplace Insights access, which turns this from the weakest source in
the system into one of the strongest, since a sold price is the rarest and most useful kind of number
the spine can hold. Nothing else about this entry changes if that happens.

## A price somebody types in is a price, and it reaches the next verdict
**Date:** 2026-09-05 · **Status:** active

The correction screen has existed since the first build and what it collected went nowhere: the
client store said so in its own comment, "collected, applied to nothing yet". A person stopped in an
aisle, typed a price with one hand, and the app thanked them for it and threw it away. That is the
one loop in this product that turns use into something the product owns, and it was the only one not
built.

It is built now. A correction is stored server side, read back by a new spine source, and enters the
comparison set for the next verdict on that product. Measured on the running app the day this
shipped, on Lay's Classic Potato Chips against an asking price of $4.99: before, one price from
walmart.ca and the sentence "1 price where groceries and household usually needs 2"; after one
correction of $3.99 at No Frills, two prices and a verdict line reading "about $3.73 across 2
stores".

**Five things it does, each of which was a way to get this wrong.**

*A typed price never identifies a product.* The source returns null from `identify()` on every
query and always will. A person is telling us what a tag reads, not what the thing is, and a
mistyped correction that could resolve identity would be able to pull a later scan onto the wrong
product. That is the pilot's worst failure class, where every price returned was accurate and all of
them were about a different camera.

*One person, one shop, one day, one price.* The store refuses to file a second row for the same
person, shop, product and day; a repeat overwrites, because the newer reading of the same tag is a
correction of the earlier one and not a second witness to it. Without this, one person tapping save
twice manufactures the agreement the product waits for, and the app tells them their own number is
confirmed.

*The shop is required.* Most rows from the crawled feed cannot say which shop a price came from, so
the spine cannot drop them from their own comparison. A correction can, because the shop is the one
field the screen will not save without, and the self-exclusion key is asserted against the spine's
own to a test so the two cannot drift apart. Standing in No Frills, a No Frills correction leaves
the comparison. That was verified on the running app, not reasoned about.

*A sale price stays a sale price.* One tap, defaulting off. It is the only thing on that screen
allowed to compete with the keypad, and it is there because collapsing a promotion into an everyday
price is the mistake the contract calls the most expensive one available: a shopper reading a sale
tag into a field meaning regular walks the usual price down for everybody who scans that product
next.

*The write is local and the send is separate.* The place a correction is typed is the place the
signal is worst. The correction is saved on the phone first and queued, the screen thanks the person
for the local write, and the queue drains later, retrying with an id it generated so that a retry is
provably the same correction and never a second witness.

**Written for a phone app, not for a browser.** Everything durable is on the server, keyed by the
random per-device id that already exists, so a reinstall does not erase what somebody contributed,
and the queue shape is the part a Swift or Kotlin client re-implements without the server knowing
which kind of client is talking to it. Two things that do not exist yet follow from this and are
named here rather than discovered later: that device id has to move into the Keychain and the
Android keystore, or a reinstall silently becomes a new person; and corrections are the only data in
this project that cannot be rebuilt from a re-crawl, while the directory they sit in is gitignored
because everything else in it can be.

**What this deliberately does not do.** It cannot tell a mistake from a lie. One person cannot
become two, but two devices reporting the same wrong number are indistinguishable here from two
honest shoppers. What limits the damage today is that they still count as one distinct seller, so
the confidence band cannot read high on them.

**Reverses if:** corrections turn out to be poisoned faster than they are useful, which is a
measurement on the stored rows and not a guess, and the repair is a check against the distribution
of other readings of the same shelf rather than removing the source.

## The camera's standard is applied outward, and the tier palette is measured
**Date:** 2026-09-06 · **Status:** active

`docs/design/FLAWS.md` (2026-09-04) found that "the camera surface is genuinely designed.
Everything behind it is running on defaults", and named the cost: a user who taps into Saved or You
crosses a line where the craft stops. This pass takes that finding as the brief. It executes
`DESIGN.md` rather than replacing it; no new visual direction was proposed and none is wanted.

**The tier palette was asserted, not measured, and two of four pairings were wrong.** `DESIGN.md`
section 1 says of the text-on-tier pairings: "This is not a preference, it is the only pairing that
clears contrast on each field." Computed: `--walk-on` on `--walk` was 3.80 against the 4.5 that
text under 24px needs, and 3.23 once camera.css's `opacity: .88` on Shin's own sentence was applied.
`--unknown-on` on `--unknown` was 3.51, and 3.09. Walk away and refusal are five of the seven
outcomes the engine can reach, so this was the product's main output failing to be readable while a
design document asserted it could not fail. `--walk` and `--unknown` are darkened 19% and 22%
toward black -- the fields, not the text, so the hue survives and Law 2 still holds.

**Light theme never re-themed the tier bases at all.** It re-themed the four `-bright` variants and
stopped, and the bases are what `[data-tier]` binds `--tier` to, so every piece of tier chrome in
light theme was painted a colour picked for a near-black ground: `good` 2.32 and `fair` 1.96 against
a 3.0 floor. "Hue is the verdict" was not true in light theme for the two most common non-refusal
outcomes. Four light bases are added and the four light `-bright` values darkened to carry text.

**One correction to FLAWS.md.** Its P0 #1 table lists "white on `--walk-bright` 2.84" as a failure.
No rule in the app draws that pairing: `--tier-bright` is text on a dark tint in the thin and
refusal sheets, never a field behind white. Measured as used it was 6.11 and passing. The row is
wrong; the two rows above it were right, and were the real defect.

**A component layer exists now.** `components.css` holds one `.btn` base carrying one focus ring --
camera.css line 239's own rule, "2px at 3px offset, the ring every other control on this screen
already draws" -- plus the row, the field, the label and the money figure. The shell's four controls
had zero focus rules, zero transitions and no hover gating while the camera had all three on all
seven of its controls. Existing class names are addressed directly rather than migrated, because
changing markup across nine screens while five lanes are editing those screens loses the merge.

**No build step.** It was considered and cut. `screens.css` already `@import`s its stylesheets so a
component layer costs one line; custom properties give the scale; `test/faces.test.mjs` already
imports a browser module directly under `node --test`, so front-end code is testable with no
tooling. A `src/`-to-`dist/` split would have moved every path on the day five lanes were editing
those paths, and `server.ts` serves `public/` directly, so "run it" stays one command for the
person this branch exists to show it to.

**Reverses if:** a measured pairing is shown to be measured against the wrong ground -- the tints
in particular are computed from `color-mix` against `--ground`, and camera.css currently hardcodes
`#0B0C0E` in three places, so if that hardcode is kept deliberately the light-theme tint numbers in
`test/tokens.test.mjs` are checking a surface that is not drawn. Or if the type roles turn out to
need a seventh, which would mean DESIGN.md section 2's table is short rather than that the roles
were the wrong shape.

## The price judge answers where the category cannot, and thin evidence stops being a refusal
**Date:** 2026-09-08 · **Status:** active

His instruction, 2026-09-05: *"The worst thing this app can do is tell people it doesn't know
because that literally wastes the users time."* That day two things were done in its name and only
one of them shipped. The count thresholds in `spine/src/spine.ts` became named shortfalls on the
answer, which is real and is still in place. And `price/src/verdict.ts` was rewritten to answer off
a single seller, with the doubt in a confidence number, and was then imported by nothing but its own
test. For three days the app served an older path while a function written to his correction sat
unreachable.

What nobody checked on 2026-09-05 was the filter stage sitting IN FRONT of the thresholds. The
corpus note written that day says all five pilot refusals were empty hands rather than thresholds.
Two of them were not. Tide was refused holding a Walmart price, because Walmart was also the shop
being stood in, and the WH-1000XM5 was refused holding a manufacturer list price. Both are a
seller's number, both drew a blank screen, and both are the outcome he named as the worst available.

So the stage that empties the comparison set now names itself as a shortfall on the confidence and
`judge()` produces the verdict, in production, through `/api/price`. Three refusal reasons stop
firing: `unusable_price_kinds`, `points_too_stale`, `all_points_from_asking_seller`. They stay in
the contract's union, unreachable, the way `too_few_points` already does.

**`judge()` is deliberately not put in front of `CategoryRule.judge`.** The four served categories
ask four different questions and grocery's two lines, used goods' 25th percentile and furniture's
own-history sentence are the part of this worth shipping. Routing every set through one comparator
would have removed the refusal and flattened the product in the same move. The category judges every
set it can compare; the price judge answers only where the category's own filters left it nothing,
which is exactly where the alternative was a blank screen.

**What still refuses, and none of it is a threshold.** No price at all from anybody, which is zero
sellers and has no answer at any confidence. No price on the thing in front of the shopper. An
identity below the category floor, because a number attached to the wrong product is the pilot's own
worst failure. Every price dated after the moment being priced, which is a broken record rather than
thin evidence. And produce, which is refused on **"Produce is out of v1", 2026-09-03, active**: a PLU
names a category rather than a product, package formats break unit comparison, and the public series
measures underlying inflation rather than the shelf. That decision reverses on crowdsourced shelf
volume, not on one more price arriving, so the 2026-09-08 wiring does not reach it.

Measured, not reasoned about: pilot corpus coverage moved 2 of 7 to 4 of 7, the first time it has
moved at all. Read it for exactly what the harness says it is, which is how often the spine will
answer and never whether the answer is right. Two of those four answers now rest on a single price.

**Reverses if:** a single-seller answer is shown to be worse for a shopper than the blank screen it
replaced. The shape to watch for is already visible and is logged as D-045: where the only price we
hold equals the price on the tag, the range has zero width, and `judge()` calls that position
zero, so the sentence reads "at the low end" over a set with no low end. Low confidence and a named
reason sit beside it, but hard rule 3's neighbour still applies, that telling someone a price is
good when it is not is the only mistake on this screen that makes them spend money. If that reads
as a lie to him or to a tester, the fix is `judge()`'s tier ladder for a single-point band, not a
return to refusing.

## D-045 resolved: zero-width band tier logic
**Date:** 2026-09-08 · **Status:** resolved

When the band has zero width (one price or multiple sellers agreeing), `judge()` now compares the asking price directly to that number: equal yields fair tier with "matches", below yields good with "less than", above yields high with "more than", replacing the old "at the low/high end" wording that made no sense for single-point ranges.
## Sitemap discovery is built, and the marketplace tail is out of reach on purpose
**Date:** 2026-09-08 · **Status:** active

The 2026-09-05 decision above dropped the Walmart search leg and named the product sitemap as its
replacement, then deliberately did not build it. `docs/beta-readiness-audit.md` found the cost:
896 observations over 438 distinct products against a 5.18 million row catalogue, with "the
designed replacement (reading their sitemap instead) exists only as a comment, not as code". It is
code now, in `price/src/walmart-sitemap.ts`, and reachable as `crawl.ts --discover`.

**robots.txt was re-read live before a byte was fetched**, 2026-09-08, and it still says what the
earlier decision said it said: `Disallow: /search?*` closed, `Disallow: /en/ip/*` then
`Allow: /en/ip/*/*` open, and sixteen `Sitemap:` lines including the six product indexes. There is
no `Crawl-delay` for `User-agent: *`; the only one in the file belongs to Bingbot. Absence of a
published limit is not permission, so the crawler imposes its own 3,000 ms floor and still reads
the file each run, so that a `Crawl-delay` added later wins over our floor without anyone noticing
it appeared.

**The sizes are counted, not estimated, and they decide the shape of the feature.** The first-party
index has 5 gzipped children at 43,532 product URLs each, about 217,660 SKUs. The marketplace head
has 19. The marketplace tail has 1,848, and a randomly sampled child of it held 44,980 entries,
which puts that set near 83 million. Ten product pages opened at the polite rate averaged 1,277 ms,
so one SKU costs 4.28 seconds start to start: 10.8 days for a full first-party pass, 42 days for
the marketplace head, and eleven years for the tail.

**So `discoverSkus` defaults to the first-party index alone and the other two need `--indexes` by
name.** That is the decision, and it is a refusal, not an omission. Eleven years is not a slow
crawl, it is a proof that walking 3p exhaustively is the wrong shape, and a default that silently
started down it would look like it was working for the first several days. What brings any of these
numbers down is choosing which SKUs are worth opening, which is `queue.ts`'s job, never a shorter
delay against a site that is already behind PerimeterX.

**One SKU is one page open, and the slug still decides nothing**, per the rule attached in advance
on 2026-09-05. The sitemap chooses which page to open; `detail()` reads the barcode off that page;
`sources.ts`'s `joinToProduct` decides whether it joins. A discovered SKU whose barcode is not in
the catalogue is written as an unjoined observation, `code` NULL, exactly the case `store.ts`'s
header describes, so the price survives for a later catalogue to resolve and no verdict can be
built on it in the meantime.

**Walked, not asserted.** Five real SKUs off the live first-party sitemap, opened on 2026-09-08:
all five returned the real page with a price and a barcode, none returned the PerimeterX challenge,
and the run recorded five `crawl_attempt` rows. Re-run against a two row stand-in catalogue, two
of the five joined by barcode and wrote `join_method` 'gtin' rows and the other three stayed
unjoined with the barcode named in the note. The 12-digit-to-13 padding was exercised on the way:
the page published 990370255035 and the join found 0990370255035.

**Reverses if:** Walmart adds a `Crawl-delay` for `*` that makes even the first-party pass
pointless, or publishes a Marketplace API key we can get, which would beat this on both cost and
completeness and would retire the crawl rather than tune it. Or if the joined fraction of
discovered SKUs turns out to be low enough that walking a general sitemap is the wrong instrument
for a grocery-and-electronics catalogue, in which case the answer is a category-scoped source, not
a faster walk.

## The vision call gets a clock, one retry and a ceiling, and a failure says which failure it was
**Date:** 2026-09-08 · **Status:** active

`docs/beta-readiness-audit.md` found no timeout, no retry policy and no spending cap anywhere in
the code that calls the vision model, and every failure on that path arriving as the same
sentence: the photo could not be read. **The sentence is right and it stays.** A rate limit, an
outage and a malformed answer leave the person in the aisle with the same one thing to do, and
naming our billing at them is hard rule 3's exact failure. What was wrong is that the sentence was
also all we kept, so an outage during a beta would have read back afterwards as a beta full of bad
photographers. The class is now its own field, added beside the copy and never folded into it, and
it travels from `identify/src/model.ts` through the spine's refusal event in `spine/src/run.ts`
into a new `failure_class` column on the scan log in `app/src/scans.ts`.

**The timeout is 1,800 ms per call**, taken from `docs/the-moonshot.md`'s 2 second p99 for the
cold path and his "results return in 1 second" behind it, with everything downstream already
measured at a couple hundred milliseconds. There is exactly one retry, on a rate limit, a 5xx, or a
network error with no status, because a second attempt is the whole remaining budget. A timeout is
deliberately not retried: the first attempt already spent the budget, so the second would be
answering a screen nobody is still watching. A bad request and a malformed answer are not retried
either; both are money spent to be told the same thing twice. The cap is 2,000 calls per process
per UTC day (`SHIN_MODEL_DAILY_CALLS`), charged per attempt because a retry is a real invoice
line, and checked before the socket opens so it is a cap and not a log entry. It guards against a
loop, not a busy day.

**What the pass could not do, stated so nobody reads the tests as proof.** No key exists on this
machine, so no real photo went through the real API; every 429, 503 and abort in
`identify/test/model.test.ts` is a hand-built shape. And the larger finding: `IdentifyStage` and
`Identifier` are called from nowhere outside `identify/test`. `app/server.ts`'s `identify()` is
the catalogue lookup, and `server.ts` itself names the photo upload door as not built. The
hardening is wired end to end in types and tests, and the last hop has no caller. Reverses if a
measured p99 comes in materially under 1,800 ms, or if a per-account ceiling lands at the billing
account and makes the per-process count redundant.

## Crawl now, join later: an unjoined price keeps the barcode that would resolve it
**Date:** 2026-09-08 · **Status:** active

The sitemap discovery decision above says a discovered SKU whose barcode is not in the catalogue
is written as an unjoined observation so the price survives for a later catalogue to resolve. The
first half was true and the second half was not: `observationFrom` read the barcode off the
product page, failed the catalogue lookup, and wrote the row without it, so the only way to
resolve such a row later was to open Walmart's page again. `catalogue/data/catalogue.db` lives on
the cofounder's machine, not this one, which meant a first-party crawl could not start until it
arrived and would have had to be repeated afterwards: 10.8 days paid twice.

**The barcode now goes on the row.** `observation` gains one nullable column, `page_gtin`, holding
the barcode exactly as the seller published it, unnormalised, because a stored number that has
been quietly rewritten cannot be argued with later. `code` is still the only field that means
"this is a catalogue product" and `page_gtin` never stands in for it. `price/src/rejoin.ts` walks
the rows where `code` is NULL and `page_gtin` is not, joins them through `sources.ts`'s
`joinToProduct`, and fills `code` and `join_method` in place. `attachCode` carries `AND code IS
NULL` in its own WHERE clause, so a rerun is a no-op at the level of the database and no
already-decided code can be overwritten. A rejoin never writes a price.

**A column added in place, not a rebuild.** `migrate-observation.ts` exists because SQLite cannot
drop a NOT NULL without copying every row, which a person supervises. Adding a nullable column is
not that, so `openPrices` does it with `ALTER TABLE ADD COLUMN` behind a `PRAGMA table_info`
check; without it the column would exist only in databases created after today.

**Walked, not asserted, and the walk found the real ceiling.** A live 1p discovery run opened 10
product pages at the polite rate, mean 1,283 ms, and wrote 10 unjoined rows each carrying price,
kind, url and the page's barcode; a dry-run rejoin against a one-row stand-in catalogue then
joined 990370255035 to 0990370255035 out of that live table with no further request to
walmart.ca. Then SKUs 11 and 12 each came back as four consecutive PerimeterX challenge pages
inside `walmart.ts`'s retry loop, eight in a row, and the run was aborted on the
three-consecutive rule. **One request every 4.3 seconds from a residential address is tolerated
for about ten pages and then it is not.** The 10.8-day figure in the decision above is therefore a
lower bound on time at a rate Walmart does not accept, not a plan. What is allowed to change is
the rate (slower, and measured for where the ceiling actually sits), and which SKUs are worth the
budget (`queue.ts`). What is not allowed to change is the header set, the address, or anything
that makes the crawler look like something it is not; see D-049.

**A defect found on the way.** `lookup.ts` marked a code as seen before deciding whether to skip
an unjoined row, so one such row hid every older joined row for the same code and the product
vanished from the alternatives map. Fixed and tested (D-048).

**Reverses if:** the catalogue becomes something every crawling machine has, in which case
`page_gtin` becomes an audit field rather than a mechanism; or a seller's page barcode proves
untrustworthy often enough that storing it is worse than not joining.

## The rate could not be measured, because the address is still shut
**Date:** 2026-09-09 · **Status:** active

`crawl.ts --discover` gained three flags for the probe: `--delay-ms`, refused below the 3,000 ms
floor rather than clamped to it, because a clamp turns a wrong number into a silent right one;
`--offset`, so a second probe reaches pages the first never opened; and `--stop-on-throttle`,
which ends a run on the first challenge, since during a rate probe one challenge is the whole
answer. It is also the discover leg's first abort rule: the "three-consecutive rule" the entry
above credits was a person watching the log, not code.

**Three probe runs on 2026-09-09, at 00:28, 00:48 and 00:50**, each asked for one product page
at a 30,000 ms spacing and each got a 7,535 byte PerimeterX challenge on page one, in 40.1, 39.3
and 37.6 seconds. The second was 47 minutes after the previous night's last challenge and
followed a 20 minute idle window; the third used a different SKU, which rules out one bad page.
In all three the sitemap index and its 3.8 MB gzipped child fetched normally, so the block is on
`/en/ip/` and not on the address as a whole. **The lockout outlives fifty minutes, which retires
the "roughly ten minutes" figure recorded on 2026-09-05.** No sustainable pages-per-hour follows,
and no day count for the 217,660 SKU first-party index follows either; the 10.8 day estimate
stays a lower bound on a rate nobody has yet shown Walmart will accept from a residential
address.

**One mechanism found while reading rather than measuring.** `walmart.ts` retries a challenged
page three times at 6, 12 and 18 seconds, so a single challenge costs four requests in about
forty seconds and the effective rate during a challenge is one request per ten seconds no matter
what `--delay-ms` is set to. The flag cannot govern the burst it exists to measure, and each
probe re-feeds whatever counter holds the block: twelve challenge requests today bought zero
pages. So challenge retries become an override (`SHIN_WALMART_CHALLENGE_RETRIES`, default
unchanged), and the next measurement is worth making only after a multi-hour idle, with that set
to zero, opening a single page and stopping.

**What this means for the product, said plainly.** A residential address is not the shape for
this crawl. The mechanism (sitemap discovery, crawl-now/join-later, rejoin) is built and proven;
what it needs is an origin Walmart's bot wall treats as a well-behaved crawler for hours at a
time, or a different first source for the grocery bulk. Still not a fix: rotating addresses,
spoofing headers, or anything that makes the crawler look like something it is not.

**Reverses if:** a single-request probe after a multi-hour idle returns a real page, in which
case the ceiling is a cool-down length and the rate question reopens at 30 s.

**The multi-hour probe was made, 2026-09-09 at 13:47, and did not reverse this.** Twelve hours
and fifty-seven minutes after the last challenge, retries set to zero, offset 40 into the sitemap
so the page was one no earlier run had opened: one request, one 7,535 byte challenge in 565 ms,
sitemap fetched normally. The lockout outlives thirteen hours. Requests spent on this probe:
one. The decision stands as written.

## Live photo recognition is load-bearing, and the photo door opens
**Date:** 2026-09-09 · **Status:** active

Aurik, 2026-09-09, on the identification feature: *"the user must take a picture and Shin must be
able to identify. Nothing less."* That is the founder's call the 2026-09-03 entry said it needed:
"The v1 floor is six systems" cut live photo recognition as the weakest input, and its own
reverses-if was recognition becoming load-bearing. It is now the stated product, so the entry is
reversed rather than argued around. The other five systems in that floor are untouched.

What opens with it, in the order the ladder already describes (`docs/the-backend-walkthrough.md`
§3.2): barcode first and unmetered; then the photo through `identify/`'s `IdentifyStage`, which
has been written, tested and called by nothing since 2026-09-05 (D-024, D-047); a catalogue
search with the reading pinned; and, new, a second model pass that picks from the catalogue's
own candidates when the first pass cannot settle it. The route is `POST /api/identify/photo`,
the crop is the eye's 1568 px PNG that `camera.js` has been holding in `lastCrop` and never
sending, and the scan log's `kind = 'photo'` and `failure_class` columns already exist for it.

What stays cut: searching the open web on a catalogue miss (attempt four), and any image
embedding index over catalogue photos, both parked until a measured top-1 on a real eval set
says the text path cannot get there.

**Reverses if:** a measured top-1 on real shelf photos stays under the floor the eval sets after
the pick pass lands, in which case the photo path is demoted to a suggestion and the barcode
stays the only identity; or the founder who wrote the 2026-09-03 floor names a reason it should
stand that this entry did not weigh.

## Every key on the price pad is a thumb's size, on every phone
**Date:** 2026-09-09 · **Status:** active

The keypad's digits, backspace, decimal, confirm, Clear, Skip and the two modifier toggles are
44 x 44 CSS px at minimum wherever they are reachable: 48 to 52 px tall on the primary 390 x 844
target and 44 on viewports under 640 px tall, on both hosts (the camera sheet and the correction
screen), with no scroll or drag needed to reach any key. This was the half of D-050 that waited
for the founder, and it was decided with the "complete the other tasks" instruction of
2026-09-09. The short-phone budget is tight on purpose: at 375 x 575 the sheet uses its 450 px
of room to the pixel, and the things that paid for the keys were the pad's avatar row, the peek
gap and the item name's line-height, never a control.

**Reverses if:** a design pass needs the pad shorter than its ~536 px sheet at 844 tall, or
shorter than the 450 px budget at 575 tall. In either case the fix is more non-control trims,
never a key back under 44. Also reverses if a measured tap-error rate on the pad does not fall
after this, which would mean the size was not the problem.

## The beta is six people on the stores' own test tracks, and the app ships to both stores
**Date:** 2026-09-11 · **Status:** active

His words: *"this app will be launched to the app and google play store. The beta tester will be
aurik and i and our parents."* So the beta is a native build, not a web link: TestFlight internal
testing (no review, up to 100 App Store Connect users) and Google Play internal testing (no
review, no Data safety form, up to 100 testers), each of which needs the paid developer account
first (Apple 99 USD a year, Google 25 USD once plus identity verification; neither vendor states
a processing time). The web app is wrapped rather than rewritten: the client already uses relative
API paths, no content security policy and no cross-origin isolation, so the wrap needs a base URL
setting, a remap of the two wasm files' root paths, and a real-phone camera test on day one, with
the native barcode plugin as the fallback if the web camera fails inside the wrapper. Hosting with
HTTPS is still required, because the wrapped app calls the founders' API. Google's 12 testers for
14 days rule applies to production access, not to internal testing, so it gates the public launch
and needs six more people than this beta has.

**Reverses if:** either store account is not approved in time for the week, in which case the
same six people test the hosted web app in Safari and Chrome while the accounts clear; or the
camera cannot be made to work inside the wrapper on a real phone after the native plugin fallback,
in which case the photo path stays web-only for the beta and the barcode path goes native.

## Review scores come only through a retailer's official API, named on screen, and food quality comes from Open Food Facts

**Superseded in part by RULINGS.md: "Reviews: Gemini's reviews ship, shown even without a source link" (2026-09-14). RULINGS.md is current; this entry is history.**
**Date:** 2026-09-11 · **Status:** active

His words: *"the reviews can be pulled from amazon or walmart, or best buy or any other popular
store and referenced where the review is pull from. It just gives the user an idea of how good
something is."* Checked 2026-09-11 against the vendors' own pages: Amazon's Creators API needs a
fully approved Associates account with referred qualifying sales (third-party summaries say ten in
the trailing thirty days), so it is closed until the app has an audience; Walmart's affiliate API
is documented for walmart.com only and no walmart.ca product API was found; Best Buy's developer
API returns a review average and count but covers the United States and Puerto Rico only, and no
Best Buy Canada product API exists; Amazon's and Walmart's terms forbid automated gathering, and
Walmart already blocks this repo's crawler. So: Best Buy's US ratings by barcode for tech, labelled
"Best Buy (US)" with a link; nothing scraped, ever; Amazon added the day Associates access is
granted. For food, where no licensed review source exists at all, the "how good is it" signal is
Open Food Facts' own fields (Nutri-Score, NOVA group, additives, ingredients), which the loader
currently drops and the product table has no columns for. A model-written review is a fabricated
claim and stays out.

**Reverses if:** a Canadian retailer publishes a product API that returns ratings (Canadian Tire's
developer portal was not checked while signed in and is the first place to look), or Amazon
Associates access is granted, in which case that source is added under the same attribution rule.

## A shopper can rate a scan, and the rating is stored against the scan row
**Date:** 2026-09-11 · **Status:** active

His words: *"There should be an ability to rate the quality of a scan."* The thumbs on the verdict
sheet exist and write nothing but a local highlight. The server already generates a scan row id on
every identify call and discards it before replying. The build: return the id in both identify
responses, keep it on the client's current-verdict object, store the tap in a rating table keyed by
scan id and device id, with an optional one-tap reason on a thumbs-down (wrong product, wrong
price, no price, too slow), and keep the four-second undo. A five-point scale is the same wire with
one screen change if he wants it.

**Reverses if:** he names a five-point scale as the form he meant, in which case the thumbs become
stars and the table's rating column widens; nothing else changes.


## The app ships in French and English from the first beta, not English-only

**Superseded in part by RULINGS.md: "Localization and onboarding" (2026-09-13). RULINGS.md is current; this entry is history.**
**Date:** 2026-09-13 · **Status:** active

`docs/the-beta-build-plan.md` E13 recorded that "the interface language stays English for the beta
(31 not gating)". That stands as a statement about GATING and is now overtaken as a statement about
scope: item 31 was Aurik's, he asked for it on 2026-09-13, and it is the one item of his five that
could reach done without a funded API key, so it was built rather than deferred.

Canadian French, not France French, and one French: `Ouvrez une session` is not what a Quebec
shopper reads. The catalogue was already bilingual for MATCHING under decision 20 ("French and
English match to the same row, both directions"); this extends the same fact to DISPLAY, and it
reuses it — a product shows its `name_fr` in French rather than a machine translation of its
English name, because the column already holds the real one.

The shape, and the reason it is three layers rather than one: `voice.js` became `locale x variant`,
keeping the three personalities as the inner axis so the attitude contract was untouched;
`ui-strings.js` is a new catalogue for structural chrome with NO personality axis, because a Share
button that gets ruder on Blunt is the picker leaking into furniture; and the server stopped being
the blocker by emitting a line code plus raw facts beside every sentence it already sent. That last
one is the load-bearing part. Counts, pluralisation and word order were baked into English grammar
inside `spine/src/categories.ts` before the JSON ever left, so no amount of client work could have
translated a verdict. It is additive: `lines`, `because` and `detail` keep their exact English bytes
and a test asserts all 65 sentences round-trip byte for byte from their codes.

Two things are deliberately NOT done. Money still prints `$4.99` in both languages where Canadian
French writes `4,99 $`; `cad()` feeds every price on every surface and several tests compare its
output byte for byte, so that is a decision about the whole app rather than a side effect of this
pass. And a fragment with no French renderer drops its WHOLE sentence back to English, because a
half-translated verdict is worse than an untranslated one.

**Reverses if:** a French speaker reads the copy and finds the register wrong often enough that it
reads as machine output, in which case the French tables are rewritten by a person rather than
patched key by key. The uncertainty list is in the session report and starts with `Gardés` for
Saved, which may want to be `Enregistrés` or `Favoris` and appears in eighteen keys plus the nav
bar. Nothing here reverses on the English side: the English strings were moved, never rewritten,
and the existing suite proves it.

## Google Lens means Google Cloud Vision Web Detection, and it is specified but not built
**Date:** 2026-09-13 · **Status:** active

Beta-plan item 23 was titled "Google Lens" and nothing more. Two facts settle it. First, **there is
no public Google Lens API** and there never has been; the reseller class (SerpApi and equivalents)
scrapes it, and its Legal Shield starts at the $150/month tier rather than the $25 one a beta would
buy, so the one thing that class offers against the legal question is not on sale at the price in
question. Aurik chose the official route. Second, the honest route is
`research/price-sources/36-visual-product-search.md`'s enumeration: Web Detection at $3.50 per
thousand and no catalogue to build, against Product Search at $4.50 plus storage, which is **in
maintenance mode by Google's own documentation** (though absent from the deprecations page, so with
no announced end), refreshes its index about once a day, and would need a product-photo corpus this
repo does not have — roughly 217,660 SKUs against the 40 photos that exist.

It is **not built**, and the reason is a measurement rather than a preference. The only place it
could plug in is the catalogue-miss branch of `IdentifyStage.fromCrop`, where the three-query
cascade unions to zero rows. On this repo's own 40-of-40 dry run **that branch fires zero times**.
Buying a visual-search call to rescue a miss that has never been observed is spending against a
number nobody has measured.

Recorded against the closed register so it is not re-proposed by accident: Web Detection returns
retailer URLs, and FOLLOWING those URLs is the direct-page-scraping method already killed on
2026-09-03. Any build takes the name or GTIN string back into the catalogue lookup and stops there.

**Reverses if:** a real eval run against a funded model shows a top-1 below the floor AND a
`not_in_catalogue` count above one in forty. Either alone is not enough: a low top-1 with no misses
is a ranking problem, and misses with a high top-1 are a catalogue problem. Kills outright if a real
run shows top-1 at or above the floor with zero or one miss in forty.

## A model call goes through a provider seam, and the measure is cost per correct identification
**Date:** 2026-09-13 · **Status:** active

His question, 2026-09-11: *"Can we use multiple llms like grok and claude together since grok is
cheaper?"* It cannot be answered by comparing price lists, and this decision is mostly about
refusing to answer it that way. A model that costs half as much per call and is wrong twice as
often costs MORE per right answer, and the right answer is the product. So the unit is **cost per
correct identification**, never cost per call, and `identify/eval/run.ts` now scores a
provider-and-tier matrix in that unit.

To make the question askable at all, `identify/src/model.ts` no longer imports the Anthropic SDK.
A neutral seam in `identify/src/provider.ts` carries an image, a system prompt, a schema and a token
budget; `providers/anthropic.ts` and `providers/xai.ts` implement it (the xAI adapter was removed
2026-09-27, having never run against a real key or been wired into `SHIN_MODEL_PROVIDER`);
`SHIN_MODEL_PROVIDER` selects,
defaulting to `anthropic` so nothing moves without an explicit opt-in. The refactor was held to
behaviour preservation and all 66 pre-existing tests passed unedited.

**Nothing here is measured, and the file says so in its own output.** There is no Anthropic key and
no xAI key on this machine. The Grok adapter has never been executed, not once, not against a
recorded fixture; its eleven wire-format assumptions are listed in its file header, and the one
worth doubting is `strict: true` structured output, because every nullable field in `PRODUCT_SCHEMA`
is a `['string','null']` union and strict implementations commonly reject those — if that is wrong,
all ten of its tests still pass and every real call still fails. The matrix prints `unknown` in the
xAI cost cells rather than a number. Four of the five token counts behind every dollar are guesses.
The prompt-caching lever asserts the request SHAPE that makes a cache hit possible and claims no
saving, because a saving is `cache_read_input_tokens` and that requires a key.

**Reverses if:** a funded run shows the seam's indirection costing latency that matters inside the
seven-second photo budget, in which case the winning provider is inlined and the seam kept only in
the eval. The xAI adapter is deleted rather than maintained if a first real run shows Grok losing on
cost per correct identification, since an unrun second provider is a liability and not an option.

## Money is written the way the reader's language writes money, and only the client does it
**Date:** 2026-09-13 · **Status:** active

The bilingual decision earlier today recorded this as deliberately not done and as its own
call rather than a rider. Aurik made it the same day: French Canada writes **`4,99 $`** — comma
for the decimal, symbol after the number, and a no-break space between them so a line can never
wrap between an amount and its dollar sign. `$4.99` sitting inside a French sentence is one of
the reliable tells that a translation was done by a machine.

**The digits are never touched.** The formatter reshapes punctuation and nothing else: no
rounding, no conversion, no opinion about the value. `4,99 $` and `$4.99` are the same 499 cents,
and a test asserts digit-for-digit equality across both languages over a range of values
including zero and a negative. This is `voice.js`'s promise — the attitude changes the words and
never the number — applied to the locale.

**Only `app/public/js/shin.js`'s `cad()` changed. `spine/src/money.ts`'s `cad()` stays English and
untouched**, which is the whole reason this was safe to do in an afternoon. The server's English
sentences are the FALLBACK the client renders when a line code has no French renderer, and
`spine/test/structured-prose.test.ts` asserts all 65 of them byte for byte. Localising money in
the engine would have broken that net in order to fix a string the French path does not use.

The same rule gave the screen reader its French: the thirteen face states now have labels in both
languages in `ui-strings.js` rather than shipping the raw English state id, and French puts its
no-break space before the colon (`Shin : content`). That is chrome, not Shin speaking, so it sits
outside `voice.js` and carries no personality axis — a blind user must hear what a sighted user
sees, not a ruder version of it. See D-092 for the half of that which shipped broken.

**Reverses if:** a Quebec reader finds the no-break space rendering as a visible box or a double
space in a real browser on a real phone, in which case it becomes a plain space and the wrap
hazard is accepted. Nothing here reverses on the English side, which is byte-identical to what it
was.

## "Never live search" stops being a measurement and becomes a contract
**Date:** 2026-09-13 · **Status:** active

`QUEUE.md`'s closed register killed "asking a search engine for a live price" on the 2026-09-03
pilot, which is a MEASUREMENT, and measurements can be overturned by better measurements. That
kill is now independently true on contract, which cannot.

Grounding with Google Search is the one licensed Google product that could answer "what does this
cost". Its terms (https://ai.google.dev/gemini-api/terms, effective 2026-03-23) say you will not
*"cache, frame, syndicate, resell, analyze, train on, or otherwise learn from Grounded Results"*,
and spell out the exact thing a price app would try: it is a violation *"to use Grounding with
Google Search to extract or collect one or more of these components for another purpose (for
example, using programmatic or automated means to collect Links, using Links to build an index, or
using Links to identify destination pages for crawling or scraping)."* Shin stores a price,
compares it, and renders a verdict: that is cache, analyze, and learn from, three of the six banned
verbs. The two-year storage carve-out does not reach it, because the carve-out is for optimising
display and for an end user's own chat history.

**There is no Vertex-side escape.** The same clause appears word for word in the Google Cloud
Service Specific Terms §(k) (https://cloud.google.com/terms/service-terms, last modified
2026-07-29). Checked rather than assumed.

The consequence for the register: that row's "reopens on" condition — a search-derived range
reproduced against a live source — is **no longer sufficient by itself**. A reproduction would
satisfy the measurement and still leave the contract standing.

**Reverses if:** Google publishes terms that permit storing and comparing grounded prices, or a
licensed price source appears whose terms allow public cross-retailer display. Note the opposite of
this finding also holds and is good news: plain Gemini/Vertex multimodal calls on a cropped photo
are **clean** — those terms restrict competing models and reverse engineering, and nothing there
touches product identification.

## Take the string, never the image
**Date:** 2026-09-13 · **Status:** active

**Trader Corporation v CarGurus, 2017 ONSC 1841.** An Ontario court awarded **$305,064** in
statutory damages against a scraper of product photographs — $2 per image across 152,532 images —
rejecting the originality defence, the information-location-tool defence, and fair dealing. It is
the closest Canadian case to Shin's shape that anyone has found.

So the rule is not a preference about tidiness: **whatever route Shin ever uses to identify a
product, it takes back a NAME or a GTIN and never an image.** This already governs the Cloud Vision
Web Detection design in item 36 (recover a string, do not follow the returned URLs); it now also
governs the open question in that file about whether Open Food Facts photos could be uploaded as
Product Search reference images, which stays open and is now a liability question rather than a
licensing curiosity.

Alongside it: **Century 21 Canada LP v Rogers Communications, 2011 BCSC 1196** — browse-wrap terms
of use ARE enforceable in Canada. Damages were small; the injunction was the real remedy, which is
the part that matters to a product that would have to stop.

**Not legal advice, and the file says so in its first three lines.** `research/price-sources/37-google-lens-legal-position.md`
is a sourced summary of published terms and reported outcomes. It also records what it could not do:
**no CanLII full-text search was run**, so "s.342.1 has never been applied to ToS-violating
scraping" is an absence of FOUND precedent, not proven absence. A Gemini Deep Research run was
started on 2026-09-13 to close exactly that gap.

**ANSWERED the same evening, and the rule survives.** The CanLII survey was run (Gemini Deep
Research, `research/price-sources/39-canadian-scraping-law.md`) and reports that no later court had
to distinguish Trader, because **Trader itself drew the line**: the infringement finding *"applied
exclusively to photographs"*, Trader *"made no copyright claim over the underlying factual listing
data—such as vehicle make, model, year, trim, mileage, or retail price"*, and the court *"awarded no
damages and made no finding of infringement regarding the automated collection, indexing, or display
of vehicle pricing or technical specifications."* So "take the string, never the image" is not a
cautious margin around the case; it is the exact boundary the case draws, and the string side was
litigated and produced nothing.

Two riders that came with it. **Framing is not a way out**: CarGurus argued it never copied the
photos to its own servers and merely framed them from the dealers' servers, and the court rejected
that under s.2.4(1.1) — so hotlinking a retailer's image is infringement exactly as copying it is.
And the **$305,064 was a reduction, not a ceiling**: the s.38.1 statutory minimum would have given
$76M across 152,532 photos, and Justice Conway used the s.38.1(3)(b) relief valve to compress it to
$2 a photo on findings of good faith, no actual loss and no Canadian profit. A defendant without
those findings does not get that compression.

**That citation is a lead, not yet a fact.** File 39 is unverified model output and its own header
says so; paras 23-25 and 33 of Trader are first on its spot-check list. The rule does not change
either way, because it was already the conservative reading.

**Reverses if:** the spot-check shows the report misdescribed Trader — in which case the rule stays
anyway and only this decision's confidence drops; or a later Canadian decision extends copyright to
the factual listing data beneath a commercial compilation, which would contradict CCH and
Tele-Direct and would be a much larger event than this product.

## The Universal Commerce Protocol is not deployed, measured rather than argued
**Date:** 2026-09-13 · **Status:** active

UCP is an open standard co-developed by Google with Walmart, Target and Shopify, under which a
merchant publishes a machine-readable manifest at `/.well-known/ucp`, and `ucp.dev` lists "Catalog
Search and Lookup" among its capabilities. On paper it was the one live route to product-and-price
data through a front door, after the Merchant API turned out to forbid public display and the CSS
programme turned out to exclude Canada.

**Ruling first, because it decides whether the check was even allowed:** fetching
`/.well-known/ucp` is NOT the killed direct-page-scraping method. The register killed fetching
product pages built for humans and parsing prices out of the HTML. A `.well-known` URI (RFC 8615)
is the opposite — a machine-readable contract the merchant publishes deliberately for programmatic
consumption, the same class as `robots.txt` and the Walmart sitemap this repo already crawls in
`price/src/walmart-sitemap.ts`. The boundary: following the manifest's own declared endpoints is
fine; using it to discover product page URLs and scrape the HTML is the killed method renamed.

**Then the measurement, one GET per host, 2026-09-13:** twelve retailers, **zero manifests.**
walmart.ca, metro.ca, bestbuy.ca, costco.ca 404; canadiantire.ca, sobeys.com, londondrugs.com 403;
shoppersdrugmart.ca failed to connect; loblaws.ca and realcanadiansuperstore.ca returned **200 with
`Content-Type: text/html`** — soft-404s serving the app shell, not JSON, confirmed by parsing. And
decisively, **walmart.com and target.com, the protocol's own named co-developers, both 404.**

So the route does not exist yet in the market Shin sells into, and it does not exist at the firms
that built it. Recorded so it is not re-proposed as an idea next month; the answer is a number, not
an opinion.

**Reverses if:** a repeat of the same twelve GETs returns a JSON manifest from any Canadian
retailer. That check is cheap and worth re-running when a Canadian retailer announces UCP support,
never on the strength of a press release about the protocol itself.


## Never circumvent a bot block, and now for a second reason
**Date:** 2026-09-13 · **Status:** active

D-049 recorded that Aurik's home IP is shut out of walmart.ca by PerimeterX, and the standing
instruction that came with it was **never rotate IPs or spoof headers** — made on the grounds that
the mechanism was proven and the shape was wrong, which is to say on manners and on engineering.

`research/price-sources/39-canadian-scraping-law.md` puts a second reason underneath it and moves
the practice from the report's "contract risk only" band into its **"do not attempt"** band:
evading CAPTCHAs, bot detection or IP blocks is framed there as circumvention of a technological
protection measure under **Copyright Act s.41.1**, which carries statutory damages and injunctions
and is a different animal from breaching a browse-wrap term. The distinction that matters: scraping
a public price is, on that report's reading, a contract matter with nominal damages; *getting past a
block in order to* scrape it is a statutory one.

The practical line for this repo, unchanged in behaviour and now better argued: a 403 or a challenge
page is an answer. It is recorded as a measurement and the method is killed or parked. It is never
an obstacle to be routed around.

**Reverses if:** nothing foreseeable. If a retailer grants written permission or publishes an API,
the question disappears rather than reverses.

## Client-side parsing is not a route, it is three other conversations wearing one name
**Date:** 2026-09-13 · **Status:** active

Asked for on his instruction after `research/price-sources/39-canadian-scraping-law.md` reported that
Karma and Honey *"avoid centralized server-side scraping liability by executing the extraction
client-side on the consumer's local machine."* Answered in `40-client-side-extraction.md`.

**The analogy fails on a fact about the product, not a point of law.** Karma and Honey read a DOM the
user's own browser already fetched, on a page the user chose to open. **The legally operative fact is
the human gesture, not where the parser runs.** Shin's shopper is in an aisle, on no page at all, and
needs prices from retailers they are not visiting. So "client-side" for Shin means the app fetching
pages with no gesture — automation from a residential IP. Century 21's agency line makes an automated
agent the agent of whoever commands it, so the contracting party stays Shin. **It moves who gets
blocked, not who is in breach, and the party who gets blocked is a shopper who did nothing wrong.**

**Store policy kills it before the law is reached, which is the part worth remembering.** Apple 5.2.2
requires an app displaying third-party content to be *"specifically permitted ... under the service's
terms of use"*, with *"authorization must be provided upon request"* — verified verbatim against the
guidelines on 2026-09-13. File 39 §11 already quotes Loblaws, Walmart Canada and Best Buy Canada
forbidding automated extraction, so there is nothing to produce when asked. Google Play's Spam policy
forbids *"apps whose primary purpose is to provide a webview of a website without permission"* and
uses a shopping-comparison wrapper as its own worked example, and its Device and Network Abuse policy
converts a breach of a site's terms into a Play violation directly, with no lawsuit required.

**The cleanest statement of why not to build it.** Three things would make it fit, and none is a
client-side finding: a real user gesture (a product redesign — a visible in-app browser, which is
what Karma's mobile app actually is, and which spends the whole seven-second budget and turns a
verdict into a browser); written retailer permission (a licensing deal, the shape of which is
`28-canadian-tire-developer-portal.md`); or a retailer serving pages to unauthenticated requests
(the row that is already killed). **The idea contributes nothing of its own to any of the three.**

**A correction to file 39, which this lane earned.** That file's Karma/Honey row is uncited model
output and, for Honey, looks incomplete: commentators describe a 30,000-site index carrying 120 days
of Amazon price history, which a content script cannot build. The client-side script is plausibly the
**display surface**, with the index on Honey's own infrastructure — which would mean "client-side
avoids the liability" was never the whole story. Marked unverified rather than adopted. Separately,
the 2025 Honey litigation is about affiliate last-click attribution, not scraping, and must not be
cited as a scraping precedent.

**Reverses if:** all three of the register row's conditions land together — a named retailer serving
or permitting, a named approved app or written store guidance, and a measured in-budget fetch from a
real device. Any one alone reopens nothing.

## A substitute is the same leaf, then one step up and labelled, never a shelf
**Date:** 2026-09-13 · **Status:** active

**His words:** *"if there are gala apples Shin needs to compare prices with other gala apples in
other stores. however if there are no gala apples it can offer similar item of honey crisp apples at
nearby locations."* Asked what counts as a substitute, he chose: **leaf category first; one step up
to the parent only if the leaf is empty; a parent-level swap labelled as looser so the shopper can
tell.**

This is the decision D-036 has been open for since 2026-09-07. The ring offered Stem Ginger Oat
Cookies as a cheaper swap for organic tortilla chips because both carried `en:whole-grains` — *"the
word 'cheaper' doing the lying, since it implies 'instead of this'."* D-068 capped shelf-sized tags
at 1,000 members and then stopped, on purpose: *"deciding what counts as a substitute is the product
call D-036 says needs the founder."* It has him now.

The rule, as code will hold it: the ring is drawn on `leaf_category`, the last tag in
`category_path`, never on an arbitrary tag. `en:apples` pairs Gala with Honeycrisp. If the leaf
yields nothing, the parent — the tag immediately before it — is tried **once**, and never the
grandparent. `MAX_RING_TAG` applies at both levels. Every returned swap carries `ring: 'leaf' |
'parent'`, and the app labels a parent-ring swap as looser; a swap with no `ring` field is treated as
leaf and never as looser, because looser is the thing that needs an explicit signal. A product with
no leaf gets no swaps. Produce is not special-cased: `en:apples` → `en:fruits` is exactly his
example, and the rule must produce it naturally.

**Reverses if:** the beta's testers report parent-ring swaps as wrong often enough that the label is
not doing its job, in which case the parent step is removed and only the leaf remains; or the
catalogue's leaf tags prove too coarse for a category Shin serves (a leaf that is itself a shelf), in
which case that category gets no swaps rather than a looser rule.

## Produce becomes the beta's test case, on the condition already written for it
**Date:** 2026-09-13 · **Status:** active

Produce is refused today — `category_unsupported` — and the refusal records its own reversal:
*"Crowdsourced shelf-price volume in one city reaching the point where a produce item has two
independent reports more often than not."* The rule also records the fact that decides the whole
question: *"Shopper-reported shelf prices are the only source here, not a supplement to one."*

Asked whether to pursue it, he chose **yes: make produce the beta's test case.** So the beta is
sited for that measurement — testers in one city, at the same stores, so a second report can arrive
from a neighbour rather than a crawler — and the count that matters is how often a produce item
reaches two independent reports. Produce captures already land as observations through the
price-on-every-refusal flow, so nothing new is recorded; what changes is that the number is watched.
Produce is promoted on the thresholds the rule already holds (4 points, 3 distinct sellers, 3 days)
the day the condition is met, and not before.

Two facts that follow, stated so they are not rediscovered. First, this makes the beta's *siting* a
product decision: six testers in three cities cannot meet this condition; six in one city might.
Second, the 20 produce rows in `identify/eval/manifest.json` carry `code: null` correctly and are the
eval's negative set (D-096), which is a different job from this one and should not be confused with
it.

**Reverses if:** the beta runs its course in one city and produce items reach two independent
reports less often than not, in which case the refusal stands with a measured number under it
instead of an argument, which is what the reversal condition asked for.

## Consent is off until answered, and the cell stays coarse: his ruling over the one-push "everything"

**Superseded in part by RULINGS.md: "Location and photo consent default off until answered" (2026-09-14). RULINGS.md is current; this entry is history.**

2026-09-14. Two founders said opposite things on the same screen on the same day. Jamin, on his
Mac session: *"build everything for collecting EVERYTHING"*, and commit `d0a1c2e` shipped both
toggles on by default for a device that never answered, the exact GPS position beside the coarse
cell on every scan (migration 8), and consent copy saying so. Aurik, asked the same evening which
stands for the beta, chose the design he approved on 2026-09-13: **off until answered, the
kilometre-wide cell only, no exact position stored, the usual-shop memory on the phone.**

What changed back: `app/src/consent.ts` and `store.js` default to `photos: false, location: false`;
the consent screen's switches start off; `api.js` no longer sends `lat`/`lon`; `server.ts`'s
`locationFor` writes null into the exact columns whatever a client sends, so an old client cannot
re-open the door. Migration 8's columns stay in the schema, empty. The 2026-09-13 copy for the
intro, the photo line and the location line is back in both languages ("never your exact spot",
"off unless you turn them on"). Kept from Jamin's pass, because they are true under either
default: the footer that says what is kept is used to answer other shoppers and to train Shin,
and the camera line that every scan sends a frame to be read.

**Why:** a beta tester's phone is the first place the privacy notice is read, and a notice that
says "off by default" over a build that keeps everything is the gap Law 25 is written about;
Jamin's own catch-up says privacy-by-default has to hold before public launch, and this makes it
hold from the first tester. **Reverses if:** the founders decide together, in writing, that the beta
is an opt-out collection with a notice that says exactly that; then `consent.ts` is the one file to
flip and the copy follows it.

## Push green work freely, in Shin only

2026-09-14. Jamin wrote *"pushing needs nobody's approval, either direction"* into `CLAUDE.md`;
Aurik's standing rule everywhere else is an explicit yes per push. Asked, Aurik adopted Jamin's
rule for this repo: a session pushes each piece that passes the gate on the COMMITTED tree
(typecheck and tests in every touched package, a nonzero exit stops the push), GitLab first, GitHub
only if GitLab accepts, `ls-remote` on both hosts as the proof. Delete still needs his yes. Recorded
in his global instructions the same evening. **Reverses if:** either founder asks; the global rule
is the default it falls back to.

## The unfinished grounded-price provider comes off main until it is green and the two questions are settled

2026-09-14, late. Jamin pushed `ccbd0cc`, *"unfinished Gemini provider code, pushed as is on
Jamin's word"*: a Google-Search-grounded lookup of Canadian retailer prices and reviews per scan
(`identify/src/providers/gemini-grounded.ts`) with a gauge that labels the shelf price *good*,
*reasonable* or *bad* against them (`gauge.ts`), wired into `app/server.ts`. By its own message:
typecheck red in identify and app, 6 tests failing, the Mac stage deploy red on every later commit.
Asked, Aurik ruled: **revert it on main now**; it comes back when it typechecks and after the
founders settle what it raises.

**Jamin's position, from the file's header and the server's comment, kept verbatim in the
reverted commit:** the grounded block is *"SHOWN AS ITS OWN SEPARATE BLOCK, NEVER MIXED INTO A
PRICE LIST OR AVERAGED INTO A VERDICT"*, held *"on this one scan's own row, never in
`catalogue.db`"*, and the terms clause was read and followed as he understands it.

**What has to be settled before it lands again, in writing, by both:**
1. **The contract.** QUEUE.md's kill of search-derived prices stands on the Gemini API terms (eff.
   2026-03-23) and the Cloud Service Specific Terms §(k): Grounded Results may not be cached,
   analyzed, trained on or otherwise learned from. Writing the listings to a scan row and computing
   a gauge over them is storing and analyzing; showing them once, unaltered, with Google's search
   suggestions, is what the terms allow. The decision *"'Never live search' stops being a
   measurement and becomes a contract"* is the one this has to answer to.
2. **Hard rule 2.** *good / reasonable / bad* are tier words, and the gauge produces them from
   listings Shin has not verified, sized or dated the way the spine requires before it says
   *walk away*. Plan section 3 allows those words only under a real verdict.

**Reverses if:** the two founders sign off on both points, or the code is reshaped so the grounded
block is display-only (nothing stored, nothing scored, no tier word) and it typechecks; then it is
a `git revert` of the revert plus a green gate.

## Gemini for identification, and grounded prices display-only

**Superseded in part by RULINGS.md: "Default Gemini model is gemini-3.8-flash" (2026-09-22). RULINGS.md is current; this entry is history.**

2026-09-14. Aurik: *"we will be swithcing to gemini. read the gemini documents. it is really good
but it has so many legal rules we need to build around. Shin will adopt this."* Adopted. The
decisions behind it are Jamin's three documents of the same day, `docs/plan-gemini.md`,
`docs/gemini-work-list.md` (83 items) and `docs/the-gemini-tree.md`.

**Why.** Measured on Jamin's phone, 2026-09-14: **7 of 7 price requests refused, 9 of 30 barcodes
absent from the catalogue**, photo picks choosing a European variant or a brandless "Water", and
Claude refusing 4 of 15 photographs. Shin's own sources answer a minority of real scans. That is
the number this reverses, and it is why the switch is worth its legal surface.

**THE ONE DISTINCTION THE WHOLE BUILD RESTS ON.** Gemini returns two categorically different kinds
of output and the difference is a contract, not a preference.

*Ungrounded* output, a plain model call with no search tool, is **ordinary model output**. It is
storable in the shared catalogue exactly as today's Claude answers are, carries no display rules,
and has no terms surface at all. This is the half that replaces Claude and fixes the measured
failure, and it is deliberately built first.

*Grounded Results*, where the `google_search` tool was on, are governed by
https://ai.google.dev/gemini-api/terms (eff. 2026-03-23; identical wording in the Google Cloud
Service Specific Terms section (k), mod. 2026-07-29, so there is no Vertex-side escape):
*"You will not ... cache, frame, syndicate, resell, analyze, train on, or otherwise learn from
Grounded Results or Search Suggestions"*; *"will only display the Grounded Results with the
associated Search Suggestion(s) to the end user who submitted the prompt"*; *"will not modify, or
intersperse any other content with"* them; *"will not track whether those interactions were
specifically with a given Search Suggestion or Grounded Result"*. Two carve-outs make the design
possible: the text may be stored *"for up to two (2) years ... in chat history of an end user of
your application only for the purpose of allowing that end user to view their chat history"*, and
it may be resubmitted *"to obtain a refined or improved Grounded Result to display to the end
user"* with undisplayed interim results deleted.

**So the architecture is the rule.** `identify/src/grounded.ts` holds an opaque `Grounded<T>` box
whose payload lives off the object in a module-private WeakMap: it cannot reach any parameter typed
`string`, which is every write in `scans.ts`, `price/src/store.ts` and `catalogue/src/load.ts`; its
`toJSON` and `toString` throw, so it cannot ride out inside a response body or be concatenated with
a Shin sentence; and `seal()` deep-freezes the payload, so a re-sort throws at runtime, which is
what a type cannot do. One door in, three doors out, and a test that the door count is one.

**Six rulings taken the same day, all Aurik's:**
1. **The key.** A **free** Gemini key on the PC, used only on the 200 public Open Food Facts eval
   photographs: no user data, no grounding (the free tier has none), no cost. Jamin's **paid** key
   goes in the Mac's `mac/config.env` for live traffic, because the free tier trains on what it is
   sent and a tester's photograph must never reach it. The server refuses to start if it sees a key
   marked free.
2. **Scope.** Everything, built in the legal order: identification, then the guard, then grounded
   prices, reviews and the price line.
3. **Reviews.** Gemini's reviews ship, and `docs/the-beta-build-plan.md` item 30 is amended (see
   the next decision below).
4. **The twelve awkward item kinds** (plan-gemini section 7): the four that reach beta testers,
   being sold by weight, store brands, deals and member prices, and marketplace or US listings kept
   off the line. The other eight stay written and unbuilt.
5. **The words on the price line.** The zones name the range **the user set**, never Shin's judgment
   of the price: "under your line", "in the middle", "over your line". Hard rule 2 is untouched and
   the four ban-list tests pass unchanged. See the next decision below for why this mattered.
6. **Models.** Cheap first, escalate on doubt: `gemini-3.5-flash-lite` on every photograph (about
   0.3 cents), `gemini-3.8-flash` only when the cheap model reports low confidence. One env var
   changes it. 3.8 Flash doubles in price on 2027-01-01 and nothing automatic re-checks that.

**What is still open and does not block building, but blocks relying on it:** a legal review
(work-list item 7); Google's written answer on whether rendering structured grounded fields in
Shin's own layout counts as *"modify"* (item 6, unasked, and the one that could force a redesign);
and whether the terms' 18-or-older clause reaches end users or only the developer (item 5).

**Reverses if:** Google answers item 6 in a way the layout cannot satisfy, or a legal review finds
the per-user display route does not hold, in which case identification stays and the grounded half
comes out. Ungrounded identification survives either way, because it is not a Grounded Result.


## The price line speaks the shopper's own range, never Shin's opinion

2026-09-14. The reverted grounded build (`ccbd0cc`) labelled a shelf price **good / reasonable /
bad** against the median of prices Google's search found. Two of this repo's own rules point the
other way. Hard rule 2, which `CLAUDE.md` says cannot be overridden by chat and is added only by
Aurik: *"No savings claim until it is measured. Competition Act s.74.01(1)(b) requires adequate and
proper testing before a performance claim is published."* And `docs/plan-always-a-price.md` section
3, enforced by four test files, allows *good, fair, high, walk away, deal, cheaper* only under a
real verdict. Gemini's prices are not verified, sized or dated the way the spine requires before it
says *walk away*.

Asked, Aurik chose the reading that dissolves the conflict rather than bending either rule:
**the zone words name the range the shopper themself set.** They pick two percentages once (how far
under the usual price is worth it, how far over is too much; defaults 10 and 10). The line then says
where the shelf price falls inside **their** range, over prices Google found, with "6 prices found"
under it and never the word "factually". Shin states no opinion about the price at all, so there is
no performance claim to substantiate, and the ban-list tests pass unchanged rather than being scoped
around.

This is also what Jamin asked for in his own words: *"ask the user what their range for a bad,
resonable and good price is as an average above or below the price and then we tell the user based
on their preference."*

The fixed function returns **neutral zone codes** (`under_your_line`, `middle`, `over_your_line`)
and the client turns a code into words, so the grading vocabulary cannot leak back in through the
server or through a translation.

**Reverses if:** Aurik amends hard rule 2 himself, which is the only way those words come back.


## Gemini's reviews ship, and beta plan item 30 is amended

2026-09-14. `docs/the-beta-build-plan.md` item 30 says a review is *"shown only when a licensed
source has a row; nothing generated"*. Gemini's reviews are generated from search, so the two
collide head on; it is work-list item 4. Asked, Aurik ruled **Gemini reviews win** and item 30 is
amended to read, in substance: a licensed source's row, **or** a Gemini review shown with its source
link and Google's Search Suggestions, in its own labelled block, never merged into a licensed
source's number.

The amendment is recorded here rather than by editing `docs/the-beta-build-plan.md`, because that
document is Jamin's and a session does not rewrite a founder's file to win an argument in it. He is
told in `notes/catch-up.md` and on the Notion page.

**The reason item 30 existed still holds** and is kept: a rating invented by a model is worthless.
What makes a Gemini review acceptable is that it carries a source link and a rating attributed to
that source. A review that comes back with no link is shown with the heads-up Jamin asked for
(*"just give a heads up that something doesn't have a link"*) and is never presented as a number
Shin stands behind.

**Reverses if:** Jamin disagrees, since item 30 is his line and this amends it.


## Twelve rulings on the Gemini branch, answered together

**Superseded in part by RULINGS.md: "Reviews: Gemini's reviews ship, shown even without a source link" (2026-09-14), item 4; "A scanned barcode answers with Shin's own prices too" (2026-09-26), item 10. RULINGS.md is current; this entry is history.**

2026-09-14. The Gemini tree (`docs/the-gemini-tree.md`) named 13 leaves only Jamin could decide.
Asked to go through them, he ruled on 12 in one pass (Aurik's own agreement on the branch inside
`identify/src/model.ts` still needs Aurik himself, not Jamin, to say yes; Jamin's "yes" here is his
own go-ahead to build toward it, not Aurik's answer).

1. **No paid key yet. All testing runs through Claude in Chrome operating the Gemini website**
   (`gemini.google.com/app`), the same way the nine website tests already behind this branch were
   produced. The paid-key leaf in the tree stands; this is how the branch gets exercised before it
   exists, not a replacement for it.
2. **Zero-data-retention approval: seek it, but build assuming it is refused.** Added as a to-do in
   `docs/gemini-work-list.md` item 10 rather than left as an open question.
3. **The branch inside `identify/src/model.ts`: go ahead.** Jamin's own yes to building it; Aurik's
   agreement, since the file is his, is still a separate ask.
4. **Beta plan item 30, resolved the other way from the transparency instinct:** *"we don't have to
   push for super transparency when it makes our product worse, we just have to give a way for the
   user to know where our info comes from."* Reviews show even when a source is not present; the
   no-link heads-up already decided for prices (above) is the mechanism, extended to reviews. This
   loosens the earlier reading ("a review with no link is shown with the heads-up... never presented
   as a number Shin stands behind") only in that a missing link no longer has to suppress the
   review, just flag it.
5. **The leftover uncommitted code: reuse what can be used**, the "rework" avenue in the tree, not
   a clean rewrite and not a straight commit of what is there.
6. **Legal review: before launch**, not before build and not skipped.
7. **The drafted consent wording naming Gemini and the 30-day retention: his call, delegated.**
   *"you decide"* — a session's own reading ships unless a later pass finds a problem with it.
8. **The 18-or-older clause: a Terms of Service checkbox, not an age gate.** *"just put in our terms
   and services that you need to be 18+, if the user checks that, then we don't have any
   liability."* This does not wait on Google's written answer to item 5 in the tree (whether the
   clause reaches end users): a ToS checkbox is Shin's own liability position regardless of what
   Google's clause turns out to mean, so it is built now rather than held. Google's answer to item 5
   still matters for whether Shin also needs to gate the API call itself, which a checkbox does not
   settle.
9. **Filming a real answer is allowed:** *"we will show the real answers in the videos, we are not
   showing the answers to users, we are just showing what we see on an app."* The distinction Jamin
   draws is not in the tree's own reading of the terms (which treats "shown to anyone but the person
   who asked" as the line) and should be checked against the terms' actual wording, not assumed, the
   next time this is touched.
10. **Shin's own prices are not shown anywhere for now, until enough is collected**, which makes
    the two-verdict-unification question in the tree moot rather than answered: there is only one
    verdict on screen while this holds.
11. **A single ungrounded read is never trusted immediately, and never checked by calling the model
    a second time.** *"there can be measures in place but definitely not calling the ai a second
    time, we can scan multiple frames to ensure they all match up."* The check is agreement across
    multiple camera frames of the same item, not a repeat API call.
12. **Image resolution: measure it, don't pick it.** Test the three resolution levels against real
    return quality, weigh the cost difference, and keep the door open to offering a lower resolution
    on a lower-priced Shin tier. Not decided today; decided by a test that has not been run.

**Reverses if:** any individual ruling above is revisited by Jamin himself; ruling 3 also reverses,
for its own part, if Aurik declines to agree once asked.


## Three of Jamin's nine rules are raised as points rather than built

2026-09-15. `docs/jamin-gemini-rules.md` says it outranks everything in this repo, and its own
instruction is that each contradiction is *"either fixed to match this file or, if it should not be,
raised with Jamin as a point."* Seven contradictions were live on Jamin's sweep of the same day.
Four are being built (rules 1, 2, 4's plumbing and 7, plus the doc cleanup). These two are raised.

**2. The tier words.** Jamin: *"we tell the user based on their preference, this is factrually a
bad, resonable or good price."* Aurik's ruling of 2026-09-14, *"The price line speaks the shopper's
own range, never Shin's opinion"*, dissolved that conflict rather than bending either rule, and its
stated reversal condition is exact: *"Aurik amends hard rule 2 himself, which is the only way those
words come back."* Hard rule 2 rests on Competition Act s.74.01(1)(b), which requires adequate and
proper testing before a performance claim is published; Gemini's prices are not verified, sized or
dated the way the spine requires before it says *walk away*.

Cost if overruled: the `GaugeZone` type and its 12 consumers, the `VERDICT_SCHEMA` enum at
`identify/src/providers/gemini-grounded.ts:448`, both embedded Python sources, the CSS selectors,
the `ui-strings.js` setup copy, and the grading-word sweep across 5 to 6 test files — roughly 1,600
individual word checks.

A correction worth carrying: six places in this repo say the ban is *"enforced by four test files"*
and not one of them names the four. Five files actually enforce it, six if `grounded-client.test.mjs`
counts, and that one copies the word list instead of importing it.

**3. Gemini as the price source.** Rules 3 and 6 together make Gemini the answer and Shin's engine a
bystander. That orphans `spine/src/spine.ts`, `spine/src/contract.ts` and `price/src/verdict.ts` —
2,294 lines and 380 tests across 32 files — and `SCOREBOARD.md`'s coverage number stops measuring
anything.

**Measured 2026-09-16, and it changes this point from a cost argument into an evidence one.** Ten
real grounded searches on Jamin's own grounding key returned no offers at all seven times, and one
or two offers the other three; identity and description came back either way. If Gemini is the price
and Shin's engine is retired, most scans on this sample have no price to show -- which is rule 6
answering rule 3 in the negative. n = 10, one session, no retries: a signal for a real run, not a
law. `NOW.md` carries the table.

The disagreement may be narrower than it looks. Ruling 10 of 2026-09-14 already says *"Shin's own
prices are not shown anywhere for now, until enough is collected."* The display path is therefore
already dormant, and what is actually in dispute is whether the engine and its tests are deleted or
kept dark.

**Two places where Jamin's rules fight each other**, recorded rather than resolved:

- **Rule 2 against itself.** It argues for barcodes because they are *"a much cheaper api call than
  sending an image"* and in the same rule forbids reading them automatically. With auto-read gone,
  the default path for a shopper holding a barcoded product is the shutter, which is the expensive
  image call. The mode toggle being built keeps the cheap path one tap away, but the tension is real.
- **Rule 7 against rule 6.** *"Claude should not be taking over"* and *"always an answer"* cannot
  both hold the moment a Gemini call fails. The startup refusal being built resolves only the
  keyless case. The failed-call case is already live and unresolved: `app/server.ts:2546` swallows a
  grounded failure and serves the verdict alone.

**Reverses if:** Jamin answers any of the three, or a legal review reads Google's terms differently
from `identify/src/grounded.ts:4-19`. Point 2 additionally reverses only the way its own decision
says it does: Aurik amending hard rule 2 himself.

## D-113 is closed with a guard, and six points come out of it rather than being built

**Aurik's ruling, 2026-09-16:** both guards, not either -- the lone-claim band ported from
`spine.ts:921-922` AND no verdict line under two offers. Built and pushed (`d91c37f`). What follows
is what was NOT built, and why each is Jamin's call rather than a session's.

**The measurement that forced it.** A real grounded search for Kraft Dinner 225 g returned one
Walmart offer of $9.97 carrying confident metadata against a hand-priced truth of $1.74.
`computeGauge` took the median of one offer, which is that offer, and the phone rendered *"225 g,
$1.74, your price, 83% under the middle of 1 prices"*. An ordinary price sold to a shopper as a
steal. That is D-113, and at the offer counts actually measured (1, 1 and 2 across the three
products that returned any Canadian price at all) it is the normal case rather than an edge one.

**1. The outlier behaviour, against a sentence Jamin has already written down as settled.**
`docs/walkthrough/gauge-math.md`, pushed 2026-09-16, states: *"one extreme unit price inflates the
span for every other point on the same line, so a single outlier compresses the rest of the gauge
toward the middle instead of being clipped or hidden. That is the formula exactly as specified, and
the test suite for this arithmetic asserts that compression directly rather than smoothing it away."*
The guard clips it. The doc is not wrong about what the code did -- `gauge.ts:125-129` said the same
thing and `gauge.test.ts` asserted it -- but the sentence was written before the $9.97 case was
measured. The consequence the old behaviour has that neither text names: an outlier does not merely
sit at the far end, it drags every honest price onto the midline, so a line of real disagreement is
rendered as consensus.

**2. Withholding the line at one offer, against rule 6.** *"Having a repsonse that is not checked is
infinitly better than having the user scan something, wait 10 seconds, only to get told the app
doesn't know."* The reading this was built on: the ANSWER survives and only the VERDICT goes. The
offers, the reviews and the description are all still on screen; what is withheld is the line, the
zone word and the percentage, replaced by *"Only one price found, so there is no middle to compare
against."* That is a statement about the evidence, not a confession of ignorance. The precedent is
Jamin's own engine: `spine.ts:417` holds a bad claim back but can never empty the set. **This is the
load-bearing reading of his own rule and he should confirm it**, because if he reads rule 6 as
"always a LINE" then D-113 has no fix that satisfies it.

**3. Rule 3 versus porting spine logic.** *"THE PRICE SHOULD NOT COME FROM US."* The argument, stated
precisely: **a plausibility band is not a price source.** Every number on the line still comes from
Gemini's grounded offers. `isLoneClaim` reads only those offers, compares them only against each
other (leave-one-out), produces no price of its own, and can do exactly one thing -- move an offer
into a labelled excluded list. Shin's price database and price engine are not consulted at any point.
Rule 3 governs WHERE THE NUMBER COMES FROM; this governs WHICH OF GEMINI'S OWN NUMBERS AGREE WITH
EACH OTHER. D-113's own row made the same observation from the other direction: the engine rules 3
and 6 would retire is the one that already had this guard.

**4. `gauge.ts`'s header is factually false, and it is legal-flavoured.** `gauge.ts:427-431` states:
*"NEVER CALL THIS ON A REAL GROUNDED PRICE. Doing so would be this app analyzing a Grounded Result,
which Google's grounding terms forbid ... this function's only callers are `test/gauge.test.ts` and
`test/item-rules.test.ts`."* Production calls it on real grounded offers at
`gemini-grounded.ts:981`, `:995` and `:1002`. Verified directly. Under rule 5 this **marks and never
blocks**, so nothing stopped and nothing is waiting on it. But the crossing became permanent when the
sandbox path was deleted for rule 1, and whether that deletion was meant to carry this consequence is
Jamin's call, not a session's. Same family as D-111.

**5. Deleting `GAUGE_PYTHON_SOURCE` and `codeMatchesGauge`**, about 250 lines whose stated purpose was
proving Gemini ran unmodified arithmetic. The guard was added to the TypeScript twin only, so the two
texts in that file now genuinely disagree, with a test still asserting the unused one is intact. The
proof those functions provided is already gone in practice -- there is no second call left to verify --
but the deletion should be SEEN rather than inferred from a diff, so it was not done.

**6. Excluding `clearance` prices from the line.** `effectivePriceOf` (`gauge.ts:390-397`) neither
divides nor excludes them, and the $9.97 offer carried `dealKind: 'clearance'`. Leaving the arithmetic
alone is right -- inventing a divisor for a promotion nobody parsed puts a dot at a price that does not
exist -- but whether a clearance price belongs on the line at all is a product question. It is a
genuine trade rather than a fix: excluding them reduces offer count, and offer count is already the
scarce thing.

**Also recorded, and not a point for Jamin because it is already fixed: two people were holding different facts about the same number.** `photo-identification.md` item 8
stated the 200-photo eval "used a stand-in ... never a real model call". True when written; there are
now three real runs, the latest 148/200 = 74.0% top-1. The cause was an ignore rule hiding
`identify/eval/results/` on every machine but one. Fixed in `6576137`, and logged here because the
failure mode -- a `.gitignore` line silently producing a documentation contradiction -- will recur.

**Three defects were found while building the guard, D-114 to D-116, two of them by tests that already
existed.** The band as specified held an honest price at two offers; the new confidence flag was called
`'low'`, which the grading-word ban forbids; and that ban sweep turns out to reach only five hardcoded
selectors.

**Reverses if:** Jamin answers any of the six, or a measured run shows the guard suppressing the line
on scans where the offers were in fact sound. Point 2 is the one to answer first: every other point
assumes the line may sometimes be withheld.

## Calls that cost money are limited per invite code and per address, and the cap charges the search fee
**Date:** 2026-09-19 · **Status:** active

**Why.** Asked by Jamin whether a hacker is limited in API calls. Before this, the live Gemini routes
(`/api/identify`, `/api/price`, the photo route) had no per-caller limit at all. The one per-device
ceiling sat on the older photo route and keys on a device id the caller supplies, so rotating it
defeats it. The dollar cap was the only backstop, and it charged 0.68 US cents a call, the price of a
Claude identification with no search, while one measured grounded scan used four search queries
(5.6 cents at the paid rate, one observation, a floor). At that charge the CAD 100 hard ceiling
would have let about eight times the money out before it moved.

**What was built.** `app/src/rate-limit.ts`: 200 calls per 10 minutes and 1,500 a day per invite code,
90 per 10 minutes and 600 a day per network address (`cf-connecting-ip` behind the tunnel, else the
socket address), each overridable with `SHIN_RATE_CODE_PER_10MIN`, `SHIN_RATE_CODE_PER_DAY`,
`SHIN_RATE_IP_PER_10MIN`, `SHIN_RATE_IP_PER_DAY`. A refusal is a 429 with `Retry-After`, sent before
any Gemini call and before anything is counted against the cap. The price route counts only when it
has no stored answer to serve. The cap now charges `groundedScanCapChargeUsdCents()`: 4 queries at the
paid rate plus 0.2238 cents of tokens, 5.8238 US cents. Tests: `app/test/paid-call-limits.test.ts`, the
three route tests confirmed red with the gate disabled.

**Limits of it, stated.** In memory, one process, forgotten on restart. The address header is
forgeable by anyone who reaches the port without going through the tunnel, so the port must not be
reachable except through it. The charge is the paid rate, so inside the free 5,000 searches a month it
over-charges (the safe direction): the soft cap of CAD 10 now marks and logs from about 127 scans a
day, and the hard ceiling of CAD 100 refuses at about 1,270. Neither number is Jamin's decision yet.

**Reverses if:** a real tester is refused (raise the numbers), or Jamin wants the cap denominated in
measured spend after the call rather than a paid-rate estimate before it.

## Nine rulings so the competitor-survey build could start
**Date:** 2026-09-19 · **Status:** active

Jamin, asked to settle nine rule questions raised by `docs/scanner-build-order-2026-09-19.md`:
*"build everything. Do what you think is best for your questions."* Each ruling below is mine under
that instruction, not his words, and each is reversible by him at no cost because none of them is
spent once. They are written here rather than in the build order so there is one place to reverse
them from.

**1. A cached Gemini answer is Gemini's answer, not Shin's price.** Rule 3 forbids Shin's own price
database, price engine and cheaper lookups from being the answer source. A verbatim replay of what
Gemini itself said about this exact barcode, carrying the timestamp of the call that produced it,
has Gemini as its source and Shin only as the storage. Rule 1 forbids two calls for one scan; zero
calls is not two. So: identity is cached with no expiry (a barcode's identity does not change), the
price is cached for six hours and always shown with when it was checked, and a hit older than one
hour triggers a background refresh. Cache key is the barcode plus market and currency, because the
same barcode in another market is a different answer.
**Reverses if:** he says a replayed price must never be shown without a fresh call, or a tester is
shown a price that moved inside the six hours and minds.

> **Its condition is now implemented and pinned, 2026-09-21.** The clause that carries this ruling
> is *"always shown with when it was checked"*, and on 2026-09-19 that was the ruling's promise
> rather than the app's behaviour. `a7987cd` closed it: a recalled answer carries the timestamp of
> the call that produced it (`app/server.ts:2947` passes `recalled.at` through) and `:1677` falls
> back to now **only** for an answer genuinely checked by this request, which is what that commit's
> subject means by "the server stops lying about it". `app/test/repeat-cache.test.ts` holds it.
> **Recorded because the catch-up note left this looking like an open disagreement and it is not
> one:** the ruling was not overruled and did not need amending, it was met. What is still open is
> only the second half of the reverse condition -- no tester has yet been shown a price that moved
> inside the six hours, so nobody knows whether they mind.

**2. The zero-padded barcode retry never re-hits Gemini.** It runs before the call, against the
cache and Open Food Facts only, and exactly one canonical digit string is sent to Gemini.
**Reverses if:** a measured miss rate shows the variant Gemini would have resolved is common enough
to be worth a rule change he makes himself.

**3. A page fetch is a check, not a call, and it never changes the number shown.** His own walkthrough
ruling already says it: *"there can be measures in place but definitely not calling the ai a second
time"*, and *"a hidden check may recompute Gemini's math; a mismatch marks that scan... for later
review. Never shown."* So the verifier fetches only a host on the allowlist, only a URL the grounded
search itself returned, records agreement or mismatch on the scan row, and leaves the displayed price
exactly as Gemini gave it.
**Reverses if:** the recorded mismatch rate is high enough that showing Gemini's number is knowingly
showing a wrong one, which is a finding to take to him, not a change to make quietly.

**4. A price that fails a guard is withheld, never replaced.** A number in the wrong currency or below
a plausibility floor is not an unchecked answer, it is a different fact, and rule 6's "an unchecked
answer beats no answer" does not reach it. The scan still answers: the product, the verdict and the
reason the price could not be confirmed. Nothing is substituted, and the suppression is recorded.
**Reverses if:** withholding turns out to be more confusing to a tester than showing the number with
a warning.

**5. Open Food Facts live is a third party; our imported copy of it is us.** The ruling *"the server
will not check shins own product list for now"* names our own list. A live call to Open Food Facts is
not our list, so it is allowed, and only for identity, never for price. The imported Open Food Facts
table in `catalogue/` stays unconsulted on the scan path, because that one is ours.
**Reverses if:** he reads the distinction as hairsplitting, in which case the live call goes too.

> **Aurik's answer, 2026-09-21: accepted, with a condition. Not built yet.** The distinction stands
> -- a live call to Open Food Facts is not Shin's product list -- so the ruling is not reversed. The
> condition is the shape ruling 1 already set: **the imported copy answers first, the live call is
> the fallback when it misses, and the answer records which of the two it used.** A network round
> trip on every scan for bytes already sitting on disk is a cost the shopper pays in latency and in
> a third party learning what they scanned, and paying it when the local copy already has the row is
> not something the ruling's own argument requires. The distinction being real is what makes the
> live call permitted; it is not what makes it first.
> **Open and needed before this is built:** how stale the imported snapshot is, and how often Open
> Food Facts identity actually changes for a barcode. Neither note states either number. Asked of
> Jamin in `notes/catch-up.md`, 2026-09-21.

**6. Grounding is skipped only when nothing is left to search for.** The short-circuit never means
Shin's catalogue. It means two cases only: the whole answer came from cache, so there is no call at
all, or the scan has no searchable identity whatsoever, where grounding spends money on an empty
query. Every other scan grounds as it does today.
**Reverses if:** measured spend shows grounding is affordable on every scan, in which case the gate is
complexity for nothing.

**7. Background enrichment writes beside the shown value, never over it.** A later, better answer goes
in its own column with its own timestamp, and the value the user was shown stays exactly as they saw
it. That is what "record everything" requires: what we showed, and what we later learned, both.
**Reverses if:** the two-column shape makes the scan row unreadable for the thing it is for.

**8. A missing Origin header is allowed and marked; a wrong one is refused.** A native wrapper can
legitimately send no Origin, so refusing the absent case would break a real client to stop a
hypothetical one. A present-and-mismatched Origin is refused outright.
**Reverses if:** the marked count of origin-less requests turns out to be abuse rather than wrappers.

**9. A scene change can cancel a request, never hide an answer.** Discarding happens before the call
is sent. Once the one permitted call is spent, its answer is recorded and shown, because hiding a paid
answer is both a waste and a thing the record would have to lie about.
**Reverses if:** testers report answers arriving for products they have already walked away from,
which is a UI problem to solve a different way.

## Git remotes differ per clone
**Date:** 2026-09-21 · **Status:** active

Moved out of CLAUDE.md on 2026-09-21 so the instruction file carries only the current rule. Measured the same day on Jamin's PC: `origin` pushes to both GitLab and `github.com/xu826Jamin/shin`, so the 2026-09-13 note below was true of Aurik's clone and not of this one, exactly as it predicted. **Reverses if** either clone's `git config --get-all remote.origin.pushurl` changes. The note, verbatim:

(Corrected 2026-09-13. This section previously claimed `origin` carried a second push URL at
`github.com/xu826Jamin/shin` so that one push wrote both hosts. Measured on Aurik's machine that
day: `remote.origin.pushurl` was unset, and `xu826Jamin/shin` answered `Repository not found` —
it may exist and be private to Jamin, which his own clone would see and Aurik's cannot. The
reachable mirror, `Aurikology/shin`, was 25 commits behind at `1fb914f` while GitLab was at
`c324bff`. The claim had already been "Corrected 2026-09-07" once, from "one remote", so this is
the second time this paragraph described a backup that was not the one in the config. If Jamin's
clone does carry that second push URL, this paragraph is true THERE and false HERE, and saying
which machine is the whole point.)

## The store listing goes out under the name Shin
**Date:** 2026-09-22 · **Status:** active

Jamin, 2026-09-22: *"we wwant to create the store listing under shin"*. Hard rule 1's condition is met: the CIPO search in the software classes was run 2026-09-04 and re-run 2026-09-11 (notes/trademark-search-2026-09-04.md, -09-11.md) with no live SHIN mark in Canadian classes 9 or 42, and the name was left as his call, which this is. Risks carried knowingly, not cleared: Nongshim's SHIN food marks (s.22 association on grocery shelves) and two live US class 42 design marks that transliterate to "Shin", one (Reg. 5082432) covering product-rating software. App Store and Play names must also be unique; that is checked when the record is created. **Reverses if** a store refuses the name, a demand letter arrives, or a trademark attorney advises against it before a US launch.

## A typed product name searches only Shin's own data, and answers only with the item and a price
**Date:** 2026-09-23 · **Status:** active

Jamin, 2026-09-23: *"typing a product should only search our catalogue and only return when we have both the item and price."* For typed searches only, this reverses two of his earlier rules in `docs/jamin-gemini-rules.md`: "no price from Shin's own data" and "always an answer". A barcode scan is unchanged and still goes to Gemini. Why it is right on the numbers: a typed search was an unlimited paid call (D-142, about US$0.062 each, `docs/unit-economics-2026-09-22.md`), and it now costs nothing and needs no place in the weekly free-scan count. What it gives up: until testers' scans fill the catalogue, most typed searches will get "no price yet, scan the barcode", and every price shown is one Shin recorded earlier, so its date is shown with it. **Reverses if** testers' typed searches mostly miss in the first two weeks of the beta (count them from the scan log), which would say the catalogue is too thin to be the whole answer yet.

## A barcode scan sends no photo
**Date:** 2026-09-23 · **Status:** active

Jamin, 2026-09-23: *"Fix the barcode full photo"* (D-147). The frame the barcode button used to upload is taken only when photo identification is switched on and the shopper's photo consent is on; with the tester-launch settings, never. The frame collection itself was his (2026-09-14, "collecting everything") and is kept in the code, not deleted. **Reverses if** photo identification is switched back on, where the consent switch then decides it. Not covered by this ruling and still open: the shelf capture stream (D-148).

## Shin Plus price and the weekly free scans
**Date:** 2026-09-23 · **Status:** active, the free-scan limit to be switched on only when a test purchase works

Jamin, 2026-09-23: *"For now, you decide the most reasonable for price and free scans."* Decided:

- **CA$3.99 a month, CA$29.99 a year.** The closest paid scanner, ShopSavvy, charges US$1.99 to 3.99 a month or US$29.99 to 34.99 a year; the 2026 median annual subscription is US$34.80 (both `docs/unit-economics-2026-09-22.md`). The year is priced at about 7.5 months so the yearly plan is the obvious pick, which matters because year-one churn on annual plans is about 72 percent and monthly is worse. Set in each store's product, never in the app (`plus-config.js` reads the store's price).
- **Free scans: 5 a week for the beta, 3 a week for the public launch on the cheaper lookup.** Typed searches are free and not counted (the ruling above). **Revised the same day on two words of his.** *"we should assume only 1 in 100 people pay"*, and *"why are you assuming a scan cost 0.6 cents when we have the cheaper system planned"*. The first version compared one free user with one subscriber, which is the wrong comparison: at 1 in 100, each subscriber pays for 99 free users. So the budget is revenue per user, not per subscriber.
  - **Revenue per user (derived):** a yearly subscriber brings in about US$1.55 a month after the 15 percent store fee (CA$29.99 at about 0.73 US$ per CA$, an estimate). At 1 in 100, that is **about 1.55 US cents a month per user**, all users counted.
  - **Cost per scan on the cheaper lookup (derived, untested):** about US$0.003 per scan that misses the cache (one live search at $0.002 after today's correction, plus a matching call at about $0.001, `docs/cheap-scan-pipeline-2026-09-22.md` section 4), plus f x $0.062 where f is the share that falls back to today's call. The repeat cache is assumed to answer 60 percent of scans (an estimate from `docs/unit-economics-2026-09-22.md`, unmeasured).
  - **What a user at the weekly limit costs a month**, W free scans a week (4.33 W scans, 40 percent of them uncached):

    | Fallback share f | Cost per uncached scan | Break-even W | At 3 a week | At 5 a week |
    | --- | --- | --- | --- | --- |
    | 0% | $0.0030 | 3.0 | 1.6 cents | 2.6 cents |
    | 5% | $0.0061 | 1.5 | 3.2 cents | 5.3 cents |
    | 10% | $0.0092 | 1.0 | 4.8 cents | 8.0 cents |

    Against 1.55 cents of revenue per user. Only users AT the limit cost this; a user who scans less costs less, and nobody has measured how many scans a real user makes (the 8 a month in the economics doc is an assumption).
  - **Why 3 a week, not the break-even 1 to 1.5:** the limit binds only heavy users, and a limit of 1 a week cannot let someone finish a single shop, which kills the product before it can earn anything (queue 6.16). 3 a week breaks even at the limit only if fallbacks are near zero, so it is a bet that the average user sits well under the limit. Set to be corrected by two measurements, not by opinion: f from the 50-barcode test, and real scans per user from the beta.
  - **Beta stays at 5 a week on today's lookup** because it is capped by size, not by conversion: 20 testers using every scan cost at most about US$27 a month (20 x 21.7 x $0.062, no cache), and during the beta nobody is charged anyway, so what it measures is who taps Subscribe.
  - **Public launch on today's lookup is not viable at 1 in 100**: at $0.062 a scan, 1.55 cents buys about one uncached scan every four months per user. The public launch waits for the cheaper lookup to pass its test (queue 7B.14).
- **When it switches on:** `SHIN_FREE_SCANS_PER_WEEK=5` on the Mac for the beta, only once a test purchase unlocks scanning end to end. Switched on earlier, a tester who reaches the limit meets a subscribe button that cannot take a purchase and simply stops scanning, and the beta loses that tester's week-two data. `3` at the public launch.

**Reverses if:** the 50-barcode test measures f, then recompute W from the table's formula (break-even W = 0.0155 / (4.33 x 0.4 x cost per uncached scan)); or beta data shows the average user's scans a month, then set the limit so the AVERAGE user costs under 1.55 cents rather than the heaviest; or affiliate income per user is measured, which adds to the 1.55 cents; or the price rises (the whole budget scales with it). Or if under 1 in 10 testers who reach the limit tap Subscribe in the beta, which says the price or the offer is wrong, not the number. Or if queue item 6.16's test fails: nobody knows yet how many scans one shop visit takes, so after the first beta week count scans per store visit in the scan log. If a typical visit needs more than 5, the limit stops people in the middle of a shop, and it should become a number of shop visits rather than scans.


## Country is a column in the catalogue, not a filter applied while loading

**Date:** 2026-09-26 · **Status:** active, **written to repair a citation whose target could not be found**

Three places cite "decision 28" as the authority for this: the Canadian food loader's own
docstring, its sibling loader, and the catalogue research doc. Searched on 2026-09-26 for the
decision itself in this file, in the queue, in the current state file and in every doc under
`docs/`; only the citations turned up, never an entry. So the rule the code obeys has never been
written down, and the entry below is that rule stated, not a new choice.

**The rule.** Whether a product is sold in Canada is recorded as a column on the row. A loader
does not delete a product for being foreign. Anything that needs only Canadian products filters
on the column at read time, which the cheaper-alternatives path already does.

**Why it matters more than it sounds.** The three non-food databases are loaded whole under this
rule, which is why the catalogue holds 48,943 beauty, 26,947 general-product and 12,294 pet-food
rows of which only 801, 681 and 214 are Canadian (counted from the database, 2026-09-26). The
Canadian food loader breaks the rule: it ends `WHERE list_contains(countries_tags, 'en:canada')`
and so keeps 122,158 of the source's 4,759,011 food products (counted from the publisher's own
row index, 2026-09-26), discarding 4,636,853 at load time.

**Reverses if:** the file the phone downloads is ever built by country at load time rather than at
read time, in which case country becomes a load-time concern by construction and this entry is
wrong rather than merely unenforced. Or if he decides the catalogue should hold only what is sold
here, which is his call and not a technical one.

## The four and a half million food products from outside Canada stay out, for now

**Date:** 2026-09-26 · **Status:** parked

Removing one clause from the Canadian food loader would admit **4,636,853 more food products**
(counted 2026-09-26: the source holds 4,759,011, the catalogue keeps 122,158), it is a single line,
the loader's own notes say no change to how rows are stored is needed, and the rule above says the
filter should not be there at all. It is still parked, and the reason is not effort.

**The file the phone downloads is built with `sold_in_canada = 1`** (read in the pack exporter,
2026-09-26). Those 4.6 million rows arrive flagged as not sold in Canada, because the country tag
is exactly what the filter was reading, so **every one of them is excluded from the phone's copy by
construction**. They would be reachable only through the server-side search, which was checked the
same day: it ranks Canadian rows higher and filters nothing out, so they are reachable online and
nowhere else. The price of that is an 8 GB download, a full reload, and unmeasured disk on a
database already at 4.1 GB.

For an MVP whose testers shop in Canada, that is the lowest return of any catalogue work available,
which is the whole reason for the park. It is not a judgement that the rows are worthless.

**Promotes back if:** the barcode miss log records a scan of a product not sold in Canada, which is
the direct evidence that a real shopper needs them and the only evidence that should reverse this.
That log has recorded zero barcode misses of any kind so far (counted 2026-09-26), so the condition
cannot currently fire, which is itself an argument for fixing the log first. It also promotes back
if the phone's copy stops being built by country, since the exclusion is the entire objection.

## British Columbia's wine and spirits are not worth crawling yet

**Date:** 2026-09-26 · **Status:** parked

British Columbia's beverage-container registry is public, free, needs no login, and prints its own
totals, so the sizes are exact rather than sampled: **154,401 containers, of which 130,404 are
alcohol** (read off the registry's pager, 2026-09-26). At thirty rows a page that is 4,347 pages
for the alcohol alone, **8.1 hours** at a measured 6.7 seconds a page over 80 pages. The other
**22,972 rows, 764 pages, 1.4 hours**, are being taken.

**It is not parked for being slow, and the honest version matters here.** Per hour the alcohol is
the better yield, roughly 15,800 new products an hour against 7,200 for the rest, measured on 1,839
sampled rows, and the crawl is unattended so hours are nearly free. It is parked on price coverage.
The only free British Columbia price file carrying barcodes holds **7,555 distinct barcodes**, so
**at most 5.8% of those 130,404 containers can ever carry a price** (two exact counts, no sampling).
New Brunswick's public list adds 5,977 more priced barcodes but does not move that share much. So
94% of the crawl would produce a scan that finds the bottle and has nothing to say about what it
costs, inside a category with almost no prices to average.

**Promotes back if:** a free price source is found that covers more than a quarter of the 130,404,
which makes the found-with-no-price outcome the exception rather than the rule; or a tester's scan
log shows wine and spirits actually being scanned, which would mean the category earns the hours
whether or not a price exists.

## The fuzzy search stays at one row in seven

**Date:** 2026-09-26 · **Status:** parked

**718,662 of 5,182,591 products carry a vector** (counted from the database, 2026-09-26). The word
search covers all 5,182,591, so a product without a vector is still findable by its name; only the
fuzzy, close-enough path is affected. Nobody has measured how fast the embedder runs, and the row
count would grow roughly forty-fold if the foreign food rows above were ever loaded, so starting a
full pass is starting something of unknown length.

**Promotes back if:** a timed ten-thousand-row slice extrapolates to under a day, which is the
measurement this park is really waiting on and which costs minutes; or the miss log starts showing
typed searches failing on products the catalogue demonstrably holds, which is the one symptom a
missing vector actually causes and therefore the only user-visible reason to care.

## Books, music and records stay out of the catalogue

**Date:** 2026-09-26 · **Status:** parked

Three free, openly licensed sources would each add a large number of real barcoded objects: Open
Library with around 30 million editions, where the ISBN printed on a book **is** its barcode;
MusicBrainz, which reports **2,581,558 of 5,804,963 releases carrying a barcode**; and Discogs,
published monthly. All three figures come from the publishers' own pages, read 2026-09-26. How much
each overlaps what the catalogue already holds is **unmeasured**.

They are parked because the product is a grocery and shelf-price scanner. Nothing in the beta scans
a book or a record, so those rows would add size, add crawl and load time, and dilute every typed
search, in exchange for answering a scan nobody is making. The United States branded-foods file is
deliberately **not** parked with them, because it is food.

**Promotes back if:** the barcode miss log records an ISBN or a music barcode. One condition serves
all three, and it is cheap to detect: book barcodes begin 978 or 979.

## A scanned barcode answers with Shin's own prices too, not Gemini's alone
**Date:** 2026-09-26 · **Status:** active

Jamin, 2026-09-26, on being told the seam was built and waiting on his sentence: *"there seems to be
a communication problem, why are you still thinking about gemini"*. That is the ruling for scans, and
the ruling of 2026-09-23 for typed searches now reads as the first half of one direction rather than
an exception: **where Shin holds the price, Shin shows it.** For barcodes this reverses the rule in
`docs/jamin-gemini-rules.md` that made Gemini the only price source, and it reverses nothing else:
Gemini is still called on every scan, still gives the identity and its own offers, and no catalogue
lookup is added to the request, so the tests that hold a scan to zero catalogue calls still hold.
Our prices ride in the same offers list, each marked as Shin's own data, untrusted, and carrying the
date it was seen.

**It was mine to open and I held it shut, which was the mistake.** The switch is one line
(`SHIN_BARCODE_OWN_PRICES=0` closes it), costs nothing to run and changes no answer Gemini gives; a
decision that cheap to undo does not get escalated, and the standing instruction says so in words:
a blocker is a false positive unless it is spent-once, compliance, or his personal data.

**What it changes, counted by calling the route's own lookup over every barcode in the price store,
enumerated and not sampled.** **17,994 barcode strings, all 17,994 answered, 0 unanswered**, being
**13,975 distinct trade items** (4,019 strings are a second spelling of a number already present).
By seller: British Columbia 7,555, New Brunswick 6,741, Open Prices 417, Walmart 21. Control held: a
barcode the store does not hold returns nothing, so "answers for everything" is not a function that
answers for anything.

**The first number reported for this was 862, and it was wrong by 21 times.** 862 is how many priced
barcodes also have a **catalogue** row (`docs/answer-change-2026-09-26.md`), and catalogue coverage
does not gate this path at all: it reads the price store, never the product list, so a barcode with
no catalogue row still gets our price. The right denominator is what the price store holds, and the
93.6%-with-no-product figure belongs to the catalogue question, not to this one. It does not make the
app independent of the model; identity still comes from there.

**Pinned by tests in both directions**, `app/test/barcode-own-prices-route.test.ts`: one process with
nothing set must answer with our price, a second process with the switch set to `0` must answer with
none of it, and flipping the default back turns the first red, checked by doing it rather than
claimed.

**Reverses if** a tester is shown a Shin price that is wrong at the till and the outside answer was
right, which is visible in the corrections store rather than in an opinion; or if two prices on one
answer sheet are shown to confuse rather than help, which is a design question and his.

## One list of current rulings outranks every other file

**Date:** 2026-09-27 · **Status:** active, being built

Jamin, 2026-09-26/27, on the PC: *"When i make a decision, especially a decision regarding
something that is integrated in every aspect of a system like gemini's role in shin, claude only
updates one part of the repo and the rest of the repo stays not up to date unless claude reads
thorugh the entire thing. This is a huge underlying red flag for the future when we scale our
app."* Then, choosing the defaults offered: *"yes to all four defaults, start the Shin pilot
without auriks agrement"*.

**What changes.** A new file at the root, `RULINGS.md`, holds one entry per live ruling, rewritten
in place when the ruling changes; this log keeps the history. RULINGS.md outranks every other file
in this repo, **including `docs/jamin-gemini-rules.md` and the Google Doc walkthrough**, which feed
into it rather than competing with it. `NOW.md` is state, never rulings. Code reads its settings
from one module. Dated documents get a one-line "snapshot as of" label instead of a rewrite. A
test fails when a retired ruling or a stray model name reappears in a live file. Changing a ruling
means: rewrite its entry, move the old text here, search for the old wording, fix every hit in the
same commit.

**Why, measured before anything moved** (the full record is in Jamin's agent repo): a fresh Sonnet
session asked 12 questions about Shin at `81b2f91`, three times, got 33 of 36 right, and on 9 of
the 12 at least one run had to pick between files that disagreed. The two wrong answers were
Gemini's role exactly: one run said a barcode never shows Shin's own prices (the ruling above
says it does), one said the default model is gemini-2.5-flash (the code has sent every scan to
gemini-3.8-flash since 2026-09-22). This log's newest entry says it reverses rule 3 of the rules
file, and rule 3, plus line 8 of CLAUDE.md that every session reads first, still say the opposite.

**Aurik** was told through `comms/messages/`, not asked; Jamin chose not to wait.

**Reverses if:** the same 12 questions, re-asked after the sweep, are not answered better than
33 of 36 with 9 contradictions; then the structure did not fix what it was built for.

## Sessions talk through GitLab, not the Notion page

**Date:** 2026-09-27 · **Status:** active

Jamin, 2026-09-27: *"i've already told you before to switch to gitlab for communication, not
notion"*. This supersedes 2026-09-19's *"nvm, we are still using the notion"* (quoted in
`comms/README.md`) and the Notion board of 2026-09-14. He had given the switch before and it never
reached this repo, which is the failure the ruling above exists to stop. The Notion workspace is
also out of free blocks (a write refused 2026-09-27 03:06 UTC; the same limit that silenced the
Mac checker on 2026-09-23), so the page could not have carried anything anyway.

The board is now `comms/` in this repo: `comms/claims/<name>.md` for who is working on what,
`comms/messages/` for questions and handoffs, both pushed to GitLab. The session-start hook reads
both from disk after a pull; the 20-minute Notion reminder hook is removed. **Not yet moved:** the
Mac's deploy checker still takes its requests from the Notion page (`mac/deploy/`); moving that to
GitLab is a Mac-side unit, asked of the Mac through the mailbox.

**Reverses if:** he says so.

## Every push is checked by GitLab, and every prompt that reads like a ruling gets recorded

**Date:** 2026-09-27 · **Status:** active, being built

Jamin, 2026-09-27: *"rememebr all fixes and problems that you identified are useless if your
solutions are not future proof"*, then *"yes to both"* to (1) GitLab CI on this repo, so every
push, Aurik's included, shows a red or green mark, and (2) a ruling-capture hook.

Found when checking: this repo had no CI, no git hooks and no check that runs unless a session
chooses to run tests, so every cleanup guard would have rested on someone remembering. Built as:
`.gitlab-ci.yml` running the fast checks on every push (backstop; a red mark does not undo a push,
since there are no branches); a tracked `.githooks/pre-push` running the same checks and blocking
the push, installed on every clone by the session-start hook setting `core.hooksPath`; a
UserPromptSubmit hook that, when a message reads like a ruling, tells the session to write it to
RULINGS.md and this log in the same turn. Each check carries a planted violation it must fail on,
so a disabled check shows red rather than a silent green.

**Reverses if:** the checks block legitimate pushes more than they catch real regressions, counted
from the pipeline history.

## Catalogue first, Gemini a capped fallback

**Date:** 2026-09-27 · **Status:** active; the running beta changes when its setting flips

Aurik, 2026-09-27 (comms message of 13:43 -0400): *"THAT IS THE PLAN WE WILL FOLLOW, WE ARE
SHIFTING SHIN AND THAT IS THE MOST RECENT PLAN"*, the plan verbatim: *"identify if it is in our
catalogue, catalogue has a bunch of categories and a general price range for those categories, use
pure math instead of calling apis to generate an avg price range / Call claude and ask it what is
the typical price range for this item, this can be limited to a certain amount of time per month /
Identify the object, price tag, cereal box, container, all of these things will have text, we take
these texts and search it in our catalog, and return the top 3. Passive feature. / Look into: if
our catalogue does have the product. / If product cannot be matched, manually input this."*
("Call claude" means Gemini, Aurik's answer the same day.) Jamin the same day, in the agent repo:
*"why do you still think we use gemini, even after all the work done yesturday"*, the second time
after 2026-09-26's *"there seems to be a communication problem, why are you still thinking about
gemini"*.

**Why it took two corrections.** The 09-26 words were recorded as the smallest change that
satisfied them (own prices shown beside Gemini's, "and it reverses nothing else"), so every
Gemini-first entry stayed active, and the 09-27 before/after test graded sessions against a key
written from that narrow entry. The ruling-capture hook matched neither sentence, because a
correction phrased as a question fits none of its patterns; widened the same day (5 new fires over
his 1,081 distinct typed prompts, all 5 corrections), with both sentences as selftest cases that
fail on the old hook.

**Old text moved here from RULINGS.md:**
- "Gemini switch and call architecture": *Gemini replaces Claude for identification (measured:
  7/7 price requests refused, 9/30 barcodes absent, Claude refusing 4/15 photos on Jamin's phone).
  One Gemini call returns product, prices, reviews and price math together, never split; photo
  scans are also one call. Rollout order: identification, guard, grounded prices, reviews, price
  line.*
- "Verifying Gemini never means calling it twice": *Built on top of that: Shin never runs or
  shows its own price math to the user, but a hidden background check may recompute Gemini's
  math...*
- "Product identity and catalogue matching": *The server calls Gemini for identity, not Shin's own
  catalogue: Aurik later accepted a live-vs-imported distinction...*
- "Per-scan cost accepted, no catalogue-first free path" (renamed "Gemini spend cap"): *The
  roughly 5.6-cent per-scan cost past ~1,250 scans a month is accepted; there is no catalogue-first
  free path in front of Gemini.*
- "A scanned barcode answers with Shin's own prices too": *Gemini is still called on every scan
  for identity and its own offers.*

**Reverses if:** the measurement Aurik's session runs first shows the catalogue holds too few of
the products shoppers scan for top 3 to beat asking Gemini; that number goes to both founders.

## The price-range fallback is Claude with no web search, not Gemini

**Date:** 2026-09-28 · **Status:** active

Jamin: *"this is probably the 10th time saying this, we are not using gemini, we are using claude
for a typical range without having it search the web, this way we save a lot of credits"*. The
entry above glossed the plan's *"Call claude"* as Gemini on Aurik's word; Jamin's word overrules
that gloss. If Aurik meant Gemini, the founders settle it between them; until then the register
follows Jamin. Five RULINGS.md entries were rewritten; their old text:

- "Catalogue first; Gemini is a capped fallback, never the identity": *Gemini is not asked who the
  product is; it is only a fallback asked for a typical price range, capped per month. Every new
  feature is planned without Gemini, and no work widens Gemini's role.*
- "Gemini switch and call architecture": *When Gemini is called, now only as the capped fallback
  above, it is one call, never split.*
- "Claude excluded; founder's words outrank the system and Gemini's terms": *Claude is never used
  inside Shin once Gemini is in.*
- "LLM prompting efficiency and research approach": *Claude is excluded once Gemini is in (Claude
  excluded ruling above, 2026-09-17).*
- "Gemini spend cap": *Gemini calls stay under a daily and a hard dollar cap. ... the catalogue now
  answers first and Gemini is a monthly-capped fallback (catalogue-first ruling).*

The running beta still calls Gemini until the catalogue-first setting flips; that is today's code,
not the plan.

## Shin always answers a price: prediction through nested categories

**Date:** 2026-09-28 · **Status:** active · RULINGS.md "How Shin predicts a price it has not seen".
Two entries rewritten to hold it; old text:

- "Catalogue first; Claude, with no web search, is the capped price-range fallback": *prices, else
  its category's range. When Shin has no price, Claude is asked for a typical price range from its
  own knowledge, with no web search, capped per month, to save credits.*
- "A scanned barcode answers with Shin's own prices too": *Typed-name search (not barcode) still
  only searches Shin's own catalogue and answers only when both item and price are known; that
  narrower rule is unchanged.*

## Three entries that contradicted Jamin's own words, rewritten

**Date:** 2026-09-27 · **Status:** active

A clean check of all 320 standing rulings in Jamin's typed messages against RULINGS.md (agent repo,
docs/decision-capture-2026-09-27.md) found these entries saying the opposite of his words, with no
later word of his reversing them. He was away and said *"do what you think is right for
decisions"*; each rewrite follows his words and keeps what they do not touch.

- "Catalogue scope": old text *"Books, music and Discogs records stay out of the catalogue (it is a
  grocery/shelf-price scanner); the US branded-foods file is not parked with them because it is
  food."* against 09-03, 09-06, 09-11 (Shin prices anything). Books and music stay parked, for the
  MVP low-return reason, with the same miss-log promotion.
- "Verifying Gemini never means calling it twice": his 2026-09-20 words (stop building things that
  find out if the answer is wrong; get more accurate answers) were never recorded. Added; the hidden
  checks already built are left as they are, since they are Aurik's code and cost the user nothing.
- "v1 floor: live photo recognition is load-bearing" (renamed "v1 floor: what the MVP ships, and
  how photo identification returns"): old text *"photo recognition is load-bearing and required
  ... The photo path (IdentifyStage, catalogue search, second-pass model pick) opens via POST
  /api/identify/photo; web search on a catalogue miss and image-embedding search stay parked
  pending a measured top-1 eval."* against his 2026-09-21 MVP cut (photo id off for now); the
  2026-09-27 catalogue-first plan is how it returns.

**Reverses if:** he says so.


## No used goods, and sources chosen by what users scan (2026-09-28)

His words, 2026-09-28: *"we are not going to be scanning used goods"*, and earlier the same night
*"consider what users are actrually going to be using shin for"*. Recorded in RULINGS.md under
"Catalogue scope" and "Mission and principles". The ruling judge named four entries that said
otherwise; each was rewritten and its old text is kept here.

- "Attribution, provenance and correction data": old text *"eBay's Browse API answers only for
  used/tech, asking prices only, filtered to Canadian fixed-price listings, never for groceries."*
  Now: eBay gives no answer, because Shin does not scan used goods.
- "Product identity and catalogue matching": old text *"Alternatives split validation (farm/used
  price can still validate) from genuine switching (rejected)"*. Now: a farm price can still
  validate; a used price cannot.
- "What the price line covers": old text *"marketplace/US listings stay off the price line"*. Now
  used or resale prices stay off it too.
- "Price feed sourcing": old text *"categories chosen for official APIs over blocked
  direct-retailer fetches"*. Now sources are chosen for what users will scan (new products in
  stores), and among those an official API comes before a blocked direct-retailer fetch. The
  no-evasion line is unchanged.

Not rewritten, flagged: `docs/the-vision.md` still lists "used" among the four kinds in the code,
and the 2026-09-03 research memo made second-hand electronics its first "Ship" class. Both were
written before this ruling; RULINGS.md wins.

**Reverses if:** he says so.

## The price answer must tell the shopper whether the price is good (2026-09-28)

His words, 2026-09-28: *"The user is looking for validation for whether or not a product is a good
price or a bad price. And if we are not able to give A valuable answer, then our entire system is
useless."* Recorded in RULINGS.md with the two rulings of the same message ("Priced store items that
match no barcode still train prices", "Everything is an assumption until tested"). The ruling judge
named two entries as narrower; each was rewritten and its old text is kept here.

- "Catalogue first; Claude, with no web search, is the capped price-range fallback": old text
  *"The price range comes from Shin's own data by math: the product's own prices, else a prediction
  through its categories"*. Now the prediction draws on every data point Shin holds.
- "How Shin predicts a price it has not seen": old text *"Each data source carries its own
  confidence level, set by the assistant."* Now that level is a starting guess replaced by measured
  accuracy, shopper reports are weighted by how well they check out, and machine-learning prediction
  is considered and used only after beating the simpler method on a held-out test.

Not rewritten, flagged to him: "The price line speaks the shopper's own range, never Shin's opinion"
bars the words good and bad without measured testing. The new ruling keeps that wording rule in
force until he decides.

**Reverses if:** he says so.

## How a Shin system is designed (2026-09-28)

His words, 2026-09-28, correcting a design process that listed steps with nothing tying them
together: *"There should be something that guides you in one direction: what is the purpose of each
one of these stages. are there going to be checks in place? how are you going to find if something
works or doesn't work. Instead of designing everythign yoruslef, everythign is avaliable on the
internet"*. Recorded in RULINGS.md. The ruling judge named one narrower entry, rewritten:

- "Decision-analysis and calibration discipline": old text *"Before refining a design, research
  existing open-source tools and how other companies solve the same problem."* Now: before designing
  anything, research what already exists, pointing to the new entry. Third time he has asked for this
  (2026-09-22, and twice on 2026-09-28).

**Reverses if:** he says so.

## Builders and tests cannot damage real data (2026-09-28)

His words, 2026-09-28, after two near-misses in one session (a lane deleted every installed
dependency by removing a temp copy that linked the real node_modules; a lane's test moved every
file out of the real legacy photo folder and deleted it, harmless on the PC, fatal on the Mac):
*"how can we prevent problems like this but not limited to this from happening in the future"*,
then *"build 1-5"*. The five: tests run on temp data and fail the run if a real data folder
changed (the third test-writes-real-data incident: the user catalogue, the repeat cache on
2026-09-20, the photos on 2026-09-28); each lane gets its own worktree and installs; a hook blocks
destructive commands on libraries, data and folders holding links; tests refuse to run in the
live server's folder; the Mac's data is backed up nightly with a restore test. Recorded in
CLAUDE.md (process rules live there, not in RULINGS.md).

**Reverses if:** he says so.
