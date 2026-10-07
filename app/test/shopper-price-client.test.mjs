/**
 * The shopper's price on the client: what the screens say, and when (D01, D02,
 * D03, D05, D09), against a stubbed fetch and the real modules.
 *
 * The rule under test is the one the walkthrough broke: a screen says
 * "Recorded" or "Written down" or "Noted" only after the server said so. The
 * flow inside camera.js's render closure cannot be clicked through here (the
 * convention in this repo is a source check for that half), so the checks are:
 * the confirmed-send module run for real, the picker's list run for real, the
 * card builders rendered, and the closure's wiring asserted by source.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const CAMERA = read('../public/js/screens/camera.js');
const CORRECT = read('../public/js/screens/correct.js');

/* ------------------------------------------------------------ the stub -- */

let answer = () => ({ stored: true, id: 1 });
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : null });
  const out = answer(String(url));
  if (out instanceof Error) throw out;
  return { ok: true, status: 200, json: async () => out };
};

const store = await import('../public/js/store.js');
const report = await import('../public/js/price-report.js');
const shops = await import('../public/js/shops.js');
const { observationCard, observationNotice, shopperReportLine, feedbackToast, feedbackFailedToast, storePickerSheet } =
  await import('../public/js/screens/camera.js');
const { pt, PRICE_TABLES } = await import('../public/js/price-strings.js');

const FIELDS = {
  code: '0055773000795',
  productId: null,
  label: 'McCain Tasti Taters',
  category: 'grocery',
  amountCents: 549,
  seller: 'Save-On-Foods',
  storeId: null,
  kind: 'regular',
  scanId: 42,
};

/* ----------------------------------------------- D01: confirmed sending -- */

test('D01: the price goes out with its barcode and its scan id, and success is the server\'s word', async () => {
  calls.length = 0;
  answer = () => ({ stored: true, id: 9 });
  const res = await report.fileReport(FIELDS);
  assert.equal(res.stored, true);
  const sent = calls.find((c) => c.url.endsWith('/api/correction')).body;
  assert.equal(sent.code, '0055773000795', 'the barcode did not reach the wire');
  assert.equal(sent.scanId, 42, 'the scan id did not reach the wire');
  assert.equal(sent.priceCents, 549);
  assert.equal(sent.seller, 'Save-On-Foods');
  assert.equal(sent.storeName, 'Save-On-Foods');
  assert.equal(store.pendingCorrections().some((c) => c.clientId === res.entry.clientId), false, 'a stored price is still queued');
});

test('D01: stored:false from the server is reported as not stored, with its reason, never as success', async () => {
  answer = () => ({ stored: false, why: 'a correction needs the shop it was seen in' });
  const res = await report.fileReport({ ...FIELDS, seller: '' });
  assert.equal(res.stored, false);
  assert.equal(res.network, false);
  assert.match(res.why, /shop/);
  // The server judged it and will never take it: it must not sit in the queue to be sent behind the shopper's back.
  assert.equal(store.pendingCorrections().some((c) => c.clientId === res.entry.clientId), false);
});

test('D01: a dead connection is not success, stays queued, and Retry re-sends the SAME client id', async () => {
  calls.length = 0;
  answer = () => new Error('offline');
  const first = await report.fileReport(FIELDS);
  assert.equal(first.stored, false);
  assert.equal(first.network, true);
  assert.equal(store.pendingCorrections().some((c) => c.clientId === first.entry.clientId), true, 'an unsent price was dropped');

  answer = () => ({ stored: true, id: 3 });
  const again = await report.retryReport(first.entry);
  assert.equal(again.stored, true);
  const ids = calls.filter((c) => c.url.endsWith('/api/correction')).map((c) => c.body.clientId);
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1], 'a retry would count as a second witness');
});

test('D01: a screen reached from elsewhere files against the last answer, only while it is recent', () => {
  report.forgetScan();
  assert.equal(report.recalledScan(), null);
  report.rememberScan({ scanId: 7, code: '0055773000795', label: 'Tasti Taters' });
  assert.equal(report.recalledScan().code, '0055773000795');
  // A different scan replaces, so one scan's barcode is never carried onto the next.
  report.rememberScan({ scanId: 8, label: 'Unknown thing' });
  assert.equal(report.recalledScan().code, undefined);
  assert.equal(report.recalledScan().scanId, 8);
  report.forgetScan();
});

