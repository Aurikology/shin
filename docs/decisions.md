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
"good prices found" pays for inventing them. Hard rule 3 forbids the fiction becoming a price, and
priority 1 says a wrong verdict is the worst outcome the product has. So no v1 mechanic is
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
