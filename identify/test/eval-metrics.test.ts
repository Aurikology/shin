/**
 * The stage split, tested with hand-built rows.
 *
 * These fixtures are the five shapes the split exists to tell apart, and the
 * reason they are hand-built rather than captured from a run is that a captured
 * run only ever contains the shapes that happened to occur -- today, in dry run,
 * that is one shape (everything correct). A metric that cannot distinguish
 * `cascade_miss` from `pick_wrong` would pass a test built out of a green run
 * and still be useless, which is the failure this whole lane is about.
 *
 * Every denominator is asserted explicitly, because the dishonest version of
 * each of these numbers is the one with the wrong denominator: pick precision
 * over all rows instead of over rows where the pick actually fired, or cascade
 * recall counting barcode short-circuits as retrieval wins.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attribute,
  rankOf,
  summarise,
  summariseByKind,
  wilson,
  type StageObservation,
} from '../eval/metrics.ts';

function obs(over: Partial<StageObservation> & { code: string }): StageObservation {
  return {
    kind: 'plain',
    outcome: 'identified',
    chosenCode: null,
    barcodeShortCircuit: false,
    cascadeRan: true,
    cascadeCodes: [],
    pickFired: false,
    pickErrored: false,
    pickedCode: null,
    ...over,
  };
}

// The five shapes, named once and reused, so a change to one fixture changes
// every assertion that depends on it rather than half of them.

/** Correct row absent from the candidate set: retrieval never offered it. */
const CASCADE_MISS = obs({
  code: 'A',
  cascadeCodes: ['X', 'Y', 'Z'],
  pickFired: true,
  pickedCode: 'X',
  chosenCode: 'X',
});

/** Present at rank 2 and the pick chose it. */
const PICKED_RIGHT = obs({
  code: 'B',
  cascadeCodes: ['X', 'B', 'Z'],
  pickFired: true,
  pickedCode: 'B',
  chosenCode: 'B',
});

/** Present at rank 1 and the pick chose another row. */
const MIS_PICKED = obs({
  code: 'C',
  cascadeCodes: ['C', 'X'],
  pickFired: true,
  pickedCode: 'X',
  chosenCode: 'X',
});

/** Present and the pick abstained; pass one's wrong top row shipped. */
const PICK_ABSTAINED = obs({
  code: 'D',
  cascadeCodes: ['X', 'D'],
  pickFired: true,
  pickedCode: null,
  chosenCode: 'X',
});

/** A barcode validated and resolved, so the cascade never ran at all. */
const SHORT_CIRCUIT = obs({
  code: 'E',
  barcodeShortCircuit: true,
  cascadeRan: false,
  cascadeCodes: [],
  chosenCode: 'E',
});

const FIVE = [CASCADE_MISS, PICKED_RIGHT, MIS_PICKED, PICK_ABSTAINED, SHORT_CIRCUIT];

test('rankOf is 1-based and null for absent, because rank 0 would invert MRR', () => {
  assert.equal(rankOf(['A', 'B'], 'A'), 1);
  assert.equal(rankOf(['A', 'B'], 'B'), 2);
  assert.equal(rankOf(['A', 'B'], 'C'), null);
});

test('the five shapes each get their own attribution', () => {
  assert.equal(attribute(CASCADE_MISS), 'cascade_miss');
  assert.equal(attribute(PICKED_RIGHT), 'correct');
  assert.equal(attribute(MIS_PICKED), 'pick_wrong');
  assert.equal(attribute(PICK_ABSTAINED), 'pick_null');
  assert.equal(attribute(SHORT_CIRCUIT), 'correct');
});

test('settled_wrong is not pick_wrong: the pick never got a chance', () => {
  // Pass one settled (or there was only one candidate), so no second call was
  // made. Blaming the pick model for this row would send work to the prompt
  // when the fix is in the settle test.
  const settled = obs({ code: 'F', cascadeCodes: ['X', 'F'], pickFired: false, chosenCode: 'X' });
  assert.equal(attribute(settled), 'settled_wrong');
});

test('an unreadable row is its own class and never a retrieval failure', () => {
  const bad = obs({ code: 'G', outcome: 'unreadable', cascadeRan: false, chosenCode: null });
  assert.equal(attribute(bad), 'unreadable');
});

test('a pick that threw is not a pick that chose badly', () => {
  const threw = obs({
    code: 'H',
    cascadeCodes: ['X', 'H'],
    pickFired: true,
    pickErrored: true,
    chosenCode: 'X',
  });
  assert.equal(attribute(threw), 'pick_error');
  // And it is not in the precision denominator: it never returned an answer.
  assert.equal(summarise([threw]).pick.denominator, 0);
});

