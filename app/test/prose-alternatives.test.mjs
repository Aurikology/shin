/**
 * EVERY SWAP SENTENCE THE CATALOGUE CAN SAY, SAID IN FRENCH. D-097.
 *
 * The defect this file exists for is the one `prose-coverage.test.mjs`
 * describes, one package over. A cheaper-alternative row reached the glass as
 * a finished English sentence, "$5.99 at Metro, seen 2026-09-12.", printed
 * verbatim under a French badge that had just said "Même genre de chose", and
 * the heading over the list read "Cheaper Peanut butters". Nothing was broken:
 * `catalogue/src/alternatives.ts` wrote English and `screens/camera.js`
 * printed what it was given.
 *
 * The catalogue now ships `structuredLine` on every alternative and
 * `alternativesHeadingStructured` beside the heading, each a
 * `{ shape, fragments }` of codes plus RAW facts. This file is the other end
 * of the round trip `catalogue/test/alternatives.test.ts` opens:
 *
 *   1. IT COVERS THE WHOLE UNION. Every member of `AlternativeLineCode` is
 *      read out of `catalogue/src/alternatives.ts` on disk, the same trick and
 *      the same reason as the spine coverage test: the day the catalogue grows
 *      a swap code nobody has translated, this goes red before a French
 *      shopper meets it.
 *
 *   2. IT RENDERS EACH CODE WITH THE FACTS A REAL SCENARIO PRODUCES, taken
 *      from the fixtures in `catalogue/test/alternatives.test.ts`, and keeps
 *      the English those same facts produce beside it. The assertion is that
 *      the two carry the same DIGITS.
 *
 *   3. IT WATCHES THE PLACE CLAUSE. "At a store that reported this price" is
 *      an English clause rather than a name, and it is the half of the
 *      sentence that could not have been translated at all before this change.
 *      All four place shapes are exercised.
 *
 * NOTHING HERE HAS BEEN SEEN IN A BROWSER. These are the renderer and the row
 * builder called outside the DOM, the same trade `cheaper-rings.test.mjs` and
 * `price-only.test.mjs` make.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* A localStorage, for modules that expect a browser. Same stub and the same
 * reason as prose-coverage.test.mjs: `locale()` reads stored settings, and
 * `render` refuses to do anything at all outside French. */
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

const prose = await import('../public/js/prose.js');
const { cheaperList } = await import('../public/js/screens/camera.js');

/* ------------------------------------------------------------------ *
 * 1. The union, read off the catalogue rather than restated.
 * ------------------------------------------------------------------ */

const ALTERNATIVES = fileURLToPath(
  new URL('../../catalogue/src/alternatives.ts', import.meta.url),
);

/**
 * Every string literal in the `AlternativeLineCode` union.
 *
 * Comments are stripped first for the reason `prose-coverage.test.mjs` gives:
 * every member of that union is documented by a doc comment, those comments
 * quote other code, and a stray quote in one of them would otherwise decide
 * where this parser thinks the union ends.
 */
