// Security finding F9 (2026-11-16): one command that removes what shoppers typed or picked for ONE barcode, so a
// poisoned barcode can be cleaned without touching anything else. Dry run unless --yes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const SCRIPT = new URL('../security/remove-shopper-input.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dir = mkdtempSync(join(tmpdir(), 'shin-remove-input-'));
const corrections = join(dir, 'corrections.db');
const scans = join(dir, 'scans.db');

const c = new DatabaseSync(corrections);
c.exec(`CREATE TABLE shopper_price (id INTEGER PRIMARY KEY, code TEXT NOT NULL, device_id TEXT NOT NULL, price_cents INTEGER NOT NULL, seen_on TEXT NOT NULL)`);
const ins = c.prepare('INSERT INTO shopper_price (code, device_id, price_cents, seen_on) VALUES (?,?,?,?)');
ins.run('9354765000036', 'a', 100, '2026-11-16');
ins.run('9354765000036', 'b', 110, '2026-11-16');
ins.run('4900000000015', 'c', 500, '2026-11-16');
c.close();

const s = new DatabaseSync(scans);
s.exec(`CREATE TABLE scan (id INTEGER PRIMARY KEY, kind TEXT, query_text TEXT);
  CREATE TABLE scan_pick (id INTEGER PRIMARY KEY, scan_id INTEGER NOT NULL, device_id TEXT NOT NULL, picked_code TEXT NOT NULL);
  CREATE TRIGGER scan_pick_append_only BEFORE UPDATE ON scan_pick BEGIN SELECT RAISE(ABORT, 'no edits'); END;`);
s.exec(`INSERT INTO scan (id, kind, query_text) VALUES (1,'barcode','09354765000036'),(2,'barcode','9354765000036'),(3,'barcode','4900000000015')`);
s.exec(`INSERT INTO scan_pick (scan_id, device_id, picked_code) VALUES (1,'a','0000000094012'),(2,'b','0000000094012'),(3,'c','0000000094053')`);
s.close();

const run = (...args) => spawnSync(process.execPath, [SCRIPT, '--corrections', corrections, '--scans', scans, ...args], { encoding: 'utf8' });
const count = (file, sql) => {
  const d = new DatabaseSync(file, { readOnly: true });
  try {
    return d.prepare(sql).get().n;
  } finally {
    d.close();
  }
};

test('a dry run prints the counts and deletes nothing', () => {
  const r = run('--code', '9354765000036');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /dry run/i);
  assert.match(r.stdout, /typed prices: 2/);
  assert.match(r.stdout, /picks: 2/);
  assert.equal(count(corrections, 'SELECT COUNT(*) AS n FROM shopper_price'), 3);
  assert.equal(count(scans, 'SELECT COUNT(*) AS n FROM scan_pick'), 3);
});

test('no barcode is a usage error and touches nothing', () => {
  const r = run('--yes');
  assert.notEqual(r.status, 0);
  assert.equal(count(corrections, 'SELECT COUNT(*) AS n FROM shopper_price'), 3);
});

test('--yes deletes that barcode only (any zero padding), under the append-only trigger, and says so', () => {
  const r = run('--code', '09354765000036', '--yes');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /deleted/i);
  assert.match(r.stdout, /typed prices: 2/);
  assert.match(r.stdout, /picks: 2/);
  assert.equal(count(corrections, 'SELECT COUNT(*) AS n FROM shopper_price'), 1);
  assert.equal(count(corrections, "SELECT COUNT(*) AS n FROM shopper_price WHERE code = '4900000000015'"), 1);
  assert.equal(count(scans, 'SELECT COUNT(*) AS n FROM scan_pick'), 1);
});

test('a second run finds nothing', () => {
  const r = run('--code', '9354765000036', '--yes');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /typed prices: 0/);
  assert.match(r.stdout, /picks: 0/);
});
