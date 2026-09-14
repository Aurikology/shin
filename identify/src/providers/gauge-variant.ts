/**
 * The spec-variant gauge placement algorithm, for tech / spec-variant
 * products (electronics, appliances, anything identified by model number
 * and specs) -- Jamin's own rules, 2026-09-14, added the same day as
 * `gauge.ts`'s unit-price gauge and deliberately NOT unified with it:
 * "Unit scaling does not apply to them." Which algorithm runs is decided by
 * the ungrounded identification's category, by the caller, never guessed
 * here.
 *
 * SAME SPLIT AS gauge.ts, for the same reason: `computeVariantGauge` is the
 * local, fake-numbers-only proof that this algorithm is correct;
 * `GAUGE_VARIANT_PYTHON_SOURCE` is the literal text `groundedVerdict` in
 * `gemini-grounded.ts` sends to Gemini's code_execution tool and asks it to
 * run UNCHANGED, verified with `codeMatchesVariantGauge`. This app's own
 * code never runs this algorithm on a real grounded price -- see
 * gauge.ts's header and gemini-grounded.ts's rule (b) for why.
 *
 * THE RULES, Jamin's own words:
 *   1. The verdict line uses only offers of the exact same variant: same
 *      model number and same price-relevant specs (storage, RAM, screen
 *      size, chip, colour when priced differently).
 *   2. Condition must match too: new vs open-box vs refurbished vs used are
 *      separate; non-matching conditions go in the list, labelled, not on
 *      the line.
 *   3. Other variants of the same model are listed under the line, each
 *      labelled with the differing spec and the price difference, e.g.
 *      "512 GB · +$250" (difference computed in the Gemini code-execution
 *      step, not by our code).
 *   4. A different model entirely is not this function's problem (the
 *      existing alternatives section handles cross-brand/cross-model
 *      comparison as a spec comparison, not on this line) -- but this
 *      function still defends against a grounded search mistakenly
 *      returning one, by excluding it with a note rather than crashing or
 *      guessing.
 *
 * Reviews are per model, shared across variants -- that is a CALLER
 * decision (one `groundedPricesAndReviews`-style review block keyed by
 * model, not this file's concern), noted here only so nobody reads this
 * file looking for it.
 */

export type VariantCondition = 'new' | 'open-box' | 'refurbished' | 'used';

export interface VariantSpecs {
  readonly [spec: string]: string;
}

export interface VariantShelfItem {
  readonly price: number;
  readonly model: string;
  readonly specs: VariantSpecs;
  readonly condition: VariantCondition;
}

export interface VariantOffer {
  readonly retailer: string;
  readonly price: number;
  readonly url: string | null;
  readonly model: string;
  readonly specs: VariantSpecs;
  readonly condition: VariantCondition;
}

export interface VariantTick {
  readonly pct: number;
  readonly position: number;
  readonly label: string;
}

export interface VariantPoint {
  readonly retailer: string;
  readonly position: number;
  readonly url: string | null;
  readonly price: number;
}

/** Same model and specs as the shelf item, but a different condition -- listed, never placed on the line. */
export interface VariantOtherCondition {
  readonly retailer: string;
  readonly price: number;
  readonly url: string | null;
  readonly condition: VariantCondition;
}

/** Same model, at least one differing spec -- listed under the line with the differing spec and the price difference, e.g. "512GB storage · +$250.00". */
export interface VariantOtherVariant {
  readonly retailer: string;
  readonly price: number;
  readonly url: string | null;
  readonly condition: VariantCondition;
  readonly label: string;
}

export interface VariantExcluded {
  readonly retailer: string;
  readonly note: 'different model';
}

export interface VariantGaugeUsable {
  readonly usable: true;
  readonly median: number;
  readonly percent: number;
  readonly label: 'good' | 'reasonable' | 'bad';
  readonly n: number;
  readonly shelfPosition: number;
  readonly zoneGoodBoundary: number;
  readonly zoneBadBoundary: number;
  readonly points: readonly VariantPoint[];
  readonly otherConditions: readonly VariantOtherCondition[];
  readonly otherVariants: readonly VariantOtherVariant[];
  readonly excluded: readonly VariantExcluded[];
  readonly ticks: readonly VariantTick[];
}

export interface VariantGaugeUnusable {
  readonly usable: false;
  readonly otherConditions: readonly VariantOtherCondition[];
  readonly otherVariants: readonly VariantOtherVariant[];
  readonly excluded: readonly VariantExcluded[];
}

export type VariantGaugeResult = VariantGaugeUsable | VariantGaugeUnusable;

