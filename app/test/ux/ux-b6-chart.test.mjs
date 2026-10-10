/**
 * UX build 6, the chart: the shopper's mark, the store dots, sale dots, the axis, the sizes,
 * and the confidence fills. Spec: docs/design/ux-evidence-2026-10-09.md section 13, build 6.
 *
 * BLOCKS COVERED: R-67 (shopper mark: line, dot, bold label, ink colour), R-46 (store dots:
 * store, quantity, price, date), R-47 (sale dots: another shape, a word, outside the estimate),
 * R-64 (keep the log fit, no log tick numbers), R-65 (the face will not swamp the bell),
 * R-68 (minimum chart sizes), R-62 (keep the bell), R-66 (hollow against solid, keep).
 *
 * EXPECTED TODAY (2026-10-09, before build 6 lands):
 *   RED until built: every test whose name has no "(keep)" in it, except where it says "(defect)".
 *   GREEN:           the "(keep)" tests.
 *   RED = DEFECT:    the "(defect)" tests: a keep-block claim the shipped code does not meet.
 *
 * SIZES. The bell is an SVG in a viewBox; on a 360 px phone one viewBox unit is
 * (360 - 2 x sheet padding) / viewBox width screen pixels (`chartScale`). A spec size in px is
 * compared with the drawn size times that scale, so 12 px means 12 px on the glass, whichever
 * way the builder reaches it (attribute, stylesheet, or a viewBox that matches the content width).
 *
 * Not testable in node, so not here: that testers can read the shopper's position on a 360 x 640
 * phone (R-68), that a hollow bell reads as "less sure" (R-66), the log-against-linear reading
 * study (R-64), and the contrast of a mark on a live screen (computed from tokens.css instead).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FX, F, NAME, render, verdictWith, dot, parts, plain, svgOf, svgTexts, viewBox, attr, elementAt, elementsMatching, chartScale,
  declared, fontOf, px, decls, parseRules, CSS_FILES, THEMES, TIER_IDS, ratio, mix, usd, roundEstimateCents, VC, ALL, peekFlow,
} from './ux-b6-support.mjs';

/** Twelve prices spread across a wide bell, each short-named, so every label could fit on the bell today. */
const SPREAD12 = verdictWith({
  centreCents: 1000, sigmaLog: 0.5, confidence: 'high', n: 12,
  dots: Array.from({ length: 12 }, (_, i) => dot(Math.round(Math.exp(Math.log(1000) + (i - 5.5) * 0.18)), `S${i + 1}`, '1 kg')),
  shopperCents: 900,
});

/** Opening tags of `<name ...>` inside an SVG string. */
const tags = (svg, name) => [...svg.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((m) => m[0]);
const cls = (tag) => (attr(tag, 'class') ?? '').split(/\s+/).filter(Boolean);
const num = (tag, name) => {
  const v = attr(tag, name);
  return v == null ? null : Number(v);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/** The curve's y at x, by walking its sampled path. */
function curveYAt(svg, x) {
  const d = /class="vb-curve" d="([^"]*)"/.exec(svg)[1];
  const pts = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  for (let i = 1; i < pts.length; i += 1) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x >= x0 && x <= x1) return x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  throw new Error(`curveYAt(${x}): off the drawn curve`);
}

const baseOf = (svg) => num(tags(svg, 'line').find((t) => cls(t).includes('vb-axis')), 'y1');

/** The shopper's mark group, whole, from a rendered sheet. */
function youGroup(html) {
  const svg = svgOf(html);
  const g = elementsMatching(svg, /<g class="vb-you[^"]*"[^>]*>/)[0];
  assert.ok(g, 'no shopper mark (vb-you group) in the bell');
  return { svg, g: g.html };
}

/** The value of `prop` for an element: its own attribute, else the stylesheet for its class. */
function paint(tag, prop) {
  const own = attr(tag, prop);
  if (own != null) return own;
  for (const c of cls(tag)) {
    const v = declared(c, prop);
    if (v != null) return v;
  }
  return null;
}

/* =============================================================== R-67 */

