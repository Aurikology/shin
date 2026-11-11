/**
 * D-268 F28 (2026-11-11 walk, f3-66/f3-67): changing Theme on the You page
 * cleared the selected state of Percentage/Dollar, the range chips and torch
 * Auto/Off until a reload. Cause: the theme handler re-marked every `.seg-o` in
 * the whole screen (`root.querySelectorAll('.seg-o')`), so every other
 * segmented control lost its `on`. It must touch only the theme's own group.
 *
 * A source assertion, because the handler lives inside the screen's mount
 * closure; the browser sweep checks the drawn result.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../public/js/screens/you.js', import.meta.url)), 'utf8');

test('D-268 F28: picking a theme re-marks only the theme options, never every segmented control on the page', () => {
  const start = src.indexOf("const themeOpt = e.target.closest('[data-theme]');");
  assert.ok(start > 0, 'theme handler not found');
  const block = src.slice(start, src.indexOf('return;', start));
  assert.doesNotMatch(block, /root\.querySelectorAll\('\.seg-o'\)/, 'the theme handler still walks every .seg-o on the screen');
  assert.match(block, /themeOpt\.closest\('\[role="radiogroup"\]'\)/, 'the theme handler must scope to its own radiogroup');
});
