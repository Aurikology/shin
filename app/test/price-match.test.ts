/**
 * The price-match policy table and the answer it produces.
 *
 * WHY THIS FILE IS MOSTLY TABLE ASSERTIONS. The module holds no algorithm
 * worth admiring; it holds eleven facts about eleven retailers, and the only
 * way it can be wrong in the way that matters is by quietly disagreeing with
 * the source it was copied from. So every row of
 * `docs/shipped-scanners-2026-09-20.md` section 1 is asserted here field by
 * field, including the fields that are `null`. A `null` that silently became a
 * guessed default is exactly the failure this file exists to catch.
 *
 * THE SECOND HALF is the answer function, and what is covered there is only
 * the cases where a shopper could be told something false: a banner nobody has
 * a policy for, a banner that does not match anybody, the same banner offering
 * its own price, an offer that is not actually cheaper, a price that is not a
 * usable integer, and Walmart, which is the one row whose "no" has a "yes"
 * hidden inside it.
 *
 * NOTHING HERE ASSERTS A PRICE COMES OUT, because no price comes out. The
 * module is handed two numbers and returns policy. A test that expected a
 * computed amount would be testing a rule violation (Jamin's rule 3).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PRICE_MATCH_POLICIES,
  policyFor,
  normaliseBanner,
  priceMatchAdvice,
  type PriceMatchPolicy,
} from '../src/price-match.ts';

function row(banner: string): PriceMatchPolicy {
  const found = policyFor(banner);
  assert.ok(found, `no policy row for ${banner}`);
  return found;
}

/* ------------------------------------------------------------------ the table */

test('the table holds exactly the eleven retailers the research doc names', () => {
  assert.equal(PRICE_MATCH_POLICIES.length, 11);
  assert.deepEqual(
    PRICE_MATCH_POLICIES.map((p) => p.banner).slice().sort(),
    [
      'best_buy', 'costco', 'food_basics', 'freshco', 'giant_tiger', 'maxi',
      'metro', 'no_frills', 'real_canadian_superstore', 'sobeys', 'walmart',
    ],
  );
});

test('every row names where it came from', () => {
  for (const p of PRICE_MATCH_POLICIES) {
    assert.equal(typeof p.source, 'string');
    assert.ok(p.source.length > 0, `${p.banner} has no source`);
  }
});

test('No Frills: four items, ad at the till, same trade area, same brand size and weight', () => {
  const p = row('no_frills');
  assert.equal(p.matchesCompetitors, true);
  assert.equal(p.itemLimit, 4);
  assert.equal(p.proof, 'competitor_ad_at_till');
  assert.equal(p.proofFormats.slice().sort().join(','), 'digital,print');
  assert.equal(p.competitorScope, 'same_trade_area');
  assert.equal(p.identicalItemRequired, true);
  assert.equal(p.beatsByOneCent, false);
  assert.equal(p.windowDays, null);
  assert.equal(p.windowKind, null);
  assert.equal(p.market, 'CA');
});

test('the No Frills 7-day claim is recorded as unconfirmed and is not a policy field', () => {
  const p = row('no_frills');
  // The at-the-till rule is what both sources agree on, so it is the encoded
  // rule. The refund window only one source describes stays out of windowDays.
  assert.equal(p.windowDays, null);
  assert.equal(p.unconfirmed.length, 1);
  const claim = p.unconfirmed[0]!;
  assert.equal(claim.field, 'windowDays');
  assert.equal(claim.value, 7);
  assert.match(claim.source, /moneyGenius/i);
  assert.match(claim.disagreesWith, /Wealth Awesome/i);
});

/*
 * An earlier version of this test was called "an unconfirmed claim never
 * reaches the answer" and asserted only that `requirements.windowDays` was
 * null. That name was wrong and the green was misleading: the answer carries
 * the whole policy row, so `answer.policy.unconfirmed[0].value` is 7 and is
 * one property access from a screen. Keeping the provenance on the row is
 * deliberate, so what is actually held here is the narrower true thing, which
 * is the thing a caller renders.
 */
test('an unconfirmed claim stays out of the two fields a screen would render', () => {
  const answer = priceMatchAdvice({
    banner: 'No Frills',
    bannerPriceCents: 599,
    offer: { seller: 'Food Basics', priceCents: 499 },
  });
  assert.equal(answer.possible, true);
  assert.equal(answer.requirements?.windowDays, null);
  assert.equal(answer.messageVars.windowDays, null);
  assert.ok(
    !JSON.stringify(answer.messageVars).includes('7'),
    'the unconfirmed 7-day window leaked into messageVars, which is what a screen prints',
  );
});

