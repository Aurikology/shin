/**
 * D-267 (bug sweep 2026-11-11): a price whose barcode was attached by matching the shop's product
 * NAME may belong to another product with a similar name. Such rows stay in every pool (RULINGS
 * 2026-09-28: the range uses every data point), but for one product they are its own prices only
 * when no row joined by the barcode itself exists, and alone they never make the answer "Certain".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { estimate, type EstimateItem } from '../src/estimate.ts';
import type { ClaudeAnswer } from '../src/claude.ts';

const SELF = '0068100084245';
const AS_OF = '2026-09-30';

let sku = 0;
function obs(over: Partial<ObservationRow>): ObservationRow {
  sku += 1;
  return {
    code: SELF,
    seller: 'shop',
    sellerSku: `sku-${sku}`,
    sellerName: 'Smooth Peanut Butter 1 kg',
    sellerBrand: null,
    priceCents: 700,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: null,
    joinMethod: 'gtin',
    seenOn: '2026-09-20',
    url: null,
    imageUrl: null,
    inStock: null,
    ...over,
  };
}

function pricesDb(rows: readonly ObservationRow[]) {
  const db = openPrices(':memory:');
  for (const r of rows) recordObservation(db, r);
  return db;
}

const item: EstimateItem = { barcode: SELF, asOf: AS_OF, currency: 'CAD', country: 'CA' };
const noClaude = async (): Promise<ClaudeAnswer> => {
  throw new Error('the Claude rung must not be reached here');
};

test('D-267: a name-joined row is not an own price when barcode-joined rows exist', async () => {
  const byBarcode = [0, 1, 2].map((i) => obs({ priceCents: 700, seller: `b${i}` }));
  // A different product with a similar name, joined to this barcode by name: three times the price.
  const byName = obs({ priceCents: 2100, seller: 'n0', joinMethod: 'name', sellerName: 'Smooth Peanut Butter 3 kg pail' });
  const { verdict } = await estimate(item, null, { prices: pricesDb([...byBarcode, byName]), askClaude: noClaude });
  assert.equal(verdict.basis, 'own_prices');
  assert.deepEqual(verdict.dots.map((d) => d.cents), [700, 700, 700], 'the name-joined $21 row is neither a dot nor in the centre');
  assert.equal(verdict.centreCents, 700);
});

test('D-267: a name-joined row that agrees with the barcode-joined rows still counts (live peanut butter case)', async () => {
  // Live 2026-11-11: Metro and Save-On joined by barcode at $8.49; No Frills, Walmart and others joined by
  // name at $5.97 to $7.99 for the same jar. Dropping them moved the typical price above every price seen.
  const byBarcode = [0, 1].map((i) => obs({ priceCents: 849, seller: `b${i}` }));
  const byName = [597, 599, 699, 799].map((c, i) => obs({ priceCents: c, seller: `n${i}`, joinMethod: 'name' }));
  const { verdict } = await estimate(item, null, { prices: pricesDb([...byBarcode, ...byName]), askClaude: noClaude });
  assert.deepEqual(verdict.dots.map((d) => d.cents).sort((a, b) => a - b), [597, 599, 699, 799, 849, 849]);
  assert.ok(verdict.centreCents <= 849, `centre ${verdict.centreCents} sits above every price seen`);
});

test('D-267: name-joined rows alone still answer, but never "Certain"', async () => {
  const byName = [0, 1, 2, 3].map((i) => obs({ priceCents: 700, seller: `n${i}`, joinMethod: 'name' }));
  const { verdict } = await estimate(item, null, { prices: pricesDb(byName), askClaude: noClaude });
  assert.equal(verdict.basis, 'own_prices', 'every data point still counts when it is all there is');
  assert.equal(verdict.confidence, 'medium');
});

test('D-267 control: the same four rows joined by barcode are "Certain"', async () => {
  const byBarcode = [0, 1, 2, 3].map((i) => obs({ priceCents: 700, seller: `g${i}` }));
  const { verdict } = await estimate(item, null, { prices: pricesDb(byBarcode), askClaude: noClaude });
  assert.equal(verdict.confidence, 'high');
});
