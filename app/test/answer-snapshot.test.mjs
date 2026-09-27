/**
 * The existing answer kinds render byte for byte as they did before the
 * catalogue-first client landed.
 *
 * RULINGS.md "Catalogue first": "The beta keeps today's behaviour until one
 * setting flips". With SHIN_CATALOGUE_FIRST off the server never sends
 * `kind: 'catalogue'`, so every sheet a shopper can see must be the sheet they
 * saw before. snapshots/answer-sheets.json was generated from camera.js as it
 * stood at 5e52e6d (the commit before this client work), through the same
 * fixtures (answer-snapshot-fixtures.mjs), and the current renderers must
 * produce the identical markup.
 *
 * A deliberate change to one of these sheets updates the snapshot in the same
 * commit, by regenerating it: import the fixtures, call `renderAll` on the new
 * camera.js with Date.now pinned to FIXED_NOW, and write the result.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cell = new Map();
globalThis.localStorage = {
  getItem: (k) => (cell.has(k) ? cell.get(k) : null),
  setItem: (k, v) => cell.set(k, String(v)),
  removeItem: (k) => cell.delete(k),
};

const { renderAll, FIXED_NOW } = await import('./answer-snapshot-fixtures.mjs');
const cam = await import('../public/js/screens/camera.js');

const SNAPSHOT = JSON.parse(readFileSync(fileURLToPath(new URL('./snapshots/answer-sheets.json', import.meta.url)), 'utf8'));

test('every existing answer kind renders exactly as it did before catalogue first', () => {
  const realNow = Date.now;
  Date.now = () => FIXED_NOW;
  let now;
  try {
    now = renderAll(cam);
  } finally {
    Date.now = realNow;
  }
  assert.deepEqual(Object.keys(now), Object.keys(SNAPSHOT), 'the fixture set changed without the snapshot');
  assert.ok(Object.keys(SNAPSHOT).length >= 10, 'the snapshot is too small to prove anything');
  for (const [name, html] of Object.entries(SNAPSHOT)) {
    assert.equal(now[name], html, `${name}: the sheet changed. If that was meant, regenerate the snapshot in the same commit.`);
  }
});

test('the snapshot is of real sheets, not empty strings', () => {
  for (const [name, html] of Object.entries(SNAPSHOT)) {
    assert.match(html, /<section class="sheet /, `${name} is not a sheet`);
  }
  assert.match(SNAPSHOT['gemini, over your line'], /data-kind="gemini"/);
  assert.match(SNAPSHOT['verdict, certain'], /class="sheet verdict"/);
});
