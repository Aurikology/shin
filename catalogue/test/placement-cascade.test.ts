/**
 * Price-category plan, Stage 3 "Placing items": requirements 2.1 and 2.3
 * (docs/price-category-requirements-2026-10-01.md lines 45 and 47).
 *
 *   2.1  every item ends placed at some level, by a cascade: barcode (an exact
 *        catalogue match that carries a category), then text match, then name
 *        meaning, then Claude choosing from a fixed list (a slot only: never called
 *        here, there is no key and no network), then the department's top level.
 *        The route that placed it is recorded. Pass: 100% placed, no more than 5%
 *        at the top level only.
 *   2.3  every placement carries a level and a confidence; a placer climbs from its
 *        best leaf until the confidence clears a bar. The bar is a named setting and
 *        is NOT calibrated (no hand labels exist yet).
 *
 * Moving an item out of "unplaced" goes through placement.ts's own append-only path
 * (placement_log), never a raw update. Written before placement-cascade.ts existed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  countPaths,
  placeOnNode,
  placementCallCount,
  ensurePlacementSchema,
  SOURCE_LABEL_CONFIDENCE,
} from '../src/placement.ts';
import {
  assertNotLiveCatalogue,
  barcodeRoute,
  CASCADE_ROUTES,
  climb,
  CONFIDENCE_BAR_CALIBRATED,
  labelledLeaves,
  neighbourRoute,
  PlacementTree,
  PLACEMENT_CONFIDENCE_BAR,
  runCascade,
  textNeighbours,
  TOP_LEVEL_SHARE_BAR,
  type ClaudeListChooser,
  type PlacementRoute,
} from '../src/placement-cascade.ts';
import { fixtureCatalogue, logLength, nodeIdOf, placedFixture, placementOf, type FixtureRow } from './helpers/placement-fixture.ts';

const quiet = () => {};

/*
 * The fixture. Food has a small tree: en:dairies > en:cheeses > en:cheddars, and
 * en:dairies > en:yogurts; en:snacks > en:chips. U* items carry no category.
 */
const ROWS: FixtureRow[] = [
  { code: '0000000000017', source: 'openfoodfacts', path: ['en:dairies', 'en:cheeses', 'en:cheddars'], name: 'Old cheddar cheese' },
  { code: 'C2', source: 'openfoodfacts', path: ['en:dairies', 'en:cheeses', 'en:cheddars'], name: 'Mild cheddar cheese block' },
  { code: 'C3', source: 'openfoodfacts', path: ['en:dairies', 'en:cheeses', 'en:cheddars'], name: 'Sharp cheddar cheese slices' },
  { code: 'C4', source: 'openfoodfacts', path: ['en:dairies', 'en:cheeses'], name: 'Swiss cheese slices' },
  { code: 'Y1', source: 'openfoodfacts', path: ['en:dairies', 'en:yogurts'], name: 'Vanilla yogurt' },
  { code: 'Y2', source: 'openfoodfacts', path: ['en:dairies', 'en:yogurts'], name: 'Strawberry yogurt' },
  { code: 'S1', source: 'openfoodfacts', path: ['en:snacks', 'en:chips'], name: 'Salted potato chips' },
  // The 12-digit twin of 0000000000017's GTIN-13 form: an exact catalogue match by barcode.
  { code: '000000000017', source: 'openfoodfacts', path: [], name: 'cheddar' },
  { code: 'U-text', source: 'openfoodfacts', path: [], name: 'cheddar cheese' },
  { code: 'U-none', source: 'openfoodfacts', path: [], name: 'zzqx unknown words' },
  { code: 'B1', source: 'openbeautyfacts', path: ['en:shampoos'], name: 'Herbal shampoo' },
  { code: 'UB', source: 'openbeautyfacts', path: [], name: 'qqq' },
];

