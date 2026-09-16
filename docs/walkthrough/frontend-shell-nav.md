# Frontend shell and navigation

This section covers the one question the rest of the walkthrough takes for granted: what
actually decides which screen a person is looking at, at any given moment, and what makes the
app move from one to the next. Every claim below was checked directly against the running
front-end code and the two nearby documents it points at (a design review and a running defect
log) during the session that wrote this section, not recalled or assumed. Several of the
comments inside the code disagree with each other or with what the code next to them actually
does; each is quoted exactly, on both sides, rather than silently picked for the reader.

## What loads before any screen does

1. The page itself carries almost no content: one empty box that every screen is drawn into,
   one invisible strip of text a screen reader uses to speak a screen change, and one script
   that starts everything else. With scripting turned off there is nothing else on the page, and
   it says so plainly, in English and in French, rather than showing a blank rectangle that
   would read as a broken app.
2. That one script runs a short, fixed sequence, in this exact order, before it ever decides
   which screen to show:
   - Restore a previously chosen light-or-dark override from the persisted store, if there is
     one, so the very first thing painted is already the right color scheme instead of flashing
     the default and correcting itself a moment later.
   - Start a background watcher that keeps the phone's own status bar and browser chrome colored
     to match whatever theme is active. This exists because the two static color declarations
     written into the page's own head cannot react to a choice made inside the running app; only
     this watcher, started after the theme is restored, can.
   - Start the analytics and tracking module. This is not a function call; the module arms every
     listener it owns (app opens, screen changes, taps, visibility, errors) the instant it is
     merely loaded, on purpose, so no screen author has to remember to turn instrumentation on.
   - Decide the very first screen (below) and hand control to the router.
   - Warm a rough location estimate in the background, but only if location consent already
     carries over from an earlier visit, and explicitly never waited on: a slow or refused
     operating-system prompt must not hold up the live camera view.
   - Send off any price corrections that were typed while offline, also never waited on.
   - Fetch and cache the offline product catalogue, also never waited on, and only once the
     app has had an idle moment to spend on it.
   - Register the offline shell (below), but only in the ordinary web build; explicitly skipped
     when the app is running inside its native wrapper.
   The comments next to the last four steps all give the identical reason, in close to the same
   words each time: the live camera view is the one thing the app exists to show, and nothing
   above it is allowed to delay that by even one tick, so each of those four is fired and left
   running rather than waited for.

## The one-time gate in front of the camera

3. Before any screen is chosen, the app reads two independent yes-or-no flags left over from any
   earlier visit: whether the personality question has ever been completed, and whether the
   one-time privacy and data-collection screen has ever been shown and acted on. These are kept
   as two separate flags on purpose, stated directly in a comment: folding them into one flag
   would mean an app updated in the middle of a person's very first visit could not tell which of
   the two questions that half-finished visit had actually reached.
4. The very first screen a person ever sees is decided by those two flags and nothing else:
   personality not yet chosen sends them to the personality screen; personality chosen but
   consent never shown sends them to the consent screen; both done sends them straight to the
   camera. A returning visitor with both flags already set lands on the camera with nothing in
   front of it.
5. On the personality screen, pressing its one forward button does three things at once: if no
   personality was actually tapped, one is chosen for them by default (the flat, deadpan voice);
   the "personality chosen" flag is set to true; and the app moves on immediately, in the same
   instant, checking that same consent flag itself and going straight to the camera if consent
   was already handled, or to the consent screen if it was not. A comment next to this states
   plainly why the check is duplicated here rather than trusted to a reload: this is the
   warm-start version of the exact same check the app's startup sequence makes on a cold start,
   taken the instant the personality screen finishes rather than waiting for the person to close
   and reopen the app.
6. On the consent screen, pressing its one forward button sets the "consent screen shown" flag to
   true and moves straight to the camera. Nothing else in the running app ever routes a person
   back to either of these two screens; both are, by construction, a once-ever gate.

## The router: what a screen is, and how the app moves between them

7. Every screen is a small, self-contained module that declares an identifier, a display name,
   and a function that fills the empty box with markup and wires up its own button handlers. A
   screen may hand back a cleanup function, run right before the box is emptied for the next
   screen, and every screen that attaches its own listeners or timers does so.
