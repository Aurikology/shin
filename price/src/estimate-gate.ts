/**
 * REQUIREMENT 6.3: "Store Claude answers as estimates, never observed prices, and keep them out of
 * any category with 5+ observed prices. Pass when 0 estimates in those categories."
 * Plan Part 6: "Estimates kept apart, with a gate at read time and a control."
 *
 * KEPT APART. A Claude answer is written to the range ask's own append-only log
 * (identify/src/range-ask-store.ts, `<store>.answers.jsonl`), never to the `observation` table that
 * every price rung reads (price/src/store.ts). Nothing in the ask's code path opens the price
 * database for writing (app/test/estimates-kept-apart.test.ts checks both).
 *
 * THE GATE AT READ TIME. The one way an estimate may be read back as category data is
 * `estimatesForCategory`, and it hands back none for a category that holds 5 or more observed prices
 * (`ESTIMATE_GATE_OBSERVED`, the same 5 as range.ts MIN_CATEGORY_PRODUCTS). Below that, an estimate
 * may help start an empty category's range (requirement 6.6, not built yet: no ladder reads an
 * estimate into a pool today; when one does, it reads through here).
 *
 * WHAT THIS IS NOT. The item-level Claude answer a shopper's scan gets (the `claude_typical` rung) is
 * not category data and is not gated here: D-233 asks Claude for exactly the item whose category pool
 * is too wide to use, which is often a category with 5+ prices. Gating that read too would undo
 * D-233; that is a decision for the founders, not this file.
 *
 * Reads only. Never throws on a bad line: a line that is not a usable estimate is skipped and counted.
 */
import type { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';

/** A category with this many observed prices or more reads no estimates. */
export const ESTIMATE_GATE_OBSERVED = 5;

/** One Claude answer, read back as what it is: an estimate, never an observed price. */
export interface StoredEstimate {
  readonly kind: 'estimate';
  readonly item: string;
  /** The category the ask carried, as the ask wrote it (a name like "Cookies", or null). */
  readonly category: string | null;
  readonly lowCents: number;
  readonly highCents: number;
  readonly currency: string;
  readonly model: string;
  readonly askedAt: string;
}

/**
 * The usable ranges in the ask's answer log, as estimates. Rows that are not a valid range
 * (`model_does_not_know`, a refusal, a transport error) are skipped: they carry no number.
 */
export function readStoredEstimates(answersPath: string): { estimates: StoredEstimate[]; skipped: number } {
  if (!existsSync(answersPath)) return { estimates: [], skipped: 0 };
  const estimates: StoredEstimate[] = [];
  let skipped = 0;
  for (const line of readFileSync(answersPath, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      const r = JSON.parse(line) as Record<string, unknown>;
      const raw = (r.raw ?? null) as Record<string, unknown> | null;
      const low = raw?.low_cents;
      const high = raw?.high_cents;
      if (
        r.outcome !== 'ok' ||
        !Number.isInteger(low) || !Number.isInteger(high) || (low as number) <= 0 || (low as number) > (high as number) ||
        typeof raw?.currency !== 'string' || typeof r.item !== 'string'
      ) {
        skipped += 1;
        continue;
      }
      estimates.push({
        kind: 'estimate',
        item: r.item,
        category: typeof r.category === 'string' ? r.category : null,
        lowCents: low as number,
        highCents: high as number,
        currency: raw.currency,
        model: typeof r.model === 'string' ? r.model : '',
        askedAt: typeof r.askedAt === 'string' ? r.askedAt : '',
      });
    } catch {
      skipped += 1;
    }
  }
  return { estimates, skipped };
}

/** "en:peanut-butters", "Peanut butters" and "peanut butters" all meet as "peanut butters". */
export function categoryKey(tagOrName: string | null | undefined): string {
  return (tagOrName ?? '').trim().toLowerCase().replace(/^[a-z]{2}:/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Observed regular prices in one category: `observation` rows (not a sale, not an unverified
 * printout) for products the catalogue places at `tag` anywhere on their path. Shopper-typed prices
 * live elsewhere and are not counted (range.ts says why).
 */
export function observedPricesIn(prices: DatabaseSync, catalogue: DatabaseSync, tag: string): number {
  const codes = (catalogue
    .prepare(`SELECT code FROM product WHERE leaf_category = ? OR category_path LIKE ?`)
    .all(tag, `%${JSON.stringify(tag)}%`) as { code: string }[]).map((r) => r.code);
  if (codes.length === 0) return 0;
  const cols = new Set((prices.prepare('PRAGMA table_info(observation)').all() as { name: string }[]).map((c) => c.name));
  const notSale = cols.has('is_sale') ? 'AND COALESCE(is_sale, 0) = 0' : '';
  // A printout row (it carries a capture tile) counts only once verified, as in estimate.ts.
  const verified = cols.has('capture_tile_id') && cols.has('price_verified') ? 'AND (capture_tile_id IS NULL OR price_verified = 1)' : '';
  let n = 0;
  for (let i = 0; i < codes.length; i += 500) {
    const chunk = codes.slice(i, i + 500);
    const row = prices
      .prepare(`SELECT COUNT(*) AS n FROM observation WHERE code IN (${chunk.map(() => '?').join(',')}) AND kind <> 'promotional' ${notSale} ${verified}`)
      .get(...chunk) as { n: number };
    n += row.n;
  }
  return n;
}

/**
 * THE GATE. The estimates a category's range may read: those asked under this category, and none at
 * all once the category holds `ESTIMATE_GATE_OBSERVED` observed prices.
 */
export function estimatesForCategory(tag: string, estimates: readonly StoredEstimate[], observedCount: number): StoredEstimate[] {
  if (!(observedCount < ESTIMATE_GATE_OBSERVED)) return [];
  const key = categoryKey(tag);
  if (key === '') return [];
  return estimates.filter((e) => e.kind === 'estimate' && categoryKey(e.category) === key);
}
