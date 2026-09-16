# Catalogue serving and search

This is how a live scan or a typed search actually gets turned into a matched
product, a "nothing like this" answer, or a suggestion of something nearby.
Everything below was checked directly against the running code and, where a
number is quoted, against the actual catalogue file loaded on this machine
today (five million one hundred eighty two thousand five hundred ninety one
products, six hundred eighteen thousand three hundred sixty five of them
marked as sold in Canada, and seven hundred eighteen thousand six hundred
sixty two carrying a stored embedding), not from a plan alone.

## Two doors into the catalogue, because one door cannot serve both

The database engine the catalogue is built on answers every query on the
same thread that asked it: nothing else can run while it works. That is fine
for an instant lookup and dangerous for a slow one, because a slow search on
that thread would freeze every other request the same process is holding,
including someone else's barcode. Measured directly: a barcode lookup costs
about a fifth of a millisecond. A typed text search costs twenty four to a
hundred thirteen milliseconds. A single nearest-neighbour search over the
stored embeddings, back when only six percent of the catalogue had one,
already cost seven hundred thirty five milliseconds, and a full scan of
today's larger embedded set would run into multiple seconds.

So the app opens the catalogue twice, on purpose:

1. A barcode lookup runs on the app's own request thread, against its own
   read-only connection to the file. It never joins a queue behind anything
   slower, because the whole point of it is that it cannot afford to.
2. Every other kind of query, typed text, a photo's guess at a name, a
   "what else is there" list, is handed to a second process (a worker
   thread) that owns its own separate connection to the same file. Each
   request to it gets a numbered ticket; replies can come back in a
   different order than they were asked, and whichever ticket a reply
   carries is matched back to whoever is waiting on it.

A five second ceiling sits on every ticket sent to that second process. This
was written about in three separate comments in the app's own request
handler for over a week before anything actually enforced it: the comments
promised the limit, and nothing set a timer, so a worker that stopped
answering (a stuck lock, a crashed embedding step, a lost reply) would leave
the request waiting forever rather than failing loudly. That has since been
fixed: a real timer now runs on every ticket, and a late reply that arrives
after the timer fires is thrown away rather than resolving anything. Five
seconds is not a performance budget, it is the line the comments already
drew between "slow" and "gone": a normal text search measured twenty four to
a hundred thirteen milliseconds, nowhere near it.

## What happens to a scanned barcode

A barcode is treated as fact rather than a guess, so it never goes through
ranking at all. The lookup tries several different digit strings for the
same physical code, because two different systems can print the same
product two different ways: the plain digits as read, the same code padded
out to the longer standard length, the same code with its own leading zero
stripped, and, when the shape allows it, the two shortened eight digit forms
some small packages print instead of the full code and the full length
version that expands back out of one of those short forms. All of these are
tried as alternate spellings of one lookup, not as five separate searches,
so a barcode read correctly by the camera but recorded under a different one
of these spellings in the catalogue still resolves on the first try.

## What happens to a typed or transcribed search

A search never runs as one query. It runs as up to two separate retrievals
that get merged together afterward.

**The word half.** The words are split apart, lower-cased, and every one of
them is required to appear, as a first attempt, joined together with "and."
If that strict pass turns up fewer than five results, a second, looser pass
is run instead, joined with "or," so a word the catalogue simply does not
use for that product does not sink the whole search. Measured directly
against the loaded catalogue: requiring every word is between seven and
thirty times faster than allowing any word, on nine different real queries,
and it returned the identical top answer on every one of those nine that
returned anything at all. The two it returned nothing for, a request naming
a product by a slightly different phrase than the catalogue's own name for
it, are exactly the cases the looser fallback exists to catch, and it is
cheap enough that keeping it costs almost nothing.

**The meaning half, when it runs at all.** Separately, the same words can be
turned into a numeric fingerprint (an embedding) and compared against a
stored fingerprint on every product, to catch a request that means the same
thing without using the same words, most importantly a French phrase
reaching a product whose catalogue name is only recorded in English. This
half of the search is switched off whenever the number of products actually
carrying a stored fingerprint is large enough that scanning all of them
would take too long: comparing one query against every stored fingerprint
was measured at under three microseconds a row, which sounds trivial until
it is multiplied by hundreds of thousands of rows on every single search.
The cutoff written into the running server is ninety thousand embedded
rows; past that point the meaning half is switched off automatically unless
someone explicitly forces it on, and the word half runs alone. On this
machine, right now, seven hundred eighteen thousand six hundred sixty two
rows carry a fingerprint, nearly eight times that cutoff, and nothing in the
deployment's own configuration overrides the default, so the meaning half of
the search is off in the running app today. See the section below on
embeddings for the measurements behind that choice and for a place where the
written plan and the running code plainly disagree.

