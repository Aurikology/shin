/**
 * The reader over the scan log.
 *
 * What is worth testing here is the two ways a figure can lie. A rate over an
 * empty denominator printed as 0% reads as a measured failure when it is an
 * absence of measurement, and that is this repo's first priority written as a
 * number. And a return rate over people who have not had a second week yet
 * reports a product nobody has had time to abandon as one everybody abandoned.
 * Both are pure functions of rows, so both are testable without a browser.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openScanStore, recordScan, correctScan, lastAnsweredScan } from '../src/scans.ts';
import { summariseScans, UNATTRIBUTED } from '../src/scan-summary.ts';

const DAY = 86_400_000;
const at = (daysAgo: number, now: number) => new Date(now - daysAgo * DAY).toISOString();

function fresh() {
  return openScanStore(':memory:');
}

test('an empty log reports unknown, never zero percent', () => {
  fresh();
  const s = summariseScans();
  assert.equal(s.scans, 0);
  assert.equal(s.namedRate, null);
  assert.equal(s.correctionsPerHundred, null);
  assert.equal(s.secondWeekReturn.rate, null);
});

test('the identity answer rate is split by how the person asked', () => {
  fresh();
  recordScan({ deviceId: 'a', kind: 'barcode', query: '060383', outcome: 'answered', resolvedCode: '1' });
  recordScan({ deviceId: 'a', kind: 'barcode', query: '999', outcome: 'refused' });
  recordScan({ deviceId: 'a', kind: 'text', query: 'lays', outcome: 'answered', resolvedCode: '2' });

  const s = summariseScans();
  assert.equal(s.scans, 3);
  assert.equal(s.namedRate, 2 / 3);
  const barcode = s.perKind.find((k) => k.kind === 'barcode');
  assert.equal(barcode?.rate, 0.5);
  assert.equal(s.perKind.find((k) => k.kind === 'text')?.rate, 1);
});

test('a corrected scan stops counting as answered', () => {
  fresh();
  recordScan({ deviceId: 'a', kind: 'barcode', query: '1', outcome: 'answered', resolvedCode: 'X' });
  const id = lastAnsweredScan('a', 'X');
  assert.notEqual(id, null);
  correctScan(id!, 'X');

  const s = summariseScans();
  assert.equal(s.corrections, 1);
  assert.equal(s.namedRate, 0);
  // Nothing was left answered, so corrections per hundred named has no
  // denominator and must not come back as a very large number.
  assert.equal(s.correctionsPerHundred, null);
});

test('a correction finds the last scan of that product and no other', () => {
  fresh();
  recordScan({ deviceId: 'a', kind: 'barcode', query: '1', outcome: 'answered', resolvedCode: 'X' });
  recordScan({ deviceId: 'a', kind: 'barcode', query: '1', outcome: 'answered', resolvedCode: 'X' });
  recordScan({ deviceId: 'b', kind: 'barcode', query: '1', outcome: 'answered', resolvedCode: 'X' });

  const first = lastAnsweredScan('a', 'X');
  correctScan(first!, 'X');
  const second = lastAnsweredScan('a', 'X');
  assert.notEqual(second, first, 'a second correction must not mark the same row twice');
  assert.equal(lastAnsweredScan('a', 'Y'), null, 'a product never scanned has nothing to correct');
});

test('a device with no second week yet is not counted as having left', () => {
  const now = Date.now();
  fresh();
  // First scan four days ago: this person has not had a second week.
  recordScan({ deviceId: 'new', kind: 'barcode', query: '1', outcome: 'answered', scannedAt: at(4, now) });

  const s = summariseScans(undefined, new Date(now));
  assert.equal(s.secondWeekReturn.eligible, 0);
  assert.equal(s.secondWeekReturn.rate, null);
});

test('second week means days seven to thirteen, not any later scan', () => {
  const now = Date.now();
  fresh();
  // Came back on day 9: returned.
  recordScan({ deviceId: 'back', kind: 'barcode', query: '1', outcome: 'answered', scannedAt: at(30, now) });
  recordScan({ deviceId: 'back', kind: 'barcode', query: '2', outcome: 'answered', scannedAt: at(21, now) });
  // Scanned on day 1 and then not until day 20: eligible, did not return.
  recordScan({ deviceId: 'gone', kind: 'barcode', query: '1', outcome: 'answered', scannedAt: at(30, now) });
  recordScan({ deviceId: 'gone', kind: 'barcode', query: '2', outcome: 'answered', scannedAt: at(10, now) });

  const s = summariseScans(undefined, new Date(now));
  assert.equal(s.secondWeekReturn.eligible, 2);
  assert.equal(s.secondWeekReturn.returned, 1);
  assert.equal(s.secondWeekReturn.rate, 0.5);
});

test('an unattributed scan counts in the rate and in nothing about people', () => {
  fresh();
  recordScan({ deviceId: UNATTRIBUTED, kind: 'text', query: 'milk', outcome: 'answered', resolvedCode: '1' });
  recordScan({ deviceId: 'a', kind: 'text', query: 'bread', outcome: 'refused' });

  const s = summariseScans();
  assert.equal(s.scans, 2);
  assert.equal(s.unattributedScans, 1);
  assert.equal(s.devices, 1, 'the anonymous bucket is not a person');
  assert.equal(s.namedRate, 0.5);
});

test('this device gets its own week, counted from UTC Monday', () => {
  // A Wednesday, so Monday is two days back and a scan three days back is last week.
  const now = Date.parse('2026-09-09T12:00:00.000Z');
  fresh();
  recordScan({ deviceId: 'me', kind: 'barcode', query: '1', outcome: 'answered', scannedAt: at(1, now) });
  recordScan({ deviceId: 'me', kind: 'barcode', query: '2', outcome: 'refused', scannedAt: at(1, now) });
  recordScan({ deviceId: 'me', kind: 'barcode', query: '3', outcome: 'answered', scannedAt: at(3, now) });

  const s = summariseScans('me', new Date(now));
  assert.equal(s.thisDevice?.scansThisWeek, 2);
  assert.equal(s.thisDevice?.named, 1);
});
