/**
 * SoldComps adapter, WRITTEN, NEVER RUN.
 *
 * `verified = false` until someone runs it against the live endpoint with a real
 * key and puts the result in the scoreboard. Until then this file is a shape,
 * not evidence, exactly like `bestbuy.ts`.
 *
 * What it is: sold eBay listings, which is the one price kind the used-goods
 * rule trusts over everything else. `categories.ts` says a sold price "records
 * what someone was actually willing to pay", and the corpus today has zero of
 * them: the used POÄNG is priced from Kijiji asking prices and the Canon
 * refuses. This adapter is the cheapest path to a `sold` basis for `used`.
 *
 * Contract read 2026-09-03 at https://sold-comps.com/docs:
 *   GET https://api.sold-comps.com/v1/scrape?keyword=...&ebaySite=ebay.ca&sold=true
 *   Authorization: Bearer <key>. Free tier 100 requests a month, 60 a minute.
 *   Items carry soldPrice, soldCurrency, endedAt (YYYY-MM-DD), condition,
 *   sellerUsername, url, listingType.
 *
 * Three rules, each from a recorded failure:
 *
 * 1. ebay.ca only. The contract's currency is `'CAD'` and nothing else, and a
 *    US sale converted at today's rate is a number nobody observed. Any item
 *    that comes back in another currency is dropped, not converted.
 * 2. "For parts" listings never count. The used judge's own comment records
 *    two "for parts, not working" sales replacing eight live listings and
 *    sending a $900 body to walk-away off a $1.35 basis.
 * 3. A sold listing whose title does not cover the identity is not a comp for
 *    it. The pilot's worst failure was an R6 query answered with R6 Mark II
 *    prices, all accurate, all about a different camera. Two checks, both
 *    required. Every token of the model, when the identity has one, must
 *    appear in the title: "Canon EOS R5" and "Canon EOS RP" share two of the
 *    three keyword tokens with "Canon EOS R6" and an overlap floor alone let
 *    them through, and the model token is the only one that tells them apart.
 *    Then the overlap floor `recorded.ts` uses, over the whole keyword. The
 *    cost is that "Canon R6 body" with no "EOS" is dropped too, which is the
 *    safe direction: a wrong verdict is worse than no verdict.
 *    Without a model the keyword is the label, never the bare brand: the
 *    corpus's POÄNG has brand "IKEA" and no model, and "IKEA" as the query
 *    matched every IKEA sale on the site at overlap 1.0.
 *
 * It does not identify. SoldComps is a keyword feed with no product graph, so
 * `identify()` returns null and identity comes from a source that has one.
 */

import type { CategoryId, PricePoint, ProductIdentity, SpineQuery } from '../contract.ts';
import type { PriceSource, SourceAvailability } from './source.ts';
import { normalize, overlap } from './source.ts';

const DEFAULT_BASE = 'https://api.sold-comps.com';
const EBAY_SITE = 'ebay.ca';
/**
 * Days of history asked for. The used rule keeps 90 days of history but tiers
 * only on sales 30 days old or newer (`maxAgeDays`), so most of what comes back
 * is context, not basis. The feed holds about 90.
 */
const LOOKBACK_DAYS = 90;
/** Items per request. One request is one of 100 free ones a month; ask for plenty. */
const COUNT = 40;
/** Same floor `recorded.ts` uses before it will claim a match. */
const TITLE_OVERLAP_FLOOR = 0.5;

/**
 * Runs on `normalize()` output, so punctuation is already spaces: "as-is" is
 * "as is" and "doesn't work" is "doesn t work". "broken in" is a cushion, not
 * a fault.
 */
const PARTS_ONLY =
  /\b(for parts|parts only|spares or repair|spares repair|for repair|needs repair|not working|doesn t work|does not work|faulty|defective|untested|damaged|broken(?! in\b)|cracked|as is|read description)\b/;

interface SoldCompsItem {
  itemId?: string;
  url?: string;
  title?: string | null;
  condition?: string | null;
  endedAt?: string | null;
  soldPrice?: string | null;
  soldCurrency?: string | null;
  sellerUsername?: string | null;
  listingType?: 'sold' | 'active';
}

