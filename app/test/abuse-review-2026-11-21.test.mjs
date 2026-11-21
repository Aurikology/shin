/**
 * The abuse review of 2026-11-21 (docs/readiness/review-2026-11-21/abuse.jsonl lines 1 to 7, blind.jsonl
 * lines 6 and 13; launch gaps 48, 49, 56), each attack replayed against a server started in this process
 * (security-harness.mjs: temp databases, fake RevenueCat, fake Claude). Requests carry cf-connecting-ip as
 * the Cloudflare tunnel does, so every per-address limit applies. Each test asserts the SAFE behaviour.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { boot } from './security-harness.mjs';
import * as quota from '../src/scan-quota.ts';
import * as limits from '../src/rate-limit.ts';
import { bindDevice } from '../src/device-key.ts';
import * as rangeStore from '../../identify/src/range-ask-store.ts';

// Namespace imports with the intended values as fallbacks, so each attack runs (and is seen to succeed)
// against a build from before these fixes, instead of the whole file failing at import.
const { setEntitlementFetchForTests, isPlus } = quota;
const ENTITLEMENT_CACHE_MAX = quota.ENTITLEMENT_CACHE_MAX ?? 10_000;
const entitlementCacheSize = () => {
  assert.equal(typeof quota.entitlementCacheSize, 'function', 'the answer cache size cannot be read');
  return quota.entitlementCacheSize();
};
const { networkOf } = limits;
const addressKey = (a) => {
  assert.equal(typeof limits.addressKey, 'function', 'there is no per-address key that counts an IPv6 /64');
  return limits.addressKey(a);
};
const FRESH_ID_FREE_SCANS = limits.FRESH_ID_FREE_SCANS ?? 3;
const { readRangeStore } = rangeStore;
/** The day's share of the month: the store's own, or the intended formula when it has none. */
function dailyShare(limit, before, nowMs) {
  if (typeof rangeStore.dailyShare === 'function') return rangeStore.dailyShare(limit, before, nowMs);
  const d = new Date(nowMs);
  const daysLeft = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() - d.getUTCDate() + 1;
  const left = Math.max(0, limit - before);
  return Math.max(Math.min(left, 50), Math.ceil((2 * left) / daysLeft));
}

const ADMIN = 'admin-token-for-the-abuse-tests-0001';
const CAP = 1000;
const h = await boot({
  products: 10,
  consent: true,
  env: {
    SHIN_FREE_SCANS_PER_WEEK: '10',
    REVENUECAT_SECRET_KEY: 'rc_test_key_not_real',
    SHIN_ADMIN_TOKEN: ADMIN,
    SHIN_RANGE_ASK_MONTHLY_CAP: String(CAP),
  },
});
const rc = { lookups: 0, plus: new Set() };
function fakeRevenueCat() {
  setEntitlementFetchForTests(async (url) => {
    rc.lookups += 1;
    const id = decodeURIComponent(url.split('/subscribers/')[1] ?? '');
    const entitlements = rc.plus.has(id) ? { plus: { expires_date: new Date(Date.now() + 86_400_000).toISOString() } } : {};
    return { ok: true, status: 200, json: async () => ({ subscriber: { entitlements } }) };
  });
}
fakeRevenueCat();
after(async () => {
  setEntitlementFetchForTests(null);
  h.mod.setEventDiskFreeForTests?.(null);
  await h.close();
});

/** A phone's headers through the tunnel from `ip`. */
const at = (ip, id, key, extra = {}) => ({ 'cf-connecting-ip': ip, ...(id ? h.phone(id, key) : {}), ...extra });
const keyFor = (id) => `key${id.replace(/[^A-Za-z0-9]/g, '')}abcdefghijklmnop`.slice(0, 40);
const scan = (id, headers, i = 0) =>
  h.get(`/api/identify?gtin=${h.codes[i % h.codes.length]}&countryCode=CA&region=Ontario&deviceId=${id}`, headers);
/** Scans until the first non-200 (or `max`), and says how many were answered. */
async function scansAnswered(id, ip, max = 15, extra = {}) {
  let n = 0;
  for (let i = 0; i < max; i += 1) {
    const r = await scan(id, at(ip, id, keyFor(id), extra), i);
    await r.arrayBuffer();
    if (r.status !== 200) break;
    n += 1;
  }
  return n;
}

