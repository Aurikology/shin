/**
 * The four awkward item kinds the founder picked on 2026-09-14, proven
 * against fake numbers only: sold by weight, store brands, multi-item and
 * member prices, and marketplace or non-CAD listings.
 *
 * EVERY NUMBER IN THIS FILE WAS MEASURED, NOT TYPED, the same way as in
 * `gauge.test.ts`: the fixed Python source `src/gauge.ts` used to send into
 * Gemini's sandbox (retired 2026-09-19, see that file's header) was run in a
 * real CPython 3.14.0 interpreter over the identical input and the
 * TypeScript twin was compared to that run with `deepStrictEqual`. Seventeen
 * cases, seventeen exact
 * matches, and the cases here are a subset of that run. This is spelled out
 * because a previous session hand-typed an expected line for this function
 * and it was wrong, and a hand-typed expectation proves only that two guesses
 * agree.
 *
 * NOTHING HERE TOUCHES A REAL GROUNDED PRICE. `computeGauge` is the local
 * twin and these are invented prices; running it on a Grounded Result would
 * be the one thing Google's grounding terms forbid. See `src/gauge.ts`'s
 * header.
 *
 * WHAT THE LAST TEST IN THIS FILE IS FOR. Every exclusion code and every note
 * is swept against the grading-word list `gradingWords()` below carries. An
 * exclusion says a neutral fact about an offer and never a reading of its
 * price, and "deal" is itself on that list, which is why `dealKind` is an
 * internal field name and no rendered string uses the word.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  computeGauge,
  type GaugeExcluded,
  type GaugeOffer,
  type GaugeResult,
  type GaugeShelfItem,
  type GaugeUsable,
} from '../src/gauge.ts';
import { priceLineFor, shownOffers } from '../src/providers/gemini-grounded.ts';

/** Narrows and fails loudly, so a wrong `usable` does not read as a wrong number twenty lines later. */
function usable(result: GaugeResult): GaugeUsable {
  assert.equal(result.usable, true, 'expected a placeable line');
  return result as GaugeUsable;
}

/** Defaults are the absent case, so each test writes only the field it is about. */
function offer(extra: Partial<GaugeOffer> & { retailer: string; price: number }): GaugeOffer {
  return { url: null, sizeValue: null, sizeUnit: null, packCount: null, ...extra };
}

function shelf(extra: Partial<GaugeShelfItem> & { price: number }): GaugeShelfItem {
  // These fixtures are Canadian shopping, so their shelf STATES its market's
  // currency. The gauge no longer assumes one (item 19): it used to read an
  // absent currency as CAD, which is what these tests silently leaned on.
  return { sizeValue: null, sizeUnit: null, packCount: null, currency: 'CAD', ...extra };
}

const codesOf = (entries: readonly GaugeExcluded[]) => entries.map((e) => e.code);
const retailersOf = (entries: readonly { retailer: string }[]) => entries.map((e) => e.retailer);

/* ------------------------------------------------- the shape does not move */

test('an offer carrying none of the new fields behaves exactly as it did before', () => {
  // The same offer twice: once with the fields simply absent, once with every
  // one of them spelled out as null or false. Both must equal the numbers
  // `gauge.test.ts` has pinned since before any of this existed.
  const bare = usable(
    computeGauge(shelf({ price: 4.99, sizeValue: 500, sizeUnit: 'g' }), [
      offer({ retailer: 'Loblaws', price: 3.99, url: 'u1', sizeValue: 500, sizeUnit: 'g' }),
      offer({ retailer: 'Metro', price: 3.99, url: 'u2', sizeValue: 500, sizeUnit: 'g' }),
    ]),
  );
  const spelledOut = usable(
    computeGauge(
      shelf({ price: 4.99, sizeValue: 500, sizeUnit: 'g', organic: false, storeBrand: null, soldByWeight: false }),
      [
        offer({
          retailer: 'Loblaws',
          price: 3.99,
          url: 'u1',
          sizeValue: 500,
          sizeUnit: 'g',
          organic: false,
          storeBrand: null,
          soldByWeight: false,
          currency: null,
          marketplace: false,
          memberOnly: false,
          dealKind: null,
          dealUnits: null,
        }),
        offer({ retailer: 'Metro', price: 3.99, url: 'u2', sizeValue: 500, sizeUnit: 'g' }),
      ],
    ),
  );

  assert.deepEqual(spelledOut, bare, 'null and false must read as absent, or every stored offer changes meaning');
  assert.equal(bare.median, 0.798);
  assert.equal(bare.percent, 25.06265664160402);
  assert.equal(bare.zone, 'over_your_line');
  assert.equal(bare.shelfPosition, 91.77109440267336);
  assert.equal(bare.shelfLabel, '500 g · $4.99');
  assert.equal(bare.points[0].label, '500 g · $3.99');
  assert.equal(bare.points[0].position, 50);
  assert.deepEqual(bare.excluded, []);
});

