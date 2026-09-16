# The mascot voice and copy system

Shin's founding document calls the product mascot-led. This section traces exactly what that
means in the running app: the system that turns a state ("the price is fair", "Shin is thinking",
"the user has not typed anything") into words on screen, the parallel system that turns the same
state into a drawn face, the French version of both, and the one place they are joined into what
a screen actually paints. Every claim below was checked directly against the source files during
the session that wrote it (2026-09-15); none of it is carried over from a summary.

## The rule the whole system is built to enforce

The voice file opens with a rule stated in capitals: no string Shin says may be written inside a
screen file. If a screen needs a new line, it gets a new entry in the shared table, written in
all three of Shin's attitudes, or the feature does not ship. The boundary the rule draws, also
written directly in the file: anything in the first person, anything that judges, advises,
apologises, or narrates what Shin is doing belongs in the voice table; structural labels,
headings, button text and factual captions that are not Shin speaking belong in the screen, in a
second, separate table that carries no attitude at all. The file's own history names why this
needed to be a rule rather than a habit: a screen once carried an exemption for one kind of line
("a fetch narration is not a verdict") that let it write its own first-person text once, with no
attitude variants, and that exemption did not exist in any design document and had already been
copied by four other screens before it was found and retired.

## The three attitudes, and how a person picks one

Shin ships three attitudes, chosen once at setup and changeable at any time after. Each is
defined as a short card: an identifier, a display name, a one-line description, and a sample
line, all three written in the source as English first:

- **Deadpan** ("States the number and stops."): *"Two dollars. It's $1.47."*
- **Warm** ("On your side about it."): *"Ooh, that's steep. I'd wait."*
- **Blunt** ("Short, and a bit rude."): *"They're robbing you."*

Deadpan is the default the app falls back to whenever no valid choice is on record, and the
reasoning for that default is written directly into the source: a price tool that is wrong while
being cute is worse than one that is wrong while being flat.

The choice itself is a single stored field, initially empty, meaning setup has not run. Picking
a card writes that identifier to the same on-device storage everything else in the app persists
to; there is no account and no server round trip for this choice. Reading it back is defensive:
if the stored value is not one of the three known identifiers, the app treats the question as
unanswered and uses the Deadpan default rather than showing something broken.

The setup screen renders all three cards at once, and each card's sample line and face are drawn
with an explicit override that pins that one card to its own attitude regardless of which attitude
(if any) is currently the global pick. This is why tapping between the three cards before choosing
lets a person hear all three voices rather than three copies of the current one. The moment a card
is tapped, two things happen in the same click handler: the global attitude is set to that card's
identifier, and that one card's own face and line are updated in place to a pleased expression
speaking a fourth, dedicated line that exists only for this moment, written once per attitude:
Deadpan says *"Noted. This is how I sound now,"* Warm says *"Good, this is me from here on,"* and
Blunt says *"Locked in. This is my voice now."* Every other card on the same screen is left showing
its own sample line unmoved, so the sound of each option is still available after a choice has
been made and before the person leaves the screen.

A second attitude control exists on the account screen so the choice can be revisited at any
time, and it was checked separately against its own code rather than assumed to work the same way
as the setup screen's version, because it does not. Each of its three rows renders a face fixed to
the plain "fair" expression at the "fair" attitude, the same for all three rows regardless of
which attitude that row represents, plus the card's display name and a plain descriptive blurb
string; there is no speech bubble on this screen's cards at all. Picking a row runs a click
handler that only toggles the `on` CSS class and the `aria-checked` attribute across the row
buttons and writes the new attitude to storage. It never calls the function that morphs a face to
a new expression, never moves any card's face to the "pleased" expression, and never plays the
attitude-confirmation line the setup screen's handler plays on the same action. So the account
screen's control is not structured the same way as the setup screen's, and it does not repaint any
face or line in place; picking a row only moves which row carries the selected mark, while every
row's face and blurb stay exactly as they were before and after the pick.

## The promise the table is built around, and how it is kept mechanically

