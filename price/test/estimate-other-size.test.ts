/**
 * Sibling sizes (D-280 probe B, 2026-11-25): the other_size rung. Siblings are the same first brand and name stem
 * in the shopper's currency, same size dimension, size 5% or more apart; the price at the target's size is the median
 * of sibling price x (target size / sibling size)^0.69, and the shown range is exactly [0.66, 1.51] x it. Multipacks
 * are read into whole-pack totals (pack-count.ts) and never paired with a bare size.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { clearEstimateCache, estimate, type ClaudeAnswer } from '../src/estimate.ts';
import { packSide, pairable, readPackCount, stripPackCounts } from '../src/pack-count.ts';
import { toComparison } from '../../catalogue/src/units.ts';

const AS_OF = '2026-09-30';
const SELF = '0626990000001';
const SIB_A = '4000000000001';
const SIB_B = '4000000000002';

let sku = 0;
function obs(over: Partial<ObservationRow>): ObservationRow {
  sku += 1;
  return {
    code: null, seller: 'shopA', sellerSku: `sku-${sku}`, sellerName: 'Thing', sellerBrand: null, priceCents: 1000, kind: 'regular',
    unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: null, joinMethod: 'gtin', seenOn: '2026-09-20',
    url: null, imageUrl: null, inStock: null, ...over,
  };
}

interface Prod {
  code: string;
  name: string;
  brand: string | null;
  quantity: string | null;
}

function world(products: readonly Prod[], rows: readonly ObservationRow[]) {
  clearEstimateCache();
  const catalogue = new DatabaseSync(':memory:');
  catalogue.exec(`CREATE TABLE product (
    code TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT, brands TEXT, quantity TEXT, size_value REAL, size_unit TEXT,
    category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT, source TEXT)`);
  const ins = catalogue.prepare('INSERT INTO product (code, name, name_en, brands, quantity, category_path) VALUES (?,?,?,?,?,?)');
  for (const p of products) ins.run(p.code, p.name, p.name, p.brand, p.quantity, '[]');
  const prices = openPrices(':memory:');
  for (const r of rows) recordObservation(prices, r);
  return { prices, catalogue };
}

const noClaude = async (): Promise<ClaudeAnswer> => ({ ok: false, reason: 'threw' });
const ask = (deps: { prices: DatabaseSync; catalogue: DatabaseSync }, over: object = {}) =>
  estimate({ barcode: SELF, asOf: AS_OF, currency: 'CAD', country: 'CA', ...over }, null, { ...deps, askClaude: noClaude });
const otherSizeOutcome = (r: Awaited<ReturnType<typeof ask>>) => r.trace.tried.find((t) => t.rung === 'other_size')?.outcome;

/** The scored curve, written out: sibling price x (target / sibling)^0.69, then the band. */
const band = (price: number, ratio: number) => {
  const m = price * Math.pow(ratio, 0.69);
  return { low: Math.round(m * 0.66), high: Math.round(m * 1.51) };
};

/* ------------------------------------------------------------------ the pack-count reader */

test('pack counts: every multipack shape reads into a count and a whole-pack total', () => {
  const cases: [string, string | null, number | null, number | null, string][] = [
    // text, size text, count, total base value, family
    ['Energy Bar', '12 x 1.4 oz', 12, 12 * 1.4 * 28.349523125, 'mass'],
    ['Cola', '12x355mL', 12, 4260, 'volume'],
    ['Cola 355 ml x 6', null, 6, 2130, 'volume'],
    ['Cola 6-pack 355 ml', null, 6, 2130, 'volume'],
    ['Cola 6 pk 355 ml', null, 6, 2130, 'volume'],
    ['Granola Bars 1.4 oz 4 ct', null, 4, 4 * 1.4 * 28.349523125, 'mass'],
    ['Bars 4 ct', null, 4, 4, 'count'],
    ['Cola pack of 8 355 ml', null, 8, 2840, 'volume'],
    ['Water 24 bottles 500 ml', null, 24, 12000, 'volume'],
    ['Jus paquet de 6 200 ml', null, 6, 1200, 'volume'],
    ['Cola 6 x 355 ml', null, 6, 2130, 'volume'],
  ];
  for (const [name, size, count, total, family] of cases) {
    const r = readPackCount(name, size);
    assert.equal(r.count, count, `${name} ${size ?? ''}: count`);
    assert.equal(r.multi, true, `${name}: multi`);
    assert.ok(r.total, `${name} ${size ?? ''}: a total`);
    assert.equal(r.total!.family, family, `${name}: family`);
    assert.ok(Math.abs(r.total!.baseValue - total!) < 1e-6, `${name}: total ${r.total!.baseValue} is not ${total}`);
  }
});

