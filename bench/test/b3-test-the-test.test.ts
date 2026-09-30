/**
 * B3. Test the test. The bench is not used for any decision until all of these hold.
 *
 * The plan's four:
 *   1. a shuffled-price model fails;
 *   2. a model returning the whole category fails on width;
 *   3. a planted wrong row in the key gets flagged;
 *   4. a perfect oracle passes.
 * Added after the 2026-09-28 audit of the bench, because the four alone let a
 * broken split or a gamed gate through:
 *   5. models that learn ONLY from the training rows, used as leak canaries: if
 *      a split lets a held-out price into training, these answer, and the tests
 *      turn red (the oracle cannot show this: it reads the truth directly);
 *   6. a model claiming 1% coverage fails; a model that skips most items fails;
 *   7. a model good on everything except sale prices fails ONLY on sale_low,
 *      so removing that check from the gate turns this red;
 *   8. a stateful model that games the query order fails;
 *   9. the audit's reference leaves the row out (a wrong row cannot vouch for itself).
 * Everything runs through the same loaders, keys, splits, harness and gate as
 * the real run, on a synthetic market whose truth is known.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latestPerShop, loadObservations } from '../src/data.ts';
import { buildPredictionKey, buildSaleKey, type PredictionItem } from '../src/keys.ts';
import { auditPredictionKey, sampleForReread } from '../src/audit.ts';
import { isFold, splitByProduct, splitByTime, type Fold } from '../src/split.ts';
import { evaluate, overallVerdict, type Model } from '../src/harness.ts';
import type { Interval } from '../src/score.ts';
import { catalogueDb, pricesDb, fixtureRow, products, noSealed, NEW, OLD, SALE_DAY } from './fixture.ts';

function setup() {
  const obs = loadObservations(pricesDb());
  const pred = buildPredictionKey(obs);
  const sales = buildSaleKey(obs);
  const guard = noSealed();
  const byProduct = splitByProduct(obs, pred, sales, guard, 0.5, 1);
  const byTime = splitByTime(obs, sales, guard);
  assert.ok(isFold(byProduct) && isFold(byTime));
  return { obs, pred, sales, byProduct: byProduct as Fold, byTime: byTime as Fold, catalogue: catalogueDb() };
}

function truthRange(pred: readonly PredictionItem[]): Map<string, Interval> {
  const m = new Map<string, Interval>();
  for (const p of pred) {
    const c = p.points.map((x) => x.cents).sort((a, b) => a - b);
    m.set(p.key, { lowCents: c[0]!, highCents: c[c.length - 1]!, midCents: c[Math.floor((c.length - 1) / 2)]! });
  }
  return m;
}

/* ---------------------------------------------------------- the plan's four */

test('B3.1 a shuffled-price model fails the gate', () => {
  const { pred, byProduct, catalogue } = setup();
  const truth = truthRange(pred);
  const keys = pred.map((p) => p.key);
  const shuffled = new Map(keys.map((k, i) => [k, truth.get(keys[(i + 7) % keys.length]!)!]));
  const model: Model = { name: 'shuffled', description: "another product's true range", claimedCoverage: 0.5, runnable: true, fit: () => (q) => shuffled.get(q.key) ?? null };
  const run = evaluate(model, byProduct, { catalogue });
  assert.equal(run.gate!.pass, false);
  assert.ok(run.gate!.failures.includes('calibration'), JSON.stringify(run.gate));
  assert.ok(run.scores!.hitRate! < 0.2, `shuffled hit rate ${run.scores!.hitRate}`);
});

test('B3.2 a whole-category model fails on width', () => {
  const { byProduct, catalogue } = setup();
  const leafOf = new Map(products().map((p) => [p.code, p.leaf]));
  const model: Model = {
    name: 'whole_category',
    description: 'min to max of every training price in the leaf',
    claimedCoverage: 1,
    runnable: true,
    fit(ctx) {
      const span = new Map<string, { lo: number; hi: number }>();
      for (const o of ctx.observations) {
        if (o.isSale || !o.code) continue;
        const leaf = leafOf.get(o.code)!;
        const s = span.get(leaf) ?? { lo: Infinity, hi: 0 };
        span.set(leaf, { lo: Math.min(s.lo, o.cents), hi: Math.max(s.hi, o.cents) });
      }
      return (q) => {
        const s = span.get(q.info?.leaf ?? '');
        return s ? { lowCents: s.lo, highCents: s.hi, midCents: Math.round(Math.sqrt(s.lo * s.hi)) } : null;
      };
    },
  };
  const run = evaluate(model, byProduct, { catalogue });
  assert.equal(run.gate!.pass, false);
  assert.ok(run.gate!.failures.includes('width_p90'), JSON.stringify(run.gate));
});

