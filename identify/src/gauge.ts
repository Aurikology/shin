/**
 * The price gauge's placement arithmetic for size-variant goods (groceries,
 * household, anything sold by mass, volume or count), in two languages that
 * must stay identical.
 *
 * WHY THIS FILE ONCE RAN ITS ARITHMETIC ON GEMINI'S SIDE OF THE NETWORK CALL.
 * Google's Grounding with Google Search terms forbid us to "cache, frame,
 * syndicate, resell, analyze, train on, or otherwise learn from Grounded
 * Results". Taking a median of prices Google's search returned, on our own
 * server, is analysis. The original design sent a fixed Python source
 * (`GAUGE_PYTHON_SOURCE`) into Gemini's own code-execution sandbox and
 * verified the code it actually ran (`codeMatchesGauge`) before trusting a
 * verdict computed there.
 *
 * OVERRULED 2026-09-15, Jamin: "Forget about all legal considerations when
 * building, don't prevent something from functioning just because of legal
 * issues" (see `providers/gemini-grounded.ts`'s header). The sandbox
 * resubmission was deleted as the one thing in this repo capable of a second
 * grounded call per scan (rule 1 forbids that on its own), and
 * `GeminiGroundedLookup` now calls `computeGauge` directly, in this process,
 * on real grounded offers. `GAUGE_PYTHON_SOURCE` and `codeMatchesGauge` went
 * with the resubmission they served; removed 2026-09-19, no live caller
 * remained (only `test/gauge.test.ts` and `test/item-rules.test.ts` still
 * read them, to prove properties of a script nothing executes anymore).
 *
 * `computeGauge` is the one surviving implementation now, but it is NOT on the
 * live scan path (checked 2026-09-27): its only non-test callers are
 * `priceGaugeFor` in `providers/gemini-grounded.ts`, reached only through
 * `GeminiGroundedLookup`, which only the offline eval `eval/price-truth.ts`
 * constructs, and `eval/zone-truth.ts`. The live scan's line comes from
 * Gemini's own `price_verdict` (`providers/gemini-scan.ts`); only this file's
 * `LONE_CLAIM_FLOOR`/`LONE_CLAIM_CEILING` are used live. Every numeric expectation in
 * `test/gauge.test.ts` was produced by actually running the retired Python
 * source and compared against this TypeScript, because a previous session
 * hand-typed an expected line and it was wrong; that history is why the
 * comparison languages differ, even though only one of them still runs.
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
 * ONE MECHANISM, NOT FOUR. Each rule below that keeps an offer off the line
 * adds a code to `excluded` instead of a parallel list of its own; the two
 * that no longer keep it off (member prices, marketplace sellers) put a code
 * in the point's `marks` instead. The code is what travels: the note beside
 * it is English and the client has to say it in French, so the note is a
 * function of the code alone and never of the offer, which is what makes the
 * code a complete substitute for it.
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
 *    till will charge. A MEMBER price is on the line like any other and
 *    carries the mark `member_only`. The owner's ruling, 2026-09-19: "there
 *    should be no membership rule or any similar rule, it should just be
 *    marked as members only". It used to go off the line, on the argument
 *    that a price needing a membership the shopper may not have moves the
 *    middle for shoppers who cannot reach it; he decided the mark answers
 *    that and the exclusion does not belong.
 *
 * 4. MARKETPLACE SELLERS AND US LISTINGS. `marketplace` is a price from a
 *    seller on a retailer's site rather than from the retailer. Same ruling,
 *    same treatment: it is on the line and carries the mark `marketplace`.
 *    `currency` is what the price is actually in, and THAT one is still off
 *    the line (`not_cad`) and never converted. AN EXCHANGE RATE IS A GUESS
 *    ABOUT A NUMBER THE SHOPPER WOULD ACTUALLY BE CHARGED, and Shin does not
 *    guess about money. The first line of defence is the request itself:
 *    `providers/gemini-grounded.ts` asks for Canadian retailers and CAD only,
 *    and `not_cad` is the second. The marks are codes and not words, for the
 *    reason the exclusion codes are: the client says them in its own language.
 *
 * 5. ONE OFFER IS A LINE. The owner, 2026-09-19: "the one price becomes the
 *    median". With exactly one offer left the median is that offer, the line
 *    is drawn, and the `one_offer` shortfall says so in plain words, so the
 *    shopper reads it as one seller's price and not as a consensus. Zero
 *    offers is still no line. This reverses the D-113 withholding that used
 *    to sit here (see the note at the old check in `computeGauge`).
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
/**
 * `spine/src/money.ts` is a zero-import leaf module, so this pulls in nothing
 * behind it. Named for cents because that is what the spine deals in; the
 * predicate itself is "a finite number above zero" and is unit-agnostic,
 * which is what the gauge needs for a price in dollars.
 */