test('pack counts: a count with no size in its own text has a count and no total; a plain size names no count', () => {
  for (const [name, size, count] of [['Lemonade 6 pack', '2.13 L', 6], ['Water 24 bottles', '500 ml', 24], ['Juice paquet de 4', '946 ml', 4], ['Cola 6 x', null, 6], ['Cola 6-pack', null, 6]] as const) {
    const r = readPackCount(name, size);
    assert.equal(r.count, count, name);
    assert.equal(r.total, null, `${name}: the size may be one unit's or the pack's, so there is no total`);
  }
  const plain = readPackCount('Crunch Chips', '200 g');
  assert.equal(plain.count, null);
  assert.equal(plain.multi, false);
  const side = packSide('Crunch Chips', '200 g', toComparison(200, 'g'));
  assert.equal(side.total!.baseValue, 200);
  // Two different counts are a conflict: multi, with no total.
  const conflict = readPackCount('Cola 6 pack 24 ct 355 ml', null);
  assert.equal(conflict.multi, true);
  assert.equal(conflict.total, null);
});

test('pack counts: a multipack pairs only with a multipack that has a count and a total', () => {
  const g = (v: number) => toComparison(v, 'g');
  const six = packSide('Bar 6 x 40 g', '6 x 40 g', g(240));
  const twelve = packSide('Bar 12 x 40 g', null, g(480));
  const single = packSide('Bar', '40 g', g(40));
  const unknownPack = packSide('Bar 12 ct', '40 g', g(40));
  const other = packSide('Bar 1 L', null, toComparison(1, 'l'));
  assert.equal(pairable(six, twelve), true);
  assert.equal(pairable(six, single), false, 'a multipack is never compared with a bare size');
  assert.equal(pairable(single, six), false);
  assert.equal(pairable(twelve, unknownPack), false, 'a pack whose total cannot be determined is not paired');
  assert.equal(pairable(single, packSide('Bar', '80 g', g(80))), true, 'two plain sizes pair');
  assert.equal(pairable(six, other), false, 'different dimensions never pair');
});

test('name stems: pack counts come out, so a 6-pack and a 12-pack of one product share a stem', () => {
  assert.equal(stripPackCounts('Cola 6 pk').trim(), 'cola');
  assert.equal(stripPackCounts('Cola 12-pack').trim(), 'cola');
  assert.equal(stripPackCounts('Cola pack of 8').trim(), 'cola');
  assert.equal(stripPackCounts('Jus paquet de 6').trim(), 'jus');
});

/* ------------------------------------------------------------------ the rung */

test('a normal two-size pair: the median at the target size, shown as exactly [0.66, 1.51] x it', async () => {
  const w = world(
    [
      { code: SELF, name: 'Crunch Chips', brand: 'Crunch', quantity: '200 g' },
      { code: SIB_A, name: 'Crunch Chips', brand: 'Crunch', quantity: '300 g' },
    ],
    [obs({ code: SIB_A, priceCents: 450 })],
  );
  const r = await ask(w);
  const b = band(450, 200 / 300);
  assert.deepEqual(b, { low: 225, high: 514 });
  assert.equal(r.verdict.basis, 'other_size');
  assert.equal(r.verdict.spreadFrom, 'other_size');
  assert.equal(r.verdict.p10Cents, b.low);
  assert.equal(r.verdict.p90Cents, b.high);
  assert.equal(r.verdict.centreCents, Math.round(Math.sqrt(b.low * b.high)));
  assert.equal(r.verdict.n, 1);
  assert.ok(r.verdict.notes.includes('few_prices'));
  assert.equal(r.verdict.confidence, 'low');
  assert.deepEqual(r.trace.tried.map((t) => [t.rung, t.outcome]).slice(0, 3), [['own_prices', 'too_few'], ['cross_border', 'too_few'], ['other_size', 'used']]);
  w.prices.close();
  w.catalogue.close();
});