/** A neighbour route over a fixed neighbour table (code -> labelled neighbour codes, best first). */
function tableRoute(db: ReturnType<typeof placedFixture>, name: 'text' | 'meaning', table: Record<string, string[]>): PlacementRoute {
  const leaves = labelledLeaves(db);
  return neighbourRoute(name, new Map(Object.entries(table)), (key) => leaves.get(key) ?? null, { k: 10, minVotes: 2 });
}

/* ------------------------------------------------------------ 2.3 schema */

test('2.3 every placement the Stage 2 build makes carries a level (its depth) and a confidence', () => {
  const db = placedFixture(ROWS);
  const c3 = placementOf(db, 'C3');
  assert.equal(c3.placedBy, 'path');
  assert.equal(c3.level, 3, 'en:dairies > en:cheeses > en:cheddars sits three below the department');
  assert.equal(c3.confidence, SOURCE_LABEL_CONFIDENCE);
  const u = placementOf(db, 'U-text');
  assert.equal(u.kind, 'unplaced');
  assert.equal(u.level, null, 'an unplaced item is not a placement and carries no level');
  assert.equal(u.confidence, null);
  assert.equal(countPaths(db).placedWithoutLevelOrConfidence, 0);
});

test('2.3 the database refuses a placement with no confidence, a confidence outside 0..1, or a level that is not its node\'s depth', () => {
  const db = placedFixture(ROWS);
  const cheddars = nodeIdOf(db, 'food', 'en:cheddars');
  const upd = db.prepare('UPDATE item_placement SET leaf_id = ?, placed_by = ?, level = ?, confidence = ? WHERE code = ?');
  assert.throws(() => upd.run(cheddars, 'test', 3, null, 'U-text'), /level|confidence/);
  assert.throws(() => upd.run(cheddars, 'test', 3, 1.5, 'U-text'), /confidence/);
  assert.throws(() => upd.run(cheddars, 'test', 3, -0.1, 'U-text'), /confidence/);
  assert.throws(() => upd.run(cheddars, 'test', 2, 0.9, 'U-text'), /level/);
  assert.throws(() => upd.run(cheddars, 'unplaced', null, null, 'U-text'), /unplaced/, 'placed_by "unplaced" on a category node');
  const unplacedFood = nodeIdOf(db, 'food', '@unplaced');
  assert.throws(() => upd.run(unplacedFood, 'test', 1, 0.5, 'C2'), /unplaced/, 'a placer naming itself on the unplaced node');
  upd.run(cheddars, 'test', 3, 0.9, 'U-text');
  assert.equal(placementOf(db, 'U-text').confidence, 0.9);
});

test('2.3 placeOnNode writes the level from the node and appends to placement_log (no raw update path)', () => {
  const db = placedFixture(ROWS);
  const before = logLength(db);
  const calls = placementCallCount();
  placeOnNode(db, 'U-text', nodeIdOf(db, 'food', 'en:cheeses'), 'test', 0.7);
  const p = placementOf(db, 'U-text');
  assert.equal(p.tag, 'en:cheeses');
  assert.equal(p.level, 2);
  assert.equal(p.confidence, 0.7);
  assert.equal(logLength(db), before + 1, 'the move is appended to placement_log');
  const last = db.prepare('SELECT code, placed_by, level, confidence FROM placement_log ORDER BY seq DESC LIMIT 1').get() as Record<string, unknown>;
  assert.deepEqual({ ...last }, { code: 'U-text', placed_by: 'test', level: 2, confidence: 0.7 }, 'the log row carries the level and confidence too');
  assert.equal(placementCallCount(), calls + 1, 'counted as a placement call');
  assert.throws(() => placeOnNode(db, 'U-none', nodeIdOf(db, 'food', 'en:cheeses'), 'test', Number.NaN), /confidence/);
  assert.throws(() => placeOnNode(db, 'U-none', nodeIdOf(db, 'food', 'en:cheeses'), 'path', 1), /reserved/);
  assert.throws(() => placeOnNode(db, 'U-none', nodeIdOf(db, 'food', '@unplaced'), 'test', 1), /unplaced/);
});

