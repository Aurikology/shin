/**
 * Tests for the column-list trap in `recordObservation`.
 *
 * INSERT OR REPLACE deletes and reinserts a row for the same key. A column
 * present in the table but missing from the statement's column list reverts
 * to its default (or NULL) on every re-crawl. This is the one test that
 * would catch a future edit that adds a column to the DDL and forgets to add
 * it to the INSERT statement in the same three places.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';

function row(over: Partial<ObservationRow> = {}): ObservationRow {
  return {
    code: '0068100084245',
    seller: 'openprices',
    sellerSku: '12345',
    sellerName: 'Kraft Smooth Peanut Butter',
    sellerBrand: 'Kraft',
    priceCents: 597,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: '120689533',
    joinMethod: 'gtin',
    seenOn: '2026-09-05',
    url: null,
    imageUrl: null,
    inStock: null,
    ...over,
  };
}

test('a second recordObservation for the same key keeps the store columns, not just the price ones', () => {
  const db = openPrices(':memory:');

  recordObservation(db, row({ storeName: 'Dominion', storeCity: 'Mount Pearl', storeOsm: 'WAY/120689533' }));

  // Same (seller, seller_sku, seen_on) key: INSERT OR REPLACE deletes the
  // first row and inserts this one. If store_name/store_city/store_osm were
  // ever dropped from the column list, values list or bind arguments, this
  // second insert would silently null them out even though this call still
  // passes them.
  recordObservation(db, row({ priceCents: 605, storeName: 'Dominion', storeCity: 'Mount Pearl', storeOsm: 'WAY/120689533' }));

  const saved = db
    .prepare(
      `SELECT price_cents, store_name, store_city, store_osm FROM observation
        WHERE seller = ? AND seller_sku = ? AND seen_on = ?`,
    )
    .get('openprices', '12345', '2026-09-05') as unknown as {
    price_cents: number;
    store_name: string | null;
    store_city: string | null;
    store_osm: string | null;
  };

  assert.equal(saved.price_cents, 605, 'the replace itself must have happened');
  assert.equal(saved.store_name, 'Dominion');
  assert.equal(saved.store_city, 'Mount Pearl');
  assert.equal(saved.store_osm, 'WAY/120689533');

  db.close();
});

test('in_stock NULL means not observed, distinct from 0 observed out of stock', () => {
  const db = openPrices(':memory:');

  recordObservation(db, row({ seller: 'openprices', sellerSku: 'a', inStock: null }));
  recordObservation(db, row({ seller: 'walmart.ca', sellerSku: 'b', inStock: 0 }));

  const rows = db
    .prepare('SELECT seller, in_stock FROM observation ORDER BY seller')
    .all() as unknown as { seller: string; in_stock: number | null }[];

  assert.equal(rows.length, 2);
  assert.equal(rows[0].seller, 'openprices');
  assert.equal(rows[0].in_stock, null);
  assert.equal(rows[1].seller, 'walmart.ca');
  assert.equal(rows[1].in_stock, 0);

  db.close();
});
