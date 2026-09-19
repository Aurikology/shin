/**
 * The leaf/parent swap rule, which is D-036's sentence made true.
 *
 * D-036, verbatim: "it is the word 'cheaper' doing the lying, since it implies
 * 'instead of this'." The catalogue now answers that by looking on the LEAF
 * category first and stepping ONE level up to the PARENT only when the leaf is
 * empty, and by saying which it did on every row: `ring: 'leaf' | 'parent'`
 * and a `ringTag`. A leaf swap really is "instead of this". A parent swap is
 * one shelf wider, and if the shopper cannot see that at a glance the word
 * "cheaper" is still lying, just about a different row.
 *
 * FIXTURES, NOT THE CATALOGUE, AND THAT IS THE POINT. The rows below are hand
 * built against the field contract, not read out of `catalogue/src`. The
 * catalogue half of this change may not be merged when this file runs, and the
 * thing worth testing is not that the two packages were landed in the same
 * hour: it is that this package is correct for a row that carries the fields
 * AND for a row that does not, which is the state every older build is in.
 *
 * THE NEGATIVE TEST IS THE IMPORTANT ONE, and it is stated here rather than
 * left implicit. A swap with NO `ring` must be treated as a leaf swap and must
 * NEVER be labelled looser. The two readings of that absence are not
 * symmetric. Reading it as parent stamps "looser" over rows that are not,
 * which makes the qualifier worthless on the rows that need it; reading it as
 * leaf leaves those rows exactly as they read before this change. Looser is
 * the claim that needs an explicit signal, so only an explicit 'parent' earns
 * one.
 *
 * NOTHING HERE HAS BEEN SEEN IN A BROWSER. These are the string builder and
 * the response body, rendered outside the DOM, the same trade
 * `price-only.test.mjs` and `shops.test.mjs` make.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { cheaperList, ringOf, humaniseTag } from '../public/js/screens/camera.js';
import { say } from '../public/js/voice.js';
import { t, TABLES } from '../public/js/ui-strings.js';

/* ------------------------------------------------------------------ *
 * Fixtures: alternatives in the shape the server forwards them.
 * ------------------------------------------------------------------ */

/**
 * One alternative. `ring` and `ringTag` are omitted entirely when not given,
 * rather than set to null: an older build does not send the key at all, and a
 * fixture that sends `ring: undefined` would be testing a case that cannot
 * occur over JSON.
 */
function swap(name, line, ring, ringTag) {
  const a = { product: { name, nameFr: null, brands: null, quantity: null }, line };
  if (ring !== undefined) a.ring = ring;
  if (ringTag !== undefined) a.ringTag = ringTag;
  return a;
}

/*
 * The ringTags are REAL Open Food Facts taxonomy ids, not pre-prettied labels.
 * That is the shape the catalogue actually sends, and a fixture that quietly
 * handed the renderer "Apples" would have tested everything except the one
 * thing that reached the glass: "Same kind of thing: en:apples".
 */
const LEAF = swap('Honeycrisp Apples', '$0.44 per 100 g at Fortinos, Kingston.', 'leaf', 'en:apples');
const PARENT = swap('Bartlett Pears', '$0.39 per 100 g at Fortinos, Kingston.', 'parent', 'en:dried-fruits');
const NO_RING = swap('Gala Apples', '$0.41 per 100 g at Fortinos, Kingston.');

/** The locale swap `price-only.test.mjs` uses; `locale()` reads localStorage. */
function inLocale(id, fn) {
  const hadStore = 'localStorage' in globalThis;
  const before = hadStore ? globalThis.localStorage : undefined;
  const cell = new Map([['shin.locale', id]]);
  globalThis.localStorage = {
    getItem: (k) => (cell.has(k) ? cell.get(k) : null),
    setItem: (k, v) => cell.set(k, String(v)),
    removeItem: (k) => cell.delete(k),
  };
  try {
    return fn();
  } finally {
    if (hadStore) globalThis.localStorage = before;
    else delete globalThis.localStorage;
  }
}

