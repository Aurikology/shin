/**
 * Standing tests on the audit's synthetic market (test/market.ts, copied from
 * the 2026-09-28 audit probe): 6 categories x 60 products x 5 shops, 26 weeks,
 * sales at two shops, one shop spelling barcodes as EAN-13.
 *
 *   - an HONEST model (per-product median, interval from the training side's
 *     own residuals, claiming 50%) must PASS the by-time gate, including the
 *     B4 comparison with both baselines. If this goes red, the bench has
 *     become unpassable, which is as bad as passing everything;
 *   - a model that answers 1 cent on part of the items, balanced so its hit
 *     rate matches its claim, must FAIL (it cannot beat the baselines);
 *   - per-category calibration treats products as the unit, both ways.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysApart, latestPerShop, loadObservations, median, type Observation } from '../src/data.ts';
import { buildSaleKey } from '../src/keys.ts';
import { groupHash, isFold, splitByTime, type Fold } from '../src/split.ts';
import { evaluate, type Model, type Query } from '../src/harness.ts';
import type { Interval } from '../src/score.ts';
import { priceRangeFor } from '../../price/src/range.ts';
import { buildMarket } from './market.ts';
import { noSealed } from './fixture.ts';

function byTimeFold(seed: number) {
  const { prices, catalogue } = buildMarket({ seed });
  const obs = loadObservations(prices);
  const f = splitByTime(obs, buildSaleKey(obs), noSealed());
  assert.ok(isFold(f));
  return { fold: f as Fold, catalogue };
}

const quantile = (xs: readonly number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]!;
};

function ownIndex(train: readonly Observation[]) {
  const byKey = new Map<string, Observation[]>();
  for (const o of train) if (!o.isSale && o.key) (byKey.get(o.key) ?? byKey.set(o.key, []).get(o.key)!).push(o);
  const own = (key: string, asOf: string, minShops = 1) => {
    const shops = latestPerShop((byKey.get(key) ?? []).filter((o) => o.seenOn <= asOf && daysApart(o.seenOn, asOf) <= 90));
    return shops.length >= minShops ? median(shops.map((s) => s.cents)) : null;
  };
  return { byKey, own };
}

/** The audit's honestConf: residuals of each training price against the product's own median the day before. */
function honest(claim = 0.5): Model {
  return {
    name: `honest_${claim}`,
    description: 'per-product median, time-conformal residual interval',
    claimedCoverage: claim,
    runnable: true,
    fit(ctx) {
      const I = ownIndex(ctx.observations);
      const res: number[] = [];
      for (const [k, list] of I.byKey) {
        for (const o of list) {
          const m = I.own(k, new Date(Date.parse(o.seenOn) - 86_400_000).toISOString().slice(0, 10), 3);
          if (m !== null) res.push(Math.log(o.cents / m));
        }
      }
      const lo = quantile(res, (1 - claim) / 2);
      const hi = quantile(res, 1 - (1 - claim) / 2);
      // The same predictor's 50% band, returned at every claim so B4 compares like with like.
      const lo50 = quantile(res, 0.25);
      const hi50 = quantile(res, 0.75);
      return (q: Query) => {
        const m = I.own(q.key, q.asOf);
        if (m === null) return null;
        const at = (x: number) => Math.round(m * Math.exp(x));
        return { lowCents: at(lo), highCents: at(hi), midCents: Math.round(m), low50Cents: at(lo50), high50Cents: at(hi50) };
      };
    },
  };
}

test('market: an honest model passes the by-time gate, beating both baselines on the same items', () => {
  for (const seed of [7, 3]) {
    const { fold, catalogue } = byTimeFold(seed);
    const run = evaluate(honest(0.5), fold, { catalogue, seed: 2 });
    assert.equal(run.counts, true);
    assert.equal(run.gate!.pass, true, `seed ${seed}: ${JSON.stringify(run.gate)}`);
    assert.deepEqual(run.gate!.baselines.map((b) => b.status), ['better', 'better']);
  }
});

test('market: the same honest predictor gets the SAME B4 verdict at claims 0.5, 0.8, 0.9 and 0.95, and passes at each', () => {
  const { fold, catalogue } = byTimeFold(7);
  const runs = [0.5, 0.8, 0.9, 0.95].map((c) => evaluate(honest(c), fold, { catalogue, seed: 2 }));
  const b4 = runs.map((r) => JSON.stringify(r.gate!.baselines.map((b) => [b.baseline, b.status, b.meanDiff, b.ci95])));
  assert.equal(new Set(b4).size, 1, b4.join('\n'));
  for (const r of runs) assert.equal(r.gate!.pass, true, `claim ${r.scores!.claimedCoverage}: ${JSON.stringify(r.gate!.failures)} ${r.gate!.notes.join(' | ')}`);
});

