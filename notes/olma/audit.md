# OLMA feature audit, one row per button

Source: `notes/olma/olma-walkthrough-2026-09-03.mp4`, 99 seconds, 1206 by 2622, 60 fps, recorded
2026-09-03. Every claim below is from a frame that was read, and every claim carries the
timestamp of that frame. Where the recording does not show something, this file says "not shown
in the recording" rather than guessing.

Verdicts are one of four: **take** (copy the mechanism), **adapt** (copy the need, change the
mechanism, spin stated), **reject** (reason plus the condition that reverses it), **already
have** (name the Shin component from `docs/design/DESIGN.md`).

The borrowing rule this audit was run under is his: *"we are not trying to copy duolingo or any
other app, we are taking inspiration that applies to us."* Shin's user is a window shopper
holding a phone up in a store aisle in front of one price. Every take and every adapt row states
why the mechanism applies to that person. "OLMA does it" is not a reason, and a row that could
only give that reason was written as a reject.

---

## 0. Frames

| Pass | Frames on disk | Frames read |
| --- | --- | --- |
| One per second, `frames/s_001.jpg` to `s_099.jpg` | 99 | 99 |
| Scene change, `select='gt(scene,0.25)'`, `frames/c_001.jpg` to `c_008.jpg` | 8 | 8 |
| Quarter second, `frames/frames4/f_0001.jpg` to `f_0396.jpg` | 396 | 126 |
| **Total** | **503** | **233** |

Plus six full resolution re-crops of frames already read, taken because text at 420px wide was
too small to trust: the collection card badge, the verdict block, the price rail, the scan meter
pill, the top of Settings, and the top of the Enter Price sheet.

**Why 126 of 396 and not all of them.** Every second of the recording was read. The quarter
second pass was extracted to catch taps that a one second sample can miss, and it was read across
the ten windows where the one second frames showed a screen change and therefore a tap had
happened inside a second that was not sampled: 4.00 to 6.75, 18.00 to 20.75, 22.50 to 26.00,
26.25 to 29.00, 33.50 to 36.25, 37.50 to 40.25, 58.50 to 62.00, 62.50 to 64.25, 84.50 to 86.25,
90.50 to 95.25. The 270 unread quarter second frames all sit inside seconds that were read and
whose screen did not change across that second. Nothing in this audit rests on an unread frame.

Scene change timestamps recorded by the pass: 27.503, 38.805, 48.457, 71.777, 71.812, 75.610,
79.028, 80.462. Seven of the eight are camera movement; the one that carried new information is
38.805, which is the only frame in the recording showing the analysing status "Identifying the
product".

Frame numbering: `s_NNN` is at t = NNN minus 1 seconds. `f_NNNN` is at t = (NNNN minus 1) / 4
seconds.

---

## 1. Screen inventory

Thirty one distinct screens or states. Two iOS notification banners appear over the app (t=4,
t=16 and t=17) and are the operating system, not OLMA, so they are excluded.

| # | Screen or state | First appears | Recurs at |
| --- | --- | --- | --- |
| 1 | Launch splash, black, animated rosette logo | 0.00 | none |
| 2 | Onboarding 1 of 4, Welcome to OLMA | 4.75 | none |
| 3 | Onboarding 2 of 4, What Do You Shop For, nothing selected | 6.50 | none |
| 4 | Onboarding 2 of 4, two chips selected (Electronics, Beauty) | 10 | none |
| 5 | Onboarding 2 of 4, four chips selected (adds Toys & Games, Luxury & Watches) | 11 | none |
| 6 | Onboarding 3 of 4, Your Home Market | 12 | none |
| 7 | Onboarding 4 of 4, How It Works | 15 | none |
| 8 | Scan tab, camera not permitted, Camera Access explainer card | 19.25 | 23.25 to 27.25 |
| 9 | OLMA Pro paywall, plans still loading, spinner | 19.75 | none |
| 10 | OLMA Pro paywall, three plan rows loaded | 22.00 | none |
| 11 | iOS camera permission alert | 25.00 | none |
| 12 | How to scan modal over the live viewfinder | 27.50 | none |
| 13 | Viewfinder, ready, hint pill visible | 29.00 | 61.25, 71.75, 85.00, 89 |
| 14 | Shutter pressed, capture in progress inside the shutter | 33.75 | none |
| 15 | Enter Price sheet, CAD 0.00, "Detecting price..." | 34.75 | none |
| 16 | Enter Price sheet, CAD 2 typed, still detecting | 37.25 | none |
| 17 | Analysing, status "Identifying the product" | 38.75 | none |
| 18 | Analysing, status "Searching for prices" | 39.00 | none |
| 19 | Analysing, status "Finding retailer links" | 43 | none |
| 20 | Result, verdict "Outrageous", first sentence | 48.5 | none |
| 21 | Result, verdict "Outrageous", sentence replaced in place | 50 | none |
| 22 | Result scrolled, Comparable prices empty, sources still searching | 54 | none |
| 23 | Result scrolled, reviews summary and the feedback row | 55 | none |
| 24 | Result with the feedback toast and Undo | 59.75 | none |
| 25 | Collection, one card, Fair Price badge | 63.50 | 90.50 |
| 26 | Collection overflow menu, Select and Recently Deleted | 92.25 | none |
| 27 | Collection sort menu, Date checked, Alphabetically, Group by Category | 94.00 | none |
| 28 | Settings | 66 | 96 to 98 |
| 29 | Viewfinder with the torch on, bolt icon filled, scene lit | 79.00 | none |
| 30 | Scanning Tips popover anchored to the help button | 82 | none |
| 31 | Text search overlay over a blurred viewfinder, keyboard up | 85.75 | none |

---

## 2. Element inventory

Ninety rows. Screen letters map to the inventory above.

### A. Launch splash (screen 1)

| # | Screen | Element | What it does | User need | Verdict | Reason | Shin's version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Splash | Rosette logo mark, animating, morphs to a camera aperture at t=2 | Occupies the cold start | Reassurance that the tap registered | reject | 4.75 seconds of logo before the first content frame (t=0.00 to t=4.75). The aisle user pays for that in shelf time and learns nothing. Reverses if a measured cold start cannot be brought under one second, in which case the screen shows what is loading, not a logo. | Shin opens on the viewfinder; the viewfinder frame itself is the loading state |

### B. Welcome (screen 2)

| # | Screen | Element | What it does | User need | Verdict | Reason | Shin's version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | Welcome | Four segment progress bar, first segment filled | Shows how many steps remain | Knowing when this ends | adapt | The honesty is worth taking, the bar is not: Shin's setup is one question, so a four segment bar would be a lie about length. Spin: one sentence stating the count instead of a bar. | Screen 13, setup, carries the line |
| 3 | Welcome | Headline and promise, "Never overpay when shopping abroad or at home." | States what the app is for | Deciding whether to continue | already have | The copy slot exists and the line is fixed by `NOW.md`'s problem statement. | Screen 15, first run before permission |
| 4 | Welcome | Continue button, full width, single action | Advances | One obvious next action | already have | Single primary action per screen is already the pattern. | Screen 15 |

