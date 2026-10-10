/**
 * THE TOP OF THE VERDICT IS FOR USEFUL INFORMATION ONLY.
 *
 * RULINGS.md "V1 verdict screen mechanics" (Jamin, 2026-10-10): "The second line
 * on that is a line that says pexi is not sure about this price range. This is
 * the most useless info put at the top of the page", then "go ahead". No "not
 * fully confident" line under the verdict word, at any confidence level. Doubt is
 * drawn (the wider bell, the hollow fill) and spoken once, by the mascot's
 * bubble; the reason in a few words sits in the half detent, beside where the
 * estimate came from.
 *
 * Each assertion below was run against the code as it stood before this change
 * (a "Not fully confident: why" line between the word and the "how far off"
 * line, nothing in the half detent) and failed there.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const cell = new Map();
globalThis.localStorage = {
  getItem: (k) => (cell.has(k) ? cell.get(k) : null),
  setItem: (k, v) => cell.set(k, String(v)),
  removeItem: (k) => cell.delete(k),
};
function inLocale(id, fn) {
  cell.set('shin.locale', id);
  try {
    return fn();
  } finally {
    cell.delete('shin.locale');
  }
}

const F = await import('./verdict-fixtures.mjs');
const { distributionSheet } = await import('../public/js/screens/camera.js');

const unesc = (s) => s?.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const peekOf = (html) => html.slice(html.indexOf('<div class="sheet-peek">'), html.indexOf('<div class="sheet-half">'));
const halfOf = (html) => html.slice(html.indexOf('<div class="sheet-half">'), html.indexOf('<div class="sheet-full">'));
/** The text of every <p> under the verdict word in the peek, in order (the mascot's bubble sits above the word). */
const peekLines = (html) => [...peekOf(html).slice(peekOf(html).indexOf('data-dist-headline')).matchAll(/<p class="([^"]*)"[^>]*>([^<]*)<\/p>/g)].map((m) => ({ cls: m[1], text: unesc(m[2]) }));
const sheet = (v, opts, locale = 'en') => inLocale(locale, () => distributionSheet(v, opts));

test('the peek of a low-confidence verdict carries no confidence line, in either language', () => {
  for (const locale of ['en', 'fr']) {
    const peek = peekOf(sheet(F.LOW_CONFIDENCE, {}, locale));
    assert.doesNotMatch(peek, /data-dist-conf/, locale);
    assert.doesNotMatch(peek, /not fully confident|pas entièrement sûrs/i, locale);
  }
});

test('the peek of a medium-confidence verdict carries no confidence line either', () => {
  const peek = peekOf(sheet(F.MEDIUM_SALE_BULK));
  assert.doesNotMatch(peek, /data-dist-conf/);
  assert.doesNotMatch(peek, /not fully confident/i);
});

test('the second line of the peek is the percent-and-estimate line, at every confidence level', () => {
  for (const [name, v] of [['low', F.LOW_CONFIDENCE], ['medium', F.MEDIUM_SALE_BULK], ['high', F.BAD]]) {
    const html = sheet(v);
    const [first] = peekLines(html);
    assert.equal(first.cls, 'sub vd-line', `${name}: the first line under the word is the useful one`);
    assert.match(first.text, /^\d+% (under|over) the typical price, Pexi's estimate \$[\d.]+$/, name);
    assert.ok(html.indexOf('data-dist-headline') < html.indexOf('data-dist-line'), name);
  }
});

test('a wide-spread range sentence comes after the useful line, never before it', () => {
  const html = sheet({ ...F.LOW_CONFIDENCE, p10Cents: 300, p90Cents: 3000 });
  const lines = peekLines(html);
  assert.equal(lines[0].cls, 'sub vd-line');
  assert.match(lines[1].cls, /vd-spread/);
  assert.match(lines[1].text, /vary a lot/);
});

test('the half detent carries the reason in plain words, right after where the estimate came from', () => {
  const half = halfOf(sheet({ ...F.LOW_CONFIDENCE, basis: 'own_prices' }));
  assert.match(half, /data-vd-basis/);
  const reason = unesc(half.match(/data-vd-reason>([^<]*)</)?.[1]);
  assert.equal(reason, 'Few prices for this item');
  assert.ok(half.indexOf('data-vd-basis') < half.indexOf('data-vd-reason'), 'the reason follows the basis line');
  assert.ok(half.indexOf('data-vd-reason') < half.indexOf('data-vd-notes') || !half.includes('data-vd-notes'), 'and comes before the notes');
  assert.doesNotMatch(half, /not fully confident/i, 'no prefix: plain words');
});

test('every keyed reason reaches the half detent, in both languages', () => {
  const en = (basis) => unesc(halfOf(sheet({ ...F.LOW_CONFIDENCE, basis })).match(/data-vd-reason>([^<]*)</)?.[1]);
  assert.equal(en('claude_typical'), 'An AI estimate, no prices for this item');
  assert.equal(en('other_size'), 'Worked out from another size of this item');
  assert.equal(en('category_prior'), 'A rough estimate for its category');
  assert.equal(en('something_unkeyed'), 'Few prices for this item');
  const fr = unesc(halfOf(sheet({ ...F.LOW_CONFIDENCE, basis: 'own_prices' }, {}, 'fr')).match(/data-vd-reason>([^<]*)</)?.[1]);
  assert.equal(fr, 'Peu de prix pour ce produit');
});

test('a medium-confidence verdict says so once, in the half detent', () => {
  const half = halfOf(sheet(F.MEDIUM_SALE_BULK));
  const reason = unesc(half.match(/data-vd-reason>([^<]*)</)?.[1]);
  assert.equal(reason, 'Fairly sure, not certain');
});

test('a confident verdict is unchanged: no reason line anywhere, the same two peek lines', () => {
  const html = sheet(F.GOOD);
  assert.doesNotMatch(html, /data-vd-reason|data-dist-conf/);
  const lines = peekLines(html);
  assert.equal(lines[0].cls, 'sub vd-line');
  assert.match(lines[0].text, /^\d+% (under|over) the typical price, Pexi's estimate \$[\d.]+$/);
});

test('the doubt that stays on the sheet: the mascot bubble speaks the hedged line, and the data attributes still say thin', () => {
  const html = sheet(F.LOW_CONFIDENCE);
  assert.match(html, /data-conf="thin"/);
  assert.match(html, /data-confidence="low"/);
  assert.match(html, /<p class="bubble-text">/);
});
