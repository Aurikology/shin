# The Duolingo owl, reverse engineered

Phase 2 of `docs/design/brief-usage-and-avatar.md`. Written 2026-09-03.

**The ask, in one line:** work out what Duo actually does across Duolingo's product as a retention
mechanism, with a source per claim, then say which of it applies to a person standing in a store
aisle holding a phone up at one price, and which of it does not.

**What this file is not.** It is not a plan to build a Duolingo clone. His rule on approving the
brief: *"we are not trying to copy duolingo or any other app, we are taking inspiration that
applies to us."* Every row in the mapping table below either carries a reason that names Shin's
user, or it is a "no equivalent" row. "Duolingo does it" was not accepted as a reason anywhere in
this document.

**Reading order:** section 1 is the surface table, section 2 is the interruption budget, section 3
is the retention claims with labels, section 4 is the mapping, section 5 is the argument, section 6
is what was searched and not found, section 7 is the count line.

---

## 1. The surfaces

Twenty four surfaces. A row marked **not confirmed** has no acceptable source behind it and is
listed anyway so that a later pass knows the question was asked rather than skipped.

Source classes used: Duolingo's own blog and design site, Duolingo investor filings and the
earnings call transcript, press carrying a quoted Duolingo executive, independent teardowns, and
documented screenshot catalogues. Fan wikis and SEO content sites were not accepted as the only
source for a row.