test('B3.3 a planted wrong row in the key is flagged by the audit, and only it', () => {
  const target = products()[4]!;
  const planted = fixtureRow({ code: target.code, seller: 'E', sellerSku: `E-${target.code}`, priceCents: target.base * 10, seenOn: NEW });
  const obs = loadObservations(pricesDb({ extra: [planted] }));
  const rows = auditPredictionKey(buildPredictionKey(obs));
  const flagged = rows.filter((r) => r.flagged);
  assert.equal(flagged.length, 1, JSON.stringify(flagged));
  assert.equal(flagged[0]!.seller, 'E');
  const sheet = sampleForReread(rows, 50);
  assert.equal(sheet.length, 50);
  assert.ok(sheet.some((r) => r.seller === 'E'));
});

test('B3.4 a perfect oracle passes the verdict that counts (by time); by product it misses only B4, too few products', () => {
  const { pred, byProduct, byTime, catalogue } = setup();
  const runs = [];
  for (const fold of [byProduct, byTime]) {
    const pts = new Map<string, number[]>();
    for (const p of fold.testPoints) (pts.get(p.key) ?? pts.set(p.key, []).get(p.key)!).push(p.cents);
    const whole = truthRange(pred);
    const oracle: Model = {
      name: 'oracle',
      description: 'the true min to max, and the true middle two as its 50% band',
      claimedCoverage: 1,
      runnable: true,
      fit: () => (q) => {
        const c = [...(pts.get(q.key) ?? [])].sort((a, b) => a - b);
        if (c.length < 4) return whole.get(q.key) ?? null;
        return { lowCents: c[0]!, highCents: c[3]!, midCents: c[1]!, low50Cents: c[1]!, high50Cents: c[2]! };
      },
    };
    const run = evaluate(oracle, fold, { catalogue });
    runs.push(run);
    assert.equal(run.scores!.hitRate, 1);
    assert.equal(run.scores!.sale.saleLowRate, 1);
    assert.equal(run.scores!.sale.regularFalseLowRate, 0);
    if (fold.name === 'by_time') assert.equal(run.gate!.pass, true, `${fold.name}: ${JSON.stringify(run.gate)}`);
    else assert.deepEqual(run.gate!.failures, ['baseline_not_measured'], JSON.stringify(run.gate!.notes));
  }
  assert.equal(overallVerdict(runs).get('oracle')!.pass, true);
});

/* ------------------------------------------------ 5. leak canaries (splits) */

/** Learns only from its training rows: each shop's latest regular price on or before the as-of date. */
function ownHistory(): Model {
  return {
    name: 'own_history',
    description: 'min to max of the product own training prices, latest per shop, on or before the as-of date',
    claimedCoverage: 0.5,
    runnable: true,
    fit(ctx) {
      return (q) => {
        const rows = latestPerShop(ctx.observations.filter((o) => o.key === q.key && !o.isSale && o.seenOn <= q.asOf));
        if (rows.length === 0) return null;
        const c = rows.map((r) => r.cents).sort((a, b) => a - b);
        return { lowCents: c[0]!, highCents: c[c.length - 1]!, midCents: c[Math.floor((c.length - 1) / 2)]! };
      };
    },
  };
}

/** Answers only when training holds a price of this product seen ON the as-of day: a correct split never allows that. */
function sameDay(): Model {
  return {
    name: 'same_day_canary',
    description: 'answers only from a training row of the same product on the scoring day',
    claimedCoverage: 1,
    runnable: true,
    fit(ctx) {
      return (q) => {
        const rows = ctx.observations.filter((o) => o.key === q.key && o.seenOn === q.asOf);
        if (!rows.length) return null;
        const c = rows.map((r) => r.cents).sort((a, b) => a - b);
        return { lowCents: c[0]!, highCents: c[c.length - 1]!, midCents: c[0]! };
      };
    },
  };
}

