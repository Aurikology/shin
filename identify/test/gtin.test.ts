/**
 * Tests for the check digit, added 2026-09-09 with the photo path.
 *
 * This is the guard on the one shortcut in the whole pipeline: digits read off
 * a photograph are allowed to skip the catalogue text search entirely and be
 * treated as a fact. If this function is wrong in the permissive direction, the
 * app confidently prices whatever product happens to own the misread number,
 * and nothing downstream can notice. So the negative cases matter more here
 * than the positive ones.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gtinFrom, isValidGtin } from '../src/gtin.ts';

test('the four real lengths all check out', () => {
  assert.ok(isValidGtin('96385074'), 'EAN-8');
  assert.ok(isValidGtin('036000291452'), 'UPC-A');
  assert.ok(isValidGtin('4006381333931'), 'EAN-13');
  assert.ok(isValidGtin('00036000291452'), 'GTIN-14');
});

test('a single wrong digit is rejected, which is the whole point of the check', () => {
  assert.equal(isValidGtin('4006381333932'), false, 'wrong check digit');
  assert.equal(isValidGtin('4006381333831'), false, 'a misread digit in the body');
  assert.equal(isValidGtin('036000291453'), false);
});

test('anything that is not a barcode-shaped run of digits is rejected outright', () => {
  for (const bad of ['', '12345', '1234567', '123456789012345', '4006381 33393a', 'null']) {
    assert.equal(isValidGtin(bad), false, `accepted ${JSON.stringify(bad)}`);
  }
});

test('printed separators come off but nothing else is repaired', () => {
  assert.equal(gtinFrom('0 36000 29145 2'), '036000291452', 'spaces under the bars are not data');
  assert.equal(gtinFrom('400638-1333931'), '4006381333931');
  assert.equal(gtinFrom(null), null);
  assert.equal(gtinFrom('4006381333932'), null, 'a failing number is refused, never corrected');
});
