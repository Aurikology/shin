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
**Date:** 2026-09-03 · **Status:** active

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
sit at half, in that order, because a wrong verdict is worse than no verdict and correction is the
only action that exists on every outcome including a refusal.

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
