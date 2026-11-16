/**
 * Route-by-route attack tests, V3 of the 2026-11-16 vulnerability check
 * (docs/security-check/v3-route-access.md has the access table these walk).
 *
 * ONE TEST PER ATTACK, AND EACH ASSERTS THE SAFE BEHAVIOUR. A failing test here is a real hole,
 * not a bug in the test; the report says which and what it costs. Nothing is fixed in this file.
 *
 * Every request goes to a server started inside this test process on a port the OS picked, over
 * temp databases and a fake Claude (security-harness.mjs). Nothing reaches the production server.
 *
 * The 2026-11-06 fixes in store-security.test.ts are not repeated: x-shin-plus without a RevenueCat
 * key, the shutter log cap, outcome and correction on another's bound scan, a bound device named
 * without its secret on /api/identify, a listed developer id with no secret on the pack route, the
 * CSP and source maps, the per-address free-scan cap, and the door flood.
 *
 * Covers: (a) device A against device B, (c) every admin route and the pack read with no, wrong,
 * empty and misplaced tokens, (e) consent, (h) uploads, (i) oversized bodies on every POST route.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boot } from './security-harness.mjs';

const TOKEN = 'adm-7f3a9c21b8e44d05a6c1e9f0';
const DEV = 'dev-listed-0001';
const h = await boot({
  products: 5,
  consent: true,
  env: { SHIN_ADMIN_TOKEN: TOKEN, SHIN_DEVELOPER_DEVICES: DEV, SHIN_SHUTTER_LOG: 'on' },
});
after(() => h.close());

const KEY_A = 'keyAAAAAAAAAAAAAAAAAAAA';
const KEY_B = 'keyBBBBBBBBBBBBBBBBBBBB';
const A = 'device-aaaa-0001';
const B = 'device-bbbb-0002';
const phoneA = h.phone(A, KEY_A);
const phoneB = h.phone(B, KEY_B);
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const rows = (sql, ...args) => {
  const db = new DatabaseSync(process.env.SHIN_SCANS, { readOnly: true });
  try {
    return db.prepare(sql).all(...args);
  } finally {
    db.close();
  }
};
const scanOf = (id) => rows('SELECT * FROM scan WHERE id = ?', id)[0];
const scanBody = async (device, headers, i = 0) => {
  const r = await h.get(`/api/identify?gtin=${h.codes[i]}&countryCode=CA&region=Ontario&deviceId=${device}`, headers);
  assert.equal(r.status, 200);
  return (await r.json()).scanId;
};
const bind = async (device, headers) => assert.equal((await h.get(`/api/quota?deviceId=${device}`, headers)).status, 200);

let bScan;
before(async () => {
  await bind(A, phoneA);
  await bind(B, phoneB);
  bScan = await scanBody(B, phoneB, 1);
  // B's own data: a thumbs-up, a typed price, a pick, photo consent off.
  assert.equal((await h.post('/api/scan-rating', { deviceId: B, scanId: bScan, rating: 'up' }, phoneB)).status, 200);
  const priced = await h.post('/api/scan-price', { deviceId: B, scanId: bScan, priceCents: 111 }, phoneB);
  assert.equal((await priced.json()).stored, true, 'set-up: B could not store its own typed price');
  assert.equal(scanOf(bScan).typed_price_cents, 111);
});

/* ------------------------------------------------------------------ (a) device A against device B */

test('a1: A cannot read B scan summary, with or without A key', async () => {
  for (const headers of [phoneA, {}, h.phone(B, KEY_A)]) {
    const r = await h.get(`/api/scans?deviceId=${B}`, headers);
    assert.equal(r.status, 403, `read of B answered ${r.status} with ${JSON.stringify(Object.keys(headers))}`);
  }
});

test('a2: the all-devices scan summary needs the admin token, a named device does not unlock it', async () => {
  for (const headers of [{}, phoneA, { 'x-shin-admin': 'nope' }]) {
    const r = await h.get('/api/scans', headers);
    assert.equal(r.status, 400, `global summary answered ${r.status}`);
  }
});

