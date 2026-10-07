/**
 * The catalogue-first answer on the camera: what the shopper sees when
 * `/api/identify` answers a barcode with `{ kind: 'catalogue', ... }` (server
 * setting SHIN_CATALOGUE_FIRST on; shape in app/src/catalogue-first.ts).
 *
 * RULINGS.md "Catalogue first; Gemini is a capped fallback, never the identity"
 * and "The price line speaks the shopper's own range, never Pexi's opinion".
 * What this file holds shut:
 *
 *   - each basis gets its own provenance line, and the AI one says when it was
 *     asked;
 *   - a null range still shows the product, with a sentence and never the code;
 *   - not in the catalogue offers exactly one primary action, into the existing
 *     type-it route;
 *   - a shelf price is placed with the SHOPPER'S lines, in the price line's own
 *     three zone words, and the zone moves when the shopper's lines move;
 *   - French money is `4,99 $`, through lib/money.js;
 *   - the camera routes `kind: 'catalogue'` to this sheet and nowhere else;
 *   - every new string passes the same ban lists the price line keeps.
 *
 * NOT VERIFIED HERE: layout. There is no browser in this suite.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* A localStorage, for modules that expect a browser: `locale()` reads the
   stored setting, and store.js loads its state at import. Same stub as
   prose-alternatives.test.mjs. */
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

const { catalogueSheet } = await import('../public/js/screens/camera.js');
const { t } = await import('../public/js/ui-strings.js');
const { placeShelf, middleCents, provenanceOf, noRangeKey, askedDate, shelfCentsOf, usableRange } = await import('../public/js/lib/catalogue-range.js');
const { money } = await import('../public/js/lib/money.js');

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const IDENTITY = {
  name: 'Crunchy Peanut Butter',
  brand: 'Kraft',
  size: '1 kg',
  barcode: '0068100084245',
  category: { tag: 'en:peanut-butters', name: 'Peanut butters' },
};

function hit(range, top = {}) {
  return {
    kind: 'catalogue',
    outcome: 'catalogue_hit',
    offerManualEntry: false,
    catalogueUp: true,
    barcode: '0068100084245',
    identity: IDENTITY,
    range,
    rangeSource: range ? (range.basis === 'gemini_typical' ? 'gemini_typical' : 'shin_prices') : null,
    rangeAskedAt: null,
    noRangeReason: null,
    shelfPrice: null,
    ms: 3,
    ...top,
  };
}

const RANGE = (over = {}) => ({
  lowCents: 499,
  highCents: 699,
  medianCents: 599,
  n: 4,
  basis: 'this_product',
  category: null,
  currency: 'CAD',
  unit: null,
  ...over,
});

const MISS = {
  kind: 'catalogue',
  outcome: 'not_in_catalogue',
  offerManualEntry: true,
  catalogueUp: true,
  barcode: '0000000000017',
  identity: null,
  range: null,
  rangeSource: null,
  rangeAskedAt: null,
  noRangeReason: null,
  shelfPrice: null,
  ms: 2,
};

/** Default lines (10% under, 10% over), set explicitly so the test does not lean on the defaults. */
const TEN_TEN = { lineUnit: 'percent', lineGreatPct: 20, lineUnderPct: 10, lineOverPct: 10 };

const attr = (html, name) => html.match(new RegExp(`<section class="sheet catalogue"[^>]*\\b${name}="([^"]*)"`))?.[1];
/** An element's text, as the browser would show it (escapeHtml's five entities undone). */
const unescape = (s) => s?.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const between = (html, marker) => unescape(html.match(new RegExp(`${marker}>([^<]*)<`))?.[1]);

/* ================================================================ the bases == */

