/**
 * D-267 A4 (bug sweep 2026-11-11): 6,976 Hammer rows were seen while the shop had the item out of stock.
 * A shelf price seen out of stock is still a real price and still counts (RULINGS 2026-09-28, "every data
 * point"). But when the same shop, the same day, also lists it in stock at another price, the one a shopper
 * can buy leads: one price per shop used to take the lower of the two, whatever the stock (counted over the
 * Hammer CSVs through the real loader: 14 shop-and-barcode pairs mix stock on one day, 1 picked the
 * out-of-stock price over a different in-stock one).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { estimate, type ClaudeAnswer, type EstimateItem } from '../src/estimate.ts';
import { priceRangeFor } from '../src/range.ts';

const SELF = '0626990000888';
const AS_OF = '2026-09-30';

let sku = 0;
function obs(over: Partial<ObservationRow>): ObservationRow {
  sku += 1;
  return {
    code: SELF,
    seller: 'hammer',
    sellerSku: `sku-${sku}`,
    sellerName: 'Thing',
    sellerBrand: null,
    priceCents: 500,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: 'ON',
    joinMethod: 'gtin',
    seenOn: '2026-09-28',
    url: null,
    imageUrl: null,
    inStock: null,
    ...over,
  };
}

function prices(rows: readonly ObservationRow[]) {
  const db = openPrices(':memory:');
  for (const r of rows) recordObservation(db, r);
  return db;
}

const item: EstimateItem = { barcode: SELF, asOf: AS_OF, currency: 'CAD', country: 'CA' };
const noClaude = async (): Promise<ClaudeAnswer> => ({ ok: false, reason: 'test' });

test('D-267 A4: the same shop and day listing it in stock leads its cheaper out-of-stock listing (verdict)', async () => {
  const db = prices([
    obs({ storeName: 'Metro', priceCents: 500, inStock: null }),
    obs({ storeName: 'Metro', priceCents: 300, inStock: 0 }),
  ]);
  const { verdict } = await estimate(item, null, { prices: db, askClaude: noClaude });
  assert.equal(verdict.basis, 'own_prices');
  assert.equal(verdict.n, 1);
  assert.equal(verdict.centreCents, 500);
  // Both are real prices, so both stay as dots.
  assert.deepEqual(verdict.dots.map((d) => d.cents).sort((a, b) => a - b), [300, 500]);
});

test('D-267 A4: an out-of-stock price alone still counts as the shop price', async () => {
  const db = prices([obs({ storeName: 'Metro', priceCents: 300, inStock: 0 })]);
  const { verdict } = await estimate(item, null, { prices: db, askClaude: noClaude });
  assert.equal(verdict.n, 1);
  assert.equal(verdict.centreCents, 300);
});

test('D-267 A4: the range card takes the in-stock listing of the same shop and day too', () => {
  const db = prices([
    obs({ storeName: 'Metro', priceCents: 500, inStock: 1 }),
    obs({ storeName: 'Metro', priceCents: 100, inStock: 0 }),
    obs({ storeName: 'Loblaws', priceCents: 510 }),
    obs({ storeName: 'Voila', priceCents: 520 }),
  ]);
  const r = priceRangeFor({ barcode: SELF, asOf: AS_OF, currency: 'CAD' }, { prices: db, catalogue: null });
  assert.equal(r.basis, 'this_product');
  assert.ok(r.basis === 'this_product' && r.lowCents >= 400, `low ${r.basis === 'this_product' ? r.lowCents : '-'} came from the out-of-stock listing`);
});
