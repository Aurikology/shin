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
 * What the manifest says a correct answer to this row LOOKS LIKE.
 *
 * Added 2026-09-14. Until now every row had the same shape of correct answer --
 * "name this exact catalogue code" -- because every row in the manifest is in
 * the catalogue by construction. That made the false-positive rate not low but
 * UNMEASURED, and it is the number that decides whether this thing can be
 * trusted to say "I don't know" instead of confidently naming the wrong jar.
 *
 *   'identify'  the catalogue holds this product and naming it is the win.
 *   'refuse'    the catalogue does NOT hold this product, and the win is that
 *               Shin declines to name one. Loose produce (D-096: the twenty
 *               `code: null` rows -- Banana, Gala Apple, Roma Tomato) is the
 *               real-world version of this: there is no barcode, there is no
 *               catalogue row, and the only correct answer is a refusal.
 *
 * The two are scored by DIFFERENT metrics and share no denominator. A refuse row
 * has no expected code, so it is not a cascade success, a cascade failure, or a
 * pick anything; putting it in the top-1 denominator would quietly deflate every
 * retrieval number in the report.
 */
export type Expectation = 'identify' | 'refuse';

/**
 * Why a row did not end with the right code on top.
 *
 * The first five are the classes the split was asked for. The next two are not
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
 *
 * `false_positive` is the one class that belongs to the negative set and it is
 * the only one here that can occur on a row with no expected code:
 *
 *   false_positive          the manifest said REFUSE -- there is no catalogue
 *                           row for this thing -- and Shin named a catalogue row
 *                           anyway, with enough confidence to put it on the
 *                           screen as the answer. This is the failure the whole
 *                           negative set exists to count, and it is strictly
 *                           worse than any miss above: a miss says "try again",
 *                           a false positive prices the wrong product.
 */
export type Attribution =
  | 'correct'
  | 'cascade_miss'
  | 'pick_wrong'
  | 'pick_null'
  | 'settled_wrong'
  | 'size_question_override'
  | 'pick_error'
  | 'unreadable'
  | 'false_positive';

export const ATTRIBUTIONS: readonly Attribution[] = [
  'correct',
  'cascade_miss',
  'settled_wrong',
  'pick_wrong',
  'pick_null',
  'size_question_override',
  'pick_error',
  'unreadable',
  'false_positive',
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
  /**
   * The manifest's answer. Null on a `refuse` row, where there IS no right code
   * and the right answer is that nothing gets named -- not on an `identify` row,
   * which the runner refuses to observe at all without one.
   */
  readonly code: string | null;
  /** Which kind of correct answer this row has. See `Expectation`. */
  readonly expect: Expectation;
  readonly kind: string;
  readonly outcome: 'identified' | 'not_in_catalogue' | 'unreadable';
  /** The code that actually shipped, or null when nothing was identified. */
  readonly chosenCode: string | null;
  /**
   * The band on the shipped answer, null when nothing was identified.
   *
   * Only the negative set reads this, and it reads it for one reason: decision
   * 17 means `fromCrop` answers 'identified' even when it is unsure, with a low
   * band and non-empty alternates, which the route renders as the
   * identity_unsure screen rather than as "this is your product". Counting that
   * as a confident naming would score Shin's own hedge as a false positive.
   */
  readonly confidenceBand: 'high' | 'medium' | 'low' | null;
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
  /**
   * WHY the pick failed, from the error's own `failure` class, with the HTTP
   * status where the error carried one. Null when the pick did not throw.
   *
   * Added 2026-09-17. Until then `pickErrored` was a bare boolean and a
   * timeout, a 4xx naming an unparseable schema and a spend cap were one
   * value. The 09-15 run errored on 195 of 195 picks with no record of which,
   * so the cause had to be inferred from the shape of a latency histogram --
   * twice, by two separate investigations. That is the cost this field exists
   * to stop paying.
   */
  readonly pickFailure?: string | null;
  readonly pickStatus?: number | null;
  /** How many API calls the pick actually spent before giving up. */
  readonly pickAttempts?: number | null;
  /** The pick call's OWN wall time, so its latency need not be inferred by subtraction. */
  readonly pickMs?: number | null;
  /**
   * The index the model named, kept apart from `pickedCode`. A null code has
   * two unrelated causes that were indistinguishable before this: the model
   * answered `null` deliberately, which `PICK_SYSTEM` calls "a correct and
   * expected answer" because a wrong row is worse than no row, or it named an
   * index that was not among the rows it was given. The first is the feature
   * working and the second is a defect.
   */
  readonly pickedIndex?: number | null;
  /** How many candidate rows the pick was offered, so an out-of-range index is visible as one. */
  readonly pickRowCount?: number | null;
}

