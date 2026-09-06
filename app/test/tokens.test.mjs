/**
 * The tier palette against the contrast floor, computed rather than eyeballed.
 *
 * docs/design/DESIGN.md section 1 asserts of the text-on-tier pairings: "This is
 * not a preference, it is the only pairing that clears contrast on each field."
 * On 2026-09-04 docs/design/FLAWS.md found that claim was false for two of the
 * four, and the fix landed 2026-09-06. This file is what stops it drifting back.
 *
 * It reads tokens.css rather than a copy of the numbers, so a token edit that
 * breaks a pairing fails here instead of shipping. Both themes are checked: the
 * light bases did not exist at all until 2026-09-06, which is how tier chrome in
 * light theme ended up painted a colour chosen for a near-black ground.
 *
 * The .88 rows are not decorative. camera.css draws `.said`, `.detail`, `.line`
 * and `.because` -- Shin's own sentence, the reason the verdict is what it is --
 * at opacity .88, so the composite is the ratio a reader actually gets.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TOKENS = fileURLToPath(new URL('../public/css/tokens.css', import.meta.url));
const css = readFileSync(TOKENS, 'utf8').replace(/\r\n/g, '\n');

/* ------------------------------------------------------------------ colour */

const srgb = (hex) => {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};

const luminance = (hex) => {
  const [r, g, b] = srgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG 2.1 contrast ratio. */
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const toHex = (parts) =>
  '#' + parts.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('');

/** What `opacity: a` on `fg` over an opaque `bg` actually composites to. */
const over = (fg, bg, a) => {
  const F = srgb(fg);
  const B = srgb(bg);
  return toHex(F.map((c, i) => c * a + B[i] * (1 - a)));
};

/** What `color-mix(in srgb, a p%, b)` resolves to. */
const mix = (a, b, p) => {
  const A = srgb(a);
  const B = srgb(b);
  return toHex(A.map((c, i) => c * p + B[i] * (1 - p)));
};

/* ------------------------------------------------------------------ parsing */

/**
 * The declarations inside one brace-balanced block, starting at `selector`.
 * Deliberately not a CSS parser -- it only has to read this one file, and a
 * dependency to check four colours would be a worse trade than forty lines.
 */
const blockAt = (selector) => {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `tokens.css no longer contains ${selector}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  let i = open;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) break;
  }
  const body = css.slice(open + 1, i);
  const out = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[name] = value.trim();
  return out;
};

const DARK = blockAt(':root {');
const LIGHT = { ...DARK, ...blockAt(':root[data-theme="light"]') };

const TIERS = ['good', 'fair', 'walk', 'unknown'];
/** The tint percentages the confidence block in camera.css actually uses. */
const TINT = { good: 0.14, fair: 0.14, walk: 0.14, unknown: 0.12 };
/** Shin's sentence is drawn at this opacity on every verdict surface. */
const SAID = 0.88;

const THEMES = [
  ['dark', DARK],
  ['light', LIGHT],
];

/* -------------------------------------------------------------------- tests */

test('every tier defines a base, a bright and an on-colour in both themes', () => {
  for (const [name, T] of THEMES) {
    for (const tier of TIERS) {
      for (const suffix of ['', '-bright', '-on']) {
        const key = `--${tier}${suffix}`;
        assert.match(T[key] ?? '', /^#[0-9a-fA-F]{3,8}$/, `${name}: ${key} is missing or not a hex literal`);
      }
    }
  }
});

/**
 * FLAWS.md P0 #1. The solid verdict field is the product's output: a price, a
 * word, and one sentence saying why. White on the old --walk was 3.80, and 3.23
 * once the sentence's opacity was applied.
 */
test('the verdict word and the price clear 4.5 on a solid tier field', () => {
  for (const [name, T] of THEMES) {
    for (const tier of TIERS) {
      const r = ratio(T[`--${tier}-on`], T[`--${tier}`]);
      assert.ok(r >= 4.5, `${name}: --${tier}-on on --${tier} is ${r.toFixed(2)}, needs 4.5`);
    }
  }
});

test("Shin's sentence clears 4.5 on a solid tier field at its real opacity", () => {
  for (const [name, T] of THEMES) {
    for (const tier of TIERS) {
      const field = T[`--${tier}`];
      const r = ratio(over(T[`--${tier}-on`], field, SAID), field);
      assert.ok(r >= 4.5, `${name}: --${tier}-on at ${SAID} on --${tier} is ${r.toFixed(2)}, needs 4.5`);
    }
  }
});

/**
 * The thin and refusal sheets invert: the tier becomes a tint of the ground and
 * --tier-bright becomes the only text on it. This is the pairing FLAWS.md's
 * table measured the wrong way round -- it read --walk-bright as a background
 * behind white, which no rule in the app ever draws.
 */
test('--tier-bright clears 4.5 as text on the thin and refusal tints', () => {
  for (const [name, T] of THEMES) {
    for (const tier of TIERS) {
      const tint = mix(T[`--${tier}`], T['--ground'], TINT[tier]);
      const full = ratio(T[`--${tier}-bright`], tint);
      const said = ratio(over(T[`--${tier}-bright`], tint, SAID), tint);
      assert.ok(full >= 4.5, `${name}: --${tier}-bright on ${tint} is ${full.toFixed(2)}, needs 4.5`);
      assert.ok(said >= 4.5, `${name}: --${tier}-bright at ${SAID} on ${tint} is ${said.toFixed(2)}, needs 4.5`);
    }
  }
});

/**
 * FLAWS.md P0 #2, and Law 2 -- "hue is the verdict". A tier base is also drawn
 * as a border, a rail band and a row marker, which is a non-text graphic and so
 * answers to 3.0 rather than 4.5.
 */
test('a tier base reads as a graphic against its own ground', () => {
  for (const [name, T] of THEMES) {
    for (const tier of TIERS) {
      const r = ratio(T[`--${tier}`], T['--ground']);
      assert.ok(r >= 3.0, `${name}: --${tier} on --ground is ${r.toFixed(2)}, needs 3.0`);
    }
  }
});

/**
 * --tier-bright is also used bare as text on the panelled screens: the tier word
 * on a saved row, the coverage yes/no on You, the error line in the shell.
 */
test('--tier-bright clears 4.5 as text on ground and on surface', () => {
  for (const [name, T] of THEMES) {
    for (const tier of TIERS) {
      for (const on of ['--ground', '--surface']) {
        const r = ratio(T[`--${tier}-bright`], T[on]);
        assert.ok(r >= 4.5, `${name}: --${tier}-bright on ${on} is ${r.toFixed(2)}, needs 4.5`);
      }
    }
  }
});

/**
 * The brand pink is never a verdict -- DESIGN.md, and the comment at the top of
 * tokens.css. If it ever equals a tier colour, a screenshot of a refusal starts
 * looking like a walk away.
 */
test('the brand colour is not any tier colour', () => {
  for (const [name, T] of THEMES) {
    const brand = T['--brand'].toLowerCase();
    for (const tier of TIERS) {
      for (const suffix of ['', '-bright']) {
        assert.notEqual(brand, T[`--${tier}${suffix}`].toLowerCase(), `${name}: --brand equals --${tier}${suffix}`);
      }
    }
  }
});

/**
 * The two light blocks are deliberate duplicates -- one for the system
 * preference, one for the explicit choice -- and tokens.css says in a comment
 * that they must move together. This is that comment, enforced.
 */
test('the media-query light block and the [data-theme=light] block agree', () => {
  const media = blockAt('@media (prefers-color-scheme: light)');
  const explicit = blockAt(':root[data-theme="light"]');
  for (const [key, value] of Object.entries(explicit)) {
    assert.equal(media[key], value, `light theme drifted: ${key} is "${media[key]}" under the media query and "${value}" under the explicit choice`);
  }
});
