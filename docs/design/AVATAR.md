# Shin AVATAR.md

The avatar behaviour contract. Written 2026-09-03 as Phase 4 of
`docs/design/brief-usage-and-avatar.md`.

**The artwork is not in this file. The contract the artwork slots into is.** A separate artist
draws thirteen faces in three personality treatments and thirteen animations. This file is the
list they build against, and it is also the interface the build codes against, so a screen written
today does not move when the art lands.

Three things before the tables.

**`USAGE.md` wins on sequence, `DESIGN.md` wins on colour, type, motion and component
definition.** Where this file and `DESIGN.md` section 3 disagree, the disagreement is named in
section 10 and Phase 6 makes the edit. This file does not edit `DESIGN.md`.

**Every threshold here is a design default to be tuned, not a measurement.** Nothing in this file
has been tested against a person or against a price. A default is a number the build is held to
until real scans replace it.

**Hard rule 4 is the constraint the whole file is built around.** The aggression points at the
price, the store, or the brand, and never at the user. Section 7 checks every Blunt line against
it by name and records the lines that were deleted rather than softened.

---

## 1. The final screen list

Forty screens and states. This merges `DESIGN.md` section 7 (fifteen), everything `USAGE.md`
adds, and every OLMA row marked take or adapt that implies a screen or a state. Every later table
in this file is checked against this list.

**Group A. Cold start and setup**

| # | Screen or state | Where it comes from |
|---|---|---|
| 1 | First run, cold open, feed not yet live | `USAGE.md` A1 0:00 |
| 2 | Attitude picker, pick your Shin | `DESIGN.md` §7.13, `USAGE.md` A1 0:01.2 |
| 3 | Permission primer, before the system prompt | `DESIGN.md` §7.15, `USAGE.md` drop-off 1 |
| 4 | System camera prompt | `USAGE.md` A1 0:06.4, OLMA audit row 30 |
| 5 | Camera denied, screenshot fallback | `USAGE.md` drop-off 1 |

**Group B. The camera surface**

| # | Screen or state | Where it comes from |
|---|---|---|
| 6 | Camera, idle, nothing detected, watchlist empty | `DESIGN.md` §7.1 |
| 7 | Camera, hint escalated after four seconds of nothing | `USAGE.md` B1 0:13.9, OLMA audit row 34 |
| 8 | Camera, torch on | OLMA audit rows 35 and 90, take |
| 9 | Camera, identifying, reticle contracting, frame freezing | `DESIGN.md` §7.2 |
| 10 | Identity chip resolved, the wrong-item repair | `USAGE.md` A1 0:12.9, OLMA audit row 48 |
| 11 | Asking price pad | `USAGE.md` A1 0:13.4, OLMA audit rows 38, 41, 43 |
| 12 | Working, the named steps | OLMA audit row 47, audit §5 item 1 |

**Group C. The verdict surface**

| # | Screen or state | Where it comes from |
|---|---|---|
| 13 | Verdict, good, certain or fairly sure | `DESIGN.md` §7.3 |
| 14 | Verdict, good, at the steal threshold | Brief §0.5, OLMA audit row 52 |
| 15 | Verdict, fair | `DESIGN.md` §7.5 |
| 16 | Verdict, walk away, certain or fairly sure | `DESIGN.md` §7.4 |
| 17 | Verdict, walk away, at the rip-off threshold | Brief §0.5, OLMA audit row 52 |
| 18 | Verdict, thin evidence, hollow treatment, any tier | `DESIGN.md` §7.5, `USAGE.md` drop-off 7 |
| 19 | Going-rate card, no asking price | `USAGE.md` §2, OLMA audit row 44 |
| 20 | Verdict sheet, half detent | `DESIGN.md` §4, `USAGE.md` §7 |
| 21 | Verdict sheet, full detent | `DESIGN.md` §7.8 |
| 22 | Correction detent | `DESIGN.md` §7.9, `USAGE.md` C3 item 3 |
| 23 | Watch or save acknowledged | `USAGE.md` A3 0:12.5 |
| 24 | Thumbs feedback row and its acknowledgement | OLMA audit rows 64 and 65, take |

**Group D. Refusals**

| # | Screen or state | Where it comes from |
|---|---|---|
| 25 | Refusal, no identity | `DESIGN.md` §7.6, `USAGE.md` C2 |
| 26 | Refusal, unsure which one | `USAGE.md` drop-off 3, C2 |
| 27 | Refusal, category declined | `DESIGN.md` §7.7 |
| 28 | Refusal, too little evidence | `USAGE.md` C1, C2 |
| 29 | Refusal acknowledged, Keep it landed | `USAGE.md` C1 0:12.9 |
| 30 | Type it instead, the text route out of a refusal | OLMA audit rows 17, 88, 89, take |

**Group E. Pages**

| # | Screen or state | Where it comes from |
|---|---|---|
| 31 | Watchlist, empty | `DESIGN.md` §7.10, owl mapping row 19 |
| 32 | Watchlist, items, no movement | `DESIGN.md` §7.10 |
| 33 | Watchlist, a price dropped | `DESIGN.md` §7.11 |
| 34 | Recently removed | OLMA audit row 75, take |
| 35 | Past scans | OLMA audit rows 69 and 70, adapt |
| 36 | Share card | `DESIGN.md` §7.12 |
| 37 | Paywall | `DESIGN.md` §7.14, OLMA audit rows 20, 21, 76 |
| 38 | Meter zero state, dark switch, off in v1 | `USAGE.md` §6 |
| 39 | You | OLMA audit rows 78 to 86 |
| 40 | Market picker | OLMA audit rows 9, 11, 78, 80, take |

### Not on the list, and why

- **A home screen widget.** The owl note calls it the strongest take of the twenty four surfaces,
  because it reaches the user without asking for their schedule and Shin's value arrives at a
  moment it cannot predict (`notes/duolingo-owl.md` mapping row 18). It is not on this list
  because a widget showing a watched price needs a re-queryable price source, and `USAGE.md`
  section 5 records that Shin has never successfully queried one. The face contract below covers
  it the day the feed ships: the widget renders one `nudging` or one tier face at 48px with the
  price and the delta, and nothing else. **The widget face tracks the price and never the user's
  inactivity**, which is the half of Duo's widget that does not carry over.
- **A campaign app icon.** Bounded take in the owl note (mapping row 1) and a marketing artefact,
  not a screen. The bound belongs here anyway: the icon may express something about prices, a
  season, or the brand, and never about how long it has been since this person scanned.
- **A greeting screen.** Struck as a state in section 2 and therefore has no screen.

---

## 2. States

Thirteen kept, one struck. The six in `DESIGN.md` section 3 are all kept and seven are added.

