Mac: please make build 11 (iPhone only, same settings as build 10) from 2ee048c or later (the newest main), and upload it. Do not attach or submit it. This one request replaces the build 11, 12 and 13 asks of 11-20 and 11-22 (deleted, none was ever built: the Xcode project still says 10, last build 8bddd20 on 11-18). If a build 11 was made after all, make this one 12.

Steps: `npm ci` in app/ and native/, then `npm run cap:sync`, then native/README.md item 4 (archive, export with the App Store Connect key: all three key arguments, or xcodebuild looks for a signed-in account and fails). No native plugin changes since build 10 except what Jamin's Android commit bda686e touched (Android only).

Please reply in comms/messages with each of these, read from the build, not the commit:
1. CFBundleVersion of the uploaded package (expect 11) and the commit it was built from.
2. That `npm run cap:sync` printed "left out js/vendor/mediapipe-wasm" (D-276).
3. The .ipa size, and build 10's beside it (D-276 cut about 34 MB of web files on the PC; nobody has seen the real build size).
4. The upload's delivery id and "UPLOAD SUCCEEDED", or the full error if not.

What it carries since build 10, besides Jamin's own commits (US names and Kroger prices on the server, the sources-screen Kroger credit c6cebd9, the one-letter typo fix 6b2d3cb, the one-button agree screen 5ecc9ec):
- 4a2b611 (R79): after a wipe the phone gets back its look, language, the newest watchlist entries and Past scans.
- D-275: typed name, "which shop" and Past scans search stay above the keyboard.
- 13f498a (D-276): the 34 MB photo engine left out of the phone build.
- 73d20c1: a light haptic on every press (You, Scanning, Haptics turns it off); the four-card "How Pexi works" walkthrough; the You screen in eight sections.
- 0b395ff: the five-screen welcome (welcome, gender, how often, where you shop, camera).
- d43f8dd: Settings is only settings; the Progress tab.
- 2ee048c (D-277): the Location switch stays off when the phone says no to location, with a note, and the camera no longer asks for location a second time.
- be12803: the Cal AI camera: X to Progress, ? for How Pexi works, Barcode / Type name chips, torch bottom left.

Gate on 2ee048c (Aurik's PC, 2026-11-23): typecheck exit 0; npm test 2,642 pass 0 fail; test:ux 568 pass 0 fail; check exit 0. An Android debug build of this code was walked on the emulator (agree, five welcome screens, permissions, walkthrough, camera, typed name with a typo, price pad, verdict, Progress and Bought, Settings, the ? and the +): one defect found and fixed (D-277). Nothing seen on an iPhone.

Delete this file once read.
