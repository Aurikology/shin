/**
 * Price-category plan 1.1: linking the USDA flat labels into the one Open Food Facts
 * food tree (catalogue/src/food-label-link.ts). Measured 2026-10-13: the two food
 * vocabularies were unlinked, and the text route scored 5 of 54 on the food answer key.
 *
 * Written before food-label-link.ts existed; every test here was red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { taxonomyFromObject } from '../src/category-taxonomy.ts';
import {
  assembleLinks,
  FOOD_LABEL_MAP_PATH,
  FoodLabelMapError,
  holdoutSide,
  linkByBarcode,
  linkByCommonAncestor,
  linkByMeaning,
  loadFoodLabelMap,
  MIN_BARCODES,
  MIN_SHARE,
  nearestNode,
  parseFoodLabelMap,
  scoreLinks,
  serializeFoodLabelMap,
  splitHoldout,
  type NodeVector,
  type OverlapPair,
} from '../src/food-label-link.ts';

const DEPTH: Record<string, number> = { 'en:food': 1, 'en:beverages': 2, 'en:sodas': 3, 'en:colas': 4, 'en:juices': 3 };
const depthOf = (t: string): number => DEPTH[t] ?? 0;

function pairs(label: string, n: number, chain: string[], prefix = label): OverlapPair[] {
  return Array.from({ length: n }, (_, i) => ({ code: `${prefix}-${i}`, label, chain }));
}

/* ------------------------------------------------------------- method 1 */

test('1.1 barcode overlap: the deepest node most of a label\'s barcodes carry, with the count and share recorded', () => {
  const ps = [...pairs('Soda Pop', 7, ['en:food', 'en:beverages', 'en:sodas', 'en:colas']), ...pairs('Soda Pop', 1, ['en:food', 'en:beverages', 'en:sodas']), ...pairs('Soda Pop', 1, ['en:food', 'en:beverages', 'en:juices'], 'sp2')];
  const m = linkByBarcode(ps, depthOf);
  const l = m.get('soda pop');
  assert.ok(l, 'the label is mapped');
  assert.equal(l.node, 'en:sodas', 'colas is carried by 7 of 9 (0.78), under the 0.8 share; sodas by 8 of 9');
  assert.equal(l.method, 'barcode');
  assert.equal(l.barcodes, 9);
  assert.ok(Math.abs((l.share ?? 0) - 8 / 9) < 1e-9);
});

test('1.1 barcode overlap: the minimum count and the share are enforced, and a label spanning two branches maps to their shared ancestor only', () => {
  assert.equal(MIN_BARCODES, 5);
  assert.equal(MIN_SHARE, 0.8, 'the parent rule\'s own containment threshold, not a second one');
  const few = pairs('Few', MIN_BARCODES - 1, ['en:food', 'en:beverages', 'en:sodas']);
  assert.equal(linkByBarcode(few, depthOf).size, 0, 'four barcodes are too few');
  const split = [...pairs('Mixed', 5, ['en:food', 'en:beverages', 'en:sodas']), ...pairs('Mixed', 5, ['en:food', 'en:beverages', 'en:juices'], 'm2')];
  assert.equal(linkByBarcode(split, depthOf).get('mixed')?.node, 'en:beverages', 'half colas half juices: only beverages holds 80%');
  const wide = [...pairs('Wide', 5, ['en:sodas']), ...pairs('Wide', 5, ['en:juices'], 'w2')];
  assert.equal(linkByBarcode(wide, depthOf).size, 0, 'no node holds 80%: the method abstains, it does not guess');
});

test('1.1 a barcode whose Open Food Facts item has no category cannot vote', () => {
  const ps = [...pairs('Blank', 10, []), ...pairs('Blank', 4, ['en:food', 'en:sodas'], 'b2')];
  assert.equal(linkByBarcode(ps, depthOf).size, 0, 'only 4 barcodes carry a chain');
});

/* ---------------------------------------------------------- the hold-out */

test('1.1 the hold-out split is stable, by barcode alone, and halves the overlap without leaking a barcode into both halves', () => {
  const ps = pairs('L', 400, ['en:food']);
  const { train, test: held } = splitHoldout(ps);
  assert.equal(train.length + held.length, 400);
  assert.ok(train.length > 150 && held.length > 150, `roughly half each (${train.length}/${held.length})`);
  const codes = new Set(train.map((p) => p.code));
  assert.ok(held.every((p) => !codes.has(p.code)), 'disjoint');
  assert.equal(holdoutSide('0012345678905'), holdoutSide('0012345678905'), 'the same barcode always lands on the same side');
  for (const p of ps) assert.equal(splitHoldout([p]).train.length === 1, holdoutSide(p.code) === 'train');
});