8. Screens never refer to one another directly. The only way a screen moves the app anywhere is
   by calling one of two functions it is handed: one that means "go here, and remember where I
   was so the back button returns to it," and one that means "go here, but replace where I am, so
   the back button skips over this stop entirely." Both take the target screen's identifier and
   an optional bag of parameters.
9. The "go" version writes the target screen's identifier, and any parameters, into the page's
   own address as a query string, and adds a new stop to the browser's history before drawing
   anything. The "replace" version writes the same address information but overwrites the
   current history stop instead of adding a new one. This is why every one-time gate above, and
   every automatic redirect described later, uses the replace version: none of them are a place a
   person should be able to land back on by pressing back.
10. Whichever function is used, the actual work of tearing down one screen and putting up the
    next happens in one place, and it always does the following, in this order:
    - Remember exactly how far down the outgoing screen was scrolled, keyed by that screen's own
      identifier rather than by which history stop it was, specifically so returning to a list
      screen lands where that list was left, whether the way back was the browser's own back
      button or a button drawn inside the app.
    - Run the outgoing screen's own cleanup function, if it left one, inside a safety wrapper so
      a broken cleanup cannot stop the new screen from appearing.
    - Empty the box completely and mark which screen identifier now owns it.
    - Re-apply whatever language is currently in force to the whole document. A comment explains
      why this has to happen on every single screen change rather than once: a page that never
      does a second full load has no other moment to update the one attribute a screen reader
      uses to choose which language's voice to speak in, so without this step the app would keep
      announcing French text in an English voice, or the reverse, until the phone was closed and
      reopened.
    - Decide whether this is the first time this particular screen identifier has ever been
      shown this session, and mark it accordingly before any markup is written. This mark is
      what a stylesheet elsewhere uses to decide whether to play an arrival animation at all: the
      first time a person ever sees a given screen, one element animates in; every later arrival
      at the same screen, including the camera-to-list-and-back loop the app is mostly made of,
      is instant. A design review from earlier in the project had flagged the opposite behavior,
      a full fade-and-rise animation replayed on every single element on every single arrival, as
      wrong for exactly this reason, calling it "motion on a path used many times a day, which is
      where animation is most expensive and least wanted"; the mark-once mechanism now in place
      is the stated fix for that finding, verified today as what actually runs.
    - Set the browser tab's text. The rule for this is its own small piece of logic, covered on
      its own below.
    - Call the new screen's own render function inside a safety wrapper, passing it the "go" and
      "replace" functions, any parameters from the address, and a small shared set of handles
      (the persisted store, the network layer, and the character-face drawing module). If
      rendering throws partway through, the box is instead filled with a plain, translated
      apology and a single button that returns to the camera; the actual error is sent only to
      the developer console, never shown on screen, and is escaped before that console write so a
      malformed error message cannot be mistaken for something safe to display raw.
    - Move keyboard focus into the new screen and, on every arrival after the very first one,
      announce the new screen's name through an invisible, always-present live region built for
      exactly this. The very first arrival, on a real page load, is deliberately skipped for
      both: the browser has already put focus at the top of the page and a screen reader has
      already read the page's title, so doing it again would be a second, wrong announcement of
      an arrival that already happened.
    - Restore the screen's remembered scroll position if this was a back-or-forward navigation,
      or reset scroll to the top for every other kind of arrival, since a forward move to a
      screen is a fresh visit and a back-or-forward move is a return to somewhere the person
      already was.
    - Broadcast a signal, carrying the new screen's identifier and parameters, that anything else
      in the app can listen for. The only current listener is the analytics module, described
      below.
11. The browser's own back and forward buttons are handled the same way as any other navigation:
    a listener reads the screen identifier and parameters back out of the address the browser
    restored, and repaints exactly that screen, flagged as a restore so its scroll position comes
    back rather than resetting to the top.

## Moving keyboard focus and announcing the change: what was fixed, and what still is not

