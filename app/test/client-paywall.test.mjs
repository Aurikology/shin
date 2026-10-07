/**
 * Pexi Plus on the client (2026-09-21, docs/mvp-plan.md "Subscription"):
 * the 402 from /api/identify becomes the subscription screen, the screen reads
 * its prices from the store and never from the code, and a plain browser gets
 * "Subscribe in the app" instead of a button that could only fail.
 *
 * Each test here was run once against a deliberately broken client and seen to
 * fail before it was trusted (the 402 branch removed from api.js; the paywall
 * route left out of main.js; the browser check removed from paywall.js; a
 * price string hard-coded in place of the store's).
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

/** A slice between two literal markers that fails loudly rather than running away. */
function between(text, from, to, what) {
  const a = text.indexOf(from);
  assert.notEqual(a, -1, `${what}: the opening marker is gone`);
  const b = text.indexOf(to, a + from.length);
  assert.notEqual(b, -1, `${what}: the closing marker is gone`);
  return text.slice(a, b);
}

const calls = [];
let reply = { status: 200, body: {} };
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body };
};

const api = await import('../public/js/api.js');
const purchases = await import('../public/js/purchases.js');
const paywall = (await import('../public/js/screens/paywall.js')).default;
const { paywallBody, limitLine } = await import('../public/js/screens/paywall.js');
const { TABLES } = await import('../public/js/ui-strings.js');

/* ------------------------------------------------------ 1. the 402 route */

test('a 402 scan_limit from /api/identify is an answer with the counts, not a throw', async () => {
  reply = { status: 402, body: { error: 'scan_limit', limit: 10, used: 10, resetsAt: '2026-09-28T00:00:00.000Z' } };
  const out = await api.identify({ gtin: '0123456789012' });
  assert.deepEqual(out, { product: null, failure: 'scan_limit', limit: 10, used: 10, resetsAt: '2026-09-28T00:00:00.000Z' });
  reply = { status: 402, body: null };
  const bare = await api.identify({ gtin: '0123456789012' });
  assert.equal(bare.failure, 'scan_limit', 'a 402 with no body is still the limit');
  assert.equal(bare.limit, null);
  reply = { status: 500, body: {} };
  await assert.rejects(api.identify({ gtin: '0123456789012' }), 'a 500 must still throw, it is not the limit');
});

test('every request carries the device id header, and x-shin-plus only once Plus is active', async () => {
  reply = { status: 200, body: {} };
  calls.length = 0;
  await api.identify({ gtin: '0123456789012' });
  const h = calls[0].init.headers;
  assert.match(h['x-shin-device'], /^[0-9a-f-]{36}$/, 'no x-shin-device header');
  assert.equal(h['x-shin-plus'], undefined, 'a device that never bought Plus claims it');
  storage.setItem('shin.plus', '1');
  calls.length = 0;
  await api.identify({ gtin: '0123456789012' });
  assert.equal(calls[0].init.headers['x-shin-plus'], '1');
  storage.setItem('shin.plus', '0');
});

test('the camera opens the paywall with the server counts on scan_limit, on the barcode and typed routes', () => {
  // The barcode route: catalogueLookup hands the limit up, resolveBarcode opens the screen
  // before the offline and product branches can answer instead.
  const lookup = between(CAMERA, '    async function catalogueLookup(', '    /*\n     * Row 47', 'catalogueLookup');
  assert.ok(lookup.includes("if (id?.failure === 'scan_limit') return { scanLimit: id };"), 'catalogueLookup drops the limit');
  const resolve = between(CAMERA, '    async function resolveBarcode(', '    async function catalogueLookup(', 'resolveBarcode');
  const open = resolve.indexOf('if (found?.scanLimit) { openPaywall(found.scanLimit); return; }');
  assert.ok(open > -1, 'resolveBarcode does not open the paywall');
  assert.ok(open < resolve.indexOf('if (found?.needsConnection)'), 'the limit is read after the offline branch, which would answer first');
  const typed = between(CAMERA, '    async function runTypedSearch(', '          if (id.catalogueUp && id.product) {', 'runTypedSearch');
  assert.ok(typed.includes("if (id?.failure === 'scan_limit') { openPaywall(id); return; }"), 'the typed route does not open the paywall');

  // And openPaywall itself, run: the scan is reset and the screen gets the counts.
  const body = between(CAMERA, '    function openPaywall(limit) {', '    function reset() {', 'openPaywall');
  const log = [];
  // `track`, `reset` and `ctx` are closure variables of the real render; they
  // are handed in under the same names.
  const openPaywall = new Function('deps', `const { track, reset, ctx } = deps; ${body}; return openPaywall;`)({
    track: (name, p) => log.push(['track', name, p]),
    reset: () => log.push(['reset']),
    ctx: { go: (id, params) => log.push(['go', id, params]) },
  });
  openPaywall({ failure: 'scan_limit', limit: 10, used: 10, resetsAt: '2026-09-28T00:00:00.000Z' });
  assert.deepEqual(log, [
    ['track', 'scan_limit_hit', { limit: 10, used: 10 }],
    ['reset'],
    ['go', 'paywall', { limit: 10, used: 10, resetsAt: '2026-09-28T00:00:00.000Z' }],
  ]);
});