/** Where in the rendered block a row sits, so order can be asserted. */
const at = (html, needle) => html.indexOf(needle);

/* ------------------------------------------------------------------ *
 * 1. A leaf swap reads as a substitute; a parent swap reads as looser.
 * ------------------------------------------------------------------ */

test('a leaf swap is labelled as the same kind of thing, not as looser', () => {
  const html = inLocale('en', () => cheaperList('Cheaper apples', [LEAF]));
  assert.match(html, /data-ring="leaf"/);
  assert.ok(html.includes(TABLES.en.cam_swap_same_in({ tag: 'Apples' })),
    `the leaf badge is missing or reworded:\n${html}`);
  assert.ok(!html.includes('en:apples'), `the raw taxonomy id reached the glass:\n${html}`);
  assert.ok(!/[Ll]ooser/.test(html), `a leaf swap was called looser:\n${html}`);
});

test('a parent swap says it is looser and says it stepped one category up', () => {
  const html = inLocale('en', () => cheaperList('Cheaper apples', [PARENT]));
  assert.match(html, /data-ring="parent"/);
  const label = TABLES.en.cam_swap_looser_in({ tag: 'Dried fruits' });
  assert.ok(html.includes(label), `the looser badge is missing or reworded:\n${html}`);
  assert.ok(!html.includes('en:dried-fruits'), `the raw taxonomy id reached the glass:\n${html}`);
  // D-036's own sentence: "cheaper" implies "instead of this". The qualifier
  // has to be on the row, not only in a heading a shopper can skim past.
  assert.ok(/looser/i.test(label) && /one category up/i.test(label),
    `the English looser label no longer says both halves: ${label}`);
});

test('a parent swap still carries its label when the catalogue named no tag', () => {
  const html = inLocale('en', () => cheaperList('Cheaper apples', [swap('Pears', 'a line.', 'parent')]));
  assert.ok(html.includes(TABLES.en.cam_swap_looser),
    `the looser claim was dropped because an optional string was absent:\n${html}`);
});

/* ------------------------------------------------------------------ *
 * 2. THE NEGATIVE TEST. Missing ring is leaf, and is never looser.
 * ------------------------------------------------------------------ */

test('a swap with no ring field is treated as a leaf swap', () => {
  assert.equal(ringOf(NO_RING), 'leaf');
  assert.equal(ringOf({}), 'leaf');
  assert.equal(ringOf(null), 'leaf');
  // Anything that is not the exact string 'parent' is leaf. A truthy stray
  // value must not be read as a step up either.
  assert.equal(ringOf({ ring: 'PARENT' }), 'leaf');
  assert.equal(ringOf({ ring: true }), 'leaf');
});

test('a swap with no ring field is NEVER labelled looser, in either language', () => {
  for (const id of ['en', 'fr']) {
    const html = inLocale(id, () => cheaperList('Cheaper apples', [NO_RING]));
    assert.ok(html.includes(TABLES[id].cam_swap_same),
      `${id}: a ringless swap lost its substitute label:\n${html}`);
    assert.ok(!html.includes(TABLES[id].cam_swap_looser),
      `${id}: a swap that never claimed to be a step up was labelled looser. ` +
      'Missing means leaf; looser is the claim that needs an explicit signal.');
    assert.ok(!html.includes(TABLES[id].cam_swap_all_looser),
      `${id}: a ringless list was qualified as entirely one category up`);
    assert.match(html, /data-ring="leaf"/);
  }
});

test('a ringless swap mixed in with a real parent swap is not dragged looser with it', () => {
  const html = inLocale('en', () => cheaperList('Cheaper apples', [PARENT, NO_RING]));
  assert.ok(at(html, 'data-ring="leaf"') < at(html, 'data-ring="parent"'),
    'the ringless row did not sort as a leaf row');
  assert.ok(!html.includes(TABLES.en.cam_swap_all_looser),
    'a list holding one ringless row was called entirely looser');
  assert.equal(html.split('data-ring="parent"').length - 1, 1,
    'the ringless row was counted as a parent row');
});

