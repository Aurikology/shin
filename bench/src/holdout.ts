/**
 * 7.5 Test on unseen products and later dates, in the mix shoppers scan.
 *
 *   leakAudit     every product and every date the fold scores, checked
 *                 against what it learns from. Any product on both sides, any
 *                 scored date also in training, or any training row dated on
 *                 or after the first scored date, is a leak. The
 *                 product-and-date split runs this before it issues a fold
 *                 and refuses to issue one that leaks.
 *   Ontario       the requirement weights the test to Ontario groceries (the
 *                 shoppers are in Ontario). Rows are tagged Ontario from their
 *                 region text. With no Ontario rows the weighting is NOT
 *                 possible and is reported as such, never faked: a score on
 *                 other provinces is labelled as not the shopper mix.
 *   dataSupport   what a price database can support: products, dates,
 *                 regions, Ontario rows, and whether the product-and-date
 *                 holdout can be made at all.
 *
 * NOT DONE: "groceries" is not checked here. Every row in the 2026-10-05
 * database is from a grocer (Save-On-Foods, Walmart), so the region is the
 * only part of the mix the data can vary today.
 */

import type { Observation } from './data.ts';
import type { SaleItem } from './keys.ts';
import type { SealGuard } from './sealed.ts';
import { isFold, splitByProductAndDate, type Fold } from './split.ts';

export type LeakCheck = 'product' | 'date';

export interface LeakReport {
  readonly ok: boolean;
  readonly checked: readonly LeakCheck[];
  /** Products with a row on the training side and a scored price or sale. */
  readonly products: readonly string[];
  /** Training dates that are scored dates, or on or after the first scored date. */
  readonly dates: readonly string[];
  readonly note: string;
}

export class LeakFound extends Error {
  readonly report: LeakReport;
  constructor(report: LeakReport) {
    super(`leak audit failed: ${report.note}`);
    this.report = report;
    this.name = 'LeakFound';
  }
}

type FoldShape = Pick<Fold, 'name' | 'train' | 'testPoints' | 'testSales' | 'testKeys'>;

/** Any overlap between what a fold learns from and what it scores. Works on any fold-shaped object, issued or not. */
export function leakAudit(fold: FoldShape, checks: readonly LeakCheck[] = ['product', 'date']): LeakReport {
  const scoredKeys = new Set<string>([...fold.testKeys, ...fold.testPoints.map((p) => p.key), ...fold.testSales.flatMap((s) => (s.key ? [s.key] : []))]);
  const scoredDates = new Set<string>([...fold.testPoints.map((p) => p.seenOn), ...fold.testSales.map((s) => s.seenOn)]);
  const first = [...scoredDates].sort()[0] ?? null;
  const products = new Set<string>();
  const dates = new Set<string>();
  for (const o of fold.train) {
    if (checks.includes('product') && o.key !== null && scoredKeys.has(o.key)) products.add(o.key);
    if (checks.includes('date') && (scoredDates.has(o.seenOn) || (first !== null && o.seenOn >= first))) dates.add(o.seenOn);
  }
  const p = [...products].sort();
  const d = [...dates].sort();
  const ok = p.length === 0 && d.length === 0;
  const parts: string[] = [];
  if (p.length) parts.push(`${p.length} product(s) on both sides (${p.slice(0, 5).join(', ')}${p.length > 5 ? ', ...' : ''})`);
  if (d.length) parts.push(`${d.length} date(s) learned on that are scored or later (${d.slice(0, 5).join(', ')}${d.length > 5 ? ', ...' : ''})`);
  return {
    ok,
    checked: [...checks],
    products: p,
    dates: d,
    note: ok ? `${fold.name}: no ${checks.join(' or ')} on both sides` : `${fold.name}: ${parts.join('; ')}`,
  };
}

/** Throws LeakFound on any overlap. */
export function assertNoLeak(fold: FoldShape, checks: readonly LeakCheck[] = ['product', 'date']): void {
  const r = leakAudit(fold, checks);
  if (!r.ok) throw new LeakFound(r);
}

/* ---------------------------------------------------------------- Ontario */

/** True when a region names Ontario: "Ontario", "ON", or text containing "Ontario". */
export function isOntario(region: string | null | undefined): boolean {
  if (typeof region !== 'string') return false;
  const r = region.trim();
  return /^on$/i.test(r) || /\bontario\b/i.test(r);
}