### C. Interests (screens 3 to 5)

| # | Screen | Element | What it does | User need | Verdict | Reason | Shin's version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 5 | Interests | Twelve interest chips, multi select (Electronics, Fashion, Beauty, Home & Kitchen, Groceries, Sports & Outdoors, Toys & Games, Books & Media, Luxury & Watches, Automotive, Health, Travel Gear) | Narrows product recognition | Fewer wrong identifications | reject | Shin's corpus is the fixed list of items it actually holds, so an interest filter narrows nothing that is not already narrow, and it asks for taps before the app has answered anything. Reverses when the corpus is large enough that identification is ambiguous across categories. | none |
| 6 | Interests | Continue active with zero chips selected (t=9) | Lets the step be skipped | Not being trapped before the camera | take | Every screen Shin puts before the camera has to be passable in one tap, because the person is in front of one price and the shelf is the deadline. | Setup keeps its default (Deadpan) when skipped |
| 7 | Interests | Back button beside Continue | Returns to the previous step | Undoing a wrong tap | reject | A back button on a one screen setup has nowhere to go. Reverses if Shin's setup ever grows past one screen. | none |
| 8 | Interests | Subtitle stating that the picks sharpen product recognition and comparisons | Says why the step exists | Trust that the answer is used | adapt | The need is real: a question asked before the camera must say what it buys. Spin: Shin asks one question and the reason sits on the same line as the answer, not in a subtitle above twelve chips. | Screen 13 copy |

### D. Your Home Market (screen 6)

| # | Screen | Element | What it does | User need | Verdict | Reason | Shin's version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 9 | Home Market | Country row, pre-filled to Canada with a flag | Scopes verdicts to a market | A verdict against local prices | take | The person is in a Canadian aisle. Without a named market, "above what it goes for" has no referent and Shin's whole judgment is unanchored. | New: home market row in You, pre-filled, one tap to change |
| 10 | Home Market | Currency row, pre-filled to Canadian dollars | Puts every number in the user's money | Not converting currency while standing up | take | The tag in front of the user is in one currency; the comparable set has to be shown in the same one or the user does arithmetic in an aisle. | Same row |
| 11 | Home Market | Explainer, "Verdicts are based on what this product should cost where you shop." | Names the basis of the judgment | Knowing what the verdict is measured against | take | Shin's first priority is that a wrong verdict is worse than none, and a verdict whose basis is unnamed cannot be checked by the person holding the phone. | One line above the provenance list, component 8 |

### E. How It Works (screen 7)

| # | Screen | Element | What it does | User need | Verdict | Reason | Shin's version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 12 | How It Works | Three feature rows: Snap a Photo, Instant Comparisons, Smart Advice | Teaches the loop before first use | Knowing what will happen | reject | Shin's loop is one tap and a face. Explaining it costs more time than doing it once, and a tutorial for a one tap product concedes the tap is not obvious. Reverses if a first run test shows users do not press the shutter unprompted. | none |
| 13 | How It Works | "Start Scanning" primary button | Ends onboarding | Getting to the camera | already have | The camera is the default route (Law 1), so this is the permission screen's single action. | Screen 15 |

### F. Scan tab before permission (screen 8)

| # | Screen | Element | What it does | User need | Verdict | Reason | Shin's version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 14 | Camera Access | Explainer card in place of the viewfinder, carrying the sentence "Photos are saved to your scan history on this device, but never stored on our servers." | Pre-permission priming | Knowing what happens to the photo | adapt | The privacy sentence is worth taking; replacing the camera with it twice is not. Shin's user photographs another company's shelf, so where the picture goes is a real question. Spin: the sentence appears on the permission screen and again in You, never as a card that blocks the camera. | Screen 15 copy plus one line in You |
| 15 | Camera Access | "Next" link, tapped at t=24.9 and again at t=27.4 for the same card | Advances the priming | Reaching the camera | reject | Two taps of the same control for one permission, and the second came after the grant had already landed at t=25.7, so the card outlived its purpose. Reverses if a measured decline rate shows priming raises the grant rate enough to pay for the tap. | Shin's permission screen has one action and disappears the moment the grant lands |
| 16 | Camera bar | Gallery button, left of the shutter | Scans a photo from the camera roll | Pricing something not in front of you | adapt | The aisle case is live camera, but the couch case is real and a photo taken earlier is the only way to price a thing already walked away from. Spin: it lives in You, not in the bottom bar, so it never competes with the shutter. | New: pick a photo, in You |
| 17 | Camera bar | Search button, right of the shutter | Opens a text fallback | An answer when the camera cannot identify | take | Shin refuses five of seven items. A refusal with no second route is a dead end, and typing a name is the cheapest second route for someone already holding the phone. | New: a "type it instead" action inside the refusal panel, component 9, which today carries exactly one action |
| 18 | Tab bar | Three tabs: Scan, Collection, Settings | Switches section | Getting to saved scans | already have | Component 15, bottom bar, with the shutter at 76px between watchlist and You. | Component 15 |
| 19 | Viewfinder chrome | "?" help button, top right, permanent | Opens scanning tips | Fixing a bad scan | adapt | The need is real, the placement is not. Spin: Shin does not keep a help button on the camera; the tips appear inside the refusal panel, at the only moment they mean anything. | Refusal panel gains a "why this failed" line |

### G. OLMA Pro paywall (screens 9 and 10)

