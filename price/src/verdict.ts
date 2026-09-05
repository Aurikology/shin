/**
 * Is this a good price. Decisions 31 through 37.
 *
 * This file takes observations and returns a verdict. It knows nothing about
 * where the observations came from, which is deliberate: the feed will be
 * replaced at least once, and the rules about what may be claimed from a given
 * amount of evidence must not be replaced with it.
 *
 * THE FOUR RULES THAT COST SOMETHING
 *
 * Two sellers minimum (31). One seller's price is that seller's price. Calling
 * it "a good deal" from a single number is the single easiest way to be
 * confidently wrong in front of somebody holding a jar.
 *
 * Never an average (32, marked a reversal in the plan). An average of four
 * sellers is a number that exists nowhere and that nobody can check. The
 * cheapest price is a real number at a real named seller, the range is real,
 * and where this price sits inside that range is the actual question. This
 * reverses the obvious design, which is why it is written down.
 *
 * Regular and promotional never mix (33). A sale price averaged into a regular
 * range makes the regular range look cheaper than it will be next week.
 *
 * The age of the oldest contributing number is on screen (34). Not in a
 * tooltip, not "recently". Grocery prices move weekly and a four week old
 * number is a different claim from a yesterday one.
 */

export type PriceKind = 'regular' | 'promotional';

export interface Observation {
  readonly seller: string;
  readonly amountCents: number;
  readonly kind: PriceKind;
  /** ISO date, the day the number was seen. */
  readonly observedAt: string;
  /** Pre-tax, always. Decision 36. Set false and it is dropped, not corrected. */
  readonly preTax: boolean;
  /** Size in the product's base unit, when known, for the unit price. */
  readonly sizeValue?: number | null;
  readonly sizeUnit?: string | null;
}

export type Tier = 'good' | 'fair' | 'high';

export interface Band {
  readonly kind: PriceKind;
  readonly sellerCount: number;
  readonly cheapestCents: number;
  readonly cheapestSeller: string;
  readonly dearestCents: number;
  readonly dearestSeller: string;
  /** Where the price being judged sits, 0 at the cheapest and 1 at the dearest. */
  readonly position: number | null;
  /** Cents per 100 base units, when the size is known. Decision 37. */
  readonly unitCents: number | null;
  readonly unitLabel: string | null;
}

export interface Verdict {
  /**
   * Null below minimum evidence. Decision 35: we show the going rate with no
   * tier rather than dress one data point up as a judgement.
   */
  readonly tier: Tier | null;
  /** Decision 33: at most one of each, never merged. */
  readonly regular: Band | null;
  readonly promotional: Band | null;
  /** ISO date of the oldest number contributing to anything above. */
  readonly oldestObservedAt: string | null;
  /** Decision 34, already in words: "seen 3 days ago". */
  readonly ageInWords: string | null;
  /** The one sentence to show. Written here so no screen can improvise one. */
  readonly line: string;
  /** Why there is no tier, when there is none. Never blank when tier is null. */
  readonly withheldBecause: string | null;
}

/** Decision 31. Below this there is a going rate but never a verdict. */
const MIN_SELLERS = 2;

/** Cheapest third is good, dearest third is high. Thirds, not a mean. */
const GOOD_BELOW = 1 / 3;
const HIGH_ABOVE = 2 / 3;

/**
 * Past this the number is described as old rather than dated. Decision 34's
 * "past a threshold it is described as old rather than dated" clause.
 */
const STALE_DAYS = 21;

function daysBetween(iso: string, now: Date): number {
  const then = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

/** Decision 34. Plain words, no dates a shopper has to subtract from today. */
export function ageInWords(iso: string, now = new Date()): string {
  const d = daysBetween(iso, now);
  if (!Number.isFinite(d)) return 'from an unknown date';
  if (d <= 0) return 'seen today';
  if (d === 1) return 'seen yesterday';
  if (d < 7) return `seen ${d} days ago`;
  if (d < 14) return 'seen last week';
  if (d < STALE_DAYS) return `seen ${Math.floor(d / 7)} weeks ago`;
  if (d < 60) return 'over three weeks old';
  return 'months old';
}

export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function unitOf(cents: number, sizeValue: number, sizeUnit: string) {
  return {
    unitCents: (cents / sizeValue) * 100,
    unitLabel: sizeUnit === 'ml' ? '100 ml' : sizeUnit === 'ea' ? 'each' : '100 g',
  };
}

/**
 * One price per seller. A retailer listing the same product three times is one
 * seller's opinion, not three, and counting it as three is how a two-seller
 * floor gets crossed without any new evidence.
 */
function cheapestPerSeller(obs: readonly Observation[]): Observation[] {
  const best = new Map<string, Observation>();
  for (const o of obs) {
    const prev = best.get(o.seller);
    if (!prev || o.amountCents < prev.amountCents) best.set(o.seller, o);
  }
  return [...best.values()];
}

function bandOf(
  obs: readonly Observation[],
  kind: PriceKind,
  subject: number | null,
  sizeValue: number | null,
  sizeUnit: string | null,
): Band | null {
  const rows = cheapestPerSeller(obs.filter((o) => o.kind === kind && o.preTax));
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => a.amountCents - b.amountCents);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];

  const span = hi.amountCents - lo.amountCents;
  const position =
    subject === null ? null : span === 0 ? 0 : (subject - lo.amountCents) / span;

  const unit =
    sizeValue && sizeUnit && subject !== null ? unitOf(subject, sizeValue, sizeUnit) : null;

  return {
    kind,
    sellerCount: sorted.length,
    cheapestCents: lo.amountCents,
    cheapestSeller: lo.seller,
    dearestCents: hi.amountCents,
    dearestSeller: hi.seller,
    position,
    unitCents: unit?.unitCents ?? null,
    unitLabel: unit?.unitLabel ?? null,
  };
}

