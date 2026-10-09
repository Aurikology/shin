/**
 * 7.4 Beat what exists, by more than run-to-run noise.
 *
 * A candidate is compared, item by item on the same items, with two arms:
 *   category_range  the bench's required baseline (price/src/range.ts, as
 *                   baselines.ts calls it). The 2026-09-28 figures (49.7%
 *                   inside, 2.36x wide, 654 leave-one-out items on the
 *                   15,193-row database of that day) cannot be re-scored item by
 *                   item on today's database, so the arm is the same method
 *                   re-run on the same items as the candidate;
 *   claude_alone    Claude asked for a range with no web search. An INPUT: a
 *                   JSONL file of precomputed per-item ranges (`loadClaudeArm`).
 *                   Nothing here calls an API. An item missing from the file
 *                   was not asked and is left out of that arm's comparison; an
 *                   item in the file with no answer costs the skip score.
 *
 * The per-item score is the interval score of the 50% band at alpha 0.5 on
 * the log price (score.ts, the same quantity B4 uses against the category
 * range); lower is better. For each split and arm:
 *   meanDiff_k  the mean over items of candidate minus arm (negative = ahead);
 *   ci95_k      a paired bootstrap resampling PRODUCTS (prices of one product
 *               move together), BOOTSTRAP_REPS resamples.
 * Across K repeated splits (different held-out products):
 *   meanDiff    the mean of meanDiff_k;
 *   splitNoise  1.96 x the standard deviation of meanDiff_k across splits;
 *   bootNoise   the mean half-width of ci95_k;
 *   noise       the larger of the two.
 * AHEAD of an arm when -meanDiff > noise. The verdict is "ahead" only when the
 * candidate is ahead of BOTH arms; any arm not measured (fewer than
 * MIN_SPLITS splits, fewer than MIN_PRODUCTS products on a split, no answers
 * for the arm) makes the verdict "not measured", which is not a pass.
 */

import { existsSync, readFileSync } from 'node:fs';
import { rng } from './audit.ts';
import { evaluate, trainingDatabase, type EvalOptions, type Model } from './harness.ts';
import { categoryRangeModel } from './baselines.ts';
import { B4_MIN_PRODUCTS, BOOTSTRAP_REPS, BOOTSTRAP_SEED, type Interval } from './score.ts';
import type { Fold } from './split.ts';

/** Fewest repeated splits a noise floor is read from. DEFAULT, changeable by Jamin. */
export const MIN_SPLITS = 3;
/** Fewest products per split for a comparison to count. Same as B4. */
export const MIN_PRODUCTS = B4_MIN_PRODUCTS;
export const ARMS = ['category_range', 'claude_alone'] as const;

export interface SplitScores {
  readonly split: string;
  /** Product key per item; the bootstrap resamples these. */
  readonly keys: readonly string[];
  /** The candidate's per-item score (lower is better). */
  readonly candidate: readonly number[];
  /** Per arm, aligned with `keys`. null = the arm was not asked this item (left out of its comparison). */
  readonly arms: Record<string, readonly (number | null)[]>;
}

export interface SplitResult {
  readonly split: string;
  readonly items: number;
  readonly products: number;
  readonly meanDiff: number | null;
  readonly ci95: { readonly low: number; readonly high: number } | null;
}

export interface ArmResult {
  readonly arm: string;
  readonly status: 'ahead' | 'not_ahead' | 'not_measured';
  readonly meanDiff: number | null;
  readonly splitNoise: number | null;
  readonly bootNoise: number | null;
  readonly noise: number | null;
  readonly perSplit: readonly SplitResult[];
  readonly note: string;
}

export interface PairedVerdict {
  readonly status: 'ahead' | 'not_ahead' | 'not_measured';
  readonly ahead: boolean;
  readonly arms: readonly ArmResult[];
  readonly sentence: string;
}

export interface PairedOptions {
  readonly arms?: readonly string[];
  readonly reps?: number;
  readonly seed?: number;
  readonly minSplits?: number;
  readonly minProducts?: number;
}

function bootstrapByProduct(groups: readonly { d: number; n: number }[], reps: number, seed: number): { low: number; high: number } {
  const rand = rng(seed);
  const stats: number[] = new Array(reps);
  for (let r = 0; r < reps; r++) {
    let d = 0;
    let n = 0;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[Math.floor(rand() * groups.length)]!;
      d += g.d;
      n += g.n;
    }
    stats[r] = d / n;
  }
  stats.sort((a, b) => a - b);
  const q = (p: number) => stats[Math.min(reps - 1, Math.max(0, Math.ceil(p * reps) - 1))]!;
  return { low: q(0.025), high: q(0.975) };
}

