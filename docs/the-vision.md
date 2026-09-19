# The vision: what Shin's backend is for

Rewritten 2026-09-06 after his critique of the first version. Every improvement is judged
against this page. Where this page and any other document disagree, his words quoted here win.
Every number carries where it came from (list at the end); every call that is his is marked
unset until he makes it.

## His purpose, which this page serves

His words, 2026-09-04: *"the purpose of all of this is to create an app that is useful to the
user, easy to use, and visually appealling. All improvements made now and in the future should
center around these three things."*

His words, 2026-09-06: the app exists to *"create something that users will want and become
reliant on and to make money."*

Those are the judges. This page says what the backend has to be for them to come true, and how
each is measured. Visually appealing is judged in the app as he opens it; the avatar is *"one of
our most important features"* (his words, 2026-09-03), and the backend's part in it is feeding
the face, the verdict card and the coaching line the data they need in the time they need it.

## One sentence

Point the phone at anything, and Shin ends the decision you were standing in:
buy it, walk, or here is the cheaper one and where. 

## The numbers

Each goal gets a figure that can be read off the system without asking anyone. Where a figure is
self-reported, it says so and is never used as a rate for everyone.

**Want**
- Installs, and installs per video once each video carries its own link. Nothing measures this
  today.
- Return: the share of installs that scan again in their second week. Nothing measures this
  today; the scan record exists and has no reader.

**Reliance**
- Answer rate: the share of scans that return a verdict, per kind of thing, per week. Today the
  price data answers for 3 products when the person names their store.
- Scans per returning person per week.
- Corrections per hundred verdicts, as a downward signal.
- Decision outcome (bought, walked, bought the alternative) is tapped by whoever chooses to tap
  it. That is a biased sample: reported as a sentence about those people, never as a rate.

**Money**
- Downloads, payers per hundred downloads, and what each payer leaves after the store's cut and
  the model bill. The price, the free allowance and the paywall shape are unset and his; nothing
  on this page assumes them. (The $20 and the ten free scans that appeared in earlier answers were
  a what-if inside one of his questions, not a decision.)

## Principles

### 1. Always answer; the confidence carries the doubt

His words, 2026-09-05: *"The worst thing this app can do is tell people it doesn't know because
that literally wastes the users time."* And on the accuracy-first posture the first plan
invented on its own: *"You also created your own rules and said that accuracy is the most
important thing. When in reality, its not and it impeeds so much of our design."*

Every answer says what it rests on.

Not yet known: whether removing the thresholds on 2026-09-05 changed anything. Coverage on the
seven pilot items was 2 of 7 before and after, and seven items cannot tell "supply is the cap"
apart from "seven is too few to see a threshold". Settled by re-running the 438 priced products
with the old gates on and off.

### 2. OLMA's pipeline as the base, with the barcode and the catalogue in front

His words, 2026-09-05: *"I believe almost everything olma did is correct except they didn't
integrate our barcode and cateloge system."* A competitor already shipping this is validation.
What is ours: a barcode read on every preview frame for free, and the corrections and history
that OLMA does not keep.

His tier design as he stated it (2026-09-05) is the standing design until he changes it, with
his note: *"The specifics of this system are very open to changes, anything can be changed if
there appears to be a better option for something."*

- Basic: search the catalogue freely, plus three image searches a week. Guidance to frame the
  object, automatic crop, a weaker model to identify, catalogue lookup, average price and
  alternatives; if not found, similar items and the offer of pro.
- Pro: catalogue search, and if the catalogue misses, an online model search.

Proposals, not decisions: things that are about money and could sit in pro (the history and the
outcomes ledger, a watch on a price, where to buy the alternative, estimates when nobody has a
price). The trade-off to state plainly: the verdict is most of the value; giving it away is what
freemium does, and the measured data has hard paywalls converting five times better per trial
(10.7% against 2.1%) while freemium reaches far more people. His call, with those two facts
beside it.

### 3. Anything, with a path per kind