test('market: a near-copy of category_range, shrunk 10% toward the product median, does not clear the B4 margin', () => {
  const { fold, catalogue } = byTimeFold(7);
  const shrink: Model = {
    name: 'near_copy',
    description: 'category_range with each end pulled 10% toward the product median (log scale)',
    claimedCoverage: 0.5,
    runnable: true,
    fit(ctx) {
      const I = ownIndex(ctx.observations);
      return (q) => {
        const r = priceRangeFor({ barcode: q.key, asOf: q.asOf }, { prices: ctx.prices, catalogue: ctx.catalogue });
        if (r.basis === 'none') return null;
        const m = I.own(q.key, q.asOf) ?? r.medianCents;
        const s = (x: number) => Math.round(Math.exp(0.9 * Math.log(x) + 0.1 * Math.log(m)));
        return { lowCents: s(r.lowCents), highCents: s(r.highCents), midCents: Math.round(m) };
      };
    },
  };
  const run = evaluate(shrink, fold, { catalogue, seed: 2 });
  const vsRange = run.gate!.baselines.find((b) => b.baseline === 'category_range')!;
  assert.equal(vsRange.status, 'not_better', vsRange.note);
  assert.ok(run.gate!.failures.includes('not_better_than_baseline'));
});

test('market: 1 cent on part of the items, balanced to match the claim, fails on the baselines', () => {
  const { fold, catalogue } = byTimeFold(7);
  const base = honest(0.5);
  const gamer: Model = {
    ...base,
    name: 'one_cent_balanced',
    fit(ctx) {
      const p = base.fit(ctx);
      const I = ownIndex(ctx.observations);
      return (q) => {
        const m = I.own(q.key, q.asOf);
        if (m === null) return null;
        // 40% of products get a 1-cent point; the rest a wide sure-hit band, so the hit rate still lands near 50%.
        if (groupHash(q.key, 11) < 0.4) return { lowCents: 1, highCents: 1, midCents: 1 };
        return p(q) && { lowCents: Math.round(m * 0.9), highCents: Math.round(m * 1.3), midCents: Math.round(m) };
      };
    },
  };
  const run = evaluate(gamer, fold, { catalogue, seed: 2 });
  assert.equal(run.gate!.pass, false);
  assert.ok(run.gate!.failures.includes('not_better_than_baseline'), JSON.stringify(run.gate!.failures));
});

/** Holds a product's every test price when `hit(key)`, none of them otherwise. */
function perProduct(fold: Fold, claim: number, hit: (key: string, leaf: string) => boolean): Model {
  const prices = new Map<string, number[]>();
  for (const p of fold.testPoints) (prices.get(p.key) ?? prices.set(p.key, []).get(p.key)!).push(p.cents);
  return {
    name: 'per_product',
    description: '',
    claimedCoverage: claim,
    runnable: true,
    fit: () => (q): Interval | null => {
      const c = prices.get(q.key);
      if (!c) return null;
      const lo = Math.min(...c);
      const hi = Math.max(...c);
      return hit(q.key, q.info?.leaf ?? '') ? { lowCents: lo, highCents: hi, midCents: lo } : { lowCents: hi + 1, highCents: hi + 2, midCents: hi + 1 };
    },
  };
}

function rankIn(fold: Fold, leafOf: (k: string) => string) {
  const byLeaf = new Map<string, string[]>();
  for (const k of new Set(fold.testPoints.map((p) => p.key))) (byLeaf.get(leafOf(k)) ?? byLeaf.set(leafOf(k), []).get(leafOf(k))!).push(k);
  const rank = new Map<string, number>();
  for (const ks of byLeaf.values()) ks.sort().forEach((k, i) => rank.set(k, i / ks.length));
  return rank;
}

test('market: a category that holds the price far MORE often than claimed fails (calibration is two-sided per category)', () => {
  const { fold, catalogue } = byTimeFold(7);
  const leaf = new Map<string, string>();
  const probe = evaluate(perProduct(fold, 0.5, (k, l) => (leaf.set(k, l), true)), fold, { catalogue, seed: 2 });
  assert.ok(probe.scores);
  const rank = rankIn(fold, (k) => leaf.get(k)!);
  // Wine: every product held (100%). Every other category: 40% of products held, inside the 95% interval for 60 products.
  const run = evaluate(perProduct(fold, 0.5, (k, l) => l === 'en:wine' || rank.get(k)! < 0.4), fold, { catalogue, seed: 2 });
  const cats = run.scores!.perCategory;
  assert.ok(cats['en:wine']!.products >= 30 && cats['en:wine']!.hitRate === 1);
  assert.ok(Math.abs(run.scores!.hitRate! - 0.5) <= 0.05, `overall ${run.scores!.hitRate}`);
  assert.equal(run.gate!.failures.includes('calibration'), false);
  assert.ok(run.gate!.failures.includes('category_calibration'), JSON.stringify(run.gate));
  const note = run.gate!.notes.find((n) => n.includes('products whose 95% interval'))!;
  assert.match(note, /en:wine/);
  assert.doesNotMatch(note, /en:snacks/);
});

test('market: a category 10 points under its claim over 60 products is within noise when products are the unit', () => {
  const { fold, catalogue } = byTimeFold(7);
  const leaf = new Map<string, string>();
  evaluate(perProduct(fold, 0.5, (k, l) => (leaf.set(k, l), true)), fold, { catalogue, seed: 2 });
  const rank = rankIn(fold, (k) => leaf.get(k)!);
  const run = evaluate(perProduct(fold, 0.5, (k) => rank.get(k)! < 0.42), fold, { catalogue, seed: 2 });
  assert.equal(run.gate!.failures.includes('category_calibration'), false, JSON.stringify(run.gate!.notes));
});
