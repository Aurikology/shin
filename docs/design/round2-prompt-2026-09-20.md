# Round two prompt, for ChatGPT and Gemini, 2026-09-20

Paste the block below to both models, unchanged, so the two replies stay comparable the way
round one's did. Round one is in `ui-redesign-chatgpt-2026-09-20.md` and
`ui-redesign-gemini-2026-09-20.md`.

Why this prompt is aimed where it is: round one was given the app's behaviour and returned
behaviour. Neither model was ever shown the colour, type or face system that actually ships, so
neither said anything about how Shin looks, and "visually appealing" is one of the three things
the product is judged by. This round asks only for that.

---

Second round. You have already written a full screen by screen redesign of Shin. This round is
not that one again. Repeating any of round one's layout, microcopy, accessibility notes or
onboarding cuts is a wasted answer.

## What Shin is, with round one's mistakes corrected

It is a **web app running in a phone browser**. Not a native iOS or Android app. There is no
UIKit, no programmable haptic engine, no system sheet, no App Store. It is HTML, CSS, JavaScript
and a live camera inside a web page. Round one specified point values, native switches, VoiceOver
rotor behaviour and continuous haptic textures. Most of that cannot be built here.

What it does: you point the phone at a product in a shop. It reads the barcode, or takes one
photo. You type the price on the shelf tag. One model call identifies the product and finds
prices elsewhere. A cartoon face then tells you whether the price you are looking at is fair.

**Measured accuracy, on 200 real photographs.** 148 correct. By kind: plain products 68 of 90,
size pairs 42 of 54, store brands 16 of 18, technology 15 of 20, multipacks **7 of 18**. Every
multipack miss returns the right brand and the wrong variant: flaked tuna when it was chunk, one
KitKat for another, the wrong size of the same crisps. Of the 160 answers it called high
confidence, 137 were right. Of the 24 it called low confidence, 3 were right. So the product is
right about three times in four, wrong more often than right on multipacks, and its own
confidence signal is real but coarse. These are the only numbers about this product that exist.

Three personalities the user picks at setup: deadpan, warm, blunt. They change the words, never
the number and never the verdict.

**Two things round one got wrong, which are settled and not up for redesign.** Save and Share are
already wired into the verdict sheet; they are not orphaned. And the onboarding really is 31
steps and really does contain a fake trial page, a fake plans page, a fake "Preparing" bar and a
fake "Evaluating" bar. Cutting those is decided. Do not re-argue either one.

**Do not invent facts.** Round one named a city I never mentioned and four grocery chains it was
never given, then built a feature on them. If you need a fact to answer, ask for it in one line
and answer around it.

## The visual system that ships today

Round one was never shown this, which is why its colour advice ("warm neutral background, soft
green, do not look like a financial dashboard") does not fit what exists. Here it is.

The app is mostly live camera, so the chrome is dark and translucent and sits over the world.

Ground `#0B0C0E`. Surface `#16181C`. Raised `#22262C`. Hairline `#2E333A`. Scrim is the ground
at 55 percent.

Text: `#F7F5F2`, muted `#A5ADB8`, faint `#848D99`.

Brand `#E5165E`, a hot crimson pink, with a 16 percent wash of itself for fills.

The verdict hues, one per tier: good `#12B76A` and a brighter `#38E08B`; fair `#E8A020` and
`#FFC24D`; walk away `#C23619` and `#FF6A45`; unknown `#5E6770` and `#93A0AC`. Grey is a tier,
not an error state, because a refusal is the single most common outcome of the primary action.

The governing colour rule, which is the product's own idea and which you should judge: **hue is
the verdict, saturation is the confidence.** A confident walk away is a solid saturated field. A
thin one is the same hue, hollow, outlined. The intent is that calibration is something the user
sees rather than something a footnote claims.

Type: display is Bricolage Grotesque, interface is Instrument Sans, and provenance labels are
IBM Plex Mono at 11px, uppercase, 0.12em tracking. The price is 72px at weight 800 with -0.03em
tracking, dropping to 64px under 380px wide. The verdict word is 34px at weight 800, sentence
case, never shouting capitals. Body is 16px. Figures are tabular.

Shape: radii 8, 16 and 26px, the sheet corners 26px. Page padding 18px, standard gap 14px, tap
target 48px, the shutter 76px. Two shadows, both nearly black and deeply blurred.

The face has six sizes: 96px on a verdict, 76px while working, 62px on an acknowledgement, 48px
on a page, 28px in a list row. It has thirteen states and three personality treatments of each.

## Where it is actually used

Standing in a shop aisle, one hand on the trolley, phone held at arm's length under bright
overhead light, screen brightness often low, three to five seconds of attention before the
person either believes the answer or puts the phone away. A dark translucent interface over a
live camera feed, in that light, is a decision nobody has tested.

## Answer these five. Nothing else.

**1. Attack the system above.** Where is it generic, where is it actually wrong for a dark
interface over a live camera in a bright shop, and what single change would make the largest
visual difference. Name the change and what it costs.

**2. The verdict moment.** This is the screen the whole product exists to produce and the only
one anybody will ever screenshot. Today it is a sheet that rises from the bottom with three
heights, carrying the face at 96px, the price at 72px, the verdict word at 34px, a neutral rail
with a dot placed in the verdict's hue, the cheapest seller marked, provenance in small mono
capitals, and a row of save, share, correct and thumbs. Compose it again in words: what the eye
lands on first, second and third, what dominates, what is allowed to be small, what is removed.
Make it a description precise enough that two different people would draw nearly the same thing.
Then do the same for the share card, which is the only part of this product that travels
without the app around it.

**3. Showing an unsure answer without looking broken or apologetic.** Read the accuracy numbers
above again. Roughly one answer in four is wrong, and on multipacks it is wrong more often than
right, always by returning the right brand and the wrong variant. A percentage means nothing to
a shopper. Judge the hue plus saturation rule on this evidence: does it work, and if not, what
carries uncertainty instead. Design what the user sees when the system has the brand right and
the variant possibly wrong, which is the single most common way this product fails.

**4. The face.** It is the product's identity and neither of you touched how it is drawn. Give
the drawing rules: line weight, eye construction, how a face stays legible at 28px in a list row
and still carries expression at 96px, how three personalities read as the same character, and
which of the thirteen states deserve a distinct face rather than a shared one. Name the drawn
characters whose construction you are borrowing from and the exact element you take.

**5. Delete something.** Name the two things in this product that should not exist, and say what
is lost by removing each.

## Rules for your answer

- One call on each question, not a menu of options. If you rejected an alternative, name it in a
  sentence and say why.
- Any colour you propose comes with a hex value and its contrast ratio against the surface it
  would sit on.
- Anything you borrow, name the real product or designer or illustrated character it comes from
  and the exact element you are taking. "Inspired by modern fintech" is not an answer.
- Do not restate WCAG or platform guidelines. Assume they are known and met.
- No tables of microcopy. Round one produced about a hundred strings and they are enough.
- If something cannot be built in a phone browser, say so instead of specifying it.
- Mark each answer as one you would bet on or one that is a guess.

Spend your length on questions 2 and 3.
