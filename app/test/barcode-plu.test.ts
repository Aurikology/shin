/**
 * Loose produce: a PLU read, typed or padded as a GTIN comes out of `canonicalBarcode` as ONE key
 * with `how: 'plu'`, and real short codes (EAN-8, UPC-E) are not stolen (price/src/plu.ts says how).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalBarcode, canonicalGtin } from '../src/barcode.ts';

test('a bare 4-digit PLU is the produce key', () => {
  const c = canonicalBarcode('3110');
  assert.equal(c?.how, 'plu');
  assert.equal(c?.gtin, '000000031103');
  assert.equal(c?.plu?.code, '3110');
  assert.equal(c?.plu?.organic, false);
  assert.match(c!.plu!.name, /Cara Cara/);
  assert.equal(canonicalGtin('3110'), '000000031103');
});

test('a bare organic 5-digit PLU is its own key', () => {
  const c = canonicalBarcode('94011');
  assert.equal(c?.how, 'plu');
  assert.equal(c?.gtin, '000000940115');
  assert.equal(c?.plu?.organic, true);
  assert.equal(c?.plu?.name, 'Organic Bananas');
  assert.notEqual(canonicalBarcode('4011')?.gtin, c?.gtin);
});

test('every zero-padded GTIN of a PLU gives the same key as the bare code', () => {
  for (const g of ['000000031103', '0000000031103', '00000000031103', '00031103']) {
    const c = canonicalBarcode(g);
    assert.equal(c?.how, 'plu', g);
    assert.equal(c?.gtin, '000000031103', g);
  }
  assert.equal(canonicalBarcode('00000000940115')?.gtin, '000000940115');
});

test('a real product barcode is not taken for a PLU', () => {
  assert.equal(canonicalBarcode('0068100084245')?.how, 'as_read');
  assert.equal(canonicalBarcode('012345678905')?.how, 'as_read');
  // A real EAN-8 (valid check digit, not a listed code once the zeros come off).
  assert.notEqual(canonicalBarcode('96385074')?.how, 'plu');
});

test('a 4-digit number that is not on the list is not a PLU', () => {
  assert.equal(canonicalBarcode('1234')?.how === 'plu', false);
  assert.equal(canonicalBarcode('4999')?.how === 'plu', false);
});

test('a weighed store label (number system 2) still collapses to its item key', () => {
  const c = canonicalBarcode('212345012348');
  assert.notEqual(c?.how, 'plu');
});
