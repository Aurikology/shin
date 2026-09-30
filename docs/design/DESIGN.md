# Shin DESIGN.md

**`USAGE.md` wins on sequence, `AVATAR.md` wins on the face.**

The design system for the Shin app. This file is the source for colour, type, motion, component
definition and the screen list. If a screen and this file disagree, this file wins and the screen
gets fixed. Where sequence is in question, meaning what comes before what and what a tap leads to,
`docs/design/USAGE.md` wins over this file. Where the avatar is in question, meaning its states,
triggers, thresholds, lines, sizes and animations, `docs/design/AVATAR.md` wins over this file.
Written 2026-09-03, folded together with those two files 2026-09-04.

Shin is a mascot-led price scanner. You point your phone at a thing and a face tells you whether
the price is fair, or tells you honestly that it does not know.

---

## 0. The three laws

Every rule below traces to one of these. A rule that traces to none of them is decoration and
gets deleted.

**Law 1. The camera is the app.** The default screen is a live viewfinder, not a list. The
shutter is the one control always within a thumb's reach. The verdict appears over the world the
user is standing in, not on a page they navigate to. Scan, identify and verdict are one surface,
never separate screens. That surface had three states here and now has five: identify, the asking
price pad, the work, the verdict, and the correction. The pad and the correction come from
`USAGE.md`, which wins on sequence; section 4 carries the detail.

**Law 2. Hue is the verdict, saturation is the confidence.** The product's whole output is a
three way judgment carrying an uncertainty. Colour has to carry both. A confident walk away is a
solid saturated field. A thin one is the same hue, hollow, outlined. This makes calibration
something the user sees rather than something a footnote claims.

**Law 3. A refusal is a screen, not an error.** Five of the seven things Shin knows about end in
a refusal, so refusal is the most common outcome of the primary action, not an edge case. It is
grey, never red, because red means the price is bad and must never be confused with "no data". It
always hands back one thing the user can do.

---

## 1. Colour

### Ground

The app is mostly live camera, so chrome is dark, translucent, and gets out of the way.

**The values are in `app/public/css/tokens.css` and are not repeated here.** This section owns
what each token is FOR; that file owns what each token IS. Read the value from the declaration,
never from a document. Rewritten 2026-09-11, when ten of this section's eleven two-theme colour
rows were found to disagree with the file that ships, having drifted through the 2026-09-05 and
2026-09-06 palette passes while still reading as the authority. `app/test/design-doc.test.mjs`
now fails if a hex value for a named token reappears in this file, which is the only way a rule
like this survives contact with a hurry. `DEFECTS.md` D-085 and build standard 4 are the story.

| Token | Use |
| --- | --- |
| `ground` | Behind everything that is not camera |
| `surface` | Sheets, cards, rows |
| `raised` | Inputs, chips, pressed states, and a card that sits ON a surface |
| `scrim` | Over the camera feed, with a 20px backdrop blur |
| `hairline` | Dividers, 1px |

### Text

| Token | Use |
| --- | --- |
| `ink` | Anything the answer is made of |
| `ink-muted` | Supporting sentences, captions that must still be read |
| `ink-faint` | Quiet labels and provenance. Clears 4.5 on all three grounds in both themes, worst case 4.52 on `raised`; it did not before 2026-09-05, and the comment in `tokens.css` recording that is about the OLD value |

### Brand

`shin`, the one brand colour, declared once in `tokens.css`.

This is Shin's own colour. It is the wordmark and the shutter ring, and it is the colour a share
card is recognised by in someone else's screenshot. **It is never a verdict.** It does not appear
on the verdict surface at all, which is what keeps it from being mistaken for walk away in a
screenshot. That collision is real in the current app and this rule is the fix.

### Verdict

Four states, not three, because the refusal is one of them. Each has a base for chrome and a
bright for use over a live camera feed in a well lit store.

| State | Means |
| --- | --- |
| `good` | Cheaper than it usually goes for |
| `fair` | About the going rate |
| `walk` | Above what it goes for |
| `unknown` | Shin will not call it |

Each state has three tokens in `tokens.css`: `--<state>` is the FILL of a field, `--<state>-on` is
the text drawn ON that field, and `--<state>-bright` is the same hue lifted for use as text or as a
mark on a ground rather than on a field. `fair` and `good` carry dark text on their fill, `walk`
and `unknown` carry light text, and each pairing is asserted in `app/test/tokens.test.mjs` rather
than claimed here.

