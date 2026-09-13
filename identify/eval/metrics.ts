/**
 * Stage-split metrics for the identify eval.
 *
 * WHY THIS FILE EXISTS. Until 2026-09-13 the eval printed one number, top-1, and
 * a wrong answer had exactly one shape in it. But two completely different
 * things produce a wrong answer here, and they have opposite fixes:
 *
 *   the catalogue cascade never surfaced the right row  -> a catalogue and query
 *                                                          problem (embeddings,
 *                                                          the three queries,
 *                                                          what is in the db)
 *   the row WAS surfaced and the pick pass chose another -> a prompt and model
 *                                                          problem
 *
 * One number cannot direct either piece of work, so this file splits the run
 * into the two stages and reports them separately: cascade recall (the retrieval
 * ceiling) and pick precision (what the second call does with that ceiling).
 *
 * Everything here is pure. It takes a `StageObservation` per row -- what the
 * runner watched happen through the catalogue adapter and the pick call -- and
 * returns counts. No I/O, no model, no clock, which is what lets the whole thing
 * be tested with hand-built fixtures in `test/eval-metrics.test.ts`.
 */

/**
 * Why a row did not end with the right code on top.
 *
 * The first five are the classes the split was asked for. The last two are not
 * inventions either: both are reachable branches of `identify.ts`'s `fromCrop`
 * that none of the five describe, and both print as 0 in a dry run.
 *
 *   size_question_override  the pick named the right index, and decision 19's
 *                           size-question branch then shipped `options[0]`,
 *                           which was a different row. The pick was right and
 *                           the answer was still wrong; calling that `pick_wrong`
 *                           would send the wrong stage the blame.
 *   pick_error              the pick call threw (timeout, cap, malformed) and
 *                           `fromCrop` fell back to pass one's ranking, which
 *                           was wrong. Not the model choosing badly -- it never
 *                           chose.
 */
export type Attribution =
  | 'correct'
  | 'cascade_miss'
  | 'pick_wrong'
  | 'pick_null'
  | 'settled_wrong'
  | 'size_question_override'
  | 'pick_error'
  | 'unreadable';

export const ATTRIBUTIONS: readonly Attribution[] = [
  'correct',
  'cascade_miss',
  'settled_wrong',
  'pick_wrong',
  'pick_null',
  'size_question_override',
  'pick_error',
  'unreadable',
];

/**
 * One row as the runner watched it, not as the outcome described it.
 *
 * `chosenCode` is what shipped; everything else is the machinery underneath,
 * recorded by wrapping the catalogue lookup and the pick call rather than by
 * asking `IdentifyOutcome`, which does not carry the candidate set the pick saw
 * or whether the barcode short-circuited.
 */
export interface StageObservation {
  /** The manifest's answer. Rows with no expected code are never scored. */
  readonly code: string;
  readonly kind: string;
  readonly outcome: 'identified' | 'not_in_catalogue' | 'unreadable';
  /** The code that actually shipped, or null when nothing was identified. */
  readonly chosenCode: string | null;
  /**
   * `gtinFrom` validated a barcode off the photo AND the catalogue resolved it,
   * so the text cascade never ran at all. These rows are excluded from cascade
   * and pick statistics: counting a barcode hit as retrieval success flatters
   * both stages with work neither of them did.
   */
  readonly barcodeShortCircuit: boolean;
  /** False for an unreadable row and for a short-circuited one. */
  readonly cascadeRan: boolean;
  /** The union of the three queries, in the order the pick would see it. */
  readonly cascadeCodes: readonly string[];
  readonly pickFired: boolean;
  /** The pick call threw and `fromCrop` fell back to pass one. */
  readonly pickErrored: boolean;
  /** The code the pick itself chose; null when it abstained or never ran. */
  readonly pickedCode: string | null;
}

/** 1-based position of `code` in `codes`, or null when it is absent. */
export function rankOf(codes: readonly string[], code: string): number | null {
  const i = codes.indexOf(code);
  return i === -1 ? null : i + 1;
}

export function attribute(o: StageObservation): Attribution {
  if (o.chosenCode !== null && o.chosenCode === o.code) return 'correct';
  if (o.outcome === 'unreadable') return 'unreadable';
  // A short-circuited row that is still wrong means the catalogue answered a
  // valid GTIN with another product. That is a catalogue problem, not a pick
  // one, so it lands on the retrieval side of the split.
  if (o.barcodeShortCircuit) return 'cascade_miss';
  if (!o.cascadeCodes.includes(o.code)) return 'cascade_miss';
  if (!o.pickFired) return 'settled_wrong';
  if (o.pickErrored) return 'pick_error';
  if (o.pickedCode === null) return 'pick_null';
  if (o.pickedCode === o.code) return 'size_question_override';
  return 'pick_wrong';
}

export interface Interval {
  readonly low: number;
  readonly high: number;
}