| # | Screen | Element | What it does | User need | Verdict | Reason | Shin's version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 20 | Paywall | Automatic presentation at t=19.75, half a second after arriving on the Scan tab, before any scan and before camera permission | Sells the subscription at first launch | None | reject | It asks for money before the product has answered a single question. Shin's priority order says a confidently wrong verdict is the worst outcome; selling a thing the user has no evidence works is the same failure pointed at the wallet. Reverses if a measured trial conversion at first launch beats one shown after the first successful verdict. | Screen 14 is reached from You or from the meter, never auto presented |
| 21 | Paywall | Close X, top right | Dismisses | Escaping | take | Any full screen interruption Shin ever shows must be dismissible in one tap at a corner the thumb reaches, because the user is one handed and standing. | Screen 14 |
| 22 | Paywall | Benefit row, "Unlimited Scans, Never hit a limit again." | Says what money buys | Deciding | adapt | Only if Shin meters at all, which Phase 3 decides. Spin: the benefit names the limit's number rather than the word unlimited, so the free tier is legible before the purchase. | Screen 14 |
| 23 | Paywall | Benefit row, "Faster Analysis, Priority server access." | Sells speed | A shorter wait | reject | Selling speed concedes the free path is slowed deliberately. Shin's product is a verdict a person trusts, and a deliberately slowed verdict is a trust cost taken as revenue. Reverses if infrastructure genuinely forces a two tier queue, and then the free tier's wait is stated up front. | none |
| 24 | Paywall | Benefit row, "Pays for Itself, With one good find." | Frames price against savings | Justifying the cost | reject | Shin's hard rule 2: no savings claim until it is measured. This is a performance claim with no testing behind it. Reverses only when a measured saving exists, and then the claim carries the measurement. | none |
| 25 | Paywall | Plan row, 2-Week Free Trial with a "Try Free" pill, subtitle stating $6.99 a month afterwards and that it auto renews | Trial | Trying before paying | adapt | Shin needs a trial only if it meters. Spin worth taking from OLMA: the recurring price sits on the same line as the word free (t=22.00), which is the honest form. | Screen 14 |
| 26 | Paywall | Plan rows, monthly $6.99 and annual $49.99 with a "Best Value" pill | Price choice | Picking a term | already have | Screen 14, paywall, is already on the screen list. | Screen 14 |
| 27 | Paywall | Auto renew fine print block | Legal disclosure | Not being surprised by a charge | take | A subscription without it is a chargeback, and Shin's user is a window shopper who did not come to buy anything. | Screen 14 |
| 28 | Paywall | Restore Purchases, Terms of Use, Privacy links | Account recovery and legal | Reinstalling without paying twice | take | Required in practice by the store, and Shin has a paywall. | Screen 14 |
| 29 | Paywall | Spinner under the benefit rows while plans load, 2.2 seconds (t=19.75 to t=21.9) | Fills the wait | Knowing it is not broken | reject | The wait exists only because the screen was presented before it had anything to sell. Shin does not present a screen that has to load its own reason for existing. Reverses if the paywall is ever reached deliberately, in which case a skeleton row is correct. | none |

### H. iOS permission alert (screen 11)

| # | Screen | Element | What it does | User need | Verdict | Reason | Shin's version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 30 | System alert | Purpose string, "OLMA uses the camera to photograph products so it can compare prices for you.", with Don't Allow and Allow | Grants camera access | Control over the camera | already have | Screen 15 exists and the purpose string is a platform field, not a design decision. | Screen 15 |

### I. How to scan modal (screen 12)

| # | Screen | Element | What it does | User need | Verdict | Reason | Shin's version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 31 | How to scan | Five line accuracy checklist: center the product, include the original packaging, include the price tag, for clothing scan just the price tag, good lighting | Teaches a better photo | Fewer failed scans | adapt | Shin refuses most items and the fixable subset of refusals is the photo. Spin: Shin never shows the list before the first scan; it shows the one line matching the failure, inside the refusal panel. Five rules before anything has gone wrong teach nothing, because none of it has happened yet. | Refusal panel gains one cause line drawn from this list |
| 32 | How to scan | "Start Scanning" button whose only effect is to dismiss the modal | Removes the modal | Getting to the camera | reject | A modal over a live viewfinder whose only action removes itself is a tap that buys nothing. Reverses if a measured first scan failure rate without it is materially worse. | none |

### J. Viewfinder (screens 13 and 14)

| # | Screen | Element | What it does | User need | Verdict | Reason | Shin's version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 33 | Viewfinder | Live feed as an inset rounded card, not full bleed (t=29.00) | Frames the shot | Seeing the shelf | reject | The inset shows less of the shelf than the phone can see, and Shin's Law 1 is that the camera is the app. Reverses only if a full bleed feed makes the chrome unreadable in a bright store, which is a contrast problem in the chrome, not a reason to shrink the camera. | Component 1, full bleed viewfinder |
| 34 | Viewfinder | Permanent hint pill, "Center the price tag or product in the frame" | Says what to aim at | Aiming | adapt | Naming the price tag as a target is the useful half, because the tag is exactly what the aisle user is standing in front of. Spin: Shin's reticle does the aiming and the pill appears only while nothing is detected. | Component 1 reticle plus a conditional hint |
| 35 | Viewfinder | Flash and torch toggle, top left; on at t=79.0, off by t=80.5 | Lights a dark shelf | Scanning a bottom shelf or a fridge | take | Grocery aisles have bottom shelves and glass doors, and a dark photo is one of the fixable causes of a refusal. One tap, on the surface the user is already on. | New: torch toggle on the viewfinder, top left, 44px |
| 36 | Viewfinder | Shutter that becomes the capture progress indicator (t=33.75 to t=34.5) | Takes the photo, then shows it is working | Knowing the tap registered | adapt | Right feedback, right place. Spin: Shin's shutter already presses to 0.92 with an outward ring pulse; add OLMA's idea that the control itself carries the progress, so no separate spinner ever appears over the frozen frame. | Component 2 gains a progress ring state |
| 37 | Viewfinder | Scan meter pill, "3 Scans Remaining", green sparkle, above the viewfinder | Shows the free allowance | Knowing when it runs out | adapt | A meter belongs in Shin only if scans are metered, which Phase 3 decides. Spin if kept: the number on the pill and the number in Settings render from one source, which OLMA's do not (3 on the pill at t=19.25 against five a month in Settings at t=68). | Phase 3 decision; if kept, one number, one source |

### K. Enter Price sheet (screens 15 and 16)

| # | Screen | Element | What it does | User need | Verdict | Reason | Shin's version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 38 | Enter Price | The sheet itself, asking the user to type the asking price before analysis | Supplies the number the verdict is measured against | Getting a verdict at all | take | Shin's engine answers 2 of 7 items, and the asking price is the one input a person at the shelf always has. `NOW.md` already requires a stated stand-in price to be labelled as one; typing the tag price makes it observed rather than stated. | New: the asking price is typed on the verdict sheet before the comparison, labelled as read from the tag by the user |
| 39 | Enter Price | "Detecting price..." spinner running beside the keypad from t=34.75 to t=41, never resolving | Promises automatic price reading | Not typing | reject | It ran six seconds, never returned a number, and the user typed anyway. Shin's hard rule 3 forbids fabricated price data, and a permanent "detecting" that never detects is the interface form of the same problem: a promise with no result. Reverses when tag reading actually returns a number, at which point it fills the field rather than sitting beside it. | Shin either fills the field or does not mention detection |
| 40 | Enter Price | Photo thumbnail above the field | Confirms what was captured | Knowing you photographed the right thing | take | At the moment the user types a number, the photo is the only check that the number belongs to that item, and a number attached to the wrong item is the worst outcome in Shin's priority order. | Component 5 area shows the frozen frame while the price is typed |
| 41 | Enter Price | Large numeric keypad with a decimal key and a backspace | Types a price fast | One handed entry while holding a basket | take | The user is standing, one handed. A system keyboard's number row is a smaller target than a keypad key, and a mistyped digit is a wrong verdict. | New: keypad for asking price entry |
| 42 | Enter Price | "Clear" button | Resets the field | Fixing a mistyped price | take | Same reason: the fastest recovery from a wrong digit, in a place where the user is not looking at the screen the whole time. | Same sheet |
| 43 | Enter Price | "% OFF" button beside Clear | Applies a discount to the typed price | Pricing a sale tag | adapt | Sale tags are the normal case in a grocery aisle and a shelf tag often shows a percentage rather than a final number. Spin: Shin computes it and shows the resulting price before the verdict, so the user sees the number the verdict is about. | New: percent off entry, resulting price shown |
| 44 | Enter Price | "Skip" in the top right | Proceeds with no asking price | Seeing the going rate with no tag in view | take | Shin's window shopper often wants the going rate rather than a judgment on one tag. Skipping the asking price returns the range and no verdict, which is exactly Shin's refusal shape and costs nothing extra to build. | The verdict sheet with no asking price shows the spread rail and no face verdict |
| 45 | Enter Price | "Cancel" in the top left | Abandons the scan | Backing out | already have | Going back is a downward drag on the sheet, not a back button. | Component 4 sheet, drag down |
| 46 | Enter Price | "Analyze" primary button | Starts the comparison | Getting the answer | already have | Scan, identify and verdict are one surface with no separate submit step. | Section 4, one surface |

