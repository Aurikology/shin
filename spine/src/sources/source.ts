/**
 * The source adapter interface.
 *
 * Everything the spine knows about a price arrives through one of these. The
 * shape is deliberately small — identify, then price — because the pilot's
 * finding was that these are two different failures with two different repairs,
 * and a combined `lookup()` hides which one happened.
 *
 * Real feed from day one, never live search. Four direct retailer page fetches
 * on 2026-09-03 returned zero prices: Loblaws, Best Buy Canada and Metro all
 * answered 403 and IKEA served its nav menu. Any adapter that scrapes a retail
 * product page is re-running a measurement we already have.
 */

import type { CategoryId, PricePoint, ProductIdentity, SpineQuery } from '../contract.ts';

export type SourceAvailability =
  | { readonly ok: true }
  /** Not an error. A source without credentials is a normal, reportable state. */
  | { readonly ok: false; readonly reason: string };

export interface PriceSource {
  readonly id: string;
  readonly label: string;
  readonly categories: readonly CategoryId[];
  /**
   * Whether this adapter has ever been run against its live endpoint by us.
   * `false` means the code path exists and is unverified — it must be visible in
   * every report, because an unverified adapter that returns nothing is
   * indistinguishable from a category with no prices.
   */
  readonly verified: boolean;
  available(): SourceAvailability;
  identify(query: SpineQuery): Promise<ProductIdentity | null>;
  prices(identity: ProductIdentity, asOf: string): Promise<readonly PricePoint[]>;
}

const COMBINING_LOW = 0x0300;
const COMBINING_HIGH = 0x036f;

/**
 * Lowercase, fold diacritics, strip punctuation, collapse whitespace.
 *
 * The diacritic fold is not cosmetic: POÄNG is the most-typed product in this
 * corpus and nobody types the umlaut. It is done by code point rather than by a
 * literal character class so the rule stays readable in a diff.
 */
export function normalize(text: string): string {
  let folded = '';
  for (const ch of text.normalize('NFD')) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= COMBINING_LOW && code <= COMBINING_HIGH) continue;
    folded += ch;
  }
  return folded
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(text: string): string[] {
  return normalize(text).split(' ').filter((t) => t.length > 0);
}

/**
 * Fraction of the query's tokens that appear in the candidate. Asymmetric on
 * purpose: "poang" should match "POÄNG armchair, birch veneer" at 1.0, while
 * that long label matching a two-word query is not evidence of anything.
 */
export function overlap(query: string, candidate: string): number {
  const q = tokens(query);
  if (q.length === 0) return 0;
  const c = new Set(tokens(candidate));
  let hit = 0;
  for (const t of q) if (c.has(t)) hit += 1;
  return hit / q.length;
}
