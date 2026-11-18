/**
 * R79: iOS can clear a web view's storage (low disk, "Offload App", a system cleanup). The device id
 * already comes back from the Keychain (device.js). The setup a shopper did, their look and ranges,
 * their agreements and their watchlist, did not: the app opened as if brand new and asked for all of
 * it again. A small copy of those choices now also lives in the Keychain and is put back, before the
 * first screen is chosen, when the app finds itself blank.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });

const { BACKUP_KEY, setupSnapshot, isBlank, restoreSetupIfWiped, startSetupBackup } = await import('../public/js/storage-backup.js');

const SETUP = {
  city: 'Hamilton',
  seenIntro: true,
  personality: 'warm',
  lineUnderPct: 20,
  lineOverPct: 20,
  lineGreatPct: 30,
  linesSet: true,
  lineUnit: 'percent',
  lineAmounts: {},
  consentSeen: true,
  permissionsSeen: true,
  agreement: { terms: true, claude: true, at: '2026-11-01T00:00:00.000Z' },
  consent: { photos: false, location: true, updatedAt: '2026-11-01T00:00:00.000Z' },
  market: { country: 'CA', currency: 'CAD', code: 'CA', region: 'ON' },
  watchlist: [{ id: 'w1', name: 'Milk 2 L' }],
};
const BLANK = { city: null, seenIntro: false, personality: null, linesSet: false, consentSeen: false, permissionsSeen: false, agreement: null, watchlist: [], history: [], market: { country: '', currency: '', code: '', region: '' } };

function fakeKeychain(initial = {}) {
  const data = { ...initial };
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

test('the snapshot holds the setup choices and not the history, ratings or anything bulky', () => {
  const snap = setupSnapshot({ ...SETUP, history: [{ id: 'h' }], ratings: [{}], corrections: [{}], removed: [{}], scanCount: 9 });
  assert.equal(snap.personality, 'warm');
  assert.equal(snap.agreement.claude, true);
  assert.deepEqual(snap.watchlist, [{ id: 'w1', name: 'Milk 2 L' }]);
  for (const k of ['history', 'ratings', 'corrections', 'removed', 'scanCount']) assert.ok(!(k in snap), `${k} should not be backed up`);
});

test('a watchlist too big for the Keychain is left out rather than the whole backup failing', () => {
  const big = Array.from({ length: 600 }, (_, i) => ({ id: 'w' + i, name: 'x'.repeat(60) }));
  const snap = setupSnapshot({ ...SETUP, watchlist: big });
  assert.ok(!('watchlist' in snap));
  assert.equal(snap.personality, 'warm');
});

test('blank means no setup of any kind was ever done', () => {
  assert.equal(isBlank(BLANK), true);
  assert.equal(isBlank(SETUP), false);
  assert.equal(isBlank({ ...BLANK, personality: 'warm' }), false);
});

test('a wiped app gets its setup back from the Keychain before the first screen', async () => {
  const plugin = fakeKeychain({ [BACKUP_KEY]: JSON.stringify({ v: 1, ...setupSnapshot(SETUP) }) });
  const store = fakeStore(BLANK);
  const out = await restoreSetupIfWiped({ plugin, store });
  assert.equal(out, 'restored');
  assert.equal(store.get().personality, 'warm');
  assert.equal(store.get().seenIntro, true);
  assert.equal(store.get().agreement.claude, true);
  assert.equal(store.get().lineUnderPct, 20);
  assert.equal(store.get().watchlist.length, 1);
});

test('an app that still has its setup is left exactly as it is', async () => {
  const plugin = fakeKeychain({ [BACKUP_KEY]: JSON.stringify({ v: 1, ...setupSnapshot({ ...SETUP, personality: 'blunt' }) }) });
  const store = fakeStore(SETUP);
  assert.equal(await restoreSetupIfWiped({ plugin, store }), 'kept');
  assert.equal(store.get().personality, 'warm');
});

test('no backup, a blank backup, an unreadable one, or no Keychain: nothing happens and nothing throws', async () => {
  for (const initial of [{}, { [BACKUP_KEY]: JSON.stringify({ v: 1, ...setupSnapshot(BLANK) }) }, { [BACKUP_KEY]: '{not json' }, { [BACKUP_KEY]: JSON.stringify({ v: 99, personality: 'warm' }) }]) {
    const store = fakeStore(BLANK);
    const out = await restoreSetupIfWiped({ plugin: fakeKeychain(initial), store });
    assert.equal(out, 'nothing');
    assert.equal(store.get().personality, null);
  }
  assert.equal(await restoreSetupIfWiped({ plugin: null, store: fakeStore(BLANK) }), 'nothing');
});

test('restore takes only known fields of the right type: a damaged backup cannot poison the store', async () => {
  const bad = { v: 1, personality: 'warm', seenIntro: 'yes', lineUnderPct: 'lots', watchlist: 'nope', evil: { x: 1 }, history: [{ id: 'z' }] };
  const store = fakeStore(BLANK);
  await restoreSetupIfWiped({ plugin: fakeKeychain({ [BACKUP_KEY]: JSON.stringify(bad) }), store });
  assert.equal(store.get().personality, 'warm');
  assert.equal(store.get().seenIntro, false);
  assert.equal(store.get().lineUnderPct, undefined);
  assert.deepEqual(store.get().watchlist, []);
  assert.ok(!('evil' in store.get()));
  assert.deepEqual(store.get().history, []);
});

test('changes to the setup are written to the Keychain, once, after a pause, and not when nothing changed', async () => {
  const plugin = fakeKeychain();
  const store = fakeStore(BLANK);
  const timers = [];
  const stop = startSetupBackup({ plugin, store, delayMs: 10, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => { timers.length = 0; } });
  store.update({ personality: 'warm', seenIntro: true });
  store.update({ city: 'Hamilton' });
  assert.equal(timers.length, 1, 'two quick changes should become one pending write');
  await timers[0]();
  assert.equal(JSON.parse(plugin.data[BACKUP_KEY]).city, 'Hamilton');
  timers.length = 0;
  store.update({ scanCount: 5 }); // not part of the backup
  assert.equal(timers.length, 0, 'a change outside the backup must not cause a write');
  stop();
});

test('a failing Keychain write is swallowed', async () => {
  const plugin = { get: async () => { throw new Error('x'); }, set: async () => { throw new Error('keychain full'); } };
  const store = fakeStore(BLANK);
  const timers = [];
  startSetupBackup({ plugin, store, delayMs: 10, setTimer: (fn) => { timers.push(fn); return 1; }, clearTimer: () => {} });
  store.update({ personality: 'warm' });
  await assert.doesNotReject(async () => timers[0]());
});
