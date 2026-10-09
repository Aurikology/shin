/**
 * UX build 6, fails loudly. The founder's instruction: "all code should contain things that
 * ensure things fail loudly". Spec: docs/design/ux-evidence-2026-10-09.md section 13, build 6.
 *
 * BLOCKS COVERED (each adds behaviour, so each gets a tripwire): R-40/R-69 band (low above
 * high), R-41 typed price, R-42 estimate (0, negative, rounds to 0), R-43 range ends, R-44 verdict
 * word outside the four, R-45 confidence outside high/medium/low, R-46 store dot missing a
 * field (quantity above all), R-47 dot kind outside regular/sale, R-56 provenance source unknown,
 * R-64/R-65/R-68 spread that cannot be drawn, R-67 shopper mark without a price, R-70 a
 * "no price" that is really a broken price.
 *
 * What "loudly" means here: `distributionSheet` THROWS an Error whose message names the field at
 * fault. It never returns '' (today: `usableVerdict` returns null and the sheet is an empty
 * string), never fills in a default (today: an unknown confidence becomes "low", an unknown dot
 * kind becomes "regular", an unknown basis becomes null, a dot with no quantity prints a row
 * with an empty cell), and never prints an empty element.
 *
 * EXPECTED TODAY: every "throws" test is RED until built; the CONTROL tests are GREEN (valid
 * input, and the inputs the contract documents as optional, must keep rendering).
 *
 * The probe is itself checked (`the probe goes red on a silent renderer`), because a loop of
 * "did it throw" checks passes vacuously if the probe can never fail.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FX, F, render, verdictWith, dot, shopperBlock, VC, ALL } from './ux-b6-support.mjs';

/** null when `fn` threw an Error whose message matches `want`; otherwise a sentence saying what happened instead. */
function probeFn(fn, want) {
  let out;
  try {
    out = fn();
  } catch (e) {
    if (!(e instanceof Error)) return `threw a non-Error (${typeof e})`;
    return want.test(String(e.message)) ? null : `threw, but the message "${e.message}" does not name ${want}`;
  }
  return out === '' || out == null ? `silently returned ${JSON.stringify(out)}` : 'rendered a sheet instead of throwing';
}

/** Run a table of [label, verdict-or-fn] and assert every row failed loudly with a message matching `want`. */
function assertLoud(rows, want, opts = {}) {
  const quiet = [];
  for (const [label, make] of rows) {
    const v = typeof make === 'function' ? make() : make;
    const why = probeFn(() => render(v, opts), want);
    if (why) quiet.push(`${label}: ${why}`);
  }
  assert.deepEqual(quiet, [], 'bad input that did not fail loudly');
}

const withShopper = (v, shopper) => ({ ...v, shopper });
const goodDots = FX.HIGH.dots;

/* ----------------------------------------------------- the probe, and the controls */

test('the probe goes red on a silent renderer and green on a loud one', () => {
  assert.ok(probeFn(() => '', /x/), 'an empty string must count as silent');
  assert.ok(probeFn(() => '<section></section>', /x/), 'a sheet must count as not throwing');
  assert.ok(probeFn(() => null, /x/), 'null must count as silent');
  assert.ok(probeFn(() => { throw new Error('something else'); }, /confidence/), 'a throw that names the wrong thing must not pass');
  assert.equal(probeFn(() => { throw new Error('confidence "x" is not high, medium or low'); }, /confidence/), null);
});

