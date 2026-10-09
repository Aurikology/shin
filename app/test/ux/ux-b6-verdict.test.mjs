/**
 * UX build 6, the verdict sheet's first position. Spec: docs/design/ux-evidence-2026-10-09.md
 * section 13, build 6.
 *
 * BLOCKS COVERED: R-40 (what is on the first position, in what order, how tall),
 * R-41 (asking price, keep), R-42 (typical price rounded, labelled, verdict from
 * the rounded value), R-43 (range wording, keep + rounded ends + description),
 * R-44 (four verdict words, keep), R-45 (dots + word + plain reason together),
 * R-52 (market named on the verdict), R-56 (provenance in plain words),
 * R-69 (what low confidence looks like), R-70 (no asking price).
 *
 * EXPECTED TODAY (2026-10-09, before build 6 lands):
 *   RED until built: every test whose name has no "(keep)" in it, except where the
 *                    name says "(defect)".
 *   GREEN:           the "(keep)" tests, which hold what already ships.
 *   RED = DEFECT:    the "(defect)" tests, which are keep-block claims the shipped code
 *                    does not meet. They stay red; each one names the defect.
 *
 * Test names start with the block number and quote the spec's figure ("60%", "34 px",
 * "8 in 10") so a failure line says which promise broke.
 *
 * CONTRACT THE NEW MARKUP IS HELD TO (the spec names the things, not their markup, so
 * these are the only handles this file uses):
 *   - the confidence meter is three elements whose class or data-attribute name has
 *     "conf" and "dot" in it (e.g. class="conf-dot filled"), inside the first position,
 *     within a few hundred characters of the confidence word; "filled" / "on" /
 *     data-filled="true" marks a lit dot;
 *   - the asking price, the typical-price line, the bell, the confidence word, the item
 *     name and the one button are found by their TEXT, in reading order, not by class;
 *   - sizes come from the stylesheet that ships (tokens.css, camera.css) or the element's
 *     own attribute, never from a copy of the number.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FX, F, NAME, render, verdictWith, shopperBlock, dot, parts, plain, peekFlow, elementAt, elementsMatching, attr, svgOf, svgTexts,
  roundEstimateCents, usd, priceRe, declared, fontOf, px, rootTokens, CSS_FILES, parseRules, decls, money, store, withNow, VC,
} from './ux-b6-support.mjs';

const ZONE_WORD = /(?:Great|Good|Reasonable|Bad) price/;

/** Index of each landmark in `flow`, in order; fails naming the first missing or out-of-order one. */
function assertOrder(flow, marks, label) {
  let at = -1;
  for (const [name, re] of marks) {
    const m = re.exec(flow.slice(at + 1));
    assert.ok(m, `${label}: "${name}" is missing, or comes before the one above it. First position reads: ${flow}`);
    at = at + 1 + m.index;
  }
}

/** The first position as raw markup with the speech bubble and the face removed (they are Pexi's line, not layout). */
function peekRaw(html) {
  return parts(html).peek
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<p class="bubble-text">[\s\S]*?<\/p>/g, ' ')
    .replace(/<svg[^>]*class="face[^"]*"[\s\S]*?<\/svg>/g, ' ');
}

const buttonsIn = (fragment) => [...fragment.matchAll(/<button\b[\s\S]*?<\/button>/g)].map((m) => m[0]);

/* =============================================================== R-40 */

test('R-40 pass 60%: the first position is capped at 60% of the screen, so the frozen picture stays visible', () => {
  const rules = parseRules(CSS_FILES.camera).filter((r) => !r.media);
  const peekSelectors = new Set(['.sheet', '.sheet.dist', '.sheet.verdict', '.sheet[data-detent="peek"]', '.sheet.dist[data-detent="peek"]', '.sheet.verdict[data-detent="peek"]']);
  let cap = null;
  for (const r of rules) {
    if (!r.sel.split(',').some((s) => peekSelectors.has(s.trim()))) continue;
    const d = decls(r.body);
    if (d['max-height'] !== undefined) cap = d['max-height'];
  }
  assert.equal(cap, '60%', `the verdict sheet's first position has max-height ${cap}; the spec caps it at 60%`);
});

