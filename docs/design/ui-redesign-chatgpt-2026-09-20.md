Recorded verbatim on 2026-09-20, not analysed. Source: ChatGPT's reply to the words-only redesign prompt for every Shin screen (layout, sizes, popups, searching state). Pasted by Jamin. The Gemini reply to the same prompt is in `ui-redesign-gemini-2026-09-20.md`.

---

Below is a build-oriented redesign specification. I am treating the owner's seven product rules and three purposes—useful, easy, visually appealing—as hard constraints. Where the existing behavior is contradictory or appears to promise something the product does not actually do, I explicitly mark the proposed change rather than quietly assuming it away.

SHIN — MOBILE PRODUCT REDESIGN SPECIFICATION
Global assumptions used throughout
Phone canvas: design against a 390 × 844 pt reference phone, with content constrained by the device's safe areas. Scale proportionally on other phones.
Horizontal page padding: 20 pt.
Primary action location: lower third whenever practical.
Minimum touch target: 44 × 44 pt. Primary buttons are 52–56 pt high.
Bottom navigation: 80 pt high including safe-area padding.
Shin mascot: occupies roughly 64–96 pt depending on context. The mascot is not decoration only; expression communicates state.
No decorative motion for frequent actions. Scanning, keypad presses, sheet opening and navigation should feel immediate.
No fabricated metrics. A metric is shown only when there is a real underlying measurement.
"Confidence" never means "we don't know." There is always a best answer where the system can produce one.
Voice selection changes wording, never numerical values, verdict thresholds, or underlying facts.
English and Canadian French are treated as equal first-class layouts. No text is positioned so tightly that a 30–40% expansion causes clipping.
Decision vs. assumption: Every recommendation below is labelled where relevant.
1. FIRST LAUNCH / FAILURE STATES
1A. Purpose

Decision: Establish what Shin does, greet the user immediately, and get the user into useful setup without making the first screen a meaningless logo splash.

B. Layout

First launch is a short welcome sequence rather than a blank splash.

Top:

20 pt top safe-area padding.
Small lowercase shin. wordmark aligned left.
No back button.

Center:

Mascot approximately 132 × 132 pt.
Expression: awake, pleased, curious.
Greeting beneath it, 26 pt semibold.

Lower third:

Shin's first spoken line is represented visually as a speech bubble/card.
Primary button 56 pt high, full width minus 40 pt margins.

Initial wording:

"Hey. I'm Shin. Point me at a product and I'll tell you what the price looks like."

Then:

"A couple of quick questions, then we scan."

Button:

"Let's do it"

C. Buttons

Let's do it

350 × 56 pt.
Bottom 32 pt above safe area.
Filled accent.
Resting: solid.
Pressed: 8% darker/lower-luminance.
Disabled: not applicable.
Opens first meaningful setup question.

No other controls.

D. Messages

No popup.

If first-run initialization fails:

Centered error card, maximum 320 pt wide.

Exact wording:

"Shin could not finish opening."

"Nothing was changed. Try opening Shin again."

Button: "Try again"

Rarely, if the screen itself cannot render:

"That screen did not open."

"Something broke before it could draw. Going back to the camera should clear it."

Button:

"Back to the camera"

E. States

First view: greeting above.

Loading: never show a spinner for normal initialization. Keep mascot still and display a small "Starting Shin…" label only if initialization exceeds 400 ms.

Working: same screen, no fake progress.

Success: transitions to question 1.

Offline: first-run questions themselves remain available. Any feature requiring the network is explained later.

Permission denied: not relevant here.

Slow: after 1 second, small caption "Almost there." No progress percentage.

F. Motion

Mascot enters with a 180 ms ease-out upward movement.

No bounce.

Button press: 80 ms visual state.

Transition: 220 ms ease-out.

Reduced motion: mascot appears immediately; no entrance movement.

No haptic on welcome.

G. Accessibility/language
Greeting: 26 pt semibold.
Body: 17 pt.
Button: 17 pt semibold.
Contrast minimum 4.5:1 for normal text.
Screen reader order: wordmark → mascot description → greeting → body → button.
Mascot gets semantic label such as "Shin mascot, smiling."
French version must allow the greeting to wrap to three lines without moving the button below the safe area.
H. Change

Decision: Replace the logo-only opening with an actual greeting and explicit explanation of what Shin does. This directly serves easy to use and visually appealing, while making the product immediately understandable.

2. FIRST-RUN QUESTIONS
Overall redesign decision

The current 25-step sequence is too long because several answers have no observable product consequence.

Decision: Reduce the first-run flow to 9 meaningful decisions, while explicitly identifying every removed question below.

The user should not have to complete market research before they are allowed to scan.

2.1 Question 1 — Welcome
A. Purpose

Introduce Shin personally and begin setup without asking for information.

B. Layout

Mascot 120 pt centered, large greeting, one sentence, primary button at bottom.

Text:

"Hey. I'm Shin. Let's make your first scan useful."

Button:

"Continue"

C. Button

56 pt, full-width, lower third.

D. Messages

None.

E. States

Only first, loading, and success. No network dependency.

F. Motion

Mascot expression changes from neutral to pleased when Continue is tapped. 180 ms.

G. Accessibility

26 pt title, 17 pt body, 17 pt button.

H. Change

Decision: Turns the old "SHIN." screen into an actual greeting.

2.2 Question 2 — Market/location
A. Purpose

Let Shin know the user's country and optional rough area so local comparison can work.

B. Layout

Title:

"Where do you shop?"

Body:

"Tell me the country you shop in. You can also give me a rough area—about 1 km wide—so I can compare prices with nearby stores."

Country selector is a 56 pt field.

Below:

"Rough area"

Secondary button:

"Use my rough area"

Quiet text link:

"Skip for now"

Do not request exact location.

C. Buttons

Use my rough area

56 pt.
Accent outline before permission.
If tapped, triggers the phone's location permission.

Skip for now

44 pt minimum.
Quiet text button.
D. Messages

If permission granted:

"Got it. I'll use only a rough area, not your exact location."

If refused:

"No problem. I'll still scan. Prices just won't be matched to a rough nearby area."

If location unavailable:

"I couldn't get a rough area right now. You can keep going without it."

E. States
Country selected.
Location requested.
Granted.
Refused.
Offline.
No location available.
F. Motion

No map animation. Permission response changes inline.

G. Accessibility

