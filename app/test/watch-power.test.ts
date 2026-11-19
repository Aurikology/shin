/**
 * The health watch reads the Mac's power source (pmset -g batt). Running on battery is a problem, so the alarms say
 * "plug it in" hours before the battery runs out (the Mac ran flat on 2026-11-18 and Pexi was down about 2 hours).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePmsetBatt, judgeWatch } from '../src/watch.ts';

const now = Date.parse('2026-11-19T02:00:00Z');

const ON_BATTERY = `Now drawing from 'Battery Power'
 -InternalBattery-0 (id=12345678)	41%; discharging; 3:12 remaining present: true
`;
const ON_AC = `Now drawing from 'AC Power'
 -InternalBattery-0 (id=12345678)	100%; charged; 0:00 remaining present: true
`;

test('pmset text: battery, mains and unreadable', () => {
  assert.deepEqual(parsePmsetBatt(ON_BATTERY), { onBattery: true, percent: 41 });
  assert.deepEqual(parsePmsetBatt(ON_AC), { onBattery: false, percent: 100 });
  assert.equal(parsePmsetBatt(''), null);
  assert.equal(parsePmsetBatt('pmset: command not found'), null);
});

test('on battery is a problem naming the charge; on mains or unknown is not', () => {
  const base = okInputs();
  assert.equal(judgeWatch({ ...base, power: { onBattery: false, percent: 100 } }).ok, true, 'control: on mains is ok');
  assert.equal(judgeWatch({ ...base, power: null }).ok, true, 'unknown power is not a problem');
  const r = judgeWatch({ ...base, power: { onBattery: true, percent: 41 } });
  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 1);
  assert.equal(r.problems[0]!.code, 'mac_on_battery');
  assert.match(r.problems[0]!.why, /41% left/);
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