test('R-67 (keep) the guide line is vertical, from the base of the bell up to the curve, at the price', () => {
  const html = render(FX.HIGH);
  const { svg, g } = youGroup(html);
  const line = tags(g, 'line')[0];
  assert.ok(line, 'no line in the mark');
  assert.equal(num(line, 'x1'), num(line, 'x2'), 'the line is not vertical');
  assert.equal(num(line, 'y2'), baseOf(svg), 'the line does not reach the base');
  assert.ok(near(num(line, 'y1'), curveYAt(svg, num(line, 'x1')), 1.5), `the line stops at y=${num(line, 'y1')}, the curve is at ${curveYAt(svg, num(line, 'x1'))}`);
});

test('R-67 pass 2 px: the line is 2 px and solid', () => {
  const html = render(FX.HIGH);
  const { g } = youGroup(html);
  const line = tags(g, 'line')[0];
  const w = Number(paint(line, 'stroke-width'));
  assert.ok(near(w * chartScale(html), 2, 0.25), `stroke-width ${w} draws ${(w * chartScale(html)).toFixed(2)} px, want 2`);
  const dash = paint(line, 'stroke-dasharray');
  assert.ok(dash == null || dash === 'none', `the line is dashed (${dash}); a dashed line reads as a guess`);
});

test('R-67 pass 12 px: a 12 px dot sits where the line meets the curve', () => {
  const html = render(FX.HIGH);
  const { svg, g } = youGroup(html);
  const line = tags(g, 'line')[0];
  const circle = tags(g, 'circle')[0];
  assert.ok(circle, 'no dot in the mark');
  const r = Number(paint(circle, 'r'));
  assert.ok(near(2 * r * chartScale(html), 12, 1.3), `the dot is ${(2 * r * chartScale(html)).toFixed(1)} px across, want 12`);
  assert.equal(num(circle, 'cx'), num(line, 'x1'), 'the dot is off the line');
  assert.ok(near(num(circle, 'cy'), curveYAt(svg, num(circle, 'cx')), 1.5), `the dot is at y=${num(circle, 'cy')}, the curve is at ${curveYAt(svg, num(circle, 'cx')).toFixed(1)}: it sits on the axis, not on the curve`);
});

test('R-67 pass 16 px: the price is bold, 16 px, and above the dot', () => {
  const html = render(FX.HIGH);
  const { g } = youGroup(html);
  const circle = tags(g, 'circle')[0];
  const label = [...g.matchAll(/<text\b[^>]*>[^<]*<\/text>/g)].map((m) => m[0])[0];
  assert.ok(label, 'no price label in the mark');
  const size = paint(label, 'font-size') ? px(paint(label, 'font-size')) : fontOf(paint(label, 'font') ?? '').size;
  const sizeAny = size ?? cls(label).map((c) => px(declared(c, 'font-size')) ?? fontOf(declared(c, 'font') ?? '').size).find((s) => s != null);
  assert.ok(near(sizeAny * chartScale(html), 16, 1.6), `the price is ${(sizeAny * chartScale(html)).toFixed(1)} px, want 16`);
  const weight = cls(label).map((c) => declared(c, 'font-weight') ?? fontOf(declared(c, 'font') ?? '').weight).find((w) => w != null) ?? attr(label, 'font-weight');
  assert.ok(Number(weight) >= 700, `font-weight ${weight} is not bold`);
  assert.ok(num(label, 'y') < num(circle, 'cy') - Number(paint(circle, 'r')), 'the price is not above the dot');
});

test("R-67 (D-227) pass: the mark takes the field's own ink, --tier-on on a solid field and --ink on the hollow one", () => {
  const html = render(FX.HIGH);
  const { g } = youGroup(html);
  const line = tags(g, 'line')[0];
  const circle = tags(g, 'circle')[0];
  const label = [...g.matchAll(/<text\b[^>]*>/g)].map((m) => m[0])[0];
  // The three parts draw in currentColor, so one colour on the group moves all of them together.
  for (const [part, c] of [['line stroke', paint(line, 'stroke')], ['dot fill', paint(circle, 'fill')], ['label fill', paint(label, 'fill')]]) {
    assert.equal(c, 'currentColor', `${part} is "${c}", want currentColor so it follows the group's colour`);
  }
  const rules = parseRules(CSS_FILES.camera).filter((r) => !r.media);
  const colourOf = (sel) => rules.map((r) => (r.sel === sel ? decls(r.body).color : undefined)).find((c) => c !== undefined);
  assert.equal(colourOf('.vb-you'), 'var(--tier-on)', 'on a solid field the mark is in that field\'s own --tier-on');
  assert.equal(colourOf('.sheet[data-conf="thin"] .vb-you'), 'var(--ink)', 'on the hollow field the mark is in --ink');
});

