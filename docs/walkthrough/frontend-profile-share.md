# Frontend: profile and sharing

This covers the "You" screen (settings, coverage, the scan log read back, consent, and the
honest account of what Shin can and cannot do) and the share screen (the exported card a person
posts or sends after a verdict). Every claim below was checked directly against the running
client code, the server code it calls, and the design and decision documents it cites, during
the session that wrote this section. Nothing here was carried forward from memory.

## Reaching the profile screen

Every screen behind the camera (saved items, the profile screen, and a handful of others reached
from them) shares one bottom bar with three fixed positions: a bookmark on the left for saved
items, a shutter in the middle that returns to the live camera, and a person icon on the right
for this screen. The camera itself keeps a separate bar of its own, drawn over the live feed
rather than a plain surface. Tapping the tab a person is already on does nothing extra; it does
not add a second stop to the phone's own back history the way moving to a new screen does.

## The weekly line

The top of the screen is a single spoken line, in Shin's own voice, reading back the person's own
last seven days: how many things were scanned, and how many of those actually produced a price
rather than a refusal ("callable"). Both numbers come from this phone's own locally kept history
of what it has shown, never from the server and never projected or estimated. The seven day
window is a plain calculation: the current moment minus exactly seven times twenty four hours in
milliseconds, compared against each history entry's own recorded time. If any of those verdicts in
the last seven days was a good price, the line and the face switch to a proud version instead of
the ordinary one; this is read from the same seven day history, not a separate count.

This line is the one exception to a written design rule that otherwise governs this whole screen:
no streak, no badge, no leaderboard position, and no running tally of money saved may appear
anywhere on it. The reason this line survives that rule is that it does not project or rank
anything; it states, once, in words, what the person's own record already says, with no invented
number added to it.

## Choosing Shin's attitude

Three voices (a flat, factual one; a warmer one; a bluntly opinionated one) are offered as a
proper multiple-choice group with an announced selected state, not a single button that used to
cycle through the three on each tap. The cycling button is a documented, already-fixed defect: a
screen reader had no way to announce what the other two choices even were, or that a second tap
would do something different from the first, because a three-way cycle has no honest way to say
"this is currently pressed." A group with three exclusive options is what that actually is, so it
was rebuilt as one. Picking a voice never changes a number anywhere in the app, only the words
used to describe it; this was stated directly as the reason the choice exists at all, dated to a
decision that the attitude is the person's own choice, never Shin's.

## What Shin can actually answer

This block asks the server, on every visit to this screen, to price every single product it
knows about and report back how many of them it can actually answer for. The request that goes
out carries nothing, it is a plain request for this one report. What the server does with it is
a real, live measurement, not a stored figure:

1. It reads its own full list of known products (over five million rows elsewhere in the system,
   though this particular report reads a smaller reference list of demonstration items with a
   name and a category each).
2. For every single one of them, it actually runs Shin's whole pricing computation, using a fixed
   placeholder shelf price of $9.99. That placeholder price only ever affects which tier a verdict
   would land in; it never affects whether the result is a verdict at all or a refusal, which is
   the only thing this report counts.
3. It records, per product, whether that run produced an actual verdict or a refusal.
4. It returns the count of products it could answer for, alongside the full list with each one's
   own can-answer or refuses label attached.

This happens fresh on every request rather than being cached or hand counted, specifically so
that adding a new observation to the underlying data corrects this number automatically instead
of it quietly going stale. The reason given in the code for insisting on a measured number here,
rather than a written one, is a named past failure: the app once told people it could answer for
seven things when it could really answer for two, an overstatement of the product's own coverage
by three and a half times. The screen shows a loading sentence while this runs, then either the
count and the full list, or, if the server could not be reached at all, a sentence saying its own
engine could not be reached. A failed connection is never shown as a zero, because a zero here
would misreport a network problem as a measured absence of coverage, which is exactly the
confusion the app's own first priority exists to prevent.

## What Shin has actually answered

