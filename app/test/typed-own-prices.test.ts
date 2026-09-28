/**
 * A typed product name searches Shin's own data and nothing else.
 *
 * Jamin, 2026-09-23: "typing a product should only search our catalogue and
 * only return when we have both the item and price."
 *
 * Over a real socket, the way `server-quota.test.ts` does it. Gemini is the
 * recorded double, and every test asserts it was never called: a typed search
 * that reaches it is the defect (D-142, typed names were unlimited paid calls).
 * The two stores that hold products WITH prices are fixtures in a temp
 * directory: the crowd and crawl prices file and the user catalogue.
 *
 * Run once against the code before the change and seen to fail (typed text
 * went to Gemini, so no `ownData`, no dated prices, and one Gemini call each).
 */
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-typed-own-'));
process.env.SHIN_CATALOGUE_FIRST = '0'; // the Gemini path these tests pin; catalogue first is on by default since 2026-09-28
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_USER_CATALOGUE = join(dir, 'user-catalogue.db');
process.env.SHIN_PRICES = join(dir, 'prices.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_FREE_SCANS_PER_WEEK;
delete process.env.REVENUECAT_SECRET_KEY;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

// The fixtures, written before the server is imported so nothing is cached ahead of them.
const { openPrices, recordObservation } = await import('../../price/src/store.ts');
const { createUserCatalogue, recordUserScan } = await import('../../catalogue/src/user-catalogue.ts');

const prices = openPrices(process.env.SHIN_PRICES);
const row = (o: { code: string | null; seller: string; sku: string; name: string; brand: string | null; cents: number; seen: string; store?: string | null; city?: string | null; kind?: 'regular' | 'promotional'; url?: string | null }) =>
  recordObservation(prices, {
    code: o.code,
    seller: o.seller,
    sellerSku: o.sku,
    sellerName: o.name,
    sellerBrand: o.brand,
    priceCents: o.cents,
    kind: o.kind ?? 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: null,
    joinMethod: o.code ? 'gtin' : 'none',
    seenOn: o.seen,
    url: o.url ?? null,
    imageUrl: null,
    inStock: null,
    storeName: o.store ?? null,
    storeCity: o.city ?? null,
  });
// Two prices at one store on two days: only the later one is that store's price.
row({ code: '0062600000017', seller: 'openprices', sku: 'np-1', name: 'Peaches & Cream Corn', brand: 'Farmstand', cents: 399, seen: '2026-09-01', store: 'No Frills', city: 'Hamilton' });
row({ code: '0062600000017', seller: 'openprices', sku: 'np-2', name: 'Peaches & Cream Corn', brand: 'Farmstand', cents: 349, seen: '2026-09-10', store: 'No Frills', city: 'Hamilton' });
row({ code: '0062600000017', seller: 'walmart.ca', sku: 'wm-1', name: 'Farmstand Peaches & Cream Corn', brand: 'Farmstand', cents: 429, seen: '2026-09-05', url: 'https://www.walmart.ca/en/ip/x/wm-1' });
prices.close();

const uc = createUserCatalogue(process.env.SHIN_USER_CATALOGUE);
const offer = (retailer: string, price: number, url: string) => ({ retailer, price, raw: { retailer, price, currency: 'CAD', url } });
recordUserScan(
  { name: 'Maple Oat Crunch Cereal', brand: 'Shinfield', quantity: '400 g', observedAt: '2026-09-12T10:00:00.000Z', offers: [offer('Food Basics', 5.29, 'https://www.foodbasics.ca/a')] },
  { log: uc },
);
recordUserScan(
  {
    name: 'Maple Oat Crunch Cereal',
    brand: 'Shinfield',
    quantity: '400 g',
    observedAt: '2026-09-15T10:00:00.000Z',
    // A test double's row (RFC 2606 reserved domain) is never a real shop's price.
    offers: [offer('Food Basics', 4.99, 'https://www.foodbasics.ca/a'), offer('Alpha Market', 2, 'https://example.com/alpha')],
  },
  { log: uc },
);
// A product Shin holds with no price at all.
recordUserScan({ name: 'Lonely Lentil Soup', brand: 'Nobody', quantity: '540 ml', observedAt: '2026-09-14T10:00:00.000Z' }, { log: uc });
uc.db?.close();

const { server, setCatalogueForTests, setGeminiTransportForTests } = await import('../server.ts');
const { fakeTransport } = await import('./gemini-double.ts');
const { clearRepeatCacheForTests } = await import('../src/repeat-cache.ts');
const { getScan, recordScan } = await import('../src/scans.ts');

let port = 0;
let gemini = fakeTransport();

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  setCatalogueForTests({ byGtin: () => null });
});