/*
 * D-227. The spec asked for ONE ink on every verdict field. The arithmetic says no ink can do
 * that: 4.5:1 on green #12B76A needs a text luminance of at most 0.043, and 4.5:1 on red #C23619
 * needs at least 0.715; no colour is both. So the mark is drawn in the colour already tuned to
 * its own field (--tier-on, held at 4.5 on the solid fields by tokens.test.mjs) and, on the
 * hollow field, which is a 12% tint of the ground, in --ink. Label 4.5 (16 px bold), line and
 * dot 3.0 (a graphic), in both themes, on all three verdict hues.
 */
test('R-67 [A] pass 3:1 / 4.5: the mark clears 3:1 as a graphic and 4.5 as 16 px bold text on every verdict field, both themes', () => {
  const bad = [];
  for (const [theme, T] of THEMES) {
    for (const tier of TIER_IDS) {
      const solid = T[`--${tier}`];
      const hollow = mix(solid, T['--ground'], 0.12);
      for (const [fill, field, ink] of [['solid', solid, T[`--${tier}-on`]], ['hollow', hollow, T['--ink']]]) {
        const r = ratio(ink, field);
        if (r < 4.5) bad.push(`${theme}/${tier}/${fill}: ${ink} on ${field} = ${r.toFixed(2)}`);
      }
    }
  }
  assert.deepEqual(bad, [], 'the mark misses the floor on these (the label needs 4.5, the line and dot 3.0, and 4.5 clears both)');
});

