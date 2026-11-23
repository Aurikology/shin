/**
 * Split conformal wrapper: ranges that keep their claimed coverage by construction, whatever the base method.
 *
 *   conformal(base, { claim, calibShare: 0.2, stratifyBy: 'leaf_category' | 'none' })
 *
 * The training side the harness hands over is split again into a FIT part and a CALIBRATION part. The base
 * method is fitted on the fit part only. Each calibration point (a real price the base never trained on) is
 * asked of the base as of its own date, and scored: how far the range must be scaled about its centre, in
 * log price, to contain the real price (centre c = (ln low + ln high) / 2, half width h = (ln high - ln low) / 2,
 * score = |ln real - c| / h). The factor is the ceil((n + 1) * claim)-th smallest score (the split conformal
 * quantile). Every future range is then low' = exp(c - f*h), high' = exp(c + f*h). On exchangeable data the
 * real price falls inside at least `claim` of the time. The test side is never seen: the wrapper only ever
 * receives `ctx.observations` (the fold's training rows) and the harness has already run the sealed-product guard.
 *
 * How the calibration part is cut mirrors how the fold's test side was cut from its training side:
 *   by_product, sealed       whole products held out (`product`): the base meets unseen products when calibrating.
 *   by_time                  the latest-dated points held out and every fit row is older (`time`).
 *   by_product_and_date      both (`product_time`).
 * Falls back to `product` when the points do not span two dates. `split` overrides.
 *
 * One global factor, and with stratifyBy 'leaf_category' one factor per leaf category that has at least
 * `minCategoryCount` calibration points (thinner categories use the global factor). Everything fitted is in
 * `report().conformal`, so the factors can be read off and reused by the app. The base's own counters
 * (`report().base`) include the calibration queries, because the base answers those too.
 *
 * A base that returns point estimates (low = high) cannot be scaled; those calibration points score
 * Infinity unless the point is exact. If the quantile is not finite the factor falls back to 1 and the
 * report says so (`finite: false`).
 */

import type { AsyncPredictor, Model, Predictor, Query, TrainContext } from './harness.ts';
import { trainingDatabase } from './harness.ts';
import type { Interval } from './score.ts';
import { readCatalogueInfo, type CatalogueInfo, type Observation } from './data.ts';
import { buildPredictionKey, type TruthPoint } from './keys.ts';
import { groupHash, timeCutoff } from './split.ts';
import { categoryRangeModel, priceTreeModel } from './baselines.ts';
import { liveEstimateModel } from './live-estimate.ts';

export type CalibSplit = 'auto' | 'product' | 'time' | 'product_time';

export interface ConformalOptions {
  /** The share of real prices the scaled range must hold, 0 to 1 (exclusive). */
  readonly claim: number;
  /** Share of the training side held out for calibration. Default 0.2. */
  readonly calibShare?: number;
  readonly stratifyBy?: 'leaf_category' | 'none';
  /** Fewest calibration points a category needs for its own factor. Default 30. */
  readonly minCategoryCount?: number;
  readonly split?: CalibSplit;
  /** Cap on calibration points asked of the base (a deterministic subsample); for slow async bases. Default no cap. */
  readonly maxCalibration?: number;
  /** Seed for which products are held out. Default 0. */
  readonly seed?: number;
}

export interface ConformalFit {
  readonly claim: number;
  readonly calibShare: number;
  readonly mode: string;
  readonly nFitRows: number;
  readonly nCalibrationPoints: number;
  /** Calibration points the base answered (the ones that were scored). */
  readonly nScored: number;
  readonly globalFactor: number;
  /** True when the conformal quantile was a real number; false when there were too few points or an infinite score, and the factor fell back to 1. */
  readonly finite: boolean;
  /** Factor for the 50% band when the claim is not 0.5 (so the 50% comparison stays measurable); null otherwise. */
  readonly factor50: number | null;
  readonly stratifyBy: 'leaf_category' | 'none';
  readonly minCategoryCount: number;
  readonly perCategory: Record<string, { n: number; factor: number }>;
  /** Categories with calibration points but fewer than the minimum: they use the global factor. */
  readonly thinCategories: Record<string, number>;
}

