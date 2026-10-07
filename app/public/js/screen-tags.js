/**
 * The screen tags: a short permanent name (a1, a2, ...) for every page, screen,
 * sheet, modal and overlay a person can land on, so the owner can say "on a12
 * the button is wrong" and mean exactly one thing.
 *
 * RULES, AND THE TEST THAT HOLDS THEM (test/screen-tags.test.mjs):
 *
 * 1. Tags are PERMANENT. Never renumber, never reuse. A new screen takes the next
 *    free number. A screen that is deleted keeps its tag with `retired: true` and
 *    stays here, so a number in an old message still points at what it did.
 * 2. Tags are contiguous a1..aN with no gaps. A gap means somebody deleted an
 *    entry instead of retiring it.
 * 3. Every route the router registers, every screen module, every onboarding step
 *    and every sheet class in camera.js has an entry here, or the test fails. The
 *    list of things that are deliberately NOT tagged is at the bottom, with reasons.
 * 4. docs/screen-tags.md is the readable copy of this file. The test fails if the
 *    two disagree, so change both.
 *
 * HOW THE BADGE PICKS A TAG (screen-tag-badge.js). It knows the current route from
 * `#screen[data-screen]`, then asks the DOM which of this route's entries match:
 *
 *   route   which registered screen the entry belongs to ('*' means any route)
 *   sel     a CSS selector, run inside `#screen`. Omitted means "always matches",
 *           which is what a route's base state uses.
 *   rank    higher wins when several match (a sheet over the camera, a modal over
 *           a list). Default 0. Sheets are 40, sheet variants 45, overlays 50 and up.
 *
 * With no match the route's FIRST entry is shown, so a screen never displays a
 * stale tag from the screen before it. A route with no entry at all shows "a?",
 * which is the visible sign that this file is missing a screen.
 *
 * Fields: id (stable dotted name), title (plain words), kind (screen, state,
 * sheet, modal, overlay, static), file (repo-relative source), how (how to reach it).
 * No DOM and no imports here, so a test can read it in Node.
 */

