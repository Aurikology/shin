/**
 * A BARCODE THE CATALOGUE DOES NOT HAVE MUST LEAVE A RECORD -- computed offline.
 *
 * Why this file exists, measured 2026-09-26. Three gap logs existed on this
 * machine (`catalogue/data/gaps.db`, `app/data/gaps.db`, and whatever `SHIN_GAPS`
 * points at). Between them they held 102 misses over 279 hits and **not one was
 * a barcode**. The recorder was never the problem: `gaps.ts` classifies a
 * barcode miss and `gemini-miss-gap.test.ts` proves a barcode row gets written.
 * The problem was what that row MEANT: the only barcode gap the server could
 * write came from the Gemini path and says "the model could not name it", a
 * different fact from "our catalogue does not hold it".
 *
 * THIS FILE USED TO TEST THE ROUTE. A same-session fix made that impossible to
 * keep: his rule, quoted where `/api/identify` begins, is "the server will not
 * check shins own product list for now. The only thing the server will do is
 * call gemini." A catalogue check made from inside the request -- even queued
 * as a background task -- is still one call counted during the scan, and three
 * other tests (`gemini-one-call.test.ts`, `catalogue-feed.test.ts`,
 * `over-cap-verdict-offers.test.ts`) demand exactly zero. So the check moved out
 * of the route entirely, into `catalogue/src/gaps-from-scans.ts`, a pass over the
 * scan log the route never calls. These tests exercise that pass directly:
 * write scan rows the way the app would have, run the pass, read the gap log.
 * What the shopper is shown never enters into it.
 *
 * WHY A CATALOGUE DOUBLE AND NOT A REAL ONE. The real catalogue is a 4.13 GB
 * file no test machine has, and `gaps-from-scans.ts` takes any object shaped
 * like `{ byGtin(code) }`, so a one-product double stands in for it -- the same
 * seam `setCatalogueForTests` gives the route. The double also makes the case
 * below with NO catalogue testable at all, which is the one that matters most.
 *
 * THAT CASE IS THE POINT. With no catalogue attached the pass must record
 * NOTHING, because "we cannot look" is not "we do not have it". A logger that
 * confuses those fills the log with invented misses and every count taken from
 * it afterwards is wrong. It is checked here directly, and again from the other
 * side by `gemini-miss-gap.test.ts`, which runs the server with no catalogue and
 * asserts exact row counts.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dir = mkdtempSync(join(tmpdir(), 'shin-catalogue-gap-'));
const SCANS_PATH = join(dir, 'scans.db');
const GAPS_PATH = join(dir, 'gaps.db');
process.env.SHIN_SCANS = SCANS_PATH;
process.env.SHIN_GAPS = GAPS_PATH;

const { recordScan } = await import('../src/scans.ts');
const { activeGapLog, openGapLog, recordGap } = await import('../../catalogue/src/gaps.ts');
const { gapsFromScans } = await import('../../catalogue/src/gaps-from-scans.ts');

/*
 * Every absent barcode here carries a VALID check digit, and that is not a
 * detail: the identify route refuses a barcode whose checksum does not work
 * out before the catalogue is ever consulted, so a made-up code would test
 * that refusal instead of this pass.
 */
const HELD = '0068100084245';
const ABSENT = '0000000000093';
const ABSENT_TWO = '0000000000109';
const ABSENT_THREE = '0000000000116';
const ABSENT_FOUR = '0000000000123';

/** A catalogue holding exactly one product. The whole question is in or out. */
const oneProductCatalogue = {
  byGtin(code: string): unknown {
    const norm = (s: string) => s.replace(/\D/g, '').replace(/^0+/, '');
    return norm(code) === norm(HELD) ? { code: HELD, name: 'Kraft Dinner Original 225 g' } : null;
  },
};

interface GapRow {
  kind: string;
  key: string;
  gtin: string | null;
  query_text: string | null;
  count: number;
  note: string | null;
  catalogue_missing: number;
}

/*
 * Read through the log's own handle, never by asking the code that wrote it
 * whether it wrote. A check that trusts the writer is not a check.
 */
function gapRows(): GapRow[] {
  const log = activeGapLog();
  if (!log?.db) return [];
  return log.db
    .prepare('SELECT kind, key, gtin, query_text, count, note, catalogue_missing FROM gap ORDER BY key ASC')
    .all() as unknown as GapRow[];
}

let barcodeScanCounter = 0;
/** Writes one barcode scan row the way the route does, with a fresh device each time. */
function writeBarcodeScan(gtin: string): void {
  barcodeScanCounter += 1;
  recordScan({
    deviceId: `gap-pass-${barcodeScanCounter}`,
    kind: 'barcode',
    query: gtin,
    resolvedCode: gtin,
    outcome: 'answered',
  });
}

before(() => {
  // Open the log up front so every case reads a real, empty table rather than
  // reading nothing and passing because there was nowhere to look.
  openGapLog(GAPS_PATH);
});
after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

test('a barcode the catalogue does not hold leaves a gap row saying so', () => {
  const before = gapRows().length;
  writeBarcodeScan(ABSENT);
  const summary = gapsFromScans({ scansPath: SCANS_PATH, gapsPath: GAPS_PATH, catalogue: oneProductCatalogue, apply: true });
  assert.equal(summary.written, 1, 'the pass did not write the one new miss it found');
  const rows = gapRows();
  assert.equal(rows.length, before + 1, 'a barcode absent from the catalogue left no gap row');
  const row = rows.find((r) => r.gtin === ABSENT || r.key === ABSENT.replace(/^0+/, ''));
  assert.ok(row, 'the gap row was not keyed by the scanned barcode');
  assert.equal(row!.kind, 'gtin', 'the miss was filed as a typed search rather than a barcode');
  assert.equal(
    row!.catalogue_missing,
    1,
    'the row does not say the CATALOGUE missed it, so it cannot be told apart from a model failure',
  );
  assert.match(String(row!.note), /catalogue_miss/, 'the note a person reads by eye is missing');
});

