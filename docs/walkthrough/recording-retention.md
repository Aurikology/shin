# Recording and retention

Checked directly against his own rule, in his own words, found in the file that carries the
highest priority in this repo as of today: *"we will record EVERYTHING that happens when the
user interacts with the app which was asked for multiple times but never done. Every request,
every Gemini request and response, every screen, tap and answer the phone shows, saved."* Every
claim below was checked by opening the actual file that writes the thing, the actual file that
reads it back, and, where the two disagreed with each other or with the rule, the actual code
that wires them together, all during the session that wrote this page. Nothing here is carried
forward from a plan document without also confirming it in the code that runs.

## The general log: app opens, screens, taps, errors

1. From the moment the app loads, one small module starts capturing on its own, with no screen
   author having to remember to wire anything in: that the app was opened (with the phone's
   screen size, its language, its rough network speed, whether it was launched as an installed
   app rather than a browser tab), every time the screen on display changes (which screen it was,
   which screen came before it, how long the previous one was open for), every tap anywhere in
   the app (which screen it happened on, a label for what was tapped, the tag and style class of
   the element, and roughly where on the screen the finger landed, as a fraction of the screen's
   width and height rather than a pixel count), whether the app is currently visible or in the
   background, and any uncaught error or promise rejection the phone's browser reports about
   itself.
2. On top of that automatic layer, individual screens name their own specific happenings the
   generic listener could not know on its own: a candidate list being shown, a correction being
   typed, a thumbs-up or thumbs-down and its undo, a consent toggle being changed, which lookup
   source actually answered a scan, and why a scan was refused.
3. All of it is queued on the phone first and written into the phone's own local storage before
   anything is sent, specifically so that a reload, or the aisle with no signal this product is
   built to expect, does not lose an event that already happened. It is sent to the server every
   five seconds, and immediately whenever the app is hidden, in batches, capped at a fixed number
   of events and a fixed number of bytes per request so a single request from one phone cannot
   grow without bound.
4. One thing is refused by name inside this layer: a photograph's own bytes never travel through
   it. A photo goes through its own separate path, described below, so that deleting a photo
   later actually deletes it rather than leaving a second copy sitting inside an event nothing
   ever sweeps.
5. Two more limits exist, both sized generously against what a real event actually needs rather
   than against what the rule asks for: an event's payload is capped at four kilobytes of written-
   out JSON (the largest real event measured, a typed correction, is under a tenth of that), and
   the name of the event type itself is cut to sixty-four characters. A payload that will not fit
   is not stored, and the app is told only that it was not stored, never why in detail.
6. Since 2026-09-14, on his own word, this layer no longer refuses two kinds of content it used
   to refuse: a person's exact tapped position on the screen, and free text a person typed and
   then deleted before sending anything, are both captured now rather than withheld, because both
   are now named uses of what this product collects (training its own models, answering other
   shoppers), not incidental detail.

## What is recorded about one scan

7. Every single scan, whether it worked, was refused, or was later corrected, becomes one row:
   which device, which of the three ways it was asked (a barcode, typed text, or a photograph),
   what was actually asked, what it was matched to, which source answered it, whether the answer
   counted as an identification, and, when it did not, which of a fixed set of reasons explains
   why not (so a beta spent inside an outage still reads as an outage afterwards, not as a beta
   full of unreadable photographs).
8. Alongside that, a wide set of the conditions the answer was produced under, all optional and
   all null rather than a fake default when nobody measured them: the app's own version string,
   which kind of device it was, how long the server itself took to answer (not the phone's own
   stopwatch, because that also includes a network the server cannot see), the coarse map square
   the phone was in and a chosen or nearby store, and, only when the device has separately agreed
   to share location, the exact GPS reading that coarse square was rounded down from. Right now
   that last group is written as empty on every row regardless of what a phone sends, by a
   deliberate ruling: the two founders gave opposite instructions on the same day, one for
   collecting the exact spot and one against it, and the version that shipped is coarse-only,
   with the exact columns kept in the design and never filled.
