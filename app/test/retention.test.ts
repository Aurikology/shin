/**
 * Jamin's App Store list, items 7 and 8: abandoned typed text is not kept, and nothing is kept past
 * the periods the privacy policy states. Runs on temp databases.
 */
import { test, after } from 'node:test';
import { cameraSource } from './camera-source.mjs';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'shin-retention-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_DATA_DIR = dir;
process.env.SHIN_ACCESS_LOG = join(dir, 'access.log');

const { openScanStore, recordScan, getScan } = await import('../src/scans.ts');
const { recordEvent } = await import('../src/events.ts');
const { sweepPeople, sweepUserCatalogue, sweepSafetyCopies, SAFETY_COPY_DAYS, sweepScanData, sweepRequestLog, sweepShopperPrices, REQUEST_LOG_DAYS, USAGE_EVENT_MONTHS, DEVICE_ID_MONTHS } = await import('../src/retention.ts');
const { openCorrectionStore, recordCorrection } = await import('../../price/src/corrections.ts');
const { saveShopperPrice, shopperPriceCount } = await import('../../price/src/shopper-prices.ts');

const store = openScanStore(process.env.SHIN_SCANS);
const NOW = new Date('2026-11-06T12:00:00.000Z');
const OLD = '2020-01-01T00:00:00.000Z';

after(() => {
  try {
    store.db?.close();
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked. */
  }
});

test('item 7: a typed search left unsent keeps no text, through either door', () => {
  const id = recordEvent({ deviceId: 'd-typed', type: 'typed_search', payload: { text: 'something private', abandoned: true } });
  const row = store.db!.prepare('SELECT payload FROM event WHERE id = ?').get(id as number) as { payload: string };
  assert.doesNotMatch(row.payload, /something private/);
  assert.equal(JSON.parse(row.payload).abandoned, true);
});

test('item 7: a typed search that was sent keeps its text', () => {
  const id = recordEvent({ deviceId: 'd-typed', type: 'typed_search', payload: { text: 'oreo', abandoned: false } });
  const row = store.db!.prepare('SELECT payload FROM event WHERE id = ?').get(id as number) as { payload: string };
  assert.equal(JSON.parse(row.payload).text, 'oreo');
});

test('item 7: the phone no longer sends the words of an abandoned search', () => {
  const camera = cameraSource();
  assert.ok(!camera.includes('text: abandonedText'));
  assert.ok(camera.includes("track('typed_search', { abandoned: true })"));
});

test('item 8: usage events go at 12 months and not before', () => {
  const old = recordEvent({ deviceId: 'd-ev', type: 'tap', payload: {}, createdAt: OLD });
  const recent = recordEvent({ deviceId: 'd-ev', type: 'tap', payload: {}, createdAt: '2026-01-01T00:00:00.000Z' });
  const r = sweepScanData(NOW);
  assert.deepEqual(r.failed, []);
  const has = (id: number | null) => store.db!.prepare('SELECT 1 FROM event WHERE id = ?').get(id as number) !== undefined;
  assert.equal(has(old), false, 'a usage event past 12 months is still there');
  assert.equal(has(recent), true, 'a usage event inside 12 months was deleted');
});

test('item 8: a scan past 24 months keeps its answer and loses its device id; the database still refuses any other edit', () => {
  const oldId = recordScan({ deviceId: 'd-old', kind: 'barcode', query: '1', resolvedLabel: 'Oats', outcome: 'answered', source: 'catalogue' }) as number;
  const newId = recordScan({ deviceId: 'd-new', kind: 'barcode', query: '2', resolvedLabel: 'Rice', outcome: 'answered', source: 'catalogue' }) as number;
  // Dating the row back is itself an edit the immutable trigger refuses, so the test steps around it.
  const sql = store.db!.prepare("SELECT sql FROM sqlite_master WHERE name = 'scan_shown_answer_immutable'").get() as { sql: string };
  store.db!.exec('DROP TRIGGER scan_shown_answer_immutable');
  store.db!.prepare('UPDATE scan SET scanned_at = ? WHERE id = ?').run(OLD, oldId);
  store.db!.exec(sql.sql);

  const r = sweepScanData(NOW);
  assert.deepEqual(r.failed, []);
  assert.equal(r.deviceIdsRemoved, 1);
  assert.equal(getScan(oldId)?.device_id, `removed:${oldId}`);
  assert.equal(getScan(oldId)?.resolved_label, 'Oats', 'the answer went with the device id');
  assert.equal(getScan(newId)?.device_id, 'd-new');
  assert.throws(() => store.db!.prepare("UPDATE scan SET device_id = 'someone-else' WHERE id = ?").run(newId), /never edited/);
  assert.equal(sweepScanData(NOW).deviceIdsRemoved, 0, 'a second sweep touched the same row');
});

