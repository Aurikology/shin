/**
 * The unit-price gauge, proven against fake numbers only.
 *
 * EVERY NUMBER IN THIS FILE WAS MEASURED, NOT TYPED. Each expectation below
 * came out of running `GAUGE_PYTHON_SOURCE` itself in a real CPython 3.14
 * interpreter over the identical input, and the TypeScript twin was then
 * compared to that run field by field with `deepStrictEqual`. All twenty
 * cases matched exactly. This is spelled out because a previous session
 * hand-typed an expected line for this function and it was wrong, and a
 * hand-typed expectation proves only that two guesses agree.
 *
 * NOTHING HERE TOUCHES A REAL GROUNDED PRICE. `computeGauge` is the local
 * twin and these are invented prices; running it on a Grounded Result would
 * be the one thing Google's grounding terms forbid. See `src/gauge.ts`'s
 * header.
 *
 * NO GRADING WORD APPEARS IN ANY EXPECTED VALUE, on purpose: the zone codes
 * are `under_your_line`, `middle` and `over_your_line`, which name the range
 * the user set and never a judgment of the price.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeGauge,
  codeMatchesGauge,
  GAUGE_PYTHON_SOURCE,
  type GaugeOffer,
  type GaugeShelfItem,
  type GaugeUsable,
} from '../src/gauge.ts';

/** Narrows and fails loudly, so a wrong `usable` does not read as a wrong number twenty lines later. */
function usable(result: ReturnType<typeof computeGauge>): GaugeUsable {
  assert.equal(result.usable, true, 'expected a placeable line');
  return result as GaugeUsable;
}

function offer(retailer: string, price: number, sizeValue: number | null, sizeUnit: string | null, packCount?: number): GaugeOffer {
  return { retailer, price, url: null, sizeValue, sizeUnit, packCount: packCount ?? null };
}

function shelf(price: number, sizeValue: number | null, sizeUnit: string | null, packCount?: number): GaugeShelfItem {
  return { price, sizeValue, sizeUnit, packCount: packCount ?? null };
}

test('one store still places a line, with that store sitting at the middle it defines', () => {
  const g = usable(computeGauge(shelf(4.99, 500, 'g'), [{ retailer: 'Loblaws', price: 3.99, url: 'u1', sizeValue: 500, sizeUnit: 'g' }]));
  assert.equal(g.n, 1);
  assert.equal(g.median, 0.798); // $3.99 per 500 g is $0.798 per 100 g
  assert.equal(g.percent, 25.06265664160402);
  assert.equal(g.zone, 'over_your_line');
  assert.equal(g.shelfPosition, 91.77109440267336);
  assert.equal(g.points[0].position, 50, 'the only price IS the median');
  assert.equal(g.shelfLabel, '500 g · $4.99');
  assert.equal(g.points[0].label, '500 g · $3.99');
  assert.equal(g.unitLabel, '100 g');
});

test('identical unit prices collapse to the middle without dividing by zero', () => {
  // Three different pack sizes, all $2.00 per 100 g. The percent is exactly
  // zero everywhere, and the span falls back to 1.5 x the user's percentages.
  const g = usable(computeGauge(shelf(4, 200, 'g'), [offer('A', 4, 200, 'g'), offer('B', 8, 400, 'g'), offer('C', 2, 100, 'g')]));
  assert.equal(g.median, 2);
  assert.equal(g.percent, 0);
  assert.equal(g.zone, 'middle');
  assert.equal(g.shelfPosition, 50);
  assert.deepEqual(g.points.map((p) => p.position), [50, 50, 50]);
  assert.equal(g.ticks.length, 7, 'span 15 at 5 point ticks is -15 to +15');
  assert.ok(g.points.every((p) => Number.isFinite(p.position)), 'no infinity and no NaN anywhere');
});

test('a median of zero does not produce an infinity or a NaN', () => {
  // A giveaway, or a scraped price of 0. The percentage is undefined, so
  // every point collapses to the middle rather than to Infinity.
  const g = usable(computeGauge(shelf(0, 100, 'g'), [offer('A', 0, 100, 'g')]));
  assert.equal(g.median, 0);
  assert.equal(g.percent, 0);
  assert.equal(g.zone, 'middle');
  assert.equal(g.shelfPosition, 50);
  assert.ok(Number.isFinite(g.percent) && Number.isFinite(g.shelfPosition));
});