**A fill colour is never text on a ground.** `--<state>` is tuned to be read as a field with its
own `-on` text over it, so putting it on `surface` at small sizes fails the floor: measured
2026-09-11, `walk` is 3.25 and `unknown` is 3.09 on dark surface, and in light it is `good` at 3.42
and `fair` at 3.39 that fail instead, so testing one theme proves nothing. Tier-hued TEXT uses
`--<state>-bright`, which clears everywhere. Earned by D-086 on the share card and by the same
shape already fixed on the verdict sheet.

### Confidence, expressed in fill

The same hue, four treatments. This is Law 2 made concrete and it is the most important visual
rule in the product.

| Confidence | Treatment | Earned by |
| --- | --- | --- |
| Certain | 100% solid field, no border, dot meter 4/4 | Four or more sellers, all seen inside the category's freshness window |
| Fairly sure | 100% solid field, 1px inner hairline at 20% white, dot meter 3/4 | Two or three sellers |
| Thin | 12% tint of the hue, 2px solid border in the hue, dot meter 2/4 | One seller, or points ageing out |
| Refuses | `unknown` at 12%, 2px dashed border, no dots | Below the minimum, wrong category, or identity too weak |

A hollow verdict and a solid verdict must never be mistaken for one another at arm's length. If a
mockup makes them look alike, the mockup is wrong.

---

## 2. Type

Three faces, each with one job. The reading serif currently used for body copy is removed from
the product surface entirely, because it turns measurements into an essay and it is the single
biggest reason the current app reads as a document rather than an app.

| Face | Job |
| --- | --- |
| **Bricolage Grotesque** | The price numeral and the verdict word. Nothing else. Kept from the current app and finally given the hero job it deserves. |
| **Instrument Sans** | Every piece of UI. Labels, buttons, body, rows, sheets. |
| **IBM Plex Mono** | Provenance only. Seller names, dates, source counts, timestamps. Mono signals "this is a recorded measurement" and it earns its place because honesty about sources is the product. |

Removed: Newsreader, and any serif, from the product surface.

### Scale

| Role | Size | Weight | Tracking | Notes |
| --- | --- | --- | --- | --- |
| Price hero | 72px (64px under 380px wide) | 800 | -0.03em | Tabular figures, always |
| Verdict word | 34px | 800 | -0.02em | Sentence case, never shouting caps |
| Secondary price | 20px | 600 | -0.01em | Tabular figures |
| Body | 16px / 1.45 | 400 | 0 | Two lines maximum on the verdict surface |
| Row title | 16px | 600 | 0 | |
| Label | 11px | 600 | 0.12em | Mono, uppercase, provenance only |

Any currency figure anywhere in the product uses tabular figures. Prices that shift width as they
change look like an animation bug and undermine the one thing being measured.

---

## 3. Shin's face

The face is the verdict. It is not a decoration in the corner of a card, which is what it is
today at 90px with dot eyes.

### Construction

Drawn as SVG, on a circle, and it must carry an `xmlns` so it survives being rasterised to a
share card. Stroke weight scales with the circle, it is not fixed.

**96px is the floor for a face that carries a verdict or a refusal**, not for every face on the
verdict surface. The earlier wording said "minimum on-screen diameter on the verdict surface is
96px", and that is wrong for the faces that carry no verdict: `thinking` and `asking` sit at 76px
on that same surface and an acknowledgement replacing a verdict in place sits at 62px. The six
size tokens are `AVATAR.md` section 3, which supersedes this paragraph's numbers.
**Nothing anywhere goes below 28px.**

### Expression states

Thirteen, and every personality below must have all thirteen. Names only here. **The triggers,
the thresholds and the per-screen behaviour are `docs/design/AVATAR.md` section 2**, which is the
source for all three.

`idle` · `thinking` · `asking` · `good` · `delighted` · `fair` · `walk` · `angry` · `unknown` ·
`pleased` · `nudging` · `asleep` · `proud`

What stays in this file is the mapping from the four verdict tiers to their faces, because that is
a colour-system fact: `good` `fair` `walk` `unknown` are the four tier faces, and `unknown` is the
refusal face, which is a face and not a shrug icon. `delighted` and `angry` are the intense forms
of `good` and `walk`, not extra tiers; the field colour under them is the tier's own.

