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
  LONE_CLAIM_CEILING,
  LONE_CLAIM_FLOOR,
  type GaugeOffer,
  type GaugeShelfItem,
  type GaugeUsable,
} from '../src/gauge.ts';
/**
 * IMPORTED IN THE TEST ONLY, NEVER IN THE RUNTIME. `spine.ts` pulls a
 * database-backed module graph behind it that the identify package has no
 * reason to load, so the two numbers are copied there and pinned here. A test
 * can afford the import; a scan cannot.
 */
import {
  LONE_CLAIM_CEILING as SPINE_LONE_CLAIM_CEILING,
  LONE_CLAIM_FLOOR as SPINE_LONE_CLAIM_FLOOR,
} from '../../spine/src/spine.ts';

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

test('one offer is the median, and the line says it is one seller\'s price', () => {
  /**
   * THIS TEST ASSERTED THE OPPOSITE FROM 2026-09-16 TO 2026-09-19 (D-113: one
   * store is not a middle, no line), and BEFORE 2026-09-16 it asserted what it
   * asserts again now. The numbers were run through `GAUGE_PYTHON_SOURCE` in
   * local CPython and match: n 1, median 0.798, percent 25.06265664160402,
   * zone 'over_your_line', shelfPosition 91.77109440267336, the single point
   * at position 50 because the only price IS the median.
   *
   * The owner's ruling, 2026-09-19: "the one price becomes the median". D-113's
   * measured case (one Walmart offer of $9.97 against a hand-priced $1.74,
   * drawn as 83% under the middle of 1 prices) is not denied; the answer to it
   * is the `one_offer` shortfall and a confidence of 'thin', not a withheld
   * line. A test asserting a behaviour is a record of a decision, not evidence
   * the decision was right; this records it changing back.
   */
  const g = usable(computeGauge(shelf(4.99, 500, 'g'), [{ retailer: 'Loblaws', price: 3.99, url: 'u1', sizeValue: 500, sizeUnit: 'g' }]));
  assert.equal(g.n, 1);
  assert.equal(g.median, 0.798);
  assert.equal(g.percent, 25.06265664160402);
  assert.equal(g.zone, 'over_your_line');
  assert.equal(g.shelfPosition, 91.77109440267336);
  assert.equal(g.points.length, 1);
  assert.equal(g.points[0].position, 50, 'the only price is the middle');
  assert.equal(g.confidence, 'thin');
  assert.deepEqual(g.shortfalls, [{ code: 'one_offer', note: 'only one price found, so the middle is that price' }]);
});

test('no offers at all is still no line, and says so', () => {
  const g = computeGauge(shelf(4.99, 500, 'g'), []);
  assert.equal(g.usable, false);
  assert.equal(g.usable === false && g.reason, 'no_offers_on_line');
  assert.equal(g.usable === false && g.unitLabel, '100 g');
});

test('a member price counts in the median and carries the mark, it is not excluded', () => {
  // Measured in local CPython: median 5, the member price at position 100.
  const g = usable(computeGauge(shelf(5, 100, 'g'), [
    offer('A', 4, 100, 'g'),
    { ...offer('Costco', 6, 100, 'g'), memberOnly: true },
    offer('B', 5, 100, 'g'),
  ]));
  assert.equal(g.n, 3);
  assert.equal(g.median, 5);
  assert.deepEqual(g.excluded, [], 'a membership is a mark, not a reason to leave the price out');
  const member = g.points.find((p) => p.retailer === 'Costco');
  assert.deepEqual(member?.marks, ['member_only']);
  assert.equal(member?.position, 100);
  assert.deepEqual(g.points.filter((p) => p.retailer !== 'Costco').map((p) => p.marks), [[], []]);
});

test('a marketplace seller counts in the median and carries the mark, it is not excluded', () => {
  const g = usable(computeGauge(shelf(5, 100, 'g'), [
    offer('A', 4, 100, 'g'),
    { ...offer('Seller', 6, 100, 'g'), marketplace: true },
    offer('B', 5, 100, 'g'),
  ]));
  assert.equal(g.n, 3);
  assert.equal(g.median, 5);
  assert.deepEqual(g.excluded, []);
  assert.deepEqual(g.points.find((p) => p.retailer === 'Seller')?.marks, ['marketplace']);
});

test('an offer that is both members only and a marketplace seller carries both marks, member first', () => {
  const g = usable(computeGauge(shelf(5, 100, 'g'), [
    { ...offer('Both', 5, 100, 'g'), memberOnly: true, marketplace: true },
    offer('A', 5, 100, 'g'),
  ]));
  assert.deepEqual(g.points[0].marks, ['member_only', 'marketplace']);
});

test('a lone member-only offer is a line: the median is that one price, marked, and thin', () => {
  const g = usable(computeGauge(shelf(5, 100, 'g'), [{ ...offer('Costco', 4, 100, 'g'), memberOnly: true }]));
  assert.equal(g.n, 1);
  assert.deepEqual(g.points[0].marks, ['member_only']);
  assert.deepEqual(g.shortfalls.map((x) => x.code), ['one_offer']);
});

