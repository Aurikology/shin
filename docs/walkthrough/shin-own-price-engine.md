# Shin's own price engine and sources

This is the half of pricing that never asks any AI model anything. It is a set of small
programs that read retailer websites and one public price feed directly, a person's own typed
reading of a shelf tag, one running table that remembers every price any of them ever reported,
and a last plain-arithmetic step that turns whatever is sitting in that table into a tier: good,
fair, or high. Nothing described in this section makes a network call to any model, saves a
model's answer, or asks a model to compute anything. Every fact below was checked directly this
session, either by reading the actual program text or by opening the real database file sitting
on this machine and counting what is in it right now.

## Where a price can come from

There are five things that can put a number into Shin's own table today, and one more that
looks like a price but deliberately never becomes one.

**1. Walmart Canada, read the same way a shopper's own browser would read it.** This crawler does
not use Walmart's search at all. It used to, and that leg was removed on a direct reading of
Walmart's own published crawling rules, which forbid any automated visitor from requesting a
search results page. Two different jobs read Walmart pages today:

- The everyday job asks again about every Walmart product this crawler has already priced
  before, reading that list back out of its own price history, never out of a product catalogue.
- A separate discovery job finds products this crawler has never priced at all, by walking
  Walmart's own published master list of its product pages, a file Walmart's rules explicitly
  say automated readers may use, unlike search. That list cannot be asked "which page has barcode
  X"; it can only be read from one end to the other, opening each page in turn and reading the
  barcode printed on it. Measured directly against the live file: it names roughly 217,660 of
  Walmart's own products across five pieces, and reading through all of them at the one safe
  request rate below works out to about 10.8 days of continuous single-track reading. That number
  is written into the program as a ceiling on a walk nobody should actually run start to finish,
  not as a plan, because most of what is in that master list (a poster, a toddler's shirt, an
  area rug) is nothing this app prices anyway. A second, far larger list covering everything sold
  by outside sellers through Walmart's marketplace exists too, at roughly 83 million entries, and
  reading all of it at the same safe rate is measured at about eleven years; the discovery job
  never reads that list unless someone explicitly asks it to.
- Every page opened, in either job, is one ordinary web request with a normal browser's identity
  attached and nothing else, no login, no key. The page hands back its own price, its brand, its
  name, a unit price it has already worked out itself, whether it is currently in stock, and its
  own barcode, all sitting as one block of structured data embedded directly in the page.
- The safe request rate, one request every three seconds from a single reader, is not a guess. It
  was learned by being wrong once: three readers going at once, faster, were locked out inside
  about forty requests, while one reader at the slower rate ran twenty requests cleanly with no
  block at all. A block does not come back as an error; it comes back as an ordinary-looking page
  a fraction of the normal size, with none of the real data embedded in it, so a real answer and a
  blocked one are told apart by size, and a blocked reader is made to wait progressively longer,
  with every reader pausing together once any one of them is blocked, since the block applies to
  the whole address, not to whichever reader tripped it.
- Every Walmart price is recorded as being quoted before sales tax, and when the current price is
  a sale, the shelf price it is discounted from is kept too, as its own separate reading, so the
  discount is never the only number left on record.

**2. Canadian Tire, read through the same private data service the storefront's own page calls
to fill itself in**, rather than by reading the rendered page, which was checked directly and
found to carry no product data of its own anywhere in it. Two things about this seller make its
crawler shaped differently from Walmart's:

- Every request has to name a numeric store, or the service refuses it outright; there is no
  request that answers for the country as a whole. The crawler always asks under one specific
  store number, the same one an anonymous visitor with nothing saved in their own browser is
  given by default. Whether the price actually changes from one physical store to another was
  never tested, and stays an open question rather than a settled "no."
- This seller publishes no barcode anywhere on its pages. Checked directly against a sample of
  real listings, the field that looked most like one is a manufacturer's own catalogue number,
  five to seven characters on most products; the one listing in the sample that happened to be
  twelve digits long failed a barcode's own built-in check-digit rule and did not match this same
  product's real barcode elsewhere in the shared catalogue. So this seller can never be tied to a
  catalogue product by barcode. Every row from it is tied in by matching its brand, name, and
  size instead, described fully below, or it is not tied in at all.
