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
const { answerConfidenceHtml } = await import('../public/js/lib/history-answer.js');

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
  for (const who of PERSONALITIES.map((p) => p.id ?? p)) {
    const open = say('paywall_say_open', {}, who);
    assert.ok(open && open !== 'paywall_say_open', `no open line (${who})`);
    assert.doesNotMatch(open, /used|spent|ran out|gone/i, `the open line (${who}) claims the allowance is spent`);
  }
  const src = read('js/screens/paywall.js');
  assert.match(src, /limitSpent\(ctx\.params \?\? \{\}\) \? 'paywall_say' : 'paywall_say_open'/);
});

/* ------------------------------------------------------------------- N12 */

test('N12: every zone has a confident and a hedged line, in three attitudes, in both languages', () => {
  for (const key of ['dist_great', 'dist_good', 'dist_reasonable', 'dist_bad', 'dist_great_unsure', 'dist_good_unsure', 'dist_reasonable_unsure', 'dist_bad_unsure', 'dist_noprice']) {
    for (const who of ['deadpan', 'warm', 'blunt']) {
      const en = say(key, {}, who);
      assert.ok(en && en !== key, `${key} (${who}) has no English line`);
      assert.doesNotMatch(en, /undefined|null|NaN|saved/i);
    }
  }
  assert.notEqual(say('dist_great', {}, 'warm'), say('dist_great_unsure', {}, 'warm'));
});

/* ------------------------------------------------------------------- N02 */

test('N02: a medium-confidence share says "not fully confident", not a bare "Sure"', () => {
  assert.equal(t('share_conf_medium'), 'Not fully confident');
  setLocale('fr');
  try {
    assert.match(t('share_conf_medium'), /Pas tout à fait sûr/);
  } finally {
    setLocale('en');
  }
});

test('N02: a saved answer with doubt shows the doubt as readable text', () => {
  const a = { kind: 'distribution', verdict: { confidence: 'low', basis: 'claude_typical', p10Cents: 100, p90Cents: 900, centreCents: 400 } };
  const html = answerConfidenceHtml(a);
  assert.match(html, /pmodal-doubt/);
  assert.match(html, /Not fully confident/);
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
