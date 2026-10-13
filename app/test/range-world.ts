/**
 * The shared fixture for the range tests (requirements 3.1, 6.1, 6.3, 6.7): a seeded random
 * generator and a small in-memory world of prices and catalogue rows. Not a test file itself
 * (no `.test.` in the name), so `npm test` loads it only through the tests that import it.
 *
 * The world: a narrow leaf (8 cookies, $3.00 to $3.84, 300 g), a wide leaf (7 wines, $7.18 to
 * $142.49, the D-233 shape), one product with four prices of its own, and one product alone in a
 * department nothing is priced in. Every database is in memory.
 */
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../../price/src/store.ts';
import type * as cf from '../src/catalogue-first.ts';

/** mulberry32: small, seeded, the same sequence on every machine. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)]!;
}

export const AS_OF = '2026-09-30';
let sku = 0;
export function obs(over: Partial<ObservationRow>): ObservationRow {
  sku += 1;
  return {
    code: null, seller: 'bcldb', sellerSku: `sku-${sku}`, sellerName: 'Thing', sellerBrand: null, priceCents: 1000,
    kind: 'regular', unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: null,
    joinMethod: 'gtin', seenOn: '2026-09-20', url: null, imageUrl: null, inStock: null, ...over,
  };
}

export const COOKIES = ['en:snacks', 'en:biscuits', 'en:cookies'];
export const WINES = ['en:beverages', 'en:wines', 'en:red-wines'];
export const LONELY = ['en:cosmetics', 'en:lonely-things'];
export const OWN = '0626990000017';
export const LONELY_CODE = '0626990000024';
export const COOKIE_CODES = Array.from({ length: 8 }, (_, i) => `30000000000${i}`);
export const WINE_CODES = Array.from({ length: 7 }, (_, i) => `40000000000${i}`);

export interface World {
  readonly prices: DatabaseSync;
  readonly catalogue: DatabaseSync;
  readonly rows: readonly cf.CatalogueRow[];
}

export function buildWorld(): World {
  const prices = openPrices(':memory:');
  const catalogue = new DatabaseSync(':memory:');
  catalogue.exec(`CREATE TABLE product (
    code TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT, brands TEXT, quantity TEXT, size_value REAL, size_unit TEXT,
    category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT, source TEXT)`);
  const ins = catalogue.prepare(
    'INSERT INTO product (code, name, name_en, brands, quantity, size_value, size_unit, category_path, leaf_category, source) VALUES (?,?,?,?,?,?,?,?,?,?)',
  );
  const rows: cf.CatalogueRow[] = [];
  const add = (code: string, name: string, brand: string, qty: string, path: string[], source: string) => {
    ins.run(code, name, null, brand, qty, null, null, JSON.stringify(path), path[path.length - 1]!, source);
    rows.push({ code, name, brands: brand, quantity: qty, leafCategory: path[path.length - 1]!, categoryPath: path });
  };
  COOKIE_CODES.forEach((code, i) => {
    add(code, `Cookie ${i}`, `B${i}`, '300 g', COOKIES, 'openfoodfacts');
    recordObservation(prices, obs({ code, priceCents: 300 + i * 12, seller: `shop${i}` }));
  });
  const wide = [718, 1299, 2450, 3199, 4999, 8999, 14249];
  WINE_CODES.forEach((code, i) => {
    add(code, `Wine ${i}`, `W${i}`, '750 ml', WINES, 'openfoodfacts');
    recordObservation(prices, obs({ code, priceCents: wide[i]!, seller: `cellar${i}` }));
  });
  add(OWN, 'Sea Salt Cookies', 'Oreo', '300 g', COOKIES, 'openfoodfacts');
  [349, 359, 369, 379].forEach((c, i) => recordObservation(prices, obs({ code: OWN, priceCents: c, seller: `own${i}` })));
  add(LONELY_CODE, 'Lonely Balm', 'Nobody', '15 ml', LONELY, 'openbeautyfacts');
  return { prices, catalogue, rows };
}

/** A handle whose every read throws: the "source throwing" case for a database. */
export function throwingDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.close();
  return db;
}

export const SIZES = ['300 g', '750 ml', '', '   ', 'abc', '0 g', '-5 ml', '1e400 kg', '6 x', 'NaN L', '½ lb', '6 x 355 ml', '1 kg', '50 g', 'x'.repeat(300), null];
export const NAMES = ['Cheddar', 'Oreo Sea Salt Cookies', 'Red Wine', 'Mystery Thing', '', '   ', 'Vodka 750 ml', '🍪 cookies', 'y'.repeat(400)];
export const TAGS = [null, 'en:cookies', 'en:red-wines', 'en:unknown-thing', 'fr:biscuits-secs', '', 'en:lonely-things', '::'];
export const PATHS: readonly (readonly string[])[] = [[], COOKIES, WINES, LONELY, ['en:unknown-thing'], ['fr:boissons', 'fr:vins'], ['', '']];
export const EXTRA_CODES = ['0068100084245', '4006381333931', '012345678905', '9999999999994'];

/** Whole cents, 0 < low <= high, a currency string. */
export function rangeOk(range: cf.CatalogueRange | null): boolean {
  return (
    range !== null &&
    Number.isInteger(range.lowCents) &&
    Number.isInteger(range.highCents) &&
    range.lowCents > 0 &&
    range.lowCents <= range.highCents &&
    typeof range.currency === 'string'
  );
}
