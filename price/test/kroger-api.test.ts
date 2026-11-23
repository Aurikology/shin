/**
 * Kroger developer API importer (2026-11-22). Fixtures only: fetch is injected, no network, no real secrets.
 * Every response shape below is the documented one, NOT a captured one (see the header of src/kroger-api.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  KrogerClient, KrogerError, SELLER, barcodeOf, exitCodeFor, gs1Valid, newTally, parseCodeList, parseLocations,
  parseProducts, productIdsFor, rowsFor, runKroger, tokenRequest, validBarcode, type FetchLike, type KrogerLocation,
} from '../src/kroger-api.ts';
import { openPrices, recordAttempt, recordObservation } from '../src/store.ts';

const CODE_A = '0036000291452'; // UPC-A 036000291452, valid
const BODY_A = '0003600029145'; // "00" + 11-digit body, no check digit
const CODE_B = '4006381333931'; // EAN-13, valid
const FAKE_ID = 'test-client-id';
const FAKE_SECRET = 'test-client-secret';

const LOC: KrogerLocation = { locationId: '01400943', chain: 'RALPHS', name: 'Ralphs - Westwood', city: 'Los Angeles', state: 'CA', zip: '90024' };

const locationsBody = {
  data: [
    { locationId: '01400943', chain: 'RALPHS', name: 'Ralphs - Westwood', address: { addressLine1: '1 Main', city: 'Los Angeles', state: 'CA', zipCode: '90024' } },
    { locationId: '01400376', chain: 'RALPHS', name: 'Ralphs - Pico', address: { addressLine1: '2 Pico', city: 'Los Angeles', state: 'CA', zipCode: '90025' } },
    { locationId: '01400111', chain: 'FOOD4LESS', name: 'Food 4 Less', address: { city: 'Compton', state: 'CA', zipCode: '90220' } },
  ],
};

function product(over: Record<string, unknown> = {}, price: Record<string, unknown> = { regular: 3.49, promo: 0 }): any {
  return {
    productId: BODY_A, upc: CODE_A, brand: 'Brand', description: 'Test Cereal 12 oz',
    items: [{ itemId: '1', price, size: '12 oz', soldBy: 'UNIT' }], ...over,
  };
}

function json(status: number, body: unknown): Awaited<ReturnType<FetchLike>> {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

interface Seen { url: string; init: any }
/** A fake Kroger: token, locations, products. `products` maps a locationId to the answer (or a status). */
function fakeKroger(products: (url: URL) => Awaited<ReturnType<FetchLike>>, seen: Seen[] = []): FetchLike {
  return async (url, init) => {
    seen.push({ url, init });
    const u = new URL(url);
    if (u.pathname.endsWith('/oauth2/token')) return json(200, { access_token: 'fake-token', expires_in: 1800, token_type: 'bearer' });
    if (u.pathname.endsWith('/locations')) return json(200, locationsBody);
    if (u.pathname.endsWith('/products')) return products(u);
    return json(404, {});
  };
}

const client = (f: FetchLike) => new KrogerClient({ fetch: f, clientId: FAKE_ID, clientSecret: FAKE_SECRET, sleep: async () => {} });

function opts(f: FetchLike, over: Record<string, unknown> = {}): any {
  const rows: any[] = [];
  return {
    client: client(f), codes: [CODE_A, CODE_B], zips: ['90024'], storesPerZip: 1, idForm: 'both', maxCalls: 100,
    today: '2026-11-22', has: () => true, sink: (r: any) => rows.push(r), rows, ...over,
  };
}

