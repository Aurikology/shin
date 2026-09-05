/**
 * eBay Browse API adapter, WRITTEN, NEVER RUN.
 *
 * `verified = false` and it stays false until someone runs it against the live
 * endpoint with a real key and puts the result in the scoreboard. Until then
 * this file is a shape, not evidence. An unverified adapter that returns
 * nothing looks exactly like a category with no prices, which is the failure
 * that flag exists to prevent.
 *
 * WHAT THIS SOURCE CANNOT DO, and it is the first thing to know about it.
 *
 * It cannot give you what something sold for. Sold and completed listings live
 * behind the Marketplace Insights API, which is a Limited Release that eBay
 * describes as restricted and not open to new users, granted to major partners
 * by application only. The free Browse key does not reach it. So every point
 * this file produces is `kind: 'asking'`, which `contract.ts` already defines
 * as upward-biased and never a clearing price, and the spine already knows to
 * weigh accordingly.
 *
 * That matters because the pilot already met this exact limit from the other
 * side. The Canon EOS R6 run on 2026-09-03 recorded "eBay sold listings under
 * US$2,000" and correctly refused to use it, for two reasons that both still
 * apply: it was a bound rather than a point, and it was in another currency.
 * This adapter is built so neither can happen again, structurally rather than
 * by remembering.
 *
 * THE FOUR FILTERS, each of which exists because without it the number would be
 * wrong rather than merely noisy:
 *
 *   1. CANADIAN MARKETPLACE, AND CAD CHECKED ANYWAY. Requests go to EBAY_CA,
 *      and every item's own currency is still checked against CAD before it
 *      becomes a point. `PricePoint.currency` is typed to the literal 'CAD',
 *      so a USD listing cannot be represented here even by accident, and the
 *      check makes that a skip rather than a lie. Belt and braces on purpose:
 *      the marketplace header is a request, the per-item currency is the fact.
 *
 *   2. FIXED PRICE ONLY, NO AUCTIONS. An auction's current bid is not an asking
 *      price. A camera with two days left and one $1 opening bid would enter the
 *      comparison set as a $1 camera and drag a verdict to "walk away" on a
 *      number nobody will ever pay. Auctions are excluded at the query.
 *
 *   3. DELIVERED PRICE, NOT ITEM PRICE. A $20 item with $30 shipping is not a
 *      $20 comparable to something on a shelf in front of you. Shipping is added
 *      when the listing states it. A listing whose shipping cost is not stated
 *      is SKIPPED rather than treated as free: unknown shipping silently read as
 *      zero is the same class of mistake as the invented stock flag, an absence
 *      recorded as a favourable fact.
 *
 *   4. LOCATED IN CANADA. A CAD-priced listing shipping from abroad carries
 *      duties and weeks of delay that the price does not show, so it is not the
 *      thing the shopper is choosing between.
 *
 * NOT GROCERY, DELIBERATELY. `categories` is ['used', 'tech']. Grocery on eBay
 * is bulk, imported, or collectible packaging, and none of those is a comparable
 * for a box on a shelf in a Canadian supermarket. Adding 'grocery' here would
 * put pantry-sized listings beside single units and be wrong in the app's lead
 * category, which is the one place it can least afford to be.
 *
 * ONE OPEN CONCERN, stated rather than decided quietly. Every listing returned
 * becomes its own PricePoint with its own seller, because ten people asking ten
 * prices for a used lens genuinely are ten independent observations, and that is
 * more informative than one retailer's single number. But the spine's confidence
 * counts DISTINCT SELLERS, and it has not previously seen a source that can
 * produce ten of them from one marketplace in one call. If a confidence band
 * ever reads high on the strength of eBay usernames alone, this is why, and the
 * repair is a per-source seller cap in the spine rather than a change here.
 */

import type { CategoryId, PricePoint, ProductIdentity, SpineQuery } from '../contract.ts';
import type { PriceSource, SourceAvailability } from './source.ts';

