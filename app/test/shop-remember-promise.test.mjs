/**
 * D-268 E25 (2026-11-11 walk, f3-39): the shop chooser promised "Tap the shop
 * you are in. I will remember it.", but after a reload the shop read "Choose"
 * again. With location off nothing is remembered on purpose (a shop is kept
 * against the phone's coarse cell, shops.js chosenFor, and there is no cell
 * without location consent), so the promise is only made when it can be kept.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const cell = new Map();
globalThis.localStorage = {
  getItem: (k) => (cell.has(k) ? cell.get(k) : null),
  setItem: (k, v) => cell.set(k, String(v)),
  removeItem: (k) => cell.delete(k),
};
const { storePickerSheet } = await import('../public/js/screens/camera.js');
const { say } = await import('../public/js/voice.js');
const { LINES_FR } = await import('../public/js/voice-fr.js');

const shops = [{ id: 'node/1', name: 'Metro' }];

test('D-268 E25: with location off the chooser does not promise to remember the shop', () => {
  const html = storePickerSheet(shops, null, { remembers: false });
  assert.doesNotMatch(html, /remember/i);
  for (const v of ['deadpan', 'warm', 'blunt']) {
    assert.doesNotMatch(say('shop_pick_prompt_noloc', {}, v), /remember/i, v);
    assert.doesNotMatch(LINES_FR.shop_pick_prompt_noloc[v]({}), /souvenir/i, `${v} fr`);
  }
});

test('D-268 E25 (keep): with location on the promise stays, because it is kept', () => {
  assert.match(storePickerSheet(shops, null, { remembers: true }), /remember/i);
});
