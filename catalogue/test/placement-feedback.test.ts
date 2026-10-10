/**
 * Price-category plan, Stage 3: requirement 2.4 (docs/price-category-requirements-
 * 2026-10-01.md line 48): record shopper picks as placement evidence, and re-run 2.2
 * after every 500 new confirmations. Pass: "2.2 re-run after every 500 new
 * confirmations". The methods file's pass test: after 500 the check fires; at 499 it
 * does not.
 *
 * Picks are what the app's /api/scan-pick stores through app/src/scans.ts recordPick,
 * in the scan store's scan_pick table. These tests build a temp scan store of that
 * shape and read it; app/ is never touched. Written before placement-feedback.ts existed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  assertRescoreNotOverdue,
  confirmationCount,
  confirmationsSinceRescore,
  ensureFeedbackSchema,
  ingestPicks,
  recordConfirmation,
  recordRescore,
  RescoreOverdueError,
  RESCORE_EVERY,
} from '../src/placement-feedback.ts';
import { openCatalogue } from '../src/schema.ts';
import { placedFixture, type FixtureRow } from './helpers/placement-fixture.ts';

const ROWS: FixtureRow[] = [
  { code: 'C1', source: 'openfoodfacts', path: ['en:cheeses'], name: 'cheddar' },
  { code: 'U1', source: 'openfoodfacts', path: [], name: 'mystery' },
];

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'shin-feedback-'));
}

/** A scan store of the shape app/src/scans.ts and app/src/migrations.ts write: scan (query_text) and scan_pick. */
function scanStore(path: string, picks: { scan: number; code: string; text: string | null }[]): void {
  const s = new DatabaseSync(path);
  s.exec(`CREATE TABLE scan (id INTEGER PRIMARY KEY, device_id TEXT NOT NULL, kind TEXT NOT NULL, query_text TEXT, outcome TEXT NOT NULL, scanned_at TEXT NOT NULL) STRICT;
          CREATE TABLE scan_pick (id INTEGER PRIMARY KEY, scan_id INTEGER NOT NULL, device_id TEXT NOT NULL, picked_code TEXT NOT NULL, source TEXT, picked_at TEXT NOT NULL) STRICT;`);
  const scan = s.prepare(`INSERT OR IGNORE INTO scan (id, device_id, kind, query_text, outcome, scanned_at) VALUES (?, 'd', 'text', ?, 'answered', '2026-10-09')`);
  const pick = s.prepare(`INSERT INTO scan_pick (scan_id, device_id, picked_code, source, picked_at) VALUES (?, 'd', ?, 'catalogue', '2026-10-09T00:00:00Z')`);
  for (const p of picks) {
    scan.run(p.scan, p.text);
    pick.run(p.scan, p.code);
  }
  s.close();
}

test('2.4 the scan store shape read here is the one the app writes (scan.query_text; scan_pick columns)', () => {
  const migrations = readFileSync(fileURLToPath(new URL('../../app/src/migrations.ts', import.meta.url)), 'utf8');
  const scans = readFileSync(fileURLToPath(new URL('../../app/src/scans.ts', import.meta.url)), 'utf8');
  for (const col of ['scan_id', 'device_id', 'picked_code', 'source', 'picked_at']) assert.match(migrations, new RegExp(`scan_pick[\\s\\S]*${col}`));
  assert.match(scans, /query_text\s+TEXT/);
  assert.match(scans, /INSERT INTO scan_pick \(scan_id, device_id, picked_code, source, picked_at\)/);
});