9. For a scan answered by a photograph specifically, the model's own answer is kept, but only a
   curated shape of it, not its literal, whole response: which reading was made of the picture,
   which product it was matched to and by what method, its confidence and how that confidence
   was banded, every other candidate the model considered and how it ranked them, and a size
   question when the picture left the size ambiguous. Deliberately absent from that record is the
   photograph itself in any form, which is a different write covered next, and deliberately absent
   is the literal request sent to that model and the literal, unedited text the model returned:
   what is kept is a summary the server itself builds out of the answer's parts, not the answer.
10. A second write, minutes or a day later depending on when the person acts, fills in what could
    not be known when the row was first created: where the photograph ended up on disk (when kept
    at all), the price the person actually typed off the shelf, which store that price was
    attributed to, and the verdict as it was actually shown to that person: good, fair or
    expensive, how confident that call was, and how many distinct sellers it was based on. That
    last group is a coarse summary, three short fields, not the actual list of stores, prices and
    dots that the person's own screen was drawn from; the fuller picture behind any one verdict is
    not preserved anywhere once the response has been sent, only the three-field tier and
    confidence it was reduced to.

## Ratings

11. A thumbs-up or thumbs-down is stored one per scan; a second tap on the same scan overwrites
    the first rather than adding a new row. A thumbs-down may carry one reason from a closed list
    of four (wrong product, wrong price, no price shown, too slow), chosen because they are the
    four things a person standing in an aisle can actually tell apart and each one points at a
    different part of the system to go fix; a reason arriving on a thumbs-up is quietly dropped
    rather than refused, on the reasoning that it is a client mistake rather than something worth
    losing the one honest signal over. An undo removes the row outright rather than marking it
    withdrawn, so that a mis-tap costs nothing and leaves nothing behind either.

## The Gemini answer itself: what is kept, and a direct gap against the rule

12. Google's own terms for an answer produced with live web search switched on are strict and are
    quoted directly inside the code that enforces them: such an answer may never be cached,
    analysed, learned from, or shown to anyone other than the exact person who asked for it, with
    one narrow exception carved out for exactly this product's situation, that the finished text
    of the answer may be copied and stored for up to two years "in chat history of an end user of
    your application only for the purpose of allowing that end user to view their chat history."
    The code that stores this text is built to make that the only thing that can ever be written:
    the object holding a live-search answer cannot be turned into a string, cannot be logged,
    and cannot be saved by any route in the app except through the one function whose entire job
    is checking that the device asking is the same device the answer belongs to before it writes
    anything.
13. What actually lands on a scan's own row through that one function is the finished answer text
    alone. Not kept anywhere, by the same rule that keeps this lawful: the literal request that
    was sent to Gemini to produce it, and the literal search terms Gemini typed into Google to
    answer it. Those search terms are shown live to the person on the screen at the moment the
    answer arrives, as a "here is what we searched" note, and then are gone; nothing on the server
    writes them down.
14. A saved answer is marked as not yet shown to anybody the moment it is written, and it is only
    ever marked shown by the single piece of code that actually places it into a response leaving
    the server, so "shown" is a fact about a response that really went out, never an intention.
    Anything still marked unshown an hour after it was fetched is deleted outright, and the whole
    two-year-old backlog is swept daily, on the reasoning that an answer nobody was ever shown is
    not "chat history of an end user" and the term does not cover keeping it.
15. **Direct contradiction, verified by reading the actual client code this session.** The rule
    says every Gemini request and response is saved. Checked directly, one of the two kinds of
    Gemini call this app makes never gets saved at all in real use today: the call that searches
    for a product's prices and reviews once a person types the shelf price. Storing that answer
    requires the server to already know which scan it belongs to; the function that builds the
    request the phone actually sends for that price call does not include the scan's own id
    anywhere in it, only the product's name, its barcode, its category, and the typed price. With
    no id on the request, the server-side check that decides whether to keep the answer never
    finds one to attach it to, so the save is skipped every time, silently, and the phone is none
    the wiser because the answer still displays correctly regardless. The other kind of Gemini
    call this app makes, the one that identifies a barcode Shin's own table does not recognise,
    does not have this problem, because the scan id it needs already exists on the server's own
    side of that same request before Gemini is ever asked anything.

## Model cost: what is estimated, and what is never computed at all