A second, separate request asks the server for a summary of every scan any phone has ever sent
it, not just this one. This is a different figure from the weekly line above on purpose, and the
code is explicit that the two numbers are not meant to agree: the weekly line is this phone's own
local record of what it personally saw, and this block is the server's whole log of what was
asked of the catalogue, across every device that has ever used the app. The screen states plainly
whose scans each number counts, rather than leaving two figures on one page to silently disagree.

The server's computation, read directly from its source:

1. It reads every recorded scan row, in the order they happened.
2. It splits them into three kinds (a barcode read, a typed search, a photo) and counts, for each
   kind, how many scans happened and how many of them actually identified the product, which the
   source calls being "named." Naming a thing and pricing it are stated as two different bars, and
   the code is explicit that calling this the answer rate without saying "identity" first would
   overstate the product by an order of magnitude, because the share that goes on to get an actual
   price is a much smaller number again.
3. Any rate whose denominator is empty (a scan kind nobody has tried, a week with nothing in it)
   comes back as unresolved rather than as zero percent. A rate over nothing is not a measurement,
   and the screen shows the words "not yet" rather than a number it has not earned.
4. It computes corrections made per hundred named scans.
5. It computes a second-week return figure. A device only enters this calculation once it is at
   least fourteen days past its own first scan; younger devices are excluded from both sides of
   the fraction entirely rather than being counted as having failed to return, because scoring a
   product nobody has had time to abandon as though everyone abandoned it would misreport it.
   Among devices old enough, the figure is the share that scanned again at all during days seven
   through thirteen after their own first scan.
6. When a specific device is asked about (this one, always, from this screen), it separately
   returns that device's own scan count and named count since the most recent Monday.
7. Anything the log itself failed to write is counted and surfaced on screen as a plain sentence
   that some scans could not be recorded; the underlying technical reason (a storage error, for
   instance) is written only to the browser's own console, never to the screen, because that
   detail is not something the person holding the phone could act on.

Directly under this block sits a count of this device's own thumbs up and thumbs down ratings.
That figure is a third, separate source again: it is read from this phone's own locally kept
rating record, not from the rated-count figure the very same server request above actually
returns alongside everything else. That server-side figure is never read or shown anywhere on
this screen today.

## Settings

**Theme.** System, light, or dark, as a three-way exclusive group (the same accessibility
reasoning as the attitude picker above: three exclusive states need a group with an announced
selection, not a two-state toggle). The choice is written to a value on this phone alone and
applied immediately by setting an attribute the whole stylesheet reads; if the phone refuses to
remember it (storage blocked), the failure is swallowed silently, because only the current
session's appearance is at stake.

**The two personal lines.** Two more exclusive groups, each offering five, ten, fifteen, or
twenty percent, one for how far below the market's typical price counts as worth it to this
person and one for how far above counts as too much. Four fixed choices rather than a slider or a
typed number, for a stated reason: a slider on a phone screen is not something a person lands the
exact value they meant on, and a typed number invites a shopper standing in an aisle to invent a
figure on the spot. These are stored per person rather than fixed constants because the price
chart shown after a scan is drawn with its zone boundaries literally named after these two
numbers ("under your line," "over your line"), which keeps the meaning a boundary the shopper
personally set rather than a grade Shin itself is handing the price. The code names the legal
concern behind that distinction directly: a section of Canadian competition law concerned with
false or misleading price representations, which the design avoids by making the grading the
user's own stated preference rather than Shin's own opinion, encoded in the data itself rather
than left to a renderer to remember to be careful about. This screen is also the only place these
two numbers can be changed after the initial setup screen asks for them once; the setup screen's
own fine print already promises they are changeable here at any time, and this row is that
promise kept, not a second, separate feature.

**Language.** English or French, each option printed in its own language rather than in whichever
language happens to be active, because an option a reader cannot read is not a usable option.
Changing it fully redraws this one screen's whole content rather than repainting it in place,
because every string on the page was already drawn in the old language; it deliberately does so
in a way that does not add a new stop to the phone's own back history, so pressing back afterward
undoes nothing about the setting.

