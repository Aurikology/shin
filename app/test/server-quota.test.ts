/**
 * The weekly free-scan limit, Plus, the outcome tap and the price-match line,
 * over a real socket, the way `server-beta-routes.test.ts` does it: the
 * catalogue and Gemini are faked, everything else is the shipped route.
 *
 * Every limit case clears the repeat-scan cache first, so a scan that is not
 * refused really would have made a (faked) Gemini call, and "no call was
 * made" means the 402 came before the spend.
 */
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-quota-'));
process.env.SHIN_CATALOGUE_FIRST = '0'; // the Gemini path these tests pin; catalogue first is on by default since 2026-09-28
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_FREE_SCANS_PER_WEEK;
delete process.env.REVENUECAT_SECRET_KEY;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

const { server, setCatalogueForTests, setGeminiTransportForTests } = await import('../server.ts');
const { fakeTransport } = await import('./gemini-double.ts');
const { clearRepeatCacheForTests } = await import('../src/repeat-cache.ts');
const { outcomeFor, usageFor, freeScanLimit, setEntitlementFetchForTests, entitlementStartupWarning } = await import(
  '../src/scan-quota.ts'
);
const { priceMatchLine } = await import('../src/price-match-line.ts');

const GTIN = '0068100084245';
let port = 0;
let gemini = fakeTransport();

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  setCatalogueForTests({ byGtin: () => null });
});

beforeEach(() => {
  clearRepeatCacheForTests();
  gemini = fakeTransport();
  setGeminiTransportForTests(gemini.transport);
  delete process.env.SHIN_FREE_SCANS_PER_WEEK;
  delete process.env.REVENUECAT_SECRET_KEY;
  setEntitlementFetchForTests(null);
});

after(async () => {
  setCatalogueForTests(null);
  setEntitlementFetchForTests(null);
  delete process.env.SHIN_FREE_SCANS_PER_WEEK;
  delete process.env.REVENUECAT_SECRET_KEY;
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked. */
  }
});

const base = () => `http://127.0.0.1:${port}`;

async function identify(device: string, headers: Record<string, string> = {}, extra = '') {
  clearRepeatCacheForTests();
  const res = await fetch(`${base()}/api/identify?gtin=${GTIN}&deviceId=${device}${extra}`, { headers });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/* ----------------------------------------------------------------- limit */

test('unset, the limit is off: no 402 however many scans', async () => {
  for (let i = 0; i < 4; i++) assert.equal((await identify('q-off')).status, 200);
  assert.equal(gemini.calls.length, 4);
  assert.equal(freeScanLimit({}), null);
  assert.equal(freeScanLimit({ SHIN_FREE_SCANS_PER_WEEK: '0' }), null);
  assert.equal(freeScanLimit({ SHIN_FREE_SCANS_PER_WEEK: 'ten' }), null);
  assert.equal(freeScanLimit({ SHIN_FREE_SCANS_PER_WEEK: '10' }), 10);
});

test('set to 0, the limit is off too', async () => {
  process.env.SHIN_FREE_SCANS_PER_WEEK = '0';
  for (let i = 0; i < 3; i++) assert.equal((await identify('q-zero')).status, 200);
});

test('over the limit: 402 scan_limit before Gemini is called', async () => {
  process.env.SHIN_FREE_SCANS_PER_WEEK = '2';
  assert.equal((await identify('q-hit')).status, 200);
  assert.equal((await identify('q-hit')).status, 200);
  const callsBefore = gemini.calls.length;
  const third = await identify('q-hit');
  assert.equal(third.status, 402);
  assert.equal(third.body.error, 'scan_limit');
  assert.equal(third.body.limit, 2);
  assert.equal(third.body.used, 2);
  assert.equal(typeof third.body.resetsAt, 'string');
  assert.equal(gemini.calls.length, callsBefore, 'a refused scan still called Gemini');
  // Another device is untouched.
  assert.equal((await identify('q-hit-other')).status, 200);
});

test('the x-shin-device header names the device when no deviceId is sent', async () => {
  process.env.SHIN_FREE_SCANS_PER_WEEK = '1';
  const h = { 'x-shin-device': 'q-header' };
  const first = await fetch(`${base()}/api/identify?gtin=${GTIN}`, { headers: h });
  assert.equal(first.status, 200);
  clearRepeatCacheForTests();
  const second = await fetch(`${base()}/api/identify?gtin=${GTIN}`, { headers: h });
  assert.equal(second.status, 402);
});

test('a failed lookup does not use up a scan', async () => {
  process.env.SHIN_FREE_SCANS_PER_WEEK = '1';
  setGeminiTransportForTests(fakeTransport(() => ({ status: 503, text: 'unavailable' })).transport);
  assert.equal((await identify('q-fail')).status, 200);
  assert.equal((await identify('q-fail')).status, 200, 'a failed lookup was counted against the week');
  assert.equal(usageFor('q-fail', 1).used, 0);
});

test('the window rolls: scans older than seven days stop counting', async () => {
  process.env.SHIN_FREE_SCANS_PER_WEEK = '1';
  assert.equal((await identify('q-roll')).status, 200);
  assert.equal(usageFor('q-roll', 1).used, 1);
  const eightDaysOn = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
  assert.equal(usageFor('q-roll', 1, eightDaysOn).used, 0);
});

/* ------------------------------------------------------------------ plus */

test('client-trusted Plus (no RevenueCat key) skips the limit', async () => {
  process.env.SHIN_FREE_SCANS_PER_WEEK = '1';
  assert.equal((await identify('q-plus')).status, 200);
  assert.equal((await identify('q-plus')).status, 402);
  assert.equal((await identify('q-plus', { 'x-shin-plus': '1' })).status, 200);
  assert.ok(entitlementStartupWarning({}));
  assert.equal(entitlementStartupWarning({ REVENUECAT_SECRET_KEY: 'sk' }), null);
});

test('with a RevenueCat key the header is ignored and RevenueCat decides, cached', async () => {
  process.env.SHIN_FREE_SCANS_PER_WEEK = '1';
  process.env.REVENUECAT_SECRET_KEY = 'sk_test_never_sent';
  const asked: string[] = [];
  let active = false;
  setEntitlementFetchForTests(async (url) => {
    asked.push(url);
    const expires = active ? new Date(Date.now() + 86400000).toISOString() : new Date(Date.now() - 1000).toISOString();
    return { ok: true, status: 200, json: async () => ({ subscriber: { entitlements: { plus: { expires_date: expires } } } }) };
  });
  assert.equal((await identify('q-rc')).status, 200);
  assert.equal((await identify('q-rc', { 'x-shin-plus': '1' })).status, 402, 'the client header was trusted over RevenueCat');
  assert.match(asked[0], /\/v1\/subscribers\/q-rc$/);
  setEntitlementFetchForTests(async (url) => {
    asked.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({ subscriber: { entitlements: { plus: { expires_date: new Date(Date.now() + 86400000).toISOString() } } } }),
    };
  });
  active = true;
  const n = asked.length;
  assert.equal((await identify('q-rc')).status, 200);
  assert.equal((await identify('q-rc')).status, 200);
  assert.equal(asked.length, n + 1, 'RevenueCat was asked again inside the ten-minute cache');
});

