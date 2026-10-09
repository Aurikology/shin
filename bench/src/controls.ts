/**
 * 7.6 Prove the test works, on every rebuild, before anything is scored.
 *
 * Three controls run on every fold through the same harness and gate as any
 * model:
 *   known_good      an oracle: each held-out product's true min to max on the
 *                   fold's own scored prices, claiming 100%. It MUST pass the
 *                   calibration, answer-rate and width checks. If it cannot,
 *                   the bar is unreachable or the scoring is broken.
 *   shuffled        the same true ranges, each moved to ANOTHER product (a
 *                   seeded derangement). It MUST fail calibration. If it does
 *                   not, the test cannot tell a product's price from any other
 *                   product's, and no score off it means anything.
 *   whole_category  min to max of every regular training price in the
 *                   product's leaf (else its parent, else every training
 *                   price), claiming 100%. It MUST fail on width: the gate's
 *                   width checks, or a median width over 1.5x (requirement
 *                   7.2's usefulness bar).
 *
 * A control that behaves wrongly is a "test wrong" failure (plan Part 1 step
 * 1, Part 2 check 1): the run fails, loudly, and no model is scored on any
 * fold. A control that cannot run (too few products to shuffle, nothing
 * scored) is "not run", which is never a pass: that fold is not scored either.
 *
 * The B4 half of the gate (beating baselines) is not part of a control's
 * verdict: the controls test the scoring, not the comparison.
 */

import { latestPerShop, readCatalogueInfo, type Observation } from './data.ts';
import { evaluate, trainingDatabase, type EvalOptions, type Model, type ModelRun } from './harness.ts';
import { rng } from './audit.ts';
import { DEFAULT_BAR, gate, type Bar, type GateFailure, type Interval } from './score.ts';
import type { Fold } from './split.ts';

/** Requirement 7.2: "median high-to-low 1.5x or less on category-based answers". A whole-category range must exceed it. */
export const USEFUL_WIDTH_MEDIAN_MAX = 1.5;

/** Fewest held-out products the shuffled control can run on. */
export const SHUFFLE_MIN_PRODUCTS = 2;

/** Seed for the shuffled control's derangement. Recorded with every run. */
export const CONTROL_SEED = 20261009;

export type ControlName = 'known_good' | 'shuffled' | 'whole_category';
export type ControlFailure = GateFailure | 'width_median';

export interface ControlResult {
  readonly name: ControlName;
  readonly expected: string;
  readonly status: 'ok' | 'misbehaved' | 'not_run';
  readonly reason: string;
  readonly hitRate: number | null;
  readonly answerRate: number | null;
  readonly widthMedian: number | null;
  readonly widthP90: number | null;
  readonly failures: readonly ControlFailure[];
}

export interface ControlReport {
  readonly fold: Fold['name'];
  readonly foldDescription: string;
  readonly status: 'pass' | 'fail' | 'not_run';
  readonly seed: number;
  readonly results: readonly ControlResult[];
  readonly summary: string;
}

export class ControlsFailed extends Error {
  readonly reports: readonly ControlReport[];
  constructor(reports: readonly ControlReport[]) {
    super(`CONTROLS FAILED, nothing is scored: ${reports.filter((r) => r.status !== 'pass').map((r) => r.summary).join(' | ')}`);
    this.reports = reports;
    this.name = 'ControlsFailed';
  }
}

export interface ControlOptions extends EvalOptions {
  readonly bar?: Bar;
  /** The median-width line the whole-category control must exceed and the known-good must not. */
  readonly widthMedianMax?: number;
  /** Seed for the derangement. */
  readonly controlSeed?: number;
  /** Replaces the derangement (mutation tests only). */
  readonly shuffle?: (keys: readonly string[], seed: number) => Map<string, string> | null;
  /** Replace a control's model (mutation tests only). */
  readonly knownGood?: Model;
  readonly shuffled?: Model;
  readonly wholeCategory?: Model;
}

/**
 * A seeded derangement: every key maps to a different key, and the map is a
 * permutation. Null for fewer than SHUFFLE_MIN_PRODUCTS keys.
 */
export function derange(keys: readonly string[], seed: number): Map<string, string> | null {
  const uniq = [...new Set(keys)].sort();
  if (uniq.length < SHUFFLE_MIN_PRODUCTS) return null;
  const order = [...uniq];
  const rand = rng(seed);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  // Each key takes the next one's place in the shuffled cycle: never itself.
  return new Map(order.map((k, i) => [k, order[(i + 1) % order.length]!]));
}

/** Each held-out product's true range on this fold's scored prices. */
function truthRanges(fold: Fold): Map<string, Interval> {
  const by = new Map<string, number[]>();
  for (const p of fold.testPoints) (by.get(p.key) ?? by.set(p.key, []).get(p.key)!).push(p.cents);
  const out = new Map<string, Interval>();
  for (const [k, c] of by) {
    const s = [...c].sort((a, b) => a - b);
    const lo = s[0]!;
    const hi = s[s.length - 1]!;
    const mid = s[Math.floor((s.length - 1) / 2)]!;
    // The 50% band: the middle half of the true prices.
    const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]!;
    out.set(k, { lowCents: lo, highCents: hi, midCents: mid, low50Cents: q(0.25), high50Cents: q(0.75) });
  }
  return out;
}

