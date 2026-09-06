/**
 * The corrections source, and the claim the whole feature rests on: a price a
 * person typed in changes the next verdict for that product.
 *
 * Every test here runs against an in-memory correction store, never the shared
 * file the app writes to.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  openCorrectionStore,
  recordCorrection,
  type CorrectionInput,
} from '../../price/src/corrections.ts';
import { CorrectionSource } from '../src/sources/corrections.ts';
import { defaultSources } from '../src/sources/registry.ts';
import { priceIt } from '../src/spine.ts';
import type { ProductIdentity } from '../src/contract.ts';
import { StubSource } from './helpers.ts';

const CODE = '0060383689247';
const AS_OF = '2026-09-05T18:00:00Z';

const IDENTITY: ProductIdentity = {
  id: 'observed:0060383689247',
  label: 'Kraft Dinner Original 225g',
  category: 'grocery',
  gtin: CODE,
  confidence: 0.95,
  resolvedBy: 'test',
};

function correction(over: Partial<CorrectionInput> = {}): CorrectionInput {
  return {
    clientId: `c-${Math.random().toString(36).slice(2)}`,
    deviceId: 'device-a',
    code: CODE,
    productId: IDENTITY.id,
    label: IDENTITY.label,
    category: 'grocery',
    seller: 'Metro',
    priceCents: 249,
    kind: 'regular',
    seenOn: '2026-09-05',
    ...over,
  };
}

beforeEach(() => {
  openCorrectionStore(':memory:');
});

test('a correction comes back as a price point with the shop that was typed', async () => {
  recordCorrection(correction());
  const points = await new CorrectionSource().prices(IDENTITY);

  assert.equal(points.length, 1);
  assert.equal(points[0].seller, 'Metro');
  assert.equal(points[0].amountCents, 249);
  assert.equal(points[0].kind, 'regular');
  assert.equal(points[0].currency, 'CAD');
  assert.equal(points[0].sourceId, 'corrections');
  assert.match(points[0].note ?? '', /typed in by a shopper/i);
});

test('the point is dated the day the tag was seen, not the day it was stored', async () => {
  // A correction queued in an aisle with no signal and flushed days later is
  // still evidence about the day it was read. Dating it on arrival would
  // silently refresh a stale price every time a phone came back online.
  recordCorrection(correction({ seenOn: '2026-08-30' }));
  const points = await new CorrectionSource().prices(IDENTITY);
  assert.equal(points[0].observedAt, '2026-08-30');
});

test('a sale price stays a sale price', async () => {
  recordCorrection(correction({ kind: 'promotional', priceCents: 199 }));
  const points = await new CorrectionSource().prices(IDENTITY);
  assert.equal(points[0].kind, 'promotional');
});

test('this source never identifies anything', async () => {
  // A typed price says what a tag reads, not what the product is. If it could
  // identify, a mistyped correction would be able to pull a later scan onto the
  // wrong product, which is the pilot's worst failure class.
  recordCorrection(correction());
  const source = new CorrectionSource();
  assert.equal(await source.identify({ gtin: CODE }), null);
  assert.equal(await source.identify({ text: 'Kraft Dinner Original 225g' }), null);
});

test('with no corrections at all the source is available and silent', async () => {
  const source = new CorrectionSource();
  assert.equal(source.available().ok, true);
  assert.deepEqual(await source.prices(IDENTITY), []);
});

test('a typed price turns a refusal into an answer, and a second one makes it stronger', async () => {
  // The whole point of the feature, end to end through the real spine.
  //
  // Note what this asserts and what it does not. Since the thresholds came out
  // (2026-09-05, "always answer, and let the confidence carry the doubt"), one
  // price is enough to produce a verdict, so a single correction is not
  // recorded-and-waiting: it answers, at low confidence, with the shortfall
  // named in a sentence the shopper reads. The second correction is what moves
  // the band, not what unlocks the answer.
  const sources = [new StubSource(IDENTITY, []), new CorrectionSource()];
  const query = { gtin: CODE, category: 'grocery' as const, askingCents: 429, asOf: AS_OF };

  const before = await priceIt(query, { sources });
  assert.equal(before.kind, 'refusal', 'nothing to compare against at all');

  recordCorrection(correction({ deviceId: 'device-a', seller: 'Metro', priceCents: 249 }));
  const one = await priceIt(query, { sources });
  assert.equal(one.kind, 'verdict', 'one typed price is enough to answer');
  if (one.kind !== 'verdict') return;
  assert.equal(one.pointCount, 1);
  assert.equal(one.confidence.band, 'low');
  assert.match(one.confidence.because, /1 price where groceries.*needs 2/i);

  recordCorrection(correction({ deviceId: 'device-b', seller: 'No Frills', priceCents: 269 }));
  const two = await priceIt(query, { sources });
  assert.equal(two.kind, 'verdict');
  if (two.kind !== 'verdict') return;

  assert.equal(two.pointCount, 2);
  assert.equal(two.comparisonSet.length, 2);
  assert.equal(two.spread.lowCents, 249);
  assert.equal(two.spread.highCents, 269);
  assert.equal(two.tier, 'walk_away', '$4.29 against a shelf of $2.49 and $2.69');
  assert.doesNotMatch(
    two.confidence.because,
    /usually needs/i,
    'the second reading clears the shortfall the first one was flagged for',
  );
});

test('a correction from the shop you are standing in is dropped from your own comparison', async () => {
  // The reason the correction screen refuses to save without a shop. Without
  // this, a shopper in Metro is shown Metro's own price as the thing Metro is
  // being judged against, and it reads as a fair deal because it is itself.
  const sources = [new StubSource(IDENTITY, []), new CorrectionSource()];

  recordCorrection(correction({ deviceId: 'device-a', seller: 'Metro', priceCents: 249 }));
  recordCorrection(correction({ deviceId: 'device-b', seller: 'No Frills', priceCents: 269 }));

  const standingInMetro = await priceIt(
    { gtin: CODE, category: 'grocery', askingCents: 249, askingSeller: 'Metro Inc.', asOf: AS_OF },
    { sources },
  );

  assert.equal(standingInMetro.kind, 'verdict');
  if (standingInMetro.kind !== 'verdict') return;
  assert.equal(standingInMetro.pointCount, 1, 'Metro is gone from its own comparison');
  assert.deepEqual(
    standingInMetro.comparisonSet.map((p) => p.seller),
    ['No Frills'],
  );
  // "Metro Inc." and "Metro" are the same merchant. If this ever stops holding,
  // the price is compared against itself and nothing else in the system notices.
  assert.equal(standingInMetro.confidence.band, 'low');
});

test('a stale correction ages out the way any other price does', async () => {
  const sources = [new StubSource(IDENTITY, []), new CorrectionSource()];
  recordCorrection(correction({ deviceId: 'device-a', seller: 'Metro', seenOn: '2026-01-01' }));
  recordCorrection(correction({ deviceId: 'device-b', seller: 'No Frills', seenOn: '2026-01-01' }));

  const result = await priceIt(
    { gtin: CODE, category: 'grocery', askingCents: 429, asOf: AS_OF },
    { sources },
  );
  assert.equal(result.kind, 'refusal');
});

test('the corrections source is wired into the real source list', () => {
  // A source nothing constructs is a source that never runs. This is the check
  // that the adapter is actually reachable from the app, not only from a test.
  const ids = defaultSources().map((s) => s.id);
  assert.ok(ids.includes('corrections'), ids.join(', '));
  assert.ok(
    ids.indexOf('corrections') < ids.indexOf('observed'),
    'a correction names its shop and most observed rows cannot, so it ranks above them',
  );
});
