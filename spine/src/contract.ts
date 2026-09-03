/**
 * THE CONTRACT — band 1's only durable output.
 *
 * Band 3's four-lane split rests on this file holding. Anything that changes a
 * shape here is a contract change and reopens every lane that reads it, so the
 * rule is: add fields, never repurpose them, and never widen a union without
 * asking what the consumer does with the new member.
 *
 * The spine returns exactly one of two things and there is no third. It either
 * produces a Verdict or it Refuses. "Best guess with a shrug" is the shape this
 * file exists to make unrepresentable — it is what the hand pilot did when it
 * answered a Canon EOS R6 query with an R6 Mark II bundle at nearly triple.
 */

/** The five categories considered. `produce` is present and deliberately unserved. */
export type CategoryId = 'grocery' | 'tech' | 'used' | 'furniture' | 'produce';

export const CATEGORY_IDS: readonly CategoryId[] = [
  'grocery',
  'tech',
  'used',
  'furniture',
  'produce',
];

/**
 * What the spine believes it is looking at.
 *
 * `confidence` is separate from price confidence on purpose. The pilot's worst
 * failure was identity, not price: every number it returned for the Canon was
 * accurate, and all of them were about a different camera.
 */
export interface ProductIdentity {
  /** Stable key inside our own store. Not a retailer SKU. */
  readonly id: string;
  readonly label: string;
  readonly category: CategoryId;
  readonly brand?: string;
  /** Barcode, when a scan produced one. Absent for screenshot and used-goods paths. */
  readonly gtin?: string;
  readonly model?: string;
  readonly size?: PackSize;
  /** 0..1. Below the category's floor the spine refuses rather than guesses. */
  readonly confidence: number;
  /** id of the source that resolved it, for the defect log's only interesting column. */
  readonly resolvedBy: string;
}

export type SizeUnit = 'g' | 'kg' | 'ml' | 'l' | 'ea';

export interface PackSize {
  readonly value: number;
  readonly unit: SizeUnit;
}

/**
 * What kind of number this is. Collapsing these is the single most expensive
 * mistake available here: one 225g box of Kraft Dinner swung 3.6x inside one
 * week and every one of those numbers was real. A verdict that averages a
 * limit-8 loss leader against a regular shelf price is wrong in both directions.
 */
export type PriceKind =
  /** Everyday shelf/list price at a seller. */
  | 'regular'
  /** Time-boxed promotion. Carries `limit` when the retailer capped it. */
  | 'promotional'
  /** What someone is asking on a marketplace. Upward-biased, never a clearing price. */
  | 'asking'
  /** What something actually sold for. Rare and worth more than the rest. */
  | 'sold'
  /** Manufacturer list. Not a retailer price and never counts toward point minimums. */
  | 'list';

export interface PricePoint {
  readonly seller: string;
  readonly amountCents: number;
  readonly currency: 'CAD';
  readonly kind: PriceKind;
  /** ISO date. Staleness is checked against this, never against fetch time. */
  readonly observedAt: string;
  readonly sourceId: string;
  readonly url?: string;
  /** e.g. "limit 8" — a capped promo is not the same offer as an uncapped one. */
  readonly limit?: string;
  /** Cents per 100g / 100ml, when pack size is known on both sides. */
  readonly unitAmountCents?: number;
  readonly note?: string;
}

/** The three faces. One per verdict, and the only user-facing tiering that exists. */
export type Tier = 'good' | 'fair' | 'walk_away';

export type ConfidenceBand = 'high' | 'medium' | 'low';

export interface Confidence {
  readonly band: ConfidenceBand;
  /** Plain sentence naming what actually limits it. Shown, not hidden. */
  readonly because: string;
  readonly pointCount: number;
  readonly distinctSellers: number;
  readonly oldestPointAgeDays: number;
  readonly identityConfidence: number;
}

/**
 * Raised when the comparison set does not agree with itself. Not an error: a
 * real 3.6x weekly swing is information, and the honest surface for it is two
 * numbers rather than one averaged lie.
 */
export interface Disagreement {
  readonly kind: 'wide_spread' | 'regular_vs_promotional' | 'seller_conflict';
  readonly detail: string;
  readonly lowCents: number;
  readonly highCents: number;
  /** high / low, rounded to 2dp. 3.6 means the swing the pilot measured. */
  readonly ratio: number;
}

export interface Spread {
  readonly lowCents: number;
  readonly highCents: number;
  readonly medianCents: number;
  readonly p25Cents: number;
}

export interface Verdict {
  readonly kind: 'verdict';
  readonly identity: ProductIdentity;
  readonly category: CategoryId;
  /** The price the shopper is standing in front of. */
  readonly askingCents: number;
  /** Where that price came from, so a verdict never silently compares a thing to itself. */
  readonly askingSource: string;
  readonly tier: Tier;
  /**
   * The category's own sentence. Grocery gets two lines because regular and
   * promotional are different questions; everything else gets one.
   */
  readonly lines: readonly string[];
  readonly comparisonSet: readonly PricePoint[];
  readonly pointCount: number;
  readonly oldestObservedAt: string;
  readonly newestObservedAt: string;
  readonly spread: Spread;
  readonly confidence: Confidence;
  readonly disagreement: Disagreement | null;
  readonly producedAt: string;
}

/**
 * Every reason the spine is allowed to decline. Closed union on purpose: a new
 * refusal reason is a queue item, not a one-line addition, because each one is a
 * different repair path in front of the user.
 */
export type RefusalReason =
  /** Nothing resolved. Scan again, or type it. */
  | 'no_identity'
  /** Resolved below the floor. Show candidates and let the user pick — the R6 case. */
  | 'identity_unsure'
  /** Category has no source we trust. Produce, today. */
  | 'category_unsupported'
  /** Sources exist for the category but none answered for this item. */
  | 'no_source_response'
  /** Fewer usable points than the category needs. */
  | 'too_few_points'
  /** Points exist but all older than the category tolerates. */
  | 'points_too_stale'
  /** Points disagree past the point where any single verdict would be a lie. */
  | 'comparison_incoherent'
  /** We have comparisons but no price for the thing being judged. */
  | 'no_asking_price';

export interface Refusal {
  readonly kind: 'refusal';
  readonly reason: RefusalReason;
  /** One sentence, written for the user, naming the repair when there is one. */
  readonly detail: string;
  readonly identity: ProductIdentity | null;
  /** Whatever we did find. A refusal still shows its work. */
  readonly evidence: readonly PricePoint[];
  readonly producedAt: string;
}

export type SpineResult = Verdict | Refusal;

export function isVerdict(r: SpineResult): r is Verdict {
  return r.kind === 'verdict';
}

export function isRefusal(r: SpineResult): r is Refusal {
  return r.kind === 'refusal';
}

/** What the caller hands in. A scan, a screenshot, or typed text all reduce to this. */
export interface SpineQuery {
  /** Free text, a barcode, or a model number. */
  readonly text?: string;
  readonly gtin?: string;
  /** Narrows the source set. Omit to let identity decide. */
  readonly category?: CategoryId;
  /**
   * The price on the tag, in cents. When absent the spine looks for one among
   * the observations and, failing that, refuses with `no_asking_price` rather
   * than inventing a subject for its own comparison.
   */
  readonly askingCents?: number;
  /**
   * The seller whose price is being judged. Excluded from the comparison set so
   * a verdict is never a thing measured against itself, which reads as "fair"
   * every time and is the quietest way for this to be wrong.
   */
  readonly askingSeller?: string;
  /** Overrides "now" for deterministic tests and for replaying a recorded pass. */
  readonly asOf?: string;
}
