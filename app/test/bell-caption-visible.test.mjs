/**
 * D-268 B6 (2026-11-11 walk, f3-28/f3-37), checked at phone size on the PC
 * 2026-11-11: the bell's "Shaded: Pexi's estimate of 8 in 10 prices, ..."
 * caption sat under the chart, below the first position's pinned "Save it":
 * half hidden behind it at 390x844 (the App Store build's size), wholly below
 * the sheet's edge at 375x667 and in Safari's 390x664. The space above the bell
 * was empty, so the caption goes there, where the first position always shows it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/css/screens/camera.css', import.meta.url), 'utf8');

test('D-268 B6: the bell figure stacks its caption above the chart', () => {
  assert.match(css, /\.vbell \{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/, 'the figure is not a column, so the caption cannot be moved');
  assert.match(css, /\.vb-cap \{[^}]*order:\s*-1;/, 'the caption still draws under the chart, behind the pinned button');
});
