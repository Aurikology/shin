/**
 * The price pad's ghosted amount ("0.00" before a key is pressed, ".00" after "4") against the
 * ground it can sit on.
 *
 * Found 2026-11-24 by an axe-core sweep of 14 app states at iPhone 13 size (0 axe violations; the
 * pad's ghost was one of axe's "could not decide" nodes, measured from the rendered pixels): the
 * ghost was --ink-faint at opacity .45, 1.81 to 1.94 on the light grounds and 2.00 to 2.08 on the
 * dark ones. It is 32 px weight 800 (large text), so its floor is 3:1 (WCAG 1.4.3). The ghost is a
 * Must in docs/design/ux-evidence-2026-10-09.md row 11, so it stays: it only has to be readable.
 * It must also stay visibly lighter than a typed digit (--ink), or it reads as a typed number.
 *
 * Read from the shipped CSS, not prose: the `.ghosted` opacity in camera.css (the sheet's pad) and
 * correct.css (the Report a wrong price pad), --ink-faint and --ink per theme from tokens.css,
 * checked on --surface, --ground and --raised.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');

const srgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const lum = (rgb) => {
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const over = (fg, alpha, bg) => fg.map((c, i) => bg[i] + alpha * (c - bg[i]));

const block = (src, selector) => {
  const start = src.indexOf(selector);
  assert.notEqual(start, -1, `no ${selector} block in tokens.css`);
  const open = src.indexOf('{', start);
  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  return Object.fromEntries([...src.slice(open + 1, i).matchAll(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/g)].map((m) => [m[1], m[2]]));
};

const tokens = read('../public/css/tokens.css');
const DARK = block(tokens, ':root {');
const THEMES = { dark: DARK, light: { ...DARK, ...block(tokens, ':root[data-theme="light"]') } };

const PADS = {
  'the scan sheet pad (camera.css)': { file: '../public/css/screens/camera.css', sel: '.padsheet .amount .ghosted' },
  'the Report a wrong price pad (correct.css)': { file: '../public/css/screens/correct.css', sel: '.amount .ghosted' },
};

const ghostOpacity = (file, sel) => {
  const css = read(file);
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm'));
  assert.ok(m, `no "${sel}" rule in ${file}`);
  const o = m[1].match(/opacity\s*:\s*([\d.]+)/);
  assert.ok(/color\s*:\s*var\(--ink-faint\)/.test(m[1]), `${sel} is no longer --ink-faint; update this test`);
  return o ? Number(o[1]) : 1;
};

for (const [pad, { file, sel }] of Object.entries(PADS)) {
  for (const [theme, t] of Object.entries(THEMES)) {
    test(`the ghosted amount on ${pad} reads at 3:1 or better in ${theme} theme, and stays lighter than a typed digit`, () => {
      const alpha = ghostOpacity(file, sel);
      for (const ground of ['--surface', '--ground', '--raised']) {
        const bg = srgb(t[ground]);
        const ghost = over(srgb(t['--ink-faint']), alpha, bg);
        const r = ratio(ghost, bg);
        assert.ok(r >= 3, `${theme} ${ground}: ghost ${r.toFixed(2)}:1 at opacity ${alpha}, under the 3:1 large-text floor`);
        const typed = ratio(srgb(t['--ink']), bg);
        assert.ok(typed - r >= 3, `${theme} ${ground}: ghost ${r.toFixed(2)}:1 is too close to a typed digit's ${typed.toFixed(2)}:1`);
      }
    });
  }
}
