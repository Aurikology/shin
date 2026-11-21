import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeFreshness, judgeWatch, alarmHeadline, fetchHealth, HAMMER_STALE_DAYS } from '../data-freshness.mjs';

// The GitHub outage alarm fails on a stale Project Hammer refresh (scripts/data-freshness.mjs).
// Each failing state must fail: a refresh that never ran, an old build, a garbled mark, an old mark.
const NOW = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();

test('a refresh within the limit passes', () => {
  assert.equal(judgeFreshness({ hammerRefreshedAt: daysAgo(6.5) }, NOW).ok, true);
  assert.equal(judgeFreshness({ hammerRefreshedAt: daysAgo(HAMMER_STALE_DAYS - 0.01) }, NOW).ok, true);
});

test('every way of not being fresh fails, and says why', () => {
  for (const [health, word] of [
    [{ hammerRefreshedAt: daysAgo(HAMMER_STALE_DAYS + 0.01) }, 'days ago'],
    [{ hammerRefreshedAt: daysAgo(40) }, 'days ago'],
    [{ hammerRefreshedAt: null }, 'never finished'],
    [{ ok: true }, 'does not report'],
    [{ hammerRefreshedAt: 'last sunday' }, 'not a date'],
    [null, 'not JSON'],
  ]) {
    const v = judgeFreshness(health, NOW);
    assert.equal(v.ok, false, `passed: ${JSON.stringify(health)}`);
    assert.match(v.why, new RegExp(word));
  }
});

// The strict reading (app/src/watch.ts): the alarm fails on `watch.ok !== true`, and never on the
// shopper-facing `ok`. An old build with no `watch` field fails too: unknown is not a pass.
test('watch.ok true passes; false fails and names every problem', () => {
  assert.equal(judgeWatch({ ok: true, watch: { ok: true, problems: [] } }).ok, true);
  const v = judgeWatch({
    ok: true,
    watch: { ok: false, problems: [{ code: 'backup_stale', why: 'The newest backup is 40 hours old' }, { code: 'disk_low', why: '4.0 GB free' }] },
  });
  assert.equal(v.ok, false);
  assert.match(v.why, /backup_stale/);
  assert.match(v.why, /disk_low/);
  assert.match(v.why, /40 hours old/);
});

test('a health body with no watch, a malformed watch, or no JSON at all fails', () => {
  for (const health of [{ ok: true }, { ok: true, watch: null }, { ok: true, watch: { ok: 'yes' } }, { watch: { ok: false } }, null, 'text']) {
    assert.equal(judgeWatch(health).ok, false, `passed: ${JSON.stringify(health)}`);
  }
});

test('fetchHealth retries a tunnel blip (HTTP 530) and a refused connection, then gives the body', async () => {
  const answers = [
    () => ({ status: 530, json: async () => ({}) }),
    () => {
      throw new Error('fetch failed');
    },
    () => ({ status: 200, json: async () => ({ ok: true, watch: { ok: true, problems: [] } }) }),
  ];
  let calls = 0;
  const sleeps = [];
  const r = await fetchHealth('https://x.example', { fetchFn: async () => answers[calls++](), sleepFn: async (ms) => sleeps.push(ms), tries: 3, waitMs: 20_000 });
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [20_000, 20_000]);
  assert.equal(r.error, null);
  assert.equal(r.body.watch.ok, true);
});

test('fetchHealth reports unreachable only after every try failed', async () => {
  let calls = 0;
  const r = await fetchHealth('https://x.example', { fetchFn: async () => { calls++; return { status: 530, json: async () => ({}) }; }, sleepFn: async () => {}, tries: 3, waitMs: 1 });
  assert.equal(calls, 3);
  assert.equal(r.body, null);
  assert.match(r.error, /530/);
});

// gap 96: the public health body lists problem CODES (strings). The alarm names them, and its headline says
// DOWN (routes failed) or DEGRADED (routes fine, watch problems: codes).
test('public watch codes (strings) are named in the verdict', () => {
  const v = judgeWatch({ ok: true, watch: { ok: false, problems: ['disk_low', 'backup_stale'] } });
  assert.equal(v.ok, false);
  assert.match(v.why, /disk_low, backup_stale/);
  assert.doesNotMatch(v.why, /no problems are listed/);
});

test('the workflow says DOWN when the probe fails and passes --routes-failed to the freshness check', async () => {
  const { readFileSync } = await import('node:fs');
  const yml = readFileSync(new URL('../../.github/workflows/server-alarm.yml', import.meta.url), 'utf8');
  assert.match(yml, /id: probe/);
  assert.match(yml, /DOWN: the phone routes failed/);
  assert.match(yml, /data-freshness\.mjs --routes-failed/);
  assert.match(yml, /steps\.probe\.outcome/);
});

test('alarmHeadline: DOWN when the routes failed, DEGRADED with the codes when only watch failed, null when fine', () => {
  const bad = judgeWatch({ ok: true, watch: { ok: false, problems: ['mac_on_battery', 'disk_low'] } });
  const good = { ok: true, why: 'x' };
  assert.match(alarmHeadline(true, bad, good), /^DOWN/);
  const d = alarmHeadline(false, bad, good);
  assert.match(d, /^DEGRADED \(routes fine, watch problems: mac_on_battery, disk_low\)/);
  assert.equal(alarmHeadline(false, judgeWatch({ ok: true, watch: { ok: true, problems: [] } }), good), null);
  assert.match(alarmHeadline(false, { ok: true, why: 'ok' }, { ok: false, why: 'old refresh' }), /^DEGRADED .*prices: old refresh/);
});
