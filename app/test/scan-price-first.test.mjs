/**
 * Item 10 and the client half of item 6, 2026-09-17.
 *
 * Item 10, his words: "asking the user for the price as soon as they scan
 * instead of waiting for a product identificaiton first. This way, the price
 * can get sent to gemini along with the rest of the prompt." So the price pad
 * opens at scan time, before anything is identified, and the price rides in the
 * scan request as `shelfPriceCents`. Skipping the price still gets an answer.
 *
 * Item 6 (client half): "These thresholds are crucial and non negotiable".
 * Every scan request carries `thresholds`, the object exactly as store.js holds
 * it (`lineUnderPct`, `lineOverPct`); a user with none set sends nothing and the
 * server defaults. The server reads both field names.
 *
 * The request-building half runs the real api.js against a stubbed fetch. The
 * flow half is source-asserted (the convention for anything inside camera.js's
 * render closure; mini-dom cannot click through it). That the pad opens and the
 * request leaves on a real phone is NOT verified here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

/** A slice between two literal markers that FAILS LOUDLY when a marker moves. */
function between(text, from, to, what) {
  const a = text.indexOf(from);
  assert.notEqual(a, -1, `${what}: the opening marker ${JSON.stringify(from)} is gone`);
  const b = text.indexOf(to, a + from.length);
  assert.notEqual(b, -1, `${what}: the closing marker ${JSON.stringify(to)} is gone`);
  return text.slice(a, b);
}

const { thresholdsFrom, shelfPriceOf } = await import('../public/js/lib/scan-body.js');

test('thresholds are the two fields the store holds, or nothing at all', () => {
  assert.deepEqual(thresholdsFrom({ lineUnderPct: 15, lineOverPct: 20 }), { lineUnderPct: 15, lineOverPct: 20 });
  assert.equal(thresholdsFrom({}), undefined, 'a user with none set must send nothing');
  assert.equal(thresholdsFrom({ lineUnderPct: null, lineOverPct: 'x' }), undefined);
  assert.equal(thresholdsFrom(undefined), undefined);
  // One set and one not: send what exists rather than inventing the other.
  assert.deepEqual(thresholdsFrom({ lineUnderPct: 5 }), { lineUnderPct: 5 });
});

test('a shelf price is whole positive cents or absent', () => {
  assert.equal(shelfPriceOf(499), 499);
  for (const bad of [0, -5, 4.99, '499', null, undefined, NaN]) assert.equal(shelfPriceOf(bad), undefined, String(bad));
});

/* --------------------------------------- the real api.js against a stub fetch */

const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return { ok: true, status: 200, json: async () => ({ product: null }) };
};
const store = await import('../public/js/store.js');
const api = await import('../public/js/api.js');

test('identify carries the shelf price and the thresholds', async () => {
  store.update({ lineUnderPct: 15, lineOverPct: 20 });
  calls.length = 0;
  await api.identify({ gtin: '0123456789012', shelfPriceCents: 499 });
  const u = new URL(calls[0].url, 'http://x');
  assert.equal(u.searchParams.get('shelfPriceCents'), '499', 'the shelf price did not ride in the scan request');
  assert.deepEqual(JSON.parse(u.searchParams.get('thresholds')), { lineUnderPct: 15, lineOverPct: 20 });
  assert.equal(u.searchParams.get('gtin'), '0123456789012');
});

test('a skipped price sends no price and still sends the request', async () => {
  calls.length = 0;
  await api.identify({ gtin: '0123456789012' });
  const u = new URL(calls[0].url, 'http://x');
  assert.equal(u.searchParams.has('shelfPriceCents'), false, 'a missing price was sent as something');
  assert.equal(u.searchParams.get('gtin'), '0123456789012');
});

test('a user with no thresholds sends none', async () => {
  store.update({ lineUnderPct: undefined, lineOverPct: undefined });
  calls.length = 0;
  await api.identify({ gtin: '0123456789012', shelfPriceCents: 100 });
  const u = new URL(calls[0].url, 'http://x');
  assert.equal(u.searchParams.has('thresholds'), false, 'the client invented thresholds the user never set');
  store.update({ lineUnderPct: 10, lineOverPct: 10 });
});

test('the photo request carries both too, in its body', async () => {
  store.update({ lineUnderPct: 5, lineOverPct: 15 });
  calls.length = 0;
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: 'image/jpeg' });
  await api.identifyPhoto(blob, { sharpness: 0.5, shelfPriceCents: 249 });
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.shelfPriceCents, 249);
  assert.deepEqual(body.thresholds, { lineUnderPct: 5, lineOverPct: 15 });
  calls.length = 0;
  await api.identifyPhoto(blob, {});
  assert.equal('shelfPriceCents' in JSON.parse(calls[0].init.body), false, 'a skipped price was sent on the photo route');
  store.update({ lineUnderPct: 10, lineOverPct: 10 });
});

