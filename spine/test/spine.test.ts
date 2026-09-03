import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceIt } from '../src/spine.ts';
import type { Refusal, Verdict } from '../src/contract.ts';
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

test('produce is refused as a category, with the reversing condition available', async () => {
  const src = new StubSource(identity('produce'), [point('Metro', 699), point('Food Basics', 599)]);
  const r = asRefusal(await priceIt({ text: 'oranges', askingCents: 699, asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'category_unsupported');
  assert.match(r.detail, /PLU/);
});

test('list price alone is not a comparison', async () => {
  const src = new StubSource(identity('tech'), [point('Sony (list)', 42999, 'list')]);
  const r = asRefusal(await priceIt({ text: 'xm5', askingCents: 42999, asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'too_few_points');
  assert.match(r.detail, /list/);
});

test('no points at all is a source failure, not a thin comparison', async () => {
  const src = new StubSource(identity('furniture'), []);
  const r = asRefusal(await priceIt({ text: 'poang', askingCents: 12900, asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'no_source_response');
});

test('one seller is not a comparison in grocery', async () => {
  const src = new StubSource(identity('grocery'), [point('Walmart', 1197)]);
  const r = asRefusal(await priceIt({ text: 'tide', askingCents: 1197, asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'too_few_points');
});

test('comparisons without a subject refuse rather than inventing one', async () => {
  const src = new StubSource(identity('grocery'), [point('Walmart', 147), point('Metro', 200)]);
  const r = asRefusal(await priceIt({ text: 'kd', asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'no_asking_price');
  assert.equal(r.evidence.length, 2);
});

test('stale points are refused, not quietly used', async () => {
  const src = new StubSource(identity('grocery'), [
    point('Walmart', 147, 'regular', '2026-08-25'),
    point('Metro', 189, 'regular', '2026-08-24'),
  ]);
  const r = asRefusal(await priceIt({ text: 'kd', askingCents: 200, asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'points_too_stale');
});

test('two balanced clusters refuse rather than averaging two products together', async () => {
  const src = new StubSource(identity('used'), [
    point('Kijiji', 5000, 'asking'),
    point('Kijiji', 6000, 'asking'),
    point('eBay', 480000, 'asking'),
    point('eBay', 490000, 'asking'),
  ]);
  const r = asRefusal(await priceIt({ text: 'r6', askingCents: 200000, asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'comparison_incoherent');
});

test('the pilot Canon failure refuses, at the 3x spread it actually had', async () => {
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
  const r = asRefusal(await priceIt({ text: 'canon r6', askingCents: 450000, asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'comparison_incoherent');
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
  const r = asRefusal(await priceIt({ text: 'xm5', askingCents: 49999, asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'too_few_points');
  assert.match(r.detail, /1 seller/);
});

test('the store being judged is excluded however its feed spells it', async () => {
  const src = new StubSource(identity('grocery'), [
    point('Metro Inc', 899),
    point('Walmart', 899),
  ]);
  const r = asRefusal(
    await priceIt({ text: 'kd', askingCents: 899, askingSeller: 'Metro', asOf: AS_OF }, deps(src)),
  );
  assert.equal(r.reason, 'too_few_points');
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
  const r = asRefusal(await priceIt({ text: 'xm5', askingCents: 39999, asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'points_too_stale');
  assert.match(r.detail, /current enough/);
});

test('future-dated points are rejected rather than aged to zero', async () => {
  const src = new StubSource(identity('grocery'), [
    point('Walmart', 299, 'regular', '2027-06-01'),
    point('Metro', 299, 'regular', '2027-06-01'),
    point('Sobeys', 299, 'regular', '2027-06-01'),
  ]);
  const r = asRefusal(await priceIt({ text: 'kd', askingCents: 299, asOf: AS_OF }, deps(src)));
  assert.equal(r.reason, 'too_few_points');
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
  const points = [
    point('Metro', 200),
    point('Walmart', 147),
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
  assert.equal(withSeller.comparisonSet.length, 2);
  assert.ok(!withSeller.comparisonSet.some((p) => p.seller === 'Metro'));
  assert.match(withSeller.lines[0], /\$1\.47 at the one store carrying it/);

  // Unnamed: Metro's own $2.00 counts as a competing quote and drags the stated
  // regular price up, which reads to the shopper as other shops being dearer.
  assert.equal(without.comparisonSet.length, 3);
  assert.ok(without.comparisonSet.some((p) => p.seller === 'Metro'));
  assert.match(without.lines[0], /about \$1\.74 across 2 stores/);
});
