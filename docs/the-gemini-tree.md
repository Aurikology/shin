# The Gemini tree

**The root is one feature: Shin asking Gemini to identify, price, review and describe a
product, inside Google's terms, wherever Shin's own free sources have nothing.** It is drawn in
the format and under the rules of `the-tree.md`, the same tree the moonshot was drawn in, on
the same instruction. Jamin, 2026-09-14: *"of all the items, go through each and figure out how
you are going to do them. This should be the same process as when you built the tree from the
moonshot. You are not build a build plan, you are building a tree that explores all avanues."*
Two later additions the same day widened the root: *"just because we cannot save gemini
prices, doesn't mean we cannot save user interpretations of prices. We can save user images,
their products, ask them if they are satisfied with their product, where they shopped, we can
even ask them what range they would be satisfied with for this product, etc."*, and *"gemini
should also provide prdocut desciptions,"* which reverses plan-gemini.md's earlier "no
description" and is why section 2 carries a description field.

**This is not a build plan, and no code was written to make it.** Every leaf below is either
something already true of the code as it stands today, checked by opening the file named on its
line, or something not yet built, named as one of the seven end states below. Nothing in this
pass typed a line of code, ran a build, or committed anything.

**A node marked "⇄ avenue:" is a distinct way of doing the thing the node above it names, not a
child of it.** Where more than one way exists, every way is written as its own avenue note: what
it needs, what rules it out or limits it, and whether it was tested, with the chosen way's own
work carried as the node's real children below the notes. A rejected avenue says why and what
would bring it back, per rule 10 of `the-tree-rules.md`.

**Seven end states, and nothing else:** running, with the outside check named; written with
nothing calling it; buildable in one sitting, with the measurement that will show it worked;
blocked outside, someone else's policy or data standing in the way, with what lifts it named;
his, a call only he can make, written as the question it waits on, since nobody was asked
anything while this was drawn and he is unavailable; a wall, a thing a company this size cannot
build, kept with its way around beneath it; and a standing rule, enforced from now on rather
than built once, carrying what enforces it and what catches a breach.

**A build was started by mistake before this pass and stopped; it sits uncommitted in the Mac's
own working copy of the repo and was never asked for.** It is read from where it sits, never
modified, and it is never counted as "exists": a leaf that names it says "written, uncommitted,
no caller" at most, since nothing in the running app calls any of it and its own test suite
disagrees with itself, 182 of 188 identify tests passing and typecheck carrying 4 errors.
Whether it is kept or deleted is his to decide, named as its own leaf in section 9.

**Seven slots per node, not eight.** The rules name eight dimensions, but one of them, what
happens behind the glass, is the node's own children rather than a note; writing it twice would
say the tree inside the tree. So seven are written as notes, and a "what happens behind the
glass" note is kept beside the children only on the handful of nodes where it says something the
children do not already carry, never as a required eighth slot.

**The shape, counted by `scripts/count-the-tree.mjs`, never by hand:** ten sections, and four
layers of what each is made of, **86, then 123, then 56, then 0**, with **183 ends** spread
across those depths, 7 at the second level, 120 at the third, 56 at the fourth, 0 at the fifth.
No wall appears in this branch; every block found is either someone else's policy (blocked
outside) or his to decide, never a thing this company is too small to build. The dimension
review covers all 86 second-level nodes at seven slots each, 602 in total, and 0 of 602
dimension slots are left silent as of this pass, every one carrying a note rather than being
counted as covered by default.

---

## The root

**Every product Shin's camera meets is identified, priced, reviewed and described by asking
Gemini, inside Google's terms, wherever Shin's own free sources have nothing to say.**
*Kind: all kinds. Moves: answered from real prices on the thing itself, and where it cannot,
answered from something weaker; the decision outcome; what each payer leaves after the store's
cut and the model bill; installs per video; corrections per hundred verdicts, the goal figures
from docs/the-vision.md that this branch's ten sections actually move. From: Jamin, 2026-09-14,
the quote above, and plan-gemini.md, the decisions and terms readings behind every section.*

Ten things below. If all ten existed, nothing would still be missing for a person to point their
phone at something Shin's own sources cannot answer and get a real answer back, inside what
Google allows, without Shin ever storing what it is not allowed to keep.

---

## 1. It knows what the thing is
*Kind: all kinds. Moves: answered from real prices on the thing itself, and where it cannot,
answered from something weaker. From: Jamin, 2026-09-14: "lets switch to gemini for barcode and
image searches. Shin should be recommneding the user to search barcodes and if it doens't have a
barcode, it should search the image. shin should guide the user to frame the image correctly."
[docs/plan-gemini.md §1]*

This redraws the existing "It knows what the thing is" branch for the one change decided
2026-09-14: Gemini takes over a barcode miss and any photo identification. The barcode-first
flow, the catalogue, and the classifier that already exist
are named where this branch touches them and are not redrawn here.

- **Barcode is recommended first, before a photo is ever asked for.** *Kind: all kinds. Moves:
  answered from real prices on the thing itself.*
    · **What the person sees:** an instruction to point at the barcode before the camera does
      anything else, so the free path is tried before any paid one.
    · **How it looks and sounds:** the same aim hint and coaching-line dock the barcode reader
      already uses, not a new surface.
    · **What it costs and earns:** free; a barcode read costs no model call.
    · **What we are allowed to do:** does not apply, no Gemini or Google content is involved in
      choosing what to point at.
    · **Who runs it when it breaks:** does not apply, a missing hint is a coaching-line
      regression, caught the way any of those are caught.
    · **What it feeds back:** does not apply, showing an instruction records nothing.
    · **How it reaches people:** does not apply, an on-screen instruction is not a moment worth
      filming on its own.
  - The line's wording and when it shows, on camera open, before any read is attempted. **Shown
    by:** somebody who has not seen the app opening the camera and pointing at a barcode without
    being told to scan a receipt or a shelf tag instead.
  - Not built today: no such instruction and no timing logic exists on the camera screen, checked
    by searching it for the wording and for a mode switch. **Buildable. Shown by:** the wording
    added to the coaching-line dock and shown on camera open, without a new UI surface built for
    it. [camera.js, coach keys at 63-68, searched 2026-09-14][item 54]

- **With no barcode read after a few seconds, the app moves to photo mode on its own.** *Kind: all
  kinds. Moves: answered from real prices on the thing itself, and where it cannot, answered from
  something weaker.*
    · **What the person sees:** the screen switching itself to photo framing, or an early tap for
      "there is none," never a menu hunt.
    · **How it looks and sounds:** the same face and dock that speak coaching lines announce the
      switch, so it reads as one conversation.
    · **What it costs and earns:** free until a photo is actually taken.
    · **What we are allowed to do:** does not apply.
    · **Who runs it when it breaks:** nobody dedicated yet, since the timer does not exist yet.
    · **What it feeds back:** once built, how often people wait out the timer versus tap early is
      worth keeping, to tune the number of seconds.
    · **How it reaches people:** does not apply.
  - The number of seconds before the automatic switch, and the escape hatch for someone who
    already knows there is no barcode. **Shown by:** the timer measured against a real person's
    own sense of "it's been a while," and a tap that skips it immediately.
  - Not built: no such timer, no such copy, and no early-exit tap were found on the camera screen.
    **Buildable. Shown by:** the timer and escape-hatch tap wired into the camera screen and
    tested against a real person's own sense of when photo mode should take over. [camera.js,
    searched 2026-09-14][item 55]

- **A barcode not on the shelf is looked up through Gemini's grounded Google Search, for this one
  person only.** *Kind: things that carry a code. Moves: answered from something weaker, since a
  Gemini-found price is a national online price, not this store's own, until Shin has store-level
  prices [docs/plan-gemini.md §7, item 12]. From: Jamin, 2026-09-14 [docs/plan-gemini.md §1];
  work-list item 16.*
    · **What the person sees:** a product name, brand and size where "we don't have this" used to
      be the whole answer, or nothing new if Gemini also misses.
    · **How it looks and sounds:** the same reading state the barcode-hit path already shows; each
      fact carries its own source link or a plain "no link for this" beside it.
    · **What it costs and earns:** paid, on a code that costs nothing today; roughly 0.3 to 0.6
      cents estimated for identification, plus this is the point at which the Google Search
      allowance (5,000 free a month, then $14 per 1,000) starts being spent for identification
      rather than for prices [docs/plan-gemini.md §3].
    · **What we are allowed to do:** the answer is a Grounded Result and may never be written to
      the shared catalogue, only to this one scan's own record, for up to two years
      [docs/plan-gemini.md §2.1]. The field carrying it already says so in its own comment, which
      is documentation, not an enforced test. [app/server.ts, groundedIdentity field, opened
      2026-09-14]
    · **Who runs it when it breaks:** whoever watches the spend cap and daily call cap, since a
      barcode-miss rate spike now costs money it never used to. Waits on section 7, "the daily
      call cap and spend cap, extended to Gemini calls."
    · **What it feeds back:** does not apply to the grounded answer itself, since it cannot be
      learned from; the paired front-photo request below is the harvest instead.
    · **How it reaches people:** does not apply.
  · ⇄ avenue: Shin's own catalogue, tried first, already loaded from icecat, openfoodfacts,
    openbeautyfacts, openproductsfacts and openpetfoodfacts [catalogue/src/routing.ts, lines
    185-196, opened 2026-09-14]. Needs nothing further; it already runs. Limited to whatever the
    batch loaders cover. Tested: this node exists because that avenue already failed on this
    barcode.
  · ⇄ avenue: Gemini with Google Search grounding (chosen). Needs the paid tier and a search
    budget; ruled out for shared storage by Google's terms. Tested on the consumer website, not
    the API: a four-barcode search returned two correct products with real source links, one
    honest "NOT FOUND," and one plausible but independently unverified match; a repeat of the
    fourth barcode alone, in a fresh chat, returned a different variant name for the same code
    with no source link at all. Rival explanation: the consumer website is not the API and runs
    its own retrieval and safety layer; what would separate them is the same barcodes sent through
    the API with the key. Website test pending for any barcode outside this one four-item set.
    [gemini-web-tests.md, T1a and T1b, 2026-09-14]
  · ⇄ avenue: Gemini without search, on the digits alone. Needs nothing beyond a call with search
    off. Limited to nothing, since a barcode's digits carry no fact an ungrounded model could
    reason from. Rejected, untested: it would guess or refuse, and no document proposes this.
  · ⇄ avenue: a third-party barcode lookup service (for example UPCitemdb). Needs an account, a
    fee schedule and a terms reading, none looked up. Limited by whatever coverage such a service
    turns out to have, unknown. Not evaluated in any of Shin's documents; not ruled out, only
    unsourced, not tested.
  · ⇄ avenue: Open Food Facts queried live rather than from Shin's own batch export. Needs a live
    query path this app does not have today. Limited to grocery; does not help a tech or
    used-goods miss, and distinct from the catalogue avenue above because the batch export can go
    stale between loads. Not built, not tested.
  · ⇄ avenue: asking the person to type the barcode digits. Needs one field and a number
    keyboard, which already exists for today's own-source verdict. Limited to a camera that
    cannot read a code at all; does not help once a code IS read and simply matches no shelf row,
    which is this node's actual case. Not tested against this case, since it does not apply here.
  · ⇄ avenue: a specific retailer's own product API. Needs a relationship with that retailer,
    which does not exist. Limited to nothing evaluable until one does. Not sourced, not tested.
  - The grounded request itself: product name, brand, size, with a source link per fact. Written
    but not reachable from the app: the function exists, is imported into the server file, and is
    never called from it. Written, no caller. **Shown by:** the same grep showing the import at
    `app/server.ts:45` and no call anywhere else in that file. [identify/src/providers/
    gemini-grounded.ts, groundedBarcodeLookup at line 493; app/server.ts, import at line 45, grep
    for a call found none, both opened 2026-09-14][item 16]
  - wiring: the barcode route's own miss branch is the exact hook point and does not call the
    lookup above. This is this level's missing wiring child under rule 8, named again as the
    route itself in section 10. **Buildable. Shown by:** the miss branch calling the lookup above
    and a name and source appearing where "we don't have this" used to be the whole answer.
    [app/server.ts, the `failureClass` line at 1729-1826, opened 2026-09-14][item 44]
  - Every fact with no link gets a plain heads-up rather than being dropped, since every answer is
    accepted. **Shown by:** a fact with no source link showing the heads-up beside it rather than
    a blank or a dropped field. [item 25]
  - **HIS:** whether the same trust rule the vision states for a typed price or a photographed
    tag applies to a machine-read barcode-to-photo pairing before it is served to a stranger,
    since no document names one for this case; undecided whether a single ungrounded reading gets
    trusted immediately or is held for a second confirming scan first.

- **A front photo is asked for after a barcode miss, and the ungrounded reading of it is stored
  paired with the barcode.** *Kind: all kinds. Moves: answered from real prices on the thing
  itself, since this is what lets the same barcode answer for free the next time anyone scans it.
  From: work-list items 35 and 58; "so on a barcode miss, Shin also asks for a photo of the front,
  and the ungrounded identification is paired with the barcode" [docs/plan-gemini.md §2.1].*
    · **What the person sees:** one extra prompt after a miss, asking for a straight-on photo of
      the front, framed by the same coaching mechanism as the node below.
    · **How it looks and sounds:** the existing photo-mode camera screen, only a new reason to be
      shown it.
    · **What it costs and earns:** one ungrounded photo call, the same cost as any other photo
      identification; paid back the first time anyone else scans the same barcode and gets a free
      answer.
    · **What we are allowed to do:** an ungrounded reading is ordinary model output, not a
      Grounded Result, so it can be stored in the shared catalogue like today's Claude answers
      [docs/plan-gemini.md §2.1].
    · **Who runs it when it breaks:** whoever watches the catalogue load job, since a wrong pairing
      pollutes the shelf every future scanner reads from.
    · **What it feeds back:** every accepted pairing grows the free catalogue by one row, the
      harvest every scan is meant to be.
    · **How it reaches people:** does not apply.
  - The prompt's wording and when it shows, immediately after the "not in our catalogue" state,
    not buried in a menu. **Shown by:** somebody who has not seen the app being asked for a photo
    right where the miss was shown, with no extra tap to find it. [item 58]
  - wiring: the pairing write reuses the same ungrounded identification path as the node below,
    joined to the barcode that triggered it, then written through the catalogue's existing load
    path rather than a new table. [waits on: a photo is read by Gemini without search,
    structured and storable; it knows what the thing is]

- **With no barcode at all, a photo is read by Gemini without search, structured and storable.**
  *Kind: all kinds; a tech item's target is the box label or spec sticker, not the product itself
  [docs/plan-gemini.md §6]. Moves: answered from real prices on the thing itself, and where it
  cannot, answered from something weaker. From: Jamin, 2026-09-14 [docs/plan-gemini.md §1];
  work-list items 15, 21, 23.*
    · **What the person sees:** a name, brand and, for tech, a model number appearing from a photo
      with no typing.
    · **How it looks and sounds:** the same reading state as any photo identification today.
    · **What it costs and earns:** about 0.3 cents estimated on the cheaper model, about 0.6 cents
      on the stronger one, against Claude's own measured average of 0.26 cents over 15 scans the
      same day [docs/plan-gemini.md §3; docs/gemini-work-list.md, "Facts already established"].
    · **What we are allowed to do:** an ungrounded reading is ordinary model output and may be
      stored in the shared catalogue; the one identification path with no Google-terms storage
      restriction [docs/plan-gemini.md §2.1].
    · **Who runs it when it breaks:** whoever watches the wrong-kind and refusal rates; Claude's
      own measured refusal rate on this exact job is 4 of 15 photos, a baseline Gemini has no
      measurement against yet.
    · **What it feeds back:** every accepted reading grows the catalogue, the same harvest as the
      paired-barcode node above.
    · **How it reaches people:** does not apply.
  · ⇄ avenue: Gemini, ungrounded (chosen). Needs the ungrounded photo call this section already
    builds; storable, per the terms note above. Tested twice on the consumer website, same
    physical can, two photos: a photo of the front (T2), asked for brand, name, variant, size and
    barcode with no search tool, correctly named the product and variant, matched the phone-photo
    ground truth exactly, and correctly declined to guess the size or barcode since neither was
    visible rather than inventing one; a first attempt on the same image failed outright with a
    generic error and needed a fresh chat to succeed. A second photo, of the can's back panel with
    the barcode visible (T3, same prompt), read the barcode as an exact digit-for-digit match to
    the ground truth and repeated the same brand and variant as T2, so the two ungrounded photo
    reads agree with each other and with the ground truth. Rival explanation: two photos of one
    product is still a small sample, and the consumer website is not the API; what would separate
    them is the same two images through the API with the key, on more than one product.
    [gemini-web-tests.md, T2 and T3, 2026-09-14]
  · ⇄ avenue: Gemini, grounded (with search). Needs a second paid call, since search and
    identification are unconfirmed as one request (below). Limited to a Grounded Result, shown
    once to the asking user the way a barcode-miss lookup is, never stored in the catalogue.
    Rejected for shared storage, untested: no document calls for a second paid photo call when
    the ungrounded one already answers.
  · ⇄ avenue: asking the person to type the name. Needs one field, which already exists. Limited
    to a photo that also fails; slower for a person already holding the item up to the camera, so
    not the first resort. Not tested here, since a photo is tried first.
  - General fields returned: product name, brand, size value, size unit, pack count, category, as
    structured output. **Buildable. Shown by:** one photo of a known product returning every
    field, or a stated reason for each field left blank. [item 15]
  - Whether the item is a spec-variant product, as structured output. **Buildable. Shown by:** a
    tech item's photo returning true and a non-tech item's photo returning false, both read
    correctly. [item 15]
  - Tech-gated fields, returned only when the item is a spec-variant product: model number and
    specs when visible, as structured output. **Buildable. Shown by:** a tech item's photo
    returning both fields when visible, and a stated reason when not. [item 15]
  - Image format and size limit: jpeg, png, webp or heic, under Google's 20 MB inline limit.
    **Buildable. Shown by:** one photo at each accepted format sent and accepted, and one
    oversized file rejected before the call is made. [item 21]
  - **HIS:** which resolution level a request picks, roughly 280, 560 or 1120 tokens per image on
    Gemini 3, a fourfold cost difference between the lowest and highest for the same photo, since
    nothing in this plan sets that rule and it is a cost-versus-accuracy call, not a build task
    belonging to this pass. Untested at any level: no real call has been made from this
    environment yet. [item 21]
  - Untested: whether an image and Google Search can run in one request. Google's own docs do not
    say either way. Website test pending: none of the collected consumer-website tests sent an
    image alongside a search-grounded prompt in the same turn; the barcode tests were text only
    and the photo test carried no search tool. **Buildable. Shown by:** one real API call with
    both, read for grounding metadata in the reply. [item 23]
  - wiring: the live photo route must call the Gemini provider directly, not a hand-built
    client, or none of this reaches Gemini regardless of what is built here.

- **Framing coaching keeps a photo readable before it is sent, and tech is coached differently
  from everything else.** *Kind: all kinds; tech's target is the box label or spec sticker
  [docs/plan-gemini.md §6]. Moves: answered from real prices on the thing itself, and where it
  cannot, answered from something weaker, since a badly framed photo answers nothing at all. From:
  work-list item 56; docs/plan-gemini.md §8.*
    · **What the person sees:** coaching text asking them to fill the frame with the front label,
      hold steady, get good light, keep to one product, or for tech to show the box label or spec
      sticker instead of the device.
    · **How it looks and sounds:** the same face and dock mechanism already used for barcode
      coaching, reused rather than rebuilt.
    · **What it costs and earns:** free; coaching runs before any model call.
    · **What we are allowed to do:** does not apply, no Gemini or Google content is involved
      on-device.
    · **Who runs it when it breaks:** whoever watches the wrong-kind and refusal rates this
      coaching exists to lower.
    · **What it feeds back:** does not apply, a coaching line shown is not stored as a signal
      today.
    · **How it reaches people:** does not apply, coaching is meant to be invisible when it works.
  - wiring: the mechanism itself, the same gate and dock that already time barcode coaching,
    reused rather than rebuilt for photo-framing coaching. Buildable, not existing today: today's
    four keys are all about barcode-reading conditions, not photo framing for identification.
    **Shown by:** one new coach key firing through the existing gate and dock with no new UI
    surface built. [app/src/eye/framing.ts, chooseCoach at line 130; app/public/js/screens/
    camera.js, the four existing keys at lines 63-68, both opened 2026-09-14][item 56]
  - The "fill the frame" coaching line. **Buildable. Shown by:** the line shown when a photo is
    framed too small, and not shown once it fills the frame. [item 56]
  - The "hold steady" coaching line. **Buildable. Shown by:** the line shown during visible
    camera shake, and not shown once the frame is still. [item 56]
  - The "get good light" coaching line. **Buildable. Shown by:** the line shown on a dark or
    backlit frame, and not shown in adequate light. [item 56]
  - The "keep to one product" coaching line. **Buildable. Shown by:** the line shown when more
    than one product fills the frame, and not shown on a single product. [item 56]
  - The tech box-label coaching line, shown only when the item is known or suspected to be tech.
    **Buildable. Shown by:** the line shown on a tech item's frame instead of the general
    product-framing line. [item 56]
  - Keep close and back-to-camera working so the new coaching does not regress the existing
    zoom-and-flip behaviour. Exists, unchanged by this work: `reset()` is called from more than
    one handler in the same file, not only defined. **Shown by:** the cancel-scan handler's own
    call to it. [app/public/js/screens/camera.js, reset() at line 3236, called at line 3509,
    opened 2026-09-14][item 57]

