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

/**
 * Median over an unsorted list. An even count takes the LOWER of the two
 * middles, never their mean.
 *
 * Same rule as `percentile` below, for the reason its own comment gives: every
 * number this file returns can end up inside a sentence shown to a shopper, so
 * it has to be a price somebody actually charged. Averaging two middles invents
 * one. Two regular prices of $3.47 and $0.99 used to render as "Regular price
 * is about $2.23 across 2 stores", and $2.23 is charged nowhere -- it was also
 * the number the walk-away threshold was computed from.
 *
 * `spine.ts` had already written this rule and its own private copy of this
 * function to obey it, citing AVATAR.md: "always a price somebody actually
 * asked". Two medians in one engine, and the averaging one was the one the
 * shopper's sentence and the tier ladder both called. There is one now.
 *
 * The old doc line here read "the lower-of-two mean", which described neither
 * behaviour and is how the disagreement stayed invisible.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('median of empty set');
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : s[mid - 1]!;
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

/**
 * Whole days between two ISO dates, floored, never negative.
 *
 * The floor at zero is why `isFutureDated` exists separately. A feed whose clock
 * runs ahead, or a flyer stamped with the date it takes effect, reads as age
 * zero here and would silently defeat every staleness window at once.
 */
export function ageDays(observedAt: string, asOf: string): number {
  const a = Date.parse(observedAt);
  const b = Date.parse(asOf);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new Error(`unparseable date: ${observedAt} / ${asOf}`);
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

/** A point stamped after the moment we are pricing at. Rejected, never aged to zero. */
export function isFutureDated(observedAt: string, asOf: string): boolean {
  const a = Date.parse(observedAt);
  const b = Date.parse(asOf);
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  // One day of slack, because a feed stamping a plain date in a timezone ahead
  // of ours is normal and is not the failure this guards.
  return a - b > 86_400_000;
}

/**
 * A price we are willing to reason about. NaN is the case that matters: it
 * survives every `<=` and `>` comparison as false, so an unparsed price falls
 * through a tier ladder into whatever the last `else` happens to be.
 */
export function isUsableAmount(cents: unknown): cents is number {
  return typeof cents === 'number' && Number.isFinite(cents) && cents > 0;
}

/** "cheaper", "the same", "dearer", the direction word, so sentences read like English. */
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
