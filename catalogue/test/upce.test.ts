/**
 * The short barcode on small cans and packs. The reader hands over the long
 * UPC-A form and the catalogue keeps the eight digits as printed, so without
 * this a Coke Zero can scanned on 2026-09-14 answered "we have not seen this".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upcAOf, upcEOf } from '../src/search.ts';

test('the Coke Zero can: expanded read compresses to the printed code, and back', () => {
  assert.equal(upcEOf('067000008191'), '06781901');
  assert.equal(upcAOf('06781901'), '067000008191');
});

test('all four suppression patterns survive a round trip', () => {
  for (const upca of ['042100005264', '012300000451', '012340000058', '012345000076']) {
    const e = upcEOf(upca);
    assert.ok(e, `no UPC-E for ${upca}`);
    assert.equal(upcAOf(e), upca);
  }
});

test('a code with no short form has none', () => {
  assert.equal(upcEOf('012345678905'), null);
  assert.equal(upcEOf('0064100144521'), null);
});