**Combining the two.** When both halves run, they are merged by a
position-only method (each side's own ranked list contributes a score to
every product based only on how high it placed, sixty divided by sixty plus
its rank position on that side, added across both sides), rather than by
trying to put the two halves' raw scores on one scale. That choice was
deliberate: one side's scoring is unbounded and depends on how big and how
skewed the underlying word counts are, the other side's is a bounded
similarity number, and any fixed weight for blending the two would have
quietly gone stale as the catalogue grew. Reading only rank position never
goes stale that way.

**Two boosts on top of the merged order, and the history behind both.**

- A product is worth one and a half times its merged score if it is judged
  to be the same *kind* of thing the request seems to be asking for (see
  "neighbour rings" below for how that kind is chosen). This was added
  because, without it, "peanut butter" ranked a peanut butter cup and two
  snack bars above the actual jar, and "wireless headphones" ranked a
  lavalier microphone, a mislabelled row, and a game controller above two
  real headphone rows that were sitting lower in both individual lists.
- A product sold in Canada is worth one and a quarter times its merged
  score over an otherwise identical one that is not. This exact rule was
  tried twice before and failed twice, both silently: first as a tiebreak
  only used when two products scored exactly equal (which almost never
  happens once two ranked lists are merged), and then as a discount applied
  to every non-Canadian row uniformly, which does nothing at all whenever
  an entire pool of candidates carries the same flag, which is every
  electronics search, because every electronics row in this catalogue comes
  from the same single foreign-market supplier feed. The boost only started
  actually doing something once it had the "same kind of thing" boost above
  to separate candidates into contention first.

**A separate, absolute rule that sits above both boosts.** If the request
itself named a specific brand and a specific size (the kind of detail a
model reading a label would supply, not something a person typing a plain
search usually gives), a product agreeing with both of those facts is placed
in a tier above every product that does not, no matter how any of the
scores above compare. This exists because a boost, however large, is still
a number another boost can outweigh, and the rule that a brand-and-size
match must win is meant to be absolute: measured on the live catalogue, a
specific package pinned by its brand and its printed size was landing
outside the visible results entirely, behind an identically-named sibling
product in a different size, because nothing about the wording could tell
the two apart and only the pinned size could. A size that merely
disagrees with the request is never punished for it the same way agreement
is rewarded, because printed pack sizes are inconsistent (a "four pack of
one hundred grams" is sometimes recorded as one hundred grams and sometimes
as the true four hundred gram total), and a first version of this rule that
punished disagreement demoted two genuinely correct answers for exactly that
reason.

**Removing duplicates.** The same physical product sometimes appears more
than once in the underlying data, either because the same barcode was
published in two different digit formats, or because the same named product
was entered more than once with no distinguishing brand or size at all. Both
are collapsed into one entry before the results are shown, keeping whichever
copy ranked best. Size is deliberately part of what decides "the same
product" here: the same jar in two different sizes is treated as two
different products and two different prices on purpose, since that
distinction is the entire reason the app exists.

## Deciding how confident the catalogue is

Every search ends by labelling itself confident, ambiguous, or a miss, and a
top answer is returned in the first two of those three cases (a miss returns
no candidate at all). The label is decided in a fixed order:

1. If a similarity score exists for the leading result and it falls below a
   fixed floor, and that same result was not also the strongest word match,
   the whole search is called a miss. The floor is only ever applied to a
   product that actually has a similarity score to compare: three quarters
   of the electronics side of the catalogue has no stored fingerprint at
   all, and an earlier version of this rule treated "no score" the same as
   "a score of zero," which silently failed every one of those rows
   regardless of how well the words actually matched.
2. If only some, not all, of the request's words were present in a single
   result (the loose "or" fallback fired), the search is called ambiguous no
   matter how well the leading result otherwise agrees with a pinned brand
   or size. This exists because, before it was added, a search narrowed to
   groceries answered "kraft dinner original macaroni" with a jar of peanut
   butter that happened to share the brand and one of the words, and called
   it confident.
3. If the request pinned neither a brand nor a size the leading result
   agrees with, the search is ambiguous.
