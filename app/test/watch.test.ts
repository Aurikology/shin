/**
 * THE STRICT HEALTH READING (readiness items R02, R10, R11, R33, R34, R45, R52, R71, R72, R82, R86, R92).
 *
 * `/api/health` keeps `ok: true` for the shopper-facing part (the phone treats anything else as
 * down) and adds `watch`, which the outside alarm reads and which is strict: every state that means
 * shoppers get wrong or empty answers, or that a person has to act on, is a named problem.
 * `judgeWatch` is pure, so every rule here is shown failing and passing without a server.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  judgeWatch,
  publicProblemCodes,
  PUBLIC_PROBLEM_CODES,
  recentRise,
  ClaudeOutcomes,
  RetentionMarks,
  BACKUP_MAX_HOURS,
  HAMMER_MAX_DAYS,
  CHECKER_MAX_MINUTES,
  type WatchInputs,
} from '../src/watch.ts';

const NOW = Date.parse('2026-11-18T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

/** A healthy server a day after its start. Each test spoils one thing. */
function healthy(): WatchInputs {
  return {
    nowMs: NOW,
    uptimeSeconds: 86_400,
    catalogueUp: true,
    scanLog: true,
    scanWriteFaultsRecent: 0,
    pricesDb: 'ok',
    claude: { capReachedThisMonth: false, used: 100, cap: 1000, recentAnswered: 20, recentFailed: 0 },
    revenueCat: { recentFailures: 0 },
    networkSalt: true,
    retention: [
      { part: 'scan_data', lastOkAt: NOW - 2 * HOUR, lastFailure: null },
      { part: 'request_log', lastOkAt: NOW - 2 * HOUR, lastFailure: null },
    ],
    backup: { configured: true, newestAt: NOW - 8 * HOUR },
    disk: { freeBytes: 80e9, minBytes: 10e9 },
    hammer: { refreshedAt: iso(NOW - 3 * DAY), importRefused: null },
    sources: [{ name: 'openprices', lastLoadedAt: iso(NOW - 5 * DAY), maxDays: 60 }],
    checker: { lastSeenAt: NOW - 2 * 60_000 },
  };
}

function codes(i: WatchInputs): string[] {
  return judgeWatch(i).problems.map((p) => p.code);
}

test('a healthy server has no problems and watch is ok', () => {
  assert.deepEqual(judgeWatch(healthy()), { ok: true, problems: [] });
});

test('catalogue not loaded is a problem once the start-up grace is over, not during a restart', () => {
  assert.deepEqual(codes({ ...healthy(), catalogueUp: false, uptimeSeconds: 120 }), []);
  assert.deepEqual(codes({ ...healthy(), catalogueUp: false, uptimeSeconds: 1800 }), ['catalogue_not_loaded']);
});

test('the scan log not open, or failing to write in the last hour, is a problem', () => {
  assert.deepEqual(codes({ ...healthy(), scanLog: false }), ['scan_log_not_writing']);
  assert.deepEqual(codes({ ...healthy(), scanWriteFaultsRecent: 2 }), ['scan_log_not_writing']);
});

test('a prices file that cannot answer is a problem; not yet checked is not', () => {
  assert.deepEqual(codes({ ...healthy(), pricesDb: 'no_observation_table' }), ['prices_file_unusable']);
  assert.deepEqual(codes({ ...healthy(), pricesDb: 'missing' }), ['prices_file_unusable']);
  assert.deepEqual(codes({ ...healthy(), pricesDb: 'not_checked' }), []);
});

test('the Claude cap reached this month, or at 80 percent, is a problem', () => {
  const c = healthy().claude;
  assert.deepEqual(codes({ ...healthy(), claude: { ...c, capReachedThisMonth: true } }), ['claude_cap_reached']);
  assert.deepEqual(codes({ ...healthy(), claude: { ...c, used: 800 } }), ['claude_cap_near']);
  assert.deepEqual(codes({ ...healthy(), claude: { ...c, used: 799 } }), []);
  // reached wins: one problem, not two
  assert.deepEqual(codes({ ...healthy(), claude: { ...c, capReachedThisMonth: true, used: 1000 } }), ['claude_cap_reached']);
});

test('Claude account errors: the last 20 calls all failing is a problem, 19 of 20 is not', () => {
  const c = healthy().claude;
  assert.deepEqual(codes({ ...healthy(), claude: { ...c, recentAnswered: 0, recentFailed: 20 } }), ['claude_account_failing']);
  assert.deepEqual(codes({ ...healthy(), claude: { ...c, recentAnswered: 1, recentFailed: 19 } }), []);
  assert.deepEqual(codes({ ...healthy(), claude: { ...c, recentAnswered: 0, recentFailed: 7 } }), [], 'fewer than 20 calls proves nothing');
});

