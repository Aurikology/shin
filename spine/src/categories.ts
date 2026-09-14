/**
 * ONE VERDICT SENTENCE PER CATEGORY, not one screen.
 *
 * This is the finding the hand pilot produced on 2026-09-03 and it is the reason
 * this file exists instead of a single global comparison. The four served
 * categories are asking four different questions:
 *
 *   grocery  , regular against this week's promotion (two lines, never averaged)
 *   tech     , against other retailers
 *   used     , against live comparable asking prices, which lean high
 *   furniture, against its own history, because a POÄNG has no second seller
 *
 * produce is present and unserved. That is a recorded call with a reversing
 * condition, not an omission, see `unsupported` below.
 *
 * Thresholds here are judgment with the reasoning written beside them. None of
 * them is benchmark-backed and none should be quoted as if it were. They were
 * chosen before the corpus was run, which is the only property that makes them
 * honest, and the first one the scoreboard contradicts should move.
 */

import type {
  CategoryId,
  CategoryReasonCode,
  Disagreement,
  Fact,
  PriceKind,
  PricePoint,
  StructuredText,
  Tier,
} from './contract.ts';
import { say } from './contract.ts';
import { cad, max, median, min, percentile, ratio } from './money.ts';
import { sellerIdentity } from './sources/source.ts';

export interface JudgeInput {
  /** The price being judged, in cents. */
  readonly askingCents: number;
  /** Usable points only, already filtered for kind and staleness, asking point excluded. */
  readonly points: readonly PricePoint[];
  readonly asOf: string;
  /** The category's own minimum, so a judge can hold a narrower basis to it. */
  readonly minPoints: number;
}

export interface JudgeOutput {
  readonly tier: Tier;
  readonly lines: readonly string[];
  /**
   * `lines` as codes and raw facts, same order, one entry each. Beta-plan item
   * 31: the French interface cannot exist while the only output is an English
   * sentence with the counts and the currency already baked in. Every rule
   * below emits both, and `test/structured-prose.test.ts` rebuilds the English
   * from the facts and asserts it matches byte for byte.
   */
  readonly structuredLines: readonly StructuredText[];
  readonly disagreement: Disagreement | null;
}

export interface CategoryRule {
  readonly id: CategoryId;
  readonly label: string;
  /**
   * Set when we decline the whole category. Carries why, and what reverses it.
   *
   * `why` and `reversedBy` are English prose owned by this file, written for a
   * reader deciding whether the call still holds. `whyCode` and `whyFacts` are
   * the same call as a code plus the raw numbers the paragraph interpolates,
   * and they exist because the refusal sentence ships to a French client:
   * `spine.ts` puts all three on `refusal_category_not_served`, the frame
   * translates, and a renderer keyed on `whyCode` can rebuild the reason in its
   * own language instead of passing the English through. Both are required, so
   * a new declined category cannot be added without one.
   */
  readonly unsupported?: {
    readonly why: string;
    readonly whyCode: CategoryReasonCode;
    /** Raw. Counts as numbers, years as numbers, codes as the source spells them. */
    readonly whyFacts: Readonly<Record<string, Fact>>;
    readonly reversedBy: string;
  };
  /** Below this, identity is not good enough to price against. */
  readonly identityFloor: number;
  /** Kinds that count toward the minimums. `list` is never in here. */
  readonly usableKinds: readonly PriceKind[];
  readonly minPoints: number;
  readonly minDistinctSellers: number;
  /**
   * How old a point may be and still set the tier.
   *
   * Applied to EVERY tiering point, not only the newest. Checking the newest
   * alone let one fresh row keep a month-old set alive, and the cheapest price
   * in it, long dead, set the bar the shopper was sent to chase.
   */
  readonly maxAgeDays: number;
  /** Points older than this are dropped outright. Only furniture looks back far. */
  readonly historyWindowDays: number;
  /**
   * True where the comparison IS the history, so old points are the evidence
   * rather than a staleness problem. Furniture only, because it is the only
   * category with no second seller.
   */
  readonly historyBased: boolean;
  /**
   * Whether a spread across different price KINDS is expected here.
   *
   * Grocery's whole design is regular against promotional, so its contamination
   * check runs within a kind. Everywhere else a set that spans kinds wildly is
   * two products, and the check runs across the whole set.
   */
  readonly mixedKindsExpected: boolean;
  /** One line explaining the thresholds above, shown in `shin explain`. */
  readonly reasoning: string;
  readonly judge: (input: JudgeInput) => JudgeOutput;
}

