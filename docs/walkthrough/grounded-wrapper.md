# The grounded-result legal wrapper

Several other sections of this walkthrough mention, in passing, that a search-backed answer
from Gemini is "wrapped" so it cannot be saved or mixed into anything else. This section owns
the complete version of that mechanism: what kind of value the answer actually becomes, where
its contents physically sit while the program is running, every way that value is allowed to
turn back into ordinary data, and the process that removes the durable copy later. Every claim
below was checked directly this session (2026-09-15), by opening the actual files and, wherever
running something rather than only reading it would prove more, by running the checks that
already exist to prove it.

## Why an answer needs a lock on it at all

1. Gemini answers in two categorically different ways, and the difference is a contract, not a
   preference. Asked a plain question with Google's live web search switched off, its answer is
   ordinary output: Shin may store it, compare it, put it in the shared product catalogue, and
   nothing below applies to it. Asked with that search switched on for one specific request, the
   answer is instead what Google's own terms call a Grounded Result.

2. The terms themselves were opened and checked live during this session, against Google's
   published page (ai.google.dev/gemini-api/terms, effective 2026-03-23), and the identical
   clause was found again in the Google Cloud Service Specific Terms, modified 2026-07-29, so
   moving the same call onto Google's cloud platform instead of calling it directly changes
   nothing that follows. Quoted verbatim, because a paraphrase of a licence is a paraphrase of a
   lawsuit:
   - *"You will not, and will not allow your end user or any third party to, cache, frame,
     syndicate, resell, analyze, train on, or otherwise learn from Grounded Results or Search
     Suggestions."*
   - *"will only display the Grounded Results with the associated Search Suggestion(s) to the
     end user who submitted the prompt."*
   - *"will not modify, or intersperse any other content with, the Grounded Results or Search
     Suggestions; and...will not place any interstitial content between any Link or Search
     Suggestions and the associated destination page."*
   - *"will not track whether those interactions were specifically with a given Search
     Suggestion or Grounded Result...including any specific Link."*
3. Two carve-outs are what make doing anything at all with the answer legal, rather than
   impossible:
   - *"You may copy and store, for up to two (2) years, the text of the Grounded Result(s)...
     in chat history of an end user of your application only for the purpose of allowing that
     end user to view their chat history."*
   - the text may also be sent back to Google, temporarily, *"to obtain a refined or improved
     Grounded Result to display to the end user"*, on the condition that any version fetched
     this way and never shown to anyone is deleted.
4. Every place in this codebase that writes something durable, a product row, a stored price, a
   logged answer, takes plain text. A comment telling whoever writes the next line "do not put
   a Grounded Result here" is a promise with nothing behind it. This project's own standing
   engineering notes already cite a real number for what that kind of promise is worth
   elsewhere in the founder's own work: a comment-only rule was broken 892 times, at a rising
   rate, in a different one of his codebases, while a mechanical block on an equivalent rule let
   zero violations through. That figure is cited here as the reason to build something
   mechanical rather than trust a comment; it is not a count of Grounded Result leaks inside
   Shin, and no such count exists anywhere in this repository, because the mechanical version is
   what got built from the start.

## What the locked value actually is

5. A Grounded Result is not stored as plain text or a plain object anywhere in the program
   while it is live. It is turned into a special kind of value, referred to below as the box,
   that behaves the same way in every place it might travel through: nothing can read its
   contents by touching it directly, and nothing can build a convincing fake of one. This is
   enforced in three separate, independent ways, and each one covers a failure the other two
   cannot.

6. **The type itself is locked.** The box's type is written so that no ordinary object, however
   similar its shape, is treated by the type-checker as interchangeable with it, and the box's
   type cannot be treated as interchangeable with anything else either. This was verified this
   session by actually compiling the package: a dedicated compile-time check exists whose entire
   content is five separate attempts to smuggle a box into four real fields in the real server
   code, plus one attempt to build a convincing fake box out of an ordinary object without going
   through the one door that can build a real one. The four fields are: a scan's own
   price-verdict label (the column that holds a word like "good", "fair" or "high"), the scan's
   own logged raw model-answer column (the same column a model's JSON reply is written into
   whether or not any of it came from a search-backed call), a price observation's seller-name
   field (which retailer published the price, for example "Loblaws"; this is a different field on
   the same row from the price number itself, and the price number is not one of the five lines),
   and the identification pipeline's brand field. All five are written as lines that must fail to compile, and
   the compiler was run this session and produced no errors at all, meaning every one of those
   five forbidden lines still fails exactly as required; if a future change ever made one of them
   compile, this same check would turn red on its own, because the check is that the line is
   still rejected, not that some separate assertion passed.
