/**
 * A shopper's price has to actually get into Pexi (walkthrough D01, D02, D03,
 * D05, D06, D09), hit over a real socket.
 *
 * What the walkthrough found: a typed price never left the pad (D05), the
 * correction screens sent no barcode and no scan id and said "Recorded" over a
 * refusal (D01, D02), the shop picker was a ten-second network call (D03), a
 * thumb on a catalogue answer sent nothing (D09), and a recorded price changed
 * nothing the shopper could see (D06, which is correct for the range, so the
 * answer now tells the shopper their own report exists instead).
 *
 * The catalogue is a four-row fixture and the prices are a real `prices.db`
 * written through the crawler's own `recordObservation`, the same harness
 * `catalogue-first-route.test.ts` uses. Every route under test is shipped code.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-shopper-price-'));
const scansPath = join(dir, 'scans.db');
const pricesPath = join(dir, 'prices.db');
const correctionsPath = join(dir, 'corrections.db');

process.env.SHIN_SCANS = scansPath;
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = correctionsPath;
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_PRICES = pricesPath;
process.env.SHIN_RANGE_ASK_STORE_PATH = join(dir, 'range-ask.json');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_CATALOGUE_FIRST;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

function withCheck(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return body + String((10 - (sum % 10)) % 10);
}

const CODE = withCheck('006810009001'); // Kraft Smooth PB 1 kg, three shops of its own
const PB_PATH = '["en:spreads","en:peanut-butters"]';
const today = new Date().toISOString().slice(0, 10);

const { openCatalogue, rebuildFts } = await import('../../catalogue/src/schema.ts');
const { rebuildCategoriesFromPaths: rebuildCategories } = await import('../../catalogue/test/helpers/path-taxonomy.ts');
const { Catalogue } = await import('../../catalogue/src/search.ts');
const catDb = openCatalogue(':memory:');
{
  const insert = catDb.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,NULL,?,?,?,?,?,?,'[]',1,'test')`);
  insert.run(CODE, 'Smooth Peanut Butter', 'Smooth Peanut Butter', 'Kraft', '1 kg', 1000, 'g', PB_PATH, 'en:peanut-butters');
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

const { openPrices, recordObservation } = await import('../../price/src/store.ts');
{
  const prices = openPrices(pricesPath);
  let sku = 0;
  const price = (seller: string, store: string, cents: number) =>
    recordObservation(prices, {
      code: CODE,
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
  price('alpha', 'Alpha One', 599);
  price('beta', 'Beta One', 649);
  price('gamma', 'Gamma One', 699);
  prices.close();
}

const { server, setGeminiTransportForTests, setCatalogueForTests, setCatalogueFirstForTests } = await import('../server.ts');
const { fakeTransport } = await import('./gemini-double.ts');
const { getScan } = await import('../src/scans.ts');
const { ratingFor } = await import('../src/ratings.ts');
const { correctionsFor } = await import('../../price/src/corrections.ts');

let base = '';
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setGeminiTransportForTests(fakeTransport().transport);
  setCatalogueForTests(catalogue);
  setCatalogueFirstForTests({ searcher: catalogue, db: catDb, rangeAskProvider: null as never });
  process.env.SHIN_CATALOGUE_FIRST = '1';
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
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

async function identify(device: string): Promise<Record<string, unknown>> {
  const r = await fetch(`${base}/api/identify?gtin=${CODE}&deviceId=${device}&countryCode=CA`);
  assert.equal(r.status, 200);
  return (await r.json()) as Record<string, unknown>;
}

async function post(path: string, body: unknown): Promise<{ status: number; body: Record<string, any> }> {
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json()) as Record<string, any> };
}

function scanRow(id: number): Record<string, unknown> {
  const db = new DatabaseSync(scansPath, { readOnly: true });
  try {
    return db.prepare('SELECT * FROM scan WHERE id = ?').get(id) as Record<string, unknown>;
  } finally {
    db.close();
  }
}

/* ---------------------------------------------------------------- D05 -- */

