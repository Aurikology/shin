/**
 * Item 18a of the beta build plan: "Fix the currency label; mark rows as US",
 * and the founder's decision of the same day that Best Buy US prices are a
 * labelled reference and never enter the verdict.
 *
 * The interesting assertion here is the empty one. `prices()` returns nothing
 * while the stubbed API is handing back two perfectly readable numbers, and that
 * is the rule: the method the spine collects prices through cannot produce a US
 * price, so no verdict can be built on one. The rest of this file checks that
 * the number is not thrown away either, because a price we hold and cannot use
 * in a comparison is still worth showing to somebody who asks what this costs
 * across the border.
 *
 * NO NETWORK. `fetch` is replaced for the duration of each test and restored
 * after; `BESTBUY_API_BASE` points at a host that is never opened.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BestBuySource } from '../src/sources/bestbuy.ts';
import type { ProductIdentity } from '../src/contract.ts';

const ENV = { BESTBUY_API_KEY: 'test-key', BESTBUY_API_BASE: 'https://example.invalid/v1' };

const IDENTITY: ProductIdentity = {
  id: 'bestbuy:6487445',
  label: 'Sony WH-1000XM5',
  category: 'tech',
  confidence: 0.98,
  resolvedBy: 'bestbuy',
};

/** One product row in the shape the US API returns it, prices in US dollars. */
const BODY = {
  products: [
    {
      sku: 6487445,
      name: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones',
      manufacturer: 'Sony',
      modelNumber: 'WH1000XM5/B',
      regularPrice: 399.99,
      salePrice: 328,
      onSale: true,
      url: 'https://www.bestbuy.com/site/6487445.p',
    },
  ],
};

async function withStubbedApi<T>(run: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  let opened = 0;
  globalThis.fetch = (async () => {
    opened += 1;
    return new Response(JSON.stringify(BODY), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const out = await run();
    assert.ok(opened > 0, 'the stub was never called, so this test proved nothing');
    return out;
  } finally {
    globalThis.fetch = real;
  }
}

test('a US price never comes back as a price point, however readable it is', async () => {
  // Both calls run against the same stub and the same row, so the empty result
  // cannot be an unreachable API or a parse failure: the reference call reads
  // two prices out of the body the price call refuses to build anything from.
  await withStubbedApi(async () => {
    const source = new BestBuySource(ENV);
    const reference = await source.usReference(IDENTITY, '2026-09-11T00:00:00Z');
    assert.equal(reference.length, 2, 'the stub itself is serving readable prices');

    const points = await source.prices(IDENTITY, '2026-09-11T00:00:00Z');
    assert.deepEqual(points, [], 'a US dollar number reached the spine as a CAD price point');
  });
});

test('the US price is kept, labelled, in US dollars, and marked US', async () => {
  const rows = await withStubbedApi(() => new BestBuySource(ENV).usReference(IDENTITY, '2026-09-11T00:00:00Z'));
  assert.equal(rows.length, 2, 'the everyday price and the sale price are both there');
  for (const r of rows) {
    assert.equal(r.currency, 'USD');
    assert.equal(r.country, 'US');
    assert.equal(r.seller, 'Best Buy (US)');
    assert.match(r.label, /US dollars/);
    assert.match(r.label, /reference/i);
  }
  assert.deepEqual(
    rows.map((r) => [r.amountCents, r.onSale]),
    [
      [39999, false],
      [32800, true],
    ],
    'the cents are the US cents as published, never converted',
  );
});

test('the identity still resolves, because a barcode is the same barcode either side of the border', async () => {
  const id = await withStubbedApi(() => new BestBuySource(ENV).identify({ gtin: '0027242924833' }));
  assert.ok(id !== null);
  assert.equal(id?.brand, 'Sony');
  assert.equal(id?.model, 'WH1000XM5/B');
  assert.equal(id?.category, 'tech');
});

test('with no key the adapter is unavailable and asks the network for nothing', async () => {
  const real = globalThis.fetch;
  let opened = 0;
  globalThis.fetch = (async () => {
    opened += 1;
    throw new Error('the adapter opened the network without a key');
  }) as typeof fetch;
  try {
    const source = new BestBuySource({});
    assert.equal(source.available().ok, false);
    assert.deepEqual(await source.prices(IDENTITY, '2026-09-11T00:00:00Z'), []);
    assert.deepEqual(await source.usReference(IDENTITY, '2026-09-11T00:00:00Z'), []);
    assert.equal(await source.identify({ gtin: '0027242924833' }), null);
    assert.equal(opened, 0);
  } finally {
    globalThis.fetch = real;
  }
});
