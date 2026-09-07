# Retro prototype brief

A 2D, retro handheld-styled phone app. The home screen is the live camera. Tap the shutter and the
frame freezes, digitises, a box locks onto the thing in frame, a name resolves, the catalogue flips
through its cards and lands on a match or on a blank, and a verdict sheet rises with the mascot
wearing the verdict. The mascot is on every screen, guides the user, and reacts to every tap.

Identification and the catalogue are placeholders. The graphics around them are real.

## The three things every change serves

Useful to the user. Easy to use. Visually appealing. A change that serves none is not made.

## Rules that cannot be broken

1. **The aggression points at the price, the store, or the brand. Never at the user.** No line may
   mock, scold, or blame the person holding the phone. "They are robbing you" is fine. "You got
   fooled" is not.
2. **No savings claims.** No "$X a year" copy anywhere. No "you saved" totals.
3. **The good/fair/high call is arithmetic.** `verdict()` in `src/catalogue.js` decides. Nothing
   else decides, and no copy contradicts it.
4. **Nothing counts up, ever.** A price appears whole. Typewriter text is fine. Ticking numbers are
   not.
5. **A refusal never shakes, never buzzes, and never goes red.** It is grey and it gets one slow
   blink. Red means the price is bad.
6. **The brand colour is never a verdict.** It is the shutter ring and the boot wordmark only.
7. **No em dashes in any generated text**, code comments included. Use a comma, a full stop, or
   parentheses.
8. **No app name anywhere in the UI.** The boot screen shows the mascot face and the words
   PRICE CHECK. Nothing else names the product.

## Stack

Vite, vanilla JavaScript ES modules, no framework, no TypeScript. One `index.html`. Canvas for
pixel art, DOM for chrome, CSS for motion, WebAudio for sound. Runs on `localhost` in Chrome and on
a phone over the LAN via `npm run dev` (basic SSL plugin is configured so `getUserMedia` works).

Every module is an ES module with named exports exactly as listed in "Interfaces". Do not export
anything else that another module would need to know about. No module touches `document` at import
time. No module imports `main.js`.

## Visual system

**Palette** (`src/styles/tokens.css`, already written, do not edit). Dark ground, translucent
chrome, hue carries the verdict:

| Token | Value | Use |
|---|---|---|
| `--ground` | `#0B0C0E` | behind everything that is not camera |
| `--surface` | `#16181C` | sheets, cards |
| `--raised` | `#22262C` | chips, pressed states |
| `--hairline` | `#2E333A` | 2px pixel borders |
| `--ink` | `#F7F5F2` | text |
| `--ink-muted` | `#A5ADB8` | secondary text |
| `--ink-faint` | `#6E7783` | labels |
| `--brand` | `#E5165E` | shutter ring, boot wordmark, nothing else |
| `--good` / `--good-bright` | `#12B76A` / `#38E08B` | under the going rate |
| `--fair` / `--fair-bright` | `#E8A020` / `#FFC24D` | at the going rate |
| `--walk` / `--walk-bright` | `#F0431F` / `#FF6A45` | over the going rate |
| `--unknown` / `--unknown-bright` | `#78848F` / `#93A0AC` | the refusal, never red |
| `--idle-hue` | `#7FD1FF` | the mascot when no verdict is on screen |

**Type.** `Press Start 2P` (Google Fonts) for labels, buttons, headings, at 10 to 14px with
`letter-spacing: 0.04em` and `line-height: 1.6`. `VT323` for body and speech, at 20 to 26px. Both
have monospace fallbacks. Never below 10px for the pixel face. Uppercase for labels only.

**Shape.** No rounded corners anywhere. Borders are 2px solid. Panels get a pixel bevel: a 2px
lighter top-left and a 2px darker bottom-right via two inset box-shadows. Buttons press by swapping
the bevel and shifting down 2px.

**Motion.** Everything steps. CSS transitions and animations use `steps(n)` so motion reads as
12 frames a second, never smooth. Durations from the contract: face morph 220ms, verdict land
260ms, refusal land 340ms, pleased nod 260ms, breath 3200ms, blink 140ms, slow blink 520ms,
think dots 900ms per cycle, step swap 160ms. Under `prefers-reduced-motion: reduce` every entry
becomes an opacity fade of the same duration and nothing travels in space.

