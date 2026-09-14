/**
 * EVERY SENTENCE THE ENGINE CAN SAY, SAID IN FRENCH.
 *
 * The defect this file exists because of was visible in a browser: a refusal
 * sheet on a French phone read "Could not work out what this is. Scan the
 * barcode, or type the model number." in English. Nothing was broken. The
 * client renderer simply had nine of the contract's fifty-two codes, and
 * `prose.js` rule 3 correctly fell the whole sentence back to English for the
 * other forty-three. The fallback was working; the table was short.
 *
 * A short table is invisible, which is the real problem. So this file makes it
 * loud, in three ways:
 *
 *   1. IT READS THE UNION OFF DISK. `spine/src/contract.ts` is the authority
 *      on what codes exist, and the `LineCode` string literals are extracted
 *      from the source rather than restated here. The day the spine grows a
 *      fifty-third code, this test goes red before anybody ships a screen that
 *      quietly speaks English to a French reader.
 *
 *   2. IT RENDERS EVERY CODE WITH REAL FACTS, taken from the fixtures in
 *      `spine/test/structured-prose.test.ts`, and keeps the English sentence
 *      those same facts produce beside each one. The assertion is that the two
 *      carry the SAME DIGITS: a French sentence that drops a seller's price,
 *      reshapes a count, or invents a number fails here. It is the same trade
 *      the round-trip test in the spine makes, in the other direction.
 *
 *   3. IT FORBIDS TIER WORDS WHERE ENGLISH HAS NONE. A refusal, a shortfall, a
 *      basis clause and a confidence sentence are statements about the
 *      evidence and have graded nothing. "Bon prix" or "cher" inside one of
 *      them would be a verdict the English never gave, in a language the
 *      person who wrote the English cannot read back.
 *
 * The money assertion is worth naming on its own: French money here is
 * "4,99 $", so a `$` sitting in front of a digit anywhere in a French sentence
 * means `cad()` was bypassed and a raw English amount was interpolated.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ *
 * A localStorage, for a module that expects a browser. Same stub and the
 * same reason as locale.test.mjs: `locale()` reads stored settings, and
 * `prose.render` refuses to do anything at all outside French.
 * ------------------------------------------------------------------ */

const cell = new Map();
globalThis.localStorage = {
  getItem: (k) => (cell.has(k) ? cell.get(k) : null),
  setItem: (k, v) => cell.set(k, String(v)),
  removeItem: (k) => cell.delete(k),
};

function inFrench(fn) {
  cell.set('shin.locale', 'fr');
  try {
    return fn();
  } finally {
    cell.delete('shin.locale');
  }
}

const prose = await import('../public/js/prose.js');

/* ------------------------------------------------------------------ *
 * 1. The union, read off the contract rather than restated.
 * ------------------------------------------------------------------ */

const CONTRACT = fileURLToPath(new URL('../../spine/src/contract.ts', import.meta.url));

/**
 * Every string literal in the `LineCode` union.
 *
 * Comments are stripped first, deliberately: the union's members are each
 * documented by a doc comment above them, those comments quote other code, and
 * a stray semicolon or quote inside one of them would otherwise decide where
 * this parser thinks the union ends.
 */
