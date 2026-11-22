/**
 * A small made-up catalogue and prices file that put at least one product in most scenarios of scenario-check.
 *
 *   node scripts/scenarios/fixture.mts <folder>      writes <folder>/catalogue.db and <folder>/prices.db
 *
 * Its own process on purpose: price/src/store.ts reads SHIN_PRICES when it is first imported, so a test that
 * imported it before the server started would pin the server to the wrong price file.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function withCheck(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return body + String((10 - (sum % 10)) % 10);
}

const MILK = '["en:dairies","en:milks"]';
const CHEESE = '["en:dairies","en:cheeses"]';
const SOUP = '["en:meals","en:soups"]';
const SPREAD = '["en:spreads","en:peanut-butters"]';
const COOKIE = '["en:snacks","en:biscuits-and-cakes"]';
const BUTTER = '["en:dairies","en:butters"]';
const EXOTIC = '["en:superfoods","en:exotic-powders"]';
const COLA = '["en:beverages","en:colas"]';

export interface FixtureProduct {
  key: string;
  code: string;
  name: string;
  brand: string;
  quantity: string;
  path: string;
  leaf: string;
  canada: number;
}

const p = (key: string, body: string, name: string, brand: string, quantity: string, path: string, leaf: string, canada = 1): FixtureProduct =>
  ({ key, code: withCheck(body), name, brand, quantity, path, leaf, canada });

export const PRODUCTS: FixtureProduct[] = [
  p('milkA', '062699002001', 'Whole Milk', 'Dairyco', '2 L', MILK, 'en:milks'),
  p('milkB', '062699002002', 'Skim Milk', 'Dairyco', '2 L', MILK, 'en:milks'),
  p('milkC', '062699002003', 'Chocolate Milk', 'Dairyco', '1 L', MILK, 'en:milks'),
  p('milkD', '062699002004', 'Lactose Free Milk', 'Dairyco', '1 L', MILK, 'en:milks'),
  p('milkUnpriced', '062699002005', 'Homo Milk', 'Farmco', '4 L', MILK, 'en:milks'),
  p('single', '062699003001', 'Smooth Peanut Butter', 'Skippy', '500 g', SPREAD, 'en:peanut-butters'),
  p('old', '062699004001', 'Tomato Soup', 'Campbell', '284 ml', SOUP, 'en:soups'),
  p('sale', '062699005001', 'Chocolate Sandwich Cookies', 'Nabisco', '154 g', COOKIE, 'en:biscuits-and-cakes'),
  p('matcher', '062699006001', 'Old Cheddar Cheese', 'Black Diamond', '400 g', CHEESE, 'en:cheeses'),
  p('unlinked', '062699007001', 'Salted Butter', 'Lactantia', '454 g', BUTTER, 'en:butters'),
  p('nothing', '062699008001', 'Dragon Fruit Powder', 'Exotica', '200 g', EXOTIC, 'en:exotic-powders'),
  p('nothing2', '062699008002', 'Maca Root Powder', 'Exotica', '250 g', EXOTIC, 'en:exotic-powders'),
  p('usd', '062699009001', 'Cola Classic', 'Pepsi', '355 ml', COLA, 'en:colas', 0),
  p('cadOnlyUs', '062699010001', 'Orange Juice', 'Tropicana', '1.54 L', '["en:beverages","en:fruit-juices"]', 'en:fruit-juices'),
];

export const PRICE_ONLY_CODE = withCheck('062699011001');

export async function buildFixture(dir: string): Promise<{ cataloguePath: string; pricesPath: string }> {
  const root = resolve(import.meta.dirname, '..', '..');
  process.env.SHIN_PRICES = join(dir, 'prices.db');
  const imp = (rel: string) => import(pathToFileURL(join(root, rel)).href);
  const { openCatalogue, rebuildFts } = await imp('catalogue/src/schema.ts');
  const { rebuildCategoriesFromPaths } = await imp('catalogue/test/helpers/path-taxonomy.ts');
  const { openPrices, recordObservation } = await imp('price/src/store.ts');
  mkdirSync(dir, { recursive: true });
  const cataloguePath = join(dir, 'catalogue.db');
  const pricesPath = join(dir, 'prices.db');
  for (const f of [cataloguePath, pricesPath]) for (const ext of ['', '-wal', '-shm']) rmSync(f + ext, { force: true });

  const cat = openCatalogue(cataloguePath);
  const ins = cat.prepare(`INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value, size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,NULL,?,?,NULL,NULL,?,?,'[]',?,'fixture')`);
  for (const x of PRODUCTS) ins.run(x.code, x.name, x.name, x.brand, x.quantity, x.path, x.leaf, x.canada);
  rebuildFts(cat);
  rebuildCategoriesFromPaths(cat);
  cat.close();

  const prices = openPrices(pricesPath);
  const day = (ago: number): string => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);
  let sku = 0;
  const put = (code: string | null, o: { cents: number; ago: number; seller?: string; kind?: string; currency?: string; join?: string; name?: string }): void =>
    recordObservation(prices, {
      code, seller: o.seller ?? 'shopA', sellerSku: `SKU-${(sku += 1)}`, sellerName: o.name ?? 'item', sellerBrand: null, priceCents: o.cents,
      kind: o.kind ?? 'regular', unitPriceCents: null, unitLabel: null, currency: o.currency ?? 'CAD', country: (o.currency ?? 'CAD') === 'USD' ? 'US' : 'CA',
      region: (o.currency ?? 'CAD') === 'USD' ? 'California' : 'British Columbia', joinMethod: o.join ?? (code ? 'gtin' : 'none'), seenOn: day(o.ago), url: null, imageUrl: null,
      inStock: null, storeName: `${o.seller ?? 'shopA'} store`, storeCity: 'Victoria', basePriceCents: null,
    });
  const key = (k: string): string => PRODUCTS.find((x) => x.key === k)!.code;
  for (const [k, cents] of [['milkA', 449], ['milkB', 429], ['milkC', 299], ['milkD', 549]] as const) {
    put(key(k), { cents, ago: 3, seller: 'shopA' });
    put(key(k), { cents: cents + 10, ago: 10, seller: 'shopB' });
    put(key(k), { cents: cents - 10, ago: 20, seller: 'shopC' });
  }
  put(key('single'), { cents: 599, ago: 12 });
  put(key('old'), { cents: 189, ago: 800 });
  put(key('sale'), { cents: 249, ago: 5, kind: 'promotional' });
  put(key('sale'), { cents: 229, ago: 15, kind: 'promotional', seller: 'shopB' });
  put(key('matcher'), { cents: 899, ago: 4, join: 'name' });
  put(key('matcher'), { cents: 929, ago: 9, join: 'name', seller: 'shopB' });
  put(key('matcher'), { cents: 879, ago: 14, join: 'name', seller: 'shopC' });
  put(null, { cents: 649, ago: 6, name: 'Salted Butter 454 g' });
  put(key('usd'), { cents: 199, ago: 5, currency: 'USD' });
  put(key('usd'), { cents: 219, ago: 8, currency: 'USD', seller: 'shopB' });
  put(key('cadOnlyUs'), { cents: 579, ago: 5 });
  put(key('cadOnlyUs'), { cents: 599, ago: 7, seller: 'shopB' });
  put(PRICE_ONLY_CODE, { cents: 399, ago: 4 });
  prices.close();
  return { cataloguePath, pricesPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) {
    process.stderr.write('usage: node scripts/scenarios/fixture.mts <folder>\n');
    process.exit(2);
  }
  const r = await buildFixture(resolve(dir));
  process.stdout.write(JSON.stringify(r) + '\n');
}