test('2.3 a department node is a valid place to put an item (the top level), at level 0', () => {
  const db = placedFixture(ROWS);
  placeOnNode(db, 'U-none', nodeIdOf(db, 'food', '@department'), 'top-level', 1);
  const p = placementOf(db, 'U-none');
  assert.equal(p.kind, 'department');
  assert.equal(p.level, 0);
  assert.equal(countPaths(db).placedAtTopOnly, 1);
});

/* ------------------------------------------------------------ 2.3 climb */

test('2.3 the bar is a named setting and is reported as uncalibrated', () => {
  assert.equal(typeof PLACEMENT_CONFIDENCE_BAR, 'number');
  assert.ok(PLACEMENT_CONFIDENCE_BAR > 0 && PLACEMENT_CONFIDENCE_BAR < 1);
  assert.equal(CONFIDENCE_BAR_CALIBRATED, false, 'calibration needs hand labels that do not exist yet');
});

test('2.3 climb stays at the best leaf when it clears the bar', () => {
  const db = placedFixture(ROWS);
  const tree = PlacementTree.load(db);
  const cheddars = nodeIdOf(db, 'food', 'en:cheddars');
  const out = climb(tree, new Map([[cheddars, 9]]), 'food', 0.6);
  assert.equal(out.nodeId, cheddars);
  assert.equal(out.level, 3);
  assert.ok(out.confidence >= 0.6, String(out.confidence));
  assert.equal(out.atTopLevel, false);
});

test('2.3 climb goes up from the best leaf until the subtree\'s share clears the bar', () => {
  const db = placedFixture(ROWS);
  const tree = PlacementTree.load(db);
  const cheddars = nodeIdOf(db, 'food', 'en:cheddars');
  const cheeses = nodeIdOf(db, 'food', 'en:cheeses');
  const yogurts = nodeIdOf(db, 'food', 'en:yogurts');
  // 4 cheddar, 3 cheese (not cheddar), 3 yogurt: cheddars 4/11, cheeses 7/11 = 0.64.
  const out = climb(tree, new Map([[cheddars, 4], [cheeses, 3], [yogurts, 3]]), 'food', 0.6);
  assert.equal(out.nodeId, cheeses);
  assert.equal(out.level, 2);
  // Higher bar: cheeses 0.64 fails, dairies 10/11 = 0.91 clears.
  const up = climb(tree, new Map([[cheddars, 4], [cheeses, 3], [yogurts, 3]]), 'food', 0.8);
  assert.equal(up.nodeId, nodeIdOf(db, 'food', 'en:dairies'));
  assert.equal(up.level, 1);
});

test('2.3 climb that clears the bar at no category level ends at the department, flagged top level', () => {
  const db = placedFixture(ROWS);
  const tree = PlacementTree.load(db);
  const out = climb(tree, new Map([[nodeIdOf(db, 'food', 'en:cheddars'), 1], [nodeIdOf(db, 'food', 'en:chips'), 1]]), 'food', 0.6);
  assert.equal(out.atTopLevel, true);
  assert.equal(out.nodeId, nodeIdOf(db, 'food', '@department'));
  assert.equal(out.level, 0);
});

test('2.3 climb fails loudly on votes it cannot read: none, a non-positive weight, an unknown node, another department, the unplaced node', () => {
  const db = placedFixture(ROWS);
  const tree = PlacementTree.load(db);
  assert.throws(() => climb(tree, new Map(), 'food'), /no votes/);
  assert.throws(() => climb(tree, new Map([[nodeIdOf(db, 'food', 'en:chips'), 0]]), 'food'), /weight/);
  assert.throws(() => climb(tree, new Map([[999999, 1]]), 'food'), /no node/);
  assert.throws(() => climb(tree, new Map([[nodeIdOf(db, 'beauty', 'en:shampoos'), 1]]), 'food'), /department/);
  assert.throws(() => climb(tree, new Map([[nodeIdOf(db, 'food', '@unplaced'), 1]]), 'food'), /unplaced/);
});