test('the unconfirmed claim IS still reachable on the policy row, so a caller must not print it raw', () => {
  const answer = priceMatchAdvice({
    banner: 'No Frills',
    bannerPriceCents: 599,
    offer: { seller: 'Food Basics', priceCents: 499 },
  });
  // Documented on purpose rather than hidden: whoever wires this renders
  // `requirements` and `messageVars`, never `policy`, which is provenance.
  assert.equal(answer.policy?.unconfirmed[0]?.value, 7);
});

test('Real Canadian Superstore: approved competitors, four units', () => {
  const p = row('real_canadian_superstore');
  assert.equal(p.matchesCompetitors, true);
  assert.equal(p.itemLimit, 4);
  assert.equal(p.competitorScope, 'approved_list');
  assert.equal(p.beatsByOneCent, false);
  assert.equal(p.market, 'CA');
  // Not sourced, so not guessed.
  assert.equal(p.proof, null);
  assert.equal(p.windowDays, null);
});

test('Maxi: Quebec, identical items', () => {
  const p = row('maxi');
  assert.equal(p.matchesCompetitors, true);
  assert.equal(p.market, 'CA-QC');
  assert.equal(p.identicalItemRequired, true);
  assert.equal(p.itemLimit, null);
  assert.equal(p.proof, null);
});

test('FreshCo: beats by one cent, fourteen days, and the window is not attributed', () => {
  const p = row('freshco');
  assert.equal(p.matchesCompetitors, true);
  assert.equal(p.beatsByOneCent, true);
  assert.equal(p.windowDays, 14);
  // The source says "within 14 days" and does not say 14 days of WHAT.
  assert.equal(p.windowKind, null);
  assert.equal(p.itemLimit, null);
});

test('Giant Tiger: beats a local competitor by one cent, no stated limit', () => {
  const p = row('giant_tiger');
  assert.equal(p.matchesCompetitors, true);
  assert.equal(p.beatsByOneCent, true);
  assert.equal(p.competitorScope, 'local');
  assert.equal(p.itemLimit, null);
  assert.equal(p.windowDays, null);
});

test('Best Buy: thirty days, and the window is attributed to the purchase', () => {
  const p = row('best_buy');
  assert.equal(p.matchesCompetitors, true);
  assert.equal(p.windowDays, 30);
  assert.equal(p.windowKind, 'after_purchase');
  assert.equal(p.beatsByOneCent, false);
});

test('Walmart Canada does not match competitors and does match its own online price', () => {
  const p = row('walmart');
  assert.equal(p.matchesCompetitors, false);
  assert.equal(p.competitorScope, 'own_online');
  assert.equal(p.matchesOwnOnline, true);
  assert.equal(p.itemLimit, null);
});

test('only Walmart matches its own online price; nobody else claims to', () => {
  for (const p of PRICE_MATCH_POLICIES) {
    assert.equal(p.matchesOwnOnline, p.banner === 'walmart', `${p.banner}.matchesOwnOnline`);
  }
});

test('Metro, Food Basics, Sobeys and Costco match nobody', () => {
  for (const banner of ['metro', 'food_basics', 'sobeys', 'costco']) {
    const p = row(banner);
    assert.equal(p.matchesCompetitors, false, banner);
    assert.equal(p.matchesOwnOnline, false, banner);
    assert.equal(p.competitorScope, 'none', banner);
    assert.equal(p.itemLimit, null, banner);
    assert.equal(p.proof, null, banner);
    assert.equal(p.beatsByOneCent, false, banner);
  }
});

test("Sobeys' satisfaction guarantee is recorded as not being a price match", () => {
  const p = row('sobeys');
  assert.equal(p.matchesCompetitors, false);
  assert.match(String(p.sourceNote), /satisfaction/i);
});

test('a banner that matches nobody carries no limit, proof or window', () => {
  for (const p of PRICE_MATCH_POLICIES) {
    if (p.matchesCompetitors) continue;
    assert.equal(p.itemLimit, null, p.banner);
    assert.equal(p.windowDays, null, p.banner);
    assert.equal(p.proof, null, p.banner);
  }
});

/* ------------------------------------------------------- normalising a banner */

test('a banner is recognised however the store list spells it', () => {
  assert.equal(normaliseBanner('No Frills'), 'no_frills');
  assert.equal(normaliseBanner('nofrills'), 'no_frills');
  assert.equal(normaliseBanner('  NO FRILLS  '), 'no_frills');
  assert.equal(normaliseBanner('Real Canadian Superstore'), 'real_canadian_superstore');
  assert.equal(normaliseBanner('Superstore'), 'real_canadian_superstore');
  assert.equal(normaliseBanner('Walmart Supercentre'), 'walmart');
  assert.equal(normaliseBanner('walmart.ca'), 'walmart');
  assert.equal(normaliseBanner('Best Buy'), 'best_buy');
  assert.equal(normaliseBanner('FreshCo'), 'freshco');
});

