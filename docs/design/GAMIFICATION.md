# Shin GAMIFICATION.md

Phase 5 of `docs/design/brief-usage-and-avatar.md`. Written 2026-09-03.

**What wins over this file.** `CLAUDE.md` hard rules and priority order, then `NOW.md`, then
`docs/design/USAGE.md` on any question of sequence. This file wins over `DESIGN.md` on any
question of reward.

**Inputs read in full before writing:** `CLAUDE.md`, the brief, `docs/decisions.md`,
`docs/design/USAGE.md` sections 5 to 8 and 11, `notes/duolingo-owl.md` sections 3 to 5,
`notes/olma/audit.md` (paywall block, scan meter block, Collection block, rows 20 to 29, 37, 64,
69 to 77), and the retention and monetisation stages of `pages/shin-walkthrough.html`.

**The ask, in one line:** decide which reward mechanics Shin ships, which wait, and which are
killed, on the test of what each one pays a person to do and whether paying for it puts a false
number into the product.

---

## 0. The constraint this file starts from, before any mechanic is named

Four facts set every answer below. They are not preamble. Each one kills mechanics on its own.

1. **Shin's core act produces the data Shin is judged on.** `notes/duolingo-owl.md` section 5,
   seventh consequence, states it and hands it here: a Duolingo lesson produces nothing but
   learning, so paying for lesson volume is safe. A Shin scan produces a price. Paying for scan
   volume pays for price noise, and paying for "good prices found" pays for inventing them, which
   hard rule 3 forbids. Any Shin mechanic has to pay for something a second party can confirm, and
   the pool of confirmable behaviours is far smaller than Duolingo's.

2. A reward that raises the rate of bad rows raises the rate of wrong verdicts. That makes a
   corrupting mechanic not merely risky but a direct hit on the product's only value.

3. **The primary user is a window shopper and the measure is browse frequency, never purchase
   frequency** (`CLAUDE.md`). This kills every mechanic priced against a purchase, and it also
   kills every mechanic that taxes browsing, which is why `docs/design/USAGE.md` section 6 rejected
   the scan meter.

4. **The pilot's state is the budget.** The engine answers 2 of 7 items, there is no vision model,
   and there is no crowd price layer (`pages/shin-walkthrough.html`, stage 06). A mechanic whose
   input is a price Shin can re-check has no input today.

**The rule the founder set on approving the brief, verbatim:** *"we are not trying to copy duolingo
or any other app, we are taking inspiration that applies to us."* Every kept mechanic below carries
the reason it applies to a person holding a phone up in a store aisle in front of one price.
"Duolingo does it" and "OLMA does it" are not reasons and appear nowhere as one.

---

## 1. Reconciling the two findings, because they look like they disagree and do not

Two things were established in the earlier phases and they pull in opposite directions.

