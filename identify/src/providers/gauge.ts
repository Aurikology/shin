/**
 * The three-zone price gauge's placement algorithm, WITH per-unit size
 * normalisation. Added 2026-09-14; refined twice more the same day on
 * Jamin's own words.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `gemini-grounded.ts`: rather than let
 * Gemini invent its own scaling/unit-conversion arithmetic each time, THIS
 * FILE is the one fixed algorithm, written and unit-tested here with fake
 * numbers, and `groundedVerdict` in `gemini-grounded.ts` sends its literal
 * Python source (`GAUGE_PYTHON_SOURCE` below) to Gemini's code_execution
 * tool and asks it to run that text UNCHANGED over the grounded prices --
 * never its own arithmetic, and never this file's `computeGauge` run on
 * real grounded data. Running `computeGauge` on a real grounded price would
 * be this app "analyzing" a Grounded Result itself, the one thing the terms
 * forbid (ai.google.dev/gemini-api/terms, "Grounding with Google Search";
 * see gemini-grounded.ts's header, rule (b)). `groundedVerdict` compares the
 * code Gemini actually ran, byte-for-byte modulo whitespace
 * (`codeMatchesGauge`), against `GAUGE_PYTHON_SOURCE`, and refuses the
 * verdict (shows prices and reviews with no verdict) on any mismatch --
 * Jamin's own words: "if it differs, show prices and reviews without a
 * verdict."
 *
 * `computeGauge` exists ONLY so this algorithm can be proven correct against
 * fake numbers before it is ever trusted inside a prompt -- gauge.test.ts
 * runs it locally, never through Gemini, and `groundedVerdict` never calls
 * `computeGauge` in production, only `GAUGE_PYTHON_SOURCE` and
 * `codeMatchesGauge`. Keep both implementations in lockstep by hand: this is
 * plain arithmetic mirrored in two languages, not generated from one
 * source, because the two run on different sides of a network call.
 *
 * THE ALGORITHM, Jamin's own words, FINAL 2026-09-14 revision -- his own
 * override of an earlier size-band/category draft this file briefly held:
 * "every offer is scaled to one unit (per 100 g, per 100 mL, per item) and
 * all sizes count, for all categories... If a bigger size makes the
 * scanned one a bad deal, it is a bad deal." So there is no 0.5x-2x band,
 * no "other sizes" hollow dots, no consumable/durable split: every offer
 * whose size converts to the SAME DIMENSION as the shelf item goes on the
 * line, at its unit price. Only a genuinely unusable offer -- no size given,
 * or a different dimension (mass vs. volume vs. count) than the shelf item
 * -- stays off the line, listed separately with a note.
 *
 *   0. Convert every offer's and the shelf item's size to one base unit per
 *      dimension (mass -> g, volume -> mL, count -> each; a pack multiplies
 *      by its count) using a FIXED conversion table (kg, lb, oz to g; L,
 *      fl oz to mL). No size, or a different dimension than the shelf item,
 *      excludes that offer from the line, listed separately with a note.
 *   1. Convert every remaining offer's price (and the shelf price) to a
 *      UNIT price: per 100 g, per 100 mL, or per item, depending on
 *      dimension. Every step below runs on unit prices, not raw prices.
 *   2. median of those unit prices
 *   3. pct = (unit_price - median) / median * 100, for every unit price and
 *      the shelf item's unit price
 *   4. span = max(max abs pct, 1.5*good, 1.5*bad), rounded up to the next 5
 *   5. position = 50 + pct / span * 50 (0 to 100, median at 50)
 *   6. good boundary = 50 - good/span*50, bad boundary = 50 + bad/span*50
 *   7. ticks every 5 or 10 percent (10 when span > 30), labelled "-10%", "middle", "+10%"
 *   8. label for the shelf price: good if pct <= -good, bad if pct > bad, else reasonable
 *
 * ONE ADDITION on top of the algorithm itself, also Jamin's words: every
 * dot -- the big "this one" dot and every small store dot -- carries a
 * `label` of its actual quantity and price as sold ("4 L · $6.99",
 * "6 x 355 mL · $4.49"), so the gauge never implies two different pack
 * sizes are "the same price" without saying what was actually paid for.
 * LABEL COLLISION AVOIDANCE AT 400px (staggering above/below, leader lines,
 * or a "3 prices" cluster that expands on tap) is explicitly a CLIENT
 * rendering concern, not this algorithm's: this function returns exact
 * positions and labels for every point, sorted by position, and the
 * client-side lane owns deciding how to lay text around them without
 * overlap. Nothing here approximates or drops a label to make room.
 *
 * A KNOWN, ACCEPTED CONSEQUENCE of step 4 exactly as specified: one extreme
 * unit price inflates `span` for every other point too, so an outlier
 * compresses the rest of the gauge toward the middle rather than being
 * clipped or excluded. Verified in this file's own test with a deliberate
 * outlier. This is not routed around -- it is the specified formula, run
 * exactly as given.
 *
 * When NOTHING lands on the line (every offer excluded), there is no
 * median to take: this function returns `{ usable: false, ... }` and the
 * caller shows prices/reviews with no verdict, same handling as a code
 * mismatch.
 */

