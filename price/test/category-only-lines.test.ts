/**
 * B6's cut-off rule: for an answer that stands on its category alone, the good
 * cut-off is the stricter of the line and the group's 10th percentile, and the
 * bad cut-off the stricter of the line and its 90th percentile. Each rule has a
 * case it must fail: the old rule (the 20% lines alone) is run on the same
 * prices and must call the ordinary price good or bad.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { categoryOnlyLines, estimate, type EstimateDeps, type Thresholds } from '../src/estimate.ts';

const NONE = { greatPct: false, goodPct: false, badPct: false };
const DEFAULTS: Thresholds = { greatPct: 30, goodPct: 20, badPct: 20, fromShopper: false };
const mu = Math.log(1000);

test('a group wider than the line moves the default lines out to its 10th and 90th percentile', () => {
  const t = categoryOnlyLines(DEFAULTS, NONE, mu, Math.log(600), Math.log(1800));
  assert.equal(t.goodPct, 40); // 600 is 40% under 1000
  assert.equal(t.badPct, 80); // 1800 is 80% over
  assert.equal(t.greatPct, 50, 'great keeps its 10-point gap past good');
});
test('a group tighter than the line leaves it alone: the stricter of the two is the 20%', () => {
  const t = categoryOnlyLines(DEFAULTS, NONE, mu, Math.log(900), Math.log(1100));
  assert.deepEqual(t, DEFAULTS);
});
test('each side is taken on its own: a group wide only on the dear side moves only the bad line', () => {
  const t = categoryOnlyLines(DEFAULTS, NONE, mu, Math.log(900), Math.log(2000));
  assert.equal(t.goodPct, 20);
  assert.equal(t.badPct, 100);
});
test('a line the shopper set stays as typed; a line he did not set still moves', () => {
  const base: Thresholds = { greatPct: 30, goodPct: 10, badPct: 20, fromShopper: true };
  const t = categoryOnlyLines(base, { greatPct: false, goodPct: true, badPct: false }, mu, Math.log(600), Math.log(1800));
  assert.equal(t.goodPct, 10, 'his good line is his');
  assert.equal(t.badPct, 80);
  assert.equal(t.fromShopper, true);
});

/* ------------------------------------------------------ through estimate */

function obs(over: Partial<ObservationRow>): ObservationRow {
  return {
    code: null, seller: 'Walmart', sellerSku: 'sku', sellerName: 'x', sellerBrand: null, priceCents: 500, kind: 'regular',
    unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: null, joinMethod: 'gtin', seenOn: '2026-09-20',
    url: null, imageUrl: null, inStock: null, ...over,
  };
}
const LEAF = ['en:beverages', 'en:spirits', 'en:vodkas'];
const ITEM = '0626990000001';

/** Five vodkas whose prices are spaced 2500 * exp(spread * z), z in -1.2..1.2; the item itself optionally priced at three shops. */
function world(spread: number, ownCents: number | null): EstimateDeps {
  const prices = openPrices(':memory:');
  const catalogue = new DatabaseSync(':memory:');
  catalogue.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT, brands TEXT, quantity TEXT,
    size_value REAL, size_unit TEXT, category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  const ins = catalogue.prepare('INSERT INTO product (code, name, name_en, brands, quantity, size_value, size_unit, category_path, leaf_category) VALUES (?,?,?,?,?,?,?,?,?)');
  ins.run(ITEM, 'Own Vodka', 'Own Vodka', null, '750 ml', 750, 'ml', JSON.stringify(LEAF), 'en:vodkas');
  [-1.2, -0.6, 0, 0.6, 1.2].forEach((z, i) => {
    const code = `10000000000${i}`;
    ins.run(code, `Vodka ${i}`, `Vodka ${i}`, `B${i}`, '750 ml', 750, 'ml', JSON.stringify(LEAF), 'en:vodkas');
    recordObservation(prices, obs({ code, seller: `shop${i}`, sellerSku: `sku${i}`, priceCents: Math.round(2500 * Math.exp(spread * z)) }));
  });
  if (ownCents !== null) for (let i = 0; i < 3; i++) recordObservation(prices, obs({ code: ITEM, seller: `own${i}`, sellerSku: `own${i}`, priceCents: ownCents }));
  return { prices, catalogue };
}
const item = { barcode: ITEM, asOf: '2026-09-30', currency: 'CAD', country: 'CA' };
const OLD_LINES = { greatPct: 30, goodPct: 20, badPct: 20 };

test('category-only: a price 25% under the centre of a wide group is reasonable, not good; the old 20% lines call it good', async () => {
  const deps = world(0.5, null);
  const base = (await estimate(item, null, deps)).verdict;
  assert.equal(base.basis, 'leaf_category');
  const cents = Math.round(base.centreCents * 0.75);
  const now = (await estimate(item, { cents }, deps)).verdict;
  assert.equal(now.shopper!.zone, 'reasonable');
  assert.ok(now.thresholds.goodPct > 20, `the good line moved out: ${JSON.stringify(now.thresholds)}`);
  const old = (await estimate(item, { cents, thresholds: OLD_LINES }, deps)).verdict;
  assert.equal(old.shopper!.zone, 'good', 'control: the old lines call the same ordinary price good');
  // A price past the group's own 10th percentile is still good, and one past its 90th still bad.
  assert.equal((await estimate(item, { cents: Math.round(base.centreCents * 0.4) }, deps)).verdict.shopper!.zone === 'reasonable', false);
  assert.equal((await estimate(item, { cents: Math.round(base.centreCents * 2.2) }, deps)).verdict.shopper!.zone, 'bad');
  assert.equal((await estimate(item, { cents: Math.round(base.centreCents * 1.5) }, deps)).verdict.shopper!.zone, 'reasonable');
  const oldBad = (await estimate(item, { cents: Math.round(base.centreCents * 1.5), thresholds: OLD_LINES }, deps)).verdict;
  assert.equal(oldBad.shopper!.zone, 'bad', 'control: the old lines call a price 50% over bad');
});
test('category-only: in a tight group the lines stay at 20%', async () => {
  const deps = world(0.05, null);
  const v = (await estimate(item, { cents: 2000 }, deps)).verdict;
  assert.deepEqual(v.thresholds, { greatPct: 30, goodPct: 20, badPct: 20, fromShopper: false });
});
test('an answer with its own prices keeps the shopper\'s lines or the defaults, untouched by the group', async () => {
  const deps = world(0.5, 2500);
  const v = (await estimate(item, { cents: Math.round(2500 * 0.75) }, deps)).verdict;
  assert.equal(v.basis, 'own_prices');
  assert.deepEqual(v.thresholds, { greatPct: 30, goodPct: 20, badPct: 20, fromShopper: false });
  assert.equal(v.shopper!.zone, 'good');
});