### L. Analysing (screens 17 to 19)

| # | Screen | Element | What it does | User need | Verdict | Reason | Shin's version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 47 | Analysing | Streaming status line, three named states: "Identifying the product" (t=38.75), "Searching for prices" (t=39.00), "Finding retailer links" (t=43) | Says which step is running | Knowing the wait is progressing, and how far | take | Shin's wait is about ten seconds and its most common ending is a refusal. A person who waits ten seconds for "I cannot price this" and was never told which step failed has no reason to try again, and no idea what to change. Naming the step names the repair. | New: three named states under the thinking face, and the refusal panel names the step that came up empty |
| 48 | Analysing | Product name shown during the wait, "Aquafina purified water" | Confirms identification early | Knowing the app found the right thing before the price arrives | take | Shin has no vision model and the user picks the item from a list, so echoing the pick on the waiting screen is the cheapest guard against a right price attached to the wrong object. | Thinking state shows the chosen item name |
| 49 | Analysing | Close X, top right | Aborts the scan in progress | Escaping a slow answer | take | The aisle user can be interrupted at any second by a person, a cart, or a decision to move on. A wait with no exit is the one screen in the flow where the phone owns the user. | New: the verdict sheet can be dragged away while thinking, and the drag cancels the scan |
| 50 | Analysing | "Add More Details" button, offered during the wait | Improves the query while it runs | Not restarting after a failure | take | Five of seven Shin scans end in a refusal and the repair today only exists after the refusal lands. Offering it during the wait turns dead time into the repair. | The refusal repair action is also live during the thinking state |
| 51 | Analysing | Animated colour gradient behind the photo, cycling purple, blue, green | Fills the wait | A feeling of activity | reject | Motion carrying no information, on the one screen where the user is deciding whether to trust the result. `DESIGN.md` section 6: motion exists to make the judgment feel like it landed, and never decorates. Reverses if a measured abandon rate during the wait falls with it. | Section 6 rules stand |

### M. Result (screens 20 to 24)

| # | Screen | Element | What it does | User need | Verdict | Reason | Shin's version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 52 | Result | Verdict label "Outrageous" in red with a red X icon | Names the judgment | The answer | adapt | The word is aimed at the price, which Shin's hard rule 4 requires, and the intensity is exactly what the brief's Phase 4 is asking for: not merely negative but angry. Spin: Shin's verdict is a face plus a word, not an icon plus a word, and the intense form is gated on the confidence treatment so it can never fire on thin evidence. | Component 3, walk state, intense form |
| 53 | Result | Verdict sentence rewritten in place at t=50, after being readable at t=49, from "You should look elsewhere, this is much higher than other prices." to "Walk away and shop around because other Canadian retailers are selling this for less." | Explains the judgment | Understanding why | reject | The sentence changed under the reader, with the same label and the same confidence beside it. For a product whose only value is being trusted about a number, that is the cheapest way to lose it. The underlying need, one explanatory sentence, is served by writing it once. | One string from the personality table, rendered once, never streamed |
| 54 | Result | "Confidence 65%" | Quantifies certainty | Knowing how much to trust the verdict | adapt | Shin already carries confidence and carries it better: hue is the verdict, saturation is the confidence (Law 2), and the dots are a four step scale with a stated basis. OLMA's 65% has no scale and no source, and it sat directly above "No comparable prices found where you scanned this" at t=54. Spin: Shin's confidence is a shape, and its reason is the provenance list. | Component 6 plus component 8 |
| 55 | Result | "Tagged at $2.00" chip on the product card, in the verdict's red with a red icon | Shows the price the user typed, coloured by the verdict | Seeing which number was judged | take | Shin must show the asking price next to the comparison, and colouring it by the verdict means the two numbers can never be swapped at arm's length. | Component 5, price hero with the asking price under it, asking price taking the verdict hue |
| 56 | Result | "Typical price in Canada $0.50 to $0.75" as the headline comparison | Gives the going rate as a range | Knowing what it should cost | take | A range is the only honest form when the comparable set is small, which is Shin's normal case, and component 7 already refuses averages for the same reason. What Shin's spec lacks is the range as the headline; today it is only the rail. | Component 7 gains a stated range above the rail |
| 57 | Result | Position rail, green to red gradient, white dot pinned at the far right for a price above the range | Places the asking price against the range | Seeing how far off it is | adapt | Right idea, wrong gradient: a green to red rail is itself a verdict, so the rail's colour and the dot's colour compete, and a price above the range is clamped to the end, which hides how far above it is. Spin: Shin's rail is neutral, the dot carries the verdict hue, and a price outside the range is drawn outside the rail. | Component 7, spread rail |
| 58 | Result | Market named inside the comparison label, "in Canada" | Scopes the range | Knowing the range is local | take | Without the market, "what it goes for" has no referent for a person in a Canadian aisle, and an unscoped range is a confidently wrong verdict waiting to happen. | Component 7 label carries the market |
| 59 | Result | Star rating and review count, four and a half stars, "4.6 (799)" | Product quality signal | Deciding whether the thing is any good | reject | Shin answers about the price, not the product. A quality rating on the verdict surface invites the verdict to be read as a buy recommendation, and the decision already recorded is that the button after the verdict is save, not buy. Reverses if a measured test shows users cannot act on a price verdict without a quality signal. | none |
| 60 | Result | "Comparable prices" section with the empty state "No comparable prices found where you scanned this." | States that the comparable set is empty | Knowing the verdict rests on nothing local | take | This is Shin's most common outcome and stating the absence as a finding is hard rule 3 exactly. What OLMA gets wrong is showing it under a confident verdict; in Shin the empty set sets the verdict. | Component 9 refusal panel, and component 8's empty row |
| 61 | Result | "Searching for more sources..." inline spinner, still running at t=59, eleven seconds after the verdict landed | Says more evidence is coming | Knowing whether the answer may change | reject | A verdict that may change while you read it is not a verdict. Shin's priority order puts a wrong verdict above everything else, and a verdict delivered before its evidence set is closed is a wrong verdict with a delay. Reverses if late sources arrive as an explicit update carrying a new confidence, never as a silent revision. | Shin closes the evidence set, then draws once |
| 62 | Result | "Similar products" section, still "Still looking..." at t=59 | Offers alternatives | Finding a cheaper option | adapt | This is the strongest need on the screen for a window shopper: not "is this fair" but "what do I buy instead". Spin: Shin's version is a cheaper source for the same item from the same comparable set, not a similar product, because a similar product is a purchase recommendation and Shin does not recommend purchases. | New: cheaper elsewhere row in the full detent, from the same comparable set |
| 63 | Result | "What reviewers are saying", a paragraph of summarised reviews | Product quality context | Deciding whether to buy | reject | The longest element on a screen whose job is a three way judgment, and it is about the product rather than the price. Reading it takes longer than the decision it sits inside. If it belongs anywhere it is a page the user chooses to open, not the verdict surface. | none |
| 64 | Result | "How are these results?" with a thumbs up and a thumbs down | Collects a per result quality signal | Telling the app it is wrong without knowing the right answer | take | Shin's only correction path today is component 10, which asks for the real price, and a user who merely knows the verdict is wrong does not have it. One tap is the only signal that user can give, and calibration is Shin's first priority, so it is the highest value tap on the screen. | New: two tap feedback row in the full detent, above correct it |
| 65 | Result | Feedback toast, "Thanks for the feedback", with an Undo link | Acknowledges and allows retraction | Not being stuck with a mis-tap | take | One tap controls need one tap reversal, and the aisle user taps while moving. | The feedback row's acknowledgement carries Undo |
| 66 | Result | Share button, top right | Shares the result | Showing someone the price | already have | Component 13, a fixed 4:5 export with the brand pink present. Shin's is a designed card rather than a screenshot, and the channel is short form video. | Component 13 |
| 67 | Result | Trash button, bottom left, immediately beside Done | Deletes the scan | Removing a mistake | adapt | Deleting is right, the position is not: a destructive control beside the primary action at the bottom of a scrolling sheet is exactly where a thumb lands. Spin: Shin's delete lives on the saved item's own row, with an undo. | Component 11 watch row, swipe to remove |
| 68 | Result | "Done" primary button | Closes the result | Getting back to the camera | adapt | Shin's sheet is dragged down and the frozen frame stays behind it. Spin: keep one obvious exit for the case where the sheet is at the full detent and a drag is a long way for a thumb. | Component 4 sheet, drag down, with a done affordance at the full detent only |

