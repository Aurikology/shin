/**
 * Cents in, cents out. No floats anywhere near a price.
 *
 * Everything here is integer arithmetic because the whole product is one
 * comparison and a rounding drift of a cent is a wrong face on the screen.
 */

export function cad(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Median over an unsorted list. Even lengths take the lower-of-two mean, rounded. */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('median of empty set');
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * Nearest-rank percentile. Chosen over interpolation deliberately: every value
 * it returns is a price someone actually charged, which matters when the number
 * ends up inside a sentence shown to a shopper.
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error('percentile of empty set');
  const s = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * s.length));
  return s[rank - 1];
}

export function min(values: readonly number[]): number {
  if (values.length === 0) throw new Error('min of empty set');
  return values.reduce((a, b) => (b < a ? b : a));
}

export function max(values: readonly number[]): number {
  if (values.length === 0) throw new Error('max of empty set');
  return values.reduce((a, b) => (b > a ? b : a));
}

/** Whole days between two ISO dates, floored, never negative. */
export function ageDays(observedAt: string, asOf: string): number {
  const a = Date.parse(observedAt);
  const b = Date.parse(asOf);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new Error(`unparseable date: ${observedAt} / ${asOf}`);
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

/** "cheaper", "the same", "dearer" — the direction word, so sentences read like English. */
export function relation(askingCents: number, referenceCents: number): 'under' | 'level' | 'over' {
  if (askingCents < referenceCents) return 'under';
  if (askingCents > referenceCents) return 'over';
  return 'level';
}

/** e.g. 147 vs 55 -> "2.7x". Used only where the ratio is the point. */
export function ratio(highCents: number, lowCents: number): number {
  if (lowCents <= 0) return Number.POSITIVE_INFINITY;
  return Math.round((highCents / lowCents) * 100) / 100;
}
