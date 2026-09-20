/**
 * Item 11 (docs/scanner-build-order-2026-09-19.md, section 11), ruling 7
 * (docs/decisions.md, "Nine rulings so the competitor-survey build could
 * start", 2026-09-19): a background enrichment writes BESIDE the shown value,
 * never over it, with its own timestamp. `enrichScan` (src/scans.ts) is the
 * first deferred-work write to reach a user-facing field; every earlier one
 * only ever wrote to an audit table nobody showed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openScanStore, recordScan, updateScan, getScan, enrichScan } from '../src/scans.ts';
import { markScan } from '../src/scan-marks.ts';

function freshStore() {
  const dir = mkdtempSync(join(tmpdir(), 'shin-enrich-'));
  return openScanStore(join(dir, 'scans.db'));
}

test('enrichScan writes to the enriched columns, and never touches the shown verdict_zone or typed_price_cents', () => {
  freshStore();
  const id = recordScan({ deviceId: 'd', kind: 'barcode', query: '0068100084245', outcome: 'answered' });
  markScan(id, { verdictZone: 'good', verdictThresholdsJson: null, overCap: false });
  updateScan(id!, { typedPriceCents: 449 });

  enrichScan(id!, { priceCents: 399, verdictZone: 'great' });
  const row = getScan(id!)!;

  // `verdict_zone` is a real column (scan-marks.ts) but deliberately not on
  // `ScanRow`'s own type, the same way `grounded_json` is not (see that
  // field's comment in scans.ts); read through a cast rather than widening
  // the shared type for one test.
  const shownZone = (row as unknown as { verdict_zone: string | null }).verdict_zone;
  assert.equal(shownZone, 'good', 'the shown verdict zone was overwritten by the background refresh');
  assert.equal(row.typed_price_cents, 449, 'the shown typed price was overwritten by the background refresh');
  assert.equal(row.enriched_price_cents, 399);
  assert.equal(row.enriched_verdict_zone, 'great');
  assert.ok(row.enriched_checked_at, 'checked_at was never set');
  assert.ok(row.enriched_updated_at, 'updated_at was never set on a genuine change');
});

test('checked_at moves on every call; updated_at moves only when the value actually changed', () => {
  freshStore();
  const id = recordScan({ deviceId: 'd2', kind: 'barcode', query: '0068100084245', outcome: 'answered' });

  enrichScan(id!, { priceCents: 300, verdictZone: 'middle' }, new Date('2026-09-19T10:00:00.000Z'));
  const afterFirst = getScan(id!)!;
  assert.equal(afterFirst.enriched_checked_at, '2026-09-19T10:00:00.000Z');
  assert.equal(afterFirst.enriched_updated_at, '2026-09-19T10:00:00.000Z');

  // Same values again, later: checked_at must move (a look happened), updated_at must not (nothing changed).
  enrichScan(id!, { priceCents: 300, verdictZone: 'middle' }, new Date('2026-09-19T11:00:00.000Z'));
  const afterSecond = getScan(id!)!;
  assert.equal(afterSecond.enriched_checked_at, '2026-09-19T11:00:00.000Z', 'checked_at did not move on a fresh look');
  assert.equal(afterSecond.enriched_updated_at, '2026-09-19T10:00:00.000Z', 'updated_at moved even though nothing changed');

  // A real change, later still: both move.
  enrichScan(id!, { priceCents: 275, verdictZone: 'middle' }, new Date('2026-09-19T12:00:00.000Z'));
  const afterThird = getScan(id!)!;
  assert.equal(afterThird.enriched_checked_at, '2026-09-19T12:00:00.000Z');
  assert.equal(afterThird.enriched_updated_at, '2026-09-19T12:00:00.000Z', 'updated_at did not move on a genuine change');
  assert.equal(afterThird.enriched_price_cents, 275);
});

test('a patch naming only one field leaves the other untouched', () => {
  freshStore();
  const id = recordScan({ deviceId: 'd3', kind: 'barcode', query: '0068100084245', outcome: 'answered' });
  enrichScan(id!, { priceCents: 300, verdictZone: 'middle' });
  enrichScan(id!, { priceCents: 250 });
  const row = getScan(id!)!;
  assert.equal(row.enriched_price_cents, 250);
  assert.equal(row.enriched_verdict_zone, 'middle', 'a patch naming only the price cleared the zone it never mentioned');
});

test('a scan id that names no row is a false, never a throw', () => {
  freshStore();
  assert.equal(enrichScan(999999, { priceCents: 100 }), false);
});