/** 1-based position of `code` in `codes`, or null when it is absent. */
export function rankOf(codes: readonly string[], code: string): number | null {
  const i = codes.indexOf(code);
  return i === -1 ? null : i + 1;
}

/**
 * Did this run NAME a catalogue product to the person holding the phone?
 *
 * The whole negative set turns on this one predicate, so it is written out
 * rather than inlined. Three of `fromCrop`'s outcomes are refusals and one is
 * not:
 *
 *   'not_in_catalogue'  decision 22, the explicit "we know what it is and we do
 *                       not carry it". The branch this eval was built to make
 *                       fire at all.
 *   'unreadable'        no answer was given. Not a good scan, but nothing was
 *                       named, so nothing was named WRONG.
 *   'identified' + low band + no confident pick
 *                       decision 17 / the contract's section 3: unsure is
 *                       expressed as an identification with a low band and
 *                       alternates, and the route turns that into the
 *                       identity_unsure screen. A hedge is not a claim.
 *   'identified', anything else
 *                       a claim. On a refuse row, a FALSE one.
 *
 * Note what is deliberately NOT a get-out: naming the wrong row confidently is a
 * false positive whether or not the candidate list was any good, and a pick pass
 * that chose an index is a confident pick even if the six-signal band came out
 * low -- the pick capped the band, it did not abstain.
 */
export function namedACatalogueRow(o: StageObservation): boolean {
  if (o.outcome !== 'identified') return false;
  if (o.chosenCode === null) return false;
  if (o.confidenceBand === 'low' && o.pickedCode === null) return false;
  return true;
}

