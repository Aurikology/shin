// scripts/test/device-data.test.mjs
//
// The delete-my-data and see-my-data script (scripts/privacy/device-data.mjs), run as the command line it
// is, against temporary copies of every store, with the same SHIN_* variables the server reads.
//
// What each test proves, in the words of the job:
//   - export holds everything held about the phone, and nothing about another phone
//   - delete is a dry run unless --yes is given
//   - delete removes the phone's rows from every store and leaves the other phone's rows alone
//   - a store that does not exist is reported, never created
//
// Run: node --test scripts/test/device-data.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const SCRIPT = join(REPO, 'scripts', 'privacy', 'device-data.mjs');

const { openScanStore } = await import('../../app/src/scans.ts');
const { bindDevice } = await import('../../app/src/device-key.ts');
const { openCorrectionStore } = await import('../../price/src/corrections.ts');
const { saveShopperPrice } = await import('../../price/src/shopper-prices.ts');
const { createUserCatalogue, deviceKeyOf } = await import('../../catalogue/src/user-catalogue.ts');

const ME = '11111111-aaaa-4bbb-8ccc-000000000001';
const OTHER = '22222222-aaaa-4bbb-8ccc-000000000002';
const NOW = '2026-11-01T12:00:00.000Z';

const root = mkdtempSync(join(tmpdir(), 'shin-device-data-'));
const dataDir = join(root, 'data');
mkdirSync(dataDir, { recursive: true });
const paths = {
  scans: join(dataDir, 'scans.db'),
  corrections: join(dataDir, 'corrections.db'),
  userCatalogue: join(dataDir, 'user-catalogue.db'),
  people: join(dataDir, 'people.db'),
  gaps: join(dataDir, 'gaps.db'),
  accessLog: join(dataDir, 'access.log'),
  photos: join(dataDir, 'photos'),
  shutter: join(dataDir, 'shutter'),
  logs: join(root, 'logs'),
};

after(() => {
  for (const h of [scanStore.db, corr.db]) {
    try {
      h?.close();
    } catch {
      /* already closed */
    }
  }
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* Windows may keep a sqlite file locked a moment */
  }
});

function env(extra = {}) {
  return {
    ...process.env,
    NODE_NO_WARNINGS: '1',
    SHIN_DATA_DIR: dataDir,
    SHIN_SCANS: paths.scans,
    SHIN_CORRECTIONS: paths.corrections,
    SHIN_USER_CATALOGUE: paths.userCatalogue,
    SHIN_PEOPLE_DB: paths.people,
    SHIN_GAPS: paths.gaps,
    SHIN_ACCESS_LOG: paths.accessLog,
    SHIN_PHOTOS: paths.photos,
    SHIN_SHUTTER_DIR: paths.shutter,
    SHIN_LOG_DIR: paths.logs,
    ...extra,
  };
}

function run(args, extra = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { env: env(extra), encoding: 'utf8' });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

function sql(path, text, ...params) {
  const db = new DatabaseSync(path);
  try {
    return db.prepare(text).all(...params);
  } finally {
    db.close();
  }
}

function count(path, table, column, id) {
  return Number(sql(path, `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`, id)[0].n);
}

// ---- build every store, with rows for ME and for OTHER ---------------------------------------------

const scanStore = openScanStore(paths.scans);
for (const id of [ME, OTHER]) {
  scanStore.db.prepare(
    `INSERT INTO scan (device_id, kind, query_text, outcome, scanned_at, photo_path) VALUES (?, 'text', ?, 'answered', ?, ?)`,
  ).run(id, `milk typed by ${id.slice(0, 2)}`, NOW, id === ME ? 'mine/one.jpg' : 'theirs/one.jpg');
  scanStore.db.prepare(`INSERT INTO scan (device_id, kind, query_text, outcome, scanned_at) VALUES (?, 'barcode', '0123', 'answered', ?)`).run(id, NOW);
  scanStore.db.prepare(`INSERT INTO scan_rating (scan_id, device_id, rating, rated_at) VALUES (?, ?, 'up', ?)`).run(id === ME ? 1 : 3, id, NOW);
  scanStore.db.prepare(`INSERT INTO event (device_id, type, payload, created_at) VALUES (?, 'open', '{}', ?)`).run(id, NOW);
  scanStore.db.prepare(`INSERT INTO consent (device_id, photos, location, updated_at) VALUES (?, 0, 0, ?)`).run(id, NOW);
  scanStore.db.prepare(`INSERT INTO device_preference (device_id, updated_at) VALUES (?, ?)`).run(id, NOW);
  scanStore.db.prepare(`INSERT INTO device_user (device_id, user_id, linked_at) VALUES (?, 'u', ?)`).run(id, NOW);
  bindDevice({ 'x-shin-device': id, 'x-shin-device-key': (id[0]).repeat(64) });
}
// A table nobody has thought of yet, in the same database: the script finds it by its device_id column.
scanStore.db.exec('CREATE TABLE IF NOT EXISTS future_thing (device_id TEXT, note TEXT)');
scanStore.db.prepare('INSERT INTO future_thing VALUES (?, ?)').run(ME, 'mine');
scanStore.db.prepare('INSERT INTO future_thing VALUES (?, ?)').run(OTHER, 'theirs');
scanStore.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');

