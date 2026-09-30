/**
 * B2 harness: fit a model on a fold's training side, ask it for a range for
 * every held-out price as of the day that price was seen, and score.
 *
 * The training side is handed over two ways: as rows, and as an in-memory
 * price database built through `price/src/store.ts`'s own `openPrices` and
 * `recordObservation` (plus the newer columns: is_sale, was_cents, flags,
 * capture_tile_id, price_verified), so a model that reads SQL (like
 * `range.ts`) sees the same rows `data.ts` does, with the held-out rows
 * physically absent. Nothing here opens a real file for writing.
 *
 * What a model is given and what it may return:
 *   - a query carries the CANONICAL product key only (never the shop's own
 *     spelling of the barcode, which can leak which shop a price came from),
 *     the as-of date and the catalogue row; nothing says whether it is a price
 *     or a sale query, and queries are asked in one seeded shuffle;
 *   - each answer is validated and copied into plain numbers the moment it is
 *     returned. Getters, proxies and non-plain objects are refused, so an
 *     answer cannot change after the model has seen later queries. The claimed
 *     coverage is read once, before the first query.
 *
 * ACCEPTED LIMIT: models run in-process and are trusted code. This is a test
 * bench, not a sandbox: a model can read globals, the file system or the
 * clock. The checks above stop accidents and lazy gaming, not a hostile model.
 */

import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { openPrices, recordObservation, type JoinMethod } from '../../price/src/store.ts';
import { MIN_OWN_SHOPS, WINDOW_DAYS } from '../../price/src/range.ts';
import { daysApart, readCatalogueInfo, type CatalogueInfo, type Observation } from './data.ts';
import { foldCounts, isIssuedFold, type Fold } from './split.ts';
import { rng } from './audit.ts';
import { compareToBaseline, gate, scoreAll, type BaselineComparison, type GateResult, type Interval, type PointResult, type SaleResult, type Scores } from './score.ts';
import { REQUIRED_BASELINE, REQUIRED_BASELINES, type RequiredBaseline } from './ids.ts';
import { categoryMedianModel, categoryRangeModel } from './baselines.ts';

export interface Query {
  /** The canonical product key (data.ts `codeKey`). */
  readonly key: string;
  /** The same canonical key, kept for callers that pass it on as a barcode (range.ts accepts it). Never a shop's spelling. */
  readonly code: string;
  /** ISO date the answer is for: the day the real price was seen. */
  readonly asOf: string;
  readonly info: CatalogueInfo | null;
}

export interface TrainContext {
  readonly fold: Fold['name'];
  readonly observations: readonly Observation[];
  /** In-memory `observation` table holding only the training rows. */
  readonly prices: DatabaseSync;
  /** The real catalogue, read-only; null when none was given. */
  readonly catalogue: DatabaseSync | null;
}

export type Predictor = (q: Query) => Interval | null;

export interface Model {
  readonly name: string;
  readonly description: string;
  /** The share of real prices the range says it holds. 0 for a point estimate. */
  readonly claimedCoverage: number;
  /** False for a model on record but not run (it returns no answers and is not scored). */
  readonly runnable: boolean;
  readonly notRunReason?: string;
  fit(ctx: TrainContext): Predictor;
  /** Anything the model counted while predicting (e.g. which ladder step answered), recorded with its run. */
  report?(): Record<string, unknown>;
  /** Set only by baselines.ts on the bench's own required baselines. */
  readonly [REQUIRED_BASELINE]?: RequiredBaseline;
}

/* -------------------------------------------------------- training data */

const EXTRA_COLUMNS: readonly [string, string][] = [
  ['is_sale', 'INTEGER'],
  ['was_cents', 'INTEGER'],
  ['flags', 'TEXT'],
  ['capture_tile_id', 'INTEGER'],
  ['price_verified', 'INTEGER'],
];

