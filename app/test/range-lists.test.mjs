/**
 * D-240, the lists: a range answer in Past scans, Saved and on the share card.
 * Its row shows the product and the range under its label ("A broad guess"),
 * and reopening it never shows a verdict word or a typical price (D-239: the
 * broad bell's midpoint is not a typical price).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });

const cam = await import('../public/js/screens/camera.js');
const { row: scanRow, detail } = await import('../public/js/screens/pastscans.js');
const { row: watchRow, detailModal } = await import('../public/js/screens/watchlist.js');
const { rangeCard } = await import('../public/js/screens/share.js');

const BROAD = { lowCents: 278, highCents: 3602, medianCents: null, n: 0, basis: 'fixed_prior', category: null, currency: 'CAD', unit: null };
const snap = cam.rangeAnswerSnapshot(BROAD, { key: '0123456789012', name: 'Panasonic Batteries', shelfCents: 499, code: '0123456789012' });
const entry = { id: 'h1', at: new Date().toISOString(), result: snap, query: { text: 'Panasonic Batteries', askingCents: 499, gtin: '0123456789012', answered: true } };
const saved = { id: snap.id, label: 'Panasonic Batteries', category: null, lastCents: 499, askingSeller: null, usualCents: null, answer: snap, savedAt: new Date().toISOString() };

const MIDPOINT = /\$19\.40|19,40/;
const VERDICT = /Great price|Good price|Reasonable|Bad price|Answered|Refused|typical/i;
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('D-240: the Past scans row shows the name, "A broad guess" and the range', () => {
  const text = plain(scanRow(entry));
  assert.match(text, /Panasonic Batteries/);
  assert.match(text, /A broad guess/);
  assert.match(text, /\$2\.78 to \$36\.02/);
  assert.doesNotMatch(text, VERDICT);
  assert.doesNotMatch(text, MIDPOINT);
});

test('D-240 / D-239: reopening the Past scans row shows its label and range, never a verdict', () => {
  const text = plain(detail(entry));
  assert.match(text, /A broad guess/);
  assert.match(text, /\$2\.78 to \$36\.02/);
  assert.match(text, /Panasonic Batteries/);
  assert.doesNotMatch(text, VERDICT);
  assert.doesNotMatch(text, MIDPOINT);
  assert.match(String(detail(entry)), /data-pmodal="range"/);
});

test('D-240: an AI range and an estimate wear their own labels', () => {
  const ai = { ...entry, result: { ...snap, basis: 'gemini_typical' } };
  assert.match(plain(scanRow(ai)), /Estimated by AI/);
  const est = { ...entry, result: { ...snap, basis: 'category_prior' } };
  assert.match(plain(scanRow(est)), /An estimate/);
});

test('D-240: the Saved row and its detail show the range, no usual price and no verdict', () => {
  const row = plain(watchRow(saved, [entry]));
  assert.match(row, /Panasonic Batteries/);
  assert.match(row, /A broad guess/);
  assert.match(row, /\$2\.78 to \$36\.02/);
  assert.doesNotMatch(row, /usual/i);
  assert.doesNotMatch(row, VERDICT);
  const open = plain(detailModal(saved, entry));
  assert.match(open, /A broad guess/);
  assert.match(open, /\$2\.78 to \$36\.02/);
  assert.doesNotMatch(open, VERDICT);
  assert.doesNotMatch(open, /did not survive|lost what came with it/, 'Saved said the details were lost');
  // Saved with its scan gone from history (past the hundred cap) still opens with the range.
  assert.match(plain(detailModal(saved, null)), /\$2\.78 to \$36\.02/);
});

test('D-240: the share card for a range answer leads with its label and carries the range, no verdict and no typical price', () => {
  const card = rangeCard(entry);
  assert.equal(card.word, 'A broad guess');
  assert.equal(card.elsewhereText, '$2.78 to $36.02');
  assert.equal(card.askingText, '$4.99');
  assert.equal(card.label, 'Panasonic Batteries');
  assert.doesNotMatch(JSON.stringify(card), MIDPOINT);
  assert.doesNotMatch(card.word + card.line, VERDICT);
});