const corr = openCorrectionStore(paths.corrections);
for (const id of [ME, OTHER]) {
  corr.db.prepare(
    `INSERT INTO correction (client_id, device_id, subject, seller, seller_key, price_cents, kind, seen_on, recorded_at)
     VALUES (?, ?, 'oat milk', 'Shop', 'shop', 399, 'regular', '2026-10-30', ?)`,
  ).run(`c-${id}`, id, NOW);
  saveShopperPrice(corr.db, { deviceId: id, code: '5551234', priceCents: 450, region: 'ON', store: 'Shop', seenOn: '2026-10-30' }, new Date(NOW));
}
corr.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');

const uc = createUserCatalogue(paths.userCatalogue);
const ucDb = new DatabaseSync(paths.userCatalogue);
for (const id of [ME, OTHER]) {
  ucDb.prepare(`INSERT INTO user_observation (store_type, observed_at, device_key, price_cents, capture) VALUES ('grocery', ?, ?, 399, 'typed')`).run(NOW, deviceKeyOf(id));
}
ucDb.close();
void uc;

const people = new DatabaseSync(paths.people);
people.exec('CREATE TABLE device_person (device_id TEXT NOT NULL, person TEXT NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, PRIMARY KEY (device_id, person))');
for (const id of [ME, OTHER]) people.prepare('INSERT INTO device_person VALUES (?, ?, ?, ?)').run(id, 'tester', NOW, NOW);
people.close();

writeFileSync(
  paths.accessLog,
  [
    JSON.stringify({ at: NOW, url: `/api/identify?deviceId=${ME}&q=milk`, ip: '203.0.113.9' }),
    JSON.stringify({ at: NOW, url: `/api/identify?deviceId=${OTHER}&q=eggs`, ip: '203.0.113.10' }),
    JSON.stringify({ at: NOW, url: '/api/pack', ip: '203.0.113.11' }),
  ].join('\n') + '\n',
);

mkdirSync(join(paths.photos, 'mine'), { recursive: true });
mkdirSync(join(paths.photos, 'theirs'), { recursive: true });
writeFileSync(join(paths.photos, 'mine', 'one.jpg'), 'jpeg-bytes-mine');
writeFileSync(join(paths.photos, 'theirs', 'one.jpg'), 'jpeg-bytes-theirs');
for (const id of [ME, OTHER]) {
  mkdirSync(join(paths.photos, 'shelf', '2026-10-30', id), { recursive: true });
  writeFileSync(join(paths.photos, 'shelf', '2026-10-30', id, 'a.jpg'), `frame-${id}`);
}
mkdirSync(paths.shutter, { recursive: true });
mkdirSync(join(paths.shutter, "press-1"), { recursive: true });
writeFileSync(join(paths.shutter, "press-1", "frame.json"), JSON.stringify({ url: `/api/identify?deviceId=${ME}` }));
mkdirSync(join(paths.shutter, "press-2"), { recursive: true });
writeFileSync(join(paths.shutter, "press-2", "frame.json"), JSON.stringify({ url: `/api/identify?deviceId=${OTHER}` }));
mkdirSync(paths.logs, { recursive: true });
writeFileSync(join(paths.logs, 'server.err.log'), `{"where":"x","deviceId":"${ME}"}\n{"where":"y","deviceId":"${OTHER}"}\n`);

// ---- the tests ------------------------------------------------------------------------------------

test('export: everything held about the phone is in the JSON, and nothing about the other phone', () => {
  const r = run(['export', ME]);
  assert.equal(r.status, 0, r.err);
  const doc = JSON.parse(r.out);
  assert.equal(doc.deviceId, ME);
  const tables = doc.databases.scans.tables;
  for (const t of ['scan', 'scan_rating', 'event', 'consent', 'device_preference', 'device_user', 'device_key', 'future_thing']) {
    assert.ok(tables[t] && tables[t].length >= 1, `${t} missing from the export`);
  }
  assert.equal(tables.scan.length, 2);
  assert.equal(doc.databases.corrections.tables.correction.length, 1);
  assert.equal(doc.databases.corrections.tables.shopper_price.length, 1);
  assert.equal(doc.databases.userCatalogue.tables.user_observation.length, 1);
  assert.equal(doc.databases.people.tables.device_person.length, 1);
  assert.equal(doc.accessLog.lines.length, 1);
  assert.match(doc.accessLog.lines[0], new RegExp(ME));
  assert.ok(doc.photos.files.some((f) => f.endsWith('one.jpg')), 'the scan photo is not listed');
  assert.ok(doc.photos.shelfFiles.length === 1);
  assert.equal(doc.shutter.files.length, 1);
  assert.equal(doc.logs.files['server.err.log'].length, 1);
  const text = r.out;
  assert.equal(text.includes(OTHER), false, 'the other phone leaked into the export');
  assert.equal(text.includes('theirs'), false, 'the other phone leaked into the export');
});

