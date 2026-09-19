
# The gauge and verdict math, including tech variants

This section is the full breakdown of the arithmetic behind the coloured price line: how one
offer becomes one comparable number, why some offers are set aside instead of compared, how the
middle, the spread and the tick marks are worked out, and what changes for a product that is
identified by its specifications rather than by its size. The plain-goods version of this
arithmetic was already walked through once, briefly, in the barcode-to-verdict section as part of
a different step; every piece of it is restated here in full, because that is what the walkthrough
rules require of a repeated mechanism, and because the tech-variant version cannot be understood
as a difference from a version that is only half in view. Everything below was read directly from
the two files that hold this arithmetic and the file that is supposed to call them, during this
session, including running the test suite for both by hand rather than trusting a document that
said its state was unverified.

## Why this math cannot run on Shin's own server at all

A third network request to Gemini exists in the codebase, after the identification call and the
price-and-reviews call already covered elsewhere, that carries the raw prices Gemini just found,
the shelf price the shopper typed, and the shopper's own two personal thresholds, together with
the literal, runnable text of one function, and asks Gemini to execute that function inside its
own code-running sandbox and hand back only the numbers it produced.

Two separate versions of that one function exist side by side in the codebase: a Python version,
kept as one long fixed block of text, which is the literal thing sent to Gemini's code-running
tool, and a JavaScript twin of the same logic, kept only so the arithmetic can be proven correct
against invented numbers before it is ever trusted inside a live request. A comment directly above
the JavaScript twin says, in capital letters, that it must never be run on a real grounded price,
because doing so would be exactly the analysis the terms forbid; its only callers, by design, are
its own test file and a second test file that sweeps its output for forbidden wording. After
Gemini's reply comes back, the only check Shin performs on it is a whitespace-insensitive
comparison between the code text Gemini says it executed and the fixed Python text Shin sent. If
that comparison fails, there is no verdict at all: the screen shows the prices and reviews and
nothing else. There is no partial credit for a mismatch, on purpose, because an algorithm nobody
can prove ran is treated as an algorithm that did not run.

## Turning one offer into one number worth comparing

Before anything is compared, every offer, and the shelf item itself, is reduced through the same
steps:

1. **The effective price.** If an offer is written up as a multi-buy ("2 for $5"), its price for
   comparison is the total divided by the count, so 2 for $5 becomes $2.50 a unit. If it is a
   buy-one-get-one, the price for comparison is half the listed price. Anything else, including a
   clearance tag, is left at its listed price, deliberately: inventing a divisor for a promotion
   that was never actually parsed into a count would place a dot at a price nobody can really pay.
   The price shown beside the dot afterwards still carries the real till price in words, for
   example "2 for $5.00" or "(buy one get one)," so the label never claims a shopper pays the
   divided number at the register.
2. **The shared unit.** Every size is converted to one base unit for its kind: a mass to grams, a
   volume to millilitres, a count stays a count. The exact factors used are a kilogram as 1000
   grams, a pound as 453.59237 grams, an ounce as 28.349523125 grams, a litre as 1000 millilitres,
   and a US customary fluid ounce as 29.5735295625 millilitres. A pack count, when present,
   multiplies the base size, so a six-pack of 355 mL cans becomes 2130 mL before anything else
   happens to it. A pack count of exactly zero is treated the same as no pack count at all, on
   both sides of the network call, rather than being allowed to divide anything by zero.
3. **The unit price.** The effective price is divided by that converted size, scaled to a price
   per 100 grams or per 100 millilitres for mass and volume, or a plain price per item for a count
   good. This is the one number everything else in this section compares; nothing after this point
   ever looks at the original price or the original size again.

## Why an offer is left off the line instead of compared

Not every offer that comes back from a grounded search is comparable to the item on the shelf, and
the mechanism keeps every excluded offer on its own list with a fixed, factual reason attached,
rather than silently dropping it. The reasons are checked in a fixed order, and the first one that
applies wins, so that one offer always produces exactly one reason and the same offer always
produces the same one:

1. **Priced in a currency that is not Canadian dollars.** An absent currency field is read as CAD,
   because that is what the request asked for and because refusing every offer whose currency
   field a model happened to leave blank would throw away good data; an offer that states a
   different currency is taken at its word and excluded rather than converted. The reasoning
   written down for never converting: an exchange rate is a guess about a number the shopper would
   actually be charged, and Shin does not guess about money.
