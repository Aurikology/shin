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
  const ready = between(SCREEN, '    function onBarcodeReady(ready) {', '    /**\n     * The barcode button pressed with no code', 'onBarcodeReady');
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

/*
 * 2026-09-19: the mode tabs are gone. The barcode button is always on the
 * camera beside the shutter, so the old "starts hidden, the vote shows it"
 * tests are replaced by their honest successors: it is never hidden, the vote
 * lights it, and pressing it with nothing read answers instead of doing nothing.
 * The rest of the camera-screen wiring is in camera-icons.test.mjs.
 */

test('the screen renders a scan-barcode control and no mode toggle', () => {
  assert.match(SCREEN, /data-act="scan-barcode"/, 'there is no scan-barcode control at all');
  assert.match(SCREEN, /class="scan-code-btn"/, 'the barcode control is not its own distinct button');
  assert.ok(!/data-act="scan-mode"|data-mode=/.test(SCREEN), 'a scan-mode toggle is back');
  const bar = between(SCREEN, '<div class="cam-bar">', '</div>\n      </div>', '.cam-bar');
  assert.equal((bar.match(/data-act="/g) ?? []).length, 5, 'the bottom bar no longer holds exactly watchlist, scan-barcode, shoot, manual-search, you');
});

test('the barcode button is never hidden, and only the vote lights it', () => {
  const bar = between(SCREEN, '<div class="cam-bar">', '</div>\n      </div>', '.cam-bar').replace(/\s+/g, ' ');
  assert.ok(/data-act="scan-barcode" aria-label="[^"]*">/.test(bar), 'the barcode button is not a plain always-present button');
  assert.ok(!/data-act="scan-barcode"[^>]*hidden/.test(bar), 'the barcode button starts hidden again');
  const paint = between(SCREEN, '    function paintBarcodeButton() {', '    /**\n     * The eye\'s vote settled', 'paintBarcodeButton');
  assert.ok(paint.includes("btn.classList.toggle('is-ready', idle && Boolean(barcodeReady));"),
    'the button lights for something other than a settled vote at idle');
  const raises = SCREEN.match(/\.scan-code-btn'\)[^\n]*\.hidden = |btn\.hidden = /g) ?? [];
  assert.equal(raises.length, 0, 'something hides or shows the button by hand instead of the vote lighting it');
});

test('the eye handler wires the vote to the button', () => {
  assert.match(SCREEN, /onBarcodeReady,\n/, 'the screen never hears that the vote has a winner');
  assert.match(ATTACH, /onBarcodeReady: \(ready\) => \{ if \(!dead\.value\) handlers\.onBarcodeReady\?\.\(ready\); \}/,
    'the attach layer drops the ready signal');
});

test('the click dispatch wires scan-barcode to the eye, and only at idle', () => {
  const dispatch = between(SCREEN, "      if (act === 'shoot') { shoot(); return; }", "      if (act === 'pad-shop')", 'the click dispatch');
  assert.match(dispatch, /if \(act === 'scan-barcode'\)/, 'scan-barcode has no branch, so the button does nothing');
  assert.match(dispatch, /eye\?\.scanBarcode\?\.\(\)/, 'the branch never asks the eye for the settled code');
  assert.ok(!/scan-mode|setScanMode/.test(dispatch), 'the dispatch still knows the mode toggle');
  assert.match(dispatch, /cam\.dataset\.state !== 'idle'/,
    'the barcode button fires while a sheet is up, underneath an answer already on screen');
});

test('the eye decodes at idle and stands down otherwise, with no mode in the way', () => {
  const decoding = between(SCREEN, '    function syncDecoding() {', '    /** The barcode button is always there', 'syncDecoding');
  assert.ok(decoding.includes('eye?.setBarcodeMode?.(idle);'), 'the decoder is gated on something other than idle');
  assert.ok(!/scanMode|setScanMode/.test(SCREEN), 'a scan mode is back');
  assert.ok(SCREEN.includes('barcodeMode: true,'), 'the eye no longer starts decoding');
});

/* ---------------------------------------------------------- 5. the strings */

// The three accessible names of the camera's icon buttons (the barcode button
// keeps `cam_scan_barcode`, the shutter `cam_shutter`, the keyboard button
// `cam_mode_manual`).
const NEW_KEYS = ['cam_scan_barcode', 'cam_shutter', 'cam_mode_manual'];
// Where the French table opens: its own `cam_shutter`.
const FR_MARK = "cam_shutter: 'Prendre une photo'";

test('every icon label key is in BOTH string tables', () => {
  // The locale id is `fr`, not `fr-CA`. The two tables are one file, split at
  // the French one's own opening; each key is asserted in its own half so a
  // key present twice in EN and never in FR cannot pass.
  const frAt = STRINGS.indexOf(FR_MARK);
  assert.notEqual(frAt, -1, 'the French table moved; this file can no longer tell the two halves apart');
  const en = STRINGS.slice(0, frAt);
  const fr = STRINGS.slice(frAt);
  for (const key of NEW_KEYS) {
    assert.ok(en.includes(`${key}:`), `${key} is missing from the English table`);
    assert.ok(fr.includes(`${key}:`), `${key} is missing from the French table, so it falls back to English`);
  }
});

test('the French strings are French, not the English ones copied across', () => {
  const frAt = STRINGS.indexOf(FR_MARK);
  const fr = STRINGS.slice(frAt);
  assert.match(fr, /cam_scan_barcode: 'Scanner le code-barres'/, 'the barcode button has no French');
  assert.match(fr, /cam_mode_manual: 'Recherche manuelle'/, 'the keyboard button has no French');
});

test('the screen reads the icon label keys through t(), not as literals', () => {
  for (const key of NEW_KEYS) {
    assert.ok(SCREEN.includes(`t('${key}')`), `${key} is rendered as a hardcoded string instead of translated`);
  }
  // The tab labels are gone with the tabs: a string nobody renders is a string
  // somebody will translate for nothing.
  for (const gone of ['cam_mode_photo', 'cam_mode_barcode', 'cam_mode_picker']) {
    assert.ok(!STRINGS.includes(`${gone}:`), `${gone} is still in the string tables with no tab to label`);
  }
});

/* -------------------------------------------------------------- 6. the CSS */

test('the barcode and keyboard buttons are styled, and the bar height token is untouched', () => {
  assert.match(CSS, /^\.scan-code-btn \{/m, 'the barcode button has no styling');
  assert.match(CSS, /^\.type-btn \{/m, 'the keyboard button has no styling');
  assert.ok(!/\.cam-mode|\[data-mode/.test(CSS), 'the mode tab styling is back');
  assert.match(
    CSS,
    /--cam-bar-h: calc\(132px \+ env\(safe-area-inset-bottom\)\);/,
    'the bar height token changed -- the reticle and the dock are both measured against it',
  );
  // The tab strip's band went with the tabs, so the dock band is the bar, the
  // gap and the dock, and nothing else.
  assert.match(CSS, /--dock-band-bottom: calc\(var\(--cam-bar-h\) \+ var\(--dock-gap\) \+ var\(--dock-h\)\);/,
    'the dock band no longer matches the bar plus the docked face');
  // The lit state of the barcode button, in place of the old show and hide.
  assert.match(CSS, /\.scan-code-btn\.is-ready \{/, 'the button has no lit look for a settled vote');
});

test('a crop is never identified unless a shutter press asked for it', () => {
  /*
   * A barcode is on the BACK of the package, so the frame that reads one is a
   * photograph of the back. Identifying it would spend an image call to be told
   * nothing. Nothing routes an unbidden crop here today -- eye-attach passes
   * autoCapture false -- but Camera's own default is `options.autoCapture ??
   * true`, so that is one setting in another file, not an invariant. This pins
   * the invariant at the point the crop is consumed: shoot() enters `framing`
   * before it asks the eye for the capture.
   */
  const onCapture = between(SCREEN, 'onCapture: (crop) => {', '      },', 'the onCapture handler');
  assert.ok(
    onCapture.includes("if (cam.dataset.state !== 'framing') return;"),
    'onCapture does not check that a shutter press is under way, so an unbidden crop could be identified',
  );
  const guard = onCapture.indexOf("cam.dataset.state !== 'framing'");
  const handOff = onCapture.indexOf('handlePhotoCapture(crop)');
  assert.ok(guard > -1 && handOff > guard, 'the guard does not precede the hand-off to the identifier');
  const shoot = between(SCREEN, '    function shoot() {', '    /*\n     * Row 47, 48, 49, take', 'shoot');
  assert.ok(shoot.indexOf("setState('framing')") > -1 && shoot.indexOf("setState('framing')") < shoot.indexOf('eye.capture()'),
    'shoot() no longer enters framing before it takes the capture, so the guard above would drop every photo');
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
