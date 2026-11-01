/**
 * D-241 (server half) and requirement 3.1: A TYPED NAME THAT MATCHES NOTHING STILL ENDS IN A RANGE.
 *
 * Found on 2026-10-28 in a browser walk: "kraft dinner original 225g", then "None of these, search
 * with the words as typed", came back with no range at all, because the typed route handed a
 * too-thin estimate back as a null verdict and stopped there. Aurik's call, 2026-11-01: it answers
 * with the same broad guess a barcode with no price gets (the fixed wide bell, $2.78 to $36.02),
 * marked as that broad guess (`rangeSource` and `range.basis` both `fixed_prior`) and carrying no
 * verdict, so no client can read a verdict word or "Great price" off it (D-239).
 *
 * The world here is the one that dead-ended: the catalogue attached and holding other products, and
 * a price file with no prices at all. Everything is read out of HTTP responses; no model is called.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-typed-miss-'));

process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_PRICES = join(dir, 'prices.db');
process.env.SHIN_RANGE_ASK_STORE_PATH = join(dir, 'range-ask.json');
process.env.PORT = '0';
process.env.SHIN_CATALOGUE_FIRST = '1';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_RANGE_ASK_MONTHLY_CAP;
delete process.env.SHIN_RANGE_ASK_CEILING_CENTS;
delete process.env.SHIN_FREE_SCANS_PER_WEEK;
delete process.env.ANTHROPIC_API_KEY;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

const { openCatalogue, rebuildFts } = await import('../../catalogue/src/schema.ts');
const { rebuildCategoriesFromPaths: rebuildCategories } = await import('../../catalogue/test/helpers/path-taxonomy.ts');
const { Catalogue } = await import('../../catalogue/src/search.ts');

const catDb = openCatalogue(':memory:');
{
  const insert = catDb.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,NULL,?,?,?,?,?,?,'[]',1,'test')`);
  insert.run('0627990010019', 'Cola Classic', 'Cola Classic', 'Fizzco', '2 L', 2000, 'ml', '["en:beverages","en:sodas","en:colas"]', 'en:colas');
  insert.run('0627990010026', 'Crinkle Fries', 'Crinkle Fries', 'Frostco', '750 g', 750, 'g', '["en:frozen-foods","en:frozen-fried-potatoes"]', 'en:frozen-fried-potatoes');
  rebuildFts(catDb);
  rebuildCategories(catDb);
}
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

// A price file that exists and holds nothing: the PC's state when the walk was made, near enough.
const { openPrices } = await import('../../price/src/store.ts');
openPrices(process.env.SHIN_PRICES!).close();

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
  delete process.env.SHIN_CATALOGUE_FIRST;
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

async function get(path: string): Promise<Record<string, any>> {
  const r = await fetch(`${base}${path}`);
  assert.equal(r.status, 200, path);
  return (await r.json()) as Record<string, any>;
}

const market = 'countryCode=CA&region=British%20Columbia&deviceId=typed-miss';
const byName = (text: string, cents: number) => get(`/api/identify?text=${encodeURIComponent(text)}&shelfPriceCents=${cents}&${market}`);
const byBarcode = (gtin: string, cents: number) => get(`/api/identify?gtin=${gtin}&shelfPriceCents=${cents}&${market}`);

test('D-241 / 3.1: a typed name that matches nothing answers with the broad guess, marked as one, and no verdict word', async () => {
  const typed = await byName('kraft dinner original 225g', 499);
  assert.equal(typed.ownData, true);
  assert.equal(typed.ownMatch, undefined, 'it named no product');
  // No verdict: the client has nothing to read a zone ("Great price") off (D-239).
  assert.equal(typed.verdict, null);
  // The range: the fixed wide bell, whole cents, low below high, marked as the broad guess.
  assert.ok(typed.range, 'a typed miss ended with no range (requirement 3.1)');
  assert.equal(typed.rangeSource, 'fixed_prior');
  assert.equal(typed.range.basis, 'fixed_prior');
  assert.equal(typed.range.confidence, 'low');
  assert.equal(typed.range.currency, 'CAD');
  assert.ok(Number.isInteger(typed.range.lowCents) && Number.isInteger(typed.range.highCents));
  assert.ok(typed.range.lowCents > 0 && typed.range.lowCents < typed.range.highCents);
  assert.equal(typed.noRangeReason, 'no_shin_prices');
  assert.equal(typed.lowConfidence, true);
});

test('D-241: the typed broad guess is the very range a no-price barcode gets', async () => {
  const typed = await byName('kraft dinner original 225g', 499);
  const barcode = await byBarcode('0627990010019', 499);
  assert.equal(barcode.kind, 'catalogue');
  assert.equal(barcode.rangeSource, 'fixed_prior', 'the control: the barcode got the broad guess in this world');
  assert.equal(barcode.verdict, null);
  assert.deepEqual(typed.range, barcode.range);
});

test('D-241: the typed route says the catalogue is up when it is attached', async () => {
  const typed = await byName('kraft dinner original 225g', 499);
  assert.equal(typed.catalogueUp, true);
});

test('D-241: a typed name that resolves to a product with no price carries that product\'s broad guess too', async () => {
  const typed = await byName('Fizzco Cola Classic', 299);
  assert.equal(typed.ownMatch?.code, '0627990010019');
  assert.equal(typed.verdict, null);
  assert.equal(typed.rangeSource, 'fixed_prior');
  assert.equal(typed.range?.basis, 'fixed_prior');
});