/** Spread past this is real but needs saying out loud rather than averaging away. */
const WIDE_SPREAD_RATIO = 2;
/** Below this the set is tight enough that no single point can be dominating it. */
const CONTAMINATION_FLOOR_RATIO = 2;
/**
 * If dropping one extreme point at least halves the spread, that point was
 * carrying the disagreement rather than participating in it.
 */
const CONTAMINATION_COLLAPSE = 2;
/** Fewer than this and dropping one point is not evidence of anything. */
const CONTAMINATION_MIN_POINTS = 3;
/**
 * An empty multiplicative gap this wide between two adjacent listings means the
 * set spans two products. Set well above the widest real spread measured here
 * (a used POÄNG's neighbouring listings jump at most 2x) so it fires on shape
 * rather than on a number tuned to one example.
 */
const CONTAMINATION_GAP = 4;

// Counted on the identity key (D-081), so a store arriving under two feed
// spellings is not announced to the shopper as two stores, and two branches of
// one chain under one display name are not announced as one. Both callers use
// this for a COUNT; the names a shopper reads come off `p.seller` directly.
function sellersOf(points: readonly PricePoint[]): string[] {
  return [...new Set(points.map((p) => sellerIdentity(p)))];
}

function amounts(points: readonly PricePoint[]): number[] {
  return points.map((p) => p.amountCents);
}

function ofKind(points: readonly PricePoint[], ...kinds: PriceKind[]): PricePoint[] {
  return points.filter((p) => kinds.includes(p.kind));
}

function cheapest(points: readonly PricePoint[]): PricePoint {
  return points.reduce((a, b) => (b.amountCents < a.amountCents ? b : a));
}

/**
 * Wide-spread detection shared by every category. Grocery adds its own on top.
 *
 * Exported 2026-09-08 so the spine's thin-evidence answer can raise the same
 * disagreement the category rules raise. That path bypasses `CategoryRule.judge`
 * by construction, and a wide spread is a fact about the prices rather than a
 * category's opinion about them, so it must not go missing just because the
 * category never got to speak.
 */
export function spreadDisagreement(points: readonly PricePoint[]): Disagreement | null {
  if (points.length < 2) return null;
  const lo = min(amounts(points));
  const hi = max(amounts(points));
  const r = ratio(hi, lo);
  if (r < WIDE_SPREAD_RATIO) return null;
  return {
    kind: 'wide_spread',
    detail: `Prices for the same thing run ${cad(lo)} to ${cad(hi)} right now. That is a ${r}x spread, so there is no single right price to quote.`,
    structuredDetail: say('disagreement_wide_spread', {
      lowCents: lo,
      highCents: hi,
      currency: 'CAD',
      ratio: r,
    }),
    lowCents: lo,
    highCents: hi,
    ratio: r,
  };
}

/**
 * True when a set is so wide that any one verdict from it would be a lie.
 *
 * This is NOT a ratio threshold, and that is the point. A used POÄNG genuinely
 * spans 4.5x on live marketplaces and must still get an answer, while the
 * pilot's Canon failure spanned only 3x and must not. No single cutoff separates
 * those two, so any number picked here would be fitted to whichever case was
 * looked at last.
 *
 * What actually distinguishes them is SHAPE. The Canon set is one true listing
 * plus a cluster of a different camera: drop the outlier and the spread
 * collapses to nothing. The POÄNG set is a real distribution: drop either end
 * and it is still wide. So the test is whether one point is carrying the
 * disagreement rather than taking part in it.
 */