Country field announces selected country. Location control explicitly states "rough area, about 1 km wide."

H. Change

Decision: Introduces location honestly and makes refusal non-blocking. Serves useful and easy to use.

2.3 Question 3 — Price range
A. Purpose

Set the user's personal definition of "great," "good," and "bad."

B. Layout

Title:

"How should I judge a price?"

Subtext:

"These lines control where your answers land. You can change them later."

Segmented control:

Percentage | Dollar amount

Three stacked selectors:

Great price: 20% below middle
Good price: 10% below middle
Bad price: 10% above middle
C. Buttons

Each selector is 52 pt tall and opens a compact option sheet.

D. Messages

No popup.

If dollar mode:

"Each amount is per item, compared with the middle price for the same size."

E. States

Default values, customized values, French expansion.

F. Motion

Picker sheet 220 ms ease-out.

G. Accessibility

Selected values announced. Every control has a clear label.

H. Change

Decision: Keep. This is one of the few onboarding answers that visibly changes every verdict.

2.4 Question 4 — Shopping priority
A. Purpose

Determine what secondary explanation Shin should emphasize.

B. Layout

Title:

"What matters most when you shop?"

Four large selectable cards:

Lowest price
Clearance deals
Price + quality
Getting in and out quickly

Single selection.

C. Buttons

Cards are 56–64 pt high with 44 pt minimum touch area.

D. Messages

None.

E. States

Unselected, selected, loading save, offline.

F. Motion

Selection uses 100 ms scale/outline change.

G. Accessibility

Cards act as radio buttons.

H. Change

Decision: Keep, but its effect must become visible: explanation ordering on the answer sheet changes. If it cannot actually change the UI, cut it.

2.5 Question 5 — Deal threshold
A. Purpose

Set the threshold that defines the user's "good deal."

B. Layout

Title:

"How big a difference feels worth calling out?"

Slider from 5–30%.

Default 20%.

Text below:

"20% below the middle"

C. Buttons

Slider is 44 pt high touch area.

D. Messages

"I'll use this as your starting good-deal line."

E. States

Default, changed, skipped.

F. Motion

Slider responds immediately, no animated interpolation.

G. Accessibility

VoiceOver adjustable value.

H. Change

Decision: Keep. This directly changes verdict boundaries.

2.6 Question 6 — Main goal
A. Purpose

Determine which explanation is emphasized on the result.

B. Layout

Title:

"What do you want Shin to help with most?"

Three cards:

Save money
Avoid overpaying
Understand price history
C–H

Same card behavior as Question 4.

Decision: Keep only if each selection changes the answer sheet. Otherwise merge with shopping priority.

2.7 Question 7 — Existing shopping tools
A. Purpose

Determine whether the user needs introductory coaching.

B. Layout

Title:

"Do you already use deal or price-tracking apps?"

Yes / No.

C–H

Single-select cards.

Decision: Keep only as a coaching variable. A "Yes" user receives less explanatory coaching; "No" receives one short explanation after first scan. If this behavior is not implemented, proposed to cut.

2.8 Question 8 — Voice

Move voice selection into onboarding immediately rather than after all questions.

Title:

"How should Shin sound?"

Three cards:

Deadpan

"Two dollars. It's $1.47."

Warm

"Ooh, that's steep. I'd wait."

Blunt

"They're robbing you."

Fine print:

"The attitude changes the words, never the number."

Change

Decision: Move earlier. The user should meet Shin's personality before using the app.

2.9 Question 9 — Consent

Do not hide consent inside permissions.

Title:

"One thing before we scan."

Show the full data explanation described later under Data Consent.

Button:

"I understand. Continue"

Change

Decision: Consent stays before first scan and explicitly says every scan is recorded.

FIRST-RUN QUESTIONS PROPOSED TO CUT

These are not silently deleted; they are explicitly identified.

Current question    Recommendation    Reason
Where did you hear about us?    Cut from onboarding    Marketing attribution does not improve the user's experience.
Shopping frequency    Cut or move to optional settings    No visible product behavior currently depends on it.
Loyalty programs/coupon apps    Cut unless result logic changes    No current screen uses it.
Monthly savings goal    Cut from onboarding    Savings screen does not actually use it.
Alert aggressiveness    Cut    There are no alerts.
Biggest shopping frustration    Cut unless coaching changes    Currently no demonstrated effect.
"Without/With Shin" cards    Cut    The product can explain itself in one sentence.
Four tip checklists    Move to contextual coaching    Users should learn when the problem occurs, not before scanning.
Fake Preparing    Cut    No real operation occurs.
Free trial    Cut    No paid Pro exists and no payment/unlock occurs.
Plans    Cut    It is currently deceptive to present a purchase flow that purchases nothing.
Evaluating    Cut    No actual evaluation happens at that point.
Monthly goal stepper    Cut    No underlying savings calculation supports it.

Decision: The user should reach the camera in roughly 8–10 meaningful interactions, not 25 pages.

3. PICK YOUR SHIN
A. Purpose

Let the user choose Shin's personality and understand that personality cannot alter the numerical verdict.

B. Layout

Top:

Small label:

"One last choice"

Title:

"How should Shin talk?"

Three cards stacked vertically, approximately 96 pt high each.

Each card:

Expression
Voice name
Example sentence
One-line description

Bottom:

Price-range control.

Primary button:

"Start scanning"

C. Buttons

Cards: 44+ pt touch area.

Start scanning: 56 pt.

Selected card receives accent border and subtle surface tint.

Pressed: 100 ms compression.

D. Messages

On selection:

Deadpan:

"Noted. This is how I sound now."

Warm:

"Good. This is me from here on."

Blunt:

"Locked in. This is my voice now."

E. States
First visit
Voice selected
Returning visit
Storage unavailable
Offline

Storage unavailable:

"This browser cannot keep your choice after you close it."

F. Motion

Mascot mouth/eyes change only; no large movement.

150 ms.

No haptic for voice selection.

G. Accessibility

Cards announced as radio choices. Example speech is marked as example, not instruction.

French cards may be taller: 108 pt.

H. Change

Decision: Keep this screen but move it earlier and make it visually lighter.

4. DATA CONSENT
A. Purpose

Obtain informed consent without hiding data collection or blocking scanning.

B. Layout

Title:

"What Shin does with your data"

Opening statement in 17 pt:

