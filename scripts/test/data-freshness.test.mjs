import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeFreshness, HAMMER_STALE_DAYS } from '../data-freshness.mjs';

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
