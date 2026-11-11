/**
 * D-268 B16/B17 and the screen half of D-261 (2026-11-11 walk): names, brands
 * and category lines reached the shopper in shop-feed capitals: "OREO" under a
 * candidate, "FILLED BISCUITS" on some rows of "Not this one?", and 37 of 40
 * sampled names like "PINOT GRIS - VILLA MARIA PRIVATE BIN MARLBOROUGH". The
 * data fix is Jamin's; the screen prints a string that is shouted end to end in
 * title case, keeping short codes (PC, KD, BBQ, 2L) as they are. A name with
 * any lower-case letter is the brand's own casing and comes back unchanged.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cleanName } from '../public/js/lib/product-name.js';

test('D-268 B16/B17: a name shouted end to end reads in title case', () => {
  assert.equal(cleanName('OREO'), 'Oreo');
  assert.equal(cleanName('FILLED BISCUITS'), 'Filled Biscuits');
  assert.equal(cleanName('PINOT GRIS - VILLA MARIA PRIVATE BIN MARLBOROUGH'), 'Pinot Gris - Villa Maria Private Bin Marlborough');
});

test('D-268 B16/B17 (keep): short codes and sizes stay as written', () => {
  assert.equal(cleanName('PC BLUE MENU PASTA 900G'), 'PC Blue Menu Pasta 900G');
  assert.equal(cleanName('KD ORIGINAL'), 'KD Original');
  assert.equal(cleanName('BBQ CHIPS'), 'BBQ Chips');
});

test('D-268 B16/B17 (keep): any lower-case letter means the casing is deliberate', () => {
  assert.equal(cleanName('The Original Oreo'), 'The Original Oreo');
  assert.equal(cleanName('iPhone CASE'), 'iPhone CASE');
  assert.equal(cleanName('RITZ'), 'Ritz');
  assert.equal(cleanName('7UP'), '7UP');
});
