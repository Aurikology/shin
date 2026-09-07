/**
 * Canadian Tire, read through its own storefront API, not the rendered page.
 *
 * MEASURED 2026-09-05, not remembered:
 *
 *   - A plain `fetch` with only a browser user agent gets a full 367,714 byte
 *     page from www.canadiantire.ca every time. Ran the header-pairing test
 *     that broke Walmart (UA alone, UA+accept-language, UA+accept, all three,
 *     with a UA-only control between each case) and every combination came
 *     back byte-identical at 367,714. This site does not have Walmart's bug.
 *   - The rendered search and product pages carry NO product data of their
 *     own; not in the HTML, not in a `__NEXT_DATA__` block, not in the
 *     `application/ld+json` tags (those are just header/footer navigation
 *     schema). The page ships an inline script that fetches the real data
 *     client side, from `https://www.canadiantire.ca/api/v1/search/v2/search`
 *     and `https://www.canadiantire.ca/api/v1/product/api/v2/product/
 *     productFamily/{code}`. Both are same-origin paths behind Akamai, not a
 *     separate host, and both answered a plain Node `fetch` with real JSON
 *     and no browser, cookies, or token beyond what is below.
 *   - Both endpoints require a numeric `store` (search) or `storeId` (detail)
 *     parameter or they 400 with "'store' parameter must be supplied". There
 *     is no store-free national query. `448` is lifted verbatim from the
 *     page's own `defaultStoreId` config value, i.e. what an anonymous
 *     visitor with nothing in `localStorage` gets served. Whether price
 *     itself varies by store was NOT measured; this is recorded as an open
 *     question, not settled as "national".
 *   - Both endpoints also require an `Ocp-Apim-Subscription-Key` header. The
 *     key below, `c01ef3612328420c9f5cd9277e815a0e`, is read verbatim out of
 *     the page's own unauthenticated HTML for an anonymous visitor with no
 *     login. It is not a secret pulled from a login flow; it is the public
 *     key the storefront hands every visitor so their own browser can call
 *     the API. Calling the API without it returns 401.
 *   - Every product tile carries a field called `partNumber`, and it looked
 *     at first like the barcode this join model wants. It is not one. Nine
 *     of ten sample products (a "peanut butter" search) carry short
 *     manufacturer catalogue codes like `46929`, `39222`, `VP6954`, `FFH04`,
 *     five to seven characters, not twelve digits. The one 12-digit
 *     exception, Kraft Peanut Butter Smooth 1 kg at `681000842400`, fails
 *     the UPC-A check digit (computed 3, published digit 0) and does not
 *     match this catalogue's own barcode for that exact product,
 *     `0068100084245`. So `partNumber` is a vendor part number, not a GTIN,
 *     for both the short codes and the one that happened to be 12 digits
 *     long. This seller joins by name, the same as Loblaws, not by barcode.
 *   - Neither the search nor the product endpoint publishes a unit price
 *     (checked the raw JSON for `unitPrice`, `pricePerUnit`, `perUnit`,
 *     `unit_price`, `comparisonPrice`: none present). `unitPriceCents` and
 *     `unitLabel` are always null for this seller, not a parsing gap.
 *   - The page embeds an Akamai bot-manager sensor script
 *     (`/akam/13/37d9bb25`), the same vendor that blocks Loblaws outright.
 *     It did not block a single-threaded plain fetch in this session. That
 *     is a fact about the traffic tested, not a guarantee about heavier
 *     traffic; the retry-on-403 below is a precaution, not a reproduction of
 *     an observed block the way Walmart's stub-response handling is.
 */

/*
 * D-015. The seller is the store's name, not the domain the page was fetched
 * from. It was 'walmart.ca' here and 'canadiantire.ca' next door, while every
 * other source in this package emits a store name, so one row in a verdict's
 * provenance list read "at walmart.ca" among a column of proper names.
 *
 * Fixed at the producer rather than in the screens, and that was the argument
 * worth having. A lookup table in the client would have been a third copy of a
 * name this tree already holds twice (spine/data/observations.json says
 * "Walmart", and /api/scenarios serves it), and the day loblaws.ca is crawled
 * the client prints a hostname, nothing fails, and no test covers a seller that
 * did not exist when the test was written. There are four render sites and only
 * one origin.
 *
 * Safe for matching, checked rather than assumed: normalizeSeller strips the
 * .ca through SELLER_NOISE and removes whitespace, so 'walmart.ca' and
 * 'Walmart' already collapsed to the same key. Its own comment says so. This
 * changes what a person reads and nothing about self-exclusion or the count of
 * distinct sellers.
 */
const SELLER = 'Canadian Tire';
const BASE = 'https://www.canadiantire.ca';
const API = `${BASE}/api`;

/** Read verbatim from the page's own anonymous, unauthenticated HTML. Not a secret. */
const SUBSCRIPTION_KEY = 'c01ef3612328420c9f5cd9277e815a0e';

/** The site's own `defaultStoreId`, what an anonymous visitor is served. See header comment. */
const STORE_ID = '448';

const HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'ocp-apim-subscription-key': SUBSCRIPTION_KEY,
  baseSiteId: 'CTR',
  bannerid: 'CTR',
  'service-version': 'v1',
  'service-client': 'ctr/web',
  'x-web-host': 'www.canadiantire.ca',
  accept: 'application/json, text/plain, */*',
  /** Without this the search endpoint defaults to 10 results; the desktop site asks for 24. */
  count: '24',
};