/* ---------------------------------------------------- abuse 1, gap 49: RevenueCat budget */

test('abuse 1: 130 made-up phones a minute from one address no longer hide a shopper who just paid', async () => {
  h.mod.resetPaidCallLimitersForTests({});
  fakeRevenueCat();
  const buyer = 'buyer-device-0001-aaaa';
  const home = '198.51.100.44';
  assert.equal(await scansAnswered(buyer, home), 10, 'set-up: the buyer uses the free week');
  const before = rc.lookups;
  for (let i = 0; i < 130; i += 1) {
    const id = `flood-quota-${i}-zzzzzz`;
    // Half say they bought (x-shin-plus: 1), half do not, all from one address.
    const extra = i % 2 === 0 ? { 'x-shin-plus': '1' } : {};
    const r = await h.get(`/api/quota?deviceId=${id}`, at('203.0.113.9', id, keyFor(id), extra));
    await r.arrayBuffer();
  }
  const floodLookups = rc.lookups - before;
  assert.ok(floodLookups <= 30, `the flood cost ${floodLookups} RevenueCat lookups`);
  // The purchase lands at RevenueCat; the phone now says Plus.
  rc.plus.add(buyer);
  const paid = await scan(buyer, at(home, buyer, keyFor(buyer), { 'x-shin-plus': '1' }), 3);
  assert.equal(paid.status, 200, `the shopper who just paid got ${paid.status}`);
  const q = await (await h.get(`/api/quota?deviceId=${buyer}`, at(home, buyer, keyFor(buyer), { 'x-shin-plus': '1' }))).json();
  assert.equal(q.plus, true);
  // A shopper who bought on the first screens, before any scan, on another network, in the same minute.
  const early = 'early-buyer-0001-cccc';
  rc.plus.add(early);
  const e = await (await h.get(`/api/quota?deviceId=${early}`, at('198.51.100.45', early, keyFor(early), { 'x-shin-plus': '1' }))).json();
  assert.equal(e.plus, true, 'a buyer with no scans yet was answered as free');
});

test('abuse 1: a hinted flood from 40 networks does not hide a buyer who scanned before paying', async () => {
  h.mod.resetPaidCallLimitersForTests({});
  fakeRevenueCat();
  const buyer = 'buyer-device-0002-bbbb';
  assert.equal(await scansAnswered(buyer, '198.51.100.46'), 10, 'set-up: the buyer uses the free week');
  for (let net = 0; net < 40; net += 1) {
    for (let k = 0; k < 4; k += 1) {
      const id = `hint-flood-${net}-${k}-yyyy`;
      const r = await h.get(`/api/quota?deviceId=${id}`, at(`2001:db8:${net.toString(16)}:7::${k + 1}`, id, keyFor(id), { 'x-shin-plus': '1' }));
      await r.arrayBuffer();
    }
  }
  rc.plus.add(buyer);
  const paid = await scan(buyer, at('198.51.100.46', buyer, keyFor(buyer), { 'x-shin-plus': '1' }), 4);
  assert.equal(paid.status, 200, `the shopper who just paid got ${paid.status}`);
  // A subscriber RevenueCat already confirmed keeps Plus through any flood.
  const q = await (await h.get(`/api/quota?deviceId=${buyer}`, at('198.51.100.46', buyer, keyFor(buyer), { 'x-shin-plus': '1' }))).json();
  assert.equal(q.plus, true);
});

/* ---------------------------------------------------- abuse 3, blind 6, gap 48: fresh ids */

test('abuse 3: a new phone id on the same address is not a new week of free scans', async () => {
  h.mod.resetPaidCallLimitersForTests({});
  fakeRevenueCat();
  const ip = '198.51.100.60';
  assert.equal(await scansAnswered('home-phone-0001-p1', ip), 10, 'set-up: the real phone uses its week');
  const got = [];
  for (let n = 0; n < 10; n += 1) got.push(await scansAnswered(`fresh-id-p1-${n}-xxxx`, ip));
  // The first fresh ids (before the address has three spent phones) still get their 10; after that, a few each.
  const extra = got.reduce((a, b) => a + b, 0);
  assert.ok(got.slice(2).every((n) => n <= FRESH_ID_FREE_SCANS), `fresh ids got ${got.join(',')}`);
  assert.ok(got.every((n) => n >= 1), `a fresh id was refused its first scan: ${got.join(',')}`);
  assert.ok(extra <= 20 + 8 * FRESH_ID_FREE_SCANS, `fresh ids got ${extra} more free scans (${got.join(',')})`);
});

