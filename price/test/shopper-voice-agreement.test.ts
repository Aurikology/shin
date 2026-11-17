/**
 * Security finding F1 and F2 (docs/security-check/v4-v5-poison-dynamic.md), owner's call 2026-11-16: "require
 * more agreeing phones". A typed price only reaches the shown answer when at least 3 different devices from at
 * least 2 different networks agree within 1.5x of each other (around their median); below that bar it does not
 * move the price. When the product has a shop price under 90 days old, the typed voice never pulls the answer
 * below 0.8x of it.
 *
 * The rows reproduce the poison sim: 1 fake phone on a product with no shop price, 1 fake phone on a product
 * with one fresh shop price, and the honest case (3 phones, 2 networks) that must still count.
 * Every database is in memory; no model is called.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { estimate, type EstimateDeps, type EstimateItem } from '../src/estimate.ts';
import { removeOldShopperDeviceIds, saveShopperPrice, shopperVoiceFor } from '../src/shopper-prices.ts';

const AS_OF = '2026-11-15';
const CODE = '0068100090011';
const base = { code: CODE, region: 'ON', store: 'Loblaws', seenOn: '2026-11-14', centreCents: null as number | null };

function type(db: DatabaseSync, device: string, net: string | null, cents: number): void {
  const r = saveShopperPrice(db, { ...base, deviceId: device, priceCents: cents, networkHash: net });
  assert.equal(r.ok, true, `${device} saved`);
}

let sku = 0;
function obs(over: Partial<ObservationRow>): ObservationRow {
  sku += 1;
  return {
    code: CODE,
    seller: 'alpha',
    sellerSku: `sku-${sku}`,
    sellerName: 'Smooth Peanut Butter 1 kg',
    sellerBrand: null,
    priceCents: 500,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: 'ON',
    joinMethod: 'gtin',
    seenOn: '2026-11-10',
    url: null,
    imageUrl: null,
    inStock: null,
    ...over,
  };
}
const item = (): EstimateItem => ({ barcode: CODE, name: 'Smooth Peanut Butter', region: 'Ontario', country: 'CA', asOf: AS_OF });
const noClaude: EstimateDeps['askClaude'] = async () => ({ ok: false, reason: 'test' });
const withVoice = (db: DatabaseSync) => (code: string) => shopperVoiceFor(db, code, AS_OF);

/* ---------------------------------------------------------------- the bar (F1) */

test('one phone is no voice, nor are two phones, nor three phones on one network', () => {
  const db = new DatabaseSync(':memory:');
  type(db, 'fake-1', 'net-a', 1450);
  assert.equal(shopperVoiceFor(db, CODE, AS_OF), null, '1 phone');
  type(db, 'fake-2', 'net-b', 1450);
  assert.equal(shopperVoiceFor(db, CODE, AS_OF), null, '2 phones on 2 networks');
  const same = new DatabaseSync(':memory:');
  for (const d of ['a', 'b', 'c', 'd', 'e']) type(same, `dev-${d}`, 'net-a', 600);
  assert.equal(shopperVoiceFor(same, CODE, AS_OF), null, '5 phones on 1 network');
});

test('a phone with no known network is not evidence', () => {
  const db = new DatabaseSync(':memory:');
  type(db, 'old-1', null, 600);
  type(db, 'old-2', null, 610);
  type(db, 'old-3', null, 620);
  assert.equal(shopperVoiceFor(db, CODE, AS_OF), null);
});

test('three phones from two networks that agree within 1.5x make the voice, with the counts', () => {
  const db = new DatabaseSync(':memory:');
  type(db, 'dev-a', 'net-a', 600);
  type(db, 'dev-b', 'net-a', 650);
  type(db, 'dev-c', 'net-b', 700);
  const v = shopperVoiceFor(db, CODE, AS_OF)!;
  assert.equal(v.cents, 650);
  assert.equal(v.devices, 3);
  assert.equal(v.networks, 2);
});

test('only the phones that agree count: a wild price is left out, and too much spread is no voice', () => {
  const db = new DatabaseSync(':memory:');
  type(db, 'dev-a', 'net-a', 600);
  type(db, 'dev-b', 'net-b', 650);
  type(db, 'dev-c', 'net-a', 700);
  type(db, 'dev-x', 'net-c', 2500);
  const v = shopperVoiceFor(db, CODE, AS_OF)!;
  assert.equal(v.devices, 3, 'the 2500 price is not one of the agreeing phones');
  assert.equal(v.cents, 650);
  const spread = new DatabaseSync(':memory:');
  type(spread, 'dev-a', 'net-a', 500);
  type(spread, 'dev-b', 'net-b', 700);
  type(spread, 'dev-c', 'net-a', 2000);
  assert.equal(shopperVoiceFor(spread, CODE, AS_OF), null, 'only two phones agree');
});

