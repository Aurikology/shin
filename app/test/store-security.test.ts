/**
 * Jamin's App Store list, 2026-11-05, items 1 to 6: what a stranger could do to the live server with
 * the invite gate off. Each test is the attack, sent over HTTP against the real server.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-store-security-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_DATA_DIR = join(dir, 'data');
mkdirSync(join(dir, 'data'), { recursive: true });
process.env.SHIN_ACCESS_LOG = join(dir, 'data', 'access.log');
process.env.SHIN_SHUTTER_DIR = join(dir, 'data', 'shutter');
process.env.SHIN_PEOPLE_DB = join(dir, 'data', 'people.db');
process.env.SHIN_ADMIN_TOKEN = 'admin-token-for-tests';
process.env.PORT = '0';
process.env.SHIN_RATE_DOOR_IP_PER_10MIN = '5';
process.env.SHIN_FREE_SCANS_PER_IP_DAY = '2';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_INVITES;
delete process.env.SHIN_SHUTTER_LOG;
delete process.env.REVENUECAT_SECRET_KEY;
delete process.env.SHIN_PLUS_TRUST_CLIENT;
delete process.env.SHIN_FREE_SCANS_PER_WEEK;

const { server } = await import('../server.ts');
const { recordScan, getScan } = await import('../src/scans.ts');
const { outcomeFor, isPlus } = await import('../src/scan-quota.ts');
const { shutterLogOn, recordShutterRequest, SHUTTER_MAX_KEPT_BYTES } = await import('../src/shutter-log.ts');

let port = 0;
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => {
  delete process.env.SHIN_FREE_SCANS_PER_WEEK;
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked. */
  }
});

const base = () => `http://127.0.0.1:${port}`;
const phone = (id: string, key: string) => ({ 'x-shin-device': id, 'x-shin-device-key': key });
const OWNER = phone('owner-phone-001', 'owner-key-aaaaaaaaaaaaaaaa');
const OWNER_ID = 'owner-phone-001';
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base()}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

/** Binds the owner's secret, then makes the scan a stranger will try to change. */
async function ownersScan(): Promise<number> {
  await fetch(`${base()}/api/quota?deviceId=${OWNER_ID}`, { headers: OWNER });
  const id = recordScan({ deviceId: OWNER_ID, kind: 'barcode', query: '0123456789012', resolvedLabel: 'Oats', outcome: 'answered', source: 'catalogue' });
  assert.equal(typeof id, 'number');
  return id as number;
}

/* ------------------------------------------------------------------- item 1 */

test('item 1: with no RevenueCat key, x-shin-plus does not make anyone Plus', async () => {
  assert.equal(await isPlus('stranger', { 'x-shin-plus': '1' }, { }), false);
  assert.equal(await isPlus('stranger', { 'x-shin-plus': '1' }, { SHIN_PLUS_TRUST_CLIENT: '1' }), true, 'the named beta seam is gone');
});

/* ------------------------------------------------------------------- item 2 */

test('item 2: the shutter log is off unless it is switched on', () => {
  assert.equal(shutterLogOn({}), false);
  assert.equal(shutterLogOn({ SHIN_SHUTTER_LOG: 'off' }), false);
  assert.equal(shutterLogOn({ SHIN_SHUTTER_LOG: 'on' }), true);
});

test('item 2: a shutter header writes nothing with the log off, and a frame is refused', async () => {
  const press = randomUUID();
  await post('/api/consent', { deviceId: 'shutter-off-1', photos: false }, { 'x-shin-shutter': press });
  assert.equal(existsSync(join(dir, 'data', 'shutter', press)), false, 'the header still wrote to disk');
  const frame = await post('/api/shutter/frame', { id: press, frame: Buffer.from([0xff, 0xd8, 0xff, 1]).toString('base64') });
  assert.equal(frame.status, 404);
  assert.equal(existsSync(join(dir, 'data', 'shutter', press)), false, 'the frame was written');
});

test('item 2: with the log on, one request cannot make it keep more than the cap', async () => {
  const { EventEmitter } = await import('node:events');
  const press = randomUUID();
  const shutter = join(dir, 'capped');
  const env = { SHIN_SHUTTER_LOG: 'on', SHIN_SHUTTER_DIR: shutter };
  const req = Object.assign(new EventEmitter(), { headers: { 'x-shin-shutter': press }, method: 'POST', url: '/api/x' });
  const res = Object.assign(new EventEmitter(), { write: () => true, end: () => undefined, statusCode: 200 });
  recordShutterRequest(req as never, res as never, '/api/x', env);
  for (let i = 0; i < 6; i += 1) req.emit('data', Buffer.alloc(SHUTTER_MAX_KEPT_BYTES / 2, 97));
  res.emit('finish');
  const { readdirSync } = await import('node:fs');
  const [file] = readdirSync(join(shutter, press));
  const saved = readFileSync(join(shutter, press, file), 'utf8');
  assert.ok(saved.length < 4096, `kept ${saved.length} bytes`);
  assert.equal(JSON.parse(saved).sent.overCapBytes, SHUTTER_MAX_KEPT_BYTES * 3);
});

/* ------------------------------------------------------------------- item 3 */