/* -------------------------------------------------- rule 1: sold by weight */

test('per kg and per lb sit on one line, because the weight the price is for is known', () => {
  // $15.41/kg and $7.49/lb are the same product measured two ways. Nothing is
  // guessed: the size fields say what each price bought.
  const g = usable(
    computeGauge(shelf({ price: 6.99, sizeValue: 1, sizeUnit: 'lb', organic: true, soldByWeight: true }), [
      offer({ retailer: 'Organic A', price: 15.41, sizeValue: 1, sizeUnit: 'kg', organic: true, soldByWeight: true }),
      offer({ retailer: 'Organic B', price: 7.49, sizeValue: 1, sizeUnit: 'lb', organic: true, soldByWeight: true }),
      offer({ retailer: 'Plain C', price: 3.99, sizeValue: 1, sizeUnit: 'lb', organic: false, soldByWeight: true }),
      offer({ retailer: 'Unweighed D', price: 8.12, organic: true, soldByWeight: true }),
    ]),
  );
  assert.equal(g.n, 2);
  assert.equal(g.dimension, 'mass');
  assert.equal(g.median, 1.5961311718823665);
  assert.equal(g.percent, -3.45209467622208);
  assert.equal(g.shelfPosition, 38.4930177459264);
  assert.deepEqual(retailersOf(g.points), ['Organic A', 'Organic B']);
  assert.equal(g.points[0].position, 38.48649934425529);
  assert.equal(g.points[0].label, '1 kg · $15.41');
  assert.equal(g.points[1].position, 61.51350065574471);
});

test('a variable weight nobody wrote down is listed, not guessed at', () => {
  const g = usable(
    computeGauge(shelf({ price: 6.99, sizeValue: 1, sizeUnit: 'lb', organic: true, soldByWeight: true }), [
      offer({ retailer: 'Organic A', price: 15.41, sizeValue: 1, sizeUnit: 'kg', organic: true, soldByWeight: true }),
      offer({ retailer: 'Organic B', price: 7.49, sizeValue: 1, sizeUnit: 'lb', organic: true, soldByWeight: true }),
      offer({ retailer: 'Plain C', price: 3.99, sizeValue: 1, sizeUnit: 'lb', organic: false, soldByWeight: true }),
      offer({ retailer: 'Unweighed D', price: 8.12, organic: true, soldByWeight: true }),
    ]),
  );
  assert.deepEqual(g.excluded, [
    {
      retailer: 'Plain C',
      code: 'different_organic',
      note: 'organic and non-organic are not the same product',
      label: '1 lb · $3.99',
      url: null,
    },
    {
      retailer: 'Unweighed D',
      code: 'unknown_weight',
      note: 'sold by weight, with no weight given',
      label: '$8.12',
      url: null,
    },
  ]);
  assert.ok(!retailersOf(g.points).includes('Unweighed D'), 'a total for an unknown weight has no unit price to place');
});

test('a non-organic shelf item keeps the organic price off its line too, not only the other way round', () => {
  const g = usable(
    computeGauge(shelf({ price: 3.99, sizeValue: 1, sizeUnit: 'lb', soldByWeight: true }), [
      offer({ retailer: 'Plain A', price: 3.49, sizeValue: 1, sizeUnit: 'lb', soldByWeight: true }),
      offer({ retailer: 'Plain C', price: 3.49, sizeValue: 1, sizeUnit: 'lb', soldByWeight: true }),
      offer({ retailer: 'Organic B', price: 7.49, sizeValue: 1, sizeUnit: 'lb', organic: true, soldByWeight: true }),
    ]),
  );
  assert.equal(g.n, 2);
  assert.equal(g.median, 0.7694132950252228);
  assert.equal(g.percent, 14.32664756446991);
  assert.equal(g.zone, 'over_your_line');
  assert.deepEqual(codesOf(g.excluded), ['different_organic']);
  assert.equal(g.excluded[0].retailer, 'Organic B');
});

/* ---------------------------------------------------- rule 2: store brands */

