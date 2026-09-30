/**
 * B2 scores, and the top check from the build plan as a pass/fail gate.
 *
 * Scores, on the log of the price so a $2 item and a $60 item count the same:
 *   hit rate        the real price inside [low, high], over ALL eligible items:
 *                   a skipped or invalid answer counts as a miss, so skipping
 *                   is never free and every model is compared on the same items;
 *   width           high / low (1.00 means one number), on valid answers;
 *   interval score  Gneiting and Raftery (2007) for a central (1 - alpha)
 *                   interval: (u - l) + (2/alpha)(l - y)+ + (2/alpha)(y - u)+,
 *                   with alpha = 1 - the coverage the model claims (each model
 *                   is scored on the statement it made). Lower is better; it
 *                   charges for width AND for misses. A skipped or invalid
 *                   answer costs SKIP_INTERVAL_SCORE;
 *   log error       |ln(midpoint / real)|, reported as "the midpoint is within
 *                   X% of the real price Y% of the time";
 *   low/high check  a store-marked sale price reads "low" (below the range's
 *                   low end; a skipped sale does not read low); its paired
 *                   regular price must NOT read low.
 *
 * THE GATE has two halves. Calibration and usefulness (below), and the B4 rule
 * from the plan: "every later model must beat all three [baselines] on the
 * same items". Interval scores at different coverages are NOT comparable (a
 * calibrated 95% band always scores worse than a 50% band), so B4 compares at
 * ONE level (boss decision, 2026-09-28). Every model returns, besides its
 * claimed band, a median (`midCents`) and a 50% band (`low50Cents`,
 * `high50Cents`; for a model claiming exactly 50%, its claimed band is its 50%
 * band). Then:
 *   - vs category_range: interval score at alpha 0.5, candidate's 50% band
 *     against the baseline's 50% band;
 *   - vs category_median: 2 |ln(median / real)|, median against median.
 * The claimed band is used ONLY for calibration, width and the sale check.
 * Nothing is rescaled between levels. A candidate beats a baseline when a
 * paired bootstrap over PRODUCTS (prices of one product move together) puts
 * the whole 95% interval of the mean difference below -B4_MARGIN x the
 * baseline's mean score, on at least B4_MIN_PRODUCTS products. A required
 * baseline that did not run, or too few products, is "not measured" and blocks
 * the pass. The share of products the candidate wins is reported, not gated
 * (whether "better on average, worse on most products" should pass is Jamin's
 * call). The Claude guess is on a 200-item sample, not the same items, so it
 * is reported beside the gate, not inside it.
 *
 * WHICH SPLIT COUNTS (boss decision, 2026-09-28): the by-time split, plus the
 * sealed batch when opened. The by-product split is reported and is not a pass
 * requirement: it measures cold start, where only category-level models apply.
 *
 * Every threshold below is the plan's "Default bar, set now, changeable by
 * Jamin" or a default chosen here in the same spirit, and says which.
 */

import { percentile } from './data.ts';
import { rng } from './audit.ts';
import { wilson } from './audit.ts';

/* --------------------------------------------------------------- the bar */

/** Plan default: "sale prices read low at least 80% of the time". Changeable by Jamin. */
export const SALE_LOW_MIN = 0.8;

/**
 * A regular price must not read low more than this often. DEFAULT chosen here,
 * changeable by Jamin: the mirror of SALE_LOW_MIN.
 */
export const REGULAR_FALSE_LOW_MAX = 0.2;

/**
 * Plan default: "an item with its own prices gets a range no wider than 1.5x
 * high over low". Applied to the median width of items that had their own
 * prices (3+ shops) on the training side. Changeable by Jamin.
 */
export const OWN_WIDTH_MEDIAN_MAX = 1.5;

/**
 * No more than 1 answer in 10 may be wider than this. DEFAULT chosen here,
 * changeable by Jamin. 3x is 1.5x squared, twice the plan's usefulness line on
 * the log scale; at $3 to $9 a 30%-off sale sits inside the range. Today's
 * category range measured 4.8x at the 90th percentile, which this rejects.
 */
