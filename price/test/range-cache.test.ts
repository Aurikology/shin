/**
 * The range's pool cache and the estimate's multi-slot read cache (Mac probe A, 2026-11-25: each
 * answer re-read every price in its currency, 1.35 s in range.ts and 2.26 s in estimate.ts, peak
 * 2.1 GB). These pin: a cached answer equals an uncached one, a new price in the file is seen at
 * once, and alternating currencies no longer evict each other.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { clearRangeCache, priceRangeFor, rangeCacheStats, type RangeInput } from '../src/range.ts';
import { clearEstimateCache, estimate, estimateCacheStats } from '../src/estimate.ts';

const SELF = '0068100084245';
const PATH = ['en:dairies', 'en:cheeses', 'en:cheddar'];
const obs = (over: Partial<ObservationRow>): ObservationRow => ({
  code: null, seller: 'Walmart', sellerSku: 'sku', sellerName: 'x', sellerBrand: null, priceCents: 500, kind: 'regular',
  unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: null, joinMethod: 'gtin', seenOn: '2026-09-20',
  url: null, imageUrl: null, inStock: null, ...over,
});
const input = (currency: string): RangeInput => ({ barcode: SELF, size: '500 g', leafCategory: 'en:cheddar', categoryPath: PATH, asOf: '2026-09-27', currency } as RangeInput);

/** Files on disk (a `:memory:` handle is never cached): 6 other cheddars priced in CAD and in USD. */
function files(dir: string): { prices: string; catalogue: string } {
  const prices = join(dir, 'prices.db');
  const catalogue = join(dir, 'catalogue.db');
  const cat = new DatabaseSync(catalogue);
  cat.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, quantity TEXT, size_value REAL, size_unit TEXT,
    category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  const ins = cat.prepare('INSERT INTO product (code, name, quantity, size_value, size_unit, category_path, leaf_category) VALUES (?,?,?,?,?,?,?)');
  ins.run(SELF, 'Cheddar', '500 g', 500, 'g', JSON.stringify(PATH), 'en:cheddar');
  const w = openPrices(prices);
  for (let n = 1; n <= 6; n++) {
    const code = String(1000 + n).padStart(13, '0');
    ins.run(code, 'other', '500 g', 500, 'g', JSON.stringify(PATH), 'en:cheddar');
    recordObservation(w, obs({ code, sellerSku: `c${n}`, priceCents: 400 + n * 50 }));
    recordObservation(w, obs({ code, sellerSku: `u${n}`, priceCents: 300 + n * 40, currency: 'USD', country: 'US' }));
  }
  w.close();
  cat.close();
  return { prices, catalogue };
}

test('range pools: a cached answer equals a fresh one, and alternating currencies both stay cached', () => {
  const dir = mkdtempSync(join(tmpdir(), 'range-cache-'));
  try {
    clearRangeCache();
    const f = files(dir);
    const open = () => ({ prices: new DatabaseSync(f.prices, { readOnly: true }), catalogue: new DatabaseSync(f.catalogue, { readOnly: true }) });
    const s = open();
    const cad1 = priceRangeFor(input('CAD'), s);
    assert.equal(cad1.basis, 'leaf_category');
    const usd1 = priceRangeFor(input('USD'), s);
    assert.equal(usd1.basis, 'leaf_category');
    assert.deepEqual(rangeCacheStats(), { hits: 0, misses: 2, slots: 2 });
    const cad2 = priceRangeFor(input('CAD'), s);
    const usd2 = priceRangeFor(input('USD'), s);
    assert.deepEqual(rangeCacheStats(), { hits: 2, misses: 2, slots: 2 }, 'one currency evicted the other');
    assert.deepEqual(cad2, cad1);
    assert.deepEqual(usd2, usd1);
    clearRangeCache();
    assert.deepEqual(priceRangeFor(input('CAD'), s), cad1, 'the cached answer differs from an uncached read');
    s.prices.close();
    s.catalogue.close();
  } finally {
    clearRangeCache();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('range pools: a price written to the file is in the next answer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'range-cache-'));
  const handles: DatabaseSync[] = [];
  try {
    clearRangeCache();
    const f = files(dir);
    const read = () => {
      const s = { prices: new DatabaseSync(f.prices, { readOnly: true }), catalogue: new DatabaseSync(f.catalogue, { readOnly: true }) };
      handles.push(s.prices, s.catalogue);
      return s;
    };
    const before = priceRangeFor(input('CAD'), read());
    assert.equal(before.basis, 'leaf_category');
    const w = openPrices(f.prices);
    recordObservation(w, obs({ code: String(1001).padStart(13, '0'), seller: 'Costco', sellerSku: 'k1', priceCents: 9900 }));
    w.close();
    const after = priceRangeFor(input('CAD'), read());
    assert.equal(after.basis, 'leaf_category');
    assert.notDeepEqual(after, before, 'the cache served the old file');
    assert.equal(rangeCacheStats().misses, 2);
  } finally {
    for (const h of handles) h.close();
    clearRangeCache();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('estimate: alternating currencies no longer evict each other', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'estimate-slots-'));
  let prices: DatabaseSync | null = null;
  try {
    clearEstimateCache();
    const f = files(dir);
    prices = new DatabaseSync(f.prices, { readOnly: true });
    const item = (currency: string) => ({ barcode: SELF, name: 'Cheddar', size: '500 g', region: null, asOf: '2026-09-27', currency, country: currency === 'USD' ? 'US' : 'CA' });
    const first = await estimate(item('CAD'), null, { prices });
    await estimate(item('USD'), null, { prices });
    const again = await estimate(item('CAD'), null, { prices });
    await estimate(item('USD'), null, { prices });
    assert.deepEqual(estimateCacheStats(), { hits: 2, misses: 2, slots: 2 });
    assert.deepEqual(again.verdict, first.verdict);
  } finally {
    prices?.close();
    clearEstimateCache();
    rmSync(dir, { recursive: true, force: true });
  }
});
