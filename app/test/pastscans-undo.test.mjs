/**
 * D-268 D21 (2026-11-11 walk): a past scan was removed instantly, with no
 * confirmation and no undo, while removing a saved item gives the R-94 undo
 * bar for four seconds. Aurik's call delegated 2026-11-11 ("i give it your
 * call"): Past scans gets the same undo as Saved, from the one shared template.
 *
 * Source assertions for the screen's click handler (it lives in the mount
 * closure); the shared template is rendered.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cell = new Map();
globalThis.localStorage = { getItem: (k) => cell.get(k) ?? null, setItem: (k, v) => cell.set(k, String(v)), removeItem: (k) => cell.delete(k) };
const { undoToastHtml } = await import('../public/js/lib/undo-toast.js');
const src = (f) => readFileSync(new URL(`../public/js/screens/${f}`, import.meta.url), 'utf8');

test('D-268 D21: one undo bar template, with an Undo button', () => {
  const bar = String(undoToastHtml('Removed'));
  assert.match(bar, /data-list-toast/);
  assert.match(bar, /data-act="undo-remove"/);
});

test('D-268 D21: removing a past scan opens the undo bar, and Undo puts the scan back', () => {
  const p = src('pastscans.js');
  const del = p.slice(p.indexOf("const del = e.target.closest('[data-remove]');"));
  assert.match(del.slice(0, 600), /createUndoToast\(\{[\s\S]*restoreRemoved\('scan', id\)/, 'no undo is offered after removing a past scan');
  assert.match(p, /undoNow\(undo, 'pastscans'\)/, 'the Undo tap is not handled on Past scans');
  assert.match(p, /undo\?\.isOpen \? undoToastHtml\(undo\.label\)/, 'the bar is not drawn on Past scans');
});

test('D-268 D21 (keep): Saved draws the bar from the same shared template', () => {
  assert.match(src('watchlist.js'), /import \{[^}]*undoToastHtml[^}]*\} from '\.\.\/lib\/undo-toast\.js'/);
});