### N. Collection (screens 25 to 27)

| # | Screen | Element | What it does | User need | Verdict | Reason | Shin's version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 69 | Collection | Grid of saved scans, each a photo card with name, price and date | The scan history | Finding a thing you priced before | adapt | Shin has a watchlist, which is prices being tracked, not scans that happened. The history is a different need: what did that cost when I looked. Spin: watched items first, past scans second, one page. | Watchlist page gains a past scans section |
| 70 | Collection | Verdict badge on the card, amber "Fair Price", on the same scan the result screen called "Outrageous" at t=49 | Shows the verdict at a glance | Scanning the list fast | adapt | Carrying the verdict into the list is right, and Shin's tier colours already do it. The contradiction is the lesson: one scan produced two different answers on two screens. Spin: Shin's row renders from the same verdict object as the sheet, and the confidence treatment travels with it, so a thin verdict is hollow in the list too. | Component 11 in the four confidence treatments |
| 71 | Collection | "Search products" field | Finds a saved scan | A long history | reject | A search field over a screen holding one card (t=64) is chrome, and Shin's list will hold a handful of watched items. Reverses at the list length where scrolling actually fails, which is a number to measure rather than guess. | none |
| 72 | Collection | Sort menu, Date (checked) and Alphabetically | Reorders the list | Finding a thing | reject | Same reason at the same list length. Reverses on the same measurement. | none |
| 73 | Collection | "Group by Category" | Groups the list | Comparing across a category | reject | Shin's corpus is small and its categories are declared, with produce out of v1. Grouping a short list adds a level of hierarchy over nothing. Reverses when the corpus makes a flat list unreadable. | none |
| 74 | Collection | Overflow menu item "Select", entering multi select | Bulk actions on saved items | Clearing many at once | reject | A bulk mode over a handful of rows is a mode with nothing to do. Reverses with list length, as above. | none |
| 75 | Collection | Overflow menu item "Recently Deleted" | Recovers a deleted scan | Undoing a delete made days ago | take | A saved scan is the only record of what a thing cost when the user looked, and that record cannot be rebuilt afterwards from anything Shin holds. A delete with no recovery destroys data the corpus does not have. | New: recently removed section in the watchlist page, with a stated retention window |

### O. Settings (screen 28)

