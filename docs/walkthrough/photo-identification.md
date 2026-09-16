# Photo-based identification

This is the second route into identifying a product, used only when the barcode route did not
apply: no barcode was in frame, or the camera could not read one. It is a separate door on the
server from the barcode one, reached only by a photograph. Every claim below was checked directly
against the actual running code and the actual planning documents during the session that wrote
it (2026-09-15); none of it is carried forward from memory or from a plan alone.

## Getting the photograph to the server

1. The photo route only answers a request carrying a whole picture, so it is capped much harder
   than a barcode digit-string ever needs to be: the entire request body, picture included, is
   refused outright past 3 megabytes. Anything that decodes to an empty picture, or whose first
   bytes are not one of the two picture formats the app accepts, is refused before anything is
   sent to a model, because that is the cheap way to find out a picture is unusable.
2. This route also carries a rate limit no other route on the server has: thirty photographs per
   device in any rolling ten minutes. The stated reason in the code is that this is the only route
   whose every call costs a paid vision request, where a barcode lookup and a text search both
   cost a local database read. This counter lives only in the server's memory and resets on a
   restart; it is described in its own comment as a spending guard, not a security boundary.
3. Alongside the picture itself the phone sends which device is asking, a quality tier (default
   "basic" unless the phone asks for "pro"), a sharpness number the phone itself computed for the
   crop, and the same kind of location and app-version bookkeeping the barcode route carries.
4. A refusal from this route is still answered with a normal, successful response, the same rule
   already established for the barcode-and-price routes: an unreadable photograph, a timed-out
   model, and a product the catalogue does not carry are all correct answers about what was
   photographed, and only a malformed request itself (too large, not JSON, not a real device
   image) is treated as an actual error.

## Which model providers are actually called

5. This route can be pointed at one of three different vision vendors: Anthropic (Claude), Google
   (Gemini), or xAI (Grok). Which one actually answers a given photograph is decided entirely by a
   setting in the server's environment naming the vendor. Left unset, the running code falls back
   to Anthropic; naming Gemini only takes effect if a Gemini credential is also present, and naming
   nothing recognised at all also falls back to Anthropic. On this machine, the repository's own
   environment file names none of the three vendors and holds none of the three vendors' keys, so
   nothing here could be exercised as a live call from this session; this is stated as unverifiable
   from here rather than assumed either way, and verifying it for real would need a machine holding
   one of those three credentials, such as the separate Mac server this app also runs from.
6. **The Gemini path exists in the code but has never been exercised.** Its own header comment says
   so directly: the first live call from a real phone failed with an error naming a field the
   adapter had never actually sent, which means every other field in it was, at that point, an
   unchecked assumption about how Google's interface works, re-derived by reading Google's own
   published reference the same day rather than by any real exchange. The header lists eleven
   separate assumptions this way, covering the endpoint address, the authentication header, the
   image encoding, the resolution setting, the schema dialect, the output-length setting, how a
   refusal is reported, and how token counts are reported. Nothing in this repository has since
   recorded a second real call that would confirm or correct any of them.
7. **The xAI path exists for the same reason and has literally never been run at all**, on a
   sandbox or against a saved real reply. Its own header says there is no key for it and no network
   access from the machine that wrote it, and that its accompanying tests prove only that the file
   sends the request it believes is correct and reads the response shape it expects, "nothing
   whatsoever about whether xAI agrees." It also carries no published price figures anywhere in
   the app's own cost tables, so any Grok-answered photograph would report an unknown cost rather
   than a number.
8. A set of two hundred product photographs was run through the identification logic as an
   accuracy check, and it reported a very high top-1 figure. That run used a stand-in that simply
   echoes back the correct answer for each photograph from an answer key, never a real model call,
   and its own summary calls the result "a ceiling, not a score" for exactly that reason: it proves
   the surrounding catalogue search and merging logic can find the right row when the reading of
   the photograph is perfect, and it says nothing about whether any of the three vendors above can
   actually produce that reading from a real picture.