"Every scan is recorded: the product and the price you saw. That record helps Shin answer later scans."

Then two large switches.

Photos

"Photo scans can keep the picture you took. Turn this off if you do not want Shin to keep the picture after reading it."

Location

"If you turn this on, Shin keeps only a rough area about 1 km wide. It never keeps your exact location."

Then a clearly separated Why it matters section.

Footer:

"Shin uses what it collects to answer shoppers and improve Shin. The person running Shin can see the collected data."

Link:

"See exactly what is kept"

If no legal page exists, this should expand the explanation rather than pretending a privacy policy exists.

C. Buttons

Continue: 56 pt, bottom.

Switches: 51 × 31 visual with 44 × 44 hit target.

D. Messages

If turning Photos off:

"Photo scans will be read once and the picture will not be kept."

If Location off:

"Shin will still scan. It just will not use your rough area."

E. States

Normal, switch changed, offline, storage unavailable.

F. Motion

Switch animation system-standard, under 200 ms.

No mascot interruption.

G. Accessibility

Each switch includes its consequence in its accessibility value.

H. Change

Decision: Simplify the legal language while preserving the substantive disclosure. This serves easy to use without hiding the collection.

5. CAMERA SCREEN
A. Purpose

Make scanning the fastest possible action while continuously explaining what is being recorded.

B. Layout

Full-screen camera.

Top 72 pt

Left:

Torch icon, 44 × 44.
Small status indicator when auto torch is active.

Center/right:

shin. wordmark.
Camera area

Aim frame approximately 250 × 250 pt centered slightly above vertical center.

Detected barcode rectangles appear only when meaningful.

Selected barcode receives a stronger border and confidence ring.

Object candidates appear as rounded labels:

"Scan this one"

Shin dock

Height 88–104 pt above navigation.

Mascot: 56 pt.

Speech: maximum two lines.

Bottom navigation

80 pt including safe area.

Five controls:

Saved
Barcode
Shutter
Manual
You

Shutter:

72 × 72 pt.
Centered.
Bottom safe area + 20 pt.
C. Buttons
Torch

44 × 44 pt.

Resting: translucent dark/light surface.

Pressed: stronger surface.

Disabled: unavailable only if camera unavailable.

Barcode

56 × 56 minimum, 44 touch target.

Label underneath or accessibility label:

"Scan barcode"

Shutter

72 × 72 pt.

Primary visual control.

Manual Search

48 × 48 pt.

Saved / You

48 × 48 pt.

D. Messages

Privacy message at first camera visit:

"Every scan is recorded. A photo scan sends the picture you take; a barcode scan sends the camera frame used for the read."

Then:

"Point at a price tag."

After four seconds:

"No tag? Point at the product, or type what it is."

Coaching messages remain as specified but should appear in the Shin dock, never as blocking popups.

Multiple objects:

"I see more than one thing. Tap the one you mean."

Torch:

Deadpan:

"Torch on."

Warm:

"Torch on. That should help."

Blunt:

"Light on."

No barcode:

"No barcode read yet. Point at one and hold it there."

E. States
First view

Privacy disclosure once, then aim instruction.

Ready barcode

Barcode frame becomes visually emphasized.

Loading

Do not show a loading spinner over the camera.

Camera denied

Replace live view with a neutral illustrated shelf.

Deadpan:

"Camera access was not allowed, so this is the drawn shelf instead."

Warm:

"Camera access was not allowed, so this is the drawn shelf instead. You can turn it back on in your phone settings."

Blunt:

"No camera access. This is the backup shelf."

Button:

"Open camera settings"

Secondary:

"Use manual search"

Offline

Camera remains fully usable, but barcode lookup immediately explains the connection requirement.

Slow

Coaching remains available; never imply that a result is being calculated before the lookup begins.

F. Motion

Camera itself remains visually stable.

Detection boxes fade in over 120 ms.

No animated "scanning laser."

Mascot changes:

Resting: neutral/pleasant.
Good barcode: focused.
Capture: quick blink.
Working: thinking.
Answer: appropriate verdict expression.

Haptic:

Barcode confirmation: short light buzz.
Shutter: subtle camera haptic.
Verdict: one short buzz if enabled.
No buzz for ordinary coaching.

Reduced motion: remove box animations and mascot movement; use state changes.

G. Accessibility
All icon-only controls have labels.
Camera controls remain in lower third except torch.
Speech captions are readable by VoiceOver.
Do not require color alone to distinguish barcode states.
French coaching cards get at least 2 lines of vertical room.
H. Change

Decision: Keep the camera visually minimal while moving explanation and actions closer to the thumb. Remove unnecessary top chrome.

6. BARCODE SCAN
A. Purpose

Turn a confirmed barcode into an answer with one lookup and no unnecessary intermediate interaction.

B. Layout

Sequence:

User presses barcode.
Price sheet opens.
User enters price or skips.
Exactly one lookup begins.

No separate "Preparing" screen.

C. Buttons

Barcode:

72 pt center shutter-style target only when ready.
Pressed state gives immediate visual acknowledgement.
D. Messages

No barcode ready:

"No barcode read yet. Point at one and hold it there."

Unrecognized barcode:

"I found the barcode, but I need help identifying the product."

Then stand-in list.

Offline:

"I need a connection for this."

"Shin needs the internet to look this up. Scan it again when you're connected."

Rate limit:

"Scanning is busy right now. Try again in {N}s."

E. States

Ready, uploading, price entry, working, answer, offline, timeout, unrecognized, rate limited.

Barcode timeout

This currently happens silently.

New response:

"I lost the barcode before I could confirm it. Hold it steady and try again."

Button:

"Try again"

Secondary:

"Type the product"

F. Motion

No fake progress.

Barcode confirmation: 100 ms.

Price sheet: 220 ms ease-out.

G. Accessibility

The barcode button must announce whether a confirmed barcode is ready.

H. Change

Decision: Eliminate fake preparation and make the currently silent timeout visible.

7. PHOTO SCAN
A. Purpose

Use one captured frame to identify a product and find comparable prices.

B. Layout

Immediately after shutter:

camera freezes briefly,
price sheet opens,
no intermediate "photo processing" screen unless processing genuinely takes place.
C. Buttons

Shutter 72 pt.

Price sheet controls as specified later.

D. Messages

Unreadable:

"That photo was not clear enough for me to identify the product. Try again, or type what it is."

Fresh produce:

