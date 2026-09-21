# Round four prompt, 2026-09-20 (rewritten)

Paste the block below into a **brand new conversation** with each model (ChatGPT, Gemini, DeepSeek,
Grok). No earlier messages in the thread, no uploaded files, no reference to any previous round.

Two things changed from the first version of this round, on his instruction 2026-09-20: *"regenerate
a new prompt that doesn't assume the ais have context ... we should be giving them some more
information. Furthermore, the ais tend to create the most efficient answer possible, so create
constraints that make sure they give high quality answers."*

1. **It assumes nothing.** The model is told what the product is, who uses it, where, how well the
   machine works, what it costs to run, what the browser can do, what the neighbours in this
   category do, and what nobody knows. It is still told nothing about how any of it currently looks.
2. **It is built against the cheapest acceptable answer.** A numbered inventory of 34 moments that
   must all be covered, a per moment contract of six items plus a text sketch, a ban on compression
   phrases and on ranges, a rule that the failure cases are written before the happy path, an
   instruction to break the answer into parts rather than shorten it, and a self audit at the end.

Every number in the brief below is measured or sourced, and each one is labelled where it came from,
because a model that is given a made up number designs for a product that does not exist.

Numbers used, and where they come from: the 200 photograph run of 2026-09-16 in
`identify/eval/results/2026-09-16.json` (top1 148, by kind, by confidence band, p50 3568ms, p95
4834ms, max 7280ms, three guesses right 141 of 196, the pick step right 124 of 140); per scan cost
$0.008 to $0.040 from `pages/shin-walkthrough.html` stage 09; the placeholder plan prices from
`app/public/js/onboarding-strings.js`; the 3 MiB photo cap from `app/server.ts`; the 1200ms minimum
between captures from `app/public/js/screens/camera.js`; the 30 day recovery window from
`app/src/store.js`; the category figures from `pages/shin-walkthrough.html` stage 09.

---

You are designing a phone app. All of it, from nothing.

There is no existing design to match, no style guide, no component library and no brand deck. You
will not be shown any and there is no point asking, because nothing that exists is worth keeping.
Every visible decision is yours, including the order things happen in.

Read the whole brief before you write anything. It is long because you are being given what a
designer joining this project would be given on day one, minus anything about how it currently
looks.

# Part one: the brief

## 1. What the product is

It is called Shin. A person standing in a shop points their phone at something on the shelf. The app
works out what the product is, finds what that product costs elsewhere, and tells them whether the
price in front of them is fair.

That is the entire product. Everything else in it exists to serve that one act or to make the person
come back and do it again.

It is a web page running in a phone browser. Not a native app, not an App Store download.

## 2. The person, the place, the moment

They are standing in a supermarket aisle, a hardware shop or a pharmacy. One hand is holding the
product or the trolley, so the app is used with one thumb. Overhead light is bright, the phone
screen is often dimmed. There may be a shop assistant two metres away.

They have three to five seconds of attention before they either believe the answer or put the phone
away.

The person this is built for is a window shopper, not a buyer. The intended pattern is four to ten
scans a week and almost nothing bought. That is the target the product is designed against, not a
measurement of real users, because there are not enough real users yet to measure.

Most of them will arrive from a short video. The hook that brings them is "scan anything", which
means the first thing they do after installing is try to break it on something ridiculous.

## 3. How well the machine actually works

This is measured, on 200 real photographs, on 2026-09-16. It is the only accuracy data that exists.

- **148 of 200 correct.** Roughly three in four.
- By kind: ordinary single products 68 of 90. Two sizes of the same thing 42 of 54. Shop own brands
  16 of 18. Electronics 15 of 20. **Multipacks 7 of 18.**
- Every multipack miss came back with the right brand and the wrong variant: flaked tuna when it was
  chunk, one chocolate bar for its neighbour, the wrong size of the same crisps. **Right brand,
  wrong variant is the signature failure of this product.**
