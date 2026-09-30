/**
 * Tests for `estimate`: the price verdict as a distribution
 * (docs/verdict-distribution-design-2026-09-30.md). One test per design case
 * with a server behaviour, named by its case number.
 *
 * Every database is in memory. Prices go through the real `openPrices` and
 * `recordObservation`; the catalogue is the `product` columns estimate.ts
 * reads. The Claude rung is always a stub: no model is called.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import {
  estimate,
  productKey,
  readThresholds,
  VERDICT_FIELDS,
  Z10,
  type ClaudeAnswer,
  type EstimateDeps,
  type EstimateItem,
} from '../src/estimate.ts';

const AS_OF = '2026-09-30';
const LEAF = ['en:beverages', 'en:spirits', 'en:vodkas'];
const PARENT_ONLY = ['en:beverages', 'en:spirits', 'en:gins'];

let sku = 0;
function obs(over: Partial<ObservationRow>): ObservationRow {
  sku += 1;
  return {
    code: null,
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
    region: null,
    joinMethod: 'gtin',
    seenOn: '2026-09-20',
    url: null,
    imageUrl: null,
    inStock: null,
    ...over,
  };
}

function pricesDb(rows: readonly ObservationRow[]): DatabaseSync {
  const db = openPrices(':memory:');
  for (const r of rows) recordObservation(db, r);
  return db;
}

interface Prod {
  code: string;
  name?: string;
  brand?: string | null;
  quantity?: string | null;
  size_value?: number | null;
  size_unit?: string | null;
  path?: string[];
}

function catalogueDb(products: readonly Prod[]): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE product (
    code TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT, brands TEXT, quantity TEXT, size_value REAL, size_unit TEXT,
    category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  const ins = db.prepare(
    'INSERT INTO product (code, name, name_en, brands, quantity, size_value, size_unit, category_path, leaf_category) VALUES (?,?,?,?,?,?,?,?,?)',
  );
  for (const p of products) {
    const path = p.path ?? [];
    ins.run(p.code, p.name ?? 'x', p.name ?? null, p.brand ?? null, p.quantity ?? null, p.size_value ?? null, p.size_unit ?? null, JSON.stringify(path), path[path.length - 1] ?? null);
  }
  return db;
}

/** Five vodkas at 750 ml, one price each: the leaf has a centre and a spread. */
const LEAF_PRICES = [2000, 2200, 2500, 2800, 3000];
function leafFixture(extraProducts: Prod[] = [], extraRows: ObservationRow[] = [], leafPrices = LEAF_PRICES) {
  const prods: Prod[] = leafPrices.map((_, i) => ({ code: `10000000000${i}`, name: `Vodka ${i}`, brand: `B${i}`, quantity: '750 ml', path: LEAF }));
  const rows = leafPrices.map((c, i) => obs({ code: `10000000000${i}`, priceCents: c, seller: `shop${i}` }));
  return {
    catalogue: catalogueDb([...prods, ...extraProducts]),
    prices: pricesDb([...rows, ...extraRows]),
  };
}

const SELF = '0626990000001';
const item = (over: Partial<EstimateItem> = {}): EstimateItem => ({ barcode: SELF, asOf: AS_OF, currency: 'CAD', country: 'CA', ...over });
const noClaude = async (): Promise<ClaudeAnswer> => {
  throw new Error('the Claude rung must not be reached here');
};
const leafMu = Math.log(2500);

function close(a: number, b: number, tol = 1e-6): void {
  assert.ok(Math.abs(a - b) <= tol, `${a} is not ${b}`);
}

/* ------------------------------------------------------------ contract */

test('the verdict carries exactly the contract fields, in order', async () => {
  const { prices, catalogue } = leafFixture([{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }], [obs({ code: SELF, priceCents: 2400 })]);
  const { verdict } = await estimate(item(), { cents: 2400 }, { prices, catalogue });
  assert.deepEqual(Object.keys(verdict), [...VERDICT_FIELDS]);
  assert.equal(verdict.kind, 'distribution');
  assert.deepEqual(Object.keys(verdict.shopper!), ['cents', 'zone', 'offByPct', 'beyond', 'suspect']);
  assert.deepEqual(Object.keys(verdict.thresholds), ['greatPct', 'goodPct', 'badPct', 'fromShopper']);
  assert.deepEqual(Object.keys(verdict.dots[0]!), ['cents', 'store', 'city', 'seenOn', 'kind', 'quantity']);
  // p10/p90 are exp(mu -/+ 1.2816 sigma), on log price.
  const mu = Math.log(verdict.centreCents);
  assert.ok(Math.abs(verdict.p10Cents - Math.exp(mu - Z10 * verdict.sigmaLog)) < 2);
  assert.ok(Math.abs(verdict.p90Cents - Math.exp(mu + Z10 * verdict.sigmaLog)) < 2);
});