/* ------------------------------------------------------------------ *
 * 2b. The tag is humanised before it reaches the glass. D-011's shape.
 * ------------------------------------------------------------------ */

test('a taxonomy id is rendered as words a shopper reads', () => {
  // The three found at 390px, plus the shape of each.
  assert.equal(humaniseTag('en:apples'), 'Apples');
  assert.equal(humaniseTag('en:dried-fruits'), 'Dried fruits');
  assert.equal(humaniseTag('en:cereals-and-their-products'), 'Cereals and their products');
  // Only the FIRST letter, never every word, and the rest lower-cased. This is
  // labelForTag from catalogue/src/alternatives.ts, which is what wrote the
  // heading above these rows; two spellings of one category on one sheet is
  // the thing being avoided, and that file's own comment says so.
  assert.equal(humaniseTag('en:coca-cola'), 'Coca cola');
  assert.equal(humaniseTag('En:Dried-Fruits'), 'Dried fruits');
  // Any two-letter language prefix, not only en:, for the same reason.
  assert.equal(humaniseTag('fr:pommes'), 'Pommes');
});

test('a tag with no language prefix passes through', () => {
  assert.equal(humaniseTag('apples'), 'Apples');
  assert.equal(humaniseTag('dried-fruits'), 'Dried fruits');
  assert.equal(humaniseTag('Apples'), 'Apples');
  // A colon that is not a two-letter prefix is not a prefix.
  assert.equal(humaniseTag('brand:apples'), 'Brand:apples');
});

test('a tag that humanises to nothing falls back to the untagged label, not a dangling colon', () => {
  for (const empty of ['', '   ', 'en:', '-', undefined, null, 42]) {
    assert.equal(humaniseTag(empty), '', `humaniseTag(${JSON.stringify(empty)}) is not empty`);
  }
  const leaf = inLocale('en', () => cheaperList('Cheaper apples', [swap('X', 'a line.', 'leaf', 'en:')]));
  assert.ok(leaf.includes(TABLES.en.cam_swap_same), `the untagged leaf label did not land:\n${leaf}`);
  assert.ok(!leaf.includes('Same kind of thing:'), `a dangling colon was drawn:\n${leaf}`);

  const parent = inLocale('en', () => cheaperList('Cheaper apples', [swap('X', 'a line.', 'parent', '   ')]));
  assert.ok(parent.includes(TABLES.en.cam_swap_looser), `the untagged looser label did not land:\n${parent}`);
  assert.ok(!parent.includes('one category up, in'), `a dangling tag clause was drawn:\n${parent}`);
});

test('no raw taxonomy id survives on a badge in any rendered block', () => {
  // The whole class, not the two fixtures: nothing shaped "xx:" reaches the
  // badge, in either language.
  for (const id of ['en', 'fr']) {
    const html = inLocale(id, () => cheaperList('Cheaper apples', [LEAF, PARENT, NO_RING]));
    assert.doesNotMatch(html, /class="swap-ring">[^<]*\b[a-z]{2}:/,
      `${id}: a raw taxonomy id is on the badge:\n${html}`);
  }
});

/* ------------------------------------------------------------------ *
 * 2c. The stylesheet, per build standard 4: read the declaration.
 * ------------------------------------------------------------------ *
 *
 * NO LAYOUT TEST IS POSSIBLE HERE and it is worth being exact about why.
 * Nothing in `app/test` mounts a DOM, so no computed style can be resolved and
 * no box can be measured; D-095 records that as the reason every CSS defect in
 * this repo so far has escaped the suite. What CAN be held is that the
 * declarations exist and say what they are meant to say. The first version of
 * this block asked for `grid-column: 1 / -1` on the badge to break out of
 * .prov's two columns, and at 390 it did not: the badge shared a line with the
 * product name and the price line was orphaned below. The row now carries its
 * own single-column template, which is a statement about the ROW rather than a
 * correction applied to one child of somebody else's grid.
 */

