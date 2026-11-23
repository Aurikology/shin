/**
 * THE SHELF SAMPLE (scripts/shelf-sample.mts). Fixtures only: build mode runs on an injected fetch (no network, no
 * credentials), measure mode on a tiny temp catalogue and prices file. What these pin: a product with no UPC is
 * skipped, codes come out canonical with a right check digit, the same seed gives the same sample, the Kroger-only
 * flag separates a range stood on Kroger's own prices from one with another seller behind it, and the two input
 * files are byte for byte unchanged after a measure.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCatalogue, rebuildFts } from '../../catalogue/src/schema.ts';
import { rebuildCategoriesFromPaths } from '../../catalogue/test/helpers/path-taxonomy.ts';
import { openPrices, recordObservation } from '../../price/src/store.ts';
import { KrogerClient, gs1Valid, API_BASE } from '../../price/src/kroger-api.ts';
import { buildSample, codeOfProduct, measureSample, summarise, type BuildClient, type Sample } from '../../scripts/shelf-sample.mts';

function withCheck(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return body + String((10 - (sum % 10)) % 10);
}

/* ------------------------------------------------------------------ build */

// A fake Kroger: 30 products per term (upc given as Kroger gives it, 13 digits zero padded), one with no UPC.
const MILKS = Array.from({ length: 30 }, (_, i) => withCheck(`07${String(1000 + i).padStart(4, '0')}00000`.slice(0, 11)));
const CEREALS = Array.from({ length: 30 }, (_, i) => withCheck(`07${String(2000 + i).padStart(4, '0')}00000`.slice(0, 11)));
const upc13 = (upc12: string): string => `0${upc12}`;
const product = (upc12: string, i: number, term: string): unknown => ({
  productId: `00${upc12.slice(0, 11)}`, upc: upc13(upc12), brand: `Brand${i}`, description: `${term} ${i}`,
  items: [{ price: { regular: 2.5 } }],
});

function fakeClient(log: string[] = []): BuildClient {
  return {
    async locations(zip) {
      log.push(`loc ${zip}`);
      return { data: [{ locationId: `L${zip}`, chain: 'KROGER', name: `Store ${zip}`, address: { city: 'X', state: 'OH', zipCode: zip } }] };
    },
    async searchProducts(term, locationId, limit, start) {
      log.push(`search ${term} ${locationId} ${limit} ${start}`);
      const list = term === 'milk' ? MILKS : CEREALS;
      const data = list.map((c, i) => product(c, i, term));
      if (term === 'milk') data.push({ productId: 'ABC', upc: null, brand: 'NoUpc', description: 'no upc product', items: [] });
      return { data };
    },
  };
}

test('build: no-UPC product skipped, codes canonical 13 digits with a right check digit, deduped across ZIPs, per-term cap', async () => {
  const s = await buildSample({ client: fakeClient(), zips: ['45202', '60601'], terms: ['milk', 'cereal'], perTerm: 8, seed: 7 });
  assert.equal(s.stores.length, 2);
  assert.equal(s.items.length, 16);
  assert.equal(s.items.filter((i) => i.term === 'milk').length, 8);
  assert.equal(s.items.filter((i) => i.term === 'cereal').length, 8);
  assert.equal(new Set(s.items.map((i) => i.code)).size, 16, 'deduped');
  for (const i of s.items) {
    assert.match(i.code, /^\d{13}$/);
    assert.ok(gs1Valid(i.code), i.code);
  }
  assert.ok(!s.items.some((i) => i.krogerDescription === 'no upc product'));
  assert.ok(MILKS.map(upc13).includes(s.items.find((i) => i.term === 'milk')!.code));
});

