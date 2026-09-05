/**
 * Tests for the eBay adapter against a stubbed fetch, never against the live
 * API. `verified` stays false regardless of what passes here: these prove the
 * mapping rules hold, not that the endpoint behaves as documented, and the
 * difference between those two is the whole reason that flag exists.
 *
 * Every case below guards a rule whose absence would produce a WRONG number
 * rather than a missing one. A missing comparable makes the app refuse, which
 * is a correct outcome it is designed for. A $1 auction bid, a US-dollar price
 * read as Canadian, or a heavy item with its shipping quietly dropped all
 * produce a confident verdict about a price that does not exist.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EbaySource } from '../src/sources/ebay.ts';

const CREDS = { EBAY_CLIENT_ID: 'id', EBAY_CLIENT_SECRET: 'secret' };
const ASOF = '2026-09-05';

interface StubItem {
  itemId?: string;
  title?: string;
  price?: { value?: string; currency?: string };
  conditionId?: string;
  itemWebUrl?: string;
  seller?: { username?: string };
  shippingOptions?: { shippingCost?: { value?: string; currency?: string } }[];
  itemLocation?: { country?: string };
}

/** A listing with everything right, so each test can spoil exactly one thing. */
function listing(over: StubItem = {}): StubItem {
  return {
    itemId: 'v1|1|0',
    title: 'Canon EOS R6 body, used',
    price: { value: '1750.00', currency: 'CAD' },
    conditionId: '3000',
    itemWebUrl: 'https://www.ebay.ca/itm/1',
    seller: { username: 'camerashop' },
    shippingOptions: [{ shippingCost: { value: '20.00', currency: 'CAD' } }],
    itemLocation: { country: 'CA' },
    ...over,
  };
}

/**
 * Replaces global fetch, answering the token endpoint and the search endpoint,
 * and recording every URL so a test can assert what was actually asked for.
 */
