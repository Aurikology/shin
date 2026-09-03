import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageDays, cad, dollarsToCents, median, percentile, ratio, relation } from '../src/money.ts';

test('cad formats cents without float drift', () => {
  assert.equal(cad(147), '$1.47');
  assert.equal(cad(55), '$0.55');
  assert.equal(cad(0), '$0.00');
  assert.equal(cad(42999), '$429.99');
  assert.equal(cad(100), '$1.00');
  assert.equal(cad(-250), '-$2.50');
});

test('dollarsToCents survives the classic 1.15 case', () => {
  assert.equal(dollarsToCents(1.15), 115);
  assert.equal(dollarsToCents(2.0), 200);
  assert.equal(dollarsToCents(429.99), 42999);
});

test('median takes the mean of the middle two on even lengths', () => {
  assert.equal(median([5]), 5);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([6000, 12000, 3500, 15900]), 9000);
});

test('percentile returns a price someone actually charged', () => {
  const vals = [3500, 6000, 12000, 15900];
  assert.equal(percentile(vals, 25), 3500);
  assert.equal(percentile(vals, 50), 6000);
  assert.equal(percentile(vals, 100), 15900);
  // Nearest-rank, never interpolated: every output is a member of the input.
  for (const p of [1, 10, 25, 50, 75, 99, 100]) {
    assert.ok(vals.includes(percentile(vals, p)), `p${p} was interpolated`);
  }
});

test('ageDays floors and never goes negative', () => {
  assert.equal(ageDays('2026-09-01', '2026-09-03'), 2);
  assert.equal(ageDays('2026-09-03', '2026-09-03'), 0);
  assert.equal(ageDays('2026-09-05', '2026-09-03'), 0);
});

test('empty sets throw rather than returning a plausible zero', () => {
  assert.throws(() => median([]));
  assert.throws(() => percentile([], 50));
});

test('relation and ratio', () => {
  assert.equal(relation(100, 200), 'under');
  assert.equal(relation(200, 200), 'level');
  assert.equal(relation(300, 200), 'over');
  assert.equal(ratio(200, 55), 3.64);
  assert.equal(ratio(147, 55), 2.67);
});
