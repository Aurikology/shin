/**
 * Price-category plan, Stage 2, requirements 1.6 and 1.7.
 *
 * 1.6: a stable placement layer (item -> placement leaf) under a separately rebuilt
 *      price layer (placement leaves -> price groups); a rebuild makes zero
 *      placement calls, counted, and any call fails the test.
 * 1.7: append-only version tables; every version is kept with its numbers; each
 *      answer records the version it used; a replay reproduces a past lookup
 *      exactly. 50 random past lookups replay after a later rebuild.
 *
 * Written before catalogue/src/price-layer.ts existed; every test here was red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { openCatalogue } from '../src/schema.ts';
import { buildPlacement, ensurePlacementSchema, placeItem, placementCallCount, setPlacementCallHook } from '../src/placement.ts';
import {
  ensurePriceLayerSchema,
  lookupGroup,
  PlacementDuringRebuildError,
  rebuildPriceLayer,
  recordLookup,
  replayLookup,
  verifyVersion,
  VersionTamperedError,
} from '../src/price-layer.ts';

/** A seeded generator, so the "random" 50 are the same every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * 30 cheese items (en:dairy > en:cheeses), 25 of them cheddar (en:cheeses > en:cheddar),
 * 8 yogurts (en:dairy > en:yogurts), 10 unplaced food items, 3 beauty items.
 */
function fixture(): { db: DatabaseSync; codes: string[] } {
  const db = openCatalogue(':memory:');
  const ins = db.prepare(`INSERT INTO product (code, name, category_path, leaf_category, allergens, sold_in_canada, source) VALUES (?,?,?,?,?,?,?)`);
  const codes: string[] = [];
  const add = (code: string, source: string, path: string[]) => {
    ins.run(code, code, JSON.stringify(path), path.at(-1) ?? null, '[]', 1, source);
    codes.push(code);
  };
  for (let i = 0; i < 25; i++) add(`CH${i}`, 'openfoodfacts', ['en:dairy', 'en:cheeses', 'en:cheddar']);
  for (let i = 0; i < 5; i++) add(`CS${i}`, 'openfoodfacts', ['en:dairy', 'en:cheeses']);
  for (let i = 0; i < 8; i++) add(`YO${i}`, 'openfoodfacts', ['en:dairy', 'en:yogurts']);
  for (let i = 0; i < 10; i++) add(`UN${i}`, 'openfoodfacts', []);
  for (let i = 0; i < 3; i++) add(`BE${i}`, 'openbeautyfacts', ['en:shampoos']);
  ensurePlacementSchema(db);
  buildPlacement(db, { log: () => {} });
  ensurePriceLayerSchema(db);
  return { db, codes };
}

function pricesFor(codes: readonly string[], seed: number): Map<string, number> {
  const r = rng(seed);
  const m = new Map<string, number>();
  for (const c of codes) m.set(c, 200 + Math.round(r() * 800));
  return m;
}

const quiet = { log: () => {} };

/* ----------------------------------------------------------------- 1.6 */

test('1.6 a price-layer rebuild makes zero placement calls (a hook throws on any call)', () => {
  const { db, codes } = fixture();
  const before = placementCallCount();
  setPlacementCallHook(() => {
    throw new Error('a placement call happened during the price-layer rebuild');
  });
  try {
    const r = rebuildPriceLayer(db, { prices: pricesFor(codes, 1), builtAt: '2026-10-09T00:00:00Z', ...quiet });
    assert.equal(r.placementCalls, 0);
    assert.equal(r.placementWrites, 0);
    assert.equal(r.placementHashBefore, r.placementHashAfter);
  } finally {
    setPlacementCallHook(null);
  }
  assert.equal(placementCallCount(), before);
});

test('1.6 control: the counter and the hook are live, so a placement call would be seen', () => {
  const { db } = fixture();
  let calls = 0;
  setPlacementCallHook(() => {
    calls += 1;
  });
  try {
    placeItem(db, 'UN0', 'en:yogurts', 'test', 1);
  } finally {
    setPlacementCallHook(null);
  }
  assert.equal(calls, 1);
});

test('1.6 a placement write during the rebuild is refused by the database and stops the rebuild', () => {
  const { db, codes } = fixture();
  assert.throws(
    () =>
      rebuildPriceLayer(db, {
        prices: pricesFor(codes, 1),
        builtAt: '2026-10-09T00:00:00Z',
        ...quiet,
        // A test-only seam: work run inside the rebuild's guarded window.
        duringRebuildForTests: () => db.exec(`UPDATE item_placement SET placed_by = 'sneaky' WHERE code = 'CH0'`),
      }),
    (err: unknown) => err instanceof PlacementDuringRebuildError || /placement/i.test(String(err)),
  );
  const v = db.prepare(`SELECT count(*) AS n FROM hierarchy_version`).get() as { n: number };
  assert.equal(v.n, 0, 'nothing is half-written');
});

