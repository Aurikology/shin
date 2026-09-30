/**
 * Tests for `priceRangeFor`: the price range from Shin's own stored prices.
 *
 * Every database here is in memory. The price side goes through the real
 * `openPrices` and `recordObservation`, so the fixture has the live table's
 * exact shape; the catalogue side is the `product` columns range.ts reads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import {
  priceRangeFor,
  ownProductFromPrices,
  quartiles,
  nearestRankIndex,
  MIN_CATEGORY_PRODUCTS,
  WINDOW_DAYS,
  type RangeInput,
} from '../src/range.ts';

const AS_OF = '2026-09-27';

function obs(over: Partial<ObservationRow>): ObservationRow {
  return {
    code: '0068100084245',
    seller: 'Walmart',
    sellerSku: 'sku',
    sellerName: 'Peanut Butter',
    sellerBrand: 'Kraft',
    priceCents: 500,
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

function prices(rows: readonly ObservationRow[]): DatabaseSync {
  const db = openPrices(':memory:');
  for (const r of rows) recordObservation(db, r);
  return db;
}

interface Prod {
  code: string;
  size_value?: number | null;
  size_unit?: string | null;
  quantity?: string | null;
  path: string[];
}

function catalogue(products: readonly Prod[]): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE product (
    code TEXT PRIMARY KEY, name TEXT NOT NULL, quantity TEXT, size_value REAL, size_unit TEXT,
    category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  const ins = db.prepare(
    'INSERT INTO product (code, name, quantity, size_value, size_unit, category_path, leaf_category) VALUES (?,?,?,?,?,?,?)',
  );
  for (const p of products) {
    ins.run(p.code, 'x', p.quantity ?? null, p.size_value ?? null, p.size_unit ?? null, JSON.stringify(p.path), p.path[p.path.length - 1] ?? null);
  }
  return db;
}

const LEAF = ['en:spreads', 'en:nut-butters', 'en:peanut-butters'];
const SIBLING = ['en:spreads', 'en:nut-butters', 'en:almond-butters'];
const SELF = '0068100084245';

/** Three shops pricing this product: Walmart, and two Open Prices shops. */
function ownRows(cents: readonly number[]): ObservationRow[] {
  return cents.map((c, i) =>
    obs({ seller: i === 0 ? 'Walmart' : 'openprices', sellerSku: `s${i}`, storeOsm: i === 0 ? null : `NODE/${i}`, priceCents: c }),
  );
}

/** `count` other products in a category, each 500 g, one price each at Walmart. */
function categoryFixture(count: number, path: string[], firstCode = 1000, startCents = 400, sizeG = 500) {
  const prods: Prod[] = [];
  const rows: ObservationRow[] = [];
  for (let i = 0; i < count; i++) {
    const code = String(firstCode + i).padStart(13, '0');
    prods.push({ code, size_value: sizeG, size_unit: 'g', path });
    rows.push(obs({ code, sellerSku: `c${code}`, priceCents: startCents + i * 100 }));
  }
  return { prods, rows };
}

function input(over: Partial<RangeInput> = {}): RangeInput {
  return { barcode: SELF, size: '1 kg', leafCategory: 'en:peanut-butters', categoryPath: LEAF, asOf: AS_OF, ...over };
}

/* ---------------------------------------------------------- percentiles */

test('nearest-rank quartiles on 1, 2, 4 and 5 values', () => {
  assert.deepEqual(quartiles([700]), { low: 700, median: 700, high: 700 });
  assert.deepEqual(quartiles([900, 100]), { low: 100, median: 100, high: 900 });
  assert.deepEqual(quartiles([400, 100, 300, 200]), { low: 100, median: 200, high: 300 });
  assert.deepEqual(quartiles([500, 100, 400, 200, 300]), { low: 200, median: 300, high: 400 });
  assert.equal(nearestRankIndex(5, 25), 1);
  assert.equal(nearestRankIndex(5, 75), 3);
  assert.throws(() => nearestRankIndex(0, 50));
});

/* --------------------------------------------------------- this_product */

