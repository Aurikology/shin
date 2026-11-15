/**
 * Fix, 2026-11-15 (launch check 2026-11-14): a typed name that leaves the brand out was answered "sure" as
 * one brand's product when other brands sell the same name and size ("Zesty Italian 475ml" as Selection's,
 * "Alfredo 410ml" as Selection's, "Light cream" as Great Value's). typedIdentity must call it a guess
 * whenever the typed words name no brand and two or more brands in the search rows carry them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { typedIdentity, resolveTypedName } = await import('../src/catalogue-first.ts');

const row = (code: string, name: string, brands: string, quantity: string) => ({ code, name, brands, quantity });
const selection = row('0059749902007', 'Zesty Italian Dressing', 'Selection', '475ml');
const blueMenu = row('0060383985356', 'Zesty Italian Dressing', 'PC Blue Menu', '475ml');

test('brand left out, two brands carry the name and size, search says confident: a guess', () => {
  const rows = [selection, blueMenu];
  const res = resolveTypedName('Zesty Italian 475ml', rows, 'confident');
  assert.equal(res.row, selection, 'the search still resolves a row');
  assert.equal(typedIdentity('Zesty Italian 475ml', rows, res).grade, 'guess');
});

test('size typed with a space still counts as the same size', () => {
  const rows = [selection, blueMenu];
  const res = resolveTypedName('Zesty Italian 475 ml', rows, 'confident');
  assert.equal(typedIdentity('Zesty Italian 475 ml', rows, res).grade, 'guess');
});

test('the brand is typed: still sure (full-name answers unchanged)', () => {
  const rows = [selection, blueMenu];
  const res = resolveTypedName('Selection Zesty Italian Dressing 475ml', rows, 'confident');
  assert.equal(typedIdentity('Selection Zesty Italian Dressing 475ml', rows, res).grade, 'sure');
});

test('brand left out but only one brand carries the words: still sure', () => {
  const rows = [selection, row('0000000000017', 'Caesar Dressing', 'Kraft', '475ml')];
  const res = resolveTypedName('Zesty Italian 475ml', rows, 'confident');
  assert.equal(typedIdentity('Zesty Italian 475ml', rows, res).grade, 'sure');
});

test('a different size of another brand is not a rival when a size is typed', () => {
  const rows = [selection, row('0059749909999', 'Zesty Italian Dressing', 'Kraft', '250ml')];
  const res = resolveTypedName('Zesty Italian 475ml', rows, 'confident');
  assert.equal(typedIdentity('Zesty Italian 475ml', rows, res).grade, 'sure');
});

test('two rows of one brand are not two brands', () => {
  const rows = [selection, row('0059749902014', 'Zesty Italian Dressing', 'Selection', '475ml')];
  const res = resolveTypedName('Zesty Italian 475ml', rows, 'confident');
  assert.equal(typedIdentity('Zesty Italian 475ml', rows, res).grade, 'sure');
});