function groupIsContaminated(values: readonly number[]): boolean {
  if (values.length < CONTAMINATION_MIN_POINTS) return false;
  const s = [...values].sort((a, b) => a - b);
  const full = ratio(s[s.length - 1], s[0]);
  if (full < CONTAMINATION_FLOOR_RATIO) return false;

  // Case one: a lone outlier. Drop either end; if the spread collapses, that
  // point was carrying the disagreement rather than taking part in it.
  const withoutLowest = ratio(s[s.length - 1], s[1]);
  const withoutHighest = ratio(s[s.length - 2], s[0]);
  if (Math.min(withoutLowest, withoutHighest) <= full / CONTAMINATION_COLLAPSE) return true;

  // Case two: two balanced clusters, which the outlier test cannot see because
  // dropping one point from a group of four still leaves three. What gives it
  // away is empty space: a fourfold jump between two adjacent listings of the
  // same product is not a market, it is two products in one set.
  for (let i = 1; i < s.length; i += 1) {
    if (ratio(s[i], s[i - 1]) >= CONTAMINATION_GAP) return true;
  }
  return false;
}

export function isIncoherent(points: readonly PricePoint[], mixedKindsExpected: boolean): boolean {
  const groups: number[][] = mixedKindsExpected
    ? [...new Set(points.map((p) => p.kind))].map((kind) => amounts(ofKind(points, kind)))
    : [amounts(points)];
  return groups.some(groupIsContaminated);
}