`greeting` was considered and struck, with the reason in `AVATAR.md` section 2.

### The confidence gate on the intense forms

`delighted` and `angry` require the **Certain** or **Fairly sure** treatment from section 1 and
degrade to the plain `good` or `walk` face otherwise. A thin verdict never gets an intense face
and never gets a loud line. An intense face on a hollow field is a wrong verdict delivered
loudly, which is the outcome the priority order exists to prevent. The numeric thresholds that
earn each intense form are `AVATAR.md` section 2.

### The target rule

**A negative face may not be drawn unless the asking price and the seller's name are both visible
on the same screen.** Hard rule 4 points the aggression at the price, the store or the brand, and
if the target is not legible on the screen the aggression has nowhere to land but the person
holding the phone.

### The string table

Strings live in one table keyed by state and personality. No string is written inline in a screen.
**Thirteen states times three personalities is thirty nine cells, and a state with a missing cell
does not ship.**

### The artist's deliverable

Not this section's list. It is `AVATAR.md` section 6: thirty nine face files, thirteen animations,
one 88 by 88 viewBox, stroke colour settable at render time, `xmlns` on every file.

### Personality, chosen by the user

The user picks Shin's attitude during setup and can change it later. This is a product decision
made 2026-09-03: it turns the riskiest tone call into the user's call, and it is a share hook,
because which Shin someone has is worth screenshotting. The cost, recorded honestly, is that
every user-facing string exists three times and the face system carries three variants of thirteen
expressions.

| Personality | Voice | Face treatment |
| --- | --- | --- |
| **Deadpan** | States the number and stops. "Two dollars. It's $1.47." | Minimal. Small eye movement, near-flat mouth. Least motion of the three. |
| **Warm** | On your side. "Ooh, that's steep. I'd wait." | Rounder, softer curves, more eye. Blinks more. |
| **Blunt** | Short and rude. "They're robbing you." | Sharper angles, heavier brow, bigger mouth deltas. |

The default at first run is **Deadpan**, because a price tool that is wrong while being cute is
worse than one that is wrong while being flat.

The string table rule is above, under "The string table". The lines themselves, all three
personalities for every state and every trigger, are `AVATAR.md` section 3.

---

## 4. Architecture

The first app was thirteen stages as thirteen pages, a walkthrough rather than a product. The
running app is the re-cut below; `USAGE.md` sets its sequence and `AVATAR.md` sets its face.

**The camera is the default route.** Full-bleed live viewfinder. Chrome lives in two bands and
the centre stays clear: the top band is a **torch toggle** top left at 48px and a small wordmark
centred; the bottom band is Shin's caption under the frame (face at 36px, one pill bubble,
centred, 14px above the bar) and the bottom bar. Nothing else sits on the picture. The reticle
centres in the free space between the two bands, and at idle the feed outside the frame is a
quarter darker so the eye goes to the brackets. Changed 2026-09-10 from a top-left dock under the
wordmark, which competed with it. The help affordance
that used to sit top right is gone: the tips appear inside the refusal panel, at the only moment
they mean anything (OLMA audit rows 19, 31 and 87, and rows 35 and 90 for the torch, which is a
take because grocery aisles have bottom shelves and glass doors and a dark photo is one of the
fixable causes of a refusal).

**The hint pill is conditional, not permanent.** It carries the `idle` face and the aiming line
while nothing is detected, and it vanishes the instant the reticle catches (OLMA audit row 34,
adapt). After four seconds live with nothing detected it escalates once and offers the screenshot
route (`USAGE.md` B1 0:13.9). That escalation is one of only two unprompted appearances the whole
product is allowed; the budget is `AVATAR.md` section 4.

**The bottom bar** carries three things. Shutter dead centre at 76px, because centre bottom is
reachable from either grip. Saved to its left, You to its right, each a 56px column of a 22px
glyph over an 11px label, with a 56 x 30 pill behind the glyph on press. The labels are there
because an unlabelled glyph is a guess, and a guess is a tap wasted. The bar sits on a gradient
band, transparent to 72% black, so the controls always have something under them. The shutter is
never a peer of the other two in size or weight; it is the product.

