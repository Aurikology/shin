# Frontend: the verdict screen's price line

This is the client-side half of the price line the calibration example described from the
server's side. Every claim below was checked directly against the running client code, the
server code that feeds it, the design document that specified it, and the visible styling, during
the session that wrote it (2026-09-15); none of it came from memory or from the calibration
example alone.

## Two things on this screen are called a price line

The verdict screen actually shows two different visual elements, and only one of them is the
"colored line with a large dot and small dots" the founder described and the calibration example
covered.

1. **Shin's own price line, always shown.** Every verdict already draws a plain low-to-high band
   built from Shin's own collected observations: a track, a shaded band between the lowest and
   highest comparable price, a dot for every comparable seller, one marked dot for the price the
   shopper is looking at, and the low and high prices written at each end. This has no colored
   zones, no user-set thresholds, and no boundary math. It exists whether or not a Gemini search
   ever ran.
2. **The gauge described in the design and the calibration example**, built only when a
   search-backed answer with usable prices exists. This is the one with three zones, a median at
   its centre, and the user's own two personal percentages marking the zone edges. The rest of
   this section is about this second one.

## Where it sits, and when it appears

The gauge, along with the search-backed offer list, the reviews and the search-suggestion box
around it, is placed inside the same expanded tier of the results sheet as Shin's own comparable
list, confirmed directly in the sheet's own markup. A shopper who has not dragged the sheet open
past its first, shortest height will not see it at all; it sits behind the same expansion gesture
as Shin's own comparable-seller list, not in the immediately visible section with the price and
the primary button.

