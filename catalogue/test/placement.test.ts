/**
 * Price-category plan, Stage 2, requirement 1.1: one parent per node by a written
 * rule, exactly one path per item, enforced by the database; items with no
 * category sit in an explicit "unplaced" node under their department
 * (docs/decisions.md, "One path per item: unplaced items sit in an explicit
 * "unplaced" node", 2026-10-09), and an unplaced item can never be read as a
 * placed category.
 *
 * Written before catalogue/src/placement.ts existed; every test here was red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { DatabaseSync as Db } from 'node:sqlite';
import { openCatalogue } from '../src/schema.ts';
import { taxonomyFromObject } from '../src/category-taxonomy.ts';
import {
  assertPlacedCategory,
  buildPlacement,
  categoryInputFor,
  countPaths,
  departmentOfSource,
  ensurePlacementSchema,
  isUnplacedTag,
  placeItem,
  placementCallCount,
  UnplacedCategoryError,
  UNPLACED_TAG,
  NO_DEPARTMENT,
} from '../src/placement.ts';
import { priceRangeFor } from '../../price/src/range.ts';

interface Row {
  code: string;
  source: string;
  path: string[];
  size?: number;
}

function catalogue(rows: readonly Row[]): DatabaseSync {
  const db = openCatalogue(':memory:');
  const ins = db.prepare(
    `INSERT INTO product (code, name, size_value, size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  for (const r of rows) {
    ins.run(r.code, `item ${r.code}`, r.size ?? null, r.size ? 'g' : null, JSON.stringify(r.path), r.path.at(-1) ?? null, '[]', 1, r.source);
  }
  return db;
}

/*
 * The fixture. "en:x" is seen after "en:a" in three food items and after "en:b" in one,
 * so the written rule gives it the parent "en:a". "en:p" and "en:q" are seen in both
 * orders, which would be a cycle if each simply took its predecessor.
 */
const ROWS: Row[] = [
  { code: 'F1', source: 'openfoodfacts', path: ['en:a', 'en:x'] },
  { code: 'F2', source: 'openfoodfacts', path: ['en:a', 'en:x'] },
  { code: 'F3', source: 'openfoodfacts', path: ['en:a', 'en:x', 'en:y'] },
  { code: 'F4', source: 'openfoodfacts', path: ['en:b', 'en:x'] },
  { code: 'F5', source: 'openfoodfacts', path: ['en:p', 'en:q'] },
  { code: 'F6', source: 'openfoodfacts', path: ['en:q', 'en:p'] },
  { code: 'F7', source: 'openfoodfacts', path: [] },
  { code: 'F8', source: 'openfoodfacts', path: [] },
  { code: 'B1', source: 'openbeautyfacts', path: ['en:shampoos'] },
  { code: 'B2', source: 'openbeautyfacts', path: [] },
  { code: 'E1', source: 'icecat', path: ['Laptops'] },
  { code: 'D1', source: 'returnit', path: [] },
  { code: 'M1', source: 'somewhere-new', path: [] },
  { code: 'M2', source: 'somewhere-new', path: ['en:mystery'] },
];

function built(rows: readonly Row[] = ROWS): DatabaseSync {
  const db = catalogue(rows);
  ensurePlacementSchema(db);
  buildPlacement(db, { log: () => {} });
  return db;
}

function pathOf(db: DatabaseSync, code: string): string[] {
  const input = categoryInputFor(db, code);
  return input.placed ? [...input.categoryPath] : [];
}

function parentTagOf(db: DatabaseSync, department: string, tag: string): string | null {
  const r = db
    .prepare(
      `SELECT p.tag FROM placement_node n LEFT JOIN placement_node p ON p.node_id = n.parent_id
        WHERE n.department = ? AND n.tag = ?`,
    )
    .get(department, tag) as { tag: string | null } | undefined;
  assert.ok(r, `no node ${department} ${tag}`);
  return r.tag;
}

/* ------------------------------------------------------- the written rule */

test('1.1 every product has exactly one path, unplaced included', () => {
  const db = built();
  const c = countPaths(db);
  assert.equal(c.products, ROWS.length);
  assert.equal(c.withExactlyOnePath, ROWS.length);
  assert.equal(c.withNoPath, 0);
  assert.equal(c.withTwoOrMorePaths, 0);
  assert.equal(c.brokenChains, 0);
});