7. **The contents live off the object, not on it.** The value itself, if you print it or hand it
   to a generic inspector, carries nothing you could read: no properties at all. What it
   actually contains, the answer, the raw search-suggestions markup Google returned, which
   single device it belongs to, and when it arrived, is kept in a private lookup table that only
   one file in the whole program can read from, indexed by the box itself. This was confirmed
   live this session: a sealed box was built and checked for its own visible properties, and it
   had none. The point of storing the payload this way rather than as a field on the object is
   that a generic error logger, or a stray `JSON.stringify` of some larger structure that happens
   to contain a box somewhere inside it, finds nothing to print, because there is nothing on the
   object for it to find.
8. **It fails loudly instead of quietly.** Asking the box to turn itself into text, into a
   displayable string, into a bare primitive value, or into a JSON representation, all throw an
   error naming the sanctioned ways the answer is allowed to leave, rather than silently
   returning an empty object or a blank string. This was run live this session: converting a
   sealed box with a plain `String(...)` call, dropping it into a template string, coercing it
   with a bare `+ ''`, and calling `JSON.stringify` on a larger object that contained one, all
   threw the expected error, every time. The reasoning behind this choice is explicit in the
   code: a quiet failure would let a debugging session or a log line concatenate a Grounded
   Result into the middle of an ordinary sentence without anyone noticing, which is exactly the
   "will not modify, or intersperse any other content with" clause being broken by accident. A
   loud failure turns that same accident into a crash somebody has to look at and fix.
9. **The answer itself cannot be edited once sealed, at the level of the runtime rather than
   only the type system.** The instant an answer is accepted, its entire contents are frozen,
   recursively, all the way down through every list and nested object inside it. This was also
   run live this session: sorting a list of offers inside a sealed answer, pushing a new item
   onto that list, and assigning a new price onto one existing item, each threw an error rather
   than silently succeeding. A type system can refuse to compile a line that tries to reassign a
   field; it cannot stop that same line from running if it is written in a way the type-checker
   does not catch. Freezing the actual data closes that gap: "will not modify" stops being
   something the code merely promises and becomes something it is no longer possible to do
   without the program crashing at that exact line.

## The one way in

10. Building a box at all requires everything the terms attach to an answer: the answer's own
    content, the Search Suggestions markup Google returned with it, byte for byte, which single
    device asked the question, an internal label for which kind of question this was, the exact
    moment it arrived, which company produced it, and how many individual web searches it took
    to produce it. That last piece is kept specifically so somebody can later measure how much
    searching a feature is doing without ever being able to read what was searched for.
11. This one entry point refuses outright if there is no real, named device to own the answer,
    whether the field is simply blank or carries the placeholder Shin uses internally for a scan
    nobody is attributed to. The reasoning is that every one of the terms above turns on there
    being one specific end user who submitted the prompt, and a box nobody owns could never
    honestly satisfy that condition later, so it is refused at the door instead. This was
    confirmed live this session: building a box for the placeholder device, and for a blank
    device, both threw the expected refusal.
12. One refusal that used to sit at this same door was removed on 2026-09-15, the same day this
    was written. The terms require Google's Search Suggestions to be displayed together with the
    answer, and until that day, an answer that arrived with no such markup was refused entirely
    rather than sealed. The founder's ruling that day, in his own words: *"don't prevent something
    from functioning just because of legal issues"*. An answer that genuinely has no Search
    Suggestions attached is now accepted and sealed with an empty string in that slot, and still
    reaches the one device that asked; this was confirmed live this session by sealing an answer
    with an empty Search Suggestions field and reading it back out successfully. Nothing about
    the ownership refusal in the paragraph above was touched by this change.

## Every sanctioned way the answer is allowed to leave the box

There are exactly four. Three turn the sealed answer back into ordinary, readable data for a
specific purpose; the fourth reads facts about the answer without ever touching what it said.

