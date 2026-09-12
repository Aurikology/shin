/**
 * THE CONTRACT, band 1's only durable output.
 *
 * Band 3's four-lane split rests on this file holding. Anything that changes a
 * shape here is a contract change and reopens every lane that reads it, so the
 * rule is: add fields, never repurpose them, and never widen a union without
 * asking what the consumer does with the new member.
 *
 * The spine returns exactly one of two things and there is no third. It either
 * produces a Verdict or it Refuses. "Best guess with a shrug" is the shape this
 * file exists to make unrepresentable. It is what the hand pilot did when it
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
  /**
   * The seller's DISPLAY and MATCHING name. Everything a shopper reads, and
   * everything matched against what a shopper typed, keys on this: the
   * self-exclusion in `spine.ts` drops the store they are standing in by the
   * name they typed, and it can only ever match a name.
   */
  readonly seller: string;
  /**
   * The seller's IDENTITY, when the source has one that is stronger than the
   * name. Everything that COUNTS distinct sellers keys on `sellerId ?? seller`.
   *
   * D-081, and the reason this field exists. `observed.ts`'s header says the
   * identity of a shop is its OpenStreetMap id, never its name: two branches of
   * one chain are two different stores, and counted by name they collapse into
   * one, understating exactly the number the confidence sentence reports.
   * Returning the OSM id in `seller` was tried on 2026-09-09 and reverted the
   * same hour, because the shopper excludes their own store by the NAME they
   * typed and an id never matches a name. One field cannot be both, so there
   * are two: identity for counting, name for matching.
   *
   * Optional. A source with no identity beyond the name leaves it undefined and
   * counts exactly as it did before, which is every adapter but `observed.ts`
   * today, and every price point already stored in a fixture.
   */
  readonly sellerId?: string;
  readonly amountCents: number;
  readonly currency: 'CAD';
  readonly kind: PriceKind;
  /** ISO date. Staleness is checked against this, never against fetch time. */
  readonly observedAt: string;
  readonly sourceId: string;
  readonly url?: string;
  /** e.g. "limit 8", a capped promo is not the same offer as an uncapped one. */
  readonly limit?: string;
  /** Cents per 100g / 100ml, when pack size is known on both sides. */
  readonly unitAmountCents?: number;
  readonly note?: string;
  /**
   * How many independent observers stand behind this price, when the source can
   * answer that. **Undefined means the source vouches for it itself**, which is
   * every crawled feed: a Walmart page is not a witness statement, it is the
   * seller's own number, and counting observers of it would be a category
   * error.
   *
   * Only a source a member of the public can write sets this. Today that is
   * corrections, where 1 means one person typed it and nobody has seen the same
   * tag since. D-022 names a single uncorroborated number moving a verdict as
   * the thing that gates opening this app to anybody else, and the spine cannot
   * weigh what the contract does not carry.
   */
  readonly witnesses?: number;
}

/** The three faces. One per verdict, and the only user-facing tiering that exists. */
export type Tier = 'good' | 'fair' | 'walk_away';

export type ConfidenceBand = 'high' | 'medium' | 'low';

export interface Confidence {
  readonly band: ConfidenceBand;
  /** Plain sentence naming what actually limits it. Shown, not hidden. */
  readonly because: string;
  /**
   * 0..1, and present only where `price/src/verdict.ts` produced the answer.
   *
   * Added 2026-09-08, and added rather than repurposed because this file's own
   * rule says so. The band is three words and is what a screen draws; this is
   * the number the thin-evidence judge actually computed, kept so a later pass
   * can calibrate the band against something rather than re-deriving it. No
   * screen reads it today and none has to.
   */
  readonly score?: number;
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
  /** Resolved below the floor. Show candidates and let the user pick, the R6 case. */
  | 'identity_unsure'
  /** Category has no source we trust. Produce, today. */
  | 'category_unsupported'
  /** Sources exist for the category but none answered for this item. */
  | 'no_source_response'
  /**
   * Fewer usable points than the category needs. A count, and only a count.
   * Nothing produces it today: the count thresholds came out on 2026-09-05 and
   * became named shortfalls on the answer instead. It stays in the union
   * because consumers already map it and because the shape may return, and it
   * is deliberately NOT the code for the four filter conditions below. D-011
   * was this member standing in for a cause it does not describe, over an
   * evidence array holding thirteen prices.
   */
  | 'too_few_points'
  /**
   * Prices were found and every one of them is a kind this category cannot
   * compare against. A manufacturer list price with no retailer behind it is
   * the case this fires on.
   */
  | 'unusable_price_kinds'
  /** Every usable price carries a date later than the moment being priced. */
  | 'points_future_dated'
  /** Points exist but all older than the category tolerates. */
  | 'points_too_stale'
  /**
   * Every usable, current price belongs to the seller whose own price is being
   * judged, so the only comparison left would be that price against itself.
   * Its own code rather than a share of the stale one, because it is a
   * different repair and because it is the condition that fires most often now
   * that one store supplies almost every price we hold. See D-012.
   */
  | 'all_points_from_asking_seller'
  /** Points disagree past the point where any single verdict would be a lie. */
  | 'comparison_incoherent'
  /**
   * Every price we hold for this is a number a member of the public typed in
   * and nobody else has seen: no second device on that shelf, and no crawled
   * price close enough to be the same tag. Item 15 of the beta build plan, in
   * its own words: "one typed price with no other source shows 'one shopper saw
   * $X at store, date', never a tier."
   *
   * NOT SILENCE, and this is why it is a refusal rather than a missing answer.
   * `detail` carries the number, the shop and the day, which is the whole of
   * what the one report actually says. What is withheld is only the good / fair
   * / walk away call, because that call is arithmetic over a comparison and one
   * person's word is not a comparison. Priority 1 is answered by the sentence;
   * the tier is the part that would have been invented.
   *
   * A consumer that maps refusal reasons to repair paths should treat this one
   * as "show the sentence, and ask for a second reading", never as "we do not
   * know what this is": the identity is on the refusal and so is the evidence.
   */
  | 'single_report'
  /** We have comparisons but no price for the thing being judged. */
  | 'no_asking_price';

export interface Refusal {
  readonly kind: 'refusal';
  readonly reason: RefusalReason;
  /** One sentence, written for the user, naming the repair when there is one. */
  readonly detail: string;
  /**
   * Evidence, not copy. Research prose explaining why a stored identity was
   * doubted: what a search actually returned, what currency a bound was in,
   * what was seen and ruled out. It runs to hundreds of characters and belongs
   * behind a disclosure, never in the headline sentence. Added by D-013, where
   * 450 characters of it were concatenated into `detail` and shown to a shopper
   * mid aisle. Absent when there is nothing recorded.
   */
  readonly evidenceNote?: string;
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
   * The price on the tag, in cents. When absent, or when it does not read as a
   * usable number, the spine refuses with `no_asking_price` rather than
   * inventing a subject for its own comparison. It does NOT go looking for one
   * among the observations.
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
