Recorded verbatim on 2026-09-20, not analysed. Source: Gemini's reply to the words-only redesign prompt for every Shin screen (layout, sizes, popups, searching state). Pasted by Jamin. The ChatGPT reply to the same prompt is in `ui-redesign-chatgpt-2026-09-20.md`.

---

Shin: Comprehensive Mobile Product Design Specification and Redesign
The following design specification outlines the comprehensive restructuring and redesign of the mobile application "Shin." Operating as a mascot-led price scanning utility, the application’s architecture is strictly governed by three overarching mandates: it must be empirically useful, exceptionally easy to use, and visually appealing. All interface modifications are constrained by the product owner’s operational rules, which prioritize data honesty, transparent recording practices, and seamless user experiences devoid of fabricated progress metrics or deceptive paywalls.

Systemic design decisions throughout this specification are deeply rooted in current usability, accessibility, and internationalization standards. To accommodate Canadian French localization, where short interface strings (1–10 characters) can expand by up to 200% to 300%, all textual containers utilize dynamic type scaling and flexible layouts rather than fixed heights. Furthermore, while the Web Content Accessibility Guidelines (WCAG) 2.2 Level AA mandate a minimum target size of 24 by 24 CSS pixels, this redesign enforces the stricter WCAG Level AAA standard and Apple Human Interface Guidelines (HIG) by requiring a minimum interactive touch target of 44 by 44 points for all controls. Haptic feedback strategies rely on the deliberate application of transient impulses for discrete actions and continuous textures for sustained states, mitigating sensory fatigue while reinforcing digital interactions with physical metaphors.   

Phase 1: Screen-by-Screen Redesign
The redesign process addresses the current flow by evaluating each screen according to the stipulated criteria (A through H), ensuring all identified weaknesses are resolved structurally and linguistically.

1. First Launch & Onboarding (Replacing the 25-Step Flow)
The legacy 25-step onboarding sequence imposed severe interaction costs by interrogating users regarding shopping habits, non-existent alerts, and fake trial plans. Following the Nielsen Norman Group's Essential, Actionable, Specific (EAS) framework for form simplification, 22 non-functional steps have been completely excised. The onboarding experience is now consolidated into three highly focused, functional screens: Welcome & Home Area, Pick Your Shin, and Data Consent.   

A. Purpose of the screen in one sentence:
To establish a welcoming persona, securely capture operational consent, and configure baseline user preferences without impeding the time-to-value of the first scan.

B. Layout:
The onboarding sequence utilizes a centralized, modal-style layout to maintain focus, progressing sequentially from left to right.

Screen 1: Welcome & Home Area. Top: The Shin mascot face (120 by 120 points) sits centered, 48 points below the top safe area. Middle: A 28-point title greeting the user, followed by a location input field for a rough home area (e.g., "Vaughan, ON"). Bottom: A primary action button docked 24 points above the bottom safe area.

Screen 2: Pick Your Shin. Top: An 80 by 80 point mascot face and 24-point title. Middle: Three vertically stacked voice-selection cards. Bottom: A primary action button.

Screen 3: Data Consent. Top: Mascot face and title. Middle: Plain-text explanation of data recording, followed by two native toggle switches (Photos and Location) with localized inline descriptions. Bottom: A primary action button to finalize setup.

C. Every button:

Button Label    Size (Points)    Position    Resting Look    Pressed/Disabled Look    Function
Continue    343w x 56h    Bottom docked    Solid accent background, inverted text    Pressed: 2% scale down, 10% opacity reduction.    Advances to the next screen.
Voice Cards    343w x 88h    Centered stack    Surface background, subtle border    Pressed: Fills with accent color, borders thicken.    Selects the mascot's voice and plays an audio preview.
Skip location    343w x 44h    Above Continue    Quiet/Ghost style, text only    Pressed: Text dims to 50% opacity.    Bypasses the home area request.
Toggles    51w x 31h    Trailing edge    System default off (gray)    System default on (accent green).    Controls Photo and Location consent.
D. Prompts, Popups, and Sheets:

Trigger    Location    Size    Dismissal    Exact Wording
Screen 1 Load    Inline audio    N/A    N/A    Deadpan: "I am Shin. Let us get started." Warm: "Hi there, I'm Shin! Let's get you set up." Blunt: "Shin here. Let's make this quick."
Home Area Hint    Below input    Full width    N/A    "Used only to match prices to local shops, like Longo's or No Frills."
Location Refused    Center Toast    300w x 44h    Auto (3s)    "Location denied by phone. Prices will be compared globally."
Consent Text    Inline body    Full width    N/A    "Every scan is written down: the product and the price you saw. Photos are kept to help me learn only if you leave Photos on. Location keeps a rough area (about 1 km) to match local shops."
E. Every state:

First view: The layout is uncluttered; the primary button on Screen 1 is active even if the location is left blank, prioritizing user autonomy.   

Working: When a voice card is tapped, the mascot's eyes blink and mouth animates to match the audio playback.