/* ----------------------------------------------------------- 2.1 routes */

test('2.1 the route order is barcode, text, meaning, Claude, top level', () => {
  assert.deepEqual([...CASCADE_ROUTES], ['barcode', 'text', 'meaning', 'claude', 'top-level']);
});

test('2.1 barcode: an unplaced item whose code is another spelling of a placed item\'s code takes that item\'s category', () => {
  const db = placedFixture(ROWS);
  const route = barcodeRoute(db);
  const item = { code: '000000000017', department: 'food' } as const;
  const votes = route.propose(item);
  assert.ok(votes, 'the 12-digit code is the GTIN-13 0000000000017 written without its leading zero');
  assert.deepEqual([...votes.keys()], [nodeIdOf(db, 'food', 'en:cheddars')]);
  assert.equal(route.propose({ code: 'U-text', department: 'food' }), null, 'no twin, no barcode answer');
});

test('2.1 a neighbour route abstains with fewer labelled neighbours than its minimum, and never counts the item itself or an unlabelled one', () => {
  const db = placedFixture(ROWS);
  const route = tableRoute(db, 'text', { 'U-text': ['U-text', 'U-none', 'C2'], 'U-none': [] });
  assert.equal(route.propose({ code: 'U-text', department: 'food' }), null, 'one labelled neighbour, minimum two');
  assert.equal(route.propose({ code: 'U-none', department: 'food' }), null);
  assert.equal(route.propose({ code: 'nobody', department: 'food' }), null, 'an item the table never saw abstains');
});

/* ---------------------------------------------------------- 2.1 cascade */

test('2.1 the cascade places every item at some level and records the route that placed it', async () => {
  const db = placedFixture(ROWS);
  const routes = [
    barcodeRoute(db),
    tableRoute(db, 'text', { 'U-text': ['C2', 'C3', '0000000000017'] }),
    tableRoute(db, 'meaning', {}),
  ];
  const summary = await runCascade(db, { routes, log: quiet });
  assert.equal(placementOf(db, '000000000017').placedBy, 'barcode');
  assert.equal(placementOf(db, '000000000017').tag, 'en:cheddars');
  assert.equal(placementOf(db, 'U-text').placedBy, 'text');
  assert.equal(placementOf(db, 'U-text').tag, 'en:cheddars');
  assert.equal(placementOf(db, 'U-none').placedBy, 'top-level');
  assert.equal(placementOf(db, 'U-none').kind, 'department');
  assert.equal(placementOf(db, 'UB').placedBy, 'top-level');
  const c = countPaths(db);
  assert.deepEqual(c.unplacedByDepartment, {}, 'nothing is left unplaced');
  assert.equal(c.placedWithoutLevelOrConfidence, 0);
  assert.equal(summary.byRoute.food!.barcode, 1);
  assert.equal(summary.byRoute.food!.text, 1);
  assert.equal(summary.byRoute.food!['top-level'], 1);
  assert.equal(summary.byRoute.beauty!['top-level'], 1);
  assert.deepEqual(summary.unplacedRemaining, {});
  assert.equal(summary.claudeSlotReached.food, 1, 'U-none reached the Claude slot, which is not wired, and fell to the top level');
});

test('2.1 the cascade never moves an item placed from its own stored path', async () => {
  const db = placedFixture(ROWS);
  const route = tableRoute(db, 'text', { C4: ['S1', 'S1', 'S1'], C2: ['Y1', 'Y2'] });
  await runCascade(db, { routes: [route], log: quiet });
  assert.equal(placementOf(db, 'C4').placedBy, 'path');
  assert.equal(placementOf(db, 'C2').tag, 'en:cheddars');
});

