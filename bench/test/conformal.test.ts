import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { loadObservations, readCatalogueInfo } from '../src/data.ts';
import { buildPredictionKey, buildSaleKey } from '../src/keys.ts';
import { isFold, splitByProduct, splitByTime, type Fold } from '../src/split.ts';
import { evaluate, evaluateAsync, trainingDatabase, type Model, type Query, type TrainContext } from '../src/harness.ts';
import { rng } from '../src/audit.ts';
import { openPrices, recordObservation } from '../../price/src/store.ts';
import { conformal, conformalModels, conformalQuantile, nonconformity, scaleInterval } from '../src/conformal.ts';
import { selectedMethods } from '../src/run.ts';
import type { Interval } from '../src/score.ts';
import { fixtureRow, noSealed } from './fixture.ts';

/* A synthetic market with a known truth. Each product has a level; its 4 shops price it within a few percent.
   The base method knows each product's level only up to a per-product error (its sd depends on the leaf), and
   returns a range of a chosen half width around that noisy centre: a base we can make under- or over-covering. */

interface Item {
  code: string;
  leaf: string;
  level: number;
  centre: number;
  date: string;
}

const normal = (rand: () => number) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

function market(spec: readonly { leaf: string; n: number; sd: number }[], seed = 7, spreadDates = false) {
  const rand = rng(seed);
  const items: Item[] = [];
  let k = 0;
  for (const s of spec) {
    for (let i = 0; i < s.n; i++, k++) {
      const level = Math.round(Math.exp(Math.log(600) + 0.6 * normal(rand)));
      const date = spreadDates ? `2026-09-${String(1 + (k % 25)).padStart(2, '0')}` : '2026-09-01';
      items.push({ code: `88${String(k).padStart(10, '0')}`, leaf: s.leaf, level, centre: level * Math.exp(s.sd * normal(rand)), date });
    }
  }
  const db = openPrices(':memory:');
  for (const it of items) {
    for (const shop of ['A', 'B', 'C', 'D']) {
      const price = () => Math.round(it.level * Math.exp(0.08 * normal(rand)));
      // With spread dates every product is seen twice (July, then the spread September date), so a by-time fold has known products.
      if (spreadDates) recordObservation(db, fixtureRow({ code: it.code, seller: shop, sellerSku: `${shop}-${it.code}`, priceCents: price(), seenOn: it.date.replace('-09-', '-07-') }));
      recordObservation(db, fixtureRow({ code: it.code, seller: shop, sellerSku: `${shop}-${it.code}`, priceCents: price(), seenOn: it.date }));
    }
  }
  const cat = new DatabaseSync(':memory:');
  cat.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, quantity TEXT, size_value REAL, size_unit TEXT, category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  const ins = cat.prepare('INSERT INTO product (code, name, quantity, size_value, size_unit, category_path, leaf_category) VALUES (?,?,?,?,?,?,?)');
  for (const it of items) ins.run(it.code, `item ${it.code}`, '500 g', 500, 'g', JSON.stringify(['en:root', it.leaf]), it.leaf);
  const obs = loadObservations(db);
  return { items, obs, catalogue: cat, centreOf: new Map(items.map((i) => [i.code.replace(/^0+/, ''), i.centre])) };
}

type Market = ReturnType<typeof market>;

interface Spy {
  fitKeys: Set<string>;
  fitMaxDate: string;
  queried: { key: string; asOf: string }[];
}

