/**
 * Jamin's App Store list, item 9: with no yes from the shopper, no product name reaches Claude, and
 * the scan still ends in a range. Read out of HTTP responses, with a fake Claude that counts its calls.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-claude-consent-'));
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
const { openPrices } = await import('../../price/src/store.ts');
openPrices(process.env.SHIN_PRICES!).close();

const NO = 'name with no consent';
const YES = 'name with consent';
const catDb = openCatalogue(':memory:');
const insert = catDb.prepare(`
  INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
    size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
  VALUES (?,?,?,NULL,?,?,?,?,?,?,'[]',1,'test')`);
const path = '["en:beverages","en:sodas","en:colas"]';
insert.run('0627990010019', NO, NO, 'Fizzco', '2 L', 2000, 'ml', path, 'en:colas');
insert.run('0627990010026', YES, YES, 'Fizzco', '2 L', 2000, 'ml', path, 'en:colas');
rebuildFts(catDb);
rebuildCategories(catDb);
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

const asked: string[] = [];
const rangeAskProvider = {
  name: 'fake-claude-range',
  async send(req: { user: string }) {
    asked.push(req.user);
    return {
      value: { known: true, low_cents: 199, high_cents: 349, currency: 'CAD', unit: 'one 2 L bottle', confidence: 'medium' },
      usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
      provider: 'anthropic',
      model: 'claude-test',
    };
  },
};

const { server, setCatalogueForTests, setCatalogueFirstForTests } = await import('../server.ts');

let base = '';
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setCatalogueForTests(catalogue);
  setCatalogueFirstForTests({ searcher: catalogue, db: catDb, rangeAskProvider: rangeAskProvider as never, requireClaudeConsent: true });
});
after(async () => {
  setCatalogueForTests(null);
  setCatalogueFirstForTests(null);
  delete process.env.SHIN_CATALOGUE_FIRST;
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked. */
  }
});

const scan = async (gtin: string, headers: Record<string, string> = {}) => {
  const r = await fetch(`${base}/api/identify?gtin=${gtin}&countryCode=CA&region=Ontario&deviceId=consent-phone`, { headers });
  assert.equal(r.status, 200);
  return (await r.json()) as Record<string, any>;
};

test('no yes on the request: nothing goes to Claude, and the scan still ends in a range', async () => {
  const before = asked.length;
  const body = await scan('0627990010019');
  assert.equal(asked.length, before, 'a product name went to Claude with no yes');
  assert.ok(body.range, 'a shopper who said no got no range');
  assert.equal(body.range.basis, 'fixed_prior', 'the answer is not the broad guess');
  assert.equal(body.rangeAskedAt ?? null, null);
});

test('a header that is not exactly yes is a no', async () => {
  const before = asked.length;
  await scan('0627990010019', { 'x-shin-claude': 'true' });
  assert.equal(asked.length, before);
});

test('with the yes, the same kind of scan asks Claude (so the no above can fail)', async () => {
  const before = asked.length;
  const body = await scan('0627990010026', { 'x-shin-claude': '1' });
  assert.equal(asked.length, before + 1, 'the yes changed nothing');
  assert.ok(asked.at(-1)?.includes(YES));
  assert.ok(!asked.some((a) => a.includes(NO)), 'the name scanned with no consent was sent later');
  assert.equal(typeof body.rangeAskedAt, 'string');
});
