/**
 * D-267 A9 (bug sweep 2026-11-11): BC and New Brunswick liquor rows were stamped with the day they were
 * loaded, not the day the price was seen, so a June price list loaded in September read "0 days ago".
 * Each importer now carries the source's own date: BC's monthly list names its month in the file name,
 * New Brunswick's PDF carries its own date. Where a source truly gives none, the row is flagged
 * (`seen_on_unknown = 1`) and every reader treats it as of unknown age, weighted like an old price, never
 * as today. Rows already loaded under the old code are flagged by the next run of their importer.
 * (Walmart, Canadian Tire and Save-On-Foods rows are read live from the shop's page on the day they are
 * stamped, so their date is the day they were seen.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openPrices, recordObservation, markLoadDayRows, type ObservationRow } from '../src/store.ts';
import { bcSeenOn, loadBcldb } from '../src/bcldb.ts';
import { nbSeenOn } from '../src/nb.ts';
import { estimate, type ClaudeAnswer, type EstimateItem } from '../src/estimate.ts';
import { priceRangeFor, UNKNOWN_AGE_DAYS } from '../src/range.ts';

const AS_OF = '2026-11-12';
const SELF = '0626990000999';

let sku = 0;
function obs(over: Partial<ObservationRow>): ObservationRow {
  sku += 1;
  return {
    code: SELF,
    seller: 'bcldb',
    sellerSku: `sku-${sku}`,
    sellerName: 'Thing',
    sellerBrand: null,
    priceCents: 1000,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: 'British Columbia',
    joinMethod: 'gtin',
    seenOn: '2026-11-10',
    url: null,
    imageUrl: null,
    inStock: null,
    ...over,
  };
}

const item: EstimateItem = { barcode: SELF, asOf: AS_OF, currency: 'CAD', country: 'CA' };
const noClaude = async (): Promise<ClaudeAnswer> => ({ ok: false, reason: 'test' });

/* ---------------------------------------------------------------- the source's own date */

test("BC: the price list's month, from its file name, is the date its prices were seen", () => {
  assert.deepEqual(bcSeenOn('/x/bc_liquor_store_product_price_list_june_2026.csv', AS_OF), { seenOn: '2026-06-01', unknown: false });
  assert.deepEqual(bcSeenOn('C:\\d\\bc_liquor_store_product_price_list_october_2026.csv', AS_OF), { seenOn: '2026-10-01', unknown: false });
  // No month in the name: the load day, flagged unknown, never passed off as the day it was seen.
  assert.deepEqual(bcSeenOn('/x/prices.csv', AS_OF), { seenOn: AS_OF, unknown: true });
  // A month after the load day cannot be when it was seen.
  assert.deepEqual(bcSeenOn('/x/bc_liquor_store_product_price_list_december_2026.csv', AS_OF), { seenOn: AS_OF, unknown: true });
});

test("NB: the PDF's own date, else the server's Last-Modified, else unknown", () => {
  const info = 'Title:          Price List\nCreationDate:   2026-09-28T09:00:00-03\nModDate:        2026-10-03T14:22:01-03\nPages:          212\n';
  assert.deepEqual(nbSeenOn(info, null, AS_OF), { seenOn: '2026-10-03', unknown: false });
  assert.deepEqual(nbSeenOn('CreationDate:   2026-09-28T09:00:00-03\n', null, AS_OF), { seenOn: '2026-09-28', unknown: false });
  assert.deepEqual(nbSeenOn(null, 'Fri, 02 Oct 2026 10:00:00 GMT', AS_OF), { seenOn: '2026-10-02', unknown: false });
  assert.deepEqual(nbSeenOn('Pages: 3\n', 'not a date', AS_OF), { seenOn: AS_OF, unknown: true });
  assert.deepEqual(nbSeenOn(null, null, AS_OF), { seenOn: AS_OF, unknown: true });
  assert.deepEqual(nbSeenOn('ModDate:        2027-01-01T00:00:00Z\n', null, AS_OF), { seenOn: AS_OF, unknown: true });
});

/* ---------------------------------------------------------------- store */

test('rows loaded before the fix are flagged by their importer, once, logged, never deleted', () => {
  const db = openPrices(':memory:');
  recordObservation(db, obs({ seller: 'bcldb', seenOn: '2026-09-26' }));
  recordObservation(db, obs({ seller: 'bcldb', seenOn: '2026-06-01', seenOnUnknown: 0 }));
  recordObservation(db, obs({ seller: 'anbl', seenOn: '2026-09-26' }));
  recordObservation(db, obs({ seller: 'hammer', seenOn: '2026-09-26' }));
  const rows = () => db.prepare('SELECT seller, seen_on, seen_on_unknown AS u FROM observation ORDER BY seller, seen_on').all();
  const logged = () => (db.prepare("SELECT count(*) AS n FROM observation_log WHERE event = 'update'").get() as { n: number }).n;
  const before = logged();
  assert.equal(markLoadDayRows(db, 'bcldb'), 1);
  assert.equal(markLoadDayRows(db, 'bcldb'), 0, 'idempotent');
  assert.equal(logged(), before + 1, 'the change is in the append-only log');
  assert.deepEqual(rows().map((r) => ({ ...(r as object) })), [
    { seller: 'anbl', seen_on: '2026-09-26', u: null },
    { seller: 'bcldb', seen_on: '2026-06-01', u: 0 },
    { seller: 'bcldb', seen_on: '2026-09-26', u: 1 },
    { seller: 'hammer', seen_on: '2026-09-26', u: null },
  ]);
});

