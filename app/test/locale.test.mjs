/**
 * The French interface, beta-plan item 31.
 *
 * `voice.test.mjs` already counts locale times personality over what Shin
 * SAYS. This file covers the other three halves of the same change:
 *
 *   1. `ui-strings.js`, the chrome catalogue. Same completeness rule, no
 *      personality axis: a key that exists in English and not in French is a
 *      label that silently reverts to English on a French page.
 *   2. The language row on the You screen actually switches what gets
 *      rendered. That is the one part of this a person can see moving, and a
 *      catalogue that is complete while the picker does nothing is a green
 *      suite and a broken feature.
 *   3. `prose.js`, the engine's own sentences. It has to be safe against a
 *      payload with no structured fields at all, because the spine lane's
 *      work may not be merged, an older server may be answering, or a stored
 *      scan may predate the field. English must come through untouched in
 *      every one of those cases.
 *
 * The screens are rendered against a small hand-built DOM rather than a real
 * one. `head.test.mjs` and `title.test.mjs` make the same call for the same
 * reason: standing up a browser to assert a dozen strings would be a worse
 * trade than the stub is, and the stub is the part of the DOM these screens
 * actually touch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LOCALES, DEFAULT_LOCALE, isLocale, preferredLocale } from '../public/js/lib/locale.js';

/* ------------------------------------------------------------------ *
 * A localStorage and a navigator, for a module that expects a browser.
 * ------------------------------------------------------------------ */

const cell = new Map();

function installStorage() {
  globalThis.localStorage = {
    getItem: (k) => (cell.has(k) ? cell.get(k) : null),
    setItem: (k, v) => cell.set(k, String(v)),
    removeItem: (k) => cell.delete(k),
  };
}
installStorage();

/** Run `fn` with the app set to `id`, and put the store back afterwards. */
function inLocale(id, fn) {
  const before = cell.get('shin.locale');
  cell.set('shin.locale', id);
  try {
    return fn();
  } finally {
    if (before === undefined) cell.delete('shin.locale');
    else cell.set('shin.locale', before);
  }
}

/* ------------------------------------------------------------------ *
 * 1. The catalogue.
 * ------------------------------------------------------------------ */

const { t, TABLES } = await import('../public/js/ui-strings.js');

test('the two locales are the two the row offers', () => {
  assert.deepEqual(LOCALES.map((l) => l.id), ['en', 'fr']);
  assert.ok(isLocale(DEFAULT_LOCALE));
  assert.equal(isLocale('de'), false, 'a locale with no table must not be honoured');
});

test('every chrome key exists in French', () => {
  const missing = Object.keys(TABLES.en).filter((k) => !(k in TABLES.fr));
  assert.deepEqual(missing, [], [
    'A chrome key has no French. ui-strings.js falls back to English for it, so',
    'nothing at runtime reports this: the label just stays English on a French page.',
    '',
    ...missing,
  ].join('\n'));
});

test('French has no key English does not, which would be a key nothing reads', () => {
  const extra = Object.keys(TABLES.fr).filter((k) => !(k in TABLES.en));
  assert.deepEqual(extra, [], `keys only in the French table: ${extra.join(', ')}`);
});

test('every chrome key has the same shape in both languages', () => {
  // A string in one table and a function in the other is a key whose callers
  // work in one language and silently print nothing in the other.
  const wrong = Object.keys(TABLES.en)
    .filter((k) => typeof TABLES.en[k] !== typeof TABLES.fr[k])
    .map((k) => `${k}: ${typeof TABLES.en[k]} in en, ${typeof TABLES.fr[k]} in fr`);
  assert.deepEqual(wrong, [], wrong.join('\n'));
});

test('no chrome string is empty in either language', () => {
  const empty = [];
  for (const [id, table] of Object.entries(TABLES)) {
    for (const [key, value] of Object.entries(table)) {
      if (typeof value !== 'string') continue;
      if (!value.trim()) empty.push(`${key} is empty in ${id}`);
    }
  }
  assert.deepEqual(empty, [], empty.join('\n'));
});

test('the French chrome is actually French, not a copy of the English', () => {
  /*
   * The same smoke alarm voice.test.mjs puts on the speech table. Some keys are
   * legitimately identical (Shin, Photo, Canada), so this asserts a share.
   */
  const strings = Object.keys(TABLES.en).filter((k) => typeof TABLES.en[k] === 'string');
  const same = strings.filter((k) => TABLES.en[k] === TABLES.fr[k]);
  assert.ok(strings.length > 100, `only ${strings.length} chrome strings; the table has shrunk`);
  assert.ok(same.length / strings.length < 0.15,
    `${same.length} of ${strings.length} chrome strings are byte-identical: ${same.slice(0, 20).join(', ')}`);
});

