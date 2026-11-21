// mac/test/redelete.test.mjs
// R58: after a restore, every deletion already honoured (and still inside the 45-day window)
// is run again against the RESTORED copy, so a restore can never bring a deleted shopper back.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseCsv, dueDeletions } from '../redelete-requests.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'redelete-requests.mjs');
const root = mkdtempSync(join(tmpdir(), 'shin-redelete-'));
after(() => rmSync(root, { recursive: true, force: true }));

const HEADER = 'received,from,kind,device_id,check,export_sent,deleted_on,revenuecat,answered_on,backups_clear_on,notes';

test('parseCsv handles quoted commas and quotes', () => {
  const rows = parseCsv('a,b\n"x, y","say ""hi"""\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"']]);
});

test('dueDeletions: only delete/both rows with an id, deleted within the window', () => {
  const today = new Date('2026-12-01T12:00:00Z');
  const csv = [
    HEADER,
    '2026-11-20,a@x.com,delete,idAAAAAAAA1,passed,no,2026-11-21,no purchases,2026-11-22,2026-12-06,',
    '2026-09-01,b@x.com,delete,idBBBBBBBB2,passed,no,2026-09-02,no purchases,2026-09-03,2026-09-17,',
    '2026-11-25,c@x.com,access,idCCCCCCCC3,passed,2026-11-26,,not needed,2026-11-26,,',
    '2026-11-26,d@x.com,both,idDDDDDDDD4,passed,2026-11-27,2026-11-27,deleted 2026-11-27,2026-11-28,2026-12-12,',
    '2026-11-27,e@x.com,delete,,passed,no,2026-11-28,no,2026-11-28,,id already blanked',
    '2026-11-28,f@x.com,delete,idFFFFFFFF6,passed,no,,no,,,not yet deleted',
  ].join('\n');
  const due = dueDeletions(parseCsv(csv), { today, days: 45 });
  assert.deepEqual(due.ids, ['idAAAAAAAA1', 'idDDDDDDDD4']);
  assert.equal(due.skippedNotYetDeleted, 1, 'a delete request with no deleted_on is reported, not silently dropped');
});

test('dueDeletions: a log with no usable header is an error, not an empty list', () => {
  assert.throws(() => dueDeletions(parseCsv('foo,bar\n1,2\n'), { today: new Date(), days: 45 }), /device_id/);
});

function restoredCopy() {
  const dir = join(root, 'restored-' + Math.random().toString(16).slice(2));
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, 'scans.db'));
  db.exec('CREATE TABLE scan (id INTEGER PRIMARY KEY, device_id TEXT, photo_path TEXT)');
  db.exec("INSERT INTO scan(device_id) VALUES ('idAAAAAAAA1'), ('idKEEPKEEP9')");
  db.close();
  return dir;
}

function scanIds(dir) {
  const db = new DatabaseSync(join(dir, 'scans.db'), { readOnly: true });
  const ids = db.prepare('SELECT device_id FROM scan').all().map((r) => r.device_id);
  db.close();
  return ids;
}

function runScript(args, env = {}) {
  const r = spawnSync(process.execPath, ['--no-warnings', SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

test('end to end: the deleted phone is gone from the restored copy, another phone stays', () => {
  const dir = restoredCopy();
  const today = new Date().toISOString().slice(0, 10);
  const log = join(root, 'request-log.csv');
  writeFileSync(log, [HEADER, `${today},a@x.com,delete,idAAAAAAAA1,passed,no,${today},no purchases,${today},,`].join('\n') + '\n');
  const r = runScript(['--target', dir, '--log', log]);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(scanIds(dir), ['idKEEPKEEP9']);
  assert.match(r.out, /re-ran 1 deletion/);
});

test('dry run changes nothing', () => {
  const dir = restoredCopy();
  const today = new Date().toISOString().slice(0, 10);
  const log = join(root, 'request-log2.csv');
  writeFileSync(log, [HEADER, `${today},a@x.com,delete,idAAAAAAAA1,passed,no,${today},no purchases,${today},,`].join('\n') + '\n');
  const r = runScript(['--target', dir, '--log', log, '--dry-run']);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(scanIds(dir).sort(), ['idAAAAAAAA1', 'idKEEPKEEP9']);
  assert.match(r.out, /dry run/i);
});

test('a missing request log means no requests: it passes, says so, and changes nothing', () => {
  const dir = restoredCopy();
  const r = runScript(['--target', dir, '--log', join(root, 'does-not-exist.csv')]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /no request log/i);
  assert.deepEqual(scanIds(dir).sort(), ['idAAAAAAAA1', 'idKEEPKEEP9']);
});

test('a log that exists but cannot be read is still a loud failure', () => {
  const dir = restoredCopy();
  const log = join(root, 'bad-header.csv');
  writeFileSync(log, ['foo,bar', '1,2', ''].join('\n'));
  const r = runScript(['--target', dir, '--log', log]);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /REDELETE FAILED/);
});
