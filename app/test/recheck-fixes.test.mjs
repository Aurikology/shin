/**
 * Fixes from the 2026-10-06 re-check (docs/walkthrough-recheck-2026-10-06.md):
 * N01 to N14 and D30 / D44. One test per defect, each written to go red when its
 * fix is removed. Markup is checked as a string; NOT A BROWSER.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });

const read = (rel) => readFileSync(new URL(`../public/${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const { cleanName, nameCarriesSize } = await import('../public/js/lib/product-name.js');
const store = await import('../public/js/store.js');
const { t, setLocale } = await import('../public/js/ui-strings.js');
const { say, PERSONALITIES } = await import('../public/js/voice.js');
const { savingsView, savingsHtml } = await import('../public/js/screens/savings.js');
const { limitSpent } = await import('../public/js/screens/paywall.js');
const { answerCard } = await import('../public/js/screens/share.js');
const { detailModal } = await import('../public/js/screens/watchlist.js');

/* ------------------------------------------------------------------- N09 */

test('N09: a feed-decorated name comes back clean, and a clean name comes back byte for byte', () => {
  assert.equal(cleanName('WF • 🇨🇦Save-On-Foods Kleenex Facial Tissue 95 pack 95 pack'), 'Save-On-Foods Kleenex Facial Tissue 95 pack');
  assert.equal(cleanName('McCain Tasti Taters 800 g'), 'McCain Tasti Taters 800 g');
  assert.equal(cleanName(''), '');
  assert.equal(cleanName(null), '');
  assert.ok(!/[•🇨🇦ᴄᴀ]/u.test(cleanName('PC • ᴄᴀ Peanut Butter')));
});

test('N09: a size already in the name is not written twice', () => {
  assert.equal(nameCarriesSize('Kleenex Facial Tissue 95 pack', '95 pack'), true);
  assert.equal(nameCarriesSize('Kleenex Facial Tissue', '95 pack'), false);
  assert.equal(nameCarriesSize('Kleenex', ''), false);
});

/* ------------------------------------------------------------------- N08 */

test('N08: a name given to an unknown barcode is remembered on this device, keyed by digits', () => {
  assert.equal(store.nameOfCode('9310088013191'), null);
  store.rememberName('9310088013191', '  My Lentils 500 g ');
  assert.equal(store.nameOfCode('9310088013191'), 'My Lentils 500 g');
  assert.equal(store.nameOfCode('09310088013191'), 'My Lentils 500 g', 'leading zeros are one key');
  store.rememberName('', 'nothing');
  store.rememberName('123', '   ');
  assert.equal(store.nameOfCode('123'), null);
  assert.equal(store.nameOfCode(null), null);
});

/* ------------------------------------------------------------------- N06 */

test('N06: unreadable stored data is a fault on Savings, never "nothing scanned yet"', () => {
  const view = savingsView({ history: [], __fault: true }, null);
  assert.equal(view.fault, true);
  const html = savingsHtml(view);
  assert.match(html, /data-savings="fault"/);
  assert.match(html, /data-act="retry"/);
  assert.equal(savingsView({ history: [] }, null).fault, false);
  assert.doesNotMatch(savingsHtml(savingsView({ history: [] }, null)), /data-savings="fault"/);
  assert.ok(t('savings_unreadable').length > 10);
});

/* ------------------------------------------------------------------- D30 */

test('D30: the paywall bubble is the "used" line only when the allowance is spent', () => {
  assert.equal(limitSpent({ limit: 5, used: 5 }), true);
  assert.equal(limitSpent({ limit: 5, used: 2 }), false, 'opened from a button with scans left');
  assert.equal(limitSpent({}), false);
  const src = read('js/screens/paywall.js');
  // UX build 2 (R-84): the spent bubble is now paywall_say_spent (points the disappointment at Pexi), still gated on limitSpent.
  // Changed 2026-10-10 (audit row 38): opened with scans left the face stands alone, so the open
  // screen cannot claim the allowance is spent at all; the spent line still only speaks when spent.
  assert.match(src, /const spent = limitSpent\(params\);/);
  assert.match(src, /spent\s*\? shinSay\('idle', 'paywall_say_spent'[^\n]*\n\s*: ''\}/);
  assert.doesNotMatch(src, /paywall_say_open/, 'the open screen speaks a line again');
});

/* ------------------------------------------------------------------- N12 */

/* N12's per-zone bubble lines were retired 2026-10-10 (RULINGS.md "V1 verdict screen
   mechanics": on the verdict the mascot shows its face only). What N12 guarded, a loud
   line on thin evidence, can no longer happen because no line is spoken there. */
