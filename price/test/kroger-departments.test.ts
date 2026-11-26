import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { KROGER_CATEGORY_DEPARTMENT, krogerDepartment } from '../src/kroger-departments.ts';
import { catalogueRow, readKroger, SELLER } from '../src/kroger-names.ts';
import { backfillKrogerDepartments } from '../src/kroger-backfill.ts';
import { DEPARTMENT_OF_SOURCE, departmentOfRow } from '../../catalogue/src/placement.ts';
import { departmentOf } from '../src/range.ts';

// Every category value in kroger_products.csv, counted 2026-11-25 (24 of them).
const CATEGORIES = [
  'Beauty', 'Vitamins and Supplements', 'Pet', 'Cleaning and Household', 'Health and Wellness', 'Personal Care',
  'Electronics', 'Pantry', 'Natural and Organic', 'Beverages', 'Baby', 'Toys and Games', 'Kitchen and Dining',
  'Garden and Patio', 'Breakfast', 'Frozen', 'Candy', 'Dairy and Eggs', 'Meat', 'Floral', 'Seafood', 'Deli',
  'Fresh Fruit and Vegetables', 'Bakery',
];

function id(i: number): string {
  return '00' + '0' + String(1000000000 + i);
}

function csvOf(rows: readonly [string, string, string][]): string {
  return (
    'name,subcategory,category,product_id,url,price\r\n' +
    rows.map(([name, sub, cat], i) => `${name},${sub},${cat},${id(i + 1)},https://x/${i},1.00\r\n`).join('')
  );
}

test('the mapping table covers every category in the file and uses only departments Pexi already has', () => {
  assert.deepEqual(Object.keys(KROGER_CATEGORY_DEPARTMENT).sort(), [...CATEGORIES].sort());
  const known = new Set(Object.values(DEPARTMENT_OF_SOURCE));
  for (const [cat, rule] of Object.entries(KROGER_CATEGORY_DEPARTMENT)) {
    assert.ok(known.has(rule.dept), `${cat} -> ${rule.dept}`);
    for (const d of Object.values(rule.sub ?? {})) assert.ok(known.has(d), `${cat} sub -> ${d}`);
  }
  const r = readKroger(csvOf(CATEGORIES.map((c, i) => [`Item ${i}`, 'Whatever', c] as [string, string, string])));
  assert.equal(r.products.length, CATEGORIES.length);
  assert.deepEqual(r.unmapped, {});
  assert.ok(r.products.every((p) => typeof p.department === 'string'));
});

test('shampoo-like rows land outside food, mixed categories split by subcategory', () => {
  assert.equal(krogerDepartment('Beauty', 'Shampoo'), 'beauty');
  assert.equal(krogerDepartment('Cleaning and Household', 'Laundry Detergents'), 'general');
  assert.equal(krogerDepartment('Pet', 'Wet Dog Food'), 'pet');
  assert.equal(krogerDepartment('Pet', 'Pet Toys'), 'general');
  assert.equal(krogerDepartment('Pantry', 'Snacks'), 'food');
  assert.equal(krogerDepartment('Natural and Organic', 'Beauty and Personal Care'), 'beauty');
  assert.equal(krogerDepartment('Natural and Organic', 'Dairy and Eggs'), 'food');
  assert.equal(krogerDepartment('Health and Wellness', 'Weight Management and Nutrition'), 'food');
  assert.equal(krogerDepartment('Health and Wellness', 'First Aid'), 'general');
  assert.equal(krogerDepartment('Baby', 'Baby Formula'), 'food');
  const r = readKroger(csvOf([['Suave Shampoo 12 fl oz', 'Shampoo', 'Beauty']]));
  const row = catalogueRow(r.products[0]!);
  assert.equal(row.department, 'beauty');
  assert.equal(row.source, SELLER);
  assert.notEqual(departmentOf(SELLER, row.department as string), 'food');
});

test('a row department wins over the source department only when present', () => {
  assert.equal(departmentOfRow('kroger-names', null), 'food');
  assert.equal(departmentOfRow('kroger-names', ''), 'food');
  assert.equal(departmentOfRow('kroger-names', 'beauty'), 'beauty');
  assert.equal(departmentOfRow('openfoodfacts', undefined), 'food');
  assert.equal(departmentOf('kroger-names'), 'food');
  assert.equal(departmentOf('kroger-names', 'pet'), 'pet');
  assert.equal(departmentOf('no-such-source'), null);
});