test('this_product: the range is low to high in the shopper\'s currency, from Pexi\'s own prices at N stores', () => {
  const html = inLocale('en', () => catalogueSheet(hit(RANGE()), { state: TEN_TEN }));
  assert.equal(between(html, 'data-cat-range'), '$4.99 to $6.99');
  assert.equal(between(html, 'data-cat-basis'), "From Pexi's own prices at 4 stores");
  assert.equal(attr(html, 'data-basis'), 'this_product');
  assert.equal(attr(html, 'data-outcome'), 'catalogue_hit');
  // No shelf price: no zone, and the product itself leads.
  assert.equal(attr(html, 'data-zone'), '');
  assert.equal(attr(html, 'data-tier'), 'unknown');
  assert.equal(between(html, 'data-cat-headline'), 'Kraft Crunchy Peanut Butter 1 kg');
  // One store is said as one store.
  const one = inLocale('en', () => catalogueSheet(hit(RANGE({ n: 1 })), { state: TEN_TEN }));
  assert.equal(between(one, 'data-cat-basis'), "From Pexi's own prices at 1 store");
});

test('leaf_category and parent_category: from similar products in the category the range came from', () => {
  for (const basis of ['leaf_category', 'parent_category']) {
    const range = RANGE({ basis, n: 37, category: { tag: 'en:spreads', name: 'Spreads' } });
    const html = inLocale('en', () => catalogueSheet(hit(range), { state: TEN_TEN }));
    assert.equal(between(html, 'data-cat-basis'), 'From similar products in Spreads', basis);
    assert.equal(attr(html, 'data-basis'), basis);
  }
  // No category on the range: the product's own category, never an empty "in ".
  const bare = inLocale('en', () => catalogueSheet(hit(RANGE({ basis: 'leaf_category', category: null })), { state: TEN_TEN }));
  assert.equal(between(bare, 'data-cat-basis'), 'From similar products in Peanut butters');
});

test('gemini_typical: a typical range estimated by AI, with the date it was asked, in both languages', () => {
  const range = RANGE({ basis: 'gemini_typical', medianCents: null, n: null });
  const answer = hit(range, { rangeAskedAt: '2026-09-27T16:00:00.000Z' });
  const en = inLocale('en', () => catalogueSheet(answer, { state: TEN_TEN }));
  assert.equal(between(en, 'data-cat-basis'), 'A typical range estimated by AI, asked September 27, 2026');
  assert.equal(between(en, 'data-cat-range'), '$4.99 to $6.99');
  const fr = inLocale('fr', () => catalogueSheet(answer, { state: TEN_TEN }));
  assert.equal(between(fr, 'data-cat-basis'), 'Une fourchette habituelle estimée par l’IA, demandée le 27 septembre 2026');
  // A time no clock can read: the sentence without a date, never "asked Invalid Date".
  const noDate = inLocale('en', () => catalogueSheet(hit(range, { rangeAskedAt: 'yesterday' }), { state: TEN_TEN }));
  assert.equal(between(noDate, 'data-cat-basis'), 'A typical range estimated by AI');
  // The four bases say four different things.
  const lines = new Set(['this_product', 'leaf_category', 'gemini_typical'].map((b) =>
    between(inLocale('en', () => catalogueSheet(hit(RANGE({ basis: b, category: { tag: 'x', name: 'Spreads' } }), { rangeAskedAt: '2026-09-27T16:00:00Z' }), { state: TEN_TEN })), 'data-cat-basis')));
  assert.equal(lines.size, 3);
});

test('a range that says what one price buys is shown with its unit, and no shelf price is placed against it', () => {
  const range = RANGE({ basis: 'gemini_typical', medianCents: null, n: null, unit: '1 kg jar' });
  const html = inLocale('en', () => catalogueSheet(hit(range), { shelfCents: 999, state: TEN_TEN }));
  assert.equal(between(html, 'data-cat-range'), '$4.99 to $6.99, for 1 kg jar');
  assert.equal(attr(html, 'data-zone'), '', 'a shelf price was placed against a per-unit range');
});

/* ============================================================== null range == */

