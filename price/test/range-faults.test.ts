/**
 * THREE HANDLERS IN range.ts USED TO SWALLOW AN ERROR IN SILENCE (category-check.ts, A7).
 *
 * range.ts runs in front of a shopper, so none of them may throw or change the answer.
 * But "never block" is not "never say": each now logs one `[range-fault]` line carrying
 * the reason and counts it, and `rangeFaults()` is what `/api/health` shows. Each test has
 * a bad input the fault must be counted for, and a good-input control that must leave the
 * counters at zero and the answer exactly as it was.
 */
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import * as range from '../src/range.ts';

const SELF = '0068100084245';
const AS_OF = '2026-09-27';

function obs(over: Partial<ObservationRow>): ObservationRow {
  return {
    code: SELF, seller: 'Walmart', sellerSku: 'sku', sellerName: 'Peanut Butter', sellerBrand: 'Kraft', priceCents: 500,
    kind: 'regular', unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: null,
    joinMethod: 'gtin', seenOn: '2026-09-20', url: null, imageUrl: null, inStock: null, ...over,
  };
}

/** Four shops pricing the product; the last one carries whatever the test overrides. */
function fourShops(last: Partial<ObservationRow>): DatabaseSync {
  const db = openPrices(':memory:');
  for (const [i, cents] of [599, 499, 549].entries()) {
    recordObservation(db, obs({ seller: `Shop${i}`, sellerSku: `s${i}`, priceCents: cents }));
  }
  recordObservation(db, obs({ seller: 'Shop3', sellerSku: 's3', priceCents: 519, ...last }));
  return db;
}

function emptyCatalogue(pathJson: string | null): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, quantity TEXT, size_value REAL, size_unit TEXT,
    category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  if (pathJson !== null) {
    db.prepare('INSERT INTO product (code, name, quantity, size_value, size_unit, category_path, leaf_category) VALUES (?,?,?,?,?,?,?)')
      .run(SELF, 'x', '500 g', 500, 'g', pathJson, 'en:peanut-butters');
  }
  return db;
}

const input = (): range.RangeInput => ({ barcode: SELF, size: '500 g', leafCategory: null, categoryPath: [], asOf: AS_OF });

/** The counters, or empty before they exist (so the controls can be run against the old code). */
const faults = (): Record<string, number> => (range as Partial<typeof range>).rangeFaults?.() ?? {};

let warned: string[] = [];
beforeEach(() => {
  (range as Partial<typeof range>).resetRangeFaultsForTests?.();
  warned = [];
  mock.method(console, 'warn', (...a: unknown[]) => { warned.push(a.join(' ')); });
});
afterEach(() => mock.restoreAll());

/* ------------------------------------------------------ line 215: the URL */

test('an unparseable url is logged and counted, and the row is kept as before', () => {
  const r = range.priceRangeFor(input(), { prices: fourShops({ url: 'not a url at all' }), catalogue: emptyCatalogue(null) });
  assert.equal(r.basis, 'this_product');
  assert.equal(r.n, 4, 'the row with the unreadable link still counts: we cannot tell it came from a test double');
  assert.equal(faults().unparseable_url, 1);
  assert.ok(warned.some((l) => l.startsWith('[range-fault] unparseable_url') && l.includes('not a url at all')), warned.join('|'));
});

test('control: a good url and a reserved test host leave the counters at zero and behave as before', () => {
  const good = range.priceRangeFor(input(), { prices: fourShops({ url: 'https://www.walmart.ca/en/ip/x/1' }), catalogue: emptyCatalogue(null) });
  assert.equal(good.n, 4);
  const doubled = range.priceRangeFor(input(), { prices: fourShops({ url: 'https://shop.example.com/x' }), catalogue: emptyCatalogue(null) });
  assert.equal(doubled.n, 3, 'a row linking to a reserved host is still left out');
  assert.deepEqual(faults(), {});
  assert.deepEqual(warned, []);
});

/* ------------------------------------------------------ line 246: seen_on */

test('an unparseable seen_on drops the row, and says so', () => {
  const r = range.priceRangeFor(input(), { prices: fourShops({ seenOn: 'sometime in May' }), catalogue: emptyCatalogue(null) });
  assert.equal(r.basis, 'this_product');
  assert.equal(r.n, 3, 'the price with no readable date is still not used');
  assert.equal(faults().unparseable_seen_on, 1);
  assert.ok(warned.some((l) => l.startsWith('[range-fault] unparseable_seen_on') && l.includes('sometime in May')), warned.join('|'));
});

test('control: a future-dated row and an old row are dropped for their own reasons, uncounted as faults', () => {
  const future = range.priceRangeFor(input(), { prices: fourShops({ seenOn: '2026-12-31' }), catalogue: emptyCatalogue(null) });
  assert.equal(future.n, 3);
  const old = range.priceRangeFor(input(), { prices: fourShops({ seenOn: '2025-01-01' }), catalogue: emptyCatalogue(null) });
  assert.equal(old.n, 3);
  assert.deepEqual(faults(), {});
  assert.deepEqual(warned, []);
});

/* ---------------------------------------------- line 293: the category path */

test('a category path that is not JSON is logged and counted, and the product simply has no path', () => {
  const r = range.priceRangeFor(
    { barcode: SELF, size: '500 g', asOf: AS_OF },
    { prices: openPrices(':memory:'), catalogue: emptyCatalogue('{not json') },
  );
  assert.equal(r.basis, 'none', 'the answer is the same as for a product with no path');
  assert.equal(faults().unparseable_category_path, 1);
  assert.ok(warned.some((l) => l.startsWith('[range-fault] unparseable_category_path') && l.includes(SELF)), warned.join('|'));
});

test('control: a valid path and an empty path leave the counters at zero', () => {
  for (const p of ['["en:snacks","en:peanut-butters"]', '[]']) {
    range.priceRangeFor({ barcode: SELF, size: '500 g', asOf: AS_OF }, { prices: openPrices(':memory:'), catalogue: emptyCatalogue(p) });
  }
  assert.deepEqual(faults(), {});
  assert.deepEqual(warned, []);
});