export const WIDTH_P90_MAX = 3;

/**
 * Overall: the hit rate must be within this of the claim, both ways (holding
 * the price far MORE often than claimed means the range is wider than it
 * admits). Plan section E: "within 5 points". Changeable by Jamin.
 */
export const CALIBRATION_TOLERANCE = 0.05;

/**
 * Per category, the unit is the PRODUCT (a product's prices at several shops
 * move together, so 40 points from 10 products are not 40 independent
 * checks). The check applies to categories with at least this many distinct
 * products. Plan section E: "each category with 30+ test items". Changeable by Jamin.
 */
export const PER_CATEGORY_MIN_PRODUCTS = 30;

/**
 * A range must claim to hold at least half of real prices. DEFAULT chosen here,
 * changeable by Jamin: 50% is what today's 25th-to-75th range claims.
 */
export const MIN_CLAIMED_COVERAGE = 0.5;

/** Answered (valid) items over eligible items. DEFAULT chosen here, changeable by Jamin. */
export const MIN_ANSWER_RATE = 0.95;

/**
 * Sanity floor: an answer with low <= 0 cents or high / low over this is
 * invalid and counts as a miss. DEFAULT chosen here, changeable by Jamin: a
 * range spanning 100x says nothing about any shelf price.
 */
export const MAX_VALID_RATIO = 100;

/**
 * What a skipped or invalid answer costs, for EVERY compared quantity (the
 * claimed-band interval score, the 50%-band interval score at alpha 0.5, and
 * the median's 2 |ln(mid / real)|): 2 ln(100). That is the median score of an
 * answer 100x off, and twice the width of the widest band the sanity floor
 * accepts, so skipping is dearer than any valid answer that holds the price.
 * DEFAULT chosen here, changeable by Jamin.
 */
export const SKIP_INTERVAL_SCORE = 2 * Math.log(MAX_VALID_RATIO);

/** Bootstrap resamples for the B4 comparison, and its seed. DEFAULT, changeable by Jamin. */
export const BOOTSTRAP_REPS = 2000;
/** Resamples used instead when the 95% edge lands within B4_EDGE_BAND of the threshold. DEFAULT, changeable by Jamin. */
export const BOOTSTRAP_REPS_NEAR_EDGE = 10000;
export const B4_EDGE_BAND = 0.005;
export const BOOTSTRAP_SEED = 20260928;

/**
 * The minimum improvement B4 asks for, as a share of the baseline's mean
 * score: the 95% interval's upper end must be below -B4_MARGIN x baseline mean.
 * Jamin sets this. Default 0.02 (2%), so a near-copy of a baseline cannot pass
 * on a sliver of noise-free improvement.
 */
export const B4_MARGIN = 0.02;

/** B4 needs at least this many distinct products, else "not measured". DEFAULT, changeable by Jamin. */
export const B4_MIN_PRODUCTS = 30;

export interface Bar {
  readonly saleLowMin: number;
  readonly regularFalseLowMax: number;
  readonly ownWidthMedianMax: number;
  readonly widthP90Max: number;
  readonly calibrationTolerance: number;
  readonly perCategoryMinProducts: number;
  readonly minClaimedCoverage: number;
  readonly minAnswerRate: number;
}

export const DEFAULT_BAR: Bar = {
  saleLowMin: SALE_LOW_MIN,
  regularFalseLowMax: REGULAR_FALSE_LOW_MAX,
  ownWidthMedianMax: OWN_WIDTH_MEDIAN_MAX,
  widthP90Max: WIDTH_P90_MAX,
  calibrationTolerance: CALIBRATION_TOLERANCE,
  perCategoryMinProducts: PER_CATEGORY_MIN_PRODUCTS,
  minClaimedCoverage: MIN_CLAIMED_COVERAGE,
  minAnswerRate: MIN_ANSWER_RATE,
};