export interface Candidate {
  readonly sku: string;
  readonly name: string;
  readonly brand: string | null;
  readonly priceCents: number | null;
  readonly url: string | null;
  readonly imageUrl: string | null;
  readonly rating: number | null;
  readonly reviews: number | null;
}

export interface ProductDetail {
  readonly sku: string;
  readonly name: string;
  readonly brand: string | null;
  /** Always null for this seller. Measured 2026-09-05: no barcode published, see header comment. */
  readonly upc: string | null;
  readonly priceCents: number | null;
  readonly wasPriceCents: number | null;
  /** Always null for this seller. Measured 2026-09-05: no unit price field exists in the API. */
  readonly unitPriceCents: number | null;
  readonly unitLabel: string | null;
  readonly inStock: boolean;
  readonly imageUrl: string | null;
  readonly url: string;
}

/**
 * A blocked response, told apart from a real one by status code.
 *
 * Unlike Walmart, a block here has not been reproduced; this exists because
 * the site is behind the same bot-detection vendor, not because a stub was
 * caught in the act. Treated as unknown rather than zero for the same reason
 * store.ts's `throttled` outcome exists at all: a refusal is not a fact about
 * what the seller stocks.
 */
export class Throttled extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`throttled, HTTP ${status}`);
    this.name = 'Throttled';
    this.status = status;
  }
}

const RETRIES = 3;
const RETRY_BASE_MS = 6000;

const nap = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string, timeoutMs: number): Promise<unknown | null> {
  let lastStatus = 0;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    if (attempt > 0) await nap(RETRY_BASE_MS * attempt);
    let res: Response;
    try {
      res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      continue;
    }
    if (res.status === 429 || res.status === 403) {
      lastStatus = res.status;
      continue;
    }
    /* 410 is the product endpoint's answer for a code it does not recognise. Not a throttle. */
    if (res.status === 410) return null;
    if (!res.ok) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  throw new Throttled(lastStatus);
}

function cents(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function dig(o: unknown, path: readonly string[]): any {
  let cur: any = o;
  for (const k of path) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

/**
 * Text search. Store id is required by the API itself; see header comment.
 *
 * Throws `Throttled` rather than returning an empty list, for the same reason
 * walmart.ts does: an empty list means the seller has nothing and a block
 * means we do not know which.
 */
export async function search(query: string, timeoutMs = 8000): Promise<Candidate[]> {
  const url = `${API}/v1/search/v2/search?q=${encodeURIComponent(query)}&store=${STORE_ID}`;
  const json = await getJson(url, timeoutMs);
  if (json === null) return [];
  const products = dig(json, ['products']);
  if (!Array.isArray(products)) return [];
  const out: Candidate[] = [];
  for (const p of products) {
    const sku = String((p as any)?.code ?? '');
    const name = (p as any)?.title;
    if (sku === '' || typeof name !== 'string') continue;
    const relUrl = (p as any)?.url;
    out.push({
      sku,
      name,
      brand: typeof dig(p, ['brand', 'label']) === 'string' ? dig(p, ['brand', 'label']) : null,
      priceCents: cents(dig(p, ['currentPrice', 'value'])),
      url: typeof relUrl === 'string' ? BASE + relUrl : null,
      imageUrl: typeof dig(p, ['images', '0', 'url']) === 'string' ? dig(p, ['images', '0', 'url']) : null,
      rating: typeof (p as any)?.rating === 'number' ? (p as any).rating : null,
      reviews: typeof (p as any)?.ratingsCount === 'number' ? (p as any).ratingsCount : null,
    });
  }
  return out;
}

/** One product family. `sku` is the `code` a search result gave, e.g. `3996591P`. */
export async function detail(sku: string, timeoutMs = 8000): Promise<ProductDetail | null> {
  const url = `${API}/v1/product/api/v2/product/productFamily/${encodeURIComponent(sku)}?baseStoreId=CTR&lang=en_CA&storeId=${STORE_ID}&light=true`;
  const json = await getJson(url, timeoutMs);
  if (json === null) return null;
  const p = json as any;
  if (typeof p.name !== 'string') return null;

  const quantity = dig(p, ['fulfillment', 'availability', 'quantity']);
  const inStock = p.sellable === true || (typeof quantity === 'number' && quantity > 0);

  return {
    sku: typeof p.code === 'string' ? p.code : sku,
    name: p.name,
    brand: typeof dig(p, ['brand', 'label']) === 'string' ? dig(p, ['brand', 'label']) : null,
    upc: null,
    priceCents: cents(dig(p, ['currentPrice', 'value'])),
    wasPriceCents: cents(dig(p, ['originalPrice', 'value'])),
    unitPriceCents: null,
    unitLabel: null,
    inStock,
    imageUrl: typeof dig(p, ['images', '0', 'url']) === 'string' ? dig(p, ['images', '0', 'url']) : null,
    url: typeof p.canonicalUrl === 'string' ? BASE + p.canonicalUrl : BASE + `/en/pdp/${encodeURIComponent(sku)}.html`,
  };
}

export { SELLER as CANADIAN_TIRE_SELLER };
