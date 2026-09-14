/**
 * The team's read-only window on the beta data, and the named invite links.
 * Added 2026-09-14 so Aurik's Claude can read the analytics and every scan
 * says whose link it came through.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { handleAdmin, notePerson } from '../src/admin.ts';
import { inviteAllows, inviteWho } from '../src/invite.ts';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'shin-admin-'));
  const db = new DatabaseSync(join(dir, 'scans.db'));
  db.exec("CREATE TABLE scan (id INTEGER PRIMARY KEY, query_text TEXT); INSERT INTO scan (query_text) VALUES ('coke zero');");
  db.close();
  mkdirSync(join(dir, 'shutter', 'press-1'), { recursive: true });
  writeFileSync(join(dir, 'shutter', 'press-1', 'frame.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
  const env = { SHIN_DATA_DIR: dir, SHIN_ADMIN_TOKEN: 'secret-token' } as NodeJS.ProcessEnv;
  return { dir, env };
}

async function serve(env: NodeJS.ProcessEnv) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleAdmin(req, res, url, env);
  });
  await new Promise<void>((r) => server.listen(0, r));
  // A failed assertion skips close(); unref keeps that a red test, not a hang.
  server.unref();
  const port = (server.address() as { port: number }).port;
  return {
    call: (path: string, init: RequestInit = {}) => fetch(`http://localhost:${port}${path}`, init),
    close: () => server.close(),
  };
}

const auth = { 'x-shin-admin': 'secret-token' };

test('admin routes are off without a token and refuse a wrong one', async () => {
  const { env } = fixture();
  const off = await serve({ ...env, SHIN_ADMIN_TOKEN: '' });
  assert.equal((await off.call('/api/admin/tables', { headers: auth })).status, 404);
  off.close();
  const on = await serve(env);
  assert.equal((await on.call('/api/admin/tables', { headers: { 'x-shin-admin': 'wrong-token!' } })).status, 401);
  assert.equal((await on.call('/api/admin/tables')).status, 401);
  on.close();
});

test('sql reads rows and cannot write', async () => {
  const { env } = fixture();
  const s = await serve(env);
  const read = await s.call('/api/admin/sql', { method: 'POST', headers: auth, body: 'SELECT query_text FROM scan' });
  assert.equal(read.status, 200);
  assert.deepEqual((await read.json()).rows, [{ query_text: 'coke zero' }]);
  const write = await s.call('/api/admin/sql', { method: 'POST', headers: auth, body: 'DELETE FROM scan' });
  assert.equal(write.status, 400);
  const after = await s.call('/api/admin/sql', { method: 'POST', headers: auth, body: 'SELECT count(*) AS n FROM scan' });
  assert.equal((await after.json()).rows[0].n, 1);
  s.close();
});

test('files are served from inside the data folder only', async () => {
  const { env } = fixture();
  const s = await serve(env);
  const frame = await s.call('/api/admin/file?path=shutter/press-1/frame.jpg', { headers: auth });
  assert.equal(frame.status, 200);
  assert.equal(frame.headers.get('content-type'), 'image/jpeg');
  assert.equal((await s.call('/api/admin/file?path=../../etc/passwd', { headers: auth })).status, 400);
  const presses = await (await s.call('/api/admin/shutter', { headers: auth })).json();
  assert.equal(presses.presses[0].id, 'press-1');
  s.close();
});

test('whose link a device came through is recorded and readable', async () => {
  const { env } = fixture();
  notePerson('device-a', 'aurik', env);
  notePerson('device-a', 'aurik', env);
  const s = await serve(env);
  const people = await (await s.call('/api/admin/people', { headers: auth })).json();
  assert.equal(people.rows.length, 1);
  assert.equal(people.rows[0].person, 'aurik');
  const joined = await s.call('/api/admin/sql', { method: 'POST', headers: auth, body: 'SELECT person FROM people.device_person' });
  assert.equal((await joined.json()).rows[0].person, 'aurik');
  s.close();
});

test('named invite codes say whose link it is, and the shared code still opens', () => {
  const env = { SHIN_INVITE_CODE: 'shared-code', SHIN_INVITES: 'jamin:code-j, aurik:code-a' } as NodeJS.ProcessEnv;
  assert.equal(inviteWho('code-a', env), 'aurik');
  assert.equal(inviteWho('code-j', env), 'jamin');
  assert.equal(inviteWho('shared-code', env), 'family');
  assert.equal(inviteWho('code-x', env), null);
  assert.equal(inviteAllows('code-x', env), false);
  assert.equal(inviteAllows('code-a', env), true);
  assert.equal(inviteAllows(undefined, {} as NodeJS.ProcessEnv), true);
});
