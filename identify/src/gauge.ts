/**
 * The price gauge's placement arithmetic for size-variant goods (groceries,
 * household, anything sold by mass, volume or count), in two languages that
 * must stay identical.
 *
 * WHY THIS FILE IS SHAPED SO STRANGELY, and it is the whole reason it exists:
 * Google's Grounding with Google Search terms forbid us to "cache, frame,
 * syndicate, resell, analyze, train on, or otherwise learn from Grounded
 * Results". Taking a median of prices Google's search returned, on our own
 * server, is analysis. The same terms allow grounded text to be resubmitted
 * "to obtain a refined or improved Grounded Result to display to the end
 * user". So the arithmetic below runs inside GEMINI'S OWN code-execution
 * sandbox, on Gemini's side of the network call, never here.
 *
 * That gives three artifacts in this file that must agree:
 *
 *   1. `GAUGE_PYTHON_SOURCE` -- the exact Python text Gemini is asked to run,
 *      unchanged, as one fixed constant. Fixed, not generated per call, so
 *      that there is something stable to compare against afterwards.
 *   2. `computeGauge` -- a TypeScript twin of that Python.
 *      *** IT MUST NEVER BE RUN ON A REAL GROUNDED PRICE. ***
 *      *** RUNNING IT ON A GROUNDED PRICE WOULD BE THIS APP ANALYZING A ***
 *      *** GROUNDED RESULT, THE ONE THING THE TERMS FORBID. ***
 *      It exists ONLY so the algorithm can be proven against fake numbers in
 *      `test/gauge.test.ts` before it is ever trusted inside a prompt.
 *   3. `codeMatchesGauge` -- a whitespace-insensitive comparison of the code
 *      Gemini actually executed against `GAUGE_PYTHON_SOURCE`. A mismatch
 *      means NO VERDICT AT ALL: the caller shows prices and reviews alone.
 *
 * The two implementations are kept in lockstep BY HAND, not generated from
 * one source, because they run on opposite sides of a network call. Every
 * numeric expectation in the test file was produced by actually running the
 * Python and compared against the TypeScript, because a previous session
 * hand-typed an expected line and it was wrong.
 *
 * WHY THE ZONES CARRY CODES AND NOT WORDS. The founder's ruling, 2026-09-14:
 * the words on the zones name the range the USER set, never Shin's judgment
 * of the price. Hard rule 2 (Competition Act s.74.01(1)(b)) forbids an
 * unmeasured performance claim, and four test files fail the build if a
 * grading word appears outside a real verdict. So this file returns
 * `'under_your_line' | 'middle' | 'over_your_line'` and nothing else. An
 * earlier, reverted version of this algorithm returned the literal words
 * 'good' / 'reasonable' / 'bad'; that is exactly what must not come back.
 * Turning a code into words is a different lane's job, in the client.
 *
 * WHY A MEDIAN AND NEVER AN AVERAGE: `price/src/verdict.ts`'s header has the
 * argument. An average of four sellers is a number that exists nowhere and
 * that nobody can check against a shelf.
 *
 * THE ALGORITHM, in order:
 *   0. Reduce every offer to its EFFECTIVE price per item (a 2 for $5 is
 *      $2.50 each, a buy one get one is half), then scale every offer and the
 *      shelf item to one base unit per dimension (mass to g, volume to mL,
 *      count stays each), pack count multiplying, then to a unit price: per
 *      100 g, per 100 mL, or per item.
 *   1. median of those unit prices.
 *   2. pct = (unit price - median) / median * 100, for every offer and for
 *      the shelf price.
 *   3. span = ceil(max(max |pct|, 1.5*under, 1.5*over) / 5) * 5.
 *   4. position = 50 + pct / span * 50, so the median sits at 50 and the
 *      line runs 0 to 100.
 *   5. Zone boundaries at 50 - under/span*50 and 50 + over/span*50.
 *   6. Ticks every 5 points, every 10 when span > 30.
 *   7. The zone code the shelf price falls in.
 *   8. Every offer that is not on the line is returned in `excluded` with a
 *      stable CODE saying why.
 *
 * ============================================================================
 * THE FOUR AWKWARD ITEM KINDS, and why each one is an exclusion rather than
 * an adjustment. The founder picked these four of twelve on 2026-09-14; the
 * other eight stay written in `docs/plan-gemini.md` section 7 and unbuilt.
 * ============================================================================
 *
 * ONE MECHANISM, NOT FOUR. Each rule below is a reason an offer is not on the
 * line, which is what `excluded` already means, so each one adds a code to
 * that one list instead of a parallel list of its own. A client that wants
 * "the member prices, listed separately" filters `excluded` on the code. The
 * code is what travels: the note beside it is English and the client has to
 * say it in French, so the note is a function of the code alone and never of
 * the offer, which is what makes the code a complete substitute for it.
 *
 * THE CODES ARE FACTS ABOUT THE OFFER AND NEVER A JUDGMENT OF THE PRICE.
 * `app/test/refusal-swaps.test.mjs` carries the list of words that grade a
 * price, in both languages, and `test/item-rules.test.ts` reads that list off
 * disk and sweeps every code and every note against it. "deal" is on that
 * list, so `dealKind` is an internal field name and no rendered string uses
 * the word.
 *
 * 1. SOLD BY WEIGHT (produce, meat, deli, bulk). An offer priced per kg or
 *    per lb already scales, because the size fields carry the weight the
 *    price is for. What does not scale is a TOTAL price for a variable
 *    weight that nobody wrote down: the shopper's package is some unknown
 *    number of grams, so there is no unit price to place. That offer is
 *    excluded as `unknown_weight` rather than guessed at. Organic and
 *    non-organic are kept apart (`different_organic`) because they are two
 *    products at two prices, and mixing them moves the median for both.
 *
 * 2. STORE BRANDS (Great Value, President's Choice, Kirkland, no name,
 *    Compliments). One chain sells each, so a President's Choice price is
 *    not a price for the thing in a shopper's hand unless the thing in their
 *    hand IS President's Choice. `storeBrand` names the brand rather than
 *    flagging it, so that "same store brand" is answerable: an offer is on
 *    the line only when its store brand matches the shelf item's, with a
 *    name brand being the absence of one. Anything else is
 *    `different_brand_kind`.
 *
 * 3. DEALS AND MEMBER PRICES. What a shopper compares is the effective price
 *    per item, so `dealKind` and `dealUnits` are divided out BEFORE any
 *    scaling: 2 for $5 places at $2.50, and the label still says what the
 *    till will charge. A MEMBER price is different in kind and goes off the
 *    line as `member_only`: a price that needs a membership the shopper may
 *    not have is not a price they can act on, and leaving it in the median
 *    moves the middle for everybody, including the shoppers who cannot reach
 *    it.
 *
 * 4. MARKETPLACE SELLERS AND US LISTINGS. `marketplace` is a price from a
 *    seller on a retailer's site rather than from the retailer, and
 *    `currency` is what the price is actually in. Both are off the line
 *    (`marketplace`, `not_cad`) and neither is converted. AN EXCHANGE RATE IS
 *    A GUESS ABOUT A NUMBER THE SHOPPER WOULD ACTUALLY BE CHARGED, and Shin
 *    does not guess about money. The first line of defence is the request
 *    itself: `providers/gemini-grounded.ts` asks for Canadian retailers and
 *    CAD only, and these two codes are the second.
 *
 * A KNOWN AND ACCEPTED CONSEQUENCE of step 3: one extreme unit price
 * inflates `span` for every other point too, so an outlier compresses the
 * rest of the gauge toward the middle rather than being clipped. That is the
 * specified formula run exactly as given, and `test/gauge.test.ts` asserts
 * it rather than smoothing it away.
 *
 * DETERMINISM IS A REQUIREMENT, not a nicety. `codeMatchesGauge` only proves
 * the SOURCE matched. A nondeterministic function would let two calls for the
 * same product return two different scales while both passing the check, so
 * there is no iteration over an unordered set, no clock, no randomness, and
 * no dependency outside the Python standard library. The sandbox salts string
 * hashing per process, so `EXCLUSION_NOTES`, `MASS_TO_G` and the rest are
 * INDEXED and never iterated, and `excluded` is built by appending in the
 * order the offers arrived. Gemini's sandbox also installs nothing and stops
 * at 30 seconds.
 */

