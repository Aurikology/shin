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
function reasonFor(s: ConfidenceSignals, band: ConfidenceBand): string {
  if (!s.sharpnessOk) return 'The photo came out soft, so this could be the wrong one.';
  if (s.catalogueSimilarity === null) return 'Nothing in the catalogue looks like this.';
  if (s.lead !== null && s.lead < 0.03) {
    return 'Two products match this almost equally well.';
  }
  if (s.brandAgrees === false) return 'The brand on the pack does not match this product.';
  if (s.sizeAgrees === false) return 'The size on the pack does not match this product.';
  if (s.catalogueSimilarity < 0.8) return 'This is the closest match, not an exact one.';
  if (band === 'high') return 'The pack, the brand and the size all line up.';
  return 'The match is good but nothing confirms it independently.';
}
