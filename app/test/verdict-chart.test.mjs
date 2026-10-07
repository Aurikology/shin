/**
 * THE PRICE VERDICT BELL: the curve math, the contract-to-screen mapping, and
 * the sheet that draws it.
 *
 * RULINGS.md "V1 verdict screen mechanics" (Jamin, 2026-09-30): "an animated
 * normal distribution chart and where their product price falls on it. It
 * will ALWAYS provide the answer(unless the user runs out of scans)", and "The
 * verdict speaks his words against the shopper's own thresholds". Built to
 * docs/verdict-distribution-design-2026-09-30.md, "The response contract",
 * against the fixtures in test/verdict-fixtures.mjs. What this file holds shut:
 *
 *   - the bell is an exact normal on LOG price: its 10th and 90th percentiles
 *     are exp(mu -/+ 1.2816 sigmaLog), checked against the normal CDF;
 *   - the server's numbers are drawn as sent; the client never works out a
 *     centre or a spread, only a zone for a price typed after the answer;
 *   - his four zones at his default thresholds, inclusive on the named side;
 *   - every case in the design's list the screen owns: no price yet, suspect,
 *     beyond (pinned, with the multiple), sale dots apart, dot labels, the
 *     bigger pack, notes, low or medium confidence, a better answer later;
 *   - every answer that carries a verdict ends in the bell on every route
 *     (barcode, typed, price), never in a refusal sheet;
 *   - both languages, no em dash, never "saved";
 *   - the motion is CSS that rests on its final state, off under
 *     prefers-reduced-motion, and the shopper's dot never slides.
 *
 * NOT VERIFIED HERE: how it looks. The Playwright walk at 390 x 844 is.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

const VC = await import('../public/js/lib/verdict-chart.js');
const {
  Z90, Z99, usableVerdict, zoneFor, shopperFor, shopperOf, multipleOf, bellHeight, logDomain, bellGeometry, bellSvg,
  placeLabels, spreadLabels, tweenVerdict, ZONE_TIER, DEFAULT_THRESHOLDS,
} = VC;
const F = await import('./verdict-fixtures.mjs');
const { distributionSheet, catalogueSheet, distFace } = await import('../public/js/screens/camera.js');
const { t } = await import('../public/js/ui-strings.js');

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const unesc = (s) => s?.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (html, name) => html.match(new RegExp(`<section class="sheet verdict dist"[^>]*\\b${name}="([^"]*)"`))?.[1];
const between = (html, marker) => unesc(html.match(new RegExp(`${marker}>([^<]*)<`))?.[1]);
const ariaOf = (html) => unesc(html.match(/data-verdict-bell[^>]*>\s*<svg[^>]*aria-label="([^"]*)"/)?.[1]);
const NB = ' ';

/** Standard normal CDF (Abramowitz and Stegun 7.1.26, error under 1.5e-7). */
function phi(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const k = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * k - 1.453152027) * k) + 1.421413741) * k - 0.284496736) * k + 0.254829592) * k * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/* ============================================================== the math == */

test('the constants are the normal\'s own 90th and 99th percentiles, checked against the CDF', () => {
  assert.ok(Math.abs(phi(Z90) - 0.9) < 1e-6);
  assert.ok(Math.abs(phi(Z99) - 0.99) < 1e-6);
  // The control: the 75th-percentile constant, a plausible slip, fails the same check.
  assert.ok(Math.abs(phi(0.6745) - 0.9) > 0.1);
});