test('B3.5a by product: a model that learns only from training rows has nothing to say about a held-out product', () => {
  const { byProduct, catalogue } = setup();
  const run = evaluate(ownHistory(), byProduct, { catalogue });
  assert.equal(run.scores!.scored, 0, 'a held-out product had prices on the training side');
  assert.equal(run.scores!.sale.scored, 0, 'a held-out product\'s sale had its regular prices on the training side');
  assert.ok(run.gate!.failures.includes('nothing_scored'));
});

test('B3.5b by product and by time: the same-day canary never answers', () => {
  const { byProduct, byTime, catalogue } = setup();
  for (const fold of [byProduct, byTime]) {
    const run = evaluate(sameDay(), fold, { catalogue });
    assert.equal(run.scores!.scored + run.scores!.sale.scored, 0, `${fold.name}: training holds a price from a scoring day`);
  }
});

test('B3.5c by time: learns on the older day only, so shop D (up 1% past the old max) is a real miss', () => {
  const { byTime, catalogue } = setup();
  assert.equal(byTime.cutoff, NEW);
  assert.ok(byTime.train.every((o) => o.seenOn === OLD), 'training holds a row from on or after the cutoff');
  const run = evaluate(ownHistory(), byTime, { catalogue });
  assert.equal(run.scores!.answerRate, 1);
  // Old prices at 0.97..1.08 of base, new ones 1% higher: A, B, C land inside, D (1.0908) does not.
  assert.equal(run.scores!.hitRate, 0.75);
});

test('B3.5d by time: which products are scored comes from the training side only', () => {
  const guard = noSealed();
  // A product first priced after the cutoff (at 4 shops) is not scored: nothing was known about it before.
  const extra = ['A', 'B', 'C', 'D'].map((seller) => fixtureRow({ code: '9990000000017', seller, sellerSku: `${seller}-new`, priceCents: 500, seenOn: NEW }));
  const obs = loadObservations(pricesDb({ extra }));
  const f = splitByTime(obs, buildSaleKey(obs), guard);
  assert.ok(isFold(f));
  assert.equal(f.testPoints.some((p) => p.key === '9990000000017'), false);
});

/* --------------------------------------------------- 6-8. the gate is not gameable */

test('B3.6a a model claiming 1% coverage fails, whatever else it does', () => {
  const { pred, byProduct, catalogue } = setup();
  const truth = truthRange(pred);
  const model: Model = { name: 'low_claim', description: 'true range, claims 1%', claimedCoverage: 0.01, runnable: true, fit: () => (q) => truth.get(q.key) ?? null };
  const run = evaluate(model, byProduct, { catalogue });
  assert.equal(run.gate!.pass, false);
  assert.ok(run.gate!.failures.includes('claim_too_low'), JSON.stringify(run.gate));
});

test('B3.6b a perfect answer on a few items and a skip on the rest fails', () => {
  const { pred, byProduct, catalogue } = setup();
  const truth = truthRange(pred);
  const few = new Set([...byProduct.testKeys].slice(0, 2));
  const model: Model = { name: 'cherry_picker', description: 'oracle on 2 products, skips the rest', claimedCoverage: 1, runnable: true, fit: () => (q) => (few.has(q.key) ? truth.get(q.key)! : null) };
  const run = evaluate(model, byProduct, { catalogue });
  assert.equal(run.gate!.pass, false);
  assert.ok(run.gate!.failures.includes('too_many_skips'), JSON.stringify(run.gate));
  assert.ok(run.scores!.hitRate! < 0.5, 'a skip must count as a miss');
});

test('B3.7 good on everything but sale prices: fails on sale_low and nothing else', () => {
  const { pred, byProduct, catalogue } = setup();
  const truth = truthRange(pred);
  // The true range stretched down to 60% of its low end: still holds every regular price, still under 3x, but a 30%-off sale sits inside.
  const model: Model = {
    name: 'sale_blind',
    description: 'true range, low end dropped to 60%',
    claimedCoverage: 1,
    runnable: true,
    fit: () => (q) => {
      const t = truth.get(q.key);
      return t ? { lowCents: Math.round(t.lowCents * 0.6), highCents: t.highCents, midCents: t.midCents } : null;
    },
  };
  const run = evaluate(model, byProduct, { catalogue });
  // By product the fixture has too few products for B4 (not measured); every other check passes but sale_low.
  assert.deepEqual(run.gate!.failures.filter((f) => !f.startsWith('baseline') && f !== 'not_better_than_baseline'), ['sale_low'], JSON.stringify(run.gate));
});