test('an outlier balloons the span and compresses everyone else, which is the design', () => {
  // This is asserted rather than smoothed away. Step 3 takes the largest
  // absolute percent, so one $20 seller among three near $5 stretches the
  // scale to +/-295 and squeezes the rest against the middle.
  const near = [offer('A', 4.8, 100, 'g'), offer('B', 5, 100, 'g'), offer('C', 5.2, 100, 'g')];
  const withOutlier = usable(computeGauge(shelf(5, 100, 'g'), [...near, offer('D', 20, 100, 'g')]));
  const without = usable(computeGauge(shelf(5, 100, 'g'), near));

  assert.equal(withOutlier.median, 5.1);
  assert.equal(withOutlier.points[0].position, 49.00299102691924);
  assert.equal(withOutlier.points[3].position, 99.51811232967763, 'the outlier sits near the far end');
  assert.equal(without.points[0].position, 36.66666666666666);
  assert.ok(
    Math.abs(withOutlier.points[0].position - 50) < Math.abs(without.points[0].position - 50),
    'the same $4.80 seller is pulled toward the middle by the presence of the outlier',
  );
  // The zone boundaries are squeezed too: the user's 10 percent is a much
  // smaller slice of a 295 point span.
  assert.equal(withOutlier.zoneUnderBoundary, 48.30508474576271);
  assert.equal(withOutlier.zoneOverBoundary, 51.69491525423729);
  assert.equal(without.zoneUnderBoundary, 16.66666666666667);
});

test('a multipack is priced by its total volume, not by the can', () => {
  const g = usable(
    computeGauge(shelf(4.49, 355, 'mL', 6), [offer('A', 8.99, 355, 'mL', 12), offer('B', 2, 2, 'L')]),
  );
  assert.equal(g.dimension, 'volume');
  assert.equal(g.unitLabel, '100 mL');
  assert.equal(g.median, 0.15551643192488263);
  assert.equal(g.percent, 35.54716981132078);
  assert.equal(g.zone, 'over_your_line');
  assert.equal(g.shelfLabel, '6 x 355 mL · $4.49', 'the label says what was actually paid for, never the unit price');
  assert.equal(g.points[0].label, '12 x 355 mL · $8.99');
  assert.equal(g.points[1].label, '2 L · $2.00');
  assert.equal(g.points[0].position, 94.62264150943398);
  assert.equal(g.points[1].position, 5.3773584905660385);
});

test('oz and lb convert to grams on the same line as grams', () => {
  // 16 oz is 453.59237 g, and 226.796 g is half of that to within a rounding
  // of the printed pack size, which is why the percent is near but not
  // exactly -4.
  const g = usable(computeGauge(shelf(6, 16, 'oz'), [offer('A', 3, 226.796, 'g'), offer('B', 6.5, 1, 'lb')]));
  assert.equal(g.dimension, 'mass');
  assert.equal(g.median, 1.3778896781559853);
  assert.equal(g.percent, -4.0000375879498);
  assert.equal(g.zone, 'middle');
  assert.equal(g.shelfPosition, 36.666541373500664);
  assert.equal(g.shelfLabel, '16 oz · $6.00');
});

test('L, mL and fl oz all land on one volume line', () => {
  const g = usable(
    computeGauge(shelf(6.99, 4, 'L'), [offer('A', 2.49, 1000, 'mL'), offer('B', 1.5, 500, 'ml'), offer('C', 0.99, 12, 'fl oz')]),
  );
  assert.equal(g.n, 3);
  assert.equal(g.median, 0.2789656872902047, '$0.99 per 12 US fl oz is the middle of the three');
  assert.equal(g.percent, -37.357887381249995);
  assert.equal(g.zone, 'under_your_line');
  assert.equal(g.points[2].position, 50, 'the fl oz offer is the median itself');
  assert.equal(g.excluded.length, 0, '"fl oz" and "ml" normalise, so nothing is dropped for spelling');
});

test('an offer with no size is listed separately instead of placed', () => {
  const g = usable(computeGauge(shelf(4, 100, 'g'), [offer('A', 4, 100, 'g'), offer('NoSize', 9.99, null, null)]));
  assert.equal(g.n, 1);
  assert.deepEqual(g.excluded, [
    { retailer: 'NoSize', code: 'no_size', note: 'no size given', label: '$9.99', url: null },
  ]);
  assert.deepEqual(g.points.map((p) => p.retailer), ['A']);
});

