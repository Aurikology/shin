/**
 * A scanned barcode, answered from Pexi's own data and nothing else.
 *
 * 2026-09-26: two price loads put about 14,000 priced barcodes into
 * `price/data/prices.db` and nothing in the app could read a price by
 * barcode. This is `lookupOwnPricesByBarcode` (own-prices.ts), tested the
 * same way `typed-own-prices.test.ts` tests its typed sibling at its lowest
 * level: fixtures in a temp directory, the function called directly, no
 * server, no route. That other test's own header says a typed name only
 * calls `lookupOwnPrices`; this file never touches the identify route
 * either, on purpose, because another lane is rewriting that path tonight.
 *
 * Both stores `observation` and `page_gtin` matter here for the same reason
 * the coordinator's own count does: checked 2026-09-26 against the live
 * `price/data/prices.db`, only 323 of BC's 7,555 rows join to a catalogue
 * product (`code` set); 6,108 of New Brunswick's 6,741 rows never joined and
 * carry the barcode only in `page_gtin`. A lookup that reads `code` alone
 * would answer for a few hundred barcodes instead of thousands, so this file
 * has a dedicated case for a `page_gtin`-only row.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const dir = mkdtempSync(join(tmpdir(), 'shin-barcode-own-'));
const pricesPath = join(dir, 'prices.db');
const userPath = join(dir, 'user-catalogue.db');

const { openPrices, recordObservation } = await import('../../price/src/store.ts');
const { createUserCatalogue, recordUserScan } = await import('../../catalogue/src/user-catalogue.ts');
const { lookupOwnPricesByBarcode } = await import('../src/own-prices.ts');

const prices = openPrices(pricesPath);

/** A joined row: `code` is the barcode, exactly as `observation`'s own doc comment says it is stored (zero padded to 13). */
function joinedRow(o: {
  code: string;
  seller: string;
  sku: string;
  name: string;
  cents: number;
  seen: string;
  currency?: string | null;
  region?: string | null;
  store?: string | null;
  basePriceCents?: number | null;
}) {
  recordObservation(prices, {
    code: o.code,
    seller: o.seller,
    sellerSku: o.sku,
    sellerName: o.name,
    sellerBrand: null,
    priceCents: o.cents,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: (o.currency ?? 'CAD') as unknown as string,
    country: 'CA',
    region: o.region ?? null,
    joinMethod: 'gtin',
    seenOn: o.seen,
    url: null,
    imageUrl: null,
    inStock: null,
    storeName: o.store ?? null,
    storeCity: null,
    basePriceCents: o.basePriceCents ?? null,
  });
}

/** An unjoined row: the crawl found the barcode on the seller's page but never tied it to a catalogue product, so `code` stays NULL and the barcode lives only in `page_gtin` (store.ts's own convention). */
function unjoinedRow(o: {
  pageGtin: string;
  seller: string;
  sku: string;
  name: string;
  cents: number;
  seen: string;
  region?: string | null;
  store?: string | null;
  basePriceCents?: number | null;
}) {
  recordObservation(prices, {
    code: null,
    seller: o.seller,
    sellerSku: o.sku,
    sellerName: o.name,
    sellerBrand: null,
    priceCents: o.cents,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: o.region ?? null,
    joinMethod: 'none',
    pageGtin: o.pageGtin,
    seenOn: o.seen,
    url: null,
    imageUrl: null,
    inStock: null,
    storeName: o.store ?? null,
    storeCity: null,
    basePriceCents: o.basePriceCents ?? null,
  });
}

// A barcode with a real, joined British Columbia price, seen twice: only the
// later observation is the store's price.
const BARCODE_BC = '0060000000029';
joinedRow({ code: BARCODE_BC, seller: 'bcliquorstores', sku: 'bc-1', name: 'Ridge Red Wine', cents: 1899, seen: '2026-09-01', region: 'BC', store: 'BC Liquor' });
joinedRow({ code: BARCODE_BC, seller: 'bcliquorstores', sku: 'bc-2', name: 'Ridge Red Wine', cents: 1799, seen: '2026-09-15', region: 'BC', store: 'BC Liquor' });

// A barcode the crawl never joined to a catalogue product: New Brunswick,
// tax-inclusive price_cents alongside a tax-exclusive base_price_cents.
const BARCODE_NB_UNJOINED = '0060000000036';
unjoinedRow({ pageGtin: BARCODE_NB_UNJOINED, seller: 'anbl', sku: 'nb-1', name: 'Fundy Amber Ale', cents: 349, seen: '2026-09-10', region: 'NB', store: 'ANBL', basePriceCents: 305 });

// One barcode priced in both regions: proof the two never get averaged together.
const BARCODE_MULTI = '0060000000050';
joinedRow({ code: BARCODE_MULTI, seller: 'bcliquorstores', sku: 'bc-3', name: 'Coastal Lager', cents: 1999, seen: '2026-09-20', region: 'BC', store: 'BC Liquor' });
unjoinedRow({ pageGtin: BARCODE_MULTI, seller: 'anbl', sku: 'nb-2', name: 'Coastal Lager', cents: 2499, seen: '2026-09-21', region: 'NB', store: 'ANBL', basePriceCents: 2200 });

