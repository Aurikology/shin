// mac/test/offsite.test.mjs
// R07 + R52: mac/14-offsite-backup.sh (encrypted off-site copy) and mac/15-restore-test.sh (prove it restores).
// restic is replaced by a small fake that copies folders, so what is tested here is OUR script's logic:
// what it passes to restic, when it refuses, and that every failure leaves a marker. The real restic's
// encryption and repository format are not tested here (they are restic's own).
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, utimesSync, openSync, writeSync, closeSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAC = join(HERE, '..');
const posix = (p) => String(p).replace(/\\/g, '/');
const root = mkdtempSync(join(tmpdir(), 'shin-offsite-test-'));
after(() => rmSync(root, { recursive: true, force: true }));

const FAKE_RESTIC = `#!/bin/sh
echo "$@" >> "$FAKE_RESTIC_LOG"
cmd=$1
shift
if [ "\${FAKE_RESTIC_FAIL:-}" = "$cmd" ]; then
  echo "fake restic: $cmd is set to fail" >&2
  exit 1
fi
case "$cmd" in
  init) mkdir -p "$FAKE_REPO"; exit 0 ;;
  backup)
    [ -d "$FAKE_REPO" ] || { echo "fake restic: no repository" >&2; exit 1; }
    rm -rf "$FAKE_REPO/snap"; mkdir -p "$FAKE_REPO/snap"; cp -Rp . "$FAKE_REPO/snap/"; exit 0 ;;
  check|forget) exit 0 ;;
  restore)
    T=''
    while [ $# -gt 0 ]; do
      if [ "$1" = "--target" ]; then T=$2; fi
      shift
    done
    [ -d "$FAKE_REPO/snap" ] || { echo "fake restic: no snapshot" >&2; exit 1; }
    mkdir -p "$T/nightly/20261118-040000"; cp -Rp "$FAKE_REPO/snap/." "$T/nightly/20261118-040000/"; exit 0 ;;
esac
exit 0
`;

function makeDb(path, rows) {
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE scan (id INTEGER PRIMARY KEY, v TEXT)');
  db.exec('BEGIN');
  for (let i = 0; i < rows; i++) db.prepare('INSERT INTO scan (v) VALUES (?)').run('r' + i + 'x'.repeat(60));
  db.exec('COMMIT');
  db.close();
}

/** A deployment with one night of backup already taken by the real mac/07-backup.sh. */
function setup() {
  const dir = mkdtempSync(join(root, 'd-'));
  const data = join(dir, 'data');
  const backups = join(dir, 'backups');
  const repo = join(dir, 'repo');
  mkdirSync(data, { recursive: true });
  mkdirSync(backups, { recursive: true });
  makeDb(join(data, 'scans.db'), 400);
  const pw = join(dir, 'restic.pw');
  writeFileSync(pw, 'correct horse battery staple\n');
  const fake = join(dir, 'restic');
  writeFileSync(fake, FAKE_RESTIC);
  chmodSync(fake, 0o755);
  const cfg = join(dir, 'config.env');
  const lines = {
    SHIN_DATA_DIR: data,
    SHIN_SCANS: join(data, 'scans.db'),
    SHIN_BACKUP_DIR: backups,
    SHIN_RESTIC_REPOSITORY: repo,
    SHIN_RESTIC_PASSWORD_FILE: pw,
    RESTIC_BIN: fake,
  };
  writeFileSync(cfg, Object.entries(lines).map(([k, v]) => `${k}='${posix(v)}'`).join('\n') + '\n');
  const health = join(dir, 'health');
  const env = {
    ...process.env,
    SHIN_CONFIG_FILE: posix(cfg),
    SHIN_HEALTH_DIR: posix(health),
    WORKER_STATEDIR: posix(join(dir, 'state')),
    SHIN_HEALTH_MAIL: 'off',
    SHIN_REQUEST_LOG: posix(join(dir, 'none.csv')),
    FAKE_REPO: posix(repo),
    FAKE_RESTIC_LOG: posix(join(dir, 'restic.log')),
    SHIN_RESTORE_TEST_DIR: posix(join(dir, 'scratch')),
  };
  const sh = (script, args = [], extra = {}) => {
    const r = spawnSync('sh', [posix(join(MAC, script)), ...args], { encoding: 'utf8', cwd: dir, env: { ...env, ...extra } });
    return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
  const b = sh('07-backup.sh', [posix(cfg)]);
  assert.equal(b.status, 0, 'fixture backup: ' + b.out);
  const calls = () => (existsSync(env.FAKE_RESTIC_LOG) ? readFileSync(env.FAKE_RESTIC_LOG, 'utf8').trim().split('\n') : []);
  const marker = (job) => ({
    failed: existsSync(join(health, `${job}.FAILED`)),
    json: existsSync(join(health, `${job}.json`)) ? JSON.parse(readFileSync(join(health, `${job}.json`), 'utf8')) : null,
    text: existsSync(join(health, `${job}.FAILED`)) ? readFileSync(join(health, `${job}.FAILED`), 'utf8') : '',
  });
  return { dir, data, backups, repo, pw, cfg, env, sh, calls, marker, health };
}

test('offsite --dry-run says what it would do and calls restic never', () => {
  const t = setup();
  const r = t.sh('14-offsite-backup.sh', ['--dry-run']);
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /would copy .*\/backups\/\d{8}-\d{6}/);
  assert.equal(t.calls().length, 0);
  assert.equal(t.marker('offsite').json, null, 'a dry run writes no marker');
});