test('token request: Basic header, scope, form body, and no secret in the URL', () => {
  const r = tokenRequest(FAKE_ID, FAKE_SECRET);
  assert.equal(r.url, 'https://api.kroger.com/v1/connect/oauth2/token');
  assert.equal(r.init.method, 'POST');
  assert.equal(r.init.headers.Authorization, `Basic ${Buffer.from(`${FAKE_ID}:${FAKE_SECRET}`).toString('base64')}`);
  assert.equal(r.init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(r.init.body, 'grant_type=client_credentials&scope=product.compact');
  assert.ok(!r.url.includes(FAKE_SECRET));
});

test('the client fetches a token once, sends it as Bearer, and never puts it in an error', async () => {
  const seen: Seen[] = [];
  const c = client(fakeKroger(() => json(500, {}), seen));
  await c.locations('90024', 2);
  await c.locations('60601', 2);
  assert.equal(seen.filter((s) => s.url.endsWith('/oauth2/token')).length, 1, 'token reused');
  const loc = seen.find((s) => s.url.includes('/locations'))!;
  assert.equal(loc.init.headers.Authorization, 'Bearer fake-token');
  assert.match(loc.url, /filter\.zipCode\.near=90024&filter\.limit=2$/);
  await assert.rejects(c.products([BODY_A], '1'), (e: any) => e instanceof KrogerError && !e.message.includes('fake-token') && !e.message.includes(FAKE_SECRET));
});

test('a rejected token request fails with an auth error that names no secret', async () => {
  const c = client(async () => json(401, { error: 'invalid_client' }));
  await assert.rejects(c.locations('90024', 1), (e: any) => e.kind === 'auth' && !e.message.includes(FAKE_SECRET) && !e.message.includes(FAKE_ID));
});

test('location parsing: id, chain, name, city, state, zip; rows with no id are dropped', () => {
  const l = parseLocations({ data: [...locationsBody.data, { chain: 'X' }, null] });
  assert.equal(l.length, 3);
  assert.deepEqual(l[0], LOC);
  assert.equal(l[2].name, 'Food 4 Less');
  assert.deepEqual(parseLocations({}), []);
});

test('product parsing: regular and promo prices, brand, description, stock', () => {
  const [p] = parseProducts({ data: [product({}, { regular: 4.99, promo: 3.99 })] });
  assert.equal(p.regular, 4.99);
  assert.equal(p.promo, 3.99);
  assert.equal(p.brand, 'Brand');
  assert.equal(p.description, 'Test Cereal 12 oz');
  assert.equal(p.inStock, null);
  const [q] = parseProducts({ data: [product({ items: [{ price: { regular: 1 }, inventory: { stockLevel: 'TEMPORARILY_OUT_OF_STOCK' } }] })] });
  assert.equal(q.inStock, 0);
  const [n] = parseProducts({ data: [product({ items: [] })] });
  assert.equal(n.regular, null);
});

test('productId conversion: gtin, body (UPC-A without its check digit), both, and EAN-13 has no body form', () => {
  assert.deepEqual(productIdsFor(CODE_A, 'gtin'), [CODE_A]);
  assert.deepEqual(productIdsFor(CODE_A, 'body'), [BODY_A]);
  assert.deepEqual(productIdsFor(CODE_A, 'both'), [CODE_A, BODY_A]);
  assert.deepEqual(productIdsFor(CODE_B, 'both'), [CODE_B]);
  assert.deepEqual(productIdsFor(CODE_B, 'body'), []);
  const asked = new Map([[BODY_A, CODE_A]]);
  assert.equal(barcodeOf({ productId: BODY_A, upc: null }, asked), CODE_A, 'matched by the id that was asked for');
  assert.equal(barcodeOf({ productId: 'zzz', upc: '036000291452' }, asked), CODE_A, 'falls back to a valid upc, canonicalised');
  assert.equal(barcodeOf({ productId: 'zzz', upc: '036000291453' }, asked), null, 'bad check digit');
});

test('barcode validity: GS1 check digit and canonical form', () => {
  assert.ok(gs1Valid(CODE_A) && gs1Valid(CODE_B));
  assert.ok(!gs1Valid('0036000291453'));
  assert.equal(validBarcode('036000291452'), CODE_A);
  assert.equal(validBarcode('036000291453'), null);
  const r = parseCodeList(`# comment\n${CODE_A}\n036000291452\n0036000291453\nabc\n${CODE_B} # trailing\n`);
  assert.deepEqual(r.codes, [CODE_A, CODE_B]);
  assert.deepEqual(r.invalid, ['0036000291453', 'abc']);
});

test('rows: regular only; sale makes a promotional row plus a #was regular row; stock stays NULL', () => {
  const t = newTally();
  const [plain] = rowsFor(parseProducts({ data: [product()] })[0], CODE_A, LOC, '2026-11-22', () => true, t)!;
  assert.equal(plain.priceCents, 349);
  assert.equal(plain.kind, 'regular');
  assert.equal(plain.sellerSku, `01400943:${BODY_A}`);
  assert.equal(plain.seller, SELLER);
  assert.equal(plain.currency, 'USD');
  assert.equal(plain.country, 'US');
  assert.equal(plain.region, 'CA');
  assert.equal(plain.storeName, 'Ralphs - Westwood');
  assert.equal(plain.storeCity, 'Los Angeles');
  assert.equal(plain.inStock, null);
  assert.equal(plain.code, CODE_A);
  const sale = rowsFor(parseProducts({ data: [product({}, { regular: 4.99, promo: 3.99 })] })[0], CODE_A, LOC, '2026-11-22', () => true, t)!;
  assert.equal(sale.length, 2);
  assert.deepEqual(sale.map((r) => [r.kind, r.priceCents]), [['promotional', 399], ['regular', 499]]);
  assert.equal(sale[0].wasCents, 499);
  assert.ok(sale[1].sellerSku.endsWith('#was'));
  const notLower = rowsFor(parseProducts({ data: [product({}, { regular: 2.99, promo: 2.99 })] })[0], CODE_A, LOC, '2026-11-22', () => true, t)!;
  assert.equal(notLower.length, 1, 'a promo that is not lower is not a sale');
  const unknown = rowsFor(parseProducts({ data: [product()] })[0], CODE_A, LOC, '2026-11-22', () => false, t)!;
  assert.equal(unknown[0].code, null);
  assert.equal(unknown[0].joinMethod, 'none');
  assert.equal(unknown[0].pageGtin, CODE_A);
});

test('a product with no price, a zero price or a missing currency writes nothing and is counted', () => {
  const t = newTally();
  const has = () => true;
  assert.equal(rowsFor(parseProducts({ data: [product({ items: [{ size: '1' }] })] })[0], CODE_A, LOC, 'd', has, t), null);
  assert.equal(rowsFor(parseProducts({ data: [product({}, { regular: 0 })] })[0], CODE_A, LOC, 'd', has, t), null);
  assert.equal(rowsFor(parseProducts({ data: [product({}, { regular: -1 })] })[0], CODE_A, LOC, 'd', has, t), null);
  assert.equal(rowsFor(parseProducts({ data: [product({}, { regular: 'x' })] })[0], CODE_A, LOC, 'd', has, t), null);
  assert.equal(rowsFor(parseProducts({ data: [product()] })[0], CODE_A, LOC, 'd', has, t, ''), null);
  assert.equal(t.skippedNoPrice, 2);
  assert.equal(t.skippedBadPrice, 2);
  assert.equal(t.skippedNoCurrency, 1);
});

test('a run asks both id forms per batch, writes priced rows, counts the unpriced and the unrequested', async () => {
  const seen: Seen[] = [];
  const f = fakeKroger((u) => {
    const ids = u.searchParams.get('filter.productId')!.split(',');
    assert.deepEqual(ids, [CODE_A, BODY_A, CODE_B]);
    assert.equal(u.searchParams.get('filter.locationId'), '01400943');
    return json(200, {
      data: [
        product(),
        product({ productId: CODE_B, upc: CODE_B, items: [{ itemId: '2' }] }),
        product({ productId: '0000000000001', upc: null }),
      ],
    });
  }, seen);
  const o = opts(f);
  const t = await runKroger(o);
  assert.equal(t.stopped, null);
  assert.equal(t.locations, 1, 'storesPerZip 1');
  assert.equal(t.productCalls, 1);
  assert.equal(o.rows.length, 1);
  assert.equal(t.skippedNoPrice, 1);
  assert.equal(t.skippedUnrequested, 1);
  assert.equal(exitCodeFor(t), 0);
});

test('rerunning the same day does not duplicate rows or attempts (temp prices.db)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kroger-'));
  try {
    const db = openPrices(join(dir, 'prices.db'));
    const f = fakeKroger(() => json(200, { data: [product({}, { regular: 4.99, promo: 3.99 })] }));
    const once = async () => {
      const o = opts(f, {
        codes: [CODE_A], storesPerZip: 2,
        sink: (r: any) => recordObservation(db, r),
        attempt: (c: string, outcome: any, note: any) => recordAttempt(db, c, SELLER, '2026-11-22', outcome, 1, note),
      });
      return runKroger(o);
    };
    const t1 = await once();
    const n1 = (db.prepare('SELECT COUNT(*) n FROM observation').get() as any).n;
    const a1 = (db.prepare('SELECT COUNT(*) n FROM crawl_attempt').get() as any).n;
    assert.equal(n1, 4, '2 stores x (promotional + #was)');
    assert.equal(t1.rows, 4);
    await once();
    assert.equal((db.prepare('SELECT COUNT(*) n FROM observation').get() as any).n, n1);
    assert.equal((db.prepare('SELECT COUNT(*) n FROM crawl_attempt').get() as any).n, a1);
    const r = db.prepare("SELECT * FROM observation WHERE kind = 'promotional' ORDER BY seller_sku").get() as any;
    assert.equal(r.price_cents, 399);
    assert.equal(r.seen_on, '2026-11-22');
    assert.equal(r.currency, 'USD');
    assert.equal(r.in_stock, null);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a barcode never priced is recorded no_candidates only when the run finished', async () => {
  const f = fakeKroger(() => json(200, { data: [] }));
  const got: string[] = [];
  const t = await runKroger(opts(f, { attempt: (c: string, o: string) => got.push(`${c}:${o}`) }));
  assert.deepEqual(got, [`${CODE_A}:no_candidates`, `${CODE_B}:no_candidates`]);
  assert.equal(t.stopped, null);
});