function lineCodes() {
  const src = readFileSync(CONTRACT, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const m = /export type LineCode\s*=([^;]*);/.exec(src);
  assert.ok(m !== null, 'could not find the LineCode union in contract.ts');
  const codes = [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
  assert.ok(codes.length > 40, `only parsed ${codes.length} codes out of the union, the parser is wrong`);
  return codes;
}

test('the French table covers exactly the codes the contract defines', () => {
  const contract = lineCodes();
  const french = prose.FRENCH_CODES;

  assert.equal(new Set(contract).size, contract.length, 'contract.ts lists a code twice');
  assert.equal(new Set(french).size, french.length, 'prose.js lists a code twice');

  const missing = contract.filter((c) => !french.includes(c));
  const extra = french.filter((c) => !contract.includes(c));
  assert.deepEqual(missing, [], `codes the engine can send that have no French: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `French for codes the engine cannot send: ${extra.join(', ')}`);
});

/* ------------------------------------------------------------------ *
 * 2. Every code, with the facts the spine actually sends and the English
 *    those same facts produce.
 *
 * The English column is copied from `spine/test/structured-prose.test.ts`,
 * which asserts byte-for-byte that the engine itself writes it. It is kept
 * here so the French can be checked against something rather than against
 * nothing, and so a reader can see both halves of a sentence at once.
 * ------------------------------------------------------------------ */

const CASES = [
  /* ── verdict lines, one category rule each ── */
  {
    code: 'regular_price_at_sole_store',
    facts: { regularCents: 399, currency: 'CAD', askingCents: 429 },
    english: 'Regular price is $3.99 at the one store carrying it. You are looking at $4.29.',
  },
  {
    code: 'regular_price_across_stores',
    facts: { regularCents: 409, currency: 'CAD', storeCount: 3, askingCents: 429 },
    english: 'Regular price is about $4.09 across 3 stores. You are looking at $4.29.',
  },
  {
    code: 'all_prices_are_capped_promotions',
    facts: { askingCents: 147, currency: 'CAD' },
    english:
      'Every price I have for this is a limited promotion, so there is nothing here I can fairly call a going rate. You are looking at $1.47.',
  },
  {
    code: 'no_regular_price_only_promotions',
    facts: { askingCents: 349, currency: 'CAD' },
    english: 'No regular shelf price found, everything below is a promotion. You are looking at $3.49.',
  },
  {
    code: 'best_promotion_this_week',
    facts: { promotionalCents: 349, currency: 'CAD', seller: 'Metro', limit: 'limit 8' },
    english: 'This week it is $3.49 at Metro (limit 8).',
  },
  {
    code: 'best_promotion_this_week',
    facts: { promotionalCents: 299, currency: 'CAD', seller: 'No Frills', limit: null },
    english: 'This week it is $2.99 at No Frills.',
  },
  {
    code: 'no_promotion_this_week',
    facts: {},
    english: 'Nothing on promotion anywhere we can see this week.',
  },
  {
    code: 'cheapest_of_retailers_carrying_it',
    facts: { retailerCount: 3, cheapestCents: 37999, cheapestSeller: 'Amazon', currency: 'CAD', askingCents: 42999 },
    english: '3 retailers have it. Cheapest is $379.99 at Amazon. You are looking at $429.99.',
  },
  {
    code: 'comparable_listings_range',
    facts: {
      lowCents: 3500, highCents: 15900, clusterLowCents: 6000, clusterHighCents: 12000,
      currency: 'CAD', askingCents: 8000, basis: 'asking',
    },
    english:
      'Comparable listings run $35.00 to $159.00, clustering around $60.00 to $120.00. You are looking at $80.00. These are asking prices, not sales, and sellers start high.',
  },
  {
    code: 'comparable_listings_range',
    facts: {
      lowCents: 4000, highCents: 7000, clusterLowCents: 4750, clusterHighCents: 5500,
      currency: 'CAD', askingCents: 5500, basis: 'sold',
    },
    english:
      'Comparable listings run $40.00 to $70.00, clustering around $47.50 to $55.00. You are looking at $55.00. These are what these actually sold for.',
  },
  {
    code: 'own_price_history_single_seller',
    facts: { lowestCents: 9900, lowestObservedOn: '2026-05-07', typicalCents: 10050, currency: 'CAD', askingCents: 11900 },
    english:
      'Only one seller, so this is against its own history: as low as $99.00 on 2026-05-07, usually about $100.50. You are looking at $119.00.',
  },

  /* ── the thin-evidence line, four fragments joined with a space ── */
  {
    code: 'asking_below_sole_price',
    facts: { askingCents: 300, currency: 'CAD', sellerCount: 1 },
    english: '$3.00 is less than the only price we have.',
  },
  {
    code: 'asking_below_range',
    facts: { askingCents: 300, currency: 'CAD' },
    english: '$3.00 is at the low end.',
  },
  {
    code: 'asking_equals_sole_price',
    facts: { askingCents: 350, currency: 'CAD', sellerCount: 2 },
    english: '$3.50 matches what every seller charges.',
  },
  {
    code: 'asking_within_range',
    facts: { askingCents: 600, currency: 'CAD' },
    english: '$6.00 is about what others charge.',
  },
  {
    code: 'asking_above_sole_price',
    facts: { askingCents: 400, currency: 'CAD', sellerCount: 1 },
    english: '$4.00 is more than the only price we have.',
  },
  {
    code: 'asking_above_range',
    facts: { askingCents: 880, currency: 'CAD' },
    english: '$8.80 is at the high end.',
  },
  {
    code: 'sole_price_matched_at_seller',
    facts: { seller: 'Metro', amountCents: 350, currency: 'CAD' },
    english: 'Metro has it at $3.50 too.',
  },
  {
    code: 'cheapest_and_dearest_sellers',
    facts: { cheapestSeller: 'No Frills', cheapestCents: 350, dearestSeller: 'Metro', dearestCents: 900, currency: 'CAD' },
    english: 'No Frills has it at $3.50, Metro at $9.00.',
  },
  {
    code: 'unit_price',
    facts: { unitCents: 50, currency: 'CAD', unitLabel: '100g' },
    english: 'That is $0.50 per 100g.',
  },
  {
    code: 'cheaper_on_promotion_at_seller',
    facts: { seller: 'Sobeys', amountCents: 199, currency: 'CAD' },
    english: 'Sobeys has it on sale at $1.99.',
  },

  /* ── confidence ── */
  {
    code: 'confidence_minimum_met_only',
    facts: { pointCount: 2, sellerCount: 2 },
    english: 'Only just enough to answer: 2 prices from 2 sellers.',
  },
  {
    code: 'confidence_minimum_met_only',
    facts: { pointCount: 5, sellerCount: 1 },
    english: 'Only just enough to answer: 5 prices from 1 seller.',
  },
  {
    code: 'confidence_newest_price_age',
    facts: { ageDays: 5 },
    english: 'Newest price is 5 days old.',
  },
  {
    code: 'confidence_history_span_exact_match',
    facts: { pointCount: 10, spanDays: 300 },
    english: "10 prices spanning 300 days of this seller's own history, and the product is a certain match.",
  },
  {
    code: 'confidence_fresh_across_sellers_exact_match',
    facts: { pointCount: 6, sellerCount: 6, oldestAgeDays: 1 },
    english: '6 prices across 6 sellers, none older than 1 day, and the product is a certain match.',
  },
  {
    code: 'confidence_price_count_across_sellers',
    facts: { pointCount: 6, sellerCount: 6 },
    english: '6 prices across 6 sellers.',
  },

  /* ── shortfall fragments, lower case, the list shape capitalises ── */
  {
    code: 'shortfall_lone_claims_held_back',
    facts: { count: 1 },
    english:
      "1 typed price is being held back for now, too far from everything else to publish on one person's word",
  },
  {
    code: 'shortfall_lone_claims_held_back',
    facts: { count: 2 },
    english:
      "2 typed prices are being held back for now, too far from everything else to publish on one person's word",
  },
  {
    code: 'shortfall_uncorroborated_typed_prices',
    facts: { count: 1 },
    english: '1 typed price is not counted toward this, because nobody else has seen that tag yet',
  },
  {
    code: 'shortfall_uncorroborated_typed_prices',
    facts: { count: 2 },
    english: '2 typed prices are not counted toward this, because nobody else has seen those tags yet',
  },
  {
    code: 'shortfall_newest_price_older_than_category',
    facts: { ageDays: 10, category: 'tech', categoryLabel: 'New tech' },
    english: 'the newest price we have is 10 days old, and new tech moves faster than that',
  },
  {
    code: 'shortfall_newest_price_older_than_category',
    facts: { ageDays: 400, category: 'furniture', categoryLabel: 'New furniture' },
    english: 'the newest price we have is 400 days old, and new furniture moves faster than that',
  },
  {
    code: 'shortfall_some_prices_too_old_to_count',
    facts: { droppedCount: 1, totalCount: 4 },
    english: '1 of 4 prices are too old to count',
  },
  {
    code: 'shortfall_fewer_points_than_category_needs',
    facts: { pointCount: 1, needed: 3, category: 'tech', categoryLabel: 'New tech' },
    english: '1 price where new tech usually needs 3',
  },
  {
    code: 'shortfall_fewer_sellers_than_category_needs',
    facts: { sellerCount: 2, needed: 3, category: 'tech', categoryLabel: 'New tech' },
    english: '2 sellers where new tech usually needs 3',
  },
  {
    code: 'shortfall_prices_may_be_two_products',
    facts: {},
    english: 'the prices found disagree widely enough that this may be more than one product',
  },
  {
    code: 'shortfall_no_comparable_price_kinds',
    facts: { kinds: ['list'] },
    english: 'the only prices anyone publishes for this are list, which is not a comparison',
  },
  {
    code: 'shortfall_no_comparable_price_kinds',
    facts: { kinds: ['list', 'asking'] },
    english: 'the only prices anyone publishes for this are list and asking, which is not a comparison',
  },
  {
    code: 'shortfall_newest_price_past_tolerance',
    facts: { ageDays: 40, category: 'grocery', categoryLabel: 'Groceries and household' },
    english: 'the newest price we have is 40 days old, past what groceries and household tolerates',
  },
  {
    code: 'shortfall_only_the_asking_seller_has_prices',
    facts: {},
    english:
      'every price we have is this same store, so this is against its own history rather than against anybody else',
  },

  /* ── confidence basis fragments ── */
  { code: 'basis_single_seller', facts: {}, english: 'one seller' },
  {
    code: 'basis_sellers_agree_on_range',
    facts: { sellerCount: 3 },
    english: '3 sellers agree on the range',
  },
  {
    code: 'basis_newest_price_over_three_weeks',
    facts: {},
    english: 'the newest price is over three weeks old',
  },
  { code: 'basis_only_sale_prices', facts: {}, english: 'only sale prices to compare against' },
  {
    code: 'basis_matched_by_name_not_barcode',
    facts: {},
    english: 'one seller matched by name, not barcode',
  },
  /*
   * The alarm. It carries the English verbatim and is the ONE code whose
   * French is deliberately identical to its English, so it is exempted from
   * the "French is not English" assertion below rather than quietly passing
   * it. `contract.ts` says it must never reach a payload at all, and the
   * spine's own test fails if it does.
   */
  {
    code: 'basis_reason_not_yet_coded',
    facts: { text: 'a confidence reason nobody mapped' },
    english: 'a confidence reason nobody mapped',
    sameAsEnglish: true,
  },

  /* ── refusals ── */
  {
    code: 'refusal_no_price_source_available',
    facts: {},
    english: 'No price source is available right now.',
  },
  {
    code: 'refusal_identity_unresolved',
    facts: {},
    english: 'Could not work out what this is. Scan the barcode, or type the model number.',
  },
  {
    code: 'refusal_category_not_served',
    facts: {
      category: 'produce',
      categoryLabel: 'Fresh produce',
      why: 'Shopper-reported shelf prices are the only source here.',
    },
    english:
      'Fresh produce is not something Shin can price yet. Shopper-reported shelf prices are the only source here.',
  },
  {
    code: 'refusal_identity_below_floor',
    facts: { label: 'Canon EOS R6' },
    english:
      'Not sure enough this is the right one. The closest match was "Canon EOS R6". Pick the right one and Shin will price it.',
  },
  {
    code: 'refusal_no_price_for_product',
    facts: { label: 'Kraft Dinner 225g' },
    english: 'Nothing has a price for "Kraft Dinner 225g" right now.',
  },
  {
    code: 'refusal_asking_price_missing',
    facts: {},
    english: 'Found comparisons but no price for the thing in front of you. Point at the tag.',
  },
  {
    code: 'refusal_asking_price_unreadable',
    facts: {},
    english: 'That price did not read as a number. Type it again with a dot for the decimal.',
  },
  {
    code: 'refusal_all_prices_future_dated',
    facts: {},
    english: 'Every price found is dated later than today, so there is nothing to compare against yet.',
  },
  {
    code: 'refusal_one_shopper_report',
    facts: {
      readings: [{ amountCents: 399, currency: 'CAD', seller: 'No Frills', observedAt: '2026-09-03' }],
      count: 1,
    },
    english:
      'One shopper saw $3.99 at No Frills on 3 September. Nobody else has priced this yet, so there is nothing to check it against.',
  },
  {
    code: 'refusal_several_unconfirmed_reports',
    facts: {
      readings: [
        { amountCents: 399, currency: 'CAD', seller: 'No Frills', observedAt: '2026-09-03' },
        { amountCents: 449, currency: 'CAD', seller: 'Metro', observedAt: '2026-09-01' },
      ],
      count: 2,
    },
    english:
      'Shoppers typed in $3.99 at No Frills on 3 September, and $4.49 at Metro on 1 September. Nobody has seen either of those tags twice, so there is nothing to check them against.',
  },

  /* ── disagreements ── */
  {
    code: 'disagreement_wide_spread',
    facts: { lowCents: 399, highCents: 1499, currency: 'CAD', ratio: 3.76 },
    english:
      'Prices for the same thing run $3.99 to $14.99 right now. That is a 3.76x spread, so there is no single right price to quote.',
  },
  {
    code: 'disagreement_promotion_not_store',
    facts: { promotionalCents: 249, regularCents: 419, currency: 'CAD', ratio: 1.68 },
    english:
      'The gap here is the promotion, not the store: $2.49 on sale against $4.19 regular is a 1.68x difference on the same box.',
  },
];

/** One fragment, rendered on its own, in French. */
function french(c) {
  return inFrench(() =>
    prose.render({ shape: 'single', fragments: [{ code: c.code, facts: c.facts }] }, 'FALLBACK'),
  );
}

/** Every digit in a string, in order. The one thing two languages must share. */
function digits(text) {
  return text.replace(/[^0-9]/g, '');
}

test('every case in this file names a code the contract has', () => {
  const contract = new Set(lineCodes());
  for (const c of CASES) assert.ok(contract.has(c.code), `${c.code} is not a LineCode`);
});

test('every code in the contract has a case here, with real facts behind it', () => {
  const covered = new Set(CASES.map((c) => c.code));
  const missing = lineCodes().filter((c) => !covered.has(c));
  assert.deepEqual(missing, [], `codes with no fixture proving their French: ${missing.join(', ')}`);
});

test('every code renders a real French sentence rather than falling back', () => {
  for (const c of CASES) {
    const out = french(c);
    assert.notEqual(out, 'FALLBACK', `${c.code} fell back to English instead of rendering`);
    assert.equal(typeof out, 'string', `${c.code} did not return a string`);
    assert.ok(out.trim().length > 3, `${c.code} rendered almost nothing: ${out}`);
    if (c.sameAsEnglish !== true) {
      assert.notEqual(out, c.english, `${c.code} came back in English`);
    }
  }
});

test('no French sentence leaks a missing fact, an em dash, or English money', () => {
  for (const c of CASES) {
    const out = french(c);
    assert.ok(!out.includes('undefined'), `${c.code} put a missing fact on the screen: ${out}`);
    assert.ok(!out.includes('NaN'), `${c.code} put NaN on the screen: ${out}`);
    assert.ok(!out.includes('—'), `${c.code} uses an em dash: ${out}`);
    // French money is "4,99 $". A "$" in front of a digit means `cad()` was
    // bypassed and an English amount was interpolated raw.
    assert.ok(!/\$\s*\d/.test(out), `${c.code} writes money the English way: ${out}`);
  }
});

test('every number the English sentence shows survives into the French one', () => {
  for (const c of CASES) {
    const out = french(c);
    // Digit-for-digit rather than substring-for-substring: the punctuation is
    // MEANT to change ($4.99 becomes 4,99 $, "3 September" becomes
    // "3 septembre"), and the values are meant not to. A dropped price, a
    // reshaped count or an invented number all fail here.
    assert.equal(
      digits(out),
      digits(c.english),
      `${c.code} does not carry the same numbers as its English:\n  en: ${c.english}\n  fr: ${out}`,
    );
  }
});

test('a fragment whose list of facts is missing goes back to English, not to a vaguer French', () => {
  // These three carry a list, and the list IS the sentence: the readings a
  // shopper typed, or the kinds of price that could not be compared. A
  // renderer that shrugged and wrote "a price for this" would be dropping a
  // fact rather than falling back, and rule 3 exists to stop exactly that.
  for (const code of [
    'refusal_one_shopper_report',
    'refusal_several_unconfirmed_reports',
    'shortfall_no_comparable_price_kinds',
  ]) {
    for (const facts of [{}, { readings: [], kinds: [] }]) {
      const out = inFrench(() =>
        prose.render({ shape: 'single', fragments: [{ code, facts }] }, 'ENGLISH'),
      );
      assert.equal(out, 'ENGLISH', `${code} invented a sentence out of no facts: ${out}`);
    }
  }
});

/* ------------------------------------------------------------------ *
 * 3. No tier word where the English has none.
 * ------------------------------------------------------------------ */

/**
 * The four families that describe EVIDENCE and have graded nothing.
 *
 * Their English says "one seller", "too old to count", "not a comparison".
 * None of it calls a price anything. A French reader meeting "bon prix" or
 * "cher" inside one of these would be handed a verdict that was never given,
 * and nobody who wrote the English would be able to read it back.
 */
const UNGRADED = /^(refusal|shortfall|basis|confidence)_/;

/** Word-boundaries written out, because JS `\b` treats an accent as a break. */
const EDGE = '(^|[^A-Za-zÀ-ÿ])';
const TIER_WORDS = [
  'bon prix',
  'bonne affaire',
  'aubaine',
  'aubaines',
  'cher',
  'chère',
  'chers',
  'chères',
  'élevé',
  'élevée',
  'élevés',
  'juste',
  'moins cher',
  'passe ton tour',
  'vol',
  'salé',
];

test('no refusal, shortfall, basis or confidence sentence grades the price', () => {
  const offenders = [];
  for (const c of CASES) {
    if (!UNGRADED.test(c.code)) continue;
    const out = french(c);
    for (const word of TIER_WORDS) {
      const re = new RegExp(`${EDGE}${word}${EDGE.replace('^', '$')}`, 'i');
      // Belt and braces: the English for this code is checked too, so a code
      // whose English DOES grade (there is none today) would show up as a
      // disagreement here rather than as a silent French-only failure.
      if (re.test(out) && !re.test(c.english)) offenders.push(`${c.code}: "${word}" in "${out}"`);
    }
  }
  assert.deepEqual(offenders, [], `tier words in ungraded sentences:\n${offenders.join('\n')}`);
});

test('the ungraded families are actually being checked, not silently empty', () => {
  const checked = CASES.filter((c) => UNGRADED.test(c.code));
  // 31 of the 52 codes are refusal, shortfall, basis or confidence. A regex
  // typo that matched nothing would make the test above pass over an empty
  // set, which is the failure mode a ban list dies of.
  assert.ok(checked.length >= 25, `only ${checked.length} ungraded cases reached the tier-word check`);
});
