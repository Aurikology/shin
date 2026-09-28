/**
 * Two things a barcode scan now carries through the route, read out of the
 * HTTP response and the scan row, never out of a helper alone.
 *
 * 1. THE SCAN CATEGORY IS RECORDED. The one Gemini call names a general
 *    category (commit 65c2082); "record everything the user does" wants it on
 *    the row. It goes into `scan_category` (migration 17), NOT `category`,
 *    which is the five-kind verdict the routing prior reads. Pinned on the
 *    live path, the cache-replay path, and a cached answer from before the
 *    category existed (no such property at all: null, never undefined).
 *
 * 2. ONE STORE FROM TWO SOURCES IS MARKED, NEVER DROPPED. Shin's own price for
 *    a store Gemini also quoted keeps its row and gains
 *    `sameStoreAsGemini: true`; an own price for a store Gemini did not quote
 *    gains nothing; Gemini's rows are untouched.
 *
 * No network: Gemini is the recorded double, and the key is a placeholder.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-scan-category-'));
const pricesPath = join(dir, 'prices.db');

process.env.SHIN_CATALOGUE_FIRST = '0'; // the Gemini path these tests pin; catalogue first is on by default since 2026-09-28
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_PRICES = pricesPath;
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_BARCODE_OWN_PRICES;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

/** Kraft Dinner's real code: a valid check digit, and the double's own barcode. */
const WITH_CATEGORY = '0068100084245';
/** A valid check digit and no real product; used for the pre-65c2082 cache row. */
const OLD_CACHE = '0000000000093';

const MATCHED_STORE = 'Beta Foods Canada'; // Gemini's double quotes "Beta Foods"
const UNMATCHED_STORE = 'ANBL Fredericton';

const { openPrices, recordObservation } = await import('../../price/src/store.ts');
const prices = openPrices(pricesPath);
for (const [i, store] of [MATCHED_STORE, UNMATCHED_STORE].entries()) {
  recordObservation(prices, {
    code: WITH_CATEGORY,
    seller: `seller-${i}`,
    sellerSku: `SKU-${i}`,
    sellerName: 'Test Macaroni 225 g',
    sellerBrand: null,
    priceCents: 300 + i,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: 'NB',
    joinMethod: 'gtin',
    seenOn: '2026-09-20',
    url: null,
    imageUrl: null,
    inStock: null,
    storeName: store,
    storeCity: null,
    basePriceCents: null,
  });
}

const { server, setGeminiTransportForTests } = await import('../server.ts');
const { fakeTransport, goodAnswer, httpBody } = await import('./gemini-double.ts');
const { getScan } = await import('../src/scans.ts');
const { activeRepeatCache, allCachedScans, recallCachedScan, rememberCachedScan } = await import('../src/repeat-cache.ts');

let port = 0;
const double = fakeTransport(() => {
  const answer = goodAnswer();
  (answer.product as Record<string, unknown>).category = 'grocery';
  return { text: httpBody(JSON.stringify(answer)) };
});

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  setGeminiTransportForTests(double.transport);
});

