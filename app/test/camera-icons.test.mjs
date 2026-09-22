/**
 * 2026-09-19, the owner's words: "the take photo button and the scan barcode
 * button should all be icons and they shouldn't be separate tabs that need to be
 * clicked on. Simply click the scan button to scan barcode and photo button to
 * take photo." A small keyboard icon for the typed-name search was added beside
 * them.
 *
 * So the camera has no scan mode. Three icon buttons are always on it: the
 * barcode button, the shutter (a photo) and the keyboard button. What is pinned
 * here:
 *
 *   1. all three are there, inline SVG, each with an aria-label that exists in
 *      English AND French, and no tab, mode toggle or text button is left;
 *   2. the tap targets are at least 44px, the keyboard one the smallest;
 *   3. pressing each one does the right thing. The click dispatch and the
 *      no-barcode answer live inside camera.js's render closure, which needs a
 *      browser to run, so their source is cut out and RUN here against stubs
 *      rather than only pattern-matched;
 *   4. pressing the barcode button with nothing read answers with a coaching
 *      line, in every attitude and both languages.
 *
 * That the layout looks right on a phone, and that a tap reaches the handler, is
 * NOT verified here: it needs a phone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TABLES } from '../public/js/ui-strings.js';
import { LINES_FR } from '../public/js/voice-fr.js';
import { captureAllowed } from '../public/js/screens/camera.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const CAMERA = read('../public/js/screens/camera.js');
const CSS = read('../public/css/screens/camera.css');
const TOKENS = read('../public/css/tokens.css');
const VOICE = read('../public/js/voice.js');

/** A slice between two literal markers that FAILS LOUDLY rather than running away. */
function between(text, from, to, what) {
  const a = text.indexOf(from);
  assert.notEqual(a, -1, `${what}: the opening marker ${JSON.stringify(from)} is gone`);
  const b = text.indexOf(to, a + from.length);
  assert.notEqual(b, -1, `${what}: the closing marker ${JSON.stringify(to)} is gone`);
  const slice = text.slice(a, b);
  assert.ok(slice.length < text.length / 2, `${what}: the slice is over half the file, so it swept past its end`);
  return slice;
}

const BAR = between(CAMERA, '<div class="cam-bar">', '</div>\n      </div>', 'the bottom bar');

// The three, in bar order: [class, data-act, the ui-strings key of the aria-label].
const ICONS = [
  ['scan-code-btn', 'scan-barcode', 'cam_scan_barcode'],
  ['shutter', 'shoot', 'cam_shutter'],
  ['type-btn', 'manual-search', 'cam_mode_manual'],
];

/** The markup of one button, from its opening tag to its closing one. */
function button(cls) {
  const at = BAR.indexOf(`class="${cls}"`);
  assert.notEqual(at, -1, `the .${cls} button is not on the camera`);
  const open = BAR.lastIndexOf('<button', at);
  return BAR.slice(open, BAR.indexOf('</button>', at) + '</button>'.length);
}

/* ---------------------------------------------- 1. present, labelled, icons */