"That looks like fresh produce. I do not price fresh produce from a photo. Type the price from the sign instead."

Capture failure:

"I could not capture that photo. Try again."

Reader timeout:

"I took the photo, but the reader took too long. Try again or type the product."

Reader unavailable:

"The photo reader is unavailable right now. The barcode and typing the product still work."

Too many photos:

"I have reached the photo-read limit right now. The barcode and typing the product still work."

Photo too large:

"That photo was too large to read. Try again."

Every photo failure ends with:

"The barcode and typing the product still work."

E. States

Capture, captured, price entry, working, answer, failure, offline.

Offline:

"You're offline, so I kept the photo. I'll finish this when you're back online."

F. Motion

No fake percentage.

Photo preview scales into the price sheet over 180 ms.

G. Accessibility

Camera shutter has "Take photo" label. Failed capture is announced immediately.

H. Change

Decision: Every previously silent photo failure gets a visible recovery path.

8. MANUAL SEARCH
A. Purpose

Give users a guaranteed fallback when camera recognition is inconvenient.

B. Layout

Bottom sheet, 360 pt high.

Title:

"Name it"

Subtitle:

"Type the brand and model, or as much as you know."

Input 52 pt.

Primary:

"Find it"

Keyboard opens automatically.

C. Buttons

Find it: 56 pt.

Close: 44 × 44 top-right.

D. Messages

No match:

"Nothing I found matches “{query}” closely enough."

Then:

"You can still enter the price and let Shin work with what you gave me."

This is important: a failed product match must not terminate the useful path.

E. States

Empty, typing, searching, multiple matches, no match, offline.

F. Motion

Keyboard and sheet use platform behavior.

G. Accessibility

Input has clear label.

H. Change

Decision: Manual entry becomes a first-class route rather than an emergency feature.

9. PRICE PAD
A. Purpose

Get the actual shelf price before the single lookup begins.

B. Layout

Bottom sheet, approximately 560 pt, expandable to full height only when necessary.

Top:

Close.
Title.
Item identity.

Title:

"What does the tag say?"

The selected voice supplies the spoken version.

Price display centered, 42 pt semibold.

Below:

% off
N for $

Then keypad.

Keypad

Four columns where possible:
1–3
4–6
7–9
decimal / 0 / backspace / confirm arrangement optimized for thumb reach.

Each key approximately 64 × 52 pt.

Confirm:

"Price it"

C. Buttons

Clear: 44 pt top-right.

Skip: 44 pt top-right.

Price it: 56 pt, full width.

Shop row:
52 pt.

Mode selector:
52 pt.

D. Messages

Voice-specific question:

Deadpan:

"What does the tag say?"

Warm:

"What is on the tag?"

Blunt:

"Tag price. Type it."

No price:

"You can skip the shelf price, but Shin will not be able to compare your price against the middle."

This is preferable to silently proceeding.

Multiple product candidate:

"Not this one?"

Then:

"Everything I found for “{query}”"

If only one:

"That is the only match I found for “{query}”."

E. States

Empty, entering, valid, invalid, skipped, shop picker, multiple products, offline.

Invalid amount:

"Enter a price from 0.01 to 999999.99."

F. Motion

Keypad presses: 40 ms visual response, no animation.

Sheet: 220 ms ease-out.

No haptic for every key unless the OS keyboard setting provides it; avoid app-generated buzz on every tap.

G. Accessibility

Each key announced.

Do not rely on decimal separator assumptions: English uses . visually; French accepts appropriate localized input while the underlying value remains numeric.

H. Change

Decision: Make price entry the central pre-lookup step and eliminate fake intermediate screens.

10. SHOP PICKER
A. Purpose

Allow the user to associate the scan with the shop they are actually in when location is enabled.

B. Layout

Sheet approximately 420 pt.

Title:

"Which shop?"

Search field.

Nearby shop rows.

Selected shop has checkmark.

Bottom:

"No shop"

C. Messages

"These are shops around your rough area. Tap the one you're in and I'll remember it on this phone."

No shops:

"No shops mapped around here. The price is still worth recording without one."

D–H

Standard list behavior. 44 pt rows minimum; sheet opens 220 ms.

11. WORKING SHEET
A. Purpose

Truthfully communicate that Shin is performing the actual lookup.

B. Layout

Sheet approximately 300 pt high.

Thinking mascot centered.

Three status lines:

"Identifying it"
"Looking for prices"
"Checking the sellers"

Only show a line as completed if the operation actually completed.

Do not animate checkmarks pretending work occurred.

C. Buttons

Close 44 × 44 top-right.

Closing cancels only if the underlying request can actually be cancelled. Otherwise it says:

"This lookup is already running. You can leave this screen; the answer will not be shown if you close it."

Assumption: if cancellation cannot be implemented, do not present the close control as a cancellation mechanism.

D. Messages

After approximately 800 ms:

"Still on it."

After a further 5 seconds:

"This is taking longer than usual."

After a genuinely defined backend timeout:

"I could not finish that lookup."

Buttons:

"Try again"

"Type the product"

E. States

Immediate, normal, slow, timeout, offline.

F. Motion

Mascot breathing/thinking animation: subtle 1.5-second loop.

No progress bar.

G. Accessibility

Status is an accessibility live region but does not announce every minor internal event.

H. Change

Decision: Replace fake progress with truthful status.

12. ANSWER SHEET
A. Purpose

Give the user the answer immediately, then provide evidence and controls without overwhelming the initial verdict.

B. Layout

Three heights remain:

Peek — approximately 180 pt

Mascot 56 pt.

Title:

"Here's what I found."

Verdict in 26–30 pt semibold.

Example:

"Under your line"

Then:

"Middle price: $3.49 / 100 g"

"Your price: $2.79 / 100 g"

Confidence mark if necessary.

Half — approximately 480 pt

Product identity.

Price gauge.

Key offers.

Full

Evidence, alternatives, reviews, feedback, Fix Results, Save, Share, Done.

C. Buttons
Save

52 pt.

Label:

"Save"

After saving:

"Saved"

Share

52 pt.

Label:

"Share"

Fix Results

52 pt secondary.

Done

56 pt primary.

Back to camera

44 × 44 close.

Rating

Two 48 × 48 controls.

D. Messages

Low confidence:

"My best read. I'm not fully confident in the match."

No price:

"I found the product, but you did not give me a shelf price. Here's what I found elsewhere."

