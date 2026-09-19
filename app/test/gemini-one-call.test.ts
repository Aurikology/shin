/**
 * THE ONE GEMINI CALL, over a real socket, with a recorded Gemini.
 *
 * Beta gap items 1 to 6, 12 and 14 (docs/beta-gaps-2026-09-19.md). Nothing
 * reaches Google: the transport is a fake that records every request, which is
 * also how "one call per scan" is counted rather than asserted by reading code.
 * Each behaviour has its negative beside it, so a regression is visible.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { fakeTransport, goodAnswer, httpBody, type Call } from './gemini-double.ts';

const dir = mkdtempSync(join(tmpdir(), 'shin-one-call-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
process.env.GEMINI_API_KEY = 'test-key-never-sent-anywhere';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_GEMINI_MODEL;
delete process.env.SHIN_MODEL_PROVIDER;

const { server, setGeminiTransportForTests, setSpendGuardForTests, setCatalogueForTests, settleBackgroundChecks } = await import('../server.ts');
const { getScan, geminiCallsForScan, openScanStore } = await import('../src/scans.ts');
const { modelForScan } = await import('../../identify/src/providers/gemini-scan.ts');

let port = 0;
let calls: Call[] = [];
let reply: Parameters<typeof fakeTransport>[0];
const base = () => `http://127.0.0.1:${port}`;

function install(fn?: Parameters<typeof fakeTransport>[0]) {
  const t = fakeTransport(fn);
  calls = t.calls;
  setGeminiTransportForTests(t.transport);
}

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  openScanStore(process.env.SHIN_SCANS);
});
beforeEach(() => {
  setSpendGuardForTests(null);
  install(reply);
});
after(async () => {
  setGeminiTransportForTests(null);
  setCatalogueForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the scan database is still open on Windows; the OS will take the temp dir */
  }
});

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

