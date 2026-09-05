/**
 * Tests for the two rules in the meter that a later change would break by
 * making the business look better: charging for a failure, and gating the
 * identity instead of the verdict.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  view, charge, upgradeOffer, gatedParts,
  BASIC_IMAGE_SEARCHES, type MeterState,
} from '../src/meter.ts';

const NOW = new Date('2026-09-04T12:00:00Z');
const empty: MeterState = { plan: 'basic', entries: [] };

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

test('a fresh account is silent, not advertised at', () => {
  const v = view(empty, NOW);
  assert.equal(v.line, null);
  assert.equal(v.remaining, BASIC_IMAGE_SEARCHES);
});

test('only an accepted identification costs a search', () => {
  let s = empty;
  for (const c of ['unreadable', 'not_in_catalogue', 'corrected', 'barcode'] as const) {
    s = charge(s, c, null, NOW);
  }
  assert.equal(view(s, NOW).used, 0, 'a failure was charged for');

  s = charge(s, 'accepted', 'Kraft Smooth 1 kg', NOW);
  assert.equal(view(s, NOW).used, 1);
});

test('a barcode is never metered however many are scanned', () => {
  let s = empty;
  for (let i = 0; i < 50; i += 1) s = charge(s, 'barcode', 'x', NOW);
  assert.equal(view(s, NOW).remaining, BASIC_IMAGE_SEARCHES);
});

test('the window rolls, it does not reset on a day of the week', () => {
  const s: MeterState = {
    plan: 'basic',
    entries: [
      { at: daysAgo(8), charge: 'accepted', label: 'old' },
      { at: daysAgo(6), charge: 'accepted', label: 'inside' },
    ],
  };
  assert.equal(view(s, NOW).used, 1);
});

test('at the limit the identity stays free and only the verdict is gated', () => {
  let s = empty;
  for (let i = 0; i < BASIC_IMAGE_SEARCHES; i += 1) s = charge(s, 'accepted', 'x', NOW);
  const v = view(s, NOW);
  assert.equal(v.remaining, 0);
  assert.equal(v.verdictAvailable, false);

  const gated = gatedParts(v);
  assert.equal(gated.identity, false, 'identity must never be gated');
  assert.equal(gated.alternatives, false, 'alternatives must never be gated');
  assert.equal(gated.verdict, true);
});

test('the upgrade is offered on a result and nowhere else', () => {
  let s = empty;
  for (let i = 0; i < BASIC_IMAGE_SEARCHES; i += 1) s = charge(s, 'accepted', 'x', NOW);
  const v = view(s, NOW);
  // Decision 46: nothing to offer before there is a result to attach it to.
  assert.equal(upgradeOffer(v, false), null);
  assert.ok(upgradeOffer(v, true));
});

test('nothing is offered while there are searches left', () => {
  const s = charge(empty, 'accepted', 'x', NOW);
  assert.equal(upgradeOffer(view(s, NOW), true), null);
});

test('pro is not metered and is never shown a count', () => {
  let s: MeterState = { plan: 'pro', entries: [] };
  for (let i = 0; i < 20; i += 1) s = charge(s, 'accepted', 'x', NOW);
  const v = view(s, NOW);
  assert.equal(v.verdictAvailable, true);
  assert.equal(v.line, null);
  assert.equal(upgradeOffer(v, true), null);
});

test('when empty, the user is told when the next one arrives', () => {
  let s = empty;
  for (let i = 0; i < BASIC_IMAGE_SEARCHES; i += 1) {
    s = charge(s, 'accepted', 'x', new Date(NOW.getTime() - (i + 1) * 86_400_000));
  }
  const v = view(s, NOW);
  assert.equal(v.remaining, 0);
  assert.ok(v.nextFreeAt, 'no date for the next free search');
  // The oldest counted search was three days ago, so it falls out in four.
  const days = (Date.parse(v.nextFreeAt!) - NOW.getTime()) / 86_400_000;
  assert.ok(days > 3.9 && days < 4.1, `expected about four days, got ${days}`);
});

test('the count reads as a plain sentence, singular and plural', () => {
  let s = charge(empty, 'accepted', 'x', NOW);
  assert.match(view(s, NOW).line ?? '', /2 photo searches left/);
  s = charge(s, 'accepted', 'x', NOW);
  assert.match(view(s, NOW).line ?? '', /1 photo search left/);
});

test('the ledger says what the searches were spent on', () => {
  const s = charge(empty, 'accepted', 'Kraft Smooth 1 kg', NOW);
  assert.equal(s.entries[0].label, 'Kraft Smooth 1 kg');
  assert.equal(s.entries[0].charge, 'accepted');
});