test('the agreeing phones must themselves come from two networks', () => {
  const db = new DatabaseSync(':memory:');
  type(db, 'dev-a', 'net-a', 600);
  type(db, 'dev-b', 'net-a', 650);
  type(db, 'dev-c', 'net-a', 700);
  type(db, 'dev-x', 'net-b', 2500); // a second network, but not agreeing
  assert.equal(shopperVoiceFor(db, CODE, AS_OF), null);
});

test('retention takes the network off with the device id, and the price stays', () => {
  const db = new DatabaseSync(':memory:');
  type(db, 'dev-a', 'net-a', 600);
  type(db, 'dev-b', 'net-b', 650);
  assert.equal(removeOldShopperDeviceIds(db, '2999-01-01T00:00:00.000Z', 'removed:'), 2);
  const rows = db.prepare('SELECT device_id, net_hash, price_cents FROM shopper_price ORDER BY id').all() as { device_id: string; net_hash: string | null; price_cents: number }[];
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.equal(r.net_hash, null);
    assert.ok(r.device_id.startsWith('removed:'));
  }
  assert.deepEqual(rows.map((r) => r.price_cents), [600, 650]);
});

/* ------------------------------------------- the poison sim rows, through the estimate */

test('SIM: 1 fake phone on a product with no shop price no longer sets the price; 3 honest phones from 2 networks still do', async () => {
  const fake = new DatabaseSync(':memory:');
  type(fake, 'fake-1', 'net-a', 1450);
  const poisoned = await estimate(item(), null, { prices: openPrices(':memory:'), askClaude: noClaude, shopperVoice: withVoice(fake) });
  assert.notEqual(poisoned.verdict.basis, 'own_prices', 'one fake phone is not a price');
  assert.notEqual(poisoned.verdict.centreCents, 1450);

  const honest = new DatabaseSync(':memory:');
  type(honest, 'dev-a', 'net-a', 500);
  type(honest, 'dev-b', 'net-b', 520);
  type(honest, 'dev-c', 'net-a', 540);
  const real = await estimate(item(), null, { prices: openPrices(':memory:'), askClaude: noClaude, shopperVoice: withVoice(honest) });
  assert.equal(real.verdict.basis, 'own_prices');
  assert.equal(real.verdict.centreCents, 520);
  assert.equal(real.verdict.confidence, 'low');
});

test('SIM: 1 fake phone cannot sink a product that has one fresh shop price', async () => {
  const prices = openPrices(':memory:');
  recordObservation(prices, obs({ priceCents: 500 }));
  const alone = await estimate(item(), null, { prices, askClaude: noClaude });
  const fake = new DatabaseSync(':memory:');
  type(fake, 'fake-1', 'net-a', 170);
  const poisoned = await estimate(item(), null, { prices, askClaude: noClaude, shopperVoice: withVoice(fake) });
  assert.equal(poisoned.verdict.centreCents, alone.verdict.centreCents);
  assert.equal(poisoned.verdict.centreCents, 500);
});

/* ------------------------------------------------------------- the floor (F2) */

test('F2: even three agreeing phones cannot pull a product with a fresh shop price below 0.8x of it', async () => {
  const prices = openPrices(':memory:');
  recordObservation(prices, obs({ priceCents: 500, seenOn: '2026-11-10' }));
  const crowd = new DatabaseSync(':memory:');
  type(crowd, 'dev-a', 'net-a', 170);
  type(crowd, 'dev-b', 'net-b', 170);
  type(crowd, 'dev-c', 'net-a', 170);
  const { verdict } = await estimate(item(), null, { prices, askClaude: noClaude, shopperVoice: withVoice(crowd) });
  assert.ok(verdict.centreCents >= 400, `centre ${verdict.centreCents} is below 0.8 x 500`);
});

test('F2: the floor is only for a shop price under 90 days old', async () => {
  const prices = openPrices(':memory:');
  recordObservation(prices, obs({ priceCents: 500, seenOn: '2026-07-17' })); // 121 days before AS_OF
  const crowd = new DatabaseSync(':memory:');
  type(crowd, 'dev-a', 'net-a', 170);
  type(crowd, 'dev-b', 'net-b', 170);
  type(crowd, 'dev-c', 'net-a', 170);
  const { verdict } = await estimate(item(), null, { prices, askClaude: noClaude, shopperVoice: withVoice(crowd) });
  assert.ok(verdict.centreCents < 400, `centre ${verdict.centreCents}: an old shop price gets no floor`);
});

test('F2: a typed price above the floor is left as it was', async () => {
  const prices = openPrices(':memory:');
  recordObservation(prices, obs({ priceCents: 500, seenOn: '2026-11-10' }));
  const crowd = new DatabaseSync(':memory:');
  type(crowd, 'dev-a', 'net-a', 450);
  type(crowd, 'dev-b', 'net-b', 450);
  type(crowd, 'dev-c', 'net-a', 450);
  const { verdict } = await estimate(item(), null, { prices, askClaude: noClaude, shopperVoice: withVoice(crowd) });
  assert.ok(verdict.centreCents >= 450 && verdict.centreCents <= 500, `centre ${verdict.centreCents}`);
});