// 7B.8, UPC-E: the Coke Zero can (catalogue/test/upce.test.ts) priced under
// the 8 digits printed on it, unjoined, as a seller page would state it.
const UPCE_PRINTED = '06781901';
const UPCE_LONG = '067000008191';
unjoinedRow({ pageGtin: UPCE_PRINTED, seller: 'anbl', sku: 'nb-upce', name: 'Coke Zero 355 ml', cents: 149, seen: '2026-09-22', region: 'NB', store: 'ANBL' });

// And the other direction: a price joined under the 13-digit UPC-A spelling,
// scanned as the short code 04252614 (UPC-A 042100005264).
const UPCA_STORED = '0042100005264';
const UPCA_SHORT = '04252614';
joinedRow({ code: UPCA_STORED, seller: 'bcliquorstores', sku: 'bc-upca', name: 'Small Can Soda', cents: 129, seen: '2026-09-22', region: 'BC', store: 'BC Liquor' });

prices.close();

const uc = createUserCatalogue(userPath);

// A barcode the big catalogue does not hold at all: the shelf price lives only
// on `user_product.gtin` -> `user_observation.product_id`, never on
// `catalogue_code`. This is the case that matters most: most of the ~14,000
// barcodes are exactly this.
const BARCODE_USER_ONLY = '0060000000067';
recordUserScan(
  {
    gtin: BARCODE_USER_ONLY,
    name: 'Corner Store Energy Drink',
    quantity: '473 ml',
    priceCents: 299,
    storeType: 'convenience',
    storeName: 'Circle K',
    market: { country: 'CA', region: 'ON', currency: 'CAD', derivedFrom: 'user_location' },
    observedAt: '2026-09-18T10:00:00.000Z',
  },
  { log: uc },
);

// A barcode whose scan joined to the big catalogue: the shelf price lands on
// `user_observation.catalogue_code`, not on a product_id.
const BARCODE_CATALOGUE_JOINED = '0060000000074';
recordUserScan(
  {
    gtin: BARCODE_CATALOGUE_JOINED,
    name: 'Golden Corn Niblets',
    quantity: '341 ml',
    priceCents: 259,
    storeType: 'supermarket',
    storeName: 'No Frills',
    market: { country: 'CA', region: 'ON', currency: 'CAD', derivedFrom: 'user_location' },
    observedAt: '2026-09-19T10:00:00.000Z',
  },
  {
    log: uc,
    probe: () => [{ code: BARCODE_CATALOGUE_JOINED, name: 'Golden Corn Niblets', brands: null, sizeValue: null, sizeUnit: null, source: 'off' }],
  },
);

// A barcode whose only stored price has no currency: the location was unknown,
// so `market.currency` is null and the row is not an answer.
const BARCODE_NO_CURRENCY = '0060000000081';
recordUserScan(
  {
    gtin: BARCODE_NO_CURRENCY,
    name: 'Mystery Snack',
    priceCents: 199,
    storeType: 'other',
    storeName: 'Unknown Shop',
    market: { country: null, region: null, currency: null, derivedFrom: 'unknown' },
    observedAt: '2026-09-19T10:00:00.000Z',
  },
  { log: uc },
);

uc.db?.close();

after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked. */
  }
});

test('a barcode with a real, joined BC price answers with the latest observation', () => {
  const out = lookupOwnPricesByBarcode(BARCODE_BC, { pricesDbPath: pricesPath, userCataloguePath: join(dir, 'absent-user.db') });
  assert.ok(out.match, 'expected a match');
  assert.deepEqual(
    out.match!.prices.map((p) => [p.store, p.amount, p.currency, p.observedAt, p.region]),
    [['BC Liquor', 17.99, 'CAD', '2026-09-15', 'BC']],
  );
});

test('an unjoined row is found by page_gtin alone, and carries the pre-tax base price separately', () => {
  const out = lookupOwnPricesByBarcode(BARCODE_NB_UNJOINED, { pricesDbPath: pricesPath, userCataloguePath: join(dir, 'absent-user.db') });
  assert.ok(out.match, 'expected a match via page_gtin, not code');
  const p = out.match!.prices[0];
  assert.equal(p.store, 'ANBL');
  assert.equal(p.amount, 3.49, 'amount is the shelf price (price_cents), tax included');
  assert.equal(p.basePriceCents, 305, 'the tax-exclusive figure rides along, never blended into amount');
  assert.equal(p.region, 'NB');
});