interface SoldCompsResponse {
  items?: SoldCompsItem[];
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}>;

export class SoldCompsSource implements PriceSource {
  readonly id = 'soldcomps';
  readonly label = 'SoldComps, eBay.ca sold listings';
  readonly categories: readonly CategoryId[] = ['used'];
  readonly verified = false;

  #key: string | undefined;
  #base: string;
  #fetch: FetchLike;

  constructor(
    env: Record<string, string | undefined> = process.env,
    fetchImpl: FetchLike = (url, init) => fetch(url, init),
  ) {
    this.#key = env.SOLDCOMPS_API_KEY;
    this.#base = env.SOLDCOMPS_API_BASE ?? DEFAULT_BASE;
    this.#fetch = fetchImpl;
  }

  available(): SourceAvailability {
    if (!this.#key) {
      return { ok: false, reason: 'SOLDCOMPS_API_KEY is not set' };
    }
    return { ok: true };
  }

  async identify(_query: SpineQuery): Promise<ProductIdentity | null> {
    // A keyword feed has no product graph. Identity must come from elsewhere.
    return null;
  }

  async prices(identity: ProductIdentity, asOf: string): Promise<readonly PricePoint[]> {
    if (!this.#key || identity.category !== 'used') return [];
    const keyword = keywordFor(identity);
    if (keyword === '') return [];

    const after = new Date(Date.parse(asOf) - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
    const params = new URLSearchParams({
      keyword,
      ebaySite: EBAY_SITE,
      count: String(COUNT),
      sold: 'true',
      soldAfter: after,
      sortOrder: 'endedRecently',
      exactMatch: 'true',
    });
    const res = await this.#fetch(`${this.#base}/v1/scrape?${params}`, {
      headers: { Authorization: `Bearer ${this.#key}`, accept: 'application/json' },
    });
    if (!res.ok) {
      // Silence here would read as "no sales exist", which is the failure
      // `verified` exists to make visible.
      throw new Error(`soldcomps: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as SoldCompsResponse;
    const points: PricePoint[] = [];
    for (const it of body.items ?? []) {
      if (it.listingType !== 'sold') continue;
      if (it.soldCurrency !== 'CAD') continue; // rule 1
      const cents = toCents(it.soldPrice);
      if (cents === null) continue;
      const title = it.title ?? '';
      const haystack = normalize(`${title} ${it.condition ?? ''}`);
      if (PARTS_ONLY.test(haystack)) continue; // rule 2
      if (!coversIdentity(identity, keyword, title)) continue; // rule 3
      if (!it.endedAt) continue; // an undated sale cannot be checked for staleness
      points.push({
        seller: it.sellerUsername ? `eBay seller ${it.sellerUsername}` : 'eBay seller',
        amountCents: cents,
        currency: 'CAD',
        kind: 'sold',
        observedAt: it.endedAt,
        sourceId: this.id,
        url: it.url,
        note: title,
      });
    }
    return points;
  }
}

/**
 * Brand and model when there is a model; the label otherwise. This is what
 * eBay is asked. A brand on its own is never the keyword: it names a
 * catalogue, not a product.
 */
export function keywordFor(identity: ProductIdentity): string {
  const model = identity.model?.trim() ?? '';
  if (model === '') return identity.label.trim();
  const brand = identity.brand?.trim() ?? '';
  return (brand === '' ? model : `${brand} ${model}`).trim();
}

/**
 * Rule 3. Every model token must be in the title when the identity has a
 * model, and the keyword as a whole must clear the overlap floor.
 */
export function coversIdentity(identity: ProductIdentity, keyword: string, title: string): boolean {
  const model = identity.model?.trim() ?? '';
  if (model !== '' && overlap(model, title) < 1) return false;
  return overlap(keyword, title) >= TITLE_OVERLAP_FLOOR;
}

function toCents(price: string | null | undefined): number | null {
  if (price === null || price === undefined) return null;
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
