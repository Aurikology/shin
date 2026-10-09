/**
 * UX build 1: the native haptics bridge. Blocks R-1, R-2, R-3, R-4, R-5 of
 * docs/design/ux-evidence-2026-10-09.md (section 13, build 1).
 *
 * THE CONTRACT THESE TESTS PIN (the build must meet it, or change this file in
 * the same commit and say why):
 *
 *   public/js/lib/haptics.js exports
 *     HAPTIC_EVENTS         frozen table, exactly: 'barcode-captured',
 *                           'verdict-landed', 'saved'. Each row:
 *                           { ios, android, fallbackMs } where ios is
 *                           { kind:'impact', style:'LIGHT' } or
 *                           { kind:'notification', type:'SUCCESS' } and android
 *                           is { effect:'TICK' | 'CONFIRM' }.
 *     haptic(name, win?)    fires one event. Returns 'native', 'vibrate' or
 *                           'off'. THROWS on a name not in the table, and on a
 *                           native iOS/Android wrapper that lacks the Haptics
 *                           plugin. A bridge call that throws is not swallowed.
 *     verdictHaptic(conf, win?)
 *                           conf is 'certain' | 'sure' | 'thin' (lib/history-
 *                           answer.js DIST_CONF). certain/sure fire
 *                           'verdict-landed'; thin fires nothing and returns
 *                           null; anything else THROWS.
 *     CAPTURE_HOLD_MS       150 or more (R-4).
 *   The native plugin is reached the way purchases.js reaches Purchases:
 *     win.Capacitor.getPlatform() / isPluginAvailable('Haptics') /
 *     Plugins.Haptics, with methods impact({style}), notification({type}) on
 *     iOS and perform({effect}) on Android 11+ (an older Android has no
 *     `perform`, and keeps navigator.vibrate).
 *   screens/camera.js: no buzz(), no navigator.vibrate; exactly one
 *     haptic('barcode-captured') (inside onBarcode, after the frame is frozen
 *     by captureThumb, and the build waits CAPTURE_HOLD_MS before the pad
 *     rises), exactly one haptic('saved') (inside the dist-save handler), and
 *     verdictHaptic(...) at the verdict landings. No other haptic call.
 *
 * EXPECTED RESULT BEFORE THE BUILD LANDS
 *   RED until the build lands: every test below except the one marked KEEP
 *   (22 of 23). They fail on "public/js/lib/haptics.js does not exist", or on
 *   camera.js still calling buzz() / having no haptic call sites.
 *   GREEN today: the KEEP test, R-1 "the off switch is in You and haptics
 *   default to on".
 *   The tests were also run against a throwaway reference build (a haptics.js
 *   and a patched camera.js in a scratch copy) and all 23 passed there, so each
 *   can go green.
 *
 * NOT AUTOMATABLE, so not tested here: R-5's pass number (five testers, three
 * Android phones, a loud store, tick felt 5 of 5, fail under 4 of 5). A phone
 * motor cannot be asserted from node. Whether iPhone's installed web app
 * behaves like Safari (R-2) is the spec's own inference.
 *
 * Camera call-site tests read the shipped camera.js source, comments removed:
 * the camera screen is one 6000-line closure that mini-dom cannot mount, and
 * the existing suite asserts it the same way (shutter-race.test.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeDocument, makeStorage, installBrowser } from '../mini-dom.mjs';

const storage = makeStorage();
installBrowser({ doc: makeDocument(), storage });

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CAMERA = stripComments(read('../../public/js/screens/camera.js'));

function between(text, from, to, what) {
  const a = text.indexOf(from);
  assert.notEqual(a, -1, `${what}: the opening marker ${JSON.stringify(from)} is gone`);
  const b = text.indexOf(to, a + from.length);
  assert.notEqual(b, -1, `${what}: the closing marker ${JSON.stringify(to)} is gone`);
  return text.slice(a, b);
}

const store = await import('../../public/js/store.js');

let H = null;
let loadError = null;
try {
  H = await import('../../public/js/lib/haptics.js');
} catch (err) {
  loadError = err;
}
const mod = () => {
  assert.ok(H, `R-2 not built: public/js/lib/haptics.js does not exist or does not load (${loadError?.message ?? 'unknown'})`);
  return H;
};

/** A fake window. `platform` ios | android | web; `plugin` the Haptics plugin or null; `vibrate` the browser call. */
function fakeWin({ platform = 'web', plugin = null, vibrate = null } = {}) {
  const log = [];
  const rec = (name) => (arg) => { log.push([name, arg]); };
  const Haptics = plugin === true
    ? (platform === 'android'
      ? { perform: rec('perform') }
      : { impact: rec('impact'), notification: rec('notification') })
    : plugin;
  const win = {
    Capacitor: platform === 'web' ? undefined : {
      getPlatform: () => platform,
      isPluginAvailable: (n) => n === 'Haptics' && !!Haptics,
      Plugins: Haptics ? { Haptics } : {},
    },
    navigator: vibrate === 'yes' ? { vibrate: (p) => { log.push(['vibrate', p]); return true; } } : {},
  };
  return { win, log };
}

