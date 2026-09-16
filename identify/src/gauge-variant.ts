/**
 * The price gauge's placement arithmetic for SPEC-VARIANT goods: electronics,
 * appliances, anything identified by a model number and a set of specs.
 *
 * WHY THIS IS NOT `gauge.ts` WITH A FLAG. Unit scaling is the whole of
 * `gauge.ts` and it is meaningless here: 256 GB is not worth exactly twice
 * 128 GB, and a 65 inch panel is not worth exactly 65/55 of a 55 inch one.
 * There is no unit to divide by, so the line is built from RAW prices and the
 * comparison set is narrowed instead of normalised. Which of the two
 * algorithms runs is the caller's decision, from the category, never guessed
 * here.
 *
 * Everything in `gauge.ts`'s header about the three artifacts applies here
 * unchanged and is not repeated: `GAUGE_VARIANT_PYTHON_SOURCE` is the exact
 * text Gemini runs in its own sandbox, `computeVariantGauge` is a TypeScript
 * twin
 *   *** THAT MUST NEVER BE RUN ON A REAL GROUNDED PRICE, BECAUSE THAT WOULD ***
 *   *** BE THIS APP ANALYZING A GROUNDED RESULT, THE ONE THING GOOGLE'S     ***
 *   *** GROUNDING TERMS FORBID,                                             ***
 * and `codeMatchesVariantGauge` proves the sandbox ran that exact text.
 *
 * THE RULES:
 *   1. The line uses ONLY offers of the exact same variant: same model
 *      number, same price-relevant specs, same condition.
 *   2. Other conditions of the same variant (new, open-box, refurbished,
 *      used) come back as their own list, never on the line. A refurbished
 *      unit is a different product at the same model number.
 *   3. Other variants of the same model come back as their own list, each
 *      carrying the differing spec and the price difference from the shelf
 *      price.
 *   4. A different model entirely is not this function's problem, but a
 *      grounded search can still return one, so it is excluded with a note
 *      rather than crashed on or guessed at.
 *
 * Span, position, zone boundaries, ticks and the zone code are computed
 * exactly as in `gauge.ts`, over raw prices instead of unit prices, and the
 * zone codes are the same NEUTRAL codes for the same reason: the words on the
 * zones name the range the user set, never Shin's judgment of the price.
 *
 * DETERMINISM. The differing-spec label is built from a SORTED key list on
 * both sides. Iterating a Python `set` of strings is not reproducible across
 * processes (string hashing is salted per run), so an unsorted version could
 * produce two different labels for one product while both passed
 * `codeMatchesVariantGauge`, which only proves the source matched.
 *
 * THE LONE-CLAIM GUARD, D-113, carried in before this file has a single
 * caller. `gauge.ts` shipped with a defect where a median of one grounded
 * offer is that offer, so an ordinary price got drawn as a full verdict line
 * against a "middle" that was really just itself -- measured in the wild as
 * one Walmart offer rendering as "83% under the middle of 1 prices" against a
 * hand-priced truth of $1.74. Nothing about that arithmetic is specific to
 * unit prices: the same one-offer median would happen here the day a
 * retailer's spec-variant search comes back with a single exact match, so the
 * guard is ported now rather than waited on until this file is wired and the
 * defect reappears under a new number. See `computeVariantGauge`'s own
 * comments for where each piece came from.
 */

import type { GaugeZone, GaugeConfidence, GaugeShortfall, GaugeShortfallCode } from './gauge.ts';

export type { GaugeZone, GaugeConfidence, GaugeShortfall, GaugeShortfallCode };

/**
 * `spine/src/money.ts` is a zero-import leaf module, so this pulls in nothing
 * behind it, the same reason `gauge.ts` imports it rather than writing its
 * own copy. The predicate is "a finite number above zero" and does not care
 * whether the number is a unit price or a raw one, which is what this file
 * needs it for.
 */
import { isUsableAmount } from '../../spine/src/money.ts';

export type VariantCondition = 'new' | 'open-box' | 'refurbished' | 'used';

/** Price-relevant specs only: storage, RAM, panel size, chip, and colour when colour is priced differently. */
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

/** Same model and specs, different condition. Listed, never placed on the line. */
export interface VariantOtherCondition {
  readonly retailer: string;
  readonly price: number;
  readonly url: string | null;
  readonly condition: VariantCondition;
}