| # | Surface | Trigger | What the owl does | What it says (verbatim where sourced) | What it wants next | How often | Off or dismissible | Source |
|---|---|---|---|---|---|---|---|---|
| 1 | App icon, campaign driven | Duolingo marketing runs a campaign; icon swapped globally | Icon becomes a sick, dead or otherwise damaged Duo | Duolingo's stated reason for the August 2025 sick icon: Duo was "quite literally sick of reminding everyone to do their lessons" | Open the app, post about it | Global, a handful of times a year | Users can change the icon back from in-app icon settings | https://www.outlookindia.com/international/us/duolingos-new-sick-app-icon-why-users-are-concerned-and-how-to-change-it-explained · https://duoplanet.com/how-to-change-duolingo-app-icon/ |
| 2 | App icon, changes with the individual user's streak state | Claimed: user misses a day | Claimed: icon degrades in proportion to the lapse | Not sourced | Not sourced | Not sourced | Not sourced | **Not confirmed.** Only SEO content sites assert this. No Duolingo post, filing, or press piece with a quoted employee found. |
| 3 | Onboarding | First open, before signup | Duo hosts the flow, greets by first name, reacts to each answer | Not captured verbatim | Answer the next question, reach the paywall having already invested | Once, across a flow independently counted at 38 screens | Skippable as a flow, the character is not separable from it | https://tasu.ai/library/duolingo · https://goodux.appcues.com/blog/duolingo-user-onboarding |
| 4 | Home screen learning path | Open the app | Claimed presence of Duo on the path | Not sourced | Not sourced | Not sourced | Not sourced | **Not confirmed.** The path redesign is documented at https://blog.duolingo.com/new-duolingo-home-screen-design and the character animation rollout is documented as coinciding with it, but no source found puts Duo on the path screen itself. |
| 5 | Lesson start | Tap a lesson | Claimed pre lesson owl appearance | Not sourced | Not sourced | Not sourced | Not sourced | **Not confirmed.** Nothing found describing a Duo appearance between the tap and the first exercise. |
| 6 | Mid lesson, correct answer | User answers correctly | The World Character on screen plays a per character reaction animation, real time, driven by a Rive state machine | Not applicable, animation not copy | Answer the next one | Every correct answer in every exercise that carries a character | Not dismissible; it is inside the exercise | https://blog.duolingo.com/building-character/ · https://blog.duolingo.com/world-character-visemes/ |
| 7 | Mid lesson, wrong answer | User answers incorrectly | Character moves to a final state showing the reaction to the response. Duolingo: "based on the outcome of the challenge, if you get it right or wrong, we can move to a final state, showing the reaction to your response!" | Not captured verbatim | Try again, spend a heart | Every wrong answer | Not dismissible | https://blog.duolingo.com/world-character-visemes/ |
| 8 | Mid lesson reward interstitial | A run of consecutive correct answers | A full width mid lesson animation plays as a reward sequence | Not applicable | Keep the run going | Per run, inside a lesson | Not dismissible | https://blog.duolingo.com/building-character/ |
| 9 | Lesson complete, perfect lesson | Lesson finished with zero mistakes | Duo's head expands, turns red and explodes into a mushroom cloud, then Duo reappears with an exposed brain; three stat cards slide up with counting numbers | Not applicable | Take the next lesson, see the streak tick | Per perfect lesson | Not dismissible | https://60fps.design/shots/duolingo-lesson-complete-head-explode-animation |
| 10 | Streak screen | Lesson completed, streak increments | Full screen flame and counter tick up, day by day calendar with checkmarks. **Duo does not appear on this screen.** | Not applicable | Come back tomorrow | Daily, after the first lesson of the day | Not dismissible | https://duolingo.deconstructoroffun.com/mechanics/streaks · https://blog.duolingo.com/how-duolingo-streak-builds-habit |
| 11 | Streak freeze | User misses a day and holds a freeze | Freeze deploys automatically, silently, with no confirmation dialog; a blue freeze marker appears on the calendar. No owl | Not applicable | Come back and resume | Up to the freeze cap, 2 for free users | Not dismissible; freezes are earned or bought | https://blog.duolingo.com/how-duolingo-streak-builds-habit · https://duolingo.deconstructoroffun.com/mechanics/streaks |
| 12 | Streak revival and Earn Back | User has already lost a streak | Offer to restore the lost streak by completing a small number of lessons in a window | Not captured verbatim | Complete three lessons | Campaign driven plus an always on Earn Back window | Ignorable | Luis von Ahn, Duolingo CEO, Q2 2026 earnings call: "More than 15 million learners revived their streaks." https://www.theglobeandmail.com/investing/markets/stocks/DUOL/pressreleases/3817356/duolingo-duol-q2-2026-earnings-call-transcript/ |
| 13 | Friend Streak nudge | A friend on a shared streak has not done their lesson | Duo and other characters send a nudge to the friend | "A real friend honors their friend streak" | Do the lesson so the other person does not lose it | Per shared streak, up to five friends | The nudge is a user initiated action, the shared streak is opt in | https://blog.duolingo.com/friend-streak/ |
| 14 | Push notification, routine practice reminder | Behaviour and a learned habit window | A bandit algorithm picks one reminder from a pre written pool per learner per day | "Time for [language]", which Duolingo says "works very well for Chinese learners, but it's usually not the best option for English learners" | Complete a lesson today | Daily, around the learner's habit window. A per day cap of two pushes is asserted by one teardown with **no source**, so treat the cap as unconfirmed | Per category toggles in Settings, plus the OS level toggle | https://blog.duolingo.com/hi-its-duo-the-ai-behind-the-meme/ · cap claim, unsourced: https://duolingo.deconstructoroffun.com/mechanics/notifications |
| 15 | Push notification, streak loss save | A live streak is about to expire | A save class push fires in the last window before midnight | "Your 36 day streak ends in 10 minutes. One lesson saves it." · "You're SO close to a 75 day streak" | One lesson, right now | Only when something is about to be lost | Same toggles as row 14 | https://duolingo.deconstructoroffun.com/mechanics/notifications |
| 16 | Push notification, escalation to guilt | Sustained inactivity | Copy escalates from encouragement to reproach | Reported ladder: "Your health is full again!" then "You're falling behind!" then "It looks like you've learned how to say 'quitter' in Portuguese." | Reopen the app | Escalates with inactivity | Same toggles as row 14 | https://sherwood.news/tech/duolingo-q2-earnings-monthly-active-users-milestone/ |
| 17 | The give up message | The escalation ladder has failed for long enough | Duolingo announces it is stopping | "These reminders don't seem to be working. We're going to stop sending them for now." | Nothing. It is a withdrawal, and it is the most screenshotted message Duolingo sends | Once, at the end of the ladder | It turns itself off, which is the point | https://reallygoodemails.com/emails/these-reminders-dont-seem-to-be-working · https://sherwood.news/tech/duolingo-q2-earnings-monthly-active-users-milestone/ |
| 18 | Home screen and lock screen widget | Time passing on the user's home screen | Shows whether a lesson was done today and the current streak length, illustrated with one of 25 Duo moods. Duolingo: "You'll see he gets more and more desperate as it nears midnight!" Once the lesson is done Duo "looks relaxed and happy." Moods shipped include muscled and buff, the Mona Lisa, sweaty and scared, angry and threatening, and a skeleton | Not copy, the illustration is the message | Open the app before midnight | Continuously, passively, every time the user looks at their own home screen | Remove the widget. Nothing in the app is needed | https://blog.duolingo.com/widget-feature |
| 19 | Empty state | A feed or section has nothing in it | Duo is drawn asleep | "Check back again later. Try a lesson while you wait!" | Go and do the core act instead | Whenever the section is empty | Not dismissible, it is the screen | https://useronboarding.academy/user-onboarding-inspirations/duolingo-empty-state |
| 20 | Paywall, Super Duolingo | Entering the upsell from a locked feature or from onboarding | Duo present on brand, gradients, cheerful tone; the first feature bullet changes to match where the user entered from | Not captured verbatim | Start a trial | Every paywall entry | Dismissible | https://uxdesign.cc/how-duolingo-drives-subscription-conversion-89c7415e8fef · https://adapty.io/paywall-library/duolingo/ |
| 21 | Leagues and the league results screen | Weekly leaderboard of 30 users closes | Full screen animated results reveal with standings, trophies, gems and tier changes. **No mascot on the results screen** per the teardown | Not captured verbatim | Earn XP to promote, or pay 2000 gems to repair a demotion | Weekly, plus a results screen in the post lesson sequence on Monday | The leaderboard can be opted out of in settings per the teardown | https://duolingo.deconstructoroffun.com/mechanics/leagues · https://duoplanet.com/duolingo-leagues-the-essential-guide-everything-you-need-to-know/ |
| 22 | Marketing and social, the Death of Duo | A scripted marketing event, February 2025 | Duo is killed off across social and in app, then resurrected by aggregate user lessons | Luis von Ahn, Duolingo CEO: "As I'm sure you've seen by now, Duo was hit by a Cybertruck. And it looks like, in fact, every single character at Duolingo is dead." | Complete lessons to "save Duo" | Once, as a campaign | Not an in app interruption | https://techcrunch.com/2025/02/18/duolingo-killed-its-mascot-with-a-cybertruck-and-its-going-weirdly-well · https://www.prdaily.com/duolingo-shares-pr-secrets-of-viral-death-of-duo-campaign/ |
| 23 | Merchandise packaging | User buys merchandise | A printed note from Duo carrying a threat, with a custom Duo signature | Not captured verbatim | Nothing transactional; it feeds the meme | Per shipment | Not applicable | https://www.newsweek.com/threatening-note-duolingo-owl-internet-stitches-1849686 |
| 24 | push.duolingo.com, Duolingo's own joke about its own nagging | Visiting a Duolingo operated marketing site, copyright 2019 | Offers three named Duo reminder personas as a fictional in person service | Encouraging Duo: "You're on a 4-day streak! Don't lose it! You've come so far! Keep it up!!!" · Disappointed Duo: "You've let Duo down. Who will be next? Your boss? Your best friend? Your Grandma Betty?!" · Passive-Aggressive Duo: "Go on, keep scrolling social media. Let's see how much French that can teach you." | Laugh, share, and forgive the real notifications | Once | Not applicable | https://www.push.duolingo.com/ |

