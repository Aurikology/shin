/**
 * D-268 D20 (2026-11-11 walk, f3-51/f3-52): Saved contradicted the answer it
 * was saved from. The 685 g row said "$1.31 over the usual" (usual $8.68) while
 * the sheet said typical $8.70, "$1.29"; the 303 g row, saved with no shelf
 * price, said "no usual price" while its detail said "Typical price $5.00".
 * Cause: the save stored the unrounded centre (the sheet shows the rounded
 * estimate, R-42), and a row with a usual but no price of its own fell to
 * "no usual price".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cell = new Map();
globalThis.localStorage = {
  getItem: (k) => (cell.has(k) ? cell.get(k) : null),
  setItem: (k, v) => cell.set(k, String(v)),
  removeItem: (k) => cell.delete(k),
};
const { row } = await import('../public/js/screens/watchlist.js');

const at = '2026-11-11T12:00:00Z';

test('D-268 D20: a saved row with a usual but no shelf price says the usual, never "no usual price"', () => {
  const html = String(row({ id: 'k1', label: 'Oreo 303 g', lastCents: null, usualCents: 500, savedAt: at }, []));
  assert.doesNotMatch(html, /no usual price/);
  // No market is chosen in the test, so money() prints no currency symbol.
  assert.match(html, /usually \$?5\.00/);
});

test('D-268 D20: the save stores the usual the sheet showed (rounded), so the row and sheet agree', () => {
  const cam = readFileSync(new URL('../public/js/screens/camera.js', import.meta.url), 'utf8');
  const save = cam.slice(cam.indexOf("if (act === 'dist-save') {"), cam.indexOf("// D-240, range-save"));
  assert.match(save, /usualCents: v \? roundEstimateCents\(v\.centreCents\) : null/, 'the dist-save stores the unrounded centre');
});