test('one barcode priced in both regions returns both rows, never averaged', () => {
  const out = lookupOwnPricesByBarcode(BARCODE_MULTI, { pricesDbPath: pricesPath, userCataloguePath: join(dir, 'absent-user.db') });
  assert.ok(out.match);
  const got = out.match!.prices.map((p) => [p.region, p.store, p.amount]).sort();
  assert.deepEqual(got, [
    ['BC', 'BC Liquor', 19.99],
    ['NB', 'ANBL', 24.99],
  ]);
});

test('a barcode with no price anywhere answers null, not an error', () => {
  const out = lookupOwnPricesByBarcode('0099999999999', { pricesDbPath: pricesPath, userCataloguePath: userPath });
  assert.equal(out.match, null);
  assert.deepEqual([...out.searched].sort(), ['prices', 'user_catalogue']);
});

test('a price row with no currency is not an answer', () => {
  const out = lookupOwnPricesByBarcode(BARCODE_NO_CURRENCY, { pricesDbPath: pricesPath, userCataloguePath: userPath });
  assert.equal(out.match, null, 'a currency-less row must not be reported as a price');
});

test('a 12-digit spelling of a stored 13-digit barcode still finds it', () => {
  const twelveDigit = BARCODE_BC.replace(/^0/, ''); // '0060000000029' -> '060000000029', still 12 digits
  assert.equal(twelveDigit.length, 12);
  const out = lookupOwnPricesByBarcode(twelveDigit, { pricesDbPath: pricesPath, userCataloguePath: join(dir, 'absent-user.db') });
  assert.ok(out.match, 'canonicalCode should have re-padded this back to the stored 13-digit form');
  assert.equal(out.match!.prices[0].amount, 17.99);
});

test('a price stored under the printed UPC-E is found from the 12-digit UPC-A a reader sends', () => {
  const out = lookupOwnPricesByBarcode(UPCE_LONG, { pricesDbPath: pricesPath, userCataloguePath: join(dir, 'absent-user.db') });
  assert.ok(out.match, 'the short-code row was not found from the long form');
  assert.equal(out.match!.prices[0].amount, 1.49);
  assert.equal(out.match!.prices[0].store, 'ANBL');
});

test('the printed UPC-E itself still finds its own row', () => {
  const out = lookupOwnPricesByBarcode(UPCE_PRINTED, { pricesDbPath: pricesPath, userCataloguePath: join(dir, 'absent-user.db') });
  assert.ok(out.match);
  assert.equal(out.match!.prices[0].amount, 1.49);
});

test('a price stored under the UPC-A is found from the short UPC-E', () => {
  const out = lookupOwnPricesByBarcode(UPCA_SHORT, { pricesDbPath: pricesPath, userCataloguePath: join(dir, 'absent-user.db') });
  assert.ok(out.match, 'the UPC-A row was not found from the short code');
  assert.equal(out.match!.prices[0].amount, 1.29);
});

test('a UPC-A with no short form finds nothing through a twin', () => {
  // 012345678905 has no UPC-E (catalogue/test/upce.test.ts) and no stored price.
  const out = lookupOwnPricesByBarcode('012345678905', { pricesDbPath: pricesPath, userCataloguePath: join(dir, 'absent-user.db') });
  assert.equal(out.match, null);
});

test('a barcode the big catalogue never held: the shelf price is found via user_product.gtin, no catalogue row needed', () => {
  const out = lookupOwnPricesByBarcode(BARCODE_USER_ONLY, { pricesDbPath: join(dir, 'absent-prices.db'), userCataloguePath: userPath });
  assert.ok(out.match, 'expected a match from the user catalogue alone');
  assert.equal(out.match!.prices[0].store, 'Circle K');
  assert.equal(out.match!.prices[0].amount, 2.99);
  assert.equal(out.match!.prices[0].from, 'user_shelf_price');
});

test('a barcode whose scan joined to the catalogue is found via user_observation.catalogue_code', () => {
  const out = lookupOwnPricesByBarcode(BARCODE_CATALOGUE_JOINED, { pricesDbPath: join(dir, 'absent-prices.db'), userCataloguePath: userPath });
  assert.ok(out.match);
  assert.equal(out.match!.prices[0].store, 'No Frills');
  assert.equal(out.match!.prices[0].amount, 2.59);
});

test('a missing prices file and user catalogue degrade to no match, each named in unavailable', () => {
  const out = lookupOwnPricesByBarcode(BARCODE_BC, {
    pricesDbPath: join(dir, 'absent', 'prices.db'),
    userCataloguePath: join(dir, 'absent', 'user-catalogue.db'),
  });
  assert.equal(out.match, null);
  assert.deepEqual([...out.unavailable].sort(), ['prices', 'user_catalogue']);
});

test('never throws on garbage input', () => {
  assert.doesNotThrow(() => lookupOwnPricesByBarcode('', { pricesDbPath: pricesPath, userCataloguePath: userPath }));
  assert.doesNotThrow(() => lookupOwnPricesByBarcode('not-a-barcode-at-all', { pricesDbPath: pricesPath, userCataloguePath: userPath }));
});