**The screen treatment.** A CRT overlay sits above everything: 2px scanlines at 8% opacity, a
soft vignette, and a faint 1px horizontal band that drifts down once every 6 seconds. It is
`pointer-events: none`. The camera feed itself is rendered pixelated (see Feed).

**Pixel art.** All sprites are string maps: an array of equal-length strings, one character per
pixel. Characters:

| Char | Meaning |
|---|---|
| `.` | transparent |
| `O` | outline, `--ground` |
| `B` | body, the current hue |
| `H` | highlight, hue lightened 30% |
| `S` | shade, hue darkened 30% |
| `F` | feature, same as outline (brows, mouth, pupils) |
| `W` | white `#F7F5F2` |
| `Y` | yellow `#FFC24D` (sparkles) |
| `C` | cyan `#7FD1FF` (sweat drop, zzz) |
| `R` | red `#FF6A45` (steam, only on `angry`) |

A feature layer is `{ x, y, rows }`: an offset into the 32 by 32 grid plus its own small map.
A full-size map has `x: 0, y: 0`.

Rendering: `drawMap(ctx, map, palette, scale, ox, oy)` fills one `scale` by `scale` rectangle per
pixel. Canvases are `image-rendering: pixelated`. No anti-aliasing anywhere.

## The mascot

A round blob face, 32 by 32 grid, body occupying rows 3 to 28 and columns 3 to 28. The body is
drawn already (`BODY` in `src/mascot/body.js`, do not change it; `sprites.js` re-exports it). Feature zones on the body,
in grid coordinates, column then row:

- **Brows:** rows 7 to 10. Left brow columns 8 to 13, right brow columns 18 to 23.
- **Eyes:** rows 11 to 16. Left eye columns 9 to 13, right eye columns 18 to 22. Default open eye
  is a 3 wide by 4 tall `F` block with one `W` pixel at its top-left as a highlight.
- **Mouth:** rows 19 to 23, columns 10 to 21.
- **Extras** (sparkle, sweat, zzz, steam) may sit outside the body, anywhere on the 32 grid.

Thirteen states, each a set of layers `{ brows, eyes, mouth, extra? }`:

| State | Reads as |
|---|---|
| `idle` | present and ready, neutral brows, open eyes, small flat mouth |
| `thinking` | one brow raised, eyes looking up-right, mouth is the think-dots slot (three frames, dots filling left to right), a sweat drop extra |
| `asking` | brows up, eyes wide, small open mouth, a tiny `?` extra above right |
| `good` | relaxed brows, happy eyes, wide smile |
| `delighted` | brows high, eyes as arcs (closed happy), big open smile with `W` teeth, two `Y` sparkle extras |
| `fair` | flat brows, plain eyes, straight mouth |
| `walk` | brows angled in, eyes narrowed, mouth turned down |
| `angry` | heavy brows angled in hard, eyes narrowed to slits, mouth a flat grit with `W` teeth, `R` steam extra above. The aggression is at the price, so the face is fierce, not cruel |
| `unknown` | brows flat and slightly apart, eyes plain, mouth a small flat line offset to one side, one `C` dot extra as a raindrop. It is a professional declining to guess, not an apology |
| `pleased` | brows relaxed, eyes as gentle arcs, small closed smile |
| `nudging` | one brow up, eyes to the side, small smile |
| `asleep` | no brows, eyes as closed lines, mouth a tiny `o`, a `C` "z z" extra rising top-right |
| `proud` | brows up and out, eyes closed arcs, chin-up smile, one `Y` sparkle |

Plus: `eyesClosed` (blink), `eyesHalf` (slow blink midpoint), `thinkDots[0..2]`.

Three personalities, applied by the renderer, not by the art: `warm` dilates the eyes by one
pixel, `blunt` dilates the brows by one pixel, `deadpan` crops the top row of the eyes (half-lidded).

