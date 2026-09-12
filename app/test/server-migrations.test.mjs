/**
 * The schema version and the additive migrations. Plan item 1h.
 *
 * WHAT THIS HAS TO PROVE, and it is one thing said three ways: the live
 * `app/data/scans.db`, written before any of these columns existed, comes out
 * of an upgrade with every column and every row it went in with. That file is
 * the only reason this item exists. A migration system that works on an empty
 * database and breaks on the one database the beta will actually run against
 * is worse than no migration system, because it looks like one.
 *
 * So the fixture here is not a fresh file. It is a file built with the shape
 * this package had before 2026-09-08 -- no `category`, no `failure_class`, no
 * `schema_version` -- with rows in it, opened by the shipped `openScanStore`,
 * and then read back.
 *
 * NO NETWORK, NO SERVER, NO PORT. This half is arithmetic over a temp file.
 * The routes that use these tables are checked at the socket in
 * `server-beta-routes.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { openScanStore, recordScan, allScans, getScan, updateScan } from '../src/scans.ts';
import { runMigrations, schemaVersion, SCAN_MIGRATIONS, addColumnIfMissing } from '../src/migrations.ts';

const fresh = () => join(mkdtempSync(join(tmpdir(), 'shin-migrate-')), 'scans.db');

/** The table as this package shipped it before any column was added ad hoc. */
const OLD_DDL = `
CREATE TABLE scan (
  id             INTEGER PRIMARY KEY,
  device_id      TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('barcode', 'text', 'photo')),
  query_text     TEXT,
  resolved_code  TEXT,
  resolved_label TEXT,
  confidence     REAL,
  source         TEXT,
  outcome        TEXT NOT NULL CHECK (outcome IN ('answered', 'refused', 'corrected')),
  corrected_code TEXT,
  scanned_at     TEXT NOT NULL
) STRICT;
`;