const CSS = readFileSync(
  fileURLToPath(new URL('../public/css/screens/camera.css', import.meta.url)),
  'utf8',
);

test('a swap row is its own single-column stack, not a child fighting .prov', () => {
  assert.match(CSS, /\.cheaper\s+\.prov\s+div\.swap\s*\{[^}]*grid-template-columns:\s*1fr/,
    'the swap row does not declare its own one-column template, so it inherits .prov\'s '
    + 'two columns and the badge shares a line with the product name');
  assert.match(CSS, /\.cheaper\s+\.prov\s+div\.swap\s*>\s*\*\s*\{[^}]*text-align:\s*left/,
    '.prov right-aligns its second column; a stack has nothing opposite, so every '
    + 'child has to be told to align left or the price line drifts');
  // The rule that did not take. It must not come back: a span across an
  // inherited template is the thing that rendered wrong at 390.
  assert.doesNotMatch(CSS, /\.swap-ring\s*\{[^}]*grid-column/,
    'the badge is spanning an inherited grid again instead of the row owning its layout');
});

test('the badge is set in the UI face, not the measurement face', () => {
  /*
   * NOW.md 2026-09-10: "Section headings are sentence case in the UI face;
   * mono uppercase stays reserved for a measurement (FLAWS item 6 wins)."
   * "Same kind of thing" is a label. "$0.44 per 100 g" is a measurement. They
   * were rendering in the same typeface, which says they are the same kind of
   * claim.
   */
  const rule = CSS.match(/\.cheaper\s+\.prov\s+div\.swap\s+\.swap-ring\s*\{([^}]*)\}/);
  assert.ok(rule, 'the .swap-ring rule is gone from camera.css');
  const body = rule[1];
  // The token name is read out of tokens.css rather than assumed, so this test
  // is still right the day the face is renamed.
  const tokens = readFileSync(
    fileURLToPath(new URL('../public/css/tokens.css', import.meta.url)),
    'utf8',
  );
  assert.match(tokens, /--f-ui:\s*"/, 'tokens.css no longer names a UI face as --f-ui');
  assert.match(body, /font-family:\s*var\(--f-ui\)/,
    'the badge is not in the UI face, so a label is wearing the measurement typeface');
  assert.match(body, /text-transform:\s*none/,
    'the badge inherits .prov\'s uppercase, which this repo reserves for a measurement');
  assert.doesNotMatch(body, /var\(--f-mono\)/, 'the badge asks for the measurement face by name');
});

test('the product name and the price line stay in the measurement face', () => {
  // The other half of the same rule: only the badge moved. `.prov div` is what
  // sets mono on the row, and the stack must not have taken it away.
  assert.match(CSS, /\.prov\s+div\s*\{[^}]*font-family:\s*var\(--f-mono\)/,
    '.prov rows are no longer mono, so the price line stopped looking like a measurement');
  assert.match(CSS, /\.prov\s+b\s*\{[^}]*text-transform:\s*uppercase/,
    'the product name lost the treatment every other .prov row gives it');
});

/* ------------------------------------------------------------------ *
 * 3. Order: leaf first, parent after, server order kept inside a ring.
 * ------------------------------------------------------------------ */

test('parent swaps sort after leaf swaps however the server ordered them', () => {
  const html = inLocale('en', () => cheaperList('Cheaper apples', [PARENT, LEAF]));
  assert.ok(at(html, 'Honeycrisp Apples') < at(html, 'Bartlett Pears'),
    `a parent swap was drawn above a leaf swap:\n${html}`);
});

