# Frontend: looking back, saving, rating and correcting

This section covers the three screens a shopper uses after the moment of a scan has passed: the
saved-items list (in the running code this list and its underlying record are still called a
"watchlist," even though the on-screen heading says "Saved"), the list of every past scan, and the
list of anything removed from either. It also covers the two actions the section's brief groups
with them, rating a verdict and correcting one, tracing where those two actions actually live in
the running app rather than assuming they live on these list screens. Every claim below was
checked directly against the running frontend code during the session that wrote it (2026-09-15).
Where something could not be confirmed from this machine, that is stated as such rather than left
implied.

## The one record all three screens read

1. All of it, the saved items, the scan history, the removed bin, the outbound correction queue,
   the consent flags, everything, lives in a single record kept in the browser's own on-device
   storage. There is no account and no server-side copy of this record; a phone that loses its
   local storage loses its whole history.
2. Every screen that shows a list subscribes to this record when it opens and unsubscribes when it
   closes, so a change made from any one of these screens (an unwatch, a delete, a restore, a
   correction being typed) redraws every other open screen automatically, without a network round
   trip, because it is the same in-memory object underneath. This does not reach a second open
   browser tab on the same phone: the record is re-read from storage once, when a tab's code first
   loads, and nothing in this app listens for the browser's own storage-changed event, so a second
   tab keeps showing what it had until it is itself reloaded. This has not been checked against a
   written product decision because no written rule was found either requiring or forbidding it;
   it is stated here as a fact about the running app, not as a judgment on it.
3. Reading the record can fail in two distinct ways that are not "the list is empty": the stored
   text can fail to parse (a corrupted write), or the storage itself can refuse to answer at all
   (a private browsing window, or a browser set to block site data). All three list screens ask the
   record which of these happened before they paint anything, and if either happened they show a
   dedicated failure state with a retry button rather than telling a shopper who has saved things
   that they have saved nothing. A "loading" state exists in all three screens' own code as well,
   with its own line of copy already written, but every read of this record today is an ordinary,
   synchronous read of local storage, so there is no gap in time for that state to ever be seen;
   it is written and confirmed unreachable rather than left to be discovered later.
4. Every one of these screens rebuilds its entire on-screen markup from scratch on every redraw,
   rather than patching the parts that changed. This throws away, and then has to consciously
   restore, exactly the two things a person doing this with a keyboard or a screen reader depends
   on: which control has focus, and how far down the list they had scrolled. A shared helper wraps
   every one of these screens' own redraw function: before redrawing, it records the scroll
   position and, if the currently focused control carries a stable identifying key (built from the
   underlying item's own id, never from its position in the list, so it survives another row above
   it being deleted), it remembers that key too. After redrawing, it puts the scroll position back
   and looks for a control carrying that same key; if the exact row is gone (because that row was
   what got deleted), it falls back to whichever control in the same family of controls now sits
   closest to where that one used to be, so deleting several rows in a row from the keyboard is
   several presses of the same key rather than several trips back through the whole page's tab
   order from the top.

## The Saved list

5. Saving something is meant, by the running code's own comment, to be "never more than one tap
   away from anywhere": the button that adds or removes a product from this list lives on the
   live verdict card the moment a scan is priced, not on this screen. This screen is only for
   coming back to what was already saved.
6. **A naming decision, stated directly in the code as a decision and not a guess.** The on-screen
   heading reads "Saved," not "Watching," and the code's own comment gives the reason: there is no
   mechanism in this build that goes back out and re-checks a saved item's price on its own, so a
   name that promises an ongoing watch would be a promise the app cannot keep. What is real is only
   what got saved: the price, the seller, the day, frozen at the moment of the tap. A separate
   design note (its own header, dated) gives the underlying reason as a measured incident, not a
   guess: an earlier pilot's direct attempts to fetch prices from four retailers came back with
   zero usable prices, three of the four refused outright, which is why the re-querying capability
   a "Watching" name would imply does not exist yet. A single on/off switch in the code gates
   every piece of copy and every visual state that implies an ongoing watch, including a whole
   "price dropped" card built to sit at the top of this screen; that switch is off today, so that
   card, though fully written and ready, never renders.
7. A saved item's own row shows a comparison against "the usual price," computed once at the
   moment of saving (the shelf price the shopper typed against the median the engine found that
   day) and never recomputed afterward. This is consistent with the naming decision above: without
   a re-query capability, that comparison cannot become stale in a way the app would notice, so it
   is presented as a one-time fact about the day it was saved, worded as "under the usual" or "over
   the usual," never as a live claim.