test('BC importer: writes the list month, and flags its own rows from earlier loads', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bcldb-dates-'));
  try {
    const csv = join(dir, 'bc_liquor_store_product_price_list_june_2026.csv');
    writeFileSync(
      csv,
      'ITEM_CATEGORY_NAME,ITEM_SUBCATEGORY_NAME,ITEM_CLASS_NAME,PRODUCT_COUNTRY_ORIGIN_NAME,PRODUCT_SKU_NO,PRODUCT_LONG_NAME,PRODUCT_BASE_UPC_NO,PRODUCT_LITRES_PER_CONTAINER,PRD_CONTAINER_PER_SELL_UNIT,PRODUCT_ALCOHOL_PERCENT,PRODUCT_PRICE,SWEETNESS_CODE\n' +
        'Wine,France Wine,France Red Wine,FRANCE,155689,TEST RED 2020,062067427152,0.75,1,13,24.99,0\n',
    );
    const db = openPrices(join(dir, 'prices.db'), { enforceSources: true });
    recordObservation(db, obs({ seller: 'bcldb', sellerSku: '155689', code: '0062067427152', seenOn: '2026-09-26' }));
    const r = await loadBcldb(csv, { db, today: AS_OF });
    assert.equal(r.written, 1);
    assert.deepEqual(
      db.prepare("SELECT seen_on, seen_on_unknown AS u, price_cents FROM observation WHERE seller = 'bcldb' ORDER BY seen_on").all().map((x) => ({ ...(x as object) })),
      [
        { seen_on: '2026-06-01', u: 0, price_cents: 2499 },
        { seen_on: '2026-09-26', u: 1, price_cents: 1000 },
      ],
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ---------------------------------------------------------------- readers */

test('verdict: a row of unknown date is weighted like an old price, never as today', async () => {
  const db = openPrices(':memory:');
  recordObservation(db, obs({ seller: 'a', storeName: 'A', priceCents: 1000, seenOn: '2026-11-08', seenOnUnknown: 0 }));
  for (const s of ['b', 'c']) recordObservation(db, obs({ seller: s, storeName: s, priceCents: 2000, seenOn: '2026-11-10', seenOnUnknown: 1 }));
  const { verdict } = await estimate(item, null, { prices: db, askClaude: noClaude });
  assert.equal(verdict.n, 3, 'every shop counts');
  // Read as fresh, the two loaded "two days ago" would set the median at $20; weighted as old (366 days, 0.35 each), the dated price leads.
  assert.equal(verdict.centreCents, 1000, 'the dated fresh price leads two of unknown age');
  assert.notEqual(verdict.confidence, 'high');
});

test('verdict: prices of unknown date alone are old prices, never Certain', async () => {
  const db = openPrices(':memory:');
  for (const s of ['b', 'c', 'd']) recordObservation(db, obs({ seller: s, storeName: s, priceCents: 2000, seenOn: '2026-11-10', seenOnUnknown: 1 }));
  const { verdict } = await estimate(item, null, { prices: db, askClaude: noClaude });
  assert.equal(verdict.basis, 'own_prices');
  assert.ok(verdict.notes.includes('old_prices'));
  assert.equal(verdict.confidence, 'medium');
  assert.ok(UNKNOWN_AGE_DAYS > 365);
});

test("verdict: in one shop, the source's dated row leads that shop's load-day row", async () => {
  const db = openPrices(':memory:');
  recordObservation(db, obs({ sellerSku: 'x', priceCents: 2499, seenOn: '2026-06-01', seenOnUnknown: 0 }));
  recordObservation(db, obs({ sellerSku: 'x', priceCents: 2999, seenOn: '2026-09-26', seenOnUnknown: 1 }));
  const { verdict } = await estimate(item, null, { prices: db, askClaude: noClaude });
  assert.equal(verdict.n, 1);
  assert.equal(verdict.centreCents, 2499);
  // Both stay as dots, the dated one first.
  assert.deepEqual(verdict.dots.map((d) => d.cents), [2499, 2999]);
});

test('range card: rows of unknown date are not fresh prices in its 90-day window', () => {
  const db = openPrices(':memory:');
  for (const s of ['b', 'c', 'd']) recordObservation(db, obs({ seller: s, storeName: s, priceCents: 2000, seenOn: '2026-11-10', seenOnUnknown: 1 }));
  const r = priceRangeFor({ barcode: SELF, asOf: AS_OF, currency: 'CAD' }, { prices: db, catalogue: null });
  assert.notEqual(r.basis, 'this_product');
});