/** Mass, volume and count never mix on one line: 500 g and 500 mL are not comparable quantities. */
export type GaugeDimension = 'mass' | 'volume' | 'count';

/**
 * A neutral placement code. NOT a word a shopper reads, and deliberately not
 * one: 'under_your_line' says the price fell below the percentage THE USER
 * set, and says nothing about whether that is a good price. The client turns
 * these into words.
 */
export type GaugeZone = 'under_your_line' | 'middle' | 'over_your_line';

/**
 * Why one offer is not on the line. A fact about the offer, never a reading
 * of its price, and stable enough to key a translation off.
 */
export type GaugeExclusionCode =
  | 'no_size'
  | 'different_dimension'
  | 'unknown_weight'
  | 'member_only'
  | 'marketplace'
  | 'not_cad'
  | 'different_brand_kind'
  | 'different_organic';

/**
 * How a multi-item price is advertised, so the effective per-item price can
 * be worked out. An internal field name only: the word "deal" grades a price
 * and never reaches a rendered string. Anything unrecognised leaves the price
 * alone, because inventing a divisor for a promotion nobody parsed would
 * place a dot at a price that does not exist.
 */
export type GaugeDealKind = 'multi_buy' | 'bogo' | 'clearance';

export interface GaugeSize {
  readonly sizeValue: number | null;
  readonly sizeUnit: string | null;
  readonly packCount?: number | null;
  /**
   * Priced by weight at the till (produce, deli, bulk). It changes nothing
   * when the weight IS given, which is the common case; it only distinguishes
   * "no weight was written down" from "no size at all" when it is missing.
   */
  readonly soldByWeight?: boolean | null;
  /** Organic and non-organic are two products at two prices, so they never share a line. */
  readonly organic?: boolean | null;
  /**
   * The store brand's name, e.g. "President's Choice", or absent for a name
   * brand. A name rather than a boolean because "is this the SAME store
   * brand" is the question the line has to answer.
   */
  readonly storeBrand?: string | null;
}

