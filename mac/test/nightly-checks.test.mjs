// mac/test/nightly-checks.test.mjs
// R16 (database integrity, loud on failure) and the disk-free half of R10.
// Run: node --test mac/test/*.test.mjs
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, openSync, writeSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkDb, runNightly } from '../nightly-checks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'shin-nightly-'));
after(() => rmSync(root, { recursive: true, force: true }));

function makeDb(name, rows = 3000) {
  const p = join(root, name);
  const db = new DatabaseSync(p);
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); CREATE INDEX t_v ON t(v);');
  const ins = db.prepare('INSERT INTO t (v) VALUES (?)');
  db.exec('BEGIN');
  for (let i = 0; i < rows; i++) ins.run('row-' + i + '-' + 'x'.repeat(40));
  db.exec('COMMIT');
  db.close();
  return p;
}

function corrupt(p) {
  // overwrite a run of bytes in the middle of the file (inside table / index pages)
  const fd = openSync(p, 'r+');
  writeSync(fd, Buffer.alloc(8192, 0xff), 0, 8192, 8192 * 3);
  closeSync(fd);
}

test('a healthy database passes integrity_check', () => {
  const r = checkDb(makeDb('good.db'));
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'integrity_check');
});

test('a damaged database FAILS and says so', () => {
  const p = makeDb('bad.db');
  corrupt(p);
  const r = checkDb(p);
  assert.equal(r.ok, false);
  assert.ok(r.detail.length > 0);
});

test('a configured database that is missing fails; a file that is not a database fails', () => {
  assert.equal(checkDb(join(root, 'nope.db')).ok, false);
  const junk = join(root, 'junk.db');
  writeFileSync(junk, 'this is not sqlite at all');
  assert.equal(checkDb(junk).ok, false);
});

test('a big file gets quick_check, not the slow full check', () => {
  const p = makeDb('big.db');
  const r = checkDb(p, { quickAboveBytes: 1000 });
  assert.equal(r.mode, 'quick_check');
  assert.equal(r.ok, true);
});

test('runNightly: one bad database writes the FAILED marker; all good clears it', () => {
  const health = join(root, 'health');
  const state = join(root, 'state');
  const good = makeDb('g2.db');
  const bad = makeDb('b2.db');
  corrupt(bad);
  const base = { SHIN_HEALTH_DIR: health, WORKER_STATEDIR: state, SHIN_HEALTH_MAIL: 'off', SHIN_DISK_MIN_GB: '0' };
  const r1 = runNightly({ files: [good, bad], env: base });
  assert.equal(r1.ok, false);
  assert.ok(existsSync(join(health, 'integrity.FAILED')), 'integrity.FAILED must exist');
  assert.match(readFileSync(join(health, 'integrity.FAILED'), 'utf8'), /b2\.db/);
  const r2 = runNightly({ files: [good], env: base });
  assert.equal(r2.ok, true);
  assert.ok(!existsSync(join(health, 'integrity.FAILED')), 'a clean run clears the marker');
  assert.equal(JSON.parse(readFileSync(join(health, 'integrity.json'), 'utf8')).ok, true);
});

test('runNightly: low disk space writes disk.FAILED', () => {
  const health = join(root, 'health-disk');
  const r = runNightly({
    files: [],
    dataDir: root,
    env: { SHIN_HEALTH_DIR: health, WORKER_STATEDIR: join(root, 'state2'), SHIN_HEALTH_MAIL: 'off', SHIN_DISK_MIN_GB: '99999999' },
  });
  assert.equal(r.disk.ok, false);
  assert.ok(existsSync(join(health, 'disk.FAILED')));
});

test('CLI --dry-run opens nothing and writes no marker', () => {
  const health = join(root, 'health-dry');
  const p = makeDb('dry.db');
  corrupt(p);
  const r = spawnSync(process.execPath, [join(HERE, '..', 'nightly-checks.mjs'), '--dry-run', p], {
    env: { ...process.env, SHIN_HEALTH_DIR: health, SHIN_HEALTH_MAIL: 'off' },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /dry run/i);
  assert.ok(!existsSync(health));
});
