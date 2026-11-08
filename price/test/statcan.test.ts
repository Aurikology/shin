/**
 * Statistics Canada average retail prices (price/src/statcan.ts) and their rung in the verdict
 * ladder (price/src/estimate.ts `national_average`). Jamin, 2026-11-08: "wire in statistics canada".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  buildTable,
  calibrate,
  categoryAgrees,
  DEFAULT_PATH,
  ITEMS,
  loadTable,
  matchItem,
  nationalAverageFor,
  placeOf,
  plainlyNamed,
  type StatcanTable,
} from '../src/statcan.ts';
import { toComparison } from '../../catalogue/src/units.ts';
import { estimate, Z10, type ClaudeAnswer, type EstimateDeps } from '../src/estimate.ts';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';

const q = (v: number, u: string) => toComparison(v, u);

/** A table with two places and measured factors, as `build` then `calibrate` leave it. */
const TABLE: StatcanTable = {
  table: '18-10-0245-01',
  source: 'test',
  latestMonth: '2026-09',
  values: {
    'Peanut butter, 1 kilogram': { Canada: ['2026-09', 599], Ontario: ['2026-09', 601] },
    'Milk, 1 litre': { Canada: ['2026-09', 300], Ontario: ['2026-09', 310] },
    'Milk, 2 litres': { Canada: ['2026-09', 520] },
    'Milk, 4 litres': { Canada: ['2026-09', 699], Ontario: ['2026-09', 693] },
    'Eggs, 1 dozen': { Canada: ['2026-09', 483], Ontario: ['2026-09', 502] },
    'Bananas, per kilogram': { Canada: ['2026-09', 170] },
    'Tea (20 bags)': { Canada: ['2026-09', 400] },
    'Bacon, 500 grams': { Canada: ['2023-01', 700] },
  },
  shelfFactor: {
    'Peanut butter, 1 kilogram': 1.5,
    'Milk, 1 litre': 1.1,
    'Milk, 2 litres': 1.1,
    'Milk, 4 litres': 1.2,
    'Eggs, 1 dozen': 1.4,
    'Bananas, per kilogram': 1.3,
    'Tea (20 bags)': 1.2,
    'Bacon, 500 grams': 1.5,
  },
  calibration: {
    on: '2026-11-08', from: 'test', place: 'Ontario', rows: 1, products: 1, overallFactor: 1.5, sigma: 0.37, insideP10P90: 0.76, perProduct: {},
  },
};

/* ------------------------------------------------------------- the table */

test('the build reads the newest dollar value per product and place, and refuses a table missing a product', () => {
  const header = '"REF_DATE","GEO","DGUID","Products","UOM","UOM_ID","SCALAR_FACTOR","SCALAR_ID","VECTOR","COORDINATE","VALUE","STATUS","SYMBOL","TERMINATED","DECIMALS"\n';
  const row = (month: string, geo: string, product: string, value: string) =>
    `"${month}","${geo}","x","${product}","Dollars","81","units","0","v1","1.1","${value}","","","","2"\n`;
  const all = ITEMS.map((i) => row('2026-08', 'Canada', i.product, '1.00')).join('');
  const t = buildTable(
    '﻿' + header + all +
      row('2026-09', 'Ontario', 'Peanut butter, 1 kilogram', '6.01') +
      row('2026-07', 'Ontario', 'Peanut butter, 1 kilogram', '9.99') +
      row('2026-09', 'Canada', 'Eggs, 1 dozen', '') +
      // StatCan prints "Frozen corn, 750 grams " with a trailing space; the build trims it.
      row('2026-09', 'Canada', 'Frozen corn, 750 grams ', '4.50'),
  );
  assert.equal(t.latestMonth, '2026-09');
  assert.deepEqual(t.values['Peanut butter, 1 kilogram']!.Ontario, ['2026-09', 601]);
  assert.deepEqual(t.values['Eggs, 1 dozen']!.Canada, ['2026-08', 100], 'an empty value is skipped, the older month stands');
  assert.deepEqual(t.values['Frozen corn, 750 grams']!.Canada, ['2026-09', 450]);
  assert.throws(() => buildTable(header + row('2026-09', 'Canada', 'Peanut butter, 1 kilogram', '6.00')), /has no rows for/);
});