function altCodes() {
  const src = readFileSync(ALTERNATIVES, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const m = /export type AlternativeLineCode\s*=([^;]*);/.exec(src);
  assert.ok(m !== null, 'could not find the AlternativeLineCode union in alternatives.ts');
  const codes = [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
  assert.ok(codes.length >= 10, `only parsed ${codes.length} codes out of the union, the parser is wrong`);
  return codes;
}

test('the French swap table covers exactly the codes the catalogue defines', () => {
  const catalogue = altCodes();
  const french = prose.ALT_FRENCH_CODES;

  assert.equal(new Set(catalogue).size, catalogue.length, 'alternatives.ts lists a code twice');
  assert.equal(new Set(french).size, french.length, 'prose.js lists a swap code twice');

  const missing = catalogue.filter((c) => !french.includes(c));
  const extra = french.filter((c) => !catalogue.includes(c));
  assert.deepEqual(missing, [], `swap codes with no French: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `French for swap codes the catalogue cannot send: ${extra.join(', ')}`);
});

test('the swap codes are kept out of the verdict table, which is pinned to the spine', () => {
  // `prose-coverage.test.mjs` asserts FRENCH_CODES equals the spine's LineCode
  // union in BOTH directions. A swap code listed there would read as a code
  // the spine can send, and would take that test red for the wrong reason.
  for (const code of prose.ALT_FRENCH_CODES) {
    assert.ok(!prose.FRENCH_CODES.includes(code), `${code} is in both tables`);
  }
});

/* ------------------------------------------------------------------ *
 * 2. Every code, with the facts a real scenario produces and the English
 *    those same facts produce.
 *
 * The place objects, the dates and the allergen tags below are the ones the
 * scenarios in `catalogue/test/alternatives.test.ts` actually emit: Fortinos
 * in Kingston, walmart.ca matched by name, a feed nobody can name, and
 * '2025-08-28', the date that file uses precisely so the month table is
 * exercised rather than agreed with.
 * ------------------------------------------------------------------ */

const STORE_CITY = { kind: 'store', name: 'Fortinos', city: 'Kingston' };
const STORE_NO_CITY = { kind: 'store', name: 'Fortinos', city: null };
const SELLER = { kind: 'seller', seller: 'walmart.ca' };
const UNKNOWN = { kind: 'unknown' };

const CASES = [
  {
    code: 'alt_unit_price_cheaper',
    facts: {
      unitCents: 44, originalUnitCents: 80, perQuantity: 100, perUnit: 'g', place: STORE_CITY,
    },
    english: '$0.44 per 100 g at Fortinos, Kingston, against $0.80.',
  },
  {
    /* The unit price is a division and arrives fractional. The locale rounds
     * at its own formatter, which is the whole reason cents cross raw. */
    code: 'alt_unit_price_cheaper',
    facts: {
      unitCents: 66.66666666666667, originalUnitCents: 106.66666666666667,
      perQuantity: 100, perUnit: 'ml', place: STORE_NO_CITY,
    },
    english: '$0.67 per 100 ml at Fortinos, against $1.07.',
  },
  {
    code: 'alt_ticket_price_cheaper',
    facts: { amountCents: 500, originalAmountCents: 800, place: SELLER },
    english: '$5.00 at walmart.ca, against $8.00.',
  },
  {
    /* The clause that could not have been translated at any price: English
     * writes a whole sentence fragment where the other two write a name. */
    code: 'alt_ticket_price_cheaper',
    facts: { amountCents: 500, originalAmountCents: 800, place: UNKNOWN },
    english: '$5.00 at a store that reported this price, against $8.00.',
  },
  {
    code: 'alt_sizes_may_differ',
    facts: {},
    english: 'Sizes may differ.',
  },
  {
    code: 'alt_seen_on',
    facts: { observedAt: '2025-08-28' },
    english: 'Seen 28 August 2025.',
  },
  {
    code: 'alt_allergens_not_recorded',
    facts: {},
    english: 'Allergens not recorded for one of these. Check the packaging.',
  },
  {
    code: 'alt_allergens_no_difference',
    facts: {},
    english: 'No difference in the allergens recorded.',
  },
  {
    code: 'alt_allergens_added',
    facts: { added: ['en:milk', 'en:tree-nuts'] },
    english: 'Adds milk, tree nuts.',
  },
  {
    /* A tag with no French name keeps the English-derived one rather than
     * being dropped or guessed at. OFF's allergen field is contributor-entered
     * and most of its tags are rare; inventing French for one would be the app
     * making up a fact about a package. */
    code: 'alt_allergens_added',
    facts: { added: ['en:carrot'] },
    english: 'Adds carrot.',
    keepsEnglishName: 'carrot',
  },
  {
    code: 'alt_allergens_removed',
    facts: { removed: ['en:peanuts'] },
    english: 'Removes peanuts.',
  },
  {
    code: 'alternatives_cheaper_in_leaf',
    facts: { tag: 'en:peanut-butters', label: 'Peanut butters', count: 2 },
    english: 'Cheaper Peanut butters',
  },
  {
    /* An empty category path. The client is handed null and picks its own
     * word rather than being given the English one. */
    code: 'alternatives_cheaper_in_leaf',
    facts: { tag: null, label: null, count: 2 },
    english: 'Cheaper options',
  },
  {
    code: 'alternatives_none_priced',
    facts: {},
    english: 'No cheaper option we can price',
  },
];

/** One fragment, rendered on its own, in French. */
function french(c) {
  return inLocale('fr', () =>
    prose.render({ shape: 'single', fragments: [{ code: c.code, facts: c.facts }] }, 'FALLBACK'),
  );
}

/** Every digit in a string, in order. The one thing two languages must share. */
function digits(text) {
  return text.replace(/[^0-9]/g, '');
}

test('every case in this file names a code the catalogue has', () => {
  const known = new Set(altCodes());
  for (const c of CASES) assert.ok(known.has(c.code), `${c.code} is not an AlternativeLineCode`);
});

test('every swap code has a case here, with real facts behind it', () => {
  const covered = new Set(CASES.map((c) => c.code));
  const missing = altCodes().filter((c) => !covered.has(c));
  assert.deepEqual(missing, [], `swap codes with no fixture proving their French: ${missing.join(', ')}`);
});

test('every swap code renders a real French sentence rather than falling back', () => {
  for (const c of CASES) {
    const out = french(c);
    assert.notEqual(out, 'FALLBACK', `${c.code} fell back to English instead of rendering`);
    assert.ok(out.trim().length > 3, `${c.code} rendered almost nothing: ${out}`);
    assert.notEqual(out, c.english, `${c.code} came back in English`);
  }
});

test('no French swap sentence leaks a missing fact, an em dash, or English money', () => {
  for (const c of CASES) {
    const out = french(c);
    assert.ok(!out.includes('undefined'), `${c.code} put a missing fact on the screen: ${out}`);
    assert.ok(!out.includes('NaN'), `${c.code} put NaN on the screen: ${out}`);
    assert.ok(!out.includes('—'), `${c.code} uses an em dash: ${out}`);
    // French money is "4,99 $". A "$" in front of a digit means `cad()` was
    // bypassed and an English amount was interpolated raw.
    assert.ok(!/\$\s*\d/.test(out), `${c.code} writes money the English way: ${out}`);
  }
});

test('every number the English swap sentence shows survives into the French one', () => {
  for (const c of CASES) {
    const out = french(c);
    // Digit for digit rather than substring for substring: the punctuation is
    // MEANT to change ($0.44 becomes 0,44 $, "28 August 2025" becomes
    // "28 août 2025"), and the values are meant not to.
    assert.equal(
      digits(out),
      digits(c.english),
      `${c.code} does not carry the same numbers as its English:\n  en: ${c.english}\n  fr: ${out}`,
    );
  }
});

test('no raw taxonomy id or allergen tag reaches a French swap sentence', () => {
  for (const c of CASES) {
    const out = french(c);
    assert.doesNotMatch(out, /\b[a-z]{2}:[a-z]/, `${c.code} put a raw tag on the screen: ${out}`);
  }
});

test('an allergen with no French name keeps the English one rather than being dropped', () => {
  for (const c of CASES.filter((x) => x.keepsEnglishName)) {
    assert.ok(french(c).includes(c.keepsEnglishName), `${c.keepsEnglishName} was dropped: ${french(c)}`);
  }
});

test('the four shapes of place all produce a French clause, and an unknown shape does not', () => {
  const say = (place) => french({
    code: 'alt_ticket_price_cheaper',
    facts: { amountCents: 500, originalAmountCents: 800, place },
  });
  assert.match(say(STORE_CITY), /chez Fortinos, Kingston/);
  assert.match(say(STORE_NO_CITY), /chez Fortinos,/);
  assert.ok(!say(STORE_NO_CITY).includes('Kingston'), 'a city was invented for a store that has none');
  assert.match(say(SELLER), /chez walmart\.ca/);
  assert.match(say(UNKNOWN), /dans un magasin qui a signalé ce prix/);
  // A place kind from a catalogue build newer than this client. Rule 3: the
  // whole sentence goes back to English rather than losing its source, because
  // a row with no source on it reads as unsourced rather than sourced
  // differently, which is false.
  for (const bad of [{ kind: 'warehouse' }, { kind: 'store', name: '' }, null, 'Metro']) {
    assert.equal(say(bad), 'FALLBACK', `a place shaped ${JSON.stringify(bad)} was rendered anyway`);
  }
});

/* ------------------------------------------------------------------ *
 * 3. The whole line, which is what actually reaches the glass: several
 *    fragments under the `sentences` shape, joined with one space.
 * ------------------------------------------------------------------ */

/** The commonest row: a unit comparison, a date, and an allergen difference. */
const WHOLE_LINE = {
  shape: 'sentences',
  fragments: [
    {
      code: 'alt_unit_price_cheaper',
      facts: {
        unitCents: 44, originalUnitCents: 80, perQuantity: 100, perUnit: 'g', place: STORE_CITY,
      },
    },
    { code: 'alt_seen_on', facts: { observedAt: '2025-08-28' } },
    { code: 'alt_allergens_added', facts: { added: ['en:milk'] } },
  ],
};

const WHOLE_LINE_EN =
  '$0.44 per 100 g at Fortinos, Kingston, against $0.80. Seen 28 August 2025. Adds milk.';

test('a whole swap line renders as one French run under the sentences shape', () => {
  const out = inLocale('fr', () => prose.render(WHOLE_LINE, WHOLE_LINE_EN));
  assert.notEqual(out, WHOLE_LINE_EN, 'the line came back in English');
  assert.equal(digits(out), digits(WHOLE_LINE_EN), `numbers changed:\n  en: ${WHOLE_LINE_EN}\n  fr: ${out}`);
  // One space between sentences, and no double space where a fragment ended.
  assert.ok(!/ {2}/.test(out), `the join left a double space: ${out}`);
  assert.equal(out.split('. ').length, 3, `the three sentences did not survive: ${out}`);
});

test('one untranslated fragment takes the whole swap line back to English, not half of it', () => {
  const half = {
    shape: 'sentences',
    fragments: [
      ...WHOLE_LINE.fragments,
      { code: 'alt_something_added_next_year', facts: {} },
    ],
  };
  assert.equal(inLocale('fr', () => prose.render(half, WHOLE_LINE_EN)), WHOLE_LINE_EN);
});

test('English is returned untouched, byte for byte, whatever the structured line says', () => {
  assert.equal(inLocale('en', () => prose.render(WHOLE_LINE, WHOLE_LINE_EN)), WHOLE_LINE_EN);
  for (const c of CASES) {
    const out = inLocale('en', () =>
      prose.render({ shape: 'single', fragments: [{ code: c.code, facts: c.facts }] }, c.english),
    );
    assert.equal(out, c.english, `${c.code} changed an English sentence`);
  }
});

/* ------------------------------------------------------------------ *
 * 4. THE CONSUMER. `swapRow` is what puts the sentence on the glass, and
 *    the row is rendered here for real rather than asserted about.
 * ------------------------------------------------------------------ */

/** One alternative in the shape the server forwards it. */
function swap(structuredLine, line) {
  const a = { product: { name: 'Store Peanut Butter', nameFr: null, brands: null, quantity: null }, line };
  if (structuredLine !== undefined) a.structuredLine = structuredLine;
  a.ring = 'leaf';
  a.ringTag = 'en:peanut-butters';
  return a;
}

test('a swap row prints the structured line in French, not the English one beside it', () => {
  const html = inLocale('fr', () => cheaperList('Moins cher: beurres d\'arachide', [swap(WHOLE_LINE, WHOLE_LINE_EN)]));
  assert.ok(!html.includes(WHOLE_LINE_EN), `the English sentence is still on the row:\n${html}`);
  assert.ok(html.includes('par 100 g chez Fortinos, Kingston'), `the French sentence is not on the row:\n${html}`);
  assert.ok(html.includes('28 août 2025'), `the date did not cross into French:\n${html}`);
});

test('a swap row with no structured line prints the English one, exactly as before', () => {
  // The state every older catalogue build is in, and the one this change must
  // not make worse. The negative case is the important one.
  for (const id of ['en', 'fr']) {
    const html = inLocale(id, () => cheaperList('Cheaper peanut butters', [swap(undefined, WHOLE_LINE_EN)]));
    assert.ok(html.includes('$0.44 per 100 g at Fortinos, Kingston'),
      `${id}: the row lost its sentence when no structured line was sent:\n${html}`);
  }
});

test('an English reader sees the catalogue bytes on the row, never a rebuilt sentence', () => {
  const html = inLocale('en', () => cheaperList('Cheaper peanut butters', [swap(WHOLE_LINE, WHOLE_LINE_EN)]));
  assert.ok(html.includes('$0.44 per 100 g at Fortinos, Kingston'),
    `the English row was rebuilt instead of printed:\n${html}`);
});