test('item 8: append-only rows take the one edit and refuse every other', () => {
  store.db!.prepare("INSERT INTO scan_pick (scan_id, device_id, picked_code, source, picked_at) VALUES (1, 'd-pick', '1', 'x', ?)").run(OLD);
  const r = sweepScanData(NOW);
  assert.deepEqual(r.failed, []);
  const row = store.db!.prepare('SELECT id, device_id FROM scan_pick').get() as { id: number; device_id: string };
  assert.equal(row.device_id, `removed:${row.id}`);
  assert.throws(() => store.db!.prepare("UPDATE scan_pick SET picked_code = '2'").run(), /never edited/);
  assert.throws(() => store.db!.prepare("UPDATE scan_pick SET device_id = 'someone'").run(), /never edited/);
});

test('item 8: a shopper price past 24 months loses its device id, and two from one phone do not collide', () => {
  const path = join(dir, 'corrections.db');
  const prices = openCorrectionStore(path);
  const put = (clientId: string, seenOn: string) =>
    recordCorrection({ clientId, deviceId: 'd-price', code: '0123456789012', productId: null, label: 'Oats', category: null, seller: 'Shop', priceCents: 300, kind: 'regular', seenOn });
  assert.equal(put('c1', '2020-01-01').ok, true);
  assert.equal(put('c2', '2020-01-02').ok, true);
  prices.db!.prepare("UPDATE correction SET recorded_at = ?").run(OLD);
  assert.equal(put('c3', '2026-11-01').ok, true);
  const r = sweepShopperPrices(path, NOW);
  assert.equal(r.failed, null);
  assert.equal(r.removed, 2);
  const again = openCorrectionStore(path);
  const ids = again.db!.prepare('SELECT device_id FROM correction ORDER BY id').all() as { device_id: string }[];
  assert.match(ids[0].device_id, /^removed:\d+$/);
  assert.notEqual(ids[0].device_id, ids[1].device_id);
  assert.equal(ids[2].device_id, 'd-price');
});

test('shopper prices (decisions 2026-11-15): a typed price past 24 months loses its device id too, and stays as a price', () => {
  const path = join(dir, 'corrections-shopper.db');
  const store = openCorrectionStore(path);
  const put = (device: string, seenOn: string) =>
    saveShopperPrice(store.db, { deviceId: device, code: '0123456789012', priceCents: 300, region: null, store: null, seenOn, centreCents: null });
  assert.equal(put('d-old', '2020-01-01').ok, true);
  store.db!.prepare('UPDATE shopper_price SET recorded_at = ?').run(OLD);
  assert.equal(put('d-new', '2026-11-01').ok, true);
  const r = sweepShopperPrices(path, NOW);
  assert.equal(r.failed, null);
  assert.equal(r.removed, 1);
  assert.equal(shopperPriceCount(store.db, 'd-old'), 0);
  assert.equal(shopperPriceCount(store.db, 'd-new'), 1);
  assert.equal(store.db!.prepare('SELECT COUNT(*) AS n FROM shopper_price').get()!.n, 2, 'the price itself is kept');
});

test('item 8: request-log lines go at 90 days, newer ones and unreadable ones stay', async () => {
  const lines = [
    JSON.stringify({ at: OLD, url: '/old' }),
    JSON.stringify({ at: '2026-11-01T00:00:00.000Z', url: '/new' }),
    'not json',
  ];
  writeFileSync(process.env.SHIN_ACCESS_LOG!, `${lines.join('\n')}\n`);
  const r = await sweepRequestLog(NOW);
  assert.deepEqual(r, { deleted: 1, failed: null });
  const kept = readFileSync(process.env.SHIN_ACCESS_LOG!, 'utf8');
  assert.doesNotMatch(kept, /\/old/);
  assert.match(kept, /\/new/);
  assert.match(kept, /not json/);
  assert.deepEqual(await sweepRequestLog(NOW), { deleted: 0, failed: null }, 'a log inside the window was rewritten');
});

test('privacy procedures: an old line is still swept when the log starts with an unreadable line', async () => {
  // The fast path trusted the first line's time. One damaged first line made the sweep stop for good.
  const lines = [
    'not json at the very top',
    JSON.stringify({ at: OLD, url: '/old-behind-a-bad-first-line' }),
    JSON.stringify({ at: '2026-11-01T00:00:00.000Z', url: '/new' }),
  ];
  writeFileSync(process.env.SHIN_ACCESS_LOG!, `${lines.join('\n')}\n`);
  const r = await sweepRequestLog(NOW);
  assert.deepEqual(r, { deleted: 1, failed: null });
  const kept = readFileSync(process.env.SHIN_ACCESS_LOG!, 'utf8');
  assert.doesNotMatch(kept, /old-behind-a-bad-first-line/);
  assert.match(kept, /\/new/);
  assert.match(kept, /not json at the very top/, 'an unreadable line is kept, as before');
});