4. If the request pinned a brand or size and the leading result contradicts
   one of them, the search is ambiguous.
5. If any other result in the list agrees with the pinned facts at least as
   well as the leader does, the search is ambiguous, because that is two
   products a person still has to choose between, whatever their raw scores
   happen to be.
6. Otherwise, confident.

## When there is no confident answer: neighbour rings

Whenever the answer is not confident, the response also carries a small
list of related products drawn from one shelf of the catalogue's own
category tree, so the screen never has to make a second round trip to have
something to show.

That shelf is chosen by a short, deliberately narrow walk: look at the exact
category the leading (or, on a miss, the best available) product sits in;
if too few other products share that exact category, or none at all, step
out exactly one level to its parent category and try again; and go no
further than that. A category tag has to hold at least one other product
besides the one being answered about, and no more than fifteen hundred
products in total, to count as a usable ring; more than that is treated as
a whole shelf of the store rather than "a kind of thing." A widened "one
step out" ring is always marked as looser than an exact-category ring, so a
screen showing "here are other Gala apples" and one showing "here is a
Honeycrisp because there were no other Gala apples" are never presented as
the same strength of claim.

This exact two-step limit replaced an earlier version that kept climbing
past a too-large category, any number of levels, until it found something
small enough, with no floor on how unrelated the resulting shelf could be.
That version once treated "whole grains," a label describing thousands of
unrelated products, as a legitimate ring, and offered tortilla chips as a
substitute for a completely different snack that merely happened to share
that same broad label somewhere in its path. The current version can no
longer climb past one step, so that particular failure is now structurally
impossible rather than merely unlikely. A handful of trailing labels in the
stored data (a generic "groceries" marker, and labels that just name which
of five underlying source databases a row came from) are stripped before
this walk even starts, because otherwise a real, well-matched category one
step up would be mistaken for the generic label sitting at the very end of
the path, and a genuinely exact match would be announced as a looser one.

One category in the price engine's own vocabulary, secondhand goods, has
literally no signal anywhere in this catalogue's data: nothing in it is
tagged as used or new. A ring, or a routing narrowing (below), can never
land on that category from this catalogue's own data, which is expected
rather than a defect; secondhand pricing is understood to be answered from
elsewhere.

## What happens to a genuine miss

A search that finds nothing is recorded to a small, separate log kept apart
from the catalogue's own file, specifically so that the record of a miss
never depends on a connection that is deliberately opened without
permission to write (the connection serving live requests is read-only on
purpose, so a request can never corrupt the multi-gigabyte catalogue file).
Repeated misses for the same barcode or the same normalised search text are
rolled into one entry with a running count rather than one row per event,
so a person deciding what to add next reads "asked for one hundred times"
once rather than a hundred separate lines. This mechanism is written to
never throw an error itself: a search that found nothing must still answer
the person cleanly, and a search that additionally failed to write that
miss down must answer exactly as cleanly, with the failure only counted
internally rather than shown.

Checked live, this log currently holds ninety four distinct findings. Most
of the highest-count entries read as test traffic rather than real shopper
misses, including one search text that is literally a made-up nonsense
phrase built to guarantee a miss, alongside a small number of plausible real
gaps such as a search for a laptop charger by name and a search for the
word "mixer" (already named above as a case where a stray electronics
result can rank above the drink mixers a grocery-minded search actually
meant).

**Direct contradiction, verified in the code.** The written plan states
plainly that a miss records the barcode as a catalogue gap. Reading the
actual request handler that answers a barcode scan: when a barcode is not
found and no accompanying text exists to fall back to, the handler builds
its own miss answer directly and returns it, right next to a comment reading
"a gap, not a camera failure," without ever calling the function that writes
to the miss log. That log is only ever written to from inside the search
step itself, and the search step is never reached on this exact path. A
scan is still written to the app's general per-scan record either way (that
mechanism belongs to the recording and logging part of this walkthrough),
so the event is not entirely unrecorded anywhere. But the specific list a
person actually reads to decide what to add to the catalogue next will
never show a barcode that was scanned with nothing else to go on, which,
for a plain barcode reader with no label photo, is very plausibly the most
common shape a real miss takes.