test('an unrecognised banner normalises to null rather than to a guess', () => {
  assert.equal(normaliseBanner('Bulk Barn'), null);
  assert.equal(normaliseBanner(''), null);
  assert.equal(normaliseBanner('   '), null);
  assert.equal(normaliseBanner(null), null);
  assert.equal(normaliseBanner(undefined), null);
});

test('policyFor takes either an id or a written name', () => {
  assert.equal(policyFor('Giant Tiger')?.banner, 'giant_tiger');
  assert.equal(policyFor('giant_tiger')?.banner, 'giant_tiger');
  assert.equal(policyFor('Bulk Barn'), null);
});

/* -------------------------------------------------------------- the answer */

test('a cheaper competitor at a matching banner is a match, with its limit and proof', () => {
  const answer = priceMatchAdvice({
    banner: 'No Frills',
    bannerPriceCents: 599,
    offer: { seller: 'Metro', priceCents: 449 },
  });
  assert.equal(answer.possible, true);
  assert.equal(answer.reason, null);
  assert.equal(answer.banner, 'no_frills');
  assert.equal(answer.offerSeller, 'metro');
  assert.equal(answer.requirements?.itemLimit, 4);
  assert.equal(answer.requirements?.proof, 'competitor_ad_at_till');
  assert.equal(answer.requirements?.competitorScope, 'same_trade_area');
  assert.equal(answer.messageKey, 'price_match.possible');
});

test('the answer carries structured facts and no English sentence', () => {
  const answer = priceMatchAdvice({
    banner: 'freshco',
    bannerPriceCents: 500,
    offer: { seller: 'no_frills', priceCents: 400 },
  });
  assert.equal(answer.possible, true);
  assert.equal(answer.requirements?.beatsByOneCent, true);
  assert.equal(answer.requirements?.windowDays, 14);
  // messageVars is what a copy layer interpolates. It holds numbers and codes.
  for (const value of Object.values(answer.messageVars)) {
    assert.notEqual(typeof value, 'undefined');
    if (typeof value === 'string') {
      assert.ok(/^[a-z0-9_.]+$/.test(value), `messageVars carried prose: ${value}`);
    }
  }
});

test('an unknown banner is "we do not know", never "they do not match"', () => {
  const answer = priceMatchAdvice({
    banner: 'Bulk Barn',
    bannerPriceCents: 599,
    offer: { seller: 'Metro', priceCents: 449 },
  });
  assert.equal(answer.possible, false);
  assert.equal(answer.reason, 'unknown_banner');
  assert.equal(answer.banner, null);
  assert.equal(answer.policy, null);
  assert.equal(answer.requirements, null);
  assert.equal(answer.messageKey, 'price_match.unknown_banner');
});

test('a missing banner is also unknown rather than a silent default', () => {
  for (const banner of [undefined, null, '', '   ']) {
    const answer = priceMatchAdvice({
      banner: banner as string | null | undefined,
      bannerPriceCents: 599,
      offer: { seller: 'Metro', priceCents: 449 },
    });
    assert.equal(answer.reason, 'unknown_banner');
  }
});

test('a banner with no competitor policy says so, and is not confused with unknown', () => {
  const answer = priceMatchAdvice({
    banner: 'Metro',
    bannerPriceCents: 599,
    offer: { seller: 'No Frills', priceCents: 449 },
  });
  assert.equal(answer.possible, false);
  assert.equal(answer.reason, 'banner_does_not_match_competitors');
  assert.equal(answer.banner, 'metro');
  assert.equal(answer.policy?.banner, 'metro');
  assert.equal(answer.requirements, null);
  assert.equal(answer.messageKey, 'price_match.no_policy');
});

test('Costco, Food Basics and Sobeys answer the same way as Metro', () => {
  for (const banner of ['Costco', 'Food Basics', 'Sobeys']) {
    const answer = priceMatchAdvice({
      banner,
      bannerPriceCents: 1000,
      offer: { seller: 'No Frills', priceCents: 900 },
    });
    assert.equal(answer.reason, 'banner_does_not_match_competitors', banner);
  }
});

test('the same banner is not a competitor', () => {
  const answer = priceMatchAdvice({
    banner: 'No Frills',
    bannerPriceCents: 599,
    offer: { seller: 'no frills', priceCents: 449 },
  });
  assert.equal(answer.possible, false);
  assert.equal(answer.reason, 'same_banner');
  assert.equal(answer.messageKey, 'price_match.same_banner');
});

