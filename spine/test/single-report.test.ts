/**
 * Item 15 of the beta build plan: "one shopper saw this".
 *
 * The plan's own words, and they are the specification this file tests:
 *
 *   a. Verdict rule: one typed price with no other source shows "one shopper
 *      saw $X at store, date", never a tier.
 *   b. Corroboration: a typed price counts toward a tier only when a second
 *      device or a crawled source agrees within a band.
 *   d. Test: a single report never yields a tier.
 *
 * WHY THIS IS NOT THE SAME AS THE LONE-CLAIM HOLD in `lone-claim.test.ts`.
 * That hold answers "is this one number wildly out of line with the crawled
 * prices we hold", and it can only fire where crawled prices exist to be out of
 * line with. This one answers the case the hold could never reach: nobody has
 * crawled anything, so there is no baseline, so the hold correctly declines to
 * accuse, and until today the result was a full tier computed from one person's
 * typed number. That is the shape D-022 named as the thing that gates opening
 * the app to anybody else, and it is the half the hold left open.
 *
 * A refusal here is not silence. Priority 1 is always answer: the answer is the
 * number, the shop and the day, which is everything the one report actually
 * says. What it is not is a good/fair/walk away call, because a call needs
 * something to compare against and one report is not two.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceIt } from '../src/spine.ts';
import type { Refusal, SpineResult, Verdict } from '../src/contract.ts';
import { AS_OF, StubSource, identity, point } from './helpers.ts';

function deps(source: StubSource) {
  return { sources: [source] };
}

function asRefusal(r: SpineResult): Refusal {
  assert.equal(r.kind, 'refusal', `expected a refusal, got a ${r.kind}`);
  return r as Refusal;
}

function asVerdict(r: SpineResult): Verdict {
  assert.equal(r.kind, 'verdict', `expected a verdict, got ${r.kind === 'refusal' ? r.reason : ''}`);
  return r as Verdict;
}

/** One price somebody typed on a phone, which is what `witnesses: 1` means. */
function typed(seller: string, cents: number, observedAt = '2026-09-03') {
  return point(seller, cents, 'regular', observedAt, { witnesses: 1 });
}

async function price(points: ReturnType<typeof point>[], askingCents = 399, askingSeller?: string) {
  const src = new StubSource(identity('grocery'), points);
  return priceIt({ text: 'x', askingCents, askingSeller, asOf: AS_OF }, deps(src));
}

test('a single typed report never yields a tier', async () => {
  const r = asRefusal(await price([typed('No Frills', 399)]));
  assert.equal(r.reason, 'single_report');
});

test('the one report is still the answer: the price, the shop and the day are all in it', async () => {
  const r = asRefusal(await price([typed('No Frills', 399)]));
  assert.match(r.detail, /one shopper saw/i, `the sentence has to say who saw it: ${r.detail}`);
  assert.match(r.detail, /\$3\.99/, `the price has to be in it: ${r.detail}`);
  assert.match(r.detail, /No Frills/, `the shop has to be in it: ${r.detail}`);
  assert.match(r.detail, /3 September/, `the day has to be in it: ${r.detail}`);
});

test('the report itself travels on the refusal, so nothing typed is thrown away', async () => {
  const r = asRefusal(await price([typed('No Frills', 399)]));
  assert.equal(r.evidence.length, 1);
  assert.equal(r.evidence[0].amountCents, 399);
});

test('a second device on the same shelf turns the same report into a tier', async () => {
  // `witnesses: 2` is what `price/src/corrections.ts` counts when a different
  // device reported the same subject at the same shop for a price close enough
  // to be the same tag. That is a reading rather than a claim, and it counts.
  const v = asVerdict(await price([point('No Frills', 399, 'regular', '2026-09-03', { witnesses: 2 })]));
  assert.ok(v.tier === 'good' || v.tier === 'fair' || v.tier === 'walk_away');
});

test('a crawled price inside the band corroborates a typed one', async () => {
  // 399 against a crawled 420: 21 cents apart, inside the band, so the seller's
  // own published number vouches for what the shopper typed.
  const v = asVerdict(await price([typed('No Frills', 399), point('Walmart', 420)]));
  const sellers = v.comparisonSet.map((p) => p.seller);
  assert.ok(sellers.includes('No Frills'), `the corroborated report was dropped: ${sellers.join(', ')}`);
  assert.ok(sellers.includes('Walmart'));
});

test('a crawled price outside the band does not corroborate, and the crawl answers alone', async () => {
  // 399 typed against a crawled 900. Not the same tag by any reading, so the
  // typed number does not count toward the tier. The crawled price still does,
  // so there is still an answer: this rule never turns two numbers into none.
  const v = asVerdict(await price([typed('No Frills', 399), point('Walmart', 900)]));
  const sellers = v.comparisonSet.map((p) => p.seller);
  assert.ok(!sellers.includes('No Frills'), `an uncorroborated report reached the tier: ${sellers.join(', ')}`);
  assert.ok(sellers.includes('Walmart'));
  assert.match(
    v.confidence.because,
    /not counted|held back/i,
    `a report that was not counted has to be named: ${v.confidence.because}`,
  );
});

test('two shoppers in two different shops do not corroborate each other', async () => {
  // Corroboration is about one shelf, not about two people being present. Two
  // shops, two numbers, nobody has checked either of them, so there is nothing
  // to compare against and no tier. Letting these two vouch for each other is
  // exactly how two colluding devices would establish their own normal.
  const r = asRefusal(await price([typed('No Frills', 399), typed('Metro', 419)]));
  assert.equal(r.reason, 'single_report');
  assert.match(r.detail, /No Frills/);
  assert.match(r.detail, /Metro/);
});

test('the thin path obeys the same rule: a report from the shop being judged is not a comparison', async () => {
  // Self-exclusion empties the category's comparison set, which is the branch
  // that hands the answer to the thin judge. The rule has to hold on that path
  // too, or the same single report produces a tier by a different route.
  const r = asRefusal(await price([typed('No Frills', 399)], 399, 'No Frills'));
  assert.equal(r.reason, 'single_report');
});

test('the rule is about corroboration, not about typed prices being worth less', async () => {
  // Two devices at one shop and a crawled price elsewhere: a full comparison,
  // and the typed reading is in it on the same footing as the crawl.
  const v = asVerdict(
    await price([point('No Frills', 399, 'regular', '2026-09-03', { witnesses: 2 }), point('Walmart', 349)]),
  );
  assert.equal(v.comparisonSet.length, 2);
  assert.doesNotMatch(v.confidence.because, /not counted/i);
});