9. One specific claim of success is on record even so: a session working from the physical Mac
   server on 2026-09-14 recorded that photo identification worked end to end on a real device, one
   named example taking about 9.5 seconds. That entry sits, in the same day's running log, before
   the entry recording the decision to switch to Gemini at all, so by the log's own order it most
   likely ran the original Claude-only path rather than Gemini. Confirming which vendor actually
   answered that one call would require reading the Mac server's own environment configuration at
   that moment, which this session has no way to reach.
10. A separate guard is meant to stop a real shopper's photograph ever reaching a Gemini key that
    is on Google's free tier, because Google trains on whatever a free key sends it. As written,
    this guard only checks whether a setting in the environment explicitly declares the key "free";
    it never checks the key itself against Google. A machine that simply never sets that one
    setting, while still holding a key that is in fact on the free tier, would pass this guard
    unnoticed. This is a real gap in what the guard actually does, found by reading it directly, not
    an assumption about how it might fail.

## Turning the photograph into a reading: the first vision call

11. Whichever vendor answers, the same one request is built for it every time, and it is built from
    two things: a system-level instruction, and a short, literal question in the user's turn. With
    the app's caching option left off, which is its default, the system instruction sent is this,
    quoted in full:

    > You read photographs of retail products and Canadian shelf tags.
    >
    > Transcribe first, reason second. Fill front_text before anything else: every line of text
    > legible on the front of the pack, verbatim, in reading order, exactly as printed and without
    > translating or tidying it. Up to twelve lines. Then, and only then, fill the interpreted
    > fields, and fill them from the lines you just wrote down rather than from what the packaging
    > looks like.
    >
    > barcode_digits is for digits you can actually read printed under a barcode. Read them left to
    > right and report them as one run of digits. If any digit is not legible, or there is no
    > barcode in frame, barcode_digits is null. Never infer, complete, or recall a barcode number: a
    > guessed one is worse than none, because it will be believed.
    >
    > Report only what is legible in the image. If the brand is not readable, brand is null; do not
    > infer it from the packaging style. If you cannot separate two readings, put both in alternates
    > and say why in uncertainty.
    >
    > Size is part of what the product IS: a 500 ml and a 1 L of the same thing are different
    > products. Read the declared net quantity as printed and report its own unit: g, kg, ml, l, or
    > "ea" for a countable item. Do not convert between them. If the pack is a multipack, count is
    > how many units are inside and size_value is the size of one unit; count is null for a single
    > item.
    >
    > Canadian packaging is bilingual. Read whichever language is clearer and report the product
    > name in English when both are present. Say in language_seen which you actually read: en, fr,
    > or both.
    >
    > self_confidence is one of high, medium or low, and it is about the identification as a whole,
    > not about any single field.
    >
    > Shelf tags in Canada often carry several prices at once: an everyday price, a time-boxed sale
    > price, and a loyalty-card price. These are three different numbers and must never be merged.
    > Report each only if it is actually printed.

    The literal text of the user's turn is just: *"Identify this product."* The photograph itself
    is attached as the image part of that same message, sent before this line of text.

    An alternate, currently switched-off arrangement of this same call also exists in the code,
    turned on only by a separate caching setting nothing in this route enables today. Under it, the
    system instruction shrinks to only the rules shared by every pass (what is being looked at, the
    rule against inventing anything, and the two bilingual and net-quantity rules above), and the
    rest of the paragraph above moves into the user's turn, after the image, worded almost
    identically. The reason given in the code is that a shared, byte-identical system prompt lets a
    vendor's cache remember the picture across a second call to the same product, provided the
    picture is large enough and the model is the same on both calls; the comment is explicit that no
    saving from this has ever actually been observed, because no real call through it exists yet
    either.
12. This first call always asks for a fixed shape of answer rather than free writing, and the shape
    is a single object with these fields, every one of them required to be present (though many are
    allowed to be the value null when nothing legible answers them): the verbatim front-of-pack
    lines (up to twelve); the barcode's digits, if legible; a brand; a product name; a variant word
    (a flavour, edition or formulation, whatever separates two otherwise identical boxes); a size
    number; a size unit restricted to grams, kilograms, millilitres, litres, or "each" for a
    countable item; a multipack count; a category; which language was actually read (English,
    French, or both); a self-reported confidence of high, medium or low; up to four alternate
    readings, each with its own name and reason; and a plain-language note on why it is uncertain,
    when it is. No field outside this fixed list is accepted.
