# Pexi design evidence: every recommendation, with its reason

Written 2026-10-09 for the founder. It exists to satisfy his instruction of the same day: cover everything from "the app should include haptics" down to "this screen takes N taps" and "this data type is shown this way", each point backed by evidence or by a valid assumption. A point with neither was deleted.

---

## 0. How to read this

1. Every recommendation is one block, numbered R-1, R-2 and so on, with four lines: Now, Should, Why, Figure status.
2. Now is what the app does today. "Counted" means tallied from the app's code on 2026-10-09 (taps, sizes, durations, strings). Nothing in Now is estimated; where the code could not answer, Now says so.
3. Why begins with [E and a number] when published evidence backs it, or with [A] when it rests on a stated assumption. Every [A] gives one sentence on why it is valid and the test that would show it wrong. Section 10 collects those tests.
4. Source numbers point to the list in section 12. FETCHED means the page was opened and read. SNIPPET means only a search summary was seen, so treat it as weaker. Where a block leans only on SNIPPET sources, the block says so.
5. Figure status labels every number: benchmark-backed (the number comes from a source), derived by logic (arithmetic or reasoning from sourced numbers or from the app's own design), or untested (my number, no source, to be checked by a test in section 10).
6. "Fixed by ruling" means a founder ruling already decides it. I record it and do not argue it. Where a design document and a ruling disagree the ruling wins; where a design document and the code disagree I state both.
7. "px" means CSS pixels, which on a phone are about the same as iOS points and Android dp.
8. The founder rulings file still uses the app's old name in its own text. Where this document says "fixed by ruling" it means the ruling, with the name changed to Pexi.
9. Numbers in the tables of sections 2, 3 and 8 follow the same labels as the blocks. Under each table a line says which numbers are counted, which are derived by logic and which are untested.
10. Sections 0, 10, 11 and 12 are lists. Sections 1 to 9 hold the R blocks. Two things I could not do: I read only part of the mascot document, and almost no competitor screen was seen as a picture, only described in text.

---

## 1. App-wide rules

### Haptics

**R-1. Include haptics, but only two per scan and one per save**
Now: haptics exist, switched on by default, with an off switch in You. Counted patterns: 8 ms on the barcode press, shop pick and alternative pick; 10 ms when the price is placed; 14 ms on a refusal landing and on a stored observation; 16 ms when the verdict lands. A single scan therefore buzzes three times (barcode, price, verdict).
Should: two haptics per scan (barcode captured, verdict landed), one on Save, none on pad keys, none on price confirm, none on shop pick, none on errors, none when a low-confidence verdict lands. Keep the off switch, default on.
Why: [E7] "Often, the best haptic experience is one that people may not be conscious of, but miss when it's turned off." and "Let people turn off or mute haptics." [E9] "less is more. Too much vibration can be annoying and even numbing to the hands." [E13] scan feedback "should be obvious and delivered through visual, sound and haptic feedback." The "none on low confidence" part is the app's own design rule (no buzz on doubt) [E2].
Figure status: two per scan and one per save are derived by logic from "short haptics for discrete events" [E7]; no source gives a count.

**R-2. On iPhone the haptics do nothing today; the native layer must supply them**
Now: haptics use the browser's vibration call. That call is not supported in Safari on iPhone, and the app's installed form runs in the same engine (my inference, no page says it in those words). So an iPhone user feels nothing. On Android Chrome it works only after a tap. The code inventory cannot say whether the native wrapper (which already carries store prices and Restore purchases) bridges any native haptic.
Should: the native wrapper calls the phone's own feedback system on both platforms. iOS: a "success" notification feedback for the verdict, a light impact for barcode capture, a light impact for Save. Android 11 and newer: the system "confirm" effect for the verdict, a predefined tick for capture; older Android keeps the vibration call. Do not build on the iOS 18 trick where a hidden switch control gives a tap; it is an undocumented side effect and one page reports it was patched in a later iOS (single source).
Why: [E10] the compatibility data lists Safari (desktop and iOS) as not supported for vibration; [E11] the only iOS web haptic is "for `<input type=checkbox switch>`" in Safari 18; [E12] reports it breaking on the newest iOS (SNIPPET, single source); [E9] "If your action is covered by a predefined action ... use that constant."
Figure status: the only number is Android 11 (API level 30) as the first version with the confirm effect, which is benchmark-backed [E9]. The claim that installed web apps behave like Safari is an inference.

**R-3. Which event gets which feeling**
Now: patterns differ only in length (8 to 16 ms). There is no distinction between success and failure.
Should: (a) barcode captured: light impact, fired the instant the barcode is accepted; (b) verdict landed on a confident or fairly sure answer: one success tick, the same for great, good, reasonable and bad (the word, colour and face carry the judgment, not the buzz); (c) Save: the system "confirm" feel; (d) torch toggled: no haptic; (e) offline or server fault: none, because the fault is Pexi's, not the shopper's failed action; (f) low-confidence verdict: none.
Why: [E7] a failure pattern reused for a positive outcome confuses ("If you use the same haptic pattern for a positive outcome ... people will be confused."); a "bad price" is not a failed task, so it must not get a failure feel. [E7] notification feedback is for "the outcome of a task or action"; impact is "a tap when a view snaps into place". [E8] pair the haptic with colour and text so it works when the phone is silenced or looked away from.
Figure status: untested as a whole set; the principle is benchmark-backed, the specific mapping is derived by logic.

**R-4. Never buzz while the camera is trying to read**
Now: a buzz fires on the barcode press (8 ms) and again when the price is placed (10 ms). The inventory does not say whether the first one fires before or after the frame freezes.
Should: fire the capture haptic only after the frame has frozen, and hold the highlight on the code for at least 150 ms before the sheet starts to rise. No haptic while the viewfinder is live and searching.
Why: [E7] "Ensure that haptic vibrations don't disrupt experiences involving device features like the camera". [E13] a scanner project added "a 150-millisecond delay between providing scan feedback and closing the camera" and users felt "secure that the right object was scanned". Neither Apple's data-scanner page nor Google's barcode-scanning page documents any scan feedback, so it is the app's job [E15].
Figure status: 150 ms: benchmark-backed by one vendor project (SNIPPET weight, see source 13); the freeze-first order is derived by logic.

**R-5. The 8 to 16 ms strengths are the app's own and unproven**
Now: 8, 10, 14 and 16 ms pulses. No source or device test is recorded for them.
Should: once the native layer exists, use the system presets instead of raw milliseconds. Until then keep the numbers and test them on three Android phones: every tester must report feeling the capture tick and the verdict tick in a loud store.
Why: [A] A pulse that cannot be felt through a shopping-bag grip or a glove is no feedback at all; valid because phones differ widely in motor strength and 8 ms is at the very short end. Test: five testers, three phones, in a store, tick felt 5 of 5 times; fail if fewer than 4 of 5 testers feel the 8 ms capture tick.
Figure status: untested.

**R-6. No sound in version 1**
Now: no sound anywhere (counted: no audio code).
Should: stay silent. Re-test after testers use it in stores.
Why: [A] Silence is right for a phone held up over a shelf in a quiet aisle, where a beep draws looks; it is valid because the haptic plus the visual freeze already confirm the capture, and Apple notes that colour, text, sound and haptics together cover people who "silence their device" [E8]. This goes against a scanner vendor who recommends all three channels because stores are "busy and loud" [E13, E14, both SNIPPET]. Test: ask 10 testers "how did you know it read the barcode?" and count how many missed it; fail if 2 or more miss the capture.
Figure status: untested.

### Camera first, accounts, permissions

**R-7. The camera is the first screen, always**
Now: a returning launch reaches a live camera in 0 taps. A first launch passes through 2 screens first (Permissions, then Consent), each needing one tap. Both work with every switch left off. There is no splash screen.
Should: a returning launch stays at 0 taps and opens on the camera. The first launch keeps the 2 screens, because a ruling puts the location ask once on the permission screen and the consent wording ships on the consent screen (fixed by ruling, R-9, R-10, R-24); the camera is the third thing the shopper sees, once, ever. Icon tap to live feed in 1.2 s on a warm start.
Why: [E2] the design's first law: the camera is the app; the design's cold start lands on the camera, and the ruling on the permission screen wins where they differ [E5]. [E3] the design budgets 1.2 s with no splash. [E115] a reviewer of the closest analogue praises exactly this: "the first thing you see is a camera scanner" and "The scanner is right there, ready to go." [E66] "instructional onboarding should be brief, optional" and "Most mobile apps don't need instructional onboarding."
Figure status: 0 taps on a returning launch and 2 screens on a first launch: counted. 1.2 s: untested (the design calls it a budget, not a measurement); see the test in section 10.

**R-8. No account before the first scan**
Now: no account of any kind. A beta invite code can sit in the web link but has no screen.
Should: Now equals Should; keep. No sign-in before value, and none that gates a scan.
Why: [E69] "Delay sign-in for as long as possible. People often abandon apps when they're forced to sign in before they can do anything useful." Competitors show the cost: reviewers of the closest analogue write "Requires account" and "Couldn't log in; confusing signup" [E115], and its video walkthrough lists a mandatory sign-up at 11 seconds [E114]; a photo-calorie app's reviews say "Can't skip the onboarding questions" and "Onboarding too long" [E118]; a food database app gets a one-star "Objects to required account creation" [E119]. [E70] 19% of shoppers abandon a checkout when forced to create an account (a proxy from online checkout, not apps). [E74] a figure of "up to 56%" higher day-1 churn behind an account wall is second-hand and its original was not found (SNIPPET).
Figure status: 19%: benchmark-backed but from a different setting. No controlled study of "scan before sign-up" was found (section 11).

**R-9. Keep the permission screen as the first screen, short: one sentence per row, one button labelled Continue**
Now: a standalone Permissions screen comes first, before Consent. It has a camera switch row, a location switch row, a "see demo" link, and a Continue button that works with both switches off. The phone's camera prompt appears when the camera switch is tapped, or when the camera screen starts.
Should: the screen stays first and keeps both rows (fixed by ruling: location is asked once, on this screen). Each row gets one plain sentence saying what it is for, for the camera "Pexi uses your camera to read product barcodes so it can look up prices." The one button stays "Continue", which Apple's guidance prefers to "Allow" and the screen already uses; it works with both rows left alone, and it never opens the phone's alert by itself. The "see demo" link leaves the first launch (my proposal, no ruling covers it). If the shopper refuses the camera, no wall and no second ask in that session; the typed-name route moves into the scan control's place.
Why: [E64] a launch-time camera ask is fine when the app cannot work without it. [E64] a purpose line should be "a brief, complete sentence", and a priming screen should have "only one button" using "a term like 'Continue' or 'Next'" and shouldn't let people leave without seeing the phone's alert. [E67] asking in context is less surprising. [E5] the ruling that a first launch asks for location once, on the permission screen. The design wrote the button as "Allow camera" and put the primer inside the camera; the ruling and Apple's guidance both point to the existing screen with a Continue button, so the design wording is dropped. [A] The demo link is something no first-time shopper needs before a first scan; valid because it plays no part in the camera ask; test: share of first launches that tap it and then reach a first verdict, against those that do not.
Figure status: no numbers. Vendor figures that a primer lifts camera grants from about half to 65 to 80% are SNIPPET, untraceable to an original [E73]; do not rely on them.

**R-10. Location is asked once, on the permission screen, and starts off**
Now: the first screen carries a location switch row alongside the camera row. With the welcome flow off, the consent screen draws no location switch, so location is asked only there (counted).
Should: Now equals Should; keep (fixed by ruling: a first launch asks for location once, on the permission screen, and the consent screen does not ask again). The switch starts off and Continue works with it off (fixed by ruling: consent defaults off until answered, and only a coarse cell is stored). The nearest improvement that fits the ruling: the row's sentence says what it is for, "Pexi uses your location to suggest the shop you are in.", and the shop picker offers a tap to turn it on later instead of asking a second time.
Why: [E5] the two rulings: location asked once on the permission screen, and consent off until answered with a coarse cell only. Apple's advice to avoid asking at launch unless the resource is required [E64] points the other way; the ruling decides it, and the off-by-default switch is the part of that advice that still fits. Location is not needed for a verdict: the code waits up to 1.5 s for nearby shops only when naming a shop.
Figure status: 1.5 s is counted, not a recommendation.

**R-11. The camera permission must survive relaunch and moving between pages**
Now: the app moves between pages with browser history entries. The inventory cannot say whether the native wrapper keeps the camera permission across relaunches and page changes.
Should: zero repeat camera prompts across 5 relaunches and 5 trips from camera to Saved and back. The viewfinder must not be torn down and re-asked on a page change.
Why: [E71] WebKit's own bug tracker titled "recurring permissions prompts in standalone when hash changes"; that bug is marked resolved (configuration changed), and its cause was the page address changing on navigation, which is how this app moves between pages. A scanner vendor's note says "the user's decision to allow camera access is not persisted for PWAs". That a prompt still repeats on current iOS rests only on [E72] (SNIPPET: a forum thread and a vendor support note). Applies if any part of the app still runs as a home-screen web app.
Figure status: pass number (0 prompts in 10 trials) is untested.

### Reach, size and layout

**R-12. Put every control used in every scan in the lower 60% of the screen**
Now: the bottom bar holds Saved, the scan control and You; the price pad rises to half height; the primary action sits in the first sheet position; the torch is top left at 48 px.
Should: everything used on every scan (scan control, pad, confirm, primary action, bottom bar) sits in the lower 60% of the height. Only rare controls (torch, back chevron) live above that. Nothing essential only at the far left or far right edge; the scan control stays centred.
Why: [E21] Hoober observed 1,333 people: 49% held the phone in one hand, 36% cradled it, 15% used two hands; of one-handed users 67% used the right thumb and 33% the left, so a left-only or right-only edge control fails a third to two thirds of one-handed users. Carrying bags raises one-handed use [E21]. About 72% of North American adults use a phone to compare prices in store [E130 SNIPPET, second-hand survey]. [E23] "the middle of the screen represents the most easily tappable area". Distances in centimetres were not found [E22 SNIPPET].
Figure status: the shares are benchmark-backed but observed in 2012 to 2013 on 3.5 to 4 inch phones, so reach on today's phones is likely worse. The 60% line is derived by logic, untested.

**R-13. Raise every tappable thing to 44 px, and everything used per scan to 48 px**
Now: counted sizes: torch 48 by 48; scan control 56 by 56; type button 44 by 44; camera bottom-bar items 46 wide (the design says 56); sheet grabber 36 by 5 drawn, hit size not stated; thumbs 48; buttons 48; links 44; pad keys 48 to 52 (44 when the screen is under 640 px tall); shop rows 52; candidate rows 56; switch 52 by 32; threshold buttons 40 high; the small "On sale" style chips have no minimum height (about 34 px by padding).
Should: floor 44 in both directions for everything tappable: threshold buttons 40 to 44, chips to 44 (use invisible padding if the look must stay), switch hit area 52 by 44, camera bottom-bar items 46 to 56 wide. Per-scan controls 48. Pad keys 52 whenever the screen is 640 px or taller, 48 minimum below that, and the 44 fallback only where nothing else fits. 8 px or more between neighbouring targets.
Why: [E16] iOS "a button needs a hit region of at least 44x44 pt", default 44, with spacing. [E17] Android "at least 48x48dp, separated by 8dp", about 9 mm. [E19] a physical minimum of 1 cm by 1 cm. [E18] WCAG 2.5.8 requires 24 px (already met), 2.5.5 asks 44 px. [E20] one-handed thumb typing: "9.2 mm for discrete tasks and targets of 9.6 mm for serial tasks should be sufficiently large"; a number pad is serial. 9.6 mm is about 51 dp using Android's 48 dp = 9 mm, hence 52.
Figure status: 44, 48, 8: benchmark-backed. 52 for the pad: derived by logic from [E20] and [E17]. The 640 px switch is the app's own and untested.

**R-14. Keep the sheet's close X; give the grabber a 48 px hit area and make the X easier to see**
Now: counted: the verdict sheet, the price pad, the candidate lists and the type-it route each draw a close X (an icon button, 44 by 44 px, drawn at 55% opacity) at the top right, and the verdict sheet's full position also has a Done button. The grabber is 36 by 5 drawn but is a real button; a tap steps up one detent and wraps back from the top; a drag past 40 px moves one detent; dragging down dismisses. Its hit area is not stated in the code.
Should: Now equals Should for the X: keep it on every sheet. Add: the grabber's hit area 48 px tall, and the X drawn at full opacity or at least a 3 to 1 contrast against the sheet. A drag down still works. The sheet may not stack another sheet on top.
Why: [E23] "Include a Close Button ... rather than relying exclusively on the grab handle"; swipe-down is "prone to swipe ambiguity" with the phone's notification drawer; "Do Not Stack Bottom Sheets". [E25] the handle "has a default min width and height of 48dp". [E24] a grabber can be tapped to cycle detents and "Display only one sheet at a time". [E51] a control's drawn mark needs 3 to 1 contrast. The design's line "going back is a downward drag, not a back button" is already departed from in the code, which has the X; the code with the stronger evidence is kept.
Figure status: 48 and 44: benchmark-backed; 44 is counted. The 55% opacity: counted; whether it reaches 3 to 1 is untested (R-15). Placement: counted.

### Contrast, colour, motion, type

**R-15. Make legibility in glare depend on word, shape and position, and close the missing ratio table**
Now: stated in the code's own comments only: white on the bad-price fill 5.48; on the unknown fill 5.29; faint ink on the raised ground 4.52; light theme good 5.53 and amber 5.47. A computed ratio for every text-on-fill pair does not exist. The default theme is dark.
Should: compute and record the ratio for every text and mark pair in both themes (the gap). Keep every text pair at 4.5 or more and every chart mark at 3 or more. Test the verdict screen outdoors.
Why: [E54] text 4.5:1, large text 3:1 (the verdict word at 34 px and price at 72 px are large). [E51] chart marks 3:1. No published minimum for sunlight legibility exists [E59, section 11]. The only measured figures are simulated-sunlight display contrast of about 1.2 to 3.3 for 2011 to 2012 phones and 4.1 to 5.0 for 2017 to 2018 phones, with the source itself warning the ratio "is not always right to show sunlight legibility" (SNIPPET). Surface reflection dominates in glare [E59 SNIPPET], so hue alone will wash out.
Figure status: 4.5 and 3: benchmark-backed. All outdoor expectations: untested.

**R-16. Never let colour alone carry a verdict**
Now: four words (great, good, reasonable, bad) each with a colour, a face and the shopper's dot position on the bell. Great shares the good hue. Sales are marked with the word "Sale" in the list.
Should: Now equals Should; keep the word plus face plus position. Add: the two light-text and dark-text fills already differ in lightness (dark text on green and amber, light text on red), which keeps the pair distinguishable under red-green colour blindness; keep that. Draw sale dots with a different shape, not only a different colour.
Why: [E55] "Color is not used as the only visual means of conveying information" (Level A). [E56] and [E16]: avoid red-green and blue-orange pairings as the only signal; "Offer visual indicators, like distinct shapes or icons". [E57] about 1 in 12 men (8%) and 1 in 200 women have a colour vision deficiency; red-green is the most common. [E58] the 8% is a Northern European figure; about 4 to 5% in Asian and African men (SNIPPET).
Figure status: 8% and 0.5%: benchmark-backed. The lightness argument is derived by logic from the design's text-colour rule [E2]; untested with a simulator.

**R-17. Reduced motion becomes fades, with no slow loop near 5 seconds**
Now: stylesheets honour the reduce-motion setting in the camera, face, correction, licences, welcome, Saved, You and shell; the bell's 620 ms morph is drawn still.
Should: Now equals Should for what exists. Add: confirm the mascot's resting loops (breathing, sleeping) stop under reduced motion, and that no loop has a period near 5 s.
Why: [E100] "Motion animation triggered by interaction can be disabled". [E101] reduce-motion has been widely available since January 2020; scaling and panning large objects can trigger vestibular symptoms. [E16] replace travel with fades and tighten springs. [E102] avoid oscillation around 0.2 Hz (a 5 s period), though that line is from the headset section.
Figure status: 4 to 6 s avoid-window: derived by logic from a headset-only rule; untested.

**R-18. The text floor is 11 px, body 16 px, and provenance lines move up to 12 px**
Now: counted: price hero 72 (64 on narrow screens), verdict word 34, secondary price 20, body 16, rows 15 to 16, buttons 16 to 17, pill 14, small modal buttons 12, labels and provenance 11 in monospace uppercase with wide spacing, bottom-bar labels 11.
Should: nothing below 11. The provenance line is the app's explanation of how sure it is, so it goes to 12 px and uses the muted ink rather than the faint ink. Test the full screen at the largest system text setting.
Why: [E60] iOS default 17, minimum 11; "aim for larger than the recommended sizes" for thin fonts; "turn on Larger Accessibility Text Sizes ... and confirm that your app remains comfortably readable." [E61] Material's smallest label is 11sp and body is 16sp. [E62] reading speed falls sharply below a critical size equal to 9 pt body at 40 cm, so 11 px is a floor, not a comfort. Phones are held at about 32 to 37 cm for reading [E63 SNIPPET]; at a shelf the distance is unmeasured (section 11).
Figure status: 11, 16, 17: benchmark-backed. 12 px for provenance: derived by logic, untested.

### Speed, connection, notifications, copy

**R-19. Response-time budget**
Now: design budgets only: icon to camera 1.2 s; barcode caught to name 0.9 s; engine 0.8 s median with a 2.5 s hard cap; press tint 120 ms and colour tint 140 ms. The "Still on it." label appears at 800 ms. The client has no hard network timeout (counted: none).
Should: (1) every tap shows a pressed state within 100 ms; (2) barcode caught to name chip 1.0 s or less; (3) price confirm to verdict on screen 1.0 s at the median (engine 0.7 s plus 0.3 s rise) and 2.8 s at worst; (4) any wait over 1.0 s shows a named step, which exists; (5) after 10 s the client stops and shows the connection sheet.
Why: [E76] "0.1 second is about the limit for having the user feel that the system is reacting instantaneously"; "1.0 second is about the limit for the user's flow of thought to stay uninterrupted"; "10 seconds is about the limit for keeping the user's attention focused". [E77] "Use a progress indicator for any action that takes longer than about 1.0 second." [E80] avoid vague terms like "loading". A skeleton screen is not what the design uses and the one controlled test found it felt slower (perceived wait 2.82 s against 2.41 s for a spinner and 2.29 s for a blank screen, about 40 to 58 people a group) [E79]; NN/g limits skeletons to full-page loads [E78]. Named steps are an active wait, which people estimate as shorter than passive waiting (SNIPPET) [E81]. A scanner price app's recent reviews describe blank or loading screens in about 20 of 50 [E122]. The design's 0.8 s plus 0.26 s rise is 1.06 s, just over the 1.0 s limit.
Figure status: 0.1, 1.0, 10: benchmark-backed. 0.7 s engine target and 2.8 s worst case: derived by logic.

**R-20. Tell the shopper they are offline before they scan, and keep the typed price on retry**
Now: counted: the scan press opens the price pad before any lookup, so the price is always typed first and the "needs a connection" sheet can only appear after it. Its Try again button sends the same barcode and the same price again, so a retry costs 1 tap and the typed price is kept already. There is no notice on the viewfinder before the scan.
Should: keep the retry as it is (Now equals Should for the retry). Add a one-line notice on the viewfinder when there is no connection ("No connection. I need one to look up prices.") so the shopper does not spend the scan press and the price taps first.
Why: [A] Without a notice a shopper spends 6 taps (scan press, then 4 price presses and the confirm, counted for $4.99) before learning they are offline; valid by counting. Retry afterwards is 1 tap. Whether in-aisle signal is often poor is untested (no in-aisle study exists, section 11). Test: log how many lookups fail for connection reasons in the first week; if under 2% of scans, the notice is low value and can be dropped. [E76] the 10 s attention limit supports the timeout (R-19).
Figure status: 6 taps before the failure and 1 tap to retry: counted. The 2% line is untested.

**R-21. No notifications in version 1, and what stands in for them**
Now: no notification code. Fixed by ruling: no price-drop notifications ship and the permission is not requested.
Should: Now equals Should; keep. What replaces them: (1) the store visit is the trigger; (2) the Saved list shows each row's difference from the usual price on opening; (3) the design adds a count badge on the Saved button, which the code inventory could not confirm exists; (4) one weekly line that reads the shopper's own record back to them, only if drawn from what they scanned, saved or corrected. Do not ask for the notification permission before a feed that can send an honest message exists; then ask right after the first save.
Why: [E5] the ruling. [E3] the usage document ranks "they come back when they are next in a store" as the honest version 1 answer and says a price-drop alert before a re-queryable source would send "either silence or a drop that never happened". The cost is accepted: push users show retention "nearly 3 times higher" but that is correlational vendor data [E127 SNIPPET]; 33% of retail app users say price drops on saved items is the notification they value [E128 SNIPPET]. If push is added later, opt-in is about 44% to 51% on iPhone and about 81% on Android [E129 SNIPPET], another reason to ask only once there is something honest to send.
Figure status: 3 times and 33%: benchmark-backed but SNIPPET and not causal. Everything else: derived by logic.

**R-22. Copy describes the number, never the store's motive, and never promises what the app cannot do**
Now: counted lines in the default voice: great "Well under the usual. Somebody in that store priced this wrong, in your favour."; good "Under the usual price. The store is being fair."; bad "Over the usual. The store is charging extra for this."; the design's save line "Watching. I will say something under $1.47."
Should: every price line states how the asking price compares with Pexi's estimate and stops. Examples: great "Well under the usual price." good "Under the usual price." reasonable "That is the going rate." bad "Over the usual price." No claim about why. No promise of a future alert or a re-check, because nothing can send one. No savings words.
Why: [E5] the typical price is Pexi's estimate; no savings claim ships until it is measured (a Competition Act reason). [E3] a low-confidence answer "must never promise to look again" because the app cannot honour it. [E106] "Take a positive tone and don't blame the user"; "Avoid humor since it can become stale if users encounter the error frequently." [E125] flagging a figure as an estimate and giving its range cost "little to no drop in trust". An unexplained "priced this wrong" asserts an error the app cannot know.
Figure status: no numbers.

**R-23. The old refusal wording is still in the app and must go**
Now: counted: a refusal sheet and its strings still exist ("I do not know this one", "I am not sure which one this is", "Not enough to call it", "The reader is not answering"); the keep acknowledgement ends "I still cannot call it."
Should: fixed by ruling: every scan that has a scan left ends in the chart. Route each of those cases to the bell with low confidence. "I am not sure which one this is" becomes a question ("Which one is it?") with three choices. Keep only genuine system-fault wording, and keep it plain.
Why: [E5] "Always answer, never refuse for wasting time" and "V1 verdict screen mechanics" (the refusal screen is retired). The code lags the ruling.
Figure status: no numbers.

---

## 2. Journeys, counted

Taps are counted from a cold launch with the app as it is today (the welcome flow, photo identification, languages and the market picker are all switched off). A price of $4.99 is four pad presses (4, point, 9, 9) plus one confirm, because the pad is made of on-screen buttons. A phone-level dialog (the camera Allow) is shown as "OS" and not counted as an app tap.

| # | Journey | Taps today | Target | Which taps go, and how |
|---|---|---|---|---|
| J1 | First launch to first verdict | 8 app taps + 1 OS (4 if the price is skipped) | 6 app taps + 1 OS (3 if skipped) | The scan press goes if detection fires alone (1), the decimal key goes with a cents-first pad (1). Permissions Continue and Consent Continue both stay, fixed by ruling (R-9, R-10, R-24). If the founder folds the consent sentence into the permission screen, which no ruling covers, the target becomes 5 (2 if skipped) |
| J2 | Returning, scan a barcode, type $4.99 | 6 | 4 | Scan press (1) and decimal key (1) |
| J3 | Photo of an item with no barcode | Not possible today (shutter removed); estimate if switched on 6, or 7 when the photo returns a candidate list to pick from | Not built yet; target 5 | Shutter (1) plus price 3 digits and confirm (4); the pick, when one is needed, stays |
| J4 | Typed name to verdict | N + 7, or N + 8 with a pick (N = letters typed) | N' + 6, where N' is fewer letters | Separate submit and pick merge into one tap on a suggestion; cents-first pad saves 1 |
| J5 | Verdict to Saved | 1 | 1 | Nothing to cut; keep |
| J6 | Verdict to a correction submitted | 8 (shop prefilled) or 10 | 3 (shop known) or 4 | Price prefilled from the pad (4 go), the thank-you screen and its Done go (1), the shop list shows without a field tap (1) |
| J7 | Verdict to share | 3 | 3 in the app | Same count, but the third tap opens the phone's share sheet so the card reaches a chat directly |
| J8 | Saved list to the last verdict of an item | 2 to see (Saved, then the row); the 3rd tap closes the view (Close, or a tap outside it); a 4th returns to the camera | Same: 2 to see, 3rd tap closes | Keep. The view is a centred card with Close, a tap outside and the Escape key; no swipe exists today (R-32 adds one) |
| J9 | Change market | Not possible today; estimate if switched on 3 taps (You, Market, country) plus letters typed in the country search or scrolling the list of about 240 countries, plus 1 for the optional region step | Not built yet; target 3 plus the search | Keep the picker hidden while the market is pinned to Canada |
| J10 | Change the three thresholds | 4 | 4 | Nothing to cut (three independent choices plus one to enter); fix the 40 px buttons |
| J11 | Reach the paywall | No tap path; only on hitting the free-scan limit | 2 (You, then the Pexi Plus row) and 0 at the limit | Adds the missing entry; needed for Restore purchases |

Status of the table's numbers: every "Taps today" figure is counted from the app's code on 2026-10-09 (J3 and J9 are counts of switched-off paths and say so). Every "Target" is derived by logic from R-25 and R-26 and is untested; the tests are in section 10. Who "stays" or "goes" in J1 is fixed by the rulings named in the row.

**R-24. First launch to first verdict: 8 taps today, 6 target**
Now: counted 8 app taps and 1 OS tap: Permissions Continue (1), Consent Continue (2), the phone's camera Allow (OS), scan press (3), pad 4, point, 9, 9 (4 to 7), confirm (8). With the price skipped it is 4 app taps. With the welcome flow off, as it is now, the Consent screen has one Continue and no switches (its location switch is drawn only when the welcome flow is on), and Permissions decides nothing if left alone. The welcome flow (25 visible steps, each a Continue, with Skip all) is switched off; if it were on, the first verdict would cost 33 taps, or 9 with Skip all.
Should: 6 app taps + 1 OS: Permissions Continue (1), Consent Continue (2), OS Allow, price 3 digits and confirm (4), with the scan press gone (R-25). With the price skipped: 3 app taps. Both screens stay (fixed by ruling: location is asked once, on the permission screen; and the drafted consent wording, which names the model provider and the retention period, ships, so it needs a place to be shown). An option for the founder that no ruling covers: fold the consent sentence under the permission screen's Continue, which gives 5 app taps (2 if skipped); I do not recommend it before the people who own the consent wording say a bare notice is enough. The attitude picker stays out of first run (it is reachable in You in 2 taps).
Why: [E65] "design a flow that's fast, fun, and optional" and "Postpone nonessential setup flows or customization steps." [E66] "tutorials didn't improve task performance" and "Even if users decide to skip your onboarding, they still have to click or tap to do so." [E118] reviewers of a calorie app: "Onboarding too long", "Too many arbitrary questions before use". [E5] the rulings "Location is asked once", "Consent wording delegated" and "Location and photo consent default off until answered" keep the two screens. [A] The two screens decide nothing today, so the 2 taps are the cost of the rulings, not of a design choice; valid by reading what is on them. Test: ask the people who own the consent wording whether a bare notice under the permission screen is enough; if yes, the 5-tap option opens.
Figure status: 8, 33, 9, 4: counted. 6 and 3: derived by logic from the counted 8 and 4, untested. 5 and 2 (the option): derived by logic. The vendor claim that flows over 5 screens complete under 60% and 3 or fewer above 80% is SNIPPET and untraceable [E68]; I do not rely on it.

**R-25. Returning scan to verdict: 6 taps today, 4 target, by letting a detected barcode fire on its own**
Now: counted 6 taps: scan press (1), 4, point, 9, 9 (2 to 5), confirm (6). Detection alone cannot fire the scan: the code's own comment says the scan press is the only way a barcode ever leaves the camera reader. The reader reads every frame and lights the scan control when a code has settled.
Should: a barcode that is detected and steady for 150 ms fires with no press. A caption with the item name then appears on the pad so a wrong item can be caught before the price is typed (R-36). Combined with the cents-first pad (R-26): 3 digits and confirm, 4 taps.
Why: [E5] "Barcode reading is continuous, highlighted every frame"; the design's first run has "No shutter press" [E3]. The closest analogue fires with no shutter and "filters unintended barcodes, filters duplicate re-scans" [E114]. [E13] a large touch area and a held overlay confirm the capture. [A] Pointing a phone at a barcode is already a deliberate act, so a press adds a tap without adding a decision; valid because a store shopper aims one barcode at a time. Risk: two barcodes in frame. Test: in 50 scans in a real aisle count wrong-item captures; pass: under 2 in 50, and every one repairable in 1 tap.
Figure status: 6 and 4: counted and derived. 150 ms hold: borrowed from [E13] (benchmark-backed for confirmation); the steadiness threshold is untested.

**R-26. Price pad: cents-first, so $4.99 is 3 digits and a confirm**
Now: a custom pad of on-screen buttons: 1 to 9, point, 0, backspace, confirm; max 2 decimals; a point on an empty field gives "0."; confirm is off until the price is above zero; a faint ".00" is shown until typed. Keys are 17 px type (15 px short labels). $4.99 costs 5 taps; a whole-dollar $5 costs 2 taps.
Should: digits fill from the right like a card machine: 4 shows $0.04, 49 shows $0.49, 499 shows $4.99; backspace removes the last digit; no point key. $4.99 costs 4 taps, $5.00 costs 4 (it was 2), $12.49 costs 5. Keep the Skip key and the percent-off and multi-buy keys that show their own arithmetic.
Why: [A] Shelf tags in a Canadian store almost always show cents, and shoppers use card machines every week, so the entry style is familiar; valid but it makes round-dollar prices 2 taps worse, and the share of round-dollar tags is not known (section 11). The existing guard that offers "Did you mean $4.99?" when a price is more than 4 sigma out and a x100 reading fits [E4] limits the cost of a slip. [E26] purpose-built numeric keys have far larger hit areas than the standard keyboard; no study compares a custom pad with the phone's decimal pad (section 11). [E27] the "decimal" type exists for a native field. Test: 20 testers each key 10 real tags (mixed .99, .49, .00): median taps and wrong-price rate against today's pad. Pass: wrong-price rate no higher than today, median taps 4 or fewer.
Figure status: 4, 5, 2: counted or derived by arithmetic. The choice itself: untested.

**R-27. Photo with no barcode: not built yet, target 5**
Now: not possible. The shutter is removed from the screen and pressing the photo area says "Point me at the barcode". Counted estimate if switched on: shutter (1), price keys and confirm (5), 6 in all.
Should: when photo identification returns it should cost the barcode path plus one shutter press: 5 taps with the cents-first pad.
Why: [A] The photo path adds exactly one action (the shutter) to the barcode path; valid by definition of the two flows. Photo identification stays off in version 1 per the design's floor [E3]. Test: when built, count taps from launch in a script of 10 scans; pass: 5 or fewer for 9 of 10.
Figure status: 5: derived by logic. The "6" is a estimate if switched on, not a count of a working path.

**R-28. Typed name to verdict: merge submit and pick into one tap on a suggestion**
Now: counted: keyboard button (1), N letters, submit (1), pad 5 taps, plus a pick from the typed-pick sheet when shown (0 or 1): N + 7 or N + 8. The unknown-barcode path has the same count: the scan press replaces the keyboard button, the pad comes before the name field, and the name is then typed and submitted (N + 7, or N + 8 when the typed-pick sheet appears). The price typed on the pad rides along, so it is not asked twice.
Should: suggestions appear after the third letter; tapping one both submits and picks. With the cents-first pad: 1 + N' + 1 + 4 = N' + 6, where N' is the letters the shopper needed (most stop early). The name field is 48 px high with the keyboard type for text.
Why: [A] Showing matches as the shopper types removes one tap and shortens typing; valid because each suggestion tap replaces a submit tap and a pick tap and search by name is already built. Test: with 20 products, median letters typed before a suggestion is tapped is 5 or fewer, and the right item is in the top 3 for 8 of 10 products. [E3] unknown-barcode flows must ask the name, then take the typed path; a typed name that matches nothing still gets Claude's typical price [E4].
Figure status: N + 7 and N + 8: counted. N' + 6: derived by logic. 3 letters, 5 letters, 8 of 10: untested.

**R-29. Verdict to Saved is 1 tap; keep**
Now: 1 tap on the primary button at the first sheet position. It changes to "Saved" in place.
Should: Now equals Should; keep. The label stays tier-keyed (fixed by ruling) but the confirmation line must not promise an alert (R-22).
Why: [E5] "The primary action (Save/Watch, tier-keyed) sits in the peek detent, needing no drag". [E3] "putting a gesture between the user and the one act the design says matters costs saves for nothing."
Figure status: 1 tap: counted.

**R-30. Correction: 8 or 10 taps today, 3 or 4 target**
Now: counted: grabber (1), Correct it (2), price 4, point, 9, 9 (3 to 6), shop field tap and a suggestion if not prefilled (7, 8), Save (7 or 9), Done (8 or 10); an optional "On sale" chip is +1. The correction opens as its own route, which repaints the screen. Save is off until both price and shop are filled.
Should: the correction is part of the same sheet, so the frozen picture stays. Price is prefilled with the price the shopper just typed; shop is prefilled when known, otherwise the 3 nearest shops show as buttons without opening a field. Save returns to the live viewfinder with a short toast; no Done screen. Taps: grabber, Correct it, Save: 3, or 4 when a shop button must be tapped.
Why: [E3] "The correction never leaves the frozen frame" and "The session ends on the viewfinder, never on a confirmation screen." [A] The shopper has just typed the tag price, so for a "the shelf says" correction the price is already known; valid because the correction records an observed shelf price, not a different number. Test: share of corrections where the shopper edits the prefilled price; pass: under 30% (if more, the prefill is wrong for the real use). [E28] validate values as entered.
Figure status: 8, 10: counted. 3 and 4: derived by logic. 30%: untested.

**R-31. Share: 3 taps in the app, but the third must open the phone's share sheet**
Now: counted: grabber (1), Share (2), Save image or Copy text (3). There is no native share sheet; the code never calls the phone's share function. The card carries no download link.
Should: the third tap is the phone's own share sheet with the image attached, so one more tap reaches a chat app. Keep Save image and Copy text inside it. Keep no link (fixed by ruling). Back to camera is a swipe, not a tap.
Why: [E5] share exports carry no download link. [A] Cards travel through chat apps; today the shopper must save the image, leave Pexi, open a chat and attach it (about 6 or more actions, counted by hand, not measured); valid because that is the only route the code offers. Test: from tapping Share, median taps to reach a friend's chat thread with the card attached; pass: 4 or fewer, where today it is 6 or more.
Figure status: 3: counted. The 6 or more: derived by logic. 4: untested.

**R-32. Saved list to the last verdict: 2 taps; keep**
Now: counted: Saved (1), row (2) opens a read-only view, a centred card; Close, a tap outside the card, or the Escape key (3) closes it. There is no swipe to close it.
Should: the 2 taps to see and the 3rd tap to close stay. Add a swipe down to close the card, a new ask, because the card is a sheet-like surface and a close button is kept beside it.
Why: [E24] a sheet should support "swiping to dismiss", and [E23] keep a close button as well. [A] A read-only view of an old answer needs no actions; valid because Save, Correct and Share apply to a fresh scan. [A] Adding the swipe costs no tap and matches the verdict sheet's drag; valid because the camera's sheets already close that way; test: 5 testers close the card with no hint; pass: 5 of 5 within 5 seconds.
Figure status: 2 and 3: counted. The swipe: derived by logic; 5 of 5 within 5 seconds: untested.

**R-33. Change market: not built yet; keep hidden while pinned to Canada**
Now: the market picker exists but the router refuses it while the market picker is switched off, and the You row is hidden. Counted estimate if switched on: You (1), Market (2), country (3), plus letters typed in the picker's search box or scrolling its list of about 240 countries, plus 1 for the optional region step when the country has regions.
Should: target 3 taps plus the search when switched on. While pinned, the verdict caption names the market ("in Canada") so a visitor from elsewhere is not misled.
Why: [E2] "an unscoped range is a confidently wrong verdict waiting to happen" and the market is named on the verdict. [E36] Canada has no federal unit-price rule and Quebec alone requires unit prices by law [E37 SNIPPET], so markets differ in what a shelf shows. [A] A visitor from the US scanning in Canada is the main way a wrong-market comparison happens; valid but untested. Test: ask 5 non-Canadian testers "which country are these prices from?" without looking at the settings; pass: 5 of 5 answer Canada.
Figure status: 3: estimate if switched on, not counted from a working path.

**R-34. Change the three thresholds: 4 taps; keep, fix the 40 px buttons**
Now: counted: You (1), great (2), good (3), bad (4), each a row of 6 choices; the percent choices are 5, 10, 15, 20, 25, 30, the amount choices 1, 2, 3, 5, 10, 20; a unit switch picks between them; great is never allowed below good. The buttons are 40 px high. How far the page scrolls to reach them is not in the code.
Should: Now equals Should for tap count. Raise the buttons to 44 px (R-13). Show a worked example under the pickers, such as "Typical price $4.40: great is $3.08 or less". Defaults stay great 30% under, good 20% under, bad 20% over.
Why: [E16] 44 pt hit region. [E5] the shopper's own thresholds set the verdict (fixed by ruling; defaults are the founder's numbers). [A] A worked example shows what the setting does without a trial scan; valid because the setting is abstract until it is applied. Test: ask 5 testers to set "great means 25% under" using the screen; pass: 5 of 5 on the first try and 5 of 5 can say what price counts as great for a $4.40 item.
Figure status: 4: counted. $3.08: arithmetic on 30%. Pass numbers: untested.