- This seller's crawler is fully written and, checked directly against the real price table on
  this machine right now, has never once been run for real: there is not a single row from this
  seller anywhere in it. Every number this crawler could report about how well it covers Canadian
  Tire's stock is, honestly, unknown rather than low, and its own reporting is written to say so
  in those words rather than print a zero that reads like a measured failure.
- Its safe request rate is not measured for this seller specifically either; it is carried over
  from the number measured for Walmart, on the reasoning that a slower, previously-proven-safe
  rate is the honest floor to start from before anything about this seller's own tolerance has
  been learned firsthand.
- Its intended target list is "the catalogue's tech and hardware products." Checked directly
  against the real shared catalogue, the tech portion is large, but the hardware, tool, paint,
  automotive and garden portions are each at or near zero rows. So a run described as covering
  "tech and hardware" is, as things stand today, a run over tech alone, and that gap is recorded
  openly in the program itself rather than only discovered by running it.

**3. Open Prices, a public feed of price tags and receipts people photograph and submit
themselves**, which is not a retailer at all. This one is pulled whole rather than searched,
because the feed has no way to ask for one barcode at a time; it hands back everything it has,
one page at a time, and the crawler reads every page. Checked directly against a pull filtered to
Canadian-dollar entries: 664 rows, 487 distinct barcodes, and about 86 percent of those barcodes
were already recognised by the shared product catalogue. A small number of entries in the feed
are a price for a whole category, such as "vegetables", rather than one product; those are
skipped outright rather than counted as products that failed to match anything, since they never
named a product to match. The human-readable name and city of the shop a price came from is only
ever shown when the location is tagged in the feed's own map data as an actual shop or, as a
specific and deliberately checked exception, a pharmacy chain; a first version of this rule
withheld pharmacy prices entirely, because pharmacies happen to be tagged under a different map
category from ordinary shops, and reviewing what real chains that first rule was hiding is what
uncovered the exception. Every other kind of location the feed contains real prices tagged
against, including a bus stop, a train station, and a public park, keeps its price on record but
never gets a shop name printed next to it, because naming one would be printing a place nobody
actually sold anything at, or in one case, printing what could be a private address as if it were
a store.

**4. A rating, never a price: Best Buy's own American customer star ratings.** This is not
wired into the price table at all, on purpose. A store's price is a fact about one country, and a
Canadian verdict is never allowed to use an American dollar figure; a product rating is not a
fact about a country at all, since the people leaving it were rating the object itself, so this
one is allowed to cross the border where a price is not. It is stored as three distinct outcomes,
never collapsed into one number: a real average from real reviewers, a product Best Buy sells
that nobody has yet reviewed, and a barcode Best Buy does not carry at all, so that a product
nobody has reviewed yet can never be misread as a one-star product. This piece is fully written
and, like the Canadian Tire crawler, has never made one real request: there is no account key for
this service on this machine, every part of it is built to answer "could not ask" rather than
invent an outcome when a key is missing, and checked directly against the real database, no
rating of any kind has ever been stored.

**5. A price a shopper typed in themselves, standing in front of the actual tag.** This is
covered in full in its own section next, because unlike the four above, this is not a crawler
reading a website; it is a person's own report, kept to a different and stricter set of rules.

## The one running table every one of these writes into

Every crawler above, and the shopper-typed prices below, all write into the same single running
table of price sightings. Nothing already written to it is ever changed to fold a new number into
an average, and nothing is ever deleted: the table's whole design is that a spread of real,
individually-checkable numbers is worth more than one smoothed-over figure nobody could ever
trace back to where it came from. The only thing a new reading ever replaces is an earlier
reading of the exact same product, from the exact same seller, seen on the exact same day; every
other day's reading for that same product and seller stays on the record untouched.

Every row is one of two kinds. A joined row is tied to one specific product in the shared
catalogue and can be used in a verdict. An unjoined row is a price a crawler saw and could not
confidently tie to any catalogue product; it is kept rather than thrown away, because a later
crawl, or a later, larger catalogue, may resolve it. For a while, an unjoined row from a seller
that does publish a barcode was written down without keeping that barcode anywhere on the row, so
the only way to ever resolve it later was to visit that exact seller's page again from scratch.
That gap has since been closed: the seller's own claimed barcode, exactly as printed and never
corrected or reformatted, is now kept sitting on the unjoined row itself, purely as a memory of
what was seen, so that a later offline pass, described below, can retry the match at any time
with no new request to the seller at all.

