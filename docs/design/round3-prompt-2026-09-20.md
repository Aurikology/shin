# Round three prompt, for ChatGPT, Gemini and DeepSeek, 2026-09-20

Paste the block below to all three, unchanged.

What round two produced, and why this round is shaped differently:

- **ChatGPT** gave the one real idea of the round: make the verdict a solid colour field rather
  than a translucent sheet with a coloured dot in it, demote the price rail to evidence, split
  identity confidence from price confidence so an unsure answer says "check the variant" instead
  of "low confidence", and stop weighting save, share, correct and thumbs equally.
- **DeepSeek** arrived independently at most of the same calls, computed real contrast ratios,
  and added the sharpest single observation of either round: the price should not be the largest
  thing on the verdict, because the user typed it themselves and already knows it.
- **Gemini returned its round one document unchanged.** Same opening paragraph, same "25-Step
  Flow" heading, same invented city and shop names, same closing citation list. It answered
  nothing.

So two models converged and one repeated itself, and none of the three said anything about the
thing he actually objects to. His words, 2026-09-20: *"a lot of the ui looks very generic and very
ai generated ... a lot of the interfaces are not refined for human use, a lot of things are hard
to navigate, hard to understand."*

This round is short, narrow and adversarial on purpose. Round one asked for every screen's
behaviour and got the average answer for every screen. Round two asked for every screen's look
and got the average answer again. Breadth is what produces the average. This round asks for one
screen in full depth, and for a diagnosis of the navigation.

---

Third round. Short on purpose. Do not restate round one or round two.

## What happened last round

I asked three models the same question. Two produced substantially the same design. One returned
its round one answer unchanged. Agreement between models is not evidence that the answer is
right. It is evidence that you share a prior. Treat your own last answer as a suspect.

## The complaint this round exists to answer

The owner's words: the interface looks generic and AI generated, it is not refined for human use,
and a lot of it is hard to navigate and hard to understand.

Be clear about what that does and does not mean here. The usual surface tells of AI generated
design are Inter as the unchosen default typeface, indigo to purple gradients, three rounded
cards in a row with soft shadows and thin line icons, glassmorphism, and headline copy that could
belong to any product. **This app has none of those.** It uses Bricolage Grotesque and Instrument
Sans, a near black ground, a hot crimson, and four verdict hues.

So the genericness is structural, not decorative. What it actually looks like is this: every
screen is the same shape. A face at the top, a title under it, a line of body text under that, a
row of pills at the bottom. Every transient state is a sheet that rises from the bottom. Every
list is rows of equal visual weight with a chevron. Nothing on any screen is bigger or louder or
quieter than the template says it should be, so nothing tells you what matters. That is the thing
a person reads as "no one decided this."

## The app, in facts you can rely on

It is a web app in a phone browser. Not native. Used standing in a shop aisle, one hand, three to
five seconds of attention, bright overhead light, screen brightness often low.

Thirteen screens exist: the camera, onboarding, the personality picker, data consent, the
correction screen, share, Saved, Past scans, Recently removed, Savings, Market, Licences, and the
You page.

The camera screen is the only one with authored detail: focus rings on each of its controls,
transitions on its pressables, a state machine that hides the bottom bar when the verdict lands,
an aiming reticle, and a shutter ring that doubles as the progress indicator. The other twelve
screens are built from a shared shell that defines four controls used across nine of them. The
camera and the screens behind it do not feel like the same application.

The palette: ground `#0B0C0E`, surface `#16181C`, raised `#22262C`, hairline `#2E333A`. Text
`#F7F5F2`, muted `#A5ADB8`, faint `#848D99`. Brand `#E5165E`. Verdict tiers good `#12B76A` and
`#38E08B`, fair `#E8A020` and `#FFC24D`, walk away `#C23619` and `#FF6A45`, unknown `#5E6770` and
`#93A0AC`. Display type Bricolage Grotesque, interface Instrument Sans, provenance labels IBM
Plex Mono 11px uppercase at 0.12em. Radii 8, 16 and 26px. Page padding 18px. Tap target 48px.