**Buzz on verdicts.** A short vibration and sound on every verdict or refusal, on by default. This
narrows a broader "animation and haptics" toggle a competing app's settings screen offers down to
the haptic half only, on the stated reasoning that the app already separately honours the
operating system's own reduced-motion setting for the animation half, so a second in-app switch
for the same thing would be redundant, while the vibration half stays because the verdict itself
arrives as a vibration and a shopper standing in a quiet store needs a way to silence that.

**Market.** Shows the current country and currency and opens a separate screen (not covered in
this section) to change them. Its caption states plainly that every price verdict is judged
against typical prices in this named market, which exists specifically so the basis of a verdict
can be checked by the person holding the phone rather than left unnamed.

## What Shin does with your data

A short paragraph states what leaves the phone, followed by two independent switches, "Photos"
and "Location," each with its own description read out in Shin's own voice. Each switch writes to
this phone's own storage first and to the server second, in that order and never reversed, so the
switch feels instant rather than waiting on a network round trip; turning location on also asks
the phone's operating system for a position immediately, so the very next scan already has
something to attach rather than waiting for a stale reading to expire. Turning location off also
erases, on the phone alone, the pattern of which shops this person has confirmed and how often,
because leaving that record behind after switching the collection off would mean the toggle
stopped new collection while keeping what it had already gathered, which is not what the word
"off" says on the screen it sits on.

**A verified contradiction on the consent default.** One comment inside the client's own settings
code, dated to a specific day, states that both switches now default to on, attributing this
change to the founder's own instruction to "build everything for collecting everything," and
claims this mirrors what the server itself defaults to for a device it has never heard from. The
literal value written immediately beneath that same comment sets both switches to off. The
module that actually governs what the server keeps, dated the same day, documents the opposite
outcome in full: it records that the two founders gave opposite instructions that day (one asking
to "build everything for collecting nothing," the other pushing, for one change, to on by
default), and that the second founder, asked which one stands for this test, chose off until
answered. The very first screen a new person actually sees also starts both switches in the off
position, matching that ruling. So one comment in the client code claims a default that
contradicts both the line of code sitting directly beneath it and everything else in the system
that touches the same question. This reads as a comment left behind after a same-day reversal
was never carried back into it, but it stands, right now, as one part of this codebase stating a
rule that the rest of the codebase, and the value it sits beside, do not follow.

**A second verified contradiction, on what a scan actually sends.** The paragraph shown on this
screen reads, in full: "Every scan is written down: the product and the price you saw, always,
plus the camera frame from that moment, used to train Shin and answer other shoppers." Read as
written, this claims every scan, of every kind, always sends a picture. The actual request built
for a barcode read or a typed search (two of this app's three scan kinds) carries only the
barcode's digits or the typed text, an app version and platform string, the reader's chosen
language, this device's own random identifier, and, only when location has separately been
turned on, a coarse map cell; nothing in that request carries an image of any kind, confirmed
directly from every field attached to it. The description printed directly beneath the "Photos"
switch on this same screen gets this right: it says the picture is kept "from a photo scan,"
naming one of the three kinds specifically, not every scan. The two sentences on one screen
disagree with each other about whether a picture is sent always or only from a photo scan, and
the narrower one is the one that matches what actually goes out over the network for the other
two kinds.

Beneath the two switches sits one more line, shown only if this phone's own storage has failed
entirely, saying so plainly rather than pretending the settings above it will be remembered.

**Deleting your data.** A row that opens the phone's own email application with a message already
addressed, subjected, and worded, its body naming this device's own random identifier so whoever
reads the resulting inbox can find the right records without asking the person to go find an
identifier themselves. **Open, unresolved, and named as such in the code itself:** the address it
is pre-addressed to is a placeholder. Nothing found in this repository's documents or notes gives
a real, staffed inbox to send it to instead, and the code carries its own instruction to replace
the placeholder before this screen is shown to anyone beyond the small named group currently
testing it.

**No metering, and no legal pages.** Two more plain sentences: one stating there is currently no
daily limit and nothing is metered in this build, sourced to a dated, active decision that scans
are deliberately not capped in this version, with the mechanism for a future cap already built
and switched off rather than absent; the other stating plainly that there is no privacy policy
page and no terms page yet, and that these two paragraphs are the whole of what exists in their
place until there is something worth a dedicated page.

## Reporting a wrong price, and the build footer

A row below the data section leads to a separate correction screen not covered here. Beneath
everything sits a build line: a version string, stated on screen as deliberately hand-written
into the app's own start-up code rather than read from any live server, specifically so a bug
report can quote a fixed, stable number instead of an answer that might differ moment to moment.

**A found, verifiable defect, not an assumption:** the literal string currently written there was
last edited over a week before several other changes to this very screen (the two personal
threshold lines, and the consent-default reversal documented above), both of which shipped more
recently. Nothing in the running code updates this string automatically when the screen it
describes changes, so the number a bug report would quote today no longer reliably names the
version of the behaviour that actually produced it.

## The share screen

### Reaching it

The share screen is reached from exactly one place: a button drawn only on the sheet shown after
an actual price verdict. That button does not exist on a refusal's own sheet at all, so there is
no path into this screen from a scan Shin declined to price. Tapping it carries forward the
specific product's own identity, so the share screen knows exactly which result to draw.

### Finding what to show

On open, the screen searches this phone's own locally kept history (its last hundred verdicts and
refusals) for the one entry whose identity matches what was asked for, or, if nothing was named,
whichever verdict was seen most recently. **If nothing matches at all, including the case where
this phone has never shown a verdict, the screen sends the person straight back to the camera
with no message at all.** This is a verified, current behaviour: a link or a bookmark pointing at
a product since dropped out of the local history looks, from outside, identical to a phone that
has simply never scanned anything; both silently return to the camera with nothing said to
explain why.