const GROCERY: CategoryRule = {
  id: 'grocery',
  label: 'Groceries and household',
  identityFloor: 0.8,
  usableKinds: ['regular', 'promotional'],
  minPoints: 2,
  minDistinctSellers: 2,
  maxAgeDays: 7,
  historyWindowDays: 14,
  historyBased: false,
  mixedKindsExpected: true,
  reasoning:
    'Seven days because grocery promotions turn over weekly: one 225g box of Kraft Dinner moved 3.6x inside a single week and every number in that swing was real. Two sellers minimum because one store is not a comparison.',
  judge({ askingCents, points }) {
    const regular = ofKind(points, 'regular');
    const promo = ofKind(points, 'promotional');
    const regularMedian = regular.length > 0 ? median(amounts(regular)) : null;

    // A capped promotion is not an offer the shopper can act on at scale, so it
    // informs the second line and never sets the bar. Letting it set the bar
    // called Walmart's own regular price a walk-away, because a limit-8 loss
    // leader at a different chain had moved the goalposts.
    const attainable = [...regular, ...promo.filter((p) => p.limit === undefined)];
    const goodBar = attainable.length > 0 ? min(amounts(attainable)) : min(amounts(points));
    /*
     * EVERY PRICE WE HOLD IS A CAPPED PROMOTION, which is the one case the
     * paragraph above did not actually cover.
     *
     * `attainable` being empty makes `goodBar` fall back to the whole set,
     * caps included, and with no regular price the walk-away test runs off
     * that bar. So the rule that a capped promotion never sets the bar held
     * everywhere except where it was the only thing there was. Measured:
     * a limit-8 loss leader at $0.55 and a limit-4 at $0.60 called a $1.47 tag
     * WALK AWAY -- D-003's shape, from the guard written to prevent it.
     *
     * A cap is a statement that the shop will not sell you this at that price
     * beyond a handful. Tiering off it tells somebody a normal shelf price is
     * a ripoff because a rival ran a doorbuster. Nothing here is comparable,
     * so the honest answer is `fair` plus a line saying what we actually have.
     * The `good` direction is left alone: a price at or under a loss leader is
     * genuinely a good price, and saying so misleads nobody.
     */
    const onlyCapped = attainable.length === 0 && regularMedian === null;

    let tier: Tier;
    if (askingCents <= Math.round(goodBar * 1.02)) {
      tier = 'good';
    } else if (regularMedian !== null && askingCents > Math.round(regularMedian * 1.1)) {
      tier = 'walk_away';
    } else if (regularMedian === null && !onlyCapped && askingCents > Math.round(goodBar * 1.5)) {
      // No regular price anywhere, so the UNCAPPED promotions are the only
      // baseline there is. Capped ones cannot reach here; see `onlyCapped`.
      tier = 'walk_away';
    } else {
      tier = 'fair';
    }

    // Two lines, always in this order. The regular line is the one that is true
    // next week too; the promotional line is the one that makes someone move.
    const lines: string[] = [];
    const structuredLines: StructuredText[] = [];
    if (regularMedian !== null) {
      // One store is not an average, and saying "about" over a single
      // observation invents a spread that was never measured.
      const regularStores = sellersOf(regular).length;
      lines.push(
        regularStores === 1
          ? `Regular price is ${cad(regularMedian)} at the one store carrying it. You are looking at ${cad(askingCents)}.`
          : `Regular price is about ${cad(regularMedian)} across ${regularStores} stores. You are looking at ${cad(askingCents)}.`,
      );
      // Two codes rather than one plus a count, because the two sentences make
      // DIFFERENT CLAIMS: one states a price that was observed, the other
      // reports a typical value across a spread. That is a meaning split, not
      // an English number split, so it survives translation.
      structuredLines.push(
        regularStores === 1
          ? say('regular_price_at_sole_store', {
              regularCents: regularMedian,
              currency: 'CAD',
              askingCents,
            })
          : say('regular_price_across_stores', {
              regularCents: regularMedian,
              currency: 'CAD',
              storeCount: regularStores,
              askingCents,
            }),
      );
    } else {
      lines.push(
        onlyCapped
          ? `Every price I have for this is a limited promotion, so there is nothing here I can fairly call a going rate. You are looking at ${cad(askingCents)}.`
          : `No regular shelf price found, everything below is a promotion. You are looking at ${cad(askingCents)}.`,
      );
      structuredLines.push(
        say(onlyCapped ? 'all_prices_are_capped_promotions' : 'no_regular_price_only_promotions', {
          askingCents,
          currency: 'CAD',
        }),
      );
    }
    if (promo.length > 0) {
      const bestPromo = cheapest(promo);
      lines.push(
        `This week it is ${cad(bestPromo.amountCents)} at ${bestPromo.seller}${bestPromo.limit ? ` (${bestPromo.limit})` : ''}.`,
      );
      // `limit` is the retailer's own words off the feed ("limit 8"), carried
      // through rather than re-expressed: it is source data, not our prose, and
      // this package has nothing to translate it from.
      structuredLines.push(
        say('best_promotion_this_week', {
          promotionalCents: bestPromo.amountCents,
          currency: 'CAD',
          seller: bestPromo.seller,
          // Matching the truthiness above, not `?? null`: an empty `limit`
          // prints no bracket today and must carry no cap fact either.
          limit: bestPromo.limit ? bestPromo.limit : null,
        }),
      );
    } else {
      lines.push('Nothing on promotion anywhere we can see this week.');
      structuredLines.push(say('no_promotion_this_week'));
    }

    let disagreement = spreadDisagreement(points);
    if (disagreement === null && regular.length > 0 && promo.length > 0) {
      const regHigh = max(amounts(regular));
      const promoLow = min(amounts(promo));
      const r = ratio(regHigh, promoLow);
      if (r >= 1.5) {
        disagreement = {
          kind: 'regular_vs_promotional',
          detail: `The gap here is the promotion, not the store: ${cad(promoLow)} on sale against ${cad(regHigh)} regular is a ${r}x difference on the same box.`,
          structuredDetail: say('disagreement_promotion_not_store', {
            promotionalCents: promoLow,
            regularCents: regHigh,
            currency: 'CAD',
            ratio: r,
          }),
          lowCents: promoLow,
          highCents: regHigh,
          ratio: r,
        };
      }
    }

    return { tier, lines, structuredLines, disagreement };
  },
};

