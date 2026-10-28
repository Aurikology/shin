/**
 * Past scans' search (2026-10-27): every word of the query found in the item's
 * name, the shop or the typed text, ignoring case and accents. The field itself
 * only shows from SEARCH_MIN rows; that is checked live, this pins the matching.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });
const { matchesScan, SEARCH_MIN } = await import('../public/js/screens/pastscans.js');

const typed = (text) => ({ id: 'a', at: '2026-10-27T12:00:00Z', query: { text }, result: { kind: 'refusal', reason: 'no_identity' } });

test('an empty or blank query matches every row', () => {
  assert.equal(matchesScan(typed('Nutella 725 g'), ''), true);
  assert.equal(matchesScan(typed('Nutella 725 g'), '   '), true);
});

test('every word must be found, in any order, ignoring case', () => {
  assert.equal(matchesScan(typed('Nutella hazelnut spread 725 g'), 'SPREAD nutella'), true);
  assert.equal(matchesScan(typed('Nutella hazelnut spread 725 g'), 'nutella peanut'), false);
});

test('accents are ignored both ways', () => {
  assert.equal(matchesScan(typed('Crème fraîche'), 'creme fraiche'), true);
  assert.equal(matchesScan(typed('Creme fraiche'), 'crème'), true);
});

test('a malformed row does not throw, it just does not match a word', () => {
  assert.equal(matchesScan({}, 'milk'), false);
});

test('the field is held back until the list is long enough to need it', () => {
  assert.ok(Number.isInteger(SEARCH_MIN) && SEARCH_MIN > 1);
});
