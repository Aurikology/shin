/**
 * Requests about a device answer only for that device, and a refused request
 * writes nothing. D-145, D-148 (server half), D-155 to D-159, D-161.
 *
 * Over a real socket, for the reason `server-beta-routes.test.ts` gives: each
 * case is about the HTTP edge (which header was checked, before what).
 *
 * Every refusal below is paired with the same request made by the device
 * itself, which must still be answered, so a route that refused everybody
 * would fail here rather than pass.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-device-bound-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_DATA_DIR = join(dir, 'data');
// The folder exists, so a missing access log means nothing was written, not that the write failed.
mkdirSync(join(dir, 'data'), { recursive: true });
process.env.SHIN_ACCESS_LOG = join(dir, 'data', 'access.log');
process.env.SHIN_SHUTTER_DIR = join(dir, 'data', 'shutter');
process.env.SHIN_PEOPLE_DB = join(dir, 'data', 'people.db');
process.env.SHIN_ADMIN_TOKEN = 'admin-token-for-tests';
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_INVITES;
delete process.env.SHIN_SHUTTER_LOG;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

const { server } = await import('../server.ts');
const { recordScan } = await import('../src/scans.ts');
const { ratingFor } = await import('../src/ratings.ts');
const { readConsent } = await import('../src/consent.ts');

let port = 0;
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => {
  delete process.env.SHIN_INVITE_CODE;
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked. */
  }
});

const base = () => `http://127.0.0.1:${port}`;

/** A phone: its id and its secret, sent the way api.js sends them. */
function phone(id: string, key: string | null) {
  const h: Record<string, string> = { 'x-shin-device': id };
  if (key) h['x-shin-device-key'] = key;
  return h;
}
const A = phone('dev-aaaaaaaa-1', 'key-aaaaaaaaaaaaaaaaaaaa');
const B = phone('dev-bbbbbbbb-1', 'key-bbbbbbbbbbbbbbbbbbbb');
const A_ID = 'dev-aaaaaaaa-1';

const get = (path: string, headers: Record<string, string> = {}) => fetch(`${base()}${path}`, { headers });
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
const settle = () => new Promise((r) => setTimeout(r, 150));

/* ------------------------------------------------------------- D-161 --- */

test('a request refused at the invite gate writes nothing to disk', async () => {
  process.env.SHIN_INVITE_CODE = 'letmein-test';
  try {
    const press = '11111111-2222-4333-8444-555555555555';
    const refused = await post('/api/consent', { deviceId: 'nobody-123', photos: true }, { 'x-shin-shutter': press });
    assert.equal(refused.status, 401);
    await settle();
    assert.equal(existsSync(join(dir, 'data', 'access.log')), false, 'the refusal was written to the access log');
    assert.equal(existsSync(join(dir, 'data', 'shutter', press)), false, 'the refusal created a shutter folder');

    // Control: the same request with the invite is logged, so the check above can see a write.
    const allowed = await post(
      '/api/event',
      { deviceId: 'nobody-123', type: 'x' },
      { 'x-shin-shutter': press, 'x-shin-invite': 'letmein-test' },
    );
    assert.equal(allowed.status, 200);
    await settle();
    assert.ok(existsSync(join(dir, 'data', 'shutter', press)), 'an invited request was not logged either');
    assert.ok(existsSync(join(dir, 'data', 'access.log')), 'an invited request was not in the access log');
  } finally {
    delete process.env.SHIN_INVITE_CODE;
  }
});

/* --------------------------------------------------- binding the secret --- */

test('the device itself binds on first sight and is answered after', async () => {
  const w = await post('/api/consent', { deviceId: A_ID, photos: false, location: false }, A);
  assert.equal(w.status, 200);
  assert.deepEqual(await w.json(), { stored: true });
  const r = await get(`/api/consent?deviceId=${A_ID}`, A);
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as { photos: boolean }).photos, false);
});

test('D-155: another device cannot write this device\'s consent, with or without a secret', async () => {
  await post('/api/consent', { deviceId: A_ID, photos: false, location: false }, A);
  const forged = await post('/api/consent', { deviceId: A_ID, photos: true, location: true }, B);
  assert.equal(forged.status, 403);
  const bare = await post('/api/consent', { deviceId: A_ID, photos: true, location: true });
  assert.equal(bare.status, 403, 'leaving the secret off got round the check');
  assert.equal(readConsent(A_ID).photos, false, 'the forged write landed');
});

test('D-156 and D-145: consent, scans and quota answer only the device itself', async () => {
  await post('/api/consent', { deviceId: A_ID, photos: false, location: false }, A);
  for (const path of [`/api/consent?deviceId=${A_ID}`, `/api/scans?deviceId=${A_ID}`, `/api/quota?deviceId=${A_ID}`]) {
    assert.equal((await get(path, B)).status, 403, `${path} answered another device`);
    assert.equal((await get(path)).status, 403, `${path} answered a request with no secret`);
    assert.equal((await get(path, A)).status, 200, `${path} refused the device itself`);
  }
  // The header alone, as quota also reads it, is held to the same secret.
  assert.equal((await get('/api/quota', { 'x-shin-device': A_ID })).status, 403);
});