test('on the log axis the bell is an exact normal: p10 and p90 are exp(mu -/+ 1.2816 sigma), a tenth of the mass outside each', () => {
  const v = usableVerdict(F.NO_PRICE);
  const mu = Math.log(v.centreCents);
  assert.ok(Math.abs(Math.log(v.p10Cents) - (mu - Z90 * v.sigmaLog)) < 0.002);
  assert.ok(Math.abs(Math.log(v.p90Cents) - (mu + Z90 * v.sigmaLog)) < 0.002);
  assert.ok(Math.abs(phi((Math.log(v.p10Cents) - mu) / v.sigmaLog) - 0.1) < 0.002);
  // Height: 1 at the centre, exp(-1/2) one sigma out on log price, symmetric in the log.
  assert.equal(bellHeight(v.centreCents, mu, v.sigmaLog), 1);
  const up = Math.exp(mu + v.sigmaLog);
  const down = Math.exp(mu - v.sigmaLog);
  assert.ok(Math.abs(bellHeight(up, mu, v.sigmaLog) - Math.exp(-0.5)) < 1e-12);
  assert.ok(Math.abs(bellHeight(down, mu, v.sigmaLog) - bellHeight(up, mu, v.sigmaLog)) < 1e-12);
  // And it is NOT symmetric in dollars, which is what a linear-axis bug would draw.
  assert.ok(up - v.centreCents > v.centreCents - down);
});

test('p10 and p90 are drawn as sent; worked out from mu and sigma only when the wire lacks them', () => {
  const sent = usableVerdict({ ...F.NO_PRICE, p10Cents: 500, p90Cents: 700 });
  assert.equal(sent.p10Cents, 500);
  assert.equal(sent.p90Cents, 700);
  const bare = usableVerdict({ ...F.NO_PRICE, p10Cents: undefined, p90Cents: undefined });
  assert.ok(Math.abs(bare.p10Cents - Math.exp(Math.log(599) - Z90 * 0.18)) < 1e-9);
  // The centre and spread are never changed by the client.
  assert.equal(usableVerdict(F.GOOD).centreCents, F.GOOD.centreCents);
  assert.equal(usableVerdict(F.GOOD).sigmaLog, F.GOOD.sigmaLog);
});

test('a verdict that cannot be drawn is not drawn at all; optional fields default', () => {
  for (const bad of [null, {}, { ...F.GOOD, kind: 'range' }, { ...F.GOOD, centreCents: 0 }, { ...F.GOOD, sigmaLog: -1 }, { ...F.GOOD, sigmaLog: 'x' }, { ...F.GOOD, p10Cents: 900, p90Cents: 100 }]) {
    assert.equal(usableVerdict(bad), null, JSON.stringify(bad)?.slice(0, 60));
  }
  const v = usableVerdict({ kind: 'distribution', centreCents: 500, sigmaLog: 0.2 });
  assert.deepEqual(v.dots, []);
  assert.equal(v.shopper, null);
  assert.deepEqual(v.thresholds, DEFAULT_THRESHOLDS);
  assert.equal(v.confidence, 'low', 'an unstated confidence is never shown as sure');
  const many = usableVerdict({ ...F.CROWDED });
  assert.equal(many.dots.length, 12, 'the contract caps dots at 12');
  assert.deepEqual(usableVerdict({ ...F.GOOD, notes: ['old_prices', 'made_up'] }).notes, ['old_prices']);
});

test('his zones at his default thresholds, each boundary inclusive on the named side', () => {
  const c = 1000;
  assert.equal(zoneFor(700, c), 'great'); // exactly 30% under
  assert.equal(zoneFor(701, c), 'good');
  assert.equal(zoneFor(800, c), 'good'); // exactly 20% under
  assert.equal(zoneFor(801, c), 'reasonable');
  assert.equal(zoneFor(1199, c), 'reasonable');
  assert.equal(zoneFor(1200, c), 'bad'); // exactly 20% over
  // The shopper's own thresholds replace his defaults.
  assert.equal(zoneFor(850, c, { greatPct: 40, goodPct: 10, badPct: 5 }), 'good');
  assert.equal(zoneFor(1060, c, { greatPct: 40, goodPct: 10, badPct: 5 }), 'bad');
  assert.deepEqual(ZONE_TIER, { great: 'good', good: 'good', reasonable: 'fair', bad: 'walk_away' });
});

