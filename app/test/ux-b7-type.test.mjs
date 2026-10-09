/**
 * UX build 7, type and names: R-18 (text floor), R-48 / R-49 / R-50 (item name, brand, size),
 * R-54 (frozen difference on a saved row), R-55 (dates). Spec: docs/design/ux-evidence-2026-10-09.md
 * section 13, build 7.
 *
 * BLOCKS COVERED: R-18, R-48, R-49, R-50, R-54, R-55.
 *
 * EXPECTED RED UNTIL BUILT: every test whose name says "build 7". Reasons, in the order they will
 * be seen: a dozen text sizes under 11 px; the provenance line at 10 px in a faint ink; the item name at
 * 13.5 px with an end ellipsis and no tap; no middle-ellipsis / brand / size helper in
 * lib/product-name.js; dates older than a week still printed as "N d ago" or as a raw ISO day;
 * no "old" mark on a price seen 90+ days ago; saved row printing "saved 30 d ago". The "fails
 * loudly" tests need helpers that do not exist yet (named in each failure message).
 * GREEN TODAY (keep): the two-line clamp, size not written twice, "Size assumed" note, the bigger
 * pack's side note kept outside the bell, a saved row's difference frozen at save time, relative
 * dates inside a week, the share card's and the paywall's date formats, no text-size lock.
 *
 * WHAT JSDOM CANNOT MEASURE (there is none here; test/mini-dom.mjs does not parse markup and the
 * app has zero runtime dependencies). Not measured: how many lines a name really takes on a 390 px
 * screen (needs a font and a layout engine, so the clamp is checked as a declared value), whether text
 * fits at the largest system text setting (a manual test on a device: R-18 asks for it), real
 * contrast of the muted ink on each sheet colour (checked only as "the token is the muted one").
 *
 * Run: node --test --test-global-setup=test/setup/global.mjs test/ux-b7-type.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const storage = makeStorage();
installBrowser({ doc: makeDocument(), storage });

const F = await import('./verdict-fixtures.mjs');
const { distributionSheet } = await import('../public/js/screens/camera.js');
const watchlist = await import('../public/js/screens/watchlist.js');
const dom = await import('../public/js/lib/dom.js');
const productName = await import('../public/js/lib/product-name.js');
const { ago } = dom;

const DAY = 86400000;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();

/* ================================================================== CSS reading */

const CSS_DIR = new URL('../public/css/', import.meta.url);

function parseCss(text, file) {
  const src = text.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  function block(start, media) {
    let i = start;
    while (i < src.length) {
      while (i < src.length && /\s/.test(src[i])) i += 1;
      if (i >= src.length) return i;
      if (src[i] === '}') return i + 1;
      const open = src.indexOf('{', i);
      const semi = src.indexOf(';', i);
      if (open === -1) return src.length;
      if (semi !== -1 && semi < open && src[i] === '@') { i = semi + 1; continue; }
      const head = src.slice(i, open).trim();
      if (/^@(-webkit-)?keyframes/.test(head)) {
        let depth = 0; let j = open;
        for (; j < src.length; j += 1) { if (src[j] === '{') depth += 1; else if (src[j] === '}' && --depth === 0) break; }
        i = j + 1; continue;
      }
      if (head.startsWith('@font-face')) { i = src.indexOf('}', open) + 1; continue; }
      if (head.startsWith('@')) {
        i = block(open + 1, media ? `${media} and ${head}` : head);
        continue;
      }
      const close = src.indexOf('}', open);
      const decls = new Map();
      for (const d of src.slice(open + 1, close).split(';')) {
        const k = d.indexOf(':');
        if (k === -1) continue;
        const prop = d.slice(0, k).trim().toLowerCase();
        if (prop) decls.set(prop, d.slice(k + 1).replace(/\s+/g, ' ').trim());
      }
      rules.push({ sel: head.replace(/\s+/g, ' '), decls, media, file });
      i = close + 1;
    }
    return i;
  }
  block(0, null);
  return rules;
}

const FILES = ['tokens.css', 'components.css', 'face.css', 'shell.css', ...readdirSync(new URL('screens/', CSS_DIR)).sort().map((f) => `screens/${f}`)];
const RULES = FILES.flatMap((f) => parseCss(readFileSync(new URL(f, CSS_DIR), 'utf8'), f));

const VARS = new Map();
for (const r of RULES) {
  if (r.media && /prefers-/.test(r.media)) continue;
  for (const [p, v] of r.decls) if (p.startsWith('--') && !VARS.has(p)) VARS.set(p, v);
}