test('D-157: the scan log with no device gives no fleet figures, except to the admin token', async () => {
  const open = await get('/api/scans');
  assert.equal(open.status, 400, 'fleet-wide figures went to a caller with no device');
  const admin = await get('/api/scans', { 'x-shin-admin': 'admin-token-for-tests' });
  assert.equal(admin.status, 200);
  assert.ok('namedRate' in ((await admin.json()) as object));
  assert.equal((await get('/api/scans', { 'x-shin-admin': 'wrong' })).status, 400);
});

test('D14: a device asking for its own scans gets only its own figures, never the fleet\'s', async () => {
  await post('/api/consent', { deviceId: A_ID, photos: false, location: false }, A);
  const own = (await (await get(`/api/scans?deviceId=${A_ID}`, A)).json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(own).sort(), ['rated', 'thisDevice']);
  const mine = own.thisDevice as { deviceId: string; scansThisWeek: number; named: number };
  assert.equal(mine.deviceId, A_ID);
  assert.equal(typeof mine.scansThisWeek, 'number');
  for (const fleet of ['namedRate', 'total', 'byKind', 'thisWeek', 'scans', 'weekly']) {
    assert.ok(!(fleet in own), `${fleet} (a fleet figure) rode in a device's reply`);
  }
});

test('D-158: events are stored only for the device that sent them', async () => {
  await post('/api/consent', { deviceId: A_ID, photos: false, location: false }, A);
  assert.equal((await post('/api/event', { deviceId: A_ID, type: 'forged' }, B)).status, 403);
  const batch = await post(
    '/api/events/batch',
    { events: [{ deviceId: A_ID, type: 'forged' }, { deviceId: 'dev-bbbbbbbb-1', type: 'own' }] },
    B,
  );
  assert.equal(batch.status, 200);
  assert.deepEqual(await batch.json(), { stored: 1, dropped: 1, received: 2 });
  assert.deepEqual(await (await post('/api/event', { deviceId: A_ID, type: 'own' }, A)).json(), { stored: true });
});

test('D-159: one device cannot rate or un-rate another device\'s scan', async () => {
  await post('/api/consent', { deviceId: A_ID, photos: false, location: false }, A);
  await post('/api/consent', { deviceId: 'dev-bbbbbbbb-1', photos: false, location: false }, B);
  const scanId = recordScan({ deviceId: A_ID, kind: 'text', query: 'milk', outcome: 'answered' })!;
  assert.ok(scanId);
  const own = await post('/api/scan-rating', { deviceId: A_ID, scanId, rating: 'up' }, A);
  assert.equal(own.status, 200);
  // B naming itself, on A's scan.
  const asSelf = await post('/api/scan-rating', { deviceId: 'dev-bbbbbbbb-1', scanId, rating: 'down' }, B);
  assert.equal(asSelf.status, 403, 'a device rated a scan that was not its own');
  // B naming A.
  assert.equal((await post('/api/scan-rating', { deviceId: A_ID, scanId, rating: 'down' }, B)).status, 403);
  assert.equal((await post('/api/scan-rating/delete', { deviceId: 'dev-bbbbbbbb-1', scanId }, B)).status, 403);
  assert.equal((await post('/api/scan-rating/delete', { deviceId: A_ID, scanId }, B)).status, 403);
  assert.equal(ratingFor(scanId)?.rating, 'up', 'the rating was changed or removed by another device');
  assert.equal((await post('/api/scan-rating/delete', { deviceId: A_ID, scanId }, A)).status, 200);
  assert.equal(ratingFor(scanId), null);
});

test('a phone from before the secret keeps working until it sends one', async () => {
  const legacy = 'legacy-device-000';
  const w = await post('/api/consent', { deviceId: legacy, photos: false, location: false }, { 'x-shin-device': legacy });
  assert.deepEqual(await w.json(), { stored: true });
  assert.equal((await get(`/api/consent?deviceId=${legacy}`)).status, 200);
  // Its first request with a secret binds it; after that the secret is required.
  const k = phone(legacy, 'legacy-key-000000000000');
  assert.equal((await get(`/api/consent?deviceId=${legacy}`, k)).status, 200);
  assert.equal((await get(`/api/consent?deviceId=${legacy}`)).status, 403);
  assert.equal((await get(`/api/consent?deviceId=${legacy}`, k)).status, 200);
});

/* ------------------------------------------------------------- D-148 --- */

test('D-148: a device that never answered reads photo consent off', async () => {
  const r = await get('/api/consent?deviceId=never-answered-1', phone('never-answered-1', 'never-key-0000000000'));
  assert.deepEqual(await r.json(), { photos: false, location: false, updatedAt: null });
});

test('D-148: the shelf route keeps nothing while photo identification is off, consent or not', async () => {
  const C = phone('dev-cccccccc-1', 'key-cccccccccccccccccccc');
  await post('/api/consent', { deviceId: 'dev-cccccccc-1', photos: true, location: false }, C);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
  const res = await post('/api/shelf/frame', { deviceId: 'dev-cccccccc-1', frame: jpeg.toString('base64') }, C);
  assert.equal(res.status, 403, 'a shelf frame was accepted with photo identification off');
  assert.equal(existsSync(join(dir, 'photos', 'shelf')), false);
  // And never for somebody else's device.
  const forged = await post('/api/shelf/frame', { deviceId: 'dev-cccccccc-1', frame: jpeg.toString('base64') }, B);
  assert.equal(forged.status, 403);
  assert.equal(existsSync(join(dir, 'photos', 'shelf')) ? readdirSync(join(dir, 'photos', 'shelf')).length : 0, 0);
});
