// mac/test/rotate-logs.test.mjs
// R10: mac/16-rotate-logs.sh rotates the server output logs and keeps 14 days.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, utimesSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', '16-rotate-logs.sh');
const posix = (p) => String(p).replace(/\\/g, '/');
const root = mkdtempSync(join(tmpdir(), 'shin-rotate-test-'));
after(() => rmSync(root, { recursive: true, force: true }));

const ago = (days) => new Date(Date.now() - days * 86400e3);

function setup() {
  const dir = mkdtempSync(join(root, 't-'));
  const logs = join(dir, 'logs');
  mkdirSync(logs);
  const health = join(dir, 'health');
  const cfg = join(dir, 'config.env');
  writeFileSync(cfg, `SHIN_LOG_DIRS='${posix(logs)}'\n`);
  const env = {
    ...process.env,
    SHIN_CONFIG_FILE: posix(cfg),
    SHIN_HEALTH_DIR: posix(health),
    WORKER_STATEDIR: posix(join(dir, 'state')),
    SHIN_HEALTH_MAIL: 'off',
  };
  const run = (args = [], extra = {}) => {
    const r = spawnSync('sh', [posix(SCRIPT), ...args], { encoding: 'utf8', cwd: dir, env: { ...env, ...extra } });
    return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
  };
  const marker = (job) => ({
    failed: existsSync(join(health, `${job}.FAILED`)),
    json: existsSync(join(health, `${job}.json`)) ? JSON.parse(readFileSync(join(health, `${job}.json`), 'utf8')) : null,
  });
  return { dir, logs, run, marker };
}

test('rotates a non-empty log: copy gzipped, original emptied but still there, other files untouched', () => {
  const t = setup();
  const body = 'line one\nline two\n'.repeat(500);
  writeFileSync(join(t.logs, 'server.out.log'), body);
  writeFileSync(join(t.logs, 'server.err.log'), '');
  writeFileSync(join(t.logs, 'notes.txt'), 'not a log');
  const r = t.run();
  assert.equal(r.status, 0, r.out);
  assert.equal(statSync(join(t.logs, 'server.out.log')).size, 0, 'the live file is emptied in place (launchd keeps its handle)');
  const gz = readdirSync(t.logs).filter((f) => /^server\.out\.log\..+\.gz$/.test(f));
  assert.equal(gz.length, 1);
  assert.equal(gunzipSync(readFileSync(join(t.logs, gz[0]))).toString(), body, 'nothing lost in the copy');
  assert.equal(readdirSync(t.logs).filter((f) => f.startsWith('server.err.log.')).length, 0, 'an empty log is not rotated');
  assert.equal(readFileSync(join(t.logs, 'notes.txt'), 'utf8'), 'not a log');
  assert.equal(t.marker('logrotate').json.ok, true);
});

test('keeps 14 days: older archives deleted, a 13-day-old one kept', () => {
  const t = setup();
  const mk = (name, days) => {
    const p = join(t.logs, name);
    writeFileSync(p, 'x');
    utimesSync(p, ago(days), ago(days));
  };
  mk('server.out.log.20261001-050000.gz', 20);
  mk('server.out.log.20261104-050000.gz', 14.5);
  mk('server.out.log.20261105-050000.gz', 13.5);
  mk('server.out.log.20261113-050000.gz', 5);
  writeFileSync(join(t.logs, 'server.out.log'), 'today');
  const r = t.run();
  assert.equal(r.status, 0, r.out);
  const left = readdirSync(t.logs).filter((f) => f.endsWith('.gz')).map((f) => f.slice(15, 23));
  assert.ok(!left.includes('20261001') && !left.includes('20261104'), 'archives of 14 days or more are gone: ' + left);
  assert.ok(left.includes('20261105') && left.includes('20261113'), 'younger archives are kept: ' + left);
});

test('never deletes anything that is not a rotated archive, however old', () => {
  const t = setup();
  const p = join(t.logs, 'important.db');
  writeFileSync(p, 'data');
  utimesSync(p, ago(400), ago(400));
  const q = join(t.logs, 'server.out.log');
  writeFileSync(q, 'live');
  utimesSync(q, ago(400), ago(400));
  const r = t.run();
  assert.equal(r.status, 0, r.out);
  assert.ok(existsSync(p));
  assert.ok(existsSync(q), 'the live log file itself is never removed');
});

test('--dry-run lists what it would do and changes nothing, writes no marker', () => {
  const t = setup();
  writeFileSync(join(t.logs, 'server.out.log'), 'hello');
  const old = join(t.logs, 'server.out.log.20260101-050000.gz');
  writeFileSync(old, 'x');
  utimesSync(old, ago(60), ago(60));
  const r = t.run(['--dry-run']);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /would rotate .*server\.out\.log/);
  assert.match(r.out, /would delete .*20260101/);
  assert.equal(readFileSync(join(t.logs, 'server.out.log'), 'utf8'), 'hello');
  assert.ok(existsSync(old));
  assert.equal(t.marker('logrotate').json, null);
});

test('a log folder that does not exist fails loudly (marker), it is not silently skipped', () => {
  const t = setup();
  rmSync(t.logs, { recursive: true });
  const r = t.run();
  assert.notEqual(r.status, 0);
  assert.match(r.out, /does not exist/);
  assert.equal(t.marker('logrotate').failed, true);
});

test('keep-days can be changed with SHIN_LOG_KEEP_DAYS', () => {
  const t = setup();
  const p = join(t.logs, 'server.out.log.20261101-050000.gz');
  writeFileSync(p, 'x');
  utimesSync(p, ago(5), ago(5));
  const r = t.run([], { SHIN_LOG_KEEP_DAYS: '3' });
  assert.equal(r.status, 0, r.out);
  assert.ok(!existsSync(p));
});

test('legal 2026-11-26: no setting keeps an archive past the 90 days the privacy document promises', () => {
  const t = setup();
  const mk = (name, days) => {
    const p = join(t.logs, name);
    writeFileSync(p, 'x');
    utimesSync(p, ago(days), ago(days));
    return p;
  };
  const old = mk('server.out.log.20260801-050000.gz', 95);
  const inside = mk('server.out.log.20261001-050000.gz', 60);
  const r = t.run([], { SHIN_LOG_KEEP_DAYS: '400' });
  assert.equal(r.status, 0, r.out);
  assert.ok(!existsSync(old), 'an archive 95 days old survived SHIN_LOG_KEEP_DAYS=400');
  assert.ok(existsSync(inside), 'a 60-day-old archive was deleted');
});
