/**
 * A synthetic market with a known truth, built through price/src/store.ts's own
 * `openPrices` and `recordObservation` so it has the live table's shape.
 *
 * 3 leaf categories under one parent, 10 products each, every product priced at
 * 4 shops on two dates (older 2026-08-01, newer 2026-09-15). Within a product
 * the shops agree to within 11%; across products in a category prices climb
 * 25% a step, so a category is several times wider than any one product.
 * Seller A also marks each product on sale at 70% on 2026-09-16. Shop B spells
 * barcodes with a leading 0 (EAN-13), the others as stored in the catalogue.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guardSealed, type GitOps, type SealGuard } from '../src/sealed.ts';
import { openPrices, recordObservation, type ObservationRow } from '../../price/src/store.ts';

export const OLD = '2026-08-01';
export const NEW = '2026-09-15';
export const SALE_DAY = '2026-09-16';
export const SHOPS = [
  { seller: 'A', factor: 1.0 },
  { seller: 'B', factor: 1.05 },
  { seller: 'C', factor: 0.97 },
  { seller: 'D', factor: 1.08 },
] as const;
export const LEAVES = [
  { tag: 'en:leaf-a', base: 300 },
  { tag: 'en:leaf-b', base: 800 },
  { tag: 'en:leaf-c', base: 2000 },
] as const;
export const PARENT = 'en:root';
export const PER_LEAF = 10;

export interface FixtureProduct {
  readonly code: string;
  readonly leaf: string;
  readonly base: number;
}

export function products(): FixtureProduct[] {
  const out: FixtureProduct[] = [];
  LEAVES.forEach((l, li) => {
    for (let j = 0; j < PER_LEAF; j++) {
      out.push({ code: `77${String(li)}${String(j).padStart(10, '0')}`, leaf: l.tag, base: Math.round(l.base * (1 + 0.25 * j)) });
    }
  });
  return out;
}

function row(over: Partial<ObservationRow> & Pick<ObservationRow, 'seller' | 'sellerSku' | 'priceCents' | 'seenOn'>): ObservationRow {
  return {
    code: null,
    sellerName: 'item',
    sellerBrand: null,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: null,
    joinMethod: 'gtin',
    url: null,
    imageUrl: null,
    inStock: null,
    ...over,
  };
}

export interface FixtureOptions {
  /** Extra rows, e.g. a planted wrong price. */
  readonly extra?: readonly ObservationRow[];
  readonly withSales?: boolean;
}

export function pricesDb(opts: FixtureOptions = {}): DatabaseSync {
  const db = openPrices(':memory:');
  for (const p of products()) {
    for (const s of SHOPS) {
      const sku = `${s.seller}-${p.code}`;
      // Shop B spells every barcode as EAN-13 (a leading 0): the key must still be one product.
      const code = s.seller === 'B' ? '0' + p.code : p.code;
      recordObservation(db, row({ code, seller: s.seller, sellerSku: sku, priceCents: Math.round(p.base * s.factor), seenOn: OLD }));
      recordObservation(db, row({ code, seller: s.seller, sellerSku: sku, priceCents: Math.round(p.base * s.factor * 1.01), seenOn: NEW }));
    }
    if (opts.withSales !== false) {
      recordObservation(db, row({ code: p.code, seller: 'A', sellerSku: `A-${p.code}`, priceCents: Math.round(p.base * 0.7), seenOn: SALE_DAY, kind: 'promotional' }));
    }
  }
  for (const r of opts.extra ?? []) recordObservation(db, r);
  return db;
}

export function catalogueDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE product (
    code TEXT PRIMARY KEY, name TEXT NOT NULL, quantity TEXT, size_value REAL, size_unit TEXT,
    category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  const ins = db.prepare('INSERT INTO product (code, name, quantity, size_value, size_unit, category_path, leaf_category) VALUES (?,?,?,?,?,?,?)');
  for (const p of products()) ins.run(p.code, `item ${p.code}`, '500 g', 500, 'g', JSON.stringify([PARENT, p.leaf]), p.leaf);
  return db;
}

export { row as fixtureRow };

/** A real guard for a temp path where no sealed batch exists (never the repo's bench/sealed). */
export function noSealed(): SealGuard {
  const path = join(mkdtempSync(join(tmpdir(), 'bench-nosealed-')), 'sealed.json');
  return guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT });
}

/** Git answers for a temp directory: no history, files committed and clean. Tests override single answers. */
export const FAKE_GIT: GitOps = { history: () => 'never', openedInHistory: () => false, status: () => 'clean' };