test('a later model-failure write on the same barcode cannot erase the catalogue fact', () => {
  /*
   * THIS IS THE CASE THAT FAILED IN THE RUNNING APP, 2026-09-26, and the reason
   * `catalogue_missing` is a column at all. Asserting the meaning on `note`
   * alone passes when nothing else ever writes the same key, and fails in the
   * real app, where the Gemini path writes a gap on the same barcode
   * microseconds later and the log's upsert ends `note = COALESCE(excluded.note,
   * note)`: last writer wins. A live scan of a genuinely absent barcode came
   * back holding `gemini_miss:model_client_error` with a count of 2, meaning
   * both writes landed and the catalogue fact had been overwritten by the one
   * fact it exists to be distinguished from.
   *
   * The second writer is simulated by calling `recordGap` the same way the
   * Gemini path calls it, rather than by breaking a transport, so the test pins
   * the WRITE ORDER rather than one route's error handling.
   */
  writeBarcodeScan(ABSENT_THREE);
  gapsFromScans({ scansPath: SCANS_PATH, gapsPath: GAPS_PATH, catalogue: oneProductCatalogue, apply: true });
  const keyed = (rows: GapRow[]) => rows.find((r) => r.key === ABSENT_THREE.replace(/^0+/, ''));
  assert.equal(keyed(gapRows())?.catalogue_missing, 1, 'the catalogue miss was never recorded');

  recordGap({ gtin: ABSENT_THREE, note: 'gemini_miss:model_client_error' });

  const after = keyed(gapRows());
  assert.equal(
    after?.catalogue_missing,
    1,
    'a model-failure write cleared the catalogue fact, which is how the log lied in the running app',
  );
  assert.match(String(after?.note), /gemini_miss/, 'the note should be the later writer’s, which is why it cannot hold the fact');
  assert.equal(after?.count, 2, 'both writers should be rolled into one finding');
});

test('a barcode the catalogue does hold leaves no gap row', () => {
  const before = gapRows().length;
  writeBarcodeScan(HELD);
  const summary = gapsFromScans({ scansPath: SCANS_PATH, gapsPath: GAPS_PATH, catalogue: oneProductCatalogue, apply: true });
  assert.equal(summary.written, 0, 'a held barcode was written as a miss');
  assert.equal(
    gapRows().length,
    before,
    'a barcode the catalogue holds was logged as a miss, which would poison every count taken from this log',
  );
});

test('with NO catalogue attached, an absent barcode records nothing at all', () => {
  /*
   * With no catalogue given, nothing is known about any barcode, so recording
   * a miss would be fabricating evidence. This is the assertion that stops the
   * log filling with invented misses on any machine or deployment where the
   * 4 GB file is absent, which is most of them -- and it also proves the scan
   * is not consumed by a watermark it can never satisfy: a later run in this
   * same file, with a catalogue, still finds this barcode's earlier scans.
   */
  const before = gapRows().length;
  writeBarcodeScan(ABSENT_FOUR);
  const summary = gapsFromScans({ scansPath: SCANS_PATH, gapsPath: GAPS_PATH, catalogue: null, apply: true });
  assert.equal(summary.written, 0, 'a miss was recorded while no catalogue was attached');
  assert.equal(
    gapRows().length,
    before,
    'a miss was recorded while no catalogue was attached, which is a fabricated finding, not a finding',
  );

  // The scan is still there once a catalogue is actually reachable.
  const summaryNow = gapsFromScans({ scansPath: SCANS_PATH, gapsPath: GAPS_PATH, catalogue: oneProductCatalogue, apply: true });
  assert.equal(summaryNow.written, 1, 'a scan made with no catalogue attached was lost rather than deferred');
  const row = gapRows().find((r) => r.key === ABSENT_FOUR.replace(/^0+/, ''));
  assert.equal(row?.catalogue_missing, 1);
});

test('the same absent barcode twice is one row with count 2', () => {
  writeBarcodeScan(ABSENT_TWO);
  writeBarcodeScan(ABSENT_TWO);
  const summary = gapsFromScans({ scansPath: SCANS_PATH, gapsPath: GAPS_PATH, catalogue: oneProductCatalogue, apply: true });
  assert.equal(summary.written, 2, 'the pass did not see both scans of the same absent barcode');
  const rows = gapRows().filter((r) => r.gtin === ABSENT_TWO || r.key === ABSENT_TWO.replace(/^0+/, ''));
  assert.equal(rows.length, 1, 'two scans of one absent barcode became two rows');
  assert.equal(rows[0].count, 2, 'the second scan of the same absent barcode was not counted');

  // Safe to run twice: nothing new happened, so a repeat run must write nothing
  // and must not double the count already on the books.
  const again = gapsFromScans({ scansPath: SCANS_PATH, gapsPath: GAPS_PATH, catalogue: oneProductCatalogue, apply: true });
  assert.equal(again.written, 0, 'a second run over the same scans wrote again');
  const rowsAfter = gapRows().filter((r) => r.gtin === ABSENT_TWO || r.key === ABSENT_TWO.replace(/^0+/, ''));
  assert.equal(rowsAfter[0].count, 2, 'a second run over the same scans doubled the count');
});
