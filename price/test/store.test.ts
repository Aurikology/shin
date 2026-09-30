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
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  currentIdentity,
  identityHistory,
  linkIdentity,
  openPrices,
  PRINTOUT_COLUMNS,
  recordObservation,
  type ObservationRow,
} from '../src/store.ts';

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

  recordObservation(
    db,
    row({ storeName: 'Dominion', storeCity: 'Mount Pearl', storeOsm: 'WAY/120689533', pageGtin: '068100084245' }),
  );

  // Same (seller, seller_sku, seen_on) key: INSERT OR REPLACE deletes the
  // first row and inserts this one. If store_name/store_city/store_osm were
  // ever dropped from the column list, values list or bind arguments, this
  // second insert would silently null them out even though this call still
  // passes them.
  recordObservation(
    db,
    row({
      priceCents: 605,
      storeName: 'Dominion',
      storeCity: 'Mount Pearl',
      storeOsm: 'WAY/120689533',
      pageGtin: '068100084245',
    }),
  );

  const saved = db
    .prepare(
      `SELECT price_cents, store_name, store_city, store_osm, page_gtin FROM observation
        WHERE seller = ? AND seller_sku = ? AND seen_on = ?`,
    )
    .get('openprices', '12345', '2026-09-05') as unknown as {
    price_cents: number;
    store_name: string | null;
    store_city: string | null;
    store_osm: string | null;
    page_gtin: string | null;
  };

  assert.equal(saved.price_cents, 605, 'the replace itself must have happened');
  assert.equal(saved.store_name, 'Dominion');
  assert.equal(saved.store_city, 'Mount Pearl');
  assert.equal(saved.store_osm, 'WAY/120689533');
  // page_gtin was the 21st column, added 2026-09-08. If a future edit adds a
  // column to the DDL and forgets one of the three lists in recordObservation,
  // the barcode an unjoined row is holding for the rejoin is what gets wiped.
  assert.equal(saved.page_gtin, '068100084245');

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

test('a database created before page_gtin existed gains the column when it is opened', () => {
  // The real migration path, not a hypothetical one: `DDL` uses CREATE TABLE
  // IF NOT EXISTS, so a database that already holds `observation` never sees a
  // column added to that statement. price/data/prices.db is one of those. This
  // builds the pre-2026-09-08 table by hand, opens it through openPrices, and
  // asserts both that the column arrives and that a row written before it
  // survives with NULL rather than being rebuilt or lost.
  const dir = mkdtempSync(join(tmpdir(), 'shin-price-migrate-'));
  const path = join(dir, 'old.db');

  const old = new DatabaseSync(path);
  old.exec(`
    CREATE TABLE observation (
      code TEXT, seller TEXT NOT NULL, seller_sku TEXT NOT NULL, seller_name TEXT NOT NULL,
      seller_brand TEXT, price_cents INTEGER NOT NULL, kind TEXT NOT NULL,
      unit_price_cents INTEGER, unit_label TEXT, currency TEXT NOT NULL, country TEXT NOT NULL,
      region TEXT, join_method TEXT NOT NULL, seen_on TEXT NOT NULL, url TEXT, image_url TEXT,
      in_stock INTEGER, store_name TEXT, store_city TEXT, store_osm TEXT,
      PRIMARY KEY (seller, seller_sku, seen_on)
    )
  `);
  old.exec(
    `INSERT INTO observation (code, seller, seller_sku, seller_name, price_cents, kind, currency, country, join_method, seen_on)
     VALUES ('0068100084245','openprices','legacy','Kraft',500,'regular','CAD','CA','gtin','2026-01-01')`,
  );
  old.close();

  const db = openPrices(path);
  const columns = (db.prepare('PRAGMA table_info(observation)').all() as unknown as { name: string }[]).map(
    (c) => c.name,
  );
  assert.ok(columns.includes('page_gtin'), 'openPrices must add the column to an existing table');

  const legacy = db
    .prepare("SELECT code, price_cents, page_gtin FROM observation WHERE seller_sku = 'legacy'")
    .get() as unknown as { code: string; price_cents: number; page_gtin: string | null };
  assert.equal(legacy.code, '0068100084245', 'the pre-existing row is untouched');
  assert.equal(legacy.price_cents, 500);
  assert.equal(legacy.page_gtin, null, 'nothing can invent a barcode for a row crawled before today');

  // Idempotent: opening it a second time must not fail on a duplicate column.
  const again = openPrices(path);
  recordObservation(again, row({ seller: 'walmart.ca', sellerSku: 'new', pageGtin: '068100084245' }));
  const fresh = again
    .prepare("SELECT page_gtin FROM observation WHERE seller_sku = 'new'")
    .get() as unknown as { page_gtin: string | null };
  assert.equal(fresh.page_gtin, '068100084245');

  again.close();
  db.close();
});

