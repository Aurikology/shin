/**
 * B2 splits. Two ways to hide the answer from the model:
 *
 *   by product (grouped): every observation of a test product is removed from
 *     what the model learns from, so the same product is never on both sides.
 *     This is scikit-learn's GroupKFold idea with the barcode as the group.
 *     It tests the case "Shin has never priced this item".
 *   by time: the model learns on observations seen strictly before a cutoff
 *     date and is scored on prices seen on or after it. Which products are
 *     scored is decided from the TRAINING side only: products with their own
 *     regular prices at 3+ shops before the cutoff. It tests the case "Shin
 *     priced this item before; is today's price where it said".
 *
 * Every split runs the sealed-batch guard first (sealed.ts) and refuses a
 * guard that module did not issue. Every fold it makes is registered, and the
 * harness refuses a fold it did not make, so neither check can be skipped by
 * a caller that builds its own.
 *
 * Every prediction is made "as of" the day the true price was seen, which is
 * Zillow's lesson: score the answer as it would have been shown then.
 *
 * WHICH SPLIT COUNTS (boss decision, 2026-09-28): the gate verdict that counts
 * is the by-time split, plus the sealed batch when it is opened. The
 * by-product split is reported and is not a pass requirement: it measures cold
 * start on products never seen, where only category-level models can answer.
 */

import { keyExclusion, latestPerShop, type Observation } from './data.ts';
import { buildPredictionKey, MIN_KEY_SHOPS, type PredictionItem, type SaleItem, type TruthPoint } from './keys.ts';
import { applyGuard, assertIssued, type SealGuard } from './sealed.ts';

/**
 * Share of products (by product) or of dated rows (by time) held out.
 * DEFAULT, changeable by Jamin: 30% leaves most data to learn on while giving
 * each category a usable number of test items.
 */
export const TEST_FRACTION = 0.3;

/** FNV-1a over the key and seed, avalanched, mapped to [0, 1). Deterministic: a product is always on the same side. */
export function groupHash(key: string, seed = 0): number {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // murmur3's final mix: FNV alone barely moves the high bits when keys differ only at the end.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Whether a fold's gate verdict is a pass requirement (by time and sealed) or reported only (by product). */
export function foldCounts(name: Fold['name']): boolean {
  return name !== 'by_product';
}

export interface Fold {
  readonly name: 'by_product' | 'by_time' | 'sealed';
  readonly description: string;
  /** Observations the model may learn from. */
  readonly train: readonly Observation[];
  /** Truth points to score, each predicted as of its own seenOn. */
  readonly testPoints: readonly TruthPoint[];
  /** Sale rows to score the low/high check on (only those with a barcode). */
  readonly testSales: readonly SaleItem[];
  /** Product keys on the test side, for the no-overlap check. */
  readonly testKeys: ReadonlySet<string>;
  readonly cutoff: string | null;
  readonly sealed: { readonly mode: SealGuard['mode']; readonly sha256: string | null };
}

export interface Unsplittable {
  readonly name: Fold['name'];
  readonly impossible: string;
}

const made = new WeakSet<object>();

/** True only for folds made by this module (after the sealed guard ran). */
export function isIssuedFold(f: Fold): boolean {
  return made.has(f);
}

function register(f: Fold): Fold {
  made.add(f);
  return f;
}

/** The guard's effect on the inputs, before any split. An opened guard is only for `splitSealedOpen`. */
function guarded(obs: readonly Observation[], pred: readonly PredictionItem[], sales: readonly SaleItem[], guard: SealGuard) {
  assertIssued(guard);
  if (guard.mode === 'opened') throw new Error('an opened sealed batch is scored only by splitSealedOpen');
  return { obs: applyGuard(obs, guard), pred: applyGuard(pred, guard), sales: applyGuard(sales, guard) };
}

export function splitByProduct(
  allObs: readonly Observation[],
  allPred: readonly PredictionItem[],
  allSales: readonly SaleItem[],
  guard: SealGuard,
  testFraction = TEST_FRACTION,
  seed = 0,
): Fold | Unsplittable {
  const { obs, pred, sales } = guarded(allObs, allPred, allSales, guard);
  const isTest = (k: string | null) => k !== null && groupHash(k, seed) < testFraction;
  const testKeys = new Set<string>();
  for (const p of pred) if (isTest(p.key)) testKeys.add(p.key);
  for (const s of sales) if (isTest(s.key)) testKeys.add(s.key!);
  if (testKeys.size === 0) return { name: 'by_product', impossible: 'no product with a barcode landed on the test side (key is empty or too small)' };
  return register({
    name: 'by_product',
    description: `grouped by barcode, ${Math.round(testFraction * 100)}% of products held out, seed ${seed}; the model never sees any price of a held-out product`,
    train: obs.filter((o) => o.key === null || !testKeys.has(o.key)),
    testPoints: pred.filter((p) => testKeys.has(p.key)).flatMap((p) => p.points),
    testSales: sales.filter((s) => s.key !== null && testKeys.has(s.key)),
    testKeys,
    cutoff: null,
    sealed: { mode: guard.mode, sha256: guard.sha256 },
  });
}

/**
 * The cutoff date from row DATES alone (never prices): the date at the
 * (1 - testFraction) quantile, moved forward if needed so that at least one
 * date lies before it.
 */
export function timeCutoff(points: readonly { seenOn: string }[], testFraction = TEST_FRACTION): string | null {
  const dates = [...new Set(points.map((p) => p.seenOn))].sort();
  if (dates.length < 2) return null;
  const sorted = points.map((p) => p.seenOn).sort();
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * (1 - testFraction))));
  let cut = sorted[idx]!;
  if (cut <= dates[0]!) cut = dates[1]!;
  return cut;
}

