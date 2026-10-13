/**
 * Price-category plan, Stage 2, requirements 1.2, 1.3, 1.4, 1.5 (and 1.7 for the
 * new tables). The data here is SYNTHETIC, built so that each rule's failure goes
 * red: a mixed-unit category that must split, a noise split that must be rejected,
 * an undersized subgroup that must merge, an attribute that clearly moves price
 * that must be used. Nothing here says the rules work on real prices: the real
 * catalogue has about 17 priced products, each alone in its category.
 *
 * Written before the splitting existed in catalogue/src/price-layer.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openCatalogue } from '../src/schema.ts';
import { buildPlacement, ensurePlacementSchema, placementCallCount, setPlacementCallHook } from '../src/placement.ts';
import {
  ensurePriceLayerSchema,
  lookupGroup,
  pricesFromObservations,
  rebuildPriceLayer,
  recordLookup,
  replayLookup,
  verifyVersion,
  VersionTamperedError,
  type GroupAnswer,
} from '../src/price-layer.ts';

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

/** Roughly normal noise with standard deviation `sigma` (a sum of four uniforms). */
function noise(r: () => number, sigma: number): number {
  return (r() + r() + r() + r() - 2) * sigma * Math.sqrt(3);
}

interface Spec {
  code: string;
  brand?: string | null;
  size?: number | null;
  unit?: string | null;
  price: number;
}

const PATH = ['en:dairy', 'en:cheeses', 'en:cheddar'];