test('2.1 every move goes through the append-only log, one row per moved item; a second run writes nothing', async () => {
  const db = placedFixture(ROWS);
  const routes = () => [barcodeRoute(db), tableRoute(db, 'text', { 'U-text': ['C2', 'C3'] })];
  const before = logLength(db);
  const first = await runCascade(db, { routes: routes(), log: quiet });
  assert.equal(first.moved, 4, '000000000017, U-text, U-none, UB');
  assert.equal(logLength(db), before + 4);
  const second = await runCascade(db, { routes: routes(), log: quiet });
  assert.equal(second.moved, 0);
  assert.equal(second.unchanged, 4);
  assert.equal(logLength(db), before + 4, 'an unchanged placement is not rewritten');
});

test('2.1 the top-level-only share is reported against the 5% bar', async () => {
  const db = placedFixture(ROWS);
  const summary = await runCascade(db, { routes: [], log: quiet });
  assert.equal(TOP_LEVEL_SHARE_BAR, 0.05);
  // 12 items, 4 of them (the four untagged) end at the top level only.
  assert.equal(summary.topLevelOnly.items, 4);
  assert.equal(summary.topLevelOnly.of, 12);
  assert.ok(Math.abs(summary.topLevelOnly.share - 4 / 12) < 1e-9);
  assert.equal(summary.topLevelOnly.meetsBar, false);
  assert.equal(summary.topLevelOnly.perDepartment.food!.items, 3);
});

test('2.1 the Claude slot is an interface: with no chooser it is never called; a chooser is offered a fixed list and a pick outside it is refused', async () => {
  const db = placedFixture(ROWS);
  const offered: number[][] = [];
  const chooser: ClaudeListChooser = {
    async choose(item, list) {
      offered.push(list.map((c) => c.nodeId));
      if (item.code === 'U-none') return { nodeId: nodeIdOf(db, 'food', 'en:chips'), confidence: 0.8 };
      return null;
    },
  };
  await runCascade(db, { routes: [], claude: chooser, log: quiet });
  assert.equal(placementOf(db, 'U-none').placedBy, 'claude');
  assert.equal(placementOf(db, 'U-none').tag, 'en:chips');
  assert.ok(offered.length >= 1);
  assert.ok(offered[0]!.includes(nodeIdOf(db, 'food', 'en:chips')), 'the list is the department\'s own categories');
  assert.ok(!offered[0]!.includes(nodeIdOf(db, 'beauty', 'en:shampoos')), 'and only those');

  const db2 = placedFixture(ROWS);
  const rogue: ClaudeListChooser = { async choose() { return { nodeId: nodeIdOf(db2, 'beauty', 'en:shampoos'), confidence: 0.9 }; } };
  await assert.rejects(runCascade(db2, { routes: [], claude: rogue, log: quiet }), /not on the list/);
});

/* ---------------------------------------------------- 2.1 fails loudly */

test('2.1 a route that throws stops the run and names the item; nothing is swallowed', async () => {
  const db = placedFixture(ROWS);
  const broken: PlacementRoute = { name: 'text', propose(item) { if (item.code === 'U-text') throw new Error('index exploded'); return null; } };
  await assert.rejects(runCascade(db, { routes: [broken], log: quiet }), /U-text.*index exploded|index exploded.*U-text/);
});

test('2.1 an item that cannot be placed (no department) fails the run loudly with the count', async () => {
  const db = placedFixture([...ROWS, { code: 'M1', source: 'somewhere-new', path: [] }]);
  await assert.rejects(runCascade(db, { routes: [], log: quiet }), /2\.1 FAILED.*1 item/);
});

test('2.1 a route voting for another department\'s category stops the run', async () => {
  const db = placedFixture(ROWS);
  const wrong: PlacementRoute = { name: 'meaning', propose(item) { return item.code === 'U-text' ? new Map([[nodeIdOf(db, 'beauty', 'en:shampoos'), 5]]) : null; } };
  await assert.rejects(runCascade(db, { routes: [wrong], log: quiet }), /department/);
});