test('Walmart matches its own online price and nobody else', () => {
  const own = priceMatchAdvice({
    banner: 'Walmart',
    bannerPriceCents: 1299,
    offer: { seller: 'walmart.ca', priceCents: 999 },
  });
  assert.equal(own.possible, true);
  assert.equal(own.reason, null);
  assert.equal(own.requirements?.competitorScope, 'own_online');
  assert.equal(own.messageKey, 'price_match.own_online');

  const rival = priceMatchAdvice({
    banner: 'Walmart',
    bannerPriceCents: 1299,
    offer: { seller: 'Giant Tiger', priceCents: 999 },
  });
  assert.equal(rival.possible, false);
  assert.equal(rival.reason, 'banner_matches_own_online_only');
  assert.equal(rival.messageKey, 'price_match.own_online_only');
});

test('an offer that is not cheaper has nothing to match', () => {
  const higher = priceMatchAdvice({
    banner: 'No Frills',
    bannerPriceCents: 449,
    offer: { seller: 'Metro', priceCents: 599 },
  });
  assert.equal(higher.possible, false);
  assert.equal(higher.reason, 'offer_not_cheaper');

  const equal = priceMatchAdvice({
    banner: 'No Frills',
    bannerPriceCents: 449,
    offer: { seller: 'Metro', priceCents: 449 },
  });
  assert.equal(equal.possible, false);
  assert.equal(equal.reason, 'offer_not_cheaper');
  assert.equal(equal.messageKey, 'price_match.not_cheaper');
});

test('one cent cheaper is still cheaper', () => {
  const answer = priceMatchAdvice({
    banner: 'No Frills',
    bannerPriceCents: 450,
    offer: { seller: 'Metro', priceCents: 449 },
  });
  assert.equal(answer.possible, true);
});

test('a price that is missing, fractional or not a number is unusable, not zero', () => {
  const bad: unknown[] = [undefined, null, NaN, Infinity, -1, 4.5, '449', {}];
  for (const value of bad) {
    const onOffer = priceMatchAdvice({
      banner: 'No Frills',
      bannerPriceCents: 599,
      offer: { seller: 'Metro', priceCents: value as number },
    });
    assert.equal(onOffer.possible, false, `offer price ${String(value)}`);
    assert.equal(onOffer.reason, 'price_unusable', `offer price ${String(value)}`);

    const onShelf = priceMatchAdvice({
      banner: 'No Frills',
      bannerPriceCents: value as number,
      offer: { seller: 'Metro', priceCents: 449 },
    });
    assert.equal(onShelf.possible, false, `banner price ${String(value)}`);
    assert.equal(onShelf.reason, 'price_unusable', `banner price ${String(value)}`);
  }
});

test('an unusable price is reported before a banner nobody knows, because it breaks both', () => {
  const answer = priceMatchAdvice({
    banner: 'Bulk Barn',
    bannerPriceCents: 599,
    offer: { seller: 'Metro', priceCents: Number.NaN },
  });
  assert.equal(answer.reason, 'price_unusable');
});

test('a missing seller is unknown rather than treated as the same banner', () => {
  const answer = priceMatchAdvice({
    banner: 'No Frills',
    bannerPriceCents: 599,
    offer: { seller: '', priceCents: 449 },
  });
  assert.equal(answer.possible, false);
  assert.equal(answer.reason, 'unknown_seller');
  assert.equal(answer.offerSeller, null);
});

test('a seller nobody has a row for is still a competitor at a matching banner', () => {
  // The policy question is about the banner the shopper stands in. A corner
  // shop with no row of its own is a competitor like any other.
  const answer = priceMatchAdvice({
    banner: 'No Frills',
    bannerPriceCents: 599,
    offer: { seller: 'Al Premium Food Mart', priceCents: 449 },
  });
  assert.equal(answer.possible, true);
  assert.equal(answer.offerSeller, 'al premium food mart');
});

test('nothing in an answer is a price the module produced', () => {
  const answer = priceMatchAdvice({
    banner: 'No Frills',
    bannerPriceCents: 599,
    offer: { seller: 'Metro', priceCents: 449 },
  });
  const flat = JSON.stringify(answer);
  // The two numbers handed in may be echoed; no third amount may appear.
  assert.equal(/\b150\b/.test(flat), false, 'a difference was computed');
  assert.equal(/saving/i.test(flat), false, 'a savings claim appeared');
});

test('the answer is the same object shape whether or not a match is possible', () => {
  const yes = priceMatchAdvice({
    banner: 'No Frills', bannerPriceCents: 599, offer: { seller: 'Metro', priceCents: 449 },
  });
  const no = priceMatchAdvice({
    banner: 'Metro', bannerPriceCents: 599, offer: { seller: 'No Frills', priceCents: 449 },
  });
  assert.deepEqual(Object.keys(yes).sort(), Object.keys(no).sort());
});

test('the table is frozen, so a caller cannot edit policy at runtime', () => {
  assert.equal(Object.isFrozen(PRICE_MATCH_POLICIES), true);
  for (const p of PRICE_MATCH_POLICIES) assert.equal(Object.isFrozen(p), true);
});
