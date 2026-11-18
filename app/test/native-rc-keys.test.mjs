/**
 * R31: a release built with a wrong or missing RevenueCat key installs fine and cannot sell anything,
 * and Apple rejects a broken purchase. The key check in native/scripts/sync-web.mjs refuses it at build time.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRevenueCatKeys } from '../../native/scripts/rc-keys.mjs';

test('R31: a secret key is refused on any platform, release or not', () => {
  assert.match(checkRevenueCatKeys({ ios: 'sk_live_x', android: '' }, { release: false }) ?? '', /SECRET/);
  assert.match(checkRevenueCatKeys({ ios: 'appl_ok', android: 'sk_x' }, { release: false }) ?? '', /SECRET/);
});

test('R31: an iOS key that is not an appl_ key is refused, release or not', () => {
  assert.match(checkRevenueCatKeys({ ios: 'goog_abc', android: '' }, { release: false }) ?? '', /appl_/);
  assert.match(checkRevenueCatKeys({ ios: 'test_abc', android: '' }, { release: true }) ?? '', /appl_/);
});

test('R31: an Android key that is not a goog_ key is refused', () => {
  assert.match(checkRevenueCatKeys({ ios: 'appl_ok', android: 'appl_abc' }, { release: false }) ?? '', /goog_/);
});

test('R31: a release build with no iOS key is refused; a development build only warns', () => {
  assert.match(checkRevenueCatKeys({ ios: '', android: '' }, { release: true }) ?? '', /iOS release build/);
  assert.match(checkRevenueCatKeys({ ios: '   ', android: '' }, { release: true }) ?? '', /iOS release build/);
  assert.equal(checkRevenueCatKeys({ ios: '', android: '' }, { release: false }), null);
});

test('R31: good keys pass', () => {
  assert.equal(checkRevenueCatKeys({ ios: 'appl_abcdef', android: 'goog_abcdef' }, { release: true }), null);
  assert.equal(checkRevenueCatKeys({ ios: 'appl_abcdef', android: '' }, { release: true }), null);
});