function stubFetch(items: StubItem[], opts: { tokenLifetimeSec?: number } = {}) {
  const calls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    calls.push(href);
    if (href.includes('/identity/v1/oauth2/token')) {
      assert.equal(init?.method, 'POST');
      return new Response(
        JSON.stringify({ access_token: 'tok', expires_in: opts.tokenLifetimeSec ?? 7200 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ itemSummaries: items }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = real;
    },
  };
}

async function pointsFor(items: StubItem[]) {
  const stub = stubFetch(items);
  try {
    const source = new EbaySource(CREDS);
    const identity = await source.identify({ gtin: '0013803305432' });
    assert.ok(identity, 'expected an identity');
    return { points: await source.prices(identity, ASOF), calls: stub.calls, identity };
  } finally {
    stub.restore();
  }
}

test('no key is a reportable state, not an error', () => {
  const source = new EbaySource({});
  const availability = source.available();
  assert.equal(availability.ok, false);
  assert.match(
    availability.ok === false ? availability.reason : '',
    /EBAY_CLIENT_ID and EBAY_CLIENT_SECRET/,
  );
});

test('without a key it returns nothing rather than calling anything', async () => {
  const stub = stubFetch([listing()]);
  try {
    const source = new EbaySource({});
    assert.equal(await source.identify({ gtin: '0013803305432' }), null);
    assert.deepEqual(stub.calls, []);
  } finally {
    stub.restore();
  }
});

test('the adapter is never marked verified by its own tests passing', () => {
  assert.equal(new EbaySource(CREDS).verified, false);
});

test('a price in US dollars never becomes a point', async () => {
  const { points } = await pointsFor([listing({ price: { value: '1200.00', currency: 'USD' } })]);
  assert.deepEqual(points, []);
});

test('a listing shipping from outside Canada never becomes a point', async () => {
  const { points } = await pointsFor([listing({ itemLocation: { country: 'US' } })]);
  assert.deepEqual(points, []);
});

/*
 * The one most likely to be "fixed" by a later reader who assumes a missing
 * shipping block means free delivery. It does not: it means nobody said. An
 * unknown read as zero understates exactly the listings most likely to be heavy,
 * and it is the same shape as the invented stock flag, an absence recorded as a
 * favourable fact.
 */
test('shipping that is not stated is a skip, never treated as free', async () => {
  assert.deepEqual((await pointsFor([listing({ shippingOptions: undefined })])).points, []);
  assert.deepEqual((await pointsFor([listing({ shippingOptions: [] })])).points, []);
  assert.deepEqual((await pointsFor([listing({ shippingOptions: [{}] })])).points, []);
});

test('the point is the delivered price, item plus shipping', async () => {
  const { points } = await pointsFor([listing()]);
  assert.equal(points.length, 1);
  assert.equal(points[0].amountCents, 175000 + 2000);
  assert.equal(points[0].currency, 'CAD');
  assert.match(points[0].note ?? '', /including 20\.00 shipping/);
});

test('free shipping says so and does not change the number', async () => {
  const { points } = await pointsFor([
    listing({ shippingOptions: [{ shippingCost: { value: '0.00', currency: 'CAD' } }] }),
  ]);
  assert.equal(points[0].amountCents, 175000);
  assert.match(points[0].note ?? '', /free shipping/);
});

/*
 * The free Browse key cannot see sold prices at all: those are behind a Limited
 * Release API that is closed to new applicants. So there is no code path here
 * that can produce 'sold', and this asserts it stays that way. An asking price
 * mislabelled as a clearing price would be treated by the spine as the rarest
 * and most trustworthy kind of number it has, which is the exact inversion of
 * what it is.
 */
test('every point is an asking price and never a sold price', async () => {
  const { points } = await pointsFor([
    listing(),
    listing({ itemId: 'v1|2|0', seller: { username: 'other' }, price: { value: '1800.00', currency: 'CAD' } }),
  ]);
  assert.equal(points.length, 2);
  for (const p of points) assert.equal(p.kind, 'asking');
});

test('auctions are excluded at the query, not filtered afterwards', async () => {
  const { calls } = await pointsFor([listing()]);
  const search = calls.find((c) => c.includes('item_summary/search'));
  assert.ok(search, 'expected a search call');
  assert.match(decodeURIComponent(search), /buyingOptions:\{FIXED_PRICE\}/);
  assert.match(decodeURIComponent(search), /itemLocationCountry:CA/);
});

test('the Canadian marketplace is asked for, and the barcode is the query', async () => {
  const { calls } = await pointsFor([listing()]);
  const search = calls.find((c) => c.includes('item_summary/search')) ?? '';
  assert.match(search, /gtin=0013803305432/);
});

/*
 * The budget is 5,000 calls a day for the whole application rather than per
 * user, so a token minted per request would spend it on authentication. One
 * token, reused.
 */
test('the token is minted once and reused across calls', async () => {
  const stub = stubFetch([listing()]);
  try {
    const source = new EbaySource(CREDS);
    const identity = await source.identify({ gtin: '0013803305432' });
    await source.prices(identity!, ASOF);
    await source.prices(identity!, ASOF);
    const tokenCalls = stub.calls.filter((c) => c.includes('/oauth2/token'));
    assert.equal(tokenCalls.length, 1, `minted ${tokenCalls.length} tokens`);
  } finally {
    stub.restore();
  }
});

test('a barcode match on a marketplace is confident, but less so than at a retailer', async () => {
  const { identity } = await pointsFor([listing()]);
  assert.ok(identity.confidence < 0.98, 'must sit below the Best Buy barcode confidence');
  assert.ok(identity.confidence >= 0.85);
});

test('anything second hand in the results makes the category used, not tech', async () => {
  const used = await pointsFor([listing({ conditionId: '3000' }), listing({ conditionId: '1000' })]);
  assert.equal(used.identity.category, 'used');
  const sealed = await pointsFor([listing({ conditionId: '1000' })]);
  assert.equal(sealed.identity.category, 'tech');
});

test('groceries are not this source to answer', () => {
  const source = new EbaySource(CREDS);
  assert.ok(!source.categories.includes('grocery'), 'eBay must never be a grocery comparable');
});

test('a listing with no seller name never becomes a point', async () => {
  const { points } = await pointsFor([listing({ seller: {} })]);
  assert.deepEqual(points, []);
});
