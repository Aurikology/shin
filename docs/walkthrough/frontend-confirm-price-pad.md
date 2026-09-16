# Frontend: confirming the item and the price pad

This section covers the screens between an identification attempt and the moment a shelf price
is typed and confirmed: the stand-in list shown before a real vision model exists, the barcode
door (which turns out not to open the price pad at all), the typed-search fallback, the photo
route's own candidate list, the "not this?" correction, the price pad itself with its shop picker
and modifiers, and the separate correction screen. Everything below was read directly from the
running client code and cross-checked against the pricing engine and the design brief during the
same session that wrote it.

## Before there is a vision model: the stand-in list

1. Pressing the shutter (rather than a barcode being read automatically) freezes the frame, waits
   420 milliseconds for the reticle-closing animation, and then shows a list of seven items. These
   are not the product actually in front of the camera; there is no image model wired to the
   shutter path today, so the app instead asks "is it one of these?" and offers the seven products
   a hand pricing pilot actually recorded prices for on 2026-09-03. Verified independently: the
   file the pilot's data lives in carries the note "The seven-item hand pricing pilot of
   2026-09-03, plus four direct retailer page fetches. Every number here was read off a public
   Canadian source by a person on that date."
2. Each row on that list shows the item's name, the price the pilot actually saw, the seller it was
   seen at, and the word "stand-in" on any of the three rows whose price was a stated substitute
   rather than something read off a real tag. An eighth row, "Something else," exists for when
   none of the seven fits; picking it hands the price pad a placeholder identity ("a thing shin
   has never seen") in the grocery category rather than the app inventing a fake refusal.
3. Picking any of the seven, including the ones with a real recorded price already attached to
   them, does not skip straight to a verdict. It opens the price pad (described below) and the
   shopper is still asked to type today's price. The pilot's own recorded number is shown only as
   context on the picker row, never reused as the asking price.

## The barcode door does not open the price pad

4. A real barcode reader runs continuously on the live feed (this is covered in its own section of
   the walkthrough). Once several frames agree on a code, the client does not show the stand-in
   list at all: "there is nothing to choose between when the package told us what it is," in the
   code's own words. It goes looking for an identity in a fixed order: first a small,
   client-held list of the same seven pilot products, matched by barcode; then the real,
   server-side catalogue by barcode; and if the server could not be reached or has never seen the
   code, a barcode pack stored on the phone for exactly this situation (see below).
5. **Verified independently, not just from the code's own comment:** the small client-held list
   the barcode is checked against first carries no barcode numbers at all today. Every one of the
   seven pilot products' own data file was read directly this session and contains no `gtin` field
   on any entry, so this first check can never actually match anything yet; every real barcode
   scan falls through to the server or the pack.
6. Whichever of those three ways answers the barcode, the client's next move is always the same:
   it calls the pricing engine immediately, with no shelf price attached, and the price pad never
   opens. This matches the design brief's own second script ("the couch"), which states plainly
   that scanning a barcode with nothing typed should reach "the going rate," a card built from the
   comparison prices Shin already has, before ever asking for a price: "**So the couch outcome is
   not a verdict and not a refusal. It is the going rate.**" **Built and matching the stated
   design intent.** If the engine has enough evidence to describe a going rate, that is the first
   thing shown; if it does not, an ordinary refusal is shown instead. Either way, a labelled text
   button under it ("Tell me the price") is the only way back to the price pad from a barcode
   scan.
7. **A gap between two entry points, verified directly in the code, not assumed:** the server can
   answer an unrecognised barcode by naming the product from a live web search rather than saying
   it does not know, labelled on screen as an unchecked answer, "labelled unchecked" as the
   founder put it: "Having a response that is not checked is infinitely better than having the
   user scan something, wait 10 seconds, only to get told the app doesn't know" (2026-09-15). For
   a barcode, this unchecked answer is folded into the same immediate engine call described in the
   previous point, so it also reaches the going-rate card or a refusal without ever offering the
   price pad. For a photo (the route in the next section), the identical unchecked-answer shape
   coming back from the server takes the opposite path: it opens the price pad directly, letting
   the shopper type a price against a name nobody has confirmed. The same server answer is handled
   two different ways depending only on which door it arrived through. No written rule was found
   either requiring or forbidding this difference; it is left as an open decision below.
8. **Open decision, not resolved by anything read:** when the barcode pack on the phone (see the
   next two points) answers a scan while the phone has no signal, the identity it returns is still
   run through the same immediate engine call, which then fails because there is no network. The
   result is a refusal that names the product (the pack's own answer survives into the refusal's
   headline) but offers only the separate correction screen, not the live price pad, as a way to
   write a price down (see point 20). Whether an offline identification is meant to still be
   payable from inside the camera screen, or whether ending on the separate correction screen is
   the intended outcome for "we know what it is but cannot check anything," was not settled by
   anything read this session.
9. The barcode pack itself only ever answers what a product is: its own name, brand and size. It
   never carries a price, and the module's own header says why in the same terms the going-rate
   card exists for: "prices move weekly and a stale one shown as current is the confidently-wrong
   answer this whole product is built to avoid." The pack is a binary file with a fixed layout (a
   magic tag, a count, an ascending array of eight-byte codes for a binary search, an offsets
   table, and a tab-separated text blob), stored in the browser's IndexedDB rather than
   localStorage because the file itself (checked directly: 1.7 MB for the grocery pack cited in
   the code) does not reliably fit in the smaller, synchronous store. Every failure mode reachable
   from it, a private window, a phone that never downloaded it, a corrupted file, a browser that
   evicted it, is deliberately treated identically: the function returns nothing usable and the
   caller falls back to asking the server, the same as a cold cache.