export interface GaugeShelfItem extends GaugeSize {
  readonly price: number;
}

export interface GaugeOffer extends GaugeSize {
  readonly retailer: string;
  readonly price: number;
  readonly url: string | null;
  /** What the price is in. Absent means CAD, which is what the request asked for. */
  readonly currency?: string | null;
  /** A seller on the retailer's site rather than the retailer. */
  readonly marketplace?: boolean | null;
  /** Needs a paid membership, so it is not a price every shopper can pay. */
  readonly memberOnly?: boolean | null;
  readonly dealKind?: GaugeDealKind | string | null;
  /** The count in a "n for $x", so 2 in a 2 for $5. Ignored unless `dealKind` is 'multi_buy'. */
  readonly dealUnits?: number | null;
}

export interface GaugeTick {
  readonly pct: number;
  readonly position: number;
  readonly label: string;
}

export interface GaugePoint {
  readonly retailer: string;
  readonly position: number;
  readonly url: string | null;
  /** Quantity and price as sold, e.g. "6 x 355 mL · $4.49". Never the unit price, which only places the dot. */
  readonly label: string;
}

/**
 * One offer that is not on the line.
 *
 * `label` and `url` are here so the labelled lists a client shows (the member
 * prices, the listings in another currency) can be rendered off this one list
 * without a second mechanism carrying the same offers twice.
 */
export interface GaugeExcluded {
  readonly retailer: string;
  readonly code: GaugeExclusionCode;
  /** English, and a function of `code` alone. Translate from the code, never from this. */
  readonly note: string;
  readonly label: string;
  readonly url: string | null;
}

export interface GaugeUsable {
  readonly usable: true;
  readonly median: number;
  readonly percent: number;
  readonly zone: GaugeZone;
  readonly n: number;
  readonly dimension: GaugeDimension;
  readonly unitLabel: '100 g' | '100 mL' | 'item';
  readonly shelfPosition: number;
  readonly shelfLabel: string;
  readonly zoneUnderBoundary: number;
  readonly zoneOverBoundary: number;
  readonly points: readonly GaugePoint[];
  readonly excluded: readonly GaugeExcluded[];
  readonly ticks: readonly GaugeTick[];
}

export interface GaugeUnusable {
  readonly usable: false;
  readonly dimension: GaugeDimension | null;
  readonly unitLabel: '100 g' | '100 mL' | 'item' | null;
  readonly excluded: readonly GaugeExcluded[];
}

export type GaugeResult = GaugeUsable | GaugeUnusable;

