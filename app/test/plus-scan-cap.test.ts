/**
 * The weekly barcode-scan caps (Jamin, 2026-11-05): free 10 a week, Pexi Plus
 * 100 a week, typed searches free and uncounted. Over a real socket, the way
 * server-quota.test.ts does it, with the weeks' earlier scans put straight
 * into the scan table so "99" and "100" are the real counts.
 *
 * A cap left unset means no cap, for both tiers: the live beta server must keep
 * answering until the limits are switched on on purpose.
 */
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-plus-cap-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_FREE_SCANS_PER_WEEK;
delete process.env.SHIN_PLUS_SCANS_PER_WEEK;
delete process.env.REVENUECAT_SECRET_KEY;
process.env.SHIN_PLUS_TRUST_CLIENT = '1';

const { server, setCatalogueForTests } = await import('../server.ts');
const { plusScanLimit, freeScanLimit, usageFor, setEntitlementFetchForTests } = await import('../src/scan-quota.ts');
const { recordScan } = await import('../src/scans.ts');

const GTIN = '0068100084245';
const PLUS = { 'x-shin-plus': '1' };
let port = 0;

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  setCatalogueForTests({ byGtin: () => null });
});

beforeEach(() => {
  delete process.env.SHIN_FREE_SCANS_PER_WEEK;
  delete process.env.SHIN_PLUS_SCANS_PER_WEEK;
  delete process.env.REVENUECAT_SECRET_KEY;
  setEntitlementFetchForTests(null);
});

after(async () => {
  setCatalogueForTests(null);
  setEntitlementFetchForTests(null);
  delete process.env.SHIN_FREE_SCANS_PER_WEEK;
  delete process.env.SHIN_PLUS_SCANS_PER_WEEK;
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked. */
  }
});

const base = () => `http://127.0.0.1:${port}`;

async function identify(device: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${base()}/api/identify?gtin=${GTIN}&deviceId=${device}`, { headers });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** `n` barcode scans this server answered for the device, in the last hour. */
function seed(device: string, n: number) {
  for (let i = 0; i < n; i++) {
    recordScan({
      deviceId: device,
      kind: 'barcode',
      query: GTIN,
      resolvedCode: GTIN,
      resolvedLabel: 'Seeded product',
      outcome: 'answered',
      scannedAt: new Date(Date.now() - (n - i) * 60_000).toISOString(),
    });
  }
  assert.equal(usageFor(device, null).used, n, 'the seeded scans were not counted');
}

test('the Plus cap is read like the free limit: unset, empty, 0 or not a number is no cap', () => {
  assert.equal(plusScanLimit({}), null);
  assert.equal(plusScanLimit({ SHIN_PLUS_SCANS_PER_WEEK: '' }), null);
  assert.equal(plusScanLimit({ SHIN_PLUS_SCANS_PER_WEEK: '0' }), null);
  assert.equal(plusScanLimit({ SHIN_PLUS_SCANS_PER_WEEK: 'lots' }), null);
  assert.equal(plusScanLimit({ SHIN_PLUS_SCANS_PER_WEEK: '-5' }), null);
  assert.equal(plusScanLimit({ SHIN_PLUS_SCANS_PER_WEEK: '2.5' }), null);
  assert.equal(plusScanLimit({ SHIN_PLUS_SCANS_PER_WEEK: '100' }), 100);
  assert.equal(plusScanLimit({ SHIN_PLUS_SCANS_PER_WEEK: ' 100 ' }), 100);
  assert.equal(freeScanLimit({ SHIN_PLUS_SCANS_PER_WEEK: '100' }), null, 'the Plus setting leaked into the free limit');
});

test('a Plus subscriber at 99 scans passes; at 100 is refused with the Plus message, not the paywall', async () => {
  process.env.SHIN_FREE_SCANS_PER_WEEK = '10';
  process.env.SHIN_PLUS_SCANS_PER_WEEK = '100';
  seed('plus-99', 99);
  const hundredth = await identify('plus-99', PLUS);
  assert.equal(hundredth.status, 200, 'the 100th scan of the week was refused');
  recordScan({ deviceId: 'plus-99', kind: 'barcode', query: GTIN, resolvedCode: GTIN, resolvedLabel: 'Seeded product', outcome: 'answered' }); // the named scan the 100th would leave
  const refused = await identify('plus-99', PLUS);
  assert.equal(refused.status, 402);
  assert.equal(refused.body.error, 'scan_limit');
  assert.equal(refused.body.plus, true, 'a Plus refusal must say it is Plus, so the client does not show the subscribe paywall');
  assert.equal(refused.body.limit, 100);
  assert.equal(refused.body.used, 100);
  assert.equal(typeof refused.body.resetsAt, 'string');
});

test('a free user at 9 passes; at 10 is refused with the subscribe paywall body (no Plus marker)', async () => {
  process.env.SHIN_FREE_SCANS_PER_WEEK = '10';
  process.env.SHIN_PLUS_SCANS_PER_WEEK = '100';
  seed('free-9', 9);
  assert.equal((await identify('free-9')).status, 200, 'the 10th free scan was refused');
  recordScan({ deviceId: 'free-9', kind: 'barcode', query: GTIN, resolvedCode: GTIN, resolvedLabel: 'Seeded product', outcome: 'answered' }); // the named scan the 10th would leave
  const refused = await identify('free-9');
  assert.equal(refused.status, 402);
  assert.equal(refused.body.error, 'scan_limit');
  assert.equal(refused.body.limit, 10);
  assert.equal(refused.body.used, 10);
  assert.equal('plus' in refused.body, false, 'a free refusal must keep the subscribe paywall');
});

test('a Plus subscriber past the free limit is not stopped by it', async () => {
  process.env.SHIN_FREE_SCANS_PER_WEEK = '10';
  process.env.SHIN_PLUS_SCANS_PER_WEEK = '100';
  seed('plus-12', 12);
  assert.equal((await identify('plus-12', PLUS)).status, 200);
  assert.equal((await identify('plus-12')).status, 402, 'the same device without Plus is still over the free limit');
});

test('with both caps unset, nobody is refused: free and Plus alike', async () => {
  seed('open-free', 150);
  seed('open-plus', 150);
  assert.equal((await identify('open-free')).status, 200);
  assert.equal((await identify('open-plus', PLUS)).status, 200);
});

test('only the Plus cap set: Plus is capped, a free device is not', async () => {
  process.env.SHIN_PLUS_SCANS_PER_WEEK = '3';
  seed('only-plus', 3);
  const refused = await identify('only-plus', PLUS);
  assert.equal(refused.status, 402);
  assert.equal(refused.body.plus, true);
  seed('only-free', 3);
  assert.equal((await identify('only-free')).status, 200);
});

test('GET /api/quota tells a Plus device its cap and what is left', async () => {
  process.env.SHIN_PLUS_SCANS_PER_WEEK = '100';
  seed('quota-plus', 40);
  const res = await fetch(`${base()}/api/quota?deviceId=quota-plus`, { headers: PLUS });
  const q = (await res.json()) as Record<string, unknown>;
  assert.equal(q.plus, true);
  assert.equal(q.limit, 100);
  assert.equal(q.used, 40);
  assert.equal(q.remaining, 60);
});