13. The photograph is attached as ordinary image data, at whatever size the camera stage already
    cropped it to (already established, elsewhere in this app, at 1568 pixels on the long edge). No
    live web search and no code-running tool are ever switched on for this call, on any of the
    three vendors: the Gemini adapter's own header states this as the entire reason the file exists
    separately from the one that performs a live, search-backed lookup elsewhere in the app, because
    the moment a live search tool is added to a request, the reply becomes something Google's terms
    forbid analysing, storing freely, or reusing, and this call's whole purpose is to produce an
    ordinary answer the app is free to store and act on.
14. The reply's answer is bounded to a fairly small maximum length (roughly a thousand tokens by
    default, overridable from the environment), reasoned in the code as: the fixed shape above
    already bounds how long a real answer can be, so a larger ceiling only buys the chance of a
    slower reply inside an already tight time budget.
15. A clock of three and a half seconds is placed on this one call by default. If nothing answers in
    time, the call is treated as timed out. A second attempt is made only for a timeout-prone class
    of failure (a rate limit, a server-side outage, or a network failure carrying no status code at
    all) and only if the failed attempt came back inside a second and a half; a slow failure is not
    retried at all, on the reasoning that a slow failure has already spent the whole time budget and
    a second identical wait would be answering a screen nobody is still looking at. A wrong-request
    error or a reply that failed to parse is never retried, since sending the identical request
    again would not fix either.
16. Both a call-count ceiling and a separate dollar ceiling stand in front of every one of these
    calls, and both are checked before the request goes out, never after. The count ceiling is two
    thousand calls in a rolling day, aimed at catching a runaway loop rather than a busy day. The
    dollar ceiling defaults to ten Canadian dollars a day and is meant to be a number a person can
    actually reason about on a bill; every single call charged against it, whichever of the three
    vendors answers and whichever of the two quality tiers was asked for, is charged the identical
    fixed estimate (about seven-tenths of one US cent), which is the published price of one
    higher-tier Anthropic call at this crop size. The code states plainly that this overcharges a
    cheaper call and calls that the safe direction for a spending cap; it does not attempt to charge
    a lower-tier call, or a Gemini or xAI call, at that vendor's own real rate, even though at least
    the Gemini adapter's own published rates are far below this fixed figure. A second function
    exists elsewhere in the app that could price a call from its own reported token counts using
    that vendor's real published rate, but nothing on this route ever calls it; the number written
    onto the scan record for every photograph, regardless of vendor, is this one fixed guess. This
    is a real, checked fact about what runs today, not an assumption about what the code is capable
    of.
17. When a lower-tier reading comes back reporting itself as merely "low" confidence, the code can
    optionally repeat this identical first call once more, unchanged except for asking for the
    higher-tier model instead. This repeat is switched off by default, with one exception: it is
    switched on by default specifically when Gemini is the vendor answering, on the stated reasoning
    that Gemini's cheap model is the whole plan and something has to catch the readings it got
    wrong. If this repeat call itself fails for any reason, the original lower-tier reading is kept
    exactly as it stood; a failed second look is never allowed to turn into a failed answer.
18. This route only ever sends the product photograph. A second crop of a nearby price tag can also
    be read by this same first call, sharing the trip and letting the tag confirm a size or a
    number the box carries too. That second image, however, is decided by whoever calls this
    stage, and this specific route always calls it with no tag image at all, so on this route today
    the price-tag half of the first call is never actually exercised.

## Reading a barcode straight off the photograph

19. Before anything else is done with the reading, the digits the model reported reading under a
    barcode in the photo (if any) are checked against that barcode format's own built-in
    self-check digit, the same arithmetic check a real barcode scanner relies on. A single misread
    digit fails this check roughly nine times out of ten, which is what makes trusting a
    photograph's reading of a barcode safe at all. If the digits pass, the app treats this exactly
    as if a real barcode scan had happened: it looks the code straight up in the product table, and
    if the table has it, it is treated as a fact rather than an opinion, given the same maximum
    confidence a real barcode scan gets, and none of the text-based steps below ever run. If the
    check fails, or the code passed the check but the table simply does not carry it, the ordinary
    text-based path below picks up instead; a pack that was otherwise glare, angled or fully in
    French can still have a perfectly legible barcode, so this check runs before anything gives up
    on the photograph as a whole.