test('1.1 scoring on held-out barcodes: contained, exact, depth, per method; the food top is contained but scores depth 0', () => {
  const links = assembleLinks(
    ['a', 'b', 'c', 'd'],
    new Map([['a', { node: 'en:sodas', method: 'barcode' as const, barcodes: 9, share: 1 }]]),
    new Map([['b', { node: 'en:juices', method: 'meaning' as const, barcodes: 0, share: null, similarity: 0.9 }]]),
    new Map(),
  );
  const held: OverlapPair[] = [
    { code: '1', label: 'a', chain: ['en:food', 'en:beverages', 'en:sodas'] },
    { code: '2', label: 'a', chain: ['en:food', 'en:beverages', 'en:juices'] },
    { code: '3', label: 'b', chain: ['en:food', 'en:beverages', 'en:sodas'] },
    { code: '4', label: 'c', chain: ['en:food', 'en:beverages'] },
    { code: '5', label: 'd', chain: [] },
  ];
  const s = scoreLinks(links, held, depthOf);
  assert.deepEqual({ barcodes: s.barcode.barcodes, contained: s.barcode.contained, exact: s.barcode.exact, labels: s.barcode.labels }, { barcodes: 2, contained: 1, exact: 1, labels: 1 });
  assert.deepEqual({ barcodes: s.meaning.barcodes, contained: s.meaning.contained }, { barcodes: 1, contained: 0 }, 'juices does not contain a soda');
  assert.deepEqual({ barcodes: s.fallback.barcodes, contained: s.fallback.contained, depth: s.fallback.meanDepth }, { barcodes: 1, contained: 1, depth: 0 }, 'c: no evidence, the food top; d has no chain and is not judged');
});

/* ------------------------------------------------------------- method 2 */

function unit(...xs: number[]): Float32Array {
  const n = Math.hypot(...xs) || 1;
  return Float32Array.from(xs.map((x) => x / n));
}

test('1.1 meaning: the nearest node by name, abstaining below the threshold', () => {
  const nodes: NodeVector[] = [
    { tag: 'en:colas', vec: unit(1, 0, 0) },
    { tag: 'en:juices', vec: unit(0, 1, 0) },
  ];
  assert.deepEqual(nearestNode(unit(0.9, 0.1, 0), nodes)?.tag, 'en:colas');
  const labels = new Map([
    ['cola drink', unit(0.95, 0.05, 0.1)],
    ['mystery', unit(0.3, 0.3, 0.9)],
  ]);
  const m = linkByMeaning(labels, nodes, 0.8);
  assert.equal(m.get('cola drink')?.node, 'en:colas');
  assert.equal(m.get('cola drink')?.method, 'meaning');
  assert.ok((m.get('cola drink')?.similarity ?? 0) > 0.9);
  assert.equal(m.has('mystery'), false, 'below the threshold the route abstains');
});

test('1.1 meaning: climbing walks up the tree\'s one chain, and a climb to the top is an abstention, not a meaning match', () => {
  const nodes: NodeVector[] = [{ tag: 'en:colas', vec: unit(1, 0) }];
  const parent: Record<string, string | null> = { 'en:colas': 'en:sodas', 'en:sodas': null };
  const labels = new Map([['cola', unit(1, 0)]]);
  assert.equal(linkByMeaning(labels, nodes, 0.5, { climb: 1, parentOf: (t) => parent[t] ?? null }).get('cola')?.node, 'en:sodas');
  assert.equal(linkByMeaning(labels, nodes, 0.5, { climb: 2, parentOf: (t) => parent[t] ?? null }).size, 0);
});

/* ------------------------------------------------------------- method 3 */

test('1.1 fallback: the deepest node EVERY barcode carries, at least two of them; with no evidence the food top, never an invented node', () => {
  const ps = [
    { code: 'x1', label: 'Pair', chain: ['en:food', 'en:beverages', 'en:sodas', 'en:colas'] },
    { code: 'x2', label: 'Pair', chain: ['en:food', 'en:beverages', 'en:juices'] },
    { code: 'y1', label: 'Lone', chain: ['en:food', 'en:beverages'] },
  ];
  const f = linkByCommonAncestor(ps, depthOf);
  assert.equal(f.get('pair')?.node, 'en:beverages', 'both carry beverages and nothing deeper');
  assert.equal(f.get('pair')?.method, 'fallback');
  assert.equal(f.has('lone'), false, 'one barcode is not agreement');
  const all = assembleLinks(['Pair', 'Lone', 'Nothing'], new Map(), new Map(), f, new Map([['lone', 1]]));
  assert.equal(all.get('lone')?.node, null);
  assert.equal(all.get('lone')?.basis, 'no-evidence');
  assert.equal(all.get('lone')?.barcodes, 1);
  assert.equal(all.get('nothing')?.node, null);
  assert.equal(all.size, 3, 'every label has a link');
});

test('1.1 the methods run in order: a label takes the first that maps it', () => {
  const b = new Map([['l', { node: 'en:sodas', method: 'barcode' as const, barcodes: 6, share: 1 }]]);
  const mm = new Map([['l', { node: 'en:juices', method: 'meaning' as const, barcodes: 0, share: null, similarity: 0.9 }], ['m', { node: 'en:juices', method: 'meaning' as const, barcodes: 0, share: null, similarity: 0.9 }]]);
  const f = new Map([['m', { node: 'en:beverages', method: 'fallback' as const, barcodes: 2, share: 1 }]]);
  const all = assembleLinks(['l', 'm'], b, mm, f);
  assert.equal(all.get('l')?.method, 'barcode');
  assert.equal(all.get('m')?.method, 'meaning');
});

