# Frontend: the camera and scanning screen

Every claim below was checked directly against the actual code during the session that wrote
it (2026-09-15), the same session that wrote the barcode-scan-to-verdict reference this section
matches against. Nothing here was carried forward from that earlier pass without re-checking it
against this screen's own code.

## One surface, not four screens

1. The screen's own opening note says plainly what it replaced: four things that used to be four
   separate pages (scan, identify, verdict, the actions after a verdict) are now one surface.
   A picture is taken, the frame it was taken from stays frozen behind everything that follows,
   and picking a product, typing a price, and seeing the verdict or the refusal all rise as a
   sheet over that same frozen picture rather than moving to a new page. Going back is a
   downward drag on the sheet, or a labelled button drawn on it.
2. This section is about what a shopper actually sees on that one surface before an answer is on
   screen, and about the layer of code the calibration reference already named "the capture
   code": the part that watches for a barcode, works out what the camera is pointed at, and
   takes the photo. Where this screen's waiting state hands off into the identify and price
   exchange the calibration reference already documented in full, this section says exactly what
   crosses that boundary rather than repeating the exchange itself.

## The states this screen actually has, and how they map onto idle, tracking, confirming, error

3. **Stated plainly, because it is not what the four requested words would suggest:** the running
   screen does not carry four visible states called idle, tracking, confirming and error. It
   keeps one label for whatever it is currently showing, and that label is always one of seven
   values: resting and watching; the instant right after a barcode or the shutter fires;
   waiting on an answer; picking among several products; typing an asking price; typing a
   name instead of a picture; and showing an answer.
4. The mapping onto the four requested words is this document's own translation, not something
   the running code says anywhere:
   - **Idle** is the resting-and-watching state.
   - **Tracking** is not a state at all in the running code; it is what the resting state is
     doing underneath the whole time it is showing: reading for a barcode on every frame and
     working out what the camera is pointed at several times a second. It is described here as
     the behaviour of idle, not as a fourth thing the screen switches to.
   - **Confirming** covers two different real moments, and both are described below: naming an
     asking price, which is the one screen with the app's own designed confirm control on it,
     and the multi-frame agreement a barcode has to reach before it is trusted at all, which is a
     confirmation the shopper never presses a button for but is exactly the mechanism the
     calibration reference already referred to as "several frames agree."
   - **Error** has no dedicated visible state either, and that absence is the running code's own
     rule, stated in its own opening note: a refusal is not an error path, it is the most common
     outcome of the main action and gets the same grey treatment and the same care as an answer,
     never red. What that rule leaves out, and what a shopper actually sees when something
     technical goes wrong rather than a plain refusal, is its own section below.

## Idle: resting, and what is tracked the whole time it rests

5. On screen at rest: the live feed, a slight vignette with the framed area a shade brighter than
   the rest (idle only), a torch button, the wordmark, a reticle drawn as four floating corner
   brackets, and Shin's face docked under the frame speaking one of two lines, either a plain aim
   hint or, on a second visit with a past scan on record, one callback line to that past result
   for up to six seconds before the plain hint takes over. Four seconds of nothing at all being
   detected escalates the hint's face and words once per visit to the screen, gated behind the
   same interruption budget every other unprompted line on the app answers to, so it can be
   silently skipped rather than queued if that budget is spent.
6. Underneath, two separate watchers run on every single video frame while idle, with nothing
   pressed:
   - **Reading for a barcode.** Confirmed directly, again, this session: the attempt runs on
     every frame unconditionally, with no setting that turns it off and no button that starts
     it. This is the exact mechanism the calibration reference described as "a background
     process tries to read a barcode out of every single frame, automatically, continuously,"
     and it is still the case today.
   - **Working out what the camera is pointed at**, on a slower clock: about once every 180
     milliseconds rather than every frame, since the calibration reference's own worked path only
     ever needs one settled answer, not sixty a second.