20. If nothing at all was legible, no brand, no name and no variant word, the photograph is refused
    at this point as unreadable, with a plain repair suggested to the person holding the phone
    (try again, closer). This is the one member of the whole failure vocabulary that is honestly
    about the photograph rather than about the app or about the network; every other kind of
    failure below carries a class recorded separately from the sentence a person actually reads, on
    the stated reasoning that a rate limit and a badly lit photograph must never be allowed to look
    like the same kind of failure in the record, even while the person's own sentence stays
    identical either way (a rule that has one deliberate exception: a refusal caused by hitting the
    dollar spending cap gets its own different sentence, because retrying a photograph can never fix
    a spent-out budget, and telling someone to try again anyway would send them into a guaranteed
    loop).

## Finding it in the catalogue: three questions instead of one

21. If a legible reading exists and did not resolve by barcode, three separate questions are put to
    the product catalogue at once, run in parallel rather than one after another so the extra
    questions cost time only once: a precise question carrying the brand, the name and the variant
    word together with the exact size pinned; a looser question carrying the brand and the name but
    with the size deliberately left unpinned, aimed at bringing back every size of the same product
    as a group rather than losing the sibling sizes; and a third question carrying only the name
    together with everything legible on the front of the pack, aimed at surviving a brand that was
    read wrong altogether, which a pinned, wrong brand would otherwise actively rule out rather than
    merely fail to help.
22. Whatever the multipack count and per-unit size the model reported, they are combined into one
    single pinned size before being sent to the catalogue (a count of six units at 100 grams each
    becomes a pin of 600 grams), because the catalogue's own rows store a multipack's whole-pack net
    size rather than the size of one unit inside it; without this combination a multipack's own
    reading would silently be pinned against, and lose to, its own single-unit sibling row.
23. The three answers are merged into one ranked list, matched up by the catalogue's own product
    code. A product appearing in more than one of the three answers keeps the single best version of
    each individual signal it was given across all three (its highest similarity score, and a
    "yes" on brand or size agreement wins over a "no", which in turn wins over "was never asked"),
    rather than simply keeping whichever of the three answers happened to be merged in last. After
    merging, the list is sorted again, and this second sort is not decided by similarity alone: a
    row that agrees with the photograph on both brand and size is always moved ahead of one that
    does not, even if the one that does not carries a marginally higher raw similarity score,
    specifically because a disagreement on size is exactly as likely to mean "this is the sibling
    at a different pack size" as it is to mean "this is the wrong product." The merged list is
    capped at the top ten rows.
24. If this merged list comes back completely empty, the photograph is answered as legibly read but
    genuinely not carried in the catalogue, using whatever brand, name and variant the model
    reported as the label for that answer, rather than as an unreadable photograph. This is treated
    as a materially different, better-informed outcome than a photograph nobody could make sense of
    at all.

## Deciding whether a second look at the packaging is worth paying for

