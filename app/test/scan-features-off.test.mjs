/**
 * 2026-11-14 (owner, from using build 7 in a store): "a lot of features don't work like the text
 * scanning feature and are still appearing". The rule: if pressing a control cannot give the shopper
 * a result, it is not on screen. Source-asserted where the markup lives inside the camera's render
 * closure (the convention in this folder); the pad's own markup is rendered for real.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });

const camera = await import('../public/js/screens/camera.js');
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const CAMERA = read('../public/js/screens/camera.js');
const ATTACH = read('../public/js/eye-attach.js');

test('the price pad has no "Find a better buy" choice, and its mode is validation', () => {
  const item = { id: 'x', text: 'Nesquik 700 ml', category: 'grocery', pendingScan: { kind: 'barcode', code: '1' } };
  for (const alt of [null, 'validation', 'switching']) {
    const html = camera.pricePadSheet(item, '', null, null, null, false, '', alt, true);
    assert.ok(!/data-pad-alt|data-alt-mode|Find a better buy/.test(html), `the pad still draws the choice for altMode ${alt}`);
  }
});

test('the text scanning pick-of-3 mounts only for a developer', () => {
  const wire = CAMERA.slice(CAMERA.indexOf('textMatch = mountTextMatch({'), CAMERA.indexOf('textMatch = mountTextMatch({') + 1400);
  assert.match(wire, /native: devOn\(\{ tagsOn: tagsOn\(\) \}\) \? undefined : null,/);
});

test('the other-object marks, which start a photo scan, are not drawn while photo scanning is off', () => {
  const alts = ATTACH.slice(ATTACH.indexOf('const paintAlts'), ATTACH.indexOf('const paintAlts') + 500);
  assert.match(alts, /FLAGS\.photoId \? boxes\.slice\(1\) : \[\]/);
});

test('the pack read stays a Developer-row switch: no shopper control sends a frame', () => {
  // The only reader of the switch outside the You screen's developer block is the camera's own gating.
  const you = read('../public/js/screens/you.js');
  assert.match(you, /devOn\(\{ tagsOn: tagsOn\(\) \}\) \? `<section class="block">/);
  assert.match(CAMERA, /scanFrame = packReadOn\(\) \? captureFrame/);
});
