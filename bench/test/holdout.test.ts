/**
 * 7.5 Held out by product AND date: no product and no date on both sides,
 * a leak audit that fails on any overlap (and catches a seeded leak), and the
 * Ontario tag the requirement weights to, reported for what the data supports.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadObservations } from '../src/data.ts';
import { buildPredictionKey, buildSaleKey } from '../src/keys.ts';
import { foldCounts, isFold, splitByProduct, splitByProductAndDate, splitByTime, type Fold } from '../src/split.ts';
import { assertNoLeak, dataSupport, isOntario, LeakFound, leakAudit, ontarioMix, weightedRate } from '../src/holdout.ts';
import { evaluate } from '../src/harness.ts';
import { categoryRangeModel } from '../src/baselines.ts';
import { catalogueDb, fixtureRow, noSealed, pricesDb, products, NEW, OLD, SALE_DAY } from './fixture.ts';

function both(extra: Parameters<typeof pricesDb>[0] = {}, seed = 1) {
  const obs = loadObservations(pricesDb(extra));
  const sales = buildSaleKey(obs);
  const f = splitByProductAndDate(obs, sales, noSealed(), { testFraction: 0.3, seed });
  assert.ok(isFold(f), JSON.stringify(f));
  return { obs, sales, fold: f as Fold };
}

test('7.5 the product-and-date split: no product and no date on both sides', () => {
  const { fold } = both();
  assert.equal(fold.name, 'by_product_and_date');
  assert.ok(fold.testPoints.length > 0);
  const testDates = new Set([...fold.testPoints.map((p) => p.seenOn), ...fold.testSales.map((s) => s.seenOn)]);
  for (const o of fold.train) {
    assert.ok(o.key === null || !fold.testKeys.has(o.key), `product ${o.key} on both sides`);
    assert.ok(!testDates.has(o.seenOn), `date ${o.seenOn} on both sides`);
    assert.ok(o.seenOn < fold.cutoff!, 'training holds a row on or after the cutoff');
  }
  for (const p of fold.testPoints) assert.ok(p.seenOn >= fold.cutoff!);
  assert.equal(leakAudit(fold).ok, true);
  assert.doesNotThrow(() => assertNoLeak(fold));
  // It counts: this is the holdout 7.5 asks for.
  assert.equal(foldCounts(fold.name), true);
});

test('7.5 the split is reproducible from its seed and moves products with it', () => {
  const a = both({}, 1).fold;
  const b = both({}, 1).fold;
  const c = both({}, 2).fold;
  assert.deepEqual([...a.testKeys].sort(), [...b.testKeys].sort());
  assert.notDeepEqual([...a.testKeys].sort(), [...c.testKeys].sort());
});

test('7.5 leak audit: a seeded product leak (a held-out product\'s older price in training) is caught, and only as a product leak', () => {
  const { obs, fold } = both();
  const k = [...fold.testKeys][0]!;
  const leaked = obs.find((o) => o.key === k && o.seenOn === OLD)!;
  assert.ok(leaked, 'fixture has the older row');
  const bad = { ...fold, train: [...fold.train, leaked] };
  const r = leakAudit(bad);
  assert.equal(r.ok, false);
  assert.deepEqual(r.products, [k]);
  assert.deepEqual(r.dates, []);
  assert.throws(() => assertNoLeak(bad), (e: unknown) => e instanceof LeakFound && e.message.includes(k));
});

test('7.5 leak audit: a seeded date leak (another product priced on a scoring day) is caught, and only as a date leak', () => {
  const { obs, fold } = both();
  const leaked = obs.find((o) => o.key !== null && !fold.testKeys.has(o.key) && o.seenOn === NEW)!;
  const r = leakAudit({ ...fold, train: [...fold.train, leaked] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.products, []);
  assert.deepEqual(r.dates, [NEW]);
});

test('7.5 leak audit: a seeded leak through the sale queries is caught too', () => {
  const { obs, fold } = both();
  // A training row from the sale day of a product that is not held out: a date leak via testSales.
  const saleDay = obs.find((o) => o.key !== null && !fold.testKeys.has(o.key) && o.seenOn === SALE_DAY)!;
  assert.ok(fold.testSales.length > 0 && fold.testSales.every((s) => s.seenOn === SALE_DAY));
  const r = leakAudit({ ...fold, train: [...fold.train, saleDay] });
  assert.deepEqual(r.dates, [SALE_DAY]);
});

test('7.5 the older splits each hold out only one thing, and the audit says which', () => {
  const obs = loadObservations(pricesDb());
  const pred = buildPredictionKey(obs);
  const sales = buildSaleKey(obs);
  const byProduct = splitByProduct(obs, pred, sales, noSealed(), 0.5, 1) as Fold;
  const byTime = splitByTime(obs, sales, noSealed()) as Fold;
  const p = leakAudit(byProduct);
  assert.equal(p.products.length, 0);
  assert.ok(p.dates.length > 0, 'by product shares dates with training by design');
  const t = leakAudit(byTime);
  assert.equal(t.dates.length, 0);
  assert.ok(t.products.length > 0, 'by time shares products with training by design');
  // Asked only about what each split promises, both are clean.
  assert.equal(leakAudit(byProduct, ['product']).ok, true);
  assert.equal(leakAudit(byTime, ['date']).ok, true);
});

test('7.5 impossible when there is one date, said in words', () => {
  const obs = loadObservations(pricesDb({ withSales: false })).filter((o) => o.seenOn === NEW);
  const f = splitByProductAndDate(obs, [], noSealed());
  assert.equal(isFold(f), false);
  assert.match((f as { impossible: string }).impossible, /date/);
});

test('7.5 a model scored on the product-and-date fold never sees the held-out product or the scoring day', () => {
  const { fold } = both();
  const run = evaluate(categoryRangeModel(), fold, { catalogue: catalogueDb() });
  assert.equal(run.ran, true);
  assert.equal(run.counts, true);
  assert.ok(run.scores!.points > 0);
});

test('7.5 Ontario: rows are tagged by region; no Ontario rows means weighting is not possible and is said so', () => {
  assert.equal(isOntario('Ontario'), true);
  assert.equal(isOntario(' ON '), true);
  assert.equal(isOntario('on'), true);
  assert.equal(isOntario('Toronto, Ontario'), true);
  assert.equal(isOntario('Alberta'), false);
  assert.equal(isOntario(null), false);

  const { obs, fold } = both();
  const none = ontarioMix(fold, obs);
  assert.equal(none.ontarioPoints, 0);
  assert.equal(none.weightable, false);
  assert.match(none.note, /no Ontario/i);

  // Two of the shops are in Ontario on the newer day for every product.
  const extra = products().flatMap((p) =>
    ['E', 'F'].map((seller) => fixtureRow({ code: p.code, seller, sellerSku: `${seller}-${p.code}`, priceCents: p.base, seenOn: NEW, region: 'Ontario' })),
  );
  const on = both({ extra });
  const mix = ontarioMix(on.fold, on.obs);
  assert.ok(mix.ontarioPoints > 0);
  assert.equal(mix.ontarioPoints + mix.otherPoints, on.fold.testPoints.length);
  assert.ok(Math.abs(mix.ontarioShare - mix.ontarioPoints / on.fold.testPoints.length) < 1e-12);
});

test('7.5 weightedRate: weights the Ontario points to a target share; with none it refuses rather than pretending', () => {
  // 2 Ontario hits of 2, 0 other hits of 8: raw 20%; Ontario-only 100%; at a 50% target, 50%.
  const ontario = [true, true, false, false, false, false, false, false, false, false];
  const hit = [true, true, false, false, false, false, false, false, false, false];
  assert.equal(weightedRate(hit, ontario, 1), 1);
  assert.equal(weightedRate(hit, ontario, 0.5), 0.5);
  assert.ok(Math.abs(weightedRate(hit, ontario, 0)! - 0) < 1e-12);
  assert.equal(weightedRate(hit, ontario.map(() => false), 1), null);
});

test('7.5 dataSupport counts products, dates, regions and Ontario rows, and says whether the holdout is possible', () => {
  const obs = loadObservations(pricesDb());
  const s = dataSupport(obs, noSealed());
  assert.equal(s.products, 30);
  assert.deepEqual(s.dates, [OLD, NEW, SALE_DAY]);
  assert.equal(s.ontarioRows, 0);
  assert.equal(s.productAndDate.possible, true);
  assert.ok(s.productAndDate.testProducts! > 0 && s.productAndDate.trainRows! > 0);
  const one = dataSupport(obs.filter((o) => o.seenOn === NEW), noSealed());
  assert.equal(one.productAndDate.possible, false);
});
