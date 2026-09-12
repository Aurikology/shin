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
import { StubSource, point } from './helpers.ts';

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
  /*
   * The whole point of the feature, end to end through the real spine.
   *
   * REWRITTEN 2026-09-11 for item 15 of the beta build plan. This used to assert
   * that one typed price produces a tier at low confidence. It does not any
   * more, and that is the item: "one typed price with no other source shows 'one
   * shopper saw $X at store, date', never a tier." One person's word cannot be
   * compared against anything, and a good / fair / walk away call is a
   * comparison.
   *
   * What the feature still does, and what this test now asserts, is the sentence
   * this test was always about: before the correction the app can say nothing at
   * all about this product; after it, it can say the number, the shop and the
   * day. The second device at the same shelf is what makes it a tier.
   */
  const sources = [new StubSource(IDENTITY, []), new CorrectionSource()];
  const query = { gtin: CODE, category: 'grocery' as const, askingCents: 429, asOf: AS_OF };

  const before = await priceIt(query, { sources });
  assert.equal(before.kind, 'refusal', 'nothing to compare against at all');
  if (before.kind !== 'refusal') return;
  assert.equal(before.reason, 'no_source_response');

  recordCorrection(correction({ deviceId: 'device-a', seller: 'Metro', priceCents: 249 }));
  const one = await priceIt(query, { sources });
  assert.equal(one.kind, 'refusal', 'one typed price is one person"s word, not a comparison');
  if (one.kind !== 'refusal') return;
  assert.equal(one.reason, 'single_report');
  assert.match(one.detail, /one shopper saw \$2\.49 at Metro on 5 September/i, one.detail);
  assert.equal(one.evidence.length, 1, 'the reading itself still travels with the answer');

  recordCorrection(correction({ deviceId: 'device-b', seller: 'Metro', priceCents: 269 }));
  const two = await priceIt(query, { sources });
  assert.equal(two.kind, 'verdict', 'a second device on the same shelf is a reading, not a claim');
  if (two.kind !== 'verdict') return;

  assert.equal(two.pointCount, 2);
  assert.equal(two.comparisonSet.length, 2);
  assert.equal(two.spread.lowCents, 249);
  assert.equal(two.spread.highCents, 269);
  assert.equal(two.tier, 'walk_away', '$4.29 against a shelf of $2.49 and $2.69');
});

test('a correction from the shop you are standing in is dropped from your own comparison', async () => {
  // The reason the correction screen refuses to save without a shop. Without
  // this, a shopper in Metro is shown Metro's own price as the thing Metro is
  // being judged against, and it reads as a fair deal because it is itself.
  /*
   * The crawled price is here for item 15b, not for the property under test: a
   * typed price counts toward a tier only when a second device or a crawled
   * source agrees within a band, and $2.59 published by a seller is within the
   * band of both typed readings. Without it this case would correctly come back
   * as two uncorroborated reports and the self-exclusion under test would never
   * be reached.
   */
  const sources = [new StubSource(IDENTITY, [point('Walmart', 259, 'regular', '2026-09-05')]), new CorrectionSource()];

  recordCorrection(correction({ deviceId: 'device-a', seller: 'Metro', priceCents: 249 }));
  recordCorrection(correction({ deviceId: 'device-b', seller: 'No Frills', priceCents: 269 }));

  const standingInMetro = await priceIt(
    { gtin: CODE, category: 'grocery', askingCents: 249, askingSeller: 'Metro Inc.', asOf: AS_OF },
    { sources },
  );

  assert.equal(standingInMetro.kind, 'verdict');
  if (standingInMetro.kind !== 'verdict') return;
  assert.deepEqual(
    standingInMetro.comparisonSet.map((p) => p.seller).sort(),
    ['No Frills', 'Walmart'],
    'Metro is gone from its own comparison',
  );
  // "Metro Inc." and "Metro" are the same merchant. If this ever stops holding,
  // the price is compared against itself and nothing else in the system notices.
  assert.equal(standingInMetro.confidence.band, 'low');
});

test('a stale correction ages out the way any other price does', async () => {
  // The January crawl is what lets the January corrections count at all (item
  // 15b); it is January too, so nothing here is fresher than anything else and
  // the age is still the only thing being tested.
  const sources = [
    new StubSource(IDENTITY, [point('Walmart', 259, 'regular', '2026-01-01')]),
    new CorrectionSource(),
  ];
  recordCorrection(correction({ deviceId: 'device-a', seller: 'Metro', seenOn: '2026-01-01' }));
  recordCorrection(correction({ deviceId: 'device-b', seller: 'No Frills', seenOn: '2026-01-01' }));

  const result = await priceIt(
    { gtin: CODE, category: 'grocery', askingCents: 429, asOf: AS_OF },
    { sources },
  );
  /*
   * CHANGED 2026-09-08. This asserted a refusal, which was a proxy for "the age
   * was noticed" and stopped being available on 2026-09-08 when a set outside
   * the window started answering with its age named instead of withholding the
   * verdict. The property under test is unchanged and is now asserted directly:
   * a correction from January does not get to look current.
   */
  assert.equal(result.kind, 'verdict');
  assert.equal(result.confidence.band, 'low');
  assert.match(result.confidence.because, /days old/);
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