import { isUsableAmount } from '../../spine/src/money.ts';

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
  | 'not_cad'
  | 'different_brand_kind'
  | 'different_organic'
  /**
   * Held off the line for sitting outside the lone-claim band, D-113. A fact
   * about how far the offer is from the others, never a reading of whether
   * its price is right: this code says the number could not be checked
   * against anything, not that it is wrong.
   */
  | 'lone_claim'
  /** The price field was not a usable amount at all: absent, zero, negative or not a number. */
  | 'unusable_price';


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
  /**
   * ITEM 19. The currency the shelf price is in: the user's market currency, from
   * their location. Offers are compared against it and never converted. Absent
   * means the market is unknown, and the reference falls to the currency most of
   * the offers state; it is never assumed to be any one country's.
   */
  readonly currency?: string | null;
}

export interface GaugeOffer extends GaugeSize {
  readonly retailer: string;
  readonly price: number;
  readonly url: string | null;
  /** What the price is in (ISO 4217). Absent means not stated, never a currency; comparison must be against the user's market currency and is never converted. */
  readonly currency?: string | null;
  /** A seller on the retailer's site rather than the retailer. */
  readonly marketplace?: boolean | null;
  /** Needs a paid membership, so it is not a price every shopper can pay. */
  readonly memberOnly?: boolean | null;
  readonly dealKind?: GaugeDealKind | string | null;
  /** The count in a "n for $x", so 2 in a 2 for $5. Ignored unless `dealKind` is 'multi_buy'. */
  readonly dealUnits?: number | null;
  /**
   * When the price was seen, as the source gave it. NOTHING READS THIS YET.
   * It is here so that "the gauge cannot even express staleness" stops being
   * true: a date has to survive the trip before any rule can be written
   * against it. Adding a rule that uses it is a separate decision.
   */
  readonly observedAt?: string | null;
}

export interface GaugeTick {
  readonly pct: number;
  readonly position: number;
  readonly label: string;
}

/**
 * A fact about an offer that is ON the line and worth saying beside it: it
 * needs a paid membership, or it is a marketplace seller's price. Codes, not
 * words, so the client says them in its own language ("members only",
 * "marketplace seller"). Neither moves the offer off the line.
 */
export type GaugeMark = 'member_only' | 'marketplace';

export interface GaugePoint {
  readonly retailer: string;
  readonly position: number;
  readonly url: string | null;
  /** Quantity and price as sold, e.g. "6 x 355 mL · $4.49". Never the unit price, which only places the dot. */
  readonly label: string;
  /** Empty for an ordinary offer. */
  readonly marks: readonly GaugeMark[];
}

/**
 * One offer that is not on the line.
 *
 * `label` and `url` are here so the labelled lists a client shows (the
 * listings in another currency) can be rendered off this one list without a
 * second mechanism carrying the same offers twice.
 */
export interface GaugeExcluded {
  readonly retailer: string;
  readonly code: GaugeExclusionCode;
  /** English, and a function of `code` alone. Translate from the code, never from this. */
  readonly note: string;
  readonly label: string;
  readonly url: string | null;
}

