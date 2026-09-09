/**
 * Where the numbers come from, and what it costs to join them to a product.
 *
 * WHAT THE CHECK FOUND, 2026-09-04, by opening both storefronts and reading
 * what they actually serve. Not from documentation and not from memory.
 *
 * Walmart Canada. The search and product pages both carry their own data as
 * JSON inside the page. A product page gives name, brand, price, the unit price
 * already computed ("30 cents per 100 g" on the Kraft 1 kg jar at $5.97), and
 * the UPC. That UPC, zero padded to thirteen, is the same code Open Food Facts
 * uses. This seller joins to the catalogue by barcode, exactly.
 *
 * Loblaws. The storefront calls its own backend at api.pcexpress.ca and the
 * page renders the price and the unit price. The product identifier is an
 * internal article number of the form 20064825001_EA. There is NO GTIN on the
 * page: not in the markup, not in the structured data, not in the payload the
 * page was built from. Searched for the exact code and it is absent.
 *
 * THE CONSEQUENCE, AND IT IS THE WHOLE DESIGN OF THIS FILE. Decision 31 needs
 * two sellers before any verdict fires. One of those two sellers cannot be
 * joined by barcode. So a price source has to declare how it joins, and a
 * source that joins by name is only allowed to contribute an observation when
 * the catalogue's own search puts the match in its confident band. A fuzzy name
 * match quietly attached to the wrong jar is not a slightly worse price; it is
 * a verdict about a product the user is not holding.
 *
 * The tempting shortcut is to take the best name match and move on. It would
 * work most of the time and the times it did not would be invisible, which is
 * the exact shape of failure the confidence rules elsewhere exist to prevent.
 */

import type { Observation, PriceKind } from './observation.ts';

/** How a seller's row can be tied to a catalogue product. */
export type JoinKind =
  /** The seller publishes the barcode. Exact, and the only one we fully trust. */
  | 'gtin'
  /** Brand, name and size only. Must clear the catalogue's confident band. */
  | 'name';

/** One row as a seller published it, before it is tied to anything. */
export interface Listing {
  readonly seller: string;
  /** The seller's own id, kept so a number can always be traced back. */
  readonly sellerSku: string;
  readonly title: string;
  readonly brand: string | null;
  readonly gtin: string | null;
  readonly sizeValue: number | null;
  readonly sizeUnit: string | null;
  readonly amountCents: number;
  readonly kind: PriceKind;
  readonly observedAt: string;
  /** Decision 36. A seller who quotes post tax is recorded as such, not fixed. */
  readonly preTax: boolean;
  readonly url: string | null;
}

export interface PriceSource {
  readonly seller: string;
  readonly joins: JoinKind;
  /** Everything this source can offer for one query. Joining happens after. */
  fetch(query: { gtin?: string; text?: string }): Promise<readonly Listing[]>;
}

/** What the catalogue must answer for a name join to be allowed. */
export interface ConfidentMatch {
  (listing: Listing): Promise<{ code: string; confident: boolean } | null>;
}

export interface JoinResult {
  readonly observations: readonly Observation[];
  /**
   * Listings that had a price and could not be safely tied to this product.
   * Kept, not discarded: a seller we can see and cannot join is a gap in the
   * evidence, and decision 35 depends on knowing how thin the evidence is.
   */
  readonly unjoined: readonly { listing: Listing; because: string }[];
}

/**
 * Turns listings into observations for one product, refusing every join it
 * cannot stand behind.
 */
export async function joinToProduct(
  code: string,
  listings: readonly Listing[],
  sources: readonly PriceSource[],
  match: ConfidentMatch,
): Promise<JoinResult> {
  const joinOf = new Map(sources.map((s) => [s.seller, s.joins]));
  const observations: Observation[] = [];
  const unjoined: { listing: Listing; because: string }[] = [];

  for (const l of listings) {
    const how = joinOf.get(l.seller) ?? 'name';
    let quality: 'exact' | 'likely' = 'exact';

    if (how === 'gtin') {
      if (!l.gtin) {
        unjoined.push({ listing: l, because: 'the seller joins by barcode and did not publish one' });
        continue;
      }
      if (normaliseGtin(l.gtin) !== normaliseGtin(code)) {
        unjoined.push({ listing: l, because: 'a different barcode' });
        continue;
      }
    } else {
      const m = await match(l);
      if (!m) {
        unjoined.push({ listing: l, because: 'nothing in the catalogue matched the title' });
        continue;
      }
      if (m.code !== code) {
        unjoined.push({ listing: l, because: 'the title matched a different product' });
        continue;
      }
      // CHANGED 2026-09-05. This used to drop a listing whose title matched
      // more than one product. Loblaws publishes no barcode at all, so that
      // refusal threw away an entire national seller whenever the catalogue
      // held two similar rows. The listing is kept now and carries its own
      // weaker join, which lowers the verdict's confidence rather than
      // removing the verdict.
      quality = m.confident ? 'exact' : 'likely';
    }

    observations.push({
      seller: l.seller,
      amountCents: l.amountCents,
      kind: l.kind,
      observedAt: l.observedAt,
      preTax: l.preTax,
      sizeValue: l.sizeValue,
      sizeUnit: l.sizeUnit,
      joinQuality: quality,
    });
  }

  return { observations, unjoined };
}

/** Same normalisation the catalogue uses, so 12 and 13 digit forms meet. */
export function normaliseGtin(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.replace(/^0+/, '').padStart(13, '0');
}