8. Opening this screen when it has nothing saved shows one drawn face and one line of text and
   nothing else, deliberately: an earlier version of this screen stated the same fact three
   separate times on one small screen (a small all-caps label, the heading, and a full sentence),
   and that repetition was removed as its own fix.
9. Each row is built by interpolating stored, user-controlled text (the label typed on the
   correction screen, the seller's name) into markup. Every one of those interpolations goes
   through a shared templating helper that escapes the five characters that matter in HTML before
   they are ever written in; the only text allowed to bypass that escaping is markup this same
   screen's own code just built for itself (a drawn face, a row of confidence dots), never text
   that came from the stored record. **This exists because of a real, already-shipped hole, found
   and fixed in the sibling Past scans screen (below) and then checked for and closed here too**:
   before the shared helper existed, a user-typed name was written straight into a page's markup
   with no escaping at all, so typing a name containing an image tag with a broken source and an
   error handler, then opening the screen that displayed it, ran whatever script was in that
   handler. The fix is structural now, not a review checklist: the one function every row goes
   through is the one function that escapes.
10. Tapping a saved row reopens it in an overlay, and what that overlay shows depends on whether
    this exact product still has a matching entry in the scan history:
    - If it does, the overlay shows the full verdict card for that history entry: the tier word,
      the drawn face for that tier, the confidence treatment (below), the seller, how long ago,
      and a line stating plainly that this is read-only and nothing on it can be changed.
    - If it does not (a plain saved fact, no history entry survives to explain it, which the
      saved record's own shape allows: it never stores the verdict itself, only the price, the
      seller and the day), the overlay instead shows the saved facts alone with a line admitting
      there is no verdict on file any more for this one, this is only what was saved.
    **A precise mismatch between what the code says it does and what it verifiably does.** The
    code's own comment describes the first branch as showing "the verdict it produced," implying
    the specific scan that led to this exact save. What the lookup function actually does, read
    directly, is search the whole scan history for the single most recent scan of the same product,
    by product identity alone, and show that one. If the same product is scanned again later, at a
    different price, from a different seller, with a different tier, after it was already saved,
    reopening the saved row will show that newer scan's verdict, not the one that was true when the
    save happened, while the row itself keeps showing the frozen price from the moment it was
    saved. A shopper could see one price on the row and open it to a different tier and a different
    seller with nothing on screen explaining why the two disagree. This is the same shape of
    problem an audit already found and fixed elsewhere in this app (a list row and its own reopened
    detail showing two different verdicts for what a user would reasonably assume is one scan); it
    has not been checked whether this specific path was in scope of that earlier fix or is a
    reopening of the same problem on a different screen.
11. The row's drawn face is never animated; this is stated directly in the shared face-drawing
    code as an unconditional rule for the smallest face size these rows use, applied without
    exception. The one animation this screen does trigger is on the header face, and only once per
    session, the first time the list goes from having nothing in it to having its first row, so
    opening an already-populated list never plays it.

## Removing and restoring a saved item

12. Removing a saved item never deletes it outright. It moves to a shared "Recently removed" bin,
    kept for thirty days, restorable in one tap, because a deleted save or a deleted scan is
    described directly in the code as the only surviving record of what something cost at the
    moment a shopper looked at it, and losing that permanently on one accidental tap was named as a
    defect an earlier audit had already found. The thirty-day figure is written on the removed
    screen itself, not left implicit.
13. That thirty-day expiry is enforced at two points: once automatically, every time the app's
    on-device record is first read after a full reload, and again explicitly the moment the
    Recently removed screen itself is opened. It is not enforced continuously in between; an item
    that quietly aged past thirty days during a single very long-running session, with the removed
    screen never revisited and the app never reloaded, would still be listed as recoverable until
    one of those two moments happens. This has not been checked against any written expectation of
    continuous enforcement, because none was found; it is noted as a real gap in when the rule is
    applied, not assumed to be a problem the product owner has weighed in on.

## Past scans

14. This screen lists every verdict and every refusal a shopper has ever been shown, newest first,
    each one built by reading the exact object that was stored the moment it happened, never
    recomputed. The code's own comment states the reasoning as a direct response to an audited bug:
    a card on this list once read "Fair Price" while the original result screen for that same scan
    had said "Outrageous," because the two were computed separately and could disagree. The fix
    named in the comment is structural, not a second check: there is only ever one stored verdict
    object per scan, and every place that shows that scan again, this list's row, this list's
    reopened card, reads that same object rather than deriving a fresh opinion.
15. A past scan's row shows the same drawn face treatment a fresh verdict would show, including the
    confidence indicator (below), reusing the same confidence-reading function a fresh verdict
    uses, explicitly so that whether a row is being read here or on the moment it happened, nothing
    about its meaning is being decided a second time.
16. **The same self-inflicted security hole named above, first found here.** Before the shared
    escaping helper existed, this screen wrote a piece of stored text (whatever a shopper had
    typed, either as a correction's label or as free text typed into the camera's own search box)
    straight into the page's markup, unescaped. Typing an item's name as a broken image tag with an
    error handler, then opening this screen, ran that handler. Every interpolation of stored text
    on this screen now goes through the same shared escaping helper the Saved list uses.
17. Refusals get their own row and their own reopened card, with their own heading text keyed to
    one of eight named refusal reasons; a reason that has no dedicated wording yet falls back to
    the plain word "Refused" rather than to a blank heading, by design, specifically so a refusal
    reason added to the underlying engine before the matching wording is written shows up as a
    plain, generic word on screen and a loud, obvious gap in the underlying text table, rather than
    failing silently on screen.
18. Reopening either a verdict or a refusal here is explicitly read-only, and the code's own header
    comment states this as a deliberate boundary in plain words: "no share, no watch, nothing that
    acts on a scan that already happened." There is no control anywhere on this screen, on a row or
    inside the reopened card, to rate the scan, correct it, watch it, or share it. Whatever a
    shopper wants to do about a past scan, this screen's only offer is to look at it again or
    delete it.

## Recently removed

19. This is the one shared home for both an unwatched saved item and a deleted past scan, on the
    reasoning above that both are the same kind of loss and deserve the same recovery window.
    Restoring puts an item back into whichever of the two lists it came from; each row keeps its
    own record of which one that is.
20. Deleting for good is two taps on the same button, never a confirmation dialog: the first tap
    arms it, replacing its icon with the full sentence "Tap again, gone for good" and turning it a
    warning color, and only a second tap on that same, now-different button actually deletes.
    Because that sentence is the only thing announcing that the next tap is destructive, and the
    icon-only state announces nothing of the sort, the control's own accessible name changes
    between the two states as well, from a name describing the item to a name that says a second
    press deletes it for good, so a screen reader user gets the same warning a sighted user gets
    from the widened, reddened button, rather than a click target whose danger is only ever shown
    as color and shape.
21. **Deliberately not treated as a live, spoken announcement**, and the reasoning is stated
    directly in the code: the whole screen is rebuilt from scratch on every redraw, and a region
    meant to announce a change out loud has nothing to compare its new text against if it is
    inserted already holding that text, so it would announce nothing at exactly the moment arming
    the delete button is meant to warn someone. The accessible-name change above is offered as the
    actual fix for a keyboard or screen-reader user instead.
22. This screen shows no photograph for any of its rows, and neither does the Saved list or Past
    scans. This is worth stating plainly rather than assumed, because a frozen photograph taken at
    the moment of the scan is in fact captured and carried along with both a saved item's own
    record and a scan history entry's own record; the code that captures it states its purpose
    directly, so that "which one was that" has an answer later. None of these three list screens,
    not the row, not the reopened detail on any of them, reads or shows that photograph anywhere.
    The data survives; nothing displays it. Whether that is an oversight or a piece of a planned
    screen not yet built could not be determined from the files read this session.

## Rating a verdict

23. **The section's brief describes "rating... a past answer" as something these screens do; the
    running code does not support that at all, on any of the three screens above.** There is no
    rating control anywhere on the Saved list, Past scans, or Recently removed, on a row or inside
    a reopened card. The only place a rating can be given is a pair of thumbs-up and thumbs-down
    buttons on the live verdict card, shown at the exact moment a fresh price is computed, before
    the shopper has navigated anywhere else.
24. What that tap actually does, read directly: it toggles a highlighted state on the tapped
    button, shows a small on-screen toast for four seconds with an undo control, and does nothing
    else. It does not write to the on-device record. It does not send anything over the network.
    The undo control simply clears the highlighted state and dismisses the toast early. Once the
    verdict card is left, or once the four seconds pass and the toast disappears on its own, there
    is no remaining trace anywhere on the device that a rating was ever tapped.
25. **A rule stated directly in a design document, and code built specifically to carry it out,
    neither of which the actual tap handler calls.** The design document describing this feature
    calls it, in its own words, "the highest value tap" a shopper can make, because a person can
    often tell a verdict is wrong in one glance while being unable to say what the true price is,
    and it explicitly says the tap should be "rewarded with nothing" so the signal it carries is
    never gamed, not that the signal should go unrecorded. Separately, and unconnected to that tap,
    the on-device record module has a complete, working set of functions to record a rating for a
    scan, overwrite an earlier rating for the same scan, delete one, and count how many verdicts
    have been rated up or down; a network layer has matching functions to send that same rating to
    the server and to delete it there. A profile screen elsewhere in the app already reads that
    count and displays it under the heading "Your ratings." None of that plumbing is ever called
    from the tap. Read together, the design intent (a signal worth keeping), the storage and
    network code built to keep it, and the screen built to display it, all disagree with what the
    live tap handler actually does, which is show a toast for four seconds and forget. The
    practical effect, also verified directly, is that the "Your ratings" count on the profile
    screen will always read zero, on every device, permanently, because nothing anywhere in the
    running app ever calls the function that would increment it.
26. Because no rating is ever recorded, there is also nothing to show back: reopening a past scan
    that was rated at the time never displays what it was rated, on any of these three screens,
    which follows directly from point 25 rather than being a separate finding.

## Correcting a verdict

27. Correcting is a full-screen keypad, reached from two places: the "Correct it" button on the
    live verdict card, and a generic "Report a price" row on the profile screen. Neither of these
    passes a specific scan; the correction screen resolves on its own what the correction is filed
    against, in a fixed order: the exact product identity handed to it directly by whichever screen
    opened it, if any; failing that, the identity carried by the single most recent entry in the
    whole scan history; failing that (a refusal that never resolved a product at all), whatever
    text the shopper had typed.
28. **The section's brief describes correcting "a past answer" as something reachable from these
    screens; the running code does not offer that either.** There is no control on a row or inside
    a reopened card, on the Saved list or on Past scans, that opens the correction screen for that
    specific item. The profile screen's generic entry point does not let a shopper choose which
    past scan to correct either; per point 27, it always resolves to whichever scan is most recent
    in the history at the moment it is tapped, which may not be the one the shopper meant, if
    something else was scanned in between.
29. The screen requires a typed price and a named shop before its save button will work, and it
    explains which of the two is missing in a plain sentence right above the button rather than
    leaving a disabled button unexplained; the reason a shop is mandatory is stated directly in the
    code: a price recorded with no seller cannot later be excluded from, or matched against, a
    comparison set built out of seller-specific offers, so a correction with no seller would be
    unusable data rather than merely incomplete data. The shop field is pre-filled from whichever
    shop the shopper most recently confirmed being in, but stays editable, specifically so a
    correction typed from this list-driven entry point, away from the store the price was actually
    seen at, is not forced to inherit the wrong one.
30. Saving is a two-step act that happens in a fixed order and is stated directly in the code as
    fixed: the correction is written to the on-device record first, synchronously, which cannot
    fail because of the network; only after that does the app attempt to send it, and that attempt
    is never awaited by the screen. The thank-you shown to the shopper is about the local write,
    which has already succeeded by the time it is shown, so an aisle with no signal produces the
    exact same on-screen outcome as a good connection, and the correction goes out later.
31. What "later" means, read directly from the queueing code: every correction not yet
    acknowledged by the server is kept, oldest first, and an attempt to send the whole queue runs
    both right after a correction is typed and once, unconditionally, every time the app itself
    starts up (so a correction typed with no signal in one aisle visit goes out automatically the
    next time the app is opened with a connection, with no action from the shopper). The send
    reads back three distinct outcomes, and the code states plainly why each is treated the way it
    is: the server accepting it marks it sent and drops it from the queue; the server actively
    refusing it (a price that is not a number, no shop given) also marks it sent, with the refusal
    reason kept on the device, on the stated reasoning that retrying a request an unchanged server
    rule already rejected can never succeed and would only mean the queue never empties; and the
    network simply not being reachable at all leaves it pending and stops the rest of the queue
    from being attempted this pass, on the stated reasoning that if the first request could not
    reach the server, none behind it can either, so there is no reason to spend more of a phone's
    radio in a place that already said no.
32. **No screen anywhere in this app displays the correction queue, its contents, or its outcome.**
    Every correction the on-device record ever stored, sent or not, sent-and-accepted or
    sent-and-refused, is kept on the device, and the record module explicitly keeps sent entries
    rather than deleting them, stating that this is meant to be what the app can show a shopper
    about their own contributions without a network round trip. Read directly, nothing calls the
    function that would list them; there is no past-corrections screen and no line item for it on
    any of the three list screens covered here, or on the profile screen this section checked.
    Filing a correction is, today, a write-only act from the shopper's point of view: the one
    on-screen acknowledgment is the "Recorded" line shown for a moment right after saving, and
    once the shopper navigates away from it, nothing in the app shows that correction, or any
    correction, again.
33. The same escaping discipline named for the two list screens applies here too, and for the same
    reason: the confirmation line printed at the bottom of this screen interpolates the item's own
    label and the seller name a shopper just typed, and the code's own comment names this as a live
    injection path it closed, not a theoretical one, since correcting an item's name to a broken
    image tag with a script handler and opening this same screen is exactly the class of bug found
    and fixed on the Past scans screen.
34. If the browser's storage cannot actually keep anything (verified once per page load by writing
    and immediately reading back a throwaway value), this screen shows a plain warning line saying
    so before a price is even typed, rather than only after a failed save; the code's own comment
    is explicit that no network-style error banner belongs here at all, since the whole point of
    the two-step save above is that a network failure is invisible to the shopper by design, and
    a warning about storage would contradict that design if it were phrased as if the network were
    the risk.

