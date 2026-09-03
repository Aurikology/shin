/**
 * ONE VERDICT SENTENCE PER CATEGORY, not one screen.
 *
 * This is the finding the hand pilot produced on 2026-09-03 and it is the reason
 * this file exists instead of a single global comparison. The four served
 * categories are asking four different questions:
 *
 *   grocery   — regular against this week's promotion (two lines, never averaged)
 *   tech      — against other retailers
 *   used      — against live comparable asking prices, which lean high
 *   furniture — against its own history, because a POÄNG has no second seller
 *
 * produce is present and unserved. That is a recorded call with a reversing
 * condition, not an omission — see `unsupported` below.
 *
 * Thresholds here are judgment with the reasoning written beside them. None of
 * them is benchmark-backed and none should be quoted as if it were. They were
 * chosen before the corpus was run, which is the only property that makes them
 * honest, and the first one the scoreboard contradicts should move.
 */

import type {
  CategoryId,
  Disagreement,
  PriceKind,
  PricePoint,
  Tier,
} from './contract.ts';
import { cad, max, median, min, percentile, ratio } from './money.ts';

export interface JudgeInput {
  /** The price being judged, in cents. */
  readonly askingCents: number;
  /** Usable points only, already filtered for kind and staleness, asking point excluded. */
  readonly points: readonly PricePoint[];
  readonly asOf: string;
}

export interface JudgeOutput {
  readonly tier: Tier;
  readonly lines: readonly string[];
  readonly disagreement: Disagreement | null;
}

export interface CategoryRule {
  readonly id: CategoryId;
  readonly label: string;
  /** Set when we decline the whole category. Carries why, and what reverses it. */
  readonly unsupported?: { readonly why: string; readonly reversedBy: string };
  /** Below this, identity is not good enough to price against. */
  readonly identityFloor: number;
  /** Kinds that count toward the minimums. `list` is never in here. */
  readonly usableKinds: readonly PriceKind[];
  readonly minPoints: number;
  readonly minDistinctSellers: number;
  /** The newest point must be no older than this, or the set is stale. */
  readonly maxAgeDays: number;
  /** Points older than this are dropped outright. Only furniture looks back far. */
  readonly historyWindowDays: number;
  /** One line explaining the thresholds above, shown in `shin explain`. */
  readonly reasoning: string;
  readonly judge: (input: JudgeInput) => JudgeOutput;
}

/** Same-kind spread past this is not a market, it is a broken comparison set. */
const INCOHERENT_RATIO = 8;
/** Spread past this is real but needs saying out loud rather than averaging away. */
const WIDE_SPREAD_RATIO = 2;

