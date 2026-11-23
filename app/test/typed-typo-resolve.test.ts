/**
 * A typed name with one slip still finds the product (answer-key scenario typed_typo, 2026-11-23: a shopper typing
 * "Dariyco Whole Milk 2 L" was answered from the Claude guess rung in 10 of 10 examples, because the search keeps a
 * misspelt query at band `ambiguous` and the typed word was then not a word of the row). The slip is accepted only
 * when the top row is the one product the words reach; a wrong product is worse than a guess.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oneEditApart, resolveTypedName } from '../src/catalogue-first.ts';

const row = (code: string, name: string, brands: string | null, quantity: string | null = null) => ({ code, name, brands, quantity });

test('oneEditApart: a swap, a dropped, an added or a changed letter; never a short word or a number', () => {
  assert.ok(oneEditApart('dariyco', 'dairyco'));
  assert.ok(oneEditApart('buter', 'butter'));
  assert.ok(oneEditApart('butterr', 'butter'));
  assert.ok(oneEditApart('chocolote', 'chocolate'));
  assert.ok(!oneEditApart('dairyco', 'dairyco'));
  assert.ok(!oneEditApart('mild', 'milk'), 'under five letters');
  assert.ok(!oneEditApart('50000', '50001'), 'a number');
  assert.ok(!oneEditApart('dairyxx', 'dairyco'), 'two edits');
});

const milks = [
  row('1', 'Whole Milk', 'Dairyco', '2 L'),
  row('2', 'Skim Milk', 'Dairyco', '2 L'),
  row('3', 'Chocolate Milk', 'Dairyco', '1 L'),
];

test('a one-slip brand word finds the product when only that row carries the rest of the words', () => {
  const r = resolveTypedName('Dariyco Whole Milk 2 L', milks, 'ambiguous');
  assert.equal(r.row?.code, '1');
  assert.equal(r.rule, 'one_edit_typo_no_rival');
});

test('a one-slip name word finds the product', () => {
  assert.equal(resolveTypedName('Dairyco Chooclate Milk 1 L', [milks[2], milks[0], milks[1]], 'ambiguous').row?.code, '3');
});

test('the search\'s own correction is used as the words when it gave one', () => {
  // Two edits away is beyond a slip, but the speller already fixed it, and the corrected words are covered exactly.
  const r = resolveTypedName('Dairyco Chocloatte Milk 1 L', [milks[2], milks[0], milks[1]], 'ambiguous', 'Dairyco Chocolate Milk 1 L');
  assert.equal(r.row?.code, '3');
  assert.equal(r.rule, 'covers_all_words_no_rival');
});

test('a slip that two different products could be is ambiguous, not a pick', () => {
  const twins = [row('1', 'Cola Classic', 'Fizzco', '2 L'), row('2', 'Cola Classik', 'Fizzco', '2 L')];
  // "classic" is exact for row 1; row 2 only by a slip: the exact row is the answer, and row 2 cannot be a rival of it
  // because the typed word is exact for row 1. The reverse typo is the dangerous one.
  assert.equal(resolveTypedName('Fizzco Cola Classic 2 L', twins, 'ambiguous').row?.code, '1');
  const bothSlips = [row('1', 'Cola Classic', 'Fizzco', '2 L'), row('2', 'Cola Classis', 'Fizzco', '2 L')];
  assert.equal(resolveTypedName('Fizzco Cola Classiq 2 L', bothSlips, 'ambiguous').rule, 'ambiguous');
});

test('a typo closer to a different product than the top row does not claim the top row', () => {
  // The search put "Skim" first, but the typed word is a slip of "Chocolate" and is no word of the top row.
  const rows = [row('2', 'Skim Milk', 'Dairyco', '2 L'), row('3', 'Chocolate Milk', 'Dairyco', '1 L')];
  assert.equal(resolveTypedName('Dairyco Chooclate Milk', rows, 'ambiguous').rule, 'ambiguous');
});

test('two wrong words, or a short word off by one letter, are not a slip', () => {
  assert.equal(resolveTypedName('Dariyco Whoel Milk 2 L', milks, 'ambiguous').rule, 'ambiguous');
  const mild = [row('1', 'Milk', 'Natrel', '2 L')];
  assert.equal(resolveTypedName('Natrel Mild 2 L', mild, 'ambiguous').rule, 'ambiguous');
});

test('clean queries resolve as before', () => {
  assert.equal(resolveTypedName('Dairyco Whole Milk 2 L', milks, 'ambiguous').rule, 'covers_all_words_no_rival');
  assert.equal(resolveTypedName('Dairyco Milk', milks, 'ambiguous').rule, 'ambiguous');
  assert.equal(resolveTypedName('Dairyco Whole Milk', milks, 'confident').rule, 'search_confident');
});