16. A cost in cents is written onto a scan row for a photograph-based identification, and it is
    labelled everywhere as an estimate rather than a bill: a flat, published, per-call list price
    for whichever tier of model answered, multiplied by how many times that model was actually
    called for this one scan (once, or twice on the harder fallback path), never derived from
    anything the call itself reported using.
17. In the same file that writes that estimate, there is a second, separate piece of code built
    to do something more accurate: take the actual token counts and actual search-query counts a
    model call reports about itself and turn those into a real dollar figure, priced against the
    provider's published per-token rates, with its own explicit warning that those rates are
    documented to double on a fixed date and that a reasoning model's thinking tokens bill at the
    same rate as its answer and are easy to undercount by treating them as free.
18. **A second gap, verified by searching the whole repository for who calls that code.** Nobody
    does, anywhere in the app that actually runs, only inside that code's own tests. So the real,
    reported cost of a Gemini call, the very thing this second piece of code exists to compute,
    is never actually calculated for any scan, and the flat estimate that is written down is
    written only for the older, non-Gemini vision path, never for either kind of Gemini call this
    app makes. Right now there is no figure anywhere on a scan row, estimated or real, for what a
    Gemini identification or a Gemini price search cost, and no count anywhere of how many Gemini
    calls, or how many of Gemini's own searches inside those calls, a given scan or a given day
    actually used.

## The raw camera frame: everything a shutter press sees, unconditionally

19. Separately from all of the above, added on his own direct word, quoted in the code itself:
    *"every time i press the shutter, the server receives exactly what the camera sees and what
    it returns."* At the moment of a shutter press, and, since a more recent change, at the
    moment a barcode is read as well, the phone sends the server the entire live camera frame at
    that instant, and the server saves it as an ordinary image file in a folder named after that
    one press. From that same moment until the next press or barcode read, every other request
    the phone makes to the server is separately captured in full: the exact bytes the phone sent
    (with any image inside that request saved as its own file rather than as text, and any base64
    turned back into real image bytes first) and the exact bytes the server answered, filed as one
    small file per request inside that same press's folder.
20. **This is not gated by consent, and the code says so of itself, in contrast with the
    photograph described in the next section, which is.** The founder asked for every press, not
    every consenting press, and the only switch that turns this off at all is an operator's own
    environment setting, never anything a person using the app controls from a privacy screen.
21. **Rule-versus-rule tension, both sides read directly.** The consent screen's own stored
    promise is that a photograph is "off unless you turn it on" and that the app never keeps the
    person's exact photograph without that toggle being on. The shutter frame described above is
    a real photograph of whatever the camera was pointed at, saved unconditionally on every
    press, by a mechanism whose own comment states plainly that it is not subject to that same
    consent flag. A person who has never turned photo consent on, and who believes on the strength
    of the consent screen that no photograph of theirs is being kept, still has one written to
    disk on every single shutter press and every barcode read. This is not raised anywhere in the
    code as a defect to fix; it is simply true of both mechanisms as they stand today, and the two
    promises disagree.
22. A narrower and separate gap in the same mechanism: it only starts capturing once a phone has
    pressed the shutter or read a barcode for the first time in its own session. Anything the
    phone does before that first press, an app being opened, the first few screens looked at
    before ever aiming the camera, is only captured through the general event log described
    earlier, never through this full request-and-response mechanism, since nothing has set the
    identifying marker this mechanism looks for yet.

## The photograph used for identification, separately

23. A different, smaller image exists alongside the frame above: the actual cropped picture that
    is sent to the identification model and that a consenting person's history keeps. Unlike the
    shutter frame, this one is written to disk only when the device has separately agreed to let
    its photographs be kept, and the check for that agreement lives in exactly one place, read by
    the one route that decides whether to call the function that writes it, rather than being
    buried inside the storage code itself. As of 2026-09-14, on his direct word, a kept photograph
    is kept forever by default rather than for a fixed number of days as an earlier plan called
    for; a fixed number of days is still fully supported as an operator setting, just not the
    default any more, and a bad or negative value for that setting is treated the same as never
    setting it at all, specifically so a typo can never delete a whole beta's worth of
    photographs at once.