/** Copy training rows into an in-memory price database of the live shape, newer columns included. */
export function trainingDatabase(rows: readonly Observation[]): DatabaseSync {
  const db = openPrices(':memory:');
  // Whatever store.ts's DDL does not have yet (lane B adds columns), this temp table gets.
  const have = new Set((db.prepare('PRAGMA table_info(observation)').all() as { name: string }[]).map((c) => c.name));
  for (const [c, t] of EXTRA_COLUMNS) if (!have.has(c)) db.exec(`ALTER TABLE observation ADD COLUMN ${c} ${t}`);
  const extra = db.prepare(
    'UPDATE observation SET is_sale = ?, was_cents = ?, flags = ?, capture_tile_id = ?, price_verified = ? WHERE seller = ? AND seller_sku = ? AND seen_on = ?',
  );
  db.exec('BEGIN');
  for (const o of rows) {
    recordObservation(db, {
      code: o.code,
      seller: o.seller,
      sellerSku: o.sellerSku,
      sellerName: o.sellerName,
      sellerBrand: null,
      priceCents: o.cents,
      kind: o.kind,
      unitPriceCents: null,
      unitLabel: null,
      currency: o.currency,
      country: o.country,
      region: o.region,
      joinMethod: (['gtin', 'name', 'none'].includes(o.joinMethod) ? o.joinMethod : 'none') as JoinMethod,
      seenOn: o.seenOn,
      url: o.url,
      imageUrl: null,
      inStock: null,
      storeName: o.storeName,
      storeOsm: o.storeOsm,
    });
    extra.run(o.isSale ? 1 : 0, o.wasCents, o.flags, o.captureTileId, o.priceVerified ?? 0, o.seller, o.sellerSku, o.seenOn);
  }
  db.exec('COMMIT');
  return db;
}

/* ------------------------------------------------------------- answers */

/**
 * Validate an answer and copy it into plain numbers. Refuses getters, proxies
 * and anything but a plain object (or null for "no answer"). Numbers are
 * copied as they are; the sanity floor in score.ts decides whether they count.
 */
export function freezeAnswer(a: unknown, model: string): Interval | null {
  if (a === null || a === undefined) return null;
  if (typeof a !== 'object' || types.isProxy(a)) throw new Error(`${model}: answer is not a plain object`);
  const proto = Object.getPrototypeOf(a);
  if (proto !== Object.prototype && proto !== null) throw new Error(`${model}: answer is not a plain object`);
  const optional = (k: 'low50Cents' | 'high50Cents'): number | undefined => {
    const d = Object.getOwnPropertyDescriptor(a, k);
    if (!d) return undefined;
    if (!('value' in d)) throw new Error(`${model}: answer field ${k} is a getter; answers must be plain numbers`);
    if (d.value === undefined) return undefined;
    if (typeof d.value !== 'number') throw new Error(`${model}: answer field ${k} is not a number`);
    return d.value;
  };
  const read = (k: 'lowCents' | 'highCents' | 'midCents'): number => {
    const d = Object.getOwnPropertyDescriptor(a, k);
    if (!d || !('value' in d)) throw new Error(`${model}: answer field ${k} is missing or a getter; answers must be plain numbers`);
    if (typeof d.value !== 'number') throw new Error(`${model}: answer field ${k} is not a number`);
    return d.value;
  };
  const low50 = optional('low50Cents');
  const high50 = optional('high50Cents');
  return Object.freeze({
    lowCents: read('lowCents'),
    highCents: read('highCents'),
    midCents: read('midCents'),
    ...(low50 !== undefined ? { low50Cents: low50 } : {}),
    ...(high50 !== undefined ? { high50Cents: high50 } : {}),
  });
}

function readClaim(model: Model): number {
  const d = Object.getOwnPropertyDescriptor(model, 'claimedCoverage');
  const v = d && 'value' in d ? d.value : undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) throw new Error(`${model.name}: claimedCoverage must be a plain number from 0 to 1`);
  return v;
}

/* ------------------------------------------------------------- the run */

export interface ModelRun {
  readonly model: string;
  readonly description: string;
  readonly fold: Fold['name'];
  readonly foldDescription: string;
  /** True when this fold's verdict is a pass requirement (by time, sealed); false for by product (reported only). */
  readonly counts: boolean;
  /** sha256 of the (product, date) queries the model was actually asked. Must be equal across models on one fold. */
  readonly askedHash: string;
  /** sha256 of the queries it answered validly. May differ; skips are scored as misses. */
  readonly answeredHash: string;
  readonly ran: boolean;
  readonly notRunReason?: string;
  readonly scores: Scores | null;
  readonly gate: GateResult | null;
  readonly extra?: Record<string, unknown>;
  readonly seconds: number;
}

