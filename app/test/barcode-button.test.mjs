/**
 * Item 7 (and 8), 2026-09-17: barcodes are read from every frame, and the
 * "Scan barcode" button appears only when the frames agree.
 *
 * This file used to pin the 2026-09-15 ruling that nothing decodes until a
 * press. His newer word replaced it: "The barcode should be automatically read
 * out of every single frame. However, it does not automatically pop up the
 * results." and "The app should keep watching until the user presses scan
 * barcode." The vote itself (majority, sliding window, focus moving to another
 * code) is tested as behaviour in barcode-vote.test.ts. What is pinned HERE is
 * the wiring around it, which lives inside the eye's private fields and camera.js's
 * render closure and so is SOURCE-ASSERTED, the convention of shutter-race.test.mjs:
 *
 *   1. Every frame goes into the vote, in barcode mode, with no press needed.
 *   2. Nothing but the button's press can emit a read (`onBarcode`).
 *   3. The button starts hidden and is shown only by the vote.
 *   4. Pressing sends the digits only.
 *
 * That the tap reaches the handler, and that zxing decodes a real frame, in a
 * browser is NOT verified here: it needs a phone.
 *
 * EVERY SLICE NORMALISES CRLF FIRST and is taken through `between()`, which
 * throws when a marker has moved instead of returning the rest of the file
 * (D-110: a hunt for a marker that returns -1 makes `slice(-1)` sweep the whole
 * file, and every assertion downstream passes against text it was never
 * pointed at).
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

/* --------------------------------------------- 1. every frame is decoded */

