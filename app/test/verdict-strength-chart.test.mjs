/**
 * D-270 A8 (bug sweep 2026-11-11, family 5; review 2026-11-21 old-lists 2): "Nx the typical price" beside a
 * pinned shelf price reads as a measured multiple. On an estimate (Claude's range, a prior, a size assumed:
 * confidence low) or a bell wider than 2.25x (p90/p10) it is not measured, so the chart prints the price
 * alone. A measured bell keeps the multiple. Red on the code before the fix.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const cell = new Map();
globalThis.localStorage = {
  getItem: (k) => (cell.has(k) ? cell.get(k) : null),
  setItem: (k, v) => cell.set(k, String(v)),
  removeItem: (k) => cell.delete(k),
};
const { usableVerdict, bellSvg } = await import('../public/js/lib/verdict-chart.js');
const F = await import('./verdict-fixtures.mjs');

const fmt = (c) => `$${(c / 100).toFixed(2)}`;
const MULTIPLE = '3x the typical price';

test('A8: a pinned price on an AI estimate prints no "Nx the typical price"', () => {
  const v = usableVerdict({ ...F.LOW_CONFIDENCE, shopper: { ...F.LOW_CONFIDENCE.shopper, cents: 9999, zone: 'bad', beyond: 'high' } });
  const svg =bellSvg(v, { format: fmt, multiple: MULTIPLE });
  assert.ok(!svg.includes(MULTIPLE), 'the multiple is printed beside an estimate');
  assert.ok(svg.includes(fmt(9999)), 'the price itself is still drawn');
});

test('A8: a pinned price on a bell wider than 2.25x prints no multiple, even at medium confidence', () => {
  const wide = { ...F.BEYOND_HIGH, confidence: 'medium', sigmaLog: 0.4, p10Cents: Math.round(599 * Math.exp(-1.2816 * 0.4)), p90Cents: Math.round(599 * Math.exp(1.2816 * 0.4)) };
  const v = usableVerdict(wide);
  assert.ok(v.p90Cents / v.p10Cents > 2.25);
  assert.ok(!bellSvg(v, { format: fmt, multiple: MULTIPLE }).includes(MULTIPLE));
});

test('A8: control, a measured bell keeps the multiple', () => {
  const v = usableVerdict(F.BEYOND_HIGH);
  assert.ok(bellSvg(v, { format: fmt, multiple: MULTIPLE }).includes(MULTIPLE));
});
