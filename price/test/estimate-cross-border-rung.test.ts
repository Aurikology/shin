/**
 * Cross-border rung (D-280 probe C, 2026-11-25): an item with no prices of its own in the shopper's currency, but
 * prices for the same barcode in the other of USD/CAD, is answered from them (basis `cross_border`), ahead of every
 * rung below own prices. The verdict's shown range (p10 to p90) is exactly the range `trace.crossBorder` carries.
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

test('a CAD shopper with only USD prices: basis cross_border, and the displayed range is the cross-border low and high', async () => {
  const db = fixture([usd('a', 1000), usd('b', 1100), usd('c', 1200)]); // median 1100: 913 to 1870
  const r = await estimate(itemIn('CAD'), { cents: 1200, currency: 'CAD' }, { prices: db });
  const cb = r.trace.crossBorder!;
  assert.equal(cb.lowCents, 913);
  assert.equal(cb.highCents, 1870);
  assert.equal(r.verdict.basis, 'cross_border');
  assert.equal(r.verdict.spreadFrom, 'cross_border');
  assert.equal(r.verdict.p10Cents, cb.lowCents);
  assert.equal(r.verdict.p90Cents, cb.highCents);
  assert.equal(r.verdict.centreCents, Math.round(Math.sqrt(cb.lowCents * cb.highCents)));
  assert.equal(r.verdict.n, 3);
  assert.equal(r.verdict.confidence, 'low');
  assert.ok(!r.verdict.notes.includes('few_prices'), 'three shops are not few');
  assert.deepEqual(r.trace.tried.map((t) => [t.rung, t.outcome]), [['own_prices', 'too_few'], ['cross_border', 'used']]);
  // The zone lines are cut from the same range: both ends are still "reasonable", a price well under the low end is
  // good or great, one well over the high end is bad (the lines are cut from p10 and p90 with half a cent of margin).
  assert.ok(r.verdict.shopper);
  const at = async (cents: number) => (await estimate(itemIn('CAD'), { cents, currency: 'CAD' }, { prices: db })).verdict.shopper!.zone;
  assert.equal(await at(cb.lowCents), 'reasonable');
  assert.equal(await at(cb.highCents), 'reasonable');
  assert.ok(['great', 'good'].includes(await at(Math.floor(cb.lowCents * 0.95))));
  assert.equal(await at(Math.ceil(cb.highCents * 1.05)), 'bad');
  db.close();
});

test('the range is exact whatever the rounding: one price, a half cent, and a wide spread of shops', async () => {
  for (const prices of [[1001], [250], [99, 4999], [1, 2, 3]]) {
    const db = fixture(prices.map((p, i) => usd(`s${i}`, p)));
    const r = await estimate(itemIn('CAD'), null, { prices: db });
    assert.equal(r.verdict.basis, 'cross_border');
    assert.equal(r.verdict.p10Cents, r.trace.crossBorder!.lowCents, `low for ${prices}`);
    assert.equal(r.verdict.p90Cents, r.trace.crossBorder!.highCents, `high for ${prices}`);
    db.close();
  }
});

test('fewer than three shops: the few_prices note and low confidence', async () => {
  const db = fixture([usd('a', 1000), usd('b', 1100)]);
  const r = await estimate(itemIn('CAD'), null, { prices: db });
  assert.equal(r.verdict.basis, 'cross_border');
  assert.equal(r.verdict.n, 2);
  assert.ok(r.verdict.notes.includes('few_prices'));
  assert.equal(r.verdict.confidence, 'low');
  db.close();
});

test('a USD shopper with only CAD prices: the inverse range is the verdict', async () => {
  const db = fixture([cad('a', 1000), cad('b', 1100), cad('c', 1200)]); // median 1100: 647 to 1325
  const r = await estimate(itemIn('USD'), null, { prices: db });
  assert.equal(r.verdict.basis, 'cross_border');
  assert.equal(r.verdict.currency, 'USD');
  assert.equal(r.verdict.p10Cents, 647);
  assert.equal(r.verdict.p90Cents, 1325);
  assert.equal(r.trace.crossBorder!.fromCurrency, 'CAD');
  db.close();
});

test('an item with prices of its own in the shopper currency never uses it, and the rung is not even tried', async () => {
  const db = fixture([cad('a', 1000), cad('b', 1100), cad('c', 1250), usd('x', 700), usd('y', 760)]);
  const r = await estimate(itemIn('CAD'), null, { prices: db });
  assert.equal(r.verdict.basis, 'own_prices');
  assert.ok(!r.trace.tried.some((t) => t.rung === 'cross_border'));
  assert.notEqual(r.verdict.p10Cents, r.trace.crossBorder!.lowCents);
  db.close();
});

test('a USD price older than 730 days is ignored; one inside the window counts', async () => {
  const old = fixture([usd('a', 1000, { seenOn: '2024-10-01' })]); // 768 days before asOf
  const r = await estimate(itemIn('CAD'), null, { prices: old });
  assert.notEqual(r.verdict.basis, 'cross_border');
  assert.equal(r.trace.crossBorder, null);
  assert.deepEqual(r.trace.tried.find((t) => t.rung === 'cross_border'), { rung: 'cross_border', outcome: 'too_few', n: 0 });
  old.close();
  const recent = fixture([usd('a', 1000, { seenOn: '2024-12-01' })]); // 707 days before asOf
  const r2 = await estimate(itemIn('CAD'), null, { prices: recent });
  assert.equal(r2.verdict.basis, 'cross_border');
  recent.close();
});

test('it answers before every later rung: Claude is never asked when the other currency has the barcode', async () => {
  const db = fixture([usd('a', 1000)]);
  let asked = 0;
  const askClaude = async () => {
    asked += 1;
    return { ok: false as const, reason: 'threw' };
  };
  const r = await estimate(itemIn('CAD'), null, { prices: db, askClaude });
  assert.equal(r.verdict.basis, 'cross_border');
  assert.equal(asked, 0);
  assert.ok(!r.trace.tried.some((t) => t.rung === 'claude_typical'));
  db.close();
});

test('not applicable without a barcode or outside USD and CAD, and a later rung answers', async () => {
  const db = fixture([usd('a', 1000), cad('b', 1100)]);
  const noCode = await estimate(itemIn('CAD', { barcode: null }), null, { prices: db });
  assert.notEqual(noCode.verdict.basis, 'cross_border');
  assert.equal(noCode.trace.tried.find((t) => t.rung === 'cross_border')?.outcome, 'not_applicable');
  const eur = await estimate(itemIn('EUR'), null, { prices: db });
  assert.notEqual(eur.verdict.basis, 'cross_border');
  assert.equal(eur.trace.tried.find((t) => t.rung === 'cross_border')?.outcome, 'not_applicable');
  db.close();
});

test('a barcode with no name, no catalogue row and no CAD price is named by the USD rows, and still gets the cross_border range', async () => {
  const db = fixture([usd('a', 1000, { sellerName: 'Skipper Tuna 170g', sellerBrand: 'Skipper' }), usd('b', 1100, { sellerName: 'Skipper Tuna 170g', sellerBrand: 'Skipper' })]);
  const r = await estimate({ barcode: CODE, asOf, currency: 'CAD' }, null, { prices: db });
  assert.equal(r.trace.name, 'Skipper Tuna 170g');
  assert.equal(r.trace.brand, 'Skipper');
  assert.equal(r.trace.size, '170g');
  assert.equal(r.verdict.basis, 'cross_border');
  assert.equal(r.verdict.p10Cents, r.trace.crossBorder!.lowCents);
  // With no rows in either currency nothing names it, as before.
  const none = await estimate({ barcode: CODE, asOf, currency: 'CAD' }, null, { prices: fixture([]) });
  assert.equal(none.trace.name, null);
  assert.notEqual(none.verdict.basis, 'cross_border');
  db.close();
});

test('the shopper-facing verdict never carries the key crossBorder, only the trace does', async () => {
  const db = fixture([usd('a', 1000), usd('b', 1100), usd('c', 1200)]);
  const r = await estimate(itemIn('CAD'), { cents: 1200, currency: 'CAD' }, { prices: db });
  assert.ok(!JSON.stringify(r.verdict).includes('crossBorder'));
  assert.ok(r.trace.crossBorder);
  db.close();
});