test('D05: the pad price lands on the scan and becomes a shopper report with its barcode', async () => {
  const first = await identify('sp-a');
  const scanId = first.scanId as number;
  assert.equal(typeof scanId, 'number');
  assert.equal(scanRow(scanId).typed_price_cents, null, 'the scan had a typed price before one was sent');
  assert.equal(first.shopperReport, undefined, 'a report was claimed before one existed');

  const res = await post('/api/scan-price', {
    deviceId: 'sp-a',
    scanId,
    priceCents: 549,
    storeName: 'Save-On-Foods',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.stored, true);
  assert.equal(res.body.onScan, true);
  assert.equal(res.body.report.stored, true, `report refused: ${JSON.stringify(res.body)}`);

  assert.equal(scanRow(scanId).typed_price_cents, 549, 'typed_price_cents was not written');
  const rows = correctionsFor({ code: CODE }).filter((r) => r.device_id === 'sp-a');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.code, CODE.padStart(13, '0'));
  assert.equal(rows[0]!.price_cents, 549);
  assert.equal(rows[0]!.seller, 'Save-On-Foods');
  assert.equal(rows[0]!.capture, 'typed', 'the report is not marked as a typed shopper report');
});

test('D05: a retried send is the same reading, not a second witness', async () => {
  const scanId = (await identify('sp-retry')).scanId as number;
  const body = { deviceId: 'sp-retry', scanId, priceCents: 410, storeName: 'No Frills' };
  assert.equal((await post('/api/scan-price', body)).body.report.stored, true);
  assert.equal((await post('/api/scan-price', body)).body.report.stored, true);
  assert.equal(correctionsFor({ code: CODE }).filter((r) => r.device_id === 'sp-retry').length, 1);
});

test('D05: with no shop the price stays on the scan and the answer says why there is no report', async () => {
  const scanId = (await identify('sp-noshop')).scanId as number;
  const res = await post('/api/scan-price', { deviceId: 'sp-noshop', scanId, priceCents: 399 });
  assert.equal(res.body.stored, true);
  assert.equal(res.body.report.stored, false);
  assert.match(res.body.report.why, /shop/i);
  assert.equal(scanRow(scanId).typed_price_cents, 399);
  assert.equal(correctionsFor({ code: CODE }).filter((r) => r.device_id === 'sp-noshop').length, 0);
});

test('D05: another device cannot write a price onto this scan', async () => {
  const scanId = (await identify('sp-owner')).scanId as number;
  const res = await post('/api/scan-price', { deviceId: 'sp-thief', scanId, priceCents: 1, storeName: 'Metro' });
  assert.equal(res.body.stored, false);
  assert.equal(scanRow(scanId).typed_price_cents, null);
});

test('D05: a price that is not a positive number is refused, not stored as zero', async () => {
  const scanId = (await identify('sp-bad')).scanId as number;
  for (const priceCents of [0, -5, 'abc', null]) {
    const res = await post('/api/scan-price', { deviceId: 'sp-bad', scanId, priceCents, storeName: 'Metro' });
    assert.equal(res.body.stored, false, `${String(priceCents)} was accepted`);
  }
  assert.equal(scanRow(scanId).typed_price_cents, null);
});

/* ---------------------------------------------------------------- D06 -- */

test('D06: the next answer carries the shopper\'s own report, waiting for a second source, and the range does not move', async () => {
  const before = await identify('sp-b');
  const scanId = before.scanId as number;
  await post('/api/scan-price', { deviceId: 'sp-b', scanId, priceCents: 372, storeName: 'Fortinos' });

  const after = await identify('sp-b');
  assert.deepEqual(after.shopperReport, {
    cents: 372,
    store: 'Fortinos',
    seenOn: today,
    status: 'waiting_for_second_source',
  });
  // Requirement 5.3: a lone shopper report is not in the range. The verdict's
  // range is exactly what it was before the report.
  assert.deepEqual(after.verdict ?? null, before.verdict ?? null, 'a lone report moved the range');
});

