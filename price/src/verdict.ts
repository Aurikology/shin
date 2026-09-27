/**
 * Is this a good price. Decisions 31 through 37.
 *
 * This file takes observations and returns a verdict. It knows nothing about
 * where the observations came from, which is deliberate: the feed will be
 * replaced at least once, and the rules about what may be claimed from a given
 * amount of evidence must not be replaced with it.
 *
 * REWRITTEN 2026-09-05, on his correction. His words: the accuracy-first
 * posture "impeeds so much of our design", and OLMA, which answers every time,
 * is the better product.
 *
 * The rule that is gone: two sellers minimum before any verdict. Twenty-one
 * refusals were counted across the design and not one of them carried his
 * words; they all descend from a line a previous session wrote, not him. So the
 * default flips. There is always a verdict when there is anything to compare
 * against, and the doubt is carried by a confidence number beside it instead of
 * by a blank space where the answer should be.
 *
 * The one thing kept: the direction of the verdict is arithmetic, computed
 * here, never asked of a model. Telling someone a price is good when it is not
 * is the only mistake on the screen that makes them spend money, and it is the
 * only one they cannot undo by looking again.
 *
 * THE THREE RULES THAT STILL COST SOMETHING
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
 * The age of the contributing evidence is on screen (34). Not in a tooltip, not
 * "recently". Grocery prices move weekly and a four week old number is a
 * different claim from a yesterday one. The number shown, and the number
 * staleness is judged on, is the NEWEST contributing observation: a verdict is
 * only stale when even its freshest evidence is old, and the sentence a shopper
 * reads has always said "the newest price is over three weeks old". D-061: this
 * used to measure the oldest number while printing that sentence, so one fresh
 * price beside an old one was reported as stale and penalised for it.
 */

import { unitPriceCents } from '../../catalogue/src/units.ts';

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
  /**
   * How sure we are this row is about this product. `exact` means the seller
   * published the barcode. `likely` means brand, name and size lined up and
   * nobody published a barcode to prove it, which is every Loblaws row.
   * Defaults to exact so existing callers are unchanged.
   */
  readonly joinQuality?: 'exact' | 'likely';
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
   * Null only when there is genuinely nothing to compare against: no shelf
   * price, or no observation of any kind. One seller is enough for a tier now.
   * The doubt lives in `confidence`, not in a missing answer.
   */
  readonly tier: Tier | null;
  /**
   * Zero to one. How much the tier is worth, from how many sellers agree, how
   * old the numbers are, and whether they were matched by barcode or by name.
   * Shown beside the verdict, never used to suppress it.
   */
  readonly confidence: number;
  /** The short reasons behind the confidence, in the user's words, for the detail row. */
  readonly confidenceBasis: readonly string[];
  /** Decision 33: at most one of each, never merged. */
  readonly regular: Band | null;
  readonly promotional: Band | null;
  /**
   * ISO date of the NEWEST number contributing to anything above, which is the
   * date staleness and `ageInWords` are both taken from. D-061.
   */
  readonly newestObservedAt: string | null;
  /** Decision 34, already in words: "seen 3 days ago". The newest number's age. */
  readonly ageInWords: string | null;
  /** The one sentence to show. Written here so no screen can improvise one. */
  readonly line: string;
  /** Why there is no tier, in the rare case there is none. Never blank when tier is null. */
  readonly withheldBecause: string | null;
}

/**
 * What each piece of evidence is worth.
 *
 * These replace the old minimum-seller gate. One seller no longer stops a
 * verdict; it produces a verdict worth about half of what three sellers buy.
 */
const CONF_BY_SELLERS: Record<number, number> = { 1: 0.5, 2: 0.7, 3: 0.82 };
const CONF_MANY_SELLERS = 0.9;
/** A price nobody has re-checked in three weeks is worth less than a fresh one. */
const CONF_STALE_PENALTY = 0.15;
/** Judged against sale prices because no regular price exists at all. */
const CONF_PROMO_ONLY_PENALTY = 0.2;
/** At least one contributing number was matched by name, not by barcode. */
const CONF_LIKELY_JOIN_PENALTY = 0.1;

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