test('a volume offer never lands on a mass line', () => {
  const g = usable(computeGauge(shelf(4, 100, 'g'), [offer('A', 4.4, 100, 'g'), offer('Vol', 3, 100, 'mL')]));
  assert.equal(g.n, 1);
  assert.equal(g.dimension, 'mass');
  assert.deepEqual(g.excluded, [
    { retailer: 'Vol', code: 'different_dimension', note: 'measured a different way', label: '100 mL · $3.00', url: null },
  ]);
  assert.equal(g.percent, -9.090909090909099);
  assert.equal(g.zone, 'middle');
});

test('when every offer is excluded there is no median, so there is no verdict', () => {
  const g = computeGauge(shelf(4, 100, 'g'), [offer('Vol', 3, 100, 'mL')]);
  assert.equal(g.usable, false);
  assert.equal(g.usable === false && g.dimension, 'mass');
  assert.equal(g.usable === false && g.unitLabel, '100 g');
  assert.deepEqual(g.excluded, [
    { retailer: 'Vol', code: 'different_dimension', note: 'measured a different way', label: '100 mL · $3.00', url: null },
  ]);
});

test('at the default 10 and 10 the boundaries sit at 16.67 and 83.33', () => {
  const g = usable(computeGauge(shelf(9, 100, 'g'), [offer('A', 9, 100, 'g'), offer('B', 10, 100, 'g'), offer('C', 11, 100, 'g')]));
  assert.equal(g.median, 10);
  assert.equal(g.zoneUnderBoundary, 16.66666666666667);
  assert.equal(g.zoneOverBoundary, 83.33333333333333);
  assert.equal(g.percent, -10);
  assert.equal(g.shelfPosition, 16.66666666666667);
  assert.equal(g.shelfPosition, g.zoneUnderBoundary, 'exactly on the line the user drew');
});

test('the two edges are decided the same way every time: under is inclusive, over is not', () => {
  // -10 with a 10 percent under line falls INSIDE it; +10 with a 10 percent
  // over line does NOT. One of the two has to own the boundary and this is
  // the one that does, pinned here so it cannot drift silently.
  const under = usable(computeGauge(shelf(9, 100, 'g'), [offer('A', 10, 100, 'g')]));
  assert.equal(under.percent, -10);
  assert.equal(under.zone, 'under_your_line');

  const over = usable(computeGauge(shelf(11, 100, 'g'), [offer('A', 10, 100, 'g')]));
  assert.equal(over.percent, 10);
  assert.equal(over.zone, 'middle');
  assert.equal(over.shelfPosition, 83.33333333333333);
  assert.equal(over.shelfPosition, over.zoneOverBoundary);
});

test('asymmetric percentages move the two boundaries independently', () => {
  // 5 under, 25 over. span = ceil(max(20, 7.5, 37.5)/5)*5 = 40.
  const g = usable(
    computeGauge(shelf(12, 100, 'g'), [offer('A', 10, 100, 'g'), offer('B', 11, 100, 'g'), offer('C', 9, 100, 'g')], 5, 25),
  );
  assert.equal(g.median, 10);
  assert.equal(g.percent, 20);
  assert.equal(g.zoneUnderBoundary, 43.75);
  assert.equal(g.zoneOverBoundary, 81.25);
  assert.equal(g.shelfPosition, 75);
  assert.equal(g.zone, 'middle', '20 percent over is inside a 25 percent over line');
  assert.equal(g.ticks.length, 9, 'span 40 at 10 point ticks');
});

test('count units price per item and never per gram', () => {
  const g = usable(computeGauge(shelf(12, 12, 'each'), [offer('A', 5, 6, 'count'), offer('B', 2.5, 3, 'ea')]));
  assert.equal(g.dimension, 'count');
  assert.equal(g.unitLabel, 'item');
  assert.equal(g.median, 0.8333333333333334);
  assert.equal(g.percent, 19.999999999999996);
  assert.equal(g.zone, 'over_your_line');
  assert.equal(g.shelfLabel, '12 each · $12.00');
});

