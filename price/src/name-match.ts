/**
 * Matching a seller's listing title to a catalogue product, for the sellers that
 * publish no barcode.
 *
 * WHY THIS IS ITS OWN FILE. Two callers need the same rule and they are not near
 * each other: the Canadian Tire run (`canadiantire-run.ts`) asks it live while a
 * search result is in hand, and the nightly name rejoin (`rejoin.ts`) asks it
 * offline about a row written weeks ago. `crawl.ts` and `rejoin.ts` already make
 * this argument about the barcode join and answer it by both going through
 * `sources.ts`: the rule about what may become an observation lives in one place
 * or it drifts. This is the same argument for the name half.
 *
 * IT IS DUPLICATED FROM `spine/src/sources/source.ts`, deliberately, the same way
 * `corrections.ts` duplicates `normalizeSeller`: this package must not depend on
 * the spine, because the spine already depends on this direction. The numbers and
 * the folding are taken from there rather than invented here, and
 * `price/test/canadiantire-run.test.ts` pins the cases that would show a drift.
 *
 * WHAT IT DOES NOT DO. It is not the catalogue's semantic search, which needs an
 * embedding model and several hundred megabytes of resident memory. It is token
 * overlap plus a brand that has to agree, which is a weaker instrument, and every
 * join it produces is recorded as `name` rather than `gtin` and carries the
 * `likely` join quality unless every word lines up. `sources.ts`'s header is the
 * argument for that caution: a fuzzy name match quietly attached to the wrong
 * product is not a slightly worse price, it is a verdict about a thing the
 * shopper is not holding.
 */

const COMBINING_LOW = 0x0300;
const COMBINING_HIGH = 0x036f;

/**
 * How much of a catalogue product's name has to appear in a seller's title
 * before the two are the same thing.
 *
 * 0.5 is the floor `spine/src/sources/observed.ts` and `recorded.ts` already use
 * for a text match, taken from there so the app does not grow two opinions about
 * what a name match is. Half a product's words is a weak bar on its own, which is
 * why it is never on its own: `brandAgrees` has to hold as well.
 */
export const NAME_FLOOR = 0.5;

/**
 * At or above this the match is `confident` in `sources.ts`'s sense and the
 * observation is stored as an exact join rather than a likely one: every word of
 * the catalogue's name present in the seller's title, plus the brand.
 */
export const CONFIDENT_AT = 0.99;

function fold(text: string): string {
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
  return fold(text).split(' ').filter((t) => t.length > 0);
}

/**
 * Fraction of the query's tokens present in the candidate. Asymmetric on
 * purpose, and the asymmetry is the point: a short catalogue name fully present
 * in a long retail title is evidence, while a long title's words mostly missing
 * from a two word name is not.
 */
export function overlap(query: string, candidate: string): number {
  const q = tokens(query);
  if (q.length === 0) return 0;
  const c = new Set(tokens(candidate));
  let hit = 0;
  for (const t of q) if (c.has(t)) hit += 1;
  return hit / q.length;
}

/** One product as the catalogue holds it. */
export interface NamedProduct {
  readonly code: string;
  readonly name: string;
  readonly brand: string | null;
}

/**
 * The brand has to agree, and an absent brand on either side is not agreement.
 *
 * This is the guard that makes a 0.5 name overlap safe enough to store.
 * "Duracell AA 24 pack" and "Energizer AA 24 pack" share most of their words and
 * are different products; the brand is the token that separates them and the one
 * a retail title almost always carries. A catalogue row with no brand at all
 * cannot be joined by name here, which loses real products and is the right way
 * to be wrong: the alternative is joining on words alone.
 */
export function brandAgrees(
  product: NamedProduct,
  candidateBrand: string | null,
  candidateTitle: string,
): boolean {
  if (!product.brand) return false;
  const wanted = tokens(product.brand);
  if (wanted.length === 0) return false;
  const haystack = new Set([...tokens(candidateBrand ?? ''), ...tokens(candidateTitle)]);
  return wanted.every((t) => haystack.has(t));
}

/** How well one listing fits one product. Zero when the brand does not agree at all. */
export function scoreCandidate(
  product: NamedProduct,
  candidate: { readonly name: string; readonly brand: string | null },
): number {
  if (!brandAgrees(product, candidate.brand, candidate.name)) return 0;
  return overlap(product.name, candidate.name);
}

/** Whether a score is good enough to store, and whether it is good enough to call exact. */
export function verdictOn(score: number): { join: boolean; confident: boolean } {
  return { join: score >= NAME_FLOOR, confident: score >= CONFIDENT_AT };
}