test('item 3: a stranger cannot set the outcome of someone else\'s scan', async () => {
  const scan = await ownersScan();
  const named = await post(`/api/scan/${scan}/outcome`, { outcome: 'bought_here', deviceId: 'stranger-phone-1' });
  assert.equal(named.status, 403, 'another device id was accepted');
  const pretending = await post(`/api/scan/${scan}/outcome`, { outcome: 'bought_here', deviceId: OWNER_ID });
  assert.equal(pretending.status, 403, 'the owner\'s id with no secret was accepted');
  const none = await post(`/api/scan/${scan}/outcome`, { outcome: 'bought_here' });
  assert.equal(none.status, 403, 'no device at all was accepted');
  assert.equal(outcomeFor(scan), null, 'an outcome was written');
  const own = await post(`/api/scan/${scan}/outcome`, { outcome: 'not_bought', deviceId: OWNER_ID }, OWNER);
  assert.equal(own.status, 200);
  assert.equal(outcomeFor(scan)?.outcome, 'not_bought');
});

test('item 3: a stranger cannot overwrite the price on someone else\'s scan', async () => {
  const scan = await ownersScan();
  const asThemselves = await post('/api/correction', { clientId: randomUUID(), deviceId: 'stranger-phone-2', scanId: scan, priceCents: 1 });
  assert.equal(asThemselves.status, 403, 'a correction was accepted from another device');
  const asOwner = await post('/api/correction', { clientId: randomUUID(), deviceId: OWNER_ID, scanId: scan, priceCents: 1 });
  assert.equal(asOwner.status, 403, 'the owner\'s id with no secret was accepted');
  assert.equal(getScan(scan)?.typed_price_cents ?? null, null, 'the price was written');
});

/* ------------------------------------------------------------------- item 5 */

test('item 5: /api/identify refuses a bound device named without its secret', async () => {
  await fetch(`${base()}/api/quota?deviceId=${OWNER_ID}`, { headers: OWNER });
  const r = await fetch(`${base()}/api/identify?text=oats&deviceId=${OWNER_ID}`);
  assert.equal(r.status, 403);
});

test('item 5: a listed developer id with no bound secret is no developer', async () => {
  process.env.SHIN_DEVELOPER_DEVICES = 'dev-listed-001';
  try {
    const frame = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64');
    const r = await post('/api/identify/pack', { deviceId: 'dev-listed-001', gtin: '0123456789012', frame });
    assert.equal(r.status, 403);
    assert.equal(((await r.json()) as { failure: string }).failure, 'pack_read_developer_only');
  } finally {
    delete process.env.SHIN_DEVELOPER_DEVICES;
  }
});

/* ------------------------------------------------------------------- item 6 */

test('item 6: pages carry a content security policy that allows no inline script', async () => {
  const csp = (await fetch(`${base()}/`)).headers.get('content-security-policy') ?? '';
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.doesNotMatch(csp.match(/script-src[^;]*/)?.[0] ?? '', /unsafe-inline|'unsafe-eval'/);
  assert.match(csp, /frame-ancestors 'none'/);
});

test('item 6: a source map in the public folder is not served', async () => {
  const { fileURLToPath } = await import('node:url');
  const map = fileURLToPath(new URL('../public/js/store-security-test.js.map', import.meta.url));
  writeFileSync(map, '{}');
  try {
    assert.equal((await fetch(`${base()}/js/store-security-test.js.map`)).status, 404);
  } finally {
    rmSync(map, { force: true });
  }
});

test('item 6: the refusal sheet escapes the category labels and the engine\'s explanation', () => {
  const source = readFileSync(new URL('../public/js/screens/camera.js', import.meta.url), 'utf8');
  assert.ok(source.includes('<li>${escapeHtml(c)}</li>'));
  assert.ok(source.includes('<p class="detail">${escapeHtml(categoryWhy)}</p>'));
});

/* ------------------------------------------------------------------- item 4 */

test('item 4: free barcode scans are capped per address, and a new device id does not reset it', async () => {
  process.env.SHIN_FREE_SCANS_PER_WEEK = '10';
  try {
    const ip = { 'cf-connecting-ip': '203.0.113.50' };
    const scan = (n: number) => fetch(`${base()}/api/identify?gtin=0064100238022&deviceId=fresh-id-${n}&countryCode=CA`, { headers: ip });
    assert.notEqual((await scan(1)).status, 429);
    assert.notEqual((await scan(2)).status, 429);
    assert.equal((await scan(3)).status, 429, 'a third new id got a third free scan from one address');
    const elsewhere = await fetch(`${base()}/api/identify?gtin=0064100238022&deviceId=fresh-id-4&countryCode=CA`, { headers: { 'cf-connecting-ip': '203.0.113.51' } });
    assert.notEqual(elsewhere.status, 429, 'another address was caught by the cap');
  } finally {
    delete process.env.SHIN_FREE_SCANS_PER_WEEK;
  }
});

test('item 4: one address flooding the door is refused before anything is logged, and others are not', async () => {
  const flood = { 'cf-connecting-ip': '203.0.113.99' };
  const statuses: number[] = [];
  for (let i = 0; i < 7; i += 1) statuses.push((await fetch(`${base()}/api/categories`, { headers: flood })).status);
  assert.deepEqual(statuses.slice(0, 5).every((s) => s !== 429), true, statuses.join(','));
  assert.equal(statuses[6], 429, statuses.join(','));
  assert.notEqual((await fetch(`${base()}/api/categories`, { headers: { 'cf-connecting-ip': '203.0.113.98' } })).status, 429);
  assert.notEqual((await fetch(`${base()}/api/categories`)).status, 429, 'a local request was limited');
});