## Every request, at the transport level

24. A third and separate log, added 2026-09-14 after a real incident (a phone made roughly a
    hundred and twenty requests through the beta's tunnel and left no other trace at all, so there
    was no way afterwards to tell a phone that was refused entry from one running a stale build
    from one that simply never pressed anything), writes one line for every single request the
    server answers regardless of what kind of request it was: which method, which path (with the
    invite code itself scrubbed out before it is written, though never stripped from anywhere the
    request line itself might carry it), the status code sent back, how long it took, the
    requesting phone's address and country, its declared browser identity, whether it carried the
    beta invite at all (never the invite code's own value), whether it carried the shutter marker,
    and where it was referred from.
25. This log never carries a request's or a response's actual body content; that is what the
    shutter log above exists for, and only for the requests that carry its own marker. It also
    only exists from 2026-09-14 onward: nothing before that date was captured this way, at all,
    by any mechanism, because the mechanism itself did not exist yet.

## Readers, not writers: latency and the daily figures

26. Two further files exist purely to read numbers already written elsewhere, and write nothing
    of their own. One turns the per-scan timing already sitting on every scan row into a daily
    figure an operator can actually look at: the ninety-fifth percentile rather than an average,
    because the point of the figure is what a shopper standing in an aisle actually experienced,
    and an average of a fast barcode lookup and a slow photo lookup describes no real scan at all;
    split by which of the three kinds of scan it was, because blending them moves the number
    whenever the mix of scan types moves, which looks exactly like a regression when nothing
    regressed; and a day with no scans in it is reported as having no figure at all rather than as
    a zero, because a zero would read as a fast, quiet day rather than as a day nobody measured.
    The other turns the identity log into the specific figures a person can be shown about their
    own week: how many scans, how many of them the catalogue could actually name, corrections per
    hundred named scans, and whether devices old enough to have had a second week actually came
    back in it, with the same rule applied throughout: a rate over zero scans is written as
    unknown, never as zero.

## What is not recorded at all, gathered in one place

27. Collected together, checked directly rather than assumed, against the rule that everything is
    to be recorded: the literal text of a request sent to Gemini is not saved anywhere, for either
    kind of Gemini call this app makes. The literal search terms Gemini actually typed into Google
    to answer a request are shown to the person live and then are gone, saved nowhere. The
    price-and-reviews answer Gemini gives once a shelf price is typed is not saved onto any row in
    real use today, for the structural reason named above. The dollar cost of any Gemini call,
    identification or price search, is never computed by anything that runs, only by test code
    that nothing in the app calls. How many Gemini calls, or how many of Gemini's own searches
    inside those calls, happened on a given day is not counted anywhere the running code writes
    to. And the full detail behind a shown verdict, the actual list of stores, prices and dots a
    person's own screen was built from, is reduced to a three-field summary the moment it is
    written down and is not otherwise kept.

## Open decisions, named rather than asked

- Whether the shutter log's unconditional capture of the full camera frame is meant to override
  the photo-consent promise on the privacy screen, or whether the privacy screen's promise is
  meant to also govern the shutter log and simply has not been wired to it yet, is not settled by
  anything read this session. Both mechanisms exist, fully built, and disagree with each other as
  they stand.
- Whether the price-and-reviews Gemini answer failing to save is meant to be fixed by having the
  phone send back the scan id it already holds on that same request, or by some other route,
  is not settled by anything read; the gap itself is structural and reproducible from the actual
  request the phone builds, not a rare failure.
- Whether the real, token-based Gemini cost function that nothing calls is meant to replace the
  flat estimate once real bills exist, or was built for a purpose that has since moved elsewhere,
  is not settled by anything read; it is complete, tested on its own, and unconnected to anything
  that runs.
- No written rule read this session sets a limit on how long the general event log, the scan log,
  the ratings, the access log, or the shutter log's per-request files are kept; unlike photographs
  and Gemini's own answers, none of these five is ever swept by anything found in the code. Given
  the founder's own direction to collect everything, this may be entirely intended rather than an
  oversight, but nothing read this session states that as a decision either way, and nothing
  bounds how large the shutter log's per-press folders or the access log file can grow.
