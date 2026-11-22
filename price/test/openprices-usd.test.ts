/**
 * Open Prices in two currencies (2026-11-22). Fixtures only, no network: rows
 * are fed through importItem exactly as the pager would.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { CURRENCIES, defaultCountry, importItem, newTally, pageUrl, recordAttempts } from '../src/openprices.ts';
import { openPrices } from '../src/store.ts';

const CATALOGUED = '0012345678905';

function catalogue(): DatabaseSync {
  const cat = new DatabaseSync(':memory:');
  cat.exec('CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT)');
  cat.prepare('INSERT INTO product (code, name) VALUES (?, ?)').run(CATALOGUED, 'Known cereal');
  return cat;
}

let nextId = 1;
function item(over: Record<string, unknown>): any {
  return {
    id: nextId++,
    product_code: CATALOGUED,
    product_name: 'Cereal',
    product: { product_name: 'Cereal', brands: 'Brand', image_url: null },
    price: 4.99,
    price_is_discounted: false,
    price_without_discount: null,
    price_per: null,
    currency: 'USD',
    date: '2026-11-01',
    location_id: 10,
    location_osm_id: 555,
    location: {
      osm_address_country_code: 'US',
      type: 'OSM',
      osm_id: 555,
      osm_type: 'NODE',
      osm_name: 'Some Market',
      osm_address_city: 'Austin',
      osm_tag_key: 'shop',
      osm_tag_value: 'supermarket',
    },
    ...over,
  };
}

const ONLINE = { type: 'ONLINE', osm_id: null, osm_type: null, osm_name: null, osm_address_city: null, osm_tag_key: null, osm_tag_value: null };

function rows(db: DatabaseSync): any[] {
  return db.prepare('SELECT * FROM observation ORDER BY seller_sku').all();
}

test('the import asks the API once per currency, CAD and USD', () => {
  assert.deepEqual([...CURRENCIES], ['CAD', 'USD']);
  assert.match(pageUrl('USD', 3), /\?currency=USD&size=100&page=3$/);
  assert.match(pageUrl('CAD', 1), /\?currency=CAD&size=100&page=1$/);
});

test('an online row takes its country from the currency it was fetched under', () => {
  assert.equal(defaultCountry('USD'), 'US');
  assert.equal(defaultCountry('CAD'), 'CA');
  const db = openPrices(':memory:');
  const cat = catalogue();
  const t = newTally();
  importItem(db, cat, item({ id: 1, currency: 'USD', location_osm_id: null, location: ONLINE }), 'USD', t);
  importItem(db, cat, item({ id: 2, currency: 'CAD', location_osm_id: null, location: ONLINE }), 'CAD', t);
  const [usd, cad] = rows(db);
  assert.equal(usd.currency, 'USD');
  assert.equal(usd.country, 'US');
  assert.equal(cad.currency, 'CAD');
  assert.equal(cad.country, 'CA');
});

test('a row keeps its own currency and the location country when it has one', () => {
  const db = openPrices(':memory:');
  const cat = catalogue();
  const t = newTally();
  // A US shop whose price the API reported in CAD stays CAD, and a Canadian shop's stays CA: nothing is relabelled.
  importItem(db, cat, item({ id: 1, currency: 'CAD', location: { ...item({}).location, osm_address_country_code: 'US' } }), 'CAD', t);
  importItem(db, cat, item({ id: 2, currency: 'USD', location: { ...item({}).location, osm_address_country_code: 'CA' } }), 'USD', t);
  const [a, b] = rows(db);
  assert.deepEqual([a.currency, a.country], ['CAD', 'US']);
  assert.deepEqual([b.currency, b.country], ['USD', 'CA']);
});

test('a USD barcode the catalogue does not hold is stored unjoined, with its barcode kept for a later join', () => {
  const db = openPrices(':memory:');
  const cat = catalogue();
  const t = newTally();
  importItem(db, cat, item({ id: 1, product_code: '049000028911' }), 'USD', t);
  importItem(db, cat, item({ id: 2, product_code: CATALOGUED }), 'USD', t);
  const [unknown, known] = rows(db);
  assert.equal(unknown.code, null);
  assert.equal(unknown.join_method, 'none');
  assert.equal(unknown.page_gtin, '0049000028911');
  assert.equal(known.code, CATALOGUED);
  assert.equal(known.join_method, 'gtin');
  assert.equal(known.page_gtin, null);
  assert.equal(t.joined, 1);
  assert.equal(t.unjoined, 1);
});

test('Canadian rows are written as before: an unjoined CAD row carries no page_gtin', () => {
  const db = openPrices(':memory:');
  const cat = catalogue();
  const t = newTally();
  importItem(db, cat, item({ id: 1, currency: 'CAD', product_code: '0000000000017' }), 'CAD', t);
  const [r] = rows(db);
  assert.equal(r.code, null);
  assert.equal(r.join_method, 'none');
  assert.equal(r.page_gtin, null);
  assert.equal(r.currency, 'CAD');
});

test('a category row is skipped, a discounted USD row also writes its regular price', () => {
  const db = openPrices(':memory:');
  const cat = catalogue();
  const t = newTally();
  importItem(db, cat, item({ id: 1, product_code: null }), 'USD', t);
  importItem(db, cat, item({ id: 2, price: 3, price_is_discounted: true, price_without_discount: 4 }), 'USD', t);
  recordAttempts(db, t, '2026-11-22');
  const r = rows(db);
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((x) => [x.kind, x.price_cents, x.currency]), [['promotional', 300, 'USD'], ['regular', 400, 'USD']]);
  assert.equal(t.skippedNoBarcode, 1);
  assert.equal(t.regularAlso, 1);
});
