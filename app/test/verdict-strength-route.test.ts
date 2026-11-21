/**
 * The app side of the verdict-strength fixes (review 2026-11-21; D-270 A7; functions, Coca-Cola 710 ml).
 *
 *  - A7: the Claude range's `unit` and `confidence` reach the verdict ladder (`onceAsk.askClaude`); they
 *    were dropped here, so a per-kg range was judged as the pack's own price.
 *  - Coca-Cola: when the shops sell a barcode as another pack than the catalogue's size (0067000104022,
 *    catalogue "710 ml", three Toronto shops list "6x710ml"), the answer names the pack it priced; it
 *    showed "710 ml" beside the 6-pack's $6.00 to $7.99.
 *
 * Red on the code before the fix. In-memory databases; the Claude ask is a stub.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../../price/src/store.ts';
import { answerBarcodeFromCatalogue, type BarcodeDeps } from '../src/catalogue-first.ts';
import { canonicalBarcode } from '../src/barcode.ts';
import { onceAsk } from '../src/distribution.ts';
import type { RangeAskResult } from '../../identify/src/range-ask.ts';

test('A7: the one Claude ask hands the ladder its unit and confidence', async () => {
  const result: RangeAskResult = {
    ok: true,
    range: { lowCents: 1000, highCents: 2000, currency: 'CAD', unit: 'per kg', confidence: 'low', askedAt: '2026-11-21T00:00:00.000Z', model: 'stub' },
    cached: false,
  };
  const once = onceAsk(async () => result)!;
  const got = await once.askClaude({ name: 'Beans', brand: null, size: '500 g', category: null, market: 'CA' });
  assert.equal(got.ok, true);
  assert.ok(got.ok);
  assert.equal(got.unit, 'per kg');
  assert.equal(got.confidence, 'low');
});

const COKE = '0067000104022';
let sku = 0;
function shop(store: string, cents: number, over: Partial<ObservationRow>): ObservationRow {
  sku += 1;
  return {
    code: COKE,
    seller: 'hammer',
    sellerSku: `h-${sku}`,
    sellerName: 'Coca-Cola',
    sellerBrand: null,
    priceCents: cents,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: 'ON',
    joinMethod: 'gtin',
    seenOn: '2026-11-14',
    url: null,
    imageUrl: null,
    inStock: null,
    storeName: store,
    storeCity: 'Toronto',
    ...over,
  };
}

async function scan(rows: ObservationRow[], shelfCents: number | null = null) {
  const prices = openPrices(':memory:');
  for (const r of rows) recordObservation(prices, r);
  const catalogue = new DatabaseSync(':memory:');
  catalogue.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT, brands TEXT, quantity TEXT,
    size_value REAL, size_unit TEXT, category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  catalogue.prepare('INSERT INTO product (code, name, brands, quantity, category_path, leaf_category) VALUES (?,?,?,?,?,?)').run(COKE, 'Coca-Cola', 'Coca-Cola', '710 ml', '["en:sweetened-beverages"]', 'en:sweetened-beverages');
  const row = { code: COKE, name: 'Coca-Cola', brands: 'Coca-Cola', quantity: '710 ml', leafCategory: 'en:sweetened-beverages', categoryPath: ['en:sweetened-beverages'] };
  const deps: BarcodeDeps = { lookup: { byGtin: () => row }, prices, catalogue, country: 'CA', currency: 'CAD', asOf: '2026-11-21', ...(shelfCents ? { shopper: { cents: shelfCents } } : {}) };
  return answerBarcodeFromCatalogue(canonicalBarcode(COKE)!, deps);
}

test('Coca-Cola 0067000104022: the shops sell it as 6 x 710 ml, so the answer names the 6-pack beside the 6-pack price', async () => {
  const { answer } = await scan([
    shop('Metro', 799, { sellerName: 'Coca-Cola 6x710ml' }),
    shop('No Frills', 600, { sellerName: 'Coca-Cola 6x710.0ml' }),
    shop('Loblaws', 799, { sellerName: 'Coca-Cola 6x710.0ml' }),
    shop('Walmart', 588, { parsedSize: '710 ml' }),
    shop('Save-On-Foods', 899, { parsedSize: '710 ml' }),
  ]);
  assert.ok(answer.range && answer.range.medianCents !== null && answer.range.medianCents >= 600, 'the range is the 6-pack price');
  assert.match(answer.identity?.size ?? '', /^6\s*x\s*710/i, `identity size ${answer.identity?.size}`);
  assert.match(answer.verdict?.scaledTo ?? '', /^6\s*x\s*710/i);
});

test('Coca-Cola, one 710 ml bottle in hand at $2.79: the answer is not the 6-pack price and never "Great price"', async () => {
  const { answer } = await scan(
    [
      shop('Metro', 799, { sellerName: 'Coca-Cola 6x710ml' }),
      shop('No Frills', 600, { sellerName: 'Coca-Cola 6x710.0ml' }),
      shop('Loblaws', 799, { sellerName: 'Coca-Cola 6x710.0ml' }),
      shop('Walmart', 588, { parsedSize: '710 ml' }),
      shop('Save-On-Foods', 899, { parsedSize: '710 ml' }),
    ],
    279,
  );
  assert.equal(answer.identity?.size, '710 ml');
  assert.ok(!(answer.range && answer.range.basis === 'this_product'), `range ${JSON.stringify(answer.range)} is the 6-pack's own prices`);
  if (answer.verdict) {
    assert.ok(answer.verdict.centreCents < 500, `verdict centre ${answer.verdict.centreCents}`);
    assert.equal(answer.verdict.confidence, 'low');
    assert.ok(!['great', 'good'].includes(answer.verdict.shopper?.zone ?? ''), `zone ${answer.verdict.shopper?.zone}`);
  }
});

test('control: a bottle most shops sell as one 710 ml bottle stays "710 ml", priced without the 6-pack listing', async () => {
  const { answer } = await scan([
    shop('Metro', 250, { sellerName: 'Coca-Cola 710ml' }),
    shop('No Frills', 275, { sellerName: 'Coca-Cola 710 ml' }),
    shop('Loblaws', 299, { sellerName: 'Coca-Cola 710ml' }),
    shop('Walmart', 799, { sellerName: 'Coca-Cola 6x710ml' }),
  ]);
  assert.equal(answer.identity?.size, '710 ml');
  assert.ok(answer.range && answer.range.highCents < 500, `range high ${answer.range?.highCents}`);
  assert.equal(answer.verdict?.centreCents, 275);
});