function sellersOf(points: readonly PricePoint[]): string[] {
  return [...new Set(points.map((p) => p.seller))];
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

/** Wide-spread detection shared by every category. Grocery adds its own on top. */
function spreadDisagreement(points: readonly PricePoint[]): Disagreement | null {
  if (points.length < 2) return null;
  const lo = min(amounts(points));
  const hi = max(amounts(points));
  const r = ratio(hi, lo);
  if (r < WIDE_SPREAD_RATIO) return null;
  return {
    kind: 'wide_spread',
    detail: `Prices for the same thing run ${cad(lo)} to ${cad(hi)} right now. That is a ${r}x spread, so there is no single right price to quote.`,
    lowCents: lo,
    highCents: hi,
    ratio: r,
  };
}

/** True when a set is so wide that any one verdict from it would be a lie. */
export function isIncoherent(points: readonly PricePoint[]): boolean {
  for (const kind of new Set(points.map((p) => p.kind))) {
    const same = ofKind(points, kind);
    if (same.length < 2) continue;
    if (ratio(max(amounts(same)), min(amounts(same))) >= INCOHERENT_RATIO) return true;
  }
  return false;
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
  reasoning:
    'Seven days because grocery promotions turn over weekly: one 225g box of Kraft Dinner moved 3.6x inside a single week and every number in that swing was real. Two sellers minimum because one store is not a comparison.',
  judge({ askingCents, points }) {
    const regular = ofKind(points, 'regular');
    const promo = ofKind(points, 'promotional');
    const best = cheapest(points);
    const regularMedian = regular.length > 0 ? median(amounts(regular)) : null;

    let tier: Tier;
    if (askingCents <= Math.round(best.amountCents * 1.02)) {
      tier = 'good';
    } else if (
      (regularMedian !== null && askingCents > Math.round(regularMedian * 1.1)) ||
      askingCents > Math.round(best.amountCents * 1.5)
    ) {
      tier = 'walk_away';
    } else {
      tier = 'fair';
    }

    // Two lines, always in this order. The regular line is the one that is true
    // next week too; the promotional line is the one that makes someone move.
    const lines: string[] = [];
    if (regularMedian !== null) {
      lines.push(
        `Regular price is about ${cad(regularMedian)} across ${sellersOf(regular).length} store${sellersOf(regular).length === 1 ? '' : 's'}. You are looking at ${cad(askingCents)}.`,
      );
    } else {
      lines.push(
        `No regular shelf price found — everything below is a promotion. You are looking at ${cad(askingCents)}.`,
      );
    }
    if (promo.length > 0) {
      const bestPromo = cheapest(promo);
      lines.push(
        `This week it is ${cad(bestPromo.amountCents)} at ${bestPromo.seller}${bestPromo.limit ? ` (${bestPromo.limit})` : ''}.`,
      );
    } else {
      lines.push('Nothing on promotion anywhere we can see this week.');
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
          lowCents: promoLow,
          highCents: regHigh,
          ratio: r,
        };
      }
    }

    return { tier, lines, disagreement };
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
  reasoning:
    'Three days and three retailers because this is the best-served category and there is no excuse for a thin set: one comparison service already covers 32 Canadian retailers. Manufacturer list price is excluded on purpose — the pilot returned $429.99 list for the WH-1000XM5 and zero live retailer prices, and list alone is not a comparison.',
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
  reasoning:
    'Identity floor is the highest of any category because the pilot\'s single worst failure was here: a used Canon EOS R6 search returned an R6 Mark II bundled with lenses at nearly triple, and every price attached to it was accurate. Four listings across two marketplaces, and the reference is the 25th percentile rather than the median, because asking prices are what sellers hope for and lean high by construction.',
  judge({ askingCents, points }) {
    const sold = ofKind(points, 'sold');
    // A sold price beats any number of asking prices. It is the only kind here
    // that records what someone was actually willing to pay.
    const basis = sold.length >= 2 ? sold : points;
    const vals = amounts(basis);
    const p25 = percentile(vals, 25);
    const mid = median(vals);
    const tier: Tier =
      askingCents <= p25 ? 'good' : askingCents <= mid ? 'fair' : askingCents > Math.round(mid * 1.15) ? 'walk_away' : 'fair';
    const lo = min(amounts(points));
    const hi = max(amounts(points));
    const basisWord = sold.length >= 2 ? 'what these actually sold for' : 'asking prices, not sales — sellers start high';
    return {
      tier,
      lines: [
        `Comparable listings run ${cad(lo)} to ${cad(hi)}, clustering around ${cad(p25)} to ${cad(mid)}. You are looking at ${cad(askingCents)}. These are ${basisWord}.`,
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
  reasoning:
    'The obstacle is not data, it is that there is no second seller, so the verdict is price against its own history rather than against other stores. Five points over a year because a rolling promotion needs a baseline to be visible against, and IKEA promotions never appear on the product page — which is precisely what makes this worth showing.',
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
      disagreement: spreadDisagreement(points),
    };
  },
};

const PRODUCE: CategoryRule = {
  id: 'produce',
  label: 'Fresh produce',
  unsupported: {
    why: 'Three problems stack and none of them is solved by a better feed. A PLU names a category rather than a product (4011 has meant "bananas" since 1990), package formats break unit comparison, and the public series measures underlying inflation rather than what is on the shelf this week. Shopper-reported shelf prices are the only source here, not a supplement to one.',
    reversedBy:
      'Crowdsourced shelf-price volume in one city reaching the point where a produce item has two independent reports more often than not. That is band 2.3, and produce is the first thing promoted if it survives.',
  },
  identityFloor: 0.95,
  usableKinds: ['regular', 'promotional'],
  minPoints: 4,
  minDistinctSellers: 3,
  maxAgeDays: 3,
  historyWindowDays: 7,
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
