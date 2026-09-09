/**
 * Discovery: how a Walmart SKU gets found in the first place.
 *
 * This is the file `walmart.ts` and `crawl.ts` and `queue.ts` have all been
 * pointing at since 2026-09-05, when the search leg was deleted for being
 * disallowed. Their headers each say the sanctioned replacement is the site's
 * own product sitemap and that nobody had built it. This is it.
 *
 * WHAT ROBOTS.TXT ACTUALLY SAYS, fetched live 2026-09-08, quoted rather than
 * remembered, because the whole legality of this file rests on four lines:
 *
 *     Disallow: /search?*
 *     Disallow: /en/ip/*
 *     Allow: /en/ip/*\/*
 *     Sitemap: https://www.walmart.ca/sitemap-product-1p-en.xml
 *
 * Read in order: search is closed, a bare `/en/ip/<something>` is closed, and
 * a two-segment `/en/ip/<slug>/<sku>` is opened by name. Every URL this file
 * emits has both segments or it is dropped, and that check is `skuFromProductUrl`
 * below rather than a comment, because a rule enforced by prose is a rule that
 * gets broken by the next edit.
 *
 * There is NO `Crawl-delay` for `User-agent: *` in that file today; the only
 * one present is `User-agent: Bingbot / Crawl-delay: 1`. Absence of a limit is
 * not permission to go fast, so `POLITE_DELAY_MS` below is a fixed floor we
 * impose on ourselves, and `crawlDelayMs()` still reads the file each run so
 * that the day Walmart adds a number for `*`, the number wins over our floor
 * without anyone having to notice.
 *
 * MEASURED 2026-09-08, not estimated:
 *
 *   - `sitemap-product-1p-en.xml` is an INDEX, 689 bytes, listing 5 gzipped
 *     children. `sitemap-product-3p-head-en.xml` lists 19.
 *     `sitemap-product-3p-en.xml` lists 1,848.
 *   - One 1p child (`sitemap-product-1p-en.xml.gz`) is 3.8 MB gzipped, 13.2 MB
 *     expanded, and holds 43,532 `<url>` entries, every one of them under
 *     `/en/ip/`, every one carrying a `<lastmod>`.
 *   - One 3p child sampled at random (`sitemap-product-3p-en500.xml.gz`) is
 *     5.2 MB gzipped, 16.4 MB expanded, 44,980 entries.
 *
 * So the 1p (first party) set is roughly 217,660 SKUs and the 3p (marketplace)
 * set is roughly 83 million. That size difference is why `PRODUCT_SITEMAP_INDEXES`
 * below is ordered 1p first and why a caller that does not pass `indexes` gets
 * only the 1p one. 83 million product pages at any polite rate is not a crawl,
 * it is a decade; see `crawl.ts`'s header for the arithmetic. The 3p indexes are
 * exported so a future targeted pass can reach them, not so a default run can.
 *
 * SKU SHAPES ARE MIXED and both are real, taken from the same file:
 *
 *     .../en/ip/Safavieh-Cambridge-Kirsten-Geometric-Area-Rug/6000204050299
 *     .../en/ip/miniJACK-Gender-Neutral-Toddler-Washed-Muscle-Tank/7EC4X3MM71OJ
 *
 * A parser that assumed digits would silently drop most of the marketplace.
 *
 * THE SLUG IS NOT A PRODUCT IDENTITY. Decision of 2026-09-05, restated here
 * because this is the file that could break it: the slug may choose what to
 * open, never what it matched. Nothing in this file reads the slug for meaning,
 * and the barcode confirmation happens where it always did, in `detail()`.
 *
 * NOTHING HERE BUFFERS A WHOLE SITEMAP SET. Each child is streamed, gunzipped
 * on the fly and parsed `<url>` block by `<url>` block, so walking all 1,872
 * English product sitemaps costs one 16 MB decompression window at a time and
 * not 30 GB of resident memory. `streamProductSitemap` is an async generator
 * for that reason, and a caller that only wants five SKUs stops after five.
 */

import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { HEADERS, RETRIES, RETRY_BASE_MS, Throttled } from './walmart.ts';

const BASE = 'https://www.walmart.ca';