test('against a name brand, a store brand is listed off the line rather than placed on it', () => {
  // A President's Choice price is not a price for the thing in the shopper's
  // hand, so it neither places a dot nor moves the median.
  const g = usable(
    computeGauge(shelf({ price: 5.49, sizeValue: 750, sizeUnit: 'mL' }), [
      offer({ retailer: 'Metro', price: 5.99, sizeValue: 750, sizeUnit: 'mL' }),
      offer({ retailer: 'Sobeys', price: 5.99, sizeValue: 750, sizeUnit: 'mL' }),
      offer({ retailer: 'Loblaws', price: 3.49, sizeValue: 750, sizeUnit: 'mL', storeBrand: "President's Choice" }),
      offer({ retailer: 'Walmart', price: 2.97, sizeValue: 750, sizeUnit: 'mL', storeBrand: 'Great Value' }),
    ]),
  );
  assert.equal(g.n, 2);
  assert.equal(g.median, 0.7986666666666666, 'the median is the two name brands; the two store brands never entered it');
  assert.equal(g.percent, -8.347245409015024);
  assert.deepEqual(retailersOf(g.excluded), ['Loblaws', 'Walmart']);
  assert.deepEqual(codesOf(g.excluded), ['different_brand_kind', 'different_brand_kind']);
  assert.equal(g.excluded[0].label, '750 mL · $3.49', 'the labelled list still shows what that price actually is');
});

test('when the shelf item IS a store brand, only that same store brand is on the line', () => {
  // Spelling and padding must not split one brand into two, so the comparison
  // is trimmed and case-folded on both sides.
  const g = usable(
    computeGauge(shelf({ price: 3.99, sizeValue: 750, sizeUnit: 'mL', storeBrand: "President's Choice" }), [
      offer({ retailer: 'Loblaws', price: 3.49, sizeValue: 750, sizeUnit: 'mL', storeBrand: "president's choice  " }),
      offer({ retailer: 'Real Canadian', price: 3.29, sizeValue: 750, sizeUnit: 'mL', storeBrand: "President's Choice" }),
      offer({ retailer: 'Walmart', price: 2.97, sizeValue: 750, sizeUnit: 'mL', storeBrand: 'Great Value' }),
      offer({ retailer: 'Metro', price: 5.99, sizeValue: 750, sizeUnit: 'mL' }),
    ]),
  );
  assert.equal(g.n, 2);
  assert.deepEqual(retailersOf(g.points), ['Loblaws', 'Real Canadian']);
  assert.equal(g.median, 0.452);
  assert.equal(g.percent, 17.69911504424779);
  assert.equal(g.points[0].position, 57.374631268436595);
  assert.equal(g.points[1].position, 42.625368731563405);
  assert.deepEqual(retailersOf(g.excluded), ['Walmart', 'Metro'], 'another store brand, and the name brand, are both off it');
  assert.deepEqual(codesOf(g.excluded), ['different_brand_kind', 'different_brand_kind']);
});

/* ------------------------------------------ rule 3: multi-item and members */

test('a 2 for $5 places at $2.50 each, and the label still says what the till charges', () => {
  const g = usable(
    computeGauge(shelf({ price: 2.99, sizeValue: 500, sizeUnit: 'g' }), [
      offer({ retailer: 'Sobeys', price: 5, sizeValue: 500, sizeUnit: 'g', dealKind: 'multi_buy', dealUnits: 2 }),
      offer({ retailer: 'Metro', price: 2.5, sizeValue: 500, sizeUnit: 'g' }),
      offer({ retailer: 'Food Basics', price: 5.98, sizeValue: 500, sizeUnit: 'g', dealKind: 'bogo' }),
      offer({ retailer: 'No Frills', price: 2.29, sizeValue: 500, sizeUnit: 'g', dealKind: 'clearance' }),
    ]),
  );
  assert.equal(g.n, 4);
  assert.equal(g.median, 0.5, '$2.50 per 500 g is $0.50 per 100 g');
  assert.equal(g.points[0].label, '500 g · $2.50 (2 for $5.00)');
  assert.equal(
    g.points[0].position,
    g.points[1].position,
    'the 2 for $5 and the plain $2.50 are the same price per item and land on the same spot',
  );
  assert.equal(g.points[0].position, 50);
  assert.equal(g.points[2].label, '500 g · $2.99 (buy one get one)', 'buy one get one is half of $5.98');
  assert.equal(g.points[2].position, 98.99999999999999);
  assert.equal(g.points[3].label, '500 g · $2.29', 'a marked-down price is already the price per item');
  assert.equal(g.points[3].position, 28.999999999999982);
  assert.equal(g.percent, 19.599999999999994);
});

