import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pluList, pluKey, pluFromDigits, pluFromKey, pluByCode, gs1CheckDigit } from '../src/plu.ts';

function valid(d: string): boolean {
  return gs1CheckDigit(d.slice(0, -1)) === d[d.length - 1];
}

test('the PLU list holds the codes the shopper meets', () => {
  const l = pluList();
  assert.equal(Object.keys(l).length, 1520);
  assert.match(l['3110'], /Cara Cara/);
  assert.equal(l['4011'], 'Bananas');
});

test('the key is the code left-padded to 11 digits plus its check digit, and always a valid GTIN-12', () => {
  assert.equal(pluKey('3110'), '000000031103');
  assert.equal(pluKey('94011'), '000000940115');
  for (const code of Object.keys(pluList())) assert.ok(valid(pluKey(code)), code);
});

test('a bare 4-digit code and a bare organic 5-digit code are PLUs', () => {
  const orange = pluFromDigits('3110');
  assert.equal(orange?.code, '3110');
  assert.equal(orange?.key, '000000031103');
  assert.equal(orange?.organic, false);
  assert.match(orange!.name, /Cara Cara/);
  const banana = pluFromDigits('94011');
  assert.equal(banana?.code, '94011');
  assert.equal(banana?.organic, true);
  assert.equal(banana?.name, 'Organic Bananas');
  assert.equal(banana?.key, '000000940115');
});

test('every zero-padded GTIN form of a PLU resolves to the same key', () => {
  for (const [plain, key] of [['3110', '000000031103'], ['94011', '000000940115']]) {
    const body = plain.padStart(11, '0');
    const check = gs1CheckDigit(body);
    for (const len of [12, 13, 14]) {
      const gtin = (body + check).padStart(len, '0');
      assert.equal(pluFromDigits(gtin)?.key, key, `${len} digits ${gtin}`);
    }
    // The 8-digit form: the code with fewer zeros in front.
    const eight = (plain + gs1CheckDigit(plain.padStart(7, '0'))).padStart(8, '0');
    assert.equal(pluFromDigits(eight)?.key, key, `8 digits ${eight}`);
  }
});

test('spaces and dashes are ignored', () => {
  assert.equal(pluFromDigits(' 3110 ')?.code, '3110');
  assert.equal(pluFromDigits('9-4011')?.code, '94011');
});

test('a padded form whose check digit is wrong is not a PLU', () => {
  assert.equal(pluFromDigits('000000031106'), null);
  assert.equal(pluFromDigits('00000000031106'), null);
});

test('a code that is not on the list is not a PLU, and real packaged-goods codes are left alone', () => {
  assert.deepEqual(pluFromDigits('3000'), pluByCode('3000'));
  assert.equal(pluFromDigits('4999'), null); // in range, not on the list
  assert.equal(pluFromDigits('2999'), null);
  assert.equal(pluFromDigits('1234'), null);
  assert.equal(pluFromDigits('99999'), null);
  assert.equal(pluFromDigits('0068100084245'), null); // a real 13-digit product code
  assert.equal(pluFromDigits('060383756011'), null); // a real UPC-A
  assert.equal(pluFromDigits('96385074'), null); // a real EAN-8
  assert.equal(pluFromDigits('12345'), null);
  assert.equal(pluFromDigits(''), null);
  assert.equal(pluFromDigits('abc'), null);
});

test('the key resolves back to its PLU, in 12 or zero-padded 13 digits', () => {
  assert.equal(pluFromKey('000000031103')?.code, '3110');
  assert.equal(pluFromKey('0000000031103')?.code, '3110');
  assert.equal(pluFromKey('000000940115')?.code, '94011');
  assert.equal(pluFromKey('000000031104'), null);
  assert.equal(pluFromKey('0068100084245'), null);
});