test('a right pick that still shipped another row blames neither stage falsely', () => {
  // Decision 19's size-question branch ships options[0], which can differ from
  // the index the pick named.
  const overridden = obs({
    code: 'I',
    cascadeCodes: ['I', 'X'],
    pickFired: true,
    pickedCode: 'I',
    chosenCode: 'X',
  });
  assert.equal(attribute(overridden), 'size_question_override');
  // The pick was right, so it counts as a pick success.
  const m = summarise([overridden]);
  assert.equal(m.pick.correct, 1);
  assert.equal(m.top1, 0);
});

test('the barcode short-circuit is excluded from cascade and pick denominators', () => {
  const m = summarise(FIVE);
  assert.equal(m.scored, 5);
  assert.equal(m.barcodeShortCircuit, 1);
  // Four rows ran the cascade; the short-circuited one did not.
  assert.equal(m.cascade.denominator, 4);
  // Three of those four had the right row present AND fired a returning pick.
  assert.equal(m.pick.denominator, 3);
  // Two rows shipped the right code: the one the pick got right, and the
  // barcode row -- which is a retrieval win for neither stage below.
  assert.equal(m.top1, 2);
});

test('cascade recall counts position, not presence alone', () => {
  const m = summarise(FIVE);
  // Present at rank 1: MIS_PICKED only.
  assert.equal(m.cascade.recall1, 1);
  // Plus PICKED_RIGHT (rank 2) and PICK_ABSTAINED (rank 2).
  assert.equal(m.cascade.recall3, 3);
  assert.equal(m.cascade.recall10, 3);
});

test('MRR is the mean reciprocal rank, absent rows contributing zero', () => {
  const m = summarise(FIVE);
  // ranks over the 4 cascade rows: absent, 2, 1, 2  ->  (0 + .5 + 1 + .5) / 4
  assert.ok(Math.abs(m.cascade.mrr - 0.5) < 1e-12);
});

test('pick precision is correct-over-fired, and is null rather than 0/0', () => {
  const m = summarise(FIVE);
  assert.equal(m.pick.correct, 1);
  assert.equal(m.pick.denominator, 3);
  assert.ok(Math.abs((m.pick.precision as number) - 1 / 3) < 1e-12);
  assert.equal(summarise([SHORT_CIRCUIT]).pick.precision, null);
});

test('the attribution histogram sums to the row count', () => {
  const m = summarise(FIVE);
  const total = Object.values(m.attribution).reduce((a, b) => a + b, 0);
  assert.equal(total, 5);
  assert.equal(m.attribution.cascade_miss, 1);
  assert.equal(m.attribution.pick_wrong, 1);
  assert.equal(m.attribution.pick_null, 1);
  assert.equal(m.attribution.correct, 2);
});

test('Wilson on 36/40 is the roughly 77-97% the small sample actually supports', () => {
  const i = wilson(36, 40);
  assert.ok(i.low > 0.76 && i.low < 0.78, `low was ${i.low}`);
  assert.ok(i.high > 0.96 && i.high < 0.97, `high was ${i.high}`);
  // And the point estimate sits inside it, which the normal approximation
  // cannot promise at the edges.
  assert.ok(i.low < 0.9 && i.high > 0.9);
});

test('Wilson clamps to [0,1] at the edges and is total at n=0', () => {
  const perfect = wilson(40, 40);
  assert.equal(perfect.high, 1);
  assert.ok(perfect.low > 0.9 && perfect.low < 1, `low was ${perfect.low}`);
  const none = wilson(0, 40);
  assert.equal(none.low, 0);
  assert.ok(none.high > 0 && none.high < 0.1);
  assert.deepEqual(wilson(0, 0), { low: 0, high: 1 });
});

test('slicing by kind keeps each bucket its own denominator', () => {
  const rows = [
    { ...CASCADE_MISS, kind: 'store-brand' },
    { ...MIS_PICKED, kind: 'size-pair' },
    { ...PICKED_RIGHT, kind: 'size-pair' },
  ];
  const byKind = summariseByKind(rows);
  assert.equal(byKind.get('store-brand')?.scored, 1);
  assert.equal(byKind.get('store-brand')?.cascade.recall10, 0);
  assert.equal(byKind.get('size-pair')?.scored, 2);
  assert.equal(byKind.get('size-pair')?.top1, 1);
  assert.equal(byKind.get('size-pair')?.pick.denominator, 2);
  assert.equal(byKind.get('size-pair')?.pick.correct, 1);
});

test('a row scoring top-1 is never also counted as a failure', () => {
  const m = summarise(FIVE);
  const failures = Object.entries(m.attribution)
    .filter(([k]) => k !== 'correct')
    .reduce((a, [, v]) => a + v, 0);
  assert.equal(m.top1 + failures, m.scored);
});
