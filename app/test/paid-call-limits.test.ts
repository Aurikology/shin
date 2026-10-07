/**
 * Limits on the calls that cost money: per invite code, per network address, and what the daily
 * dollar cap charges for one grounded scan. Each test is written to fail if the behaviour it names
 * is removed. Nothing reaches Google (the transport is a recorded double).
 *
 *   - a code that goes over its ceiling is refused with a 429 and a Retry-After, no Gemini call is
 *     made, and nothing is charged to the dollar cap; another code is untouched
 *   - a network address is limited whatever device id the caller sends (rotating the id is the
 *     obvious way round a per-device limit)
 *   - the price route limits only when it would make a call
 *   - calls that cost nothing are never limited
 *   - the cap charges the search fee, not just the tokens
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { fakeTransport } from './gemini-double.ts';

const dir = mkdtempSync(join(tmpdir(), 'shin-paidlimit-'));
process.env.SHIN_CATALOGUE_FIRST = '0'; // the Gemini path these tests pin; catalogue first is on by default since 2026-09-28
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_USER_CATALOGUE = join(dir, 'user-catalogue.db');
process.env.PORT = '0';
process.env.GEMINI_API_KEY = 'test-key-never-sent-anywhere';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_GEMINI_MODEL;
delete process.env.SHIN_MODEL_PROVIDER;

const { server, setGeminiTransportForTests, setSpendGuardForTests, setCatalogueForTests, setUserCatalogueForTests, settleBackgroundChecks, resetPaidCallLimitersForTests } =
  await import('../server.ts');
const { openScanStore } = await import('../src/scans.ts');
const { clearRepeatCacheForTests } = await import('../src/repeat-cache.ts');
const { setErrorSinkForTests } = await import('../src/errlog.ts');
const { createUserCatalogue } = await import('../../catalogue/src/user-catalogue.ts');
const { KeyedLimiter, clientAddress } = await import('../src/rate-limit.ts');
const { groundedScanCapChargeUsdCents } = await import('../src/model-cost.ts');
const { usdCentsToCad } = await import('../../identify/src/cap.ts');

let port = 0;
let calls: ReturnType<typeof fakeTransport>['calls'] = [];
let charged = 0;
const base = () => `http://127.0.0.1:${port}`;
const HIGH = '100000';

function limits(over: Record<string, string>) {
  resetPaidCallLimitersForTests({
    SHIN_RATE_CODE_PER_10MIN: HIGH,
    SHIN_RATE_CODE_PER_DAY: HIGH,
    SHIN_RATE_IP_PER_10MIN: HIGH,
    SHIN_RATE_IP_PER_DAY: HIGH,
    ...over,
  });
}
const identify = (q: string, headers: Record<string, string> = {}) =>
  fetch(`${base()}/api/identify?${q}`, { headers }).then(async (r) => ({
    status: r.status,
    retryAfter: r.headers.get('retry-after'),
    body: (await r.json()) as any,
  }));
const price = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  fetch(`${base()}/api/price`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, retryAfter: r.headers.get('retry-after'), body: (await r.json()) as any }));

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  openScanStore(process.env.SHIN_SCANS);
});
beforeEach(() => {
  const t = fakeTransport();
  calls = t.calls;
  setGeminiTransportForTests(t.transport);
  charged = 0;
  setSpendGuardForTests(() => {
    charged += 1;
    return true;
  });
  setUserCatalogueForTests(createUserCatalogue(':memory:'));
  setErrorSinkForTests(() => {});
  delete process.env.SHIN_INVITES;
  limits({});
  // Item 1's repeat-scan cache is keyed on the barcode alone, and this file
  // reuses fixture barcodes across tests; without clearing, a test after the
  // first to scan one would be served the cached answer instead of making
  // its own call, which is item 1's real behaviour but not what these tests
  // (written before the cache existed) are checking.
  clearRepeatCacheForTests();
});
after(async () => {
  delete process.env.SHIN_INVITES;
  setGeminiTransportForTests(null);
  setCatalogueForTests(null);
  setUserCatalogueForTests(null);
  setSpendGuardForTests(null);
  setErrorSinkForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the scan database is still open on Windows; the OS will take the temp dir */
  }
});

test('limiter: the N+1th call inside the window is refused, and a refused call is not counted', () => {
  const l = new KeyedLimiter([{ ms: 1000, limit: 2 }]);
  assert.equal(l.check('k', 0).allowed, true);
  assert.equal(l.check('k', 100).allowed, true);
  const refused = l.check('k', 200);
  assert.equal(refused.allowed, false);
  assert.equal(refused.retryAfterSeconds, 1);
  // Hammering while refused must not push the release time out: at t=1000 the first call has left.
  for (let t = 300; t < 1000; t += 100) assert.equal(l.check('k', t).allowed, false);
  assert.equal(l.check('k', 1000).allowed, true, 'refused calls were counted against the caller');
});