test('blind 6: on a busy store Wi-Fi a new shopper still gets their first scans, and a regular gets all 10', async () => {
  h.mod.resetPaidCallLimitersForTests({});
  fakeRevenueCat();
  const store = '198.51.100.61';
  // Sixty shoppers, two scans each, nobody near their week: nobody is refused.
  for (let i = 0; i < 60; i += 1) assert.equal(await scansAnswered(`shopper-${i}-wifi`, store, 2), 2, `shopper ${i} was refused`);
  // A regular whose first scan was two days ago.
  const regular = 'regular-shopper-0001';
  assert.equal(await scansAnswered(regular, '198.51.100.99', 1), 1);
  // Back-date its scan in the temp store. The shown-answer guard forbids edits, so it is lifted for this one
  // update and put back exactly as it was.
  const db = new DatabaseSync(process.env.SHIN_SCANS);
  const guard = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'scan_shown_answer_immutable'").get();
  db.exec('DROP TRIGGER IF EXISTS scan_shown_answer_immutable');
  db.prepare('UPDATE scan SET scanned_at = ? WHERE device_id = ?').run(new Date(Date.now() - 2 * 86_400_000).toISOString(), regular);
  if (guard?.sql) db.exec(guard.sql);
  db.close();
  // Three phones use up their week on the store's address.
  for (let i = 0; i < 3; i += 1) assert.equal(await scansAnswered(`heavy-${i}-wifi`, store), 10);
  // A shopper new today: the first scans answer.
  assert.equal(await scansAnswered('brand-new-shopper-1', store), FRESH_ID_FREE_SCANS);
  // The regular is not touched by the new-phone rule: the other 9 of the week answer.
  assert.equal(await scansAnswered(regular, store), 9);
});

/* ---------------------------------------------------- abuse 2: IPv6 counts the /64 */

test('abuse 2: the door counts an IPv6 /64, not each of its addresses', async () => {
  h.mod.resetPaidCallLimitersForTests({ SHIN_RATE_DOOR_IP_PER_10MIN: '50' });
  let refused = 0;
  for (let i = 0; i < 300; i += 1) {
    const r = await h.get('/api/categories', { 'cf-connecting-ip': `2001:db8:99:1::${(i + 1).toString(16)}` });
    await r.arrayBuffer();
    if (r.status === 429) refused += 1;
  }
  assert.ok(refused >= 250, `300 requests from one /64 against a door of 50: ${refused} refused`);
});

test('abuse 2: the free-scan address ceiling counts an IPv6 /64', async () => {
  h.mod.resetPaidCallLimitersForTests({ SHIN_FREE_SCANS_PER_IP_DAY: '20' });
  fakeRevenueCat();
  let answered = 0;
  for (let i = 0; i < 40; i += 1) {
    const id = `v6-rotator-${i}-qqqq`;
    if ((await scansAnswered(id, `2001:db8:10:1:${(i + 1).toString(16)}::5`, 1)) === 1) answered += 1;
  }
  assert.ok(answered <= 20, `${answered} of 40 free scans answered from one /64 against a ceiling of 20`);
});

