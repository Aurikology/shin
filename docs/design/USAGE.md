# Shin USAGE.md

The usage process. Written 2026-09-03 as Phase 3 of `docs/design/brief-usage-and-avatar.md`.

This file is a sibling of `DESIGN.md` and **wins over it on any question of sequence**: what comes
before what, what is on screen at second four, what a tap leads to, and what an outcome hands back.
`DESIGN.md` still wins on colour, type, motion and component definition. Where the two disagree
today, this file names the disagreement and Phase 6 makes the edit.

Three things to read before the scripts:

**Every duration here is a design budget, not a measurement.** Nothing in this file has been timed
with a person. A budget is a number the build is held to and fails against, and it is written so a
build can fail. No timing here is evidence about users.

**The scripts are written to the v1 floor, not to the running app.** The floor is barcode and
screenshot input, live photo recognition cut (`docs/decisions.md`, "The v1 floor is six systems").
Each script carries a line saying what the running app in `app/` does differently today, because
today it does something materially different and pretending otherwise would make this file
decoration.

**The engine answers 2 of 7.** `spine/README.md` records exactly two verdicts out of the seven
hand-priced items, Kraft Dinner and the used POÄNG, with the other five refusing. Refusal is not
the error path. It is the outcome the product mostly produces, so it gets the longest script here.

---

## 0. What a session is made of

| Piece | What it is |
| --- | --- |
| **Identity** | What the thing is. From a barcode in v1. Never from a photo, per the floor. |
| **Asking price** | What this seller wants. In v1 this is **typed by the user**, because there is no OCR. |
| **Comparison set** | What other sellers want. From the spine. |
| **Verdict** | Hue for the judgment, fill for the confidence. `DESIGN.md` Law 2. |
| **One action** | Every outcome, including a refusal, hands back exactly one thing to do. |

The asking price being typed is the hole in the v1 floor and this file is where it gets named. A
barcode gives an identity, not a price, and the price is on the shelf tag. So the aisle script has
one manual step in it, about four seconds long, and **shelf-tag OCR is the highest-value build
after v1 precisely because it deletes that step and nothing else**. Until then, typing it is
honest: the number the verdict is computed against is a number a person read off a tag, which is
better provenance than any inference, and it can never be a fabricated price under hard rule 3.

---

## 1. Script A. The aisle

The user installed from a short-form video (`CLAUDE.md`: the channel is short-form video). They are
standing in front of a shelf, holding the phone at arm's length, and there is a price tag in front
of them. This is the case the product's promise is written for.

### A1. First run, cold

| Clock | Budget | What they see | What they do |
| --- | --- | --- | --- |
| 0:00.0 | 1.2s | Icon tap. No splash. The app comes up on the viewfinder surface directly. | Nothing |
| 0:01.2 | 4.0s | **Pick your Shin.** Three faces, three sample lines, Deadpan preselected. | Taps one face. The tap is the continue. |
| 0:05.2 | 1.2s | Viewfinder surface, feed dark and still, one line where the hint goes: "I need the camera to read a barcode." The shutter is labelled **Allow camera**. | Reads it |
| 0:06.4 | 3.5s | The system camera prompt | Allows |
| 0:09.9 | 0.3s | Live feed, full bleed. Hint: **"Point at the barcode."** Wordmark top left, bottom bar with the shutter centred. | Raises the phone |
| 0:10.2 | 2.3s | Feed, reticle idle | Frames the barcode on the box |
| 0:12.5 | 0.4s | Barcode caught. Reticle contracts over 200ms, frame freezes and desaturates 6%. **No shutter press.** | Nothing |
| 0:12.9 | 0.5s | Item name resolves into a chip under the reticle: "Kraft Dinner Original, 225 g". The chip is tappable and that is the wrong-item repair. | Reads the name |
| 0:13.4 | 4.0s | A numeric pad rises to half height over the frozen frame. One line above it: **"What does the tag say?"** The confirm is the pad's own key, not a separate button. | Types 2.00 |
| 0:17.4 | 0.8s | Pad drops, `thinking` face at 76px, one line in their Shin's voice. p50 budget 0.8s, hard cap 2.5s. | Waits |
| 0:18.2 | 0.26s | **The verdict field rises to peek.** Solid `walk` field, "Walk away" at 34px, $2.00 at 72px, "usually $1.47" under it, three of four confidence dots, "Fairly sure, 3 sellers", the item name, and one wide primary: **Watch it**. | Reads it at arm's length |