test('an unparsed multi-item price leaves the price alone rather than inventing a divisor', () => {
  const g = usable(
    computeGauge(shelf({ price: 4, sizeValue: 100, sizeUnit: 'g' }), [
      offer({ retailer: 'NoUnits', price: 4, sizeValue: 100, sizeUnit: 'g', dealKind: 'multi_buy' }),
      offer({ retailer: 'Unknown', price: 4.5, sizeValue: 100, sizeUnit: 'g', dealKind: 'flash' }),
      offer({ retailer: 'OneUnit', price: 3.5, sizeValue: 100, sizeUnit: 'g', dealKind: 'multi_buy', dealUnits: 1 }),
    ]),
  );
  assert.equal(g.median, 4);
  assert.deepEqual(
    g.points.map((p) => p.label),
    ['100 g · $4.00', '100 g · $4.50', '100 g · $3.50'],
    'no suffix and no division, because a made-up divisor would place a dot at a price nobody can pay',
  );
  assert.equal(g.points[0].position, 50);
  assert.equal(g.points[1].position, 91.66666666666667);
  assert.equal(g.points[2].position, 8.333333333333371);
});

test('a member price counts in the middle and is marked members only, it is not left out', () => {
  // Changed 2026-09-19 on the owner's word ("there should be no membership
  // rule or any similar rule, it should just be marked as members only").
  // This asserted that the member price went into `excluded` and that the
  // median of the other two was 1.299. Both numbers below are from
  // `GAUGE_PYTHON_SOURCE` run in local CPython on these three offers.
  const offers = [
    offer({ retailer: 'Costco', price: 8.99, sizeValue: 1, sizeUnit: 'kg', memberOnly: true }),
    offer({ retailer: 'Metro', price: 13.49, sizeValue: 1, sizeUnit: 'kg' }),
    offer({ retailer: 'Loblaws', price: 12.49, sizeValue: 1, sizeUnit: 'kg' }),
  ];
  const g = usable(computeGauge(shelf({ price: 12.99, sizeValue: 1, sizeUnit: 'kg' }), offers));
  assert.equal(g.n, 3);
  assert.equal(g.median, 1.2489999999999999);
  assert.equal(g.percent, 4.003202562049644);
  assert.deepEqual(g.excluded, []);
  const costco = g.points.find((p) => p.retailer === 'Costco');
  assert.deepEqual(costco?.marks, ['member_only']);
  assert.equal(costco?.label, '1 kg · $8.99');
  assert.equal(costco?.position, 3.295970109420878);
  assert.deepEqual(g.points.filter((p) => p.marks.length > 0).map((p) => p.retailer), ['Costco'], 'only the member price carries a mark');
});

/* ------------------------------ rule 4: marketplace sellers and US listings */

test('a US price is excluded and never converted', () => {
  const g = usable(
    computeGauge(shelf({ price: 24.99, sizeValue: 1, sizeUnit: 'each' }), [
      offer({ retailer: 'Canadian Tire', price: 26.99, sizeValue: 1, sizeUnit: 'each', currency: 'CAD' }),
      offer({ retailer: 'Home Depot', price: 23.99, sizeValue: 1, sizeUnit: 'each' }),
      offer({ retailer: 'Target US', price: 14.99, sizeValue: 1, sizeUnit: 'each', currency: 'usd' }),
    ]),
  );
  assert.equal(g.n, 2);
  assert.equal(g.median, 25.49, 'the $14.99 USD never entered the median, at any exchange rate');
  assert.equal(g.percent, -1.9615535504119264);
  const notCad = g.excluded.filter((e) => e.code === 'not_cad');
  assert.deepEqual(retailersOf(notCad), ['Target US']);
  assert.equal(notCad[0].label, '1 each · 14.99 USD', 'the amount is shown with its own currency, never behind a dollar sign');
  assert.doesNotMatch(notCad[0].label, /\$/, 'a dollar sign on a US amount is the misreading this rule exists to prevent');
  assert.equal(notCad[0].note, 'priced in another currency');
  // An absent currency takes the reference currency, which here is the shelf's
  // own (CAD), so Home Depot is on the line beside the one that said CAD outright.
  assert.deepEqual(retailersOf(g.points), ['Canadian Tire', 'Home Depot']);
});

