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
  isPremium,
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
  premiumFactor: {
    'Peanut butter, 1 kilogram': 2.25,
    'Milk, 1 litre': 1.6,
    'Milk, 2 litres': 1.6,
    'Milk, 4 litres': 1.6,
    'Eggs, 1 dozen': 2,
    'Bananas, per kilogram': 1.9,
    'Tea (20 bags)': 1.8,
    'Bacon, 500 grams': 2,
  },
  calibration: {
    on: '2026-11-08', from: 'test', place: 'Ontario', rows: 1, premiumRows: 0, products: 1, overallFactor: 1.5, overallPremiumUplift: 1.5,
    sigma: 0.37, sigmaSizeAssumed: 0.45, insideP10P90: 0.76, perProduct: {},
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
    assert.ok((t.premiumFactor?.[i.product] ?? 0) > 0, `no premium factor for ${i.product}`);
  }
  assert.match(t.latestMonth, /^\d{4}-\d{2}$/);
  assert.ok(t.calibration && t.calibration.sigma > 0.1 && t.calibration.sigma < 1, 'the spread is measured');
  assert.ok(t.calibration.sigmaSizeAssumed >= t.calibration.sigma, 'the size-assumed spread is measured and never narrower');
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
  // No size: three milk sizes match, so none is assumed.
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

test('calibrate: standard and premium factors apart, shrunk by SHRINK_N, and a size-assumed spread over every pack size', () => {
  const rows: { name: string; sizeText: string; cents: number }[] = [];
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  // 40 standard peanut butters at exactly 2x the Ontario average, 40 standard dozens of eggs at 1x,
  // and 10 organic peanut butters at 3x (premium over standard: 1.5).
  for (let i = 0; i < 40; i++) rows.push({ name: 'Smooth Peanut Butter', sizeText: '1kg', cents: 1202 });
  for (let i = 0; i < 40; i++) rows.push({ name: 'Large White Eggs', sizeText: '12 ea', cents: 502 });
  for (let i = 0; i < 10; i++) rows.push({ name: 'Organic Smooth Peanut Butter', sizeText: '1kg', cents: 1803 });
  // A 3 kg tub at 2x per kilogram: outside the pack band (half to double), so it sets no factor, but an unsized item could be it.
  rows.push({ name: 'Smooth Peanut Butter', sizeText: '3kg', cents: 3606 });
  const c = calibrate(rows, TABLE, 'Ontario', { on: '2026-11-08', from: 'test' });
  // Standard overall: median of per-product medians, log 2 and log 1, so sqrt 2.
  assert.equal(c.measured.overallFactor, r3(Math.SQRT2));
  // Shrunk with SHRINK_N = 2: exp((40 log 2 + 2 log sqrt2) / 42) = 2^(41/42).
  assert.equal(c.shelfFactor['Peanut butter, 1 kilogram'], r3(Math.pow(2, 41 / 42)));
  assert.equal(c.shelfFactor['Eggs, 1 dozen'], r3(Math.pow(2, 1 / 42)));
  // Premium: the product's own uplift 1.5 (it is also the overall uplift), on its standard factor.
  assert.equal(c.measured.overallPremiumUplift, 1.5);
  assert.equal(c.premiumFactor['Peanut butter, 1 kilogram'], r3(Math.pow(2, 41 / 42) * 1.5));
  // Eggs had no premium rows: the overall uplift.
  assert.equal(c.premiumFactor['Eggs, 1 dozen'], r3(Math.pow(2, 1 / 42) * 1.5));
  // A product with no rows takes the overall factors.
  assert.equal(c.shelfFactor['Tofu, 350 grams'], c.measured.overallFactor);
  assert.equal(c.measured.rows, 90);
  assert.equal(c.measured.premiumRows, 10);
  // The size-assumed spread counts every pack size: here 41 standard peanut butters and 40 eggs, of
  // which only the 3 kg tub is off. Its median deviation is 0, and it is never below the sized spread.
  assert.ok(c.measured.sigmaSizeAssumed >= c.measured.sigma);
  // With most peanut butters in jars and tubs of other sizes (250 g to 5 kg, all at 2x per kilogram),
  // assuming 1 kg is off for most of them, and the spread opens up.
  const tubs = [...rows];
  for (const kg of [0.25, 3, 4, 5]) {
    for (let i = 0; i < 30; i++) tubs.push({ name: 'Smooth Peanut Butter', sizeText: `${kg}kg`, cents: Math.round(1202 * kg) });
  }
  const ct = calibrate(tubs, TABLE, 'Ontario', { on: '2026-11-08', from: 'test' });
  assert.ok(ct.measured.sigmaSizeAssumed > 0.3, `size-assumed spread ${ct.measured.sigmaSizeAssumed}`);
  assert.equal(ct.measured.sigma, 0, 'the sized rows still fit exactly');
  assert.throws(() => calibrate([], TABLE, 'Ontario', { on: 'x', from: 'x' }), /no row matched/);
});

