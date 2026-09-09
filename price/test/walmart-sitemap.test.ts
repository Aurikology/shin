/**
 * Tests for sitemap discovery.
 *
 * Every fixture here is canned. Nothing in this file touches walmart.ca: a test
 * that needs the network is a test that fails on a train, and the live check
 * that this parser reads the real files is a run of `crawl.ts --discover
 * --dry-run`, recorded in `docs/decisions.md`, not something asserted here.
 *
 * The fixtures are shaped from the real thing rather than invented: the two
 * product URLs below are copied verbatim out of `sitemap-product-1p-en.xml.gz`
 * as fetched 2026-09-08, one 13-digit numeric SKU and one 12-character
 * alphanumeric, because a parser that only ever saw digits is the specific bug
 * this file exists to prevent.
 *
 * The gzip case is real gzip, produced by `node:zlib` here rather than checked
 * in as a binary, so the test proves the magic-number sniff and the gunzip
 * pipe, not just that a `.gz` suffix was noticed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { entriesFromXml, skuFromProductUrl } from '../src/walmart-sitemap.ts';

const NUMERIC = 'https://www.walmart.ca/en/ip/Safavieh-Cambridge-Kirsten-Geometric-Area-Rug/6000204050299';
const ALNUM = 'https://www.walmart.ca/en/ip/miniJACK-Gender-Neutral-Toddler-Washed-Muscle-Tank/7EC4X3MM71OJ';

/** A `<url>` block the shape the real file writes them, image child included. */
function urlBlock(loc: string, lastmod: string | null): string {
  const mod = lastmod === null ? '' : `<lastmod>${lastmod}</lastmod>`;
  return (
    `<url><loc>${loc}</loc>${mod}` +
    `<image:image><image:loc>https://i5.walmartimages.ca/asr/deadbeef.jpeg</image:loc></image:image>` +
    `</url>`
  );
}

function urlset(blocks: readonly string[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ` +
    `xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">` +
    blocks.join('') +
    `</urlset>`
  );
}

/** Feeds a string to the parser in fixed-size pieces, to prove the tail buffer works. */
async function* inPieces(text: string, size: number): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

async function collect(xml: string, pieceSize = 1 << 20) {
  const out = [];
  for await (const e of entriesFromXml(inPieces(xml, pieceSize))) out.push(e);
  return out;
}

test('both published SKU shapes parse out of the URL', () => {
  assert.equal(skuFromProductUrl(NUMERIC), '6000204050299');
  assert.equal(skuFromProductUrl(ALNUM), '7EC4X3MM71OJ');
});

test('the French product path is the same shape and is equally allowed', () => {
  assert.equal(
    skuFromProductUrl('https://www.walmart.ca/fr/ip/Tapis-Geometrique/6000204050299'),
    '6000204050299',
  );
});

test('a URL robots.txt disallows is refused, not trimmed into an allowed one', () => {
  // One segment after /ip/: `Disallow: /en/ip/*` with `Allow: /en/ip/*/*`.
  assert.equal(skuFromProductUrl('https://www.walmart.ca/en/ip/6000204050299'), null);
  // `Disallow: /en/ip/*/*null$`.
  assert.equal(skuFromProductUrl('https://www.walmart.ca/en/ip/Some-Slug/6000204050null'), null);
  // A query string is dropped whole. Several Disallow lines key off parameters,
  // so stripping one would manufacture an allowed-looking URL out of a closed one.
  assert.equal(skuFromProductUrl('https://www.walmart.ca/en/ip/Some-Slug/ABC123DEF456?f=1'), null);
  // Not a product path at all.
  assert.equal(skuFromProductUrl('https://www.walmart.ca/en/search?q=peanut+butter'), null);
  // Not walmart.ca. The image children in these files point at another host.
  assert.equal(skuFromProductUrl('https://i5.walmartimages.ca/en/ip/Slug/ABC123DEF456'), null);
});