Error/Offline: If the device lacks network connectivity during voice selection, Shin states, "I need a connection to set up your voice. Connect and try again," and the primary button assumes a dimmed, disabled visual state.

F. Motion and feedback:
Voice cards utilize a transient haptic tap (sharp, light intensity) upon selection to simulate a physical button press. The primary button triggers a medium-intensity success haptic pattern (short, rising bursts) when successfully advancing the screen. Transitions between onboarding screens ease out over 250 milliseconds. When the device's "Reduce Motion" accessibility setting is enabled, lateral slide transitions are replaced by 150-millisecond cross-fades.   

G. Accessibility and language:
All interface labels support dynamic type scaling up to 200%. The 88-point height of the voice cards ensures that Canadian French text, which typically expands by 15% to 30%, wraps gracefully to two lines without clipping or truncation. Voice cards employ aria-labels equivalent for screen readers to describe the persona (e.g., "Warm voice, friendly tone") to assist visually impaired users.   

H. What changed and why:
Twenty-two superfluous onboarding steps were eliminated to respect the user's time and remove interaction friction. A functional, friendly home area request was added to the welcome screen to contextualize local pricing metrics immediately.   

2. Camera Screen (Home)
The camera interface serves as the primary operational hub. The redesign resolves the previous iterations' ergonomic shortcomings and silent operational failures, optimizing the interface for one-handed mobile operation.

A. Purpose of the screen in one sentence:
To serve as the seamless, primary interface for capturing barcodes, photographing shelf prices, and initiating manual searches while keeping the user informed of background processing.

B. Layout:
The screen consists of a full-screen live camera feed unobstructed by heavy chrome, maximizing the content-to-chrome ratio.   

Top Bar: A torch button (44 by 44 points) resides in the top-left corner; the lowercase "shin." wordmark is centered horizontally.

Center Viewport: A dynamic aiming reticle (250 by 150 points) with a responsive border rests slightly above the vertical center.

Lower Third: The docked Shin mascot (64 by 64 points, left-aligned) is positioned directly above the navigation bar, flanked by a dynamic speech bubble.

Bottom Navigation Bar: A floating pill-shaped container, anchored 24 points above the bottom edge to ensure optimal thumb reach. From left to right, it houses: "Saved" (44x44), "Barcode" (56x56), "Photo Shutter" (72x72, prominently centered), "Manual Search" (56x56), and "You" (44x44).

C. Every button:

Button Label    Size (Points)    Position    Resting Look    Pressed/Disabled Look    Function
Photo Shutter    72w x 72h    Bottom center    Solid accent ring, transparent center    Pressed: Center fills with accent color.    Captures a full frame for photo lookup.
Barcode Scan    56w x 56h    Left of shutter    Icon on surface background    Disabled: 50% opacity when no code is visible.    Initiates digit extraction.
Manual Search    56w x 56h    Right of shutter    Keyboard icon on surface    Pressed: Icon scales down 5%.    Opens the typed search sheet.
Torch    44w x 44h    Top left    Icon only, white    Pressed: Glows yellow.    Toggles device flashlight.
Saved / You    44w x 44h    Nav bar edges    Icon only    Pressed: 50% opacity.    Navigates to history and settings.
D. Prompts, Popups, and Sheets:

Trigger    Location    Size    Dismissal    Exact Wording
First Visit Privacy    Top banner    Full width    Auto (5s) or swipe up    "Every scan sends a picture of this frame to check the price."
Camera Denied    Center view    Full screen    Settings change    "Camera access was not allowed, so this is the drawn shelf instead."
Barcode Timeout    Bottom sheet    Half height    Drag down or 'X'    "I cannot lock onto that barcode. A photo or typing works too."
Photo Error    Bottom sheet    Half height    Drag down or 'X'    "The camera stumbled. Please try that photo again."
Idle Coaching    Mascot bubble    Dynamic    Auto (1.8s)    "Point at a price tag." or "No tag on it? Point at the thing itself."
Dark Coaching    Mascot bubble    Dynamic    Auto (1.8s)    "Too dark to read here. It needs more light."
E. Every state:

First view: The live feed is active; the barcode button remains disabled (50% opacity) until the computer vision model detects a code.

Working (Aiming): The aiming frame pulses gently; when a barcode is recognized, the barcode button fills with a progress ring indicating confidence tracking.

Permission Denied: The camera feed is replaced by a high-contrast, stylized illustration of a grocery shelf to maintain the structural integrity of the interface.

Offline: The camera continues to function, allowing users to queue photo scans, but the barcode button dims, and Shin states: "I need a connection to read barcodes."

F. Motion and feedback:
When a barcode is confidently recognized, the frame visually snaps to the barcode, the barcode button illuminates, and a sharp, transient haptic impulse plays to notify the user without requiring them to look at the screen. Activating the photo shutter triggers a heavy impact haptic to simulate a mechanical shutter mechanism. Mascot expressions crossfade smoothly over 150 milliseconds.   