/** A font-size value to px, or NaN when it cannot be reduced to a number (inherit, em of something). */
function fontPx(value) {
  let s = String(value).trim();
  for (let n = 0; n < 10 && /var\(/.test(s); n += 1) {
    s = s.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_m, name, fb) => VARS.get(name) ?? fb ?? 'NaN');
  }
  let m = /^([\d.]+)px$/.exec(s);
  if (m) return Number.parseFloat(m[1]);
  m = /^([\d.]+)rem$/.exec(s);
  if (m) return Number.parseFloat(m[1]) * 16;
  m = /^clamp\(\s*([\d.]+)px/.exec(s);
  if (m) return Number.parseFloat(m[1]); // the floor is what can render
  return Number.NaN;
}

function declarationsOf(prop) {
  return RULES.filter((r) => r.decls.has(prop) && !(r.media && /print/.test(r.media)));
}

function ruleFor(selector) {
  // Last rule whose selector list contains exactly this selector.
  const hit = RULES.filter((r) => r.sel.split(',').map((x) => x.trim()).includes(selector));
  assert.ok(hit.length > 0, `no CSS rule for ${selector}`);
  return hit;
}

const lastDecl = (selector, prop) => {
  const with_ = ruleFor(selector).filter((r) => r.decls.has(prop));
  return with_.length ? with_[with_.length - 1].decls.get(prop) : undefined;
};

/* ===================================================================== R-18 */

test('R-18 (build 7): the CSS reader sees the type scale it must audit (negative control)', () => {
  assert.ok(declarationsOf('font-size').length > 150, 'fewer than 150 font-size declarations found: the reader is broken');
  assert.equal(fontPx(lastDecl('.modbtn', 'font-size')), 12, 'known value: .modbtn is 12 px');
  assert.equal(fontPx('var(--t-label-size)'), 11, 'known value: the label token is 11 px');
});

test('R-18 (build 7): nothing is set below 11 px', () => {
  const under = [];
  for (const r of declarationsOf('font-size')) {
    const px = fontPx(r.decls.get('font-size'));
    if (Number.isFinite(px) && px < 11) under.push(`${r.file}: ${r.sel.slice(0, 60)} { font-size: ${r.decls.get('font-size')} }`);
  }
  assert.deepEqual(under, [], `R-18: nothing below 11 px; ${under.length} declarations are`);
});

test('R-18 (build 7): the provenance line is 12 px (the label token and the confidence line)', () => {
  const bad = [];
  const label = fontPx('var(--t-label-size)');
  if (!(label >= 12)) bad.push(`--t-label-size is ${label}px (it sizes .label, the provenance token)`);
  for (const sel of ['.conf-label, .gem-checked', '.prov div']) {
    const px = fontPx(lastDecl(sel, 'font-size'));
    if (!(px >= 12)) bad.push(`${sel} is ${px}px`);
  }
  assert.deepEqual(bad, [], 'R-18: provenance goes to 12 px');
});

test('R-18 (build 7): the provenance line uses the muted ink, not the faint ink', () => {
  const bad = [];
  for (const sel of ['.label', '.conf-label, .gem-checked', '.prov div']) {
    const color = lastDecl(sel, 'color') ?? 'inherit';
    if (/ink-faint/.test(color)) bad.push(`${sel} { color: ${color} }`);
  }
  assert.deepEqual(bad, [], 'R-18: muted ink, not faint ink, for the provenance line');
});

test('R-18 (keep): nothing locks the text size, so a larger system text setting can reach the page', () => {
  const locks = RULES.filter((r) => /^none$/i.test(r.decls.get('-webkit-text-size-adjust') ?? '') || /^none$/i.test(r.decls.get('text-size-adjust') ?? ''));
  assert.deepEqual(locks.map((r) => `${r.file}: ${r.sel}`), []);
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(html), 'the viewport meta forbids zoom');
});

test('R-18 (build 7): a text size under 11 px throws (never a silent clamp)', async () => {
  let mod;
  try { mod = await import('../public/js/lib/type-floor.js'); } catch (err) {
    assert.fail(`build 7 must add public/js/lib/type-floor.js exporting assertTextSize(name, px); import failed: ${err.code ?? err.message}`);
  }
  assert.equal(typeof mod.assertTextSize, 'function');
  assert.throws(() => mod.assertTextSize('provenance', 10), /provenance/);
  assert.throws(() => mod.assertTextSize('provenance', Number.NaN), /provenance/, 'an unreadable size must throw, not pass');
  assert.doesNotThrow(() => mod.assertTextSize('provenance', 12));
  assert.doesNotThrow(() => mod.assertTextSize('label', 11));
  assert.throws(() => mod.assertTextSize('', 14), /name/i);
});