test('a3: A cannot rate B scan', async () => {
  const before = rows('SELECT COUNT(*) AS n FROM scan_rating WHERE scan_id = ?', bScan)[0].n;
  const r = await h.post('/api/scan-rating', { deviceId: A, scanId: bScan, rating: 'down' }, phoneA);
  assert.equal(r.status, 403);
  assert.equal(rows('SELECT rating FROM scan_rating WHERE scan_id = ?', bScan)[0].rating, 'up');
  assert.equal(rows('SELECT COUNT(*) AS n FROM scan_rating WHERE scan_id = ?', bScan)[0].n, before);
});

test('a4: A cannot delete B rating', async () => {
  const r = await h.post('/api/scan-rating/delete', { deviceId: A, scanId: bScan }, phoneA);
  assert.equal(r.status, 403);
  assert.equal(rows('SELECT COUNT(*) AS n FROM scan_rating WHERE scan_id = ?', bScan)[0].n, 1, "B's rating is gone");
});

test('a5: A cannot overwrite the typed price on B scan, by any of the three routes that write one', async () => {
  await h.post('/api/scan-price', { deviceId: A, scanId: bScan, priceCents: 999, storeName: 'Evil Mart', code: h.codes[1] }, phoneA);
  await h.post('/api/correction', { clientId: 'evil-1', deviceId: A, scanId: bScan, priceCents: 999 }, phoneA);
  await h.post('/api/correction', { clientId: 'evil-2', deviceId: A, scanId: bScan, code: h.codes[3], priceCents: 999, storeName: 'Evil Mart' }, phoneA);
  const s = scanOf(bScan);
  assert.equal(s.typed_price_cents, 111, 'B typed price was changed by A');
  assert.equal(s.outcome, 'answered');
  assert.equal(s.corrected_code, null, 'B scan was re-pointed at another product by A');
});

test('a6: A cannot record a pick or a call on B scan', async () => {
  await h.post('/api/scan-pick', { deviceId: A, scanId: bScan, code: h.codes[4], source: 'candidate' }, phoneA);
  await h.post('/api/scan-call', { deviceId: A, scanId: bScan, call: 'buy', beforeVerdict: false }, phoneA);
  assert.equal(rows('SELECT COUNT(*) AS n FROM scan_pick WHERE scan_id = ?', bScan)[0].n, 0, 'a pick landed on B scan');
  assert.equal(scanOf(bScan).shopper_call ?? null, null, 'a call landed on B scan');
});

test('a7: naming B with A key is refused on every device route', async () => {
  const wrong = h.phone(B, KEY_A);
  const posts = [
    ['/api/scan-rating', { deviceId: B, scanId: bScan, rating: 'down' }],
    ['/api/scan-rating/delete', { deviceId: B, scanId: bScan }],
    ['/api/scan-price', { deviceId: B, scanId: bScan, priceCents: 999 }],
    ['/api/scan-pick', { deviceId: B, scanId: bScan, code: h.codes[4], source: 'candidate' }],
    ['/api/scan-call', { deviceId: B, scanId: bScan, call: 'buy' }],
    ['/api/correction', { clientId: 'evil-3', deviceId: B, scanId: bScan, priceCents: 999 }],
    ['/api/consent', { deviceId: B, photos: true, location: true }],
    ['/api/event', { deviceId: B, type: 'x', payload: {} }],
    [`/api/scan/${bScan}/outcome`, { deviceId: B, outcome: 'not_bought' }],
  ];
  for (const [path, body] of posts) {
    const r = await h.post(path, body, wrong);
    assert.equal(r.status, 403, `${path} answered ${r.status} to a wrong key`);
  }
  for (const path of [`/api/consent?deviceId=${B}`, `/api/quota?deviceId=${B}`, `/api/scans?deviceId=${B}`]) {
    const r = await h.get(path, wrong);
    assert.equal(r.status, 403, `${path} answered ${r.status} to a wrong key`);
  }
});

test('a8: A cannot switch on B photo consent (which would make the server keep B photos)', async () => {
  await h.post('/api/consent', { deviceId: B, photos: true, location: true }, phoneA);
  const r = await h.get(`/api/consent?deviceId=${B}`, phoneB);
  const c = await r.json();
  assert.equal(c.photos ?? false, false);
  assert.equal(c.location ?? false, false);
});

