/**
 * `src/open-food-facts.ts`: a live Open Food Facts lookup by barcode, identity only, with its own
 * timeout and its own cache. Pure functions, no server and no network: `setOffFetchForTests` stands
 * in for the real fetch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
