/**
 * D-268 E23 (2026-11-11 walk, f3-05/f3-07): "% off" has max=95 yet 96 was
 * accepted ("$0.24 AFTER 96% OFF"); 150, 100, 0 and -5 showed no line but
 * "Price it" stayed on and sent the sticker price as if no discount were lit.
 * "N for $" has min=2 max=20 yet 21 and 4.5 priced, and 0 or 1 sent the
 * sticker price. A modifier that is on but out of range now prices nothing:
 * the confirm key is off and the line under the pad says what to type.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { pricePadSheet } = await import('../public/js/screens/camera.js');

const item = { id: 'x', text: 'Oreo 303 g', category: 'grocery' };
const line = (html) => html.match(/data-pad-effective[^>]*>([^<]*)</)?.[1] ?? '';
const confirmOff = (html) => /class="btn btn--key key-confirm"[^>]*\sdisabled/.test(html);

test('D-268 E23: an out-of-range % off turns the confirm key off and says the range', () => {
  for (const pct of [96, 100, 150, 0, -5, 12.5, NaN]) {
    const html = pricePadSheet(item, '6.00', { kind: 'percent', pct });
    assert.ok(confirmOff(html), `${pct}% off still lets "Price it" send a price`);
    assert.match(line(html), /1 to 95/, `${pct}%: the line under the pad reads "${line(html)}"`);
  }
});

test('D-268 E23: an out-of-range "N for $" turns the confirm key off and says the range', () => {
  for (const n of [21, 4.5, 1, 0, NaN]) {
    const html = pricePadSheet(item, '6.00', { kind: 'nfor', n });
    assert.ok(confirmOff(html), `${n} for $6 still lets "Price it" send a price`);
    assert.match(line(html), /2 to 20/, `${n} for: the line reads "${line(html)}"`);
  }
});

test('D-268 E23 (keep): an in-range modifier still prices, edges included', () => {
  for (const pct of [1, 20, 95]) assert.ok(!confirmOff(pricePadSheet(item, '6.00', { kind: 'percent', pct })), `${pct}%`);
  for (const n of [2, 3, 20]) assert.ok(!confirmOff(pricePadSheet(item, '6.00', { kind: 'nfor', n })), `${n} for`);
  assert.match(line(pricePadSheet(item, '6.00', { kind: 'percent', pct: 20 })), /after 20% off/);
});
