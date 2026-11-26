/**
 * Daily caps on Claude-backed answers and on typed prices (src/daily-caps.ts, legal review 2026-11-26 N7).
 * The Android invite word gates nothing, so the only real limits are per phone and per address. Built
 * apps 1 and 2 are unchanged: every request below carries only the headers and ids they already send
 * (cf-connecting-ip from the tunnel, the device id in the query or body). Each test fails if the cap it
 * names is removed, or if a 429 turns back into a quiet 200.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './security-harness.mjs';
import { DailyCaps, capLimits, CAP_DEFAULTS } from '../src/daily-caps.ts';

const h = await boot({ products: 3, consent: false });
after(() => h.close());

const CAP_ENV = ['SHIN_CAP_CLAUDE_DEVICE_PER_DAY', 'SHIN_CAP_CLAUDE_IP_PER_DAY', 'SHIN_CAP_PRICE_DEVICE_PER_DAY', 'SHIN_CAP_PRICE_IP_PER_DAY'];
const setCaps = (caps) => {
  for (const k of CAP_ENV) delete process.env[k];
  Object.assign(process.env, caps);
  h.mod.resetPaidCallLimitersForTests(process.env);
};
after(() => setCaps({}));

let n = 0;
const ask = (device, ip) =>
  h.get(
    `/api/identify?text=${encodeURIComponent(`Zzqx Cap Probe ${(n += 1)} Brandless`)}&countryCode=CA&region=Ontario&deviceId=${device}`,
    { 'x-shin-claude': '1', 'cf-connecting-ip': ip },
  );

async function captureLog(fn) {
  const lines = [];
  const real = console.log;
  console.log = (...a) => {
    lines.push(a.join(' '));
  };
  try {
    await fn();
  } finally {
    console.log = real;
  }
  return lines.filter((l) => l.includes('[daily-cap]'));
}

test('limits default to 40 and 100 for Claude, 60 and 300 for prices, and a bad value cannot switch a cap off', () => {
  assert.deepEqual(capLimits({}), CAP_DEFAULTS);
  assert.deepEqual(capLimits({ SHIN_CAP_CLAUDE_DEVICE_PER_DAY: '7', SHIN_CAP_PRICE_IP_PER_DAY: '9' }), {
    claudeDevice: 7,
    claudeAddress: 100,
    priceDevice: 60,
    priceAddress: 9,
  });
  for (const bad of ['0', '-3', 'abc', '2.5', '']) {
    assert.equal(capLimits({ SHIN_CAP_CLAUDE_DEVICE_PER_DAY: bad }).claudeDevice, 40, `"${bad}" changed the cap`);
  }
});

test('the class: a refused use is not counted, keys are separate, and the trip is logged once a day per key', () => {
  const lines = [];
  const caps = new DailyCaps({ SHIN_CAP_PRICE_DEVICE_PER_DAY: '2' }, (l) => lines.push(l));
  const t0 = Date.parse('2026-11-26T10:00:00Z');
  assert.equal(caps.use('price', 'phone-a', '198.51.100.1', t0), null);
  assert.equal(caps.use('price', 'phone-a', '198.51.100.1', t0 + 1), null);
  const refused = caps.use('price', 'phone-a', '198.51.100.1', t0 + 2);
  assert.ok(refused && refused.scope === 'device' && refused.limit === 2);
  assert.ok(refused.retryAfterSeconds > 0);
  for (let i = 0; i < 20; i += 1) caps.use('price', 'phone-a', '198.51.100.1', t0 + 3 + i);
  assert.equal(lines.length, 1, 'a hammered cap wrote more than one line');
  assert.match(lines[0], /^\[daily-cap\] price cap of 2 a day reached for device phone-a/);
  assert.equal(caps.use('price', 'phone-b', '198.51.100.1', t0 + 100), null, 'one phone spent another phone`s allowance');
  assert.equal(caps.use('claude', 'phone-a', '198.51.100.1', t0 + 100), null, 'the price cap spent the Claude allowance');
});

test('Claude answers: a phone past its daily cap gets a 429 with Retry-After, no Claude call, and one log line', async () => {
  setCaps({ SHIN_CAP_CLAUDE_DEVICE_PER_DAY: '3' });
  const before = h.claude.asked.length;
  const statuses = [];
  let last;
  const lines = await captureLog(async () => {
    for (let i = 0; i < 6; i += 1) {
      last = await ask('device-cap-claude-0001', '198.51.100.21');
      statuses.push(last.status);
    }
  });
  assert.deepEqual(statuses, [200, 200, 200, 429, 429, 429]);
  assert.equal(h.claude.asked.length - before, 3, 'Claude was called past the cap');
  assert.ok(Number(last.headers.get('retry-after')) > 0, 'a 429 with no Retry-After');
  const body = await last.json();
  assert.equal(body.cap, 'claude');
  assert.match(body.error, /try again tomorrow/i);
  assert.equal(lines.length, 1, `expected one log line, got ${lines.length}`);
  assert.match(lines[0], /claude cap of 3 a day reached for device device-c/);
});

test('Claude answers: fresh phone ids from one address stop at the address cap, and another address is untouched', async () => {
  setCaps({ SHIN_CAP_CLAUDE_IP_PER_DAY: '4' });
  const before = h.claude.asked.length;
  const statuses = [];
  const lines = await captureLog(async () => {
    for (let i = 0; i < 7; i += 1) statuses.push((await ask(`device-cap-fresh-${i}-0002`, '198.51.100.22')).status);
  });
  assert.deepEqual(statuses, [200, 200, 200, 200, 429, 429, 429]);
  assert.equal(h.claude.asked.length - before, 4);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /claude cap of 4 a day reached for address 198\.51\.100\.22/);
  assert.equal((await ask('device-cap-other-0003', '192.0.2.99')).status, 200, 'an honest shopper was refused for a stranger`s use');
});

test('Claude answers: with no Claude call needed the cap is never touched', async () => {
  setCaps({ SHIN_CAP_CLAUDE_DEVICE_PER_DAY: '1', SHIN_CAP_CLAUDE_IP_PER_DAY: '1' });
  for (let i = 0; i < 5; i += 1) {
    const r = await h.get('/api/health', { 'cf-connecting-ip': '198.51.100.23' });
    assert.notEqual(r.status, 429);
  }
});

test('typed prices: corrections past the per-phone cap are a 429 with Retry-After and one log line', async () => {
  setCaps({ SHIN_CAP_PRICE_DEVICE_PER_DAY: '3' });
  const post = (i) =>
    h.post('/api/correction', { clientId: `cap-corr-${i}`, deviceId: 'device-cap-price-0004' }, { 'cf-connecting-ip': '198.51.100.24' });
  const statuses = [];
  let last;
  const lines = await captureLog(async () => {
    for (let i = 0; i < 6; i += 1) {
      last = await post(i);
      statuses.push(last.status);
    }
  });
  assert.deepEqual(statuses, [200, 200, 200, 429, 429, 429]);
  assert.ok(Number(last.headers.get('retry-after')) > 0);
  const body = await last.json();
  assert.equal(body.cap, 'price');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /price cap of 3 a day reached for device device-c/);
});

test('typed prices: shelf prices stop at the per-address cap across fresh phone ids', async () => {
  setCaps({ SHIN_CAP_PRICE_IP_PER_DAY: '3' });
  const statuses = [];
  for (let i = 0; i < 6; i += 1) {
    const r = await h.post('/api/scan-price', { deviceId: `device-cap-shelf-${i}-0005`, scanId: 1 }, { 'cf-connecting-ip': '198.51.100.25' });
    statuses.push(r.status === 429 ? 429 : 'ok');
  }
  assert.deepEqual(statuses, ['ok', 'ok', 'ok', 429, 429, 429]);
});

test('a caller on this machine itself is not counted (the operator and the suite)', async () => {
  setCaps({ SHIN_CAP_PRICE_DEVICE_PER_DAY: '1', SHIN_CAP_PRICE_IP_PER_DAY: '1' });
  for (let i = 0; i < 4; i += 1) {
    const r = await h.post('/api/correction', { clientId: `cap-local-${i}`, deviceId: 'device-cap-local-0006' }, {});
    assert.equal(r.status, 200);
  }
});
