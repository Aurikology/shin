# Screen tags

Every page, screen, sheet, modal and overlay has a short permanent tag, so a report can say "on a12 the button is wrong". The source of truth is `app/public/js/screen-tags.js`; this file is the readable copy of it and `app/test/screen-tags.test.mjs` fails if the two disagree.

## Rules

- Tags are permanent. Never renumber and never reuse one. A new screen takes the next free number (the one after the last row below).
- Tags run a1 to aN with no gaps. A screen that is deleted keeps its row and is marked `retired: true` in the registry.
- A tag can be a whole screen, a state of one (empty, error), a sheet over the camera, a modal, or an overlay. A sheet that opens in stages has one tag per stage.
- To add one: add an entry at the bottom of `screen-tags.js` (with `route`, and a `sel` selector when the screen shares a route), add its row here, and run the tests. The test fails until both are done.

## Turning the badge on

The badge is a tiny low-contrast tag in the top right corner, above every sheet, that never takes a tap and never animates. It is hidden by default.

- Open the app with `?tags=1` to switch it on and `?tags=0` to switch it off. The choice is remembered on that device.
- Or open You, scroll to the bottom, and use the Show screen tags switch in the Developer row.
- The static plan pages (a77 to a80) and the JavaScript-off page (a76) cannot draw a badge because they have no script. Their tags are names for chat only.
- If a screen shows `a?` it has no entry in the registry yet.

## The tags

### Launch flow: welcome, setup, consent

| Tag | Name | How to reach it | File |
| --- | --- | --- | --- |
| a1 | Welcome, the SHIN name | Very first launch of a fresh install. Or ?s=onboarding&step=welcome. | `app/public/js/screens/onboarding.js` |
| a2 | Welcome, the one-line promise | Welcome flow, Continue from a1. | `app/public/js/screens/onboarding.js` |
| a3 | Welcome question: where do you shop most | Welcome flow step 3 (pick all that apply). | `app/public/js/screens/onboarding.js` |
| a4 | Welcome question: how often per week | Welcome flow step 4. | `app/public/js/screens/onboarding.js` |
| a5 | Welcome question: main shopping priority | Welcome flow step 5. | `app/public/js/screens/onboarding.js` |
| a6 | Welcome question: where did you hear about us | Welcome flow step 6. | `app/public/js/screens/onboarding.js` |
| a7 | Welcome question: tried other price apps | Welcome flow step 7. | `app/public/js/screens/onboarding.js` |
| a8 | Welcome: savings trend chart | Welcome flow step 8. Hidden until a measured savings_trend is published in onboarding-flow.js. | `app/public/js/screens/onboarding.js` |
| a9 | Welcome question: percent or dollar deal threshold | Welcome flow step 9. | `app/public/js/screens/onboarding.js` |
| a10 | Welcome: set your deal threshold slider | Welcome flow step 10. | `app/public/js/screens/onboarding.js` |
| a11 | Welcome question: loyalty programs and coupon apps | Welcome flow step 11. | `app/public/js/screens/onboarding.js` |
| a12 | Welcome question: primary goal with SHIN | Welcome flow step 12. | `app/public/js/screens/onboarding.js` |
| a13 | Welcome: monthly savings target stepper | Welcome flow step 13. | `app/public/js/screens/onboarding.js` |
| a14 | Welcome question: how aggressive deal alerts are | Welcome flow step 14. | `app/public/js/screens/onboarding.js` |
| a15 | Welcome: a smarter way to shop (comparison) | Welcome flow step 15. | `app/public/js/screens/onboarding.js` |
| a16 | Welcome question: biggest shopping frustration | Welcome flow step 16. | `app/public/js/screens/onboarding.js` |
| a17 | Welcome: your savings potential | Welcome flow step 17. Hidden until a measured savings_timeline is published. | `app/public/js/screens/onboarding.js` |
| a18 | Welcome: thank you for trusting us | Welcome flow step 18. | `app/public/js/screens/onboarding.js` |
| a19 | Welcome: join other smart shoppers, rating and reviews | Welcome flow step 19. Hidden until a measured shopper count is published. | `app/public/js/screens/onboarding.js` |
| a20 | Welcome: setting up your deal engine | Welcome flow step 20 (checklist that ticks itself). | `app/public/js/screens/onboarding.js` |
| a21 | Welcome: your savings goal progress | Welcome flow step 21. Hidden until a measured goal_progress is published. | `app/public/js/screens/onboarding.js` |
| a22 | Welcome: save your progress, sign in | Welcome flow step 22. Hidden until accounts exist (CAPABILITIES.accounts in onboarding-flow.js). | `app/public/js/screens/onboarding.js` |
| a23 | Welcome: try SHIN Pro for free | Welcome flow step 23. | `app/public/js/screens/onboarding.js` |
| a24 | Welcome: camera and location permissions | Welcome flow step 24. Tapping the camera switch raises the phone's own permission prompt. | `app/public/js/screens/onboarding.js` |
| a25 | Welcome: plans, 3-day free trial | Welcome flow step 25 (annual or monthly, Not now). | `app/public/js/screens/onboarding.js` |
| a26 | Welcome tip: get the best scan | Welcome flow step 26. | `app/public/js/screens/onboarding.js` |
| a27 | Welcome tip: SHIN evaluates your item | Welcome flow step 27. | `app/public/js/screens/onboarding.js` |
| a28 | Welcome tip: adjust shelf price or store | Welcome flow step 28. | `app/public/js/screens/onboarding.js` |
| a29 | Welcome tip: for highest accuracy | Welcome flow step 29. Continue goes to Evaluating Deal (a84). | `app/public/js/screens/onboarding.js` |
| a30 | Pick your Shin (attitude and your three price ranges) | First launch after the welcome flow, once. Or ?s=setup. | `app/public/js/screens/setup.js` |
| a31 | Your data (photos and location switches) | First launch after setup, once. Or ?s=consent. | `app/public/js/screens/consent.js` |