/* ================================================================ R-48 / R-49 / R-50 */

const sheetHtml = (over = {}, name = 'Kraft Peanut Butter Smooth 500 g') => distributionSheet({ ...F.GOOD, ...over }, { name });

test('R-48 (build 7): the item name is set at 16 to 17 px', () => {
  const px = fontPx(lastDecl('.itemname', 'font-size'));
  assert.ok(px >= 16 && px <= 17, `.itemname is ${px}px, R-48 asks for 16 to 17`);
});

test('R-48 (keep): the item name is clamped to two lines', () => {
  assert.equal(lastDecl('.itemname', '-webkit-line-clamp'), '2');
  assert.equal(lastDecl('.itemname', 'overflow'), 'hidden');
});

test('R-48 (build 7): a long name keeps the size at the end through a middle ellipsis', () => {
  assert.equal(typeof productName.middleEllipsis, 'function', 'build 7 must export middleEllipsis(text, maxChars) from lib/product-name.js');
  const name = 'Kleenex Ultra Soft Facial Tissue Family Box 3-ply White 95 pack';
  const out = productName.middleEllipsis(name, 32);
  assert.ok(out.length <= 32, `result is ${out.length} characters`);
  assert.ok(out.includes('…'), 'no ellipsis');
  assert.ok(out.endsWith('95 pack'), `the size at the end must survive: ${out}`);
  assert.ok(out.startsWith('Kleenex'), `the brand at the start must survive: ${out}`);
  assert.equal(productName.middleEllipsis('Kraft Peanut Butter 500 g', 32), 'Kraft Peanut Butter 500 g', 'a short name is untouched');
});

test('R-48 (build 7): the full name opens by tap', () => {
  const html = sheetHtml();
  const tag = /<([a-z]+)\b[^>]*class="[^"]*\bitemname\b[^>]*>/.exec(html);
  assert.ok(tag, 'the answer sheet draws no .itemname');
  assert.ok(/^(button|a)$/.test(tag[1]) || /role="button"|data-act=/.test(tag[0]), `the item name is a plain ${tag[1]} with nothing to tap: ${tag[0]}`);
});

test('R-48 (build 7): the name line always begins with the brand', () => {
  assert.equal(typeof productName.nameLine, 'function', 'build 7 must export nameLine({ brand, name, size }) from lib/product-name.js');
  assert.equal(productName.nameLine({ brand: 'Kraft', name: 'Peanut Butter Smooth', size: '500 g' }), 'Kraft Peanut Butter Smooth 500 g');
});

test('R-49 (build 7): brand is prepended only when the name does not start with it, and is never a logo', () => {
  const { nameLine } = productName;
  assert.equal(typeof nameLine, 'function', 'build 7 must export nameLine from lib/product-name.js');
  assert.equal(nameLine({ brand: 'Kraft', name: 'Kraft Peanut Butter', size: '' }), 'Kraft Peanut Butter', 'brand already first');
  assert.equal(nameLine({ brand: 'kraft', name: 'KRAFT Peanut Butter', size: '' }), 'KRAFT Peanut Butter', 'case differs, still first');
  assert.equal(nameLine({ brand: '', name: 'Peanut Butter', size: '' }), 'Peanut Butter', 'no brand known');
  assert.ok(!/<img|<svg|logo/i.test(nameLine({ brand: 'Kraft', name: 'Peanut Butter', size: '' })), 'no logos');
});

test('R-49 (keep): the answer sheet shows no separate brand row and no logo', () => {
  const html = sheetHtml();
  assert.ok(!/class="[^"]*\bbrand\b/.test(html), 'a separate brand row exists');
  assert.ok(!/<img\b[^>]*(logo|brand)/i.test(html), 'a logo exists');
});

test('R-50 (build 7): the size is always in the name line, once', () => {
  const { nameLine } = productName;
  assert.equal(typeof nameLine, 'function', 'build 7 must export nameLine from lib/product-name.js');
  assert.equal(nameLine({ brand: 'Kleenex', name: 'Kleenex Ultra Soft Tissue', size: '95 pack' }), 'Kleenex Ultra Soft Tissue 95 pack');
  assert.equal(nameLine({ brand: 'Kleenex', name: 'Kleenex Ultra Soft Tissue 95 pack', size: '95 pack' }), 'Kleenex Ultra Soft Tissue 95 pack', 'never twice');
});