test('CONTROL: every valid fixture renders a non-empty sheet, and so do the inputs the contract documents as optional', () => {
  for (const [name, v] of [...ALL, ['CROWDED', F.CROWDED], ['SUSPECT', F.SUSPECT], ['BEYOND_LOW', F.BEYOND_LOW]]) {
    const html = render(v);
    assert.ok(html.length > 500 && html.includes('class="sheet'), `${name}: did not render a sheet`);
  }
  const { p10Cents, p90Cents, ...noEnds } = FX.HIGH;
  assert.ok(render(noEnds).includes('vbell'), 'p10 and p90 absent: worked out from the centre and spread, as the contract says');
  assert.ok(render(withShopper(FX.HIGH, null)).includes('vbell'), 'no shopper price is valid (R-70)');
  assert.ok(render({ ...FX.HIGH, shopper: undefined }).includes('vbell'), 'shopper absent is valid');
  assert.ok(render(FX.HIGH, { typedCents: null }).includes('vbell') && render(FX.HIGH, { typedCents: undefined }).includes('vbell'), 'no typed price is valid');
  assert.ok(render({ ...FX.HIGH, dots: [] }).includes('vbell'), 'no dots is valid (low confidence from a category)');
  for (const kind of ['regular', 'sale']) assert.ok(render({ ...FX.HIGH, dots: [dot(500, 'Metro', '1 kg', '2026-10-01', kind)] }).includes('vbell'), kind);
});

/* ------------------------------------------------------------- R-45 */

test('R-45 throws on a confidence that is not high, medium or low, never defaults to "low"', () => {
  assertLoud(
    [['extreme', 'extreme'], ['upper case', 'HIGH'], ['empty string', ''], ['undefined', undefined], ['null', null], ['number', 3], ['percent', '62%'], ['word from the UI', 'Certain']]
      .map(([label, c]) => [`confidence ${label}`, () => ({ ...FX.HIGH, confidence: c })]),
    /confidence/i,
  );
});

/* ------------------------------------------------------ R-69, R-40: the band */

test('R-69 / R-40 throws on a band whose low is above its high, and on ends that are present but not prices', () => {
  assertLoud([
    ['p10 above p90', () => ({ ...FX.HIGH, p10Cents: 900, p90Cents: 400 })],
    ['p10 above p90 by one cent', () => ({ ...FX.HIGH, p10Cents: 701, p90Cents: 700 })],
    ['p10 is 0 (not replaced by a recomputed one)', () => ({ ...FX.HIGH, p10Cents: 0 })],
    ['p10 negative', () => ({ ...FX.HIGH, p10Cents: -50 })],
    ['p90 is NaN', () => ({ ...FX.HIGH, p90Cents: Number.NaN })],
    ['p90 is a string', () => ({ ...FX.HIGH, p90Cents: '754' })],
    ['p10 above the centre', () => ({ ...FX.HIGH, p10Cents: FX.HIGH.centreCents + 50, p90Cents: FX.HIGH.centreCents + 400 })],
    ['centre above p90', () => ({ ...FX.HIGH, p90Cents: FX.HIGH.centreCents - 50, p10Cents: 300 })],
  ], /p10|p90|band|range|low|high/i);
});

/* --------------------------------------------------------------- R-42, R-43 */

test('R-42 throws on an estimate of 0 or less, one that is not a number, or one that rounds to 0', () => {
  assertLoud([
    ['centre 0', () => ({ ...FX.HIGH, centreCents: 0 })],
    ['centre negative', () => ({ ...FX.HIGH, centreCents: -599 })],
    ['centre NaN', () => ({ ...FX.HIGH, centreCents: Number.NaN })],
    ['centre Infinity', () => ({ ...FX.HIGH, centreCents: Infinity })],
    ['centre missing', () => { const { centreCents, ...rest } = FX.HIGH; return rest; }],
    ['centre a string', () => ({ ...FX.HIGH, centreCents: '599' })],
    ['centre 2 cents (rounds to $0.00 at the nearest 5 cents)', () => verdictWith({ centreCents: 2, sigmaLog: 0.1, dots: [], confidence: 'low', basis: 'category_prior' })],
  ], /centre|estimate|typical/i);
});

