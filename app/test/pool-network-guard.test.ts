/**
 * Security finding F10 (docs/security-check/v4-v5-poison-dynamic.md), owner's call 2026-11-16.
 *
 * The typed-name pool (own-prices.ts, poolShopperPrices) turns 5 or more shoppers' typed prices into one pooled
 * row. Before: 5 device keys were enough, so 5 minted ids made any price. Now the shoppers counted must come from
 * at least 2 networks, and where a shop price exists the pooled median must sit within 0.33x to 3x of it.
 * SHIN_SHOPPER_VOICE=off removes the pooled row altogether.
 *
 * No live writer feeds user_observation today (the Gemini path is removed), so this guards the rows already there
 * and any writer that comes back.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dir = mkdtempSync(join(tmpdir(), 'shin-pool-net-'));
const pricesPath = join(dir, 'prices.db');
const userPath = join(dir, 'user-catalogue.db');

const { openPrices, recordObservation } = await import('../../price/src/store.ts');
const { createUserCatalogue, recordUserScan } = await import('../../catalogue/src/user-catalogue.ts');
const { lookupOwnPricesByBarcode } = await import('../src/own-prices.ts');

const uc = createUserCatalogue(userPath);
const MARKET = { country: 'CA', region: 'ON', currency: 'CAD', derivedFrom: 'user_location' } as const;

function shoppers(gtin: string, name: string, cents: number[], nets: (string | null)[]): void {
  cents.forEach((c, i) => {
    recordUserScan(
      {
        gtin,
        name,
        quantity: '473 ml',
        priceCents: c,
        storeType: 'convenience',
        storeName: `Shop ${i}`,
        market: MARKET,
        observedAt: `2026-09-2${i}T08:30:00.000Z`,
        deviceId: `dev-${gtin}-${i}`,
        networkHash: nets[i] ?? null,
      },
      { log: uc },
    );
  });
}

function shopPrice(code: string, cents: number): void {
  const prices = openPrices(pricesPath);
  recordObservation(prices, {
    code, seller: 'bcliquorstores', sellerSku: `sku-${code}`, sellerName: 'Shop Cola 355 ml', sellerBrand: null,
    priceCents: cents, kind: 'regular', unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: 'BC',
    joinMethod: 'gtin', seenOn: '2026-09-22', url: null, imageUrl: null, inStock: null, storeName: 'BC Liquor',
    storeCity: null, basePriceCents: null,
  });
  prices.close();
}

const sources = { pricesDbPath: pricesPath, userCataloguePath: userPath };
const pooled = (gtin: string) => (lookupOwnPricesByBarcode(gtin, sources).match?.prices ?? []).filter((p) => p.from === 'user_shelf_price');

const ONE_NET = '0060000000203';
shoppers(ONE_NET, 'One Network Tea', [210, 230, 250, 270, 290], ['n1', 'n1', 'n1', 'n1', 'n1']);

const NO_NET = '0060000000210';
shoppers(NO_NET, 'No Network Tea', [210, 230, 250, 270, 290], [null, null, null, null, null]);

const TWO_NETS = '0060000000227';
shoppers(TWO_NETS, 'Two Network Tea', [210, 230, 250, 270, 290], ['n1', 'n1', 'n1', 'n2', 'n1']);

const WILD = '0060000000234';
shoppers(WILD, 'Wild Cola', [10, 11, 12, 13, 14], ['n1', 'n2', 'n1', 'n2', 'n1']);
shopPrice(WILD, 299);

const FINE = '0060000000241';
shoppers(FINE, 'Fine Cola', [250, 260, 270, 280, 290], ['n1', 'n2', 'n1', 'n2', 'n1']);
shopPrice(FINE, 299);

test('SIM: five phones on one network do not make a pooled price', () => {
  assert.deepEqual(pooled(ONE_NET), []);
});

test('five phones with no known network do not make a pooled price', () => {
  assert.deepEqual(pooled(NO_NET), []);
});

test('five shoppers from two networks still pool, as before', () => {
  const rows = pooled(TWO_NETS);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.amount, 2.5);
});

test('SIM: a pooled price far under the shop price (under 0.33x) is dropped, and the shop price stands', () => {
  assert.deepEqual(pooled(WILD), []);
  const prices = lookupOwnPricesByBarcode(WILD, sources).match?.prices ?? [];
  assert.equal(prices.length, 1);
  assert.equal(prices[0]!.amount, 2.99);
});

test('a pooled price near the shop price is kept', () => {
  assert.equal(pooled(FINE).length, 1);
});

test('SHIN_SHOPPER_VOICE=off drops the pooled row, and the next read brings it back when on', () => {
  process.env.SHIN_SHOPPER_VOICE = 'off';
  try {
    assert.deepEqual(pooled(TWO_NETS), []);
  } finally {
    delete process.env.SHIN_SHOPPER_VOICE;
  }
  assert.equal(pooled(TWO_NETS).length, 1);
});
