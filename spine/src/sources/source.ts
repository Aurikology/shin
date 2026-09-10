/**
 * The source adapter interface.
 *
 * Everything the spine knows about a price arrives through one of these. The
 * shape is deliberately small: identify, then price. The split is there because
 * the pilot found these are two different failures with two different repairs,
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
   * `false` means the code path exists and is unverified. It must be visible in
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

/** Legal and storefront suffixes that do not make a seller a different seller. */
const SELLER_NOISE = /\b(inc|ltd|ltee|limited|corp|corporation|co|canada|ca|com|banners|stores|store)\b/g;

/**
 * One merchant, one name.
 *
 * A retailer arrives spelled differently from every feed that carries it: its
 * own API, an affiliate network and a shopping comparison service will send
 * "Best Buy", "Best Buy Canada" and "BestBuy.ca" for the same shelf. Counted
 * raw, one merchant clears a three-distinct-sellers gate on its own, and the
 * store the shopper is standing in fails to be excluded from its own comparison.
 */
export function normalizeSeller(seller: string): string {
  const base = normalize(seller).replace(/\./g, ' ');
  const stripped = base.replace(SELLER_NOISE, ' ').trim();
  // Never collapse a name to nothing: "Canada Computers" is a real merchant.
  const kept = stripped.length > 0 ? stripped : base;
  // Whitespace goes last and entirely, so "Best Buy" and "BestBuy.ca" land on
  // the same key. Without this the domain form stayed its own seller and five
  // spellings of one merchant still counted as two.
  return kept.replace(/\s+/g, '');
}

/**
 * The key a price point is COUNTED under. Not the key it is matched or shown
 * under: that is always `normalizeSeller(p.seller)`, because a shopper types a
 * name and never an id.
 *
 * D-081. `sellerId` is the source's own identity for the shop when it has one
 * stronger than the name (`observed.ts` sets it from `store_osm`), so two
 * branches of one chain under one `store_name` count as the two sellers they
 * are. Undefined falls straight back to the normalised name, which is what
 * every other adapter has always counted as, so nothing that does not set the
 * field changes.
 */
export function sellerIdentity(point: { readonly seller: string; readonly sellerId?: string }): string {
  return point.sellerId ?? normalizeSeller(point.seller);
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
