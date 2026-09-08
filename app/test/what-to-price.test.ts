/**
 * The crawl ordering, from the scan counts it reads to the report that prints
 * it.
 *
 * `price/src/queue.ts` was the last of DEFECTS.md D-026's four to have no
 * caller, and it was worse than uncalled: its `readScanCounts` seam defaults to
 * an empty map, and with no scans its own MAIN RESULT -- scanned products that
 * nothing can price -- is empty by construction. The module could be run and
 * would answer nothing, forever, without ever looking broken.
 *
 * So what is worth covering is the two halves that can be quietly wrong:
 * the counting, whose window and inclusions are decisions rather than
 * mechanics, and the report's refusal to say "nothing to price" when what
 * actually happened is "I could not read the prices database".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { openScanStore, recordScan, scanCountsByCode } from '../src/scans.ts';

const fresh = () => join(mkdtempSync(join(tmpdir(), 'shin-queue-')), 'scans.db');
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

test('counts are across every device, because the question is about the catalogue', () => {
  openScanStore(fresh());
  recordScan({ deviceId: 'a', kind: 'barcode', query: '1', resolvedCode: '111', outcome: 'answered' });
  recordScan({ deviceId: 'b', kind: 'barcode', query: '1', resolvedCode: '111', outcome: 'answered' });
  recordScan({ deviceId: 'c', kind: 'barcode', query: '1', resolvedCode: '111', outcome: 'answered' });
  recordScan({ deviceId: 'a', kind: 'barcode', query: '2', resolvedCode: '222', outcome: 'answered' });
  recordScan({ deviceId: 'a', kind: 'barcode', query: '2', resolvedCode: '222', outcome: 'answered' });
  // Three people wanting one thing outranks one person wanting another twice.
  const counts = scanCountsByCode();
  assert.equal(counts.get('111'), 3);
  assert.equal(counts.get('222'), 2);
});

test('a refusal counts here, and that is the opposite of the routing reader', () => {
  openScanStore(fresh());
  recordScan({ deviceId: 'a', kind: 'barcode', query: '1', resolvedCode: '111', outcome: 'refused' });
  // A scan we could not answer is the strongest reason to go and price a thing.
  assert.equal(scanCountsByCode().get('111'), 1);
});

test('a scan with no resolved code is not countable work', () => {
  openScanStore(fresh());
  recordScan({ deviceId: 'a', kind: 'text', query: 'something', outcome: 'refused' });
  // There is no code for a crawler to act on, so it is not in the map at all.
  assert.equal(scanCountsByCode().size, 0);
});

test('the window keeps the question about what to price NEXT', () => {
  openScanStore(fresh());
  for (let i = 0; i < 50; i++) {
    recordScan({ deviceId: 'a', kind: 'barcode', query: '1', resolvedCode: 'old', outcome: 'answered', scannedAt: daysAgo(60) });
  }
  recordScan({ deviceId: 'a', kind: 'barcode', query: '2', resolvedCode: 'now', outcome: 'answered' });
  const counts = scanCountsByCode(7);
  assert.equal(counts.get('old'), undefined, 'a burst two months ago is not demand today');
  assert.equal(counts.get('now'), 1);
  // The window is a parameter, not a constant: a wider question is askable.
  assert.equal(scanCountsByCode(90).get('old'), 50);
});

test('a store that will not open counts nothing rather than throwing', () => {
  openScanStore(join(fresh(), 'nested', '\0bad'));
  assert.equal(scanCountsByCode().size, 0);
});

test('the report refuses to call a missing prices database "nothing to price"', () => {
  const script = fileURLToPath(new URL('../src/what-to-price.ts', import.meta.url));
  const out = execFileSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, SHIN_PRICES: join(mkdtempSync(join(tmpdir(), 'shin-noprices-')), 'absent.db') },
  });
  assert.match(out, /No prices database at/);
  assert.match(out, /This is not "nothing to price"/);
  assert.doesNotMatch(out, /already has a price on file/);
});
