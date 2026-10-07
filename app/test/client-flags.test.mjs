/**
 * The four MVP switches (2026-09-21, docs/mvp-plan.md "What ships OFF"):
 * onboarding, photoId, languages and market, all off, each kept in the code
 * and reversible by one value in flags.js.
 *
 * Each test here was run once against a deliberately broken client and seen to
 * fail before it was trusted (firstScreen ignoring the flag; applyFlags pinning
 * nothing; the shutter left on the camera; the shoot() guard removed; the
 * You screen still drawing the language and market rows).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const storage = makeStorage();
installBrowser({ doc: makeDocument(), storage });

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const CAMERA = read('../public/js/screens/camera.js');

function between(text, from, to, what) {
  const a = text.indexOf(from);
  assert.notEqual(a, -1, `${what}: the opening marker is gone`);
  const b = text.indexOf(to, a + from.length);
  assert.notEqual(b, -1, `${what}: the closing marker is gone`);
  return text.slice(a, b);
}

const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return { ok: true, status: 200, json: async () => ({ product: null }) };
};

const { FLAGS } = await import('../public/js/flags.js');
const { applyFlags } = await import('../public/js/flags-boot.js');
const { firstScreen } = await import('../public/js/onboarding-flow.js');
const locale = await import('../public/js/lib/locale.js');
const store = await import('../public/js/store.js');
const api = await import('../public/js/api.js');
const { t } = await import('../public/js/ui-strings.js');
const youModule = await import('../public/js/screens/you.js');

test('the four MVP switches exist and are off', () => {
  for (const k of ['onboarding', 'photoId', 'languages', 'market']) {
    assert.equal(FLAGS[k], false, `FLAGS.${k} is not off`);
  }
});

test('onboarding off: a fresh install goes Permissions, Consent, Camera, and never to setup', () => {
  /* The camera and location ask is NOT dropped with the welcome flow, which
     it was when this switch first shipped. It is step 24 INSIDE that flow, so
     switching the flow off took it off too and a fresh install was never
     asked; screens/permissions.js is that step standing on its own, and
     `permissionsSeen` is what says this device has been asked. */
  assert.equal(firstScreen({}), 'permissions');
  assert.equal(firstScreen({ permissionsSeen: true }), 'consent');
  assert.equal(firstScreen({ permissionsSeen: true, consentSeen: true }), 'camera');
  assert.equal(firstScreen({ onboarding: { doneAt: 'x' }, permissionsSeen: true, consentSeen: false }), 'consent');
  assert.equal(firstScreen({}, { onboarding: true }), 'onboarding', 'the flag no longer switches the welcome back on');
});

test('languages off: English, whatever was stored or the phone asks for; on again restores French', () => {
  storage.setItem('shin.locale', 'fr');
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-CA', languages: ['fr-CA'] }, writable: true, configurable: true });
  applyFlags({ ...FLAGS, languages: true, market: true });
  assert.equal(locale.locale(), 'fr', 'the unpinned build does not read the stored choice');
  applyFlags();
  assert.equal(locale.locale(), 'en', 'the locale is not pinned to English');
  assert.equal(locale.localePinned(), true);
  assert.equal(t('try_again'), 'Try again', 'the chrome is not English');
  storage.setItem('shin.locale', 'en');
});

test('market off: Canada on screen and on the wire, whatever was picked; on again restores the pick', async () => {
  store.setMarket('France', 'EUR');
  applyFlags({ ...FLAGS, languages: true, market: true });
  assert.equal(store.market().country, 'France');
  applyFlags();
  const m = store.market();
  assert.deepEqual({ country: m.country, currency: m.currency, code: m.code }, { country: 'Canada', currency: 'CAD', code: 'CA' });
  calls.length = 0;
  await api.identify({ gtin: '0123456789012' });
  const u = new URL(calls[0].url, 'http://x');
  assert.equal(u.searchParams.get('market'), 'Canada', 'the request still carries the stored market');
  assert.equal(u.searchParams.get('countryCode'), 'CA');
  assert.equal(store.get().market.country, 'France', 'the pin overwrote the stored choice instead of sitting over it');
});

/** Renders You to its markup; the wiring after the paint reaches for a DOM this stub does not have. */
function youMarkup(win) {
  const root = {
    innerHTML: '', dataset: {}, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: () => {}, removeEventListener: () => {}, setAttribute: () => {}, closest: () => null, contains: () => false,
  };
  const prior = globalThis.window;
  if (win) globalThis.window = win;
  try {
    youModule.default.render(root, { api: { quota: () => new Promise(() => {}) }, go() {}, replace() {}, params: {}, build: 'test' });
  } catch { /* wiring, not markup */ }
  globalThis.window = prior;
  return root.innerHTML;
}