test('B3.7b a model that calls regular prices low fails on regular_reads_low', () => {
  const { pred, byProduct, catalogue } = setup();
  const truth = truthRange(pred);
  const model: Model = {
    name: 'all_low',
    description: 'a range sitting above every price',
    claimedCoverage: 1,
    runnable: true,
    fit: () => (q) => {
      const t = truth.get(q.key);
      return t ? { lowCents: t.highCents * 2, highCents: t.highCents * 3, midCents: t.highCents * 2 } : null;
    },
  };
  const run = evaluate(model, byProduct, { catalogue });
  assert.ok(run.gate!.failures.includes('regular_reads_low'), JSON.stringify(run.gate));
});

test('B3.8 a stateful model that assumes sale queries come last does not pass', () => {
  const { obs, pred, sales, catalogue } = setup();
  // 90% held out: 27 products, so the shuffle has room to show (at 10 products 2 of 10 early sales still clear 80%).
  const byProduct = splitByProduct(obs, pred, sales, noSealed(), 0.9, 1) as Fold;
  const truth = truthRange(pred);
  // Distinct price queries (the harness asks each product and day once).
  const nPoints = new Set(byProduct.testPoints.map((p) => `${p.key}|${p.seenOn}`)).size;
  const model: Model = {
    name: 'order_gamer',
    description: 'sale-blind range for the first nPoints calls, the true range after',
    claimedCoverage: 1,
    runnable: true,
    fit: () => {
      let calls = 0;
      return (q) => {
        const t = truth.get(q.key);
        if (!t) return null;
        return calls++ < nPoints ? { lowCents: Math.round(t.lowCents * 0.6), highCents: t.highCents, midCents: t.midCents } : t;
      };
    },
  };
  const run = evaluate(model, byProduct, { catalogue });
  assert.equal(run.gate!.pass, false, JSON.stringify(run.gate));
  assert.ok(run.gate!.failures.includes('sale_low'));
  // The sale days differ from the price days, so the sale queries are real, separate calls.
  assert.ok(byProduct.testSales.every((s) => s.seenOn === SALE_DAY));
});

/* ------------------------------------------------- 9. the audit leaves the row out */

test('B3.9 the audit compares a row with the OTHER shops only', () => {
  // Three shops at 100, 140, 210. Leave-one-out, 210 is 1.75x the median of 100 and 140 (120): flagged.
  // Were the row counted in its own reference, the median would be 140 and 210 / 140 = 1.5: not flagged.
  const rows = auditPredictionKey([
    {
      key: '1',
      code: '1',
      points: [100, 140, 210].map((cents, i) => ({ key: '1', code: '1', shop: `S${i}|`, seller: `S${i}`, sellerSku: 's', name: 'n', url: null, cents, seenOn: NEW })),
    },
  ]);
  const r210 = rows.find((r) => r.cents === 210)!;
  assert.equal(r210.referenceCents, 120);
  assert.equal(r210.flagged, true);
});

test('B3.10 an item with its own prices and a range over 1.5x fails on width_own', () => {
  const { byTime, catalogue } = setup();
  const base = ownHistory();
  const wide: Model = {
    ...base,
    name: 'own_history_wide',
    fit(ctx) {
      const p = base.fit(ctx);
      return (q) => {
        const r = p(q);
        return r ? { lowCents: r.lowCents, highCents: r.lowCents * 2, midCents: r.midCents } : null;
      };
    },
  };
  const run = evaluate(wide, byTime, { catalogue });
  assert.ok(run.scores!.ownWidth!.n > 0);
  assert.ok(run.gate!.failures.includes('width_own'), JSON.stringify(run.gate));
  assert.equal(run.gate!.failures.includes('width_p90'), false);
});

// B3.11 (per-category calibration) moved to market.test.ts: it needs 30+ products per category.