function oneSplit(s: SplitScores, arm: string, reps: number, seed: number): SplitResult {
  const a = s.arms[arm];
  const by = new Map<string, { d: number; n: number }>();
  let items = 0;
  if (a) {
    if (a.length !== s.keys.length || s.candidate.length !== s.keys.length) throw new Error(`split ${s.split}: ${arm} is not aligned with the candidate`);
    a.forEach((x, i) => {
      if (x === null) return;
      const g = by.get(s.keys[i]!) ?? by.set(s.keys[i]!, { d: 0, n: 0 }).get(s.keys[i]!)!;
      g.d += s.candidate[i]! - x;
      g.n++;
      items++;
    });
  }
  const groups = [...by.values()];
  if (items === 0) return { split: s.split, items: 0, products: 0, meanDiff: null, ci95: null };
  return {
    split: s.split,
    items,
    products: groups.length,
    meanDiff: groups.reduce((t, g) => t + g.d, 0) / items,
    ci95: bootstrapByProduct(groups, reps, seed),
  };
}

function sd(xs: readonly number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** The paired comparison over repeated splits. Pure arithmetic on per-item scores. */
export function pairedCompare(splits: readonly SplitScores[], opts: PairedOptions = {}): PairedVerdict {
  const arms = opts.arms ?? [...new Set(splits.flatMap((s) => Object.keys(s.arms)))];
  const reps = opts.reps ?? BOOTSTRAP_REPS;
  const seed = opts.seed ?? BOOTSTRAP_SEED;
  const minSplits = opts.minSplits ?? MIN_SPLITS;
  const minProducts = opts.minProducts ?? MIN_PRODUCTS;
  const results: ArmResult[] = arms.map((arm) => {
    const perSplit = splits.map((s, i) => oneSplit(s, arm, reps, seed + i));
    const nm = (note: string): ArmResult => ({ arm, status: 'not_measured', meanDiff: null, splitNoise: null, bootNoise: null, noise: null, perSplit, note: `${arm}: not measured: ${note}` });
    if (perSplit.every((p) => p.items === 0)) return nm(`no ${arm} scores on any split`);
    if (splits.length < minSplits) return nm(`${splits.length} split(s); the noise floor needs ${minSplits}+ repeated splits`);
    const thin = perSplit.filter((p) => p.products < minProducts);
    if (thin.length) return nm(`split(s) ${thin.map((p) => `${p.split} (${p.products} products)`).join(', ')} under the ${minProducts} products needed`);
    const diffs = perSplit.map((p) => p.meanDiff!);
    const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const splitNoise = 1.96 * sd(diffs);
    const bootNoise = perSplit.reduce((t, p) => t + (p.ci95!.high - p.ci95!.low) / 2, 0) / perSplit.length;
    const noise = Math.max(splitNoise, bootNoise);
    const ahead = -meanDiff > noise;
    return {
      arm,
      status: ahead ? 'ahead' : 'not_ahead',
      meanDiff,
      splitNoise,
      bootNoise,
      noise,
      perSplit,
      note: `${arm}: ${ahead ? 'AHEAD' : 'not ahead'}: candidate minus ${arm} ${meanDiff.toFixed(4)} per item over ${splits.length} splits; noise ${noise.toFixed(4)} (split-to-split ${splitNoise.toFixed(4)}, bootstrap by product ${bootNoise.toFixed(4)}); ${perSplit.map((p) => `${p.split}: ${p.meanDiff!.toFixed(4)} on ${p.items} items / ${p.products} products`).join(', ')}`,
    };
  });
  const status: PairedVerdict['status'] = results.some((r) => r.status === 'not_measured')
    ? 'not_measured'
    : results.every((r) => r.status === 'ahead')
      ? 'ahead'
      : 'not_ahead';
  return {
    status,
    ahead: status === 'ahead',
    arms: results,
    sentence:
      status === 'ahead'
        ? `ahead of ${arms.join(' and ')} by more than the noise`
        : status === 'not_ahead'
          ? `not ahead of ${results.filter((r) => r.status !== 'ahead').map((r) => r.arm).join(' and ')} by more than the noise`
          : `not measured: ${results.filter((r) => r.status === 'not_measured').map((r) => r.note).join('; ')}`,
  };
}

/* ------------------------------------------------------------ Claude arm */

export interface ClaudeArm {
  readonly path: string;
  readonly rows: number;
  /** `${key}|${asOf}` to the answer; null when the row records no answer. A key absent from the map was not asked. */
  readonly answers: ReadonlyMap<string, Interval | null>;
  readonly coverage: number;
}

/**
 * Reads precomputed Claude ranges, one JSON object per line:
 *   {"key": "...", "asOf": "YYYY-MM-DD", "lowCents": n, "highCents": n, "midCents": n,
 *    "low50Cents"?: n, "high50Cents"?: n, "coverage"?: 0.5}
 * or {"key": "...", "asOf": "...", "answer": null} for an item asked and not answered.
 * Every row must carry the same coverage (default 0.5).
 */
export function loadClaudeArm(path: string): ClaudeArm {
  if (!existsSync(path)) throw new Error(`Claude arm file not found: ${path}`);
  const answers = new Map<string, Interval | null>();
  let coverage: number | null = null;
  let rows = 0;
  readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (!line.trim()) return;
      const where = `${path} line ${i + 1}`;
      let o: Record<string, unknown>;
      try {
        o = JSON.parse(line) as Record<string, unknown>;
      } catch {
        throw new Error(`${where}: not JSON`);
      }
      if (typeof o.key !== 'string' || typeof o.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.asOf)) throw new Error(`${where}: needs key and asOf (YYYY-MM-DD)`);
      const id = `${o.key}|${o.asOf}`;
      if (answers.has(id)) throw new Error(`${where}: ${id} appears twice`);
      rows++;
      if ('answer' in o && o.answer === null) {
        answers.set(id, null);
        return;
      }
      const num = (k: string, optional = false): number | undefined => {
        const v = o[k];
        if (v === undefined && optional) return undefined;
        if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${where}: ${k} must be a number`);
        return v;
      };
      const c = o.coverage === undefined ? 0.5 : num('coverage')!;
      if (coverage !== null && c !== coverage) throw new Error(`${where}: coverage ${c} differs from earlier rows (${coverage})`);
      coverage = c;
      const low50 = num('low50Cents', true);
      const high50 = num('high50Cents', true);
      answers.set(id, {
        lowCents: num('lowCents')!,
        highCents: num('highCents')!,
        midCents: num('midCents')!,
        ...(low50 !== undefined ? { low50Cents: low50 } : {}),
        ...(high50 !== undefined ? { high50Cents: high50 } : {}),
      });
    });
  return { path, rows, answers, coverage: coverage ?? 0.5 };
}

/** The Claude arm as a bench model: answers from the file, nothing else. */
export function claudeArmModel(arm: ClaudeArm): Model {
  return {
    name: 'claude_alone',
    description: `Claude alone, no web search: precomputed ranges read from ${arm.path} (${arm.rows} rows); no API is called`,
    claimedCoverage: arm.coverage,
    runnable: true,
    fit: () => (q) => {
      const a = arm.answers.get(`${q.key}|${q.asOf}`);
      return a ? { ...a } : null;
    },
  };
}

/* ----------------------------------------------- per-item scores from runs */

export interface PairedRunOptions extends Pick<EvalOptions, 'catalogue' | 'seed'> {
  readonly claude?: ClaudeArm | null;
  readonly pairedOptions?: PairedOptions;
}

/**
 * Runs the candidate, the category range and (when given) the Claude arm on
 * each fold through the harness, and compares their per-item 50%-band
 * interval scores. Items the Claude file does not hold are left out of the
 * Claude comparison. With no Claude file the Claude arm is not measured.
 */
export function pairedOnFolds(folds: readonly Fold[], candidate: () => Model, opts: PairedRunOptions): { verdict: PairedVerdict; splits: SplitScores[] } {
  const splits: SplitScores[] = folds.map((f, i) => {
    const trainDb = trainingDatabase(f.train);
    try {
      const ev = { catalogue: opts.catalogue, trainDb, ...(opts.seed !== undefined ? { seed: opts.seed } : {}) };
      const cand = evaluate(candidate(), f, ev);
      const base = evaluate(categoryRangeModel(), f, ev);
      if (!cand.scores || !base.scores) throw new Error(`${f.name}: the candidate or the category range did not run`);
      const keys = cand.scores.perItem50.map((x) => x.key);
      const arms: Record<string, (number | null)[]> = { category_range: base.scores.perItem50.map((x) => x.is) };
      if (opts.claude) {
        const cl = evaluate(claudeArmModel(opts.claude), f, ev);
        const asked = f.testPoints.map((p) => opts.claude!.answers.has(`${p.key}|${p.seenOn}`));
        arms.claude_alone = cl.scores!.perItem50.map((x, j) => (asked[j] ? x.is : null));
      }
      return { split: `${f.name}#${i}`, keys, candidate: cand.scores.perItem50.map((x) => x.is), arms };
    } finally {
      trainDb.close();
    }
  });
  return { verdict: pairedCompare(splits, { arms: [...ARMS], ...opts.pairedOptions }), splits };
}