test('no range: the product still shows, with a sentence keyed on the reason and never the raw code', () => {
  for (const [reason, key] of [
    ['monthly_cap_reached', 'cat_no_range_later'],
    ['rate_limited', 'cat_no_range_later'],
    ['no_api_key', 'cat_no_range'],
    ['model_does_not_know', 'cat_no_range'],
    ['a_code_from_the_future', 'cat_no_range'],
    [null, 'cat_no_range'],
  ]) {
    assert.equal(noRangeKey(reason), key, String(reason));
    const html = inLocale('en', () => catalogueSheet(hit(null, { noRangeReason: reason }), { shelfCents: 599, state: TEN_TEN }));
    assert.equal(between(html, 'data-cat-no-range'), t(key));
    assert.equal(between(html, 'data-cat-headline'), 'Kraft Crunchy Peanut Butter 1 kg', 'the product is gone');
    assert.doesNotMatch(html, /data-cat-range|data-cat-basis/);
    assert.equal(attr(html, 'data-zone'), '', 'a zone with no range to place it in');
    assert.equal(attr(html, 'data-conf'), 'refuses');
    if (reason) assert.ok(!html.includes(reason), `the raw code ${reason} reached the sheet`);
  }
});

test('a malformed range is treated as no range, never half drawn', () => {
  for (const bad of [RANGE({ lowCents: null }), RANGE({ lowCents: 900, highCents: 500 }), RANGE({ basis: 'vibes' }), RANGE({ lowCents: 0 })]) {
    assert.equal(usableRange(bad), null);
    const html = catalogueSheet(hit(bad), { state: TEN_TEN });
    assert.match(html, /data-cat-no-range/);
  }
});

/* ======================================================== not in catalogue == */