**Finding A** (`notes/duolingo-owl.md` section 3). The published retention multiples belong to
streak, leaderboard and notification work, not to the mascot. The former CPO attributes 4.5x DAU
over four years to a portfolio of gamification, streak, leaderboard and notification work
(Lenny's Newsletter, cited in that file). Leaderboards carry the largest published retention effect
with a mechanism named: CURR up 21%, daily churn down over 40%. Nothing published isolates the
character's contribution at all.

**Finding B** (`docs/design/USAGE.md` sections 5 and 8, and `notes/duolingo-owl.md` section 5). The
daily-occasion levers have no equivalent for Shin. Duolingo owns its own trigger and Shin does not.
A lesson can be done anywhere, so a push manufactures the occasion. A scan needs an aisle, which the
app cannot cause and cannot see coming.

**They are both true, and taken together they say something neither says alone.**

- The mechanics with the biggest published effects are **exactly the class Shin is structurally
  excluded from**. Streaks, leagues and reminder pushes all convert an idle moment into the core
  act. Shin cannot convert an idle moment into a scan. So the evidence base for "gamification is
  worth a multiple" is evidence about a machine Shin cannot build.
- The correct conclusion is therefore neither "copy the effective ones" nor "gamification does not
  work". It is: **Shin has no borrowed prior for what gamification is worth to it.** Every mechanic
  in this file is unmeasured for this product, and any figure lifted from Duolingo to justify one is
  a figure about a different trigger.
- The leaderboard is the sharpest form of the tension and worth stating plainly: it is the mechanic
  with the largest published retention effect **and** the mechanic that most directly pays a person
  to put a number into the product that nobody checked. Those two facts are about the same feature.
  Priority 1 decides between them, and it decides against the leaderboard until confirmation exists.
- What does transfer from Duolingo is not a reward at all. It is the three things
  `notes/duolingo-owl.md` section 5 lists as taken: a trigger that is an outside event Shin
  observed, the give-up message, and a character whose job is to make an honest refusal survivable
  rather than to make repetition unavoidable. None of those pay a person for anything.
- The structure transfers even where the mechanics do not: hundreds of shipped experiments each
  worth a fraction of a percent, compounded (the earnings-call quote in `notes/duolingo-owl.md`
  section 3, roughly 350 changes per app version). Shin cannot run that at its size today. So the
  right allocation is two or three mechanics that cost near nothing and cannot be faked, and the
  rest of the budget on the feed, because the strongest return trigger in the product is an outside
  event and it is gated on the feed rather than on a mechanic
  (`docs/design/USAGE.md` section 5, rank 5).

---

## 2. The mechanics, eighteen of them, five lines each

**How to read the five lines.** *Pays for* is the behaviour a rational person would increase to get
the reward, not the behaviour the designer hoped for. *Cheapest gaming* is the laziest exploit, not
the cleverest. *Corruption* answers one question only: does the exploit put a false number into the
price data or the verdict. *Missing data* is measured against the pilot's actual state. *Cost* uses
the repo's three sizes: **small** means it fits an existing screen and reads data `store.js` already
holds; **medium** means a new surface, a new stored object, or a server-side count; **large** means
accounts, a moderation path, or a new data source.

### Group A. Mechanics that pay for a reported price

#### M1. Earned scans for contributed prices
- **Pays for:** typing a price into Shin, and typing more of them, whether or not the number is real.
- **Cheapest gaming:** type any plausible number at any seller, in bulk, from a couch. No travel, no
  photograph, no product in hand.
- **Corruption:** yes, and of the worst kind. The invented number enters the comparison set and
  becomes the basis of somebody else's verdict, which is hard rule 3 breached at the point where it
  costs a real person a wrong answer.
- **Missing data:** a second independent observation of the same price at the same seller inside a
  freshness window. Shin has none of the pieces: no store identity, no per-category freshness
  window, no accounts, no volume.
- **Cost:** medium for the meter and the grant, large for the confirmation layer that makes the
  grant legitimate. The meter alone is the cheap half and the useless half.

#### M2. Scan streak
- **Pays for:** opening the app and taking a scan every day, on the app's schedule rather than the
  world's.
- **Cheapest gaming:** re-scan the same barcode at home once a day. Nine seconds, no store, no price.
- **Corruption:** of the verdict, no, since a repeat scan of a known item produces no new row. Of the
  data, yes indirectly: repeat scans inflate the distinct-products-over-total-scans ratio in the
  wrong direction and corrupt the one instrumented number
  (`pages/shin-walkthrough.html`, stage 09) that decides whether caching rescues the unit economics.
  It also spends per-scan money, in the $0.008 to $0.040 range that file derives, on nothing.
- **Missing data:** none. This is buildable today, which is exactly why it needs a reason and not a
  capability check.
- **Cost:** small.

#### M3. Global leaderboard ranked by scan volume or by "good prices found"
- **Pays for:** volume of the core act, publicly, against strangers.
- **Cheapest gaming:** on the volume form, scan a shelf of barcodes without reading a single price.
  On the "good prices found" form, report low prices that were never on a tag, since a low number
  wins the row.
- **Corruption:** the volume form corrupts the scan corpus; the "good prices found" form corrupts the
  price data directly and rewards the exact fabrication hard rule 3 names.
- **Missing data:** a rankable unit that a second party can check. Confirmations are that unit and
  they do not exist.
- **Cost:** large, because a public ranking without accounts and a moderation path is a leaderboard
  of one device.

#### M4. Store-level "best price found this week"
- **Pays for:** reporting the lowest price at a named store, this week.
- **Cheapest gaming:** report a price below every real one at a store nobody else visits. The prize
  is for the lowest, so understating is the winning move, and a store with a single contributor is
  unfalsifiable.
- **Corruption:** yes, and it is directionally biased, which is worse than noise. Every exploit pushes
  the comparison set down, which makes Shin call real prices a rip-off. That is a wrong verdict
  delivered loudly, which is priority 1's named worst outcome.
- **Missing data:** store identity attached to a price, a second observer at that store, and enough
  users per store that a second observer exists at all. None of the three.
- **Cost:** large.

#### M5. Draws and sweepstakes
- **Pays for:** whatever the entry is priced against. If entries come from scans, it pays for scan
  volume. If they come from reported prices, it pays for reported prices, at the highest incentive
  ratio in this document, because the prize is large and the effort is a keystroke.
- **Cheapest gaming:** multiple entries from one person, and where an entry is a scan or a report, a
  script or a shelf of barcodes rather than a shopping trip.
- **Corruption:** yes when entries are earned by reports. No when entries are earned by an act that
  produces no price data, for example a referral or a share, and in that form the risk moves from
  the data to the legal and cash exposure in section 3.
- **Missing data:** identity strong enough to enforce one entry per person, which needs accounts. The
  v1 floor puts accounts out (`pages/shin-walkthrough.html`, stage 12).
- **Cost:** medium to build, large to run, since the prize, the disclosure, the record keeping and
  the legal check in section 3 are the real cost rather than the code.

#### M6. Cash bounties for a named price at a named store
- **Pays for:** going to a specific store and reporting a specific item's shelf price, which is the
  single most useful behaviour in this product and the single most dangerous to pay for in cash.
- **Cheapest gaming:** claim the bounty from home with a plausible number. The payment is per report,
  so the return on invention is the whole bounty.
- **Corruption:** yes, and it is the strongest fabrication incentive available. Money for a number
  nobody checks is a purchase order for fiction.
- **Missing data:** photographic evidence of the tag, which needs a vision model Shin does not have,
  plus a second observer, plus a payout rail and the identity behind it.
- **Cost:** large.

### Group B. Mechanics that pay for volume without touching a price

#### M7. Badges and levels awarded for scan count
- **Pays for:** scanning more things, of any kind, at any time.
- **Cheapest gaming:** re-scan anything with a barcode. A cupboard is a level.
- **Corruption:** of the price data, no. Of the instrumented ratio and of the per-scan bill, yes, in
  the same way as M2 and for the same reason.
- **Missing data:** none.
- **Cost:** small.

#### M11. Collection completion, a category filled in
- **Pays for:** scanning items the person does not care about, to close a set.
- **Cheapest gaming:** scan the missing items in one aisle in one pass, reading no prices.
- **Corruption:** of the price data, no. Of the product's own premise, yes: a completed set is the
  app asking a window shopper to shop for the app rather than for themselves, and the scans it buys
  are the least considered ones in the corpus.
- **Missing data:** a catalogue complete enough per category for a set to be a real thing. The corpus
  is seven items, and `docs/decisions.md` puts produce out of v1, so the categories are partial by
  design.
- **Cost:** medium.

### Group C. Mechanics that pay for something already worth doing

#### M12. Thumbs signal on a verdict, counted as a contribution
- **Pays for:** telling Shin the verdict was wrong when the person knows it is wrong but does not
  know the right number. `notes/olma/audit.md` row 64 calls this the highest value tap on OLMA's
  result screen, and the reason transfers: a person in an aisle can often tell a verdict is wrong in
  a second and cannot tell you the true price without walking the store.
- **Cheapest gaming:** tap thumbs down on everything. Trivially cheap, and only if the tap is
  attached to a reward.
- **Corruption:** of the price data, no, because a thumb is not a number and never enters a
  comparison set. Of calibration, yes, if it is rewarded, which is the whole reason it ships
  unrewarded.
- **Missing data:** none. It is a boolean against a verdict object the app already produced.
- **Cost:** small.

#### M13. "Your Shin" as an identity and a share hook
- **Pays for:** showing another person which Shin you have, which is a growth act and not a data act.
- **Cheapest gaming:** nothing to game. There is no scarce thing to win.
- **Corruption:** none. The attitude changes the words and never the number
  (`docs/decisions.md`, "Shin's attitude is the user's choice, not ours").
- **Missing data:** none. The picker exists, the three personalities exist, and `share.js` renders
  the card with no download link in it, which is a recorded decision that stays exactly as it is.
- **Cost:** small, and most of it is already built.

#### M14. A watched item as a stake the person placed themselves
- **Pays for:** saving a thing you are thinking about, which is the decided primary act after the
  verdict (`docs/decisions.md`, "The button after the verdict is save, not buy") and the only entry
  to the return loop. Keepa's extension has 4 million users and camelcamelcamel 800,000, all of them
  watching things they have not bought (`pages/shin-walkthrough.html`, stage 07).
- **Cheapest gaming:** save everything. Costs the person nothing and gains them nothing.
- **Corruption:** none of the price data. It does have a cost shape worth naming: re-pricing scales
  with watched items rather than users, which is the recorded reversal condition on the save
  decision.
- **Missing data:** nothing for the save itself. Everything for the payoff, since the alert needs the
  per-item re-query source that does not exist.
- **Cost:** small. Built.

#### M16. A weekly line that reads the person's own record back to them
- **Pays for:** nothing. It is not a reward, it is the avatar having something honest to say, which
  `docs/design/USAGE.md` section 5 ranks fourth among return triggers and marks partly honest in v1.
- **Cheapest gaming:** none available. There is no reward and no ranking.
- **Corruption:** none, as long as every sentence is drawn from what the person scanned, saved and
  corrected, which `store.js` already holds, and no sentence claims a price moved.
- **Missing data:** none for the record-only form. A feed for anything that says what a price did
  since.
- **Cost:** small.

#### M18. The "Shin was right" callback on an item the person walked away from
- **Pays for:** trusting a walk-away verdict, which is the behaviour the product exists to produce
  and the only one that is free to reward.
- **Cheapest gaming:** none available, for the same reason as M16.
- **Corruption:** **yes, in the form the walkthrough proposes.** `pages/shin-walkthrough.html`,
  stage 11, lists "Shin was right, a skipped item stayed overpriced" as "free, no data needed". That
  is wrong. Knowing an item *stayed* overpriced requires re-checking it, and asserting it without a
  re-check is a fabricated price claim in a sentence rather than in a number, which hard rule 3
  covers at the level of the act. The honest form asserts nothing about now: it restates what Shin
  already said, on a date, about a seller.
- **Missing data:** for the honest form, none. For the walkthrough's form, the per-item re-query
  source.
- **Cost:** small in the honest form, gated on the feed in the other.

### Group D. Mechanics that need the trusted reported-price layer to exist first

#### M9. Referral scans
- **Pays for:** bringing another person to the app, priced in the currency of scans.
- **Cheapest gaming:** self-referral from a second device, then a third.
- **Corruption:** of the price data, no. Of the growth numbers, yes, and the currency is worthless
  anyway while scans are unlimited, which is the v1 decision.
- **Missing data:** accounts, device identity, and a meter for the reward to be denominated in.
- **Cost:** medium, and it is dead weight until the meter is on.

#### M10. Confirmed-price reputation
- **Pays for:** reporting a price that turns out to be right, which is the only price behaviour that
  is safe to pay for, because the payment is triggered by somebody else's independent agreement
  rather than by the report.
- **Cheapest gaming:** collude. Two accounts, one price, one confirmation. This is the reason
  independence has to be defined in the mechanism rather than assumed, and it is why the pair must
  not be a referred pair, a shared device, or the same session.
- **Corruption:** low by construction and non-zero under collusion. It is the only mechanic in this
  document where the reward arrives after a check rather than before one.
- **Missing data:** everything listed in section 5. This mechanic is the gate, not a feature behind
  it.
- **Cost:** large.

#### M15. Co-watch, two people watching the same item
- **Pays for:** adding an item to a watchlist and telling somebody about it. The Duolingo Friend
  Streak mapping with the trigger changed: the notification fires when the price moves, not when a
  person is idle (`notes/duolingo-owl.md` section 4, row 13), so nobody is letting anybody down and
  hard rule 4 is satisfied.
- **Cheapest gaming:** two accounts watching one item, which wins nothing.
- **Corruption:** none.
- **Missing data:** accounts, a social graph, and the feed that makes the price move observable.
- **Cost:** large.

#### M17. Home screen widget carrying a watched price and the face
- **Pays for:** nothing directly. It is the strongest take in the owl analysis because it reaches the
  person without asking for their schedule, and Shin's central problem is that its value arrives at a
  moment it cannot predict (`notes/duolingo-owl.md` section 4, row 18).
- **Cheapest gaming:** none available.
- **Corruption:** yes if the widget shows a number as current when it is stale, which is a fabricated
  price with a nice layout. The honest form shows the number with the date it was checked, and the
  face tracks the price and never the person's inactivity.
- **Missing data:** a price that changes, which is the feed.
- **Cost:** medium.

#### M8. Saved-money tally
- **Pays for:** nothing behavioural. It is a scoreboard the person reads, and its real job is to make
  the product's value legible.
- **Cheapest gaming:** scan expensive things, or type a high asking price, to inflate the number. A
  typed asking price is user-supplied, so the tally is trivially inflatable by the person it flatters.
- **Corruption:** of the price data, only through the typed asking price. Of the product, more
  seriously: hard rule 2 and Competition Act s.74.01(1)(b) require adequate and proper testing before
  a performance claim is published (`CLAUDE.md`; `pages/shin-walkthrough.html`, legal note), and a
  tally is a performance claim the moment it leaves the device on a share card.
- **Missing data:** a comparable set on most scans. Today the engine answers 2 of 7, so the tally
  would be computed from the minority of scans and read as though it covered all of them.
- **Cost:** small to compute, medium once the labelling, the exclusion from exports and the audit of
  which scans count are built. Section 4 decides its form.

---

## 3. What would be paid for with real money, and the law that has to be checked

**The real-money mechanics in this document are three:** draws and sweepstakes (M5), cash bounties
for reported prices (M6), and any prize attached to a leaderboard or a store-level ranking (M3, M4).
A fourth, referral scans (M9), spends inventory rather than cash but has the same identity problem.
Everything else on the list costs engineering time and per-scan spend and nothing more.

**Cost shape, so the choice is not made on the code.** For a draw, the code is medium and the prize,
the disclosure, the record keeping, the eligibility screening and the legal review are the cost. For
bounties, the payout is per report and scales with exactly the behaviour that is cheapest to fake, so
the spend curve and the fraud curve are the same curve.

**On Canadian law: to be checked by him. Nothing in this repo sources any of it.** The one legal
statement this repo does source is the performance-claim rule, Competition Act s.74.01(1)(b), which
is quoted in `CLAUDE.md` hard rule 2 and in `pages/shin-walkthrough.html`'s legal note. There is no
source anywhere in this repo on contest law. The following are the questions to put to counsel
before a draw is announced, listed as questions and not as statements of law:

1. Whether a prize draw run from Canada is treated as a lottery scheme, and if so what makes it
   lawful in practice, including whether a no-purchase entry route and a skill-testing element are
   required.
2. Whether promotional contest disclosure obligations apply, and what they require to be published:
   the number and approximate value of prizes, the odds, any regional allocation, and the deadline.
3. Whether Quebec imposes separate obligations from the rest of Canada, including registration, a
   fee, French-language materials and a filing before the contest opens.
4. Whether the App Store and Play Store impose their own promotion rules on a contest run inside an
   app, including who is named as sponsor and who is not.
5. Whether paying a person for a shelf price makes them something other than a user for tax or
   employment purposes at any volume.
6. Whether storing store-level geolocated contributions from named contributors changes the PIPEDA
   position already flagged in `pages/shin-walkthrough.html`'s legal note.

**Every line above is to be checked by him. None of it is a finding of this file.** The decision in
section 6 does not depend on how those questions resolve, because the draw is killed on the data
argument first, which is a reason that stands whatever the legal answer is.

---

## 4. The saved-money tally, decided

**The decision: no savings tally in v1, and the only form that may ever ship is a spread, labelled as
a spread.**

**Why not the obvious version.** "Shin saved you $412" is a performance claim about money that never
moved. The person is a window shopper who did not buy the thing, so nothing was saved in any sense a
regulator, a journalist or a user would accept. `CLAUDE.md` hard rule 2 exists because the "$1,000 a
year" figure was never measured and mirrored a published forecast, and the same file records that
OLMA's paywall sells "Pays for Itself, With one good find", which `notes/olma/audit.md` row 24
rejects for exactly this reason. Shipping a tally would be adopting the claim the repo already
rejected on someone else's screen.

**The only honest form, specified so it is buildable when its preconditions arrive.**

| Question | Answer |
| --- | --- |
| **What it computes** | For one scan: the asking price minus the lowest comparable price in the set Shin actually held at the time of the verdict. Nothing else. |
| **What it is called** | The gap between the tag and the lowest price Shin found. Never "saved", never "savings", never a monthly or annual figure, and never a projection. |
| **Which scans count** | Only scans where a comparable set existed and the confidence treatment was certain or fairly sure. A refusal contributes nothing. A stand-in asking price contributes nothing, because `NOW.md` already requires a stated stand-in to be labelled as one and a labelled guess cannot be summed into a total. |
| **What it must show beside itself** | The count of scans it covers and the count it does not, so a number computed from the minority of scans cannot read as though it covered all of them. In the pilot's state that reads as two of seven, which is itself the argument for not shipping it yet. |
| **Where it may never appear** | Any export. Not the share card, not a store listing, not a video, not the paywall. On the device it is a private observation about scans the person made. Off the device it is a published performance claim and hard rule 2 applies in full. |
| **What it may never do** | Multiply by a period, compare across users, rank anybody, or unlock anything. The moment it unlocks something it becomes an incentive to type a high asking price, which is M8's gaming line. |

**When it ships:** when a comparable set exists on the majority of scans in the lead category. Until
then it shows nothing, because a tally over two scans in seven is a number whose main effect is to be
screenshotted out of context.

---

## 5. The scan meter, and what confirmation actually requires

**Input, taken as decided, not reopened.** `docs/design/USAGE.md` section 6: Shin does not meter
scans in v1, scans are unlimited and free, the switch is built dark with a stated daily allowance
and a specified zero state, nothing earns a scan back until a contributed price is confirmed by a
second independent observation, and a refusal never spends one.

**Are earned scans the first mechanic when the meter turns on? Yes, and they cannot be the first
thing built.** Two separate statements, and the order matters:

- **First in the product.** When the meter is on, earning is the only reward Shin can offer that the
  person actually wants at the moment they want it, because the meter creates the scarcity and the
  aisle is where it bites. Nothing else on this list has that property. A badge does not get you a
  verdict.
- **Second in the build.** Earning is downstream of confirmation. Building the grant before the check
  is building M1's exploit and calling it a feature: a person types numbers from a couch and receives
  the product's scarce resource for it. So the build order is confirmation, then earning, then the
  meter switch flipping on. Turning the meter on before confirmation exists ships a meter with no
  earning path at all, which is a pure tax on the window shopper and the reason section 6 rejected it.

**What "confirmed by a second independent observation" needs to exist first.** Six things, none of
which Shin has today. This is the definition of the trusted reported-price layer that the rest of
this file defers to.

1. **A contribution object that is not a person's word.** An item identity, a seller identity, a
   price, a timestamp, and the app state it was captured in. Today a corrected price is a number the
   person typed into `store.js` and nothing else.
2. **Seller identity resolvable in an aisle.** A chain plus a location, stable enough that two people
   in the same store produce the same seller id. Shin has no store-level data at all, which is the
   same gap that puts nearby-cheaper out of v1 (`docs/design/USAGE.md` section 11).
3. **A freshness window per category.** Grocery promotions run on a weekly cycle and tech does not,
   so two observations far apart are not a confirmation of each other, they are two facts about two
   different weeks. The window is a per-category number and it has to be written down before the
   first grant.
4. **Independence, defined mechanically.** Not the same device, not the same account, not the same
   session, and not a referred pair, since a referral link is the cheapest way to manufacture a
   second observer. This needs accounts, which the v1 floor puts out
   (`pages/shin-walkthrough.html`, stage 12), so accounts are a precondition of earning and not a
   separate roadmap item.
5. **A disagreement rule.** What happens when the second observation contradicts the first: neither
   is published, both are held, and an unconfirmed price is never mixed into a comparison set. The
   default already drafted in `docs/design/USAGE.md` section 10 question 5 is the right one and it
   generalises: a price the person typed is shown back to them, labelled as theirs, dated, and never
   used to judge somebody else.
6. **Density.** Enough users in one store for a second observation to arrive at all. Below that
   density the earning path exists on the screen and never fires, which is worse than not offering
   it, because the app promised a way out of a limit it imposed.

**One consequence worth stating.** Points 4 and 6 mean the earning path cannot be advertised on the
meter's zero state until it demonstrably fires. Until then the zero state's only honest ask is the
subscription, which is what section 6 already specifies.

---

## 6. The decisions

Eighteen mechanics. Five in v1, seven waiting on the trusted reported-price layer or the feed, six
killed with a reversal condition on each.

### In v1, five

| # | Mechanic | The reason it applies to a person holding a phone up in a store aisle |
| --- | --- | --- |
| M12 | Thumbs on a verdict, **rewarded with nothing** | They can tell in one second that the verdict is wrong and cannot tell you the true price without walking the store. One tap is the only signal that person can give, and calibration is priority 1. It ships unrewarded precisely so the signal stays worth reading. |
| M13 | "Your Shin" as identity and share hook | Which Shin someone has is the thing worth screenshotting, and the channel is short-form video. It is already built, it costs nothing per use, and it cannot touch a number. |
| M14 | The watched item as a stake they placed | The one act after a verdict that a window shopper actually wants, and the only entry to the return loop. Saving a thing you are standing in front of and will not buy is the whole week-two behaviour. |
| M16 | The weekly line drawn from their own record | It is the only thing the avatar can honestly say between store visits, and it says it in the app rather than in a push, so it never demands a trip the person cannot take. |
| M18 | "Shin was right", **record-only form** | It rewards trusting a walk-away verdict, which is the behaviour the product exists to produce, and it restates what Shin already said on a date rather than claiming anything about the price now. |

**Nothing in this v1 list rewards a price report, and nothing in it is denominated in a scarce
resource.** The four that are rewards at all pay in acknowledgement, which cannot be counterfeited
into a price.

### Waiting, seven

| # | Mechanic | Waiting on |
| --- | --- | --- |
| M10 | Confirmed-price reputation | Itself. This is the gate: the six preconditions in section 5. It is the first thing built when the crowd layer starts. |
| M1 | Earned scans | M10, then the meter switch. First mechanic in the product when the meter turns on, second in the build order. |
| M4 | Store-level best price found this week | M10 plus store identity plus per-store density. Ranks **confirmations**, never reports, when it comes. |
| M9 | Referral scans | The meter being on, since the reward is denominated in scans, plus accounts for identity. |
| M15 | Co-watch | Accounts and the per-item re-query feed. The trigger is a price that moved, never a person who is idle. |
| M17 | Widget | The feed. Ships with the check date beside the number, and the face tracks the price and never the person's inactivity. |
| M8 | Saved-money tally, spread form only | A comparable set on the majority of scans. Form fully specified in section 4 so this is a release rather than a redesign. |

### Killed, six, each with the condition that reverses it

| # | Mechanic | Killed because | Reverses if |
| --- | --- | --- | --- |
| M2 | Scan streak | Pays a window shopper for entering stores on the app's schedule and pays everybody for re-scanning one barcode, which spends per-scan money and corrupts the distinct-products ratio that decides the unit economics. | Browse sessions with no store visit turn out to be daily, measured as sessions per week per user, **and** a confirmation layer can tell a real aisle scan from a repeat. Both, not either. |
| M3 | Global leaderboard | The volume form pays for noise and the "good prices" form pays for invention. It is the mechanic with Duolingo's largest published retention effect and the one that most directly breaches hard rule 3, and priority 1 decides between those. | M10 exists, at which point what gets ranked is confirmations rather than reports, and the surface returns as M4 rather than as this. |
| M5 | Draws and sweepstakes | Whatever the entry is priced against is what gets manufactured, and with no accounts there is no one-entry-per-person to enforce. The legal questions in section 3 are unanswered, and the data argument kills it before they are asked. | M10 exists so entries can be earned by confirmed contributions, **and** the section 3 questions come back clear from counsel, **and** there is money for a prize. |
| M6 | Cash bounties for reported prices | Money per unchecked number is a purchase order for fiction, and the payout curve and the fraud curve are the same curve. | M10 exists **and** tag photography returns a readable price, which needs a vision model the v1 floor cuts, **and** a category exists with no purchasable feed where the spend is cheaper than the data. |
| M7 | Badges and levels for scan count | Pays for volume of an act that costs money per use and produces nothing checkable. A cupboard is a level. | Badges return attached to confirmations rather than to counts, which makes them a skin on M10 rather than a mechanic of their own. |
| M11 | Collection completion | Asks a window shopper to shop for the app, and the categories are partial by design with produce out of v1. | The lead category's catalogue is complete enough that a set is a real thing to a person, which is the same volume condition that reverses the dupes decision. |

---

## 7. Decisions

The seven entries drafted here were moved to `docs/decisions.md` on 2026-09-04, in that file's
format. The confirmed-price and earned-scans entry was merged there with the meter entry
`docs/design/USAGE.md` drafted about the same switch, so six entries from this file plus one
merged entry stand in `docs/decisions.md`, which cites both files. That file is the record;
nothing in this section is a second copy of it.

---

## 8. Check

The brief's Phase 5 check, answered line by line.

- **Mechanics enumerated: 18.** M1 earned scans · M2 scan streak · M3 global leaderboard · M4
  store-level best price this week · M5 draws and sweepstakes · M6 cash bounties · M7 badges and
  levels · M8 saved-money tally · M9 referral scans · M10 confirmed-price reputation · M11 collection
  completion · M12 thumbs signal · M13 "your Shin" identity and share hook · M14 watched item as a
  placed stake · M15 co-watch · M16 weekly line from the person's own record · M17 widget · M18
  "Shin was right" callback.
- **Every mechanic has all five lines.** Each of the eighteen entries in section 2 carries *Pays
  for*, *Cheapest gaming*, *Corruption*, *Missing data* and *Cost*, in that order, with no entry
  missing a line and no line merged into another.
- **Counts: 5 in v1, 7 waiting, 6 killed. 5 + 7 + 6 = 18.**
- **At least one mechanic is killed with a reversal condition.** Six are, and every one of the six
  carries a reversal condition that names an outside change rather than a change of opinion: M2, M3,
  M5, M6, M7, M11.
- **Nothing in v1 rewards an unverified price report.** The five v1 mechanics are a thumb that earns
  nothing, an identity the person picked, a save they made, a weekly restatement of their own record,
  and a callback to a verdict Shin already gave. None is denominated in scans, cash, entries, rank or
  badges, and none takes a price a person typed and turns it into a reward or into somebody else's
  comparison set.
- **Real money enumerated and the law labelled.** Section 3 names the four money-spending mechanics
  and lists six legal questions, every one of them marked to be checked by him, with a note that the
  only legally sourced statement in the repo is the performance-claim rule in hard rule 2.
- **Both earlier findings reconciled rather than picked between.** Section 1 holds the retention
  multiples belonging to streak, leaderboard and notification work alongside the finding that the
  daily-occasion levers have no equivalent here, and derives from the pair that Shin has no borrowed
  prior for gamification's value at all.
