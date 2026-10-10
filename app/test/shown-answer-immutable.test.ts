/**
 * Requirement 3.9 (docs/price-category-requirements-2026-10-01.md): "Never
 * change an answer already shown; store a better one separately. Pass when: 0
 * edits to shown answers." Plan Part 6, 3.9: "Database triggers forbid editing
 * a shown answer."
 *
 * Written before the fix (RULINGS.md "Errors never go unnoticed ... the test
 * comes before the fix"). What it found on the code as it stood 2026-10-09:
 *   - no trigger: a raw UPDATE of a shown verdict went through;
 *   - `updateScan` overwrote a shown `estimate_*` verdict, and it is called that
 *     way by `/api/price` naming a typed scan that already showed a verdict
 *     (server.ts, `typedFromOwnData` with `existingScanId`);
 *   - `markScan` overwrote a shown `verdict_zone` when `/api/price` re-ran the
 *     Gemini path on an existing scan.
 *
 * Controls (RULINGS.md "Everything is an assumption until tested"): a field
 * that is not part of the shown answer (the typed price, the photo path, the
 * enrichment columns) must still be writable, and a verdict filled into a row
 * that showed none (a typed row named later by `/api/price`) must still land.
 * A trigger that refused everything would pass the known-bad cases and fail
 * these.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHarness, TATERS_TEXT, type Harness } from './customer-data-harness.ts';

let h: Harness;
before(async () => {
  h = await startHarness('shown-answer');
});
after(async () => {
  await h.close();
});

/** A separate scan store for the function-level cases; the route cases use the server's own. */
async function unitStore() {
  const scans = await import('../src/scans.ts');
  const store = scans.openScanStore(join(mkdtempSync(join(tmpdir(), 'shin-shown-unit-')), 'scans.db'));
  return { scans, store };
}

const SHOWN = {
  estimateBasis: 'leaf_category',
  estimateConfidence: 'medium',
  estimateZone: 'good',
  estimateCentreCents: 499,
  estimateSigmaLog: 0.2,
} as const;

test('3.9 known-bad: a raw UPDATE of a shown answer field is refused by the database itself', async () => {
  const { scans, store } = await unitStore();
  // Every column under test holds a value: a NULL may be filled once (the control below), so it would prove nothing here.
  const id = scans.recordScan({
    deviceId: 'd-raw',
    kind: 'barcode',
    query: '1',
    outcome: 'answered',
    resolvedCode: '1',
    resolvedLabel: 'A label',
    source: 'shin_own_data',
    ...SHOWN,
  })!;
  const shownColumns = ['estimate_zone', 'estimate_centre_cents', 'estimate_basis', 'resolved_code', 'resolved_label', 'source'];
  for (const col of shownColumns) {
    assert.throws(
      () => store.db!.prepare(`UPDATE scan SET ${col} = ? WHERE id = ?`).run(col === 'estimate_centre_cents' ? 1 : 'edited', id),
      /shown answer/i,
      `the database let ${col} of a shown answer be edited`,
    );
  }
  // And the verdict_* columns once they hold a value.
  store.db!.prepare('UPDATE scan SET verdict_zone = ? WHERE id = ?').run('middle', id);
  assert.throws(() => store.db!.prepare('UPDATE scan SET verdict_zone = ? WHERE id = ?').run('over_your_line', id), /shown answer/i);
  const row = scans.getScan(id)! as unknown as Record<string, unknown>;
  assert.equal(row.estimate_zone, 'good');
  assert.equal(row.verdict_zone, 'middle');
});

test('3.9 control: fields that are not the shown answer stay writable, and an empty verdict can be filled once', async () => {
  const { scans, store } = await unitStore();
  const id = scans.recordScan({ deviceId: 'd-ctl', kind: 'text', query: 'x', outcome: 'answered' })!;
  assert.ok(scans.updateScan(id, { typedPriceCents: 300 }));
  assert.ok(scans.updateScan(id, { typedPriceCents: 350 }), 'the typed price is the shopper\'s, and they may re-type it');
  assert.ok(scans.updateScan(id, { photoPath: 'a.jpg' }));
  assert.ok(scans.updateScan(id, { photoPath: null }), 'a consent withdrawal must still clear a photo path');
  assert.ok(scans.enrichScan(id, { priceCents: 299, verdictZone: 'great' }));
  // A typed row written before its verdict was known: filled once.
  assert.ok(scans.updateScan(id, SHOWN), 'a verdict could not be filled into a row that showed none');
  const row = scans.getScan(id)!;
  assert.equal(row.estimate_zone, 'good');
  assert.equal(row.typed_price_cents, 350);
  // Writing the same value again is not an edit.
  store.db!.prepare('UPDATE scan SET estimate_zone = ? WHERE id = ?').run('good', id);
  // A correction still marks the scan.
  scans.correctScan(id, '123');
  assert.equal(scans.getScan(id)!.outcome, 'corrected');
});