function oldDatabase() {
  const path = fresh();
  const db = new DatabaseSync(path);
  db.exec(OLD_DDL);
  db.prepare(
    `INSERT INTO scan (device_id, kind, query_text, resolved_code, outcome, scanned_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run('old-device', 'barcode', '0068100084245', '0068100084245', 'answered', '2026-08-01T10:00:00.000Z');
  db.close();
  return path;
}

test('a database written before there was a version comes up at the current one', () => {
  const path = oldDatabase();
  const store = openScanStore(path);
  assert.ok(store.db, store.droppedWhy);
  const highest = Math.max(...SCAN_MIGRATIONS.map((m) => m.version));
  assert.equal(schemaVersion(store.db), highest);
});

test('and it still holds the row it had before the upgrade', () => {
  const path = oldDatabase();
  const store = openScanStore(path);
  const rows = allScans(store);
  assert.equal(rows.length, 1, 'the upgrade lost the row that was already there');
  assert.equal(rows[0].device_id, 'old-device');
  assert.equal(rows[0].resolved_code, '0068100084245');
  // Every column the migrations added is present and null on a row that
  // predates it. Null, not zero: nobody measured a latency in August.
  assert.equal(rows[0].failure_class, null);
  assert.equal(rows[0].latency_ms, null);
  assert.equal(rows[0].photo_path, null);
  assert.equal(rows[0].user_id, null);
});

test('every table the beta added exists on an old file after one open', () => {
  const path = oldDatabase();
  const store = openScanStore(path);
  const names = store.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r) => r.name);
  for (const table of ['consent', 'device_user', 'event', 'scan', 'scan_rating', 'schema_version']) {
    assert.ok(names.includes(table), `${table} is missing after the migrations ran`);
  }
});

test('a second open runs nothing and records nothing', () => {
  const path = oldDatabase();
  openScanStore(path);
  const second = openScanStore(path);
  const applied = runMigrations(second.db);
  assert.deepEqual(applied.applied, [], 'a migration ran twice');
  const rows = second.db.prepare('SELECT version FROM schema_version ORDER BY version').all();
  assert.equal(rows.length, SCAN_MIGRATIONS.length, 'schema_version gained a duplicate row');
});

test('the version table records what ran, not just how far it got', () => {
  const path = oldDatabase();
  const store = openScanStore(path);
  const rows = store.db.prepare('SELECT version, name, applied_at FROM schema_version ORDER BY version').all();
  assert.equal(rows.length, SCAN_MIGRATIONS.length);
  for (const row of rows) {
    assert.ok(row.name.length > 0, `migration ${row.version} recorded no name`);
    assert.ok(!Number.isNaN(Date.parse(row.applied_at)), `migration ${row.version} recorded no usable time`);
  }
});

test('a migration that throws records nothing and leaves the version where it was', () => {
  const path = fresh();
  const store = openScanStore(path);
  const before = schemaVersion(store.db);
  const broken = [
    { version: 900, name: 'adds a table', apply: (db) => db.exec('CREATE TABLE IF NOT EXISTS probe (x TEXT) STRICT;') },
    {
      version: 901,
      name: 'throws half way',
      apply: () => {
        throw new Error('deliberate');
      },
    },
  ];
  assert.throws(() => runMigrations(store.db, broken), /deliberate/);
  // The good one before it committed and is recorded; the bad one is not, so
  // the next start retries exactly it and nothing else.
  assert.equal(schemaVersion(store.db), 900);
  const names = store.db.prepare('SELECT name FROM schema_version WHERE version >= 900').all().map((r) => r.name);
  assert.deepEqual(names, ['adds a table']);
  assert.ok(before < 900);
});

test('addColumnIfMissing is a no-op on a column that is already there', () => {
  const path = fresh();
  const store = openScanStore(path);
  addColumnIfMissing(store.db, 'scan', 'category', 'TEXT');
  addColumnIfMissing(store.db, 'scan', 'category', 'TEXT');
  const columns = store.db.prepare('PRAGMA table_info(scan)').all().filter((c) => c.name === 'category');
  assert.equal(columns.length, 1);
});

/*
 * The write half of plan item 9, on the functions rather than at the socket.
 * The routes are checked in `server-beta-routes.test.ts`; this is here because
 * a column that the migration added and nothing can write to is a column that
 * passes a schema test and fails a beta.
 */
test('every column the complete scan record added can be written and read back', () => {
  openScanStore(fresh());
  const id = recordScan({
    deviceId: 'd-record',
    kind: 'photo',
    query: 'a jar of something',
    outcome: 'answered',
    resolvedCode: '111',
    modelJson: '{"readAs":"a jar"}',
    modelCostCents: 0.68,
    appVersion: '0.1.0',
    platform: 'ios',
    latencyMs: 1234,
    cell: '43.26,-79.92',
    storeId: 'node/1',
    storeName: 'Somewhere',
  });
  assert.ok(id);
  assert.ok(
    updateScan(id, {
      photoPath: `${id}.jpg`,
      typedPriceCents: 499,
      verdictTier: 'fair',
      verdictConfidence: 'medium',
      verdictSellers: 3,
    }),
  );
  const row = getScan(id);
  assert.equal(row.model_json, '{"readAs":"a jar"}');
  assert.equal(row.model_cost_cents, 0.68);
  assert.equal(row.app_version, '0.1.0');
  assert.equal(row.platform, 'ios');
  assert.equal(row.latency_ms, 1234);
  assert.equal(row.cell, '43.26,-79.92');
  assert.equal(row.store_id, 'node/1');
  assert.equal(row.store_name, 'Somewhere');
  assert.equal(row.photo_path, `${id}.jpg`);
  assert.equal(row.typed_price_cents, 499);
  assert.equal(row.verdict_tier, 'fair');
  assert.equal(row.verdict_confidence, 'medium');
  assert.equal(row.verdict_sellers, 3);
  assert.equal(row.user_id, null);
});

test('a patch key that is absent leaves its column alone, and an explicit null clears it', () => {
  openScanStore(fresh());
  const id = recordScan({ deviceId: 'd-patch', kind: 'photo', query: 'x', outcome: 'answered' });
  updateScan(id, { photoPath: 'a.jpg', typedPriceCents: 100 });
  // Absent: the photo path survives a patch about something else entirely.
  updateScan(id, { verdictTier: 'good' });
  assert.equal(getScan(id).photo_path, 'a.jpg');
  // Explicit null: the retention sweep clears a path this way and nothing else.
  updateScan(id, { photoPath: null });
  assert.equal(getScan(id).photo_path, null);
  assert.equal(getScan(id).typed_price_cents, 100);
});

test('updateScan on an id that names nothing is false rather than a throw', () => {
  openScanStore(fresh());
  assert.equal(updateScan(999_999, { verdictTier: 'good' }), false);
});

test('a patch with no known keys writes nothing instead of building broken SQL', () => {
  openScanStore(fresh());
  const id = recordScan({ deviceId: 'd-empty', kind: 'text', query: 'x', outcome: 'answered' });
  assert.equal(updateScan(id, {}), false);
  assert.equal(updateScan(id, { notAColumn: 'x' }), false);
});