test('the median of two siblings is their mean, and the band is still exact', async () => {
  const w = world(
    [
      { code: SELF, name: 'Crunch Chips', brand: 'Crunch', quantity: '200 g' },
      { code: SIB_A, name: 'Crunch Chips', brand: 'Crunch', quantity: '300 g' },
      { code: SIB_B, name: 'Crunch Chips', brand: 'Crunch', quantity: '150 g' },
    ],
    [obs({ code: SIB_A, priceCents: 450 }), obs({ code: SIB_B, priceCents: 330 })],
  );
  const r = await ask(w);
  const m = (450 * Math.pow(200 / 300, 0.69) + 330 * Math.pow(200 / 150, 0.69)) / 2;
  assert.equal(r.verdict.basis, 'other_size');
  assert.equal(r.verdict.n, 2);
  assert.equal(r.verdict.p10Cents, Math.round(m * 0.66));
  assert.equal(r.verdict.p90Cents, Math.round(m * 1.51));
  w.prices.close();
  w.catalogue.close();
});

test('sizes within 5% are one size, another brand or name stem or currency is no sibling, a different dimension never pairs', async () => {
  const w = world(
    [
      { code: SELF, name: 'Crunch Chips', brand: 'Crunch', quantity: '200 g' },
      { code: SIB_A, name: 'Crunch Chips', brand: 'Crunch', quantity: '204 g' }, // 2% apart: the same size
      { code: SIB_B, name: 'Crunch Chips Salt', brand: 'Crunch', quantity: '300 g' }, // another stem
      { code: '4000000000003', name: 'Crunch Chips', brand: 'Other', quantity: '300 g' }, // another brand
      { code: '4000000000004', name: 'Crunch Chips', brand: 'Crunch', quantity: '1 L' }, // another dimension
      { code: '4000000000005', name: 'Crunch Chips', brand: 'Crunch', quantity: '300 g' }, // priced in USD only
    ],
    [
      obs({ code: SIB_A, priceCents: 450 }),
      obs({ code: SIB_B, priceCents: 450 }),
      obs({ code: '4000000000003', priceCents: 450 }),
      obs({ code: '4000000000004', priceCents: 450 }),
      obs({ code: '4000000000005', priceCents: 450, currency: 'USD', country: 'US' }),
    ],
  );
  const r = await ask(w);
  assert.notEqual(r.verdict.basis, 'other_size');
  assert.equal(otherSizeOutcome(r), 'too_few');
  w.prices.close();
  w.catalogue.close();
});

test('multipacks pair with multipacks by whole-pack total: 6 x 355 ml against 12 x 355 ml', async () => {
  const w = world(
    [
      { code: SELF, name: 'Brightside Lemonade', brand: 'Brightside', quantity: '6 x 355 ml' },
      { code: SIB_A, name: 'Brightside Lemonade', brand: 'Brightside', quantity: '12 x 355 ml' },
    ],
    [obs({ code: SIB_A, priceCents: 1000 })],
  );
  const r = await ask(w);
  const b = band(1000, 0.5);
  assert.equal(r.verdict.basis, 'other_size');
  assert.equal(r.verdict.p10Cents, b.low);
  assert.equal(r.verdict.p90Cents, b.high);
  w.prices.close();
  w.catalogue.close();
});

