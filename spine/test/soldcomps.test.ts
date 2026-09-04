import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SoldCompsSource, keywordFor } from '../src/sources/soldcomps.ts';
import type { FetchLike } from '../src/sources/soldcomps.ts';
import type { ProductIdentity } from '../src/contract.ts';
import { AS_OF } from './helpers.ts';

const CANON: ProductIdentity = {
  id: 'test:canon-r6',
  label: 'Canon EOS R6 body, used',
  category: 'used',
  brand: 'Canon',
  model: 'EOS R6',
  confidence: 0.95,
  resolvedBy: 'test',
};

function item(over: Record<string, unknown>) {
  return {
    itemId: 'x',
    url: 'https://www.ebay.ca/itm/x',
    title: 'Canon EOS R6 Mirrorless Camera Body',
    condition: 'Used',
    endedAt: '2026-08-28',
    soldPrice: '1650.00',
    soldCurrency: 'CAD',
    sellerUsername: 'seller_a',
    listingType: 'sold',
    ...over,
  };
}

function fetchReturning(items: unknown[], capture: { url?: string; headers?: Record<string, string> } = {}): FetchLike {
  return async (url, init) => {
    capture.url = url;
    capture.headers = init?.headers;
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({ items }) };
  };
}

test('unavailable without a key, and says so', () => {
  const s = new SoldCompsSource({});
  assert.deepEqual(s.available(), { ok: false, reason: 'SOLDCOMPS_API_KEY is not set' });
  assert.equal(s.verified, false);
});

test('never identifies: a keyword feed has no product graph', async () => {
  const s = new SoldCompsSource({ SOLDCOMPS_API_KEY: 'k' }, fetchReturning([]));
  assert.equal(await s.identify({ text: 'canon r6' }), null);
});

test('asks eBay.ca for sold listings inside the 90-day window, with the bearer key', async () => {
  const cap: { url?: string; headers?: Record<string, string> } = {};
  const s = new SoldCompsSource({ SOLDCOMPS_API_KEY: 'sc_test' }, fetchReturning([], cap));
  await s.prices(CANON, AS_OF);
  const u = new URL(cap.url!);
  assert.equal(u.origin + u.pathname, 'https://api.sold-comps.com/v1/scrape');
  assert.equal(u.searchParams.get('keyword'), 'Canon EOS R6');
  assert.equal(u.searchParams.get('ebaySite'), 'ebay.ca');
  assert.equal(u.searchParams.get('sold'), 'true');
  assert.equal(u.searchParams.get('soldAfter'), '2026-06-05');
  assert.equal(cap.headers?.Authorization, 'Bearer sc_test');
});

test('maps a CAD sale to a sold point dated by endedAt, seller from the username', async () => {
  const s = new SoldCompsSource({ SOLDCOMPS_API_KEY: 'k' }, fetchReturning([item({})]));
  const pts = await s.prices(CANON, AS_OF);
  assert.equal(pts.length, 1);
  assert.equal(pts[0].kind, 'sold');
  assert.equal(pts[0].amountCents, 165000);
  assert.equal(pts[0].currency, 'CAD');
  assert.equal(pts[0].observedAt, '2026-08-28');
  assert.equal(pts[0].seller, 'eBay seller seller_a');
  assert.equal(pts[0].sourceId, 'soldcomps');
});

test('rule 1: a sale in another currency is dropped, never converted', async () => {
  const s = new SoldCompsSource({ SOLDCOMPS_API_KEY: 'k' }, fetchReturning([item({ soldCurrency: 'USD', soldPrice: '1200.00' })]));
  assert.equal((await s.prices(CANON, AS_OF)).length, 0);
});

test('rule 2: for-parts and not-working sales never count', async () => {
  const s = new SoldCompsSource(
    { SOLDCOMPS_API_KEY: 'k' },
    fetchReturning([
      item({ title: 'Canon EOS R6 body FOR PARTS not working', soldPrice: '135.00' }),
      item({ condition: 'For parts or not working', soldPrice: '140.00' }),
      item({ soldPrice: '1700.00', sellerUsername: 'seller_b' }),
    ]),
  );
  const pts = await s.prices(CANON, AS_OF);
  assert.deepEqual(pts.map((p) => p.amountCents), [170000]);
});

test('rule 3: a title that does not cover the identity is not a comp (the R6 Mark II case)', async () => {
  const s = new SoldCompsSource(
    { SOLDCOMPS_API_KEY: 'k' },
    fetchReturning([
      item({ title: 'Sigma 24-70mm f/2.8 DG DN Art lens', soldPrice: '1100.00' }),
      item({ title: 'Canon EOS R6 Mark II body + 2 lenses bundle', soldPrice: '4800.00' }),
      item({ soldPrice: '1650.00' }),
    ]),
  );
  const pts = await s.prices(CANON, AS_OF);
  // The lens has no overlap and is dropped. The Mark II bundle still covers the
  // tokens "canon eos r6", so overlap alone cannot exclude it; that is the
  // spine's contamination check's job, and the point is passed through with
  // its title in `note` so the check has something to show.
  assert.deepEqual(pts.map((p) => p.amountCents).sort((a, b) => a - b), [165000, 480000]);
});

test('active listings, undated sales and unparseable prices are dropped', async () => {
  const s = new SoldCompsSource(
    { SOLDCOMPS_API_KEY: 'k' },
    fetchReturning([
      item({ listingType: 'active' }),
      item({ endedAt: null }),
      item({ soldPrice: 'n/a' }),
      item({ soldPrice: null }),
    ]),
  );
  assert.equal((await s.prices(CANON, AS_OF)).length, 0);
});

test('only prices used goods, whatever the caller hands it', async () => {
  const s = new SoldCompsSource({ SOLDCOMPS_API_KEY: 'k' }, fetchReturning([item({})]));
  assert.equal((await s.prices({ ...CANON, category: 'tech' }, AS_OF)).length, 0);
});

test('a non-2xx answer throws rather than reading as "no sales exist"', async () => {
  const failing: FetchLike = async () => ({ ok: false, status: 429, statusText: 'Too Many Requests', json: async () => ({}) });
  const s = new SoldCompsSource({ SOLDCOMPS_API_KEY: 'k' }, failing);
  await assert.rejects(() => s.prices(CANON, AS_OF), /soldcomps: 429/);
});

test('keyword is brand and model when present, label otherwise', () => {
  assert.equal(keywordFor(CANON), 'Canon EOS R6');
  assert.equal(keywordFor({ ...CANON, brand: undefined, model: undefined }), 'Canon EOS R6 body, used');
});
