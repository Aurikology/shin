/**
 * Best Buy product API adapter, WRITTEN, NEVER RUN.
 *
 * `verified = false` and it must stay false until someone runs it against the
 * live endpoint with a real key and puts the result in the scoreboard. Until
 * then this file is a shape, not evidence, and the harness reports it as such.
 * An unverified adapter that returns nothing looks exactly like a category with
 * no prices, which is the failure this flag exists to prevent.
 *
 * It exists now for one reason: it is the second implementation of PriceSource,
 * and an interface with one implementation is not an interface. If adding it
 * had required changing `source.ts`, that would have been the finding.
 *
 * ---------------------------------------------------------------------------
 * THE CURRENCY DEFECT, item 18a of the beta build plan, fixed 2026-09-11.
 *
 * `api.bestbuy.com` is Best Buy's UNITED STATES developer API. Its own
 * documentation sells it as the US catalogue, the endpoint has no Canadian
 * sibling on that host, and Best Buy Canada publishes no public product API at
 * all. Every price this file has ever built was stamped `currency: 'CAD'`
 * anyway, because `PricePoint.currency` is the literal type 'CAD' and writing
 * anything else would not compile. So the type system, which exists to stop
 * exactly this, was instead the reason it happened: the only value that fit was
 * the wrong one.
 *
 * What that would have done, had the key ever been set: a US dollar number
 * enters the comparison as though it were Canadian, and at the exchange rates of
 * any recent year it enters LOW. A shopper in a Canadian store is then told the
 * tag in front of them sits near the top of a range whose cheap end is a price
 * nobody in Canada can pay. That is the one mistake the verdict file names as
 * unrecoverable: it is the kind that makes somebody spend money, or refuse to.
 *
 * THE FIX IS STRUCTURAL, NOT A LABEL. The founder's decision of 2026-09-11 is
 * that Best Buy US prices are a labelled reference and never enter the verdict.
 * A comment saying so would be worth nothing: the next person to want a tech
 * price would push these points back through `prices()` and every test would
 * still pass. So `prices()` returns nothing, permanently, and the US number is
 * reachable only through `usReference()`, which returns a `UsReferencePrice`.
 * That type is not a `PricePoint` and cannot be handed to the spine: the
 * comparison set, the spread, the tier and the confidence all take PricePoints,
 * so a US price entering a verdict is not a rule anybody has to remember, it is
 * a program that does not compile.
 *
 * REVERSES IF Best Buy Canada ever exposes a product API, or if this one is
 * measured serving Canadian prices behind some parameter nobody here has found.
 * The repair is then a Canadian adapter, not a currency conversion: a converted
 * price is a number no seller is offering, and decision 32's rule against
 * averages is the same rule for the same reason.
 * ---------------------------------------------------------------------------
 *
 * Open and unestablished: what one API token buys, and what its terms allow
 * being shown. Both are queue item 1.4.
 */

import type { CategoryId, PricePoint, ProductIdentity, SpineQuery } from '../contract.ts';
import type { PriceSource, SourceAvailability } from './source.ts';

const DEFAULT_BASE = 'https://api.bestbuy.com/v1';

interface BestBuyProduct {
  sku?: number;
  name?: string;
  manufacturer?: string;
  modelNumber?: string;
  regularPrice?: number;
  salePrice?: number;
  onSale?: boolean;
  url?: string;
}

/**
 * A price at a seller in another country, which is a fact about that country and
 * never evidence about the tag in front of a Canadian shopper.
 *
 * Deliberately NOT a `PricePoint`, and deliberately missing the fields that
 * would make it look like one: no `sourceId` the spine keys on, no `kind` that a
 * band could sort it into. Anything that wants to show this has to know it is
 * showing a foreign price, because the type it is holding says so in its name
 * and carries the country in a field.
 */