/* ------------------------------------------------------------- the file */

const GOOD = JSON.stringify({
  version: 1,
  parameters: {},
  labels: { 'sport drinks': { node: 'en:beverages', method: 'barcode', barcodes: 12, share: 0.9 }, chocolate: { node: null, method: 'fallback', barcodes: 0, share: null, basis: 'no-evidence' } },
});

test('1.1 the data file: parsed, hashed, and every fault named', () => {
  const m = parseFoodLabelMap(GOOD);
  assert.equal(m.labels.size, 2);
  assert.equal(m.sha256, createHash('sha256').update(GOOD).digest('hex'));
  const bad = (labels: unknown, version = 1) => JSON.stringify({ version, labels });
  assert.throws(() => parseFoodLabelMap('not json'), FoodLabelMapError);
  assert.throws(() => parseFoodLabelMap(bad({ a: { node: 'en:x', method: 'barcode', barcodes: 5, share: 1 } }, 2)), /version 2/);
  assert.throws(() => parseFoodLabelMap(bad({ a: { node: 'chocolate', method: 'barcode', barcodes: 5 } })), /neither an en: node nor null/);
  assert.throws(() => parseFoodLabelMap(bad({ a: { node: 'en:x', method: 'guess', barcodes: 5 } })), /no valid method/);
  assert.throws(() => parseFoodLabelMap(bad({ a: { node: null, method: 'barcode', barcodes: 5 } })), /food top/);
  assert.throws(() => parseFoodLabelMap(bad({ 'en:chocolate': { node: 'en:x', method: 'barcode', barcodes: 5 } })), /language prefix/);
  assert.throws(() => parseFoodLabelMap(bad({ Chocolate: { node: 'en:x', method: 'barcode', barcodes: 5 } })), /folded form/);
  assert.throws(() => parseFoodLabelMap(bad({})), /no labels/);
  assert.throws(() => loadFoodLabelMap('C:/does/not/exist/food-label-map.json'), /cannot read/, 'a missing file stops; it never reads as an empty map');
});

test('1.1 the mapped parent: the node when the catalogue has it, else its nearest present taxonomy ancestor, else the top; a label not in the file is undefined', () => {
  const tax = taxonomyFromObject({ 'en:food': { parents: [] }, 'en:beverages': { parents: ['en:food'] }, 'en:sodas': { parents: ['en:beverages'] }, 'en:colas': { parents: ['en:sodas'] } }, 't');
  const m = parseFoodLabelMap(JSON.stringify({ version: 1, labels: { cola: { node: 'en:colas', method: 'barcode', barcodes: 9, share: 1 }, top: { node: null, method: 'fallback', barcodes: 0, share: null } } }));
  assert.equal(m.parentFor('cola', (t) => t === 'en:colas', tax), 'en:colas');
  assert.equal(m.parentFor('Cola', (t) => ['en:beverages', 'en:food'].includes(t), tax), 'en:beverages', 'colas is absent: the nearest ancestor present (sodas is absent too)');
  assert.equal(m.parentFor('cola', () => false, tax), null, 'nothing present: the food top, no node invented');
  assert.equal(m.parentFor('cola', () => false, null), null);
  assert.equal(m.parentFor('top', () => true, tax), null);
  assert.equal(m.parentFor('unknown', () => true, tax), undefined);
});

test('1.1 serialize then parse gives the same links, and the same links give the same bytes', () => {
  const links = new Map([
    ['b', { node: 'en:sodas', method: 'barcode' as const, barcodes: 9, share: 0.8888888 }],
    ['a', { node: null, method: 'fallback' as const, barcodes: 0, share: null, basis: 'no-evidence' as const }],
  ]);
  const text = serializeFoodLabelMap(links, { minBarcodes: 5 });
  assert.equal(text, serializeFoodLabelMap(new Map([...links].reverse()), { minBarcodes: 5 }));
  const back = parseFoodLabelMap(text);
  assert.equal(back.labels.get('b')?.share, 0.889);
  assert.equal(back.labels.get('a')?.basis, 'no-evidence');
});

test('1.1 the shipped data file loads, records a method for every label, and maps only to en: nodes', () => {
  const m = loadFoodLabelMap(FOOD_LABEL_MAP_PATH);
  assert.ok(m.labels.size >= 300, `${m.labels.size} labels`);
  assert.equal(m.sha256, createHash('sha256').update(readFileSync(FOOD_LABEL_MAP_PATH)).digest('hex'));
  const methods = new Set([...m.labels.values()].map((l) => l.method));
  assert.ok(methods.has('barcode'), 'some labels set by barcode overlap');
  for (const [label, l] of m.labels) {
    if (l.node !== null) assert.match(l.node, /^en:/, label);
    if (l.method === 'barcode') {
      assert.ok(l.barcodes >= MIN_BARCODES, `${label}: ${l.barcodes} barcodes`);
      assert.ok((l.share ?? 0) >= MIN_SHARE, `${label}: share ${l.share}`);
    }
  }
});