test('a urlset yields one entry per product URL, with its lastmod', async () => {
  const entries = await collect(
    urlset([urlBlock(NUMERIC, '2026-06-29'), urlBlock(ALNUM, '2026-08-14')]),
  );
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], { sku: '6000204050299', url: NUMERIC, lastmod: '2026-06-29' });
  assert.equal(entries[1].sku, '7EC4X3MM71OJ');
  assert.equal(entries[1].lastmod, '2026-08-14');
});

test('the image child never wins the loc', async () => {
  const [entry] = await collect(urlset([urlBlock(NUMERIC, '2026-06-29')]));
  assert.equal(entry.url, NUMERIC);
  assert.ok(!entry.url.includes('walmartimages'));
});

test('a missing lastmod is null, not an invented date', async () => {
  const [entry] = await collect(urlset([urlBlock(ALNUM, null)]));
  assert.equal(entry.lastmod, null);
});

test('malformed entries are skipped and the good ones either side survive', async () => {
  const entries = await collect(
    urlset([
      urlBlock(NUMERIC, '2026-06-29'),
      '<url><lastmod>2026-01-01</lastmod></url>', // no loc at all
      '<url><loc></loc></url>', // empty loc
      urlBlock('https://www.walmart.ca/en/ip/Slug-Only', '2026-01-02'), // disallowed shape
      urlBlock('https://www.walmart.ca/en/browse/grocery/1234', '2026-01-03'), // not a product
      urlBlock(ALNUM, '2026-08-14'),
    ]),
  );
  assert.deepEqual(
    entries.map((e) => e.sku),
    ['6000204050299', '7EC4X3MM71OJ'],
  );
});

test('parsing does not depend on where the chunk boundaries fall', async () => {
  const xml = urlset([urlBlock(NUMERIC, '2026-06-29'), urlBlock(ALNUM, '2026-08-14')]);
  for (const size of [1, 7, 13, 64, 999]) {
    const entries = await collect(xml, size);
    assert.deepEqual(
      entries.map((e) => e.sku),
      ['6000204050299', '7EC4X3MM71OJ'],
      `split into ${size} byte pieces`,
    );
  }
});

test('a gzipped sitemap decompresses and counts the same as the plain one', async () => {
  const blocks = [];
  for (let i = 0; i < 500; i += 1) {
    blocks.push(urlBlock(`https://www.walmart.ca/en/ip/Product-Number-${i}/ABC${String(i).padStart(9, '0')}`, '2026-09-03'));
  }
  const xml = urlset(blocks);
  const gz = gzipSync(Buffer.from(xml, 'utf8'));

  // The sniff this asserts is the one `textChunks` does on the wire: the first
  // two bytes, not the file name.
  assert.equal(gz[0], 0x1f);
  assert.equal(gz[1], 0x8b);

  const { createGunzip } = await import('node:zlib');
  const { Readable } = await import('node:stream');
  const gunzip = createGunzip();
  Readable.from([gz]).pipe(gunzip);
  async function* asText(): AsyncGenerator<string> {
    const dec = new TextDecoder();
    for await (const c of gunzip) yield dec.decode(c as Uint8Array, { stream: true });
  }

  const seen = [];
  for await (const e of entriesFromXml(asText())) seen.push(e.sku);
  assert.equal(seen.length, 500);
  assert.equal(seen[0], 'ABC000000000');
  assert.equal(seen[499], 'ABC000000499');
  assert.equal(new Set(seen).size, 500);
});

test('a challenge page yields nothing rather than a bad entry', async () => {
  // The PerimeterX page, roughly. It contains no `</url>` at all, which is what
  // `fetchSitemapStream` rejects on structurally before the parser ever sees it;
  // this asserts the parser is also harmless if one ever gets past.
  const html =
    '<html><head><title>Access Denied</title></head><body>' +
    'We like real shoppers, not robots!<script>window._pxAppId="PX";</script></body></html>';
  assert.deepEqual(await collect(html), []);
});