The header comment states the promise the whole file exists to keep: the attitude changes the
words and never the number. No line in the table is permitted to take a price, a count, a seller
name or a date and alter it; every one of those arrives at the table already formatted as a
string, and a line only ever drops that string into a sentence. This is enforced by the shape of
the table itself rather than by a separate check: each entry is a small function that receives one
object of pre-formatted values and returns a sentence built only by interpolating them, never by
doing arithmetic or formatting on them.

A second, narrower safety net exists for the case where a caller forgets to hand over a fact a
line needs. If a line's own text ends up literally containing the word "undefined", "null", or
"NaN" (checked with a precise pattern rather than a guess, and the file states this was verified
against every line in it at the time it was written), that output is treated as broken rather
than shown. In that case the system falls back to a second, separate table of deliberately weaker
lines that carry no facts at all and cannot be broken the same way, still split by attitude and by
language. This is treated in the source as a real, previously observed failure class, not a
hypothetical: a caller once passed `null` instead of omitting an argument, which a JavaScript
default parameter does not catch, and that produced a crash reading a field off `null` rather than
a broken sentence, which is the same missing-guard failure appearing in a different spot. The
console is told exactly which key spoke without its facts and what it produced; the person holding
the phone is shown the plain fallback line instead and never sees the raw error.

## The lookup a screen actually performs

A screen never holds the voice table itself. It calls one function with three things: a key
naming which line it wants, an object of already-formatted facts, and, in the one screen that
needs it (the attitude picker), an explicit attitude to speak in rather than the user's own
current pick. That function:

1. Resolves one special case first: the single key used for "this item is saved" carries a second,
   more ambitious version of itself, gated behind a feature switch that is off in this build
   because the capability it would promise (watching a price over time and speaking up when it
   drops) is not built. With the switch off, asking for that key always resolves to the plain,
   already-happened phrasing ("Saved") rather than the promise ("I'm watching this one").
2. Looks up the row for that key in the language currently in force, falling back to the English
   row if the language table has nothing for that key at all.
3. Picks the cell for the requested (or current) attitude inside that row, falling back to the
   Deadpan cell if the requested attitude's cell is somehow missing.
4. Calls that cell with the facts object, checks the result against the broken-output pattern
   described above, and returns either that sentence or the weaker fallback sentence for the same
   key, attitude and language.

Two other small functions are built the same way for the two places that need a single word
rather than a sentence: one resolves the large verdict word printed on the price screen (Good
price / About right / Walk away, in whichever attitude and language are current, or one of two
hardcoded ultimate fallback words if the table has nothing at all), and one resolves the heading
shown on a reopened refusal card from the reason code the pricing engine returned, falling back to
the plain word "Refused" (or its French equivalent) rather than to a blank heading if that reason
has no dedicated heading written for it yet.

The engine's own closed list of reasons it is allowed to refuse with currently names twelve:
no identity resolved, an identity resolved below the confidence floor, the category having no
source it trusts, sources existing for the category but none answering for this item, too few
usable price points, every usable price being a kind the category cannot compare against, every
usable price being dated later than the moment being priced, points existing but all older than
the category tolerates, every usable current price belonging to the seller whose own price is
being judged, the points disagreeing past the point a verdict would be a lie, only a single
report existing with no second source, and no price existing for the thing being judged. A
comment inside the heading-resolver file itself claims a lower count, stating that the file
"already owns eight refusal keys covering the same eight reasons": that comment was true when it
was written, before three more reasons (the unusable-price-kind case, the future-dated case, and
the same-seller case) and later the single-report case were added to the engine's list, and it was
never updated afterward, so the comment and the engine's actual list now disagree, twelve against
eight.

This is not only a stale-comment mismatch: checked directly against the heading table itself,
eleven of the twelve reasons have their own heading entry, and the single-report reason does not.
Today, right now, a refusal for that one reason falls all the way through to the plain fallback
word, "Refused" in English or "Refusé" in French, exactly the same behaviour the file's own
fallback rule describes for a reason with no key at all. This is a live, checkable gap in the
running table, not a hypothetical "reason code with no key of its own yet."

## The French variant

