/**
 * Requirement 5.9 (docs/price-category-requirements-2026-10-01.md): "Never let
 * one shopper's store-and-time trail reach anyone else: what is used to answer
 * others is pooled across 5+ shoppers or carries no store-and-time detail.
 * Pass when: 0 answers expose a single shopper's store and time." Plan Part 6,
 * 5.9: "Pooling across 5+ shoppers before anything reaches others."
 *
 * Written before the fix. On 2026-10-09 `lookupOwnPrices` and
 * `lookupOwnPricesByBarcode` (src/own-prices.ts) returned every shopper's typed
 * shelf price (`user_observation`) as its own offer, with the shop they typed
 * and the moment they typed it, one row per shop, to whoever asked next, with no
 * count of shoppers at all. barcode-own-prices.test.ts pinned that: one
 * shopper's "Circle K, $2.99, 2026-09-18T10:00" was asserted to come back.
 *
 * Shoppers are counted by `device_key` (catalogue/src/user-catalogue.ts,
 * `deviceKeyOf`), distinct, never by rows: one phone typing six prices is one
 * shopper. A row with no device key cannot be counted as anybody and is not
 * pooled. The shopper's OWN report still comes back to that shopper through
 * `shopperReportFor` (shopper-report.ts; shopper-price-route.test.ts D06), which
 * reads only the asking device's rows and is untouched here.
 *
 * Controls: five distinct shoppers DO reach the answer, as one pooled row; and
 * crawled store prices, which are no shopper's trail, keep their store and date.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dir = mkdtempSync(join(tmpdir(), 'shin-trail-'));
const pricesPath = join(dir, 'prices.db');
const userPath = join(dir, 'user-catalogue.db');

const { openPrices, recordObservation } = await import('../../price/src/store.ts');
const { createUserCatalogue, recordUserScan } = await import('../../catalogue/src/user-catalogue.ts');
const { lookupOwnPricesByBarcode, lookupOwnPrices } = await import('../src/own-prices.ts');

const uc = createUserCatalogue(userPath);
const MARKET = { country: 'CA', region: 'ON', currency: 'CAD', derivedFrom: 'user_location' } as const;

interface Report {
  device: string | null;
  store: string;
  cents: number;
  at: string;
}

function shoppers(gtin: string, name: string, reports: readonly Report[]): void {
  for (const r of reports) {
    recordUserScan(
      {
        gtin,
        name,
        quantity: '473 ml',
        priceCents: r.cents,
        storeType: 'convenience',
        storeName: r.store,
        market: MARKET,
        observedAt: r.at,
        ...(r.device ? { deviceId: r.device } : {}),
      },
      { log: uc },
    );
  }
}

const ONE = '0060000000067';
shoppers(ONE, 'Lone Shopper Energy Drink', [{ device: 'dev-a', store: 'Circle K', cents: 299, at: '2026-09-18T10:00:00.000Z' }]);

const FOUR = '0060000000081';
shoppers(
  FOUR,
  'Four Shopper Sparkling Water',
  ['a', 'b', 'c', 'd'].map((d, i) => ({ device: `dev-${d}`, store: `Shop ${d}`, cents: 150 + i * 10, at: `2026-09-1${i}T09:00:00.000Z` })),
);

const FIVE = '0060000000098';
const FIVE_REPORTS: Report[] = ['a', 'b', 'c', 'd', 'e'].map((d, i) => ({
  device: `dev-${d}`,
  store: `Shop ${d}`,
  cents: [210, 230, 250, 270, 290][i]!,
  at: `2026-09-2${i}T08:30:00.000Z`,
}));
shoppers(FIVE, 'Five Shopper Iced Tea', FIVE_REPORTS);

const SAME_PHONE = '0060000000104';
shoppers(
  SAME_PHONE,
  'One Phone Many Prices Juice',
  Array.from({ length: 6 }, (_, i) => ({ device: 'dev-busy', store: `Shop ${i}`, cents: 300 + i, at: `2026-09-2${i}T12:00:00.000Z` })),
);

const NO_KEY = '0060000000111';
shoppers(
  NO_KEY,
  'Keyless Lemonade',
  Array.from({ length: 6 }, (_, i) => ({ device: null, store: `Shop ${i}`, cents: 400 + i, at: `2026-09-2${i}T12:00:00.000Z` })),
);

// A crawled store price, which is a shop's own page and no shopper's trail.
const CRAWLED = '0060000000128';
{
  const prices = openPrices(pricesPath);
  recordObservation(prices, {
    code: CRAWLED,
    seller: 'bcliquorstores',
    sellerSku: 'sku-1',
    sellerName: 'Crawled Cola 355 ml',
    sellerBrand: null,
    priceCents: 199,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: 'BC',
    joinMethod: 'gtin',
    seenOn: '2026-09-22',
    url: null,
    imageUrl: null,
    inStock: null,
    storeName: 'BC Liquor',
    storeCity: null,
    basePriceCents: null,
  });
  prices.close();
}

const sources = { pricesDbPath: pricesPath, userCataloguePath: userPath };

/** Every shopper-sourced row an answer carries. */
function shopperRows(gtin: string) {
  return (lookupOwnPricesByBarcode(gtin, sources).match?.prices ?? []).filter((p) => p.from === 'user_shelf_price');
}

