/**
 * Shared addresses (readiness R36, R81): a campus, a store's Wi-Fi or a carrier's address is many honest
 * phones behind one address. The limits count each phone on its own, and the per-address numbers are only a
 * high abuse ceiling. Also: the in-memory limiters remember far more than 5,000 keys, and every refusal is
 * counted where the health body can read it.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './security-harness.mjs';
import { KeyedLimiter, limiterRefusals } from '../src/rate-limit.ts';

const h = await boot({ products: 5, consent: true, env: { SHIN_FREE_SCANS_PER_WEEK: '10' } });
after(async () => {
  await h.close();
});

const ADDR = '198.51.100.7';
const phoneAt = (i, ip = ADDR) => ({
  'cf-connecting-ip': ip,
  'x-shin-device': `campus-phone-${String(i).padStart(4, '0')}`,
  'x-shin-device-key': `campusKey${String(i).padStart(4, '0')}abcdefgh`,
});

test('R36: 40 honest phones on one address, 40 requests each, are never told "a lot of requests"', async () => {
  h.mod.resetPaidCallLimitersForTests({});
  const refused = [];
  for (let round = 0; round < 40; round += 1) {
    const batch = await Promise.all(
      Array.from({ length: 40 }, (_, i) => h.get('/api/categories', phoneAt(i)).then((r) => r.status)),
    );
    refused.push(...batch.filter((s) => s === 429));
  }
  assert.equal(refused.length, 0, `${refused.length} of 1600 honest requests were refused`);
});

test('R36: one phone cannot flood the door just because the address ceiling is high', async () => {
  h.mod.resetPaidCallLimitersForTests({});
  const one = phoneAt(9001, '198.51.100.8');
  let first429 = -1;
  for (let i = 0; i < 1_400 && first429 < 0; i += 1) {
    if ((await h.get('/api/categories', one)).status === 429) first429 = i;
  }
  assert.ok(first429 > 0 && first429 <= 1_300, `one phone made ${first429 < 0 ? '1400+' : first429} requests before a refusal`);
  // Another phone on the same address is still served.
  assert.notEqual((await h.get('/api/categories', phoneAt(9002, '198.51.100.8'))).status, 429);
});

test('R36: the address ceiling still stops one address rotating fresh device ids', async () => {
  h.mod.resetPaidCallLimitersForTests({ SHIN_RATE_DOOR_IP_PER_10MIN: '300' });
  let refused = 0;
  for (let i = 0; i < 400; i += 1) {
    if ((await h.get('/api/categories', phoneAt(10_000 + i, '198.51.100.9'))).status === 429) refused += 1;
  }
  assert.ok(refused >= 90, `a rotating script got ${400 - refused} of 400 requests through a 300 ceiling`);
});

const scanAs = (i, ip) =>
  h.get(`/api/identify?gtin=${h.codes[i % 5]}&countryCode=CA&region=Ontario&deviceId=campus-phone-${String(i).padStart(4, '0')}`, phoneAt(i, ip));

test('R36: 100 first-time phones on one address each get their free scan', async () => {
  h.mod.resetPaidCallLimitersForTests({});
  let blocked = 0;
  for (let i = 20_000; i < 20_100; i += 1) {
    const r = await scanAs(i, '198.51.100.20');
    if (r.status !== 200) blocked += 1;
  }
  assert.equal(blocked, 0, `${blocked} of 100 first-time phones on one address were refused`);
});

test('R36: past the address ceiling a new phone sees the Plus screen body, not the flood text', async () => {
  h.mod.resetPaidCallLimitersForTests({ SHIN_FREE_SCANS_PER_IP_DAY: '3' });
  const statuses = [];
  let last;
  for (let i = 30_000; i < 30_005; i += 1) {
    last = await scanAs(i, '198.51.100.21');
    statuses.push(last.status);
  }
  assert.ok(!statuses.includes(429), `a 429 came back: ${statuses.join(',')}`);
  assert.equal(statuses[4], 402, statuses.join(','));
  const body = await last.json();
  assert.equal(body.error, 'scan_limit');
});

test('R81: the limiters remember 100,000 phones, not 5,000', () => {
  const lim = new KeyedLimiter([{ ms: 3_600_000, limit: 1 }]);
  const t = Date.now();
  assert.equal(lim.check('first', t).allowed, true);
  for (let i = 0; i < 20_000; i += 1) lim.check(`other-${i}`, t);
  assert.equal(lim.check('first', t + 1).allowed, false, 'the oldest key was forgotten after 20,000 others');
});

test('R36: every refusal is counted by limiter for the health body', () => {
  const lim = new KeyedLimiter([{ ms: 60_000, limit: 1 }], 'unit-test');
  const before = limiterRefusals();
  lim.check('a');
  lim.check('a');
  lim.check('a');
  const after = limiterRefusals();
  assert.equal(after.total, before.total + 2);
  assert.equal(after.byName['unit-test'], (before.byName['unit-test'] ?? 0) + 2);
  assert.match(after.day, /^\d{4}-\d{2}-\d{2}$/);
});