test('R-43 throws on a spread that cannot be drawn: negative, NaN, missing', () => {
  assertLoud([
    ['sigma negative', () => ({ ...FX.HIGH, sigmaLog: -0.1 })],
    ['sigma NaN', () => ({ ...FX.HIGH, sigmaLog: Number.NaN })],
    ['sigma missing', () => { const { sigmaLog, ...rest } = FX.HIGH; return rest; }],
    ['sigma a string', () => ({ ...FX.HIGH, sigmaLog: '0.18' })],
  ], /sigma|spread/i);
});

/* ------------------------------------------------------------------- R-46 */

const DOT_FIELDS = [
  ['quantity', /quantity/i, (d) => ({ ...d, quantity: undefined }), (d) => ({ ...d, quantity: null }), (d) => ({ ...d, quantity: '' }), (d) => ({ ...d, quantity: '   ' })],
  ['store', /store/i, (d) => ({ ...d, store: undefined }), (d) => ({ ...d, store: null }), (d) => ({ ...d, store: '' })],
  ['price', /price|cents/i, (d) => ({ ...d, cents: 0 }), (d) => ({ ...d, cents: -1 }), (d) => ({ ...d, cents: Number.NaN }), (d) => ({ ...d, cents: undefined })],
  ['date', /date|seenOn/i, (d) => ({ ...d, seenOn: undefined }), (d) => ({ ...d, seenOn: null }), (d) => ({ ...d, seenOn: '' })],
];

test('R-46 throws on a store dot missing its quantity, never drops it', () => {
  const [, want, ...breakers] = DOT_FIELDS[0];
  const rows = [];
  for (const i of [0, 2]) {
    for (const [k, brk] of breakers.entries()) rows.push([`dot ${i}, quantity variant ${k}`, () => ({ ...FX.HIGH, dots: FX.HIGH.dots.map((d, j) => (j === i ? brk(d) : d)) })]);
  }
  assertLoud(rows, want);
});

test('R-46 throws on a store dot missing its store, price or date', () => {
  const rows = [];
  for (const [field, , ...breakers] of DOT_FIELDS.slice(1)) {
    for (const [k, brk] of breakers.entries()) rows.push([`${field} variant ${k}`, () => ({ ...FX.HIGH, dots: FX.HIGH.dots.map((d, j) => (j === 1 ? brk(d) : d)) })]);
  }
  assertLoud(rows, /store|price|cents|date|seenOn/i);
  for (const [field, want, ...breakers] of DOT_FIELDS.slice(1)) {
    const quiet = [];
    breakers.forEach((brk, k) => {
      const why = probeFn(() => render({ ...FX.HIGH, dots: FX.HIGH.dots.map((d, j) => (j === 1 ? brk(d) : d)) }), want);
      if (why) quiet.push(`${field} variant ${k}: ${why}`);
    });
    assert.deepEqual(quiet, [], `the message must name the ${field}`);
  }
});

test('R-46 a sale dot with no quantity is as loud as a regular one', () => {
  assertLoud([['sale dot, no quantity', () => ({ ...FX.SALE, dots: FX.SALE.dots.map((d) => (d.kind === 'sale' ? { ...d, quantity: null } : d)) })]], /quantity/i);
});

/* ------------------------------------------------------------------- R-47 */

test('R-47 throws on a dot whose kind is neither regular nor sale, so a sale price can never be counted as regular by default', () => {
  assertLoud(
    [['promo', 'promo'], ['upper case', 'SALE'], ['empty', ''], ['undefined', undefined], ['null', null], ['clearance', 'clearance'], ['boolean', true]]
      .map(([label, kind]) => [`kind ${label}`, () => ({ ...FX.HIGH, dots: FX.HIGH.dots.map((d, j) => (j === 0 ? { ...d, kind } : d)) })]),
    /kind|sale|regular/i,
  );
});

/* ------------------------------------------------------------------- R-44 */

