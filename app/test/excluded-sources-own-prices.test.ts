/**
 * The kill switch (catalogue/src/source-rights.ts) on the app's own-price reads: rows whose seller is
 * excluded are not named, with the switch off they are.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { openPrices, recordObservation, type ObservationRow } from '../../price/src/store.ts';
import { scanPriceNames } from '../src/own-prices-scan.ts';
import { setExcludedSourcesForTest } from '../../catalogue/src/source-rights.ts';

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

let sku = 0;
const row = (seller: string, name: string): ObservationRow => {
  sku += 1;
  return {
    code: `10000000000${sku}`, seller, sellerSku: `s${sku}`, sellerName: name, sellerBrand: null, priceCents: 500, kind: 'regular',
    unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: null, joinMethod: 'gtin', seenOn: '2026-09-20',
    url: null, imageUrl: null, inStock: null,
  };
};

test('an excluded seller\'s rows are not read by the own-prices scan; the others are', () => {
  const db = openPrices(':memory:');
  recordObservation(db, row('Kroger', 'Zorbix Cola'));
  recordObservation(db, row('Walmart', 'Zorbix Cola'));
  assert.deepEqual(scanPriceNames(db, '%zorbix%').map((r) => r.seller).sort(), ['Kroger', 'Walmart'], 'control: switch off');
  restore = setExcludedSourcesForTest('kroger');
  assert.deepEqual(scanPriceNames(db, '%zorbix%').map((r) => r.seller), ['Walmart']);
  db.close();
});
