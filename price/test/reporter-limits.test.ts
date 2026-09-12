/**
 * Item 15c of the beta build plan: "A per-device typed-price rate limit, and a
 * reporter reliability score that starts at zero and rises with corroborated
 * reports."
 *
 * The two are tested together because they are the same argument seen twice: a
 * typed price is somebody's word, the store has to be able to say how much of it
 * one phone can put in per day, and it has to be able to say whether anybody has
 * ever agreed with that phone. Neither of them detects a lie. The cap bounds the
 * volume of an attack and the score describes a history; a person filing twenty
 * plausible wrong numbers a day passes both, which is why `spine.ts`'s
 * corroboration rule is the thing that actually decides what reaches a verdict.
 *
 * Every test runs against an in-memory store, never the file the app writes.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  openCorrectionStore,
  recordCorrection,
  reliabilityOf,
  reporterReliability,
  typedPricesLeftToday,
  RELIABILITY_FULL_AT,
  TYPED_PRICES_PER_DEVICE_PER_DAY,
  type CorrectionInput,
} from '../src/corrections.ts';

function correction(over: Partial<CorrectionInput> = {}): CorrectionInput {
  return {
    clientId: `c-${Math.random().toString(36).slice(2)}`,
    deviceId: 'device-a',
    code: '0060383689247',
    productId: null,
    label: 'Kraft Dinner Original 225g',
    category: 'grocery',
    seller: 'Metro',
    priceCents: 249,
    kind: 'regular',
    seenOn: '2026-09-05',
    ...over,
  };
}

/** A distinct shelf per call, so nothing collides with the one-per-shop-per-day index. */
function shelf(n: number, over: Partial<CorrectionInput> = {}): CorrectionInput {
  return correction({ code: String(1_000_000_000_000 + n), label: `Product ${n}`, ...over });
}

beforeEach(() => {
  openCorrectionStore(':memory:');
});

test('a phone may file the whole day the plan asks it to walk', () => {
  // The cap is set from the plan's own seeding target (200 items in one store),
  // so the last price of an honest afternoon has to go in.
  for (let i = 0; i < TYPED_PRICES_PER_DEVICE_PER_DAY; i += 1) {
    const r = recordCorrection(shelf(i));
    assert.equal(r.ok, true, `price ${i + 1} of the day was refused`);
  }
  assert.equal(typedPricesLeftToday('device-a'), 0);
});

test('one more than the day allows is refused, and the sentence says what happened', () => {
  for (let i = 0; i < TYPED_PRICES_PER_DEVICE_PER_DAY; i += 1) recordCorrection(shelf(i));
  const over = recordCorrection(shelf(TYPED_PRICES_PER_DEVICE_PER_DAY));
  assert.equal(over.ok, false);
  if (over.ok) return;
  assert.match(over.why, /already sent/i, over.why);
  assert.match(over.why, /tomorrow/i, 'a refusal with no way out of it is a wall');
  // Hard rule 3: the sentence is about the app and the phone, never about the
  // person holding it.
  assert.doesNotMatch(over.why, /\byou\b|spam|abuse|cheat/i, over.why);
});

test('the cap is on new prices, so another phone is unaffected by the first one filling its day', () => {
  for (let i = 0; i < TYPED_PRICES_PER_DEVICE_PER_DAY; i += 1) recordCorrection(shelf(i));
  const other = recordCorrection(shelf(0, { deviceId: 'device-b' }));
  assert.equal(other.ok, true);
  assert.equal(typedPricesLeftToday('device-b'), TYPED_PRICES_PER_DEVICE_PER_DAY - 1);
});

test('a retry does not spend a second reading out of the day', () => {
  // The queue on the phone re-sends anything it has not seen an acknowledgement
  // for. If a retry counted, a flaky aisle would spend the whole day's cap on
  // one price.
  const input = shelf(1);
  assert.equal(recordCorrection(input).ok, true);
  assert.equal(recordCorrection(input).ok, true);
  assert.equal(typedPricesLeftToday('device-a'), TYPED_PRICES_PER_DEVICE_PER_DAY - 1);
});

test('correcting the same shelf again does not spend a second reading either', () => {
  // A second reading of one tag by one phone on one day replaces the first. It
  // is the same price, read again, not a new one.
  assert.equal(recordCorrection(shelf(1, { priceCents: 249 })).ok, true);
  assert.equal(recordCorrection(shelf(1, { priceCents: 259 })).ok, true);
  assert.equal(typedPricesLeftToday('device-a'), TYPED_PRICES_PER_DEVICE_PER_DAY - 1);
});

test('a phone nobody has ever heard of scores zero', () => {
  const r = reliabilityOf('device-never-seen');
  assert.equal(r.reports, 0);
  assert.equal(r.corroborated, 0);
  assert.equal(r.score, 0);
});

test('a phone that has filed prices nobody else has seen still scores zero', () => {
  // This is the point of "starts at zero". Filing is not evidence about the
  // filer; being agreed with is.
  for (let i = 0; i < 5; i += 1) recordCorrection(shelf(i));
  const r = reliabilityOf('device-a');
  assert.equal(r.reports, 5);
  assert.equal(r.corroborated, 0);
  assert.equal(r.score, 0);
});

test('the score rises when a second phone reads the same tag at the same shop', () => {
  recordCorrection(shelf(1, { deviceId: 'device-a', priceCents: 249 }));
  recordCorrection(shelf(1, { deviceId: 'device-b', priceCents: 255 }));

  const a = reliabilityOf('device-a');
  assert.equal(a.corroborated, 1);
  assert.equal(a.score, 1 / RELIABILITY_FULL_AT);
  // Both sides of an agreement are corroborated by it. The second phone did not
  // confirm the first from a position of authority; they confirmed each other.
  assert.equal(reliabilityOf('device-b').corroborated, 1);
});

test('a second phone at a different shop does not raise it', () => {
  recordCorrection(shelf(1, { deviceId: 'device-a', seller: 'Metro', priceCents: 249 }));
  recordCorrection(shelf(1, { deviceId: 'device-b', seller: 'No Frills', priceCents: 249 }));
  assert.equal(reliabilityOf('device-a').corroborated, 0);
});

test('a genuinely different number at the same shop does not raise it', () => {
  recordCorrection(shelf(1, { deviceId: 'device-a', priceCents: 249 }));
  recordCorrection(shelf(1, { deviceId: 'device-b', priceCents: 900 }));
  assert.equal(reliabilityOf('device-a').corroborated, 0);
});

test('the score reaches one at the stated number of corroborated readings and stops there', () => {
  for (let i = 0; i < RELIABILITY_FULL_AT + 3; i += 1) {
    recordCorrection(shelf(i, { deviceId: 'device-a', priceCents: 249 }));
    recordCorrection(shelf(i, { deviceId: 'device-b', priceCents: 249 }));
  }
  const a = reliabilityOf('device-a');
  assert.equal(a.corroborated, RELIABILITY_FULL_AT + 3);
  assert.equal(a.score, 1, 'the score is a fraction of a full history, never a count');
});

test('the table lists every phone that has filed, and nobody who has not', () => {
  recordCorrection(shelf(1, { deviceId: 'device-a' }));
  recordCorrection(shelf(2, { deviceId: 'device-b' }));
  const ids = reporterReliability().map((r) => r.deviceId);
  assert.deepEqual(ids, ['device-a', 'device-b']);
});
