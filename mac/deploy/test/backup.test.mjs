// mac/deploy/test/backup.test.mjs
//
// Item 1g. mac/07-backup.sh and mac/07-restore.sh are shell scripts, not
// exported functions, so unlike lib.test.mjs this drives them as real
// child processes -- the only way to test a shell script honestly. Every
// path used here is created fresh under node's own tmpdir and removed at
// the end; nothing here ever reads, writes or lists anything under a real
// SHIN_DATA_DIR or SHIN_BACKUP_DIR.
//
// Run: node --test mac/deploy/test/backup.test.mjs

import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAC_DIR = join(HERE, '..', '..'); // mac/deploy/test -> mac
const BACKUP_SH = join(MAC_DIR, '07-backup.sh');
const RESTORE_SH = join(MAC_DIR, '07-restore.sh');

// node:path's join() returns backslash-separated paths on this Windows
// test box; sh (both macOS /bin/sh and the Git Bash sh actually running
// these scripts here) is a POSIX shell, and every path handed to it below
// -- as a CLI argument or written into a sourced config.env -- goes
// through forward-slash form so it is never misread as escape sequences
// or split on the wrong separator.
//
// INCIDENT, 2026-09-28: before this function existed, config.env was
// written with raw backslash-separated paths. POSIX sh treats an
// unquoted backslash before an ordinary character as an escape sequence
// and drops it, so "C:\Users\x\...\backups" was read back as
// "C:Usersx...backups" -- a string with no separators left, which looks
// like a relative path. mac/07-backup.sh had no check that
// SHIN_BACKUP_DIR was absolute, so `mkdir -p` (and, worse, the pruning
// step's `rm -rf`) ran against that string relative to the test's launch
// directory, which was the repo root -- creating a dozen junk folders
// directly in C:\shin. Two independent fixes now cover this: this
// function stops a mangled path from ever being written in the first
// place, and mac/07-backup.sh / mac/07-restore.sh now refuse to treat
// SHIN_BACKUP_DIR as anything but an absolute path (see the "refuses a
// relative SHIN_BACKUP_DIR" test below) even if a caller's config.env is
// wrong. Every spawnSync call below also pins `cwd` to a fresh temp
// directory (SAFE_CWD, never this repo) as a third, independent line of
// defense: even a future bug in both of the above could at worst write
// into a throwaway folder outside the repo, never into C:\shin again.
function posix(p) {
  return String(p).replace(/\\/g, '/');
}

const SAFE_CWD = mkdtempSync(join(tmpdir(), 'shin-backup-test-cwd-'));
after(() => {
  rmSync(SAFE_CWD, { recursive: true, force: true });
});

// Health markers (R52/R16) and the state flag go to throwaway folders, and no mailbox message is
// ever sent from a test.
const SAFE_HEALTH = posix(join(SAFE_CWD, 'health'));
const SAFE_REQUEST_LOG = posix(join(SAFE_CWD, 'request-log.csv'));
writeFileSync(SAFE_REQUEST_LOG, 'received,from,kind,device_id,check,export_sent,deleted_on,revenuecat,answered_on,backups_clear_on,notes\n');
const TEST_ENV = {
  ...process.env,
  SHIN_HEALTH_DIR: SAFE_HEALTH,
  WORKER_STATEDIR: posix(join(SAFE_CWD, 'state')),
  SHIN_HEALTH_MAIL: 'off',
  SHIN_REQUEST_LOG: SAFE_REQUEST_LOG, // R58: restore re-runs deletions from this log (empty here)
};

function run(script, args) {
  const r = spawnSync('sh', [posix(script), ...args.map(posix)], { encoding: 'utf8', cwd: SAFE_CWD, env: TEST_ENV });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function makeSqlite(path, tableName, rowCount) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec(`CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY, v TEXT)`);
  const stmt = db.prepare(`INSERT INTO ${tableName} (v) VALUES (?)`);
  for (let i = 0; i < rowCount; i++) stmt.run(`row-${i}`);
  db.close();
}

