/**
 * Gaps 54 and 67 through the real route: a server attached to a real (fixture) catalogue file
 * starts its search pool and its barcode threads, and `/api/identify?gtin=` answers from a barcode
 * thread with exactly the body it gives when the same scan is answered on the request thread.
 * A barcode thread that dies while scans are in flight costs no scan and does not stop the server.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-barcode-threads-route-'));
const cataloguePath = join(dir, 'catalogue.db');
const pricesPath = join(dir, 'prices.db');
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_DATA_DIR = join(dir, 'data');
process.env.SHIN_CATALOGUE = cataloguePath;
process.env.SHIN_PRICES = pricesPath;
process.env.SHIN_RANGE_ASK_STORE_PATH = join(dir, 'range-ask.json');
process.env.SHIN_WORKER_THREADS = '2';
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_CATALOGUE_FIRST;
delete process.env.SHIN_FREE_SCANS_PER_WEEK;

const OWN = '0048500001233';
const LEAF_ONLY = '0048500001240';
const OJ = ['en:beverages', 'en:juices', 'en:orange-juices'];
const JUICE = ['en:beverages', 'en:juices'];
{
  const { openCatalogue, rebuildFts } = await import('../../catalogue/src/schema.ts');
  const { rebuildCategoriesFromPaths } = await import('../../catalogue/test/helpers/path-taxonomy.ts');
  const { openPrices, recordObservation } = await import('../../price/src/store.ts');
  const db = openCatalogue(cataloguePath);
  const ins = db.prepare(`INSERT INTO product (code, name, name_en, brands, quantity, size_value, size_unit, category_path,
    leaf_category, allergens, sold_in_canada, source) VALUES (?,?,?,?,?,?,?,?,?,'[]',1,'test')`);
  ins.run(OWN, 'Orange Juice No Pulp', 'Orange Juice No Pulp', 'Tropicana', '1.54 L', 1540, 'ml', JSON.stringify(OJ), 'en:orange-juices');
  ins.run(LEAF_ONLY, 'Orange Juice Pulp', 'Orange Juice Pulp', 'Tropicana', '1.54 L', 1540, 'ml', JSON.stringify(OJ), 'en:orange-juices');
  for (let i = 0; i < 12; i += 1) {
    ins.run(String(4850000100 + i).padStart(13, '0'), `Juice ${i}`, `Juice ${i}`, 'Oasis', '1.75 L', 1750, 'ml', JSON.stringify(i < 2 ? OJ : JUICE), i < 2 ? 'en:orange-juices' : 'en:juices');
  }
  rebuildFts(db);
  rebuildCategoriesFromPaths(db);
  db.close();
  const p = openPrices(pricesPath);
  const seen = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
  const obs = (code: string, cents: number, seller: string) => ({
    code, seller, sellerSku: `${seller}-${code}`, sellerName: 'x', sellerBrand: null, priceCents: cents, kind: 'regular' as const,
    unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: null, joinMethod: 'gtin' as const,
    seenOn: seen, url: null, imageUrl: null, inStock: null,
  });
  [449, 499, 529, 549].forEach((c, i) => recordObservation(p, obs(OWN, c, `shop${i}`)));
  for (let i = 0; i < 12; i += 1) recordObservation(p, obs(String(4850000100 + i).padStart(13, '0'), 400 + i * 3, `shop${i % 5}`));
  p.close();
}

const { server, setCatalogueFirstForTests, barcodePoolForTests, closeWorkerThreadsForTests } = await import('../server.ts');

let base = '';
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // The catalogue attaches after the port opens.
  for (let i = 0; i < 100 && !barcodePoolForTests(); i += 1) await new Promise((r) => setTimeout(r, 50));
});

after(async () => {
  setCatalogueFirstForTests(null);
  await closeWorkerThreadsForTests();
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite files locked; the OS will take them. */
  }
});

async function identify(gtin: string, device = 'threads-test'): Promise<Record<string, unknown>> {
  const r = await fetch(`${base}/api/identify?gtin=${gtin}&deviceId=${device}&countryCode=CA&shelfPriceCents=499`);
  assert.equal(r.status, 200);
  return (await r.json()) as Record<string, unknown>;
}

/** The body without what differs between any two scans: the time taken and the scan row's id. */
function steady(body: Record<string, unknown>): Record<string, unknown> {
  const { ms: _ms, scanId: _scanId, ...rest } = body;
  return rest;
}

test('the server started its barcode threads with the catalogue', () => {
  const pool = barcodePoolForTests();
  assert.ok(pool, 'the barcode pool started');
  assert.equal(pool.threads(), 2);
});

test('a barcode scan answered on a barcode thread is the body the request thread gives', async () => {
  const pool = barcodePoolForTests()!;
  for (const code of [OWN, LEAF_ONLY]) {
    let used = 0;
    const real = pool.answer;
    pool.answer = (job, calls) => {
      used += 1;
      return real(job, calls);
    };
    let threaded: Record<string, unknown>;
    try {
      // A device of its own per scan: the shelf price a device gives is kept once a day, which is not what is compared.
      threaded = await identify(code, `threads-a-${code}`);
    } finally {
      pool.answer = real;
    }
    assert.equal(used, 1, `${code} went to a barcode thread`);
    // Any test seam keeps the scan on the request thread; this one changes nothing else (no Claude without the header).
    setCatalogueFirstForTests({ requireClaudeConsent: true });
    let here: Record<string, unknown>;
    try {
      here = await identify(code, `threads-b-${code}`);
    } finally {
      setCatalogueFirstForTests(null);
    }
    assert.equal((threaded.identity as { barcode?: string } | undefined)?.barcode, code, 'a catalogue hit, named');
    assert.deepEqual(steady(threaded), steady(here), `${code}: the same answer either way`);
  }
});

test('a barcode thread that dies while scans are in flight costs no scan and the server keeps answering', async () => {
  const pool = barcodePoolForTests()!;
  const scans = Array.from({ length: 24 }, (_, i) => identify(i % 2 ? OWN : LEAF_ONLY, `threads-crash-${i}`));
  await pool.crashOneForTests();
  const bodies = await Promise.all(scans);
  for (const b of bodies) assert.equal((b.identity as { barcode?: string } | undefined)?.barcode !== undefined, true, 'every scan named its product');
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  for (let i = 0; i < 50 && pool.threads() < 2; i += 1) await new Promise((r) => setTimeout(r, 50));
  assert.equal(pool.threads(), 2, 'the dead thread was replaced');
});

test('typed search answers through the search pool', async () => {
  const r = await fetch(`${base}/api/search?q=${encodeURIComponent('orange juice')}&limit=3`);
  assert.equal(r.status, 200);
  const body = (await r.json()) as { catalogueUp: boolean; candidates: { code: string }[] };
  assert.equal(body.catalogueUp, true);
  assert.ok(body.candidates.length > 0, 'it found the juices');
});
