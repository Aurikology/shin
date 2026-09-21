# Round four prompt, 2026-09-20

Paste the block below into a **brand new conversation** with each model (ChatGPT, Gemini, DeepSeek,
Grok). No earlier messages in the thread, no uploaded files, no reference to any previous round.
The whole point of this round is that the model has never seen this app.

Why this round exists: rounds one to three all handed the models the app's current screens, its
palette, its type and its component list, and then asked what to change. Every answer that came back
was a critique of what already exists, in the shape of what already exists. His words, 2026-09-20:
*"This whole time, i wanted the ais to completely redesign each screen without prior knowledge of
what our screens look like ... the flow of the app and the look of the app are all things that are
not refined and look terrible. The ais purpose is to create inspiration for that."*

So this prompt contains **no visual information about Shin whatsoever**. No colours, no typefaces,
no sizes, no layouts, no component names, no screen list, no mention of how the character is drawn,
no mention of the current onboarding. Only what the product does, who uses it, where, what is
economically true, what the browser can do, and what nobody knows yet. Everything visible is the
model's to invent, including the flow itself.

---

You are designing a phone app from nothing.

There is no existing design. No style guide, no component library, no brand deck, no screens to
match. You will not be shown any, and there is no point asking, because nothing that exists is worth
preserving. Every visible decision in this product is yours.

## What the product does

A person is standing in a shop holding something. They want to know one thing: is this price good.

They point their phone at the product. The app works out what the product is, finds what that
product costs elsewhere, and tells them whether the price in front of them is fair. That is the
whole product.

## Where it is used

A supermarket aisle, a hardware shop, a pharmacy. One hand, because the other one is holding the
product or a trolley. Bright overhead light, phone brightness often turned down. Three to five
seconds of attention before the person either believes the answer or puts the phone away. The person
is mostly not going to buy the thing: the main user scans four to ten things a week and buys almost
none of them.

## Facts you have to design around

**It is a web page in a phone browser.** Not a native app. No system sheets, no native pickers, no
App Store review prompt, no reliable haptics, no notifications unless the person grants them. A live
camera stream can run behind the interface. Everything you specify has to be buildable in HTML, CSS
and JavaScript.

**It is right about three times in four.** Measured on 200 real photographs: 148 correct. Multipacks
were 7 of 18, and every multipack miss came back with the right brand and the wrong variant: flaked
tuna when it was chunk, one chocolate bar for its neighbour, the wrong size of the same crisps. Of
the 160 answers the system called high confidence, 137 were right. Of the 24 it called low
confidence, 3 were right. So its own confidence signal is real but coarse, and the single most
common way it fails is right brand, wrong variant.

**Refusing is a normal result, not an error.** Often there is not enough evidence to call a price and
the honest answer is no answer. This happens often enough that a refusal has to be a result a person
respects, not a failure screen they dismiss.

**The person types the shelf price themselves.** There is no reading of the price tag. That is
several seconds of typing digits, standing up, one handed, in the middle of the flow.

**Every answer costs real money to produce.** Roughly $0.008 to $0.040 per scan, derived from
published rates. Free and unlimited forever is not a business. **No price has been chosen, no limit
has been chosen, and no plan exists.** The moment this product asks for money is yours to design
from scratch, including what triggers it.

**There is a character.** The app is named after it, and it is the thing that delivers the verdict,
in a voice with a personality. You are not being shown it and you are not being asked to draw it.
Decide where a character belongs in your design and where it has to stay out of the way. If you
think a character is the wrong idea, say so in two sentences, then design as though it exists,
because it does.

**There are no accounts.** Nobody logs in, nothing syncs, there is no password and no profile.
Everything a person keeps lives on that one phone in that one browser, and clearing the browser
loses it. Design around that, including whatever you decide the money moment is, because there is no
account to attach a subscription to unless you introduce one and say what it costs the person.

**Nothing watches a price over time.** A kept item is a record of what was true when they scanned
it, not an alert. If you want the product to tell someone a price moved, say so and say what has to
exist for that to be honest.

**The person can say what counts as a good price to them.** A threshold, a percentage, a figure,
whatever shape you give it. Decide whether that is worth asking for, when, and what the answer looks
like once it exists.

**Two languages ship, English and French.** The same sentence can be a third longer in one of them,
so nothing may depend on a word fitting a space.

## What nobody knows yet

Say what you assume about each of these, rather than treating your assumption as a fact.

- Whether people are comfortable holding a phone up to a shelf in front of a shop assistant.
- Whether sound is usable in a shop.
- What the free limit should be, if there is one at all.
- Whether the person is checking one thing or working down a list.
- Whether they come back the same day, the same week, or after a month.

## What I want from you

**A flow and a look I could not have got from any other model.**