export function attribute(o: StageObservation): Attribution {
  /*
   * The negative set is scored first and separately, because every test below
   * this line asks "was the expected code found", and a refuse row has no
   * expected code to find. Falling through would attribute a correct refusal as
   * `cascade_miss` -- blaming retrieval for working exactly as intended.
   */
  if (o.expect === 'refuse') return namedACatalogueRow(o) ? 'false_positive' : 'correct';
  /*
   * An `identify` row with no expected code is a manifest bug, and the dangerous
   * version of it is silent: `chosenCode === o.code` would be null === null and
   * score a SPURIOUS 'correct' the moment the outcome carried no chosen code.
   * The runner filters these out before they reach here; this is the second
   * lock, and it is loud on purpose.
   */
  if (o.code === null) {
    throw new Error("an expect:'identify' observation reached attribute() with a null code");
  }
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

/**
 * The negative set: how often Shin knows that it does NOT know.
 *
 * THE DENOMINATOR IS THE WHOLE POINT. It is refuse rows that were actually
 * RUN -- a manifest slot whose photo does not exist yet never reaches the stage,
 * never produces an observation, and so is not in here at all. It stays PENDING
 * and counts as nothing: not a refusal, not a false positive, not a trial. A
 * false-positive rate that quietly counted unphotographed slots as successes
 * would read as a perfect score for a test that never ran, which is the exact
 * failure mode this block was added to prevent.
 *
 * Every rate is `number | null`, null at a zero denominator, and the report must
 * print the null rather than a 0% computed from nothing.
 */
export interface NegativeMetrics {
  /** Refuse rows that had a photo and were run. Zero today: see the report. */
  readonly scored: number;
  /** Refuse rows where a catalogue product was named anyway. */
  readonly falsePositives: number;
  readonly correctRefusals: number;
  /** Null at a zero denominator. Never print 0% from 0/0. */
  readonly falsePositiveRate: number | null;
  readonly correctRefusalRate: number | null;
  /** Wilson on the false-positive proportion, null at a zero denominator. */
  readonly falsePositiveInterval: Interval | null;
  /** HOW the correct refusals refused, because the three are not equivalent. */
  readonly refusedBy: {
    /** Decision 22: knew what it was, said we do not carry it. The good one. */
    readonly notInCatalogue: number;
    /** No answer at all. A refusal, but it refuses everything equally. */
    readonly unreadable: number;
    /** Decision 17's identity_unsure screen: candidates shown, none claimed. */
    readonly unsureNoConfidentPick: number;
  };
}

export function summariseNegative(obs: readonly StageObservation[]): NegativeMetrics {
  const rows = obs.filter((o) => o.expect === 'refuse');
  const named = rows.filter(namedACatalogueRow);
  const refused = rows.filter((o) => !namedACatalogueRow(o));
  const n = rows.length;
  return {
    scored: n,
    falsePositives: named.length,
    correctRefusals: refused.length,
    falsePositiveRate: n === 0 ? null : named.length / n,
    correctRefusalRate: n === 0 ? null : refused.length / n,
    falsePositiveInterval: n === 0 ? null : wilson(named.length, n),
    refusedBy: {
      notInCatalogue: refused.filter((o) => o.outcome === 'not_in_catalogue').length,
      unreadable: refused.filter((o) => o.outcome === 'unreadable').length,
      unsureNoConfidentPick: refused.filter((o) => o.outcome === 'identified').length,
    },
  };
}

export interface StageMetrics {
  /** `expect:'identify'` rows only. A refuse row has no top-1 to be part of. */
  readonly scored: number;
  readonly top1: number;
  readonly top1Interval: Interval;
  readonly top3: number;
  readonly barcodeShortCircuit: number;
  readonly notInCatalogue: number;
  readonly cascade: CascadeMetrics;
  readonly pick: PickMetrics;
  /** Over ALL rows, positive and negative: the only field that mixes them. */
  readonly attribution: Record<Attribution, number>;
  /** The negative set, scored on its own denominator. */
  readonly negative: NegativeMetrics;
}

export function summarise(obs: readonly StageObservation[]): StageMetrics {
  /*
   * THE PARTITION, 2026-09-14. Everything from here to `attribution` is about
   * finding an expected code, so it runs over `expect:'identify'` rows only.
   * Leaving refuse rows in would put twenty rows with no right answer into the
   * top-1 denominator and drag every retrieval number in the report down by a
   * third for a reason that has nothing to do with retrieval.
   */
  const positives = obs.filter(
    (o): o is StageObservation & { code: string } => o.expect === 'identify' && o.code !== null,
  );
  const scored = positives.length;
  const top1 = positives.filter((o) => o.chosenCode !== null && o.chosenCode === o.code).length;

  const cascadePool = positives.filter((o) => o.cascadeRan && !o.barcodeShortCircuit);
  const ranks = cascadePool.map((o) => rankOf([...o.cascadeCodes], o.code));
  const within = (k: number) => ranks.filter((r) => r !== null && r <= k).length;
  const mrr =
    cascadePool.length === 0
      ? 0
      : ranks.reduce<number>((sum, r) => sum + (r === null ? 0 : 1 / r), 0) / cascadePool.length;

  const pickPool = positives.filter(
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
    barcodeShortCircuit: positives.filter((o) => o.barcodeShortCircuit).length,
    notInCatalogue: positives.filter((o) => o.outcome === 'not_in_catalogue').length,
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
    negative: summariseNegative(obs),
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
