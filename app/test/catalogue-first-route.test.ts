/**
 * THE CATALOGUE-FIRST PATH, AT THE SOCKET.
 *
 * RULINGS.md "Catalogue first; Gemini is a capped fallback, never the identity"
 * (both founders, 2026-09-27): the catalogue names the product, Pexi's own
 * prices give the range, and Gemini is only a capped fallback asked for a
 * typical range. "The beta keeps today's behaviour until one setting flips":
 * that setting is SHIN_CATALOGUE_FIRST, and the first test here pins that with
 * it off the barcode answer is byte-identical to the one captured from the
 * route BEFORE this path existed (2026-09-27, same fake Gemini answer, same
 * request), apart from the three values that differ on every call.
 *
 * Everything is read out of HTTP responses and the scan log. Nothing opens a
 * socket to Google: the Gemini scan call gets the recorded double
 * (`gemini-double.ts`), and the range ask gets a fake `Provider` that counts
 * its calls. The catalogue is a real in-memory `Catalogue` (real FTS, real
 * `byGtin`, real `search`), the prices a real temp price store.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-catalogue-first-'));
const scansPath = join(dir, 'scans.db');
const pricesPath = join(dir, 'prices.db');
const gapsPath = join(dir, 'gaps.db');

process.env.SHIN_SCANS = scansPath;
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = gapsPath;
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_PRICES = pricesPath;
process.env.SHIN_RANGE_ASK_STORE_PATH = join(dir, 'range-ask.json');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_CATALOGUE_FIRST;
delete process.env.SHIN_RANGE_ASK_MONTHLY_CAP;
delete process.env.SHIN_RANGE_ASK_CEILING_CENTS;
delete process.env.SHIN_FREE_SCANS_PER_WEEK;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

/* ------------------------------------------------------------ barcodes */

/** A GS1 check digit, so every code below passes the route's own check. */
function withCheck(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return body + String((10 - (sum % 10)) % 10);
}

/** The barcode the OFF snapshot was captured with. No price and no catalogue row for it here, on purpose. */
const SNAPSHOT_GTIN = '0068100084245';
const OWN_HIT = withCheck('006810009001'); // Kraft Smooth PB 1 kg, three shops: this_product
const CAT_HIT = withCheck('006810009002'); // Kraft Smooth PB 2 kg, no prices of its own: leaf_category
const PB_OTHERS = ['006810009003', '006810009004', '006810009005', '006810009006'].map(withCheck);
const NONE_HIT = withCheck('006700010001'); // a cola nobody has priced: the ask
const CAP_HIT = withCheck('006700010002'); // another unpriced cola, for the cap
const MISSING = withCheck('006999999999'); // valid, not in the catalogue
/** A weighed-item label: item 12345, price field 0599 with digit 7 = 0, so $5.99 embedded. */
const WEIGHED = withCheck('21234500599');

const PB_PATH = '["en:spreads","en:peanut-butters"]';
const COLA_PATH = '["en:beverages","en:colas"]';

/* ------------------------------------------------------------ fixtures */

const { openCatalogue, rebuildFts, rebuildCategories } = await import('../../catalogue/src/schema.ts');
const { Catalogue } = await import('../../catalogue/src/search.ts');
const { openGapLog } = await import('../../catalogue/src/gaps.ts');
const gapLog = openGapLog(gapsPath);