test('R-44 throws on a verdict word outside Great, Good, Reasonable, Bad', () => {
  const bad = ['amazing', 'GREAT', 'Great price', 'ok', '', 'walk_away', 'great ', 7];
  assertLoud(
    bad.map((zone) => [`zone ${JSON.stringify(zone)}`, () => withShopper(FX.HIGH, { ...FX.HIGH.shopper, zone })]),
    /zone|verdict|word/i,
  );
});

test('R-44 CONTROL: whatever the shelf price, the headline is one of the four words', () => {
  for (const cents of [1, 100, 300, 399, 470, 600, 720, 760, 5000, 100000]) {
    const html = render(verdictWith({ confidence: 'high', n: 4, dots: goodDots, shopperCents: cents }));
    const word = /<h2 class="vword[^"]*"[^>]*>([^<]*)<\/h2>/.exec(html)?.[1];
    assert.ok(['Great price', 'Good price', 'Reasonable price', 'Bad price'].includes(word), `${cents} cents: headline "${word}"`);
  }
});

/* ------------------------------------------------------------------- R-56 */

test('R-56 throws on a source the provenance row has no plain words for, never an answer with no source', () => {
  assertLoud(
    [['web_guess', 'web_guess'], ['null', null], ['undefined', undefined], ['empty', ''], ['upper case', 'OWN_PRICES'], ['number', 1]]
      .map(([label, basis]) => [`basis ${label}`, () => ({ ...FX.HIGH, basis })]),
    /basis|source|provenance/i,
  );
});

/* ------------------------------------------------------- R-67, R-70, R-41 */

test('R-67 throws on a shopper block that is present but cannot be marked, instead of quietly drawing no mark', () => {
  const s = FX.HIGH.shopper;
  assertLoud([
    ['price 0', () => withShopper(FX.HIGH, { ...s, cents: 0 })],
    ['price negative', () => withShopper(FX.HIGH, { ...s, cents: -469 })],
    ['price NaN', () => withShopper(FX.HIGH, { ...s, cents: Number.NaN })],
    ['price a string', () => withShopper(FX.HIGH, { ...s, cents: '469' })],
    ['price missing', () => withShopper(FX.HIGH, { zone: 'good', offByPct: -21.7, beyond: null, suspect: null })],
    ['beyond is neither low, high nor null', () => withShopper(FX.HIGH, { ...s, beyond: 'far' })],
  ], /shopper|price|cents|beyond/i);
});

test('R-70 throws on a "no price" that is really a broken price: an empty object, a bare number', () => {
  assertLoud([
    ['shopper {}', () => withShopper(FX.HIGH, {})],
    ['shopper is a number', () => withShopper(FX.HIGH, 469)],
    ['shopper is a string', () => withShopper(FX.HIGH, '$4.69')],
  ], /shopper|price|cents/i);
});

test('R-41 throws on a typed price that is not a price (negative, NaN, text); null and undefined still mean "none typed"', () => {
  const quiet = [];
  for (const typed of [-5, Number.NaN, 'abc', Infinity, {}]) {
    const why = probeFn(() => render(FX.HIGH, { typedCents: typed }), /typed|price|cents/i);
    if (why) quiet.push(`typedCents ${String(typed)}: ${why}`);
  }
  assert.deepEqual(quiet, [], 'a typed price that cannot be placed was ignored without a word');
});

/* ------------------------------------------------- nothing silent, anywhere */

test('R-40..R-70 nothing a valid verdict renders is an empty element or a placeholder word', () => {
  for (const [name, v] of ALL) {
    const html = render(v);
    assert.doesNotMatch(html, /<(?:h2|p|b|span|li)\b[^>]*>\s*<\/(?:h2|p|b|span|li)>/, `${name}: an empty element`);
    assert.doesNotMatch(html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' '), /\b(?:undefined|null|NaN|Infinity)\b/, `${name}: placeholder text`);
    assert.doesNotMatch(html, /="(?:undefined|null|NaN)"/, `${name}: a placeholder attribute value`);
  }
  assert.ok(VC && shopperBlock);
});
