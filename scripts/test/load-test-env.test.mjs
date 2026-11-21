import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSpawnEnv, liveHostRefusal } from '../load/spawn-env.mjs';

const LOAD = join(dirname(fileURLToPath(import.meta.url)), '..', 'load', 'load-test.mjs');

test('the spawned child env has no inherited SHIN_* variable (gap 99)', () => {
  const parent = {
    PATH: '/bin',
    SHIN_SCANS: '/live/data/scans.db',
    SHIN_GAPS: '/live/data/gaps.db',
    SHIN_SECRET_THING: 'x',
    SHIN_CATALOGUE: '/live/catalogue.db',
  };
  const env = buildSpawnEnv(parent, { dataDir: '/tmp/t', port: 4199, writes: { SHIN_SCANS: '/tmp/t/scans.db' } });
  assert.equal(env.SHIN_SCANS, '/tmp/t/scans.db');
  assert.equal(env.SHIN_GAPS, undefined);
  assert.equal(env.SHIN_SECRET_THING, undefined);
  assert.equal(env.PATH, '/bin');
  assert.equal(env.SHIN_DATA_DIR, '/tmp/t');
  assert.equal(env.SHIN_CATALOGUE, '/live/catalogue.db'); // read-only, kept on purpose
  assert.ok(!JSON.stringify(env).includes('/live/data'));
});

test('a SHIN_SCANS sentinel in the parent never reaches the child when no write path is given', () => {
  const env = buildSpawnEnv({ SHIN_SCANS: '/SENTINEL/scans.db' }, { dataDir: '/tmp/t', port: 1 });
  assert.ok(!JSON.stringify(env).includes('SENTINEL'));
});

test('live host is refused without --i-mean-live', () => {
  assert.match(liveHostRefusal('https://relay.anjiawenda.com', []), /LIVE/);
  assert.equal(liveHostRefusal('https://relay.anjiawenda.com', ['--i-mean-live']), null);
  assert.equal(liveHostRefusal('http://127.0.0.1:4173', []), null);
});

// Never run load-test.mjs against the live host here, even to prove the refusal: if the refusal ever broke, the
// test itself would load-test production (it did once, 2026-11-21 23:24 UTC, while this test was red-first).
// Instead, check the refusal runs before the first request in the script's own source.
test('load-test.mjs checks the live-host refusal before it sends any request', () => {
  const src = readFileSync(LOAD, 'utf8');
  const refusalAt = src.indexOf('liveHostRefusal(baseUrl');
  const firstFetch = src.search(/\bfetch\(|http\.request\(|https\.request\(/);
  assert.ok(refusalAt > 0, 'load-test.mjs must call liveHostRefusal(baseUrl, ...)');
  assert.ok(firstFetch < 0 || refusalAt < firstFetch, 'the refusal must come before the first request in the file');
});
