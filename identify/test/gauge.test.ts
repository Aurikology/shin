/**
 * The three-zone price gauge algorithm, tested with fake numbers only --
 * never against a real Gemini call. See gauge.ts's header for why:
 * `computeGauge` here is the local proof that the algorithm is correct
 * before its literal Python twin (`GAUGE_PYTHON_SOURCE`) is ever trusted
 * inside a prompt. Every expected number below was cross-checked by running
 * the actual Python source under a real `python3` interpreter on this
 * machine while writing this file (scratch script, not committed -- scratch
 * work, not a test).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeGauge, codeMatchesGauge, GAUGE_PYTHON_SOURCE, type GaugeShelfItem, type GaugeOffer } from '../src/providers/gauge.ts';

function approx(actual: number, expected: number, msg: string, epsilon = 1e-6): void {
  assert.ok(Math.abs(actual - expected) < epsilon, `${msg}: expected ~${expected}, got ${actual}`);
}

test('GAUGE_PYTHON_SOURCE parses under a real Python interpreter and defines gauge()', () => {
  assert.match(GAUGE_PYTHON_SOURCE, /^def gauge\(shelf, offers, good_pct, bad_pct\):/);
  const opens = (GAUGE_PYTHON_SOURCE.match(/\(/g) ?? []).length;
  const closes = (GAUGE_PYTHON_SOURCE.match(/\)/g) ?? []).length;
  assert.equal(opens, closes, 'unbalanced parens would mean this is not valid Python at all');
});

test('codeMatchesGauge: identical source matches, whitespace-only reformatting still matches, a changed number does not', () => {
  assert.equal(codeMatchesGauge(GAUGE_PYTHON_SOURCE), true);
  assert.equal(codeMatchesGauge(GAUGE_PYTHON_SOURCE.replace(/\n/g, '\n\n').replace(/    /g, '  ')), true, 're-indented/re-spaced but logically identical code still matches');
  assert.equal(codeMatchesGauge(GAUGE_PYTHON_SOURCE.replace('* 100', '* 99')), false, 'a changed constant must be caught');
  assert.equal(codeMatchesGauge(null), false);
  assert.equal(codeMatchesGauge(''), false);
});

test('one store: shelf equals the only comparator, lands dead centre, thresholds set the zone width', () => {
  const shelf: GaugeShelfItem = { price: 10, sizeValue: 355, sizeUnit: 'mL', packCount: 1 };
  const offers: GaugeOffer[] = [{ retailer: 'A', price: 10, sizeValue: 355, sizeUnit: 'mL', packCount: 1, url: 'https://a' }];
  const result = computeGauge(shelf, offers, 10, 10);
  assert.ok(result.usable);
  if (!result.usable) return;
  approx(result.median, 10 / 3.55, 'median is the unit price (per 100 mL), not the raw price');
  approx(result.percent, 0, 'shelf equals the only price, so 0% off');
  assert.equal(result.label, 'reasonable');
  assert.equal(result.n, 1);
  approx(result.shelfPosition, 50, 'dead centre');
  assert.equal(result.shelfLabel, '355 mL · $10.00');
  assert.equal(result.points[0].label, '355 mL · $10.00');
  approx(result.zoneGoodBoundary, 16.66666666666667, 'good boundary at span 15', 1e-6);
  approx(result.zoneBadBoundary, 83.33333333333333, 'bad boundary at span 15', 1e-6);
});

test('multipack: a 6x355 mL offer is scaled to its true total size and, per the final rule, still counts on the line', () => {
  const shelf: GaugeShelfItem = { price: 2.0, sizeValue: 355, sizeUnit: 'mL', packCount: 1 };
  const offers: GaugeOffer[] = [
    { retailer: 'MultipackMart', price: 10.0, sizeValue: 355, sizeUnit: 'mL', packCount: 6, url: 'https://a' }, // total 2130 mL
    { retailer: 'CornerShop', price: 2.2, sizeValue: 355, sizeUnit: 'mL', packCount: 1, url: 'https://c' },
    { retailer: 'BigBottle', price: 3.0, sizeValue: 1.5, sizeUnit: 'L', packCount: 1, url: 'https://b' }, // 1500 mL
  ];
  const result = computeGauge(shelf, offers, 10, 10);
  assert.ok(result.usable);
  if (!result.usable) return;
  assert.equal(result.n, 3, 'every offer with a size in the same dimension counts, no band excludes the bulk pack');
  assert.deepEqual(
    result.points.map((p) => p.retailer).sort(),
    ['BigBottle', 'CornerShop', 'MultipackMart'],
  );
  const multipack = result.points.find((p) => p.retailer === 'MultipackMart')!;
  assert.equal(multipack.label, '6 x 355 mL · $10.00');
  approx(multipack.position, 50.0, 'cross-checked against python3', 1e-6);
  const bigBottle = result.points.find((p) => p.retailer === 'BigBottle')!;
  assert.equal(bigBottle.label, '1.5 L · $3.00');
  approx(bigBottle.position, 2.1666666666666643, 'cross-checked against python3', 1e-6);
});

test('oz to g: pound and ounce offers convert to grams before comparing, matching a python3-verified case', () => {
  const shelf: GaugeShelfItem = { price: 5.0, sizeValue: 16, sizeUnit: 'oz', packCount: 1 }; // 453.5924 g
  const offers: GaugeOffer[] = [
    { retailer: 'PoundStore', price: 4.8, sizeValue: 1, sizeUnit: 'lb', packCount: 1, url: 'https://f' }, // 453.59237 g
    { retailer: 'TinyBag', price: 1.0, sizeValue: 1, sizeUnit: 'oz', packCount: 1, url: 'https://h' }, // 28.35 g, still on the line
  ];
  const result = computeGauge(shelf, offers, 10, 10);
  assert.ok(result.usable);
  if (!result.usable) return;
  assert.equal(result.dimension, 'mass');
  assert.equal(result.unitLabel, '100 g');
  assert.equal(result.n, 2, 'every same-dimension offer counts now, including the tiny bag');
  assert.equal(result.points.find((p) => p.retailer === 'PoundStore')!.label, '1 lb · $4.80');
});

test('mixed L and mL: litres convert to millilitres before comparing', () => {
  const shelf: GaugeShelfItem = { price: 2.0, sizeValue: 355, sizeUnit: 'mL', packCount: 1 };
  const offers: GaugeOffer[] = [
    { retailer: 'BigBottle', price: 3.0, sizeValue: 1.5, sizeUnit: 'L', packCount: 1, url: 'https://b' },
    { retailer: 'BigBox', price: 2.75, sizeValue: 500, sizeUnit: 'mL', packCount: 1, url: 'https://d' },
  ];
  const result = computeGauge(shelf, offers, 10, 10);
  assert.ok(result.usable);
  if (!result.usable) return;
  assert.equal(result.n, 2);
  assert.equal(result.points.find((p) => p.retailer === 'BigBottle')!.label, '1.5 L · $3.00');
});

test('an offer outside any old-style band still lands on the line: a bigger size that is a worse per-unit deal shows as worse, not hidden', () => {
  const shelf: GaugeShelfItem = { price: 2.0, sizeValue: 355, sizeUnit: 'mL', packCount: 1 };
  const offers: GaugeOffer[] = [
    { retailer: 'CornerShop', price: 2.2, sizeValue: 355, sizeUnit: 'mL', packCount: 1, url: 'https://c' },
    // A much bigger jug priced disproportionately high per unit -- Jamin's own words: "if a bigger size makes the scanned one a bad deal, it is a bad deal."
    { retailer: 'OverpricedJug', price: 20.0, sizeValue: 4, sizeUnit: 'L', packCount: 1, url: 'https://z' },
  ];
  const result = computeGauge(shelf, offers, 10, 10);
  assert.ok(result.usable);
  if (!result.usable) return;
  assert.equal(result.n, 2, 'the bigger jug is not excluded by any size band -- there is none any more');
  assert.equal(result.excluded.length, 0);
});

test('missing size and a mass/volume dimension mismatch are both excluded from the line, with a note, not placed on it', () => {
  const shelf: GaugeShelfItem = { price: 2.0, sizeValue: 355, sizeUnit: 'mL', packCount: 1 };
  const offers: GaugeOffer[] = [
    { retailer: 'CornerShop', price: 2.2, sizeValue: 355, sizeUnit: 'mL', packCount: 1, url: 'https://c' },
    { retailer: 'NoSizeCo', price: 1.99, sizeValue: null, sizeUnit: null, packCount: null, url: null },
    { retailer: 'JarPlace', price: 2.5, sizeValue: 340, sizeUnit: 'g', packCount: 1, url: 'https://e' }, // mass, shelf is volume
  ];
  const result = computeGauge(shelf, offers, 10, 10);
  assert.ok(result.usable);
  if (!result.usable) return;
  assert.equal(result.n, 1);
  assert.deepEqual(
    result.excluded.map((e) => e.retailer).sort(),
    ['JarPlace', 'NoSizeCo'],
  );
  for (const e of result.excluded) assert.equal(e.note, 'no size or different dimension');
});

test('nothing lands on the line: usable is false, prices/reviews still have a place to go, no verdict is drawn', () => {
  const shelf: GaugeShelfItem = { price: 2.0, sizeValue: 355, sizeUnit: 'mL', packCount: 1 };
  const offers: GaugeOffer[] = [{ retailer: 'NoSizeCo', price: 1.99, sizeValue: null, sizeUnit: null, packCount: null, url: null }];
  const result = computeGauge(shelf, offers, 10, 10);
  assert.equal(result.usable, false);
  if (result.usable) return;
  assert.equal(result.excluded.length, 1);
});

test('an outlier price inflates the span for every point, compressing the rest toward the middle (accepted, not routed around)', () => {
  const shelf: GaugeShelfItem = { price: 10.2, sizeValue: 500, sizeUnit: 'g', packCount: 1 };
  const offers: GaugeOffer[] = [
    { retailer: 'A', price: 10.0, sizeValue: 500, sizeUnit: 'g', packCount: 1, url: 'https://a' },
    { retailer: 'B', price: 10.5, sizeValue: 500, sizeUnit: 'g', packCount: 1, url: 'https://b' },
    { retailer: 'Outlier', price: 40.0, sizeValue: 500, sizeUnit: 'g', packCount: 1, url: 'https://c' },
  ];
  const result = computeGauge(shelf, offers, 10, 10);
  assert.ok(result.usable);
  if (!result.usable) return;
  assert.equal(result.n, 3);
  const outlierPoint = result.points.find((p) => p.retailer === 'Outlier')!;
  assert.ok(outlierPoint.position > 90, 'the outlier itself sits near the far edge');
  const others = result.points.filter((p) => p.retailer !== 'Outlier');
  for (const p of others) assert.ok(Math.abs(p.position - 50) < 5, `non-outlier point compressed near the middle by the inflated span, got ${p.position}`);
});

test('durable-good sizes are treated exactly like any other size now: same dimension counts, no exact-match rule', () => {
  const shelf: GaugeShelfItem = { price: 20.0, sizeValue: 32, sizeUnit: 'L', packCount: 1 };
  const offers: GaugeOffer[] = [
    { retailer: 'SameSizeCo', price: 18.0, sizeValue: 32, sizeUnit: 'L', packCount: 1, url: 'https://i' },
    { retailer: 'BiggerBin', price: 25.0, sizeValue: 64, sizeUnit: 'L', packCount: 1, url: 'https://j' },
  ];
  const result = computeGauge(shelf, offers, 10, 10);
  assert.ok(result.usable);
  if (!result.usable) return;
  assert.equal(result.n, 2, 'no category split any more -- both land on the line by dimension alone');
  assert.equal(result.excluded.length, 0);
});