export interface VerdictInput {
  /** The price on the shelf in front of the user, pre-tax, in cents. */
  readonly shelfCents: number | null;
  readonly observations: readonly Observation[];
  readonly sizeValue?: number | null;
  readonly sizeUnit?: string | null;
  readonly now?: Date;
}

export function judge(input: VerdictInput): Verdict {
  const now = input.now ?? new Date();
  const size = input.sizeValue ?? null;
  const unit = input.sizeUnit ?? null;

  // Decision 36. A post-tax number cannot be repaired into a pre-tax one
  // without knowing the province and the product's tax status, so it is
  // dropped and its absence is what shows.
  const usable = input.observations.filter((o) => o.preTax);

  const regular = bandOf(usable, 'regular', input.shelfCents, size, unit);
  const promotional = bandOf(usable, 'promotional', input.shelfCents, size, unit);

  const contributing = usable.filter(
    (o) => (regular && o.kind === 'regular') || (promotional && o.kind === 'promotional'),
  );
  const oldest =
    contributing.length === 0
      ? null
      : contributing.reduce((a, b) => (a.observedAt <= b.observedAt ? a : b)).observedAt;

  // The tier is judged against regular prices only. A shelf price that beats a
  // promotional low is a fine thing and it is not a claim about what this
  // product normally costs.
  const basis = regular;

  if (!basis || basis.sellerCount < MIN_SELLERS) {
    const going = basis
      ? `${money(basis.cheapestCents)} at ${basis.cheapestSeller}`
      : promotional
        ? `${money(promotional.cheapestCents)} at ${promotional.cheapestSeller}, on sale`
        : null;
    return {
      tier: null,
      regular,
      promotional,
      oldestObservedAt: oldest,
      ageInWords: oldest ? ageInWords(oldest, now) : null,
      // Decision 35: the going rate with no tier. The sentence says what we
      // have, not what we think.
      line: going
        ? `One seller has this at ${going}. Not enough to say whether that is good.`
        : 'Nobody we can see is selling this right now.',
      withheldBecause:
        basis === null
          ? 'no regular price from any seller we read'
          : `only ${basis.sellerCount} seller${basis.sellerCount === 1 ? '' : 's'}, and a verdict needs ${MIN_SELLERS}`,
    };
  }

  if (input.shelfCents === null) {
    return {
      tier: null,
      regular,
      promotional,
      oldestObservedAt: oldest,
      ageInWords: oldest ? ageInWords(oldest, now) : null,
      line:
        `Others sell this from ${money(basis.cheapestCents)} at ${basis.cheapestSeller} ` +
        `to ${money(basis.dearestCents)} at ${basis.dearestSeller}.`,
      withheldBecause: 'we could not read the price on the shelf tag',
    };
  }

  const pos = basis.position ?? 0;
  const tier: Tier = pos <= GOOD_BELOW ? 'good' : pos >= HIGH_ABOVE ? 'high' : 'fair';

  // Every sentence names a real number at a named seller. Decision 32: there is
  // no average anywhere in this string.
  const head =
    tier === 'good'
      ? `${money(input.shelfCents)} is at the low end.`
      : tier === 'fair'
        ? `${money(input.shelfCents)} is about what others charge.`
        : `${money(input.shelfCents)} is at the high end.`;

  const compare =
    basis.cheapestCents === basis.dearestCents
      ? `${basis.cheapestSeller} has it at ${money(basis.cheapestCents)} too.`
      : `${basis.cheapestSeller} has it at ${money(basis.cheapestCents)}, ` +
        `${basis.dearestSeller} at ${money(basis.dearestCents)}.`;

  const unitPart =
    basis.unitCents !== null && basis.unitLabel !== null
      ? ` That is ${money(basis.unitCents)} per ${basis.unitLabel}.`
      : '';

  const promoPart =
    promotional && promotional.cheapestCents < basis.cheapestCents
      ? ` ${promotional.cheapestSeller} has it on sale at ${money(promotional.cheapestCents)}.`
      : '';

  return {
    tier,
    regular,
    promotional,
    oldestObservedAt: oldest,
    ageInWords: oldest ? ageInWords(oldest, now) : null,
    line: `${head} ${compare}${unitPart}${promoPart}`,
    withheldBecause: null,
  };
}
