/**
 * D38: the product-type line is in the shopper's language. An English reader
 * never sees a French category name ("Boisson alcoolisee"), and never a raw
 * "en:" tag. 503 thousand catalogue products carry a French leaf tag whose
 * ancestors on the same row are English; the English ancestor is used, and with
 * none the line is left out.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });

const { categoryRef, categoryName } = await import('../src/catalogue-first.ts');
const { categoryLineOf } = await import('../public/js/screens/camera.js');
const { setLocale } = await import('../public/js/lib/locale.js');

const PATH = ['en:beverages', 'en:alcoholic-beverages', 'fr:boisson-alcoolisee'];

test('D38 server: an English tag reads as before', () => {
  assert.deepEqual(categoryRef('en:peanut-butters'), { tag: 'en:peanut-butters', name: 'Peanut butters' });
  assert.equal(categoryName('en:peanut-butters'), 'Peanut butters');
});

test('D38 server: a French leaf is replaced by its nearest English ancestor on the row', () => {
  const r = categoryRef('fr:boisson-alcoolisee', PATH);
  assert.equal(r?.name, 'Alcoholic beverages');
  assert.equal(r?.tag, 'en:alcoholic-beverages');
  assert.doesNotMatch(r?.name ?? '', /boisson/i);
});

test('D38 server: a French tag with no English ancestor has no name, never French words', () => {
  assert.equal(categoryRef('fr:barres-croquantes-aux-7-grains-quinoa', ['fr:barres-croquantes-aux-7-grains-quinoa'])?.name, '');
  assert.equal(categoryRef('fr:craquelin')?.name, '');
});

test('D38 server: the ancestor search starts at the tag, not at the far end of the path', () => {
  const path = ['en:snacks', 'fr:mid', 'en:deep-leaf', 'fr:leaf'];
  assert.equal(categoryRef('fr:mid', path)?.name, 'Snacks');
  assert.equal(categoryRef('fr:leaf', path)?.name, 'Deep leaf');
});

test('D38 client: the English UI shows the English ancestor, or nothing, never French or a raw tag', () => {
  setLocale('en');
  assert.equal(categoryLineOf({ leafCategory: 'fr:boisson-alcoolisee', categoryPath: PATH }), 'Alcoholic beverages');
  assert.equal(categoryLineOf({ leafCategory: 'en:frozen-fried-potatoes', categoryPath: [] }), 'Frozen fried potatoes');
  assert.equal(categoryLineOf({ leafCategory: 'fr:craquelin', categoryPath: ['fr:craquelin'] }), '');
  assert.equal(categoryLineOf({ leafCategory: null, categoryPath: [] }), '');
});

test('D38 client: the French UI keeps the French leaf', () => {
  setLocale('fr');
  try {
    assert.equal(categoryLineOf({ leafCategory: 'fr:boisson-alcoolisee', categoryPath: PATH }), 'Boisson alcoolisee');
  } finally {
    setLocale('en');
  }
});
