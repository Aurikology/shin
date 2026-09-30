/**
 * B4. Baselines on record. Every later model must beat all three on the same items.
 *
 *   category_range   today's answer: `price/src/range.ts` `priceRangeFor`,
 *                    called exactly as the product would call it (barcode and
 *                    as-of date), against the training-side database. Under
 *                    the by-product split the product's own prices are absent,
 *                    so its own-product step cannot fire and the ladder falls
 *                    to the category; under the by-time split it may use the
 *                    product's older prices. Claims 50%: the range is the 25th
 *                    to 75th percentile.
 *   category_median  a point estimate: the median of the per-product median
 *                    prices in the product's leaf category (5+ products), else
 *                    its parent. No size scaling and no 90-day window, on
 *                    purpose: it is the floor any model must clear.
 *   claude_guess     Claude's no-web-search guess on a 200-item sample, cost
 *                    logged. ON RECORD, NOT RUN: this lane has no network. The
 *                    request and answer shapes are fixed here so the run is a
 *                    drop-in later.
 */

import { priceRangeFor } from '../../price/src/range.ts';
import { latestPerShop, lowerMedian, readCatalogueInfo, type Observation } from './data.ts';
import type { Model, Query } from './harness.ts';
import type { Interval } from './score.ts';
import { rng } from './audit.ts';
import { REQUIRED_BASELINE } from './ids.ts';

export const MIN_CATEGORY_PRODUCTS = 5;

export function categoryRangeModel(): Model {
  const bases: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  return {
    [REQUIRED_BASELINE]: 'category_range',
    name: 'category_range',
    description: "today's range: price/src/range.ts priceRangeFor (own prices at 3+ shops, else leaf category, else parent), 25th to 75th percentile",
    claimedCoverage: 0.5,
    runnable: true,
    fit(ctx) {
      return (q: Query): Interval | null => {
        const r = priceRangeFor({ barcode: q.key, asOf: q.asOf }, { prices: ctx.prices, catalogue: ctx.catalogue });
        bases[r.basis] = (bases[r.basis] ?? 0) + 1;
        if (r.basis === 'none') {
          reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
          return null;
        }
        return { lowCents: r.lowCents, highCents: r.highCents, midCents: r.medianCents };
      };
    },
    report: () => ({ answeredBy: { ...bases }, noneReasons: { ...reasons } }),
  };
}

export function categoryMedianModel(): Model {
  let used: Record<string, number> = {};
  return {
    [REQUIRED_BASELINE]: 'category_median',
    name: 'category_median',
    description: 'point estimate: median of per-product median prices in the leaf category (5+ products), else parent; no size scaling, no window',
    claimedCoverage: 0,
    runnable: true,
    fit(ctx) {
      used = { leaf: 0, parent: 0, none: 0 };
      const byKey = new Map<string, Observation[]>();
      for (const o of ctx.observations) {
        if (o.isSale || !o.key) continue;
        (byKey.get(o.key) ?? byKey.set(o.key, []).get(o.key)!).push(o);
      }
      const info = readCatalogueInfo(ctx.catalogue, byKey.keys());
      const byLeaf = new Map<string, number[]>();
      const byTag = new Map<string, number[]>();
      for (const [key, list] of byKey) {
        const ci = info.get(key);
        if (!ci) continue;
        const m = lowerMedian(latestPerShop(list).map((o) => o.cents));
        if (ci.leaf) (byLeaf.get(ci.leaf) ?? byLeaf.set(ci.leaf, []).get(ci.leaf)!).push(m);
        for (const t of new Set(ci.path)) (byTag.get(t) ?? byTag.set(t, []).get(t)!).push(m);
      }
      const point = (c: number): Interval => ({ lowCents: c, highCents: c, midCents: c });
      return (q: Query): Interval | null => {
        const leaf = q.info?.leaf ?? null;
        const path = q.info?.path ?? [];
        const own = leaf ? byLeaf.get(leaf) : undefined;
        if (own && own.length >= MIN_CATEGORY_PRODUCTS) {
          used.leaf!++;
          return point(lowerMedian(own));
        }
        const idx = leaf ? path.lastIndexOf(leaf) : -1;
        const parent = idx > 0 ? path[idx - 1]! : null;
        const up = parent ? byTag.get(parent) : undefined;
        if (up && up.length >= MIN_CATEGORY_PRODUCTS) {
          used.parent!++;
          return point(lowerMedian(up));
        }
        used.none!++;
        return null;
      };
    },
    report: () => ({ answeredBy: { ...used } }),
  };
}

/* --------------------------------------------------- Claude, on record */

export interface ClaudeGuessRequest {
  readonly code: string;
  readonly name: string | null;
  readonly size: string | null;
  readonly category: string | null;
  readonly asOf: string;
  /** Province or city when the truth point has one. */
  readonly region: string | null;
}

export interface ClaudeGuessAnswer {
  readonly lowCents: number;
  readonly highCents: number;
  readonly midCents: number;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

export const CLAUDE_SAMPLE_SIZE = 200;

/** The fixed 200-item sample, drawn from the seed so every later model is scored on the same items. */
export function claudeSample<T extends { key: string }>(items: readonly T[], n = CLAUDE_SAMPLE_SIZE, seed = 20260928): T[] {
  const pool = [...items].sort((a, b) => (a.key < b.key ? -1 : 1));
  const rand = rng(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, n);
}

export function claudeGuessModel(): Model {
  return {
    name: 'claude_guess',
    description: `Claude, no web search, asked for a low/typical/high price on a ${CLAUDE_SAMPLE_SIZE}-item sample with cost logged`,
    claimedCoverage: 0.5,
    runnable: false,
    notRunReason: 'not run: this lane has no network and no API key. Interface fixed (ClaudeGuessRequest / ClaudeGuessAnswer, claudeSample); the run and its cost are still owed.',
    fit() {
      return () => null;
    },
  };
}

export function baselines(): Model[] {
  return [categoryRangeModel(), categoryMedianModel(), claudeGuessModel()];
}