13. **To the one device that asked, and only that device.** This is the only door that produces
    something meant to be sent over the network to a person. It checks the device asking for the
    answer against the device the box was actually sealed for, using an exact match on that
    identifier rather than anything approximate, and refuses with a named error if they differ,
    or if the device asking is blank or the internal placeholder. Verified live this session: a
    box sealed for one device was refused when a second device asked for it, and accepted when
    the original device asked. What this door hands back is a small, ordinary, freely
    serializable object holding which device it is for, when it arrived, the raw Search
    Suggestions markup, and the answer itself. The answer inside it is not a copy: it is the
    exact same frozen value the box was sealed around, so every one of the runtime locks from
    the section above (no sorting, no pushing, no field reassignment) travels with it into the
    response. Turning this small object into JSON to actually send it over the network is not a
    breach of anything: this is the one door built specifically to permit exactly that, once, to
    exactly the person the terms say may see it. A grounded answer that fails this check for any
    reason never turns into a server error for the person waiting on their phone; the failure is
    logged, and the rest of the response, everything not dependent on Google's answer, still goes
    out exactly as if the search had not been attempted at all. This was written deliberately: a
    licence check that turns a working answer into a failed one is not a rule interpreted
    strictly, it is the app's own working answers being sacrificed for nothing.

    What happens once this small object reaches the phone is the frontend's job to describe in
    full, but one fact was checked this session because it belongs to this door's own contract:
    the one place in the client code that touches the raw Search Suggestions markup inserts it
    into the page whole, with no method called on it first, no trimming, no escaping, no
    rebuilding from parts. The comment beside that single line states the reasoning plainly:
    escaping it would show the reader markup instead of Google's suggestions, and trimming or
    rebuilding it would itself be the forbidden "modify". Whether the specific screen this
    answer is drawn onto, sorted price dots on a line, colored zones, merged markers, itself
    counts as the same kind of "modify" is a separate, open question, named further down.

14. **Back to Google, unchanged, to ask for a better answer.** The terms' one carve-out for
    resubmission is used exactly as written: the sealed answer can be turned back into the plain
    text or JSON it originally was, byte for byte if it was already text, or with its values
    reshaped only into the one structure a written prompt can carry if it was not, no field
    renamed, dropped, reordered, translated, or re-voiced along the way. Verified live this
    session: text sealed into a box, including accented characters and a multiplication sign,
    came back through this door identical at the byte level. The real example of this door
    being used in this codebase is the third step of the pricing pipeline, where the raw prices
    found by an earlier search are sent back to Gemini together with the shelf price the shopper
    typed and their own personal thresholds, so that a refined verdict can be computed on
    Google's own side rather than Shin's. That specific call, and the separate, already-flagged
    fact that it exists in the code but is not what actually produces the verdict shown on the
    phone today, belongs to the pricing and verdict portion of this walkthrough and is not
    repeated here; it is named only as this door's working example. Anything pulled out through
    this door and not ultimately shown to anyone has to be discarded rather than kept, which is
    the subject of its own paragraph below, because what the code that enforces this promises
    and what the code that runs actually does disagree.

15. **Onto disk, as text, and nowhere else.** This is the only door that may write anything a
    Grounded Result contains to a permanent record, and what it writes is always the plain text
    of the answer, never its structure. It is called from exactly one place in the whole program,
    the routine that keeps a scan's own history, and it checks ownership twice before a single
    byte is written: once by reading who the stored scan actually belongs to and comparing that
    against who is asking to store an answer against it, and a second time inside the door
    itself, against the same device the box was sealed for. Two independent checks were written
    on purpose, so that removing one of them in a future edit does not by itself open a hole; the
    write's own final database statement repeats the ownership condition a third time in the
    statement that actually changes the row, so there is no gap in time between deciding the
    write is allowed and the write happening. Verified live this session by actually running the
    checks built for this: an attempt to store an answer against a scan owned by a different
    device wrote nothing, and the original owner writing to their own scan succeeded normally
    immediately afterward.