French is not treated as a translation pass bolted onto a finished English file. It is a second,
same-shaped table living in its own file, keyed identically to the English one, and the switch
between the two is made in exactly one place: the language is the outer key of the lookup and the
attitude is the inner key, so every mechanism described above (the fact-interpolation rule, the
broken-output fallback, the three attitude cells) applies to French exactly as it does to English,
because it is the same code path with one more level of lookup in front of it.

The file's own header states three deliberate choices behind the French text: it targets Canadian
French rather than the French of France, because the product's market is Canada and the
vocabulary follows the grocery aisle rather than the dictionary (naming, for example, "rabais" and
"en solde" for a discount, "magasiner" for the act of shopping); it uses the informal "tu" form
throughout rather than the formal "vous", on the stated reasoning that a Quebec consumer app
trying to sound like a person standing beside the shopper does not address them the way a bank
would; and every one of the three attitudes had to survive translation as a distinct voice rather
than collapsing into one, with the file's own comment noting that anywhere the three English
variants of a line came out closer together in French than they are in English, that is named in
this lane's own report rather than shipped silently as if it were not a change.

The language actually spoken is decided in one dedicated module, by three rules applied in a
fixed order, and only the first of the three is a choice a person makes: first, whatever language
the person explicitly picked earlier on the account screen, which is stored and wins forever after
even if the phone's own system language later changes; second, if nothing has ever been picked,
the phone's own reported language preference list, matched on its primary code so that a phone set
to any variant of French (Canadian, French, or otherwise) is treated the same and always served
this one Canadian French table rather than a different one; third, English, used only as the
fallback and never presented as a claim about who the reader is. A stored value that is not one of
the two languages this build actually has a table for is treated as if nothing had been picked,
specifically so that a corrupted or hand-edited stored setting cannot make the entire app fall
through to blank strings.

A key that exists in the English table but has no French row at all is a real, checked failure
mode and not a hypothetical: the source states plainly that a missing French row means that key
falls back to English, silently, in the middle of an otherwise French screen, and that nothing at
runtime will ever surface this to a real user, which is exactly why it is checked by an automated
test that walks every key in the English table and confirms a French row, with all three
attitudes, exists for it, and does the same again for the weaker fallback table. That check treats
a missing translation the same way a missing attitude is treated: as a shipped defect, not a style
gap.

One detail in the French table is a specific, deliberately-placed piece of correct typography
rather than an oversight: French typographic convention places a non-breaking space before a
colon, and the sentence that turns a face's internal state into an accessible name for a screen
reader is written as such in the French table (a non-breaking space before the colon between
"Shin" and the state name) while the English version of the same sentence uses an ordinary colon
with no space before it. This is confirmed directly in both language tables' source.

## The other half of the copy: the strings that are not Shin talking

A second, separate table exists for every user-facing string in the app that is not Shin speaking:
button labels ("Undo", "Share", "Done"), page headings, navigation labels, and factual captions.
The file's own header explains why this table had to be split out from the voice table rather than
living alongside it: before a second language existed, hardcoding this chrome text directly inside
each of the app's roughly ten screen files cost nothing, because there was only one language to
get right. Once a second language existed, an interface with translated speech bubbles sitting
inside untranslated buttons and headings is a materially different, worse thing than an English
interface, and the fix was to give this chrome exactly the same two-table, English-with-a-French-
counterpart shape the voice system already had, with one explicit difference: this table carries
no attitude variants at all. The reasoning is stated directly: chrome does not have an attitude,
and a "Share" button that got ruder when the Blunt attitude was picked would be the attitude
picker leaking into parts of the app that are not supposed to speak as Shin in the first place.

The lookup function for this table differs from the voice lookup in exactly one deliberate way.
Both fall back from French to English on a missing key, but where the voice lookup returns an
empty string for a completely unknown key (on the reasoning that Shin staying silent is a
speech bubble that simply does not appear, which is survivable), this table's lookup returns the
literal key name itself for a completely unknown key, because a button with no label at all is a
control nobody can operate, while a button that visibly prints its own internal name is at least
usable and immediately reports its own bug rather than hiding it.