beforeEach(() => {
  clearRepeatCacheForTests();
  gemini = fakeTransport();
  setGeminiTransportForTests(gemini.transport);
  delete process.env.SHIN_FREE_SCANS_PER_WEEK;
});

after(async () => {
  setCatalogueForTests(null);
  setGeminiTransportForTests(null);
  delete process.env.SHIN_FREE_SCANS_PER_WEEK;
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked. */
  }
});

async function typed(text: string, device = 'typed-dev') {
  const res = await fetch(`http://127.0.0.1:${port}/api/identify?text=${encodeURIComponent(text)}&deviceId=${device}`);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

test('a typed name Shin holds with prices returns those prices, each with its store, currency and date', async () => {
  const { status, body } = await typed('peaches and cream corn');
  assert.equal(status, 200);
  assert.equal(body.ownData, true);
  assert.equal(body.source, 'shin_own_data');
  assert.equal(body.found, true);
  const block = body.grounded?.block;
  assert.equal(block?.source, 'shin_own_data');
  const got = (block.offers as any[]).map((o) => [o.retailer, o.price, o.currency, o.observedAt]).sort();
  assert.deepEqual(got, [
    ['No Frills (Hamilton)', 3.49, 'CAD', '2026-09-10'],
    ['walmart.ca', 4.29, 'CAD', '2026-09-05'],
  ]);
  // The answer sheet's own reader must see content, or the phone shows "no answer".
  assert.ok(block.offers.length > 0 && body.grounded.kind === 'grounded');
  assert.equal(gemini.calls.length, 0, 'a typed search called Gemini');
});

test('prices from the user catalogue: latest per store, dated, and a test double row is never one of them', async () => {
  const { status, body } = await typed('maple oat crunch');
  assert.equal(status, 200);
  assert.equal(body.found, true);
  const offers = body.grounded.block.offers as any[];
  assert.deepEqual(offers.map((o) => [o.retailer, o.price, o.currency, o.observedAt]), [
    ['Food Basics', 4.99, 'CAD', '2026-09-15T10:00:00.000Z'],
  ]);
  assert.equal(gemini.calls.length, 0);
});

test('a product Shin holds with no price is the no-price answer, not a product', async () => {
  const { status, body } = await typed('lonely lentil soup');
  assert.equal(status, 200);
  assert.equal(body.ownData, true);
  assert.equal(body.found, false);
  assert.equal(body.grounded, undefined);
  assert.equal(body.product, null);
  assert.match(String(body.message), /does not have a price/i);
  assert.equal(gemini.calls.length, 0, 'a typed search called Gemini');
});

test('an unknown name is the no-price answer', async () => {
  const { status, body } = await typed('unicorn steak');
  assert.equal(status, 200);
  assert.equal(body.ownData, true);
  assert.equal(body.found, false);
  assert.match(String(body.message), /scan the barcode/i);
  assert.equal(gemini.calls.length, 0, 'a typed search called Gemini');
});

test('a typed search is never refused by the weekly free-scan limit and is still logged', async () => {
  process.env.SHIN_FREE_SCANS_PER_WEEK = '1';
  // The device's one free barcode scan this week, already used.
  recordScan({ deviceId: 'typed-limit', kind: 'barcode', query: '0062600000017', resolvedLabel: 'Peaches & Cream Corn', outcome: 'answered' });
  const barcode = await fetch(`http://127.0.0.1:${port}/api/identify?gtin=0068100084245&deviceId=typed-limit`);
  assert.equal(barcode.status, 402, 'the limit is not on, so this test proves nothing');
  for (let i = 0; i < 3; i++) {
    const { status, body } = await typed(i === 0 ? 'unicorn steak' : 'peaches cream corn', 'typed-limit');
    assert.equal(status, 200, `typed search ${i + 1} was refused`);
    const scan = getScan(body.scanId);
    assert.ok(scan, 'the typed search wrote no scan row');
    assert.equal(scan.kind, 'text');
    assert.equal(scan.outcome, i === 0 ? 'refused' : 'answered');
  }
  assert.equal(gemini.calls.length, 0, 'a typed search called Gemini');
});

async function price(body: Record<string, unknown>) {
  const res = await fetch(`http://127.0.0.1:${port}/api/price`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

test('/api/price with free text and no scan answers from Shin data and never calls Gemini', async () => {
  const { status, body } = await price({ text: 'peaches cream corn', deviceId: 'price-free-text', askingCents: 399 });
  assert.equal(status, 200);
  assert.equal(body.kind, 'gemini');
  assert.equal(body.ownData, true);
  assert.equal(body.found, true);
  assert.equal(body.grounded.block.source, 'shin_own_data');
  assert.equal(gemini.calls.length, 0, 'free text on /api/price called Gemini');
});

test('/api/price naming a typed scan answers from Shin data on that same row, never a paid call', async () => {
  const scan = await typed('unicorn steak', 'price-typed-scan');
  const { status, body } = await price({ scanId: scan.body.scanId, text: 'unicorn steak', deviceId: 'price-typed-scan' });
  assert.equal(status, 200);
  assert.equal(body.ownData, true);
  assert.equal(body.found, false);
  assert.equal(body.scanId, scan.body.scanId, 'a second scan row was written for the same typed search');
  assert.equal(gemini.calls.length, 0, 'a typed scan priced on /api/price called Gemini');
});

test('/api/price for a barcode is unchanged: one Gemini call', async () => {
  const { status, body } = await price({ gtin: '0068100084245', text: 'Kraft Dinner Original', deviceId: 'price-barcode' });
  assert.equal(status, 200);
  assert.equal(body.kind, 'gemini');
  assert.equal(body.ownData, undefined);
  assert.equal(gemini.calls.length, 1, 'a barcode price no longer makes its one call');
});

test('a missing prices file and user catalogue fail soft into the no-price answer', async () => {
  const { lookupOwnPrices } = await import('../src/own-prices.ts');
  const out = lookupOwnPrices('peaches cream corn', {
    pricesDbPath: join(dir, 'absent', 'prices.db'),
    userCataloguePath: join(dir, 'absent', 'user-catalogue.db'),
  });
  assert.equal(out.match, null);
  assert.deepEqual([...out.unavailable].sort(), ['prices', 'user_catalogue']);
});

test('a catalogue product found by name is priced by its code', async () => {
  const { lookupOwnPrices } = await import('../src/own-prices.ts');
  const out = lookupOwnPrices('golden corn niblets', {
    pricesDbPath: process.env.SHIN_PRICES,
    userCataloguePath: join(dir, 'absent', 'user-catalogue.db'),
    // The big catalogue names the product; the prices file only knows it by code.
    catalogueProbe: () => [{ code: '0062600000017', name: 'Golden Corn Niblets', brands: 'Farmstand', sizeValue: null, sizeUnit: null, source: 'off' }],
  });
  assert.equal(out.match?.name, 'Golden Corn Niblets');
  assert.equal(out.match?.prices.length, 2);
});
