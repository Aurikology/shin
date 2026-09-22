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

test('onboarding off: a fresh install goes Consent then Camera, and never to setup', () => {
  assert.equal(firstScreen({}), 'consent');
  assert.equal(firstScreen({ consentSeen: true }), 'camera');
  assert.equal(firstScreen({ onboarding: { doneAt: 'x' }, consentSeen: false }), 'consent');
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
  assert.match(html, /data-manage-sub/);
  assert.match(html, /Manage subscription/);
  assert.match(html, /data-quota-row hidden/, 'the quota row must wait for the server');

  applyFlags({ ...FLAGS, languages: true, market: true });
  const on = youMarkup();
  assert.ok(on.includes('data-locale="fr"') && on.includes('data-act="market"'), 'switching the flags back on did not bring the rows back');
  applyFlags();
});

test('Manage subscription opens the store the phone uses, and the quota line shows only a real limit', () => {
  const { manageSubscriptionUrl, quotaText } = youModule;
  assert.equal(manageSubscriptionUrl({ Capacitor: { getPlatform: () => 'ios' } }), 'https://apps.apple.com/account/subscriptions');
  assert.equal(manageSubscriptionUrl({ Capacitor: { getPlatform: () => 'android' } }), 'https://play.google.com/store/account/subscriptions');
  assert.equal(manageSubscriptionUrl({ navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' } }), 'https://apps.apple.com/account/subscriptions');
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

test('photoId off: the barcode path is the one it was', () => {
  const onBarcode = between(CAMERA, '    async function onBarcode(read) {', '    function askPriceFirst(pending) {', 'onBarcode');
  assert.ok(onBarcode.includes("askPriceFirst({ kind: 'barcode', code: read.value });"));
  assert.ok(!onBarcode.includes('FLAGS'), 'the barcode read now depends on the photo switch');
  const submit = between(CAMERA, '    function submitScanPrice(cents) {', '    async function resolveBarcode(', 'submitScanPrice');
  assert.ok(submit.includes("if (pending.kind === 'barcode') void resolveBarcode(pending.code, scanShelfCents);"));
  assert.ok(!submit.includes('FLAGS'));
});
