/**
 * UX build 5, R-26: lib/pad-cents.js, the arithmetic of the cents-first pad, and
 * the switch that reverses it (FLAGS.centsFirstPad). The pad as a shopper meets it
 * is in test/ux/ux-b5-pad.test.mjs; the old point pad is pinned by test/sheet.test.mjs,
 * which calls the unflagged functions and must keep passing with the flag on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCentsKey, centsOfDigits, centsParts, PAD_MAX_DIGITS } from '../public/js/lib/pad-cents.js';
import { FLAGS } from '../public/js/flags.js';
import { keypadHtml } from '../public/js/screens/camera.js';

test('digits fill from the right: 4, 49, 499 read $0.04, $0.49, $4.99, and backspace takes the last digit', () => {
  let b = '';
  const seen = [];
  for (const k of ['4', '9', '9']) { b = applyCentsKey(b, k); seen.push(centsParts(b)); }
  assert.deepEqual(seen, [{ whole: '0', frac: '04' }, { whole: '0', frac: '49' }, { whole: '4', frac: '99' }]);
  assert.equal(centsOfDigits(b), 499);
  assert.equal(applyCentsKey(b, '⌫'), '49');
  assert.equal(applyCentsKey('', '⌫'), '', 'backspace on an empty price changed it');
  assert.equal(centsParts(''), null);
  assert.equal(centsOfDigits(''), null);
});

test('a leading zero is not stored, and a price longer than the limit is not extended', () => {
  assert.equal(applyCentsKey('', '0'), '');
  assert.equal(applyCentsKey('5', '0'), '50');
  const full = '1'.repeat(PAD_MAX_DIGITS);
  assert.equal(applyCentsKey(full, '2'), full);
});

test('anything that is not one digit or backspace throws, and says which key (4 of 4 refused, 11 of 11 accepted)', () => {
  for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '⌫']) assert.doesNotThrow(() => applyCentsKey('7', k), `real key ${k}`);
  for (const bad of ['x', '.', '12', '', undefined, null, 5]) {
    assert.throws(() => applyCentsKey('7', bad), /not a digit or backspace/, `key ${JSON.stringify(bad)}`);
  }
  assert.throws(() => applyCentsKey('7.5', '1'), /not a string of digits/);
  assert.throws(() => centsOfDigits('4.99'), /not a string of digits/);
});

test('the switch: ON by default for the beta, and the keypad has no point key with it on and keeps it with it off', () => {
  assert.equal(FLAGS.centsFirstPad, true);
  const on = keypadHtml({ confirm: true, canConfirm: true, centsFirst: true });
  const off = keypadHtml({ confirm: true, canConfirm: true });
  assert.equal(on.includes('data-pad="."'), false, 'cents first still has a point key');
  assert.equal(off.includes('data-pad="."'), true, 'control failed: the point pad lost its point key');
  for (const d of '0123456789') assert.ok(on.includes(`data-pad="${d}"`), `digit ${d} missing`);
  assert.ok(on.includes('data-pad="⌫"') && on.includes('key-confirm'));
});