No usable comparison prices:

"I found the product, but I do not have enough usable prices to draw the gauge."

This is crucial: the gauge must not silently disappear without explanation.

No measured savings:

"I cannot call this a saving yet."

E. Price gauge states
Usable data

Three zones:

Under your line
Middle
Over your line
No comparison data

Show the gauge frame but replace the empty region with:

"No comparable prices found yet."

Shelf price missing

Show comparison prices but no personal-price dot.

Size assumption

Show:

"Size assumed from the listing."

Excluded prices

"3 prices left out"

Tapping opens reasons.

Decision: Each excluded price needs an actual reason once the backend exposes it. Until then, do not imply detailed reasons exist.

F. Motion

Answer sheet rises 220 ms.

Verdict number/text appears immediately.

Mascot expression changes after sheet settles.

No confetti.

One verdict haptic if enabled.

G. Accessibility

The verdict must be announced before the detailed evidence.

Do not use green/red alone.

French

Allow verdict phrases to wrap naturally.

H. Change

Decision: Add Save and Share directly to the answer sheet, because their current unreachable state makes them effectively nonexistent.

13. CHOOSING AMONG PRODUCTS
A. Purpose

Resolve ambiguity without forcing the user to rescan.

B. Layout

Sheet 400–600 pt.

Title:

"Which one is it?"

Candidate rows:

Product image/placeholder
Name
Brand
Size
selection indicator

Bottom:

"Something else"

D. Messages

Barcode:

"I found several products that could match this barcode."

Photo:

"I found several things that could match your photo."

E. States

Candidates, no candidates, loading, offline.

F–H

Standard 220 ms sheet. Screen reader announces each candidate as a selectable row.

14. GENERIC CAMERA FAILURES
A. Purpose

Turn every unexpected failure into a clear next action.

D. Messages

Unexpected:

"I could not get an answer just now. Try me again."

Button:

"Try again"

Nothing to look up:

"I had nothing useful to look up. Try the scan again."

Button:

"Try again"

Secondary:

"Type the product"

H. Change

Decision: Every failure now explains what happened and gives a recovery route. No silent failure is acceptable.

15. FIX RESULTS
A. Purpose

Let the user correct a wrong price and create a better future answer.

B. Layout

Sheet/full screen.

Top:
"Teach Shin"

Title:
"Tell Shin the price"

Mascot.

Price keypad.

Shop field.

On-sale chip.

Fine print:

"Recorded against {label}, at {seller}. It counts from now and becomes firmer when a second tag agrees."

C. Buttons

Save it: 56 pt.

Not now: 44 pt.

Save disabled until price + shop valid.

D. Messages

Missing price:

"Type the price on the tag."

Missing shop:

"Name the shop. A price without a shop cannot be compared later."

Saved:

"Recorded. It counts from now. A second tag makes it firmer."

Offline:

"I'll keep this correction on the phone and send it when you're back online."

E. States

Normal, invalid, offline, saved, failed retry.

F. Motion

No celebratory animation. Mascot nods once.

G. Accessibility

Form order: price → shop → sale → save.

H. Change

Decision: Keep and connect directly to the answer sheet.

16. SAVED
A. Purpose

Give saved answers a genuinely useful, persistent place.

B. Layout

Top:
"Saved"

Rows approximately 76 pt high.

Each:

Small mascot face.
Product.
Price.
Seller.
Relative date.
Verdict.
Remove button.

Bottom navigation.

Empty state centered vertically:

Sleeping mascot.

"Nothing saved yet."

Warm:

"Save an answer and I'll keep the price, seller and day here."

Primary:

"Scan something"

C. Buttons

Remove ×: 44 × 44.

Scan something: 52 pt.

More: 48 pt.

D. Messages

Loading:

"Reading what you saved…"

Failure:

"I could not read what you saved."

Button:

"Try again"

Remove:

"Remove this saved answer?"

Buttons:

"Remove"

"Keep"

E. States

Empty, populated, loading, failure, offline read if local data exists.

F. Motion

Rows appear immediately. Deletion uses 150 ms collapse.

G. Accessibility

Rows are grouped as one accessible element with product, price, seller and verdict.

H. Change

Decision: Saved becomes reachable directly from the answer sheet.

17. PAST SCANS
A. Purpose

Provide a factual history of previous scans.

B. Layout

Title:

"Past scans"

Rows 76 pt.

Item, seller, time, price.

D. Messages

Empty:

"Nothing scanned yet."

If there is a previous scan:

"Last one: {item}, {verdict}."

Detail:

"This is what I said at the time. Nothing here can be changed."

E. States

Populated, empty, loading, failure.

F–H

Standard list behavior.

Change: Make this a factual history rather than another pseudo-savings screen.

18. RECENTLY REMOVED
A. Purpose

Provide a recoverable deletion window without making deletion irreversible by accident.

B. Layout

Title:

"Recently removed"

Subtitle:

"Kept for 30 days."

Rows:

"Removed 4 days ago · 26 days left"

Button:

"Restore"

D. Messages

First delete:

"Removed. You can restore this for 30 days."

Second delete:

"Tap again to delete permanently."

E. States

Empty:

"Nothing removed."

Expired items disappear automatically.

F

Deletion confirmation uses no animation longer than 180 ms.

G

Restore announced to screen reader.

H

Decision: Keep because it gives deletion a predictable safety net.

19. SHARE
A. Purpose

Turn a verdict into a compact, truthful image or text that can be shared outside Shin.

B. Layout

1080 × 1350 output card.

Order:

Mascot.
Verdict.
Product.
User price.
Comparison price.
Confidence.
Date.
shin.

Do not put unsupported statistics on the card.

Title:

"Share this answer"

Preview occupies most of screen.

Buttons:

Save image
Copy text
Back to camera
D. Messages

Rendering:

"Making the share card…"

Saved:

"Saved the image."

Copied:

"Copied."

Failure:

"I could not make the share card. Try again."

E–H

Standard.

Decision: Share should be available immediately after a result.

20. YOU PAGE
A. Purpose

Centralize actual preferences, data controls and factual usage information without pretending nonexistent features exist.

B. Layout

Title:

"Settings and honesty"

Section 1 — Your Shin

Voice cards.

Section 2 — How Shin judges prices

Price ranges.

Section 3 — Scanning

Torch, Buzz.

Section 4 — Appearance