25. A confidence figure is derived for the leading catalogue row before any second vision call is
    even considered, out of six separate signals, weighted unevenly on purpose: whether a barcode
    already resolved this with certainty (in which case none of the other five signals matter at
    all and the figure is simply maximum confidence); the leading row's own retrieval similarity
    score; how far ahead the leading row is over the second-best row (the one signal built
    specifically to catch a confidently-wrong pick between two very similar products, which no
    single row's own score can see by itself); whether the model's reported brand agrees with the
    row's brand; whether the model's reported size agrees with the row's size; the model's own
    self-reported confidence, translated from its three words into a small number and given, by
    explicit design, the smallest weight of the six, on the stated reasoning that a model's opinion
    of its own answer is "a vibe" rather than a measurement; and whether the photograph was sharp
    enough by a fixed threshold. Any signal that genuinely could not be asked (there was no second
    row to compare against, or no brand was read at all) is left out of both the weighted sum and
    its own denominator, rather than being scored as a zero, so a signal that was simply never
    available cannot itself drag the figure down. The result is reported to whoever asks not as a
    raw percentage but as one of three bands, high, medium or low, on the stated reasoning that a
    percentage on a screen invites arithmetic nobody watching it should actually be doing.
26. One further guard can force a second look even when this figure alone would already read as
    settled. If the model reported a variant word (a flavour or formulation) at all, and the leading
    catalogue row does not carry that same word or word-family anywhere in either of its names or
    its shelf category, while some lower-ranked row in the same list does carry it, the leading
    row is not trusted as settled no matter how confident the six-signal figure otherwise reads,
    because this is judged to be exactly the same failure the lead-signal exists to catch: two very
    similar products, confidently answered as the wrong one of the two. This guard was added after a
    real, named example: a cherry-flavoured, zero-sugar cola came back from this pipeline identified
    as the same brand's plain zero-sugar cola, because "zero" and the brand's own name were both
    repeated in the plain row's own listing while the cherry row's English name used none of those
    words at all, and the flavour word itself was the only signal that actually separated the two
    cans. The word-family table this guard consults today, however, is built entirely out of
    soft-drink flavour and diet-style words (zero-sugar, decaffeinated, and a dozen named fruit
    flavours, in both English and French); nothing in it names a storage size, a screen size, a
    model number or any other specification that would separate two electronics or appliance
    variants of one product line. This guard therefore only ever forces a second look over a
    flavour disagreement, never over a technical-specification disagreement.
27. A second, entirely separate size-based guard exists for the case where two rows are the exact
    same product at two different declared sizes and the model could not read a size off the pack
    at all; when that happens, the app is built to ask the person which of the found sizes is
    correct instead of guessing, on the stated reasoning that a large size judged against a smaller
    size's own prices reads as a bad deal every single time, confidently and wrongly. This guard,
    however, only ever activates on rows carrying an actual net-quantity size in grams, kilograms,
    millilitres, litres, or a countable-item size (exactly the same size fields the first vision
    call reads for a grocery item); an electronics or appliance row is very unlikely to carry a
    non-null value in this particular field at all, so this second guard, as built, offers a tech
    product with several genuinely different variants (a different storage size, for instance) no
    working path to being asked about rather than guessed at.

## The second vision call: choosing between named rows

28. If neither the barcode shortcut nor the two guards above already settled it, and the merged
    catalogue list holds fewer than two rows, the app simply keeps whatever the first call already
    produced rather than spending a second call to choose between fewer than two options. Otherwise,
    a second vision call is made, sending the identical photograph again (never a second
    photograph) alongside a numbered list built from the ten merged catalogue rows, each entry
    reduced to only what a person could actually check against the packaging: its brand, its
    English name, its French name and a short generic description when either of those differs
    meaningfully from the English name, its declared size, and its shelf category.
29. This second call's system instruction, quoted in full, is:

    > You are shown a photograph of a retail product and a numbered list of candidate rows from a
    > product catalogue. Choose the row that IS the product in the photograph.
    >
    > Choose a row only if the text printed on the packaging matches that row. Matching packaging
    > style, category, or general appearance is not a match. If no row matches the printed text,
    > chosen_index is null. Answering null is a correct and expected answer; a wrong row is worse
    > than no row.
    >
    > A row carries brand, name, size and category, and some rows also carry nameFr, the row's
    > French name, and genericName, a short description. Read all of them as one row: a flavour or
    > edition word is often printed in only one of the names.
    >
    > When more than one row could be the product, prefer the row whose size matches the net
    > quantity printed on the pack.
    >
    > If two or more rows are the same product in different sizes and the size printed on the pack
    > is not legible, do not choose between them: put their indexes in size_question and leave
    > chosen_index null. The person holding the phone will be asked which one it is.
    >
    > why is one short sentence naming the printed text that decided it.

    The literal user turn carries the numbered rows themselves as data, followed by the single
    literal question: *"Which row is the product in the photograph?"*
30. This call's required answer shape is: which row was chosen, as a numbered index, or null if
    none was; the model's own confidence in that choice, again as high, medium or low; one short
    sentence naming why; and, separately, a list of row indexes when two or more of the rows are
    judged to be the same product at different sizes with no way to tell from the picture which
    size is on the shelf.
31. This second call runs on the same higher tier's model on both quality tiers of the app (never
    the cheaper model), on the stated reasoning that this is the single call the identification
    pipeline's real accuracy actually comes from, so it is worth paying for properly even on the
    cheaper overall tier, and it runs only on the minority of photographs the first call did not
    already settle. It carries its own three-second clock, separate from the first call's clock,
    reasoned in the code as a smaller question deserving a smaller wait rather than inheriting the
    larger call's allowance for no real reason.