/* ------------------------------------------------------------ identity */

test('case 1: a catalogue barcode with own prices blends own and category, spread from the category', async () => {
  const { prices, catalogue } = leafFixture(
    [{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }],
    [obs({ code: SELF, priceCents: 2000, seller: 'a' }), obs({ code: SELF, priceCents: 2000, seller: 'b' })],
  );
  const { verdict } = await estimate(item(), null, { prices, catalogue, askClaude: noClaude });
  assert.equal(verdict.basis, 'own_prices');
  assert.equal(verdict.spreadFrom, 'leaf_category');
  assert.equal(verdict.n, 2);
  // mu = (2 * ln 2000 + 1 * ln 2500) / 3
  assert.equal(verdict.centreCents, Math.round(Math.exp((2 * Math.log(2000) + leafMu) / 3)));
  assert.equal(verdict.confidence, 'medium');
});

test('case 2: a priced barcode missing from the catalogue takes the store name, is sorted by name, and keeps the category spread', async () => {
  const { prices, catalogue } = leafFixture([], [obs({ code: SELF, priceCents: 2600, sellerName: 'Glacier Vodka 750 ml', seller: 'bcldb' })]);
  let sortedName = '';
  const { verdict, trace } = await estimate(item(), null, {
    prices,
    catalogue,
    sortName: async (name) => {
      sortedName = name;
      return { leafCategory: 'en:vodkas', categoryPath: LEAF };
    },
  });
  assert.equal(sortedName, 'Glacier Vodka 750 ml');
  assert.equal(trace.name, 'Glacier Vodka 750 ml');
  assert.equal(verdict.basis, 'own_prices');
  assert.equal(verdict.spreadFrom, 'leaf_category');
  assert.equal(verdict.centreCents, Math.round(Math.exp((Math.log(2600) + leafMu) / 2)));
});

test('case 3: in the catalogue with no price, the leaf unit price times this size', async () => {
  // Five 1 kg peanut butters, this one 2 kg: scaled x2 (the pack-size band is half to double).
  const path = ['en:spreads', 'en:peanut-butters'];
  const prods = [0, 1, 2, 3, 4].map((i) => ({ code: `20000000000${i}`, name: `PB ${i}`, quantity: '1 kg', path }));
  const rows = [500, 550, 600, 650, 700].map((c, i) => obs({ code: `20000000000${i}`, priceCents: c, seller: `s${i}` }));
  const catalogue = catalogueDb([...prods, { code: SELF, name: 'Big PB', quantity: '2 kg', path }]);
  const { verdict } = await estimate(item(), null, { prices: pricesDb(rows), catalogue, askClaude: noClaude });
  assert.equal(verdict.basis, 'leaf_category');
  assert.equal(verdict.centreCents, 1200);
  assert.equal(verdict.scaledTo, '2 kg');
  assert.deepEqual(verdict.perUnit, { label: 'per 100 g', centreCents: 60 });
  assert.equal(verdict.n, 5);
});

test('case 4: no size, read from the name; none there either, a per-item bell noted size_assumed and wider', async () => {
  const { prices, catalogue } = leafFixture([{ code: SELF, name: 'Mystery Vodka', path: LEAF }]);
  const fromName = await estimate(item({ name: 'Mystery Vodka 750 ml' }), null, { prices, catalogue, askClaude: noClaude });
  assert.equal(fromName.verdict.scaledTo, '750 ml');
  assert.ok(!fromName.verdict.notes.includes('size_assumed'));

  const none = await estimate(item({ name: 'Mystery Vodka' }), null, { prices, catalogue, askClaude: noClaude });
  assert.equal(none.verdict.basis, 'leaf_category');
  assert.ok(none.verdict.notes.includes('size_assumed'));
  assert.equal(none.verdict.scaledTo, null);
  assert.equal(none.verdict.perUnit, null);
  close(none.verdict.sigmaLog, Math.round(fromName.verdict.sigmaLog * 1.25 * 10000) / 10000, 2e-4);
});

