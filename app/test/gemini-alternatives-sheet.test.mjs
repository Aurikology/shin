/**
 * The alternatives list under the Gemini answer (beta gap item 18), and the
 * catch branch of `proceed` (a price call that throws must show the same kind,
 * retryable "Try again" state as the Gemini failure variants: rule 6, always an
 * answer, never the refusal sheet).
 *
 * The sheet is a string renderer, so the list is asserted on the markup a phone
 * would get. Pexi computes no price math: the price text on screen must be the
 * bytes Gemini returned, which is why the fixture prices are ones a formatter
 * would change ("1.5 CAD", "$2").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { geminiSheet, geminiFailureSheet } from '../public/js/screens/camera.js';
import { geminiReading } from '../public/js/grounded.js';
import { t, TABLES } from '../public/js/ui-strings.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

function withAlternatives(alternatives) {
  return {
    kind: 'gemini',
    scanId: 7,
    lowConfidence: false,
    confidenceReasons: [],
    grounded: {
      kind: 'grounded',
      forDevice: 'dev',
      fetchedAt: '2026-09-19T12:00:00.000Z',
      block: {
        kind: 'prices',
        checked: false,
        name: 'Citrus Soda',
        description: 'A citrus soda.',
        offers: [{ retailer: 'Northfield', price: '4.49', hasLink: false }],
        reviews: [],
        facts: [],
        verdict: null,
        lowConfidence: false,
        confidenceReasons: [],
        alternatives,
      },
      suggestionsHtml: '',
    },
  };
}

const ALT = (over = {}) => ({
  name: 'Store-brand soda',
  brand: 'No Name',
  kind: 'substitute',
  reason: 'Not the same brand, two dollars less.',
  storeName: 'Beta Foods',
  storeType: 'supermarket',
  condition: 'new',
  priceText: '1.5 CAD',
  currency: 'CAD',
  size: '355 mL',
  url: null,
  attributes: [],
  notes: [],
  ...over,
});

const ITEM = { text: 'citrus soda' };

test('alternatives are a plain list under the answer: name, why, and the price as Gemini returned it', () => {
  const html = geminiSheet(withAlternatives([ALT(), ALT({ name: 'Used can', kind: 'used_copy', reason: 'Used, cheaper.', priceText: '$2', storeName: null })]), ITEM, null);
  assert.match(html, /data-gemini-alternatives/, 'the alternatives section is not on the sheet');
  assert.equal((html.match(/data-gem-alt/g) ?? []).length, 2, 'not one row per alternative');
  assert.ok(html.includes('No Name Store-brand soda'), 'the name is not shown');
  assert.ok(html.includes('Not the same brand, two dollars less.'), 'the model\'s reason is not shown');
  assert.ok(html.includes('1.5 CAD'), 'the price is not the text Gemini returned');
  assert.ok(html.includes('>$2<'), 'the price text was reformatted');
  assert.ok(html.includes('at Beta Foods'), 'the shop is not shown');
  assert.ok(html.indexOf('data-grounded-slot') < html.indexOf('data-gemini-alternatives'), 'the list is not under the answer');
  assert.doesNotMatch(html, /\d\s?%|save[sd]?\b|cheaper by/i, 'the sheet shows a saving Pexi worked out');
});

test('no alternatives means no section at all, not an empty heading', () => {
  for (const none of [[], undefined, null, 'x', [{ name: 'No price' }], [{ priceText: '$1' }]]) {
    const html = geminiSheet(withAlternatives(none), ITEM, null);
    assert.doesNotMatch(html, /data-gemini-alternatives|gem-alts|data-gem-alt/, `a section was drawn for ${JSON.stringify(none)}`);
  }
});

test('a row with no reason falls back to a plain sentence for its kind, and never shows a raw code', () => {
  const html = geminiSheet(withAlternatives([ALT({ reason: null, kind: 'newer_model' }), ALT({ reason: null, kind: 'something_new' })]), ITEM, null);
  assert.ok(html.includes(t('gem_alt_kind_newer_model')));
  assert.ok(html.includes(t('gem_alt_kind_other')), 'an unknown kind is not the plain fallback');
  assert.doesNotMatch(html, /newer_model|something_new/);
});

test('what Gemini returned is escaped, never injected', () => {
  const html = geminiSheet(withAlternatives([ALT({ name: '<img src=x onerror=1>', reason: '<b>why</b>', priceText: '"5" & <i>' })]), ITEM, null);
  assert.doesNotMatch(html, /<img|<b>why|<i>/);
  assert.match(html, /&lt;img/);
});

test('at most five rows are drawn, in the order given', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ALT({ name: `Alt ${i}` }));
  const html = geminiSheet(withAlternatives(rows), ITEM, null);
  assert.equal((html.match(/data-gem-alt/g) ?? []).length, 5);
  assert.ok(html.indexOf('Alt 0') < html.indexOf('Alt 4'));
  assert.doesNotMatch(html, /Alt 5/);
});

test('the reading copies the alternatives and does no arithmetic on their price', () => {
  const g = geminiReading(withAlternatives([ALT()]).grounded);
  assert.equal(g.alternatives.length, 1);
  assert.equal(g.alternatives[0].price, '1.5 CAD');
  assert.equal(g.alternatives[0].reason, 'Not the same brand, two dollars less.');
  assert.deepEqual(geminiReading(withAlternatives(undefined).grounded).alternatives, []);
  const src = read('../public/js/grounded.js');
  const body = src.slice(src.indexOf('function alternativesReading'));
  assert.doesNotMatch(body, /Math\.|toFixed|parseFloat|Number\(|Intl\./, 'the alternatives reading works on a price');
});

test('the alternatives strings exist in English and French, and carry no em dash', () => {
  for (const key of ['gem_alt_heading', 'gem_alt_at', 'gem_alt_kind_same_product', 'gem_alt_kind_substitute', 'gem_alt_kind_used_copy', 'gem_alt_kind_newer_model', 'gem_alt_kind_other']) {
    for (const lang of ['en', 'fr']) {
      const v = TABLES[lang][key];
      assert.ok(v, `${lang} is missing ${key}`);
      const text = typeof v === 'function' ? v({ store: 'X' }) : v;
      assert.ok(text.length > 0 && !text.includes('—'), `${lang} ${key} is empty or has an em dash`);
    }
  }
  assert.notEqual(TABLES.en.gem_alt_kind_used_copy, TABLES.fr.gem_alt_kind_used_copy, 'French is a copy of the English');
});

test('the sheet is drawn in French when the locale is French', () => {
  const hadStore = 'localStorage' in globalThis;
  const before = hadStore ? globalThis.localStorage : undefined;
  const cell = new Map([['shin.locale', 'fr']]);
  globalThis.localStorage = {
    getItem: (k) => (cell.has(k) ? cell.get(k) : null),
    setItem: (k, v) => cell.set(k, String(v)),
    removeItem: (k) => cell.delete(k),
  };
  try {
    const html = geminiSheet(withAlternatives([ALT({ reason: null, kind: 'used_copy' })]), ITEM, null);
    assert.ok(html.includes(TABLES.fr.gem_alt_heading), 'the heading is not French');
    assert.ok(html.includes(TABLES.fr.gem_alt_kind_used_copy.replace(/'/g, '&#39;')) || html.includes(TABLES.fr.gem_alt_kind_used_copy), 'the fallback reason is not French');
  } finally {
    if (hadStore) globalThis.localStorage = before;
    else delete globalThis.localStorage;
  }
});

/* ============================================ the catch branch of proceed == */

