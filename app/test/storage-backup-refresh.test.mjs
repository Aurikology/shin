/**
 * R79, 2026-11-20: the Keychain copy now carries the theme and the language, which live in their own
 * localStorage keys outside the store. So the copy has to refresh when ONLY one of those changes (the You
 * screen fires `shin:theme`, lib/locale.js fires `shin:locale`), and a deliberate reset must still not
 * be undone by a wipe, theme, language and Past scans included.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const doc = makeDocument();
const storage = makeStorage();
installBrowser({ doc, storage });

const { BACKUP_KEY, setupSnapshot, restoreSetupIfWiped, startSetupBackup } = await import('../public/js/storage-backup.js');

const SETUP = {
  city: 'Hamilton', seenIntro: true, personality: 'warm', linesSet: true, consentSeen: true, permissionsSeen: true,
  agreement: { terms: true, claude: true, at: '2026-11-01T00:00:00.000Z' },
  watchlist: [{ id: 'w1', name: 'Milk 2 L' }],
  history: [{ id: 'h1', at: '2026-11-01T00:00:00.000Z', result: { name: 'Milk' }, query: { barcode: '1' } }],
};
const BLANK = { city: null, seenIntro: false, personality: null, linesSet: false, consentSeen: false, permissionsSeen: false, agreement: null, watchlist: [], history: [] };

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
const saved = (kc) => JSON.parse(kc.data[BACKUP_KEY]);

test('changing only the theme or only the language refreshes the copy; stopping stops listening', async () => {
  storage.clear();
  const kc = fakeKeychain();
  const events = new EventTarget();
  const stop = startSetupBackup({ plugin: kc, store: fakeStore(SETUP), delayMs: 0, events, ...now });
  await settle();
  assert.equal(saved(kc).theme, undefined, 'system (no key) is not copied');

  storage.setItem('shin.theme', 'light');
  events.dispatchEvent(new Event('shin:theme'));
  await settle();
  assert.equal(saved(kc).theme, 'light');

  storage.setItem('shin.locale', 'fr');
  events.dispatchEvent(new Event('shin:locale'));
  await settle();
  assert.equal(saved(kc).locale, 'fr');

  storage.setItem('shin.theme', 'system');
  events.dispatchEvent(new Event('shin:theme'));
  await settle();
  assert.equal(saved(kc).theme, undefined, 'back to following the phone');

  stop();
  storage.setItem('shin.theme', 'dark');
  events.dispatchEvent(new Event('shin:theme'));
  await settle();
  assert.equal(saved(kc).theme, undefined, 'a stopped backup writes nothing');
});

test('a deliberate reset writes a blank copy that a wipe does not undo, theme, language and Past scans included', async () => {
  storage.clear();
  storage.setItem('shin.theme', 'dark');
  storage.setItem('shin.locale', 'fr');
  const kc = fakeKeychain();
  const store = fakeStore(SETUP);
  const stop = startSetupBackup({ plugin: kc, store, delayMs: 0, events: new EventTarget(), ...now });
  await settle();
  assert.equal(saved(kc).history.length, 1);

  store.update(BLANK); // the reset
  await settle();
  stop();
  assert.equal(saved(kc).history, undefined, 'the reset copy holds no scans');

  storage.clear();
  delete doc.documentElement.dataset.theme;
  const wiped = fakeStore(BLANK);
  assert.equal(await restoreSetupIfWiped({ plugin: kc, store: wiped }), 'nothing');
  assert.equal(storage.getItem('shin.theme'), null);
  assert.equal(storage.getItem('shin.locale'), null);
  assert.equal(doc.documentElement.dataset.theme, undefined);
  assert.deepEqual(wiped.get().history, []);
});

test('Past scans leave their thumbnails out, skip a single huge row, and stay within the byte bound', () => {
  const thumb = 'data:image/jpeg;base64,' + 'A'.repeat(4000);
  const history = [
    { id: 'h0', at: '2026-11-01T00:00:00.000Z', result: { name: 'a' }, query: { text: 'a', thumb } },
    { id: 'huge', at: '2026-11-01T00:00:00.000Z', result: { note: 'x'.repeat(10_000) } },
    { id: 'h2', at: '2026-11-01T00:00:00.000Z', result: { name: 'b' } },
    null,
    ...Array.from({ length: 200 }, (_, i) => ({ id: 'n' + i, at: '2026-11-01T00:00:00.000Z', result: { note: 'y'.repeat(500) } })),
  ];
  const snap = setupSnapshot({ ...SETUP, history });
  assert.deepEqual(snap.history.slice(0, 2).map((h) => h.id), ['h0', 'h2']);
  assert.equal(snap.history[0].query.thumb, undefined);
  assert.equal(snap.history[0].query.text, 'a');
  assert.ok(new TextEncoder().encode(JSON.stringify(snap.history)).length <= 32_000);
  assert.ok(snap.history.length >= 10);
});