test('within one ring the server order is kept exactly', () => {
  const rows = [
    swap('Second Leaf', 'b.', 'leaf', 'en:apples'),
    swap('First Leaf', 'a.', 'leaf', 'en:apples'),
    swap('Second Parent', 'd.', 'parent', 'en:dried-fruits'),
    swap('First Parent', 'c.', 'parent', 'en:dried-fruits'),
  ];
  const html = inLocale('en', () => cheaperList('Cheaper apples', rows));
  const order = ['Second Leaf', 'First Leaf', 'Second Parent', 'First Parent'].map((n) => at(html, n));
  assert.deepEqual(order, [...order].sort((a, b) => a - b),
    `the rows were re-ordered inside their own ring:\n${html}`);
});

/* ------------------------------------------------------------------ *
 * 4. A list that is entirely parent swaps qualifies the heading too.
 * ------------------------------------------------------------------ */

test('a list of only parent swaps says so above the rows, because the heading names the leaf', () => {
  // The server's heading is `Cheaper <the ORIGINAL's own leaf category>`. When
  // the leaf came back empty every row under that heading is from a wider
  // shelf, so the heading is true of what was searched and false of what is
  // shown. The badges alone would leave it standing unqualified.
  const html = inLocale('en', () => cheaperList('Cheaper apples', [PARENT]));
  assert.ok(html.includes(TABLES.en.cam_swap_all_looser), `the heading was left unqualified:\n${html}`);
});

test('one leaf row is enough to stop the whole-list qualifier', () => {
  const html = inLocale('en', () => cheaperList('Cheaper apples', [LEAF, PARENT]));
  assert.ok(!html.includes(TABLES.en.cam_swap_all_looser),
    'a list with a real substitute in it was called entirely looser');
});

test('an empty list is still one quiet sentence and no empty box', () => {
  /* 2026-09-14: the sentence is Shin's own now, not the heading. A heading
     over nothing was seen live under a refusal and read as a list still
     loading; the heading names what WOULD be listed, and with nothing to
     list the honest line is that there is nothing. Per path, because the
     verdict may say "cheaper" and the refusal never can. */
  const html = inLocale('en', () => cheaperList('Cheaper apples', []));
  assert.ok(html.includes(say('cam_cheaper_none')), `the quiet sentence is missing:
${html}`);
  assert.ok(!html.includes('Cheaper apples'), `a heading was drawn over nothing:
${html}`);
  assert.ok(!html.includes('class="prov"'), `an empty box was drawn:
${html}`);
  const ref = inLocale('en', () => cheaperList('Similar things that are priced', [], { emptyKey: 'cam_similar_none' }));
  assert.ok(ref.includes(say('cam_similar_none')), `the refusal path fell back to the verdict wording:
${ref}`);
});

/* ------------------------------------------------------------------ *
 * 5. Both locales, and the French makes the same distinction.
 * ------------------------------------------------------------------ */

test('both locales render the two labels, and neither is the other language', () => {
  const en = inLocale('en', () => cheaperList('Cheaper apples', [LEAF, PARENT]));
  const fr = inLocale('fr', () => cheaperList('Cheaper apples', [LEAF, PARENT]));
  assert.ok(en.includes(TABLES.en.cam_swap_same_in({ tag: 'Apples' })));
  assert.ok(en.includes(TABLES.en.cam_swap_looser_in({ tag: 'Dried fruits' })));
  // The tag itself is the humanised ENGLISH taxonomy id in both locales. The
  // catalogue holds no French label to reach for, so this is a known limit,
  // asserted here rather than left to be discovered.
  assert.ok(fr.includes(TABLES.fr.cam_swap_same_in({ tag: 'Apples' })));
  assert.ok(fr.includes(TABLES.fr.cam_swap_looser_in({ tag: 'Dried fruits' })));
  assert.ok(!fr.includes('Looser swap'), `an English badge on a French page:\n${fr}`);
});

