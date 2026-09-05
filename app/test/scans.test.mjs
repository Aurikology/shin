/**
 * Tests for the scan log (scans.ts).
 *
 * Each test opens its own file under a fresh temp directory rather than
 * sharing one, so a count checked in one test can never leak into another
 * and the never-throw test is free to point at a genuinely broken path.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openScanStore, recordScan, correctScan, weeklyCount, allScans } from '../src/scans.ts';

function tempDb(name = 'scans.db') {
  const dir = mkdtempSync(join(tmpdir(), 'shin-scans-'));
  return join(dir, name);
}

test('three scans produce three rows', () => {
  const path = tempDb();
  const store = openScanStore(path);
  assert.ok(store.db, 'store should have opened');

  recordScan({ deviceId: 'device-a', kind: 'barcode', query: '0060383888885', resolvedCode: '60383888885', resolvedLabel: 'Ovaltine', confidence: 0.99, source: 'pack', outcome: 'answered' });
  recordScan({ deviceId: 'device-a', kind: 'text', query: 'oat milk', resolvedCode: null, resolvedLabel: null, confidence: null, source: 'search', outcome: 'refused' });
  recordScan({ deviceId: 'device-a', kind: 'photo', query: 'blue box cereal', resolvedCode: '111', resolvedLabel: 'Cereal', confidence: 0.5, source: 'vision', outcome: 'answered' });

  const rows = allScans(store);
  console.log('three-scan rows:', JSON.stringify(rows, null, 2));
  assert.equal(rows.length, 3);
});

test('a corrected scan is marked and weeklyCount drops by one', () => {
  const path = tempDb();
  openScanStore(path);
  const device = 'device-b';

  recordScan({ deviceId: device, kind: 'barcode', query: '111', outcome: 'answered' });
  const id = recordScan({ deviceId: device, kind: 'barcode', query: '222', outcome: 'answered' });
  assert.ok(id !== null);

  const before = weeklyCount(device);
  correctScan(id, '222-corrected');
  const after = weeklyCount(device);

  console.log(`weeklyCount before correction: ${before}, after: ${after}`);
  assert.equal(before, 2);
  assert.equal(after, 1);

  const store = openScanStore(path);
  const corrected = allScans(store).find((r) => r.id === id);
  assert.equal(corrected.outcome, 'corrected');
  assert.equal(corrected.corrected_code, '222-corrected');
});

test('a refused scan does not increment weeklyCount', () => {
  const path = tempDb();
  openScanStore(path);
  const device = 'device-c';

  const beforeCount = weeklyCount(device);
  recordScan({ deviceId: device, kind: 'text', query: 'anything', outcome: 'refused' });
  const afterCount = weeklyCount(device);

  console.log(`weeklyCount before refused scan: ${beforeCount}, after: ${afterCount}`);
  assert.equal(beforeCount, 0);
  assert.equal(afterCount, 0);
});

test('the week boundary is UTC Monday 00:00: only the recent row counts', () => {
  const path = tempDb();
  openScanStore(path);
  const device = 'device-d';

  const now = new Date();
  const day = now.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday, 0, 0, 0, 0));
  // Last Tuesday: eight days before this week's Monday plus one day, i.e.
  // safely inside the previous week no matter which day "now" falls on.
  const lastTuesday = new Date(thisMonday.getTime() - 6 * 24 * 60 * 60 * 1000);

  recordScan({ deviceId: device, kind: 'barcode', query: 'old', outcome: 'answered', scannedAt: lastTuesday.toISOString() });
  recordScan({ deviceId: device, kind: 'barcode', query: 'new', outcome: 'answered', scannedAt: now.toISOString() });

  const count = weeklyCount(device, now);
  console.log(`week boundary: this Monday 00:00 UTC = ${thisMonday.toISOString()}, last Tuesday row = ${lastTuesday.toISOString()}, today row = ${now.toISOString()}, weeklyCount = ${count}`);
  assert.equal(count, 1, 'only the row dated in the current week should count');
});

test('recordScan never throws when the store cannot be written, and the drop is counted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-scans-'));
  const blocker = join(dir, 'blocker');
  writeFileSync(blocker, 'not a directory');
  const badPath = join(blocker, 'sub', 'scans.db');

  const store = openScanStore(badPath);
  assert.equal(store.db, null, 'the bad path should have failed to open');
  assert.ok(store.droppedWhy.length > 0);

  assert.doesNotThrow(() => recordScan({ deviceId: 'device-e', kind: 'barcode', query: 'x', outcome: 'answered' }));
  console.log(`bad path: dropped=${store.dropped}, droppedWhy="${store.droppedWhy}"`);
  assert.equal(store.dropped, 1, 'the failed write is counted');
  assert.ok(store.droppedWhy.length > 0, 'the reason is exposed, not just the count');

  assert.doesNotThrow(() => weeklyCount('device-e'));
  assert.doesNotThrow(() => correctScan(1, 'whatever'));
});