| # | Screen | Element | What it does | User need | Verdict | Reason | Shin's version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 76 | Settings | "Try Pro for 14 Days Free" row at the top | Second, deliberate entry to the paywall | Upgrading later | take | A paywall the user walks into is the placement OLMA's auto presented one should have had. Shin's screen 14 needs an entry point that is not an interruption of a scan. | Screen 14, reached from You |
| 77 | Settings | "Free accounts get 5 scans a month. Pro is unlimited." | States the allowance in words | Knowing the limit | adapt | Stating the limit is right, but OLMA's own numbers disagree: five a month here at t=68 against three on the pill at t=19.25. Spin: if Shin meters, the allowance is one number, written once, rendered everywhere from one source. | Phase 3 and Phase 5 decision |
| 78 | Settings | Country and currency pickers | Changes the market later | Travelling, moving, or a wrong auto detection | take | The market is what the verdict is measured against, so a user whose market is wrong receives a confidently wrong verdict, which is the outcome Shin's priority order exists to prevent. | You page, home market row |
| 79 | Settings | "Location Access" row with its own Continue button, used to detect the country automatically | Fills the market without asking | Fewer questions | adapt | Useful, but for Shin's user location can name the store, not only the country, which is a stronger comparison. Spin: location is optional, its only stated use is on the row itself, and refusing it leaves the market editable by hand. | You page, optional location row |
| 80 | Settings | "Price verdicts are judged against typical prices in this market." | Names the basis of every verdict | Checking the answer | take | Same reason as row 11: an unnamed basis cannot be checked by the person holding the phone, and Shin's first priority is calibration. | You page, under the market row |
| 81 | Settings | "Shopping Interests, 4 selected" row | Edits the onboarding answers | Changing your mind | reject | Follows row 5: no interests, no editor. Reverses with row 5. | none |
| 82 | Settings | Privacy note, "Scan history stays on this device. Only the photo is sent to our server to identify the product and compare prices." | Says exactly what leaves the phone | Photographing a store shelf without knowing where the picture goes | take | Shin's user points a camera at another company's property. One sentence naming what leaves the device is the difference between a tool and a surveillance app, and it costs a line. | You page, one line, same specificity |
| 83 | Settings | "Animation Haptics" toggle, on by default | Turns off motion and haptics together | Motion sensitivity, or a quiet store | adapt | `DESIGN.md` already honours the system reduced motion setting, so an in app duplicate is redundant. Spin: keep the haptics half only, because the verdict lands as a haptic and a store aisle is a public place. | You page, haptics switch |
| 84 | Settings | "Report an Issue" row, with a line saying a wrong price is the fastest thing to get fixed | Routes a bad answer to the makers | A verdict that is wrong | take | Shin's first priority is calibration and its only evidence is outcomes. A wrong price reported by someone standing in front of the real one is the highest quality outcome data this product can get. | You page, plus the one tap version in row 64 |
| 85 | Settings | Privacy Policy and Terms of Use rows | Legal | Store requirement and trust | take | Required in practice, and Shin has a paywall. | You page, legal section |
| 86 | Settings | "Version 1.0.5 (1)" footer | Build identity | Reporting a bug against a build | take | A bug report with no build number is not reproducible, and Shin's calibration record depends on knowing which version produced a verdict. | You page footer |

### P. Scanning Tips popover (screen 30)

| # | Screen | Element | What it does | User need | Verdict | Reason | Shin's version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 87 | Scanning Tips | Popover anchored to the help button, repeating verbatim the five rules already shown at t=27.5 | On demand help | Fixing a scan | reject | Third appearance of the same content in one session, and it still arrives before any failure. Shin shows the one relevant line at the failure. Reverses if a measured refusal rate falls when the tips are available on demand. | Covered by row 31 |

### Q. Text search (screen 31)

| # | Screen | Element | What it does | User need | Verdict | Reason | Shin's version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 88 | Text search | Prompt telling the user to name the item, and that brand and model give the closest match | Says how much to type | Getting a match on the first try | take | Shin's identification is a pick from a fixed corpus and a typed name has to hit it. Naming brand and model is the instruction that makes a text route work instead of failing silently on an empty box. | The refusal panel's type it instead action carries the same line |
| 89 | Text search | Search field with a submit arrow, over a blurred but still visible viewfinder | Types the item name | Not losing the shelf while typing | take | Keeping the camera visible behind the field means the user can still see what they are aiming at, which matters when the thing being named is in front of them and the name is on the box. | Same action, camera stays behind |

### R. Torch on (screen 29)

| # | Screen | Element | What it does | User need | Verdict | Reason | Shin's version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 90 | Viewfinder, torch on | Filled bolt icon and a visibly lit scene at t=79.0, off again by t=80.5 | Confirms the light is on | Not walking out of the store with the torch burning | take | A state the user can see is a state the user turns off, and a torch left on in a store is both rude and a battery cost for a person who came in to browse. | Row 35's toggle carries a visible lit state |

---

## 3. OLMA's usage process, from the timestamps

Times are seconds into the recording. Tap times are given as the quarter second window in which
the screen began to change, so they are accurate to 0.25 seconds.

1. **t=0.00. Launch.** The app was opened from its App Store product page (the status bar back
   link reads "App Store" for the whole recording). Black splash, rosette logo, no progress.
   The logo morphs into a camera aperture at t=2.
2. **t=4.75. Welcome to OLMA**, step 1 of 4. One promise: never overpay when shopping abroad or
   at home. Continue tapped at about t=6.25. Dwell 1.5 seconds.
3. **t=6.50. What Do You Shop For**, step 2 of 4. Twelve interest chips. Two selected by t=10,
   four by t=11. Continue tapped at about t=11.5. Dwell 5 seconds. Continue was already live
   with nothing selected at t=9, so nothing on this step was required.
4. **t=12.00. Your Home Market**, step 3 of 4. Country Canada and Canadian dollars, both already
   filled. Continue tapped at about t=14.5. Dwell 2.5 seconds, no input.
5. **t=15.00. How It Works**, step 4 of 4. Three lines. Start Scanning tapped at about t=19.1.
   Dwell 4 seconds, part of it under an iOS notification banner at t=16 and t=17.
6. **t=19.25. Scan tab reached.** The meter pill reads "3 Scans Remaining" immediately. The
   camera is off; a Camera Access explainer card sits where the viewfinder will be, carrying the
   sentence about photos staying on the device, and one link, Next.
7. **t=19.75. The paywall presented itself**, half a second after arrival, before any scan and
   before camera permission. **This is a wait**: the plan rows were not loaded, and a spinner sat
   under the three benefit rows from t=19.75 to t=21.9, 2.2 seconds.
8. **t=22.00. Paywall loaded.** Three rows: a two week free trial then $6.99 a month, monthly
   $6.99, annual $49.99 marked Best Value. Dismissed with the close X at about t=23.1. Total
   interruption 3.4 seconds.
9. **t=23.25. Back on the Camera Access card.** Next tapped at about t=24.9.
10. **t=25.00. iOS camera permission alert.** Allow tapped at about t=25.7; the green camera
    privacy indicator appears in the status bar at t=25.75.
11. **t=25.75 to t=27.4. The Camera Access card stayed on screen after the grant**, still
    showing Next as its only action. A second Next tap at about t=27.4 was needed.
12. **t=27.50. How to scan modal** over the now live viewfinder. Five accuracy rules, one
    button. Dismissed at about t=28.8.
13. **t=29.00. First usable viewfinder.** Elapsed from launch: 29 seconds. Roughly 15 of those
    were onboarding, 3.4 the paywall, and 8 permission cards and the tips modal.
14. **t=29 to t=33.5. Aiming.** The hint pill is on the whole time and never changes. A bottle
    of Aquafina is centred by t=32.
15. **t=33.75. Shutter pressed.** The shutter itself becomes the progress indicator for about
    0.75 seconds.
16. **t=34.75. Enter Price sheet rises.** Photo thumbnail, a "Detecting price..." spinner, a
    CAD 0.00 field, keypad, Clear, "% OFF", Analyze, with Cancel and Skip in the bar.