12. A comment inside the router states its own history plainly: navigation used to be treated as
    a purely visual event. The screen was emptied, the new one written, the tab title changed,
    and nothing more; a keyboard user who moved from the camera to a list screen was left focused
    on nothing in particular and had to tab in from the very top of the page to reach the content
    they had just asked for, and a screen reader user heard silence, because a browser only
    announces a title change on a real page load and this app never does a second one. The
    mechanism described in step 10 above (focus the heading, then announce, then restore scroll,
    in that order) is the stated fix, and it runs today.
13. **A stale piece of that same fix, found and confirmed this session.** The comment
    that chooses which element to move focus to says, in these words: "Nine screens have an h1
    and the camera does not... it is camera.js's to fix, and this copes either way rather than
    depending on it." Read against the actual markup of every registered screen today, this is
    no longer true on either count. The camera screen does have a heading now: a visually hidden
    one, present specifically so the same focus-and-announce mechanism has something to land on.
    Of the eleven screens the app registers, ten carry a visible heading and the camera carries
    the hidden one just described, which makes eleven of eleven, not the "nine... and the camera
    does not" the comment states. The one screen that was checked and genuinely has no heading
    element of any kind is the shop-picking screen reached from the profile page ("Where do you
    shop?"): it has a header bar with a small caption above a list of choices, but no heading a
    screen reader's own heading list would find, and no `h1` for the focus mechanism above to
    fall back onto beyond the whole screen container. This is exactly the defect a project design
    review had already named once, for the camera, in these words: "The camera screen has no
    heading element at all. Every other screen has an `h1`." That finding was acted on for the
    camera; the comment describing the fix was never updated to say so, and the one screen that
    still matches the review's original description today is a different one than the comment
    now names. **Flagged, not resolved:** whether this is worth a real fix on the shop-picking
    screen, or is being left as-is deliberately, is not stated anywhere read.

## The browser tab's title, and the rule behind it

14. Every screen registers a plain-English name for itself. What actually reaches the browser
    tab is that name, with the app's own name appended after a separator, except on the camera:
    the camera's own registered name already is the app's name, and the appending rule is
    deliberately skipped in that one case rather than always applied. The reasoning, taken
    directly from the code: every other screen is a place inside the app and is titled after
    itself, but the camera is not a place inside the app, it is the app, so the honest tab text
    for it is the app's own name, and the appended half would be the redundant one, not the
    camera's title. This exact defect, the tab reading the app's name twice, was found, logged,
    and fixed earlier in the project; re-checked directly today, the fix is what actually runs.

## The eleven screens, and what leads to each

15. The router holds exactly eleven registered screens, listed once, in the order they are
    registered, with the camera deliberately first: a comment states that the camera is first
    because the camera is the app, the cold start lands on a live viewfinder with the shutter
    under the thumb, and everything else is reached from there. Checked directly against every
    button-press handler in the app rather than assumed, here is what actually leads to each
    screen behind the camera:
    - The camera itself, reached from every other screen behind it through a shared bottom bar
      (below), and reached automatically from a saved-item share page whose scan no longer
      exists.
    - The personality and consent screens, reached only once each, as described above, and from
      nowhere else in the running app.
    - The saved-items list ("Saved"), reached from the camera, from the profile screen, and from
      its own two sub-pages (past scans, recently removed), each of which returns to it.
    - Past scans and recently removed, both reached only from the saved-items list, and each
      returns to the camera, the saved-items list, or the profile screen through the same shared
      bar.
    - The profile screen ("You"), reached from the camera and from the saved-items list, and
      itself the doorway to the shop-picking screen and to a report-a-problem screen.
    - The shop-picking screen ("Where do you shop?"), reached only from the profile screen, and
      itself the doorway to a licences and sourcing screen.
    - The licences and sourcing screen, reached only from the shop-picking screen.
    - A price-report screen, reached from the profile screen and, separately, from inside the
      camera's own result state when a person disputes an answer; it returns to the camera
      automatically a short, fixed delay after a successful submission, and also on its own
      cancel button.
    - A share page for one specific saved scan, reached only from inside the camera's own result
      state, and the one screen documented to navigate itself: if the specific scan it was asked
      to display no longer exists, it silently redirects to the camera rather than showing an
      error.

## The shared bottom bar and back control for the six pages behind the camera

16. A design document is quoted directly in the code for the reason this exists: the bottom bar
    was specified once, for the camera, as carrying three things, a shutter in the center, a
    saved-items shortcut to its left, and a profile shortcut to its right, and that was true only
    of the camera. Every page behind it used to carry a single floating button with no bar under
    it and no way to move from the saved-items list to the profile screen without passing back
    through the camera first, so the shape of navigation changed the moment a person left the
    live view.
17. The fix is one shared piece of markup, used by all six pages that sit behind the camera
    (saved items, past scans, recently removed, profile, shop-picking, licences), rather than six
    separate copies of the same three-button bar. Each of those pages tells it which of the two
    reachable destinations, saved items or profile, is the one currently active, including a page
    reached one level deeper: the past-scans and recently-removed pages mark saved items as
    active, and the shop-picking and licences pages mark profile as active, because that is the
    parent a person actually came in through. The middle button of that shared bar always returns
    to the camera. The comment is explicit that the button representing the screen already being
    shown does nothing when pressed, deliberately, rather than pushing a second, pointless stop
    onto the browser's history for the page a person is already standing on.
18. The four pages that sit one level deeper than saved items or profile (past scans, recently
    removed, shop-picking, licences) each also carry a dedicated back control in their own header,
    separate from the shared bottom bar. Its behavior is not a normal forward navigation dressed
    up as a back one: it calls the browser's own native back action directly, and only falls back
    to a normal forward navigation, to a named parent screen, when there is nowhere for the
    browser to go back to at all. The reasoning quoted directly from the code: the router already
    adds a new history stop on every ordinary navigation, so the browser's own back button already
    lands on the correct parent; using a real back action here means pressing the system back
    button afterward does not walk a person through the same two screens over and over, which
    is what a second, disguised forward navigation would do. The fallback exists specifically for
    someone opening a link straight to one of these deeper pages from outside the app entirely,
    where the browser has no earlier stop to return to and a real back action would leave the app.

## The camera's own navigation, which the router never sees

19. The camera screen is not, in itself, one fixed thing. Underneath the single router entry
    called "camera," the screen carries its own separate, smaller state machine, entirely
    invisible to the router: a plain marked value that is always exactly one of idle, framing,
    choosing, asking, reading, texting, or a finished result. Everything a person experiences as
    "the app changed what it's showing me" while never leaving the live camera view (a barcode
    being read, a sheet asking which of several possible products was meant, a sheet asking for
    the shelf price, a spinner while a search runs, the final verdict) is this state changing, not
    a router navigation, and none of it touches the browser's address bar or history at all.
20. Whenever this internal state changes, three things happen together, all driven off the one
    value: any state that puts an overlay sheet on top of the live feed (choosing, asking,
    reading with a sheet, or the result) makes the camera's own bottom bar keyboard-inert, so a
    person tabbing through the page cannot reach a shutter button that a sheet is currently
    covering; the small on-screen marks the live object detector draws over things it sees are
    made keyboard-inert in every state except idle, for the identical reason, applied one screen
    element later than the bar was: a defect log entry found these marks specifically, months
    after the equivalent fix on the bar, because they stayed visible to a keyboard's tab key even
    while hidden from the eye by transparency alone; and the character face docked in the corner
    of the screen is parked, rather than left running, in every one of those same sheet-covering
    states, which is the fix for a separate, previously logged defect where an invisible face
    kept multiple animations quietly running for the entire length of an interaction.
21. This same internal state is also what a scan-abandonment measurement reads directly, rather
    than keeping a second flag: any state other than idle (nothing happening) or result (an
    answer already landed) is treated as a scan that started and never finished, and is recorded
    as such the moment the person leaves it through any exit path, whether that is a deliberate
    reset, the screen being torn down, or the app being backgrounded mid-scan. A comment states
    the boundary explicitly: idle is excluded because it is a finished or never-started scan, and
    result is excluded because the answer has already arrived by that point, so closing it is a
    completed scan, not an abandoned one.

## When the camera actually asks for permission to use it

22. **A direct contradiction, verified this session.** The startup script's own comment states
    the rule in these exact words: "The one thing that can stand in front of the camera is the
    attitude question, asked once. Camera permission is deliberately not asked here; it is asked
    at the first shutter press, which is the only moment the request makes sense to the person
    being asked." Read against what the camera screen's own render function actually does the
    moment it is drawn, neither half of that is what happens. The screen begins trying to attach
    a live camera feed as one of its very first actions on mount, well before any shutter is
    pressed: it first hands the video element to the object-detection module, which itself
    attempts to start a real camera stream immediately and reports back whether that succeeded;
    if that attempt fails or the necessary detection bundle is unavailable, the screen falls back
    to a second, independent attempt at a live camera stream, calling the browser's own
    camera-permission API a second time. Either path is a genuine request for camera access,
    fired automatically the instant the screen opens, and a person who has never granted camera
    access before will see the browser's own permission prompt on that first arrival, not after
    tapping anything. And the claim that the personality screen is "the one thing" able to stand
    in front of the camera is itself contradicted a few lines later in the very same file, which
    describes a second screen, the one-time consent screen, sitting between the personality
    question and the camera "once, ever," meaning at least two screens, not one, can precede a
    person's first sight of the camera on a fresh install. **Neither side of this is resolved
    here**, since the walkthrough's evidentiary rule does not allow deciding which is intended:
    what is confirmed is that the plain-English rule stated in the code and the code that runs
    beside it describe two different apps.

## Whether data collection defaults to on or off, and a contradiction inside one file

23. **A direct, same-file contradiction, verified this session, with a third source consulted to
    weigh it.** The persisted store's own definition of the two consent switches (photo capture
    and location) carries this comment directly above the actual default values: "Changed
    2026-09-14 on the founder's word, 'build everything for collecting EVERYTHING': both default
    ON now, mirroring [the server's] own default for a device with no row." The value written on
    the very next line, however, is both switches set to off. Roughly 80 lines further down the
    same file, in the function that brings an older saved copy of the store up to date, a second
    comment describes the identical default in the opposite words: a state with no consent
    information at all "read as [the same off default], the off default (his ruling
    2026-09-14)." Both comments cite the same date and both claim to state his ruling; they say
    opposite things. A near-identical claim of an "on" default appears a third time, in the
    camera screen's own comments, justifying a background location warm-up as covering "a fresh
    install (consent now defaults on, so this is the very first ask)." To weigh the two sides
    without guessing, the actual consent screen's own behavior and the server-side file the first
    comment claims to mirror were both checked directly. The consent screen itself starts both of
    its toggles visually off and only turns one on once the stored value says to. The
    server-side file was checked directly and states its own rule in capital letters in its own
    header: "BOTH DEFAULT OFF, AND THE DEFAULT IS NO ROW," and its own in-code fallback value for
    an unanswered device sets both switches to false. So three of the four places this default is
    stated or acted on, including the one the first comment explicitly claims agreement with,
    say off; only the one comment does not. **Flagged as an open decision point rather than
    silently corrected:** the running app today asks for photo and location consent as an
    off-by-default choice a person must turn on, not the on-by-default one two of its own
    comments describe, and which of those two states his actual ruling of 2026-09-14 intended is
    not something this session can settle from the files alone.

