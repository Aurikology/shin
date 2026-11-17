/**
 * Security finding A3 (2026-11-16): the free scans are counted per device id, and device.js kept the id and its
 * secret only in localStorage, which a reinstall wipes, so every reinstall was a fresh allowance. On the iPhone the
 * id and secret now also live in the Keychain, which survives a reinstall.
 *
 * device.js stays synchronous for its many callers; `hydrateDeviceIdentity` runs once at boot, copies the Keychain's
 * id and secret into localStorage (the reinstall case), or copies an existing localStorage id and secret into the
 * Keychain (the migration), and never throws or stalls. On the web, or when the plugin fails, nothing changes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });

let n = 0;
/** A fresh copy of device.js (its module state is per copy) on a fresh localStorage. */
async function fresh() {
  Object.defineProperty(globalThis, 'localStorage', { value: makeStorage(), writable: true, configurable: true });
  return import(`../public/js/device.js?copy=${(n += 1)}`);
}

/** A Keychain plugin like capacitor-secure-storage-plugin: get rejects when the key is absent. */
function keychain(initial = {}, { fail = false, hang = false } = {}) {
  const store = new Map(Object.entries(initial));
  const log = [];
  const plugin = {
    store,
    log,
    async get({ key }) {
      log.push(['get', key]);
      if (hang) return new Promise(() => {});
      if (fail) throw new Error('keychain unavailable');
      if (!store.has(key)) throw new Error('Item with given key does not exist');
      return { value: store.get(key) };
    },
    async set({ key, value }) {
      log.push(['set', key]);
      if (fail) throw new Error('keychain unavailable');
      store.set(key, value);
      return { value: true };
    },
  };
  return plugin;
}
const nativeWin = (plugin, platform = 'ios') => ({
  Capacitor: {
    getPlatform: () => platform,
    isPluginAvailable: () => true,
    registerPlugin: (name) => {
      assert.equal(name, 'SecureStoragePlugin');
      return plugin;
    },
  },
});

test('web: nothing is touched and the id still comes from localStorage', async () => {
  const d = await fresh();
  const before = d.getDeviceId();
  assert.equal(before.persistent, true);
  const r = await d.hydrateDeviceIdentity({ win: { Capacitor: { getPlatform: () => 'web' } } });
  assert.equal(r.source, 'localStorage');
  assert.equal(d.getDeviceId().id, before.id);
});

test('SIM: a reinstall (empty localStorage, id in the Keychain) gets the same id and secret back, not a new allowance', async () => {
  const kc = keychain({ 'shin.deviceId': 'old-phone-id', 'shin.deviceSecret': 'a'.repeat(64) });
  const d = await fresh();
  const r = await d.hydrateDeviceIdentity({ win: nativeWin(kc) });
  assert.equal(r.source, 'keychain');
  assert.equal(d.getDeviceId().id, 'old-phone-id');
  assert.equal(d.getDeviceSecret(), 'a'.repeat(64));
  assert.equal(localStorage.getItem('shin.deviceId'), 'old-phone-id');
});

test('migration: an existing localStorage id and secret move into the Keychain, and stay the same', async () => {
  const kc = keychain();
  const d = await fresh();
  const id = d.getDeviceId().id;
  const secret = d.getDeviceSecret();
  const r = await d.hydrateDeviceIdentity({ win: nativeWin(kc) });
  assert.equal(r.source, 'migrated');
  assert.equal(kc.store.get('shin.deviceId'), id);
  assert.equal(kc.store.get('shin.deviceSecret'), secret);
  assert.equal(d.getDeviceId().id, id);
});

test('a brand new phone: the id made on first run is also written to the Keychain', async () => {
  const kc = keychain();
  const d = await fresh();
  await d.hydrateDeviceIdentity({ win: nativeWin(kc) });
  const id = d.getDeviceId().id;
  assert.equal(kc.store.get('shin.deviceId'), id);
  assert.equal(kc.store.has('shin.deviceSecret'), true);
  assert.equal(kc.store.get('shin.deviceSecret'), d.getDeviceSecret());
});

test('the Keychain wins when both exist and differ (localStorage was recreated by a reinstall)', async () => {
  const kc = keychain({ 'shin.deviceId': 'keychain-id', 'shin.deviceSecret': 'b'.repeat(64) });
  const d = await fresh();
  d.getDeviceId();
  await d.hydrateDeviceIdentity({ win: nativeWin(kc) });
  assert.equal(d.getDeviceId().id, 'keychain-id');
  assert.equal(d.getDeviceSecret(), 'b'.repeat(64));
});

test('a failing Keychain falls back to localStorage and never throws', async () => {
  const d = await fresh();
  const id = d.getDeviceId().id;
  const r = await d.hydrateDeviceIdentity({ win: nativeWin(keychain({}, { fail: true })) });
  assert.equal(r.source, 'localStorage');
  assert.equal(d.getDeviceId().id, id);
});

test('a Keychain that never answers cannot hold the app: the wait is bounded', async () => {
  const d = await fresh();
  const id = d.getDeviceId().id;
  const t0 = Date.now();
  const r = await d.hydrateDeviceIdentity({ win: nativeWin(keychain({}, { hang: true })), timeoutMs: 50 });
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(r.source, 'localStorage');
  assert.equal(d.getDeviceId().id, id);
});

test('getDeviceId and getDeviceSecret stay synchronous', async () => {
  const d = await fresh();
  assert.equal(typeof d.getDeviceId().id, 'string');
  assert.equal(typeof d.getDeviceSecret(), 'string');
});

test('a wrapper built without the plugin behaves like the web', async () => {
  const d = await fresh();
  const id = d.getDeviceId().id;
  const win = { Capacitor: { getPlatform: () => 'ios', isPluginAvailable: () => false, registerPlugin: () => assert.fail('asked for a missing plugin') } };
  const r = await d.hydrateDeviceIdentity({ win });
  assert.equal(r.source, 'localStorage');
  assert.equal(d.getDeviceId().id, id);
});
