/**
 * How sure we actually are. Decision 18, and the reason it is its own file.
 *
 * The model returns a number it calls its confidence. Using that number as the
 * answer is the single easiest mistake available here, and it is the one this
 * file exists to prevent. A language model's self-reported confidence is not
 * calibrated: it is a plausible-sounding number produced by the same process
 * that produced the possibly-wrong answer, and it is high exactly when the model
 * is fluently wrong. The pilot's worst failure was a confident wrong identity.
 *
 * So confidence is computed here from signals that come from somewhere else:
 *
 *   barcode      truth, not opinion. A read barcode is not a guess at all.
 *   catalogue    an independent database agreeing that this product exists.
 *   brand        the brand the model read matching the brand on the row.
 *   size         the size the model read matching the size on the row.
 *   lead         how far the best candidate is ahead of the second. This is the
 *                one that catches "confidently the wrong one of two near
 *                identical products", which no single-candidate score can see.
 *   self         the model's own number, kept, but as one voice among six.
 *
 * The output is a band, not a percentage, because a percentage on a screen
 * invites arithmetic nobody should be doing with it.
 */

export type ConfidenceBand = 'high' | 'medium' | 'low';

export interface ConfidenceSignals {
  /** A barcode was read and it resolved in the catalogue. */
  readonly barcodeResolved: boolean;
  /** Best candidate's fused retrieval similarity, 0..1, or null if none. */
  readonly catalogueSimilarity: number | null;
  /** Gap between the best and second-best candidate, 0..1. */
  readonly lead: number | null;
  /** Null when the query carried no brand to compare. */
  readonly brandAgrees: boolean | null;
  /** Null when either side had no size. */
  readonly sizeAgrees: boolean | null;
  /** The model's self-report, 0..1. */
  readonly selfConfidence: number;
  /** How sharp the crop was, relative to its burst. Blur is a real cause of error. */
  readonly sharpnessOk: boolean;
}

export interface Confidence {
  readonly band: ConfidenceBand;
  readonly score: number;
  /** Plain sentence naming what actually limits it. Shown to the user, not hidden. */
  readonly because: string;
  /** Every signal, so a wrong verdict can be explained afterwards. */
  readonly signals: ConfidenceSignals;
}

/**
 * Weights.
 *
 * Deliberately lopsided. The self-report is worth a twelfth of a barcode,
 * because one is a measurement and the other is a vibe.
 */
const W = {
  catalogue: 0.30,
  lead: 0.22,
  brand: 0.16,
  size: 0.12,
  self: 0.10,
  sharp: 0.10,
};

const HIGH = 0.78;
const MEDIUM = 0.52;

/**
 * How far ahead the best candidate has to be before the lead counts as clear.
 *
 * It was already the number `reasonFor` used to say "two products match this
 * almost equally well"; exported 2026-09-09 so the photo path can ask the same
 * question it answers. Below this, pass one has not settled anything and the
 * pick pass is worth a call.
 */
export const LEAD_CLEAR = 0.03;

/**
 * What a pick-pass confidence is allowed to leave the six-signal score at.
 *
 * The pick looks at the packaging and the rows together, so when it is not sure
 * it has seen something the retrieval signals cannot: two rows that both fit
 * the print. A ceiling and not a replacement, because a confident pick is still
 * only one opinion and decision 18 does not let an opinion set the number.
 */
const PICK_CAP: Record<ConfidenceBand, number> = { high: 1, medium: 0.75, low: 0.5 };

/**
 * Fuses the pick pass into an already-derived confidence.
 *
 * Only ever downward. `high` is not a boost; it is the absence of a cap.
 */
export function capByPick(c: Confidence, pick: ConfidenceBand): Confidence {
  const cap = PICK_CAP[pick];
  if (c.score <= cap) return c;

  const score = cap;
  const band: ConfidenceBand = score >= HIGH ? 'high' : score >= MEDIUM ? 'medium' : 'low';
  return { band, score, because: reasonFor(c.signals, band, pick), signals: c.signals };
}