16. **A fourth, narrower door reads facts about an answer without ever reading the answer.**
    When it arrived, which single device owns it, an internal label for which question it
    answered, which company produced it, and how many individual web searches were run to get
    it. It deliberately excludes both the answer and the raw Search Suggestions markup, so
    something that wants to log that a search happened, or decide an answer's age, never has a
    path to what was actually said. This door exists, is fully guarded the same way as the other
    three (asking it about an answer that has already been discarded throws, verified live this
    session), and was not found being called anywhere in the running server or the code that
    talks to Gemini. Its only caller anywhere in the repository is its own proof-of-behaviour
    test. It is a built, correct, unused capability today, not a planned one and not a broken
    one; there is simply nothing yet that reads what it offers.

17. **Discarding an answer that will never be shown.** One more operation exists whose whole job
    is to remove an answer from the private lookup table the moment something decides not to
    show it to anyone, on the reasoning that an unseen interim answer is not chat history of an
    end user and the terms say it must be deleted rather than kept. **This is a real disagreement
    between what this piece of the code says it does and what the running program actually
    calls, found this session by searching the entire codebase for every place this operation is
    invoked.** The documented side: the code's own explanation states plainly that dropping a
    reference to an unused answer would eventually let it be cleaned up anyway, but that this
    specific operation exists so the deletion happens at the exact line that decided not to
    display the answer, rather than at some later moment nobody chose, and that any later attempt
    to read a discarded answer should be a loud, visible bug. The actual side: outside of the
    module's own proof-of-behaviour test, nothing anywhere in the server or the code that talks
    to Gemini ever calls this operation. The only enforcement that genuinely runs today for an
    answer nobody was shown is the separate, later, disk-level process described in the next
    section, which clears the durable text after a fixed waiting period has passed. The in-memory
    copy this operation is supposed to remove immediately is, in the running program, left to be
    cleaned up whenever nothing else references it any more, which in ordinary use is very soon
    after the request finishes, but is not the deliberate, chosen moment the code's own comments
    describe, and nothing would currently notice if that assumption ever stopped being true.

## Where the durable copy actually lives, and the process that removes it

18. Only one column, in one existing record per scan, is ever allowed to hold the plain text of
    a Grounded Result once it reaches disk, and it is written only by the one door described
    above. Two more columns sit beside it and are not the answer itself: the moment the answer
    arrived, and whether it was ever actually sent to any person. Keeping these as three separate
    facts rather than one blob was a deliberate choice, confirmed by reading the migration that
    created them, specifically so that the two facts about the answer can be read and acted on by
    the cleanup process without that process ever having to parse or look at the text itself.
19. The moment recorded is when the answer was fetched from Google, never when the underlying
    scan happened. A price rechecked a year after the original scan starts its own fresh two-year
    clock, because the clock the terms set runs from when the answer was received, not from
    whatever else happened on that record before or after.
20. Whether the answer was shown is written as false on every single write, with exactly one
    exception: one specific routine, called from exactly one place in the entire server, the same
    routine that assembles a response actually carrying a Grounded Result for sending, is the only
    thing anywhere in the program that ever flips it to true. This was confirmed live this session
    both by reading every call site and by running the retention tests: a freshly stored answer
    always reads as not yet shown, and the flag only ever becomes true through that one path. The
    consequence is that "shown" is not a record of anyone's intention to show an answer; it is a
    record that a response containing it actually left the server.
21. Two years is the retention ceiling, and it is a fixed number in the code rather than a
    setting anyone can configure. This was checked directly this session by reading the source
    and also by running a test built specifically to fail if that ever changed: no part of the
    file responsible for this retention reads any external configuration value at all. The
    reasoning given in the code is explicit: an environment variable here would be a switch that
    could turn a licence condition off, and a blank one on a badly set up machine would turn it
    off silently, with nothing on any screen to say so.
22. A separate, much shorter window exists for an answer that is never shown to anyone at all: one
    hour. An answer can be fetched and then superseded, for example by a second search for the
    same scan, before anyone ever sees the first one, and that first one is not chat history of an
    end user, because no end user was ever shown it. Rather than rely on a single delete call
    placed on whatever code path superseded it, which is exactly the kind of call a future edit
    can forget, a crash can skip, or a timeout can jump past entirely, this is enforced two
    different ways at once, both driven by comparing timestamps rather than by any one line
    deciding to act: a daily sweep clears the text of every stored answer still marked as unshown
    more than an hour after it arrived, and, separately, any new search for the same scan clears
    that scan's own previous unshown answer immediately on its way in, with no minimum age at all,
    because a superseded answer is superseded the moment the replacement exists, not an hour
    later. Both behaviours were run live this session and produced exactly the described result:
    an answer left unshown for just over an hour was cleared by the sweep; a second answer
    written for the same scan immediately erased the first one's text while leaving the second
    one's text in place; and an answer that had actually been shown survived the same sweep
    running two hours later untouched.