**R-35. Add a way to reach the paywall: 2 taps from You**
Now: counted: no tap path at all. The paywall opens only when the server replies that the free scans are used up. Its Restore purchases button is therefore unreachable until the limit is hit. A browser build shows only "Subscribe in the app".
Should: a "Pexi Plus" row in You, 2 taps from the camera, opening the same paywall with the same Restore purchases. At the limit it opens automatically as now.
Why: [E82] a sign-up screen must offer "A way for current subscribers to sign in or restore purchases" with Terms and Privacy links. A subscriber with a new phone cannot restore. [E65] "Prefer letting people experience your app or game before prompting them for ratings or purchases"; a row in You is passive and chosen, not a prompt. [E83] "In-app promotions that do not clearly demonstrate that a user can access content without a subscription" is a violation, so the entry must not read as a wall.
Figure status: 2: derived by logic.

---

## 3. Screen by screen

The design lists forty screens or states. Taps are counted from a cold launch, as a returning user unless the row says first launch. "Target" uses the targets set in section 2 (barcode fires on its own, cents-first pad), so a verdict is 4 taps instead of 6. Where the code has no counterpart the row says "not built". The code mapping for screens 25 to 30 was made by what the code does, not by reading the design's row text (stated by the person who counted).

| # | Screen | Purpose | Taps today | Target | Must be on it / must not | Change |
|---|---|---|---|---|---|---|
| 1 | First run, cold open | Reach a live camera | First launch 2 (Permissions, Consent), returning 0 | First launch 2 (kept by ruling), returning 0 | Must: live feed, aim line, bottom bar. Must not: splash, login, tutorial, any screen that blocks the camera | R-7, R-9, R-24 |
| 2 | Attitude picker | Choose Deadpan, Warm or Blunt | Not shown on first run; You (1) then a choice (2) | 2, stays in You | Must: three options each with a sample line, Deadpan chosen. Must not: blocking the camera | Keep, R-24, section 6 |
| 3 | Permission screen | Explain the camera and location asks once | First screen, 1 tap, camera row, location row and a demo link | 1 tap, same screen, both rows kept by ruling | Must: one sentence per row, one button. Must not: demo link | R-9, R-10 |
| 4 | Phone camera prompt | The phone's own ask | 0 app taps + 1 OS | Same | Must: a one-sentence purpose line. Must not: a lookalike alert | R-9 |
| 5 | Camera denied | Keep going without a camera | 0 more taps; typed route 1 | Same | Must: a drawn shelf, the typed route in the scan control's place, a way to Settings. Must not: a wall or a second ask | R-9 |
| 6 | Camera idle | Wait for a barcode | 0 | 0 | Must: "Point at a barcode.", reticle. Must not: anything in the centre | Keep |
| 7 | Hint escalated | Offer the typed route after 4 s | 0 (timer 4000 ms) | 0 | Must: "No barcode to scan? Type the product name." Must not: a second hint | Keep, section 6 |
| 8 | Torch on | Light a dark barcode | 1 tap (48 px), auto mode default | 1 | Must: a visible lit state. Must not: a modal | R-12, R-13 |
| 9 | Identifying | Show what was caught | 1 (scan press) | 0 | Must: reticle contracting, "Looking it up". Must not: a spinner | R-25 |
| 10 | Identity chip | Catch a wrong item early | Does not exist on a barcode scan: the pad shows the barcode digits, not a name. "Not this" appears on the pad only after an ambiguous typed name (1 tap). After a verdict the name shows on the sheet and the repair is Correct it (verdict + 2) | Name and size on the pad before the price; 1 tap to repair | Must: name and size. Must not: barcode digits | R-36 |
| 11 | Price pad | Enter the tag price | scan (1) then 4 presses + confirm | 3 digits + confirm (4 for $4.99) | Must: ghosted amount, Skip, percent-off, multi-buy. Must not: a native keyboard | R-26 |
| 12 | Working | Show steps | 0 | 0 | Must: named steps, "Still on it." after 800 ms. Must not: "Loading" | R-19 |
| 13 | Verdict: good | The answer | 6 | 4 | See R-40 | R-40 |
| 14 | Verdict: great | The answer | 6 | 4 | See R-40 | R-40 |
| 15 | Verdict: reasonable | The answer | 6 | 4 | See R-40 | R-40 |
| 16 | Verdict: bad | The answer | 6 | 4 | See R-40 | R-40 |
| 17 | Verdict: bad, far over | The answer past the edge | 6 | 4 | Must: dot pinned at the edge with a multiple ("3x the typical price") | R-40 |
| 18 | Verdict: low confidence | The answer with doubt | 6 | 4 | Must: hollow field, wide bell, plain face, the line and the reason. Must not: red, shout, intense face | R-40, section 5 |
| 19 | Going-rate card | The range, no asking price | scan (1) + Skip (2) | 1 (Skip) | Must: range as hero, seller count, one button "Tell me the price" | R-37 |
| 20 | Half position | Correct it, Share | verdict + 1 | verdict + 1 | Must: labelled dots, confidence sentence, provenance, Correct it, Share, thumbs | R-38 |
| 21 | Full position | Everything used | verdict + 2 | verdict + 2 | Spread and provenance live at half today, not here | Keep |
| 22 | Correction | Report a real price | verdict + 2 to open (route) | verdict + 2 to open (same sheet), 3 in all | Must: prefilled price and shop. Must not: a Done screen | R-30 |
| 23 | Save acknowledged | Confirm Save | verdict + 1 | verdict + 1 | Must: label becomes "Saved" in place. Must not: a promise of alerts | R-22, R-29 |
| 24 | Thumbs and reason | Rate the answer | verdict + grabber x2 + thumb | verdict + 1 + thumb | Must: Undo | R-38, section 9 |
| 25 | Unknown barcode | Ask the name | scan + pad 5 + N letters + submit (+1 pick): N + 7 or N + 8 | N' + 6 | Must: one field, suggestions | R-28 |
| 26 | Unsure which one | Pick one of three | 0 or 1 | 1 | Must: three choices | R-28 |
| 27 | Outside the catalogue | Claude's typical price | same as a verdict | same | Must: low-confidence treatment and why | R-40 |
| 28 | Low-confidence answer | Same screen as 18 | 6 | 4 | As row 18 | R-40 |
| 29 | Suspect price | "Did you mean $4.99?" | 1 to accept | 1 | Must: the chart still showing | R-39 |
| 30 | Type it instead | Typed route | keyboard (1) + N + submit | 1 + N' + 1 | Must: the line naming brand and model | R-28 |
| 31 | Saved, empty | Teach and point | 1 | 1 | Must: a sentence and a button to the camera | Section 9 |
| 32 | Saved, items | Review | 1, row 2 | 1, row 2 | Must: name, size, delta, when saved | Section 4, 9 |
| 33 | Saved, a price dropped | Price dropped | Not reachable (feed switched off) | Not built | Not in version 1 | Fixed by ruling, R-21 |
| 34 | Recently removed | Restore | 2 | 2 | Must: "N days left" | Section 9 |
| 35 | Past scans | History | 2 | 2 | Must: each row in the confidence it had | Section 9 |
| 36 | Share card | Export a picture | verdict + 2, +1 to save | same + share sheet | Must: verdict word, face, price. Must not: a link | R-31, section 4 |
| 37 | Paywall | Offer Plus | No tap path | 2 from You | See section 7 | R-35, section 7 |
| 38 | Out of scans | The one answer without a chart | same screen as 37 | same | See section 7 | Section 7 |
| 39 | You | Settings | 1 | 1 | Must: personality, thresholds, haptics, torch, theme, Plus | R-34, R-35 |
| 40 | Market picker | Choose a market | Not reachable; 3 if switched on plus the country search (+1 for the optional region) | Not built | Pinned to Canada | R-33 |

