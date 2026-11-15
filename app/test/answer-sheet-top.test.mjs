/**
 * The answer sheet's top and chart (comms 2026-11-14, Jamin's build-7 store walk, sections 2 and 3):
 * the verdict word and the price whole, the product name right under them (before the chart),
 * the pack photo beside the name and not in a corner, one plain "Usually $7.95 to $9.05" line instead
 * of the report-like captions, and a chart whose labels do not crowd: the size said once, no lone
 * "Sale", no range-end numbers stacked under the shopper's price.
 *
 * The 390 x 844 fit (verdict, price, name and button with no scrolling) is checked in a browser by
 * scripts, not here; this file pins the markup order and wording that fit depends on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { distributionSheet, cam, verdictWith, dot, plain } from './ux/ux-b6-support.mjs';

const NUTELLA = verdictWith({
  centreCents: 850,
  sigmaLog: 0.09,
  p10Cents: 795,
  p90Cents: 905,
  confidence: 'medium',
  n: 3,
  dots: [dot(795, 'Walmart', '276g'), dot(850, 'Loblaws', '276g'), dot(905, 'Save-On-Foods', '276g', '2026-11-10', 'sale')],
  shopperCents: 900,
});
const NAME = 'Nutella BISCUITS, Golden Cookies Filled with Rich Hazelnut Spread, Pack of 20 Cookies 276g';
const THUMB = 'data:image/jpeg;base64,AAAA';
const sheet = (v = NUTELLA, o = {}) => distributionSheet(v, { name: NAME, thumb: THUMB, ...o });
const peekOf = (html) => html.slice(html.indexOf('<div class="sheet-peek">'), html.indexOf('<div class="sheet-half">'));
const at = (html, needle) => {
  const i = html.indexOf(needle);
  assert.ok(i >= 0, `missing ${needle}`);
  return i;
};

test('the peek reads in the order the shopper needs it: word, price, name, chart, button', () => {
  const peek = peekOf(sheet());
  const order = ['data-dist-headline', 'class="price"', 'data-dist-name', 'data-dist-chart', 'data-act="dist-save"'].map((n) => at(peek, n));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), `peek order: ${order.join(' < ')}`);
});

test('the pack photo sits beside the name, not in the corner of the price row', () => {
  const html = sheet();
  const head = html.slice(at(html, 'class="sheet-head"'), at(html, 'class="vd-name-row"'));
  assert.doesNotMatch(head, /scan-thumb/, 'the photo is still in the price row, next to the close button');
  const row = html.slice(at(html, 'class="vd-name-row"'), at(html, 'data-dist-name'));
  assert.match(row, /scan-thumb/, 'the photo is not in the name row');
});

test('one plain line says the usual range, and the two report-like captions are gone', () => {
  const html = sheet();
  const line = plain(html.match(/data-dist-typical>([\s\S]*?)<\/p>/)[1]);
  assert.equal(line, 'Usually $7.95 to $9.05');
  assert.doesNotMatch(html, /<figcaption/, 'the bell still carries a caption');
  assert.doesNotMatch(plain(html), /Shaded|Typical price in Canada|Pexi's estimate of 8 in 10/);
});

test('the usual line is in French too', () => {
  const store = globalThis.localStorage;
  store.setItem('shin.locale', 'fr');
  try {
    const html = sheet();
    const line = plain(html.match(/data-dist-typical>([\s\S]*?)<\/p>/)[1]);
    assert.match(line, /^En général de 7,95\s\$ à 9,05\s\$$/);
  } finally {
    store.removeItem('shin.locale');
  }
});

test('the going-rate card (no price yet) keeps its range as the big number and gets no caption either', () => {
  const html = distributionSheet(verdictWith({ centreCents: 850, sigmaLog: 0.09, p10Cents: 795, p90Cents: 905, shopper: null, n: 3 }), { name: NAME });
  assert.match(html, /data-dist-range/);
  assert.doesNotMatch(html, /<figcaption/);
});

const chartTexts = (html) => [...html.matchAll(/<text class="([^"]*)"[^>]*>([^<]*)<\/text>/g)].map((m) => ({ cls: m[1], text: m[2] }));

test('chart labels: the size is said once (in the name), never under every shop', () => {
  const labels = chartTexts(sheet()).filter((t) => t.cls.includes('vb-dotlbl')).map((t) => t.text);
  assert.ok(labels.length >= 2, `labels: ${JSON.stringify(labels)}`);
  for (const l of labels) assert.doesNotMatch(l, /276/, `"${l}" repeats the size`);
});

test('chart labels: shops that list different sizes keep the size, so the shopper can tell them apart', () => {
  const v = verdictWith({ centreCents: 850, sigmaLog: 0.09, dots: [dot(795, 'Walmart', '276g'), dot(850, 'Loblaws', '500g')], shopperCents: 900 });
  const labels = chartTexts(distributionSheet(v, { name: NAME })).filter((t) => t.cls.includes('vb-dotlbl')).map((t) => t.text);
  assert.deepEqual(labels.sort(), ['Loblaws 500g', 'Walmart 276g']);
});

test('chart labels: no lone "Sale" at the edge; the sale shop says it in its own label', () => {
  const texts = chartTexts(sheet());
  assert.equal(texts.filter((t) => t.cls.includes('vb-lane')).length, 0, 'a lone Sale lane label is back');
  assert.ok(texts.some((t) => t.cls.includes('vb-dotlbl') && /^Sale Save-On-Foods$/.test(t.text)), JSON.stringify(texts.map((t) => t.text)));
});

test('chart labels: the range ends are not stacked under the price marker; only the typical price is on the axis', () => {
  const texts = chartTexts(sheet());
  assert.equal(texts.filter((t) => /vb-lbl(\s|$)/.test(t.cls) && !t.cls.includes('vb-lbl-centre')).length, 0, 'range-end numbers are back under the chart');
  assert.deepEqual(texts.filter((t) => t.cls.includes('vb-lbl-centre')).map((t) => t.text), ['$8.50']);
  assert.ok(texts.some((t) => t.cls.includes('vb-youlbl') && t.text === '$9.00'), 'the shopper price marker is gone');
});

test('the typical price and the range are still in the chart description for a screen reader', () => {
  const html = sheet();
  const alt = html.slice(html.indexOf('data-verdict-bell')).match(/role="img" aria-label="([^"]*)"/)[1];
  assert.match(alt, /\$8\.50/);
  assert.match(alt, /\$7\.95 to \$9\.05/);
});

test('exports used by this file exist', () => {
  assert.equal(typeof cam.distributionSheet, 'function');
});