test('premium versions take the premium factor; an unsized item assumes the product size only when something vouches for it', () => {
  const at = (name: string, target: ReturnType<typeof q>, path: string[] = []) =>
    nationalAverageFor({ name, target, path, region: 'ON', asOf: '2026-11-08' }, TABLE);
  const plain = at('Large White Eggs', q(12, 'ea'));
  const organic = at('Organic Free Range Brown Eggs', q(12, 'ea'));
  assert.ok(!('miss' in plain) && !('miss' in organic));
  assert.equal(plain.centreCents, Math.round(502 * 1.4));
  assert.equal(plain.premium, false);
  assert.equal(organic.centreCents, Math.round(502 * 2));
  assert.equal(organic.premium, true);
  // "Nestlaid", "Omega Plus", "Solar": Naturegg's premium lines, seen in Hammer names.
  assert.ok(isPremium('Naturegg NestlaidOmega 3 Large Size 12 Eggs'));
  assert.ok(isPremium('Naturegg Omega Plus White Eggs, Large'));
  assert.ok(!isPremium('Grade A Large Eggs'));
  // No size: a fresh item named plainly assumes its product's size, with the wider measured spread.
  const bananas = at('Bananas', null);
  assert.ok(!('miss' in bananas));
  assert.equal(bananas.sizeAssumed, true);
  assert.equal(bananas.sigmaLog, 0.45);
  assert.equal(bananas.centreCents, Math.round(170 * 1.3));
  // A packaged item with no size and no category is not assumed; with its category it is.
  assert.deepEqual(at('Smooth Peanut Butter', null), { miss: 'no_size' });
  const pb = at('Smooth Peanut Butter', null, ['en:spreads', 'en:peanut-butters']);
  assert.ok(!('miss' in pb));
  assert.equal(pb.sizeAssumed, true);
  assert.equal(pb.centreCents, Math.round(601 * 1.5));
  // An item that HAS a size in another family is never assumed: "Scrambled Egg Kit, 85 g" is no dozen eggs.
  assert.deepEqual(matchItem('Scrambled Egg Kit', q(85, 'g')), { miss: 'no_match' });
  assert.deepEqual(matchItem('Large White Eggs', q(690, 'g')), { miss: 'size_out_of_band' });
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

test('an unsized staple: the product size is assumed, the verdict says so, and the measured spread is not widened twice', async () => {
  const { verdict, trace } = await estimate(
    { barcode: null, name: 'Smooth Peanut Butter', categoryPath: ['en:spreads', 'en:peanut-butters'], region: 'ON', asOf: '2026-11-08', currency: 'CAD', country: 'CA' },
    null,
    { prices: null, askClaude: noClaude, nationalAverage: rung },
  );
  assert.equal(verdict.basis, 'national_average');
  assert.equal(verdict.centreCents, Math.round(601 * 1.5));
  assert.equal(verdict.sigmaLog, 0.45, 'the size-assumed spread, as measured');
  assert.ok(verdict.notes.includes('size_assumed'));
  assert.equal(verdict.scaledTo, null);
  assert.equal(trace.nationalAverage?.sizeAssumed, true);
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
