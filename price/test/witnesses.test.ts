/**
 * Who counts as a second witness, which is the half of D-022 the unique index
 * cannot do.
 *
 * The index upstream is one person, one shop, one day, one price, and it stops
 * somebody manufacturing agreement with themselves inside a single day. It says
 * nothing about the same phone coming back tomorrow, and nothing about whether
 * two rows are describing the same tag or two different ones. Both of those
 * decide whether the spine treats a number as a claim or as a reading, and the
 * spine holds a lone claim that disagrees with everything else.
 *
 * This file exists because of a negative test that failed to fail. Deleting the
 * device check inside `witnessesFor` broke nothing in either suite, which meant
 * the rule that decides who is a witness had no test at all. That is the exact
 * shape `DEFECTS.md` standard 3 is about.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  correctionsFor,
  openCorrectionStore,
  recordCorrection,
  witnessesFor,
  CORROBORATION_TOLERANCE,
  type CorrectionInput,
} from '../src/corrections.ts';

function fresh() {
  return openCorrectionStore(':memory:');
}

const CODE = '0060383689247';

function input(over: Partial<CorrectionInput> = {}): CorrectionInput {
  return {
    clientId: `c-${Math.random().toString(36).slice(2)}`,
    deviceId: 'device-a',
    code: CODE,
    productId: 'observed:0060383689247',
    label: 'Kraft Dinner 225g',
    category: 'grocery',
    seller: 'Metro',
    priceCents: 400,
    kind: 'regular',
    seenOn: '2026-09-05',
    ...over,
  };
}

function counts() {
  const rows = correctionsFor({ code: CODE });
  const w = witnessesFor(rows);
  return rows.map((r) => ({ device: r.device_id, seller: r.seller, cents: r.price_cents, witnesses: w.get(r.id) }));
}

test('one person on one shelf is one witness', () => {
  fresh();
  recordCorrection(input());
  assert.deepEqual(counts().map((c) => c.witnesses), [1]);
});

test('the same phone on a second day is still one witness', () => {
  fresh();
  recordCorrection(input({ seenOn: '2026-09-05' }));
  recordCorrection(input({ seenOn: '2026-09-06' }));
  // The unique index allows both rows: different days. Neither corroborates the
  // other, because corroboration is about independent people and this is one
  // person twice. This is the assertion that had no test.
  assert.deepEqual(counts().map((c) => c.witnesses), [1, 1]);
});

test('a second phone at the same shop and the same price is a second witness', () => {
  fresh();
  recordCorrection(input({ deviceId: 'device-a' }));
  recordCorrection(input({ deviceId: 'device-b' }));
  assert.deepEqual(counts().map((c) => c.witnesses), [2, 2]);
});

test('a second phone at a different shop does not corroborate', () => {
  fresh();
  recordCorrection(input({ deviceId: 'device-a', seller: 'Metro' }));
  recordCorrection(input({ deviceId: 'device-b', seller: 'No Frills' }));
  // Two shops is two facts, not one confirmed fact. Prices differ between
  // shops, which is the entire premise of the product.
  assert.deepEqual(counts().map((c) => c.witnesses), [1, 1]);
});

test('a price close enough to be the same tag still corroborates', () => {
  fresh();
  const near = Math.round(400 * (1 + CORROBORATION_TOLERANCE * 0.6));
  recordCorrection(input({ deviceId: 'device-a', priceCents: 400 }));
  recordCorrection(input({ deviceId: 'device-b', priceCents: near }));
  assert.deepEqual(counts().map((c) => c.witnesses), [2, 2]);
});

test('a genuinely different number does not vouch for the first', () => {
  fresh();
  recordCorrection(input({ deviceId: 'device-a', priceCents: 400 }));
  recordCorrection(input({ deviceId: 'device-b', priceCents: 1200 }));
  assert.deepEqual(counts().map((c) => c.witnesses), [1, 1]);
});

test('three phones on one shelf count three, not two', () => {
  fresh();
  for (const d of ['device-a', 'device-b', 'device-c']) recordCorrection(input({ deviceId: d }));
  assert.deepEqual(counts().map((c) => c.witnesses), [3, 3, 3]);
});

test('the same phone twice plus one other is two witnesses, not three', () => {
  fresh();
  recordCorrection(input({ deviceId: 'device-a', seenOn: '2026-09-05' }));
  recordCorrection(input({ deviceId: 'device-a', seenOn: '2026-09-06' }));
  recordCorrection(input({ deviceId: 'device-b', seenOn: '2026-09-06' }));
  // Distinct devices, counted as a set. Two people saw this shelf.
  assert.deepEqual(new Set(counts().map((c) => c.witnesses)), new Set([2]));
});