function specsMatch(a: VariantSpecs, b: VariantSpecs): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The TS mirror, for local proof only -- see the header. */
export function computeVariantGauge(shelf: VariantShelfItem, offers: readonly VariantOffer[], goodPct: number, badPct: number): VariantGaugeResult {
  const inBand: { retailer: string; price: number; url: string | null; condition: VariantCondition }[] = [];
  const otherConditions: VariantOtherCondition[] = [];
  const otherVariants: VariantOtherVariant[] = [];
  const excluded: VariantExcluded[] = [];

  for (const o of offers) {
    if (o.model !== shelf.model) {
      excluded.push({ retailer: o.retailer, note: 'different model' });
      continue;
    }
    const sameSpecs = specsMatch(o.specs, shelf.specs);
    if (sameSpecs && o.condition === shelf.condition) {
      inBand.push({ retailer: o.retailer, price: o.price, url: o.url, condition: o.condition });
    } else if (sameSpecs) {
      otherConditions.push({ retailer: o.retailer, price: o.price, url: o.url, condition: o.condition });
    } else {
      const keys = [...new Set([...Object.keys(o.specs), ...Object.keys(shelf.specs)])];
      const diffs = keys.filter((k) => o.specs[k] !== shelf.specs[k]).map((k) => [k, o.specs[k]] as const);
      const delta = o.price - shelf.price;
      const sign = delta >= 0 ? '+' : '-';
      const label =
        diffs.length === 1
          ? `${diffs[0][1]} ${diffs[0][0]} · ${sign}$${Math.abs(delta).toFixed(2)}`
          : diffs
              .slice()
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([k, v]) => `${k}=${v}`)
              .join(', ');
      otherVariants.push({ retailer: o.retailer, price: o.price, url: o.url, condition: o.condition, label });
    }
  }

  if (inBand.length === 0) {
    return { usable: false, otherConditions, otherVariants, excluded };
  }

  const prices = inBand.map((x) => x.price);
  const mid = median(prices);
  const pctOf = (price: number) => ((price - mid) / mid) * 100;
  const storePcts = prices.map(pctOf);
  const shelfPct = pctOf(shelf.price);
  const allAbs = [...storePcts.map(Math.abs), Math.abs(shelfPct)];
  const spanRaw = Math.max(Math.max(...allAbs), 1.5 * goodPct, 1.5 * badPct);
  let span = Math.ceil(spanRaw / 5) * 5;
  if (span <= 0) span = 5;
  const positionOf = (pct: number) => 50 + (pct / span) * 50;
  const zoneGoodBoundary = 50 - (goodPct / span) * 50;
  const zoneBadBoundary = 50 + (badPct / span) * 50;
  const tickStep = span > 30 ? 10 : 5;
  const ticks: VariantTick[] = [];
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
    shelfPosition: positionOf(shelfPct),
    zoneGoodBoundary,
    zoneBadBoundary,
    points: inBand.map((x, i) => ({ retailer: x.retailer, position: positionOf(storePcts[i]), url: x.url, price: x.price })),
    otherConditions,
    otherVariants,
    excluded,
    ticks,
  };
}

/**
 * The literal text sent to Gemini's code_execution tool for a spec-variant
 * product, run unchanged. Verified against a real `python3` interpreter on
 * this machine while writing it; gauge-variant.test.ts's numeric
 * expectations were cross-checked against that run.
 */
export const GAUGE_VARIANT_PYTHON_SOURCE = `def gauge_variant(shelf, offers, good_pct, bad_pct):
    import math

    def specs_match(a, b):
        keys = set(a.keys()) | set(b.keys())
        for k in keys:
            if a.get(k) != b.get(k):
                return False
        return True

    shelf_model = shelf.get("model")
    shelf_specs = shelf.get("specs") or {}
    shelf_condition = shelf.get("condition")
    shelf_price = shelf["price"]

    in_band = []
    other_conditions = []
    other_variants = []
    excluded = []

    for o in offers:
        model = o.get("model")
        specs = o.get("specs") or {}
        condition = o.get("condition")
        if model != shelf_model:
            excluded.append({"retailer": o["retailer"], "note": "different model"})
            continue
        same_specs = specs_match(specs, shelf_specs)
        if same_specs and condition == shelf_condition:
            in_band.append({"retailer": o["retailer"], "price": o["price"], "url": o.get("url"), "condition": condition})
        elif same_specs and condition != shelf_condition:
            other_conditions.append({"retailer": o["retailer"], "price": o["price"], "url": o.get("url"), "condition": condition})
        else:
            diffs = []
            keys = set(specs.keys()) | set(shelf_specs.keys())
            for k in keys:
                if specs.get(k) != shelf_specs.get(k):
                    diffs.append((k, specs.get(k)))
            if len(diffs) == 1:
                key, value = diffs[0]
                delta = o["price"] - shelf_price
                sign = "+" if delta >= 0 else "-"
                label = str(value) + " " + key + " · " + sign + "$" + format(abs(delta), ".2f")
            else:
                label = ", ".join(k + "=" + str(specs.get(k)) for k in sorted(keys) if specs.get(k) != shelf_specs.get(k))
            other_variants.append({"retailer": o["retailer"], "price": o["price"], "url": o.get("url"), "condition": condition, "label": label})

    if len(in_band) == 0:
        return {
            "usable": False,
            "otherConditions": other_conditions,
            "otherVariants": other_variants,
            "excluded": excluded,
        }

    prices = [x["price"] for x in in_band]
    n = len(prices)
    sp = sorted(prices)
    if n % 2 == 1:
        median = sp[n // 2]
    else:
        median = (sp[n // 2 - 1] + sp[n // 2]) / 2

    def pct_of(price):
        return (price - median) / median * 100

    store_pcts = [pct_of(p) for p in prices]
    shelf_pct = pct_of(shelf_price)
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
            tlabel = "middle"
        elif t > 0:
            tlabel = "+" + str(t) + "%"
        else:
            tlabel = str(t) + "%"
        ticks.append({"pct": t, "position": position_of(t), "label": tlabel})
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
        "shelfPosition": position_of(shelf_pct),
        "zoneGoodBoundary": good_boundary,
        "zoneBadBoundary": bad_boundary,
        "points": [{"retailer": x["retailer"], "position": position_of(pct), "url": x.get("url"), "price": x["price"]} for x, pct in zip(in_band, store_pcts)],
        "otherConditions": other_conditions,
        "otherVariants": other_variants,
        "excluded": excluded,
        "ticks": ticks,
    }`;

/** Same whitespace-insensitive comparison as `codeMatchesGauge` in gauge.ts -- see that function's own comment for why. */
export function codeMatchesVariantGauge(executedCode: string | null | undefined): boolean {
  if (!executedCode) return false;
  const normalize = (s: string) => s.replace(/\s+/g, '');
  return normalize(executedCode) === normalize(GAUGE_VARIANT_PYTHON_SOURCE);
}
