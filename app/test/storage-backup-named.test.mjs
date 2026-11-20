/**
 * R79 gap 3 (docs/readiness/storage-audit.md): the names a shopper typed for barcodes Pexi did not know
 * (`named`, capped at 100 in store.js) and the shops they pick from (`shops`) were lost when iOS cleared
 * the app's web storage, so every one of those barcodes came back unnamed. Written before the fix
 * (2026-11-20, Aurik: "continue working").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });
const { setupSnapshot, restoreSetupIfWiped } = await import('../public/js/storage-backup.js');

const SETUP = { seenIntro: true, personality: 'warm', linesSet: true, consentSeen: true, permissionsSeen: true, agreement: { terms: true, claude: true, at: '2026-11-01T00:00:00.000Z' } };
const BLANK = { city: null, seenIntro: false, personality: null, linesSet: false, consentSeen: false, permissionsSeen: false, agreement: null, watchlist: [], history: [], named: {}, shops: { known: [], lastByCell: {} } };
const NAMED = { '62699001001': { name: "McCain Tasti Tater's 800g", at: '2026-11-10T00:00:00.000Z' }, '68100084245': { name: 'Kraft Smooth Peanut Butter 1kg', at: '2026-11-11T00:00:00.000Z' } };
const SHOPS = { known: [{ id: 'metro-1', name: 'Metro', count: 3, at: '2026-11-10T00:00:00.000Z' }, { id: 'nofrills-2', name: 'No Frills', count: 1, at: '2026-11-09T00:00:00.000Z' }], lastByCell: { abc: 'metro-1' } };

function fakeStore(initial) {
  let state = { ...initial };
  return { get: () => state, update: (p) => { state = { ...state, ...p }; }, subscribe: () => () => {} };
}
const keychainWith = (obj) => ({ get: async () => ({ value: JSON.stringify({ v: 1, ...obj }) }), set: async () => {} });

test('the copy carries the barcode names and the shops', () => {
  const snap = setupSnapshot({ ...SETUP, named: NAMED, shops: SHOPS });
  assert.deepEqual(snap.named, NAMED);
  assert.deepEqual(snap.shops, SHOPS);
});

test('a wiped app gets its barcode names and shops back', async () => {
  const store = fakeStore(BLANK);
  assert.equal(await restoreSetupIfWiped({ plugin: keychainWith({ ...SETUP, named: NAMED, shops: SHOPS }), store }), 'restored');
  assert.deepEqual(store.get().named, NAMED);
  assert.deepEqual(store.get().shops, SHOPS);
});

test('damaged names or shops in the copy cannot put junk in the store', async () => {
  const store = fakeStore(BLANK);
  await restoreSetupIfWiped({ plugin: keychainWith({ ...SETUP, named: { '1': { name: 'ok', at: '2026-11-01T00:00:00.000Z' }, '2': 7, '3': { x: 1 }, '4': 'bare' }, shops: { known: ['Metro', 7, null, { id: 'ok-1', name: 'Ok' }], lastByCell: [] } }), store });
  for (const v of Object.values(store.get().named)) assert.ok(v && typeof v === 'object' && typeof v.name === 'string', 'only {name, at} rows');
  assert.equal(store.get().named['1']?.name, 'ok', 'the good row survives');
  const shops = store.get().shops;
  assert.ok(Array.isArray(shops.known) && shops.known.every((s) => s && typeof s === 'object' && typeof s.id === 'string'));
  assert.ok(shops.lastByCell && typeof shops.lastByCell === 'object' && !Array.isArray(shops.lastByCell));
});