test('1.1 a department comes from the row\'s own source; an unknown source has none', () => {
  assert.equal(departmentOfSource('openfoodfacts'), 'food');
  assert.equal(departmentOfSource('openbeautyfacts'), 'beauty');
  assert.equal(departmentOfSource('icecat'), 'electronics');
  assert.equal(departmentOfSource('returnit'), 'drinks');
  assert.equal(departmentOfSource('somewhere-new'), NO_DEPARTMENT);
});

test('1.1 unplaced items are counted per department, and a row with no known department sits in the top-level unplaced node', () => {
  const db = built();
  const c = countPaths(db);
  assert.deepEqual(c.unplacedByDepartment, { beauty: 1, drinks: 1, food: 2, [NO_DEPARTMENT]: 2 });
  assert.equal(c.topLevelUnplaced, 2, 'M1 and M2: no department, so even a path cannot place them under one');
  const top = db
    .prepare(`SELECT parent_id, depth FROM placement_node WHERE department = ? AND tag = ?`)
    .get(NO_DEPARTMENT, UNPLACED_TAG) as { parent_id: number | null; depth: number };
  assert.equal(top.parent_id, null, 'the top-level unplaced node has no parent');
  assert.equal(top.depth, 0);
  assert.equal(parentTagOf(db, 'food', UNPLACED_TAG), '@department', 'a department\'s unplaced node hangs off the department');
});

test('1.1 a node\'s parent is the tag seen before it in the most items (en:x after en:a three times, after en:b once)', () => {
  const db = built();
  assert.equal(parentTagOf(db, 'food', 'en:x'), 'en:a');
  assert.deepEqual(pathOf(db, 'F4'), ['en:a', 'en:x'], 'F4 recorded en:b before en:x, but en:x has one parent and so F4 has one path');
  assert.deepEqual(pathOf(db, 'F3'), ['en:a', 'en:x', 'en:y']);
  assert.equal(parentTagOf(db, 'food', 'en:a'), '@department', 'a tag never seen after another hangs off the department');
});

test('1.1 with a taxonomy, a parent that is a taxonomy ancestor beats a more frequent one that is not', () => {
  const tax = taxonomyFromObject({ 'en:a': { parents: [] }, 'en:b': { parents: [] }, 'en:x': { parents: ['en:b'] } }, 't');
  const db = catalogue(ROWS);
  ensurePlacementSchema(db);
  buildPlacement(db, { taxonomy: tax, log: () => {} });
  assert.equal(parentTagOf(db, 'food', 'en:x'), 'en:b');
});

test('1.1 tags seen in both orders never form a cycle: every chain ends at the department', () => {
  const db = built();
  const p = parentTagOf(db, 'food', 'en:p');
  const q = parentTagOf(db, 'food', 'en:q');
  assert.ok(!(p === 'en:q' && q === 'en:p'), 'p and q would be each other\'s parent');
  assert.equal(countPaths(db).brokenChains, 0);
  assert.equal(pathOf(db, 'F5').at(-1), 'en:q');
  assert.equal(pathOf(db, 'F6').at(-1), 'en:p');
});

test('1.1 a placed node\'s parent, once decided, never changes on a later build', () => {
  const db = built();
  const before = parentTagOf(db, 'food', 'en:x');
  const ins = db.prepare(`INSERT INTO product (code, name, category_path, leaf_category, allergens, sold_in_canada, source) VALUES (?,?,?,?,?,?,?)`);
  for (const code of ['G1', 'G2', 'G3', 'G4', 'G5']) ins.run(code, code, JSON.stringify(['en:b', 'en:x']), 'en:x', '[]', 1, 'openfoodfacts');
  buildPlacement(db, { log: () => {} });
  assert.equal(parentTagOf(db, 'food', 'en:x'), before);
  assert.equal(countPaths(db).withExactlyOnePath, ROWS.length + 5);
});

test('1.1 a stored tag in the reserved "@" form stops the build', () => {
  const db = catalogue([{ code: 'X', source: 'openfoodfacts', path: ['en:a'] }]);
  ensurePlacementSchema(db);
  db.exec(`DROP TRIGGER product_no_reserved_tag_update`);
  db.exec(`UPDATE product SET category_path = '["@unplaced"]' WHERE code = 'X'`);
  assert.throws(() => buildPlacement(db, { log: () => {} }), /reserved/);
});

test('1.1 installing the layer on a catalogue that already holds products gives every one of them a path', () => {
  const db = catalogue(ROWS);
  const r = ensurePlacementSchema(db);
  assert.equal(r.backfilled, ROWS.length);
  const c = countPaths(db);
  assert.equal(c.withExactlyOnePath, ROWS.length);
  assert.equal(ensurePlacementSchema(db).backfilled, 0, 'idempotent');
});