export const SCREEN_TAGS = {
  /* ---------------------------------------------------------------- launch flow */
  /* Welcome flow, onboarding.js. One route, `onboarding`, the step rides in ?step=.
     Numbers 1 to 29 are the owner's own line numbers in his welcome-screen tab.
     Steps marked "hidden until" are in the flow but skipped while their content
     is not real (onboarding-flow.js rule 2 and 3); they get a tag now so the
     number is stable the day they appear. */
  a1: { id: 'onboarding.welcome', title: 'Welcome, the SHIN name', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="welcome"]', how: 'Very first launch of a fresh install. Or ?s=onboarding&step=welcome.' },
  a2: { id: 'onboarding.promise', title: 'Welcome, the one-line promise', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="promise"]', how: 'Welcome flow, Continue from a1.' },
  a3: { id: 'onboarding.shops', title: 'Welcome question: where do you shop most', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="shops"]', how: 'Welcome flow step 3 (pick all that apply).' },
  a4: { id: 'onboarding.frequency', title: 'Welcome question: how often per week', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="frequency"]', how: 'Welcome flow step 4.' },
  a5: { id: 'onboarding.priority', title: 'Welcome question: main shopping priority', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="priority"]', how: 'Welcome flow step 5.' },
  a6: { id: 'onboarding.heard', title: 'Welcome question: where did you hear about us', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="heard"]', how: 'Welcome flow step 6.' },
  a7: { id: 'onboarding.tried', title: 'Welcome question: tried other price apps', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="tried"]', how: 'Welcome flow step 7.' },
  a8: { id: 'onboarding.trend', title: 'Welcome: savings trend chart', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="trend"]', how: 'Welcome flow step 8. Hidden until a measured savings_trend is published in onboarding-flow.js.' },
  a9: { id: 'onboarding.mode', title: 'Welcome question: percent or dollar deal threshold', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="mode"]', how: 'Welcome flow step 9.' },
  a10: { id: 'onboarding.threshold', title: 'Welcome: set your deal threshold slider', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="threshold"]', how: 'Welcome flow step 10.' },
  a11: { id: 'onboarding.loyalty', title: 'Welcome question: loyalty programs and coupon apps', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="loyalty"]', how: 'Welcome flow step 11.' },
  a12: { id: 'onboarding.goal', title: 'Welcome question: primary goal with SHIN', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="goal"]', how: 'Welcome flow step 12.' },
  a13: { id: 'onboarding.monthly', title: 'Welcome: monthly savings target stepper', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="monthly"]', how: 'Welcome flow step 13.' },
  a14: { id: 'onboarding.alerts', title: 'Welcome question: how aggressive deal alerts are', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="alerts"]', how: 'Welcome flow step 14.' },
  a15: { id: 'onboarding.compare', title: 'Welcome: a smarter way to shop (comparison)', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="compare"]', how: 'Welcome flow step 15.' },
  a16: { id: 'onboarding.frustration', title: 'Welcome question: biggest shopping frustration', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="frustration"]', how: 'Welcome flow step 16.' },
  a17: { id: 'onboarding.potential', title: 'Welcome: your savings potential', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="potential"]', how: 'Welcome flow step 17. Hidden until a measured savings_timeline is published.' },
  a18: { id: 'onboarding.thanks', title: 'Welcome: thank you for trusting us', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="thanks"]', how: 'Welcome flow step 18.' },
  a19: { id: 'onboarding.social', title: 'Welcome: join other smart shoppers, rating and reviews', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="social"]', how: 'Welcome flow step 19. Hidden until a measured shopper count is published.' },
  a20: { id: 'onboarding.preparing', title: 'Welcome: setting up your deal engine', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="preparing"]', how: 'Welcome flow step 20 (checklist that ticks itself).' },
  a21: { id: 'onboarding.progress', title: 'Welcome: your savings goal progress', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="progress"]', how: 'Welcome flow step 21. Hidden until a measured goal_progress is published.' },
  a22: { id: 'onboarding.signin', title: 'Welcome: save your progress, sign in', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="signin"]', how: 'Welcome flow step 22. Hidden until accounts exist (CAPABILITIES.accounts in onboarding-flow.js).' },
  a23: { id: 'onboarding.trial', title: 'Welcome: try SHIN Pro for free', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="trial"]', how: 'Welcome flow step 23.' },
  a24: { id: 'onboarding.permissions', title: 'Welcome: camera and location permissions', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="permissions"]', how: 'Welcome flow step 24. Tapping the camera switch raises the phone\'s own permission prompt.' },
  a25: { id: 'onboarding.plans', title: 'Welcome: plans, 3-day free trial', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="plans"]', how: 'Welcome flow step 25 (annual or monthly, Not now).' },
  a26: { id: 'onboarding.tip_scan', title: 'Welcome tip: get the best scan', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="tip_scan"]', how: 'Welcome flow step 26.' },
  a27: { id: 'onboarding.tip_eval', title: 'Welcome tip: SHIN evaluates your item', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="tip_eval"]', how: 'Welcome flow step 27.' },
  a28: { id: 'onboarding.tip_fix', title: 'Welcome tip: adjust shelf price or store', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="tip_fix"]', how: 'Welcome flow step 28.' },
  a29: { id: 'onboarding.tip_accuracy', title: 'Welcome tip: for highest accuracy', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="tip_accuracy"]', how: 'Welcome flow step 29. Continue goes to Evaluating Deal (a84).' },

  a30: { id: 'setup', title: 'Pick your Shin (attitude and your three price ranges)', kind: 'screen', file: 'app/public/js/screens/setup.js', route: 'setup', how: 'First launch after the welcome flow, once. Or ?s=setup.' },
  a31: { id: 'consent', title: 'Your data (photos and location switches)', kind: 'screen', file: 'app/public/js/screens/consent.js', route: 'consent', how: 'First launch after setup, once. Or ?s=consent.' },

  /* --------------------------------------------------------------------- camera */
  /* The camera is one route. Its states and sheets are told apart by what is in
     the DOM, cam[data-state], cam[data-camera] and the sheet class. */
  a32: { id: 'camera.barcode', title: 'Camera (where the app opens)', kind: 'screen', file: 'app/public/js/screens/camera.js', route: 'camera', how: 'Cold start once setup and consent are done. Or ?s=camera. The barcode, camera and keyboard buttons are all showing; there are no mode tabs.' },
  a33: { id: 'camera.barcode.ready', title: 'Camera, barcode found, barcode button lit', kind: 'state', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.cam[data-state="idle"] .scan-code-btn.is-ready', rank: 20, how: 'Hold a barcode in the frame until the reader agrees on it; the barcode button gets a pink ring.' },
  a34: { id: 'camera.photo', title: 'Camera at rest (photo button)', kind: 'state', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.cam[data-state="idle"]', rank: 10, how: 'The camera with nothing under way. Formerly Price Tag mode; the camera button now always takes the price tag photo.' },
  a35: { id: 'camera.nofeed', title: 'Camera with no live feed (drawn shelf instead)', kind: 'state', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.cam[data-state="idle"][data-camera="drawn"]', rank: 30, how: 'Camera permission denied, no camera on the device, a private window, or a desktop without one.' },
  a36: { id: 'camera.framing', title: 'Camera, frame frozen while Shin reads it', kind: 'state', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.cam[data-state="framing"]', rank: 35, how: 'Just after the shutter or Scan barcode button, before any sheet rises.' },
  a37: { id: 'camera.working', title: 'Working sheet, the three-step wait', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.working', rank: 40, how: 'After a scan is identified and the price request is under way. The x cancels.' },
  a38: { id: 'camera.verdict.peek', title: 'Verdict sheet, first look (word and price)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.verdict:not(.gemini):not(.dist)[data-detent="peek"]', rank: 40, how: 'A scan Shin can call. This is where the sheet lands.' },
  a39: { id: 'camera.verdict.half', title: 'Verdict sheet, half open (rail, why, correct and share)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.verdict:not(.gemini):not(.dist)[data-detent="half"]', rank: 40, how: 'Verdict sheet, tap or drag the grabber up once.' },
  a40: { id: 'camera.verdict.full', title: 'Verdict sheet, fully open (Shin\'s lines, thumbs, Done)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.verdict:not(.gemini):not(.dist)[data-detent="full"]', rank: 40, how: 'Verdict sheet, tap or drag the grabber up twice.' },
  a41: { id: 'camera.verdict.toast', title: 'Thanks toast after the thumbs, with Undo', kind: 'overlay', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.toast[data-toast]', rank: 50, how: 'Verdict sheet fully open, tap thumbs up or thumbs down.' },
  a42: { id: 'camera.refusal.peek', title: 'Refusal sheet, first look (Shin will not call this)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.refusal:not(.gemini-failed):not([data-needs-connection])[data-detent="peek"]', rank: 40, how: 'A scan Shin will not price: not sure which one, category not supported, nothing recognised, too little evidence, or the reader is down.' },
  a43: { id: 'camera.refusal.half', title: 'Refusal sheet, half open (evidence and cheaper swaps)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.refusal:not(.gemini-failed):not([data-needs-connection])[data-detent="half"]', rank: 40, how: 'Refusal sheet, tap or drag the grabber up.' },
  a44: { id: 'camera.needsconnection', title: 'Needs a connection sheet (scan with no signal)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.refusal[data-needs-connection]', rank: 45, how: 'Scan while the phone is offline. The sheet is also exported as needsConnectionSheet.' },
  a45: { id: 'camera.goingrate.peek', title: 'Going rate card, first look (range, no shelf price typed)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.goingrate:not([data-detent="half"])', rank: 40, how: 'Scan an item and skip the shelf price on the price pad.' },
  a46: { id: 'camera.goingrate.half', title: 'Going rate card, half open (the sellers behind the range)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.goingrate[data-detent="half"]', rank: 45, how: 'Going rate card, tap or drag the grabber up.' },
  a47: { id: 'camera.candidates', title: 'Which one is it? (stand-in item list)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.candidates .standin-note', rank: 40, how: 'A scan where Shin has to ask which item it is, from the stand-in list.' },
  a48: { id: 'camera.notthis', title: 'Not this? (other search results)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.candidates [data-act="notthis-back"]', rank: 40, how: 'On the price pad tap the not-this link, or the same offer after a photo search.' },
  a49: { id: 'camera.pricepad', title: 'Price pad (type the shelf price)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.padsheet', rank: 40, how: 'After the shutter or Scan barcode button, or Tell me the price on the going rate card. From a refusal, the price-only button opens it with a name field.' },
  a50: { id: 'camera.shoppicker', title: 'Which shop are you in? (store picker)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.shopsheet', rank: 40, how: 'Price pad, tap the shop row.' },
  a51: { id: 'camera.observed', title: 'Price written down card (price saved with no verdict)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.observed', rank: 40, how: 'Refusal sheet, tap the price-only button, type a price (and a name if you like), confirm.' },
  a52: { id: 'camera.textroute', title: 'Type what it is (name the item)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.textroute', rank: 40, how: 'Refusal sheet, tap Type what it is.' },

  /* ------------------------------------------------------------------ the rest */
  a53: { id: 'watchlist', title: 'Saved (the list)', kind: 'screen', file: 'app/public/js/screens/watchlist.js', route: 'watchlist', how: 'Tap Saved in the camera bar or any page bar.' },
  a54: { id: 'watchlist.empty', title: 'Saved, nothing saved yet', kind: 'state', file: 'app/public/js/screens/watchlist.js', route: 'watchlist', sel: '.empty', rank: 10, how: 'Open Saved before saving anything.' },
  a55: { id: 'watchlist.error', title: 'Saved, could not be read (Try again)', kind: 'state', file: 'app/public/js/screens/watchlist.js', route: 'watchlist', sel: '.list-state [data-act="retry"]', rank: 10, how: 'Open Saved when the stored data is unreadable or storage is blocked.' },
  a56: { id: 'watchlist.detail.scan', title: 'Saved item detail, with its scan (read only)', kind: 'modal', file: 'app/public/js/screens/watchlist.js', route: 'watchlist', sel: '.pmodal[data-pmodal="scan"]', rank: 55, how: 'Saved, tap a row that still has its scan in Past scans.' },
  a57: { id: 'watchlist.detail.record', title: 'Saved item detail, saved facts only', kind: 'modal', file: 'app/public/js/screens/watchlist.js', route: 'watchlist', sel: '.pmodal[data-pmodal="record"]', rank: 50, how: 'Saved, tap a row whose scan is gone from Past scans.' },
  a58: { id: 'pastscans', title: 'Past scans (the list)', kind: 'screen', file: 'app/public/js/screens/pastscans.js', route: 'pastscans', how: 'Saved, then the Past scans link. Or ?s=pastscans.' },
  a59: { id: 'pastscans.empty', title: 'Past scans, nothing scanned yet', kind: 'state', file: 'app/public/js/screens/pastscans.js', route: 'pastscans', sel: '.empty', rank: 10, how: 'Open Past scans before any scan.' },
  a60: { id: 'pastscans.error', title: 'Past scans, could not be read (Try again)', kind: 'state', file: 'app/public/js/screens/pastscans.js', route: 'pastscans', sel: '.list-state [data-act="retry"]', rank: 10, how: 'Open Past scans when the stored data is unreadable or storage is blocked.' },
  a61: { id: 'pastscans.detail.verdict', title: 'Past scan detail, a verdict (read only)', kind: 'modal', file: 'app/public/js/screens/pastscans.js', route: 'pastscans', sel: '.pmodal[data-pmodal="verdict"]', rank: 55, how: 'Past scans, tap a row that was a verdict.' },
  a62: { id: 'pastscans.detail.refusal', title: 'Past scan detail, a refusal (read only)', kind: 'modal', file: 'app/public/js/screens/pastscans.js', route: 'pastscans', sel: '.pmodal[data-pmodal="refusal"]', rank: 50, how: 'Past scans, tap a row that Shin refused.' },
  a63: { id: 'removed', title: 'Recently removed (the list)', kind: 'screen', file: 'app/public/js/screens/removed.js', route: 'removed', how: 'Saved page, the Recently removed link. Or ?s=removed.' },
  a64: { id: 'removed.empty', title: 'Recently removed, nothing removed', kind: 'state', file: 'app/public/js/screens/removed.js', route: 'removed', sel: '.empty', rank: 10, how: 'Open Recently removed with nothing in the last 30 days.' },
  a65: { id: 'removed.error', title: 'Recently removed, could not be read (Try again)', kind: 'state', file: 'app/public/js/screens/removed.js', route: 'removed', sel: '.list-state [data-act="retry"]', rank: 10, how: 'Open Recently removed when the stored data is unreadable or storage is blocked.' },
  a66: { id: 'you', title: 'You (settings, data, language)', kind: 'screen', file: 'app/public/js/screens/you.js', route: 'you', how: 'Tap You in the camera bar or any page bar. Or ?s=you.' },
  a67: { id: 'market', title: 'Where do you shop? (country picker)', kind: 'screen', file: 'app/public/js/screens/market.js', route: 'market', how: 'You, tap the market row. Or ?s=market.' },
  a68: { id: 'licences', title: 'Where this comes from (data sources list)', kind: 'screen', file: 'app/public/js/screens/licences.js', route: 'licences', how: 'Where do you shop, tap the sources link at the bottom. Or ?s=licences.' },
  a69: { id: 'licences.loading', title: 'Where this comes from, loading', kind: 'state', file: 'app/public/js/screens/licences.js', route: 'licences', sel: '.lic-state[aria-busy="true"]', rank: 10, how: 'Open the sources page; visible while the list is being fetched.' },
  a70: { id: 'licences.failed', title: 'Where this comes from, could not load (Try again)', kind: 'state', file: 'app/public/js/screens/licences.js', route: 'licences', sel: '.lic-failed', rank: 10, how: 'Open the sources page with no signal or when the server answers with an empty list.' },
  a71: { id: 'correct', title: 'Tell Shin the price (correction form)', kind: 'screen', file: 'app/public/js/screens/correct.js', route: 'correct', how: 'Verdict half sheet, Correct it. Or a refusal sheet, Tell me the price. Or You, Report a wrong price.' },
  a72: { id: 'correct.saved', title: 'Tell Shin the price, thank-you state', kind: 'state', file: 'app/public/js/screens/correct.js', route: 'correct', sel: '.saved-note', rank: 10, how: 'Submit a price on the correction form; it returns to the camera after a moment.' },
  a73: { id: 'share', title: 'Share (the card image)', kind: 'screen', file: 'app/public/js/screens/share.js', route: 'share', how: 'Verdict half sheet, Share. Needs a verdict in Past scans.' },
  a74: { id: 'share.fallback', title: 'Share, card drawn as plain text', kind: 'state', file: 'app/public/js/screens/share.js', route: 'share', sel: '.shr-fallback:not([hidden])', rank: 10, how: 'Share when the card image cannot be drawn (fonts or canvas fail).' },

  /* ----------------------------------------- full-page states outside any screen */
  a75: { id: 'screen-error', title: 'This screen could not open (render failure page)', kind: 'state', file: 'app/public/js/router.js', route: '*', sel: '.screen-error', rank: 100, how: 'Any screen whose render throws. Shows a Back to camera button.' },
  a76: { id: 'noscript', title: 'Shin cannot open (JavaScript off)', kind: 'static', file: 'app/public/index.html', route: null, how: 'Open the app with JavaScript switched off. No badge can draw here: the badge is script.' },

  /* --------------------------------------------- the owner's static plan pages */
  /* Plain HTML files with no script, opened from disk. They cannot load the badge
     (a file page cannot import a module), so these tags are names only: use them
     in chat, they do not draw in the corner. */
  a77: { id: 'page.terminating-loop', title: 'Page: The Terminating Loop (master plan)', kind: 'static', file: 'pages/shin-terminating-loop.html', route: null, how: 'Open the file. No badge is drawn.' },
  a78: { id: 'page.walkthrough', title: 'Page: First Scan to Habit (walkthrough)', kind: 'static', file: 'pages/shin-walkthrough.html', route: null, how: 'Open the file. No badge is drawn.' },
  a79: { id: 'page.hard-dozen', title: 'Page: The Hard Dozen', kind: 'static', file: 'pages/shin-hard-dozen.html', route: null, how: 'Open the file. No badge is drawn.' },
  a80: { id: 'page.build-plan', title: 'Page: The Correcting Build', kind: 'static', file: 'pages/shin-build-plan.html', route: null, how: 'Open the file. No badge is drawn.' },

  /* ------------------------------------------ added after the numbered launch list */
  a81: { id: 'camera.manual', title: 'Retired: Camera, Manual Search mode', kind: 'state', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.cam[data-state="idle"][data-mode="manual"]', rank: 10, retired: true, how: 'Gone 2026-09-19 with the mode tabs. The keyboard button opens the name field as a52.' },
  a82: { id: 'camera.gemini.history', title: 'Answer sheet with your earlier prices (price history chart)', kind: 'state', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.gemini[data-detent="half"] [data-gem-history]', rank: 42, how: 'Half open answer sheet for an item you have scanned with a typed price at least twice before. Absent otherwise.' },
  a83: { id: 'camera.pricepad.choice', title: 'Price pad with the good-price or better-buy choice', kind: 'state', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.padsheet [data-pad-alt]', rank: 41, how: 'The price pad right after a scan (barcode, Price Tag or Manual Search). Flip between Is this a good price and Find a better buy.' },
  a84: { id: 'onboarding.evaluating', title: 'Welcome: Evaluating Deal (progress bar, last welcome step)', kind: 'screen', file: 'app/public/js/screens/onboarding.js', route: 'onboarding', sel: '[data-step="evaluating"]', how: 'Welcome flow step 31, after the four tips. Get started here hands over to setup or the camera.' },
  a85: { id: 'savings', title: 'Savings Overview (recently scanned, measured savings)', kind: 'screen', file: 'app/public/js/screens/savings.js', route: 'savings', how: 'You, tap Savings overview. Or ?s=savings.' },
  a86: { id: 'savings.empty', title: 'Savings Overview, nothing scanned yet', kind: 'state', file: 'app/public/js/screens/savings.js', route: 'savings', sel: '[data-savings="empty"]', rank: 10, how: 'Open Savings overview on a device with no scan history.' },

  /* ------------------------------ surfaces found without a tag of their own (2026-09-19)
     The answer sheet (class "sheet verdict gemini") used to borrow the verdict tags
     a38 to a40, and its could-not-answer sheet ("sheet refusal gemini-failed") used
     a42. a38 to a43 now say :not(.gemini) or :not(.gemini-failed), so each surface
     names exactly one tag. Rank 41 sits one above the older sheet tags on purpose,
     so the answer sheet wins even if a legacy selector were ever widened again. */
  a87: { id: 'camera.gemini.peek', title: 'Answer sheet, first look (headline and figures)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.verdict.gemini[data-detent="peek"]', rank: 41, how: 'A scan Shin answers from the price search. This is where the answer sheet lands, including the not fully confident version.' },
  a88: { id: 'camera.gemini.half', title: 'Answer sheet, half open (sources, other options, correct it)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.verdict.gemini[data-detent="half"]', rank: 41, how: 'Answer sheet, tap or drag the grabber up once.' },
  a89: { id: 'camera.gemini.full', title: 'Answer sheet, fully open (thumbs, Done)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.verdict.gemini[data-detent="full"]', rank: 41, how: 'Answer sheet, tap or drag the grabber up twice.' },
  a90: { id: 'camera.gemini.failed', title: 'Answer sheet, could not answer (Try again)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.refusal.gemini-failed', rank: 45, how: 'A scan whose price lookup did not come back, had nothing to price, or came back with nothing to show. Try again repeats that scan.' },
  a91: { id: 'pastscans.detail.answer', title: 'Past scan detail, an answer (read only)', kind: 'modal', file: 'app/public/js/screens/pastscans.js', route: 'pastscans', sel: '.pmodal[data-pmodal="answer"]', rank: 55, how: 'Past scans, tap a row that was an answer from the price search.' },
  a92: { id: 'market.region', title: 'Where do you shop, region step', kind: 'state', file: 'app/public/js/screens/market.js', route: 'market', sel: '.mkt-regions:not([hidden])', rank: 10, how: 'Where do you shop, pick a country that has regions to name. The region list appears under the country list.' },
  a93: { id: 'market.none', title: 'Where do you shop, no country matches the search', kind: 'state', file: 'app/public/js/screens/market.js', route: 'market', sel: '.mkt-none:not([hidden])', rank: 20, how: 'Where do you shop, type something in the search box that no country matches.' },
  a94: { id: 'paywall', title: 'Shin Plus (subscription screen)', kind: 'screen', file: 'app/public/js/screens/paywall.js', route: 'paywall', how: 'Scan past the weekly free limit, or ?s=paywall.' },
  a95: { id: 'paywall.web', title: 'Shin Plus, in a browser (Subscribe in the app)', kind: 'state', file: 'app/public/js/screens/paywall.js', route: 'paywall', sel: '[data-pw-state="web"]', rank: 10, how: 'Open ?s=paywall in a plain browser, outside the phone app.' },
  a96: { id: 'paywall.plans', title: 'Shin Plus, the two plans with store prices', kind: 'state', file: 'app/public/js/screens/paywall.js', route: 'paywall', sel: '[data-pw-state="plans"]', rank: 10, how: 'Open the subscription screen in the phone app with the store products set up.' },
  a97: { id: 'permissions', title: 'Camera and location permissions, on its own', kind: 'screen', file: 'app/public/js/screens/permissions.js', route: 'permissions', how: 'First launch when the welcome flow is switched off (FLAGS.onboarding false). Or ?s=permissions. Same panel as a24, which is the step inside the welcome flow.' },
  a98: { id: 'camera.catalogue', title: 'Catalogue answer sheet (the product and its price range)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.catalogue[data-outcome="catalogue_hit"]', rank: 41, how: 'With the server setting SHIN_CATALOGUE_FIRST on, scan a barcode the catalogue has. With no range for it yet the sheet says so.' },
  a99: { id: 'camera.catalogue.missing', title: 'Not in the catalogue (type the product name)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.catalogue[data-outcome="not_in_catalogue"]', rank: 41, how: 'With the server setting SHIN_CATALOGUE_FIRST on, scan a barcode the catalogue does not have.' },
  a100: { id: 'camera.bell.peek', title: 'Price verdict bell, first look (his word, the bell, Save)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.verdict.dist[data-detent="peek"]', rank: 41, how: 'Any scan whose answer carries a verdict (kind distribution). With no shelf price yet the bell shows a price field.' },
  a101: { id: 'camera.bell.half', title: 'Price verdict bell, half open (notes, prices seen, correct it)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.verdict.dist[data-detent="half"]', rank: 41, how: 'Price verdict bell, tap or drag the grabber up once.' },
  a102: { id: 'camera.bell.full', title: 'Price verdict bell, fully open (thumbs, Done)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.verdict.dist[data-detent="full"]', rank: 41, how: 'Price verdict bell, tap or drag the grabber up twice.' },
  a103: { id: 'page.legal-terms', title: 'Page: Terms of Use', kind: 'static', file: 'app/public/legal/terms.html', route: null, how: 'You, Terms of use. Or open /legal/terms.html. The tag is in the page source as a meta tag; no badge is drawn.' },
  a104: { id: 'page.legal-privacy', title: 'Page: Privacy Policy', kind: 'static', file: 'app/public/legal/privacy.html', route: null, how: 'You, Privacy policy. Or open /legal/privacy.html. The tag is in the page source as a meta tag; no badge is drawn.' },
  a105: { id: 'page.legal-terms-fr', title: 'Page: Terms of Use, French', kind: 'static', file: 'app/public/legal/terms-fr.html', route: null, how: 'Terms of Use, tap the French link at the top. Or open /legal/terms-fr.html. No badge is drawn.' },
  a106: { id: 'page.legal-privacy-fr', title: 'Page: Privacy Policy, French', kind: 'static', file: 'app/public/legal/privacy-fr.html', route: null, how: 'Privacy Policy, tap the French link at the top. Or open /legal/privacy-fr.html. No badge is drawn.' },
  a107: { id: 'camera.typedpick', title: 'Which one is it? (the typed name\'s top three catalogue matches)', kind: 'sheet', file: 'app/public/js/screens/camera.js', route: 'camera', sel: '.sheet.typedpick', rank: 40, how: 'Camera, Type the product name, enter a name the catalogue knows, such as McCain Tasti Taters, and submit.' },
};

/**
 * Things a reader might expect a tag for and that deliberately have none, and why.
 * The test reads this list too: a name here that later gains a tag is a mistake.
 */
export const NOT_TAGGED = [
  { what: 'app/public/index.html (the shell)', why: 'It holds one empty container that the router fills. Every visible state of it is a screen above, and its only own state, JavaScript off, is a76.' },
  { what: 'Verdict tiers and confidence levels (good, fair, walk, unknown)', why: 'The same sheet with different words and colour, not a different screen. They share the detent tags a38 to a40.' },
  { what: 'Refusal reasons (unsure, category, no match, thin evidence, reader down)', why: 'The same sheet with a different sentence, so they share a42 and a43. The offline one has its own tag, a44, because it has its own markup.' },
  { what: 'Verdict just saved acknowledgement (acked variant)', why: 'A line inside the verdict sheet, not a different view.' },
  { what: 'Shin\'s docked face and its hints (aim hint, torch note, second-visit callback)', why: 'A caption on the camera, not a screen. It sits inside a32 to a36.' },
  { what: 'Eye marks over the feed (other-object buttons, barcode read mark)', why: 'Drawn on the camera surface, part of a32 to a35.' },
  { what: 'You screen inner blocks (coverage failed, scan log, storage not kept line)', why: 'Inline sections of a66 that appear and vanish; nothing else on the page changes.' },
  { what: 'Consent, setup and market storage-not-kept line', why: 'One inline sentence added to a screen that is already tagged.' },
  { what: 'The list-screen "loading" state on Saved, Past scans, Recently removed', why: 'Coded but unreachable: phase is never set to loading. If a path that sets it is added, give it tags then.' },
  { what: 'Share with no scan to share', why: 'It redirects to the camera at once, so nobody lands on it.' },
  { what: 'Onboarding replay (Watch the welcome again)', why: 'Runs the same 30 steps with ?replay=1, so a1 to a29 and a84 cover it.' },
  { what: 'Row-delete confirm state on Recently removed (Tap again)', why: 'A button changing its label, not a view.' },
  { what: 'The bottom page bar and the back button', why: 'Chrome on tagged screens, not screens.' },
  { what: 'The phone\'s own permission prompts (camera, location) and share sheet', why: 'Drawn by the operating system, not by this app; the app cannot tag them.' },
  { what: 'The tag badge itself', why: 'It is the developer overlay being described.' },
  { what: 'Route announcement live region', why: 'Invisible, for screen readers.' },
  { what: 'identify/, spine/, price/, catalogue/ and native/ folders', why: 'Server, data and native-wrapper code with no screens of their own; the wrapper loads this same app.' },
  { what: 'docs/design and other repo documents', why: 'Markdown notes in the repo, not app pages. Only the four HTML files in pages/ are tagged (a77 to a80).' },
  { what: 'Answer sheet sections (searched offers and reviews, the price line with its marks and merged-label list, other options)', why: 'Inline sections of the half open stage, a88, that appear and vanish inside it; nothing else on screen changes. The earlier-prices chart has its own tag, a82, because it was tagged before this rule was written down.' },
  { what: 'Answer sheet, not fully confident version', why: 'The same sheet with a different face and one extra line, so it shares a87 to a89, the way verdict tiers share a38 to a40.' },
  { what: 'Refusal from a spend cap, a rate limit or an outage', why: 'The reader-down refusal with its own sentence through the same sheet, so it shares a42 and a43.' },
  { what: 'Welcome camera-denied note (under the permission switches)', why: 'One inline sentence that appears on a24 after the phone says no; the screen does not change.' },
  { what: 'Savings Overview pending line (no measured savings published)', why: 'An inline line inside a85, the way the empty line is inside it; nothing else on the page changes.' },
  { what: 'Share status line (saved to downloads, could not export)', why: 'One line under the card on a73 or a74; the screen does not change.' },
  { what: 'The vision library\'s script tag (js/chunks, js/vendor)', why: 'Third-party code adds an invisible script element to the page body; it draws nothing a person can see.' },
];