test('item 8: the published policy states the periods this file enforces', () => {
  const en = readFileSync(new URL('../../docs/store/privacy.html', import.meta.url), 'utf8');
  assert.ok(en.includes(`${REQUEST_LOG_DAYS} days`));
  assert.ok(en.includes(`${USAGE_EVENT_MONTHS} months`));
  assert.ok(en.includes(`${DEVICE_ID_MONTHS} months`));
  assert.doesNotMatch(en, /no automatic deletion schedule/);
  const fr = readFileSync(new URL('../../docs/store/privacy-fr.html', import.meta.url), 'utf8');
  assert.ok(fr.includes(`${REQUEST_LOG_DAYS} jours`));
  assert.ok(fr.includes(`${USAGE_EVENT_MONTHS} mois`));
  assert.ok(fr.includes(`${DEVICE_ID_MONTHS} mois`));
});

test('item 8: the sweep is on the daily timer', () => {
  const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const closure = server.slice(server.indexOf('const sweep = () => {'), server.indexOf('sweep();'));
  for (const call of ['sweepScanData(', 'sweepShopperPrices(', 'sweepRequestLog(', 'sweepPeople(', 'sweepUserCatalogue(', 'sweepSafetyCopies(']) assert.ok(closure.includes(call), `${call} is not on the timer`);
});

/* ---- the tables and files the sweep used to skip (legal review 2026-11-26, A-G6, N2 to N5) ---- */

const IDLE_OLD = '2020-01-01T00:00:00.000Z';
const has = (table: string, device: string) => store.db!.prepare(`SELECT 1 FROM ${table} WHERE device_id = ?`).get(device) !== undefined;

function deviceTables(): void {
  store.db!.exec(`CREATE TABLE IF NOT EXISTS device_key (device_id TEXT PRIMARY KEY, key_hash BLOB NOT NULL, bound_at TEXT NOT NULL)`);
  store.db!.exec(`CREATE TABLE IF NOT EXISTS plus_seen (device_id TEXT PRIMARY KEY, seen_at TEXT NOT NULL)`);
}

const RECORDS: { table: string; insert: (device: string, at: string) => void }[] = [
  { table: 'consent', insert: (d, at) => store.db!.prepare('INSERT INTO consent (device_id, photos, location, updated_at) VALUES (?, 1, 1, ?)').run(d, at) },
  { table: 'device_key', insert: (d, at) => store.db!.prepare('INSERT INTO device_key (device_id, key_hash, bound_at) VALUES (?, zeroblob(4), ?)').run(d, at) },
  { table: 'device_preference', insert: (d, at) => store.db!.prepare('INSERT INTO device_preference (device_id, updated_at) VALUES (?, ?)').run(d, at) },
  { table: 'device_user', insert: (d, at) => store.db!.prepare("INSERT INTO device_user (device_id, user_id, linked_at) VALUES (?, 'u', ?)").run(d, at) },
  { table: 'plus_seen', insert: (d, at) => store.db!.prepare('INSERT INTO plus_seen (device_id, seen_at) VALUES (?, ?)').run(d, at) },
];

for (const { table, insert } of RECORDS) {
  test(`legal A-G6: ${table} rows idle for 24 months are deleted, a recent row stays`, () => {
    deviceTables();
    insert(`idle-${table}`, IDLE_OLD);
    insert(`recent-${table}`, '2026-06-01T00:00:00.000Z');
    const r = sweepScanData(NOW);
    assert.deepEqual(r.failed, []);
    assert.equal(has(table, `idle-${table}`), false, `${table}: an idle row past 24 months is still there`);
    assert.equal(has(table, `recent-${table}`), true, `${table}: a row inside 24 months was deleted`);
    assert.ok(r.deviceRecordsDeleted >= 1);
  });
}

test('legal A-G6: a device still in use keeps its secret and consent even when those rows are old', () => {
  deviceTables();
  recordScan({ deviceId: 'busy-phone', kind: 'barcode', query: '9', resolvedLabel: 'Tea', outcome: 'answered', source: 'catalogue' });
  RECORDS[0]!.insert('busy-phone', IDLE_OLD);
  RECORDS[1]!.insert('busy-phone', IDLE_OLD);
  sweepScanData(NOW);
  assert.equal(has('consent', 'busy-phone'), true, 'the consent of a phone that scanned in the window was deleted');
  assert.equal(has('device_key', 'busy-phone'), true, 'the secret of a phone that scanned in the window was deleted');
});

