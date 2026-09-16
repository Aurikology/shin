# Barcode scan through price verdict

This is the calibration example for the full walkthrough. Every other section is done when it
reads at this level of detail and evidentiary rigor, not before. Every claim below was checked
directly against the actual files during the session that wrote it (2026-09-15); none of it came
from memory or from a planning document alone without also checking the running code.

## Watching for a barcode

1. The camera feed runs the whole time the scan screen is open.
2. A background process tries to read a barcode out of every single frame, automatically,
   continuously, with nothing pressed by the user. Confirmed directly in the code: this is still
   the case today. This conflicts with what he said on 2026-09-15, that there should be no
   automatic reading at all, only a "scan barcode" button the user taps to start it. That button
   does not exist yet; the automatic version is still what runs.
3. A single frame's read is never acted on by itself. The same digits have to be read the same
   way across several frames in a row before the app trusts it. Reason: one frame at a bad angle
   or with glare can misread a digit, and acting on a wrong digit means confidently naming the
   wrong product.
4. Once several frames agree, the app is told "this barcode was read" and stops watching until
   the next item.

## Asking Shin's own server first

5. The phone sends a request to Shin's own server, not Gemini yet, carrying: the barcode digits,
   which device is asking, roughly where they are (cell area, an optional store name or id, or
   exact GPS if the user allowed it), and some technical bookkeeping (app version, phone type).
   This is a request with no attached data payload, deliberately, specifically so a barcode read
   can fire it the instant a barcode is confirmed, and so a request shaped this way is cacheable
   later.
6. The server checks its own product list first, a table it owns with over five million rows, to
   see if this exact barcode is already known to it.
   **Open decision, not resolved by anything read:** he said the price should never come from
   Shin's own data. Right now, if this table has the barcode, the product's identity (name,
   brand, size) comes from this table, not from Gemini. It is not settled whether "the price"
   meant only the price number, or also this identity lookup.
7. If Shin's own table has the barcode:
   - The scan is logged: which device, what was scanned, what it matched to, how it was
     matched, whether it succeeded, how long it took.
   - At the same moment, before the user does anything else, the server quietly fires a separate
     request to Gemini asking for that product's prices and reviews, so the answer is ready or
     nearly ready by the time the user types the shelf price.
8. If Shin's own table does NOT have the barcode:
   - The scan is still logged, marked as not found in Shin's own data.
   - The server sends the bare digits to Gemini in a written request, asking it to search the
     live web for what product this barcode belongs to. At the same time, a second, separate
     request is sent to Gemini asking for that same product's Canadian retail prices and
     reviews. This is a genuinely different network call from the first, not a second question
     tacked onto it.
   **Direct contradiction, verified in the code:** he said one scan should cost exactly one
   Gemini call, never two. A barcode Shin does not already know currently costs two separate
   Gemini calls.

   **The exact request sent for the identification call.** It is built from four pieces of
   written instruction stitched into one message, plus a separate, strict answer-shape
   requirement:
   - A tone instruction, always included: *"Tone: flat, factual, direct. State the number and
     stop. Answer in English."* (Or the French equivalent, if the phone is set to French.)
   - A market restriction, always included: *"Canadian retailers only, prices in Canadian
     dollars (CAD) only. No third-party marketplace sellers, only the retailer itself. NEVER
     convert a price from another currency into CAD: give the price as it stands with its own
     currency code."*
   - The actual question, with the scanned digits dropped in, word for word: *"Use Google
     Search to identify the product with barcode [the digits]. Give its name, its brand and its
     size, and for EACH of those three facts the source link that establishes it (null if there
     is none)."*
   - A brevity instruction, always included (reused from the price call below, so some of it
     does not apply to this particular question): *"Keep it short: at most 8 offers, at most 3
     reviews, each summary at most 25 words, the description at most 30 words. Put null wherever
     there is no source."*
   - Separately, the request also tells Gemini the exact shape its answer must take: an object
     with name, brand and size (each a string or null), and a sources object holding a link or
     null for each of those three facts. Google's live web search is turned on for this request.

   **The exact request sent for the price and reviews call, fired at the same time.** Same tone
   and market sentences as above. Its actual question: *"Use Google Search to find, for: [brand]
   [name] [size] (barcode [digits]), (1) current prices at Canadian retailers, giving for each
   offer the retailer, the price, the currency, the url, the size, the pack count, the model
   number, specs, and condition, and also whether it's a marketplace seller, needs a membership,
   is a multi-buy or buy-one-get-one deal (and how many items that covers), is organic, is a
   store brand, and is sold by weight, giving the price exactly as advertised (so a '2 for $5' is
   recorded as price 5, covering 2 items); (2) customer reviews with rating, count, a short
   summary and the url; (3) a short product description."*

   **What comes back, and how it is read.** What arrives over the network is not just an answer.
   It is a short record of everything Gemini did: which search terms it typed into Google, a
   chunk of raw search-result data, and finally Gemini's own written answer, already sorted into
   the named fields the request demanded rather than a paragraph the app has to parse. The app
   keeps only the search terms (for a "here is what we searched" disclosure to the user shown
   alongside the answer) and the final answer; everything else in that record is dropped.

   **The legal wrapper, and why it exists.** Google's rules for this kind of search-backed
   answer are strict: the app is contractually barred from saving it, analyzing it, reusing it,
   or blending it with anything else, and may only show it back to the exact person who asked.
   So the moment that answer lands in the app's code, it is wrapped so that turning it into
   plain text, saving it to a database, or splicing it into another value does not just misbehave,
   it breaks the program outright. This is deliberate: rather than trust people to remember a
   rule, the code is built so breaking the rule crashes.