const camera = read('../public/js/screens/camera.js');
const catchStart = camera.indexOf("console.error('scan failed:', err);");
const catchEnd = camera.indexOf('setState(\'result\');', catchStart);
const catchBranch = catchStart > 0 && catchEnd > catchStart ? camera.slice(catchStart, catchEnd) : '';

test('a price call that throws shows the kind retryable state, never the refusal sheet', () => {
  assert.ok(catchBranch.length > 100, 'the catch branch of proceed moved, so there is nothing to check');
  assert.match(catchBranch, /geminiFailureSheet\(/, 'the catch branch does not draw the Gemini failure state');
  assert.doesNotMatch(catchBranch, /refusalSheet\(/, 'the catch branch still draws the refusal sheet');
  assert.doesNotMatch(catchBranch, /no_source_response|cam_sources_failed/, 'the catch branch still speaks the old refusal');
  // "Try again" repeats THIS scan: retry reads `last`, so the catch has to set it.
  assert.match(catchBranch, /last = \{ result: [^;]*scenario: item[^;]*askingCents/, 'Try again would repeat the previous scan');
  const html = geminiFailureSheet({ kind: 'gemini', failure: 'model_outage' }, ITEM);
  assert.match(html, /data-act="gem-retry"/, 'the state has no way to try again');
  assert.ok(html.includes('citrus soda'), 'the name did not survive the failure');
  assert.doesNotMatch(html, /refused|could not price|no confident match/i, 'the state speaks the refusal wording');
});
