/**
 * LOOSE PRODUCE, AT THE SOCKET. A shopper who scans or types a PLU (3110 = Cara Cara oranges, 94011 =
 * organic bananas) gets the product named and a per-lb price answer, never "unknown".
 *
 * The answer carries these fields for the phone (see app/src/catalogue-first.ts):
 *   unit: 'lb'                       the answer is a price per pound
 *   identity.unit: 'lb'
 *   identity.plu: '3110'             the code as printed on the sticker
 *   identity.organic: boolean
 *   verdict.perUnit: { label: 'per lb', centreCents }
 * Prices are read out of a real temp price store; the catalogue is empty (a PLU is in no catalogue).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-plu-route-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_PRICES = join(dir, 'prices.db');
process.env.SHIN_RANGE_ASK_STORE_PATH = join(dir, 'range-ask.json');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_CATALOGUE_FIRST;
delete process.env.SHIN_RANGE_ASK_MONTHLY_CAP;
delete process.env.SHIN_RANGE_ASK_CEILING_CENTS;
delete process.env.SHIN_FREE_SCANS_PER_WEEK;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

const { openCatalogue, rebuildFts } = await import('../../catalogue/src/schema.ts');
const { Catalogue } = await import('../../catalogue/src/search.ts');
const { pluKey } = await import('../../price/src/plu.ts');
const { openPrices, recordObservation } = await import('../../price/src/store.ts');

const catDb = openCatalogue(':memory:');
rebuildFts(catDb);
const NO_EMBEDDER = {
  id: 'test:none',
  dim: 384,
  async embedPassages() {
    throw new Error('vector arm should be off');
  },
  async embedQuery() {
    throw new Error('vector arm should be off');
  },
};
const catalogue = new Catalogue(catDb, NO_EMBEDDER as unknown as ConstructorParameters<typeof Catalogue>[1]);

const today = new Date().toISOString().slice(0, 10);
{
  const prices = openPrices(process.env.SHIN_PRICES!);
  let sku = 0;
  for (const [store, cents] of [['Alpha', 189], ['Beta', 199], ['Gamma', 219]] as const) {
    recordObservation(prices, {
      code: pluKey('3110'),
      seller: store.toLowerCase(),
      sellerSku: `PLU-${(sku += 1)}`,
      sellerName: 'Cara Cara Oranges 1 lb',
      sellerBrand: null,
      priceCents: cents,
      kind: 'regular',
      unitPriceCents: null,
      unitLabel: '$/lb',
      currency: 'CAD',
      country: 'CA',
      region: 'ON',
      joinMethod: 'name',
      seenOn: today,
      url: null,
      imageUrl: null,
      inStock: null,
      storeName: store,
      storeCity: null,
      basePriceCents: null,
    });
  }
  prices.close();
}

const { server, setCatalogueForTests, setCatalogueFirstForTests } = await import('../server.ts');
let base = '';
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setCatalogueForTests(catalogue);
  setCatalogueFirstForTests({ searcher: catalogue, db: catDb });
});
after(async () => {
  setCatalogueForTests(null);
  setCatalogueFirstForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    catDb.close();
  } catch {
    /* already closed */
  }
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

async function identify(gtin: string, extra = ''): Promise<Record<string, unknown>> {
  const r = await fetch(`${base}/api/identify?gtin=${gtin}&deviceId=plu-test&countryCode=CA${extra}`);
  assert.equal(r.status, 200);
  return (await r.json()) as Record<string, unknown>;
}

test('scanning 3110 names Cara Cara oranges and prices them per lb from the shops that carry them', async () => {
  const body = await identify('3110');
  assert.equal(body.kind, 'catalogue');
  assert.equal(body.outcome, 'catalogue_hit');
  assert.equal(body.unit, 'lb');
  const id = body.identity as Record<string, unknown>;
  assert.match(String(id.name), /Cara Cara/);
  assert.equal(id.unit, 'lb');
  assert.equal(id.plu, '3110');
  assert.equal(id.organic, false);
  assert.equal(body.barcode, pluKey('3110'));
  const v = body.verdict as { perUnit: { label: string; centreCents: number }; basis: string; centreCents: number; n: number };
  assert.equal(v.perUnit.label, 'per lb');
  assert.equal(v.basis, 'own_prices');
  assert.equal(v.n, 3);
  assert.equal(v.perUnit.centreCents, 199);
});

test('a zero-padded GTIN of the same PLU gets the same answer', async () => {
  const body = await identify('0000000003110' + '3');
  assert.equal(body.outcome, 'catalogue_hit');
  assert.equal((body.identity as Record<string, unknown>).plu, '3110');
});

test('a typed price per lb is placed on the per-lb bell', async () => {
  const body = await identify('3110', '&shelfPriceCents=349');
  const v = body.verdict as { shopper: { cents: number; zone: string } | null };
  assert.equal(v.shopper?.cents, 349);
  assert.ok(v.shopper?.zone);
});

test('organic bananas (94011) are named, with no price of their own the answer still names the item and says per lb', async () => {
  const body = await identify('94011');
  assert.equal(body.outcome, 'catalogue_hit');
  assert.equal(body.unit, 'lb');
  const id = body.identity as Record<string, unknown>;
  assert.equal(id.name, 'Organic Bananas');
  assert.equal(id.organic, true);
  assert.equal(id.plu, '94011');
  const v = body.verdict as { perUnit: { label: string } } | null;
  if (v) assert.equal(v.perUnit.label, 'per lb');
});

test('preview=1 of a PLU names it from the PLU list alone', async () => {
  const body = await identify('3110', '&preview=1');
  assert.equal(body.preview, true);
  assert.equal(body.outcome, 'catalogue_hit');
  const id = body.identity as Record<string, unknown>;
  assert.match(String(id.name), /Cara Cara/);
  assert.equal(id.unit, 'lb');
  assert.equal(id.plu, '3110');
  const organic = await identify('94011', '&preview=1');
  assert.equal((organic.identity as Record<string, unknown>).name, 'Organic Bananas');
});

test('a 4-digit number that is not a listed PLU is still not a barcode', async () => {
  const body = await identify('1234', '&preview=1');
  assert.equal(body.outcome, 'preview_unavailable');
});