## Getting a price verdict once the shopper types the shelf price

9. Only once the user types the price on the shelf does a verdict get attempted at all (no typed
   price, no verdict). This goes to the server as its own request, carrying what was scanned,
   which earlier scan this belongs to, the typed price, and optionally the user's own personal
   thresholds for what counts as a good or bad deal to them.
10. The server now runs two separate pricing systems at once, independently:
    - Shin's own pricing system, plain arithmetic, no AI involved, using whatever price data
      Shin has already collected on its own. This is the one whose result actually gets
      permanently saved onto the scan record as "the verdict as shown."
    - Completely separately, a new request asks Gemini to search the web for this product's
      Canadian prices and reviews, wrapped the same unsaveable, uncombinable way as above.
    Stated directly in the code as deliberate, for two named reasons: Google's rules forbid
    mixing a search-backed answer into anything the app calculates or sorts, and separately,
    Shin wants its own good/fair/high judgment to depend only on evidence it can point back to
    later, never a number pulled from an outside search nobody can re-check. So the two answers
    are shown in two separate sections on screen, and the code makes them structurally unable to
    merge into one list.
    **Open decision:** this means Shin is still running its own separate pricing engine at the
    same time as Gemini's, not instead of it. Whether that still counts as "the price coming
    from us" under his rule, or whether Shin's own engine is meant to be retired once Gemini is
    live, is not settled anywhere read.