/* ----------------------------------------------------------------- types */

export interface Interval {
  /** The claimed band (the model's claimedCoverage). */
  readonly lowCents: number;
  readonly highCents: number;
  /** The median. Compared with category_median's median (B4). */
  readonly midCents: number;
  /** The 50% band, compared with category_range at alpha 0.5 (B4). Optional only for a model claiming exactly 50%. */
  readonly low50Cents?: number;
  readonly high50Cents?: number;
}

export interface PointResult {
  readonly key: string;
  readonly category: string;
  readonly realCents: number;
  readonly interval: Interval | null;
  /** The product had its own prices at 3+ shops on the training side, as of this point's date. */
  readonly hasOwnPrices?: boolean;
}

export interface SaleResult {
  readonly key: string;
  readonly saleCents: number;
  readonly regularCents: number | null;
  readonly interval: Interval | null;
}

export type Zone = 'low' | 'typical' | 'high';

export function zoneOf(cents: number, iv: Interval): Zone {
  return cents < iv.lowCents ? 'low' : cents > iv.highCents ? 'high' : 'typical';
}

/** True when an answer passes the sanity floor. */
export function isValid(iv: Interval | null): iv is Interval {
  if (!iv) return false;
  const { lowCents: l, highCents: h, midCents: m } = iv;
  return [l, h, m].every(Number.isFinite) && l > 0 && m > 0 && h >= l && h / l <= MAX_VALID_RATIO;
}

/** Interval score on the log scale for one point. alpha is clamped to [0.02, 1]. */
export function intervalScore(realCents: number, iv: Interval, claimedCoverage: number): number {
  const alpha = Math.min(1, Math.max(0.02, 1 - claimedCoverage));
  const y = Math.log(realCents);
  const l = Math.log(iv.lowCents);
  const u = Math.log(iv.highCents);
  return u - l + (2 / alpha) * Math.max(0, l - y) + (2 / alpha) * Math.max(0, y - u);
}

export const WITHIN = [5, 10, 25, 50] as const;

