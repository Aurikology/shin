/**
 * Price-category plan, Stage 3: requirement 2.2's method, "name-meaning match
 * against Open Food Facts' labelled products" (research/price-category-methods-
 * 2026-10-01/methods-categories-and-placement.md, 2.2 Method A: frozen multilingual
 * sentence embeddings, nearest neighbours over the labelled catalogue).
 *
 * The real model (multilingual-e5-small) is never loaded here: a deterministic
 * word-hashing embedder stands in, so these tests need no model file and no
 * network. Written before name-meaning.ts existed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Embedder } from '../src/embed.ts';
import {
  embedNames,
  knnTopK,
  meaningNeighbours,
  nameText,
  openNameIndex,
} from '../src/name-meaning.ts';
import { labelledLeaves, neighbourRoute, runCascade } from '../src/placement-cascade.ts';
import { ensureFeedbackSchema, recordConfirmation } from '../src/placement-feedback.ts';
import { nodeIdOf, placedFixture, placementOf, type FixtureRow } from './helpers/placement-fixture.ts';

const quiet = () => {};
const DIM = 384;

/** Bag of words hashed into DIM buckets, L2-normalised. Same words, same vector; no shared words, orthogonal-ish. */
function hashVec(text: string): Float32Array {
  const v = new Float32Array(DIM);
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    let h = 2166136261;
    for (const ch of w) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    v[h % DIM] += 1;
  }
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < DIM; i++) v[i] /= n;
  return v;
}

function fakeEmbedder(id = 'test:hash', mutate?: (v: Float32Array, text: string) => Float32Array): Embedder & { calls: number } {
  const e = {
    id,
    dim: DIM,
    calls: 0,
    async embedPassages(texts: string[]) { return texts.map((t) => hashVec(t)); },
    async embedQuery(text: string) { return hashVec(text); },
    async embedQueries(texts: string[]) {
      e.calls += texts.length;
      return texts.map((t) => (mutate ? mutate(hashVec(t), t) : hashVec(t)));
    },
  };
  return e;
}

const ROWS: FixtureRow[] = [
  { code: 'C1', source: 'openfoodfacts', path: ['en:dairies', 'en:cheeses', 'en:cheddars'], name: 'Old cheddar cheese' },
  { code: 'C2', source: 'openfoodfacts', path: ['en:dairies', 'en:cheeses', 'en:cheddars'], name: 'Mild cheddar cheese', nameFr: 'Fromage cheddar doux' },
  { code: 'C3', source: 'openfoodfacts', path: ['en:dairies', 'en:cheeses', 'en:cheddars'], name: 'Sharp cheddar cheese' },
  { code: 'C4', source: 'openfoodfacts', path: ['en:dairies', 'en:cheeses'], name: 'Swiss cheese slices' },
  { code: 'Y1', source: 'openfoodfacts', path: ['en:dairies', 'en:yogurts'], name: 'Vanilla yogurt' },
  { code: 'Y2', source: 'openfoodfacts', path: ['en:dairies', 'en:yogurts'], name: 'Strawberry yogurt' },
  { code: 'S1', source: 'openfoodfacts', path: ['en:snacks', 'en:chips'], name: 'Salted potato chips' },
  { code: 'U1', source: 'openfoodfacts', path: [], name: 'cheddar cheese bar', brands: 'Acme' },
  { code: 'U2', source: 'openfoodfacts', path: [], name: 'emmental tranches' },
  { code: 'U3', source: 'openfoodfacts', path: [], name: '' },
  { code: 'B1', source: 'openbeautyfacts', path: ['en:shampoos'], name: 'cheddar shampoo' },
];

/* ------------------------------------------------------------- the text */

test('2.2 the text embedded is the item\'s brand and names, never its category (a label must not vote for itself)', () => {
  const t = nameText({ name: 'Mild cheddar', name_en: 'Mild cheddar', name_fr: 'Cheddar doux', brands: 'Acme', generic_name: 'cheese', leaf_category: 'en:cheddars' } as never);
  assert.ok(t);
  assert.match(t, /Acme/);
  assert.match(t, /Mild cheddar/);
  assert.match(t, /Cheddar doux/);
  assert.doesNotMatch(t, /en:|cheddars/);
  assert.equal(nameText({ name: '  ', name_en: null, name_fr: null, brands: null, generic_name: null }), null, 'nothing to read: no text, so no vector');
});