const catDb = openCatalogue(':memory:');
{
  const insert = catDb.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,NULL,?,?,?,?,?,?,'[]',1,'test')`);
  insert.run(OWN_HIT, 'Smooth Peanut Butter', 'Smooth Peanut Butter', 'Kraft', '1 kg', 1000, 'g', PB_PATH, 'en:peanut-butters');
  insert.run(CAT_HIT, 'Smooth Peanut Butter', 'Smooth Peanut Butter', 'Kraft', '2 kg', 2000, 'g', PB_PATH, 'en:peanut-butters');
  insert.run(PB_OTHERS[0], 'Crunchy Peanut Butter', 'Crunchy Peanut Butter', 'Kraft', '1 kg', 1000, 'g', PB_PATH, 'en:peanut-butters');
  insert.run(PB_OTHERS[1], 'Natural Peanut Butter', 'Natural Peanut Butter', 'Skippy', '1 kg', 1000, 'g', PB_PATH, 'en:peanut-butters');
  insert.run(PB_OTHERS[2], 'Creamy Peanut Butter', 'Creamy Peanut Butter', 'Jif', '1 kg', 1000, 'g', PB_PATH, 'en:peanut-butters');
  insert.run(PB_OTHERS[3], 'Organic Peanut Butter', 'Organic Peanut Butter', 'Compliments', '1 kg', 1000, 'g', PB_PATH, 'en:peanut-butters');
  insert.run(NONE_HIT, 'Cola Classic', 'Cola Classic', 'Fizzco', '2 L', 2000, 'ml', COLA_PATH, 'en:colas');
  insert.run(CAP_HIT, 'Cola Zero', 'Cola Zero', 'Fizzco', '2 L', 2000, 'ml', COLA_PATH, 'en:colas');
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
  const price = (code: string, seller: string, store: string, cents: number) =>
    recordObservation(prices, {
      code,
      seller,
      sellerSku: `SKU-${(sku += 1)}`,
      sellerName: `${store} item`,
      sellerBrand: null,
      priceCents: cents,
      kind: 'regular',
      unitPriceCents: null,
      unitLabel: null,
      currency: 'CAD',
      country: 'CA',
      region: 'ON',
      joinMethod: 'gtin',
      seenOn: today,
      url: null,
      imageUrl: null,
      inStock: null,
      storeName: store,
      storeCity: null,
      basePriceCents: null,
    });
  price(OWN_HIT, 'alpha', 'Alpha One', 599);
  price(OWN_HIT, 'beta', 'Beta One', 649);
  price(OWN_HIT, 'gamma', 'Gamma One', 699);
  price(PB_OTHERS[0], 'alpha', 'Alpha One', 600);
  price(PB_OTHERS[1], 'alpha', 'Alpha One', 700);
  price(PB_OTHERS[2], 'alpha', 'Alpha One', 800);
  price(PB_OTHERS[3], 'alpha', 'Alpha One', 900);
  prices.close();
}

/* ------------------------------------------------------------- the ask */

interface AskCall {
  user: string;
}
const askCalls: AskCall[] = [];
const rangeAskProvider = {
  name: 'fake-claude-range',
  async send<T>(req: { user: string }) {
    askCalls.push({ user: req.user });
    return {
      value: { known: true, low_cents: 199, high_cents: 349, currency: 'CAD', unit: 'one 2 L bottle', confidence: 'medium' } as T,
      usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
      provider: 'anthropic',
      model: 'claude-sonnet-5',
    };
  },
};

/* -------------------------------------------------------------- server */

const { server, setGeminiTransportForTests, setCatalogueForTests, setCatalogueFirstForTests } = await import('../server.ts');
const { fakeTransport } = await import('./gemini-double.ts');
const scanDouble = fakeTransport();

let base = '';
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setGeminiTransportForTests(scanDouble.transport);
  setCatalogueForTests(catalogue);
  setCatalogueFirstForTests({ searcher: catalogue, db: catDb, rangeAskProvider: rangeAskProvider as never });
});

after(async () => {
  setGeminiTransportForTests(null);
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

const on = () => {
  process.env.SHIN_CATALOGUE_FIRST = '1';
};
const off = () => {
  // On by default since 2026-09-28, so off has to be said.
  process.env.SHIN_CATALOGUE_FIRST = '0';
};

async function identify(gtin: string, device = 'cf-test'): Promise<Record<string, unknown>> {
  const r = await fetch(`${base}/api/identify?gtin=${gtin}&deviceId=${device}&countryCode=CA`);
  assert.equal(r.status, 200);
  return (await r.json()) as Record<string, unknown>;
}

async function matchText(body: unknown, init: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch(`${base}/api/match-text`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}

function scanRow(id: unknown): Record<string, unknown> {
  assert.equal(typeof id, 'number', 'the answer carried no scanId');
  const db = new DatabaseSync(scansPath, { readOnly: true });
  try {
    return db.prepare('SELECT * FROM scan WHERE id = ?').get(id as number) as Record<string, unknown>;
  } finally {
    db.close();
  }
}

function gapCount(): number {
  return (gapLog.db!.prepare('SELECT count(*) AS n FROM gap').get() as { n: number }).n;
}

/* -------------------------------------------------------------- tests */

/**
 * Captured 2026-09-27 from `/api/identify?gtin=0068100084245&deviceId=cap&countryCode=CA`
 * against the server as it stood before this path existed, with the same
 * `fakeTransport()` answer and no own prices for the code. `ms`, `scanId` and
 * `grounded.fetchedAt` are the only values that change per call, and are
 * replaced before comparing.
 */
const TODAY_BARCODE_ANSWER =
  '{"product":null,"matchedBy":"none","band":"miss","category":null,"categoryWhy":"","ring":null,"otherCandidates":0,"route":null,"catalogueUp":false,"ms":"<ms>","reason":"unchecked","scanId":"<scanId>","priceQuery":{"text":"Kraft Dinner Original 225 g","gtin":"0068100084245"},"unchecked":{"checked":false,"source":"search","label":"Kraft Dinner Original 225 g","brand":"Kraft","name":"Kraft Dinner Original","size":"225 g","gtin":"0068100084245"},"model":"gemini-3.8-flash","modelFamily":"3.x","lowConfidence":false,"confidenceReasons":[],"parseStatus":"clean","failure":null,"overCap":false,"retryable":false,"grounded":{"kind":"grounded","forDevice":"cap","fetchedAt":"<fetchedAt>","block":{"kind":"prices","checked":false,"description":"Boxed macaroni and cheese.","offers":[{"retailer":"Alpha Market","price":2,"url":"https://example.com/alpha","sizeValue":100,"sizeUnit":"g","packCount":1,"modelNumber":null,"specs":null,"condition":"new","currency":"CAD","marketplace":false,"memberOnly":false,"dealKind":null,"dealUnits":null,"observedAt":null,"organic":false,"storeBrand":null,"soldByWeight":false,"hasLink":true,"unitPrice":2,"inMedian":true,"exclusionReason":null,"pctVsMedian":-33.3333},{"retailer":"Beta Foods","price":3,"url":"https://example.com/beta","sizeValue":100,"sizeUnit":"g","packCount":1,"modelNumber":null,"specs":null,"condition":"new","currency":"CAD","marketplace":false,"memberOnly":false,"dealKind":null,"dealUnits":null,"observedAt":null,"organic":false,"storeBrand":null,"soldByWeight":false,"hasLink":true,"unitPrice":3,"inMedian":true,"exclusionReason":null,"pctVsMedian":0},{"retailer":"Gamma Grocer","price":4,"url":"https://example.com/gamma","sizeValue":100,"sizeUnit":"g","packCount":1,"modelNumber":null,"specs":null,"condition":"new","currency":"CAD","marketplace":false,"memberOnly":false,"dealKind":null,"dealUnits":null,"observedAt":null,"organic":false,"storeBrand":null,"soldByWeight":false,"hasLink":true,"unitPrice":4,"inMedian":true,"exclusionReason":null,"pctVsMedian":33.3333}],"reviews":[{"rating":4.5,"count":120,"summary":"Liked.","url":"https://example.com/r","source":"example.com","hasLink":true}],"verdict":{"median":3,"n":3,"unitLabel":"100 g","span":35,"zoneUnderBoundary":35.714,"zoneOverBoundary":64.286,"ticks":[],"points":[{"retailer":"Alpha Market","position":2.381,"url":"https://example.com/alpha","label":"$2","marks":[]},{"retailer":"Beta Foods","position":50,"url":"https://example.com/beta","label":"$3","marks":[]},{"retailer":"Gamma Grocer","position":97.619,"url":"https://example.com/gamma","label":"$4","marks":[]}],"excluded":[],"shelf":null,"shelfLabel":"","sizeAssumed":false,"confidence":"ok","shortfalls":[]},"noLineReason":null,"searchQueries":["kraft dinner price"],"citations":[],"name":"Kraft Dinner Original","brand":"Kraft","size":"225 g","category":null,"facts":[{"field":"name","value":"Kraft Dinner Original","url":"https://example.com/kd","hasLink":true},{"field":"brand","value":"Kraft","url":null,"hasLink":false},{"field":"size","value":"225 g","url":null,"hasLink":false}],"model":"gemini-3.8-flash","lowConfidence":false,"confidenceReasons":[],"parseStatus":"clean","shelfPriceSent":false,"alternatives":[],"alternativesStatus":"missing"},"suggestionsHtml":"<div class=\\"container\\">kraft dinner price</div>"}}';

test('setting OFF: a barcode scan answers byte-for-byte as it did before this path existed', async () => {
  off();
  const r = await fetch(`${base}/api/identify?gtin=${SNAPSHOT_GTIN}&deviceId=cap&countryCode=CA`);
  assert.equal(r.status, 200);
  const text = await r.text();
  const body = JSON.parse(text) as Record<string, unknown>;
  assert.equal(scanDouble.calls.length, 1, 'with the setting off the barcode still makes its one Gemini scan call');
  assert.equal(askCalls.length, 0, 'with the setting off the range ask is never made');
  assert.equal(typeof body.ms, 'number');
  assert.equal(typeof body.scanId, 'number');
  const normalised = text
    .replace(/"ms":\d+/, '"ms":"<ms>"')
    .replace(/"scanId":\d+/, '"scanId":"<scanId>"')
    .replace(/"fetchedAt":"[^"]+"/, '"fetchedAt":"<fetchedAt>"');
  assert.equal(normalised, TODAY_BARCODE_ANSWER);
  // And the new columns stay null on a row the old path wrote.
  const row = scanRow(body.scanId);
  assert.equal(row.answer_path, null);
  assert.equal(row.range_source, null);
});

test('setting OFF: /api/match-text is the same 404 an unknown path gets', async () => {
  off();
  const r = await matchText({ lines: ['Kraft', 'Smooth Peanut Butter'] });
  assert.equal(r.status, 404);
  assert.deepEqual(r.body, { error: 'no such endpoint' });
  const unknown = await fetch(`${base}/api/no-such-thing`, { method: 'POST', body: '{}' });
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), r.body);
});

test('ON, catalogue hit with its own prices: identity from the catalogue, range from shin_prices, no model call', async () => {
  on();
  const scansBefore = scanDouble.calls.length;
  const asksBefore = askCalls.length;
  const body = await identify(OWN_HIT);
  assert.equal(body.kind, 'catalogue');
  assert.equal(body.outcome, 'catalogue_hit');
  assert.equal(body.offerManualEntry, false);
  assert.equal(body.catalogueUp, true);
  assert.equal(body.barcode, OWN_HIT);
  assert.deepEqual(body.identity, {
    name: 'Smooth Peanut Butter',
    brand: 'Kraft',
    size: '1 kg',
    barcode: OWN_HIT,
    category: { tag: 'en:peanut-butters', name: 'Peanut butters' },
  });
  assert.deepEqual(body.range, {
    lowCents: 599,
    highCents: 699,
    medianCents: 649,
    n: 3,
    basis: 'this_product',
    category: null,
    currency: 'CAD',
    unit: null,
  });
  assert.equal(body.rangeSource, 'shin_prices');
  assert.equal(body.rangeAskedAt, null);
  assert.equal(body.noRangeReason, null);
  assert.equal(body.shelfPrice, null);
  assert.equal(scanDouble.calls.length, scansBefore, 'the Gemini scan call was made on the catalogue path');
  assert.equal(askCalls.length, asksBefore, 'the range ask was made although Pexi had prices');
  const row = scanRow(body.scanId);
  assert.equal(row.kind, 'barcode');
  assert.equal(row.outcome, 'answered');
  assert.equal(row.source, 'catalogue');
  assert.equal(row.resolved_code, OWN_HIT);
  assert.equal(row.answer_path, 'catalogue_hit');
  assert.equal(row.range_source, 'shin_prices');
  assert.equal(row.range_basis, 'this_product');
  assert.equal(row.range_miss_reason, null);
});

test('ON, catalogue hit with only its category priced: a leaf_category range, scaled to its size', async () => {
  on();
  const scansBefore = scanDouble.calls.length;
  const asksBefore = askCalls.length;
  const body = await identify(CAT_HIT);
  assert.equal(body.outcome, 'catalogue_hit');
  const range = body.range as Record<string, unknown>;
  assert.equal(range.basis, 'leaf_category');
  assert.deepEqual(range.category, { tag: 'en:peanut-butters', name: 'Peanut butters' });
  assert.equal(range.n, 5);
  assert.equal(range.currency, 'CAD');
  // 2 kg against 1 kg rows: every figure is twice a 1 kg price.
  assert.equal((range.lowCents as number) % 2, 0);
  assert.ok((range.lowCents as number) >= 1198 && (range.highCents as number) <= 1800, JSON.stringify(range));
  assert.equal(body.rangeSource, 'shin_prices');
  assert.equal(scanDouble.calls.length, scansBefore);
  assert.equal(askCalls.length, asksBefore);
  const row = scanRow(body.scanId);
  assert.equal(row.range_source, 'shin_prices');
  assert.equal(row.range_basis, 'leaf_category');
});

test('ON, catalogue hit Pexi cannot price: exactly one Claude range ask, zero Gemini calls, gemini_typical with its time', async () => {
  // RULINGS.md "Catalogue first; Claude, with no web search, is the capped
  // price-range fallback". Jamin, 2026-09-28: "We are not using gemini at all
  // for the client side answers"; `gemini_typical` is the historical wire value.
  on();
  const scansBefore = scanDouble.calls.length;
  const asksBefore = askCalls.length;
  const body = await identify(NONE_HIT);
  assert.equal(body.outcome, 'catalogue_hit');
  assert.equal(askCalls.length - asksBefore, 1, 'the range ask was not made exactly once');
  assert.equal(scanDouble.calls.length, scansBefore, 'the Gemini scan call was made on the catalogue path');
  assert.match(askCalls[askCalls.length - 1]!.user, /Product: Cola Classic/);
  assert.match(askCalls[askCalls.length - 1]!.user, /Brand: Fizzco/);
  assert.deepEqual(body.range, {
    lowCents: 199,
    highCents: 349,
    medianCents: null,
    n: null,
    basis: 'gemini_typical',
    category: null,
    currency: 'CAD',
    unit: 'one 2 L bottle',
  });
  assert.equal(body.rangeSource, 'gemini_typical');
  assert.equal(typeof body.rangeAskedAt, 'string');
  assert.ok(!Number.isNaN(Date.parse(body.rangeAskedAt as string)));
  assert.equal(body.noRangeReason, null);
  const row = scanRow(body.scanId);
  assert.equal(row.answer_path, 'catalogue_hit');
  assert.equal(row.range_source, 'gemini_typical');
  assert.equal(row.range_basis, 'none');
});

test('ON, the monthly ask cap reached: the identity still comes back, no range, the reason, no model call', async () => {
  on();
  process.env.SHIN_RANGE_ASK_MONTHLY_CAP = '0';
  try {
    const scansBefore = scanDouble.calls.length;
    const asksBefore = askCalls.length;
    const body = await identify(CAP_HIT);
    assert.equal(body.outcome, 'catalogue_hit');
    assert.equal((body.identity as Record<string, unknown>).name, 'Cola Zero');
    assert.equal(body.range, null);
    assert.equal(body.rangeSource, null);
    assert.equal(body.noRangeReason, 'monthly_cap_reached');
    assert.equal(askCalls.length, asksBefore, 'the ask went out past the cap');
    assert.equal(scanDouble.calls.length, scansBefore);
    const row = scanRow(body.scanId);
    assert.equal(row.outcome, 'answered');
    assert.equal(row.answer_path, 'catalogue_hit');
    assert.equal(row.range_miss_reason, 'monthly_cap_reached');
  } finally {
    delete process.env.SHIN_RANGE_ASK_MONTHLY_CAP;
  }
});

test('ON, a photo and a price request reach no model and no stored model answer', async () => {
  on();
  const scansBefore = scanDouble.calls.length;
  const photo = await fetch(`${base}/api/identify/photo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId: 'cf-test', image: 'aGVsbG8=' }),
  });
  assert.equal(photo.status, 200);
  const photoBody = (await photo.json()) as Record<string, unknown>;
  assert.equal(photoBody.failure, 'no_model_call');
  assert.equal(photoBody.offerManualEntry, true);
  // SNAPSHOT_GTIN was answered by the Gemini double in the OFF test above, so a
  // stored answer exists for device "cap"; it must not be served either.
  const price = await fetch(`${base}/api/price`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId: 'cap', gtin: SNAPSHOT_GTIN }),
  });
  assert.equal(price.status, 200);
  const priceBody = (await price.json()) as Record<string, unknown>;
  assert.equal(priceBody.failure, 'no_model_call');
  assert.equal(priceBody.grounded, undefined);
  assert.equal(scanDouble.calls.length, scansBefore, 'a Gemini call was made with catalogue first on');
});

