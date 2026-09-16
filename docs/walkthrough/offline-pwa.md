# The offline and installed-app layer

This section covers what keeps the app usable with no network signal at all, and what changes
for a person who adds it to a home screen rather than keeping it as a browser tab. Every claim
below was checked directly against the actual files during the session that wrote it
(2026-09-15), including opening the two files this layer actually downloads and measuring their
real sizes on disk, rather than trusting any comment's own stated number. Nothing here involves
a call to Gemini or to any other model. This layer's job is caching, storage and installation
behavior, so the "exactly what is sent / exactly what comes back" breakdown the walkthrough uses
for a model call does not apply to any step in this section, and that is stated here rather than
silently skipped.

## Keeping the app able to open with no signal at all

1. A background process, separate from the page itself, sits between the app and the network and
   decides what a request gets back. The comment introducing it explains the exact incident that
   justified building it, not a default added because "apps have one": an earlier version of the
   on-device product catalogue already put over a hundred thousand products on the phone so a scan
   in a signal-dead aisle could still get a name, but the app's own code and the barcode reader's
   own supporting files were still being fetched over the network on every single load, so with no
   signal none of them arrived, and the screen would confidently say "no barcode there" while
   pointed straight at one. The comment calls this "the worst kind of wrong answer this product
   can give: confident, specific, and about something it never actually looked at."
2. When this mechanism is first installed on a phone, it pre-loads exactly one thing before it
   will let itself finish installing: the root page and its already-built HTML file. Nothing else
   is hand-listed for pre-loading, and the comment states the reason directly: "the module graph
   underneath is picked up by rule 3 on the first online visit rather than listed here: a
   hand-written list of thirty modules is a list that goes stale silently the first time somebody
   adds a screen." Practically, this means a phone that adds the app to its home screen and goes
   offline before ever loading it a second time online has the empty shell cached, but not yet the
   scripts that shell needs to draw anything; the scripts arrive the first time the phone is
   online, and every load after that is covered by rule 3 below.
3. Installing never fails outright even if that first save cannot be made (a full disk, a private
   window that refuses persistent storage): the code tries to cache the two starting files, and
   whether that succeeds or throws, it moves on to letting itself take over immediately, rather
   than staying in a pending state waiting for space that may never appear.
4. Once installed, it immediately deletes every other same-origin cache it finds under a different
   name than its own, and takes control of every open copy of the app in every open tab right away
   rather than waiting for a person to close and reopen the app. This means a new version of this
   mechanism, once shipped and reached, drops the previous version's saved files immediately and
   starts intercepting requests for tabs the person already had open, without a reload.
5. Four rules govern which network requests it involves itself in at all, stated as decisions in
   its own comment rather than defaults:
   - Nothing to do with pricing or scanning (every address that starts the same way) is ever
     served from a saved copy, in either direction. The stated reason: "prices are the whole
     product and a stale price shown as current is the failure this system exists to prevent."
     Offline, a request for a price or a scan answer is simply allowed to fail, because the
     screens that make those requests already know what to say when they fail.
   - The one big file this layer could plausibly save, the on-device product pack described later
     in this section, is deliberately excluded from this mechanism's own saving even though it
     would qualify as a large, cacheable file. The comment's reason: a separate part of the app
     already stores that exact file in its own place with its own versioning, and "two copies with
     two expiry rules is how a phone ends up answering from a pack nobody can account for."
   - Every other same-origin request is sent to the network first; only when the network attempt
     fails does the last saved copy answer instead. The comment marks this as a reversal from an
     earlier version of the same file that tried the saved copy first, and gives a dated, concrete
     incident as the reason: on 2026-09-14, a phone belonging to a family member kept running a
     saved copy of the app from before two fixes had shipped (one for reading an invite from a
     link, one for the barcode reader surviving a slow download), for several loads after both
     fixes were already live on the server, because the saved copy kept winning over the network.
     Every request that phone made to the server during that window was refused, and nothing it
     scanned reached the server at all. The comment states plainly that on a beta where the code
     changes daily, a stale saved copy is the common case that needs guarding against, not the
     offline aisle.
   - A request for a whole page (a navigation, as opposed to a request for a script or a
     stylesheet) that fails with no network falls back to the saved copy of the root page rather
     than the browser's own built-in "you are offline" page, because, in the comment's words, "the
     app has something useful to do with no signal and the browser's page does not."
