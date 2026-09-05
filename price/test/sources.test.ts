/**
 * Tests for the join, which is where a wrong price gets attached to the right
 * looking product and nobody finds out.
 *
 * The check on 2026-09-04 found one seller that publishes barcodes and one that
 * does not, so both paths are real and both are exercised here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinToProduct, normaliseGtin, type Listing, type PriceSource } from '../src/sources.ts';

const CODE = '0068100084245';

function listing(over: Partial<Listing> & { seller: string }): Listing {
  return {
    sellerSku: 'x',
    title: 'Kraft Smooth Peanut Butter, 1 kg Jar',
    brand: 'Kraft',
    gtin: null,
    sizeValue: 1000,
    sizeUnit: 'g',
    amountCents: 597,
    kind: 'regular',
    observedAt: '2026-09-04',
    preTax: true,
    url: null,
    ...over,
  };
}

const sources: PriceSource[] = [
  { seller: 'Walmart', joins: 'gtin', fetch: async () => [] },
  { seller: 'Loblaws', joins: 'name', fetch: async () => [] },
];

const alwaysConfident = async (l: Listing) => ({ code: CODE, confident: true });

test('a barcode seller joins exactly', async () => {
  const r = await joinToProduct(
    CODE,
    [listing({ seller: 'Walmart', gtin: '068100084245' })],
    sources,
    alwaysConfident,
  );
  assert.equal(r.observations.length, 1);
  assert.equal(r.observations[0].amountCents, 597);
});

test('a twelve digit UPC and a thirteen digit code are the same product', () => {
  assert.equal(normaliseGtin('068100084245'), normaliseGtin('0068100084245'));
  assert.equal(normaliseGtin('68100084245'), '0068100084245');
});

test('a barcode seller with no barcode contributes nothing and is recorded', async () => {
  const r = await joinToProduct(CODE, [listing({ seller: 'Walmart' })], sources, alwaysConfident);
  assert.equal(r.observations.length, 0);
  assert.match(r.unjoined[0].because, /did not publish/);
});

test('a different barcode is never taken as close enough', async () => {
  const r = await joinToProduct(
    CODE,
    [listing({ seller: 'Walmart', gtin: '0068100084276' })],
    sources,
    alwaysConfident,
  );
  assert.equal(r.observations.length, 0);
  assert.match(r.unjoined[0].because, /different barcode/);
});

test('a name seller joins only in the confident band', async () => {
  const ambiguous = async () => ({ code: CODE, confident: false });
  const r = await joinToProduct(CODE, [listing({ seller: 'Loblaws' })], sources, ambiguous);
  assert.equal(r.observations.length, 0, 'an ambiguous title became a price');
  assert.match(r.unjoined[0].because, /more than one product/);
});

test('a name match landing on another product is refused', async () => {
  const wrong = async () => ({ code: '0068100084276', confident: true });
  const r = await joinToProduct(CODE, [listing({ seller: 'Loblaws' })], sources, wrong);
  assert.equal(r.observations.length, 0);
  assert.match(r.unjoined[0].because, /different product/);
});

test('an unmatched title is kept as a gap, not thrown away', async () => {
  const none = async () => null;
  const r = await joinToProduct(CODE, [listing({ seller: 'Loblaws' })], sources, none);
  assert.equal(r.unjoined.length, 1);
  assert.equal(r.unjoined[0].listing.seller, 'Loblaws');
});

test('the two sellers the check found can together clear the minimum', async () => {
  const r = await joinToProduct(
    CODE,
    [
      listing({ seller: 'Walmart', gtin: '068100084245', amountCents: 597 }),
      listing({ seller: 'Loblaws', amountCents: 700 }),
    ],
    sources,
    alwaysConfident,
  );
  assert.equal(r.observations.length, 2);
  assert.deepEqual(r.observations.map((o) => o.seller).sort(), ['Loblaws', 'Walmart']);
});

test('a post tax listing survives the join and is dropped later, not here', async () => {
  const r = await joinToProduct(
    CODE,
    [listing({ seller: 'Walmart', gtin: '068100084245', preTax: false })],
    sources,
    alwaysConfident,
  );
  assert.equal(r.observations.length, 1);
  assert.equal(r.observations[0].preTax, false);
});