function withStoreBuzz(on, fn) {
  const before = store.buzzOn();
  store.setBuzz(on);
  try { return fn(); } finally { store.setBuzz(before); }
}

/* ------------------------------------------------------------------ R-1 */

test('R-1: a scan fires exactly 2 haptics, barcode captured and verdict landed', () => {
  const { haptic, verdictHaptic } = mod();
  const { win, log } = fakeWin({ platform: 'ios', plugin: true });
  haptic('barcode-captured', win);
  // the pad keys, the price confirm and the shop pick have no event name, so nothing else can fire
  verdictHaptic('certain', win);
  assert.equal(log.length, 2, `a scan buzzed ${log.length} times: ${JSON.stringify(log)}`);
});

test('R-1: the table holds exactly three events, two per scan and one for Save', () => {
  const { HAPTIC_EVENTS } = mod();
  assert.deepEqual(Object.keys(HAPTIC_EVENTS).sort(), ['barcode-captured', 'saved', 'verdict-landed']);
  assert.ok(Object.isFrozen(HAPTIC_EVENTS), 'the table can be edited at run time');
});

test('R-1: none on pad keys, price confirm, shop pick, errors: those names are not in the table and throw', () => {
  const { haptic } = mod();
  const { win, log } = fakeWin({ platform: 'ios', plugin: true });
  for (const name of ['pad-key', 'price-confirm', 'shop-pick', 'error', 'offline', 'server-fault', 'refusal', 'observation-stored']) {
    assert.throws(() => haptic(name, win), undefined, `${name} did not throw, so a caller can fire it silently`);
  }
  assert.equal(log.length, 0, 'a name outside the table still reached the phone');
});