export interface OntarioMix {
  readonly ontarioPoints: number;
  readonly otherPoints: number;
  readonly ontarioShare: number;
  readonly ontarioProducts: number;
  /** True when at least one scored point is from Ontario, so the score can be weighted to it. */
  readonly weightable: boolean;
  readonly note: string;
  /** One flag per fold.testPoints entry, in order. */
  readonly flags: readonly boolean[];
}

/** Tags each scored point Ontario or not, from the region of the observation it came from. */
export function ontarioMix(fold: Pick<Fold, 'testPoints'>, obs: readonly Observation[]): OntarioMix {
  const region = new Map<string, string | null>();
  for (const o of obs) region.set(`${o.seller}|${o.sellerSku}|${o.seenOn}|${o.cents}`, o.region);
  const flags = fold.testPoints.map((p) => isOntario(region.get(`${p.seller}|${p.sellerSku}|${p.seenOn}|${p.cents}`)));
  const on = flags.filter(Boolean).length;
  const n = fold.testPoints.length;
  const products = new Set(fold.testPoints.filter((_, i) => flags[i]).map((p) => p.key)).size;
  return {
    ontarioPoints: on,
    otherPoints: n - on,
    ontarioShare: n ? on / n : 0,
    ontarioProducts: products,
    weightable: on > 0,
    note:
      on > 0
        ? `${on} of ${n} scored prices are from Ontario (${products} products); scores can be weighted to the shopper mix`
        : `no Ontario prices among the ${n} scored: the test cannot be weighted to the shopper mix and its score is NOT an Ontario score`,
    flags,
  };
}

/**
 * The share of `hit` that is true, with Ontario points carrying `target` of
 * the weight and the rest carrying 1 - target. target 1 is Ontario only.
 * Null when there is no Ontario point to weight (never a silent fallback to
 * the unweighted rate).
 */
export function weightedRate(hit: readonly boolean[], ontario: readonly boolean[], target = 1): number | null {
  if (hit.length !== ontario.length) throw new Error('weightedRate: hit and ontario differ in length');
  const on = ontario.filter(Boolean).length;
  const off = ontario.length - on;
  if (on === 0) return null;
  const rate = (want: boolean) => {
    const idx = ontario.map((o, i) => (o === want ? i : -1)).filter((i) => i >= 0);
    return idx.length ? idx.filter((i) => hit[i]).length / idx.length : 0;
  };
  if (off === 0 || target >= 1) return rate(true);
  return target * rate(true) + (1 - target) * rate(false);
}

/* ------------------------------------------------------------ data support */

export interface DataSupport {
  readonly rows: number;
  readonly products: number;
  readonly dates: readonly string[];
  readonly regions: Readonly<Record<string, number>>;
  readonly ontarioRows: number;
  readonly productsPerDateCount: Readonly<Record<string, number>>;
  readonly productAndDate: {
    readonly possible: boolean;
    readonly reason: string;
    readonly cutoff?: string | null;
    readonly testProducts?: number;
    readonly testPoints?: number;
    readonly testSales?: number;
    readonly trainRows?: number;
    readonly trainProducts?: number;
  };
}

/** What the data supports for the product-and-date holdout, counted. */
export function dataSupport(obs: readonly Observation[], guard: SealGuard, sales: readonly SaleItem[] = [], opts: { testFraction?: number; seed?: number } = {}): DataSupport {
  const keyed = obs.filter((o) => o.key !== null);
  const regions: Record<string, number> = {};
  for (const o of obs) regions[o.region ?? '(none)'] = (regions[o.region ?? '(none)'] ?? 0) + 1;
  const byKeyDates = new Map<string, Set<string>>();
  for (const o of keyed) (byKeyDates.get(o.key!) ?? byKeyDates.set(o.key!, new Set()).get(o.key!)!).add(o.seenOn);
  const perDate: Record<string, number> = {};
  for (const ds of byKeyDates.values()) perDate[String(ds.size)] = (perDate[String(ds.size)] ?? 0) + 1;
  const f = splitByProductAndDate(obs, sales, guard, opts);
  return {
    rows: obs.length,
    products: byKeyDates.size,
    dates: [...new Set(obs.map((o) => o.seenOn))].sort(),
    regions,
    ontarioRows: obs.filter((o) => isOntario(o.region)).length,
    productsPerDateCount: perDate,
    productAndDate: isFold(f)
      ? {
          possible: true,
          reason: f.description,
          cutoff: f.cutoff,
          testProducts: f.testKeys.size,
          testPoints: f.testPoints.length,
          testSales: f.testSales.length,
          trainRows: f.train.length,
          trainProducts: new Set(f.train.flatMap((o) => (o.key ? [o.key] : []))).size,
        }
      : { possible: false, reason: f.impossible },
  };
}