/** Same model, at least one differing spec. `label` carries the differing spec and the price difference, e.g. "512 GB storage · +$250.00". */
export interface VariantOtherVariant {
  readonly retailer: string;
  readonly price: number;
  readonly url: string | null;
  readonly condition: VariantCondition;
  readonly label: string;
}

/**
 * Why one offer is not on the line, this file's version of `gauge.ts`'s
 * `GaugeExclusionCode`. A fact about the offer, never a reading of its price.
 */
export type VariantExclusionCode =
  /** A different model number entirely: not this function's problem to price, only to set aside. */
  | 'different_model'
  /** The price field was not a usable amount at all: absent, zero, negative or not a number. */
  | 'unusable_price'
  /**
   * Held off the line for sitting outside the lone-claim band, D-113. A fact
   * about how far the offer is from the others of the exact same variant and
   * condition, never a reading of whether its price is right.
   */
  | 'lone_claim';

/**
 * The English of each code. One note per code with nothing of the offer in
 * it, same reasoning as `EXCLUSION_NOTES` in `gauge.ts`: a client holding
 * only the code can render its own sentence, in its own language, from the
 * code alone. Swept against the grading-word list in
 * `app/test/refusal-swaps.test.mjs` by `test/item-rules.test.ts`.
 */
const VARIANT_EXCLUSION_NOTES: Record<VariantExclusionCode, string> = {
  different_model: 'different model',
  unusable_price: 'no usable price given',
  lone_claim: 'far from the other prices found',
};

export interface VariantExcluded {
  readonly retailer: string;
  readonly code: VariantExclusionCode;
  /** English, and a function of `code` alone. Translate from the code, never from this. */
  readonly note: string;
  /** The offer's own price, as given, so a held or set-aside claim is still visible to the reader. */
  readonly price: number;
  readonly url: string | null;
}

export interface VariantGaugeUsable {
  readonly usable: true;
  readonly median: number;
  readonly percent: number;
  readonly zone: GaugeZone;
  readonly n: number;
  readonly shelfPosition: number;
  readonly zoneUnderBoundary: number;
  readonly zoneOverBoundary: number;
  readonly points: readonly VariantPoint[];
  readonly otherConditions: readonly VariantOtherCondition[];
  readonly otherVariants: readonly VariantOtherVariant[];
  readonly excluded: readonly VariantExcluded[];
  readonly ticks: readonly VariantTick[];
  readonly confidence: GaugeConfidence;
  readonly shortfalls: readonly GaugeShortfall[];
}

/**
 * WHY there is no line, `gauge.ts`'s `GaugeNoLineReason` narrowed to what can
 * actually happen here. There is no shelf-size reason in this file -- a
 * spec-variant shelf item always has a model and a price, never a size to be
 * missing -- so only the two offer-count reasons carry over.
 */
export type VariantNoLineReason = 'single_offer' | 'no_offers_on_line';

export interface VariantGaugeUnusable {
  readonly usable: false;
  readonly otherConditions: readonly VariantOtherCondition[];
  readonly otherVariants: readonly VariantOtherVariant[];
  readonly excluded: readonly VariantExcluded[];
  readonly reason: VariantNoLineReason;
}

export type VariantGaugeResult = VariantGaugeUsable | VariantGaugeUnusable;

/** Sorted union of both spec key sets, so the two languages walk them in one order. */
function sortedKeys(a: VariantSpecs, b: VariantSpecs): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
}

