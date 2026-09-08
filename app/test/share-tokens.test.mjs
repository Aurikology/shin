/**
 * The share card's hardcoded token literals, against tokens.css.
 *
 * A canvas cannot cascade. `public/js/screens/share.js` has to hand `fillStyle`
 * and `ctx.font` resolved literals, so it is the one file in the app that writes
 * a token value down a second time -- and therefore the one place a token edit
 * does not propagate.
 *
 * This is not hypothetical. `--ink-faint` moved from #6E7783 to #848D99 on
 * 2026-09-05 because it measured 4.31 against the 4.5 that text under 24px
 * needs; the comment carrying that measurement is at tokens.css lines 31-39.
 * share.js kept falling back to #6E7783 afterwards, and on 2026-09-06 --walk
 * (#F0431F -> #C23619) and --unknown (#78848F -> #5E6770) moved the same way
 * with the same result. Nothing caught any of it, because a stale fallback is
 * invisible: the computed value is almost always present, so the branch holding
 * the wrong colour is almost never taken. The one render where it IS taken
 * produces a PNG in a palette the app abandoned -- and that PNG is the only
 * artefact of this app that leaves it and gets screenshotted.
 *
 * So: parse both files and require them to agree, per theme.
 *
 * The block-parsing and file-reading approach is lifted from
 * test/tokens.test.mjs, which reads tokens.css rather than a copy of the numbers
 * for the same reason.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TOKENS_CSS = fileURLToPath(new URL('../public/css/tokens.css', import.meta.url));
const SHARE_JS = fileURLToPath(new URL('../public/js/screens/share.js', import.meta.url));

const css = readFileSync(TOKENS_CSS, 'utf8').replace(/\r\n/g, '\n');
const js = readFileSync(SHARE_JS, 'utf8').replace(/\r\n/g, '\n');

/* ------------------------------------------------------------------ parsing */

/** The text inside the first brace-balanced `{ ... }` at or after `from`. */
function braced(source, from, what) {
  const start = source.indexOf(from);
  assert.notEqual(start, -1, `${what}: could not find "${from}"`);
  const open = source.indexOf('{', start);
  let depth = 0;
  let i = open;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) break;
  }
  return source.slice(open + 1, i);
}

/**
 * The custom-property declarations inside one CSS block. Deliberately not a CSS
 * parser -- it only has to read this one file, and a dependency to check fifteen
 * colours would be a worse trade than thirty lines. Same helper as
 * tokens.test.mjs.
 */
function cssBlock(selector) {
  const body = braced(css, selector, 'tokens.css');
  const out = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[name] = value.trim();
  return out;
}

const ROOT = cssBlock(':root {');
/* Light layers over dark, exactly as the cascade does: a token the light block
   does not re-declare -- --brand, and all four -on colours -- keeps its :root
   value. share.js's own table has to say the same thing, which is half of what
   this file checks. */
const LIGHT = { ...ROOT, ...cssBlock(':root[data-theme="light"]') };
const THEMES = { dark: ROOT, light: LIGHT };

/*
 * share.js's tables are parsed from source rather than imported: importing the
 * module pulls in the whole screen -- `document`, `getComputedStyle`, `Image` --
 * and this runs under plain node, where none of those exist. Reading the source
 * is also the stricter check, because it fails if the SHAPE changes, and a
 * hand-written table that stopped being read is precisely the failure this file
 * exists to prevent.
 */

/** `'--ink-faint': { dark: '#848D99', light: '#606771' },` */
function shareColours() {
  const body = braced(js, 'const TOKENS =', 'share.js');
  const row = /'(--[\w-]+)'\s*:\s*\{\s*dark:\s*'(#[0-9a-fA-F]{3,8})'\s*,\s*light:\s*'(#[0-9a-fA-F]{3,8})'\s*,?\s*\}/g;
  const out = {};
  for (const [, name, dark, light] of body.matchAll(row)) out[name] = { dark, light };
  return out;
}

/** `'--t-label-track': '.12em',` -- one literal, because these are not themed. */
function shareType() {
  const body = braced(js, 'const TYPE =', 'share.js');
  const out = {};
  for (const [, name, value] of body.matchAll(/'(--[\w-]+)'\s*:\s*'([^']*)'\s*,/g)) out[name] = value;
  return out;
}

const SHARE_TOKENS = shareColours();
const SHARE_TYPE = shareType();