- The system rates its own confidence. Of 160 answers it called high confidence, 137 were right. Of
  15 it called medium, 8 were right. Of 24 it called low, **3 were right.** So the confidence signal
  is real and coarse: high is worth trusting, low is worth almost nothing.
- When it is wrong, the right answer is often still in its top three guesses. Across 196 scans the
  correct product was somewhere in the first three guesses 141 times. When it was asked to pick one
  from a shortlist it picked correctly 124 times out of 140.
- **Timing, measured: half of all answers took 3.6 seconds, nineteen in twenty landed inside 4.9
  seconds, and the slowest took 7.3 seconds.** The person is standing up holding a product for all
  of it.
- There is a hard floor of 1.2 seconds between two captures, and a photo over 3 MiB is rejected
  before it is sent.

## 4. What the answer is today, and what you may change

Today the answer is one of three judgements, plus a refusal. Take it, about right, walk away, or I
will not call this one. You may change that shape. If you do, say what you changed and what it costs.

**Refusing is a result, not an error.** Sometimes there is not enough evidence to judge a price and
the honest answer is no answer. There are several different reasons a refusal happens and they are
not interchangeable: the thing is in a category the product does not cover, the thing was not
identified at all, the thing was identified but not confidently, there is not enough price evidence
behind it, the machine that answers is temporarily unavailable, or the person is going too fast and
is being asked to wait. A person who gets one refusal and a shrug does not come back, so refusals
are some of the most important moments in this product.

## 5. The one rule the product cannot break

**No number appears that the product cannot say the source of.** No estimated prices, no
illustrative figures, no "typically around". If a price is shown, where it came from and when it was
seen are shown with it. If there is not enough evidence, that is a refusal.

This is not a preference, it is the thing the product is. Design accordingly, including designing
what evidence looks like when a person has three seconds.

## 6. The money problem, which is unsolved and is yours

Every answer costs real money to produce: roughly $0.008 to $0.040 per scan, derived from published
rates rather than measured. The user this is built for scans a lot and buys nothing, so cost rises
before revenue does.

What exists today: **nothing.** No payment system, no accounts, no subscription, no limit on how
much anyone uses it. A previous attempt put a plan screen into the setup flow offering $39.99 billed
annually or $12.99 a month. Nothing is behind those numbers, nothing is charged, nothing is checked,
and nobody defended the prices. Treat them as evidence that this decision was avoided, not as a
starting point.

What the neighbours do, as recorded in this project's own notes from public reporting: one
calorie-counting app built on the same one-photo act reached roughly $50 million a year on a
subscription behind a free first experience. One food-scanning app went to 80 million users and
monetised depth instead of the core act. One long-running price tracker is funded entirely by
commission when a watched item is bought, and is free to everyone. One competitor in this exact
category meters scans, showing a remaining count in the camera, which caps the window shopper who is
this product's best user.

**Design the moment this product asks for money.** Choose what triggers it, what is being sold, what
it costs, what happens to someone who says no, and what they still get. Justify the number against
the per scan cost above.

## 7. There are no accounts

Nobody signs in. There is no password, no profile, no sync, no server-side history. Everything a
person keeps lives in one browser on one phone, and clearing the browser loses all of it. Removed
items can be recovered for 30 days and then they are gone.

If your design needs an account, say exactly what it unlocks, where you would ask for it, and what
you would lose by asking.

**Nothing watches a price over time.** A kept item is a record of what was true at the moment it was
scanned, not an alert. If you want the product to tell someone a price moved, say what has to exist
for that to be honest.

## 8. The character

The product is named after a character. It is the thing that delivers the verdict, and it speaks in
one of three voices the person can choose: deadpan, warm, or blunt. The voice changes the words and
never the number or the judgement.

You are not being shown the character and you are not being asked to draw it. Decide where a
character belongs in your design, where it has to get out of the way, and what it does at the exact
moment it has to tell someone something they do not want to hear. If you think a character is the
wrong idea, say so in two sentences, then design as though it exists, because it does.