test('ON, a barcode not in the catalogue: not_in_catalogue, manual entry offered, zero Gemini calls of any kind', async () => {
  on();
  const scansBefore = scanDouble.calls.length;
  const asksBefore = askCalls.length;
  const body = await identify(MISSING);
  assert.equal(body.kind, 'catalogue');
  assert.equal(body.outcome, 'not_in_catalogue');
  assert.equal(body.offerManualEntry, true);
  assert.equal(body.catalogueUp, true);
  assert.equal(body.identity, null);
  assert.equal(body.range, null);
  assert.equal(scanDouble.calls.length, scansBefore, 'Gemini was asked to identify a barcode the catalogue lacks');
  assert.equal(askCalls.length, asksBefore);
  const row = scanRow(body.scanId);
  assert.equal(row.outcome, 'refused');
  assert.equal(row.failure_class, 'not_in_catalogue');
  assert.equal(row.answer_path, 'not_in_catalogue');
  assert.equal(row.range_source, null);
});

test('ON, a weighed-item label carries its embedded price as the shelf price', async () => {
  on();
  const scansBefore = scanDouble.calls.length;
  const body = await identify(WEIGHED);
  assert.equal(body.kind, 'catalogue');
  assert.equal(body.outcome, 'not_in_catalogue');
  assert.deepEqual(body.shelfPrice, { cents: 599, from: 'weighed_label' });
  assert.equal(body.barcode, withCheck('21234500000'), 'the canonical item-family key was not what was looked up');
  assert.equal(scanDouble.calls.length, scansBefore);
});