/** A base method: centre = the product's noisy level, range = centre * e^-h .. centre * e^h. Records what it was shown. */
function baseModel(m: Market, h: number, claim: number, spy?: Spy, asyncAnswers = false): Model {
  const answer = (q: Query): Interval | null => {
    spy?.queried.push({ key: q.key, asOf: q.asOf });
    const c = m.centreOf.get(q.key);
    if (c === undefined) return null;
    return { lowCents: Math.round(c * Math.exp(-h)), highCents: Math.round(c * Math.exp(h)), midCents: Math.round(c) };
  };
  const seen = (ctx: TrainContext) => {
    if (!spy) return;
    spy.fitKeys = new Set(ctx.observations.map((o) => o.key!).filter(Boolean));
    spy.fitMaxDate = ctx.observations.map((o) => o.seenOn).sort().at(-1) ?? '';
  };
  return {
    name: 'synthetic',
    description: 'synthetic base',
    claimedCoverage: claim,
    runnable: true,
    fit(ctx) {
      if (asyncAnswers) throw new Error('async');
      seen(ctx);
      return answer;
    },
    ...(asyncAnswers
      ? {
          fitAsync(ctx: TrainContext) {
            seen(ctx);
            return async (q: Query) => answer(q);
          },
        }
      : {}),
  };
}

const newSpy = (): Spy => ({ fitKeys: new Set(), fitMaxDate: '', queried: [] });

/** The |ln(real / centre)| quantile over every point: the half width at which the base covers exactly that share. */
function halfWidthFor(m: Market, share: number): number {
  const errs = buildPredictionKey(m.obs)
    .flatMap((p) => p.points)
    .map((p) => Math.abs(Math.log(p.cents / m.centreOf.get(p.key)!)))
    .sort((a, b) => a - b);
  return errs[Math.floor(errs.length * share)]!;
}

function productFold(m: Market): Fold {
  const f = splitByProduct(m.obs, buildPredictionKey(m.obs), buildSaleKey(m.obs), noSealed(), 0.5, 1);
  assert.ok(isFold(f));
  return f;
}

const ctxOf = (f: Fold, m: Market): TrainContext => ({ fold: f.name, observations: f.train, prices: trainingDatabase(f.train), catalogue: m.catalogue });

function queryOf(m: Market, key: string, asOf: string): Query {
  return { key, code: key, asOf, info: readCatalogueInfo(m.catalogue, [key]).get(key) ?? null };
}

/** Share of the fold's held-out points that the predictor's range contains, and the median ln(high / low). */
function heldOut(f: Fold, m: Market, predict: (q: Query) => Interval | null) {
  let hit = 0;
  let n = 0;
  const widths: number[] = [];
  for (const p of f.testPoints) {
    const a = predict(queryOf(m, p.key, p.seenOn));
    if (!a) continue;
    n++;
    if (p.cents >= a.lowCents && p.cents <= a.highCents) hit++;
    widths.push(Math.log(a.highCents / a.lowCents));
  }
  return { coverage: hit / n, n, medianWidth: widths.sort((a, b) => a - b)[Math.floor(widths.length / 2)]! };
}

/* ----------------------------------------------------------------- the maths */

test('nonconformity is the log scale needed to reach the real price', () => {
  // [100, 400] has centre 200 and half width ln 2 in log space.
  assert.ok(Math.abs(nonconformity(100, 400, 200)) < 1e-12);
  assert.ok(Math.abs(nonconformity(100, 400, 400) - 1) < 1e-12);
  assert.ok(Math.abs(nonconformity(100, 400, 50) - 2) < 1e-9, 'the real price is two half widths below the centre');
  assert.equal(nonconformity(100, 100, 120), Infinity);
  assert.equal(nonconformity(100, 100, 100), 0);
});

test('the conformal quantile is the ceil((n+1)*claim)-th smallest score, and Infinity when there are too few', () => {
  const s = Array.from({ length: 19 }, (_, i) => i + 1); // 1..19
  assert.equal(conformalQuantile(s, 0.5), 10); // ceil(20 * 0.5) = 10
  assert.equal(conformalQuantile(s, 0.9), 18); // ceil(18) = 18
  assert.equal(conformalQuantile(s, 0.99), Infinity); // ceil(19.8) = 20 > 19
  assert.equal(conformalQuantile([], 0.5), Infinity);
});

