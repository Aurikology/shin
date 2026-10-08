/**
 * THE DISTRIBUTION VERDICT, AT THE SOCKET.
 *
 * docs/verdict-distribution-design-2026-09-30.md, Server unit: every answer
 * that has a scan left carries `verdict` (price/src/estimate.ts), beside the
 * fields older clients read; out of scans stays the paywall. Tests are named by
 * the design case they cover. Everything is read out of HTTP responses and the
 * scan log. No model is called: the Claude range ask gets fake providers, and
 * no socket leaves the machine.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-verdict-route-'));
const scansPath = join(dir, 'scans.db');
const pricesPath = join(dir, 'prices.db');

process.env.SHIN_SCANS = scansPath;
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_PRICES = pricesPath;
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

const OWN = withCheck('062699000001'); // Own Vodka 750 ml, one shop
const VODKAS = ['062699000010', '062699000011', '062699000012', '062699000013', '062699000014'].map(withCheck);
const COLA = withCheck('062699000020'); // nobody prices colas: the Claude rung
const SLOW_COLA = withCheck('062699000021');
const WIRE_COLA = withCheck('062699000022');
const STORE_ONLY = withCheck('062699000030'); // a store prices it, the catalogue lacks it (case 2)
const MISSING = withCheck('062699000099'); // nothing knows it (case 6)
const VODKA_PATH = '["en:beverages","en:spirits","en:vodkas"]';
const COLA_PATH = '["en:beverages","en:sodas","en:colas"]';

const { openCatalogue, rebuildFts } = await import('../../catalogue/src/schema.ts');
const { rebuildCategoriesFromPaths: rebuildCategories } = await import('../../catalogue/test/helpers/path-taxonomy.ts');
const { Catalogue } = await import('../../catalogue/src/search.ts');

const catDb = openCatalogue(':memory:');
{
  const insert = catDb.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,NULL,?,?,?,?,?,?,'[]',1,'test')`);
  insert.run(OWN, 'Own Vodka', 'Own Vodka', 'Owner', '750 ml', 750, 'ml', VODKA_PATH, 'en:vodkas');
  VODKAS.forEach((code, i) => insert.run(code, `Vodka Number ${i}`, `Vodka Number ${i}`, `Brand${i}`, '750 ml', 750, 'ml', VODKA_PATH, 'en:vodkas'));
  insert.run(COLA, 'Cola Classic', 'Cola Classic', 'Fizzco', '2 L', 2000, 'ml', COLA_PATH, 'en:colas');
  insert.run(SLOW_COLA, 'Cola Slow', 'Cola Slow', 'Fizzco', '2 L', 2000, 'ml', COLA_PATH, 'en:colas');
  insert.run(WIRE_COLA, 'Cola Wire', 'Cola Wire', 'Fizzco', '2 L', 2000, 'ml', COLA_PATH, 'en:colas');
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
  const prices = openPrices(pricesPath);
  let sku = 0;
  const price = (code: string, seller: string, cents: number, name = 'Item', region: string | null = 'British Columbia') =>
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
      region,
      joinMethod: 'gtin',
      seenOn: today,
      url: null,
      imageUrl: null,
      inStock: null,
      storeName: `${seller} store`,
      storeCity: 'Victoria',
      basePriceCents: null,
    });
  price(OWN, 'bcldb', 2400, 'OWN VODKA 750 ML');
  [2000, 2200, 2500, 2800, 3000].forEach((c, i) => price(VODKAS[i]!, `shop${i}`, c));
  price(STORE_ONLY, 'bcldb', 2600, 'Vodka Number 750 ml');
  prices.close();
}

/* ------------------------------------------------------------- the asks */

const askCalls: string[] = [];
const fakeClaude = {
  name: 'fake-claude-range',
  async send<T>(req: { user: string }) {
    askCalls.push(req.user);
    return {
      value: { known: true, low_cents: 199, high_cents: 349, currency: 'CAD', unit: 'one 2 L bottle', confidence: 'medium' } as T,
      usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
    };
  },
};
/** The provider refusing every call: what a missing key, an outage or a rotated key looks like here. */
const downClaude = {
  name: 'down-claude',
  async send(): Promise<never> {
    throw Object.assign(new Error('401 invalid x-api-key'), { status: 401 });
  },
};
/** Answers long after the verdict stopped waiting: design case 27, "slow". */
const slowClaude = {
  name: 'slow-claude',
  send<T>(req: { user: string }) {
    return new Promise((resolve) => setTimeout(() => resolve(fakeClaude.send<T>(req)), 400));
  },
};

