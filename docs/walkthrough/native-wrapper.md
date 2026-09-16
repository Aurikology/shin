# The native phone wrapper

This section covers how the same web app that runs in a browser also becomes an installable
iPhone and Android app, and what a second, native-only camera path adds on top of the ordinary
browser camera call. It matches the grain of the barcode-scan-to-verdict section, the calibration
example for the full walkthrough. Every claim below was checked directly against the actual
project files and the actual installed supporting packages during the session that wrote it
(2026-09-15); none of it came from memory or from a plan alone without also checking what is
really sitting on disk.

## Turning the same web code into something installable

1. The wrapped app is not a rewrite. One existing web app is the only source of what a person
   sees and touches; a separate small wrapper project sits next to it and does nothing but carry
   a copy of it into two real native application projects, one for each phone platform.
2. That wrapper project is currently built around two placeholder identity values, a display name
   and a package identifier, and neither is final. A trademark check on the real name is still
   running elsewhere. Every place either placeholder value appears across both platform projects
   is written down together in one table specifically so that clearing the name later is a small,
   countable number of one-line edits rather than a search through the project. Confirmed
   directly: eight separate places currently hold one or the other placeholder.
3. Getting the web app's own files into the wrapper is one script's whole job. It copies the
   entire web app, wholesale, into a second folder that exists only inside the wrapper project,
   deletes and rebuilds that folder fresh every time it runs, and is never checked into the
   project's own history because it is pure build output. Into that copy, and only into that copy,
   it inserts one small block of code, placed immediately before the web app's own main script
   tag so it always runs first. That inserted block sets three values as soon as the page loads:
   the web address of the real server this particular build should talk to, an invite code that
   server requires, and a single on-or-off switch for the native camera path described below.
   Confirmed directly: the original web app's own start-up page is never touched by any of this;
   only the throwaway copy is edited, every time, from a clean copy.
4. Those three values all come from one small settings file, and that file is the only thing that
   has to change to point a whole build at a different server. Checked directly against that file
   as it stands today: none of the three values are real yet. The server address is a placeholder
   string that is not a working address at all, marked in the file's own comment as waiting on a
   hostname the founder has not chosen yet; the invite code is the same kind of placeholder; and
   the camera-path switch is off.
5. Once that copy exists, a second and separate tool, Capacitor's own command-line sync step,
   copies it again into the two platform-native projects. Those two projects were generated once,
   earlier, by adding each platform to the wrapper, and each is a real, ordinary native
   application project built with that platform's own tools, not a browser shortcut or a website
   dressed up to look like an app.
6. Checked directly against both platform projects: each one is almost entirely generated
   scaffolding wrapped around a single screen. The Android side's own entry point is one class
   with no body at all beyond inheriting everything it needs from a base class Capacitor provides.
   The iOS side is two small startup files whose only real job, between them, is to construct one
   full-screen native view, also provided by Capacitor, and show it. Neither platform has a second
   screen anywhere in the project; the entire installed app, on both platforms, is that one view.
7. That one view is an embedded web-page renderer, the same kind of native building block any
   native app can use to show a web page inside itself, pointed at the copy of the web app that
   was just placed into the project. Confirmed directly from the wrapper's one configuration file:
   both platforms are told to present that embedded copy as though it were being served from an
   address literally named "localhost" over what looks like a secure, https connection, rather
   than from a bare local file address.
8. That specific choice is deliberate and has a stated, documented reason, not a default left
   alone. Checked directly against Capacitor's own written documentation for that setting: the
   iOS platform's own default for it is a different address form entirely, one that does not look
   like a network address at all, and this project explicitly overrides that default to the
   https, localhost form instead. The reason given, in Capacitor's own words, is that browsers,
   including the one embedded inside a native shell, only grant some privileged features, camera
   access among them, to a page they consider loaded from a secure context, and a bare local file
   is not treated as one, while a page that looks like it is being served from "localhost" over
   https is. This is the same reasoning the project's own rollout plan gives, in its own words, for
   this exact setting.
9. Each platform's own permission system is told in advance, once, inside each project's own
   permission declaration, that the app may ask for the camera. Android's declaration is paired
   with a hardware requirement that the device have a camera at all, and the comment written
   directly on that declaration states plainly why the permission line has to be there: without
   it, the embedded browser's own in-page camera prompt fails silently, asking the user nothing,
   rather than actually offering to grant access. On iOS, the sentence a person actually reads the
   first time the app asks for the camera is deliberately generic, naming only "this app" rather
   than the product, sourced directly to the fact that the product's real name has not cleared
   trademark review and is not to appear anywhere yet.
