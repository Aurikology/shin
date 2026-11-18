/**
 * R35: Open Food Facts asks every app to name itself in its User-Agent and to stay under its read
 * limit (100 product reads a minute). The live lookup does both, and backs off when OFF says 429.
 * No network: `setOffFetchForTests` stands in for fetch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupOpenFoodFacts, lookupOpenFoodFactsWithReason, setOffFetchForTests, clearOffCacheForTests } from '../src/open-food-facts.ts';

const ok = (name: string) => ({ ok: true, status: 200, json: async () => ({ product: { product_name: name, code: '1' } }) });

test('the live call names Pexi in the User-Agent', async () => {
  clearOffCacheForTests();
  let seen: Record<string, string> | undefined;
  setOffFetchForTests(async (_url, init) => {
    seen = init.headers;
    return ok('Water');
  });
  await lookupOpenFoodFacts('0055297000200');
  setOffFetchForTests(null);
  assert.ok(seen, 'no headers were sent');
  assert.match(String(seen['user-agent']), /^Pexi-server\/1\.0 \(grocery price scanner/);
});

test('a 429 pauses live lookups instead of hammering Open Food Facts, and is not cached as "no such product"', async () => {
  clearOffCacheForTests();
  let calls = 0;
  setOffFetchForTests(async () => {
    calls += 1;
    return { ok: false, status: 429, headers: { get: (h: string) => (h === 'retry-after' ? '30' : null) }, json: async () => ({}) };
  });
  const first = await lookupOpenFoodFactsWithReason('0055297000217');
  assert.equal(first.miss, 'off_failed');
  const second = await lookupOpenFoodFactsWithReason('0055297000224');
  assert.equal(second.miss, 'off_failed');
  assert.equal(calls, 1, 'a second request went out during the cool-down');
  assert.match(String(second.detail), /cool/i);
  // Clearing the cache for tests also ends the cool-down; the same barcode is then asked again.
  clearOffCacheForTests();
  let after = 0;
  setOffFetchForTests(async () => {
    after += 1;
    return ok('Rice');
  });
  assert.equal((await lookupOpenFoodFacts('0055297000217'))?.name, 'Rice');
  assert.equal(after, 1);
  setOffFetchForTests(null);
});

test('lookups are spaced under the published read limit', async () => {
  clearOffCacheForTests();
  const times: number[] = [];
  setOffFetchForTests(async () => {
    times.push(Date.now());
    return ok('X');
  });
  await Promise.all(['0055297000248', '0055297000255', '0055297000262'].map((g) => lookupOpenFoodFacts(g)));
  setOffFetchForTests(null);
  assert.equal(times.length, 3);
  for (let i = 1; i < times.length; i += 1) {
    const gap = times[i]! - times[i - 1]!;
    assert.ok(gap >= 550, `calls ${i - 1} and ${i} were ${gap} ms apart`);
  }
});