const DEFAULT_BASE = 'https://api.ebay.com';
const MARKETPLACE = 'EBAY_CA';

/**
 * 5,000 calls per day, application-wide rather than per user, raised only by
 * eBay's free Application Growth Check. Every scan that reaches this source
 * costs one call for identify and one for prices, so the ceiling is roughly
 * 2,500 scans a day across every user of the app at once. Worth knowing before
 * this is ever put behind a live scan loop.
 */
const MAX_LISTINGS = 20;

/** eBay's own condition ids. 1000 is new; everything above it is some form of used. */
const CONDITION_NEW = 1000;

interface ApiPrice {
  value?: string;
  currency?: string;
}

interface ApiShippingOption {
  shippingCost?: ApiPrice;
}

interface ApiItemSummary {
  itemId?: string;
  title?: string;
  price?: ApiPrice;
  conditionId?: string;
  condition?: string;
  itemWebUrl?: string;
  seller?: { username?: string };
  shippingOptions?: ApiShippingOption[];
  itemLocation?: { country?: string };
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

/** Dollars as a decimal string to whole cents, or null if it is not a number. */
function centsOf(price: ApiPrice | undefined): number | null {
  if (!price || typeof price.value !== 'string') return null;
  const amount = Number(price.value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

export class EbaySource implements PriceSource {
  readonly id = 'ebay';
  readonly label = 'eBay Browse API';
  readonly categories: readonly CategoryId[] = ['used', 'tech'];
  readonly verified = false;

  #clientId: string | undefined;
  #clientSecret: string | undefined;
  #base: string;
  #token: { value: string; expiresAtMs: number } | null = null;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.#clientId = env.EBAY_CLIENT_ID;
    this.#clientSecret = env.EBAY_CLIENT_SECRET;
    this.#base = env.EBAY_API_BASE ?? DEFAULT_BASE;
  }

  available(): SourceAvailability {
    if (!this.#clientId || !this.#clientSecret) {
      return { ok: false, reason: 'EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are not set' };
    }
    return { ok: true };
  }

  async identify(query: SpineQuery): Promise<ProductIdentity | null> {
    if (this.available().ok === false) return null;
    const items = await this.#search(query);
    const hit = items[0];
    if (!hit) return null;

    /*
     * The identity key is the SEARCH, not the listing. eBay is a marketplace:
     * one product has many listings, and the useful answer is the spread across
     * them rather than whichever one happened to sort first. Keying on a single
     * itemId would throw away the only thing this source is good for, and would
     * break the moment that listing sold.
     */
    const key = query.gtin ? `gtin:${query.gtin}` : `q:${query.text ?? ''}`;
    return {
      id: `ebay:${key}`,
      label: hit.title ?? query.text ?? key,
      category: this.#categoryOf(items),
      gtin: query.gtin,
      /*
       * A GTIN match on a marketplace is weaker than a GTIN match at a
       * retailer, because sellers type the barcode field themselves and a
       * mistyped one attaches a listing to the wrong product. Below Best Buy's
       * 0.98 on purpose. A text match is a guess and the category floor is what
       * stops a guess reaching a verdict.
       */
      confidence: query.gtin ? 0.9 : 0.6,
      resolvedBy: this.id,
    };
  }

  async prices(identity: ProductIdentity, asOf: string): Promise<readonly PricePoint[]> {
    if (!identity.id.startsWith('ebay:') || this.available().ok === false) return [];
    const key = identity.id.slice('ebay:'.length);
    const query: SpineQuery = key.startsWith('gtin:')
      ? { gtin: key.slice('gtin:'.length) }
      : { text: key.slice('q:'.length) };

    const points: PricePoint[] = [];
    for (const item of await this.#search(query)) {
      const point = this.#pointOf(item, asOf);
      if (point) points.push(point);
    }
    return points;
  }

  /**
   * One listing to one point, or null where the listing cannot honestly become
   * one. Every rejection below is a skip rather than a repair, because the
   * alternative to a missing point is a wrong point.
   */
  #pointOf(item: ApiItemSummary, asOf: string): PricePoint | null {
    if (item.price?.currency !== 'CAD') return null;
    if (item.itemLocation?.country !== 'CA') return null;

    const itemCents = centsOf(item.price);
    if (itemCents === null) return null;

    /*
     * Shipping has to be stated. `shippingOptions` absent, empty, or carrying no
     * cost means we do not know what delivery costs, and an unknown read as zero
     * would understate the real price of exactly the listings most likely to be
     * heavy or awkward.
     */
    const shipping = item.shippingOptions?.[0]?.shippingCost;
    if (!shipping) return null;
    if (shipping.currency !== undefined && shipping.currency !== 'CAD') return null;
    const shippingCents = centsOf(shipping);
    if (shippingCents === null) return null;

    const username = item.seller?.username;
    if (!username) return null;

    return {
      seller: `eBay ${username}`,
      amountCents: itemCents + shippingCents,
      currency: 'CAD',
      // Never 'sold'. The free key cannot see sold prices at all; see the header.
      kind: 'asking',
      observedAt: asOf,
      sourceId: this.id,
      url: item.itemWebUrl,
      note:
        shippingCents > 0
          ? `delivered price, including ${(shippingCents / 100).toFixed(2)} shipping`
          : 'delivered price, free shipping',
    };
  }

  /**
   * Used unless every listing came back as new. A barcode that only turns up
   * sealed stock is a tech comparable; the moment any of it is second hand the
   * honest category is used, which carries its own confidence floor.
   */
  #categoryOf(items: readonly ApiItemSummary[]): CategoryId {
    const allNew = items.every((i) => Number(i.conditionId) === CONDITION_NEW);
    return allNew ? 'tech' : 'used';
  }