/**
 * Something the line is short of, named rather than hidden. Carried BESIDE
 * the answer instead of replacing it: the shopper still sees the line, and
 * the sentence under it says what it rests on. Lifted in shape from the
 * spine's `Shortfall`, which is the same idea on the other side of the app.
 */
export type GaugeShortfallCode = 'one_offer' | 'thin_evidence' | 'claim_held' | 'spread_unresolved';

export interface GaugeShortfall {
  readonly code: GaugeShortfallCode;
  /** English, and a function of `code` alone. Translate from the code, never from this. */
  readonly note: string;
}

/**
 * How much the line rests on. A flag the client renders its own sentence
 * from, never a word shown as-is. Deliberately two values and not a
 * calibrated score: nothing here has been calibrated, and a number would
 * imply it had been.
 *
 * IT IS 'thin' AND NOT 'low' because the grading-word sweep in
 * `app/test/refusal-swaps.test.mjs` bans "low", and rightly: this field
 * travels in the same JSON as the price, where "low" reads as a claim about
 * the price rather than about the evidence. 'thin' can only describe the
 * evidence. The sweep caught this, which is what it is for.
 */
export type GaugeConfidence = 'thin' | 'ok';

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
  readonly confidence: GaugeConfidence;
  readonly shortfalls: readonly GaugeShortfall[];
}

export interface GaugeUnusable {
  readonly usable: false;
  readonly dimension: GaugeDimension | null;
  readonly unitLabel: '100 g' | '100 mL' | 'item' | null;
  readonly excluded: readonly GaugeExcluded[];
  /**
   * WHY there is no line, so the client can say which of two different
   * things happened. Before this existed both arrived as a null verdict and
   * the phone could not tell "no size given" from "nothing comparable", so it
   * said nothing at all. (A third, `single_offer`, went on 2026-09-19: one
   * offer now draws a line, marked.)
   */
  readonly reason: GaugeNoLineReason;
}

export type GaugeNoLineReason = 'no_offers_on_line' | 'no_shelf_size';

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
  not_cad: 'priced in another currency',
  different_brand_kind: 'a different brand',
  different_organic: 'organic and non-organic are not the same product',
  lone_claim: 'far from the other prices found',
  unusable_price: 'no usable price given',
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

function cleanCurrency(c: unknown): string | null {
  if (c === null || c === undefined) return null;
  const t = String(c).trim().toUpperCase();
  return t === '' ? null : t;
}

/**
 * ITEM 19. The currency every offer is compared against: the shelf's own (the
 * user's market currency) when it was given, else the one most of the offers
 * state, first named winning a tie. Never a country's default: with nothing
 * given and nothing stated it is null, and nothing is then excluded on currency.
 */