test('scaling keeps the centre and the median, and scales the 50% band by its own factor', () => {
  const a = scaleInterval({ lowCents: 100, highCents: 400, midCents: 150 }, 0.5, null);
  assert.deepEqual(a, { lowCents: 141, highCents: 283, midCents: 150 }); // centre 200, half width ln2 * 0.5
  const b = scaleInterval({ lowCents: 100, highCents: 400, midCents: 150 }, 1, 0.5);
  assert.deepEqual([b.lowCents, b.highCents, b.low50Cents, b.high50Cents], [100, 400, 141, 283]);
});

/* ------------------------------------------------------------------ coverage */

test('an under-covering base (25% at claim 50%) reaches the claim on held-out products after wrapping', () => {
  const m = market([{ leaf: 'en:leaf-a', n: 800, sd: 0.3 }]);
  const f = productFold(m);
  const h = halfWidthFor(m, 0.25);
  const base = baseModel(m, h, 0.5);
  const before = heldOut(f, m, base.fit(ctxOf(f, m)));
  assert.ok(Math.abs(before.coverage - 0.25) < 0.05, `base coverage ${before.coverage}`);
  const wrapped = conformal(base, { claim: 0.5, stratifyBy: 'none' });
  const after = heldOut(f, m, wrapped.fit(ctxOf(f, m)));
  assert.ok(Math.abs(after.coverage - 0.5) < 0.06, `wrapped coverage ${after.coverage}`);
  assert.ok(after.medianWidth > before.medianWidth, 'the range was widened');
  const fit = (wrapped.report!() as { conformal: { globalFactor: number; finite: boolean } }).conformal;
  assert.ok(fit.finite && fit.globalFactor > 1.5, `factor ${fit.globalFactor}`);
});

test('an over-wide base (about 97% at claim 50%) is narrowed to the claim', () => {
  const m = market([{ leaf: 'en:leaf-a', n: 800, sd: 0.3 }]);
  const f = productFold(m);
  const base = baseModel(m, halfWidthFor(m, 0.97), 0.5);
  const before = heldOut(f, m, base.fit(ctxOf(f, m)));
  assert.ok(before.coverage > 0.93, `base coverage ${before.coverage}`);
  const wrapped = conformal(base, { claim: 0.5, stratifyBy: 'none' });
  const after = heldOut(f, m, wrapped.fit(ctxOf(f, m)));
  assert.ok(Math.abs(after.coverage - 0.5) < 0.06, `wrapped coverage ${after.coverage}`);
  assert.ok(after.medianWidth < before.medianWidth * 0.5, `width ${before.medianWidth} -> ${after.medianWidth}`);
  assert.ok((wrapped.report!() as { conformal: { globalFactor: number } }).conformal.globalFactor < 0.5);
});

test('a claim of 0.8 holds at 0.8, and a non-50% claim also gets a 50% band so the 50% comparison stays measurable', () => {
  const m = market([{ leaf: 'en:leaf-a', n: 800, sd: 0.3 }]);
  const f = productFold(m);
  const wrapped = conformal(baseModel(m, halfWidthFor(m, 0.25), 0.8), { claim: 0.8, stratifyBy: 'none' });
  const predict = wrapped.fit(ctxOf(f, m));
  assert.equal(wrapped.claimedCoverage, 0.8);
  const after = heldOut(f, m, predict);
  assert.ok(Math.abs(after.coverage - 0.8) < 0.06, `wrapped coverage ${after.coverage}`);
  const p = f.testPoints[0]!;
  const a = predict(queryOf(m, p.key, p.seenOn))!;
  assert.ok(a.low50Cents !== undefined && a.low50Cents > a.lowCents && a.high50Cents! < a.highCents);
});

/* ------------------------------------------------------------- the test side */

