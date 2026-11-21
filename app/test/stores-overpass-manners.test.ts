/**
 * Overpass (OpenStreetMap) is run by volunteers. The 2026-11-21 review found two things to fix:
 * the User-Agent still said "shin-beta (price scanner, six testers)" with no contact, and the
 * per-square cache held 500 squares for a day, so at launch size the same areas were asked again.
 * No network: global fetch is replaced for the length of each test.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { storesNear, resetStoreCache } from '../src/stores.ts';
import type { CoarseCell } from '../src/stores.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  resetStoreCache();
});

const OVERPASS_BODY = JSON.stringify({
  elements: [{ type: 'node', id: 1, lat: 43.26, lon: -79.92, tags: { shop: 'supermarket', name: 'Test Foods' } }],
});

function cellAt(i: number): CoarseCell {
  const lat = 40 + Math.floor(i / 1000) * 0.01;
  const lon = -120 + (i % 1000) * 0.01;
  return { lat, lon, text: `${lat.toFixed(2)},${lon.toFixed(2)}` } as unknown as CoarseCell;
}

test('the Overpass User-Agent says Pexi, with a contact, and no longer "six testers"', async () => {
  let agent = '';
  globalThis.fetch = (async (_url: unknown, init: { headers: Record<string, string> }) => {
    agent = init.headers['user-agent'] ?? '';
    return new Response(OVERPASS_BODY, { status: 200 });
  }) as typeof fetch;
  await storesNear(cellAt(1));
  assert.ok(agent, 'no user-agent was sent');
  // The published contact address still carries the old name (docs/store/listing.md item 12); the rest must not.
  assert.doesNotMatch(agent.replace(/[\w.]+@[\w.]+\.\w+/, ''), /shin|six testers|beta/i);
  assert.match(agent, /^Pexi/);
  assert.match(agent, /[\w.]+@[\w.]+\.\w+/, 'no contact address in the User-Agent');
});

test('a repeat area never re-queries: thousands of squares stay cached, not just 500', async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(OVERPASS_BODY, { status: 200 });
  }) as typeof fetch;
  const squares = 1_500;
  for (let i = 0; i < squares; i += 1) await storesNear(cellAt(i));
  assert.equal(calls, squares);
  // Every square asked again straight away is answered from the cache.
  for (let i = 0; i < squares; i += 1) await storesNear(cellAt(i));
  assert.equal(calls, squares, `${calls - squares} squares were asked of Overpass a second time`);
});

test('a square that did get new data does not push another square out of the cache', async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(OVERPASS_BODY, { status: 200 });
  }) as typeof fetch;
  await storesNear(cellAt(1), { now: 0 });
  await storesNear(cellAt(2), { now: 0 });
  assert.equal(calls, 2);
  // Past its day, square 1 is asked again and replaces its own entry.
  await storesNear(cellAt(1), { now: 8 * 24 * 60 * 60 * 1000 });
  assert.equal(calls, 3);
  await storesNear(cellAt(2), { now: 1000 });
  assert.equal(calls, 3, 'square 2 was dropped when square 1 was refreshed');
});