11. For the median and percent-from-median math he described, there are two different,
    disagreeing versions of how it is actually computed, and this is a live contradiction, not
    an outdated plan versus a current one:
    - **The documented rule** says Shin's server must never do this math itself, because
      computing a median from Gemini's search results counts as the forbidden "analyzing." The
      intended fix, on paper: send the raw prices back to Gemini a third time, along with the
      shelf price, the user's thresholds, and the literal, exact code of the math function, and
      ask Gemini to run that exact code itself using a feature that actually executes code, then
      return only the resulting numbers, never the source prices.
    - **What actually runs**, verified directly in the code that produces what reaches the
      screen: none of that. The server pulls the raw prices straight out of Gemini's answer and
      runs the identical median and percentage math itself, in its own plain code, no third
      Gemini call involved. The third-call, code-execution version does exist in the codebase,
      but only as a side check confirming Gemini would have run the correct math if asked; it
      does not produce what is shown.

    **The exact math, whichever side runs it.** It is one function that does the following, in
    order:
    1. Converts every price's size into one shared unit: grams for anything sold by mass,
       millilitres for anything by volume, or a flat "item count" for anything sold by piece. A
       pack of 6 becomes 6 times the single unit's size.
    2. Divides each offer's price by its converted size, so every offer becomes a price per
       100 g, per 100 mL, or per item, whichever applies. This is the number everything else
       compares.
    3. Throws an offer out of the comparison entirely, for one of eight named reasons checked in
       a fixed order: priced in a currency other than CAD, sold by a third-party marketplace
       seller rather than the retailer, requires a paid membership, is a different store brand
       than the scanned item, is organic when the scanned item is not (or the reverse), has no
       usable size given, is sold by weight with no weight given, or is measured a different way
       than the scanned item (for example volume versus mass). Each excluded offer keeps its
       reason attached in plain words, rather than just disappearing from the list.
    4. Takes whatever offers are left and finds the median of their per-unit prices (the middle
       value if there is an odd count, the average of the two middle values if even).
    5. For every remaining offer, and for the shelf price the user typed, calculates how far its
       price sits from that median, as a percent: `(price - median) / median * 100`.
    6. Picks a scale for the whole line: the largest of (the single biggest percent-distance
       found among all the prices), (1.5 times the user's own "good" threshold), or (1.5 times
       the user's own "bad" threshold), then rounds that up to the nearest multiple of 5. This
       decides how zoomed in or out the line is.
    7. Converts every percent into a position from 0 to 100 on the line, with the median always
       sitting at exactly 50.
    8. Places the two zone boundary lines (where green ends and amber starts, where amber ends
       and red starts) using the user's own two personal percentages, not a fixed number.
    9. Lays down tick marks every 5 percent (or every 10 percent if the scale is wide), each
       labeled like "+10%", "-10%", or "middle" at zero.
    10. Labels the shelf price itself as under the user's line, in the middle, or over their
        line, by comparing its own percent-distance against those same two boundaries.

    That whole function, translated into runnable code text, is what gets pasted into the third
    Gemini request when that path is used, with an instruction to run it exactly as written and
    hand back its output.
12. **A second concrete defect found, not assumed:** the piece of code that decides which Gemini
    model name to send defaults, whenever a particular setting is left unset, to the name of a
    Claude model, not a Gemini one. If that setting is ever left unset in a real environment,
    this request would ask Gemini's servers for a model by a Claude name, which almost certainly
    is not intended by anyone.

## What the user is actually shown

13. **Designed, from the planning documents, in full, but confirm against the frontend code in
    its own section rather than assuming this is what renders:** a horizontal line split into
    three colored zones, green (cheap side, good), amber (reasonable, middle), red (expensive
    side, bad), with the two boundary points between zones set by the user's own two personal
    percentages, never by Shin's opinion; word labels on every zone so meaning never depends on
    color alone; one large dot for the price the shopper is looking at, one small dot for every
    store price found; every dot, large or small, labeled with its actual quantity and price (for
    example, "4 L, $6.99") specifically so a cheap-looking dot for a tiny size cannot be misread
    as a deal; on a phone-width screen labels alternate above and below the line to avoid overlap,
    and dots landing on top of each other merge into one marker showing a count, which expands on
    tap; tapping a small dot goes straight to that store's page; below the line sits the full
    store list, a note wherever a fact had no traceable link, and Google's own suggested
    searches, kept visible rather than hidden.
14. **Not built yet for this path specifically:** even though that screen is fully designed, no
    working path today takes a barcode-originated scan all the way to it being drawn. The path
    that used to reach a shown verdict for a barcode scan was Shin's own catalogue answering the
    price directly, and that is the exact path being torn out under the new rule.
15. **Recording, confirmed directly:** the server writes one row per scan (device, query, what
    it matched, how, success or refusal, timing, rough location) at the identify step, and
    separately updates that row later with the shown verdict's tier and confidence once a price
    is computed. **Not yet confirmed:** whether the raw Gemini requests and responses themselves,
    as opposed to this summary, are actually being saved anywhere. This needs its own dedicated
    check in the recording-and-retention section rather than being assumed either way here.