/* ------------------------------------------------------------ neighbours */

function naiveTopK(L: Float32Array, nL: number, Q: Float32Array, nQ: number, dim: number, k: number): number[][] {
  const out: number[][] = [];
  for (let q = 0; q < nQ; q++) {
    const s: [number, number][] = [];
    for (let j = 0; j < nL; j++) {
      let d = 0;
      for (let i = 0; i < dim; i++) d += Q[q * dim + i]! * L[j * dim + i]!;
      s.push([d, j]);
    }
    s.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    out.push(s.slice(0, k).map((x) => x[1]));
  }
  return out;
}

test('2.2 the nearest-neighbour search returns the same neighbours as a plain loop, in one thread and across workers', async () => {
  const dim = 16;
  let seed = 7;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32) - 0.5;
  const nL = 300;
  const nQ = 41;
  const L = Float32Array.from({ length: nL * dim }, rnd);
  const Q = Float32Array.from({ length: nQ * dim }, rnd);
  const want = naiveTopK(L, nL, Q, nQ, dim, 5);
  for (const workers of [0, 2]) {
    const got = await knnTopK(L, nL, Q, nQ, dim, 5, { workers });
    for (let q = 0; q < nQ; q++) assert.deepEqual([...got.idx.slice(q * 5, q * 5 + 5)], want[q], `query ${q}, workers ${workers}`);
  }
});

test('2.2 a tie in similarity keeps the earlier labelled example first, in one thread and across workers', async () => {
  const dim = 4;
  const L = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
  const Q = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0]);
  for (const workers of [0, 2]) {
    const r = await knnTopK(L, 4, Q, 2, dim, 3, { workers });
    assert.deepEqual([...r.idx.slice(0, 3)], [0, 2, 3], `workers ${workers}`);
    assert.deepEqual([...r.idx.slice(3, 6)], [1, 0, 2], `workers ${workers}`);
  }
});

/* -------------------------------------------------- embed, then match */

test('2.2 an unplaced item is placed by the meaning of its name, through the cascade, on route "meaning"', async () => {
  const db = placedFixture(ROWS);
  const index = openNameIndex(':memory:');
  const e = fakeEmbedder();
  const r = await embedNames(index, db, e, { department: 'food', log: quiet });
  assert.equal(r.noText, 1, 'U3 has no name');
  const m = await meaningNeighbours(index, db, { department: 'food', k: 5, workers: 0 });
  const route = neighbourRoute('meaning', m.neighbours, m.labelOf, { k: 5, minVotes: 2 });
  await runCascade(db, { routes: [route], log: quiet });
  const u1 = placementOf(db, 'U1');
  assert.equal(u1.placedBy, 'meaning');
  assert.ok(['en:cheddars', 'en:cheeses'].includes(u1.tag), u1.tag);
  assert.ok(u1.confidence !== null && u1.confidence > 0 && u1.confidence <= 1);
  assert.equal(placementOf(db, 'U3').placedBy, 'top-level', 'no name, no meaning: the top level');
  assert.ok(!(m.neighbours.get('U1') ?? []).some((k) => k.includes('B1')), 'a beauty item is never a food item\'s neighbour');
});

test('2.2 re-embedding keeps a vector whose text and model are unchanged, and redoes one whose text changed', async () => {
  const db = placedFixture(ROWS);
  const index = openNameIndex(':memory:');
  const e = fakeEmbedder();
  await embedNames(index, db, e, { department: 'food', log: quiet });
  const first = e.calls;
  const again = await embedNames(index, db, e, { department: 'food', log: quiet });
  assert.equal(e.calls, first, 'nothing changed, nothing embedded');
  assert.equal(again.embedded, 0);
  db.prepare(`UPDATE product SET name_en = 'Emmental slices', name = 'Emmental slices' WHERE code = 'U2'`).run();
  const third = await embedNames(index, db, e, { department: 'food', log: quiet });
  assert.equal(third.embedded, 1);
});