test('You: no language row, no market row and no welcome replay while those are off; Manage subscription is there', () => {
  applyFlags();
  const html = youMarkup();
  assert.ok(html.length > 500, 'the You screen did not render');
  assert.ok(!html.includes('data-locale='), 'the language row is still drawn');
  assert.ok(!html.includes('data-act="market"'), 'the market picker row is still drawn');
  assert.ok(!html.includes('data-act="welcome"'), 'the welcome replay row is still drawn');
  /* D29: in a plain browser the store page is a dead end, so no Manage row. */
  assert.ok(!html.includes('data-manage-sub'), 'Manage subscription is drawn outside the Android store build');
  assert.match(html, /data-quota-row hidden/, 'the quota row must wait for the server');
  const android = youMarkup({ Capacitor: { getPlatform: () => 'android' } });
  assert.match(android, /data-manage-sub/);
  assert.match(android, /Manage subscription/);

  applyFlags({ ...FLAGS, languages: true, market: true });
  const on = youMarkup();
  assert.ok(on.includes('data-locale="fr"') && on.includes('data-act="market"'), 'switching the flags back on did not bring the rows back');
  applyFlags();
});

test('Manage subscription opens the store the phone uses, and the quota line shows only a real limit', () => {
  const { manageSubscriptionUrl, quotaText } = youModule;
  assert.equal(manageSubscriptionUrl({ Capacitor: { getPlatform: () => 'ios' } }), '', 'D29: no iOS build ships, so no row');
  assert.equal(manageSubscriptionUrl({ Capacitor: { getPlatform: () => 'android' } }), 'https://play.google.com/store/account/subscriptions');
  assert.equal(manageSubscriptionUrl({ navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14)' } }), '', 'a browser tab on an Android phone is still not the store build');
  assert.equal(manageSubscriptionUrl({ navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' } }), '');
  assert.equal(quotaText({ limit: 10, used: 3, remaining: 7, resetsAt: 'x', plus: false }), '7 of 10 free scans left this week');
  assert.equal(quotaText({ limit: null, used: 3, remaining: null, plus: false }), '', 'no limit set must show nothing');
  assert.equal(quotaText({ limit: 10, remaining: 0, plus: true }), 'Shin Plus: unlimited scans');
  assert.equal(quotaText(null), '');
});

test('photoId off: the camera takes the shutter off the bar and never takes or sends a photo', () => {
  assert.ok(CAMERA.includes("if (!FLAGS.photoId) root.querySelector('.cam-bar .shutter')?.remove();"), 'the shutter is left on the camera');

  // shoot(), run with the flag off: the coaching line, and no capture.
  const shoot = between(CAMERA, '    function shoot() {', '    /*\n     * Row 47, 48, 49, take', 'shoot');
  const log = [];
  const run = new Function('deps', `const { cam, FLAGS, sayNoBarcode, eye, setState, captureAllowed } = deps; let lastCaptureAt = 0; ${shoot}; return shoot;`)({
    cam: { dataset: { state: 'idle' } },
    FLAGS: { photoId: false },
    sayNoBarcode: () => log.push('sayNoBarcode'),
    eye: { live: true, capture: () => log.push('eye.capture') },
    setState: (s) => log.push(`setState:${s}`),
    captureAllowed: () => true,
  });
  run();
  assert.deepEqual(log, ['sayNoBarcode'], 'a shutter press with the photo route off took a picture');

  // A crop that arrives anyway is never turned into a photo scan.
  const capture = between(CAMERA, '    function handlePhotoCapture(crop) {', '    /** The photo', 'handlePhotoCapture');
  const asked = [];
  new Function('deps', `const { FLAGS, askPriceFirst } = deps; let dead = false; let barcodeInFlight = false; ${capture}; return handlePhotoCapture;`)({
    FLAGS: { photoId: false }, askPriceFirst: (p) => asked.push(p),
  })({ blob: 'x' });
  assert.deepEqual(asked, [], 'a crop was sent on to be priced as a photo');

  // Queued offline photos stay on the phone.
  assert.ok(CAMERA.includes('if (FLAGS.photoId) startCaptureQueue(sendQueuedCapture)'), 'queued photos are still sent');
});

/*
 * D-147, Jamin's ruling 2026-09-23: "Fix the barcode full photo." This test
 * used to pin the defect itself -- `!onBarcode.includes('FLAGS')` -- because
 * before the ruling a barcode read called `ctx.api.beginShutter?.(video)`
 * with no guard at all, the one call on this screen that ignored the flag.
 * It ran, was seen to pass against that unguarded code (the fail-before
 * evidence for the fix below), and is replaced here with the real question:
 * does a barcode read still hand its digits to `askPriceFirst` the same way,
 * and does it now send a photo only when both `FLAGS.photoId` and the
 * shopper's own photo consent are on.
 *
 * `onBarcode` is run for real, the same way `shoot()` and
 * `handlePhotoCapture` are above: extracted and rebuilt with `new Function`
 * so the actual logic executes against mocked deps, not a string search.
 */
function runOnBarcode(flags, consentPhotos) {
  const src = between(CAMERA, '    async function onBarcode(read) {', '    /**\n     * The pad, opened at scan time', 'onBarcode');
  const calls = { beginShutter: [], track: [], askPriceFirst: [] };
  const deps = {
    cam: { dataset: { camera: 'live' } },
    video: { tag: 'the-video-element' },
    FLAGS: flags,
    store: { consent: () => ({ photos: consentPhotos }) },
    ctx: { api: { beginShutter: (v) => calls.beginShutter.push(v) } },
    track: (...a) => calls.track.push(a),
    captureThumb: () => 'thumb',
    askPriceFirst: (p) => calls.askPriceFirst.push(p),
    cameraStartedAt: null,
  };
  const build = new Function('deps', `
    const { cam, video, FLAGS, store, ctx, track, captureThumb, askPriceFirst, cameraStartedAt } = deps;
    let barcodeInFlight = false, scanBarcode = null, hintTimer = null, scanPressTimer = null, torchAckTimer = null, coachKey = null, scanThumb = null;
    ${src}
    return onBarcode;
  `);
  return { fn: build(deps), calls };
}

test('photoId off: a barcode read never calls beginShutter, whatever photo consent says', async () => {
  for (const consentPhotos of [false, true]) {
    const { fn, calls } = runOnBarcode({ photoId: false }, consentPhotos);
    await fn({ value: '012345678905', format: 'ean13', frames: 3 });
    assert.deepEqual(calls.beginShutter, [], `photoId off, consent photos=${consentPhotos}: a barcode read sent a frame (D-147)`);
    assert.deepEqual(calls.askPriceFirst, [{ kind: 'barcode', code: '012345678905' }], 'the barcode digits still reach the price pad');
  }
});

test('photoId on and photo consent on: a barcode read still sends the shutter frame', async () => {
  const { fn, calls } = runOnBarcode({ photoId: true }, true);
  await fn({ value: '012345678905', format: 'ean13', frames: 3 });
  assert.deepEqual(calls.beginShutter, [{ tag: 'the-video-element' }], 'the gate is not just a deletion: turning both switches on must still send the frame');
});

test('photoId on but photo consent off: a barcode read still never calls beginShutter', async () => {
  const { fn, calls } = runOnBarcode({ photoId: true }, false);
  await fn({ value: '012345678905', format: 'ean13', frames: 3 });
  assert.deepEqual(calls.beginShutter, [], 'the flag alone let a frame through with no consent');
});

test('the stale "collecting everything" comment defending the unconditional upload is gone', () => {
  const onBarcode = between(CAMERA, '    async function onBarcode(read) {', '    /**\n     * The pad, opened at scan time', 'onBarcode');
  assert.ok(
    !/Collecting everything\s*\n\s*\* means a barcode read is no longer the one path that leaves nothing/.test(onBarcode),
    'the comment defending the old unconditional upload is still here',
  );
  assert.match(onBarcode, /D-147/, 'the replacement comment does not name the defect it fixes');
  assert.match(onBarcode, /2026-09-23/, 'the replacement comment does not cite the ruling that changed this');
});

test('photoId off: submitScanPrice still resolves a barcode the same way', () => {
  const submit = between(CAMERA, '    function submitScanPrice(cents) {', '    async function resolveBarcode(', 'submitScanPrice');
  assert.ok(submit.includes("if (pending.kind === 'barcode') void resolveBarcode(pending.code, scanShelfCents);"));
  assert.ok(!submit.includes('FLAGS'));
});
