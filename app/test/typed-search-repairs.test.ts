/**
 * Typed search repairs (live scan log, 2026-11-15: 42 of 176 shopper scans were typed searches that found nothing).
 *
 *  1. Digits typed into the name box are a barcode when they check out as one (8, 12, 13 or 14 digits, or a 4 or 5 digit
 *     produce code), looked up through the scan path's own canonicalisation before any name search.
 *  2. A misspelling is retried tolerantly, and a tolerant answer is a guess, never sure.
 *  3. A product name that reads like an advert is shortened for display only.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-typed-repairs-'));

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

const SPREAD = withCheck('062699002001'); // 13 digits, a spread
const SPREAD_UPCA = SPREAD.slice(1); // the same product as a 12-digit UPC-A
const NUTELLA = withCheck('006202018220'); // the ad-style name
const DEO_A = withCheck('062699002010');
const DEO_B = withCheck('062699002011');
const DEO_C = withCheck('062699002012');
const FRIES_PATH = '["en:spreads","en:sweet-spreads"]';

const { openCatalogue, rebuildFts } = await import('../../catalogue/src/schema.ts');
const { rebuildCategoriesFromPaths: rebuildCategories } = await import('../../catalogue/test/helpers/path-taxonomy.ts');
const { Catalogue } = await import('../../catalogue/src/search.ts');

const catDb = openCatalogue(':memory:');
{
  const insert = catDb.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,NULL,?,?,?,?,?,?,'[]',1,'test')`);
  insert.run(SPREAD, 'Hazelnut Spread', 'Hazelnut Spread', 'Spreadco', '350 g', 350, 'g', FRIES_PATH, 'en:sweet-spreads');
  insert.run(
    NUTELLA,
    'Nutella BISCUITS, Golden Cookies Filled with Rich Hazelnut Spread, Pack of 20 Cookies 276g',
    'Nutella BISCUITS, Golden Cookies Filled with Rich Hazelnut Spread, Pack of 20 Cookies 276g',
    'Nutella',
    '276 g',
    276,
    'g',
    FRIES_PATH,
    'en:sweet-spreads',
  );
  insert.run(DEO_A, 'Antiperspirant Deodorant Fresh', 'Antiperspirant Deodorant Fresh', 'Lynx', '150 ml', 150, 'ml', '["en:deodorants"]', 'en:deodorants');
  insert.run(DEO_B, 'Deodorant Sport', 'Deodorant Sport', 'Dove', '150 ml', 150, 'ml', '["en:deodorants"]', 'en:deodorants');
  insert.run(DEO_C, 'Deodorant Stick Original', 'Deodorant Stick Original', 'Old Spice', '85 g', 85, 'g', '["en:deodorants"]', 'en:deodorants');
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
  await catalogue.startSpelling();
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

const market = 'countryCode=CA&region=British%20Columbia&deviceId=probe-typed-repairs';
const byName = (text: string, cents = 499) => get(`/api/identify?text=${encodeURIComponent(text)}&shelfPriceCents=${cents}&${market}`);

// 1. Digits are a barcode.

test('a barcode typed as digits resolves to the product, as its scan would', async () => {
  for (const typed of [SPREAD, SPREAD_UPCA, `${SPREAD.slice(0, 1)} ${SPREAD.slice(1, 6)}-${SPREAD.slice(6)}`]) {
    const a = await byName(typed);
    assert.equal(a.pickCandidates?.[0]?.barcode, SPREAD, `typed "${typed}"`);
    assert.equal(a.resolvedBy, 'search_confident', `typed "${typed}"`);
    assert.equal(a.ownMatch?.code, SPREAD, `typed "${typed}"`);
  }
});

test('typed digits that are a barcode answer with the same verdict the scan gives', async () => {
  const scanned = await get(`/api/identify?gtin=${SPREAD}&shelfPriceCents=499&${market}`);
  const typed = await byName(SPREAD_UPCA);
  assert.deepEqual(typed.verdict, scanned.verdict);
});

test('a typed 4-digit produce code reaches the produce list', async () => {
  const a = await byName('3110');
  assert.equal(a.identity?.plu, '3110');
  assert.equal(a.identity?.unit, 'lb');
  assert.match(String(a.identity?.name ?? ''), /orange/i);
});

test('digits that are not a barcode stay a name search', async () => {
  for (const typed of ['12345678901', '0123456789', '036000291453', '12 pack coke']) {
    const a = await byName(typed);
    assert.notEqual(a.identity?.plu, '3110');
    assert.equal(a.resolvedBy ?? null, null, `typed "${typed}"`);
  }
});

// 2. A misspelling is retried, and the retry is a guess.

test('a misspelt typed name finds the product and is never sure', async () => {
  const a = await byName('dedorant');
  assert.ok(a.pickCandidates?.length >= 1, 'the misspelling found nothing');
  assert.match(String(a.pickCandidates[0].name), /deodorant/i);
  assert.notEqual(a.resolvedBy, 'search_confident');
  assert.notEqual(a.identity?.grade, 'sure');
  assert.equal(a.found, false, 'a tolerant match must not be answered as the product');
});

// 3. A name that reads like an advert is shortened for display, never for matching.

test('a scanned advert-named product is shown as brand, product and size', async () => {
  const a = await get(`/api/identify?gtin=${NUTELLA}&shelfPriceCents=499&${market}`);
  assert.equal(a.identity?.name, 'Nutella Biscuits 276 g');
});

test('the pick list and a typed answer show the short name too', async () => {
  const a = await byName('nutella biscuits');
  assert.equal(a.pickCandidates?.[0]?.barcode, NUTELLA);
  assert.equal(a.pickCandidates?.[0]?.name, 'Nutella Biscuits 276 g');
  if (a.ownMatch) assert.equal(a.ownMatch.name, 'Nutella Biscuits 276 g');
});

test('matching still reads the full catalogue name: words only the long name holds still find the product', async () => {
  const a = await byName('golden cookies hazelnut');
  assert.equal(a.pickCandidates?.[0]?.barcode, NUTELLA);
});