There is no loading or skeleton state for this specific piece. The code that inserts it runs
immediately after the whole sheet's markup is written to the screen, and the comment on that code
states directly why: the search-backed answer already arrived before the sheet was built, so
filling this part in is "pure rendering" that "cannot delay the answer." If nothing usable came
back (no search-backed offers at all, or a shelf price never typed, or a verdict calculation
Shin's own code found unusable) the area stays completely empty; no error message, no placeholder,
nothing drawn.

## The rule this file works under, before the drawing rule

Every field the gauge draws with is read once, from a single client-side file that also isolates
every other read of that search-backed answer, and everything downstream (the file that actually
draws the line) is handed already-extracted plain numbers and strings, never the raw answer
itself. This split exists because of a legal constraint on that search-backed answer: it may not
be reformatted, re-sorted, or blended with anything else, and the code that reads it is built so
that breaking that rule crashes rather than misbehaves quietly. Two consequences that show up
directly in what gets drawn:

- The price for every store, and the shelf price, is shown exactly as returned. There is no
  currency symbol added, no rounding, no thousands separator: whatever text the search answer gave
  for a price is what appears on screen next to that store's name.
- Every position on the gauge line, for every dot and for both zone edges, is a number that
  arrived from the server. The drawing code never computes a price's distance from the median;
  it only converts a position it was given into a place on the screen, lays out labels so they do
  not overlap, and merges dots that would otherwise sit on top of each other. This matches the
  stated rule directly: nothing here recomputes the arithmetic the calibration example already
  covered, it draws the result of it.

## The design being checked

The design document's own words for this element: *"the prices showing up as a colored line with
a large dot as the photographed items price and smaller dots as all the sources prices,"* with a
green, amber and red zone, boundaries set by the user's own percentages, a large dot for the
scanned item and a small dot per store, every dot labelled with its own quantity and price, labels
alternating above and below the line on a narrow screen, dots merging when they collide, and
underneath: *"the store list as returned (store, price, link), the no-link heads-up, and Google's
Search Suggestions, so links stay fully visible."* Checked against the actual client code, this
holds in most respects and diverges in four specific ones, each verified directly rather than
assumed.

### Built and matching the design

- Three zones exist, each carrying its own word ("under your line", "in the middle", "over your
  line" in the interface, translated the same way in French) rather than relying on color, so the
  design's stated reason (readable regardless of colorblindness, sunlight, or arm's-length
  viewing) is met by the actual markup, not just the intent.
- The zone edges are drawn from the two boundary numbers the server sends, not from a fixed split;
  this was previously broken (the client used to read two field names the server never sent,
  which silently produced one undivided zone) and the client code's own comment records that fix
  as already made.
- A large dot exists for the shopper's own item and a small dot exists for every store price; the
  large dot is visually distinct (bigger, and its own label row rather than sharing a marker with
  a store dot) specifically because the founder's instruction covered both the color rule and the
  quantity-labelling rule as separate, load-bearing requirements.
- Every dot, large or small, is labelled with its actual quantity and price together (for
  example, "6 x 355 mL, $4.49"), never price alone, matching the founder's stated reason: a
  cheap-looking dot for a tiny size must not read as a deal.
- Dots that would collide are merged into one marker showing a count, and that merged marker opens
  on tap to show each price and quantity it stands for. Labels alternate above and below the line
  and a further collision-avoidance pass runs after that, matching the design's stated behaviour
  for a narrow phone screen.
- Where the scanned item's own size was not known, the price line still draws, using the size most
  of the found stores share, and a plain note under the chart says the size was assumed. Nothing
  refuses to show a line just because a detail is missing, matching the founder's own later
  ruling that an unchecked answer is better than no answer.

### Built but contradicting the stated design

**Contradiction one, verified directly in both the code and its rendered order.** The design
document says the store list, no-link notice and search suggestions belong *"under the line"* (the
gauge). The actual code places the store offer list, the review list and the search-suggestion box
first, then the price line last; the only thing that appears after the gauge is a note when the
item's size was assumed. The store list is drawn above the gauge, not below it. This is stated as
a contradiction rather than resolved here: it may be an ordering the founder would accept as
equivalent to the request, or it may not, and nothing read this session settles which.

**Contradiction two, verified by reading every place a click or tap is wired up.** The design
document says *"tapping a small dot opens that store's link directly."* The code that draws a
single (non-merged) store dot attaches no link and no tap behaviour of any kind to it; a plain
label sits next to a plain dot with nothing clickable. A merged dot (two or more stores at the
same spot) does respond to a tap, but only by revealing a small list of plain text labels, again
with no link to anywhere. Nowhere on the price line itself, single dot or merged, does a tap lead
to a store's page. The actual links to a store's own page exist, but only in the separate offer
list rendered above the chart. Whether the design's "tapping a small dot" requirement was meant
for the chart specifically, and is simply unbuilt there, is left as an open item rather than
assumed either way.

**Contradiction three, verified against the actual colors applied.** The design names three
zones, green, amber and red. The two outer zones are colored with a green-tinted and a red-tinted
background respectively, drawn from the same two color tokens the rest of the app uses for a good
verdict and a bad one. The middle zone is not colored amber; it uses the interface's own neutral
panel color, the same tone used for plain background surfaces elsewhere in the app. An amber tone
does exist and is used elsewhere in the app (for its "fair" verdict state), so the omission is not
because no amber exists to use; nothing in the styling explains why the middle zone was left
neutral instead. Stated as a contradiction, not resolved.

**Contradiction four, a written claim about the data shape that the running server code does not
match.** The client file that draws the gauge documents, in its own header, that it is handed
"median, unitLabel, span, ticks, zoneUnderBoundary, zoneOverBoundary... as sent by" the server's
gauge calculation. Read directly, that calculation never produces a field named "span" at any
point: not inside the function that computes the gauge, not in the type that function returns, and
not in the further, smaller object that function's result gets reshaped into before it is put on
the wire to the phone. "Span" is used only as a private, internal number while the server works out
where to place its zone edges and tick marks; it is discarded before anything is sent. The
drawing code does still read a field called "span" defensively, as a fallback for building tick
marks when none are given directly, but the server always sends a ready-made list of tick marks,
so that fallback path never actually runs against real data. A client-side test file makes the
same claim even more explicitly, describing its own sample data as *"shaped exactly as the server
sends it"* while including that same "span" field, and separately using a different name for one
of the reasons a store's price gets left off the line than the one the server's own code actually
uses. Both are written statements about the data's shape that the running server code
contradicts; both are stated here rather than quietly corrected.

### Planned by the design and not built at all

The design document, in the same section, lists several offer facts that should be shown
"labelled": whether a listing is from a marketplace seller rather than the retailer itself,
whether it needs a paid membership, whether it is a store-brand item being compared against a
name brand, whether it is organic, what deal it represents (a multi-buy price, for instance), and
for tech items, its condition, its model number and its specs. All of these facts are present in
the data that reaches the client for every offer; the client's own values were checked directly
and each one carries these facts. None of them are drawn. The offer row the client actually builds
shows only the store name (as a link when one exists), the price exactly as returned, the pack
count, and the size. A shopper reading the store list has no way to tell, from what is on screen,
that one row is a marketplace listing, a membership price, a different brand, or a used unit,
even though the server already told the client so. This is not a contradiction of a rule the code
claims to follow; it is simply unbuilt.

## Two smaller, verified gaps worth naming

- The server's gauge calculation counts how many store prices actually made it onto the line and
  sends that count to the phone. The client never reads it. Instead, wherever it needs "how many
  prices", it counts the list of points it was given directly. In practice these should always be
  the same number, since the count and the list are built from the same filtering step on the
  server, but the client re-derives a number it was also handed, rather than trusting the one it
  was sent.
- The server's gauge calculation also computes the median price itself, as a number, and sends it
  to the phone. The drawing code accepts it but never displays it: there is no line of text
  anywhere on the gauge that states what the median price actually is. The shopper sees where
  their own price and each store's price sit relative to the middle of the line, and sees the
  word "middle" on the centre tick, but is never told the dollar figure that middle represents.
- Every offer the server excludes from the line carries its own reason, in plain words, built
  specifically so a client could say why a given store's price was left out. The drawing code
  reads only how many were excluded and shows a single count; the reason attached to each one is
  discarded. A shopper is told, for example, "3 left out," and nothing about which three or why.

## Open decisions, named rather than asked

- Whether the store list belongs above or below the gauge, given the design's explicit "under the
  line" wording against the code's actual order, is unresolved here.
- Whether "tapping a small dot" was meant to apply to the chart's own dots specifically, given
  that no dot on the chart currently links anywhere while the separate list above it already
  does, is unresolved here.
- Whether the middle zone should be colored amber to match the design's three-zone wording, or
  whether the neutral panel color was a deliberate later choice nothing written down explains, is
  unresolved here.
- Whether showing each excluded offer's own reason, and the median figure itself, were meant to
  reach the screen and simply have not been built yet, or were deliberately left off the chart to
  keep it uncluttered, is unresolved here.
- Which of the un-built offer-detail labels (marketplace, membership, store brand, deal, organic,
  condition, model and specs) matter enough to build first is unresolved here; the design lists
  them together without ranking them.