**Moment of value: 0:18.2 on the first run.** The verdict field at peek, read without a drag,
without a scroll, and without leaving the picture they took.

### A2. Every run after

The picker and the permission are gone. Same script from the viewfinder.

| Clock | Budget | Moment |
| --- | --- | --- |
| 0:00.0 | 1.2s | Icon tap to live viewfinder |
| 0:01.2 | 2.3s | Frame the barcode |
| 0:03.5 | 0.9s | Detected, frozen, identity resolved |
| 0:04.4 | 4.0s | Type the tag price |
| 0:08.4 | 0.8s | Engine |
| 0:09.2 | 0.26s | **Verdict at peek** |

**Moment of value: 9.5 seconds warm.** That is the number the build is held to and the one to
argue with. Four of those nine seconds are the user typing a price, which is why shelf-tag OCR is
the next build and why nothing else on the after-verdict list is.

### A3. After the verdict, in the aisle

| Clock | Budget | Moment |
| --- | --- | --- |
| 0:09.5 | 3.0s | They read the face, the word and the two prices. Nothing moves. |
| 0:12.5 | 0.4s | Tap **Watch it**. Label becomes "Watching", the face morphs to `pleased`, one line: "Watching. I will say something under $1.47." |
| 0:12.9 | 0.3s | They drag the sheet down. Frame unfreezes, viewfinder live, shutter under the thumb. |
| 0:13.2 | | Next item, or the phone goes in the pocket. |

The session ends on the viewfinder. It never ends on a confirmation screen, because the last thing
on screen should be the thing that starts the next scan.

### A4. What the running app does differently today

- No barcode reader. The shutter is pressed manually, then a 420ms pause, then a list of the seven
  corpus items appears: "Is it one of these?" The user picks. There is no way to scan a real shelf.