const TECH: CategoryRule = {
  id: 'tech',
  label: 'New tech',
  identityFloor: 0.85,
  usableKinds: ['regular', 'promotional'],
  minPoints: 3,
  minDistinctSellers: 3,
  maxAgeDays: 3,
  historyWindowDays: 30,
  historyBased: false,
  mixedKindsExpected: false,
  reasoning:
    'Three days and three retailers because this is the best-served category and there is no excuse for a thin set: one comparison service already covers 32 Canadian retailers. Manufacturer list price is excluded on purpose, the pilot returned $429.99 list for the WH-1000XM5 and zero live retailer prices, and list alone is not a comparison.',
  judge({ askingCents, points }) {
    const best = cheapest(points);
    const tier: Tier =
      askingCents <= Math.round(best.amountCents * 1.02)
        ? 'good'
        : askingCents <= Math.round(best.amountCents * 1.08)
          ? 'fair'
          : 'walk_away';
    const sellers = sellersOf(points).length;
    return {
      tier,
      lines: [
        `${sellers} retailers have it. Cheapest is ${cad(best.amountCents)} at ${best.seller}. You are looking at ${cad(askingCents)}.`,
      ],
      structuredLines: [
        say('cheapest_of_retailers_carrying_it', {
          retailerCount: sellers,
          cheapestCents: best.amountCents,
          cheapestSeller: best.seller,
          currency: 'CAD',
          askingCents,
        }),
      ],
      disagreement: spreadDisagreement(points),
    };
  },
};

const USED: CategoryRule = {
  id: 'used',
  label: 'Used goods',
  identityFloor: 0.9,
  usableKinds: ['asking', 'sold'],
  minPoints: 4,
  minDistinctSellers: 2,
  maxAgeDays: 30,
  historyWindowDays: 90,
  historyBased: false,
  mixedKindsExpected: false,
  reasoning:
    'Identity floor is the highest of any category because the pilot\'s single worst failure was here: a used Canon EOS R6 search returned an R6 Mark II bundled with lenses at nearly triple, and every price attached to it was accurate. Four listings across two marketplaces, and the reference is the 25th percentile rather than the median, because asking prices are what sellers hope for and lean high by construction.',
  judge({ askingCents, points, minPoints }) {
    const sold = ofKind(points, 'sold');
    // A sold price beats any number of asking prices. It is the only kind here
    // that records what someone was actually willing to pay.
    //
    // But it has to clear the same bar as everything else. At two, a pair of
    // "for parts, not working" completed listings replaced eight live ones and
    // sent a $900 body to walk-away off a $1.35 basis, while the confidence line
    // still boasted eight points.
    const basis = sold.length >= minPoints ? sold : points;
    const vals = amounts(basis);
    const p25 = percentile(vals, 25);
    /*
     * TWO NUMBERS, ON PURPOSE, AND THE SPLIT IS THE POINT.
     *
     * `mid` is shown to a shopper, so it is a price somebody actually asked:
     * `median` returns the lower of two middles for exactly that reason, the
     * same rule `percentile` obeys one line up.
     *
     * `bandCentre` is never shown. It is the centre this rule's ladder was
     * calibrated against, and on an even count it sits between the two middles
     * rather than on the lower one. Using the displayed median for it instead
     * moves verdicts: on the corpus's own POÄNG case -- asking prices of $35,
     * $60, $120 and $159 -- an $80 tag goes from `fair` to `walk_away`, because
     * the ceiling drops from $90 to $60 on nothing but the parity of the list.
     * A market that wide should not be called a ripoff at its own middle.
     *
     * Whether this ladder SHOULD be tighter is a real question and not this
     * function's to answer: the rule's own reasoning says asking prices lean
     * high, which is an argument for reading lower. It is written up as an open
     * decision rather than changed here as a side effect of a display fix.
     */
    const mid = median(vals);
    const sorted = [...vals].sort((a, b) => a - b);
    const half = sorted.length >> 1;
    const bandCentre =
      sorted.length % 2 === 1 ? sorted[half]! : Math.round((sorted[half - 1]! + sorted[half]!) / 2);
    const tier: Tier =
      askingCents <= p25
        ? 'good'
        : askingCents <= bandCentre
          ? 'fair'
          : askingCents > Math.round(bandCentre * 1.15)
            ? 'walk_away'
            : 'fair';
    const lo = min(amounts(points));
    const hi = max(amounts(points));
    const basisWord =
      basis === sold ? 'what these actually sold for' : 'asking prices, not sales, and sellers start high';
    return {
      tier,
      lines: [
        `Comparable listings run ${cad(lo)} to ${cad(hi)}, clustering around ${cad(p25)} to ${cad(mid)}. You are looking at ${cad(askingCents)}. These are ${basisWord}.`,
      ],
      structuredLines: [
        // `basis` is a fact, not two codes: the clause it selects is a caveat
        // about the evidence, and a locale may place it anywhere in the
        // sentence or drop it into a footnote.
        say('comparable_listings_range', {
          lowCents: lo,
          highCents: hi,
          clusterLowCents: p25,
          clusterHighCents: mid,
          currency: 'CAD',
          askingCents,
          basis: basis === sold ? 'sold' : 'asking',
        }),
      ],
      disagreement: spreadDisagreement(points),
    };
  },
};