Nothing computed here is new. Every value drawn onto the card, the tier word, Shin's own one-line
sentence in whichever attitude the person picked, the item's name, both prices, the confidence
label, and the date, is read straight out of the verdict record that was already fully computed
and already shown once, earlier in the same session, by the pricing and verdict step covered
elsewhere in this walkthrough. This screen performs no new calculation and sends no new network
request to produce any of it.

### What the card shows, and the rule it will not break

The card always shows two prices side by side, the price on the tag and the market's typical
price, and it never shows or computes any figure between them. The reasoning is stated directly
in the code as a hard rule: "a difference shown as an amount saved is a performance claim, and no
savings figure here has been measured against anything." This is a self-imposed calibration rule,
guarding against an unmeasured claim, rather than a legal one.

There is no link of any kind anywhere on the card, stated as a deliberate choice. The reasoning
given for it is an outside precedent rather than any measurement of Shin's own users: it cites a
well-known word game, whose own creator is said to have left a link out of that game's own
shareable result because a link produces a preview that reads as spam, and the format is said to
have spread further without one than it would have with one attached. **Flagged plainly:** this
reasoning is borrowed from a different, unrelated product's own outcome. No measurement of how
Shin's own cards actually get shared, with or without a link, is cited anywhere for Shin itself.

The frame is four units tall for every five wide, rather than the taller shape a phone screen
itself uses, reasoned as the tallest rectangle that survives being cropped by every major
platform's feed at once, so one exported image serves all of them without a separate version for
each.

### How the card is actually drawn

The card is rendered onto a drawing surface rather than as ordinary on-screen elements,
specifically so that what a person exports is pixel for pixel identical to what was drawn, rather
than a second, separately laid out approximation of the same information. Drawing waits for the
phone's own fonts to finish loading first, so a slow font load cannot produce a card drawn in a
substitute typeface.

Because a drawing surface cannot read the app's own shared, centrally defined style values the
way ordinary on-screen elements can, every colour and every type measurement the card needs has
to exist as a literal value at the exact moment it draws. That forces this one file to keep its
own private copy of every colour and type value the rest of the app already defines once,
centrally, and the code names this directly as the one place in the whole app where a design
value now exists in two separate places that can silently drift apart. This has already happened
at least once (one colour value was corrected everywhere else in the app for failing a contrast
check, and was left uncorrected here until a dedicated, automated check caught it) and was about
to happen to two further values the same way. That automated check exists specifically to compare
this file's private copy against the app's single, shared definition and to fail the moment even
one of them differs.