**The pages carry the same bar.** Saved, You, Past scans, Recently removed, Licences and the
market picker end in a bar of the same three targets, built once in `js/lib/pagebar.js`: 84px
plus the safe area, on `ground` with a hairline above it, glyph 22px over an 11px label, the
current page's item in `ink` with a 56 x 30 pill behind its glyph, the shutter at 56px with a 3px
`shin` ring. Before 2026-09-10 a page ended in a lone 58px shutter with nothing under it, which
read as a control that had lost its bar; and the only way from Saved to You was through the
camera. Sub-pages (Past scans, Recently removed, Licences, market) get a 44px back chevron at the
top left; Saved and You are top level and get none. Lists behind the camera are inset grouped
cards: `surface` at 16px radius, rows 52px with a 1px `hairline` divider inset 16px, a 16px
chevron on rows that go somewhere, a tick on the chosen row of a picker. Section headings are
sentence case in the UI face; mono uppercase stays reserved for a recorded measurement.

**Scan, identify and verdict are one surface.** The frame freezes in place, a reticle contracts
onto what was found, and a sheet rises from the bottom over the frozen frame. The user never
leaves the picture they took. Going back is a downward drag, not a back button.

**What freezes the frame is the detection, not the press.** This file used to say "on shutter, the
frame freezes". `USAGE.md` A1 0:12.5 has the barcode caught and the frame frozen with no shutter
press at all, and it wins on sequence. The shutter stays on the bottom bar and keeps its three
other jobs: it is the Allow camera control before the permission lands, it is where the Last
screenshot control is promoted to when the camera is denied, and it is the manual capture for the
cases detection does not cover.

**Five things now live on that one surface, not four.** Identify, the asking price pad, the work,
the verdict, and the correction.

- **The asking price is typed on that surface**, on a numeric pad that rises to half height over
  the frozen frame, before the comparison runs. v1 has no OCR, so the number the verdict is
  computed against is a number a person read off a tag (`USAGE.md` section 0; OLMA audit rows 38,
  40, 41, 42, 43, take). The pad carries a percent-off and a multi-buy affordance that show their
  own arithmetic, because the verdict is computed against the number displayed and never against
  an unshown intermediate.
- **The work is a screen, not a spinner.** While Shin runs, the `thinking` face carries the named
  step. The item the user picked is echoed beside it. A downward drag aborts the run, and the repair action is
  live during the wait rather than only after the failure (OLMA audit rows 47, 48, 49, 50, all
  take). When the run ends in a refusal, **the step that came up empty is named in the refusal
  panel**, in provenance mono. This file had motion for the verdict arriving and nothing at all for
  the ten seconds before it; this is the fix. The engine budget is 0.8s at p50 with a hard cap of
  2.5s, and **past six seconds the sheet converts to a refusal rather than continuing to spin**,
  because a product about instant checking that spins is lying about its own promise
  (`USAGE.md` drop-off 8).
- **The correction is a detent of the same sheet, never a separate route.** Saving a correction
  must not repaint the screen or lose the frozen frame. Losing the picture at the moment of
  disappointment is what ends the session (`USAGE.md` C3 item 3, which wins on sequence).

**The verdict sheet has three detents.** This table is `USAGE.md` section 7, which wins on
sequence and supersedes the earlier version of it that put every action in the full detent.

| Detent | Shows | Actions | v1 |
| --- | --- | --- | --- |
| Peek (46% height) | Face at 96px, verdict word, price hero, the asking seller, "usually", confidence dots and label, the item name, and the stand-in note when the asking price is one. Readable at arm's length. | **Watch it**, one wide primary. Labelled **Save it** on `good` and **Watch it** on `fair` and `walk` | Yes |
| Half (72%) | Adds the spread rail, the confidence sentence, and the provenance list in mono | **Correct it**, then **Share** | Yes |
| Full | Adds what Shin used in full, dates, promo limits, and the one tap correctness signal | **Find it cheaper nearby**, **Show me a dupe** | No, both out of v1 |

**The primary action is at peek.** Save is the decided primary act and the only entry to the
return loop, so putting a gesture between the user and it costs saves for nothing, and the peek is
where their eyes already are. Correct it ranks above Share because a wrong verdict is worse than
no verdict, it is the only action that exists on every outcome including a refusal, and it is the
crowd price layer's only intake.

**There is no refusal.** Retired 2026-09-30 (RULINGS.md "V1 verdict screen mechanics"): every scan
with a scan left ends in the price distribution chart; only running out of scans stops it.