test('the committed table holds all 110 products, a newest month, measured factors and a measured spread', () => {
  const t = JSON.parse(readFileSync(DEFAULT_PATH, 'utf8')) as StatcanTable;
  assert.equal(ITEMS.length, 110);
  for (const i of ITEMS) {
    assert.ok(t.values[i.product]?.Canada, `no Canada value for ${i.product}`);
    assert.ok((t.shelfFactor?.[i.product] ?? 0) > 0, `no shelf factor for ${i.product}`);
  }
  assert.match(t.latestMonth, /^\d{4}-\d{2}$/);
  assert.ok(t.calibration && t.calibration.sigma > 0.1 && t.calibration.sigma < 1, 'the spread is measured');
  assert.ok(t.calibration.rows >= 1000, 'the calibration rests on real rows');
  assert.ok(loadTable() !== null);
});

test('every product is guarded: plainly named (fresh) or category-checked (packaged)', () => {
  // Each product is in exactly one of the two guards, so none is matched on its name pattern alone.
  for (const i of ITEMS) {
    const strict = !plainlyNamed(i.product, 'zzz unrelated');
    const cat = !categoryAgrees(i.product, ['en:zzz-unrelated']);
    assert.ok(strict !== cat, `${i.product}: strict ${strict}, category ${cat}`);
  }
});

/* ---------------------------------------------------------- recognition */

test('names: the staple matches, the products named after it do not', () => {
  const pb = q(1, 'kg');
  assert.equal((matchItem('Kraft Smooth Peanut Butter', pb) as { item: { product: string } }).item.product, 'Peanut butter, 1 kilogram');
  const productOf = (m: ReturnType<typeof matchItem>) => ('item' in m ? m.item.product : null);
  for (const n of ["Reese's Peanut Butter Cups", 'Peanut Butter Cookies', 'Chocolate Peanut Butter Spread']) {
    assert.notEqual(productOf(matchItem(n, pb)), 'Peanut butter, 1 kilogram', n);
    assert.notEqual(productOf(matchItem(n, q(500, 'g'))), 'Peanut butter, 1 kilogram', n);
  }
  // Peanut butter cookies are cookies, at a cookie size.
  assert.equal(productOf(matchItem('Peanut Butter Cookies', q(300, 'g'))), 'Cookies and sweet biscuits, 300 grams');
  // "White" describes the eggs; "egg whites" is another product.
  assert.equal(productOf(matchItem('Large White Eggs', q(12, 'ea'))), 'Eggs, 1 dozen');
  assert.equal(productOf(matchItem('Liquid Egg Whites', q(12, 'ea'))), null);
  // Fresh food must be named plainly (seen in Project Hammer names, 2026-11-08).
  const kg = q(1, 'kg');
  assert.equal((matchItem('Bananas', kg) as { item: { product: string } }).item.product, 'Bananas, per kilogram');
  assert.equal((matchItem('Organic Bananas, Bunch', kg) as { item: { product: string } }).item.product, 'Bananas, per kilogram');
  for (const n of ['Marshmallow Bananas', 'Guava, Mango, and Banana Fruit Blend', 'HARIBO Bananas']) {
    assert.deepEqual(matchItem(n, kg), { miss: 'no_match' }, n);
  }
  assert.deepEqual(matchItem('', kg), { miss: 'no_name' });
});

test('packaged food must agree with its category when it has one', () => {
  const g200 = q(200, 'g');
  // "Cracker Barrel" cheese matches the crackers pattern by name; its category says cheese.
  assert.deepEqual(matchItem('Cracker Barrel Old Cheddar', g200, null, ['en:dairies', 'en:cheeses', 'en:cheddars']), { miss: 'no_match' });
  assert.equal(
    (matchItem('Triscuit Original Crackers', g200, null, ['en:snacks', 'en:salty-snacks', 'en:crackers']) as { item: { product: string } }).item.product,
    'Crackers and crisp breads, 200 grams',
  );
  // No category at all: the name decides.
  assert.equal((matchItem('Triscuit Original Crackers', g200) as { item: { product: string } }).item.product, 'Crackers and crisp breads, 200 grams');
});