/* ------------------------------------------------- the database enforces it */

test('1.1 the database refuses a second path for an item', () => {
  const db = built();
  const node = (db.prepare(`SELECT node_id FROM placement_node WHERE department = 'food' AND tag = 'en:b'`).get() as { node_id: number }).node_id;
  assert.throws(() => db.prepare(`INSERT INTO item_placement (code, leaf_id, placed_by) VALUES ('F1', ?, 'test')`).run(node), /UNIQUE|constraint/i);
  assert.equal(countPaths(db).withExactlyOnePath, ROWS.length);
});

test('1.1 the database refuses to leave an item with no path (delete, null leaf)', () => {
  const db = built();
  assert.throws(() => db.exec(`DELETE FROM item_placement WHERE code = 'F1'`), /exactly one path/);
  assert.throws(() => db.exec(`UPDATE item_placement SET leaf_id = NULL WHERE code = 'F1'`), /NOT NULL|constraint/i);
  assert.equal(countPaths(db).withNoPath, 0);
});

test('1.1 a new product gets its department\'s unplaced path from the database itself, never zero paths', () => {
  const db = built();
  db.prepare(`INSERT INTO product (code, name, category_path, allergens, sold_in_canada, source) VALUES ('NEW', 'n', '[]', '[]', 1, 'openpetfoodfacts')`).run();
  const input = categoryInputFor(db, 'NEW');
  assert.equal(input.placed, false);
  assert.equal(input.department, 'pet');
  assert.equal(countPaths(db).withNoPath, 0);
});

test('1.1 deleting a product removes its one path with it', () => {
  const db = built();
  db.exec(`DELETE FROM product WHERE code = 'F7'`);
  const c = countPaths(db);
  assert.equal(c.products, ROWS.length - 1);
  assert.equal(c.withExactlyOnePath, ROWS.length - 1);
  assert.equal(c.orphanPlacements, 0);
});

test('1.1 the database refuses an item placed under another department, or on a node that does not exist', () => {
  const db = built();
  const beautyNode = (db.prepare(`SELECT node_id FROM placement_node WHERE department = 'beauty' AND tag = 'en:shampoos'`).get() as { node_id: number }).node_id;
  assert.throws(() => db.prepare(`UPDATE item_placement SET leaf_id = ? WHERE code = 'F1'`).run(beautyNode), /department/);
  assert.throws(() => db.exec(`UPDATE item_placement SET leaf_id = 999999 WHERE code = 'F1'`), /does not exist/);
});

test('1.1 the database refuses a second parent, a re-parent, a deleted node and a node hung under "unplaced"', () => {
  const db = built();
  const id = (t: string, d = 'food') => (db.prepare(`SELECT node_id FROM placement_node WHERE department = ? AND tag = ?`).get(d, t) as { node_id: number }).node_id;
  assert.throws(() => db.prepare(`UPDATE placement_node SET parent_id = ? WHERE node_id = ?`).run(id('en:b'), id('en:x')), /never changes/);
  assert.throws(() => db.prepare(`DELETE FROM placement_node WHERE node_id = ?`).run(id('en:y')), /never deleted/);
  assert.throws(
    () => db.prepare(`INSERT INTO placement_node (department, tag, parent_id, depth, kind) VALUES ('food', 'en:x', ?, 2, 'category')`).run(id('en:b')),
    /UNIQUE|constraint/i,
    'a second (department, tag) row would be the second parent',
  );
  assert.throws(
    () => db.prepare(`INSERT INTO placement_node (department, tag, parent_id, depth, kind) VALUES ('food', 'en:under', ?, 2, 'category')`).run(id(UNPLACED_TAG)),
    /unplaced/,
  );
});

/* ------------------------------------- "unplaced" is never a placed category */

test('1.1 the guard: "unplaced" is never a category', () => {
  assert.equal(isUnplacedTag(UNPLACED_TAG), true);
  assert.equal(isUnplacedTag('en:cheeses'), false);
  assert.throws(() => assertPlacedCategory(UNPLACED_TAG), UnplacedCategoryError);
  assert.throws(() => assertPlacedCategory('@department'), UnplacedCategoryError);
  assert.throws(() => assertPlacedCategory(null), UnplacedCategoryError);
  assert.equal(assertPlacedCategory('en:cheeses'), 'en:cheeses');
});