## 9. What the browser can and cannot do

Everything you specify has to be buildable in HTML, CSS and JavaScript in a phone browser. In
particular: a live camera stream can run behind the interface; the operating system's own share
sheet can be opened; the page can be installed to the home screen; the screen can be kept awake.
There is no App Store review prompt, no native picker, no native modal sheet, and vibration is
unavailable on iPhone. Verify anything you are unsure of rather than specifying it and hoping.

Text has to survive the person's own text size setting, and the same sentence can be a third longer
in French than in English, because both languages ship. Nothing may depend on a word fitting a
space.

## 10. What nobody knows

State what you assume about each of these instead of treating your assumption as fact.

- Whether people are comfortable holding a phone up to a shelf with a shop assistant watching.
- Whether sound is usable in a shop.
- Whether the person is checking one thing or working down a list.
- Whether they come back the same day, the same week, or after a month.
- What a fair limit would be, if there is one at all.

# Part two: what to deliver

Nine things, in this order. Do not restate the brief, do not summarise it, do not write an
introduction.

**1. The premise.** One sentence naming the single idea everything else obeys. Not a summary of what
you are about to do. One sentence, and every later decision has to be traceable to it.

**2. The ten second story.** What a person who has used this once would say it is like. Three
sentences maximum, in their words, not yours.

**3. The failure cases, written first.** Before you design a single happy moment, design these four:
a refusal, an answer where the brand is right and the variant is uncertain, an answer that takes
seven seconds, and the case where the product has three guesses and needs the person to choose.
Designs that start at the happy path never leave it, which is why these come first.

**4. The path.** First time ever, from the video to an answer, as an ordered list of what they see
and what they do, with the taps counted. Then the tenth time, same format, same count. Say what
happens before the camera and what has no business being there.

**5. Every moment in the inventory below, specified.** All 34. Numbered.

**6. The interruptions, with three extra answers each.** These are moments 27 to 34 below. For each
one also answer: what earns the right to interrupt, how many times it may appear before it never
appears again, and what it looks like the second time compared with the first.

**7. The system, last.** Now that the moments exist, write the colour, type, spacing and motion
rules that fell out of them. Last, not first, because a system written first is a decision nobody
made.

**8. What you rejected.** The direction you seriously considered and threw away, in enough detail
that I can see what I am not getting, and why you threw it away.

**9. The self audit.** Four answers. The three most generic things in your own draft, what you
replaced them with. The three weakest claims you made. Every assumption you made where the brief
gave you nothing. And the one decision in this design that would be wrong in any other app.

# Part three: the inventory

All 34. If your design deletes one, it still appears under its number with one line saying why it
does not exist.

1. The first time it is ever opened, by someone who arrived from a video.
2. Asking for the camera.
3. The camera being refused, and the whole product from then on.
4. Agreeing to what the app collects.
5. Choosing the voice.
6. Saying what counts as a good price to this person, if you decide to ask at all.
7. The camera, open, aimed at nothing.
8. A barcode found.
9. No barcode, so this is a photograph.
10. A dark aisle.
11. The photograph being taken.
12. Waiting, in the ordinary case of three and a half seconds.
13. Waiting, in the case where it is taking seven.
14. Three guesses, and the person has to choose.
15. Typing the price off the shelf tag.
16. A good price.
17. A bad price.
18. A price that is neither.
19. Right brand, wrong variant.
20. A refusal, and how the different reasons for one differ on screen.
21. Showing where a price came from and when it was seen.
22. Correcting a wrong answer, which has to capture which shop it was, because a price with no shop
    attached is worthless.