| State | Kept or struck | What it is, and why it earns a face of its own |
|---|---|---|
| `greeting` | **Struck** | The home screen is a live camera and the user is holding the phone up. A greeting costs them the shot, and there is no pre-act screen to put it on, because Law 1 makes scan, identify and verdict one surface (`notes/duolingo-owl.md` mapping rows 4 and 5). The one place a greeting would have gone is the attitude picker, and there the three faces are demonstrating three treatments, not saying hello. |
| `idle` | **Kept, added** | Present and ready. Its payload is aim and readiness, never a hello. It rides the caption under the frame (centred, above the bottom bar since 2026-09-10; it was a top-left dock under the wordmark), so it appears exactly when the app has something to say about aiming and vanishes the instant the reticle catches. |
| `thinking` | **Kept**, from `DESIGN.md` §3 | A step is running. Carries the name of the step, which is the OLMA take that turns a ten second wait into a repair instruction (audit row 47). |
| `asking` | **Kept, added**, working name from `USAGE.md` B3 | **Shin is short of exactly one input and is naming it.** Widened from `USAGE.md`'s single use, because the same posture serves four screens: the going-rate card, the permission primer, the price pad, and the wrong-item repair. It is not `unknown`, which would read as a refusal, and not `thinking`, which would read as unfinished. |
| `good` | **Kept**, from `DESIGN.md` §3 | Cheaper than it usually goes for. |
| `delighted` | **Kept, added** | The intense form of `good`. A steal. Thresholds below. |
| `fair` | **Kept**, from `DESIGN.md` §3 | About the going rate. |
| `walk` | **Kept**, from `DESIGN.md` §3 | Above what it goes for. |
| `angry` | **Kept, added** | The intense form of `walk`. A rip-off, aimed at the price or the store. Thresholds below. |
| `unknown` | **Kept**, from `DESIGN.md` §3 | The refusal face. Five of seven scans end here, and the owl note's fourth consequence is that this is the one state Duolingo never had to design: Duo's job is to make "do it again" unavoidable, and Shin's is to make "I do not know" survivable. It reads as a professional declining to guess, never as an apology for failing the user. |
| `pleased` | **Kept**, from `DESIGN.md` §3 | Something landed: a save, a correction, a Keep it, a feedback tap. |
| `nudging` | **Kept, added, narrowed** | A watched price moved. **Nothing else may ever trigger it.** The candidate in the brief included a refilled meter; that is struck, because a refilled meter is an occasion Shin manufactured, which is the guilt engine wearing a friendlier face (`notes/duolingo-owl.md` §5, sixth consequence). Not reachable in v1: there is no feed. |
| `asleep` | **Kept, added** | An empty screen with nothing to say. The watchlist is empty for every new user and is one of the most common screens early on. Asleep is honest and it is not a reproach. |
| `proud` | **Kept, added, dark in v1** | A price the user contributed was confirmed by a second independent observation. Not reachable in v1, because that confirmation layer does not exist (`USAGE.md` §6). Drawn now, with the same dark-switch shape as the meter, so turning it on is a release rather than a rewrite. **It fires on the confirmation, never on the report**, because hard rule 3 forbids paying for asserted prices. |

### The going rate, defined without an average

Every threshold below is stated against **the going rate**, which is the **median of the
comparable set**, and with an even count, the lower of the two middle values. This is an order
statistic, so it is always a price somebody actually asked. Component 7 already refuses averages
because an average of prices nobody paid is a fabricated number, and the same reasoning applies
to the number the face is computed from.

### The intense forms: thresholds and confidence gates

**All four numbers below are design defaults to be tuned by the first thousand scans. None of
them is a measurement.**

