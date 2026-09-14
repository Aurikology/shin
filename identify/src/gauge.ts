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
 *   0. Scale every offer and the shelf item to one base unit per dimension
 *      (mass to g, volume to mL, count stays each), pack count multiplying,
 *      then to a unit price: per 100 g, per 100 mL, or per item.
 *   1. median of those unit prices.
 *   2. pct = (unit price - median) / median * 100, for every offer and for
 *      the shelf price.
 *   3. span = ceil(max(max |pct|, 1.5*under, 1.5*over) / 5) * 5.
 *   4. position = 50 + pct / span * 50, so the median sits at 50 and the
 *      line runs 0 to 100.
 *   5. Zone boundaries at 50 - under/span*50 and 50 + over/span*50.
 *   6. Ticks every 5 points, every 10 when span > 30.
 *   7. The zone code the shelf price falls in.
 *   8. Offers with no size, or a dimension different from the shelf item's,
 *      are excluded from the line and returned as their own list.
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
 * no dependency outside the Python standard library. Gemini's sandbox also
 * installs nothing and stops at 30 seconds.
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

export interface GaugeSize {
  readonly sizeValue: number | null;
  readonly sizeUnit: string | null;
  readonly packCount?: number | null;
}

export interface GaugeShelfItem extends GaugeSize {
  readonly price: number;
}

export interface GaugeOffer extends GaugeSize {
  readonly retailer: string;
  readonly price: number;
  readonly url: string | null;
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

export interface GaugeExcluded {
  readonly retailer: string;
  readonly note: 'no size or different dimension';
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
 * Mirrors Python's `format(x, "g")` for the sizes a package actually prints:
 * 4 rather than 4.0, 1.5 kept as 1.5. `format(x, "g")` also falls to
 * exponential notation past six significant digits, which no printed pack
 * size reaches, so the two agree over the real input range and the test file
 * pins the cases that matter.
 */
function formatG(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

function qtyLabel(sizeValue: number | null, sizeUnit: string | null, packCount: number | null | undefined, price: number): string {
  if (sizeValue === null || sizeUnit === null) return `$${price.toFixed(2)}`;
  const qty = packCount && packCount > 1 ? `${packCount} x ${formatG(sizeValue)} ${sizeUnit}` : `${formatG(sizeValue)} ${sizeUnit}`;
  return `${qty} · $${price.toFixed(2)}`;
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
 * it afterwards with `codeMatchesGauge`; this function's only caller is
 * `test/gauge.test.ts`.
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
  const shelfLabel = qtyLabel(shelf.sizeValue, shelf.sizeUnit, shelf.packCount, shelf.price);

  const inBand: { retailer: string; unitPrice: number; url: string | null; label: string }[] = [];
  const excluded: GaugeExcluded[] = [];

  for (const o of offers) {
    const [dim, total] = totalSize(o);
    // The dimension, not the price, decides. The reverted version guarded on
    // the price here and could not narrow `shelfDim` out of null, which is
    // the type error that was at gauge.ts:245.
    if (dim === null || shelfDim === null || dim !== shelfDim) {
      excluded.push({ retailer: o.retailer, note: 'no size or different dimension' });
      continue;
    }
    const up = unitPriceOf(o.price, dim, total);
    if (up === null) {
      excluded.push({ retailer: o.retailer, note: 'no size or different dimension' });
      continue;
    }
    inBand.push({
      retailer: o.retailer,
      unitPrice: up,
      url: o.url,
      label: qtyLabel(o.sizeValue, o.sizeUnit, o.packCount, o.price),
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

    def qty_label(size_value, size_unit, pack_count, price):
        if size_value is None or size_unit is None:
            return "$" + format(price, ".2f")
        if pack_count and pack_count > 1:
            qty = str(pack_count) + " x " + format(size_value, "g") + " " + str(size_unit)
        else:
            qty = format(size_value, "g") + " " + str(size_unit)
        return qty + " · $" + format(price, ".2f")

    shelf_dim, shelf_total = total_size(shelf.get("sizeValue"), shelf.get("sizeUnit"), shelf.get("packCount"))
    shelf_unit_price = unit_price(shelf["price"], shelf_dim, shelf_total)
    shelf_label = qty_label(shelf.get("sizeValue"), shelf.get("sizeUnit"), shelf.get("packCount"), shelf["price"])

    in_band = []
    excluded = []

    for o in offers:
        dim, total = total_size(o.get("sizeValue"), o.get("sizeUnit"), o.get("packCount"))
        if dim is None or shelf_dim is None or dim != shelf_dim:
            excluded.append({"retailer": o["retailer"], "note": "no size or different dimension"})
            continue
        up = unit_price(o["price"], dim, total)
        if up is None:
            excluded.append({"retailer": o["retailer"], "note": "no size or different dimension"})
            continue
        in_band.append({
            "retailer": o["retailer"],
            "unitPrice": up,
            "url": o.get("url"),
            "label": qty_label(o.get("sizeValue"), o.get("sizeUnit"), o.get("packCount"), o["price"]),
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