**A second, separate contradiction in the same area.** The written plan also
states, as its own numbered decision, that when the catalogue's own copy of
the data misses, the app should reach out to a live upstream source before
declaring the miss final, on the stated reasoning that staleness in the
catalogue's own copy is the app's own problem to solve rather than the
shopper's. Nothing found anywhere in the catalogue's own code, or in the
server code that calls it, makes any live network request to any upstream
product database at the moment a search comes back empty. The only thing
that happens on a miss, in every path checked, is the local write to the
small miss log described above. Whether this live-lookup step was
deliberately deferred, replaced in intent by the separate, planned
Gemini-based identification path covered elsewhere in this walkthrough, or
simply not yet built, is not settled by anything read for this section.

## Narrowing the search to what someone probably wants

Separately from any single request, each device's recent scanning history
can be used to guess a broad shopping habit and narrow, or skip narrowing,
the search:

- A person's own answer at setup counts as three votes for one habit.
- Each thing they have actually scanned counts as one vote for whichever
  habit it belonged to, and older scans count for less: each vote is worth
  half of the previous one every six more recent scans, so a long recent run
  of a different habit eventually outweighs a stale setup answer, while one
  stray scan does not flip anything.
- If the strongest habit does not carry at least sixty percent of the
  weighted vote, nothing is narrowed at all, and the search runs against
  everything. Both of these numbers (six scans, sixty percent) are stated
  in the code as judgement calls rather than as anything measured.

**The rule this narrowing is built to obey, and the two ways it once broke
it anyway.** The rule, written directly into the module that does the
narrowing: a habit-based guess about the *person* is allowed to reorder or
shrink what gets searched, but it is never allowed to decide what a
*product* actually is. A prior that let itself decide identity would tell a
shopper holding a laptop that it is groceries, purely because groceries is
what that shopper usually buys, which is the exact failure the whole system
is built to avoid. In practice this was first built expecting to be a speed
optimisation and measured, on this catalogue, to be nothing of the kind: the
underlying database always scans by matching words first regardless of any
narrowing, so narrowing the *result* saves no work at all, and narrowing the
underlying *query* by source database can actually make some searches
slower, because it can starve the strict "every word" pass and tip a search
into the far more expensive "any word" fallback (one nine-word measured
case went from fifty five milliseconds unrestricted to six hundred
twenty two milliseconds restricted). What narrowing is actually kept for,
honestly, is relevance rather than speed: the vast majority of this
catalogue is electronics, and a narrow grocery-shaped word can otherwise
fill an entire results window with the wrong kind of thing entirely.

Three safety rules are enforced directly in the narrowing code rather than
left as intentions: a barcode request is never narrowed, because a barcode
is exact and narrowing can only turn a correct answer into a miss; a
narrowed search that finds nothing useful falls back to searching
everything rather than reporting a miss it never actually checked for; and
any answer that did come from a narrowed search has its reported confidence
multiplied down (by fifteen percent) rather than up, on the reasoning that
finding something despite narrowing is not proof the narrowing itself was
correct.

**"Useful," specifically, was tightened after a real failure.** The
fallback used to trigger only when narrowing returned a completely empty
list. That let a *bad* narrowed answer straight through: under a
groceries-narrowed search, a request for "macbook pro" came back with a
protein drink, and a request for "wireless mouse" came back with a small
toy, both reported as confident narrowed hits carrying only the standard
fifteen percent penalty, because one incidental word in each request
happened to be a real grocery word. The fix reused a signal the search
already computes for free: whether every one of the request's words matched
together in the same result, or only some of them did. A narrowed search
that only partially matched now also triggers the whole-catalogue fallback,
even when it technically returned something.

**Confirmed wired into the running app**, not just present as a library:
this narrowing is invoked from three separate places before a search
actually runs, the barcode-and-catalogue answer a device sees on a scan, the
person-facing "what else did you mean" search, and the search a photo-based
identification attempt runs internally, and all three apply the identical
downgrade: a result that would otherwise read as fully confident is
downgraded to ambiguous whenever it came from a search that was actually
narrowed and did not fall back to everything.

**Open, unresolved by anything read.** The maximum number of results the
narrowing code is willing to filter from is a constant copied by hand into
the narrowing module from the underlying search module's own internal
retrieval depth, because the search module does not expose that number for
anything else to read directly. The comment beside the copy says as much:
it has to be kept in step by hand. If the underlying retrieval depth is ever
changed in one place and not the other, the narrowing would silently start
filtering from a pool it thinks is one size while the search behind it is
actually a different size, and nothing would announce the mismatch.

## Two different things that both get called "category" here, and must not be confused

