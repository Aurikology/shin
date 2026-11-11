/**
 * D-268, small copy faults from the 2026-11-11 web walk (docs/bug-sweep-2026-11-11.md, family 3):
 * B14 "Based on 23216 similar items" had no thousands separator, and "A rough estimate from its
 *     department" is store-back-office jargon (Pexi says "aisle" in French already: "rayon").
 * B17 the Manual Search box said "Brand and model…" over a grocery scanner.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const cell = new Map();
globalThis.localStorage = {
  getItem: (k) => (cell.has(k) ? cell.get(k) : null),
  setItem: (k, v) => cell.set(k, String(v)),
  removeItem: (k) => cell.delete(k),
};
function inLocale(id, fn) {
  cell.set('shin.locale', id);
  try { return fn(); } finally { cell.delete('shin.locale'); }
}
const { t } = await import('../public/js/ui-strings.js');

test('D-268 B14: big counts carry a thousands separator, in each language', () => {
  assert.equal(t('vd_based_on_items', { n: 23216 }), 'Based on 23,216 similar items');
  assert.equal(t('vd_based_on_sellers', { n: 1200 }), 'Based on 1,200 sellers');
  const fr = inLocale('fr', () => t('vd_based_on_items', { n: 23216 }));
  assert.match(fr, /^Selon 23\s216 produits semblables$/u, fr);
});

test('D-268 B14: the department prior is said in shopper words', () => {
  assert.doesNotMatch(t('vd_prov_department_prior'), /department/i);
  assert.doesNotMatch(t('vd_why_department_prior'), /department/i);
});

test('D-268 B17: the typed-search box asks for a product, not a brand and model', () => {
  assert.doesNotMatch(t('cam_brand_model_placeholder'), /model/i);
});