/** Smallest scale (about the centre, in log price) at which the range contains the real price. */
export function nonconformity(low: number, high: number, real: number): number {
  const lo = Math.log(low);
  const hi = Math.log(high);
  const r = Math.log(real);
  const c = (lo + hi) / 2;
  const h = (hi - lo) / 2;
  const d = Math.abs(r - c);
  if (!(h > 0)) return d === 0 ? 0 : Infinity;
  return d / h;
}

/** The split conformal quantile: the ceil((n + 1) * claim)-th smallest score; Infinity when that rank is beyond n. */
export function conformalQuantile(scores: readonly number[], claim: number): number {
  const n = scores.length;
  if (n === 0) return Infinity;
  const k = Math.ceil((n + 1) * claim);
  if (k > n) return Infinity;
  return [...scores].sort((a, b) => a - b)[Math.max(1, k) - 1]!;
}

/** A range scaled about its centre in log price by `f`. Median and any other field are kept; a 50% band is scaled by `f50` when given. */
export function scaleInterval(a: Interval, f: number, f50: number | null): Interval {
  const scale = (low: number, high: number, k: number): [number, number] => {
    const lo = Math.log(low);
    const hi = Math.log(high);
    const c = (lo + hi) / 2;
    const h = (hi - lo) / 2;
    return [Math.max(1, Math.round(Math.exp(c - k * h))), Math.max(1, Math.round(Math.exp(c + k * h)))];
  };
  const [lowCents, highCents] = scale(a.lowCents, a.highCents, f);
  const out: { -readonly [K in keyof Interval]: Interval[K] } = { lowCents, highCents, midCents: a.midCents };
  const own50 = a.low50Cents !== undefined && a.high50Cents !== undefined ? ([a.low50Cents, a.high50Cents] as const) : null;
  if (f50 !== null) {
    // The base's own 50% band when it has one, else its claimed band, scaled by the 50% factor.
    const [l, h] = scale(own50 ? own50[0] : a.lowCents, own50 ? own50[1] : a.highCents, f50);
    out.low50Cents = l;
    out.high50Cents = h;
  }
  return out;
}

interface Calibration {
  readonly fitRows: readonly Observation[];
  readonly points: readonly TruthPoint[];
  readonly mode: string;
}

function chooseSplit(ctx: TrainContext, opts: Required<Pick<ConformalOptions, 'calibShare' | 'seed' | 'split'>> & { maxCalibration: number }): Calibration {
  const pts = buildPredictionKey(ctx.observations).flatMap((p) => p.points);
  let mode: Exclude<CalibSplit, 'auto'> =
    opts.split !== 'auto' ? opts.split : ctx.fold === 'by_time' ? 'time' : ctx.fold === 'by_product_and_date' ? 'product_time' : 'product';
  let chosen: TruthPoint[] = [];
  let fitRows: readonly Observation[] = ctx.observations;
  let note = '';
  if (mode !== 'product') {
    const cut = timeCutoff(pts, opts.calibShare);
    if (cut === null) {
      mode = 'product';
      note = ' (fallback: points span fewer than two dates)';
    } else {
      chosen = pts.filter((p) => p.seenOn >= cut);
      const keys = new Set(chosen.map((p) => p.key));
      fitRows = ctx.observations.filter((o) => o.seenOn < cut && (mode === 'time' || !o.key || !keys.has(o.key)));
    }
  }
  if (mode === 'product') {
    const keys = new Set(pts.filter((p) => groupHash(p.key, opts.seed) < opts.calibShare).map((p) => p.key));
    chosen = pts.filter((p) => keys.has(p.key));
    fitRows = ctx.observations.filter((o) => !o.key || !keys.has(o.key));
  }
  if (chosen.length > opts.maxCalibration) {
    chosen = [...chosen].sort((a, b) => groupHash(`${a.key}|${a.shop}|${a.seenOn}`, opts.seed) - groupHash(`${b.key}|${b.shop}|${b.seenOn}`, opts.seed)).slice(0, opts.maxCalibration);
  }
  return { fitRows, points: chosen, mode: mode + note };
}

