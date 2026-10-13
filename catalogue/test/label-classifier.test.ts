/**
 * Price-category plan 2.1, "Next": a classifier that names categories from their
 * LABELS alone. Each category node's label is embedded, the item's name is embedded,
 * the nearest node in the item's own department wins, and below a similarity
 * threshold the route abstains. It sits in the cascade after the name-meaning route
 * and before the Claude slot, and every placement it makes still goes through the
 * 2.3 climb (level and confidence recorded).
 *
 * Temp data only: ':memory:' catalogues and one temp folder for the vector index.
 * The embedder is a fake bag-of-words hash, so "the name shares a word with the label"
 * is the whole of what these tests mean by "near".
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Embedder } from '../src/embed.ts';
import { embedNames, openNameIndex } from '../src/name-meaning.ts';
import { CASCADE_ROUTES, PlacementTree, runCascade, type ClaudeListChooser } from '../src/placement-cascade.ts';
import {
  embedLabels,
  humanizeTag,
  labelCandidates,
  labelNamesFromObject,
  labelRoute,
  LABEL_ROUTE_NAME,
} from '../src/label-classifier.ts';
import { nodeIdOf, placedFixture, placementOf, type FixtureRow } from './helpers/placement-fixture.ts';

const quiet = () => {};
const DIM = 384;
const dir = mkdtempSync(join(tmpdir(), 'shin-label-classifier-'));
after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

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

function fakeEmbedder(id = 'test:hash'): Embedder & { texts: string[] } {
  const e = {
    id,
    dim: DIM,
    texts: [] as string[],
    async embedPassages(texts: string[]) { return texts.map(hashVec); },
    async embedQuery(text: string) { return hashVec(text); },
    async embedQueries(texts: string[]) { e.texts.push(...texts); return texts.map(hashVec); },
  };
  return e;
}

/*
 * Food: dairies > cheeses > cheddars, dairies > yogurts, snacks > chips. The labelled
 * items give the tree its nodes; the U* items are the ones the label route must place
 * (their names are far from every labelled example, so the other routes are not run).
 */
const ROWS: FixtureRow[] = [
  { code: 'C1', source: 'openfoodfacts', path: ['en:dairies', 'en:cheeses', 'en:cheddars'], name: 'Old orange block' },
  { code: 'C2', source: 'openfoodfacts', path: ['en:dairies', 'en:cheeses', 'en:cheddars'], name: 'Mild orange block' },
  { code: 'C3', source: 'openfoodfacts', path: ['en:dairies', 'en:cheeses', 'en:cheddars'], name: 'Sharp orange slices' },
  { code: 'C4', source: 'openfoodfacts', path: ['en:dairies', 'en:cheeses'], name: 'Pale swiss slices' },
  { code: 'Y1', source: 'openfoodfacts', path: ['en:dairies', 'en:yogurts'], name: 'Vanilla tub' },
  { code: 'S1', source: 'openfoodfacts', path: ['en:snacks', 'en:chips'], name: 'Salted crunchy bag' },
  { code: 'U-chips', source: 'openfoodfacts', path: [], name: 'Kettle potato chips' },
  { code: 'U-yog', source: 'openfoodfacts', path: [], name: 'Greek yogurts 750 g' },
  { code: 'U-none', source: 'openfoodfacts', path: [], name: 'zzqx unknown words' },
  { code: 'U-amb', source: 'openfoodfacts', path: [], name: 'cheddars yogurts' },
  { code: 'B1', source: 'openbeautyfacts', path: ['en:shampoos'], name: 'Herbal bottle' },
  { code: 'UB', source: 'openbeautyfacts', path: [], name: 'chips yogurts cheddars' },
];

async function prepared() {
  const db = placedFixture(ROWS);
  const index = openNameIndex(join(dir, `idx-${Math.random().toString(36).slice(2)}.db`));
  const embedder = fakeEmbedder();
  const names = new Map<string, string>();
  for (const department of ['food', 'beauty']) {
    await embedNames(index, db, embedder, { department, log: quiet });
    await embedLabels(index, PlacementTree.load(db), embedder, { department, names, log: quiet });
  }
  return { db, index, embedder, names };
}