test('RevenueCat failing now is a problem; unknown (no getter yet) is not', () => {
  assert.deepEqual(codes({ ...healthy(), revenueCat: { recentFailures: 3 } }), ['revenuecat_failing']);
  assert.deepEqual(codes({ ...healthy(), revenueCat: { recentFailures: 2 } }), []);
  assert.deepEqual(codes({ ...healthy(), revenueCat: null }), []);
});

test('a missing network salt is a problem', () => {
  assert.deepEqual(codes({ ...healthy(), networkSalt: false }), ['network_salt_missing']);
});

test('retention: a failed sweep, a sweep not run for over 3 days, and one that never ran are problems', () => {
  const ok = healthy().retention;
  assert.deepEqual(codes({ ...healthy(), retention: [{ ...ok[0]!, lastFailure: 'event: disk I/O error' }, ok[1]!] }), ['retention_failing']);
  assert.deepEqual(codes({ ...healthy(), retention: [{ ...ok[0]!, lastOkAt: NOW - 4 * DAY }, ok[1]!] }), ['retention_stale']);
  assert.deepEqual(codes({ ...healthy(), retention: [{ ...ok[0]!, lastOkAt: NOW - 2 * DAY }, ok[1]!] }), []);
  assert.deepEqual(codes({ ...healthy(), retention: [{ part: 'scan_data', lastOkAt: null, lastFailure: null }, ok[1]!], uptimeSeconds: 2 * 86_400 }), ['retention_stale']);
  // a server one minute old has not had its first sweep yet
  assert.deepEqual(codes({ ...healthy(), retention: [{ part: 'scan_data', lastOkAt: null, lastFailure: null }, ok[1]!], uptimeSeconds: 60 }), []);
});

test('backup: older than 36 hours, no copy at all, and a folder nobody told the server about are problems', () => {
  assert.equal(BACKUP_MAX_HOURS, 36);
  assert.deepEqual(codes({ ...healthy(), backup: { configured: true, newestAt: NOW - 37 * HOUR } }), ['backup_stale']);
  assert.deepEqual(codes({ ...healthy(), backup: { configured: true, newestAt: NOW - 35 * HOUR } }), []);
  assert.deepEqual(codes({ ...healthy(), backup: { configured: true, newestAt: null } }), ['backup_stale']);
  assert.deepEqual(codes({ ...healthy(), backup: { configured: false, newestAt: null } }), ['backup_not_checked']);
});

test('disk: free space under the threshold, or unreadable, is a problem', () => {
  assert.deepEqual(codes({ ...healthy(), disk: { freeBytes: 9.9e9, minBytes: 10e9 } }), ['disk_low']);
  assert.deepEqual(codes({ ...healthy(), disk: { freeBytes: null, minBytes: 10e9 } }), ['disk_low']);
  assert.deepEqual(codes({ ...healthy(), disk: { freeBytes: 10e9, minBytes: 10e9 } }), []);
});

test('weekly price refresh: never, older than 8 days, and a refused import are problems', () => {
  assert.equal(HAMMER_MAX_DAYS, 8);
  const h = healthy().hammer;
  assert.deepEqual(codes({ ...healthy(), hammer: { ...h, refreshedAt: null } }), ['hammer_never_refreshed']);
  assert.deepEqual(codes({ ...healthy(), hammer: { ...h, refreshedAt: iso(NOW - 8.5 * DAY) } }), ['hammer_stale']);
  assert.deepEqual(codes({ ...healthy(), hammer: { ...h, refreshedAt: 'garbage' } }), ['hammer_stale']);
  assert.deepEqual(
    codes({ ...healthy(), hammer: { ...h, importRefused: { at: iso(NOW - DAY), why: 'rows fell 60 percent' } } }),
    ['hammer_import_refused'],
  );
});

test('other sources: a price source past its own limit is a problem, one never loaded is not guessed at', () => {
  assert.deepEqual(codes({ ...healthy(), sources: [{ name: 'openprices', lastLoadedAt: iso(NOW - 61 * DAY), maxDays: 60 }] }), ['source_stale']);
  assert.deepEqual(codes({ ...healthy(), sources: [{ name: 'openprices', lastLoadedAt: null, maxDays: 60 }] }), ['source_stale']);
  // maxDays 0 turns the check off for that source (the operator's setting)
  assert.deepEqual(codes({ ...healthy(), sources: [{ name: 'openprices', lastLoadedAt: null, maxDays: 0 }] }), []);
});

test('deploy checker: silent for over 15 minutes, or never seen after half an hour up, is a problem', () => {
  assert.equal(CHECKER_MAX_MINUTES, 15);
  assert.deepEqual(codes({ ...healthy(), checker: { lastSeenAt: NOW - 16 * 60_000 } }), ['deploy_checker_silent']);
  assert.deepEqual(codes({ ...healthy(), checker: { lastSeenAt: null } }), ['deploy_checker_silent']);
  assert.deepEqual(codes({ ...healthy(), checker: { lastSeenAt: null }, uptimeSeconds: 300 }), []);
});