test('D06: a second shopper at the same shop and price turns the status to agreed', async () => {
  // sp-a reported 549 at Save-On-Foods in the first test; a different device now agrees.
  const scanId = (await identify('sp-agree')).scanId as number;
  await post('/api/scan-price', { deviceId: 'sp-agree', scanId, priceCents: 549, storeName: 'Save-On-Foods' });
  const answer = await identify('sp-agree');
  assert.equal((answer.shopperReport as { status: string }).status, 'second_source_agrees');
});

test('D06: one shopper\'s report never rides on another shopper\'s answer (5.9)', async () => {
  const mine = (await identify('sp-c')).scanId as number;
  await post('/api/scan-price', { deviceId: 'sp-c', scanId: mine, priceCents: 777, storeName: 'Costco' });
  const other = await identify('sp-someone-else');
  assert.equal(other.shopperReport, undefined, 'another device\'s store-and-price reached this answer');
});

/* ---------------------------------------------------------------- D01 -- */

test('D01: a correction carrying only the scan id is filed under the scan\'s barcode', async () => {
  const scanId = (await identify('sp-d')).scanId as number;
  const res = await post('/api/correction', {
    clientId: 'sp-d-1',
    deviceId: 'sp-d',
    scanId,
    code: null,
    productId: null,
    seller: 'Walmart',
    priceCents: 515,
    kind: 'regular',
    seenOn: today,
  });
  assert.equal(res.body.stored, true, JSON.stringify(res.body));
  const rows = correctionsFor({ code: CODE }).filter((r) => r.device_id === 'sp-d');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.code, CODE.padStart(13, '0'));
});

test('D01/D02: with no barcode, no scan and no shop the server says stored:false, which the screen must repeat', async () => {
  const noProduct = await post('/api/correction', {
    clientId: 'sp-e-1',
    deviceId: 'sp-e',
    scanId: null,
    code: null,
    productId: null,
    seller: 'Walmart',
    priceCents: 515,
    kind: 'regular',
    seenOn: today,
  });
  assert.equal(noProduct.body.stored, false);
  const noShop = await post('/api/correction', {
    clientId: 'sp-e-2',
    deviceId: 'sp-e',
    code: CODE,
    seller: '',
    priceCents: 515,
    kind: 'regular',
    seenOn: today,
  });
  assert.equal(noShop.body.stored, false);
  assert.match(noShop.body.why, /shop/i);
});

/* ---------------------------------------------------------------- 5.2 -- */

/*
 * Requirement 5.2: "Turn a typed shelf price into an observed price, marked as
 * a shopper report. Pass: 100% of typed prices stored that way." Plan 5.2: the
 * server alone marks it. Both routes a typed price enters by are hit here, and
 * a client claiming or denying the marking is ignored on both.
 */

test('5.2: a price typed on the correction screen is stored marked as a typed shopper report', async () => {
  const scanId = (await identify('sp-mark-a')).scanId as number;
  const res = await post('/api/correction', {
    clientId: 'sp-mark-a-1',
    deviceId: 'sp-mark-a',
    scanId,
    code: CODE,
    seller: 'Metro',
    priceCents: 588,
    kind: 'regular',
    seenOn: today,
  });
  assert.equal(res.body.stored, true, JSON.stringify(res.body));
  const rows = correctionsFor({ code: CODE }).filter((r) => r.device_id === 'sp-mark-a');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.capture, 'typed', 'a typed correction was stored without the shopper-report mark');
});