test('the French distinction is as explicit as the English one', () => {
  // Not a translation check -- nothing here can do that -- but the two French
  // labels have to be different sentences, and the looser one has to actually
  // say it is wider and that it came from one category up.
  const same = TABLES.fr.cam_swap_same;
  const looser = TABLES.fr.cam_swap_looser;
  assert.notEqual(same, looser);
  assert.match(looser, /plus large/, `the French looser label does not say it is wider: ${looser}`);
  assert.match(looser, /catégorie au-dessus/, `the French looser label does not say it stepped up: ${looser}`);
  assert.doesNotMatch(same, /plus large/, `the French substitute label hedges like the looser one: ${same}`);
  // The French chrome puts a non-breaking space before a colon, the same rule
  // face_label follows. A plain space there is the tell of a machine translation.
  assert.match(TABLES.fr.cam_swap_same_in({ tag: 'Pommes' }), / :/);
});

test('every new key exists in both tables with the same shape', () => {
  const KEYS = ['cam_swap_same', 'cam_swap_same_in', 'cam_swap_looser', 'cam_swap_looser_in', 'cam_swap_all_looser'];
  for (const key of KEYS) {
    assert.ok(key in TABLES.en, `${key} is missing from the English chrome table`);
    assert.ok(key in TABLES.fr, `${key} is missing from the French chrome table`);
    assert.equal(typeof TABLES.en[key], typeof TABLES.fr[key], `${key} has a different shape in the two tables`);
    assert.notEqual(TABLES.en[key], TABLES.fr[key], `${key} was never translated`);
  }
  // t() reaches them, which is what the screen actually calls.
  assert.equal(inLocale('en', () => t('cam_swap_looser')), TABLES.en.cam_swap_looser);
  assert.equal(inLocale('fr', () => t('cam_swap_looser')), TABLES.fr.cam_swap_looser);
});

/* ------------------------------------------------------------------ *
 * 6. The server forwards the fields and does not invent them.
 * ------------------------------------------------------------------ */

/*
 * server.ts opens a port at import, so the same env setup
 * `server-beta-routes.test.ts` uses goes here, PORT=0 included, and the
 * listener is closed in `after`. What is asserted is the response BUILDER
 * rather than the socket: the route's behaviour over HTTP is covered there,
 * and the claim here is about a body, which is a function of its arguments and
 * nothing else.
 */
