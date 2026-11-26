// Tests for linux/ (the OVH VPS setup): the HTTPS alert sender, and that the generated files and the
// units still point at real files in the repo. None of this needs systemd or a Linux box.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { buildRequests, jobFromUnit, sendAlert } from '../../linux/alert.mjs';
import { parseEnv } from '../../linux/deploy.mjs';

const REPO = join(import.meta.dirname, '..', '..');
const mkEnv = (extra = {}) => ({ SHIN_HEALTH_DIR: mkdtempSync(join(tmpdir(), 'pexi-alert-')), ...extra });
const okFetch = (calls) => async (url, init) => (calls.push({ url, init }), { status: 200 });

test('a failure goes to the Healthchecks fail address for that job, with the detail as the body', async () => {
  const calls = [];
  const env = mkEnv({ SHIN_HC_PING_KEY: 'KEY123' });
  const r = await sendAlert({ job: 'backup', ok: false, detail: 'disk full', env, fetchFn: okFetch(calls) });
  assert.equal(r.code, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://hc-ping.com/KEY123/pexi-backup/fail?create=1');
  assert.match(calls[0].init.body, /FAILED backup .*disk full/);
});

test('the other route gets a POST with a Title; both routes are used when both are set', () => {
  const reqs = buildRequests({ job: 'kroger', ok: false, detail: 'x', host: 'h', env: { SHIN_HC_PING_KEY: 'K', SHIN_ALERT_URL: 'https://ntfy.sh/pexi-t' } });
  assert.deepEqual(reqs.map((r) => r.route), ['healthchecks', 'url']);
  assert.equal(reqs[1].init.headers.Title, 'Pexi FAILED: kroger');
});

test('NO route configured is loud: exit code 3 and a message that names the setting', async () => {
  const r = await sendAlert({ job: 'backup', ok: false, detail: 'd', env: mkEnv(), fetchFn: async () => assert.fail('must not call the network') });
  assert.equal(r.code, 3);
  assert.match(r.message, /NO ALERT ROUTE.*SHIN_HC_PING_KEY/);
});

test('a route that is down is reported as not delivered (exit 1), never as sent', async () => {
  const r = await sendAlert({ job: 'backup', ok: false, detail: 'd', env: mkEnv({ SHIN_HC_PING_KEY: 'K' }), retryMs: 0, fetchFn: async () => ({ status: 500 }) });
  assert.equal(r.code, 1);
  assert.match(r.message, /not delivered.*HTTP 500/);
});

test('a recovery is sent only after a failure was sent, and only once', async () => {
  const calls = [];
  const env = mkEnv({ SHIN_HC_PING_KEY: 'K' });
  const none = await sendAlert({ job: 'offsite', ok: true, env, fetchFn: okFetch(calls) });
  assert.equal(none.code, 0);
  assert.equal(calls.length, 0, 'nothing to clear, so no network call');
  await sendAlert({ job: 'offsite', ok: false, detail: 'd', env, fetchFn: okFetch(calls) });
  await sendAlert({ job: 'offsite', ok: true, env, fetchFn: okFetch(calls) });
  await sendAlert({ job: 'offsite', ok: true, env, fetchFn: okFetch(calls) });
  assert.deepEqual(calls.map((c) => c.url.replace(/^.*pexi-/, '')), ['offsite/fail?create=1', 'offsite?create=1']);
});

test('unit names map to job names, and bad job names are refused', () => {
  assert.equal(jobFromUnit('pexi-backup.service'), 'backup');
  assert.equal(jobFromUnit('pexi-tunnel.service'), 'tunnel');
  assert.throws(() => buildRequests({ job: 'Bad Name', ok: false, env: {} }), /bad job name/);
  assert.throws(() => buildRequests({ job: 'x', ok: false, env: { SHIN_ALERT_URL: 'http://plain.example/' } }), /https/);
});

test('mac/lib/health.mjs sends the HTTPS alert for a failure when a route is set (the CLI path every mac job uses)', () => {
  // The sender is spawned with the real node; with no network the call fails, which must show as "https alert failed",
  // not as silence. SHIN_HEALTH_MAIL=off so no mailbox is touched.
  const dir = mkdtempSync(join(tmpdir(), 'pexi-health-'));
  const r = spawnSync(process.execPath, [join(REPO, 'mac', 'lib', 'health.mjs'), 'fail', 'backup', 'test failure'], {
    env: { ...process.env, SHIN_HEALTH_DIR: dir, WORKER_STATEDIR: join(dir, 's'), SHIN_HEALTH_MAIL: 'off', SHIN_ALERT_URL: 'https://127.0.0.1:9/none' },
    encoding: 'utf8',
    timeout: 90e3,
  });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /FAILED recorded \(https alert (sent|failed \(1\)); mail off\)/);
  assert.ok(existsSync(join(dir, 'backup.FAILED')));
});

test('the env file parser reads what systemd reads and keeps quotes out of values', () => {
  assert.deepEqual(parseEnv('PORT=4173\n# c\nSHIN_X="a b"\n\nbad line\nY=\n'), { PORT: '4173', SHIN_X: 'a b', Y: '' });
});

test('the generated files are current (run node linux/make-env-example.mjs / make-units.mjs when this fails)', () => {
  for (const script of ['make-env-example.mjs', 'make-units.mjs']) {
    const r = spawnSync(process.execPath, [join(REPO, 'linux', script), '--check'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  }
});

test('every settings variable is in the env template (the code can read nothing the template does not name)', async () => {
  const { SETTINGS } = await import('../../settings/src/index.ts');
  const text = readFileSync(join(REPO, 'linux', 'pexi.env.example'), 'utf8');
  const missing = SETTINGS.filter((s) => !new RegExp(`^#? ?${s.env}=`, 'm').test(text)).map((s) => s.env);
  assert.deepEqual(missing, []);
  // names only: no value after = for a secret
  for (const s of SETTINGS.filter((x) => x.secret)) assert.match(text, new RegExp(`^${s.env}=$`, 'm'), `${s.env} must be blank in the template`);
});

test('every unit runs a file that exists in the repo, and every enabled timer has its service', () => {
  const dir = join(REPO, 'linux', 'systemd');
  const names = readdirSync(dir);
  for (const f of names.filter((n) => n.endsWith('.service'))) {
    const text = readFileSync(join(dir, f), 'utf8');
    for (const m of text.matchAll(/^Exec(?:Start|StartPost|StopPost)=-?(?:\S*flock -n -E 0 \S+ )?(?:\/bin\/sh |\/usr\/local\/bin\/node )?(\/opt\/pexi\/live\/\S+)/gm)) {
      assert.ok(existsSync(join(REPO, m[1].replace('/opt/pexi/live/', ''))), `${f} runs ${m[1]}, which is not in the repo`);
    }
  }
  for (const t of names.filter((n) => n.endsWith('.timer'))) {
    assert.ok(names.includes(t.replace(/\.timer$/, '.service')), `${t} has no service`);
  }
});

test('the server unit keeps the drain window and the safe defaults the brief requires', () => {
  const u = readFileSync(join(REPO, 'linux', 'systemd', 'pexi-server.service'), 'utf8');
  assert.match(u, /^TimeoutStopSec=30$/m);
  assert.match(u, /^Restart=always$/m);
  assert.match(u, /^EnvironmentFile=\/etc\/pexi\/pexi\.env$/m);
});