export interface EvalOptions {
  readonly catalogue: DatabaseSync | null;
  /** Reused across models on the same fold; built from `fold.train` when absent. */
  readonly trainDb?: DatabaseSync;
  /** Seed for the order queries are asked in. Fixed per run, never per model. */
  readonly seed?: number;
}

/**
 * Whether each product had its own REGULAR prices at MIN_OWN_SHOPS+ shops on
 * the training side, within range.ts's window, as of a date. Decides which
 * items the plan's 1.5x own-price width bar applies to.
 */
export function ownPricesIndex(train: readonly Observation[]): (key: string, asOf: string) => boolean {
  const by = new Map<string, { shop: string; seenOn: string }[]>();
  for (const o of train) {
    if (o.isSale || !o.key) continue;
    (by.get(o.key) ?? by.set(o.key, []).get(o.key)!).push({ shop: o.shop, seenOn: o.seenOn });
  }
  return (key, asOf) => {
    const shops = new Set((by.get(key) ?? []).filter((r) => r.seenOn <= asOf && daysApart(r.seenOn, asOf) <= WINDOW_DAYS).map((r) => r.shop));
    return shops.size >= MIN_OWN_SHOPS;
  };
}

const sha = (lines: readonly string[]) => createHash('sha256').update([...lines].sort().join('\n')).digest('hex');