function writeConfig(path, vars) {
  // Config values here are filesystem paths. On this Windows test box
  // node:path's join() returns backslash-separated paths, and POSIX sh
  // (both macOS /bin/sh and Git Bash's sh, which is what actually sources
  // this file) treats an unquoted backslash as an escape character, so
  // "C:\Users\x" would be read back as "C:Usersx" -- silently eating every
  // backslash. Forward slashes are accepted by both Git Bash and Windows
  // filesystem APIs, and are what config.env.example itself uses (real
  // macOS paths are forward-slash already), so this is the one place that
  // needs a POSIX-safe path for sh to source, not a Windows-native one.
  const lines = Object.entries(vars).map(([k, v]) => `${k}=${String(v).replace(/\\/g, '/')}`);
  writeFileSync(path, lines.join('\n') + '\n');
}

function setupFakeDeployment() {
  const root = mkdtempSync(join(tmpdir(), 'shin-backup-test-'));
  const dataDir = join(root, 'data');
  const backupDir = join(root, 'backups');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(backupDir, { recursive: true });

  const scansPath = join(dataDir, 'scans.db');
  const gapsPath = join(dataDir, 'gaps.db');
  makeSqlite(scansPath, 'scan', 7);
  makeSqlite(gapsPath, 'gap', 3);

  const photoDir = join(dataDir, 'photos', 'shelf', '2026-09-28', 'deviceA');
  mkdirSync(photoDir, { recursive: true });
  writeFileSync(join(photoDir, 'x.jpg'), 'fake jpeg bytes');

  const configPath = join(root, 'config.env');
  writeConfig(configPath, {
    SHIN_BACKUP_DIR: backupDir,
    SHIN_DATA_DIR: dataDir,
    SHIN_SCANS: scansPath,
    SHIN_GAPS: gapsPath,
    SHIN_PHOTOS: join(dataDir, 'photos'),
  });

  return { root, dataDir, backupDir, configPath, scansPath, gapsPath };
}

