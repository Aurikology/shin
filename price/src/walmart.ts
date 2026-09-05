/**
 * Walmart Canada, read the way the page reads itself.
 *
 * MEASURED 2026-09-05, not remembered:
 *
 *   - Search and product pages both embed their data as JSON in a script tag
 *     with id `__NEXT_DATA__`. No key, no auth, no cookie. About 800 ms a page.
 *   - Search by UPC returns ZERO results. `q=068100084245` gives count 0 while
 *     `q=kraft peanut butter` gives 15. The site does not index barcodes. This
 *     kills the obvious plan of joining by barcode in one request and is why
 *     this adapter costs two requests per product instead of one.
 *   - Search result items carry name, brand, price, rating, review count, image
 *     and a canonical URL, and carry NO barcode. Every key was listed; there is
 *     no upc, gtin, ean, sku or barcode field.
 *   - The product page DOES carry the barcode, as `product.upc`, twelve digits.
 *     Zero padded to thirteen it is the same code Open Food Facts uses. The
 *     Kraft 1 kg jar reads upc 068100084245 at $5.97 with a unit price of
 *     "30 cents per 100 g" already computed by the seller.
 *
 * So the shape is forced: search by text to get candidates, then open the top
 * few product pages to learn their barcodes, and accept the one whose barcode
 * is the one we asked for. That is still an exact join. It just costs a hop.
 *
 * The text search is where the recall is won or lost, so the query is built
 * from brand plus name plus size rather than from the catalogue's display name,
 * which often carries marketing words the seller does not use.
 */

const SELLER = 'walmart.ca';
const BASE = 'https://www.walmart.ca';

/**
 * A browser user agent, because the site serves a different and emptier page to
 * an unrecognised client. This is the same page a person sees, requested the
 * same way; nothing here reads anything a visitor could not read.
 */
/**
 * DO NOT ADD AN `accept` HEADER HERE. Measured 2026-09-05, three times out of
 * three with controls either side: sending `accept-language` and `accept`
 * TOGETHER makes the site return a 7,535 byte stub instead of the page. Either
 * header alone is fine, and the user agent alone is fine. The pair is not.
 *
 * This cost most of an afternoon and was misdiagnosed twice, first as
 * PerimeterX rate limiting and then as intermittent throttling, because a stub
 * response also leaves the next request or two likely to stub, which makes any
 * unpaired A/B test look random. The controls between every case are what
 * finally separated it.
 */
const HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'accept-language': 'en-CA,en;q=0.9',
};

/** How many product pages one search is allowed to open. */
export const MAX_PAGES_PER_SEARCH = 4;

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
  /** Twelve or thirteen digits as published. Not padded here; the caller decides. */
  readonly upc: string | null;
  readonly priceCents: number | null;
  readonly wasPriceCents: number | null;
  readonly unitPriceCents: number | null;
  readonly unitLabel: string | null;
  readonly inStock: boolean;
  readonly imageUrl: string | null;
  readonly url: string;
}

/**
 * Pull the page's own JSON out of the HTML.
 *
 * Deliberately not a regex over the whole document. The string `__NEXT_DATA__`
 * also appears inside an unrelated inline script earlier in the page, and a
 * naive match lands there and fails to parse. Anchor on the opening tag.
 */
function embeddedJson(html: string): unknown | null {
  const tag = /<script id="__NEXT_DATA__"[^>]*>/.exec(html);
  if (!tag) return null;
  const open = tag.index + tag[0].length;
  const close = html.indexOf('</script>', open);
  if (close < 0) return null;
  try {
    return JSON.parse(html.slice(open, close));
  } catch {
    return null;
  }
}

/**
 * A throttled response, told apart from a real one by length.
 *
 * MEASURED 2026-09-05: the site is behind PerimeterX bot detection (the page
 * declares `window._pxAppId`). Three concurrent workers tripped it within about
 * forty requests. A throttled response still returns HTTP 200 with a normal
 * looking shell, about 7.5 kB, and NO embedded data. A real search page is 460
 * to 580 kB.
 *
 * This distinction is the whole reason this function exists. Without it a
 * throttled reply parses as a search that found nothing, and the coverage
 * figure the crawl reports becomes a statement about our request rate dressed
 * up as a statement about what Walmart stocks. A zero has to be provably a zero
 * before it is recorded as one.
 */
const BLOCKED_UNDER_BYTES = 60_000;

export class Throttled extends Error {
  readonly bytes: number;
  constructor(bytes: number) {
    super(`throttled, ${bytes} byte response`);
    this.name = 'Throttled';
    this.bytes = bytes;
  }
}

