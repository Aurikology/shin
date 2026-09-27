/**
 * `src/same-store.ts`: one store from two sources is marked, never dropped.
 * The route-level half (the mark reaching the HTTP answer) is in
 * scan-category-and-same-store.test.ts; this file pins the matching rule.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markSameStore, storeKey, SAME_STORE_FIELD } from '../src/same-store.ts';

test('the field has the name the client reads', () => {
  assert.equal(SAME_STORE_FIELD, 'sameStoreAsGemini');
});

test('normalisation: case, whitespace, punctuation, apostrophes, accents and a trailing Canada or ca', () => {
  const same: [string, string][] = [
    ['Walmart', '  walmart  '],
    ['Walmart', 'WALMART'],
    ['Walmart', 'Walmart.ca'],
    ['Walmart', 'Walmart Canada'],
    ['Walmart', 'walmart   canada'],
    ['Walmart', 'Walmart, CA'],
    ['Costco', 'Costco Canada .ca'],
    ['Real Canadian Superstore', 'real  canadian superstore'],
    ['Loblaws', "Loblaw's"],
    ['Loblaws', 'Loblaw’s'],
    ['Shoppers Drug Mart', 'Shoppers-Drug-Mart'],
    ['Metro', 'Métro'],
    ['Pharmaprix', 'Pharmaprix!'],
  ];
  for (const [a, b] of same) assert.equal(storeKey(a), storeKey(b), `${JSON.stringify(a)} and ${JSON.stringify(b)} should be one store`);
});

test('normalisation does not merge different stores', () => {
  const different: [string, string][] = [
    ['Walmart', 'Walmart Supercentre'],
    ['Canadian Tire', 'Tire'],
    ['Metro', 'Metropolitan'],
    ['Sobeys', 'Sobeys Urban Fresh'],
  ];
  for (const [a, b] of different) assert.notEqual(storeKey(a), storeKey(b), `${JSON.stringify(a)} and ${JSON.stringify(b)} are not one store`);
  // Only a TRAILING word goes, and only a whole word.
  assert.equal(storeKey('Canada Computers'), 'canada computers');
  assert.equal(storeKey('Mecca'), 'mecca');
  // A name that is nothing but the suffix keeps it rather than becoming empty.
  assert.equal(storeKey('Canada'), 'canada');
});

test('a name that is not a string, or is blank, is an empty key', () => {
  for (const v of [null, undefined, 3, {}, '', '   ', '...']) assert.equal(storeKey(v), '');
});

test('a match marks the own offer, and every offer is kept in order', () => {
  const gemini = [{ retailer: 'Walmart' }, { retailer: 'Sobeys' }];
  const own = [
    { retailer: 'Walmart Canada', price: 4.49, seenOn: '2026-09-20' },
    { retailer: 'ANBL Fredericton', price: 5.99, seenOn: '2026-09-21' },
  ];
  const out = markSameStore(gemini, own);
  assert.equal(out.length, own.length, 'an offer was removed');
  assert.deepEqual(out.map((o) => o.retailer), own.map((o) => o.retailer), 'the order changed');
  assert.equal(out[0]!.sameStoreAsGemini, true);
  assert.equal(out[0]!.price, 4.49);
  assert.equal(out[0]!.seenOn, '2026-09-20');
  assert.equal('sameStoreAsGemini' in out[1]!, false, 'a non-match was marked');
  assert.equal(out[1], own[1], 'a non-match should be the very same object, unchanged');
});

test('the inputs are never mutated and Gemini offers are never touched', () => {
  const gemini = Object.freeze([Object.freeze({ retailer: 'Costco' })]);
  const own = [Object.freeze({ retailer: 'costco.ca', price: 9 })];
  const out = markSameStore(gemini, own);
  assert.equal(out[0]!.sameStoreAsGemini, true);
  assert.equal('sameStoreAsGemini' in own[0]!, false);
  assert.deepEqual(gemini, [{ retailer: 'Costco' }]);
});

test('no match, no Gemini offers, or blank names mark nothing', () => {
  const own = [{ retailer: 'Sobeys', price: 1 }, { retailer: '', price: 2 }];
  for (const gemini of [[], null, undefined, [{ retailer: 'Walmart' }], [{ retailer: '' }], [{}]]) {
    const out = markSameStore(gemini as { retailer?: unknown }[] | null | undefined, own);
    assert.equal(out.length, 2);
    for (const o of out) assert.equal('sameStoreAsGemini' in o, false, `marked against ${JSON.stringify(gemini)}`);
  }
});

test('two own rows for the same store are both marked, and both kept', () => {
  const out = markSameStore([{ retailer: 'Metro' }], [
    { retailer: 'Metro', price: 3, seenOn: '2026-09-01' },
    { retailer: 'Métro', price: 3.5, seenOn: '2026-09-10' },
  ]);
  assert.equal(out.length, 2);
  assert.ok(out.every((o) => o.sameStoreAsGemini === true));
});