## Shared building blocks worth naming once

35. **The confidence treatment.** Every row and every reopened card on the Saved list and Past
    scans (a fresh verdict's own card does the same thing, outside this section's scope) shows
    confidence as a fill on the drawn face itself, not as a separate sentence: the code's own
    comment calls this "the most important visual rule in the product," specifically so that a
    hollow, thin-confidence verdict and a solid, certain one are never mistaken for each other at a
    glance. It is a direct read of a band already computed by the pricing engine (however many
    distinct sellers backed the number), never a second opinion recomputed on the frontend.
36. **The reopened-card dialog contract.** Both the Saved list and Past scans reopen an item in the
    same kind of overlay, and both rely on one shared helper to make that overlay behave like an
    actual modal dialog for someone not using a mouse: marking the rest of the page inert so it
    cannot be tabbed into or read by a screen reader while the overlay is open, giving the overlay's
    own heading and card the roles and labels an assistive technology expects, moving focus inside
    it the moment it opens, trapping the Tab key so it cycles inside the dialog instead of leaking
    back out to the page behind it, and closing on the Escape key. The code's own comment for this
    helper states plainly that before it existed, this overlay had none of that, on either screen,
    and a screen-reader user could tab straight past it into a page that was still fully readable
    underneath.
37. **The spoken-line safety net.** Every sentence Shin says on these screens, in whichever
    personality is chosen, is generated by one shared function reading a table of per-personality
    line templates. That function checks its own output for the literal words "undefined," "null,"
    or "NaN" appearing in the finished sentence, which is exact rather than a guess, since a piece
    of data missing from a filled-in sentence turns into exactly one of those words and no line in
    the underlying table is ever written to contain them on purpose. If it finds one, it logs the
    broken sentence and the key that produced it to the browser's own console, and shows a second,
    plainer fallback line instead, one with no interpolated facts at all, so the shopper on the
    other end of a broken data path sees a sentence that is merely generic rather than one that
    visibly names a missing value it had no way to know was missing and no way to fix.
38. **Navigation as an event, not just a redraw.** Moving into or out of any of these screens goes
    through one shared router: it tears down the screen being left (running that screen's own
    cleanup, so its event listeners do not linger and fire twice on a return visit), writes the new
    browser address and page title, redraws the new screen, and then, only for a move that follows
    the very first page load, moves keyboard focus into the new screen's own heading and writes its
    title into a screen-reader announcement region a moment later. The code's own comment marks
    this focus-and-announce step as a deliberate fix to an audited gap: before it existed, moving
    from one of these screens to another left a keyboard user's focus on nothing and told a screen
    reader user nothing had happened at all, since a page title changing is only ever announced on
    a real page load, which a single-page app like this one only ever has once.