const FURNITURE: CategoryRule = {
  id: 'furniture',
  label: 'New furniture',
  identityFloor: 0.85,
  usableKinds: ['regular', 'promotional'],
  minPoints: 5,
  // One seller is the whole point here. Nobody else sells a POÄNG.
  minDistinctSellers: 1,
  maxAgeDays: 21,
  historyWindowDays: 365,
  historyBased: true,
  mixedKindsExpected: false,
  reasoning:
    'The obstacle is not data, it is that there is no second seller, so the verdict is price against its own history rather than against other stores. Five points over a year because a rolling promotion needs a baseline to be visible against, and IKEA promotions never appear on the product page, which is precisely what makes this worth showing.',
  judge({ askingCents, points, asOf }) {
    const vals = amounts(points);
    const lo = min(vals);
    const mid = median(vals);
    const lowest = cheapest(points);
    const tier: Tier =
      askingCents <= Math.round(lo * 1.02)
        ? 'good'
        : askingCents <= mid
          ? 'fair'
          : 'walk_away';
    const when = lowest.observedAt.slice(0, 10);
    void asOf;
    return {
      tier,
      lines: [
        `Only one seller, so this is against its own history: as low as ${cad(lo)} on ${when}, usually about ${cad(mid)}. You are looking at ${cad(askingCents)}.`,
      ],
      structuredLines: [
        // The date goes out as ISO. English prints it as `YYYY-MM-DD` today;
        // a locale renderer is the layer that gets to decide otherwise.
        say('own_price_history_single_seller', {
          lowestCents: lo,
          lowestObservedOn: when,
          typicalCents: mid,
          currency: 'CAD',
          askingCents,
        }),
      ],
      disagreement: spreadDisagreement(points),
    };
  },
};

const PRODUCE: CategoryRule = {
  id: 'produce',
  label: 'Fresh produce',
  unsupported: {
    why: 'Three problems stack and none of them is solved by a better feed. A PLU names a category rather than a product (4011 has meant "bananas" since 1990), package formats break unit comparison, and the public series measures underlying inflation rather than what is on the shelf this week. Shopper-reported shelf prices are the only source here, not a supplement to one.',
    whyCode: 'produce_no_shelf_price_source',
    // Every number the paragraph above states, raw, so a renderer writes the
    // same reason in its own grammar rather than translating ours. `plu` is a
    // string because it is an identifier printed as four digits, not a quantity.
    whyFacts: {
      problemCount: 3,
      plu: '4011',
      pluMeaning: 'bananas',
      pluInUseSince: 1990,
    },
    reversedBy:
      'Crowdsourced shelf-price volume in one city reaching the point where a produce item has two independent reports more often than not. That is band 2.3, and produce is the first thing promoted if it survives.',
  },
  identityFloor: 0.95,
  usableKinds: ['regular', 'promotional'],
  minPoints: 4,
  minDistinctSellers: 3,
  maxAgeDays: 3,
  historyWindowDays: 7,
  historyBased: false,
  mixedKindsExpected: false,
  reasoning: 'Unserved. The thresholds are recorded for the day it is promoted, and nothing calls judge().',
  judge() {
    throw new Error('produce is unsupported; the spine refuses before reaching judge()');
  },
};

export const CATEGORY_RULES: Readonly<Record<CategoryId, CategoryRule>> = {
  grocery: GROCERY,
  tech: TECH,
  used: USED,
  furniture: FURNITURE,
  produce: PRODUCE,
};

export function ruleFor(category: CategoryId): CategoryRule {
  return CATEGORY_RULES[category];
}
