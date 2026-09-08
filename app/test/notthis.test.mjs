/**
 * "Not this?", the ranked search's first caller.
 *
 * The endpoint has been live and uncalled since it was built (DEFECTS.md D-025,
 * the half that stayed open). The half that just closed is this one, so what is
 * worth asserting is not that the search works -- `/api/search` has its own
 * coverage -- but the three rules the SCREEN adds on top of it, each of which
 * is a decision somebody could undo without noticing:
 *
 *   1. The affordance appears only after an ambiguous pick. A confident answer
 *      offering alternatives is Shin apologising for something he is not unsure
 *      of, and that costs trust in every other answer he gives.
 *   2. An empty list says so in a sentence. Drawing an empty box reads as a
 *      failure when it is actually "there was only ever one".
 *   3. No price appears on these rows. They are catalogue products, not priced
 *      shelf entries, and a number here would be invented.
 *
 * By string, like sheet.test.mjs and for the reason its header gives: the app
 * has no runtime dependencies and these are template literals.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { pricePadSheet, searchCandidateSheet } from '../public/js/screens/camera.js';

const CAMERA = readFileSync(new URL('../public/js/screens/camera.js', import.meta.url), 'utf8');
const API = readFileSync(new URL('../public/js/api.js', import.meta.url), 'utf8');

const item = (extra = {}) => ({ id: 'x', text: 'Test item 500 g', category: 'grocery', ...extra });
const rows = [
  { code: '111', label: 'Test item 750 g', category: 'grocery', meta: 'Brand' },
  { code: '222', label: 'Test item 1 kg', category: 'grocery', meta: '' },
];

test('the endpoint has a client function at all, which is the thing that was missing', () => {
  assert.match(API, /export function search\(/);
  assert.match(API, /\/api\/search\?/);
});

test('the alternatives are fetched for the same device the pick was', () => {
  // Both endpoints route by this device's scan history. A list fetched without
  // the id would be narrowed differently from the pick it is offering
  // alternatives to, so it could contain rows the pick could never have been.
  const fn = API.slice(API.indexOf('export function search('), API.indexOf('export function alternatives('));
  assert.match(fn, /getDeviceId\(\)/);
  assert.match(fn, /params\.set\('deviceId'/);
});

test('the pad offers "not this?" when the pick was one of several', () => {
  const html = pricePadSheet(item({ notThisQuery: 'test item' }));
  assert.match(html, /data-act="notthis"/);
});

test('the pad offers nothing when the pick was the only one', () => {
  // The confident case and the barcode case both arrive here as a null query,
  // which is why one assertion covers both.
  assert.doesNotMatch(pricePadSheet(item({ notThisQuery: null })), /data-act="notthis"/);
  assert.doesNotMatch(pricePadSheet(item()), /data-act="notthis"/);
});

test('the gate is the band AND a rival, never the band alone', () => {
  // The band alone is always 'ambiguous' for a text-only query, because #band
  // scores agreement with what the caller pinned and a text query pins nothing.
  // Gating on it alone offers alternatives on every typed scan.
  assert.match(CAMERA, /id\.band === 'ambiguous' && id\.otherCandidates > 0/);
});

test('the server counts the rivals, so the screen does not have to guess', () => {
  const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  assert.match(server, /otherCandidates: Math\.max\(0, result\.candidates\.length - 1\)/);
  // A catalogue that is not attached has not looked at anything, so it reports
  // no rivals rather than leaving the field undefined for the screen to read.
  assert.match(server, /otherCandidates: 0,/);
});

test('every row is pickable by its own code', () => {
  const html = searchCandidateSheet(rows, 'test item');
  assert.match(html, /data-pick-code="111"/);
  assert.match(html, /data-pick-code="222"/);
});

test('an empty list is a sentence, not an empty box', () => {
  const html = searchCandidateSheet([], 'test item');
  assert.doesNotMatch(html, /data-pick-code=/);
  // The prompt swaps to the "that was the only one" key rather than rendering
  // a list container with nothing in it.
  assert.match(html, /only thing I have|Only one/);
});

test('a row never shows a price, because nobody has priced these', () => {
  const html = searchCandidateSheet(rows, 'test item');
  assert.doesNotMatch(html, /\$/);
});

test('the query reaches the screen escaped, not raw', () => {
  const html = searchCandidateSheet(rows, '<script>x</script>');
  assert.doesNotMatch(html, /<script>/);
});

test('the list can always be left without picking anything', () => {
  assert.match(searchCandidateSheet(rows, 'q'), /data-act="notthis-back"/);
  assert.match(searchCandidateSheet([], 'q'), /data-act="notthis-back"/);
});

test('the row already on the pad is dropped from its own alternatives', () => {
  assert.match(CAMERA, /\.filter\(\(c\) => !sameCode\(c\.code/);
});

test('a failed second look leaves the pad standing', () => {
  // The catch must not repaint `slot`: the shopper may have half a price typed,
  // and losing it to a failed optional lookup is a worse outcome than the
  // lookup simply not happening.
  const catchBlock = CAMERA.slice(
    CAMERA.indexOf("console.error('not-this search failed:'"),
    CAMERA.indexOf('if (dead || padItem !== from) return;'),
  );
  assert.ok(catchBlock.length > 0, 'the not-this catch block moved');
  assert.doesNotMatch(catchBlock, /slot\.innerHTML/);
});