test('not in the catalogue: one primary action, into the existing type-it route, carrying the price', () => {
  const html = inLocale('en', () => catalogueSheet(MISS, { state: TEN_TEN }));
  assert.equal(attr(html, 'data-outcome'), 'not_in_catalogue');
  const primaries = [...html.matchAll(/class="pill solid[^"]*"/g)];
  assert.equal(primaries.length, 1, 'exactly one primary action');
  assert.match(html, /<button type="button" class="pill solid wide" data-act="typeit" data-carry-price>Type the product name<\/button>/);
  assert.equal(between(html, 'data-cat-headline'), t('cat_not_found'));
  // Without the offer the action is not drawn.
  const none = catalogueSheet({ ...MISS, offerManualEntry: false }, { state: TEN_TEN });
  assert.doesNotMatch(none, /data-act="typeit"/);
});

test('the camera hands "typeit" to the one typed-search flow it already has, and a carried price is not asked twice', () => {
  const src = read('../public/js/screens/camera.js');
  // One text route sheet, one submit, one runTypedSearch: nothing new was built beside them.
  assert.equal((src.match(/function textRouteSheet\(/g) ?? []).length, 1);
  assert.equal((src.match(/async function runTypedSearch\(/g) ?? []).length, 1);
  const typeit = src.slice(src.indexOf("if (act === 'typeit') {"), src.indexOf("if (act === 'typeit') {") + 700);
  assert.match(typeit, /typedAfterPad = btn\.hasAttribute\('data-carry-price'\) \? \{ cents: scanShelfCents \} : null;/);
  assert.match(typeit, /slot\.innerHTML = textRouteSheet\(\);/);
  assert.match(src, /if \(typedAfterPad\) \{\s*const \{ cents \} = typedAfterPad;\s*typedAfterPad = null;\s*await runTypedSearch\(text, cents, true\);/);
});

/* ============================================================ shelf price == */

test('a shelf price is placed with the shopper\'s own lines, in the price line\'s three zone words', () => {
  const range = RANGE(); // middle 5.99
  const cases = [
    [520, 'under_your_line', 'priceline_zone_under', 'good'],
    [599, 'middle', 'priceline_zone_middle', 'fair'],
    [680, 'over_your_line', 'priceline_zone_over', 'walk_away'],
  ];
  for (const [cents, zone, key, tier] of cases) {
    const html = inLocale('en', () => catalogueSheet(hit(range), { shelfCents: cents, state: TEN_TEN }));
    assert.equal(attr(html, 'data-zone'), zone, `${cents}`);
    assert.equal(attr(html, 'data-tier'), tier, `${cents}`);
    assert.equal(between(html, 'data-cat-headline'), t(key));
    assert.equal(between(html, 'data-cat-name'), 'Kraft Crunchy Peanut Butter 1 kg', 'the product is gone under the zone word');
    assert.equal(between(html, 'data-cat-shelf'), `Shelf price: ${money(cents, 'CAD', 'en-CA')}`);
  }
});

test('the same price moves zone when the SHOPPER\'s lines move, which is the whole point', () => {
  const range = RANGE(); // middle 599
  // 540 is 9.8% under the middle: middle at 10%, under at 5%.
  assert.equal(placeShelf(540, range, TEN_TEN).zone, 'middle');
  assert.equal(placeShelf(540, range, { lineUnit: 'percent', lineUnderPct: 5, lineOverPct: 10 }).zone, 'under_your_line');
  // 650 is 8.5% over: middle at 10%, over at 5%.
  assert.equal(placeShelf(650, range, TEN_TEN).zone, 'middle');
  assert.equal(placeShelf(650, range, { lineUnit: 'percent', lineUnderPct: 10, lineOverPct: 5 }).zone, 'over_your_line');
  // Dollar mode: money per item from the middle.
  const dollars = { lineUnit: 'amount', lineAmounts: { great: 2, good: 1, bad: 1 } };
  assert.equal(placeShelf(499, range, dollars).zone, 'under_your_line'); // $1.00 under
  assert.equal(placeShelf(500, range, dollars).zone, 'middle'); // $0.99 under
  assert.equal(placeShelf(700, range, dollars).zone, 'over_your_line'); // $1.01 over
  // The boundaries are gauge.ts's: exactly at the under line is under, exactly at the over line is not over.
  const mid = { ...range, medianCents: 1000 };
  assert.equal(placeShelf(900, mid, TEN_TEN).zone, 'under_your_line');
  assert.equal(placeShelf(1100, mid, TEN_TEN).zone, 'middle');
  // No lines set at all: the same defaults the server applies, his 2026-09-17
  // numbers (D10): good 20% under, bad 20% over. 10% under is no longer under.
  assert.equal(placeShelf(900, mid, {}).zone, 'middle');
  assert.equal(placeShelf(800, mid, {}).zone, 'under_your_line');
  assert.equal(placeShelf(1200, mid, {}).zone, 'middle'); // exactly at the over line is not over
  assert.equal(placeShelf(1201, mid, {}).zone, 'over_your_line');
  // gemini_typical has no median: the midpoint of low and high is the middle.
  assert.equal(middleCents(RANGE({ medianCents: null, lowCents: 400, highCents: 800 })), 600);
  // Through the sheet, with lines passed in.
  const html = catalogueSheet(hit(range), { shelfCents: 540, state: { lineUnit: 'percent', lineUnderPct: 5, lineOverPct: 10 } });
  assert.equal(attr(html, 'data-zone'), 'under_your_line');
});

test('the shopper\'s typed price wins, else the weighed label the server read', () => {
  assert.equal(shelfCentsOf(599, { cents: 450, from: 'weighed_label' }), 599);
  assert.equal(shelfCentsOf(null, { cents: 450, from: 'weighed_label' }), 450);
  assert.equal(shelfCentsOf(null, null), null);
  const html = inLocale('en', () => catalogueSheet(hit(RANGE(), { shelfPrice: { cents: 520, from: 'weighed_label' } }), { state: TEN_TEN }));
  assert.equal(attr(html, 'data-zone'), 'under_your_line');
  assert.equal(between(html, 'data-cat-shelf'), 'Shelf price: $5.20');
});

/* ================================================================== French == */

test('French money is 4,99 $, the range reads "à", and the zone word is the French one', () => {
  const html = inLocale('fr', () => catalogueSheet(hit(RANGE()), { shelfCents: 520, state: TEN_TEN }));
  const NBSP = ' ';
  assert.equal(between(html, 'data-cat-range'), `4,99${NBSP}$ à 6,99${NBSP}$`);
  assert.equal(between(html, 'data-cat-shelf'), inLocale('fr', () => t('cam_gem_shelf', { label: `5,20${NBSP}$` })));
  assert.ok(between(html, 'data-cat-shelf').endsWith(`5,20${NBSP}$`), 'the shelf price is not French money');
  assert.equal(between(html, 'data-cat-headline'), inLocale('fr', () => t('priceline_zone_under')));
  assert.equal(between(html, 'data-cat-basis'), 'D’après les prix de Pexi dans 4 magasins');
  assert.doesNotMatch(html, /\$\d/, 'a dollar sign in front of a number in French');
});

/* ============================================================== strings == */

/** Every key this lane added. */
const KEYS = ['cat_range', 'cat_range_unit', 'cat_range_label', 'cat_basis_shin', 'cat_basis_shin_one', 'cat_basis_shin_bare',
  'cat_basis_category', 'cat_basis_category_bare', 'cat_basis_ai', 'cat_basis_ai_asked', 'cat_no_range', 'cat_no_range_later',
  'cat_not_found', 'cat_type_name', 'tm_heading', 'tm_label', 'tm_none', 'tm_dev_label'];
const FACTS = { low: '$4.99', high: '$6.99', unit: '1 kg', n: '4', category: 'Spreads', date: 'September 27, 2026' };

test('every new string exists in both languages, and the French is not the English', () => {
  for (const key of KEYS) {
    const en = inLocale('en', () => t(key, FACTS));
    const fr = inLocale('fr', () => t(key, FACTS));
    assert.notEqual(en, key, `${key} is missing in English`);
    assert.notEqual(fr, key, `${key} is missing in French`);
    assert.notEqual(fr, en, `${key} falls back to English in French`);
  }
});

test('no new string, and no rendered catalogue sheet, grades the price (the price line\'s ban lists)', () => {
  /* The lists test/grounded-client.test.mjs keeps for the price line, plus the
     French tier words test/prose-coverage.test.mjs keeps. Copied, as those
     files copy theirs, because neither exports its list. */
  const BANNED = {
    en: ['good', 'fair', 'high', 'higher', 'walk away', 'deal', 'cheap', 'cheaper', 'expensive',
      'overpriced', 'steal', 'steep', 'bargain', 'rip-off', 'ripoff', 'robbery',
      'over the usual', 'under the usual', 'great', 'bad', 'reasonable', 'factually'],
    fr: ['cher', 'chère', 'chers', 'chères', 'bon prix', 'aubaine', 'aubaines', 'salé', 'salée', 'élevé',
      'élevée', 'élevés', 'rabais', 'vol', 'volent', 'laisse faire', 'au-dessus du prix', 'en dessous du prix',
      'bonne affaire', 'juste', 'moins cher', 'passe ton tour'],
  };
  const boundaried = (w) => new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu');
  // The canary: a regex that matched nothing would pass everything below.
  assert.match('That is expensive.', boundaried('expensive'));
  assert.doesNotMatch('des produits semblables', boundaried('cher'));

  const bad = [];
  for (const id of ['en', 'fr']) {
    const texts = KEYS.map((k) => inLocale(id, () => t(k, FACTS)));
    // The sheets as rendered, text only (tags and attribute values dropped).
    const sheets = inLocale(id, () => [
      catalogueSheet(hit(RANGE()), { shelfCents: 520, state: TEN_TEN }),
      catalogueSheet(hit(RANGE()), { shelfCents: 599, state: TEN_TEN }),
      catalogueSheet(hit(RANGE()), { shelfCents: 680, state: TEN_TEN }),
      catalogueSheet(hit(RANGE({ basis: 'leaf_category', category: { tag: 'x', name: 'Spreads' } })), { state: TEN_TEN }),
      catalogueSheet(hit(RANGE({ basis: 'gemini_typical', medianCents: null }), { rangeAskedAt: '2026-09-27T16:00:00Z' }), { state: TEN_TEN }),
      catalogueSheet(hit(null, { noRangeReason: 'monthly_cap_reached' }), { state: TEN_TEN }),
      catalogueSheet(hit(null, { noRangeReason: 'no_api_key' }), { state: TEN_TEN }),
      catalogueSheet(MISS, { state: TEN_TEN }),
    ]);
    for (const h of sheets) {
      const visible = h.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]*>/g, ' ');
      // Pexi's own bubble lines (voice.js) are checked by their own tests; the
      // product name is catalogue data. What is left is this lane's chrome.
      texts.push(visible);
    }
    for (const line of texts) {
      for (const word of BANNED[id]) {
        if (boundaried(word).test(line)) bad.push(`${id}: "${word}" in ${JSON.stringify(line.trim().slice(0, 160))}`);
      }
    }
  }
  assert.deepEqual(bad, [], 'A catalogue answer graded a price. Change the string, never the list.');
});

test('the sheets are rendered in French too, not only their strings', () => {
  const html = inLocale('fr', () => catalogueSheet(MISS, { state: TEN_TEN }));
  assert.match(html, />Tape le nom du produit</);
  assert.match(html, /Ce code-barres n’est pas encore dans le catalogue de Pexi\./);
});

/* =============================================================== routing == */

test('the camera routes kind "catalogue" to this sheet, before the older barcode branches, and never to /api/price', () => {
  const src = read('../public/js/screens/camera.js');
  const lookup = src.slice(src.indexOf('async function catalogueLookup('), src.indexOf('function sameCode('));
  const at = lookup.indexOf("if (id?.kind === 'catalogue') return { catalogue: id };");
  assert.ok(at > 0, 'catalogueLookup does not recognise the catalogue answer');
  assert.ok(at < lookup.indexOf('id.unchecked?.label'), 'the catalogue branch sits after the unchecked-label branch');
  assert.ok(at > lookup.indexOf("id?.failure === 'rate_limited'"), 'a throttle would be read as a catalogue answer');
  const resolve = src.slice(src.indexOf('async function resolveBarcode('), src.indexOf('async function catalogueLookup('));
  const branch = resolve.indexOf('if (found?.catalogue) {');
  assert.ok(branch > 0 && branch < resolve.indexOf('proceed({ ...found, scannedGtin: code }'), 'a catalogue answer would be sent on to proceed() and /api/price');
  assert.match(resolve, /if \(found\?\.catalogue\) \{\s*showCatalogue\(found\.catalogue, cents\);\s*return;\s*\}/);
});

test('helpers: provenance keys, dates', () => {
  assert.deepEqual(provenanceOf(RANGE()), { key: 'cat_basis_shin', facts: { n: '4' } });
  assert.deepEqual(provenanceOf(RANGE({ n: null })), { key: 'cat_basis_shin_bare', facts: {} });
  assert.deepEqual(provenanceOf(RANGE({ basis: 'parent_category', category: null })), { key: 'cat_basis_category_bare', facts: {} });
  assert.deepEqual(provenanceOf(RANGE({ basis: 'gemini_typical' })), { key: 'cat_basis_ai', facts: {} });
  assert.equal(provenanceOf(null), null);
  assert.equal(askedDate('2026-09-27T16:00:00Z', 'fr-CA'), '27 septembre 2026');
  assert.equal(askedDate('', 'en-CA'), '');
  assert.equal(askedDate(null, 'en-CA'), '');
});