test('N12, as it stands now: the verdict has no zone lines left to speak, in any attitude', () => {
  for (const key of ['dist_great', 'dist_good', 'dist_reasonable', 'dist_bad', 'dist_great_unsure', 'dist_good_unsure', 'dist_reasonable_unsure', 'dist_bad_unsure', 'dist_noprice']) {
    for (const who of ['deadpan', 'warm', 'blunt']) assert.throws(() => say(key, {}, who), /no line for the key/, `${key} (${who}) is back`);
  }
});

/* ------------------------------------------------------------------- N02 */

/* N02 said a medium share must never read as a bare "Sure". Changed 2026-10-10 (audit
   row 41): a card meant to be posted prints no hedge, so a medium or low card prints no
   confidence word at all, and still never claims to be sure. */
test('N02: a medium or low share card never claims to be sure, and prints no hedge', () => {
  const at = new Date().toISOString();
  const answer = (confidence) => ({ kind: 'distribution', id: 'k', label: 'Milk', zone: 'good', confidence, centreCents: 400, p10Cents: 300, p90Cents: 500, currency: 'CAD', askingCents: 300, offByPct: -25, basis: 'own_prices' });
  for (const confidence of ['medium', 'low']) {
    const card = answerCard({ id: 'h', at, result: answer(confidence), query: {} });
    assert.equal(card.confidence, '', confidence);
  }
  assert.equal(answerCard({ id: 'h', at, result: answer('high'), query: {} }).confidence, t('share_conf_high').toUpperCase());
  setLocale('fr');
  try {
    assert.equal(answerCard({ id: 'h', at, result: answer('medium'), query: {} }).confidence, '');
  } finally {
    setLocale('en');
  }
});

/* N02's second half, "a saved answer with doubt shows the doubt", changed 2026-10-10
   (audit row 29): a reopened answer is its word, percentage, item and date. It still
   never shows more confidence than the sheet did: no "Confident" on a low answer. */
test('N02: a saved low answer reopens with no confidence claim', () => {
  const a = { kind: 'distribution', id: 'k', label: 'Milk', zone: 'reasonable', confidence: 'low', basis: 'claude_typical', p10Cents: 100, p90Cents: 900, centreCents: 400, currency: 'CAD', askingCents: 400, offByPct: 0 };
  const html = detailModal({ id: 'k', label: 'Milk', lastCents: 400, usualCents: 400, savedAt: new Date().toISOString(), answer: a }, null);
  assert.match(html, /Reasonable price/);
  assert.doesNotMatch(html, /Confident|Not fully confident|pmodal-conf/);
});

/* ------------------------------------------------------------------- N03 */

test('N03: the Fix form fine print speaks of sending in the future tense', () => {
  for (const who of ['deadpan', 'warm', 'blunt']) {
    assert.match(say('correct_fineprint', { label: 'Milk', seller: 'X' }, who), /(Once you send it|When you send it|Sent, it)/);
    assert.doesNotMatch(say('correct_fineprint', { label: 'Milk', seller: 'X' }, who), /has been|is recorded now|was recorded/i);
  }
  const src = read('js/screens/correct.js');
  assert.match(src, /status === 'failed'/);
});

/* ------------------------------------------------------------- N05 / N07 */

test('N05: the Fix form no longer guesses its item from the newest scan', () => {
  const src = read('js/screens/correct.js');
  assert.doesNotMatch(src, /history\[0\]/);
  assert.match(src, /function paintPick\(/);
  assert.match(src, /data-pick-item/);
  assert.ok(t('correct_pick_h').length > 5);
});

test('N07: shop suggestions are drawn inline, not through a datalist', () => {
  const src = read('js/screens/correct.js');
  assert.doesNotMatch(src, /<datalist/);
  assert.match(src, /data-pick-shop/);
  assert.match(src, /pickedShop/);
});

/* ------------------------------------------------------------------- N13 */

test('N13: onboarding speaks about the barcode only', () => {
  const src = read('js/onboarding-strings.js');
  assert.match(src, /Make sure the barcode is visible/);
  assert.match(src, /Barcode identified/);
  assert.doesNotMatch(src, /Barcode\/Tag|barcode or price tag/i);
});

/* ------------------------------------------------------------------- N14 */

test('N14: the Buzz caption does not talk about refusals', () => {
  assert.doesNotMatch(t('you_buzz_caption'), /refus/i);
});

/* ------------------------------------------------------------------- N04 */

test('N04: the thumbs toast wraps, and its undo is a 44 by 44 target', () => {
  const css = read('css/screens/camera.css');
  assert.match(css, /\.toast \{[^}]*flex-wrap: wrap/);
  assert.match(css, /\.toast-undo \{[^}]*min-height: 44px/);
  assert.match(css, /\.toast-undo \{[^}]*min-width: 44px/);
});
