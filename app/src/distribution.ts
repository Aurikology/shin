/**
 * The app side of the price verdict as a distribution
 * (docs/verdict-distribution-design-2026-09-30.md, Server unit). The ladder and
 * the `verdict` contract live in price/src/estimate.ts; this file is the glue
 * every answer path shares:
 *
 *   - `onceAsk`: the capped, no-web-search Claude range ask
 *     (identify/src/range-ask.ts `askTypicalRange`, wrapped by the server with
 *     the paid-call limiter) called AT MOST ONCE per answer, so the verdict's
 *     `claude_typical` rung and the older `range` field share one call and one
 *     cap slot. RULINGS.md "Catalogue first; Claude, with no web search, is the
 *     capped price-range fallback".
 *   - `readShelfCents`: the shelf price a request carries, whole cents.
 *   - `sortByName`: places a name in a catalogue category with the existing
 *     catalogue search (design cases 2 and 5), never writing a miss.
 *   - `verdictRecord`: the three facts the scan row keeps (basis, confidence,
 *     zone) plus the centre and spread shown, for scoring later.
 */

import type { ClaudeAnswer, ClaudeIdentity, EstimateDeps, Verdict } from '../../price/src/estimate.ts';
import type { RangeAskResult, RangeIdentity } from '../../identify/src/range-ask.ts';

export type RangeAsk = (identity: RangeIdentity) => Promise<RangeAskResult | { ok: false; reason: 'rate_limited' }>;
export type RangeAskOutcome = RangeAskResult | { ok: false; reason: 'rate_limited' | 'model_error' };

/** One Claude ask per answer, shared by every reader of it. */
export interface OnceAsk {
  /** For estimate's `askClaude`. */
  readonly askClaude: NonNullable<EstimateDeps['askClaude']>;
  /** The ask's promise, or null when nothing asked yet. */
  started(): Promise<RangeAskOutcome> | null;
  /** The settled outcome, or undefined while it is still running (or never started). */
  settled(): RangeAskOutcome | undefined;
  /** Asks (or joins the ask already made) with a full identity. */
  ask(identity: RangeIdentity): Promise<RangeAskOutcome>;
}

export function onceAsk(askRange: RangeAsk | undefined, categoryName: string | null = null): OnceAsk | null {
  if (!askRange) return null;
  let promise: Promise<RangeAskOutcome> | null = null;
  let done: RangeAskOutcome | undefined;
  const ask = (identity: RangeIdentity): Promise<RangeAskOutcome> => {
    if (!promise) {
      promise = (async () => {
        try {
          return await askRange(identity);
        } catch {
          return { ok: false as const, reason: 'model_error' as const };
        }
      })().then((r) => {
        done = r;
        return r;
      });
    }
    return promise;
  };
  return {
    ask,
    started: () => promise,
    settled: () => done,
    askClaude: async (id: ClaudeIdentity): Promise<ClaudeAnswer> => {
      const r = await ask({ name: id.name, brand: id.brand, size: id.size, category: categoryName ?? id.category, market: id.market });
      return r.ok
        ? { ok: true, lowCents: r.range.lowCents, highCents: r.range.highCents, currency: r.range.currency }
        : { ok: false, reason: r.reason };
    },
  };
}

/** A shelf price off a request: a positive number of cents, whole. Anything else is no price. */
export function readShelfCents(raw: unknown): number | null {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 100_000_000) return null;
  return Math.round(n);
}

/** Thresholds as sent: an object, or one JSON parameter in a query string. */
export function readThresholdsRaw(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  }
  return raw && typeof raw === 'object' ? raw : undefined;
}

/**
 * The existing catalogue search as a category sorter: the top candidate's
 * leaf and path, when the search found anything. Never records a miss.
 */
export function sortByName(searcher: { search(q: unknown): Promise<unknown> } | null): EstimateDeps['sortName'] {
  if (!searcher) return undefined;
  return async (name: string) => {
    // The size is not a sorting word ("Vodka 750 ml" sorts as "Vodka"), and a unit left in the
    // text makes the word arm miss and hand the search to the vector arm.
    const words = name.replace(/(?:\d+\s*[x*]\s*)?(?:\d+(?:[.,]\d+)?|\.\d+)\s*(?:fl\.?\s*oz|[a-zA-Z]+)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const result = (await searcher.search({ text: words || name, vectors: false, limit: 5, recordMiss: false })) as {
      band?: string;
      candidates?: readonly { leafCategory?: string | null; categoryPath?: readonly string[] }[];
    } | null;
    if (!result || result.band === 'miss') return null;
    const top = result.candidates?.find((c) => (c.categoryPath?.length ?? 0) > 0 || c.leafCategory);
    if (!top) return null;
    return { leafCategory: top.leafCategory ?? null, categoryPath: top.categoryPath ?? [] };
  };
}

/**
 * D-235: the zone-to-tier mapping the client draws its sheet with (public/js/lib/verdict-chart.js
 * ZONE_TIER, the `data-tier` and `peek_${tier}` of camera.js); a verdict with no zone is `unknown`.
 * A test pins the two copies to each other.
 */
const ZONE_TIERS: Readonly<Record<string, string>> = { great: 'good', good: 'good', reasonable: 'fair', bad: 'walk_away' };
export function tierOfZone(zone: string | null): string {
  return (zone !== null && ZONE_TIERS[zone]) || 'unknown';
}

/** What the scan row keeps of a verdict (migration 19). */
export interface VerdictRecord {
  /** D-235: the tier the sheet showed (good, fair, walk_away, or unknown with no zone), as the client draws it. */
  readonly verdictTier: string | null;
  /** D-235: the zone the shown verdict placed the shopper's price in ("Great price"), or null with no price. */
  readonly verdictZone: string | null;
  readonly estimateBasis: string | null;
  readonly estimateConfidence: string | null;
  readonly estimateZone: string | null;
  readonly estimateCentreCents: number | null;
  readonly estimateSigmaLog: number | null;
}

export function verdictRecord(v: Verdict | null): VerdictRecord {
  return {
    verdictTier: v ? tierOfZone(v.shopper?.zone ?? null) : null,
    verdictZone: v?.shopper?.zone ?? null,
    estimateBasis: v?.basis ?? null,
    estimateConfidence: v?.confidence ?? null,
    estimateZone: v?.shopper?.zone ?? null,
    estimateCentreCents: v?.centreCents ?? null,
    estimateSigmaLog: v?.sigmaLog ?? null,
  };
}

/**
 * D-235: where the range a verdict shows came from, in the words the scan row's
 * `range_source` and `range_basis` use. Pexi's own prices and its category pools
 * are `shin_prices` (the basis is the rung); Claude's typical range is
 * `claude_typical`; a prior is neither, so its source is `none` and the basis
 * still names the prior. Null with no verdict.
 */
export function shownRange(v: Verdict | null): { rangeSource: 'shin_prices' | 'claude_typical' | 'none'; rangeBasis: string } | null {
  if (!v) return null;
  if (v.basis === 'claude_typical') return { rangeSource: 'claude_typical', rangeBasis: v.basis };
  if (v.basis === 'category_prior' || v.basis === 'global_prior') return { rangeSource: 'none', rangeBasis: v.basis };
  return { rangeSource: 'shin_prices', rangeBasis: v.basis };
}