23. The daily process that clears text past the two-year ceiling also runs the one-hour check in
    the same pass, and it is wired into the same timer that already runs Shin's unrelated
    photo-cleanup process, rather than a separate timer of its own. This was confirmed live this
    session by reading the exact closure in the server's startup code that this timer runs, and
    by running a test that reads that same closure text off disk and fails if either cleanup call
    is ever missing from it, precisely so that a future refactor which quietly drops one of the
    two calls is caught by that test rather than discovered later as text sitting silently past
    two years with nothing on any screen to say so. Clearing an answer past its window removes
    only that one column's text; everything else about the scan, what was searched, when, and
    whether it was answered, stays, because that much is Shin's own record rather than the part
    the terms only lend for a limited time.
24. The general-purpose way the rest of the program reads a stored scan back deliberately cannot
    see the Grounded Result's text at all, only the two facts about it (when it arrived, whether
    it was shown). This mirrors, at the level of a database record, the same idea the sealed box
    enforces at the level of a running value: a piece of code written to look up or correct a scan
    should not be able to accidentally carry this text along for the ride and leak it somewhere
    later, simply because it asked for everything a scan record has.

## What this mechanism does not, and cannot, guarantee

25. **Open decision, not resolved by anything read this session.** The terms forbid modifying a
    Grounded Result or mixing other content into it. Everything this section describes enforces
    that at the level of the raw values: the exact same frozen answer, untouched, crosses to the
    one person who asked, and Google's own Search Suggestions markup is inserted onto the page
    without alteration. None of it says anything about the layer above that: turning the same
    answer's fields into a chart of colored zones, dots and merged markers, described elsewhere
    in this walkthrough, rather than presenting the fields the way Google returned them. This
    project's own decision record already names this as unresolved and unasked of Google: whether
    rendering an answer's structured fields inside Shin's own designed layout counts as the
    forbidden "modify". It is recorded there as the one open legal question that, if answered
    against the current design, could force that entire screen to be rebuilt. This section flags
    it again because it sits directly on top of the mechanism described here, rather than settling
    it in either direction.
26. **Open decision, not resolved by anything read this session.** The terms also forbid placing
    anything between a link inside an answer and the page it points to, and forbid tracking
    whether a person interacted with any specific link or suggestion. The box and its four doors
    have no concept of a click, a tap, or a page navigation; those obligations belong entirely to
    whatever draws the answer on screen and handles what happens when a person touches it, which
    is outside anything this mechanism enforces or can check. Whether the actual screen honours
    those two clauses is a fact for whichever part of this walkthrough covers what is drawn on
    screen and what happens when it is tapped, not this one.
27. **A second direct contradiction, found this session by tracing the exact code path, and the
    same underlying issue already named once elsewhere in this walkthrough for the pricing and
    verdict step, stated fully again here because it happens inside the very value this section
    is about.** The file that contains Shin's own copy of the median-and-percentage arithmetic
    carries an explicit, shouted warning inside its own comments: that copy of the arithmetic must
    never be run on a real Grounded Result, because doing so would itself be the analysis the
    terms forbid, and that it exists only so the algorithm can be checked against invented test
    numbers before anything trusts it inside a request sent to Gemini. Tracing the code that
    builds the sealed price answer for a scan, this session found that exact arithmetic called
    directly on the real offers taken out of a live search answer, whenever a shelf price has
    already been typed, producing a median, two zone boundaries, tick marks and a computed
    position that are then sealed as part of the very answer this section's lock protects, with
    no round trip back to Gemini involved at all. The disagreement in plain words: the file's own
    stated rule is that this specific arithmetic must never touch real search results because
    doing so is the forbidden analysis; the code that actually runs performs exactly that
    arithmetic on exactly that data, as a normal part of producing the answer a shopper is shown.
    The lock this section describes protects an answer from the moment it is sealed onward; it has
    no way to see, and nothing in it checks, what Shin's own code does to that same data in the
    moments just before sealing it.
