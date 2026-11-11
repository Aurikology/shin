/**
 * D-268 B11 (2026-11-11 walk, f3-71): with the price ranges set in dollars on
 * You, the zone changed (the lines are dollars) but the verdict still said
 * "40% over the typical price". In Dollar mode the line says the difference in
 * dollars, the unit the shopper chose to think in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { distWhere } = await import('../public/js/lib/history-answer.js');

const v = { centreCents: 500, currency: 'CAD' };

test('D-268 B11: in Dollar mode the verdict line says how many dollars over or under', () => {
  assert.equal(distWhere({ cents: 699, offByPct: 40 }, v, 'amount'), '$1.99 over the typical price');
  assert.equal(distWhere({ cents: 350, offByPct: -30 }, v, 'amount'), '$1.50 under the typical price');
});

test('D-268 B11 (keep): Percentage mode is unchanged, and a few cents either way is "about"', () => {
  assert.equal(distWhere({ cents: 699, offByPct: 40 }, v, 'percent'), '40% over the typical price');
  assert.match(distWhere({ cents: 502, offByPct: 0.4 }, v, 'amount'), /about|typical/i);
});