test('a database from before the three-layer store gains the ten printout columns and the new tables, rows intact', () => {
  // The shape price/data/prices.db had on 2026-09-27: page_gtin and
  // base_price_cents present, none of unit A1's columns or tables.
  const dir = mkdtempSync(join(tmpdir(), 'shin-price-a1-'));
  const path = join(dir, 'pre-a1.db');
  const old = new DatabaseSync(path);
  old.exec(`
    CREATE TABLE observation (
      code TEXT, seller TEXT NOT NULL, seller_sku TEXT NOT NULL, seller_name TEXT NOT NULL,
      seller_brand TEXT, price_cents INTEGER NOT NULL, kind TEXT NOT NULL,
      unit_price_cents INTEGER, unit_label TEXT, currency TEXT NOT NULL, country TEXT NOT NULL,
      region TEXT, join_method TEXT NOT NULL, seen_on TEXT NOT NULL, url TEXT, image_url TEXT,
      in_stock INTEGER, store_name TEXT, store_city TEXT, store_osm TEXT, page_gtin TEXT, base_price_cents INTEGER,
      PRIMARY KEY (seller, seller_sku, seen_on)
    )
  `);
  old.exec(
    `INSERT INTO observation (code, seller, seller_sku, seller_name, price_cents, kind, currency, country, join_method, seen_on, page_gtin)
     VALUES ('0068100084245','openprices','legacy','Kraft',500,'regular','CAD','CA','gtin','2026-01-01','068100084245')`,
  );
  old.close();

  const db = openPrices(path);
  const columns = (db.prepare('PRAGMA table_info(observation)').all() as unknown as { name: string }[]).map((c) => c.name);
  for (const [name] of PRINTOUT_COLUMNS) assert.ok(columns.includes(name), `observation.${name} added`);
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as unknown as { name: string }[]).map(
    (t) => t.name,
  );
  for (const t of ['capture', 'capture_tile', 'capture_drop', 'capture_written', 'identity_link']) assert.ok(tables.includes(t), `${t} created`);

  const legacy = db.prepare("SELECT * FROM observation WHERE seller_sku = 'legacy'").get() as Record<string, unknown>;
  assert.equal(legacy.price_cents, 500);
  assert.equal(legacy.page_gtin, '068100084245');
  for (const [name] of PRINTOUT_COLUMNS) assert.equal(legacy[name], null, `${name} is NULL on a row written before it existed`);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM observation').get() as { n: number }).n, 1);
  db.close();
  openPrices(path).close(); // idempotent
});

test('a second recordObservation for the same key keeps the printout columns too', () => {
  const db = openPrices(':memory:');
  const printout = {
    storeCategory: 'Pasta', wasCents: 427, isSale: 1, unitPriceCents: 34.7, unitLabel: '34.7¢/100g',
    unitPricePer: '100g', parsedBrand: 'Kraft', parsedSize: '1 kg', parsedVariant: 'smooth', captureTileId: 7,
    tileImage: 'tiles/7.png', flags: '["x"]',
  };
  recordObservation(db, row({ ...printout, priceCents: 347 }));
  recordObservation(db, row({ ...printout, priceCents: 349 }));
  const saved = db.prepare('SELECT * FROM observation').get() as Record<string, unknown>;
  assert.equal(saved.price_cents, 349);
  assert.deepEqual(
    [saved.store_category, saved.was_cents, saved.is_sale, saved.unit_price_cents, saved.unit_price_per, saved.parsed_brand,
      saved.parsed_size, saved.parsed_variant, saved.capture_tile_id, saved.tile_image, saved.flags],
    ['Pasta', 427, 1, 34.7, '100g', 'Kraft', '1 kg', 'smooth', 7, 'tiles/7.png', '["x"]'],
  );
  db.close();
});

test('an identity link is replaceable, keeps its history, and never touches the price row', () => {
  const db = openPrices(':memory:');
  recordObservation(db, row({ code: null, joinMethod: 'none', seller: 'Walmart', sellerSku: 'W1' }));
  assert.equal(currentIdentity(db, 'Walmart', 'W1'), null, 'optional: a product can have none');

  const first = linkIdentity(db, {
    seller: 'Walmart', sellerSku: 'W1', barcode: '0068100084245', joinMethod: 'name', confidence: 0.6,
    foundOn: '2026-09-28', evidence: 'shortlist rank 1',
  });
  const second = linkIdentity(db, {
    seller: 'Walmart', sellerSku: 'W1', barcode: '0068100084252', joinMethod: 'retailer_page_upc', confidence: 0.99,
    foundOn: '2026-09-29', evidence: '__NEXT_DATA__ upc',
  });
  const now = currentIdentity(db, 'Walmart', 'W1');
  assert.equal(now?.id, second);
  assert.equal(now?.barcode, '0068100084252');
  const history = identityHistory(db, 'Walmart', 'W1');
  assert.deepEqual(history.map((h) => [h.id, h.replacedBy]), [[first, second], [second, null]]);

  const obs = db.prepare("SELECT code, join_method FROM observation WHERE seller_sku = 'W1'").get() as Record<string, unknown>;
  assert.deepEqual([obs.code, obs.join_method], [null, 'none'], 'the served join column is not written by a link');
  assert.throws(() =>
    linkIdentity(db, { seller: 'Walmart', sellerSku: 'W1', barcode: 'x', joinMethod: 'name', confidence: 1.5, foundOn: 'd', evidence: null }),
  );
  db.close();
});

test('openPrices waits on a busy file instead of failing: busy_timeout is set before the migration', () => {
  const db = openPrices(':memory:');
  const row = db.prepare('PRAGMA busy_timeout').get() as Record<string, number>;
  assert.equal(Object.values(row)[0], 5000);
  db.close();
});