test('abuse 2: address keys and networks read compressed IPv6 the same as written out', () => {
  assert.equal(addressKey('2001:db8::1'), addressKey('2001:0db8:0000:0000:0000:0000:0000:0002'));
  assert.equal(addressKey('2001:db8:10:1::5'), '2001:db8:10:1::/64');
  assert.equal(addressKey('2001:DB8:10:1:aaaa:bbbb:cccc:dddd'), '2001:db8:10:1::/64');
  assert.notEqual(addressKey('2001:db8:10:1::5'), addressKey('2001:db8:10:2::5'));
  assert.equal(addressKey('fe80::1%en0'), 'fe80:0:0:0::/64');
  assert.equal(addressKey('203.0.113.7'), '203.0.113.7');
  assert.equal(addressKey('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(networkOf('2001:db8::1'), networkOf('2001:db8:0:0::ffff'));
  assert.equal(networkOf('2001:db8:1:2:3:4:5:6'), '2001:db8:1:2::/64');
});

/* ---------------------------------------------------- abuse 4, gap 56: events */

const junkEvents = (n, idOf) => Array.from({ length: n }, (_, j) => ({ deviceId: idOf(j), type: 'scan_shown', payload: { p: 'x'.repeat(200) } }));

test('abuse 4: one made-up phone cannot write more than its day of events', async () => {
  h.mod.resetPaidCallLimitersForTests({});
  let stored = 0;
  for (let r = 0; r < 11; r += 1) {
    const res = await h.post('/api/events/batch', { events: junkEvents(200, () => 'junk-events-device-0001') }, { 'cf-connecting-ip': '198.51.100.70' });
    stored += (await res.json()).stored;
  }
  assert.ok(stored <= 2_000, `one phone wrote ${stored} events in a day`);
});

test('abuse 4: one address rotating made-up phones cannot write more than its day of events', async () => {
  h.mod.resetPaidCallLimitersForTests({});
  let stored = 0;
  for (let r = 0; r < 105; r += 1) {
    const res = await h.post('/api/events/batch', { events: junkEvents(200, (j) => `junk-${r}-${j}-yyyy`) }, { 'cf-connecting-ip': '2001:db8:70::1' });
    stored += (await res.json()).stored;
  }
  assert.ok(stored <= 20_000, `one address wrote ${stored} events in a day`);
});

test('abuse 4: below the free-disk floor no event is written (507)', async () => {
  h.mod.resetPaidCallLimitersForTests({});
  assert.equal(typeof h.mod.setEventDiskFreeForTests, 'function', 'the disk check has no test seam');
  h.mod.setEventDiskFreeForTests(() => 0);
  try {
    const res = await h.post('/api/events/batch', { events: junkEvents(5, () => 'disk-test-device-01') }, { 'cf-connecting-ip': '198.51.100.71' });
    assert.equal(res.status, 507);
    const one = await h.post('/api/event', { deviceId: 'disk-test-device-01', type: 'x' }, { 'cf-connecting-ip': '198.51.100.71' });
    assert.equal(one.status, 507);
  } finally {
    h.mod.setEventDiskFreeForTests(null);
  }
});

/* ---------------------------------------------------- health: blind 13, abuse 6 */

test('blind 13: the public health body carries no weak-moment detail; the admin token and this machine get it all', async () => {
  const pub = await h.get('/api/health', { 'cf-connecting-ip': '198.51.100.80' });
  const text = await pub.text();
  const body = JSON.parse(text);
  assert.deepEqual(Object.keys(body).sort(), ['catalogueUp', 'hammerRefreshedAt', 'ok', 'scanLog', 'startedAt', 'uptimeSeconds', 'watch']);
  // gap 96: plus `problems`, an array of short non-security codes only (never words, never fileVault/keys/account)
  assert.deepEqual(Object.keys(body.watch), ['ok', 'problems']);
  assert.match(text, /"watch":\{"ok":(true|false),"problems":\[/);
  assert.ok(Array.isArray(body.watch.problems) && body.watch.problems.every((c) => typeof c === 'string' && /^[a-z_]{3,40}$/.test(c)));
  assert.doesNotMatch(JSON.stringify(body.watch), /fileVault|account|salt|revenuecat|refused/i);
  if (body.watch.ok === false) assert.ok(body.watch.problems.length > 0, 'a failing watch names at least one public code in this harness (no backup folder is configured)');
  const admin = await (await h.get('/api/health', { 'cf-connecting-ip': '198.51.100.80', 'x-shin-admin': ADMIN })).json();
  assert.ok(Array.isArray(admin.watch.problems));
  assert.ok('claudeMonthlyCap' in admin && 'diskFreeGb' in admin);
  const local = await (await h.get('/api/health')).json();
  assert.ok(Array.isArray(local.watch.problems), 'the dead-man ping on the Mac reads problems locally');
});

test('abuse 6: refusal counts and the RevenueCat budget are on the health body', async () => {
  const admin = await (await h.get('/api/health', { 'x-shin-admin': ADMIN })).json();
  assert.equal(typeof admin.refusals?.total, 'number');
  assert.equal(typeof admin.refusals?.byName, 'object');
  assert.ok(admin.refusals.total > 0, 'the tests above were refused, and the count says so');
  for (const pool of ['subscriber', 'buyer', 'newBuyer', 'noHint', 'hintedAddress']) {
    assert.equal(typeof admin.revenueCatLookups?.refusedByPool?.[pool], 'number', `no ${pool} count`);
  }
  assert.equal(typeof admin.revenueCatLookups.cachedAnswers, 'number');
  assert.equal(typeof admin.freeScanNewPhoneRefusals, 'number');
  assert.equal(typeof admin.claudeDailyShare?.refusedAsks, 'number');
});

/* ---------------------------------------------------- abuse 5, gap 56: Claude */

const ask = (name, id, ip) =>
  h.get(`/api/identify?text=${encodeURIComponent(name)}&countryCode=CA&region=Ontario&deviceId=${id}`, at(ip, id, keyFor(id), { 'x-shin-claude': '1' }));

test('abuse 5: one IPv6 /64 rotating addresses and phone ids gets at most 30 Claude asks in ten minutes', async () => {
  h.mod.resetPaidCallLimitersForTests({});
  const before = h.claude.asked.length;
  for (let i = 0; i < 60; i += 1) {
    const r = await ask(`Drain Product ${i} Oat Milk 1L`, `drain-one-${i}-xxxxx`, `2001:db8:500:1::${(i + 1).toString(16)}`);
    await r.arrayBuffer();
  }
  const asked = h.claude.asked.length - before;
  assert.ok(asked <= 30, `one /64 got ${asked} Claude asks`);
});

test('abuse 5: many networks together use at most the day\'s share of the month, so the month is not drained', async () => {
  h.mod.resetPaidCallLimitersForTests({});
  const startCalls = readRangeStore(process.env.SHIN_RANGE_ASK_STORE_PATH, Date.now()).calls;
  for (let net = 0; net < 24; net += 1) {
    for (let k = 0; k < 30; k += 1) {
      const r = await ask(`Many Net ${net} Item ${k} Juice 2L`, `drain-many-${net}-${k}-x`, `2001:db8:${(0x600 + net).toString(16)}:1::${(k + 1).toString(16)}`);
      await r.arrayBuffer();
    }
  }
  const s = readRangeStore(process.env.SHIN_RANGE_ASK_STORE_PATH, Date.now());
  const share = dailyShare(CAP, s.dayStart ?? startCalls, Date.now());
  assert.ok(s.calls - (s.dayStart ?? 0) <= share, `today used ${s.calls - (s.dayStart ?? 0)} asks against a share of ${share}`);
  assert.ok(CAP - s.calls > 0, `the month was drained: ${s.calls} of ${CAP}`);
  if (share < 24 * 30) assert.ok(CAP - s.calls >= CAP - share, 'more than the day\'s share was spent');
});

test('abuse 5: a day whose share is used tells the shopper "later", as the monthly cap does', async () => {
  const { noRangeKey } = await import('../public/js/lib/catalogue-range.js');
  assert.equal(noRangeKey('daily_cap_reached'), noRangeKey('monthly_cap_reached'));
});

/* ---------------------------------------------------- abuse 7: the answer cache is bounded */

test('abuse 7: made-up ids cannot grow the RevenueCat answer cache without bound', async () => {
  fakeRevenueCat();
  let t = Date.now();
  for (let i = 0; i < ENTITLEMENT_CACHE_MAX + 600; i += 1) {
    const id = `cache-flood-${i}-zz`;
    const headers = { 'x-shin-device': id, 'x-shin-device-key': keyFor(id) };
    bindDevice(headers);
    await isPlus(id, headers, process.env, new Date(t));
    t += 3_100; // under every per-minute budget, so each id is really looked up
  }
  assert.ok(entitlementCacheSize() <= ENTITLEMENT_CACHE_MAX, `the cache holds ${entitlementCacheSize()} ids`);
});
