/**
 * live_estimate: the app's LAST RUNG, scored. For a product with no price range of its own, the app
 * (app/src/catalogue-first.ts `lastRungRange`) shows the verdict ladder's bell from price/src/estimate.ts
 * `estimate()`, p10 to p90, under `confidence: 'low'`. This model calls that same code the way the app
 * does for a scanned, named product (`safeEstimate` with identity 'sure', then `lastRungRange`), against
 * the training fold's prices and the real catalogue, and answers with the range the shopper would see.
 *
 *   claims 0.8     p10 to p90 is an 80% band. category_range and price_tree claim 0.5 (p25 to p75), so
 *                  their hit rates say nothing about this one. Only this model measures the last rung.
 *   skips          where `lastRungRange` would fall to `fixed_prior` (no price in the department, a pool
 *                  set aside as too wide or too thin, or no estimate at all) the app shows a fixed wide
 *                  bell that says "we hold nothing"; that is not an estimate, so the model returns no
 *                  answer and counts it as a skip (`report().skipped`). `national_average` cannot occur:
 *                  the Statistics Canada rung is not passed in, and would be skipped too (not Pexi's data).
 *
 * No Claude ask, no name sort, no shopper price: the bench holds none of them. The answer is async, so it
 * is run with `evaluateAsync`. NO WIDENING here: this is the measurement the calibration is fitted from.
 *
 * Speed: `estimate()` re-reads the whole training fold per query unless the price handle is a file (its
 * read cache is for files, per day). The harness hands this model an in-memory handle, so a full live run
 * is slow; that is a cost of exact mirroring, not a bug.
 */

import { lastRungRange, safeEstimate } from '../../app/src/catalogue-first.ts';
import { readBrands } from '../../price/src/price-tree-range.ts';
import { spellings } from './data.ts';
import type { Model, Query } from './harness.ts';
import type { Interval } from './score.ts';

export const LIVE_ESTIMATE_CLAIM = 0.8;

export function liveEstimateModel(): Model {
  let answeredBasis: Record<string, number> = {};
  let skipped: Record<string, number> = {};
  return {
    name: 'live_estimate',
    description: "the app's last rung: estimate() verdict p10 to p90 as lastRungRange shows it (shin_estimate); skips where the app would show the fixed prior",
    claimedCoverage: LIVE_ESTIMATE_CLAIM,
    runnable: true,
    fit() {
      throw new Error('live_estimate answers asynchronously; run it with evaluateAsync');
    },
    fitAsync(ctx) {
      answeredBasis = {};
      skipped = {};
      const skip = (why: string): null => {
        skipped[why] = (skipped[why] ?? 0) + 1;
        return null;
      };
      return async (q: Query): Promise<Interval | null> => {
        const brand = readBrands(ctx.catalogue, spellings, [q.key]).get(q.key) ?? null;
        const est = await safeEstimate(
          {
            barcode: q.code,
            name: q.info?.name ?? null,
            brand,
            size: q.info?.size ?? null,
            leafCategory: q.info?.leaf ?? null,
            categoryPath: q.info?.path ?? null,
            region: null,
            country: null,
            currency: 'CAD',
            asOf: q.asOf,
          },
          null,
          { prices: ctx.prices, catalogue: ctx.catalogue, taxonomy: null },
          { grade: 'sure' },
        );
        const last = lastRungRange(est, 'CAD');
        if (last.source !== 'shin_estimate') {
          const why = est === null ? 'no_estimate' : est.trace.noPrices ? 'no_prices' : est.trace.tooThin ? 'too_thin' : last.source;
          return skip(`${last.source}:${why}`);
        }
        const r = last.range;
        answeredBasis[r.basis] = (answeredBasis[r.basis] ?? 0) + 1;
        return { lowCents: r.lowCents, highCents: r.highCents, midCents: r.medianCents ?? Math.round(Math.sqrt(r.lowCents * r.highCents)) };
      };
    },
    report: () => ({ answeredBy: { ...answeredBasis }, skipped: { ...skipped } }),
  };
}