test('a euro shelf prints the euro symbol, and a US price is still excluded under its own code', () => {
  const g = usable(
    computeGauge(shelf({ price: 4.5, sizeValue: 1, sizeUnit: 'each', currency: 'EUR' }), [
      offer({ retailer: 'Shop A', price: 4.2, sizeValue: 1, sizeUnit: 'each', currency: 'EUR' }),
      offer({ retailer: 'Shop B', price: 4.8, sizeValue: 1, sizeUnit: 'each' }),
      offer({ retailer: 'Shop US', price: 3.99, sizeValue: 1, sizeUnit: 'each', currency: 'USD' }),
    ]),
  );
  assert.equal(g.shelfLabel, '1 each · €4.50', 'the shopper’s own currency prints its own symbol');
  assert.deepEqual(retailersOf(g.excluded.filter((e) => e.code === 'not_cad')), ['Shop US']);
  assert.deepEqual(retailersOf(g.points), ['Shop A', 'Shop B']);
  const us = g.excluded.find((e) => e.retailer === 'Shop US');
  assert.equal(us?.label, '1 each · 3.99 USD','a foreign amount carries its code, never a dollar sign');
});

test('a dollar shelf in the US excludes a Canadian price, because neither market is the default', () => {
  const g = usable(
    computeGauge(shelf({ price: 5, sizeValue: 1, sizeUnit: 'each', currency: 'USD' }), [
      offer({ retailer: 'Shop A', price: 4.5, sizeValue: 1, sizeUnit: 'each', currency: 'USD' }),
      offer({ retailer: 'Shop B', price: 5.5, sizeValue: 1, sizeUnit: 'each' }),
      offer({ retailer: 'Shop CA', price: 6.5, sizeValue: 1, sizeUnit: 'each', currency: 'CAD' }),
    ]),
  );
  assert.deepEqual(retailersOf(g.excluded.filter((e) => e.code === 'not_cad')), ['Shop CA']);
  const ca = g.excluded.find((e) => e.retailer === 'Shop CA');
  assert.equal(ca?.label, '1 each · 6.50 CAD');
});

test('with no market at all nothing is excluded on currency and the legacy dollar sign prints', () => {
  const g = usable(
    computeGauge(shelf({ price: 5, sizeValue: 1, sizeUnit: 'each', currency: null }), [
      offer({ retailer: 'Shop A', price: 4.5, sizeValue: 1, sizeUnit: 'each' }),
      offer({ retailer: 'Shop B', price: 5.5, sizeValue: 1, sizeUnit: 'each' }),
      offer({ retailer: 'Shop C', price: 6, sizeValue: 1, sizeUnit: 'each' }),
    ]),
  );
  assert.deepEqual(g.excluded, []);
  assert.equal(g.shelfLabel, '1 each · $5.00');
});

test('a marketplace seller counts in the middle and is marked, it is not left out', () => {
  // Changed 2026-09-19, same ruling as the member price above. It asserted n 2
  // and the seller in `excluded`. The numbers are from `GAUGE_PYTHON_SOURCE`
  // run in local CPython on these three offers.
  const g = usable(
    computeGauge(shelf({ price: 24.99, sizeValue: 1, sizeUnit: 'each' }), [
      offer({ retailer: 'Canadian Tire', price: 26.99, sizeValue: 1, sizeUnit: 'each' }),
      offer({ retailer: 'Home Depot', price: 23.99, sizeValue: 1, sizeUnit: 'each' }),
      offer({ retailer: 'Amazon Seller', price: 19.99, sizeValue: 1, sizeUnit: 'each', marketplace: true }),
    ]),
  );
  assert.equal(g.n, 3);
  assert.equal(g.median, 23.99);
  assert.equal(g.percent, 4.168403501458942);
  assert.deepEqual(g.excluded, []);
  const seller = g.points.find((p) => p.retailer === 'Amazon Seller');
  assert.deepEqual(seller?.marks, ['marketplace']);
  assert.equal(seller?.label, '1 each · $19.99');
  assert.equal(seller?.position, 8.315964985410588);
});

/* ----------------------------------------------------------- interactions */