test('a 6 pk and a 12 pk named in the product name share a stem and pair on the printed sizes', async () => {
  const w = world(
    [
      { code: SELF, name: 'Brightside Lemonade 6 pk 355 ml', brand: 'Brightside', quantity: null },
      { code: SIB_A, name: 'Brightside Lemonade 12 pk 355 ml', brand: 'Brightside', quantity: null },
    ],
    [obs({ code: SIB_A, priceCents: 1000 })],
  );
  const r = await ask(w, { name: 'Brightside Lemonade 6 pk 355 ml', brand: 'Brightside' });
  const b = band(1000, 0.5);
  assert.equal(r.verdict.basis, 'other_size');
  assert.equal(r.verdict.p10Cents, b.low);
  assert.equal(r.verdict.p90Cents, b.high);
  w.prices.close();
  w.catalogue.close();
});

/* ---- the probe's four worst misses, as fixtures: each used to be paired as if sizes were comparable ---- */

test('probe miss 1, energy bars: a bar of 2 oz at $6.99 is not priced from a 12 ct box whose size column says 1.4 oz', async () => {
  const w = world(
    [
      { code: SELF, name: 'Trailfuel Energy Bar', brand: 'Trailfuel', quantity: '2 oz' },
      { code: SIB_A, name: 'Trailfuel Energy Bar 12 ct', brand: 'Trailfuel', quantity: '1.4 oz' },
    ],
    [obs({ code: SIB_A, priceCents: 6799 })],
  );
  const r = await ask(w);
  assert.notEqual(r.verdict.basis, 'other_size');
  assert.equal(otherSizeOutcome(r), 'too_few');
  assert.ok(!(r.verdict.p10Cents === 4479 && r.verdict.p90Cents === 10224));
  w.prices.close();
  w.catalogue.close();
});

test('probe miss 2, lemonade: one 710 ml bottle at $3.49 is not priced from a 24 ct case whose size column says 500 ml', async () => {
  const w = world(
    [
      { code: SELF, name: 'Brightside Lemonade', brand: 'Brightside', quantity: '710 ml' },
      { code: SIB_A, name: 'Brightside Lemonade 24 ct', brand: 'Brightside', quantity: '500 ml' },
    ],
    [obs({ code: SIB_A, priceCents: 3999 })],
  );
  const r = await ask(w);
  assert.notEqual(r.verdict.basis, 'other_size');
  assert.equal(otherSizeOutcome(r), 'too_few');
  assert.ok(!(r.verdict.p10Cents === 1633 && r.verdict.p90Cents === 3727));
  w.prices.close();
  w.catalogue.close();
});

test('probe miss 3, Lindt bunny: a 6 x 10 g pack at $18.49 is not priced from a single 100 g bunny', async () => {
  const w = world(
    [
      { code: SELF, name: 'Lindt Gold Bunny Mini', brand: 'Lindt', quantity: '6 x 10 g' },
      { code: SIB_A, name: 'Lindt Gold Bunny Mini', brand: 'Lindt', quantity: '100 g' },
    ],
    [obs({ code: SIB_A, priceCents: 600 })],
  );
  const r = await ask(w);
  assert.notEqual(r.verdict.basis, 'other_size');
  assert.equal(otherSizeOutcome(r), 'too_few');
  assert.ok(!(r.verdict.p10Cents === 408 && r.verdict.p90Cents === 931));
  w.prices.close();
  w.catalogue.close();
});

test('probe miss 4, milk: a 1 L carton at $3.19 is not priced from a 4 ct pack whose size column says 946 ml', async () => {
  const w = world(
    [
      { code: SELF, name: 'Beatrice Milk 2%', brand: 'Beatrice', quantity: '1 L' },
      { code: SIB_A, name: 'Beatrice Milk 2% 4 ct', brand: 'Beatrice', quantity: '946 ml' },
    ],
    [obs({ code: SIB_A, priceCents: 1199 })],
  );
  const r = await ask(w);
  assert.notEqual(r.verdict.basis, 'other_size');
  assert.equal(otherSizeOutcome(r), 'too_few');
  assert.ok(!(r.verdict.p10Cents === 444 && r.verdict.p90Cents === 1012));
  w.prices.close();
  w.catalogue.close();
});