test('ticks step by 5 under a span of 30 and by 10 above it', () => {
  const small = usable(computeGauge(shelf(9, 100, 'g'), [offer('A', 10, 100, 'g')]));
  assert.deepEqual(small.ticks.map((t) => t.pct), [-15, -10, -5, 0, 5, 10, 15]);
  assert.equal(small.ticks[3].label, 'middle');
  assert.equal(small.ticks[0].position, 0);
  assert.equal(small.ticks[6].position, 100);

  // span 35, so the step is 10 and the walk from -35 never lands on 0. The
  // middle tick is absent by arithmetic, not by omission, and the client has
  // to draw the midline from `position` 50 rather than from a tick.
  const big = usable(computeGauge(shelf(5, 100, 'g'), [offer('A', 5, 100, 'g'), offer('B', 10, 100, 'g')]));
  assert.deepEqual(big.ticks.map((t) => t.pct), [-35, -25, -15, -5, 5, 15, 25, 35]);
  assert.equal(big.ticks.filter((t) => t.label === 'middle').length, 0);
});

test('no zone code is ever a word that grades the price', () => {
  // Hard rule 2 and the founder's 2026-09-14 ruling. The reverted version of
  // this algorithm returned the literal words 'good' / 'reasonable' / 'bad';
  // this asserts that they cannot come back through this function.
  const banned = /\b(good|fair|high|higher|deal|cheap|cheaper|expensive|bad|reasonable|steal|bargain|low)\b/i;
  const cases = [
    computeGauge(shelf(9, 100, 'g'), [offer('A', 10, 100, 'g')]),
    computeGauge(shelf(11, 100, 'g'), [offer('A', 10, 100, 'g')]),
    computeGauge(shelf(20, 100, 'g'), [offer('A', 10, 100, 'g')]),
    computeGauge(shelf(4, 100, 'g'), [offer('Vol', 3, 100, 'mL')]),
  ];
  for (const g of cases) assert.doesNotMatch(JSON.stringify(g), banned, `a grading word reached the output: ${JSON.stringify(g)}`);
  assert.deepEqual(
    cases.filter((g) => g.usable).map((g) => (g as GaugeUsable).zone),
    ['under_your_line', 'middle', 'over_your_line'],
  );
});

test('the Python source is fixed, self-contained and free of grading words too', () => {
  assert.match(GAUGE_PYTHON_SOURCE, /^def gauge\(shelf, offers, under_pct, over_pct\):/);
  assert.match(GAUGE_PYTHON_SOURCE, /"under_your_line"/);
  assert.match(GAUGE_PYTHON_SOURCE, /"over_your_line"/);
  // Standard library only, nothing installed, nothing nondeterministic: the
  // sandbox installs no packages and two calls for one product must return
  // one scale.
  assert.doesNotMatch(GAUGE_PYTHON_SOURCE, /\b(random|time|datetime|requests|urllib|os|numpy|pandas)\b/);
  assert.match(GAUGE_PYTHON_SOURCE, /import math/);
});

test('the code check passes the real source, survives reformatting, and fails anything else', () => {
  assert.equal(codeMatchesGauge(GAUGE_PYTHON_SOURCE), true);

  // Reindented, re-line-ended, and padded. The point of the check is catching
  // changed ARITHMETIC, not changed layout.
  assert.equal(codeMatchesGauge(`   ${GAUGE_PYTHON_SOURCE.replace(/\n/g, '\r\n')}  \n\n`), true);
  assert.equal(codeMatchesGauge(GAUGE_PYTHON_SOURCE.replace(/ {4}/g, '\t')), true);

  // One digit changed is a different algorithm and gets no verdict.
  assert.equal(codeMatchesGauge(GAUGE_PYTHON_SOURCE.replace('* 100', '* 1000')), false);
  assert.equal(codeMatchesGauge(GAUGE_PYTHON_SOURCE.replace('453.59237', '453.6')), false);
  // A model that quietly swapped the median for a mean.
  assert.equal(codeMatchesGauge(GAUGE_PYTHON_SOURCE.replace('median = sp[n // 2]', 'median = sum(sp) / n')), false);
  assert.equal(codeMatchesGauge(GAUGE_PYTHON_SOURCE + '\nprint(1)'), false);
  assert.equal(codeMatchesGauge(''), false);
  assert.equal(codeMatchesGauge(null), false);
  assert.equal(codeMatchesGauge(undefined), false);
  assert.equal(codeMatchesGauge('def gauge(shelf, offers, under_pct, over_pct):\n    return None'), false);
});