test('R-1: camera.js carries one capture haptic, one Save haptic, verdict haptics, and no other buzz', () => {
  assert.ok(!/\bbuzz\(/.test(CAMERA), 'camera.js still calls buzz(), the old 8 to 16 ms pulses');
  assert.ok(!/navigator\.vibrate/.test(CAMERA), 'camera.js still talks to navigator.vibrate itself');
  const calls = [...CAMERA.matchAll(/\bhaptic\(\s*(['"`])([^'"`]+)\1/g)].map((m) => m[2]);
  assert.deepEqual(calls.sort(), ['barcode-captured', 'saved'], `haptic() call sites in camera.js: ${JSON.stringify(calls)}`);
  assert.ok(!/\bhaptic\(\s*[^'"`\s]/.test(CAMERA), 'a haptic() call passes a computed name; names must be literal so they can be counted');
  assert.ok((CAMERA.match(/\bverdictHaptic\(/g) ?? []).length >= 1, 'no verdict landing fires verdictHaptic');
});

test('R-1: Save fires its haptic inside the dist-save handler, and nowhere else', () => {
  const handler = between(CAMERA, "act === 'dist-save'", "act === 'keepit'", 'dist-save handler');
  assert.match(handler, /\bhaptic\(\s*'saved'\s*\)/, 'the Save handler does not fire the saved haptic');
});

test('R-1 (KEEP): the off switch is in You and haptics default to on', () => {
  store.reset();
  assert.equal(store.buzzOn(), true, 'haptics are not on by default');
  const root = { innerHTML: '', dataset: {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, setAttribute() {}, closest: () => null, contains: () => false };
  return import('../../public/js/screens/you.js').then((m) => {
    try {
      m.default.render(root, { api: { quota: () => new Promise(() => {}), scans: () => new Promise(() => {}) }, go() {}, replace() {}, params: {}, build: 't' });
    } catch { /* wiring after the paint needs a DOM this stub lacks */ }
    assert.match(root.innerHTML, /data-act="buzz"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-act="buzz"/, 'You has no haptics switch, or it starts off');
  });
});

test('R-1: with the You switch off, a haptic fires nothing', () => {
  const { haptic, verdictHaptic } = mod();
  const { win, log } = fakeWin({ platform: 'ios', plugin: true, vibrate: 'yes' });
  withStoreBuzz(false, () => {
    assert.equal(haptic('barcode-captured', win), 'off');
    verdictHaptic('certain', win);
  });
  assert.equal(log.length, 0, 'the off switch did not stop the haptic');
  withStoreBuzz(true, () => haptic('saved', win));
  assert.equal(log.length, 1, 'with the switch on, Save did not fire');
});

/* ------------------------------------------------------------------ R-2 */

test('R-2: on iPhone the verdict is a success notification, capture and Save are light impacts', () => {
  const { haptic } = mod();
  const { win, log } = fakeWin({ platform: 'ios', plugin: true });
  haptic('verdict-landed', win);
  haptic('barcode-captured', win);
  haptic('saved', win);
  assert.deepEqual(log, [
    ['notification', { type: 'SUCCESS' }],
    ['impact', { style: 'LIGHT' }],
    ['impact', { style: 'LIGHT' }],
  ]);
});

test('R-2: on Android 11 and newer the verdict is the system confirm effect and capture a tick', () => {
  const { haptic } = mod();
  const { win, log } = fakeWin({ platform: 'android', plugin: true });
  haptic('verdict-landed', win);
  haptic('barcode-captured', win);
  assert.deepEqual(log, [
    ['perform', { effect: 'CONFIRM' }],
    ['perform', { effect: 'TICK' }],
  ]);
});

test('R-2: with the native layer present, navigator.vibrate is not called (system presets, not raw milliseconds)', () => {
  const { haptic } = mod();
  const { win, log } = fakeWin({ platform: 'ios', plugin: true, vibrate: 'yes' });
  haptic('verdict-landed', win);
  assert.ok(!log.some(([n]) => n === 'vibrate'), `vibrate was called beside the native bridge: ${JSON.stringify(log)}`);
});

test('R-2: an Android without the confirm effect keeps the vibration call', () => {
  const { haptic } = mod();
  const old = { impact() { throw new Error('not on Android'); } }; // a plugin with no `perform`
  const { win, log } = fakeWin({ platform: 'android', plugin: old, vibrate: 'yes' });
  assert.equal(haptic('verdict-landed', win), 'vibrate');
  assert.equal(log.length, 1);
  assert.equal(log[0][0], 'vibrate');
});

test('R-2: the iOS 18 hidden switch-control trick is not built on', () => {
  mod();
  const src = read('../../public/js/lib/haptics.js');
  assert.ok(!/createElement\(\s*['"]input['"]|type=["']?checkbox|\bswitch\b\s*=|setAttribute\(\s*['"]switch['"]/.test(stripComments(src)), 'haptics.js builds on the undocumented checkbox switch');
});

test('R-2 (fails loudly): a native iOS or Android wrapper with no Haptics plugin throws', () => {
  const { haptic } = mod();
  for (const platform of ['ios', 'android']) {
    const { win } = fakeWin({ platform, plugin: null, vibrate: 'yes' });
    assert.throws(() => haptic('verdict-landed', win), undefined, `${platform}: a wrapper built without haptics stayed silent`);
  }
});

test('R-2 (fails loudly): an event name not in the table throws, even with haptics off', () => {
  const { haptic } = mod();
  const { win } = fakeWin({ platform: 'ios', plugin: true });
  assert.throws(() => haptic('verdict_landed', win), undefined, 'a misspelt event was accepted');
  assert.throws(() => haptic(undefined, win), undefined, 'a missing event name was accepted');
  withStoreBuzz(false, () => assert.throws(() => haptic('nope', win), undefined, 'the off switch hides a bad name'));
});

test('R-2 (fails loudly): a bridge call that throws is not swallowed', () => {
  const { haptic } = mod();
  const broken = { impact() { throw new Error('bridge down'); }, notification() { throw new Error('bridge down'); } };
  const { win } = fakeWin({ platform: 'ios', plugin: broken });
  assert.throws(() => haptic('barcode-captured', win), /bridge down/, 'the old "best effort only" swallow is back');
});

/* ------------------------------------------------------------------ R-3 */

test('R-3: barcode captured is a light impact; Save is the confirm feel; torch, offline and server fault have no haptic', () => {
  const { HAPTIC_EVENTS, haptic } = mod();
  assert.deepEqual(HAPTIC_EVENTS['barcode-captured'].ios, { kind: 'impact', style: 'LIGHT' });
  assert.equal(HAPTIC_EVENTS['saved'].android.effect, 'CONFIRM');
  const { win } = fakeWin({ platform: 'ios', plugin: true });
  for (const name of ['torch-toggled', 'offline', 'server-fault']) assert.throws(() => haptic(name, win), undefined, `${name} has a haptic`);
  assert.ok(!/\bhaptic\(|verdictHaptic\(/.test(between(CAMERA, 'function requestTorch(on) {', '\n    }\n', 'requestTorch')), 'the torch toggle fires a haptic');
  assert.ok(!/haptic/i.test(between(CAMERA, 'export function needsConnectionSheet', 'export function serverFaultSheet', 'needsConnectionSheet')), 'the offline sheet fires a haptic');
});

test('R-3: no event uses a failure feel; a bad price is not a failed task', () => {
  const { HAPTIC_EVENTS } = mod();
  for (const [name, row] of Object.entries(HAPTIC_EVENTS)) {
    assert.ok(!/ERROR|WARNING|FAIL/i.test(JSON.stringify(row)), `${name} uses a failure or warning feel`);
  }
  assert.deepEqual(HAPTIC_EVENTS['verdict-landed'].ios, { kind: 'notification', type: 'SUCCESS' });
});

test('R-3: a confident or fairly sure verdict fires one success tick; a low-confidence verdict fires none', () => {
  const { verdictHaptic } = mod();
  const { win, log } = fakeWin({ platform: 'ios', plugin: true });
  assert.equal(verdictHaptic('certain', win), 'verdict-landed');
  assert.equal(verdictHaptic('sure', win), 'verdict-landed');
  assert.equal(log.length, 2);
  assert.equal(verdictHaptic('thin', win), null, 'a low-confidence verdict buzzed');
  assert.equal(log.length, 2, 'a low-confidence verdict reached the phone');
});

test('R-3 (fails loudly): a confidence that is neither certain, sure nor thin throws', () => {
  const { verdictHaptic } = mod();
  const { win } = fakeWin({ platform: 'ios', plugin: true });
  for (const bad of [undefined, null, '', 'high', 'unknown', 3]) {
    assert.throws(() => verdictHaptic(bad, win), undefined, `confidence ${JSON.stringify(bad)} was treated as something`);
  }
});

/* ------------------------------------------------------------------ R-4 */

test('R-4: the capture haptic fires after the frame has frozen, not on the button press', () => {
  const press = between(CAMERA, "act === 'scan-barcode'", "act === 'watchlist'", 'scan-barcode press');
  assert.ok(!/\bhaptic\(/.test(press), 'the haptic still fires on the press, while the viewfinder is live and searching');
  const onBarcode = between(CAMERA, 'async function onBarcode(read) {', 'function askPriceFirst(', 'onBarcode');
  const frozen = onBarcode.indexOf('captureThumb(');
  const buzz = onBarcode.indexOf("haptic('barcode-captured')");
  assert.ok(frozen > -1, 'onBarcode no longer freezes the frame with captureThumb');
  assert.ok(buzz > frozen, 'the capture haptic is not placed after the frame freezes in onBarcode');
});

test('R-4: the highlight is held at least 150 ms before the sheet rises', () => {
  const { CAPTURE_HOLD_MS } = mod();
  assert.ok(Number.isFinite(CAPTURE_HOLD_MS) && CAPTURE_HOLD_MS >= 150, `CAPTURE_HOLD_MS is ${CAPTURE_HOLD_MS}`);
  const onBarcode = between(CAMERA, 'async function onBarcode(read) {', 'function askPriceFirst(', 'onBarcode');
  const hold = onBarcode.indexOf('CAPTURE_HOLD_MS');
  const ask = onBarcode.indexOf('askPriceFirst(');
  assert.ok(hold > -1, 'onBarcode never waits CAPTURE_HOLD_MS');
  assert.ok(ask > hold, 'the pad rises before the hold');
});

/* ------------------------------------------------------------------ R-5 */

test('R-5: until the native layer exists the fallback pulses are whole milliseconds of at least 8 and kept', () => {
  const { HAPTIC_EVENTS, haptic } = mod();
  for (const [name, row] of Object.entries(HAPTIC_EVENTS)) {
    assert.ok(Number.isInteger(row.fallbackMs) && row.fallbackMs >= 8, `${name}: fallbackMs ${row.fallbackMs} is under the 8 ms floor the spec fails on`);
  }
  const { win, log } = fakeWin({ platform: 'web', vibrate: 'yes' });
  assert.equal(haptic('barcode-captured', win), 'vibrate');
  assert.deepEqual(log, [['vibrate', HAPTIC_EVENTS['barcode-captured'].fallbackMs]]);
});

test('R-5: no fallback pulse is longer than 100 ms, and a plain browser with no vibrate is "off", not an error', () => {
  const { HAPTIC_EVENTS } = mod();
  for (const [name, row] of Object.entries(HAPTIC_EVENTS)) {
    assert.ok(row.fallbackMs <= 100, `${name}: ${row.fallbackMs} ms is a buzz, not a tick`);
  }
  // A plain browser with no vibrate and no wrapper is a legitimate "off", not an error.
  const { win, log } = fakeWin({ platform: 'web' });
  assert.equal(mod().haptic('saved', win), 'off');
  assert.equal(log.length, 0);
});