test('backup: green path -- two dbs and a photo folder, unconfigured stores skipped, exit 0', () => {
  const { root, backupDir, configPath } = setupFakeDeployment();
  try {
    const res = run(BACKUP_SH, [configPath]);
    assert.equal(res.status, 0, `backup should succeed:\n${res.stdout}\n${res.stderr}`);
    assert.match(res.stdout, /backed up scans .*tables: scan:7/);
    assert.match(res.stdout, /backed up gaps .*tables: gap:3/);
    assert.match(res.stdout, /backed up photos .*1 files/);
    assert.match(res.stderr, /SHIN_CORRECTIONS not set; skipping corrections/);

    const dirs = require_ls(backupDir);
    assert.equal(dirs.length, 1);
    const destDir = join(backupDir, dirs[0]);
    const manifest = readFileSync(join(destDir, 'manifest.tsv'), 'utf8');
    assert.match(manifest, /^database\tscans\tscans\.db\t\d+\tscan:7$/m);
    assert.match(manifest, /^database\tgaps\tgaps\.db\t\d+\tgap:3$/m);
    assert.match(manifest, /^folder\tphotos\tphotos\t\d+\tfiles:1$/m);
    assert.ok(existsSync(join(destDir, 'scans.db')));
    assert.ok(existsSync(join(destDir, 'photos', 'shelf', '2026-09-28', 'deviceA', 'x.jpg')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('backup: red path -- a configured but missing database exits non-zero and names it', () => {
  const { root, configPath, dataDir, backupDir } = setupFakeDeployment();
  try {
    const configPath2 = join(root, 'config-red.env');
    writeConfig(configPath2, {
      SHIN_BACKUP_DIR: backupDir,
      SHIN_DATA_DIR: dataDir,
      SHIN_SCANS: join(dataDir, 'scans.db'),
      SHIN_GAPS: join(dataDir, 'gaps.db'),
      SHIN_PHOTOS: join(dataDir, 'photos'),
      SHIN_CORRECTIONS: join(dataDir, 'corrections.db'), // never created -- must not exist
    });
    const res = run(BACKUP_SH, [configPath2]);
    assert.notEqual(res.status, 0, 'backup must exit non-zero when a configured database is missing');
    assert.match(res.stderr, /FAILED corrections .*does not exist/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('backup: the retired repeat cache is skipped when its file does not exist (Mac, 2026-11-21), and nothing else is lost', () => {
  const { root, configPath, dataDir, backupDir } = setupFakeDeployment();
  try {
    const cfg = join(root, 'config-repeat.env');
    writeConfig(cfg, {
      SHIN_BACKUP_DIR: backupDir,
      SHIN_DATA_DIR: dataDir,
      SHIN_SCANS: join(dataDir, 'scans.db'),
      SHIN_GAPS: join(dataDir, 'gaps.db'),
      SHIN_REPEAT_CACHE: join(dataDir, 'repeat-cache.db'), // retired, never created
    });
    const res = run(BACKUP_SH, [cfg]);
    assert.equal(res.status, 0, `a missing retired repeat cache must not fail the night:\n${res.stdout}\n${res.stderr}`);
    assert.doesNotMatch(res.stderr, /FAILED/);
    assert.match(res.stdout, /backed up scans/);
    const dest = join(backupDir, require_ls(backupDir)[0]);
    const manifest = readFileSync(join(dest, 'manifest.tsv'), 'utf8');
    assert.match(manifest, /^skipped\trepeat_cache\t.*retired/m);
    assert.doesNotMatch(manifest, /^failed/m);
    assert.equal(existsSync(join(dest, 'repeat-cache.db')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('backup: a repeat cache that does exist is still backed up', () => {
  const { root, dataDir, backupDir } = setupFakeDeployment();
  try {
    makeSqlite(join(dataDir, 'repeat-cache.db'), 'answer', 2);
    const cfg = join(root, 'config-repeat2.env');
    writeConfig(cfg, { SHIN_BACKUP_DIR: backupDir, SHIN_DATA_DIR: dataDir, SHIN_REPEAT_CACHE: join(dataDir, 'repeat-cache.db') });
    const res = run(BACKUP_SH, [cfg]);
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
    assert.match(res.stdout, /backed up repeat_cache .*tables: answer:2/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('backup: a missing database other than the repeat cache still fails the night (people)', () => {
  const { root, dataDir, backupDir } = setupFakeDeployment();
  try {
    const cfg = join(root, 'config-people.env');
    writeConfig(cfg, { SHIN_BACKUP_DIR: backupDir, SHIN_DATA_DIR: dataDir, SHIN_PEOPLE_DB: join(dataDir, 'people.db') });
    const res = run(BACKUP_SH, [cfg]);
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /FAILED people .*does not exist/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('mac scripts: no here-document inside $( ), which macOS /bin/sh (bash 3.2) cannot parse', () => {
  const macDir = MAC_DIR;
  const offenders = [];
  for (const f of readdirSync(macDir).filter((n) => n.endsWith('.sh'))) {
    const lines = readFileSync(join(macDir, f), 'utf8').split('\n');
    lines.forEach((l, i) => {
      if (/^\s*#/.test(l)) return;
      if (/\$\(\s*cat\s*<<|\$\([^)]*<<-?\s*['"]?[A-Za-z_]+['"]?\s*$/.test(l)) offenders.push(`${f}:${i + 1}: ${l.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('backup: refuses a relative SHIN_BACKUP_DIR instead of writing under the launch directory', () => {
  const { root, dataDir, scansPath, gapsPath } = setupFakeDeployment();
  try {
    const before = readdirSync(SAFE_CWD);
    const relConfig = join(root, 'config-relative.env');
    writeConfig(relConfig, {
      SHIN_BACKUP_DIR: 'some-relative-backup-dir', // the exact bug shape: no leading / or drive letter
      SHIN_DATA_DIR: dataDir,
      SHIN_SCANS: scansPath,
      SHIN_GAPS: gapsPath,
    });
    const res = run(BACKUP_SH, [relConfig]);
    assert.notEqual(res.status, 0, 'a relative SHIN_BACKUP_DIR must be refused, not silently resolved');
    assert.match(res.stderr, /SHIN_BACKUP_DIR must be an absolute path/);
    // Nothing named after the relative value may have been created in the
    // process's working directory (SAFE_CWD here; the repo root in the
    // incident this guards against).
    const after_ = readdirSync(SAFE_CWD);
    assert.deepEqual(after_, before, 'backup must not create anything in the working directory for a rejected SHIN_BACKUP_DIR');
    assert.ok(!existsSync(join(SAFE_CWD, 'some-relative-backup-dir')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('restore: refuses a relative SHIN_BACKUP_DIR too', () => {
  const { root, dataDir } = setupFakeDeployment();
  try {
    const relConfig = join(root, 'config-relative.env');
    writeConfig(relConfig, {
      SHIN_BACKUP_DIR: 'some-relative-backup-dir',
      SHIN_DATA_DIR: dataDir,
    });
    const target = join(root, 'restore-target');
    const res = run(RESTORE_SH, ['20260101-000000', target, relConfig]);
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /SHIN_BACKUP_DIR must be an absolute path/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('backup: SHIN_BACKUP_DIR unset exits non-zero before touching anything', () => {
  const root = mkdtempSync(join(tmpdir(), 'shin-backup-test-'));
  try {
    const configPath = join(root, 'config-empty.env');
    writeFileSync(configPath, '# nothing set\n');
    const res = run(BACKUP_SH, [configPath]);
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /SHIN_BACKUP_DIR is not set/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('restore: round-trip verifies row counts and file content against the manifest', () => {
  const { root, backupDir, configPath, dataDir } = setupFakeDeployment();
  try {
    const backupRes = run(BACKUP_SH, [configPath]);
    assert.equal(backupRes.status, 0);
    const destDir = join(backupDir, require_ls(backupDir)[0]);

    const restoreTarget = join(root, 'restore');
    const restoreRes = run(RESTORE_SH, [destDir, restoreTarget, configPath]);
    assert.equal(restoreRes.status, 0, `restore should succeed:\n${restoreRes.stdout}\n${restoreRes.stderr}`);
    assert.match(restoreRes.stdout, /OK scans \(scans\.db\): scan:7/);
    assert.match(restoreRes.stdout, /OK gaps \(gaps\.db\): gap:3/);
    assert.match(restoreRes.stdout, /OK photos \(photos\): 1 files/);
    assert.match(restoreRes.stdout, /3 item\(s\) verified/);

    const original = readFileSync(join(dataDir, 'photos', 'shelf', '2026-09-28', 'deviceA', 'x.jpg'));
    const restored = readFileSync(join(restoreTarget, 'photos', 'shelf', '2026-09-28', 'deviceA', 'x.jpg'));
    assert.deepEqual(original, restored);

    const db = new DatabaseSync(join(restoreTarget, 'scans.db'), { readOnly: true });
    const row = db.prepare('SELECT COUNT(*) AS c FROM scan').get();
    assert.equal(row.c, 7);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('restore: refuses a non-empty target', () => {
  const { root, backupDir, configPath } = setupFakeDeployment();
  try {
    const backupRes = run(BACKUP_SH, [configPath]);
    assert.equal(backupRes.status, 0);
    const destDir = join(backupDir, require_ls(backupDir)[0]);

    const nonEmpty = join(root, 'nonempty');
    mkdirSync(nonEmpty, { recursive: true });
    writeFileSync(join(nonEmpty, 'already-here.txt'), 'x');

    const res = run(RESTORE_SH, [destDir, nonEmpty, configPath]);
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /refusing to restore into a non-empty target/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('restore: refuses the live SHIN_DATA_DIR as a target', () => {
  const { root, backupDir, configPath, dataDir } = setupFakeDeployment();
  try {
    const backupRes = run(BACKUP_SH, [configPath]);
    assert.equal(backupRes.status, 0);
    const destDir = join(backupDir, require_ls(backupDir)[0]);

    const res = run(RESTORE_SH, [destDir, dataDir, configPath]);
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /refusing to restore over the live SHIN_DATA_DIR/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('backup: keeps only the newest 14 timestamped backups inside SHIN_BACKUP_DIR', () => {
  const { root, backupDir, configPath } = setupFakeDeployment();
  try {
    // Seed 16 fake timestamp-named folders, oldest to newest by name.
    for (let i = 0; i < 16; i++) {
      const name = `20260101-0000${String(i).padStart(2, '0')}`;
      const dir = join(backupDir, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'manifest.tsv'), '# fake\n');
    }
    // A folder that does NOT match the timestamp pattern must never be touched.
    mkdirSync(join(backupDir, 'not-a-backup'), { recursive: true });
    writeFileSync(join(backupDir, 'not-a-backup', 'keepme.txt'), 'x');

    const res = run(BACKUP_SH, [configPath]);
    assert.equal(res.status, 0);

    const remaining = require_ls(backupDir);
    const timestamped = remaining.filter((d) => /^\d{8}-\d{6}$/.test(d));
    assert.equal(timestamped.length, 14, `expected 14 timestamped dirs, got ${timestamped.length}: ${timestamped.join(', ')}`);
    assert.ok(remaining.includes('not-a-backup'), 'a non-matching folder must never be pruned');
    assert.ok(existsSync(join(backupDir, 'not-a-backup', 'keepme.txt')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- R52 / R16: the backup says loudly when it worked and when it did not ----

import { corruptSecondPage, healthState } from './backup-helpers.mjs';

test('backup: success writes backup.json ok and leaves no backup.FAILED', () => {
  const { root, configPath } = setupFakeDeployment();
  try {
    rmSync(SAFE_HEALTH, { recursive: true, force: true });
    const res = run(BACKUP_SH, [configPath]);
    assert.equal(res.status, 0, res.stderr);
    const h = healthState(SAFE_HEALTH, 'backup');
    assert.equal(h.ok, true);
    assert.equal(h.failedFileExists, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('backup: a missing database leaves backup.FAILED that names the job', () => {
  const { root, dataDir, backupDir } = setupFakeDeployment();
  try {
    rmSync(SAFE_HEALTH, { recursive: true, force: true });
    const cfg = join(root, 'config-missing.env');
    writeConfig(cfg, { SHIN_BACKUP_DIR: backupDir, SHIN_DATA_DIR: dataDir, SHIN_SCANS: join(dataDir, 'scans.db'), SHIN_CORRECTIONS: join(dataDir, 'corrections.db') });
    const res = run(BACKUP_SH, [cfg]);
    assert.notEqual(res.status, 0);
    const h = healthState(SAFE_HEALTH, 'backup');
    assert.equal(h.failedFileExists, true);
    assert.match(h.failedText, /backup FAILED/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('backup: SHIN_BACKUP_DIR unset still leaves backup.FAILED (an early exit is not silence)', () => {
  const root = mkdtempSync(join(tmpdir(), 'shin-backup-test-'));
  try {
    rmSync(SAFE_HEALTH, { recursive: true, force: true });
    const cfg = join(root, 'config-empty.env');
    writeFileSync(cfg, '# nothing set\n');
    const res = run(BACKUP_SH, [cfg]);
    assert.notEqual(res.status, 0);
    assert.equal(healthState(SAFE_HEALTH, 'backup').failedFileExists, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('backup: a damaged source database fails the backup and is named (integrity_check before and after the copy)', () => {
  const { root, configPath, scansPath } = setupFakeDeployment();
  try {
    rmSync(SAFE_HEALTH, { recursive: true, force: true });
    corruptSecondPage(scansPath);
    const res = run(BACKUP_SH, [configPath]);
    assert.notEqual(res.status, 0, `a damaged database must fail the backup:\n${res.stdout}\n${res.stderr}`);
    assert.match(res.stderr, /FAILED scans/);
    assert.equal(healthState(SAFE_HEALTH, 'backup').failedFileExists, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('backup: a failed night does not prune, so it cannot push the last good backups out', () => {
  const { root, backupDir, dataDir } = setupFakeDeployment();
  try {
    for (let i = 0; i < 14; i++) {
      const dir = join(backupDir, `20260101-0000${String(i).padStart(2, '0')}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'manifest.tsv'), '# fake\n');
    }
    const cfg = join(root, 'config-fail.env');
    writeConfig(cfg, { SHIN_BACKUP_DIR: backupDir, SHIN_DATA_DIR: dataDir, SHIN_SCANS: join(dataDir, 'scans.db'), SHIN_CORRECTIONS: join(dataDir, 'corrections.db') });
    const res = run(BACKUP_SH, [cfg]);
    assert.notEqual(res.status, 0);
    const stamped = require_ls(backupDir).filter((d) => /^\d{8}-\d{6}$/.test(d));
    assert.equal(stamped.length, 15, 'the 14 old ones are all still there plus the partial one');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- R58: a restore re-runs the deletions already honoured ----

function runWithEnv(script, args, extraEnv) {
  const r = spawnSync('sh', [posix(script), ...args.map(posix)], { encoding: 'utf8', cwd: SAFE_CWD, env: { ...TEST_ENV, ...extraEnv } });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

test('restore: re-runs a recent deletion against the restored copy, so a deleted phone does not come back', () => {
  const { root, backupDir, configPath, scansPath } = setupFakeDeployment();
  try {
    const db = new DatabaseSync(scansPath);
    db.exec('ALTER TABLE scan ADD COLUMN device_id TEXT');
    db.exec("INSERT INTO scan(device_id) VALUES ('idDELETEDphone1'), ('idKEEPphone999')");
    db.close();
    assert.equal(run(BACKUP_SH, [configPath]).status, 0);
    const today = new Date().toISOString().slice(0, 10);
    const log = join(root, 'log.csv');
    writeFileSync(log, `received,from,kind,device_id,deleted_on\n${today},a@x.com,delete,idDELETEDphone1,${today}\n`);
    const target = join(root, 'restored');
    const res = runWithEnv(RESTORE_SH, [require_ls(backupDir)[0], target, configPath], { SHIN_REQUEST_LOG: posix(log) });
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
    const out = new DatabaseSync(join(target, 'scans.db'), { readOnly: true });
    const left = out.prepare('SELECT device_id FROM scan WHERE device_id IS NOT NULL').all().map((r) => r.device_id);
    out.close();
    assert.deepEqual(left, ['idKEEPphone999']);
    assert.match(res.stdout, /re-ran 1 deletion/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('restore: a missing request log means nobody has asked for a deletion yet, so the restore still completes (and says so)', () => {
  const { root, backupDir, configPath } = setupFakeDeployment();
  try {
    assert.equal(run(BACKUP_SH, [configPath]).status, 0);
    const res = runWithEnv(RESTORE_SH, [require_ls(backupDir)[0], join(root, 'restored'), configPath], { SHIN_REQUEST_LOG: posix(join(root, 'nope.csv')) });
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
    assert.match(res.stdout, /no request log/i);
    assert.match(res.stdout, /OK -- \d+ item\(s\) verified/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('restore: SHIN_RESTORE_SKIP_REDELETE=1 skips it, and says so loudly', () => {
  const { root, backupDir, configPath } = setupFakeDeployment();
  try {
    assert.equal(run(BACKUP_SH, [configPath]).status, 0);
    const res = runWithEnv(RESTORE_SH, [require_ls(backupDir)[0], join(root, 'restored'), configPath], {
      SHIN_REQUEST_LOG: posix(join(root, 'nope.csv')),
      SHIN_RESTORE_SKIP_REDELETE: '1',
    });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stderr, /NOT re-running deletions/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function require_ls(dir) {
  // Named this way only so the intent ("list backup timestamp dirs") reads
  // clearly at each call site above.
  return readdirSync(dir);
}