10. Turning either native project into something a phone can actually install means running that
    platform's own separate build toolchain on top of everything above, and this is where the
    real, checked state of each platform diverges sharply. Sourced to a written record of the
    actual commands attempted and their actual results, most of it from a session run on each of
    the two machines involved, not from this one:
    - Android can build entirely on the same Windows machine this session ran on, no company
      account and no payment needed anywhere in the process, but as of the most recent check on
      that machine two ordinary prerequisites, a Java installation and Android's own software
      development kit, are both still missing, so the two commands that would actually produce an
      installable file have not been run to completion yet.
    - iOS cannot be attempted from a Windows machine at all, because Apple's own build tool only
      runs on Apple's operating system. On the Mac that is available, a check already run there
      found no full copy of that build tool installed, only its bare command-line pieces, and
      zero code-signing identities of any kind. Both block everything past that point, and both
      are things only the founder can do: signing into an Apple account and completing a
      multi-gigabyte download for the first, enrolling in a paid developer program for the
      second.
    - What has actually succeeded anywhere, sourced to that same written record: installing the
      wrapper's own supporting packages, generating both native projects from a clean state, and
      one successful run of the copy-and-inject script described above. Nothing beyond that has
      run to completion on either platform.
11. **Open item, not resolved by anything read.** The wrapper project's own plain dependency
    list, the file meant to state exactly which supporting packages the project needs so that a
    fresh copy of the project can reinstall them, currently lists none at all. Checked directly,
    side by side: the project's separate lock file, generated the same day, records six named
    packages with exact version numbers, and those same six packages are in fact sitting installed
    on disk right now. A fresh checkout that trusted only the plain dependency list, rather than
    the disk state or the lock file, would not know to install any of them. Nothing read explains
    the gap or says which of the two files is the mistake; this stays open.

## What the native camera path is for, and what it actually does

12. The reason this second camera path exists at all is stated directly in that path's own
    written reasoning, and it is a narrow, specific one. Inside the embedded web-page renderer
    described above, the same call a mobile browser uses to ask for a live camera stream can fail
    in situations where an ordinary phone browser, Safari or Chrome, would have succeeded, because
    some embedded renderers of this kind restrict script-level camera access more tightly than a
    full browser does. The web app already has a fallback for that call failing at all: a drawn,
    simulated shelf, standing in for a camera. That fallback is the right answer for a device that
    genuinely has no camera, a desktop machine or a denied permission, but the wrong answer for a
    device that has a perfectly good camera which the embedding renderer simply refused to hand
    over. The native camera path is a second fallback, specifically for that second case: reach
    the real hardware through two purpose-built native add-ons instead of going through the
    embedded renderer's own camera call at all.
13. This problem, and therefore this whole second path, is specific to being wrapped this way.
    Confirmed directly from the project's own written comparison of the two ways a phone can end
    up with this app: a phone that instead adds the plain hosted website to its home screen
    through Safari runs the real Safari engine underneath, not this wrapper's embedded renderer,
    so the browser-blocks-the-camera problem this path exists for does not arise there at all, and
    correspondingly there is no native fallback available in that mode either, because there is no
    native shell for it to fall back into. The two native add-ons this path depends on are simply
    not reachable outside an installed native build.
14. One single switch, read from the same settings file described above, decides whether this
    second path is even considered at all; it is off by default today. The check for that switch
    also independently confirms, every time, that the app is genuinely running as an installed
    native app and not inside an ordinary mobile browser, specifically so this path can never fire
    by accident for someone using the plain hosted website, where the drawn-shelf fallback is
    already the correct and only answer. Confirmed directly: that native-or-not check is a real,
    documented capability of the underlying native framework itself, not something invented for
    this project; it works by asking the framework what platform it is currently running as and
    treating anything other than a plain web page as native.
15. **Planned and not built at all, stated plainly in the native camera module's own comments and
    independently confirmed by reading the calling code itself.** None of this second path is
    actually reachable from inside the app today. It exists as three self-contained functions
    sitting next to the app, each one written and each one testable on its own, but nothing in the
    web app's own camera screen or camera-control code currently checks the switch or calls into
    any of the three functions. A direct search of that screen's own text and that control code's
    own text turns up no mention of the switch or of any of the three functions anywhere in
    either. Wiring this in means adding one short check at each of three exact points that already
    exist in the running web app today: where it first asks the browser for a camera stream at
    all, where it turns the flashlight on or off, and where it grabs a single still frame from the
    live picture for the photo-based lookup path. That is described as a small change belonging to
    someone else's area of this project, reported here rather than made here, and until it happens
    the entire mechanism below is inert no matter how the switch is set.
