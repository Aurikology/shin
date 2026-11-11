/**
 * D-268 A1 (2026-11-11 walk, f3-31/f3-32): in the result sheet's Fix Results
 * panel the digits 1-9 collapsed into one cramped row and "On sale" was an
 * unstyled grey rectangle, while "Report a wrong price" drew a proper grid and
 * a styled pill. Cause: the keypad grid rules are scoped to `.padsheet` (the
 * camera pad) and `.page-correct` (the report page), and the chip rules to
 * `.page-correct` only, so the `.corr` panel, which hosts the same
 * keypadHtml(), got no grid and no chip style. And its "Save it" read the same
 * as the sheet's Save it (which saves to Saved) while it sends a correction.
 *
 * Source assertions on the stylesheets: the runner has no layout engine, so the
 * rule that would apply is read where it lives. The browser sweep checks the
 * drawn result.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { t } from '../public/js/ui-strings.js';

const cssDir = fileURLToPath(new URL('../public/css/screens/', import.meta.url));
const css = readdirSync(cssDir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(cssDir + f, 'utf8')).join('\n');

function ruleFor(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(^|[\\n,}])\\s*${esc}\\s*\\{([^}]*)\\}`));
  return m ? m[2] : null;
}

test('D-268 A1: the Fix Results panel lays its keypad out as a 3-wide grid, like the other two pads', () => {
  const body = ruleFor('.corr .keypad');
  assert.ok(body, 'no `.corr .keypad` rule: the panel keypad has no grid, so 1-9 collapse into one row');
  assert.match(body, /display:\s*grid/);
  assert.match(body, /grid-template-columns:\s*repeat\(3,\s*1fr\)/);
  const bottom = ruleFor('.corr .keypad-bottom');
  assert.ok(bottom, 'no `.corr .keypad-bottom` rule');
  assert.match(bottom, /display:\s*grid/);
});

test('D-268 A1: "On sale" in the Fix Results panel is a styled pill with a visible pressed state', () => {
  const chip = ruleFor('.corr .chip');
  assert.ok(chip, 'no `.corr .chip` rule: "On sale" draws as a default grey button');
  assert.match(chip, /border-radius:\s*999px/);
  const on = ruleFor('.corr .chip-on');
  assert.ok(on, 'no `.corr .chip-on` rule: the pressed state barely shows');
  assert.match(on, /border-color/);
});

test('D-268 A1: the correction button says it sends, not "Save it" (which on the same sheet saves to Saved)', () => {
  assert.notEqual(t('correct_save_it'), 'Save it');
  assert.match(t('correct_save_it'), /send/i);
});