test('a9: the batch event door drops events written in B name by A', async () => {
  const r = await h.post('/api/events/batch', { events: [{ deviceId: B, type: 'forged', payload: { x: 1 } }] }, phoneA);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).stored, 0);
  assert.equal(rows("SELECT COUNT(*) AS n FROM event WHERE device_id = ? AND type = 'forged'", B)[0].n, 0);
});

test('a10: a missing scan and someone else scan answer the same, so scan ids cannot be probed', async () => {
  const missing = await h.post('/api/scan/999999/outcome', { deviceId: A, outcome: 'not_bought' }, phoneA);
  const theirs = await h.post(`/api/scan/${bScan}/outcome`, { deviceId: A, outcome: 'not_bought' }, phoneA);
  assert.equal(theirs.status, missing.status, `404 for a missing scan but ${theirs.status} for B scan tells A which scan ids exist`);
});

test('a11: the demo route does not write scan rows into a bound device by name alone', async () => {
  const before = rows('SELECT COUNT(*) AS n FROM scan WHERE device_id = ?', B)[0].n;
  const r = await h.post('/api/identify/demo', { deviceId: B }, {});
  const after_ = rows('SELECT COUNT(*) AS n FROM scan WHERE device_id = ?', B)[0].n;
  assert.ok(r.status === 403 || after_ === before, `demo wrote ${after_ - before} scan row(s) into B with no key`);
});

test('a12: a device id nobody has bound yet is not open to whoever names it (the legacy window)', async () => {
  const legacy = 'legacy-unbound-0003';
  const first = await h.get(`/api/identify?gtin=${h.codes[2]}&countryCode=CA&region=Ontario&deviceId=${legacy}`);
  assert.equal(first.status, 200);
  const stranger = await h.get(`/api/scans?deviceId=${legacy}`, h.phone('stranger-9999999', 'keySSSSSSSSSSSSSSSSSSSS'));
  assert.equal(stranger.status, 403, 'any caller can read an unbound device by naming it');
});

/* ------------------------------------------------------------------ (c) admin and the pack read */

const ADMIN_GETS = ['/api/admin/tables', '/api/admin/people', '/api/admin/access', '/api/admin/shutter', '/api/admin/file?path=access.log'];
const refusedAsAdmin = async (variant, mutate = (p) => p) => {
  for (const path of ADMIN_GETS) {
    const r = await h.get(mutate(path), variant);
    assert.ok([401, 403, 404].includes(r.status), `${path} answered ${r.status} to ${JSON.stringify(variant)}`);
    const text = await r.text();
    assert.ok(!/device_id|key_hash|scanned_at/.test(text), `${path} leaked rows`);
  }
  const sql = await h.postRaw('/api/admin/sql', 'SELECT * FROM device_key', variant);
  assert.ok([401, 403, 404].includes(sql.status), `/api/admin/sql answered ${sql.status} to ${JSON.stringify(variant)}`);
};

test('c0: control, the right token does open the admin routes (so the refusals below mean something)', async () => {
  const r = await h.get('/api/admin/tables', { 'x-shin-admin': TOKEN });
  assert.equal(r.status, 200);
  const q = await h.postRaw('/api/admin/sql', 'SELECT COUNT(*) AS n FROM scan', { 'x-shin-admin': TOKEN });
  assert.equal(q.status, 200);
});

test('c1: no token, a wrong token and an empty token are refused on every admin route', async () => {
  await refusedAsAdmin({});
  await refusedAsAdmin({ 'x-shin-admin': 'wrong-token' });
  await refusedAsAdmin({ 'x-shin-admin': '' });
  await refusedAsAdmin({ 'x-shin-admin': ' ' });
});

test('c2: a near-miss token is refused (prefix, suffix, case, null-ish strings)', async () => {
  for (const t of [TOKEN.slice(0, -1), `${TOKEN}x`, TOKEN.toUpperCase(), 'undefined', 'null', 'true', '*']) {
    await refusedAsAdmin({ 'x-shin-admin': t });
  }
});

