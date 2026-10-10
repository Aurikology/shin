/**
 * D-231 (c): A PRICES DATABASE WITH NO OBSERVATION TABLE IS SAID OUT LOUD.
 *
 * On the live Mac every range failed with "no such table: observation", one
 * scan at a time, so Pexi's own prices never reached a shopper and nothing
 * outside the per-scan log said so. RULINGS.md "Catalogue first" puts Pexi's
 * own data first, so a prices file that cannot answer is a named fault: one
 * loud line at startup, and `/api/health` naming the fault with a count of the
 * scans it touched. Nothing is invented in its place.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-prices-health-'));
const pricesPath = join(dir, 'prices.db');
// The live Mac's case: a prices file that opens, with no observation table in it.
const broken = new DatabaseSync(pricesPath);
broken.exec('CREATE TABLE something_else (id INTEGER PRIMARY KEY)');
broken.close();

process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_PRICES = pricesPath;
process.env.SHIN_RANGE_ASK_STORE_PATH = join(dir, 'range-ask.json');
process.env.SHIN_PACK_READ_STORE_PATH = join(dir, 'pack-read.json');
process.env.PORT = '0';
process.env.SHIN_CATALOGUE_FIRST = '1';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_FREE_SCANS_PER_WEEK;

const startupLines: string[] = [];
const realError = console.error;
console.error = (...args: unknown[]) => {
  startupLines.push(args.map(String).join(' '));
  realError(...args);
};

const { openCatalogue, rebuildFts } = await import('../../catalogue/src/schema.ts');
const { Catalogue } = await import('../../catalogue/src/search.ts');
const catDb = openCatalogue(':memory:');
function withCheck(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return body + String((10 - (sum % 10)) % 10);
}
const CODE = withCheck('006700010001');
catDb
  .prepare(`INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value, size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
            VALUES (?, 'Cola Classic', 'Cola Classic', NULL, 'Fizzco', '2 L', 2000, 'ml', '["en:beverages","en:colas"]', 'en:colas', '[]', 1, 'test')`)
  .run(CODE);
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
const rangeAskProvider = {
  name: 'fake-claude-range',
  async send<T>() {
    return {
      value: { known: true, low_cents: 199, high_cents: 349, currency: 'CAD', unit: 'one 2 L bottle', confidence: 'medium' } as T,
      usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
    };
  },
};

const { server, setCatalogueForTests, setCatalogueFirstForTests } = await import('../server.ts');
const { inspectPricesDb } = await import('../src/prices-health.ts');

let base = '';
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  // `listening` is true a tick before the server's own startup lines run.
  await new Promise<void>((r) => setImmediate(r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setCatalogueForTests(catalogue);
  setCatalogueFirstForTests({ searcher: catalogue, db: catDb, rangeAskProvider: rangeAskProvider as never, claudeWaitMs: 2000 } as never);
});

after(async () => {
  console.error = realError;
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

async function health(): Promise<Record<string, unknown>> {
  const r = await fetch(`${base}/api/health`);
  assert.equal(r.status, 200);
  return (await r.json()) as Record<string, unknown>;
}

test('startup says once, loudly, that the prices file has no observation table', () => {
  const said = startupLines.filter((l) => /observation/.test(l) && /prices/i.test(l));
  assert.ok(said.length >= 1, `the server started on a prices file with no observation table and said nothing about it. Lines: ${JSON.stringify(startupLines)}`);
  assert.equal(said.length, 1, `the startup fault was said ${said.length} times, not once`);
});

test('/api/health names the prices fault and counts the scans it touched', async () => {
  const first = await health();
  assert.equal(first.pricesDb, 'no_observation_table', `health does not name the prices fault: pricesDb=${JSON.stringify(first.pricesDb)}`);
  const before = ((first.pricesDbFaults as Record<string, number> | undefined) ?? {}).no_observation_table ?? 0;
  const r = await fetch(`${base}/api/identify?gtin=${CODE}&deviceId=ph-test&countryCode=CA`);
  assert.equal(r.status, 200);
  const scanned = (await r.json()) as Record<string, unknown>;
  assert.equal(scanned.kind, 'catalogue', `setup: the scan did not take the catalogue-first path: ${JSON.stringify(scanned).slice(0, 200)}`);
  const after = await health();
  const count = ((after.pricesDbFaults as Record<string, number> | undefined) ?? {}).no_observation_table;
  assert.equal(typeof count, 'number', `health carries no count for the prices fault: ${JSON.stringify(after.pricesDbFaults)}`);
  assert.equal(count, before + 1, 'a scan priced against the broken prices file was not counted');
  assert.equal(after.ok, true, 'the shopper is still served, so health stays ok');
});

test('control: a prices file with the observation table inspects as ok, and a missing one as missing', () => {
  const good = join(dir, 'good-prices.db');
  const db = new DatabaseSync(good);
  db.exec('CREATE TABLE observation (id INTEGER PRIMARY KEY)');
  db.close();
  assert.equal(inspectPricesDb(good).state, 'ok', 'a prices file with an observation table was called broken');
  assert.equal(inspectPricesDb(pricesPath).state, 'no_observation_table');
  assert.equal(inspectPricesDb(join(dir, 'nothing-here.db')).state, 'missing');
});