32. Reading what comes back: if two or more indexes were named as the same product at different
    sizes, that question is put to the person directly (up to three options), and none of the six
    signal weights described above are allowed to move the confidence figure upward, only capped
    downward, on the stated reasoning that "the pack, the brand and the size all line up" is a
    conclusion an opinion, however well informed, is never allowed to manufacture on its own. If a
    single row was chosen with no size question, that row becomes the answer, again with the
    confidence figure only ever capped down, never raised, by how confident this second call itself
    was. If this second call answered null, meaning it looked at the packaging and found nothing in
    the list that actually matched it, that is treated as a real, informative answer rather than a
    failure: the first call's own leading row is kept, but the confidence figure is forced down to
    the lowest band, which is what turns the eventual answer, on the screen, into an "is this the
    one you mean" question shown with candidates rather than a single confident naming. If this
    second call fails outright for any technical reason (a timeout, an outage, a malformed reply),
    the app is built to fall back to exactly the first call's own answer and confidence, unchanged,
    on the explicit reasoning that the app must always answer something, and a failed improvement is
    a lost improvement, never a lost answer.

## How a product with genuinely different technical specifications is handled

33. As identification is built today, it is not handled at all, and this is a checked absence
    rather than an assumption. The fixed shape the first vision call must answer in has no field at
    all for a model number, a storage size, a screen size, or any other named specification; a
    photograph of an electronics or appliance product is read through the exact same brand, name,
    variant and net-quantity fields as a photograph of a grocery item. The word-family guard
    described above that can force a second look over a disagreement is built entirely from
    soft-drink flavour and diet words and carries nothing that would ever separate two spec
    variants of one product line. The size-question guard that can stop the app from silently
    guessing between two sizes is keyed to the same net-quantity fields a grocery item declares in
    grams, millilitres or a countable-item count, a shape an electronics or appliance row is very
    unlikely to carry a value in at all. A separate piece of this app's pricing math is built
    specifically to compare offers of one already-identified electronics or appliance product across
    a model number and a fixed set of price-relevant specifications, listing other spec variants
    and other conditions of the same model apart from the priced line rather than mixing them in;
    but that machinery runs only after a single catalogue row has already been settled on as the
    identity, as part of building the price line for that one already-chosen row, and it has no part
    in choosing which row a photograph actually is in the first place. The only route by which a
    printed specification could ever help decide identity today is an accident of the third,
    loosest catalogue question, which folds in everything legible on the front of the pack as free
    text; if a storage size or model number happens to be printed there and the catalogue's own
    matching happens to weigh it, it could nudge the ranking, but nothing in the code asks for this
    or checks that it works.
34. This is a question the founder asked out loud the night this whole Gemini approach was decided
    ("what should we do for tech that has different specs") and it was never answered on paper
    anywhere in this repository's planning documents either; the execution plan for this very
    walkthrough names it explicitly as unanswered. **This is an open decision point, not resolved by
    anything read this session**, and it is left here as a named item rather than answered by
    guessing at an intended design: whether identification for a technical product needs its own
    added field (a model number, or a short specification string) in the first vision call's answer
    shape, its own word-family table the way flavours have one, or some other mechanism entirely, is
    a real, currently unbuilt design decision.

## Rule versus running code: how many vision calls one photograph actually costs

35. The founder's own rule, set the night this whole approach was adopted and recorded as the
    single highest-priority instruction in this repository as of this session, states plainly: "The
    product search will function like this: one gemini call will return the object, the price, the
    reviews, etc," one prompt answering the product's identity, the store prices, the reviews and
    the price math together, "never two separate calls." A later note the same day, about checking
    an answer at all, adds: "there can be measures in place but definitely not calling the ai a
    second time."