test('an unmapped category is counted, keeps a null department, and is not turned into food', () => {
  const r = readKroger(
    csvOf([
      ['Mystery A', 'x', 'Auto Parts'],
      ['Mystery B', 'y', 'Auto Parts'],
      ['Crackers', 'Snacks', 'Pantry'],
    ]),
  );
  assert.deepEqual(r.unmapped, { 'Auto Parts': 2 });
  assert.deepEqual(r.products.map((p) => p.department), [null, null, 'food']);
  assert.equal(catalogueRow(r.products[0]!).department, null);
  assert.equal(krogerDepartment('Auto Parts', 'x'), null);
  assert.equal(krogerDepartment('constructor', 'x'), null);
});

function fixtureDb(codes: Record<string, string>): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT, source TEXT NOT NULL)');
  const ins = db.prepare('INSERT INTO product (code, name, source) VALUES (?,?,?)');
  for (const [code, source] of Object.entries(codes)) ins.run(code, `n ${code}`, source);
  return db;
}

const BACKFILL_CSV = csvOf([
  ['Suave Shampoo', 'Shampoo', 'Beauty'], // id(1)
  ['Tide Detergent', 'Laundry Detergents', 'Cleaning and Household'], // id(2)
  ['Club Crackers', 'Snacks', 'Pantry'], // id(3)
  ['Mystery', 'x', 'Auto Parts'], // id(4)
]);

/** The catalogue spelling of id(i): krogerCode's 13-digit code, read back off the parse. */
function codesOf(): string[] {
  return readKroger(BACKFILL_CSV).products.map((p) => p.code);
}

test('backfill dry run changes nothing, not even the schema, and reports before and after', () => {
  const [shampoo, tide, crackers, mystery] = codesOf();
  const db = fixtureDb({ [shampoo!]: SELLER, [tide!]: SELLER, [crackers!]: SELLER, [mystery!]: SELLER });
  const before = db.prepare('SELECT * FROM product ORDER BY code').all();
  const r = backfillKrogerDepartments(db, BACKFILL_CSV, true);
  assert.deepEqual(db.prepare('SELECT * FROM product ORDER BY code').all(), before);
  assert.ok(!(db.prepare('PRAGMA table_info(product)').all() as { name: string }[]).some((c) => c.name === 'department'));
  assert.equal(r.dryRun, true);
  assert.equal(r.rows, 4);
  assert.deepEqual(r.before, { food: 4 });
  assert.deepEqual(r.after, { food: 2, beauty: 1, general: 1 });
  assert.equal(r.changed, 2);
  assert.equal(r.unmappedRows, 1);
  assert.deepEqual(r.unmappedCategories, { 'Auto Parts': 1 });
});

test('backfill writes departments to kroger-names rows only and leaves other sources untouched', () => {
  const [shampoo, tide, crackers, mystery] = codesOf();
  const db = fixtureDb({
    [shampoo!]: SELLER,
    [tide!]: 'openfoodfacts', // same barcode as a file row but another source: must not change
    [crackers!]: SELLER,
    [mystery!]: SELLER,
    '0099999999999': SELLER, // kroger-names row the file does not list
    '0088888888888': 'usda',
  });
  const r = backfillKrogerDepartments(db, BACKFILL_CSV, false);
  const dept = (code: string): unknown => (db.prepare('SELECT department FROM product WHERE code = ?').get(code) as { department: unknown }).department;
  assert.equal(dept(shampoo!), 'beauty');
  assert.equal(dept(crackers!), null); // food already: nothing to write
  assert.equal(dept(mystery!), null); // unmapped: left alone
  assert.equal(dept('0099999999999'), null);
  assert.equal(dept(tide!), null);
  assert.equal(dept('0088888888888'), null);
  assert.equal(r.rows, 4);
  assert.equal(r.changed, 1);
  assert.equal(r.notInFile, 1);
  assert.equal(r.unmappedRows, 1);
  assert.deepEqual(r.before, { food: 4 });
  assert.deepEqual(r.after, { food: 3, beauty: 1 });
  // A second run finds nothing to do.
  assert.equal(backfillKrogerDepartments(db, BACKFILL_CSV, false).changed, 0);
});