test('limiter: keys are independent, and the daily window binds when the short one does not', () => {
  const l = new KeyedLimiter([
    { ms: 1000, limit: 100 },
    { ms: 10_000, limit: 3 },
  ]);
  assert.equal(l.check('a', 0).allowed, true);
  assert.equal(l.check('a', 2000).allowed, true);
  assert.equal(l.check('a', 4000).allowed, true);
  assert.equal(l.check('a', 6000).allowed, false, 'the long window did not bind');
  assert.equal(l.check('b', 6000).allowed, true, 'one key spent another key`s allowance');
  assert.equal(l.check('a', 10_001).allowed, true, 'the long window never released');
});

test('clientAddress: the tunnel header wins, and with none it is the socket address', () => {
  assert.equal(clientAddress({ 'cf-connecting-ip': '203.0.113.9' }, '127.0.0.1'), '203.0.113.9');
  assert.equal(clientAddress({}, '127.0.0.1'), '127.0.0.1');
  assert.equal(clientAddress({ 'cf-connecting-ip': '   ' }, '127.0.0.1'), '127.0.0.1');
  assert.equal(clientAddress({}, undefined), 'unknown');
});

test('a code over its ceiling gets a 429 with Retry-After, no Gemini call, and no charge to the cap; another code is untouched', async () => {
  process.env.SHIN_INVITES = 'aurik:AAAA,jamin:BBBB';
  limits({ SHIN_RATE_CODE_PER_10MIN: '3' });
  for (let i = 0; i < 3; i++) {
    const ok = await identify(`gtin=0068100084245&deviceId=d${i}`, { 'x-shin-invite': 'AAAA' });
    assert.equal(ok.status, 200);
  }
  await settleBackgroundChecks();
  const callsBefore = calls.length;
  const chargedBefore = charged;
  const refused = await identify('gtin=0068100084245&deviceId=fresh-device-again', { 'x-shin-invite': 'AAAA' });
  assert.equal(refused.status, 429);
  assert.ok(Number(refused.retryAfter) >= 1, 'no Retry-After on the refusal');
  assert.equal(calls.length, callsBefore, 'a refused request still reached Gemini');
  assert.equal(charged, chargedBefore, 'a refused request was charged against the dollar cap');
  const other = await identify('gtin=0068100084245&deviceId=other', { 'x-shin-invite': 'BBBB' });
  assert.equal(other.status, 200, 'one code being over its ceiling locked another code out');
  await settleBackgroundChecks();
});

test('a network address is limited whatever device id it sends', async () => {
  limits({ SHIN_RATE_IP_PER_10MIN: '2' });
  const from = (ip: string, device: string) => identify(`gtin=0068100084245&deviceId=${device}`, { 'cf-connecting-ip': ip });
  assert.equal((await from('198.51.100.7', 'r1')).status, 200);
  assert.equal((await from('198.51.100.7', 'r2')).status, 200);
  assert.equal((await from('198.51.100.7', 'r3-a-brand-new-id')).status, 429, 'rotating the device id got round the limit');
  assert.equal((await from('198.51.100.8', 'r1')).status, 200, 'a different address was refused');
  await settleBackgroundChecks();
});

test('the price route limits only when it has to make a call', async () => {
  limits({ SHIN_RATE_CODE_PER_10MIN: '1' });
  /* Barcode bodies since 2026-09-23: a typed name on this route searches
     Pexi's own data and makes no call, so it has nothing to limit. */
  const first = await price({ gtin: '0068100084245', text: 'Kraft Dinner Original', deviceId: 'p1' });
  assert.equal(first.status, 200);
  const second = await price({ gtin: '0037000930358', text: 'Tide Original 2.72 L', deviceId: 'p1' });
  assert.equal(second.status, 429, 'a price call with no stored answer was not limited');
  await settleBackgroundChecks();
});

test('calls that cost nothing are never limited', async () => {
  limits({ SHIN_RATE_CODE_PER_10MIN: '1', SHIN_RATE_IP_PER_10MIN: '1' });
  for (let i = 0; i < 5; i++) {
    const h = await fetch(`${base()}/api/health`);
    assert.equal(h.status, 200);
    const s = await fetch(`${base()}/api/search?q=kraft`);
    assert.notEqual(s.status, 429, 'search was limited');
  }
});

test('the cap charges the search fee: about 5.82 US cents a scan, not the old 0.68', () => {
  const cents = groundedScanCapChargeUsdCents();
  assert.ok(Math.abs(cents - 5.8238) < 1e-9, `charged ${cents}`);
  assert.ok(cents > 0.68 * 8, 'the charge is not eight times the old flat figure');
  assert.ok(Math.abs(usdCentsToCad(100) - 1.35) < 1e-9);
});