The catalogue's code uses the word category for two entirely separate
mechanisms serving two entirely separate purposes, and keeping them apart is
one of its own explicitly stated rules.

**The first is the shopper-habit guess described above**, used only to
decide which slice of the catalogue to search first. It never claims to
know what a specific scanned product actually is.

**The second is a completely different, later step that decides what price
rule applies to a product once it has actually been matched.** This step
looks at which of the underlying source databases the matched product came
from, together with its own stored category tags, and maps that onto one of
five kinds the pricing engine understands. It is written to return "we don't
know" rather than guess whenever the mapping is not confident, because
mapping a product to the wrong pricing rule is treated as worse than
refusing to price it at all. Some of its rules are stated as deliberately
provisional rather than settled: pet food and personal-care products are
currently priced under the same rule as ordinary packaged groceries, on the
stated reasoning that both are barcoded, shelf-stocked, and discounted on
similar weekly cycles, with the code itself naming the exact condition that
would reverse that choice, namely a real measured price pattern showing
either behaving unlike groceries. That condition has not been checked one
way or the other by anything read for this section, and is carried forward
here as an open question rather than a settled fact.

One further consequence of counting real numbers rather than trusting a
label: a very large single-supplier data source folds in in its own mixed
sections covering things like domestic appliances, hobby goods, and
personal care alongside its dominant computer and electronics content, and
only the specific sections that are genuinely bought and price-compared the
way the pricing engine assumes (several sellers, the same model number) are
mapped to a price rule at all; everything else in that source, including
whole sections numbering in the tens of thousands of rows such as toys and
lighting, is deliberately left unmapped rather than assigned by a guess.

## Filling in categories nobody supplied

A large share of the grocery-side catalogue, historically measured at
roughly three quarters, arrived from its original source with no category
tag at all, which would otherwise mean no neighbour ring and no
habit-narrowing signal for most of it. A separate, offline step exists to
fill this in before the catalogue is ever served, and it does so
deliberately without ever touching a live similarity search over every
individual product, because that was tried first and measured to cost
about six hours for the full catalogue: reading every stored fingerprint
against every other one is far too slow to do product by product, so the
fix instead collapses every already-labelled category into one averaged
direction (a centroid) first, and compares each unlabelled product against
a few thousand of those averaged directions instead of against thirty
thousand individual products.

Two guard numbers decide whether an unlabelled product is actually assigned
a category or left alone: how close it has to sit to the nearest averaged
direction at all, and how far ahead that nearest direction has to be over
the second-closest one before the assignment is trusted. Both numbers were
tuned by measuring against products whose real category was already known
and deliberately withheld from the averaging step, then checking how often
each setting was actually right versus how many confident wrongs it would
have shipped; the setting kept is the one that assigns fewer products in
exchange for a much lower wrong-answer rate, on the explicit reasoning that
a wrong category (a shampoo shown as "other yoghurts") is worse than no
category. When two candidate categories are too close to call apart but
both happen to sit on the same branch of the category tree at different
depths, the product is given the shared, broader label they agree on rather
than nothing at all, which is what let the catalogue answer "here are other
citrus fruits" for a specific citrus fruit it did not otherwise stock.

Every category filled in this way is explicitly marked as inferred rather
than declared, in its own separate stored field, so that nothing downstream
can present a computer's best guess about what a product is as though it
were a fact the original data actually stated.

## Cheaper alternatives

Once a product and an asking price are known, the same category walk used
for neighbour rings is reused to find up to three genuinely cheaper
products of the same kind, at a seller whose price is actually on record.
This is stated in the plan, and matched exactly in the code, as deliberately
not a similarity search: asking a fingerprint-based search for "things like
this" was tried and rejected, because the nearest matches by meaning
routinely include the very same product in a different size, an unrelated
product from the same brand's wider line, and products that merely share
similar packaging language, none of which is something a shopper could
actually buy instead.

A candidate alternative has to come from the same underlying source
database as the original (so a pet treat is never offered as a cheaper
substitute for a human snack sharing the same generic shelf tag), has to be
sold in Canada, and its stored size, when both products have one, has to sit
within a factor of four of the original's size, so a large multi-pack is
never held up as a cheaper option next to a single small unit. Up to sixty
candidates are pulled and considered per request. When both products have a
usable, matching-unit size, the comparison is done on price per hundred
grams or per hundred millilitres, which is treated as the honest comparison;
when either side has no usable size at all, which the code states is true
for the large majority of the catalogue, the comparison falls back to the
plain price on the tag instead, and the resulting sentence explicitly says
sizes may differ rather than hiding that weakness. Anything saving less than
five percent is not shown at all.