test('with several reasons available the first one wins, so an offer carries exactly one code', () => {
  // The order is fixed in `exclusionOf`: cannot be paid (wrong currency), then
  // a different product, then cannot be scaled. "Member and USD" is both a
  // member price and a US price; it comes back as not_cad alone (a member
  // price alone would be on the line). The store brand with no size is the
  // brand, not the size.
  const g = usable(
    computeGauge(
      shelf({ price: 6.49, sizeValue: 400, sizeUnit: 'g', organic: true }),
      [
        offer({ retailer: 'On the line', price: 5.99, url: 'x', sizeValue: 400, sizeUnit: 'g', organic: true }),
        offer({
          retailer: 'Member and USD',
          price: 3,
          sizeValue: 400,
          sizeUnit: 'g',
          organic: true,
          memberOnly: true,
          currency: 'USD',
        }),
        offer({ retailer: 'Store brand with no size', price: 2, storeBrand: 'no name', organic: true }),
        offer({
          retailer: 'Two for five',
          price: 11,
          sizeValue: 400,
          sizeUnit: 'g',
          organic: true,
          dealKind: 'multi_buy',
          dealUnits: 2,
        }),
        offer({ retailer: 'Weighed nothing', price: 4, organic: true, soldByWeight: true }),
        offer({ retailer: 'Volume', price: 5, sizeValue: 400, sizeUnit: 'mL', organic: true }),
      ],
      5,
      25,
    ),
  );
  assert.equal(g.n, 2);
  assert.deepEqual(retailersOf(g.points), ['On the line', 'Two for five']);
  assert.equal(g.median, 1.43625);
  assert.equal(g.percent, 12.967798085291559);
  assert.equal(g.zone, 'middle');
  assert.equal(g.zoneUnderBoundary, 43.75);
  assert.equal(g.zoneOverBoundary, 81.25);
  assert.equal(g.points[1].label, '400 g · $5.50 (2 for $11.00)');
  assert.equal(g.points[1].position, 44.6692776327241);
  assert.deepEqual(codesOf(g.excluded), [
    'not_cad',
    'different_brand_kind',
    'unknown_weight',
    'different_dimension',
  ]);
  assert.equal(g.excluded.length, new Set(retailersOf(g.excluded)).size, 'one code per offer, never two rows for one seller');
});

test('when every offer is excluded there is still no verdict, and the list still comes back', () => {
  const g = computeGauge(shelf({ price: 6.49, sizeValue: 400, sizeUnit: 'g' }), [
    offer({ retailer: 'Only USD', price: 3, url: 'z', sizeValue: 400, sizeUnit: 'g', currency: 'USD' }),
  ]);
  assert.equal(g.usable, false);
  assert.equal(g.usable === false && g.dimension, 'mass');
  assert.equal(g.usable === false && g.unitLabel, '100 g');
  assert.deepEqual(g.excluded, [
    {
      retailer: 'Only USD',
      code: 'not_cad',
      note: 'priced in another currency',
      label: '400 g · 3.00 USD',
      url: 'z',
    },
  ]);
});

/* --------------------------------------------------- the codes and the law */

/** One offer per code, so nothing can be added to the list without being swept. */
const EVERY_CODE = computeGauge(shelf({ price: 4, sizeValue: 100, sizeUnit: 'g' }), [
  offer({ retailer: 'On the line', price: 4, sizeValue: 100, sizeUnit: 'g' }),
  offer({ retailer: 'Also on the line', price: 4, sizeValue: 100, sizeUnit: 'g' }),
  offer({ retailer: 'Not CAD', price: 4, sizeValue: 100, sizeUnit: 'g', currency: 'USD' }),
  offer({ retailer: 'Marketplace', price: 4, sizeValue: 100, sizeUnit: 'g', marketplace: true }),
  offer({ retailer: 'Member', price: 4, sizeValue: 100, sizeUnit: 'g', memberOnly: true }),
  offer({ retailer: 'Store brand', price: 4, sizeValue: 100, sizeUnit: 'g', storeBrand: 'no name' }),
  offer({ retailer: 'Organic', price: 4, sizeValue: 100, sizeUnit: 'g', organic: true }),
  offer({ retailer: 'No size', price: 4 }),
  offer({ retailer: 'Other measure', price: 4, sizeValue: 100, sizeUnit: 'mL' }),
  offer({ retailer: 'Unweighed', price: 4, soldByWeight: true }),
]);

test('one offer per code produces all six of them, in the order the offers arrived', () => {
  const g = usable(EVERY_CODE);
  // The marketplace and member offers are no longer among them: they are on
  // the line beside the two plain offers, each carrying its mark.
  assert.equal(g.n, 4);
  assert.deepEqual(g.points.map((p) => [p.retailer, p.marks]), [
    ['On the line', []],
    ['Also on the line', []],
    ['Marketplace', ['marketplace']],
    ['Member', ['member_only']],
  ]);
  assert.deepEqual(codesOf(g.excluded), [
    'not_cad',
    'different_brand_kind',
    'different_organic',
    'no_size',
    'different_dimension',
    'unknown_weight',
  ]);
});