export type GaugeDimension = 'mass' | 'volume' | 'count';

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
  /** Quantity and price as sold, e.g. "6 x 355 mL · $4.49" -- never the unit price, which is only used internally to place the dot. */
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
  readonly label: 'good' | 'reasonable' | 'bad';
  readonly n: number;
  readonly dimension: GaugeDimension;
  readonly unitLabel: '100 g' | '100 mL' | 'item';
  readonly shelfPosition: number;
  /** The big "this one" dot's own quantity/price label. */
  readonly shelfLabel: string;
  readonly zoneGoodBoundary: number;
  readonly zoneBadBoundary: number;
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

/** kg, lb, oz to g. Unit keys are lower-cased and stripped of spaces before lookup, matching the Python source's own normalisation. */
const MASS_TO_G: Record<string, number> = { g: 1, kg: 1000, lb: 453.59237, oz: 28.349523125 };
/** L, fl oz (US customary) to mL. */
const VOLUME_TO_ML: Record<string, number> = { ml: 1, l: 1000, floz: 29.5735295625 };
const COUNT_UNITS = new Set(['each', 'ea', 'unit', 'units', 'count']);

function dimAndBase(sizeValue: number | null, sizeUnit: string | null): [GaugeDimension, number] | [null, null] {
  if (sizeValue === null || sizeUnit === null) return [null, null];
  const u = sizeUnit.trim().toLowerCase().replace(/\s+/g, '');
  if (u in MASS_TO_G) return ['mass', sizeValue * MASS_TO_G[u]];
  if (u in VOLUME_TO_ML) return ['volume', sizeValue * VOLUME_TO_ML[u]];
  if (COUNT_UNITS.has(u)) return ['count', sizeValue];
  return [null, null];
}

function totalSize(size: GaugeSize): [GaugeDimension, number] | [null, null] {
  const [dim, base] = dimAndBase(size.sizeValue, size.sizeUnit);
  if (dim === null) return [null, null];
  return [dim, base * (size.packCount ?? 1)];
}

function unitPriceOf(price: number, dim: GaugeDimension | null, total: number | null): number | null {
  if (dim === null || total === null || total <= 0) return null;
  return dim === 'count' ? price / total : (price / total) * 100;
}

function unitLabelOf(dim: GaugeDimension | null): '100 g' | '100 mL' | 'item' | null {
  if (dim === 'mass') return '100 g';
  if (dim === 'volume') return '100 mL';
  if (dim === 'count') return 'item';
  return null;
}

/** Trims a trailing ".0" the way Python's `format(x, 'g')` does, e.g. 4 not 4.0, but keeps 1.5 as 1.5. Mirrors the Python source's own `qty_label`. */
function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

