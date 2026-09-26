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
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
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

const { server, setGeminiTransportForTests, setCatalogueForTests, settleBackgroundChecks } =
  await import('../server.ts');
const { fakeTransport } = await import('./gemini-double.ts');
const { activeGapLog, openGapLog, recordGap } = await import('../../catalogue/src/gaps.ts');
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
  assert.equal(
    row!.catalogue_missing,
    1,
    'the row does not say the CATALOGUE missed it, so it cannot be told apart from a model failure',
  );
  assert.match(String(row!.note), /catalogue_miss/, 'the note a person reads by eye is missing');
});

test('a later model-failure write on the same barcode cannot erase the catalogue fact', async () => {
  /*
   * THIS IS THE CASE THAT FAILED IN THE RUNNING APP, 2026-09-26, and the reason
   * `catalogue_missing` is a column at all. The earlier version of this file
   * asserted the meaning on `note`, and passed, because the fake Gemini transport
   * answers every scan with a name and so never writes a gap of its own. In the
   * real app the model path DOES write, microseconds later, on the same barcode,
   * and the log's upsert ends `note = COALESCE(excluded.note, note)`: last writer
   * wins. A live scan of a genuinely absent barcode came back holding
   * `gemini_miss:model_client_error` with a count of 2, meaning both writes landed
   * and the catalogue fact had been overwritten by the one fact it exists to be
   * distinguished from.
   *
   * The second writer is simulated by calling `recordGap` the same way the Gemini
   * path calls it, rather than by breaking the transport, so the test pins the
   * WRITE ORDER rather than one route's error handling.
   */
  setCatalogueForTests(oneProductCatalogue);
  const code = '0000000000116'; // valid check digit, absent from the double
  await identify(`gtin=${code}&deviceId=cat-order-e`);
  const keyed = (rows: GapRow[]) => rows.find((r) => r.key === code.replace(/^0+/, ''));
  assert.equal(keyed(gapRows())?.catalogue_missing, 1, 'the catalogue miss was never recorded');

  recordGap({ gtin: code, note: 'gemini_miss:model_client_error' });

  const after = keyed(gapRows());
  assert.equal(
    after?.catalogue_missing,
    1,
    'a model-failure write cleared the catalogue fact, which is how the log lied in the running app',
  );
  assert.match(String(after?.note), /gemini_miss/, 'the note should be the later writer’s, which is why it cannot hold the fact');
  assert.equal(after?.count, 2, 'both writers should be rolled into one finding');
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

test('a test scan writes its user-store entry into the temp dir, never into the live store', async () => {
  /*
   * THE LEAK THIS PINS, counted 2026-09-26: `SHIN_USER_CATALOGUE` was the one store
   * a test could not redirect by redirecting everything else, so 17 of the 21 tests
   * that boot this server were writing scans into `app/data/user-catalogue.db` --
   * the live store, and the very one the plan's cleanup unit exists to empty. It
   * held 18 products; nine are "Kraft Dinner" rows keyed 1 through 9 and two were
   * created by test runs tonight. Deleting them without this check means the next
   * `node --test` puts them back, which is why the check ships with the delete.
   *
   * This file deliberately does NOT set SHIN_USER_CATALOGUE, so it is the canary:
   * the path must be derived from SHIN_SCANS. Both halves are asserted, because
   * "the temp file exists" alone would also pass if the live file were written too.
   */
  const liveStore = fileURLToPath(new URL('../data/user-catalogue.db', import.meta.url));
  const countLive = (): number => {
    if (!existsSync(liveStore)) return -1;
    const db = new DatabaseSync(liveStore, { readOnly: true });
    try {
      return (db.prepare('SELECT count(*) AS c FROM user_product').get() as { c: number }).c;
    } finally {
      db.close();
    }
  };
  const tempStore = join(dir, 'user-catalogue.db');
  const countTemp = (): number => {
    if (!existsSync(tempStore)) return 0;
    const db = new DatabaseSync(tempStore, { readOnly: true });
    try {
      return (db.prepare('SELECT count(*) AS c FROM user_product').get() as { c: number }).c;
    } finally {
      db.close();
    }
  };
  const liveBefore = countLive();
  const tempBefore = countTemp();

  /*
   * A NEW barcode with a VALID check digit, and the counts are compared before and
   * against after. The first version of this test used `...124`, whose check digit
   * does not work out, so the route refused it before any store was touched and the
   * test passed on rows the earlier tests had already written. It ran in 20 ms,
   * which was the tell.
   */
  setCatalogueForTests(oneProductCatalogue);
  const { status } = await identify(`gtin=0000000000123&deviceId=cat-store-f`);
  assert.equal(status, 200, 'the scan was refused, so this test proves nothing about the store');
  await settleBackgroundChecks();

  /*
   * A floor, not an equality, and measured rather than assumed: one scan of an
   * absent barcode adds TWO entries here, because two independent paths feed this
   * store -- the miss log creates a bare entry keyed by the barcode
   * (`autoCreateFromMiss` in gaps.ts) and the answer path creates a named one
   * (`feedUserCatalogue` below `USER_CATALOGUE_PATH`). That is also why the live
   * store grew faster than the number of test scans. The floor still goes red on
   * the thing this pins, a scan that writes nowhere.
   */
  assert.ok(
    countTemp() >= tempBefore + 1,
    `the scan did not add its entry to the user store beside the temp scan store (${tempBefore} before, ${countTemp()} after)`,
  );
  assert.equal(
    countLive(),
    liveBefore,
    'a test scan added a row to the LIVE user store, which is the leak that filled it with test products',
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