17. **t=34.75 to t=41. "Detecting price..." never resolved.** The user typed 2 by t=37.25 and
    tapped Analyze at about t=38.7. **This is a wait that produced nothing**: automatic price
    reading was promised on screen for six seconds and the manual keypad did the work.
18. **t=38.75. Analysing screen.** Photo inside a soft vignette over a cycling colour gradient.
    **This is the long wait, 9.8 seconds**, and it is the best filled wait in the recording:
    the status line names three steps in order, "Identifying the product" at t=38.75,
    "Searching for prices" from t=39.00, "Finding retailer links" from t=43. The product name
    "Aquafina purified water" is already on screen at t=38.75. A close X aborts. An "Add More
    Details" button is offered while the wait runs.
19. **t=48.5. Verdict.** **This is where value was delivered**, and it is the only such moment
    in 99 seconds. Elapsed from launch: 48.5 seconds. Elapsed from the first usable viewfinder:
    19.5 seconds. Elapsed from Analyze: 9.8 seconds.
20. **t=49. The verdict as first readable:** "Outrageous", with "You should look elsewhere,
    this is much higher than other prices." and "Confidence 65%", a red X icon, and "Tagged at
    $2.00" in red on the product card.
21. **t=50. The sentence changed in place** to "Walk away and shop around because other Canadian
    retailers are selling this for less." Same label, same confidence, different sentence, one
    second after the first one was readable.
22. **t=52. The comparison.** "Typical price in Canada", "$0.50 to $0.75", and a green to red
    rail with a white dot pinned at the far right, because $2.00 is above the range.
23. **t=54. Scrolling down reveals the evidence is empty.** "Comparable prices: No comparable
    prices found where you scanned this." Under it, a "Searching for more sources..." spinner,
    and under that "Similar products: Still looking...". **Two more waits, running underneath a
    verdict that has already been delivered.** Both were still unresolved at t=59.
24. **t=55. "What reviewers are saying"**, a paragraph about taste and packaging, the longest
    block on the screen. Below it, "How are these results?" with a thumbs up and a thumbs down.
25. **t=59.75. Thumbs up tapped.** The feedback row is replaced by "Thanks for the feedback",
    with an Undo link.
26. **t=61.25. Done tapped.** Back to the viewfinder. The meter now reads "2 Scans Remaining".
27. **t=63.25. Collection tab.** One card: the photo, an amber "Fair Price" badge, the truncated
    name, "$2.00", "Sep 3".
28. **t=66 to t=71.5. Settings.** Try Pro for 14 Days Free, the free allowance stated as five
    scans a month, home market, interests, the on device privacy note, an Animation Haptics
    toggle, Report an Issue, Privacy Policy, Terms of Use, Version 1.0.5 (1).
29. **t=71.75. Back to Scan.** t=79.0 torch on, t=80.5 torch off.
30. **t=82 to t=84.75.** Help button tapped, Scanning Tips popover, the same five rules from
    t=27.5.
31. **t=85.75 to t=88.75.** Search button tapped. A text fallback appears over the blurred
    viewfinder, asking the user to name the item and saying that brand and model give the
    closest match. Nothing was typed.
32. **t=90.5 to t=95.5. Collection again.** Overflow menu at t=92.25 (Select, Recently Deleted),
    sort menu at t=94.0 (Date checked, Alphabetically, Group by Category).
33. **t=96 to t=98. Settings**, end of recording. A second scan was never taken, so the meter
    never moved below 2.

### Where OLMA made the user wait, and what it showed

| Wait | Duration | What was on screen |
| --- | --- | --- |
| Cold start, t=0.00 to t=4.75 | 4.75s | Logo only, no progress indicator |
| Paywall plan load, t=19.75 to t=21.9 | 2.2s | Three benefit rows above a bare spinner |
| Price detection, t=34.75 to t=41 | 6.2s, unresolved | "Detecting price..." beside a keypad the user was already using |
| Analysis, t=38.75 to t=48.5 | 9.8s | Product name, three named status steps in order, an abort, an "Add More Details" action, and a decorative gradient |
| Comparables and similar products, t=54 to beyond t=59 | 5s+, unresolved | Two inline spinners underneath a verdict already delivered |

### The scan meter

- **First appears** at t=19.25, the moment the Scan tab is reached, as a pill above the
  viewfinder reading "3 Scans Remaining" with a green sparkle icon.
- **Where it lives.** Only on the Scan tab. It is absent from the Enter Price sheet, the
  analysing screen, the result screen, Collection and Settings.
- **When it ticked.** It read 3 in every frame from t=19.25 to t=33.5, and 2 in every frame from
  t=61.25 onward. The meter was off screen from t=34 to t=61.25, so **the moment of the
  decrement is not shown in the recording**. What can be said is that one scan cost one unit,
  and the new value was visible on return to the camera.
- **Zero state:** not shown in the recording. The video ends with 2 remaining and a second scan
  was never taken.
- **The number does not agree with Settings.** The pill said 3 at first launch (t=19.25);
  Settings says free accounts get five scans a month (t=68). The recording does not show why,
  and no explanation appears on either screen.
- **What OLMA sells against it.** OLMA Pro, headline "Unlock unlimited price checks and save
  money everywhere you shop" (t=22.00). Three benefits: Unlimited Scans, Faster Analysis with
  priority server access, and Pays for Itself with one good find. Three plans: a two week free
  trial then $6.99 a month, monthly $6.99, annual $49.99 marked Best Value. Settings carries a
  second door, "Try Pro for 14 Days Free" (t=68).

---

## 4. What OLMA gets wrong for our user

Shin's user is standing in an aisle, one handed, in front of one price, and is a window shopper
rather than a buyer.

1. **48.5 seconds from launch to first verdict.** That is the whole recording's first half. In
   an aisle the person has a cart behind them and a shelf in front of them.
2. **The paywall fired at t=19.75, before a single scan and before the camera was even on.** It
   sells unlimited price checks to somebody who has not yet seen one price check work.
3. **Four surfaces for one instruction.** A Camera Access card (t=19.25), the same card again
   after the grant (t=25.75 to t=27.4), a How to scan modal (t=27.50), and the identical five
   rules again in a popover (t=82). All of it before anything had gone wrong.
4. **A promise shown live and not kept.** "Detecting price..." ran from t=34.75 to t=41 and
   never returned a number while the user typed one by hand.
5. **The verdict sentence rewrote itself at t=50** after being readable at t=49, same label,
   same confidence. For a product whose only value is being trusted about a number, changing the
   sentence under the reader is the wrong kind of motion.
6. **"Confidence 65%" has no scale and no source**, and it sat above "No comparable prices found
   where you scanned this" (t=54). Confident in what, measured against what.
7. **The longest block on the verdict screen is a review summary** (t=55). Reading it takes
   longer than the decision it is embedded in, and it is about the product, not the price.
8. **One scan, two answers.** The result screen called it "Outrageous" (t=49); the Collection
   card badges the same scan "Fair Price" (t=64).
