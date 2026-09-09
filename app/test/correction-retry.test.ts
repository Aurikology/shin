/**
 * A retried correction does not mark a second scan as wrong.
 *
 * The client id on a correction exists for the aisle with no signal: the phone
 * re-sends anything it has no acknowledgement for, so the same id arriving
 * twice must change nothing. `recordCorrection` honoured that and reported the
 * retry with the same shape as a fresh store, and the server then ran the
 * scan-marking step again. The scan marked the first time no longer read
 * `answered`, so the second lookup found the device's PREVIOUS scan of the same
 * product and marked that one wrong too. Corrections inflated, the named rate
 * deflated, and a correct answer stopped being metered -- from one resend.
 *
 * Both stores are pointed at temp files BEFORE the modules load, because each
 * resolves its path once at import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'shin-retry-'));
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_SCANS = join(dir, 'scans.db');

const { recordCorrection } = await import('../../price/src/corrections.ts');
const { openScanStore, recordScan, lastAnsweredScan, correctScan, allScans } = await import('../src/scans.ts');

const correction = (clientId: string) => ({
  clientId,
  deviceId: 'phone-1',
  code: '0068100084245',
  productId: 'kd-225',
  label: 'Kraft Dinner 225 g',
  category: 'grocery',
  seller: 'Metro',
  priceCents: 249,
  kind: 'regular' as const,
  seenOn: '2026-09-08',
});

/** What the server does after a store: mark the scan, but only on a fresh store. */
function markLikeTheServer(result: ReturnType<typeof recordCorrection>) {
  if (result.ok && !result.alreadyStored) {
    const scanId = lastAnsweredScan('phone-1', '0068100084245');
    if (scanId !== null) correctScan(scanId, '0068100084245');
  }
}

test('a retry reports itself as already stored', () => {
  const first = recordCorrection(correction('client-a'));
  const again = recordCorrection(correction('client-a'));
  assert.ok(first.ok && again.ok);
  assert.equal(first.alreadyStored, false);
  assert.equal(again.alreadyStored, true);
  assert.equal(again.id, first.id, 'a retry produced a second row');
});

test('two scans, one correction sent twice: exactly one scan is marked', () => {
  const store = openScanStore();
  assert.ok(store.db);
  // Yesterday's scan of the same product, answered correctly, and today's.
  recordScan({ deviceId: 'phone-1', kind: 'barcode', query: '0068100084245', resolvedCode: '0068100084245', outcome: 'answered', scannedAt: '2026-09-07T10:00:00.000Z' });
  recordScan({ deviceId: 'phone-1', kind: 'barcode', query: '0068100084245', resolvedCode: '0068100084245', outcome: 'answered', scannedAt: '2026-09-08T10:00:00.000Z' });

  markLikeTheServer(recordCorrection(correction('client-b')));
  markLikeTheServer(recordCorrection(correction('client-b'))); // the resend

  const outcomes = allScans(store).map((r) => r.outcome);
  assert.deepEqual(outcomes, ['answered', 'corrected'], 'the resend marked yesterday\'s correct scan as wrong');
});

test('the server gates the marking on a fresh store, not just on ok', () => {
  // `markLikeTheServer` above is a copy of the server's logic, which proves the
  // rule works and proves nothing about whether server.ts still applies it.
  // This pins the actual line, the same way notthis.test.mjs pins its gate.
  const server = readFileSync(fileURLToPath(new URL('../server.ts', import.meta.url)), 'utf8');
  assert.match(server, /if \(result\.ok && !result\.alreadyStored && correctedCode\)/);
});