test('ON, match-text: the top 3 with the shelf price read, and nothing more per candidate', async () => {
  on();
  const scansBefore = scanDouble.calls.length;
  const asksBefore = askCalls.length;
  const r = await matchText({ lines: ['Kraft', 'SMOOTH PEANUT BUTTER', '1 kg', '$5.99'], deviceId: 'cf-text' });
  assert.equal(r.status, 200);
  assert.equal(r.body.kind, 'text_match');
  assert.equal(r.body.catalogueUp, true);
  const candidates = r.body.candidates as Record<string, unknown>[];
  assert.ok(candidates.length >= 1 && candidates.length <= 3, `got ${candidates.length} candidates`);
  assert.equal(candidates[0]!.barcode, OWN_HIT, JSON.stringify(candidates));
  for (const c of candidates) {
    assert.deepEqual(Object.keys(c).sort(), ['barcode', 'brand', 'name', 'productId', 'score', 'size']);
  }
  assert.deepEqual(r.body.shelfPrice, { cents: 599, forCount: 1, text: '$5.99' });
  assert.equal(scanDouble.calls.length, scansBefore);
  assert.equal(askCalls.length, asksBefore);
  const row = scanRow(r.body.scanId);
  assert.equal(row.kind, 'text');
  assert.equal(row.answer_path, 'text_match');
  assert.equal(row.match_lines, 4);
  assert.equal(row.match_candidates, candidates.length);
  assert.equal(row.match_price_read, 1);
  assert.equal(row.query_text, 'Kraft\nSMOOTH PEANUT BUTTER\n1 kg\n$5.99');
  assert.equal(row.range_source, null);
});