/* ----------------------------------------------------------------- quota */

test('GET /api/quota reports limit, used, remaining, resetsAt and plus', async () => {
  process.env.SHIN_FREE_SCANS_PER_WEEK = '3';
  await identify('q-quota');
  const res = await fetch(`${base()}/api/quota?deviceId=q-quota`);
  assert.equal(res.status, 200);
  const q = (await res.json()) as Record<string, unknown>;
  assert.equal(q.limit, 3);
  assert.equal(q.used, 1);
  assert.equal(q.remaining, 2);
  assert.equal(typeof q.resetsAt, 'string');
  assert.equal(q.plus, false);
  const off = (await (await fetch(`${base()}/api/quota`, { headers: { 'x-shin-device': 'q-quota', 'x-shin-plus': '1' } })).json()) as Record<string, unknown>;
  assert.equal(off.plus, true);
  assert.equal(off.limit, null);
  assert.equal(off.remaining, null);
  assert.equal((await fetch(`${base()}/api/quota`)).status, 400);
});

/* --------------------------------------------------------------- outcome */

test('POST /api/scan/:id/outcome stores the outcome with the scan', async () => {
  const { body } = await identify('q-outcome');
  const id = body.scanId as number;
  assert.equal(typeof id, 'number');
  const post = (outcome: unknown, scan: number = id) =>
    fetch(`${base()}/api/scan/${scan}/outcome`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ outcome, deviceId: 'q-outcome' }),
    });
  const ok = await post('price_matched');
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { stored: true });
  assert.equal(outcomeFor(id)?.outcome, 'price_matched');
  assert.equal(outcomeFor(id)?.deviceId, 'q-outcome');
  await post('not_bought');
  assert.equal(outcomeFor(id)?.outcome, 'not_bought', 'a second tap did not replace the first');
  assert.equal((await post('stole_it')).status, 400);
  assert.equal((await post('bought_here', 999999)).status, 404);
});

/* ----------------------------------------------------------- price match */

test('priceMatch appears when the store matches and an offer is cheaper, with no savings figure', async () => {
  const { body } = await identify('q-pm', {}, '&storeName=FreshCo&shelfPriceCents=350');
  const pm = body.priceMatch as { store: string; line: string; conditions: string[] } | undefined;
  assert.ok(pm, 'no priceMatch on an answer where FreshCo could match Alpha Market');
  assert.equal(pm.store, 'FreshCo');
  assert.match(pm.line, /Alpha Market/);
  assert.match(pm.line, /\$2\.00/);
  assert.ok(Array.isArray(pm.conditions) && pm.conditions.length > 0);
  assert.doesNotMatch(JSON.stringify(pm), /save|saving|\$1\.50/i);
});

test('priceMatch is absent with no store, an unknown store, a non-matcher, or nothing cheaper', async () => {
  for (const extra of [
    '&shelfPriceCents=350',
    '&storeName=Corner%20Shop&shelfPriceCents=350',
    '&storeName=Costco&shelfPriceCents=350',
    '&storeName=FreshCo&shelfPriceCents=150',
    '&storeName=FreshCo',
  ]) {
    const { body } = await identify('q-pm-none', {}, extra);
    assert.equal(body.priceMatch, undefined, `priceMatch present for ${extra}`);
  }
});

test('priceMatchLine skips membership-only and excluded offers', () => {
  const offers = [
    { retailer: 'Club Store', price: 1, url: null, currency: 'CAD', memberOnly: true },
    { retailer: 'Odd Size Mart', price: 1.5, url: null, currency: 'CAD', exclusionReason: 'size_mismatch', inMedian: false },
    { retailer: 'Alpha Market', price: 2, url: 'https://example.com/a', currency: 'CAD' },
  ];
  const pm = priceMatchLine(offers, 'No Frills', 300);
  assert.equal(pm?.seller, 'Alpha Market');
  assert.equal(pm?.url, 'https://example.com/a');
});