Every single attempt a crawler makes is also written down, whether or not it found a price, in a
separate log kept apart from the prices themselves. This exists so that "nobody sells this" and
"nobody has asked yet" are never confused with each other, and so a seller that refused to answer
at all, rather than genuinely having nothing, is never silently counted as a zero.

**Checked directly against the real table on this machine, right now**: it holds 896 rows in
total, 874 from the public receipt feed and 22 from Walmart, and there are none at all from
Canadian Tire, confirming directly what its own crawler's header already says about never having
been run for real. Of those 896 rows, 782 are tied to a catalogue product by barcode, 14 by name,
and 100 remain unresolved either way.

**A live disagreement, verified this session rather than assumed from a comment.** Every Walmart
row in the real table right now is stored under the seller name "walmart.ca", a bare web address
rather than a proper store name. The crawler's own current program text no longer does this: it
was corrected at some point to write the seller's actual name, "Walmart", specifically so that
every seller in this table would read the same way, as a store name and never as a domain. That
fix only changes what a future crawl writes; nothing has gone back and rewritten the 22 rows
already sitting in the table from before the fix, so every one of them still carries the old,
address-shaped label today, and will keep doing so until Walmart is crawled again for real.

## How a shopper's own typed price becomes evidence

A person standing in front of a real shelf tag can type its price in themselves, and that number
is treated as real evidence, kept in its own separate table rather than folded into the crawled
one, because unlike a crawled row it can never be recreated by crawling again; it is one person's
eyes on one tag on one day, and if it is ever lost, it is lost for good.

What is kept is deliberately narrow: a random identifier the phone itself generated on first use,
never a name or an account; a barcode when one was scanned, or the identity the app had already
worked out, or as a last resort the plain words that were on screen, tried in that order; the
shop exactly as the person typed it; the price; whether it is the everyday price or a sale; and
the date the tag itself was seen, which can be earlier than the date it was actually sent in, for
someone who typed several prices while offline and sent them all once they had signal again.

One person, one shop, one product, one day is enforced as a hard rule: a second submission for
the same tag on the same day overwrites the first rather than counting as a second, independent
witness, which closes the most obvious way a single person could otherwise manufacture agreement
with themselves. Separately, a phone resending the literal same submission it already sent,
identified by a random id it invented for that one submission, changes nothing and is answered as
a success either way, which is what lets a phone with no signal keep quietly retrying without
ever inflating the count.

A second, different phone reporting a close enough price for the same tag at the same shop counts
as genuine, independent corroboration: prices within twelve percent of each other, or twenty-five
cents, whichever is the larger allowance, are treated as the same tag rather than a
disagreement, since shelf tags themselves move by that much from one day to the next. A device is
also capped at two hundred new typed prices in one day, a sized-by-guess ceiling rather than a
measured one, deliberately set to the size of one whole afternoon spent typing in an entire
store's worth of prices, and written down as reversible the day a real day's volume is ever
measured to actually need more. A reliability score exists for every device, rising as other
people's phones confirm what it reports, but is not currently used to hold back or discount
anything: every device starts at zero, including on its very first ever use, and gating anything
on that score would refuse the exact first walk through a store that is the only way that score
could ever move.

**Checked directly against the real file on this machine right now**: exactly one correction has
ever been filed here at all, a single $3.99 reading at a named grocery chain.

## Matching a crawled price to a specific catalogue product

A price is never allowed to attach itself to a catalogue product by a fuzzy guess made up on the
spot. Every seller declares, once, how it is allowed to be matched, and every single row from
that seller is matched exactly that way or is refused and kept unjoined.

**By barcode**, for a seller whose pages publish one. The row's own barcode has to be, once
padded to the same length the catalogue uses, letter for letter the same barcode the catalogue
already holds for that product. No barcode published, or a barcode that does not match, and the
row is refused outright, never guessed at some other way.

**By name**, for a seller that never publishes a barcode at all, which today means Canadian Tire.
This match is not a semantic or a fuzzy search; it is worked out from scratch each time: both the
catalogue's own name for the product and the seller's own title are lowercased, accents are
folded away, and punctuation is stripped down to plain words. The score is the fraction of the
catalogue product's own words that also appear somewhere in the seller's title, deliberately
asked in that direction and not the other way, since a short catalogue name fully contained
inside a long retail title is real evidence, while a long title mostly missing from a two-word
name is not. That score only counts at all once the product's own brand is confirmed present too,
checked as its own separate, absolute gate before the word-overlap score is even looked at; a
catalogue product with no brand recorded against it can never be matched by name under this rule
at all, which is stated plainly as real products being lost this way, rather than as an
acceptable trade against the alternative, which is joining on words alone and occasionally
attaching one brand's product to a completely different brand's price.