/* share.js's comments quote the abandoned colours by name, at length, which is
   the point of them -- a comment saying "this was #6E7783 and here is why it
   moved" is documentation, and a fillStyle saying it is a bug. So the tests
   below that look for a value in the file look in the code, not the prose. */
const CODE = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* -------------------------------------------------------------------- tests */

test('share.js still declares a colour table this test can read', () => {
  const n = Object.keys(SHARE_TOKENS).length;
  assert.ok(
    n >= 10,
    `share.js: parsed only ${n} colour fallbacks, which means the table's shape changed and this test quietly stopped checking anything`,
  );
  /* The three that have actually drifted. If one is dropped, say so loudly
     rather than passing on the ones that remain. */
  for (const name of ['--ink-faint', '--walk', '--unknown']) {
    assert.ok(SHARE_TOKENS[name], `share.js: ${name} is missing from the table, and it is one of the three that has drifted before`);
  }
});

/**
 * The whole point of the file. Every literal in share.js equals the value
 * tokens.css gives that token, in that theme.
 */
test('every share-card colour fallback matches tokens.css, in both themes', () => {
  for (const [name, pair] of Object.entries(SHARE_TOKENS)) {
    for (const theme of ['dark', 'light']) {
      const spec = THEMES[theme][name];
      assert.ok(spec, `tokens.css no longer defines ${name}, and share.js still carries a fallback for it`);
      assert.equal(
        pair[theme].toLowerCase(),
        spec.toLowerCase(),
        `share.js ${theme} fallback for ${name} is ${pair[theme]}, tokens.css says ${spec}`,
      );
    }
  }
});

/**
 * The specific regression, named. If any of these four ever appears in this file
 * again, it is the bug coming back rather than a new one.
 */
test('the colours tokens.css abandoned for failing contrast are gone from share.js', () => {
  for (const dead of ['#6E7783', '#8B929C', '#F0431F', '#78848F']) {
    assert.equal(
      CODE.toLowerCase().includes(dead.toLowerCase()),
      false,
      `share.js still draws with ${dead}, which tokens.css replaced for failing contrast`,
    );
  }
});

/**
 * A fallback for a token tokens.css does not define is not a fallback, it is a
 * colour somebody made up. The previous test checked one direction; this is the
 * other.
 */
test('share.js has no fallback for a token that does not exist', () => {
  for (const name of Object.keys(SHARE_TOKENS)) {
    assert.ok(ROOT[name], `share.js carries a fallback for ${name}, which tokens.css :root does not define`);
  }
});

/**
 * The type roles. These live only in `:root`, so share.js keeps a single literal
 * per token and this checks it against `:root` alone. Same failure mode as the
 * colours: DESIGN.md section 2's verdict word moved from 31px to 34px once
 * already, and nothing outside the CSS knew.
 */
test('every share-card type fallback matches the :root value in tokens.css', () => {
  assert.ok(Object.keys(SHARE_TYPE).length >= 8, 'share.js: the TYPE table stopped parsing');
  for (const [name, literal] of Object.entries(SHARE_TYPE)) {
    const spec = ROOT[name];
    assert.ok(spec, `tokens.css :root no longer defines ${name}, and share.js still carries a fallback for it`);
    assert.equal(literal, spec, `share.js fallback for ${name} is "${literal}", tokens.css says "${spec}"`);
  }
});

/**
 * A type token that light theme DID re-declare would silently make the single
 * literal above wrong for one of the two themes. None is themed today; this is
 * the assertion that notices if that changes.
 */
test('no share-card type token is re-declared by light theme', () => {
  const lightOnly = cssBlock(':root[data-theme="light"]');
  for (const name of Object.keys(SHARE_TYPE)) {
    assert.equal(
      lightOnly[name],
      undefined,
      `${name} is now themed, so share.js's TYPE table needs a dark/light pair like its colours do`,
    );
  }
});

/**
 * DESIGN.md's hard rule for this surface: "two prices, never the arithmetic
 * between them." A difference shown as an amount saved is a performance claim,
 * and no savings figure here has been measured against anything. Blunt, and it
 * catches the obvious form.
 */
test('the share card computes no saving between the two prices', () => {
  /* Not `saved`: "Saved to your downloads." is the export's own status line and
     has nothing to do with money. What is being looked for is a figure claiming
     an amount kept back. */
  assert.equal(
    /\bsavings?\b|\byou save\b|\bdifference\b|\bdiscount\b|%\s*off/i.test(CODE),
    false,
    'share.js computes or names a saving outside its comments; the card shows two prices and no arithmetic between them',
  );
});