Extra screens the code has that the design list lacks:

| Screen | Purpose | Taps today | Target | Change |
|---|---|---|---|---|
| Consent | One Continue, no switches while the welcome flow is off | First launch tap 2 | Kept (fixed by ruling); folding it is an option for the founder | R-24 |
| Welcome flow | 25 visible steps, Skip all on every step | Switched off today | Stays switched off in version 1 | Section 7 |
| Savings overview | Recently scanned only; Total Saved and Goal hidden | You (1), row (2) | Same; keep the totals hidden (fixed by ruling) | Section 4 |
| Licences | Legal list | You (1), row (2) | Same | Keep; contents not read |
| Correct, pick an item | From You, "Report a wrong price" | You (1), row (2) | Same, up to 5 recent items | Keep |
| Server-fault sheet | Pexi's own fault, Try again | on a server error | Same | Section 4 (errors) |
| Needs-connection sheet | Offline, Try again | on no connection | Same, plus the notice (R-20) | R-20 |
| Detail view | Read-only saved or past scan | row tap, Close | Same | R-32 |
| Typed-name sheet | Same as screen 30 | keyboard button (1) | Same | R-28 |

Status of the tables' numbers: "Taps today" figures are counted from the app's code on 2026-10-09 (a row says "not reachable" or "if switched on" where the path is off, and then the figure is an estimate of the switched-off path). "Target" figures are derived by logic from R-25 and R-26 and are untested. Times such as 4000 ms and 800 ms are counted from the code. Each row's last column names the block that holds the evidence.