Theme.

Section 5 — Language

English / Français canadien.

Section 6 — Market

Country + region.

Section 7 — Your data

Photos, Location.

Section 8 — Your history

Real scan/correction counts.

Section 9 — Help

Welcome again, Fix Results.

Section 10 — Data deletion

Delete my data.

Footer

Build number.

C. Buttons

All rows at least 52 pt high.

Destructive deletion uses a distinct destructive style.

D. Messages

Delete:

"Your data is linked to this device number. Shin can send a deletion request for the data associated with it."

Email action opens the system mail composer.

E. States

Usage metrics loading:

"Reading the scan log…"

Failure:

"I could not read my scan log."

No-data:

"Nothing measured yet."

F. Motion

Minimal.

G. Accessibility

Grouped settings. Avoid excessive nested navigation.

H. Change

Decision: Remove settings that represent nonexistent behavior:

Alerts
Monthly goal
fake allowances
anything that implies Pro
anything that cannot change the product.
21. MARKET
A. Purpose

Tell Shin where prices should be compared.

B. Layout

Title:

"Where prices are compared"

Mascot:

"Where do you shop? I record it. It does not change what I compare yet."

Country search.

Region selector.

Caption:

"This is sent with each scan so prices can be compared in the right market. Shin does not convert prices between currencies."

C. Buttons

Country rows 52 pt.

Region rows 52 pt.

Licences button:

"Prices and product details: sources and licences"

D. Messages

No country:

"Choose a country before leaving this page."

No search results:

"No country matches that."

E–H

Standard searchable selection.

Decision: Keep the honest disclaimer that market currently records context without claiming it changes comparison logic.

22. LICENCES
A. Purpose

Credit external sources transparently.

B. Layout

Title:

"Data and licences"

Each source card:

Source name
What Shin gets from it
Licence
Open link

Footer:

"Shin is not affiliated with these sources."

D. Messages

Loading:

"Asking for the list of sources…"

Failure:

"I could not reach the source list. I am not showing an incomplete list as if it were complete."

Then fallback credits.

Button:

"Try again"

E–H

Normal list/loading/error behavior.

Decision: Keep because source transparency is materially relevant to trust.

23. SAVINGS OVERVIEW
A. Purpose

Show measured savings only when Shin has enough real data to calculate them.

B. Layout

Title:

"Savings Overview"

If measured:

Total measured savings
Recent measured savings
Relevant scan history

If not:

Sleeping/neutral mascot.

"Savings will appear here once Shin has measured a real saving."

Below:

"Recently scanned"

Last five scans.

C. Buttons

"See past scans"

"Scan something"

D. Messages

Never say "$0 saved" unless $0 is actually measured.

E. States

No measured savings, measured savings, loading, error.

F–H

Minimal animation.

Decision: This screen should not pretend an empty savings database is a financial dashboard.

24. NAVIGATION
A. Purpose

Keep the app's mental model extremely simple.

B. Layout

Persistent bottom bar:

Saved | Scan | You

Manual Search is launched from Scan rather than becoming a fourth navigation destination.

Answer sheets remain modal over Scan.

C. Buttons

Center Scan is 56–64 pt visual, 72 pt touch area.

D. Messages

No navigation toast unless an action fails.

E. States

Camera home, Saved, You, modal answer.

F. Motion

Bottom navigation switches instantly or within 180 ms.

G. Accessibility

Each tab has selected state announced.

H. Change

Decision: Reduce navigation from multiple conceptual destinations to three: Scan, Saved, You.

25. OFFLINE BEHAVIOR
A. Purpose

Make the limitations of offline mode predictable rather than mysterious.

B. Behavior

Camera still opens.

Manual typing still works.

Barcode lookup:

"I need a connection for this."

Photo:

Keep photo locally if Photos consent is on.
Retry later.

Correction:

Keep locally.
Send later.

No cached price is presented as if it were current.

C. Global offline indicator

A small non-blocking banner at top:

"Offline"

It disappears when connection returns.

D. Change

Decision: Offline state is communicated but never used as a reason to make the entire app inaccessible.

GLOBAL DESIGN SYSTEM
1. Spacing

Use an 8-point base system:

4 pt — micro spacing
8 pt — related elements
12 pt — compact separation
16 pt — standard component spacing
20 pt — page padding
24 pt — section spacing
32 pt — major section spacing
40 pt — visual separation
48 pt — major composition spacing
64 pt — large empty-state spacing
2. Type scale
Role    Size    Weight
Hero verdict    32 pt    Bold
Page title    28 pt    Semibold
Section title    21 pt    Semibold
Card title    18 pt    Semibold
Body    17 pt    Regular
Button    17 pt    Semibold
Secondary body    15 pt    Regular
Caption    13 pt    Regular
Number / price    30–40 pt    Bold
Keypad number    25 pt    Medium

Line height should generally be 120–145% of font size.

3. Corner radii
Small controls: 10 pt
Cards: 16 pt
Sheets: 24 pt top corners
Large feature card: 20 pt
Circular controls: fully rounded
4. Color roles

Do not make the app look like a generic financial dashboard.

Background

Warm neutral rather than pure white.

Surface

Slightly elevated neutral.

Primary text

Very dark neutral.

Secondary text

Muted neutral.

Accent

Shin's distinctive brand color, used sparingly.

Good-price tint

Soft green, never saturated enough to imply guaranteed financial gain.

Middle tint

Neutral/amber.

Bad-price tint

Soft red/coral.

Warning

Warm amber.

Important: Every verdict must include text, not only color.

MASCOT STATE LANGUAGE
State    Face
Resting    Calm, slight smile
Coaching    Curious/focused
Barcode confirmed    Focused
Capture    Quick blink
Searching    Thoughtful
Slow    Patient, mildly concerned
Good price    Pleased
Middle    Neutral
Bad price    Concerned
Low confidence    Curious/uncertain, not sad
Error    Calm, apologetic
Saved    Small satisfied smile
Correction accepted    Proud/nod
Empty Saved    Sleeping
Empty Savings    Resting/sleeping

Decision: Mascot expression communicates state but never substitutes for text.

WHEN SHIN SPEAKS

Shin should speak when:

The user needs instruction.
Something important happened.
A result arrived.
A meaningful error occurred.
A user action changes Shin's behavior.
A rare first-run moment benefits from personality.

Shin stays quiet when:

