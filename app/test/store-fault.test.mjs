/**
 * The store telling the difference between "nothing saved" and "could not read
 * what was saved".
 *
 * `load()` used to catch everything and return EMPTY, so a person whose data
 * failed to parse got the same screen as a person who had never saved anything:
 * "Nothing here yet", drawn over their actual watchlist. The three list screens
 * grew an error branch on 2026-09-06 and it could never fire, because nothing
 * downstream was ever told the read had failed.
 *
 * Worse than the wrong copy: the next `update()` persists that EMPTY state
 * straight over the unreadable blob, so a single bad byte was permanent. The
 * repo already says this about the corrections database -- "cannot be rebuilt
 * by anything" -- and a watchlist in browser storage has the same property.
 *
 * store.js reads `localStorage` at import time, so each case here installs its
 * own fake global and then imports a fresh copy of the module. The query string
 * is what defeats the ESM cache; it is not read by anything.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** A localStorage that behaves however the case needs it to. */
function fakeStorage(initial = {}, { throwOnRead = false, throwOnWrite = false } = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(k) {
      if (throwOnRead) throw new DOMExceptionish('read blocked');
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      if (throwOnWrite) throw new DOMExceptionish('write blocked');
      map.set(k, String(v));
    },
    removeItem(k) { map.delete(k); },
    get size() { return map.size; },
    raw: map,
  };
}
class DOMExceptionish extends Error {}

let caseId = 0;
async function loadStore(storage) {
  globalThis.localStorage = storage;
  return import(`../public/js/store.js?case=${++caseId}`);
}

test('a first run is not an error', async () => {
  const s = await loadStore(fakeStorage());
  assert.equal(s.loadFault(), null);
  assert.deepEqual(s.get().watchlist, []);
});

test('good data loads and is not an error', async () => {
  const saved = JSON.stringify({ watchlist: [{ id: 'a', label: 'Neilson milk 2L', savedAt: new Date().toISOString() }] });
  const s = await loadStore(fakeStorage({ 'shin.v1': saved }));
  assert.equal(s.loadFault(), null);
  assert.equal(s.get().watchlist.length, 1);
});

/** The case the three list screens were lying about. */
test('unparseable data reports corrupt rather than looking empty', async () => {
  const storage = fakeStorage({ 'shin.v1': '{"watchlist":[{"id":"a","label":"Neilson mi' });
  const s = await loadStore(storage);
  assert.equal(s.loadFault(), 'corrupt');
  assert.deepEqual(s.get().watchlist, [], 'it still has to return a usable state');
});

/**
 * The part that matters more than the copy: the bytes survive long enough for
 * somebody to get them back.
 */
test('an unreadable blob is kept before anything overwrites it', async () => {
  const blob = '{"watchlist":[{"id":"a","label":"Neilson mi';
  const storage = fakeStorage({ 'shin.v1': blob });
  await loadStore(storage);
  assert.equal(storage.raw.get('shin.v1.unreadable'), blob);
});

test('storage that throws on read reports blocked, and still runs', async () => {
  const s = await loadStore(fakeStorage({}, { throwOnRead: true }));
  assert.equal(s.loadFault(), 'blocked');
  assert.deepEqual(s.get().watchlist, [], 'a blocked read must not stop the app');
});

/** Rescuing the blob must not itself be able to take the app down. */
test('a storage that cannot be written to does not throw while rescuing', async () => {
  const storage = fakeStorage({ 'shin.v1': 'not json' }, { throwOnWrite: true });
  await assert.doesNotReject(loadStore(storage));
  const s = await loadStore(fakeStorage({ 'shin.v1': 'not json' }, { throwOnWrite: true }));
  assert.equal(s.loadFault(), 'corrupt');
});