test('another currency and a missing size are still left out, and the rest still make the line', () => {
  const g = usable(computeGauge({ ...shelf(5, 100, 'g'), currency: 'CAD' }, [
    offer('A', 5, 100, 'g'),
    { ...offer('US', 3, 100, 'g'), currency: 'USD' },
    offer('NoSize', 4, null, null),
  ]));
  assert.equal(g.n, 1);
  assert.deepEqual(g.excluded.map((e) => [e.retailer, e.code]), [['US', 'not_cad'], ['NoSize', 'no_size']]);
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

test('a price of zero is not a price, so it never reaches the median at all', () => {
  /**
   * THIS TEST ASSERTED SOMETHING ELSE UNTIL 2026-09-16: that a median of zero
   * collapsed every point to the middle rather than dividing by zero and
   * producing an Infinity. That arithmetic is still in `computeGauge` and
   * still correct -- it is simply no longer reachable from an offer, because
   * an offer price now has to be a usable amount before anything is read off
   * it.
   *
   * "A giveaway, or a scraped price of 0" was the old comment, and the second
   * half is the point: a scraped zero is not a giveaway, it is a parse
   * failure wearing a price's clothes. Placing it would put a dot at the far
   * end of the line and drag the median toward it.
   */
  const g = computeGauge(shelf(0, 100, 'g'), [offer('A', 0, 100, 'g'), offer('B', 0, 100, 'g')]);
  assert.equal(g.usable, false);
  assert.equal(g.usable === false && g.reason, 'no_offers_on_line');
  assert.deepEqual(g.excluded.map((e) => e.code), ['unusable_price', 'unusable_price']);
  assert.equal(g.excluded[0].note, 'no usable price given');
});

test('an offer outside the lone-claim band is held off the line, D-113', () => {
  /**
   * THIS TEST ASSERTED THE OPPOSITE UNTIL 2026-09-16, under the name "an
   * outlier balloons the span and compresses everyone else, which is the
   * design". Its numbers were real and are kept here because they state the
   * old behaviour better than a sentence could: with $20 among three sellers
   * near $5 the span stretched to +/-295, points[0] sat at 49.00299102691924
   * instead of 36.66666666666666, the outlier sat at 99.51811232967763, and
   * the zone boundaries squeezed to 48.30508474576271 and 51.69491525423729.
   *
   * The consequence is what changed the decision. A single wrong price does
   * not merely sit at the far end: it drags every honest price onto the
   * midline, so a line of real disagreement is rendered as consensus. $20
   * against a leave-one-out median of $5 is 4.0x, outside the 2.5x ceiling,
   * so it is now held and named rather than placed.
   */
  const near = [offer('A', 4.8, 100, 'g'), offer('B', 5, 100, 'g'), offer('C', 5.2, 100, 'g')];
  const withOutlier = usable(computeGauge(shelf(5, 100, 'g'), [...near, offer('D', 20, 100, 'g')]));
  const without = usable(computeGauge(shelf(5, 100, 'g'), near));

  assert.equal(withOutlier.points.length, 3, 'the outlier is not on the line');
  assert.deepEqual(withOutlier.excluded.map((e) => [e.retailer, e.code]), [['D', 'lone_claim']]);
  assert.equal(withOutlier.median, without.median, 'and it never entered the median');
  assert.equal(withOutlier.points[0].position, without.points[0].position, 'the honest prices are no longer compressed');
  assert.equal(withOutlier.zoneUnderBoundary, without.zoneUnderBoundary);
  assert.equal(withOutlier.confidence, 'thin', 'a held claim is a reason to call the line thin');
  assert.deepEqual(withOutlier.shortfalls.map((x) => x.code), ['claim_held']);
  assert.equal(without.confidence, 'ok');
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
  const g = usable(computeGauge(shelf(4, 100, 'g'), [offer('A', 4, 100, 'g'), offer('B', 4, 100, 'g'), offer('NoSize', 9.99, null, null)]));
  assert.equal(g.n, 2);
  assert.deepEqual(g.excluded, [
    { retailer: 'NoSize', code: 'no_size', note: 'no size given', label: '$9.99', url: null },
  ]);
  assert.deepEqual(g.points.map((p) => p.retailer), ['A', 'B']);
});

test('a volume offer never lands on a mass line', () => {
  const g = usable(computeGauge(shelf(4, 100, 'g'), [offer('A', 4.4, 100, 'g'), offer('B', 4.4, 100, 'g'), offer('Vol', 3, 100, 'mL')]));
  assert.equal(g.n, 2);
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
  const under = usable(computeGauge(shelf(9, 100, 'g'), [offer('A', 10, 100, 'g'), offer('B', 10, 100, 'g')]));
  assert.equal(under.percent, -10);
  assert.equal(under.zone, 'under_your_line');

  const over = usable(computeGauge(shelf(11, 100, 'g'), [offer('A', 10, 100, 'g'), offer('B', 10, 100, 'g')]));
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
  const small = usable(computeGauge(shelf(9, 100, 'g'), [offer('A', 10, 100, 'g'), offer('B', 10, 100, 'g')]));
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
    computeGauge(shelf(9, 100, 'g'), [offer('A', 10, 100, 'g'), offer('B', 10, 100, 'g')]),
    computeGauge(shelf(11, 100, 'g'), [offer('A', 10, 100, 'g'), offer('B', 10, 100, 'g')]),
    computeGauge(shelf(20, 100, 'g'), [offer('A', 10, 100, 'g'), offer('B', 10, 100, 'g')]),
    computeGauge(shelf(4, 100, 'g'), [offer('Vol', 3, 100, 'mL')]),
  ];
  for (const g of cases) assert.doesNotMatch(JSON.stringify(g), banned, `a grading word reached the output: ${JSON.stringify(g)}`);
  assert.deepEqual(
    cases.filter((g) => g.usable).map((g) => (g as GaugeUsable).zone),
    ['under_your_line', 'middle', 'over_your_line'],
  );
});

/* ------------------------------------------------------------------ D-113 */

test('D-113: the measured lone Walmart claim draws a line, marked as one seller\'s price', () => {
  /**
   * WHAT THIS ASSERTS CHANGED ON 2026-09-19 (owner: "the one price becomes the
   * median"). It used to assert that no line is drawn. It now asserts the
   * line is drawn AND that it is marked: confidence 'thin' and the `one_offer`
   * shortfall, so the shopper is told the "middle" is one seller's price. The
   * case below is unchanged from the one that motivated the old rule.
   *
   * THE REGRESSION TEST THE DEFECT NEVER HAD, and every number in it was
   * measured rather than invented. A real grounded search for Kraft Dinner
   * 225 g on 2026-09-16 returned exactly one offer -- Walmart, $9.97, with
   * confident metadata: sizeValue 225 g, packCount 1, dealKind clearance. So
   * it is not a pack-size mix-up that the unit scaling would have caught. The
   * hand-priced truth for that box, read off public Canadian pages on
   * 2026-09-03, is $1.74.
   *
   * What the shopper saw: "225 g x $1.74, your price, 83% under the middle of
   * 1 prices". An ordinary price, presented as far below the going rate,
   * because the median of one offer is that offer.
   *
   * Note `clearance` is deliberately neither divided nor excluded here --
   * whether a clearance price belongs on a line at all is a separate open
   * question. This test asserts only that one offer is a line and is marked.
   */
  const g = usable(computeGauge(shelf(1.74, 225, 'g'), [
    { retailer: 'Walmart', price: 9.97, url: null, sizeValue: 225, sizeUnit: 'g', packCount: 1, dealKind: 'clearance' },
  ]));
  assert.equal(g.n, 1);
  assert.equal(g.confidence, 'thin', 'one seller\'s price is never called a sound middle');
  assert.deepEqual(g.shortfalls.map((x) => x.code), ['one_offer']);
  assert.equal(g.excluded.length, 0, 'the offer is not excluded');
});

test('the lone-claim band has not drifted from the spine engine it was taken from', () => {
  // The numbers live in two packages on purpose. This is what stops them
  // becoming two different numbers without anyone noticing.
  assert.equal(LONE_CLAIM_FLOOR, SPINE_LONE_CLAIM_FLOOR);
  assert.equal(LONE_CLAIM_CEILING, SPINE_LONE_CLAIM_CEILING);
});

test('a held claim is named to the reader rather than silently dropped', () => {
  // Rule 6's shape: the price still reaches the shopper, in the labelled
  // list, with a note saying why it is not on the line.
  const g = usable(computeGauge(shelf(5, 100, 'g'), [
    offer('A', 5, 100, 'g'),
    offer('B', 5.1, 100, 'g'),
    offer('C', 4.9, 100, 'g'),
    offer('Wrong', 40, 100, 'g'),
  ]));
  const held = g.excluded.filter((e) => e.code === 'lone_claim');
  assert.equal(held.length, 1);
  assert.equal(held[0].retailer, 'Wrong');
  assert.equal(held[0].note, 'far from the other prices found');
  assert.equal(held[0].label, '100 g · $40.00', 'the reader can still see what the held price actually was');
});

test('when every price disagrees with every other, none is held and the disagreement is named', () => {
  /**
   * The spine's rule, carried across: the hold can never empty the set
   * (`spine/src/spine.ts:417`). Three prices a factor of ten apart are not
   * one outlier among friends, they are three sources that do not agree, and
   * dropping all three would leave the shopper with nothing at all.
   */
  const g = usable(computeGauge(shelf(5, 100, 'g'), [
    offer('A', 1, 100, 'g'),
    offer('B', 10, 100, 'g'),
    offer('C', 100, 100, 'g'),
  ]));
  assert.equal(g.points.length, 3, 'nothing was dropped');
  assert.equal(g.excluded.length, 0);
  assert.equal(g.confidence, 'thin');
  assert.deepEqual(g.shortfalls.map((x) => x.code), ['spread_unresolved']);
});
