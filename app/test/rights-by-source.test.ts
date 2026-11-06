/**
 * Decision 2026-11-05: Pexi must hold the rights to everything it shows.
 *
 *  1. Return-It and Consignaction grant no reuse licence: a product whose only row is theirs is not
 *     named by a barcode scan or by typed words, however well the words match.
 *  2. Open Icecat's licence bars machine learning and generative AI (v1.4, clause 10): a product
 *     whose identity comes only from an Icecat row is never described to Claude. It is answered with
 *     the same broad guess a product with no price gets (D-241), and the model is not called.
 *
 * Read out of HTTP responses, with a Claude double that counts every ask it is sent. The control is
 * an Open Food Facts row in the very same world: it IS asked, so a count of 0 for Icecat means the
 * ask was withheld, not that the double could not be reached.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-rights-'));

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

const RETURNIT = '0628990010016';
const CONSIGN = '0628990010023';
const ICECAT = '0628990010030';
const OFF = '0628990010047';
const OFF_TYPED = '0628990010054';

const catDb = openCatalogue(':memory:');
{
  const insert = catDb.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,NULL,?,?,?,?,?,?,'[]',1,?)`);
  const cat = '["en:beverages","en:sodas","en:colas"]';
  insert.run(RETURNIT, 'Zorbix Returnable Cola', 'Zorbix Returnable Cola', 'Zorbix', '355 ml', 355, 'ml', cat, 'en:colas', 'returnit');
  insert.run(CONSIGN, 'Quenchly Consigned Soda', 'Quenchly Consigned Soda', 'Quenchly', '355 ml', 355, 'ml', cat, 'en:colas', 'consignaction');
  insert.run(ICECAT, 'Glimmer Ice Cola', 'Glimmer Ice Cola', 'Glimmer', '355 ml', 355, 'ml', cat, 'en:colas', 'icecat');
  insert.run(OFF, 'Brightly Open Cola', 'Brightly Open Cola', 'Brightly', '355 ml', 355, 'ml', cat, 'en:colas', 'openfoodfacts');
  // A second licensed product for the typed control: the ask is cached per identity, so reusing OFF would not ask again.
  insert.run(OFF_TYPED, 'Sunnyfield Open Cola', 'Sunnyfield Open Cola', 'Sunnyfield', '355 ml', 355, 'ml', cat, 'en:colas', 'openfoodfacts');
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

const { openPrices } = await import('../../price/src/store.ts');
openPrices(process.env.SHIN_PRICES!).close();

const asks: string[] = [];
const rangeAskProvider = {
  name: 'counting-claude',
  async send<T>(req: { user: string }) {
    asks.push(req.user);
    return {
      value: { known: true, low_cents: 199, high_cents: 349, currency: 'CAD', unit: 'one 355 ml can', confidence: 'medium' } as T,
      usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
      provider: 'anthropic',
      model: 'claude-sonnet-5',
    };
  },
};

const { server, setCatalogueForTests, setCatalogueFirstForTests } = await import('../server.ts');

let base = '';
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setCatalogueForTests(catalogue);
  setCatalogueFirstForTests({ searcher: catalogue, db: catDb, rangeAskProvider: rangeAskProvider as never });
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

let n = 0;
const market = () => `countryCode=CA&region=British%20Columbia&deviceId=rights-${(n += 1)}`;
const byName = (text: string) => get(`/api/identify?text=${encodeURIComponent(text)}&shelfPriceCents=299&${market()}`);
const byBarcode = (gtin: string) => get(`/api/identify?gtin=${gtin}&shelfPriceCents=299&${market()}`);

for (const [label, code, name] of [
  ['Return-It', RETURNIT, 'Zorbix'],
  ['Consignaction', CONSIGN, 'Quenchly'],
] as const) {
  test(`${label}: a barcode scan does not name the product, and the model is not asked about it`, async () => {
    const before = asks.length;
    const r = await byBarcode(code);
    assert.ok(!JSON.stringify(r).includes(name), `${name} was shown: ${JSON.stringify(r).slice(0, 300)}`);
    assert.equal(r.identity ?? null, null);
    assert.ok(!asks.slice(before).some((a) => a.includes(name)), 'the name reached the model');
  });

  test(`${label}: typed words that match the product exactly do not name it`, async () => {
    const r = await byName(`${name} ${label === 'Return-It' ? 'Returnable Cola' : 'Consigned Soda'}`);
    assert.ok(!JSON.stringify(r).includes(name), `${name} was shown: ${JSON.stringify(r).slice(0, 300)}`);
  });
}

test('control: an Open Food Facts product with no price IS asked of the model, so the double is reachable', async () => {
  const before = asks.length;
  const r = await byBarcode(OFF);
  assert.equal(r.identity?.name, 'Brightly Open Cola');
  assert.equal(asks.length - before, 1);
  assert.equal(r.rangeSource, 'claude_typical');
});

test('Icecat only: a barcode scan answers with the broad guess and the model is never called', async () => {
  const before = asks.length;
  const r = await byBarcode(ICECAT);
  assert.equal(asks.length - before, 0, 'an Icecat-only identity was sent to the model');
  assert.equal(r.identity?.name, 'Glimmer Ice Cola', 'the product is still named from Icecat');
  assert.equal(r.verdict, null);
  assert.equal(r.rangeSource, 'fixed_prior');
  assert.equal(r.range?.basis, 'fixed_prior');
  assert.equal(r.range?.confidence, 'low');
  assert.ok(r.range.lowCents > 0 && r.range.lowCents < r.range.highCents);
  assert.equal(r.noRangeReason, 'no_shin_prices');
});

test('Icecat only: the same product, typed by name, answers with the broad guess and the model is never called', async () => {
  const before = asks.length;
  const r = await byName('Glimmer Ice Cola');
  assert.equal(asks.length - before, 0, 'an Icecat-only identity was sent to the model');
  assert.equal(r.ownMatch?.code, ICECAT);
  assert.equal(r.rangeSource, 'fixed_prior');
  assert.equal(r.range?.basis, 'fixed_prior');
});

test('control: the same product typed by name from an Open Food Facts row is asked', async () => {
  const before = asks.length;
  const r = await byName('Sunnyfield Open Cola');
  assert.equal(r.ownMatch?.code, OFF_TYPED);
  assert.equal(asks.length - before, 1);
});