/**
 * The unit price, with the arithmetic matched to the label it prints.
 *
 * D-061. The old body ran `(cents / sizeValue) * 100` for every unit and then
 * chose a label, which is right only when the size is already in the base unit
 * the label names. A 12-pack at $5.99 printed "$49.92 per each", a hundred
 * times the true 49.9 cents, and a 2 kg bag priced per 100 g came out a
 * thousand times over. The multiplier now belongs to the unit, not to the
 * function: `ea` is per one, kilograms and litres are converted to their base
 * unit first, and anything unrecognised is treated as grams, which is what the
 * old fallthrough did and what the feeds actually send.
 */
/*
 * ITEM 20, 2026-09-19. The table that used to live here (`UNIT_SCALE`) is now
 * `catalogue/src/units.ts`, the one conversion the alternatives read as well, so
 * the verdict and the alternatives cannot disagree about a kilogram again.
 * `catalogue/test/units-markets.test.ts` drives this very `judge` against that
 * table for every unit this file used to know (ea, g, ml, kg, l).
 *
 * THE UNKNOWN-UNIT CASE CHANGED, ON PURPOSE. The old body treated any unit it did
 * not recognise as GRAMS ("what the feeds actually send"). A pack of "12 sheets"
 * or "2 kit" then printed a price per 100 g, a confident number about a quantity
 * nobody measured, and calibration outranks completeness in this repo. An
 * unrecognised unit now gives NO unit price (`unit` is null, so `unitCents` and
 * `unitLabel` are null) and the verdict rests on the shelf-price band as it does
 * when no size is recorded at all. The table also knows more spellings than the
 * old one (oz, lb, fl oz, litre, kilogram, count...), so a size the old code
 * mislabelled as grams is now converted properly rather than dropped.
 * Reverses if a feed is found sending a unit that means grams and is not in the
 * table: add it there, once.
 */