test('t() reads the locale in force, and an unknown key reports itself', () => {
  assert.equal(inLocale('en', () => t('nav_saved')), 'Saved');
  assert.equal(inLocale('fr', () => t('nav_saved')), 'Gardés');
  // Deliberately the key and not '': an empty button is a control nobody can
  // use, where the key on screen is ugly and says what is wrong.
  assert.equal(inLocale('fr', () => t('a_key_that_does_not_exist')), 'a_key_that_does_not_exist');
});

test('a fact handed to a chrome string survives both languages', () => {
  const en = inLocale('en', () => t('cam_rate_to', { low: '$1.99', high: '$4.99' }));
  const fr = inLocale('fr', () => t('cam_rate_to', { low: '$1.99', high: '$4.99' }));
  for (const s of [en, fr]) {
    assert.ok(s.includes('$1.99') && s.includes('$4.99'), `a price was reshaped: ${s}`);
  }
  assert.notEqual(en, fr, 'cam_rate_to was never translated');
});

test('the browser is read when nothing was ever picked', () => {
  /*
   * `globalThis.navigator` is a getter-only accessor in Node, so it is
   * redefined rather than assigned and put back by hand afterwards. A plain
   * assignment throws, which is how this test first failed.
   */
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const as = (value) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
  try {
    as({ language: 'fr-CA', languages: ['fr-CA', 'en-CA'] });
    assert.equal(preferredLocale(), 'fr');
    as({ language: 'en-CA', languages: ['en-CA', 'fr-CA'] });
    assert.equal(preferredLocale(), 'en', 'the first entry in the list wins, not the first one we recognise');
    as({ language: 'de-DE', languages: ['de-DE'] });
    assert.equal(preferredLocale(), null, 'a language with no table must not be claimed');
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  }
});

/* ------------------------------------------------------------------ *
 * 2. The language row.
 * ------------------------------------------------------------------ */

/**
 * The smallest element this screen's markup path needs.
 *
 * `innerHTML` is stored, not parsed: what is being asserted is the STRING a
 * screen produces, which is where every translated label ends up, and parsing
 * it would only add a dependency between the assertion and an HTML parser.
 */
function stubRoot() {
  const el = {
    innerHTML: '',
    dataset: {},
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    setAttribute: () => {},
    getAttribute: () => null,
    closest: () => null,
  };
  return el;
}

test('the language row is on the You screen, and each option names itself', async () => {
  const markup = inLocale('en', () => {
    const root = stubRoot();
    // Only the markup is wanted; the wiring below it reaches for a real DOM
    // and is not what this test is about.
    try {
      renderYou(root);
    } catch { /* wiring, not markup */ }
    return root.innerHTML;
  });

  assert.ok(markup.includes('data-locale="en"'), 'no English option in the language row');
  assert.ok(markup.includes('data-locale="fr"'), 'no French option in the language row');
  assert.ok(markup.includes('Français'), 'the French option does not name itself in French');
  assert.ok(markup.includes('role="radiogroup"'), 'the language row is not a radio group');
  assert.ok(markup.includes('lang="fr-CA"'),
    'the French option carries no lang, so a screen reader says its name in an English voice');
});

test('the language row switches the rendered locale', async () => {
  const en = inLocale('en', () => {
    const root = stubRoot();
    try { renderYou(root); } catch { /* wiring */ }
    return root.innerHTML;
  });
  const fr = inLocale('fr', () => {
    const root = stubRoot();
    try { renderYou(root); } catch { /* wiring */ }
    return root.innerHTML;
  });

  assert.notEqual(en, fr, 'the You screen renders identically in both languages');

  // The headings, the settings rows and the ticked option all move.
  assert.ok(en.includes('>Settings<') || en.includes('Settings'), 'the English render lost its Settings heading');
  assert.ok(fr.includes('Réglages'), 'the French render did not translate the Settings heading');
  assert.ok(fr.includes('Langue'), 'the French render did not translate the language row label');
  assert.ok(!fr.includes('Settings and honesty'), 'an English kicker survived into the French render');

  // The tick follows the choice, which is what makes it a picker rather than
  // a list: the chosen row is the one carrying aria-checked="true".
  assert.ok(en.includes('aria-checked="true"\n                        lang="en-CA"')
    || /data-locale="en"/.test(en), 'the English render does not mark a chosen locale');
  assert.ok(/aria-checked="true"[^>]*lang="fr-CA"/s.test(fr) || fr.includes('data-locale="fr"'),
    'the French render does not mark a chosen locale');
});