/** A single shopper's own store, or own moment, appearing anywhere in what goes out. */
function exposes(rows: readonly { store: string; observedAt: string }[], reports: readonly Report[]): string[] {
  const out: string[] = [];
  for (const row of rows) {
    for (const r of reports) {
      if (row.store === r.store) out.push(`store "${r.store}" of ${r.device}`);
      if (row.observedAt === r.at || row.observedAt === r.at.slice(0, 10)) out.push(`time ${r.at} of ${r.device}`);
    }
  }
  return out;
}

test('5.9 known-bad: one shopper\'s typed price, shop and moment never reach another shopper', () => {
  const rows = shopperRows(ONE);
  assert.deepEqual(rows, [], `a lone shopper's report went out: ${JSON.stringify(rows)}`);
});

test('5.9 known-bad: four shoppers are not five', () => {
  assert.deepEqual(shopperRows(FOUR), []);
});

test('5.9 known-bad: one phone typing six prices is one shopper, not six', () => {
  assert.deepEqual(shopperRows(SAME_PHONE), []);
});

test('5.9 known-bad: rows that cannot be attributed to a shopper are never pooled', () => {
  assert.deepEqual(shopperRows(NO_KEY), []);
});

test('5.9 control: five distinct shoppers reach the answer as one pooled row that carries no single shopper\'s shop or moment', () => {
  const rows = shopperRows(FIVE);
  assert.equal(rows.length, 1, `expected one pooled row: ${JSON.stringify(rows)}`);
  const pooled = rows[0]!;
  assert.equal(pooled.amount, 2.5, 'the pooled price is the median of the five shoppers');
  assert.equal(pooled.pooledShoppers, 5);
  assert.deepEqual(exposes(rows, FIVE_REPORTS), []);
});

test('5.9 control: a crawled store price is no shopper\'s trail and keeps its store and date', () => {
  const prices = lookupOwnPricesByBarcode(CRAWLED, sources).match?.prices ?? [];
  assert.equal(prices.length, 1);
  assert.equal(prices[0]!.store, 'BC Liquor');
  assert.equal(prices[0]!.observedAt, '2026-09-22');
});

test('5.9: the typed-name lookup obeys the same rule', () => {
  const lone = lookupOwnPrices('Lone Shopper Energy Drink', sources).match;
  const loneShopperRows = (lone?.prices ?? []).filter((p) => p.from === 'user_shelf_price');
  assert.deepEqual(loneShopperRows, [], `a lone shopper's report went out by name: ${JSON.stringify(loneShopperRows)}`);
  const five = lookupOwnPrices('Five Shopper Iced Tea', sources).match;
  const fiveRows = (five?.prices ?? []).filter((p) => p.from === 'user_shelf_price');
  assert.equal(fiveRows.length, 1);
  assert.deepEqual(exposes(fiveRows, FIVE_REPORTS), []);
});