/**
 * Caps an already-derived confidence because the pick pass NEVER RAN.
 *
 * D-125. A row only reaches the pick when pass one did NOT settle it -- not
 * confident, or without a clear lead over the runner-up. On every path where
 * the pick answers, `capByPick` lets its opinion hold the number down. On the
 * path where the pick THROWS, `identify.ts` ships pass one's answer with pass
 * one's confidence and no cap at all, so the rows that lost their tie-breaker
 * are exactly the rows nothing lowers.
 *
 * Measured on the 2026-09-16 run of the 200-photo eval: of the 23 answers that
 * shipped in the `high` band and were WRONG, **12 had an errored pick** -- 52%,
 * against 12% of the 137 that shipped high and were right. Half of Shin's
 * confidently wrong answers were rows whose discriminating step did not run.
 *
 * NOT `capByPick(c, 'medium')`, and the difference is the sentence the shopper
 * reads. That call would route through `reasonFor`'s pickCapped branch and say
 * "more than one product matched the print on the pack" -- a claim about what
 * the second look SAW. It saw nothing; it failed. Reporting a failure as an
 * observation is the same class of lie this file exists to prevent.
 *
 * The answer itself is untouched. Rule 6 is always an answer, and decision 19's
 * correction of 2026-09-05 removed the refusal here on purpose. What changes is
 * only what Shin claims to know about it.
 */
export function capByUnrunPick(c: Confidence): Confidence {
  const cap = PICK_CAP.medium;
  if (c.score <= cap) return c;
  const band: ConfidenceBand = cap >= HIGH ? 'high' : cap >= MEDIUM ? 'medium' : 'low';
  return {
    band,
    score: cap,
    because: 'A second check on the pack did not finish, so this is the likelier one rather than a confirmed match.',
    signals: c.signals,
  };
}

export function deriveConfidence(s: ConfidenceSignals): Confidence {
  // A resolved barcode is not scored, it is answered. Every other signal is a
  // way of guessing at what the barcode would have told us.
  if (s.barcodeResolved) {
    return {
      band: 'high',
      score: 1,
      because: 'The barcode matched a product exactly.',
      signals: s,
    };
  }

  let score = 0;
  let available = 0;

  if (s.catalogueSimilarity !== null) {
    score += W.catalogue * s.catalogueSimilarity;
    available += W.catalogue;
  }
  if (s.lead !== null) {
    // A lead of 0.1 is already decisive; beyond that there is nothing more to win.
    score += W.lead * Math.min(1, s.lead / 0.1);
    available += W.lead;
  }
  if (s.brandAgrees !== null) {
    score += W.brand * (s.brandAgrees ? 1 : 0);
    available += W.brand;
  }
  if (s.sizeAgrees !== null) {
    score += W.size * (s.sizeAgrees ? 1 : 0);
    available += W.size;
  }
  score += W.self * s.selfConfidence;
  available += W.self;
  score += W.sharp * (s.sharpnessOk ? 1 : 0);
  available += W.sharp;

  // Normalised by what was actually available, so a missing signal lowers
  // certainty about the score rather than silently scoring zero.
  const normalised = available > 0 ? score / available : 0;

  const band: ConfidenceBand =
    normalised >= HIGH ? 'high' : normalised >= MEDIUM ? 'medium' : 'low';

  return { band, score: normalised, because: reasonFor(s, band), signals: s };
}

/**
 * The sentence shown on screen.
 *
 * Names the weakest real signal rather than describing the score, because "we
 * are 61% sure" tells a shopper nothing they can act on and "two products look
 * the same from this angle" tells them to turn the box.
 */
function reasonFor(s: ConfidenceSignals, band: ConfidenceBand, pickCapped?: ConfidenceBand): string {
  if (!s.sharpnessOk) return 'The photo came out soft, so this could be the wrong one.';
  // Added 2026-09-09 for the two-pass path. When the second look at the pack
  // was the thing that held the number down, that is the honest limit to name,
  // and it is a different sentence from the retrieval scores being close: it
  // says the printed text itself did not separate them.
  if (pickCapped !== undefined && pickCapped !== 'high') {
    return 'More than one product matched the print on the pack, so this is the likelier one.';
  }
  if (s.catalogueSimilarity === null) return 'Nothing in the catalogue looks like this.';
  if (s.lead !== null && s.lead < LEAD_CLEAR) {
    return 'Two products match this almost equally well.';
  }
  if (s.brandAgrees === false) return 'The brand on the pack does not match this product.';
  if (s.sizeAgrees === false) return 'The size on the pack does not match this product.';
  if (s.catalogueSimilarity < 0.8) return 'This is the closest match, not an exact one.';
  if (band === 'high') return 'The pack, the brand and the size all line up.';
  return 'The match is good but nothing confirms it independently.';
}