/* ------------------------------------------------------ fails loudly */

test('2.2 matching refuses items that have a name but no vector (embed first), naming the count', async () => {
  const db = placedFixture(ROWS);
  const index = openNameIndex(':memory:');
  await assert.rejects(meaningNeighbours(index, db, { department: 'food', k: 5, workers: 0 }), /no vector.*embed/i);
});

test('2.2 vectors from two models in one index are refused (they return confident nonsense)', async () => {
  const db = placedFixture(ROWS);
  const index = openNameIndex(':memory:');
  await embedNames(index, db, fakeEmbedder('model-a'), { department: 'food', log: quiet });
  // A run interrupted half way through a model change leaves both in the file.
  index.prepare(`UPDATE name_vector SET model = 'model-b' WHERE key = 'p:U2'`).run();
  await assert.rejects(meaningNeighbours(index, db, { department: 'food', k: 5, workers: 0 }), /two models|model/);
});

test('2.2 a vector that is not finite, or not the expected width, stops the embed', async () => {
  const db = placedFixture(ROWS);
  const nan = fakeEmbedder('x', (v) => { v[0] = Number.NaN; return v; });
  await assert.rejects(embedNames(openNameIndex(':memory:'), db, nan, { department: 'food', log: quiet }), /finite/);
  const short = fakeEmbedder('y', (v) => v.slice(0, 10));
  await assert.rejects(embedNames(openNameIndex(':memory:'), db, short, { department: 'food', log: quiet }), /dim|width/);
});

/* ------------------------------------------- 2.4 confirmations feed it */

test('2.4 a shopper confirmation with text becomes a labelled example the meaning match uses', async () => {
  const db = placedFixture(ROWS);
  ensureFeedbackSchema(db);
  // A shopper typed "emmental tranches" and picked C4 (Swiss cheese slices, placed at en:cheeses).
  recordConfirmation(db, { origin: 'test', pickId: 1, code: 'C4', text: 'emmental tranches', pickedAt: '2026-10-09T00:00:00Z' });
  recordConfirmation(db, { origin: 'test', pickId: 2, code: 'C4', text: 'tranches emmental', pickedAt: '2026-10-09T00:00:00Z' });
  const index = openNameIndex(':memory:');
  await embedNames(index, db, fakeEmbedder(), { department: 'food', log: quiet });
  const m = await meaningNeighbours(index, db, { department: 'food', k: 2, workers: 0 });
  const near = m.neighbours.get('U2') ?? [];
  assert.ok(near.some((k) => k.startsWith('c:')), JSON.stringify(near));
  const label = m.labelOf(near.find((k) => k.startsWith('c:'))!);
  assert.equal(label, nodeIdOf(db, 'food', 'en:cheeses'));
});

test('2.2 only items placed from their own stored path (and confirmations) are labelled examples, even after a cascade has placed others', async () => {
  const db = placedFixture(ROWS);
  const index = openNameIndex(':memory:');
  await embedNames(index, db, fakeEmbedder(), { department: 'food', log: quiet });
  const first = await meaningNeighbours(index, db, { department: 'food', k: 5, workers: 0 });
  await runCascade(db, { routes: [neighbourRoute('meaning', first.neighbours, first.labelOf, { k: 5, minVotes: 2 })], log: quiet });
  assert.equal(placementOf(db, 'U1').placedBy, 'meaning', 'precondition: U1 now sits at a category, placed by a guess');
  const m = await meaningNeighbours(index, db, { department: 'food', k: 10, workers: 0 });
  assert.ok(m.neighbours.has('U1'), 'a guessed item is still a target on the re-run, not a label');
  for (const list of m.neighbours.values()) {
    for (const key of list) assert.ok(key.startsWith('c:') || labelledLeaves(db).has(key.slice(2)), `${key} is not a labelled example`);
  }
});
