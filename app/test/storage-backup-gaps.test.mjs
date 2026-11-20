/**
 * R79 gaps (docs/readiness/storage-audit.md, 2026-11-19): after iOS clears the app's web storage, the
 * Keychain copy brought back the setup but not the look the shopper picked, not their language, not a
 * watchlist past 12,000 bytes (the whole list was dropped, not trimmed), and not one row of Past scans
 * (the server keeps scan totals by device, not the list, so nothing could refill it).
 *
 * Written before the fix, as the acceptance check for that batch (Aurik 2026-11-19: "keep going, push
 * when the tests pass").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const doc = makeDocument();
const storage = makeStorage();
installBrowser({ doc, storage });

const { setupSnapshot, restoreSetupIfWiped, startSetupBackup } = await import('../public/js/storage-backup.js');

const SETUP = {
  city: 'Hamilton', seenIntro: true, personality: 'warm', lineUnderPct: 20, lineOverPct: 20, lineGreatPct: 30,
  linesSet: true, lineUnit: 'percent', lineAmounts: {}, consentSeen: true, permissionsSeen: true,
  agreement: { terms: true, claude: true, at: '2026-11-01T00:00:00.000Z' },
  consent: { photos: false, location: true, updatedAt: '2026-11-01T00:00:00.000Z' },
  market: { country: 'CA', currency: 'CAD', code: 'CA', region: 'ON' },
  watchlist: [{ id: 'w1', name: 'Milk 2 L' }],
};
const BLANK = { city: null, seenIntro: false, personality: null, linesSet: false, consentSeen: false, permissionsSeen: false, agreement: null, watchlist: [], history: [], market: { country: '', currency: '', code: '', region: '' } };

function fakeKeychain() {
  const data = {};
  return { data, get: async ({ key }) => { if (!(key in data)) throw new Error('no such key'); return { value: data[key] }; }, set: async ({ key, value }) => { data[key] = value; } };
}
function fakeStore(initial) {
  let state = { ...initial };
  const listeners = new Set();
  return {
    get: () => state,
    update: (patch) => { state = typeof patch === 'function' ? patch(state) : { ...state, ...patch }; for (const l of listeners) l(state); },
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
const now = { setTimer: (fn) => { fn(); return 1; }, clearTimer: () => {} };
const settle = () => new Promise((r) => setTimeout(r, 10));
const scan = (i) => ({ id: 'h' + i, at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(), query: { barcode: String(6000000000000 + i) }, result: { name: 'Product ' + i, verdict: 'fair', price: 3.99, note: 'x'.repeat(200) } });

test('a wiped app gets back the look and the language the shopper picked, the look on this launch', async () => {
  storage.clear();
  storage.setItem('shin.theme', 'dark');
  storage.setItem('shin.locale', 'fr');
  const kc = fakeKeychain();
  const stop = startSetupBackup({ plugin: kc, store: fakeStore(SETUP), delayMs: 0, ...now });
  await settle();
  stop();

  storage.clear();
  delete doc.documentElement.dataset.theme;
  const wiped = fakeStore(BLANK);
  assert.equal(await restoreSetupIfWiped({ plugin: kc, store: wiped }), 'restored');
  assert.equal(storage.getItem('shin.theme'), 'dark');
  assert.equal(storage.getItem('shin.locale'), 'fr');
  assert.equal(doc.documentElement.dataset.theme, 'dark', 'the restored look shows now, not on the next launch');
});

test('a junk theme or language in the copy is not written back', async () => {
  storage.clear();
  const kc = fakeKeychain();
  const stop = startSetupBackup({ plugin: kc, store: fakeStore(SETUP), delayMs: 0, ...now });
  await settle();
  stop();
  const key = Object.keys(kc.data)[0];
  const saved = JSON.parse(kc.data[key]);
  kc.data[key] = JSON.stringify({ ...saved, theme: '<script>', locale: 42 });
  storage.clear();
  await restoreSetupIfWiped({ plugin: kc, store: fakeStore(BLANK) });
  assert.equal(storage.getItem('shin.theme'), null);
  assert.equal(storage.getItem('shin.locale'), null);
});

test('a watchlist too big for the Keychain keeps its newest entries instead of losing all of them', () => {
  const big = Array.from({ length: 600 }, (_, i) => ({ id: 'w' + i, name: 'x'.repeat(60) }));
  const snap = setupSnapshot({ ...SETUP, watchlist: big });
  assert.ok(Array.isArray(snap.watchlist) && snap.watchlist.length > 0, 'some of the list survives');
  assert.ok(JSON.stringify(snap.watchlist).length <= 12_000, 'within the old size bound');
  assert.deepEqual(snap.watchlist, big.slice(0, snap.watchlist.length), 'the newest (first) entries, in order');
});

test('Past scans: the newest scans survive a wipe, within a size bound', async () => {
  const history = Array.from({ length: 100 }, (_, i) => scan(i));
  const snap = setupSnapshot({ ...SETUP, history });
  assert.ok(Array.isArray(snap.history) && snap.history.length >= 10, 'at least the last ten scans');
  assert.ok(JSON.stringify(snap.history).length <= 32_000, 'small enough for the Keychain');
  assert.deepEqual(snap.history.map((h) => h.id), history.slice(0, snap.history.length).map((h) => h.id), 'newest first, in order');

  storage.clear();
  const kc = fakeKeychain();
  const stop = startSetupBackup({ plugin: kc, store: fakeStore({ ...SETUP, history }), delayMs: 0, ...now });
  await settle();
  stop();
  const wiped = fakeStore(BLANK);
  await restoreSetupIfWiped({ plugin: kc, store: wiped });
  assert.ok(wiped.get().history.length >= 10);
  assert.equal(wiped.get().history[0].id, 'h0');
});

test('a damaged history in the copy cannot put junk in the store', async () => {
  storage.clear();
  const kc = fakeKeychain();
  const stop = startSetupBackup({ plugin: kc, store: fakeStore(SETUP), delayMs: 0, ...now });
  await settle();
  stop();
  const key = Object.keys(kc.data)[0];
  kc.data[key] = JSON.stringify({ ...JSON.parse(kc.data[key]), history: [null, 7, 'x', { id: 'ok', at: '2026-11-01T00:00:00.000Z' }] });
  const wiped = fakeStore(BLANK);
  await restoreSetupIfWiped({ plugin: kc, store: wiped });
  for (const h of wiped.get().history) assert.ok(h && typeof h === 'object' && typeof h.id === 'string', 'only scan-shaped rows');
});