const dir = mkdtempSync(join(tmpdir(), 'shin-cheaper-rings-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';

const { server, alternativesPayload } = await import('../server.ts');
after(() => { server.close(); });

test('the alternatives body forwards ring and ringTag untouched', () => {
  const rows = [LEAF, PARENT];
  const body = alternativesPayload(true, 'Cheaper apples', rows);
  assert.equal(body.catalogueUp, true);
  assert.equal(body.heading, 'Cheaper apples');
  // Deep-equal against the rows that went in: nothing renamed, nothing
  // dropped, and no row reinterpreted on the way through.
  assert.deepEqual(body.alternatives, rows);
  assert.equal(body.alternatives[0].ring, 'leaf');
  assert.equal(body.alternatives[0].ringTag, 'en:apples');
  assert.equal(body.alternatives[1].ring, 'parent');
  assert.equal(body.alternatives[1].ringTag, 'en:dried-fruits');
});

test('the server does not fabricate a ring for a catalogue build that has none', () => {
  const body = alternativesPayload(true, 'Cheaper apples', [NO_RING]);
  const row = body.alternatives[0];
  assert.equal('ring' in row, false, 'the server invented a ring the catalogue never sent');
  assert.equal('ringTag' in row, false, 'the server invented a ringTag the catalogue never sent');
  // And it survives the wire, which is where a fabricated default would most
  // easily creep in.
  const overTheWire = JSON.parse(JSON.stringify(body));
  assert.equal('ring' in overTheWire.alternatives[0], false);
});

test('the body carries the structured heading beside the English one, untouched', () => {
  // D-097. `heading` is a finished English sentence and the client printed it
  // verbatim under a French badge; the catalogue now writes the same heading
  // as a code plus raw facts, and this route forwards it the same way it
  // forwards a row: whole, unnamed, and uninterpreted.
  const structured = {
    shape: 'single',
    fragments: [{
      code: 'alternatives_cheaper_in_leaf',
      facts: { tag: 'en:apples', label: 'Apples', count: 2 },
    }],
  };
  const body = alternativesPayload(true, 'Cheaper Apples', [LEAF], structured);
  assert.equal(body.heading, 'Cheaper Apples', 'the English heading moved');
  assert.deepEqual(body.structuredHeading, structured);
  assert.deepEqual(JSON.parse(JSON.stringify(body)).structuredHeading, structured,
    'the structured heading did not survive the wire');
});

test('a route with no structured heading sends null, and never invents a code', () => {
  // The two answers this route writes itself: "the catalogue is not attached"
  // and "we have not seen this one". Neither is the catalogue's judgement
  // about a category, and a code invented here would put the server back in
  // the business of writing prose the client cannot re-say.
  const body = alternativesPayload(false, 'The catalogue is not attached, so nothing was looked up.', []);
  assert.equal(body.structuredHeading, null);
  assert.equal('structuredHeading' in body, true, 'the client cannot tell absent from unsent');
});

test('the body is the same object graph whatever fields a row carries', () => {
  // The route must not be readable as "knows about alternatives". It takes a
  // heading and an array and returns them; the day somebody adds a `.map` here
  // to normalise a field, this goes red.
  const odd = [{ product: { name: 'X' }, line: 'y.', ring: 'parent', ringTag: 'Z', somethingNew: 1 }];
  assert.deepEqual(alternativesPayload(true, 'h', odd).alternatives, odd);
  assert.deepEqual(alternativesPayload(false, 'h', []).alternatives, []);
  assert.equal(alternativesPayload(false, 'h', []).catalogueUp, false);
});

test('a price database that will not open answers 200 and says we could not look', () => {
  /*
   * D-130, from Jamin's 2026-09-14 phone test: on the Mac the configured
   * prices.db does not exist, `lookupPrices` throws SQLITE_CANTOPEN, and the
   * shopper's scan turns into a 500 where this route's own contract promises a
   * 200. His words: it "should fail soft".
   *
   * THIS IS A SOURCE CHECK AND NOT A BEHAVIOUR CHECK, said plainly. Every test
   * that boots this server points SHIN_CATALOGUE at a no-catalogue.db, so the
   * route returns "the catalogue is not attached" long before it reaches the
   * price lookup -- there is no fixture in this package that gets far enough
   * to throw. Building one means a real catalogue with a real row and a
   * working fast lookup, which is a bigger job than the fix and is not done
   * here.
   *
   * What this guards is that the catch is not deleted, that it answers 200
   * rather than an error, and that it says WE COULD NOT LOOK rather than
   * claiming there is nothing cheaper. camera.js's own comment is why that
   * last one matters: "'there is nothing cheaper we can price' and 'we did not
   * look' are different facts and silence would read as the second."
   */
  const source = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const route = source.slice(source.indexOf("url.pathname === '/api/alternatives'"));
  const block = route.slice(0, route.indexOf("url.pathname === '/api/attribution'"));

  assert.match(block, /try \{/, 'the price lookup has to be guarded; it reads a file that may not exist');
  assert.match(block, /logError\(\{ where: '\/api\/alternatives'/, 'a swallowed failure is worse than a 500');
  assert.match(
    block,
    /catch[\s\S]*return json\(200,/,
    'rule 6: the shopper still gets an answer, and this route documents 200 as the refusal',
  );
  assert.match(block, /could not look/i, 'not "nothing cheaper" -- that is the other fact, and it is not true here');
});
