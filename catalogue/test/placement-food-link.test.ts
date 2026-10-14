/**
 * Price-category plan 1.1: the placement build links every USDA food label into the one
 * Open Food Facts tree through the versioned data file (catalogue/food-label-map.json,
 * catalogue/src/food-label-link.ts). Measured 2026-10-13: the two food vocabularies were
 * unlinked, so USDA-label placements had no path to the en: tree.
 *
 * Written before placement.ts read the map; every test here was red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { openCatalogue } from '../src/schema.ts';
import { taxonomyFromObject } from '../src/category-taxonomy.ts';
import { buildPlacement, categoryInputFor, countPaths, ensurePlacementSchema, placementHash } from '../src/placement.ts';
import { parseFoodLabelMap } from '../src/food-label-link.ts';

interface Row {
  code: string;
  source: string;
  path: string[];
}

function catalogue(rows: readonly Row[]): DatabaseSync {
  const db = openCatalogue(':memory:');
  const ins = db.prepare(`INSERT INTO product (code, name, category_path, leaf_category, allergens, sold_in_canada, source) VALUES (?,?,?,?,?,?,?)`);
  for (const r of rows) ins.run(r.code, `item ${r.code}`, JSON.stringify(r.path), r.path.at(-1) ?? null, '[]', 1, r.source);
  return db;
}

const TAX = taxonomyFromObject(
  {
    'en:food': { parents: [] },
    'en:beverages': { parents: ['en:food'] },
    'en:sodas': { parents: ['en:beverages'] },
    'en:colas': { parents: ['en:sodas'] },
    'en:snacks': { parents: ['en:food'] },
  },
  'link-test',
);

const MAP = parseFoodLabelMap(
  JSON.stringify({
    version: 1,
    labels: {
      soda: { node: 'en:sodas', method: 'barcode', barcodes: 9, share: 1 },
      'cola drinks': { node: 'en:colas', method: 'barcode', barcodes: 8, share: 0.9 },
      chocolate: { node: null, method: 'fallback', barcodes: 0, share: null, basis: 'no-evidence' },
      ghost: { node: 'en:ghost-drinks', method: 'meaning', barcodes: 0, share: null, similarity: 0.9 },
      crisps: { node: 'en:snacks', method: 'meaning', barcodes: 0, share: null, similarity: 0.88 },
    },
  }),
);

const ROWS: Row[] = [
  { code: 'O1', source: 'openfoodfacts', path: ['en:beverages', 'en:sodas', 'en:colas'] },
  { code: 'O2', source: 'openfoodfacts', path: ['en:beverages', 'en:sodas'] },
  { code: 'O3', source: 'openfoodfacts', path: ['en:snacks'] },
  { code: 'U1', source: 'usda', path: ['soda'] },
  { code: 'U2', source: 'usda', path: ['soda'] },
  { code: 'U3', source: 'usda', path: ['cola drinks'] },
  { code: 'U4', source: 'usda', path: ['chocolate'] },
  { code: 'U5', source: 'usda', path: ['ghost'] },
  { code: 'U6', source: 'usda', path: ['unmapped label'] },
  { code: 'B1', source: 'openbeautyfacts', path: ['soda'] },
];

function build(rows: readonly Row[] = ROWS, withMap = true) {
  const db = catalogue(rows);
  const result = buildPlacement(db, { taxonomy: TAX, foodLabelMap: withMap ? MAP : null, log: () => {} });
  return { db, result };
}

function pathOf(db: DatabaseSync, code: string): readonly string[] {
  const input = categoryInputFor(db, code);
  return input.placed ? input.categoryPath : [];
}

function parentTag(db: DatabaseSync, department: string, tag: string): string | null {
  const r = db.prepare(`SELECT p.tag FROM placement_node n LEFT JOIN placement_node p ON p.node_id = n.parent_id WHERE n.department = ? AND n.tag = ?`).get(department, tag) as { tag: string | null } | undefined;
  assert.ok(r, `no node ${department} ${tag}`);
  return r.tag;
}

test('1.1 a USDA label hangs under its mapped en: node: the item\'s one path runs through en: nodes and ends on its label', () => {
  const { db } = build();
  assert.equal(parentTag(db, 'food', 'soda'), 'en:sodas');
  assert.deepEqual(pathOf(db, 'U1'), ['en:beverages', 'en:sodas', 'soda']);
  assert.deepEqual(pathOf(db, 'U3'), ['en:beverages', 'en:sodas', 'en:colas', 'cola drinks']);
  assert.deepEqual(pathOf(db, 'O1'), ['en:beverages', 'en:sodas', 'en:colas'], 'control: an Open Food Facts path is untouched');
});

test('1.1 without the map the same USDA label hangs off the food top, as before (the control the test above can fail against)', () => {
  const { db } = build(ROWS, false);
  assert.equal(parentTag(db, 'food', 'soda'), '@department');
  assert.deepEqual(pathOf(db, 'U1'), ['soda']);
});

test('1.1 a label mapped to the food top, and a label the file does not know, hang off the food top', () => {
  const { db } = build();
  assert.equal(parentTag(db, 'food', 'chocolate'), '@department');
  assert.equal(parentTag(db, 'food', 'unmapped label'), '@department');
});

test('1.1 a mapped node the catalogue does not have is never created: the nearest ancestor present, else the top', () => {
  const rows: Row[] = [...ROWS];
  const { db, result } = build(rows);
  assert.equal(db.prepare(`SELECT count(*) AS n FROM placement_node WHERE tag = 'en:ghost-drinks'`).get()!.n, 0, 'no invented node');
  assert.equal(parentTag(db, 'food', 'ghost'), '@department', 'the taxonomy does not know en:ghost-drinks either');
  // With the taxonomy knowing it under beverages, the nearest ancestor the catalogue HAS is used.
  const tax = taxonomyFromObject({ 'en:food': { parents: [] }, 'en:beverages': { parents: ['en:food'] }, 'en:ghost-drinks': { parents: ['en:beverages'] } }, 't2');
  const db2 = catalogue(rows);
  buildPlacement(db2, { taxonomy: tax, foodLabelMap: MAP, log: () => {} });
  assert.equal(parentTag(db2, 'food', 'ghost'), 'en:beverages');
  assert.equal(result.foodLabelMap?.absentNodes, 1, 'counted, not hidden');
});

test('1.1 the map reads only the food department: the same words in beauty hang where the ordinary rule puts them', () => {
  const { db } = build();
  assert.equal(parentTag(db, 'beauty', 'soda'), '@department');
});

test('1.1 a mapped label beats the tag typed before it, and never forms a cycle', () => {
  const rows: Row[] = [...ROWS, { code: 'U7', source: 'usda', path: ['crisps', 'soda'] }, { code: 'U8', source: 'usda', path: ['crisps', 'soda'] }];
  const { db } = build(rows);
  assert.equal(parentTag(db, 'food', 'soda'), 'en:sodas', 'crisps came first in two items, but the file says sodas');
  assert.equal(parentTag(db, 'food', 'crisps'), 'en:snacks');
  const c = countPaths(db);
  assert.equal(c.brokenChains, 0);
  assert.equal(c.withTwoOrMorePaths, 0);
});

test('1.1 the build reports what it read: the file\'s hash, the labels linked per method, those sent to the top, those absent', () => {
  const { result } = build();
  const r = result.foodLabelMap;
  assert.ok(r, 'the result names the map');
  assert.equal(r.sha256, MAP.sha256);
  assert.equal(r.version, 1);
  assert.equal(r.linked, 2, 'soda and cola drinks (crisps is in the file but no item carries it; ghost fell to the top)');
  assert.deepEqual(r.byMethod, { barcode: 2 });
  assert.equal(r.toTop, 2, 'chocolate (mapped to the top) and ghost (its node is absent)');
  assert.equal(r.absentNodes, 1);
  assert.equal(r.labelsNotInFile, 1, 'unmapped label');
  assert.equal(build(ROWS, false).result.foodLabelMap, null);
});

test('1.7 a layer built before the map keeps its parents (a node never changes); the later build neither throws nor moves an item', () => {
  const db = catalogue(ROWS);
  buildPlacement(db, { taxonomy: TAX, log: () => {} });
  const before = placementHash(db);
  const r = buildPlacement(db, { taxonomy: TAX, foodLabelMap: MAP, log: () => {} });
  assert.equal(parentTag(db, 'food', 'soda'), '@department', 'decided once, never re-parented');
  assert.equal(placementHash(db), before);
  assert.equal(r.nodesCreated, 0);
  assert.equal(r.foodLabelMap?.linked, 0, 'no label was linked: all of them already had a parent');
});

test('1.7 the same build twice gives the same tree and the same placements', () => {
  const a = build();
  const b = build();
  assert.equal(placementHash(a.db), placementHash(b.db));
  const again = buildPlacement(a.db, { taxonomy: TAX, foodLabelMap: MAP, log: () => {} });
  assert.equal(again.placed, 0);
  assert.equal(again.nodesCreated, 0);
});

test('1.1 every item still has exactly one path, and placements keep their level and confidence', () => {
  const { db } = build();
  const c = countPaths(db);
  assert.equal(c.withExactlyOnePath, c.products);
  assert.equal(c.placedWithoutLevelOrConfidence, 0);
  const row = db.prepare(`SELECT ip.level, n.depth FROM item_placement ip JOIN placement_node n ON n.node_id = ip.leaf_id WHERE ip.code = 'U1'`).get() as { level: number; depth: number };
  assert.equal(row.level, 3, 'food > beverages > sodas > soda: depth 3');
  assert.equal(row.level, row.depth);
});

test('1.1 the layer installs on its own: ensurePlacementSchema is still idempotent beside the map', () => {
  const db = catalogue(ROWS);
  ensurePlacementSchema(db);
  ensurePlacementSchema(db);
  assert.equal(countPaths(db).withNoPath, 0);
});