test('this_product with three shops is the range over them', () => {
  const r = priceRangeFor(input(), { prices: prices(ownRows([599, 499, 549])), catalogue: catalogue([]) });
  assert.equal(r.basis, 'this_product');
  if (r.basis !== 'this_product') return;
  assert.equal(r.lowCents, 499);
  assert.equal(r.medianCents, 549);
  assert.equal(r.highCents, 599);
  assert.equal(r.n, 3);
  assert.equal(r.sellers, 2);
  assert.equal(r.spread, 1.2);
  assert.ok(Number.isInteger(r.lowCents) && Number.isInteger(r.highCents));
});

test('ONE shop is enough: its price is the answer, carrying the store and the date', () => {
  const r = priceRangeFor(input(), { prices: prices([obs({ seller: 'bcldb', sellerSku: 'only', priceCents: 4299, seenOn: '2026-09-21' })]), catalogue: null });
  assert.equal(r.basis, 'this_product');
  if (r.basis !== 'this_product') return;
  assert.equal(r.lowCents, 4299);
  assert.equal(r.medianCents, 4299);
  assert.equal(r.highCents, 4299);
  assert.equal(r.n, 1);
  assert.equal(r.store, 'bcldb');
  assert.equal(r.newest, '2026-09-21');
  assert.equal(r.oldest, '2026-09-21');
  assert.equal(r.spread, 1);
  assert.equal(r.tried[0]!.outcome, 'used');
});

test('one Open Prices row carries the actual shop, with its city', () => {
  const r = priceRangeFor(input(), {
    prices: prices([obs({ seller: 'openprices', sellerSku: 'op', storeName: 'Marché Adonis', storeCity: 'Brossard', storeOsm: 'NODE/7', priceCents: 649 })]),
    catalogue: null,
  });
  assert.equal(r.basis, 'this_product');
  if (r.basis === 'this_product') {
    assert.equal(r.store, 'openprices');
    assert.equal(r.shop, 'Marché Adonis, Brossard');
  }
});

test('two shops are a range; a shop crawled daily still counts once', () => {
  const rows = [
    ...ownRows([599, 499]),
    obs({ sellerSku: 's0', seenOn: '2026-09-21', priceCents: 505 }),
    obs({ sellerSku: 's0', seenOn: '2026-09-22', priceCents: 510 }),
  ];
  const r = priceRangeFor(input({ leafCategory: null, categoryPath: [] }), { prices: prices(rows), catalogue: null });
  assert.equal(r.basis, 'this_product');
  if (r.basis !== 'this_product') return;
  assert.equal(r.n, 2, 'two shops, not four rows');
  assert.equal(r.store, null);
});

test('ownProductFromPrices names the product by the newest store row and ranges over its shops', () => {
  const rows = [
    obs({ seller: 'bcldb', sellerSku: 'a', sellerName: 'Old Name 750 ml', priceCents: 2000, seenOn: '2026-09-01' }),
    obs({ seller: 'anbl', sellerSku: 'b', sellerName: 'Newest Name 750 ml', priceCents: 2400, seenOn: '2026-09-25' }),
  ];
  const p = ownProductFromPrices(prices(rows), SELF, { asOf: AS_OF });
  assert.ok(p);
  assert.equal(p.name, 'Newest Name 750 ml');
  assert.equal(p.range.n, 2);
  assert.equal(p.range.store, null);
  assert.equal(p.range.newest, '2026-09-25');
  assert.equal(ownProductFromPrices(prices(rows), '0000000000017', { asOf: AS_OF }), null);
  assert.equal(ownProductFromPrices(prices([obs({ priceCents: 500, seenOn: '2025-01-01' })]), SELF, { asOf: AS_OF }), null, 'a stale price is not an answer');
});

test('no shop at all still falls through, with the own step recorded as too_few', () => {
  const r = priceRangeFor(input({ leafCategory: null, categoryPath: [] }), { prices: prices([]), catalogue: null });
  assert.equal(r.basis, 'none');
  assert.equal(r.n, 0);
  assert.equal(r.tried[0]!.outcome, 'too_few');
});

test('the barcode matches across 12 and 13 digit spellings', () => {
  const rows = ownRows([300, 310, 320]).map((o) => ({ ...o, code: '068100084245' }));
  const r = priceRangeFor(input(), { prices: prices(rows), catalogue: null });
  assert.equal(r.basis, 'this_product');
});