/* -------------------------------------------------------------- server */

const { server, setCatalogueForTests, setCatalogueFirstForTests } = await import('../server.ts');
const { VERDICT_FIELDS } = await import('../../price/src/estimate.ts');

let base = '';
const useClaude = (provider: unknown, claudeWaitMs?: number) =>
  setCatalogueFirstForTests({ searcher: catalogue, db: catDb, rangeAskProvider: provider as never, ...(claudeWaitMs ? { claudeWaitMs } : {}) });

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setCatalogueForTests(catalogue);
  useClaude(fakeClaude);
});

after(async () => {
  setCatalogueForTests(null);
  setCatalogueFirstForTests(null);
  delete process.env.SHIN_CATALOGUE_FIRST;
  delete process.env.SHIN_FREE_SCANS_PER_WEEK;
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

async function get(path: string): Promise<{ status: number; body: Record<string, any> }> {
  const r = await fetch(`${base}${path}`);
  return { status: r.status, body: (await r.json()) as Record<string, any> };
}

const identify = (gtin: string, extra = '', device = 'verdict-test') =>
  get(`/api/identify?gtin=${gtin}&deviceId=${device}&countryCode=CA&region=British%20Columbia${extra}`);

function scanRow(id: unknown): Record<string, unknown> {
  assert.equal(typeof id, 'number', 'the answer carried no scanId');
  const db = new DatabaseSync(scansPath, { readOnly: true });
  try {
    return db.prepare('SELECT * FROM scan WHERE id = ?').get(id as number) as Record<string, unknown>;
  } finally {
    db.close();
  }
}

/* --------------------------------------------------------------- tests */

test('wire: the barcode answer carries verdict with exactly the contract field names, beside the older fields', async () => {
  const { status, body } = await identify(OWN, '&shelfPriceCents=2300');
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(body.verdict), [...VERDICT_FIELDS]);
  assert.deepEqual(Object.keys(body.verdict.shopper), ['cents', 'zone', 'offByPct', 'beyond', 'suspect']);
  assert.deepEqual(Object.keys(body.verdict.thresholds), ['greatPct', 'goodPct', 'badPct', 'fromShopper']);
  assert.deepEqual(Object.keys(body.verdict.dots[0]), ['cents', 'store', 'city', 'seenOn', 'kind', 'quantity']);
  assert.deepEqual(Object.keys(body.verdict.perUnit), ['label', 'centreCents']);
  // The older fields other clients read are all still there.
  for (const k of ['kind', 'outcome', 'offerManualEntry', 'catalogueUp', 'barcode', 'identity', 'range', 'rangeSource', 'rangeAskedAt', 'noRangeReason', 'shelfPrice', 'ms', 'scanId']) {
    assert.ok(k in body, `${k} went missing`);
  }
});

/**
 * The screen (app/public/js/lib/verdict-chart.js) is built against the hand-made
 * fixtures in test/verdict-fixtures.mjs. A real response must have the same
 * field names and the same value types, nested, or the screen draws garbage.
 */
const NULLABLE = new Set(['perUnit', 'scaledTo', 'biggerPack', 'shopper', 'suspect', 'beyond', 'city', 'quantity', 'centreCents']);
function sameShape(real: unknown, fixture: unknown, path: string): void {
  if (real === null || fixture === null) {
    const key = path.split('.').pop()!.replace(/\[\d+\]$/, '');
    assert.ok(NULLABLE.has(key) || (real === null && fixture === null), `${path} is null on one side only`);
    return;
  }
  if (Array.isArray(fixture)) {
    assert.ok(Array.isArray(real), `${path} is not an array`);
    if (fixture.length > 0 && (real as unknown[]).length > 0) sameShape((real as unknown[])[0], fixture[0], `${path}[0]`);
    return;
  }
  if (typeof fixture === 'object') {
    assert.equal(typeof real, 'object', `${path} is not an object`);
    assert.deepEqual(Object.keys(real as object).sort(), Object.keys(fixture as object).sort(), `${path} field names differ from the screen fixtures`);
    for (const k of Object.keys(fixture as object)) sameShape((real as Record<string, unknown>)[k], (fixture as Record<string, unknown>)[k], `${path}.${k}`);
    return;
  }
  assert.equal(typeof real, typeof fixture, `${path} is ${typeof real}, the screen expects ${typeof fixture}`);
}

test('wire: real server verdicts have the field names and value types of the screen lane fixtures', async () => {
  const fixturesModule = './verdict-fixtures.mjs'; // plain JS, no declaration file
  const fixtures = (await import(fixturesModule)) as Record<string, any>;
  const priced = (await identify(OWN, '&shelfPriceCents=2300')).body.verdict;
  const unpriced = (await identify(OWN)).body.verdict;
  const claude = (await identify(WIRE_COLA)).body.verdict;
  for (const [name, fx] of Object.entries(fixtures.ALL as Record<string, any>)) {
    const real = fx.shopper ? priced : unpriced;
    sameShape(real, fx, `verdict(${name})`);
  }
  sameShape(claude, fixtures.LOW_CONFIDENCE, 'verdict(claude)');
  // The fixtures' enumerations: the server speaks only these words.
  assert.ok(['own_prices', 'other_size', 'leaf_category', 'parent_category', 'brand_markup', 'claude_typical', 'category_prior', 'global_prior'].includes(priced.basis));
  assert.ok(['great', 'good', 'reasonable', 'bad'].includes(priced.shopper.zone));
});

test('case 1 and 14: a catalogue barcode with one own price is blended with its leaf, and the scan row records basis, confidence and zone', async () => {
  const asks = askCalls.length;
  const { body } = await identify(OWN, '&shelfPriceCents=2300');
  const v = body.verdict;
  assert.equal(v.basis, 'own_prices');
  assert.equal(v.spreadFrom, 'leaf_category');
  assert.equal(v.n, 1);
  assert.equal(v.confidence, 'medium');
  assert.equal(v.centreCents, Math.round(Math.exp((Math.log(2400) + Math.log(2500)) / 2)));
  assert.equal(v.shopper.cents, 2300);
  assert.equal(askCalls.length, asks, 'Claude was asked although Pexi had a price');
  const row = scanRow(body.scanId);
  assert.equal(row.estimate_basis, 'own_prices');
  assert.equal(row.estimate_confidence, 'medium');
  assert.equal(row.estimate_zone, v.shopper.zone);
  assert.equal(row.estimate_centre_cents, v.centreCents);
  assert.equal(row.estimate_sigma_log, v.sigmaLog);
});

test('case 33: the shopper own thresholds replace the defaults', async () => {
  const t = encodeURIComponent(JSON.stringify({ unit: 'percent', great: 3, good: 1, bad: 50 }));
  const { body } = await identify(OWN, `&shelfPriceCents=2300&thresholds=${t}`);
  assert.deepEqual(body.verdict.thresholds, { greatPct: 3, goodPct: 1, badPct: 50, fromShopper: true });
  assert.equal(body.verdict.shopper.zone, 'great');
});

test('case 2: a barcode missing from the catalogue that a store prices answers under the store name, with a verdict', async () => {
  const { body } = await identify(STORE_ONLY);
  assert.equal(body.outcome, 'not_in_catalogue');
  assert.deepEqual(body.storeIdentity, { name: 'Vodka Number 750 ml', brand: null, size: '750 ml', barcode: STORE_ONLY });
  assert.equal(body.verdict.basis, 'own_prices');
  assert.equal(body.verdict.spreadFrom, 'leaf_category', 'the store name was not sorted into its category');
  const row = scanRow(body.scanId);
  assert.equal(row.outcome, 'answered');
  assert.equal(row.estimate_basis, 'own_prices');
});

test('case 6: a barcode nothing knows asks for the name, with no verdict and no Claude ask', async () => {
  const asks = askCalls.length;
  const { body } = await identify(MISSING);
  assert.equal(body.outcome, 'not_in_catalogue');
  assert.equal(body.offerManualEntry, true);
  assert.equal(body.verdict, null);
  assert.equal(askCalls.length, asks);
});

test('case 3 and 5: a known product with no Pexi price asks Claude once, shared by verdict and range', async () => {
  const asks = askCalls.length;
  const { body } = await identify(COLA);
  assert.equal(askCalls.length, asks + 1, 'one scan, one ask');
  assert.equal(body.verdict.basis, 'claude_typical');
  assert.ok(Math.abs(body.verdict.p10Cents - 199) <= 1 && Math.abs(body.verdict.p90Cents - 349) <= 1);
  assert.equal(body.rangeSource, 'gemini_typical');
  assert.equal(body.range.lowCents, 199);
});

test('case 27: Claude down (a refused key) falls to the priors, and the answer still carries a verdict', async () => {
  useClaude(downClaude);
  try {
    const { body } = await identify(SLOW_COLA);
    assert.ok(['category_prior', 'global_prior'].includes(body.verdict.basis), body.verdict.basis);
    assert.equal(body.verdict.confidence, 'low');
    assert.equal(body.noRangeReason, 'model_error');
  } finally {
    useClaude(fakeClaude);
  }
});

test('case 28: a slow Claude is not waited for; the prior answers and the range says claude_slow', async () => {
  useClaude(slowClaude, 40);
  process.env.SHIN_RANGE_ASK_STORE_PATH = join(dir, 'range-ask-slow.json');
  try {
    const started = Date.now();
    const { body } = await identify(SLOW_COLA, '', 'slow-device');
    assert.ok(Date.now() - started < 5000);
    assert.ok(['category_prior', 'global_prior'].includes(body.verdict.basis));
    assert.equal(body.noRangeReason, 'claude_slow');
  } finally {
    process.env.SHIN_RANGE_ASK_STORE_PATH = join(dir, 'range-ask.json');
    useClaude(fakeClaude);
  }
});

test('case 7: a typed name that matches carries a verdict built as its barcode would be', async () => {
  const { status, body } = await get('/api/identify?text=Vodka%20Number&deviceId=typed-test&countryCode=CA&shelfPriceCents=2500');
  assert.equal(status, 200);
  assert.equal(body.found, true);
  assert.deepEqual(Object.keys(body.verdict), [...VERDICT_FIELDS]);
  assert.equal(body.verdict.basis, 'own_prices');
  assert.equal(body.verdict.shopper.cents, 2500);
  const row = scanRow(body.scanId);
  assert.equal(row.estimate_basis, 'own_prices');
});

test('case 8: a typed name that matches nothing is asked of Claude from the typed words', async () => {
  const asks = askCalls.length;
  const { body } = await get('/api/identify?text=zorbo%20fizz%20drink&deviceId=typed-test&countryCode=CA');
  assert.equal(body.found, false);
  assert.equal(askCalls.length, asks + 1);
  assert.match(askCalls[askCalls.length - 1]!, /Product: zorbo fizz drink/);
  assert.equal(body.verdict.basis, 'claude_typical');
});

test('read text: the top candidate carries a verdict, and match-text never asks Claude', async () => {
  const asks = askCalls.length;
  const r = await fetch(`${base}/api/match-text`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lines: ['Own Vodka', '750 ml'], deviceId: 'text-test', countryCode: 'CA' }),
  });
  assert.equal(r.status, 200);
  const body = (await r.json()) as Record<string, any>;
  assert.ok(body.candidates.length > 0);
  assert.deepEqual(Object.keys(body.verdict), [...VERDICT_FIELDS]);
  assert.equal(askCalls.length, asks);
  assert.equal(scanRow(body.scanId).estimate_basis, body.verdict.basis);
});

test('case 30: out of scans is the paywall, with no verdict', async () => {
  process.env.SHIN_FREE_SCANS_PER_WEEK = '1';
  try {
    const first = await identify(OWN, '', 'paywall-device');
    assert.equal(first.status, 200);
    assert.ok(first.body.verdict);
    const second = await identify(OWN, '', 'paywall-device');
    assert.equal(second.status, 402);
    assert.equal(second.body.verdict, undefined);
    // Typed searches stay free.
    const typed = await get('/api/identify?text=Vodka%20Number&deviceId=paywall-device&countryCode=CA');
    assert.equal(typed.status, 200);
    assert.ok(typed.body.verdict);
  } finally {
    delete process.env.SHIN_FREE_SCANS_PER_WEEK;
  }
});