test('D01: the camera hands the correction screen the barcode and the scan id', () => {
  const at = CAMERA.indexOf("if (act === 'correct') {");
  assert.notEqual(at, -1);
  const block = CAMERA.slice(at, at + 1800);
  assert.match(block, /ctx\.go\('correct'/);
  assert.match(block, /code\b/);
  assert.match(block, /scanId: lastScanId/);
});

test('D01: the correction screen says "Recorded" only after stored:true', () => {
  assert.doesNotMatch(CORRECT, /submitCorrection\(/, 'the screen still thanks the shopper for a queued write');
  assert.match(CORRECT, /fileReport\(fields\)/);
  assert.match(CORRECT, /if \(res\.stored\) \{[\s\S]*?saved = true;/, '"saved" is set outside the stored branch');
  assert.match(CORRECT, /status = 'failed'/);
  assert.match(CORRECT, /report_retry/);
});

/* --------------------------------------- D02: the price-only card -------- */

test('D02: "Written down" is only on the confirmed card; sending and failed are different sheets', () => {
  const ok = observationCard(549, 'Save-On-Foods', null, null);
  assert.match(ok, /Written down/);
  const sending = observationNotice('sending', 549, 'Save-On-Foods');
  assert.doesNotMatch(sending, /Written down/);
  assert.match(sending, /Sending/);
  const failed = observationNotice('failed', 549, 'Save-On-Foods', null, null, { why: 'a correction needs the shop it was seen in' });
  assert.doesNotMatch(failed, /Written down|Recorded/);
  assert.match(failed, /did not go through/);
  assert.match(failed, /data-act="obs-retry"/);
  const offline = observationNotice('failed', 549, 'Save-On-Foods', null, null, { network: true });
  assert.match(offline, /did not go through/);
  assert.match(offline, /data-act="obs-retry"/);
});

test('D02: the price-only route waits for the server, and a shop is required before it sends', () => {
  const at = CAMERA.indexOf('async function recordObservation');
  const block = CAMERA.slice(at, at + 4200);
  assert.match(block, /if \(!seller\) \{ openShopPicker\(\{ needed: true \}\); return; \}/, 'a price with no shop was sent');
  assert.match(block, /await fileReport\(/);
  assert.match(block, /if \(res\.stored\) \{[\s\S]*?observationCard\(/, 'the card is painted outside the stored branch');
  assert.match(CAMERA, /act === 'obs-retry'/);
});

test('D02: there is no "No shop" choice any more', () => {
  const html = storePickerSheet(shops.pickerShops({}), null);
  assert.doesNotMatch(html, /__none/);
  assert.doesNotMatch(html, /No shop/i);
  assert.doesNotMatch(CAMERA, /data-shop="__none"/);
});

/* -------------------------------------------------- D03: the picker ------ */

test('D03: the picker has the chains at once, with no network and no location', () => {
  const rows = shops.pickerShops({});
  const names = rows.map((r) => r.name);
  for (const n of ['Save-On-Foods', 'No Frills', 'Metro', 'Sobeys', 'Walmart', 'Costco', 'Real Canadian Superstore', 'FreshCo', 'Food Basics', 'Shoppers Drug Mart']) {
    assert.ok(names.includes(n), `${n} is missing from the picker`);
  }
  assert.equal(new Set(rows.map((r) => shops.fold(r.name))).size, rows.length, 'a shop is listed twice');
  assert.ok(rows.every((r) => r.id && !r.id.startsWith('node/')), 'a chain row claims an OpenStreetMap identity');
});

test('D03: the shop used last comes first, then the others used, then nearby, then the chains', () => {
  const known = [
    { id: 'chain:metro', name: 'Metro', hint: '', count: 9, at: '2026-10-01T10:00:00Z' },
    { id: 'chain:nofrills', name: 'No Frills', hint: '', count: 2, at: '2026-10-05T10:00:00Z' },
  ];
  const nearby = [{ id: 'node/1', name: 'Corner Market', hint: '1 Main St' }];
  const rows = shops.pickerShops({ known, nearby });
  assert.equal(rows[0].name, 'No Frills', 'the last-used shop is not first');
  assert.equal(rows[1].name, 'Metro');
  assert.equal(rows[2].name, 'Corner Market');
  assert.equal(rows.filter((r) => r.name === 'Metro').length, 1, 'a used chain is listed twice');
});

test('D03: the search box narrows the list, folds accents, and offers a typed name when nothing matches', () => {
  const rows = shops.pickerShops({ query: 'marche adonis' });
  assert.equal(rows[0].name, 'Marché Adonis');
  const custom = shops.pickerShops({ query: "Joe's Corner Store" });
  assert.equal(custom.length, 1);
  assert.equal(custom[0].custom, true);
  assert.equal(custom[0].name, "Joe's Corner Store");
  assert.match(custom[0].id, /^text:/);
  // A typed name that IS on the list is not offered a second time.
  assert.equal(shops.pickerShops({ query: 'costco' }).some((r) => r.custom), false, '"costco" is on the list, so it is not offered again as typed text');
});

test('D03: a typed name that matches a listed shop exactly is that shop, not a second one', () => {
  const rows = shops.pickerShops({ query: 'Save-On-Foods' });
  assert.equal(rows.filter((r) => r.custom).length, 0);
  assert.equal(rows[0].name, 'Save-On-Foods');
});

test('D03: a lookup slower than the deadline does not hold the list', async () => {
  store.setConsent({ location: true });
  const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { geolocation: { getCurrentPosition() { /* never answers */ } } },
  });
  try {
    const started = Date.now();
    const nearby = await shops.nearbyWithin(80);
    assert.deepEqual(nearby, []);
    assert.ok(Date.now() - started < 1000, 'the picker waited on a lookup that never answered');
  } finally {
    if (had) Object.defineProperty(globalThis, 'navigator', had);
    else delete globalThis.navigator;
  }
});

test('D03: the picker opens before it asks the network for anything', () => {
  const at = CAMERA.indexOf('function openShopPicker(');
  assert.notEqual(at, -1);
  const block = CAMERA.slice(at, at + 2400);
  assert.doesNotMatch(block.split('void shops.refreshChains')[0], /await /, 'the sheet is painted after an await');
  assert.match(block, /storePickerSheet\(shopList/);
  assert.match(block, /shops\.nearbyWithin\(1500\)/);
});

test('D03: the server\'s chain list swaps in, and a bad one is ignored', () => {
  const before = shops.chainNames();
  shops.setChains([]);
  shops.setChains(null);
  assert.deepEqual(shops.chainNames(), before);
  shops.setChains([{ name: 'Test Mart' }, { name: '  ' }, 5]);
  assert.deepEqual(shops.chainNames(), ['Test Mart']);
  shops.setChains(before);
});

/* ----------------------------------------- D05: the pad's price is sent -- */

test('D05: the pad price is filed against the scan from the three places that learn its id', () => {
  assert.equal(CAMERA.split('lastScanId = id.scanId; fileShelfPrice(id);').length - 1, 3);
  const at = CAMERA.indexOf('function fileShelfPrice(');
  const block = CAMERA.slice(at, at + 1800);
  assert.match(block, /postScanPrice/);
  assert.match(block, /priceCents: cents/);
  assert.match(block, /scanId,/);
});

test('D05: postScanPrice sends the scan id, the price and the shop to /api/scan-price', async () => {
  const api = await import('../public/js/api.js');
  calls.length = 0;
  answer = () => ({ stored: true, onScan: true, report: { stored: true, id: 1 } });
  const res = await api.postScanPrice({ deviceId: 'd', scanId: 5, priceCents: 549, storeName: 'Save-On-Foods', code: '0055773000795', seenOn: '2026-10-06' });
  assert.equal(res.stored, true);
  const sent = calls.find((c) => c.url.endsWith('/api/scan-price')).body;
  assert.deepEqual(sent, { deviceId: 'd', scanId: 5, priceCents: 549, storeName: 'Save-On-Foods', code: '0055773000795', seenOn: '2026-10-06' });
  // Soft: a dead connection is stored:false, not a throw into a screen.
  answer = () => new Error('offline');
  assert.deepEqual(await api.postScanPrice({ deviceId: 'd', scanId: 5, priceCents: 549 }), { stored: false });
});

/* --------------------------------------------- D06: the report line ------ */

test('D06: the line under the chart says the shopper\'s own report exists and what it waits for', () => {
  const waiting = shopperReportLine({ cents: 549, store: 'Save-On-Foods', seenOn: '2026-10-06', status: 'waiting_for_second_source' }, 'CAD');
  assert.match(waiting, /Your report: \$5\.49 at Save-On-Foods, counts once a second source agrees/);
  const agreed = shopperReportLine({ cents: 549, store: 'Save-On-Foods', seenOn: '2026-10-06', status: 'second_source_agrees' }, 'CAD');
  assert.match(agreed, /a second source agrees/);
  assert.doesNotMatch(agreed, /counts once/);
  assert.equal(shopperReportLine(null, 'CAD'), '');
  assert.equal(shopperReportLine({ cents: 549, store: '' }, 'CAD'), '');
  // The shop name is a person's or a map's string: escaped.
  assert.doesNotMatch(shopperReportLine({ cents: 1, store: '<img src=x onerror=1>' }, 'CAD'), /<img/);
});

test('D06: the distribution sheet draws the line and the answers hand it through', () => {
  assert.match(CAMERA, /\$\{shopperReportLine\(shopperReport, v\.currency\)\}/);
  assert.equal(CAMERA.split('shopperReport: answer.shopperReport ?? null').length - 1, 1);
  assert.equal(CAMERA.split('shopperReport: id.shopperReport ?? null').length - 1, 1);
  assert.equal(CAMERA.split('shopperReport: result.shopperReport ?? null').length - 1, 1);
});

/* ------------------------------------------------------- D09: thumbs ---- */

test('D09: a thumb is sent for every answer kind and "Noted" waits for the server', () => {
  assert.doesNotMatch(CAMERA, /ratedScan = last\?\.result\?\.kind === 'gemini'/);
  const at = CAMERA.indexOf('async function sendThumb(');
  const block = CAMERA.slice(at, at + 1700);
  assert.match(block, /await ctx\.api\.postScanRating/);
  assert.match(block, /if \(res\?\.stored === true\) \{[\s\S]*?feedbackToast\(/, '"Noted" is painted outside the stored branch');
  assert.match(block, /feedbackFailedToast\(\)/);
  // The four-second undo is kept.
  assert.match(block, /setTimeout\(\(\) => \{ toastSlot\.innerHTML = ''; \}, 4000\)/);
});

test('D09: thumbs-down offers the four reasons the server knows, one tap each', () => {
  const down = feedbackToast({ askReason: true });
  for (const r of ['wrong_product', 'wrong_price', 'no_price', 'too_slow']) {
    assert.match(down, new RegExp(`data-reason="${r}"`));
  }
  assert.match(down, /data-act="thumbs-undo"/);
  const up = feedbackToast();
  assert.doesNotMatch(up, /data-reason/);
  const failed = feedbackFailedToast();
  assert.match(failed, /did not go through/);
  assert.match(failed, /data-act="thumbs-retry"/);
  assert.doesNotMatch(failed, /Noted/);
});

/* --------------------------------------------------------- languages ---- */

test('both languages carry the same keys, and French has no English left in it', () => {
  assert.deepEqual(Object.keys(PRICE_TABLES.en).sort(), Object.keys(PRICE_TABLES.fr).sort());
  for (const [key, value] of Object.entries(PRICE_TABLES.fr)) {
    if (typeof value !== 'string') continue;
    assert.notEqual(value, PRICE_TABLES.en[key], `${key} is untranslated`);
  }
  assert.equal(pt('nonexistent_key'), 'nonexistent_key', 'a missing key must report itself');
});