test('case 5: no category, the name is sorted; nothing sorts, Claude typical', async () => {
  const { prices, catalogue } = leafFixture();
  const sorted = await estimate(item({ barcode: null, name: 'Some vodka', size: '750 ml' }), null, {
    prices,
    catalogue,
    sortName: async () => ({ leafCategory: 'en:vodkas', categoryPath: LEAF }),
    askClaude: noClaude,
  });
  assert.equal(sorted.verdict.basis, 'leaf_category');

  const unsorted = await estimate(item({ barcode: null, name: 'Some vodka', size: '750 ml' }), null, {
    prices,
    catalogue,
    sortName: async () => null,
    askClaude: async () => ({ ok: true, lowCents: 1800, highCents: 3200, currency: 'CAD' }),
  });
  assert.equal(unsorted.verdict.basis, 'claude_typical');
  assert.equal(unsorted.verdict.spreadFrom, 'claude');
  assert.ok(unsorted.verdict.notes.includes('claude_estimate'));
  // Claude's low / high read as p10 / p90.
  assert.ok(Math.abs(unsorted.verdict.p10Cents - 1800) <= 1);
  assert.ok(Math.abs(unsorted.verdict.p90Cents - 3200) <= 1);
  assert.equal(unsorted.verdict.confidence, 'low');
});

test('case 8: a typed name matching nothing asks Claude from the typed name alone', async () => {
  let asked: unknown = null;
  const { verdict } = await estimate(item({ barcode: null, name: 'zorbo fizz' }), null, {
    prices: pricesDb([]),
    askClaude: async (id) => {
      asked = id;
      return { ok: true, lowCents: 200, highCents: 400, currency: 'CAD' };
    },
  });
  assert.equal(verdict.basis, 'claude_typical');
  assert.deepEqual(asked, { name: 'zorbo fizz', brand: null, size: null, category: null, market: 'CA' });
});

test('case 9: catalogue and store row disagree on size, the store row size prices it, noted and logged', async () => {
  const { prices, catalogue } = leafFixture(
    [{ code: SELF, name: 'Big Vodka', quantity: '473 ml', path: LEAF }],
    [obs({ code: SELF, priceCents: 5000, sellerName: 'Big Vodka 1750 ml' })],
  );
  const { verdict, trace } = await estimate(item({ size: '473 ml' }), null, { prices, catalogue, askClaude: noClaude });
  assert.ok(verdict.notes.includes('identity_conflict'));
  assert.deepEqual(trace.conflict, { barcode: SELF, catalogueSize: '473 ml', storeSize: '1750 ml' });
  assert.equal(verdict.perUnit!.label, 'per 100 ml');
  // The per-unit centre is over 1750 ml, not 473.
  assert.equal(verdict.perUnit!.centreCents, Math.round((verdict.centreCents * 100) / 1750));
});

test('case 10: a weighed item gets a per kg bell and its embedded label total is not placed on it', async () => {
  const path = ['en:fruits', 'en:apples'];
  const prods = [0, 1, 2, 3, 4].map((i) => ({ code: `30000000000${i}`, name: `Apple ${i}`, quantity: '1 kg', path }));
  const rows = [400, 450, 500, 550, 600].map((c, i) => obs({ code: `30000000000${i}`, priceCents: c, seller: `s${i}` }));
  const { verdict } = await estimate(item({ barcode: null, name: 'Apples', leafCategory: 'en:apples', categoryPath: path, weighed: true }), { cents: 312 }, {
    prices: pricesDb(rows),
    catalogue: catalogueDb(prods),
  });
  assert.equal(verdict.perUnit!.label, 'per kg');
  assert.equal(verdict.centreCents, 500);
  assert.equal(verdict.scaledTo, '1 kg');
  assert.equal(verdict.shopper, null);
});

test('case 11: a bigger pack is a side note, never folded into the bell', async () => {
  const path = ['en:snacks', 'en:chips'];
  const catalogue = catalogueDb([
    { code: SELF, name: 'Crunch Chips 200 g', brand: 'Crunch', quantity: '200 g', path },
    { code: '4000000000001', name: 'Crunch Chips 300 g', brand: 'Crunch', quantity: '300 g', path },
    { code: '4000000000002', name: 'Crunch Chips 1 kg', brand: 'Crunch', quantity: '1 kg', path },
  ]);
  const prices = pricesDb([
    obs({ code: '4000000000001', priceCents: 450, seller: 'a' }),
    obs({ code: '4000000000002', priceCents: 1000, seller: 'b', storeName: 'Costco' }),
  ]);
  const { verdict } = await estimate(item(), null, { prices, catalogue, askClaude: noClaude });
  assert.equal(verdict.basis, 'other_size');
  // 300 g at 4.50 scaled to 200 g; the 1 kg pack stays out.
  assert.equal(verdict.centreCents, 300);
  assert.deepEqual(verdict.biggerPack, { quantity: '1 kg', perUnitCents: 100, store: 'Costco' });
  assert.equal(verdict.confidence, 'medium');
});