function specsMatch(a: VariantSpecs, b: VariantSpecs): boolean {
  for (const k of sortedKeys(a, b)) if (a[k] !== b[k]) return false;
  return true;
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * THE LONE-CLAIM BAND, ported from `gauge.ts`'s own port of Shin's engine,
 * D-113.
 *
 * `spine/src/spine.ts:921-922` has held these two numbers since the pilot;
 * `gauge.ts` copied them for the size-variant line, and this is that same
 * copy made a second time, not a fresh guess. Copied rather than imported
 * from `gauge.ts` at runtime so this file's only dependency stays its own
 * test, matching why `gauge.ts` copies from `spine.ts` instead of importing
 * it.
 *
 * DESIGN DEFAULTS, NOT MEASUREMENTS -- spine says so about itself and the
 * caveat travels with every copy of the pair. Low is tighter than high on
 * purpose: a fake low price is the direction that sends someone shopping for
 * a laptop at a price nobody will actually sell it for.
 *
 * Pinned against spine's own constants by a test-only import, exactly as
 * `gauge.ts` pins its own copy, so the numbers drifting apart across three
 * files fails a build instead of going unnoticed.
 */
export const LONE_CLAIM_FLOOR = 0.5;
export const LONE_CLAIM_CEILING = 2.5;

const SHORTFALL_NOTES: Record<GaugeShortfallCode, string> = {
  thin_evidence: 'only two prices found, so the middle is rough',
  claim_held: 'one price was too far from the others to place',
  spread_unresolved: 'the prices found disagree too much to say which is typical',
};

interface BandEntry {
  retailer: string;
  price: number;
  url: string | null;
}

/**
 * The median of every price EXCEPT the one being judged, over the raw prices
 * of the exact same model, specs and condition.
 *
 * Leave-one-out, and that is the whole point: `spine.ts:1099-1131` computes
 * its baseline the same way, because a claim compared against a set that
 * includes itself is compared partly against itself. At one offer there is
 * nothing left to be an outlier FROM, so this returns null and the band
 * cannot fire.
 */
function leaveOneOutReference(index: number, prices: readonly number[]): number | null {
  const others = prices.filter((_, i) => i !== index);
  if (others.length < 1) return null;
  return medianOf(others);
}

/** Mirrors `spine.ts:1130`. A reference of zero gives no ratio to test against. */
function isLoneClaim(price: number, reference: number): boolean {
  if (!(reference > 0)) return false;
  return price < reference * LONE_CLAIM_FLOOR || price > reference * LONE_CLAIM_CEILING;
}

/**
 * Hold back offers outside the band -- BUT THE HOLD CAN NEVER EMPTY THE SET.
 *
 * This is `spine.ts:417` carried across verbatim in spirit, the same way
 * `gauge.ts` already carries it:
 *   `vetted = held.length === 0 ? comparison : comparison.filter(...)`
 * When every offer disagrees with every other, they are not one odd claim
 * among agreeing friends, and dropping them all would leave the shopper with
 * nothing. So the set comes back whole with the disagreement NAMED instead.
 */
function applyClaimHold(inBand: readonly BandEntry[]): {
  kept: BandEntry[];
  held: BandEntry[];
  spreadUnresolved: boolean;
} {
  /**
   * THE BAND NEEDS THREE OFFERS BEFORE IT MAY HOLD ANYTHING, carried from
   * `gauge.ts` for the identical reason: at two offers, leave-one-out compares
   * each price against the SINGLE other price, so "which of these two is the
   * odd one" has no answer. Two retailers pricing the exact same new laptop
   * $400 apart is not evidence that one of them is wrong -- it is exactly the
   * gap Shin exists to surface -- but past a 2x spread the cheaper one is
   * always a lone claim of the dearer one with only one other price to check
   * it against. So below three, both prices stand and the line is marked thin
   * instead.
   */
  if (inBand.length < 3) return { kept: [...inBand], held: [], spreadUnresolved: false };
  const prices = inBand.map((x) => x.price);
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
 * What the line rests on, as a flag plus named shortfalls. Deliberately the
 * same shape as `gauge.ts`'s `confidenceOf` and not spine's own: this side of
 * the app does not have witnesses, seller identity or observation dates to
 * grade against, only the count of prices actually kept.
 */
function confidenceOf(
  keptCount: number,
  heldCount: number,
  spreadUnresolved: boolean,
): { band: GaugeConfidence; shortfalls: GaugeShortfall[] } {
  const shortfalls: GaugeShortfall[] = [];
  if (keptCount === 2) shortfalls.push({ code: 'thin_evidence', note: SHORTFALL_NOTES.thin_evidence });
  if (heldCount > 0) shortfalls.push({ code: 'claim_held', note: SHORTFALL_NOTES.claim_held });
  if (spreadUnresolved) shortfalls.push({ code: 'spread_unresolved', note: SHORTFALL_NOTES.spread_unresolved });
  return { band: shortfalls.length > 0 ? 'thin' : 'ok', shortfalls };
}

/**
 * The differing-spec and price-difference text for one other variant.
 *
 * A spec the offer does not list at all reads "no <spec>" rather than
 * "undefined <spec>", because a shopper reading the list has to be able to
 * tell "this one is 512 GB" from "this one did not say".
 */
function variantLabel(offerSpecs: VariantSpecs, shelfSpecs: VariantSpecs, delta: number): string {
  const diffs = sortedKeys(offerSpecs, shelfSpecs)
    .filter((k) => offerSpecs[k] !== shelfSpecs[k])
    .map((k) => (offerSpecs[k] === undefined ? `no ${k}` : `${offerSpecs[k]} ${k}`));
  const sign = delta >= 0 ? '+' : '-';
  return `${diffs.join(', ')} · ${sign}$${Math.abs(delta).toFixed(2)}`;
}

/**
 * The TypeScript twin, FOR LOCAL PROOF AGAINST FAKE NUMBERS ONLY.
 *
 * *** NEVER CALL THIS ON A REAL GROUNDED PRICE. *** Its only caller is
 * `test/gauge-variant.test.ts`. Production runs
 * `GAUGE_VARIANT_PYTHON_SOURCE` inside Gemini's sandbox and verifies it with
 * `codeMatchesVariantGauge`.
 *
 * `underPct` and `overPct` are the two percentages the USER set, both
 * defaulting to 10.
 */
export function computeVariantGauge(
  shelf: VariantShelfItem,
  offers: readonly VariantOffer[],
  underPct = 10,
  overPct = 10,
): VariantGaugeResult {
  const inBand: BandEntry[] = [];
  const otherConditions: VariantOtherCondition[] = [];
  const otherVariants: VariantOtherVariant[] = [];
  const excluded: VariantExcluded[] = [];

  for (const o of offers) {
    // Before any other question about the offer, same as `gauge.ts`'s own
    // cascade: a price that is absent, zero, negative or not a number cannot
    // be placed anywhere -- not on the line, not in `otherConditions`, not in
    // `otherVariants` -- because letting it into any of those lists would
    // draw a false price difference in a label or a false median for a model
    // that happens to match. Checked first and unconditionally, before the
    // model comparison, because a price that cannot be trusted at all cannot
    // be trusted enough to answer "which offer is this."
    if (!isUsableAmount(o.price)) {
      excluded.push({ retailer: o.retailer, code: 'unusable_price', note: VARIANT_EXCLUSION_NOTES.unusable_price, price: o.price, url: o.url });
      continue;
    }
    if (o.model !== shelf.model) {
      excluded.push({ retailer: o.retailer, code: 'different_model', note: VARIANT_EXCLUSION_NOTES.different_model, price: o.price, url: o.url });
      continue;
    }
    const sameSpecs = specsMatch(o.specs, shelf.specs);
    if (sameSpecs && o.condition === shelf.condition) {
      inBand.push({ retailer: o.retailer, price: o.price, url: o.url });
    } else if (sameSpecs) {
      otherConditions.push({ retailer: o.retailer, price: o.price, url: o.url, condition: o.condition });
    } else {
      // A differing spec wins over a differing condition: the thing on the
      // shelf is a different box, and the condition is then just one more
      // fact about that box, carried in the entry rather than splitting it.
      otherVariants.push({
        retailer: o.retailer,
        price: o.price,
        url: o.url,
        condition: o.condition,
        label: variantLabel(o.specs, shelf.specs, o.price - shelf.price),
      });
    }
  }

  // No offer of this exact variant and condition means no median and so no
  // verdict. The lists still come back: "nobody else has this one, here is
  // what they do have" is useful, and a verdict built on other variants would
  // not be.
  if (inBand.length === 0) {
    return { usable: false, otherConditions, otherVariants, excluded, reason: 'no_offers_on_line' };
  }

  const { kept, held, spreadUnresolved } = applyClaimHold(inBand);
  for (const h of held) {
    excluded.push({ retailer: h.retailer, code: 'lone_claim', note: VARIANT_EXCLUSION_NOTES.lone_claim, price: h.price, url: h.url });
  }

  /**
   * D-113, THE HALF THE BAND CANNOT CATCH. At one offer the median IS that
   * offer, every percentage is measured against the claim itself, and the
   * line would say the shopper is far from a middle that does not exist.
   * There is no arithmetic that fixes this, because there is no second
   * number. The other-condition and other-variant lists are still returned --
   * only the LINE is withheld.
   */
  if (kept.length < 2) {
    return { usable: false, otherConditions, otherVariants, excluded, reason: 'single_offer' };
  }

  const { band: confidence, shortfalls } = confidenceOf(kept.length, held.length, spreadUnresolved);
  const prices = kept.map((x) => x.price);
  const mid = medianOf(prices);
  // Same divide-by-zero guard and same reason as gauge.ts.
  const pctOf = (price: number) => (mid === 0 ? 0 : ((price - mid) / mid) * 100);
  const storePcts = prices.map(pctOf);
  const shelfPct = pctOf(shelf.price);
  const allAbs = [...storePcts.map(Math.abs), Math.abs(shelfPct)];
  const spanRaw = Math.max(Math.max(...allAbs), 1.5 * underPct, 1.5 * overPct);
  let span = Math.ceil(spanRaw / 5) * 5;
  if (span <= 0) span = 5;

  const positionOf = (pct: number) => 50 + (pct / span) * 50;
  const zoneUnderBoundary = 50 - (underPct / span) * 50;
  const zoneOverBoundary = 50 + (overPct / span) * 50;
  const tickStep = span > 30 ? 10 : 5;
  const ticks: VariantTick[] = [];
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
    shelfPosition: positionOf(shelfPct),
    zoneUnderBoundary,
    zoneOverBoundary,
    points: kept.map((x, i) => ({ retailer: x.retailer, position: positionOf(storePcts[i]), url: x.url, price: x.price })),
    otherConditions,
    otherVariants,
    excluded,
    ticks,
    confidence,
    shortfalls,
  };
}

/**
 * The literal text sent to Gemini's code_execution tool for a spec-variant
 * product, run there unchanged. Standard library only, deterministic, well
 * inside the sandbox's 30 second limit.
 */
export const GAUGE_VARIANT_PYTHON_SOURCE = `def gauge_variant(shelf, offers, under_pct, over_pct):
    import math

    def sorted_keys(a, b):
        return sorted(set(a.keys()) | set(b.keys()))

    def specs_match(a, b):
        for k in sorted_keys(a, b):
            if a.get(k) != b.get(k):
                return False
        return True

    def variant_label(offer_specs, shelf_specs, delta):
        diffs = []
        for k in sorted_keys(offer_specs, shelf_specs):
            if offer_specs.get(k) != shelf_specs.get(k):
                if k not in offer_specs:
                    diffs.append("no " + k)
                else:
                    diffs.append(str(offer_specs[k]) + " " + k)
        sign = "+" if delta >= 0 else "-"
        return ", ".join(diffs) + " · " + sign + "$" + format(abs(delta), ".2f")

    shelf_model = shelf.get("model")
    shelf_specs = shelf.get("specs") or {}
    shelf_condition = shelf.get("condition")
    shelf_price = shelf["price"]

    in_band = []
    other_conditions = []
    other_variants = []
    excluded = []

    for o in offers:
        specs = o.get("specs") or {}
        condition = o.get("condition")
        if o.get("model") != shelf_model:
            excluded.append({"retailer": o["retailer"], "note": "different model"})
            continue
        same_specs = specs_match(specs, shelf_specs)
        if same_specs and condition == shelf_condition:
            in_band.append({"retailer": o["retailer"], "price": o["price"], "url": o.get("url")})
        elif same_specs:
            other_conditions.append({"retailer": o["retailer"], "price": o["price"], "url": o.get("url"), "condition": condition})
        else:
            other_variants.append({
                "retailer": o["retailer"],
                "price": o["price"],
                "url": o.get("url"),
                "condition": condition,
                "label": variant_label(specs, shelf_specs, o["price"] - shelf_price),
            })

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
        if median == 0:
            return 0.0
        return (price - median) / median * 100

    store_pcts = [pct_of(p) for p in prices]
    shelf_pct = pct_of(shelf_price)
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
        "shelfPosition": position_of(shelf_pct),
        "zoneUnderBoundary": under_boundary,
        "zoneOverBoundary": over_boundary,
        "points": [{"retailer": x["retailer"], "position": position_of(pct), "url": x.get("url"), "price": x["price"]} for x, pct in zip(in_band, store_pcts)],
        "otherConditions": other_conditions,
        "otherVariants": other_variants,
        "excluded": excluded,
        "ticks": ticks,
    }`;

/** Same whitespace-insensitive comparison, and the same no-verdict-on-mismatch consequence, as `codeMatchesGauge` in gauge.ts. */
export function codeMatchesVariantGauge(executedCode: string | null | undefined): boolean {
  if (!executedCode) return false;
  const normalize = (s: string) => s.replace(/\s+/g, '');
  return normalize(executedCode) === normalize(GAUGE_VARIANT_PYTHON_SOURCE);
}