/**
 * kg, lb, oz to g. Unit keys are lower-cased and stripped of spaces before
 * lookup, so that "fl oz" and "floz" are one key, matching the Python's own
 * normalisation exactly.
 */
const MASS_TO_G: Record<string, number> = { g: 1, kg: 1000, lb: 453.59237, oz: 28.349523125 };
/** L and US customary fl oz to mL. */
const VOLUME_TO_ML: Record<string, number> = { ml: 1, l: 1000, floz: 29.5735295625 };
const COUNT_UNITS = new Set(['each', 'ea', 'unit', 'units', 'count']);

/**
 * The English of each code, INDEXED AND NEVER ITERATED (see the determinism
 * paragraph in the header). One note per code with nothing of the offer in
 * it, so a client holding only the code can render the same sentence in its
 * own language. Every string here is swept against the grading-word list in
 * `app/test/refusal-swaps.test.mjs` by `test/item-rules.test.ts`.
 */
const EXCLUSION_NOTES: Record<GaugeExclusionCode, string> = {
  no_size: 'no size given',
  different_dimension: 'measured a different way',
  unknown_weight: 'sold by weight, with no weight given',
  member_only: 'needs a paid membership',
  marketplace: 'sold by a marketplace seller, not by the retailer',
  not_cad: 'priced in another currency',
  different_brand_kind: 'a different brand',
  different_organic: 'organic and non-organic are not the same product',
};

function dimAndBase(sizeValue: number | null, sizeUnit: string | null): readonly [GaugeDimension, number] | readonly [null, null] {
  if (sizeValue === null || sizeUnit === null) return [null, null];
  const u = sizeUnit.trim().toLowerCase().replace(/\s+/g, '');
  if (u in MASS_TO_G) return ['mass', sizeValue * MASS_TO_G[u]];
  if (u in VOLUME_TO_ML) return ['volume', sizeValue * VOLUME_TO_ML[u]];
  if (COUNT_UNITS.has(u)) return ['count', sizeValue];
  return [null, null];
}

function totalSize(size: GaugeSize): readonly [GaugeDimension, number] | readonly [null, null] {
  const [dim, base] = dimAndBase(size.sizeValue, size.sizeUnit);
  if (dim === null) return [null, null];
  // Python's `pack_count or 1` treats 0 as absent, so this mirrors truthiness
  // rather than `??`, which would keep a nonsensical 0 and divide by zero on
  // one side of the network call but not the other.
  return [dim, base * (size.packCount ? size.packCount : 1)];
}

function unitPriceOf(price: number, dim: GaugeDimension | null, total: number | null): number | null {
  if (dim === null || total === null || total <= 0) return null;
  return dim === 'count' ? price / total : (price / total) * 100;
}

function unitLabelOf(dim: GaugeDimension): '100 g' | '100 mL' | 'item';
function unitLabelOf(dim: GaugeDimension | null): '100 g' | '100 mL' | 'item' | null;
function unitLabelOf(dim: GaugeDimension | null): '100 g' | '100 mL' | 'item' | null {
  if (dim === 'mass') return '100 g';
  if (dim === 'volume') return '100 mL';
  if (dim === 'count') return 'item';
  return null;
}

/**
 * Absent currency is CAD, because that is what the request asked for and
 * because the alternative is excluding every offer that came back from a
 * model that did not fill the field in. An offer that SAYS it is something
 * else is taken at its word.
 */
function currencyOf(offer: GaugeOffer): string {
  const c = offer.currency;
  if (c === null || c === undefined) return 'CAD';
  const t = String(c).trim().toUpperCase();
  return t === '' ? 'CAD' : t;
}

/** A name brand is the ABSENCE of a store brand, so both sides normalise to null. */
function brandKey(size: GaugeSize): string | null {
  const b = size.storeBrand;
  if (b === null || b === undefined) return null;
  const t = String(b).trim().toLowerCase();
  return t === '' ? null : t;
}

/**
 * What one item actually costs, which is the only price worth comparing.
 * An unrecognised `dealKind` leaves the price untouched on purpose: a made-up
 * divisor would place the dot at a price nobody can pay.
 */
function effectivePriceOf(offer: GaugeOffer): number {
  const kind = offer.dealKind;
  if (kind === 'multi_buy') {
    const units = offer.dealUnits;
    return units && units > 1 ? offer.price / units : offer.price;
  }
  if (kind === 'bogo') return offer.price / 2;
  return offer.price;
}