When a value cannot be confirmed at all at the moment the card is about to draw: during active
development, drawing fails outright and the screen falls back to a plain-text version of the same
card, naming exactly which value could not be confirmed, so a wrong colour is never silently
drawn and mistaken for a correct one. Outside active development, the same failure instead falls
back quietly to a known, already-tested literal value and only writes the problem to the
browser's own console, because a shopper is never shown a raw internal error, only the outcome.

### Where the drawing surface cannot fully follow the app's own design rules

The written design rules for the app reserve one named display typeface for exactly two roles
anywhere in the whole product (the large price figure, and the verdict word) and nothing else,
and reserve a separate small, monospaced, capitalised label style for provenance only (a seller
name, a date, a source count). The card was found, and has since been fixed, to have been drawing
the product's own name in the reserved display typeface at a heavier weight than the rule allows,
and drawing its small labels at a different letter spacing than the rule specifies. Both now read
from the same shared type rules the rest of the app uses, rather than being kept as separate,
redrawn constants unique to this file.

**One rule the drawing surface cannot follow at all, acknowledged rather than resolved.** The
written design rule states, without exception: "Any currency figure anywhere in the product uses
tabular figures," meaning every digit in a price is drawn at the same fixed width so a changing
number never visibly reshuffles. The specific drawing technology this card uses has no way to
request that digit style at all; the capability simply does not exist for it. The code states this
plainly: "the rule says everywhere, always, so the one exception is written down rather than left
to be discovered." This is a genuine, current case of a written design rule and the actual running
code disagreeing, with the disagreement named in the code itself rather than silently resolved
either way.

**A separate, already-resolved conflict, included for its evidence.** The design rules separately
require that no text below a stated size may be drawn in a colour that fails a stated minimum
contrast ratio against its background. Checking the card's own long-form price figure at its
actual on-screen size against that floor found it failing for two of the four possible verdict
colours in each of the two themes, measured directly at as low as 3.09 and 3.25 against a
required 4.5 in one theme, and 3.39 and 3.42 in the other, because the colour in use was the one
meant for a solid, filled background rather than the separate one meant for text sitting directly
on a plain surface. The fix has already shipped: a second, brighter version of each of the four
verdict colours exists specifically for text on a plain surface, and the card now draws its price
figures with that version, each one measuring 6.2 or higher against the same floor. This is not an
open item; it is included here because the numbers came from files opened this session, not
recalled from memory.

### Saving and copying

Two actions sit at the bottom. "Save the image" redraws the card fresh, converts it to a PNG
image file, and hands the phone or browser's own ordinary download of that file, named after the
product. "Copy as text" writes a plain, sentence-by-sentence version of the same card's content to
the clipboard, worded to read as a message rather than describe a picture. In full, the text
version reads: Shin's opening line naming the verdict word, then the item's name, then "On the
tag:" and the asking price (with the seller named in parentheses if one is known), then
"Elsewhere:" and the market's typical price (with the same range or single-seller note the card
itself shows), a blank line, and finally Shin's own one-line sentence about the price.

Both actions silently increase a private counter kept on this phone alone. **Nothing found
anywhere in this app today ever displays that counter to anyone**; it is written on every save and
every copy and read back by nothing.

### What happens when either action fails

A failed drawing attempt, a blocked clipboard, or a browser missing a needed capability (the
rounded-rectangle drawing call, the download conversion, the clipboard itself) all degrade to the
same plain-text version of the card described above, shown in place of the image, rather than a
blank canvas or a silent failure. A status line beneath the card states in plain words what
happened (rendering, saved, copied, or that the export failed and the text above it is the
result). This screen's async drawing work and its click handling are both tied to one single
switch that turns everything off together the instant the person leaves the screen; an earlier
version of this file tied only one of those two things to that switch and left the other attached
to a part of the page the app's own navigation never replaces, which meant revisiting this screen
left an extra, still-active copy of its click handling behind each time. That has already been
fixed in the version read this session.