test('every frame is decoded and voted, with no press needed', () => {
  const tick = between(EYE, 'async #tick()', '/** The pick, if the detectors', '#tick()');
  assert.ok(tick.includes('this.#scanner.read(frame)'), 'the tick no longer decodes frames into the vote');
  assert.ok(tick.includes('this.#vote.push('), 'decoded frames no longer reach the vote');
  assert.ok(!/barcodeWanted/.test(EYE), 'the press-to-decode gate is back: nothing reads until the button, which is the old defect');
  // The decode is gated on MODE only: photo mode never runs zxing.
  assert.ok(/if \(this\.#decoding\) \{\n\s*const seen = await this\.#scanner\.read\(frame\);/.test(tick),
    'the decode is gated on something other than the barcode mode');
});

test('a frame that found nothing still counts as a frame', () => {
  const tick = between(EYE, 'async #tick()', '/** The pick, if the detectors', '#tick()');
  // read() returns [] for a decoded frame with no code and null for no decode at all.
  assert.ok(tick.includes('if (seen) this.#vote.push(Date.now(), seen);'),
    'an empty frame no longer votes, so a flaky code would look unanimous');
});

/* ------------------------------ 2. only the button's press emits a read */

test('scanBarcode() is the only thing in the eye that emits onBarcode', () => {
  const emits = EYE.match(/this\.#events\.onBarcode\(/g) ?? [];
  assert.equal(emits.length, 1, 'something other than the press can send a read');
  const press = between(EYE, '  scanBarcode(): boolean {', '  /** Photo mode passes false', 'scanBarcode()');
  assert.ok(press.includes('this.#events.onBarcode(read)'), 'the one emit is not inside scanBarcode()');
  assert.ok(press.includes('this.#vote.confirmed('), 'a press sends whatever is in frame, not what the vote settled on');
  assert.ok(/if \(!won\) return false;/.test(press), 'a press with no winner still sends something');
});

test('a press sends the digits only, never the image', () => {
  const press = between(EYE, '  scanBarcode(): boolean {', '  /** Photo mode passes false', 'scanBarcode()');
  const read = between(press, 'const read: StableRead = {', '};', 'the read object');
  for (const field of ['value', 'format', 'box', 'frames']) assert.ok(read.includes(`${field}:`), `the read lost ${field}`);
  assert.ok(!/blob|image|canvas|bitmap|jpeg/i.test(press), 'the press path touches an image');
  // And the screen sends only the digits on to the server.
  const onBarcode = between(SCREEN, '    async function onBarcode(read) {', '    /**\n     * The pad, opened at scan time', 'onBarcode');
  assert.ok(!/identifyPhoto|crop\.blob/.test(onBarcode), 'the barcode flow sends an image');
});

test('the ready signal only reports; it never sends anything', () => {
  const emit = between(EYE, '  #emitBarcodes(): void {', '  /**\n   * The torch, and the case', '#emitBarcodes');
  assert.ok(emit.includes('this.#events.onBarcodeReady?.('), 'the vote has no way to tell the screen it has a winner');
  assert.ok(!emit.includes('onBarcode('), '#emitBarcodes emits a read, which is the auto-pop-up defect');
  const ready = between(SCREEN, '    function onBarcodeReady(ready) {', '    function setState(next) {', 'onBarcodeReady');
  assert.ok(!/onBarcode\(|proceed\(|identify/.test(ready), 'showing the button also starts a scan');
});

test('leaving the screen or coming back to idle forgets the vote', () => {
  const stop = between(EYE, '  stop(): void {', '  /** The manual shutter', 'stop()');
  assert.ok(stop.includes('this.#vote.reset()'), 'a winner survives stop() and is offered on the next visit');
  const clear = between(EYE, '  clearSelection(): void {', '  async setTorch(', 'clearSelection()');
  assert.ok(clear.includes('this.#vote.reset()'), 'the button for the code just answered is still up when the shopper comes back');
});

/* ------------------------------------------------ 3. the handle between */

test('both the live handle and the inert one carry scanBarcode', () => {
  assert.match(ATTACH, /scanBarcode: \(\) => camera\.scanBarcode\(\)/,
    'the live eye handle does not expose scanBarcode, so the button cannot reach the vote');
  const inert = between(ATTACH, '  function inert() {', '\nfunction clamp(', 'inert()');
  assert.match(inert, /scanBarcode: \(\) =>/,
    'a failed eye has no scanBarcode, so tapping the button on a denied camera throws');
});

/* ----------------------------------------------------------- 4. the button */

test('the screen renders a scan-barcode control and a photo/barcode toggle', () => {
  assert.match(SCREEN, /data-act="scan-barcode"/, 'there is no scan-barcode control at all');
  assert.match(SCREEN, /class="scan-code-btn"/, 'the barcode control is not its own distinct button');
  assert.match(SCREEN, /data-act="scan-mode" data-mode="photo"/, 'there is no photo half of the mode toggle');
  assert.match(SCREEN, /data-act="scan-mode" data-mode="barcode"/, 'there is no barcode half of the mode toggle');
  // The bar keeps exactly its three positions: the two nav buttons and one
  // middle control with two faces. A fourth control in .cam-bar is what the
  // 44px gap has no room for.
  const bar = between(SCREEN, '<div class="cam-bar">', '</div>\n      </div>', '.cam-bar');
  assert.equal((bar.match(/data-act="/g) ?? []).length, 4, 'the bottom bar no longer holds exactly watchlist, shutter, scan-barcode, you');
  const flat = SCREEN.replace(/\s+/g, ' ');
  const barFlat = bar.replace(/\s+/g, ' ');
  assert.ok(/class="shutter"[^>]*hidden/.test(barFlat), 'the shutter is not hidden, so the default is no longer barcode');
  assert.ok(flat.includes('data-mode="barcode" aria-pressed="true"'), 'the toggle does not show Barcode as the pressed half');
  assert.ok(flat.includes('data-mode="photo" aria-pressed="false"'), 'the toggle still shows Photo as the pressed half');
  assert.ok(flat.includes("let scanMode = 'barcode';"), 'the state variable no longer starts on barcode');
  assert.ok(flat.includes('setScanMode(scanMode);'), 'nothing drives the markup off the variable at render');
});

test('the barcode button starts HIDDEN and only the vote shows it', () => {
  const bar = between(SCREEN, '<div class="cam-bar">', '</div>\n      </div>', '.cam-bar').replace(/\s+/g, ' ');
  assert.ok(/data-act="scan-barcode" hidden>/.test(bar), 'the button is on screen before any barcode has been voted for');
  const paint = between(SCREEN, '    function paintBarcodeButton() {', '    /** The eye\'s vote settled', 'paintBarcodeButton');
  assert.ok(paint.includes("btn.hidden = !(scanMode === 'barcode' && idle && barcodeReady);"),
    'the button shows for something other than a settled vote in barcode mode at idle');
  const raises = SCREEN.match(/\.scan-code-btn'\)[^\n]*\.hidden = false|btn\.hidden = false/g) ?? [];
  assert.equal(raises.length, 0, 'something un-hides the button without going through the vote');
  assert.ok(!SCREEN.includes('scanBtn.hidden = !barcode'), 'setScanMode shows the button for the mode alone again');
});

test('the eye handler wires the vote to the button', () => {
  assert.match(SCREEN, /onBarcodeReady,\n/, 'the screen never hears that the vote has a winner');
  assert.match(ATTACH, /onBarcodeReady: \(ready\) => \{ if \(!dead\.value\) handlers\.onBarcodeReady\?\.\(ready\); \}/,
    'the attach layer drops the ready signal');
});

test('the click dispatch wires scan-barcode to the eye and scan-mode to the swap', () => {
  const dispatch = between(SCREEN, "      if (act === 'shoot') { shoot(); return; }", "      if (act === 'pad-shop')", 'the click dispatch');
  assert.match(dispatch, /if \(act === 'scan-barcode'\)/, 'scan-barcode has no branch, so the button does nothing');
  assert.match(dispatch, /eye\?\.scanBarcode\?\.\(\)/, 'the branch never asks the eye for the settled code');
  assert.match(dispatch, /if \(act === 'scan-mode'\) \{ setScanMode\(/, 'the toggle is not wired to setScanMode');
  assert.match(dispatch, /cam\.dataset\.state !== 'idle'/,
    'the barcode button fires while a sheet is up, underneath an answer already on screen');
});

test('setScanMode swaps one control for the other and never sends a read', () => {
  const fn = between(SCREEN, '    function setScanMode(next) {', '    /**\n     * Whether the eye is decoding', 'setScanMode');
  assert.match(fn, /shutter\.hidden = barcode;/, 'the shutter stays reachable in barcode mode');
  assert.match(fn, /paintBarcodeButton\(\)/, 'the barcode button is not re-evaluated on a mode change');
  assert.match(fn, /aria-pressed/, 'the toggle never says which half is chosen');
  assert.doesNotMatch(fn, /scanBarcode\(\)/, 'changing mode sends a read');
  const decoding = between(SCREEN, '    function syncDecoding() {', '    /** The button is visible exactly', 'syncDecoding');
  assert.ok(decoding.includes("scanMode === 'barcode' && idle"), 'the decoder runs in photo mode or during a scan');
});

/* ---------------------------------------------------------- 5. the strings */

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

/* -------------------------------------------------------------- 6. the CSS */

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
  // Its place is kept while hidden, or the nav buttons slide together and apart.
  assert.match(CSS, /\.cam\[data-mode="barcode"\] \.scan-code-btn\[hidden\] \{ display: block; visibility: hidden;/,
    'the hidden barcode button gives its place away, so the bar jumps when a code comes into view');
});

test('a crop is never identified while the shopper is scanning a barcode', () => {
  /*
   * A barcode is on the BACK of the package, so the frame that reads one is a
   * photograph of the back. Identifying it would spend an image call to be told
   * nothing. Today nothing routes a crop here in barcode mode -- the shutter is
   * hidden and eye-attach passes autoCapture false -- but Camera's own default
   * is `options.autoCapture ?? true`, so that is two unrelated settings agreeing,
   * not an invariant. This pins the invariant at the point the crop is consumed.
   */
  const onCapture = between(SCREEN, 'onCapture: (crop) => {', '      },', 'the onCapture handler');
  assert.ok(
    onCapture.includes("if (scanMode !== 'photo') return;"),
    'onCapture does not check the scan mode, so a crop taken in barcode mode could be identified',
  );
  const modeGuard = onCapture.indexOf("scanMode !== 'photo'");
  const handOff = onCapture.indexOf('handlePhotoCapture(crop)');
  assert.ok(modeGuard > -1 && handOff > modeGuard, 'the mode guard does not precede the hand-off to the identifier');
});

/* ---------------------------------------- 7. every code in view is drawn */

test('every barcode in view gets a mark, and the focused one looks different', () => {
  const paint = between(ATTACH, '  const paintCodes = (list, fw, fh) => {', '  /*\n   * Every fall back', 'paintCodes');
  assert.ok(paint.includes("el.classList.toggle('is-focus', Boolean(mark.focused))"), 'the focused code is not marked differently');
  assert.ok(paint.includes('for (let i = 0; i < Math.max(list.length, pool.length); i += 1)'), 'only one mark is drawn, not one per code');
  assert.match(CSS, /\.code-mark:not\(\.is-focus\) \{/, 'no style separates the codes the button will not send');
  assert.match(CSS, /\.code-mark\.is-focus\.is-ready \{/, 'the code the button sends has no look of its own');
  const emit = between(EYE, '  #emitBarcodes(): void {', '  /**\n   * The torch, and the case', '#emitBarcodes');
  assert.ok(emit.includes('for (const t of tracks)'), 'the eye reports fewer codes than are in view');
});