test('2.4 picks are ingested as confirmations once each, with the scan\'s text; a code outside the catalogue is counted, not dropped', () => {
  const dir = tempDir();
  try {
    const path = join(dir, 'scans.db');
    scanStore(path, [{ scan: 1, code: 'C1', text: 'old cheddar' }, { scan: 2, code: 'U1', text: null }, { scan: 3, code: 'NOT-IN-CATALOGUE', text: 'x' }]);
    const db = placedFixture(ROWS);
    ensureFeedbackSchema(db);
    const r = ingestPicks(db, path, { origin: 'scans' });
    assert.equal(r.ingested, 3);
    assert.equal(r.notInCatalogue, 1);
    assert.equal(confirmationCount(db), 3);
    const again = ingestPicks(db, path, { origin: 'scans' });
    assert.equal(again.ingested, 0, 'a pick already ingested is never counted twice');
    assert.equal(confirmationCount(db), 3);
    const t = db.prepare(`SELECT text FROM placement_confirmation WHERE code = 'C1'`).get() as { text: string };
    assert.equal(t.text, 'old cheddar');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('2.4 a scan store with no scan_pick table stops the ingest loudly', () => {
  const dir = tempDir();
  try {
    const path = join(dir, 'empty.db');
    new DatabaseSync(path).close();
    const db = placedFixture(ROWS);
    ensureFeedbackSchema(db);
    assert.throws(() => ingestPicks(db, path, { origin: 'scans' }), /scan_pick/);
    assert.throws(() => ingestPicks(db, join(dir, 'missing.db'), { origin: 'scans' }), /missing\.db|not found|does not exist/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('2.4 the same pick recorded twice is one confirmation', () => {
  const db = placedFixture(ROWS);
  ensureFeedbackSchema(db);
  const c = { origin: 't', pickId: 7, code: 'C1', text: 'x', pickedAt: '2026-10-09' };
  assert.equal(recordConfirmation(db, c), true);
  assert.equal(recordConfirmation(db, c), false);
  assert.equal(confirmationCount(db), 1);
});

test('2.4 the confirmation log and the re-run log are append-only', () => {
  const db = placedFixture(ROWS);
  ensureFeedbackSchema(db);
  recordConfirmation(db, { origin: 't', pickId: 1, code: 'C1', text: null, pickedAt: '2026-10-09' });
  recordRescore(db, 'test');
  assert.throws(() => db.exec(`UPDATE placement_confirmation SET code = 'U1'`), /append-only/);
  assert.throws(() => db.exec(`DELETE FROM placement_confirmation`), /append-only/);
  assert.throws(() => db.exec(`UPDATE placement_rescore SET confirmations_seen = 0`), /append-only/);
  assert.throws(() => db.exec(`DELETE FROM placement_rescore`), /append-only/);
});

function confirm(db: DatabaseSync, from: number, n: number): void {
  for (let i = from; i < from + n; i++) recordConfirmation(db, { origin: 't', pickId: i, code: 'C1', text: null, pickedAt: '2026-10-09' });
}

test('2.4 499 confirmations without a 2.2 re-run pass the check; the 500th fails it loudly', () => {
  assert.equal(RESCORE_EVERY, 500);
  const db = placedFixture(ROWS);
  ensureFeedbackSchema(db);
  confirm(db, 1, 499);
  assert.equal(confirmationsSinceRescore(db), 499);
  assert.doesNotThrow(() => assertRescoreNotOverdue(db));
  confirm(db, 500, 1);
  assert.throws(() => assertRescoreNotOverdue(db), RescoreOverdueError);
  assert.throws(() => assertRescoreNotOverdue(db), /500 confirmations.*2\.2/);
});

test('2.4 a recorded 2.2 re-run resets the count; the next 500 fail it again', () => {
  const db = placedFixture(ROWS);
  ensureFeedbackSchema(db);
  confirm(db, 1, 500);
  recordRescore(db, 'meaning match re-run');
  assert.equal(confirmationsSinceRescore(db), 0);
  assert.doesNotThrow(() => assertRescoreNotOverdue(db));
  confirm(db, 501, 499);
  assert.doesNotThrow(() => assertRescoreNotOverdue(db));
  confirm(db, 1000, 1);
  assert.throws(() => assertRescoreNotOverdue(db), RescoreOverdueError);
});

test('2.4 the check command exits non-zero when a re-run is overdue, and zero otherwise', () => {
  const dir = tempDir();
  try {
    const path = join(dir, 'cat.db');
    const db = openCatalogue(path);
    ensureFeedbackSchema(db);
    confirm(db, 1, 500);
    db.close();
    const script = fileURLToPath(new URL('../src/placement-feedback.ts', import.meta.url));
    const red = spawnSync(process.execPath, ['--no-warnings', script, 'check', '--db', path], { encoding: 'utf8' });
    assert.equal(red.status, 1, red.stdout + red.stderr);
    assert.match(red.stderr, /overdue|FAILED/);
    const db2 = new DatabaseSync(path);
    recordRescore(db2, 'test');
    db2.close();
    const green = spawnSync(process.execPath, ['--no-warnings', script, 'check', '--db', path], { encoding: 'utf8' });
    assert.equal(green.status, 0, green.stdout + green.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