export interface Scores {
  readonly claimedCoverage: number;
  readonly points: number;
  readonly scored: number;
  readonly abstained: number;
  /** Answers rejected by the sanity floor (counted as misses and in `abstained`). */
  readonly invalid: number;
  readonly answerRate: number | null;
  /** Hits over ALL eligible points; a skip or invalid answer is a miss. */
  readonly hitRate: number | null;
  readonly hitRateAnswered: number | null;
  /** Per category, over all eligible points, with the number of distinct products. */
  readonly perCategory: Readonly<Record<string, { n: number; products: number; hits: number; hitRate: number }>>;
  readonly width: { readonly median: number; readonly p90: number } | null;
  readonly ownWidth: { readonly n: number; readonly median: number } | null;
  /** Mean over ALL eligible points, skips and invalid answers costing SKIP_INTERVAL_SCORE. */
  readonly intervalScoreMean: number | null;
  /** Per point, in the fold's order: the claimed band's interval score (reported; NOT used for B4). */
  readonly perItem: readonly { readonly key: string; readonly is: number }[];
  /** Per point: interval score at alpha 0.5 of the 50% band (B4 vs category_range). Skip = SKIP_INTERVAL_SCORE. */
  readonly perItem50: readonly { readonly key: string; readonly is: number }[];
  /** Per point: 2 |ln(median / real)| (B4 vs category_median). Skip = SKIP_INTERVAL_SCORE. */
  readonly perItemMedian: readonly { readonly key: string; readonly is: number }[];
  /** Points with a valid 50% band. */
  readonly with50: number;
  readonly logError: { readonly median: number; readonly p90: number } | null;
  readonly within: Readonly<Record<string, number>> | null;
  readonly sentences: readonly string[];
  readonly sale: {
    readonly items: number;
    readonly scored: number;
    readonly readLow: number;
    readonly saleLowRate: number | null;
    readonly regularPaired: number;
    readonly regularReadLow: number;
    readonly regularFalseLowRate: number | null;
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const inside = (y: number, iv: Interval) => y >= iv.lowCents && y <= iv.highCents;

export function scoreAll(rawPoints: readonly PointResult[], rawSales: readonly SaleResult[], claimedCoverage: number): Scores {
  const valid = <T extends { interval: Interval | null }>(r: T): T => (isValid(r.interval) ? r : { ...r, interval: null });
  const invalid = rawPoints.filter((p) => p.interval !== null && !isValid(p.interval)).length;
  const points = rawPoints.map(valid);
  const sales = rawSales.map(valid);
  const got = points.filter((p): p is PointResult & { interval: Interval } => p.interval !== null);
  const hits = got.filter((p) => inside(p.realCents, p.interval)).length;

  const perCategory: Record<string, { n: number; products: number; hits: number; hitRate: number }> = {};
  const productsIn = new Map<string, Set<string>>();
  for (const p of points) {
    const c = (perCategory[p.category] ??= { n: 0, products: 0, hits: 0, hitRate: 0 });
    c.n++;
    (productsIn.get(p.category) ?? productsIn.set(p.category, new Set()).get(p.category)!).add(p.key);
    if (p.interval && inside(p.realCents, p.interval)) c.hits++;
  }
  for (const [k, c] of Object.entries(perCategory)) {
    c.hitRate = c.hits / c.n;
    c.products = productsIn.get(k)!.size;
  }

  const widths = got.map((p) => p.interval.highCents / p.interval.lowCents);
  const own = got.filter((p) => p.hasOwnPrices).map((p) => p.interval.highCents / p.interval.lowCents);
  const errs = got.map((p) => Math.abs(Math.log(p.interval.midCents / p.realCents)));
  const within: Record<string, number> = {};
  for (const x of WITHIN) within[`${x}%`] = got.length ? errs.filter((e) => e <= Math.log(1 + x / 100)).length / got.length : 0;
  const perItem = points.map((p) => ({ key: p.key, is: p.interval ? intervalScore(p.realCents, p.interval, claimedCoverage) : SKIP_INTERVAL_SCORE }));
  const band50 = (p: PointResult): Interval | null => {
    const iv = p.interval;
    if (!iv) return null;
    if (iv.low50Cents !== undefined || iv.high50Cents !== undefined) {
      const b = { lowCents: iv.low50Cents ?? NaN, highCents: iv.high50Cents ?? NaN, midCents: iv.midCents };
      return isValid(b) ? b : null;
    }
    return claimedCoverage === 0.5 ? iv : null;
  };
  const bands = points.map(band50);
  const perItem50 = points.map((p, i) => ({ key: p.key, is: bands[i] ? intervalScore(p.realCents, bands[i]!, 0.5) : SKIP_INTERVAL_SCORE }));
  const perItemMedian = points.map((p) => ({ key: p.key, is: p.interval ? 2 * Math.abs(Math.log(p.interval.midCents / p.realCents)) : SKIP_INTERVAL_SCORE }));

  const saleGot = sales.filter((s): s is SaleResult & { interval: Interval } => s.interval !== null);
  const readLow = saleGot.filter((s) => zoneOf(s.saleCents, s.interval) === 'low').length;
  const regs = sales.filter((s) => s.regularCents !== null);
  const regLow = saleGot.filter((s) => s.regularCents !== null && zoneOf(s.regularCents, s.interval) === 'low').length;

  const sentences: string[] = [];
  if (points.length) {
    sentences.push(
      `the range held the real price ${pct(hits / points.length)} of the time counting skips as misses (claims ${pct(claimedCoverage)}), answered ${got.length} of ${points.length}`,
    );
    if (got.length) for (const x of WITHIN) sentences.push(`midpoint within ${x}% of the real price, ${pct(within[`${x}%`]!)} of the time`);
  } else sentences.push('no eligible price: nothing to score');
  if (sales.length) sentences.push(`sale prices read low ${pct(readLow / sales.length)} of the time, on ${sales.length} sales`);

  return {
    claimedCoverage,
    points: points.length,
    scored: got.length,
    abstained: points.length - got.length,
    invalid,
    answerRate: points.length ? got.length / points.length : null,
    hitRate: points.length ? hits / points.length : null,
    hitRateAnswered: got.length ? hits / got.length : null,
    perCategory,
    width: got.length ? { median: percentile(widths, 50), p90: percentile(widths, 90) } : null,
    ownWidth: own.length ? { n: own.length, median: percentile(own, 50) } : null,
    intervalScoreMean: points.length ? perItem.reduce((s, x) => s + x.is, 0) / points.length : null,
    perItem,
    perItem50,
    perItemMedian,
    with50: bands.filter((b) => b !== null).length,
    logError: got.length ? { median: percentile(errs, 50), p90: percentile(errs, 90) } : null,
    within: got.length ? within : null,
    sentences,
    sale: {
      items: sales.length,
      scored: saleGot.length,
      readLow,
      saleLowRate: sales.length ? readLow / sales.length : null,
      regularPaired: regs.length,
      regularReadLow: regLow,
      regularFalseLowRate: regs.length ? regLow / regs.length : null,
    },
  };
}

/* ------------------------------------------------- B4: beat the baselines */

export interface BaselineComparison {
  readonly baseline: string;
  /** What was compared: the 50% band at alpha 0.5, or the median's log error. */
  readonly quantity: '50% band interval score' | 'median log error' | 'interval score';
  readonly status: 'better' | 'not_better' | 'not_measured';
  /** Candidate mean score minus the baseline's, on the same points (negative = candidate better). */
  readonly meanDiff: number | null;
  readonly baselineMean: number | null;
  /** The upper end the 95% interval must stay under: -B4_MARGIN x baseline mean. */
  readonly threshold: number | null;
  readonly ci95: { readonly low: number; readonly high: number } | null;
  /** Monte Carlo standard error of the 95% upper end. */
  readonly mcError: number | null;
  readonly reps: number;
  readonly products: number;
  /** Share of products where the candidate's summed score is lower (reported only, not gated). */
  readonly winShare: number | null;
  readonly note: string;
}

export interface CompareOptions {
  readonly quantity?: BaselineComparison['quantity'];
  readonly margin?: number;
  readonly minProducts?: number;
}

function notMeasured(name: string, quantity: BaselineComparison['quantity'], note: string, products = 0): BaselineComparison {
  return { baseline: name, quantity, status: 'not_measured', meanDiff: null, baselineMean: null, threshold: null, ci95: null, mcError: null, reps: 0, products, winShare: null, note };
}

function bootstrap(groups: readonly { d: number; n: number }[], reps: number, seed: number) {
  const rand = rng(seed);
  const stats: number[] = [];
  for (let r = 0; r < reps; r++) {
    let d = 0;
    let n = 0;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[Math.floor(rand() * groups.length)]!;
      d += g.d;
      n += g.n;
    }
    stats.push(d / n);
  }
  stats.sort((a, b) => a - b);
  const q = (p: number) => stats[Math.min(reps - 1, Math.max(0, Math.ceil(p * reps) - 1))]!;
  // Standard error of a sample quantile: sqrt(p(1-p)/n) / density, the density read off neighbouring quantiles.
  const h = 0.01;
  const density = (2 * h) / Math.max(1e-12, q(0.975 + h) - q(0.975 - h));
  const mcError = Math.sqrt((0.975 * 0.025) / reps) / density;
  return { ci95: { low: q(0.025), high: q(0.975) }, mcError };
}

/**
 * Paired bootstrap over products: resample products with replacement and take
 * the difference in mean score over all their points. Better only when the
 * whole 95% interval is below -margin x the baseline's mean score, on at least
 * `minProducts` products. Near the threshold the resamples go up to
 * BOOTSTRAP_REPS_NEAR_EDGE.
 */
export function compareToBaseline(
  candidate: readonly { key: string; is: number }[],
  baseline: readonly { key: string; is: number }[] | null,
  name: string,
  reps = BOOTSTRAP_REPS,
  seed = BOOTSTRAP_SEED,
  opts: CompareOptions = {},
): BaselineComparison {
  const quantity = opts.quantity ?? 'interval score';
  const margin = opts.margin ?? B4_MARGIN;
  const minProducts = opts.minProducts ?? B4_MIN_PRODUCTS;
  if (baseline === null) return notMeasured(name, quantity, `${name} did not run on these items`);
  if (baseline.length !== candidate.length || baseline.some((b, i) => b.key !== candidate[i]!.key)) {
    return notMeasured(name, quantity, `${name} was not scored on the same items`);
  }
  if (candidate.length === 0) return notMeasured(name, quantity, 'no items');
  const by = new Map<string, { d: number; n: number }>();
  candidate.forEach((c, i) => {
    const e = by.get(c.key) ?? by.set(c.key, { d: 0, n: 0 }).get(c.key)!;
    e.d += c.is - baseline[i]!.is;
    e.n++;
  });
  const groups = [...by.values()];
  if (groups.length < minProducts) {
    return notMeasured(name, quantity, `only ${groups.length} products; B4 needs ${minProducts}`, groups.length);
  }
  const meanDiff = groups.reduce((s, g) => s + g.d, 0) / candidate.length;
  const baselineMean = baseline.reduce((s, b) => s + b.is, 0) / baseline.length;
  const threshold = -margin * baselineMean;
  let used = reps;
  let boot = bootstrap(groups, reps, seed);
  if (Math.abs(boot.ci95.high - threshold) < B4_EDGE_BAND && reps < BOOTSTRAP_REPS_NEAR_EDGE) {
    used = BOOTSTRAP_REPS_NEAR_EDGE;
    boot = bootstrap(groups, used, seed);
  }
  const better = boot.ci95.high < threshold;
  const winShare = groups.filter((g) => g.d < 0).length / groups.length;
  return {
    baseline: name,
    quantity,
    status: better ? 'better' : 'not_better',
    meanDiff,
    baselineMean,
    threshold,
    ci95: boot.ci95,
    mcError: boot.mcError,
    reps: used,
    products: groups.length,
    winShare,
    note: `${better ? 'beats' : 'does not beat'} ${name} on ${quantity}: mean difference ${meanDiff.toFixed(3)} (95% ${boot.ci95.low.toFixed(3)} to ${boot.ci95.high.toFixed(3)}, must be under ${threshold.toFixed(3)}; MC error ${boot.mcError.toFixed(4)}, ${used} resamples) over ${groups.length} products; wins on ${Math.round(winShare * 100)}% of products (reported only)`,
  };
}

/* ------------------------------------------------------------ the gate */

export type GateFailure =
  | 'claim_too_low'
  | 'nothing_scored'
  | 'too_many_skips'
  | 'calibration'
  | 'category_calibration'
  | 'width_own'
  | 'width_p90'
  | 'sale_low'
  | 'sale_not_measured'
  | 'regular_reads_low'
  | 'not_better_than_baseline'
  | 'baseline_not_measured';

export interface GateResult {
  readonly pass: boolean;
  readonly failures: readonly GateFailure[];
  readonly notes: readonly string[];
  readonly baselines: readonly BaselineComparison[];
}

/**
 * The top check: (1) sale prices read low and regular ones do not, (2) the
 * range holds the real price as often as it claims, overall and per category,
 * (3) the range is narrow enough to separate the two, and (4) it beats every
 * required baseline on the same items. Anything not measured fails.
 * `baselines` null means this run IS a required baseline being scored for
 * reference; the B4 half then does not apply to it.
 */
export function gate(s: Scores, baselines: readonly BaselineComparison[] | null, bar: Bar = DEFAULT_BAR): GateResult {
  const failures: GateFailure[] = [];
  const notes: string[] = [];
  if (s.claimedCoverage < bar.minClaimedCoverage) {
    failures.push('claim_too_low');
    notes.push(`claims ${pct(s.claimedCoverage)}; a range must claim at least ${pct(bar.minClaimedCoverage)} (a point estimate claims 0)`);
  }
  if (s.points === 0 || s.scored === 0 || s.hitRate === null || s.width === null) {
    failures.push('nothing_scored');
    notes.push('no valid prediction to score');
  } else {
    if (s.answerRate! < bar.minAnswerRate) {
      failures.push('too_many_skips');
      notes.push(`answered ${pct(s.answerRate!)} of eligible items validly, bar ${pct(bar.minAnswerRate)}`);
    }
    if (Math.abs(s.hitRate - s.claimedCoverage) > bar.calibrationTolerance) {
      failures.push('calibration');
      notes.push(`hit rate ${pct(s.hitRate)} (skips as misses) is more than ${Math.round(bar.calibrationTolerance * 100)} points from its claim of ${pct(s.claimedCoverage)}`);
    }
    const badCats = Object.entries(s.perCategory).filter(([, c]) => {
      if (c.products < bar.perCategoryMinProducts) return false;
      const w = wilson(Math.round(c.hitRate * c.products), c.products);
      return s.claimedCoverage < w.low || s.claimedCoverage > w.high;
    });
    if (badCats.length) {
      failures.push('category_calibration');
      notes.push(
        `${badCats.length} categor${badCats.length === 1 ? 'y' : 'ies'} with ${bar.perCategoryMinProducts}+ products whose 95% interval (products as the unit) excludes the claim: ${badCats.slice(0, 5).map(([k, c]) => `${k} ${pct(c.hitRate)} of ${c.products} products`).join(', ')}`,
      );
    }
    if (s.ownWidth === null) notes.push('no item had its own prices on the training side; the 1.5x own-price width bar does not apply to this split');
    else if (s.ownWidth.median > bar.ownWidthMedianMax) {
      failures.push('width_own');
      notes.push(`items with their own prices: median width ${s.ownWidth.median.toFixed(2)}x over the ${bar.ownWidthMedianMax}x bar`);
    }
    if (s.width.p90 > bar.widthP90Max) {
      failures.push('width_p90');
      notes.push(`90th percentile width ${s.width.p90.toFixed(2)}x over the ${bar.widthP90Max}x bar`);
    }
  }
  if (s.sale.saleLowRate === null) {
    failures.push('sale_not_measured');
    notes.push('no sale price was eligible, so the low check is not measured');
  } else {
    if (s.sale.saleLowRate < bar.saleLowMin) {
      failures.push('sale_low');
      notes.push(`sale prices read low ${pct(s.sale.saleLowRate)} of the time, bar ${pct(bar.saleLowMin)}`);
    }
    if (s.sale.regularFalseLowRate !== null && s.sale.regularFalseLowRate > bar.regularFalseLowMax) {
      failures.push('regular_reads_low');
      notes.push(`regular prices read low ${pct(s.sale.regularFalseLowRate)} of the time, bar ${pct(bar.regularFalseLowMax)}`);
    }
  }
  if (baselines === null) notes.push('this is a required baseline: the B4 comparison applies to candidates, not to it');
  else {
    if (baselines.some((b) => b.status === 'not_measured')) failures.push('baseline_not_measured');
    if (baselines.some((b) => b.status === 'not_better')) failures.push('not_better_than_baseline');
    for (const b of baselines) notes.push(b.note);
  }
  return { pass: failures.length === 0, failures, notes, baselines: baselines ?? [] };
}
