/**
 * THE WRONG-PRODUCT REGRESSION SET (bug sweep 2026-11-11, D-270; Jamin: one fix for the whole class,
 * not one per route). A typed name Pexi only GUESSED a product for must never be judged with that
 * product's own prices, and never answer above "Not fully confident"; it still answers (RULINGS
 * "Always answer"). Each case is a shape found live on 2026-11-11:
 *   - "milk" at $15: the loose own-price text match picked Coconut Milk 400 ml and answered
 *     "Bad, +410%", "Certain".
 *   - "kraft dinner" at $9: the 225 g box and the 12-pack both match; the 12-pack's prices answered
 *     "Great price".
 * Controls: a scanned barcode, and a typed name that names the size, still answer from the
 * product's own prices exactly as before (D04 parity). Everything is read from HTTP responses;
 * no model is called. Add a case here whenever a new wrong-product shape is found.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-wrong-product-'));

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
process.env.GEMINI_API_KEY = 'test-key-never-sent';

function withCheck(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return body + String((10 - (sum % 10)) % 10);
}

const MILK = withCheck('062699002001');
const MILK_2PCT = withCheck('062699002002');
const COCONUT = withCheck('062699002003');
const KD_BOX = withCheck('062699002010');
const KD_12 = withCheck('062699002011');
const MILK_PATH = '["en:dairies","en:milks"]';
const PLANT_PATH = '["en:beverages","en:plant-milks"]';
const PASTA_PATH = '["en:meals","en:macaroni-and-cheese"]';

const { openCatalogue, rebuildFts } = await import('../../catalogue/src/schema.ts');
const { rebuildCategoriesFromPaths: rebuildCategories } = await import('../../catalogue/test/helpers/path-taxonomy.ts');
const { Catalogue } = await import('../../catalogue/src/search.ts');

const catDb = openCatalogue(':memory:');
{
  const insert = catDb.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,NULL,?,?,?,?,?,?,'[]',1,'test')`);
  insert.run(MILK, 'Milk', 'Milk', 'Dairyco', '2 L', 2000, 'ml', MILK_PATH, 'en:milks');
  insert.run(MILK_2PCT, '2% Milk', '2% Milk', 'Farmco', '4 L', 4000, 'ml', MILK_PATH, 'en:milks');
  insert.run(COCONUT, 'Coconut Milk', 'Coconut Milk', 'Palmco', '400 ml', 400, 'ml', PLANT_PATH, 'en:plant-milks');
  // The live names (2026-11-11 search for "kraft dinner"): the box and the 12-pack are different rows.
  insert.run(KD_BOX, 'Kraft Dinner Original', 'Kraft Dinner Original', 'Kraft', '225 g', 225, 'g', PASTA_PATH, 'en:macaroni-and-cheese');
  insert.run(KD_12, 'Kraft Dinner 12 Pack', 'Kraft Dinner 12 Pack', 'Kraft', '12 x 225 g', 2700, 'g', PASTA_PATH, 'en:macaroni-and-cheese');
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

const today = new Date().toISOString().slice(0, 10);
const { openPrices, recordObservation } = await import('../../price/src/store.ts');
{
  const prices = openPrices(process.env.SHIN_PRICES!);
  let sku = 0;
  const price = (code: string, seller: string, cents: number, name: string) =>
    recordObservation(prices, {
      code,
      seller,
      sellerSku: `SKU-${(sku += 1)}`,
      sellerName: name,
      sellerBrand: null,
      priceCents: cents,
      kind: 'regular',
      unitPriceCents: null,
      unitLabel: null,
      currency: 'CAD',
      country: 'CA',
      region: 'British Columbia',
      joinMethod: 'gtin',
      seenOn: today,
      url: null,
      imageUrl: null,
      inStock: null,
      storeName: `${seller} store`,
      storeCity: 'Victoria',
      basePriceCents: null,
    });
  // Only the wrong products are priced, so any answer built from them is the bug, not a coincidence.
  ['a', 'b', 'c'].forEach((s) => price(COCONUT, `shop${s}`, 299, 'Coconut Milk 400 ml'));
  ['a', 'b', 'c'].forEach((s) => price(KD_12, `shop${s}`, 1399, 'Kraft Dinner 12 x 225 g'));
  prices.close();
}

const fakeClaude = {
  name: 'fake-claude-range',
  async send<T>() {
    return {
      value: { known: true, low_cents: 299, high_cents: 599, currency: 'CAD', unit: 'one pack', confidence: 'medium' } as T,
      usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
    };
  },
};

const { server, setCatalogueForTests, setCatalogueFirstForTests } = await import('../server.ts');

let base = '';
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setCatalogueForTests(catalogue);
  setCatalogueFirstForTests({ searcher: catalogue, db: catDb, rangeAskProvider: fakeClaude as never });
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

const market = 'countryCode=CA&region=British%20Columbia&deviceId=wrong-product';
const byBarcode = (gtin: string, cents: number) => get(`/api/identify?gtin=${gtin}&shelfPriceCents=${cents}&${market}`);
const byName = (text: string, cents: number) => get(`/api/identify?text=${encodeURIComponent(text)}&shelfPriceCents=${cents}&${market}`);

/** A guessed product: still an answer, never that product's own prices, never above "Not fully confident". */
function assertGuessed(answer: Record<string, any>, what: string, wrongCents: number): void {
  const v = answer.verdict;
  if (v === null || v === undefined) return; // no verdict is allowed; the range still answers (D-241)
  assert.notEqual(v.basis, 'own_prices', `${what}: judged on a guessed product's own prices`);
  assert.equal(v.confidence, 'low', `${what}: a guess answered "${v.confidence}"`);
  assert.ok(!(v.dots ?? []).some((d: { cents: number }) => d.cents === wrongCents), `${what}: the guessed product's prices are drawn as dots`);
}

/** The range card is the second price path: it must not be the guessed product's own range either. */
function assertRangeNotGuessed(answer: Record<string, any>, what: string, wrongCents: number): void {
  const r = answer.range;
  if (!r) return;
  assert.ok(!(r.basis === 'this_product' && r.medianCents === wrongCents), `${what}: the range card is the guessed product's own range`);
}

test('wrong product: typed "milk" is not judged as the coconut milk a loose text match found', async () => {
  const answer = await byName('milk', 1500);
  assertGuessed(answer, '"milk" at $15', 299);
  assertRangeNotGuessed(answer, '"milk" at $15', 299);
});

test('wrong product: typed "kraft dinner" is not judged as the 12-pack when the size is unknown', async () => {
  const answer = await byName('kraft dinner', 900);
  assertGuessed(answer, '"kraft dinner" at $9', 1399);
  assertRangeNotGuessed(answer, '"kraft dinner" at $9', 1399);
});

test('control: the scanned coconut milk barcode still answers from its own prices', async () => {
  const v = (await byBarcode(COCONUT, 1500)).verdict;
  assert.equal(v?.basis, 'own_prices');
  assert.notEqual(v?.confidence, 'low');
});

test('control: a typed name that names the size is still that product (D04 parity)', async () => {
  const typed = (await byName('kraft dinner 12 x 225 g', 900)).verdict;
  const scanned = (await byBarcode(KD_12, 900)).verdict;
  assert.equal(typed?.basis, 'own_prices');
  assert.equal(typed?.confidence, scanned?.confidence);
  assert.equal(typed?.centreCents, scanned?.centreCents);
});
