/**
 * The kill switch (decision 2026-11-25, catalogue/src/source-rights.ts): SHIN_EXCLUDED_SOURCES removes
 * a named source's rows from every answer path, within a restart, and with nothing set every answer
 * is exactly what it was. Each case runs the same input with the switch on and off.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { priceRangeFor, clearRangeCache, type RangeInput } from '../src/range.ts';
import { clearEstimateCache, estimate, readCatalogue, type ClaudeAnswer } from '../src/estimate.ts';
import { observedPricesIn } from '../src/estimate-gate.ts';
import { resolveExcluded, setExcludedSourcesForTest, SOURCE_SWITCHES, isExcludedSeller, licensedOnlySql, sellerAllowedSql, excludedCatalogueSources } from '../../catalogue/src/source-rights.ts';

let restore: (() => void) | null = null;
const exclude = (spec: string) => {
  restore?.();
  restore = setExcludedSourcesForTest(spec);
  clearRangeCache();
  clearEstimateCache();
};
afterEach(() => {
  restore?.();
  restore = null;
  clearRangeCache();
  clearEstimateCache();
});

let sku = 0;
function obs(over: Partial<ObservationRow>): ObservationRow {
  sku += 1;
  return {
    code: null, seller: 'Walmart', sellerSku: `sku-${sku}`, sellerName: 'Thing', sellerBrand: null, priceCents: 500, kind: 'regular',
    unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: null, joinMethod: 'gtin', seenOn: '2026-09-20',
    url: null, imageUrl: null, inStock: null, ...over,
  };
}

const SELF = '0068100084245';
const PATH = ['en:dairies', 'en:cheeses', 'en:cheddar'];

/** Six products in one leaf category, each with one price; `seller` prices them, `source` is how the catalogue names them. */
function world(seller: string, source: string) {
  const prices = openPrices(':memory:');
  const catalogue = new DatabaseSync(':memory:');
  catalogue.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, quantity TEXT, size_value REAL, size_unit TEXT,
    category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT, source TEXT)`);
  const ins = catalogue.prepare('INSERT INTO product (code, name, quantity, size_value, size_unit, category_path, leaf_category, source) VALUES (?,?,?,?,?,?,?,?)');
  ins.run(SELF, 'Cheddar', '500 g', 500, 'g', JSON.stringify(PATH), 'en:cheddar', 'openfoodfacts');
  for (let i = 1; i <= 6; i++) {
    const code = String(1000 + i).padStart(13, '0');
    ins.run(code, 'other', '500 g', 500, 'g', JSON.stringify(PATH), 'en:cheddar', source);
    recordObservation(prices, obs({ code, seller, sellerSku: `p${i}`, priceCents: 400 + i * 50 }));
  }
  return { prices, catalogue };
}
const rangeInput = (): RangeInput => ({ barcode: SELF, size: '500 g', leafCategory: 'en:cheddar', categoryPath: PATH, asOf: '2026-09-27' });

test('the mapping table: one switch name covers the price seller and the catalogue source of a company', () => {
  assert.deepEqual(resolveExcluded('kroger'), { catalogue: ['kroger-names'], sellers: ['kroger', 'kroger-names'] });
  assert.deepEqual(resolveExcluded(' Hammer , kroger '), { catalogue: ['hammer', 'kroger-names'], sellers: ['hammer', 'kroger', 'kroger-names'] });
  assert.deepEqual(resolveExcluded(''), { catalogue: [], sellers: [] });
  assert.deepEqual(resolveExcluded(undefined), { catalogue: [], sellers: [] });
  assert.ok(Object.keys(SOURCE_SWITCHES).includes('openprices'));
  const warned: string[] = [];
  assert.deepEqual(resolveExcluded('newshop', (l) => warned.push(l)), { catalogue: ['newshop'], sellers: ['newshop'] });
  assert.equal(warned.length, 1, 'an unlisted name is applied as written and said so');
});

test('default: nothing is excluded and the SQL text is the text it always was', () => {
  assert.deepEqual([...excludedCatalogueSources()], []);
  assert.equal(isExcludedSeller('Kroger'), false);
  assert.equal(sellerAllowedSql(), '');
  assert.equal(licensedOnlySql(), "(source IS NULL OR source NOT IN ('returnit', 'consignaction'))");
});

test('a category priced only by Kroger rows gets a range with the switch off and none with kroger excluded', () => {
  clearRangeCache();
  const base = priceRangeFor(rangeInput(), world('Kroger', 'openfoodfacts'));
  assert.equal(base.basis, 'leaf_category', 'control: Kroger rows make a range');
  exclude('kroger');
  clearRangeCache();
  const off = priceRangeFor(rangeInput(), world('Kroger', 'openfoodfacts'));
  assert.equal(off.basis, 'none');
  // Another source's rows are untouched by the same switch.
  clearRangeCache();
  assert.equal(priceRangeFor(rangeInput(), world('Walmart', 'openfoodfacts')).basis, 'leaf_category');
});

test('a category whose products are all Kroger-only catalogue rows is not read from them', () => {
  clearRangeCache();
  assert.equal(priceRangeFor(rangeInput(), world('Walmart', 'kroger-names')).basis, 'leaf_category', 'control');
  exclude('kroger');
  clearRangeCache();
  assert.equal(priceRangeFor(rangeInput(), world('Walmart', 'kroger-names')).basis, 'none');
});

test('the catalogue read the estimate makes does not name a Kroger-only row, and still names another source', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE product (code TEXT, name TEXT, name_en TEXT, brands TEXT, quantity TEXT, size_value REAL, size_unit TEXT, category_path TEXT, leaf_category TEXT, source TEXT)');
  db.prepare('INSERT INTO product (code, name, source) VALUES (?,?,?)').run('0001111111128', 'Kroger Bread', 'kroger-names');
  db.prepare('INSERT INTO product (code, name, source) VALUES (?,?,?)').run('0001111111111', 'Plain Bread', 'openfoodfacts');
  const codes = ['0001111111128', '0001111111111'];
  assert.equal(readCatalogue(db, codes).size, 2, 'control');
  exclude('kroger');
  const out = readCatalogue(db, codes);
  assert.deepEqual([...out.values()].map((r) => r.name), ['Plain Bread']);
});

const noClaude = async (): Promise<ClaudeAnswer> => ({ ok: false, reason: 'threw' });
async function ownPriceBasis(seller: string): Promise<string> {
  clearEstimateCache();
  const prices = openPrices(':memory:');
  const catalogue = new DatabaseSync(':memory:');
  catalogue.exec('CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT, brands TEXT, quantity TEXT, size_value REAL, size_unit TEXT, category_path TEXT NOT NULL DEFAULT \'[]\', leaf_category TEXT, source TEXT)');
  catalogue.prepare('INSERT INTO product (code, name, name_en, source) VALUES (?,?,?,?)').run(SELF, 'Cheddar', 'Cheddar', 'openfoodfacts');
  for (const [i, p] of [[1, 640], [2, 660], [3, 650]] as const) recordObservation(prices, obs({ code: SELF, seller, sellerSku: `own${i}`, priceCents: p }));
  const r = await estimate({ barcode: SELF, asOf: '2026-09-30', currency: 'CAD', country: 'CA' }, null, { prices, catalogue, askClaude: noClaude });
  return r.trace.tried.find((t) => t.rung === 'own_prices')?.outcome ?? 'missing';
}

test('an item priced only by Kroger rows has no Kroger-based own-price rung once kroger is excluded', async () => {
  const on = await ownPriceBasis('Kroger');
  assert.notEqual(on, 'no_rows', 'control: the Kroger rows are seen when nothing is excluded');
  exclude('kroger');
  const off = await ownPriceBasis('Kroger');
  assert.notEqual(off, on, 'the rung no longer reads them');
  assert.match(off, /^(no_rows|too_few|missing)$/);
  // The same rows from a seller that is not excluded are read exactly as before.
  assert.equal(await ownPriceBasis('Walmart'), on);
});

test('the estimate gate does not count an excluded source\'s observations', () => {
  const { prices, catalogue } = world('Kroger', 'openfoodfacts');
  const before = observedPricesIn(prices, catalogue, 'en:cheddar');
  assert.ok(before >= 6);
  exclude('kroger');
  assert.equal(observedPricesIn(prices, catalogue, 'en:cheddar'), 0);
});

test('with nothing excluded an answer is identical to the answer with an empty setting', () => {
  clearRangeCache();
  const a = JSON.stringify(priceRangeFor(rangeInput(), world('Kroger', 'kroger-names')));
  exclude('');
  clearRangeCache();
  const b = JSON.stringify(priceRangeFor(rangeInput(), world('Kroger', 'kroger-names')));
  assert.equal(a, b);
  // An exclusion of a source that is absent from the data changes nothing either.
  exclude('usda,anbl');
  clearRangeCache();
  assert.equal(JSON.stringify(priceRangeFor(rangeInput(), world('Kroger', 'kroger-names'))), a);
});