function unitOf(cents: number, sizeValue: number, sizeUnit: string) {
  const per = unitPriceCents(cents, sizeValue, sizeUnit);
  return per === null ? null : { unitCents: per.unitCents, unitLabel: per.label };
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
  // D-061. The freshest contributing number, not the oldest: the confidence
  // sentence this feeds says "the newest price is over three weeks old", so
  // that is the number it has to be measuring.
  const newest =
    contributing.length === 0
      ? null
      : contributing.reduce((a, b) => (a.observedAt >= b.observedAt ? a : b)).observedAt;

  // Regular prices are the yardstick when they exist. When they do not, sale
  // prices are used rather than nothing, at a confidence penalty, because "a
  // sale price is all anyone is showing" is still information about what this
  // costs and a blank screen is not.
  const basis = regular ?? promotional;
  const judgedOnPromoOnly = regular === null && promotional !== null;

  // The only two cases left with no tier: nothing to compare against, and
  // nothing to compare. Neither is a judgement call, both are arithmetic.
  if (!basis) {
    return {
      tier: null,
      confidence: 0,
      confidenceBasis: ['nobody we read is selling this'],
      regular,
      promotional,
      newestObservedAt: newest,
      ageInWords: newest ? ageInWords(newest, now) : null,
      line: 'Nobody we can see is selling this right now.',
      withheldBecause: 'no price from any seller we read',
    };
  }

  if (input.shelfCents === null) {
    return {
      tier: null,
      confidence: 0,
      confidenceBasis: ['no price to judge'],
      regular,
      promotional,
      newestObservedAt: newest,
      ageInWords: newest ? ageInWords(newest, now) : null,
      line:
        basis.cheapestCents === basis.dearestCents
          ? `${basis.cheapestSeller} has this at ${money(basis.cheapestCents)}.`
          : `Others sell this from ${money(basis.cheapestCents)} at ${basis.cheapestSeller} ` +
            `to ${money(basis.dearestCents)} at ${basis.dearestSeller}.`,
      withheldBecause: 'we could not read the price on the shelf tag',
    };
  }

  // D-045, 2026-09-08. When the band has zero width (one seller or multiple sellers
  // agreeing), the position is forced to 0, making every price read as though it sat
  // at the bottom of a range that has no low end (RULINGS.md, "Judge and gauge
  // mechanics"). Instead, compare the asking price directly to that number. The confidence stays
  // unchanged. Wording depends on seller count: with one, "the only price we have";
  // with more, "what every seller charges".
  const isZeroBand = basis.cheapestCents === basis.dearestCents;
  let tier: Tier;
  if (isZeroBand) {
    // For a single-point band, compare the price directly
    if (input.shelfCents === basis.cheapestCents) {
      tier = 'fair'; // The price matches exactly
    } else if (input.shelfCents < basis.cheapestCents) {
      tier = 'good'; // The price is below
    } else {
      tier = 'high'; // The price is above
    }
  } else {
    const pos = basis.position ?? 0;
    tier = pos <= GOOD_BELOW ? 'good' : pos >= HIGH_ABOVE ? 'high' : 'fair';
  }

  const stale = newest !== null && daysBetween(newest, now) >= STALE_DAYS;
  const anyLikely = contributing.some((o) => o.joinQuality === 'likely');
  const conf = confidenceOf(basis.sellerCount, stale, judgedOnPromoOnly, anyLikely);

  // Every sentence names a real number at a named seller. Decision 32: there is
  // no average anywhere in this string.
  const zeroBandPhrase =
    basis.sellerCount === 1
      ? 'the only price we have'
      : 'what every seller charges';

  const head =
    tier === 'good'
      ? isZeroBand
        ? `${money(input.shelfCents)} is less than ${zeroBandPhrase}.`
        : `${money(input.shelfCents)} is at the low end.`
      : tier === 'fair'
        ? isZeroBand
          ? `${money(input.shelfCents)} matches ${zeroBandPhrase}.`
          : `${money(input.shelfCents)} is about what others charge.`
        : isZeroBand
          ? `${money(input.shelfCents)} is more than ${zeroBandPhrase}.`
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
    confidence: conf.value,
    confidenceBasis: conf.basis,
    regular,
    promotional,
    newestObservedAt: newest,
    ageInWords: newest ? ageInWords(newest, now) : null,
    line: `${head} ${compare}${unitPart}${promoPart}`,
    withheldBecause: null,
  };
}

/**
 * What the verdict is worth, and why, in words a shopper can read.
 *
 * This is the thing that replaced the refusal. The old design's answer to thin
 * evidence was to say nothing; this one says the answer and says how much to
 * trust it. Every reason is a fact about the evidence, never a hedge.
 */
export function confidenceOf(
  sellerCount: number,
  stale: boolean,
  promoOnly: boolean,
  likelyJoin = false,
): { value: number; basis: readonly string[] } {
  const basis: string[] = [];
  let value = CONF_BY_SELLERS[sellerCount] ?? CONF_MANY_SELLERS;
  basis.push(
    sellerCount === 1 ? 'one seller' : `${Math.min(sellerCount, 9)} sellers agree on the range`,
  );
  if (stale) {
    value -= CONF_STALE_PENALTY;
    basis.push('the newest price is over three weeks old');
  }
  if (promoOnly) {
    value -= CONF_PROMO_ONLY_PENALTY;
    basis.push('only sale prices to compare against');
  }
  if (likelyJoin) {
    value -= CONF_LIKELY_JOIN_PENALTY;
    basis.push('one seller matched by name, not barcode');
  }
  return { value: Math.max(0.1, Math.min(1, Number(value.toFixed(2)))), basis };
}