test('legal A-G6: the testers list (people.db) drops a device not seen for 24 months', () => {
  const people = join(dir, 'people.db');
  process.env.SHIN_PEOPLE_DB = people;
  const db = new DatabaseSync(people);
  db.exec('CREATE TABLE device_person (device_id TEXT NOT NULL, person TEXT NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, PRIMARY KEY (device_id, person))');
  db.prepare('INSERT INTO device_person VALUES (?, ?, ?, ?)').run('p-old', 'Sam', IDLE_OLD, IDLE_OLD);
  db.prepare('INSERT INTO device_person VALUES (?, ?, ?, ?)').run('p-new', 'Ana', IDLE_OLD, '2026-10-01T00:00:00.000Z');
  db.close();
  const r = sweepPeople(NOW);
  assert.deepEqual(r, { deleted: 1, failed: null });
  const check = new DatabaseSync(people, { readOnly: true });
  const left = (check.prepare('SELECT device_id FROM device_person').all() as { device_id: string }[]).map((x) => x.device_id);
  check.close();
  assert.deepEqual(left, ['p-new']);
  delete process.env.SHIN_PEOPLE_DB;
});

test('legal N2: a typed shelf price in the user catalogue past 24 months loses its device key and network code, and stays a price', () => {
  const path = join(dir, 'user-catalogue.db');
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE user_observation (id INTEGER PRIMARY KEY, observed_at TEXT NOT NULL, price_cents INTEGER, device_key TEXT, net_hash TEXT)');
  db.prepare('INSERT INTO user_observation VALUES (1, ?, 499, ?, ?)').run(IDLE_OLD, 'dev-secret', 'net-1');
  db.prepare('INSERT INTO user_observation VALUES (2, ?, 599, ?, ?)').run('2026-10-01T00:00:00.000Z', 'dev-new', 'net-2');
  db.close();
  const r = sweepUserCatalogue(path, NOW);
  assert.deepEqual(r, { removed: 1, failed: null });
  const check = new DatabaseSync(path, { readOnly: true });
  const rows = check.prepare('SELECT * FROM user_observation ORDER BY id').all() as { price_cents: number; device_key: string; net_hash: string | null }[];
  check.close();
  assert.equal(rows[0]!.device_key, 'removed:1');
  assert.equal(rows[0]!.net_hash, null);
  assert.equal(rows[0]!.price_cents, 499);
  assert.equal(rows[1]!.device_key, 'dev-new');
  assert.equal(rows[1]!.net_hash, 'net-2');
});

test('legal N4: safety copies from hand deletions are kept at most 30 days', () => {
  const safety = join(dir, 'deleted');
  mkdirSync(safety, { recursive: true });
  const old = join(safety, 'user-store-deleted-old.json');
  const fresh = join(safety, 'user-store-deleted-fresh.json');
  writeFileSync(old, '[]');
  writeFileSync(fresh, '[]');
  const days = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
  utimesSync(old, days(SAFETY_COPY_DAYS + 1), days(SAFETY_COPY_DAYS + 1));
  utimesSync(fresh, days(SAFETY_COPY_DAYS - 1), days(SAFETY_COPY_DAYS - 1));
  const r = sweepSafetyCopies(safety, NOW);
  assert.deepEqual(r, { deleted: 1, failed: null });
  assert.equal(existsSync(old), false);
  assert.equal(existsSync(fresh), true);
});

test('legal N5: old Gemini calls lose their stored request and reply words, and keep their counts', () => {
  store.db!.prepare(
    `INSERT INTO gemini_call (device_id, model, model_family, model_via, scan_type, requested_at, ms, request_json, system_text,
       prompt_text, input_ref, response_raw, answer_text, input_tokens, output_tokens)
     VALUES ('g-dev', 'gemini-x', 'gemini', 'api', 'barcode', '2026-10-01T00:00:00.000Z', 900, '{"contents":"whole body"}', 'sys',
       'the exact prompt', 'ref', 'whole reply', 'answer', 120, 45)`,
  ).run();
  const r = sweepScanData(NOW);
  assert.deepEqual(r.failed, []);
  assert.ok(r.geminiBodiesCleared >= 1);
  const row = store.db!.prepare("SELECT * FROM gemini_call WHERE device_id = 'g-dev'").get() as Record<string, unknown>;
  assert.equal(row.request_json, '');
  assert.equal(row.prompt_text, '');
  for (const col of ['system_text', 'input_ref', 'response_raw', 'answer_text']) assert.equal(row[col], null, `${col} still holds words`);
  assert.equal(row.input_tokens, 120);
  assert.equal(row.output_tokens, 45);
  assert.equal(row.ms, 900);
  assert.equal(sweepScanData(NOW).geminiBodiesCleared, 0, 'a blank row is touched again');
});