test('a price typed after the answer: zone, beyond past p1/p99, suspect when x100 or /100 lands inside p10 to p90', () => {
  const v = usableVerdict(F.NO_PRICE);
  const s = shopperFor(469, v);
  assert.equal(s.zone, 'good');
  assert.equal(s.offByPct, -21.7);
  assert.equal(s.beyond, null);
  assert.equal(s.suspect, null);
  const far = shopperFor(1799, v);
  assert.equal(far.beyond, 'high');
  assert.equal(far.suspect, null, 'x100 and /100 of 17.99 land nowhere near');
  const typo = shopperFor(59900, v);
  assert.deepEqual(typo.suspect, { suggestCents: 599 });
  const cents = shopperFor(6, v); // $0.06 for a $5.99 item: read as cents
  assert.deepEqual(cents.suspect, { suggestCents: 600 });
  assert.equal(shopperFor(0, v), null);
  // The server's shopper is drawn as sent, zone filled only when missing.
  assert.equal(shopperOf(usableVerdict(F.GOOD)).zone, 'good');
  assert.equal(shopperOf(usableVerdict({ ...F.GOOD, shopper: { ...F.GOOD.shopper, zone: null } })).zone, 'good');
});

test('the multiple a pinned price is of the typical price', () => {
  assert.equal(multipleOf(1799, 599), '3');
  assert.equal(multipleOf(119, 599), '0.2');
  assert.equal(multipleOf(59900, 599), '100');
  assert.equal(multipleOf(900, 600), '1.5');
});

test('the axis spans centre -/+ 3 sigma on log price, widens for evidence, pins what is past 4.5 sigma', () => {
  const v = usableVerdict(F.BEYOND_HIGH);
  const d = logDomain(v);
  assert.ok(d.hi < Math.log(1799), 'the beyond price stretched the axis');
  const g = bellGeometry(v);
  assert.equal(g.shopper.x, g.width - g.side, 'a beyond-high price is pinned at the right edge');
  assert.equal(g.shopper.pinned, 'high');
  const low = bellGeometry(usableVerdict(F.BEYOND_LOW));
  assert.equal(low.shopper.x, low.side);
  // A dot inside 4.5 sigma widens the axis rather than being pinned.
  const wide = usableVerdict({ ...F.NO_PRICE, dots: [{ cents: Math.round(599 * Math.exp(3.8 * 0.18)), store: 'Far', kind: 'regular' }] });
  const gw = bellGeometry(wide);
  assert.equal(gw.dots[0].pinned, null);
  assert.ok(gw.dots[0].x < gw.width - gw.side);
});

test('geometry: the bell peaks at the centre, sale dots sit on their own lane, zones follow the thresholds', () => {
  const v = usableVerdict(F.MEDIUM_SALE_BULK);
  const g = bellGeometry(v);
  const sale = g.dots.filter((d) => d.kind === 'sale');
  const reg = g.dots.filter((d) => d.kind === 'regular');
  assert.equal(sale.length, 1);
  assert.ok(sale.every((d) => d.y === g.saleY) && reg.every((d) => d.y === g.baseY) && g.saleY > g.baseY);
  assert.deepEqual(g.zones.map((z) => z.zone), ['great', 'good', 'reasonable', 'bad']);
  const good = g.zones.find((z) => z.zone === 'good');
  assert.ok(Math.abs(good.x2 - g.x(v.centreCents * 0.8)) < 0.2);
  // Peak: the sampled curve's highest point (smallest y) sits at the centre's x.
  const pts = g.curve.slice(1).split('L').map((p) => p.split(' ').map(Number));
  const top = pts.reduce((a, b) => (b[1] < a[1] ? b : a));
  assert.ok(Math.abs(top[0] - g.centreX) < (g.width / 72) * 1.1);
});