test('c3: the right token in the wrong header or in the URL is refused', async () => {
  await refusedAsAdmin({ authorization: `Bearer ${TOKEN}` });
  await refusedAsAdmin({ 'x-admin-token': TOKEN });
  await refusedAsAdmin({ 'x-shin-admin-token': TOKEN });
  await refusedAsAdmin({ 'x-shin-device-key': TOKEN });
  await refusedAsAdmin({ cookie: `x-shin-admin=${TOKEN}` });
  await refusedAsAdmin({}, (p) => `${p}${p.includes('?') ? '&' : '?'}token=${TOKEN}&admin=${TOKEN}&x-shin-admin=${TOKEN}`);
});

test('c4: the admin SQL door cannot write, attach or load code, even with the right token', async () => {
  const before = rows('SELECT COUNT(*) AS n FROM scan')[0].n;
  const evil = join(mkdtempSync(join(tmpdir(), 'shin-sec-attach-')), 'evil.db');
  for (const sql of [
    "INSERT INTO scan (device_id, kind, outcome, scanned_at) VALUES ('x','text','answered','2026-01-01')",
    'DELETE FROM scan',
    'DROP TABLE scan',
    "UPDATE scan SET device_id = 'x'",
    `ATTACH DATABASE '${evil.replace(/\\/g, '/')}' AS e`,
    "SELECT load_extension('x')",
  ]) {
    const r = await h.postRaw('/api/admin/sql', sql, { 'x-shin-admin': TOKEN });
    assert.notEqual(r.status, 200, `SQL was accepted: ${sql}`);
  }
  assert.equal(rows('SELECT COUNT(*) AS n FROM scan')[0].n, before);
  assert.equal(existsSync(evil), false, 'ATTACH created a file');
});

test('c5: the admin file route stays inside the data folder', async () => {
  for (const p of ['../scans.db', '..%2Fscans.db', '../../../../Windows/win.ini', 'C:/Windows/win.ini', '/etc/passwd', '....//scans.db', '%2e%2e/scans.db']) {
    const r = await h.get(`/api/admin/file?path=${p}`, { 'x-shin-admin': TOKEN });
    assert.ok([400, 404].includes(r.status), `${p} answered ${r.status}`);
  }
});

test('c6: failed admin guesses from one address are slowed after a handful, not after a thousand', async () => {
  const tunnel = { 'cf-connecting-ip': '203.0.113.50' };
  let refused = -1;
  for (let i = 0; i < 60; i += 1) {
    const r = await h.get('/api/admin/tables', { ...tunnel, 'x-shin-admin': `guess-${i}` });
    if (r.status === 429) {
      refused = i;
      break;
    }
  }
  assert.ok(refused >= 0 && refused <= 30, `60 wrong admin tokens from one address were all answered (first 429 at ${refused})`);
});

const packBody = (extra = {}) => ({ frame: PNG, deviceId: DEV, countryCode: 'CA', region: 'Ontario', ...extra });
const packAs = (headers, body = packBody()) => h.post('/api/identify/pack', body, { 'x-shin-claude': '1', ...headers });

test('c7: control, the admin token and a proven developer device do read a frame', async () => {
  const before = h.claude.frames;
  await bind(DEV, h.phone(DEV, 'keyDEVDEVDEVDEVDEVDEV'));
  const dev = await packAs(h.phone(DEV, 'keyDEVDEVDEVDEVDEVDEV'));
  assert.equal(dev.status, 200);
  const adm = await packAs({ 'x-shin-admin': TOKEN }, packBody({ deviceId: 'device-cccc-0004' }));
  assert.equal(adm.status, 200);
  assert.equal(h.claude.frames, before + 2);
});

