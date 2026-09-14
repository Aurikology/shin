/**
 * The spec-variant gauge, proven against fake numbers only.
 *
 * EVERY NUMBER HERE WAS MEASURED, NOT TYPED, the same way as in
 * `gauge.test.ts`: `GAUGE_VARIANT_PYTHON_SOURCE` was run in a real CPython
 * 3.14 interpreter over the identical input and the TypeScript twin was
 * compared to that run with `deepStrictEqual`. Every case matched.
 *
 * NOTHING HERE TOUCHES A REAL GROUNDED PRICE. See `src/gauge.ts`'s header for
 * why that matters and what it would breach.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeVariantGauge,
  codeMatchesVariantGauge,
  GAUGE_VARIANT_PYTHON_SOURCE,
  type VariantGaugeUsable,
  type VariantOffer,
  type VariantShelfItem,
} from '../src/gauge-variant.ts';

function usable(result: ReturnType<typeof computeVariantGauge>): VariantGaugeUsable {
  assert.equal(result.usable, true, 'expected a placeable line');
  return result as VariantGaugeUsable;
}

const SHELF: VariantShelfItem = {
  price: 1299,
  model: 'MBA-M4-13',
  specs: { storage: '256 GB', ram: '16 GB' },
  condition: 'new',
};

const OFFERS: readonly VariantOffer[] = [
  { retailer: 'Best Buy', price: 1249, url: 'b', model: 'MBA-M4-13', specs: { storage: '256 GB', ram: '16 GB' }, condition: 'new' },
  { retailer: 'Costco', price: 1199, url: 'c', model: 'MBA-M4-13', specs: { storage: '256 GB', ram: '16 GB' }, condition: 'new' },
  { retailer: 'Apple Refurb', price: 1049, url: 'r', model: 'MBA-M4-13', specs: { storage: '256 GB', ram: '16 GB' }, condition: 'refurbished' },
  { retailer: 'Amazon', price: 1549, url: 'a', model: 'MBA-M4-13', specs: { storage: '512 GB', ram: '16 GB' }, condition: 'new' },
  { retailer: 'Walmart', price: 999, url: 'w', model: 'MBA-M3-13', specs: { storage: '256 GB', ram: '16 GB' }, condition: 'new' },
];

test('only the exact same variant, in the same condition, is on the line', () => {
  const g = usable(computeVariantGauge(SHELF, OFFERS));
  assert.equal(g.n, 2, 'five offers, two of them the same box in the same condition');
  assert.deepEqual(g.points.map((p) => p.retailer), ['Best Buy', 'Costco']);
  assert.equal(g.median, 1224);
  assert.equal(g.percent, 6.127450980392156);
  assert.equal(g.zone, 'middle');
  assert.equal(g.shelfPosition, 70.42483660130719);
  assert.equal(g.points[0].position, 56.808278867102395);
  assert.equal(g.points[1].position, 43.191721132897605);
  assert.equal(g.zoneUnderBoundary, 16.66666666666667);
  assert.equal(g.zoneOverBoundary, 83.33333333333333);
});

test('a different condition is a different product, listed and never placed', () => {
  const g = usable(computeVariantGauge(SHELF, OFFERS));
  assert.deepEqual(g.otherConditions, [{ retailer: 'Apple Refurb', price: 1049, url: 'r', condition: 'refurbished' }]);
  assert.ok(
    !g.points.some((p) => p.retailer === 'Apple Refurb'),
    'a refurbished unit at $1,049 would drag the middle down against a new one',
  );
});

test('another variant of the same model carries its differing spec and the price difference', () => {
  const g = usable(computeVariantGauge(SHELF, OFFERS));
  assert.deepEqual(g.otherVariants, [
    { retailer: 'Amazon', price: 1549, url: 'a', condition: 'new', label: '512 GB storage · +$250.00' },
  ]);
});

test('a different model entirely is excluded rather than guessed at', () => {
  const g = usable(computeVariantGauge(SHELF, OFFERS));
  assert.deepEqual(g.excluded, [{ retailer: 'Walmart', note: 'different model' }]);
});

test('no offer of this exact variant means no verdict, but the lists still come back', () => {
  const g = computeVariantGauge(
    { price: 1299, model: 'MBA-M4-13', specs: { storage: '256 GB' }, condition: 'new' },
    [
      { retailer: 'Amazon', price: 1549, url: 'a', model: 'MBA-M4-13', specs: { storage: '512 GB' }, condition: 'new' },
      { retailer: 'Walmart', price: 999, url: 'w', model: 'MBA-M3-13', specs: { storage: '256 GB' }, condition: 'new' },
    ],
  );
  assert.equal(g.usable, false);
  assert.deepEqual(g.otherConditions, []);
  assert.deepEqual(g.otherVariants, [
    { retailer: 'Amazon', price: 1549, url: 'a', condition: 'new', label: '512 GB storage · +$250.00' },
  ]);
  assert.deepEqual(g.excluded, [{ retailer: 'Walmart', note: 'different model' }]);
  assert.equal('points' in g, false, 'there is no line to put points on');
});

test('several differing specs are listed in one fixed order, and a spec nobody stated says so', () => {
  // Sorted keys on both sides of the network call. Iterating a Python set of
  // strings is not reproducible between processes, so an unsorted version
  // could produce two different labels for one product while still passing
  // the code check, which only proves the source matched.
  const g = usable(
    computeVariantGauge(
      { price: 1299, model: 'X', specs: { storage: '256 GB', ram: '16 GB', colour: 'black' }, condition: 'new' },
      [
        { retailer: 'A', price: 1299, url: null, model: 'X', specs: { storage: '256 GB', ram: '16 GB', colour: 'black' }, condition: 'new' },
        { retailer: 'B', price: 1099, url: null, model: 'X', specs: { storage: '512 GB', ram: '8 GB', colour: 'black' }, condition: 'open-box' },
        { retailer: 'C', price: 1399, url: null, model: 'X', specs: { storage: '256 GB', colour: 'black' }, condition: 'new' },
      ],
    ),
  );
  assert.equal(g.n, 1);
  assert.deepEqual(g.otherVariants.map((v) => v.label), [
    '8 GB ram, 512 GB storage · -$200.00',
    'no ram · +$100.00',
  ]);
  assert.equal(g.otherVariants[0].condition, 'open-box', 'a differing spec wins over a differing condition, which is carried along');
});

test('no zone code is ever a word that grades the price', () => {
  const banned = /\b(good|fair|high|higher|deal|cheap|cheaper|expensive|bad|reasonable|steal|bargain|low)\b/i;
  const only = (price: number): VariantOffer[] => [
    { retailer: 'A', price, url: null, model: 'M', specs: { storage: '1 TB' }, condition: 'new' },
  ];
  const at = (shelfPrice: number) =>
    computeVariantGauge({ price: shelfPrice, model: 'M', specs: { storage: '1 TB' }, condition: 'new' }, only(1000));
  const cases = [at(900), at(1000), at(1500)];
  for (const g of cases) assert.doesNotMatch(JSON.stringify(g), banned, `a grading word reached the output: ${JSON.stringify(g)}`);
  assert.deepEqual(cases.map((g) => (g as VariantGaugeUsable).zone), ['under_your_line', 'middle', 'over_your_line']);
});

test('the variant Python source is fixed, self-contained and deterministic', () => {
  assert.match(GAUGE_VARIANT_PYTHON_SOURCE, /^def gauge_variant\(shelf, offers, under_pct, over_pct\):/);
  assert.match(GAUGE_VARIANT_PYTHON_SOURCE, /"under_your_line"/);
  assert.match(GAUGE_VARIANT_PYTHON_SOURCE, /"over_your_line"/);
  assert.match(GAUGE_VARIANT_PYTHON_SOURCE, /sorted\(set\(a\.keys\(\)\) \| set\(b\.keys\(\)\)\)/, 'unordered set iteration would not be reproducible');
  assert.doesNotMatch(GAUGE_VARIANT_PYTHON_SOURCE, /\b(random|time|datetime|requests|urllib|os|numpy|pandas)\b/);
});

test('the variant code check passes the real source, survives reformatting, and fails anything else', () => {
  assert.equal(codeMatchesVariantGauge(GAUGE_VARIANT_PYTHON_SOURCE), true);
  assert.equal(codeMatchesVariantGauge(`\n\n  ${GAUGE_VARIANT_PYTHON_SOURCE.replace(/\n/g, '\r\n')}   `), true);
  assert.equal(codeMatchesVariantGauge(GAUGE_VARIANT_PYTHON_SOURCE.replace(/ {4}/g, '\t')), true);

  assert.equal(codeMatchesVariantGauge(GAUGE_VARIANT_PYTHON_SOURCE.replace('* 100', '* 1000')), false);
  assert.equal(codeMatchesVariantGauge(GAUGE_VARIANT_PYTHON_SOURCE.replace('median = sp[n // 2]', 'median = sum(sp) / n')), false);
  // The filter is the whole algorithm here: a model that dropped the model
  // check would put a different laptop on the line.
  assert.equal(codeMatchesVariantGauge(GAUGE_VARIANT_PYTHON_SOURCE.replace('if o.get("model") != shelf_model:', 'if False:')), false);
  assert.equal(codeMatchesVariantGauge(''), false);
  assert.equal(codeMatchesVariantGauge(null), false);
  assert.equal(codeMatchesVariantGauge(undefined), false);
  // The two sources are not interchangeable.
  assert.equal(codeMatchesVariantGauge('def gauge(shelf, offers, under_pct, over_pct):\n    return None'), false);
});
