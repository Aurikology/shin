/**
 * Shopper prices: a price a shopper typed for a product Pexi already identified becomes a price the next
 * shopper benefits from (docs/decisions.md, 2026-11-15, "Shopper prices"). The trust rule, pinned here:
 *   - one per device per product per day (the first stands);
 *   - ignored when the product already has a centre and the price is below x0.33 or above x3 of it;
 *   - probe devices are never recorded;
 *   - all shoppers' prices for a product collapse into ONE voice (the median of each device's newest price).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  hasShopPrice,
  hasShopperPrice,
  isProbeDevice,
  removeOldShopperDeviceIds,
  saveShopperPrice,
  shopperPriceCount,
  shopperVoiceFor,
} from '../src/shopper-prices.ts';

const CODE = '0068100090011';
const base = { code: CODE, region: 'ON', store: 'Loblaws', seenOn: '2026-11-15', centreCents: null as number | null };

test('a first price is saved; the same device, product and day again is not', () => {
  const db = new DatabaseSync(':memory:');
  const a = saveShopperPrice(db, { ...base, deviceId: 'dev-a', priceCents: 599 });
  assert.equal(a.ok, true);
  const again = saveShopperPrice(db, { ...base, deviceId: 'dev-a', priceCents: 549 });
  assert.deepEqual(again, { ok: false, why: 'already_today' });
  assert.equal(shopperPriceCount(db, 'dev-a'), 1);
  // Another day, or another device, is a new price.
  assert.equal(saveShopperPrice(db, { ...base, deviceId: 'dev-a', priceCents: 549, seenOn: '2026-11-16' }).ok, true);
  assert.equal(saveShopperPrice(db, { ...base, deviceId: 'dev-b', priceCents: 549 }).ok, true);
  assert.equal(shopperPriceCount(db, 'dev-a'), 2);
  assert.equal(shopperPriceCount(db, 'dev-b'), 1);
});

test('leading zeros do not make a second product', () => {
  const db = new DatabaseSync(':memory:');
  assert.equal(saveShopperPrice(db, { ...base, deviceId: 'dev-a', priceCents: 599, code: '0068100090011' }).ok, true);
  assert.deepEqual(saveShopperPrice(db, { ...base, deviceId: 'dev-a', priceCents: 599, code: '68100090011' }), { ok: false, why: 'already_today' });
});

test('typo guard: below x0.33 or above x3 of an existing centre is ignored; the edges are kept', () => {
  const db = new DatabaseSync(':memory:');
  const t = (cents: number, i: number) => saveShopperPrice(db, { ...base, deviceId: `dev-${i}`, priceCents: cents, centreCents: 1000 });
  assert.deepEqual(t(329, 1), { ok: false, why: 'typo_guard' });
  assert.deepEqual(t(3001, 2), { ok: false, why: 'typo_guard' });
  assert.equal(t(330, 3).ok, true);
  assert.equal(t(3000, 4).ok, true);
  assert.equal(shopperPriceCount(db, 'dev-1'), 0);
});

test('with no centre there is nothing to guard against: any positive price is kept', () => {
  const db = new DatabaseSync(':memory:');
  assert.equal(saveShopperPrice(db, { ...base, deviceId: 'dev-a', priceCents: 5 }).ok, true);
});

test('probe devices are never recorded, whatever the case', () => {
  const db = new DatabaseSync(':memory:');
  assert.equal(isProbeDevice('probe-2026-11-15-ab12'), true);
  assert.equal(isProbeDevice('PROBE-e2e'), true);
  assert.equal(isProbeDevice('dev-probe'), false);
  assert.deepEqual(saveShopperPrice(db, { ...base, deviceId: 'probe-e2e-1', priceCents: 599 }), { ok: false, why: 'probe_device' });
  assert.equal(hasShopperPrice(db, CODE), false);
});

test('a price that is not a positive whole number of cents is refused', () => {
  const db = new DatabaseSync(':memory:');
  for (const c of [0, -5, 5.5, Number.NaN]) assert.deepEqual(saveShopperPrice(db, { ...base, deviceId: 'dev-a', priceCents: c }), { ok: false, why: 'bad_price' });
});

test('no store handle: nothing saved, said plainly', () => {
  assert.deepEqual(saveShopperPrice(null, { ...base, deviceId: 'dev-a', priceCents: 599 }), { ok: false, why: 'store_unavailable' });
  assert.equal(shopperPriceCount(null, 'dev-a'), 0);
  assert.equal(shopperVoiceFor(null, CODE, '2026-11-15'), null);
  assert.equal(hasShopperPrice(null, CODE), false);
});

test('the voice is one price: the median of each device\'s newest price, with its device count', () => {
  const db = new DatabaseSync(':memory:');
  saveShopperPrice(db, { ...base, deviceId: 'dev-a', priceCents: 500, seenOn: '2026-11-01', networkHash: 'net-a' });
  saveShopperPrice(db, { ...base, deviceId: 'dev-a', priceCents: 600, seenOn: '2026-11-10', networkHash: 'net-a' }); // dev-a's newest
  saveShopperPrice(db, { ...base, deviceId: 'dev-b', priceCents: 700, seenOn: '2026-11-12', networkHash: 'net-b' });
  saveShopperPrice(db, { ...base, deviceId: 'dev-c', priceCents: 650, seenOn: '2026-11-14', region: 'BC', networkHash: 'net-b' });
  const v = shopperVoiceFor(db, CODE, '2026-11-15')!;
  assert.equal(v.devices, 3);
  assert.equal(v.cents, 650); // median of 600, 650, 700
  assert.equal(v.seenOn, '2026-11-14');
  assert.equal(v.region, 'BC'); // the newest reading's region
  assert.equal(shopperVoiceFor(db, '999', '2026-11-15'), null);
});

test('four devices average their middle pair (the bar for a voice at all is in shopper-voice-agreement.test.ts)', () => {
  const db = new DatabaseSync(':memory:');
  saveShopperPrice(db, { ...base, deviceId: 'dev-a', priceCents: 599, networkHash: 'net-a' });
  saveShopperPrice(db, { ...base, deviceId: 'dev-b', priceCents: 649, networkHash: 'net-b' });
  saveShopperPrice(db, { ...base, deviceId: 'dev-c', priceCents: 599, networkHash: 'net-a' });
  saveShopperPrice(db, { ...base, deviceId: 'dev-d', priceCents: 649, networkHash: 'net-b' });
  assert.equal(shopperVoiceFor(db, CODE, '2026-11-15')!.cents, 624);
});

test('prices older than 180 days, or dated after today, are not in the voice', () => {
  const db = new DatabaseSync(':memory:');
  saveShopperPrice(db, { ...base, deviceId: 'dev-old', priceCents: 100, seenOn: '2026-01-01' });
  saveShopperPrice(db, { ...base, deviceId: 'dev-future', priceCents: 900, seenOn: '2026-12-25' });
  assert.equal(shopperVoiceFor(db, CODE, '2026-11-15'), null);
  assert.equal(hasShopperPrice(db, CODE), true, 'a price on file still counts as one Pexi has, for the name preview');
});

test('hasShopPrice: a shop price under any spelling of the code, and none for another product', () => {
  const prices = new DatabaseSync(':memory:');
  prices.exec('CREATE TABLE observation (code TEXT, page_gtin TEXT, price_cents INTEGER)');
  prices.prepare('INSERT INTO observation (code, page_gtin, price_cents) VALUES (?, NULL, 599)').run('068100090011');
  prices.prepare('INSERT INTO observation (code, page_gtin, price_cents) VALUES (NULL, ?, 400)').run('00000000012345');
  assert.equal(hasShopPrice(prices, '0068100090011'), true);
  assert.equal(hasShopPrice(prices, '68100090011'), true);
  assert.equal(hasShopPrice(prices, '12345'), true, 'a row joined by its page gtin counts');
  assert.equal(hasShopPrice(prices, '555'), false);
  assert.equal(hasShopPrice(null, '555'), false);
  // A file with no observation table is "no shop price", never a throw.
  assert.equal(hasShopPrice(new DatabaseSync(':memory:'), '555'), false);
});

test('retention takes the device id off old prices and keeps the price', () => {
  const db = new DatabaseSync(':memory:');
  saveShopperPrice(db, { ...base, deviceId: 'dev-a', priceCents: 599 });
  saveShopperPrice(db, { ...base, deviceId: 'dev-b', priceCents: 649 });
  const removed = removeOldShopperDeviceIds(db, '2999-01-01T00:00:00.000Z', 'removed:');
  assert.equal(removed, 2);
  assert.equal(shopperPriceCount(db, 'dev-a'), 0);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM shopper_price').get() as { n: number }).n, 2, 'the prices stay as separate rows');
  assert.equal(removeOldShopperDeviceIds(db, '2999-01-01T00:00:00.000Z', 'removed:'), 0, 'idempotent');
});