test('case 12: a store brand priced by one chain stands on its own prices with the category spread', async () => {
  const { prices, catalogue } = leafFixture(
    [{ code: SELF, name: 'Compliments Vodka', brand: 'Compliments', quantity: '750 ml', path: LEAF }],
    [
      obs({ code: SELF, priceCents: 1900, seller: 'sobeys', storeName: 'Sobeys A' }),
      obs({ code: SELF, priceCents: 1950, seller: 'sobeys', storeName: 'Sobeys B' }),
    ],
  );
  const { verdict } = await estimate(item(), null, { prices, catalogue, askClaude: noClaude });
  assert.equal(verdict.basis, 'own_prices');
  assert.equal(verdict.n, 2);
  assert.equal(verdict.spreadFrom, 'leaf_category');
});

test('case 13: electronics with no own price ask Claude for the exact model, and carry no unit price', async () => {
  const { verdict } = await estimate(item({ barcode: '0885909950805', name: 'Apple AirPods Pro (2nd generation)', brand: 'Apple' }), null, {
    prices: pricesDb([]),
    catalogue: catalogueDb([]),
    askClaude: async () => ({ ok: true, lowCents: 29900, highCents: 34900, currency: 'CAD' }),
  });
  assert.equal(verdict.basis, 'claude_typical');
  assert.equal(verdict.perUnit, null);

  const own = await estimate(item({ barcode: '0885909950805', name: 'Apple AirPods Pro (2nd generation)' }), null, {
    prices: pricesDb([obs({ code: '0885909950805', priceCents: 32999, seller: 'bestbuy' })]),
    askClaude: noClaude,
  });
  assert.equal(own.verdict.basis, 'own_prices');
  assert.equal(own.verdict.perUnit, null);
});

/* ------------------------------------------------------------ price data */

test('case 14: one own price, a blended centre and the category spread', async () => {
  const { prices, catalogue } = leafFixture([{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }], [obs({ code: SELF, priceCents: 2000 })]);
  const { verdict } = await estimate(item(), null, { prices, catalogue, askClaude: noClaude });
  assert.equal(verdict.basis, 'own_prices');
  assert.equal(verdict.n, 1);
  assert.equal(verdict.centreCents, Math.round(Math.exp((Math.log(2000) + leafMu) / 2)));
  assert.equal(verdict.spreadFrom, 'leaf_category');
  assert.ok(verdict.notes.includes('few_prices'));
  assert.equal(verdict.confidence, 'medium');
});

test('case 15: two stores far apart are both dots, and the centre is blended', async () => {
  const { prices, catalogue } = leafFixture(
    [{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }],
    [obs({ code: SELF, priceCents: 1600, seller: 'anbl', storeName: 'ANBL' }), obs({ code: SELF, priceCents: 3000, seller: 'bcldb', storeName: 'BCL' })],
  );
  const { verdict } = await estimate(item(), null, { prices, catalogue, askClaude: noClaude });
  assert.deepEqual(verdict.dots.map((d) => d.cents).sort(), [1600, 3000]);
  // Median of two (nearest rank, lower) blended with the leaf: (2 ln 1600 + ln 2500) / 3.
  assert.equal(verdict.centreCents, Math.round(Math.exp((2 * Math.log(1600) + leafMu) / 3)));
});

test('case 16: all stores equal, the spread floor holds (the category spread, and never below 0.05)', async () => {
  const own = [0, 1, 2, 3, 4].map((i) => obs({ code: SELF, priceCents: 2500, seller: `s${i}` }));
  const withCat = leafFixture([{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }], own);
  const a = await estimate(item(), null, { ...withCat, askClaude: noClaude });
  assert.equal(a.verdict.spreadFrom, 'own_prices');
  const leafSigma = (Math.log(2800) - Math.log(2200)) / 1.349;
  close(a.verdict.sigmaLog, Math.round(leafSigma * 10000) / 10000, 1e-4);

  const bare = await estimate(item({ barcode: SELF }), null, { prices: pricesDb(own.map((o) => ({ ...o, sellerSku: o.sellerSku + 'x' }))), askClaude: noClaude });
  assert.equal(bare.verdict.sigmaLog, 0.05);
  assert.equal(bare.verdict.confidence, 'high');
});

