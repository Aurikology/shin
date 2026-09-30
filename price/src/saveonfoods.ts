/**
 * Save-On-Foods, read one barcode at one store through the storefront gateway.
 *
 * MEASURED 2026-09-28 (docs/price-access-sweep-2026-09-27.md, "Measured
 * 2026-09-28: Save-On-Foods answers a barcode directly") and RE-READ 2026-09-30
 * for this file, from the raw responses recorded in test/fixtures/saveonfoods/:
 *
 *   - `GET https://storefrontgateway.saveonfoods.com/api/stores/{retailerStoreId}/products/{GTIN-14}`
 *     answers a plain request with an honest user agent, `ShinPriceCheck/0.1`.
 *     No key, no login, no cookie, no header beyond `accept`. The site's own
 *     search, sitemap and robots.txt sit behind a Cloudflare challenge; this
 *     endpoint did not challenge any of the requests made on either day.
 *   - A carried product is HTTP 200 JSON. The fields read here, as published:
 *     `sku` (the GTIN-14 itself), `name`, `brand`, `price` ("$8.29", a string),
 *     `wasPrice` (null or "$8.29"), `unitPrice` ("$0.83/100g"), `promotions`
 *     (null on both recorded items), `tprInfo` (null, or a temporary price
 *     reduction with `effectiveFrom`/`effectiveUntil`), `priceSource`
 *     ("regular" or "tpr"), `available` (true), `taxDetails` ([] on both).
 *   - A store that does not carry the barcode answers HTTP 404, `text/plain`,
 *     body `Product 00012345678905 not found`. That is a real "not carried
 *     here", not a failure.
 *   - GTIN-14 PADDING, verified against a real response: the catalogue's
 *     13-digit Kraft Smooth Peanut Butter 1 kg code `0068100084245`, zero padded
 *     to fourteen, is `00068100084245`; asked for at store 1982 the gateway
 *     answered 200 with `"sku":"00068100084245"` and that product's name. So
 *     padding a catalogue code with leading zeros to fourteen digits is the key
 *     the gateway uses, and the `sku` it echoes is that same string.
 *   - THE STORE LIST. `GET .../api/stores` returned 196 stores on 2026-09-30.
 *     Every one carries the SAME `siteId` and there is no banner field; `name`
 *     is the neighbourhood ("Dunbar", "Regina East"), and one store, 1982, is
 *     type "Corporate", named "Save-on-Foods", at the head office address in
 *     Langley. No name in the list contains PriceSmart, Urban Fare or Fresh St.
 *     So the sweep's "Save-On, PriceSmart, Urban Fare, Fresh St." is NOT what
 *     this list shows: all 196 are read as Save-On-Foods. If a sister banner
 *     answers on another gateway, that is a separate source with its own name.
 *   - LIVE SMOKE, 2026-09-30: 8 barcodes at 3 stores (6602 Airdrie East AB,
 *     929 100 Mile House BC, 4405 Bridgwater Winnipeg MB), 24 requests, 24
 *     found, no 404, no refusal. Price differs by store: Kraft Smooth Peanut
 *     Butter 1 kg was $8.49 at 6602 and 929, $8.29 at 4405 and at 1982, so a
 *     row is a store's price, never a chain-wide one. Unit price comes in two
 *     shapes, "$0.83/100g" and "$0.96 each".
 *   - TAX. Both recorded products carry `taxDetails: []` and no other tax
 *     field. The response does not say whether `price` is before or after tax,
 *     so this reader records no tax claim on the stored row (see `preTax` in
 *     `listingOf` for the one place the contract forces a boolean).
 *
 * THE RULE THIS READER KEEPS (RULINGS.md, "Price feed sourcing: real feed,
 * official APIs, no evasion"): one honest user agent, no spoofed headers, no
 * rotated address, no retry around a refusal. A 403, a 429, or a challenge page
 * throws `Blocked` on the first sight of it, and the runner stops.
 */

import type { Listing, PriceSource } from './sources.ts';

/*
 * D-015 (see canadiantire.ts): the seller is the store's name, not the host.
 * One name for all 196 stores in the list; the header says why.
 */
const SELLER = 'Save-On-Foods';
export const SAVE_ON_FOODS_SELLER = SELLER;

export const GATEWAY = 'https://storefrontgateway.saveonfoods.com/api';

export const HEADERS: Readonly<Record<string, string>> = {
  'user-agent': 'ShinPriceCheck/0.1',
  accept: 'application/json',
};