/**
 * The product sitemap indexes robots.txt lists, English only.
 *
 * The French ones (`-fr`) are the same products under `/fr/ip/`, so crawling
 * both would double the request count to discover the same SKUs. The French
 * pages are equally allowed; they are just redundant for discovery.
 */
export const PRODUCT_SITEMAP_INDEXES = {
  /** First party. Walmart's own inventory: about 217,660 SKUs across 5 children. */
  firstParty: `${BASE}/sitemap-product-1p-en.xml`,
  /** Marketplace head: the 3p items Walmart itself considers worth a head sitemap, 19 children. */
  marketplaceHead: `${BASE}/sitemap-product-3p-head-en.xml`,
  /** Marketplace long tail: 1,848 children, roughly 83 million SKUs. Not a default target. */
  marketplaceTail: `${BASE}/sitemap-product-3p-en.xml`,
} as const;

/**
 * The floor between two sitemap fetches, and it is our own rule, not theirs.
 *
 * Same 3000 ms `crawl.ts` measured for product pages against PerimeterX. A
 * sitemap child is one request that yields tens of thousands of SKUs, so this
 * costs almost nothing: five children of the 1p set is fifteen seconds of
 * waiting to discover 217,660 products.
 */
export const POLITE_DELAY_MS = 3000;

/** One child sitemap as its index names it. */
export interface SitemapShard {
  readonly url: string;
  readonly lastmod: string | null;
}

/** One product URL, reduced to the only two things downstream needs. */
export interface SitemapEntry {
  /** The last path segment. What `walmart.detail()` takes. */
  readonly sku: string;
  /** The full product URL as published, kept so a SKU can always be traced back. */
  readonly url: string;
  readonly lastmod: string | null;
}

const nap = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A SKU out of a product URL, or null if the URL is not one we are allowed to
 * open. This function IS the robots.txt check, so read the rejections as rules:
 *
 *   - two path segments after `/ip/` are required. `Disallow: /en/ip/*` with
 *     `Allow: /en/ip/*\/*` means the one-segment form is closed; a sitemap has
 *     never yet published one, and if it starts to, this drops it rather than
 *     fetching it.
 *   - a SKU ending `null` is dropped: `Disallow: /en/ip/*\/*null$` is a real
 *     line in that file, put there for a real bug on their side.
 *   - a query string or fragment is dropped rather than trimmed. Several
 *     `Disallow` lines key off query parameters (`/*?f=*`, `/en/*&b=1*`), so
 *     quietly stripping one would turn a disallowed URL into an allowed-looking
 *     one, which is the one transformation this function must never do.
 *
 * The alphanumeric shape admits both published forms, 13 digit and 12 character
 * mixed case, and nothing else: a percent escape or a dot in that position means
 * the URL is not the shape this parser was measured against.
 */