test('case 17: old prices are age weighted, the bell is widened and noted old_prices', async () => {
  const own = [
    obs({ code: SELF, priceCents: 2000, seller: 'a', seenOn: '2025-06-01' }),
    obs({ code: SELF, priceCents: 3000, seller: 'b', seenOn: '2024-12-01' }),
  ];
  const { prices, catalogue } = leafFixture([{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }], own);
  const { verdict } = await estimate(item(), null, { prices, catalogue, askClaude: noClaude });
  assert.ok(verdict.notes.includes('old_prices'));
  const leafSigma = (Math.log(2800) - Math.log(2200)) / 1.349;
  close(verdict.sigmaLog, Math.round(leafSigma * 1.25 * 10000) / 10000, 1e-4);
  // The newer price carries more weight: the weighted median is 2000, blended with the leaf.
  assert.equal(verdict.centreCents, Math.round(Math.exp((2 * Math.log(2000) + leafMu) / 3)));
  assert.equal(verdict.confidence, 'medium');
});

test('case 18: a sale price never enters the centre and comes back as a sale dot', async () => {
  const { prices, catalogue } = leafFixture(
    [{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }],
    [obs({ code: SELF, priceCents: 2400, seller: 'a' }), obs({ code: SELF, priceCents: 900, seller: 'b', kind: 'promotional', seenOn: '2026-09-25' })],
  );
  const { verdict } = await estimate(item(), null, { prices, catalogue, askClaude: noClaude });
  assert.equal(verdict.n, 1);
  assert.equal(verdict.centreCents, Math.round(Math.exp((Math.log(2400) + leafMu) / 2)));
  assert.deepEqual(verdict.dots[0], { cents: 900, store: 'b', city: null, seenOn: '2026-09-25', kind: 'sale', quantity: '750 ml' });
});

test('case 19: a price more than 5x off its category median is left out of the centre', async () => {
  const { prices, catalogue } = leafFixture(
    [{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }],
    [obs({ code: SELF, priceCents: 2400, seller: 'a' }), obs({ code: SELF, priceCents: 240000, seller: 'b' })],
  );
  const { verdict } = await estimate(item(), null, { prices, catalogue, askClaude: noClaude });
  assert.equal(verdict.n, 1);
  assert.equal(verdict.centreCents, Math.round(Math.exp((Math.log(2400) + leafMu) / 2)));
  assert.equal(verdict.dots.length, 2, 'the wrong row is still shown as a dot');
});

test('case 20: a price with no barcode is never an own price, and counts at category level only when placed', async () => {
  const noBarcode = obs({ code: null, sellerName: 'Own Vodka 750 ml', priceCents: 2600, joinMethod: 'none' });
  const { prices, catalogue } = leafFixture([{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }], [noBarcode], [2000, 2200, 2500, 2800]);
  const out = await estimate(item(), null, { prices, catalogue, askClaude: async () => ({ ok: false, reason: 'no_api_key' }) });
  assert.notEqual(out.verdict.basis, 'own_prices');
  assert.equal(out.verdict.dots.length, 0);

  // Placed in the leaf, it makes the fifth product and the leaf answers.
  const placed = await estimate(item(), null, {
    prices,
    catalogue,
    categoryOfUnbarcoded: () => LEAF,
    askClaude: noClaude,
  });
  assert.equal(placed.verdict.basis, 'leaf_category');
  assert.equal(placed.verdict.n, 5);
});

test('case 21: the shopper province is preferred; only other provinces, noted other_region and wider', async () => {
  const own = [
    obs({ code: SELF, priceCents: 2000, seller: 'bcldb', region: 'British Columbia' }),
    obs({ code: SELF, priceCents: 3000, seller: 'anbl', region: 'New Brunswick' }),
  ];
  const { prices, catalogue } = leafFixture([{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }], own);
  const bc = await estimate(item({ region: 'British Columbia' }), null, { prices, catalogue, askClaude: noClaude });
  assert.equal(bc.verdict.n, 1);
  assert.equal(bc.verdict.centreCents, Math.round(Math.exp((Math.log(2000) + leafMu) / 2)));
  assert.ok(!bc.verdict.notes.includes('other_region'));

  const on = await estimate(item({ region: 'Ontario' }), null, { prices, catalogue, askClaude: noClaude });
  assert.equal(on.verdict.n, 2);
  assert.ok(on.verdict.notes.includes('other_region'));
  close(on.verdict.sigmaLog, Math.round(bc.verdict.sigmaLog * 1.25 * 10000) / 10000, 2e-4);
});