test('offsite: copies the newest nightly backup, checks it, prunes to 15 days, and marks success', () => {
  const t = setup();
  assert.equal(t.sh('14-offsite-backup.sh', ['--init']).status, 0);
  const r = t.sh('14-offsite-backup.sh');
  assert.equal(r.status, 0, r.out);
  const calls = t.calls();
  assert.ok(calls.some((c) => c.startsWith('backup . ') && /--tag shin-nightly/.test(c)), calls.join('\n'));
  assert.ok(calls.some((c) => c === 'check'));
  // off-site retention: the privacy policy says about 15 days, so the off-site repository keeps 15 days and nothing longer
  const forget = calls.find((c) => /^forget /.test(c));
  assert.ok(forget && /--keep-within 15d\b/.test(forget) && /--prune/.test(forget), forget);
  assert.doesNotMatch(forget, /--keep-(daily|weekly|monthly|yearly|last|hourly)/, 'no longer-lived keep rule');
  assert.ok(existsSync(join(t.repo, 'snap', 'scans.db')), 'the snapshot holds the database');
  assert.equal(t.marker('offsite').json.ok, true);
  assert.equal(t.marker('offsite').failed, false);
});

test('offsite: restic backup failing leaves offsite.FAILED and does NOT prune', () => {
  const t = setup();
  const r = t.sh('14-offsite-backup.sh', [], { FAKE_RESTIC_FAIL: 'backup' });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /restic backup failed/);
  assert.equal(t.marker('offsite').failed, true);
  assert.ok(!t.calls().some((c) => c.startsWith('forget')), 'never prune after a failed copy');
});

test('offsite: a failed repository check stops before pruning', () => {
  const t = setup();
  t.sh('14-offsite-backup.sh', ['--init']);
  const r = t.sh('14-offsite-backup.sh', [], { FAKE_RESTIC_FAIL: 'check' });
  assert.notEqual(r.status, 0);
  assert.equal(t.marker('offsite').failed, true);
  assert.ok(!t.calls().some((c) => c.startsWith('forget')));
});

test('offsite: last night\'s backup missing (manifest 3 days old) fails loudly and copies nothing', () => {
  const t = setup();
  const night = readdirSync(t.backups)[0];
  const old = new Date(Date.now() - 3 * 86400e3);
  utimesSync(join(t.backups, night, 'manifest.tsv'), old, old);
  const r = t.sh('14-offsite-backup.sh');
  assert.notEqual(r.status, 0);
  assert.match(r.out, /older than 36 hours/);
  assert.equal(t.marker('offsite').failed, true);
  assert.ok(!t.calls().some((c) => c.startsWith('backup')));
});

test('offsite: no password file means no copy, and a marker', () => {
  const t = setup();
  rmSync(t.pw);
  const r = t.sh('14-offsite-backup.sh');
  assert.notEqual(r.status, 0);
  assert.match(r.out, /password file .* does not exist/);
  assert.equal(t.marker('offsite').failed, true);
  assert.equal(t.calls().length, 0);
});

test('offsite: a backup folder with no manifest (a half-finished night) is never copied', () => {
  const t = setup();
  const night = readdirSync(t.backups)[0];
  rmSync(join(t.backups, night, 'manifest.tsv'));
  const r = t.sh('14-offsite-backup.sh');
  assert.notEqual(r.status, 0);
  assert.match(r.out, /no manifest\.tsv/);
  assert.equal(t.marker('offsite').failed, true);
});

function offsiteThenTest() {
  const t = setup();
  assert.equal(t.sh('14-offsite-backup.sh', ['--init']).status, 0);
  assert.equal(t.sh('14-offsite-backup.sh').status, 0);
  return t;
}

test('restore-test: restores the newest copy, verifies it, removes the temp folder, marks success', () => {
  const t = offsiteThenTest();
  const r = t.sh('15-restore-test.sh');
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /1 of 1 databases ok/);
  assert.equal(t.marker('restore-test').json.ok, true);
  assert.equal(t.marker('restore-test').failed, false);
  assert.deepEqual(readdirSync(join(t.dir, 'scratch')), [], 'the restored shopper data is deleted afterwards');
  assert.ok(t.calls().some((c) => /^restore latest .*--tag shin-nightly/.test(c)));
});

test('restore-test: a damaged database inside the off-site copy FAILS the test, loudly, and still cleans up', () => {
  const t = offsiteThenTest();
  const fd = openSync(join(t.repo, 'snap', 'scans.db'), 'r+');
  writeSync(fd, Buffer.alloc(4096, 0xff), 0, 4096, 4096 * 2);
  closeSync(fd);
  const r = t.sh('15-restore-test.sh');
  assert.notEqual(r.status, 0, r.out);
  assert.equal(t.marker('restore-test').failed, true);
  assert.deepEqual(readdirSync(join(t.dir, 'scratch')), []);
});

test('restore-test: a snapshot older than 48 hours means the nightly copy stopped, and fails', () => {
  const t = offsiteThenTest();
  const old = new Date(Date.now() - 3 * 86400e3);
  utimesSync(join(t.repo, 'snap', 'manifest.tsv'), old, old);
  const r = t.sh('15-restore-test.sh');
  assert.notEqual(r.status, 0);
  assert.match(r.out, /older than 48 hours/);
  assert.equal(t.marker('restore-test').failed, true);
});

test('restore-test: restic restore failing is a failure, not a skip', () => {
  const t = offsiteThenTest();
  const r = t.sh('15-restore-test.sh', [], { FAKE_RESTIC_FAIL: 'restore' });
  assert.notEqual(r.status, 0);
  assert.equal(t.marker('restore-test').failed, true);
});

test('restore-test --dry-run changes nothing', () => {
  const t = offsiteThenTest();
  const before = t.calls().length;
  const r = t.sh('15-restore-test.sh', ['--dry-run']);
  assert.equal(r.status, 0, r.out);
  assert.equal(t.calls().length, before);
  assert.equal(t.marker('restore-test').json, null);
});