- **The app asks the one thing identification could not get on its own.** *Kind: all kinds; the
  spec question applies to spec-variant items only, the size question to unit-scaled items missing
  a size. Moves: answered from real prices on the thing itself, since a verdict cannot be built at
  all without a size or a settled variant [docs/plan-gemini.md §5, §6]. From: work-list items 49,
  50, 59.*
    · **What the person sees:** at most one extra question, asked only when needed, never a form.
    · **How it looks and sounds:** a single question in the same sheet and dock style as the rest
      of the flow.
    · **What it costs and earns:** free to ask; a guessed-wrong variant costs more later than one
      question up front.
    · **What we are allowed to do:** does not apply; the answer is the person's own input, not a
      Google result.
    · **Who runs it when it breaks:** whoever watches how often people abandon a scan at this
      question, since a badly worded one is a new way to lose someone mid-scan.
    · **What it feeds back:** an answered question is itself a fact worth keeping on the item once
      it lands in the catalogue, the same as any other harvested field.
    · **How it reaches people:** does not apply.
  - The size question, asked only when neither the catalogue nor the photo identification returned
    one. **Shown by:** an item with no size anywhere upstream stopping at this question rather
    than silently guessing or dropping the size dimension. [item 50]
  - The spec question for tech, asked only when the identification could not settle which variant
    it is, and asked before any grounded search runs, so the search itself targets the right
    variant. **Shown by:** a tech item with an ambiguous storage size or model stopping at one
    question before any price search fires. [item 49]
  - The two prompts' wording, written once each. **Shown by:** both questions read by somebody who
    has not seen the app and answered correctly on the first try. [item 59]

---