export interface TimeOptions {
  readonly testFraction?: number;
  /** A fixed cutoff (ISO date) instead of the quantile. */
  readonly cutoff?: string;
}

export function splitByTime(
  allObs: readonly Observation[],
  allSales: readonly SaleItem[],
  guard: SealGuard,
  opts: TimeOptions = {},
): Fold | Unsplittable {
  const { obs, sales } = guarded(allObs, [], allSales, guard);
  const cutoff = opts.cutoff ?? timeCutoff(obs.filter((o) => o.key !== null), opts.testFraction ?? TEST_FRACTION);
  if (cutoff === null) {
    const n = new Set(obs.map((o) => o.seenOn)).size;
    return { name: 'by_time', impossible: `the prices span ${n <= 1 ? 'one date' : 'too few dates'}; learning on older and scoring on newer needs at least two` };
  }
  const train = obs.filter((o) => o.seenOn < cutoff);
  // Membership from the training side only: products that already had their own prices at 3+ shops.
  const known = new Set(buildPredictionKey(train, MIN_KEY_SHOPS).map((p) => p.key));
  const later = obs.filter((o) => o.seenOn >= cutoff && !o.isSale && o.key !== null && known.has(o.key) && !keyExclusion(o));
  const byKey = new Map<string, Observation[]>();
  for (const o of later) (byKey.get(o.key!) ?? byKey.set(o.key!, []).get(o.key!)!).push(o);
  const testPoints: TruthPoint[] = [];
  for (const [key, list] of byKey) {
    for (const s of latestPerShop(list)) {
      testPoints.push({ key, code: s.code!, shop: s.shop, seller: s.seller, sellerSku: s.sellerSku, name: s.sellerName, url: s.url, cents: s.cents, seenOn: s.seenOn });
    }
  }
  // Sales too: only products present in training, the same rule as the price queries.
  const testSales = sales.filter((s) => s.key !== null && s.seenOn >= cutoff && known.has(s.key));
  if (testPoints.length === 0 && testSales.length === 0) {
    return { name: 'by_time', impossible: `nothing to score on or after ${cutoff} for products known before it` };
  }
  return register({
    name: 'by_time',
    description: `learn on prices seen before ${cutoff}; score prices seen on or after it, for products with their own prices at ${MIN_KEY_SHOPS}+ shops before it`,
    train,
    testPoints,
    testSales,
    testKeys: new Set([...testPoints.map((p) => p.key), ...testSales.map((s) => s.key!)]),
    cutoff,
    sealed: { mode: guard.mode, sha256: guard.sha256 },
  });
}

export function isFold(f: Fold | Unsplittable): f is Fold {
  return !('impossible' in f);
}

/**
 * The one scoring of an opened sealed batch: learn on everything except the
 * sealed products, score only them. Grouped by product, like `splitByProduct`.
 */
export function splitSealedOpen(
  obs: readonly Observation[],
  pred: readonly PredictionItem[],
  sales: readonly SaleItem[],
  guard: SealGuard,
): Fold | Unsplittable {
  assertIssued(guard);
  if (guard.mode !== 'opened') throw new Error('splitSealedOpen needs a guard from guardSealed(..., { openSealed: true })');
  const sealed = guard.only;
  const testPoints = pred.filter((p) => sealed.has(p.key)).flatMap((p) => p.points);
  const testSales = sales.filter((s) => s.key !== null && sealed.has(s.key));
  if (testPoints.length === 0 && testSales.length === 0) {
    return { name: 'sealed', impossible: 'none of the sealed keys are in the answer keys' };
  }
  return register({
    name: 'sealed',
    description: `sealed batch: ${sealed.size} sealed products held out, everything else learned on`,
    train: obs.filter((o) => o.key === null || !sealed.has(o.key)),
    testPoints,
    testSales,
    testKeys: new Set(sealed),
    cutoff: null,
    sealed: { mode: guard.mode, sha256: guard.sha256 },
  });
}