test('every problem carries plain words and no file path, and several problems all show', () => {
  const r = judgeWatch({ ...healthy(), networkSalt: false, scanLog: false, disk: { freeBytes: 1e9, minBytes: 10e9 } });
  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 3);
  for (const p of r.problems) {
    assert.ok(p.why.length > 10);
    assert.doesNotMatch(p.why, /[A-Za-z]:\\|\/Users\/|—/);
  }
});

test('recentRise: counts what rose inside the window, and starts from zero at process start', () => {
  const samples = [
    { at: NOW - 3 * HOUR, total: 4 },
    { at: NOW - 90 * 60_000, total: 4 },
    { at: NOW - 30 * 60_000, total: 6 },
  ];
  assert.equal(recentRise(samples, 7, NOW, HOUR), 3);
  assert.equal(recentRise(samples, 6, NOW, HOUR), 2);
  assert.equal(recentRise(samples, 4, NOW, 2 * HOUR), 0);
  assert.equal(recentRise([], 5, NOW, HOUR), 5, 'no earlier sample: everything counted since start is recent');
});

test('ClaudeOutcomes: only account-level failures count against the account, an answer clears it', () => {
  const o = new ClaudeOutcomes();
  for (let i = 0; i < 20; i++) o.note({ ok: false, reason: 'model_error' });
  assert.deepEqual(o.recent(), { recentAnswered: 0, recentFailed: 20 });
  o.note({ ok: true });
  assert.deepEqual(o.recent(), { recentAnswered: 1, recentFailed: 19 });
  // the model answered, the answer was just not usable: the account is fine
  const p = new ClaudeOutcomes();
  p.note({ ok: false, reason: 'model_does_not_know' });
  p.note({ ok: false, reason: 'invalid_json' });
  assert.deepEqual(p.recent(), { recentAnswered: 2, recentFailed: 0 });
  // not Claude's account at all: our own limits and the cap are not counted
  const q = new ClaudeOutcomes();
  q.note({ ok: false, reason: 'rate_limited' });
  q.note({ ok: false, reason: 'monthly_cap_reached' });
  q.note({ ok: false, reason: 'no_claude_consent' });
  assert.deepEqual(q.recent(), { recentAnswered: 0, recentFailed: 0 });
  // key missing or revoked, store unwritable, circuit open: failures
  const r = new ClaudeOutcomes();
  for (const reason of ['no_api_key', 'cap_store_error', 'circuit_open']) r.note({ ok: false, reason });
  assert.deepEqual(r.recent(), { recentAnswered: 0, recentFailed: 3 });
});

test('RetentionMarks: a part that failed shows its failure, and a later good run clears it', () => {
  const m = new RetentionMarks(['scan_data', 'request_log']);
  m.note('scan_data', null, NOW - 1000);
  m.note('request_log', 'EACCES', NOW - 900);
  const a = m.snapshot();
  assert.equal(a.find((p) => p.part === 'scan_data')!.lastOkAt, NOW - 1000);
  assert.equal(a.find((p) => p.part === 'request_log')!.lastFailure, 'EACCES');
  m.note('request_log', null, NOW);
  const b = m.snapshot().find((p) => p.part === 'request_log')!;
  assert.equal(b.lastFailure, null);
  assert.equal(b.lastOkAt, NOW);
});

/* gap 96: the public health body carries the problem CODES that are not security, so the outside alarm can say why. */
test('publicProblemCodes: only the allowlisted non-security codes, deduplicated, never words', () => {
  const report = {
    ok: false,
    problems: [
      { code: 'disk_low', why: 'x'.repeat(20) },
      { code: 'backup_stale', why: 'y' },
      { code: 'disk_low', why: 'again' },
      { code: 'claude_account_failing', why: 'the key is wrong' },
      { code: 'network_salt_missing', why: 'salt' },
      { code: 'requests_refused_spike', why: 'flood' },
      { code: 'revenuecat_lookups_capped', why: 'budget' },
      { code: 'something_unknown', why: 'new code' },
    ],
  };
  assert.deepEqual(publicProblemCodes(report), ['disk_low', 'backup_stale']);
  assert.deepEqual(publicProblemCodes({ ok: true, problems: [] }), []);
});

test('the public allowlist holds no security-flavoured code', () => {
  for (const c of PUBLIC_PROBLEM_CODES) assert.doesNotMatch(c, /account|key|salt|vault|requests_refused|revenuecat|token|secret|capped|auth/i, c);
  for (const c of ['disk_low', 'mac_on_battery', 'backup_stale', 'source_stale', 'deploy_checker_silent', 'claude_cap_reached', 'catalogue_not_loaded', 'scan_log_not_writing', 'mac_job_stale']) {
    assert.ok(PUBLIC_PROBLEM_CODES.includes(c), `${c} should be public`);
  }
});
