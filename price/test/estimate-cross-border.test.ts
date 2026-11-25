/**
 * SHADOW cross-border range (D-280 probe C, 2026-11-25): the estimate's trace carries `crossBorder`, this
 * barcode's own regular prices in the other of USD/CAD and the range they imply (median x 0.83 to 1.70, or
 * divided by 1.70 to 0.83 the other way). It is recorded beside the answer and changes nothing in the verdict.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { clearEstimateCache, estimate } from '../src/estimate.ts';

const CODE = '0062639298517';
const row = (over: Partial<ObservationRow>): ObservationRow => ({
  code: CODE, seller: 'shop', sellerSku: 's1', sellerName: 'Tuna 170g', sellerBrand: null, priceCents: 300,
  kind: 'regular', unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: null, joinMethod: 'gtin',
  seenOn: '2026-11-01', url: null, imageUrl: null, inStock: null, ...over,
});
const usd = (seller: string, priceCents: number, over: Partial<ObservationRow> = {}) =>
  row({ seller, sellerSku: seller, priceCents, currency: 'USD', country: 'US', ...over });
const cad = (seller: string, priceCents: number, over: Partial<ObservationRow> = {}) => row({ seller, sellerSku: seller, priceCents, ...over });
const asOf = '2026-11-08';
const itemIn = (currency: string, over: object = {}) => ({ barcode: CODE, name: 'Tuna', size: '170 g', asOf, currency, ...over });

function fixture(rows: ObservationRow[]): DatabaseSync {
  clearEstimateCache();
  const db = openPrices(':memory:');
  for (const r of rows) recordObservation(db, r);
  return db;
}

test('(a) a CAD item with only USD own prices: low and high are the USD median x 0.83 and x 1.70, rounded to whole cents', async () => {
  // Three USD shops, median 1100. 1100 x 0.83 = 913 exactly; 1100 x 1.70 = 1870 (Math.round on the product).
  const db = fixture([usd('a', 1000), usd('b', 1100), usd('c', 1200)]);
  const r = await estimate(itemIn('CAD'), null, { prices: db });
  assert.deepEqual(r.trace.crossBorder, {
    fromCurrency: 'USD', n: 3, medianOtherCents: 1100, lowCents: 913, highCents: 1870, ratioSource: 'probe-c-2026-11-25',
  });
  // The ladder had no CAD price for it: the shadow is not the verdict.
  assert.notEqual(r.verdict.basis, 'own_prices');
  db.close();
});

test('(a) rounding: a half cent rounds up, the product is rounded once', async () => {
  const db = fixture([usd('a', 1001)]); // 1001 x 0.83 = 830.83 -> 831; 1001 x 1.70 = 1701.7 -> 1702
  const r = await estimate(itemIn('CAD'), null, { prices: db });
  assert.equal(r.trace.crossBorder?.lowCents, 831);
  assert.equal(r.trace.crossBorder?.highCents, 1702);
  db.close();
});

test('(b) a USD item with only CAD prices: the inverse, the CAD median divided by 1.70 (low) and by 0.83 (high)', async () => {
  // Median 1100 CAD: 1100 / 1.70 = 647.06 -> 647; 1100 / 0.83 = 1325.30 -> 1325.
  const db = fixture([cad('a', 1000), cad('b', 1100), cad('c', 1200)]);
  const r = await estimate(itemIn('USD'), null, { prices: db });
  assert.deepEqual(r.trace.crossBorder, {
    fromCurrency: 'CAD', n: 3, medianOtherCents: 1100, lowCents: 647, highCents: 1325, ratioSource: 'probe-c-2026-11-25',
  });
  db.close();
});

test('one price per shop (the latest), and sale, future-dated and out-of-window rows are not counted', async () => {
  const db = fixture([
    usd('a', 900, { seenOn: '2026-10-01' }), // superseded by the same shop's newer price
    usd('a', 1000, { seenOn: '2026-11-02' }),
    usd('b', 400, { kind: 'promotional' }), // a sale
    usd('c', 450, { seenOn: '2026-12-25' }), // future-dated
    usd('d', 450, { seenOn: '2026-01-01' }), // older than the 90-day window
  ]);
  const r = await estimate(itemIn('CAD'), null, { prices: db });
  assert.equal(r.trace.crossBorder?.n, 1);
  assert.equal(r.trace.crossBorder?.medianOtherCents, 1000);
  db.close();
});

test('(c) an item priced in both currencies: the verdict and every other trace field are those of the same shelf without the other currency', async () => {
  const own = [cad('a', 1000), cad('b', 1100), cad('c', 1250)];
  const withBoth = fixture([...own, usd('x', 700), usd('y', 760)]);
  const r1 = await estimate(itemIn('CAD'), { cents: 1150, currency: 'CAD' }, { prices: withBoth });
  withBoth.close();
  const alone = fixture(own);
  const r0 = await estimate(itemIn('CAD'), { cents: 1150, currency: 'CAD' }, { prices: alone });
  alone.close();
  assert.equal(r1.verdict.basis, 'own_prices');
  // It still gets its shadow...
  assert.deepEqual(r1.trace.crossBorder, {
    // Two shops: the ladder's own median (nearest rank) takes the lower one, 700.
    fromCurrency: 'USD', n: 2, medianOtherCents: 700, lowCents: 581, highCents: 1190, ratioSource: 'probe-c-2026-11-25',
  });
  assert.equal(r0.trace.crossBorder, null);
  // ...and nothing else moves.
  assert.deepEqual(r1.verdict, r0.verdict);
  const { crossBorder: _a, ...rest1 } = r1.trace;
  const { crossBorder: _b, ...rest0 } = r0.trace;
  assert.deepEqual(rest1, rest0);
});

test('(d) no barcode, EUR, or no prices in the other currency: null', async () => {
  const db = fixture([usd('a', 1000), cad('b', 1100)]);
  const noCode = await estimate(itemIn('CAD', { barcode: null }), null, { prices: db });
  assert.equal(noCode.trace.crossBorder, null);
  const eur = await estimate(itemIn('EUR'), null, { prices: db });
  assert.equal(eur.trace.crossBorder, null);
  db.close();
  const onlyCad = fixture([cad('b', 1100)]);
  const none = await estimate(itemIn('CAD'), null, { prices: onlyCad });
  assert.equal(none.trace.crossBorder, null);
  onlyCad.close();
});

test('the other currency is read for this barcode only, by an indexed lookup on its code, never the whole table', async () => {
  const db = fixture([usd('a', 1000), usd('b', 500, { code: '0000000000017', sellerName: 'Other' })]);
  const seen: string[] = [];
  const spy = new Proxy(db, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target);
      if (prop === 'prepare') {
        return (sql: string) => {
          seen.push(sql);
          return target.prepare(sql);
        };
      }
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  const r = await estimate(itemIn('CAD'), null, { prices: spy as DatabaseSync });
  assert.equal(r.trace.crossBorder?.n, 1);
  const usdReads = seen.filter((s) => s.includes('FROM observation'));
  assert.equal(usdReads.length, 2, 'one read of the own currency, one of the other');
  assert.ok(usdReads.some((s) => /code IN \(/.test(s)), 'the other-currency read is filtered by code');
  db.close();
});