9. **One allowance, two numbers.** Three on the meter (t=19.25), five a month in Settings
   (t=68).
10. **Evidence still loading eleven seconds after the verdict** (t=59). The user cannot tell
    whether the answer they just read is the final one.
11. **The viewfinder is an inset card, not full bleed** (t=29). Less shelf is visible than the
    phone can see, on a product whose first law is that the camera is the app.
12. **Twelve interest chips before the app has earned anything** (t=6.5), on a step whose
    Continue button was already live with nothing selected (t=9).

---

## 5. What OLMA gets right that Shin's spec lacks

Each of these is a gap in `docs/design/DESIGN.md` as it stands, not a compliment to OLMA.

1. **Named streaming statuses during the wait** (t=38.75, t=39.00, t=43). `DESIGN.md` section 6
   has motion for the verdict arriving and nothing at all for the ten seconds before it. Shin's
   refusal rate makes this worse, not better: waiting ten seconds to be told "I cannot price
   this" without ever learning which step came up empty leaves the user with no repair.
2. **A price band as the headline, not just a rail** (t=52). Shin has the spread rail as
   component 7, but nothing in the spec says the headline comparison is a stated range. OLMA
   leads with the range and treats the rail as its illustration, which is the right order.
3. **An abort during the wait** (the close X at t=39). Shin's spec has a downward drag to leave
   the verdict sheet but nothing named for cancelling a scan that is still running, which is the
   one moment the phone is holding the user.
4. **A one tap correctness signal** (t=55, thumbs up and thumbs down) with an acknowledgement
   that can be undone (t=59.75). Shin's only correction path is component 10, which asks for the
   real price. A user who knows the verdict is wrong but not what is right currently has no way
   to say so, and calibration is Shin's first priority.
5. **A repair offered during the wait, not after the failure** ("Add More Details", t=39).
   Shin's identification is a picker and there is no place to add a detail while the query runs.
6. **A non camera route to a verdict** (t=85.75). Shin's spec has no path to an answer that does
   not start with a photo, which for a product that refuses most items is a missing exit.
7. **Recovery for a deleted item** ("Recently Deleted", t=92.25). Shin's watchlist spec has no
   undo for a removal, and a removed scan is a record the corpus cannot rebuild.
8. **The market named on the verdict itself** ("Typical price in Canada", t=52) and again in
   settings (t=68). Nowhere does `DESIGN.md` say which market a verdict is scoped to, and
   without that the whole three way judgment has no referent.

---

31 screens found, 90 elements inventoried, 35 take, 23 adapt, 23 reject, 9 already have, 35 + 23 + 23 + 9 = 90

Frames on disk: 503 (99 at one per second, 8 scene change, 396 at four per second). Frames read:
233 (all 99, all 8, and 126 of the 396, per section 0), plus six full resolution re-crops of
frames already read.

---

## Addendum, 2026-09-05: what the four per second frames settle about the architecture

Written after a re-read of f_0158 to f_0212 and s_039, s_057, s_062, s_090, s_091, prompted by a
challenge to an earlier verbal account of how the app is built. Each item below is a frame
citation, not an inference from the tables above.

1. **Identification runs during price entry and is withheld until the user commits.** The Enter
   Price sheet at t=38.75 (`s_039`, and the full resolution `full/enterprice_top.jpg`) shows the
   photo thumbnail, a spinning "Detecting price...", the keypad and CAD 2, and **no product
   name**. The first analysing frame after the Analyze tap, `f_0158` at t=39.5, already reads
   "Aquafina purified water". Half a second is not enough for a vision call, so the identification
   was running behind the sheet and its result was held back.

2. **The analysing screen is where progress is shown, and it is shown as named ordered steps**,
   each with its own icon, under the resolved product name: "Searching for prices" with a
   magnifier (`f_0158` to `f_0170`, t=39.5 to 42.5), "Finding retailer links" with a link glyph
   (`f_0176`, `f_0186`, t=44 to 46.5), "Verifying results" with a filled green check (`f_0193`,
   t=48.25). "Add More Details" sits under all three throughout.

3. **The result screen arrives whole.** Its first fade-in frame, `f_0196` at t=49, already carries
   the product card, the 4.6 (799) star row, "Tagged at $2.00" in red, the "Outrageous" block with
   its sentence and "Confidence 65%", "Typical price in Canada $0.50 - $0.75", the complete rail
   with the dot pinned at the far right, and the "Comparable prices" heading. Nothing on this
   screen fades in after anything else.

4. **The sentence rewrite at t=50 is a whole string replacing a whole string, inside one 250 ms
   frame boundary.** `f_0201` carries "You should look elsewhere, this is much higher than other
   prices."; `f_0202` carries "Walk away and shop around because other Canadian retailers are
   selling this for less." Label and confidence are identical either side. A twelve word sentence
   generated token by token would occupy several frames in partial states; none exists. This is a
   placeholder being swapped for a final, which strengthens element 53's reject rather than
   softening it: it is not a stream the user caught mid-flight, it is two finished sentences.

5. **The range and the comparable set are on different clocks, and only one of them can hold up
   the verdict.** The range is fully populated in the first paint at t=49. The comparable set is
   still empty and still spinning at t=57 (`s_057`: "No comparable prices found where you scanned
   this." above "Searching for more sources...", with "Similar products: Still looking..." below
   it), and the user leaves the screen at about t=59 with both still running (`s_062`, t=62, is the
   camera again, meter reading "2 Scans Remaining"). So the number the verdict is measured against
   does not come from the search that is labelled as the evidence, and does not wait for it.
   Whether that is two stores or one store with a national filter and a local filter, the frames
   cannot say. What they do say is that the panel presented as the evidence has no power to stop
   the verdict.

6. **The Collection badge is a second answer, not a stale first one.** One card, the same scan
   (`s_091`, t=91, full frame; `full/collection_card.jpg` is the crop). Amber "Fair Price" with an
   equals icon, "$2.00" rendered in amber, dated Sep 3. Identical at t=63.5 and t=90.5, thirty
   seconds apart. Two explanations are ruled out by the frames: it is not a stale copy of an
   earlier verdict, because the result screen read "Outrageous" from its first readable frame and
   was never anything else; and it is not a late revision, because nothing late ever arrived and
   the badge did not move in thirty seconds. What remains is that the badge is computed from
   something other than the verdict, most plausibly a neutral default written at save time when
   the comparable set was empty, since an equals icon and the middle colour is what "no evidence"
   looks like if absence is not handled. The default is a reading; the disagreement is a fact.
   Element 70 stands as written.

The three items that survive as the sharpest for Shin: the verdict is drawn before the evidence
set is closed (5), the two surfaces disagree about the same scan (6), and the explanatory sentence
changes under the reader (4).