test('5.2: a client claiming or denying the marking is ignored on /api/correction', async () => {
  const claims: Record<string, unknown>[] = [
    { capture: 'photo' },
    { capture: null },
    { capture: 'scraped' },
    { shopperReport: false },
    { source: 'store_page', capture: 'photo', shopperReport: false },
  ];
  for (const [i, claim] of claims.entries()) {
    const device = `sp-mark-c${i}`;
    const res = await post('/api/correction', {
      clientId: `${device}-1`,
      deviceId: device,
      code: CODE,
      seller: 'Sobeys',
      priceCents: 601 + i,
      kind: 'regular',
      seenOn: today,
      ...claim,
    });
    assert.equal(res.body.stored, true, `${JSON.stringify(claim)} was refused: ${JSON.stringify(res.body)}`);
    const rows = correctionsFor({ code: CODE }).filter((r) => r.device_id === device);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.capture, 'typed', `the client's ${JSON.stringify(claim)} changed the marking`);
  }
});

test('5.2: a client claiming or denying the marking is ignored on /api/scan-price', async () => {
  const claims: Record<string, unknown>[] = [{ capture: 'photo' }, { capture: null }, { shopperReport: false }];
  for (const [i, claim] of claims.entries()) {
    const device = `sp-mark-p${i}`;
    const scanId = (await identify(device)).scanId as number;
    const res = await post('/api/scan-price', { deviceId: device, scanId, priceCents: 455 + i, storeName: 'FreshCo', ...claim });
    assert.equal(res.body.report.stored, true, JSON.stringify(res.body));
    const rows = correctionsFor({ code: CODE }).filter((r) => r.device_id === device);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.capture, 'typed', `the client's ${JSON.stringify(claim)} changed the marking`);
  }
});

test('5.2: the audit finds no typed price stored any other way after both routes ran', async () => {
  const { auditTypedPrices } = await import('../src/typed-price-audit.ts');
  const audit = auditTypedPrices({ corrections: correctionsPath, scans: scansPath, userCatalogue: null });
  assert.ok(audit.checked.reports > 0, 'the audit read no reports, so it proved nothing');
  assert.equal(audit.unmarkedReports, 0, JSON.stringify(audit));
  assert.equal(audit.typedNotReported, 0, JSON.stringify(audit));
});

/* ---------------------------------------------------------------- D03 -- */

test('D03: the chain list comes from the data: the price file\'s own store names and the banners Pexi names', async () => {
  const r = await fetch(`${base}/api/store-chains`);
  assert.equal(r.status, 200);
  const { chains } = (await r.json()) as { chains: { name: string }[] };
  const names = chains.map((c) => c.name);
  // From this test's own prices.db, so the list is derived, not hard-coded.
  for (const n of ['Alpha One', 'Beta One', 'Gamma One']) assert.ok(names.includes(n), `${n} is in the data and not in the list`);
  // From the price-match banners.
  for (const n of ['Sobeys', 'No Frills', 'Metro', 'Costco', 'Walmart', 'FreshCo', 'Food Basics']) {
    assert.ok(names.includes(n), `${n} is missing from the chain list`);
  }
  assert.equal(new Set(names.map((n) => n.toLowerCase())).size, names.length, 'a chain is listed twice');
});

/* ---------------------------------------------------------------- D09 -- */

test('D09: a thumb on a catalogue answer is stored against its scan, with an optional reason', async () => {
  const answer = await identify('sp-f');
  assert.notEqual(answer.kind, 'gemini', 'this test needs a catalogue answer, not a model one');
  const scanId = answer.scanId as number;
  const up = await post('/api/scan-rating', { deviceId: 'sp-f', scanId, rating: 'up' });
  assert.deepEqual(up.body, { stored: true });
  assert.equal(ratingFor(scanId)!.rating, 'up');

  const down = await post('/api/scan-rating', { deviceId: 'sp-f', scanId, rating: 'down', reason: 'wrong_price' });
  assert.deepEqual(down.body, { stored: true });
  const row = ratingFor(scanId)!;
  assert.equal(row.rating, 'down');
  assert.equal(row.reason, 'wrong_price');
  assert.equal(getScan(scanId)!.device_id, 'sp-f');
});
