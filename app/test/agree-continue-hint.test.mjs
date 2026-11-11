/**
 * D-268 G32 (2026-11-11 walk, f3-01/f3-02): on the first screen, Continue was
 * grey with no hint while only the agree box was ticked; nothing said the
 * Claude question below still needed an answer. The screen now says what is
 * missing, under the button, and says nothing once both are answered.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { agreeHint } = await import('../public/js/screens/agree.js');
const { t } = await import('../public/js/ui-strings.js');
const screen = readFileSync(new URL('../public/js/screens/agree.js', import.meta.url), 'utf8');

test('D-268 G32: Continue says which answer is still missing', () => {
  assert.equal(agreeHint(true, null), t('agree_hint_claude'));
  assert.equal(agreeHint(false, true), t('agree_hint_terms'));
  assert.equal(agreeHint(false, null), t('agree_hint_both'));
  assert.equal(agreeHint(true, false), '', 'a no to Claude is a whole answer');
  assert.equal(agreeHint(true, true), '');
});

test('D-268 G32: the hint is on the screen, live, and painted with the button state', () => {
  assert.match(screen, /data-agree-hint[^>]*role="status"|role="status"[^>]*data-agree-hint/);
  assert.match(screen, /hint\.textContent = agreeHint\(ticked, claude\)/);
});
