/**
 * Decision 2026-11-25. (1) The kill switch SHIN_EXCLUDED_SOURCES takes a named source out of every
 * catalogue read. (2) SHIN_ICECAT_NO_AI (default OFF) keeps Icecat rows out of the placement run's
 * embeddings, word-search neighbours and Claude chooser (Open Icecat licence clause 10). Both
 * settings of each are exercised on the same data.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Catalogue } from '../src/search.ts';
import { allSourcesOf, searchBatch, runCascade, sourcesOf, type ClaudeListChooser, type PlacementRoute } from '../src/placement-cascade.ts';
import { wanted } from '../src/name-meaning.ts';
import { icecatNoAiOn, setExcludedSourcesForTest, setIcecatNoAiForTest, aiBarredSources } from '../src/source-rights.ts';
import { fixtureCatalogue, nodeIdOf, placedFixture, placementOf } from './helpers/placement-fixture.ts';
import type { Embedder } from '../src/embed.ts';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length) restores.pop()!();
});
const killSwitch = (spec: string) => restores.push(setExcludedSourcesForTest(spec));
const icecatNoAi = (on: boolean) => restores.push(setIcecatNoAiForTest(on));

const NO_VEC: Embedder = {
  id: 'none',
  dim: 384,
  async embedPassages() {
    throw new Error('no vectors here');
  },
  async embedQuery() {
    throw new Error('no vectors here');
  },
};

const ROWS = [
  { code: '1000000000001', source: 'kroger-names', path: ['en:beverages', 'en:sodas'], name: 'Zorbix Fizz Cola', brands: 'Zorbix' },
  { code: '1000000000002', source: 'openfoodfacts', path: ['en:beverages', 'en:sodas'], name: 'Zorbix Fizz Cola Zero', brands: 'Zorbix' },
  { code: '1000000000003', source: 'icecat', path: ['en:phones'], name: 'Zorbix Phone Quark', brands: 'Zorbix' },
] as const;

test('the kill switch: a Kroger-only catalogue row is not found by barcode or word search', async () => {
  const db = fixtureCatalogue(ROWS);
  const cat = new Catalogue(db, NO_VEC, null);
  assert.equal(cat.byGtin('1000000000001')?.source, 'kroger-names', 'control: switch off, the row is there');
  assert.ok((await cat.search({ text: 'zorbix fizz cola', vectors: false, limit: 10, recordMiss: false })).candidates.some((c) => c.code === '1000000000001'));
  killSwitch('kroger');
  assert.equal(cat.byGtin('1000000000001'), null);
  const found = await cat.search({ text: 'zorbix fizz cola', vectors: false, limit: 10, recordMiss: false });
  assert.ok(!found.candidates.some((c) => c.code === '1000000000001'), 'the Kroger-only row is not a candidate');
  assert.ok(found.candidates.some((c) => c.code === '1000000000002'), 'a same-brand row of another source still is');
  assert.equal(cat.byGtin('1000000000002')?.source, 'openfoodfacts', 'another source is untouched');
});

test('SHIN_ICECAT_NO_AI: off by default, and the department source lists show what it changes', () => {
  assert.equal(icecatNoAiOn(), false);
  assert.deepEqual([...aiBarredSources()], []);
  assert.deepEqual(sourcesOf('electronics'), ['icecat']);
  icecatNoAi(true);
  assert.deepEqual([...aiBarredSources()], ['icecat']);
  assert.deepEqual(sourcesOf('electronics'), [], 'no source of electronics may feed learning paths');
  assert.deepEqual(allSourcesOf('electronics'), ['icecat'], 'the unfiltered list is still there');
  assert.ok(sourcesOf('food').includes('openfoodfacts'));
});

test('name embeddings: Icecat names are an embedding input with the switch off and are not with it on', () => {
  const db = fixtureCatalogue(ROWS);
  assert.deepEqual(wanted(db, 'electronics').items.map((w) => w.key), ['p:1000000000003'], 'control: switch off');
  icecatNoAi(true);
  assert.deepEqual(wanted(db, 'electronics').items, []);
  assert.deepEqual(wanted(db, 'food').items.map((w) => w.key).sort(), ['p:1000000000001', 'p:1000000000002'], 'food is untouched');
});

test('placement word search: an electronics query reads Icecat neighbours with the switch off, none with it on', async () => {
  const db = fixtureCatalogue(ROWS);
  const q = [{ code: '1000000000009', department: 'electronics', text: 'zorbix phone' }];
  assert.deepEqual((await searchBatch(db, q))[0]![1], ['1000000000003'], 'control: switch off');
  icecatNoAi(true);
  assert.deepEqual((await searchBatch(db, q))[0]![1], [], 'an empty source list must not widen the search to every source');
});

test('the Claude chooser is offered an Icecat item\'s name with the switch off and is not with it on', async () => {
  const rows = [...ROWS, { code: 'U-ice', source: 'icecat', path: [] as string[], name: 'Quark Handset Unplaced' }];
  const run = async () => {
    const db = placedFixture(rows);
    const seen: string[] = [];
    const chooser: ClaudeListChooser = {
      async choose(item) {
        seen.push(item.name ?? '');
        return null;
      },
    };
    const suggesting: PlacementRoute = {
      name: 'label',
      propose: () => null,
      suggest: (item) => (item.department === 'electronics' ? [nodeIdOf(db, 'electronics', 'en:phones')] : []),
    };
    const summary = await runCascade(db, { routes: [suggesting], claude: chooser, log: () => {} });
    assert.equal(placementOf(db, 'U-ice').placedBy, 'top-level');
    return { seen, summary };
  };
  const off = await run();
  assert.deepEqual(off.seen, ['Quark Handset Unplaced']);
  icecatNoAi(true);
  const on = await run();
  assert.deepEqual(on.seen, [], 'nothing about an Icecat item reaches the chooser');
  assert.equal(on.summary.claudeSlotNoCandidates.electronics ?? 0, 0);
});