export function conformal(base: Model, options: ConformalOptions): Model {
  const claim = options.claim;
  if (!(claim > 0 && claim < 1)) throw new Error(`conformal: claim must be between 0 and 1 (exclusive), got ${claim}`);
  const calibShare = options.calibShare ?? 0.2;
  if (!(calibShare > 0 && calibShare < 1)) throw new Error(`conformal: calibShare must be between 0 and 1 (exclusive), got ${calibShare}`);
  const stratifyBy = options.stratifyBy ?? 'leaf_category';
  const minCategoryCount = options.minCategoryCount ?? 30;
  const sp = { calibShare, seed: options.seed ?? 0, split: options.split ?? 'auto', maxCalibration: options.maxCalibration ?? Infinity };

  let fitted: ConformalFit | null = null;

  /** Everything after the base has answered the calibration queries. */
  const finish = (mode: string, nFitRows: number, nPoints: number, scored: { score: number; leaf: string }[]): { fit: ConformalFit; global: number; byLeaf: Map<string, number> } => {
    const all = scored.map((s) => s.score);
    const q = conformalQuantile(all, claim);
    const finite = Number.isFinite(q);
    const global = finite ? q : 1;
    const q50 = claim === 0.5 ? null : conformalQuantile(all, 0.5);
    const factor50 = q50 === null ? null : Number.isFinite(q50) ? q50 : 1;
    const perCategory: Record<string, { n: number; factor: number }> = {};
    const thin: Record<string, number> = {};
    const byLeaf = new Map<string, number>();
    if (stratifyBy === 'leaf_category') {
      const groups = new Map<string, number[]>();
      for (const s of scored) (groups.get(s.leaf) ?? groups.set(s.leaf, []).get(s.leaf)!).push(s.score);
      for (const [leaf, list] of groups) {
        if (leaf === '' || list.length < minCategoryCount) {
          thin[leaf === '' ? '(no category)' : leaf] = list.length;
          continue;
        }
        const f = conformalQuantile(list, claim);
        if (!Number.isFinite(f)) {
          thin[leaf] = list.length;
          continue;
        }
        perCategory[leaf] = { n: list.length, factor: f };
        byLeaf.set(leaf, f);
      }
    }
    const fit: ConformalFit = {
      claim,
      calibShare,
      mode,
      nFitRows,
      nCalibrationPoints: nPoints,
      nScored: scored.length,
      globalFactor: global,
      finite,
      factor50,
      stratifyBy,
      minCategoryCount,
      perCategory,
      thinCategories: thin,
    };
    return { fit, global, byLeaf };
  };

  /** Which calibration queries to ask, and what to do with each answer. Shared by the sync and async paths. */
  const plan = (ctx: TrainContext) => {
    const cal = chooseSplit(ctx, sp);
    const fitDb = trainingDatabase(cal.fitRows);
    const baseCtx: TrainContext = { fold: ctx.fold, observations: cal.fitRows, prices: fitDb, catalogue: ctx.catalogue };
    const info = readCatalogueInfo(ctx.catalogue, new Set(cal.points.map((p) => p.key)));
    const queryFor = (key: string, asOf: string): Query => Object.freeze({ key, code: key, asOf, info: (info.get(key) ?? null) as CatalogueInfo | null });
    const leafOf = (key: string) => info.get(key)?.leaf ?? '';
    const asks = new Map<string, Query>();
    for (const p of cal.points) asks.set(`${p.key}|${p.seenOn}`, queryFor(p.key, p.seenOn));
    return { cal, baseCtx, info, queryFor, leafOf, asks };
  };

  const rescale = (f: { global: number; byLeaf: Map<string, number>; fit: ConformalFit }) => (q: Query, a: Interval | null): Interval | null => {
    if (a === null) return null;
    const leaf = q.info?.leaf ?? '';
    const factor = stratifyBy === 'leaf_category' && f.byLeaf.has(leaf) ? f.byLeaf.get(leaf)! : f.global;
    return scaleInterval(a, factor, f.fit.factor50);
  };

  const model: Model = {
    name: `conformal_${base.name}`,
    description: `${base.description}; wrapped in split conformal at claim ${claim} (${calibShare} of training held out, factor ${stratifyBy === 'leaf_category' ? 'per leaf category with a global fallback' : 'global'})`,
    claimedCoverage: claim,
    runnable: base.runnable,
    ...(base.notRunReason !== undefined ? { notRunReason: base.notRunReason } : {}),
    fit(ctx: TrainContext): Predictor {
      if (base.fitAsync) throw new Error(`${model.name} answers asynchronously; run it with evaluateAsync`);
      const { cal, baseCtx, queryFor, leafOf, asks } = plan(ctx);
      const predict = base.fit(baseCtx);
      const answers = new Map<string, Interval | null>();
      for (const [k, q] of asks) answers.set(k, predict(q));
      const scored = scoreCalibration(cal.points, answers, leafOf);
      const done = finish(cal.mode, cal.fitRows.length, cal.points.length, scored);
      fitted = done.fit;
      const apply = rescale(done);
      return (q: Query) => apply(q, predict(q));
    },
    report() {
      return { conformal: fitted ? { ...fitted } : null, base: base.report?.() ?? null };
    },
  };
  if (base.fitAsync) {
    Object.defineProperty(model, 'fitAsync', {
      enumerable: true,
      value(ctx: TrainContext): AsyncPredictor {
        const { cal, baseCtx, leafOf, asks } = plan(ctx);
        const predict = base.fitAsync!(baseCtx);
        // The first query waits for calibration; later ones share it.
        const ready = (async () => {
          const answers = new Map<string, Interval | null>();
          for (const [k, q] of asks) answers.set(k, await predict(q));
          const done = finish(cal.mode, cal.fitRows.length, cal.points.length, scoreCalibration(cal.points, answers, leafOf));
          fitted = done.fit;
          return rescale(done);
        })();
        return async (q: Query) => (await ready)(q, await predict(q));
      },
    });
  }
  return model;
}