test('the note is a function of the code alone, so a client holding only the code can say it in French', () => {
  const byCode = new Map<string, string>();
  for (const e of EVERY_CODE.excluded) {
    const seen = byCode.get(e.code);
    if (seen === undefined) byCode.set(e.code, e.note);
    else assert.equal(e.note, seen, `two notes for ${e.code}: a code that needs the offer to be read is not translatable`);
  }
  // Nothing of the offer leaks into the note: no retailer name, no amount.
  for (const e of EVERY_CODE.excluded) {
    assert.doesNotMatch(e.note, /\d/, `${e.code}: a number in the note means the note carries the offer, not the code`);
    assert.doesNotMatch(e.note, /\$/, `${e.code}: a price in the note is a price the client cannot re-render`);
  }
});

/**
 * The grading-word list.
 *
 * Copied here 2026-09-19 from `app/test/refusal-swaps.test.mjs`'s own
 * `GRADING_WORDS`, which this file used to read off disk so the two could not
 * drift. That file was deleted the same day: its whole subject, the
 * refusal-path substitute offer, went with `fillCheaper`
 * (`app/public/js/screens/camera.js`), which the server can no longer trigger
 * (every scan is one Gemini call now). This sweep is about `computeGauge`'s
 * own exclusion codes and notes, never about that retired feature, so the
 * list moves here rather than disappearing with the file it borrowed it from.
 *
 * "au-dessus" ON ITS OWN IS NOT ON THE LIST, and leaving it off is a decision
 * rather than an oversight. The French for a parent swap is "une catégorie
 * au-dessus": one category up, a statement about how WIDE a claim is, not
 * about whether a price is high. What is forbidden is the price reading,
 * "au-dessus du prix", so that is what is listed.
 */
function gradingWords(): string[] {
  const GRADING_WORDS = {
    en: [
      'good', 'fair', 'high', 'higher', 'walk away', 'deal', 'cheap', 'cheaper',
      'expensive', 'overpriced', 'steal', 'steep', 'bargain', 'rip-off', 'ripoff',
      'robbery', 'over the usual', 'under the usual',
    ],
    fr: [
      'cher', 'chère', 'chers', 'chères', 'bon prix', 'aubaine', 'salé', 'salée',
      'élevé', 'élevée', 'rabais', 'vol', 'volent', 'laisse faire',
      'au-dessus du prix', 'en dessous du prix',
    ],
  };
  return [...GRADING_WORDS.en, ...GRADING_WORDS.fr];
}