function build(specs: readonly Spec[], path: readonly string[] = PATH): { db: DatabaseSync; prices: Map<string, number> } {
  const db = openCatalogue(':memory:');
  const ins = db.prepare(
    `INSERT INTO product (code, name, brands, size_value, size_unit, category_path, leaf_category, allergens, sold_in_canada, source) VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  const prices = new Map<string, number>();
  for (const s of specs) {
    ins.run(s.code, s.code, s.brand ?? null, s.size ?? null, s.unit ?? null, JSON.stringify(path), path.at(-1) ?? null, '[]', 1, 'openfoodfacts');
    prices.set(s.code, s.price);
  }
  ensurePlacementSchema(db);
  buildPlacement(db, { log: () => {} });
  ensurePriceLayerSchema(db);
  return { db, prices };
}

const quiet = { log: () => {} };
const AT = '2026-10-13T00:00:00Z';

function rebuild(db: DatabaseSync, prices: Map<string, number>, extra: Record<string, unknown> = {}) {
  return rebuildPriceLayer(db, { prices, builtAt: AT, ...quiet, ...extra });
}

function ans(db: DatabaseSync, code: string, versionId?: number): GroupAnswer {
  const a = lookupGroup(db, code, versionId);
  assert.ok(a.placed, `${code} is placed`);
  return a as GroupAnswer;
}

/* ---------------------------------------------------------------- 1.2 */

test('1.2 a mixed-unit category splits by unit, each half lands under 1.5x, and every group carries a bootstrap interval', () => {
  const r = rng(11);
  const specs: Spec[] = [];
  for (let i = 0; i < 70; i++) specs.push({ code: `G${i}`, brand: i % 2 ? 'a' : 'b', size: 500, unit: 'g', price: Math.round(400 * Math.exp(noise(r, 0.06))) });
  for (let i = 0; i < 70; i++) specs.push({ code: `M${i}`, brand: i % 2 ? 'a' : 'b', size: 500, unit: 'ml', price: Math.round(1200 * Math.exp(noise(r, 0.06))) });
  const { db, prices } = build(specs);
  setPlacementCallHook(() => {
    throw new Error('a placement call happened during the price-layer rebuild');
  });
  let v;
  try {
    v = rebuild(db, prices);
  } finally {
    setPlacementCallHook(null);
  }
  assert.equal(v.placementCalls, 0);
  assert.equal(v.placementHashBefore, v.placementHashAfter);
  const g = ans(db, 'G3', v.versionId).group;
  const m = ans(db, 'M3', v.versionId).group;
  assert.equal(g.nItems, 70);
  assert.equal(m.nItems, 70);
  assert.ok(g.width !== null && g.width <= 1.5, `grams width ${g.width}`);
  assert.ok(m.width !== null && m.width <= 1.5, `millilitres width ${m.width}`);
  assert.equal(g.flag, 'ok');
  assert.deepEqual(g.splitPath, [{ attribute: 'size_unit', level: 'g' }]);
  assert.deepEqual(m.splitPath, [{ attribute: 'size_unit', level: 'ml' }]);
  assert.ok(g.p50 !== null && g.p50 < 500 && m.p50 !== null && m.p50 > 1000);
  for (const x of [g, m]) {
    assert.ok(x.widthLo !== null && x.widthHi !== null && x.width !== null, 'interval present');
    assert.ok(x.widthLo! <= x.width! + 1e-9 && x.width! <= x.widthHi! + 1e-9, `interval ${x.widthLo}..${x.widthHi} holds width ${x.width}`);
  }
  const base = db.prepare(`SELECT flag FROM hierarchy_version_group WHERE version_id = ? AND group_node_id = ?`).get(v.versionId, g.nodeId) as { flag: string };
  assert.equal(base.flag, 'split');
});

test('1.2 a group of 20+ items over 1.5x that nothing explains is flagged wide, with its interval', () => {
  const r = rng(12);
  const specs: Spec[] = [];
  for (let i = 0; i < 60; i++) specs.push({ code: `W${i}`, brand: `b${i % 3}`, size: 500, unit: 'g', price: Math.round(100 * Math.exp(r() * Math.log(10))) });
  const { db, prices } = build(specs);
  const v = rebuild(db, prices);
  const g = ans(db, 'W0', v.versionId).group;
  assert.equal(g.flag, 'wide');
  assert.equal(g.nItems, 60);
  assert.ok(g.width! > 1.5);
  assert.ok(g.widthLo !== null && g.widthLo > 1.5, 'the whole interval is above 1.5: this is not sampling luck');
  assert.deepEqual(g.splitPath, []);
});

test('1.2 two attributes both move price: the split recurses until each leaf is under 1.5x', () => {
  const r = rng(13);
  const specs: Spec[] = [];
  for (const [unit, uf] of [['g', 1], ['ml', 3]] as const) {
    for (const [brand, bf] of [['cheap', 1], ['premium', 2]] as const) {
      for (let i = 0; i < 30; i++) specs.push({ code: `${unit}${brand}${i}`, brand, size: 500, unit, price: Math.round(300 * uf * bf * Math.exp(noise(r, 0.05))) });
    }
  }
  const { db, prices } = build(specs);
  const v = rebuild(db, prices);
  const seen = new Set<string>();
  for (const s of specs) {
    const g = ans(db, s.code, v.versionId).group;
    assert.equal(g.splitPath.length, 2, `${s.code} path ${JSON.stringify(g.splitPath)}`);
    assert.ok(g.width! <= 1.5, `${s.code} width ${g.width}`);
    assert.equal(g.nItems, 30);
    seen.add(g.subgroupKey);
  }
  assert.equal(seen.size, 4);
});

/* ---------------------------------------------------------------- 1.3 */

function noiseCategory(seed: number): Spec[] {
  const r = rng(seed);
  const specs: Spec[] = [];
  for (let i = 0; i < 80; i++) {
    specs.push({
      code: `N${i}`,
      brand: `b${Math.floor(r() * 4)}`,
      size: [250, 500, 1000][Math.floor(r() * 3)]!,
      unit: r() < 0.5 ? 'g' : 'ml',
      price: Math.round(100 * Math.exp(r() * Math.log(10))),
    });
  }
  return specs;
}

test('1.3 a split that only fits the half it was chosen on is dropped as noise (30 seeds, none may split)', () => {
  let splits = 0;
  for (let seed = 100; seed < 130; seed++) {
    const { db, prices } = build(noiseCategory(seed));
    const v = rebuild(db, prices);
    const g = ans(db, 'N0', v.versionId).group;
    if (g.splitPath.length > 0) splits += 1;
    assert.equal(g.flag, 'wide', `seed ${seed}`);
  }
  assert.equal(splits, 0);
});

test('1.3 control: with the held-out check switched off the same noise does split, so the check above is what stops it', () => {
  let splits = 0;
  for (let seed = 100; seed < 130; seed++) {
    const { db, prices } = build(noiseCategory(seed));
    const v = rebuild(db, prices, { unsafeNoHeldOut: true });
    if (ans(db, 'N0', v.versionId).group.splitPath.length > 0) splits += 1;
  }
  assert.ok(splits >= 25, `only ${splits} of 30 noise categories split without the held-out check`);
});

test('1.3 a real split is kept by the same check (30 seeds, all must split)', () => {
  let kept = 0;
  for (let seed = 200; seed < 230; seed++) {
    const r = rng(seed);
    const specs: Spec[] = [];
    for (let i = 0; i < 80; i++) {
      const premium = i % 2 === 0;
      specs.push({ code: `S${i}`, brand: premium ? 'premium' : 'cheap', size: 500, unit: 'g', price: Math.round((premium ? 700 : 300) * Math.exp(noise(r, 0.15))) });
    }
    const { db, prices } = build(specs);
    const v = rebuild(db, prices);
    if (ans(db, 'S0', v.versionId).group.splitPath.length > 0) kept += 1;
  }
  assert.equal(kept, 30);
});

/* ---------------------------------------------------------------- 1.4 */

test('1.4 an undersized subgroup merges into the parent; subgroup size counts items, not rows (one item in 5 stores is 1)', () => {
  const r = rng(14);
  const specs: Spec[] = [];
  const stores = new Map<string, number>();
  const add = (brand: string, n: number, center: number, rows: number) => {
    for (let i = 0; i < n; i++) {
      const code = `${brand}${i}`;
      specs.push({ code, brand, size: 500, unit: 'g', price: Math.round(center * Math.exp(noise(r, 0.05))) });
      stores.set(code, rows);
    }
  };
  add('alpha', 30, 300, 1);
  add('beta', 30, 900, 1);
  add('delta', 25, 1800, 2); // 25 items, 50 rows
  add('gamma', 12, 600, 5); // 12 items, 60 rows: under 20 items, over 20 rows
  const { db, prices: unused } = build(specs);
  assert.ok(unused.size === 97);
  const obs = new DatabaseSync(':memory:');
  obs.exec(`CREATE TABLE observation (code TEXT, price_cents INTEGER NOT NULL, kind TEXT NOT NULL, currency TEXT NOT NULL)`);
  const put = obs.prepare(`INSERT INTO observation (code, price_cents, kind, currency) VALUES (?,?,?,?)`);
  for (const s of specs) for (let k = 0; k < stores.get(s.code)!; k++) put.run(s.code, s.price, 'regular', 'CAD');
  const prices = pricesFromObservations(obs);
  assert.equal(prices.size, 97, 'one price per item');
  const v = rebuild(db, prices);
  const rows = db.prepare(`SELECT subgroup_key, n_items FROM hierarchy_version_subgroup WHERE version_id = ?`).all(v.versionId) as { subgroup_key: string; n_items: number }[];
  assert.ok(rows.length >= 3, 'alpha, beta and delta are subgroups');
  for (const x of rows) assert.ok(x.n_items >= 20, `${x.subgroup_key} has ${x.n_items} items`);
  assert.equal(ans(db, 'delta0', v.versionId).group.nItems, 25, 'items, not the 50 rows');
  assert.equal(ans(db, 'alpha0', v.versionId).group.nItems, 30);
  const g = ans(db, 'gamma0', v.versionId).group;
  assert.equal(g.flag, 'unmatched_level', 'the 12 gamma items are not a subgroup; they are answered by the parent');
  assert.equal(g.nItems, 97, 'the parent holds all 97 items');
  assert.deepEqual(g.splitPath, []);
});

/* ---------------------------------------------------------------- 1.5 */

type ScreenRow = { subgroup_key: string; attribute: string; verdict: string; heldout_narrowing: number | null; reason: string };
function screen(db: DatabaseSync, versionId: number): ScreenRow[] {
  return db.prepare(`SELECT subgroup_key, attribute, verdict, heldout_narrowing, reason FROM hierarchy_version_screen WHERE version_id = ?`).all(versionId) as unknown as ScreenRow[];
}

test('1.5 pack size clearly moves price, so the screen uses it and records the held-out narrowing of every attribute it tried', () => {
  const r = rng(15);
  const specs: Spec[] = [];
  for (const size of [100, 200, 400, 800]) {
    for (let i = 0; i < 30; i++) specs.push({ code: `P${size}-${i}`, brand: `b${i % 3}`, size, unit: 'g', price: Math.round(size * 2 * Math.exp(noise(r, 0.06))) });
  }
  const { db, prices } = build(specs);
  const v = rebuild(db, prices);
  const rows = screen(db, v.versionId);
  const used = rows.filter((x) => x.verdict === 'used');
  assert.equal(used.length, 1);
  assert.equal(used[0]!.attribute, 'pack_size');
  assert.ok(used[0]!.heldout_narrowing! > 0.5, `narrowing ${used[0]!.heldout_narrowing}`);
  const tried = new Set(rows.map((x) => x.attribute));
  for (const a of ['pack_size', 'size_unit', 'brand']) assert.ok(tried.has(a), `${a} was screened`);
  const g = ans(db, 'P800-0', v.versionId).group;
  assert.deepEqual(g.splitPath.map((p) => p.attribute), ['pack_size']);
  assert.ok(g.width! <= 1.5);
});

test('1.5 a brand premium clearly moves price, so brand is used', () => {
  const r = rng(16);
  const specs: Spec[] = [];
  for (const [brand, c] of [['house', 250], ['national', 500], ['luxury', 1500]] as const) {
    for (let i = 0; i < 30; i++) specs.push({ code: `${brand}${i}`, brand, size: 500, unit: 'g', price: Math.round(c * Math.exp(noise(r, 0.06))) });
  }
  const { db, prices } = build(specs);
  const v = rebuild(db, prices);
  const used = screen(db, v.versionId).filter((x) => x.verdict === 'used');
  assert.deepEqual(used.map((x) => x.attribute), ['brand']);
  assert.equal(ans(db, 'luxury2', v.versionId).group.nItems, 30);
});

test('1.5 when no attribute helps the screen says so: every attribute tried with its held-out number, and a none-helped row', () => {
  const { db, prices } = build(noiseCategory(300));
  const v = rebuild(db, prices);
  const rows = screen(db, v.versionId);
  assert.ok(!rows.some((x) => x.verdict === 'used'));
  const none = rows.filter((x) => x.attribute === '(none)');
  assert.equal(none.length, 1);
  assert.equal(none[0]!.verdict, 'none_helped');
  const named = new Set(rows.filter((x) => x.attribute !== '(none)').map((x) => x.attribute));
  for (const a of ['size_unit', 'pack_size', 'brand', 'nutriscore_grade', 'nova_group']) assert.ok(named.has(a), `${a} has a screen row`);
  const tried = rows.filter((x) => x.verdict === 'tried_not_helped');
  assert.ok(tried.length >= 2, `tried with a held-out number: ${tried.map((x) => x.attribute).join(',')}`);
  for (const t of tried) assert.ok(t.heldout_narrowing !== null, `${t.attribute} has its held-out number`);
  for (const t of rows.filter((x) => x.verdict === 'not_testable')) assert.ok(t.reason.length > 0, `${t.attribute} says why it could not be tested`);
});

/* ---------------------------------------------------------------- 1.7 */

test('1.7 the new tables are append-only, a tampered subgroup is caught by the hash, and 50 split answers replay after a later rebuild', () => {
  const r = rng(17);
  const specs: Spec[] = [];
  for (let i = 0; i < 70; i++) specs.push({ code: `G${i}`, brand: 'x', size: 500, unit: 'g', price: Math.round(400 * Math.exp(noise(r, 0.06))) });
  for (let i = 0; i < 70; i++) specs.push({ code: `M${i}`, brand: 'x', size: 500, unit: 'ml', price: Math.round(1200 * Math.exp(noise(r, 0.06))) });
  const { db, prices } = build(specs);
  const v1 = rebuild(db, prices);
  const pick = rng(99);
  const ids: number[] = [];
  for (let i = 0; i < 50; i++) {
    const s = specs[Math.floor(pick() * specs.length)]!;
    ids.push(recordLookup(db, lookupGroup(db, s.code, v1.versionId), AT));
  }
  // The product's attributes change after the answer was recorded; the recorded answer replays from what it used.
  db.exec(`UPDATE product SET size_unit = 'kg' WHERE code = 'G1'`);
  const p2 = new Map(prices);
  for (const [k, v] of p2) p2.set(k, v + 77);
  const v2 = rebuild(db, p2, { builtAt: '2026-10-14T00:00:00Z' });
  assert.notEqual(v1.versionId, v2.versionId);
  for (const id of ids) {
    const rp = replayLookup(db, id);
    assert.ok(rp.same, `answer ${id}: ${rp.recorded} vs ${rp.replayed}`);
  }
  for (const t of ['hierarchy_version_subgroup', 'hierarchy_version_split', 'hierarchy_version_screen']) {
    assert.throws(() => db.exec(`UPDATE ${t} SET version_id = version_id`), /append-only/, t);
    assert.throws(() => db.exec(`DELETE FROM ${t}`), /append-only/, t);
  }
  verifyVersion(db, v1.versionId);
  db.exec(`DROP TRIGGER hierarchy_version_subgroup_no_update`);
  db.exec(`UPDATE hierarchy_version_subgroup SET p50 = p50 + 1 WHERE version_id = ${v1.versionId}`);
  assert.throws(() => verifyVersion(db, v1.versionId), VersionTamperedError);
  verifyVersion(db, v2.versionId);
});

test('1.7 a changed screen row is caught by the hash too', () => {
  const r = rng(18);
  const specs: Spec[] = [];
  for (let i = 0; i < 70; i++) specs.push({ code: `G${i}`, brand: 'x', size: 500, unit: 'g', price: Math.round(400 * Math.exp(noise(r, 0.06))) });
  for (let i = 0; i < 70; i++) specs.push({ code: `M${i}`, brand: 'x', size: 500, unit: 'ml', price: Math.round(1200 * Math.exp(noise(r, 0.06))) });
  const { db, prices } = build(specs);
  const v = rebuild(db, prices);
  db.exec(`DROP TRIGGER hierarchy_version_screen_no_update`);
  db.exec(`UPDATE hierarchy_version_screen SET verdict = 'used' WHERE version_id = ${v.versionId} AND verdict <> 'used'`);
  assert.throws(() => verifyVersion(db, v.versionId), VersionTamperedError);
  assert.equal(placementCallCount() >= 0, true);
});