/** Never converted. A non-CAD amount is printed with its own code beside it so nobody reads it as dollars. */
function money(price: number, currency: string): string {
  return currency === 'CAD' ? `$${price.toFixed(2)}` : `${price.toFixed(2)} ${currency}`;
}

/**
 * Mirrors Python's `format(x, "g")` for the sizes a package actually prints:
 * 4 rather than 4.0, 1.5 kept as 1.5. `format(x, "g")` also falls to
 * exponential notation past six significant digits, which no printed pack
 * size reaches, so the two agree over the real input range and the test file
 * pins the cases that matter.
 */
function formatG(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

function qtyLabel(
  sizeValue: number | null,
  sizeUnit: string | null,
  packCount: number | null | undefined,
  price: number,
  currency: string,
): string {
  if (sizeValue === null || sizeUnit === null) return money(price, currency);
  const qty = packCount && packCount > 1 ? `${packCount} x ${formatG(sizeValue)} ${sizeUnit}` : `${formatG(sizeValue)} ${sizeUnit}`;
  return `${qty} · ${money(price, currency)}`;
}

/**
 * The till price said plainly beside the per-item one, so the label never
 * claims the shopper pays $2.50 at the register when the offer is 2 for $5.
 * No word here grades the price: "2 for $5.00" is what the shelf tag says.
 */
function dealSuffix(offer: GaugeOffer, currency: string): string {
  const kind = offer.dealKind;
  if (kind === 'multi_buy') {
    const units = offer.dealUnits;
    return units && units > 1 ? ` (${formatG(units)} for ${money(offer.price, currency)})` : '';
  }
  if (kind === 'bogo') return ' (buy one get one)';
  return '';
}

function offerLabel(offer: GaugeOffer): string {
  const currency = currencyOf(offer);
  return (
    qtyLabel(offer.sizeValue, offer.sizeUnit, offer.packCount, effectivePriceOf(offer), currency) +
    dealSuffix(offer, currency)
  );
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The TypeScript twin, FOR LOCAL PROOF AGAINST FAKE NUMBERS ONLY.
 *
 * *** NEVER CALL THIS ON A REAL GROUNDED PRICE. *** Doing so would be this
 * app analyzing a Grounded Result, which Google's grounding terms forbid.
 * Production runs `GAUGE_PYTHON_SOURCE` inside Gemini's sandbox and verifies
 * it afterwards with `codeMatchesGauge`; this function's only callers are
 * `test/gauge.test.ts` and `test/item-rules.test.ts`.
 *
 * `underPct` and `overPct` are the two percentages the USER set, both
 * defaulting to 10. They are not named for any judgment of the price,
 * because they are not one.
 */
export function computeGauge(
  shelf: GaugeShelfItem,
  offers: readonly GaugeOffer[],
  underPct = 10,
  overPct = 10,
): GaugeResult {
  const [shelfDim, shelfTotal] = totalSize(shelf);
  const shelfUnitPrice = unitPriceOf(shelf.price, shelfDim, shelfTotal);
  // The shelf price is what the shopper is looking at, in the store, in CAD.
  const shelfLabel = qtyLabel(shelf.sizeValue, shelf.sizeUnit, shelf.packCount, shelf.price, 'CAD');
  const shelfBrand = brandKey(shelf);
  const shelfOrganic = Boolean(shelf.organic);

  /**
   * THE FIRST REASON WINS, and the order is fixed rather than incidental, so
   * that one offer yields exactly one code and the same offer always yields
   * the same one. The order runs from "the shopper cannot pay this price at
   * all" (wrong currency, not the retailer, needs a membership) through "this
   * is a price for a different product" (brand, organic) to "this price
   * cannot be scaled" (size, dimension). A store-brand tin with no size is
   * therefore `different_brand_kind`, because the brand is the reason it
   * would not belong even if the size were there.
   */
  const exclusionOf = (
    offer: GaugeOffer,
    dim: GaugeDimension | null,
    total: number | null,
    unitPrice: number | null,
  ): GaugeExclusionCode | null => {
    if (currencyOf(offer) !== 'CAD') return 'not_cad';
    if (offer.marketplace) return 'marketplace';
    if (offer.memberOnly) return 'member_only';
    if (brandKey(offer) !== shelfBrand) return 'different_brand_kind';
    if (Boolean(offer.organic) !== shelfOrganic) return 'different_organic';
    if (dim === null || total === null || total <= 0) {
      // A variable-weight package whose weight nobody wrote down is a
      // different failure from a listing with no size field at all, and the
      // client says so differently.
      return offer.soldByWeight ? 'unknown_weight' : 'no_size';
    }
    if (shelfDim === null || dim !== shelfDim) return 'different_dimension';
    // Unreachable given the total check above, and kept because it is what
    // narrows `unitPrice` to a number for the caller on this side of the
    // network call. The Python carries the same guard so the two texts match.
    if (unitPrice === null) return 'no_size';
    return null;
  };

  const inBand: { retailer: string; unitPrice: number; url: string | null; label: string }[] = [];
  const excluded: GaugeExcluded[] = [];

  for (const o of offers) {
    const [dim, total] = totalSize(o);
    const up = unitPriceOf(effectivePriceOf(o), dim, total);
    const code = exclusionOf(o, dim, total, up);
    if (code !== null) {
      excluded.push({ retailer: o.retailer, code, note: EXCLUSION_NOTES[code], label: offerLabel(o), url: o.url });
      continue;
    }
    inBand.push({
      retailer: o.retailer,
      unitPrice: up as number,
      url: o.url,
      label: offerLabel(o),
    });
  }

  // Nothing on the line means there is no median to take, so there is no
  // verdict: the caller shows prices and reviews alone, the same handling a
  // code mismatch gets.
  if (inBand.length === 0 || shelfDim === null || shelfUnitPrice === null) {
    return { usable: false, dimension: shelfDim, unitLabel: unitLabelOf(shelfDim), excluded };
  }

  const prices = inBand.map((x) => x.unitPrice);
  const mid = medianOf(prices);
  // A median of zero (a giveaway, or a scraped price of 0) makes the
  // percentage undefined. Collapsing every point to the middle is the only
  // honest rendering and it keeps both languages from producing an infinity
  // or a NaN, which would then differ in how each one serialised it.
  const pctOf = (price: number) => (mid === 0 ? 0 : ((price - mid) / mid) * 100);
  const storePcts = prices.map(pctOf);
  const shelfPct = pctOf(shelfUnitPrice);
  const allAbs = [...storePcts.map(Math.abs), Math.abs(shelfPct)];
  const spanRaw = Math.max(Math.max(...allAbs), 1.5 * underPct, 1.5 * overPct);
  let span = Math.ceil(spanRaw / 5) * 5;
  // Both percentages at zero with every price identical leaves no scale at
  // all; five points is the smallest one that still divides into ticks.
  if (span <= 0) span = 5;

  const positionOf = (pct: number) => 50 + (pct / span) * 50;
  const zoneUnderBoundary = 50 - (underPct / span) * 50;
  const zoneOverBoundary = 50 + (overPct / span) * 50;
  const tickStep = span > 30 ? 10 : 5;
  const ticks: GaugeTick[] = [];
  for (let t = -span; t <= span; t += tickStep) {
    const label = t === 0 ? 'middle' : t > 0 ? `+${t}%` : `${t}%`;
    ticks.push({ pct: t, position: positionOf(t), label });
  }

  const zone: GaugeZone = shelfPct <= -underPct ? 'under_your_line' : shelfPct > overPct ? 'over_your_line' : 'middle';

  return {
    usable: true,
    median: mid,
    percent: shelfPct,
    zone,
    n: prices.length,
    dimension: shelfDim,
    unitLabel: unitLabelOf(shelfDim),
    shelfPosition: positionOf(shelfPct),
    shelfLabel,
    zoneUnderBoundary,
    zoneOverBoundary,
    points: inBand.map((x, i) => ({ retailer: x.retailer, position: positionOf(storePcts[i]), url: x.url, label: x.label })),
    excluded,
    ticks,
  };
}

/**
 * The literal text sent to Gemini's code_execution tool and run there
 * unchanged. One exported constant so that the caller, this file's twin, and
 * `codeMatchesGauge` all read the same string: a prompt that asked Gemini to
 * write fresh Python each call, which is what the reverted version did, left
 * nothing fixed to compare against and so left the check unwireable.
 *
 * Standard library only, nothing installed, deterministic, and well inside
 * the sandbox's 30 second limit.
 */
export const GAUGE_PYTHON_SOURCE = `def gauge(shelf, offers, under_pct, over_pct):
    import math
    MASS_TO_G = {"g": 1.0, "kg": 1000.0, "lb": 453.59237, "oz": 28.349523125}
    VOLUME_TO_ML = {"ml": 1.0, "l": 1000.0, "floz": 29.5735295625}
    COUNT_UNITS = {"each", "ea", "unit", "units", "count"}
    EXCLUSION_NOTES = {
        "no_size": "no size given",
        "different_dimension": "measured a different way",
        "unknown_weight": "sold by weight, with no weight given",
        "member_only": "needs a paid membership",
        "marketplace": "sold by a marketplace seller, not by the retailer",
        "not_cad": "priced in another currency",
        "different_brand_kind": "a different brand",
        "different_organic": "organic and non-organic are not the same product",
    }

    def dim_and_base(size_value, size_unit):
        if size_value is None or size_unit is None:
            return None, None
        u = str(size_unit).strip().lower().replace(" ", "")
        if u in MASS_TO_G:
            return "mass", size_value * MASS_TO_G[u]
        if u in VOLUME_TO_ML:
            return "volume", size_value * VOLUME_TO_ML[u]
        if u in COUNT_UNITS:
            return "count", size_value
        return None, None

    def total_size(size_value, size_unit, pack_count):
        dim, base = dim_and_base(size_value, size_unit)
        if dim is None:
            return None, None
        return dim, base * (pack_count or 1)

    def unit_price(price, dim, total):
        if dim is None or total is None or total <= 0:
            return None
        if dim == "count":
            return price / total
        return price / total * 100

    def unit_label(dim):
        if dim == "mass":
            return "100 g"
        if dim == "volume":
            return "100 mL"
        if dim == "count":
            return "item"
        return None

    def currency_of(o):
        c = o.get("currency")
        if c is None:
            return "CAD"
        c = str(c).strip().upper()
        if c == "":
            return "CAD"
        return c

    def brand_key(x):
        b = x.get("storeBrand")
        if b is None:
            return None
        b = str(b).strip().lower()
        if b == "":
            return None
        return b

    def effective_price(o):
        kind = o.get("dealKind")
        if kind == "multi_buy":
            units = o.get("dealUnits")
            if units and units > 1:
                return o["price"] / units
            return o["price"]
        if kind == "bogo":
            return o["price"] / 2
        return o["price"]

    def money(price, currency):
        if currency == "CAD":
            return "$" + format(price, ".2f")
        return format(price, ".2f") + " " + currency

    def qty_label(size_value, size_unit, pack_count, price, currency):
        if size_value is None or size_unit is None:
            return money(price, currency)
        if pack_count and pack_count > 1:
            qty = str(pack_count) + " x " + format(size_value, "g") + " " + str(size_unit)
        else:
            qty = format(size_value, "g") + " " + str(size_unit)
        return qty + " · " + money(price, currency)

    def deal_suffix(o, currency):
        kind = o.get("dealKind")
        if kind == "multi_buy":
            units = o.get("dealUnits")
            if units and units > 1:
                return " (" + format(units, "g") + " for " + money(o["price"], currency) + ")"
            return ""
        if kind == "bogo":
            return " (buy one get one)"
        return ""

    def offer_label(o):
        currency = currency_of(o)
        return qty_label(o.get("sizeValue"), o.get("sizeUnit"), o.get("packCount"), effective_price(o), currency) + deal_suffix(o, currency)

    shelf_dim, shelf_total = total_size(shelf.get("sizeValue"), shelf.get("sizeUnit"), shelf.get("packCount"))
    shelf_unit_price = unit_price(shelf["price"], shelf_dim, shelf_total)
    shelf_label = qty_label(shelf.get("sizeValue"), shelf.get("sizeUnit"), shelf.get("packCount"), shelf["price"], "CAD")
    shelf_brand = brand_key(shelf)
    shelf_organic = bool(shelf.get("organic"))

    def exclusion_of(o, dim, total, up):
        if currency_of(o) != "CAD":
            return "not_cad"
        if o.get("marketplace"):
            return "marketplace"
        if o.get("memberOnly"):
            return "member_only"
        if brand_key(o) != shelf_brand:
            return "different_brand_kind"
        if bool(o.get("organic")) != shelf_organic:
            return "different_organic"
        if dim is None or total is None or total <= 0:
            if o.get("soldByWeight"):
                return "unknown_weight"
            return "no_size"
        if shelf_dim is None or dim != shelf_dim:
            return "different_dimension"
        if up is None:
            return "no_size"
        return None

    in_band = []
    excluded = []

    for o in offers:
        dim, total = total_size(o.get("sizeValue"), o.get("sizeUnit"), o.get("packCount"))
        up = unit_price(effective_price(o), dim, total)
        code = exclusion_of(o, dim, total, up)
        if code is not None:
            excluded.append({
                "retailer": o["retailer"],
                "code": code,
                "note": EXCLUSION_NOTES[code],
                "label": offer_label(o),
                "url": o.get("url"),
            })
            continue
        in_band.append({
            "retailer": o["retailer"],
            "unitPrice": up,
            "url": o.get("url"),
            "label": offer_label(o),
        })

    if len(in_band) == 0 or shelf_dim is None or shelf_unit_price is None:
        return {
            "usable": False,
            "dimension": shelf_dim,
            "unitLabel": unit_label(shelf_dim),
            "excluded": excluded,
        }

    prices = [x["unitPrice"] for x in in_band]
    n = len(prices)
    sp = sorted(prices)
    if n % 2 == 1:
        median = sp[n // 2]
    else:
        median = (sp[n // 2 - 1] + sp[n // 2]) / 2

    def pct_of(price):
        if median == 0:
            return 0.0
        return (price - median) / median * 100

    store_pcts = [pct_of(p) for p in prices]
    shelf_pct = pct_of(shelf_unit_price)
    all_abs = [abs(p) for p in store_pcts] + [abs(shelf_pct)]
    span = max(max(all_abs), 1.5 * under_pct, 1.5 * over_pct)
    span = math.ceil(span / 5) * 5
    if span <= 0:
        span = 5

    def position_of(pct):
        return 50 + pct / span * 50

    under_boundary = 50 - under_pct / span * 50
    over_boundary = 50 + over_pct / span * 50
    tick_step = 10 if span > 30 else 5
    ticks = []
    t = -span
    while t <= span:
        if t == 0:
            tlabel = "middle"
        elif t > 0:
            tlabel = "+" + str(t) + "%"
        else:
            tlabel = str(t) + "%"
        ticks.append({"pct": t, "position": position_of(t), "label": tlabel})
        t += tick_step

    if shelf_pct <= -under_pct:
        zone = "under_your_line"
    elif shelf_pct > over_pct:
        zone = "over_your_line"
    else:
        zone = "middle"

    return {
        "usable": True,
        "median": median,
        "percent": shelf_pct,
        "zone": zone,
        "n": n,
        "dimension": shelf_dim,
        "unitLabel": unit_label(shelf_dim),
        "shelfPosition": position_of(shelf_pct),
        "shelfLabel": shelf_label,
        "zoneUnderBoundary": under_boundary,
        "zoneOverBoundary": over_boundary,
        "points": [{"retailer": x["retailer"], "position": position_of(pct), "url": x.get("url"), "label": x["label"]} for x, pct in zip(in_band, store_pcts)],
        "excluded": excluded,
        "ticks": ticks,
    }`;

/**
 * Whitespace-insensitive equality between the code Gemini's
 * code_execution step actually ran and `GAUGE_PYTHON_SOURCE`.
 *
 * Byte equality is too strict a bar for a model that may reindent or change
 * line endings while leaving the logic alone, and what this check is for is
 * catching a model that changed the ARITHMETIC. Every run of whitespace
 * collapses to nothing before comparing, so `a  =  1` matches `a=1` while
 * `a = 1.1` does not match `a = 1`.
 *
 * On any mismatch the caller returns no verdict at all and shows prices and
 * reviews alone. There is no partial credit here: an algorithm we cannot
 * prove ran is an algorithm that did not run.
 */
export function codeMatchesGauge(executedCode: string | null | undefined): boolean {
  if (!executedCode) return false;
  const normalize = (s: string) => s.replace(/\s+/g, '');
  return normalize(executedCode) === normalize(GAUGE_PYTHON_SOURCE);
}
