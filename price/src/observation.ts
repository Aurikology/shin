/**
 * What a price observation is, and nothing else.
 *
 * These two types were the only part of `price/src/verdict.ts` that anything
 * imported. The rest of that file was a second, complete verdict engine --
 * `judge`, `confidenceOf`, a tier ladder, its own money formatting -- reached
 * by nothing but its own test, in a repo that already has one verdict engine in
 * `spine/`. It was removed on 2026-09-08 rather than kept as a shape, per
 * CLAUDE.md's "ship or kill", and it is in git if it is ever wanted back.
 *
 * IT WAS NOT HARMLESS DEAD CODE, which is the reason for deleting it rather
 * than leaving it lying there. Its tier vocabulary was `good | fair | high`,
 * not the contract's `good | fair | walk_away`, so it could not have been wired
 * in without an adapter. And run against real shapes it was wrong about money
 * in three ways: one seller made its spread zero, which made every asking price
 * score `good` -- a $9.99 tag against a $2.00 shelf came back "at the low end";
 * its unit-price maths multiplied by 100 for every unit including `each`, so a
 * 12-pack at $5.99 printed "$49.92 per each"; and it computed staleness from
 * the OLDEST observation while saying "the newest price is over three weeks
 * old". The next person to find it would have found a finished-looking engine
 * with a test suite passing over all three.
 */

export type PriceKind = 'regular' | 'promotional';

export interface Observation {
  readonly seller: string;
  readonly amountCents: number;
  readonly kind: PriceKind;
  /** ISO date, the day the number was seen. */
  readonly observedAt: string;
  /** Pre-tax, always. Decision 36. Set false and it is dropped, not corrected. */
  readonly preTax: boolean;
  /** Size in the product's base unit, when known, for the unit price. */
  readonly sizeValue?: number | null;
  readonly sizeUnit?: string | null;
  /**
   * How sure we are this row is about this product. `exact` means the seller
   * published the barcode. `likely` means brand, name and size lined up and
   * nobody published a barcode to prove it, which is every Loblaws row.
   * Defaults to exact so existing callers are unchanged.
   */
  readonly joinQuality?: 'exact' | 'likely';
}