function referenceCurrency(shelf: GaugeShelfItem, offers: readonly GaugeOffer[]): string | null {
  const given = cleanCurrency(shelf.currency);
  if (given !== null) return given;
  const counts = new Map<string, number>();
  for (const o of offers) {
    const c = cleanCurrency(o.currency);
    if (c !== null) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  for (const [c, k] of counts) if (k > n) { best = c; n = k; }
  return best;
}

/**
 * An offer that SAYS what currency it is in is taken at its word. One that does
 * not is taken to be in the reference currency, because the alternative is
 * excluding every offer that came back from a model that did not fill the field
 * in. Null only when there is neither a stated currency nor a reference.
 */
function currencyOf(offer: GaugeOffer, reference: string | null): string | null {
  return cleanCurrency(offer.currency) ?? reference;
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

/**
 * Never converted. A currency with a well-known symbol prints it; any other
 * prints its own code after the number so nobody reads it as dollars. An unknown
 * currency (null) prints the legacy bare dollar sign and claims nothing more.
 * Twin of `formatMoney` in catalogue/src/market.ts: the symbol table is the
 * same one.
 */
const SYMBOLS: Readonly<Record<string, string>> = {
  CAD: '$', USD: '$', AUD: '$', NZD: '$', EUR: '€', GBP: '£', JPY: '¥',
};
function money(price: number, currency: string | null, reference: string | null): string {
  if (currency === null) return `$${price.toFixed(2)}`;
  const symbol = currency === reference ? SYMBOLS[currency] : undefined;
  return symbol ? `${symbol}${price.toFixed(2)}` : `${price.toFixed(2)} ${currency}`;
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
  currency: string | null,
  reference: string | null,
): string {
  if (sizeValue === null || sizeUnit === null) return money(price, currency, reference);
  const qty = packCount && packCount > 1 ? `${packCount} x ${formatG(sizeValue)} ${sizeUnit}` : `${formatG(sizeValue)} ${sizeUnit}`;
  return `${qty} · ${money(price, currency, reference)}`;
}

/**
 * The till price said plainly beside the per-item one, so the label never
 * claims the shopper pays $2.50 at the register when the offer is 2 for $5.
 * No word here grades the price: "2 for $5.00" is what the shelf tag says.
 */
function dealSuffix(offer: GaugeOffer, currency: string | null, reference: string | null): string {
  const kind = offer.dealKind;
  if (kind === 'multi_buy') {
    const units = offer.dealUnits;
    return units && units > 1 ? ` (${formatG(units)} for ${money(offer.price, currency, reference)})` : '';
  }
  if (kind === 'bogo') return ' (buy one get one)';
  return '';
}

function offerLabel(offer: GaugeOffer, reference: string | null): string {
  const currency = currencyOf(offer, reference);
  return (
    qtyLabel(offer.sizeValue, offer.sizeUnit, offer.packCount, effectivePriceOf(offer), currency, reference) +
    dealSuffix(offer, currency, reference)
  );
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * THE LONE-CLAIM BAND, ported from Shin's own engine, D-113.
 *
 * `spine/src/spine.ts:921-922` has held these two numbers since the pilot and
 * the grounded path had neither. A grounded search for Kraft Dinner 225 g
 * returned ONE Walmart offer of $9.97 against a hand-priced truth of $1.74,
 * carrying confident metadata; the median of one offer is that offer, and an
 * ordinary price was drawn for the shopper as 83% below the going rate.
 *
 * They are DESIGN DEFAULTS, NOT MEASUREMENTS -- spine says so about itself
 * and the same caveat travels with them here. Low is tighter than high on
 * purpose: a fake low price is the direction that sends someone on a trip.
 *
 * Pinned against spine's own constants by a test-only import, so that the two
 * drifting apart fails a build instead of going unnoticed. They are copied
 * rather than imported at runtime because `spine.ts` pulls a database-backed
 * module graph behind it that this package has no reason to load.
 */
export const LONE_CLAIM_FLOOR = 0.5;
export const LONE_CLAIM_CEILING = 2.5;

const SHORTFALL_NOTES: Record<GaugeShortfallCode, string> = {
  one_offer: 'only one price found, so the middle is that price',
  thin_evidence: 'only two prices found, so the middle is rough',
  claim_held: 'one price was too far from the others to place',
  spread_unresolved: 'the prices found disagree too much to say which is typical',
};

interface BandEntry {
  retailer: string;
  unitPrice: number;
  url: string | null;
  label: string;
  marks: GaugeMark[];
}

/** Member first, then marketplace, so one offer always carries its marks in one order. */
function marksOf(offer: GaugeOffer): GaugeMark[] {
  const marks: GaugeMark[] = [];
  if (offer.memberOnly) marks.push('member_only');
  if (offer.marketplace) marks.push('marketplace');
  return marks;
}

/**
 * The median of every unit price EXCEPT the one being judged.
 *
 * Leave-one-out, and that is the whole point: `spine.ts:1099-1131` computes
 * its baseline the same way, because a claim compared against a set that
 * includes itself is compared partly against itself. At one offer there is
 * nothing left to be an outlier FROM, so this returns null and the band
 * cannot fire -- which is exactly why the band alone does not close D-113,
 * and why a minimum-offer rule sits beside it.
 */
function leaveOneOutReference(index: number, unitPrices: readonly number[]): number | null {
  const others = unitPrices.filter((_, i) => i !== index);
  if (others.length < 1) return null;
  return medianOf(others);
}

/** Mirrors `spine.ts:1130`. A reference of zero gives no ratio to test against. */
function isLoneClaim(unitPrice: number, reference: number): boolean {
  if (!(reference > 0)) return false;
  return unitPrice < reference * LONE_CLAIM_FLOOR || unitPrice > reference * LONE_CLAIM_CEILING;
}

/**
 * Hold back offers outside the band -- BUT THE HOLD CAN NEVER EMPTY THE SET.
 *
 * This is `spine.ts:417` carried across verbatim in spirit:
 *   `vetted = held.length === 0 ? comparison : comparison.filter(...)`
 * When every offer is a lone claim of every other, they disagree with each
 * other rather than one of them being odd, and dropping them all would leave
 * the shopper with nothing. So the set comes back whole with the disagreement
 * NAMED instead. That is the mechanism that lets a plausibility guard live
 * under a rule that says there is always an answer.
 */
function applyClaimHold(inBand: readonly BandEntry[]): {
  kept: BandEntry[];
  held: BandEntry[];
  spreadUnresolved: boolean;
} {
  /**
   * THE BAND NEEDS THREE OFFERS BEFORE IT MAY HOLD ANYTHING, and this was
   * found by a test rather than reasoned out: a 12-pack of 355 mL cans at
   * $8.99 against a 2 L bottle at $2.00 is a 2.1x spread between two honest
   * prices, and at two offers the band held the bottle.
   *
   * At two offers, leave-one-out compares each price against the SINGLE other
   * price, so "which of these two is the odd one" has no answer -- whichever
   * is cheaper is always a lone claim of the dearer one past a 2x gap, and
   * format spread alone clears 2x routinely. The spine never had this problem
   * because its baseline is a median of many vouched points, not one.
   *
   * So below three, both prices stand and the line is marked thin instead.
   */
  if (inBand.length < 3) return { kept: [...inBand], held: [], spreadUnresolved: false };
  const prices = inBand.map((x) => x.unitPrice);
  const held: BandEntry[] = [];
  const kept: BandEntry[] = [];
  for (let i = 0; i < inBand.length; i += 1) {
    const reference = leaveOneOutReference(i, prices);
    if (reference !== null && isLoneClaim(prices[i], reference)) held.push(inBand[i]);
    else kept.push(inBand[i]);
  }
  if (kept.length === 0) return { kept: [...inBand], held: [], spreadUnresolved: true };
  return { kept, held, spreadUnresolved: false };
}

/**
 * What the line rests on, as a flag plus named shortfalls.
 *
 * Deliberately NOT spine's `confidenceOf`: that one is uncalibrated by its
 * own admission and works on evidence classes this side of the app does not
 * have (witnesses, seller identity, observation dates). This says only the
 * three things that are actually knowable here.
 */
function confidenceOf(
  keptCount: number,
  heldCount: number,
  spreadUnresolved: boolean,
): { band: GaugeConfidence; shortfalls: GaugeShortfall[] } {
  const shortfalls: GaugeShortfall[] = [];
  if (keptCount === 1) shortfalls.push({ code: 'one_offer', note: SHORTFALL_NOTES.one_offer });
  if (keptCount === 2) shortfalls.push({ code: 'thin_evidence', note: SHORTFALL_NOTES.thin_evidence });
  if (heldCount > 0) shortfalls.push({ code: 'claim_held', note: SHORTFALL_NOTES.claim_held });
  if (spreadUnresolved) shortfalls.push({ code: 'spread_unresolved', note: SHORTFALL_NOTES.spread_unresolved });
  return { band: shortfalls.length > 0 ? 'thin' : 'ok', shortfalls };
}

/**
 * The gauge arithmetic. Called live, on real grounded offers, from
 * `priceGaugeFor` in `providers/gemini-grounded.ts` -- see this file's header
 * for the 2026-09-15 ruling that put it there. `test/gauge.test.ts` and
 * `test/item-rules.test.ts` prove it against fake numbers first; they are not
 * its only callers.
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
  // The shelf price is what the shopper is looking at, in the store, in their own market's currency.
  const reference = referenceCurrency(shelf, offers);
  const shelfLabel = qtyLabel(shelf.sizeValue, shelf.sizeUnit, shelf.packCount, shelf.price, reference, reference);
  const shelfBrand = brandKey(shelf);
  const shelfOrganic = Boolean(shelf.organic);

  /**
   * THE FIRST REASON WINS, and the order is fixed rather than incidental, so
   * that one offer yields exactly one code and the same offer always yields
   * the same one. The order runs from "the shopper cannot pay this price at
   * all" (wrong currency) through "this is a price for a different product"
   * (brand, organic) to "this price cannot be scaled" (size, dimension). A
   * member price and a marketplace seller's price are not on this list: they
   * stay on the line and are marked (`marksOf`). A store-brand tin with no
   * size is therefore `different_brand_kind`, because the brand is the reason
   * it would not belong even if the size were there.
   */
  const exclusionOf = (
    offer: GaugeOffer,
    dim: GaugeDimension | null,
    total: number | null,
    unitPrice: number | null,
  ): GaugeExclusionCode | null => {
    // Before any other question about the offer: a price that is absent,
    // zero, negative or not a number cannot be placed, and letting one reach
    // the median poisons every other dot on the line.
    if (!isUsableAmount(offer.price)) return 'unusable_price';
    const own = currencyOf(offer, reference);
    if (own !== null && reference !== null && own !== reference) return 'not_cad';
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

  const inBand: BandEntry[] = [];
  const excluded: GaugeExcluded[] = [];

  for (const o of offers) {
    const [dim, total] = totalSize(o);
    const up = unitPriceOf(effectivePriceOf(o), dim, total);
    const code = exclusionOf(o, dim, total, up);
    if (code !== null) {
      excluded.push({ retailer: o.retailer, code, note: EXCLUSION_NOTES[code], label: offerLabel(o, reference), url: o.url });
      continue;
    }
    inBand.push({
      retailer: o.retailer,
      unitPrice: up as number,
      url: o.url,
      label: offerLabel(o, reference),
      marks: marksOf(o),
    });
  }

  // Nothing on the line means there is no median to take, so there is no
  // verdict: the caller shows prices and reviews alone, the same handling a
  // code mismatch gets. The two ways of having no line are told apart,
  // because the phone has to say a different sentence for each.
  if (shelfDim === null || shelfUnitPrice === null) {
    return { usable: false, dimension: shelfDim, unitLabel: unitLabelOf(shelfDim), excluded, reason: 'no_shelf_size' };
  }
  if (inBand.length === 0) {
    return { usable: false, dimension: shelfDim, unitLabel: unitLabelOf(shelfDim), excluded, reason: 'no_offers_on_line' };
  }

  const { kept, held, spreadUnresolved } = applyClaimHold(inBand);
  for (const h of held) {
    excluded.push({ retailer: h.retailer, code: 'lone_claim', note: EXCLUSION_NOTES.lone_claim, label: h.label, url: h.url });
  }

  /**
   * D-113 WITHHELD THE LINE HERE when one offer was left, because the median
   * of one offer is that offer and a Kraft Dinner at $1.74 read as 83% under
   * the going rate off a single $9.97 row. The owner reversed it on
   * 2026-09-19 ("the one price becomes the median"): the line is drawn, and
   * `confidenceOf` marks it `one_offer` so the client says it is one seller's
   * price. Zero offers returned above and is still no line.
   */
  const { band: confidence, shortfalls } = confidenceOf(kept.length, held.length, spreadUnresolved);
  const prices = kept.map((x) => x.unitPrice);
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
    points: kept.map((x, i) => ({ retailer: x.retailer, position: positionOf(storePcts[i]), url: x.url, label: x.label, marks: x.marks })),
    excluded,
    ticks,
    confidence,
    shortfalls,
  };
}

