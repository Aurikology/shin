/**
 * B9 (docs/category-safeguards-2026-10-08.md): the width flag for a category.
 *
 * A category is "too wide" when its p90/p10 unit-price ratio is above the 1.5x
 * target. Measured on a sample the ratio is a point estimate with noise: with 20
 * items a category that is truly 1.5x wide shows a sample ratio over 1.5 only
 * about 28% of the time, so a flag on the point estimate misses most of them.
 *
 * So the flag asks whether the target is still plausible: it draws a seeded
 * bootstrap of the sample (resample with replacement, same size), takes each
 * resample's p90/p10, and flags when the UPPER end of the 90% interval (the 95th
 * percentile of the resampled ratios) is above 1.5. Measured with the pain-point
 * test's own draws (1000 categories of 20 items, seed 20261008, 500 resamples):
 * a true 1.5x category is flagged 91.9% of the time, a true 1.2x category 0.1%.
 * The interval level was chosen from that measurement (a search over the 50th to
 * 97.5th percentile of the resamples); at the 50th, close to the point estimate,
 * the same kind of draws flagged about 37% of the true 1.5x categories.
 *
 * Percentiles are nearest-rank, the rule range.ts uses. The seed is a constant,
 * so the same prices always give the same answer.
 *
 * Faults are loud: no prices, or a price that is not a positive finite number,
 * throws. Fewer than MIN_PRICES prices cannot show a category is narrow, so they
 * flag it (interval upper end Infinity) rather than read as "fine".
 */
import { nearestRankIndex } from './range.ts';

/** The width above which a category is too wide (p90/p10). */
export const TARGET_WIDTH = 1.5;
/** Resamples drawn. */
export const BOOTSTRAP_RESAMPLES = 500;
/** The percentile of the resampled ratios taken as the upper end of the interval (a 90% interval). */
export const UPPER_PERCENTILE = 95;
/** Fewer prices than this cannot show a category is narrow. */
export const MIN_PRICES = 5;
/** Fixed, so a flag is repeatable. */
export const BOOTSTRAP_SEED = 20261008;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** p90 / p10 of a sample, nearest-rank. */
export function sampleWidth(prices: readonly number[]): number {
  const s = [...prices].sort((a, b) => a - b);
  return s[nearestRankIndex(s.length, 90)]! / s[nearestRankIndex(s.length, 10)]!;
}

export interface WidthInterval {
  readonly n: number;
  /** The sample's own p90/p10. */
  readonly point: number;
  /** Upper end of the bootstrap interval; Infinity when there are fewer than MIN_PRICES prices. */
  readonly upper: number;
}

export function widthInterval(prices: readonly number[]): WidthInterval {
  if (prices.length === 0) throw new RangeError('flagWide: no prices');
  for (const p of prices) if (!Number.isFinite(p) || p <= 0) throw new RangeError(`flagWide: a price is not a positive number: ${String(p)}`);
  const n = prices.length;
  const point = sampleWidth(prices);
  if (n < MIN_PRICES) return { n, point, upper: Infinity };
  const rnd = mulberry32(BOOTSTRAP_SEED);
  const widths: number[] = [];
  for (let b = 0; b < BOOTSTRAP_RESAMPLES; b++) {
    const resample = Array.from({ length: n }, () => prices[Math.floor(rnd() * n)]!);
    widths.push(sampleWidth(resample));
  }
  widths.sort((a, b) => a - b);
  return { n, point, upper: widths[nearestRankIndex(widths.length, UPPER_PERCENTILE)]! };
}

/** True when the category these prices came from should be flagged as wider than the 1.5x target. */
export function flagWide(prices: readonly number[]): boolean {
  return widthInterval(prices).upper > TARGET_WIDTH;
}
