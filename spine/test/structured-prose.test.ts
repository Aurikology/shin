/**
 * THE ROUND TRIP. Every sentence the spine can produce, rebuilt from its code
 * and its facts, asserted byte-for-byte against the English the engine shipped.
 *
 * Beta-plan item 31 is a French interface, and the blocker was that this
 * package shipped finished English SENTENCES rather than facts. `contract.ts`
 * now carries a code plus raw facts beside every one of them. This file is the
 * safety net that makes that claim true rather than aspirational, and it is the
 * reason the change is safe days before a beta:
 *
 *   1. `renderEnglish` below is a RENDERER. It takes a code and facts and
 *      writes English, exactly the way a French renderer will take the same
 *      code and the same facts and write French.
 *   2. Every scenario drives the real engine, then re-renders `structuredLines`,
 *      `structuredBecause` and `structuredDetail` and asserts the result equals
 *      the `lines`, `because` and `detail` the engine itself produced.
 *   3. The last test asserts every member of `LineCode` was actually exercised.
 *      A code nobody produced is a code nobody has proved, and a renderer
 *      written against it would be guessing.
 *
 * IF A SENTENCE DOES NOT ROUND-TRIP, ITS FACTS ARE INCOMPLETE. The fix is the
 * facts, never a looser assertion: a `startsWith` here would pass while a
 * French screen dropped a seller's name, and nothing would be red.
 *
 * The renderer also polices the FACTS THEMSELVES, not just the output. A fact
 * that arrives as "$3.99" round-trips perfectly into English and is useless to
 * every other locale, so `str()` rejects pre-formatted money outright.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceIt, thinBasisShortfall, thinStructuredLine } from '../src/spine.ts';
import type {
  Fact,
  LineCode,
  PricePoint,
  SpineResult,
  StructuredText,
  TextFragment,
  Verdict,
} from '../src/contract.ts';
import { cad } from '../src/money.ts';
import {
  confidenceOf as thinConfidenceOf,
  judge as thinJudge,
  money,
  type Band as ThinBand,
} from '../../price/src/verdict.ts';
import { REFUSALS, scan, type ScanEvent, type ScanPorts } from '../src/run.ts';
import { AS_OF, StubSource, identity, point } from './helpers.ts';

// ───────────────────────────────────────────────────────────────────────────
// Fact accessors. Every one of them is also an assertion about rawness.
// ───────────────────────────────────────────────────────────────────────────

function num(f: TextFragment, key: string): number {
  const v = f.facts[key];
  assert.equal(typeof v, 'number', `${f.code}.${key} must be a raw number, got ${JSON.stringify(v)}`);
  return v as number;
}

function str(f: TextFragment, key: string): string {
  const v = f.facts[key];
  assert.equal(typeof v, 'string', `${f.code}.${key} must be a string, got ${JSON.stringify(v)}`);
  assert.ok(
    !/^-?\$\d/.test(v as string),
    `${f.code}.${key} is pre-formatted money ("${v as string}"). Pass the integer cents and the currency instead, or no other locale can format it.`,
  );
  return v as string;
}

function maybeStr(f: TextFragment, key: string): string | null {
  return f.facts[key] === null ? null : str(f, key);
}

function list(f: TextFragment, key: string): readonly Fact[] {
  const v = f.facts[key];
  assert.ok(Array.isArray(v), `${f.code}.${key} must be an array, got ${JSON.stringify(v)}`);
  return v as readonly Fact[];
}

/** Cents are integers or they are not cents. Catches a stray `/100` in a fact. */
function cents(f: TextFragment, key: string): number {
  const v = amount(f, key);
  assert.ok(Number.isInteger(v), `${f.code}.${key} must be integer cents, got ${v}`);
  return v;
}

/**
 * An amount in cents that need not be whole. A price per 100 g is arithmetic
 * over a pack size and lands on a fraction of a cent routinely; it is still
 * raw, and a currency must still travel with it.
 */