/**
 * How many times one URL is re-asked before giving up on it.
 *
 * MEASURED 2026-09-05: the stub is intermittent, not deterministic. The exact
 * same request that returned 7,535 bytes returned 670,825 bytes a minute later
 * with byte-identical headers. Several attempts to isolate a header that caused
 * it each contaminated the next, which is the honest reason there is no clean
 * sustainable-rate number here: the measurement kept measuring itself.
 *
 * So the design does not depend on knowing the rate. It asks again, waits
 * longer each time, and treats the whole thing as unknown rather than as a
 * zero if it never gets a real page.
 */
const RETRIES = 3;
const RETRY_BASE_MS = 6000;

const nap = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getHtml(url: string, timeoutMs: number): Promise<string | null> {
  let last = 0;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    if (attempt > 0) await nap(RETRY_BASE_MS * attempt);
    let res: Response;
    try {
      res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      continue;
    }
    if (res.status === 429 || res.status === 403) {
      last = 0;
      continue;
    }
    if (!res.ok) return null;
    const body = await res.text();
    if (body.length >= BLOCKED_UNDER_BYTES) return body;
    last = body.length;
  }
  throw new Throttled(last);
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
 * Text search. Returns the grid as the site would show it, price included, barcode absent.
 *
 * Throws `Throttled` rather than returning an empty list, because an empty list
 * means the seller has nothing and a throttle means we do not know.
 */
export async function search(query: string, timeoutMs = 8000): Promise<Candidate[]> {
  const html = await getHtml(`${BASE}/search?q=${encodeURIComponent(query)}`, timeoutMs);
  if (html === null) return [];
  const json = embeddedJson(html);
  if (json === null) return [];
  const stacks = dig(json, ['props', 'pageProps', 'initialData', 'searchResult', 'itemStacks']);
  if (!Array.isArray(stacks)) return [];
  const out: Candidate[] = [];
  for (const stack of stacks) {
    const items = (stack as any)?.items;
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      const sku = String((it as any)?.usItemId ?? (it as any)?.id ?? '');
      const name = (it as any)?.name;
      if (sku === '' || typeof name !== 'string') continue;
      /* Sponsored rows are ads for a different product. They price something we did not ask about. */
      if ((it as any)?.sponsoredProduct) continue;
      out.push({
        sku,
        name,
        brand: typeof (it as any)?.brand === 'string' ? (it as any).brand : null,
        priceCents: cents((it as any)?.price),
        url: typeof (it as any)?.canonicalUrl === 'string' ? BASE + (it as any).canonicalUrl : null,
        imageUrl: typeof (it as any)?.image === 'string' ? (it as any).image : null,
        rating: typeof (it as any)?.averageRating === 'number' ? (it as any).averageRating : null,
        reviews: typeof (it as any)?.numberOfReviews === 'number' ? (it as any).numberOfReviews : null,
      });
    }
  }
  return out;
}

/** Open one product page. This is the only place the barcode exists. */
export async function detail(sku: string, timeoutMs = 8000): Promise<ProductDetail | null> {
  const url = `${BASE}/en/ip/x/${encodeURIComponent(sku)}`;
  const html = await getHtml(url, timeoutMs);
  if (html === null) return null;
  const json = embeddedJson(html);
  if (json === null) return null;
  const p = dig(json, ['props', 'pageProps', 'initialData', 'data', 'product']);
  if (!p || typeof p.name !== 'string') return null;

  const price = dig(p, ['priceInfo', 'currentPrice', 'price']);
  const was = dig(p, ['priceInfo', 'wasPrice', 'price']);
  const unit = dig(p, ['priceInfo', 'unitPrice', 'price']);
  const unitLabel = dig(p, ['priceInfo', 'unitPrice', 'priceString']);

  return {
    sku: String(p.usItemId ?? p.id ?? sku),
    name: p.name,
    brand: typeof p.brand === 'string' ? p.brand : null,
    upc: typeof p.upc === 'string' && /^\d{8,14}$/.test(p.upc) ? p.upc : null,
    priceCents: cents(price),
    wasPriceCents: cents(was),
    unitPriceCents: cents(unit),
    unitLabel: typeof unitLabel === 'string' ? unitLabel : null,
    inStock: p.availabilityStatus === 'IN_STOCK',
    imageUrl: dig(p, ['imageInfo', 'thumbnailUrl']) ?? null,
    url,
  };
}

export { SELLER as WALMART_SELLER };