## 2. Gemini finds the prices, reviews and description
*Kind: all kinds; the store-offer fields for model number, specs and condition apply only to
spec-variant products, unit scaling to the rest. Moves: answered from real prices on the thing
itself. From: Jamin, 2026-09-14, plan-gemini.md §4.1 ("can we make it so that gemini only
responds with the prices of stores and the review of the product"), extended the same day:
"gemini should also provide prdocut desciptions."*

Seven things below. If all of them existed, what would still be missing is only the screens that
draw what comes back (the price line, the review block, the "no link" tag), which are built in
the result-screen branch, not here; this branch's own wiring child is the single request builder
that every one of the seven either shapes or reads.

- **The one grounded call, and only these fields come back.** *Kind: all kinds; tech fields
  gated on spec-variant. Moves: answered from real prices on the thing itself. From:
  plan-gemini.md §4.1, and Jamin's description addendum above.* [item 17]
    · **What the person sees:** a price line, a review block and a short description under the
      photo they just took, not a chat transcript (looked at by: the three sections identified
      on a real result screen by somebody who has not seen the app)
    · **How it looks and sounds:** does not apply here: the drawing of the line and the block is
      the result-screen branch's work; this node only produces the JSON they draw from
    · **What it costs and earns:** the search half of the call is free up to 5,000 queries a
      month, then $14 per 1,000; the identification half is priced per model (children of
      section 7's model node) (looked at by: the bill, once real calls exist)
    · **What we are allowed to do:** every field returned here is a Grounded Result under
      Google's terms (ai.google.dev/gemini-api/terms, read 2026-09-14): shown only to the
      asking user, stored at most on that user's own scan record for up to two years, never
      written to the catalogue or served to anyone else (looked at by: a test that no field
      from this call reaches another user's screen or the shared catalogue)
    · **Who runs it when it breaks:** a schema mismatch or an empty return is this call's own
      problem, handled by the error and empty-result children below, not a person paged
      (looked at by: the two children's own outside checks)
    · **What it feeds back:** nothing pooled; a Grounded Result cannot be learned from or
      analyzed, so this call feeds only the one scan record it answered (looked at by: the same
      test as above, run against the training and analytics paths)
    · **How it reaches people:** does not apply: this is a JSON response, not a moment on
      screen, and it is not the video-sharable step
  · ⇄ avenue: one call asking for offers, reviews and description together, versus three
    separate calls. One call is cheaper (one search grounding, one round trip) and is what the
    leftover uncommitted code builds today, but a single safety block or empty result takes all
    three down at once. Three calls isolate failures (a blocked review does not cost the price
    line) at three times the search cost. Measured 2026-09-14, consumer Gemini web, not the API:
    one combined prompt asking for offers, reviews and description as JSON returned all three in
    one reply, three retailer offers with a size, condition and a url each, a reviews block with
    rating, count and summary, and a description, in the requested shape. Also found: every url
    field was filled, none returned null as the prompt's own "null for anything you have no
    source" instruction asked for, and the reviews block's url was a copy of the first offer's
    url rather than a distinct review source, a sign that one or more of those urls is not a
    real citation. Rival explanation: the consumer website is not the API's Interactions call
    with citations required, and may fill a field rather than admit it has none; what would
    separate them is the same prompt through the API with the key, checked against the
    citations the terms require rather than the field simply being non-null. **Shown by:** the
    JSON reply text, already collected. [gemini-web-tests.md, T4, 2026-09-14][item 17]
  - The general store-offer fields, needed for every product: retailer, price in CAD, url, size
    value, size unit, pack count. *(from: plan-gemini.md §4.1; moves: answered from real prices
    on the thing itself)* Written, uncommitted, no caller; never "exists". The leftover
    uncommitted schema asks for only retailer, price and url today; size value, size unit and
    pack count are not requested at all, so unit scaling would have nothing to run on, a
    different branch. T4's website measurement, above under this node's own one-call avenue,
    shows retailer, price and size fields returning filled on the consumer website. A second
    measurement, 2026-09-14, consumer Gemini web, not the API (T8, a per-kg
    store-brand-versus-name-brand comparison, asked for a size that does not exist, 1 kg, for the
    scanned product): the reply caught the false premise instead of inventing a 1 kg price,
    returned the real 750 g and 2 kg sizes converted to a per-kg figure, and its five links
    resolved to specific per-product pages rather than homepages or search redirects, the
    strongest source-link showing of any collected test. Rival explanation: the website's own
    retrieval chose to correct a bad premise and surface strong sources on this one prompt;
    nothing here guarantees the same request through the API returns links this specific every
    time. **Shown by:** one real grounded call for a barcoded product returning every one of the
    six fields, present or explicitly null, never silently dropped, plus the chat's rendered
    reply for T8, already collected. [gemini-web-tests.md, T8, 2026-09-14][item 16, item 17,
    item 28]
  - The tech-gated store-offer fields, needed only for spec-variant products: model number,
    specs, condition. *(from: plan-gemini.md §4.1; moves: answered from real prices on the thing
    itself)* Written, uncommitted, no caller; never "exists". The same leftover schema
    (`identify/src/providers/gemini-grounded.ts:527`, opened 2026-09-14) requests none of the
    three, so the tech variant filter would have nothing to run on, a different branch. T4's
    website measurement showed a condition field returning filled on the consumer website; model
    number and specs were not asked for in that prompt and remain untested either surface.
    **Shown by:** one real grounded call for a spec-variant product returning all three fields,
    present or explicitly null, never silently dropped. [gemini-web-tests.md, T4, 2026-09-14]
    [item 16, item 17, item 30]
  - The review fields: rating, count, short summary, url. *(from: plan-gemini.md §4.1; moves:
    the decision outcome, since a review is read before the tap that says bought or walked)*
    **Shown by:** the same real call returning a `reviews` array with all four fields. The
    leftover schema already asks for this shape close to as specified (`source`, `rating`,
    `count`, `summary`, `url`); written, uncommitted, no caller. T4's website measurement, above
    under this node's own one-call avenue, returned all four fields but with the url copied from
    an offer rather than a distinct review source, a finding this node's own outside check
    should test for once the API call exists. A second measurement, 2026-09-14, consumer Gemini
    web, not the API (T9, a reviews-only prompt asking for rating, count, source URLs and a
    summary): the reply stated three different numbers for the same rating and count within one
    answer (a product-card "4.7 (73)", an "Average Rating: 4.6... aggregated around 4.7", and a
    "Number of Reviews: 84 customer ratings (73 written reviews)" that introduces an 84 found
    nowhere else), and none of the four source links was tied to any one of those numbers. Rival
    explanation: the website's own product-card widget and its written answer may be pulling
    from two different aggregations that were never meant to match, not a single Grounded
    Result contradicting itself; what would separate them is one API response's own `reviews`
    object, which under the Interactions API is a single structured field rather than a
    card-plus-prose blend, so this specific failure mode (two numbers in one reply disagreeing)
    may not have anywhere to occur. Either way, this node's own outside check needs to catch a
    reviews object whose own fields disagree with each other, not only a missing url. **Shown
    by:** the chat's rendered reply, already collected. [gemini-web-tests.md, T9,
    2026-09-14][item 17]
  - The description: a short write-up of what the thing is, no price and no advice inside it,
    reversing plan-gemini.md §4.1's original "no description, no advice." *(from: Jamin,
    2026-09-14, the later quote above; moves: the decision outcome)* Governed identically to the
    other two fields under Google's terms, since it is equally a Grounded Result: shown only to
    the asking user, never stored for anyone else. **Buildable.** Shown by: the same call
    returning a `description` field, and a check that it never appears on any screen but the
    asking user's own. T4's website measurement, above under this node's own one-call avenue,
    returned a description field in the requested shape, one sample on the consumer website. Not
    in the leftover code's schema at all, since that code predates the
    reversal; nothing to point at yet.
  - What happens when Google Search finds nothing for this item. *(from: the-vision.md
    principle 1, always answer; Jamin, plan-gemini.md §1, "we will accept all answers gemini
    gives"; moves: answered from something weaker)* An empty `listings` array is a true zero, not
    a broken call, and CLAUDE.md's priority 1 in this repo's sibling and this app's own founding
    rule say the same thing: a zero result is unknown until something proves the search could
    have found a hit. **Buildable.** Shown by: a product with a real Canadian retail presence
    returning zero grounded offers, and the response recording "no prices found by search" rather
    than a claim the product is not sold, so it can be told apart from a genuine absence; the
    empty case then hands off to the next rung of the evidence ladder (Shin's own arithmetic
    verdict, item 47, a different branch), not to a refusal.

- **Instructions on every request: Shin's voice, the user's language, short lengths, a fixed
  JSON layout.** *Kind: all kinds. Moves: what each payer leaves
  after the store's cut and the model bill. From: plan-gemini.md §2.3, and Jamin, "can we frame
  gemini to respond in a certain way."* [item 18]
    · **What the person sees:** an answer that reads like Shin, in the language they set up in,
      never a raw model voice (looked at by: a French-set-up user's grounded answer read by
      somebody who has not seen the app)
    · **How it looks and sounds:** the voice is shaped by instruction inside the request, never
      by rewriting the answer after it returns, because Google's terms forbid modifying a
      Grounded Result after the fact (plan-gemini.md §2.2) (looked at by: the request text
      itself, checked for the voice instruction, against the render code, checked for the
      absence of any post-processing of the returned text)
    · **What it costs and earns:** a short, fixed-shape answer is fewer output tokens per call,
      which is most of what a grounded call bills beyond the search fee (looked at by: token
      count on a real call against the same call with no length instruction)
    · **What we are allowed to do:** structured output combines with Google Search only on
      Gemini 3 models, marked preview (ai.google.dev/gemini-api/docs/structured-output, read
      2026-09-14); whether rendering the returned fields in Shin's own layout counts as
      "modify" is unsettled and is a separate his-leaf in the rules branch, not rebuilt here
    · **Who runs it when it breaks:** a model that ignores the language instruction is a
      correctness bug in the prompt, caught the same way any other prompt regression is caught
      (looked at by: a fixed test call in each supported language, checked on every prompt
      change)
    · **What it feeds back:** nothing; an instruction is not a fact and produces no record
    · **How it reaches people:** does not apply: the instruction is invisible to the person, only
      its effect (Shin's voice) is
  - French or English, from the user's own setup. *(moves: installs, since a French answer is
    what makes the app usable for a French-Canadian install rather than a workaround)* **Shown
    by:** the same product asked about in both languages, the JSON layout identical, the prose
    fields in the requested language.
  - Short lengths and the fixed JSON layout, so the client never parses free text.
    **Shown by:** the returned JSON validated against the same schema on ten different products
    without a parse failure.

- **Reading citations, and flagging every fact, price and review with no link.** *Kind: all
  kinds. Moves: the decision outcome. From: Jamin, plan-gemini.md §1, "we will accept all
  answers gemini gives, just give a heads up that something doesn't have a link."* [item 25]
    · **What the person sees:** a plain "no link for this" next to any fact that has one, never
      a hidden gap (looked at by: an unsourced fact in a real response, found on the result
      screen by somebody who has not seen the app)
    · **How it looks and sounds:** the heads-up is a label, not an error state and not a
      strike-through, since Shin still uses the fact (plan-gemini.md §1: "we will accept all
      answers") (looked at by: the label's wording and colour checked against the rule that it
      is a note, not a warning)
    · **What it costs and earns:** nothing extra to compute; the flag is read off a field
      already in the response
    · **What we are allowed to do:** the Interactions API carries citations as `annotations`
      with a `url_citation` object per fact (`url`, `title`, `start_index`, `end_index`);
      confirmed against ai.google.dev/gemini-api/docs/grounding, read 2026-09-14 (looked at by:
      one real response's `annotations` array matched against this shape)
    · **Who runs it when it breaks:** a citation field renamed by Google breaks this silently
      unless a test pins the shape; that test is item 75's job in the tests branch, referenced
      here rather than rebuilt
    · **What it feeds back:** nothing pooled, same restriction as the parent call
    · **How it reaches people:** does not apply: a citation flag is not a filmable moment
  - Extracting the citation for each fact, price and review from the `annotations` array and
    matching it back to the text span it covers. **Shown by:** a real response with one
    unsourced fact, the flag landing on that exact fact and no other. Not built in the leftover
    uncommitted code, which reads `groundingChunks`-style sources into a flat `meta.sources`
    list (`identify/src/providers/gemini-grounded.ts`, opened 2026-09-14) rather than per-fact
    annotations, so today's shape cannot say which specific price or review line lacks a link,
    only that the response as a whole has sources or does not.
  - Handing the per-fact flag to the result screen, which draws it. *(from: how it ships, the
    result screen branch owns rendering; moves: the decision outcome)* This node stops at
    producing the flag. Item 64, a different branch, renders it. [waits on: no-link heads-up]
  - Measured 2026-09-14, across the full set of consumer-website tests now collected
    (`gemini-web-tests.md`, T1a, T1b, T4, T6, T7, T8, T9), link quality varies widely from one
    grounded answer to the next: T1a and T8 returned specific, working per-product URLs; T4
    returned URLs for every field with none left null as its own prompt asked, including a
    review URL that was a copy of an offer URL rather than a distinct source; T6 and T7 mostly
    returned homepage or search-redirect links rather than the page the fact came from, T7 only
    2 of 10 rows linked at all; T9 returned four real links with no stated tie between any one
    link and any one of its several, mutually inconsistent numbers. So "has a source URL" and
    "is actually sourced to that specific fact" are not the same finding, and a field being
    non-null does not mean this node's own flag would stay off it. Rival explanation: the
    consumer website's rendered links and the Interactions API's `annotations` array are not the
    same mechanism, so a weak link on the website is not evidence the API's per-fact citation
    will be weak the same way; what would separate them is a real API response's `annotations`
    checked against the same facts. **Shown by:** the seven chats' text, already collected.
    [gemini-web-tests.md, T1a, T1b, T4, T6, T7, T8, T9, 2026-09-14]

- **The thinking level set for this request.** *Kind: all kinds. Moves: what each payer leaves
  after the store's cut and the model bill, since thinking tokens bill at the output rate.
  From: Google's docs (ai.google.dev/gemini-api/docs, read 2026-09-14: `thinkingLevel` on
  Gemini 3, thinking billed as output).* [item 22]
    · **What the person sees:** does not apply directly; a higher thinking level can only be
      felt as a slower answer, never seen as a setting
    · **How it looks and sounds:** does not apply: no UI surface
    · **What it costs and earns:** thinking tokens are billed at the output rate on top of the
      answer itself, so a high level on every call compounds with the search fee (looked at by:
      the token bill split into thinking vs answer tokens, once real calls exist)
    · **What we are allowed to do:** no restriction beyond the general terms
    · **Who runs it when it breaks:** an over-high level on every call is a cost regression, not
      a crash, so it is caught by the cost log (section 7's real-cost node), not by an error
    · **What it feeds back:** nothing pooled
    · **How it reaches people:** does not apply
  · ⇄ avenue: a fixed low level on every request. Needs nothing beyond picking the level; the
    cheapest, most consistent option. Limited to whatever accuracy the low level gives on every
    call kind, including the ones that need it most. Untested: no Gemini call has been made from
    this environment.
  · ⇄ avenue: a fixed higher level only for the verdict's code-execution step, where getting the
    arithmetic right matters more than the search step. Needs the per-call-kind table this node's
    own child builds. Limited to the one step it is scoped to; every other call stays at the low
    level. Untested, same reason.
  · ⇄ avenue: a dynamic level that rises only when the first grounded pass returns fewer than a
    handful of offers or a low-confidence match. Needs a confidence or count threshold nobody has
    set yet. Limited by there being no measurement of whether a higher level actually finds more
    or better-matched offers on the same query. Untested, same reason.
  - Picking the level per call kind (identification, grounded search, code execution) and
    writing it down against the cost table in section 7. *(moves: what each payer leaves)*
    **Buildable.** Shown by: the level written per call kind, and one real call at each level
    with its token split read from `usageMetadata`.

- **Handling Gemini's errors and safety blocks on this call.** *Kind: all kinds. Moves:
  answered from real prices on the thing itself, since a swallowed error looks exactly like a
  true empty result unless it is told apart from one. From: Google's docs (ai.google.dev/
  gemini-api/docs, read 2026-09-14: error codes 429, 401, 403, 503; safety codes `safety`,
  `recitation`, `prohibited_content`, `spii`).* [item 24]
    · **What the person sees:** a plain message that this specific answer could not be gotten,
      never a blank price line presented as "not sold" (looked at by: each error forced in a
      test and the resulting screen read by somebody who has not seen the app)
    · **How it looks and sounds:** the message names what failed in plain words, never an error
      code (looked at by: the wording checked against rule 7's no-identifiers rule)
    · **What it costs and earns:** a 429 that retries burns another call before it succeeds or
      gives up; the retry policy is therefore a cost decision as much as a reliability one
      (looked at by: retried calls counted against the daily cap in section 7)
    · **What we are allowed to do:** a safety block on a legal product (medicine, alcohol,
      weapons-adjacent hardware) is Google's own policy, not this app's, and is recorded as
      "blocked outside" rather than treated as a bug to route around
    · **Who runs it when it breaks:** 401 and 403 mean the key itself is the problem, which is a
      stop-and-report case at the account level (section 7's key node), not a per-scan retry
    · **What it feeds back:** the rate and kind of errors per week, so a rising 429 rate is
      itself a signal to move the model or the cap (looked at by: an error-kind count read
      weekly)
    · **How it reaches people:** does not apply: an error is not a moment worth filming
  - 429 (rate or quota): retried once with backoff. *(moves: answered from real prices on the
    thing itself)* **Shown by:** a 429 forced.
  - 401 or 403 (the key itself): no retry; recorded and surfaced as the key problem it is,
    cross-referenced to section 7's key node rather than duplicated. **Shown by:** a revoked
    test key producing the stop-and-report path, not a silent empty answer.
  - 503 (service unavailable): retried once, as 429. **Shown by:**
    the same forced-error test as the 429 case.
  - A safety block (`safety`, `recitation`, `prohibited_content`, `spii`): no retry of the same
    prompt, since retrying an unchanged prompt against the same block wastes a call; shown as
    "blocked outside" with what lifts it named per case (a differently framed request, or
    nothing, when the block is Google's own policy on the item itself). **Buildable.** Shown by:
    one real product category known to trip a safety code (an age-restricted item) and the
    plain message it produces.

---

## 3. The verdict on the person's own range

*Kind: all kinds. Moves: the decision outcome. From: plan-gemini.md §4.2, his words 2026-09-14:
"ask the user what their range for a bad, resonable and good price is as an average above or
below the price and then we tell the user based on their preference."*

Four things below: somewhere the two percentages live, the shelf price the verdict is judged
against, the one function allowed to touch the grounded prices at all, and our own sources'
verdict kept beside it rather than merged into it.

- **The person's good and bad percentages have nowhere to live today, and everything else in
  this section waits on them existing somewhere.** *Kind: all kinds. Moves: the decision
  outcome. From: plan-gemini.md §4.2; gemini-work-list.md items 41, 42.*
    · **What the person sees:** two fields at setup, "good" and "bad", pre-filled at 10% and
      10%, changeable again in settings (looked at by: the setup screen and the settings
      screen, read by somebody who has not seen the app)
    · **How it looks:** a plain percentage input, not a slider dressed up as a game, since this
      is a number the person will forget they set (looked at by: the field read back after
      three taps away and three taps back)
    · **What it costs and earns:** nothing to run; a few bytes per person to store (looked at
      by: the row size of one preference record)
    · **What we are allowed to do:** these are the person's own numbers about their own
      tolerance, never a grounded fact, so nothing here touches the Google terms at all (looked
      at by: the field checked against the terms' definition of a Grounded Result, which this
      is not)
    · **Who runs it when it breaks:** a missing row must fail to the stated defaults, 10 and
      10, never to a verdict with no thresholds at all (looked at by: the default path forced
      by deleting a person's row and re-running a verdict)
    · **What it feeds back:** unlike a scanned price, this number says nothing about the
      market and is never pooled into anyone else's answer (looked at by: a query for these
      percentages run against the shared catalogue and the price pool, expecting nothing)
    · **How it reaches people:** does not apply: a percentage field is not a moment worth
      filming
  - **Checked 2026-09-14: no preference store exists.** `people.db` (`app/src/admin.ts:53-87`)
    holds only a device-to-person attribution table; `app/src/consent.ts:78/106` holds only two
    photo/location booleans keyed by device id; `app/public/js/screens/setup.js` asks only which
    personality to run and has no threshold fields; `app/src/migrations.ts` has no
    preference-percentage column anywhere. All four opened directly this pass. *Buildable.*
    **Shown by:** a person's stored 15/20 read back from a fresh process after a restart.
  - A migration adds one preference row per person: good percentage, bad percentage, each
    defaulting to 10. **Shown by:** the migration run once from nothing, and the default row
    appearing for a person who has never touched the fields.
  - The two fields on the setup screen and again in settings, wired to that row. **Shown by:**
    a number typed in settings and the very next verdict using it, not the one after.
  - **The percentages ride along on the request that runs the fixed function** (below), sent
    alongside the shelf price and the grounded offers, never computed anywhere else. *(from:
    plan-gemini.md §4.3; moves: the decision outcome)* **Shown by:** the request body captured
    once, the two numbers present on every call. [items 41, 42, 43]

- **No shelf price, no verdict.** *Kind: all kinds. Moves: the decision outcome. From:
  plan-gemini.md §4.2: "The shelf price comes from the user (typed, or the shelf tag reader). No
  shelf price, no verdict: show prices and reviews and ask for the price."* **Buildable. Shown
  by:** a scan with grounded prices returned and no shelf price typed, prices and reviews
  rendering and the verdict step never firing, then the same scan with a price typed and the
  verdict appearing.
    · **What the person sees:** prices and reviews appear even before a shelf price is given;
      the coloured line itself waits for one (looked at by: a scan with prices found and no
      shelf price typed yet, and what the screen shows in that gap)
    · **How it looks:** the ask for a price sits where the line would be, not as a blocking
      pop-up (looked at by: the layout read by somebody who has not seen the app)
    · **What it costs and earns:** none; this is a gate, not a call (looked at by: the call log
      for a scan with no shelf price, expecting the verdict step never fired)
    · **What we are allowed to do:** does not apply beyond what the prices themselves already
      cost under the terms, covered where those are requested
    · **Who runs it when it breaks:** a shelf price of zero or negative is treated as absent,
      never as a free item (looked at by: a zero typed in, and the gate still holding)
    · **What it feeds back:** a typed shelf price is the person's own observation and is
      eligible for the shared price pool (§6 below), unlike anything Gemini found (looked at by:
      the value's origin tag checked before it is pooled)
    · **How it reaches people:** does not apply: this is a gate, not a screen
  · **⇄ avenue: typing the price by hand.** Needs one field and a number keyboard. No terms
    question, since it is the person's own eyes on the tag. Untested here; the field already
    exists for today's own-source verdict.
  · **⇄ avenue: the shelf tag reader**, a photo-model prompt (`TAG_INSTRUCTION`) that reads
    every price printed on a shelf tag and keeps an everyday, sale and loyalty price separate
    rather than merging them. Chosen alongside typing, not instead of it, since a person without
    the tag in frame still needs to type. Untested against a Gemini-identified item specifically;
    it was written for the existing Claude path and nothing here changes which model runs it.
    [item 48, `identify/src/model.ts:735`, opened this pass]

- **The fixed function Gemini runs by code execution is the only thing on our side of the key
  that is allowed to touch a grounded price, and everything it produces is arithmetic on numbers
  it was handed, never a model's opinion of them.** *Kind: all kinds. Moves: the decision
  outcome. From: plan-gemini.md §4.3: "gemini can simply calculate something like the median and
  each step away from the median is a percentage determined by an algorithm and all prices are
  placed on the line"; Google's code-execution docs, read 2026-09-14, combinable with Google
  Search, 30 s limit, standard libraries only, no extra fee.*
    · **What the person sees:** does not apply directly: this step produces numbers for the
      price line (§4.4 elsewhere), not a screen of its own
    · **How it looks:** does not apply, for the same reason
    · **What it costs and earns:** tokens only, no per-call fee for code execution itself
      (looked at by: a real call's bill, itemised for this step once the key exists)
    · **What we are allowed to do:** this is the entire reason the step exists rather than a
      median computed on our own server, covered in its own child below
    · **Who runs it when it breaks:** a mismatch between the code Gemini says it ran and Shin's
      function is marked for review, never shown to the user and never silently swapped for a
      different number (looked at by: the mismatch forced with an edited function, and the
      marking traced)
    · **How it reaches people:** does not apply
  - The function itself, run unchanged every time: median of the store prices, percent each
    price sits from the median, a span sized to the widest deviation or 1.5 times either
    threshold (whichever is larger), rounded up to the next 5, position on a 0-to-100 line with
    the median at 50, the good and bad zone boundaries from the person's percentages, ticks
    every 5 points (every 10 past a span of 30), and the shelf label itself: good, bad, or
    reasonable. *(from: plan-gemini.md §4.3)*
    · **⇄ avenues for the typical price the shelf price is judged against:**
      · the average of the store prices: rejected, both here and already in the existing
        arithmetic verdict ("Never an average... An average of four sellers is a number that
        exists nowhere and that nobody can check"), because one marketplace listing skews it
        [plan-gemini.md §4.2, `price/src/verdict.ts:1-30`, opened this pass]
      · the lowest price found: not raised in the plan and not adopted; it answers "what is the
        best deal available", a different question from "is this shelf price typical", so it is
        not this node's job
      · **chosen: the median**, because it is a real price a real seller actually charges and
        resists a single outlier the way an average does not [plan-gemini.md §4.2]
    - **Counted 2026-09-14, this pass:** the formula above run locally in Python against six
      fake cases (one store, all prices equal, an outlier, a shelf price far under and far over
      the median, a spread tighter than the thresholds) produced internally consistent numbers
      in every case: a single store or an all-equal set puts every position at 50 with the span
      floored at 1.5x the thresholds; an outlier balloons the span and visibly compresses the
      other stores toward the middle, which is a real property of the design, not a bug, worth
      naming on the result screen; the good/bad boundaries scale with the span in every case.
      The rival explanation for "it works" being only that these six cases were chosen to be
      easy: what would separate it is the same run against Gemini's own code-execution output on
      identical inputs, which needs the key and has not happened. **Buildable. Shown by:** the
      six cases above re-run inside Gemini's sandbox once the key exists, and their positions
      matching this session's local run to two decimal places. [item 27, 32]
    - **A second, independent finding on the same date, from a different session's test
      harness** (`gemini-web-tests.md`, T5): running the given Python locally produced
      `5.49 30 [34.21, 50.0, 74.29, 4.46, 65.18, 28.75] good`, which does not match the
      "correct output" text that same test's own instructions stated
      (`5.49 30 [41.56, 50.0, 62.14, 31.9, 58.5, 37.52] reasonable`). That session hand-checked
      every arithmetic step against the local run and used it, not the stated text, as ground
      truth. Rival explanation: the two figures used different inputs rather than either being
      wrong; what would separate them is re-deriving the "correct" text's own inputs, which
      neither session has done. Either way it shows the code-match check (below) needs a
      locally re-run reference on the same inputs, not a hand-typed "expected" line, since a
      hand-typed one was already wrong once. **Shown by:** the two figures above, already
      collected, read side by side. [item 27, 32]
    - **A third finding, the same date** (`gemini-web-tests.md`, T5): the same code, sent to
      the consumer Gemini website with a plain "run this and show me the output" prompt, was
      presented back with a code block and an output block, i.e. Gemini's reply claimed to have
      executed it rather than only reasoning about it, and the printed output it showed was an
      exact character match to the local python3 run above, not the test instructions' own
      "correct" text. Rival explanation: the website's own code-running feature is not the
      Interactions API's `code_execution` tool this plan builds on, and a reply that looks like
      real execution is not proof it was one; what would separate them is the same function sent
      through the API with the key and the `code_execution` tool on, and `executableCode.code`
      read back and diffed against what was sent, which is exactly the check item 20 already
      calls for. **Shown by:** the website reply's code and output blocks, already collected.
      [gemini-web-tests.md, T5, 2026-09-14][item 27, 32]
    - Unit conversion runs inside the same function, before the median: mass to grams, volume
      to millilitres, pack count multiplied through, so a 4 L and a 1 L of the same thing sit on
      one line. *(from: plan-gemini.md §5, his words: "everything should be scaled down or up to
      a spcific unit. natrually a 4l will be cheaper than a 1l but thats fine, and if that makes
      the 1l a bad deal, its a bad deal.")* All unit-scaled sizes count; there is no size band
      and no toggle to hide some of them, which reverses an earlier proposal. **Buildable.
      Shown by:** an oz-priced and a g-priced offer of the same product landing on one line at
      one position each. [item 28]
    - Offers with no size on them, or a different dimension from the scanned item (a weight
      item next to a volume one), are excluded from the line inside this same function and
      returned as their own list rather than dropped silently. *(from: plan-gemini.md §5)*
      *Moves: corrections per hundred verdicts*, since a wrongly included mismatched offer is
      exactly the kind of thing a person notices and corrects. **Buildable. Shown by:** a
      volume offer beside a weight-only scanned item, absent from the line and present in the
      excluded list. [item 29]
    - For a spec-variant product (tech), the line uses only offers of the exact model number
      and the same price-relevant specs, in the same condition; other variants and other
      conditions are computed and returned separately, each with its own price difference from
      the line's variant, never merged into it. Reviews are gathered once per model and shared
      across its variants. *(from: plan-gemini.md §6)* *Moves: corrections per hundred
      verdicts.* **Buildable. Shown by:** a 128 GB and a 256 GB offer of the same phone, only
      the matching one on the line and the other listed with "+$X" beside it. Measured
      2026-09-14, consumer Gemini web, not the API: asked for exactly this shape, iPhone 16 at
      two storage sizes and two conditions across several Canadian retailers, the reply returned
      all four storage-condition combinations with a price for each in one table, so a grounded
      search can surface the variant and condition split this function needs to filter on. Only
      2 of the 10 rows carried a working link, the rest bare domain text or a Google-redirect
      link, a weaker showing than T8's below. Rival explanation: a markdown table on the website
      is not this fixed function's own JSON shape, so the table existing is evidence the
      underlying search can find variant data, not evidence the request as this plan will send
      it returns fields the function can parse; what would separate them is the same request
      through the API with structured output on, checked against the function's actual input
      schema. [gemini-web-tests.md, T7, 2026-09-14][item 30]
    - **The function must run inside Google's own sandbox**: standard Python libraries only,
      30 seconds, no package installs. *(from: Google's code-execution docs, read 2026-09-14)*
      *Standing rule.* Enforced by writing the function against that constraint from the start
      rather than porting a richer one later; caught by the sandbox itself refusing an import it
      does not carry. **Shown by:** the function's own source read for anything outside the
      standard library, finding nothing. [item 31]
    - Unit-scaling tests of the function against fake numbers: multipack, oz to g, mixed L and
      mL, missing size, mass vs volume mismatch. Unrun here since they need the unit-conversion
      code above (item 28), not only the median/span/position math already verified locally
      (above). **Buildable. Shown by:** each case run once, its output written beside the case.
      [item 32]
    - Variant and condition tests of the function against fake numbers: variant filter,
      condition filter, variant difference labels. Unrun here since they need the variant-filter
      code above (item 30), not only the median/span/position math already verified locally
      (above). **Buildable. Shown by:** each case run once, its output written beside the case.
      [item 32]
  - **The wiring: the actual resubmission call**, carrying the grounded offers, the shelf price
    and the person's two percentages, with code execution turned on, is what makes the function
    above run against real numbers rather than sit as an unused file. Nothing above exists to the
    person until this call is made. *(from: plan-gemini.md §4.3)*
    - **The check that the code Gemini executed is Shin's function, unchanged.** Compare
      `executableCode.code` (Google's field name, read from their docs 2026-09-14) against the
      function's own source, character for character; a mismatch shows prices and reviews with
      no verdict rather than a verdict computed by something else. *(from: plan-gemini.md §4.3:
      "Shin's only check: the code Gemini actually executed is our function")* **Buildable.
      Shown by:** the function edited by one character in a test call, and the verdict step
      refusing rather than returning a wrong line. [items 19, 20]

- **Our own sources keep their own verdict, in their own section, never merged with Gemini's
  line.** *Kind: all kinds. Moves: answered from real prices on the thing itself. From:
  plan-gemini.md §4.3: "Where our own sources have prices, the existing arithmetic verdict runs
  on those and is shown in its own section with the same line."*
    · **What the person sees:** two sections when both have data: ours first (it costs nothing
      and needs no grounded-result handling), Gemini's second, never one interleaved list
      (looked at by: a product with both, and the two sections read as clearly separate by
      somebody who has not seen the app)
    · **How it looks:** the same coloured-line drawing for both, so the person is not asked to
      read two different visual languages for the same idea (looked at by: the two sections
      screenshotted side by side)
    · **What it costs and earns:** nothing new; this is `price/src/verdict.ts` (`judge()`,
      opened this pass) and `priceIt` (`spine/src/spine.ts:94`, opened this pass), already
      running today (looked at by: the existing test suite for this file, which this change
      does not touch)
    · **What we are allowed to do:** our own crawled and reported prices are ours outright, so
      none of the Google terms reach this section at all (looked at by: the source of every
      number in this section traced to our own database, never to a grounded answer)
    · **Who runs it when it breaks:** unchanged from today: whoever already watches this file's
      refusal codes (`no_source_response`, `no_identity`, both read in `spine.ts` this pass, and
      matching the measured 2026-09-14 result of 5 no-identity and 2 no-source refusals out of 7
      price requests)
    · **What it feeds back:** unchanged: corrections against our own sources already reach the
      next verdict, per the vision's existing correction loop
    · **How it reaches people:** does not apply beyond what is already true of this section
      today
  - **HIS: whether to unify the two verdicts' typical-price logic** (ours: cheapest, dearest and
    a position between them, never an average; Gemini's: median and percent-from-median) **or
    leave them visibly distinct.** A person could in principle see both sections on one product
    and read two different shapes of "here is where this sits"; that difference is a finding,
    not a plan, not yet reconciled anywhere in the plan, and the choice is a design call nobody
    has made. [item 47]
  - **Shown by:** a product with rows in both our own price database and a Gemini grounded
    answer, both sections rendered on one result screen without either one reading the other's
    numbers.

---

## 4. It shows the answer
*Kind: all kinds. Moves: answered from real prices on the thing itself, and installs per video.
From: Jamin, 2026-09-14, "i imagine the prices showing up as a colored line with a large dot as
the photographed items price and smaller dots as all the sources prices"; plan-gemini.md section
4.4.*

Nine things below, plus the wiring that puts them on one screen. If all of them existed, nothing
would still be missing for the person to see, on the phone in their hand, what the thing costs and
whether it is a good buy.

- **The result screen puts the pieces below into one screen, in a fixed order, and nothing that
  belongs in one section leaks into another.** *Kind: all kinds. Moves: answered from real prices
  on the thing itself. From: plan-gemini.md section 8, "Result screen: our own-source section (if
  any), the Gemini section (price line, store list, reviews, no-link heads-up, Search
  Suggestions)."*
    · **What the person sees:** one screen, our own prices first when we have them, then Gemini's
      section, never merged into one list (looked at by: a scan with both kinds of source, the
      two sections read apart by somebody who has not seen the app)
    · **How it looks and sounds:** the seam between the two sections is visible, not a single
      continuous line that hides which prices came from where
    · **What happens behind the glass:** the layout waits on both the arithmetic verdict (own
      sources) and the Gemini verdict (grounded sources) before it decides what to render, and
      renders whichever exist
    · **What it costs:** nothing beyond the calls each section already makes; the join itself is
      free
    · **What we are allowed to do:** this is the node section 5 calls "never interspersed"
      (waits on section 5, "our prices and Gemini's never interspersed")
    · **Who runs it when it breaks:** a section rendering with half its fields empty is a defect
      someone has to see, not a blank the person is left to interpret
    · **What it feeds back:** does not apply beyond what each section below already feeds back on
      its own
    · **How it reaches people:** does not apply: the assembly itself is never what is filmed, the
      price line under it is (below)
  - The order of sections is fixed and documented once, not decided per scan. **Shown by:** ten
    scans with different source mixes, the section order identical across all ten.
  - A scan with no Gemini result at all still renders the own-source section alone, and a scan
    with no own-source result renders the Gemini section alone. **Shown by:** one scan of each
    kind, neither screen showing an empty section.

- **The price line: a horizontal line in three coloured zones, word-labelled, with one large dot
  for the scanned item and one small dot per store, all positions taken from Gemini's own
  code-execution result and nothing recomputed on the client.** [item 60] *Kind: all kinds except
  fixed-price and local-shop items (section 7.7, 7.10, where there is no line to draw). Moves:
  answered from real prices on the thing itself. From: Jamin, 2026-09-14 (quoted above);
  plan-gemini.md section 4.4.*
    · **What the person sees:** green, amber and red zones each carrying a word ("good",
      "reasonable", "bad"), never colour alone, since colour-blind reading is not optional
      (looked at by: the three words present on the line in a screenshot with colour removed)
    · **How it looks and sounds:** the large dot visually distinct from the small dots (size,
      not colour, is the difference, so it still reads without colour); no animation once the
      line has drawn
    · **What happens behind the glass:** the client draws the zones, boundaries, and dot
      positions exactly as Gemini's code-execution step returned them; it computes nothing
      itself, since a client-side recomputation from grounded prices would itself be "analyzing"
      a Grounded Result (waits on section 5's node on this)
    · **What it costs:** the draw itself is free; the numbers behind it are billed under the
      verdict request (plan-gemini.md section 4.3), not repeated here
    · **What we are allowed to do:** the line renders the returned fields as returned, never
      reworded or re-derived (waits on section 5, "answers shaped only in the request")
    · **Who runs it when it breaks:** a line with zero dots, or a shelf position off the drawn
      range, is a rendering defect someone is paged for, not a silent blank
    · **What it feeds back:** does not apply beyond the shared feedback loop already described
      under "what it feeds back" on the verdict request itself
    · **How it reaches people:** the line is the filmable moment (below, this section's last
      node), but the grounded numbers behind it may be shown only to the person who scanned, so a
      video or share card of it runs into Google's terms; explored below and in section 5
    · ⇄ **avenue:** the client recomputes positions itself from the raw grounded prices, which
      needs no second Gemini call and would be faster to draw; ruled out because it is
      "analyzing" a Grounded Result under Google's terms (section 2.1) and would put the same
      arithmetic outside Gemini's sandbox where nothing checks it matches Shin's fixed function;
      not tested, since it is not the design.
    · ⇄ **avenue:** the line is drawn only from our own sources when Gemini has nothing, using
      the existing arithmetic verdict. Needs nothing beyond what section 4's own-source node
      already builds; limited to the gap where Gemini has no offers at all. Not a substitute for
      this one, and both can be on screen at once; not separately tested here.
    - The three zone boundaries and the shelf position are read straight off the fields
      `position`, `good boundary`, `bad boundary` from the fixed function (plan-gemini.md section
      4.3, steps 3 to 5). **Shown by:** one scan's returned JSON, the drawn boundaries measured
      in pixels and matching the returned percentages within rounding.
    - Ticks every 5% (every 10% past a 30% span), each labelled "-10%", "middle", "+10%" and
      never a raw percentage sign alone on a tick a first-time viewer has not been told to read.
      **Shown by:** a wide-span item and a narrow-span item, both tick sets read by somebody who
      has not seen the app.
    - The wiring: one render function takes the fixed function's JSON and nothing else, so a
      future change to the verdict's shape breaks the render function's own test rather than
      silently drawing the wrong thing. **Shown by:** the JSON shape changed on purpose in a
      test, the render function's test failing.

- **Every dot, including the large one, is labelled with the quantity and price it was actually
  sold as, never a per-unit number alone.** [item 61] *Moves: corrections per hundred
  verdicts (a label a person can check against the shelf is what lets them catch a wrong one).
  From: Jamin, 2026-09-14, "there also needs to be measures in place that label each dot on the
  graph with its actrual quantity."*
    · **What the person sees:** "4 L · $6.99" or "6 x 355 mL · $4.49" on every dot, the scanned
      item's label included, never just a dollar figure
    · **How it looks and sounds:** the label sits beside its dot, not in a separate legend the
      person has to cross-reference
    · **What happens behind the glass:** the label text is built from the same size and pack
      fields the verdict already carries per offer (plan-gemini.md section 4.1), not looked up
      again
    · **What it costs:** nothing beyond what section 5's arithmetic already returns
    · **What we are allowed to do:** the quantity and price as sold are part of the Grounded
      Result already permitted to be shown to this user; nothing new is stored by labelling it
    · **Who runs it when it breaks:** a dot with a missing size falls to the "left off the line"
      list below rather than rendering with a blank label
    · **What it feeds back:** does not apply beyond the line's own feedback loop
    · **How it reaches people:** does not apply beyond the line itself, above
    - **Shown by:** a multipack offer and a single-unit offer on the same line, both labels read
      correctly by somebody who has not seen the app, without being told what a label means.

- **No two dot labels overlap at 400 px width: labels alternate above and below the line with a
  short leader line, and dots stacked on the same position merge into one "N prices" marker that
  expands on tap.** [item 62] *Moves: answered from real prices on the thing itself (a line
  nobody can read answers nothing). From: plan-gemini.md section 4.4.*
    · **What the person sees:** every label readable without pinching to zoom, on the narrowest
      phone width tested
    · **How it looks and sounds:** the leader line is thin and the same colour as its zone, never
      a distraction from the dot itself
    · **What happens behind the glass:** a layout pass runs after positions are known, alternating
      label placement and merging any two dots within a pixel threshold of each other
    · **What it costs:** nothing beyond the render
    · **What we are allowed to do:** does not apply: this is a drawing rule over already-shown
      fields, not a new use of a Grounded Result
    · **Who runs it when it breaks:** a label overlap on a real device is a visual defect caught
      the same way any layout bug is, by whoever reviews the screen before it ships
    · **What it feeds back:** does not apply
    · **How it reaches people:** an unreadable, overlapping line is the opposite of the filmable
      moment the section closes with; this is what keeps that moment usable
    - **Shown by:** ten stores' prices clustered tightly together, rendered at 400 px, no two
      labels overlapping, and the merged marker expanding to its ten prices on tap.

- **A label under the line states the unit the prices were scaled to and how many prices went
  into it, worded as a count, never as a claim of fact.** [item 63] *Moves: answered from
  real prices on the thing itself, and answered from something weaker (the wording is the
  honesty check between the two). From: plan-gemini.md section 4.2, "the wording is 'based on N
  prices found', never 'factually'"; section 5, "per 100 g, per 100 mL or per item, labelled
  under the line."*
    · **What the person sees:** "Per 100 mL, 6 prices found," sitting directly under the line,
      always visible, never a tooltip
    · **How it looks and sounds:** plain text, no more emphasis than the store list below it
    · **What happens behind the glass:** the count is the number of store offers actually placed
      on the line, after exclusions (the "left off the line" node below), not the number Gemini
      searched
    · **What it costs:** nothing beyond the verdict request already made
    · **What we are allowed to do:** the count and the unit are both facts about the returned
      offers, not a rewording of Gemini's own sentence, so this label is Shin's own text
      describing the data, not a Grounded Result being reworded
    · **Who runs it when it breaks:** a count of zero renders the whole line's absence instead of
      a misleadingly confident empty line
    · **What it feeds back:** does not apply
    · **How it reaches people:** does not apply beyond the line itself
    - **Shown by:** a five-store answer and a one-store answer, the count on each matching the
      number of dots actually drawn, not the number of stores Gemini's answer mentioned.

- **The store list, as Gemini returned it, sits under the line: store, price, link; any offer with
  no link carries a plain heads-up rather than being hidden.** [item 64] *Moves: answered from
  real prices on the thing itself. From: Jamin, 2026-09-14, "we will accept all answers gemini
  gives, just give a heads up that something doesn't have a link."*
    · **What the person sees:** every offer Gemini returned, in the list, even the ones with no
      link, each one readable as store, price, and either a link or the heads-up
    · **How it looks and sounds:** the heads-up is a short line, not an error state; a missing
      link is not treated as a failure of the answer
    · **What happens behind the glass:** the list is rendered in the order returned, not
      re-sorted by price, since re-sorting is closer to reshaping the answer than plain display
    · **What it costs:** nothing beyond the verdict request
    · **What we are allowed to do:** the list is the Grounded Result shown to the one user who
      asked, unmodified in content (waits on section 5, "answers shaped only in the request")
    · **Who runs it when it breaks:** does not apply beyond the line's own review
    · **What it feeds back:** does not apply
    · **How it reaches people:** does not apply beyond the line itself
    - Measured 2026-09-14, consumer Gemini web, not the API (website test pending confirmation
      through the API with the key; rival explanation: the consumer product and the API can
      behave differently, and only a same-prompt API call separates them): one barcode lookup
      (T1a, gemini.google.com/app/cd6127291410a2ba) returned three of four products with a real,
      working source URL each and one honest "NOT FOUND" rather than a guess; a second lookup on
      one of those same barcodes in a separate chat (T1b, gemini.google.com/app/2524b8b718c13b31)
      returned a different product variant for the identical barcode with no source link at all,
      self-flagged as unsourced. **Shown by:** the no-link heads-up rendered on that second
      answer's variant field, and the two answers' disagreement visible side by side rather than
      only one of them ever being shown.
    - The wiring: the list renders directly from the same JSON the price line's dots came from,
      so the two can never disagree about which stores exist. **Shown by:** a store present on
      the line and absent from the list, or the reverse, forced in a test and caught.
    - Tapping a store's dot on the line, or its row in the list, opens that store's link
      directly, with nothing else in between. [item 71] **Shown by:** a tap opening the store's
      own page in a fresh tab, with no Shin screen shown in between and no tracking event
      recorded for that tap (waits on section 5, "no tap tracking inside the Gemini section").

- **Google's Search Suggestions render unmodified beneath every grounded answer, exactly as
  returned, up to five.** [item 65] *Moves: answered from real prices on the thing itself (this
  is a condition of being allowed to show the rest of the answer at all, not an optional extra).
  From: https://ai.google.dev/gemini-api/terms, read 2026-09-14: Search Suggestions must
  accompany grounded results.*
    · **What the person sees:** the suggestion chips sitting under the price section, in Google's
      own rendered form
    · **How it looks and sounds:** Google's own HTML, not Shin's fonts or colours forced onto it,
      since the rule is display as returned
    · **What happens behind the glass:** the returned HTML is inserted, not parsed and rebuilt
    · **What it costs:** nothing beyond the grounded request that produced it
    · **What we are allowed to do:** this is the node section 5's terms compliance turns into a
      standing rule (waits on section 5, "suggestions shown with every grounded answer")
    · **Who runs it when it breaks:** a grounded answer rendering with the suggestions block
      missing is a compliance defect, not a cosmetic one, and is treated with the same urgency as
      a broken payment screen
    · **What it feeds back:** does not apply
    · **How it reaches people:** does not apply: the suggestions are Google's own furniture, not
      a Shin moment
    - **Shown by:** a grounded answer rendered on a real phone, the suggestion chips present and
      tapping one opening google.com, not a Shin screen.

- **The product description Gemini's ungrounded identification returns is shown on the result
  screen.** [new, reverses plan-gemini.md 4.1's "no description, no advice"] *Moves: answered
  from real prices on the thing itself. From: Jamin, 2026-09-14, "gemini should also provide
  prdocut desciptions."*
    · **What the person sees:** a short description of the product near the top of the result,
      above the price line
    · **How it looks and sounds:** plain prose in Shin's own text style, since an ungrounded
      description is ordinary model output, not a Grounded Result, and is not bound by the
      display rules the price line is
    · **What happens behind the glass:** the description comes from the same ungrounded
      identification call already made for the product name, brand and size (plan-gemini.md
      section B, item 15), not a second call
    · **What it costs:** nothing beyond the identification call already priced in section 3
    · **What we are allowed to do:** ungrounded output can be stored in the shared catalogue like
      today's Claude answers (plan-gemini.md section 2.1); a description generated with Google
      Search on, by contrast, is a Grounded Result and is shown only to the asking user and never
      stored for anyone else, so which path produced the description decides where it may go
    · **Who runs it when it breaks:** a description that reads as an opinion or a recommendation
      is a defect against Shin's founding rule that the verdict is never a model's opinion
      (plan-gemini.md section 2.3, rejected option), caught by whoever reviews new copy before it
      ships
    · **What it feeds back:** a description is stored with the catalogue's identification the
      same way a name or brand is, and can be corrected the same way
    · **How it reaches people:** does not apply beyond the result screen itself
    · ⇄ **avenue:** ask for the description in the grounded prices-and-reviews request instead,
      which would let it cite sources; ruled out for now because plan-gemini.md section 4.1 fixed
      that request's fields at store offers and reviews only, and a grounded description would
      inherit the per-user-only, not-stored, 2-year-limit handling the reviews already carry,
      doubling the compliance surface for one extra field; not tested.
    - **Shown by:** a scan of a product with no catalogue entry, a description appearing that was
      not typed by anyone at Shin, read by somebody who has not seen the app and matching the
      photographed item.

- **What did not make it onto the line is listed separately, in three groups: prices with no
  size or a different dimension, other tech variants of the same model, and other conditions of
  the same item.** [items 67, 68] *Moves: answered from real prices on the thing itself, and
  answered from something weaker for the excluded groups. From: plan-gemini.md section 5,
  "Offers with no size, or a different dimension... stay off the line and are listed with a
  note"; section 6, items 3 and 2.*
    · **What the person sees:** three short lists below the line and the store list, each labelled
      with why its entries are not on the line
    · **How it looks and sounds:** plain list rows, not styled to look like a second line
    · **What happens behind the glass:** the exclusion is decided inside the same fixed function
      that draws the line (plan-gemini.md section 4.3, section 6 items 1 to 3), which returns the
      excluded offers as a separate field rather than dropping them
    · **What it costs:** nothing beyond the verdict request
    · **What we are allowed to do:** these are the same Grounded Result fields as the line's,
      shown to the same one user, so nothing new is asked of the terms
    · **Who runs it when it breaks:** an offer silently vanishing (on neither the line nor a
      list) is a defect, since rule 5 of the tree rules treats a search that could have found
      something differently from one that never looked; here it is "excluded, and shown as
      excluded" or it is a bug
    · **What it feeds back:** does not apply
    · **How it reaches people:** does not apply
    - Prices with no recorded size, or a different dimension from the scanned item (weight
      against volume), listed with a one-line note of why. **Shown by:** an offer missing a size
      field, absent from the line and present in this list with that reason stated.
    - For a spec-variant product: other variants of the same model, each labelled with its
      differing spec and its price difference against the line's variant, for example "512 GB ·
      +$250," computed inside the same code-execution step (plan-gemini.md section 6, item 3).
      **Shown by:** a two-variant product, both variants' prices correct and the difference
      matching a hand check.
    - Other conditions of the matched variant (open-box, refurbished, used against a new-item
      line), listed separately, never blended into the line's own dots (plan-gemini.md section 6,
      item 2). **Shown by:** a product with a used offer and a new offer, the used one appearing
      only in this list.

- **Reviews: rating, count, a short summary and a link, one block per model for a spec-variant
  product so variants are not credited with each other's reviews.** [item 66] *Moves: the
  decision outcome (a review is read right before the tap that ends in bought, walked, or bought
  the alternative). From: plan-gemini.md section 4.1, "the product's reviews: rating, count,
  short summary, url"; section 6, item 6, "Reviews are per model: one review block shared across
  variants."*
    · **What the person sees:** one clearly separated block, rating and count first, the summary
      under it, the link at the bottom
    · **How it looks and sounds:** the rating shown as a number and stars are word-labelled too
      (for example "4.2 out of 5"), never stars alone, matching the price line's own no-colour-
      alone rule
    · **What happens behind the glass:** the review block is part of the same grounded
      prices-and-reviews request as the store offers (plan-gemini.md section 4.1), not a separate
      call
    · **What it costs:** nothing beyond the one grounded request already priced in section 3
    · **What we are allowed to do:** the summary is Google's own generated text and is displayed
      as returned, under the same rules as the price line (waits on section 5, "answers shaped
      only in the request")
    · **Who runs it when it breaks:** a review block whose rating and summary visibly disagree
      (a 4.8 next to a mostly negative summary) is a defect worth a person looking at the raw
      response, not silently trusted
    · **What it feeds back:** does not apply: reviews are Gemini's, not built from Shin's own
      scan data
    · **How it reaches people:** does not apply beyond the result screen
    - **Shown by:** a tech product with two variants scanned separately, the same review block
      shown for both, and a non-tech product's single block shown once.

- **The same price line, drawn from Shin's own arithmetic verdict, appears in its own section
  when Shin's own sources (crawled prices, the catalogue, recorded scans) have prices, whether or
  not Gemini also answered.** [item 70] *Moves: answered from real prices on the thing itself.
  From: plan-gemini.md section 4.3, "Where our own sources have prices, the existing arithmetic
  verdict runs on those and is shown in its own section with the same line."*
    · **What the person sees:** a second, visually identical line lower on the screen when both
      kinds of source exist, clearly headed as Shin's own prices
    · **How it looks and sounds:** the same drawing code as the Gemini line, so the two are never
      told apart by quality, only by heading and source
    · **What happens behind the glass:** this line's numbers come from the existing arithmetic
      verdict (`judge`, `price/src/verdict.ts:250`, called by `priceIt`, `spine/src/spine.ts:94`),
      not from Gemini's code execution, since our own sources were never Grounded Results and
      carry none of the restrictions
    · **What it costs:** nothing beyond what section 4's price line already draws; the arithmetic
      itself already runs today
    · **What we are allowed to do:** our own crawled and catalogue prices may be stored, ranged
      and served exactly as today (plan-gemini.md section 2.1, "our own price sources... can be
      stored and turned into ranges"); this is the section 5 rule about never mixing the two
      answered from the drawing side
    · **Who runs it when it breaks:** does not apply beyond the shared verdict code's own review
    · **What it feeds back:** every recorded scan against our own sources already feeds the price
      record the same way it does today
    · **How it reaches people:** does not apply beyond the shared price-line node above
    - **Shown by:** one scan with prices from both kinds of source, two lines on one screen,
      visibly separate, neither one merged into the other (waits on section 5, "never
      interspersed").

- **Similar products from other brands appear in the existing alternatives section as a spec
  comparison, never on the price line itself.** [item 69] *Moves: answered from real prices on
  the thing itself, and the decision outcome (an alternative is the one path to "bought the
  alternative"). From: plan-gemini.md section 6, item 4, "Similar products from other brands go
  in the existing alternatives section as a spec comparison, not on the line."*
    · **What the person sees:** an alternatives section below the price section, unchanged in
      position from today
    · **How it looks and sounds:** unchanged from today's alternatives layout
    · **What happens behind the glass:** alternatives continue to come from `alternativesFor`
      (`catalogue/src/alternatives.ts:338`), which already compares unit price or tag price
      across the category; a spec-variant product's alternatives compare specs instead, per
      section 6
    · **What it costs:** nothing new; this function already runs
    · **What we are allowed to do:** alternatives drawn from our own catalogue are unaffected by
      Google's terms; a spec comparison against a Gemini-identified tech product uses only the
      ungrounded identification fields (model number, specs), never a Grounded Result
    · **Who runs it when it breaks:** unchanged from today
    · **What it feeds back:** unchanged from today
    · **How it reaches people:** does not apply
    - **Shown by:** a spec-variant product scanned, its alternatives section showing a spec
      comparison rather than a plain price comparison, distinct from the line above it.

- **Every new string is in French, and the whole result screen works at phone width in both light
  and dark themes.** [items 72, 73] *Moves: installs (a screen that fails on half the phones or
  half the languages Shin ships to loses installs it would otherwise keep). From:
  gemini-work-list.md items 72 and 73.*
    · **What the person sees:** the same screen, in either language and either theme, with
      nothing cut off or unreadable
    · **How it looks and sounds:** French strings carry the same voice as the English ones,
      checked by the existing French coverage test rather than a fresh reviewer for every string
    · **What happens behind the glass:** every new string added by this section lives beside the
      existing ones in `app/public/js/voice-fr.js`, not in a new file the coverage test does not
      know about
    · **What it costs:** translation time per new string, small and one-time per string
    · **What we are allowed to do:** does not apply: this is a display and localisation rule, not
      a use of a Grounded Result; a French-language grounded request is itself covered under
      plan-gemini.md section 2.3, "the user's language (English or French)," not here
    · **Who runs it when it breaks:** a missing French string fails the coverage test named below
      before it ships, not after
    · **What it feeds back:** does not apply
    · **How it reaches people:** a screen that breaks in dark mode or at phone width is not
      filmable, so this node is part of what makes the next node possible
    - **STANDING RULE: no string on this screen ships until it has a French counterpart and both
      have been read once by a person.** Enforced by the existing French coverage test extended
      to every new key this section adds; caught by that test failing on a key with no French
      value. **Shown by:** a new key added without its French counterpart, the coverage test
      failing on it by name.
    - **Shown by:** the whole result screen, with a Gemini answer on it, viewed at 400 px in both
      themes on a real phone, nothing overlapping or truncated.
    - Measured 2026-09-14, consumer Gemini web, not the API: a French-language grounded price
      request (Natrel ice cream, asked and answered entirely in French) came back in fluent
      French, with a product card, a price range paragraph and a store table, so the model can
      answer in French when asked in French. It also produced a genuine formatting defect of its
      own, a broken markdown link whose URL ran directly into an unrelated French sentence with
      no closing syntax, rendering as garbled text on the page. Rival explanation: this is the
      consumer website's own rendering of Gemini's output, not Shin's own layout drawing
      structured JSON fields the way this section's own nodes plan to; a malformed field would
      be caught by this section's own render code rather than pasted onto the screen raw, so the
      finding is weaker evidence about Shin's eventual French UI than about Gemini's French
      fluency itself. What would separate them: the same French prompt through the API,
      structured output on, checked for whether a malformed field can occur inside a JSON value
      the same way it occurred inside free text here. **Shown by:** the chat's rendered reply,
      already collected. [gemini-web-tests.md, T6, 2026-09-14][item 72]

- **How this reaches people: the price line is the single most filmable moment in the app, and
  filming it runs straight into the rule that a Grounded Result may be shown only to the person
  who asked.** *Moves: installs per video. From: the-tree.md's own worked example, "the barcode
  scan is the fastest thing to film" (§1, barcode node), applied here on Jamin's instruction to
  explore this; Google's terms, https://ai.google.dev/gemini-api/terms, read 2026-09-14, "will
  only display the Grounded Results... to the end user who submitted the prompt."*
    · **What the person sees:** does not apply: this node is about what a third party (a video
      viewer) would see, which is exactly the question in play
    · **How it looks and sounds:** does not apply, same reason
    · **What happens behind the glass:** does not apply
    · **What it costs:** a marketing video that cannot show the real answer is a weaker video;
      the cost is measured in installs per video foregone, not in dollars
    · **What we are allowed to do:** this is the whole finding: a screen recording, a share
      card, or a demo video that shows an actual Gemini-grounded price line displays a Grounded
      Result to people who did not submit that prompt, which the terms forbid outright, with no
      carve-out found for marketing or demonstration use (waits on section 5, "share cards and
      screenshots of grounded answers")
    · **Who runs it when it breaks:** a marketing team member filming a live scan for a video is
      the person who would trip this, and needs to know before filming, not after posting
    · **What it feeds back:** does not apply
    · **How it reaches people:** this is the node itself
    - The finding, phrased as work: build a demo mode that runs the exact same price-line drawing
      code against a fabricated, clearly-not-real set of prices (never a captured real answer),
      so the filmable moment exists without ever putting a real Grounded Result on screen for
      anyone but the person who scanned. **Shown by:** a recorded video of the demo line, and a
      side-by-side proving no field in it came from a real Gemini response.
    · ⇄ **avenue:** film the section 4 own-source line instead, which is never a Grounded Result
      and carries none of this restriction; needs nothing new, limited only by our own sources
      having a price for the filmed item; not tested.
    · ⇄ **avenue:** ask Google in writing for permission to show a real grounded answer in
      marketing material; needs a written request and an answer, limited by however long Google
      takes to answer or whether it answers at all; not tested, not asked as of 2026-09-14.
    - **HIS:** whether a demo line built from fabricated prices is close enough to what Jamin
      pictured when he described the filmable moment, or whether only a real answer will do for
      the video he wants. *(from: Jamin, 2026-09-14, the price-line quote above, which describes
      showing the real thing; the tension is not resolved by anything he has said about video
      specifically)*

---

Placed: items 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, plus the new product
description item and the filmability-vs-terms finding, both sourced to Jamin's later 2026-09-14
additions. Not placed here: item 5 (the description reversal touches plan-gemini.md 4.1, but the
paid-tier and age-gate items 5 to 10 belong to the permissions branch, not this one) and the
Gemini web-test file's remaining entries beyond T1a/T1b, which bear on identification accuracy
(section 1's branch) rather than the result screen and were not read in full to stay inside this
section's scope.

---

## 6. It learns from what people tell it

*Kind: all kinds. Moves: answered from real prices on the thing itself. From: his words, later
2026-09-14: "just because we cannot save gemini prices, doesn't mean we cannot save user
interpretations of prices. We can save user images, their products, ask them if they are
satisfied with their product, where they shopped, we can even ask them what range they would be
satisfied with for this product, etc."*

Everything below is something a person hands Shin directly, in their own words or their own
photo, never a fact copied out of a grounded answer. Six things a person can give, one line that
keeps the sixth from quietly becoming the fifth, and a wiring child that says where it all goes.

- **The photo they took and the product they confirmed or corrected is theirs to give, and
  Shin keeps it exactly like it keeps a Claude identification today.** *Kind: all kinds. Moves:
  corrections per hundred verdicts. From: plan-gemini.md §2.1: "Ungrounded identification is
  ordinary model output ... and can be stored in the shared catalogue like today's Claude
  answers. So on a barcode miss, Shin also asks for a photo of the front, and the ungrounded
  identification is paired with the barcode."*
    · **What the person sees:** nothing new to do beyond the front-photo ask that already
      exists on a barcode miss; confirming or correcting the name Shin read back is the same tap
      as today
    · **How it looks:** does not apply beyond the existing photo and correction screens
    · **What it costs and earns:** nothing new to run; this reuses the ungrounded photo call
      already planned for identification [gemini-work-list.md item 15]
    · **What we are allowed to do:** the photo and the person's own confirmation are never
      Grounded Results (no search tool ran to produce them), so nothing in the terms reaches
      them; this is the load-bearing line for the whole section (looked at by: the request that
      produced this field checked for the search tool being off)
    · **Who runs it when it breaks:** a correction that contradicts the catalogue's existing row
      is held for a reliability check rather than overwriting it outright, per the vision's
      existing anti-fake design (§4)
    · **What it feeds back:** joins the shared catalogue the same way a Claude identification
      does today, which is the entire point: a barcode miss today is a permanent miss, a barcode
      miss under this design is a gap that a photo can fill for everyone after
    · **How it reaches people:** does not apply directly, though a catalogue that stops missing
      the same barcode twice is a fact worth stating in the product's own marketing, elsewhere
  - **Buildable. Shown by:** a barcode that misses the catalogue once, gets a photo and a
    confirmation, and matches on the next scan without a second photo being asked for. [item 35]

- **The shelf price they typed and the store they typed it at is a real price observation, and
  it is eligible for the shared price pool the moment it lands, the same as a photographed tag
  is today.** *Kind: all kinds. Moves: answered from real prices on the thing itself. From: his
  words, later 2026-09-14, "where they shopped"; the vision §4's existing rule that a
  photographed tag outweighs a typed number and a person carries a reliability score.*
    · **What the person sees:** the same typed-price field as §3 above, now also asked which
      store they are standing in when it is not already known from location
    · **How it looks:** one added field, store name or a picked pin, not a form
    · **What it costs and earns:** none to collect; this is exactly the harvest the vision
      already describes for every scan (§4)
    · **What we are allowed to do:** this number came from the person's own eyes on a shelf tag
      or receipt, not from a search Google ran, so it is not a Grounded Result even when the
      product itself was identified through Gemini; the two are separate facts about the same
      scan (looked at by: the field's origin tag distinguishing "person typed" from "Gemini
      found")
    · **Who runs it when it breaks:** the existing anti-fake systems: a price far outside the
      known range is held, not published; one report never moves a verdict alone once strangers
      can type
    · **What it feeds back:** into the same price pool a photographed tag feeds today, and into
      the "where do people actually shop for this" question the setup-survey idea (vision §5)
      wants an answer to
    · **How it reaches people:** does not apply
  - **Buildable. Shown by:** a typed price and store from one scan appearing as an observation
    another person's verdict can later cite.

- **Whether they bought it, and whether they were satisfied with it later, is new: nothing
  today asks the second half of that question.** *Kind: all kinds. Moves: the decision outcome.
  From: his words, later 2026-09-14, "ask them if they are satisfied with their product"; the
  vision's existing decision-outcome tap (bought, walked, bought the alternative) and its §8
  "ledger of outcomes ... so a savings claim can be measured before it is published".*
    · **What the person sees:** the existing outcome tap at the moment of the scan, plus one
      follow-up later (a notification or a return-visit prompt) asking whether they were happy
      with it
    · **How it looks:** a short face-and-line moment, not a survey
    · **What it costs and earns:** a scheduled follow-up message, cheap; the value is in what it
      answers, not what it costs
    · **What we are allowed to do:** entirely the person's own report about their own purchase,
      no terms question at all
    · **Who runs it when it breaks:** a follow-up that goes unanswered is a non-response, counted
      as such, never defaulted to "satisfied"
    · **What it feeds back:** the only outside check the vision names for a savings claim before
      it is published (§8); also the first real data for whether a good/fair/bad label actually
      tracked what the person later felt
    · **How it reaches people:** does not apply
  - **Buildable. Shown by:** one person's outcome tap and their later satisfaction answer both
    on file against the same scan.

- **The range they would be satisfied with for this specific product, not only the global
  good/bad percentages from §3, is new.** *Kind: all kinds. Moves: the decision outcome. From:
  his words, later 2026-09-14, "we can even ask them what range they would be satisfied with for
  this product".*
    · **What the person sees:** an optional per-product override of the two global percentages,
      offered where it matters (a product they scan often, or right after a correction)
    · **How it looks:** the same field type as §3's global one, just scoped to one product
    · **What it costs and earns:** one more row per person per product they bother to set
    · **What we are allowed to do:** their own preference about their own tolerance, same as §3;
      no terms question
    · **Who runs it when it breaks:** falls back to the global percentages, never to no
      percentages at all
    · **What it feeds back:** nothing pooled to anyone else; like §3's global fields, this says
      something about the person, not about the market
    · **How it reaches people:** does not apply
  - **Buildable. Shown by:** a product-specific range set once, and the next verdict on that
    product using it instead of the global default.

- **Corrections feed the next answer, the same rule the vision already states, now reaching
  the Gemini path too.** *Kind: all kinds. Moves: corrections per hundred verdicts. From: the
  vision §4 and §7 (existing: "every correction changes the next verdict on that product"; a
  reliability score from how often a person's prices were later confirmed); his words, later
  2026-09-14, naming "corrections" among the things Shin should be saving.*
    · **What we are allowed to do:** a correction to an ungrounded identification or to a typed
      price is the person's own statement, poolable like the rest of this section; a correction
      that only exists because a person edited text Gemini had grounded still traces back to
      that grounded text and is the boundary case the next node exists for
    · **What it feeds back:** the existing reliability-score mechanism extends to cover
      corrections made on a Gemini-identified scan, so nothing about the identification's
      source changes how a correction is weighed
    · **What the person sees:** unchanged from the existing correction flow: the same edit
      field on the same result screen, whichever provider identified the product
    · **How it looks and sounds:** unchanged from the existing correction flow
    · **What it costs and earns:** unchanged: a correction is a person's own text, not a second
      paid call
    · **Who runs it when it breaks:** unchanged: whoever already reviews the reliability-score
      pipeline
    · **How it reaches people:** unchanged: the correction field itself, not a filmable moment
  - **Buildable. Shown by:** a correction made on a Gemini-identified product changing that
    product's next verdict the same way a correction on a Claude-identified one already does.

- **The line: a price a person reads off the shelf tag in front of them is theirs to give;
  a price they copied out of what Gemini told them is still a Grounded Result being collected,
  whoever's hand typed it.** *Kind: all kinds. Moves: answered from real prices on the thing
  itself. From: the terms, read 2026-09-14, "you will not... allow your end user... to...
  cache... or otherwise learn from Grounded Results"; his words, later 2026-09-14, reconciled
  against that clause rather than read as overriding it.*
    · **What the person sees:** does not apply: this is a rule about what the server does with
      a value, invisible either way
    · **How it looks:** does not apply
    · **What it costs and earns:** the cost of getting this wrong is the key itself, as §2.1
      already states for the rest of the section
    · **What we are allowed to do:** the whole node. A field is eligible for the shared pool
      only when its value did not come from a Gemini response on this scan: a shelf price typed
      while the shelf tag reader (§3) was never invoked or never returned this number; a
      satisfaction answer; a store name; an outcome tap. A shelf price that happens to match a
      number Gemini's own price search returned for the same scan is suspect and is not pooled
      from that scan, even though the person typed it with their own fingers, because it cannot
      be told apart from a copy. *(from: plan-gemini.md §2.1)* The grounded text itself stays on
      that one person's own scan record only, kept at most two years and then deleted, never
      moved to the shared pool by any route. *(from: plan-gemini.md §2.1)* [item 34]
    · **Who runs it when it breaks:** a standing rule needs an enforcer: every value written to
      the shared pool carries a same-scan check against anything Gemini returned for that scan,
      and a match holds the value out of the pool rather than writing it. Caught by a planted
      test scan where the typed price is deliberately set equal to a grounded one, and the pool
      write is checked to have skipped it.
    · **What it feeds back:** the entire reason §6's other five nodes are worth building at all,
      since without this line the family-beta key is one report away from being pulled
    · **How it reaches people:** does not apply
  - **Standing rule.** Enforced by the same-scan check above; caught by the planted-match test
    above. **Shown by:** that test, run once and shown red before the check exists, green after.
  - **The consent and privacy wording covering this collection is not written yet**, and belongs
    beside the existing consent screen's photo/location toggles (`app/src/consent.ts:78/106`,
    opened this pass) rather than a new screen. *Buildable.* **Shown by:** the wording read by
    somebody who has not seen the app, correctly stating that their outcome answers and
    per-product ranges are pooled and their typed prices are pooled unless they matched
    something Gemini said on that scan.

- **The wiring: none of the above changes anything until it is read back out somewhere, at
  three separate hand-off points.** *Kind: all kinds. Moves: answered from real prices on the
  thing itself. From: plan-gemini.md §4.2, §5's setup-survey mention; the vision §5, "if we know
  a user primarily shops for a certain item ... then we know something is more likely."*
    · **What the person sees:** nothing new by itself; each hand-off below changes what an
      existing screen shows, not a screen of its own
    · **How it looks and sounds:** does not apply: this node is the read-back plumbing, not a
      rendering rule; each hand-off's own screen is unchanged in look
    · **What it costs and earns:** nothing beyond the stored history already written; no new
      call is made to read it back
    · **What we are allowed to do:** this is the person's own stored history read back for that
      same person, never pooled or shown to anyone else, so it carries none of the Grounded
      Result restrictions
    · **Who runs it when it breaks:** whoever owns the three call sites this reads into
      (identification, verdict defaults, alternatives), each already named below
    · **What it feeds back:** does not apply beyond the three hand-offs themselves, which are
      the feedback loop
    · **How it reaches people:** does not apply: no filmable moment, only quieter defaults on
      screens already covered elsewhere
  - Into identification: a person's own confirmed products narrow what the ungrounded photo
    call is asked to choose between next time, the same role the catalogue's pick-instruction
    already plays. **Buildable. Shown by:** a person's own confirmed-product history changing
    what the next ungrounded photo call is asked to choose between, on that one account, traced
    end to end. [`identify/src/model.ts`, `PICK_INSTRUCTION`, opened this pass]
  - Into verdict defaults: a per-product satisfaction range (above) overrides the global 10/10
    the moment one exists for that product; a person's outcome and satisfaction history is the
    first real check on whether the good/fair/bad label is calling it right, closing the loop
    the vision's §8 asks for. **Buildable. Shown by:** a per-product satisfaction range existing
    on one account overriding the global default on that account's next verdict for the same
    product, traced end to end.
  - Into alternatives: where they shopped and what they were satisfied with feeds the existing
    alternatives section a real prior instead of a guess at which alternative to lead with.
    **Buildable. Shown by:** a person's store and satisfaction history changing which
    alternative `alternativesFor` leads with on that account's next scan of a similar product,
    traced end to end. [`alternativesFor`, `catalogue/src/alternatives.ts:338`]

---

## 7. It runs, pays its way, and survives failure
*Kind: all kinds. Moves: answered from real prices on the thing itself, and what each payer
leaves after the store's cut and the model bill. From: gemini-work-list.md §A/B/F, and
plan-gemini.md §3, 9, "Build state."*

Twelve things below. If all of them existed, the only thing still missing for Gemini to answer
a real scan in the running app would be the request-shaping work in section 2; this branch is
the ground the whole subtree stands on, and its wiring child is the provider node (item 12),
which is what `makeProvider` actually calls.

- **HIS: a paid Gemini API key with billing on, which nothing here can run without.** *Kind:
  all kinds. Moves: answered from real prices on the thing itself. From: gemini-work-list.md
  item 1, and plan-gemini.md §2.4 (free tier trains on submitted content and does not offer
  Grounding with Google Search for current 3.x models, so paid is not optional).* [item 1]
    · **What the person sees:** does not apply: this is a step before anything ships, never a
      screen a person meets, exactly as the existing paid-reader key node in this repo's own
      tree already states for the Claude key
    · **How it looks and sounds:** does not apply, for the same reason
    · **What it costs and earns:** the account itself, billed from the first real call, against
      zero revenue until the app charges anyone (looked at by: the first bill, once the key
      exists)
    · **What we are allowed to do:** paid tier is required in the EEA, UK and Switzerland
      regardless; whether the API's 18-plus clause reaches app end users or only the developer
      is unconfirmed (ai.google.dev/gemini-api/terms, read 2026-09-14) and is its own open
      question, not settled by creating the key
    · **Who runs it when it breaks:** a revoked or dead key is stop-and-report, never a silent
      fallback to guessing, mirroring this machine's own standing rule for a dead vault key
    · **What it feeds back:** nothing until calls exist
    · **How it reaches people:** does not apply
  The question he answers: does he create the key at Google AI Studio, on which billing
  account, and put it in the Mac's `mac/config.env` as `GEMINI_API_KEY`, never in any repo. A
  second, independent key from the one Claude already uses; nothing here proposes replacing
  that one. **HIS**, written as this question, since nothing below can be shown to work without
  it.

- **Which model answers, chosen against the price table, and rechecked before it changes under
  it.** *Kind: all kinds. Moves: what each payer leaves after the store's cut and the model
  bill. From: gemini-work-list.md item 9; pricing.txt (ai.google.dev/gemini-api/docs/pricing,
  read 2026-09-14).* [item 9]
    · **What the person sees:** does not apply; the model name is never shown
    · **How it looks and sounds:** does not apply
    · **What it costs and earns:** 3.5 Flash-Lite $0.30 in / $2.50 out per 1M tokens; 3.8 Flash
      $0.75 / $3.75 until 2026-12-31, then $1.50 / $7.50; derived, roughly double, from 2027-01-01
      (looked at by: the bill on the first of the month it changes)
    · **What we are allowed to do:** the stable ids today are gemini-3.8-flash, 3.7-flash,
      3.6-flash, 3.5-flash, 3.5-flash-lite, 3.1-flash-lite (counted from the pricing page, read
      2026-09-14); no restriction beyond the general terms
    · **Who runs it when it breaks:** a model id retired by Google is a build break, caught by
      the same tests that check every other provider call
    · **What it feeds back:** nothing pooled
    · **How it reaches people:** does not apply
  · ⇄ avenue: 3.5 Flash-Lite for the cheap, high-volume identification pass, 3.8 Flash where
    accuracy on a hard photo matters more than cost. Needs the per-call-kind table this node's
    own child builds. Limited to whatever the cheap tier actually costs in accuracy on the hard
    photos it is applied to. Untested: no real call exists yet to say which model actually
    reduces the wrong-kind and no-match rate measured on Claude today (7 of 7 price refusals, 9
    of 30 barcode misses, 2026-09-14).
  · ⇄ avenue: a single model for everything. Needs nothing beyond one env var. Limited by
    forgoing the cheap tier's saving on every call, not only the hard ones. Untested, same
    reason as above.
  - The pick per call kind (ungrounded identification, grounded search, verdict code execution),
    set as `SHIN_GEMINI_MODEL`. *(moves: what each payer leaves)* **Buildable. Shown by:** the
    env var read by `makeProvider` and a real call confirming the model that answered matches
    the one asked for. [`ProviderResponse.model`, `identify/src/provider.ts`, opened 2026-09-14]
  - **STANDING RULE: the model pick is re-checked against the price table before 2026-12-31,
    since 3.8 Flash doubles in price on 2027-01-01.** Enforced by nothing automatic today;
    caught by whoever reads this line before the date, or by the bill doubling if nobody does.
    This is a finding against the level, not a covered gap: no calendar or cost-alert mechanism
    exists yet to catch it on its own.

- **Rate limits for the paid tier, which Google no longer publishes on its public page.** *Kind:
  all kinds. Moves: answered from real prices on the thing itself, since a request rejected by a
  rate limit looks identical to an empty grounded search unless it is told apart. From:
  gemini-work-list.md item 8; Google's docs (ai.google.dev/gemini-api/docs, read 2026-09-14:
  rate limits live only in the AI Studio dashboard now).* [item 8]
    · **What the person sees:** does not apply
    · **How it looks and sounds:** does not apply
    · **What it costs and earns:** does not apply as its own figure; a limit hit routes to the
      429 handling built in section 2, which is where the cost shows up
    · **What we are allowed to do:** reading the dashboard requires the same billing account as
      the key itself, so this waits on the same "his" step as item 1
    · **Who runs it when it breaks:** whoever reads the number again after the account's tier or
      Google's own limits change, since nothing pages when a limit moves
    · **What it feeds back:** nothing pooled
    · **How it reaches people:** does not apply
  **Buildable, waits on** the key node above (same account). Shown by: the per-minute and
  per-day figures for the chosen models copied from the AI Studio dashboard, dated, once the key
  exists.

- **The connection: the Interactions API, with the key in a header, never a URL.** *Kind: all
  kinds. Moves: answered from real prices on the thing itself. From: gemini-work-list.md item
  11, quoting Google: "we recommend the Interactions API for all new development" (generateContent
  is documented "legacy" but still supported); ai.google.dev/gemini-api/docs, read 2026-09-14.*
  [item 11]
    · **What the person sees:** does not apply
    · **How it looks and sounds:** does not apply
    · **What it costs and earns:** no cost difference between the two APIs themselves; the cost
      is in tokens and searches either way
    · **What we are allowed to do:** a key in a URL lands in server access logs and browser
      history in a way a header does not, which is a stricter reading of "no secrets" than the
      terms require but matches this repo's own hard rule on secrets
    · **Who runs it when it breaks:** a wrong endpoint or header is a build-time failure, caught
      by the first real call, not a runtime surprise
    · **What it feeds back:** nothing pooled
    · **How it reaches people:** does not apply
  · ⇄ avenue: the Interactions API (Google's own recommendation, and the only surface Google
    documents structured output plus Google Search plus code execution together, on Gemini 3,
    marked preview) versus the older `generateContent` (fully supported, simpler, but structured
    output and `google_search` are documented as incompatible on it: a real error, "controlled
    generation is not supported with google_search tool," cited by the leftover code against
    github.com/googleapis/python-genai/issues/665). Needs the preview surface to stay available;
    limited by `generateContent`'s documented incompatibility with grounding plus structured
    output together. The leftover uncommitted code splits the difference, tested only as far as
    that code has run: `generateContent` with the key as a `?key=` query parameter for the
    plain, ungrounded photo call, targeting Gemini 2.5 models, and the Interactions API with the
    header form (confirmed using `x-goog-api-key`) for the grounded and verdict calls. Item 11
    asks for the Interactions API and the header form everywhere; the ungrounded path's use of
    the older API and the query-string key is what this branch's build should change, not carry
    forward, once it resumes.
    [`identify/src/providers/gemini.ts`, `identify/src/providers/gemini-grounded.ts`, opened 2026-09-14]
  - Building the request against the Interactions API's actual shape: `instructions` field,
    `annotations` for citations, `google_search_result.search_suggestions`, `code_execution_call`
    and `code_execution_result` parts. *(moves: answered from real prices on the thing itself)*
    **Buildable.** Shown by: one real request sent and its response shape matched field for
    field against ai.google.dev/gemini-api/docs/grounding (read 2026-09-14).

- **A Gemini provider that fits the existing provider interface, chosen when
  `SHIN_MODEL_PROVIDER=gemini` and a key is set.** *Kind: all kinds. Moves: answered from real
  prices on the thing itself. From: gemini-work-list.md item 12.* [item 12]
    · **What the person sees:** does not apply
    · **How it looks and sounds:** does not apply
    · **What it costs and earns:** does not apply as its own figure; the wiring itself is free,
      the calls it makes are priced by the model node above
    · **What we are allowed to do:** no restriction beyond the general terms
    · **Who runs it when it breaks:** a provider that throws on every call is caught by the
      fallback node below before a person ever sees it
    · **What it feeds back:** nothing pooled
    · **How it reaches people:** does not apply
  Written, uncommitted, no caller for the live photo route: `makeProvider`
  (`identify/src/model.ts`, opened 2026-09-14) already implements the `gemini` branch,
  returning `withFallback(new GeminiProvider(...), new AnthropicProvider(...))` when a key is
  present, exactly matching the `Provider` interface at `identify/src/provider.ts` (opened
  2026-09-14). Never "exists": the change is uncommitted on this machine and item 14 (making the
  live photo route in `app/server.ts` actually call `makeProvider` instead of building an
  Anthropic client by hand) is a different branch's item, not confirmed built here.
  - The interface itself: `send<T>(request): Promise<ProviderResponse<T>>`, returning `value`,
    `usage`, `provider`, `model`. *(from: identify/src/provider.ts, opened 2026-09-14; moves:
    answered from real prices on the thing itself)* **Exists. Shown by:** `makeProvider()`
    called inside `modelOnce()`, itself called on every live photo request; `AnthropicProvider`
    is the branch it returns by default. [`app/server.ts:949` calls `makeProvider()`,
    `app/server.ts:1162` calls `modelOnce()`, `identify/src/model.ts:819` and `:821` construct
    `AnthropicProvider`, all opened this pass]
  - `makeProvider` reading `SHIN_MODEL_PROVIDER` and `GEMINI_API_KEY` to pick the branch.
    **Written, uncommitted, no caller. Shown by:** the branch read at
    `identify/src/model.ts:816` (opened this pass) and `app/server.ts` grepped for any call
    reaching it, finding none.

- **What happens when the connection itself fails: 429, 401, 403, 503, at the level of the call
  Gemini's provider makes, before section 2's per-request user message is ever written.** *Kind:
  all kinds. Moves: answered from real prices on the thing itself. From: Google's docs
  (ai.google.dev/gemini-api/docs, read 2026-09-14).*
    · **What the person sees:** does not apply directly; this is the layer under the message the
      person actually sees (built in section 2)
    · **How it looks and sounds:** does not apply
    · **What it costs and earns:** a retry policy means every 429 or 503 can cost up to two
      calls to the same provider before an answer arrives (looked at by: calls-per-scan counted
      on a day with real errors)
    · **What we are allowed to do:** no restriction
    · **Who runs it when it breaks:** 401 and 403 are account-level, routed to a stop-and-report
      rather than retried, since retrying with the same bad key only spends a round trip to
      relearn what is already known
    · **What it feeds back:** the error-kind count referenced in section 2
    · **How it reaches people:** does not apply
  **Buildable.** Shown by: each of the four codes forced in a test and the retry or
  stop-and-report path confirmed, cross-referenced to section 2's user-facing handling of the
  same codes rather than duplicating it.

- **HIS: whether a zero-data-retention approval is sought for this project.** *Kind: all kinds.
  Moves: what we are allowed to do, which is not one of the money or want figures but is the
  gate on all of them for anyone who cares how their scan is used. From: gemini-work-list.md
  item 10; Google's docs (ai.google.dev/gemini-api/docs, read 2026-09-14: zero data retention
  is approval-gated per project, not automatic).* [item 10]
    · **What the person sees:** does not apply directly, though the answer shapes the privacy
      wording the person eventually reads (a different branch's node)
    · **How it looks and sounds:** does not apply
    · **What it costs and earns:** unknown; Google does not publish a price for the approval
      itself, only that it exists (untested, no application filed)
    · **What we are allowed to do:** without it, Google stores grounded prompts and output for
      30 days regardless of what Shin itself does (a fact already true today, not something
      this approval changes for the free path)
    · **Who runs it when it breaks:** does not apply; this is a one-time application, not a
      running system
    · **What it feeds back:** nothing
    · **How it reaches people:** does not apply
  The question he answers: does he apply for it, given the 30-day server-side retention exists
  either way and the approval is Google's process, not a switch this app can flip. **HIS**,
  written as this question.

- **The daily call cap and spend cap, extended to Gemini calls and counting search queries
  once the free 5,000 a month run out.** *Kind: all kinds. Moves: what each payer leaves after
  the store's cut and the model bill. From: gemini-work-list.md item 51; plan-gemini.md §3
  (5,000 free search requests a month shared across Gemini 3.x, then $14 per 1,000).* [item 51]
    · **What the person sees:** does not apply directly; a cap that trips shows as the
      always-answer path, never a raw refusal
    · **How it looks and sounds:** does not apply
    · **What it costs and earns:** the cap exists to put a ceiling on exactly this figure
      (looked at by: the day's total spend read against the cap, every day)
    · **What we are allowed to do:** no restriction
    · **Who runs it when it breaks:** whoever set the cap is the one who raises it, since a cap
      that silently widens itself is not a cap
    · **What it feeds back:** the day's spend total, which is also what section 11 (real cost
      logging) reads to write the log
    · **How it reaches people:** does not apply
  - **Written, uncommitted, no caller** for the dollar half: `withSpendCapProvider` wraps any
    `Provider` and refuses a call whose cost would push the day's spend over the cap,
    reserve-then-spend ordering, single-process only (its own header comment: no defence
    against a true cross-process race). What it does not do, confirmed by reading it: nothing
    in this file or in the leftover Gemini provider files counts search queries or prices them
    at $14 per 1,000; the cap sees only whatever `costCad` it is handed, and nothing today
    computes that figure from `webSearchQueries`. **Shown by:** the source read at the cited
    line, and a grep of the leftover provider files for `webSearchQueries` pricing logic,
    finding none. [`identify/src/cap.ts`, opened 2026-09-14]
  - What happens once the free 5,000 monthly searches run out: search queries move from free to
    $14 per 1,000, and the spend cap (once it counts them) is what stops that cost from running
    away, since nothing on Google's side stops billing at a soft limit. *(moves: what each payer
    leaves)* **Buildable.** Shown by: a month's search count read against 5,000, and the day the
    cap first counts a search-driven dollar rather than only a model-token dollar.

- **Real cost logged from what Gemini actually says it did, not an estimate.** *Kind: all
  kinds. Moves: what each payer leaves after the store's cut and the model bill. From:
  gemini-work-list.md item 52; Google's docs (ai.google.dev/gemini-api/docs, read 2026-09-14:
  `promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount` in `usageMetadata`; no count
  of search queries in usage, only the `webSearchQueries` list).* [item 52]
    · **What the person sees:** does not apply
    · **How it looks and sounds:** does not apply
    · **What it costs and earns:** this node is the difference between a guessed bill and a real
      one (looked at by: the logged figure compared against the actual invoice at month end)
    · **What we are allowed to do:** no restriction
    · **Who runs it when it breaks:** whoever reads the cost log weekly, same person as the cap
    · **What it feeds back:** the real per-scan cost, which is what section 3's Claude
      comparison below needs to stop being a guess
    · **How it reaches people:** does not apply
  Written, uncommitted, no caller: `estimatedCostCents` (`app/src/model-cost.ts`, opened
  2026-09-14) is exactly what its name says, a fixed per-tier list price multiplied by pass
  count, unrelated to any token count a real call returns; nothing in the leftover Gemini files
  reads `usageMetadata` into this path or turns `webSearchQueries.length` into a dollar figure.
  **Buildable.** Shown by: one real call, its `usageMetadata` fields read, multiplied by the
  model's published per-token price, plus its search count multiplied by the per-1,000 rate
  once past the free tier, written to the same log this function writes to today.

- **Cost per scan compared with Claude today, so the trade is a number and not a guess.** *Kind:
  all kinds. Moves: what each payer leaves after the store's cut and the model bill. From:
  plan-gemini.md §3, built from ai.google.dev/gemini-api/docs/pricing (read 2026-09-14) and
  Shin's own scan records (measured 2026-09-14, 15 photo scans).*
    · **What the person sees:** does not apply
    · **How it looks and sounds:** does not apply
    · **What it costs and earns:** the figure itself; every number below is derived, not counted
      from a real Gemini call, since none has been made from this environment
    · **What we are allowed to do:** no restriction
    · **Who runs it when it breaks:** does not apply; this is a standing comparison, refreshed
      each time real numbers replace an estimate
    · **What it feeds back:** nothing; it reads the logs the two nodes above produce
    · **How it reaches people:** does not apply
  - Claude today, photo identification: about 0.26 cents per scan, measured over 15 photo
    scans on 2026-09-14 (0.23 to 0.46 cents), no web search, so prices mostly came back empty.
    **Counted. Shown by:** the 15 scans' own logged per-call costs, read back. Rival
    explanation: 15 scans on one day is a small, possibly unrepresentative sample; a week of
    scans would separate a true average from that day's mix of products.
  - Gemini, identification from a photo: derived, about 0.3 cents on 3.5 Flash-Lite, about 0.6
    cents on 3.8 Flash, chain: published per-token price times an assumed token count for one
    photo at medium resolution (560 tokens, ai.google.dev/gemini-api/docs, read 2026-09-14).
    **Not yet measured. Nothing shows this** against a real call; the figure is a derivation
    from the published price, not a count.
  - Gemini, grounded search for prices and reviews: derived, 5,000 free searches a month, then
    1.4 cents each; one lookup is guessed at 1 to 3 searches. **Not yet measured. Nothing shows
    this**, so the per-scan figure above the free tier is a range, not a point: roughly 1.4 to
    4.2 cents for the search half
    alone, on top of the identification cost above.
  - Total, derived: about 0.5 to 1 cent per scan inside the free search allowance, about 2 to 5
    cents above it, roughly 10 to 20 times Claude's measured cost today, in exchange for a
    product name, prices and reviews instead of "nothing has a price." **Nothing shows this**
    as a counted figure yet; it is a sum of the two derived figures above. Rival explanation for
    the whole comparison: Claude's 0.26 cents buys an identification with no search at all;
    the two numbers are not pricing the same product, and the honest comparison is Claude alone
    against Gemini's identification-only cost (0.3 to 0.6 cents), with the search cost priced
    separately as the thing Claude cannot do today at any price. **Shown by:** every derived
    figure above replaced with a counted one, once real Gemini calls exist.

- **What the leftover uncommitted code on this machine already covers, and where it goes
  wrong.** *Kind: all kinds. Moves: what each payer leaves after the store's cut and the model
  bill, since every defect named here is either a cost risk or a rework cost if carried forward
  unfixed. From: gemini-work-list.md, "Leftover code"; each file opened directly on this machine
  2026-09-14 for this pass, git status confirming all of it uncommitted.*
    · **What the person sees:** does not apply; none of it runs in the app today (`app/server.ts`
      imports the grounded functions but never calls them, per the work list, confirmed by
      `git diff --stat app/server.ts` showing changes with no route wired to them found in this
      pass)
    · **How it looks and sounds:** does not apply
    · **What it costs and earns:** the cost of finishing it versus starting clean; not measured,
      since finishing cost is not this tree's concern (rule 15: build cost is not an ordering
      criterion)
    · **What we are allowed to do:** none of it has run against a real key, so none of it has
      actually violated Google's terms yet; the risk is in what it would do once a key exists
    · **Who runs it when it breaks:** Jamin decides whether it is kept or deleted
      (gemini-work-list.md, "Leftover code"); nobody has picked a side yet
    · **What it feeds back:** nothing; untested code produces no data
    · **How it reaches people:** does not apply
  - What it covers: the provider interface and fallback wiring (item 12, item 13, above); a
    generic dollar spend cap wrapper (item 51's dollar half); a verdict step that calls Gemini's
    code-execution tool and asks it, in prose, to compute a median, a percent, a label and
    0-to-100 positions. **Shown by:** each file opened directly and read against the claim.
    [`identify/src/providers/gemini-grounded.ts`, opened 2026-09-14]
  - Where it goes wrong, each confirmed by opening the file rather than carried from the work
    list's own summary:
    - The ungrounded photo provider (`identify/src/providers/gemini.ts`, opened 2026-09-14)
      sends the API key as a `?key=` query parameter on `generateContent`, against Gemini 2.5
      models, not the Interactions API item 11 asks for. Its own header comment gives a real
      reason (structured output and `google_search` are documented incompatible on
      `generateContent`, so the grounded and ungrounded calls were deliberately split into two
      files), which is a defensible design note, not an oversight; the key-in-URL choice inside
      that same file is not defended the same way and is what item 11 requires changed. **Shown
      by:** the request construction and its header comment, read at the cited line.
    - The grounded price-and-review schema (`identify/src/providers/gemini-grounded.ts:527`,
      opened 2026-09-14) asks for only retailer, price and url. Size value, size unit, pack
      count, model number, specs and condition, and the description field from Jamin's later
      addition, are absent. Unit scaling and the tech variant filter have nothing to run on
      until this is fixed. **Shown by:** the schema object, read at the cited line. [item 17,
      item 28, item 30]
    - The verdict step's prompt (`identify/src/providers/gemini-grounded.ts:704`, opened
      2026-09-14) asks Gemini to write its own Python for a min-to-max positional scale, not
      Shin's fixed function from plan-gemini.md §4.3 (median-centred, span from
      `1.5 * good/bad thresholds`, boundaries at the user's own percentages). Because the code
      is generated fresh each time rather than resubmitted unchanged, item 20's check (comparing
      `executableCode.code` against Shin's own function) has nothing fixed to compare against;
      two calls for the same product could legitimately return two different scales. **Shown
      by:** the prompt string, read at the cited line.
    - Search-query counting is absent everywhere it was checked (confirmed by grep across every
      leftover file): `webSearchQueries` is captured and returned but never priced, so items 51
      and 52 are both open regardless of whatever else in this list gets fixed. **Shown by:**
      the grep across every leftover file, finding no pricing logic on that field.
  - **STANDING RULE: do not modify these files**, per the brief this pass was written under;
    this node is a reading, not a repair. Enforced by this pass making no edit to any leftover
    file; caught by a diff of the files against their state at the start of this pass, empty.
    **Written, uncommitted, no caller** is the correct state for every piece named above; none
    of it is "exists."

---

## 8. It is proven
*Kind: all kinds. Moves: answered from real prices on the thing itself, and where it cannot, answered from something weaker; corrections per hundred verdicts. From: Jamin, 2026-09-14, "research geminis terms for what our app is trying todo... consider everything we wanted this repo to do"; docs/gemini-work-list.md section I.*

- **The Interactions API response shape is what the code is tested against, not the legacy shape it was written for.** *Kind: all kinds. Moves: answered from real prices on the thing itself. From: docs/gemini-work-list.md item 74; Google's own docs, read 2026-09-14, "we recommend the Interactions API for all new development", generateContent "legacy".*
    · **What the person sees:** does not apply: a response-shape test has no screen
    · **How it looks and sounds:** does not apply: no face or voice in a parser test
    · **What happens behind the glass:** the leftover `identify/src/providers/gemini.ts` targets the legacy `generateContent` shape with the key in the URL (never run, 2.5 models); `gemini-grounded.ts` targets a newer shape; neither has been checked against the Interactions API Google's own docs recommend today (read 2026-09-14, see the tree's source)
    · **What it costs and earns:** a shape mismatch found after launch costs every grounded call until fixed; finding it now costs one afternoon rewriting fixtures
    · **What we are allowed to do:** no terms question; this is a wire-format check, not a use of grounded content
    · **Who runs it when it breaks:** whoever owns `identify/` (untitled while Aurik's agreement is open, [item 9])
    · **What it feeds back:** a shape mismatch caught here is what future sessions read instead of re-discovering it
    · **How it reaches people:** does not apply: never seen outside the code
  - Update or rewrite the request and response types to the Interactions API's own fields. **Shown by:** the SDK's or REST's documented Interactions response parsed by the code with no `any` cast standing in for an unknown field. [item 74]
  - Recorded fake Gemini responses for every request type (identification, barcode lookup, prices and reviews, verdict), so no test touches the network. **Shown by:** a session that did not write these checks breaking the mocked response wiring on purpose and watching the suite go red for that reason, not a stale pass; and the Mac stage deploy (`mac/DEPLOY.md:22-24`, opened this pass) turning green on the push that carries this wiring. [item 75]

- **Each new check is shown failing once, by a session that did not write it, before its green is trusted.** *Kind: all kinds. Moves: corrections per hundred verdicts. From: agent's own standing instruction ("a check is not a check until it has gone red, and not by its own hand"), applied here because it is the same failure mode Google's shape change would produce; docs/gemini-work-list.md item 76.*
    · **What the person sees:** does not apply: a falsification pass is internal
    · **How it looks and sounds:** does not apply
    · **What happens behind the glass:** a second session breaks the code the new check is supposed to catch (wrong unit conversion, wrong variant filter, a grounded fact written to the catalogue) and confirms the check goes red, then reverts
    · **What it costs and earns:** the cost is one session's time per check; what it buys is the difference between a check that watches something and a check that always passes
    · **What we are allowed to do:** the catalogue-write check in particular (item 33) is the one proving Google's terms are not being broken, so this is the check whose own falsification matters most
    · **Who runs it when it breaks:** whichever lane wrote the check does not also falsify it; a different session does
    · **What it feeds back:** a check that fails this step is rewritten before it is trusted, which is a finding worth its own line
    · **How it reaches people:** does not apply
  - Every new Gemini-path test broken on purpose once, by a session that did not write it, with the break and the re-fix both recorded. **Shown by:** the red run's output kept next to the test. [item 76]

- **All suites and typecheck are green, because the Mac's own stage deploy will not promote a red build.** *Kind: all kinds. Moves: answered from real prices on the thing itself. From: mac/DEPLOY.md:22-24, opened 2026-09-14: the deployer "run[s] app tests + typecheck + spine/identify/catalogue tests... Red: the live copy is not touched and the failing test names are posted"; docs/gemini-work-list.md item 77.*
    · **What the person sees:** does not apply directly, but a red deploy is the reason a broken Gemini path never reaches him
    · **How it looks and sounds:** does not apply
    · **What happens behind the glass:** app, identify, spine and catalogue test suites plus typecheck, exactly the set the deployer already gates on; price's tests are not run by the deployer today, unchanged by this work
    · **What it costs and earns:** free: this is an existing gate, not new machinery
    · **What we are allowed to do:** no terms question
    · **Who runs it when it breaks:** the deployer itself, automatically; a human reads the posted failing test names
    · **What it feeds back:** a red run blocks promotion, which is the feedback loop
    · **How it reaches people:** does not apply
  - Confirmed today (2026-09-14): identify's own suite is at 182 of 188 passing, with the 6 failures in `gemini-grounded.test.ts` on the old response shape (grep-confirmed: `groundedBarcodeLookup(` and `groundedPricesAndReviews(` are imported into `app/server.ts` at lines 45-49 but never called anywhere in that file, so the failing tests exercise code with no live caller yet); typecheck carries 4 errors. **Shown by:** a session that did not write these fixes breaking one of them on purpose and watching the suite or typecheck go red for that reason, not a stale pass; and the Mac stage deploy (`mac/DEPLOY.md:22-24`, opened this pass) turning green on the push that carries the fix. [item 77]

- **The Gemini website tests being run now are a rival explanation, not the API's behaviour, and the gap between them is what a same-prompt-through-the-key run would close.** *Kind: all kinds. Moves: answered from real prices on the thing itself. From: Jamin, 2026-09-14, "if you need to test gemini, use claude in chrome to operate: https://gemini.google.com/app"; the brief's own instruction to cite the file with date, rival explanation, and separator.*
    · **What the person sees:** does not apply to the test itself; it is upstream of anything shown
    · **How it looks and sounds:** does not apply
    · **What happens behind the glass:** the consumer website runs its own retrieval, ranking and possibly a different model tier than the API call this build would make; a good or bad answer on the website is evidence about the website, not about `GEMINI_API_KEY` calling the Interactions API with Google Search grounding turned on
    · **What it costs and earns:** the website tests are free (no key needed); they buy an early read on whether grounding can even answer these questions, at the cost of not being the thing being shipped
    · **What we are allowed to do:** the website's own terms, not the API terms in section 2, govern what was done in that browser; nothing from those chats is stored in Shin
    · **Who runs it when it breaks:** whoever is running the web-test pass (session logged 2026-09-14 02:45)
    · **What it feeds back:** a website answer that is wrong or inconsistent is a reason to weight the real API test higher, not a verdict on the API
    · **How it reaches people:** does not apply
  - Measured 2026-09-14, /private/tmp/claude-501/-Users-worker-agent/08e23c9d-cd92-43e8-a882-fee37196258c/scratchpad/gemini-web-tests.md, as of this pass: barcode-to-product search (T1a, four barcodes) got 2 of 4 correct with real source URLs, 1 honest "NOT FOUND", 1 plausible-but-unverified; a second chat on the same barcode (T1b) returned no source links at all and a variant name ("Extra Fresh") that conflicts with T1a's answer for the identical code ("Clean Comfort") and with the phone-photo ground truth. Rival explanation: two different website sessions can retrieve different pages for one barcode, or the model can vary answers without a fixed grounding call; what would separate this from the API's own behaviour is running the identical barcode through the API with the key and Google Search grounding on, once it exists, and checking whether the same inconsistency appears. **Shown by:** the two chats' text, already collected, plus the future paired API call. [item 74, 78 groundwork]
  - All nine collected website tests are now folded into the leaves they bear on rather than
    repeated here: section 1's ungrounded-photo node (T2, a can with no barcode visible, and T3,
    the same can's back panel with the barcode visible and read as an exact digit match) and its
    catalogue-code node (T1a, T1b, barcode search); section 2's one-call avenue and its three
    field nodes (T4, offers, reviews and description together; T8, a store-brand per-kg
    comparison with the strongest source links of any test; T9, reviews-only, with a
    self-inconsistent rating and count) and its citations node (a cross-test link-quality
    synthesis over T1a, T1b, T4, T6, T7, T8, T9); section 3's code-execution node (T5, the
    website's own "run this code" reply matching the local python3 run character for character)
    and its tech-variant node (T7, a 128GB/256GB, new/refurbished price table); section 4's
    French-and-phone-width node (T6, a fluent French reply with one self-inflicted formatting
    defect). Website test pending for: an image sent together with Google Search grounding in
    one request (item 23, no collected test combines the two); a real end-to-end run through the
    API with the key, which is the only thing that separates any of the above from the website's
    own behaviour (the node below). **Shown by:** each cited test's own leaf, already carrying
    its result, elsewhere in this document. [items 78, 27-32]

- **A real end-to-end run with the key is the one thing nothing above substitutes for.** *Kind: all kinds. Moves: what each payer leaves after the store's cut and the model bill; answered from real prices on the thing itself. From: docs/gemini-work-list.md item 78; section 3's own cost table, which is estimates and guesses pending this run.*
    · **What the person sees:** a full scan, start to finish, on the actual result screen (section H's children), not a unit test's assertion
    · **How it looks and sounds:** the face and line during a Gemini call, exercised for real rather than assumed from Claude's timing
    · **What happens behind the glass:** barcode miss, front photo, grounded prices, grounded reviews, the verdict function run in Google's sandbox, the price line drawn, in one trace
    · **What it costs and earns:** this run is what turns section 3's "guess until measured" (searches per lookup) into a counted number, and turns the estimated cents-per-scan into a billed one
    · **What we are allowed to do:** this is the first live use of the key against Google's terms in production shape, so it is also the first chance to catch a terms violation in a real response rather than a fake one
    · **Who runs it when it breaks:** whoever holds the key at the time (Jamin creates it, [item 1]); a broken run here is a stop-and-report, not a retry loop
    · **What it feeds back:** the real cost-per-call numbers (item 52) and the real searches-per-lookup number feed the spend cap (item 51) and section 3's table
    · **How it reaches people:** does not apply to the run itself; it is the rehearsal for section 79 below
  - Barcode miss: an item not on the shelf of known products, run through the grounded barcode lookup, product name/brand/size with links returned. **Shown by:** one such scan's raw response, kept. [item 78]
  - Front photo: the ungrounded identification returned and paired with the missed barcode. **Shown by:** the stored pairing, read back. [items 78, 2.1]
  - Grounded prices and reviews: at least one retailer offer with a price, link, size, and at least one review block, for one real item. **Shown by:** the raw response. [items 17, 78]
  - Verdict: the code-execution step actually running Shin's fixed function, `executableCode.code` checked against it, and a drawn line. **Shown by:** the check passing on a real response, and the line rendered. [items 19, 20, 78]
  - Cost per scan and searches per lookup, measured rather than estimated. **Shown by:** the token counts and search-query count read off this run's own response, not section 3's guess. [items 52, 78]

- **A phone test on iPhone Chrome, with Jamin present, is the end nothing else can stand in for.** *Kind: all kinds. Moves: return in week two; scans per returning person per week. From: docs/gemini-work-list.md item 79; the-tree.md's own end-state rule, "in front of a person who has not seen the app before" is not met here since he has, but "on a real phone" is the applicable clause.*
    · **What the person sees:** the whole flow he asked for in his own words (barcode first, photo coaching, accepted answers, the no-link heads-up, reviews)
    · **How it looks and sounds:** the actual coaching voice and the actual price line at phone width, not a description of them
    · **What happens behind the glass:** does not apply beyond what section I's earlier ends already covered; this end is about what he sees
    · **What it costs and earns:** does not apply beyond the scan cost already covered above
    · **What we are allowed to do:** this is a real end user under the terms (section 2.2's display rules apply live, for the first time, to a person who is not testing code)
    · **Who runs it when it breaks:** whoever is present for the test; a failure here is reported directly, not queued
    · **What it feeds back:** his reaction is the first outside read since 2.4's "consider everything we wanted"
    · **How it reaches people:** this is the first time it reaches a person at all
  - One full scan cycle on his own iPhone, in Chrome, watched. **Shown by:** him seeing the result screen and saying what is wrong with it, in his own words. [item 79]

## 9. The people, records and decisions around it
*Kind: all kinds. Moves: none directly; this section is the standing-rule and his-call scaffolding the rest of the tree depends on. From: docs/gemini-work-list.md section A and J; docs/the-tree-rules.md rule 1 (source) and rule 11 ("his").*

- **Aurik's agreement, since he owns the file this whole switch lands in.** *Kind: all kinds. Moves: none (a permission gate). From: docs/the-beta-build-plan.md:250, I9, "he owns the model file (his are the last five commits on it)"; docs/the-beta-build-plan.md:263, the Identify lane row, "identify/src/cap.ts, identify/eval/*, identify/src/describe.ts; never model.ts".*
    · **What the person sees:** does not apply: a between-humans agreement, not a screen
    · **How it looks and sounds:** does not apply
    · **What happens behind the glass:** the leftover code already puts a Gemini branch inside `makeProvider` in `identify/src/model.ts`, which is exactly the file the lane rule says this repo's other lanes never touch; that rule was written before this switch was proposed
    · **What it costs and earns:** does not apply
    · **What we are allowed to do:** an internal ownership rule, not a legal one, but breaking it is the same shape of problem section 8's "never model.ts" protects against
    · **Who runs it when it breaks:** Aurik, once told; today he is only "told" (docs/the-beta-build-plan.md:250) about the beta in general, not asked about this specific branch inside his file
    · **What it feeds back:** his answer decides whether the leftover `model.ts` diff is rebuilt with him, handed to him, or redone by him
    · **How it reaches people:** does not apply
  - **HIS:** does Aurik agree to a Gemini branch inside `makeProvider` in `identify/src/model.ts`, and does he want to write it himself or review what is already sitting uncommitted. [items 3, 12]

- **The clash with beta build plan item 30, and the ways out of it.** *Kind: all kinds. Moves: corrections per hundred verdicts (a generated review shown as fact is a wrong verdict input). From: docs/the-beta-build-plan.md:163, "30. Review display... shown only when a licensed source has a row; nothing generated"; Jamin, 2026-09-14, "Gemini also provides reviews which is something that we wanted to add."*
    · **What the person sees:** two different rules about the same block on the same screen, unresolved
    · **How it looks and sounds:** does not apply beyond the block itself
    · **What happens behind the glass:** item 30's component reads only a licensed source's row; a Gemini review is grounded search output, not a licensed source's row, so as written the component would refuse to show it
    · **What it costs and earns:** does not apply directly; the earlier plan's caution was against showing an invented rating as if it were sourced
    · **What we are allowed to do:** a Gemini review comes with a source link and a rating attributed to that source, which is closer to "licensed" in spirit than a model inventing a number, but it is grounded content under section 2's terms, not a licence Shin holds
    · **Who runs it when it breaks:** whoever merges the two documents; today neither overrides the other
    · **What it feeds back:** whichever way this resolves is what item 66's review block is built against
    · **How it reaches people:** the review block is one of the things filmed (section H)
  · ⇄ avenue: update beta build plan item 30 to read "a licensed source's row, or a Gemini review with its source link and Search Suggestion shown", since Gemini's own reviews carry a link per the plan's section 4.1. Needs only the wording change. Limits: this is Jamin's document to edit (agent's own rule, "his to fix"), so a session records the option rather than editing his file. Not tested, since it is a wording decision, not code.
  · ⇄ avenue: drop Gemini reviews and keep item 30 as written. Needs nothing; it is the status quo. Limits: this directly contradicts his 2026-09-14 words above, so this avenue is only live if he says the two goals conflict and item 30 wins. Not tested, same reason.
  · ⇄ avenue: show both, labelled separately, "official rating" vs "Gemini search result", never merged into one number. Needs a design decision on the result screen (section H) for two blocks instead of one. Limits: still needs item 30's wording to permit a Gemini block existing at all. Not tested, since it is undecided.
  - **HIS:** which of the three, or another, and whether item 30's text gets changed. [item 4]

- **Setup notes for the key and settings, so the switch can be turned on at all.** *Kind: all kinds. Moves: none directly; this is the wiring the rest of section B needs to run. From: docs/gemini-work-list.md item 80; docs/plan-gemini.md section 9 and section 10's first bullet.*
    · **What the person sees:** does not apply: an environment file, never a screen
    · **How it looks and sounds:** does not apply, same reason: an env-file entry, not a
      rendered surface
    · **What it costs and earns:** nothing until the key exists; every cost figure in section 3 is estimated until it does
    · **What we are allowed to do:** the key itself must never enter the repo (agent's HARD RULE 5, and this project's own "not in any repo" on the same line)
    · **Who runs it when it breaks:** whoever holds `mac/config.env`
    · **What it feeds back:** does not apply
    · **How it reaches people:** does not apply
  - `mac/config.env` example entries for `GEMINI_API_KEY`, `SHIN_MODEL_PROVIDER`, `SHIN_GEMINI_MODEL`, with a note that the key must carry billing (paid tier only, section 2.4) since grounding is "Not available" on the free tier. **Shown by:** a fresh machine following the example and reaching a working `SHIN_MODEL_PROVIDER=gemini` call. [item 80]
  - **HIS:** Jamin creates the key at Google AI Studio with billing on. Nothing calls Gemini until this exists (docs/plan-gemini.md section 10). [item 1]

- **The decisions file entry, which the code already assumes exists.** *Kind: all kinds. Moves: none (a record, not work). From: identify/src/provider.ts:118, opened 2026-09-14, "Added 2026-09-14 for the Gemini switch (`docs/decisions.md`, 'Gemini for barcode and image identification')"; docs/decisions.md itself, grepped 2026-09-14, no entry by that name exists (last entries run through "A substitute is the same leaf, then one step up and labelled, never a shelf").*
    · **What the person sees:** does not apply
    · **How it looks and sounds:** does not apply: a document heading, not a screen
    · **What happens behind the glass:** a comment in live-adjacent (uncommitted) code cites a record that is not there; the next session that trusts the comment without checking finds nothing
    · **What it costs and earns:** does not apply: writing one entry costs a few minutes, no recurring cost
    · **What we are allowed to do:** this is exactly the failure agent's tree rules amended for once already (rule 1: "'the module' or 'the lane that built it' is evidence of state, never a source"), here in the other direction: a source cited that was never written
    · **Who runs it when it breaks:** whoever writes the entry, once the decision itself (Gemini in principle) is confirmed rather than just planned
    · **What it feeds back:** every future citation of "docs/decisions.md, 'Gemini for barcode and image identification'" is correct only after this leaf closes
    · **How it reaches people:** does not apply: an internal record, never shown to an end user
  - Write the entry: title, date, status ("decided in principle, build stopped part way", per docs/plan-gemini.md's own status line), why (his quote from section 1), reverses-if. Include the fallback-to-Claude decision the leftover `provider.ts` already assumes. **Shown by:** the comment's citation resolving to a real heading. [item 81]

- **The defect log entries this switch touches or closes.** *Kind: all kinds. Moves: corrections per hundred verdicts. From: DEFECTS.md, opened 2026-09-14, D-099, D-024, D-096, D-098; docs/gemini-work-list.md item 82.*
    · **What the person sees:** does not apply: a log entry, not a screen
    · **How it looks and sounds:** does not apply, same reason
    · **What it costs and earns:** does not apply: updating four existing entries costs minutes, no recurring cost
    · **What we are allowed to do:** does not apply: an internal record, no terms question
    · **Who runs it when it breaks:** whoever next opens DEFECTS.md and trusts a stale status line
    · **What it feeds back:** a defect log is exactly "what it feeds back" for the rest of the tree, so this leaf is that dimension made concrete
    · **How it reaches people:** does not apply: never shown to an end user
  - D-099 (photo drops the flavour or variant): status is "Built 2026-09-14, unmeasured on a photograph", explicitly waiting on "no photograph has been run, because there is no API key on this machine". Once Gemini's ungrounded photo identification exists, this is the path that finally runs that photograph. **Shown by:** the same Cherry Coke Zero can (or an equivalent variant pair) photographed and correctly named through the new path. [item 82]
  - D-024 (missing key on the photo path): recorded fixed 2026-09-09 except for the one open line, "the model key is still the one thing this machine does not have." Gemini's key does not close this line for the Claude path, but it is the same missing-key shape for whichever provider is live; the entry should say which key it now means. **Shown by:** the entry re-read once a key of either kind exists.
  - D-096 (tech eval codes are placeholders absent from the catalogue): bears on tech identification generally, unrelated in cause to Gemini, but a Gemini identification path being measured against this same eval manifest would inherit the same 20 unreachable tech rows. **Shown by:** noting in the entry that the manifest issue also blocks measuring Gemini's tech accuracy until item 96's re-selection happens, if that measurement is wanted here.
  - D-098 (image catalogue is empty): unrelated to Gemini directly (it is about comparing a photo to a stored catalogue image), but worth a cross-reference since Gemini's ungrounded photo path is a second route to "what does this look like" that does not need D-098's missing image column at all. **Shown by:** the cross-reference line added, not a fix to D-098 itself.
  - Update all four with a dated line once Gemini changes their status. **Shown by:** DEFECTS.md
    re-read after the update, each of the four entries carrying a dated line. [item 82]

- **Catch-up notes and the Notion page, so Aurik and anyone else reads this in plain words without opening the repo.** *Kind: all kinds. Moves: none (a communication record). From: notes/catch-up.md:1-4, opened 2026-09-14, "Read at session start by any Claude session on Shin, so its human hears what changed"; docs/plan-gemini.md section 9, "He was told on the Notion page (Needs attention, 2026-09-14 06:00 UTC)."; docs/gemini-work-list.md item 83.*
    · **What the person sees:** the one place a human catches up without reading code
    · **How it looks and sounds:** plain dated entries, newest first, the same voice as the
      rest of the file, not a new format
    · **What it costs and earns:** does not apply: writing one entry costs minutes
    · **How it reaches people:** this and the Notion page are the only "reach" this section has; nothing here is filmed
    · **What we are allowed to do:** does not apply beyond ordinary internal communication
    · **Who runs it when it breaks:** whoever last touched notes/catch-up.md; today's entry needs a "To do" line for Jamin (the key) and a note that Aurik's Notion mention already happened once
    · **What it feeds back:** whoever reads catch-up.md next session learns what changed without opening the repo, which is the whole point of the file
  - Add today's entry to notes/catch-up.md: what changed, and the named "To do" for Jamin (the key, item 2's twelve-item pick). **Shown by:** the file's newest-day-first entry reading like the rest of the file. [item 83]
  - Confirm the existing Notion "Needs attention" note to Aurik (2026-09-14 06:00 UTC) is enough, or update it once his agreement (this section's first leaf) is answered. **Shown by:** the Notion page read back after his answer. [item 83]

- **What to do with the leftover uncommitted code: his to decide, three ways.** *Kind: all kinds. Moves: none (a decision, not work). From: docs/gemini-work-list.md, "Leftover code (not asked for)... Jamin decides whether it is kept or deleted."; git status, run 2026-09-14, confirms the diff is still uncommitted: `app/server.ts`, `identify/src/cap.ts`, `identify/src/model.ts`, `identify/src/provider.ts` modified, `identify/src/providers/{gemini,gemini-grounded,gauge,gauge-variant}.ts` and three test files untracked.*
    · **What the person sees:** does not apply: uncommitted code on the Mac's own working copy,
      never reaching a screen until one of the three avenues below is chosen
    · **How it looks and sounds:** does not apply, same reason
    · **What happens behind the glass:** confirmed 2026-09-14 by grep: `gemini-grounded.ts`'s `groundedBarcodeLookup` and `groundedPricesAndReviews` are imported into `app/server.ts` (lines 45-49) but called nowhere in that file, matching the work-list's "imports grounded functions but never calls them"; `identify`'s suite is 182 of 188 passing (6 failures in `gemini-grounded.test.ts` on the old shape) and typecheck carries 4 errors, so pushing this as-is turns the Mac stage deploy red (mac/DEPLOY.md:22-24)
    · **What it costs and earns:** keeping it uncommitted costs nothing extra today; deleting it costs the redo if the same design is wanted later; committing it as-is costs a red deploy
    · **What we are allowed to do:** this code was written before Aurik's agreement (this section's first leaf) and before the item-30 clash (second leaf) was resolved, so committing it now would ship a reviews path this document has not cleared
    · **Who runs it when it breaks:** whoever owns `identify/` once Aurik's agreement lands; today nobody, since nothing calls it
    · **What it feeds back:** his decision below decides whether this diff ever becomes a commit
      other sessions build on
    · **How it reaches people:** does not apply until one of the three avenues below ships
  · ⇄ avenue: **keep**, fix the 6 failing tests and 4 typecheck errors, wire the grounded functions to their call sites, and finish it against this plan. Needs Aurik's agreement first (it lives inside his file) and item 30's resolution (it includes reviews). Not tested, since it is his call.
  · ⇄ avenue: **rework**, keeping the provider seam and fallback wrapper (which match this plan's section 9 shape) but rewriting `gemini-grounded.ts` to the Interactions API shape (section 8's first leaf) and dropping or redoing `gauge.ts`/`gauge-variant.ts` against the fixed verdict function's actual spec (section C, not drawn in this branch). Needs the same two answers as keep, plus the rewrite itself. Limited by how much of the existing work the rewrite can actually reuse, unmeasured. Not tested.
  · ⇄ avenue: **delete**, and start section B and C fresh once Aurik and the item-30 question are both answered. Needs only those two answers. Limits: throws away a working provider interface and fallback wrapper that already match the plan's shape, at zero present cost since none of it is committed or live. Not tested, since it is his call.
  - **HIS:** keep, rework, or delete. [item 2's neighbour in the work list, unnumbered "Leftover code" section]

---

## 10. The app joins them
*Kind: all kinds. Moves: every figure, since nothing above answers a person until this joins it.
From: the moonshot's tenth part, the app itself, "the only one a person ever touches and the one
that joins the others into something openable" [the-tree.md, "The root"]; Jamin, 2026-09-14
[docs/plan-gemini.md §1, §9].*

- **Every model call goes through one provider switch, and today one route still bypasses it.**
  *Kind: all kinds. Moves: every figure the identification nodes above move, since nothing reaches
  Gemini at all if a route holds its own client. From: work-list item 14; "today app/server.ts
  passes an Anthropic client directly, so the provider setting is ignored there"
  [docs/plan-gemini.md §9].*
    · **What the person sees:** does not apply directly; this is what makes every other node's own
      "what the person sees" possible at all.
    · **How it looks and sounds:** does not apply.
    · **What it costs and earns:** a route bypassing the switch cannot be capped or logged by the
      same spend-cap wrapper the switched routes use, a cost-control gap while it stands. Waits on:
      node 7.
    · **What we are allowed to do:** does not apply, the switch itself carries no Google content.
    · **Who runs it when it breaks:** whoever reads server logs for a route quietly still calling
      Claude when the environment names Gemini, since that would look like Gemini succeeding when
      it never ran.
    · **What it feeds back:** does not apply.
    · **How it reaches people:** does not apply.
  - The live photo route fixed to call the provider switch. Written, uncommitted; fully described,
    with its own finding, not repeated a third time here. **Shown by:** the same citation as
    section 7's identical finding. [app/server.ts, modelOnce at line 1162, opened 2026-09-14]
  - **Finding, same one as above:** the switch's Gemini branch currently builds the wrong client
    (older endpoint, key in the request address). Until corrected, "every call goes through the
    switch" is true, but the switch does not yet point at the thing the rest of the plan assumes.
    [waits on: the connection: the Interactions API, with the key in a header, never a URL]
  - No other route in the server file was found calling a model client directly outside the one
    seam this switch is meant to be; the live photo route was the one bypass, and it is the one
    already being fixed. **Shown by:** the whole file grepped for a direct client construction
    outside the switch, finding none. [app/server.ts, searched 2026-09-14]

- **The barcode route: a catalogue hit answers as it does today, a miss now also asks Gemini.**
  *Kind: things that carry a code. Moves: answered from something weaker, since this route's whole
  job is turning "not in our catalogue" into something rather than nothing. From: work-list item
  44.*
    · **What the person sees:** no change on a hit; on a miss, a name and source instead of only
      "we don't have this."
    · **How it looks and sounds:** does not apply beyond the identification node this route calls.
    · **What it costs and earns:** a miss now costs a Gemini call where it used to cost nothing;
      this route is the exact point that spend starts, so it is also the point a cap has to guard.
      Waits on section 7, "the daily call cap and spend cap, extended to Gemini calls."
    · **What we are allowed to do:** this route is where "never write a grounded result to the
      catalogue" has to be enforced in code, since a grounded answer and the catalogue's own write
      path sit next to each other in the same function.
    · **Who runs it when it breaks:** whoever watches the miss rate and the Gemini error rate
      together, since a spike in one can hide inside the other.
    · **What it feeds back:** does not apply beyond the identification node's own note.
    · **How it reaches people:** does not apply.
  - wiring: the route's existing miss branch is the exact hook point, and nothing calls the
    grounded lookup from it today. **Written, no caller. Shown by:** the whole file searched for
    a call to it, finding only its import. [app/server.ts, the miss branch at lines 1729-1826,
    opened 2026-09-14]
  - A test proving a grounded answer reaches this route's own response but never reaches the
    catalogue database. **Not built. Buildable. Shown by:** the test written and run once,
    failing red if a grounded field reaches the catalogue table, green once the guard (section
    5's guard node) is wired to this route. [item 33]

- **The photo route: an unbarcoded item is identified by Gemini through the provider.** *Kind: all
  kinds. Moves: answered from real prices on the thing itself, and where it cannot, answered from
  something weaker. From: work-list item 45.* [item 45]
    · **What the person sees, how it looks and sounds, what it feeds back, how it reaches
      people:** already reviewed under this branch's own identification node in section 1; this
      route is that node reached through one door, not a second thing to review.
    · **What it costs and earns:** does not apply beyond the identification node's own figure.
    · **What we are allowed to do:** does not apply beyond the same node.
    · **Who runs it when it breaks:** whoever owns the provider switch above, since this route's
      only job is calling it correctly.
  - The route already calls the fixed model builder, so once the wrong-client finding above is
    corrected, this route reaches whichever provider is named without any further change here.
    **Shown by:** the route read at the cited line, calling the same builder section 7 and this
    section's first branch already describe. [app/server.ts, the route at line 2002, opened
    2026-09-14]
  - Nothing here yet carries the size or spec question back to the client when identification
    could not settle one; the route's own response shape would need the field added. **Not
    built. Buildable. Shown by:** the field added to the route's response shape and a scan with
    an unsettled spec question showing it on the client.

- **The price route: Gemini's prices and reviews run when Shin's own sources have nothing, then a
  verdict once a shelf price exists.** *Kind: all kinds. Moves: what each payer leaves after the
  store's cut and the model bill, since this route is where the plan's per-scan cost is actually
  spent, and answered from something weaker, since Gemini's prices are national, not per-store
  [docs/plan-gemini.md §7, item 12]. From: work-list item 46; docs/plan-gemini.md §4.*
    · **What the person sees:** a price line and reviews where today there is nothing, once Shin's
      own sources are empty.
    · **How it looks and sounds:** two sections, ours and Gemini's, never merged into one list
      [docs/plan-gemini.md §2.2].
    · **What it costs and earns:** this is where the search budget and the code-execution verdict
      step are actually spent; the plan puts the total near 0.5 to 1 cent per scan inside the free
      allowance [docs/plan-gemini.md §3].
    · **What we are allowed to do:** the resubmission pattern exists specifically because computing
      a median here, in our own code, would be analysing a Grounded Result, which the terms
      forbid [docs/plan-gemini.md §4.3].
    · **Who runs it when it breaks:** whoever watches the code-match check failing, since a
      mismatch means showing prices and reviews with no verdict rather than a wrong one.
    · **What it feeds back:** does not apply directly; the harvest is the shelf price the person
      types, which belongs to a different branch of this tree, not this route.
    · **How it reaches people:** does not apply.
  - wiring: the route exists and already runs the existing arithmetic verdict for Shin's own
    sources; it does not call either of the two Gemini functions this step needs. **Written, no
    caller, for both. Shown by:** the whole server file searched for both names, finding
    neither. [app/server.ts, the route at line 2171; identify/src/providers/gemini-grounded.ts,
    the two functions, both opened 2026-09-14][item 46]
  - Shin's own arithmetic verdict, kept and shown in its own section, is unaffected by this change
    and is the sibling this route must never merge Gemini's section into. [waits on: the result
    screen puts the pieces below into one screen]
  - The verdict arithmetic itself, the median, the resubmission, and the check that Gemini ran
    Shin's own code unchanged, is already written and does send the fixed function rather than
    trusting Gemini's own arithmetic, confirmed by reading the function that builds the request.
    Building it again here would duplicate it; this route's job is only to call it. [waits on:
    the fixed function Gemini runs by code execution] [identify/src/providers/
    gemini-grounded.ts, groundedVerdict, and gauge.ts's GAUGE_PYTHON_SOURCE, both opened
    2026-09-14]
  - Shelf price input gates whether a verdict runs at all; no shelf price means prices and reviews
    with no verdict. [waits on: the fixed function Gemini runs by code execution] [item 48]

- **The camera-to-result flow carries a scan through whichever path answered it.** *Kind: all
  kinds. Moves: every figure the routes above move; this is what makes them one continuous thing a
  person experiences rather than four separate features. From: the moonshot's one sentence, "point
  the phone at anything, and Shin ends the decision" [docs/the-vision.md].*
    · **What the person sees:** one continuous flow: barcode attempt, photo fallback, a question if
      needed, then a result screen with whichever sections have content.
    · **How it looks and sounds:** the face and dock carry the person through every state change
      without a hard screen change at each step.
    · **What it costs and earns:** the sum of whichever nodes above actually ran for this scan;
      nothing new at this level.
    · **What we are allowed to do:** this is where the display rules (separate sections, no
      interstitial, no rewriting) actually get enforced, since the result screen is the one place
      every section meets [docs/plan-gemini.md §2.2].
    · **Who runs it when it breaks:** whoever watches a scan that started but never reached a
      result screen at all, a harder failure to see in any single route's own log.
    · **What it feeds back:** does not apply beyond what each stage already feeds back.
    · **How it reaches people:** a scan that flows well end to end is the shareable moment the
      vision's marketing principle describes; a scan that stalls anywhere in it is the opposite.
  - wiring: the camera screen hands its result to the identify or photo route, which hands a
    shelf price to the price route, which hands a result to the result screen. [waits on: it
    knows what the thing is; the result screen puts the pieces below into one screen]
  - No single file was found owning this whole chain end to end; it is assembled from the routes
    above plus the client screens. Not a gap unique to Gemini: the same is true of today's
    Claude-only flow. **Shown by:** the four routes and the result screen, each already cited
    at its own node above, read together as one chain.

- **The offline path answers what it can from the phone alone, and says nothing else is
  reachable.** *Kind: grocery barcodes already in the on-device pack; nothing else. Moves: answered
  from real prices on the thing itself, for the narrow set the pack covers; everything past that is
  honestly unanswered rather than guessed. From: work-list item 53; "the pack answers barcodes
  with the network off" [docs/the-vision.md, principle 5].* [item 53]
    · **What the person sees:** a barcode already in the small grocery pack still answers with no
      signal; anything needing Gemini, a miss, a photo, prices, has no offline answer and must say
      so plainly rather than hang.
    · **How it looks and sounds:** does not apply beyond the existing offline behaviour.
    · **What it costs and earns:** free; the whole point of the pack is answering without a
      network call.
    · **What we are allowed to do:** does not apply, nothing Gemini-related is reachable offline
      at all.
    · **Who runs it when it breaks:** whoever watches how often a scan lands here with no pack hit,
      the honest measure of how much of a real day this path covers.
    · **What it feeds back:** does not apply, an offline scan cannot phone home until the
      connection returns.
    · **How it reaches people:** does not apply.
  - The offline reader is grocery-only and barcode-only; it never attempts a photo identification
    and has no path to Gemini or Claude at all, online or off. **Exists. Shown by:**
    `identifyOffline` read at the cited line, calling only the on-device pack lookup.
    [app/public/js/offline-aisle.js, identifyOffline at line 48, opened 2026-09-14]
  - Not built: what the app actually shows when a scan needs Gemini and there is no network, a
    photo taken offline, or a barcode miss offline. No branch for either case was found in the
    offline code. This gap is inherited from today's Claude-only flow, not created by the Gemini
    switch. **Buildable. Shown by:** a plain "no connection, try again once you're online"
    message shown for both cases, not a guess.

---

## Proposed: other kinds of items, waiting for Jamin
*Rule 19: these came from docs/plan-gemini.md section 7 ("proposed, not yet decided") and Jamin's own open question there ("Jamin asked whether other items need rules"), not from a decided ask, so they are explored but not admitted as tree nodes. [item 2]*

1. **Sold by weight** (produce, meat, deli, bulk; store-printed weight or price barcodes). Breaks the unit rules because the barcode itself encodes a variable price or weight per item rather than naming a fixed product, so the same code means a different price on every scan. Avenue: read the sticker's printed price and weight and compare per kg or lb (plan's proposal); limited by needing OCR or a barcode-format decode Shin does not have today, untested. Avenue: ask Gemini to read the sticker photo directly (ungrounded, since it is Shin's own photo, not a search); limited by accuracy on a small printed sticker, untested. Undecided, and not admitted as a tree node per rule 19: whether to adopt this at all, and whether organic stays a separate line as proposed.

2. **Store brands** (Great Value, President's Choice, Kirkland). Breaks the variant rules because a store brand is not the "same model" as anything, so the tech-variant matching in section 6 does not apply, and it is not a barcode miss either. Avenue: label it and compare per unit against the nearest name-brand equivalent (plan's proposal), which needs a "nearest equivalent" matcher that does not exist; untested. Avenue: treat it as an ordinary unit-scaled product with no cross-brand comparison at all, simplest, loses the comparison he may want. Undecided: whether the cross-brand comparison is worth building.

3. **Real unit is not the package size** (loads, doses, sheets). Breaks the unit-scaling rule in section 5 because g/mL/each is not the unit a shopper compares on; two bottles of the same mL can wash a different number of loads. Avenue: scale to the stated count when the package states it (plan's proposal), needs that count read reliably from a label or the catalogue, most packages already print it, untested. Avenue: fall back to weight or volume when no count is stated (plan's proposal), which is what today's rule already does, so this is the same rule with a named exception. Undecided: which categories this applies to first.

4. **Deals, multibuy and member prices** (2-for-$5, PC Optimum, Costco). Breaks the "one price per offer" assumption the price line uses, since a deal price is conditional on buying more than one or holding a membership. Avenue: compute and show the effective per-item price under the deal, labelled (plan's proposal); needs the deal terms parsed from wherever the price was found, which grounded search may or may not surface reliably, untested. Avenue: show only the non-deal shelf price and ignore deals entirely, simplest, understates savings. Undecided: whether member-only prices belong on the line at all or only as a separate label.

5. **Deposits, recycling fees, shipping and tax.** Breaks the "the price is the price" assumption, since two prices that look equal before these charges can differ after them. Avenue: compare before tax and deposits, label "+shipping" or similar when known (plan's proposal); needs Gemini or a source to actually return these as separate fields, unconfirmed whether it does. Avenue: ignore the distinction and compare sticker prices only, simplest, can rank a worse total deal as cheaper. Undecided: whether this matters enough to ask Gemini for the extra fields.

6. **Marketplace sellers and US listings.** Breaks the "one national CAD price" assumption underlying the whole line, since a marketplace price is seller-specific and a US listing is a different currency and often a different product regulatory class. Avenue: show them labelled and excluded from the verdict line (plan's proposal), needs a currency and seller-type field from the grounded search reliably enough to filter on, untested. Avenue: drop marketplace and US results entirely at the request-instruction level ("Canadian stores and CAD only", item 18), simplest, may just return fewer results rather than none. Undecided: whether seeing them labelled is worth the risk of a shopper misreading a US price as a deal.

7. **Fixed-price items** (LCBO, SAQ, tobacco). Breaks the whole point of a price line, since by provincial law the price does not vary by store. Avenue: show "same price everywhere in <province>" instead of a line (plan's proposal), needs Shin to know which categories are fixed-price and in which province, a short fixed list, untested. Avenue: run the normal grounded search anyway and let it come back flat, wastes a search call to prove nothing. Undecided: whether to adopt the special-cased label.

8. **Medicines and baby formula.** Breaks the identification-to-price pipeline for prescriptions specifically, since there is no public price to ground on, and raises a safety question generated content should not touch. Avenue: skip prescriptions entirely, price over-the-counter medicine per dose like any other item (plan's proposal); OTC dosing math is an instance of item 3 above. Avenue: skip the whole category including OTC, safest, gives up a real everyday use case. Undecided: whether a generated (grounded) price or dosage comparison on medicine is something he wants Shin anywhere near, given no licensed-source rule exists for medical claims the way item 30 exists for reviews.

9. **Used, refurbished, collectible.** Breaks the "compare to new retail price" assumption; a used item's fair price is a distribution of past sale prices, not a shelf tag. Avenue: compare against Shin's existing eBay sold-comps source by condition (plan's proposal); the source is written, wired into the source registry with mock tests, never run against eBay itself [`spine/src/sources/registry.ts:74`, `spine/test/ebay.test.ts`, opened this pass], so this avenue depends on a source exercised only against mocks, not the live API. Avenue: use Gemini's grounded search for asking prices instead of sold prices, easier to get, but an asking price is a worse signal than a sold price for "fair," which the plan itself already prefers sold comps over. Undecided, and not admitted as a question here: whether the eBay source is worth running against the live API for this, ahead of anything else it might unblock.

10. **Local shops, markets, handmade with no online price.** Breaks the assumption that a price exists to find at all. Avenue: say so plainly instead of an empty line (plan's proposal), needs nothing new, it is a message state. Avenue: ask Gemini to estimate a typical price range from similar listed items elsewhere, explicitly a guess; conflicts with "we accept all answers gemini gives" only if the guess is presented as a real price rather than labelled as an estimate. Undecided: whether a labelled estimate is acceptable here, or "no price found" has to be the ceiling.

11. **Editions and bundles** (hardcover vs paperback, game platforms, console bundles). Breaks the exact-variant matching in section 6 in the other direction: two editions can share a barcode family but never share a fair price comparison, and a bundle's parts have no individual price to check against. Avenue: each edition is its own variant, bundles listed separately and not decomposed into their parts (plan's proposal); this is a direct extension of section 6's existing variant rule, low risk, untested. Avenue: try to price a bundle's parts individually and sum them for comparison, more informative, but needs a parts list Gemini's grounded search may not reliably return. Undecided: whether bundle part-pricing is worth building, or "listed separately, no verdict" is enough.

12. **Local price differences between stores.** Breaks the promise implicit in a single "fair" line, since Gemini's grounded search returns national online prices, not this shopper's own store's shelf price. Avenue: label the line "online prices" until Shin has store-level prices (plan's proposal), an honest downgrade, needs no new build beyond the label. Avenue: wait for Shin's own store-level crawls (Walmart, Canadian Tire, per the-tree.md's existing sourcing branch) to join in and override the label per store, which is already the direction the rest of the tree is going, just not yet joined to the Gemini path. Undecided: whether the honest label is enough for the family beta, or this needs to wait on the store-level join before shipping at all.

---

## Checked

`gemini-web-tests.md` was re-read after the browser agent that produced it finished, and it
held nine tests, T1a through T9. All nine are folded into this document, each dated, each
carrying the rival explanation that the consumer website is not the API and what would separate
them (the same prompt through the API with the key), per the brief:

- **T1a and T1b** (barcode-to-product search, four barcodes plus a repeat of one): folded into
  section 1's catalogue-code node, its citations node's cross-test synthesis, and again,
  briefly, into section 8's proof summary.
- **T2** (ungrounded photo identification, front of can) and **T3** (ungrounded photo
  identification, back of the same can, barcode visible): folded together into section 1's
  ungrounded-photo avenue.
- **T4** (one grounded call for offers, reviews and description together, as JSON): folded into
  section 2's one-call-versus-three avenue, its store-offer, review and description field
  nodes, and its citations node's cross-test synthesis.
- **T5** (code execution: the fixed verdict function's arithmetic, run three ways: locally,
  inside this pass, and by the consumer website): the local run and the website's run both
  folded into section 3's code-execution node, alongside the finding that the task's own stated
  "correct" output does not match either run.
- **T6** (French-language grounded price search): folded into section 4's French-and-phone-width
  node and section 2's citations node (weak, homepage-only links).
- **T7** (tech-variant grounded price table, iPhone 16): folded into section 3's tech-variant
  node and section 2's citations node (mostly non-functional links).
- **T8** (store-brand, per-kg comparison with a false-premise size in the prompt): folded into
  section 2's store-offer-fields node and its citations node (the strongest links of any test).
- **T9** (reviews-only, with a self-inconsistent rating and review count): folded into section
  2's review-fields node and its citations node.
- Left as "website test pending" where no result exists in the file as of this pass: an image
  sent together with Google Search grounding in one request (item 23, no collected test
  combines the two); the real end-to-end run through the API with the key (item 78), which is
  what every website measurement above waits on to become evidence about the API rather than
  about the website.

### Both kinds of fresh reader, 2026-09-14

A rules reader and a code reader each ran against this document after the drawing session
finished, with none of the drawing session's own conversation in either one, per rule 17. The
rules reader checked the document against `the-tree-rules.md` and produced ten findings plus one
non-finding. The code reader opened all 22 file:line citations found in the document, checked
every Jamin quote and every `gemini-web-tests.md` citation against their source, and found 0
wrong citations out of 22 (100%, no sampling needed). Every finding from both readers is closed
or answered below.

- **Finding 1 (seven dimensions, not eight): rejected.** `the-tree.md` (lines 25-45, its own
  precedent) records seven slots per node on purpose: the eighth named dimension, "what happens
  behind the glass," is the node's own children rather than a note, and writing it twice would
  put the tree inside the tree. The preface now carries that same one-sentence rule, worded
  after `the-tree.md`'s own paragraph. All 36 existing "What happens behind the glass:" notes
  were then read against their own node's children, one by one; none was found to duplicate a
  child (each states an implementation or mechanism detail the children do not carry), so none
  was removed. The reader's own count ("~26") was an estimate; the actual count, grepped, was 36.
- **Finding 2 (silent slots): closed.** All 9 nodes the count script flagged as missing one or
  more of the 7 dimension slots (Sharing a grounded answer with anyone but the person who asked;
  Corrections feed the next answer; the wiring: none of the above changes anything; Setup notes
  for the key; the decisions file entry; the defect log entries; Catch-up notes; What to do with
  the leftover uncommitted code; Asking Google for written permission) were reviewed and given a
  note or an explicit "does not apply" on every missing slot. `dimensionSilent` is now 0 of 602,
  and the preface says so.
- **Finding 3 (item 5 filed twice): closed.** Item 5 is now one leaf: **BLOCKED OUTSIDE**, ask
  Google in writing whether the 18-or-older clause reaches API end users or only the developer,
  filed once in section 9. The second-level node in section 2 that used to duplicate this
  question now points at that single leaf `[waits on: ...]` instead of restating it, and keeps
  only the genuinely separate, still-undecided follow-on as its own **HIS** leaf: whether Shin
  needs an age gate, which depends on an answer Google has not given yet.
- **Finding 4 (no record of a fresh-reader pass): closed by this entry.**
- **Finding 5 (bundled ends): closed.** Split: the store-offer fields (general vs tech-gated);
  the photo-identification fields (general fields, spec-variant detection, tech-gated fields,
  image format/size limit) from the undecided resolution-level policy (its own **HIS** leaf, not
  buildable); the framing-coaching bundle into a wiring leaf plus 5 individual coaching-line
  leaves; the verdict-function test bundle into unit-scaling tests and variant/condition tests;
  section 6's wiring node's three hand-offs (into identification, into verdict defaults, into
  alternatives) into three separate buildable leaves, each with its own "Shown by". A further
  pass over the rest of the document found no other third-level line bundling several distinct
  pieces of work under one state.
- **Finding 6 (self-judging "Shown by"): closed.** Items 75 and 77 now cite an outside check: a
  session that did not write the checks breaking them on purpose and watching the suite or
  typecheck go red for that reason, plus the Mac stage deploy turning green on the push that
  carries the fix. Item 57's "verified present" was already replaced, before this pass, with a
  real caller (`reset()` at `app/public/js/screens/camera.js:3236`, called at `:3509`). The
  provider-interface "Exists" leaf (section 7) now cites `app/server.ts:949` (`makeProvider()`),
  `app/server.ts:1162` (`modelOnce()`), and `identify/src/model.ts:819`/`:821`
  (`AnthropicProvider`), all opened this pass.
- **Finding 7 (buildable ends with no measurement): closed.** Every avenue note in the document
  now uses "·" rather than "-", so the count script no longer counts an avenue as a candidate
  leaf; this also removed the spurious third fifth-level node (the nested avenue sub-options
  under "who does the math on grounded prices" and "the typical price the shelf price is judged
  against" were the cause). `endsWithNothingToShow` went from 94 (the reader's script run) to 53
  (after the avenue fix, at the start of this pass's own count) to 0, fixed by adding a "Shown
  by", a "Nothing shows this", a `[waits on: ...]` pointer, or reformatting a HIS/BLOCKED
  OUTSIDE/STANDING RULE leaf into the bolded form the count script recognizes, on every line the
  script named.
- **Finding 8 (avenue notes missing needs/limit/tested): closed.** All avenue notes named by the
  reader (Shin's own catalogue; ungrounded-digits, type-the-barcode, retailer-API; UPCitemdb;
  Open Food Facts; the Claude ungrounded fallback; the three thinking-level options) now state
  what each needs, what limits it, and its tested status. The bundled thinking-level avenue was
  split into three separate avenue notes, one per option.
- **Finding 9 (literal questions in Proposed): closed.** All 12 "His question: ...?" sentences
  in the Proposed section were rewritten as declarative statements of what is undecided and why
  it was not admitted as a tree node. Zero question marks remain in the document body (grep
  confirms only two non-question `?key=` URL fragments, unchanged).
- **Finding 10 (inline file paths and item numbers): closed** at every location the reader
  named, and at further locations found while making the other fixes above; identifiers now sit
  in trailing brackets rather than mid-sentence.
- **Code reader note 1: closed.** `price/src/verdict.ts:251` corrected to `:250` (`judge`'s
  actual line, confirmed by the code reader opening it).
- **Code reader note 2: closed.** The eBay source's Proposed-item-9 description now reads
  "written, wired into the source registry with mock tests, never run against eBay itself"
  (`spine/src/sources/registry.ts:74`, `spine/test/ebay.test.ts`, both opened this pass),
  replacing the narrower "written, never run" the brief's own phrasing carried forward.

### Known script limitation: the zero-walls flag

The count script looks for the document's own prose to contain a phrase shaped like "ways
around the N walls" and finds none, so it prints "WRONG walls named in the closing note:
document says nothing, file has 0". This is not a rule violation: the preface plainly states,
in its own words, that no wall exists in this branch, and rule 10 requires a wall to be named
and kept only when one exists. `walls: 0` is correct; the script's phrase-matcher simply has no
required phrase to find when the true count is zero. Confirmed by the rules reader's own
"Not a finding" entry and unchanged by this pass.

### Final reconciliation, this pass

`node scripts/count-the-tree.mjs docs/the-gemini-tree.md` was run as the last step. Every
preface number now matches the script's own count: shape 86, 123, 56, 0; 183 ends, 7 at the
second level, 120 at the third, 56 at the fourth, 0 at the fifth; 602 dimension slots, 0 left
silent; 0 dangling pointers; 0 ends with nothing to show. The only remaining script line is the
zero-walls flag above, a known limitation, not a defect. All items 1-83 confirmed present
(checked by parsing every `[item N]`/`[items N, M]` citation bracket in the file). Zero em
dashes, en dashes, or " -- " sequences anywhere in the file.