  async #search(query: SpineQuery): Promise<ApiItemSummary[]> {
    const params = new URLSearchParams();
    if (query.gtin) params.set('gtin', query.gtin);
    else if (query.text) params.set('q', query.text);
    else return [];

    // Auctions excluded here rather than filtered afterwards, so a page of bids
    // never displaces real fixed-price listings out of the result limit.
    params.set('filter', 'buyingOptions:{FIXED_PRICE},itemLocationCountry:CA');
    params.set('limit', String(MAX_LISTINGS));

    const url = `${this.#base}/buy/browse/v1/item_summary/search?${params.toString()}`;
    const res = await fetch(url, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${await this.#accessToken()}`,
        'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE,
      },
    });
    if (!res.ok) {
      // Thrown, not swallowed. Silence here is indistinguishable from "no
      // listings exist", which is the whole reason `verified` is a field.
      throw new Error(`ebay: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as { itemSummaries?: ApiItemSummary[] };
    return body.itemSummaries ?? [];
  }

  /**
   * Application token, cached until shortly before it expires.
   *
   * eBay's client-credentials tokens last two hours. Re-minting one per call
   * would spend the daily budget on authentication rather than on prices, and
   * the budget is 5,000 calls for the whole application, not per user. The
   * sixty-second margin is so a token cannot expire in flight between the check
   * and the request that uses it.
   */
  async #accessToken(): Promise<string> {
    const now = Date.now();
    if (this.#token && this.#token.expiresAtMs > now) return this.#token.value;

    const basic = Buffer.from(`${this.#clientId}:${this.#clientSecret}`).toString('base64');
    const res = await fetch(`${this.#base}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'https://api.ebay.com/oauth/api_scope',
      }).toString(),
    });
    if (!res.ok) throw new Error(`ebay auth: ${res.status} ${res.statusText}`);

    const body = (await res.json()) as TokenResponse;
    if (!body.access_token) throw new Error('ebay auth: no access_token in response');
    const lifetimeMs = (body.expires_in ?? 7200) * 1000;
    this.#token = { value: body.access_token, expiresAtMs: now + lifetimeMs - 60_000 };
    return this.#token.value;
  }
}
