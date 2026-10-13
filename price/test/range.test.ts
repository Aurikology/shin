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
  quartiles,
  nearestRankIndex,
  MIN_OWN_SHOPS,
  MIN_CATEGORY_PRODUCTS,
  WINDOW_DAYS,
  MIN_RANGE_RATIO,
  MIN_RANGE_SIGMA,
  type RangeInput,
} from '../src/range.ts';
import { MIN_SIGMA } from '../src/estimate.ts';

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
  source?: string | null;
}

function catalogue(products: readonly Prod[]): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE product (
    code TEXT PRIMARY KEY, name TEXT NOT NULL, quantity TEXT, size_value REAL, size_unit TEXT,
    category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT, source TEXT)`);
  const ins = db.prepare(
    'INSERT INTO product (code, name, quantity, size_value, size_unit, category_path, leaf_category, source) VALUES (?,?,?,?,?,?,?,?)',
  );
  for (const p of products) {
    ins.run(p.code, 'x', p.quantity ?? null, p.size_value ?? null, p.size_unit ?? null, JSON.stringify(p.path), p.path[p.path.length - 1] ?? null, p.source ?? null);
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

test('this_product at exactly the shop threshold', () => {
  assert.equal(MIN_OWN_SHOPS, 3);
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

test('one below the shop threshold falls through, and one shop crawled daily counts once', () => {
  const rows = [
    ...ownRows([599, 499]),
    obs({ sellerSku: 's0', seenOn: '2026-09-21', priceCents: 505 }),
    obs({ sellerSku: 's0', seenOn: '2026-09-22', priceCents: 510 }),
  ];
  const r = priceRangeFor(input({ leafCategory: null, categoryPath: [] }), { prices: prices(rows), catalogue: null });
  assert.equal(r.basis, 'none');
  assert.equal(r.n, 2);
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
  assert.equal(r.basis, 'none');
  assert.equal(r.n, 2, 'only the in-window row and the one exactly at the window edge count');

  const withThird = [...rows, obs({ sellerSku: 'g', seller: 'Metro', priceCents: 510 })];
  const r2 = priceRangeFor(input(), { prices: prices(withThird), catalogue: null });
  assert.equal(r2.basis, 'this_product');
  if (r2.basis === 'this_product') {
    // 500 to 520 is narrower than the floor (3.4), so the ends widen around the middle; the observed ends stay inside.
    assert.ok(r2.lowCents <= 500 && r2.highCents >= 520);
    assert.ok(r2.highCents / r2.lowCents >= MIN_RANGE_RATIO);
    assert.equal(r2.widened, 'minimum');
    assert.equal(r2.oldest, edge);
  }
});

test('an unjoined row (code NULL) never counts', () => {
  const rows = [...ownRows([500, 510]), obs({ code: null, joinMethod: 'none', sellerSku: 'u', seller: 'Metro', priceCents: 520 })];
  const r = priceRangeFor(input({ leafCategory: null, categoryPath: [] }), { prices: prices(rows), catalogue: null });
  assert.equal(r.basis, 'none');
});

/* ------------------------------------------------------- leaf_category */

test('leaf_category at exactly five products, scaled to this size', () => {
  assert.equal(MIN_CATEGORY_PRODUCTS, 5);
  // Five 500 g jars at 400..800 cents; this product is 1 kg.
  const { prods, rows } = categoryFixture(5, LEAF);
  const r = priceRangeFor(input(), {
    prices: prices([...rows, ...ownRows([999])]),
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

/* ------------------------------------------------- 3.4 never one price */

/*
 * Requirement 3.4: never answer with a single store's price; every answer is a range. Plan Method A:
 * a minimum width, never below the category's spread (docs/verdict-distribution-design-2026-09-30.md,
 * "Spread": all-same prices cannot collapse the bell), never below the verdict's own floor.
 */

test('3.4: the floor is the verdict floor read at the quartiles', () => {
  assert.equal(MIN_RANGE_SIGMA, MIN_SIGMA, 'range.ts and estimate.ts share one floor');
  assert.ok(Math.abs(MIN_RANGE_RATIO - Math.exp(2 * 0.6744897501960817 * MIN_SIGMA)) < 1e-12);
  assert.ok(MIN_RANGE_RATIO > 1.06 && MIN_RANGE_RATIO < 1.08);
});

test('3.4: three shops at one price are still a range, never one price', () => {
  const r = priceRangeFor(input({ leafCategory: null, categoryPath: [] }), { prices: prices(ownRows([499, 499, 499])), catalogue: null });
  assert.equal(r.basis, 'this_product');
  if (r.basis !== 'this_product') return;
  assert.ok(r.highCents > r.lowCents, `${r.lowCents}..${r.highCents}`);
  assert.ok(r.highCents / r.lowCents >= MIN_RANGE_RATIO);
  assert.ok(r.lowCents < 499 && r.highCents > 499);
  assert.equal(r.medianCents, 499);
  assert.equal(r.widened, 'minimum');
  assert.ok(r.spread > 1);
});

test('3.4: own prices narrower than their category widen to the category spread', () => {
  // Five 500 g jars at 500..660 cents (under the width flag's 1.5x): the leaf's quartiles are 540 and 620, about 1.15x.
  const prods: Prod[] = [];
  const rows: ObservationRow[] = [];
  [500, 540, 580, 620, 660].forEach((c, i) => {
    const code = String(4000 + i).padStart(13, '0');
    prods.push({ code, size_value: 500, size_unit: 'g', path: LEAF });
    rows.push(obs({ code, sellerSku: `j${i}`, priceCents: c }));
  });
  const r = priceRangeFor(input({ size: '500 g' }), {
    prices: prices([...rows, ...ownRows([600, 600, 610])]),
    catalogue: catalogue([...prods, { code: SELF, size_value: 500, size_unit: 'g', path: LEAF }]),
  });
  assert.equal(r.basis, 'this_product');
  if (r.basis !== 'this_product') return;
  assert.equal(r.widened, 'category_spread');
  assert.ok(r.highCents / r.lowCents >= 620 / 540, `${r.lowCents}..${r.highCents}`);
  assert.equal(r.medianCents, 600);
});

test('3.4: own prices already wider than the floor are left exactly as the shops priced them', () => {
  const r = priceRangeFor(input({ leafCategory: null, categoryPath: [] }), { prices: prices(ownRows([599, 499, 549])), catalogue: null });
  assert.equal(r.basis, 'this_product');
  if (r.basis !== 'this_product') return;
  assert.equal(r.widened, null);
  assert.deepEqual([r.lowCents, r.highCents], [499, 599]);
});

test('3.4: a category whose products all agree is still a range', () => {
  const prods: Prod[] = [];
  const rows: ObservationRow[] = [];
  for (let i = 0; i < 5; i++) {
    const code = String(3000 + i).padStart(13, '0');
    prods.push({ code, size_value: 500, size_unit: 'g', path: LEAF });
    rows.push(obs({ code, sellerSku: `z${i}`, priceCents: 450 }));
  }
  const r = priceRangeFor(input({ size: '500 g' }), { prices: prices(rows), catalogue: catalogue(prods) });
  assert.equal(r.basis, 'leaf_category');
  if (r.basis !== 'leaf_category') return;
  assert.ok(r.highCents > r.lowCents);
  assert.ok(r.highCents / r.lowCents >= MIN_RANGE_RATIO);
  assert.equal(r.widened, 'minimum');
});

test('3.4: property, over 300 random one-price items no answer is a single price or under the floor', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let k = 0; k < 300; k++) {
    const cents = 1 + Math.floor(rand() * 20000);
    const shops = 3 + Math.floor(rand() * 6);
    const r = priceRangeFor(input({ leafCategory: null, categoryPath: [] }), { prices: prices(ownRows(Array(shops).fill(cents))), catalogue: null });
    assert.equal(r.basis, 'this_product');
    if (r.basis !== 'this_product') continue;
    assert.ok(Number.isInteger(r.lowCents) && Number.isInteger(r.highCents));
    assert.ok(r.lowCents >= 1);
    assert.ok(r.highCents > r.lowCents, `${cents}: ${r.lowCents}..${r.highCents}`);
    assert.ok(r.highCents / r.lowCents >= MIN_RANGE_RATIO, `${cents}: ${r.lowCents}..${r.highCents}`);
  }
});

/* ------------------------------------------------ 3.3 one department */

test("3.3: a category tag two departments share pools only the item's own department", () => {
  const shared = ['en:treats'];
  const prods: Prod[] = [];
  const rows: ObservationRow[] = [];
  const add = (source: string, cents: number[], base: number) =>
    cents.forEach((c, i) => {
      const code = String(base + i).padStart(13, '0');
      prods.push({ code, size_value: 500, size_unit: 'g', path: shared, source });
      rows.push(obs({ code, sellerSku: `t${base + i}`, priceCents: c }));
    });
  add('openfoodfacts', [300, 320, 340, 360, 380], 5000);
  add('openpetfoodfacts', [1500, 1600, 1700, 1800, 1900], 6000);
  const pet = priceRangeFor(input({ size: '500 g', leafCategory: 'en:treats', categoryPath: shared }), {
    prices: prices(rows),
    catalogue: catalogue([...prods, { code: SELF, size_value: 500, size_unit: 'g', path: shared, source: 'openpetfoodfacts' }]),
  });
  assert.equal(pet.basis, 'leaf_category');
  if (pet.basis !== 'leaf_category') return;
  assert.deepEqual([pet.lowCents, pet.medianCents, pet.highCents], [1600, 1700, 1800]);

  // No catalogue row: the department is unknown and the pool spans two, so it is refused.
  const unknown = priceRangeFor(input({ barcode: null, size: '500 g', leafCategory: 'en:treats', categoryPath: shared }), {
    prices: prices(rows),
    catalogue: catalogue(prods),
  });
  assert.equal(unknown.basis, 'none');
  assert.ok(unknown.tried.some((t) => t.basis === 'leaf_category' && t.outcome === 'mixed_departments'), JSON.stringify(unknown.tried));
});

/* ---------------------------------------------- 3.6 no sale in a centre */

/*
 * Requirement 3.6: keep sale prices out of the typical price (0 sale prices in any centre). The
 * negative control from the plan: a sale row at half price is added, and the answer must not move.
 * A sale is the source's own mark: kind 'promotional', or is_sale = 1 (a sale tag or a printed
 * "was" price), the same rule estimate.ts reads.
 */

test('3.6: a half-price row the source marks as a sale moves no own range, by kind or by sale flag', () => {
  const base = ownRows([500, 520, 540]);
  const clean = priceRangeFor(input({ leafCategory: null, categoryPath: [] }), { prices: prices(base), catalogue: null });
  const sales = [
    obs({ sellerSku: 'p1', seller: 'Sobeys', priceCents: 250, kind: 'promotional' }),
    obs({ sellerSku: 'p2', seller: 'Metro', priceCents: 260, isSale: 1 }),
    obs({ sellerSku: 'p3', seller: 'Loblaws', priceCents: 270, isSale: 1, wasCents: 540 }),
  ];
  const withSales = priceRangeFor(input({ leafCategory: null, categoryPath: [] }), { prices: prices([...base, ...sales]), catalogue: null });
  assert.equal(withSales.basis, 'this_product');
  assert.deepEqual(withSales, clean);
});

test('3.6: a half-price sale row moves no category range', () => {
  const { prods, rows } = categoryFixture(5, LEAF);
  const cat = catalogue([...prods, { code: SELF, size_value: 1000, size_unit: 'g', path: LEAF }]);
  const clean = priceRangeFor(input(), { prices: prices(rows), catalogue: cat });
  const sales = prods.map((p, i) => obs({ code: p.code, sellerSku: `s${p.code}`, seller: 'Metro', priceCents: 150 + i, isSale: 1 }));
  const withSales = priceRangeFor(input(), { prices: prices([...rows, ...sales]), catalogue: cat });
  assert.equal(clean.basis, 'leaf_category');
  assert.deepEqual(withSales, clean);
});

test("3.6 rows: a printout row is never the item's own price, and unverified it counts nowhere", () => {
  // Three printout tiles for this product: not its own prices, so no own range.
  const tiles = [500, 510, 520].map((c, i) => obs({ sellerSku: `t${i}`, seller: `Shop${i}`, priceCents: c, captureTileId: i + 1, priceVerified: 1 }));
  const own = priceRangeFor(input({ leafCategory: null, categoryPath: [] }), { prices: prices(tiles), catalogue: null });
  assert.equal(own.basis, 'none');
  // An unverified tile in a category pool: left out, so four products are too few.
  const { prods, rows } = categoryFixture(4, LEAF);
  const extra = { code: String(2999).padStart(13, '0'), size_value: 500, size_unit: 'g', path: LEAF };
  const unverified = obs({ code: extra.code, sellerSku: 'u', priceCents: 600, captureTileId: 9, priceVerified: 0 });
  const cat = catalogue([...prods, extra, { code: SELF, size_value: 1000, size_unit: 'g', path: LEAF }]);
  assert.equal(priceRangeFor(input(), { prices: prices([...rows, unverified]), catalogue: cat }).basis, 'none');
  // Verified, it counts at category level.
  const verified = { ...unverified, priceVerified: 1 };
  assert.equal(priceRangeFor(input(), { prices: prices([...rows, verified]), catalogue: cat }).basis, 'leaf_category');
});