test('c8: the pack read sends no frame to Claude for no token, a wrong token, an empty token or a misplaced one', async () => {
  const before = h.claude.frames;
  const attacker = 'device-dddd-0005';
  const key = h.phone(attacker, 'keyATKATKATKATKATKATK');
  const variants = [
    key,
    { ...key, 'x-shin-admin': 'wrong' },
    { ...key, 'x-shin-admin': '' },
    { ...key, authorization: `Bearer ${TOKEN}` },
    { ...key, 'x-admin-token': TOKEN },
    h.phone(DEV, 'keyNOTTHEDEVELOPERS1'),
    {},
  ];
  for (const v of variants) {
    const r = await packAs(v, packBody({ deviceId: attacker }));
    assert.ok([401, 403].includes(r.status), `pack answered ${r.status} to ${JSON.stringify(Object.keys(v))}`);
  }
  const q = await h.post(`/api/identify/pack?token=${TOKEN}&admin=${TOKEN}`, packBody({ deviceId: attacker }), { 'x-shin-claude': '1', ...key });
  assert.ok([401, 403].includes(q.status), `pack answered ${q.status} to a token in the URL`);
  assert.equal(h.claude.frames, before, 'a frame was sent to Claude');
});

test('c9: the pack read refuses a claimed developer id in the body when the headers name another device', async () => {
  const before = h.claude.frames;
  const attacker = h.phone('device-eeee-0006', 'keyATK2ATK2ATK2ATK2ATK');
  const r = await packAs(attacker, packBody({ deviceId: DEV }));
  assert.ok([401, 403].includes(r.status), `pack answered ${r.status}`);
  assert.equal(h.claude.frames, before);
});

/* ------------------------------------------------------------------ (e) consent */

const asksAfter = async (fn) => {
  const before = h.claude.asked.length;
  await fn();
  return h.claude.asked.slice(before);
};
const NAME_NO = 'Zzqx Secretname Nonconsent';

test('e1: with no yes, no route sends a product name to Claude', async () => {
  const dev = 'device-ffff-0007';
  const hdr = h.phone(dev, 'keyCONCONCONCONCONCON');
  const sent = await asksAfter(async () => {
    await h.get(`/api/identify?text=${encodeURIComponent(NAME_NO)}&countryCode=CA&region=Ontario&deviceId=${dev}`, hdr);
    await h.get(`/api/identify?gtin=${h.codes[0]}&countryCode=CA&region=Ontario&deviceId=${dev}`, hdr);
    await h.post('/api/price', { text: NAME_NO, deviceId: dev, countryCode: 'CA', region: 'Ontario' }, hdr);
    await h.post('/api/match-text', { lines: [NAME_NO, '2 L'], deviceId: dev }, hdr);
    await h.get(`/api/search?q=${encodeURIComponent(NAME_NO)}&deviceId=${dev}`, hdr);
    await h.post('/api/identify', { text: NAME_NO, deviceId: dev, countryCode: 'CA', region: 'Ontario' }, hdr);
    await h.post('/api/identify/photo', { deviceId: dev, name: NAME_NO }, hdr);
    await h.post('/api/correction', { clientId: 'c-e1', deviceId: dev, label: NAME_NO, priceCents: 500 }, hdr);
  });
  assert.deepEqual(sent, [], `a name went to Claude with no yes: ${JSON.stringify(sent)}`);
});

test('e2: consent is the literal 1 in x-shin-claude, anything else is a no', async () => {
  const dev = 'device-ffff-0008';
  for (const v of ['0', 'true', 'yes', '01', '1,1', 'on', 'x']) {
    const sent = await asksAfter(async () => {
      await h.get(`/api/identify?text=${encodeURIComponent(NAME_NO + v)}&countryCode=CA&region=Ontario&deviceId=${dev}`, {
        ...h.phone(dev, 'keyCON2CON2CON2CON2CON'),
        'x-shin-claude': v,
      });
    });
    assert.deepEqual(sent, [], `x-shin-claude: ${JSON.stringify(v)} sent a name to Claude`);
  }
});

test('e3: a consent value in the URL or the body is not the yes (only the header is)', async () => {
  const dev = 'device-ffff-0009';
  const hdr = h.phone(dev, 'keyCON3CON3CON3CON3CON');
  const sent = await asksAfter(async () => {
    await h.get(`/api/identify?text=${encodeURIComponent(NAME_NO)}&claude=1&consent=1&x-shin-claude=1&countryCode=CA&region=Ontario&deviceId=${dev}`, hdr);
    await h.post('/api/price', { text: NAME_NO + 'b', claude: true, consent: true, 'x-shin-claude': '1', deviceId: dev }, hdr);
  });
  assert.deepEqual(sent, []);
});

