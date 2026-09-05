/**
 * Tests for `lookupPrices`, the first real implementation of `PriceLookup`.
 *
 * Two things matter and both are asserted directly against a real database,
 * not a mock: the newest observation for a code wins over older ones for the
 * same code, and a code with no observation is simply missing from the result
 * rather than present with a null-filled row (`alternativesFor`'s caller reads
 * `Map.has`, not a null check, and a fabricated entry would defeat that).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ObservationRow } from '../src/store.ts';

/*
 * `PRICES_DB_PATH` (store.ts) is a module-level constant computed once, from
 * `process.env.SHIN_PRICES`, the moment store.ts is first evaluated. Static
 * imports are hoisted ahead of every other top-level statement in this file,
 * so setting the env var above an `import ... from '../src/store.ts'` line
 * would not run in time to affect it. Both store.ts and lookup.ts are
 * imported dynamically below, after the env var is set, so this test opens
 * its own throwaway database rather than whatever SHIN_PRICES already named
 * or the real default under price/data/.
 */
const dbPath = join(mkdtempSync(join(tmpdir(), 'shin-price-lookup-')), 'prices.db');
process.env.SHIN_PRICES = dbPath;

const { openPrices, recordObservation } = await import('../src/store.ts');
const { lookupPrices } = await import('../src/lookup.ts');

function row(over: Partial<ObservationRow> = {}): ObservationRow {
  return {
    code: '0068100084245',
    seller: 'openprices',
    sellerSku: '1',
    sellerName: 'Kraft Smooth Peanut Butter',
    sellerBrand: 'Kraft',
    priceCents: 500,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: null,
    joinMethod: 'gtin',
    seenOn: '2026-01-01',
    url: null,
    imageUrl: null,
    inStock: null,
    ...over,
  };
}

// Seeded once, on a write-mode connection, then closed before lookupPrices
// opens its own read-only one -- the production split (store.ts writes,
// lookup.ts only ever reads) is exercised here rather than worked around.
const seed = openPrices(dbPath);
recordObservation(seed, row({ seller: 'openprices', sellerSku: '1', priceCents: 500, seenOn: '2026-01-01' }));
recordObservation(seed, row({ seller: 'openprices', sellerSku: '1', priceCents: 450, seenOn: '2026-02-01' }));
recordObservation(
  seed,
  row({ seller: 'walmart.ca', sellerSku: '9', priceCents: 480, seenOn: '2026-03-01', joinMethod: 'name' }),
);
seed.close();

test('the most recent observation wins when a code has several', async () => {
  const result = await lookupPrices(['0068100084245']);
  const priced = result.get('0068100084245');
  assert.ok(priced, 'expected a priced product for the seeded code');
  assert.equal(priced!.observedAt, '2026-03-01');
  assert.equal(priced!.amountCents, 480);
  assert.equal(priced!.seller, 'walmart.ca');
  assert.equal(priced!.joinMethod, 'name');
});

test('a code with no observation is absent from the map, not present with nulls', async () => {
  const result = await lookupPrices(['0000000000000']);
  assert.equal(result.has('0000000000000'), false);
  assert.equal(result.size, 0);
});

test('a mix of a known and an unknown code returns exactly the known one', async () => {
  const result = await lookupPrices(['0068100084245', '0000000000000']);
  assert.equal(result.size, 1);
  assert.equal(result.has('0068100084245'), true);
  assert.equal(result.has('0000000000000'), false);
});