Measured accuracy on 200 real photographs: 148 correct. Multipacks 7 of 18, and every multipack
miss returns the right brand with the wrong variant. Of 160 high confidence answers 137 were
right; of 24 low confidence answers 3 were right.

Two constraints that are not negotiable. A person opens the camera screen many times a day, and
nothing seen that often should animate on arrival; if you propose an entrance animation for a
frequently seen surface you have to defend it. And anything that enters must leave the way it
came in, so a sheet that rises from the bottom leaves downward and never sideways.

## Four questions. Nothing else.

**1. Turn on your own last answer first.** Name three decisions in what you wrote last round that
were the statistically safe choice rather than something you would defend, and say what you would
have done instead if the safe version had been forbidden. If you cannot find three, you have not
looked.

**2. Design the Saved screen completely.** Not the verdict, which has had two rounds already.
Saved is a list of answers the user kept: the product, the price they saw, the seller, the day,
and the verdict Shin gave at the time. It is the most template shaped surface in the product and
it is the one that reads as generic. Describe it precisely enough that two people reading your
answer would build the same screen: what is on it, at what size and weight, what is heavier than
everything else and why, what an empty one looks like, what a single row looks like when the
answer was confident and when it was not, what happens when the user removes one, and what the
screen looks like with two rows versus forty. Then state the rule you invented for Saved and what
it implies for Past scans, Recently removed, Savings, Market, Licences and the You page, which
are the same shape. Say in particular what your rule does to the You page, which currently holds
at least twenty three controls in a single scrolling view.

**3. Navigation.** I traced the running code rather than asking you to guess. These are facts.

- Getting from a cold start to one price answer takes **29 taps** if you walk the onboarding, or
  5 if you find the skip.
- Four screens have exactly one door in. Past scans and Recently removed can only be reached from
  Saved. Savings and Market can only be reached from the You page. **Licences can only be reached
  from Market**, and nothing on the You page leads to it.
- The personality picker and the data consent screen have **no back control at all**. The only
  way off either one is forward.
- The correction screen always exits to the camera, including when you entered it from the You
  page, so correcting a price silently moves you somewhere you did not come from.
- The Savings screen draws the same three tab bar as Market and Licences, but its "You" tab does
  nothing. The identical control works on the other two screens.
- **Nine things move without anyone tapping.** Two of them change screen on a timer: 1400ms after
  a correction saves, and 2000ms after the user taps keep it. The rest rewrite copy under the
  user at 420ms, 800ms, 3500ms, 4000ms and 6000ms.
- Two buttons are completely empty, with no icon and no text: the sheet grabber, and the small
  shutter in the page bar.
- One view has at least 23 controls in it: the You page. The price pad has at least 17. The
  verdict sheet has 9.
- Correcting a price is called four different things in four places: Fix Results, Tell me the
  price, Tell Shin the price, and Report a wrong price. Going back to the camera is called six
  different things. **The button that saves an answer has no fixed label at all**; its wording
  changes with the verdict and with the chosen personality, so the same control is never twice
  the same word.

Pick the five of these that cost a person the most, rank them, and fix each one. For each fix say
what it costs to make, and what is lost. Do not fix all of them and do not list the ones you are
not fixing.

**4. What could only be Shin.** Name one visual or interaction decision that follows from
something true about this product and could not be lifted into a different app. Not a mascot, not
a colour, not a personality setting: a decision. Then describe, in enough detail that I can see
what I am not getting, the direction you rejected in order to arrive at it.

## Rules

- Do not write a screen by screen specification with lettered subheadings. If you are typing
  "A. Purpose of the screen", you are answering round one again and the answer is wasted.
- Open with one sentence naming the single thing you are changing. Not a summary, one sentence.
- You may use an obvious pattern, but then say why the obvious one is right here and name what
  you tried before settling for it.
- Do not show your working. One of you pasted its entire reasoning process last round.
- Any colour you propose comes with a hex value and its contrast ratio against the surface it
  sits on.
- Anything you borrow, name the real product, designer or illustrated character and the exact
  element you are taking.
- Do not invent facts about the owner, his city, his shops or his users. The numbers above are
  the only ones that exist.
- Mark each of the four answers as one you would bet on or one that is a guess.

Spend your length on question 2.