export interface UsReferencePrice {
  readonly seller: 'Best Buy (US)';
  readonly country: 'US';
  readonly currency: 'USD';
  /** Cents of the currency named above. US cents. Never converted. */
  readonly amountCents: number;
  /** Whether this is the everyday price or a promotion, in Best Buy's own words. */
  readonly onSale: boolean;
  readonly observedAt: string;
  readonly url?: string;
  /** The sentence any screen showing this must show with it. */
  readonly label: string;
}

/** The label travels with the number so no screen can print the one without the other. */
const US_LABEL = 'Best Buy (US), in US dollars, for reference only';

export class BestBuySource implements PriceSource {
  readonly id = 'bestbuy';
  readonly label = 'Best Buy product API (United States)';
  readonly categories: readonly CategoryId[] = ['tech'];
  readonly verified = false;

  #key: string | undefined;
  #base: string;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.#key = env.BESTBUY_API_KEY;
    this.#base = env.BESTBUY_API_BASE ?? DEFAULT_BASE;
  }

  available(): SourceAvailability {
    if (!this.#key) {
      return { ok: false, reason: 'BESTBUY_API_KEY is not set' };
    }
    return { ok: true };
  }

  async identify(query: SpineQuery): Promise<ProductIdentity | null> {
    const term = query.gtin ?? query.text;
    if (!term || !this.#key) return null;
    const selector = query.gtin ? `(upc=${query.gtin})` : `(search=${encodeURIComponent(term)})`;
    const products = await this.#get(selector);
    const hit = products[0];
    if (!hit || hit.sku === undefined) return null;
    return {
      id: `bestbuy:${hit.sku}`,
      label: hit.name ?? term,
      category: 'tech',
      brand: hit.manufacturer,
      model: hit.modelNumber,
      gtin: query.gtin,
      // A UPC match is an identity; a text search is a guess, and the tech
      // category floor (0.85) is what stops the guess reaching a verdict.
      //
      // Identity is the one thing this US catalogue is good for: a barcode is
      // the same barcode either side of the border, and the manufacturer and
      // model number on a US row are facts about the product, not about the
      // country. The PRICE on that row is a fact about the country, which is why
      // it leaves by a different door.
      confidence: query.gtin ? 0.98 : 0.7,
      resolvedBy: this.id,
    };
  }

  /**
   * Always empty, and that is item 18a rather than an unfinished method.
   *
   * Read the currency block at the top of this file. A US price may not enter a
   * Canadian verdict, so the method the spine collects prices through returns
   * none. `usReference()` below is where the number actually goes.
   */
  async prices(_identity: ProductIdentity, _asOf: string): Promise<readonly PricePoint[]> {
    return [];
  }

  /**
   * The US price for one product, labelled, for a screen that wants to show what
   * this costs in the United States. Nothing in the spine calls this and nothing
   * in the spine can accept what it returns.
   */
  async usReference(identity: ProductIdentity, asOf: string): Promise<readonly UsReferencePrice[]> {
    const sku = identity.id.startsWith('bestbuy:') ? identity.id.slice('bestbuy:'.length) : null;
    if (sku === null || !this.#key) return [];
    const products = await this.#get(`(sku=${sku})`);
    const hit = products[0];
    if (!hit) return [];

    const out: UsReferencePrice[] = [];
    const add = (amount: number, onSale: boolean) =>
      out.push({
        seller: 'Best Buy (US)',
        country: 'US',
        currency: 'USD',
        amountCents: Math.round(amount * 100),
        onSale,
        observedAt: asOf,
        url: hit.url,
        label: US_LABEL,
      });

    if (typeof hit.regularPrice === 'number') add(hit.regularPrice, false);
    if (hit.onSale === true && typeof hit.salePrice === 'number') add(hit.salePrice, true);
    return out;
  }

  async #get(selector: string): Promise<BestBuyProduct[]> {
    const url = `${this.#base}/products${selector}?format=json&apiKey=${this.#key}`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      // Silence here would be indistinguishable from "no prices exist", which is
      // the whole reason `verified` is a field.
      throw new Error(`bestbuy: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as { products?: BestBuyProduct[] };
    return body.products ?? [];
  }
}