A name match needs at least half of the catalogue product's own words present to be stored as a
match at all, and needs every single one of them present, together with the brand, to be treated
as fully exact; anything scoring between those two lines is stored as a match, but carries a
weaker "likely" label rather than an "exact" one, and that weaker label later costs a small amount
of confidence in the final verdict.

There is also an entirely offline pass that runs after the fact, over rows already sitting
unjoined in the table, and makes no new request to any seller at all. It runs in two separate
legs: one retries a barcode a seller already handed over and that was kept sitting unused on an
unjoined row, in case the shared product catalogue has grown to include it since the row was
first written; the other retries a name match, using the exact same brand-and-overlap rule
above, for rows from a seller that never had a barcode to try in the first place. Both legs are
safe to run as often as anyone likes: a row that already has a catalogue product attached to it
is never touched again by either one, so running the pass a second time on the same data simply
finds nothing new to do rather than redoing or undoing anything.

## Turning collected prices into a verdict, with no model anywhere

This arithmetic is not the first thing Shin tries when a shopper types a shelf price; a separate
comparator, tailored per kind of product, generally runs first and is described in its own
section of this walkthrough. What is described here is the plain, model-free arithmetic Shin
falls back to specifically when that first comparator has been left with nothing usable to
compare against, which is a real and regularly reached path, not a theoretical one: it is what
answers today whenever there is exactly one seller's number on file for a product, or whenever
every number on file happens to be from the exact shop the shopper is currently standing in.

**Direct history worth naming plainly, because it was once exactly the kind of gap this
walkthrough exists to catch.** This arithmetic used to enforce a hard rule that at least two
different sellers had to agree before it would answer at all, refusing outright otherwise. That
rule was removed on his own direct instruction, recorded in the program's own text, that an
accuracy-first refusal "impeeds so much of our design" and that a system which always answers,
carrying its own doubt in a visible number instead of a blank refusal, is the better product. When
the count of past refusals under the old rule was actually checked rather than assumed, none of
them traced back to anything he had said; every one of them descended from an internal design
choice nobody had actually asked for. Separately, and for a period of about three days, this
arithmetic was fully rewritten to the current design described below, but the shelf-price screen
in the running app was still not calling it at all, so a shopper typing in a price could still be
met with the exact kind of blank refusal the rewrite existed to end. That gap has since been
closed and was checked directly this session, by tracing the real request a shopper's typed price
actually triggers: it does reach this exact arithmetic, precisely on the cases named above.

The steps, in order, once a shopper has typed a shelf price for a product Shin has any evidence
on at all:

1. **Collapse to one price per seller.** If the same seller's own listing shows up more than
   once, only its cheapest instance counts; a single seller quoting the same product twice must
   never be allowed to count as if two different sellers were agreeing with each other.
2. **Drop anything not quoted before tax.** A price that came in already including sales tax
   cannot be safely converted back to a pre-tax figure without knowing the province and the
   product's own tax treatment, so it is dropped rather than guessed at, and its absence is what
   shows on screen.
3. **Split into everyday and sale prices, and prefer everyday.** Whenever any everyday price
   exists at all, the comparison is built only from everyday prices. Sale prices are only used as
   the basis for a verdict when there is no everyday price anywhere on file, and doing so costs a
   deliberate confidence penalty, since the shopper is then being compared only against
   temporary, limited-time numbers rather than what the product normally costs.
4. **Find where the shelf price sits.** The cheapest and priciest prices left in the comparison
   set are found, and the typed shelf price's position between them is worked out as a plain
   fraction, zero at the cheapest end and one at the priciest end.
5. **Tier by simple thirds of that real range, never an average.** The cheapest third of the range
   is called a good price, the middle third fair, and the top third high. There is deliberately no
   average anywhere in this step: the cheapest real price at a real, named seller is a number
   anyone can go check for themselves, and an average of several sellers' prices is a number that
   exists nowhere any shopper could ever verify.