- No price typing. The asking price comes from `spine/data/corpus.json`, and **three of the seven
  are stated stand-ins**, which the sheet labels on its face ("This asking price is a stated
  stand-in, not a tag anyone read"). That labelling is correct and stays.
- The permission is requested at the first shutter press with no priming line before it.
- No action at peek: `Watch it`, `Correct it` and `Share` all sit in the full detent.

---

## 2. Script B. The couch

They installed from the same video, sat down, and there is nothing in front of them but a desk. The
brief records this as OLMA's own recorded case: welcome, camera permission, identifying, a
"Center the price tag or product in the frame" hint (`docs/design/brief-usage-and-avatar.md`,
section 1). It is also the majority install case, because the video is watched on a couch.

**The structural difference, and it is the whole script: there is no asking price.** The thing on
the desk has no tag. The engine's `no_asking_price` refusal reason exists for exactly this. Treating
it as a refusal would make the most common install case end in the product's grey state, which is
wrong, because Shin is not short of data here. It has the comparison set. It is short of one number,
and that number is the user's to supply or to skip.

**So the couch outcome is not a verdict and not a refusal. It is the going rate.**

### B1. First run, cold

| Clock | Budget | What they see | What they do |
| --- | --- | --- | --- |
| 0:00.0 | 1.2s | Icon tap to the viewfinder surface | Nothing |
| 0:01.2 | 4.0s | Pick your Shin | Taps one face |
| 0:05.2 | 4.7s | Permission primer, then the system prompt | Allows |
| 0:09.9 | 4.0s | Live feed. Hint: "Point at the barcode." | Waves the phone at the desk |
| 0:13.9 | 0.3s | **The hint escalates**, because four seconds have passed with nothing detected: "No tag on it? Point at the thing itself, or use your last screenshot." A second, quieter control appears beside the shutter: **Last screenshot**. | Points at a bottle of detergent |
| 0:14.2 | 0.4s | Barcode caught, frame freezes | Nothing |
| 0:14.6 | 0.5s | Identity chip: "Tide Simply, 2.72 L" | Reads it |
| 0:15.1 | 0.8s | `thinking` face, engine call | Waits |
| 0:15.9 | 0.26s | **The going-rate card rises to peek.** Not a verdict field and not the refusal grey: neutral surface, the range as the hero in tabular figures, the seller count in mono, and one line: "I know what this goes for. I do not know what they are asking." One primary: **Tell me the price.** | Reads the range |

**Moment of value: 0:15.9 first run, 7.2 seconds warm.** The couch reaches value *faster* than the
aisle, because nobody types a price. The range is the payoff and it is complete on its own.

### B2. What happens next, and both branches are fine

| Branch | Clock | What |
| --- | --- | --- |
| They tap **Tell me the price** | +0.4s pad rises, +4.0s typing, +0.26s the card becomes a real verdict field with a face | The full product, on a couch |
| They drag it down | +0.3s | They got a range for free and learned what the app is. This is a complete session. |

### B3. The face state this needs

There is no expression in `DESIGN.md` section 3 for "I know the range and I want the price". Using
`unknown` would read as a refusal and using `thinking` would read as unfinished. **Phase 4 must add
one state, working name `asking`, and until it exists the card uses `thinking` at 76px.** Flagged
rather than invented, per the brief's rule for this pass.

### B4. What the running app does differently today

Everything above the identity chip. There is no barcode reader, no hint escalation, no last
screenshot control, and no going-rate card. Pointing the app at a desk object today produces the
seven-item candidate list.

---

## 3. Drop-off points, and what the app does about each

Named per the brief. Every row applies to both scripts unless the row says otherwise.

| # | Drop-off | What the user experiences | What the app does |
| --- | --- | --- | --- |
| 1 | **The permission prompt** | The system sheet lands before they have seen anything work | A one line primer 1.2s before the system prompt, on the surface the camera will fill, with the shutter relabelled `Allow camera` so the prompt is something they asked for. **If they deny**, the app does not nag and does not block: the drawn shelf fallback already in `camera.js` keeps every control in the same place, and the `Last screenshot` control is promoted to the shutter's position, because a denied camera makes the screenshot path the only path. One line: "No camera then. Screenshots work too." Never a wall, never a second ask in the same session. |
| 2 | **Identification fails** (`no_identity`) | Nothing resolves. No barcode, or a barcode that matches nothing. | The reticle stops contracting and the hint becomes the repair: "No barcode I can read. Type what it is." A text field, not a list. In the aisle this is the loose-produce and no-tag-facing-out case, and it is common. |
| 3 | **Identification is unsure** (`identity_unsure`) | Two products are close, the R6 case from the pilot | The candidate list, which is the one refusal that most often becomes a verdict. `voice.js` already carries the line: "The wrong match would price a different product, so pick it and I will." **A wrong verdict is worse than no verdict**, so this refuses rather than guessing the top match, even though guessing would be faster. Priority order, applied. |
| 4 | **The item is not in the corpus** (`no_source_response`, `too_few_points`, `points_too_stale`) | Identity resolved, prices did not | The refusal script, section 4. The evidence Shin did find is shown under the sheet, and the line that must never change is the one already in `camera.js`: "That is a gap in what I have been taught, not a fact about the market." |
| 5 | **The price tag is unreadable** | Glare, a tag for a different size, a multi-buy price like 4 for $5.00 | v1 never reads a tag, so this cannot fail silently: the user types the number. The pad carries one affordance for the multi-buy case, a `4 for` toggle that divides, shows its own arithmetic on screen, and labels the result as a unit price. **The verdict is computed against the number displayed, never against an unshown intermediate.** |
| 6 | **The meter is at zero** | Cannot happen in v1 | There is no meter in v1, section 6. If the switch is ever flipped, the zero state is specified there. |
| 7 | **The verdict is thin** | One seller, or points ageing out | The hollow treatment from `DESIGN.md` Law 2: 12% tint, 2px solid border, two dots of four, the label "Thin, 1 seller". **A thin verdict never gets an intense face and never gets a loud line.** A hollow field with a shouting face is a wrong verdict delivered confidently, which is the exact failure the priority order is written against. |
| 8 | **The engine is slow** | Over the 2.5s cap | The `thinking` face stays and one line names what is happening in provenance mono, not a spinner. Above 6s the sheet converts to a refusal with reason `no_source_response`, because a product about instant checking that spins is lying about its own promise. |

---

## 4. Script C. The refusal

Five of the seven hand-priced items refuse. This is the most common outcome of the primary action
and it gets the same care as the answer. The test the brief sets: **if this script ends with the
user closing the app, redesign until it does not.**

### C1. The script

Aisle, warm start, the item is Tide Simply 2.72 L, which the pilot found at exactly one seller and
which the engine therefore refuses on `too_few_points`.

| Clock | Budget | What they see | What they do |
| --- | --- | --- | --- |
| 0:00.0 | 1.2s | Viewfinder | Nothing |
| 0:01.2 | 2.3s | Feed, reticle idle | Frames the barcode |
| 0:03.5 | 0.9s | Frozen, identity chip: "Tide Simply, 2.72 L" | Reads it |
| 0:04.4 | 4.0s | The pad, "What does the tag say?" | Types 13.49 |
| 0:08.4 | 0.8s | `thinking` | Waits |
| 0:09.2 | 0.34s | **The refusal rises.** Grey at 12%, 2px dashed border, the dashed-circle `unknown` face at 96px, one slow blink, no shake and no red. Headline in their Shin's voice: "Not enough to call it." Under it, the engine's own sentence naming what happened. Under that, in mono: "1 price found. I need 2." One primary: **Keep it.** One text link, small: "What I can price." | Reads it |
| 0:09.5 | 3.0s | They read | |
| 0:12.5 | 0.4s | Tap **Keep it** | |
| 0:12.9 | 0.3s | The sheet swaps, in place, to a `pleased` face at 62px and one line: "Written down. $13.49 at Metro, today. I still cannot call it." | Reads it |
| 0:13.2 | 2.0s | The line holds | |
| 0:15.2 | 0.3s | Sheet drops, frame unfreezes, **viewfinder live with the shutter under the thumb**. The hint has changed: "Packaged groceries are the ones I know best." | Frames the next thing |

**The script ends at 15.5 seconds on a live viewfinder, not on a close.** No scan was spent, because
there is no meter, and if there ever is one, section 6 says a refusal does not spend one.

### C2. The single action, by reason

Every refusal reason gets exactly one action, because a fork at the moment of disappointment is a
choice about how to feel and the user will pick the exit.

| Reason | The one action | Why it is that one |
| --- | --- | --- |
| `no_identity` | Type what it is | The only repair. Nothing else is known. |
| `identity_unsure` | Which one is it | The refusal most likely to become a verdict |
| `category_unsupported` | What I can price | The honest answer to "why did this fail", measured by asking the engine to price everything it knows rather than counting rows, which `you.js` already does |
| `no_source_response`, `too_few_points`, `points_too_stale`, `comparison_incoherent` | **Keep it** | Shin cannot price it and cannot promise it ever will. It can record what the user read, dated and attributed to a named seller. That is a thing it verifiably did, not a favour it asked for. |
| `no_asking_price` | Tell me the price | This is the couch card, section 2, and it is not drawn as a refusal at all |

### C3. What changed to stop this ending in a close

Six changes, recorded as the brief requires.

1. **Two pills became one pill and one text link.** The running app hands back `Tell me the price`
   solid and `Try again` ghost, equally weighted. `Try again` is now a downward drag, which is
   already the dismiss gesture, so it costs no pixels and reads as leaving rather than as an option.
2. **The action gives before it asks.** `Keep it` is Shin recording something. The old primary asked
   the user for a favour immediately after failing them.
3. **The correction never leaves the frozen frame.** Today `correct` is a separate route and saving
   calls `ctx.go('camera')`, which repaints the whole screen and loses the picture they took. It
   becomes a detent of the same sheet. Losing the frame at the moment of disappointment is the
   close. This is a sequence rule, so this file wins and `DESIGN.md` section 4 gets the edit.
4. **The session ends on the viewfinder**, never on a confirmation screen.
5. **The refusal costs nothing.** No meter tick, no counter, no "1 of 3 scans used". Charging for
   the product's own gap, five times out of seven, is the fastest way to teach someone to stop
   scanning.
6. **The next hint is chosen to succeed.** After any refusal the viewfinder hint names the category
   the engine currently answers best, read from the same measured catalogue the You screen uses. The
   second scan is therefore more likely to work than the first, which is the opposite of what
   happens today.

### C4. The one thing the refusal must never say

It must never promise to look again. There is no re-queryable feed: the pilot's four direct
retailer fetches returned zero prices, three of them 403 (`notes/session-2026-09-03.md`). "I will
keep looking and let you know" is a capability claim the app cannot honour, which puts it in the
same family as a fabricated price. It ships when a source can actually be re-queried on a schedule,
and not before.

---

## 5. Day two and day seven: what brings them back

Ranked by how much each depends on data Shin does not have. Least dependent first.

| Rank | Trigger | What it needs that Shin does not have | Honest in v1 |
| --- | --- | --- | --- |
| 1 | **Nothing. They come back when they are next in a store.** | Nothing at all | **Yes.** This is the v1 answer. |
| 2 | **A scan meter refilled** | A clock, and nothing else | Buildable, and rejected on product grounds. See section 6. |
| 3 | **A friend shared a card** | Nothing new. The card is a still export of a verdict already produced, and `share.js` already renders it. | **Yes**, already built. But it returns a different person, so it is the growth loop, not the retention loop. |
| 4 | **The avatar has something to say** | Depends entirely on what it says. About the user's own record: nothing new needed. About prices: a feed. | **Partly.** See below. |
| 5 | **A watched price dropped** | A per-watched-item price source, re-queried on a schedule, forever | **No.** |

**Why 5 is last and why that hurts.** It is the strongest trigger by a distance. Keepa's extension
has 4 million users and camelcamelcamel 800,000, all of them watching things they have not bought
(`pages/shin-walkthrough.html`, stage 07). The walkthrough calls it "the return trigger". It is
also the one that needs a source Shin has never successfully queried once, and the cost shape is
recorded in `notes/session-2026-09-03.md`: re-pricing scales with **watched items**, not users, and
the derived figure there is $675 a month at 1,000 users saving five things each. So the best
retention mechanism in the product is gated on the same thing the whole product is gated on, which
is a real feed. Building the notification before the feed would produce either silence or a drop
that never happened.

**What "the avatar has something to say" may honestly say in v1.** Only things drawn from the user's
own record, which the app already holds in `store.js`: what they scanned, what they saved, what they
corrected. One example that is true with no feed at all: a weekly line that reads their own week
back to them. What it may **not** do in v1 is manufacture guilt for not opening the app. Duolingo's
guilt-framed nudges tested 5 to 8% better at re-engagement (`pages/shin-walkthrough.html`, stage 11),
and that mechanic does not transfer, for the reason section 7 gives: skipping practice is a
behaviour the user controls, and not being in a shop is not.

**Decision for v1: no push notifications, and no notification permission request.** There is nothing
honest to send. Asking for the permission before there is a message wastes the one ask the app gets.
The in-app badge on the watchlist button, which `camera.js` already paints, is the whole
notification system until a feed exists.

**Reverses if** a re-queryable source ships for the lead category, at which point the price-drop
notification is the first thing built and the permission is asked immediately after the first save,
which is the moment the walkthrough already identified as the right one.

---

## 6. The scan meter

Shared with Phase 5. This is that phase's first and simplest mechanic and the decision is made here
because it is a sequence decision before it is a gamification one.

### The decision

**Shin does not meter scans in v1. Scans are unlimited and free. The switch is built and defaults
to off.**

### The reasoning

OLMA meters, and its camera chrome reads "3 Scans Remaining"
(`docs/design/brief-usage-and-avatar.md`, section 1). The fast-follower rule says copy what works.
The brief's own rule says a mechanic is taken only with the reason it applies to Shin's user, and
"OLMA does it" is not a reason. The reason does not transfer, on four counts:

1. **OLMA's meter is priced against a cost Shin does not have.** OLMA identifies from an image. The
   v1 floor cuts live photo recognition, so a Shin scan is a barcode lookup and a spine query. The
   per-scan cost range recorded in the repo is $0.008 to $0.040 and is explicitly derived from
   published token rates rather than measured (`pages/shin-walkthrough.html`, stage 09). The top of
   that range is a vision call the v1 product does not make.
2. **A cap punishes the exact user this product is for.** The primary user is a window shopper, not
   a buyer (`CLAUDE.md`). The walkthrough's own note against the scan-limit revenue model is
   "Caps the window shopper, your best user". The week-two state the whole design points at is
   someone scanning four to ten things a week that they will never buy. A meter is a tax on that.
3. **It contradicts the hook at the moment of maximum intent.** The channel is short-form video and
   the hook is "Scan anything." A meter is the first thing the app says back.
4. **Five of seven scans refuse.** Either refusals spend a scan, which charges the user for the
   product's own gap, or they do not, in which case the meter mostly does not tick and is theatre.

### The dark specification, so flipping the switch is a release and not a rewrite

| Question | Answer |
| --- | --- |
| **How many** | Per day, never per month. A monthly allowance is spent in one shopping trip and then the app is dead for three weeks. The floor is **at least ten a day**, which is the top of the week-two weekly range compressed into a single day, so it does not bind on a normal trip. That is a design floor derived from a target in `pages/shin-walkthrough.html` stage 12, not a measurement, and the real number comes from the first thousand scans. |
| **What refills it** | The clock, at local midnight, and nothing else in v1. |
| **What earns one back** | **Nothing, until a contributed price can be confirmed.** Hard rule 3 forbids fabricated price data, and paying for reported prices without a confirmation step pays for inventing them. The condition that unlocks earning: a contributed price is confirmed by a second independent observation, meaning another user or a source agreeing on that price at that seller inside the category's freshness window. A price a user asserts and nobody corroborates earns nothing, ever. |
| **What it never blocks** | The watchlist, a correction, a share, and the going-rate card. It blocks new verdicts and only new verdicts. |
| **Refusals** | **Never spend a scan.** Non-negotiable, for the reason in section 4. |
| **The zero state** | Not a wall and not a red screen. Shin's own face, the count in mono, and one line that points the disappointment at Shin rather than at the user, per hard rule 4. Deadpan: "That is ten for today. The camera still works. I just will not have an opinion until midnight." The other two personalities are Phase 4's. Primary action: the subscription, because a meter with no ask is pointless and ten verdicts is after value, which is where `pages/shin-walkthrough.html` stage 09 puts the paywall. Secondary, as plain text: "Everything you saved is still here." |

### Reverses if

Per-scan cost at real volume exceeds what a free tier carries, measured as monthly source and engine
spend against installs; **or** the first thousand scans show a distinct-products-over-total-scans
ratio near 1:1, which is the walkthrough's own instrumented number and the one that says caching
will not rescue the unit economics. Either one flips the switch that is already built.

---

## 7. After the verdict

`docs/decisions.md` fixes the primary: the button after the verdict is save, not buy. This section
decides the rest and places all of them in the three detents from `DESIGN.md` section 4.

### The sheet

| Detent | Contents | Actions | v1 |
| --- | --- | --- | --- |
| **Peek, 46%** | Face 96px, verdict word 34px, price hero 72px, asking seller, "usually", confidence dots and label, item name, stand-in note when the asking price is one | **1. Watch it** (one wide primary) | Yes |
| **Half, 72%** | Adds the spread rail, the confidence sentence, the provenance list in mono | **2. Correct it** · **3. Share** | Yes |
| **Full** | Adds what Shin used in full, dates, promo limits | **4. Find it cheaper nearby** · **5. Show me a dupe** | No |

### The order, and the reason for each position

1. **Watch it** at peek. This is a change from `DESIGN.md` section 4, which puts all actions in the
   full detent, and this file wins on sequence. The reason: save is the decided primary act and the
   only entry to the return loop, and putting a gesture between the user and the one act the design
   says matters costs saves for nothing. The peek is where their eyes already are. Its label is
   keyed by tier, not by personality: **Save it** on `good`, **Watch it** on `fair` and
   `walk_away`, because telling someone to watch a price that is already good is telling them to
   wait for no reason. That is nine new strings in `voice.js`, three tiers times three
   personalities, and the cost is real and worth it.
2. **Correct it** at half. It ranks above share because a wrong verdict is worse than no verdict,
   and this is the product's own error channel. It is also the only action that exists on **every**
   outcome, verdict and refusal alike, which makes it the one control the user learns first. It is
   the crowd price layer's only intake, and the notes call that layer the one asset a competitor
   cannot buy.
3. **Share** at half. The growth engine, and the still card is already built and already correctly
   carries no download link. It sits below correct because it only exists on a verdict, and today
   only two of seven scans produce one.
4. **Find it cheaper nearby: not v1.** It needs store-level price and stock plus a location, and the
   pilot's direct retailer fetches returned zero prices. A wrong "cheaper at the store 1.6 km away"
   sends a person on a trip on a fabricated claim, which is the worst thing this product can do.
   **Reverses if** a feed with store-level price for the lead category exists and has been checked
   against a shelf by hand.
5. **Show me a dupe: not v1.** Not on difficulty. The notes establish that Yuka's alternatives is
   not a similarity model, it is same category with a better score, so a dupe here is same category
   with a lower unit price and it is easy. It waits on **volume**: the corpus is seven items, and
   "same category, cheaper" across seven items returns nothing a person would recognise. **Reverses
   if** the lead category holds enough items that the query returns a recognisable alternative.

### On a refusal

One action only, per section 4. `Correct it` in its `Keep it` form is that action for the thin
family. There is no share and no watch on a refusal, because there is nothing to share and nothing
to watch.

---

## 8. Every borrowed mechanic, and why it applies to someone in an aisle

The rule set on approving the brief, verbatim: *"we are not trying to copy duolingo or any other app, we
are taking inspiration that applies to us."* One row per mechanic touched by this file. Phase 1 does
the full OLMA element audit and Phase 2 the owl; this table only covers what the usage process
itself borrows.

| From | Mechanic | Verdict | The reason it applies to a window shopper holding a phone in a store aisle |
| --- | --- | --- | --- |
| OLMA | "Center the price tag or product in the frame" hint | **Take** | They are holding the phone at arm's length at a shelf and cannot see whether the frame is right. A hint that names the target is the difference between one scan and four. Shin's version names the barcode first, because barcode is the v1 input. |
| OLMA | Hint escalation when nothing is detected | **Adapt** | The couch case has nothing with a tag on it. Four seconds of no detection is the app's only signal that they are not in a shop, and it is enough to offer the screenshot path. |
| OLMA | Scan meter | **Reject** | Section 6. Their cost is a vision call, Shin's is a lookup, and the aisle user's constraint is time, not allowance. Reverses on the cost condition in section 6. |
| OLMA | "Add More Details" | **Adapt** | The extra detail an aisle user has is a number on a tag, not a description. Shin's version is Correct it, and it is a numeric pad, not a form. |
| OLMA | Collection with a price badge | **Already have** | The watch row with its delta against the usual price. |
| Duolingo | A character that reacts to the outcome | **Take** | At arm's length under shop lighting a face resolves faster than a sentence, and the verdict has to read in about three seconds from a metre away. |
| Duolingo | Reacting at the exact moment of the act, not after it | **Take, with a cap** | The reaction lands over the frozen frame, in the same surface, while they are still looking at the thing. Phase 4 sets how often it may fire. |
| Duolingo | Streak | **Reject for v1** | A streak pays for opening the app on a schedule. Nobody shops on a schedule, and rewarding daily opening from someone who is not in a shop pays for a behaviour with no value in it. Reverses if browse sessions with no store visit turn out to be daily, measured as sessions per week per user. |
| Duolingo | Guilt-framed re-engagement push | **Reject for v1** | Section 5. Skipping practice is a behaviour the user controls. Not being in a shop is not, and hard rule 4 forbids pointing at the user anyway. |
| Wordle | Share export with no link in it | **Already have**, and keep it exactly | Recorded decision, and `share.js` implements it. |

---

## 9. The priority order, applied to this file

**A wrong verdict is worse than no verdict.** Three places this file pays for that and each one
costs time or taps: identity refuses rather than guessing the top match, even though the model
holds the right answer in its top five far more often than in its top one; a thin verdict gets a
hollow field and a flat line rather than an intense face; and the aisle user types the asking price
rather than the app inferring it.

**Ship or kill.** Five things are killed here with a reversal condition: the scan meter, the
price-drop notification, notification permission itself, nearby-cheaper, and dupes. Five things
ship: the barcode aisle flow, the typed asking price, the going-rate card, the refusal's `Keep it`,
and Watch at peek. Nothing in this file is parked without one or the other.

**Speed last.** The permission primer costs 1.2 seconds and is kept. The typed price costs four
seconds of a nine second script and is kept. The 2.5 second engine cap converts to a refusal at six
seconds rather than spinning, which trades speed for honesty in the one direction that is allowed.

---

## 10. Open questions, the founder's to call

One line each, with my default. These are not blockers: each has a default that ships.

1. **Does the attitude picker come before the first scan or after the first verdict?** Default:
   before, reduced to one tap by making the face itself the continue.
2. **Is the lead category new tech or packaged grocery?** It changes the aisle hint and how often a
   barcode is even present. Default: new tech, on cost of data, per the pilot's same-day correction.
3. **Do we build the meter switch dark, or not build it at all?** Default: build it, default off, so
   a cost problem is answered in a release rather than a rewrite.
4. **Does the app offer the user's most recent screenshot on first run?** It needs a photo
   permission, which is a second ask. Default: offer it, request the permission only when tapped.
5. **Does a price the user typed get shown back to them at that seller later?** Default: yes,
   labelled as theirs, dated, and never mixed into a comparison set.
6. **Does the couch case get the going-rate card, or a plain refusal?** Default: the card, and
   Phase 4 adds the one face state it needs.
7. **Does `Save it` versus `Watch it` by tier justify nine more strings?** Default: yes.

---

## 11. Decisions

The six entries drafted here were moved to `docs/decisions.md` on 2026-09-04, in that file's
format. The meter entry was merged there with the one `docs/design/GAMIFICATION.md` drafted about
the same switch, and the merged entry cites both files. `docs/decisions.md` is the record; nothing
in this section is a second copy of it.