/* ------------------------------------------------------------------ (h) uploads */

const shutterId = () => '12345678-1234-4234-8234-' + String(Math.floor(Math.random() * 1e12)).padStart(12, '0');
const shutterDirNow = () => process.env.SHIN_SHUTTER_DIR;
const listed = (dir) => (existsSync(dir) ? readdirSync(dir) : []);

test('h1: the shutter frame door refuses a body over its cap with 413', async () => {
  const before = listed(shutterDirNow()).length;
  const big = JSON.stringify({ id: shutterId(), frame: 'A'.repeat(16 * 1024 * 1024 + 8) });
  // The server answers 413 and closes while the client is still sending; fetch can report that as a reset.
  const status = await h.postRaw('/api/shutter/frame', big, {}).then((r) => r.status, () => 'connection refused by the server');
  assert.ok(status === 413 || status === 'connection refused by the server', `answered ${status}`);
  assert.equal(listed(shutterDirNow()).length, before, 'an oversized frame was kept');
});

test('h2: the shutter frame door refuses something that is not a PNG or JPEG', async () => {
  const before = listed(shutterDirNow()).length;
  for (const frame of [Buffer.from('<?php system($_GET[0]); ?>').toString('base64'), Buffer.from('MZ\x90\x00').toString('base64'), '', '!!!not base64!!!']) {
    const r = await h.post('/api/shutter/frame', { id: shutterId(), frame }, {});
    assert.equal(r.status, 400, `a non-image frame answered ${r.status}`);
  }
  assert.equal(listed(shutterDirNow()).length, before, 'a non-image frame left a folder behind');
});

test('h3: path characters in the shutter id write nothing outside the shutter folder', async () => {
  const before = listed(shutterDirNow()).length;
  const parent = readdirSync(join(shutterDirNow(), '..')).join('|');
  for (const id of ['../../evil', '..\\..\\evil', '/etc/x', 'C:\\x', '12345678-1234-4234-8234-123456789012/../../x', '%2e%2e%2f', 'a'.repeat(5000)]) {
    const r = await h.post('/api/shutter/frame', { id, frame: PNG }, {});
    assert.equal(r.status, 400, `id ${id.slice(0, 30)} answered ${r.status}`);
  }
  assert.equal(listed(shutterDirNow()).length, before);
  assert.equal(readdirSync(join(shutterDirNow(), '..')).join('|'), parent, 'a file appeared beside the shutter folder');
});

test('h4: a valid shutter frame lands inside the shutter folder and nowhere else, as a plain image', async () => {
  const id = shutterId();
  const r = await h.post('/api/shutter/frame', { id, frame: PNG }, {});
  assert.equal(r.status, 204);
  assert.deepEqual(listed(join(shutterDirNow(), id)).sort(), ['frame.json', 'frame.png']);
});

test('h5: a shutter frame cannot be sent in another device name without that device key', async () => {
  const r = await h.post('/api/shutter/frame', { id: shutterId(), frame: PNG }, h.phone(B, KEY_A));
  assert.equal(r.status, 403);
});

test('h6: the shelf frame door refuses a body over its cap with 413', async () => {
  const big = JSON.stringify({ deviceId: 'device-shelf-0001', frame: 'A'.repeat(Math.ceil(3 * 1024 * 1024 * 1.4) + 16) });
  const r = await h.postRaw('/api/shelf/frame', big, {});
  assert.equal(r.status, 413);
});

test('h7: the shelf frame door refuses a non-image and path characters in the device id, writing nothing', async () => {
  const photos = process.env.SHIN_PHOTOS;
  const before = listed(photos).join('|');
  for (const deviceId of ['../../evil-device', '..\\..\\evil-device', 'a/b/c/d/e/f/g/h', 'x'.repeat(200), 'dev ice 00000001']) {
    const r = await h.post('/api/shelf/frame', { deviceId, frame: PNG }, {});
    assert.ok([400, 403].includes(r.status), `device id ${deviceId.slice(0, 20)} answered ${r.status}`);
  }
  const r = await h.post('/api/shelf/frame', { deviceId: 'device-shelf-0002', frame: Buffer.from('not an image at all').toString('base64') }, {});
  assert.ok([400, 403].includes(r.status));
  assert.equal(listed(photos).join('|'), before);
});