test('dot labels: store and quantity, never overlapping, the rest left to the list', () => {
  const placed = placeLabels([{ x: 100, text: 'Walmart 1 kg' }, { x: 104, text: 'Metro 1 kg' }, { x: 108, text: 'Sobeys 1 kg' }], { rows: 2 });
  assert.equal(placed.length, 2, 'a third label on two rows at the same spot overlapped');
  assert.notEqual(placed[0].row, placed[1].row);
  const svg = inLocale('en', () => distributionSheet(F.CROWDED, { name: 'X' }));
  const titles = [...svg.matchAll(/<circle class="vb-dot[^>]*><title>([^<]*)<\/title>/g)].map((m) => m[1]);
  assert.equal(titles.length, 12, 'every dot carries its store, quantity and price in its title');
  assert.ok(titles.every((x) => /Store \d+, 1 kg, \$\d+\.\d\d/.test(x)));
  const rows = svg.match(/class="vd-dotrow/g) ?? [];
  assert.equal(rows.length, 12, 'the list under the chart has every dot');
  const s = spreadLabels([100, 102, 104], { minGap: 54, width: 340 });
  assert.ok(s[1] - s[0] >= 53.9 && s[2] - s[1] >= 53.9);
});

/* ======================================================= the screen, case by case == */

test('good, reasonable, bad, great: his word, the tier, one face per tier, the right bubble', () => {
  const cases = [
    [F.GOOD, 'good', 'good', 'good', 'Good price'],
    [F.REASONABLE, 'reasonable', 'fair', 'fair', 'Reasonable price'],
    [F.BAD, 'bad', 'walk_away', 'walk', 'Bad price'],
    [F.GREAT, 'great', 'good', 'delighted', 'Great price'],
  ];
  for (const [fx, zone, tier, face, word] of cases) {
    const html = inLocale('en', () => distributionSheet(fx, { name: 'Kraft Peanut Butter 1 kg' }));
    assert.equal(attr(html, 'data-zone'), zone);
    assert.equal(attr(html, 'data-tier'), tier);
    assert.match(html, new RegExp(`<div class="shin-say" data-state="${face}"`), zone);
    assert.equal(between(html, 'data-dist-headline'), word);
    assert.equal(between(html, 'data-dist-name'), 'Kraft Peanut Butter 1 kg');
    assert.match(html, /data-vb-you=/);
  }
  // Great with low confidence is not the intense face (AVATAR.md's gate).
  assert.equal(distFace('great', 'low'), 'good');
});

test('the line beside the answer: how far off, against Pexi\'s estimate of the typical price', () => {
  assert.equal(between(inLocale('en', () => distributionSheet(F.GOOD)), 'data-dist-line'), "22% under the typical price, Pexi's estimate $5.99");
  assert.equal(between(inLocale('en', () => distributionSheet(F.BAD)), 'data-dist-line'), "25% over the typical price, Pexi's estimate $5.99");
  assert.equal(between(inLocale('en', () => distributionSheet(F.FLOOR)), 'data-dist-line'), "about the typical price, Pexi's estimate $5.99");
  assert.equal(between(inLocale('fr', () => distributionSheet(F.GOOD)), 'data-dist-line'), `22${NB}% sous le prix habituel, estimation de Pexi 5,99${NB}$`);
});

test('case 23, no price yet: the bell, no dot, a price field; a typed price drops the dot in and places it', () => {
  const html = inLocale('en', () => distributionSheet(F.NO_PRICE, { name: 'Kraft Peanut Butter 1 kg' }));
  assert.match(html, /data-verdict-bell/);
  assert.doesNotMatch(html, /data-vb-you=/);
  assert.match(html, /<form class="vd-price" data-dist-price/);
  assert.match(html, /inputmode="decimal"/);
  assert.equal(between(html, 'data-dist-headline'), 'Kraft Peanut Butter 1 kg');
  assert.equal(between(html, 'data-dist-line'), "Typical price, Pexi's estimate: $5.99");
  assert.equal(attr(html, 'data-tier'), 'unknown');
  const typed = inLocale('en', () => distributionSheet(F.NO_PRICE, { name: 'Kraft Peanut Butter 1 kg', typedCents: 469, still: true }));
  assert.match(typed, /data-vb-you="469"/);
  assert.equal(attr(typed, 'data-zone'), 'good');
  assert.doesNotMatch(typed, /data-dist-price/, 'the field stays after the price is placed');
  assert.match(typed, /class="vd-chart vd-still"/, 'the repaint redrew the whole bell instead of dropping only the dot');
});

test('case 24, suspect: one tap "Did you mean", and the chart still shows', () => {
  const html = inLocale('en', () => distributionSheet(F.SUSPECT));
  assert.match(html, /data-verdict-bell/);
  assert.match(html, /data-act="dist-suspect" data-cents="599">Did you mean \$5\.99\?</);
  const fr = inLocale('fr', () => distributionSheet(F.SUSPECT));
  assert.match(fr, new RegExp(`>Voulais-tu dire 5,99${NB}\\$\\?<`));
  // The tap draws the suggested price in place of the one read.
  const fixed = inLocale('en', () => distributionSheet(F.SUSPECT, { typedCents: 599 }));
  assert.match(fixed, /data-vb-you="599"/);
  assert.equal(attr(fixed, 'data-zone'), 'reasonable');
  assert.doesNotMatch(fixed, /dist-suspect/);
});

test('case 25, beyond: pinned at the edge with the multiple', () => {
  const html = inLocale('en', () => distributionSheet(F.BEYOND_HIGH));
  assert.match(html, /data-vb-pin="high"/);
  assert.match(html, />3x the typical price</);
  const low = inLocale('fr', () => distributionSheet(F.BEYOND_LOW));
  assert.match(low, /data-vb-pin="low"/);
  assert.match(low, />0,2 fois le prix habituel</);
});

test('low and medium confidence carry his line beside the answer; high does not (D13)', () => {
  // Medium keeps the plain sentence; low says in a few words why it is thin.
  assert.equal(between(inLocale('en', () => distributionSheet(F.MEDIUM_SALE_BULK)), 'data-dist-conf'), 'We are not fully confident in this answer.');
  assert.match(between(inLocale('en', () => distributionSheet(F.LOW_CONFIDENCE)), 'data-dist-conf'), /^Not fully confident: .+/);
  assert.doesNotMatch(inLocale('en', () => distributionSheet(F.GOOD)), /data-dist-conf/);
  assert.equal(attr(inLocale('en', () => distributionSheet(F.LOW_CONFIDENCE)), 'data-conf'), 'thin');
  assert.equal(attr(inLocale('en', () => distributionSheet(F.GOOD)), 'data-conf'), 'certain');
  assert.match(between(inLocale('fr', () => distributionSheet(F.LOW_CONFIDENCE)), 'data-dist-conf'), /^Pas entièrement sûrs : .+/);
});

test('sale dots, the bigger pack, notes and where the estimate came from, in the half detent', () => {
  const html = inLocale('en', () => distributionSheet(F.MEDIUM_SALE_BULK, { name: 'Gin 750 ml' }));
  const half = html.slice(html.indexOf('<div class="sheet-half">'), html.indexOf('<div class="sheet-full">'));
  assert.match(html, /class="vb-dot vb-dot-sale/);
  assert.match(html, /class="vb-lane"[^>]*>Sale</);
  assert.equal(between(half, 'data-vd-bigger'), 'A bigger pack, 1.75 L at BC Liquor, works out to $1.31 per 100 ml.');
  assert.deepEqual([...half.matchAll(/data-vd-note="([^"]+)"/g)].map((m) => m[1]), ['old_prices', 'other_region', 'few_prices']);
  assert.equal(between(half, 'data-vd-basis'), "Pexi's estimate, from similar products (1 price)");
  assert.match(half, /data-act="correct"/, 'Correct is not at half');
  const peek = html.slice(html.indexOf('<div class="sheet-peek">'), html.indexOf('<div class="sheet-half">'));
  assert.match(peek, /data-act="dist-save"/, 'the primary action is not in the peek');
  assert.equal((peek.match(/class="pill solid/g) ?? []).length, 1, 'the peek has one primary action');
  const fr = inLocale('fr', () => distributionSheet(F.MEDIUM_SALE_BULK));
  assert.match(fr, new RegExp(`Un plus grand format, 1\\.75 L chez BC Liquor, revient à 1,31${NB}\\$ les 100${NB}ml\\.`));
  assert.match(fr, /class="vb-lane"[^>]*>Solde</);
});

test('the accessible name says in words where the price falls, English and French', () => {
  assert.equal(
    ariaOf(inLocale('en', () => distributionSheet(F.GOOD))),
    'Good price. Your price, $4.69, is 22% under the typical price. Pexi estimates the typical price at $5.99, with 8 in 10 prices between $4.76 and $7.54.',
  );
  assert.equal(
    ariaOf(inLocale('fr', () => distributionSheet(F.BAD))),
    `Mauvais prix. Ton prix, 7,49${NB}$, est 25${NB}% au-dessus du prix habituel. Pexi estime le prix habituel à 5,99${NB}$, avec 8 prix sur 10 entre 4,76${NB}$ et 7,54${NB}$.`,
  );
  assert.equal(ariaOf(inLocale('en', () => distributionSheet(F.NO_PRICE))), 'Pexi estimates the typical price at $5.99, with 8 in 10 prices between $4.76 and $7.54.');
});

test('case 28, a better answer later: the bell eases on log price; the axis words are only ever a real answer\'s', () => {
  const a = usableVerdict(F.GOOD);
  const b = usableVerdict(F.BETTER_LATER);
  const mid = tweenVerdict(a, b, 0.5);
  assert.ok(mid.centreCents < a.centreCents && mid.centreCents > b.centreCents);
  assert.ok(mid.sigmaLog < a.sigmaLog && mid.sigmaLog > b.sigmaLog);
  assert.deepEqual(tweenVerdict(a, b, 1).centreCents, b.centreCents);
  assert.equal(tweenVerdict(a, b, 0).centreCents, a.centreCents);
  const svg = bellSvg(mid, { format: (c) => `$${(c / 100).toFixed(2)}`, labels: b });
  assert.match(svg, /data-vb-centre>\$5\.69</, 'an in-between centre was printed');
  assert.match(svg, new RegExp(`data-vb-p10>\\$${(Math.round(b.p10Cents) / 100).toFixed(2).replace('.', '\\.')}<`));
});

/* ================================================= every route ends in the bell == */

test('every route that receives a verdict draws the bell before any refusal or failure sheet', () => {
  const src = read('../public/js/screens/camera.js');
  const cat = src.slice(src.indexOf('function showCatalogue('), src.indexOf('function showCatalogue(') + 700);
  assert.match(cat, /if \(usableVerdict\(answer\?\.verdict\)\) \{[\s\S]*showDistribution\(answer\.verdict/);
  const own = src.slice(src.indexOf('function showOwnData('), src.indexOf('function showOwnData(') + 700);
  assert.match(own, /if \(usableVerdict\(id\?\.verdict\)\) \{[\s\S]*showDistribution\(id\.verdict/);
  const proc = src.slice(src.indexOf('step = 2; // Event'), src.indexOf("} else if (result.kind === 'gemini') {"));
  const bell = proc.indexOf('if (usableVerdict(result?.verdict))');
  assert.ok(bell > 0, 'proceed() does not draw a verdict');
  assert.ok(bell < proc.indexOf('refusalSheet('), 'a refusal is drawn before the verdict is looked at');
  assert.match(src, /if \(usableVerdict\(id\?\.verdict\)\) own = id;/);
  // A catalogue answer with a verdict is the bell; without one it is today's sheet, unchanged.
  const withVerdict = catalogueSheet({ kind: 'catalogue', outcome: 'catalogue_hit', identity: { name: 'X', brand: null, size: null, barcode: '1', category: null }, range: null, verdict: F.GOOD });
  assert.doesNotMatch(withVerdict, /data-verdict-bell/, 'catalogueSheet itself draws the old sheet; showCatalogue routes the verdict');
});

/* ===================================================== words and motion == */

const KEYS = ['vd_zone_great', 'vd_zone_good', 'vd_zone_reasonable', 'vd_zone_bad', 'vd_where_under', 'vd_where_over', 'vd_where_about', 'vd_off', 'vd_typical',
    'vd_not_confident', 'vd_suspect', 'vd_multiple', 'vd_band', 'vd_alt_marked', 'vd_alt_bare', 'vd_sale', 'vd_price_label', 'vd_place', 'vd_dots_heading',
    'vd_basis', 'vd_basis_own_prices', 'vd_basis_other_size', 'vd_basis_leaf_category', 'vd_basis_parent_category', 'vd_basis_brand_markup',
    'vd_basis_claude_typical', 'vd_basis_category_prior', 'vd_basis_global_prior', 'vd_bigger_pack', 'vd_unit_per_100_g', 'vd_unit_per_100_ml',
    'vd_unit_each', 'vd_unit_per_kg', 'vd_note_size_assumed', 'vd_note_other_region', 'vd_note_old_prices', 'vd_note_identity_conflict',
    'vd_note_claude_estimate', 'vd_note_few_prices'];
const FACTS = { pct: '22', centre: '$5.99', where: 'x', price: '$5.99', m: '3', low: '$4.77', high: '$7.52', verdict: 'Good price', asking: '$4.69', from: 'x', n: '4', quantity: '1 kg', store: 'Metro', unit: 'per 100 g' };

test('every bell string exists in both languages, the French is French, no em dash, never "saved"', () => {
  assert.ok(KEYS.length > 30);
  for (const key of KEYS) {
    const en = inLocale('en', () => t(key, FACTS));
    const fr = inLocale('fr', () => t(key, FACTS));
    assert.notEqual(en, key, `${key} missing in English`);
    assert.notEqual(fr, key, `${key} missing in French`);
    assert.notEqual(fr, en, `${key} is English in French`);
    for (const s of [en, fr]) {
      assert.doesNotMatch(s, /\u2014/, `${key} has an em dash`);
      assert.doesNotMatch(s, /\bsav(e|ed|ing|ings)\b|économis/i, `${key} makes a savings claim`);
    }
  }
  for (const id of ['en', 'fr']) {
    for (const fx of Object.values(F.ALL)) {
      const html = inLocale(id, () => distributionSheet(fx, { name: 'Item' }));
      assert.doesNotMatch(html, /\u2014/);
      const visible = html.replace(/<[^>]*>/g, ' ');
      // "Save it" is the watchlist action, not a claim; "saved" never appears.
      assert.doesNotMatch(visible, /\bsaved\b|économisé/i);
    }
  }
});

test('motion: CSS resting on the final state, all of it off under prefers-reduced-motion, the dot drops and never slides', () => {
  const css = read('../public/css/screens/camera.css');
  const block = css.slice(css.indexOf('THE VERDICT BELL'));
  for (const cls of ['vb-curve', 'vb-area', 'vb-band', 'vb-zone', 'vb-dot', 'vb-you']) {
    assert.match(block, new RegExp(`\\.${cls}[^{]*\\{[^}]*animation:[^}]*backwards`), `${cls} does not rest on its own final style`);
  }
  const reduce = block.slice(block.indexOf('@media (prefers-reduced-motion: reduce)'));
  const rule = reduce.slice(0, reduce.indexOf('}', reduce.indexOf('animation')) + 1);
  for (const cls of ['vb-curve', 'vb-area', 'vb-band', 'vb-zone', 'vb-dot', 'vb-you']) assert.match(rule, new RegExp(`\\.${cls}\\b`), `${cls} still moves under reduced motion`);
  assert.match(rule, /animation:\s*none/);
  const settle = block.match(/@keyframes vb-settle \{[^}]*\}/)?.[0] ?? '';
  assert.match(settle, /translateY/);
  assert.doesNotMatch(settle, /translateX|translate\(/);
  assert.match(bellSvg(usableVerdict(F.GOOD), {}), /class="vb-curve"[^>]*pathLength="1"/);
  // A later answer under reduced motion is redrawn, not tweened.
  const src = read('../public/js/screens/camera.js');
  assert.match(src, /if \(!from \|\| reduced \|\| typeof requestAnimationFrame !== 'function'\) \{\s*host\.innerHTML = distBell\(toV, \{ report \}\);/);
});