test('build: the same seed gives the same sample, another seed a different one, and search starts are seeded offsets', async () => {
  const run = async (seed: number, log: string[] = []) => buildSample({ client: fakeClient(log), zips: ['45202'], terms: ['milk'], perTerm: 8, seed, now: () => new Date(0) });
  const log1: string[] = [];
  const a = await run(7, log1);
  const b = await run(7);
  const c = await run(8);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.items.map((i) => i.code), c.items.map((i) => i.code));
  const m = /^search milk L45202 50 (\d+)$/.exec(log1.find((l) => l.startsWith('search'))!);
  assert.ok(m && Number(m[1]) >= 0 && Number(m[1]) < 200);
});

test('build: a product whose upc is not a barcode falls back to productId plus a computed check digit; with no upc it is skipped', () => {
  const upc12 = withCheck('01234500001');
  assert.equal(codeOfProduct({ productId: `0001234500001`, upc: '0000000000001' }), upc13(upc12));
  assert.equal(codeOfProduct({ productId: '0001234500001', upc: null }), null);
  assert.equal(codeOfProduct({ productId: 'ABC', upc: '12' }), null);
  assert.equal(codeOfProduct({ productId: '0001234500001', upc: upc13(upc12) }), upc13(upc12));
});

test('the Kroger client term search is a GET of /products with filter.term, filter.locationId, filter.limit, filter.start', async () => {
  const urls: string[] = [];
  const client = new KrogerClient({
    clientId: 'id', clientSecret: 'secret',
    fetch: async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => (url.includes('/oauth2/token') ? { access_token: 't', expires_in: 1800 } : { data: [] }), text: async () => '' };
    },
  });
  await client.searchProducts('frozen pizza', '01400441', 50, 120);
  assert.equal(urls.at(-1), `${API_BASE}/products?filter.term=frozen%20pizza&filter.locationId=01400441&filter.limit=50&filter.start=120`);
});

/* ---------------------------------------------------------------- measure */

let dir = '';
let cataloguePath = '';
let pricesPath = '';
const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');
const MILK = '["en:dairies","en:milks"]';
const CEREAL = '["en:cereals","en:breakfast-cereals"]';
const KROGER_ONLY = withCheck('07100000001');
const MIXED = withCheck('07100000002');
const UNKNOWN = withCheck('07100000003');
const code13 = (u: string): string => `0${u}`;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'shelf-sample-'));
  cataloguePath = join(dir, 'catalogue.db');
  pricesPath = join(dir, 'prices.db');
  const cat = openCatalogue(cataloguePath);
  const ins = cat.prepare(`INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value, size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,NULL,?,?,NULL,NULL,?,?,'[]',0,'fixture')`);
  ins.run(code13(KROGER_ONLY), 'Whole Milk', 'Whole Milk', 'Kroger', '1 gal', MILK, 'en:milks');
  ins.run(code13(MIXED), 'Honey Oat Cereal', 'Honey Oat Cereal', 'Post', '12 oz', CEREAL, 'en:breakfast-cereals');
  rebuildFts(cat);
  rebuildCategoriesFromPaths(cat);
  cat.close();

  const prices = openPrices(pricesPath);
  let sku = 0;
  const day = (ago: number): string => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);
  const put = (code: string, seller: string, store: string, cents: number, ago: number): void =>
    recordObservation(prices, {
      code, seller, sellerSku: `SKU-${(sku += 1)}`, sellerName: 'item', sellerBrand: null, priceCents: cents, kind: 'regular',
      unitPriceCents: null, unitLabel: null, currency: 'USD', country: 'US', region: 'Ohio', joinMethod: 'gtin', seenOn: day(ago),
      url: null, imageUrl: null, inStock: null, storeName: store, storeCity: 'Cincinnati', basePriceCents: null,
    });
  for (const [i, c] of [349, 359, 339].entries()) put(code13(KROGER_ONLY), 'Kroger', `Kroger store ${i}`, c, 2 + i);
  put(code13(MIXED), 'Kroger', 'Kroger store 0', 399, 2);
  put(code13(MIXED), 'Safeway', 'Safeway store 0', 429, 3);
  put(code13(MIXED), 'Walmart', 'Walmart store 0', 379, 4);
  prices.close();
});
after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* a locked file on Windows */
  }
});

