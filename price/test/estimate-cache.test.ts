/**
 * The estimate's read cache (price/src/estimate.ts, READ CACHE): with Project Hammer loaded every scan
 * read about 99,000 price rows and their catalogue rows, 1.5 to 3.5 s a scan on the live server. The
 * reads are kept until a file changes. These tests pin that a change is seen at once, and that a
 * cached answer is the answer an uncached read gives.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { clearEstimateCache, estimate } from '../src/estimate.ts';

const row = (over: Partial<ObservationRow>): ObservationRow => ({
  code: '0062639298517', seller: 'shop', sellerSku: 's1', sellerName: 'Tuna 170g', sellerBrand: null, priceCents: 300,
  kind: 'regular', unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: 'ON', joinMethod: 'gtin',
  seenOn: '2026-11-01', url: null, imageUrl: null, inStock: null, ...over,
});
const item = { barcode: '0062639298517', name: 'Tuna', size: '170 g', region: 'ON', asOf: '2026-11-08', currency: 'CAD', country: 'CA' };

test('a price written after the first answer is in the next answer, through a fresh handle as the server opens one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'estimate-cache-'));
  const file = join(dir, 'prices.db');
  try {
    clearEstimateCache();
    const w = openPrices(file);
    recordObservation(w, row({}));
    const read = () => new DatabaseSync(file, { readOnly: true });
    const r1 = read();
    const first = await estimate(item, null, { prices: r1 });
    r1.close();
    assert.equal(first.verdict.basis, 'own_prices');
    assert.equal(first.trace.ownShops, 1);
    // A second shop's price arrives.
    recordObservation(w, row({ seller: 'other', sellerSku: 's2', priceCents: 360 }));
    const r2 = read();
    const second = await estimate(item, null, { prices: r2 });
    r2.close();
    assert.equal(second.trace.ownShops, 2, 'the cache served the old file');
    // Nothing changed: the same answer again.
    const r3 = read();
    const third = await estimate(item, null, { prices: r3 });
    r3.close();
    assert.deepEqual(third.verdict, second.verdict);
    w.close();
  } finally {
    clearEstimateCache();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the day is part of the key: an answer for another day reads the rows again (ages and the horizon move)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'estimate-cache-'));
  const file = join(dir, 'prices.db');
  try {
    clearEstimateCache();
    const w = openPrices(file);
    recordObservation(w, row({ seenOn: '2024-12-01' }));
    w.close();
    const db = new DatabaseSync(file, { readOnly: true });
    const now = await estimate(item, null, { prices: db });
    assert.equal(now.verdict.basis, 'own_prices', 'within the two-year horizon on 2026-11-08');
    const later = await estimate({ ...item, asOf: '2027-01-15' }, null, { prices: db });
    assert.notEqual(later.verdict.basis, 'own_prices', 'past the horizon a day later in 2027, the old row must not be served from the cache');
    db.close();
  } finally {
    clearEstimateCache();
    rmSync(dir, { recursive: true, force: true });
  }
});