| Intense state | Numeric threshold (default) | Confidence gate | What happens when the gate is not met |
|---|---|---|---|
| `delighted` | Asking price is **25% or more under** the going rate, **and** at or below the lowest price in the comparable set | **Certain or Fairly sure only** (`DESIGN.md` §1, four or more sellers, or two to three sellers, all inside the category's freshness window) | Degrades to `good`, plain form, plain line |
| `angry` | Asking price is **40% or more over** the going rate, **and** above the highest price in the comparable set | **Certain or Fairly sure only** | Degrades to `walk`, plain form, plain line |

**Why the gate exists.** An angry face on thin evidence is a wrong verdict delivered loudly, and
priority 1 calls a confidently wrong verdict the worst outcome this product can produce.
`USAGE.md` drop-off 7 already states the rule from the other side: a thin verdict never gets an
intense face and never gets a loud line. This is the same rule, written as a gate the build can
check.

**Why the two numbers are not symmetric.** A price below the going rate is bounded at zero, so 25%
under is already unusual. A price above is unbounded, and ordinary retail spread across sellers
routinely reaches 25%, so anger at 25% would fire on a normal market rather than on a rip-off.
The asymmetry is a guess with a reason, and it is the first thing to tune.

**Two more conditions on `angry`, both from hard rule 4.**

1. The face may not appear unless **the asking price and the seller's name are both visible on
   the same screen**. The target of the aggression has to be legible, or the aggression has
   nowhere to land but the person holding the phone (`notes/duolingo-owl.md` §5, fifth
   consequence).
2. It never fires on the going-rate card, because that card has no asking price to be angry
   about.

### The plain tier thresholds, for completeness

Defaults, same status. `good` at 5% or more under, `fair` inside 5% either side, `walk` at 5% or
more over.

---

## 3. The per-screen table

One row per screen per trigger. Fifty four rows across forty screens.

**Size tokens**, used in the size column. `DESIGN.md` section 3 sets the minimums: 96px on the
verdict surface, 28px on rows and chips. This file adds three sizes between them and one above,
and section 10 records the clarification `DESIGN.md` needs.

| Token | px | Where |
|---|---|---|
| `face-verdict` | 96 | Any face that carries a verdict or a refusal |
| `face-working` | 76 | `thinking` and `asking` on the verdict surface, which carry no verdict |
| `face-page` | 48 | Page headers, drop cards, primers, pickers |
| `face-ack` | 62 | An acknowledgement replacing a verdict or refusal in place |
| `face-row` | 28 | Rows, chips, hint pills, toasts. Never smaller than this, anywhere. |
| `face-share` | 220 | The 4:5 share card export only |

**Line rules.** Two lines of body text maximum on the verdict surface (`DESIGN.md` §2). No string
repeats a number the screen already shows, **except where Deadpan's voice is the repetition**,
which is the whole of that personality: "Two dollars. It's $1.47." Rows 13, 16, 18 and 33 use that
exception and no others do.

| # | Screen | Trigger | State | Position | Size | Deadpan | Warm | Blunt | Animation | Dismiss / cap |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1. Cold open | App launched, feed not yet live | none | none | none | none | none | none | none | **None, because** the cold open lasts 1.2s, which is shorter than a line can be read, and a face that appears and is immediately replaced by the picker's three faces teaches the user that Shin is four different things. |
| 2 | 2. Attitude picker | The picker rises | `fair`, drawn three times, one per personality | Three faces side by side, page centre, 33% from the top | `face-verdict` each | "Two dollars. It's $1.47." | "Ooh, that's steep. I'd wait." | "They're robbing you." | `face-morph` on entry, staggered 60ms left to right | Not dismissible, the tap on a face is the continue. Once per install, and any time from You. |
| 3 | 2. Attitude picker | A face is tapped | `pleased`, the chosen one only | Same position, the other two fade | `face-verdict` | "Deadpan it is." | "Good pick. I will be gentle." | "Good. Let's go." | `pleased-nod` | Advances after 400ms. Once per pick. |
| 4 | 3. Permission primer | Primer shown 1.2s before the system prompt | `asking` | Hint line, leading edge | `face-page` | "I need the camera to read a barcode." | "I need the camera to read a barcode. That is all it is for." | "Camera. For barcodes. Nothing else." | `face-morph` | Not dismissible, the shutter is relabelled Allow camera. Once per install, never a second ask in the same session. |
| 5 | 4. System prompt | The OS alert lands | none | none | none | none | none | none | none | **None, because** the alert is an operating system surface with no space Shin can draw in, and the purpose string is a platform field rather than a design decision (OLMA audit row 30). |
| 6 | 5. Camera denied | The user denies | `idle` | Hint pill, leading edge | `face-row` | "No camera then. Screenshots work too." | "No camera then. Screenshots work too, and that is fine." | "Fine. Screenshots then." | `face-morph` | The line persists as the hint. Never a second ask in the same session. |
| 7 | 6. Camera idle | Viewfinder live, nothing detected | `idle` | Caption under the frame, centred, 14px above the bottom bar | 36px | "Point at the barcode." | "Point at the barcode and I will do the rest." | "Barcode. Point." | `idle-breath`, loops, plus `blink` | Vanishes the instant the reticle catches. Reactive, unbudgeted: it is the app's only aiming instruction. |
| 8 | 6. Camera idle | The reticle catches | `idle` exits with the pill | Hint pill | `face-row` | none | none | none | 120ms opacity exit, no movement | Not dismissible, it is a departure. |
| 9 | 7. Hint escalated | Four seconds live with nothing detected | `asking` | Hint pill, leading edge | `face-row` | "No tag on it? Point at the thing itself, or use your last screenshot." | "No tag on it? Point at the thing itself, or I can read your last screenshot." | "No barcode there. Try the thing itself, or a screenshot." | `face-morph` | Replaced by the idle hint on any detection. **Unprompted. One per camera session, never repeated.** |
| 10 | 8. Torch on | The torch is toggled | none | none | none | none | none | none | none | **None, because** the torch is chrome with a visibly lit scene as its own feedback (OLMA audit row 90), and a face beside it would be commenting on the light rather than on a price. |
| 11 | 9. Identifying | Barcode caught, reticle contracting, frame freezing | `thinking` | Caption position under the frame, which the rising sheet then replaces | 36px | "Reading the tag" | "Let me have a look" | "Hang on" | `think-dots`, loops | A downward drag cancels the scan (OLMA audit row 49). Reactive, unbudgeted. |
| 12 | 10. Identity chip | Identity resolves, chip under the reticle | `thinking` | Chip, leading edge | `face-row` | "Kraft Dinner Original, 225 g." | "Kraft Dinner Original, 225 g. That right?" | "Kraft Dinner, 225 g. Right one?" | `face-morph` | The chip is the repair; tapping it reopens the pick. Reactive, unbudgeted. |
| 13 | 10. Identity chip | The chip is tapped, wrong item | `asking` | Chip, leading edge | `face-row` | "Which one is it?" | "Point me at the right one." | "Which one." | `face-morph` | The picker replaces the chip. Reactive, unbudgeted. |
| 14 | 11. Price pad | The pad rises over the frozen frame | `asking` | Above the pad, leading edge, on the prompt's line | `face-page` | "What does the tag say?" | "What is on the tag?" | "Tag price. Type it." | `face-morph` | Drag down abandons the scan. Reactive, unbudgeted. |
| 15 | 11. Price pad | The percent-off toggle is used | `asking` | Same | `face-page` | "$5.00 after 20% off. That is the number I will judge." | "That is the number I will judge, not the one on the tag." | "The discounted one. That is what I judge." | none | Same. Reactive, unbudgeted. |
| 16 | 12. Working | Step one, identifying the product | `thinking` | Verdict surface, centred, above the step label | `face-working` | "Identifying it" | "Working out what this is" | "Figuring out what it is" | `think-dots` loops, `step-swap` on entry | Drag cancels the scan. Reactive, unbudgeted. |
| 17 | 12. Working | Step two, searching for prices | `thinking` | Same | `face-working` | "Looking for prices" | "Off to find some prices" | "Hunting prices" | `step-swap` | Same |
| 18 | 12. Working | Step three, checking the sellers | `thinking` | Same | `face-working` | "Checking the sellers" | "Checking who has it" | "Checking who sells it" | `step-swap` | Same |
| 19 | 12. Working | Past the 0.8s budget, under the 6s cap | `thinking` | Same | `face-working` | "Still on it." | "Still on it, sorry." | "Slow one." | `think-dots` continues, no new motion | Same. Past 6s the sheet converts to screen 28. |
| 20 | 13. Verdict good | 5% or more under the going rate, gate not required | `good` | Sheet header, leading edge, 20px inset from the leading edge and 20px from the sheet top | `face-verdict` | "$1.47 usually. This is $1.19." | "Good spot. That is under what it usually goes for." | "Take it before they notice." | `verdict-land`, then the expression is already set | Drag down. Reactive, unbudgeted. |
| 21 | 14. Verdict steal | 25% or more under, at or below the lowest comparable, Certain or Fairly sure | `delighted` | Same | `face-verdict` | "Nobody else is near that." | "Oh, that is a proper find. Nobody else is close." | "Somebody in that store made a mistake. Enjoy it." | `intense-hold` with `verdict-land` | Drag down. Reactive, unbudgeted. |
| 22 | 15. Verdict fair | Inside 5% either side | `fair` | Same | `face-verdict` | "That is the going rate, $1.47." | "That is about what it goes for. You are fine." | "Fine. Whatever." | `verdict-land` | Drag down. Reactive, unbudgeted. |
| 23 | 16. Verdict walk | 5% or more over, gate not required | `walk` | Same | `face-verdict` | "$2.00. It is $1.47." | "Ooh, that is steep. It usually goes for less." | "They are robbing you." | `verdict-land` | Drag down. Reactive, unbudgeted. |
| 24 | 17. Verdict rip-off | 40% or more over, above the highest comparable, Certain or Fairly sure, seller name on screen | `angry` | Same | `face-verdict` | "Nobody else charges that." | "No. That is not a price, that is a hope." | "That is a robbery with a barcode on it." | `intense-hold` with `verdict-land` | Drag down. Reactive, unbudgeted. |
| 25 | 18. Verdict thin | One seller, or points ageing out, any tier | The plain tier face, **never** the intense form | Same | `face-verdict` | "One seller says $1.47. That is all I have." | "I only found one seller, so take this lightly." | "One seller. Thin, but there it is." | `verdict-land` only. No `intense-hold`, ever. | Drag down. Reactive, unbudgeted. |
| 26 | 19. Going-rate card | Identity resolved, no asking price supplied | `asking` | Card header, leading edge | `face-working` | "I know what this goes for. I do not know what they are asking." | "I know what this goes for. Tell me the tag and I will judge it." | "I know the going rate. I do not know their number." | `face-morph` | Drag down, and that is a complete session. Reactive, unbudgeted. |
| 27 | 20. Half detent | The sheet is dragged to half | Unchanged from the verdict that produced it | Sheet header, leading edge, pinned | `face-ack` | No new line, the peek line stays | Same | Same | **None. The face never re-morphs on a drag or a scroll.** | Drag. Reactive, unbudgeted. |
| 28 | 21. Full detent | The sheet reaches full | Unchanged | Sheet header, leading edge, pinned | `face-ack` | No new line | Same | Same | None | Drag. Reactive, unbudgeted. |
| 29 | 21. Full detent | The market line under the comparison is read or tapped | none | none | none | none | none | none | none | **None, because** the market is a fact about what the comparison is measured against, and the face is a judgment about the price. A face on the referent invites the referent to be read as an opinion (OLMA audit rows 11, 58, 80). |
| 30 | 22. Correction detent | Correct it tapped, the pad rises inside the same sheet | `asking` | Above the pad, leading edge | `face-page` | "What does it actually say?" | "What does it actually say? I would rather be corrected." | "Tell me the real number." | `face-morph` | Drag returns to the verdict, the frozen frame is never lost. Reactive, unbudgeted. |
| 31 | 22. Correction detent | A correction is saved | `pleased` | Same, the pad has dropped | `face-ack` | "$1.79 at Metro, today. Recorded." | "Got it. $1.79 at Metro, today." | "Recorded. $1.79 at Metro." | `pleased-nod` | Auto-returns to the verdict after 2.0s. Reactive, unbudgeted. |
| 32 | 23. Watch acknowledged | Watch it or Save it tapped, **v1, no feed** | `pleased` | The verdict face morphs in place, no move | `face-verdict` | "Saved at $2.00, Metro, today." | "Saved. I have the number and the day." | "Saved. $2.00, Metro." | `pleased-nod` | The label becomes Watching. Drag to leave. Reactive, unbudgeted. |
| 33 | 23. Watch acknowledged | Watch it tapped **and a re-queryable source exists** (dark, not v1) | `pleased` | Same | `face-verdict` | "Watching. I will say something under $1.47." | "Watching. I will tell you if it drops under the usual." | "Watching. I will shout if it drops." | `pleased-nod` | Same. Ships only with the feed, per section 10. |
| 34 | 24. Feedback row | The row is reached in the full detent | none | none | none | none | none | none | none | **None, because** the row asks whether the verdict was right, and a face beside it is Shin marking its own work. |
| 35 | 24. Feedback row | Thumbs up or thumbs down tapped | `pleased`, **for both directions** | Toast, leading edge | `face-row` | "Noted." | "Thank you. That is how I get better." | "Good. Noted." | `pleased-nod` | Auto-dismisses at 4.0s with Undo live throughout. Reactive, unbudgeted. |
| 36 | 25. Refusal, no identity | No barcode read, or a barcode matching nothing | `unknown` | Refusal panel, centred, above the headline | `face-verdict` | "No barcode I can read. Type what it is." | "I cannot read a barcode there. Tell me what it is and I will try." | "No barcode. Type it." | `verdict-land` at 340ms, then `slow-blink`. No shake, no buzz, no red. | Drag down. One action only. Reactive, unbudgeted. |
| 37 | 26. Refusal, unsure | Two or more candidates too close to separate | `unknown` | Same | `face-verdict` | "I am not sure which one this is." | "I think I know this, but not closely enough." | "Which one is it?" | Same | Drag down. The candidate list is the one action. Reactive, unbudgeted. |
| 38 | 27. Refusal, category | The category is out of v1 | `unknown` | Same | `face-verdict` | "Not produce." | "I skip produce. It changes weekly." | "Produce? No." | Same | Drag down. One action: what I can price. Reactive, unbudgeted. |
| 39 | 28. Refusal, thin | Too few points, stale points, no source response, incoherent comparison, or the 6s cap | `unknown` | Same, with the step that came up empty named in mono underneath | `face-verdict` | "Not enough to call it." | "I would rather not say than say it wrong." | "Not enough. I am not guessing." | Same | Drag down. One action: Keep it. Reactive, unbudgeted. |
| 40 | 29. Keep it landed | Keep it tapped | `pleased` | The refusal face morphs in place | `face-ack` | "Written down. $13.49 at Metro, today. I still cannot call it." | "Written down, $13.49 at Metro, today. I still cannot call it, but it is not lost." | "Written down. Still cannot call it." | `pleased-nod` | Holds 2.0s, then the sheet drops to a live viewfinder. Reactive, unbudgeted. |
| 41 | 30. Type it instead | The text route opens over the still-visible camera | `asking` | Above the field, leading edge | `face-page` | "Name it. Brand and model gets closest." | "Name it for me. Brand and model gets closest." | "Brand and model. Type." | `face-morph` | Drag down. Reactive, unbudgeted. |
| 42 | 31. Watchlist empty | The page opens with nothing on it | `asleep` | Centred, 33% from the top | `face-verdict` | "Nothing here yet." | "Nothing here yet. Save something and I will keep an eye on it." | "Empty. Nothing to watch yet." | `sleep-breath`, loops | Not dismissible, it is the screen. Reactive, unbudgeted. |
| 43 | 32. Watchlist, items | The page opens with items | The tier face each item's last verdict produced, in the confidence treatment it had | Row, leading edge, vertically centred | `face-row` | No per-row line, the row carries the price and the delta | Same | Same | **None. Row faces never animate.** | Not dismissible. Reactive, unbudgeted. |
| 44 | 32. Watchlist, items | The page header | none | none | none | none | none | none | none | **None, because** the rows already carry faces and a face above them competes with every one of them. |
| 45 | 33. Price dropped | A watched price moved down past the reportable threshold (dark, not v1) | `nudging` | Drop card, leading edge | `face-page` | "$1.19 at Metro. You watched it at $1.47." | "It dropped. $1.19 at Metro, down from what you saw." | "It dropped. $1.19. They were pushing it before." | `nudge-arrive` | Swipe the card away. **Unprompted. One card per item per movement**, and the notification rule in section 4 governs whether it also leaves the app. |
| 46 | 34. Recently removed | The section opens | `idle` | Section header, leading edge | `face-row` | "Kept for 30 days." | "I keep these for 30 days in case you change your mind." | "30 days, then gone." | none | Not dismissible. Reactive, unbudgeted. |
| 47 | 35. Past scans | The section opens with rows | The tier face the scan produced, in the treatment it had, rendered from the same verdict object as the sheet | Row, leading edge | `face-row` | No line | No line | No line | None. Row faces never animate. | Not dismissible. Reactive, unbudgeted. |
| 48 | 35. Past scans | The section is empty | `asleep` | Centred, 33% from the top | `face-verdict` | "Nothing scanned yet." | "Nothing yet. It fills up on its own." | "Nothing yet." | `sleep-breath`, loops | Not dismissible. Reactive, unbudgeted. |
| 49 | 36. Share card | The 4:5 card is exported | The state the verdict produced, frozen. Never an intense form on a thin verdict. | Card, upper third, centred | `face-share` | The peek line, one line only, never two | Same | Same | None, it is a still export | Not applicable, it is a file. |
| 50 | 37. Paywall | The paywall opens, reached from You or from the meter zero state, **never auto-presented** | `idle` | Page header, leading edge, under the title | `face-page` | "This is what the paid one does." | "Here is what the paid one does. No pressure." | "Here is what money buys. Your call." | `face-morph` | Dismissible in one tap at a thumb-reachable corner. Reactive, unbudgeted, because the user walked in. |
| 51 | 38. Meter zero | The daily allowance reaches zero, only if the dark switch is on | `unknown` | Panel, centred | `face-verdict` | "That is ten for today. The camera still works. I just will not have an opinion until midnight." | "That is ten for today. The camera still works, and everything you saved is still here." | "Ten today. That is my limit, not yours. Back at midnight." | `slow-blink`. No shake, no buzz, no red. | Drag down. Once per day at the moment of zero, never again that day. |
| 52 | 39. You | The page opens | `fair`, the current personality's | Attitude row, leading edge | `face-row` | No line, the row label carries the personality name | Same | Same | None | Not dismissible. Reactive, unbudgeted. |
| 53 | 39. You | The rest of the page | none | none | none | none | none | none | none | **None, because** You is a list of the user's own settings and Shin has no judgment to offer about them. |
| 54 | 40. Market picker | The market row is tapped | `asking` | Above the list, leading edge | `face-page` | "Where do you shop? Every verdict is measured against this." | "Where do you shop? I judge everything against this, so it matters." | "Where do you shop? Get this wrong and I am wrong." | `face-morph` | Drag down. Reactive, unbudgeted. |

---

## 4. The interruption budget

### The distinction that does the work

**Reactive appearances are unbudgeted.** An appearance is reactive if it lands within two seconds
of the user's own act on the same surface: a shutter press, a detection, a typed price, a tap, a
drag, or opening a page. Forty seven of the fifty four rows above are reactive. They are uncapped
because the user asked, and capping an answer to a question the user just asked would make the
product worse at the only thing it does.

**Unprompted appearances are budgeted.** An appearance is unprompted if the user did not act. The
budget is small and this is the reason.

### The numbers

| Kind | Per session | Per day |
|---|---|---|
| Reactive, in app | Unlimited | Unlimited |
| **Unprompted, in app** | **2** | **4** |
| **Unprompted, outside the app (a notification)** | **0 in v1** | **0 in v1** |

The two unprompted in-app appearances are the aim hint escalation (row 9, one per camera session)
and the drop card (row 45, one per item per movement, and not reachable in v1). No third source
may be added without a row in this table.

### The Duolingo reference, honestly stated

`notes/duolingo-owl.md` section 2 records what is and is not known. Duolingo's published work
optimises **which** reminder is sent, not **how many**, chosen per learner per day from a written
pool and evaluated over roughly 200 million practice reminders across 34 days. The only per-day
cap found anywhere is two, asserted by one teardown that cites nothing for it, so it is recorded
there as **unconfirmed** and cannot be used here as a number to compare against. What can be
compared is the shape: Duolingo's floor is daily and self-generated, because a lesson can be done
anywhere, so a push manufactures the occasion for its own core act (owl §5, first consequence).

### Why Shin's is lower

Three reasons, all from `notes/duolingo-owl.md` section 5.

1. **Shin cannot manufacture the occasion.** Its core act requires the user to be standing in a
   specific place in front of a specific price. A push does not produce a scan. It produces an app
   open, a user with nothing to do in it, and a slightly worse opinion of the app.
2. **Shin fires while the user is holding a phone up in a store aisle. That is not a couch.**
   Duolingo can afford a mediocre lesson because there are three hundred and sixty five of them a
   year. Shin might get six scans in a month from a window shopper, and each one happens in public,
   one handed, in a posture with a short fuse. Per occasion value has to be far higher, which
   shrinks the budget rather than growing it.
3. **The volume is set by the world, not by a growth target.** Shin's honest notification ceiling
   is however many watched prices actually moved that day, which for most users on most days is
   zero.

### The notification rule

`USAGE.md` section 5 records the v1 decision: **no push notifications and no notification
permission request**, because there is nothing honest to send and asking for the permission before
there is a message spends the one ask the app gets. The in-app watchlist badge is the whole
notification system in v1.

This is the rule for the day a re-queryable source ships. It is written now so that turning it on
is a release rather than a rewrite.

1. **Shin's only legitimate reason to speak first is a price the user asked to watch that moved.**
   Nothing else, ever. That single class of event is the whole of Shin's licence to interrupt,
   because it is the only outside fact Shin can observe that the user has already asked about.
2. **A movement is reportable only if** it crosses the direction the user was watching for, by at
   least **5% of the last recorded price** (a default, to be tuned), from a source seen inside the
   category's freshness window.
3. **One notification per watched item per movement.** Not per day, not per check.
4. **At most one push per user per day**, the largest movement, and **at most three per week**.
5. **Nothing between 22:00 and 08:00 local.**
6. **The give-up rule.** After five consecutive price alerts that nobody opened, Shin stops
   sending them and says once, in app on the watchlist, that it has stopped. Restarting is the
   user's tap. This is taken directly from `notes/duolingo-owl.md` mapping row 17, which calls it
   the most transferable thing in that document: an ignored price alert is evidence the alert was
   wrong or unwanted, which is information to act on and not a reason to send more. It is also the
   same posture as the product's first priority, because an app that reports the limits of its own
   usefulness is the same app that says "I cannot price this".
7. **Never a re-engagement push, at any volume, in any wording.** Not "you have not scanned in a
   while", not a gentler version of it. The anti-guilt version of that message is not a softer
   phrasing, it is not sending it (`notes/duolingo-owl.md` §5, sixth consequence, and hard rule 4).
8. **The permission is asked immediately after the first save, and not before**, which is the only
   moment the user has told Shin what they want to hear about.

---

## 5. Animations

Thirteen. Name, what it conveys, duration, trigger, loop or once, reduced-motion fallback. Every
one of them is buildable from `DESIGN.md` section 6 plus the wait states the OLMA audit found.

**The rules that govern all thirteen**, from `DESIGN.md` section 6 and this file:

- **The face morphs eyes first, mouth 40ms behind.** 220ms total.
- **Nothing counts up, ever.** A number moving through values it never had is a fabricated
  measurement and it would be the prettiest way for this product to lie.
- **A refusal never shakes, never buzzes, and never goes red.** It gets one slow blink.
- **The face never re-morphs on a drag or a scroll.** Once a verdict has landed the expression is
  fixed until a new scan. OLMA rewrote its verdict sentence under the reader at t=50 after it had
  been readable at t=49, same label, same confidence (audit §4 item 5), and for a product whose
  only value is being trusted about a number that is the cheapest way to lose it. A face that
  changes while the user reads is the same failure in a different medium.
- **Row faces never animate.** At 28px in a scrolling list, motion is noise.
- **Under `prefers-reduced-motion`**, every entry becomes an opacity fade of the same duration and
  nothing moves in space.

| # | Name | What it conveys | Duration | Trigger | Loops or once | Reduced-motion fallback |
|---|---|---|---|---|---|---|
| 1 | `face-morph` | The expression changed | 220ms, eyes first, mouth starts at 40ms | Any state change outside a landed verdict | Once | Crossfade over 220ms, no geometry travel |
| 2 | `idle-breath` | Present and waiting, not frozen | 3200ms per cycle | `idle` on the viewfinder | Loops | Static face, no loop |
| 3 | `blink` | Alive | 140ms | Random, every 4 to 9 seconds, while `idle` or `asking`. Warm blinks at the short end, Deadpan at the long, per `DESIGN.md` §3 | Loops, irregular | None, the eyes stay open |
| 4 | `slow-blink` | Declining to guess. The refusal's entire motion vocabulary. | 520ms, one blink | `unknown` lands, and the meter zero panel | Once | Eyes close and open as an opacity fade, same 520ms |
| 5 | `think-dots` | A step is running | 900ms per cycle, three dots in the mouth position filling left to right | `thinking` | Loops until the step resolves | The dots hold static and only the step label changes |
| 6 | `step-swap` | The named step changed | 160ms | Identifying, then searching for prices, then checking the sellers | Once per step | Label crossfade, the face does not move |
| 7 | `verdict-land` | The judgment arrived | 260ms with the field, 340ms on a refusal | A verdict or refusal rises to peek. **The expression is already set before the rise**, so nobody watches Shin change its mind on screen. | Once | Opacity fade over the same duration |
| 8 | `intense-hold` | The intense forms are more, not louder | Brow sets 60ms before the mouth instead of 40ms, then the face holds 1.12x for 180ms and settles to 1.0 over 200ms. **No shake, ever.** | `delighted` or `angry`, gate met | Once | The face renders at 1.0 with no scale move and the brow timing unchanged |
| 9 | `pleased-nod` | It landed and Shin recorded it | 260ms, a 4 degree tilt and back | Watch acknowledged, correction saved, Keep it acknowledged, feedback acknowledged, personality picked | Once | Opacity fade of the acknowledgement line only, the face does not move |
| 10 | `sleep-breath` | Asleep, nothing to say | 4000ms per cycle | `asleep` | Loops | Static closed-eye face |
| 11 | `wake` | An empty screen just gained its first item | 400ms | The watchlist or past scans goes from empty to one row | Once | The asleep face is replaced by the awake face with a fade |
| 12 | `nudge-arrive` | A watched price moved | 300ms, the face and the drop card enter together from the row's leading edge | `nudging` on the watchlist. Not reachable in v1. | Once | Opacity fade, nothing enters from an edge |
| 13 | `proud-hold` | A contributed price was confirmed by somebody else | 400ms, the row face grows from 28px to 40px and settles back | `proud`. Not reachable in v1. | Once | The confirmed badge appears with no size change |

### The wait, which is where the OLMA audit changed this list

`DESIGN.md` section 6 has motion for the verdict arriving and nothing at all for the ten seconds
before it (`notes/olma/audit.md` §5 item 1). Two things follow, and both are in the table above.

1. **The avatar carries the named step while Shin works.** `think-dots` loops under the face and
   `step-swap` changes the name: identifying the product, then searching for prices, then checking
   the sellers (OLMA audit row 47, take). The product name the user picked is echoed beside it
   (row 48, take), because a right price attached to the wrong object is the worst outcome in the
   priority order.
2. **The step that came up empty becomes the repair instruction.** When the run ends in a refusal,
   the refusal panel names the step that returned nothing, in provenance mono, under the headline.
   "Searching for prices came up empty. 1 found, I need 2." A person who waits ten seconds to be
   told "I cannot price this" and is never told which step failed has no reason to try again and
   no idea what to change. This is row 39 of the per-screen table and it is the single highest
   value line the OLMA audit produced.

Two more from the same audit, both in the dismiss column above: the wait can be **aborted** with a
downward drag (row 49, take), and the **repair is live during the wait**, not only after the
failure (row 50, take).

---

## 6. The placeholder, and the contract as an interface

### What the running app shows until the artwork lands

**Not a grey box.** The app already draws Shin rather than loading him:
`app/public/js/shin.js` exports `faceSvg(expression, opts)`, which renders a stroke-based SVG on
an 88 by 88 viewBox with per-personality geometry. The placeholder is that function, extended, and
nothing else.

| Piece | Specification |
|---|---|
| The face | The existing SVG circle face from `faceSvg`, extended with geometry for the seven new states. Every state has a drawn placeholder, none falls back to `fair`. |
| The state name | Printed under the face, in **IBM Plex Mono at the Label size**: 11px, weight 600, tracking 0.12em, uppercase, in `ink-faint`. Mono is the provenance face, and a placeholder is exactly a statement about what is not yet real. |
| Sizes and positions | **Every size and every position from section 3 is honoured by the placeholder.** A screen built against it does not move when the art lands. This is the point of the placeholder and it is the only thing that makes the hand-off cheap. |
| The three personalities | Distinguished by the face treatments already in `shin.js`: per-personality eye radius and stroke weight, plus the brow and mouth path sets. Deadpan moves least, Warm is rounder and blinks more, Blunt has the heaviest brow and the biggest mouth deltas. |
| Turning it off | One flag, `placeholderLabels`, default on. Setting it false hides the state name and changes nothing else. That flag is the entire art hand-off. |

### The interface, which the artist and the build both use

Four lists. Both sides code and draw against exactly these names, and a name that appears in one
list and not the other is a bug in this file.

**1. State names.** Thirteen, lowercase, and these strings are also the file names the artist
delivers.

`idle` · `thinking` · `asking` · `good` · `delighted` · `fair` · `walk` · `angry` · `unknown` ·
`pleased` · `nudging` · `asleep` · `proud`

**2. Size tokens.** Six, from section 3. `face-verdict` 96 · `face-working` 76 · `face-ack` 62 ·
`face-page` 48 · `face-row` 28 · `face-share` 220. **Never below 28px anywhere.**

**3. Animation names.** Thirteen, from section 5. `face-morph` · `idle-breath` · `blink` ·
`slow-blink` · `think-dots` · `step-swap` · `verdict-land` · `intense-hold` · `pleased-nod` ·
`sleep-breath` · `wake` · `nudge-arrive` · `proud-hold`

**4. The string table key.** `LINES[<key>][<personality>]`, where `<personality>` is one of
`deadpan`, `warm`, `blunt`, and `<key>` is a state name or a state name with a qualifier
(`refuse_unknown_why`, `word_walk_away`, and the rest already in `app/public/js/voice.js`).
**Thirteen states times three personalities is thirty nine cells, and every one of them must exist
or the state does not ship.** No string Shin says is ever written inside a screen, which is the
rule that file already states about itself.

### What the artist delivers

One SVG per state per personality, thirty nine files, plus the thirteen animations.

- Same 88 by 88 viewBox, same origin, same optical centre, so a state change is a morph and never
  a jump.
- Stroke-based, with the stroke colour settable at render time, because the ink colour is the
  verdict hue and it is chosen by the build, not by the file.
- **Every file carries `xmlns`.** This is load-bearing and not decoration: inline HTML tolerates
  its absence and a standalone SVG document does not, so without it any screen that rasterises the
  face onto a share card gets a silently broken image and throws nothing. That has already
  happened once and the share card shipped a face with no eyebrows.
- Stroke weight scales with the circle, never fixed, so 28px and 220px are the same face.

---

## 7. Hard rule 4, applied line by line

> **The aggression points at the price, the store, or the brand. Never at the user.** Groceries are
> non-discretionary and the person scanning did not set the price. (`CLAUDE.md`, hard rule 4)

### Every Blunt line and what it is aimed at

| Row | Blunt line | Aimed at |
|---|---|---|
| 2 | "They're robbing you." | **The store.** The sample line on the picker, and the seller is named on the verdict screen it demonstrates. |
| 3 | "Good. Let's go." | **Nobody.** An acknowledgement of a choice. |
| 4 | "Camera. For barcodes. Nothing else." | **Nobody.** Shin about its own permission. |
| 6 | "Fine. Screenshots then." | **The situation.** The camera was denied and Shin is naming the remaining route, not the denial. |
| 7 | "Barcode. Point." | **Nobody.** An aiming instruction. |
| 9 | "No barcode there. Try the thing itself, or a screenshot." | **The situation.** The object has no readable barcode. |
| 11 | "Hang on" | **Nobody.** Shin about its own wait. |
| 12 | "Kraft Dinner, 225 g. Right one?" | **Nobody.** A confirmation. |
| 13 | "Which one." | **Nobody.** A question about the item. |
| 14 | "Tag price. Type it." | **Nobody.** An instruction about a number. |
| 15 | "The discounted one. That is what I judge." | **Nobody.** Shin about its own arithmetic. |
| 16, 17, 18, 19 | "Figuring out what it is" · "Hunting prices" · "Checking who sells it" · "Slow one." | **Nobody.** Shin about its own work. "Slow one" is aimed at the query, not at the person waiting. |
| 20 | "Take it before they notice." | **The store.** "They" is the named seller on the same screen. |
| 21 | "Somebody in that store made a mistake. Enjoy it." | **The store.** |
| 22 | "Fine. Whatever." | **The price.** A shrug at a number that is neither good nor bad. **Flagged**: see the deletions below. |
| 23 | "They are robbing you." | **The store.** The seller's name is on the same screen, which section 2 makes a condition of the negative faces. |
| 24 | "That is a robbery with a barcode on it." | **The price.** |
| 25 | "One seller. Thin, but there it is." | **Nobody.** Shin about its own evidence. |
| 26 | "I know the going rate. I do not know their number." | **The store.** "Their number" is the seller's, and the absence is the store's, not the user's. |
| 30 | "Tell me the real number." | **Nobody.** A request for a fact, and the implied error is Shin's own verdict. |
| 31 | "Recorded. $1.79 at Metro." | **Nobody.** |
| 32, 33 | "Saved. $2.00, Metro." · "Watching. I will shout if it drops." | **Nobody.** Promises about Shin's behaviour. |
| 35 | "Good. Noted." | **Nobody.** |
| 36 | "No barcode. Type it." | **The situation.** |
| 37 | "Which one is it?" | **Nobody.** |
| 38 | "Produce? No." | **The category.** Shin declining a class of item, not the person who scanned one. |
| 39 | "Not enough. I am not guessing." | **Nobody.** Shin about its own evidence, and the refusal to guess is the product's first priority stated in three words. |
| 40 | "Written down. Still cannot call it." | **Nobody.** |
| 41 | "Brand and model. Type." | **Nobody.** |
| 42 | "Empty. Nothing to watch yet." | **Nobody.** A statement about the list. |
| 45 | "It dropped. $1.19. They were pushing it before." | **The store.** |
| 46 | "30 days, then gone." | **Nobody.** A retention window. |
| 48 | "Nothing yet." | **Nobody.** |
| 50 | "Here is what money buys. Your call." | **Nobody.** A hand-back. The owl note's bound on the paywall applies here: the avatar may be blunt about what the paid tier does, and it may not be hurt or disappointed that the user did not buy it (`notes/duolingo-owl.md` mapping row 20). |
| 51 | "Ten today. That is my limit, not yours. Back at midnight." | **Shin itself.** This is the hard rule 4 form of a limit, and `USAGE.md` section 6 already requires the disappointment at zero to point at Shin rather than at the user. |
| 54 | "Where do you shop? Get this wrong and I am wrong." | **Shin itself.** |

**Blunt lines aimed at the user: zero.**

### Blunt lines written and deleted

Deleted rather than softened, per the brief's rule.

- **"Empty. Go find something."** (row 42, watchlist empty). Aimed at the user, for not having
  saved anything yet. Not being in a shop is not a failure, and this is the reproach the owl note
  says Shin cannot run (`notes/duolingo-owl.md` §5, fifth consequence). Replaced by "Empty.
  Nothing to watch yet.", which is a statement about the list.
- **"Then stop buying it there."** (row 24, rip-off). Aimed at the user's shopping. Groceries are
  non-discretionary and the person scanning did not choose the store's prices or, often, the store.
- **"You typed that wrong."** (row 15, percent off). Aimed at the user's typing. Replaced by a line
  about which number Shin judges.

### Warm lines checked for guilt

The lever Duolingo runs and Shin cannot: a debt the user owes to the character. Duo is
disappointed **in you**, and Shin is disappointed **with the price**
(`notes/duolingo-owl.md` §5, fifth consequence). Duolingo's guilt-framed re-engagement tested 5 to
8% better at re-engagement (`pages/shin-walkthrough.html` stage 11, cited in `USAGE.md` §5) and it
still does not transfer, because skipping practice is a behaviour the user controls and not being
in a shop is not.

Every Warm line above was checked against that. Three needed a note.

| Row | Warm line | Verdict |
|---|---|---|
| 19 | "Still on it, sorry." | **Kept.** Shin is apologising for its own slowness. The apology points at Shin. |
| 30 | "What does it actually say? I would rather be corrected." | **Kept.** The implied error is Shin's verdict, not the user's scan. |
| 42 | "Nothing here yet. Save something and I will keep an eye on it." | **Kept, on one condition.** It is an offer, not a reproach, and it works only because it is on a screen the user opened. **If this line ever appears in a notification it becomes guilt**, so section 4 rule 7 forbids it there. |

**No Warm line manufactures guilt for not opening the app, not scanning, or not buying.** That is
checked, not asserted: no Warm string in the table above refers to a period of the user's
inactivity, and there is no state in section 2 whose trigger is elapsed time since the user last
did something.

---

## 8. Inspiration, never copying

> "we are not trying to copy duolingo or any other app, we are taking inspiration that applies to
> us." (his words on approving `docs/design/brief-usage-and-avatar.md`)

Shin's user, held fixed for every line below: **a window shopper holding a phone up in a store
aisle, standing in front of one price, one handed, where five of seven scans end in a refusal.**
"Duolingo does it" and "OLMA does it" are not reasons and appear nowhere in this section.

### Borrowed from Duolingo's owl

| Borrowed | Source | Why it applies to that person |
|---|---|---|
| A character reacts at the moment of the act | owl mapping row 6 | At arm's length under shop lighting a face resolves faster than a sentence, and the verdict has to read in about three seconds from a metre away |
| The negative reaction, inverted to aim at the price | owl mapping row 7 | Duo's sad face responds to the user's error. Shin has no user error to respond to, so the same energy has a legitimate target: a seller's number, with that seller named on the same screen |
| The completion moment, bounded | owl mapping row 9 | A scan that resolves into a flat card feels like nothing happened, and the face landing is what makes the judgment feel delivered. Bounded: no number counts up, and the size of the celebration may not encode an unmeasured savings claim |
| The character hosts setup | owl mapping row 3 | The attitude picker is the only place in the product where the person is not in a hurry, and a face asking the question turns a settings screen into meeting someone |
| The character is present on the home surface, payload changed | owl mapping row 4 | The home surface is a live camera and they are holding the phone up, so a greeting costs them the shot. What earns the pixels is telling them the tag is not in frame, which is the only thing the app knows that they do not |
| The give-up message | owl mapping row 17 | An alert about a price they asked about, that they never opened, is evidence the alert was wrong or unwanted. For someone who gets six scans a month, sending more is the fastest way to lose the one channel that was legitimate |
| The asleep empty state | owl mapping row 19 | Their watchlist is empty on day one and stays one of the most common screens they see. Asleep is honest, it is not a reproach, and it does not pretend there is something to look at |
| The character stays on the paywall, bounded | owl mapping row 20 | Removing the face at the one screen that asks for money reads as a bait and switch to someone who came in to browse and did not come in to buy. Bounded: it may not be hurt that they did not pay |
| One character carrying three named tones | owl mapping row 24 | It is the only evidence found that a mascot survives carrying a harsh voice, which is the risk the attitude picker already took on for a user who chose Blunt |
| The widget face tracks the price, not the person | owl mapping row 18 | Reserved, not on the v1 list. It reaches them while they are already in a store, without a notification, which is the exact problem of a product whose value arrives at a moment it cannot predict |

### Borrowed from OLMA

| Borrowed | Source | Why it applies to that person |
|---|---|---|
| Named streaming statuses during the wait | audit row 47, §5 item 1 | They wait about ten seconds and most often get "I cannot price this". Naming the step that came up empty is the difference between a dead end and a repair they can act on in the aisle |
| The item name echoed during the wait | audit row 48 | They picked the item from a list, and a right price on the wrong object is the worst outcome available. The echo is the cheapest guard against it |
| An abort during the wait | audit row 49, §5 item 3 | They can be interrupted at any second by a person, a cart, or a decision to move on. A wait with no exit is the one moment the phone owns them |
| The repair offered during the wait, not after the failure | audit row 50, §5 item 5 | Most of their scans fail, so the dead time before the failure is the cheapest place to put the fix |
| Intensity in the verdict, "Outrageous" | audit row 52, adapt | The word is aimed at the price, which is exactly what hard rule 4 requires, and it is the evidence that a merely negative verdict under-serves someone standing in front of a genuine rip-off. Shin's spin: a face rather than an icon, and the intense form gated on confidence so it can never fire on thin evidence |
| A one tap correctness signal, with an undoable acknowledgement | audit rows 64 and 65 | Someone in an aisle often knows the verdict is wrong without knowing the right number, and one tap is the only signal they can give while moving. Calibration is the product's first priority, so it is the highest value tap on the screen |
| The market named on the verdict | audit row 58, §5 item 8 | "Above what it goes for" has no referent for a person in a Canadian aisle unless the market is named, and an unscoped range is a confidently wrong verdict waiting to happen |
| A text route out of a failure | audit rows 17, 88, 89 | Five of seven scans refuse, and typing a name is the cheapest second route for someone already holding the phone with the box in front of them |
| Recovery for a deleted item | audit row 75 | A saved scan is the only record of what a thing cost when they looked, and nothing Shin holds can rebuild it |
| One verdict object rendered everywhere | audit row 70, §4 item 8 | OLMA called one scan "Outrageous" on the result screen and badged the same scan "Fair Price" in the list. For a product whose only value is being trusted about a number, two answers for one scan is the whole product failing at once |
| The verdict never rewrites under the reader | audit row 53, §4 item 5 | OLMA's sentence changed at t=50 after being readable at t=49. Shin's version of that failure would be a face that re-morphs while they read, so section 5 forbids it outright |

**What OLMA's own screens prove by absence.** OLMA's result screen carries a label, an icon, a
confidence percentage, a rail, a star rating and a review paragraph, and no character at all
(`notes/olma/audit.md` §2 rows 52 to 68). It is a competitor shipping the same job with no mascot,
which is what makes the face a differentiator rather than a copy, and it is also why the review
summary is the longest block on their verdict screen: with no face, the explaining has to be done
in prose, and prose takes longer to read than the decision it sits inside.

### Duolingo levers deliberately not taken

One line each, with the reason.

| Lever | Source | Why not |
|---|---|---|
| The streak | owl mapping row 10 | It pays a window shopper for entering stores on the app's schedule, and pays everyone for rescanning the same barcode. Duolingo's core act produces nothing but learning; Shin's produces price data, and a streak is the cheapest possible instruction to fabricate it |
| Streak freeze and streak revival | owl mapping rows 11 and 12 | Follows from the streak |
| The routine practice reminder | owl mapping row 14 | Shin cannot remind anyone to go shopping. A daily push is a push into a moment where the app can do nothing for the person receiving it |
| The streak loss save push | owl mapping row 15 | Follows from the streak and the reminder |
| The escalating guilt ladder | owl mapping row 16 | Every rung aims at the user. Hard rule 4 deletes the rung rather than softening it |
| The app icon degrading with the user's behaviour | owl mapping row 2 | Someone who has not scanned in four days has not failed at anything. They have not been in a store |
| A character appearance at lesson start | owl mapping row 5 | Shin has no pre-act screen. Anything placed between the intention and the result delays the number, which is the product |
| The mid-lesson reward interstitial | owl mapping row 8 | There is no mid. One shutter press produces one verdict, and a celebration inserted before the answer is a delay dressed as a reward |
| Leaderboards | owl mapping row 21 | Ranking by scans pays for scanning noise; ranking by "good prices found" pays for inventing them. Handed to Phase 5 with the condition that reverses it |
| A note from the character in merchandise | owl mapping row 23 | No merchandise, no audience, and no cleared name |
| The retention multiple as a reason to build any of it | owl §3, "His claim" | No source found attributes a retention multiple to the mascot. The evidence supports a weaker and more useful claim: the mascot is the delivery vehicle that made a stack of small mechanics tolerable, not the mechanic itself. **This file is built on that reading**, which is why the avatar's most important state is `unknown`: the job is to make an honest refusal survivable, five times out of seven, and that is a job Duo never had to do because Duolingo always has an answer |

---

## 9. Check

- **Screens on the final list: 40.** Numbered in section 1, in five groups.
- **Rows in the per-screen table: 54.** Numbered in section 3.
- **Every screen has at least one row.** Screens 1, 4, 8 have exactly one and it is a "none,
  because" row; screens 21, 24, 32 and 39 each carry one "none, because" row alongside a real one.
  Screens 2, 10, 11, 22, 23, 24, 32, 35 and 39 carry two rows, screen 12 carries four, and every
  remaining screen carries one. 40 screens, 54 rows, no screen with zero.
- **Every row has all ten columns.** Screen, trigger, state, position, size, Deadpan, Warm, Blunt,
  animation, dismiss/cap. A "none, because" row carries "none" in the six middle columns and its
  reason in the dismiss column, which is the form the brief specifies.
- **Every Blunt line names its target.** Section 7, one row per Blunt line, thirty six entries
  covering every Blunt string in the table. Lines aimed at the user: zero. Three were written and
  deleted rather than softened, and they are recorded with the reason.
- **Every intense state has a numeric threshold and a confidence gate.** `delighted`: 25% or more
  under the going rate, at or below the lowest comparable, Certain or Fairly sure only. `angry`:
  40% or more over the going rate, above the highest comparable, Certain or Fairly sure only, and
  the seller's name visible on the same screen. Both are labelled as design defaults to be tuned
  and neither is a measurement.
- **Thirteen states, one struck with a reason.** Thirteen animations. Thirty nine string cells
  required, thirty nine specified as required.

---

## 10. What `DESIGN.md` must change to point at this file

**Phase 6 makes these edits. This file does not.**

### Section 3, Shin's face

1. **"Expression states. Six"** becomes thirteen, and the list is replaced by a pointer:
   *the states, their triggers and their thresholds are `docs/design/AVATAR.md` section 2.*
   `DESIGN.md` keeps only the mapping from the four verdict tiers to the four tier faces, which is
   a colour-system fact and belongs there.
2. **The 96px minimum needs qualifying.** Today it reads "Minimum on-screen diameter on the
   verdict surface is 96px". `USAGE.md` puts the `thinking` face at 76px and the refusal
   acknowledgement at 62px, both on that same surface. The fix is one clause: **96px is the floor
   for a face that carries a verdict or a refusal**, and the non-verdict sizes are the tokens in
   `AVATAR.md` section 3. Nothing anywhere goes below 28px.
3. **Add the confidence gate**, in the section that already defines the four treatments: the
   intense forms `delighted` and `angry` require the Certain or Fairly sure treatment from
   section 1 and degrade to the plain form otherwise.
4. **Add the target rule**: a negative face may not be drawn unless the asking price and the
   seller's name are both visible on the same screen.
5. **Add the string table shape**: the key is state times personality, thirty nine cells minimum,
   and a state with a missing cell does not ship. `DESIGN.md` already says strings live in one
   table keyed by state and personality; this adds the completeness requirement.
6. **Add the delivery list pointer**: the artist's deliverable is `AVATAR.md` section 6, not
   section 3's list.

### Section 6, motion

7. **Add the thirteen named animations**, or replace the table's face row with a pointer to
   `AVATAR.md` section 5. Section 6 today has one row for the face and nothing for the ten seconds
   before the verdict.
8. **Add two rules** that section 6 does not have: the face never re-morphs on a drag or a scroll,
   and row faces never animate.

### Section 7, screens to draw

9. **Replace the fifteen with the forty** in `AVATAR.md` section 1, each traced to its source. This
   is also Phase 6's own task from the brief.

### One conflict that is not a `DESIGN.md` edit

10. **`app/public/js/voice.js`, the `watching` string, promises to look again.** Its current form
    is "Watching. I will say something under $1.47." `USAGE.md` section 5 records that v1 ships no
    push notifications and no feed, and `USAGE.md` C4 forbids promising to look again because
    there is no re-queryable source and a capability claim the app cannot honour sits in the same
    family as a fabricated price. The same reasoning applies to a save on a verdict, not only to a
    refusal. **Rows 32 and 33 of section 3 split that string into a v1 form that says what Shin
    saved and a dark form that promises, shipped with the feed.** The build pass makes that change
    in `voice.js`; it is recorded here because this file is where the conflict was found.

    **Closed 2026-09-07. The build pass made the change and this entry did not catch up.**
    `voice.js` now carries both forms: `watching` is the v1 one and says only facts already on
    screen, "Saved at $13.49, Metro, today"; `watching_feed` is the dark one and holds the
    promise. `say()` picks between them on `FLAGS.feed`, which is `false`, and nothing outside
    `voice.js` names the dark key, whose own comment reads "Never call this key directly."
    Verified on `main` and on `feature/ui-excellence`; neither ships a promise. Left in place
    rather than deleted because the split it asked for is the thing that shipped, and because
    an open item that was silently satisfied is worth seeing once. **Reverses if** `FLAGS.feed`
    is ever set true without the dark strings being re-read first.
