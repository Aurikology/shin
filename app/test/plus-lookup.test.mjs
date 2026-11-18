/**
 * The RevenueCat check behind Pexi Plus (readiness R19, R27): a shopper who has just paid is not
 * kept waiting on a "not Plus" answer from ten minutes ago, a hung or failing RevenueCat does not
 * strip a subscriber of Plus, and every failure is counted where the health body can read it.
 * RevenueCat is a fake; nothing leaves the machine.
 */
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPlus,
  setEntitlementFetchForTests,
  setEntitlementTimeoutForTests,
  entitlementLookupHealth,
} from '../src/scan-quota.ts';
import { bindDevice } from '../src/device-key.ts';

const ENV = { REVENUECAT_SECRET_KEY: 'rc_test_key_not_real' };
const DEV = 'device-plus-lookup-01';
const phone = (extra = {}) => ({ 'x-shin-device': DEV, 'x-shin-device-key': 'keyPlusLookup0123456789', ...extra });
bindDevice(phone());

let plus = false;
let asked = 0;
const answer = () => ({
  ok: true,
  status: 200,
  json: async () => ({
    subscriber: { entitlements: plus ? { plus: { expires_date: new Date(Date.now() + 86_400_000).toISOString() } } : {} },
  }),
});

beforeEach(() => {
  plus = false;
  asked = 0;
  setEntitlementTimeoutForTests(null);
  setEntitlementFetchForTests(async () => {
    asked += 1;
    return answer();
  });
});
after(() => {
  setEntitlementFetchForTests(null);
  setEntitlementTimeoutForTests(null);
});

const T0 = new Date('2026-11-18T12:00:00Z');
const later = (ms) => new Date(T0.getTime() + ms);

test('R19: a device cached as not Plus is re-checked at once when the phone says it is Plus', async () => {
  assert.equal(await isPlus(DEV, phone(), ENV, T0), false);
  assert.equal(asked, 1);
  plus = true; // the shopper pays
  assert.equal(await isPlus(DEV, phone(), ENV, later(5_000)), false, 'without the hint the cache still answers');
  assert.equal(asked, 1);
  assert.equal(await isPlus(DEV, phone({ 'x-shin-plus': '1' }), ENV, later(6_000)), true, 'the hint did not force a re-check');
  assert.equal(asked, 2);
});

test('R19: the hint is only a reason to ask RevenueCat; it never makes a device Plus by itself', async () => {
  assert.equal(await isPlus(DEV, phone(), ENV, T0), false);
  assert.equal(await isPlus(DEV, phone({ 'x-shin-plus': '1' }), ENV, later(1_000)), false);
});

test('R19: a hinted re-check happens at most once a minute per device', async () => {
  const hint = phone({ 'x-shin-plus': '1' });
  await isPlus(DEV, hint, ENV, T0);
  asked = 0;
  for (let i = 1; i <= 20; i += 1) await isPlus(DEV, hint, ENV, later(i * 1_000));
  assert.equal(asked, 1, `${asked} RevenueCat calls in 20 seconds from one device`);
  await isPlus(DEV, hint, ENV, later(70_000));
  assert.equal(asked, 2, 'a minute later the device may be re-checked again');
});

test('R19: a hinted device with an unproven id is still never looked up', async () => {
  const stranger = { 'x-shin-device': 'device-never-bound-01', 'x-shin-plus': '1' };
  assert.equal(await isPlus('device-never-bound-01', stranger, ENV, T0), false);
  assert.equal(asked, 0);
});

test('R27: a RevenueCat call that never answers is cut off, counted, and a recent subscriber stays Plus', async () => {
  plus = true;
  assert.equal(await isPlus(DEV, phone(), ENV, T0), true);
  const before = entitlementLookupHealth();
  setEntitlementTimeoutForTests(30);
  setEntitlementFetchForTests(async () => new Promise(() => {})); // hangs for ever
  const started = Date.now();
  assert.equal(await isPlus(DEV, phone(), ENV, later(11 * 60_000)), true, 'a subscriber seen an hour ago lost Plus in an outage');
  assert.ok(Date.now() - started < 2_000, 'the call was not cut off');
  const after = entitlementLookupHealth();
  assert.equal(after.failures, before.failures + 1);
  assert.equal(after.consecutiveFailures, before.consecutiveFailures + 1);
  assert.match(after.lastFailure ?? '', /did not answer/);
  assert.equal(typeof after.lastFailureAt, 'string');
});

test('R27: an error status is counted and a success resets the streak', async () => {
  setEntitlementFetchForTests(async () => ({ ok: false, status: 401, json: async () => ({}) }));
  const a = entitlementLookupHealth();
  await isPlus(DEV, phone(), ENV, T0);
  await isPlus(DEV, phone(), ENV, later(2 * 60_000));
  const b = entitlementLookupHealth();
  assert.equal(b.failures, a.failures + 2);
  assert.ok(b.consecutiveFailures >= 2);
  assert.match(b.lastFailure ?? '', /401/);
  setEntitlementFetchForTests(async () => answer());
  await isPlus(DEV, phone(), ENV, later(4 * 60_000));
  assert.equal(entitlementLookupHealth().consecutiveFailures, 0);
});

test('R27: a subscriber is still Plus after a restart if RevenueCat is down (remembered on disk for a day)', async () => {
  plus = true;
  assert.equal(await isPlus(DEV, phone(), ENV, T0), true);
  setEntitlementFetchForTests(async () => {
    throw new Error('connect ECONNREFUSED');
  }); // also empties the in-memory cache, as a restart does
  assert.equal(await isPlus(DEV, phone(), ENV, later(60 * 60_000)), true, 'lost Plus across a restart in an outage');
});

test('R27: after a day without a successful answer, an outage no longer grants Plus to someone who was last seen long ago', async () => {
  plus = true;
  await isPlus(DEV, phone(), ENV, T0);
  setEntitlementFetchForTests(async () => {
    throw new Error('connect ECONNREFUSED');
  });
  assert.equal(await isPlus(DEV, phone(), ENV, later(26 * 60 * 60_000)), false);
});