6. **Handle the case where every known seller agrees exactly**, which makes the range above zero
   pixels wide and the ordinary fraction meaningless. In that specific case the shelf price is
   compared to that single agreed number directly instead: matching it exactly reads as fair,
   being below it reads as good, and being above it reads as high. This replaced an earlier
   version that mechanically read a zero-width range as "position zero", which meant a price that
   matched or even slightly exceeded the only known price on file was still being called a good
   deal, a real and previously live mistake fixed on exactly this reasoning: telling someone a
   price is good when it is not is treated as the single worst thing this feature can say, since
   it is the one mistake on screen that makes somebody actually spend money.
7. **Work out a per-unit price whenever a size is known**, matched carefully to the unit that size
   is actually recorded in rather than one blanket formula applied to everything: a price per
   single item is not scaled at all, a price given in grams or millilitres is shown per hundred of
   that same unit, and a price given in kilograms or litres is converted to its base unit first.
   An earlier, single formula applied to every unit alike once overstated a twelve-pack's true
   per-item price by roughly a hundred times, and separately overstated a price already given by
   the kilogram by roughly a thousand times, both fixed by tying the arithmetic to the unit
   actually named on the label instead of assuming one shape for all of them.
8. **Score confidence from the shape of the evidence, shown beside the answer rather than used to
   hide it.** A single seller's evidence is worth roughly half confidence on its own; three
   sellers agreeing is worth roughly eighty-two percent; many sellers agreeing is worth about
   ninety percent. That starting number is then reduced a fixed amount if the single freshest
   contributing price is more than three weeks old, reduced again if the comparison is resting on
   sale prices alone for lack of any everyday price, and reduced again if any contributing price
   was tied to the product by name rather than by barcode. Every one of these reasons is spelled
   out in plain words next to the number, rather than left as an unexplained score.
9. **Report the age of the single freshest contributing price**, never the oldest one, in plain
   phrases such as seen today, seen yesterday, seen some number of days ago, seen last week, or
   past three weeks old. This specifically replaced an earlier version that measured the oldest
   contributing number while still printing the sentence "the newest price is over three weeks
   old", which meant one perfectly fresh price sitting alongside one genuinely old one could be
   penalised and described as stale purely because of the older number sitting next to it.
10. **Write the one sentence shown on screen entirely out of real, named numbers.** It always
    names the actual cheapest and actual priciest real sellers and their real prices, ends with the
    unit price when one exists, and separately calls out whenever a currently cheaper sale price
    exists somewhere else, but it never contains a number that was not read directly off some
    named seller's own listing.

This same running price table, entirely separately from the verdict arithmetic above, also feeds
one lighter-weight reader elsewhere in the app that looks up the single most recent known price
for a list of barcodes at once, used to list cheaper alternative products; that reader never
writes to the table, never touches whether an item is in stock, since the underlying data does
not reliably say so, and always reports the newest reading for each barcode rather than any kind
of average across sellers, for the identical reason the verdict arithmetic above never averages
anything either.

## What is open, unresolved, or found disagreeing this session

- **Live disagreement, verified directly against the real table this session.** The current
  program text writes a proper store name for Walmart going forward, but the 22 Walmart rows
  already sitting in the real table were written before that change and still carry the old,
  web-address-shaped label. Nothing has gone back and corrected the rows already on file, and
  nothing will until Walmart is crawled again for real.
- **Open question, stated as unresolved in the program itself rather than answered either way.**
  Whether Canadian Tire's prices actually vary from one physical store to another was never
  tested; the crawler always asks under one single default store number today, and a price that
  does vary by store elsewhere would be reported nationally without that being known.
- **Named gap between an intended scope and what the data can actually deliver.** The plan for
  the Canadian Tire crawler describes covering "tech and hardware" products; checked directly,
  the hardware, tool, paint, automotive and garden portions of the shared catalogue are each at or
  near zero rows today, so a run under that description is, in practice, a run over tech alone
  until a catalogue that actually contains hardware products exists.
- **Two pieces of this engine are fully written and have never made one real request.** The
  Canadian Tire crawler and the Best Buy rating reader are both complete, both checked directly
  against the real database and confirmed to have written nothing to it yet, and both are built
  specifically to describe their own coverage as unknown rather than as a measured zero for
  exactly that reason.
- **Not verified this session, and named rather than assumed.** Whether Canadian Tire's own
  anti-automation protection, which is the same kind of protection that blocks a different major
  grocery retailer outright, would hold up against real, repeated, scheduled use rather than the
  single handful of test requests actually made against it, has not been tested and is recorded
  as an open risk in the crawler's own text.