/** Known-good: the true min to max of each held-out product's scored prices. Reads the truth; it is a control, not a model. */
export function oracleModel(fold: Fold): Model {
  const truth = truthRanges(fold);
  return {
    name: 'known_good',
    description: 'control: the true min to max of each held-out product on this fold, claiming 100%',
    claimedCoverage: 1,
    runnable: true,
    fit: () => (q) => truth.get(q.key) ?? null,
  };
}

/** Shuffled: the true ranges, each given to another product. */
export function shuffledModel(fold: Fold, seed = CONTROL_SEED, shuffle: ControlOptions['shuffle'] = derange): Model | null {
  const truth = truthRanges(fold);
  const map = shuffle([...truth.keys()], seed);
  if (!map) return null;
  return {
    name: 'shuffled',
    description: `control: each product's true range given to another product (seeded derangement, seed ${seed}), claiming 100%`,
    claimedCoverage: 1,
    runnable: true,
    fit: () => (q) => {
      const other = map.get(q.key);
      return other === undefined ? null : truth.get(other) ?? null;
    },
  };
}

/** Whole category: min to max of every regular training price in the leaf, else the parent, else everything. */
export function wholeCategoryModel(): Model {
  return {
    name: 'whole_category',
    description: 'control: min to max of every regular training price in the leaf (else parent, else all), claiming 100%',
    claimedCoverage: 1,
    runnable: true,
    fit(ctx) {
      const regular = ctx.observations.filter((o) => !o.isSale && o.key);
      const keys = new Set(regular.map((o) => o.key!));
      const info = new Map<string, { leaf: string | null; path: readonly string[] }>();
      if (ctx.catalogue) {
        // Same reader the harness uses for queries.
        for (const [k, v] of readCatalogueInfo(ctx.catalogue, keys)) info.set(k, v);
      }
      const span = new Map<string, { lo: number; hi: number }>();
      const add = (tag: string, cents: number) => {
        const s = span.get(tag) ?? { lo: Infinity, hi: 0 };
        span.set(tag, { lo: Math.min(s.lo, cents), hi: Math.max(s.hi, cents) });
      };
      for (const o of latestRows(regular)) {
        add('*', o.cents);
        const ci = info.get(o.key!);
        if (!ci) continue;
        for (const t of new Set(ci.path)) add(t, o.cents);
        if (ci.leaf) add(ci.leaf, o.cents);
      }
      return (q) => {
        const leaf = q.info?.leaf ?? null;
        const path = q.info?.path ?? [];
        const idx = leaf ? path.lastIndexOf(leaf) : -1;
        const parent = idx > 0 ? path[idx - 1]! : null;
        const s = (leaf && span.get(leaf)) || (parent && span.get(parent)) || span.get('*');
        if (!s || !Number.isFinite(s.lo)) return null;
        return { lowCents: s.lo, highCents: s.hi, midCents: Math.round(Math.sqrt(s.lo * s.hi)) };
      };
    },
  };
}

function latestRows(rows: readonly Observation[]): Observation[] {
  const by = new Map<string, Observation[]>();
  for (const o of rows) (by.get(o.key!) ?? by.set(o.key!, []).get(o.key!)!).push(o);
  return [...by.values()].flatMap((l) => latestPerShop(l));
}

const CORE: readonly GateFailure[] = ['claim_too_low', 'nothing_scored', 'too_many_skips', 'calibration', 'category_calibration', 'width_own', 'width_p90'];
const WIDTH: readonly ControlFailure[] = ['width_own', 'width_p90', 'width_median'];

function judge(name: ControlName, run: ModelRun, bar: Bar, widthMedianMax: number): ControlResult {
  const s = run.scores;
  const base = {
    name,
    hitRate: s?.hitRate ?? null,
    answerRate: s?.answerRate ?? null,
    widthMedian: s?.width?.median ?? null,
    widthP90: s?.width?.p90 ?? null,
  };
  const expected = name === 'known_good' ? 'pass calibration, answer rate and width' : name === 'shuffled' ? 'fail calibration' : 'fail on width';
  if (!s || s.scored === 0 || s.width === null) {
    return { ...base, expected, status: 'not_run', reason: `${name}: nothing was scored on this fold`, failures: ['nothing_scored'] };
  }
  // The control's verdict uses the gate's own checks, with the B4 half left out.
  const g = gate(s, null, bar);
  const failures: ControlFailure[] = g.failures.filter((f) => CORE.includes(f));
  if (s.width.median > widthMedianMax) failures.push('width_median');
  const fmt = `hit ${(s.hitRate! * 100).toFixed(1)}%, answered ${(s.answerRate! * 100).toFixed(1)}%, width median ${s.width.median.toFixed(2)}x / p90 ${s.width.p90.toFixed(2)}x, failures [${failures.join(', ')}]`;
  let ok: boolean;
  if (name === 'known_good') ok = failures.length === 0;
  else if (name === 'shuffled') ok = failures.includes('calibration');
  else ok = failures.some((f) => WIDTH.includes(f));
  return { ...base, expected, status: ok ? 'ok' : 'misbehaved', reason: `${name} should ${expected}: ${ok ? 'did' : 'DID NOT'} (${fmt})`, failures };
}