const identify = (q: string) => fetch(`${base()}/api/identify?${q}`).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));
const post = (path: string, body: unknown) =>
  fetch(`${base()}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(
    async (r) => ({ status: r.status, body: (await r.json()) as any }),
  );
const userTurn = (c: Call): string => {
  const input = c.body.input;
  return typeof input === 'string' ? input : (input as any[]).filter((p) => p.type === 'text').map((p) => p.text).join('\n');
};
/** A device id whose stable hash lands on the family asked for. */
function deviceOn(family: '2.5' | '3.x', tag: string): string {
  for (let i = 0; i < 500; i++) {
    const id = `${tag}-${i}`;
    if (modelForScan(id, {}).family === family) return id;
  }
  throw new Error('no device found');
}

test('a barcode scan is ONE Gemini call, digits only, and Shin\'s own catalogue is not consulted for the answer (items 1, 2)', async () => {
  let asked = 0;
  setCatalogueForTests({
    byGtin: () => {
      asked += 1;
      return { code: '0068100084245', name: 'CATALOGUE NAME', brands: 'X', quantity: '1', sizeValue: 1, sizeUnit: 'g', soldInCanada: true };
    },
  });
  const device = deviceOn('2.5', 'one');
  const { status, body } = await identify(`gtin=0068100084245&deviceId=${device}`);
  assert.equal(status, 200);
  assert.equal(calls.length, 1, 'a scan must make exactly one Gemini call');
  assert.equal(asked, 0, 'the catalogue was consulted for a scan');
  assert.equal(body.product, null, 'a catalogue product answered');
  assert.equal(body.unchecked.name, 'Kraft Dinner Original', 'the answer is Gemini\'s');
  const parts = calls[0].body.input;
  assert.ok(typeof parts === 'string' || !(parts as any[]).some((p) => p.type === 'image'), 'a barcode scan sent an image');
  assert.match(userTurn(calls[0]), /0068100084245/);
  setCatalogueForTests(null);
});

test('no Claude: the request goes to the Gemini endpoint with a Gemini model, and nothing else is called (item 1)', async () => {
  await identify(`gtin=0068100084245&deviceId=${deviceOn('3.x', 'claude')}`);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
  assert.match(String(calls[0].body.model), /^gemini-/);
});

test('2.5 asks for the JSON in the prompt text and sends no schema; 3.x sends the schema (item 5)', async () => {
  await identify(`gtin=1&deviceId=${deviceOn('2.5', 'a')}`);
  await identify(`gtin=2&deviceId=${deviceOn('3.x', 'b')}`);
  const [c25, c3] = calls;
  assert.match(String(c25.body.model), /2\.5/);
  assert.equal(c25.body.response_format, undefined, 'a response schema was sent together with google_search on 2.5');
  assert.deepEqual(c25.body.tools, [{ type: 'google_search' }]);
  assert.match(userTurn(c25), /Return ONLY one JSON object/);
  assert.match(String(c3.body.model), /^gemini-3/);
  assert.ok(c3.body.response_format, '3.x should be sent the schema');
  assert.deepEqual(c3.body.tools, [{ type: 'google_search' }]);
});

test('the model is picked deterministically per device, both are used, and the env override wins (item 4)', async () => {
  const a = deviceOn('2.5', 'det');
  const b = deviceOn('3.x', 'det');
  for (const d of [a, b, a, b]) await identify(`gtin=9&deviceId=${d}`);
  assert.deepEqual(
    calls.map((c) => String(c.body.model)),
    [modelForScan(a, {}).model, modelForScan(b, {}).model, modelForScan(a, {}).model, modelForScan(b, {}).model],
  );
  assert.notEqual(calls[0].body.model, calls[1].body.model);
  assert.equal(modelForScan('anything', {}).model.startsWith('gemini-2.5') || modelForScan('anything', {}).family === '3.x', true);
  assert.equal(modelForScan(a, { SHIN_GEMINI_MODEL: 'gemini-9-test' }).model, 'gemini-9-test');
});

test('every Gemini request and the full response are stored, linked to the scan and to the model (item 12)', async () => {
  const device = deviceOn('3.x', 'store');
  const { body } = await identify(`gtin=0068100084245&deviceId=${device}`);
  const rows = geminiCallsForScan(body.scanId);
  assert.equal(rows.length, 1, 'no stored Gemini call for the scan');
  const row = rows[0];
  assert.equal(row.model, calls[0].body.model, 'the row does not name the model that answered');
  assert.equal(row.model_family, '3.x');
  assert.equal(row.scan_id, body.scanId);
  assert.equal(row.input_ref, '0068100084245');
  assert.equal(JSON.parse(row.request_json).model, row.model);
  assert.match(row.prompt_text, /0068100084245/);
  assert.match(String(row.response_raw), /Kraft Dinner Original/, 'the response was not stored whole');
  assert.ok(String(row.response_raw).includes('"steps"'), 'the raw reply, not a summary, must be stored');
  assert.equal(row.billing_basis, 'per_query');
  assert.equal(getScan(body.scanId)?.source, 'gemini');
});

test('the shelf price and the user\'s thresholds go into the prompt; absent thresholds get the default range (item 6)', async () => {
  const q = new URLSearchParams({ gtin: '5', deviceId: 'thr-a', shelfPriceCents: '449', thresholds: JSON.stringify({ lineUnderPct: 15, lineOverPct: 25 }) });
  await identify(q.toString());
  const p1 = userTurn(calls[0]);
  assert.match(p1, /4\.49/, 'the shelf price never reached Gemini');
  assert.match(p1, /15% below the median/);
  assert.match(p1, /25% above the median/);
  assert.match(p1, /the user's own setting/);
  await identify('gtin=5&deviceId=thr-b');
  const p2 = userTurn(calls[1]);
  assert.match(p2, /10% below the median/);
  assert.match(p2, /default range/, 'a scan with no thresholds must say the default range was used, and must still carry one');
  assert.doesNotMatch(p2, /the user's own setting/);
});

test('the shelf price and thresholds ride a photo body too, and the image is sent with it (items 1, 6)', async () => {
  const { status, body } = await post('/api/identify/photo', {
    image: PNG.toString('base64'),
    deviceId: 'photo-a',
    shelfPriceCents: 1299,
    thresholds: { lineUnderPct: 5, lineOverPct: 20 },
  });
  assert.equal(status, 200);
  assert.equal(calls.length, 1, 'a photo scan must be one call');
  const parts = calls[0].body.input as any[];
  assert.ok(parts.some((p) => p.type === 'image'), 'the photo scan sent no image');
  assert.match(userTurn(calls[0]), /12\.99/);
  assert.match(userTurn(calls[0]), /5% below the median/);
  assert.equal(body.unchecked.name, 'Kraft Dinner Original');
  const rows = geminiCallsForScan(body.scanId);
  assert.equal(rows.length, 1);
  assert.match(rows[0].input_ref ?? '', /^image:sha256:/);
  assert.ok(!rows[0].request_json.includes(PNG.toString('base64')), 'raw image bytes leaked into the stored request');
});

test('the median and verdict shown are Gemini\'s own, even when they disagree with its offers (item 3)', async () => {
  reply = () => ({
    text: httpBody(
      JSON.stringify(
        goodAnswer({
          price_verdict: {
            ...(goodAnswer().price_verdict as object),
            median_unit_price: 7.77,
            shelf: { unit_price: 8, pct_vs_median: 3, position: 51, zone: 'middle', label: 'x' },
          },
        }),
      ),
    ),
  });
  install(reply);
  const { body } = await identify('gtin=3&deviceId=math-shown&shelfPriceCents=800');
  const v = body.grounded.block.verdict;
  assert.equal(v.median, 7.77, 'Shin recomputed the median instead of showing Gemini\'s');
  assert.equal(v.shelf.zone, 'middle');
  assert.equal(v.span, 35);
  reply = undefined;
});

test('a wrong median is marked in the background with the input and the exact prompt, and never shown (item 14)', async () => {
  reply = () => ({ text: httpBody(JSON.stringify(goodAnswer({ price_verdict: { ...(goodAnswer().price_verdict as object), median_unit_price: 9 } }))) });
  install(reply);
  const { body } = await identify('gtin=0068100084245&deviceId=math-bad');
  await settleBackgroundChecks();
  const row = geminiCallsForScan(body.scanId)[0];
  assert.equal(row.math_check, 'mismatch');
  assert.match(String(row.math_mismatches), /median_unit_price/);
  assert.equal(row.input_ref, '0068100084245');
  assert.match(row.prompt_text, /0068100084245/);
  assert.doesNotMatch(JSON.stringify(body), /math_check|mismatch/, 'the hidden check leaked into the answer');
  reply = undefined;

  install();
  const ok = await identify('gtin=0068100084245&deviceId=math-good');
  await settleBackgroundChecks();
  assert.equal(geminiCallsForScan(ok.body.scanId)[0].math_check, 'ok', 'a correct answer was marked');
});

test('an unparseable 2.5 answer is still an answer, marked not fully confident, never a thrown error (item 5)', async () => {
  reply = () => ({ text: httpBody('I am sorry, here is some prose and {"product": {"name": "broken') });
  install(reply);
  const device = deviceOn('2.5', 'garbage');
  const { status, body } = await identify(`gtin=4006381333931&deviceId=${device}`);
  assert.equal(status, 200);
  assert.equal(body.lowConfidence, true);
  assert.ok(['repaired', 'failed'].includes(body.parseStatus), body.parseStatus);
  assert.ok(body.unchecked, 'no answer was given for a barcode Gemini could not parse');
  assert.equal(calls.length, 1, 'a parse failure must not be retried as a second call');
  reply = undefined;
});

test('a Gemini outage is a marked 200 with the class, never a 500 and never a Claude answer (items 1, 5)', async () => {
  reply = () => ({ status: 503, text: 'unavailable' });
  install(reply);
  const { status, body } = await identify('gtin=8&deviceId=outage-a');
  assert.equal(status, 200);
  assert.equal(body.lowConfidence, true);
  assert.ok(body.failure, 'the failure class was lost');
  assert.equal(calls.length, 1, 'a failure fell back to a second call');
  const rows = geminiCallsForScan(body.scanId);
  assert.equal(rows[0].http_status, 503);
  reply = undefined;
});

test('the price sheet shows the SAME one call: no second Gemini call and no Shin price engine (items 2, 3)', async () => {
  const device = 'price-a';
  const first = await identify(`gtin=0068100084245&deviceId=${device}`);
  const priced = await post('/api/price', { deviceId: device, scanId: first.body.scanId, priceQuery: first.body.priceQuery, askingCents: 350 });
  assert.equal(priced.status, 200);
  assert.equal(calls.length, 1, 'the price route made a second Gemini call for the same scan');
  assert.equal(priced.body.kind, 'gemini');
  assert.equal(priced.body.grounded.block.verdict.median, 3);
  assert.equal(priced.body.shelfPriceLate, true, 'a shelf price that arrived after the call must be reported as late, not silently placed by Shin');
  assert.ok(!('tier' in priced.body), 'Shin\'s own verdict tier is still being served');
});

test('a photo scan then the price sheet is still ONE call, and it is one call for that device only (items 2, 3)', async () => {
  const shot = await post('/api/identify/photo', { image: PNG.toString('base64'), deviceId: 'photo-price-a' });
  const mine = await post('/api/price', { deviceId: 'photo-price-a', scanId: shot.body.scanId, text: shot.body.priceQuery?.text, askingCents: 350 });
  assert.equal(mine.status, 200);
  assert.equal(calls.length, 1, 'photo then price made a second Gemini call');
  // Another device asking for the same scan id or words is not served this device's answer.
  const other = await post('/api/price', { deviceId: 'photo-price-b', scanId: shot.body.scanId, text: 'Kraft Dinner Original 225 g', askingCents: 350 });
  assert.equal(other.status, 200);
  assert.equal(calls.length, 2, 'another device was served the first device answer');
  assert.equal(other.body.grounded.forDevice, 'photo-price-b');
});

test('a spent daily budget answers with its own sentence, marked, and sends nothing to Gemini (rule: always an answer)', async () => {
  setSpendGuardForTests(() => false);
  const { status, body } = await identify('gtin=0068100084245&deviceId=cap-a');
  assert.equal(status, 200);
  assert.equal(body.failure, 'spend_cap_reached');
  assert.equal(body.lowConfidence, true);
  assert.equal(calls.length, 0, 'the cap did not stop the request');
  setSpendGuardForTests(null);
  await identify('gtin=0068100084245&deviceId=cap-a');
  assert.equal(calls.length, 1, 'the guard was still tripped after it was lifted');
});

/* ---------------------------------------------- items 18 and 19: the wire -- */

const ALT_ROW = {
  name: 'Store-brand macaroni',
  brand: 'No Name',
  kind: 'substitute',
  reason: 'Not the same brand, two dollars less.',
  store_name: 'Beta Foods',
  store_type: 'supermarket',
  condition: 'new',
  price_text: '$1.99',
  price_cents: 199,
  currency: 'CAD',
  size: { value: 225, unit: 'g' },
  unit_price_cents: null,
  membership_required: false,
  distance_km: null,
  attributes: [],
  url: null,
  constraint_notes: [],
};

test('alternatives travel the wire: the request carries mode, store type and market, and the answer carries the list (items 18, 19)', async () => {
  install(() => ({ text: httpBody(JSON.stringify(goodAnswer({ alternatives: [ALT_ROW] }))) }));
  const q = new URLSearchParams({
    gtin: '0068100084245',
    deviceId: 'alt-a',
    shelfPriceCents: '449',
    market: 'France',
    currency: 'EUR',
    storeName: 'Some Shop',
    storeHint: 'supermarket',
  });
  const { body } = await identify(q.toString());
  assert.equal(calls.length, 1, 'alternatives cost a second call');
  const asked = userTurn(calls[0]);
  assert.match(asked, /Mode for this scan: validation/, 'a scan with a shelf price is a validation');
  assert.match(asked, /Where the user shops \(store type, if known\): supermarket/);
  assert.match(asked, /Country: FR/, 'the market did not come from the user\'s chosen country');
  assert.match(asked, /Currency: EUR/);
  assert.match(asked, /Cross-border hint from Shin: possibly_alike/);
  assert.doesNotMatch(asked, /Some Shop/, 'the shop name went to Gemini; only its type should');
  const alts = body.grounded.block.alternatives;
  assert.equal(alts.length, 1, 'the alternatives did not reach the answer the phone gets');
  assert.equal(alts[0].priceText, '$1.99');
  assert.equal(body.grounded.block.alternativesStatus, 'ok');
  const row = getScan(body.scanId) as any;
  assert.equal(JSON.parse(row.model_json).alternatives, 'ok', 'how the section arrived is not recorded on the scan');
});

test('with no shelf price it is switching, and with nothing about the user the market is unknown, never Canada (items 18, 19)', async () => {
  await identify('gtin=0068100084245&deviceId=alt-b');
  const asked = userTurn(calls[0]);
  assert.match(asked, /Mode for this scan: switching/);
  assert.match(asked, /Country: unknown/);
  assert.match(asked, /Currency: unknown/);
  assert.match(asked, /Where the user shops \(store type, if known\): unknown/);
});

test('a broken alternatives section still answers the scan, marked, in one call (rule 6)', async () => {
  install(() => ({ text: httpBody(JSON.stringify(goodAnswer({ alternatives: 'not a list' }))) }));
  const { status, body } = await identify('gtin=0068100084245&deviceId=alt-c');
  assert.equal(status, 200);
  assert.equal(calls.length, 1);
  assert.equal(body.grounded.block.alternatives.length, 0);
  assert.equal(body.grounded.block.alternativesStatus, 'missing');
  assert.equal(body.grounded.block.verdict.median, 3, 'the answer was lost with the alternatives');
  assert.equal(body.lowConfidence, false);
});