test('1.1 a range reader\'s input for an unplaced item carries no category at all', () => {
  const db = built();
  const u = categoryInputFor(db, 'F7');
  assert.equal(u.placed, false);
  assert.equal(u.leafCategory, null);
  assert.equal(u.categoryPath, null);
  const p = categoryInputFor(db, 'F3');
  assert.equal(p.placed, true);
  assert.equal(p.leafCategory, 'en:y');
});

test('1.1 the database refuses the unplaced tag in the columns range readers read (category_path, leaf_category)', () => {
  const db = built();
  assert.throws(() => db.exec(`UPDATE product SET leaf_category = '@unplaced' WHERE code = 'F7'`), /reserved/);
  assert.throws(() => db.exec(`UPDATE product SET category_path = '["@unplaced"]' WHERE code = 'F7'`), /reserved/);
  assert.throws(
    () => db.exec(`INSERT INTO product (code, name, category_path, leaf_category, allergens, sold_in_canada, source) VALUES ('Z', 'z', '["@unplaced"]', '@unplaced', '[]', 1, 'openfoodfacts')`),
    /reserved/,
  );
  const leaks = db.prepare(`SELECT count(*) AS n FROM product WHERE leaf_category LIKE '@%' OR category_path LIKE '%"@%'`).get() as { n: number };
  assert.equal(leaks.n, 0);
  const pc = db.prepare(`SELECT count(*) AS n FROM product_category WHERE tag LIKE '@%'`).get() as { n: number };
  assert.equal(pc.n, 0);
});

/** Six priced items of one size; the price range ladder pools 5+ of them as a category. */
function rangeFixture(path: string[]): { db: DatabaseSync; prices: DatabaseSync } {
  const rows: Row[] = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'T'].map((code) => ({ code, source: 'openfoodfacts', path, size: 500 }));
  const db = catalogue(rows);
  ensurePlacementSchema(db);
  buildPlacement(db, { log: () => {} });
  const prices = new Db(':memory:');
  prices.exec(`CREATE TABLE observation (code TEXT, seller TEXT, region TEXT, store_name TEXT, store_osm TEXT, price_cents INTEGER,
    seen_on TEXT, url TEXT, kind TEXT, currency TEXT)`);
  const ins = prices.prepare(`INSERT INTO observation VALUES (?,?,NULL,NULL,NULL,?,?,NULL,'regular','CAD')`);
  ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].forEach((c, i) => ins.run(c, 'walmart.ca', 400 + i * 10, '2026-10-01'));
  return { db, prices };
}

test('1.1 control: placed items with prices DO give the range reader a category range (so the next test can fail)', () => {
  const { db, prices } = rangeFixture(['en:spreads', 'en:peanut-butters']);
  const r = priceRangeFor({ barcode: 'T', asOf: '2026-10-05', ...categoryInputFor(db, 'T').rangeInput }, { prices, catalogue: db });
  assert.equal(r.basis, 'leaf_category');
});

test('1.1 a range reader cannot treat "unplaced" as a category: six priced unplaced items of one department never pool', () => {
  const { db, prices } = rangeFixture([]);
  assert.equal(categoryInputFor(db, 'T').placed, false);
  const viaColumns = priceRangeFor({ barcode: 'T', asOf: '2026-10-05' }, { prices, catalogue: db });
  assert.equal(viaColumns.basis, 'none', 'reading the product columns');
  const viaLayer = priceRangeFor({ barcode: 'T', asOf: '2026-10-05', ...categoryInputFor(db, 'T').rangeInput }, { prices, catalogue: db });
  assert.equal(viaLayer.basis, 'none', 'reading the placement layer');
  for (const step of [...viaColumns.tried, ...viaLayer.tried]) assert.ok(step.category === null || !step.category.startsWith('@'), JSON.stringify(step));
});

/* -------------------------------------------------- placement is counted */

test('1.1 every placement is counted (the 1.6 rebuild check reads this counter)', () => {
  const db = built();
  const before = placementCallCount();
  const node = (db.prepare(`SELECT node_id FROM placement_node WHERE department = 'food' AND tag = 'en:b'`).get() as { node_id: number }).node_id;
  assert.ok(node > 0);
  placeItem(db, 'F7', 'en:b', 'test');
  assert.equal(placementCallCount(), before + 1);
  assert.deepEqual(pathOf(db, 'F7'), ['en:b']);
  assert.equal(countPaths(db).unplacedByDepartment.food, 1);
  assert.throws(() => placeItem(db, 'F8', UNPLACED_TAG, 'test'), UnplacedCategoryError, 'placing INTO unplaced by name is refused; unplaced is where the database puts an item, not a category');
});