test('ON, match-text with no hit writes no miss row, while a plain search with the same words still does', async () => {
  on();
  const lines = ['Zyzzogeton Quaffle Flurbish'];
  const before = gapCount();
  const r = await matchText({ lines });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.candidates, []);
  assert.equal(r.body.shelfPrice, null);
  assert.equal(gapCount(), before, 'passive match-text wrote a catalogue miss');
  const row = scanRow(r.body.scanId);
  assert.equal(row.outcome, 'refused');
  assert.equal(row.answer_path, 'text_match');
  assert.equal(row.match_candidates, 0);
  assert.equal(row.match_price_read, 0);
  // The control: the default is unchanged for every other caller.
  await catalogue.search({ text: 'zyzzogeton quaffle flurbish', vectors: false });
  assert.equal(gapCount(), before + 1, 'plain search stopped recording its miss');
});

test('ON, match-text refuses what is not { lines: string[] } within the caps', async () => {
  on();
  const bad: unknown[] = [
    '[]',
    { lines: 'Kraft' },
    { lines: [] },
    { lines: ['ok', 5] },
    { lines: Array.from({ length: 61 }, () => 'x') },
    { lines: ['x'.repeat(201)] },
    { nothing: true },
  ];
  for (const b of bad) {
    const r = await matchText(b);
    assert.equal(r.status, 400, `accepted ${JSON.stringify(b).slice(0, 60)}`);
    assert.equal(typeof r.body.error, 'string');
  }
  const notJson = await matchText('not json');
  assert.equal(notJson.status, 400);
  const get = await fetch(`${base}/api/match-text`);
  assert.equal(get.status, 405);
  const foreign = await matchText({ lines: ['Kraft'] }, { headers: { origin: 'https://elsewhere.example', 'content-type': 'application/json' } });
  assert.equal(foreign.status, 403);
  const atCaps = await matchText({ lines: Array.from({ length: 60 }, () => 'y'.repeat(100)) });
  assert.equal(atCaps.status, 200, 'the caps themselves were refused');
});
