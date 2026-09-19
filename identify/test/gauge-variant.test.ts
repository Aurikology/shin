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
  LONE_CLAIM_CEILING,
  LONE_CLAIM_FLOOR,
  type VariantGaugeUsable,
  type VariantOffer,
  type VariantShelfItem,
} from '../src/gauge-variant.ts';
/**
 * IMPORTED IN THE TEST ONLY, NEVER IN THE RUNTIME, same reasoning as
 * `gauge.test.ts`: `spine.ts` pulls a database-backed module graph behind it
 * that this package has no reason to load, so the numbers are copied there
 * and pinned here.
 */
import {
  LONE_CLAIM_CEILING as SPINE_LONE_CLAIM_CEILING,
  LONE_CLAIM_FLOOR as SPINE_LONE_CLAIM_FLOOR,
} from '../../spine/src/spine.ts';

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
  assert.deepEqual(g.excluded, [{ retailer: 'Walmart', code: 'different_model', note: 'different model', price: 999, url: 'w' }]);
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
  assert.equal(g.usable === false && g.reason, 'no_offers_on_line');
  assert.deepEqual(g.otherConditions, []);
  assert.deepEqual(g.otherVariants, [
    { retailer: 'Amazon', price: 1549, url: 'a', condition: 'new', label: '512 GB storage · +$250.00' },
  ]);
  assert.deepEqual(g.excluded, [{ retailer: 'Walmart', code: 'different_model', note: 'different model', price: 999, url: 'w' }]);
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
        // A second offer of the exact same variant, at the exact same price as
        // 'A', added only so the D-113 single-offer refusal does not swallow a
        // test whose actual subject is the differing-spec label order. Same
        // price keeps the median (and so every measured number below) exactly
        // as it was when this fixture had one offer.
        { retailer: 'A2', price: 1299, url: null, model: 'X', specs: { storage: '256 GB', ram: '16 GB', colour: 'black' }, condition: 'new' },
        { retailer: 'B', price: 1099, url: null, model: 'X', specs: { storage: '512 GB', ram: '8 GB', colour: 'black' }, condition: 'open-box' },
        { retailer: 'C', price: 1399, url: null, model: 'X', specs: { storage: '256 GB', colour: 'black' }, condition: 'new' },
      ],
    ),
  );
  assert.equal(g.n, 2);
  assert.deepEqual(g.otherVariants.map((v) => v.label), [
    '8 GB ram, 512 GB storage · -$200.00',
    'no ram · +$100.00',
  ]);
  assert.equal(g.otherVariants[0].condition, 'open-box', 'a differing spec wins over a differing condition, which is carried along');
});