test('case 22: where a row carries its pre-tax price, that is the one compared', async () => {
  const { prices, catalogue } = leafFixture(
    [{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }],
    [obs({ code: SELF, priceCents: 2760, basePriceCents: 2400, seller: 'anbl' })],
  );
  const { verdict } = await estimate(item(), null, { prices, catalogue, askClaude: noClaude });
  assert.equal(verdict.dots[0]!.cents, 2400);
  assert.equal(verdict.centreCents, Math.round(Math.exp((Math.log(2400) + leafMu) / 2)));
});

/* ------------------------------------------------------------ shopper */

test('case 23: no price typed, the bell is drawn and shopper is null', async () => {
  const { prices, catalogue } = leafFixture([{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }]);
  const { verdict } = await estimate(item(), null, { prices, catalogue, askClaude: noClaude });
  assert.equal(verdict.shopper, null);
  assert.ok(verdict.centreCents > 0 && verdict.p10Cents < verdict.centreCents && verdict.p90Cents > verdict.centreCents);
  assert.deepEqual(verdict.thresholds, { greatPct: 30, goodPct: 20, badPct: 20, fromShopper: false });
});

test('case 24: a likely typo (x100) is suspect with a suggestion, and the chart still shows', async () => {
  const { prices, catalogue } = leafFixture([{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }]);
  const { verdict } = await estimate(item(), { cents: 249900 }, { prices, catalogue, askClaude: noClaude });
  assert.deepEqual(verdict.shopper!.suspect, { suggestCents: 2499 });
  assert.equal(verdict.shopper!.beyond, 'high');

  const tooLow = await estimate(item(), { cents: 25 }, { prices, catalogue, askClaude: noClaude });
  assert.deepEqual(tooLow.verdict.shopper!.suspect, { suggestCents: 2500 });

  // A per-kg price typed for a 250 g pack: the pack would cost a quarter of it.
  const path = ['en:dairy', 'en:cheeses'];
  const prods = [0, 1, 2, 3, 4].map((i) => ({ code: `50000000000${i}`, name: `Cheese ${i}`, quantity: '250 g', path }));
  const rows = [450, 480, 500, 520, 550].map((c, i) => obs({ code: `50000000000${i}`, priceCents: c, seller: `s${i}` }));
  const cheese = await estimate(item({ name: 'Old cheddar', size: '250 g', leafCategory: 'en:cheeses', categoryPath: path, barcode: null }), { cents: 2000 }, {
    prices: pricesDb(rows),
    catalogue: catalogueDb(prods),
    askClaude: noClaude,
  });
  assert.deepEqual(cheese.verdict.shopper!.suspect, { suggestCents: 500 });
});

test('case 25: far outside, beyond is set (pinned at the edge), with zone and offByPct', async () => {
  const { prices, catalogue } = leafFixture([{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }]);
  const { verdict } = await estimate(item(), { cents: 7500 }, { prices, catalogue, askClaude: noClaude });
  assert.equal(verdict.shopper!.beyond, 'high');
  assert.equal(verdict.shopper!.zone, 'bad');
  assert.equal(verdict.shopper!.offByPct, 200);
  assert.equal(verdict.shopper!.suspect, null);
});

test('case 26: another currency is converted with a known rate; with none it is not placed', async () => {
  const { prices, catalogue } = leafFixture([{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }]);
  const withRate = await estimate(item(), { cents: 1000, currency: 'USD' }, { prices, catalogue, askClaude: noClaude, fxRates: { USD: 1.4 } });
  assert.equal(withRate.verdict.shopper!.cents, 1400);
  const without = await estimate(item(), { cents: 1000, currency: 'USD' }, { prices, catalogue, askClaude: noClaude });
  assert.equal(without.verdict.shopper, null);
});