/** A refusal: 403, 429, or a challenge page. Never a fact about what the store carries. */
export class Blocked extends Error {
  readonly status: number;
  constructor(status: number, why: string) {
    super(`blocked, HTTP ${status}: ${why}`);
    this.name = 'Blocked';
    this.status = status;
  }
}

export interface Store {
  readonly retailerStoreId: string;
  readonly name: string;
  readonly city: string | null;
  readonly province: string | null;
  readonly type: string | null;
}

export interface Product {
  /** The GTIN-14 exactly as the response's `sku` published it. */
  readonly sku: string;
  readonly name: string;
  readonly brand: string | null;
  readonly priceText: string | null;
  readonly priceCents: number | null;
  readonly wasPriceText: string | null;
  readonly wasPriceCents: number | null;
  /** `unitPrice` verbatim, e.g. "$0.83/100g". */
  readonly unitPriceText: string | null;
  readonly unitPriceCents: number | null;
  readonly unitPricePer: string | null;
  /** True when a wasPrice, a non-empty `promotions`, or a `tprInfo` is present. */
  readonly onPromotion: boolean;
  readonly priceSource: string | null;
  /** From `available`: null when the field is absent, never a guess. */
  readonly available: boolean | null;
  readonly imageUrl: string | null;
}

export type Lookup =
  | { readonly kind: 'found'; readonly product: Product; readonly status: number; readonly raw: unknown }
  | { readonly kind: 'absent'; readonly status: number }
  | { readonly kind: 'error'; readonly status: number; readonly why: string };

/** A 13-digit catalogue code (or any 8 to 14 digit GTIN) as the gateway's GTIN-14 key. */
export function toGtin14(code: string): string {
  const digits = code.trim();
  if (!/^\d{8,14}$/.test(digits)) throw new Error(`not a barcode: ${JSON.stringify(code)}`);
  return digits.padStart(14, '0');
}

/** "$8.29" or "$1,299.00" to cents. Anything else ("2 for $5") is null, not a guess. */
export function dollarsToCents(text: unknown): number | null {
  if (typeof text !== 'string') return null;
  const m = /^\s*\$\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?\s*$/.exec(text);
  if (!m) return null;
  const whole = Number(m[1]!.replace(/,/g, ''));
  const frac = m[2] === undefined ? 0 : Number(m[2].padEnd(2, '0'));
  const cents = whole * 100 + frac;
  return cents > 0 ? cents : null;
}

const PER: readonly (readonly [RegExp, string])[] = [
  [/^100\s*g$/i, '100g'],
  [/^100\s*ml$/i, '100ml'],
  [/^1?\s*kg$/i, 'kg'],
  [/^1?\s*l$/i, 'l'],
  [/^1?\s*lb$/i, 'lb'],
  [/^(1\s*)?(ea|each)$/i, 'each'],
];

/**
 * "$0.83/100g" to { cents: 83, per: '100g' }. A unit this does not recognise
 * leaves both null; the published text survives in `unitLabel` either way.
 * A fractional cent ("$0.083/100g") is kept fractional, as store.ts allows.
 */
