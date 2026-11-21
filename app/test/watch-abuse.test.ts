/**
 * Abuse review 2026-11-21, finding 6: a RevenueCat lookup budget that turns buyers away, and a jump in
 * requests the limits refuse, were silent. The strict health reading now names both.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as watchModule from '../src/watch.ts';
import type { WatchInputs } from '../src/watch.ts';

const { judgeWatch, readRevenueCat } = watchModule;
const NOW = Date.parse('2026-11-21T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

function healthy(): WatchInputs {
  return {
    nowMs: NOW,
    uptimeSeconds: 86_400,
    catalogueUp: true,
    scanLog: true,
    scanWriteFaultsRecent: 0,
    pricesDb: 'ok',
    claude: { capReachedThisMonth: false, used: 100, cap: 10_000, recentAnswered: 20, recentFailed: 0 },
    revenueCat: { recentFailures: 0, recentBuyerRefusals: 0 },
    refusalsLastHour: {},
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
  } as WatchInputs;
}
const codes = (i: WatchInputs) => judgeWatch(i).problems.map((p) => p.code);

test('abuse 6: RevenueCat checks skipped for buyers fail the watch; a quiet budget does not', () => {
  assert.deepEqual(codes(healthy()), []);
  const capped = { ...healthy(), revenueCat: { recentFailures: 0, recentBuyerRefusals: 5 } } as WatchInputs;
  assert.deepEqual(codes(capped), ['revenuecat_lookups_capped']);
  const few = { ...healthy(), revenueCat: { recentFailures: 0, recentBuyerRefusals: 4 } } as WatchInputs;
  assert.deepEqual(codes(few), []);
});

test('abuse 6: a jump in refused requests fails the watch and names the limiters', () => {
  const spike = { ...healthy(), refusalsLastHour: { 'door-address': 900, 'free-scan-address': 150 } } as WatchInputs;
  const report = judgeWatch(spike);
  assert.deepEqual(report.problems.map((p) => p.code), ['requests_refused_spike']);
  assert.match(report.problems[0]!.why, /door-address 900/);
  const quiet = { ...healthy(), refusalsLastHour: { 'door-address': 300 } } as WatchInputs;
  assert.deepEqual(codes(quiet), []);
});

test('abuse 6: the RevenueCat reading carries the buyer refusals the server counts', () => {
  assert.deepEqual(readRevenueCat({ revenueCatHealth: () => ({ failures: 2, buyerRefusals: 7 }) }), { failures: 2, buyerRefusals: 7 });
  assert.deepEqual(readRevenueCat({ revenueCatHealth: () => ({ failures: 2 }) }), { failures: 2 });
});
