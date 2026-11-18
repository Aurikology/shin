// mac/test/health.test.mjs: a failure leaves a marker a person's alarm can see, and mails once per streak.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { record, status } from '../lib/health.mjs';

const root = mkdtempSync(join(tmpdir(), 'shin-health-'));
after(() => rmSync(root, { recursive: true, force: true }));
const env = { SHIN_HEALTH_DIR: join(root, 'h'), WORKER_STATEDIR: join(root, 's') };

test('fail writes .FAILED, the state flag and mails once; a second fail does not mail again; ok clears both', () => {
  const sent = [];
  const notify = (job, detail) => (sent.push([job, detail]), 'mailed');
  const a = record({ job: 'backup', ok: false, detail: 'disk full', env, notify });
  assert.equal(a.notified, 'mailed');
  assert.ok(existsSync(join(env.SHIN_HEALTH_DIR, 'backup.FAILED')));
  assert.ok(existsSync(join(env.WORKER_STATEDIR, 'shin-backup-failed')));
  record({ job: 'backup', ok: false, detail: 'disk full again', env, notify });
  assert.equal(sent.length, 1, 'one mail per streak');
  assert.equal(status(env)[0].failed, true);
  record({ job: 'backup', ok: true, detail: 'fine', env, notify });
  assert.ok(!existsSync(join(env.SHIN_HEALTH_DIR, 'backup.FAILED')));
  assert.ok(!existsSync(join(env.WORKER_STATEDIR, 'shin-backup-failed')));
  assert.equal(JSON.parse(readFileSync(join(env.SHIN_HEALTH_DIR, 'backup.json'), 'utf8')).ok, true);
  record({ job: 'backup', ok: false, detail: 'new streak', env, notify });
  assert.equal(sent.length, 2, 'a new streak mails again');
});

test('a broken mailer never hides the marker', () => {
  const notify = () => {
    throw new Error('mailbox down');
  };
  const r = record({ job: 'offsite', ok: false, detail: 'x', env, notify });
  assert.match(r.notified, /notify threw/);
  assert.ok(existsSync(join(env.SHIN_HEALTH_DIR, 'offsite.FAILED')));
});

test('a bad job name is refused (no path tricks)', () => {
  assert.throws(() => record({ job: '../x', ok: true, env }));
});