36. **The running code, as read directly this session, does not match this.** A single photograph
    can cost, in identification alone, the first call described above; a second, full repeat of
    that identical first call when the cheap tier reports itself unsure (switched on by default the
    moment Gemini is the chosen vendor); and the separate second call over the numbered catalogue
    rows. That is as many as three separate vision calls spent on identification alone before any
    price or review is even asked for, none of which return a price, a review, or any pricing math
    at all; those are fetched by a wholly separate request this same route kicks off in parallel
    once an identity (checked or merely read but unmatched) exists, which is itself at least one
    more call again. Nothing in the identification path described in this section merges the
    product's identity, its price, its reviews and the price math into one single request the way
    the rule quoted above describes; the two halves (identity, and price-with-math) are not only
    two different calls, the identity half alone can already be as many as three.
37. **This is flagged, not resolved.** Nothing in this repository's current design documents lays
    out how a single request could ask for an identity, a set of retailer prices, a set of reviews,
    and a finished piece of comparison math all at once for a photograph specifically, the way the
    barcode route's own single-call design has at least been sketched on paper (even though, as
    covered in the barcode walkthrough, that sketch is not what the barcode route's own running
    code does either). As of this session, redesigning the photo route down to one call is a named
    goal with no written design behind it anywhere this session could find.
38. One further disagreement, smaller but real: the function that builds the live route's model
    handle is accompanied by its own comment stating that it "owns the choice between Anthropic,
    Gemini with a Claude fallback, and xAI." The function it is describing, read directly this
    session, no longer builds any such fallback pairing at all; it builds exactly one vendor, and a
    header comment inside that same function elsewhere in the code states outright, quoting the
    founder, that "claude should not be taking over" and that with Gemini named and keyed, "Gemini
    alone answers." The machinery for pairing two vendors together, so that a struggling primary
    vendor hands off to a second one, still exists elsewhere in the code and is fully written, but
    nothing in the live route actually calls it today. The comment describing "a Claude fallback"
    is therefore describing a mechanism the function beside it no longer builds; both readings are
    stated here rather than either one being assumed to be the current truth without checking, which
    is exactly what this session did by opening the function itself rather than trusting the comment
    describing it.

## Failures, and always producing an answer

39. Every distinct way this whole path can fail is carried, separately from the one sentence a
    person actually reads, as one of a small fixed set of named classes: the photograph itself was
    unreadable; the call timed out; the vendor rate-limited the request; the vendor had an outage;
    the reply came back malformed or failed to parse; the request itself was rejected as invalid
    (including, deliberately, a missing credential, so that a misconfigured server reads as a
    misconfiguration rather than as a run of bad photographs); or the daily dollar cap had already
    been spent. Only the first of these is honestly about the photograph; every other one is
    explicitly described in the code as being about the app or about the network, never about the
    person holding the phone, and the sentence shown to that person is deliberately kept the same
    across most of these classes for exactly that reason.
40. As of 2026-09-15, this route was changed so that a photograph the model actually managed to
    read something off, but which the catalogue could not confidently match, is no longer shown as
    a plain refusal. The founder's own words, quoted directly in the code: "Having a response that
    is not checked is infinitely better than having the user scan something, wait 10 seconds, only
    to get told the app doesn't know, because that will make the user just uninstall the app."
    Whatever the model read is now handed back as an answer explicitly labelled as not checked, and
    the app moves straight on to letting the shopper type the shelf price against it, rather than
    stopping on a dead end.

## What gets written down

41. Every call to this route writes one row recording, at minimum: what the device actually asked
    for, what the catalogue matched it to (if anything) and by what method, the failure class if
    there was one, how many vision calls the answer actually cost, the fixed cost estimate described
    above, how long the whole round trip took, and a single JSON record of everything the model
    itself reported (its reading, the confidence figure and its plain-language reason, up to five
    ranked candidates, any unresolved size question, and the quality tier and sharpness that were
    asked with). The actual photograph itself is written to storage separately from this row, and
    only when three separate conditions are all true: the row above was actually created, the
    device is a real, attributed one rather than the shared unattributed bucket, and that specific
    device has previously said yes to having its photographs kept.
42. Whether the full literal request and reply exchanged with whichever vendor answered, as opposed
    to this summary record, are saved anywhere at all is a question this section did not settle
    fully; the founder's own rule calls for saving "every Gemini request and response," and that
    question belongs with the dedicated recording-and-retention section of this walkthrough rather
    than being guessed at here.
