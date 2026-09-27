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

/*
 * ────────────────────────────────────────────────────────────────────────────
 * STRUCTURED PROSE. Codes and facts beside every finished English sentence.
 *
 * Beta-plan item 31 is a French interface, and it was unbuildable because this
 * package shipped finished SENTENCES rather than facts: counts, currency
 * formatting, pluralisation and word order were all baked into English grammar
 * before the JSON left the server, so no amount of client work could translate
 * them.
 *
 * The pattern is the one this file already uses for refusals. `RefusalReason`
 * is a CODE and `app/public/js/voice.js` turns a code plus facts into words.
 * Everything below extends that to the verdict tier.
 *
 * ADDITIVE, ALWAYS. `Verdict.lines`, `Confidence.because`, `Refusal.detail` and
 * `Disagreement.detail` keep the exact English bytes they have today. The
 * structured fields sit beside them, and `spine/test/structured-prose.test.ts`
 * rebuilds every one of those strings from its code and facts and asserts the
 * result is byte-identical. A sentence that cannot be rebuilt means its facts
 * are incomplete, and the fix is the facts.
 *
 * TWO RULES FOR ANYONE ADDING A CODE:
 *
 *   1. Name it for MEANING, never for the English wording. A French renderer
 *      reads these. `regular_price_across_stores`, not `regular_price_sentence`.
 *   2. Facts are RAW. Cents as integers with the currency beside them, never
 *      `cad()` output; counts as numbers; dates as ISO, never "3 September".
 *      Singular and plural are a CONSEQUENCE of a count fact and never a
 *      separate code: French pluralises on different boundaries than English
 *      and a code that encodes an English number split cannot be translated.
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * A value a locale renderer may format. Deliberately narrow: raw scalars,
 * arrays of them, and plain records. Nothing here is pre-formatted for a
 * reader, because formatting is the thing the client is being handed back.
 */
export type Fact = string | number | boolean | null | readonly Fact[] | { readonly [key: string]: Fact };

/**
 * Every sentence or sentence fragment the spine can produce, named for what it
 * MEANS. Closed union on purpose, exactly like `RefusalReason`: a new sentence
 * is a new member here and a new entry in every renderer, which is the whole
 * point of the mechanism.
 */
