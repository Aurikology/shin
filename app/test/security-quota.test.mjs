/**
 * Attack tests for the weekly scan allowance and Pexi Plus, V3 (b) of the 2026-11-16 check.
 * Each test asserts the SAFE behaviour; a failure is a hole. See security-routes.test.mjs for the
 * conventions, and store-security.test.ts for what is already covered (x-shin-plus without a key,
 * and the per-address free-scan cap).
 *
 * RevenueCat is a fake that counts calls: nothing leaves the machine. Requests carry no
 * cf-connecting-ip, so they read as local and the per-address limits stay out of the way; these
 * tests are about the per-device allowance. The address limits are in security-cost.test.mjs.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './security-harness.mjs';
import { setEntitlementFetchForTests } from '../src/scan-quota.ts';

const h = await boot({
  products: 5,
  consent: true,
  env: {
    SHIN_FREE_SCANS_PER_WEEK: '3',
    SHIN_PLUS_SCANS_PER_WEEK: '6',
    REVENUECAT_SECRET_KEY: 'rc_test_key_not_real',
  },
});
const rc = { urls: [], plus: new Set() };
setEntitlementFetchForTests(async (url) => {
  rc.urls.push(url);
  const id = decodeURIComponent(url.split('/subscribers/')[1] ?? '');
  const entitlements = rc.plus.has(id) ? { plus: { expires_date: new Date(Date.now() + 86_400_000).toISOString() } } : {};
  return { ok: true, status: 200, json: async () => ({ subscriber: { entitlements } }) };
});
after(async () => {
  setEntitlementFetchForTests(null);
  await h.close();
});

const scan = (device, headers, i = 0, query = '') =>
  h.get(`/api/identify?gtin=${h.codes[i % 5]}&countryCode=CA&region=Ontario&deviceId=${device}${query}`, headers);
const quota = async (device, headers) => (await h.get(`/api/quota?deviceId=${device}`, headers)).json();

test('b1: no header, field or URL value makes a free device Plus when RevenueCat is the judge', async () => {
  const dev = 'device-quota-0001';
  const hdr = h.phone(dev, 'keyQ1QQQQQQQQQQQQQQQQQQ');
  for (const extra of [
    { 'x-shin-plus': '1' },
    { 'x-shin-plus': 'true' },
    { 'x-shin-plus': 'plus' },
    { 'x-shin-entitlement': 'plus' },
    { 'x-revenuecat-plus': '1' },
    { 'x-shin-trust-client': '1' },
  ]) {
    const q = await quota(dev, { ...hdr, ...extra });
    assert.equal(q.plus, false, `${JSON.stringify(extra)} made the device Plus`);
    assert.equal(q.limit, 3);
  }
  const viaUrl = await (await h.get(`/api/quota?deviceId=${dev}&plus=1&plan=plus&entitlement=plus`, hdr)).json();
  assert.equal(viaUrl.plus, false);
});

test('b2: a free device is stopped at its weekly allowance, with 402, before anything is read', async () => {
  const dev = 'device-quota-0002';
  const hdr = h.phone(dev, 'keyQ2QQQQQQQQQQQQQQQQQQ');
  for (let i = 0; i < 3; i += 1) assert.equal((await scan(dev, hdr, i)).status, 200);
  const fourth = await scan(dev, hdr, 3);
  assert.equal(fourth.status, 402);
  assert.equal((await fourth.json()).error, 'scan_limit');
});

test('b3: the allowance follows the phone, not a device id typed into the URL (a new id does not reset it)', async () => {
  const dev = 'device-quota-0003';
  const hdr = h.phone(dev, 'keyQ3QQQQQQQQQQQQQQQQQQ');
  for (let i = 0; i < 3; i += 1) assert.equal((await scan(dev, hdr, i)).status, 200);
  assert.equal((await scan(dev, hdr, 3)).status, 402, 'set-up: the named device should be at its limit');
  let answered = 0;
  for (let n = 0; n < 5; n += 1) {
    // Same phone, same key, same x-shin-device header; only the deviceId in the URL changes.
    const r = await scan(`fresh-quota-id-${n}000`, hdr, n);
    if (r.status === 200) answered += 1;
  }
  assert.equal(answered, 0, `the same phone got ${answered} more free scans by naming fresh ids in the URL`);
});

test('b4: a Plus device that is not yours cannot be borrowed, with no key or with the wrong key', async () => {
  const plusId = 'device-quota-plus-0004';
  rc.plus.add(plusId);
  const owner = h.phone(plusId, 'keyOWNEROWNEROWNEROWN');
  assert.equal((await quota(plusId, owner)).plus, true, 'set-up: the owner is Plus');
  for (const headers of [{}, h.phone(plusId, 'keyTHIEFTHIEFTHIEFTHIEF'), { 'x-shin-device': plusId }]) {
    const q = await h.get(`/api/quota?deviceId=${plusId}`, headers);
    assert.equal(q.status, 403, `Plus device read as ${q.status} with ${JSON.stringify(Object.keys(headers))}`);
    const s = await scan(plusId, headers);
    assert.equal(s.status, 403, `Plus device scanned as ${s.status} with ${JSON.stringify(Object.keys(headers))}`);
  }
});

test('b5: a Plus device that was never bound to a key is not borrowable by naming it (legacy window)', async () => {
  const plusId = 'device-quota-plus-0005';
  rc.plus.add(plusId);
  const q = await h.get(`/api/quota?deviceId=${plusId}`, {});
  assert.equal(q.status, 403, 'anyone naming an unbound Plus device id reads as that Plus subscriber');
});

test('b6: a Plus device is stopped at the Plus cap, and the refusal says so', async () => {
  const plusId = 'device-quota-plus-0006';
  rc.plus.add(plusId);
  const hdr = h.phone(plusId, 'keyP6PPPPPPPPPPPPPPPPPP');
  for (let i = 0; i < 6; i += 1) assert.equal((await scan(plusId, hdr, i)).status, 200);
  const over = await scan(plusId, hdr, 1);
  assert.equal(over.status, 402);
  assert.equal((await over.json()).plus, true);
});

test('b7: a device id made of dots or slashes cannot change which RevenueCat record is asked about', async () => {
  const before = rc.urls.length;
  for (const id of ['..', '.', '%2e%2e', 'a%2Fb', 'x%00y']) {
    await h.get(`/api/quota?deviceId=${id}`, {});
  }
  for (const url of rc.urls.slice(before)) {
    const tail = url.split('/v1/subscribers/')[1] ?? '';
    assert.ok(tail !== '' && !/^\.+$/.test(tail) && !tail.includes('/'), `RevenueCat was asked for ${url}`);
  }
});

test('b8: made-up device ids do not each cost a RevenueCat lookup with the secret key', async () => {
  const before = rc.urls.length;
  for (let i = 0; i < 30; i += 1) await h.get(`/api/quota?deviceId=made-up-${i}-aaaaaaaa`, {});
  assert.ok(rc.urls.length - before <= 10, `30 made-up devices cost ${rc.urls.length - before} RevenueCat lookups`);
});

test('b9: a free device cannot make Claude calls beyond its weekly allowance by typing names', async () => {
  const dev = 'device-quota-0009';
  const hdr = { ...h.phone(dev, 'keyQ9QQQQQQQQQQQQQQQQQQ'), 'x-shin-claude': '1' };
  const before = h.claude.asked.length;
  for (let i = 0; i < 12; i += 1) {
    await h.get(`/api/identify?text=${encodeURIComponent(`Zzqx Unlisted Thing ${i} Alpha`)}&countryCode=CA&region=Ontario&deviceId=${dev}`, hdr);
  }
  const sent = h.claude.asked.length - before;
  assert.ok(sent <= 3, `one free device made ${sent} Claude calls in one go, its weekly allowance is 3`);
});

test('b10: with no admin token configured, no empty or placeholder header opens the admin routes', async () => {
  for (const v of [undefined, '', ' ', 'undefined', 'null', 'false', '0']) {
    const headers = v === undefined ? {} : { 'x-shin-admin': v };
    for (const path of ['/api/admin/tables', '/api/admin/people', '/api/admin/access', '/api/admin/shutter', '/api/admin/file?path=access.log']) {
      const r = await h.get(path, headers);
      assert.ok([401, 403, 404].includes(r.status), `${path} answered ${r.status} to ${JSON.stringify(v)} with no token set`);
    }
    const sql = await h.postRaw('/api/admin/sql', 'SELECT 1', headers);
    assert.ok([401, 403, 404].includes(sql.status), `sql answered ${sql.status} to ${JSON.stringify(v)}`);
  }
});
