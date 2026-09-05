# Shin interface review, 2026-09-04

A flaw list, ranked. Judged against `DESIGN.md`, which declares itself the authority ("If a
screen and this file disagree, this file wins and the screen gets fixed"), and against the
mechanical floor: contrast computed rather than eyeballed, overlap measured in the live DOM,
hit-testing done with `elementFromPoint`.

Read on a running instance at `localhost:4173`, dark and light, plus source.

---

## The verdict first

**The camera surface is genuinely designed. Everything behind it is running on defaults.**

That is the single finding this list keeps re-deriving. The camera has authored focus rings on
all seven of its controls, transitions on its pressables, a state machine that hides the bottom
bar when the verdict lands, a reticle, a sweep that turns the shutter into the progress
indicator. It is specific work that no template would produce.

The shared shell behind it (`shell.css`) has zero focus rules, zero transitions, zero hover
gating. The four controls it defines are used on nine screens. So a user who taps into Saved or
You crosses a line where the craft stops, and the app stops feeling like one thing.

Design specificity is high on one surface and near zero on the rest. The fix is not a redesign;
it is applying the camera's own standard outward.

---

## P0, wrong in a way that costs a user something

### 1. The verdict text fails contrast, on the app's most important surface

`DESIGN.md` section 1 asserts of the text-on-tier pairings: "This is not a preference, it is the
only pairing that clears contrast on each field." Computed, two of the four do not clear it.

| Pairing | Ratio | Needs |
| --- | --- | --- |
| `#FFFFFF` on `walk` `#F0431F` | **3.80** | 4.5 |
| `#FFFFFF` on `walk-bright` `#FF6A45` | **2.84** | 4.5 |
| `#F7F5F2` on `unknown` `#78848F` | **3.51** | 4.5 |
| `#04140C` on `good` | 7.21 | pass |
| `#1A1204` on `fair` | 8.37 | pass |

It is worse than the table, because `camera.css` puts the verdict body copy at `opacity: .88`.
That drops white on `walk-bright` to **2.51**, and `walk-bright` is the variant specified for use
over a live camera feed in a well lit store, which is the hardest reading condition the product
has.

Walk away and refusal are five of the seven outcomes. This is the text the product exists to
deliver.

**Fix.** Darken the two failing fields rather than lightening the text, so the hue survives. A
`walk` around `#C9330F` carries white at 4.5. `unknown` around `#5C6773` carries `#F7F5F2` at
4.5. Then either drop the `.88` opacity on verdict copy or bake the reduction into a token that
was checked at its real value.

### 2. In light theme the verdict colours are still the dark ones

`tokens.css` re-themes `--good-bright`, `--fair-bright`, `--walk-bright` and `--unknown-bright`
for light, and never re-themes the bases `--good`, `--fair`, `--walk`, `--unknown`, or `--brand`.
The bases are what `[data-tier]` sets `--tier` to, so every piece of tier chrome in light theme
is painted with a colour picked for a near-black ground.

| Tier base on white | Ratio | Needs 3.0 |
| --- | --- | --- |
| `good` `#12B76A` | **2.62** | fail |
| `fair` `#E8A020` | **2.22** | fail |
| `walk` `#F0431F` | 3.80 | pass |
| `unknown` `#78848F` | 3.82 | pass |

Law 2 is "hue is the verdict, saturation is the confidence". In light theme the hue is not
readable as a signal for the two most common non-refusal outcomes.

Three places in `camera.css` make it worse by hardcoding the dark ground inside the confidence
tints, so a thin or refused verdict mixes toward black on a white page:

- line 969, `color-mix(in srgb, var(--tier) 14%, #0B0C0E)`
- line 978, `color-mix(in srgb, var(--unknown) 12%, #0B0C0E)`
- line 308, `border: 2px solid #0B0C0E`

**Fix.** Give the four bases and `--brand` light values in the light block, and replace the three
hardcoded hexes with `var(--ground)`.

### 3. The text input removes its focus ring and puts nothing back

`camera.css:912`, `.textroute-form input:focus { outline: none; }`. There is no
`:focus-visible` replacement anywhere in the file. It is the only `outline: none` in the codebase
and the only control in the camera without an authored ring, while its seven neighbours all have
one.

**Fix.** `.textroute-form input:focus-visible { outline: 2px solid var(--brand); outline-offset:
2px; }`, matching `.cand` directly below it.

### 4. Changing screens tells assistive tech nothing

`router.js` `paint()` clears `rootEl.innerHTML`, writes the new screen, sets `document.title`,
and stops. Focus is never moved, so it stays on `body` or is dropped to the top of the document.
There is no live region announcing the change. A keyboard user tabs from the start of the page
every time; a screen reader user gets silence.

`rootEl.scrollTop = 0` on the line below is also a no-op, because the scroll container is `.page`
and not `rootEl`. Returning to Saved from a scan drops you wherever the previous scroll left the
new content.

**Fix.** After paint, focus the new screen's `h1` with `tabindex="-1"`, and set
`document.querySelector('.page').scrollTop = 0`. Keep a scroll position per screen and restore it
on a back navigation.

### 5. The error screen shows the exception and offers no way out

`router.js:77` renders `<h2>That screen did not open.</h2>` followed by the raw `err.message`
interpolated into innerHTML. No retry, no link home. The heading is honest and well written; the
screen is a dead end, and the raw message is not for a user.

**Fix.** Keep the heading, move the exception to `console.error`, add a control back to the
camera. Also escape it if it stays: an error string reaching innerHTML unescaped is a real path,
not a theoretical one.

---

## P1, systematically wrong

### 6. The label reserved for provenance is doing the work of headings

`DESIGN.md` section 2 defines the Label role as "11px, 600, 0.12em, Mono, uppercase, **provenance
only**", and says Mono "earns its place because honesty about sources is the product".

`.kicker` and `.block-h` in `shell.css` are 10px, 600, .16em, mono, uppercase, `--ink-faint`, and
they are used 17 times as section headings across eight screens, ten of them on You alone. So the
one typographic signal that was supposed to mean "this is a recorded measurement" now mostly
means "this is a heading", and the signal is spent.

They also fail contrast as text: `--ink-faint` is **4.31** on the dark ground and **3.92** on the
dark surface, both under 4.5, at the smallest size in the app.

This is also the one pattern worth removing on visual grounds alone. Ten stacked eyebrow labels
is what a settings page looks like when nobody decided what the sections were.

**Fix.** Give headings a real heading style in Instrument Sans, sentence case, at a readable size
and `--ink-muted` or `--ink`. Return mono uppercase to seller names, dates and source counts. On
You, most of those ten sections do not need a label at all; spacing and a hairline already group
them.

### 7. The shared controls have no motion and no focus ring

`shell.css` defines `.cta`, `.linky`, `.rowbtn` and `.mini-shutter` and declares no `transition`
on any of them, and no `:focus` or `:focus-visible` rule anywhere in the file. Meanwhile
`.cta:active` sets `translateY(1px)` and `.mini-shutter:active` sets `scale(.94)`, so the press
feedback teleports instead of responding, and `.linky:hover` snaps its colour.

Focus falls back to Chrome's default ring. Verified by keyboard: it is visible, so this is a
consistency defect and not an access failure. But the camera draws a 2px white ring at 3px offset
and the rest of the app draws whatever the browser does, which differs per browser.

**Fix.** `transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1)` on the pressables, colour
transitions on `.linky`, and one shared `:focus-visible` rule in `shell.css` matching the
camera's.

### 8. Nothing is gated behind `@media (hover: hover)`

Seven `:hover` rules across the CSS, zero inside a hover query. On the phone this product is
built for, a hover state applied on tap latches until something else is touched, so a tapped row
stays lit as if still selected.

**Fix.** Wrap every `:hover` block in `@media (hover: hover) { ... }`.

### 9. Every screen replays a full entrance on every arrival

`shell.css` runs `.page > * { animation: rise ... }` on every direct child of every screen, on
every navigation. Going back to Saved replays it. Toggling a setting on You replays it if the
screen repaints.

Two problems. It is the fade-and-slide-up-everything pattern, which reads as generic. And it is
motion on a path used many times a day, which is where animation is most expensive and least
wanted. The camera is the app; the trips out to Saved and back are frequent, not ceremonial.

**Fix.** Drop the blanket rule. If an entrance is wanted, animate one element that matters, once,
on first mount only, and let repeat navigations be instant.

### 10. The footer gradient fades content you are meant to read

`.page-foot` is sticky with `background: linear-gradient(180deg, transparent, var(--ground) 40%)`.
The comment explains the intent and the intent is right: a list scrolling visibly behind a
floating button reads as a fault.

Measured on You at mid-scroll, the gradient covers 80% of a `.fineprint` paragraph and 47% of a
`.rowbtn`. It is not a tap blocker (hit-tested at full scroll bottom, all three sample points
reach the button). It is a legibility problem: text under it is half-dissolved rather than
clearly cut off, which reads as a rendering fault, the exact thing the gradient was added to
prevent. The same veil appears on Saved, so it is systemic and not a one-screen accident.

**Fix.** Make the fade shorter and steeper so content is either clearly visible or clearly gone,
and add bottom padding to `.page` equal to the footer height so the last item can clear it.

---

## P2, worth fixing while nearby

### 11. The light palette in code is not the light palette in the spec

Every light value drifted, and the drift is directional: the spec's light theme is warm, the
code's is cool blue-grey.

| Token | `DESIGN.md` | `tokens.css` |
| --- | --- | --- |
| `ground` | `#FBFAF7` | `#F3F1EC` |
| `raised` | `#F3F1EC` | `#E9E5DE` |
| `ink` | `#16130F` | `#14161A` |
| `ink-muted` | `#6E6660` | `#5E6570` |
| `ink-faint` | `#98908A` | `#8B929C` |
| `hairline` | `#E4DFD8` | `#E2DDD5` |

The ground in code is literally the spec's `raised` value, which is why light theme reads as
muddy grey rather than paper. Confirmed on screen.

Worth saying: closing the drift will not fix contrast. The spec's own light `ink-faint` computes
to **3.01** on the spec's own light ground, still under 4.5. Both need darkening.

### 12. Small things that are just wrong

- `--brand-ink` is referenced in the CSS and never defined. It computes to empty.
- The browser tab reads **"Shin · Shin"**. `router.js` appends " · Shin" to a screen title that is
  already "Shin" on the camera.
- A development placeholder is rendering: `.face-label` shows the raw state name "asking" on the
  camera screen.
- The camera screen has no heading element at all. Every other screen has an `h1`.
- The verdict word is 31px in `camera.css`; `DESIGN.md` section 2 specifies 34px.
- Hairline borders are **1.54** on the ground and **1.40** on the surface, under the 3.0 floor for
  a meaningful boundary. If they are decorative that is fine; if they are the only thing marking a
  row, it is not.
- `.cta:disabled` at `opacity: .34` computes to **2.88**. A disabled control still has to be
  readable enough to explain why it is disabled.

### 13. The empty state on Saved says nothing three times and offers no exit

One screen reads "NOTHING SAVED YET" (label), "Saved" (heading), "Nothing here yet." (body). Three
statements of the same fact, and no control to do anything about it.

**Fix.** One line, in Shin's voice, plus a button back to the camera. The mini shutter is already
in the footer, so the fastest fix is to cut the redundancy and let the shutter be the answer.

### 14. Shin's speech is not announced

The verdict sheet does have `aria-live="polite"` (`camera.js:374` and `:506`), which is the right
call and already done. The `shin-say` bubble does not. That bubble is often the only instruction
on screen, and on the camera screen it currently overlaps the reticle and the scan area with no
way to dismiss it.

**Fix.** `role="status"` on the bubble, and a dismissal, or an auto-retire once scanning starts.

---

## What is right, and should not be changed while fixing the above

Worth naming, so a fix pass does not flatten it.

- The refusal is a first-class outcome with its own colour, face and copy, and it is grey and
  never red. That is a real product decision and it is carried through the code.
- Confidence expressed as fill (solid, hairline, tint, dashed) rather than a percentage label.
- The bottom bar sliding away on `data-state="result"`, which keeps the brand pink shutter off
  the verdict surface. `DESIGN.md` calls that collision out as a real problem in the old app, and
  the current code does prevent it.
- The shutter becoming its own progress sweep during `reading`, instead of the bar vanishing with
  nothing in its place.
- The copy. "Shin will not call it", "What I can actually answer", "That screen did not open".
  It has a voice and it does not hedge.
- Icon buttons on the camera all carry proper accessible names ("Torch", "Saved", "Scan what you
  are pointing at", "You").
- Tabular figures are used on all twelve price surfaces.
- The serif really is gone.

---

## Suggested order

1. The two failing verdict pairings, and the light-theme tier bases. These are the product's
   output.
2. The input focus ring, and one shared focus rule in the shell.
3. Focus and scroll on navigation.
4. The label-as-heading pattern on You and the other seven screens.
5. Transitions and hover gating on the shared controls.
6. The blanket entrance animation, and the footer fade.
