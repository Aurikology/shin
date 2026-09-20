/**
 * Item 14 (docs/scanner-build-order-2026-09-19.md, section 14): the gap table
 * and its report already existed, wired only to catalogue-search misses. A
 * Gemini-path miss (server.ts's one call comes back naming nothing) is a
 * finding too, and now lands in the same table through the same `recordGap`.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-gap-route-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

const { server, setGeminiTransportForTests } = await import('../server.ts');
const { fakeTransport, httpBody } = await import('./gemini-double.ts');
const { activeGapLog } = await import('../../catalogue/src/gaps.ts');
const { clearRepeatCacheForTests } = await import('../src/repeat-cache.ts');

interface GapRow {
  kind: string;
  key: string;
  gtin: string | null;
  query_text: string | null;
  count: number;
  note: string | null;
}

function gapRows(): GapRow[] {
  const log = activeGapLog();
  if (!log?.db) return [];
  return log.db.prepare('SELECT kind, key, gtin, query_text, count, note FROM gap ORDER BY key ASC').all() as unknown as GapRow[];
}

let port = 0;
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => {
  setGeminiTransportForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

const identify = (q: string) =>
  fetch(`http://127.0.0.1:${port}/api/identify?${q}`).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));

test('a Gemini-path miss on a barcode is a gap row, keyed by the digits', async () => {
  const before = gapRows().length;
  setGeminiTransportForTests(fakeTransport(() => ({ text: httpBody('I could not identify this barcode.') })).transport);
  const { body } = await identify('gtin=0000000000055&deviceId=gap-a');
  assert.equal(body.unchecked.name, null, 'the scan was not even marked as a miss');
  const rows = gapRows();
  assert.equal(rows.length, before + 1, 'a Gemini-path miss left no new gap row');
  const row = rows.find((r) => r.gtin === '55' || r.key === '55');
  assert.ok(row, 'the gap row was not keyed by the scanned digits');
  assert.match(String(row!.note), /^gemini_miss:/, 'the gap row did not say it came from the Gemini path');
});

test('a Gemini answer that DOES name a product adds no gap row', async () => {
  const before = gapRows().length;
  setGeminiTransportForTests(fakeTransport().transport);
  const { body } = await identify('gtin=0068100084245&deviceId=gap-b');
  assert.notEqual(body.unchecked.name, null, 'a fully-named answer came back with no name');
  assert.equal(gapRows().length, before, 'a named answer still added a gap row');
});

test('two misses of the same barcode roll into one row with count 2, not two rows', async () => {
  setGeminiTransportForTests(fakeTransport(() => ({ text: httpBody('nothing here') })).transport);
  await identify('gtin=0000000000086&deviceId=gap-c1');
  // Item 1's repeat-scan cache would otherwise serve the second scan of this
  // same barcode from cache, never re-running the Gemini-miss check this
  // test is about.
  clearRepeatCacheForTests();
  await identify('gtin=0000000000086&deviceId=gap-c2');
  const rows = gapRows().filter((r) => r.gtin === '86' || r.key === '86');
  assert.equal(rows.length, 1, 'two misses of the same barcode became two separate gap rows');
  assert.equal(rows[0].count, 2);
});