### What an exported share actually contains, and what it does not

Stated as a closed list, because this is exactly what was asked: nothing about the act of sharing,
or about what was shared, is sent to the server at all. Pressing either button here makes no
network request of any kind. The image file and the copied text are built entirely from data
already sitting on the phone from the earlier scan, computed nowhere new, and the only thing that
changes anywhere as a result is the private, undisplayed counter described above.

**A third verified contradiction.** A separate part of this codebase, the general log the server
keeps of everything a person does across the whole app, documents its own purpose in these terms:
it exists to answer "what did people do," and its own list of the specific things it is meant to
capture names, by name, "app opened, scan started, answer shown, thumbs, correction, share,
consent change." Share is named explicitly, in that list, as one of the seven things this log
exists to record. **No code path in the share screen, or in the button on the verdict sheet that
opens it, was found this session to ever send that event.** The log's own stated design already
accounts for a share event and expects one to arrive; nothing produces one today.

## A second, unrelated meaning of "export" in this codebase

Separate from everything above, one further tool answers to the word "export" and has nothing to
do with the person using the app, the profile screen, or the share button. It is a command a
developer runs directly on a computer, never from the phone, that dumps a chosen date range of
the server's own complete "what happened" log (the same log named just above) as one line of
readable data per event, rather than as one large single block. The reason given directly in its
own documentation: a single large block has to be received and parsed in full before any of it
can be read, while one line at a time can be watched as it arrives, or cut off partway through a
long export and still be useful up to that point.

Both ends of a chosen date range are included whole, by explicit design; its own documentation
states this is the only behaviour anyone typing two dates as boundaries actually expects, and
that comparing a date directly against a stored, timestamped moment instead would silently drop
the entire final day with no warning to whoever ran the command.

The exported data itself goes to the ordinary output stream, while the count of rows exported, or
the name of whatever stopped the export from working at all, goes to a separate error stream.
This is deliberate, so that redirecting the output into a file leaves a clean file while a failed
run is still visible to whoever is watching the command run. A log that could not even be opened
is named as such directly, rather than being allowed to produce an empty, technically successful
file that would look, to anyone reading it later, exactly like a genuinely quiet week.

## Open decision points

- The address the "delete my data" row is pre-addressed to is a named placeholder in the code
  itself, not a real, staffed inbox. Nothing found this session names what the real address
  should be.
- Whether the private per-device counter of how many times a share card has been saved or copied
  is meant to ever be shown to anyone is not stated anywhere read; today it is written on every
  export and read back nowhere.
- Whether the general event log's own documented "share" event is meant to eventually be sent
  from this screen and simply has not been wired up yet, or was deliberately left unrecorded, is
  not stated anywhere read.
- Nothing in the running code keeps the hand-written build number on the profile screen in step
  with what has actually shipped since it was last edited. Whether that should become automatic,
  or stay a manual step someone remembers at release time, is not settled anywhere read.

## Rule-versus-code disagreements found this session

- One comment in the client's own settings code states both privacy switches default to on,
  attributing this to the founder's instruction to "build everything for collecting everything"
  and claiming it mirrors the server's own default. The literal value beneath that comment sets
  both to off, and the module that actually governs server storage documents, for the same date,
  that an on-by-default push was made and then overruled in favour of off until answered, which
  is also what the first screen a new person actually sees implements. The comment contradicts the
  code beside it and the rest of the system.
- The profile screen's own data paragraph states every scan, always, sends the camera frame. The
  network request built for a barcode read or a typed search carries no image of any kind, and a
  second, more specific sentence on the same screen (under the Photos switch) correctly limits
  the picture to a photo scan alone. The two sentences on one screen disagree, and the narrower
  one matches what the network traffic actually contains.
- The written design rule that every currency figure anywhere in the product must use a fixed,
  same-width digit style cannot be followed by the technology the share card is drawn with, which
  has no way to request that digit style at all. The code states the exception openly rather than
  resolving it either way.
- The general event log's own documentation names "share" explicitly as one of the specific
  actions it exists to record. No code path in the share screen or the button that opens it sends
  that event today.