Not a critique, not a checklist, not an accessibility audit. A design. The flow and the look are
both yours, and the flow is the part I care about most, because the current one is bad and the
reason it is bad is that nobody designed it, it accumulated.

Deliver these six things, in this order.

**1. The premise.** One sentence naming the single idea the whole design follows from. Not a summary.
One sentence, and everything after it has to obey it.

**2. The path.** The person opens this for the first time and gets to an answer. Then the tenth time.
Write both paths as an ordered list of what they see and what they do, and count the taps. Decide
what happens before the camera and what has no business being there.

**3. Every moment, specified.** A moment is any distinct thing a person can be looking at. Cover the
whole product: deciding what to point at, the camera, reading the thing, the several seconds of
waiting, typing the price, the answer arriving in each of its flavours (a good price, a bad price, a
borderline one, a refusal, and the frequent case where the brand is right and the variant is
uncertain), the case where the app has more than one guess and needs the person to pick between
them, correcting a wrong answer, which has to name the shop it was seen in because a price with no
shop attached is worthless, keeping something to look at later, the list of kept things, getting
back something removed by mistake, looking back at what you scanned before, sharing one, choosing
which voice the character speaks in, agreeing to what the app collects, and whatever settings you
decide the product is allowed to have. It also has to work in a badly lit aisle, so decide what the
person does about that. If your design invents moments that are not in that list, specify those too.

**4. The interruptions.** The moments nobody asked for. This is the part that decides whether an app
feels deliberate or cheap, and it is the part I am most interested in.

At minimum: the very first time it is opened, the camera permission request and the state after it
is refused, the moment the person hits whatever limit you designed and is asked to pay, the warning
before that moment, coming back after two weeks away, the network dropping mid answer, an answer
taking longer than it should, a scan being refused, being told to wait a fixed number of seconds
before scanning again because they went too fast, something breaking in a way that is nobody's
fault and is not the network, and the moment the app has earned the right to ask the person for
something, whether that is a review, a share, a referral or something else you decide it may ask
for.

For each of these, give the full specification below **plus three extra things**: what earns the
right to interrupt, how many times it may appear before it never appears again, and what it looks
like the second time compared to the first.

**5. The system, last.** Only now, after the moments exist, write down the colour, type, spacing and
motion rules that fell out of them. It comes last because a system is a consequence of decisions, and
when it comes first it is a decision nobody made.

**6. What you rejected.** The direction you seriously considered and threw away, in enough detail
that I can see what I am not getting, and the reason you threw it away.

## The specification every moment needs

1. What triggers it.
2. What is on screen, described precisely enough that two people drawing from your words would
   produce nearly the same picture. What is where, what is biggest, what the eye lands on first,
   second and third, what is allowed to be small, and what you deliberately left out.
3. How it arrives. What moves, from where to where, how far, how many milliseconds, and which
   easing curve, named or as four numbers. Say what does not move. If nothing animates, say that and
   say why.
4. How it leaves, how the person gets rid of it, and what happens if they ignore it.
5. The words on it, written out. Real sentences, not "headline goes here".
6. What the person can do from it, and which single one is the main thing.

## The one thing I will judge you on

Everything you write competes with what a language model produces by default, which is the
statistical centre of every interface it has ever seen. That centre has a look and I can name it:
Inter or a near copy as the typeface nobody chose, a purple to indigo gradient, three rounded
rectangles in a row with soft shadows, thin line icons that would suit any product, a blurred
translucent panel over a photo, a headline built like "Smart shopping, made simple", an empty state
with a friendly illustration of an open box, a full width rounded button pinned to the bottom, and a
settings screen that is a stack of identical grey rows with chevrons on the right.

If any of that appears in your answer, you did not decide anything, you defaulted.

The opposite of it is not "more minimal". Minimal is exactly where that centre lives. The opposite is
a design where I can point at any part and you can say why it is that way, and why it could not be
that way in a different app.

Name three real things you are taking from: products, designers, films, books, road signs,
packaging, instruments, anything physical or digital that actually exists, and the exact element you
are taking from each. "Inspired by modern fintech" is not an answer.

## Rules

- Do not ask what the app looks like today. Nothing is being matched.
- No lettered subheadings, no "A. Purpose of the screen" template. That shape produces the average
  answer every time.
- Every colour comes with a hex value and its contrast ratio against whatever it sits on.
- Every motion comes with a duration in milliseconds and a curve. Over 300ms needs defending.
  Anything a person sees a hundred times a day probably should not animate at all, and if you animate
  it anyway, defend that.
- Anything that enters has to leave the way it came in.
- Do not show your reasoning process.
- No em dashes.
- Mark every part of the answer as one you would bet on or one that is a guess.
- Before you send, find the three most generic things in your own answer, replace them, and tell me
  what the three were.

Spend your length on the path and the interruptions. There is no length limit and this is the only
round.
