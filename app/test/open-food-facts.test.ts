/**
 * Item 6 (docs/scanner-build-order-2026-09-19.md, section 6), ruling 5
 * (docs/decisions.md, "Nine rulings so the competitor-survey build could
 * start", 2026-09-19): a LIVE Open Food Facts lookup by barcode, identity
 * only, before the paid Gemini call, with its own timeout and its own cache.
 * The imported OFF table in `catalogue/` stays unconsulted on this path.
 *
 * `src/open-food-facts.ts`'s own pure functions first (no server, no
 * network: `setOffFetchForTests` stands in for the real fetch), then the
 * server-level proof that the hint actually reaches the Gemini prompt, and
 * that a failing lookup never blocks or fails the scan.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { normalizeOffResponse, lookupOpenFoodFacts, setOffFetchForTests, clearOffCacheForTests } from '../src/open-food-facts.ts';

test('normalizeOffResponse reads OFF\'s own field names as they are, no unit conversion', () => {
  const product = normalizeOffResponse({
    code: '0068100084245',
    product: { product_name: ' Kraft Dinner Original ', brands: 'Kraft, Kraft Canada', quantity: '225 g' },
  });
  assert.deepEqual(product, { code: '0068100084245', name: 'Kraft Dinner Original', brand: 'Kraft', size: '225 g' });
});

test('a response with no product, or no name, is not an identity', () => {
  assert.equal(normalizeOffResponse({ status: 0 }), null);
  assert.equal(normalizeOffResponse({ product: { product_name: '' } }), null);
  assert.equal(normalizeOffResponse(null), null);
  assert.equal(normalizeOffResponse('not an object'), null);
});

test('lookupOpenFoodFacts caches a hit, so a second lookup of the same barcode makes no second fetch', async () => {
  clearOffCacheForTests();
  let fetches = 0;
  setOffFetchForTests(async () => {
    fetches += 1;
    return { ok: true, status: 200, json: async () => ({ product: { product_name: 'Water', code: '0055297000189' } }) };
  });
  const first = await lookupOpenFoodFacts('0055297000189');
  const second = await lookupOpenFoodFacts('0055297000189');
  assert.deepEqual(first, { code: '0055297000189', name: 'Water', brand: null, size: null });
  assert.deepEqual(second, first);
  assert.equal(fetches, 1, 'a cached identity was looked up on the network again');
  setOffFetchForTests(null);
});

test('a non-2xx status, a thrown fetch, and an aborted request are all a null, never a throw', async () => {
  clearOffCacheForTests();
  setOffFetchForTests(async () => ({ ok: false, status: 404, json: async () => ({}) }));
  assert.equal(await lookupOpenFoodFacts('0000000000017'), null);

  clearOffCacheForTests();
  setOffFetchForTests(async () => {
    throw new Error('network is down');
  });
  assert.equal(await lookupOpenFoodFacts('0000000000024'), null);

  clearOffCacheForTests();
  setOffFetchForTests(async (_url, init) => {
    await new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    return { ok: true, status: 200, json: async () => ({}) };
  });
  assert.equal(await lookupOpenFoodFacts('0000000000031'), null);
  setOffFetchForTests(null);
});

/* ------------------------- the server-level proof ------------------------- */

const dir = mkdtempSync(join(tmpdir(), 'shin-off-route-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

const { server, setGeminiTransportForTests } = await import('../server.ts');
const { fakeTransport } = await import('./gemini-double.ts');

let port = 0;
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => {
  setGeminiTransportForTests(null);
  setOffFetchForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

const identify = (q: string) =>
  fetch(`http://127.0.0.1:${port}/api/identify?${q}`).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));

test('an Open Food Facts hit reaches the Gemini prompt as a head start on identity, before the answer comes back', async () => {
  clearOffCacheForTests();
  setOffFetchForTests(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ product: { product_name: 'Store-brand macaroni', brands: 'No Name', quantity: '225 g' } }),
  }));
  const { calls, transport } = fakeTransport();
  setGeminiTransportForTests(transport);
  const { status } = await identify('gtin=0000000000086&deviceId=off-hint');
  assert.equal(status, 200);
  assert.equal(calls.length, 1);
  const sent = JSON.stringify(calls[0].body.input ?? calls[0].body);
  assert.match(sent, /Store-brand macaroni/, 'the Open Food Facts identity never reached the prompt');
  assert.match(sent, /No Name/);
  setOffFetchForTests(null);
});

test('a failing Open Food Facts lookup never blocks or fails the scan', async () => {
  clearOffCacheForTests();
  setOffFetchForTests(async () => {
    throw new Error('OFF is unreachable from here');
  });
  const { calls, transport } = fakeTransport();
  setGeminiTransportForTests(transport);
  const { status, body } = await identify('gtin=0000000000093&deviceId=off-down');
  assert.equal(status, 200);
  assert.equal(calls.length, 1, 'a failing OFF lookup stopped the scan from reaching Gemini');
  assert.notEqual(body.failure, 'model_client_error');
  setOffFetchForTests(null);
});
