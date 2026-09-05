/**
 * Tests for the crawl ordering: what gets reported as unreachable, what gets
 * queued, in what order, and what backoff holds back.
 *
 * `queue.ts` opens its database read-only, so a fixture here is built with
 * `store.ts`'s own writer (`openPrices`, `recordObservation`, `recordAttempt`)
 * against a real temp file, closed, then reopened by `nextToPrice` the same
 * way a background crawl's writer and this file's reader would coexist on
 * `price/data/prices.db`. `:memory:` cannot be used for this because two
 * separate `:memory:` connections never share the same database.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPrices, recordObservation, recordAttempt, type ObservationRow } from '../src/store.ts';
import { nextToPrice, intervalDaysFor, backoffDaysFor, emptyScanCounts } from '../src/queue.ts';

function obs(over: Partial<ObservationRow> & { code: string; seenOn: string }): ObservationRow {
  return {
    seller: 'openprices',
    sellerSku: `sku-${over.code}-${over.seenOn}`,
    sellerName: 'Test Product',
    sellerBrand: null,
    priceCents: 500,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: null,
    joinMethod: 'gtin',
    url: null,
    imageUrl: null,
    inStock: null,
    ...over,
  };
}

test('a scanned product with zero price rows is reported as unreachable, not queued', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-queue-test-'));
  const path = join(dir, 'prices.db');
  try {
    const write = openPrices(path);
    write.close();

    const result = await nextToPrice({
      dbPath: path,
      readScanCounts: () => new Map([['0000000000001', 12]]),
      now: () => new Date('2026-09-05T00:00:00Z'),
    });

    assert.equal(result.scannedNoCrawlerCanReach.length, 1);
    assert.equal(result.scannedNoCrawlerCanReach[0].code, '0000000000001');
    assert.equal(result.scannedNoCrawlerCanReach[0].scanCount, 12);
    assert.equal(result.toCrawl.length, 0, 'a code with no known SKU anywhere must never be handed to a crawler');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an empty scan reader orders purely by staleness, oldest first', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-queue-test-'));
  const path = join(dir, 'prices.db');
  try {
    const write = openPrices(path);
    recordObservation(write, obs({ code: '0000000000001', seenOn: '2020-01-01' }));
    recordObservation(write, obs({ code: '0000000000002', seenOn: '2026-08-01' }));
    write.close();

    const result = await nextToPrice({
      dbPath: path,
      readScanCounts: emptyScanCounts,
      now: () => new Date('2026-09-05T00:00:00Z'),
    });

    assert.equal(result.scannedNoCrawlerCanReach.length, 0);
    const codes = result.toCrawl.map((e) => e.code);
    assert.deepEqual(codes, ['0000000000001', '0000000000002'], 'the 2020 price is far older than the 2026 one and must come first');
    assert.equal(result.toCrawl[0].reason, 'stale_unscanned');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a fresh unscanned price under the baseline interval is not queued at all', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-queue-test-'));
  const path = join(dir, 'prices.db');
  try {
    const write = openPrices(path);
    recordObservation(write, obs({ code: '0000000000009', seenOn: '2026-09-04' }));
    write.close();

    const result = await nextToPrice({
      dbPath: path,
      readScanCounts: emptyScanCounts,
      now: () => new Date('2026-09-05T00:00:00Z'),
    });

    assert.equal(result.toCrawl.length, 0, 'one day old is nowhere near the 30 day unscanned baseline');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('heavy scanning moves an already-priced product to the front, ahead of far staler unscanned ones', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-queue-test-'));
  const path = join(dir, 'prices.db');
  try {
    const write = openPrices(path);
    recordObservation(write, obs({ code: '0000000000001', seenOn: '2020-01-01' })); // oldest, unscanned
    recordObservation(write, obs({ code: '0000000000002', seenOn: '2021-06-15' })); // also old, unscanned
    recordObservation(write, obs({ code: '0000000000050', seenOn: '2026-08-20' })); // recent, but scanned hard
    write.close();

    const result = await nextToPrice({
      dbPath: path,
      readScanCounts: () => new Map([['0000000000050', 50]]),
      now: () => new Date('2026-09-05T00:00:00Z'),
    });

    assert.ok(result.toCrawl.length >= 1);
    assert.equal(result.toCrawl[0].code, '0000000000050', 'scanned 50 times, it must lead even though its price is newer than the other two');
    assert.equal(result.toCrawl[0].reason, 'scanned_due_for_reprice');
    assert.equal(result.toCrawl[0].scanCount, 50);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a scanned product not due yet at its own interval is held out of the queue entirely', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-queue-test-'));
  const path = join(dir, 'prices.db');
  try {
    const write = openPrices(path);
    recordObservation(write, obs({ code: '0000000000077', seenOn: '2026-09-04' })); // priced yesterday
    write.close();

    const result = await nextToPrice({
      dbPath: path,
      readScanCounts: () => new Map([['0000000000077', 1]]), // interval = round(30/2) = 15 days
      now: () => new Date('2026-09-05T00:00:00Z'),
    });

    assert.equal(result.toCrawl.length, 0, 'one day old against a 15 day interval is not due');
    assert.equal(result.scannedNoCrawlerCanReach.length, 0, 'it has a price, so it is not the no-price case either');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a code with a recent failed attempt is held back, not queued, even though it is stale', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-queue-test-'));
  const path = join(dir, 'prices.db');
  try {
    const write = openPrices(path);
    recordObservation(write, obs({ code: '0000000000099', seenOn: '2020-01-01' })); // very stale
    // Same day as "now" below: 0 days have passed, less than the 1 day a
    // single throttle backs off, so this must still be held back.
    recordAttempt(write, '0000000000099', 'walmart.ca', '2026-09-05', 'throttled', 0, 'PerimeterX 403');
    write.close();

    const result = await nextToPrice({
      dbPath: path,
      readScanCounts: emptyScanCounts,
      now: () => new Date('2026-09-05T00:00:00Z'),
    });

    assert.equal(result.toCrawl.length, 0, "today's throttle must hold it back despite the very old price");
    assert.equal(result.heldBack.length, 1);
    assert.equal(result.heldBack[0].code, '0000000000099');
    assert.equal(result.heldBack[0].attemptedOn, '2026-09-05');
    assert.equal(result.heldBack[0].outcome, 'throttled');
    assert.equal(result.heldBack[0].backoffDays, 1, 'one consecutive failure backs off one day');
    assert.equal(result.heldBack[0].daysSinceAttempt, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a failed attempt is never read as evidence the product has no price', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-queue-test-'));
  const path = join(dir, 'prices.db');
  try {
    const write = openPrices(path);
    // No observation row at all: this product has genuinely never been priced.
    recordAttempt(write, '0000000000123', 'walmart.ca', '2026-08-01', 'error', 0, 'network reset');
    write.close();

    const result = await nextToPrice({
      dbPath: path,
      readScanCounts: () => new Map([['0000000000123', 3]]),
      now: () => new Date('2026-09-05T00:00:00Z'),
    });

    // Rule 1 keys only on the observation table, never on crawl_attempt: an
    // old error must not make this code disappear from the unreachable report.
    assert.equal(result.scannedNoCrawlerCanReach.length, 1);
    assert.equal(result.scannedNoCrawlerCanReach[0].code, '0000000000123');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('consecutive failures double the backoff, capped', () => {
  assert.equal(backoffDaysFor(0), 0);
  assert.equal(backoffDaysFor(1), 1);
  assert.equal(backoffDaysFor(2), 2);
  assert.equal(backoffDaysFor(3), 4);
  assert.equal(backoffDaysFor(5), 14, 'capped at MAX_BACKOFF_DAYS well before this many strikes');
  assert.equal(backoffDaysFor(20), 14, 'still capped');
});

test('interval shrinks with scan count and floors at one day', () => {
  assert.equal(intervalDaysFor(0), 30);
  assert.equal(intervalDaysFor(1), 15);
  assert.equal(intervalDaysFor(50), 1);
  assert.equal(intervalDaysFor(-5), 30, 'a nonsense negative count is treated as zero, not as extra popularity');
});

test('a missing database never throws; it reads as an empty queue', async () => {
  const result = await nextToPrice({
    dbPath: join(tmpdir(), `shin-queue-does-not-exist-${Date.now()}.db`),
    readScanCounts: emptyScanCounts,
  });
  assert.deepEqual(result, { scannedNoCrawlerCanReach: [], toCrawl: [], heldBack: [] });
});