Sizes in px: `row` 28, `page` 48, `ack` 62, `working` 76, `verdict` 96, `share` 220. Never below
28. The canvas is drawn at `size / 32` scale, rounded down to a whole number where the size allows,
else drawn at 1x and CSS-scaled.

Animations the renderer owns: `face-morph` (eyes change first, mouth 40ms later, 220ms total),
`idle-breath` (3200ms loop, 1px squash on the canvas), `blink` (140ms, random every 4 to 9s while
idle or asking), `slow-blink` (520ms once when `unknown` lands), `think-dots` (900ms loop),
`intense-hold` (delighted and angry: scale to 1.12 for 180ms then settle over 200ms, no shake),
`pleased-nod` (4 degree tilt and back, 260ms), `sleep-breath` (4000ms loop). Row-size faces never
animate.

## The mascot's voice

`LINES[key][personality]`, personalities `deadpan`, `warm`, `blunt`. Every key must have all three.
Keys and seed lines from the project's existing contract are in `src/mascot/lines.js` as comments;
extend, do not remove. Deadpan repeats the number and nothing else. Warm is kind and brief. Blunt is
short and aims at the price or the store, never the person.

## The flow, and who owns what

| Screen | Owner | What happens |
|---|---|---|
| Boot | `main.js` + `retro.css` | 1.2s, CRT power-on flicker, mascot face at 96px in `--idle-hue`, PRICE CHECK wordmark in brand. No line. |
| Attitude picker | `main.js` + `retro.css` | Once per install. Three `fair` faces side by side, each with its personality's verdict line under it. Tap one: it turns `pleased`, nods, the other two fade, advance after 400ms. |
| Primer | `main.js` | Mascot `asking` at 48px in a hint pill: the camera line. One button: ALLOW CAMERA. Then `startCamera`. |
| Camera idle | `feed.js`, `hud`, `main.js` | Live pixelated feed. Reticle brackets at centre. Hint pill with mascot `idle` at 28px and the aim line. Shutter at the bottom centre, brand ring. Film mode toggle (PIXEL / GB / CLEAN) top-right, torch toggle top-left when supported. After 4s with no shutter, the hint escalates once to `asking`. |
| Identifying | `scanfx.js`, `main.js` | Shutter tapped: shutter sound, flash, the frame freezes and digitises (pixel size steps up 1,2,4,8 then back down to the feed's size over 600ms), a sweep line crosses top to bottom once, brackets contract from the reticle onto the object box. Mascot `thinking`, think dots, step label under it swapping through the three steps. |
| Identity chip | `main.js` | The name resolves in a chip under the box. Mascot `thinking` at 28px on the chip. NOT IT? on the chip cycles to the next candidate. |
| Matching | `scanfx.js` | The catalogue flips: a stack of pixel cards riffles (8 cards, 60ms each, category icons) and lands on the match, or on a blank card with a `?` if none. |
| Verdict | `main.js` + `retro.css` | The sheet rises (verdict-land). Mascot at 96px already wearing the verdict state, hue is the verdict. Headline is the mascot's line. Under it: product name and size, TAG price, GOING price, the seller name, and a one-word tier chip. Buttons: WATCH (mascot `pleased`, nods, chip says WATCHING) and SCAN AGAIN. |
| Refusal | `main.js` + `retro.css` | Same sheet, grey, `unknown` face, slow blink, the refusal line, and the repair line naming which step came up empty. Buttons: TYPE IT (opens a text field, placeholder) and SCAN AGAIN. |

Tapping the mascot anywhere: a blink and one of the `poke` lines. Buttons blip on press.

## Interfaces

```js
// src/mascot/sprites.js
export const GRID = 32
export { BODY } from "./body.js"       // full-size map, already written
export const STATES                     // { idle: {brows, eyes, mouth, extra?}, ... 13 keys }
export const EYES_CLOSED, EYES_HALF     // feature layers
export const THINK_DOTS                 // [layer, layer, layer]
export const PALETTE                    // { '.': null, O: 'ground', B: 'body', H: 'hi', S: 'shade', F: 'ground', W: '#F7F5F2', Y: '#FFC24D', C: '#7FD1FF', R: '#FF6A45' }
export function drawMap(ctx, map, colours, scale, ox = 0, oy = 0)   // colours: { ground, body, hi, shade }
export function tint(hex, amount)      // amount -1..1, darken to lighten, returns hex

// src/mascot/mascot.js
export function createMascot({ size = 96, personality = 'warm', hue = '#7FD1FF', state = 'idle' })
// returns { el, setState(state, { intense = false } = {}), setHue(hex), setSize(px),
//           setPersonality(p), blink(), slowBlink(), nod(), poke(), destroy() }
// el is a <canvas class="mascot"> sized by CSS width/height in px.

// src/mascot/lines.js
export const LINES
export function line(key, personality, vars = {})  // substitutes {tag} {going} {name} {seller} {step}; throws if the cell is missing

// src/camera.js
export async function startCamera(videoEl)  // { stream, torch: { supported, set(on) }, stop() } or throws
export function stopCamera(handle)

// src/feed.js
export function createFeed(source, canvasEl, { mode = 'pixel' } = {})
// source: HTMLVideoElement or HTMLCanvasElement. modes: 'pixel' (1/4 res, no quantise),
// 'gb' (1/5 res, four green shades), 'clean' (full res). returns
// { start(), stop(), setMode(m), mode, freeze() -> HTMLCanvasElement (a copy of the current
//   low-res frame), resume() }

// src/demo-shelf.js
export function createDemoShelf()  // { canvas, start(), stop() } a 240x426 pixel shop shelf
// with products that gently bob, for when there is no camera.

// src/scan.js
export function findBox(lowResCanvas)  // { x, y, w, h } as fractions of the frame, the highest-contrast
// region near the centre; never smaller than 30% of the shorter side
export function identify(lowResCanvas, seq)  // { candidates: [{ id, label }], asking, seller, found }
// found is false on every fourth scan. asking is chosen so that, over eight scans, the demo
// produces every state at least once: delighted, good, fair, walk, angry, unknown.

// src/catalogue.js
export const CATALOGUE  // 24 products: { id, name, size, category, going, low, high, sellers }
export const CATEGORIES // ['noodles','cereal','drink','snack','dairy','produce','household','electronics']
export function match(id)         // product or null
export function verdict(asking, product)
// { state: 'good'|'delighted'|'fair'|'walk'|'angry', tier: 'good'|'fair'|'walk', pct, thin }
// pct = (asking - going) / going. Thresholds: good at -5% or under, fair inside 5% either way,
// walk at +5% or over. delighted: pct <= -0.25 and asking <= low and sellers >= 2.
// angry: pct >= 0.40 and asking > high and sellers >= 2. thin = sellers < 2, and thin never
// produces an intense state.
export function formatPrice(n)    // '$1.47'

// src/icons.js
export const ICONS  // { noodles, cereal, drink, snack, dairy, produce, household, electronics, unknown, barcode, tag, eye, bolt, sound, mute } each a 16x16 map using O/W/Y/C/R/B/H/S
export function iconCanvas(name, size, colours)  // returns a <canvas>

// src/audio.js
export const sfx  // { unlock(), blip(), shutter(), tick(), step(), land(tier), match(), nomatch(), nod(), type(), setMuted(b), get muted() }

// src/ui/scanfx.js
export function digitise(feedCanvas, frozenLowRes, { duration = 600 } = {})  // Promise, animates on feedCanvas
export function sweep(overlayEl)  // Promise, one pass, 500ms
export function lockBrackets(overlayEl, box)  // Promise, brackets contract from centre to box, 300ms
export function flash(overlayEl)   // 120ms white flash
export function riffle(containerEl, { cards, landOn })  // Promise, cards are { icon, label } and landOn is an index or -1 for the blank
```

`main.js` is the only module that reads `LINES` and drives screens. It is written by the lead and
imports exactly the names above.

## Done means

`npm run build` passes with no warnings about missing exports. `npm run dev` on a laptop with no
camera shows the demo shelf and the full flow works with the mouse. On a phone over the LAN the
live camera shows. Every one of the six verdict states and the refusal is reachable within eight
shutter taps. Every button blips. The mascot blinks. No console errors.