test('2.1 the route order puts the label classifier after name meaning and before Claude', () => {
  assert.deepEqual([...CASCADE_ROUTES], ['barcode', 'text', 'meaning', 'label', 'claude', 'top-level']);
  assert.equal(LABEL_ROUTE_NAME, 'label');
});

test('2.1 a tag is turned into words a model can read, with the language prefix dropped', () => {
  assert.equal(humanizeTag('en:dairy-products'), 'dairy products');
  assert.equal(humanizeTag('fr:fromages-de-chevre'), 'fromages de chevre');
  assert.equal(humanizeTag('plain'), 'plain');
});

test('2.1 the label of a taxonomy entry is its English name, then its French one', () => {
  const names = labelNamesFromObject({
    'en:chips': { name: { en: 'Potato chips', fr: 'Croustilles' }, parents: [] },
    'fr:tartes': { name: { fr: 'Tartes' }, parents: [] },
    'en:empty': { name: {}, parents: [] },
  });
  assert.equal(names.get('en:chips'), 'Potato chips');
  assert.equal(names.get('fr:tartes'), 'Tartes');
  assert.equal(names.has('en:empty'), false);
});

test('2.1 an item far from every labelled example is named from the category labels alone, on route "label", with a level and a confidence', async () => {
  const { db, index, names } = await prepared();
  const table = (await labelCandidates(index, db, PlacementTree.load(db), { department: 'food', names, k: 5, log: quiet })).candidates;
  const route = labelRoute(table, { threshold: 0.3 });
  const summary = await runCascade(db, { routes: [route], log: quiet });
  const chips = placementOf(db, 'U-chips');
  assert.equal(chips.placedBy, 'label');
  assert.equal(chips.tag, 'en:chips');
  assert.ok(chips.level !== null && chips.level >= 1, 'a level is recorded');
  assert.ok(chips.confidence !== null && chips.confidence > 0 && chips.confidence <= 1, 'a confidence is recorded');
  assert.equal(placementOf(db, 'U-yog').tag, 'en:yogurts');
  assert.ok((summary.byRoute.food!.label ?? 0) >= 2, 'the summary counts the items the label route placed');
});

test('2.1 below the similarity threshold the route abstains and the item falls to the top level', async () => {
  const { db, index, names } = await prepared();
  const table = (await labelCandidates(index, db, PlacementTree.load(db), { department: 'food', names, k: 5, log: quiet })).candidates;
  await runCascade(db, { routes: [labelRoute(table, { threshold: 0.3 })], log: quiet });
  const none = placementOf(db, 'U-none');
  assert.equal(none.placedBy, 'top-level', 'no label shares a word with "zzqx unknown words"');
  assert.equal(none.level, 0);

  const prep2 = await prepared();
  const strict = (await labelCandidates(prep2.index, prep2.db, PlacementTree.load(prep2.db), { department: 'food', names: prep2.names, k: 5, log: quiet })).candidates;
  await runCascade(prep2.db, { routes: [labelRoute(strict, { threshold: 0.99 })], log: quiet });
  assert.equal(placementOf(prep2.db, 'U-chips').placedBy, 'top-level', 'a 0.99 bar is not cleared by a partial word match');
});

test('2.3 an item torn between two siblings climbs to their shared parent instead of guessing one', async () => {
  const { db, index, names } = await prepared();
  const table = (await labelCandidates(index, db, PlacementTree.load(db), { department: 'food', names, k: 5, log: quiet })).candidates;
  await runCascade(db, { routes: [labelRoute(table, { threshold: 0.3 })], log: quiet });
  const amb = placementOf(db, 'U-amb');
  // "cheddars yogurts" is equally near en:cheddars and en:yogurts; their one shared ancestor is en:dairies.
  assert.equal(amb.placedBy, 'label');
  assert.equal(amb.tag, 'en:dairies');
  assert.equal(amb.level, 1);
});