test('sizes: same family and in band; the nearest of several sizes wins; grams read as millilitres only where labels mix', () => {
  const milk = (v: number, u: string) => matchItem('2% Partly Skimmed Milk', q(v, u));
  assert.equal((milk(4, 'l') as { item: { product: string } }).item.product, 'Milk, 4 litres');
  assert.equal((milk(2, 'l') as { item: { product: string } }).item.product, 'Milk, 2 litres');
  assert.equal((milk(1, 'l') as { item: { product: string } }).item.product, 'Milk, 1 litre');
  assert.deepEqual(milk(200, 'ml'), { miss: 'size_out_of_band' }, 'a 200 ml carton is outside every milk band');
  assert.deepEqual(matchItem('2% Milk', null), { miss: 'no_size' });
  // A packaged product: half to double. Peanut butter labelled in grams or millilitres (dense).
  assert.equal((matchItem('Peanut Butter', q(500, 'g')) as { ratio: number }).ratio, 0.5);
  assert.deepEqual(matchItem('Peanut Butter', q(250, 'g')), { miss: 'size_out_of_band' });
  assert.equal((matchItem('Peanut Butter', q(750, 'ml')) as { ratio: number }).ratio, 0.75);
  // Sold by weight: in proportion, from a tenth to ten times.
  assert.equal((matchItem('Bananas', q(1.36, 'kg')) as { ratio: number }).ratio, 1.36);
  assert.deepEqual(matchItem('Bananas', q(500, 'ml')), { miss: 'size_out_of_band' }, 'a volume is no banana weight');
  // Tea: the bag count is read from the size text when the size is not a count.
  assert.equal((matchItem('Red Rose Orange Pekoe Tea', q(216, 'g'), '72 tea bags') as { ratio: number }).ratio, 3.6);
});

test('places: province codes and names, territories by their city, else Canada', () => {
  assert.equal(placeOf('ON'), 'Ontario');
  assert.equal(placeOf('CA-QC'), 'Quebec');
  assert.equal(placeOf('British Columbia'), 'British Columbia');
  assert.equal(placeOf('YT'), 'Whitehorse, Yukon');
  assert.equal(placeOf(''), null);
  assert.equal(placeOf('Texas'), null);
});

test('the answer: province average x shelf factor x size, Canada when the province has none, nothing when stale or uncalibrated', () => {
  const pb = nationalAverageFor({ name: 'Kraft Smooth Peanut Butter', target: q(500, 'g'), region: 'ON', asOf: '2026-11-08' }, TABLE);
  assert.ok(!('miss' in pb));
  // 601 x 1.5 x 0.5 = 450.75
  assert.equal(pb.centreCents, 451);
  assert.equal(pb.place, 'Ontario');
  assert.equal(pb.month, '2026-09');
  assert.equal(pb.averageCents, 601);
  assert.equal(pb.sigmaLog, 0.37);
  const bc = nationalAverageFor({ name: '2% Milk', target: q(2, 'l'), region: 'BC', asOf: '2026-11-08' }, TABLE);
  assert.ok(!('miss' in bc));
  assert.equal(bc.place, 'Canada');
  assert.equal(bc.centreCents, Math.round(520 * 1.1));
  assert.deepEqual(nationalAverageFor({ name: 'Bacon', target: q(500, 'g'), asOf: '2026-11-08' }, TABLE), { miss: 'too_old' });
  const raw: StatcanTable = { ...TABLE, shelfFactor: undefined };
  assert.deepEqual(nationalAverageFor({ name: 'Peanut Butter', target: q(1, 'kg'), asOf: '2026-11-08' }, raw), { miss: 'no_shelf_factor' });
  assert.deepEqual(nationalAverageFor({ name: 'Peanut Butter', target: q(1, 'kg'), asOf: '2026-11-08' }, null), { miss: 'no_table' });
});

test('calibrate: the factor is shelf over average, shrunk toward the overall factor, with the spread of what is left', () => {
  const rows: { name: string; sizeText: string; cents: number }[] = [];
  // 40 peanut butters at exactly 2x the Ontario average, 40 dozens of eggs at 1x.
  for (let i = 0; i < 40; i++) rows.push({ name: 'Smooth Peanut Butter', sizeText: '1kg', cents: 1202 });
  for (let i = 0; i < 40; i++) rows.push({ name: 'Large White Eggs', sizeText: '12 ea', cents: 502 });
  const c = calibrate(rows, TABLE, 'Ontario', { on: '2026-11-08', from: 'test' });
  // Overall: median of per-product medians, log 2 and log 1, so sqrt 2.
  assert.equal(c.measured.overallFactor, Math.round(Math.SQRT2 * 1000) / 1000);
  // Shrunk with 20: exp((40 log 2 + 20 log sqrt2) / 60) = 2^(5/6).
  assert.equal(c.shelfFactor['Peanut butter, 1 kilogram'], Math.round(Math.pow(2, 5 / 6) * 1000) / 1000);
  assert.equal(c.shelfFactor['Eggs, 1 dozen'], Math.round(Math.pow(2, 1 / 6) * 1000) / 1000);
  // A product with no rows takes the overall factor.
  assert.equal(c.shelfFactor['Tofu, 350 grams'], c.measured.overallFactor);
  assert.equal(c.measured.rows, 80);
  assert.throws(() => calibrate([], TABLE, 'Ontario', { on: 'x', from: 'x' }), /no row matched/);
});