test('the barcode, camera and keyboard icon buttons are all on the camera, in that order', () => {
  const order = [...BAR.matchAll(/data-act="([\w-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['watchlist', 'scan-barcode', 'shoot', 'manual-search', 'you']);
});

test('each is an inline SVG with an aria-label, no text, no image and none hidden', () => {
  for (const [cls, act, key] of ICONS) {
    const html = button(cls);
    assert.ok(html.includes(`data-act="${act}"`), `.${cls} lost its action`);
    assert.ok(html.includes(`aria-label="\${escapeHtml(t('${key}'))}"`), `.${cls} has no aria-label read from ${key}`);
    assert.ok(/<svg viewBox="0 0 24 24"[^>]*aria-hidden="true"/.test(html), `.${cls} has no inline SVG hidden from the accessibility tree`);
    assert.ok(!/<img|<use|url\(/.test(html), `.${cls} draws its icon from an image or a sprite instead of inline`);
    assert.ok(!/(^|\s)hidden(\s|>|=)/.test(html.slice(0, html.indexOf('>') + 1)), `.${cls} starts hidden, so there is a step before it can be pressed`);
    const text = html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim();
    assert.equal(text, '', `.${cls} carries visible text: ${JSON.stringify(text)}`);
  }
});

test('the three aria-labels exist in English AND French, are different from each other, and French is not English', () => {
  const seen = { en: new Set(), fr: new Set() };
  for (const [, , key] of ICONS) {
    for (const lang of ['en', 'fr']) {
      const v = TABLES[lang][key];
      assert.equal(typeof v, 'string', `${key} is missing from the ${lang} table`);
      assert.ok(v.trim().length > 2, `${key} is empty in ${lang}`);
      assert.ok(!v.includes('\u2014'), `${key} contains an em dash in ${lang}`);
      seen[lang].add(v);
    }
    assert.notEqual(TABLES.en[key], TABLES.fr[key], `${key} is the English text in the French table`);
  }
  assert.equal(seen.en.size, 3, 'two of the icon buttons share one English name');
  assert.equal(seen.fr.size, 3, 'two of the icon buttons share one French name');
});

test('no tab, mode toggle or "Scan barcode" text button is left', () => {
  assert.ok(!CAMERA.includes('cam-mode-btn'), '.cam-mode-btn tabs are back in camera.js');
  assert.ok(!CSS.includes('cam-mode-btn'), '.cam-mode-btn is still styled');
  assert.ok(!/data-act="scan-mode"|data-mode=|class="cam-mode"/.test(CAMERA), 'a mode toggle is back on the camera');
  assert.ok(!/scanMode|setScanMode/.test(CAMERA), 'a scan mode variable is back');
  assert.ok(!button('scan-code-btn').includes("t('cam_scan_barcode')</"), 'the barcode button shows its label as text again');
});

/* --------------------------------------------------------- 2. tap targets */

/** The px value a rule gives one property, or a var() it resolves through tokens.css. */
function px(sel, prop) {
  const m = CSS.match(new RegExp(`^${sel.replace('.', '\\.')} \\{([^}]*)\\}`, 'm'));
  assert.ok(m, `${sel} has no rule`);
  const v = m[1].match(new RegExp(`(?:^|[\\s;])${prop}:\\s*([^;]+);`));
  assert.ok(v, `${sel} sets no ${prop}`);
  const raw = v[1].trim();
  const token = raw.match(/^var\((--[\w-]+)\)$/);
  const text = token ? TOKENS.match(new RegExp(`${token[1]}:\\s*([\\d.]+)px`))?.[1] : raw.replace('px', '');
  assert.ok(text && Number.isFinite(Number(text)), `${sel} ${prop} is ${raw}, which is not a plain px size`);
  return Number(text);
}

test('every icon button is at least 44px each way, and the keyboard one is the smallest', () => {
  const sizes = {};
  for (const sel of ['.scan-code-btn', '.shutter', '.type-btn']) {
    const w = px(sel, 'width');
    const h = px(sel, 'height');
    assert.ok(w >= 44 && h >= 44, `${sel} is ${w}x${h}, under the 44px tap floor`);
    sizes[sel] = w;
  }
  assert.ok(sizes['.type-btn'] < sizes['.scan-code-btn'], 'the keyboard button is not the smaller one');
  assert.ok(sizes['.scan-code-btn'] < sizes['.shutter'], 'the barcode button is not smaller than the shutter');
});

/* ------------------------------------------------ 3. pressing does the work */

// The click dispatch's own source, run against stubs. `act` is what the tapped
// button's data-act says; everything else is what the closure would have in
// scope. `out` receives the closure's `barcodeReady` afterwards so the "the code
// left the frame" branch can be seen too. Built on first use, so each test that
// needs it fails on its own if the source it cuts from has moved.
const runDispatch = (...args) => new Function(
  'act', 'cam', 'track', 'eye', 'paintBarcodeButton', 'sayNoBarcode', 'buzz', 'openManualSearch', 'shoot', 'btn', 'out',
  'captureAllowed', 'lastCaptureAt',
  `let barcodeReady = { value: '0123456789012' };\ntry {\n${
    between(CAMERA, "      if (act === 'shoot') { shoot(); return; }", "      if (act === 'watchlist')", 'the click dispatch')
  }\n} finally { out.barcodeReady = barcodeReady; }`,
)(...args);

// `lastCaptureAt` defaults to 0, which `captureAllowed` (item 8, the real
// export, not a stub) treats as "nothing captured yet" and always allows;
// these tests are about the barcode/eye wiring, not the throttle, so they
// run as if the last capture was long enough ago.
function press(act, { state = 'idle', sent = true, noEye = false, lastCaptureAt = 0 } = {}) {
  const log = [];
  const eye = noEye ? undefined : { scanBarcode: () => { log.push('eye.scanBarcode'); return sent; } };
  const out = {};
  runDispatch(
    act,
    { dataset: { state } },
    (name) => log.push(`track:${name}`),
    eye,
    () => log.push('paint'),
    () => log.push('sayNoBarcode'),
    () => log.push('buzz'),
    () => log.push('openManualSearch'),
    () => log.push('shoot'),
    { dataset: { act } },
    out,
    captureAllowed,
    lastCaptureAt,
  );
  return { log, ready: out.barcodeReady };
}

test('pressing the camera icon takes the photo, and nothing else', () => {
  assert.deepEqual(press('shoot').log, ['shoot']);
});

test('pressing the keyboard icon opens the typed-name search, and nothing else', () => {
  assert.deepEqual(press('manual-search').log, ['openManualSearch']);
});

test('pressing the barcode icon takes the code the eye has read', () => {
  const { log, ready } = press('scan-barcode', { sent: true });
  assert.deepEqual(log, ['track:barcode_scan_pressed', 'eye.scanBarcode', 'buzz'], 'the press did not go to the eye, or answered as if nothing was read');
  assert.notEqual(ready, null, 'a successful read dropped the ready code before the read landed');
});

test('pressing the barcode icon with nothing read answers with the coaching line instead of doing nothing', () => {
  const { log, ready } = press('scan-barcode', { sent: false });
  assert.deepEqual(log, ['track:barcode_scan_pressed', 'eye.scanBarcode', 'paint', 'sayNoBarcode']);
  assert.equal(ready, null, 'the button still thinks a code is ready after the eye said there is none');
  assert.deepEqual(press('scan-barcode', { noEye: true }).log, ['track:barcode_scan_pressed', 'paint', 'sayNoBarcode'],
    'a camera with no eye leaves the press unanswered');
});

test('neither scan button fires under a sheet that is already up', () => {
  for (const state of ['framing', 'reading', 'asking', 'texting', 'result', 'choosing']) {
    assert.deepEqual(press('scan-barcode', { state }).log, [], `the barcode button fired in ${state}`);
  }
  assert.ok(between(CAMERA, '    function openManualSearch() {', '    /**\n     * Whether the eye is decoding', 'openManualSearch')
    .includes("if (cam.dataset.state !== 'idle') return;"), 'the keyboard button opens over a sheet that is up');
  assert.ok(between(CAMERA, '    function shoot() {', '      clearTimeout(hintTimer);', 'shoot')
    .includes("if (cam.dataset.state !== 'idle') return;"), 'the shutter fires over a sheet that is up');
});

/*
 * Item 8 (scanner-build-order-2026-09-19.md): a second scan request cannot
 * fire while one is in flight, and there is a minimum interval between
 * captures. The in-flight half is `cam.dataset.state !== 'idle'`, pinned
 * above. This is the min-interval half, using the real exported
 * `captureAllowed` (failure.md D8) rather than a stub, so a change to its
 * arithmetic that breaks the guard breaks this test too.
 */
test('the barcode button is throttled by the same minimum interval as the shutter', () => {
  const now = Date.now();
  assert.deepEqual(press('scan-barcode', { lastCaptureAt: now }).log, [],
    'a barcode press right after the last capture was not throttled');
  assert.deepEqual(press('scan-barcode', { lastCaptureAt: 0 }).log,
    ['track:barcode_scan_pressed', 'eye.scanBarcode', 'buzz'],
    'lastCaptureAt of 0 (nothing captured yet) must still be allowed');
});

/* ------------------------------------------ 4. the answer to an empty press */

const makeSay = (ctx) => new Function(
  'ctx',
  `const { dockSay, track, COACH_LINES, showAimHint, armHintEscalation, cam, setTimeout, clearTimeout, FLAGS } = ctx;
   let scanPressTimer = null; let hintTimer = null; let dead = false; let coachKey = ctx.coachKey;
   ${between(CAMERA, '    function sayNoBarcode() {', '    /**\n     * The state, and with it', 'sayNoBarcode')}
   return sayNoBarcode;`,
)(ctx);

function harness({ coachKey = null, state = 'idle', photoId = false } = {}) {
  const log = [];
  const timers = [];
  const ctx = {
    coachKey,
    // FLAGS.photoId (2026-09-21): off in the MVP, where the line names the
    // barcode as the only way in; on, it is the older "no barcode read yet".
    FLAGS: { photoId },
    cam: { dataset: { state } },
    COACH_LINES: { hold: 'cam_hold_still' },
    dockSay: (...a) => log.push(['dockSay', a[0], a[1], a[3]]),
    track: (name, props) => log.push(['track', name, props?.key]),
    showAimHint: () => log.push(['showAimHint']),
    armHintEscalation: () => log.push(['armHintEscalation']),
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
  };
  return { say: makeSay(ctx), log, timers, ctx };
}

test('with nothing read, the docked face says to point at a barcode, then the aim hint comes back', () => {
  const h = harness();
  h.say();
  assert.deepEqual(h.log, [['track', 'coaching_line_shown', 'no_barcode'], ['dockSay', 'asking', 'cam_point_barcode', 'nudge-arrive']]);
  const on = harness({ photoId: true });
  on.say();
  assert.deepEqual(on.log[1], ['dockSay', 'asking', 'cam_no_barcode', 'nudge-arrive'], 'with the photo route on, the older line is gone');
  assert.equal(h.timers.length, 1, 'the line never gives way to the aim hint');
  h.timers[0].fn();
  assert.deepEqual(h.log.slice(2), [['showAimHint'], ['armHintEscalation']]);
  // A scan that started in the meantime is not talked over.
  const busy = harness({ state: 'framing' });
  busy.say();
  busy.timers[0].fn();
  assert.deepEqual(busy.log.slice(2), [], 'the aim hint came back on top of a scan');
});

test('a measured coaching line already on screen is said again rather than talked over', () => {
  const h = harness({ coachKey: 'hold' });
  h.say();
  assert.deepEqual(h.log, [['dockSay', 'asking', 'cam_hold_still', 'nudge-arrive']]);
  assert.equal(h.timers.length, 0);
});

test('the no-barcode line exists in all three attitudes, in English and French, with no em dash and no blame', () => {
  const at = VOICE.indexOf('  cam_no_barcode: {');
  assert.notEqual(at, -1, 'voice.js has no cam_no_barcode');
  const en = VOICE.slice(at, VOICE.indexOf('\n  },', at));
  for (const attitude of ['deadpan', 'warm', 'blunt']) {
    assert.match(en, new RegExp(`${attitude}: \\(\\) =>`), `cam_no_barcode has no ${attitude} in English`);
    assert.equal(typeof LINES_FR.cam_no_barcode?.[attitude], 'function', `cam_no_barcode has no ${attitude} in French`);
    const fr = LINES_FR.cam_no_barcode[attitude]();
    assert.ok(fr.length > 10 && !fr.includes('\u2014'), `the French ${attitude} line is empty or has an em dash`);
    assert.doesNotMatch(fr, /Point at|Hold\b/, `the French ${attitude} line is the English one`);
  }
  assert.ok(!en.includes('\u2014'), 'cam_no_barcode contains an em dash');
  assert.doesNotMatch(en, /\byou\b|\byour\b|\bwrong\b|\bfault\b/i, 'cam_no_barcode talks about the person');
});

/* ------------------------------------ 5. what the bar now has to fit into */

test('the price tag hint still rides on the photo scan, and the barcode button still reaches the same eye', () => {
  const fn = between(CAMERA, '    function submitScanPrice(cents) {', '    /** The barcode\'s identification', 'submitScanPrice');
  assert.ok(fn.includes("...(pending.kind === 'photo' ? { hint: 'price_tag' } : {}),"), 'the camera button no longer sends the price tag hint');
  assert.ok(CAMERA.includes("askPriceFirst({ kind: 'photo', crop });"), 'a shutter photo no longer asks the shelf price first');
  assert.ok(CAMERA.includes("askPriceFirst({ kind: 'barcode', code: read.value });"), 'a barcode read no longer asks the shelf price first');
});