### Camera and verdict

| Tag | Name | How to reach it | File |
| --- | --- | --- | --- |
| a32 | Camera, barcode mode (where the app opens) | Cold start once setup and consent are done. Or tap Barcode on the mode switch. | `app/public/js/screens/camera.js` |
| a33 | Camera, barcode found, Scan barcode button showing | In barcode mode, hold a barcode in the frame until the reader agrees on it. | `app/public/js/screens/camera.js` |
| a34 | Camera, Price Tag mode (shutter button) | Tap Price Tag on the mode switch above the shutter. | `app/public/js/screens/camera.js` |
| a35 | Camera with no live feed (drawn shelf instead) | Camera permission denied, no camera on the device, a private window, or a desktop without one. | `app/public/js/screens/camera.js` |
| a36 | Camera, frame frozen while Shin reads it | Just after the shutter or Scan barcode button, before any sheet rises. | `app/public/js/screens/camera.js` |
| a37 | Working sheet, the three-step wait | After a scan is identified and the price request is under way. The x cancels. | `app/public/js/screens/camera.js` |
| a38 | Verdict sheet, first look (word and price) | A scan Shin can call. This is where the sheet lands. | `app/public/js/screens/camera.js` |
| a39 | Verdict sheet, half open (rail, why, correct and share) | Verdict sheet, tap or drag the grabber up once. | `app/public/js/screens/camera.js` |
| a40 | Verdict sheet, fully open (Shin's lines, thumbs, Done) | Verdict sheet, tap or drag the grabber up twice. | `app/public/js/screens/camera.js` |
| a41 | Thanks toast after the thumbs, with Undo | Verdict sheet fully open, tap thumbs up or thumbs down. | `app/public/js/screens/camera.js` |
| a42 | Refusal sheet, first look (Shin will not call this) | A scan Shin will not price: not sure which one, category not supported, nothing recognised, too little evidence, or the reader is down. | `app/public/js/screens/camera.js` |
| a43 | Refusal sheet, half open (evidence and cheaper swaps) | Refusal sheet, tap or drag the grabber up. | `app/public/js/screens/camera.js` |
| a44 | Needs a connection sheet (scan with no signal) | Scan while the phone is offline. The sheet is also exported as needsConnectionSheet. | `app/public/js/screens/camera.js` |
| a45 | Going rate card, first look (range, no shelf price typed) | Scan an item and skip the shelf price on the price pad. | `app/public/js/screens/camera.js` |
| a46 | Going rate card, half open (the sellers behind the range) | Going rate card, tap or drag the grabber up. | `app/public/js/screens/camera.js` |
| a47 | Which one is it? (stand-in item list) | A scan where Shin has to ask which item it is, from the stand-in list. | `app/public/js/screens/camera.js` |
| a48 | Not this? (other search results) | On the price pad tap the not-this link, or the same offer after a photo search. | `app/public/js/screens/camera.js` |
| a49 | Price pad (type the shelf price) | After the shutter or Scan barcode button, or Tell me the price on the going rate card. From a refusal, the price-only button opens it with a name field. | `app/public/js/screens/camera.js` |
| a50 | Which shop are you in? (store picker) | Price pad, tap the shop row. | `app/public/js/screens/camera.js` |
| a51 | Price written down card (price saved with no verdict) | Refusal sheet, tap the price-only button, type a price (and a name if you like), confirm. | `app/public/js/screens/camera.js` |
| a52 | Type what it is (name the item) | Refusal sheet, tap Type what it is. | `app/public/js/screens/camera.js` |
| a81 | Camera, Manual Search mode (no viewfinder control) | Tap Manual Search on the mode switch. The name field opens at once as a52; close it and this is what is left. | `app/public/js/screens/camera.js` |
| a82 | Answer sheet with your earlier prices (price history chart) | Half open answer sheet for an item you have scanned with a typed price at least twice before. Absent otherwise. | `app/public/js/screens/camera.js` |
| a83 | Price pad with the good-price or better-buy choice | The price pad right after a scan (barcode, Price Tag or Manual Search). Flip between Is this a good price and Find a better buy. | `app/public/js/screens/camera.js` |

### Saved, Past scans, Recently removed

| Tag | Name | How to reach it | File |
| --- | --- | --- | --- |
| a53 | Saved (the list) | Tap Saved in the camera bar or any page bar. | `app/public/js/screens/watchlist.js` |
| a54 | Saved, nothing saved yet | Open Saved before saving anything. | `app/public/js/screens/watchlist.js` |
| a55 | Saved, could not be read (Try again) | Open Saved when the stored data is unreadable or storage is blocked. | `app/public/js/screens/watchlist.js` |
| a56 | Saved item detail, with its scan (read only) | Saved, tap a row that still has its scan in Past scans. | `app/public/js/screens/watchlist.js` |
| a57 | Saved item detail, saved facts only | Saved, tap a row whose scan is gone from Past scans. | `app/public/js/screens/watchlist.js` |
| a58 | Past scans (the list) | Saved, then the Past scans link. Or ?s=pastscans. | `app/public/js/screens/pastscans.js` |
| a59 | Past scans, nothing scanned yet | Open Past scans before any scan. | `app/public/js/screens/pastscans.js` |
| a60 | Past scans, could not be read (Try again) | Open Past scans when the stored data is unreadable or storage is blocked. | `app/public/js/screens/pastscans.js` |
| a61 | Past scan detail, a verdict (read only) | Past scans, tap a row that was a verdict. | `app/public/js/screens/pastscans.js` |
| a62 | Past scan detail, a refusal (read only) | Past scans, tap a row that Shin refused. | `app/public/js/screens/pastscans.js` |
| a63 | Recently removed (the list) | Saved page, the Recently removed link. Or ?s=removed. | `app/public/js/screens/removed.js` |
| a64 | Recently removed, nothing removed | Open Recently removed with nothing in the last 30 days. | `app/public/js/screens/removed.js` |
| a65 | Recently removed, could not be read (Try again) | Open Recently removed when the stored data is unreadable or storage is blocked. | `app/public/js/screens/removed.js` |

### You, market, sources, correction, share

| Tag | Name | How to reach it | File |
| --- | --- | --- | --- |
| a66 | You (settings, data, language) | Tap You in the camera bar or any page bar. Or ?s=you. | `app/public/js/screens/you.js` |
| a67 | Where do you shop? (country picker) | You, tap the market row. Or ?s=market. | `app/public/js/screens/market.js` |
| a68 | Where this comes from (data sources list) | Where do you shop, tap the sources link at the bottom. Or ?s=licences. | `app/public/js/screens/licences.js` |
| a69 | Where this comes from, loading | Open the sources page; visible while the list is being fetched. | `app/public/js/screens/licences.js` |
| a70 | Where this comes from, could not load (Try again) | Open the sources page with no signal or when the server answers with an empty list. | `app/public/js/screens/licences.js` |
| a71 | Tell Shin the price (correction form) | Verdict half sheet, Correct it. Or a refusal sheet, Tell me the price. Or You, Report a wrong price. | `app/public/js/screens/correct.js` |
| a72 | Tell Shin the price, thank-you state | Submit a price on the correction form; it returns to the camera after a moment. | `app/public/js/screens/correct.js` |
| a73 | Share (the card image) | Verdict half sheet, Share. Needs a verdict in Past scans. | `app/public/js/screens/share.js` |
| a74 | Share, card drawn as plain text | Share when the card image cannot be drawn (fonts or canvas fail). | `app/public/js/screens/share.js` |

### Full-page states outside any screen

| Tag | Name | How to reach it | File |
| --- | --- | --- | --- |
| a75 | This screen could not open (render failure page) | Any screen whose render throws. Shows a Back to camera button. | `app/public/js/router.js` |
| a76 | Shin cannot open (JavaScript off) | Open the app with JavaScript switched off. No badge can draw here: the badge is script. | `app/public/index.html` |

### The plan pages (static files, name only)

| Tag | Name | How to reach it | File |
| --- | --- | --- | --- |
| a77 | Page: The Terminating Loop (master plan) | Open the file. No badge is drawn. | `pages/shin-terminating-loop.html` |
| a78 | Page: First Scan to Habit (walkthrough) | Open the file. No badge is drawn. | `pages/shin-walkthrough.html` |
| a79 | Page: The Hard Dozen | Open the file. No badge is drawn. | `pages/shin-hard-dozen.html` |
| a80 | Page: The Correcting Build | Open the file. No badge is drawn. | `pages/shin-build-plan.html` |
| a84 | Welcome: Evaluating Deal (progress bar, last welcome step) | Welcome flow step 31, after the four tips. Get started here hands over to setup or the camera. | `app/public/js/screens/onboarding.js` |
| a85 | Savings Overview (recently scanned, measured savings) | You, tap Savings overview. Or ?s=savings. | `app/public/js/screens/savings.js` |
| a86 | Savings Overview, nothing scanned yet | Open Savings overview on a device with no scan history. | `app/public/js/screens/savings.js` |

## Not tagged, with reason

| What | Why it has no tag |
| --- | --- |
| app/public/index.html (the shell) | It holds one empty container that the router fills. Every visible state of it is a screen above, and its only own state, JavaScript off, is a76. |
| Verdict tiers and confidence levels (good, fair, walk, unknown) | The same sheet with different words and colour, not a different screen. They share the detent tags a38 to a40. |
| Refusal reasons (unsure, category, no match, thin evidence, reader down) | The same sheet with a different sentence, so they share a42 and a43. The offline one has its own tag, a44, because it has its own markup. |
| Verdict just saved acknowledgement (acked variant) | A line inside the verdict sheet, not a different view. |
| Shin's docked face and its hints (aim hint, torch note, second-visit callback) | A caption on the camera, not a screen. It sits inside a32 to a36. |
| Eye marks over the feed (other-object buttons, barcode read mark) | Drawn on the camera surface, part of a32 to a35. |
| You screen inner blocks (coverage failed, scan log, storage not kept line) | Inline sections of a66 that appear and vanish; nothing else on the page changes. |
| Consent, setup and market storage-not-kept line | One inline sentence added to a screen that is already tagged. |
| The list-screen "loading" state on Saved, Past scans, Recently removed | Coded but unreachable: phase is never set to loading. If a path that sets it is added, give it tags then. |
| Share with no scan to share | It redirects to the camera at once, so nobody lands on it. |
| Onboarding replay (Watch the welcome again) | Runs the same 30 steps with ?replay=1, so a1 to a29 and a84 cover it. |
| Row-delete confirm state on Recently removed (Tap again) | A button changing its label, not a view. |
| The bottom page bar and the back button | Chrome on tagged screens, not screens. |
| The phone's own permission prompts (camera, location) and share sheet | Drawn by the operating system, not by this app; the app cannot tag them. |
| The tag badge itself | It is the developer overlay being described. |
| Route announcement live region | Invisible, for screen readers. |
| identify/, spine/, price/, catalogue/ and native/ folders | Server, data and native-wrapper code with no screens of their own; the wrapper loads this same app. |
| docs/design and other repo documents | Markdown notes in the repo, not app pages. Only the four HTML files in pages/ are tagged (a77 to a80). |