test('main.js registers the paywall screen', () => {
  const main = read('../public/js/main.js');
  assert.match(main, /import paywall from '\.\/screens\/paywall\.js'/);
  assert.match(main, /for \(const s of \[[^\]]*\bpaywall\b[^\]]*\]\)/);
  assert.equal(paywall.id, 'paywall');
});

/* ------------------------------------------------------- 2. the screen */

/** A root whose one query the screen makes after its first paint is answerable. */
function stubRoot() {
  const body = { innerHTML: '' };
  const listeners = [];
  return {
    innerHTML: '',
    body,
    listeners,
    querySelector: (sel) => (sel === '[data-pw-body]' ? body : null),
    addEventListener: (type, fn) => listeners.push({ type, fn }),
    removeEventListener: () => {},
    tap(sel, dataset = {}) {
      const target = { closest: (s) => (s === sel ? { dataset } : null) };
      for (const l of listeners) if (l.type === 'click') l.fn({ target });
    },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

test('in a plain browser the screen says "Subscribe in the app" and offers nothing that could only fail', async () => {
  const root = stubRoot();
  const stop = paywall.render(root, { params: { limit: '10', resetsAt: '2026-09-28T12:00:00.000Z' }, go() {}, win: {} });
  await settle();
  assert.match(root.body.innerHTML, /data-pw-state="web"/);
  assert.match(root.body.innerHTML, /Subscribe in the app/);
  assert.ok(!/data-act="subscribe"|data-act="restore"/.test(root.body.innerHTML), 'a browser was offered a store button');
  assert.match(root.innerHTML, /Pexi Plus: unlimited scans/);
  assert.match(root.innerHTML, /class="shin-say"/, 'the mascot is not on the screen');
  assert.match(root.innerHTML, /data-act="close"/, 'no close button');
  assert.match(root.innerHTML, /data-pw-terms/);
  assert.match(root.innerHTML, /data-pw-privacy/);
  assert.match(root.innerHTML, /The 10 free scans for this week are used\./);
  stop();
});

/** A wrapped app with RevenueCat's native plugin, answering with store prices. */
function nativeWin({ entitled = true } = {}) {
  const log = [];
  const pkg = (id, price) => ({ identifier: id, product: { identifier: id, priceString: price } });
  const monthly = pkg('shin_plus_monthly', 'CA$4.49');
  const yearly = pkg('shin_plus_yearly:annual', 'CA$31.99');
  const info = { entitlements: { active: entitled ? { plus: { identifier: 'plus' } } : {} } };
  const Purchases = {
    configure: async (o) => { log.push(['configure', o]); },
    getOfferings: async () => { log.push(['getOfferings']); return { current: null, all: { default: { availablePackages: [monthly, yearly] } } }; },
    purchasePackage: async (o) => { log.push(['purchasePackage', o.aPackage.identifier]); return { customerInfo: info }; },
    restorePurchases: async () => { log.push(['restorePurchases']); return { customerInfo: info }; },
    getCustomerInfo: async () => ({ customerInfo: info }),
  };
  return {
    log,
    win: {
      SHIN_RC_KEYS: { ios: 'appl_test_public', android: '' },
      Capacitor: { getPlatform: () => 'ios', isPluginAvailable: (n) => n === 'Purchases', Plugins: { Purchases } },
    },
  };
}

test('in the app the two plans show the store price strings exactly, and Subscribe buys the chosen one', async () => {
  purchases.resetPurchasesForTests();
  storage.setItem('shin.plus', '0');
  const { win, log } = nativeWin();
  const root = stubRoot();
  const stop = paywall.render(root, { params: {}, go() {}, win });
  await settle();
  const html = root.body.innerHTML;
  assert.match(html, /data-pw-state="plans"/);
  assert.match(html, /CA\$4\.49 a month/, 'the monthly price is not the store string');
  assert.match(html, /CA\$31\.99 a year/, 'the yearly price is not the store string');
  assert.match(html, /data-act="subscribe"/);
  assert.match(html, /data-act="restore"/, 'no Restore purchases');
  const configured = log.find((l) => l[0] === 'configure')[1];
  assert.equal(configured.apiKey, 'appl_test_public');
  assert.match(configured.appUserID, /^[0-9a-f-]{36}$/, 'RevenueCat is not configured with the device id');
  assert.equal(configured.appUserID, storage.getItem('shin.deviceId'), 'the app user id is not the device id the API sends');

  root.tap('[data-plan]', { plan: 'yearly' });
  root.tap('[data-act="subscribe"]');
  await settle(); await settle();
  assert.ok(log.some((l) => l[0] === 'purchasePackage' && l[1] === 'shin_plus_yearly:annual'), 'Subscribe did not buy the chosen plan');
  assert.match(root.body.innerHTML, /data-pw-state="done"/);
  assert.equal(purchases.plusActive(), true, 'an active entitlement was not remembered');
  // The Buy tap and its outcome, tracked so a two-week readout can count
  // "would pay" against a scan that never got the money.
  const tracked = JSON.parse(storage.getItem('shin.track.queue') || '[]').filter((e) => e.type === 'paywall_buy');
  assert.ok(tracked.some((e) => e.payload.plan === 'yearly' && e.payload.outcome === 'tapped'), 'the Buy tap was not tracked');
  assert.ok(tracked.some((e) => e.payload.plan === 'yearly' && e.payload.outcome === 'done'), 'the Buy outcome was not tracked');
  stop();
  storage.setItem('shin.plus', '0');
});

test('Restore purchases asks the store, and says so when nothing was found', async () => {
  purchases.resetPurchasesForTests();
  const { win, log } = nativeWin({ entitled: false });
  const root = stubRoot();
  const stop = paywall.render(root, { params: {}, go() {}, win });
  await settle();
  root.tap('[data-act="restore"]');
  await settle(); await settle();
  assert.ok(log.some((l) => l[0] === 'restorePurchases'));
  assert.match(root.body.innerHTML, /No Pexi Plus subscription was found/);
  assert.equal(purchases.plusActive(), false);
  const tracked = JSON.parse(storage.getItem('shin.track.queue') || '[]').filter((e) => e.type === 'paywall_restore');
  assert.ok(tracked.some((e) => e.payload.outcome === 'tapped'), 'the Restore tap was not tracked');
  assert.ok(tracked.some((e) => e.payload.outcome === 'failed'), 'the no-subscription-found outcome was not tracked');
  stop();
});

test('no price and no savings claim is written into the client', () => {
  for (const rel of ['../public/js/screens/paywall.js', '../public/js/plus-config.js', '../public/js/purchases.js']) {
    const src = read(rel);
    assert.ok(!/[$€£]\s?\d|\d+[.,]\d\d\s?(\$|CAD|USD)/.test(src), `${rel} hard-codes a price`);
  }
  // Hard rule 2: nothing on the screen says what Plus is worth or saves.
  const words = /sav(e|es|ed|ing|ings)\b|pays? for itself|worth|économ|rentab/i;
  for (const lang of ['en', 'fr']) {
    for (const [k, v] of Object.entries(TABLES[lang])) {
      if (!k.startsWith('paywall_')) continue;
      const text = typeof v === 'function' ? v({ limit: '10', when: 'Monday', price: 'X' }) : v;
      assert.ok(!words.test(text), `${lang}.${k} makes a savings claim: ${text}`);
    }
  }
  /* D30: it only says the scans are used when they were. */
  assert.equal(limitLine({}), '', 'opened by hand, nothing was used and nothing is said');
  assert.equal(limitLine({ limit: '5', used: '0' }), '5 of 5 free scans left this week');
  assert.equal(limitLine({ limit: '5', used: '2' }), '3 of 5 free scans left this week');
  assert.match(limitLine({ limit: '5', used: '5' }), /^The 5 free scans for this week are used\./);
  assert.match(limitLine({ limit: '5' }), /are used\./, 'a refused scan sends the limit without a count');
  assert.ok(!/data-act="subscribe"/.test(paywallBody('web')));
});