export function skuFromProductUrl(raw: string): string | null {
  const m = /^https:\/\/www\.walmart\.ca\/(?:en|fr)\/ip\/([^/?#]+)\/([^/?#]+)$/.exec(raw.trim());
  if (m === null) return null;
  const slug = m[1];
  const sku = m[2];
  if (slug.length === 0) return null;
  if (sku.toLowerCase().endsWith('null')) return null;
  if (!/^[A-Za-z0-9]{4,24}$/.test(sku)) return null;
  return sku;
}

function tagText(block: string, tag: string): string | null {
  const open = `<${tag}>`;
  const start = block.indexOf(open);
  if (start < 0) return null;
  const end = block.indexOf(`</${tag}>`, start + open.length);
  if (end < 0) return null;
  return block.slice(start + open.length, end).trim();
}

/**
 * `<loc>` and not `<image:loc>`.
 *
 * Every `<url>` block in these files carries an `<image:image><image:loc>` too,
 * and the image URL is on i5.walmartimages.ca, not walmart.ca. `indexOf('<loc>')`
 * cannot match `<image:loc>` because the character before `loc>` there is a
 * colon, so the plain tag lookup is already correct; this note exists so the
 * next person does not "fix" it into a regex that matches both.
 */
function entryFrom(block: string): SitemapEntry | null {
  const loc = tagText(block, 'loc');
  if (loc === null) return null;
  const sku = skuFromProductUrl(loc);
  if (sku === null) return null;
  return { sku, url: loc, lastmod: tagText(block, 'lastmod') };
}

/**
 * Product entries out of a stream of XML text, without holding the document.
 *
 * The buffer only ever holds the tail after the last completed `</url>`. The
 * cap is a guard against a response that is not a sitemap at all (a challenge
 * page has no `</url>` in it, so without the cap this would grow to the size of
 * whatever was served); a real `<url>` block measures about 400 bytes, so a
 * megabyte of tail is three orders of magnitude of headroom and cannot truncate
 * a legitimate entry.
 */
const MAX_TAIL_BYTES = 1_000_000;

export async function* entriesFromXml(chunks: AsyncIterable<string>): AsyncGenerator<SitemapEntry> {
  let buf = '';
  for await (const chunk of chunks) {
    buf += chunk;
    for (;;) {
      const end = buf.indexOf('</url>');
      if (end < 0) break;
      const block = buf.slice(0, end);
      const start = block.lastIndexOf('<url>');
      if (start >= 0) {
        const e = entryFrom(block.slice(start));
        /* A malformed block is skipped, never thrown on: one bad row in a
         * 44,000 row file must not cost the other 43,999. */
        if (e !== null) yield e;
      }
      buf = buf.slice(end + '</url>'.length);
    }
    if (buf.length > MAX_TAIL_BYTES) buf = buf.slice(-MAX_TAIL_BYTES);
  }
}

/**
 * Text out of a response body, gunzipping if the bytes say to.
 *
 * Decided by the gzip magic number and NOT by the `.gz` in the URL or by the
 * `content-type`. `fetch` sends `accept-encoding: gzip` on its own and
 * transparently decodes a `content-encoding: gzip` response, so a `.gz` file
 * can arrive either still compressed (measured: it does, served as
 * `application/x-gzip`) or already expanded, depending on what the CDN in front
 * of it decides to do that day. Sniffing two bytes is right under both.
 */
async function* textChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const first = await reader.read();
  if (first.done || first.value === undefined) return;
  const head = first.value;

  async function* raw(): AsyncGenerator<Uint8Array> {
    yield head;
    for (;;) {
      const r = await reader.read();
      if (r.done || r.value === undefined) return;
      yield r.value;
    }
  }

  const decoder = new TextDecoder();
  if (head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b) {
    const gunzip = createGunzip();
    Readable.from(raw()).pipe(gunzip);
    for await (const c of gunzip) yield decoder.decode(c as Uint8Array, { stream: true });
    return;
  }
  for await (const c of raw()) yield decoder.decode(c, { stream: true });
}

/**
 * One request, with `walmart.ts`'s retry shape rather than a second copy of it.
 *
 * The PerimeterX test is different here and has to be. `walmart.ts` tells a
 * challenge page apart from a product page by length, under 60 kB, and that
 * works there because a real product page is hundreds of kilobytes. It would be
 * wrong here: a real sitemap INDEX is 689 bytes, comfortably smaller than the
 * ~7.5 kB challenge. So the test is structural instead. A sitemap that does not
 * announce itself as `<sitemapindex` or `<urlset` in its first chunk is not a
 * sitemap, whatever its size, and that is the same fact `BLOCKED_UNDER_BYTES`
 * is reaching for by proxy next door.
 */
async function fetchSitemapStream(url: string, timeoutMs: number): Promise<AsyncGenerator<string>> {
  let lastBytes = 0;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    if (attempt > 0) await nap(RETRY_BASE_MS * attempt);
    let res: Response;
    try {
      res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      continue;
    }
    if (res.status === 429 || res.status === 403) {
      lastBytes = 0;
      continue;
    }
    if (!res.ok || res.body === null) {
      /* A 404 on a child sitemap is a real answer about that child, not a
       * throttle, and must not stall the whole walk. The caller decides. */
      throw new Error(`${url} returned HTTP ${res.status}`);
    }

    const chunks = textChunks(res.body);
    const first = await chunks.next();
    if (first.done) {
      lastBytes = 0;
      continue;
    }
    if (!/<(?:sitemapindex|urlset)[\s>]/.test(first.value)) {
      lastBytes = first.value.length;
      continue;
    }

    const head = first.value;
    return (async function* () {
      yield head;
      yield* chunks;
    })();
  }
  throw new Throttled(lastBytes);
}

