/**
 * The real server on a temp folder, for the customer-data requirements
 * (docs/price-category-requirements-2026-10-01.md 3.9, 5.1, 5.6, 5.9).
 *
 * Not a test file (no `.test.` in the name, so `npm test` does not run it on
 * its own). Each test file that uses it runs in its own process, so the env set
 * here is that process's alone. Every path is inside a fresh temp folder; no
 * real data folder is opened.
 *
 * The fixture is the typed-barcode parity fixture's shape, cut down: one sized
 * product in a category of five priced siblings, so a barcode and a typed name
 * both get a verdict from Pexi's own prices and no model is called.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import type { AddressInfo } from 'node:net';

export function withCheck(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return body + String((10 - (sum % 10)) % 10);
}

export const TATERS = withCheck('062699001001');
export const FRIES = ['062699001010', '062699001011', '062699001012', '062699001013', '062699001014'].map(withCheck);
export const TATERS_TEXT = "McCain Tasti Tater's 800g";

export interface Harness {
  readonly dir: string;
  readonly scansPath: string;
  readonly accessLogPath: string;
  get(path: string): Promise<Record<string, any>>;
  post(path: string, body: unknown): Promise<{ status: number; body: Record<string, any> }>;
  /** Read-only rows straight from the scan database file. */
  rows<T = Record<string, unknown>>(sql: string, ...args: (string | number | null)[]): T[];
  close(): Promise<void>;
}

export async function startHarness(prefix: string): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), `shin-${prefix}-`));
  const scansPath = join(dir, 'scans.db');
  const accessLogPath = join(dir, 'access.log');
  process.env.SHIN_SCANS = scansPath;
  process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
  process.env.SHIN_GAPS = join(dir, 'gaps.db');
  process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
  process.env.SHIN_PHOTOS = join(dir, 'photos');
  process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
  process.env.SHIN_PRICES = join(dir, 'prices.db');
  process.env.SHIN_RANGE_ASK_STORE_PATH = join(dir, 'range-ask.json');
  process.env.SHIN_ACCESS_LOG = accessLogPath;
  process.env.PORT = '0';
  process.env.SHIN_CATALOGUE_FIRST = '1';
  delete process.env.SHIN_INVITE_CODE;
  delete process.env.SHIN_RANGE_ASK_MONTHLY_CAP;
  delete process.env.SHIN_RANGE_ASK_CEILING_CENTS;
  delete process.env.SHIN_FREE_SCANS_PER_WEEK;
  process.env.GEMINI_API_KEY = 'test-key-never-sent';

  const FRIES_PATH = '["en:frozen-foods","en:frozen-fried-potatoes"]';
  const { openCatalogue, rebuildFts } = await import('../../catalogue/src/schema.ts');
  const { rebuildCategoriesFromPaths } = await import('../../catalogue/test/helpers/path-taxonomy.ts');
  const { Catalogue } = await import('../../catalogue/src/search.ts');
  const catDb = openCatalogue(':memory:');
  const insert = catDb.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,NULL,?,?,?,?,?,?,'[]',1,'test')`);
  insert.run(TATERS, "Tasti Tater's", "Tasti Tater's", 'McCain', '800g', 800, 'g', FRIES_PATH, 'en:frozen-fried-potatoes');
  FRIES.forEach((code, i) =>
    insert.run(code, `Crinkle Fries Number ${i}`, `Crinkle Fries Number ${i}`, `Frost${i}`, '750 g', 750, 'g', FRIES_PATH, 'en:frozen-fried-potatoes'),
  );
  rebuildFts(catDb);
  rebuildCategoriesFromPaths(catDb);
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
  const prices = openPrices(process.env.SHIN_PRICES!);
  [350, 420, 480, 550, 690].forEach((cents, i) =>
    recordObservation(prices, {
      code: FRIES[i]!,
      seller: `shop${i}`,
      sellerSku: `SKU-${i}`,
      sellerName: 'Item',
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
      storeName: `shop${i} store`,
      storeCity: 'Victoria',
      basePriceCents: null,
    }),
  );
  prices.close();

  const { server, setCatalogueForTests, setCatalogueFirstForTests } = await import('../server.ts');
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setCatalogueForTests(catalogue);
  setCatalogueFirstForTests({ searcher: catalogue, db: catDb, rangeAskProvider: null as never });

  return {
    dir,
    scansPath,
    accessLogPath,
    async get(path) {
      const r = await fetch(`${base}${path}`);
      assert.equal(r.status, 200, `${path} answered ${r.status}`);
      return (await r.json()) as Record<string, any>;
    },
    async post(path, body) {
      const r = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: (await r.json()) as Record<string, any> };
    },
    rows<T>(sql: string, ...args: (string | number | null)[]): T[] {
      const db = new DatabaseSync(scansPath, { readOnly: true });
      try {
        return db.prepare(sql).all(...args) as T[];
      } finally {
        db.close();
      }
    },
    async close() {
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
    },
  };
}