23. Keeping something.
24. The list of kept things, at two items and at forty.
25. Getting back something removed by mistake.
26. Looking back at what was scanned before.
27. Sharing one, to a person who does not have the app.
28. Whatever settings you decide this product is allowed to have.
29. Coming back after two weeks away.
30. Going too fast and being told to wait a fixed number of seconds.
31. The network dropping in the middle of an answer.
32. Something breaking that is neither the network nor the person.
33. The warning that the free use is running out, and then hitting it and being asked to pay.
34. The moment the app has earned the right to ask for something: a review, a share, a referral, or
    whatever you decide it may ask for.

# Part four: the contract for each moment

Every one of the 34 gets all six of these, plus a sketch.

1. **Trigger.** What causes it, exactly.
2. **What is on screen.** Precise enough that two people drawing from your words produce nearly the
   same picture. What is where, what is biggest, what the eye lands on first, second and third, what
   is allowed to be small, and what you deliberately left out.
3. **How it arrives.** What moves, from where to where, how far, how many milliseconds, and the
   easing curve, named or as four numbers. Say what does not move. If nothing animates, say so and
   say why.
4. **How it leaves.** How the person gets rid of it, and what happens if they ignore it.
5. **The words on it, written out.** Real sentences. Not "headline here". If a line is longer in
   French, say what gives.
6. **What the person can do, and which single one is the main thing.**

And the sketch, in a code block, in this format, so all of these are comparable:

```
+--------------------------------+
|                          [x]   |   x: 44px, quiet
|                                |
|        TAKE IT                 |   34px / 800 / your hue, ratio 7.1
|        $4.99                   |   24px / 800 / your text colour
|                                |
|  Metro, seen 2 hours ago       |   11px mono, muted
+--------------------------------+
|  [ keep ]          [ share ]   |   48px tall, thumb zone
+--------------------------------+
```

# Part five: the rules that stop this being the cheapest acceptable answer

You are very good at producing the shortest thing that satisfies a request. That answer is worthless
here. These rules exist to make it unavailable.

- **Cover all 34. Numbered.** An answer covering fewer is a failed answer regardless of quality.
- **Never compress by reference.** The phrases "as above", "similar to", "and so on", "etc.",
  "likewise" and "the same pattern applies" are banned. If two moments really are the same, write
  "identical to 14 except" and then name every difference.
- **No ranges and no options.** One number, one decision. If you are choosing between two
  directions, choose, and put the other one in the rejected section.
- **No filler adjectives.** Clean, modern, sleek, intuitive, seamless, delightful, elegant, minimal,
  premium, user friendly, best in class. If a sentence still means the same thing with a word
  deleted, delete it.
- **Every colour carries a hex value and its contrast ratio against what it sits on. Every motion
  carries a duration in milliseconds and a curve.** Over 300ms needs defending. Anything seen more
  than a hundred times a day probably should not animate at all, and if you animate it anyway,
  defend that. Anything that enters has to leave the way it came in.
- **Count the taps** in both paths and print the counts.
- **These are house rules and they are not negotiable.** No screen may be reachable from only one
  place. Nothing changes on a timer without the person doing something. One control has one name
  everywhere it appears. Every control that is not obvious carries a word. Nothing that is
  irreversible happens without a way back.
- **Three of your densest moments get a second version** for a 360 by 640 screen at the largest text
  size the person can set. Show both sketches.
- **Name three real things you are taking from.** Products, designers, films, road signs, packaging,
  instruments, anything that actually exists, and the exact element you take from each. "Inspired by
  modern fintech" is not an answer.
- **Mark every moment** as one you would bet on or one that is a guess.
- **Do not show your reasoning process. Do not ask me clarifying questions before starting.** State
  the assumption and design.
- **If you run out of room, stop at a moment boundary and write CONTINUED.** I will tell you to
  continue. Shortening, summarising or skipping ahead to fit is the one thing I will not accept.
- **The falsifier.** If your answer could be pasted into a different shopping app by changing the
  name, you designed nothing. Before you send, read it back and find the parts that would survive
  that paste, and replace them.

Spend your length on part three of the deliverables, the failure cases, and on the interruptions.
There is no length limit. This is the only round.