### The meme, and what in the product produced it

The "evil Duo" and "Duo is sad" memes are user generated and predate Duolingo's adoption of them.
Know Your Meme dates an early instance to a Tumblr post of 24 October 2017 showing a photoshopped
Duo holding a gun (https://knowyourmeme.com/memes/evil-duolingo-owl). The product behaviour that
produced it is the notification ladder in rows 14 to 17: a character that keeps asking, in copy
written to be emotionally pointed, with an escalation that arrives after the user has stopped.
Duolingo did not resist the reading. Their own engineering post about the notification system is
titled "How the Duolingo Owl Decides What Notification To Send" and is subtitled as being about
"the AI behind the meme" (https://blog.duolingo.com/hi-its-duo-the-ai-behind-the-meme/). Duolingo's
own design writing describes Duo as "their #1 fan and biggest cheerleader" and "rather emotional.
In a word, Duo is extra" (design.duolingo.com/writing/duo, retrieved via search index; that URL now
returns a 301 to https://blog.duolingo.com/hub/design/, so treat the wording as company stated but
no longer live at the cited path).

---

## 2. The interruption budget, and what stops the owl being uninstalled

Duo interrupts more than almost any consumer app and survives it. Five things, each sourced, appear
to be doing the work, and one of them is the opposite of what a nagging mechanic is expected to do.

**It backs off, and it says so.** The end of the escalation ladder is not more volume, it is
withdrawal: "These reminders don't seem to be working. We're going to stop sending them for now."
(https://reallygoodemails.com/emails/these-reminders-dont-seem-to-be-working). Growth.Design lists
notification auto filtering as one of the eight retention tactics it identifies, describing the app
as reducing notifications when users go inactive
(https://growth.design/case-studies/duolingo-user-retention). An app that can be trusted to stop is
an app that does not need to be uninstalled to be stopped, and the uninstall is the only lever a
user has against an app that cannot.

**The volume is capped and the selection is optimised rather than the frequency increased.**
Duolingo's engineering post describes a bandit algorithm whose payout is getting a learner to
complete a lesson, chosen per learner per day from a pre written pool, evaluated over roughly 200
million practice reminders across 34 days
(https://blog.duolingo.com/hi-its-duo-the-ai-behind-the-meme/). The published work optimises which
message, not how many. A per day cap of two pushes is asserted by one teardown
(https://duolingo.deconstructoroffun.com/mechanics/notifications) but that page cites no source for
it, so the cap is recorded here as unconfirmed.

**The nagging is opt out at the category level, not all or nothing.** Practice reminders can be
turned off in Settings while friend and security notifications stay on, and the reminder time is
user set (https://streakchaser.com/language/duolingo-notifications-how-to-turn-off-on-iphone-android/).
The widget, which is the most continuously present surface of all, is removed by removing the
widget, with nothing required inside the app (https://blog.duolingo.com/widget-feature).

**The guilt is delivered as a joke, and by something built to be protected.** Duolingo operates a
marketing site whose entire premise is mocking its own reminders, with three named personas
including "Passive-Aggressive Duo" (https://www.push.duolingo.com/). Growth.Design attributes part
of the mascot's effect to the baby schema, large eyes and rounded childlike proportions that trigger
a protective response (https://growth.design/case-studies/duolingo-user-retention). A reproach from
something you are supposed to look after reads as a bit. The same words from a system utility read
as contempt.

**It escalates a debt to a character, not to the company.** Duolingo's design writing frames Duo as
the learner's biggest cheerleader, and Ryan Sims, Duolingo's VP of Design, has said "we're not an
education company. We're a fun and motivation company" and "Fun is the most important part of the
work we do" (https://developer.apple.com/news/?id=jhkvppla). The debt is owed to someone who is on
your side, which is a different object than a streak counter and a different object again than a
subscription.

**The honest limit on all of this.** No source was found that measures the uninstall or churn cost
of Duolingo's notifications, from Duolingo or anyone else. Everything above is a description of the
mechanism, not a measurement of the mechanism's net effect. What is searched and not found is in
section 6.

---

## 3. The retention claims, labelled

Every figure below carries the URL it came from. Nothing here is a figure this document produced.

### Company stated

| Claim | Exact wording or figure | Source |
|---|---|---|
| Long streaks at scale | "Over 10 million of our users now maintain streaks of one year or longer, and one-third of our DAUs have a Friend Streak." | Q4 / FY2024 shareholder letter https://www.sec.gov/Archives/edgar/data/1562088/000156208825000039/q4fy24duolingo12-31x24shar.htm |
| DAU, Q4 2024 | "Daily active users (DAUs) were 40.5 million, an increase of 51% from the prior year quarter" | Same filing as above |
| DAU growth and retention, Q2 2026 | Luis von Ahn: "DAUs grew 23% year-over-year, accelerating from Q1." and "User retention, our CURR, is an all-time high and increased by about a percentage point." | Q2 2026 earnings call transcript https://www.theglobeandmail.com/investing/markets/stocks/DUOL/pressreleases/3817356/duolingo-duol-q2-2026-earnings-call-transcript/ |
| Streak revival | Luis von Ahn: "More than 15 million learners revived their streaks." | Same transcript |
| Streak and course completion | "over 6 million people on a streak of 7 days or more"; learners reaching a 7 day streak are "3.6 times more likely to complete their course" | https://blog.duolingo.com/how-duolingo-streak-builds-habit |
| Streak animations | new streak animations increased "the likelihood a brand new learner was still using Duolingo 7 days later by +1.7%" | Same post |
| Streak freezes | doubling available freezes to two "increased the relative number of active learners on Duolingo every day by +0.38%" | Same post |
| Widget | "Half of the learners with the widget installed have a streak of at least 6 months" and "learners using the widget had far better retention on Duolingo" | https://blog.duolingo.com/widget-feature |
| Friend Streak | "Learners with at least one shared streak are 22% more likely to complete their daily lesson" and "nearly 8 million learners on Duolingo have a streak of 365 days or more" | https://blog.duolingo.com/friend-streak/ |
| Notifications | "~200 million practice reminders" analysed over 34 days; outcome stated only as "within a matter of weeks we could tell that more learners were completing lessons more frequently" | https://blog.duolingo.com/hi-its-duo-the-ai-behind-the-meme/ |
| Characters, why | The character system took "18 months"; the stated goal is "to make it easier for our learners to spend time within our product". No engagement or retention figure is attached | https://blog.duolingo.com/building-character/ |
| Animation system | Characters are animated in Rive, a state machine driven real time system, 10 World Characters, 20+ mouth shapes per character | https://blog.duolingo.com/world-character-visemes/ |
| Experiment volume | Luis von Ahn: "We test hundreds of product changes, measure their impact and double down on what works... every version of the app has approximately 350 changes." | Q2 2026 earnings call transcript, URL above |

Two of the strongest sounding figures above are correlational as published. The widget claim
compares learners who installed a widget against those who did not, and the Friend Streak claim
compares learners who have a shared streak against those who do not. Neither post describes a
control. They are real and they are Duolingo's own, and they are not causal estimates.

### Independently reported

| Claim | Exact wording or figure | Source |
|---|---|---|
| DAU multiple over four years | "led to an increase in our DAU of 4.5x". Attributed by the author to a portfolio of gamification, streak, leaderboard and notification work, not to the mascot | Lenny's Newsletter, written by Jorge Mazal, who states they joined as Head of Product in late 2017 and later served as CPO of Duolingo https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth |
| Leaderboards | "Overall learning time increased by 17%, and the number of highly engaged learners... tripled" | Same |
| Retention from leaderboards | leaderboards "increase CURR by 21%, which represents a reduction in the daily churn... by over 40%" | Same |
| Streak share of DAU | "the share of our DAU with a streak of 7 days or longer increased almost 3 times to more than half" | Same |
| Notifications plateau | notifications described as "a big vector for growth" whose impact "had plateaued" | Same |
| Death of Duo campaign | Android monthly active users up 25% year over year worldwide; Android downloads up 38% the day after launch; web searches up 58%; daily iOS downloads about 172,000, roughly 15% above the yearly average, the highest worldwide iOS download day of the year | https://techcrunch.com/2025/02/18/duolingo-killed-its-mascot-with-a-cybertruck-and-its-going-weirdly-well |
| MAU and daily share | 100 million monthly active users, with about a third using the app daily, up nearly 10 percentage points over five years | https://sherwood.news/tech/duolingo-q2-earnings-monthly-active-users-milestone/ |
| Investment wager | "Investment Wager increased Day-7 retention by +14%" | https://growth.design/case-studies/duolingo-user-retention |
| Resurrected users | resurrected users are "20% less likely than new users" to be retained | Same |

### Not found

- **Any number, from Duolingo or anyone else, that isolates the mascot's contribution to
  retention.** The character posts state a goal and an animation method and attach no metric
  (https://blog.duolingo.com/building-character/). The shareholder letters and the Q2 2026 earnings
  call do not mention the mascot at all in the sections searched. The Apple Developer piece quotes
  Duolingo's VP of Design and Head of Art on philosophy and craft, with no numbers
  (https://developer.apple.com/news/?id=jhkvppla).
- **"Leagues drive +25% lesson completion."** The page carrying that figure in its own title cites
  no source for it (https://duolingo.deconstructoroffun.com/mechanics/leagues). Recorded as not
  found rather than as a number.
- **A per day notification cap.** See section 2.
- **Any churn or uninstall cost attributed to notifications.**

### His claim

> "Duolingo increased their retention by many times through the use of the bird."

**Label: not found, as stated.** No source found supports a multiple in retention attributed to the
mascot. What the sources do support, and it is worth having straight before Phase 4 builds an avatar
on it:

1. The largest published multiple is **4.5x DAU over four years**, and the person who published it,
   Duolingo's former CPO, attributes it to a portfolio of streak, leaderboard, notification and
   onboarding work. The mascot is not mentioned in the sections extracted
   (https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth).
2. The largest published multiple that is about a per user outcome is **3.6x more likely to complete
   the course at a 7 day streak**, which is a streak claim, correlational, and not an owl claim
   (https://blog.duolingo.com/how-duolingo-streak-builds-habit).
3. The largest published retention effect with a mechanism named is **CURR +21%, daily churn down
   over 40%**, attributed to **leaderboards**, a surface a teardown says the mascot does not even
   appear on (https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth ·
   https://duolingo.deconstructoroffun.com/mechanics/leagues).
4. The only owl carrying surface with a published retention statement is the **widget**, and that
   statement is "far better retention" with no number and no control
   (https://blog.duolingo.com/widget-feature).
5. The published effects that are attributable to the character system specifically are **small and
   single digit percentages**: streak animations +1.7% on day 7 retention for new learners, doubled
   freezes +0.38% on daily actives (https://blog.duolingo.com/how-duolingo-streak-builds-habit).

**The honest reading.** The owl is real, the interruption machine around it is real, and the
retention numbers are real, but no published source connects the first to the third. What the
evidence supports is a weaker and more useful claim: Duolingo's retention comes from a stack of
mechanics that each moved a fraction of a percent to a few percent, compounded over hundreds of
shipped experiments per app version, and the mascot is the delivery vehicle that made those
mechanics tolerable rather than the mechanic itself. That distinction changes what Shin should
build. Building a mascot expecting a retention multiple is building on a figure nobody published.
Building a mascot as the thing that makes an honest refusal survivable is building on what the
evidence actually shows a character does.

---

## 4. The mapping

Shin's core act, held fixed for every row: a scan that happens when the user is standing in a store
aisle in front of one price, holding a phone up, where five of seven scans end in an honest refusal,
and where the primary user is a window shopper whose visit frequency is set by their life and not by
the app.

Every "mapped" row carries a reason that names that user. Rows where the only available reason was
"Duolingo does it" were written as "no equivalent".

| # | Duolingo surface | Shin | Reason it applies to a person in an aisle, or why it does not |
|---|---|---|---|
| 1 | App icon, campaign driven | **Mapped, bounded.** The avatar's icon changes for a campaign, never for the user's behaviour | The channel is short form video and a changed icon is a free content event that costs nothing per post. Bound: the icon may express something about prices, a season, or the brand, never about how long it has been since this person scanned |
| 2 | App icon degrading with the user's streak state | **No equivalent, because** a user who has not scanned in four days has not failed at anything. They have not been in a store. An icon that decays on their home screen is aggression aimed at the user, which hard rule 4 forbids outright | |
| 3 | Onboarding hosted by the character | **Mapped.** The avatar hosts setup and the attitude picker is the first real choice | The tone decision was already made his way: the user picks Shin's attitude from three. A face asking the question turns a settings screen into meeting someone, and it is the only place in the product where the user is not in a hurry |
| 4 | Home screen with the character present | **Mapped, payload changed.** An idle avatar on the viewfinder whose job is aim and readiness, not greeting | The home screen is a live camera and the user is holding the phone up. A greeting costs them the shot. What earns the pixels is telling them the tag is not in frame, which is the only thing the app knows that they do not |
| 5 | Lesson start | **No equivalent, because** Shin has no pre act screen. Law 1 of the design system makes scan, identify and verdict one surface. The moment between intention and result is the shutter press, and anything placed there delays the number, which is the product | |
| 6 | Correct answer reaction | **Mapped.** The verdict face | Already decided and already built: the face is the verdict, not a decoration. Duolingo's version is a reward for the user being right. Shin's is a report on whether the price is right, and the difference is the whole of hard rule 4 |
| 7 | Wrong answer reaction | **Mapped, inverted.** The negative faces exist, and they aim at the price, the store or the brand | This is the row hard rule 4 governs. Duolingo's sad character is a response to the user's error, so the emotion lands on the user. Shin has no user error to respond to. The negative face is a response to a seller's number, and it must have that number and that seller's name on the same screen so the target is visible. Intense forms require the certain or fairly sure confidence treatment, because loud anger on thin evidence is a wrong verdict delivered loudly, which priority 1 calls the worst outcome |
| 8 | Mid lesson reward interstitial | **No equivalent, because** there is no mid. One shutter press produces one verdict. A celebration inserted between the press and the answer is a delay dressed as a reward, and the user is standing in an aisle | |
| 9 | Lesson complete celebration | **Mapped, bounded.** The verdict sheet rising is the completion moment | A scan that resolves into a flat card feels like nothing happened, and the face landing is what makes the judgment feel delivered. Bounds already in the spec: no price counts up, ever, because a number moving through values it never had is a fabricated measurement. Additional bound from hard rule 2: the size of the celebration may not encode an unmeasured savings claim |
| 10 | Streak | **No equivalent, because** a scanning streak pays a window shopper for entering stores on the app's schedule and pays everyone for re scanning the same barcode. Duolingo's core act produces nothing but learning. Shin's core act produces price data, and hard rule 3 forbids that data being fabricated. A streak is the cheapest possible instruction to fabricate it. Reverses if a confirmation layer exists that can tell a real aisle scan from a repeat of one | |
| 11 | Streak freeze | **No equivalent**, follows from row 10 | |
| 12 | Streak revival | **No equivalent**, follows from row 10 | |
| 13 | Friend Streak nudge | **Mapped, trigger changed.** Two people watching the same item, and the notification fires when the price moves, not when a person is idle | It pays for adding an item to a watchlist, which is the one behaviour that produces data Shin needs and cannot be faked into a price. The trigger is an outside event Shin observed, not an obligation Shin invented, so it survives hard rule 4: nobody is letting anybody down |
| 14 | Routine practice reminder | **No equivalent, because Shin cannot remind you to go shopping.** Duolingo's push creates the occasion for its core act, since a lesson can be done anywhere. Shin's core act requires the user to be standing in front of a price, which the app cannot cause and cannot see. A daily push from Shin is a push into a moment where the app can do nothing for the person receiving it | |
| 15 | Streak loss save push | **No equivalent**, follows from rows 10 and 14 | |
| 16 | Escalating guilt push | **No equivalent**, and separately forbidden. Every rung of Duolingo's ladder aims at the user. Hard rule 4 deletes the rung rather than softening it | |
| 17 | The give up message | **Mapped, and it is the most transferable thing in this document.** After a set number of unopened alerts, Shin stops and says once that it has stopped | Shin's only legitimate notification is a price alert. An ignored price alert is evidence the alert was wrong or unwanted, which is information to act on, not a reason to send more. It also matches priority 1: an app that reports the limits of its own usefulness is the same app that says "I cannot price this" |
| 18 | Home screen widget | **Mapped, and it is the strongest take.** A widget showing a watched item's current price and its delta, with the face set by the price | It is the only Duolingo surface that reaches the user without asking for attention on the app's schedule, and Shin's central problem is that its value arrives at a moment it cannot predict. A widget is present when the user next looks at their phone in a store, without a notification. What must not carry over: Duo's widget mood escalates toward midnight on the user's inaction. Shin's widget face tracks the price and nothing else |
| 19 | Empty state, character asleep | **Mapped.** Asleep is already a candidate state in the avatar brief | The watchlist is empty for every new user, and early on it is one of the most common screens in the product. Asleep is honest, it is not a reproach, and it hands back one action, which is what the design system requires of a refusal panel already |
| 20 | Paywall | **Mapped, bounded.** The avatar is present at the scan meter's zero state | Removing the face at the one screen that asks for money reads as a bait and switch, and Duolingo's paywall keeps the mascot for exactly that reason. Bound: the avatar may not be disappointed in the user for not paying. It can be blunt about what the paid tier does. It cannot be hurt |
| 21 | Leagues and leaderboards | **No equivalent in v1, because** a leaderboard ranks people by volume of the core act, and Shin's core act produces the data the product is judged on. Ranking by scans pays for scanning noise; ranking by "good prices found" pays for inventing them, which hard rule 3 forbids. Reverses if a second party confirmation layer exists that makes a reported price checkable, at which point rank the confirmations and not the reports. Handed to Phase 5 | |
| 22 | Marketing and social character events | **Mapped.** The avatar is put into situations off platform | The channel is short form video and that is the stated objective function. A character that can be placed in a situation is the cheapest content unit available. Shin's version has a better engine than Duolingo's self harm humour: the aggression already has a legitimate target, which is a price, a store, or a brand, and that is a comedy premise a viewer recognises from their own week |
| 23 | Merchandise note from the character | **No equivalent, because** there is no merchandise, no audience, and no cleared name. Reverses if the trademark search clears and an audience exists | |
| 24 | Three named reminder personas on a Duolingo run joke site | **Mapped as evidence, not as a surface.** Encouraging, Disappointed and Passive-Aggressive Duo map one to one onto Deadpan, Warm and Blunt | It is the only direct evidence found that one mascot can carry three tones without the character breaking, which is exactly the risk the attitude picker decision took on. It also shows the trick that makes the harsh tone survivable: the harshest persona is presented as a joke the company is in on, not as the app's sincere opinion of you |

---

## 5. The argument: what the difference in the core act does to every mechanic

This is the section the brief says is where the analysis either happens or does not, so it is written
as an argument rather than as a list.

**The difference in one sentence.** Duolingo owns its own trigger and Shin does not. A lesson can be
done on a couch, on a bus, at 11:58pm to save a streak. So a notification from Duolingo does not
merely remind the user of an occasion, it manufactures one. Shin's core act requires the user to be
standing in a specific place in front of a specific price. The app cannot cause that, cannot see it
coming, and cannot substitute for it. Shin can only be ready when the world produces the occasion.
Everything below follows from that.

**First consequence: every mechanic whose payload is "come back now" is dead, and most of Duolingo's
famous ones are that.** The practice reminder, the streak, the streak freeze, the streak loss save
push, the escalation ladder and the degrading app icon all exist to convert a user's idle moment
into the core act. Shin cannot convert an idle moment into a scan, because a scan needs an aisle.
Sending the push anyway does not produce a scan. It produces an app open, a user with nothing to do
in it, and a slightly worse opinion of the app. This is why eleven of twenty four rows in section 4
are "no equivalent" and why nine of those eleven are the same argument.

**Second consequence: the surviving mechanics are exactly the ones whose trigger is an outside event
Shin can observe, and Shin can observe precisely one class of event.** A price moved on something
the user asked about. That single fact reorganises the product. The watchlist stops being a
secondary feature reached from the bottom bar and becomes the entire legitimate retention engine,
because it is the only mechanism by which Shin earns the right to speak first. It also sets the
honest ceiling on notification volume: Shin's daily notification budget is not a number a designer
picks, it is however many watched prices actually moved that day, which for most users most days is
zero. A product whose notification volume is set by the world rather than by a growth target is a
product that will look under engaged next to Duolingo on a dashboard and will be telling the truth.

**Third consequence: Shin's per occasion value must be far higher than Duolingo's, which shrinks the
interruption budget rather than growing it.** Duolingo can afford a mediocre lesson because there
are three hundred and sixty five of them a year and the user has committed to a daily habit. Shin
might get six scans in a month from a window shopper. Every one of those six is a much larger share
of the relationship, and every one of them happens while the user is physically holding a phone up
in public, which is a posture with a short fuse. So the interruption budget in the aisle is close to
zero: on the viewfinder and on the verdict sheet, the avatar's total allowance is whatever helps the
number arrive faster. The generous budget, if there is one anywhere, belongs on the screens where
the user is not in a store, which is setup, the watchlist, and the empty states.

**Fourth consequence: the refusal has no Duolingo analogue at all, and it is Shin's most important
avatar state.** Duolingo's app always has an answer. Every screen it shows is a screen where it knows
what to do next. Duo has never had to survive being useless. Shin's most common outcome is "I cannot
price this", five times in seven, and priority 1 calls that a success state. That means the single
state the artist most needs to get right is one Duolingo never had to design. Put plainly: the owl's
job is to make "do it again" unavoidable, and Shin's avatar's job is to make "I don't know"
survivable. Those are different jobs and they need different faces. A refusal face borrowed from a
sad owl reads as the app apologising for failing the user, which invites the user to conclude the
app is broken. The face this product needs reads as a professional declining to guess, which is what
the design system already encodes by making refusal grey rather than red, a designed state rather
than an error, and by requiring that it hand back exactly one thing the user can do.

**Fifth consequence: hard rule 4 does not trim Duolingo's emotional engine, it replaces it.**
Duolingo's engine is a debt the user owes to a character. That is what "You've let Duo down" is, and
it is what the widget owl getting desperate toward midnight is, and it is what makes losing a streak
feel like a moral event. Shin cannot run that engine, and not only because the rule forbids it.
Groceries are non discretionary and the person scanning did not set the price, so guilt aimed at
that person is aimed at someone who has done nothing wrong and is already being charged too much.
The replacement is an alliance rather than a debt: Duo is disappointed in you, and Shin is
disappointed with the price. Mechanically that means three things. Every negative face needs a
visible target on the same screen, which is the number and the seller's name. Every line in the
blunt personality has to name who it is aimed at, and a line aimed at the user is deleted rather
than softened. And the intense forms of the negative faces are gated on confidence, because anger is
a loud claim and a loud claim on thin evidence is exactly the failure priority 1 names.

**Sixth consequence: what replaces guilt as the reason to come back, ranked by how much each depends
on data Shin does not have.** Strongest is an outside event, a watched price moved, which depends on
a price feed and is the reason the spine matters more than the mascot. Second is a stake the user
placed themselves, meaning they asked about this item, so the answer arriving belongs to them rather
than being the app's demand on them. Weakest is curiosity, the avatar has something to show, because
that manufactures an occasion again and is the guilt engine wearing a friendlier face. The
anti guilt version of "you have not scanned in a while" is not a gentler phrasing of it. It is not
sending it.

**Seventh consequence, handed to Phase 5.** Every Duolingo mechanic pays for volume of the core act,
and that is safe for Duolingo because a lesson produces nothing but learning. Shin's core act
produces price data, and the product's only value is being trusted about a number. So Shin cannot
pay for volume of the core act without paying for fabricated data, and hard rule 3 forbids the
fabrication from becoming a price. Any Shin mechanic has to pay for something a second party can
confirm, and the pool of confirmable behaviours is far smaller than Duolingo's. That is the whole
reason the leaderboard is a "no equivalent" in v1 rather than a feature, and it is the constraint
Phase 5 should start from rather than discover.

**What was taken, stated plainly.** Four things: the widget, because it reaches the user without
asking for their schedule and Shin's value arrives unpredictably. The give up message, because an
alert nobody opens is information and not a reason to send more. The asleep empty state, because
Shin's watchlist starts empty for everybody. And the character carrying three named tones, because
the attitude picker already bet on that and Duolingo's own joke site is evidence it holds. What was
left is everything built on a daily obligation, because Shin's user does not have one, and everything
built on the user owing the character something, because they do not.

---

## 6. What was searched and not found

Recorded so a later pass does not repeat it and does not read a gap as an absence.

- **A Duolingo published figure isolating the mascot's contribution to retention.** Searched:
  blog.duolingo.com character posts, the Q4/FY2024 shareholder letter, the Q2 2026 earnings call
  transcript, the Apple Developer Behind the Design piece, growth.design's Duolingo case study, and
  Lenny's Newsletter. The character posts state a goal and a method and attach no metric. The
  filings and the transcript do not mention the mascot in the sections searched.
- **Whether the app icon changes with an individual user's streak state as a product behaviour.**
  Searched several icon queries. Only SEO content sites assert it. No Duolingo post, no filing, and
  no press piece with a quoted employee.
- **A Duolingo source for Duo appearing at lesson start or on the learning path home screen.** The
  path redesign is documented by Duolingo; the character's presence on it is not, in anything found.
- **A sourced per day notification cap.** The only figure found, two per day, appears on a page that
  cites nothing for it.
- **Any churn or uninstall cost attributed to Duolingo's notifications**, from Duolingo or from a
  third party.
- **A source behind "leagues drive +25% lesson completion".** The page whose title carries the
  figure provides none.
- **design.duolingo.com/writing/duo** now returns a 301 to https://blog.duolingo.com/hub/design/.
  The Duo personality wording quoted in section 1 was retrieved through a search index rather than
  from the live page, and is labelled accordingly.

---

## 7. Count

**24 surfaces enumerated, 21 confirmed with a source, 3 not confirmed, 13 mapped to Shin, 11 no
equivalent.**

The three not confirmed are rows 2, 4 and 5: the app icon changing with an individual user's streak
state, Duo's presence on the learning path home screen, and a Duo appearance at lesson start.