**A session ends on the viewfinder, never on a confirmation screen**, because the last thing on
screen should be the thing that starts the next scan. After a refusal the viewfinder hint names
the category the engine currently answers best, read from the same measured catalogue the You
screen uses, so the second scan is likelier to work than the first (`USAGE.md` A3, C1 and C3).

**With no asking price there is no refusal and no verdict: there is the going rate.** A neutral
card, the range as the hero, the seller count in mono, one action. The couch is the majority
install case and Shin is not short of data there, it is short of one number (`USAGE.md` section 2).

**The market is named on the verdict.** The comparison label carries the market it was measured
against, and the market is a row in You, pre-filled, one tap to change. "Above what it goes for"
has no referent for a person in a Canadian aisle unless the market is named, and an unscoped range
is a confidently wrong verdict waiting to happen (OLMA audit rows 9, 11, 58, 78, 80, take; adopted
in `AVATAR.md` section 8). The face never appears beside the market line: the market is a fact
about the referent, and a face on the referent invites the referent to be read as an opinion.

Everything else, meaning watchlist, past scans, recently removed, settings, paywall, onboarding
and the market picker, stays a page and is reached from the bottom bar. **There are no
notifications in v1 and no notification permission request**, because there is nothing honest to
send; the in-app watchlist badge is the whole notification system until a re-queryable source
ships (`USAGE.md` section 5).

---

## 5. Components

Twenty six. The first fifteen are unchanged. Eleven were added by the forty-screen list in
section 7 and each is traced to the row or the script that produced it. Each is built once and
reused; none is styled inside a screen.

1. **Viewfinder** with corner-bracket reticle. Reticle contracts on detection.
2. **Shutter** 76px, ring in `shin`, presses to 0.92 in 90ms with one outward ring pulse.
3. **Face** per section 3.
4. **Verdict field** which is the coloured surface, in the four confidence treatments.
5. **Price hero** with tabular figures and the asking price under it.
6. **Confidence dots**, four, filling left to right.
7. **Spread rail**, the lowest to highest prices found, with the asking price marked. Never an
   average, because an average of prices nobody paid is a fabricated number.
8. **Provenance list**, mono, one row per source with seller and date.
9. **Refusal panel**, grey and dashed, carrying exactly one action.
10. **Correction detent**, how the user tells Shin the real price. A detent of the verdict sheet,
    not a sheet of its own and not a route, so the frozen frame is never lost (`USAGE.md` C3
    item 3, which supersedes the earlier "correction sheet" here).
11. **Watch row**, the item, its last price, and the delta.
12. **Drop card**, a price fell.
13. **Share card**, a fixed 4:5 export, brand pink present, face large, one price.
14. **Attitude picker**, three Shins side by side, used at setup and in You.
15. **Bottom bar** as described.

Added by the forty-screen list:

16. **Hint pill**, conditional, carrying the `idle` or `asking` face at 28px and one line. OLMA
    audit row 34, adapt, plus `USAGE.md` B1.
17. **Torch toggle**, 44px, top left of the viewfinder, with a visible lit state. OLMA rows 35 and
    90, take.
18. **Asking price pad**, a large numeric keypad with a clear key, a percent-off key and a
    multi-buy key, each showing its own arithmetic. OLMA rows 38, 41, 42, 43, take and adapt,
    plus `USAGE.md` A1 0:13.4 and drop-off 5.
19. **Working panel**, the `thinking` face over a named step, with the
    picked item echoed beside it and a drag that aborts. OLMA rows 47, 48, 49, 50, take.
20. **Identity chip**, under the reticle, carrying the resolved name and tappable as the
    wrong-item repair. `USAGE.md` A1 0:12.9, OLMA row 48.
21. **Going-rate card**, neutral, the range as the hero, the seller count in mono, one action. Not
    a verdict field and not the refusal panel. `USAGE.md` section 2, OLMA row 44, take.
22. **Feedback row**, one thumb up, one thumb down, with an acknowledgement carrying Undo for four
    seconds. OLMA rows 64 and 65, take. It is rewarded with nothing, deliberately
    (`docs/design/GAMIFICATION.md` M12).
23. **Past scans row**, rendered from the same verdict object as the sheet, in the confidence
    treatment that verdict had. OLMA rows 69 and 70, adapt.
