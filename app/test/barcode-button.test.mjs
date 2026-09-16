/**
 * RULE 2, 2026-09-15: nothing reads a barcode unless it was asked to.
 *
 * The owner's ruling, in his words: "the barcode should not be auto read,
 * there should be a scan the barcode button", and "the image and barcode
 * should not be part of the same scan. the barcode can be read and the info
 * fed to gemini which would be a much cheaper api call than sending an image."
 *
 * Two claims, and this file pins both:
 *
 *   1. THE DECODE IS GATED. `Camera.#tick` used to hand every frame to
 *      zxing-wasm at the top of the pipeline with nothing in front of it, so a
 *      code that merely crossed the viewfinder ended the session. It is now
 *      behind `#barcodeWanted`, which only `scanBarcode()` raises, and the eye
 *      lowers it again the moment a read fires. In photo mode zxing is not
 *      merely ignored -- it is never run.
 *
 *   2. THE ONLY DOOR IN IS A BUTTON. `data-act="scan-barcode"` in the bar,
 *      wired to `eye.scanBarcode()` through the one delegated click listener,
 *      reachable only in barcode mode.
 *
 * SOURCE-ASSERTED, the convention for anything inside camera.js's render
 * closure and the eye's private fields (shutter-race.test.mjs). `mini-dom.mjs`
 * does not parse `innerHTML`, so a real click-and-observe test is not
 * available here; that the tap reaches the handler in a browser is the lane
 * report's "not walked on a phone" line.
 *
 * EVERY SLICE NORMALISES CRLF FIRST and is taken through `between()`, which
 * throws when a marker has moved instead of returning the rest of the file.
 * That is D-110, closed today: a hunt for a '\n};\n' marker returns -1 on a
 * CRLF checkout and `slice(-1)` quietly sweeps the whole file, so every
 * assertion downstream passes against text it was never pointed at.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

const EYE = read('../src/eye/camera.ts');
const ATTACH = read('../public/js/eye-attach.js');
const SCREEN = read('../public/js/screens/camera.js');
const STRINGS = read('../public/js/ui-strings.js');
const CSS = read('../public/css/screens/camera.css');

/** A slice between two literal markers that FAILS LOUDLY rather than running away. */
function between(text, from, to, what) {
  const a = text.indexOf(from);
  assert.notEqual(a, -1, `${what}: the opening marker ${JSON.stringify(from)} is gone`);
  const b = text.indexOf(to, a + from.length);
  assert.notEqual(b, -1, `${what}: the closing marker ${JSON.stringify(to)} is gone`);
  const slice = text.slice(a, b);
  assert.ok(
    slice.length < text.length / 2,
    `${what}: the slice is over half the file, so it swept past its end and proves nothing`,
  );
  return slice;
}

/* ------------------------------------------------------- 1. the eye's gate */

test('the decode in #tick sits behind the gate, not in front of it', () => {
  const tick = between(EYE, 'async #tick()', '/** The pick, if the detectors', '#tick()');

  const gate = tick.indexOf('if (this.#barcodeWanted)');
  const scan = tick.indexOf('this.#scanner.scan(frame)');
  assert.notEqual(scan, -1, 'the decode call moved or was renamed, so this file is no longer watching it');
  assert.notEqual(gate, -1, 'there is no gate: every frame is handed to zxing unprompted again');
  assert.ok(
    gate < scan,
    'the gate is not ahead of the decode -- zxing still runs on frames nobody asked it to read',
  );

  // And the emit is inside the gated block, not merely the scan call.
  const emit = tick.indexOf('this.#events.onBarcode(read)');
  assert.notEqual(emit, -1, 'the read is no longer emitted');
  assert.ok(emit > gate, 'a read can be emitted from outside the gate');
});

test('one press buys one read: the gate closes itself before the event fires', () => {
  const tick = between(EYE, 'async #tick()', '/** The pick, if the detectors', '#tick()');
  const clear = tick.indexOf('this.#barcodeWanted = false;');
  const emit = tick.indexOf('this.#events.onBarcode(read)');
  assert.notEqual(clear, -1, 'the gate is never lowered, so one press arms reading forever');
  assert.ok(
    clear < emit,
    'the gate is lowered after the event, so a handler that re-arms mid-flight would be undone',
  );
});

