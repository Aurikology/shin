/**
 * The price-match line on a barcode answer: which till the shopper is at,
 * the line to show the cashier, and what that store's policy asks for.
 *
 * `price-match.ts` holds the policy table and answers "can this till match
 * this offer". This file is the only caller: it picks the cheapest offer in
 * the answer that the shopper's store will match and writes it out.
 *
 * WHEN IT APPEARS. Only when all of these hold: the phone said which store it
 * is in (`storeName`), that store is in the policy table and matches
 * competitors (or, for Walmart, its own site), a shelf price was typed, and
 * an offer in Gemini's answer is below it, comparable (in the median, not
 * excluded), open to everyone (no membership), and in the same currency as
 * the store (CAD, the only market the table covers). Anything else: no field.
 *
 * WHAT IT NEVER SAYS. No difference, no "you save", no total (hard rule 2:
 * no savings claim until it is measured). The only amount in the line is the
 * competitor's own listed price, which is Gemini's, not ours. The line points
 * at the other store's price; nothing in it is about the shopper (hard rule 3).
 *
 * ENGLISH ONLY, on purpose for the MVP: languages are switched off (mvp-plan,
 * "What ships OFF"). `messageKey` rides along so the French table can be
 * written against it when languages come back.
 */
import { priceMatchAdvice, type MatchRequirements } from './price-match.ts';

export interface PriceMatchLine {
  /** The store the shopper is standing in, by its own name. */
  readonly store: string;
  /** What to show the cashier. */
  readonly line: string;
  /** What the store's policy asks for, one short sentence each. */
  readonly conditions: readonly string[];
  readonly seller: string;
  /** The competitor's listing, which is the proof to show. Null when Gemini gave no link. */
  readonly url: string | null;
  readonly messageKey: string;
}

/** The fields of an answer offer this file reads. */
export interface MatchableOffer {
  readonly retailer: string;
  readonly price: number;
  readonly url: string | null;
  readonly currency: string | null;
  readonly memberOnly?: boolean | null;
  readonly inMedian?: boolean;
  readonly exclusionReason?: string | null;
}

function conditionsOf(r: MatchRequirements, sameStoreOnline: boolean): string[] {
  const out: string[] = [];
  if (sameStoreOnline) out.push("Matches its own website's price.");
  if (r.proof === 'competitor_ad_at_till') {
    const how = r.proofFormats.length === 2 ? ' (printed or on your phone)' : r.proofFormats[0] === 'digital' ? ' (on your phone)' : r.proofFormats[0] === 'print' ? ' (printed)' : '';
    out.push(`Show the competitor's ad at the till${how}.`);
  }
  if (r.identicalItemRequired) out.push('Same brand, size and item.');
  if (r.itemLimit !== null) out.push(`Up to ${r.itemLimit} matched items per visit.`);
  if (r.competitorScope === 'same_trade_area') out.push('The competitor must be in the same area.');
  if (r.competitorScope === 'approved_list') out.push("The competitor must be on the store's approved list.");
  if (r.competitorScope === 'local') out.push('The competitor must be local.');
  if (r.beatsByOneCent) out.push('The store beats the competitor price by one cent.');
  if (r.windowDays !== null) out.push(`Within ${r.windowDays} days${r.windowKind === 'after_purchase' ? ' of buying' : ''}.`);
  return out;
}

function money(price: number): string {
  return `$${price.toFixed(2)}`;
}

/**
 * The price-match line for this answer, or null. Never throws; anything it
 * cannot read is no line rather than a wrong one.
 */
export function priceMatchLine(
  offers: readonly MatchableOffer[] | null | undefined,
  storeName: string | null | undefined,
  shelfPriceCents: number | null | undefined,
): PriceMatchLine | null {
  try {
    if (!Array.isArray(offers) || !storeName || typeof shelfPriceCents !== 'number' || shelfPriceCents <= 0) return null;
    const candidates = offers
      .filter(
        (o) =>
          o &&
          typeof o.retailer === 'string' &&
          o.retailer.trim() !== '' &&
          typeof o.price === 'number' &&
          Number.isFinite(o.price) &&
          o.price > 0 &&
          (o.currency === null || o.currency === undefined || o.currency.toUpperCase() === 'CAD') &&
          o.memberOnly !== true &&
          o.inMedian !== false &&
          !o.exclusionReason,
      )
      .sort((a, b) => a.price - b.price);
    for (const offer of candidates) {
      const answer = priceMatchAdvice({
        banner: storeName,
        bannerPriceCents: shelfPriceCents,
        offer: { seller: offer.retailer, priceCents: Math.round(offer.price * 100) },
      });
      if (!answer.possible || !answer.policy || !answer.requirements) continue;
      const sameStoreOnline = answer.messageKey === 'price_match.own_online';
      const seller = offer.retailer.trim();
      return {
        store: answer.policy.displayName,
        line: sameStoreOnline
          ? `Price match: ${seller} online lists this at ${money(offer.price)}.`
          : `Price match: ${seller} sells this for ${money(offer.price)}.`,
        conditions: conditionsOf(answer.requirements, sameStoreOnline),
        seller,
        url: offer.url ?? null,
        messageKey: answer.messageKey,
      };
    }
    return null;
  } catch {
    return null;
  }
}