## Analytics riding on top of every navigation

24. The tracking module described in step 2 arms four listeners the moment it loads, none of
    which change what screen is shown: it records one event when the app itself is opened,
    carrying the browser's own reported screen and window size, connection type, language, time
    zone, and whether the app is running installed to a home screen rather than in an ordinary
    browser tab; it listens for the exact signal the router broadcasts on every screen change
    (step 10's last item) and records the screen just entered, the screen just left, and how long
    the person spent on the one just left; it records every tap anywhere in the app, capturing
    the pressed element's own label, tag, and visual position, through one single listener on the
    whole document rather than one wired into every button by hand; and it records when the app
    is hidden or shown again, flushing anything queued the moment it is hidden, in case the app is
    being closed for good in the next instant.
25. One region of the screen is deliberately invisible to that tap listener, and the ordering of
    the check that excludes it is treated as load-bearing rather than incidental. Content coming
    back from a live, search-grounded model answer is marked so this listener skips it entirely,
    and the code states the reason directly, quoting the actual term of service it is complying
    with: the answer's provider "will not track whether those interactions were specifically with
    a given Search Suggestion or Grounded Result... including any specific Link." The check for
    that mark runs before anything else the tap listener does, including before it works out what
    label to record, specifically so a later change to the file cannot accidentally move that
    check below the point where the forbidden label has already been read into memory; an
    automated test is named as asserting the two checks stay in that order.
26. Everything this module queues is written to the phone's own persisted storage after every
    change, specifically because a scan can happen with no network signal at all, and is sent
    over the network in batches on a repeating timer and on the visibility-hidden event above,
    through the one function the rest of the app already uses for every other network call to
    Shin's own server, rather than a second path of its own.

## The offline shell, and a mismatched quote about how it behaves

27. A separate mechanism, registered after the router and also never waited on, lets the app open
    at all with no network signal, by keeping a cached copy of the page's own shell. The comment
    introducing it explains the actual incident that justified it: an earlier version of the
    offline product catalogue put over a hundred thousand products on the phone so a scan in a
    signal-dead aisle could still get a name, but the app's own code and the barcode reader's own
    supporting files were still being fetched over the network on every single load, so with no
    signal none of them arrived and the screen confidently told a person "no barcode there" while
    pointed straight at one. This mechanism is stated to be the fix for that specific gap, not a
    default added because "apps have one."
28. It is deliberately never registered when the app is running inside its native wrapper, and
    the reasoning is stated in two parts. First, this mechanism's own rule is checked directly and
    confirmed to already let every request to Shin's own server, and every request to any other
    website, pass through completely untouched, so registering it inside the wrapper could not
    itself serve a stale price or a stale photo answer. Second, and stated as the actual reason it
    still is not registered there, is a quote of one of this mechanism's own numbered rules,
    attributed by number: rule three, quoted as "Everything else same-origin is served from cache
    first," is said to risk caching the wrapper's own bundled files and serving a stale one back
    after an app-store update has already replaced them underneath it. **A separate, smaller
    disagreement, verified this session:** that quoted text does not match what the mechanism's
    own numbered rule three actually says, word for word, in its own file: "Everything else
    same-origin is fetched from the network first and cached; the cache answers only when the
    network does not." One version describes cache-first behavior; the other, the one actually
    written and run, describes network-first behavior that only falls back to a cached copy when
    there is no network at all. The underlying decision not to register this mechanism inside the
    wrapper still holds even under the correct wording, since the specific danger described (an
    old, cached file being served instead of a freshly installed one) is exactly the case where
    the network attempt is the one that is unavailable and the fallback to a stale cached copy is
    the one that fires; the quote itself, though, is simply not what the file it is quoting says.

## Three modules opened and confirmed to play no part in navigation

29. Three of the files this section was pointed at were opened in full and checked, and none of
    them decide which screen is shown or move the app between screens; each is named here only so
    that absence of a navigation role is a checked fact rather than an assumption.
    - One module exists purely to generate and remember one random identifier per phone,
      used to tell one anonymous device's activity apart from another's for the analytics
      described above. It has no accounts, no sign-up, and no bearing on which screen a person
      is shown.
    - One module holds exactly two on/off feature switches, both currently off, gating only
      which words and which character-face states are allowed to imply a capability the app does
      not yet have (watching a price over time and telling a person when it drops); a comment
      states plainly why one of them defaults off, citing a specific, named pilot result where
      four attempted price fetches returned zero prices. Neither switch is read anywhere by the
      routing or screen-selection logic checked in this section.
    - One module holds a single version string, referenced by the startup sequence and by the
      network layer so both report the same build identifier; it has no other behavior.
    A fourth module, the one that draws Shin's own character face and its animated expressions,
    was also opened; it is handed to every screen alongside the store and the network layer, but
    everything in it concerns what the face looks like and how it moves between expressions, not
    which screen is on the page or how the app travels between screens, and no navigation
    decision in this section was found to depend on it.
