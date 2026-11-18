/**
 * R09 (crash reporting): an uncaught error in the app's JavaScript reaches Pexi's own server as one
 * log line carrying the build number, the message, and where it happened. No third party, no SDK,
 * and deliberately no device id, account, address or position. Behind the invite check like every
 * other write, so it cannot be used as a free log-flooding door; and capped, so a loop that throws
 * a thousand times a second costs one line a second at most.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-client-errors-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
process.env.SHIN_INVITE_CODE = 'a-secret-invite';

const { cleanClientError, ClientErrorBudget } = await import('../src/client-errors.ts');
const { setErrorSinkForTests } = await import('../src/errlog.ts');
const { server } = await import('../server.ts');

let port = 0;
const lines: string[] = [];
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  setErrorSinkForTests((l) => lines.push(l));
});
after(async () => {
  setErrorSinkForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows keeps the sqlite file locked */ }
});

const post = (body: unknown, invite = 'a-secret-invite', raw = false) =>
  fetch(`http://127.0.0.1:${port}/api/client-error`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(invite ? { 'x-shin-invite': invite } : {}) },
    body: raw ? String(body) : JSON.stringify(body),
  });

const good = { build: '2026-11-18.1', kind: 'error', message: 'x is not a function', source: 'camera.js', line: 4812, col: 9, stack: 'TypeError: x is not a function\n    at open (camera.js:4812:9)' };

test('a report is cleaned: build kept, long text cut, URLs reduced to file names, nothing else survives', () => {
  const c = cleanClientError({
    ...good,
    deviceId: 'dev-123',
    userId: 'u1',
    email: 'a@b.c',
    message: 'm'.repeat(1000),
    source: 'https://pexi.example/js/screens/camera.js?v=3#x',
    stack: 'Error: boom\n    at f (https://pexi.example/js/api.js?v=3:10:5)\n' + 'x'.repeat(5000),
  });
  assert.ok(c);
  assert.equal(c.build, '2026-11-18.1');
  assert.equal(c.message.length, 300);
  assert.equal(c.source, 'camera.js');
  assert.ok(c.stack.length <= 1500);
  assert.match(c.stack, /api\.js:10:5/);
  assert.doesNotMatch(c.stack, /https?:/);
  assert.deepEqual(Object.keys(c).sort(), ['build', 'col', 'kind', 'line', 'message', 'source', 'stack']);
});

test('a report with no message, or a build that is not a build, is refused', () => {
  assert.equal(cleanClientError({ ...good, message: '' }), null);
  assert.equal(cleanClientError({ ...good, message: 42 }), null);
  assert.equal(cleanClientError(null), null);
  assert.equal(cleanClientError('text'), null);
  // A wrong build is still a report worth reading; it is recorded as unknown rather than dropped.
  assert.equal(cleanClientError({ ...good, build: '<script>' })?.build, 'unknown');
});

test('the budget lets 30 through a minute and then says so once', () => {
  const b = new ClientErrorBudget(30, 60_000);
  const t0 = 1_000_000;
  const verdicts = Array.from({ length: 33 }, (_, i) => b.take(t0 + i));
  assert.equal(verdicts.filter((v) => v === 'ok').length, 30);
  assert.equal(verdicts.filter((v) => v === 'first_refusal').length, 1);
  assert.equal(verdicts.filter((v) => v === 'refused').length, 2);
  assert.equal(b.take(t0 + 61_000), 'ok', 'a new minute starts a new allowance');
});

test('the route logs one line with the build and no device id', async () => {
  lines.length = 0;
  const res = await post({ ...good, deviceId: 'dev-secret-123' });
  assert.equal(res.status, 200);
  const mine = lines.map((l) => JSON.parse(l)).filter((l) => l.where === 'client.js_error');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].deviceId, null);
  assert.equal(mine[0].detail.build, '2026-11-18.1');
  assert.equal(mine[0].detail.source, 'camera.js');
  assert.equal(mine[0].message, 'x is not a function');
  assert.doesNotMatch(lines.join('\n'), /dev-secret-123/);
});

test('the route sits behind the invite, takes only POST, and refuses a body that is not JSON', async () => {
  assert.equal((await post(good, '')).status, 401);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/client-error`, { headers: { 'x-shin-invite': 'a-secret-invite' } })).status, 405);
  assert.equal((await post('not json', 'a-secret-invite', true)).status, 400);
  assert.equal((await post({ nothing: true })).status, 400);
});