function qtyLabel(sizeValue: number | null, sizeUnit: string | null, packCount: number | null | undefined, price: number): string {
  if (sizeValue === null || sizeUnit === null) return `$${price.toFixed(2)}`;
  const qty = packCount && packCount > 1 ? `${packCount} x ${trimNumber(sizeValue)} ${sizeUnit}` : `${trimNumber(sizeValue)} ${sizeUnit}`;
  return `${qty} · $${price.toFixed(2)}`;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The TS mirror, for local proof only -- see the header. */
export function computeGauge(shelf: GaugeShelfItem, offers: readonly GaugeOffer[], goodPct: number, badPct: number): GaugeResult {
  const [shelfDim, shelfTotal] = totalSize(shelf);
  const shelfUnitPrice = unitPriceOf(shelf.price, shelfDim, shelfTotal);
  const shelfLabel = qtyLabel(shelf.sizeValue, shelf.sizeUnit, shelf.packCount, shelf.price);

  const inBand: { retailer: string; unitPrice: number; url: string | null; label: string }[] = [];
  const excluded: GaugeExcluded[] = [];

  for (const o of offers) {
    const [dim, total] = totalSize(o);
    if (dim === null || shelfDim === null || dim !== shelfDim) {
      excluded.push({ retailer: o.retailer, note: 'no size or different dimension' });
      continue;
    }
    const up = unitPriceOf(o.price, dim, total);
    if (up === null) {
      excluded.push({ retailer: o.retailer, note: 'no size or different dimension' });
      continue;
    }
    inBand.push({ retailer: o.retailer, unitPrice: up, url: o.url, label: qtyLabel(o.sizeValue, o.sizeUnit, o.packCount, o.price) });
  }

  if (inBand.length === 0 || shelfUnitPrice === null) {
    return { usable: false, dimension: shelfDim, unitLabel: unitLabelOf(shelfDim), excluded };
  }

  const prices = inBand.map((x) => x.unitPrice);
  const mid = median(prices);
  const pctOf = (price: number) => ((price - mid) / mid) * 100;
  const storePcts = prices.map(pctOf);
  const shelfPct = pctOf(shelfUnitPrice);
  const allAbs = [...storePcts.map(Math.abs), Math.abs(shelfPct)];
  const spanRaw = Math.max(Math.max(...allAbs), 1.5 * goodPct, 1.5 * badPct);
  let span = Math.ceil(spanRaw / 5) * 5;
  if (span <= 0) span = 5;
  const positionOf = (pct: number) => 50 + (pct / span) * 50;
  const zoneGoodBoundary = 50 - (goodPct / span) * 50;
  const zoneBadBoundary = 50 + (badPct / span) * 50;
  const tickStep = span > 30 ? 10 : 5;
  const ticks: GaugeTick[] = [];
  for (let t = -span; t <= span; t += tickStep) {
    const label = t === 0 ? 'middle' : t > 0 ? `+${t}%` : `${t}%`;
    ticks.push({ pct: t, position: positionOf(t), label });
  }
  const label: 'good' | 'reasonable' | 'bad' = shelfPct <= -goodPct ? 'good' : shelfPct > badPct ? 'bad' : 'reasonable';

  return {
    usable: true,
    median: mid,
    percent: shelfPct,
    label,
    n: prices.length,
    dimension: shelfDim,
    unitLabel: unitLabelOf(shelfDim) as '100 g' | '100 mL' | 'item',
    shelfPosition: positionOf(shelfPct),
    shelfLabel,
    zoneGoodBoundary,
    zoneBadBoundary,
    points: inBand.map((x, i) => ({ retailer: x.retailer, position: positionOf(storePcts[i]), url: x.url, label: x.label })),
    excluded,
    ticks,
  };
}

/**
 * The literal text sent to Gemini's code_execution tool, and run there
 * unchanged. Kept as one exported constant so `gemini-grounded.ts` and this
 * file's own tests (which assert it parses under a real interpreter and
 * that `codeMatchesGauge` round-trips it unchanged) both read the same
 * string. Verified against a real `python3` interpreter on this machine
 * while writing it (there is no code_execution tool to exercise locally) --
 * every numeric case in gauge.test.ts was cross-checked against that run
 * before being written down as an expectation.
 */
export const GAUGE_PYTHON_SOURCE = `def gauge(shelf, offers, good_pct, bad_pct):
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
        qty = (str(pack_count) + " x " + format(size_value, "g") + " " + str(size_unit)) if pack_count and pack_count > 1 else (format(size_value, "g") + " " + str(size_unit))
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

    if len(in_band) == 0 or shelf_unit_price is None:
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
        return (price - median) / median * 100

    store_pcts = [pct_of(p) for p in prices]
    shelf_pct = pct_of(shelf_unit_price)
    all_abs = [abs(p) for p in store_pcts] + [abs(shelf_pct)]
    span = max(max(all_abs), 1.5 * good_pct, 1.5 * bad_pct)
    span = math.ceil(span / 5) * 5
    if span <= 0:
        span = 5

    def position_of(pct):
        return 50 + pct / span * 50

    good_boundary = 50 - good_pct / span * 50
    bad_boundary = 50 + bad_pct / span * 50
    tick_step = 10 if span > 30 else 5
    ticks = []
    t = -span
    while t <= span:
        if t == 0:
            label = "middle"
        elif t > 0:
            label = "+" + str(t) + "%"
        else:
            label = str(t) + "%"
        ticks.append({"pct": t, "position": position_of(t), "label": label})
        t += tick_step

    if shelf_pct <= -good_pct:
        vlabel = "good"
    elif shelf_pct > bad_pct:
        vlabel = "bad"
    else:
        vlabel = "reasonable"

    return {
        "usable": True,
        "median": median,
        "percent": shelf_pct,
        "label": vlabel,
        "n": n,
        "dimension": shelf_dim,
        "unitLabel": unit_label(shelf_dim),
        "shelfPosition": position_of(shelf_pct),
        "shelfLabel": shelf_label,
        "zoneGoodBoundary": good_boundary,
        "zoneBadBoundary": bad_boundary,
        "points": [{"retailer": x["retailer"], "position": position_of(pct), "url": x.get("url"), "label": x["label"]} for x, pct in zip(in_band, store_pcts)],
        "excluded": excluded,
        "ticks": ticks,
    }`;

/**
 * Whitespace-insensitive equality between the code Gemini's
 * `code_execution_call` step actually ran and `GAUGE_PYTHON_SOURCE`. Exact
 * byte equality is too strict a bar for a model that may reformat
 * indentation or line endings while keeping the logic identical, and the
 * point of this check is catching a model that changed the ARITHMETIC, not
 * one that changed whitespace; every run of whitespace collapses to nothing
 * before comparing, so `a  =  1` and `a=1` match but `a = 1.1` does not
 * match `a = 1`. Any mismatch means `groundedVerdict` returns null and the
 * caller shows prices and reviews without a verdict, per Jamin's own words:
 * "if it differs, show prices and reviews without a verdict."
 */
export function codeMatchesGauge(executedCode: string | null | undefined): boolean {
  if (!executedCode) return false;
  const normalize = (s: string) => s.replace(/\s+/g, '');
  return normalize(executedCode) === normalize(GAUGE_PYTHON_SOURCE);
}
