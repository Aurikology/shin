/**
 * Gap 84: client crash reports were only a log line, so a bad build that crashed every phone went unseen until a review.
 * The health watch now counts the reports the server received in the last hour and raises `client_crash_spike` past a
 * threshold. Gap 83: the Mac's FileVault state (`fdesetup status`, no sudo) is shown beside the other readings so it is known.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeWatch, parseFdesetupStatus, ClientCrashLog, CLIENT_CRASH_SPIKE_PER_HOUR } from '../src/watch.ts';

const now = Date.parse('2026-11-21T20:00:00Z');

test('the threshold is a number a single person cannot reach by retrying', () => {
  assert.ok(CLIENT_CRASH_SPIKE_PER_HOUR >= 10, 'one phone tapping the same broken screen must not page anybody');
});

test('at the threshold in the last hour is a problem that names the count; one under is not', () => {
  const base = okInputs();
  assert.equal(judgeWatch({ ...base, clientCrashesLastHour: CLIENT_CRASH_SPIKE_PER_HOUR - 1 }).ok, true, 'control: just under is fine');
  assert.equal(judgeWatch({ ...base, clientCrashesLastHour: 0 }).ok, true);
  assert.equal(judgeWatch(base).ok, true, 'an input from an older caller that has no count is not a problem');
  const r = judgeWatch({ ...base, clientCrashesLastHour: CLIENT_CRASH_SPIKE_PER_HOUR });
  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 1);
  assert.equal(r.problems[0]!.code, 'client_crash_spike');
  assert.match(r.problems[0]!.why, new RegExp(String(CLIENT_CRASH_SPIKE_PER_HOUR)));
});

test('ClientCrashLog counts only the last hour and forgets the rest', () => {
  const log = new ClientCrashLog();
  assert.equal(log.lastHour(now), 0);
  for (let i = 0; i < 5; i++) log.note(now - 2 * 3_600_000); // two hours ago
  for (let i = 0; i < 3; i++) log.note(now - 30 * 60_000); // 30 minutes ago
  log.note(now - 1000);
  assert.equal(log.lastHour(now), 4);
});

test('ClientCrashLog stays bounded under a flood', () => {
  const log = new ClientCrashLog();
  for (let i = 0; i < 100_000; i++) log.note(now - (i % 1000));
  assert.ok(log.lastHour(now) >= CLIENT_CRASH_SPIKE_PER_HOUR, 'a flood still counts as a spike');
  assert.ok(log.size() <= 5000);
});

test('fdesetup text: on, off, in progress, and unreadable', () => {
  assert.equal(parseFdesetupStatus('FileVault is On.\n'), 'on');
  assert.equal(parseFdesetupStatus('FileVault is Off.\n'), 'off');
  assert.equal(parseFdesetupStatus('FileVault is Off.\nEncryption in progress: Percent completed = 40.5\n'), 'in_progress');
  assert.equal(parseFdesetupStatus('Encryption in progress: Percent completed = 40.5'), 'in_progress');
  assert.equal(parseFdesetupStatus('fdesetup: command not found'), null);
  assert.equal(parseFdesetupStatus(''), null);
});

function okInputs(): Parameters<typeof judgeWatch>[0] {
  return {
    nowMs: now,
    uptimeSeconds: 3600,
    catalogueUp: true,
    scanLog: true,
    scanWriteFaultsRecent: 0,
    pricesDb: 'ok',
    claude: { capReachedThisMonth: false, used: 0, cap: 1000, recentFailed: 0, recentAnswered: 0 },
    revenueCat: { recentFailures: 0 },
    networkSalt: true,
    retention: [],
    backup: { configured: true, newestAt: now - 3_600_000 },
    disk: { freeBytes: 100e9, minBytes: 5e9 },
    hammer: { refreshedAt: new Date(now - 86_400_000).toISOString(), importRefused: null },
    sources: [],
    checker: { lastSeenAt: now - 60_000 },
  } as unknown as Parameters<typeof judgeWatch>[0];
}