test('R-50 (keep): a size the name already carries is recognised, so it is not written twice', () => {
  assert.equal(productName.nameCarriesSize('Kleenex Ultra Soft 95 pack', '95 pack'), true);
  assert.equal(productName.nameCarriesSize('Kleenex Ultra Soft', '95 pack'), false);
});

test('R-50 (keep): when the size was assumed the provenance says so', () => {
  const html = sheetHtml({ notes: ['size_assumed'] });
  assert.match(html, /Size assumed/);
  assert.doesNotMatch(sheetHtml({ notes: [] }), /Size assumed/, 'the note must not appear when the size is known');
});

test('R-50 (keep): a larger pack\'s unit price is a one-line side note, never inside the bell', () => {
  const html = sheetHtml({ biggerPack: { quantity: '1.75 L', perUnitCents: 131, store: 'BC Liquor' } });
  const note = /<p class="[^"]*vd-bigger[^"]*"[^>]*>([^<]*)<\/p>/.exec(html);
  assert.ok(note, 'no side note for the larger pack');
  assert.ok(!note[1].includes('\n'), 'the note must be one line of text');
  const svgs = [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map((m) => m[0]);
  assert.ok(svgs.length > 0, 'cannot find the bell');
  assert.ok(svgs.every((s) => !s.includes('vd-bigger') && !s.includes(note[1].trim())), 'the unit price is inside the bell');
});

test('R-48 (build 7): a name line without a name throws, and an ellipsis width too small to keep both ends throws', () => {
  const { nameLine, middleEllipsis } = productName;
  assert.equal(typeof nameLine, 'function', 'build 7 must export nameLine');
  assert.equal(typeof middleEllipsis, 'function', 'build 7 must export middleEllipsis');
  assert.throws(() => nameLine({ brand: 'Kraft', name: '', size: '500 g' }), /name/i);
  assert.throws(() => nameLine({ brand: 'Kraft', size: '500 g' }), /name/i);
  assert.throws(() => middleEllipsis('Kraft Peanut Butter 500 g', 3), RangeError, 'a 3-character budget cannot keep a start and an end');
  assert.throws(() => middleEllipsis(undefined, 30), TypeError);
});

/* ===================================================================== R-55 */

const ABSOLUTE = /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/;

test('R-55 (keep): a date inside a week stays relative', () => {
  assert.equal(ago(iso(3)), '3 d ago');
  assert.equal(ago(iso(0.1)), '2 h ago');
});

test('R-55 (build 7): a date older than a week is absolute, with a short month and the full year', () => {
  for (const days of [10, 40, 400]) {
    const out = ago(iso(days));
    assert.match(out, ABSOLUTE, `${days} days old reads "${out}"; R-55 asks for e.g. "Oct 3, 2026"`);
  }
  const old = new Date(Date.now() - 400 * DAY);
  assert.ok(ago(old.toISOString()).endsWith(String(old.getFullYear())) || ago(old.toISOString()).endsWith(String(old.getUTCFullYear())), 'the year is not the date\'s year');
});

test('R-55 (build 7): the price list prints each date by the same rule, never a raw ISO day', () => {
  const dots = [
    { cents: 549, store: 'Save-On-Foods', city: 'Victoria', seenOn: iso(2).slice(0, 10), kind: 'regular', quantity: '1 kg' },
    { cents: 599, store: 'Walmart', city: 'Toronto', seenOn: iso(20).slice(0, 10), kind: 'regular', quantity: '1 kg' },
  ];
  const html = sheetHtml({ dots });
  const rows = [...html.matchAll(/<li class="vd-dotrow[^"]*">([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  assert.equal(rows.length, 2, 'cannot find the two price rows');
  for (const row of rows) assert.doesNotMatch(row, /\d{4}-\d{2}-\d{2}/, `a raw ISO date is printed: ${row}`);
  assert.match(rows[0], /2 d ago|2 days ago/, 'a price seen two days ago is relative');
  assert.match(rows[1], /[A-Z][a-z]{2} \d{1,2}, \d{4}/, 'a price seen 20 days ago is absolute');
});

test('R-55 (build 7): a price seen more than 90 days ago is marked old in its row, and a newer one is not', () => {
  const dots = [
    { cents: 549, store: 'Save-On-Foods', city: 'Victoria', seenOn: iso(120).slice(0, 10), kind: 'regular', quantity: '1 kg' },
    { cents: 599, store: 'Walmart', city: 'Toronto', seenOn: iso(30).slice(0, 10), kind: 'regular', quantity: '1 kg' },
  ];
  const rows = [...sheetHtml({ dots }).matchAll(/<li class="vd-dotrow[^"]*"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[0]);
  assert.equal(rows.length, 2);
  const isOld = (r) => /\bold\b|data-old|vd-old/i.test(r);
  assert.ok(isOld(rows[0]), `the 120 day old price carries no old mark: ${rows[0]}`);
  assert.ok(!isOld(rows[1]), 'a 30 day old price must not be marked old');
});

test('R-55 (keep): the share card keeps its absolute date and the paywall keeps weekday and date', () => {
  const share = readFileSync(new URL('../public/js/screens/share.js', import.meta.url), 'utf8');
  assert.match(share, /toLocaleDateString\(undefined, \{ year: 'numeric', month: 'short', day: 'numeric' \}\)/);
  const paywall = readFileSync(new URL('../public/js/screens/paywall.js', import.meta.url), 'utf8');
  assert.match(paywall, /weekday: 'long', month: 'long', day: 'numeric'/);
});

test('R-55 (build 7): a date that cannot be read throws, it does not print "just now"', async () => {
  assert.equal(typeof dom.dateLabel, 'function', 'build 7 must export dateLabel(iso, now) from lib/dom.js: the dated-row rule, loud on a bad date');
  assert.throws(() => dom.dateLabel(undefined), /date/i);
  assert.throws(() => dom.dateLabel('not a date'), /date/i);
  assert.throws(() => dom.dateLabel(''), /date/i);
  const now = Date.parse('2026-10-09T12:00:00Z');
  assert.equal(dom.dateLabel('2026-10-07T12:00:00Z', now), '2 d ago');
  assert.match(dom.dateLabel('2026-09-01T12:00:00Z', now), ABSOLUTE);
});

/* ===================================================================== R-54 */

// A row as the Save button writes it: the price, the usual at that moment, and the answer snapshot (currency included).
const SAVED = (over = {}) => ({
  id: 'w1', label: 'Kraft Peanut Butter 500 g', askingSeller: 'Metro', lastCents: 349, usualCents: 429,
  savedAt: iso(30),
  answer: { kind: 'distribution', id: 'w1', label: 'Kraft Peanut Butter 500 g', zone: 'good', confidence: 'high', centreCents: 429, p10Cents: 350, p90Cents: 520, currency: 'CAD', askingCents: 349, offByPct: -19, basis: 'own_prices' },
  ...over,
});
const textOf = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('R-54 (build 7): a saved row reads "$3.49, $0.80 under the usual, saved <date>"', () => {
  const text = textOf(watchlist.row(SAVED(), []));
  assert.match(text, /\$3\.49/, 'the saved price is missing');
  assert.match(text, /\$0\.80 under the usual/, `the difference must read "$0.80 under the usual": ${text.slice(-120)}`);
  assert.match(text, /saved [A-Z][a-z]{2} \d{1,2}, \d{4}/, `the saved date is not absolute for a 30 day old row: ${text.slice(-120)}`);
});

test('R-54 (keep): the difference on a saved row does not move when the estimate moves', () => {
  // The row carries its own snapshot, so a live estimate in history (429 then 900) must not change what it shows.
  const hist = (centre) => [{ id: 'h1', at: iso(1), result: { kind: 'distribution', centreCents: centre } }];
  const strip = (h) => h.replace(/\s+/g, ' ');
  const at = SAVED({ savedAt: iso(2), usualCents: undefined });
  assert.equal(strip(watchlist.row(at, hist(429))), strip(watchlist.row(at, hist(900))), 'the row changed when the live estimate changed');
  assert.match(strip(watchlist.row(at, hist(900))), /0\.80/, 'the frozen difference is not on the row');
});

test('R-54 (build 7): a row saved above the usual says over, in the same words', () => {
  const text = textOf(watchlist.row(SAVED({ lastCents: 509, usualCents: 429, savedAt: iso(2), answer: { ...SAVED().answer, askingCents: 509, offByPct: 19 } }), []));
  assert.match(text, /\$0\.80 over the usual/, `over reads: ${text.slice(-100)}`);
});