/** The query order: every price and sale query in one shuffle, seeded by the run (never by the model). */
export function queryOrder(fold: Fold, seed: number): ({ kind: 'p'; i: number } | { kind: 's'; i: number })[] {
  const order: ({ kind: 'p'; i: number } | { kind: 's'; i: number })[] = [
    ...fold.testPoints.map((_, i) => ({ kind: 'p' as const, i })),
    ...fold.testSales.map((_, i) => ({ kind: 's' as const, i })),
  ];
  const rand = rng(seed);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

interface Raw {
  readonly scores: Scores;
  readonly askedHash: string;
  readonly answeredHash: string;
  readonly extra?: Record<string, unknown>;
}

function runModel(model: Model, fold: Fold, opts: EvalOptions, trainDb: DatabaseSync): Raw {
  const claim = readClaim(model);
  const predict = model.fit({ fold: fold.name, observations: fold.train, prices: trainDb, catalogue: opts.catalogue });

  const keys = new Set<string>([...fold.testPoints.map((p) => p.key), ...fold.testSales.map((s) => s.key!)]);
  const info = readCatalogueInfo(opts.catalogue, keys);
  const cache = new Map<string, Interval | null>();
  const answered: string[] = [];
  const ask = (key: string, asOf: string): Interval | null => {
    const k = `${key}|${asOf}`;
    if (!cache.has(k)) {
      const a = freezeAnswer(predict(Object.freeze({ key, code: key, asOf, info: info.get(key) ?? null })), model.name);
      cache.set(k, a);
      if (a) answered.push(k);
    }
    return cache.get(k)!;
  };

  const pAns: (Interval | null)[] = new Array(fold.testPoints.length).fill(null);
  const sAns: (Interval | null)[] = new Array(fold.testSales.length).fill(null);
  for (const q of queryOrder(fold, opts.seed ?? 1)) {
    if (q.kind === 'p') {
      const p = fold.testPoints[q.i]!;
      pAns[q.i] = ask(p.key, p.seenOn);
    } else {
      const s = fold.testSales[q.i]!;
      sAns[q.i] = ask(s.key!, s.seenOn);
    }
  }

  const own = ownPricesIndex(fold.train);
  const points: PointResult[] = fold.testPoints.map((p, i) => ({
    key: p.key,
    category: info.get(p.key)?.leaf ?? 'uncategorised',
    realCents: p.cents,
    interval: pAns[i]!,
    hasOwnPrices: own(p.key, p.seenOn),
  }));
  const sales: SaleResult[] = fold.testSales.map((s, i) => ({ key: s.key!, saleCents: s.saleCents, regularCents: s.regularCents, interval: sAns[i]! }));
  const extra = model.report?.();
  return { scores: scoreAll(points, sales, claim), askedHash: sha([...cache.keys()]), answeredHash: sha(answered), ...(extra ? { extra } : {}) };
}

/** Required-baseline runs, once per fold and catalogue, so every candidate is compared with the same numbers. */
const baselineCache = new WeakMap<Fold, Map<string, Raw>>();

function baselineRaw(name: RequiredBaseline, fold: Fold, opts: EvalOptions, trainDb: DatabaseSync, make: () => Model): Raw {
  const byName = baselineCache.get(fold) ?? baselineCache.set(fold, new Map()).get(fold)!;
  const k = `${name}|${opts.seed ?? 1}`;
  if (!byName.has(k)) byName.set(k, runModel(make(), fold, opts, trainDb));
  return byName.get(k)!;
}

/** The required baselines' factories. baselines.ts imports only types from this file, so there is no cycle. */
const baselineFactories = new Map<RequiredBaseline, () => Model>([
  ['category_range', categoryRangeModel],
  ['category_median', categoryMedianModel],
]);

export function evaluate(model: Model, fold: Fold, opts: EvalOptions): ModelRun {
  if (!isIssuedFold(fold)) throw new Error('fold was not made by split.ts (which runs the sealed-batch guard); refusing to score it');
  const t0 = Date.now();
  const base = { model: model.name, description: model.description, fold: fold.name, foldDescription: fold.description, counts: foldCounts(fold.name) };
  if (!model.runnable) {
    return { ...base, askedHash: '', answeredHash: '', ran: false, notRunReason: model.notRunReason ?? 'not run', scores: null, gate: null, seconds: 0 };
  }
  const trainDb = opts.trainDb ?? trainingDatabase(fold.train);
  const self = model[REQUIRED_BASELINE];
  const raw = self ? baselineRaw(self, fold, opts, trainDb, () => model) : runModel(model, fold, opts, trainDb);

  // B4 at one level: the 50% band against category_range's (alpha 0.5), the median against category_median's.
  // A baseline is compared with the other one.
  const comparisons: BaselineComparison[] = REQUIRED_BASELINES.filter((b) => b !== self).map((b) => {
    const quantity = b === 'category_range' ? ('50% band interval score' as const) : ('median log error' as const);
    const pick = (sc: Scores) => (b === 'category_range' ? sc.perItem50 : sc.perItemMedian);
    const make = baselineFactories.get(b);
    if (!make) return compareToBaseline(pick(raw.scores), null, b, undefined, undefined, { quantity });
    const ref = baselineRaw(b, fold, opts, trainDb, make);
    if (ref.askedHash !== raw.askedHash) return { ...compareToBaseline(pick(raw.scores), null, b, undefined, undefined, { quantity }), note: `${b} was not asked the same items` };
    if (b === 'category_range' && raw.scores.with50 === 0) {
      return { ...compareToBaseline(pick(raw.scores), null, b, undefined, undefined, { quantity }), note: `no 50% band returned (low50Cents/high50Cents), so the comparison with ${b} is not measured` };
    }
    return compareToBaseline(pick(raw.scores), pick(ref.scores), b, undefined, undefined, { quantity });
  });
  return {
    ...base,
    askedHash: raw.askedHash,
    answeredHash: raw.answeredHash,
    ran: true,
    scores: raw.scores,
    gate: gate(raw.scores, comparisons),
    ...(raw.extra ? { extra: raw.extra } : {}),
    seconds: (Date.now() - t0) / 1000,
  };
}

/** Refuses runs on one fold that were not asked the same queries. */
export function assertSameItems(runs: readonly ModelRun[]): void {
  const asked = new Set(runs.filter((r) => r.ran).map((r) => r.askedHash));
  if (asked.size > 1) throw new Error(`models on ${runs[0]?.fold} were not asked the same items`);
}

/**
 * The verdict that counts, per model: it passes only when every counting fold
 * (by time, and the sealed batch when opened) passes, and at least one ran.
 * The by-product fold is reported and never changes this.
 */
export function overallVerdict(runs: readonly ModelRun[]): Map<string, { pass: boolean; counted: readonly string[]; reason: string }> {
  const out = new Map<string, { pass: boolean; counted: string[]; reason: string }>();
  for (const r of runs) {
    const v = out.get(r.model) ?? out.set(r.model, { pass: true, counted: [], reason: '' }).get(r.model)!;
    if (!foldCounts(r.fold)) continue;
    v.counted.push(r.fold);
    if (!r.ran || !r.gate?.pass) v.pass = false;
  }
  for (const v of out.values()) {
    if (v.counted.length === 0) v.pass = false;
    v.reason = v.counted.length === 0 ? 'no counting fold ran (by time or sealed)' : `${v.pass ? 'passes' : 'fails'} on ${v.counted.join(' + ')}`;
  }
  return out;
}