test('the price call carries the thresholds and lets the caller win', async () => {
  store.update({ lineUnderPct: 15, lineOverPct: 20 });
  calls.length = 0;
  await api.price({ text: 'x' });
  assert.deepEqual(JSON.parse(calls[0].init.body).thresholds, { lineUnderPct: 15, lineOverPct: 20 });
  calls.length = 0;
  await api.price({ text: 'x', thresholds: { lineUnderPct: 1, lineOverPct: 2 } });
  assert.deepEqual(JSON.parse(calls[0].init.body).thresholds, { lineUnderPct: 1, lineOverPct: 2 });
  store.update({ lineUnderPct: 10, lineOverPct: 10 });
});

/* ------------------------------------------------ the flow, from the source */

const SCREEN = read('../public/js/screens/camera.js');

test('a barcode press opens the pad BEFORE anything is identified', () => {
  const fn = between(SCREEN, '    async function onBarcode(read) {', '    /**\n     * The pad, opened at scan time', 'onBarcode');
  assert.ok(fn.includes("askPriceFirst({ kind: 'barcode', code: read.value })"), 'the barcode read no longer opens the pad first');
  assert.ok(!/catalogueLookup|api\.identify|proceed\(/.test(fn), 'onBarcode identifies or prices before the price is asked');
});

test('a photo capture opens the pad BEFORE the crop is sent', () => {
  const fn = between(SCREEN, '    function handlePhotoCapture(crop) {', '    /** The photo\'s identification', 'handlePhotoCapture');
  assert.ok(fn.includes("askPriceFirst({ kind: 'photo', crop })"), 'the photo capture no longer opens the pad first');
  assert.ok(!/identifyPhoto/.test(fn), 'the crop is sent before the price is asked');
});

test('the price rides in the scan request on both routes', () => {
  assert.ok(SCREEN.includes('async function catalogueLookup(code, shelfPriceCents)'), 'the barcode lookup takes no price');
  assert.ok(SCREEN.includes('ctx.api.identify({ gtin: code, shelfPriceCents })'), 'the price is not passed to identify');
  assert.ok(
    SCREEN.includes('ctx.api.identifyPhoto(crop.blob, { sharpness: crop.sharpness, shelfPriceCents: cents ?? undefined })'),
    'the price is not passed to the photo route',
  );
});

test('confirming and skipping BOTH send the scan, so skipping still gets an answer', () => {
  const confirm = between(SCREEN, "if (act === 'pad-confirm') {", "if (act === 'pad-skip') {", 'pad-confirm');
  assert.ok(confirm.includes('if (padItem?.pendingScan) { submitScanPrice(cents); return; }'), 'confirm does not send the scan');
  const skip = between(SCREEN, "if (act === 'pad-skip') {", "if (act === 'priceonly') {", 'pad-skip');
  assert.ok(skip.includes('if (padItem?.pendingScan) { submitScanPrice(null); return; }'), 'skip does not send the scan: a skipped price would get NO answer');
  const submit = between(SCREEN, '    function submitScanPrice(cents) {', '    /** The barcode\'s identification', 'submitScanPrice');
  assert.ok(submit.includes('resolveBarcode(pending.code, scanShelfCents)') && submit.includes('resolvePhoto(pending.crop, scanShelfCents)'),
    'submitScanPrice does not send both kinds of scan');
});

test('once identified, the shopper is not asked for the price a second time', () => {
  const photo = between(SCREEN, '    async function resolvePhoto(crop, cents) {', '    /** Every photo-route refusal', 'resolvePhoto');
  assert.ok(!/openPad\(/.test(photo), 'the photo route still opens a second pad after identification');
  assert.equal((photo.match(/proceed\(/g) ?? []).length, 2, 'both identity outcomes should go straight to the answer');
  const barcode = between(SCREEN, '    async function resolveBarcode(code, cents) {', '    /**\n     * A barcode to something `proceed` can price', 'resolveBarcode');
  assert.ok(barcode.includes('proceed({ ...found, scannedGtin: code }, cents ?? undefined)'), 'the barcode answer drops the price');
  const open = between(SCREEN, '    function openPad(item, { force = false } = {}) {', '      padItem = item;', 'openPad');
  assert.ok(open.includes('scanShelfCents !== null') && open.includes('proceed(item, scanShelfCents)'),
    'a later identity (a candidate pick) would ask for the price again');
});

test('the going-rate card can still reopen the pad after a skip', () => {
  assert.ok(SCREEN.includes("openPad(last.scenario, { force: true })"), 'a skipped price can no longer be given afterwards');
});