24. **Recently removed section**, with a stated retention window whenever there is a row for it to
    be about. On an empty list the window is not stated and the empty state is the only thing on
    screen, because the header and the empty line were saying the same thing twice with a face
    each. OLMA row 75, take.
25. **Market row**, pre-filled, one tap to change, with the basis line under it. OLMA rows 9, 11,
    78, 80, take.
26. **Type it instead**, a text field over a still-visible camera, with the line naming brand and
    model. OLMA rows 17, 88, 89, take.

---

## 6. Motion

Motion exists to make the judgment feel like it landed. It never decorates.

| Moment | Motion |
| --- | --- |
| Shutter press | Scale to 0.92 over 90ms, ring pulses outward once |
| Frame freeze | Live feed stills, 6% desaturation over 120ms |
| Reticle | Contracts from 216px onto the found object at 150px over 200ms, cubic-bezier(.2,.8,.2,1). The brackets keep their weight; only the frame changes |
| Verdict field rises | 420ms, cubic-bezier(.32,.72,0,1), from the bottom edge. A sheet is a big object moving a long way; the shorter shared curve landed it with a snap |
| Price numeral | Enters at 0.94 scale and 0 opacity, 180ms, starting 60ms after the field |
| Face | Expression morphs over 220ms, eyes first, mouth 40ms behind. The full set is `AVATAR.md` section 5 |
| Confidence dots | Fill left to right, 80ms each, after the numeral |
| Refusal | Same rise but 340ms and grey, and the face gives one slow blink. No shake, no buzz, no red. |
| Sheet detents | Spring, 320ms, drag-tracking with rubber-banding at the ends |

**Never animate a price counting up.** A number moving through values it never had is a
fabricated measurement, and it would be the prettiest way for this product to lie.

**The face never re-morphs on a drag or a scroll.** Once a verdict has landed the expression is
fixed until a new scan. OLMA rewrote its verdict sentence under the reader at t=50 after it had
been readable at t=49, same label and same confidence (`notes/olma/audit.md` row 53 and §4 item
5), and for a product whose only value is being trusted about a number that is the cheapest way to
lose it. A face that changes while the user reads is the same failure in a different medium.

**Row faces never animate.** At 28px in a scrolling list, motion is noise.

Under `prefers-reduced-motion`, every entry above becomes an opacity fade of the same duration and
nothing moves in space.

### The thirteen named animations

The table above covers the moments. The animations themselves, with durations, triggers, loop
behaviour and reduced-motion fallbacks, are **`AVATAR.md` section 5**, which is the source. The
names, so a screen can reference one without opening that file:

`face-morph` · `idle-breath` · `blink` · `slow-blink` · `think-dots` · `step-swap` ·
`verdict-land` · `intense-hold` · `pleased-nod` · `sleep-breath` · `wake` · `nudge-arrive` ·
`proud-hold`

`intense-hold` is the only motion the intense forms get, and it is a hold and a settle, never a
shake. The refusal's entire motion vocabulary is `slow-blink`.

---

## 7. Screens to draw

**Forty.** This is the same list, in the same order and with the same numbers, as `AVATAR.md`
section 1. The two files are one list and a number that appears in one and not the other is a bug.
The fifteen this file used to carry are all still here, renumbered; none was dropped. Two of them
were split in two, so the fifteen occupy seventeen slots, and the twenty three additions are
traced, one line each, to the OLMA audit row or the `USAGE.md` script that produced them.

**Group A. Cold start and setup**

| # | Screen or state | Traced to |
|---|---|---|
| 1 | First run, cold open, feed not yet live | Added. `USAGE.md` A1 0:00, which budgets 1.2s from icon tap to viewfinder with no splash |
| 2 | Attitude picker, pick your Shin | Was §7.13. Also `USAGE.md` A1 0:01.2 |
| 3 | Permission primer, before the system prompt | Was §7.15. Also `USAGE.md` drop-off 1 |
| 4 | System camera prompt | Added. `USAGE.md` A1 0:06.4, OLMA audit row 30 |
| 5 | Camera denied, screenshot fallback | Added. `USAGE.md` drop-off 1, which forbids a wall and a second ask |

**Group B. The camera surface**