16. The barcode function first asks the barcode add-on whether this specific device can scan
    barcodes at all. If that check passes, it then checks the phone's own camera permission and,
    if the phone has neither granted nor denied it yet, asks the operating system for it. Only
    after both of those pass does it open that add-on's own ready-made, full-screen scanning
    interface and wait for either a decoded result or a cancellation. On a decode, it hands back
    the decoded text together with which barcode format it was.
17. The photo function asks a second, separate native add-on, a general camera add-on rather than
    the barcode-specific one, to open the device's own camera capture screen, and hands back the
    picture in the same shape the web app's own frame-grabbing code already produces from a live
    video element, so nothing downstream has to know or care which of the two paths a given
    picture actually came from.
18. The torch function turns the device's flashlight on or off through the barcode add-on
    specifically, never through the general camera add-on, because whichever add-on currently
    holds the camera hardware during a native scan is the only one able to control the torch, and
    the general camera add-on used for the photo function has no torch control of its own at all.
    It reports back only whether the attempt worked, the same true-or-false contract the web app's
    own browser-based torch control already uses, where turning the torch on or off works by
    adjusting a live setting on the browser's own camera connection and simply, quietly fails if
    there is no such connection to adjust, exactly the situation once a native scan is running
    instead, with no browser-visible video connection at all for the browser path to reach.
19. **A concrete defect found, not assumed, verified directly against the installed barcode
    add-on's own written definition of what it returns.** The very first check the barcode
    function makes, whether the device can scan at all, reads its answer out of that add-on's
    response using a label the add-on's own definition does not contain. The add-on defines
    exactly one field in that response, named differently from the one this code asks for. That
    mismatch means the value this code actually receives back from that check is always empty,
    which the following line always treats as false, and the barcode function is written so that
    a false result there means immediately giving up, before it ever checks camera permission or
    tries to open the scanner, and reporting that scanning is unsupported. As written today, this
    function cannot succeed on any device, capable of scanning or not, purely because of that one
    mismatched label.
20. **A second concrete gap, verified directly against the same add-on's own published usage
    instructions, not assumed.** On Android specifically, that add-on's own documentation states
    plainly that its ready-made scanning interface additionally needs one downloadable component
    from the operating system's own services layer to already be present on the device, and
    instructs whoever calls it to check for that component and start installing it first, before
    ever opening the scanning interface. The barcode function here does neither of those two
    things; once the first defect above is imagined fixed, it would still go straight from the
    capability check to opening the scanning interface. On a device where that downloadable
    component has never been fetched, the add-on's own documented behavior is that this would not
    produce a working scanner.
21. **Open item, not resolved by anything read.** The project's own rollout plan separately states
    that two supporting files the barcode-and-object-detection code loads at start-up, a decoding
    engine and a detection model, need to be made to load relative to the bundled copy of the app
    rather than relative to whatever site the page currently thinks it is on, specifically so they
    keep resolving once the app is no longer being served from the real website at all. Checked
    directly: both of those files are still referred to today by an address anchored to the page's
    own root, exactly the form the plan called out as needing to change. Whether this is still a
    live problem is not settled by reading alone. The same local-address choice described above,
    that both platforms present the bundled copy as though its own root were "localhost" itself,
    would make an address anchored to that root and an address anchored to the bundle the same
    address, which would mean nothing further is actually needed here. But nothing checked in this
    session actually loads that bundled copy inside an installed native shell to confirm those two
    files resolve in practice, and the one checklist built specifically to catch a failure here,
    which includes a barcode-scan check on a real installed build for each platform, is still
    entirely blank, because no phone has been available in any session run on this so far. This
    stays open until that checklist line is actually run on a real device.
22. State labels, plainly, for everything above. Built and matching what the rollout plan called
    for: the copy-and-inject build step, both native projects existing with their permission
    declarations in place, and the choice to present the bundled copy over a local https address
    for camera access. Built as code but verified broken for the reason given: the barcode
    function of the native camera path, both the mismatched-label defect and the missing
    module-install step on Android. Built as code with no defect found against it, but never run
    on a real device to confirm: the photo function and the torch function. Planned and not built
    at all: wiring any of the three functions into the web app's own camera screen, so that today
    the entire native camera path is unreachable regardless of the on-off switch's setting or
    whether the two defects above are ever fixed. Blocked on ordinary, no-cost, already-identified
    prerequisites rather than on any defect in anything written: an installable Android build.
    Blocked on the founder's own accounts and installs rather than on anything written here at
    all: an installable iOS build.
