/**
 * Produce sold by weight on the answer sheet (comms 2026-11-14, "Amount for things sold by weight"):
 * "$1.58 per lb" stays the verdict; beside it the shopper sets how much they will buy (lb, with a
 * kg switch) and reads the total for that amount. The price per pound is never changed by the unit shown.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { distributionSheet, verdictWith, dot, plain } from './ux/ux-b6-support.mjs';
import { totalCents, stepAmount, switchUnit, cleanAmount, amountInLb, soldByWeight, LB_PER_KG } from '../public/js/lib/weight-amount.js';

const BANANAS = verdictWith({
  centreCents: 88,
  sigmaLog: 0.2,
  p10Cents: 69,
  p90Cents: 112,
  confidence: 'medium',
  n: 4,
  dots: [dot(79, 'Walmart', '1 lb'), dot(88, 'Loblaws', '1 lb')],
  shopperCents: 158,
});
const sheet = (o = {}) => distributionSheet(BANANAS, { name: 'Bananas', sold: 'lb', ...o });
const peekOf = (html) => html.slice(html.indexOf('<div class="sheet-peek">'), html.indexOf('<div class="sheet-half">'));
const total = (html) => plain(html.match(/data-amount-total[^>]*>([\s\S]*?)<\/b>/)[1]);
const inFrench = (fn) => {
  const store = globalThis.localStorage;
  store.setItem('shin.locale', 'fr');
  try {
    return fn();
  } finally {
    store.removeItem('shin.locale');
  }
};

test('the amount maths: pounds, kilograms, cents', () => {
  assert.equal(soldByWeight('lb'), true);
  assert.equal(soldByWeight('each'), false);
  assert.equal(soldByWeight(undefined), false);
  assert.equal(totalCents(158, { qty: 1, unit: 'lb' }), 158);
  assert.equal(totalCents(158, { qty: 2.5, unit: 'lb' }), 395);
  assert.equal(totalCents(158, { qty: 1, unit: 'kg' }), Math.round(158 * LB_PER_KG));
  assert.equal(totalCents(null, { qty: 1, unit: 'lb' }), null);
  assert.equal(totalCents(0, { qty: 1, unit: 'lb' }), null);
  assert.ok(Math.abs(amountInLb({ qty: 1, unit: 'kg' }) - 2.2046) < 0.001);
});

test('the amount stepper moves a quarter at a time and stops at the ends', () => {
  assert.deepEqual(stepAmount({ qty: 1, unit: 'lb' }, 1), { qty: 1.25, unit: 'lb' });
  assert.deepEqual(stepAmount({ qty: 1, unit: 'lb' }, -1), { qty: 0.75, unit: 'lb' });
  assert.deepEqual(stepAmount({ qty: 0.25, unit: 'lb' }, -1), { qty: 0.25, unit: 'lb' });
  assert.deepEqual(stepAmount({ qty: 25, unit: 'kg' }, 1), { qty: 25, unit: 'kg' });
});

test('switching the unit keeps the same weight, so the total does not move', () => {
  const kg = switchUnit({ qty: 2, unit: 'lb' }, 'kg');
  assert.equal(kg.unit, 'kg');
  assert.equal(kg.qty, 0.91);
  const back = switchUnit(kg, 'lb');
  assert.equal(back.unit, 'lb');
  assert.ok(Math.abs(back.qty - 2) < 0.02);
  assert.deepEqual(cleanAmount({ qty: -3, unit: 'stone' }), { qty: 1, unit: 'lb' });
});

test('a by-weight answer carries the amount between the name and the chart, with its two controls and the total', () => {
  const peek = peekOf(sheet());
  const at = (n) => {
    const i = peek.indexOf(n);
    assert.ok(i >= 0, `missing ${n}`);
    return i;
  };
  const order = ['data-dist-name', 'data-vd-amount', 'data-dist-chart', 'data-act="dist-save"'].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), `peek order ${order}`);
  assert.match(peek, /data-act="amount-step"[^>]*data-dir="-1"/);
  assert.match(peek, /data-act="amount-step"[^>]*data-dir="1"/);
  assert.match(peek, /data-act="amount-unit"[^>]*data-unit="lb"/);
  assert.match(peek, /data-act="amount-unit"[^>]*data-unit="kg"/);
  assert.equal(total(sheet()), '$1.58', 'one pound at $1.58 a pound');
});

test('the verdict stays per pound: the price says per lb and the total follows the amount', () => {
  const html = sheet({ amount: { qty: 2.5, unit: 'lb' } });
  assert.match(plain(peekOf(html).match(/class="vd-ask"[\s\S]*?<\/p>/)[0]), /\$1\.58\s*On the tag, per lb/);
  assert.equal(total(html), '$3.95');
  assert.match(peekOf(html), /data-amount-qty[^>]*>2\.5\s*lb</);
  assert.match(html, /data-zone="bad"/, 'the zone is judged on the per pound price, not the total');
});

test('the kg switch shows kilograms, marks itself on, and the price per lb is unchanged', () => {
  const html = sheet({ amount: { qty: 1, unit: 'kg' } });
  assert.equal(total(html), '$3.48');
  assert.match(peekOf(html), /data-amount-qty[^>]*>1\s*kg</);
  assert.match(peekOf(html), /data-act="amount-unit"[^>]*data-unit="kg"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-act="amount-unit"[^>]*data-unit="kg"/);
  assert.match(plain(peekOf(html).match(/class="vd-ask"[\s\S]*?<\/p>/)[0]), /\$1\.58/);
});

test('without a by-weight unit there is no amount block', () => {
  assert.doesNotMatch(distributionSheet(BANANAS, { name: 'Nutella' }), /data-vd-amount/);
  assert.doesNotMatch(distributionSheet(BANANAS, { name: 'Nutella', sold: 'each' }), /data-vd-amount/);
  assert.doesNotMatch(plain(distributionSheet(BANANAS, { name: 'Nutella' })), /per lb/);
});

test('with no price on the tag yet there is nothing to total, so no amount block', () => {
  const html = distributionSheet(verdictWith({ centreCents: 88, sigmaLog: 0.2, p10Cents: 69, p90Cents: 112, shopper: null }), { name: 'Bananas', sold: 'lb' });
  assert.doesNotMatch(html, /data-vd-amount/);
});

test('French: per pound is "la livre", the amount uses a decimal comma', () => {
  const html = inFrench(() => sheet({ amount: { qty: 1.5, unit: 'lb' } }));
  assert.match(plain(peekOf(html).match(/class="vd-ask"[\s\S]*?<\/p>/)[0]), /Sur l’étiquette, la livre/);
  assert.match(peekOf(html), /data-amount-qty[^>]*>1,5\s*lb</);
  assert.match(total(html), /^2,37\s\$$/);
});

test('the controls are real, named buttons at least 44 px (the sheet css sizes them)', () => {
  const peek = peekOf(sheet());
  for (const m of peek.matchAll(/<button[^>]*data-act="amount-(?:step|unit)"[^>]*>/g)) {
    assert.match(m[0], /aria-label="[^"]+"|role="radio"/, m[0]);
  }
  assert.match(peek, /role="radiogroup"/);
});
