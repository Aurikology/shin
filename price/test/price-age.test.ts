/**
 * D-267 A3 (bug sweep 2026-11-11): about 20,500 prices are over 90 days old (11,750 over a year).
 * Every own price is weighted by its age so recent prices lead; none is dropped (RULINGS 2026-09-28,
 * "every data point"), none weighs zero, and a product whose newest price is over a year old is
 * never "Certain".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { ageWeight, estimate, HALF_LIFE_DAYS, type ClaudeAnswer, type EstimateItem } from '../src/estimate.ts';
import { WINDOW_DAYS } from '../src/range.ts';


const SELF = '0626990000777';
const AS_OF = '2026-09-30';

function daysAgo(n: number): string {
  return new Date(Date.parse(`${AS_OF}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
}

let sku = 0;
function obs(over: Partial<ObservationRow>): ObservationRow {
  sku += 1;
  return {
    code: SELF,
    seller: 'shop',
    sellerSku: `sku-${sku}`,
    sellerName: 'Thing',
    sellerBrand: null,
    priceCents: 1000,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: null,
    joinMethod: 'gtin',
    seenOn: daysAgo(5),
    url: null,
    imageUrl: null,
    inStock: null,
    ...over,
  };
}

function prices(rows: readonly ObservationRow[]) {
  const db = openPrices(':memory:');
  for (const r of rows) recordObservation(db, r);
  return db;
}

const item: EstimateItem = { barcode: SELF, asOf: AS_OF, currency: 'CAD', country: 'CA' };
const noClaude = async (): Promise<ClaudeAnswer> => ({ ok: false, reason: 'test' });

test('the weight: full inside the range window, halving every HALF_LIFE_DAYS past it, never zero', () => {
  assert.equal(HALF_LIFE_DAYS, 180);
  assert.equal(ageWeight(0), 1);
  assert.equal(ageWeight(WINDOW_DAYS), 1);
  assert.ok(Math.abs(ageWeight(WINDOW_DAYS + HALF_LIFE_DAYS) - 0.5) < 1e-12);
  assert.ok(ageWeight(730) > 0.08 && ageWeight(730) < 0.09);
  assert.ok(ageWeight(100_000) > 0);
});

test('D-267 A3: a shop seen 100 days ago outweighs three shops seen 500 days ago', async () => {
  const { verdict, trace } = await estimate(item, null, {
    prices: prices([
      obs({ seller: 'a', priceCents: 1000, seenOn: daysAgo(100) }),
      obs({ seller: 'b', priceCents: 2000, seenOn: daysAgo(500) }),
      obs({ seller: 'c', priceCents: 2000, seenOn: daysAgo(500) }),
      obs({ seller: 'd', priceCents: 2000, seenOn: daysAgo(500) }),
    ]),
    askClaude: noClaude,
  });
  assert.equal(verdict.basis, 'own_prices');
  assert.equal(verdict.n, 4, 'every shop counts');
  assert.equal(trace.ownShops, 4);
  assert.equal(verdict.centreCents, 1000, 'the recent price leads');
});

test('D-267 A3: shops older than the window are weighted beside fresh ones, never dropped', async () => {
  const { verdict } = await estimate(item, null, {
    prices: prices([
      obs({ seller: 'a', priceCents: 2000, seenOn: daysAgo(10) }),
      obs({ seller: 'b', priceCents: 2400, seenOn: daysAgo(400) }),
      obs({ seller: 'c', priceCents: 2400, seenOn: daysAgo(400) }),
    ]),
    askClaude: noClaude,
  });
  assert.equal(verdict.basis, 'own_prices');
  assert.equal(verdict.n, 3, 'the two old shops still count');
  assert.equal(verdict.centreCents, 2000, 'the fresh shop leads two year-old ones');
  assert.ok(!verdict.notes.includes('few_prices'));
  assert.equal(verdict.confidence, 'medium', 'one fresh shop is never Certain');
});

test('D-267 A3: old shops do not widen the bell drawn from fresh ones', async () => {
  const { verdict } = await estimate(item, null, {
    prices: prices([
      obs({ seller: 'a', priceCents: 1000, seenOn: daysAgo(3) }),
      obs({ seller: 'b', priceCents: 1050, seenOn: daysAgo(3) }),
      obs({ seller: 'c', priceCents: 1100, seenOn: daysAgo(3) }),
      obs({ seller: 'd', priceCents: 2000, seenOn: daysAgo(600) }),
      obs({ seller: 'e', priceCents: 2000, seenOn: daysAgo(600) }),
    ]),
    askClaude: noClaude,
  });
  assert.equal(verdict.n, 5);
  assert.equal(verdict.centreCents, 1050);
  assert.equal(verdict.spreadFrom, 'own_prices');
  assert.ok(Math.abs(verdict.sigmaLog - Math.log(1100 / 1000) / 1.349) < 1e-4, `sigma ${verdict.sigmaLog}`);
});

test('D-267 A3: newest price over a year old caps the answer at Fairly sure', async () => {
  const rows = ['a', 'b', 'c', 'd', 'e'].map((s) => obs({ seller: s, priceCents: 1500, seenOn: daysAgo(400) }));
  const { verdict } = await estimate(item, null, { prices: prices(rows), askClaude: noClaude });
  assert.equal(verdict.basis, 'own_prices');
  assert.ok(verdict.notes.includes('old_prices'));
  assert.equal(verdict.confidence, 'medium');
});

test('D-267 A3: three fresh shops still read Certain beside older ones', async () => {
  const { verdict } = await estimate(item, null, {
    prices: prices([
      obs({ seller: 'a', priceCents: 1500, seenOn: daysAgo(2) }),
      obs({ seller: 'b', priceCents: 1500, seenOn: daysAgo(2) }),
      obs({ seller: 'c', priceCents: 1500, seenOn: daysAgo(2) }),
      obs({ seller: 'd', priceCents: 1520, seenOn: daysAgo(500) }),
    ]),
    askClaude: noClaude,
  });
  assert.equal(verdict.n, 4);
  assert.equal(verdict.confidence, 'high');
});