function amount(f: TextFragment, key: string): number {
  const v = num(f, key);
  assert.equal(f.facts.currency, 'CAD', `${f.code} carries an amount with no currency beside it`);
  return v;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The English rendering of an ISO date. A French renderer writes its own. */
function dayInWords(observedAt: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(observedAt);
  if (m === null) return observedAt;
  const month = MONTHS[Number(m[2]) - 1];
  return month === undefined ? observedAt : `${Number(m[3])} ${month}`;
}

function reading(r: Fact): string {
  const o = r as { amountCents: number; seller: string; observedAt: string };
  assert.ok(Number.isInteger(o.amountCents), 'a reading must carry integer cents');
  return `${cad(o.amountCents)} at ${o.seller} on ${dayInWords(o.observedAt)}`;
}

/** "the only price we have" / "what every seller charges", chosen by a count. */
function solePricePhrase(f: TextFragment): string {
  return num(f, 'sellerCount') === 1 ? 'the only price we have' : 'what every seller charges';
}

/** Every code seen by any scenario in this file, for the coverage test. */
const seen = new Set<LineCode>();

// ───────────────────────────────────────────────────────────────────────────
// THE ENGLISH RENDERER. One arm per code, and the compiler enforces the set:
// `never` in the default arm means a new `LineCode` fails to compile here until
// somebody writes its words. That is the whole mechanism working as designed.
// ───────────────────────────────────────────────────────────────────────────

function renderEnglish(f: TextFragment): string {
  seen.add(f.code);
  switch (f.code) {
    // ── category verdict lines ──────────────────────────────────────────
    case 'regular_price_at_sole_store':
      return `Regular price is ${cad(cents(f, 'regularCents'))} at the one store carrying it. You are looking at ${cad(cents(f, 'askingCents'))}.`;
    case 'regular_price_across_stores':
      return `Regular price is about ${cad(cents(f, 'regularCents'))} across ${num(f, 'storeCount')} stores. You are looking at ${cad(cents(f, 'askingCents'))}.`;
    case 'all_prices_are_capped_promotions':
      return `Every price I have for this is a limited promotion, so there is nothing here I can fairly call a going rate. You are looking at ${cad(cents(f, 'askingCents'))}.`;
    case 'no_regular_price_only_promotions':
      return `No regular shelf price found, everything below is a promotion. You are looking at ${cad(cents(f, 'askingCents'))}.`;
    case 'best_promotion_this_week': {
      const limit = maybeStr(f, 'limit');
      return `This week it is ${cad(cents(f, 'promotionalCents'))} at ${str(f, 'seller')}${limit === null ? '' : ` (${limit})`}.`;
    }
    case 'no_promotion_this_week':
      return 'Nothing on promotion anywhere we can see this week.';
    case 'cheapest_of_retailers_carrying_it':
      return `${num(f, 'retailerCount')} retailers have it. Cheapest is ${cad(cents(f, 'cheapestCents'))} at ${str(f, 'cheapestSeller')}. You are looking at ${cad(cents(f, 'askingCents'))}.`;
    case 'comparable_listings_range': {
      const basis = str(f, 'basis');
      assert.ok(basis === 'sold' || basis === 'asking', `unknown basis fact "${basis}"`);
      const words =
        basis === 'sold'
          ? 'what these actually sold for'
          : 'asking prices, not sales, and sellers start high';
      return `Comparable listings run ${cad(cents(f, 'lowCents'))} to ${cad(cents(f, 'highCents'))}, clustering around ${cad(cents(f, 'clusterLowCents'))} to ${cad(cents(f, 'clusterHighCents'))}. You are looking at ${cad(cents(f, 'askingCents'))}. These are ${words}.`;
    }
    case 'own_price_history_single_seller':
      return `Only one seller, so this is against its own history: as low as ${cad(cents(f, 'lowestCents'))} on ${str(f, 'lowestObservedOn')}, usually about ${cad(cents(f, 'typicalCents'))}. You are looking at ${cad(cents(f, 'askingCents'))}.`;

    // ── thin-evidence line, four fragments joined with a space ──────────
    case 'asking_below_sole_price':
      return `${money(cents(f, 'askingCents'))} is less than ${solePricePhrase(f)}.`;
    case 'asking_below_range':
      return `${money(cents(f, 'askingCents'))} is at the low end.`;
    case 'asking_equals_sole_price':
      return `${money(cents(f, 'askingCents'))} matches ${solePricePhrase(f)}.`;
    case 'asking_within_range':
      return `${money(cents(f, 'askingCents'))} is about what others charge.`;
    case 'asking_above_sole_price':
      return `${money(cents(f, 'askingCents'))} is more than ${solePricePhrase(f)}.`;
    case 'asking_above_range':
      return `${money(cents(f, 'askingCents'))} is at the high end.`;
    case 'sole_price_matched_at_seller':
      return `${str(f, 'seller')} has it at ${money(cents(f, 'amountCents'))} too.`;
    case 'cheapest_and_dearest_sellers':
      return `${str(f, 'cheapestSeller')} has it at ${money(cents(f, 'cheapestCents'))}, ${str(f, 'dearestSeller')} at ${money(cents(f, 'dearestCents'))}.`;
    case 'unit_price':
      return `That is ${money(amount(f, 'unitCents'))} per ${str(f, 'unitLabel')}.`;
    case 'cheaper_on_promotion_at_seller':
      return `${str(f, 'seller')} has it on sale at ${money(cents(f, 'amountCents'))}.`;

    // ── confidence sentences ────────────────────────────────────────────
    case 'confidence_minimum_met_only': {
      const points = num(f, 'pointCount');
      const sellers = num(f, 'sellerCount');
      return `Only just enough to answer: ${points} price${points === 1 ? '' : 's'} from ${sellers} seller${sellers === 1 ? '' : 's'}.`;
    }
    case 'confidence_newest_price_age':
      return `Newest price is ${num(f, 'ageDays')} days old.`;
    case 'confidence_history_span_exact_match':
      return `${num(f, 'pointCount')} prices spanning ${num(f, 'spanDays')} days of this seller's own history, and the product is a certain match.`;
    case 'confidence_fresh_across_sellers_exact_match': {
      const oldest = num(f, 'oldestAgeDays');
      return `${num(f, 'pointCount')} prices across ${num(f, 'sellerCount')} sellers, none older than ${oldest} day${oldest === 1 ? '' : 's'}, and the product is a certain match.`;
    }
    case 'confidence_price_count_across_sellers':
      return `${num(f, 'pointCount')} prices across ${num(f, 'sellerCount')} sellers.`;

    // ── shortfall fragments (lower case; the list shape capitalises) ────
    case 'shortfall_lone_claims_held_back': {
      const c = num(f, 'count');
      return `${c} typed price${c === 1 ? ' is' : 's are'} being held back for now, too far from everything else to publish on one person's word`;
    }
    case 'shortfall_uncorroborated_typed_prices': {
      const c = num(f, 'count');
      return `${c} typed price${c === 1 ? ' is' : 's are'} not counted toward this, because nobody else has seen ${c === 1 ? 'that tag' : 'those tags'} yet`;
    }
    case 'shortfall_newest_price_older_than_category':
      return `the newest price we have is ${num(f, 'ageDays')} days old, and ${str(f, 'categoryLabel').toLowerCase()} moves faster than that`;
    case 'shortfall_some_prices_too_old_to_count':
      return `${num(f, 'droppedCount')} of ${num(f, 'totalCount')} prices are too old to count`;
    case 'shortfall_fewer_points_than_category_needs': {
      const c = num(f, 'pointCount');
      return `${c} price${c === 1 ? '' : 's'} where ${str(f, 'categoryLabel').toLowerCase()} usually needs ${num(f, 'needed')}`;
    }
    case 'shortfall_fewer_sellers_than_category_needs': {
      const c = num(f, 'sellerCount');
      return `${c} seller${c === 1 ? '' : 's'} where ${str(f, 'categoryLabel').toLowerCase()} usually needs ${num(f, 'needed')}`;
    }
    case 'shortfall_prices_may_be_two_products':
      return 'the prices found disagree widely enough that this may be more than one product';
    case 'shortfall_no_comparable_price_kinds':
      return `the only prices anyone publishes for this are ${list(f, 'kinds').join(' and ')}, which is not a comparison`;
    case 'shortfall_newest_price_past_tolerance':
      return `the newest price we have is ${num(f, 'ageDays')} days old, past what ${str(f, 'categoryLabel').toLowerCase()} tolerates`;
    case 'shortfall_only_the_asking_seller_has_prices':
      return 'every price we have is this same store, so this is against its own history rather than against anybody else';

    // ── confidence basis fragments out of price/src/verdict.ts ──────────
    case 'basis_single_seller':
      return 'one seller';
    case 'basis_sellers_agree_on_range':
      return `${num(f, 'sellerCount')} sellers agree on the range`;
    case 'basis_newest_price_over_three_weeks':
      return 'the newest price is over three weeks old';
    case 'basis_only_sale_prices':
      return 'only sale prices to compare against';
    case 'basis_matched_by_name_not_barcode':
      return 'one seller matched by name, not barcode';
    case 'basis_reason_not_yet_coded':
      // Reachable only if `price/src/verdict.ts` grows a reason nobody mapped.
      // `the mapping of price/'s confidence reasons is total` fails first.
      return str(f, 'text');

    // ── refusals ────────────────────────────────────────────────────────
    case 'refusal_no_price_source_available':
      return 'No price source is available right now.';
    case 'refusal_identity_unresolved':
      return 'Could not work out what this is. Scan the barcode, or type the model number.';
    case 'refusal_category_not_served':
      return `${str(f, 'categoryLabel')} is not something Pexi can price yet. ${str(f, 'why')}`;
    case 'refusal_identity_below_floor':
      return `Not sure enough this is the right one. The closest match was "${str(f, 'label')}". Pick the right one and Pexi will price it.`;
    case 'refusal_no_price_for_product':
      return `Nothing has a price for "${str(f, 'label')}" right now.`;
    case 'refusal_asking_price_missing':
      return 'Found comparisons but no price for the thing in front of you. Point at the tag.';
    case 'refusal_asking_price_unreadable':
      return 'That price did not read as a number. Type it again with a dot for the decimal.';
    case 'refusal_all_prices_future_dated':
      return 'Every price found is dated later than today, so there is nothing to compare against yet.';
    case 'refusal_one_shopper_report': {
      const readings = list(f, 'readings');
      assert.equal(readings.length, 1, 'one shopper means one reading');
      return `One shopper saw ${reading(readings[0])}. Nobody else has priced this yet, so there is nothing to check it against.`;
    }
    case 'refusal_several_unconfirmed_reports':
      return `Shoppers typed in ${list(f, 'readings').map(reading).join(', and ')}. Nobody has seen either of those tags twice, so there is nothing to check them against.`;

    // ── disagreements ───────────────────────────────────────────────────
    case 'disagreement_wide_spread':
      return `Prices for the same thing run ${cad(cents(f, 'lowCents'))} to ${cad(f.facts.highCents as number)} right now. That is a ${num(f, 'ratio')}x spread, so there is no single right price to quote.`;
    case 'disagreement_promotion_not_store':
      return `The gap here is the promotion, not the store: ${cad(cents(f, 'promotionalCents'))} on sale against ${cad(f.facts.regularCents as number)} regular is a ${num(f, 'ratio')}x difference on the same box.`;

    default: {
      const missed: never = f.code;
      throw new Error(`no English for code ${missed as string}`);
    }
  }
}

/** The three shapes, which is the only thing a locale has to re-decide. */
function render(t: StructuredText): string {
  const parts = t.fragments.map(renderEnglish);
  switch (t.shape) {
    case 'single':
      assert.equal(parts.length, 1, 'a `single` text must hold exactly one fragment');
      return parts[0];
    case 'sentences':
      return parts.join(' ');
    case 'shortfall_list': {
      const listed = parts.join('; ');
      return `${listed.charAt(0).toUpperCase()}${listed.slice(1)}.`;
    }
    default: {
      const missed: never = t.shape;
      throw new Error(`no rendering for shape ${missed as string}`);
    }
  }
}

/**
 * Assert every English string on one result is reproducible from its facts.
 *
 * Called on EVERY result every scenario produces, so a scenario written to
 * exercise one sentence checks the other four it happens to produce for free.
 */
function assertRoundTrip(r: SpineResult, what: string): SpineResult {
  if (r.kind === 'refusal') {
    assert.equal(render(r.structuredDetail), r.detail, `${what}: refusal detail`);
    return r;
  }
  assert.equal(
    r.structuredLines.length,
    r.lines.length,
    `${what}: one structured line per line, in the same order`,
  );
  r.lines.forEach((line, i) => {
    assert.equal(render(r.structuredLines[i]), line, `${what}: line ${i}`);
  });
  assert.equal(
    render(r.confidence.structuredBecause),
    r.confidence.because,
    `${what}: confidence.because`,
  );
  if (r.disagreement !== null) {
    assert.equal(
      render(r.disagreement.structuredDetail),
      r.disagreement.detail,
      `${what}: disagreement detail`,
    );
  }
  return r;
}

// ───────────────────────────────────────────────────────────────────────────
// Scenarios. Every one drives the real engine.
// ───────────────────────────────────────────────────────────────────────────

type Q = {
  points: PricePoint[];
  category?: 'grocery' | 'tech' | 'used' | 'furniture' | 'produce';
  askingCents?: number;
  askingSeller?: string;
  confidence?: number;
  label?: string;
  asOf?: string;
};

async function run(q: Q): Promise<SpineResult> {
  const id = identity(q.category ?? 'grocery', q.confidence ?? 0.99, q.label ?? 'Test product');
  const src = new StubSource(id, q.points);
  return priceIt(
    {
      text: 'x',
      askingCents: 'askingCents' in q ? q.askingCents : 399,
      askingSeller: q.askingSeller,
      asOf: q.asOf ?? AS_OF,
    },
    { sources: [src] },
  );
}

/** Days before AS_OF (2026-09-03), as the ISO day the fixtures take. */
function daysAgo(n: number): string {
  const d = new Date('2026-09-03T18:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** A crawled price: no `witnesses`, so the source vouches for it itself. */
const crawled = point;
/** A price somebody typed on a phone and nobody else has seen. */
function typed(seller: string, amountCents: number, observedAt = daysAgo(0)): PricePoint {
  return point(seller, amountCents, 'regular', observedAt, { witnesses: 1 });
}

test('grocery: a single regular store, and a promotion with a cap', async () => {
  const r = assertRoundTrip(
    await run({
      points: [
        crawled('No Frills', 399, 'regular', daysAgo(0)),
        crawled('Metro', 349, 'promotional', daysAgo(0), { limit: 'limit 8' }),
      ],
      askingCents: 429,
    }),
    'grocery single store',
  ) as Verdict;
  assert.match(r.lines[0], /^Regular price is \$3\.99 at the one store/);
  assert.match(r.lines[1], /\(limit 8\)\.$/);
});

test('grocery: a regular price across stores, and nothing on promotion', async () => {
  const r = assertRoundTrip(
    await run({
      points: [
        crawled('No Frills', 399, 'regular', daysAgo(0)),
        crawled('Metro', 419, 'regular', daysAgo(0)),
        crawled('Sobeys', 409, 'regular', daysAgo(0)),
      ],
      askingCents: 429,
    }),
    'grocery across stores',
  ) as Verdict;
  assert.match(r.lines[0], /across 3 stores/);
  assert.equal(r.lines[1], 'Nothing on promotion anywhere we can see this week.');
});

test('grocery: an uncapped promotion with no regular price anywhere', async () => {
  const r = assertRoundTrip(
    await run({
      points: [
        crawled('No Frills', 299, 'promotional', daysAgo(0)),
        crawled('Metro', 319, 'promotional', daysAgo(0)),
      ],
      askingCents: 349,
    }),
    'grocery promo only',
  ) as Verdict;
  assert.match(r.lines[0], /^No regular shelf price found/);
});

test('grocery: every price we hold is a capped promotion', async () => {
  const r = assertRoundTrip(
    await run({
      points: [
        crawled('No Frills', 55, 'promotional', daysAgo(0), { limit: 'limit 8' }),
        crawled('Metro', 60, 'promotional', daysAgo(0), { limit: 'limit 4' }),
      ],
      askingCents: 147,
    }),
    'grocery capped only',
  ) as Verdict;
  assert.match(r.lines[0], /^Every price I have for this is a limited promotion/);
});

test('tech: the cheapest of the retailers carrying it', async () => {
  const r = assertRoundTrip(
    await run({
      category: 'tech',
      points: [
        crawled('Best Buy', 39999, 'regular', daysAgo(0)),
        crawled('Amazon', 37999, 'regular', daysAgo(0)),
        crawled('Walmart', 41999, 'regular', daysAgo(0)),
      ],
      askingCents: 42999,
    }),
    'tech',
  ) as Verdict;
  assert.match(r.lines[0], /^3 retailers have it\./);
});

test('used: asking prices, and sold prices, are two different claims', async () => {
  const asking = assertRoundTrip(
    await run({
      category: 'used',
      points: [
        crawled('Kijiji', 3500, 'asking', daysAgo(1)),
        crawled('Marketplace', 6000, 'asking', daysAgo(1)),
        crawled('Kijiji', 12000, 'asking', daysAgo(1)),
        crawled('Marketplace', 15900, 'asking', daysAgo(1)),
      ],
      askingCents: 8000,
    }),
    'used asking',
  ) as Verdict;
  assert.match(asking.lines[0], /asking prices, not sales, and sellers start high\.$/);

  const sold = assertRoundTrip(
    await run({
      category: 'used',
      points: [
        crawled('eBay', 4000, 'sold', daysAgo(1)),
        crawled('eBay', 5000, 'sold', daysAgo(1)),
        crawled('Marketplace', 6000, 'sold', daysAgo(1)),
        crawled('Marketplace', 7000, 'sold', daysAgo(1)),
      ],
      askingCents: 5500,
    }),
    'used sold',
  ) as Verdict;
  assert.match(sold.lines[0], /what these actually sold for\.$/);
});

test('furniture: its own history, and a high band off a long span', async () => {
  const points = [0, 30, 60, 90, 120, 150, 180, 210, 240, 300].map((d) =>
    crawled('IKEA', 9900 + d, 'regular', daysAgo(d)),
  );
  const r = assertRoundTrip(
    await run({ category: 'furniture', points, askingCents: 11900 }),
    'furniture',
  ) as Verdict;
  assert.match(r.lines[0], /^Only one seller, so this is against its own history/);
  assert.match(r.confidence.because, /of this seller's own history/);
});

test('confidence: only just enough, one seller and several', async () => {
  const one = assertRoundTrip(
    await run({
      category: 'furniture',
      points: [0, 1, 2, 3, 4].map((d) => crawled('IKEA', 9900, 'regular', daysAgo(d))),
      askingCents: 9900,
    }),
    'furniture minimum',
  ) as Verdict;
  assert.match(one.confidence.because, /from 1 seller\.$/);

  const two = assertRoundTrip(
    await run({
      points: [
        crawled('No Frills', 399, 'regular', daysAgo(0)),
        crawled('Metro', 409, 'regular', daysAgo(0)),
      ],
      askingCents: 405,
    }),
    'grocery minimum',
  ) as Verdict;
  assert.match(two.confidence.because, /^Only just enough to answer: 2 prices from 2 sellers\.$/);
});

test('confidence: the newest price is the thing holding the band down', async () => {
  const r = assertRoundTrip(
    await run({
      points: [
        crawled('No Frills', 399, 'regular', daysAgo(5)),
        crawled('Metro', 409, 'regular', daysAgo(5)),
        crawled('Sobeys', 405, 'regular', daysAgo(6)),
      ],
      askingCents: 405,
    }),
    'grocery newest age',
  ) as Verdict;
  assert.equal(r.confidence.because, 'Newest price is 5 days old.');
});

test('confidence: fresh across sellers, at one day and at several', async () => {
  const oneDay = assertRoundTrip(
    await run({
      category: 'tech',
      points: ['Best Buy', 'Amazon', 'Walmart', 'Staples', 'Costco', 'The Source'].map((s, i) =>
        crawled(s, 39999 + i * 100, 'regular', daysAgo(1)),
      ),
      askingCents: 40999,
    }),
    'tech fresh one day',
  ) as Verdict;
  assert.match(oneDay.confidence.because, /none older than 1 day,/);

  const twoDays = assertRoundTrip(
    await run({
      category: 'tech',
      points: ['Best Buy', 'Amazon', 'Walmart', 'Staples', 'Costco', 'The Source'].map((s, i) =>
        crawled(s, 39999 + i * 100, 'regular', daysAgo(i < 3 ? 1 : 2)),
      ),
      askingCents: 40999,
    }),
    'tech fresh two days',
  ) as Verdict;
  assert.match(twoDays.confidence.because, /none older than 2 days,/);
});

test('confidence: the unremarkable middle, a count across a count', async () => {
  const r = assertRoundTrip(
    await run({
      category: 'tech',
      // Identity is over the floor and under the certainty bar, so neither the
      // `high` clause nor any shortfall fires and the plain sentence is used.
      confidence: 0.9,
      points: ['Best Buy', 'Amazon', 'Walmart', 'Staples', 'Costco', 'The Source'].map((s, i) =>
        crawled(s, 39999 + i * 100, 'regular', daysAgo(1)),
      ),
      askingCents: 40999,
    }),
    'tech medium',
  ) as Verdict;
  assert.equal(r.confidence.because, '6 prices across 6 sellers.');
});

test('shortfalls: fewer points and fewer sellers than the category needs', async () => {
  const singular = assertRoundTrip(
    await run({
      category: 'tech',
      points: [crawled('Best Buy', 39999, 'regular', daysAgo(0))],
      askingCents: 40999,
    }),
    'tech one point',
  ) as Verdict;
  assert.match(singular.confidence.because, /^1 price where new tech usually needs 3/);
  assert.match(singular.confidence.because, /1 seller where new tech usually needs 3\.$/);

  const plural = assertRoundTrip(
    await run({
      category: 'tech',
      points: [
        crawled('Best Buy', 39999, 'regular', daysAgo(0)),
        crawled('Amazon', 37999, 'regular', daysAgo(0)),
      ],
      askingCents: 40999,
    }),
    'tech two points',
  ) as Verdict;
  assert.match(plural.confidence.because, /^2 prices where new tech usually needs 3/);
  assert.match(plural.confidence.because, /2 sellers where new tech usually needs 3\.$/);
});

test('shortfalls: everything is past the window, and some of it is', async () => {
  const allOld = assertRoundTrip(
    await run({
      category: 'tech',
      points: ['Best Buy', 'Amazon', 'Walmart'].map((s, i) =>
        crawled(s, 39999 + i * 100, 'regular', daysAgo(10)),
      ),
      askingCents: 40999,
    }),
    'tech all stale',
  ) as Verdict;
  assert.match(allOld.confidence.because, /^The newest price we have is 10 days old, and new tech moves faster/);

  const someOld = assertRoundTrip(
    await run({
      category: 'tech',
      points: [
        crawled('Best Buy', 39999, 'regular', daysAgo(0)),
        crawled('Amazon', 37999, 'regular', daysAgo(0)),
        crawled('Walmart', 41999, 'regular', daysAgo(0)),
        crawled('Staples', 40999, 'regular', daysAgo(10)),
      ],
      askingCents: 40999,
    }),
    'tech some stale',
  ) as Verdict;
  assert.match(someOld.confidence.because, /1 of 4 prices are too old to count/);
});

test('shortfalls: a set whose shape says it spans two products', async () => {
  const r = assertRoundTrip(
    await run({
      category: 'tech',
      points: [
        crawled('Best Buy', 39999, 'regular', daysAgo(0)),
        crawled('Amazon', 41999, 'regular', daysAgo(0)),
        crawled('Walmart', 40999, 'regular', daysAgo(0)),
        crawled('Staples', 249999, 'regular', daysAgo(0)),
      ],
      askingCents: 40999,
    }),
    'tech incoherent',
  ) as Verdict;
  assert.match(r.confidence.because, /may be more than one product/);
  assert.ok(r.disagreement !== null, 'a 6x spread must also raise a disagreement');
});

test('shortfalls: lone claims held back, one of them and two', async () => {
  const one = assertRoundTrip(
    await run({
      points: [
        crawled('Walmart', 347, 'regular', daysAgo(0)),
        crawled('Metro', 349, 'regular', daysAgo(0)),
        typed('No Frills', 99),
      ],
      askingCents: 349,
    }),
    'one held',
  ) as Verdict;
  assert.match(one.confidence.because, /^1 typed price is being held back/);

  const two = assertRoundTrip(
    await run({
      points: [
        crawled('Walmart', 347, 'regular', daysAgo(0)),
        crawled('Metro', 349, 'regular', daysAgo(0)),
        typed('No Frills', 99),
        typed('Sobeys', 95),
      ],
      askingCents: 349,
    }),
    'two held',
  ) as Verdict;
  assert.match(two.confidence.because, /^2 typed prices are being held back/);
});

test('shortfalls: a typed price nobody else has seen is named, not dropped', async () => {
  const r = assertRoundTrip(
    await run({
      points: [
        crawled('Walmart', 347, 'regular', daysAgo(0)),
        crawled('Metro', 349, 'regular', daysAgo(0)),
        typed('No Frills', 299),
      ],
      askingCents: 349,
    }),
    'uncounted',
  ) as Verdict;
  assert.match(r.confidence.because, /1 typed price is not counted toward this/);
});

test('the filter cascade: no comparable kinds at all', async () => {
  const r = assertRoundTrip(
    await run({
      category: 'tech',
      points: [
        crawled('Sony', 42999, 'list', daysAgo(0)),
        crawled('Sony', 42999, 'list', daysAgo(1)),
      ],
      askingCents: 40999,
    }),
    'list only',
  ) as Verdict;
  assert.match(r.confidence.because, /^The only prices anyone publishes for this are list, which is not a comparison/);
});

test('the filter cascade: everything is past the history window', async () => {
  const r = assertRoundTrip(
    await run({
      points: [
        crawled('No Frills', 399, 'regular', daysAgo(40)),
        crawled('Metro', 409, 'regular', daysAgo(45)),
      ],
      askingCents: 429,
    }),
    'past window',
  ) as Verdict;
  assert.match(
    r.confidence.because,
    /^The newest price we have is 40 days old, past what groceries and household tolerates/,
  );
});

test('the filter cascade: every price belongs to the shop being stood in', async () => {
  const r = assertRoundTrip(
    await run({
      points: [
        crawled('Walmart', 347, 'regular', daysAgo(0)),
        crawled('Walmart', 349, 'regular', daysAgo(1)),
        crawled('Walmart', 399, 'regular', daysAgo(2)),
      ],
      askingCents: 449,
      askingSeller: 'Walmart',
    }),
    'self only',
  ) as Verdict;
  assert.match(r.confidence.because, /^Every price we have is this same store/);
  assert.match(r.confidence.because, /sellers agree on the range|one seller/);
});

test('the thin path: one seller, several sellers, and a stale set', async () => {
  const oneSeller = assertRoundTrip(
    await run({
      points: [crawled('Walmart', 347, 'regular', daysAgo(0))],
      askingCents: 449,
      askingSeller: 'Walmart',
    }),
    'thin one seller',
  );
  assert.equal(oneSeller.kind, 'verdict');
  assert.match((oneSeller as Verdict).confidence.because, /one seller;/);

  const stale = assertRoundTrip(
    await run({
      category: 'furniture',
      points: [
        crawled('IKEA', 9900, 'regular', daysAgo(40)),
        crawled('IKEA', 11900, 'regular', daysAgo(45)),
      ],
      askingCents: 12900,
      askingSeller: 'IKEA',
    }),
    'thin stale',
  ) as Verdict;
  assert.match(stale.confidence.because, /the newest price is over three weeks old/);
});

test('the thin path: only sale prices to compare against', async () => {
  const r = assertRoundTrip(
    await run({
      points: [
        crawled('Walmart', 299, 'promotional', daysAgo(0)),
        crawled('Walmart', 319, 'promotional', daysAgo(1)),
      ],
      askingCents: 399,
      askingSeller: 'Walmart',
    }),
    'thin promo only',
  ) as Verdict;
  assert.match(r.confidence.because, /only sale prices to compare against/);
});

test('the thin path: a held claim and an incoherent set still name themselves', async () => {
  /*
   * Getting a HELD claim onto the thin path takes threading a needle, and the
   * needle is worth describing because it is the only shape that reaches it.
   *
   * To survive `countsTowardTier` an unwitnessed typed price needs a crawled
   * price agreeing within 12%. To be HELD it must sit outside half to two and a
   * half times the MEDIAN of the vouched prices. Both are true at once only
   * when the crawled prices themselves are far apart: $1.00 and $10.00 put the
   * median at $1.00, so a typed $9.50 agrees with the $10.00 row and is still
   * nine times the median.
   */
  const r = assertRoundTrip(
    await run({
      points: [
        crawled('Walmart', 100, 'regular', daysAgo(0)),
        crawled('Walmart', 1000, 'regular', daysAgo(1)),
        typed('Walmart', 950),
      ],
      askingCents: 449,
      askingSeller: 'Walmart',
    }),
    'thin held',
  ) as Verdict;
  assert.match(r.confidence.because, /being held back for now/);
});

test('the thin path: a set that may be two products says so there too', async () => {
  // A separate fixture from the held claim above, because the two conditions
  // exclude each other: holding a price leaves two points behind, and two
  // points are never enough for the contamination test to fire.
  const r = assertRoundTrip(
    await run({
      points: [
        crawled('Walmart', 100, 'regular', daysAgo(0)),
        crawled('Walmart', 1000, 'regular', daysAgo(1)),
        crawled('Walmart', 1050, 'regular', daysAgo(1)),
      ],
      askingCents: 449,
      askingSeller: 'Walmart',
    }),
    'thin incoherent',
  ) as Verdict;
  assert.match(r.confidence.because, /may be more than one product/);
});

test('refusals: every one of them rebuilds from its facts', async () => {
  assertRoundTrip(
    await priceIt({ text: 'x', askingCents: 399, asOf: AS_OF }, {
      sources: [new StubSource(identity('grocery'), [], { ok: false, reason: 'down' })],
    }),
    'no source available',
  );

  assertRoundTrip(
    await priceIt({ text: 'x', askingCents: 399, asOf: AS_OF }, {
      sources: [new StubSource(null, [])],
    }),
    'no identity',
  );

  assertRoundTrip(await run({ category: 'produce', points: [] }), 'category unsupported');

  assertRoundTrip(
    await run({
      category: 'tech',
      confidence: 0.5,
      label: 'Canon EOS R6',
      points: [crawled('Best Buy', 39999, 'regular', daysAgo(0))],
    }),
    'identity unsure',
  );

  assertRoundTrip(await run({ points: [], label: 'Kraft Dinner 225g' }), 'no price for product');

  assertRoundTrip(
    await run({ points: [crawled('No Frills', 399, 'regular', daysAgo(0))], askingCents: undefined }),
    'no asking price',
  );

  assertRoundTrip(
    await run({ points: [crawled('No Frills', 399, 'regular', daysAgo(0))], askingCents: Number.NaN }),
    'asking price unreadable',
  );

  assertRoundTrip(
    await run({
      points: [crawled('No Frills', 399, 'regular', '2026-12-25')],
      askingCents: 429,
    }),
    'future dated',
  );
});

test('refusals: one shopper saw this, and several did', async () => {
  const one = assertRoundTrip(
    await run({ points: [typed('No Frills', 399, '2026-09-03')], askingCents: 429 }),
    'one report',
  );
  assert.equal(one.kind, 'refusal');
  assert.match((one as { detail: string }).detail, /^One shopper saw \$3\.99 at No Frills on 3 September\./);

  const several = assertRoundTrip(
    await run({
      points: [typed('No Frills', 399, '2026-09-03'), typed('Metro', 449, '2026-09-01')],
      askingCents: 429,
    }),
    'several reports',
  );
  assert.match((several as { detail: string }).detail, /^Shoppers typed in .+, and .+\. Nobody has seen/);
});

test('disagreements: a wide spread and a promotion against a regular price', async () => {
  const wide = assertRoundTrip(
    await run({
      points: [
        crawled('No Frills', 399, 'regular', daysAgo(0)),
        crawled('Metro', 419, 'regular', daysAgo(0)),
        crawled('Sobeys', 1499, 'regular', daysAgo(0)),
      ],
      askingCents: 429,
    }),
    'wide spread',
  ) as Verdict;
  assert.equal(wide.disagreement?.kind, 'wide_spread');

  const promo = assertRoundTrip(
    await run({
      points: [
        crawled('No Frills', 399, 'regular', daysAgo(0)),
        crawled('Metro', 419, 'regular', daysAgo(0)),
        crawled('Sobeys', 249, 'promotional', daysAgo(0)),
      ],
      askingCents: 409,
    }),
    'regular vs promotional',
  ) as Verdict;
  assert.equal(promo.disagreement?.kind, 'regular_vs_promotional');
});

// ───────────────────────────────────────────────────────────────────────────
// The thin-evidence line, driven directly.
//
// `priceIt` cannot currently reach every shape of that sentence -- it builds
// its thin observations without a pack size, so `price/src/verdict.ts` never
// prints its unit-price clause on this path. Driving the derivation against
// that file's own `judge()` proves it total against the SHAPE rather than
// against today's reachable subset, which is what a French renderer needs.
// ───────────────────────────────────────────────────────────────────────────

test('the thin line rebuilds byte-for-byte across every shape it has', () => {
  const day = '2026-09-03';
  const now = new Date(AS_OF);
  const obs = (seller: string, amountCents: number, kind: 'regular' | 'promotional') => ({
    seller,
    amountCents,
    kind,
    observedAt: day,
    preTax: true,
  });

  const cases: {
    name: string;
    shelfCents: number;
    observations: ReturnType<typeof obs>[];
    /** Pack size, which is an input to the judgement rather than to a row. */
    size?: { sizeValue: number; sizeUnit: string };
  }[] = [
    // A band with width: low end, middle and high end.
    { name: 'low end', shelfCents: 300, observations: [obs('A', 350, 'regular'), obs('B', 900, 'regular')] },
    { name: 'middle', shelfCents: 600, observations: [obs('A', 350, 'regular'), obs('B', 900, 'regular')] },
    { name: 'high end', shelfCents: 880, observations: [obs('A', 350, 'regular'), obs('B', 900, 'regular')] },
    // A band with no width, at one seller and at several.
    { name: 'sole price, under', shelfCents: 300, observations: [obs('A', 350, 'regular')] },
    { name: 'sole price, equal', shelfCents: 350, observations: [obs('A', 350, 'regular')] },
    { name: 'sole price, over', shelfCents: 400, observations: [obs('A', 350, 'regular')] },
    {
      name: 'every seller charges the same',
      shelfCents: 400,
      observations: [obs('A', 350, 'regular'), obs('B', 350, 'regular')],
    },
    // A unit price, which the spine path cannot produce today: `thinAnswer`
    // builds its observations without a pack size, so `price/`'s unit clause
    // never fires through `priceIt`. Driven here so the derivation is proven
    // for the day the spine starts passing one.
    {
      name: 'with a unit price',
      shelfCents: 880,
      observations: [obs('A', 350, 'regular'), obs('B', 900, 'regular')],
      size: { sizeValue: 1000, sizeUnit: 'g' },
    },
    // A promotion undercutting the regular band it is not allowed to join.
    {
      name: 'with a cheaper promotion',
      shelfCents: 880,
      observations: [obs('A', 350, 'regular'), obs('B', 900, 'regular'), obs('C', 199, 'promotional')],
    },
    // Promotional only, so the promotional band IS the basis and must not be
    // reported a second time as a promotion undercutting itself.
    {
      name: 'promotional only',
      shelfCents: 300,
      observations: [obs('A', 350, 'promotional'), obs('B', 900, 'promotional')],
    },
  ];

  for (const c of cases) {
    const judged = thinJudge({
      shelfCents: c.shelfCents,
      observations: c.observations,
      now,
      ...(c.size ?? {}),
    });
    assert.notEqual(judged.tier, null, `${c.name}: fixture must produce a tier`);
    assert.equal(render(thinStructuredLine(judged, c.shelfCents, 'CAD')), judged.line, `thin line: ${c.name}`);
  }

  // The unit-price fixture is only worth anything if it actually produced one.
  // Without this the case above passes vacuously the day `price/` changes how
  // a pack size reaches it, and `unit_price` would go untested in silence.
  const band: ThinBand | null = thinJudge({
    shelfCents: 880,
    observations: [obs('A', 350, 'regular'), obs('B', 900, 'regular')],
    sizeValue: 1000,
    sizeUnit: 'g',
    now,
  }).regular;
  assert.ok(band !== null && band.unitCents !== null, 'a pack size must produce a unit price');
});

test('item 19: the thin line carries the currency it is given, on every amount, never a hardcoded CAD', () => {
  const judged = thinJudge({
    shelfCents: 880,
    observations: [
      { seller: 'A', amountCents: 350, kind: 'regular', observedAt: '2026-09-01', preTax: true },
      { seller: 'B', amountCents: 900, kind: 'regular', observedAt: '2026-09-01', preTax: true },
      { seller: 'C', amountCents: 199, kind: 'promotional', observedAt: '2026-09-01', preTax: true },
    ],
    sizeValue: 1000,
    sizeUnit: 'g',
    now: new Date('2026-09-02T00:00:00Z'),
  });
  const line = thinStructuredLine(judged, 880, 'EUR');
  const withMoney = line.fragments.filter((f) => 'currency' in f.facts);
  assert.ok(withMoney.length >= 4, 'the fixture must exercise amounts, a unit price and a promotion');
  for (const f of withMoney) assert.equal(f.facts.currency, 'EUR', `${f.code} still says another currency`);
});

test("the mapping of price/'s confidence reasons is total", () => {
  // Drive that file's own `confidenceOf` across its entire input domain. Every
  // string it can produce must land on a real code; falling through to
  // `basis_reason_not_yet_coded` means this package and that one have drifted.
  for (let sellers = 0; sellers <= 12; sellers += 1) {
    for (const stale of [false, true]) {
      for (const promoOnly of [false, true]) {
        for (const likely of [false, true]) {
          for (const text of thinConfidenceOf(sellers, stale, promoOnly, likely).basis) {
            const mapped = thinBasisShortfall(text);
            assert.notEqual(
              mapped.fragment.code,
              'basis_reason_not_yet_coded',
              `no code for price/'s confidence reason "${text}"`,
            );
            assert.equal(renderEnglish(mapped.fragment), text, `basis reason: "${text}"`);
          }
        }
      }
    }
  }
});

// ───────────────────────────────────────────────────────────────────────────
// `run.ts`, whose sentences interpolate nothing and are therefore codes alone.
// ───────────────────────────────────────────────────────────────────────────

const SCAN_ENGLISH: Record<string, string> = {
  photo_too_soft_to_read: 'That came out too soft to read the label.',
  photo_no_label_found: 'We could not find any label in that photo.',
  photo_processing_failed: 'Our side could not process that photo.',
  product_not_in_catalogue: 'We know what this is and it is not in our catalogue yet.',
  no_seller_prices_found: 'Nobody we read sells this right now, so there is no price to compare.',
  no_cheaper_option: 'Nothing comparable is cheaper right now.',
  device_offline_photo_kept: 'You are offline, so we kept the photo.',
  identity_taking_too_long: 'That is taking longer than it should.',
  prices_did_not_return_in_time: 'Prices did not come back in time.',
  alternatives_did_not_return_in_time: 'Cheaper options did not come back in time.',
  hold_still_and_retry: 'Hold still for a second and try again.',
  aim_at_front_of_package: 'Point at the front of the package and fill more of the frame.',
  try_once_more: 'Try once more.',
  will_finish_when_back_online: 'We will finish this as soon as you are back on.',
};

test('every scan refusal carries a code that rebuilds its sentence', () => {
  for (const [key, r] of Object.entries(REFUSALS)) {
    assert.equal(SCAN_ENGLISH[r.saysCode], r.says, `${key}: says`);
    assert.equal(
      r.repairCode === null ? null : SCAN_ENGLISH[r.repairCode],
      r.repair,
      `${key}: repair`,
    );
    assert.equal(r.repairCode === null, r.repair === null, `${key}: repair and repairCode disagree`);
  }
});

test('every scan timeout carries a code that rebuilds its sentence', async () => {
  const never = () => new Promise<never>(() => {});
  const identified = {
    kind: 'identified' as const,
    name: 'Kraft Dinner 225g',
    confidence: { band: 'high' },
    sizeValue: 225,
    sizeUnit: 'g',
    shelfCents: 399,
    key: 'A',
  };
  const collect = async (over: Partial<ScanPorts>): Promise<ScanEvent[]> => {
    const out: ScanEvent[] = [];
    for await (const e of scan({
      gtin: null,
      identify: async () => identified,
      prices: async () => ({ verdict: {}, sellerCount: 3 }),
      alternatives: async () => [{ code: 'B' }],
      verdictAvailable: true,
      upgradeOffer: null,
      capMs: 5,
      ...over,
    })) {
      out.push(e);
    }
    return out;
  };

  const slowIdentity = await collect({ identify: never });
  const slowPrices = await collect({ prices: never });
  const slowAlternatives = await collect({ alternatives: never });

  const timeouts = [...slowIdentity, ...slowPrices, ...slowAlternatives].filter(
    (e) => e.type === 'timed_out',
  ) as { says: string; saysCode: string }[];

  assert.equal(timeouts.length, 3, 'each of the three steps must be able to time out');
  for (const t of timeouts) assert.equal(SCAN_ENGLISH[t.saysCode], t.says);
  assert.deepEqual(
    new Set(timeouts.map((t) => t.saysCode)),
    new Set(['identity_taking_too_long', 'prices_did_not_return_in_time', 'alternatives_did_not_return_in_time']),
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Coverage. A code nobody produced is a code nobody has proved.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Every member of `LineCode`, restated. Restated rather than derived, because a
 * union is erased at runtime and the point of this list is to FAIL when the two
 * drift: adding a code to the contract without a scenario that produces it is
 * exactly the omission this test exists to catch.
 */
const ALL_CODES: readonly LineCode[] = [
  'regular_price_at_sole_store',
  'regular_price_across_stores',
  'all_prices_are_capped_promotions',
  'no_regular_price_only_promotions',
  'best_promotion_this_week',
  'no_promotion_this_week',
  'cheapest_of_retailers_carrying_it',
  'comparable_listings_range',
  'own_price_history_single_seller',
  'asking_below_sole_price',
  'asking_below_range',
  'asking_equals_sole_price',
  'asking_within_range',
  'asking_above_sole_price',
  'asking_above_range',
  'sole_price_matched_at_seller',
  'cheapest_and_dearest_sellers',
  'unit_price',
  'cheaper_on_promotion_at_seller',
  'confidence_minimum_met_only',
  'confidence_newest_price_age',
  'confidence_history_span_exact_match',
  'confidence_fresh_across_sellers_exact_match',
  'confidence_price_count_across_sellers',
  'shortfall_lone_claims_held_back',
  'shortfall_uncorroborated_typed_prices',
  'shortfall_newest_price_older_than_category',
  'shortfall_some_prices_too_old_to_count',
  'shortfall_fewer_points_than_category_needs',
  'shortfall_fewer_sellers_than_category_needs',
  'shortfall_prices_may_be_two_products',
  'shortfall_no_comparable_price_kinds',
  'shortfall_newest_price_past_tolerance',
  'shortfall_only_the_asking_seller_has_prices',
  'basis_single_seller',
  'basis_sellers_agree_on_range',
  'basis_newest_price_over_three_weeks',
  'basis_only_sale_prices',
  'basis_matched_by_name_not_barcode',
  'refusal_no_price_source_available',
  'refusal_identity_unresolved',
  'refusal_category_not_served',
  'refusal_identity_below_floor',
  'refusal_no_price_for_product',
  'refusal_asking_price_missing',
  'refusal_asking_price_unreadable',
  'refusal_all_prices_future_dated',
  'refusal_one_shopper_report',
  'refusal_several_unconfirmed_reports',
  'disagreement_wide_spread',
  'disagreement_promotion_not_store',
  // `basis_reason_not_yet_coded` is deliberately absent. It is the alarm, and
  // the test above asserts nothing can reach it.
];

test('every line code was produced by a real engine run and rendered back', () => {
  const missing = ALL_CODES.filter((c) => !seen.has(c));
  assert.deepEqual(missing, [], `codes with no scenario proving them: ${missing.join(', ')}`);
  const unexpected = [...seen].filter((c) => !ALL_CODES.includes(c));
  assert.deepEqual(unexpected, [], `codes rendered but not listed in ALL_CODES: ${unexpected.join(', ')}`);
});