test('1.6 groups: a leaf with 20+ priced items is its own group; a thin leaf rolls into its parent; the department takes the rest', () => {
  const { db, codes } = fixture();
  const r = rebuildPriceLayer(db, { prices: pricesFor(codes, 2), builtAt: '2026-10-09T00:00:00Z', ...quiet });
  const g = (code: string) => {
    const a = lookupGroup(db, code, r.versionId);
    assert.equal(a.placed, true, code);
    return a.placed ? a.group.tag : '';
  };
  assert.equal(g('CH0'), 'en:cheddar', '25 priced cheddars');
  assert.equal(g('CS0'), '@department', '5 plain cheeses do not reach 20 at en:cheeses, nor with the yogurts at en:dairy');
  assert.equal(g('YO0'), '@department');
  const thin = lookupGroup(db, 'YO0', r.versionId);
  assert.ok(thin.placed && thin.group.flag === 'thin' && thin.group.nItems === 13);
});

test('1.6 unplaced items never feed a price group, and the ignored prices are counted', () => {
  const { db, codes } = fixture();
  const r = rebuildPriceLayer(db, { prices: pricesFor(codes, 3), builtAt: '2026-10-09T00:00:00Z', ...quiet });
  assert.equal(r.unplacedPricesIgnored, 10);
  const a = lookupGroup(db, 'UN0', r.versionId);
  assert.equal(a.placed, false);
  assert.ok(!('group' in a));
  const food = lookupGroup(db, 'CS0', r.versionId);
  assert.ok(food.placed && food.group.nItems === 13, 'the food department remainder holds 5 cheeses and 8 yogurts, no unplaced item');
});

test('1.6 a price for an unknown item is counted and named; a price that is not positive stops the rebuild', () => {
  const { db } = fixture();
  const lines: string[] = [];
  const r = rebuildPriceLayer(db, { prices: new Map([['CH0', 300], ['NOPE', 100]]), builtAt: '2026-10-09T00:00:00Z', log: (l) => lines.push(l) });
  assert.equal(r.pricesForUnknownItems, 1, 'counted');
  assert.ok(lines.some((l) => l.includes('NOPE')), 'and named where a person sees it');
  assert.throws(() => rebuildPriceLayer(db, { prices: new Map([['CH0', 0]]), builtAt: '2026-10-09T00:00:00Z', ...quiet }), /positive/);
  assert.throws(() => rebuildPriceLayer(db, { prices: new Map([['CH0', Number.NaN]]), builtAt: '2026-10-09T00:00:00Z', ...quiet }), /positive/);
});

/* ----------------------------------------------------------------- 1.7 */

test('1.7 every rebuild is a new version, and an older version keeps its numbers after a later one', () => {
  const { db, codes } = fixture();
  const v1 = rebuildPriceLayer(db, { prices: pricesFor(codes, 4), builtAt: '2026-10-09T00:00:00Z', ...quiet });
  const before = JSON.stringify(lookupGroup(db, 'CH3', v1.versionId));
  const v2 = rebuildPriceLayer(db, { prices: pricesFor(codes, 5), builtAt: '2026-10-10T00:00:00Z', ...quiet });
  assert.notEqual(v1.versionId, v2.versionId);
  assert.equal(JSON.stringify(lookupGroup(db, 'CH3', v1.versionId)), before);
  assert.notEqual(JSON.stringify(lookupGroup(db, 'CH3', v2.versionId)), before, 'precondition: the later version has different numbers');
  verifyVersion(db, v1.versionId);
  verifyVersion(db, v2.versionId);
});

test('1.7 the version tables and the answer log are append-only: an update or a delete is refused', () => {
  const { db, codes } = fixture();
  const v = rebuildPriceLayer(db, { prices: pricesFor(codes, 6), builtAt: '2026-10-09T00:00:00Z', ...quiet });
  recordLookup(db, lookupGroup(db, 'CH0', v.versionId), '2026-10-09T01:00:00Z');
  for (const sql of [
    `UPDATE hierarchy_version SET min_items = 1`,
    `DELETE FROM hierarchy_version`,
    `UPDATE hierarchy_version_group SET p50 = 1`,
    `DELETE FROM hierarchy_version_group`,
    `UPDATE hierarchy_version_map SET group_node_id = node_id`,
    `DELETE FROM hierarchy_version_map`,
    `UPDATE lookup_answer SET answer_json = '{}'`,
    `DELETE FROM lookup_answer`,
    `UPDATE placement_log SET leaf_id = 1`,
    `DELETE FROM placement_log`,
  ]) {
    assert.throws(() => db.exec(sql), /append-only/, sql);
  }
});