test('3.9 known-bad: updateScan with a different verdict leaves the shown one and stores the new one beside it', async () => {
  const { scans, store } = await unitStore();
  const id = scans.recordScan({ deviceId: 'd-upd', kind: 'barcode', query: '1', outcome: 'answered', ...SHOWN })!;
  scans.updateScan(id, { ...SHOWN, estimateZone: 'bad', estimateCentreCents: 999 });
  const row = scans.getScan(id)!;
  assert.equal(row.estimate_zone, 'good', 'updateScan overwrote the shown verdict');
  assert.equal(row.estimate_centre_cents, 499);
  const later = store.db!.prepare('SELECT * FROM scan_later_answer WHERE scan_id = ?').all(id) as Record<string, unknown>[];
  assert.equal(later.length, 1, 'the later answer was not stored beside the shown one');
  const answer = JSON.parse(String(later[0]!.answer_json));
  assert.equal(answer.estimate_zone, 'bad');
  assert.equal(answer.estimate_centre_cents, 999);
});

test('3.9 known-bad: markScan on a scan that already showed a zone stores the new zone beside it', async () => {
  const { scans, store } = await unitStore();
  const { markScan } = await import('../src/scan-marks.ts');
  const id = scans.recordScan({ deviceId: 'd-mark', kind: 'barcode', query: '1', outcome: 'answered' })!;
  assert.ok(markScan(id, { verdictZone: 'middle', verdictThresholdsJson: '{"a":1}', overCap: false }));
  markScan(id, { verdictZone: 'over_your_line', verdictThresholdsJson: '{"a":2}', overCap: true });
  const row = scans.getScan(id)! as unknown as Record<string, unknown>;
  assert.equal(row.verdict_zone, 'middle', 'markScan overwrote the shown zone');
  assert.equal(row.verdict_thresholds_json, '{"a":1}');
  assert.equal(row.over_cap, 1, 'the over-cap mark is not the answer and still records');
  const later = store.db!.prepare('SELECT answer_json FROM scan_later_answer WHERE scan_id = ?').all(id) as { answer_json: string }[];
  assert.equal(later.length, 1);
  assert.equal(JSON.parse(later[0]!.answer_json).verdict_zone, 'over_your_line');
});

test('3.9 route: /api/price naming a typed scan that already showed a verdict does not edit it', async () => {
  const device = 'shown-route';
  const first = await h.get(`/api/identify?text=${encodeURIComponent(TATERS_TEXT)}&shelfPriceCents=299&countryCode=CA&region=British%20Columbia&deviceId=${device}`);
  const scanId = first.scanId as number;
  assert.equal(typeof scanId, 'number', `the typed answer carried no scan id: ${JSON.stringify(first).slice(0, 300)}`);
  assert.ok(first.verdict, 'the fixture gave no verdict, so this case tests nothing');
  const [shown] = h.rows<Record<string, unknown>>('SELECT * FROM scan WHERE id = ?', scanId);
  assert.ok(shown!.estimate_zone, 'the shown verdict was not recorded on the scan');

  const res = await h.post('/api/price', {
    deviceId: device,
    scanId,
    text: TATERS_TEXT,
    shelfPriceCents: 2499,
    countryCode: 'CA',
    region: 'British Columbia',
  });
  assert.equal(res.status, 200);
  const [after] = h.rows<Record<string, unknown>>('SELECT * FROM scan WHERE id = ?', scanId);
  for (const col of ['estimate_basis', 'estimate_confidence', 'estimate_zone', 'estimate_centre_cents', 'estimate_sigma_log']) {
    assert.equal(after![col], shown![col], `/api/price edited the shown ${col}`);
  }
  // The second shelf price must give a different word, or this case tests nothing.
  assert.ok(res.body.verdict, 'the price call carried no verdict');
  assert.notEqual(res.body.verdict.shopper.zone, shown!.estimate_zone, 'the fixture did not cross zones');
  assert.equal(res.body.verdict.shopper.zone, 'bad');
  const later = h.rows<{ via: string; answer_json: string }>('SELECT via, answer_json FROM scan_later_answer WHERE scan_id = ?', scanId);
  assert.equal(later.length, 1, 'the second answer was not stored beside the first');
  assert.equal(later[0]!.via, 'api_price_typed');
  assert.equal(JSON.parse(later[0]!.answer_json).estimate_zone, 'bad');
});

test('3.9 audit: the scan table carries the trigger, and the later-answer table refuses edits too', async () => {
  const { store } = await unitStore();
  const triggers = (store.db!.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as { name: string }[]).map((t) => t.name);
  assert.ok(triggers.includes('scan_shown_answer_immutable'), `no shown-answer trigger: ${triggers.join(', ')}`);
  store.db!.prepare("INSERT INTO scan_later_answer (scan_id, via, answer_json, recorded_at) VALUES (1, 'test', '{}', 'now')").run();
  assert.throws(() => store.db!.prepare("UPDATE scan_later_answer SET answer_json = '{\"x\":1}'").run(), /shown answer/i);
});
