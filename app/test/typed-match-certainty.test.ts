/**
 * A typed name matched against store price rows is "sure" only when the words single out ONE product
 * and the size the shopper typed is the product's size.
 *
 * Found 2026-11-12 by the answer key on the real catalogue (2,000 products, results in the mailbox,
 * results/answer-key-2026-11-12): 30 typed asks came back as a DIFFERENT product with confidence high,
 * 132 with medium, all priced on that other product's own prices. Examples: "Coconut Milk 400 ml"
 * answered as Aroy-D's (the shopper named no brand, several brands carry the words);
 * "Bick's Sweet Green Relish 500ml" answered as the 375 ml jar (the store row printed no size, so the
 * typed size was never compared); "Tilda Jasmine Rice" answered as the 250 g bag beside a 907 g one.
 *
 * Cause: lookupOwnPrices returned the best-scoring row with no word on whether another product scored
 * the same, and typedIdentity called any whole-name match sure.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dir = mkdtempSync(join(tmpdir(), 'pexi-typed-certainty-'));
const pricesPath = join(dir, 'prices.db');

const { openPrices, recordObservation } = await import('../../price/src/store.ts');
const { lookupOwnPrices } = await import('../src/own-prices.ts');
const { typedIdentity } = await import('../src/catalogue-first.ts');

const db = openPrices(pricesPath);
let sku = 0;
const row = (code: string, name: string, brand: string | null, cents: number) =>
  recordObservation(db, {
    code,
    seller: 'openprices',
    sellerSku: `s-${++sku}`,
    sellerName: name,
    sellerBrand: brand,
    priceCents: cents,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: null,
    joinMethod: 'gtin',
    seenOn: '2026-11-01',
    url: null,
    imageUrl: null,
    inStock: null,
    storeName: 'No Frills',
    storeCity: 'Hamilton',
  });
// Two brands print the same words.
row('0016229001711', 'Coconut Milk 400 ml', 'Aroy-D', 229);
row('0055270876060', 'Coconut Milk 400 ml', 'Thai Kitchen', 349);
// One brand, one product, its store row printing no size.
row('0056595004770', "Bick's Sweet Green Relish", "Bick's", 399);
// One brand, two sizes.
row('0725299931179', 'Tilda Jasmine Rice 250g', 'Tilda', 349);
row('0725299931209', 'Tilda Jasmine Rice 907g', 'Tilda', 899);
// One product only: the control, still sure.
row('0062600000017', 'Peaches & Cream Corn 341 ml', 'Farmstand', 199);
db.close();

after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked. */
  }
});

const sure = (text: string) => {
  const match = lookupOwnPrices(text, { pricesDbPath: pricesPath }).match;
  return { match, grade: typedIdentity(text, [], null, match).grade };
};

test('two brands carry the typed words: a guess, not either brand', () => {
  const r = sure('Coconut Milk 400 ml');
  assert.ok(r.match, 'the words still find prices');
  assert.equal(r.grade, 'guess');
});

test('the shopper typed a size the store row cannot confirm: a guess', () => {
  const r = sure("Bick's Sweet Green Relish 500ml");
  assert.equal(r.grade, 'guess');
});

test('one brand in two sizes and no size typed: a guess', () => {
  const r = sure('Tilda Jasmine Rice');
  assert.equal(r.grade, 'guess');
});

test('the words name one product of one size: still sure', () => {
  const r = sure('Farmstand Peaches & Cream Corn 341 ml');
  assert.ok(r.match);
  assert.equal(r.match.code, '0062600000017');
  assert.equal(r.grade, 'sure');
});

test('one size typed among two: sure, and the right size', () => {
  const r = sure('Tilda Jasmine Rice 907g');
  assert.ok(r.match);
  assert.equal(r.match.code, '0725299931209');
  assert.equal(r.grade, 'sure');
});