/** The same boundaried matcher that file uses, so "prononcer" is not a hit on "cher". */
const boundaried = (word: string) =>
  new RegExp(`(^|[^\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu');

test('the sweep can actually see a grading word', () => {
  // A canary. A list that was empty, or a regex that matched nothing, would
  // pass the sweep below while proving nothing at all about it.
  const words = gradingWords();
  assert.ok(words.length >= 25, `only ${words.length} grading words, expected the full list`);
  for (const canary of ['deal', 'cheap', 'expensive', 'cher', 'aubaine']) {
    assert.ok(words.includes(canary), `"${canary}" missing: the parse dropped part of the list`);
  }
  assert.match('that is a deal', boundaried('deal'));
  assert.doesNotMatch('I cannot pronounce it', boundaried('cher'));
});

test('no exclusion code and no note grades a price, in either language', () => {
  // Hard rule 2 and the founder's 2026-09-14 ruling. An exclusion says a
  // neutral fact about an offer. The codes, notes and every label these
  // rules render are all swept.
  const words = gradingWords();
  const strings: string[] = [];
  for (const e of EVERY_CODE.excluded) strings.push(e.code, e.note, e.label, e.retailer);
  // The two marks travel as codes on the points and are swept the same way.
  for (const p of usable(EVERY_CODE).points) strings.push(...p.marks);
  strings.push('members only', 'marketplace seller', 'only one price found, so the middle is that price');

  // The two suffixes the multi-item rule renders, which are the strings most
  // at risk of reaching for the banned word.
  const withSuffixes = usable(
    computeGauge(shelf({ price: 2.99, sizeValue: 500, sizeUnit: 'g' }), [
      offer({ retailer: 'Sobeys', price: 5, sizeValue: 500, sizeUnit: 'g', dealKind: 'multi_buy', dealUnits: 2 }),
      offer({ retailer: 'Food Basics', price: 5.98, sizeValue: 500, sizeUnit: 'g', dealKind: 'bogo' }),
    ]),
  );
  for (const p of withSuffixes.points) strings.push(p.label);

  for (const s of strings) {
    for (const word of words) {
      assert.doesNotMatch(s, boundaried(word), `"${word}" appears in a rendered string: ${s}`);
    }
  }
  assert.ok(strings.length > 30, 'the sweep swept almost nothing, which is not a pass');
});

/* ------------------------------------------------------------------ *
 * The narrowest point, which moved on 2026-09-15.
 *
 * It used to be VERDICT_SCHEMA: the `response_format` of a second, code-
 * executing grounded call that turned the prices into a verdict. That call
 * was dead (nothing in the app ever reached it) and rule 1 forbids a second
 * call for one scan, so it and its schema are gone, and the two tests that
 * guarded that schema went with them.
 *
 * TWO NARROW POINTS REPLACE IT, and both are live:
 *   - PRICES_SCHEMA, now the ONLY `response_format` this app ever sends, so a
 *     grading word asked for there is still a word that comes back; and
 *   - `priceLineFor`, which is where `computeGauge`'s `excluded` rows and its
 *     neutral `zone` actually reach a screen. A field missing there is a rule
 *     computed and dropped, which is what the old test was really about.
 * ------------------------------------------------------------------ */

/**
 * The adapter's source, with CRLF normalised away. The slices below hunt for
 * a newline-brace-semicolon-newline delimiter that does not exist in a file
 * checked out with CRLF endings, so without this the slice ran to end-of-file
 * and swept the whole adapter -- including an ordinary comment containing
 * "cheap" -- instead of the schema literal. D-110.
 */
function groundedSource(): string {
  return readFileSync(
    new URL('../src/providers/gemini-grounded.ts', import.meta.url),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

test('the one schema this app sends asks for no grading word, in either language', () => {
  const src = groundedSource();
  const start = src.indexOf('const PRICES_SCHEMA');
  assert.ok(start > 0, 'PRICES_SCHEMA is gone, so this test is guarding nothing');
  const end = src.indexOf('\n};\n', start);
  assert.ok(end > start, 'the schema literal has no end delimiter: the slice would sweep the whole file');
  const schema = src.slice(start, end);
  assert.ok(schema.length < 4000, 'the slice swept past the schema literal');
  // The same list the rest of this file sweeps, read off disk so the two
  // cannot drift, and the same boundaried matcher, which treats the quote
  // around a schema enum value as the boundary it is.
  for (const word of gradingWords()) {
    assert.doesNotMatch(
      schema,
      boundaried(word),
      `PRICES_SCHEMA asks Gemini to answer with "${word}", and a word asked for is a word that comes back`,
    );
  }
});

test('the price line carries the fields the four item rules travel in', () => {
  // `excluded` is how a US listing and a different brand kind reach a reader,
  // and `marks` on the points is how a member-only price and a marketplace
  // seller do. Without them on the line they are computed and dropped.
  const line = priceLineFor(
    { askingCents: 299, sizeValue: 500, sizeUnit: 'g', currency: 'CAD' },
    shownOffers([
      { retailer: 'Loblaws', price: 3.49, url: null, sizeValue: 500, sizeUnit: 'g' },
      { retailer: 'Metro', price: 3.49, url: null, sizeValue: 500, sizeUnit: 'g' },
      { retailer: 'Costco', price: 1.99, url: null, sizeValue: 500, sizeUnit: 'g', memberOnly: true },
      { retailer: 'Target', price: 2.1, url: null, sizeValue: 500, sizeUnit: 'g', currency: 'USD' },
    ]),
  );
  assert.ok(line, 'no line at all, so no rule reached anybody');
  const codes = line.excluded.map((e) => e.code).sort();
  assert.deepEqual(codes, ['not_cad']);
  assert.deepEqual(
    line.points.filter((p) => p.marks.length > 0).map((p) => [p.retailer, p.marks]),
    [['Costco', ['member_only']]],
    'the member price is on the line and marked, and reaches the client that way',
  );
  for (const e of line.excluded) assert.ok(e.code !== '', 'an exclusion without a code cannot be said in French');
  // The zone the shopper set, in the gauge's own neutral words.
  assert.ok(['under_your_line', 'middle', 'over_your_line'].includes(line.shelf.zone));
});