/**
 * Wilson score interval on a proportion.
 *
 * Printed next to top-1 because this set is 40 photos and a point estimate off
 * 40 trials is not a measurement anybody should quote: an observed 90% at n=40
 * is a 95% interval of roughly 77% to 97%, which is the difference between
 * "ship it" and "this needs another pass". Wilson rather than the normal
 * approximation because the normal one is visibly wrong near 0 and 1, which is
 * exactly where these numbers sit.
 *
 * n = 0 returns the whole range, because no trials is no information.
 */
export function wilson(successes: number, n: number, z = 1.96): Interval {
  if (n <= 0) return { low: 0, high: 1 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) };
}

export interface CascadeMetrics {
  /** Rows where the cascade actually ran: no barcode short-circuit, readable. */
  readonly denominator: number;
  readonly recall1: number;
  readonly recall3: number;
  readonly recall10: number;
  /**
   * Mean reciprocal rank over the candidate list. MRR and not mAP: each photo
   * has exactly one correct row, and average precision over a single relevant
   * document IS the reciprocal rank, so mAP here would be the same number under
   * a name that implies a ranking problem this set does not have.
   */
  readonly mrr: number;
}

export interface PickMetrics {
  /**
   * Rows where the right answer was in the candidate set AND the pick fired and
   * returned. A scan where pass one settled and the pick never ran is not a pick
   * success and is not in here; neither is a pick that threw.
   */
  readonly denominator: number;
  readonly correct: number;
  /** Null when the denominator is 0, never 0/0 printed as 0%. */
  readonly precision: number | null;
}

export interface StageMetrics {
  readonly scored: number;
  readonly top1: number;
  readonly top1Interval: Interval;
  readonly top3: number;
  readonly barcodeShortCircuit: number;
  readonly notInCatalogue: number;
  readonly cascade: CascadeMetrics;
  readonly pick: PickMetrics;
  readonly attribution: Record<Attribution, number>;
}

export function summarise(obs: readonly StageObservation[]): StageMetrics {
  const scored = obs.length;
  const top1 = obs.filter((o) => o.chosenCode !== null && o.chosenCode === o.code).length;

  const cascadePool = obs.filter((o) => o.cascadeRan && !o.barcodeShortCircuit);
  const ranks = cascadePool.map((o) => rankOf([...o.cascadeCodes], o.code));
  const within = (k: number) => ranks.filter((r) => r !== null && r <= k).length;
  const mrr =
    cascadePool.length === 0
      ? 0
      : ranks.reduce<number>((sum, r) => sum + (r === null ? 0 : 1 / r), 0) / cascadePool.length;

  const pickPool = obs.filter(
    (o) =>
      !o.barcodeShortCircuit &&
      o.pickFired &&
      !o.pickErrored &&
      o.cascadeCodes.includes(o.code),
  );
  const pickCorrect = pickPool.filter((o) => o.pickedCode === o.code).length;

  const attribution = Object.fromEntries(ATTRIBUTIONS.map((a) => [a, 0])) as Record<
    Attribution,
    number
  >;
  for (const o of obs) attribution[attribute(o)] += 1;

  // top-3 over what shipped: the chosen row plus its alternates is not visible
  // here, so this is the cascade's own top 3, which is the honest thing this
  // file can see. The runner keeps printing the outcome-derived top-3 alongside.
  const top3 = ranks.filter((r) => r !== null && r <= 3).length;

  return {
    scored,
    top1,
    top1Interval: wilson(top1, scored),
    top3,
    barcodeShortCircuit: obs.filter((o) => o.barcodeShortCircuit).length,
    notInCatalogue: obs.filter((o) => o.outcome === 'not_in_catalogue').length,
    cascade: {
      denominator: cascadePool.length,
      recall1: within(1),
      recall3: within(3),
      recall10: within(10),
      mrr,
    },
    pick: {
      denominator: pickPool.length,
      correct: pickCorrect,
      precision: pickPool.length === 0 ? null : pickCorrect / pickPool.length,
    },
    attribution,
  };
}

/**
 * The same metrics per manifest `kind`.
 *
 * Sliced because the buckets fail for different reasons and need different work:
 * a size-pair miss is the catalogue storing a multipack's net quantity against a
 * label that prints its unit size, a store-brand miss is a brand the model reads
 * off the pack that no catalogue row carries. One blended number hides both.
 */
export function summariseByKind(obs: readonly StageObservation[]): Map<string, StageMetrics> {
  const byKind = new Map<string, StageObservation[]>();
  for (const o of obs) {
    const list = byKind.get(o.kind);
    if (list) list.push(o);
    else byKind.set(o.kind, [o]);
  }
  return new Map([...byKind].map(([kind, rows]) => [kind, summarise(rows)]));
}

export function pct(n: number, d: number): string {
  return d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`;
}