A normal navigation transition happens.
The user taps a keypad key.
A row opens.
A standard setting changes.
The user is reading detailed evidence.
The same information is already clearly visible.
Interruption limits

Retain the owner's limit:

Maximum 2 unprompted interruptions per session.
Maximum 4 per day.

This is a good restraint.

SEARCHING PATTERN

This should become one consistent pattern across barcode, photo and typed searches.

Stage 0 — Trigger

User presses:

Scan barcode, Take photo, or Find it.

Immediate feedback within 100 ms:

button acknowledges press,
no fake percentage,
no delay.
Stage 1 — Price

Price sheet opens.

User sees:

"What does the tag say?"

The lookup has not started yet.

User can:

enter price,
choose shop,
choose comparison mode,
skip price.
Stage 2 — Actual lookup

After price sheet confirmation:

Working sheet appears.

Mascot thinking.

Status:

"Identifying it"

Then, only if those operations genuinely occur:

"Looking for prices"

"Checking the sellers"

No fake checkmarks.

Stage 3 — Normal response

Answer sheet begins at peek height.

First visible content:

Mascot.

Then:

"Here's what I found."

Then the verdict.

The numerical answer appears immediately.

The sheet can expand into evidence.

Stage 4 — Slow

At ~800 ms:

"Still on it."

At ~5 seconds:

"This is taking longer than usual."

The user can close only if the backend supports cancellation. Otherwise, do not imply cancellation.

Stage 5 — Failure

After actual timeout:

"I could not finish that lookup."

Buttons:

"Try again"

"Type the product"

Stage 6 — Reduced motion

No moving progress indicators.

Mascot switches expressions directly.

Sheets appear without sliding.

PROMPTS INVENTORY
Trigger    Message    Position    Duration    Dismissal
First launch    "Hey. I'm Shin. Point me at a product and I'll tell you what the price looks like."    Welcome center    Until Continue    Continue
First setup    "A couple of quick questions, then we scan."    Welcome    Until Continue    Continue
Location    "Tell me the country you shop in. You can also give me a rough area—about 1 km wide—so I can compare prices with nearby stores."    Setup    Until choice    Choice
Location granted    "Got it. I'll use only a rough area, not your exact location."    Inline    2.5 s    Automatic
Location refused    "No problem. I'll still scan. Prices just won't be matched to a rough nearby area."    Inline    3 s    Automatic
Camera first view    "Every scan is recorded. A photo scan sends the picture you take; a barcode scan sends the camera frame used for the read."    Shin dock    Until next line    Automatic
Camera idle    "Point at a price tag."    Shin dock    Until condition    Automatic
Camera idle 4s    "No tag? Point at the product, or type what it is."    Shin dock    At least 1.8s    Automatic
Barcode coaching    "Barcode. Hold it there."    Shin dock    ≥1.8s    Automatic
Photo coaching    "Shine on the label. Tilt it a little."    Shin dock    ≥1.8s    Automatic
Distance    "A step closer and I can read it."    Shin dock    ≥1.8s    Automatic
Multiple products    "I see more than one thing. Tap the one you mean."    Shin dock    ≥1.8s    Tap candidate
Darkness    "Too dark to read here. It needs more light."    Shin dock    ≥1.8s    Automatic
Barcode absent    "No barcode read yet. Point at one and hold it there."    Shin dock    Until condition    Automatic
Torch    "Torch on." / voice variant    Shin dock    ~2s    Automatic
Barcode timeout    "I lost the barcode before I could confirm it. Hold it steady and try again."    Error sheet    Until action    Try again
Offline barcode    "Shin needs the internet to look this up. Scan it again when you're connected."    Sheet    Until dismissal    Close
Rate limit    "Scanning is busy right now. Try again in {N}s."    Sheet    Countdown    Automatic
Photo offline    "You're offline, so I kept the photo. I'll finish this when you're back online."    Sheet    3s    Automatic
Photo unreadable    "That photo was not clear enough for me to identify the product. Try again, or type what it is."    Sheet    Until action    Action
Fresh produce    "That looks like fresh produce. I do not price fresh produce from a photo. Type the price from the sign instead."    Sheet    Until action    Action
Photo failure    "I could not capture that photo. Try again."    Sheet    Until action    Try again
Photo reader timeout    "I took the photo, but the reader took too long. Try again or type the product."    Sheet    Until action    Action
Other photo failure    "The photo reader is unavailable right now. The barcode and typing the product still work."    Sheet    Until action    Action
Manual no match    "Nothing I found matches “{query}” closely enough."    Sheet    Until action    Action
Price pad    "What does the tag say?"    Sheet    Until entry    Entry
No shelf price    "You can skip the shelf price, but Shin will not be able to compare your price against the middle."    Inline    Until action    Action
Multiple product    "Which one is it?"    Sheet    Until choice    Choice
Working slow    "Still on it."    Working sheet    Until result    Automatic
Working very slow    "This is taking longer than usual."    Working sheet    Until result    Automatic
Working failure    "I could not finish that lookup."    Error sheet    Until action    Action
Answer    "Here's what I found."    Answer peek    Persistent    Sheet navigation
Low confidence    "My best read. I'm not fully confident in the match."    Answer    Persistent    Read
No comparison    "I found the product, but I do not have enough usable prices to draw the gauge."    Answer    Persistent    Read
Fix missing price    "Type the price on the tag."    Inline    Until valid    Entry
Fix missing shop    "Name the shop. A price without a shop cannot be compared later."    Inline    Until valid    Entry
Fix saved    "Recorded. It counts from now. A second tag makes it firmer."    Toast    2.5s    Automatic
Rating    "Noted."    Toast    2s    Undo optional
Saved empty    "Nothing saved yet."    Empty state    Persistent    Scan
Saved    "Save an answer and I'll keep the price, seller and day here."    Empty state    Persistent    Scan
Saved loading    "Reading what you saved…"    Screen    Until complete    Automatic
Saved failure    "I could not read what you saved."    Screen    Until action    Try again
Past scans empty    "Nothing scanned yet."    Empty state    Persistent    Scan
Removed    "Removed. You can restore this for 30 days."    Toast    2.5s    Automatic
Permanent delete    "Tap again to delete permanently."    Row    2s    Tap again / timeout
Share rendering    "Making the share card…"    Share    Until complete    Automatic
Share success    "Saved the image."    Toast    2s    Automatic
Share copied    "Copied."    Toast    2s    Automatic
Share failure    "I could not make the share card. Try again."    Sheet    Until action    Try again
Market no result    "No country matches that."    Search    Until query changes    Automatic
Licences loading    "Asking for the list of sources…"    Screen    Until complete    Automatic
Licences failure    "I could not reach the source list. I am not showing an incomplete list as if it were complete."    Screen    Until action    Try again
Savings empty    "Savings will appear here once Shin has measured a real saving."    Empty state    Persistent    None
Unexpected    "I could not get an answer just now. Try me again."    Error sheet    Until action    Try again
Nothing to lookup    "I had nothing useful to look up. Try the scan again."    Error sheet    Until action    Try again
TOP TEN CHANGES BY EXPECTED EASE-OF-USE IMPACT
1. Remove the fake onboarding work