test('zones: default thresholds, and the shopper own lines replace them (percent and dollar forms)', async () => {
  const { prices, catalogue } = leafFixture([{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }]);
  const deps: EstimateDeps = { prices, catalogue, askClaude: noClaude };
  const z = async (cents: number, thresholds?: unknown) => (await estimate(item(), { cents, thresholds }, deps)).verdict.shopper!.zone;
  assert.equal(await z(1700), 'great');
  assert.equal(await z(2000), 'good');
  assert.equal(await z(2400), 'reasonable');
  assert.equal(await z(3000), 'bad');
  assert.equal(await z(2300, { greatPct: 5, goodPct: 2, badPct: 50 }), 'great');
  assert.equal(await z(2300, { unit: 'percent', great: 5, good: 2, bad: 50 }), 'great');
  assert.equal(await z(2300), 'reasonable');
  const t = readThresholds({ unit: 'amount', great: 5, good: 2, bad: 5 }, 2500);
  assert.deepEqual(t, { greatPct: 20, goodPct: 8, badPct: 20, fromShopper: true });
  assert.deepEqual(readThresholds(undefined, 2500), { greatPct: 30, goodPct: 20, badPct: 20, fromShopper: false });
});

/* ------------------------------------------------------------ system */

test('case 27: Claude down, capped, keyless or throwing falls to category_prior, then global_prior', async () => {
  const path = ['en:beverages', 'en:sodas', 'en:colas'];
  const prods = [0, 1, 2].map((i) => ({ code: `60000000000${i}`, name: `Juice ${i}`, quantity: '1 l', path: ['en:beverages', 'en:juices'] }));
  const rows = [300, 400, 500].map((c, i) => obs({ code: `60000000000${i}`, priceCents: c, seller: `s${i}` }));
  const deps = (askClaude: EstimateDeps['askClaude']): EstimateDeps => ({ prices: pricesDb(rows), catalogue: catalogueDb(prods), askClaude });
  for (const reason of ['model_error', 'monthly_cap_reached', 'no_api_key']) {
    const { verdict, trace } = await estimate(item({ barcode: null, name: 'Fizz Cola', categoryPath: path }), null, deps(async () => ({ ok: false, reason })));
    assert.equal(verdict.basis, 'category_prior', reason);
    assert.equal(verdict.spreadFrom, 'prior');
    assert.deepEqual(trace.claude, { ok: false, reason });
  }
  const threw = await estimate(item({ barcode: null, name: 'Fizz Cola', categoryPath: path }), null, deps(async () => {
    throw new Error('socket hang up');
  }));
  assert.equal(threw.verdict.basis, 'category_prior');
  // No category at all: the global prior, still drawable.
  const global = await estimate(item({ barcode: null, name: 'Fizz Cola' }), null, deps(async () => ({ ok: false, reason: 'no_api_key' })));
  assert.equal(global.verdict.basis, 'global_prior');
  assert.equal(global.verdict.centreCents, 400);
  // Nothing held at all: still a bell.
  const empty = await estimate(item({ barcode: null, name: 'Fizz Cola' }), null, { prices: null });
  assert.equal(empty.verdict.basis, 'global_prior');
  assert.ok(empty.verdict.p90Cents > empty.verdict.p10Cents);
  assert.equal(empty.verdict.confidence, 'low');
});

test('case 28: a slow Claude is not waited for; the next rung answers at once', async () => {
  const started = Date.now();
  const { verdict, trace } = await estimate(item({ barcode: null, name: 'Fizz Cola' }), null, {
    prices: pricesDb([obs({ code: '7000000000001', priceCents: 300 })]),
    askClaude: () => new Promise<ClaudeAnswer>(() => {}),
    claudeWaitMs: 30,
  });
  assert.ok(Date.now() - started < 2000);
  assert.equal(verdict.basis, 'global_prior');
  assert.deepEqual(trace.claude, { ok: false, reason: 'timeout' });
});

/* ------------------------------------------------------------ the ladder */