test('the test side is never used for calibration: only training products are asked or fitted, and the fold guard still holds', () => {
  const m = market([{ leaf: 'en:leaf-a', n: 400, sd: 0.3 }]);
  const f = productFold(m);
  const spy = newSpy();
  const wrapped = conformal(baseModel(m, 0.2, 0.5, spy), { claim: 0.5, stratifyBy: 'none' });
  wrapped.fit(ctxOf(f, m));
  assert.ok(spy.queried.length > 20, 'calibration queries were asked');
  const trainKeys = new Set(f.train.map((o) => o.key!).filter(Boolean));
  for (const q of spy.queried) {
    assert.ok(!f.testKeys.has(q.key), `calibration asked about test product ${q.key}`);
    assert.ok(trainKeys.has(q.key), `calibration asked about a product outside the training side ${q.key}`);
    assert.ok(!spy.fitKeys.has(q.key), 'a calibration product was also in the fit part');
  }
  for (const k of spy.fitKeys) assert.ok(!f.testKeys.has(k), `the base was fitted on test product ${k}`);
  assert.ok(spy.fitKeys.size > 0 && spy.fitKeys.size < trainKeys.size);
  // Through the harness: an issued fold runs and records the fitted factors; a copy of a fold is refused.
  const run = evaluate(wrapped, f, { catalogue: m.catalogue });
  assert.equal(run.ran, true);
  assert.equal(run.model, 'conformal_synthetic');
  const conf = (run.extra as { conformal: { globalFactor: number; nCalibrationPoints: number; mode: string } }).conformal;
  assert.ok(conf.globalFactor > 0 && conf.nCalibrationPoints > 20);
  assert.equal(conf.mode, 'product');
  assert.throws(() => evaluate(wrapped, { ...f }, { catalogue: m.catalogue }), /not made by split\.ts/);
});

test('by time, the calibration points are later than everything the base was fitted on', () => {
  const m = market([{ leaf: 'en:leaf-a', n: 500, sd: 0.3 }], 11, true);
  const f = splitByTime(m.obs, buildSaleKey(m.obs), noSealed());
  assert.ok(isFold(f), 'time fold');
  const spy = newSpy();
  const wrapped = conformal(baseModel(m, 0.2, 0.5, spy), { claim: 0.5, stratifyBy: 'none' });
  wrapped.fit(ctxOf(f, m));
  assert.ok(spy.queried.length > 10);
  assert.ok(spy.fitMaxDate !== '');
  for (const q of spy.queried) assert.ok(q.asOf > spy.fitMaxDate, `calibration date ${q.asOf} is not after the fit part's last date ${spy.fitMaxDate}`);
  assert.match((wrapped.report!() as { conformal: { mode: string } }).conformal.mode, /^time/);
});

/* ------------------------------------------------------------ per category */

test('per-category factors differ where the base errs differently, and a thin category falls back to the global factor', () => {
  const m = market([
    { leaf: 'en:calm', n: 450, sd: 0.1 },
    { leaf: 'en:wild', n: 450, sd: 0.5 },
    { leaf: 'en:thin', n: 5, sd: 0.3 },
  ]);
  const f = productFold(m);
  const wrapped = conformal(baseModel(m, 0.25, 0.5), { claim: 0.5, stratifyBy: 'leaf_category', minCategoryCount: 30 });
  const predict = wrapped.fit(ctxOf(f, m));
  const fit = (wrapped.report!() as { conformal: { globalFactor: number; perCategory: Record<string, { n: number; factor: number }>; thinCategories: Record<string, number> } }).conformal;
  assert.ok(fit.perCategory['en:calm'] && fit.perCategory['en:wild']);
  assert.ok(fit.perCategory['en:wild']!.factor > fit.perCategory['en:calm']!.factor * 1.5, JSON.stringify(fit.perCategory));
  assert.equal(fit.perCategory['en:thin'], undefined);
  assert.ok(fit.thinCategories['en:thin'] !== undefined && fit.thinCategories['en:thin']! < 30);
  // The thin category's ranges are scaled by the global factor.
  const thin = m.items.find((i) => i.leaf === 'en:thin')!;
  const key = thin.code.replace(/^0+/, '');
  const a = predict(queryOf(m, key, '2026-09-01'))!;
  const baseWidth = 2 * 0.25;
  assert.ok(Math.abs(Math.log(a.highCents / a.lowCents) / baseWidth - fit.globalFactor) < 0.02, `${Math.log(a.highCents / a.lowCents) / baseWidth} vs ${fit.globalFactor}`);
  // A calm product's range uses the calm factor, not the global one.
  const calm = m.items.find((i) => i.leaf === 'en:calm')!;
  const c = predict(queryOf(m, calm.code.replace(/^0+/, ''), '2026-09-01'))!;
  assert.ok(Math.abs(Math.log(c.highCents / c.lowCents) / baseWidth - fit.perCategory['en:calm']!.factor) < 0.02);
});