test('delete without --yes is a dry run: counts are printed and nothing changes', () => {
  const r = run(['delete', ME]);
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, /dry run/i);
  assert.match(r.out, /scan\s+2/);
  assert.equal(count(paths.scans, 'scan', 'device_id', ME), 2);
  assert.equal(count(paths.corrections, 'correction', 'device_id', ME), 1);
  assert.ok(readFileSync(paths.accessLog, 'utf8').includes(ME));
  assert.ok(existsSync(join(paths.photos, 'mine', 'one.jpg')));
});

test('delete --yes removes the phone from every store and leaves the other phone alone', () => {
  const r = run(['delete', ME, '--yes']);
  assert.equal(r.status, 0, r.err);
  assert.doesNotMatch(r.out, /dry run/i);

  for (const t of ['scan', 'scan_rating', 'event', 'consent', 'device_preference', 'device_user', 'device_key', 'future_thing']) {
    assert.equal(count(paths.scans, t, 'device_id', ME), 0, `${t}: the phone's rows are still there`);
    assert.equal(count(paths.scans, t, 'device_id', OTHER), t === 'scan' ? 2 : 1, `${t}: the other phone's rows changed`);
  }
  assert.equal(count(paths.corrections, 'correction', 'device_id', ME), 0);
  assert.equal(count(paths.corrections, 'shopper_price', 'device_id', ME), 0);
  assert.equal(count(paths.corrections, 'correction', 'device_id', OTHER), 1);
  assert.equal(count(paths.corrections, 'shopper_price', 'device_id', OTHER), 1);
  assert.equal(count(paths.userCatalogue, 'user_observation', 'device_key', deviceKeyOf(ME)), 0);
  assert.equal(count(paths.userCatalogue, 'user_observation', 'device_key', deviceKeyOf(OTHER)), 1);
  assert.equal(count(paths.people, 'device_person', 'device_id', ME), 0);
  assert.equal(count(paths.people, 'device_person', 'device_id', OTHER), 1);

  const log = readFileSync(paths.accessLog, 'utf8');
  assert.equal(log.includes(ME), false);
  assert.ok(log.includes(OTHER));
  assert.ok(log.includes('/api/pack'), 'a line about nobody was dropped');

  assert.equal(existsSync(join(paths.photos, 'mine', 'one.jpg')), false, 'the scan photo is still on disk');
  assert.ok(existsSync(join(paths.photos, 'theirs', 'one.jpg')));
  assert.equal(existsSync(join(paths.photos, 'shelf', '2026-10-30', ME)), false);
  assert.ok(existsSync(join(paths.photos, 'shelf', '2026-10-30', OTHER, 'a.jpg')));
  assert.equal(existsSync(join(paths.shutter, 'press-1')), false);
  assert.ok(existsSync(join(paths.shutter, 'press-2')));
  const errLog = readFileSync(join(paths.logs, 'server.err.log'), 'utf8');
  assert.equal(errLog.includes(ME), false);
  assert.ok(errLog.includes(OTHER));

  // The per-table counts it printed are the counts it deleted.
  assert.match(r.out, /scan\s+2/);
  assert.match(r.out, /correction\s+1/);
});

test('after the delete, an export of the same phone is empty', () => {
  const r = run(['export', ME]);
  assert.equal(r.status, 0, r.err);
  const doc = JSON.parse(r.out);
  for (const db of Object.values(doc.databases)) {
    for (const rows of Object.values(db.tables ?? {})) assert.equal(rows.length, 0);
  }
  assert.equal(doc.accessLog.lines.length, 0);
});

test('an id that could match everything is refused', () => {
  for (const bad of ['', 'abc', 'removed:12345678', 'has space in it', '../../etc']) {
    const r = run(['delete', bad, '--yes']);
    assert.equal(r.status, 2, `"${bad}" was accepted`);
    assert.match(r.err, /not a device id/, `"${bad}" failed for the wrong reason`);
  }
  assert.equal(count(paths.scans, 'scan', 'device_id', OTHER), 2, 'a refused id still changed data');
});

test('a store that does not exist is reported and never created', () => {
  const missing = join(root, 'nope', 'scans.db');
  const r = run(['delete', ME, '--yes'], { SHIN_SCANS: missing });
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, /not found/i);
  assert.equal(existsSync(missing), false);
});

test('the database paths are the server\'s own variables: pointing them elsewhere reads that data', () => {
  const r = run(['export', OTHER], { SHIN_SCANS: join(root, 'elsewhere.db') });
  assert.equal(r.status, 0, r.err);
  const doc = JSON.parse(r.out);
  assert.equal(doc.databases.scans.found, false);
  assert.equal(doc.databases.corrections.found, true);
});
