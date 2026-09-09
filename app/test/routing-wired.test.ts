/**
 * The routing priors, from the scan log they read to the answer they change.
 *
 * DEFECTS.md D-026 has carried "the routing priors" as uncalled since
 * 2026-09-05. catalogue/src/routing.ts is tested on its own and its rules hold;
 * what nothing covered is the half added here, which is the half that can be
 * wrong in a way routing.ts cannot see:
 *
 *   1. The log has to actually hold a category, on a database that already
 *      existed before the column did. CREATE TABLE IF NOT EXISTS does nothing
 *      to a table that is already there, so a missing migration is silent and
 *      every route in the field would be built from an empty history.
 *   2. The reader has to leave out what is not evidence about the person: rows
 *      with no category, and refusals.
 *   3. The order has to be oldest-first, because routing.ts decays by position
 *      and reversing it would weigh the oldest scan the heaviest.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { openScanStore, recordScan, recentCategories } from '../src/scans.ts';

const fresh = () => join(mkdtempSync(join(tmpdir(), 'shin-route-')), 'scans.db');

test('a category written is a category read back', () => {
  openScanStore(fresh());
  recordScan({ deviceId: 'd1', kind: 'text', query: 'chips', outcome: 'answered', category: 'grocery' });
  recordScan({ deviceId: 'd1', kind: 'text', query: 'laptop', outcome: 'answered', category: 'tech' });
  assert.deepEqual(recentCategories('d1').map((r) => r.category), ['grocery', 'tech']);
});

test('oldest first, because the decay counts from the recent end', () => {
  openScanStore(fresh());
  for (const c of ['grocery', 'grocery', 'tech']) {
    recordScan({ deviceId: 'd1', kind: 'text', query: 'x', outcome: 'answered', category: c });
  }
  assert.deepEqual(recentCategories('d1').map((r) => r.category), ['grocery', 'grocery', 'tech']);
});

test('the newest rows are the ones kept when there are more than the limit', () => {
  openScanStore(fresh());
  for (const c of ['grocery', 'grocery', 'tech', 'tech']) {
    recordScan({ deviceId: 'd1', kind: 'text', query: 'x', outcome: 'answered', category: c });
  }
  // A route about who somebody is today must not be outvoted by who they were.
  assert.deepEqual(recentCategories('d1', 2).map((r) => r.category), ['tech', 'tech']);
});

test('a scan with no category is not a vote', () => {
  openScanStore(fresh());
  recordScan({ deviceId: 'd1', kind: 'text', query: 'x', outcome: 'answered', category: 'grocery' });
  recordScan({ deviceId: 'd1', kind: 'text', query: 'y', outcome: 'answered', category: null });
  recordScan({ deviceId: 'd1', kind: 'text', query: 'z', outcome: 'answered' });
  assert.deepEqual(recentCategories('d1').map((r) => r.category), ['grocery']);
});

test('a refusal says what the catalogue lacks, not what the person shops for', () => {
  openScanStore(fresh());
  recordScan({ deviceId: 'd1', kind: 'text', query: 'x', outcome: 'refused', category: 'tech' });
  recordScan({ deviceId: 'd1', kind: 'text', query: 'y', outcome: 'answered', category: 'grocery' });
  // A correction IS kept: the person told us what it was, which is the
  // strongest thing in the table about what they were holding.
  recordScan({ deviceId: 'd1', kind: 'text', query: 'z', outcome: 'corrected', category: 'used' });
  assert.deepEqual(recentCategories('d1').map((r) => r.category), ['grocery', 'used']);
});

test('one device never routes on another device history', () => {
  openScanStore(fresh());
  recordScan({ deviceId: 'd1', kind: 'text', query: 'x', outcome: 'answered', category: 'grocery' });
  recordScan({ deviceId: 'd2', kind: 'text', query: 'y', outcome: 'answered', category: 'tech' });
  assert.deepEqual(recentCategories('d1').map((r) => r.category), ['grocery']);
  assert.deepEqual(recentCategories('d2').map((r) => r.category), ['tech']);
});

test('a database written before the column existed gains it, and still reads', () => {
  // The exact shape in the field: a scan table created without `category`,
  // holding a row, opened by the current code.
  const path = fresh();
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE scan (
    id INTEGER PRIMARY KEY, device_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('barcode','text','photo')),
    query_text TEXT, resolved_code TEXT, resolved_label TEXT, confidence REAL,
    source TEXT,
    outcome TEXT NOT NULL CHECK (outcome IN ('answered','refused','corrected')),
    corrected_code TEXT, scanned_at TEXT NOT NULL) STRICT`);
  old.prepare(
    `INSERT INTO scan (device_id, kind, query_text, outcome, scanned_at) VALUES ('d1','text','old','answered','2026-09-01T00:00:00.000Z')`,
  ).run();
  old.close();

  const store = openScanStore(path);
  const cols = (store.db.prepare('PRAGMA table_info(scan)').all() as { name: string }[]).map((c) => c.name);
  assert.ok(cols.includes('category'), 'the column was not added to an existing table');

  // The pre-existing row survives with a null category, so it is simply not a
  // vote. An old log makes the route unsure, never wrong.
  assert.deepEqual(recentCategories('d1').map((r) => r.category), []);
  recordScan({ deviceId: 'd1', kind: 'text', query: 'new', outcome: 'answered', category: 'grocery' });
  assert.deepEqual(recentCategories('d1').map((r) => r.category), ['grocery']);
});

test('losing the migration race does not turn the scan log off', () => {
  // Two processes open the same file, both read a table with no `category`, and
  // both try to add it. The loser used to take `duplicate column name` into the
  // open, which nulled the handle and silently muted every write and every read
  // for the life of that process. A column somebody else added is success.
  const path = fresh();
  const first = new DatabaseSync(path);
  first.exec(`CREATE TABLE scan (
    id INTEGER PRIMARY KEY, device_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('barcode','text','photo')),
    query_text TEXT, resolved_code TEXT, resolved_label TEXT, confidence REAL,
    source TEXT,
    outcome TEXT NOT NULL CHECK (outcome IN ('answered','refused','corrected')),
    corrected_code TEXT, scanned_at TEXT NOT NULL) STRICT`);
  // The winner of the race, standing in for the other process.
  first.exec('ALTER TABLE scan ADD COLUMN category TEXT');
  first.close();

  const store = openScanStore(path);
  assert.ok(store.db, `the handle was nulled: ${store.droppedWhy}`);
  assert.equal(store.dropped, 0);
  recordScan({ deviceId: 'd1', kind: 'text', query: 'x', outcome: 'answered', category: 'grocery' });
  assert.deepEqual(recentCategories('d1').map((r) => r.category), ['grocery']);
});

test('the hot queries have an index, on a fresh store and on one built before the indexes existed', () => {
  // scan_device_week covers weeklyCount, which nothing in production calls.
  // recentCategories runs on every identify and search, lastAnsweredScan on
  // every correction, and both want newest-first by id under a device. Without
  // these the planner stops at the device_id prefix and scans every row that
  // device has, on the request thread, growing without bound.
  const indexes = (db: DatabaseSync) =>
    (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'scan'`).all() as { name: string }[])
      .map((r) => r.name);

  const fresh1 = openScanStore(fresh());
  assert.ok(fresh1.db);
  assert.ok(indexes(fresh1.db).includes('scan_device_recent'));
  assert.ok(indexes(fresh1.db).includes('scan_device_code'));

  // A table from before the indexes existed. Unlike a column, an index IS
  // created by IF NOT EXISTS on an existing table, so no migration is needed;
  // this asserts that assumption rather than trusting it.
  const path = fresh();
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE scan (
    id INTEGER PRIMARY KEY, device_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('barcode','text','photo')),
    query_text TEXT, resolved_code TEXT, resolved_label TEXT, confidence REAL,
    source TEXT,
    outcome TEXT NOT NULL CHECK (outcome IN ('answered','refused','corrected')),
    corrected_code TEXT, scanned_at TEXT NOT NULL) STRICT`);
  old.close();
  const upgraded = openScanStore(path);
  assert.ok(upgraded.db);
  assert.ok(indexes(upgraded.db).includes('scan_device_recent'));
  assert.ok(indexes(upgraded.db).includes('scan_device_code'));

  // And the planner actually uses it for the hot query.
  const plan = (upgraded.db.prepare(
    `EXPLAIN QUERY PLAN SELECT category FROM scan WHERE device_id = ? AND category IS NOT NULL AND outcome != 'refused' ORDER BY id DESC LIMIT 40`,
  ).all('d') as { detail: string }[]).map((r) => r.detail).join(' | ');
  assert.match(plan, /scan_device_recent/, `planner chose: ${plan}`);
});

test('a store that will not open is a device with no history, not a throw', () => {
  openScanStore(join(fresh(), 'nested', 'impossible', '\0bad'));
  assert.deepEqual(recentCategories('d1').map((r) => r.category), []);
});
