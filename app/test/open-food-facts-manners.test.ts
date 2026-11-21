/**
 * R35: Open Food Facts asks every app to name itself in its User-Agent and to stay under its
 * published read limit (15 product reads a minute per address, address ban above it; 2026-11-21 review
 * found the code spaced calls for 100 a minute). The live lookup does both, and backs off when OFF says 429.
 * No network: `setOffFetchForTests` stands in for fetch.
 */
import { test, mock } from 'node:test';
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
  // Open Food Facts asks for AppName/Version (ContactEmail): a person to write to before they ban an address.
  assert.match(String(seen['user-agent']), /[\w.]+@[\w.]+\.\w+\)/, 'the User-Agent names no contact address');
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

/** Lets every pending promise in the lookup run before the fake clock moves. */
const settle = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

test('lookups are spaced under the published read limit of 15 a minute, with headroom', async () => {
  clearOffCacheForTests();
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const times: number[] = [];
  setOffFetchForTests(async () => {
    times.push(Date.now());
    return ok('X');
  });
  try {
    // A shopper scanning a new unknown barcode every second for three minutes: far above the limit.
    for (let s = 0; s < 180; s += 1) {
      void lookupOpenFoodFacts(String(1_000_000_000_000 + s));
      await settle();
      mock.timers.tick(1_000);
      await settle();
    }
  } finally {
    setOffFetchForTests(null);
    mock.timers.reset();
  }
  assert.ok(times.length >= 20, `only ${times.length} calls went out in three minutes; the queue is refusing nearly everything`);
  let worst = 0;
  for (let i = 0; i < times.length; i += 1) {
    const inWindow = times.filter((t) => t >= times[i]! && t < times[i]! + 60_000).length;
    worst = Math.max(worst, inWindow);
  }
  assert.ok(worst <= 12, `${worst} calls left inside one minute; Open Food Facts allows 15 a minute per address and bans above it (headroom: 12)`);
});

test('a lookup over the limit waits its turn for a short while, then answers as an ordinary miss and never throws', async () => {
  clearOffCacheForTests();
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 2_000_000 });
  setOffFetchForTests(async () => ok('Y'));
  try {
    const results = [0, 1, 2, 3, 4].map((n) => lookupOpenFoodFactsWithReason(String(2_000_000_000_000 + n)));
    await settle();
    mock.timers.tick(30_000);
    const done = await Promise.all(results);
    assert.ok(done.some((r) => r.product), 'nobody was answered');
    for (const r of done) assert.ok(r.product || r.miss === 'off_failed', 'a refused lookup must come back as an ordinary miss');
  } finally {
    setOffFetchForTests(null);
    mock.timers.reset();
  }
});