/** Runs the three controls on one fold. */
export function runControls(fold: Fold, opts: ControlOptions): ControlReport {
  const bar = opts.bar ?? DEFAULT_BAR;
  const widthMedianMax = opts.widthMedianMax ?? USEFUL_WIDTH_MEDIAN_MAX;
  const seed = opts.controlSeed ?? CONTROL_SEED;
  const trainDb = opts.trainDb ?? trainingDatabase(fold.train);
  const ev = { catalogue: opts.catalogue, trainDb, ...(opts.seed !== undefined ? { seed: opts.seed } : {}) };
  const results: ControlResult[] = [];

  results.push(judge('known_good', evaluate(opts.knownGood ?? oracleModel(fold), fold, ev), bar, widthMedianMax));
  const sh = opts.shuffled ?? shuffledModel(fold, seed, opts.shuffle ?? derange);
  if (!sh) {
    results.push({
      name: 'shuffled',
      expected: 'fail calibration',
      status: 'not_run',
      reason: `shuffled needs ${SHUFFLE_MIN_PRODUCTS}+ held-out products with prices; this fold has ${new Set(fold.testPoints.map((p) => p.key)).size}`,
      hitRate: null,
      answerRate: null,
      widthMedian: null,
      widthP90: null,
      failures: [],
    });
  } else results.push(judge('shuffled', evaluate(sh, fold, ev), bar, widthMedianMax));
  results.push(judge('whole_category', evaluate(opts.wholeCategory ?? wholeCategoryModel(), fold, ev), bar, widthMedianMax));
  if (!opts.trainDb) trainDb.close();

  const status: ControlReport['status'] = results.some((r) => r.status === 'misbehaved') ? 'fail' : results.some((r) => r.status === 'not_run') ? 'not_run' : 'pass';
  const bad = results.filter((r) => r.status !== 'ok');
  return {
    fold: fold.name,
    foldDescription: fold.description,
    status,
    seed,
    results,
    summary:
      status === 'pass'
        ? `${fold.name}: all three controls behaved`
        : `${fold.name}: controls ${status === 'fail' ? 'MISBEHAVED' : 'NOT RUN'}: ${bad.map((r) => r.reason).join('; ')}`,
  };
}

/** Throws ControlsFailed unless every report passed. Not run is not a pass. */
export function assertControls(...reports: readonly ControlReport[]): void {
  if (reports.length === 0 || reports.some((r) => r.status !== 'pass')) throw new ControlsFailed(reports);
}

export interface ControlledRuns {
  /** True when any fold's controls misbehaved: nothing was scored on any fold. */
  readonly aborted: boolean;
  readonly reason: string;
  readonly controls: readonly ControlReport[];
  readonly runs: readonly ModelRun[];
  /** Folds not scored because their controls could not run. */
  readonly skipped: readonly { fold: Fold['name']; reason: string }[];
}

/**
 * Every rebuild: controls on every fold first. Any misbehaving control stops
 * the whole run (no model scored on any fold). A fold whose controls could not
 * run is skipped and named. Otherwise every model is scored on every fold.
 */
export function controlledRuns(folds: readonly Fold[], models: () => readonly Model[], opts: ControlOptions): ControlledRuns {
  const prepared = folds.map((f) => ({ f, trainDb: trainingDatabase(f.train) }));
  try {
    const controls = prepared.map(({ f, trainDb }) => runControls(f, { ...opts, trainDb }));
    const failed = controls.filter((c) => c.status === 'fail');
    if (failed.length) {
      return { aborted: true, reason: new ControlsFailed(failed).message, controls, runs: [], skipped: [] };
    }
    const runs: ModelRun[] = [];
    const skipped: { fold: Fold['name']; reason: string }[] = [];
    prepared.forEach(({ f, trainDb }, i) => {
      if (controls[i]!.status !== 'pass') {
        skipped.push({ fold: f.name, reason: controls[i]!.summary });
        return;
      }
      for (const m of models()) runs.push(evaluate(m, f, { catalogue: opts.catalogue, trainDb, ...(opts.seed !== undefined ? { seed: opts.seed } : {}) }));
    });
    return { aborted: false, reason: skipped.length ? `${skipped.length} fold(s) not scored: controls could not run` : 'all controls behaved', controls, runs, skipped };
  } finally {
    for (const p of prepared) p.trainDb.close();
  }
}
