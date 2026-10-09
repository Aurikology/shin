/**
 * /api/health SHOWS EVERY FAULT THE SWALLOWED-ERROR FIXES NOW COUNT (category-check.ts, A7).
 *
 * The counters existed or were added next to each handler, but a counter nothing reads is a
 * silence with extra steps (`gapsDropped` sat in a field no screen opened). So health reports
 * all of them, in the same way it already reports `categoryFaults`:
 *
 *   gapsDropped, gapsDroppedWhy   misses the gap log could not take, in the worker AND here
 *   rangeFaults                   price/src/range.ts: unreadable url, date, category path
 *   catalogueFaults               app/src/catalogue-first.ts: lookup_failed, brand_lookup_failed
 *
 * Health stays `ok: true` for all of them: the shopper is served, and the fault is the report.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../../price/src/store.ts';
import { priceRangeFor, resetRangeFaultsForTests } from '../../price/src/range.ts';
import { openGapLog, recordGap } from '../../catalogue/src/gaps.ts';
import { answerBarcodeFromCatalogue, resetCatalogueFaultsForTests } from '../src/catalogue-first.ts';
import { canonicalBarcode } from '../src/barcode.ts';

const dir = mkdtempSync(join(tmpdir(), 'shin-health-faults-'));
process.env.SHIN_CATALOGUE_FIRST = '0';
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

const { server, setSearchServiceForTests } = await import('../server.ts');

let port = 0;
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  mock.method(console, 'warn', () => {});
});
after(async () => {
  mock.restoreAll();
  setSearchServiceForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

async function health(): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { connection: 'close' } });
  assert.equal(res.status, 200);
  return (await res.json()) as Record<string, unknown>;
}

/** A gap log that cannot open: a file sits where its directory has to be. */
function brokenGapLog() {
  const blocker = join(dir, 'blocker');
  writeFileSync(blocker, 'not a directory');
  return openGapLog(join(blocker, 'sub', 'gaps.db'));
}

test('control: with nothing wrong health is ok and every fault field is empty', async () => {
  openGapLog(join(dir, 'good-gaps.db'));
  resetRangeFaultsForTests();
  resetCatalogueFaultsForTests();
  const h = await health();
  assert.equal(h.ok, true);
  assert.equal(typeof h.categoryCheck, 'string', 'the existing fields are still there');
  assert.equal(h.gapsDropped, 0);
  assert.equal(h.gapsDroppedWhy, '');
  assert.deepEqual(h.rangeFaults, {});
  assert.deepEqual(h.catalogueFaults, {});
});

test('health reports the misses the gap log could not take, with the reason, from this thread and from the search worker', async () => {
  const log = brokenGapLog();
  recordGap({ gtin: '0000000000017' });
  recordGap({ gtin: '0000000000024' });
  assert.equal(log.dropped, 2);
  let h = await health();
  assert.equal(h.gapsDropped, 2);
  assert.equal(h.gapsDroppedWhy, log.droppedWhy);
  assert.equal(h.ok, true, 'the shopper is served: health stays ok');
  // The search runs in a worker thread, whose own count the service carries back with each reply.
  setSearchServiceForTests({ search: async () => ({}), gaps: () => ({ dropped: 3, why: 'attempt to write a readonly database' }) });
  h = await health();
  assert.equal(h.gapsDropped, 5, 'both threads, summed');
  assert.equal(h.gapsDroppedWhy, 'attempt to write a readonly database');
  setSearchServiceForTests(null);
});

test('health reports the range faults by kind', async () => {
  resetRangeFaultsForTests();
  const prices = openPrices(':memory:');
  const row: ObservationRow = {
    code: '0068100084245', seller: 'Walmart', sellerSku: 's', sellerName: 'x', sellerBrand: null, priceCents: 500, kind: 'regular',
    unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: null, joinMethod: 'gtin',
    seenOn: 'sometime in May', url: 'not a url', imageUrl: null, inStock: null,
  };
  recordObservation(prices, row);
  priceRangeFor({ barcode: '0068100084245', size: '500 g', asOf: '2026-09-27' }, { prices, catalogue: null });
  const h = await health();
  assert.deepEqual(h.rangeFaults, { unparseable_url: 1, unparseable_seen_on: 1 });
});

test('health reports the catalogue faults by kind', async () => {
  resetCatalogueFaultsForTests();
  const deps = {
    lookup: { byGtin: () => { throw new Error('database is locked'); } },
    prices: openPrices(':memory:'), catalogue: new DatabaseSync(':memory:'), country: 'CA', currency: 'CAD', asOf: '2026-09-27',
  };
  await answerBarcodeFromCatalogue(canonicalBarcode('0068100084245')!, deps);
  const h = await health();
  assert.deepEqual(h.catalogueFaults, { lookup_failed: 1 });
  assert.equal(h.ok, true);
});