function scoreCalibration(points: readonly TruthPoint[], answers: ReadonlyMap<string, Interval | null>, leafOf: (key: string) => string): { score: number; leaf: string }[] {
  const out: { score: number; leaf: string }[] = [];
  for (const p of points) {
    const a = answers.get(`${p.key}|${p.seenOn}`);
    if (!a || !(a.lowCents > 0) || !(a.highCents >= a.lowCents) || !(p.cents > 0)) continue;
    out.push({ score: nonconformity(a.lowCents, a.highCents, p.cents), leaf: leafOf(p.key) });
  }
  return out;
}

/* ---------------------------------------------------- the registered methods */

/** category_range's and price_tree's claim; the live estimate claims 0.8 (p10 to p90). */
export const conformalCategoryRangeModel = (): Model => conformal(categoryRangeModel(), { claim: 0.5 });
export const conformalPriceTreeModel = (): Model => conformal(priceTreeModel(), { claim: 0.5 });
export const conformalLiveEstimateModel = (): Model => conformal(liveEstimateModel(), { claim: 0.8, maxCalibration: 1500 });

/** The synchronous conformal methods, for the controlled runs; live is async and run apart. */
export function conformalModels(): Model[] {
  return [conformalCategoryRangeModel(), conformalPriceTreeModel()];
}