test('2.1 labelled leaves are the items placed from their own stored path, never items a cascade route placed', async () => {
  const db = placedFixture(ROWS);
  await runCascade(db, { routes: [barcodeRoute(db)], log: quiet });
  const leaves = labelledLeaves(db);
  assert.ok(leaves.has('C2'));
  assert.ok(!leaves.has('000000000017'), 'a barcode placement is not a label to learn from');
  assert.ok(!leaves.has('U-none'));
});

/* ------------------------------------------- text match through search.ts */

test('2.1 text neighbours come from the catalogue\'s own word search, same department only, the item itself left out', async () => {
  const db = placedFixture(ROWS);
  const out = await textNeighbours(db, [{ code: 'U-text', department: 'food', text: 'cheddar cheese' }], { workers: 0 });
  const got = out.get('U-text') ?? [];
  assert.ok(got.includes('C2') && got.includes('C3'), JSON.stringify(got));
  assert.ok(!got.includes('U-text'));
  assert.ok(!got.includes('B1'));
});

/* ----------------------------------------------------- the live file guard */

test('2.1 the cascade refuses the live catalogue file unless told explicitly', () => {
  const here = resolve(fileURLToPath(new URL('../data/catalogue.db', import.meta.url)));
  assert.throws(() => assertNotLiveCatalogue(here), /live catalogue/);
  assert.doesNotThrow(() => assertNotLiveCatalogue(join(tmpdir(), 'copy.db')));
  assert.doesNotThrow(() => assertNotLiveCatalogue(here, { live: true }));
});

test('2.1 a fresh catalogue with no placement layer is refused by the cascade (run the Stage 2 build first)', async () => {
  const db = fixtureCatalogue(ROWS);
  ensurePlacementSchema(db);
  await assert.rejects(runCascade(db, { routes: [], log: quiet }), /Stage 2|placement\.ts/);
});

test('2.1 text neighbours from worker threads (read-only connections to a temp file) equal the one-thread result', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { openCatalogue } = await import('../src/schema.ts');
  const dir = mkdtempSync(join(tmpdir(), 'shin-cascade-'));
  try {
    const path = join(dir, 'cat.db');
    const mem = placedFixture(ROWS);
    mem.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
    mem.close();
    const db = openCatalogue(path);
    const qs = [
      { code: 'U-text', department: 'food', text: 'cheddar cheese' },
      { code: 'U-none', department: 'food', text: 'potato chips' },
      { code: 'UB', department: 'beauty', text: 'herbal shampoo' },
    ];
    const one = await textNeighbours(db, qs, { workers: 0 });
    const many = await textNeighbours(db, qs, { workers: 2, dbPath: path });
    assert.deepEqual([...many.entries()].sort(), [...one.entries()].sort());
    assert.ok((many.get('UB') ?? []).includes('B1'));
    db.close();
    await assert.rejects(textNeighbours(placedFixture(ROWS), qs, { workers: 2 }), /dbPath/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('2.1 the one command runs the build and the cascade on a file, says out loud when a route is off, and exits 3 when the top-level share is over 5%', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'shin-run-'));
  try {
    const path = join(dir, 'cat.db');
    const mem = fixtureCatalogue(ROWS);
    mem.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
    mem.close();
    const script = fileURLToPath(new URL('../src/placement-run.ts', import.meta.url));
    const r = spawnSync(process.execPath, ['--no-warnings', script, '--db', path, '--no-meaning', '--no-taxonomy', '--workers', '1'], { encoding: 'utf8' });
    assert.equal(r.status, 3, r.stdout + r.stderr);
    assert.match(r.stdout, /MEANING ROUTE OFF/);
    assert.match(r.stderr, /OVER the 5% bar/);
    const live = spawnSync(process.execPath, ['--no-warnings', script, '--db', fileURLToPath(new URL('../data/catalogue.db', import.meta.url)), '--no-meaning'], { encoding: 'utf8' });
    assert.equal(live.status, 1);
    assert.match(live.stderr, /live catalogue/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
