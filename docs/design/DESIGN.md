# Shin DESIGN.md

The design system for the Shin app. This file is the source. If a screen and this file disagree,
this file wins and the screen gets fixed. Written 2026-09-03.

Shin is a mascot-led price scanner. You point your phone at a thing and a face tells you whether
the price is fair, or tells you honestly that it does not know.

---

## 0. The three laws

Every rule below traces to one of these. A rule that traces to none of them is decoration and
gets deleted.

**Law 1. The camera is the app.** The default screen is a live viewfinder, not a list. The
shutter is the one control always within a thumb's reach. The verdict appears over the world the
user is standing in, not on a page they navigate to. Scan, identify and verdict are one surface
with three states, never three screens.

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

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `ground` | `#0B0C0E` | `#FBFAF7` | Behind everything that is not camera |
| `surface` | `#16181C` | `#FFFFFF` | Sheets, cards, rows |
| `raised` | `#22262C` | `#F3F1EC` | Inputs, chips, pressed states |
| `scrim` | `rgba(11,12,14,.55)` | `rgba(11,12,14,.35)` | Over the camera feed, with a 20px backdrop blur |
| `hairline` | `#2E333A` | `#E4DFD8` | Dividers, 1px |

### Text

| Token | Dark | Light |
| --- | --- | --- |
| `ink` | `#F7F5F2` | `#16130F` |
| `ink-muted` | `#A5ADB8` | `#6E6660` |
| `ink-faint` | `#6E7783` | `#98908A` |

### Brand

`shin` = `#E5165E`

This is Shin's own colour. It is the wordmark and the shutter ring, and it is the colour a share
card is recognised by in someone else's screenshot. **It is never a verdict.** It does not appear
on the verdict surface at all, which is what keeps it from being mistaken for walk away in a
screenshot. That collision is real in the current app and this rule is the fix.

### Verdict

Four states, not three, because the refusal is one of them. Each has a base for chrome and a
bright for use over a live camera feed in a well lit store.

| State | Base | Bright (over camera) | Text on it | Means |
| --- | --- | --- | --- | --- |
| `good` | `#12B76A` | `#38E08B` | `#04140C` | Cheaper than it usually goes for |
| `fair` | `#E8A020` | `#FFC24D` | `#1A1204` | About the going rate |
| `walk` | `#F0431F` | `#FF6A45` | `#FFFFFF` | Above what it goes for |
| `unknown` | `#78848F` | `#93A0AC` | `#F7F5F2` | Shin will not call it |

`fair` and `good` carry dark text. `walk` and `unknown` carry light text. This is not a
preference, it is the only pairing that clears contrast on each field.

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
share card. Stroke weight scales with the circle, it is not fixed. Minimum on-screen diameter on
the verdict surface is 96px; on rows and chips it is 28px.

### Expression states

Six, and every personality below must have all six.

`good` · `fair` · `walk` · `unknown` (the refusal face, which is a face, not a shrug icon) ·
`thinking` (while identifying) · `pleased` (a save landed, a price dropped)

### Personality, chosen by the user

The user picks Shin's attitude during setup and can change it later. This is a product decision
made 2026-09-03: it turns the riskiest tone call into the user's call, and it is a share hook,
because which Shin someone has is worth screenshotting. The cost, recorded honestly, is that
every user-facing string exists three times and the face system carries three variants of six
expressions.

| Personality | Voice | Face treatment |
| --- | --- | --- |
| **Deadpan** | States the number and stops. "Two dollars. It's $1.47." | Minimal. Small eye movement, near-flat mouth. Least motion of the three. |
| **Warm** | On your side. "Ooh, that's steep. I'd wait." | Rounder, softer curves, more eye. Blinks more. |
| **Blunt** | Short and rude. "They're robbing you." | Sharper angles, heavier brow, bigger mouth deltas. |

The default at first run is **Deadpan**, because a price tool that is wrong while being cute is
worse than one that is wrong while being flat.

Strings live in one table keyed by state and personality. No string is written inline in a screen.

---

## 4. Architecture

The current app is thirteen stages as thirteen pages. That is a walkthrough, not a product. The
re-cut:

**The camera is the default route.** Full-bleed live viewfinder. Chrome floats over it: a small
wordmark top left, a flash and a help affordance top right, and the bottom bar.

**The bottom bar** carries three things. Shutter dead centre at 76px, because centre bottom is
reachable from either grip. Watchlist to its left, You to its right, both 48px. The shutter is
never a peer of the other two in size or weight; it is the product.

**Scan, identify and verdict are one surface.** On shutter, the frame freezes in place, a reticle
contracts onto what was found, and a sheet rises from the bottom over the frozen frame. The user
never leaves the picture they took. Going back is a downward drag, not a back button.

**The verdict sheet has three detents.**

| Detent | Shows |
| --- | --- |
| Peek (46% height) | Face, verdict word, price hero, confidence dots. Readable at arm's length. |
| Half (72%) | Adds the spread rail and the provenance list in mono |
| Full | Adds actions: watch it, correct it, share it, and what Shin used |

Everything else, meaning watchlist, item detail, notifications, settings, paywall, onboarding,
stays a page and is reached from the bottom bar.

---

## 5. Components

Fifteen. Each is built once and reused; none is styled inside a screen.

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
10. **Correction sheet**, how the user tells Shin the real price.
11. **Watch row**, the item, its last price, and the delta.
12. **Drop card**, a price fell.
13. **Share card**, a fixed 4:5 export, brand pink present, face large, one price.
14. **Attitude picker**, three Shins side by side, used at setup and in You.
15. **Bottom bar** as described.

---

## 6. Motion

Motion exists to make the judgment feel like it landed. It never decorates.

| Moment | Motion |
| --- | --- |
| Shutter press | Scale to 0.92 over 90ms, ring pulses outward once |
| Frame freeze | Live feed stills, 6% desaturation over 120ms |
| Reticle | Contracts onto the found object over 200ms, cubic-bezier(.2,.8,.2,1) |
| Verdict field rises | 260ms, cubic-bezier(.2,.8,.2,1), from the bottom edge |
| Price numeral | Enters at 0.94 scale and 0 opacity, 180ms, starting 60ms after the field |
| Face | Expression morphs over 220ms, eyes first, mouth 40ms behind |
| Confidence dots | Fill left to right, 80ms each, after the numeral |
| Refusal | Same rise but 340ms and grey, and the face gives one slow blink. No shake, no buzz, no red. |
| Sheet detents | Spring, 320ms, drag-tracking with rubber-banding at the ends |

**Never animate a price counting up.** A number moving through values it never had is a
fabricated measurement, and it would be the prettiest way for this product to lie.

Under `prefers-reduced-motion`, every entry above becomes an opacity fade of the same duration and
nothing moves in space.

---

## 7. Screens to draw

Thirteen product screens plus two states that only exist to prove the system is honest.

1. Camera, default, watchlist empty
2. Camera, identifying, reticle contracting
3. Verdict, good, certain
4. Verdict, walk away, fairly sure, on the real Kraft Dinner data
5. Verdict, fair, thin evidence, the hollow treatment
6. Refusal, item not known
7. Refusal, category declined, produce
8. Verdict expanded to full, spread rail and provenance
9. Correct the price
10. Watchlist
11. Price drop
12. Share card
13. Setup, pick your Shin
14. Paywall
15. First run, before permission

Screens 5, 6 and 7 are the ones that prove Law 2 and Law 3. A mockup set without them is
advertising, not design.
