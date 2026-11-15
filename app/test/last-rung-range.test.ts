/**
 * RULINGS "A price range is never wider than one product's prices across shops": the last-rung range that
 * answers a product with no price at all (the fixed bell) is held to MAX_SIGMA like the verdict's bell.
 * Live 2026-11-15, 3110 Cara Cara: range $2.78 to $36.02, which tells the shopper nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastRungRange } from '../src/catalogue-first.ts';
import { MAX_SIGMA, Z10 } from '../../price/src/estimate.ts';

test('the fixed bell with nothing known is no wider than one product across shops', () => {
  const { range, source } = lastRungRange(null, 'CAD');
  assert.equal(source, 'fixed_prior');
  assert.equal(range.basis, 'fixed_prior');
  const widest = Math.exp(2 * Z10 * MAX_SIGMA);
  assert.ok(range.highCents / range.lowCents <= widest * 1.01, `${range.lowCents} to ${range.highCents}`);
  assert.ok(range.lowCents > 0 && range.lowCents < range.highCents);
});
