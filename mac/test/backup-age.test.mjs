// mac/test/backup-age.test.mjs
// Legal review 2026-11-26: nightly backup folders hold a copy of shoppers' device ids, so a folder older than
// SHIN_BACKUP_MAX_DAYS (default 15, at most 30) is deleted by age, the two newest are always kept, and the
// age rule also runs on a night that failed (the count rule does not).
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', '07-backup.sh');
const posix = (p) => String(p).split(String.fromCharCode(92)).join('/');
const root = mkdtempSync(join(tmpdir(), 'shin-backup-age-'));
after(() => rmSync(root, { recursive: true, force: true }));

const pad = (n) => String(n).padStart(2, '0');
/** A night folder name, `days` days ago (local time, as the script's own stamp is). */
function stamp(days) {
  const d = new Date(Date.now() - days * 86400e3);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function setup({ breakSource = false } = {}) {
  const dir = mkdtempSync(join(root, 'd-'));
  const data = join(dir, 'data');
  const backups = join(dir, 'backups');
  mkdirSync(data, { recursive: true });
  mkdirSync(backups, { recursive: true });
  const scans = join(data, 'scans.db');
  if (breakSource) writeFileSync(scans, 'this is not a database');
  else {
    const db = new DatabaseSync(scans);
    db.exec('CREATE TABLE scan (id INTEGER PRIMARY KEY, v TEXT)');
    db.close();
  }
  const cfg = join(dir, 'config.env');
  writeFileSync(cfg, `SHIN_DATA_DIR='${posix(data)}'\nSHIN_SCANS='${posix(scans)}'\nSHIN_BACKUP_DIR='${posix(backups)}'\n`);
  const env = {
    ...process.env,
    SHIN_CONFIG_FILE: posix(cfg),
    SHIN_HEALTH_DIR: posix(join(dir, 'health')),
    WORKER_STATEDIR: posix(join(dir, 'state')),
    SHIN_HEALTH_MAIL: 'off',
  };
  const old = (days) => {
    const name = stamp(days);
    mkdirSync(join(backups, name));
    writeFileSync(join(backups, name, 'manifest.tsv'), 'x');
    return join(backups, name);
  };
  const run = (extra = {}) => {
    const r = spawnSync('sh', [posix(SCRIPT), posix(cfg)], { encoding: 'utf8', cwd: dir, env: { ...env, ...extra } });
    return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
  };
  return { backups, old, run };
}

test('a night folder older than 15 days is deleted, one of 10 days is kept, and a stray folder is untouched', () => {
  const t = setup();
  const ancient = t.old(40);
  const sixteen = t.old(16);
  const ten = t.old(10);
  const other = join(t.backups, 'not-a-night');
  mkdirSync(other);
  const r = t.run();
  assert.equal(r.status, 0, r.out);
  assert.ok(!existsSync(ancient), '40-day-old backup survived');
  assert.ok(!existsSync(sixteen), '16-day-old backup survived');
  assert.ok(existsSync(ten), 'a 10-day-old backup was deleted');
  assert.ok(existsSync(other), 'a folder the script did not make was touched');
});

test('SHIN_BACKUP_MAX_DAYS moves the limit, and 30 is the ceiling', () => {
  const t = setup();
  const thirtyFive = t.old(35);
  const twenty = t.old(20);
  const r = t.run({ SHIN_BACKUP_MAX_DAYS: '365' });
  assert.equal(r.status, 0, r.out);
  assert.ok(!existsSync(thirtyFive), 'a 35-day-old backup survived a setting of 365');
  assert.ok(existsSync(twenty), 'a 20-day-old backup was deleted under a 30-day ceiling');
});

test('the age rule runs on a failed night too, and the two newest folders are always kept', () => {
  const t = setup({ breakSource: true });
  const a = t.old(50);
  const b = t.old(45);
  const c = t.old(40);
  const r = t.run();
  assert.notEqual(r.status, 0, 'the fixture night was meant to fail');
  // The failed night's own folder is the newest, so the 40-day one is the second newest and stays.
  assert.ok(!existsSync(a), 'the oldest backup survived a failed night');
  assert.ok(!existsSync(b), 'a 45-day-old backup survived a failed night');
  assert.ok(existsSync(c), 'the second-newest folder was deleted');
});