This table is also where the accessible name of a face comes from. Each of the drawn face states
has its own short, human word in both languages (for example the state a screen calls "walk"
reads to a screen reader as "passes on it" in English and "passe ton tour" in French, and the
state called "unknown" reads as "not sure" in English and "incertain" in French), and a separate
entry composes those words with the character's name into the full accessible label a screen
reader announces, which is the sentence carrying the non-breaking-space detail described above.

## The face art: how a drawn expression actually gets to the screen

The face is not an image asset loaded from a file. Every face the app shows is generated as
inline vector markup by one module at the moment it is needed, built from a small set of named
parts (an outline circle, a body, a head shape, a propeller hat, and a swappable set of brows,
eyes, mouth and any extra marks such as the three dots that mean "thinking") on a fixed square
coordinate space. The drawing module's own header covers the character design (the rounded cyan
body, the navy outline, the propeller beanie, the lanyard and badge), the coordinate space, and
the colour rules; it does not itself state why the face is drawn rather than loaded. That
reasoning is stated in the header of the separate module that consumes this drawing module to put
a face on screen (the one described later in this document as the function that draws a face into
a screen and joins it to the spoken line): "It is drawn rather than loaded, so there is no asset
to go missing and it stays crisp at any size on a share card."

There are thirteen named expressions (waiting, thinking, asking a question, a good verdict, a
delighted verdict, a fair verdict, walking away, angry, unsure, pleased, nudging, asleep, and
proud), and each of the three attitudes has its own complete, hand-tuned drawing for all thirteen,
which makes thirty-nine distinct pieces of art in total. This is not a minor detail: the source
contains an extended, specific design rationale for why the three attitudes had to be told apart
by only a few surviving visual levers at the size these faces are actually shown at (as small as
28 pixels square in places). At that size a one-unit change in a brow's height is under a third of
a pixel and simply does not render, so the three attitudes are instead separated by eye shape and
size (Warm's eyes are taller and rounder than Deadpan's, with a visibly larger dark iris meant to
read as an open, dilated look), by brow weight and length rather than brow height (Warm's brows
are thinner and shorter than Deadpan's, Blunt's are the heaviest and shortest of the three), and by
mouth shape (Warm answers most of Deadpan's flat, closed-off mouths with an actual curve). Positive
and defensive states in the Warm set additionally lift the character's whole chest and shoulders
by a couple of drawing units, a change the source states is Warm's alone and is visible as a
change in the silhouette below the face rather than in the face itself.

Two independent things consume this same module. Inside the running app, the function that draws
a face into a screen, and the function that morphs an already-mounted face from one expression to
another, both call directly into this module: they pass the attitude and the expression name in,
and get back the markup for exactly that combination, with the outline colour left open so the
part of the app doing the drawing can set it to whichever verdict colour or ink applies at that
moment. Separately, a small build script imports the exact same module and calls the exact same
underlying drawing function for every one of the thirty-nine combinations, writing each one out as
its own standalone SVG file on disk, one folder per attitude, one file per expression. The app
itself does not read these files back; the source states this directly, and it is a deliberate
choice, so that changing what an expression looks like is a code change in one module rather than
thirty-nine files that could individually drift out of sync with what the app actually draws. An
automated check exists specifically to catch that drift: it regenerates what each of the
thirty-nine files should contain from the module and fails if what is committed on disk differs, so
the committed files cannot silently fall behind the module that is the actual source of the art.
Those same committed files carry no visible sentence in either language on purpose: an earlier
version stamped an English accessible-name sentence directly onto each file, which is wrong the
moment the file is opened by anything running in French, so the current files instead carry only
which attitude and which expression they are as plain data, and whichever part of the app displays
them is the part responsible for turning that into a sentence in the correct language, the same
division of responsibility the voice and copy tables already draw everywhere else.

The face and the spoken line are joined into what a screen actually shows by one further function
that takes an expression name, a voice-table key, and a facts object, and returns one self-
contained block: the drawn face at a given size, an optional plain-text label of the face's raw
internal state name (present only behind a feature switch that defaults off, discussed below), and
a speech-bubble element holding the line the voice lookup produced for that key. This is the one
point in the app where "what Shin looks like" and "what Shin says" are assembled together, and
both are driven from the same attitude value, passed to each half explicitly rather than each half
independently re-reading the user's stored preference, specifically so that a face drawn in one
attitude's style can never end up paired with another attitude's sentence.

## A written rule the running code has already moved past

The module that draws the faces, and the smaller module that decides which attitude's drawing to
use, disagree with each other about the state of their own feature, and this is a live
disagreement in the checked-in comments rather than a stale plan versus a current build.

The function that decides which attitude's face art to use carries a comment, unchanged since it
was written, stating: "Only the Deadpan treatment is drawn so far; Warm and Blunt fall back to it,
so the attitude picker's three faces differ in voice but not yet in face." A second file, the
feature-switch module, carries a matching claim: "Warm and Blunt still have no art of their own
and fall back to Deadpan. That is a real gap and it is tracked." Both statements describe a state
in which only one of the three attitudes has its own drawn face.

That state does not match what the art module actually contains today, checked directly: it
defines three separate, fully worked out drawing tables, one per attitude, each with all thirteen
expressions, and the extended design rationale about eye shape, brow weight and chest lift quoted
above exists specifically to explain how the Warm and Blunt tables were made to look distinct from
Deadpan at small sizes. An automated test asserts that exactly three attitude keys exist in this
table, and that assertion passes. The function whose own comment says Warm and Blunt fall back to
Deadpan does not, in fact, make them do so: it looks up whichever attitude was actually asked for
in the completed three-attitude table, and only substitutes the Deadpan drawing when the requested
attitude is not one of the three known keys at all, which none of the three real attitudes ever
fails to be.

This was checked against the project's own history rather than assumed: the comment that says only
Deadpan is drawn was written at the same time as the first version of the art module, which at
that moment genuinely contained only the Deadpan table. Roughly eight hours later that same day, a
further change added the complete Warm and Blunt tables to the art module, and made no
corresponding edit to either of the two comments quoted above. Both comments have been left
unchanged since, through several later changes to the same two files, so the running code and its
own attached documentation now describe two different products: the comments describe a build
where the attitude picker's three cards sound different but all wear the same face, and the code
that actually runs draws three distinct faces. This is flagged rather than silently corrected in
this document, in keeping with the rule that a disagreement between a written statement and the
code that runs is reported with both sides stated, not resolved in one direction by whoever is
writing the walkthrough.

## Open item: the face art's status as a placeholder

A separate design document describes the entire drawn-face system, in detail, as a temporary
placeholder standing in for a set of thirty-nine files a hand-drawn artist is expected to deliver
later, and it defines a precise handoff contract for that moment (the same viewBox, the same
thirteen names, the same six sizes, stroke-based art with the outline colour left to be set at
render time). It also names a feature switch, described in that same document as controlling
whether the placeholder prints its own internal state name underneath the face, and says turning
that switch off is the entirety of what the artist handoff requires.

That switch has since been turned off, and the comment recorded at the moment it was turned off
gives the reason in different terms than "the art arrived": it says the faces are no longer
placeholders because the drawing module now draws all thirteen states for at least one attitude
and a check exists to keep the committed files matching it, treating the module's own drawing as
the real art rather than as a stand-in for art that has not arrived yet. Nothing found in this
session, in either the code or its commit history, shows a hand-drawn artist deliverable ever
existing or being imported to replace this module. The module's own header goes further and states
its own intended relationship to hand-drawn art the other way round from how the design document
frames it: if hand-drawn art ever arrives, this module is what would be regenerated to match that
art, not a stand-in that gets deleted once real art shows up.

Whether the procedurally drawn face is the permanently intended art, or is still, by the original
design document's own definition, a placeholder that happens to have been extended far past its
original scope while waiting for a delivery that has not happened, is not settled by anything read
this session. Both readings are consistent with some part of what is written down; they are not
consistent with each other.