7. **The exact barcode-confirmation algorithm**, since the calibration reference only said
   "several frames" without a number:
   1. Every attempted read that decodes something valid is kept, with its value and the moment
      it happened, and anything older than 900 milliseconds is dropped from that list before
      each new attempt is added.
   2. Among everything still in that 900-millisecond window, the reading counts the number of
      times each distinct value showed up.
   3. The moment one value has shown up three separate times within that rolling window, it is
      accepted, and the app is told a barcode was read.
   4. Once a value fires this way, the same value is not allowed to fire again for four seconds,
      even if it keeps decoding, so lingering on the same package does not repeat the same event.
   5. A single decode attempt is capped at 1.5 seconds. If one single attempt takes longer than
      that, the reader gives up on that attempt and marks itself as stuck.
   **A concrete defect found, not assumed, verified directly in the reading code:** once the
   reader marks itself stuck this way, nothing anywhere in the capture code or the screen ever
   un-sticks it. Every later attempt for the rest of that visit to the camera screen returns
   nothing immediately, before even trying to decode, because the very first check the reading
   code makes is whether it is already stuck. Barcode reading would then be silently dead for the
   remainder of that screen visit, with no coaching line, no message and no sign to the shopper
   that anything changed, recoverable only by leaving the camera screen and coming back to it
   (which builds the whole watching mechanism fresh). Whether one attempt taking more than 1.5
   seconds actually happens on a real phone in a real aisle was not something this session could
   measure from here; establishing that would need timing data from a real device under load, not
   a reading of the code alone.
8. **The exact object-tracking algorithm**, again since the calibration reference's frontend
   items were left to be confirmed here:
   1. A downscaled copy of the frame is converted to a single-channel edge map (an approximation
      of brightness change between neighbouring pixels), and a threshold set from that frame's own
      average and spread of edge strength decides which pixels count as an edge at all.
   2. Neighbouring edge pixels are grouped into connected blobs, and any blob smaller than a
      fixed fraction of the frame is thrown out as noise.
   3. Among the remaining blobs, the one with the most edge energy, weighted down the further it
      sits from the centre of the frame, is picked as the found box. If nothing clears the bar at
      all, nothing is found this way.
   4. If a trained image-recognition file has actually been placed in the app (checked once, by
      asking the server for that exact file and seeing whether it exists at all; it does not
      exist in this build as verified this session), its own separate detections are added
      alongside the blob-based one.
   5. All the boxes found either way are merged: sorted by confidence, and any box that overlaps
      more than 40 percent with a box already kept is dropped as a duplicate, keeping at most
      three boxes total.
   6. If nothing at all was found by either method, a fixed square in the middle of the frame is
      used as a fallback so the screen always has something to draw and to crop from.
   7. Whichever box the shopper has explicitly tapped (see below) is kept as the leading box for
      as long as a new pass still finds something overlapping it by more than 30 percent, or for
      1.6 seconds after it stops being found at all, whichever is shorter; after that the pick is
      dropped.
9. **What is drawn from that tracking, and how it moves.** The leading box becomes the reticle,
   padded out by 8 percent on every side (the same padding a photo is later cropped with, so the
   reticle always shows exactly the rectangle that would be sent). The reticle does not move on
   every frame: it only updates once the box has moved by more than roughly 4.5 percent of the
   frame, and even then it eases only 35 percent of the way to the new position each update
   rather than snapping straight there, which is the deliberate choice, stated directly in the
   capture code's own comments, to make the reticle read as locking onto something rather than
   jittering around it. Up to two further boxes beyond the leading one are drawn as real, separate
   buttons the shopper can tap, each announced to a screen reader as "scan this one instead";
   tapping one pins that object as the leading one.
10. **What is drawn for a barcode mid-read.** While a value is still accumulating agreement, a
    green-bordered mark is drawn over it with a thin fill bar underneath that grows in exact
    proportion to how many of the needed three frames have already agreed, animated smoothly
    rather than snapping in three visible steps. This is the literal, on-screen shape of
    "confirming" a barcode: the shopper watches a bar fill before the app commits to an answer.
11. **The camera also moves on its own while idle**, in two ways, neither one asked for by a tap:
    - **Zoom.** If the phone's camera can zoom optically or digitally and the found box is
      smaller than about 55 percent of the frame's short side, the app pushes the zoom in,
      capped at four times the minimum zoom the phone reports; it only acts after the box has
      stayed small for 900 milliseconds straight, and it will not change the zoom again within
      1.2 seconds of its last change.
    - **Torch.** A coarse brightness reading is taken from a sparse sample of the frame's own
      pixels. If it stays under a fixed dark threshold for 700 milliseconds straight, the torch
      is switched on automatically; if the frame later measures 60 percent brighter than that same
      threshold, the torch switches back off on its own. If the torch itself is what blows a
      label out (checked by measuring how much of the framed box has gone fully white once the
      torch is on), the torch is switched back off and is not allowed to relight itself for the
      rest of that visit to the screen, on the stated reasoning that a torch fired at a shiny
      wrapper or a freezer door makes the picture worse, not better, and the app should not keep
      making the same mistake.