**R-36. Show the item name before the price pad, so a wrong item costs 1 tap, not a typed price**
Now: counted: on a barcode scan the price pad opens at once and its caption is the barcode digits; the catalogue is asked only after the price is confirmed. The "not this" text button exists on the pad but only for a typed name that matched ambiguously; a barcode scan never shows it. The item name first appears on the verdict sheet, and a wrong item is then repaired with Correct it (2 taps after the verdict, R-30). The catalogue lookup itself costs about 2 ms (counted from the code's own comment).
Should: look the barcode up at capture and show the resolved name with its size ("Kraft Dinner Original, 225 g") in place of the digits on the pad, before the price is typed. Tapping the name opens the existing wrong-item list, 1 tap.
Why: [A] Finding a wrong match before the shopper has typed a price saves the 5 taps they would otherwise lose; valid by counting. Wrong matches are a known failure of this category: a Canadian price app's reviewers write "Swapped a specific yogurt for another" and "Brand-specific price comparison wrong" [E120]; the closest analogue has "duplicated products with different ratings" [E115]; a wine scanner needs its vintage edited [E116]. The design also puts the chip here [E3]. Test: in 50 test scans count wrong items; pass: at least 80% of wrong items are repaired at the chip, before any price is typed.
Figure status: 80%: untested.

**R-37. Going-rate card: one tap to the range, one button to a verdict**
Now: counted: scan (1) and Skip on the pad (2). The card carries no asking price; it shows the bell with a small price field and a "place" button under it, so a price can be typed on the card itself.
Should: 1 tap (Skip). The card shows the range as its largest element ("$3.60 to $5.30"), the seller count in small type, and the existing price field with its button labelled "Tell me the price" (the field stays; only the label changes). It must not show a verdict word, a face reaction of approval, or any colour field. Typing the price turns it into a verdict with the same bell.
Why: fixed by ruling as quoted in the design documents (a neutral going-rate card instead of a refusal; I did not read that ruling's own text) [E2, E3]. [A] A shopper with nothing in front of them (the couch case) still gets full value from the range; valid because a range answers "what does this usually cost". Test: share of going-rate cards that end without "Tell me the price" and with no complaint; pass: testers rate the range useful on its own, 4 of 5.
Figure status: 1 tap: derived by logic. 4 of 5: untested.

**R-38. Move the thumbs to the half position**
Now: counted: thumbs up and down, a 4000 ms toast, and an optional reason after thumbs-down sit at the full position, reached by two grabber taps. A rating costs 3 taps after the verdict.
Should: thumbs sit beside Correct it and Share at the half position: grabber (1), thumb (2). The reason after a thumbs-down stays optional.
Why: [A] Feedback that costs 3 taps and a scroll will rarely be given; valid by counting, though the design deliberately rewards feedback with nothing. Test: share of verdicts that get a thumb at the full position versus at half; pass: at least 2 times as many at half in the same tester group.
Figure status: 2 and 3: counted. 2 times: untested.

**R-39. Suspect price: keep the one-tap offer with the chart still showing**
Now: when the typed price is far outside the range and a x100 reading or a per-kg reading fits, the verdict screen shows "Did you mean $X?" as a pill.
Should: Now equals Should; keep. Accepting costs 1 tap and the original price is 1 tap away; the chart stays visible.
Why: [E4] case 24: set when the price is more than 4 sigma out. [E28] "Dynamically validate field values." [E26] "typos were much more common on sites that relied on the standard keyboard for numeric inputs". Shelf tags themselves are sometimes wrong (a US audit found 26 stores overcharging by 18.4% on sale items) [E124], so the suggestion must not say the shopper erred.
Figure status: 4 sigma: benchmark-backed only as the design's own threshold; untested on real slips.

**R-40. The verdict screen: what is on it, in what order, how tall**
Now: counted: the first sheet position is as tall as its content (up to the screen height minus 120 px); the middle position is 72% (90% for the bell sheet); the full position is 92%. The design says the first position is 46%. Verdict word 34 px bold, asking price 72 px (64 on narrow), tabular figures.
Should: first position holds, top to bottom: verdict word, asking price with the seller's name, "Typical price, Pexi's estimate: $X" with the shopper's percent difference, the bell with the shopper's mark, the confidence label (and the "not fully confident" line with its reason when low), the item name and size, one wide button. Height by content, capped at 60% so the frozen picture of the product stays visible; the rest waits for a drag or the grabber tap. It must not show: the brand pink, a savings word, the barcode digits, the thumbs, a second button, or a face beside the market line.
Why: [E24] the medium detent is "about half" and exists "to allow progressive disclosure". [E2] the design: the verdict appears over the world the shopper is standing in; "The face never appears beside the market line". Arithmetic: on a screen 844 px tall, 46% is 388 px; the word (about 40), price (about 80), estimate line (about 28), a bell of at least 120, label (24), name (24), button with margin (64) already total 380, with no room left for the grabber and the safe area. [A] A cap above content height is harmless because the sheet is sized by content; valid for screens up to 6.7 inches; test by building the sheet on the shortest supported phone (640 px tall) and checking nothing is cut off.
Figure status: 60%: untested. 388 and 380: arithmetic from assumed line heights, derived by logic.

---

## 4. Data types

**R-41. Asking price: exact, two decimals, large**
Now: counted: cents divided by 100, always two decimals; "$4.99" in English; "--" for a non-number; no symbol when the currency is unknown. Hero 72 px (64 px under 380 px wide), weight 800, tight spacing, tabular figures. The pad shows a ghosted ".00" until typed and "0.00" when empty.
Should: Now equals Should; keep. Add a caption under it, "On the tag" and the seller. The number must be exactly what the shopper typed, never rounded. A multi-buy shows its arithmetic ("4 for $5.00 is $1.25 each") and the verdict uses the unit price shown. Where the price is a stand-in rather than a tag the shopper read, say so in a line.
Why: [E28] "configure a formatter to display the value in a specific way, such as with a certain number of decimal places, as a percentage, or as currency." [E32] tabular figures keep digits aligned. [E29] the false-precision effect (precise numbers read smaller and anchor harder) concerns an estimate; this is the shopper's own typed tag, so exactness is correct. A Canadian flyer app's top complaint is that its price is not the shelf's price [E123], so the shelf number the shopper reads wins. [A] 72 px reads at arm's length; valid because it is more than twice the iOS default body size of 17 [E60]; test: 5 testers read the price at 60 cm without squinting, 5 of 5.
Figure status: 72 and 64: counted. 60 cm: untested (the real in-aisle distance is not known, section 11).

**R-42. Typical price: round it, label it as an estimate, and compute the verdict from the rounded number**
Now: counted: same exact-cents format, labelled "Typical price, Pexi's estimate: $X", or "<n>% under the typical price, Pexi's estimate $X", or "Nx the typical price" when large.
Should: round the estimate before showing it: nearest 5 cents under $10, nearest 10 cents from $10 to $100, nearest dollar above $100. Compute the percent and the verdict zone from the rounded number, so what is on screen reproduces the verdict. Keep the label "Pexi's estimate". Show percent as whole numbers, never rounded to 5.
Why: [E29] "participants judged $395,425 as smaller than $395,000" and people adjust less from a precise anchor (SNIPPET): $4.37 reads as measured, $4.35 reads as a guess, which it is. [E125] flag the figure as an estimate and give the range: trust barely falls. [E121] Google's own price insight calls the figure a "typical price" drawn from sellers across the web, so the term is already familiar. The design already says the verdict is "computed against the number displayed" for the asking price [E2]; extending it to the estimate keeps the screen self-consistent. A displayed "20% under" must not sit beside the word "reasonable".
Figure status: the rounding steps are untested and derived by logic. No study of "about" or "est." before a price exists (section 11).

**R-43. The range: keep "8 in 10" and "to"**
Now: counted: the bell caption reads "Shaded: Pexi's estimate of 8 in 10 prices, $A to $B".
Should: Now equals Should; keep. Round the two ends the same way as the typical price. Give the chart an accessibility description that says the same sentence.
Why: [E125] a numeric range costs little trust; vague "we are uncertain" wording costs more. [E30] "to" is read by screen readers where a hyphen "will just ignore it" (SNIPPET; sources disagree and no lay-shopper study of "$4 to $6" against "$4-$6" exists, section 11). [E50] "accessibility labels that describe chart values". The 8 in 10 is the 10th to 90th percentile, so the wording is exact [E4].
Figure status: 8 in 10: benchmark-backed by the design's own definition.

**R-44. Verdict word: four words, sentence case, 34 px bold**
Now: counted: "Great price", "Good price", "Reasonable price", "Bad price", sentence case, 34 px, weight 800; on the share card 108 px. With no shopper price the headline is the item name.
Should: Now equals Should; keep. The word is always on screen with the price; it is never replaced by an icon.
Why: [E5] and [E4] the four words are the founder's (fixed by ruling). [E114] the closest analogue also uses four colour bands with words (Bad, Poor, Good, Excellent); [E115] a German consumer-group test praised the "colour-coded bars plus word grades" for beginners. [E60] 34 pt is the iOS Large Title size. [E55] colour never alone.
Figure status: 34: counted and matches the benchmark. 108 on the card: counted.

**R-45. Confidence: dots, a word, and a plain reason, together**
Now: the code stores a solid or hollow treatment and a label "We are not fully confident in this answer." with "Not fully confident: <why>" (default why "few prices for this item"). The inventory also says "dots, capped at 12", which reads like the count of price dots on the bell rather than a three-dot meter; whether the three-dot meter is built is not established. The share card prints an uppercase monospace confidence label.
Should: the first sheet position always shows a three-dot meter and its word: "Certain", "Fairly sure", "Not fully confident". Dots 10 px with 6 px gaps, never colour alone. On low confidence add the reason in plain words ("1 price found, blended with its category"). Never a number like "62%".
Why: [E125] the best format flags the figure as an estimate and gives the range; vague wording costs trust, so the reason must be specific. [E126] lay readers misread probabilities (43% answered "can't tell" correctly in a weather study, SNIPPET), so a percentage would invite misreading and a word with dots is safer. [E55] not colour alone. [E42] making low-confidence values less distinct has support from a map study. The design's three levels are "confidence guesses until the price bench can score each source" [E2], so a number would be false precision.
Figure status: 10 px and 6 px: untested. The levels: the design's own, unvalidated.

**R-46. Per-store dots: store, quantity, price, date; never drop the quantity**
Now: counted: a list "Prices Pexi has seen" with store and city or quantity, price, date, and "Sale". On the bell each dot label is store and quantity joined and cut at 20 characters, so a long store name can cut the quantity off.
Should: list rows 72 px tall: line one store and city, line two quantity and date, the price right-aligned in tabular figures, "Sale" as a tag. On the bell label at most four dots (the nearest to the shopper's price, the lowest, the highest, and one more); the quantity is always shown and the store name is shortened with a middle ellipsis.
Why: [E35] "an ellipsis in the middle of text can make an item easier to distinguish because it preserves both the beginning and the end". [E60] avoid truncating unless people can open the full text; the list is that view. [E38] people count up to about 5 items instantly (subitizing); more than that is slow. [E39] performance fell to that of density plots when many dots were crowded onto a small screen. [E94] two-line rows default to 72 (SNIPPET).
Figure status: 20 characters: counted. 4 labels: derived by logic from [E38]. 72: benchmark-backed but SNIPPET.

**R-47. Sale markers: a different shape and a word, kept out of the estimate**
Now: counted: the word "Sale" beside the dot's list row. The distribution rules store a dot as regular or sale and compute the estimate from regular prices [E4]; the design draws sales as separate dots [E2].
Should: a sale dot is a diamond (a regular dot is a circle) with "Sale" in its label, and the caption under the list says "Sale prices are not in the estimate."
Why: [E55] colour is not the only signal; a shape differs. [E4] regular prices set the centre. [A] Shoppers may think a sale price shown on the chart moves the typical price; valid because dots on a curve read as part of it; test: ask 5 testers "does the sale price change the typical price?"; pass: 5 of 5 say no.
Figure status: untested.

**R-48. Item name: two lines, then a middle ellipsis; size always visible**
Now: the item name is the headline when there is no shopper price, and sits under the bell otherwise; the share card wraps it to two lines at 46 px. Truncation on the sheet title was not verified.
Should: two lines at 16 to 17 px, then a middle ellipsis so the size at the end survives. The full name opens by tap. The name always begins with the brand.
Why: [E35] middle ellipsis preserves the end, where size and count usually sit. [E60] "Avoid truncating text in scrollable regions unless people can open a separate view". [A] Product names are brand first and size last in Canadian grocery data; valid for packaged goods, weaker for produce; test: check 100 catalogue names for size at the end; pass: 90 or more.
Figure status: 2 lines: derived by logic.

**R-49. Brand: part of the name, not a separate field**
Now: brand comes from the catalogue entry alongside name and size.
Should: show brand inside the name line, not as another row. Only when the name does not start with the brand do you prepend it. No logos.
Why: [A] A separate brand row adds a reading step on a screen read at arm's length; valid because the name already identifies the item; test: 5 testers shown a verdict with the brand only in the name, asked "which brand was it?"; pass: 5 of 5 answer correctly.
Figure status: untested.

**R-50. Size: always on the name; a per-unit price only as a side note**
Now: size comes from the catalogue or is read from the name. The design's count is that 79% of Canadian food items in the catalogue have no size; the engine then assumes one and widens the bell [E4].
Should: size is always in the name line. When the size was assumed the provenance line says "Size assumed" and the bell is wider. A larger pack's unit price shows as a one-line side note (such as "per 100 g"), never inside the bell.
Why: [E4] bulk comparison stays inside a half-to-double size band; a bigger pack's unit price is "a side note, never folded into the bell". [E36] unit pricing is only a recommendation in Canada and required by law only in Quebec [E37 SNIPPET], so shelves differ and the unit price must be stated. [A] A shopper who sees $4.99 for 225 g beside a unit price they cannot find on the shelf is confused; valid but untested.
Figure status: 79%: benchmark-backed by the design's own count (from the catalogue). Band half to double: the design's.

**R-51. Barcode: never shown on the verdict; shown in mono only where a repair needs it**
Now: not shown as text anywhere read; it is passed to the lookup and the correction only.
Should: Now equals Should for the verdict. In the wrong-item repair and the correction view show the digits once in small monospace so a shopper can compare them with the pack if the match is wrong.
Why: [A] Shoppers do not check 13 digits, but a mismatch can only be found by comparing them; valid because the repair is the only place the digits help; test: 5 repairs; pass: the digit line is read in at most 1 of 5, confirming it is not needed on the verdict.
Figure status: untested.

**R-52. Market: name it on the verdict, hide the picker**
Now: fixed to "Canada"; the You row is hidden.
Should: the comparison caption says "Typical price in Canada, Pexi's estimate". The face never sits beside it.
Why: [E2] "The market is named on the verdict" and "The face never appears beside the market line". [E4] other-region data widens the bell by 25%.
Figure status: 25%: the design's own number.

**R-53. The scans-left line: this block owns it. Camera shows it only when 1 is left; You shows it whenever a limit is set**
Now: counted: there is no counter on the camera. You already has a line for this week's free scans (remaining and limit), but it sits inside the Pexi Plus block, which is hidden unless the phone has a link to manage a subscription, and the line itself shows only when the server sets a limit. The paywall shows used, limit and reset date only after the limit is hit. The numbers are server-side and set by ruling: 5 a week in the beta, 3 a week at public launch; typed searches are free and uncounted (fixed by ruling).
Should: no counter on the camera while two or more scans remain. When exactly 1 remains, one quiet line in the hint area ("1 scan left this week"). At 0 the paywall (section 7, which only shows the limit it already states). You shows the line "This week: 2 of 3 used" whenever the server sets a limit, outside the subscription block, together with a note that typed searches are free. This block is the one place that says where the quota line lives; R-79, R-84 and R-85 refer back to it. Record, for the first 1,000 scans, what share of users hit the wall in week one.
Why: [E82] a metered paywall allows access "to a finite amount of content for a specified duration" and should "include contextually relevant prompts ... when they near their monthly limit". [E3] a permanent meter is "the first thing the app says back" and caps the window shopper, the primary user. The closest analogue sets no cap [E115] and one reviewer of it argues "I don't think you'd want to limit product scans", so 3 a week is stricter than any comparable app found. No controlled study of a visible counter against a hidden one exists (section 11).
Figure status: 1 left: derived by logic. 5 and 3: fixed by ruling. The existing You line and its hiding rule: counted. Everything else untested; the test is in section 10.

**R-54. Saved-item delta: freeze it with a date**
Now: counted: a row shows "▼ $X under the usual" or "▲ $X over". The inventory does not say whether the usual is the estimate at the time of saving or the live estimate.
Should: show the saved price, the usual when saved and the difference, with the date: "$3.49, $0.80 under the usual, saved Oct 12". Do not change the shown difference when the estimate moves. If a re-check is offered it is a button and produces a new dated line.
Why: [E115] reviewers of the closest analogue complain of unstable scores: "I scanned a toner and it was 90 something and months later, I rescanned the same exact toner and now it's 47." [E2] the design: "OLMA rewrote its verdict sentence under the reader ... for a product whose only value is being trusted ... that is the cheapest way to lose it." Arrow plus words plus colour obeys [E55].
Figure status: no numbers.

**R-55. Dates: relative for a week, then absolute; never abbreviate the year**
Now: counted: "just now", "N min ago", "N h ago", "N d ago" (rounded); Removed shows "today" or "N day(s) ago" plus "N days left"; the share card prints an absolute date stamp in capitals; the paywall prints a long weekday date for the reset.
Should: relative up to 7 days, then absolute with a short month and a full year ("Oct 3, 2026"). A price seen more than 90 days ago is marked as old in its row. The share card keeps its absolute date; the paywall keeps weekday and date.
Why: [E33] relative stamps for recent items, absolute for older, and "don't abbreviate the year". [E34] several sources suggest relative for recent and absolute for older (SNIPPET). [E4] age matters to the answer: the 90-day window comes first, and data over a year old widens the bell by 25%. [A] A screenshot of a relative date becomes wrong in a day; valid, hence the card's absolute date.
Figure status: 7 days and 90 days: 90 is the design's own window (benchmark-backed by the distribution rules); 7 days is derived by logic.

**R-56. Provenance rows: say which source the estimate came from, in plain words**
Now: counted: monospace, 11 px, uppercase, wide letter spacing, in the faint ink; they say where the range came from, never the price.
Should: 12 px, muted ink (R-18). One row per source with count and newest date, using plain names: "3 prices from 3 shops, newest 3 days ago"; "Same product, other size, scaled"; "Typical for its category"; "The brand's usual markup on its category"; "Pexi's own estimate; no shop prices found". The last two always carry the not-fully-confident line.
Why: [E125] a specific verbal reason keeps trust; vague wording costs it. [E4] the ladder of sources, from own prices down to a Claude estimate with no web search. [E2] "the step that came up empty is named under the answer". Calibration is the point of this row.
Figure status: 12 px: untested; the source names come from the design's ladder.

**R-57. Thresholds: let "great" be stricter than the default**
Now: counted: percent choices 5, 10, 15, 20, 25, 30; amount choices 1, 2, 3, 5, 10, 20; a unit switch; great is never allowed below good. The defaults are great 30% under, good 20% under, bad 20% over, and 2, 1 and 1 in amount mode. Great's default is the largest choice in its row, so nobody can make great stricter than the default.
Should: extend great's percent choices to 35, 40 and 50, and bad's to 35, 40 and 50 if testers ask. The defaults are the founder's numbers and do not change.
Why: [A] A shopper who wants only deep discounts called great has no setting for it today; valid because the default sits at the end of the scale. Test: log choices; if more than 25% of testers who open the picker choose the top value for great, the scale is too short; otherwise leave it.
Figure status: 35, 40, 50: untested.

**R-58. Personality: three voices, wording only, sample line shown**
Now: counted: Deadpan (default, stored as nothing), Warm, Blunt; radio buttons in You, and in Setup if the flow is on. Every mascot line exists in three versions.
Should: each option shows one sample line in its voice so the choice is informed. Default stays Deadpan. The wording changes and the numbers and the verdict never do.
Why: [E5] "attitude changes wording only, never the number" (fixed by ruling). [E105] Duolingo's own guidance: helpful and supportive, never threatening, angry or mean, and sarcasm and smugness are avoided (SNIPPET); a Blunt voice must not slide into meanness. [A] Seeing a sample is the only way to tell the voices apart; valid by construction; test: 5 testers choose a voice then state what it would say about a bad price; pass: 4 of 5 predict the tone correctly.
Figure status: untested.

**R-59. Share card: nothing smaller than 32 px, no link, one verdict**
Now: counted: 1080 by 1350; "Pexi says <word>"; face 220 px; two-line sentence; item; "On the tag" and the asking price with the seller; "Elsewhere" with the median and the range; confidence label; wordmark; absolute date. Word 108 px, name 46 px. No link, and no difference shown between the two prices.
Should: every text on the card is at least 32 px at 1080 wide. Keep no link (fixed by ruling). The card shows the verdict word, the two prices and the date; it may also show the difference stated the same way as the verdict ("$0.80 under the usual"), never "saved".
Why: [A] The card is seen as a thumbnail about 390 px wide, a scale of 0.36, so a 32 px label is 11.6 px, just above the 11 px minimum [E60]; valid because chats and feeds shrink pictures. Test: view the card in a real chat thread at 100% zoom; pass: every word is readable by 5 of 5 people at arm's length. [E5] share exports carry no download link; no savings claim ships until measured.
Figure status: 32 and 0.36: derived by arithmetic. Pass numbers: untested.

**R-60. Errors and empty states: plain words, the cause owned, a way forward**
Now: counted: offline "I need a connection for this" with "Pexi needs an internet connection to look anything up, so I cannot answer this scan. Scan it again once you are connected."; server fault "Pexi hit a problem on its side" with "Your connection is fine. The fault is on Pexi's side and I could not answer this scan. Try again in a moment."; empties "Nothing here yet." (Saved), "Nothing removed.", "Nothing scanned yet."; button "Try again".
Should: error text stays plain and owned by Pexi, with no humour. Each empty state explains why it is empty and gives a path: Saved "Nothing saved yet. Scan something and tap Save it." with a button to the camera; Past scans "Nothing scanned yet." with the same button; Removed "Nothing removed." as one line with no header, no button (as the design says). "Try again" is 48 px high.
Why: [E106] "Take a positive tone and don't blame the user"; "Avoid humor since it can become stale if users encounter the error frequently"; "The proper usage of any system lies with its creators". [E92] empty states should "communicate system status", "provide learning cues" and "direct pathways for key tasks". [E93] "If a section is empty, explain why its content is unavailable."
Figure status: 48: benchmark-backed.

**R-61. Mascot lines: one or two short sentences, about 12 words, in a bubble of no more than two lines**
Now: counted: the default-voice lines run from 5 to 14 words (the great line has 14); the pad asks "What's the shelf price?"; the aim line "Point at a barcode."; the torch line "Torch on.".
Should: at most 12 words and two short sentences per line, and at most two lines in the bubble at 14 px. Lines in the Warm and Blunt voices obey the same limit. No line contains a number that is not on screen, and none contains an em dash.
Why: [A] A line read while holding a phone up must be read at a glance; valid because the aim, torch and pad lines already run 3 to 5 words and work. No published length limit for a character line exists (section 11). The nearest rules are "a brief, complete sentence" [E64] and single words for tab labels [E93]. Test: 5 testers read each line once for 2 seconds; pass: each can repeat the meaning.
Figure status: 12 words: untested.

---

## 5. The verdict chart

**R-62. Keep the bell; do not replace it with a dot chart**
Now: the chart is a bell curve of this item's estimated prices with the shaded 8-in-10 band, the shopper's price marked, and labelled dots for recorded prices. Fixed by ruling: "an animated normal distribution chart of this item's estimated prices, with the shopper's price marked where it falls".
Should: Now equals Should; keep the bell. Note the evidence honestly: on phones, quantile dot charts beat smooth density curves for lay readers, and the bell is the weaker format on accuracy but the stronger on looks.
Why: [E38] quantile dotplots "reduce the variance of probabilistic estimates by ~1.15 times compared to density plots"; density "had the highest visual appeal" while dotplots with 20 dots were less appealing. [E39] decisions with 50-dot plots reached 97% of the best possible payoff, 5 points above the control. [E40] for a single quantity, accuracy was "similar with all three representations", so animating single outcomes (hypothetical outcome plots) gives no accuracy gain here, and their trend benefit [E41] (SNIPPET) does not apply to one price band. [E5] the bell is fixed by ruling, and the dots of recorded prices on it already give some of the dotplot's benefit.
Figure status: 1.15 times and 97%: benchmark-backed (FETCHED). These were bus-arrival studies with 71% male, 90% existing-app-user samples [E38]; transfer to shoppers is an assumption.

**R-63. Test a 20-dot strip as an alternative reading of the shaded band (not for version 1)**
Now: no dot strip exists.
Should: as an experiment only: under the bell, 20 equal-weight dots, each one a 5% slice of the estimate, the shopper's price highlighted among them. Compare it against the bell in the first tester round.
Why: [E38] "In dotplot-20, people can count quickly by using subitizing ... we recommend discrete outcome plots with few enough outcomes to take advantage of subitizing." [E39] "people's performance degraded to that of PDFs when dotplots with higher numbers of dots were used on a space-constrained screen", tested only at 20 and 50 dots. [A] Twenty dots fit one row on a 360 px screen at 12 px each; valid by arithmetic (240 px plus gaps). Test: 10 testers each see 6 paired verdicts, strip versus bell, and say which price is better; pass: the strip is correct on at least 1 more of 6 on average, else drop it.
Figure status: 20: benchmark-backed. The pass margin: untested.

**R-64. Keep the log-price fit; draw no log tick numbers**
Now: the bell is fitted on log price and drawn on a log price axis, so it is a normal curve, cannot reach a negative price and keeps wide categories (wine) honest. This is a design call made on 2026-09-30, not a ruling.
Should: keep the fit. Show no axis numerals; label only the marks: the two ends of the band, the typical price and the shopper's price, each in dollars. For a typical item the difference from a linear axis is small: a spread (log standard deviation) of 0.15 makes the 10th to 90th range 1.47 times; 0.3 makes it 2.16 times; 0.5 makes it 3.6 times.
Why: [E4] the log fit and its reasons. [E47] log-axis graphs led laypeople to "less accurate predictions", but the study is about growing counts (disease) read as a trend, not a one-item price band (SNIPPET); [E48] a second report found 40.66% correct on log against 83.79% on linear (confounded by the axis starting at 0.1, SNIPPET); [E49] trained readers got 56% right on log-log against 93% on linear (SNIPPET). None tests this use. [A] With no numerals and labelled marks, the reader judges position only; valid because [E52] position along a common scale is the most accurately read channel. Test: show 10 testers the same price on a log-drawn and a linear-drawn bell and ask "cheap third, middle third or dear third?"; pass: the answers match for 8 of 10 when the spread is 0.3 or less.
Figure status: 1.47, 2.16, 3.6: arithmetic (exp of 2.563 times the spread), derived by logic. Evidence on log axes: SNIPPET only.

**R-65. The face is a point estimate and will swamp the bell unless the bell is made hard to miss**
Now: the face shows one verdict and the bell shows the spread; both are on the first sheet position.
Should: the shaded band and its two dollar ends sit directly under the verdict word; the typical price is always worded as an estimate; at low confidence the face is plain and the band is wide. Do not draw a bold line at the middle of the bell that looks like a fact.
Why: [E53] adding a point mean to an uncertainty display gives a "small biasing effect" toward discounting the uncertainty (SNIPPET); the face is a stronger point estimate than a mean tick. [E44] a cumulative curve shown alone "can severely mislead some subjects in estimating the mean", and the authors suggest marking the mean on the display, so a labelled typical price does belong on the chart (SNIPPET). [E43] viewers often read an uncertainty graphic as "some deterministic quantity" and "users sometimes fail to realize the graphic depicts uncertainty" (SNIPPET). [A] The estimate line plus the dollar ends tell the reader this is a range; valid because a range with numbers is a known fix [E125]. Test: after a certain verdict and a low-confidence verdict, ask 10 testers "how sure is the app, from 1 to 5?"; pass: the low-confidence mean is at least 1 point lower.
Figure status: 1 point: untested.

**R-66. Hollow against solid: keep, and test that it reads as "less sure"**
Now: counted: confidence is shown by a solid field (certain, fairly sure) or a hollow one (12% tint of the hue with a 2 px border, from the design) and a label; the low-confidence refusal look (dashed outline) belongs to the retired refusal.
Should: Now equals Should; keep. Certain and fairly sure share one solid look and differ only by the dots and the word. Do not add a fourth look.
Why: [E42] value-suppressing palettes make high-uncertainty values less distinct, and people then "weighted uncertainty more" (tested on maps with a paid crowd sample, not on bell charts). [E45] in a symbol study, fuzziness, location and value each scored above 5.0 for intuitive uncertainty, with fuzziness and location highest, so a wider bell (location) plus a paler fill (value) fits. [E46] blur, dashing and sketchiness were all viable (SNIPPET). Whether a hollow bell reads as "unsure" to a lay shopper is untested. Test: show 10 testers a hollow and a solid verdict for 3 seconds at arm's length: "which one is less sure?"; pass: 9 of 10.
Figure status: 12% and 2 px: the design's own, untested. 9 of 10: untested.

**R-67. Mark the shopper's price with a vertical line, a dot on the curve and a bold label in the ink colour**
Now: the shopper's price is marked where it falls on the bell. A price beyond the 1st or 99th percentile is pinned at the edge with a multiple ("3x the typical price").
Should: a 2 px vertical line from the base to the top of the curve, a 12 px dot where it meets the curve, and the price in bold 16 px above, all in the main ink colour, not the verdict hue, so the mark reads in glare against any verdict field. At the edge the line becomes an arrow and the label reads "$4.99, 3x the typical price". Where the price is less than 15% from the typical, still draw it; never hide it.
Why: [E52] "position along a common scale" is read most accurately, so the mark's position is the message (SNIPPET). [E51] graphic marks need 3:1 against neighbours. [E54] 16 px bold is not "large" (needs 14 pt bold, about 18.7 px), so it must clear 4.5. [A] Ink against any verdict hue clears the contrast floor in both themes; valid because the verdict hues are mid-tone fields with dark or light text already tuned for 4.5; test by computing the ratios (R-15).
Figure status: 2, 12, 16 px: untested. 3:1 and 4.5: benchmark-backed.

**R-68. Minimum chart sizes**
Now: no sizes are recorded for the chart in the inventory. The caption and dot labels use the small text styles.
Should: chart at least 120 px tall and as wide as the sheet's content (at least 300 px on a 360 px screen); dots 10 px or more across; any label at least 12 px; marks 3:1 against the field; no more than 4 labels at once (R-46).
Why: no published minimum size for a phone chart or chart label exists (section 11). The nearest hard numbers are the 11 pt text floor [E60] and the 3:1 mark contrast [E51]. [E50] "you might want to use a small chart to offer glanceable information about an individual item". [A] 120 px fits a curve plus a labelled mark; valid by arithmetic with the 46% to 60% sheet budget in R-40; test: five testers read the shopper's position on a 360 by 640 phone; pass: 5 of 5.
Figure status: all sizes untested, derived by logic.

**R-69. What low confidence looks like**
Now: counted: the hollow treatment, a wide bell, the line "We are not fully confident in this answer." and "Not fully confident: <why>".
Should: the same layout as any verdict. Hue of the verdict kept (a low-confidence "bad" is still a pale red outline), plain face with no intense form, no shake and no buzz, the band wide enough to cover what the engine says and not clamped to the screen (if an end runs off the chart show a small arrow). The reason line stays visible at the first position, not hidden at half.
Why: [E2] and [E3] "A hollow field with a shouting face is a wrong verdict delivered confidently, which is the exact failure the priority order is written against." Red means the price is bad and never means doubt. [E125] specific reasons keep trust. [A] A clamped band would understate doubt; valid because the band is the doubt. Test: 10 testers read a low-confidence verdict and say how sure the app is; pass: 9 of 10 say "not very".
Figure status: no numbers except the pass line; untested.

**R-70. What it looks like with no asking price**
Now: counted: the going-rate card carries no asking price; the same bell appears without the shopper's mark.
Should: the bell without a mark, the range ("$3.60 to $5.30") as the largest element, "Based on 4 sellers" in small type, no verdict word, no colour field, and one button "Tell me the price". No placeholder dot (a ghost dot could read as a verdict).
Why: [E3] couch script: "the going rate: the same bell, drawn with no shopper dot, and the dot appears when the price is typed." [E2] the range as the hero. [A] A ghost dot or a dotted line at the middle would be read as the verdict; valid because the mark is the verdict's only carrier; test: 5 testers shown the card are asked "is this price good or bad?"; pass: 5 of 5 say "I can't tell without a price".
Figure status: no numbers except 4 sellers as an example.

---

## 6. The mascot

**R-71. Where the mascot appears, and where it must not**
Now: counted sizes: 36 px under the viewfinder frame (the hint), 76 px while working, 96 px on the verdict (design), 62 px on the save line, 28 px in list rows, 220 px on the share card, plus the personality picker, the paywall and empty states.
Should: appears on: the aim hint, the working step, the verdict, the save line, the paywall, empty states, the share card, the picker. Must not appear: beside the market line, inside or on the chart, animated in list rows, over the phone's own permission prompt, in a smiling or approving state on any error or low-confidence answer.
Why: [E2] "The face never appears beside the market line: the market is a fact about the referent" and "Row faces never animate." [E114]: the closest analogue's scan screens and its scanner vendor's case study show no mascot (the case study gives about 80 million users), but the same walkthrough records a mascot that animates with the slider on its subscription screen (what it looks like is not stated). The two sources disagree on whether it has one, so this block does not claim that it has none; what the evidence supports is that its scanning and result screens are not mascot-led, and that a mascot is not needed for the category to lead. A mascot-led price check is a deliberate difference on those screens. [E112] a companion-pet app's reviews show attachment but "review data shows what users say, not proof that attachment causes retention", and 27% of its iOS negative reviews tag pricing. [E113] Clippy's failure is attributed to timing and intrusiveness (SNIPPET). No study of a mascot on a price verdict exists (section 11).
Figure status: sizes: counted from the code or the design. The rest is a design judgment.

**R-72. Expression on a wrong or low-confidence answer: plain, never intense**
Now: the design gates the intense forms (delighted on great, angry on a far-over bad) behind confidence. The code detail was not read.
Should: intense forms only when confidence is certain or fairly sure. At low confidence the face is plain, with no intense hold, and the words carry the doubt ("We are not fully confident in this answer"). A face never smiles at a low-confidence great price. The angry form, if kept, points at the price, never at the shopper.
Why: [E3] drop-off 7: "A low confidence verdict never gets an intense face and never gets a loud line." [E110] "anthropomorphic design is an effective trust shield" after failures, and the authors flag the ethical concern; [E107] more human-like agents were blamed less (SNIPPET); [E108] one study found less responsibility and less trust with a robot-like agent. Together they mean a friendly face can make a wrong verdict forgivable, which works against calibration (my reading, not a source's). [E105] Duolingo's character is "never threatening, angry or mean" (SNIPPET). [E111] people respond socially to computers, so a face is not neutral (35 lab experiments, SNIPPET). [A] A shopper may read an angry face as aimed at them; valid because the face is the only human-like thing on screen; test: 10 testers see the far-over bad verdict: "who is the face angry at?"; pass: 9 of 10 say the price or the store, none says me.
Figure status: untested.

**R-73. What the mascot says after a correction**
Now: the correction ends on a thank-you screen, then Done (R-30).
Should: a plain line in the user's chosen voice that owns the possible error and promises nothing: "Noted. Your price is written down as a report." The face is plain, not celebrating. It does not claim the answer will change; per the design, a price one person reports earns nothing until a second source agrees.
Why: [E109] agent self-blame followed by an apology "enables a successful continuation of the cooperation without loss of trust" (workshop abstract only, SNIPPET). [E106] the system owns errors. [E3] "A price a user asserts and nobody corroborates earns nothing, ever." Promising an update would be a capability claim the app cannot meet.
Figure status: no numbers.

**R-74. The two unprompted appearances**
Now: the design's budget is 2 unprompted in-app appearances per session, 4 per day, 0 outside the app. The two are the aim hint after 4 s of nothing (live, 4000 ms in code, one per camera session) and the price-drop card (not reachable in version 1). Other timed lines exist in the code: the second-visit line yields at 6000 ms, the no-barcode line returns after 3500 ms, the keep acknowledgement shows 2000 ms; whether these count as unprompted was not established.
Should: keep the budget. In version 1 only the aim-hint escalation is live, so use no more. Classify the other timed lines and make any that appears without a tap count against the budget.
Why: [E6] the budget table and "No third source may be added without a row in this table." [E113] the Clippy post-mortem: "early and wrong", an intrusiveness lesson (SNIPPET; source 113 now tags each of its three parts separately). Duolingo's reminders sit outside the app (push), which version 1 does not have [E105 SNIPPET]. The facial-geometry trust paper listed in source 113 is not relied on here. [A] Two a session is enough because a shopper is in the app a few minutes; valid but the numbers are the design's own and untested; test: log unprompted appearances per session; pass: never more than 2.
Figure status: 2 and 4: the design's. 4000, 6000, 3500, 2000 ms: counted.

**R-75. The personality picker: in You, not in first run**
Now: counted: three radio choices plus a Start button exist but only through the switched-off setup flow or a direct link; in You it is "Your Pexi". 2 taps to change.
Should: keep it in You, 2 taps, with one sample line under each voice (R-58). Do not show it on first run. The default Deadpan applies from the first scan.
Why: [E65] "Postpone nonessential setup flows or customization steps." The design's first run put a face pick before the camera (1 tap and 4 s of budget) [E3]; this departs from the design document, not from a ruling. [A] Most shoppers will never change the voice; valid because a default is chosen for them; test: share of testers who change it in week one; if over 40% the picker has earned a first-run slot.
Figure status: 40%: untested.

**R-76. The mascot at the paywall points the disappointment at itself**
Now: the paywall shows the mascot with a line.
Should: the line owns the limit in Pexi's voice ("That is all of this week's scans. I will not have an opinion until Monday, October 12.") and never blames the shopper or shames them for not subscribing.
Why: [E3] the zero state is built to point the disappointment at the app rather than at the shopper. [E106] do not shift blame to the user. [E112] attachment to a character does not stop pricing complaints ("Users can love their bird and still be unhappy with the way they're being charged.").
Figure status: no numbers.

---

## 7. Onboarding and the paywall

**R-77. Keep the 25-step welcome flow off; if it returns, cut it to five steps or fewer**
Now: counted: the welcome flow has 25 visible steps of 30, each a Continue, with Skip all on every step. It is switched off. First launch today is two single-button screens before the camera (R-24).
Should: Now equals Should for version 1: off (fixed by the version 1 floor in the design documents). When it returns it has at most 5 steps, Skip on the first, and it can be replayed in the beta (fixed by ruling: onboarding pages must be watchable more than once). It asks nothing the camera can wait for.
Why: [E66] "our research on deck-of-cards tutorials ... showed that tutorials didn't improve task performance" and "Most mobile apps don't need instructional onboarding." [E65] "fast, fun, and optional". [E118] a calorie app with 28 onboarding steps draws one-star reviews: "Can't skip the onboarding questions", "Onboarding too long". [E117] a food-grading app has 9 onboarding screens before its paywall and its latest 50 reviews include 5 paywall and 4 billing complaints. Vendor figures that flows over 5 screens drop below 60% completion and 3 or fewer exceed 80% are SNIPPET and untraceable [E68].
Figure status: 5: derived by logic from a non-traceable vendor figure, treat as untested.

**R-78. First run asks nothing except the camera and, once, location**
Now: first run shows one screen with the camera and location rows, then Consent (counted).
Should: no name, no shopping habits, no thresholds, no personality and no notification permission on first run; the location row stays on the permission screen, off until answered (fixed by ruling, R-10). The defaults apply: great 30% under, good 20% under, bad 20% over, Deadpan. They are changed in You.
Why: [E65] "Postpone nonessential setup flows or customization steps." [E64] avoid asking at launch unless needed. [E5] the version 1 floor keeps the welcome questions off. [A] The default thresholds are the founder's numbers and give a sound first verdict; valid because the founder set them from his own shopping; test: share of testers who change a threshold in week one; if under 20%, the defaults are right.
Figure status: 20%: untested.

**R-79. Where the offer appears: at the limit, in You, and as a quiet note when 1 scan is left**
Now: counted: the paywall opens only when the server says the free scans are used up. There is no other entry.
Should: three places: (1) automatically on the first scan after the limit; (2) a Pexi Plus row in You (R-35); (3) one quiet line when 1 scan remains (R-53). Never on first launch, never before the first verdict, never over a correction or a Save.
Why: [E65] "Prefer letting people experience your app or game before prompting them for ratings or purchases." [E82] "include contextually relevant prompts ... when they near their monthly limit". The tension: [E88] 78% to 90% of trial starts happen on the day of install, and a plant app that moved its paywall from after 5 plants into onboarding raised trial sign-ups about 400% (a single vendor case, FETCHED [E75]). A weekly limit puts the first wall on day 1 to 7 for a window shopper, who scans 4 to 10 things a week [E3], so most users may never reach it. Early paywalls win on conversion; they cost the "aha" moment [E75] "getting a user to an aha moment as quickly as possible". Median download-to-paid by day 35 is 10.7% for hard paywalls against 2.1% for freemium [E90]; a weekly cap is neither, and no benchmark for it exists. Fixed by ruling is only the free-scan count, not the placement.
Figure status: 78 to 90% and 400%: benchmark-backed, vendor sources. Placement: derived by logic.

**R-80. Show the billed price biggest; the monthly equivalent small and below**
Now: counted: monthly and yearly radio rows carry the store's own price string, so no price is hard-coded; the fallbacks in the welcome flow are CA$3.99 a month and CA$29.99 a year (fixed by ruling). Which text is larger was not measured.
Should: each row's billed amount is its largest text: "CA$29.99 a year" and "CA$3.99 a month". Under the yearly row, in smaller type (no more than 70% of the size) "about CA$2.50 a month, billed once a year". Never lead with CA$2.50. The price strings keep coming from the store.
Why: [E82] "the amount that will be billed must be the most prominent pricing element in the layout"; a per-month breakdown "displayed in a subordinate position and size". [E83] Google Play lists as a violation "Annual subscriptions that most prominently display their pricing in terms of monthly cost." [E85] adding "(equivalent to XX/month)" helped "without overshadowing the full yearly price". An app was reportedly removed for a weekly price larger than the billed amount (single unverified source, FETCHED [E91]). [E31] "unclear pricing introduces uncertainty ... and can lead directly to abandonment" (SNIPPET).
Figure status: CA$2.50: arithmetic (29.99 divided by 12 is 2.499). 70%: derived by logic; Apple says only "subordinate". The yearly price is 37% below twelve monthly payments (3.99 times 12 is 47.88; 29.99 over 47.88 is 0.63), by arithmetic.

**R-81. Preselect the yearly plan, with the monthly plan visible beside it**
Now: counted: two radio rows, listed monthly first, and the first one is preselected, so monthly is preselected today.
Should: once the purchase flow works end to end (fixed by ruling: the free-scan limit switches on only after a test purchase works, so no tester meets a wall before a subscribe button can take a purchase), change the preselected plan to yearly, with the monthly plan visible on the same screen without a "see all plans" link.
Why: [E85] at one app, showing only the yearly plan by default "led to a notable increase in yearly subscriptions with only a minor effect on overall conversion rates" (no numbers given). [E5] only 1 in 100 are assumed to pay, so revenue per payer matters. A three-option layout with a decoy could push people to the yearly plan, but the decoy result is a contested lab survey (SNIPPET) [E87], so do not use it. [A] Hiding the monthly plan risks the clarity rules in [E83]; valid, so keep both visible. Test: split the paywall, yearly preselected against none preselected: pass: yearly share of purchases at least 50% with paid conversion no more than 10% lower in relative terms.
Figure status: 50% and 10%: untested.

**R-82. Trial: a decision for the founder; if added, 3 days on the yearly plan with the first charge printed**
Now: no free trial is recorded. The paywall carries a renews fine print.
Should: no change until the purchase flow works end to end (fixed by ruling on the order). If a trial is added: 3 days, on the yearly plan only, with the date and amount of the first charge printed above the button. Do not promise a reminder before it ends, because version 1 sends no notifications. A trial also gives unlimited scans for 3 days, which costs model spend (the spend cap is fixed by ruling).
Why: [E88] North American trial-to-paid is 34.2% (FETCHED). [E89] median paywall conversion 3.6% without a trial and 10.9% with one (secondary source, SNIPPET). [E86] one app that printed a clear timeline raised conversion 23% and cut complaints 55%, and 20% to 30% cancel in the first three hours (a case study). [E117] and [E118] two comparable apps use a 3-day trial. Counter-evidence: [E112] subscription cost and auto-charge surprises make up 83 of 600 iOS reviews for a companion app; [E118] 5 of 50 recent reviews of a calorie app mention trial or billing.
Figure status: 3 days: benchmark-backed (two comparables). 3.6 and 10.9: SNIPPET, secondary. Effect on Pexi: untested.

**R-83. Close button: 44 px, visible at once, top corner**
Now: counted: a close X exists and is 44 by 44 px, so the size is already met. Whether it is drawn in the first frame without a delay was not recorded.
Should: keep 44 by 44 px, and confirm it is drawn in the first frame (no delay), in a top corner. Closing returns to the camera or the screen that opened the paywall.
Why: [E16] 44 pt hit region. [E83] violation: "Multiple screens in the purchase flow that lead users into accidentally clicking the subscribe button" and promotions that do not "clearly demonstrate that a user can access content without a subscription". [A] A delayed or tiny close reads as a trap and invites a store complaint; valid by the policy wording. Test: 5 testers on the zero-scan screen: time to find the way out; pass: under 2 seconds for 5 of 5.
Figure status: 44: benchmark-backed and counted as met. First-frame drawing and 2 seconds: untested.

**R-84. The zero-scan screen: say what still works, count in mono, one price, one way out**
Now: counted: it is the paywall screen. It has the limit and reset line with a long weekday date, the mascot with a line, the plan rows, fine print, Subscribe, Restore purchases, and Terms and Privacy links. The design's draft says "The camera still works", which is untrue for scans.
Should: headline "That is all of this week's scans." The count in mono ("3 of 3 used"). One line: "Typing a name still works and everything you saved is still here. More scans on Monday, October 12." Primary: Subscribe. Plain text link: "Type a name instead". No red, no shake, no countdown timer. Typed searches are free and uncounted (fixed by ruling).
Why: [E3] the zero state is "Not a wall and not a red screen" and points the disappointment at the app, not the shopper; typed searches stay free so the way out of a weak read is never a charge. [E82] show the counter near the limit. [E83] show that content is accessible without a subscription. [E106] do not shift blame to the user. [A] A free typed route keeps a non-payer inside the product; valid because the ruling already makes it free; test: share of zero-scan users who use the typed route within the day; if over 30% and conversion is flat, that is the price of keeping them.
Figure status: 30%: untested.

**R-85. State what Plus buys, keep the purchase to one screen and one tap**
Now: counted: the paywall heading reads "Pexi Plus: unlimited scans", so the screen already states what Plus buys, in its heading. It has no second line below the heading.
Should: keep the heading. Whether to add one plain line above the plans (for example what happens to the free scans) is a small option; it is not needed to meet the store rule, and "unlimited scans" must be confirmed as what Plus contains. Then the plan rows, then Subscribe. After Subscribe the store's own sheet is the only further step. Restore purchases and the Terms and Privacy links stay visible without scrolling.
Why: [E84] "Before asking a customer to subscribe, you should clearly describe what the user will get for the price." [E82] the sign-up screen must name "the content or services provided during the subscription period" and show the full renewal price, with a restore option; "A lengthy sign-up process will lower your subscription conversion rate".
Figure status: no numbers.

---

## 8. Motion

Every named moment, with duration and curve. "Counted" values come from the code; "design" values come from the design document. The code's standard curve is a quick start and a long slow landing (cubic-bezier .2, .8, .2, 1).

| Moment | Today | Target | Seen how often | Verdict |
|---|---|---|---|---|
| Press state on any button | colour tint 120 to 140 ms, no movement | same | 100+ per heavy trip (pad keys, bar) | Keep; colour only, never movement |
| Scan control press | 90 ms scale to 0.92 (design), counted shutter 90 ms | same | every scan | Keep |
| Frame freeze | design 120 ms with 6% desaturation | same | every scan | Keep |
| Reticle contracts | 200 ms, ease-out | same | every scan | Keep; it shows detection |
| Sheet rises (first position) | counted 260 ms; design 420 ms on a different curve | 260 ms, ease-out | every scan | Keep 260 (R-86) |
| Price numeral enters | 180 ms, starts 60 ms after the field | same | every scan | Keep |
| Face changes expression | 220 ms, eyes first | same | every scan | Keep |
| Confidence dots fill | design 80 ms each, 240 ms in all | at once, no sequence | every scan | Change (R-88) |
| Bell draws | with the field; a better answer morphs it in 620 ms | draw 260 ms; morph 400 ms or less | every scan | Change (R-89) |
| Detent change | counted 320 ms, ease-out | 300 ms | 0 to 3 per scan | Keep |
| Sheet dismisses | not recorded | 200 ms, ease-out | every scan | Add (R-86) |
| Toast in and out | dwell 4000 ms; animation not recorded | 200 ms in, 200 ms out, dwell 4000 ms (fixed by ruling), paused while pressed | rare | Change (R-94) |
| Refusal landing and blink | 340 ms each | retired with the refusal | none | Remove (R-23) |
| Shutter sweep | 900 ms | 300 ms or removed | possibly every scan | Change (R-90) |
| Page entrance | first view per session only | same | once a session | Keep |
| Mascot resting loops | not recorded | stop under reduced motion; avoid a 5 s period | idle | Check (R-17) |
| Paywall opens | not recorded | 300 ms, ease-out | rare | Add |

Status of the table's numbers: "Today" values are counted from the code unless the cell says design or not recorded. "Target" values are derived by logic from the sources named in the block in the last column and are untested until the motion tests in section 10 are run; the 4000 ms toast is fixed by ruling.

**R-86. Sheet: rise 260 ms, dismiss 200 ms, both ease-out**
Now: counted: the sheet rises in 260 ms; position changes take 320 ms with a quick-start long-landing curve. The design says 420 ms on a different curve (.32, .72, 0, 1) because "the shorter shared curve landed it with a snap". The exit duration and curve were not recorded.
Should: rise 260 ms; exit 200 ms; both ease-out (fast start, slow finish) so the response begins at once. If the 260 ms rise feels like a snap, change the curve to the design's softer one, not the duration. Position changes 300 ms.
Why: [E103] "a modal window moves into view, a duration of 200-300 ms can be appropriate"; "At 500ms, animations start to feel like a real drag"; "100-400 ms is appropriate, with 400ms being a very slow animation". [E104] Material's duration steps: 200, 250, 300 ms. [E97] one popular toast library unmounts in 200 ms "Equal to exit animation duration". [A] Ease-out starts fast, so the shopper sees a reaction within the first frames; valid by the shape of the curve; the exit at about three quarters of the entrance is a convention, not a source. Test: 5 testers rate the rise "snappy", "right", or "slow" on three phones; pass: at least 4 of 5 say "right".
Figure status: 200 to 300 ms: benchmark-backed. 260 and 200: derived by logic. Exit at 200: untested.

**R-87. The only moments seen 100 or more times a day get no movement**
Now: the design budgets a window shopper at 4 to 10 scans a week [E3], so almost nothing reaches 100 a day. The exceptions are pad key presses (4 to 5 per scan, so 100 presses on a heavy 20-scan trip, counted by multiplication) and bottom-bar taps.
Should: pad keys and bar taps get an instant colour tint of 120 ms or less and no movement, scale or sound. Everything seen every scan (reticle, rise, numeral, face) is functional (it shows detection, arrival or the answer) and stays at the counted values. No decorative loop plays while the shopper is typing.
Why: [E102] "generally avoid adding motion to UI interactions that occur frequently"; "Aim for brevity and precision in feedback animations." [E103] "Simple feedback animations ... should be roughly 100 ms".
Figure status: 100 a day, 20-scan trip: derived by logic (a heavy trip is an assumption). 120 ms: counted.

**R-88. Show the confidence dots all at once**
Now: the design fills the three dots left to right, 80 ms each, after the price numeral: 240 ms before the full confidence reading is visible.
Should: draw the dots and the word with the verdict field, no sequence.
Why: [E102] avoid motion on frequent interactions. [A] The dots are the calibration signal, and holding them back 240 ms behind the price delays the reading that stops a shopper over-trusting the word; valid because the word and price show first and the confidence arrives last. Test: eye-track or ask 5 testers "was it sure?" immediately after the verdict appears; pass: 5 of 5 answer without waiting for the dots.
Figure status: 240 ms: arithmetic from the design (3 x 80). Pass number: untested.

**R-89. Bell: draw with the sheet; a better answer morphs in 400 ms or less; never count a number up**
Now: counted: the bell's morph, when a better answer arrives, is a 620 ms tween (drawn still under reduced motion).
Should: first draw in 260 ms with the sheet. A better answer moves the curve in at most 400 ms. The price and estimate numbers appear once, never counting through other values.
Why: [E2] "Never animate a price counting up. A number moving through values it never had is a fabricated measurement." [E103] "At 500ms, animations start to feel like a real drag"; 100 to 400 ms is the range. 620 ms is over the 500 ms line, although it is a data update and not a reply to a tap.
Figure status: 400 ms: derived by logic from the 100 to 400 ms range.

**R-90. Cut the 900 ms shutter sweep**
Now: counted: a 900 ms shutter-sweep animation exists in the style definitions. The inventory does not say when it plays, and the shutter itself is removed from the screen.
Should: if it plays on every scan, cut it to 300 ms or remove it. If it never plays, delete it.
Why: [E103] "the duration of most animations should be in the range of 100-500 ms". [E102] avoid motion on frequent interactions. [A] A 900 ms flourish that plays on every scan would delay the sheet on the most repeated moment in the app; valid if it plays then, and moot if it does not; test: grep for the call in the camera screen and count plays in 10 scans.
Figure status: 900 ms: counted. 300 ms: derived by logic.

**R-91. Reduced-motion fallback, moment by moment**
Now: stylesheets honour the setting; the bell tween is replaced by a still drawing.
Should: every moment in the table becomes an opacity fade of the same duration with no travel or scale. The scan control's scale-to-0.92 becomes a tint. The sheet fades in place. The face changes by cross-fade, mascot loops stop, and the reticle appears without contracting. No spring bounce remains.
Why: [E16] "reducing automatic and repetitive animations, including zooming, scaling, and peripheral motion"; "Replacing transitions in x-, y-, and z-axes with fades". [E101] vestibular triggers include scaling and panning large objects. [E2] the design: "every entry above becomes an opacity fade of the same duration and nothing moves in space."
Figure status: no numbers.

---

## 9. Lists, saved items, history, undo

**R-92. Row heights: 52 px for one line, 72 px for two lines, 56 px for tap-to-pick candidates**
Now: counted: list rows 52 px (the design says 52 with a hairline divider inset 16); shop rows 52; candidate rows 56; list-row text 15 px, row labels 16 px weight 600. Saved rows carry a name plus a delta line.
Should: single-line rows 52 (shop picks, settings); two-line rows (Saved, Past scans, price list) 72; candidate and pick rows 56. A 16 px chevron on rows that go somewhere. Keep the hairline inset 16.
Why: [E16] 44 pt minimum hit region. [E94] default tile heights "56.0, 72.0, and 88.0 for one, two, and three lines of text" (framework defaults, SNIPPET); dense 48 and 64. [E35] "Keep item text succinct so row content is comfortable to read." No point height for a row exists on Apple's page.
Figure status: 52 and 56: counted. 72: benchmark-backed but SNIPPET.

**R-93. Swipe to remove on Saved rows, with a visible equivalent**
Now: the inventory records no swipe action. How a saved item is removed was not recorded. Removed items are kept 30 days.
Should: swipe left on a Saved row reveals one action, Remove, with a text label and an icon, not colour alone. The same action sits in the item's detail view for anyone who never finds the swipe. No confirmation dialog, because removal is undoable.
Why: [E95] "consider a confirmation dialog before actions that cannot be undone ... An even better design would provide the user with the opportunity to undo". [E96] "Show the results of an undo or redo." [E8] "don't warn people when data loss is the expected result of their action." [E114] the closest analogue's history uses swipe-to-delete. [E23] swipe gestures are "prone to swipe ambiguity" in sheets, so provide the visible control. [A] Hidden gestures are missed; valid because nothing on a plain row shows a swipe exists; test: 5 testers asked to remove an item with no hint; pass: 5 of 5 succeed in under 10 seconds.
Figure status: 10 seconds: untested.

**R-94. Undo window: 4 seconds (fixed by ruling), paused while pressed**
Now: counted: the thumbs toast shows for 4000 ms; the design gives Undo 4 seconds. The removal flow is a 30-day Recently removed list.
Should: the Undo window stays 4 seconds (fixed by ruling: "the four-second undo is kept"). The one change that fits the ruling: the 4 seconds stop running while the finger is down on the toast, so a slow tap is not lost. Plain acknowledgements without an action stay 4 seconds. Removal also stays recoverable for 30 days.
Why: [E5] the ruling keeps the four-second undo. [E97] a popular toast library defaults to 4000 ms. [E98] Material snackbars "offer the ability to perform an action, such as undoing". [E99] they last "a minimum of 4 seconds and a maximum of 10 seconds", default 5 seconds (SNIPPET, secondary); the ruling decides, so 5 seconds is not recommended. [E95] undo beats confirmation. A slow reader at 4 seconds is a risk against timing rules (WCAG 2.2.1 was not checked here, section 11). [A] Pausing while pressed removes the case of a thumb on the toast when it vanishes; valid because it changes no duration; test: 5 testers hold the toast for 6 seconds, then lift; pass: the toast is still there and Undo works for 5 of 5.
Figure status: 4 s: counted, fixed by ruling and benchmark-backed. The pause: derived by logic, untested.

**R-95. Empty states: say why, and give the next step**
Now: counted: "Nothing here yet." (Saved), "Nothing removed.", "Nothing scanned yet." The Removed screen states its 30-day window only when there is an item, as the design says.
Should: Saved: "Nothing saved yet. Scan something and tap Save it." with a button to the camera (1 tap). Past scans: "Nothing scanned yet." with the same button. Removed: "Nothing removed." alone, no header, no button, no window.
Why: [E92] empty states should "communicate system status", "provide learning cues" and "direct pathways for key tasks". [E93] "If a section is empty, explain why its content is unavailable." Do not disable or hide the bar button. [E2] the Removed rule that header and empty line "were saying the same thing twice".
Figure status: no numbers.

**R-96. Saved order and content: newest first, no sort controls, the date on every row**
Now: counted: rows show the item with its delta; tapping opens a read-only view.
Should: newest saved first. Each row: name with size, saved price, difference from the usual when saved, and the saved date (R-54, R-55). No sort or filter in version 1. A row that has not been opened since saved keeps its delta frozen.
Why: [A] A window shopper saves a handful of items, so order by recency is enough; valid at 4 to 10 scans a week [E3]. Test: when a tester's list passes 20 items, ask them to find an item saved last week; pass: found in under 15 seconds by 5 of 5, otherwise add search. [E115] frozen figures avoid the instability reviewers punish.
Figure status: 20 items and 15 seconds: untested.

**R-97. Past scans: each row keeps the look the verdict had; row faces are still**
Now: counted: Past scans lists rows by relative date; the design renders each row from the same verdict as the sheet, in the confidence look it had.
Should: Now equals Should for the design; keep. Row face 28 px, never animated.
Why: [E2] "Row faces never animate. At 28px in a scrolling list, motion is noise." and a verdict that changes after the fact destroys trust. [E115] unstable scores for the same product are the complaint.
Figure status: 28: counted from the design.

**R-98. Navigation bar: three items, visible on every page, labelled in single words**
Now: counted: three items (Saved, the scan control, You); page bar 84 px plus the safe area; label 11 px; item minimum width 64; on the camera the items are 46 px wide.
Should: keep three items and the labels "Saved" and "You". Make the camera's items 56 px wide as on the pages (R-13). Past scans, Removed and Licences stay under Saved and You (2 taps) because they are rare.
Why: [E93] "Use single words whenever possible"; "Don't disable or hide tab bar buttons, even when their content is unavailable"; keep the bar visible when moving between sections. [E2] the design: "an unlabelled glyph is a guess, and a guess is a tap wasted."
Figure status: 84, 64, 46, 56: counted.

---

## 10. Tests for the first testers

Each line is one assumption or untested figure from sections 1 to 9: what to measure, and the number that passes. All pass numbers are mine and untested; they are set before the test so the result cannot move them.

- T-1 (R-5): five testers, three phones, in a real store: both haptic ticks (barcode captured, verdict landed) felt. Pass: 5 of 5 feel both; fail if fewer than 4 of 5 feel the capture tick.
- T-2 (R-6): ask 10 testers "how did you know it read the barcode?" with no sound. Pass: no more than 1 misses the capture.
- T-3 (R-7): icon tap to live feed on a warm start, three phones. Pass: median 1.2 s or less.
- T-4 (R-9): share of first launches that allow the camera after the permission screen's one-sentence camera line. Pass: 80% or more; below 65% means redesign the line.
- T-5 (R-11): relaunch 5 times and go camera to Saved and back 5 times. Pass: 0 repeat camera prompts in 10 trials.
- T-6 (R-12): 5 right-handed and 3 left-handed testers, one hand, holding a bag: scan control, pad, confirm, primary button. Pass: 8 of 8 reach every one without changing grip (the torch may need a grip change).
- T-7 (R-13): automated check of every tappable element's computed size. Pass: none under 44 by 44, every per-scan control 48 or more. Also pad slip rate: keying 10 tags, wrong key presses per 100 under 3.
- T-8 (R-14, R-15): compute and record the contrast ratio of every text and mark pair in both themes, including the sheet's close X at its current 55% opacity. Pass: every text pair 4.5 or more, every chart mark and the close X 3 or more. Then 5 testers read the verdict word outdoors at arm's length: 5 of 5.
- T-9 (R-16): view the four verdict looks under a red-green colour-blindness simulator and with any colour-blind tester available. Pass: each of the four is named correctly from word and shape.
- T-10 (R-17): turn reduce-motion on, run 10 scans. Pass: no travel or scaling, mascot loops stop, and no loop has a period between 4 and 6 s.
- T-11 (R-18): run the five main screens at the largest system text size. Pass: nothing clipped, nothing under 11 px.
- T-12 (R-19): price confirm to verdict on screen over 100 scans. Pass: median 1.0 s or less, worst 2.8 s or less, and a connection timeout at 10 s.
- T-13 (R-20): log scans that fail for connection reasons in week one. Pass: if under 2% the notice can go.
- T-14 (R-22, R-23): search every shipped string for store-motive words and promise words, and run 20 hard cases (unknown barcode, no catalogue entry, no price, typed name with no match). Pass: 0 motive or promise lines, and 20 of 20 end in a chart or a typed route.
- T-15 (R-24): ask the people who own the consent wording whether a bare notice under the permission screen's Continue is enough. Pass: answered yes or no in writing; if yes, the 5-tap option opens (2 if skipped); if no, both screens stay at 6 (3 if skipped).
- T-16 (R-25): in 50 real aisle scans count wrong-item captures from auto-fire. Pass: under 2 in 50, each repairable in 1 tap.
- T-17 (R-26): 20 testers key 10 real tags each on today's pad and the cents-first pad (order swapped for half). Pass: wrong-price rate no higher, median taps 4 or fewer.
- T-18 (R-28): 20 products by typed name. Pass: median 5 or fewer letters before tapping a suggestion, right item in the top 3 for 8 of 10.
- T-19 (R-30): share of corrections where the prefilled price is edited. Pass: under 30%.
- T-20 (R-31): taps from Share to a friend's chat thread with the card attached. Pass: 4 or fewer (today 6 or more).
- T-21 (R-33): 5 non-Canadian testers name the country of the prices without opening settings. Pass: 5 of 5 say Canada.
- T-22 (R-34): 5 testers set "great means 25% under". Pass: 5 of 5 first try, and 5 of 5 say which price counts as great on a $4.40 item.
- T-23 (R-36): in 50 test scans count wrong items. Pass: at least 80% repaired at the chip before any price is typed.
- T-24 (R-37, R-70): 5 testers see the going-rate card and are asked "is this price good or bad?". Pass: 5 of 5 say they cannot tell without a price; 4 of 5 rate the range useful alone.
- T-25 (R-38): thumbs given per verdict at the full position versus the half position. Pass: at least 2 times more at half.
- T-26 (R-40): build the first sheet on the shortest supported phone (640 px tall). Pass: nothing cut off with the chart at 120 px and a 60% cap.
- T-27 (R-41): 5 testers read the price at 60 cm. Pass: 5 of 5 without squinting.
- T-28 (R-42): over 1,000 synthetic scans compare the shown percent and word with the rule. Pass: 0 mismatches. Then 10 testers see $4.37 against $4.35 for the same estimate and rate "how exact is it?". Pass: 8 of 10 call the rounded one an estimate.
- T-29 (R-45): 10 testers explain the dots and word without help. Pass: 9 of 10 state "less sure" for the low case.
- T-30 (R-47): 5 testers asked "does the sale price change the typical price?". Pass: 5 of 5 say no.
- T-31 (R-48, R-49): count how many of 100 catalogue names end in the size (pass 90 or more); 5 testers asked "which brand?" with the brand only in the name (pass 5 of 5).
- T-32 (R-50): 5 testers asked "is the bigger pack cheaper per 100 g?" from the side note. Pass: 5 of 5.
- T-33 (R-51): in 5 repairs, was the barcode digit line read? Pass: at most 1 of 5.
- T-34 (R-53): A/B: counter always on, against near-limit only. Pass: near-limit not worse on paid conversion and better on week-two retention. Also record the share of users hitting the wall in week one.
- T-35 (R-57): choices logged for great. Pass: if over 25% of testers who open the picker pick the top value, extend the scale.
- T-36 (R-58): 5 testers pick a voice and predict what it would say about a bad price. Pass: 4 of 5 predict the tone.
- T-37 (R-59): view the share card at thumbnail size in a real chat. Pass: every word readable by 5 of 5.
- T-38 (R-61): 5 testers read each line for 2 seconds. Pass: each can repeat the meaning.
- T-39 (R-63): 10 testers, 6 paired verdicts, strip against bell. Pass: strip correct on at least 1 more of 6 on average.
- T-40 (R-64): same price on log-drawn and linear-drawn bells, "cheap, middle or dear third". Pass: answers match for 8 of 10 at a spread of 0.3 or less.
- T-41 (R-65): 10 testers rate "how sure is the app, 1 to 5" after a certain and after a low-confidence verdict. Pass: the low mean is at least 1 point lower.
- T-42 (R-66, R-69): 10 testers see a hollow and a solid verdict for 3 seconds. Pass: 9 of 10 pick the hollow as less sure; 9 of 10 say "not very sure" for a low-confidence verdict.
- T-43 (R-67, R-68): compute the ink-on-field ratio for the price mark; 5 testers read the shopper's position on a 360 by 640 phone. Pass: 4.5 or more; 5 of 5.
- T-44 (R-72): 10 testers see the far-over bad verdict, "who is the face angry at?". Pass: 9 of 10 say the price or the store, none says me.
- T-45 (R-74): count unprompted appearances per session. Pass: never more than 2.
- T-46 (R-75, R-78): share of testers who change the voice (pass: over 40% earns a first-run slot) or a threshold (pass: under 20% means the defaults are right) in week one.
- T-47 (R-81): paywall split (run only after a test purchase works end to end), yearly preselected against monthly preselected. Pass: yearly share of purchases 50% or more, paid conversion no more than 10% lower (relative).
- T-48 (R-82): if a 3-day trial is added: paid conversion against no trial, and billing complaints. Pass: conversion higher, billing complaints under 5% of reviews.
- T-49 (R-83): 5 testers find the way out of the zero-scan screen. Pass: under 2 seconds for 5 of 5.
- T-50 (R-84): share of zero-scan users who use the typed route that day. Pass: report it; over 30% with flat conversion is the price of keeping them.
- T-51 (R-86, R-88, R-90): 5 testers rate the sheet rise on three phones (4 of 5 say "right"); 5 testers answer "was it sure?" at once (5 of 5 without waiting for the dots); count plays of the 900 ms sweep in 10 scans (pass: 0).
- T-52 (R-93, R-96): 5 testers remove an item with no hint (5 of 5 within 10 seconds); at 20 saved items find one saved last week (5 of 5 within 15 seconds).
- T-53 (R-35): a tester with an existing subscription restores it from You. Pass: within 3 taps.
- T-54 (R-3): run the two haptic events (barcode captured, verdict landed) and the three silent cases (low confidence, offline, torch) on three phones with 5 testers. Pass: 5 of 5 report no confusion between a captured barcode and a landed verdict, and 0 of 5 report a buzz on the silent cases.
- T-55 (R-39): enter 20 prices that are 100 times too high and 20 correct prices. Pass: the "Did you mean" offer shows on at least 18 of the 20 slips and on 0 of the 20 correct prices; accepting costs 1 tap and the chart stays visible.
- T-56 (R-56): show 5 testers the provenance rows at 12 px in muted ink and ask where the estimate came from. Pass: 5 of 5 name the source type from the row alone, and every row is readable at arm's length.
- T-57 (R-77): if the welcome flow ever returns, count the steps a tester takes to a first scan. Pass: 5 or fewer, with Skip on the first screen. While it stays off nothing is run.
- T-58 (R-9): share of first launches that tap the demo link, and of those, how many then reach a first verdict, against those that never tap it. Pass: the demo-link group reaches a first verdict at least as often; otherwise the link returns.
- T-59 (R-32): 5 testers close the saved-item card with no hint. Pass: 5 of 5 within 5 seconds, by Close, a tap outside or a swipe down.
- T-60 (R-94): 5 testers hold a thumb on the Undo toast for 6 seconds, then lift. Pass: the toast is still on screen and Undo works for 5 of 5.

---

## 11. What could not be sourced

Each item below was searched for or looked for and not found, or the code could not answer. None of them is evidence that the thing does not exist.

From published evidence:
- Thumb reach distances in centimetres for current phone sizes (only a search listing for the CHI 2014 paper; the page returned an error).
- Any comparison of a custom in-app price keypad with the phone's decimal keypad.
- Any study of "$4 to $6" against "$4-$6" for lay shoppers, or of "about" or "est." before a price; any Baymard page on currency symbols, decimals or ranges.
- A published minimum size for a phone chart or its labels.
- A published minimum contrast or brightness for legibility outdoors in sun.
- A measured distance for a phone held up at a shelf (the 32 to 37 cm figures are for reading text).
- An NN/g article on relative against absolute dates; Zurich's guideline page was read only through a search summary.
- Any controlled study of a visible scans-left counter against a hidden one; any app with "5 free scans a week" and its conversion.
- Apple's in-app purchase layout page (every address returned only the site shell), so no Apple wording on close buttons or price layout is quoted.
- A published limit on the length of a mascot's line on a phone.
- Duolingo's own guideline pages could not be read (they redirect); the Duolingo statements come from search summaries.
- Whether a screen-reader or WCAG timing rule is met by a 4 to 5 second undo window (2.2.1 was not checked).
- A study of whether a mascot on a price verdict raises or lowers trust.
- Any controlled evidence for "scan before sign-up" specifically.
- What happens to trust when an app is wrong after stating its uncertainty in a consumer app.
- Effect sizes for non-push return mechanisms for a shopping utility; any no-push retention baseline.
- Any in-aisle study of glare, one-handed use with a cart, numeric-pad error rate in store, or seconds per scan.
- Canadian price-app review data beyond one small app (213 ratings), and any Canadian figure for shelf-price error rates (the one audit found is US).
- Sound or vibration on scan, scan-to-result time and taps to a result for every competitor; the Yuka default plan and close button; Reddit threads (the tool was blocked).
- Whether round-dollar tags are common enough to make a cents-first pad a net loss (R-26).

From the code and the design documents:
- The free-scan count in the app itself (server-only), and a hard network timeout (none in code).
- How far the thresholds page scrolls; whether the paywall's close X is drawn in the first frame; whether a trial exists; whether Plus includes anything beyond unlimited scans. (Settled on the second reading of the code and no longer open: the sheet has a 44 px close X; the paywall close is 44 px; monthly is preselected; the paywall heading says "Pexi Plus: unlimited scans"; "not this" is on the pad only after an ambiguous typed name.)
- The barcode as displayed text; a contrast ratio for every colour pair; the exit animation of the sheet and toast animations; when the 900 ms sweep plays; the mascot loops' periods.
- Whether the three-dot meter is built; whether the saved-item delta is frozen or live; whether a Saved badge exists; whether Saved rows can be swiped.
- Photo and market journeys (switched off): counts are estimates of the switched-off path only.
- The rulings file lists asking the shelf price at scan time as parked, while the code does it (the price pad opens before the lookup). This document counts the code.
- Whether the closest analogue's subscription mascot appears elsewhere in its app: the two sources conflict on whether it has a mascot, and neither shows what it looks like.
- The three sheet builders for verdict, refusal and the model-assist sheet were not read line by line; screens 25 to 30 were matched by function name.
- I read only the unprompted-appearance budget of the mascot document, and the rulings "What the price line covers" and the version 1 floor only as quoted in the design documents.

---

## 12. Sources

Numbers 1 to 6 are Pexi's own documents. Numbers 7 onward are outside sources; FETCHED means the page was opened and read, SNIPPET means only a search summary was seen. Competitor facts come from caption summaries and review feeds, not from seeing screens.

1. Pexi front-end code inventory, counted from the app's code, 2026-10-09. [COUNTED]
2. Pexi design system document: colour, architecture, components, motion and the 40-screen list. [READ, sections 0, 1, 4, 5, 6, 7]
3. Pexi usage scripts document: aisle, couch, low confidence, scan meter, after the verdict. [READ, sections 0 to 7]
4. Pexi verdict-distribution design, 2026-09-30. [READ, first 120 lines]
5. Founder rulings: always answer; verdict screen mechanics; Plus pricing and free scans; sharing, notifications and attitude; camera guidance; localization and onboarding; design analysis covers every level. [READ by search and section]
6. Pexi mascot document, unprompted-appearance budget. [READ in part]
7. Apple HIG, Playing haptics. https://developer.apple.com/design/human-interface-guidelines/playing-haptics [FETCHED]
8. Apple HIG, Feedback. https://developer.apple.com/design/human-interface-guidelines/feedback [FETCHED]
9. Android HapticFeedbackConstants and haptics principles. https://developer.android.com/reference/android/view/HapticFeedbackConstants ; https://developer.android.com/develop/ui/views/haptics/haptics-principles [FETCHED]
10. MDN browser compatibility data and page for navigator.vibrate. https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Navigator.json ; https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate [FETCHED]
11. WebKit, features in Safari 18.0 (switch input haptic). https://webkit.org/blog/15865/webkit-features-in-safari-18-0/ [FETCHED]
12. Ionic issue 29942 and an iOS haptics tester page. https://github.com/ionic-team/ionic-framework/issues/29942 ; https://rapidtoolset.com/en/tool/ios-haptics-tester [SNIPPET]
13. Scandit, scanning at scale UX insights. https://www.scandit.com/blog/scanning-at-scale-ux-insights/ [SNIPPET; one research note tagged it FETCHED and the other SNIPPET, so it is treated as SNIPPET]
14. Scandit usability best practices and feedback API. https://docs.scandit.com/data-capture-sdk/web/best-practices-for-usability.html ; https://docs.scandit.com/data-capture-sdk/cordova/barcode-capture/api/barcode-capture-feedback.html [SNIPPET]
15. Apple VisionKit data scanner page and Google ML Kit barcode scanning page (no scan feedback documented). https://developer.apple.com/documentation/visionkit/datascannerviewcontroller ; https://developers.google.com/ml-kit/vision/barcode-scanning/android [FETCHED]
16. Apple HIG, Buttons and Accessibility. https://developer.apple.com/design/human-interface-guidelines/buttons ; https://developer.apple.com/design/human-interface-guidelines/accessibility [FETCHED]
17. Android accessibility help, touch target size. https://support.google.com/accessibility/android/answer/7101858 [FETCHED]
18. WCAG 2.2 target size, minimum and enhanced. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html ; https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html [FETCHED]
19. NN/g, touch target size. https://www.nngroup.com/articles/touch-target-size/ [FETCHED]
20. Parhi, Karlson, Bederson 2006, target size for one-handed thumb use. https://www.microsoft.com/en-us/research/?p=155150 [FETCHED]
21. Hoober 2013, how users hold mobile devices. https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php [FETCHED]
22. Bergstrom-Lehtovirta and Oulasvirta, CHI 2014, functional area of the thumb (search listing only; page errored). https://test01.ku.dk/:obvius/pureproxy/3974268/en/publications/modeling-the-functional-area-of-the-thumb-on-mobile-touchscreen-s [SNIPPET]
23. NN/g, bottom sheets. https://www.nngroup.com/articles/bottom-sheet/ [FETCHED]
24. Apple HIG, Sheets. https://developer.apple.com/design/human-interface-guidelines/sheets [FETCHED]
25. Material bottom sheet documentation. https://github.com/material-components/material-components-android/blob/master/docs/components/BottomSheet.md [FETCHED]
26. Baymard, mobile touch keyboards. https://baymard.com/blog/mobile-touch-keyboards [FETCHED]
27. MDN, inputmode. https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inputmode [FETCHED]
28. Apple HIG, Entering data. https://developer.apple.com/design/human-interface-guidelines/entering-data [FETCHED]
29. Thomas, Simon, Kadiyali 2010 (false precision) and Janiszewski and Uy 2008 (anchors). https://pubsonline.informs.org/doi/epdf/10.1287/mksc.1090.0512 ; https://pubmed.ncbi.nlm.nih.gov/18271859/ [SNIPPET]
30. CSUN and a readability guide on "to" against hyphen in ranges. https://news.csun.edu/accessibility/accessibility-tip-on-dashes-and-hyphens/ ; https://readabilityguidelines.netlify.com/grammar-points/hyphens-and-dashes/ [SNIPPET]
31. Baymard, product page price discounts. https://baymard.com/blog/product-page-price-discounts [SNIPPET]
32. MDN, font-variant-numeric. https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric [FETCHED]
33. UX Movement, absolute against relative timestamps. https://uxmovement.com/content/absolute-vs-relative-timestamps-when-to-use-which/ [FETCHED]
34. Zurich Design System time guidelines. https://zds.zurich.com/0.5.5/atoms/time__guidelines.html [SNIPPET]
35. Apple HIG, Lists and tables. https://developer.apple.com/design/human-interface-guidelines/lists-and-tables [FETCHED]
36. Competition Bureau Canada, grocery recommendations, 2023. https://www.canada.ca/en/competition-bureau/news/2023/06/competition-bureau-makes-recommendations-to-promote-competition-in-canadas-grocery-industry.html [FETCHED]
37. Quebec unit pricing. https://consumerscouncil.com/quebec-leads-canada-with-unit-pricing/ [SNIPPET]
38. Kay, Kola, Hullman, Munson, CHI 2016, quantile dotplots. https://vis.mit.edu/classes/6.859/readings/pdfs/Kay-WhenishIsMyBus.pdf [FETCHED]
39. Fernandes, Walls, Munson, Hullman, Kay, CHI 2018, uncertainty in bus decisions. https://mucollective.northwestern.edu/files/2018-UncertainBusDecisions-CHI.pdf [FETCHED]
40. Hullman, Resnick, Adar 2015, hypothetical outcome plots. https://mucollective.northwestern.edu/files/2015-HOPs-PLOS.pdf [FETCHED]
41. Kale, Nguyen, Kay, Hullman 2018, outcome plots for trends. https://mucollective.northwestern.edu/files/2018-HOPsTrends-InfoVis.pdf [SNIPPET]
42. Correll, Moritz, Heer, CHI 2018, value-suppressing palettes. https://www.tableau.com/sites/default/files/2023-01/2018-UncertaintyPalettes-CHI.pdf [FETCHED]
43. Joslyn and Savelli 2021, uncertainty graphics read as deterministic. https://www.frontiersin.org/articles/10.3389/fcomp.2020.590232/text [SNIPPET]
44. Ibrekk and Morgan 1987, displays of uncertainty for non-technical readers. https://ideas.repec.org/a/wly/riskan/v7y1987i4p519-529.html [SNIPPET]
45. MacEachren et al. 2012, visual variables for uncertainty. https://geography.wisc.edu/cartography/projects/publications/MacEachrenEtAl_2012_TVCG.pdf [FETCHED]
46. Boukhelifa et al. 2012, sketchiness, blur and dashing. https://tobias.isenberg.cc/p/Boukhelifa2012ESV [SNIPPET]
47. Ryan and Evers 2020, log-axis graphs and lay readers. https://journals.sagepub.com/doi/10.1177/237946152000600203 [SNIPPET]
48. Report of a second lay log-against-linear study. https://adops.motherjones.com/kevin-drum/2020/05/chart-trivia-which-is-better-log-or-linear/ [SNIPPET]
49. Menge et al. 2018, log scales and trained readers. https://taylorlab.oeb.harvard.edu/publications/logarithmic-scales-ecological-data-presentation-may-cause-misinterpretation [SNIPPET]
50. Apple HIG, Charting data. https://developer.apple.com/design/human-interface-guidelines/charting-data [FETCHED]
51. WCAG 2.2, non-text contrast. https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html [FETCHED]
52. Cleveland and McGill 1984, as summarised by a Berkeley lecture. https://courses.ischool.berkeley.edu/i213/s99/Lectures/Lecture7/tsld048.htm [SNIPPET]
53. Kale, Kay, Hullman, point estimates and uncertainty displays. https://arxiv.org/pdf/2007.14516 [SNIPPET]
54. WCAG 2.2, contrast minimum. https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html [FETCHED]
55. WCAG 2.2, use of colour. https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html [FETCHED]
56. Apple HIG, Color. https://developer.apple.com/design/human-interface-guidelines/color [FETCHED]
57. Colour Blind Awareness and the US National Eye Institute, prevalence and types. https://www.colourblindawareness.org/colour-blindness/ ; https://www.nei.nih.gov/learn-about-eye-health/eye-conditions-and-diseases/color-blindness/types-color-vision-deficiency [FETCHED]
58. Prevalence by population (consumer sites and two local studies, via search summary). [SNIPPET]
59. Outdoor display contrast: Apple iPhone 16 Pro specs, GSMArena measurements, and a display patent on reflection. https://www.apple.com/mt/iphone-16-pro/specs ; https://www.gsmarena.com/newscomm-4105.php ; https://patents.justia.com/patent/20090061945 [SNIPPET]
60. Apple HIG, Typography. https://developer.apple.com/design/human-interface-guidelines/typography [FETCHED]
61. Material 3 typography scale. https://github.com/material-components/material-components-android/blob/master/docs/theming/Typography.md [FETCHED]
62. Legge and Bigelow 2011, critical print size, Journal of Vision 11(5):8. Hosted at the University of Minnesota Legge lab site. [FETCHED]
63. Phone viewing distance: Rosenfield et al. 2011 and a Latvian study of 233 users. https://pubmed.ncbi.nlm.nih.gov/21499163/ ; https://research.lu.lv/en/publications/smartphone-viewing-distance-during-active-or-passive-tasks-and-re/ [SNIPPET]
64. Apple HIG, Privacy. https://developer.apple.com/design/human-interface-guidelines/privacy [FETCHED]
65. Apple HIG, Onboarding. https://developer.apple.com/design/human-interface-guidelines/onboarding [FETCHED]
66. NN/g, mobile app onboarding. https://www.nngroup.com/articles/mobile-app-onboarding/ [FETCHED]
67. NN/g, permission requests. https://www.nngroup.com/articles/permission-requests/ [FETCHED]
68. Vendor figures on onboarding length against completion. https://thisisglance.com/learning-centre/how-can-i-check-if-my-onboarding-flow-is-too-long [SNIPPET]
69. Apple HIG, Managing accounts. https://developer.apple.com/design/human-interface-guidelines/managing-accounts [FETCHED]
70. Baymard, forced account creation at checkout. https://baymard.com/blog/reduce-cart-abandonment [FETCHED]
71. WebKit bug 215884 and a scanner vendor's note on iOS web-app camera permission. https://bugs.webkit.org/show_bug.cgi?id=215884 ; https://kb.strich.io/article/29-camera-access-issues-in-ios-pwa [FETCHED]
72. Apple developer forum thread and Scandit support note on repeated camera prompts. https://developer.apple.com/forums/thread/788518 ; https://support.scandit.com/hc/en-us/articles/360008443011 [SNIPPET]
73. Vendor figures on pre-permission explainers. https://linkrunner.io/blog/top-10-mobile-app-onboarding-metrics-that-predict-long-term-retention ; https://www.dolfy.ai/blog/permission-prompt-problem-camera-location-mobile-apps ; https://edana.ch/?p=52646 [SNIPPET]
74. Account-wall churn and registration friction (second-hand). https://trysonar.app/blog/app-onboarding-that-protects-day-1-retention.md ; https://www.thedrum.com/news/56-don-t-sign-app-because-long-registration [SNIPPET]
75. RevenueCat, paywall placement. https://www.revenuecat.com/blog/growth/paywall-placement.md [FETCHED]
76. NN/g, three response-time limits. https://www.nngroup.com/articles/response-times-3-important-limits/ [FETCHED]
77. NN/g, progress indicators. https://www.nngroup.com/articles/progress-indicators/ [FETCHED]
78. NN/g, skeleton screens. https://www.nngroup.com/articles/skeleton-screens/ [FETCHED]
79. Viget 2017, skeleton screen test. https://viget.com/articles/a-bone-to-pick-with-skeleton-screens [FETCHED]
80. Apple HIG, Loading and Progress indicators. https://developer.apple.com/design/human-interface-guidelines/loading ; https://developer.apple.com/design/human-interface-guidelines/progress-indicators [FETCHED]
81. Utrecht study on active waiting. https://dspace.library.uu.nl/bitstream/handle/1874/431886/3552327.3552329.pdf [SNIPPET]
82. Apple, App Store subscriptions. https://developer.apple.com/app-store/subscriptions/ [FETCHED]
83. Google Play subscription policy. https://support.google.com/googleplay/android-developer/answer/9900533 [FETCHED]
84. Apple, App Review Guidelines (3.1.2). https://developer.apple.com/app-store/review/guidelines/ [FETCHED]
85. RevenueCat, guide to mobile paywalls. https://www.revenuecat.com/blog/growth/guide-to-mobile-paywalls-subscription-apps.md [FETCHED]
86. RevenueCat, how top apps approach paywalls. https://www.revenuecat.com/blog/growth/how-top-apps-approach-paywalls.md [FETCHED]
87. Decoy effect summary. https://thinkinsights.net/strategy/decoy-effect [SNIPPET]
88. RevenueCat, State of Subscription Apps. https://www.revenuecat.com/state-of-subscription-apps/ [FETCHED]
89. Paywall conversion benchmark, 2024 report as cited by a secondary article (article not named in the notes). [SNIPPET]
90. RevenueCat, hard paywall against freemium. https://www.revenuecat.com/blog/growth/hard-paywall-vs-freemium [FETCHED]
91. eesel, Cal AI pricing (single third-party blog). https://www.eesel.ai/en/blog/cal-ai-pricing [FETCHED, unverified claims]
92. NN/g, empty states. https://www.nngroup.com/articles/empty-state-interface-design/ [FETCHED]
93. Apple HIG, Tab bars. https://developer.apple.com/design/human-interface-guidelines/tab-bars [FETCHED]
94. Flutter ListTile default heights. https://api.flutter.dev/flutter/material/ListTile/minTileHeight.html [SNIPPET]
95. NN/g, confirmation dialogs. https://www.nngroup.com/articles/confirmation-dialog/ [FETCHED]
96. Apple HIG, Undo and redo. https://developer.apple.com/design/human-interface-guidelines/undo-and-redo [FETCHED]
97. Sonner toast library source. https://github.com/emilkowalski/sonner/blob/main/src/index.tsx [FETCHED]
98. Material Snackbar documentation and Android Snackbar reference. https://github.com/material-components/material-components-android/blob/master/docs/components/Snackbar.md ; https://developer.android.com/reference/com/google/android/material/snackbar/Snackbar [FETCHED]
99. Snackbar duration guidance, secondary. https://www.educative.io/answers/what-are-snackbars-in-ui-design [SNIPPET]
100. WCAG 2.2, animation from interactions. https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html [FETCHED]
101. MDN, prefers-reduced-motion. https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion [FETCHED]
102. Apple HIG, Motion. https://developer.apple.com/design/human-interface-guidelines/motion [FETCHED]
103. NN/g, animation duration. https://www.nngroup.com/articles/animation-duration/ [FETCHED]
104. Material motion tokens. https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md [FETCHED]
105. Duolingo character and voice guidelines (page redirects; read through search summaries). https://design.duolingo.com/writing/duo [SNIPPET]
106. NN/g, error message guidelines. https://www.nngroup.com/articles/error-message-guidelines/ [FETCHED]
107. Gall and Stanton 2024, anthropomorphic agents and blame. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11089226/ [SNIPPET]
108. Matsui and Koike 2021, agent type and responsibility. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8069278/ [SNIPPET]
109. Buchholz, Kulms, Kopp 2017, self-blame and apology (workshop abstract). https://pub.uni-bielefeld.de/record/2941524 [SNIPPET]
110. Seeger and Heinzl 2021, anthropomorphic design as a trust shield. https://aisel.aisnet.org/ecis2021_rp/12 [SNIPPET]
111. Reeves and Nass, The Media Equation. https://www.afirstlook.com/docs/mediaeq.pdf [SNIPPET]
112. Appbot, Finch app reviews. https://appbot.co/blog/finch-app-reviews-emotional-attachment-user-retention-product-loyalty/ [FETCHED]
113. Mascot context, each part tagged on its own: (a) Duolingo retention experiments summary, https://www.lazyweb.com/research/duolingo-retention-experiments.md [SNIPPET]; (b) the Clippy post-mortem, https://www2.cio.co.nz/article/662045/what-went-wrong-clippy-virtual-assistant-pioneer-people-loved-hate/ [SNIPPET]; (c) a facial-geometry trust paper, found through a search listing, page not opened, no URL kept [SNIPPET, not relied on in any block].
114. Yuka walkthroughs and listings, each tagged on its own: (a) https://screensdesign.com/apps/yuka-food-cosmetic-scanner/ [FETCHED; its tab-bar and tap-count line is SNIPPET only]; (b) https://screensdesign.com/showcase/yuka-food-cosmetic-scanner [FETCHED; video chapter marks, the mandatory sign-up at 0:11 and the mascot on the subscription slider at 1:24]; (c) https://www.scandit.com/resources/case-studies/yuka [FETCHED; a scanner vendor's marketing page; no mascot mentioned]; (d) https://itunes.apple.com/lookup?id=1092799236&country=us [FETCHED]; (e) https://help.yuka.io/l/en/article/cigfcr86v0-add-unknown-product [FETCHED].
115. Yuka reviews and tests, each tagged on its own: (a) https://www.dearbuilders.com/p/product-review-yuka-mobile-app [FETCHED; one reviewer's blog]; (b) https://www.verbraucherzentrale.de/wissen/digitale-welt/apps-und-software/apptest-yuka-der-produktscanner-fuer-drogerie-und-supermarkt-96003 [FETCHED; a German consumer-group test]; (c) https://justuseapp.com/en/app/1092799236/yuka-produkt-scanner/reviews [FETCHED; an app-review aggregator]; (d) https://itunes.apple.com/us/rss/customerreviews/id=1092799236/sortBy=mostRecent/json [FETCHED; only the 50 most recent reviews].
116. Vivino: walkthrough, reviews and expert tests. https://screensdesign.com/apps/vivino-buy-the-right-wine/ ; https://grand-screen.com/apps/vivino-drink-the-right-wine/reviews/ [FETCHED] ; https://www.jancisrobinson.com/articles/best-wine-labelscanning-apps-2016 [SNIPPET]
117. Fooducate: walkthrough and review feed. https://screensdesign.com/apps/fooducate-nutrition-coach/ ; https://screensdesign.com/showcase/fooducate-nutrition-coach ; https://itunes.apple.com/us/rss/customerreviews/id=398436747/sortBy=mostRecent/json [FETCHED]
118. Cal AI: walkthrough, listing and review feed. https://screensdesign.com/apps/cal-ai-calorie-tracker/ ; https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json [FETCHED]
119. Open Food Facts app and review feed. https://github.com/openfoodfacts/smooth-app ; https://itunes.apple.com/us/rss/customerreviews/id=588797948/sortBy=mostRecent/json [FETCHED]
120. Gofer (Canadian grocery price app) site and Canadian review feed. https://gofer.run/ ; https://itunes.apple.com/ca/rss/customerreviews/id=6504411969/sortBy=mostRecent/json [FETCHED]
121. Google price insights help. https://support.google.com/faqs/answer/10675605 [FETCHED]
122. ShopSavvy help page and review feed. https://shopsavvy.com/help/what-is-shopsavvy.md ; https://itunes.apple.com/us/rss/customerreviews/id=338828953/sortBy=mostRecent/json [FETCHED]
123. Flipp shelf-price complaints. https://www.complaintsboard.com/ca/on/saint-catharines/food-basics-275-geneva-st [SNIPPET]
124. Consumer Reports, Kroger overcharging audit (US). https://consumerreports.org/money/questionable-business-practices/kroger-stores-overcharging-shoppers-on-sale-items-a9659540552 [SNIPPET]
125. Communicating numerical uncertainty: PNAS 2020 summary and the BBC field experiment. https://blog.aiimpacts.org/p/paper-summary-the-effects-of-communicating ; https://www.nuffieldfoundation.org/news/uncertainty-about-facts-can-be-reported-without-damaging-public-trust-in-news [SNIPPET]
126. Joslyn weather-forecast work and the 43% result. https://arxiv.org/pdf/1408.4812 ; https://livescience.com/5407-rainy-weather-forecasts-misunderstood.html [SNIPPET]
127. Airship push benchmarks. https://growth.airship.com/rs/313-QPJ-195/images/Airship-2025-Push-Notification-Benchmarks-EN.pdf [SNIPPET]
128. Adobe, retail app retention insights. https://business.adobe.com/blog/retail-app-retention-insights [SNIPPET]
129. Batch, push opt-in benchmarks. https://batch.com/blog/case-studies/benchmark-notifications-push-crm-mobile [SNIPPET]
130. Phones used for price comparison in store. https://www.marketingcharts.com/industries/retail-and-e-commerce-29463 ; https://agency.googleblog.com/2013/05/understanding-smartphone-use-in-stores.html [SNIPPET]


---

## 13. Build order (added 2026-10-09, answering "what should be built")

Of the 98 blocks, 20 are "keep" (the app already does it, or a ruling fixes it) and 7 are not for version 1 (photo path, market picker, dot strip, trial, sound, welcome flow, the per-unit note). The 71 that change something are grouped below into seven builds, ordered by what a tester meets first and by what cannot be taken back (a store rejection, a tester who feels nothing on iPhone).

| Build | Blocks | Why this position | Taps or numbers it changes |
|---|---|---|---|
| 1. Native haptics bridge | R-1 to R-5 | iPhone users feel nothing today; this is the first thing a tester notices and the only one no web change can fix | 3 buzzes per scan to 2, plus 1 on save; none on pad keys |
| 2. Paywall compliance and entry | R-80, R-81, R-83, R-35, R-84, R-85 | Store review: billed price must be the largest text (Apple, Google), Restore purchases must be reachable (Apple); today it is reachable only at the scan limit | Paywall from You: no path to 2 taps |
| 3. Camera permission persistence | R-11 | Test first (10 relaunches and page trips); build the fix only if a prompt repeats | 0 repeat prompts |
| 4. Old refusal wording out | R-23, R-22, R-60 | Contradicts the ruling that every scan answers | none |
| 5. The scan loop | R-25, R-36, R-26, R-30, R-31, R-28 | Every scan pays these taps; the cents-first pad ships behind a switch so the 20-tester test (T on R-26) can turn it off | Barcode to verdict 6 to 4; correction 8 or 10 to 3 or 4; share to a chat 6+ actions to 4 |
| 6. The verdict screen, one pass | R-40, R-67, R-45, R-69, R-70, R-46, R-47, R-42, R-56, R-52, R-64, R-65, R-68 | One screen, one pass, because every block changes the same surface and half-changing it leaves two designs on one sheet | marked price, rounded estimate, confidence reason, low-confidence and no-price states |
| 7. Touch, type, lists, motion, mascot copy | R-12, R-13, R-14, R-18, R-48, R-49, R-50, R-54, R-55, R-57, R-58, R-59, R-61, R-71 to R-76, R-86 to R-98 | Sweeps across every page; cheap each, many of them; last because none blocks a tester from finishing a scan | 40 px buttons to 44/48 px; sheet 260/200 ms; 900 ms sweep cut |

Not built now: R-6 (sound), R-27 (photo path), R-33 (market picker), R-63 (dot strip, a later test), R-77 (welcome flow stays off), R-82 (trial, the founder's call). The 69 tests in section 10 run on the first testers, not before build 5.

Figure status: the 20, 7 and 71 are counts of the blocks above by their Should lines. The order is derived by logic (irreversibility first, then per-scan cost), untested.