/* ------------------------------------------------------------ the rung */

const noClaude = async (): Promise<ClaudeAnswer> => {
  throw new Error('the Claude rung must not be reached when Statistics Canada answers');
};
const rung: NonNullable<EstimateDeps['nationalAverage']> = (x) => nationalAverageFor(x, TABLE);
const pbItem = { barcode: null, name: 'Kraft Smooth Peanut Butter', size: '1 kg', region: 'ON', asOf: '2026-11-08', currency: 'CAD', country: 'CA' };

test('the rung answers before Claude, centred on the shelf-adjusted average, with the measured spread', async () => {
  const { verdict, trace } = await estimate(pbItem, { cents: 700 }, { prices: null, askClaude: noClaude, nationalAverage: rung });
  assert.equal(verdict.basis, 'national_average');
  assert.equal(verdict.spreadFrom, 'national_average');
  assert.equal(verdict.centreCents, Math.round(601 * 1.5));
  assert.equal(verdict.sigmaLog, 0.37);
  assert.equal(verdict.p10Cents, Math.round(Math.exp(Math.log(902) - Z10 * 0.37)));
  assert.equal(verdict.confidence, 'low');
  assert.equal(verdict.n, 0);
  assert.equal(verdict.scaledTo, '1 kg');
  assert.ok(verdict.shopper, 'a shopper price is placed on it');
  assert.equal(verdict.shopper!.zone, 'good', '$7.00 against a $9.02 centre is 22% under');
  assert.equal(trace.nationalAverage?.product, 'Peanut butter, 1 kilogram');
  assert.equal(trace.claude, null, 'Claude was never asked');
  assert.deepEqual(trace.tried.find((t) => t.rung === 'national_average'), { rung: 'national_average', outcome: 'used', n: 0, detail: 'Peanut butter, 1 kilogram | Ontario | 2026-09' });
});

test('without the rung the ladder is exactly as before: Claude is asked', async () => {
  let asked = 0;
  const claude = async (): Promise<ClaudeAnswer> => {
    asked++;
    return { ok: true, lowCents: 500, highCents: 900, currency: 'CAD' } as ClaudeAnswer;
  };
  const { verdict, trace } = await estimate(pbItem, null, { prices: null, askClaude: claude });
  assert.equal(asked, 1);
  assert.equal(verdict.basis, 'claude_typical');
  assert.equal(trace.nationalAverage, null);
  assert.deepEqual(trace.tried.find((t) => t.rung === 'national_average'), { rung: 'national_average', outcome: 'not_applicable', n: 0, detail: 'no_table' });
});

test('a product the table does not hold, or a rung that throws, moves on to Claude', async () => {
  let asked = 0;
  const claude = async (): Promise<ClaudeAnswer> => {
    asked++;
    return { ok: true, lowCents: 500, highCents: 900, currency: 'CAD' } as ClaudeAnswer;
  };
  const other = await estimate({ ...pbItem, name: 'Kimchi', size: '500 g' }, null, { prices: null, askClaude: claude, nationalAverage: rung });
  assert.equal(other.verdict.basis, 'claude_typical');
  assert.equal(other.trace.tried.find((t) => t.rung === 'national_average')?.detail, 'no_match');
  const threw = await estimate(pbItem, null, {
    prices: null,
    askClaude: claude,
    nationalAverage: () => {
      throw new Error('disk');
    },
  });
  assert.equal(threw.verdict.basis, 'claude_typical');
  assert.equal(threw.trace.tried.find((t) => t.rung === 'national_average')?.outcome, 'failed');
  assert.equal(asked, 2);
});

test("Pexi's own prices outrank the average: the rung is never reached when a store price exists", async () => {
  const db = openPrices(':memory:');
  const row: ObservationRow = {
    code: '0068100084245', seller: 'shop', sellerSku: 's1', sellerName: 'Kraft Smooth Peanut Butter 1kg', sellerBrand: null, priceCents: 799,
    kind: 'regular', unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: 'ON', joinMethod: 'gtin',
    seenOn: '2026-11-01', url: null, imageUrl: null, inStock: null,
  };
  recordObservation(db, row);
  const { verdict, trace } = await estimate({ ...pbItem, barcode: '0068100084245' }, null, { prices: db as DatabaseSync, askClaude: noClaude, nationalAverage: rung });
  assert.equal(verdict.basis, 'own_prices');
  assert.equal(trace.tried.some((t) => t.rung === 'national_average'), false);
});