6. This produces a real but easy-to-miss tension worth stating plainly, because it resolves
   correctly rather than being a contradiction: the app's own server marks almost every file it
   serves (all of the app's own scripts and styles) as never cacheable by the ordinary browser
   cache at all, specifically so that an edited screen on the beta is one reload away rather than
   stuck behind a stale copy. That marking has nothing to do with this mechanism's own saved
   copies. The two are separate storage systems; the ordinary browser cache is told never to keep
   these files, while this mechanism keeps its own explicit copy of them regardless of that
   instruction, because that is the only way the app has anything to run with no network at all.
   The two do not conflict in practice because of rule 3 above: whenever the phone is online, the
   fresh, uncacheable copy is what actually gets used and re-saved; the saved copy only ever
   surfaces on a request that could not reach the network in the first place.
7. One category of file is deliberately handled differently by the server itself, outside this
   mechanism: files kept in a folder reserved for vendored, third-party code, which includes the
   barcode reader's own WebAssembly files, are marked cacheable by the browser for a full year as
   unchanging. The comment justifying it names the same failure this whole layer exists to solve:
   leaving those files marked non-cacheable "is what makes the camera unable to read a barcode
   with no signal... the reader re-fetches its WebAssembly every time it starts, so the moment the
   network goes, the scanner aborts." These same files are also same-origin, non-scan, non-price
   requests, so this mechanism's own rule 3 saves an explicit copy of them as well; the barcode
   reader's files end up protected twice, once by the ordinary browser cache and once by this
   mechanism's own storage, which is redundant rather than contradictory.

## What "no connection" actually produces, request by request

8. A request for the app's own page, with no network reachable at all: answered from the one
   saved copy this mechanism guarantees exists, so the app opens and draws its normal starting
   screen rather than a browser error page.
9. A request for one of the app's own scripts, styles, or already-vendored files, with no network
   reachable, and the phone has been online at least once since this mechanism last changed
   version: answered from the saved copy made the last time that exact file was successfully
   fetched, whatever that copy actually is.
10. The same kind of request, but for a file this exact phone has never successfully fetched
    before (a brand-new file added to the app since this phone was last online, on a phone that
    is offline right at this moment): there is nothing to fall back to, so the request fails the
    ordinary way a browser reports a failed network request, with nothing this mechanism can do
    about it.
11. Any request whose address starts with the reserved prefix used for pricing, scanning, the
    on-device pack, and every other server answer: this mechanism does not touch it at all, in
    either direction, whether the phone is online or not. Offline, that request fails exactly as
    it would with no such mechanism installed, which is the deliberate outcome rule 5 above
    describes: a failure here is correct, because the alternative is a price the app cannot stand
    behind.
12. A request to any other website entirely (a font host, an analytics endpoint, anything not on
    the app's own address) is also left completely alone by this mechanism in both directions, so
    it neither helps nor hurts those requests offline; they simply fail on their own if the
    network is down, the same as they would in a tab with no such mechanism at all.

## Where this mechanism is switched off on purpose

13. It is only ever asked to install itself after the page has fully loaded and after the app's
    own screen router has already started, specifically so that a slow install can never delay the
    one thing the app is actually for: the code registering it is written to never be waited on,
    with the comment stating "the viewfinder comes first and nothing here may hold it up."
14. It is never installed at all when the app detects it is running inside the separate native
    wrapper build, rather than as an ordinary web page. The detection is a single flag the wrapper
    build sets on the page before anything else runs. The comment gives the reasoning in two
    parts. First, it states that this mechanism's own rules, checked directly by whoever wrote the
    comment, already let every request to the app's own server and every request to any other
    website pass through completely untouched, so installing it inside the wrapper could not
    itself be the thing that serves a stale price or a stale photo answer; it would be harmless
    there. Second, and given as the actual, deciding reason it still is not installed there, the
    comment quotes what it says is one of this mechanism's own rules, attributing it by number:
    "rule 3 ('Everything else same-origin is served from cache first')," and argues that installing
    it in the wrapper would risk saving the wrapper's own bundled files and serving a stale one
    back after an app-store update has already replaced them underneath it.
15. **A disagreement, verified directly this session:** the sentence quoted above as this
    mechanism's rule 3 is not what rule 3 actually says in the file that defines it. The real rule
    3, quoted in full in item 5 above, reads: "Everything else same-origin is fetched from the
    network first and cached; the cache answers only when the network does not." One description
    is cache-first; the other, the one actually written and actually running, is network-first
    with a saved copy only as a fallback. The decision itself, not installing this mechanism inside
    the wrapper, still holds even under the correct wording, since the specific danger being
    guarded against (an old file winning over a freshly replaced one) is exactly the situation
    where a network attempt has already failed and the fallback fires; but the sentence offered as
    the reason is a misquote of the mechanism it is citing, stated as a direct quote when it is
    not one.

## What installing it as a PWA actually changes for the user

16. The page declares that when added to a home screen it should open with no browser address bar,
    tab strip or other browser chrome at all, a mode the comment ties directly to the app's own
    design: "this is a camera-first phone app and standalone is the only mode it makes sense in:
    60-odd pixels of browser chrome over a viewfinder is the same 56 pixels of app bar this design
    already refused." This is a declared preference read by the platform at install time, not
    something the app can force; whether a given phone's browser actually honours it for its home
    screen entry was not tested from this machine and would need an actual install on a device to
    confirm.
17. The page also declares a fixed portrait orientation for the installed app. Like the point
    above, this is a declared preference in the same file; platforms differ in whether and how
    strictly they enforce a locked orientation for an installed web app, and that enforcement was
    not tested from this machine.
18. The declared background color and theme color are read by supporting platforms to paint a
    launch screen (built from the app's name, its icon and this color) while the installed app's
    own page is still loading, and to color the parts of the operating system's own interface that
    sit around a running app (a status bar, a task-switcher card). Both colors are the same dark
    color the app's own page uses as its background, stated in the page's own comment as
    deliberate: "the phone's status bar and the desktop tab strip are painted the same colour as
    the app behind them rather than a near-miss." Separately from this, the page repeats an
    equivalent color declaration in a second, older form built specifically for one platform's
    browser rather than the installed-app manifest, and sets the installed app's status bar to sit
    directly over the camera feed rather than above it, which is why the page also asks for the
    screen's full physical area and pads its own content away from the notch and home-indicator
    areas itself. The presence of both the modern, shared declaration and this second,
    platform-specific one in the same page is itself evidence that a single, shared declaration was
    judged insufficient for that platform; the actual rendered result on that platform's home
    screen was not confirmed from this machine.
19. One icon file, in two forms, is declared as the whole visual identity of the installed app: a
    scalable image used for the browser tab, the favicon and the installed icon on platforms that
    accept it, marked safe to be cropped into a circle or a rounded square by a platform that
    insists on one shape, and a fixed-size image in an older, universally supported format kept
    specifically because one platform's browser does not read the scalable form for its home
    screen icon and would otherwise fall back to a screenshot of the page itself, which for this
    app is a black rectangle. Both files were confirmed to exist on disk this session, and an
    automated check already in this codebase separately confirms the same two things checked here:
    that the icon a person would actually see is linked from the page and is present on disk, and
    that the file declaring the installed app's name, starting address, display mode, colors and
    icons contains all of those fields and that every icon file it names actually exists.
20. The file also declares a fixed starting address, a fixed navigation boundary and an explicit
    identity string, all set to the same single value. The identity string exists specifically so
    that a future change to the starting address does not make the platform treat the app as a
    brand new installation; nothing in this session changed that value, so this remains a declared
    intention rather than a behavior confirmed against an actual reinstall.
21. The app is offered in two languages, and a page cannot describe itself in both at once inside
    one file of this kind, since it carries exactly one language tag and one description. The
    app's own solution, confirmed directly in the code, is two nearly identical files, one per
    language, differing only in their language tag and their description text, with a small piece
    of code that rewrites which of the two the page points at every time the app's own language
    setting changes. The product's own name is deliberately not translated between the two: "an
    app that appears under two different names depending on a setting is an app somebody cannot
    find on their own phone." The same code carries an explicit, stated limitation rather than
    silence about it: rewriting which file the page points at does not rewrite an entry a person
    has already added to their home screen, because "the browser re-reads it on its own schedule."
    A person who installs the app in one language and later switches the app's own language setting
    keeps seeing whatever language their home screen icon's name and description were captured in
    at install time, until the browser next re-reads the manifest on its own timing, not the app's.
22. Confirmed absent from both language versions of the file, by reading each one in full rather
    than assuming: no declared list of quick actions reachable from a long-press on the icon, no
    screenshots offered to a richer install prompt, no declared ability to receive content shared
    from another app, no alternate display modes beyond the one declared, and no category tags.
    None of these are described elsewhere as planned; they are simply not present.
23. Confirmed absent from the offline mechanism itself, by reading it in full: no handling of a
    push notification, and no periodic background refresh of anything while the app is closed. Its
    only three jobs are the install, activation and per-request logic already described. Installing
    the app to a home screen does not, by itself, cause it to do anything while it is not open.
24. One further module fires automatically, once, the moment the page has any of this loaded,
    checking whether the exact same page is currently answering "yes" to the platform's own
    standalone-mode check, and folding that single true-or-false fact into the very first analytics
    event the app records for that visit. This is the one place in this layer that itself notices
    and records whether a given visit is happening inside an installed copy or an ordinary browser
    tab; what is done with that record afterward belongs to the app's recording and logging layer
    rather than this one.

## The on-device product pack: what it can answer, and exactly when this layer reaches for it

25. A separate file format, built by the app's own data pipeline and downloaded once per phone
    rather than shipped with the app, holds a large, sorted list of barcodes next to each one's
    name, brand and size, laid out so that a lookup can jump straight to the matching row by
    repeatedly halving the range rather than reading the file in order. Its own comment states
    plainly what it can never do, in words the app repeats to the person using it: "this answers
    what a thing IS, its name, brand, and size, never what it should cost. Prices change weekly
    and only live on the server; a match from this file is never enough to show a verdict on its
    own."
26. This file is kept in the browser's larger, structured storage rather than its small,
    string-only one, and the comment gives the concrete reason: the file does not fit in the
    smaller storage's own five-to-ten-megabyte limit, and that smaller storage is synchronous,
    which would freeze the page while the camera is running. The same comment states, and the code
    is written to match, that this storage is not guaranteed to survive: a private browsing
    window, a person clearing their own site data, or a browser deciding to reclaim space from an
    origin it judges unused can all empty it at any time, and every function that reads it is
    written to treat a missing or unreadable file as the normal starting state rather than an
    error, falling back to asking the server exactly as a phone that never downloaded the file
    would.
27. **A discrepancy in the stated sizes of this file, verified directly this session by opening
    the actual files on disk rather than trusting any comment:** three different places in the
    code state three different sizes for the same two files (a smaller one covering groceries and
    a larger one covering everything sold in Canada). The pipeline that builds the files logs, in
    its own comment, "6.67 MB raw, 2.47 MB gzip, 1.70 MB brotli" for the grocery file and "77.43
    MB raw, 12.71 MB gzip, 7.47 MB brotli" for the larger one. The module that stores the
    downloaded file states "the 1.7 MB grocery pack and the 7.5 MB national one," opening the same
    sentence by calling the size in question "six and a half megabytes." The module that decides
    which file to fetch states "Grocery, 1.5 MB compressed... The national pack is 6.8 MB." Measured
    directly on the files actually sitting on this machine right now: the grocery file is
    5,628,842 bytes uncompressed (5.37 MB), 2,040,045 bytes gzip-compressed (1.95 MB) and
    1,504,130 bytes brotli-compressed (1.43 MB); the larger file is 44,143,820 bytes uncompressed
    (42.10 MB), 10,869,905 bytes gzip-compressed (10.37 MB) and 6,771,868 bytes brotli-compressed
    (6.46 MB). None of the three quoted figures matches what is on disk today; the two module
    comments are closer to each other and to the file this session actually measured than either
    is to the build pipeline's own logged numbers, which suggests the underlying data was rebuilt
    smaller at some point after that comment was written. Separately, the file is served
    brotli-compressed and a browser decompresses that transparently before the app ever sees the
    bytes, so the copy that actually ends up sitting in the phone's storage is the larger,
    uncompressed size (5.37 MB and 42.10 MB), not the compressed download size either comment
    compares it against; the conclusion both comments reach, that this does not fit in the
    smaller, five-to-ten-megabyte storage, still holds either way, but the specific numbers offered
    as the reason describe the download, not the thing actually being stored.
28. **A second disagreement, verified directly this session:** the module that defines how this
    file is actually served by the app's own server carries its own comment stating in capital
    letters that it is "NOT WIRED IN," explaining that the server file itself was, at the time that
    comment was written, held open by somebody else's work-in-progress, and instructing whoever
    wires it in later to paste in two specific blocks of routing. Reading the app's actual server
    file directly, this session, shows both of those exact blocks already present and already
    importing this module's own functions, wired in and running. Whether the on-device pack can be
    downloaded at all today depends entirely on this being wired in, and it is; the comment
    describing it as not yet done is stale.
29. The code path that decides what to show for a scanned barcode always asks the app's own server
    first, and only afterward considers this on-device file at all. It is asked at exactly one
    point in that sequence: after the request to the server has been attempted and has thrown
    outright, meaning the request never got a response at all. If the server responds and says
    plainly that its own catalogue has never seen this barcode, the app accepts that as the answer
    and never checks this on-device file, even though the file might contain that exact product;
    the file is only ever asked when there was no answer from the server to accept or reject in the
    first place. In practice this should rarely matter, since the on-device file is built from the
    same underlying data the server's own catalogue is, but the two are separate files updated on
    their own schedules, and nothing read this session enforces that they are ever rebuilt or
    deployed together.
30. Fetching a fresh copy of this file is deliberately not attempted at the moment a person opens
    the app, or at the moment a barcode is scanned. It waits for a moment the browser itself
    reports as idle, so a large download never competes with the same connection the very next
    scan needs; it checks a small, separate piece of information first (whether the version on the
    server has changed at all) before ever downloading the full file again; and it does nothing at
    all if the phone has told the browser to conserve data, with the comment stating "a person who
    has told their phone to spend less has already answered this question, and asking them again in
    a modal is not respect."
31. A dated, named incident sits in this same file's own comment: the request that checks for and
    downloads this file was written before the app added a requirement that every request to its
    server carry a specific access code, so on the app's beta server that request was refused
    outright and the file never downloaded at all, "seen 2026-09-14 in the access log." The code
    was fixed to attach that access code to these requests specifically because of that observed
    failure.

## Two more places a lost network is not a lost action

32. A price correction a person types is written to the phone's own storage the instant it is
    submitted, before any attempt is made to send it anywhere, and the screen tells the person it
    is recorded because, at that point, it already is. Sending it to the server is attempted
    immediately afterward, but never in a way the screen waits on: the comment states plainly that
    a screen which waits and then shows an error "because a supermarket has no signal has turned a
    working feature into a broken-looking one." Sending is retried from the start of the app every
    time it opens, and again after every new correction is typed, walking whatever is still
    unsent in the order it was recorded, and stopping at the very first one that cannot reach the
    server at all, on the reasoning that if the network could not deliver one, it cannot deliver
    the next one either right now. A correction the server actively looks at and refuses is still
    marked as done, with its refusal reason kept, specifically so it is not retried forever; only a
    correction the network never delivered at all stays pending.
33. A photo taken of a price tag is handled by a second, separate durable queue, kept in the same
    kind of structured phone storage as the product file above rather than the smaller, string-only
    kind, because a photo is large binary data that storage cannot hold efficiently. This queue's
    own comment states its purpose as a decision, not a default: "a capture is written to durable
    storage the moment it is taken, before any network call, and only removed once something has
    come back for it," reasoning that a photo lost in a signal-dead aisle is not something a person
    can simply retake, because by the time the network returns they have already walked away from
    what they photographed.
34. **A disagreement between that stated decision and what the code that actually calls it does,
    verified directly this session:** the screen that handles a photo capture does not write it to
    durable storage first. It attempts to send the photo to the server immediately, and only writes
    it into the durable queue afterward, inside the branch that runs when that attempt has already
    failed or the server has answered that it could not be reached. The durable copy this queue
    exists to guarantee, in the queue's own stated words, "before any network call," is in the
    running code made only after one has already been made and has already failed. This leaves
    exactly the gap the decision was written to close: a phone that loses power, has its app
    suspended by the operating system, or has the app closed by the person while that first attempt
    is still in flight has nothing saved anywhere for that photo, because the only save the code
    performs happens after that attempt is known to have failed, not before it starts.
35. **A related, separate finding, also verified directly this session:** the function that sends a
    photo to the server reports a single outcome, labelled "offline," for three different
    situations it does not otherwise distinguish: the request never left the phone at all, the
    request came back with a response this function was not written to expect, or the request came
    back with any server error status it does not already have a specific name for. Its own
    comment states this is deliberate, so that a real photo is never thrown away over an error
    nobody named. The barcode identification path used elsewhere in the app has the same shape for
    an unrelated reason: the function it calls raises an error for any server response that is not
    a plain success, and the code calling it treats every such error identically to a genuine loss
    of signal, falling back to the on-device product file either way. In both paths, the words the
    person is actually shown on screen say plainly that there is no signal, specifically because
    the phone already had an answer saved and the network did not. If the true cause in a given
    case were a working server actively returning an error rather than an absent signal, the person
    would still be told, in the app's own words, that there is "no signal," which is a specific and
    confident claim about a cause the app did not actually check. This sits directly against the
    standard this same layer states for itself elsewhere, quoted in item 1 above, about what "the
    worst kind of wrong answer this product can give" looks like. Nothing read this session
    resolves which of the two, the convenience of one shared fallback path or the precision of
    naming the real cause, is meant to win; both sides are stated here rather than settled either
    way.