| # | Screen or state | Traced to |
|---|---|---|
| 6 | Camera, idle, nothing detected, watchlist empty | Was §7.1 |
| 7 | Camera, hint escalated after four seconds of nothing | Added. `USAGE.md` B1 0:13.9, OLMA audit row 34 |
| 8 | Camera, torch on | Added. OLMA audit rows 35 and 90, take |
| 9 | Camera, identifying, reticle contracting, frame freezing | Was §7.2 |
| 10 | Identity chip resolved, the wrong-item repair | Added. `USAGE.md` A1 0:12.9, OLMA audit row 48 |
| 11 | Asking price pad | Added. `USAGE.md` A1 0:13.4, OLMA audit rows 38, 41, 43 |
| 12 | Working, the named steps | Added. OLMA audit row 47 and §5 item 1 |

**Group C. The verdict surface**

| # | Screen or state | Traced to |
|---|---|---|
| 13 | Verdict, good, certain or fairly sure | Was §7.3 |
| 14 | Verdict, good, at the steal threshold | Added. Brief §0.5, OLMA audit row 52 |
| 15 | Verdict, fair | Was half of §7.5, split from the thin state |
| 16 | Verdict, walk away, certain or fairly sure | Was §7.4, on the real Kraft Dinner data |
| 17 | Verdict, walk away, at the rip-off threshold | Added. Brief §0.5, OLMA audit row 52 |
| 18 | Verdict, thin evidence, hollow treatment, any tier | Was the other half of §7.5. Also `USAGE.md` drop-off 7 |
| 19 | Going-rate card, no asking price | Added. `USAGE.md` section 2, OLMA audit row 44 |
| 20 | Verdict sheet, half detent | Added. `USAGE.md` section 7, which puts Correct it and Share here |
| 21 | Verdict sheet, full detent | Was §7.8, spread rail and provenance |
| 22 | Correction detent | Was §7.9. Now a detent, not a route: `USAGE.md` C3 item 3 |
| 23 | Watch or save acknowledged | Added. `USAGE.md` A3 0:12.5 |
| 24 | Thumbs feedback row and its acknowledgement | Added. OLMA audit rows 64 and 65, take |

**Group D. Refusals**

| # | Screen or state | Traced to |
|---|---|---|
| 25 | Refusal, no identity | Was §7.6. Also `USAGE.md` C2 |
| 26 | Refusal, unsure which one | Added. `USAGE.md` drop-off 3 and C2 |
| 27 | Refusal, category declined | Was §7.7, produce |
| 28 | Refusal, too little evidence | Added. `USAGE.md` C1 and C2, the five-of-seven case |
| 29 | Refusal acknowledged, Keep it landed | Added. `USAGE.md` C1 0:12.9 |
| 30 | Type it instead, the text route out of a refusal | Added. OLMA audit rows 17, 88, 89, take |

**Group E. Pages**

| # | Screen or state | Traced to |
|---|---|---|
| 31 | Watchlist, empty | Was half of §7.10. Also `notes/duolingo-owl.md` mapping row 19 |
| 32 | Watchlist, items, no movement | Was the other half of §7.10 |
| 33 | Watchlist, a price dropped | Was §7.11 |
| 34 | Recently removed | Added. OLMA audit row 75, take |
| 35 | Past scans | Added. OLMA audit rows 69 and 70, adapt |
| 36 | Share card | Was §7.12 |
| 37 | Paywall | Was §7.14. Also OLMA audit rows 20, 21, 76, which move it off auto-presentation |
| 38 | Meter zero state, dark switch, off in v1 | Added. `USAGE.md` section 6 |
| 39 | You | Added. OLMA audit rows 78 to 86 |
| 40 | Market picker | Added. OLMA audit rows 9, 11, 78, 80, take |

**Not on the list, and why.** A home screen widget, which needs a re-queryable price source Shin
has never queried; a campaign app icon, which is a marketing artefact rather than a screen; and a
greeting screen, because `greeting` was struck as a state. Reasons in `AVATAR.md` section 1.

Screens 18, 25, 26, 27 and 28 are the ones that prove Law 2 and Law 3. A mockup set without them
is advertising, not design. Thirteen of the forty are drawn in `docs/design/mockups.html`, across
twelve mockups, because one of them draws the watchlist and the price drop together. The other
twenty seven are listed there as to-draw, and four of the drawn thirteen are redraws because the
sequence changed under them.
