/**
 * D-268 F31 (2026-11-11 walk, f3-62/f3-63): two lines on the You page read
 * wrong. The ratings row said "0 thumbs up · 1 thumbs down" (and "1 thumbs
 * down" in the singular), and the footer said "Build 2026-11-11 01:19 (when
 * this server last started)", internal words for a date that is the server's
 * start, not an app build.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { t } from '../public/js/ui-strings.js';

const you = readFileSync(new URL('../public/js/screens/you.js', import.meta.url), 'utf8');

test('D-268 F31: the ratings row says how many looked right and wrong, in plain words', () => {
  assert.equal(t('you_rated_right', { n: 0 }), '0 looked right');
  assert.equal(t('you_rated_wrong', { n: 1 }), '1 looked wrong');
  assert.doesNotMatch(you, /t\('you_thumbs_up'\)|t\('you_thumbs_down'\)/, 'the screen still prints "thumbs up / thumbs down"');
});

test('D-268 F31: the footer names what the date is without internal words', () => {
  assert.doesNotMatch(you, /t\('you_build_note'\)/, 'the footer still appends "(when this server last started)"');
  assert.equal(t('you_build'), 'Server updated');
});
