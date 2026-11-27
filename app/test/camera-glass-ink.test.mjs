/**
 * Words on the camera sit on dark glass in both themes, dense enough to read over a white label
 * (2026-11-26, the camera rendered over a real product photo for the first time).
 *
 * Two defects, one cause: the camera's text boxes took their fill from the page theme or from glass
 * meant for icons.
 *   - The first-scan tip (.scan-note) used --surface and Pexi's bubble used --raised: in light theme
 *     a white slab and a cream bubble on the dark camera, beside dark glass chips.
 *   - The mode chips' words sat on --glass (.52). Over a white shelf that composites to about
 *     #838486, and the chip's white text measures 3.8:1, under the 4.5 floor for 13px text.
 *
 * The worst case is pure white behind the glass; blur does not darken it, so the composite over
 * white is the ratio a shopper gets in front of a white package.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const tokens = read('../public/css/tokens.css');
const depth = read('../public/css/screens/depth.css');

const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const rgbaToken = (name) => {
  const m = new RegExp(`--${name}:\\s*rgba\\(([^)]+)\\)`).exec(tokens);
  assert.ok(m, `--${name} is not an rgba() in tokens.css`);
  const [r, g, b, a] = m[1].split(',').map(Number);
  return { rgb: [r, g, b], a };
};
const overWhite = ({ rgb, a }) => rgb.map((c) => c * a + 255 * (1 - a));
const WHITE = [255, 255, 255];

/** The declarations of the last rule whose selector list includes `sel` exactly. */
function rulesFor(css, sel) {
  const out = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (m[1].split(',').map((s) => s.trim()).includes(sel)) out.push(m[2]);
  }
  return out.join(';');
}

test('glass that carries words keeps white at 4.5:1 or better over a white label', () => {
  const r = ratio(WHITE, overWhite(rgbaToken('glass-ink')));
  assert.ok(r >= 4.5, `white on --glass-ink over white: ${r.toFixed(2)}:1`);
  // The chips' quieter ink (.82 white) is measured too.
  const bg = overWhite(rgbaToken('glass-ink'));
  const ink = bg.map((c) => 255 * 0.82 + c * 0.18);
  assert.ok(ratio(ink, bg) >= 4.5, `chip ink on --glass-ink over white: ${ratio(ink, bg).toFixed(2)}:1`);
});

test('control: the icon glass alone would not clear the floor for words', () => {
  const r = ratio(WHITE, overWhite(rgbaToken('glass')));
  assert.ok(r < 4.5, `--glass now clears 4.5 (${r.toFixed(2)}); this test's premise changed, revisit it`);
});

for (const sel of ['.scan-note', '.cam-shin .bubble', '.cam-chip:not(.on)']) {
  test(`${sel} is filled with --glass-ink`, () => {
    assert.match(rulesFor(depth, sel), /background-color:\s*var\(--glass-ink\)/, `${sel} has no --glass-ink fill in depth.css`);
  });
}

for (const sel of ['.scan-note', '.cam-shin .bubble-text']) {
  test(`${sel} draws white ink, never the theme's`, () => {
    const decl = rulesFor(depth, sel) + ';' + (sel === '.cam-shin .bubble-text' ? '' : rulesFor(depth, '.cam-shin .bubble'));
    assert.match(decl, /(^|;)\s*color:\s*#fff\b/, `${sel} keeps the theme ink`);
  });
}
