import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readProducts, observationsFor, matchedRowsFor, dropMatchedRows, planMatches, MATCHED_FLAG, SELLER } from '../src/hammer.ts';
import { openPrices, recordObservation } from '../src/store.ts';

const HEADER = 'id,concatted,vendor,product_name,units,brand,detail_url,sku,upc\r\n';
function row(id: string, vendor: string, name: string, units: string, brand: string, upc: string): string {
  return `${id},"x",${vendor},"${name}",${units},"${brand}",,${id},${upc}\r\n`;
}
// Barilla needs three products before Voila's start-of-name brand is recognised.
const CSV =
  HEADER +
  row('Loblaws_b1', 'Loblaws', 'Spaghetti Pasta', '500g', 'Barilla', '76808011010') +
  row('Loblaws_b2', 'Loblaws', 'Penne Pasta', '500g', 'Barilla', '76808011020') +
  row('Loblaws_b3', 'Loblaws', 'Fusilli Pasta', '500g', 'Barilla', '76808011030') +
  row('Metro1', 'Metro', 'Spaghettoni Pasta', '410g', 'BARILLA', '0076808011043') +
  row('Voila1', 'Voila', 'Barilla Spaghettoni Pasta 410 g', '410g', '', '') +
  row('Voila2', 'Voila', 'Barilla Spaghettoni Pasta 500 g', '500g', '', '') +
  row('Walmart1', 'Walmart', 'Blueberry', '510g', '', '');

const L = { day: '20261110', current: '3.49', old: '', perUnit: '', other: '' };

test('planMatches gives each no-barcode product its twin\'s barcode and counts them per chain', () => {
  const products = readProducts(CSV);
  const plan = planMatches(products, new Set());
  assert.equal(plan.matches.size, 1);
  assert.equal(plan.matches.get('Voila1')!.code, '0076808011043');
  assert.deepEqual(plan.matchedByVendor, { Voila: 1 });
  assert.deepEqual(plan.triedByVendor, { Voila: 2, Walmart: 1 });
});

test('planMatches leaves out the products it is told to skip (loose produce)', () => {
  const plan = planMatches(readProducts(CSV), new Set(['Voila1']));
  assert.equal(plan.matches.size, 0);
});

test('matchedRowsFor writes the price under the twin\'s barcode, marked as a name join with the way it was matched', () => {
  const products = readProducts(CSV);
  const m = planMatches(products, new Set()).matches.get('Voila1')!;
  const rows = matchedRowsFor(products.get('Voila1')!, L, m);
  assert.equal(rows.length, 1);
  const o = rows[0];
  assert.equal(o.code, '0076808011043');
  assert.equal(o.priceCents, 349);
  assert.equal(o.sellerSku, 'Voila1');
  assert.equal(o.joinMethod, 'name');
  assert.equal(o.storeName, 'Voila');
  assert.deepEqual(JSON.parse(o.flags!), [MATCHED_FLAG, 'twin:Metro1']);
});

test('a matched sale writes the promotional row and the regular row, both marked', () => {
  const products = readProducts(CSV);
  const m = planMatches(products, new Set()).matches.get('Voila1')!;
  const rows = matchedRowsFor(products.get('Voila1')!, { ...L, current: '2.99', old: '3.99' }, m);
  assert.deepEqual(rows.map((r) => [r.kind, r.priceCents, r.sellerSku]), [['promotional', 299, 'Voila1'], ['regular', 399, 'Voila1#regular']]);
  assert.ok(rows.every((r) => r.flags!.includes(MATCHED_FLAG)));
});

test('dropMatchedRows undoes only the matched rows: barcoded rows from the same seller stay', () => {
  const db = openPrices(':memory:');
  const products = readProducts(CSV);
  const m = planMatches(products, new Set()).matches.get('Voila1')!;
  for (const o of matchedRowsFor(products.get('Voila1')!, { ...L, current: '2.99', old: '3.99' }, m)) recordObservation(db, o);
  for (const o of observationsFor(products.get('Metro1')!, L)) recordObservation(db, o);
  assert.equal(dropMatchedRows(db), 2);
  const left = db.prepare('SELECT seller_sku FROM observation WHERE seller = ?').all(SELLER) as Array<{ seller_sku: string }>;
  assert.deepEqual(left.map((r) => r.seller_sku), ['Metro1']);
  db.close();
});

test('a shopper asking for the barcode now sees the matched chain beside the barcoded one', () => {
  const db = openPrices(':memory:');
  const products = readProducts(CSV);
  const m = planMatches(products, new Set()).matches.get('Voila1')!;
  for (const o of observationsFor(products.get('Metro1')!, { ...L, current: '3.99' })) recordObservation(db, o);
  for (const o of matchedRowsFor(products.get('Voila1')!, L, m)) recordObservation(db, o);
  const rows = db.prepare('SELECT store_name, price_cents, join_method FROM observation WHERE code = ? ORDER BY store_name').all('0076808011043') as Array<Record<string, unknown>>;
  assert.deepEqual(rows.map((r) => ({ ...r })), [
    { store_name: 'Metro', price_cents: 399, join_method: 'gtin' },
    { store_name: 'Voila', price_cents: 349, join_method: 'name' },
  ]);
  db.close();
});
