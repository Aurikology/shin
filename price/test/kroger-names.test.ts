import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upcCheckDigit, krogerCode, cleanName, readKroger, catalogueRow, rowsForMissing, SELLER } from '../src/kroger-names.ts';

const CSV =
  'name,subcategory,category,product_id,url,price\r\n' +
  // 0030100111764 and 0013000008549 are real barcodes Open Food Facts holds (checked 2026-11-22).
  'Kellogg\'s Club Crackers Original,Crackers,Pantry,0003010011176,https://www.kroger.com/p/x/0003010011176,3.99\r\n' +
  '"Heinz All Natural Distilled White Vinegar, 5% Acidity 32 fl oz",Vinegar,Pantry,0001300000854,https://www.kroger.com/p/y/0001300000854,2.49\r\n' +
  'Kettle Brand® Sea Salt Potato Chips,Snacks,Pantry,0008411410812,https://www.kroger.com/p/z/0008411410812,3.19\r\n' +
  'Kellogg\'s Club Crackers Original again,Crackers,Pantry,0003010011176,https://www.kroger.com/p/x/0003010011176,4.99\r\n' +
  'Organic Yellow Corn Tortillas,Bread,Bakery,1007885851062,https://www.kroger.com/p/t/1007885851062,3.50\r\n' +
  'Bananas,Produce,Produce,0000000004011,https://www.kroger.com/p/b/0000000004011,0.59\r\n' +
  ',Snacks,Pantry,0008411411632,https://www.kroger.com/p/n/0008411411632,1.00\r\n';

test('the check digit turns a Kroger id into a real barcode', () => {
  assert.equal(upcCheckDigit('03010011176'), 4);
  assert.equal(krogerCode('0003010011176'), '0030100111764');
  assert.equal(krogerCode('0001300000854'), '0013000008549');
});

test('ids that are not a UPC body are refused, not guessed', () => {
  assert.equal(krogerCode('1007885851062'), null); // other id scheme
  assert.equal(krogerCode('0000000004011'), null); // produce PLU
  assert.equal(krogerCode('12345'), null);
  assert.equal(krogerCode(''), null);
});

test('names lose trade-mark signs and stray spaces, nothing else', () => {
  assert.equal(cleanName('Kettle Brand®  Sea Salt ™ Chips '), 'Kettle Brand Sea Salt Chips');
});

test('the parse keeps names and barcodes, skips the rest, and has no price anywhere', () => {
  const r = readKroger(CSV);
  assert.equal(r.rows, 7);
  assert.deepEqual(
    r.products.map((p) => [p.code, p.name]),
    [
      ['0030100111764', "Kellogg's Club Crackers Original"],
      ['0013000008549', 'Heinz All Natural Distilled White Vinegar, 5% Acidity 32 fl oz'],
      ['0084114108128', 'Kettle Brand Sea Salt Potato Chips'],
    ],
  );
  assert.equal(r.duplicates, 1);
  assert.equal(r.skippedOtherIdScheme, 2);
  assert.equal(r.skippedNoName, 1);
  for (const p of r.products) assert.deepEqual(Object.keys(p).sort(), ['code', 'name']);
});

test('a catalogue row is a name-only US row: no price, no category, not sold in Canada', () => {
  const [, vinegar] = readKroger(CSV).products;
  const row = catalogueRow(vinegar!);
  assert.equal(row.source, SELLER);
  assert.equal(row.sold_in_canada, 0);
  assert.equal(row.brands, null);
  assert.deepEqual(row.category_path, []);
  assert.equal(row.size_unit, 'fl oz');
  assert.equal(row.size_value, 32);
  assert.ok(!JSON.stringify(row).includes('price'));
  assert.ok(!('price' in row));
});

test('only barcodes the catalogue lacks become rows', () => {
  const products = readKroger(CSV).products;
  const rows = rowsForMissing(products, (c) => c === '0030100111764');
  assert.deepEqual(rows.map((r) => r.code), ['0013000008549', '0084114108128']);
});
