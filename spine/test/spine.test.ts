import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceIt } from '../src/spine.ts';
import type {
  CategoryId,
  PricePoint,
  ProductIdentity,
  Refusal,
  SpineQuery,
  Verdict,
} from '../src/contract.ts';
import type { PriceSource, SourceAvailability } from '../src/sources/source.ts';
import { AS_OF, StubSource, identity, point } from './helpers.ts';

function deps(source: StubSource) {
  return { sources: [source] };
}

function asRefusal(r: Verdict | Refusal): Refusal {
  assert.equal(r.kind, 'refusal', `expected a refusal, got ${r.kind}`);
  return r as Refusal;
}

function asVerdict(r: Verdict | Refusal): Verdict {
  assert.equal(r.kind, 'verdict', `expected a verdict, got ${r.kind === 'refusal' ? r.reason : ''}`);
  return r as Verdict;
}

test('no identity refuses before any price is considered', async () => {
  const src = new StubSource(null, [point('Walmart', 147)]);
  const r = asRefusal(await priceIt({ text: 'whatever', askingCents: 200, asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'no_identity');
  assert.equal(r.evidence.length, 0);
});

test('a shaky identity refuses even when the prices are perfect', async () => {
  // The pilot's worst failure: every number accurate, wrong camera.
  const src = new StubSource(identity('used', 0.55, 'Canon EOS R6 Mark II bundle'), [
    point('Kijiji', 150000, 'asking'),
    point('Kijiji', 160000, 'asking'),
    point('eBay', 170000, 'asking'),
    point('eBay', 180000, 'asking'),
  ]);
  const r = asRefusal(await priceIt({ text: 'canon r6', askingCents: 200000, asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'identity_unsure');
  assert.match(r.detail, /Canon EOS R6 Mark II bundle/);
});

test('the unsure sentence carries no category slug and no research prose', async () => {
  /*
   * D-013. The Canon refusal read "Not sure enough this is the right used
   * goods" and then concatenated about 450 characters of research notes about
   * eBay sold listings in US dollars. The category is out of the sentence and
   * the notes travel on their own field.
   *
   * Negative-tested 2026-09-07 by restoring the old template and watching both
   * halves go red.
   */
  const note =
    'free search answered with a Canon EOS R6 Mark II bundled with lenses at about $4,800: a different camera at nearly triple.';
  const src = new StubSource(identity('used', 0.55, 'Canon EOS R6, used body'), []);
  const r = asRefusal(
    await priceIt(
      { text: 'canon r6', askingCents: 200000, asOf: AS_OF },
      { sources: [src], identityNote: () => note },
    ),
  );
  assert.equal(r.reason, 'identity_unsure');
  assert.equal(
    r.detail,
    'Not sure enough this is the right one. The closest match was "Canon EOS R6, used body". Pick the right one and Shin will price it.',
  );
  assert.doesNotMatch(r.detail, /used goods|grocery|furniture/i, 'no category slug in the sentence');
  assert.ok(!r.detail.includes(note), 'the research note must not be in the headline');
  assert.equal(r.evidenceNote, note, 'and it must still be reachable, on its own field');
});

test('an identity with no recorded note carries no empty evidence field', async () => {
  const src = new StubSource(identity('used', 0.55, 'Something'), []);
  const r = asRefusal(await priceIt({ text: 'x', askingCents: 100, asOf: AS_OF }, deps(src)));
  assert.equal(r.evidenceNote, undefined);
});

test('produce is refused as a category, with the reversing condition available', async () => {
  const src = new StubSource(identity('produce'), [point('Metro', 699), point('Food Basics', 599)]);
  const r = asRefusal(await priceIt({ text: 'oranges', askingCents: 699, asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'category_unsupported');
  assert.match(r.detail, /PLU/);
});

/*
 * D-011 and D-012, one test per filter condition.
 *
 * The comparison set is filtered on four things and the empty result used to
 * carry two messages, so self-exclusion was reported as an age problem and the
 * whole family came back as `too_few_points` over an evidence array that was
 * not thin. Each condition now has its own code, and each of the four tests
 * below empties the set on exactly one of them.
 *
 * Every one of these was negative-tested on 2026-09-07 by reverting
 * `spine/src/spine.ts` to the single combined filter and watching it go red.
 */

test('every price found being a kind we cannot compare is its own reason', async () => {
  // Condition 1: usable kind. A manufacturer list price with no retailer
  // behind it, which is the Sony WH-1000XM5 row in the pilot corpus.
  const src = new StubSource(identity('tech'), [point('Sony (list)', 42999, 'list')]);
  const r = asRefusal(await priceIt({ text: 'xm5', askingCents: 42999, asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'unusable_price_kinds');
  assert.match(r.detail, /list/);
  assert.equal(r.evidence.length, 1, 'a refusal still shows what it did find');
});

test('every price found being dated in the future is its own reason', async () => {
  // Condition 2: not future dated. These used to report as an age problem,
  // which is the opposite of what is wrong with them.
  const src = new StubSource(identity('grocery'), [
    point('Walmart', 299, 'regular', '2027-06-01'),
    point('Metro', 299, 'regular', '2027-06-01'),
  ]);
  const r = asRefusal(await priceIt({ text: 'kd', askingCents: 299, asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'points_future_dated');
  assert.match(r.detail, /later than today/);
  assert.equal(r.evidence.length, 2);
});

test('every price found being older than the window is its own reason', async () => {
  // Condition 3: inside the history window. Grocery's window is short and
  // these are years outside it, from two sellers, neither of them the shopper's.
  const src = new StubSource(identity('grocery'), [
    point('Walmart', 299, 'regular', '2020-02-01'),
    point('Metro', 315, 'regular', '2020-03-01'),
  ]);
  const r = asRefusal(
    await priceIt({ text: 'kd', askingCents: 299, askingSeller: 'Sobeys', asOf: AS_OF }, deps(src)),
  );
  assert.equal(r.reason, 'points_too_stale');
  assert.match(r.detail, /recent enough/);
  assert.equal(r.evidence.length, 2);
});

test('every price found being the shopper own store is its own reason, not an age problem', async () => {
  // Condition 4, D-012 itself, and the condition that fires most often now
  // that one store supplies almost every price we hold. Thirteen current
  // prices, every one of them Walmart, and Walmart is the store being judged.
  // This is the exact shape D-011 recorded: `too_few_points` over an evidence
  // array that was never thin.
  const walmart = Array.from({ length: 13 }, (_, i) =>
    point(i % 2 === 0 ? 'Walmart' : 'walmart.ca', 1197 + i, 'regular', '2026-09-03'),
  );
  const src = new StubSource(identity('grocery'), walmart);
  const r = asRefusal(
    await priceIt({ text: 'tide', askingCents: 1197, askingSeller: 'Walmart', asOf: AS_OF }, deps(src)),
  );
  assert.equal(r.reason, 'all_points_from_asking_seller');
  assert.match(r.detail, /same store/);
  assert.equal(r.evidence.length, 13, 'the count the old code name claimed to describe');
  assert.doesNotMatch(r.detail, /recent|old/, 'age is not what fired and must not be named');
});

test('a refusal never suggests the shopper did anything wrong', async () => {
  // Hard rule 3. The aggression points at the price, the store or the brand.
  const cases = [
    { points: [point('Sony (list)', 42999, 'list')], cat: 'tech' as const, seller: undefined },
    { points: [point('Walmart', 299, 'regular', '2027-06-01')], cat: 'grocery' as const, seller: undefined },
    { points: [point('Walmart', 299, 'regular', '2020-02-01')], cat: 'grocery' as const, seller: 'Sobeys' },
    { points: [point('Walmart', 1197)], cat: 'grocery' as const, seller: 'Walmart' },
  ];
  for (const c of cases) {
    const src = new StubSource(identity(c.cat), c.points);
    const r = asRefusal(
      await priceIt({ text: 'x', askingCents: 1197, askingSeller: c.seller, asOf: AS_OF }, deps(src)),
    );
    assert.doesNotMatch(r.detail, /\byou\b|\byour\b/i, `${r.reason} points at the user`);
  }
});

test('no points at all is a source failure, not a thin comparison', async () => {
  const src = new StubSource(identity('furniture'), []);
  const r = asRefusal(await priceIt({ text: 'poang', askingCents: 12900, asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'no_source_response');
});

test('one seller in grocery is answered, and the answer says it is one seller', async () => {
  // CHANGED 2026-09-05. This used to assert a refusal. One seller is now an
  // answer with the thinness named, because a shopper holding the box learns
  // more from "Walmart has it at $11.97, and that is the only seller we found"
  // than from being told nothing.
  const src = new StubSource(identity('grocery'), [point('Walmart', 1197)]);
  const v = asVerdict(await priceIt({ text: 'tide', askingCents: 1197, asOf: AS_OF }, deps(src)));
  assert.ok(v.tier, 'a single seller must still produce a tier');
  assert.equal(v.confidence.band, 'low');
  assert.equal(v.confidence.distinctSellers, 1);
  assert.match(v.confidence.because, /1 seller/);
});

test('comparisons without a subject refuse rather than inventing one', async () => {
  const src = new StubSource(identity('grocery'), [point('Walmart', 147), point('Metro', 200)]);
  const r = asRefusal(await priceIt({ text: 'kd', asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'no_asking_price');
  assert.equal(r.evidence.length, 2);
});

test('stale points are used, and never quietly', async () => {
  // CHANGED 2026-09-05. The old name was "stale points are refused, not quietly
  // used" and the half that mattered was "not quietly". Ten-day-old grocery
  // prices are now used and the age is stated on the answer, which is the same
  // protection without the silence.
  const src = new StubSource(identity('grocery'), [
    point('Walmart', 147, 'regular', '2026-08-25'),
    point('Metro', 189, 'regular', '2026-08-24'),
  ]);
  const v = asVerdict(await priceIt({ text: 'kd', askingCents: 200, asOf: AS_OF }, deps(src)));
  assert.ok(v.tier);
  assert.equal(v.confidence.band, 'low');
  assert.match(v.confidence.because, /days old/, 'the age must be said, not implied');
  assert.equal(v.pointCount, 2, 'the old prices are what the answer rests on, so they are shown');
});

test('two balanced clusters are called out rather than averaged into one product', async () => {
  // CHANGED 2026-09-05. $50 listings and $4,800 listings in one set are two
  // different things wearing one name. That is still never averaged into a
  // single number, which was always the real content of this test; it is now
  // said on the answer instead of replacing the answer.
  const src = new StubSource(identity('used'), [
    point('Kijiji', 5000, 'asking'),
    point('Kijiji', 6000, 'asking'),
    point('eBay', 480000, 'asking'),
    point('eBay', 490000, 'asking'),
  ]);
  const v = asVerdict(await priceIt({ text: 'r6', askingCents: 200000, asOf: AS_OF }, deps(src)));
  assert.equal(v.confidence.band, 'low');
  assert.match(v.confidence.because, /more than one product/);
});

test('the pilot Canon failure is caught, at the 3x spread it actually had', async () => {
  // One true body listing among a cluster of R6 Mark II bundles. This is the
  // case the whole identity design was written about, and a ratio threshold set
  // anywhere that keeps a real used market alive cannot catch it. The set is
  // only 3x wide; a used POANG is 4.5x wide and must still be answered.
  const src = new StubSource(identity('used', 0.95, 'Canon EOS R6, used body'), [
    point('Kijiji', 160000, 'asking'),
    point('Kijiji', 455000, 'asking'),
    point('Kijiji', 460000, 'asking'),
    point('Facebook Marketplace', 465000, 'asking'),
    point('Facebook Marketplace', 470000, 'asking'),
    point('eBay', 480000, 'asking'),
  ]);
  // CHANGED 2026-09-05: named on the answer rather than withheld. The detection
  // this test exists for is unchanged, and it is still the case that no ratio
  // threshold wide enough to keep a real used market alive would catch this set.
  const v = asVerdict(await priceIt({ text: 'canon r6', askingCents: 450000, asOf: AS_OF }, deps(src)));
  assert.equal(v.confidence.band, 'low');
  assert.match(v.confidence.because, /more than one product/);
});

test('a genuinely wide used market is still answered', async () => {
  // The counterweight to the test above, and the reason the check is about
  // shape rather than width. This set is WIDER than the Canon one and is real.
  const src = new StubSource(identity('used', 0.93), [
    point('Kijiji', 3500, 'asking'),
    point('Kijiji', 15900, 'asking'),
    point('Facebook Marketplace', 6000, 'asking'),
    point('Facebook Marketplace', 12000, 'asking'),
  ]);
  const v = asVerdict(await priceIt({ text: 'poang', askingCents: 8000, asOf: AS_OF }, deps(src)));
  assert.equal(v.tier, 'fair');
});

test('the seller being judged is excluded from its own comparison set', async () => {
  const src = new StubSource(identity('grocery'), [
    point('Metro', 200),
    point('Walmart', 147),
    point('Loblaw banners', 55, 'promotional', '2026-09-03', { limit: 'limit 8' }),
    point('Sobeys', 125, 'promotional'),
  ]);
  const v = asVerdict(
    await priceIt({ text: 'kd', askingCents: 200, askingSeller: 'Metro', asOf: AS_OF }, deps(src)),
  );
  assert.equal(v.pointCount, 3);
  assert.ok(!v.comparisonSet.some((p) => p.seller === 'Metro'), 'Metro compared against itself');
});

test('grocery returns two lines and walks away from the pilot Kraft Dinner case', async () => {
  const src = new StubSource(identity('grocery', 0.97, 'Kraft Dinner 225g'), [
    point('Metro', 200),
    point('Walmart', 147),
    point('Loblaw banners', 55, 'promotional', '2026-09-03', { limit: 'limit 8' }),
    point('Sobeys', 125, 'promotional'),
  ]);
  const v = asVerdict(
    await priceIt({ text: 'kd', askingCents: 200, askingSeller: 'Metro', asOf: AS_OF }, deps(src)),
  );
  assert.equal(v.tier, 'walk_away');
  assert.equal(v.lines.length, 2);
  assert.match(v.lines[0], /Regular price/);
  assert.match(v.lines[1], /\$0\.55 at Loblaw banners \(limit 8\)/);
  assert.ok(v.disagreement, 'a 2.67x spread should be said out loud');
  assert.equal(v.spread.lowCents, 55);
  assert.equal(v.spread.highCents, 147);
});

test('grocery calls the cheapest shelf good', async () => {
  const src = new StubSource(identity('grocery'), [
    point('Walmart', 147),
    point('Metro', 200),
    point('Sobeys', 189),
  ]);
  const v = asVerdict(await priceIt({ text: 'kd', askingCents: 147, asOf: AS_OF }, deps(src)));
  assert.equal(v.tier, 'good');
});

test('tech tiers off the cheapest retailer, within a couple of percent', async () => {
  const points = [point('Best Buy', 39999), point('Amazon', 40999), point('Walmart', 42999)];
  const src = new StubSource(identity('tech'), points);
  const good = asVerdict(await priceIt({ text: 'xm5', askingCents: 39999, asOf: AS_OF }, deps(src)));
  assert.equal(good.tier, 'good');
  const fair = asVerdict(await priceIt({ text: 'xm5', askingCents: 42000, asOf: AS_OF }, deps(src)));
  assert.equal(fair.tier, 'fair');
  const walk = asVerdict(await priceIt({ text: 'xm5', askingCents: 45999, asOf: AS_OF }, deps(src)));
  assert.equal(walk.tier, 'walk_away');
  assert.equal(walk.lines.length, 1);
});

test('used reads off the lower cluster because asking prices lean high', async () => {
  const src = new StubSource(identity('used', 0.93), [
    point('Kijiji', 3500, 'asking'),
    point('Kijiji', 15900, 'asking'),
    point('Facebook Marketplace', 6000, 'asking'),
    point('Facebook Marketplace', 12000, 'asking'),
  ]);
  const v = asVerdict(await priceIt({ text: 'poang', askingCents: 8000, asOf: AS_OF }, deps(src)));
  assert.equal(v.tier, 'fair');
  assert.match(v.lines[0], /asking prices, not sales/);
  const cheap = asVerdict(await priceIt({ text: 'poang', askingCents: 3400, asOf: AS_OF }, deps(src)));
  assert.equal(cheap.tier, 'good');
  const dear = asVerdict(await priceIt({ text: 'poang', askingCents: 14000, asOf: AS_OF }, deps(src)));
  assert.equal(dear.tier, 'walk_away');
});

test('sold prices outrank asking prices once there are enough of them', async () => {
  const src = new StubSource(identity('used', 0.93), [
    point('Kijiji', 15000, 'asking'),
    point('Kijiji', 16000, 'asking'),
    point('eBay', 8000, 'sold'),
    point('eBay', 9000, 'sold'),
    point('eBay', 8500, 'sold'),
    point('Grailed', 9500, 'sold'),
  ]);
  const v = asVerdict(await priceIt({ text: 'poang', askingCents: 14000, asOf: AS_OF }, deps(src)));
  assert.match(v.lines[0], /what these actually sold for/);
  assert.equal(v.tier, 'walk_away');
});

test('two sold prices do NOT get to replace the basis on their own', async () => {
  // eBay completed listings routinely include "for parts, not working". At two,
  // a pair of those replaced eight live listings and sent a good price to
  // walk-away off a basis of $1.35.
  const src = new StubSource(identity('used', 0.93), [
    point('Kijiji', 15000, 'asking'),
    point('Kijiji', 16000, 'asking'),
    point('Facebook Marketplace', 14000, 'asking'),
    point('Facebook Marketplace', 17000, 'asking'),
    point('eBay', 12000, 'sold'),
    point('eBay', 13500, 'sold'),
  ]);
  const v = asVerdict(await priceIt({ text: 'poang', askingCents: 14000, asOf: AS_OF }, deps(src)));
  assert.match(v.lines[0], /asking prices, not sales/);
  assert.notEqual(v.tier, 'walk_away');
});

test('furniture judges against its own history from a single seller', async () => {
  const history = [
    point('IKEA', 12900, 'regular', '2026-09-01'),
    point('IKEA', 12900, 'regular', '2026-08-01'),
    point('IKEA', 9900, 'promotional', '2026-06-15'),
    point('IKEA', 12900, 'regular', '2026-05-01'),
    point('IKEA', 11900, 'promotional', '2026-03-01'),
  ];
  const src = new StubSource(identity('furniture'), history);

  // Its usual price is fair, because that is what fair means. The value here is
  // not the tier, it is the sentence, which tells you it has been $99 and that
  // IKEA's own product page will never say so.
  const usual = asVerdict(await priceIt({ text: 'poang', askingCents: 12900, asOf: AS_OF }, deps(src)));
  assert.equal(usual.tier, 'fair');
  assert.match(usual.lines[0], /as low as \$99\.00 on 2026-06-15/);
  assert.equal(usual.confidence.distinctSellers, 1);

  const onSale = asVerdict(await priceIt({ text: 'poang', askingCents: 9900, asOf: AS_OF }, deps(src)));
  assert.equal(onSale.tier, 'good');

  const overPriced = asVerdict(await priceIt({ text: 'poang', askingCents: 14900, asOf: AS_OF }, deps(src)));
  assert.equal(overPriced.tier, 'walk_away');
});

test('an unavailable source is skipped, and all-unavailable refuses', async () => {
  const down = new StubSource(identity('grocery'), [point('Walmart', 147)], {
    ok: false,
    reason: 'no key',
  });
  const r = asRefusal(await priceIt({ text: 'kd', askingCents: 200, asOf: AS_OF }, deps(down)));
  assert.equal(r.reason, 'no_source_response');
});

test('confidence names the thing that actually limits it', async () => {
  const thin = new StubSource(identity('grocery'), [point('Walmart', 147), point('Metro', 189)]);
  const v = asVerdict(await priceIt({ text: 'kd', askingCents: 200, asOf: AS_OF }, deps(thin)));
  assert.equal(v.confidence.band, 'low');
  assert.match(v.confidence.because, /Only just enough/);
  assert.equal(v.confidence.distinctSellers, 2);
  assert.equal(v.confidence.identityConfidence, 0.99);
});

// --- Attacks found by an adversary that did not build this, 2026-09-03. ---
// Each one produced a wrong verdict on the shipped code. They are locked here so
// a later change cannot quietly reopen them.

test('a set that is nothing but capped promotions cannot walk anybody away', async () => {
  /*
   * The gap in the rule above. That test passes a regular price alongside the
   * capped promotion, so `attainable` is never empty; when it IS empty the bar
   * fell back to the whole set, caps included, and the guard was bypassed by the
   * one case it most needed to cover.
   *
   * A cap is the shop saying it will not sell you this at that price beyond a
   * handful. Tiering off it tells somebody an ordinary shelf price is a ripoff
   * because a rival ran a doorbuster.
   */
  const capped = [
    point('Loblaw', 55, 'promotional', '2026-09-03', { limit: 'limit 8' }),
    point('Metro', 60, 'promotional', '2026-09-03', { limit: 'limit 4' }),
  ];
  const src = new StubSource(identity('grocery'), capped);
  const v = asVerdict(
    await priceIt({ text: 'kd', askingCents: 147, askingSeller: 'Walmart', asOf: AS_OF }, deps(src)),
  );
  assert.equal(v.tier, 'fair', 'a limit-8 loss leader set the walk-away bar');
  assert.match(v.lines[0], /limited promotion/);

  // The good direction is deliberately untouched: at or under a loss leader is
  // genuinely a good price and saying so misleads nobody.
  const cheap = asVerdict(
    await priceIt({ text: 'kd', askingCents: 50, askingSeller: 'Walmart', asOf: AS_OF }, deps(src)),
  );
  assert.equal(cheap.tier, 'good');

  // And an UNCAPPED promotion is attainable, so it still sets the bar.
  const open = new StubSource(identity('grocery'), [
    point('Loblaw', 55, 'promotional'),
    point('Metro', 60, 'promotional'),
  ]);
  const walk = asVerdict(
    await priceIt({ text: 'kd', askingCents: 147, askingSeller: 'Walmart', asOf: AS_OF }, deps(open)),
  );
  assert.equal(walk.tier, 'walk_away');
});

test('one typed price cannot move a verdict when we hold one crawled price', async () => {
  /*
   * D-022's hold, in the data shape the app actually has. The corpus holds about
   * one crawled price per product, and the hold used to require two before it
   * would look at a claim -- so it never ran where the attack lands. One typed
   * $0.99 against a crawled $3.47 flipped a $3.49 tag from GOOD to WALK AWAY,
   * with the sentence reporting "about $0.99 across 2 stores".
   */
  const crawled = point('walmart.ca', 347);
  const ask = { text: 'kd', askingCents: 349, askingSeller: 'Metro', asOf: AS_OF };
  const alone = asVerdict(await priceIt(ask, deps(new StubSource(identity('grocery'), [crawled]))));
  assert.equal(alone.tier, 'good');

  const lone = asVerdict(
    await priceIt(ask, deps(new StubSource(identity('grocery'), [crawled, { ...point('No Frills', 99), witnesses: 1 }]))),
  );
  assert.equal(lone.tier, 'good', 'a single unwitnessed claim at 28% of the only crawled price moved the verdict');
  assert.doesNotMatch(lone.lines[0], /\$0\.99/, 'the held claim was printed as the going rate');

  // A lone claim INSIDE the plausible range still counts. The hold is for
  // outliers, not for typed prices as such.
  const plausible = asVerdict(
    await priceIt(ask, deps(new StubSource(identity('grocery'), [crawled, { ...point('No Frills', 319), witnesses: 1 }]))),
  );
  assert.equal(plausible.tier, 'fair');

  // And a corroborated claim is published, which is the rule working as
  // designed -- and also the seam that remains open: `witnesses` is counted
  // over device ids the browser invents. See DEFECTS.md D-054.
  const agreed = asVerdict(
    await priceIt(ask, deps(new StubSource(identity('grocery'), [crawled, { ...point('No Frills', 99), witnesses: 2 }]))),
  );
  assert.equal(agreed.tier, 'walk_away');
});

test('a capped loss leader at another chain does not set the walk-away bar', async () => {
  const src = new StubSource(identity('grocery', 0.97, 'Kraft Dinner 225g'), [
    point('Walmart', 147),
    point('Metro', 200),
    point('Loblaw banners', 55, 'promotional', '2026-09-03', { limit: 'limit 8' }),
    point('Sobeys', 125, 'promotional'),
  ]);
  // $1.47 is Walmart's own recorded regular price. It used to come back as
  // WALK AWAY because a limit-8 promotion at Loblaw had moved the goalposts.
  const v = asVerdict(await priceIt({ text: 'kd', askingCents: 147, asOf: AS_OF }, deps(src)));
  assert.notEqual(v.tier, 'walk_away');
});

test('one merchant under several feed spellings is one seller', async () => {
  const src = new StubSource(identity('tech'), [
    point('Best Buy', 49999),
    point('Best Buy Canada', 49999),
    point('BestBuy.ca', 49999),
    point('Best Buy Canada Ltd', 49999),
    point('best buy', 49999),
  ]);
  // CHANGED 2026-09-05. Five spellings of Best Buy are still exactly one
  // seller, and that is now asserted on the number the shopper is shown rather
  // than on a refusal. Removing the gate briefly made this a three-seller
  // answer, because the gate normalised and the confidence sentence did not.
  const v = asVerdict(await priceIt({ text: 'xm5', askingCents: 49999, asOf: AS_OF }, deps(src)));
  assert.equal(v.confidence.distinctSellers, 1, 'five spellings of one chain are one chain');
  assert.equal(v.confidence.band, 'low');
  assert.match(v.confidence.because, /1 seller/);
});

test('the store being judged is excluded however its feed spells it', async () => {
  const src = new StubSource(identity('grocery'), [
    point('Metro Inc', 899),
    point('Walmart', 899),
  ]);
  // CHANGED 2026-09-05. The fact under test is that "Metro Inc" in the feed is
  // the same store as the "Metro" the shopper is standing in, so it cannot be
  // one of the prices Metro is judged against. Asserted on the comparison set
  // now, which is stronger than the old assertion: a refusal only told us the
  // count fell short, not which row was dropped.
  const v = asVerdict(
    await priceIt({ text: 'kd', askingCents: 899, askingSeller: 'Metro', asOf: AS_OF }, deps(src)),
  );
  assert.deepEqual(v.comparisonSet.map((p) => p.seller), ['Walmart']);
  assert.equal(v.confidence.band, 'low');
});

test('a month-old price cannot set the bar in a three-day category', async () => {
  const src = new StubSource(identity('tech'), [
    point('Best Buy', 27999, 'promotional', '2026-08-05'),
    point('Amazon', 41999, 'regular', '2026-08-05'),
    point('Walmart', 42999, 'regular', '2026-08-05'),
    point('Staples', 43999, 'regular', '2026-08-05'),
    point('Costco', 41499, 'regular', '2026-08-05'),
    point('The Source', 39999, 'regular', '2026-09-03'),
  ]);
  // CHANGED 2026-09-05. The month-old Best Buy $279.99 promo is the bar this
  // test exists to keep the shopper from being sent to chase, and it is still
  // kept out of the comparison set. What changed is that the one current price
  // now answers instead of the whole thing refusing, with the five dropped rows
  // named as the reason confidence is low.
  const v = asVerdict(await priceIt({ text: 'xm5', askingCents: 39999, asOf: AS_OF }, deps(src)));
  assert.deepEqual(v.comparisonSet.map((p) => p.seller), ['The Source']);
  assert.ok(!v.comparisonSet.some((p) => p.amountCents === 27999), 'a dead promo cannot set the bar');
  assert.equal(v.confidence.band, 'low');
  assert.match(v.confidence.because, /too old to count/);
});

test('future-dated points are rejected rather than aged to zero', async () => {
  const src = new StubSource(identity('grocery'), [
    point('Walmart', 299, 'regular', '2027-06-01'),
    point('Metro', 299, 'regular', '2027-06-01'),
    point('Sobeys', 299, 'regular', '2027-06-01'),
  ]);
  const r = asRefusal(await priceIt({ text: 'kd', askingCents: 299, asOf: AS_OF }, deps(src)));
  // Was `too_few_points`. D-011: three prices is not a count problem, and a
  // date in the future is not an age problem either.
  assert.equal(r.reason, 'points_future_dated');
});

test('an unparsable asking price refuses instead of falling through to fair', async () => {
  const src = new StubSource(identity('grocery'), [point('Walmart', 147), point('Metro', 200)]);
  const r = asRefusal(await priceIt({ text: 'kd', askingCents: Number('2,00'), asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'no_asking_price');
  assert.match(r.detail, /did not read as a number/);
});

test('a partial name match cannot come back as a certain match', async () => {
  // "kd cup" and "kraft dinner 900g" both resolved to the 225g box and printed
  // "the product is a certain match". Identity confidence described the stored
  // row, never this query's fit to it.
  const { RecordedSource } = await import('../src/sources/recorded.ts');
  const recorded = new RecordedSource();
  const near = await recorded.identify({ text: 'kd cup', category: 'grocery' });
  const exact = await recorded.identify({ text: 'kraft dinner original 225g', category: 'grocery' });
  assert.ok(near !== null && exact !== null);
  assert.ok(near.confidence < exact.confidence, 'a loose match must score below an exact one');
  assert.ok(near.confidence < 0.8, 'and must fall under the grocery identity floor');
});

test('a single regular-price store is stated, never averaged', async () => {
  // "about $1.47 across 1 store" reads as a spread over several shops when only
  // one was ever seen. One observation is a fact, not an approximation, and the
  // whole product rests on not overstating what was measured.
  const src = new StubSource(identity('grocery'), [
    point('Walmart', 147),
    point('Loblaw', 55, 'promotional', '2026-09-03', { limit: 'limit 8' }),
    point('Sobeys', 65, 'promotional'),
  ]);
  const v = asVerdict(
    await priceIt({ text: 'kd', askingCents: 200, askingSeller: 'Metro', asOf: AS_OF }, deps(src)),
  );
  assert.match(v.lines[0], /Regular price is \$1\.47 at the one store carrying it\./);
  assert.doesNotMatch(v.lines[0], /about/);
  assert.doesNotMatch(v.lines[0], /across 1 store/);
});

test('omitting the asking seller silently inflates the comparison, which is why callers must pass it', async () => {
  // Build standard 1 in DEFECTS.md, earned by D-003 and D-009. D-003's test
  // proves the engine excludes the judged seller. It passed while the app was
  // still comparing an item to itself, because the app never told the engine
  // which seller to exclude. This test states the cost of that omission in
  // numbers so the next caller-author reads it rather than rediscovers it.
  /*
   * Three regular prices, not two, so the inflation this test is named for is
   * actually visible in the stated price.
   *
   * With two, the regular set is [147, 200] with Metro and [147] without, and
   * the median is $1.47 either way -- the lower of two middles is the same
   * number as the only middle. The old assertion here read $1.74 and appeared
   * to prove the point, but $1.74 was the MEAN of the two, a price nobody
   * charged; when `median` was corrected to return a real price the test went
   * green while demonstrating nothing. A third store makes the median move for
   * a real reason: [147, 160] without Metro, [147, 160, 200] with.
   */
  const points = [
    point('Metro', 200),
    point('Walmart', 147),
    point('Sobeys', 160),
    point('Loblaw', 55, 'promotional', '2026-09-03', { limit: 'limit 8' }),
  ];

  const withSeller = asVerdict(
    await priceIt(
      { text: 'kd', askingCents: 200, askingSeller: 'Metro', asOf: AS_OF },
      deps(new StubSource(identity('grocery'), points)),
    ),
  );
  const without = asVerdict(
    await priceIt(
      { text: 'kd', askingCents: 200, asOf: AS_OF },
      deps(new StubSource(identity('grocery'), points)),
    ),
  );

  // Named: Metro is gone from the set it is judged against.
  assert.equal(withSeller.comparisonSet.length, 3);
  assert.ok(!withSeller.comparisonSet.some((p) => p.seller === 'Metro'));
  assert.match(withSeller.lines[0], /\$1\.47/);

  // Unnamed: Metro's own $2.00 counts as a competing quote and drags the stated
  // regular price up, which reads to the shopper as other shops being dearer.
  assert.equal(without.comparisonSet.length, 4);
  assert.ok(without.comparisonSet.some((p) => p.seller === 'Metro'));
  /*
   * The inflation, in the number a shopper reads: excluding Metro the regular
   * median is $1.47, including it the median is $1.60. Metro's own $2.00 pulled
   * the stated going rate up by thirteen cents, which reads as other shops
   * being dearer than they are, and it is Metro's tag being judged.
   */
  assert.match(without.lines[0], /\$1\.60/);
  assert.doesNotMatch(without.lines[0], /\$1\.47/);
  // And whatever it states is a price somebody actually charged, never a midpoint.
  const stated = without.comparisonSet.map((pt) => pt.amountCents);
  assert.ok(stated.includes(160), 'the stated regular price is not a price anybody charged');
});

/**
 * A source that answers by name and knows nothing by code: the shape of every
 * real source here, since a code only resolves for a product we hold prices
 * under that code.
 */
class ByWordsOnly implements PriceSource {
  readonly id = 'words';
  readonly label = 'Words';
  readonly verified = true;
  readonly categories: readonly CategoryId[] = ['grocery'];
  available(): SourceAvailability {
    return { ok: true };
  }
  async identify(query: SpineQuery): Promise<ProductIdentity | null> {
    if (query.gtin) return null;
    return query.text ? identity('grocery', 0.99, query.text) : null;
  }
  async prices(): Promise<readonly PricePoint[]> {
    return [point('Walmart', 147), point('No Frills', 152)];
  }
}

test('a barcode we hold no prices for falls back to the words, never to no clue', async () => {
  const src = new ByWordsOnly();

  // The same query, twice, differing only by a code nothing can resolve. The
  // one carrying MORE information must not get the worse answer: that is the
  // shape priority 1 forbids, and it is what shipped until 2026-09-07.
  const withCode = await priceIt(
    { text: 'kraft dinner', gtin: '0000000000000', category: 'grocery', askingCents: 200, asOf: AS_OF },
    { sources: [src] },
  );
  const withoutCode = await priceIt(
    { text: 'kraft dinner', category: 'grocery', askingCents: 200, asOf: AS_OF },
    { sources: [src] },
  );

  assert.equal(withCode.kind, withoutCode.kind);
  assert.equal(asVerdict(withCode).identity.label, 'kraft dinner');
});

test('a code that resolves nothing and words that resolve nothing is still a refusal', async () => {
  const src = new ByWordsOnly();
  const r = asRefusal(
    await priceIt({ gtin: '0000000000000', category: 'grocery', askingCents: 200, asOf: AS_OF }, { sources: [src] }),
  );
  // No text to fall back to, so the retry has nothing to try and nothing is
  // invented. The fallback must not turn every unknown code into an answer.
  assert.equal(r.reason, 'no_identity');
});
