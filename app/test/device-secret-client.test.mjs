/**
 * The phone half of the device secret (D-145, D-155 to D-159): device.js
 * makes a random secret beside the id and keeps it, and api.js sends it on
 * every request so the server can tell the device from someone naming it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });

const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return { ok: true, status: 200, json: async () => ({ stored: true }) };
};

const device = await import('../public/js/device.js');
const api = await import('../public/js/api.js');

test('the phone makes one secret, keeps it, and it is not the id', () => {
  assert.equal(typeof device.getDeviceSecret, 'function', 'device.js has no secret');
  const a = device.getDeviceSecret();
  const b = device.getDeviceSecret();
  assert.equal(a, b, 'the secret changed between calls');
  assert.match(a, /^[A-Za-z0-9_-]{16,128}$/, 'the secret is not a shape the server accepts');
  assert.notEqual(a, device.getDeviceId().id);
});

test('every request carries the secret beside the device id', async () => {
  calls.length = 0;
  await api.postEvent({ deviceId: device.getDeviceId().id, type: 'x' });
  await api.getConsent(device.getDeviceId().id);
  assert.ok(calls.length >= 2);
  for (const c of calls) {
    const h = c.init.headers ?? {};
    assert.equal(h['x-shin-device'], device.getDeviceId().id, `${c.url} carried no device id`);
    assert.equal(h['x-shin-device-key'], device.getDeviceSecret(), `${c.url} carried no secret`);
  }
});
