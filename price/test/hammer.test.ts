import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CsvReader, hammerCode, readProducts, readLatest, observationsFor, ensureRegistered, SELLER } from '../src/hammer.ts';
import { openPrices, recordObservation } from '../src/store.ts';
import { requireSourceUse } from '../src/registry.ts';

test('CsvReader keeps quoted commas, doubled quotes and newlines inside one field', () => {
  const rows: string[][] = [];
  const r = new CsvReader((row) => rows.push(row));
  r.push('a,"b, c","say ""hi""\r\nthere"\r\n1,2,3\n');
  r.end();
  assert.deepEqual(rows, [['a', 'b, c', 'say "hi"\r\nthere'], ['1', '2', '3']]);
});

test('CsvReader handles a doubled quote split across two chunks', () => {
  const rows: string[][] = [];
  const r = new CsvReader((row) => rows.push(row));
  r.push('"x"');
  r.push('"y",z\n');
  r.end();
  assert.deepEqual(rows, [['x"y', 'z']]);
});

test('hammerCode repairs a UPC that lost its leading zero and refuses junk', () => {
  assert.equal(hammerCode('57800107668'), '0057800107668');
  assert.equal(hammerCode('8809239010628'), '8809239010628');
  assert.equal(hammerCode(''), null);
  assert.equal(hammerCode('abc'), null);
  assert.equal(hammerCode('0000000000000'), null);
  assert.equal(hammerCode('1234'), null);
});

const PRODUCTS =
  'id,concatted,vendor,product_name,units,brand,detail_url,sku,upc\r\n' +
  'Metro729571884429,"Metro~Lily@1un^",Metro,"Asiatic Hybrids Lily",1un,,,729571884429,729571884429\r\n' +
  'Loblaws21363882_EA,"Loblaws~Worms",Loblaws,"Gummy Sour Worms",500g,"Carnaby Sweet",,21363882_EA,57800107668\r\n' +
  'Voila1,"Voila~Apples",Voila,"Apples, ""Ambrosia""\nbag",1.36kg,,,1,\r\n';

const RAW =
  'nowtime,current_price,old_price,price_per_unit,other,product_id\r\n' +
  '20240622,3.99,,,,Metro729571884429\r\n' +
  '20241225,4.49,,,"Out of stock",Metro729571884429\r\n' +
  '20241001,2.50,3.29,$0.50/100g,SALE,Loblaws21363882_EA\r\n' +
  '20240901,3.29,,,,Loblaws21363882_EA\r\n' +
  '20240901,5.49,,,,Voila1\r\n';

test('readProducts parses multi-line names and keeps only usable barcodes as codes', () => {
  const p = readProducts(PRODUCTS);
  assert.equal(p.size, 3);
  assert.equal(p.get('Voila1')!.code, null);
  assert.equal(p.get('Voila1')!.name, 'Apples, "Ambrosia"\nbag');
  assert.equal(p.get('Loblaws21363882_EA')!.code, '0057800107668');
});

test('readLatest keeps the most recent row per product and the date span', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hammer-'));
  try {
    writeFileSync(join(dir, 'raw.csv'), RAW);
    const { latest, rows, minDay, maxDay } = await readLatest(join(dir, 'raw.csv'), new Set(['Metro729571884429', 'Loblaws21363882_EA']));
    assert.equal(rows, 5);
    assert.equal(minDay, '20240622');
    assert.equal(maxDay, '20241225');
    assert.equal(latest.get('Metro729571884429')!.current, '4.49');
    assert.equal(latest.get('Loblaws21363882_EA')!.current, '2.50');
    assert.equal(latest.has('Voila1'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('observationsFor: a sale writes the promotional row and the regular price beside it', () => {
  const p = readProducts(PRODUCTS);
  const sale = observationsFor(p.get('Loblaws21363882_EA')!, { day: '20241001', current: '2.50', old: '3.29', perUnit: '$0.50/100g', other: 'SALE' });
  assert.equal(sale.length, 2);
  assert.deepEqual(
    sale.map((o) => [o.kind, o.priceCents, o.wasCents, o.joinMethod, o.seenOn, o.storeName, o.region]),
    [
      ['promotional', 250, 329, 'name', '2024-10-01', 'Loblaws', 'ON'],
      ['regular', 329, null, 'name', '2024-10-01', 'Loblaws', 'ON'],
    ],
  );
  const direct = observationsFor(p.get('Metro729571884429')!, { day: '20241225', current: '4.49', old: '', perUnit: '', other: 'Out of stock' });
  assert.deepEqual(direct.map((o) => [o.kind, o.priceCents, o.joinMethod, o.inStock]), [['regular', 449, 'gtin', 0]]);
  assert.deepEqual(observationsFor(p.get('Voila1')!, { day: '20240901', current: '5.49', old: '', perUnit: '', other: '' }), []);
  assert.deepEqual(observationsFor(p.get('Metro729571884429')!, { day: '20240901', current: 'n/a', old: '', perUnit: '', other: '' }), []);
});

test('the hammer source registers once and its rows load into an enforced prices database', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hammer-db-'));
  try {
    const db = openPrices(join(dir, 'prices.db'), { enforceSources: true });
    ensureRegistered(db);
    ensureRegistered(db);
    assert.equal(requireSourceUse(db, SELLER, 'automated').seller, SELLER);
    const p = readProducts(PRODUCTS);
    for (const o of observationsFor(p.get('Metro729571884429')!, { day: '20241225', current: '4.49', old: '', perUnit: '', other: '' })) recordObservation(db, o);
    const n = db.prepare('SELECT COUNT(*) AS n FROM source_registry WHERE seller = ?').get(SELLER) as { n: number };
    assert.equal(Number(n.n), 1);
    const row = db.prepare('SELECT code, price_cents, store_city FROM observation WHERE seller = ?').get(SELLER) as Record<string, unknown>;
    assert.deepEqual({ ...row }, { code: '0729571884429', price_cents: 449, store_city: 'Toronto' });
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