const sample = (): Sample => ({
  builtAt: '2026-11-22T00:00:00.000Z', seed: 7, zips: ['45202'], stores: [],
  items: [
    { code: code13(KROGER_ONLY), term: 'milk', krogerDescription: 'Kroger Whole Milk', brand: 'Kroger' },
    { code: code13(UNKNOWN), term: 'milk', krogerDescription: 'Mystery Milk', brand: null },
    { code: code13(MIXED), term: 'cereal', krogerDescription: 'Post Honey Oat', brand: 'Post' },
  ],
});

test('measure: per-term numbers, the Kroger-only flag, and the two inputs unchanged', async () => {
  const before = [sha(cataloguePath), sha(pricesPath)];
  const out = join(dir, 'out');
  const r = await measureSample({ sample: sample(), cataloguePath, pricesPath, outDir: out });
  assert.deepEqual(r.failures, []);
  const by = Object.fromEntries(r.items.map((i) => [i.code, i]));
  const k = by[code13(KROGER_ONLY)]!;
  const m = by[code13(MIXED)]!;
  const u = by[code13(UNKNOWN)]!;
  assert.deepEqual([k.error, m.error, u.error], [null, null, null]);
  assert.equal(k.named, true);
  assert.equal(k.range, true);
  assert.equal(k.rangeBasis, 'this_product');
  assert.equal(k.krogerOnly, true, 'every price behind the range is Kroger');
  assert.equal(m.named, true);
  assert.equal(m.range, true);
  assert.equal(m.rangeBasis, 'this_product');
  assert.equal(m.krogerOnly, false, 'another seller stands behind the range');
  assert.deepEqual(m.ownSellers, ['Kroger', 'Safeway', 'Walmart']);
  assert.equal(u.named, false);
  assert.equal(u.range, false);
  assert.equal(u.krogerOnly, null);

  const s = r.summary;
  assert.deepEqual(
    [s.overall.n, s.overall.named, s.overall.range, s.overall.rangeNotOnlyKroger, s.overall.rangeKrogerOnly],
    [3, 2, 2, 1, 1],
  );
  assert.deepEqual(
    [s.byTerm.milk!.n, s.byTerm.milk!.named, s.byTerm.milk!.range, s.byTerm.milk!.rangeNotOnlyKroger, s.byTerm.milk!.rangeKrogerOnly],
    [2, 1, 1, 0, 1],
  );
  assert.deepEqual(
    [s.byTerm.cereal!.n, s.byTerm.cereal!.named, s.byTerm.cereal!.range, s.byTerm.cereal!.rangeNotOnlyKroger, s.byTerm.cereal!.rangeKrogerOnly],
    [1, 1, 1, 1, 0],
  );
  assert.match(s.caveat, /over-represents Kroger/);
  assert.ok(existsSync(join(out, 'shelf-summary.json')) && existsSync(join(out, 'shelf-summary.txt')));
  assert.deepEqual([sha(cataloguePath), sha(pricesPath)], before, 'the catalogue and prices files are byte for byte unchanged');
});

test('summarise: a failed item is counted as an error, never as named or ranged', () => {
  const s = summarise([{ code: 'x', term: 't', named: false, range: false, rangeSource: null, rangeBasis: null, ownSellers: [], krogerOnly: null, error: 'boom' }], 'now');
  assert.deepEqual([s.overall.n, s.overall.named, s.overall.range, s.overall.errors], [1, 0, 0, 1]);
});

test('measure: a missing input file is refused before anything is read', async () => {
  const bad = join(dir, 'nope.db');
  writeFileSync(join(dir, 'empty.txt'), '');
  await assert.rejects(measureSample({ sample: sample(), cataloguePath: bad, pricesPath }), /not found/);
});