test('the parent category answers when the leaf is thin, and brand markup when both are', async () => {
  // Five gins (parent spirits), no vodkas priced beyond two: the parent answers for a vodka.
  const gins = [0, 1, 2, 3, 4].map((i) => ({ code: `80000000000${i}`, name: `Gin ${i}`, brand: 'Juniper', quantity: '750 ml', path: PARENT_ONLY }));
  const rows = [3000, 3200, 3400, 3600, 3800].map((c, i) => obs({ code: `80000000000${i}`, priceCents: c, seller: `s${i}` }));
  const catalogue = catalogueDb([...gins, { code: SELF, name: 'Lone Vodka', quantity: '750 ml', path: LEAF }]);
  const parent = await estimate(item(), null, { prices: pricesDb(rows), catalogue, askClaude: noClaude });
  assert.equal(parent.verdict.basis, 'parent_category');
  assert.equal(parent.verdict.spreadFrom, 'parent_category');
  assert.equal(parent.verdict.centreCents, 3400);

  // Brand markup: Premio sells three products at 2x their leaf's median; its unpriced product is in a leaf with only a grandparent centre.
  const leafA = ['en:food', 'en:sauces', 'en:pesto'];
  const aProds = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ code: `81000000000${i}`, name: `Pesto ${i}`, brand: i < 3 ? 'Premio' : `Other${i}`, quantity: '200 g', path: leafA }));
  const aRows = [800, 800, 800, 400, 400, 400, 400].map((c, i) => obs({ code: `81000000000${i}`, priceCents: c, seller: `s${i}` }));
  const self = { code: SELF, name: 'Premio Truffle Oil', brand: 'Premio', quantity: '100 ml', path: ['en:food', 'en:oils', 'en:truffle-oils'] };
  const oils = [0, 1, 2, 3, 4].map((i) => ({ code: `82000000000${i}`, name: `Oil ${i}`, brand: `O${i}`, quantity: '1 l', path: ['en:food', 'en:dressings', 'en:vinaigrettes'] }));
  const oRows = [1000, 1000, 1000, 1000, 1000].map((c, i) => obs({ code: `82000000000${i}`, priceCents: c, seller: `o${i}` }));
  const markup = await estimate(item(), null, { prices: pricesDb([...aRows, ...oRows]), catalogue: catalogueDb([...aProds, ...oils, self]), askClaude: noClaude });
  assert.equal(markup.verdict.basis, 'brand_markup');
  assert.equal(markup.verdict.n, 3);
});

test('high confidence needs own prices from 3+ shops, fresh', async () => {
  const own = [0, 1, 2].map((i) => obs({ code: SELF, priceCents: 2400 + i * 50, seller: `s${i}` }));
  const { prices, catalogue } = leafFixture([{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }], own);
  const { verdict } = await estimate(item(), null, { prices, catalogue, askClaude: noClaude });
  assert.equal(verdict.confidence, 'high');
  assert.ok(!verdict.notes.includes('few_prices'));
});

test('a leaf with 20+ priced products is medium confidence; fewer is low', async () => {
  const many = Array.from({ length: 20 }, (_, i) => 2000 + i * 50);
  const small = leafFixture([{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }]);
  const prods = many.map((_, i) => ({ code: `9${String(i).padStart(12, '0')}`, name: `V${i}`, quantity: '750 ml', path: LEAF }));
  const rows = many.map((c, i) => obs({ code: `9${String(i).padStart(12, '0')}`, priceCents: c, seller: `s${i}` }));
  const rich = await estimate(item(), null, {
    prices: pricesDb(rows),
    catalogue: catalogueDb([...prods, { code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }]),
    askClaude: noClaude,
  });
  assert.equal(rich.verdict.basis, 'leaf_category');
  assert.equal(rich.verdict.n, 20);
  assert.equal(rich.verdict.confidence, 'medium');
  const thin = await estimate(item(), null, { ...small, askClaude: noClaude });
  assert.equal(thin.verdict.confidence, 'low');
});

test('dots are at most 12, newest first, labelled with store, city and quantity', async () => {
  const own = Array.from({ length: 15 }, (_, i) =>
    obs({ code: SELF, priceCents: 2400, seller: `s${i}`, storeName: `Store ${i}`, storeCity: 'Victoria', seenOn: `2026-09-${String(10 + i).padStart(2, '0')}` }),
  );
  const { prices, catalogue } = leafFixture([{ code: SELF, name: 'Own Vodka', quantity: '750 ml', path: LEAF }], own);
  const { verdict } = await estimate(item(), null, { prices, catalogue, askClaude: noClaude });
  assert.equal(verdict.dots.length, 12);
  assert.equal(verdict.dots[0]!.seenOn, '2026-09-24');
  assert.equal(verdict.dots[0]!.city, 'Victoria');
  assert.equal(verdict.dots[0]!.quantity, '750 ml');
});

test('productKey: sizes and pack words out, brand kept apart', () => {
  assert.equal(productKey('Crunch Chips 200 g', 'Crunch'), productKey('Crunch Chips 1 kg', 'Crunch'));
  assert.notEqual(productKey('Crunch Chips', 'Crunch'), productKey('Crunch Salsa', 'Crunch'));
  assert.equal(productKey('Chips', null), null);
});