Decision.

Cut Preparing, Evaluating, fake trial and fake plans.

Why: The user currently waits through screens that do nothing. Removing them makes the first successful scan dramatically faster.

2. Ask only questions that visibly affect Shin

Decision.

Reduce 25 steps to roughly 8–10 meaningful interactions.

Why: Personalization has value only when the user can actually experience the personalization.

3. Put the actual price entry directly before lookup

Decision.

Camera → Price → Lookup → Answer.

Why: This is the core mental model and eliminates unnecessary screens.

4. Make every failure actionable

Decision.

No silent capture errors, barcode timeouts or location refusals.

Why: Silence makes users think the app is broken.

5. Add Save and Share directly to the answer

Decision.

Why: These features currently exist conceptually but are inaccessible from the actual user journey.

6. Give the empty price gauge an honest state

Decision.

Never silently show an empty visualization.

Why: An empty graphic looks broken. A truthful explanation looks intentional.

7. Make manual search a first-class path

Decision.

Manual Search remains visible on the camera and available from failures.

Why: It guarantees usefulness even when the camera cannot identify something.

8. Replace fake progress with truthful searching

Decision.

Only show backend stages that actually occur.

Why: Fake progress damages trust and gives the user no information about what is really happening.

9. Consolidate navigation

Decision.

Use Scan / Saved / You.

Why: The user has one primary job: scan. Everything else supports that job.

10. Make Shin's personality part of interaction rather than decoration

Decision.

Shin speaks at useful moments, expresses state visually, and stays quiet during routine operations.

Why: This makes the mascot functional rather than ornamental without making the app noisy.

OWNER QUESTIONS AND UNCERTAINTIES
1. What exactly is "middle price"?

Assumption: Median price among usable offers is the intended middle.

This should be confirmed because the entire gauge and user's personalized thresholds depend on it.

Test: Compare median vs. other aggregation methods on real scans and examine whether users understand the resulting verdict.

2. Can the backend actually cancel a lookup?

Assumption: Probably not, based on the current description.

If it cannot, the close button should dismiss the sheet rather than claim to cancel server work.

3. Does "Every scan is recorded" mean every attempted scan or every successfully submitted scan?

Decision needed from owner.

The UI must use one exact definition everywhere.

4. What does "train Shin" technically mean?

The consent copy currently says collected data is used "to train Shin."

Decision needed: Does this mean model training, evaluation, human review, retrieval improvement, or all of these?

The consent language should accurately describe the real process.

5. Are background shelf photos actually necessary?

Assumption: They are intended to improve future recognition.

But the user may perceive background capture as materially more intrusive than an explicit scan.

Test: Compare recognition improvement against consent acceptance and retention.

6. Should background photos continue when the app is merely sitting open?

Assumption: No, unless there is a demonstrated product reason.

The current "one every 5 seconds, 40 per visit" behavior deserves explicit owner review because it materially changes the privacy experience.

7. Does "location" actually improve price matching today?

The current text says the rough area is recorded but comparison behavior may not yet change.

Decision: If it does not currently change the result, say so plainly, as proposed.

8. What is a "saving"?

This must be defined before Savings Overview can become more sophisticated.

Possible factual definitions to decide between:

Shelf price minus median comparable price.
Shelf price minus lowest comparable price.
User-defined threshold difference.
Confirmed later purchase difference.

Until selected, show no total.

9. What makes a price "excluded"?

The gauge currently promises exclusion counts but not reasons.

Decision: Backend should eventually expose a structured exclusion reason. Until then, don't manufacture explanations.

10. How should membership prices be treated?

A Costco/member-only price and a public shelf price are not necessarily equivalent.

Decision needed: The result should eventually label conditions such as:

membership required,
coupon required,
marketplace seller,
used,
refurbished,
store brand,
organic,
sale.

Until those attributes are actually known, don't label them.

11. What does "same size" mean?

The gauge depends heavily on size normalization.

Decision needed: Define how Shin handles:

grams,
kilograms,
millilitres,
litres,
count,
pack count,
multipacks,
different package sizes.
12. How should "N for $" interact with price ranges?

Assumption: Convert promotional price to a per-item price before comparing.

This should be confirmed and displayed transparently.

13. Is "Found by Google" the intended user-facing source label?

Decision needed.

If the actual data comes through a specific Google search service, the UI should use the legally appropriate attribution rather than a generic phrase.

14. Is the 1 km location radius technically guaranteed?

Decision needed.

If the system only receives approximate coordinates but cannot guarantee the radius mathematically, the wording should describe the actual precision.

15. Is the app actually a web app?

The current wording refers to:

"browser"
site scripts
reload
browser storage.

Assumption: Shin may currently be web-based or hybrid.

This matters because camera permission, local storage, downloads, location permission and share behavior differ considerably between web and native iOS/Android.

FINAL PRODUCT DIRECTION

The strongest version of Shin is not a large app with many screens.

It is a very short loop:

Point → capture → tell Shin the shelf price → Shin searches → answer → optionally save/share/fix.

Everything else should support that loop.

The biggest design problem in the current product is not visual styling. It is the mismatch between the amount of interface and the amount of real work happening behind it. The redesign should therefore make the interface smaller, more truthful and more expressive:

fewer onboarding questions,
no fake progress,
no fake subscriptions,
no silent failures,
no empty unexplained visualizations,
no hidden recording,
no blocked scanning because of privacy/location choices,
and a much stronger answer sheet where the user's actual decision is made.

The mascot then becomes valuable because it gives those moments a consistent human voice without interfering with the mechanics of scanning.