/** Every child sitemap an index names. Small enough to read whole; the children are not. */
export async function fetchSitemapIndex(url: string, timeoutMs = 15_000): Promise<SitemapShard[]> {
  const chunks = await fetchSitemapStream(url, timeoutMs);
  let xml = '';
  for await (const c of chunks) xml += c;

  const shards: SitemapShard[] = [];
  const re = /<sitemap>([\s\S]*?)<\/sitemap>/g;
  for (;;) {
    const m = re.exec(xml);
    if (m === null) break;
    const loc = tagText(m[1], 'loc');
    if (loc === null) continue;
    shards.push({ url: loc, lastmod: tagText(m[1], 'lastmod') });
  }
  return shards;
}

/** Every product entry in one child sitemap, streamed. */
export async function* streamProductSitemap(
  url: string,
  timeoutMs = 60_000,
): AsyncGenerator<SitemapEntry> {
  const chunks = await fetchSitemapStream(url, timeoutMs);
  yield* entriesFromXml(chunks);
}

/**
 * The `Crawl-delay` robots.txt publishes for us, in milliseconds, or null.
 *
 * Parsed for the `User-agent: *` group only. We are not Bingbot, and reading
 * another agent's group would be reading a rule addressed to someone else. Any
 * failure to fetch or parse returns null, which leaves `POLITE_DELAY_MS` in
 * charge: a robots.txt we could not read is never treated as permission.
 */
export async function crawlDelayMs(timeoutMs = 10_000): Promise<number | null> {
  let text: string;
  try {
    const res = await fetch(`${BASE}/robots.txt`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    text = await res.text();
  } catch {
    return null;
  }

  let inStar = false;
  for (const line of text.split(/\r?\n/)) {
    const clean = line.replace(/#.*$/, '').trim();
    if (clean === '') continue;
    const [rawKey, ...rest] = clean.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      inStar = value === '*';
      continue;
    }
    if (inStar && key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
    }
  }
  return null;
}

export interface DiscoverOptions {
  /** Which sitemap indexes to walk. Defaults to the first-party one alone; see the header. */
  readonly indexes?: readonly string[];
  /** Stop after this many entries. `null` means walk every child of every index. */
  readonly limit?: number | null;
  /** Overrides the polite floor. The published `Crawl-delay`, if any, still wins over both. */
  readonly delayMs?: number;
  /** Reports progress without printing: which child is open, how many entries so far. */
  readonly onShard?: (shard: SitemapShard, indexUrl: string, shardNumber: number, total: number) => void;
}

/**
 * Every product SKU the sitemaps publish, in file order, lazily.
 *
 * Nothing accumulates. The caller decides what to keep, and a caller that
 * breaks out of the loop stops the walk mid-file with one child open and no
 * further request made.
 *
 * Order is deliberately the sitemap's own and is not shuffled. Walmart groups
 * these files by something, and the first child of the 1p index is the same
 * 43,532 products every run, so a resumed crawl that has already worked child 1
 * can skip to child 2 by counting. Shuffling would make the discovery order
 * unreproducible and take that away for no gain.
 */
export async function* discoverSkus(options: DiscoverOptions = {}): AsyncGenerator<SitemapEntry> {
  const indexes = options.indexes ?? [PRODUCT_SITEMAP_INDEXES.firstParty];
  const limit = options.limit ?? null;
  const published = await crawlDelayMs();
  const delay = Math.max(published ?? 0, options.delayMs ?? POLITE_DELAY_MS);

  let emitted = 0;
  for (const indexUrl of indexes) {
    const shards = await fetchSitemapIndex(indexUrl);
    for (let i = 0; i < shards.length; i += 1) {
      const shard = shards[i];
      await nap(delay);
      options.onShard?.(shard, indexUrl, i + 1, shards.length);
      for await (const entry of streamProductSitemap(shard.url)) {
        yield entry;
        emitted += 1;
        if (limit !== null && emitted >= limit) return;
      }
    }
  }
}
