/**
 * Walmart Canada, read the way the page reads itself.
 *
 * MEASURED 2026-09-05, not remembered:
 *
 *   - Product pages embed their data as JSON in a script tag with id
 *     `__NEXT_DATA__`. No key, no auth, no cookie. About 800 ms a page.
 *   - The site does not index barcodes: searching `q=068100084245` (before the
 *     search leg below was removed) returned count 0, while `q=kraft peanut
 *     butter` returned 15. The barcode exists nowhere except the product page,
 *     as `product.upc`, twelve digits. Zero padded to thirteen it is the same
 *     code Open Food Facts uses. The Kraft 1 kg jar reads upc 068100084245 at
 *     $5.97 with a unit price of "30 cents per 100 g" already computed by the
 *     seller.
 *
 * This file only opens a product page by SKU; it no longer searches by text.
 * `search()` and the candidate parsing that fed it were removed 2026-09-05
 * because walmart.ca/robots.txt disallows `/search?*` under `User-agent: *`.
 *
 * DISCOVERY IS BUILT NOW, 2026-09-08. What the paragraphs below describe as
 * "not built here" is `walmart-sitemap.ts`, sitting next to this file. It
 * reuses this file's header set, its retry shape and its `Throttled` error
 * rather than carrying a second copy of any of them, which is why `HEADERS`,
 * `RETRIES` and `RETRY_BASE_MS` are exported below instead of staying local.
 * The rest of this header is left standing because it is the measurement that
 * decided the route, and it is still what makes the route legal.
 *
 * That does not close off discovery. The same robots.txt lists, among sixteen
 * Sitemap lines:
 *
 *     Sitemap: https://www.walmart.ca/sitemap-product-1p-en.xml
 *
 * which is a sitemap INDEX (checked 2026-09-05) pointing at five gzipped
 * shards, lastmod 2026-09-03. One shard, downloaded and read, holds entries
 * shaped exactly like:
 *
 *     <loc>https://www.walmart.ca/en/ip/miniJACK-Gender-Neutral-Toddler-Washed-Muscle-Tank/7EC4X3MM71OJ</loc>
 *
 * The last path segment, `7EC4X3MM71OJ` here, is the sku `detail()` below
 * takes, and the URL sits under `/en/ip/*\/*`, which robots.txt explicitly
 * Allows. A sitemap crawler built against this would be a sanctioned way to
 * discover new SKUs. It is not built here: that is a scoped decision for
 * whoever picks it up next, not a side effect of deleting a disallowed search
 * call. See crawl.ts's header for what the crawl can do without it.
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
const SELLER = 'Walmart';
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
export const HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'accept-language': 'en-CA,en;q=0.9',
};

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
 * looking shell, about 7.5 kB, and NO embedded data. A real search page,
 * measured before the search leg was removed, ran 460 to 580 kB. The stub
 * comes from PerimeterX sitting in front of the whole site, not from anything
 * route specific, so the same 60 kB cutoff below is what tells a throttled
 * product page apart from a real one too.
 *
 * This distinction is the whole reason this function exists. Without it a
 * throttled reply parses as a page that found nothing, and the coverage
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
export const RETRIES = 3;
export const RETRY_BASE_MS = 6000;

const nap = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getHtml(url: string, timeoutMs: number): Promise<string | null> {
  /*
   * 2026-09-09: During a rate probe, a challenged page should cost exactly one
   * request. A retry on a CHALLENGE response is another request against the
   * counter that is holding the block, not a break through it. So challenge
   * retries are controlled separately from 429/403/network retries via the env
   * var SHIN_WALMART_CHALLENGE_RETRIES. This lets a probe set it to 0 to get
   * one page for one request, while keeping retry logic for transient errors.
   */
  const challengeRetriesEnv = process.env.SHIN_WALMART_CHALLENGE_RETRIES;
  const maxChallengeRetries =
    challengeRetriesEnv === undefined
      ? RETRIES
      : (() => {
          const parsed = parseInt(challengeRetriesEnv, 10);
          return isNaN(parsed) ? RETRIES : parsed;
        })();

  let last = 0;
  let challengeRetryCount = 0;
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
    if (challengeRetryCount >= maxChallengeRetries) break;
    challengeRetryCount += 1;
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