G. Accessibility and language:
The aiming reticle acts as a VoiceOver live region (accessibilitySpeechQueueAnnouncement: true), announcing proximity cues (e.g., "Aim a little left") to assist visually impaired users in centering the camera. Icon-only buttons are equipped with explicitly localized aria-labels (e.g., "Rechercher manuellement").   

H. What changed and why:
The lower third of the interface was heavily reorganized to cluster primary actions within ergonomic thumb reach. The previously silent failures for photo capture errors and barcode timeouts were rectified by introducing visible, calm bottom sheets, eliminating user confusion.   

3. Price Pad ("What does the tag say?")
The Price Pad bridges the gap between physical observation and digital comparison. To facilitate accurate data entry, the interface relies on localized retail context and massive touch targets to minimize dexterity errors.

A. Purpose of the screen in one sentence:
To accurately capture the user's observed shelf price, store location, and pack-size modifiers before initiating a database lookup.

B. Layout:
The interface manifests as a half-height bottom sheet sliding over the blurred camera feed.

Top Row: A "Clear" text button on the left, the product title (barcode digits or typed text) centered, and a "Skip" text button on the right.

Second Row: The mascot face alongside a dynamic textual prompt.

Third Row (if Location is on): A "Shop" selector pill. To contextualize the experience for Canadian users, this row prioritizes local grocers (e.g., Longo's, Fortinos, No Frills, Nations).   

Fourth Row: A segmented control dictating the comparison mode: "Is this a good price?" versus "Find a better buy."

Fifth Row: A highly prominent, faint "0.00" input field, flanked by modular modifier chips ("% off" and "N for $").

Bottom Section: A numeric keypad (1-9, decimal point, 0, backspace) positioned directly above a full-width "Price it" button.

C. Every button:

Button Label    Size (Points)    Position    Resting Look    Pressed/Disabled Look    Function
Price It    343w x 56h    Bottom docked    Solid accent background    Disabled: 50% opacity, grayed.    Submits the price for comparison.
Keypad Keys    110w x 56h    Grid    Surface background, 34pt text    Pressed: Darkens by 10%.    Inputs numeric values.
Shop Selector    Dynamic x 44h    Row 3    Pill shape, subtle outline    Pressed: Accent outline.    Opens a native location picker.
Modifiers    Dynamic x 32h    Beside price    Ghost style    Active: Accent color background.    Applies mathematical discounts.
Clear / Skip    44w x 44h    Top corners    Text only, accent color    Pressed: 50% opacity.    Clears input or bypasses pricing.
D. Prompts, Popups, and Sheets:

Trigger    Location    Size    Dismissal    Exact Wording
Sheet Open    Mascot row    Full width    N/A    Deadpan: "What does the tag say?" Warm: "What is on the tag?" Blunt: "Tag price. Type it."
Disambiguation    Below title    Inline    Tap    "Not this? Everything I found for {query}."
No Shops Found    Picker open    Full width    Auto    "No shops mapped around here. The price is still worth writing down without one."
E. Every state:

First view: The keypad is active immediately upon sheet arrival; the input field displays a faint "0.00".

Empty/Skipped: If the user taps "Skip," the sheet dismisses instantly, and the lookup proceeds without a baseline user price.

Offline: The sheet functions normally. Upon tapping "Price it," Shin states, "You are offline. I will finish this once you are back on," and the lookup is queued locally.

F. Motion and feedback:
Keypad taps trigger very light, crisp haptic ticks to provide mechanical feedback, avoiding the numbing effect of heavy, continuous vibration. The sheet enters the viewport using a 250-millisecond ease-out spring animation.   

G. Accessibility and language:
In French localization, the decimal point on the keypad dynamically updates to a comma ("0,00"), and proper spacing is applied before percentage symbols. The numeric keypad layout features oversized touch targets (minimum 110 by 56 points per key), drastically exceeding WCAG AAA requirements to accommodate users with tremors or limited dexterity.   

H. What changed and why:
The layout was restructured to permanently dock the keypad and the "Price it" button at the bottom of the screen, minimizing finger travel and reducing the interaction cost of data entry. Localized retail context was integrated directly into the Shop row.   

4. Working Sheet & Choosing Among Products
The Working Sheet replaces the deceptive "Preparing" and "Evaluating" loading screens. It provides an honest, transparent view of the backend operations, reinforcing trust.

A. Purpose of the screen in one sentence:
To provide transparent, honest, and interruptible feedback to the user regarding the system's progress in identifying the product and aggregating pricing data.

B. Layout:
A compact, centered floating modal (300 points wide) overlaid on a heavily blurred background.

Top: The mascot face is centered in a "thinking" state.

Middle: A single line of dynamic, bold text.

Top Right: A 44 by 44 point "X" close button to allow cancellation.

C. Every button:

Button Label    Size (Points)    Position    Resting Look    Pressed/Disabled Look    Function
Close (X)    44w x 44h    Top right    Icon only, gray    Pressed: Darkens 20%.    Cancels the lookup, returns to camera.
List Items    Full width x 56h    List view    Surface background    Pressed: Accent highlight.    Selects a candidate product.
D. Prompts, Popups, and Sheets:

Trigger    Location    Size    Dismissal    Exact Wording
Standard Flow    Middle row    Inline    Auto    "Identifying it" -> "Looking for prices" -> "Checking the sellers".
Slow Network    Middle row    Inline    Auto    "Still on it." (Appears after 0.8 seconds).
Unrecognized    Sheet expansion    Full width    Tap selection    "Which one is it? Stand-ins until the camera can read the item."
E. Every state:

Working: Text updates dynamically. The mascot's eyes track side-to-side, simulating reading.

Slow: The background blur deepens slightly, and the text shifts to the slow prompt.

Multiple Candidates: The modal expands into a bottom list view, displaying potential product matches for the user to select.

F. Motion and feedback:
A subtle, continuous, low-intensity haptic "texture" plays during the lookup phase to assure the user that the app has not frozen. This texture terminates with a crisp transient tap when the answer is retrieved.   

G. Accessibility and language:
Text is bold (17pt) and highly contrasted against the modal background. The "Close" button features an aria-label of "Cancel search" in English and "Annuler la recherche" in French.

H. What changed and why:
Fake progress bars were entirely excised in favor of honest operational messaging. A "Close" button was added to prevent users from being trapped during extended network timeouts, empowering user control.   

5. Answer Sheet (Verdict, Price Gauge, Save, Share)
The Answer Sheet is the culmination of the app's utility. The redesign addresses the broken empty states of the Price Gauge and integrates the previously orphaned Save and Share functionalities.

A. Purpose of the screen in one sentence:
To deliver the definitive price verdict, contextualize it against geographic market data using the price gauge, and facilitate saving or sharing the result.

B. Layout:
A vertically expansive bottom sheet supporting three draggable heights (Peek, Half, Full).

Peek (Bottom 25%): Features a grabber bar at the top edge. The Mascot face sits on the left, adjacent to a large headline verdict (e.g., "Under your line"). Below the headline are two comparative lines: "Middle price: {median}" and "Shelf price: {label}".

Half (Bottom 50%): Introduces the Price Gauge. The gauge is a horizontal bar divided into three tinted zones based on the user's defined ranges. Scatter-plot dots represent aggregated store prices; a uniquely shaped, enlarged dot represents the user's shelf price. Below the gauge: "Per {unit}, N prices found."

Full (Bottom 90%): Appends the "Found by Google" offers list. Below this list sits a horizontal utility row containing: "Save Result" (icon+text), "Share" (icon), "Fix Results" (text), and a thumbs up/down rating mechanism.

C. Every button:

Button Label    Size (Points)    Position    Resting Look    Pressed/Disabled Look    Function
Done    343w x 56h    Bottom docked    Solid accent background    Pressed: 2% scale down.    Closes the sheet.
Save Result    160w x 44h    Utility row    Secondary style, surface bg    Pressed: Accent border.    Adds item to Saved list.
Share    44w x 44h    Utility row    Icon only    Pressed: 50% opacity.    Opens share rendering card.
Fix Results    120w x 44h    Utility row    Ghost style    Pressed: Text dims.    Opens correction modal.
Thumbs Up/Down    44w x 44h    Utility row    Icon only    Pressed: Fills with color.    Rates the verdict accuracy.
D. Prompts, Popups, and Sheets:

Trigger    Location    Size    Dismissal    Exact Wording
Low Confidence    Next to headline    Badge    N/A    "Not fully confident." Mascot text: "My best read, and I am not fully confident in it."
Empty Gauge    Gauge area    Inline    N/A    "Not enough prices to draw the gauge. Add yours to start the map."
Rating Submitted    Bottom Toast    300w x 44h    Auto (2s)    "Noted." (Includes an "Undo" text link).
E. Every state:

Success: The gauge draws fully, dots animate into position, and web offers populate the lower list.

Empty Gauge: If usable price data is absent, the gauge area displays a dashed neutral line alongside the honest prompt, preventing the user from assuming the UI is broken.   

Offline: The sheet loads from cached memory if the scan just occurred, but Google web offers are replaced with a placeholder: "Connect to the internet to see web offers."

F. Motion and feedback:
The arrival of the Peek sheet triggers a medium-intensity haptic burst if the "Buzz on verdicts" setting is enabled. Dragging the sheet between its three heights utilizes a fluid, interruptible spring animation. Data points on the gauge pop into place sequentially (easing out over 200 milliseconds) to draw visual attention to the data distribution.   

G. Accessibility and language:
The Price Gauge does not rely solely on color to convey information. Zones are separated by thick vertical dividers, and the user's specific price dot is significantly larger and utilizes a distinct shape (a star or diamond) to ensure complete color-blind accessibility.   

H. What changed and why:
The unreachable Save and Share functions were integrated directly into the Full sheet, giving them a functional home and utility. The empty price gauge was redesigned to communicate honestly rather than failing silently, adhering to Nielsen Norman Group guidelines for clear system status.   

6. Fix Results ("Tell Shin the price")
A. Purpose of the screen in one sentence:
To allow users to manually correct a price or product mismatch, feeding accurate, localized data back into the system to improve future scans.

B. Layout:
A full-screen modal overlay.

Top: "Teach Shin" header, back button, and the Mascot face.

Middle: A large price keypad input. Below it, a "Which shop?" text field incorporating a dropdown picker, pre-filled with local retail context if available. Adjacent is a 32-point toggle chip for "On sale".

Bottom: Fine print ("Recorded against {label}..."). The "Save it" and "Not now" buttons are anchored above the bottom safe area.

C. Every button:

Button Label    Size (Points)    Position    Resting Look    Pressed/Disabled Look    Function
Save it    343w x 56h    Bottom docked    Solid accent background    Disabled: 50% opacity, unclickable.    Commits the correction.
Not now    343w x 44h    Above Save    Ghost style, text only    Pressed: 50% opacity.    Dismisses the modal.
On sale    Dynamic x 32h    Middle    Gray chip    Active: Accent color background.    Tags the price as promotional.
D. Prompts, Popups, and Sheets:

Trigger    Location    Size    Dismissal    Exact Wording
Missing Input    Tooltip near button    250w    Auto (3s)    "Name the shop. A price with no shop cannot be compared to anything later."
Success Save    Full width    Inline    Auto (1.4s)    "Recorded. It counts from now. A second tag makes it firm."
E. Every state:

Disabled: The "Save it" button remains visually disabled until both a valid numeric price and a shop name are entered.

Offline: The correction is saved locally. A toast appears: "Saved to your phone. I will upload this when you reconnect."

F. Motion and feedback:
A success haptic pattern plays when "Save it" is successfully tapped. A deliberate 1.4-second delay occurs before the modal slides down, allowing the user sufficient time to read the success confirmation message.

G. Accessibility and language:
Form fields are minimized according to the EAS framework to reduce cognitive load. Label expansion is accommodated by allowing the "Which shop?" hint text to wrap if necessary in French.   

H. What changed and why:
The offline state was clarified, and the "Save it" button was explicitly designed to communicate its disabled state until essential criteria are met, preventing database pollution and user frustration.   

7. Saved, Past Scans, Recently Removed
A. Purpose of the screen in one sentence:
To provide a structured, scannable history of the user's saved items and past scans, allowing effortless retrieval of previous verdicts and comparisons.

B. Layout:
Accessed via the bottom navigation bar on the home screen.

Saved View: A standard vertical list view. The top header reads "Saved". Rows contain the Mascot face (indicating the historical verdict), the item name, timestamp ("saved N ago"), the recorded price, and a comparative label ("under usual" or "over usual").

Bottom of list: A "More" section linking to "Past scans" and "Recently removed".

C. Every button:

Button Label    Size (Points)    Position    Resting Look    Pressed/Disabled Look    Function
Remove (X)    44w x 44h    Row trailing edge    Icon only, gray    Pressed: Red accent.    Moves item to Recently Removed.
Restore    Dynamic x 44h    Trailing edge    Text only, accent    Pressed: 50% opacity.    Returns item to Saved list.
Delete    Dynamic x 44h    Trailing edge    Destructive text    Requires two taps.    Permanently purges the item.
D. Prompts, Popups, and Sheets:

Trigger    Location    Size    Dismissal    Exact Wording
Saved Empty    Center screen    Full width    N/A    "Nothing here yet. Save something and I keep the price, the seller, and the day."
Past Scans Empty    Center screen    Full width    N/A    "Nothing scanned yet. Last one: {item}, {verdict}."
Delete Confirmation    Row trailing    Inline    Tap again    "Tap again, gone for good."
E. Every state:

Loading: Skeleton rows shimmer to indicate data retrieval.

Filled: The list is vertically scrollable.

Empty: The mascot is depicted sleeping, providing an honest but visually engaging empty state.

F. Motion and feedback:
Tapping the sleeping mascot in the empty state triggers a brief haptic flutter and a delightful animation of the mascot waking up. Removing an item slides the row to the left and collapses the vertical space smoothly.   

G. Accessibility and language:
Row heights are dynamic, easily accommodating text wrapping for French localization. Visual indicators (color tints and specific mascot expressions) heavily differentiate "under usual" from "over usual" to aid scanning and cognitive accessibility.   

H. What changed and why:
These screens are now successfully populated via the Answer Sheet’s integrated "Save" button. The dead empty state was redesigned to encourage usage without relying on fake data.   

8. Share
A. Purpose of the screen in one sentence:
To render and export a visually appealing, highly contrasted image card summarizing the user's scan verdict for external distribution via social channels or messaging.

B. Layout:
A full-screen modal positioned over a dark overlay to emphasize the content.

Center: A 1080 by 1350 point aspect ratio card featuring the verdict word, the mascot face, the item name, comparative text ("ON THE TAG" vs "ELSEWHERE"), a confidence line, the "shin." wordmark, and the date.

Bottom: A vertical stack of buttons: "Save the image" (Primary), "Copy as text" (Secondary), and "Back to the camera" (Tertiary).

C. Every button:

Button Label    Size (Points)    Position    Resting Look    Pressed/Disabled Look    Function
Save the image    343w x 56h    Bottom stack    Solid accent background    Disabled: Loading spinner.    Exports the card to device photos.
Copy as text    343w x 44h    Below Save    Secondary style    Disabled: 50% opacity.    Copies verdict data to clipboard.
Back to camera    343w x 44h    Bottom stack    Ghost style    Pressed: Text dims.    Dismisses the share sheet.
D. Prompts, Popups, and Sheets:

Trigger    Location    Size    Dismissal    Exact Wording
Rendering Phase    Bottom toast    Full width    Auto    "Rendering..."
Save Success    Bottom toast    Full width    Auto (2s)    "Saved to your downloads."
Copy Success    Bottom toast    Full width    Auto (2s)    "Copied as text."
E. Every state:

Rendering: Buttons are disabled; a subtle loading spinner appears on the card.

Success: Buttons become active, and a toast confirms the selected action.

F. Motion and feedback:
The picture card scales up from the center using a spring animation upon screen entry. Saving or copying triggers a success haptic pattern.

G. Accessibility and language:
The "Copy as text" button serves as the primary accessibility fallback, ensuring screen reader users can share the data effortlessly without interacting with an inaccessible flat image.   

H. What changed and why:
Made the screen reachable from the Answer Sheet, transitioning it from an orphaned wireframe to a highly functional user engagement tool.

9. You Page, Market, Licences, Savings Overview
A. Purpose of the screen in one sentence:
To centralize user settings, enforce operational honesty through transparent data policies, and configure localized market preferences without requiring a formal account.

B. Layout:
A vertically scrolling grouped list view.

Header: "Settings and honesty", followed by the weekly scan statistical line.

Group 1 (Your Shin): Voice cards (horizontal scroll), Price ranges selector, Torch settings.

Group 2 (App Settings): Theme, Language, "Buzz on verdicts" toggle.

Group 3 (Locations & Data): Market, Watch welcome again, Savings overview.

Group 4 (Honesty/Data): Data consent text, Photos toggle, Location toggle, "Delete my data" button.

Footer: Developer build stamp.

Savings Overview Sub-Screen: Displays "Total Saved" and "Monthly Goal Progress" only if a measured figure exists. If empty, the dead state is replaced with: "Every verified deal adds up here. Start scanning to track your wins."

C. Every button:

Button Label    Size (Points)    Position    Resting Look    Pressed/Disabled Look    Function
Delete my data    343w x 44h    Group 4    Destructive red text, transparent bg    Pressed: Red dims 20%.    Opens email client to privacy address.
Settings Toggles    51w x 31h    Trailing edges    System default    System default.    Controls app behaviors.
List Items    Full width x 44h    Various    Surface background, right chevron    Pressed: Gray highlight.    Navigates to sub-screens.
D. Prompts, Popups, and Sheets:

Trigger    Location    Size    Dismissal    Exact Wording
OS Location Denied    Top banner    Full width    Persistent    "Location access is blocked by your phone. Prices are being compared globally."
Error Loading Stats    Inline text    Full width    N/A    "I could not read my own scan log."
E. Every state:

Loading stats: The weekly stats area displays "Reading the scan log..."

Filled: Standard grouped list rendering.

F. Motion and feedback:
Toggling any settings switch provides a standard, light native haptic click.

G. Accessibility and language:
English and Canadian French options are spelled in their native tongues. The layout relies entirely on native grouped list components, ensuring perfect integration with dynamic type scaling and VoiceOver rotor navigation.   

H. What changed and why:
Redesigned the Savings Overview to prevent a broken empty state that violated the rule against fake statistics. Added the OS location refusal banner to ensure the user understands exactly why local prices (e.g., Vaughan grocery metrics) aren't loading, maintaining strict transparency.   

Phase 2: System-Wide Deliverables
1. Global Design System
Spacing Scale:
The application employs a strict 8-point grid system to ensure visual rhythm. Padding and margins rely on 8, 16, 24, 32, and 48-point increments. Regardless of the visual size of an icon, the minimum interactive touch target area is strictly enforced at 44 by 44 points by extending invisible padding.   

Type Scale:
Fonts scale dynamically based on OS accessibility settings. Base sizes are:

Title: 28pt, Bold.

Headline (Answer Sheet): 22pt, Heavy.

Body: 17pt, Regular (Optimized for readability at standard viewing distances).

Caption/Fine Print: 13pt, Regular.

Number (Keypad/Prices): 34pt, Monospaced numerals (tabular lining) to prevent layout shifting during data entry.

Corner Radii:

Buttons/Chips: 16 points (pill-like for primary actions, rounded rectangles for cards).

Sheets/Modals: 24 points at the top left and right to signify an overlapping layer.

Color Roles (Described by feeling and role):

Background: Deep, neutral void (dark theme) or crisp, clean paper (light theme).

Surface: Slightly elevated from the background, used by modals and sheets to establish hierarchy.

Text: High contrast against background (minimum 4.5:1 WCAG AA).   

Accent: The primary interactive color. Energetic, inviting, and clearly distinguishable.

Good-Price Tint: A reassuring, calm hue (strictly avoiding high-vibration neon green).

Middle Tint: A neutral, grounding tone.

Bad-Price Tint: A clear, cautionary hue (distinct from aggressive alarm red to prevent user panic).

Warning: Used solely for system errors and destructive actions.

Button Styles:

Primary: Solid accent background, inverted text, 56 points tall. Reserved for the single most important action on a screen.

Secondary: Surface background, accent text, slight outline, 44 points tall.

Quiet/Ghost: Transparent background, text only, 44 points tall.

Destructive: Transparent background, warning color text.

Sheet Heights and Behavior:
Bottom sheets operate on a physical spring metaphor. They can be dragged downward to dismiss or swiped upward to expand. Animation easing is configured to a 0.8 damping ratio to eliminate aggressive bouncing, respecting users sensitive to excessive motion.   

Mascot Expressions & Speaking Rules:

States: Idle (resting), Thinking (eyes scanning back and forth), Pleased (good price identified), Concerned (bad price identified), Puzzled (empty state or unsure).

Speaking Rules: Shin speaks unprompted a maximum of 2 times per session and 4 times per day to prevent annoyance. The selected voice (Deadpan, Warm, Blunt) alters the tone and vocabulary, but never alters the underlying numerical data.

2. Searching Pattern
The Lookup Lifecycle:

Initiation: The user taps the shutter, barcode button, or submits a manual search. A transient haptic tap immediately fires, providing physical confirmation of the action before the UI updates.   

Transition: The Working Sheet fades in over 150 milliseconds. The live camera background blurs slightly to direct visual focus to the modal.

Working Phase: Shin’s face enters the "Thinking" state. A continuous, subtle haptic texture plays in the background. The text cycles smoothly: "Identifying it" -> "Looking for prices" -> "Checking the sellers".

Extended Wait (>0.8s): If network latency occurs, the text shifts to "Still on it." The Close (X) button remains highly prominent, allowing the user to abort the process at any time without feeling trapped.

Resolution: The Working Sheet scales down and fades out. The Answer Sheet springs up from the bottom of the screen. A crisp success haptic burst fires simultaneously as Shin delivers the verbal verdict, synchronizing audio, visual, and tactile feedback into a cohesive interaction.   

3. Prompts Inventory
A unified messaging manifest for the developer to construct a singular, predictable notification system across the application.

Trigger    Position    Duration    Dismissal    Exact Wording
First Visit Privacy    Top Banner    5s    Auto / Swipe up    "Every scan sends a picture of this frame to check the price."
Camera Denied    Center View    Persistent    Settings change    "Camera access was not allowed, so this is the drawn shelf instead."
OS Location Denied    You Page Banner    Persistent    Settings change    "Location access is blocked by your phone. Prices are being compared globally."
Rating Submitted    Toast (Bottom)    2s    Auto    "Noted." (Includes "Undo" button).
Barcode Timeout    Bottom Sheet    Persistent    Tap X / Drag    "I cannot lock onto that barcode. A photo or typing works too."
Photo Error    Working Sheet    Persistent    Tap X    "The camera stumbled. Please try that photo again."
Scan Limit Reached    Bottom Sheet    Dynamic    Auto    "Scanning is busy right now. Try again in {N}s."
Missing Shop    Tooltip (Fix)    3s    Auto    "Name the shop. A price with no shop cannot be compared to anything later."
4. Top Ten Changes for Ease of Use
Excised 22 Onboarding Steps: Eliminating non-functional demographic questions respects the user's time, prevents onboarding abandonment, and strictly honors the product owner's mandate against collecting fake or unused statistics.   

Honest Gauge Empty State: Replacing the previously broken, blank Price Gauge with a dashed line and a clear contextual message prevents the user from assuming the application is malfunctioning when geographic data is sparse.   

Integrated Save/Share into Answer Sheet: Connecting these isolated features to the primary result screen gives them immediate utility, allowing users to organically bookmark and distribute verdicts.

Ergonomic Camera Bottom Bar: Clustering all primary actions (Photo, Barcode, Search) into a floating pill in the lower third of the screen ensures comfortable, one-handed thumb reach, significantly reducing physical interaction cost.   

Visible Error Handling (Photo & Barcode): Replacing silent operational failures with calm, descriptive bottom sheets eliminates user confusion and directly guides them toward alternative input methods.

Combined Voice & Greeting Setup: Allowing Shin to introduce itself in the user's selected voice immediately during onboarding demonstrates the application's core differentiator and builds immediate persona engagement.

Honest Savings Overview Empty State: Replacing a dead screen with encouraging, transparent copy ("Every verified deal adds up here") incentivizes continued app usage without relying on fabricated progress metrics.   

Localized Shop Picker: Integrating local Vaughan context (e.g., Longo's, No Frills) directly into the Price Pad dramatically accelerates manual data entry by predicting the most likely retail locations based on geographic data.   

Enforced WCAG AAA Touch Targets: Mandating a minimum 44 by 44 point interactive area across the entire application drastically reduces mis-taps, ensuring an accessible experience for users with motor impairments or those operating the device on the move.   

OS Location Refusal Banner: Transparently explaining that local comparisons are disabled due to OS-level privacy settings prevents the user from doubting the application's underlying accuracy or technical competence.

5. Unsure Items and Questions for the Owner
Decisions (Confident Recommendations implemented in this specification):

Decision: Cutting the fake "Preparing" and "Evaluating" progress bars. Fabricating loading sequences erodes user trust. The new Working Sheet's real-time status text effectively replaces this while maintaining honesty.

Decision: Removing the Free Trial and Plans screens entirely. Presenting payment gateways when no payment infrastructure exists directly violates the "useful to the user" mandate and creates unnecessary friction.

Decision: Expanding all interactive touch targets to 44 by 44 points. While WCAG 2.2 AA permits 24 by 24 CSS pixels, ergonomic thumb sizes require 44 points for frictionless, error-free mobile usage.   

Assumptions (Guesses requiring testing or direct owner input):

Assumption: I am assuming the backend database possesses sufficient geographic tagging to support the localized "Shop" picker accurately. Question for Owner: Does our proprietary backend currently map retail store names to the 1-kilometer location radius, or must we rely on a third-party API (such as Google Places) to populate the shop list reliably?

Assumption: I am assuming the "Savings Overview" relies entirely on manually saved items where the user's inputted shelf price is verifiably lower than the median market price. Question for Owner: How exactly is a "saving" calculated mathematically if the user does not explicitly record a purchase within the app? We must test if users interpret "Saved" as "Money kept in my bank" or simply "A good deal I found," to ensure our copy remains honest.

Assumption: The +30% dynamic text expansion buffer is sufficient for Canadian French localization. Question for Owner: Can we execute a rigorous localization QA pass on the longest string variables in the Answer Sheet to guarantee the layout does not clip or break on smaller physical devices, such as the iPhone SE?


lightningdesignsystem.com
Localization · Lightning Design System 2
Opens in a new window

asiatis.com.sg
Text Expansion by Language: How Much Your Layout Will Grow
Opens in a new window

ai-glot.com
French translation rates explained: what to budget in 2026 - AI Glot
Opens in a new window

webability.io
Target Size - Complete Guide | Web Accessibility Glossary | WebAbility
Opens in a new window

w3.org
Understanding Success Criterion 2.5.8: Target Size (Minimum) | WAI
Opens in a new window

medium.com
Apple's human interface guidelines on accessibility - Medium
Opens in a new window

en.paradigmadigital.com
Target Size: The Great Overlooked Aspect of Accessibility - Paradigma
Opens in a new window

developer.apple.com
Playing haptics | Apple Developer Documentation
Opens in a new window

medium.muz.li
Haptic UX — The Design Guide for Building Touch Experiences
Opens in a new window

saropa.com
2025 Guide to Haptics: Enhancing Mobile UX with Tactile Feedback
Opens in a new window

nngroup.com
Less Effort, More Completion: The EAS Framework for Simplifying
Opens in a new window

developer.android.com
Haptics design principles | Views - Android Developers
Opens in a new window

pages.boreas.ca
Guidelines of Haptic UX Design - Boréas Technologies
Opens in a new window

developer.apple.com
Accessibility | Apple Developer Documentation
Opens in a new window

uxcel.com
Accessibility & Inclusion Standards | Uxcel Lesson
Opens in a new window

scriptis.com
Text Expansion and Contraction during Localization
Opens in a new window

nngroup.com
Mobile User Experience: Limitations and Strengths - NN/G
Opens in a new window

appt.org
Accessibility live region on iOS - Appt.org
Opens in a new window

yellowpages.ca
Grocery Stores near Vaughan Mills Vaughan ON | YellowPages.ca™
Opens in a new window

longos.com
Longo's Grocery Stores | Fresh Food, Online Shopping & In‑Store
Opens in a new window

reddit.com
Independent Grocers in Vaughan - Reddit
Opens in a new window

www2.gov.bc.ca
Writing in French - Province of British Columbia - Gov.bc.ca
Opens in a new window

nngroup.com
Comparison Tables for Products, Services, and Features - NN/G
Opens in a new window

nngroup.com
The Mobile Checkout Experience - NN/G
Opens in a new window

nngroup.com
The Anatomy of a List Entry - NN/G