after(async () => {
  setGeminiTransportForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

async function identify(gtin: string, device: string): Promise<Record<string, unknown>> {
  const r = await fetch(`http://127.0.0.1:${port}/api/identify?gtin=${gtin}&deviceId=${device}`);
  assert.equal(r.status, 200);
  return (await r.json()) as Record<string, unknown>;
}

function blockOffers(body: Record<string, unknown>): Record<string, unknown>[] {
  const grounded = body.grounded as { block?: { offers?: unknown } } | null | undefined;
  return Array.isArray(grounded?.block?.offers) ? (grounded!.block!.offers as Record<string, unknown>[]) : [];
}

/* ------------------------------------------------------ 1. the category -- */

let liveBody: Record<string, unknown> = {};

test('a live scan whose answer carries a category stores it in scan_category, not in category', async () => {
  const callsBefore = double.calls.length;
  liveBody = await identify(WITH_CATEGORY, 'cat-live');
  assert.equal(double.calls.length, callsBefore + 1, 'one Gemini call per scan, never a second');
  const scanId = liveBody.scanId as number;
  assert.equal(typeof scanId, 'number', `no scan id on the answer: ${JSON.stringify(liveBody).slice(0, 400)}`);
  const row = getScan(scanId)!;
  assert.equal(row.source, 'gemini');
  assert.equal(row.scan_category, 'grocery');
  assert.equal(row.category, null, 'the five-kind routing column was overloaded with a Gemini category');
});

test('the category changes nothing about the response', () => {
  assert.equal(liveBody.category, null, 'the top-level five-kind category stays null on the Gemini path');
  const text = JSON.stringify(liveBody);
  assert.ok(!text.includes('scan_category'), 'the column name leaked into the response');
  assert.ok(!text.includes('scanCategory'), 'the record field leaked into the response');
});

test('a repeat scan answered from the cache stores the cached block category', async () => {
  const callsBefore = double.calls.length;
  const body = await identify(WITH_CATEGORY, 'cat-cache');
  assert.equal(double.calls.length, callsBefore, 'a cached barcode made a Gemini call');
  const row = getScan(body.scanId as number)!;
  assert.equal(row.source, 'gemini_cache');
  assert.equal(row.scan_category, 'grocery');
  assert.equal(row.category, null);
});

test('an answer cached before categories existed stores null, not undefined and not a guess', async () => {
  // A real scan first, so the cache row has the exact key the route uses.
  await identify(OLD_CACHE, 'cat-old-seed');
  const store = activeRepeatCache();
  assert.ok(store, 'the repeat cache never opened');
  const entry = allCachedScans(store!).find((e) => e.cache_key.startsWith(`${OLD_CACHE}|`));
  assert.ok(entry, 'the seed scan was not cached');
  const [gtin, market, currency] = entry!.cache_key.split('|');
  const hit = recallCachedScan<Record<string, unknown>, Record<string, unknown>>(gtin!, market || null, currency || null)!;
  // Rewrite it as a pre-65c2082 entry: the property does not exist at all.
  const oldBlock = { ...hit.block };
  delete oldBlock.category;
  const oldRun = JSON.parse(JSON.stringify(hit.run)) as { answer?: { product?: Record<string, unknown> } };
  if (oldRun.answer?.product) delete oldRun.answer.product.category;
  rememberCachedScan(gtin!, market || null, currency || null, oldRun, oldBlock, entry!.scan_id);
  const again = recallCachedScan<Record<string, unknown>, Record<string, unknown>>(gtin!, market || null, currency || null)!;
  assert.equal('category' in again.block, false, 'the fixture still carries a category, so this proves nothing');

  const body = await identify(OLD_CACHE, 'cat-old');
  const row = getScan(body.scanId as number)!;
  assert.equal(row.source, 'gemini_cache');
  assert.equal(row.scan_category, null);
});

/* -------------------------------------------------- 2. the same store -- */

test('an own price for a store Gemini also quoted is marked, and no offer is removed', () => {
  const offers = blockOffers(liveBody);
  const gemini = offers.filter((o) => o.source !== 'shin_own_data');
  const own = offers.filter((o) => o.source === 'shin_own_data');
  assert.deepEqual(gemini.map((o) => o.retailer), ['Alpha Market', 'Beta Foods', 'Gamma Grocer'], 'a Gemini offer went missing');
  assert.deepEqual(own.map((o) => o.retailer).sort(), [UNMATCHED_STORE, MATCHED_STORE].sort(), 'an own offer went missing');

  const matched = own.find((o) => o.retailer === MATCHED_STORE)!;
  assert.equal(matched.sameStoreAsGemini, true);
  assert.equal(matched.seenOn, '2026-09-20', 'the matched row lost its date');
  assert.equal(matched.trusted, false, 'the matched row stopped saying it is unchecked');

  const unmatched = own.find((o) => o.retailer === UNMATCHED_STORE)!;
  assert.equal('sameStoreAsGemini' in unmatched, false, 'a store Gemini never quoted was marked');
  for (const g of gemini) assert.equal('sameStoreAsGemini' in g, false, 'a Gemini row was marked');

  const topLevel = liveBody.ownOffers as Record<string, unknown>[];
  assert.equal(topLevel.length, 2);
  assert.equal(topLevel.find((o) => o.retailer === MATCHED_STORE)!.sameStoreAsGemini, true);
});