test('HTTP 429 stops the run, keeps no false "not found" attempts, and exits non-zero', async () => {
  const f = fakeKroger(() => json(429, {}));
  const got: string[] = [];
  const o = opts(f, { attempt: (c: string, out: string) => got.push(`${c}:${out}`) });
  const t = await runKroger(o);
  assert.match(t.stopped ?? '', /429/);
  assert.equal(exitCodeFor(t), 1);
  assert.deepEqual(got, [], 'nothing recorded as not found');
});

test('repeated 5xx stops the run after three tries, non-zero', async () => {
  let calls = 0;
  const f = fakeKroger(() => (calls++, json(503, {})));
  const t = await runKroger(opts(f));
  assert.equal(calls, 3);
  assert.match(t.stopped ?? '', /503/);
  assert.equal(exitCodeFor(t), 1);
});

test('a single 5xx is retried and the run carries on', async () => {
  let calls = 0;
  const f = fakeKroger(() => (calls++ === 0 ? json(500, {}) : json(200, { data: [product()] })));
  const t = await runKroger(opts(f));
  assert.equal(t.stopped, null);
  assert.equal(t.observations, 1);
});

test('--max-calls stops cleanly and says so', async () => {
  // 60 valid UPC-A codes, check digits computed: more than one batch of 25
  const many: string[] = [];
  for (let i = 0; i < 60; i++) {
    const body = String(10000000000 + i);
    let s = 0;
    for (let k = 0; k < 11; k++) s += Number(body[k]) * (k % 2 === 0 ? 3 : 1);
    many.push(validBarcode(body + String((10 - (s % 10)) % 10))!);
  }
  assert.ok(many.every(Boolean));
  const f = fakeKroger(() => json(200, { data: [] }));
  const t = await runKroger(opts(f, { codes: many, maxCalls: 1 }));
  assert.equal(t.productCalls, 1);
  assert.match(t.stopped ?? '', /--max-calls 1/);
  assert.equal(exitCodeFor(t), 0);
});