test('scanBarcode() is the only thing that raises the gate', () => {
  assert.match(EYE, /scanBarcode\(\): void \{\n\s*this\.#barcodeWanted = true;/,
    'the eye has no scanBarcode() that arms a read');
  const raises = EYE.match(/#barcodeWanted = true/g) ?? [];
  assert.equal(raises.length, 1, 'something other than scanBarcode() arms the decoder');
  assert.match(EYE, /#barcodeWanted = false;/, 'the field is never lowered anywhere');
});

test('leaving the screen or coming back to idle drops an unfulfilled arming', () => {
  const stop = between(EYE, '  stop(): void {', '  /** The manual shutter', 'stop()');
  assert.match(stop, /#barcodeWanted = false;/, 'an arming survives stop() and reads on the next start');

  const clear = between(EYE, '  clearSelection(): void {', '  async setTorch(', 'clearSelection()');
  assert.match(clear, /#barcodeWanted = false;/, 'an arming the shopper walked away from survives the reset');
});

/* ------------------------------------------------- 2. the handle in between */

test('both the live handle and the inert one carry scanBarcode', () => {
  assert.match(ATTACH, /scanBarcode: \(\) => camera\.scanBarcode\(\)/,
    'the live eye handle does not expose scanBarcode, so the button cannot reach the gate');
  const inert = between(ATTACH, '  function inert() {', '\nfunction clamp(', 'inert()');
  assert.match(inert, /scanBarcode: \(\) =>/,
    'a failed eye has no scanBarcode, so tapping the button on a denied camera throws');
});

/* ----------------------------------------------------------- 3. the button */

test('the screen renders a scan-barcode control and a photo/barcode toggle', () => {
  assert.match(SCREEN, /data-act="scan-barcode"/, 'there is no scan-barcode control at all');
  assert.match(SCREEN, /class="scan-code-btn"/, 'the barcode control is not its own distinct button');
  assert.match(
    SCREEN,
    /data-act="scan-mode" data-mode="photo"/,
    'there is no photo half of the mode toggle',
  );
  assert.match(
    SCREEN,
    /data-act="scan-mode" data-mode="barcode"/,
    'there is no barcode half of the mode toggle',
  );
  // The bar keeps exactly its three positions: the two nav buttons and one
  // middle control with two faces. A fourth control in .cam-bar is what the
  // 44px gap has no room for.
  const bar = between(SCREEN, '<div class="cam-bar">', '</div>\n      </div>', '.cam-bar');
  assert.equal((bar.match(/data-act="/g) ?? []).length, 4, 'the bottom bar no longer holds exactly watchlist, shutter, scan-barcode, you');
  assert.match(bar, /data-act="scan-barcode" hidden/, 'the barcode button is not hidden in the default photo mode');
});

test('the click dispatch wires scan-barcode to the eye and scan-mode to the swap', () => {
  const dispatch = between(
    SCREEN,
    "      if (act === 'shoot') { shoot(); return; }",
    "      if (act === 'pad-shop')",
    'the click dispatch',
  );
  assert.match(dispatch, /if \(act === 'scan-barcode'\)/, 'scan-barcode has no branch, so the button does nothing');
  assert.match(dispatch, /eye\?\.scanBarcode\?\.\(\)/, 'the branch never asks the eye for a read');
  assert.match(dispatch, /if \(act === 'scan-mode'\) \{ setScanMode\(/, 'the toggle is not wired to setScanMode');
  assert.match(
    dispatch,
    /cam\.dataset\.state !== 'idle'/,
    'the barcode button fires while a sheet is up, underneath an answer already on screen',
  );
});

test('setScanMode swaps one control for the other rather than showing both', () => {
  const fn = between(SCREEN, '    function setScanMode(next) {', '    function setState(next) {', 'setScanMode');
  assert.match(fn, /shutter\.hidden = barcode;/, 'the shutter stays reachable in barcode mode');
  assert.match(fn, /scanBtn\.hidden = !barcode;/, 'the barcode button stays reachable in photo mode');
  assert.match(fn, /aria-pressed/, 'the toggle never says which half is chosen');
  assert.doesNotMatch(fn, /scanBarcode\(\)/, 'changing mode arms a read, which is the auto-read defect by another door');
});

/* ---------------------------------------------------------- 4. the strings */

const NEW_KEYS = ['cam_scan_barcode', 'cam_mode_photo', 'cam_mode_barcode', 'cam_mode_picker'];

test('every new key is in BOTH string tables', () => {
  // The locale id is `fr`, not `fr-CA`. The two tables are one file, split at
  // the French one's own opening; each key is asserted in its own half so a
  // key present twice in EN and never in FR cannot pass.
  const frAt = STRINGS.indexOf("cam_shutter: 'Scanner ce que tu pointes'");
  assert.notEqual(frAt, -1, 'the French table moved; this file can no longer tell the two halves apart');
  const en = STRINGS.slice(0, frAt);
  const fr = STRINGS.slice(frAt);
  for (const key of NEW_KEYS) {
    assert.ok(en.includes(`${key}:`), `${key} is missing from the English table`);
    assert.ok(fr.includes(`${key}:`), `${key} is missing from the French table, so it falls back to English`);
  }
});

test('the French strings are French, not the English ones copied across', () => {
  const frAt = STRINGS.indexOf("cam_shutter: 'Scanner ce que tu pointes'");
  const fr = STRINGS.slice(frAt);
  assert.match(fr, /cam_scan_barcode: 'Scanner le code-barres'/, 'the barcode button has no French');
  assert.match(fr, /cam_mode_barcode: 'Code-barres'/, 'the barcode mode label has no French');
  // cam_mode_photo is deliberately 'Photo' in both: it is the same word.
});

test('the screen reads the new keys through t(), not as literals', () => {
  for (const key of NEW_KEYS) {
    assert.ok(SCREEN.includes(`t('${key}')`), `${key} is rendered as a hardcoded string instead of translated`);
  }
});

/* -------------------------------------------------------------- 5. the CSS */

test('the toggle and the barcode button are styled, and the bar height token is untouched', () => {
  assert.match(CSS, /^\.cam-mode \{/m, 'the mode toggle has no styling');
  assert.match(CSS, /^\.scan-code-btn \{/m, 'the barcode button has no styling');
  assert.match(
    CSS,
    /--cam-bar-h: calc\(132px \+ env\(safe-area-inset-bottom\)\);/,
    'the bar height token changed -- the reticle and the dock are both measured against it',
  );
  // The toggle's own strip is folded into the band the reticle is measured
  // off, so the two cannot drift apart.
  assert.match(CSS, /--cam-mode-band: calc\(var\(--cam-mode-h\) \+ var\(--cam-mode-gap\)\);/,
    'the toggle has no measured height, so the dock band does not know it is there');
  assert.match(CSS, /--dock-band-bottom: calc\(var\(--cam-bar-h\) \+ var\(--cam-mode-band\)/,
    'the dock band does not account for the toggle, so the docked face sits on top of it');
  // 44px is D-050's tap floor and the reason this strip is that tall.
  assert.match(CSS, /--cam-mode-h: 44px;/, 'the mode toggle is under the 44px tap floor');
});
