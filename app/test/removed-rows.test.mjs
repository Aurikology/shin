/**
 * D-268 D21 (2026-11-11 walk, f3-53): on Recently removed a row with no price
 * showed "--" as its price, and a removed past scan looked identical to a
 * removed saved item, so the shopper could not tell which list a restore puts
 * it back on. A row with no price shows no price, and each row names its list.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const cell = new Map();
globalThis.localStorage = {
  getItem: (k) => (cell.has(k) ? cell.get(k) : null),
  setItem: (k, v) => cell.set(k, String(v)),
  removeItem: (k) => cell.delete(k),
};
const { row } = await import('../public/js/screens/removed.js');
const { t } = await import('../public/js/ui-strings.js');

const at = new Date().toISOString();
const saved = { kind: 'watch', id: 'w1', label: 'Oreo 303 g', removedAt: at };
const past = { kind: 'scan', id: 'h1', query: { text: 'Oreo' }, result: null, removedAt: at };

test('D-268 D21: a removed row with no price shows no "--"', () => {
  for (const r of [saved, past]) assert.doesNotMatch(String(row(r, null)), />\s*--\s*</, r.kind);
});

test('D-268 D21: each removed row says which list it came from', () => {
  assert.match(String(row(saved, null)), new RegExp(t('saved_title')));
  assert.match(String(row(past, null)), new RegExp(t('past_scans')));
});