Allergen differences between the original and each alternative are always
printed, never used to silently filter the list, on the stated reasoning
that quietly hiding an alternative because it adds an allergen would help
nobody and would be invisible to exactly the person trying to avoid it. The
comparison itself only runs when both products have a genuinely readable
allergen list; an empty list on either side is treated as "never checked"
rather than "confirmed to have none," because the underlying source data has
no way to distinguish those two cases, and a small number of stored
allergen entries turn out to be entire warning paragraphs rather than a
short list of names (one runs to a full sentence about shared manufacturing
equipment); anything longer than forty eight characters is treated as
unreadable and drops that whole side of the comparison to "not recorded"
rather than being displayed as though it were a real named allergen.

Where a price came from is named as one of three honest cases depending on
how the price was actually matched to the product: a real named store and
city, when the price was matched by barcode and a store was successfully
resolved; the plain name of the seller, only for a short, explicitly
approved list of sellers a shopper could actually walk into or order from
directly (currently a single named Canadian retailer); or, for everything
else, an explicit "a store that reported this price" rather than the
internal name of whichever price-donation database it actually came from.
That third case exists specifically because an earlier version of this
logic printed the internal name of a price-sharing database directly as
though it were a shop a person could visit.

Every one of these sentences is also produced a second way, as a plain code
name plus the raw numbers and facts behind it, entirely separate from the
finished English sentence, specifically so that a French-reading shopper
can have the sentence rendered in French from the same underlying facts
rather than reading English words rendered under a French label. The two
are kept from silently drifting apart by a test that renders the coded
version back into English and checks it comes out identical to the English
sentence, for every case the code can produce.

## Embeddings: whether the meaning half of search is actually running

Two different ways of turning text into a numeric fingerprint are supported
behind one shared interface, chosen automatically by whether an external
service's access key is present in the environment: a fully local model that
needs no network connection and no account, used by default, and a paid
external service used only when a key for it is explicitly configured. Both
are asked to produce the identical number of dimensions specifically so the
stored data does not have to change shape if the choice is ever switched,
though switching still means recomputing every stored fingerprint from
scratch, since fingerprints from two different underlying models compared
against each other produce confident nonsense with no error raised anywhere
to say so. The local model is explicitly documented as needing its query
text and its stored-product text marked differently before being encoded,
because the specific model family in use was trained that way and silently
returns worse results, with no error, if that marking is dropped.

The written plan calls for this meaning-based half of search to run
together with the plain word search, fused, as one of its stated decisions,
and describes it as "the largest reversal" among all of its catalogue
decisions, having previously been word search alone. Several dedicated
internal measurement scripts exist purely to test whether that reversal is
actually earning its cost, and their own printed verdicts, run against this
catalogue's real bilingual products rather than any hand-picked examples,
are consistently unfavourable: one run measured forty real French search
phrases against products whose catalogue name is written in English, and
found the word-only search alone answered thirty of them correctly in its
top results while the combined, fingerprint-assisted search answered only
twenty five, at five and a half times the time cost, rescuing zero cases the
word search could not already find and actively losing five that it could.
A second, more careful version of the same measurement (correcting for a
flaw in the first, where the population being compared for each side was
not even the same size) reached the same printed conclusion: leave the
meaning-based half off, and do not spend the additional engineering cost of
a faster version of it, on the evidence gathered so far.

**Direct contradiction, verified in the code and confirmed live on this
machine today.** The written plan states, as a numbered decision, that
search runs as hybrid retrieval, full text and embeddings, fused. The
running server code switches the meaning-based half off automatically once
more than ninety thousand products carry a stored fingerprint, with no
override set in this deployment's own configuration, and this catalogue
currently has seven hundred eighteen thousand six hundred sixty two, nearly
eight times that cutoff. So, as actually deployed right now, search runs on
the word half alone. The internal measurements above suggest this is
probably the right call on the evidence gathered, and the code's own
comments say plainly that the plan's decision is "not dead, only unpaid,"
naming a specific remaining measurement (whether a product held only in
English can still be found by a French query, when the word index has no
way to see that English text at all under the language actually asked in)
that has not yet been run. Both the stated decision and the deployed
behaviour are true statements about this system at once, and this is
flagged rather than resolved either way.