export function parseUnitPrice(text: unknown): { cents: number | null; per: string | null } {
  if (typeof text !== 'string') return { cents: null, per: null };
  /* Both shapes were seen live on 2026-09-30: "$0.83/100g" and "$0.96 each". */
  const m = /^\s*\$\s*(\d+(?:\.\d+)?)\s*(?:\/\s*|\s+)(.+?)\s*$/.exec(text);
  if (!m) return { cents: null, per: null };
  const per = PER.find(([re]) => re.test(m[2]!))?.[1] ?? null;
  if (per === null) return { cents: null, per: null };
  const cents = Math.round(Number(m[1]) * 100 * 1000) / 1000;
  return { cents: cents > 0 ? cents : null, per };
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseProduct(json: unknown): Product | null {
  if (json === null || typeof json !== 'object') return null;
  const p = json as any;
  const sku = str(p.sku);
  const name = str(p.name);
  if (sku === null || name === null) return null;
  const wasPriceText = str(p.wasPrice);
  const promotions = Array.isArray(p.promotions) ? p.promotions : [];
  const tpr = p.tprInfo !== null && typeof p.tprInfo === 'object';
  const unit = parseUnitPrice(p.unitPrice);
  return {
    sku,
    name,
    brand: str(p.brand),
    priceText: str(p.price),
    priceCents: dollarsToCents(p.price),
    wasPriceText,
    wasPriceCents: dollarsToCents(p.wasPrice),
    unitPriceText: str(p.unitPrice),
    unitPriceCents: unit.cents,
    unitPricePer: unit.per,
    onPromotion: wasPriceText !== null || promotions.length > 0 || tpr,
    priceSource: str(p.priceSource),
    available: typeof p.available === 'boolean' ? p.available : null,
    imageUrl: str(p.primaryImage?.default),
  };
}

export function parseStores(json: unknown): Store[] {
  const items = (json as any)?.items;
  if (!Array.isArray(items)) return [];
  const out: Store[] = [];
  for (const s of items) {
    const id = str(s?.retailerStoreId);
    const name = str(s?.name);
    if (id === null || name === null) continue;
    out.push({
      retailerStoreId: id,
      name,
      city: str(s.city),
      province: str(s.countyProvinceState),
      type: str(s.type),
    });
  }
  return out;
}

const CHALLENGE_MARKERS = [/just a moment/i, /cf-chl/i, /challenge-platform/i, /attention required/i, /cf-turnstile/i];

/**
 * What one HTTP answer means. Pure, so every branch is tested from recorded
 * bodies. Order matters: a challenge page is a refusal whatever its status.
 */
export function classify(
  status: number,
  contentType: string | null,
  body: string,
): Lookup | { kind: 'blocked'; status: number; why: string } {
  const ct = (contentType ?? '').toLowerCase();
  if (status === 403 || status === 429) return { kind: 'blocked', status, why: `HTTP ${status}` };
  if (ct.includes('text/html') && CHALLENGE_MARKERS.some((re) => re.test(body))) {
    return { kind: 'blocked', status, why: 'challenge page' };
  }
  if (status === 404) return { kind: 'absent', status };
  if (status !== 200) return { kind: 'error', status, why: `HTTP ${status}` };
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { kind: 'error', status, why: `200 but not JSON (${ct || 'no content type'})` };
  }
  const product = parseProduct(json);
  if (product === null) return { kind: 'error', status, why: '200 JSON without sku and name' };
  return { kind: 'found', product, status, raw: json };
}

export type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export function productUrl(storeId: string, gtin14: string): string {
  return `${GATEWAY}/stores/${encodeURIComponent(storeId)}/products/${gtin14}`;
}

/** One barcode at one store. Exactly one request; throws `Blocked`, never retries. */
export async function lookup(
  storeId: string,
  code: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  timeoutMs = 10_000,
): Promise<Lookup> {
  const res = await fetchImpl(productUrl(storeId, toGtin14(code)), {
    headers: { ...HEADERS },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.text();
  const c = classify(res.status, res.headers.get('content-type'), body);
  if (c.kind === 'blocked') throw new Blocked(c.status, c.why);
  return c;
}

/** The store list. One request; throws `Blocked` like `lookup`. */
export async function fetchStores(fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<Store[]> {
  const res = await fetchImpl(`${GATEWAY}/stores`, { headers: { ...HEADERS }, signal: AbortSignal.timeout(15_000) });
  const body = await res.text();
  const ct = res.headers.get('content-type');
  if (res.status === 403 || res.status === 429) throw new Blocked(res.status, `HTTP ${res.status}`);
  if ((ct ?? '').includes('text/html') && CHALLENGE_MARKERS.some((re) => re.test(body))) {
    throw new Blocked(res.status, 'challenge page');
  }
  if (res.status !== 200) throw new Error(`store list: HTTP ${res.status}`);
  return parseStores(JSON.parse(body));
}

/** A found product as a `Listing`, for the `sources.ts` contract. */
export function listingOf(p: Product, storeId: string, observedAt: string): Listing | null {
  if (p.priceCents === null) return null;
  return {
    seller: SELLER,
    sellerSku: `${storeId}:${p.sku}`,
    title: p.name,
    brand: p.brand,
    gtin: p.sku,
    sizeValue: null,
    sizeUnit: null,
    amountCents: p.priceCents,
    kind: p.onPromotion ? 'promotional' : 'regular',
    observedAt,
    /* NOT measured: the response publishes `taxDetails: []` and nothing else about
       tax. `Listing` has no "unknown", so this carries the shelf-price convention
       every other source in this package uses; the stored row makes no tax claim. */
    preTax: true,
    url: productUrl(storeId, p.sku),
  };
}

/** A `PriceSource` pinned to one store. Joins by barcode: the gateway is keyed by it. */
export function saveOnFoodsSource(storeId: string, fetchImpl?: FetchLike): PriceSource {
  return {
    seller: SELLER,
    joins: 'gtin',
    async fetch(query) {
      if (!query.gtin) return [];
      const r = await lookup(storeId, query.gtin, fetchImpl);
      if (r.kind !== 'found') return [];
      const l = listingOf(r.product, storeId, new Date().toISOString().slice(0, 10));
      return l === null ? [] : [l];
    },
  };
}