test('h8: with photo identification and consent on, the shelf saver still writes only inside the photos folder', async () => {
  const { saveShelfFrame } = await import('../src/shelf.ts');
  const dir = mkdtempSync(join(tmpdir(), 'shin-sec-shelf-'));
  try {
    const opts = { env: { ...process.env, SHIN_PHOTOS: dir }, photoId: () => true, keep: () => true, free: () => 1e12 };
    for (const deviceId of ['../../evil-device', '..\\..\\evil-device', 'x'.repeat(65), 'evil/../../ab']) {
      assert.equal(saveShelfFrame({ deviceId, frame: PNG }, opts).status, 400, `device id ${deviceId} was accepted`);
    }
    assert.equal(saveShelfFrame({ deviceId: 'device-shelf-0003', frame: Buffer.from('GIF89a......').toString('base64') }, opts).status, 400);
    assert.equal(saveShelfFrame({ deviceId: 'device-shelf-0003', frame: PNG }, opts).status, 204);
    assert.deepEqual(listed(dir), ['shelf']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ (i) oversized JSON bodies */

const PAD = (n) => JSON.stringify({ deviceId: 'device-big-00001', pad: 'x'.repeat(n) });

test('i1: every JSON POST route refuses a 9 KB body with 413 before reading it', async () => {
  const routes = [
    '/api/identify',
    '/api/identify/demo',
    '/api/match-text',
    '/api/price',
    '/api/correction',
    '/api/scan-rating',
    '/api/scan-rating/delete',
    '/api/consent',
    '/api/event',
    '/api/scan-price',
    '/api/scan-call',
    '/api/scan-pick',
    '/api/scan/1/outcome',
  ];
  // /api/stores and /api/store-chains are GET routes that never read a body, so they are not in this list.
  const notRefused = [];
  for (const path of routes) {
    const r = await h.postRaw(path, PAD(9 * 1024), {});
    if (![413, 404, 405].includes(r.status)) notRefused.push(`${path} -> ${r.status}`);
  }
  assert.deepEqual(notRefused, [], 'routes that read a 9 KB body');
});

test('i2: the batch event door refuses a body over 1 MiB, and caps the events it keeps', async () => {
  const r = await h.postRaw('/api/events/batch', JSON.stringify({ events: [], pad: 'x'.repeat(1024 * 1024 + 16) }), {});
  assert.equal(r.status, 413);
  const many = Array.from({ length: 5000 }, (_, i) => ({ deviceId: A, type: 'bulk', payload: { i } }));
  const ok = await h.post('/api/events/batch', { events: many }, phoneA);
  assert.equal(ok.status, 200);
  assert.ok((await ok.json()).stored <= 200, 'a batch stored more than 200 events');
});

test('i3: the pack door refuses a body over 3 MiB with 413', async () => {
  const r = await h.postRaw('/api/identify/pack', JSON.stringify({ frame: 'A'.repeat(3 * 1024 * 1024 + 16) }), { 'x-shin-admin': TOKEN });
  assert.equal(r.status, 413);
});

test('i4: the admin SQL door refuses SQL over 64 KB', async () => {
  const r = await h.postRaw('/api/admin/sql', `SELECT '${'x'.repeat(65 * 1024)}'`, { 'x-shin-admin': TOKEN });
  assert.equal(r.status, 413);
});

test('i5: a very long query string or typed name is refused or bounded, never sent whole to Claude', async () => {
  const dev = 'device-long-00001';
  const hdr = { ...h.phone(dev, 'keyLONGLONGLONGLONGLON'), 'x-shin-claude': '1' };
  const sent = await asksAfter(async () => {
    await h.get(`/api/identify?text=${encodeURIComponent('Q'.repeat(7000))}&countryCode=CA&region=Ontario&deviceId=${dev}`, hdr);
    await h.post('/api/price', { text: 'R'.repeat(7000), deviceId: dev }, hdr);
  });
  for (const s of sent) assert.ok(s.length <= 400, `a ${s.length} character prompt went to Claude from one typed name`);
});
