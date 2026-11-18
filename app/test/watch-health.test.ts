/**
 * /api/health CARRIES THE STRICT READING (src/watch.ts) AND KEEPS ok: true FOR THE PHONE.
 *
 * The phone treats anything but `ok: true` as "server down", so a problem that only means a person
 * has to act (a stale backup, a Claude cap) must never flip it. These tests boot the real server
 * and read the real route: `watch` is there, it lists named problems, and the top-level `ok`
 * stays true while it does.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-watch-health-'));
process.env.SHIN_CATALOGUE_FIRST = '0';
process.env.SHIN_DATA_DIR = join(dir, 'data');
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_BACKUP_DIR;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

const { server } = await import('../server.ts');

let port = 0;
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  mock.method(console, 'warn', () => {});
});
after(async () => {
  mock.restoreAll();
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

type Health = { ok: boolean; watch: { ok: boolean; problems: { code: string; why: string }[] } } & Record<string, unknown>;
async function health(): Promise<Health> {
  const res = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { connection: 'close' } });
  assert.equal(res.status, 200);
  return (await res.json()) as Health;
}
const codes = (h: Health) => h.watch.problems.map((p) => p.code);

test('health says ok:true for the shopper while watch lists what a person must act on', async () => {
  const h = await health();
  assert.equal(h.ok, true);
  assert.equal(typeof h.watch.ok, 'boolean');
  assert.ok(Array.isArray(h.watch.problems));
  // This server has no backup folder told to it, no deploy checker and no Project Hammer refresh.
  assert.equal(h.watch.ok, false);
  for (const c of ['backup_not_checked', 'hammer_never_refreshed']) assert.ok(codes(h).includes(c), `${c} in ${codes(h).join(',')}`);
  assert.ok(h.watch.problems.every((p) => p.why.length > 10 && !/[A-Za-z]:\\|\/Users\//.test(p.why)));
});

test('the health body has the readings behind the problems', async () => {
  const h = await health();
  for (const k of ['diskFreeGb', 'newestBackupAt', 'deployCheckerSeenAt', 'sourcesLoaded', 'claudeRecent']) assert.ok(k in h, k);
});

test('a fresh backup clears the backup problem and an old one raises backup_stale, with ok still true', async () => {
  const fresh = join(dir, 'backups-fresh');
  mkdirSync(join(fresh, '20261118-040001'), { recursive: true });
  process.env.SHIN_BACKUP_DIR = fresh;
  let h = await health();
  assert.ok(!codes(h).some((c) => c.startsWith('backup')), codes(h).join(','));

  const old = join(dir, 'backups-old');
  mkdirSync(join(old, '20261110-040001'), { recursive: true });
  const long = new Date(Date.now() - 40 * 3_600_000);
  utimesSync(join(old, '20261110-040001'), long, long);
  process.env.SHIN_BACKUP_DIR = old;
  h = await health();
  assert.ok(codes(h).includes('backup_stale'));
  assert.equal(h.ok, true);
  delete process.env.SHIN_BACKUP_DIR;
});

test('a deploy checker that wrote its last-seen file clears that problem once the server is old enough to need it', async () => {
  mkdirSync(process.env.SHIN_DATA_DIR!, { recursive: true });
  writeFileSync(join(process.env.SHIN_DATA_DIR!, 'checker-seen'), `${new Date().toISOString()}\n`);
  const h = await health();
  assert.ok(!codes(h).includes('deploy_checker_silent'));
  assert.equal(typeof h.deployCheckerSeenAt, 'string');
});