test('R-40 (keep) pass 72% / 90% / 92%: the middle position is 72% (90% for the bell sheet) and the full position 92%', () => {
  const rules = parseRules(CSS_FILES.camera).filter((r) => !r.media);
  const at = (sel) => {
    let v = null;
    for (const r of rules) if (r.sel.split(',').some((s) => s.trim() === sel)) v = decls(r.body)['max-height'] ?? v;
    return v;
  };
  assert.equal(at('.sheet[data-detent="half"]'), '72%');
  assert.equal(at('.sheet.dist[data-detent="half"]'), '90%');
  assert.equal(at('.sheet[data-detent="full"]'), '92%');
});

test('R-40 order: verdict word, asking price, typical-price line, bell, confidence label, item name, one button', () => {
  const flow = peekFlow(render(FX.HIGH));
  assertOrder(flow, [
    ['verdict word', ZONE_WORD],
    ['asking price $4.69', priceRe(469)],
    ["Pexi's estimate line", /Pexi's estimate/],
    ['the bell', /BELL/],
    ['confidence label', /Certain|Fairly sure|Not fully confident/],
    ['item name', new RegExp(NAME)],
    ['the one button', /Save it/],
  ], 'R-40 high confidence');
  assert.match(flow, /\d+% (?:under|over)/, "the typical-price line carries the shopper's percent difference");
});

test('R-40 order, low confidence: the not-fully-confident line and its reason come after the bell and before the item name', () => {
  const flow = peekFlow(render(FX.LOW));
  assertOrder(flow, [
    ['verdict word', ZONE_WORD],
    ['asking price $15.99', priceRe(1599)],
    ["Pexi's estimate line", /Pexi's estimate/],
    ['the bell', /BELL/],
    ['not fully confident line', /Not fully confident/],
    ['item name', new RegExp(NAME)],
    ['the one button', /Save it/],
  ], 'R-40 low confidence');
});

test('R-40 must not show: the brand pink, a savings word, the barcode digits, the thumbs, a second button', () => {
  for (const [name, v] of Object.entries({ HIGH: FX.HIGH, MEDIUM: FX.MEDIUM, LOW: FX.LOW, NO_PRICE: FX.NO_PRICE, SALE: FX.SALE, OUTSIDE: FX.OUTSIDE })) {
    const html = render(v);
    const raw = peekRaw(html);
    const buttons = buttonsIn(raw);
    assert.equal(buttons.length, 1, `${name}: the first position has ${buttons.length} buttons, the spec allows one wide button: ${buttons.map((b) => plain(b)).join(' | ')}`);
    assert.match(buttons[0], /\bwide\b/, `${name}: the one button is not the wide one`);
    assert.doesNotMatch(raw, /thumb/i, `${name}: thumbs are on the first position`);
    assert.doesNotMatch(raw, /brand/i, `${name}: the brand pink is referenced on the first position`);
    const text = plain(raw.replace(/<button\b[\s\S]*?<\/button>/g, ' '));
    assert.doesNotMatch(text, /\bsavings?\b|\byou (?:could |would |will )?sav|\bsaved? \$/i, `${name}: a savings word is on the first position: ${text}`);
    assert.doesNotMatch(text, /\d{8,}/, `${name}: a barcode-length digit run is on the first position: ${text}`);
  }
});

/* =============================================================== R-41 */

test('R-41 (keep) pass: the asking price is exactly what was typed, to two decimals, never rounded', () => {
  for (const cents of [469, 500, 1999, 5, 12345]) {
    const html = render(FX.HIGH, { typedCents: cents });
    const label = svgTexts(html).find((t) => t.cls.includes('vb-youlbl'))?.text;
    assert.equal(label, money(cents, 'CAD'), `typed ${cents}: the mark says ${label}`);
    assert.match(label, /\.\d\d$/, `${label} is not to two decimals`);
  }
  assert.equal(money(500, 'CAD'), '$5.00');
  assert.equal(money(1999, 'CAD'), '$19.99', 'a price near $20 stays $19.99');
  assert.equal(money(Number.NaN, 'CAD'), '--', 'a non-number is "--"');
  assert.equal(money(499, ''), '4.99', 'no symbol when the currency is unknown');
});

test('R-41 pass 72 px (defect): the price hero is the 72 px token (64 px under 380 px wide), weight 800, tabular figures', () => {
  // tokens.css declares the step; the hero must use it. camera.css `.price` hard-codes 64px at every width.
  assert.equal(rootTokens()['--t-price-size'], '72px');
  const narrow = parseRules(CSS_FILES.tokens).find((r) => r.media.includes('max-width: 379px') && decls(r.body)['--t-price-size']);
  assert.equal(decls(narrow.body)['--t-price-size'], '64px', 'the narrow-phone step');
  const size = declared('price', 'font-size');
  assert.ok(size === 'var(--t-price-size)' || size === '72px', `the .price hero is font-size ${size}, not the 72 px token, so it is 64 px on a wide phone`);
  assert.equal(declared('price', 'font-weight'), '800');
  assert.ok(/tabular-nums|var\(--figures\)/.test(declared('price', 'font-variant-numeric') ?? ''), 'tabular figures on the hero');
});

test('R-41 addition: the asking price sits in the first position with the caption "On the tag"', () => {
  const flow = peekFlow(render(FX.HIGH));
  assert.match(flow, priceRe(469), 'the shopper\'s $4.69 is not on the first position as text (only inside the bell)');
  assert.match(flow, /On the tag/, 'no "On the tag" caption under the price');
});

/* =============================================================== R-42 */

const STEPS = [
  [437, 'under $10: nearest 5 cents'],
  [996, 'under $10: nearest 5 cents, near the top'],
  [1237, '$10 to $100: nearest 10 cents'],
  [12349, 'above $100: nearest dollar'],
];

test('R-42 pass 5 cents / 10 cents / $1: the typical price is rounded, on the sheet and on the chart', () => {
  for (const [centre, why] of STEPS) {
    const rounded = roundEstimateCents(centre);
    const html = render(verdictWith({ centreCents: centre, sigmaLog: 0.2, confidence: 'high', n: 4, dots: FX.HIGH.dots, shopperCents: Math.round(centre * 0.9) }));
    const flow = peekFlow(html);
    assert.match(flow, priceRe(rounded), `${why}: ${centre} should read ${usd(rounded)} in the estimate line. Line: ${flow}`);
    assert.doesNotMatch(flow, priceRe(centre), `${why}: the unrounded ${usd(centre)} is still in the estimate line`);
    const chartCentre = svgTexts(html).find((t) => t.cls.includes('vb-lbl-centre'))?.text;
    assert.match(chartCentre, priceRe(rounded), `${why}: the chart's typical-price label reads ${chartCentre}`);
    assert.doesNotMatch(svgOf(html).match(/aria-label="([^"]*)"/)[1], priceRe(centre), `${why}: the chart description carries the unrounded estimate`);
  }
});

test('R-42 (keep) label: the typical price is worded as an estimate', () => {
  for (const [name, v] of Object.entries({ HIGH: FX.HIGH, LOW: FX.LOW, NO_PRICE: FX.NO_PRICE })) {
    assert.match(peekFlow(render(v)), /Pexi's estimate/, `${name}: the estimate label is gone`);
  }
});

test('R-42 pass: the verdict zone is computed from the rounded estimate, so the screen reproduces the verdict', () => {
  // centre 437 -> shown $4.35. The "good" cut is 20% under: 349.6 on 437 but 348.0 on 435.
  // A shelf price of 349 is "good" against the exact centre and "reasonable" against the number on screen.
  const v = verdictWith({ centreCents: 437, sigmaLog: 0.2, confidence: 'high', n: 4, dots: FX.HIGH.dots, shopperCents: 349 });
  assert.equal(v.shopper.zone, 'good', 'fixture: the server, working from the exact centre, says good');
  const html = render(v);
  assert.match(html, /data-zone="reasonable"/, 'the sheet kept the exact-centre zone instead of the one the shown $4.35 gives');
  assert.match(plain(html), /Reasonable price/);
  assert.doesNotMatch(plain(parts(html).peek), /Good price/);
});

test('R-42 pass: the percent shown is worked out from the rounded estimate, as a whole number', () => {
  // centre 102 -> shown $1.00. A shelf price of 80 is exactly 20% under $1.00 and 21.6% under the exact 102.
  const v = verdictWith({ centreCents: 102, sigmaLog: 0.1, confidence: 'high', n: 4, dots: [dot(100, 'Metro', '1 kg'), dot(104, 'Sobeys', '1 kg')], shopperCents: 80 });
  assert.equal(v.shopper.offByPct, -21.6, 'fixture: the server sends the exact-centre figure');
  const flow = peekFlow(render(v));
  assert.match(flow, /\b20% under/, `the percent should be 20 (from $1.00). Line: ${flow}`);
  assert.doesNotMatch(flow, /\b2[12]\.?\d* ?% under/, 'the exact-centre percent leaked onto the screen');
});

/* =============================================================== R-43 */

test('R-43 (keep) pass 8 in 10: the caption keeps "8 in 10" and "to", under the bell', () => {
  for (const [name, v] of Object.entries({ HIGH: FX.HIGH, LOW: FX.LOW, NO_PRICE: FX.NO_PRICE })) {
    const cap = plain(/<figcaption[\s\S]*?<\/figcaption>/.exec(render(v))?.[0] ?? '');
    assert.match(cap, /^Shaded: Pexi's estimate of 8 in 10 prices, \$[\d.,]+ to \$[\d.,]+$/, `${name}: caption is "${cap}"`);
  }
});

test('R-43 pass: both ends of the range are rounded the way the typical price is', () => {
  for (const v of [FX.HIGH, FX.LOW, FX.NO_PRICE, verdictWith({ centreCents: 437, sigmaLog: 0.2, dots: FX.HIGH.dots, shopperCents: 400 })]) {
    const lo = roundEstimateCents(v.p10Cents);
    const hi = roundEstimateCents(v.p90Cents);
    const cap = plain(/<figcaption[\s\S]*?<\/figcaption>/.exec(render(v))[0]);
    assert.equal(cap, `Shaded: Pexi's estimate of 8 in 10 prices, ${usd(lo)} to ${usd(hi)}`, `centre ${v.centreCents}: the ends should be ${usd(lo)} and ${usd(hi)}`);
    const html = render(v);
    const labels = Object.fromEntries(['p10', 'p90'].map((k) => [k, svgTexts(html).find((t) => t.open.includes(`data-vb-${k}`))?.text]));
    assert.equal(labels.p10, usd(lo), 'the chart label for the low end');
    assert.equal(labels.p90, usd(hi), 'the chart label for the high end');
  }
});

test('R-43 pass: the chart has an accessible description that says the same sentence', () => {
  for (const v of [FX.HIGH, FX.NO_PRICE]) {
    const lo = usd(roundEstimateCents(v.p10Cents));
    const hi = usd(roundEstimateCents(v.p90Cents));
    const label = attr(/<svg\b[^>]*>/.exec(svgOf(render(v)))[0], 'aria-label');
    assert.ok(label.includes(`Pexi's estimate of 8 in 10 prices, ${lo} to ${hi}`), `the description is "${label}"`);
  }
});

/* =============================================================== R-44 */

test('R-44 (keep) pass 34 px: four words, sentence case, bold, never an icon', () => {
  const cases = { great: 399, good: 469, reasonable: 600, bad: 760 };
  const words = { great: 'Great price', good: 'Good price', reasonable: 'Reasonable price', bad: 'Bad price' };
  for (const [zone, cents] of Object.entries(cases)) {
    const html = render(verdictWith({ confidence: 'high', n: 4, dots: FX.HIGH.dots, shopperCents: cents }));
    const h = /<h2 class="vword"[^>]*>([^<]*)<\/h2>/.exec(html);
    assert.ok(h, `${zone}: no verdict word heading`);
    assert.equal(h[1], words[zone]);
    assert.equal(h[1], h[1][0].toUpperCase() + h[1].slice(1).toLowerCase(), 'sentence case');
  }
  assert.equal(px(declared('vword', 'font-size')), 34, 'the verdict word is 34 px');
  assert.equal(declared('vword', 'font-weight'), 'var(--t-verdict-weight)');
  assert.equal(rootTokens()['--t-verdict-weight'], '800');
  assert.ok(!/uppercase/.test(declared('vword', 'text-transform') ?? ''), 'the verdict word is never shouting caps');
});

test('R-44 (keep) pass 108 px: the share card sets the word at 108', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../public/js/screens/share.js', import.meta.url), 'utf8');
  assert.match(src, /verdict:\s*108,/);
});

test('R-44 (keep): with no shopper price the headline is the item name, not a verdict word', () => {
  const html = render(FX.NO_PRICE);
  assert.equal(/<h2 class="vword[^"]*"[^>]*>([^<]*)<\/h2>/.exec(html)[1], NAME);
});

/* =============================================================== R-45 */

/** The raw first position around the confidence word, minus the face and the bell. */
function confRegion(html, wordRe) {
  const raw = peekRaw(html).replace(/<figure class="vbell"[\s\S]*?<\/figure>/, ' ');
  const i = raw.search(wordRe);
  assert.ok(i >= 0, `the confidence word ${wordRe} is not on the first position. It reads: ${peekFlow(html)}`);
  return raw.slice(Math.max(0, i - 700), i + 700);
}
const DOT_TAG = /<[a-z]+\b[^>]*(?:conf[\w-]*dot|dot[\w-]*conf)[^>]*>/gi;
const lit = (tag) => /\b(?:filled|on)\b/.test(attr(tag, 'class') ?? '') || /data-(?:filled|on)="true"/.test(tag);

const LEVELS = [
  ['high', FX.HIGH, /Certain/, 3],
  ['medium', FX.MEDIUM, /Fairly sure/, 2],
  ['low', FX.LOW, /Not fully confident/, 1],
];

test('R-45 pass: the first position says the confidence in a word: Certain, Fairly sure, Not fully confident', () => {
  for (const [level, v, re] of LEVELS) {
    assert.match(peekFlow(render(v)), re, `${level}: the confidence word is missing`);
  }
});

test('R-45 pass: a three-dot meter sits with the word, lit 3 / 2 / 1 for high / medium / low', () => {
  for (const [level, v, re, litCount] of LEVELS) {
    const region = confRegion(render(v), re);
    const dots = region.match(DOT_TAG) ?? [];
    assert.equal(dots.length, 3, `${level}: ${dots.length} confidence dots beside the word, the spec wants 3`);
    assert.equal(dots.filter(lit).length, litCount, `${level}: ${dots.filter(lit).length} lit dots, want ${litCount}`);
  }
});

test('R-45 pass 10 px / 6 px: each dot is 10 px across with 6 px between', () => {
  const region = confRegion(render(FX.HIGH), /Certain/);
  const first = (region.match(DOT_TAG) ?? [])[0];
  assert.ok(first, 'no confidence dot to measure');
  const tok = (attr(first, 'class') ?? '').split(/\s+/).find((c) => /dot/.test(c));
  const inline = attr(first, 'style') ?? '';
  const size = (p) => px(declared(tok, p)) ?? Number((new RegExp(`${p}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(inline) ?? [])[1] ?? NaN);
  assert.equal(size('width'), 10, 'dot width');
  assert.equal(size('height'), 10, 'dot height');
  const gaps = [declared(tok, 'margin-right'), declared(tok, 'margin-inline-end'), declared(tok, 'margin')].filter(Boolean).join(' ');
  const container = (attr(elementAt(region, region.indexOf(region.match(/<[a-z]+\b[^>]*conf[\w-]*(?:meter|dots)[^>]*>/i)?.[0] ?? '\u0000')), 'class') ?? '').split(/\s+/)[0];
  assert.ok(/\b6px\b|\b3px\b/.test(gaps) || px(declared(container, 'gap')) === 6, `no 6 px gap between dots (dot margins "${gaps}", container gap ${declared(container, 'gap')})`);
});

test('R-45 pass: never a number like "62%" for confidence', () => {
  for (const [level, v, re] of LEVELS) {
    const region = plain(confRegion(render(v), re));
    assert.doesNotMatch(region, /\d+\s?%/, `${level}: a percentage sits by the confidence word: ${region}`);
  }
});

test('R-45 pass: on low confidence the reason is in plain words with the count ("1 price found, blended with its category")', () => {
  const flow = peekFlow(render(FX.LOW));
  assert.match(flow, /1 price found, blended with its category/, `the reason line reads: ${flow}`);
});

/* =============================================================== R-52 */

test('R-52 pass: the comparison caption names the market: "Typical price in Canada, Pexi\'s estimate"', () => {
  store.pinMarket('CA');
  try {
    assert.equal(store.market().country, 'Canada', 'fixture: the market is Canada');
    const flow = peekFlow(render(FX.HIGH));
    assert.match(flow, /Typical price in Canada, Pexi's estimate/, `the line reads: ${flow}`);
  } finally {
    store.pinMarket(null);
  }
});

test('R-52 (keep) pass: the face never sits beside the estimate line', () => {
  const html = render(FX.HIGH);
  const { peek } = parts(html);
  const head = elementsMatching(peek, /<div class="sheet-head">/)[0];
  const line = peek.indexOf('data-dist-line');
  assert.ok(head && line > 0, 'the sheet head and the estimate line must both exist');
  assert.ok(line > head.index + head.html.length, 'the estimate line is inside the sheet head, next to the face');
  assert.doesNotMatch(peek.slice(head.index + head.html.length, line), /class="(?:face|shin-say)/, 'a face sits between the head and the estimate line');
});

test('R-52 (keep) pass: the market picker stays hidden', async () => {
  const { FLAGS } = await import('../../public/js/flags.js');
  assert.equal(FLAGS.market, false, 'the market flag is on; the You row and the picker would show');
});

test('R-52: with no market known the caption never prints "in undefined", "in null" or "in ,"', () => {
  store.pinMarket(null);
  let html = null;
  try {
    html = render(FX.HIGH);
  } catch (e) {
    return; // failing loudly is allowed
  }
  assert.doesNotMatch(plain(html), /\bin (?:undefined|null|NaN)\b|\bin ,/);
});

/* =============================================================== R-56 */

const NOW = '2026-10-09T00:30:00Z';
const PROV = [
  ['own_prices', { n: 3, basis: 'own_prices', confidence: 'high', dots: [dot(549, 'Save-On-Foods', '1 kg', '2026-10-06'), dot(599, 'Walmart', '1 kg', '2026-10-04'), dot(649, 'Metro', '1 kg', '2026-10-02')] }, /3 prices from 3 shops, newest 3 days ago/],
  ['other_size', { n: 1, basis: 'other_size', confidence: 'medium', dots: [] }, /Same product, other size, scaled/],
  ['leaf_category', { n: 0, basis: 'leaf_category', confidence: 'medium', dots: [] }, /Typical for its category/],
  ['brand_markup', { n: 0, basis: 'brand_markup', confidence: 'low', dots: [] }, /The brand's usual markup on its category/],
  ['claude_typical', { n: 0, basis: 'claude_typical', confidence: 'low', dots: [] }, /Pexi's own estimate; no shop prices found/],
];

test('R-56 pass: each source says where the estimate came from in plain words, with count and newest date', () => {
  withNow(NOW, () => {
    for (const [basis, over, re] of PROV) {
      const half = plain(parts(render(verdictWith({ ...over, shopperCents: 469 }))).half);
      assert.match(half, re, `${basis}: the provenance row is missing. The half position reads: ${half}`);
    }
  });
});

test('R-56 (keep) pass: the last two sources always carry the not-fully-confident line on the first position', () => {
  for (const basis of ['brand_markup', 'claude_typical']) {
    const over = PROV.find((p) => p[0] === basis)[1];
    const flow = peekFlow(render(verdictWith({ ...over, shopperCents: 469 })));
    assert.match(flow, /Not fully confident/, `${basis}: ${flow}`);
  }
});

test('R-56 pass 12 px: provenance is 12 px in the muted ink, not mono caps', () => {
  const html = render(FX.HIGH);
  const row = /<[a-z]+ class="([^"]*)"[^>]*data-vd-basis/.exec(html);
  assert.ok(row, 'no provenance row (data-vd-basis) in the half position');
  const cls = row[1].split(/\s+/).pop();
  assert.equal(px(declared(cls, 'font-size')) ?? fontOf(declared(cls, 'font') ?? '').size, 12, `${cls} is not 12 px`);
  const colour = declared(cls, 'color');
  assert.equal(colour, 'var(--ink-muted)', `${cls} colour is ${colour}`);
  assert.ok(!/uppercase/.test(declared(cls, 'text-transform') ?? ''), 'uppercase');
  assert.ok(!/mono/.test(declared(cls, 'font-family') ?? declared(cls, 'font') ?? ''), 'monospace');
});

/* =============================================================== R-69 */

test('R-69 (keep): low confidence is hollow, keeps the verdict hue, wears a plain face and has no shake', () => {
  for (const cents of [400, 470, 600, 760]) {
    const html = render(verdictWith({ ...FX.LOW, shopperCents: cents }));
    assert.match(html, /data-conf="thin"/, 'hollow');
    assert.doesNotMatch(html, /data-tier="unknown"/, 'a low-confidence verdict keeps its hue');
    assert.doesNotMatch(html, /data-state="(?:delighted|angry)"/, 'no intense face');
    assert.doesNotMatch(html, /shake|buzz|vibrat/i, 'no shake or buzz in the markup');
  }
  const thinRules = parseRules(CSS_FILES.camera).filter((r) => /data-conf="thin"/.test(r.sel));
  for (const r of thinRules) assert.doesNotMatch(r.body, /animation[^;]*shake/i, `${r.sel} shakes`);
});

test('R-69 (keep): the reason line is on the first position, not the half', () => {
  const { peek, half } = parts(render(FX.LOW));
  assert.match(plain(peek), /Not fully confident/);
  assert.doesNotMatch(plain(half), /Not fully confident:/, 'the reason is repeated only in the half');
});

test('R-69 (keep): the band covers what the engine says and is not clamped to the screen', () => {
  const html = render(verdictWith({ ...FX.LOW, sigmaLog: 0.9, centreCents: 1299, p10Cents: 300, p90Cents: 5600 }));
  const [w] = [Number(/viewBox="0 0 (\d+)/.exec(svgOf(html))[1])];
  const band = /class="vb-band" d="M([\d.]+) /.exec(svgOf(html));
  const xs = [...(/class="vb-band" d="([^"]*)"/.exec(svgOf(html))[1].matchAll(/(?:M|L)([\d.]+) /g))].map((m) => Number(m[1]));
  assert.ok(Math.min(...xs) >= 10 - 0.01 && Math.max(...xs) <= w - 10 + 0.01, 'the band leaves the chart');
  assert.ok(Math.max(...xs) - Math.min(...xs) > 0.3 * w, 'a very wide estimate should draw a wide band');
  assert.ok(band);
});

test('R-69 pass: the reason is specific ("1 price found, blended with its category"), not the generic "few prices"', () => {
  const flow = peekFlow(render(FX.LOW));
  assert.match(flow, /Not fully confident: 1 price found, blended with its category/);
});

/* =============================================================== R-70 */

test('R-70 (keep) pass: no asking price gives the bell without a mark, and no placeholder dot', () => {
  const html = render(FX.NO_PRICE);
  assert.match(html, /<figure class="vbell"/, 'the bell is there');
  assert.doesNotMatch(html, /vb-you|data-vb-you|vb-guide|vb-youdot/, 'a mark or ghost dot is drawn with no price');
  assert.doesNotMatch(plain(parts(html).peek), ZONE_WORD, 'a verdict word appears with no price');
});

test('R-70 pass: no colour field (and still no verdict word)', () => {
  const html = render(FX.NO_PRICE);
  assert.doesNotMatch(plain(parts(html).peek), ZONE_WORD, 'a verdict word appears with no price');
  assert.match(html, /data-conf="reading"/, 'the going-rate card sits on the neutral surface, not a solid or hollow verdict field');
  assert.match(html, /data-zone=""/);
});

test('R-70 pass: the range is the largest element, written "$A to $B" with rounded ends', () => {
  const html = render(FX.NO_PRICE);
  const lo = usd(roundEstimateCents(FX.NO_PRICE.p10Cents));
  const hi = usd(roundEstimateCents(FX.NO_PRICE.p90Cents));
  const raw = peekRaw(html).replace(/<figure class="vbell"[\s\S]*?<\/figure>/, ' ');
  const m = new RegExp(`<([a-z0-9]+)\\b([^>]*)>\\s*${lo.replace(/[$.]/g, '\\$&')} to ${hi.replace(/[$.]/g, '\\$&')}\\s*<`).exec(raw);
  assert.ok(m, `"${lo} to ${hi}" is not an element of its own on the first position. It reads: ${peekFlow(html)}`);
  const cls = (attr(`<x ${m[2]}>`, 'class') ?? '').split(/\s+/).filter(Boolean);
  const size = cls.map((c) => px(declared(c, 'font-size')) ?? fontOf(declared(c, 'font') ?? '').size).find((s) => s != null) ?? px(attr(`<x ${m[2]}>`, 'style')?.replace(/.*font-size:\s*/, ''));
  assert.ok(size >= 34, `the range is set at ${size} px; as the largest element it must be at least the 34 px of a verdict word`);
});

test('R-70 pass: "Based on 4 sellers" in small type', () => {
  const html = render(FX.NO_PRICE);
  assert.match(peekFlow(html), /Based on 4 sellers/);
  const m = /<([a-z0-9]+)\b([^>]*)>\s*Based on 4 sellers/.exec(peekRaw(html));
  const cls = (attr(`<x ${m[2]}>`, 'class') ?? '').split(/\s+/).filter(Boolean);
  const size = m[1] === 'small' ? 13 : cls.map((c) => px(declared(c, 'font-size')) ?? fontOf(declared(c, 'font') ?? '').size).find((s) => s != null);
  assert.ok(size != null && size <= 14, `the sellers line is ${size} px, want small type (14 or less)`);
});

test('R-70 pass: one button, "Tell me the price", and no price form', () => {
  const raw = peekRaw(render(FX.NO_PRICE));
  const buttons = buttonsIn(raw);
  assert.equal(buttons.length, 1, `buttons: ${buttons.map((b) => plain(b)).join(' | ')}`);
  assert.equal(plain(buttons[0]), 'Tell me the price');
  assert.doesNotMatch(raw, /<form|<input/, 'a price form is still on the card');
});

/* ---------------------------------------------- the same words, the other fixtures */

test('R-40..R-70 (keep): every fixture renders a sheet with a peek, a half and a full, and prints no placeholder text', () => {
  for (const [name, v] of Object.entries(FX)) {
    const html = render(v);
    parts(html);
    assert.doesNotMatch(plain(html), /\b(?:undefined|null|NaN)\b/, `${name}: placeholder text leaked`);
    assert.doesNotMatch(html, /<(?:h2|p|b|span|li)\b[^>]*>\s*<\/(?:h2|p|b|span|li)>/, `${name}: an empty element was printed`);
  }
  assert.ok(VC && F && shopperBlock && elementsMatching && withNow && CSS_FILES);
});
