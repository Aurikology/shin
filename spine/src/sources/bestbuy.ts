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
 * Open and unestablished: whether the base URL below serves Canadian pricing,
 * and what one API token buys. Both are queue item 1.4.
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

export class BestBuySource implements PriceSource {
  readonly id = 'bestbuy';
  readonly label = 'Best Buy product API';
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
      confidence: query.gtin ? 0.98 : 0.7,
      resolvedBy: this.id,
    };
  }

  async prices(identity: ProductIdentity, asOf: string): Promise<readonly PricePoint[]> {
    const sku = identity.id.startsWith('bestbuy:') ? identity.id.slice('bestbuy:'.length) : null;
    if (sku === null || !this.#key) return [];
    const products = await this.#get(`(sku=${sku})`);
    const hit = products[0];
    if (!hit) return [];
    const points: PricePoint[] = [];
    if (typeof hit.regularPrice === 'number') {
      points.push({
        seller: 'Best Buy',
        amountCents: Math.round(hit.regularPrice * 100),
        currency: 'CAD',
        kind: 'regular',
        observedAt: asOf,
        sourceId: this.id,
        url: hit.url,
      });
    }
    if (hit.onSale === true && typeof hit.salePrice === 'number') {
      points.push({
        seller: 'Best Buy',
        amountCents: Math.round(hit.salePrice * 100),
        currency: 'CAD',
        kind: 'promotional',
        observedAt: asOf,
        sourceId: this.id,
        url: hit.url,
      });
    }
    return points;
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