test('1.7 an answer records the version it used', () => {
  const { db, codes } = fixture();
  const v = rebuildPriceLayer(db, { prices: pricesFor(codes, 7), builtAt: '2026-10-09T00:00:00Z', ...quiet });
  const a = lookupGroup(db, 'CH0');
  assert.equal(a.versionId, v.versionId, 'with no version asked for, the latest is used and named');
  const id = recordLookup(db, a, '2026-10-09T01:00:00Z');
  const row = db.prepare(`SELECT version_id, code FROM lookup_answer WHERE answer_id = ?`).get(id) as { version_id: number; code: string };
  assert.equal(row.version_id, v.versionId);
  assert.equal(row.code, 'CH0');
});

test('1.7 50 random past lookups replay exactly against their versions after a later rebuild', () => {
  const { db, codes } = fixture();
  const r = rng(42);
  const answerIds: number[] = [];
  const v1 = rebuildPriceLayer(db, { prices: pricesFor(codes, 8), builtAt: '2026-10-09T00:00:00Z', ...quiet });
  for (let i = 0; i < 40; i++) answerIds.push(recordLookup(db, lookupGroup(db, codes[Math.floor(r() * codes.length)]!), `2026-10-09T01:${String(i).padStart(2, '0')}:00Z`));
  // Between versions, Stage 3 moves items out of "unplaced", and prices change.
  for (let i = 0; i < 10; i++) placeItem(db, `UN${i}`, 'en:yogurts', 'test', 1);
  const v2 = rebuildPriceLayer(db, { prices: pricesFor(codes, 9), builtAt: '2026-10-10T00:00:00Z', ...quiet });
  for (let i = 0; i < 40; i++) answerIds.push(recordLookup(db, lookupGroup(db, codes[Math.floor(r() * codes.length)]!), `2026-10-10T01:${String(i).padStart(2, '0')}:00Z`));
  rebuildPriceLayer(db, { prices: pricesFor(codes, 10), builtAt: '2026-10-11T00:00:00Z', ...quiet });

  const pick = [...answerIds].sort(() => r() - 0.5).slice(0, 50);
  assert.equal(pick.length, 50);
  let changedSince = 0;
  const versions = new Set<number>();
  for (const id of pick) {
    const rep = replayLookup(db, id);
    assert.equal(rep.same, true, `answer ${id} did not reproduce:\n${rep.recorded}\n${rep.replayed}`);
    assert.equal(rep.replayed, rep.recorded);
    versions.add(rep.versionId);
    const now = lookupGroup(db, rep.code);
    if (JSON.stringify(now) !== rep.recorded) changedSince += 1;
  }
  assert.ok(versions.has(v1.versionId) && versions.has(v2.versionId), 'the sample spans both versions');
  assert.ok(changedSince >= 25, `precondition: the latest version answers differently for most of them (got ${changedSince})`);
});

test('1.7 an unplaced item\'s past answer replays as unplaced even after it is placed', () => {
  const { db, codes } = fixture();
  rebuildPriceLayer(db, { prices: pricesFor(codes, 11), builtAt: '2026-10-09T00:00:00Z', ...quiet });
  const id = recordLookup(db, lookupGroup(db, 'UN3'), '2026-10-09T01:00:00Z');
  placeItem(db, 'UN3', 'en:cheddar', 'test', 1);
  rebuildPriceLayer(db, { prices: pricesFor(codes, 12), builtAt: '2026-10-10T00:00:00Z', ...quiet });
  const rep = replayLookup(db, id);
  assert.equal(rep.same, true);
  assert.equal((JSON.parse(rep.replayed) as { placed: boolean }).placed, false);
  assert.equal(lookupGroup(db, 'UN3').placed, true);
});

test('1.7 an edited version row is detected on replay even with the append-only trigger dropped', () => {
  const { db, codes } = fixture();
  const v = rebuildPriceLayer(db, { prices: pricesFor(codes, 13), builtAt: '2026-10-09T00:00:00Z', ...quiet });
  const id = recordLookup(db, lookupGroup(db, 'CH0', v.versionId), '2026-10-09T01:00:00Z');
  db.exec(`DROP TRIGGER hierarchy_version_group_no_update`);
  db.exec(`UPDATE hierarchy_version_group SET p50 = p50 + 1 WHERE version_id = ${v.versionId}`);
  assert.throws(() => replayLookup(db, id), VersionTamperedError);
  assert.throws(() => verifyVersion(db, v.versionId), VersionTamperedError);
});

test('1.7 a replay of an answer or version that does not exist stops loudly', () => {
  const { db } = fixture();
  assert.throws(() => replayLookup(db, 12345), /no recorded answer/);
  assert.throws(() => lookupGroup(db, 'CH0'), /no hierarchy version/);
  assert.throws(() => lookupGroup(db, 'CH0', 99), /no hierarchy version 99/);
});