Shin is "scan anything". The four kinds in the code today (grocery, tech, used, produce) each
declare how the thing is identified (barcode, photo, text), where its prices come from, and what
the verdict compares against (this week's promotion; other retailers; sold listings). A kind with
no path is a gap to fill, not a category to exclude. Grocery had a free catalogue first; that is
the only reason it led, and no cost, conversion or marketing figure is taken from grocery alone.
The share of scans that need a photo is unmeasured for every kind; measure per kind before
costing anything on it.

### 4. Supply is the engine, and every scan feeds it

The data today: 896 prices collected, 23 fresh with a product code, 3 products answerable
in-store; the catalogue is 4.97 million electronics rows against 122 thousand grocery rows.

His policy, 2026-09-05, which the privacy wording must state: *"we will collect all of a users'
scanned data, and all of it will be used to both train our models and also to answer other
people (of course there has to be systems in place for this because people might report
incorrect prices)."*

So every scan is a harvest: the shelf tag in the photo, the price the person types, the receipt
later; all of it pooled to answer others, with the systems against wrong reports: a photographed
tag outweighs a typed number; a price far outside the known range is held, not published; a
person carries a reliability score from how often their prices were later confirmed; once
strangers can type, one report never moves a verdict alone. Then the crawl keeps fresh what
people actually scan (the scan record decides what is re-priced next), the second retailer whose
reader is built and hand-verified goes into the crawl, and a bought feed is wired in the day it
pays for itself. Sources sit in trust order and can be swapped without the app noticing.

### 5. Answer before they search

His words, 2026-09-05: *"we should aggresively design systems that provide the user with the
answer before they need to search with the llms... if we know a user primarily shops for a
certain item based on a survey done at the setup of the app and from their past shopping
history, then we know something is more likely."*

So: a setup survey and the scan history give each person and each store a prior. The phone
carries a small offline pack of what this person is likely to scan; his constraint, 2026-09-05:
*"this is a phone app and having multiple gbs of data is impossible"*, so the full catalogue
stays on the server and the pack stays small. The pack answers barcodes with the network off.
Collective data narrows the candidate set before any model runs. Meaning search is not retired:
one negative test on one query shape does not retire a mechanism (his words, 2026-09-05), and
the four query shapes that matter have not been run.

### 6. Every model call is designed for credits

His ask, 2026-09-05: *"consider how llms are going to be prompted. What is the most efficient
way to prompt to save the most credits. Which llms? Is it possible to save context?"* The
barcode path costs nothing. A photo costs one call: the cheapest model first and a stronger one
only when it comes back unsure; the crop is the label, not the scene (image tokens fall about
four-fold from the current crop, derived from the published formula); the prompt is short and
fixed so it can be cached where the platform's minimum allows, which it does not at the free
tier's current prompt size; the output is a short fixed structure. Measured so far: nothing,
because no key exists in this environment. The first fifty real calls settle the cost per scan.

### 7. Use makes it better, and the history is carried

The mechanism that makes a tool impossible to leave: after months it knows things about you that
you could not rebuild by hand. Every correction changes the next verdict on that product (wired
2026-09-05). A person's history (scans, saves, corrections, outcomes) lives under an id that
survives a reinstall (keychain and keystore on the phone apps) and moves to a new phone. That is
the person's copy for their own use; the data itself is pooled, per principle 4.

### 8. Failure is loud; success is measured before it is claimed

Every answer states what it rests on. A wrong answer is correctable in one tap and the
correction shows next time. Our failures never count against a person's allowance. The ledger of
outcomes and dollars exists so a savings claim can be measured before it is published, which the
Competition Act's adequate-and-proper-testing requirement demands.

### 9. Every answer is a moment someone can share, once the name is cleared

His words, 2026-09-06: *"our main marketing is going to be through short form video content."*
The backend renders each verdict as a card with the product, the price, the face, and a link
that opens the app on that product; each video carries its own link so installs are counted per
video. Gate: no video, handle or listing under a name that has not passed the trademark search.
Planning figure until measured: 0.1% to 0.3% of views become installs, derived from two
self-reported cases and one store-page benchmark, not from any app's real number.

### 10. Fast enough that using it is not a decision

Under a second, on the phone. Today's figures are laptop figures: a barcode in about a
millisecond and a text search in about twenty against 5.18 million rows on a local database. On
a phone everything outside the pack is a network round trip; the target is met on the phone or
not at all.

## How work gets in

His words, 2026-09-04: *"the cheapest thing in the current world is producing iterations because
I'm vibecoding... Its actually faster to just build the product than to perform all these
tests."* And: *"Every decision should not worry about build cost but instead should focus on
what will produce the best result for creating the best user experience."*

So: build it, measure it in the app as he opens it, keep it or kill it. Every pass ships or kills
something; a killed idea comes back on new evidence, never a new opinion. A change says which of
his three criteria it serves and which number above it moves. No gate sits in front of a build.

## Order, by what cannot be taken back

1. Spent once, before anything is public: the name cleared; the privacy wording in his policy;
   the first price anchor (unset, his).
2. The instruments, because nothing above is measured today: per-video links and install counts;
   return rate from the scan record; answer rate per kind; the outcomes tap.
3. Supply, because the answer rate is three products.
4. The photo path live with a model key: the entire paid product, and the whole used-goods and
   produce path.
5. The anti-fake systems, before strangers can type prices.
6. The pack and the priors.
7. Somewhere to run with an encrypted address, because a phone will not open its camera without
   one.

## Decided elsewhere and still standing

Camera guidance shipped, uncommitted. Corrections reach the next verdict. Alternatives are built
and reachable, capped by how many categories hold two priced products (143 of 438). The store
name and date ride on the alternative row. Distance and the maps tap wait for a per-store feed
someone has checked against a shelf (his re-issued ask, 2026-09-05). Nearby means the phone's own
maps app; OpenStreetMap's store list may be kept, Google's may not. Never print "in stock" or
"cheaper 1.2 km away" without a per-store feed. Identity is paid for once and a price forever,
so the catalogue stays free until a paid one is the cheapest path to a kind with no path; no
vendor's terms yet confirm that a looked-up identity may be kept.

## Where the numbers come from

- 896 prices, 23 fresh with a code, 3 products, 143 of 438, 4.97 million and 122 thousand rows:
  counted from the live databases on 2026-09-05 and 06.
- 2 of 7: the pilot corpus run on 2026-09-05.
- Hard paywall 10.7% against freemium 2.1% trial-to-paid, and half of paid conversions on the
  first day: RevenueCat's 2026 report. Correlations across apps, not levers.
- Image tokens: Anthropic's published formula; per-token prices: Anthropic's published rates. No
  call has been made from this environment.
- 0.1% to 0.3% installs per view: derived, two self-reported cases plus a store-page benchmark.
- Yuka, for scale only and a different category: 80 million users, 85 scans a second, 6.35
  million euros of 2024 revenue, from their press kit and filed accounts; "under 1% paying" is my
  division of revenue by price.