test('R-67 pass: at the edge the line becomes an arrow and the label reads "$17.99, 3x the typical price"', () => {
  const { g } = youGroup(render(FX.OUTSIDE));
  const texts = [...g.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
  assert.deepEqual(texts, ['$17.99, 3x the typical price'], `the mark's text is ${JSON.stringify(texts)}`);
  assert.match(g, /arrow/i, 'the pinned mark has no arrow');
});

test('R-67 (keep) pass: within 15% of the typical price the mark is still drawn in full', () => {
  const html = render(FX.NEAR);
  const { g } = youGroup(html);
  assert.equal(tags(g, 'line').length, 1);
  assert.equal(tags(g, 'circle').length, 1);
  assert.equal([...g.matchAll(/<text\b/g)].length, 1);
});

/* =============================================================== R-46 */

test('R-46 (keep) every store dot carries store, quantity, price and date, on the dot and in the list', () => {
  for (const [name, v] of Object.entries({ HIGH: FX.HIGH, SALE: FX.SALE })) {
    const html = render(v);
    const svg = svgOf(html);
    const titles = [...svg.matchAll(/<circle class="vb-dot[^"]*"[^>]*><title>([^<]*)<\/title>/g)].map((m) => plain(m[1]));
    assert.equal(titles.length, v.dots.length, `${name}: a dot per price`);
    const half = parts(html).half;
    v.dots.forEach((d, i) => {
      for (const [what, text] of [['store', d.store], ['quantity', d.quantity], ['price', usd(d.cents)], ['date', d.seenOn]]) {
        assert.ok(titles[i].includes(text), `${name} dot ${i}: the dot's title lacks the ${what} (${text}): ${titles[i]}`);
        assert.ok(plain(half).includes(text), `${name} dot ${i}: the list lacks the ${what} (${text})`);
      }
    });
  }
});

test('R-46 pass 4: at most four dots carry a label on the bell, however many prices there are', () => {
  for (const [name, v] of [['SPREAD12', SPREAD12], ['CROWDED', F.CROWDED], ['HIGH', FX.HIGH], ['SALE', FX.SALE]]) {
    const n = svgTexts(render(v)).filter((t) => t.cls.includes('vb-dotlbl')).length;
    assert.ok(n <= 4, `${name}: ${n} dot labels on the bell, the spec allows 4`);
  }
});

test('R-46 pass: a long store name is shortened with a middle ellipsis and the quantity is never cut off', () => {
  const v = verdictWith({
    confidence: 'high', n: 3,
    dots: [dot(549, 'Real Canadian Superstore', '1.75 L'), dot(599, 'Metro', '1 kg'), dot(649, 'Sobeys', '1 kg')],
    shopperCents: 469,
  });
  const labels = svgTexts(render(v)).filter((t) => t.cls.includes('vb-dotlbl')).map((t) => t.text);
  const long = labels.find((l) => l.startsWith('R'));
  assert.ok(long, `the long-named dot has no label: ${JSON.stringify(labels)}`);
  assert.ok(long.endsWith('1.75 L'), `the quantity is gone from "${long}"`);
  const e = long.indexOf('…');
  assert.ok(e > 1 && e < long.length - '1.75 L'.length - 2, `"${long}" is not shortened with an ellipsis in the middle of the store name`);
});

test('R-46 pass 72 px: a list row is 72 px tall with the price right-aligned in its own element and "Sale" as a tag', () => {
  const html = render(FX.SALE);
  const { half } = parts(html);
  const rows = elementsMatching(half, /<li class="vd-dotrow[^"]*"[^>]*>/);
  assert.equal(rows.length, 3, 'a row per price');
  const h = px(declared('vd-dotrow', 'min-height')) ?? px(declared('vd-dotrow', 'height'));
  assert.equal(h, 72, `a row is ${h} px tall`);
  const d = FX.SALE.dots[0];
  const row = rows[0].html;
  const els = elementsMatching(row, /<(?:span|div|p|b|small)\b[^>]*>/).map((e) => plain(e.html));
  assert.ok(els.includes(usd(d.cents)), `the price ${usd(d.cents)} is not an element of its own (elements: ${JSON.stringify(els)})`);
  const lineTwo = els.find((t) => t.includes(d.quantity) && t.includes(d.seenOn));
  assert.ok(lineTwo && !lineTwo.includes(usd(d.cents)), 'quantity and date are not a line of their own');
  const saleRow = rows.find((r) => /sale/i.test(attr(r.open, 'class')));
  assert.ok(elementsMatching(saleRow.html, /<(?:span|b|small)\b[^>]*>/).some((e) => plain(e.html) === 'Sale'), '"Sale" is not a tag of its own on the sale row');
});

/* =============================================================== R-47 */

const dotsOf = (html) => {
  const svg = svgOf(html);
  return [...svg.matchAll(/<(circle|path|polygon|rect|g)\b([^>]*data-vb-dot="(\d+)"[^>]*)>/g)].map((m) => ({ tag: m[1], open: m[0], i: Number(m[3]), sale: /vb-dot-sale/.test(m[2]) }));
};

test('R-47 pass: a sale dot is a diamond, a regular dot stays a circle', () => {
  const html = render(FX.SALE);
  const dots = dotsOf(html);
  assert.equal(dots.length, 3);
  for (const d of dots.filter((x) => !x.sale)) assert.equal(d.tag, 'circle', 'a regular dot is a circle');
  const sale = dots.find((d) => d.sale);
  assert.ok(sale, 'no sale dot');
  assert.notEqual(sale.tag, 'circle', 'the sale dot is a circle, the same shape as a regular one (it differs only by a dashed outline)');
  const diamond = sale.tag === 'polygon' ? (attr(sale.open, 'points').trim().split(/\s+/).length === 4)
    : sale.tag === 'path' ? ((attr(sale.open, 'd').match(/[ML]/gi) ?? []).length === 4 && /Z/i.test(attr(sale.open, 'd')))
      : sale.tag === 'rect' ? /rotate\(45/.test(attr(sale.open, 'transform') ?? '') : false;
  assert.ok(diamond, `the sale dot is a <${sale.tag}> but not a four-cornered diamond: ${sale.open}`);
});

test('R-47 pass: the sale dot is labelled with the word "Sale"', () => {
  const html = render(FX.SALE);
  const sale = dotsOf(html).find((d) => d.sale);
  const lbl = svgTexts(html).find((t) => attr(t.open, 'data-vb-dotlbl') === String(sale.i));
  assert.ok(lbl, 'the sale dot has no label on the bell');
  assert.match(lbl.text, /\bSale\b/);
});

test('R-47 pass: the caption under the list says "Sale prices are not in the estimate."', () => {
  const { half } = parts(render(FX.SALE));
  const text = plain(half);
  const after = text.slice(text.lastIndexOf(FX.SALE.dots[2].seenOn));
  assert.match(after, /Sale prices are not in the estimate\./, `after the list the sheet says: ${after}`);
});

test('R-47 (keep) pass: a sale price never moves the estimate', () => {
  const withSale = FX.SALE;
  const without = { ...FX.SALE, dots: FX.SALE.dots.filter((d) => d.kind !== 'sale') };
  const a = render(withSale);
  const b = render(without);
  const curve = (h) => /class="vb-curve" d="([^"]*)"/.exec(h)[1];
  assert.equal(curve(a), curve(b), 'the bell changed when a sale dot was removed');
  const line = (h) => plain(/data-dist-line>([^<]*)</.exec(h)[1]);
  assert.equal(line(a), line(b), 'the typical-price line changed');
  const centre = (h) => svgTexts(h).find((t) => t.cls.includes('vb-lbl-centre')).text;
  assert.equal(centre(a), centre(b), 'the typical-price label changed');
  assert.match(plain(parts(a).half), /\bSale\b/, 'the list does not say which row is the sale');
});

/* =============================================================== R-64 */

test('R-64 (keep) pass: no axis numerals; the only dollar labels are the band ends, the typical price and the shopper\'s price', () => {
  for (const [name, v] of Object.entries(FX)) {
    const html = render(v);
    const texts = svgTexts(html);
    for (const t of texts) {
      assert.doesNotMatch(t.text, /^[\d.,\s]+$/, `${name}: a bare number "${t.text}" is drawn as a tick label`);
      assert.doesNotMatch(t.cls, /tick|axis/, `${name}: a tick or axis label (${t.cls})`);
    }
    const money = texts.filter((t) => /\$\d/.test(t.text));
    const allowed = money.filter((t) => /data-vb-(?:p10|p90|centre)/.test(t.open) || t.cls.includes('vb-youlbl'));
    assert.deepEqual(money.map((t) => t.text), allowed.map((t) => t.text), `${name}: dollar labels beyond the marks: ${money.map((t) => t.text).join(', ')}`);
    assert.ok(money.length === (v.shopper ? 4 : 3), `${name}: ${money.length} dollar labels, want ${v.shopper ? 4 : 3}`);
  }
});

test('R-64 (keep) pass: the bell is a normal curve on log price (symmetric about the typical price in log space)', () => {
  for (const [name, v] of Object.entries({ HIGH: FX.HIGH, LOW: FX.LOW, SALE: FX.SALE })) {
    const u = VC.usableVerdict(v);
    const g = VC.bellGeometry(u);
    assert.ok(near(g.centreX - g.p10X, g.p90X - g.centreX, 0.6), `${name}: the band is not centred on the typical price on a log axis (${g.centreX - g.p10X} vs ${g.p90X - g.centreX})`);
    assert.equal(VC.bellHeight(u.centreCents, Math.log(u.centreCents), u.sigmaLog), 1);
    assert.ok(near(VC.bellHeight(Math.exp(Math.log(u.centreCents) + u.sigmaLog), Math.log(u.centreCents), u.sigmaLog), Math.exp(-0.5), 1e-9));
  }
  // the spec's own widths: 10th to 90th range is exp(2 x 1.2816 x spread) times
  const times = (s) => Math.exp(2 * VC.Z90 * s);
  assert.equal(times(0.15).toFixed(2), '1.47');
  assert.equal(times(0.3).toFixed(2), '2.16');
  assert.equal(times(0.5).toFixed(1), '3.6');
});

/* =============================================================== R-65 */

test('R-65 (keep) pass: no bold line through the middle of the bell, and the typical price is always worded as an estimate', () => {
  const html = render(FX.HIGH);
  const centre = tags(svgOf(html), 'line').find((t) => cls(t).includes('vb-centre'));
  assert.ok(centre, 'fixture: the centre line exists');
  assert.ok(Number(paint(centre, 'stroke-width')) <= 1.5, 'the middle line is bold');
  assert.ok(paint(centre, 'stroke-dasharray') && paint(centre, 'stroke-dasharray') !== 'none', 'the middle line is not dashed, so it looks like a fact');
  const text = plain(peekFlow(html).replace(/BELL/, ' '));
  for (const figure of [usd(599), usd(roundEstimateCents(599))]) {
    for (let at = text.indexOf(figure); at >= 0; at = text.indexOf(figure, at + 1)) {
      assert.match(text.slice(Math.max(0, at - 70), at + figure.length), /estimate/i, `${figure} appears without the word "estimate" near it`);
    }
  }
});

test('R-65 (keep) pass: at low confidence the face is plain and the band is wide', () => {
  const low = render(FX.LOW);
  assert.doesNotMatch(low, /data-state="(?:delighted|angry)"/);
  const ratioOf = (v) => v.p90Cents / v.p10Cents;
  assert.ok(ratioOf(FX.LOW) > 1.5 * ratioOf(FX.HIGH), 'fixture: the low-confidence bell is wider in dollars');
  const caption = plain(/<figcaption[\s\S]*?<\/figcaption>/.exec(low)[0]);
  assert.match(caption, /\$[\d.,]+ to \$[\d.,]+/, 'both dollar ends are written under the bell');
});

/* =============================================================== R-68 */

test('R-68 (keep) pass 120 px / 300 px: the chart is at least 120 px tall and as wide as the sheet\'s content on a 360 px phone', () => {
  for (const [name, v] of ALL) {
    const html = render(v);
    const [vbW, vbH] = viewBox(html);
    const scale = chartScale(html);
    assert.ok(vbH * scale >= 120, `${name}: the chart is ${(vbH * scale).toFixed(0)} px tall`);
    assert.ok(vbW * scale >= 300, `${name}: the chart is ${(vbW * scale).toFixed(0)} px wide on a 360 px screen`);
    assert.match(/<svg\b[^>]*>/.exec(svgOf(html))[0], /width="100%"/, `${name}: the chart does not take the full content width`);
  }
});

test('R-68 pass 10 px: every dot is 10 px or more across', () => {
  const html = render(FX.SALE);
  const scale = chartScale(html);
  const small = [];
  for (const t of tags(svgOf(html), 'circle').filter((c) => cls(c).includes('vb-dot'))) {
    const px_ = 2 * Number(paint(t, 'r')) * scale;
    if (px_ < 10) small.push(`${cls(t).join('.')} ${px_.toFixed(1)} px`);
  }
  assert.deepEqual(small, [], 'dots under 10 px across');
});

test('R-68 pass 12 px: every label on the chart is at least 12 px', () => {
  const html = render(FX.SALE);
  const scale = chartScale(html);
  const used = new Set(svgTexts(render(verdictWith({ ...FX.SALE, shopperCents: 1799, shopperExtra: { beyond: 'high' } }))).flatMap((t) => t.cls.split(/\s+/)).concat(svgTexts(html).flatMap((t) => t.cls.split(/\s+/))));
  const small = [];
  for (const c of used) {
    const size = px(declared(c, 'font-size')) ?? fontOf(declared(c, 'font') ?? '').size;
    if (size == null) continue;
    const onGlass = c === 'vb-cap' ? size : size * scale;
    if (onGlass < 12) small.push(`${c} ${onGlass.toFixed(1)} px`);
  }
  small.push(...(px(declared('vb-cap', 'font-size')) ?? fontOf(declared('vb-cap', 'font') ?? '').size) < 12 ? [`vb-cap ${fontOf(declared('vb-cap', 'font') ?? '').size} px`] : []);
  assert.deepEqual([...new Set(small)], [], 'labels under 12 px');
});

test('R-68 pass 4: no more than four labels on dots at once, whatever the data', () => {
  for (const [name, v] of [...ALL, ['SPREAD12', SPREAD12], ['CROWDED', F.CROWDED]]) {
    const n = svgTexts(render(v)).filter((t) => t.cls.includes('vb-dotlbl')).length;
    assert.ok(n <= 4, `${name}: ${n} dot labels`);
  }
});

test('R-68 (keep) pass 3:1: the marks clear 3:1 against the field they sit on, both themes, whatever colour the build paints them', () => {
  const bad = [];
  const html = render(FX.HIGH);
  const marks = [
    ['curve', tags(svgOf(html), 'path').find((t) => cls(t).includes('vb-curve')), 'stroke'],
    ['regular dot', tags(svgOf(html), 'circle').find((t) => cls(t).includes('vb-dot-regular')), 'fill'],
  ];
  for (const [theme, T] of THEMES) {
    for (const tier of TIER_IDS) {
      const solid = T[`--${tier}`];
      const fields = { solid: [solid, T[`--${tier}-on`]], hollow: [mix(solid, T['--ground'], 0.14), T[`--${tier}-bright`]] };
      for (const [fill, [field, text]] of Object.entries(fields)) {
        for (const [what, tag, prop] of marks) {
          const c = paint(tag, prop);
          const colour = /--ink\b/.test(c) ? T['--ink'] : text;
          const r = ratio(colour, field);
          if (r < 3) bad.push(`${theme}/${tier}/${fill}: ${what} ${r.toFixed(2)}`);
        }
      }
    }
  }
  assert.deepEqual(bad, []);
});

/* =============================================================== R-62 */

test('R-62 (keep): the bell stays: a curve, the shaded 8-in-10 band, the shopper\'s mark where it falls, and a dot per recorded price', () => {
  const html = render(FX.HIGH);
  const svg = svgOf(html);
  assert.match(svg, /class="vb-curve"/);
  assert.match(svg, /class="vb-band"/);
  const u = VC.usableVerdict(FX.HIGH);
  const g = VC.bellGeometry(u);
  const youdot = tags(svg, 'circle').find((t) => cls(t).includes('vb-youdot'));
  assert.ok(near(num(youdot, 'cx'), g.x(469), 0.6), 'the mark is not where $4.69 falls');
  assert.equal(tags(svg, 'circle').filter((t) => cls(t).includes('vb-dot')).length, FX.HIGH.dots.length, 'one dot per price, no dot strip (R-63 is not for version 1)');
});

/* =============================================================== R-66 */

test('R-66 (keep) pass: only three fills ever reach a verdict sheet: certain, sure, thin, for high, medium, low', () => {
  const seen = new Map();
  for (const [name, v] of ALL) seen.set(v.confidence, new Set([...(seen.get(v.confidence) ?? []), /data-conf="(\w+)"/.exec(render(v))[1]]));
  assert.deepEqual([...seen.get('high')], ['certain']);
  assert.deepEqual([...seen.get('medium')], ['sure']);
  assert.deepEqual([...seen.get('low')], ['thin']);
});

test('R-66 pass (defect): certain and fairly sure share one solid look and differ only by the dots and the word', () => {
  const rules = parseRules(CSS_FILES.camera).filter((r) => !r.media);
  const look = (sel) => decls(rules.find((r) => r.sel === sel).body);
  const certain = look('.sheet[data-conf="certain"]');
  const sure = look('.sheet[data-conf="sure"]');
  assert.deepEqual(sure, certain, 'camera.css gives "sure" an inner hairline that "certain" lacks: a fourth look, which the spec forbids');
});

test('R-66 pass 12% (defect): the hollow fill is a 12% tint of the hue', () => {
  const rules = parseRules(CSS_FILES.camera).filter((r) => !r.media);
  const bg = decls(rules.find((r) => r.sel === '.sheet[data-conf="thin"]').body).background;
  const pct = Number(/var\(--tier\)\s+(\d+)%/.exec(bg)?.[1]);
  assert.equal(pct, 12, `the hollow fill is ${pct}% ("${bg}"); the spec and the design say 12. tokens.test.mjs pins 14, so one of the two documents is wrong`);
});

test('R-66 (keep) pass 2 px: the hollow sheet has a 2 px border in the hue', () => {
  const rules = parseRules(CSS_FILES.camera).filter((r) => !r.media);
  const d = decls(rules.find((r) => r.sel === '.sheet[data-conf="thin"]').body);
  assert.match(d.border, /^2px solid var\(--tier\)$/);
});