test('no zone code is ever a word that grades the price', () => {
  const banned = /\b(good|fair|high|higher|deal|cheap|cheaper|expensive|bad|reasonable|steal|bargain|low)\b/i;
  // Two offers rather than one, both at the same price, so D-113's
  // single-offer refusal does not swallow this test's actual subject: the
  // ZONE CODES it checks are unaffected by which of two identical prices
  // sits at the median.
  const twoAt = (price: number): VariantOffer[] => [
    { retailer: 'A', price, url: null, model: 'M', specs: { storage: '1 TB' }, condition: 'new' },
    { retailer: 'B', price, url: null, model: 'M', specs: { storage: '1 TB' }, condition: 'new' },
  ];
  const at = (shelfPrice: number) =>
    computeVariantGauge({ price: shelfPrice, model: 'M', specs: { storage: '1 TB' }, condition: 'new' }, twoAt(1000));
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

/* ------------------------------------------------------------------ D-113 */

const V_MODEL = 'M';
const V_SPECS = { storage: '1 TB' };

function vOffer(retailer: string, price: number, url: string | null = null): VariantOffer {
  return { retailer, price, url, model: V_MODEL, specs: V_SPECS, condition: 'new' };
}

function vShelf(price: number): VariantShelfItem {
  return { price, model: V_MODEL, specs: V_SPECS, condition: 'new' };
}

test('one offer of the exact variant is the median, marked as one seller\'s price', () => {
  // Changed 2026-09-19, same ruling as `gauge.test.ts` ("the one price becomes
  // the median"): this asserted no line at all under D-113. Now the line is
  // drawn at that one price and the `one_offer` shortfall says so.
  const g = usable(computeVariantGauge(vShelf(999), [vOffer('Best Buy', 949)]));
  assert.equal(g.n, 1);
  assert.equal(g.median, 949);
  assert.equal(g.confidence, 'thin');
  assert.deepEqual(g.shortfalls, [{ code: 'one_offer', note: 'only one price found, so the middle is that price' }]);
  assert.equal(g.excluded.length, 0, 'the offer is not excluded');
});

test('no offer of the exact variant is still no line', () => {
  const g = computeVariantGauge(vShelf(999), []);
  assert.equal(g.usable, false);
  assert.equal(g.usable === false && g.reason, 'no_offers_on_line');
});

test('an unusable price cannot be placed anywhere, checked before the model comparison', () => {
  // Two offers of the exact variant, both with a price that is not a usable
  // amount. Neither may reach the median, and neither should be counted as
  // "on the line but excluded for some other reason": unusable_price is
  // checked first, exactly as in gauge.ts's cascade.
  const g = computeVariantGauge(vShelf(999), [vOffer('A', 0), vOffer('B', -5)]);
  assert.equal(g.usable, false);
  assert.equal(g.usable === false && g.reason, 'no_offers_on_line');
  assert.deepEqual(g.excluded.map((e) => e.code), ['unusable_price', 'unusable_price']);
  assert.equal(g.excluded[0].note, 'no usable price given');
});

test('an offer outside the lone-claim band is held off the line, D-113', () => {
  const near = [vOffer('A', 4.8), vOffer('B', 5), vOffer('C', 5.2)];
  const withOutlier = usable(computeVariantGauge(vShelf(5), [...near, vOffer('D', 20)]));
  const without = usable(computeVariantGauge(vShelf(5), near));

  assert.equal(withOutlier.points.length, 3, 'the outlier is not on the line');
  assert.deepEqual(withOutlier.excluded.map((e) => [e.retailer, e.code]), [['D', 'lone_claim']]);
  assert.equal(withOutlier.median, without.median, 'and it never entered the median');
  assert.equal(withOutlier.points[0].position, without.points[0].position, 'the honest prices are no longer compressed');
  assert.equal(withOutlier.zoneUnderBoundary, without.zoneUnderBoundary);
  assert.equal(withOutlier.confidence, 'thin', 'a held claim is a reason to call the line thin');
  assert.deepEqual(withOutlier.shortfalls.map((x) => x.code), ['claim_held']);
  assert.equal(without.confidence, 'ok');
});

test('a held claim is named to the reader rather than silently dropped', () => {
  const g = usable(computeVariantGauge(vShelf(5), [vOffer('A', 5), vOffer('B', 5.1), vOffer('C', 4.9), vOffer('Wrong', 40, 'u')]));
  const held = g.excluded.filter((e) => e.code === 'lone_claim');
  assert.equal(held.length, 1);
  assert.equal(held[0].retailer, 'Wrong');
  assert.equal(held[0].note, 'far from the other prices found');
  assert.equal(held[0].price, 40, 'the reader can still see what the held price actually was');
  assert.equal(held[0].url, 'u');
});

test('when every price disagrees with every other, none is held and the disagreement is named', () => {
  /**
   * The spine's rule, carried across: the hold can never empty the set
   * (`spine/src/spine.ts:417`). Three prices a factor of ten apart are not
   * one outlier among friends, they are three sources that do not agree, and
   * dropping all three would leave the shopper with nothing at all.
   */
  const g = usable(computeVariantGauge(vShelf(5), [vOffer('A', 1), vOffer('B', 10), vOffer('C', 100)]));
  assert.equal(g.points.length, 3, 'nothing was dropped');
  assert.equal(g.excluded.length, 0);
  assert.equal(g.confidence, 'thin');
  assert.deepEqual(g.shortfalls.map((x) => x.code), ['spread_unresolved']);
});

test('the lone-claim band has not drifted from the spine engine it was taken from', () => {
  // The numbers live in three files now (spine.ts, gauge.ts, gauge-variant.ts)
  // on purpose. This is what stops them becoming three different numbers
  // without anyone noticing.
  assert.equal(LONE_CLAIM_FLOOR, SPINE_LONE_CLAIM_FLOOR);
  assert.equal(LONE_CLAIM_CEILING, SPINE_LONE_CLAIM_CEILING);
});