/* --------------------------------------------------------------------- async */

test('an async base (like live_estimate) is calibrated through evaluateAsync, and the sync path refuses it', async () => {
  const m = market([{ leaf: 'en:leaf-a', n: 800, sd: 0.3 }]);
  const f = productFold(m);
  const wrapped = conformal(baseModel(m, halfWidthFor(m, 0.25), 0.8, undefined, true), { claim: 0.8, stratifyBy: 'none' });
  assert.throws(() => evaluate(wrapped, f, { catalogue: m.catalogue }), /evaluateAsync/);
  assert.throws(() => wrapped.fit(ctxOf(f, m)), /evaluateAsync/);
  const predict = wrapped.fitAsync!(ctxOf(f, m));
  let hit = 0;
  let n = 0;
  for (const p of f.testPoints) {
    const a = await predict(queryOf(m, p.key, p.seenOn));
    if (!a) continue;
    n++;
    if (p.cents >= a.lowCents && p.cents <= a.highCents) hit++;
  }
  assert.ok(Math.abs(hit / n - 0.8) < 0.06, `async wrapped coverage ${hit / n}`);
  const small = market([{ leaf: 'en:leaf-a', n: 120, sd: 0.3 }], 3);
  const run = await evaluateAsync(conformal(baseModel(small, 0.2, 0.8, undefined, true), { claim: 0.8, stratifyBy: 'none' }), productFold(small), { catalogue: small.catalogue });
  assert.equal(run.ran, true);
  assert.ok((run.extra as { conformal: { finite: boolean } }).conformal.finite);
});

test('too few calibration points: the factor falls back to 1 and the record says it is not finite', () => {
  const m = market([{ leaf: 'en:leaf-a', n: 40, sd: 0.3 }]);
  const f = productFold(m);
  const wrapped = conformal(baseModel(m, 0.2, 0.5), { claim: 0.9, stratifyBy: 'none', calibShare: 0.05 });
  wrapped.fit(ctxOf(f, m));
  const fit = (wrapped.report!() as { conformal: { globalFactor: number; finite: boolean; nScored: number } }).conformal;
  assert.equal(fit.globalFactor, 1);
  assert.equal(fit.finite, false);
});

/* ---------------------------------------------------------- registration */

test('the conformal methods are named by --methods and are not run by default', () => {
  const dflt = selectedMethods(undefined);
  assert.deepEqual([...dflt.names].sort(), ['category_median', 'category_range', 'claude_guess', 'price_tree']);
  assert.equal(dflt.conformalLive, false);
  const named = selectedMethods('conformal_category_range,conformal_price_tree,conformal_live_estimate');
  assert.equal(named.conformalLive, true);
  assert.equal(named.live, false);
  assert.deepEqual(conformalModels().map((x) => x.name), ['conformal_category_range', 'conformal_price_tree']);
  assert.throws(() => selectedMethods('conformal_nope'), /unknown method/);
});
