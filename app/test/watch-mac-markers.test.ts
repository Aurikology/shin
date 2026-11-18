/**
 * The health watch reads the Mac jobs' markers (mac/README.md, "Where the health markers are"):
 * <job>.json on every run, <job>.FAILED while failing. A failing or silent job turns watch.ok false,
 * a job never installed is not judged, and the checker's heartbeat stands in for checker-seen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readMacMarkers, judgeWatch } from '../src/watch.ts';

const HOUR = 3_600_000;
const now = Date.parse('2026-11-18T20:00:00Z');

function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pexi-marks-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

test('no folder: nothing failed, nothing stale, no checker time', () => {
  assert.deepEqual(readMacMarkers(join(tmpdir(), 'pexi-no-such-folder-x'), now), { checkerAt: null, failed: [], stale: [] });
});

test('a .FAILED file, a stale backup and a fresh checker heartbeat are each read', () => {
  const dir = folder({
    'integrity.FAILED': '',
    'integrity.json': JSON.stringify({ job: 'integrity', ok: false, at: new Date(now - HOUR).toISOString() }),
    'backup.json': JSON.stringify({ job: 'backup', ok: true, at: new Date(now - 40 * HOUR).toISOString() }),
    'restore-test.json': JSON.stringify({ job: 'restore-test', ok: true, at: new Date(now - 9 * 24 * HOUR).toISOString() }),
    'checker.json': JSON.stringify({ job: 'checker', ok: true, lastCheckAt: new Date(now - 60_000).toISOString() }),
  });
  try {
    const m = readMacMarkers(dir, now);
    assert.deepEqual(m.failed, ['integrity']);
    assert.deepEqual(m.stale, ['backup'], 'restore-test is inside its 10 days, backup is past 36 hours');
    assert.equal(m.checkerAt, now - 60_000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the judge turns failed and stale Mac jobs into problems', () => {
  const base = judgeWatchInputsOk();
  assert.equal(judgeWatch(base).ok, true, 'control: a clean reading is ok');
  const r = judgeWatch({ ...base, macJobs: { failed: ['offsite'], stale: ['certs'] } });
  assert.equal(r.ok, false);
  const kinds = r.problems.map((p: { kind?: string; code?: string; id?: string }) => p.kind ?? p.code ?? p.id);
  assert.ok(JSON.stringify(r.problems).includes('offsite'));
  assert.ok(JSON.stringify(r.problems).includes('certs'));
  assert.equal(kinds.length, 2);
});

/** A reading with nothing wrong, built from the judge's own inputs shape. */
function judgeWatchInputsOk(): Parameters<typeof judgeWatch>[0] {
  return {
    nowMs: now,
    uptimeSeconds: 3600,
    catalogueUp: true,
    scanLog: true,
    scanWriteFaultsRecent: 0,
    pricesDb: 'ok',
    claude: { capReachedThisMonth: false, used: 0, cap: 1000, recentFailed: 0, recentOk: 0 },
    revenueCat: { recentFailures: 0 },
    networkSalt: true,
    retention: [],
    backup: { configured: true, newestAt: now - HOUR },
    disk: { freeBytes: 100e9, minBytes: 5e9 },
    hammer: { refreshedAt: new Date(now - 24 * HOUR).toISOString(), importRefused: null },
    sources: [],
    checker: { lastSeenAt: now - 60_000 },
  } as unknown as Parameters<typeof judgeWatch>[0];
}