export type LineCode =
  // ── Verdict lines, one category rule each (`categories.ts`) ──────────────
  /** Grocery: one store carries it, so the regular price is stated, not averaged. */
  | 'regular_price_at_sole_store'
  /** Grocery: a regular price is typical across several stores. */
  | 'regular_price_across_stores'
  /** Grocery: everything we hold is a capped promotion, so there is no going rate. */
  | 'all_prices_are_capped_promotions'
  /** Grocery: no regular shelf price anywhere, only promotions. */
  | 'no_regular_price_only_promotions'
  /** Grocery's second line: the cheapest promotion running this week. */
  | 'best_promotion_this_week'
  /** Grocery's second line when nothing is on promotion. */
  | 'no_promotion_this_week'
  /** Tech: how many retailers carry it and who is cheapest. */
  | 'cheapest_of_retailers_carrying_it'
  /** Used goods: the range of comparable listings and where they cluster. */
  | 'comparable_listings_range'
  /** Furniture: no second seller, so the comparison is its own history. */
  | 'own_price_history_single_seller'

  // ── Thin-evidence line, assembled from up to four fragments ──────────────
  // `price/src/verdict.ts` writes that sentence and lives outside this package.
  // `spine.ts` re-derives these codes and facts from the judgement object it
  // gets back, which carries every number the sentence used.
  /** Asking price is under the single price we hold (no band to sit in). */
  | 'asking_below_sole_price'
  /** Asking price is in the cheapest third of the band. */
  | 'asking_below_range'
  /** Asking price equals the single price we hold. */
  | 'asking_equals_sole_price'
  /** Asking price is in the middle of the band. */
  | 'asking_within_range'
  /** Asking price is over the single price we hold. */
  | 'asking_above_sole_price'
  /** Asking price is in the dearest third of the band. */
  | 'asking_above_range'
  /** Every seller we read charges the same, named once. */
  | 'sole_price_matched_at_seller'
  /** The two ends of the band, each at its seller. */
  | 'cheapest_and_dearest_sellers'
  /** Price per unit of size, where both sides know the pack size. */
  | 'unit_price'
  /** A promotion undercutting the band it was not allowed to join. */
  | 'cheaper_on_promotion_at_seller'

  // ── Confidence.because (`spine.ts` confidenceOf) ─────────────────────────
  /** The set cleared the category's minimum and no more. */
  | 'confidence_minimum_met_only'
  /** The band is held down by the age of the freshest price. */
  | 'confidence_newest_price_age'
  /** History-based category: a long run of one seller's own prices, identity certain. */
  | 'confidence_history_span_exact_match'
  /** Plenty of recent prices across sellers, identity certain. */
  | 'confidence_fresh_across_sellers_exact_match'
  /** The unremarkable middle: a count of prices across a count of sellers. */
  | 'confidence_price_count_across_sellers'

  // ── Shortfall fragments, joined into Confidence.because ──────────────────
  /** D-022: unwitnessed claims too far outside the vouched prices to publish. */
  | 'shortfall_lone_claims_held_back'
  /** Item 15b: typed prices nobody else has seen, so they do not set the tier. */
  | 'shortfall_uncorroborated_typed_prices'
  /** Nothing is inside the category's window, so old prices answered instead. */
  | 'shortfall_newest_price_older_than_category'
  /** Some of the set was outside the window and did not count toward the tier. */
  | 'shortfall_some_prices_too_old_to_count'
  /** Fewer prices than the category's own minimum. */
  | 'shortfall_fewer_points_than_category_needs'
  /** Fewer distinct sellers than the category's own minimum. */
  | 'shortfall_fewer_sellers_than_category_needs'
  /** The set's shape says it spans more than one product. */
  | 'shortfall_prices_may_be_two_products'
  /** Every price published for this is a kind the category cannot compare. */
  | 'shortfall_no_comparable_price_kinds'
  /** Every price is past what the category tolerates (the filter-cascade form). */
  | 'shortfall_newest_price_past_tolerance'
  /** Every price belongs to the shop being stood in, so this is its own history. */
  | 'shortfall_only_the_asking_seller_has_prices'

  // ── Confidence basis fragments out of `price/src/verdict.ts` ─────────────
  /** One seller behind the band. */
  | 'basis_single_seller'
  /** Several sellers agree on the band. */
  | 'basis_sellers_agree_on_range'
  /** The freshest contributing number is past the staleness bar. */
  | 'basis_newest_price_over_three_weeks'
  /** No regular price existed, so sale prices were the yardstick. */
  | 'basis_only_sale_prices'
  /** At least one row was joined on name rather than on a barcode. */
  | 'basis_matched_by_name_not_barcode'
  /**
   * THE GUARD, and it must never appear in a payload.
   *
   * `price/src/verdict.ts` writes its own confidence reasons and lives outside
   * this package, so `spine.ts` maps its four possible strings onto the four
   * codes above. This member exists for a fifth string that mapping has not
   * been taught, and it carries the English verbatim on `facts.text` so the
   * round trip stays byte-exact even then. It is the one code here a locale
   * cannot translate, which is why it is an ALARM rather than a fallback:
   * `test/structured-prose.test.ts` drives that file's `confidenceOf` across
   * its whole input domain and fails if this is ever reached. If it ever does
   * fire, the fix is a new code above and a renderer entry, not a wider guard.
   */
  | 'basis_reason_not_yet_coded'

  // ── Refusal.detail (`spine.ts`) ──────────────────────────────────────────
  /** No source is answering at all. */
  | 'refusal_no_price_source_available'
  /** Nothing resolved to a product. */
  | 'refusal_identity_unresolved'
  /** The whole category is declined, with the recorded reason. */
  | 'refusal_category_not_served'
  /** Resolved, but under the category's identity floor. */
  | 'refusal_identity_below_floor'
  /** Identified, and nobody we read has a price for it. */
  | 'refusal_no_price_for_product'
  /** No price was given for the thing being judged. */
  | 'refusal_asking_price_missing'
  /** A price was given and did not read as a number. */
  | 'refusal_asking_price_unreadable'
  /** Every price found is dated after the moment being priced. */
  | 'refusal_all_prices_future_dated'
  /** Item 15a: one shopper's reading, named in full, with no tier. */
  | 'refusal_one_shopper_report'
  /** Item 15a with several readings, none of them seen twice. */
  | 'refusal_several_unconfirmed_reports'

  // ── Disagreement.detail (`categories.ts`) ────────────────────────────────
  /** The same thing is priced far apart right now. */
  | 'disagreement_wide_spread'
  /** The gap is a promotion against a regular price, not one store against another. */
  | 'disagreement_promotion_not_store';

