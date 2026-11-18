/**
 * R13 and R14 (docs/readiness/REGISTER.md): the server tells the app the oldest build it still
 * supports and an optional list of features to switch off, from two settings (settings/src/index.ts),
 * so a bad build or a retired route can be dealt with without waiting for Apple.
 *
 * Two layers: the pure reading of the settings, and the route over a real socket. The route is
 * exempt from the invite check on purpose: the day an invite is rotated is the day old builds most
 * need to be told to update, and a status page that needs the secret cannot say so.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-app-status-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
process.env.SHIN_INVITE_CODE = 'a-secret-invite';

const { readAppStatus } = await import('../src/app-status.ts');
const { server } = await import('../server.ts');
const { SETTINGS } = await import('../../settings/src/index.ts');

let port = 0;
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => {
  delete process.env.SHIN_APP_MIN_VERSION;
  delete process.env.SHIN_APP_FEATURES_OFF;
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

test('both settings are registered in the one settings table', () => {
  const names = SETTINGS.map((s) => s.env);
  assert.ok(names.includes('SHIN_APP_MIN_VERSION'));
  assert.ok(names.includes('SHIN_APP_FEATURES_OFF'));
});

test('nothing set: no minimum and nothing switched off', () => {
  assert.deepEqual(readAppStatus({}), { minVersion: null, featuresOff: [] });
});

test('a minimum build and a feature list are read, trimmed and lower-cased', () => {
  const s = readAppStatus({ SHIN_APP_MIN_VERSION: ' 2026-11-18.2 ', SHIN_APP_FEATURES_OFF: 'Watchlist, share ,,pack' });
  assert.deepEqual(s, { minVersion: '2026-11-18.2', featuresOff: ['watchlist', 'share', 'pack'] });
});

test('a mistyped minimum is ignored rather than locking every phone out', () => {
  for (const bad of ['9', 'latest', '2026-11-18', '2026-11-18.x', '99999', '']) {
    assert.equal(readAppStatus({ SHIN_APP_MIN_VERSION: bad }).minVersion, null, bad);
  }
});

test('feature names that are not plain words are dropped', () => {
  const s = readAppStatus({ SHIN_APP_FEATURES_OFF: 'share, <script>, a b, ok_name, x'.concat(',', 'y'.repeat(60)) });
  assert.deepEqual(s.featuresOff, ['share', 'ok_name', 'x']);
});

test('GET /api/app-status answers JSON with no invite header at all', async () => {
  process.env.SHIN_APP_MIN_VERSION = '2026-11-18.1';
  process.env.SHIN_APP_FEATURES_OFF = 'watchlist';
  const res = await fetch(`http://127.0.0.1:${port}/api/app-status`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /application\/json/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { minVersion: '2026-11-18.1', featuresOff: ['watchlist'] });
});

test('the setting is read on every request, so changing it needs no restart of the settings reader', async () => {
  process.env.SHIN_APP_MIN_VERSION = '2026-11-19.1';
  process.env.SHIN_APP_FEATURES_OFF = '';
  const body = (await (await fetch(`http://127.0.0.1:${port}/api/app-status`)).json()) as { minVersion: string; featuresOff: string[] };
  assert.equal(body.minVersion, '2026-11-19.1');
  assert.deepEqual(body.featuresOff, []);
});

test('another route still wants the invite (the exemption is one path, not the door)', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/api/scans`);
  assert.equal(res.status, 401);
});