test('stale, future-dated, promotional and other-currency prices are ignored', () => {
  const stale = new Date(Date.parse(AS_OF) - (WINDOW_DAYS + 1) * 86_400_000).toISOString().slice(0, 10);
  const edge = new Date(Date.parse(AS_OF) - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const rows = [
    obs({ sellerSku: 'a', priceCents: 500 }),
    obs({ sellerSku: 'b', seller: 'Loblaws', priceCents: 520, seenOn: edge }),
    obs({ sellerSku: 'c', seller: 'Metro', priceCents: 100, seenOn: stale }),
    obs({ sellerSku: 'd', seller: 'Sobeys', priceCents: 100, seenOn: '2026-10-05' }),
    obs({ sellerSku: 'e', seller: 'Costco', priceCents: 100, kind: 'promotional' }),
    obs({ sellerSku: 'f', seller: 'Target', priceCents: 100, currency: 'USD' }),
  ];
  const r = priceRangeFor(input({ leafCategory: null, categoryPath: [] }), { prices: prices(rows), catalogue: null });
  assert.equal(r.basis, 'this_product');
  assert.equal(r.n, 2, 'only the in-window row and the one exactly at the window edge count');
  if (r.basis === 'this_product') {
    assert.equal(r.lowCents, 500, 'none of the 100-cent rows got in');
    assert.equal(r.highCents, 520);
  }

  const withThird = [...rows, obs({ sellerSku: 'g', seller: 'Metro', priceCents: 510 })];
  const r2 = priceRangeFor(input(), { prices: prices(withThird), catalogue: null });
  assert.equal(r2.basis, 'this_product');
  if (r2.basis === 'this_product') {
    assert.equal(r2.lowCents, 500);
    assert.equal(r2.highCents, 520);
    assert.equal(r2.oldest, edge);
  }
});

test('an unjoined row (code NULL) never counts', () => {
  const rows = [...ownRows([500, 510]), obs({ code: null, joinMethod: 'none', sellerSku: 'u', seller: 'Metro', priceCents: 520 })];
  const r = priceRangeFor(input({ leafCategory: null, categoryPath: [] }), { prices: prices(rows), catalogue: null });
  assert.equal(r.basis, 'this_product');
  if (r.basis !== 'this_product') return;
  assert.equal(r.n, 2, 'the unjoined 520 is not a third shop');
  assert.equal(r.highCents, 510);
});

/* ------------------------------------------------------- leaf_category */

test('leaf_category at exactly five products, scaled to this size', () => {
  assert.equal(MIN_CATEGORY_PRODUCTS, 5);
  // Five 500 g jars at 400..800 cents; this product is 1 kg.
  const { prods, rows } = categoryFixture(5, LEAF);
  const r = priceRangeFor(input(), {
    prices: prices(rows),
    catalogue: catalogue([...prods, { code: SELF, size_value: 1000, size_unit: 'g', path: LEAF }]),
  });
  assert.equal(r.basis, 'leaf_category');
  if (r.basis !== 'leaf_category') return;
  assert.equal(r.category, 'en:peanut-butters');
  assert.equal(r.n, 5, 'the product itself is left out of its own category sample');
  assert.equal(r.lowCents, 1000); // 2nd of 5: 500 per 500 g, doubled
  assert.equal(r.medianCents, 1200);
  assert.equal(r.highCents, 1400); // 4th of 5
  assert.deepEqual(r.unit, { label: '100 g', lowCents: 100, highCents: 140 });
  assert.equal(r.spread, 1.4);
  assert.deepEqual(r.tried.map((t) => t.outcome), ['too_few', 'used']);
});

test('a one-shop own price wins over a category that has five products', () => {
  const { prods, rows } = categoryFixture(5, LEAF);
  const r = priceRangeFor(input(), {
    prices: prices([...rows, ...ownRows([999])]),
    catalogue: catalogue([...prods, { code: SELF, size_value: 1000, size_unit: 'g', path: LEAF }]),
  });
  assert.equal(r.basis, 'this_product');
  if (r.basis === 'this_product') assert.equal(r.lowCents, 999);
});

test('four leaf products fall through to the parent, which has five', () => {
  const leaf = categoryFixture(4, LEAF);
  const sib = categoryFixture(1, SIBLING, 2000, 600);
  const r = priceRangeFor(input(), { prices: prices([...leaf.rows, ...sib.rows]), catalogue: catalogue([...leaf.prods, ...sib.prods]) });
  assert.equal(r.basis, 'parent_category');
  if (r.basis !== 'parent_category') return;
  assert.equal(r.category, 'en:nut-butters');
  assert.equal(r.n, 5);
  assert.deepEqual(
    r.tried.map((t) => [t.basis, t.n, t.outcome]),
    [
      ['this_product', 0, 'too_few'],
      ['leaf_category', 4, 'too_few'],
      ['parent_category', 5, 'used'],
    ],
  );
});

test('never the grandparent: products only there do not count', () => {
  const leaf = categoryFixture(2, LEAF);
  const cousins = categoryFixture(6, ['en:spreads', 'en:jams'], 3000);
  const r = priceRangeFor(input(), { prices: prices([...leaf.rows, ...cousins.rows]), catalogue: catalogue([...leaf.prods, ...cousins.prods]) });
  assert.equal(r.basis, 'none');
  if (r.basis !== 'none') return;
  assert.equal(r.reason, 'too_few_prices');
  assert.equal(r.spread, null);
  assert.ok(!r.tried.some((t) => t.category === 'en:spreads'));
});

test('a missing size skips both category steps', () => {
  const { prods, rows } = categoryFixture(8, LEAF);
  const r = priceRangeFor(input({ size: null }), { prices: prices(rows), catalogue: catalogue(prods) });
  assert.equal(r.basis, 'none');
  if (r.basis !== 'none') return;
  assert.equal(r.reason, 'size_unknown');
  assert.deepEqual(r.tried.slice(1).map((t) => t.outcome), ['no_size', 'no_size']);
});

test('the catalogue row supplies the size when the caller has none', () => {
  const { prods, rows } = categoryFixture(5, LEAF);
  const r = priceRangeFor(input({ size: null }), {
    prices: prices(rows),
    catalogue: catalogue([...prods, { code: SELF, quantity: '250 g', path: LEAF }]),
  });
  assert.equal(r.basis, 'leaf_category');
  if (r.basis === 'leaf_category') assert.equal(r.lowCents, 250);
});

test('products in another dimension, or with no size, are skipped', () => {
  const { prods, rows } = categoryFixture(4, LEAF);
  const litre = { code: '0000000009001', size_value: 1, size_unit: 'l', path: LEAF };
  const unsized = { code: '0000000009002', path: LEAF };
  const extra = [obs({ code: litre.code, sellerSku: 'l1', priceCents: 300 }), obs({ code: unsized.code, sellerSku: 'l2', priceCents: 300 })];
  const r = priceRangeFor(input({ categoryPath: ['en:peanut-butters'] }), {
    prices: prices([...rows, ...extra]),
    catalogue: catalogue([...prods, litre, unsized]),
  });
  assert.equal(r.basis, 'none');
  assert.equal(r.tried[1]!.n, 4);
  // And a volume product against a mass category is the same skip from the other side.
  const r2 = priceRangeFor(input({ size: '750 ml' }), { prices: prices(categoryFixture(6, LEAF).rows), catalogue: catalogue(categoryFixture(6, LEAF).prods) });
  assert.equal(r2.basis, 'none');
});

test('scaling rounds once, to whole cents', () => {
  // Five 300 g products at 199, 299, 399, 499, 599; this product is 500 g.
  const { prods, rows } = categoryFixture(5, LEAF, 1000, 199, 300);
  const r = priceRangeFor(input({ size: '500 g' }), { prices: prices(rows), catalogue: catalogue(prods) });
  assert.equal(r.basis, 'leaf_category');
  if (r.basis !== 'leaf_category') return;
  assert.equal(r.lowCents, 498); // 299 * 500 / 300 = 498.33
  assert.equal(r.highCents, 832); // 499 * 500 / 300 = 831.67
  assert.equal(r.medianCents, 665); // 399 * 500 / 300 = 665
  assert.ok([r.lowCents, r.highCents, r.medianCents, r.unit.lowCents, r.unit.highCents].every(Number.isInteger));
});

/* ----------------------------------------------------------------- none */

test('no barcode and no category is none, with that reason', () => {
  const r = priceRangeFor({ name: 'mystery', asOf: AS_OF }, { prices: prices([]), catalogue: catalogue([]) });
  assert.equal(r.basis, 'none');
  if (r.basis === 'none') {
    assert.equal(r.reason, 'no_barcode_and_no_category');
    assert.equal(r.n, 0);
  }
});