test('2.1 the nearest node is chosen only inside the item\'s own department', async () => {
  const { db, index, names } = await prepared();
  const ids = { food: PlacementTree.load(db) };
  const tableBeauty = (await labelCandidates(index, db, ids.food, { department: 'beauty', names, k: 5, log: quiet })).candidates;
  const cands = tableBeauty.get('UB');
  assert.ok(cands && cands.length > 0);
  const beautyNodes = new Set([nodeIdOf(db, 'beauty', 'en:shampoos')]);
  for (const c of cands!) assert.ok(beautyNodes.has(c.nodeId), 'only beauty nodes are candidates for a beauty item');
  assert.equal(tableBeauty.has('U-chips'), false, 'a food item is not a beauty target');
});

test('2.1 the labels are embedded once: a second embed finds them current, a changed text is re-embedded', async () => {
  const { db, index, embedder, names } = await prepared();
  const tree = PlacementTree.load(db);
  const again = await embedLabels(index, tree, embedder, { department: 'food', names, log: quiet });
  assert.equal(again.embedded, 0);
  assert.ok(again.kept > 0);
  names.set('en:chips', 'Crisps');
  const changed = await embedLabels(index, tree, embedder, { department: 'food', names, log: quiet });
  assert.equal(changed.embedded, 1, 'only the label whose text changed');
});

test('2.1 fails loudly: a label with no vector stops the match, naming the first of them', async () => {
  const db = placedFixture(ROWS);
  const index = openNameIndex(join(dir, `empty-${Math.random().toString(36).slice(2)}.db`));
  await embedNames(index, db, fakeEmbedder(), { department: 'food', log: quiet });
  await assert.rejects(
    labelCandidates(index, db, PlacementTree.load(db), { department: 'food', names: new Map(), k: 5, log: quiet }),
    /no vector.*en:chips|en:chips.*no vector|embed.*label/i,
  );
});

test('2.1 an item whose name has no text has no vector and the route abstains on it', async () => {
  const rows: FixtureRow[] = [...ROWS, { code: 'U-blank', source: 'openfoodfacts', path: [], name: '  ' }];
  const db = placedFixture(rows);
  const index = openNameIndex(join(dir, `blank-${Math.random().toString(36).slice(2)}.db`));
  const embedder = fakeEmbedder();
  await embedNames(index, db, embedder, { department: 'food', log: quiet });
  await embedLabels(index, PlacementTree.load(db), embedder, { department: 'food', names: new Map(), log: quiet });
  const r = await labelCandidates(index, db, PlacementTree.load(db), { department: 'food', names: new Map(), k: 5, log: quiet });
  assert.equal(r.candidates.has('U-blank'), false);
  assert.equal(r.noText >= 1, true);
});

test('2.1 the Claude slot is offered the label route\'s top candidates, not the whole department', async () => {
  const { db, index, names } = await prepared();
  const table = (await labelCandidates(index, db, PlacementTree.load(db), { department: 'food', names, k: 3, log: quiet })).candidates;
  const offered: Record<string, number[]> = {};
  const chooser: ClaudeListChooser = {
    async choose(item, list) {
      offered[item.code] = list.map((c) => c.nodeId);
      return null;
    },
  };
  // threshold 0.99: the label route abstains on everything, so every item reaches the Claude slot
  await runCascade(db, { routes: [labelRoute(table, { threshold: 0.99 })], claude: chooser, log: quiet });
  const chipsList = offered['U-chips'];
  assert.ok(chipsList, 'U-chips reached the Claude slot with candidates');
  assert.ok(chipsList!.length <= 3, 'top-k only');
  assert.ok(chipsList!.includes(nodeIdOf(db, 'food', 'en:chips')), 'the nearest label is on the list');
  assert.equal(offered['U-none'], undefined, 'an item no route can suggest anything for is not sent to Claude');
});