2. **Sold by a marketplace seller on a retailer's site, rather than by the retailer itself.**
3. **Requires a paid membership.** The reasoning given: a price that needs a membership the
   shopper may not have is not a price they can act on, and leaving it in the median would move
   the middle for every shopper, including the ones who cannot reach that price at all.
4. **A different store brand than the item on the shelf.** A store brand is recorded as a name
   (President's Choice, Great Value, Kirkland, and so on) rather than a plain yes-or-no flag,
   specifically so "is this the same store brand" can be answered; a name brand is treated as the
   absence of a store-brand name on both sides. The reasoning: one chain sells each store brand, so
   a President's Choice price is not a price for the thing in a shopper's hand unless the thing in
   their hand is also President's Choice.
5. **Organic when the shelf item is not, or the reverse.** Organic and non-organic versions of the
   same product are treated as two different products at two different prices, so mixing them
   would move the median for both.
6. **No usable size at all**, split into two distinct reasons rather than one: an offer that is
   sold by weight with nothing written down for how much weight (produce, deli, bulk items priced
   per kilogram at the till, where the shopper's own package is some unknown number of grams) gets
   its own reason from an offer that simply has no size field of any kind.
7. **Measured a different way than the item on the shelf** (a volume offer beside a shelf item sold
   by mass, or the reverse). Mass, volume and count never share one line, because a size in grams
   and a size in millilitres are not comparable quantities regardless of the numbers involved.

Each excluded offer keeps a plain-English note describing its reason, and that note is a fixed
function of the reason code alone, never of the offer's own text, specifically so the same note
can be translated once per reason rather than re-composed per offer. Every one of those notes is
swept, in both languages, against a separate list of words that are barred from describing a price
(words like "deal," which is why the field that records a multi-buy or a buy-one-get-one is never
named with that word in anything a shopper reads); this sweep is a real, running check, not a
stated intention, and it is one of the two checks whose evidence bar is described below.

## Finding the middle, the percent, the shape of the line, and the ticks

Once the excluded offers are set aside, the remaining unit prices go through the following steps,
in order, identically on both sides of the network call:

1. **The median** of the remaining unit prices: the middle value if there is an odd number of
   them, the average of the two middle values if there is an even number. The reasoning for a
   median over an average, quoted from the header of the file that holds this arithmetic, and
   traced further to the header of Shin's own separate pricing engine, which makes the same
   argument for its own, non-Gemini pricing path: an average of several sellers is a number that
   exists nowhere and that nobody can check against a shelf, where the cheapest real price at a
   real named seller is a number a shopper can actually go verify.
2. **The percent distance from the median**, for every remaining offer and separately for the
   shelf price itself: `(price - median) / median * 100`. If the median itself works out to
   exactly zero, every percent is fixed at zero rather than divided by zero, so that a giveaway or
   a scraped zero price collapses every point to the middle instead of producing an error or an
   infinite value that the two sides of the network call might report differently.
3. **The span**, which decides how zoomed in or out the whole line is: the largest of the single
   biggest percent-distance found among every remaining price, one and a half times the shopper's
   own "good" threshold, and one and a half times the shopper's own "bad" threshold, then rounded
   up to the next multiple of five. If every price is identical and both of the shopper's own
   thresholds are effectively zero, the span still floors out at five, because a span of zero would
   leave nothing to divide ticks into. A known and accepted side effect of this formula: one
   extreme unit price inflates the span for every other point on the same line, so a single
   outlier compresses the rest of the gauge toward the middle instead of being clipped or hidden.
   That is the formula exactly as specified, and the test suite for this arithmetic asserts that
   compression directly rather than smoothing it away.
4. **The position** of every percent on a 0-to-100 line: `50 + percent / span * 50`, which is why
   the median always sits at exactly the midpoint of the line regardless of how wide the span is.
5. **The two zone boundaries**: `50 - good_threshold / span * 50` for where the good zone ends, and
   `50 + bad_threshold / span * 50` for where the bad zone begins, using the shopper's own two
   percentages rather than any number Shin picks.
6. **The tick marks**, laid down every five percentage points if the span is thirty or less, every
   ten if it is wider, each one labelled "+10%," "-10%," or "middle" at exactly zero.
7. **The zone the shelf price itself falls into**: at or below the good threshold on the cheap
   side is one code, strictly above the bad threshold is a second code, and everything between is
   a third, neutral code.

The three codes returned for the shelf price's own zone, and everywhere else a zone is described
in this mechanism, are deliberately neutral placement words rather than any word that grades the
price: the values are literally "the price fell below the line you set," "the price fell above the
line you set," and "the price fell in between," never "good," "bad," or "reasonable." The reasoning
given directly in the code: the words on the zones are supposed to name the range the shopper
personally set, never Shin's own judgment of the price, and this is treated as required by Canadian
competition law rather than a matter of taste, specifically the Competition Act's bar on an
unmeasured performance claim (section 74.01(1)(b), as cited in the file's own header). A separate,
earlier version of this exact mechanism did return the literal words "good," "reasonable," and
"bad," and was reverted specifically because of that reasoning; a running test in the codebase
today fails the build if a grading word of that kind appears anywhere in what actually reaches a
screen, in either language. Turning the neutral code into a word a shopper reads is left to the
part of the app that draws the screen, not to this arithmetic.

The header comment for the whole mechanism states directly that determinism is a requirement of
this design, not a nicety: because the only proof Shin has that Gemini ran the intended code is a
text comparison, a function whose OUTPUT could differ between two calls on identical input while
its SOURCE TEXT still matched perfectly would let a wrong or shifting answer sail past that check
completely undetected. For that reason the fixed Python text avoids iterating over anything whose
order Python does not guarantee, uses no random numbers and no wall-clock time, and imports nothing
outside Python's own standard library, because Gemini's code-running sandbox installs nothing extra
and stops any run after thirty seconds regardless.

## Where this math is actually computed today, for ordinary size-scaled goods

The evidentiary flag already raised once for this exact mechanism, in the barcode-to-verdict
section, is restated here in full because it governs everything in this section, not only the step
it was first noticed on: **the written design says this arithmetic must only ever run inside
Gemini's own sandbox, resubmitted as described above, because Shin's own server computing a median
from a grounded price is the analysis the terms forbid. What was verified directly in the running
server code is different.** The function that turns a shelf item and a list of grounded offers
into the price line shown on screen calls the plain JavaScript twin of this arithmetic directly, on
Shin's own server, and does so unconditionally, every time a shopper's typed shelf price and a set
of grounded offers are turned into a price line. The third resubmission request, the one built
specifically so Gemini's sandbox does this work instead of Shin's server, exists in the codebase,
is fully covered by its own tests, and is never called from anywhere that a real shopper's scan
would reach. It functions today only as a side proof that Gemini would compute the same numbers if
it were ever actually asked to, which is a real and useful check, but it is not what produces the
number a shopper sees.

## What changes for a product identified by its specifications instead of its size

A phone, a laptop, a television, or anything else identified by a model number and a set of
technical specifications cannot be placed on a line by unit conversion, because there is no shared
unit underneath the comparison: 256 gigabytes of storage is not worth exactly twice 128 gigabytes
the way a 4-litre bottle is worth exactly four times a 1-litre one, and a 65-inch television panel
is not worth 65 divided by 55 of a 55-inch one. The written plan for this, approved directly by the
founder with a one-word reply of "ok," lays out six rules for this case specifically:

1. The line uses only offers of the exact same variant: the same model number and the same
   price-relevant specs (storage, memory, screen size, chip, and colour only when colour is priced
   differently).
2. Condition must also match: new, open-box, refurbished and used are kept apart as different
   products at the same model number, never blended onto one line.
3. Other variants of the same model are listed separately, each carrying the specification that
   differs and the price difference from the shelf item, for example "512 GB storage, plus $250,"
   and are never used to compute the verdict itself.
4. Similar products from other brands belong in a separate comparison section elsewhere in the
   app, never on this line.
5. Identification for this kind of product favours the barcode, since a box barcode usually pins
   the exact variant on its own; photo coaching for this kind of product is aimed at the box label
   or the spec sticker rather than the device itself, and if the specifications are still unclear
   after that, the plan calls for asking the shopper one direct question (for example, "128 GB or
   256 GB?") before the grounded search is even made.
6. Reviews are gathered once per model and shared across all of that model's variants, rather than
   fetched separately for each storage size or colour.

**A second, complete implementation of this exact mechanism has been built and tested, and it is
the file that this section exists specifically to explain.** It mirrors the ordinary size-scaled
version almost exactly, structurally, but compares raw prices instead of unit prices, because there
is no unit to divide by here. Its own header states this design choice directly: unit scaling is
the whole of the size-based version and it is meaningless for this case, so the comparison set is
narrowed by matching instead of normalised by conversion. Walked through in full:

1. Every offer is checked against the shelf item's model number first. A different model entirely
   is not something this mechanism is built to judge, but a grounded search can still return one
   by mistake, so it is set aside with a plain note reading "different model," rather than being
   guessed at or allowed to crash anything.
2. Among offers of the same model, an offer whose specifications and condition both match the
   shelf item exactly goes onto the comparison line.
3. An offer with the same specifications but a different condition is set aside into its own list,
   never placed on the line: the written reasoning is that a refurbished unit is a different
   product at the same model number.
4. An offer with even one differing specification is set aside into a third list, labelled with
   the specific specification that differs and the price difference from the shelf item, formatted
   as a plus or minus sign, a dollar sign, and the amount to two decimal places, for example "512
   GB storage, +$250.00." Where a specification exists on the shelf item's side but the offer
   simply never stated a value for it, the label reads "no" followed by that specification's name,
   rather than a blank or the word "undefined," so a shopper reading the list can tell "this one is
   512 GB" apart from "this one did not say." A differing specification takes priority over a
   differing condition when both are true at once: the reasoning given is that the item on the
   shelf is already a different box at that point, and the condition becomes just one more fact
   carried alongside it rather than a reason to split the entry a second way.
5. If no offer at all matches the shelf item's exact model, specifications and condition, there is
   no median to take and so no verdict line at all, on purpose: the written comment for this case
   says the separate lists are still useful ("nobody else has this one, here is what they do have")
   in a way that a verdict built on a different variant entirely would not be.
6. From whatever offers remain on the line, the median, the percent-from-median for every remaining
   offer and for the shelf price, the span, the position, the two zone boundaries and the tick
   marks are computed by the identical formulas already given in full above, over these raw prices
   instead of unit prices. The three zone codes are the same neutral, non-grading codes, for the
   same legal reasoning already given above.

Exactly like the size-scaled version, this mechanism exists as two matched implementations: a fixed
block of Python text meant to be handed to Gemini's code-running tool and executed there unchanged,
and a JavaScript twin carrying an identical warning never to be run on a real grounded price,
existing only to prove the algorithm correct against invented numbers before it is trusted. A
whitespace-insensitive text comparison between the two is the only proof available that a real
sandbox run matches the intended function, exactly mirroring the size-scaled version's own check.

This mechanism has its own, already-closed history of the exact determinism failure the header
warns about in the abstract. An earlier version built the label describing a differing
specification by combining two unordered collections of specification names, and Python's own
per-process salting of string hashing means iterating an unordered collection of strings does not
walk them in the same order twice, even within the same program. A defect record closed on the
same day this file was last touched describes the consequence directly: two calls for the same
product could have produced two different labels while both still passed the after-the-fact text
comparison, because that comparison can only prove the source text matched, never what the code
actually computed when it ran. The exact words used to describe why that matters: "a verdict that
changes between identical calls is worse than no verdict, because it looks like a measurement."
The fix, verified as present in the file read this session, was to build both the JavaScript and
the Python versions of the label from a sorted list of specification names on both sides, so the
two texts, and the two runs, cannot disagree with each other or with themselves.

**Both of the tests just described as "closed" and "fixed" were re-run directly in this session,
along with every other test written against this mechanism and its size-scaled sibling: twenty
seven tests, zero failures.** This replaces what a planning document elsewhere in the repository
had recorded as an open, unverified question about whether this code even passes its own tests.

## What is missing is not the arithmetic. It is anything that ever calls it.

This is the finding this section exists specifically to resolve, and it was checked by tracing
every place a scanned item and a set of grounded offers turn into a shown price line, not assumed
from the fact that the file compiles or that its own tests pass.

**Nothing anywhere in the running server ever decides that a scanned item is the specification-
matched kind of product rather than the size-scaled kind, and nothing routes a request to the
specification-matched arithmetic as a result.** The object that carries a price question from the
shopper's phone through the server and into the function that builds the price line has no field
recording a category, a product kind, or whether the item is identified by specs rather than by
size, at any point along that path: not in the object the phone's own request is shaped as, not in
the object the interface between the server and its price-lookup component declares, and not in
the object the price-line function itself accepts. A direct search of the source for any call to
the specification-matched arithmetic's own function, anywhere outside its own test file, found
none. The only two things that ever call it are its own test file and the file that sweeps its
output for barred grading words. This was not a case of the mechanism being wired up incorrectly;
it is not wired up at all.

The specification-matched file's own header states plainly, as an internal design rule: "Which of
the two algorithms runs is the caller's decision, from the category, never guessed here." **That
sentence is itself now a rule-versus-code disagreement, distinct from the plan-versus-code
disagreement already raised for the size-scaled version above: the rule says a caller decides:
there is no caller that decides anything of the kind anywhere in the code that was read.** The
sentence describes an intended shape for a decision that, as far as this session could verify by
reading the whole path from phone to price line, has never been built on either end: not the
upstream step that would look at a scanned item and label it as one kind or the other, and not a
downstream branch that would act on that label if it existed.

The upstream half of that missing decision is also confirmed, separately, as not built. A planning
document describing the identification pipeline exhaustively marks the very field that this
routing decision would depend on, whether a photographed item is a specification-matched product,
as "Buildable," the document's own label for a planned but not-yet-built piece of work, alongside
the model-number and specification fields that a photo of such a product would need to read off its
box. So the gap is not only that nothing reads a category flag to decide which arithmetic to run;
nothing upstream of that decision currently produces a category flag at all, for a photo-identified
item. This is labelled plainly here as **planned and not built**, matching the document's own
label rather than resolving it either optimistically or pessimistically.

**What actually happens today, verified directly, when a specification-matched product such as a
phone reaches the price step, is that the size-scaled arithmetic runs on it anyway, because that is
the only arithmetic anything ever calls.** The function that builds the price line tries the
size-scaled arithmetic first using whatever size fields the scanned item carries. A specification-
matched product ordinarily carries no mass, volume or count size at all, so this first attempt
finds nothing usable and fails immediately. The function's own second attempt, meant for a scanned
item with no known size of its own, borrows the size most of the grounded offers happen to share
and retries; a specification-matched product's grounded offers likewise ordinarily carry no size
fields either, so this second attempt finds no offers to borrow a size from and also fails. The
function's third and final attempt treats the shelf item and every offer alike as exactly one
plain, unlabelled item, with no size at all, and reruns the size-scaled median-and-percent
arithmetic on the raw prices at that point. Nothing in that third attempt reads the model number,
the specifications, or the condition fields the price request already carries for every offer, even
though those fields are collected in every single price request Gemini answers, tech item or not,
because the request text asking for prices always asks for a model number, specs and condition
alongside the rest. Those three fields are copied out of Gemini's reply into the object the rest of
the server works with, and then never read again by anything else in the running code.

**This is stated here as a direct contradiction between the written rule and the running code, not
as a silently accepted gap.** The written plan states, in its own words: "The verdict line uses
only offers of the exact same variant: same model number and the same price-relevant specs... and
condition must match: new, open-box, refurbished and used are separate." What the running code does
today, for exactly the case that rule is written for, is compare every offer's raw price against
every other offer's raw price as though each were one interchangeable unlabelled item, regardless
of its model number, its specifications, or its condition, the moment the size-scaled arithmetic's
first two attempts fail to find a size to work from, which for a specification-matched product is
every single time. A 128 gigabyte, new condition phone from one retailer and a 256 gigabyte,
refurbished phone of a different model entirely, if both happened to be returned as offers for the
same search, would today be placed on the same line, at the same footing, with no separation and no
note explaining that they are not the same product. Whether this is the intended interim behaviour
until the missing routing is built, or a defect that should instead refuse to show a verdict at all
for a specification-matched item until that routing exists (the same "no proof, no verdict" posture
already used for a failed code-match), is an open decision this section does not resolve, because
nothing read during this session settled it either way.

## A second, smaller open item found while reading the two files side by side

The size-scaled file normalises text before comparing it in more than one place: a store brand
name and a currency code are both trimmed of surrounding whitespace and folded to one case before
being compared, specifically so "PC" written two different ways, or a currency code in a different
case, still match. The specification-matched file does not do this anywhere: a model number is
compared with plain, case-sensitive, whitespace-sensitive equality, and so is every individual
specification value. Two retailers describing the identical phone with a model number that differs
only in capitalisation, spacing, or a stray symbol, which is a realistic way for two different
grounded search results to describe the same real product, would be read by this mechanism as two
different models entirely, with one of them set aside under the "different model" note rather than
compared. Nothing read during this session says whether this stricter matching for model numbers
and specification values, compared to the looser matching already used elsewhere in the sibling
file for brand names and currency codes, is a deliberate choice or an oversight; it is left here as
an open item rather than resolved either way.
