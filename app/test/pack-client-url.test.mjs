/**
 * The phone's pack loader builds the cacheable address (`/api/pack/<scope>-<version>.bin`) when it
 * knows the version, and the old address when it does not, so a phone with new code still works
 * against an older server and a phone with old code still works against this one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });
const { packUrl, checkForUpdate } = await import('../public/js/pack.js');

test('a known version is fetched from the .bin address Cloudflare keeps', () => {
  assert.equal(packUrl('canada', '1763000000000-44143820', ''), '/api/pack/canada-1763000000000-44143820.bin');
  assert.equal(packUrl('grocery', '5-6', 'https://relay.example'), 'https://relay.example/api/pack/grocery-5-6.bin');
});

test('no version, or one that is not the server\'s shape, falls back to the old address', () => {
  assert.equal(packUrl('canada', null, ''), '/api/pack?scope=canada');
  assert.equal(packUrl('canada', 'weird/../version', ''), '/api/pack?scope=canada');
});

test('the version check hands back where to download from, new server or old', async () => {
  globalThis.indexedDB = undefined;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ scope: 'canada', version: '10-20', bytes: 20, url: '/api/pack/canada-10-20.bin' }) });
  const fresh = await checkForUpdate('canada', '/api/pack-version?scope=canada');
  assert.equal(fresh.remoteUrl, '/api/pack/canada-10-20.bin');
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ scope: 'canada', version: '10-20', bytes: 20 }) });
  const older = await checkForUpdate('canada', '/api/pack-version?scope=canada');
  assert.equal(older.remoteUrl, '/api/pack?scope=canada');
});