10. Because that pack's lookup never returns a price, and because a barcode-identified item is
    always handed straight to the pricing engine with no typed price (point 6), the pack's whole
    contribution to what a shopper actually sees is a name inside whichever screen the engine's
    answer lands on next, either the going-rate card or a refusal. It never, by itself, produces
    something a shopper can watch or share (those require the engine's own verdict).

## The typed-search fallback

11. A refusal that could not resolve any identity, or a refusal from a photo the model itself
    could not process, offers one text button below its single repair action: "Type what it is."
    This is the only place in the app that opens the typed-search field, and it is offered on
    exactly two refusal reasons: no identity at all, and the photo reader being down or timed out.
12. Submitting typed text is checked against the same small, seven-item pilot list first, by
    matching at least two significant words (three letters or longer) against each product's own
    label, on the reasoning stated directly in the code: the pilot has priced only seven products
    out of millions, so a match against something Shin can actually price beats an honest refusal
    against something it merely has a row for.
13. If nothing in that small list matches, the typed text goes to the real, server-side catalogue
    of, as the code states directly, 5,182,591 products. If that search finds a product, the
    result opens the price pad exactly like a stand-in pick does, with one exception: when the
    server's own match confidence band is "ambiguous" and it reports other plausible rivals, the
    original text is kept on the item so the pad's "not this?" affordance (below) has something to
    search again with. Both conditions are required together; a band of merely "ambiguous" against
    zero rivals still declines to offer "not this?", because there would be nothing else to show.
14. **A second gap between entry points, verified directly:** the same "unchecked, named by a web
    search" answer described in point 7 for barcodes and photos is not handled at all by the
    typed-search route. Its own code only checks for a confidently matched product; if the server
    instead comes back with the unchecked-but-named shape, the typed-search handler does not
    recognise it, and the search is treated as a plain miss, producing the ordinary "could not
    match that" refusal rather than the same offer-an-unchecked-answer path barcode and photo
    scans both get. No written rule was found either requiring this route to behave the same way
    as the other two or excusing it from doing so; left as an open decision below.
15. If nothing matches at all, the app shows the same kind of refusal as a failed photo or a
    barcode with no match, with a detail sentence naming the exact text that was typed, and offers
    the typed-search field again through the same one text button rather than a dead end.

## The photo route's own candidate list

16. A crop captured by the object-detection layer running on the live feed is sent to the server's
    own photo-reading model. Four outcomes are handled, each with its own screen: a confident
    identity opens the price pad directly; several plausible candidates open a picker; the model
    itself being unreachable or too slow shows a refusal naming that specific failure rather than
    blaming the photo; and being offline queues the photo for a later retry and shows a refusal
    that says so.
17. The candidate picker shown here is the same component the pad's own "not this?" affordance
    reopens (described next), reused rather than rebuilt, on the stated reasoning that "choosing
    among photo candidates feels like the choice it already is elsewhere in this file." One row
    building function decides how every candidate row in the app is worded, so a photo's
    candidates and a "not this?" search's candidates cannot end up describing the same product
    two different ways.
18. As covered in point 7, a photo answer that the catalogue cannot confidently match but that the
    model still named from its own reading opens the price pad directly rather than refusing, with
    the item marked internally as unchecked; the price pad itself shows no visible difference for
    this case today; the only place "unchecked" currently changes what is drawn on screen is a
    refusal that still carries an unchecked name (point 19).

## "Not this?": correcting an identity before a price is typed

19. The price pad shows a small text button, "not this?" only when the identity behind it carries
    the query text kept from an ambiguous typed-search match (point 13). Tapping it re-runs that
    same search and replaces the pad with a list of what else the search found, having dropped the
    row already rejected. **Verified directly, and not obvious without reading every call site:**
    no other route through the app ever sets that carried query. A barcode match, a server
    catalogue match reached through a barcode, an offline pack match, and a photo-identified
    product (confident or unchecked) all explicitly pass a null value for it. So "not this?" exists
    today for exactly one door into the pad, the typed-search route, even though a wrong guess is
    just as possible coming through a barcode misread or a photo of the wrong shelf.
20. Picking a different product from that reopened list starts a fresh price pad for the new
    identity, with the typed price buffer cleared (it belonged to the rejected product) and the
    carried search query dropped (there is nothing left to reopen after a shopper has already seen
    the whole list). Choosing "keep the first one" instead returns to the same pad with whatever
    price was already typed still in the buffer, on the stated reasoning that a shopper who typed
    half a price and then decided the original identity was right should not have to type it
    again.
21. A search that fails outright (the network drops mid-search) leaves the pad exactly as it was
    and adds one line saying the second look failed, rather than clearing anything a shopper had
    already typed.

## The price pad

22. Opening the pad always shows the identified product's name and, when one was captured, the
    small frozen thumbnail from the moment of capture. Nothing about the price pad's own layout
    changes to reflect which of the several doors above led to it, other than the presence or
    absence of the "not this?" button (point 19) and a free-text name field described in point 26.
23. **The confirm key is the only thing that submits a price, and this is a stated design rule,
    not an incidental gap.** There is no debounce or auto-submit after typing pauses. The code's
    own reasoning: "a debounce here would price '2', a glance back at the tag, then '.49' as
    $2.00, and a wrong verdict outranks no verdict," citing this project's own stated priority
    order directly. The confirm key stays disabled until the price, after any modifier below is
    applied, computes to more than zero.
24. The keypad itself (nine digits, a decimal point, zero, and backspace, with a confirm key in
    the same grid on the pad's own bottom row) is one shared component used by both this pad and
    the separate correction screen described at the end of this section; a duplicate copy of it
    used to exist on the correction screen and is on record in the code as a defect that shipped a
    real, user-visible difference in how a typed price displayed on the two screens (".5" showed
    as ".50" on one and "0.50" on the other) before being unified. The decimal mark itself changes
    for a French-reading phone (a comma) while the number the buffer actually stores never does,
    so the two languages cannot disagree about what price is being typed.
25. Two optional price modifiers sit under the typed number: a percent-off toggle and an "N items
    for this price" toggle. Turning one on recomputes an effective unit price live as the shopper
    edits it, labels it under the amount (for example, showing the post-discount price), and it is
    that effective price, never the sticker number alone, that the confirm key actually sends
    onward. Turning a modifier off, or toggling the other one on, replaces it outright; only one
    can be active at a time.
26. When the identified item carries no real identity at all (only reachable through the "Just the
    price" route described in point 30), the pad additionally shows a free-text name field. This
    is optional and the price is never blocked on it. The reasoning recorded directly in the code
    for why it exists at all: an unidentified price has no barcode and no catalogue row to attach
    to, so it can never be matched against anything later; a name typed by the person standing in
    front of the item "is the first key that row has ever had." The founder's own words, quoted in
    the code: "there should be a feature where the user can manually add the price in and name
    it," with the order of that sentence noted as intentional, the price first, the name second
    and never required.
27. **A shop can be attached to the price, and this is the feature built for the founder's own
    words, quoted directly in the module that runs it: "can we allow shin to use their location
    and then assess instead of them having to input the store they're in multiple times."** With
    location consent off, no shop row appears on the pad at all, and nothing about the rest of the
    pad changes. With consent on, a row shows either a previously confirmed shop for the same
    rough map square (pre-filled automatically on every visit after the first) or an invitation to
    choose one. Tapping it fetches a short list of nearby shops (ordered: the shop last confirmed
    in this exact square, then the shops this phone confirms most often, then by plain distance)
    and a "no shop" row that is a real, recordable answer rather than a cancel. A shop chosen here
    is remembered per map square, so a returning visit to the same store costs no further taps.
28. **Built but contradicting a rule stated in this same file, verified directly by tracing every
    place the relevant field is read and written.** The file's own opening comment states the
    rule in plain words: "Every price is priced against its own seller. `askingSeller` travels
    with the query, always, so the store being judged is never inside its own comparison set.
    That is a build standard earned by the same bug twice." What the running code actually does:
    the shop chosen through the shop picker in the previous point is stored in a place read only
    by the correction-filing functions (the "keep it" action, the free-standing observation path,
    and the separate correction screen). The function that actually asks the pricing engine for a
    verdict reads the seller from a different field, one carried on the identified item itself,
    and that field is populated only for the seven hand-priced pilot products (whose seller comes
    from the pilot's own recorded data, not from anything the shopper just chose). For every real
    identification, a barcode match, a real catalogue match from typed text, a photo match, that
    field is never set anywhere in the code. Sending no seller to the engine is confirmed, in a
    second file, to make the engine write the literal placeholder word "given" into its answer;
    a third file's own comment confirms this placeholder is deliberately stripped back out before
    it can reach a screen: "The engine writes the literal string 'given' into `askingSource` when
    the caller named no store... it must never reach a screen." The net effect, chased all the way
    through: choosing a shop on the price pad changes what a later correction gets filed under, but
    does not change what the engine is told while it is computing the verdict shown right after
    that same pad closes, and the verdict for a real product currently shows no seller line at all
    for exactly that reason. This is left as a decision point rather than resolved either way:
    whether the shop picker was meant to feed the verdict call and does not yet, or whether it was
    only ever meant to attach to corrections, was not settled by anything read this session.
29. Tapping "Skip" instead of typing a number proceeds with no asking price supplied at all. This
    is not treated as a refusal; it is the same going-rate card the barcode door reaches in point
    6, built from whatever comparison prices the engine already has. From that card, one button
    ("Tell me the price") reopens the exact same pad on the exact same identity, price buffer
    cleared.
30. A refusal with nothing recognisable about the photographed item at all still offers a way to
    write a price down without any identity attached, through a separate text button under its
    single main action, labelled "Just the price." This exists, in the founder's own words quoted
    directly above the code that renders it, because "there should be a [feature to] enter the
    price based on the photo that the user entered if the barcode is not visible." Opening the pad
    this way sends the shopper straight to the free-text name field (point 26); confirming a price
    here never calls the pricing engine at all; it writes the number, the optional typed name, and
    the shop (if one was chosen) straight to the current scan's own record and shows a plain
    acknowledgement card, never a verdict and never a refusal, on the stated reasoning that asking
    the engine a question with no product behind it would only produce a second refusal stacked on
    the one already on screen.

## Leaving the pad

31. Confirming a price against a real identity sends it to the pricing engine and shows a working
    screen with three named steps that advance only on real events (the request being built, the
    request actually being sent, and the answer actually arriving), never on a timer standing in
    for one. Its outcome, a verdict, a going-rate card, or a refusal, belongs to a different
    section of this walkthrough; this section ends at the moment the request is sent.
32. From a verdict, one route back into this section's territory exists: a text button labelled
    "Correct it," which does not reopen the price pad. It leaves the camera screen entirely for a
    separate, single-purpose screen covered next.

## The separate correction screen

33. A second, standalone screen exists purely to record a price, reachable two ways: the verdict's
    own "Correct it" button (carrying the product's name and category along with it), and an
    always-available "Report a price" row on the settings screen with no product context at all.
    It is not the price pad; it shares the same keypad component (point 24) but nothing else about
    its layout, and it adds one control the pad never has, a required shop field, and one the pad
    always has as optional, a sale toggle.
34. **Built and matching a rule stated directly at the top of the file.** The screen refuses to
    save until both a price and a shop name have been typed, and the code's own header states the
    reason as a hard requirement rather than a preference: "A price with no seller is unusable as
    a comparison point later." A disabled save button shows the exact reason it is disabled,
    directly under it, rather than leaving it unexplained; the code notes this was added because a
    disabled control with nothing to say "is a control a person reads as broken."
35. The shop field is pre-filled from whichever shop the shopper most recently chose anywhere in
    the app this session (the same session-level choice the price pad's own shop picker writes
    to), but stays a normal, editable text field rather than a locked value, specifically so a
    price seen at a different store than the one just confirmed elsewhere can still be typed over
    it without switching screens.
36. A sale toggle, off by default, marks the price as promotional rather than an everyday price.
    The code's justification for spending a control on this, on a screen whose whole argument is
    that nothing should compete for the thumb, is sourced to the pricing engine's own type
    definition for what kind of number a price is, read directly: "Collapsing these is the single
    most expensive mistake available here: one 225g box of Kraft Dinner swung 3.6x inside one week
    and every one of those numbers was real."
37. Which product a correction typed here is filed against is resolved in a fixed order: an
    explicit barcode or product id handed in by whatever screen opened this one; failing that, the
    identity carried by the single most recent entry in this device's own scan history (verified
    directly: new verdicts and refusals are both written to the front of that history the instant
    they are produced, so "most recent" reliably means "the thing just looked at"); and only if
    both of those are empty, the raw text label alone, which is what a correction typed with no
    identity behind it (via "Report a price," or after a refusal that never resolved anything)
    ends up filed under.
38. Saving here writes the correction to the device first, synchronously, and only afterward tries
    to send it to the server; the on-screen thank-you describes the local write, which has already
    happened by the time it is shown, and is deliberately shown identically whether or not the
    network send behind it succeeds, so a shopper with no signal in an aisle sees the same
    confirmation as one with a full connection. **Open decision, not resolved by anything read:**
    the screen's own comment notes this design assumes the local write itself cannot fail, and
    flags, without resolving, what should be shown if a phone's storage itself refuses the write
    (a case the code says is "worth saying before the price is typed, not after," but does not yet
    say anything about).
