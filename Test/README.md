# Retro pixel-art price-check prototype

A 2D, retro handheld-styled phone app where you point a camera at a product, tap the shutter, and the prototype tells you whether the price is good, fair, or high. Identification and the catalogue are placeholders. The graphics around them are real.

The prototype is built with Vite, vanilla JavaScript, and canvas. The live camera feed is pixelated and sits behind every screen. A round blob mascot appears on every screen, reacts to every tap, and wears the verdict when a price is checked.

The prototype runs in Chrome on a laptop over https and on a phone over the LAN. No framework, no TypeScript, no build step for the user to see. Open it, tap the shutter, and the flow works.

## Run it on a laptop

Install and start the dev server:

```
npm install
npm run dev
```

The terminal prints two URLs: one for `localhost:5173` and one for the LAN.

1. Open the `localhost:5173` URL in Chrome.
2. Accept the self-signed certificate warning (click "Advanced" and "Proceed to localhost").
3. Once: pick a personality for the mascot (tap one of the three faces).
4. If your laptop has a camera, allow it. If not, a demo shelf appears on screen with products that bob gently.
5. Tap the shutter (the ring at the bottom). Eight taps in a row show the eight different flows.

## Run it on a phone

On the same wifi as your laptop:

1. Copy the LAN URL from the terminal (not localhost).
2. Open it in Chrome on your phone.
3. Accept the certificate warning and allow the camera.
4. Tap the shutter. The same eight-tap demo works.

No setup on the phone. No install. Just the URL.

## The demo script

Eight taps of the shutter show, in order:

1. **A steal.** The price is well under the going rate. Mascot wears "delighted", hue shifts to bright green, headline says the deal is great.
2. **A high price.** The price is slightly over the going rate. Mascot wears "walk", hue shifts to orange, headline gives a gentle warning.
3. **A fair price.** The price is right at the going rate. Mascot wears "fair", hue shifts to amber, headline confirms it is fair.
4. **A refusal.** The prototype cannot identify the product. Mascot wears "unknown", a grey sheet rises, slow blink, headline says it does not know.
5. **A rip-off.** The price is far over the going rate and the product is well-stocked elsewhere. Mascot wears "angry", hue shifts to bright red, headline says the price is unfair.
6. **A good price.** The price is under the going rate but not by much. Mascot wears "good", hue shifts to green, headline says it is a good buy.
7. **A thin verdict.** The prototype found the product but with very few sellers on file. The verdict lands anyway (one of good, fair, or walk) but with less confidence. One-word tier chip has a lighter tint.
8. **A refusal.** Another product it cannot identify, same flow as tap 4.

## Film modes

Three film modes sit in the top-right corner, tap to switch:

- **PIXEL.** 1/4 resolution, square pixels, retro handheld look.
- **GB.** 1/5 resolution, quantised to four shades of green, Game Boy style.
- **CLEAN.** Full resolution, no pixelation, modern look.

The verdict sheet and the mascot stay the same in every mode. Only the camera feed changes.

## File map

| File | Purpose |
|---|---|
| `src/mascot/sprites.js` | Pixel art palette, the mascot body, feature layers (eyes, brows, mouth), the 13 expression states, canvas drawing function |
| `src/mascot/mascot.js` | Mascot renderer, animations (morph, blink, nod), hue and personality control |
| `src/mascot/lines.js` | Mascot dialogue keyed by state and personality (deadpan, warm, blunt) |
| `src/mascot/body.js` | Mascot body sprite map, read-only, not user-editable |
| `src/camera.js` | Camera stream setup, torch control, clean shutdown |
| `src/feed.js` | Live camera pixelation or quantisation, freeze frame, canvas copy |
| `src/demo-shelf.js` | Fallback shelf animation when camera is not available, 16 bobbing products |
| `src/scan.js` | Object box detection, product identification (demo), state selection for the demo script |
| `src/catalogue.js` | 24 products with pricing tiers, verdict logic (good/delighted/fair/walk/angry), price formatting |
| `src/icons.js` | 16-pixel product category icons and UI symbols |
| `src/audio.js` | Shutter sound, button blip, match sound, state-change tones |
| `src/ui/scanfx.js` | Digitisation animation (pixel stepping), sweep line, bracket lock, card riffle, flash |
| `src/styles/tokens.css` | Colour palette, brand hue, verdict hues, motion timings, typography |
| `src/styles/retro.css` | Boot screen, CRT overlay, scanlines, vignette, drift band, bevel buttons |
| `src/index.html` | Single entry point, canvas and video elements, boot screen markup |
| `src/main.js` | Screen state machine, mascot and feed lifecycle, tap handlers, verdict sheet flow |
| `vite.config.js` | Vite setup with basic SSL for `getUserMedia` on localhost |