/**
 * Why a whole category is declined, as a CODE rather than as the recorded
 * English.
 *
 * Its own union and not a `LineCode`, because these are not sentences the spine
 * writes. Each one names a decision recorded in `categories.ts`, whose prose is
 * a paragraph of reasoning rather than a line of copy, and whose wording is
 * owned by that file and changes when the decision is revisited. A `LineCode`
 * is keyed one-to-one to a sentence a renderer emits; this is keyed to a
 * standing call.
 *
 * It rides on `refusal_category_not_served` as the `whyCode` fact, beside the
 * unchanged English `why` and the raw `whyFacts` the paragraph interpolates.
 * That was the last sentence a French reader still got in English: the frame
 * translated and the recorded reason passed through verbatim.
 *
 * THE CLIENT IS NOT DONE WHEN THIS FILE IS. `app/public/js/prose.js` needs one
 * renderer per code here, keyed off `facts.whyCode` inside its existing
 * `refusal_category_not_served` entry, and it must keep falling back to
 * `facts.why` for a code it has not been taught. That is the app's lane, not
 * this package's, and adding a member here without that entry means a French
 * reader sees the English paragraph again.
 *
 * Named for MEANING, exactly like `LineCode`. Never for the English wording.
 */
export type CategoryReasonCode =
  /**
   * Produce. A PLU names a category rather than a product, package formats
   * break unit comparison, and the public price series measures inflation
   * rather than this week's shelf, so the only source that could answer is
   * shoppers reporting the shelf themselves.
   *
   * Facts: `problemCount`, `plu`, `pluMeaning`, `pluInUseSince`.
   */
  'produce_no_shelf_price_source';

/** One code and the raw values its sentence interpolates. */
export interface TextFragment {
  readonly code: LineCode;
  /** Raw. Cents as integers, counts as numbers, dates as ISO. Never formatted. */
  readonly facts: Readonly<Record<string, Fact>>;
}

/**
 * How a renderer turns fragments into one string. Three shapes, and English's
 * own rendering of each is asserted byte-for-byte by the round-trip test.
 *
 * - `single`      exactly one fragment, rendered on its own.
 * - `sentences`   fragments rendered and joined with a single space.
 * - `shortfall_list`  fragments joined with `"; "`, then the first character
 *                 upper-cased and a full stop appended. A locale is free to
 *                 join and capitalise differently; this names the INTENT, which
 *                 is "a list of reasons read as one sentence".
 */
export type TextShape = 'single' | 'sentences' | 'shortfall_list';

/** A sentence the client can build in its own language. */
export interface StructuredText {
  readonly shape: TextShape;
  readonly fragments: readonly TextFragment[];
}

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
  /**
   * ISO 4217 code of the amount, as the source stated it. Never converted, and
   * never assumed: this used to be the literal type 'CAD', which made every
   * adapter stamp Canadian dollars whether or not the source said so. A source
   * that does not state a currency has to say what it knows about its own data.
   */
  readonly currency: string;
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
   * `because` as codes and facts, so a locale that is not English can say the
   * same thing. Renders byte-for-byte back to `because`; see the block at the
   * top of this file.
   */
  readonly structuredBecause: StructuredText;
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
  /** `detail` as codes and facts. Renders byte-for-byte back to `detail`. */
  readonly structuredDetail: StructuredText;
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
  /**
   * `lines` as codes and facts, one entry per line and in the same order, so
   * `structuredLines[i]` renders byte-for-byte back to `lines[i]`.
   */
  readonly structuredLines: readonly StructuredText[];
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
  /** `detail` as codes and facts. Renders byte-for-byte back to `detail`. */
  readonly structuredDetail: StructuredText;
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

/** One code plus its raw facts. The unit every renderer is keyed on. */
export function fragment(code: LineCode, facts: Readonly<Record<string, Fact>> = {}): TextFragment {
  return { code, facts };
}

/** A whole sentence that is one fragment, which is most of them. */
export function say(code: LineCode, facts: Readonly<Record<string, Fact>> = {}): StructuredText {
  return { shape: 'single', fragments: [fragment(code, facts)] };
}

export function isVerdict(r: SpineResult): r is Verdict {
  return r.kind === 'verdict';
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
