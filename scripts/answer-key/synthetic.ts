/**
 * A small made-up catalogue for the answer-key test: the shapes that went wrong live on 2026-11-11
 * (milk / 2% milk / coconut milk, Kraft Dinner box / 12-pack, see app/test/wrong-product-answers.test.ts)
 * plus more near-duplicate pairs. Everything is in memory except the prices file, which is written
 * into the folder the caller names.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { REPO_ROOT } from './server.ts';

export function withCheck(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return body + String((10 - (sum % 10)) % 10);
}

export interface SyntheticRow {
  code: string;
  name: string;
  brand: string;
  quantity: string;
  sizeValue: number;
  sizeUnit: string;
  path: string;
  leaf: string;
  /** Shelf prices (cents) to write into the prices file; empty means unpriced. */
  prices: number[];
}

const MILK_PATH = '["en:dairies","en:milks"]';
const PLANT_PATH = '["en:beverages","en:plant-milks"]';
const PASTA_PATH = '["en:meals","en:macaroni-and-cheese"]';
const SPREAD_PATH = '["en:spreads","en:peanut-butters"]';
const JUICE_PATH = '["en:beverages","en:fruit-juices"]';
const SOUP_PATH = '["en:meals","en:soups"]';
const CHEESE_PATH = '["en:dairies","en:cheeses"]';


export const SYNTHETIC_ROWS: SyntheticRow[] = [
  // The live shapes of 2026-11-11. Only the wrong products carry prices, as in wrong-product-answers.test.ts.
  { code: withCheck('062699002001'), name: 'Milk', brand: 'Dairyco', quantity: '2 L', sizeValue: 2000, sizeUnit: 'ml', path: MILK_PATH, leaf: 'en:milks', prices: [] },
  { code: withCheck('062699002002'), name: '2% Milk', brand: 'Farmco', quantity: '4 L', sizeValue: 4000, sizeUnit: 'ml', path: MILK_PATH, leaf: 'en:milks', prices: [] },
  { code: withCheck('062699002003'), name: 'Coconut Milk', brand: 'Palmco', quantity: '400 ml', sizeValue: 400, sizeUnit: 'ml', path: PLANT_PATH, leaf: 'en:plant-milks', prices: [299, 299, 299] },
  { code: withCheck('062699002010'), name: 'Kraft Dinner Original', brand: 'Kraft', quantity: '225 g', sizeValue: 225, sizeUnit: 'g', path: PASTA_PATH, leaf: 'en:macaroni-and-cheese', prices: [] },
  { code: withCheck('062699002011'), name: 'Kraft Dinner 12 Pack', brand: 'Kraft', quantity: '12 x 225 g', sizeValue: 2700, sizeUnit: 'g', path: PASTA_PATH, leaf: 'en:macaroni-and-cheese', prices: [1399, 1399, 1399] },
  // More near-duplicate pairs.
  { code: withCheck('062699003001'), name: 'Peanut Butter Creamy', brand: 'Skippy', quantity: '500 g', sizeValue: 500, sizeUnit: 'g', path: SPREAD_PATH, leaf: 'en:peanut-butters', prices: [] },
  { code: withCheck('062699003002'), name: 'Peanut Butter Crunchy', brand: 'Skippy', quantity: '500 g', sizeValue: 500, sizeUnit: 'g', path: SPREAD_PATH, leaf: 'en:peanut-butters', prices: [599, 599, 649] },
  { code: withCheck('062699003003'), name: 'Orange Juice', brand: 'Tropicana', quantity: '1.75 L', sizeValue: 1750, sizeUnit: 'ml', path: JUICE_PATH, leaf: 'en:fruit-juices', prices: [] },
  { code: withCheck('062699003004'), name: 'Orange Juice Pulp Free', brand: 'Tropicana', quantity: '2.63 L', sizeValue: 2630, sizeUnit: 'ml', path: JUICE_PATH, leaf: 'en:fruit-juices', prices: [549, 549, 599] },
  { code: withCheck('062699003005'), name: 'Tomato Soup', brand: 'Campbell', quantity: '284 ml', sizeValue: 284, sizeUnit: 'ml', path: SOUP_PATH, leaf: 'en:soups', prices: [] },
  { code: withCheck('062699003006'), name: 'Tomato Soup Family Size', brand: 'Campbell', quantity: '540 ml', sizeValue: 540, sizeUnit: 'ml', path: SOUP_PATH, leaf: 'en:soups', prices: [249, 249, 279] },
  { code: withCheck('062699003007'), name: 'Old Cheddar Cheese', brand: 'Black Diamond', quantity: '270 g', sizeValue: 270, sizeUnit: 'g', path: CHEESE_PATH, leaf: 'en:cheeses', prices: [] },
  { code: withCheck('062699003008'), name: 'Old Cheddar Cheese Block 1 kg', brand: 'Black Diamond', quantity: '1 kg', sizeValue: 1000, sizeUnit: 'g', path: CHEESE_PATH, leaf: 'en:cheeses', prices: [1299, 1299, 1399] },
];

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

export interface Synthetic {
  readonly catalogue: unknown;
  readonly db: DatabaseSync;
  readonly pricesPath: string;
}

/** Builds the in-memory catalogue and writes the prices file into `dir`. */
export async function buildSynthetic(dir: string, rows: readonly SyntheticRow[] = SYNTHETIC_ROWS): Promise<Synthetic> {
  const imp = (p: string) => import(pathToFileURL(join(REPO_ROOT, p)).href);
  const { openCatalogue, rebuildFts } = await imp('catalogue/src/schema.ts');
  const { rebuildCategoriesFromPaths } = await imp('catalogue/test/helpers/path-taxonomy.ts');
  const { Catalogue } = await imp('catalogue/src/search.ts');
  const { openPrices, recordObservation } = await imp('price/src/store.ts');

  const db = openCatalogue(':memory:') as DatabaseSync;
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,NULL,?,?,?,?,?,?,'[]',1,'test')`);
  for (const r of rows) insert.run(r.code, r.name, r.name, r.brand, r.quantity, r.sizeValue, r.sizeUnit, r.path, r.leaf);
  rebuildFts(db);
  rebuildCategoriesFromPaths(db);
  const catalogue = new Catalogue(db, NO_EMBEDDER);

  const pricesPath = join(dir, 'prices.db');
  const prices = openPrices(pricesPath);
  const today = new Date().toISOString().slice(0, 10);
  let sku = 0;
  for (const r of rows) {
    r.prices.forEach((cents, i) =>
      recordObservation(prices, {
        code: r.code,
        seller: `shop${i}`,
        sellerSku: `SKU-${(sku += 1)}`,
        sellerName: `${r.name} ${r.quantity}`,
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
  }
  prices.close();
  return { catalogue, db, pricesPath };
}