12. **The four coaching lines, and the order they are checked in when more than one condition is
    true at once:** hold (a barcode is already partway read) outranks glare (too much of the
    framed box has gone fully white) outranks closer (the framed box is smaller than 360 pixels
    wide and there is no zoom left to spend on it) outranks pick (more than one object was found
    and the shopper has not chosen). Whichever one applies is not spoken immediately: it has to
    stay true for 850 milliseconds before it is shown at all, once shown it stays up for at least
    1.8 seconds even if the condition clears sooner, and once it would clear it still has to stay
    cleared for 900 milliseconds before the ordinary aim hint is allowed back. The "pick" line is
    only ever shown once per visit to the screen, on the reasoning that the two tappable boxes
    have already taught the choice the first time it happens. Every one of these four lines, and
    only these four, is something the tracking underneath idle can ever say; there is no path
    from a fifth, invented line reaching the screen.

## The instant a barcode or the shutter fires

13. The moment either a barcode is confirmed or the shutter is pressed, the screen moves out of
    resting: the reticle jumps to a fixed small box near the top third of the frame, every
    tappable alternate-object button and the barcode progress mark disappear at once (the
    capture code's own comment on this is direct: "nothing drawn over the feed survives the
    shutter"), and Shin's docked face begins a "thinking" animation while staying visible.
14. For a barcode, this moment is brief by design: the digits are checked first against a local
    list of items the app already knows to be priced, and that check runs in the browser with no
    network request at all before anything reaches the exchange the calibration reference
    documented; if that local list has nothing, the code is handed straight to the identify
    request the calibration reference already walked through in full. Either way this state ends
    within the time that one local lookup and, when needed, one network round trip take.
15. For the shutter, this is where a photo actually gets taken: a rapid burst of seven frames
    spaced 45 milliseconds apart is grabbed, the sharpest one of the seven (measured by a plain
    contrast-of-edges score) is kept and the rest discarded, and that single frame is cropped to
    the padded box the reticle was already showing before being handed onward.
16. **A second concrete defect found, not assumed, and the one place this section could not find
    any visible outcome at all.** If taking that burst or cropping it throws inside the browser
    for any reason, the capture code's own response is to report a short message meant for
    whoever is looking at the app's engineering logs, never the shopper: "The camera did not
    manage that shot. Try once more." That message reaches this screen's own code through the
    exact same channel every other signal from the capture code arrives on, but this screen never
    asked to be told about it: nowhere in this screen's code is there a handler for that message
    at all. The result, verified by reading every path in and out of this brief state: the screen
    stays sitting in the instant-after-the-shutter state indefinitely, the shutter button no
    longer does anything because it only acts while resting, and nothing on screen tells the
    shopper anything went wrong. The only way out is to leave the camera screen for another tab
    and come back, which rebuilds the whole surface from nothing. This was reached by reading the
    code's own error path, not by reproducing it on a phone; whether this actually happens in
    practice, and how often, is unverified from here and would need a real capture failure on a
    real device to confirm.

## Waiting on an answer

17. The wait is drawn as three named lines, one at a time highlighted, and the shutter itself
    turns into a spinning ring in place of the bottom bar sliding away, on the stated reasoning
    that a progress ring reads better than a control simply vanishing. The three lines only ever
    advance on a real event, never a timer standing in for one: the first is already showing the
    moment this state is entered, the second the instant the actual network request is sent, and
    the third the instant a response actually lands. A request still running past 0.8 seconds
    relabels whichever line is currently showing to a slower-sounding word, without ever
    inventing a step that has not actually happened.
18. **What crosses from this screen into the exchange the calibration reference already
    documented**, stated once here rather than re-describing that exchange itself:
    - A barcode that missed the local list carries only the digits into the identify request.
    - A photo carries the cropped image itself and that frame's own sharpness score.
    - Once an identity is settled and a price is typed, the price request carries the item's
      text, the barcode when one exists, the category, the typed asking price in cents, and the
      seller only when the shopper has already named a shop for this visit.
    - Coming back the other way, this screen only ever does one of four things with what the
      identify or price exchange returns: opens the price pad on a settled identity with no
      typed price yet, shows a list to choose from when the photo route came back with more than
      one plausible candidate, shows a card that has a price but nothing to compare it against
      when there is no comparison data at all, or shows the settled answer, whether that answer is
      a verdict or a refusal.
    - One further branch, dated 2026-09-15 in the code's own comments: if the photo route cannot
      match anything in the app's own catalogue but the model reading the photo still produced a
      plain-text guess at what it is, that guess is treated as an answer rather than a miss, and
      goes straight to the price pad labelled as unchecked, on the founder's own words recorded
      there: an unchecked answer is worth more than a ten-second wait that ends in "we don't
      know."

## Picking among several products

19. Two different lists can appear here, and they are deliberately not the same component reused.
    One is a short, fixed set of seven hand-priced items offered when a barcode was read cleanly
    but is not one the app has ever priced; it exists because there is no working image
    identification for that path yet, and it says so on the sheet itself, in a caption. The other
    is whatever a real search actually returned, offered either after a photo produced more than
    one plausible match or after the shopper asked to see other candidates than the one already
    picked; it carries no price on any row, because these are unpriced catalogue entries and a
    number would be invented.
20. Picking a row from either list moves straight to naming an asking price. Picking "something
    else" from the fixed seven does not guess a refusal on the shopper's behalf; it opens the
    price pad against a placeholder item and lets the real price engine's own answer be whatever
    it actually is.

## Naming an asking price: the clearest "confirming" state

21. This is the pad: a large number keypad, a percent-off or a "N for" multi-buy toggle that
    recomputes an effective unit price shown under the typed number, an optional shop row that
    remembers the shop chosen for this same rough location on an earlier visit, a Clear, a Skip
    that proceeds with no asking price at all rather than a refusal, and a dedicated confirm key
    that is the only thing that ever submits.
22. **Why a confirm key and not a pause-after-typing guess**, stated directly by the code's own
    reasoning: a debounce that assumes typing has stopped would price someone typing "2", glancing
    back at the tag, then typing ".49" as two dollars even, and a wrong verdict outranks no
    verdict under the priority this whole app is built to. The confirm key stays disabled until
    the effective price (after any modifier) parses to more than zero, and nothing is sent until
    it is pressed.
23. Whatever a shopper typed into a free-text name field on this same pad, when there is one,
    travels with the price as the one handle a later pass has for reattaching an otherwise
    unidentified price to a real product; an empty field is kept as nothing at all rather than as
    an empty piece of text, because an empty piece of text would later overwrite a name a
    different process might still resolve.

## Typing a name instead of a picture

24. This is the fallback out of a refusal that could not identify anything at all: a single text
    field rises over the still-visible, deliberately blurred (never hidden) live feed, asking for
    a brand and a model because what is typed here has to match against the app's own fixed
    catalogue.
25. What is typed is checked, in order, against the small set of items the app has actually
    priced first, and only if nothing matches there against the full catalogue, on the stated
    reasoning (quoted from the code's own comment) that a product this app can actually price
    beats a product it merely has a record of; the full catalogue check is measured, in that same
    comment, at 11 to 300 milliseconds depending on how common the typed words are.
26. Leaving this field with something typed but never submitted is tracked as an abandoned typed
    search, the same as leaving any other unfinished state; the value that was actually left in
    the field, not just the fact that the field was open, travels with that record.

## An answer arrives, and one thing the calibration reference asked to have confirmed here

27. Four different cards can land in this state: a verdict, a "no asking price was given" card
    that still shows the range of prices found, a refusal, and a plain acknowledgement card for
    the case where a price was written down against an item nobody could identify at all, which
    is explicitly built to look like neither a verdict nor a refusal because nothing was actually
    judged.
28. **The calibration reference left one thing explicitly open**: whether the frontend actually
    draws the graphic it described, a horizontal line with a small labelled dot for every store
    price found, dots merging into a count when they land on top of each other, and a tap on any
    small dot going straight to that store's page. **Checked directly against the running code
    this session, and it does not.** What actually renders is a plain horizontal track with a
    shaded band marking the low-to-high range, a small tick mark for every comparison price with
    no visible label at all (only a tooltip that only a pointer, not a finger, can trigger), one
    larger mark for the shelf price itself, and three lines of text: the low end, the high end,
    and the word "you" under the shopper's own price. There is no merging of overlapping ticks,
    no per-dot quantity-and-price label, and no tap-through from a tick to a store's page anywhere
    in this rendering. **This is a plan-versus-code disagreement, stated in full on both sides
    rather than resolved here:** the design documents describe the richer, per-store labelled
    graphic as the intended screen, and this is repeated in the calibration reference as
    "designed, from the planning documents, in full." The code that actually draws the verdict
    and the refusal today draws the simpler track-and-band version instead, with none of the
    labelling, merging or tap-through the plan describes.

## What "error" actually looks like, since the running code has no state by that name

29. Stated once more because it is the load-bearing fact of this whole question: the screen's own
    opening rule is that a refusal is not an error path, and every refusal, including one caused
    by a technical failure rather than an honest business answer, is drawn with the same grey
    tier, the same face-and-voice component, and the same short landing motion as any other
    refusal. There is no separate red state, no separate icon, and no separate layout for a
    technical failure anywhere in this screen's code.
30. What actually happens for each real way something can go wrong during capture:
    - **A network request during the wait fails outright** (the identify or price call itself
      throws). Verified directly in the code: the raw technical error is written only to the
      browser's own developer console, never shown to the shopper, on the stated reasoning that a
      raw technical message is not something a shopper standing in an aisle can act on. What the
      shopper sees instead is an ordinary refusal card, in Shin's own voice, naming whatever the
      app already knew about the item if anything, with the same one repair action every other
      refusal offers.
    - **A photo could not be read at all**, or was read but the network was down at the time. Both
      land on the same ordinary refusal card; the offline case additionally saves the photo itself
      to the phone's own storage first, so it is retried automatically the next time the phone
      reports itself online or the app is brought back to the foreground, rather than being lost.
    - **The camera, or the trained recognizer inside it, cannot start at all** (permission denied,
      no camera hardware, a private browsing window, or a browser that will not run the reading
      code). Confirmed directly in the capture code's own comments: this is explicitly written as
      not being an error case. The screen falls back to exactly the same controls it would show
      otherwise, either a real plain camera feed with no barcode reading or object tracking at
      all, or, with no camera whatsoever, a drawn illustration of a shelf standing in for the
      feed so every button stays in the same place. Nothing on screen tells the shopper this
      happened; the only record of it is a message sent to the app's own server for whoever reads
      those logs.
    - **A manual photo capture throws inside the browser**, and **a barcode reader that has
      timed out once on a single frame**, are the two paths this session verified produce neither
      a refusal nor a fallback nor any other visible change at all, described in full above. These
      are the two places where the stated rule ("a refusal gets the same care as an answer") and
      the actual code disagree most sharply: the written rule is that every negative outcome gets
      handled with care, and these two paths, verified directly rather than assumed, hand the
      shopper nothing at all.

## Open items this document is leaving in, rather than resolving

31. Whether the fully hands-free capture path already built into the capture code (holding steady
    and in focus on a single object for long enough to fire the shutter with nobody touching it)
    is meant to replace the manual shutter for anything other than a barcode is not settled by
    anything read this session. It exists, fully working, in the capture code; this screen turns
    it off by passing it a fixed "off" setting rather than leaving it to whatever the capture code
    would otherwise default to, and nothing explains why one packaged-goods photo needs a tap
    while a barcode never does.
32. Whether the barcode reader's permanent stop after one single slow decode (defect, item 7
    above) is a known and accepted limit or an unnoticed defect is not settled by anything read
    this session; nothing in the code's own comments discusses it either way.
33. Whether a shopper is meant to see any message at all when a manual capture fails outright
    (item 16 above) is likewise not settled by anything read this session; no written rule
    covering this exact case was found on either side.
34. This document's own mapping of "tracking" onto the continuous watching behaviour of the
    resting state, and "confirming" onto both the asking-price pad and the barcode's own
    multi-frame agreement, is this session's translation of four requested words onto seven
    states that do not use them. A later session, or him directly, may mean something narrower
    or different by those four words than what is mapped here.
