/**
 * A BARCODE THE CATALOGUE DOES NOT HAVE MUST LEAVE A RECORD.
 *
 * Why this file exists, measured 2026-09-26. Three gap logs exist on this
 * machine (`catalogue/data/gaps.db`, `app/data/gaps.db`, and whatever `SHIN_GAPS`
 * points at). Between them they held 102 misses over 279 hits and **not one was
 * a barcode**. The recorder was never the problem: `gaps.ts` classifies a
 * barcode miss and `gemini-miss-gap.test.ts` proves a barcode row gets written.
 * The problem was what that row MEANT.
 *
 * The only barcode gap this server could write came from the Gemini path and
 * says "the model could not name it". That is a different fact from "our
 * catalogue does not hold it", and the second one is what every catalogue
 * decision needs. The identify route said why in its own words: "The catalogue
 * is not consulted for a barcode's answer." So the fact was never observable,
 * and with Gemini leaving, the one path that wrote barcode gaps leaves with it.
 *
 * These tests pin the fact, not the plumbing. What the shopper is shown does not
 * change.
 *
 * WHY A CATALOGUE DOUBLE AND NOT A REAL ONE. `setCatalogueForTests` is the seam
 * the route already uses for exactly this, because the real catalogue is a
 * 4.13 GB file no test machine has. An earlier version of this file built a
 * one-row sqlite catalogue instead; it passed, and then hung the test process on
 * exit, because attaching a real catalogue starts a worker thread the server
 * never closes (`catalogue/src/service.ts:153` has a `close()` the app is
 * documented as never calling). The double also makes the third case below
 * testable at all, which is the one that matters most.
 *
 * THE THIRD CASE IS THE POINT. With no catalogue attached the server must record
 * NOTHING, because "we cannot look" is not "we do not have it". A logger that
 * confuses those fills the log with invented misses and every count taken from
 * it afterwards is wrong. It is checked here directly, and again from the other
 * side by `gemini-miss-gap.test.ts`, which runs with no catalogue and asserts
 * exact row counts: if this check ever starts inventing misses, that file goes
 * red too, by a different route and a different author's assertions.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-catalogue-gap-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

const { server, setGeminiTransportForTests, setCatalogueForTests } = await import('../server.ts');
const { fakeTransport } = await import('./gemini-double.ts');
const { activeGapLog, openGapLog } = await import('../../catalogue/src/gaps.ts');
const { clearRepeatCacheForTests } = await import('../src/repeat-cache.ts');

/*
 * Every absent barcode here carries a VALID check digit, and that is not a
 * detail. The route refuses a barcode whose checksum does not work out, with
 * reason invalid_barcode, several lines before the catalogue is consulted. The
 * first version of this file used made-up digits and failed for that reason
 * rather than the one it was written to catch.
 */
const HELD = '0068100084245';
const ABSENT = '0000000000093';
const ABSENT_TWO = '0000000000109';

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
}

/*
 * Read through the log's own handle, never by asking the code that wrote it
 * whether it wrote. A check that trusts the writer is not a check.
 */
function gapRows(): GapRow[] {
  const log = activeGapLog();
  if (!log?.db) return [];
  return log.db
    .prepare('SELECT kind, key, gtin, query_text, count, note FROM gap ORDER BY key ASC')
    .all() as unknown as GapRow[];
}

let port = 0;
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  // Named answers throughout, so the Gemini path never writes a gap of its own
  // and every row these tests see came from the catalogue check.
  setGeminiTransportForTests(fakeTransport().transport);
  // Open the log up front so the no-catalogue case can read a real, empty table
  // rather than reading nothing and passing because there was nowhere to look.
  openGapLog(process.env.SHIN_GAPS);
});
after(async () => {
  setGeminiTransportForTests(null);
  setCatalogueForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

const identify = (q: string) =>
  fetch(`http://127.0.0.1:${port}/api/identify?${q}`).then(async (r) => ({
    status: r.status,
    body: (await r.json()) as Record<string, unknown>,
  }));

test('a barcode the catalogue does not hold leaves a gap row saying so', async () => {
  setCatalogueForTests(oneProductCatalogue);
  const before = gapRows().length;
  const { status } = await identify(`gtin=${ABSENT}&deviceId=cat-miss-a`);
  assert.equal(status, 200, 'the scan itself must still answer normally');
  const rows = gapRows();
  assert.equal(rows.length, before + 1, 'a barcode absent from the catalogue left no gap row');
  const row = rows.find((r) => r.gtin === ABSENT || r.key === ABSENT.replace(/^0+/, ''));
  assert.ok(row, 'the gap row was not keyed by the scanned barcode');
  assert.equal(row!.kind, 'gtin', 'the miss was filed as a typed search rather than a barcode');
  assert.match(
    String(row!.note),
    /catalogue_miss/,
    'the row does not say the CATALOGUE missed it, so it cannot be told apart from a model failure',
  );
});

test('a barcode the catalogue does hold leaves no gap row', async () => {
  setCatalogueForTests(oneProductCatalogue);
  const before = gapRows().length;
  const { status } = await identify(`gtin=${HELD}&deviceId=cat-hit-b`);
  assert.equal(status, 200);
  assert.equal(
    gapRows().length,
    before,
    'a barcode the catalogue holds was logged as a miss, which would poison every count taken from this log',
  );
});

test('with NO catalogue attached, an absent barcode records nothing at all', async () => {
  /*
   * The server is required to boot and serve every screen with no catalogue (the
   * comment above `CATALOGUE_DB` in server.ts). In that state nothing is known
   * about any barcode, so recording a miss would be fabricating evidence. This
   * is the assertion that stops the log filling with invented misses on any
   * machine or deployment where the 4.13 GB file is absent, which is most of
   * them.
   */
  setCatalogueForTests(null);
  clearRepeatCacheForTests();
  const before = gapRows().length;
  const { status } = await identify(`gtin=${ABSENT_TWO}&deviceId=cat-none-c`);
  assert.equal(status, 200, 'the scan must still answer with no catalogue attached');
  assert.equal(
    gapRows().length,
    before,
    'a miss was recorded while no catalogue was attached, which is a fabricated finding, not a finding',
  );
});

test('the same absent barcode twice is one row with count 2', async () => {
  setCatalogueForTests(oneProductCatalogue);
  await identify(`gtin=${ABSENT_TWO}&deviceId=cat-miss-d1`);
  /*
   * No cache clearing between the two scans, on purpose, and an earlier version
   * of this test cleared it with a comment claiming the repeat-scan cache would
   * otherwise skip the check. That was wrong: the cache is consulted inside
   * `completeGeminiScan`, which runs AFTER `noteCatalogueBarcodeMiss`, so the
   * catalogue check happens on every scan whether the answer came from cache or
   * not. Leaving the cache warm here is the stronger test, because a cached
   * second scan is exactly the case the false comment would have hidden.
   */
  await identify(`gtin=${ABSENT_TWO}&deviceId=cat-miss-d2`);
  const rows = gapRows().filter((r) => r.gtin === ABSENT_TWO || r.key === ABSENT_TWO.replace(/^0+/, ''));
  assert.equal(rows.length, 1, 'two scans of one absent barcode became two rows');
  assert.equal(rows[0].count, 2, 'the second scan of the same absent barcode was not counted');
});