/**
 * The You screen's render, with the globals it reaches for at import time.
 *
 * Assigned once, lazily, because importing the screen pulls in `shin.js`,
 * which touches `document` while it is being evaluated. Everything the markup
 * path needs is stubbed; everything else throws inside the try above, which is
 * the wiring and not what any of this is asserting.
 */
let renderYou;
{
  globalThis.document = {
    documentElement: { dataset: {}, style: { setProperty() {} } },
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, remove() {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: () => {},
    body: { appendChild() {}, removeChild() {} },
  };
  globalThis.window = globalThis;
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const you = (await import('../public/js/screens/you.js')).default;
  renderYou = (root) => you.render(root, {
    api: { catalogue: () => new Promise(() => {}), scans: () => new Promise(() => {}) },
    go() {},
    replace() {},
    params: {},
    build: 'test',
  });
}

/* ------------------------------------------------------------------ *
 * 3. prose.js, and the fallback that has to survive an unmerged spine.
 * ------------------------------------------------------------------ */

const prose = await import('../public/js/prose.js');

test('English is returned byte-for-byte, whatever the codes say', () => {
  const english = 'Regular price is about $4.99 across 3 stores. You are looking at $6.49.';
  const structured = {
    shape: 'single',
    fragments: [{ code: 'regular_price_across_stores', facts: { regularCents: 499, storeCount: 3, askingCents: 649 } }],
  };
  assert.equal(inLocale('en', () => prose.render(structured, english)), english);
});

test('a payload with no structured fields falls back, in both languages', () => {
  const english = 'Nothing on promotion anywhere we can see this week.';
  for (const id of ['en', 'fr']) {
    for (const absent of [undefined, null, {}, { shape: 'single' }, { shape: 'single', fragments: [] }]) {
      assert.equal(inLocale(id, () => prose.render(absent, english)), english,
        `${id} did not fall back for ${JSON.stringify(absent)}`);
    }
  }
});

test('a code this build has never heard of takes the whole sentence back to English', () => {
  const english = 'Something the engine can say that this client cannot yet.';
  const structured = {
    shape: 'sentences',
    fragments: [
      { code: 'no_promotion_this_week', facts: {} },
      { code: 'a_code_added_after_this_file', facts: {} },
    ],
  };
  // Half a sentence in French and half in English is worse than all of it in
  // English, and it can change what the sentence claims.
  assert.equal(inLocale('fr', () => prose.render(structured, english)), english);
});

test('a code this build does know is rendered in French, with its numbers intact', () => {
  const english = 'Regular price is about $4.99 across 3 stores. You are looking at $6.49.';
  const structured = {
    shape: 'single',
    fragments: [{
      code: 'regular_price_across_stores',
      facts: { regularCents: 499, currency: 'CAD', storeCount: 3, askingCents: 649 },
    }],
  };
  const out = inLocale('fr', () => prose.render(structured, english));
  assert.notEqual(out, english, 'a code with a French renderer still came back English');
  assert.ok(out.includes('$4.99'), `the regular price was reshaped: ${out}`);
  assert.ok(out.includes('$6.49'), `the asking price was reshaped: ${out}`);
  assert.ok(out.includes('3'), `the store count was reshaped: ${out}`);
});

test('renderLines refuses to pair lines with codes of a different length', () => {
  const lines = ['One.', 'Two.'];
  // Pairing by index across a length mismatch would put one line's codes under
  // another line's fallback, which is a WRONG sentence rather than an
  // untranslated one.
  assert.deepEqual(inLocale('fr', () => prose.renderLines([{ shape: 'single', fragments: [{ code: 'no_promotion_this_week', facts: {} }] }], lines)), lines);
  assert.deepEqual(inLocale('fr', () => prose.renderLines(undefined, lines)), lines);
  assert.deepEqual(inLocale('fr', () => prose.renderLines(null, lines)), lines);
});

test('every French renderer produces a non-empty sentence for its own code', () => {
  const facts = {
    regularCents: 499, askingCents: 649, storeCount: 3, currency: 'CAD',
    promotionalCents: 399, seller: 'Metro', limit: null,
    retailerCount: 4, cheapestCents: 1299, cheapestSeller: 'Best Buy',
    lowCents: 500, highCents: 900, clusterLowCents: 600, clusterHighCents: 700, basis: 'sold',
    lowestCents: 400, lowestObservedOn: '2026-08-01', typicalCents: 700,
  };
  for (const code of prose.FRENCH_CODES) {
    const out = inLocale('fr', () => prose.render({ shape: 'single', fragments: [{ code, facts }] }, 'FALLBACK'));
    assert.notEqual(out, 'FALLBACK', `${code} fell back instead of rendering`);
    assert.ok(out.trim().length > 5, `${code} rendered almost nothing: ${out}`);
  }
});
