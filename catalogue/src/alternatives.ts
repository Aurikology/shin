/**
 * Cheaper things of the same kind. Decisions 38, 39, 40, 41 and 42.
 *
 * The whole feature is one sentence: same category, comparable size, lower unit
 * price, at a seller whose price we actually have. Everything interesting here
 * is a refusal to do more than that.
 *
 * NOT A SIMILARITY MODEL (decision 38). The tempting version asks the embedder
 * for "things like this" and shows the nearest neighbours. It produces lovely
 * demos and it is wrong: nearest-in-embedding-space includes the same product in
 * a different size, the same brand's unrelated line, and a product that merely
 * shares packaging language. An alternative has to be something a shopper could
 * actually buy instead, which is a category-and-unit-price question, not a
 * vector one.
 *
 * NO TASTE CLAIMS (decision 39). "Cheaper per 100 g" is a measurement. "Tastes
 * the same" is a promise, and it is the kind of promise that turns a wrong
 * answer into somebody's ruined dinner and our liability.
 *
 * ALLERGENS ARE PRINTED, NOT FILTERED (decision 40). Filtering out alternatives
 * that add an allergen looks safer and is worse: it silently shrinks the list
 * with no explanation, and a shopper avoiding an allergen for someone else has
 * no way to know it happened. The difference is shown on the row instead.
 *
 * THREE, NOT A LIST (decision 41). More than three is a research task and the
 * person is standing in an aisle holding a basket.
 */

import type { DatabaseSync } from 'node:sqlite';
import { MAX_RING_TAG, chooseRingTag, labelForTag } from './search.ts';
import type { Candidate, RingLevel } from './search.ts';
import { logTaxonomyUnavailableOnce } from './category-taxonomy.ts';
import type { Taxonomy } from './category-taxonomy.ts';
import { comparesOnUnitPrice, kindOfSource } from './product-kind.ts';
import {
  evaluateConstraints,
  type AlternativeMode,
  type AlternativeSubject,
  type ConstraintLabel,
  type UserConstraintPrefs,
} from './alternative-modes.ts';
import { UNKNOWN_MARKET, formatMoney, samePriceBasis, type Market } from './market.ts';
import { sameFamily, sqlBaseValue, sqlFamily, toComparison, unitPriceCents } from './units.ts';

/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE STRUCTURED SHAPE. D-097.
 *
 * `line` below is a finished English sentence and the app prints it verbatim,
 * so a French shopper reads English money and English words under a French
 * badge. The fix is the spine's, already proved there: keep the English string
 * byte-for-byte AND emit a code plus RAW facts beside it, so the client writes
 * the sentence in the reader's language.
 *
 * THESE TYPES MIRROR `spine/src/contract.ts` (`StructuredText`, `TextFragment`,
 * `say`, `fragment`) AND ARE DELIBERATELY NOT IMPORTED FROM IT. Two reasons,
 * both structural rather than stylistic. First, `catalogue` has no dependency
 * on `spine` in either direction today and adding one to borrow four type
 * aliases would couple two packages' builds for nothing. Second, the spine's
 * `LineCode` is a closed union of VERDICT sentences, and its round-trip test
 * asserts every member of it is produced by the spine engine; a swap code
 * added there would be a code no spine scenario can exercise, which breaks the
 * one mechanism that makes the spine's own codes trustworthy. A swap is not a
 * verdict, so it gets its own closed union here, policed by its own
 * round-trip test in `test/alternatives.test.ts`.
 *
 * If the two shapes ever have to become one, the merge is a new shared package
 * both import, never one package reaching into the other.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Raw values only. Cents as numbers, dates as ISO, tags as tags. Never formatted. */
export type AlternativeFact =
  | string
  | number
  | boolean
  | null
  | readonly AlternativeFact[]
  | { readonly [key: string]: AlternativeFact };

/**
 * Every sentence an alternative's `line` or its heading can be built from.
 * Closed on purpose: a renderer switching over this union fails to compile
 * when a code is added and nobody has written its words, which is the whole
 * point of the mechanism.
 */
export type AlternativeLineCode =
  // ── the saving, one of two bases ──────────────────────────────────────
  /** Both sides have a size in the same unit, so the honest per-100 comparison. */
  | 'alt_unit_price_cheaper'
  /** One side has no recorded size, so the price on the tag. Weaker, and says so. */
  | 'alt_ticket_price_cheaper'
  /** The caveat that rides with a ticket comparison, never with a unit one. */
  | 'alt_sizes_may_differ'
  // ── the date. Decision 42: a price is never presented as "now". ───────
  | 'alt_seen_on'
  // ── allergens. Decision 40: printed, never filtered. ──────────────────
  /** One side's list was empty or unreadable, so no conclusion is drawn. */
  | 'alt_allergens_not_recorded'
  /** Both lists were readable and nothing changed between them. */
  | 'alt_allergens_no_difference'
  /** Tags this alternative has that the original did not. */
  | 'alt_allergens_added'
  /** Tags the original had that this one does not. */
  | 'alt_allergens_removed'
  // ── the heading over the list ─────────────────────────────────────────
  /** Names the leaf the swaps were drawn from, so the claim is checkable. */
  | 'alternatives_cheaper_in_leaf'
  /** Nothing cheaper that we can put a price on. */
  | 'alternatives_none_priced';

/** One code and the raw values its sentence interpolates. */
export interface AlternativeFragment {
  readonly code: AlternativeLineCode;
  readonly facts: Readonly<Record<string, AlternativeFact>>;
}

/**
 * How a renderer turns fragments into one string. Two shapes, both the spine's:
 *
 * - `single`     exactly one fragment, rendered on its own.
 * - `sentences`  fragments rendered and joined with a single space.
 *
 * The spine's third shape, `shortfall_list`, has no producer here and is left
 * out rather than declared unused: an unreachable arm in the client's switch
 * is an arm nobody can test.
 */
export type AlternativeTextShape = 'single' | 'sentences';

/** A sentence the client can build in its own language. */
export interface AlternativeStructuredText {
  readonly shape: AlternativeTextShape;
  readonly fragments: readonly AlternativeFragment[];
}

/** One code plus its raw facts. The unit every renderer is keyed on. */
function fragment(
  code: AlternativeLineCode,
  facts: Readonly<Record<string, AlternativeFact>> = {},
): AlternativeFragment {
  return { code, facts };
}

/** A whole text that is one fragment, which is what a heading always is. */
function say(
  code: AlternativeLineCode,
  facts: Readonly<Record<string, AlternativeFact>> = {},
): AlternativeStructuredText {
  return { shape: 'single', fragments: [fragment(code, facts)] };
}

export interface PricedProduct {
  readonly code: string;
  /** Cents. The number a shopper would pay at this seller today. */
  readonly amountCents: number;
  /**
   * ISO 4217 code the price is in, when the feed says. Item 19: a price is never
   * converted, so it is compared only with a price in the user's own currency, and
   * a price with no stated currency is trusted only where the catalogue's own
   * market flag vouches for it (see `priceUsableIn`). Optional so every existing
   * feed keeps working; absent means "not stated", never "Canadian".
   */
  readonly currency?: string | null;
  /**
   * Who took the price, not always who sells it. "walmart.ca" is a real
   * seller and is shown as one. "openprices" is the name of the database
   * 874 of 896 rows were donated to, not a shop, and must never be printed
   * as though a shopper could walk into it. `storeName` below is how a real
   * shop gets named for those rows; when there is none, the fallback wording
   * below covers it. See `storeClauseFor`.
   */
  readonly seller: string;
  /** ISO date the price was observed. Decision 42: never presented as "now". */
  readonly observedAt: string;
  /**
   * The real shop this price came from, when the join to it can be trusted.
   * Measured 2026-09-05 against the live table (896 rows): 700 of 782
   * barcode-joined rows carry one, across 377 distinct codes, and 82
   * barcode-joined rows have none. Every name-joined row (14, all
   * walmart.ca) has none either, today. Null means no store was resolved,
   * which is a different fact from `joinMethod` saying a resolved one
   * should not be trusted (see below). This string is for display only and
   * is never used as an identity: two branches of the same chain are both
   * "Fortinos", and nothing here collapses them into one. The real identity,
   * store_osm's composite "WAY/120689533" form, is not modelled in this
   * interface at all, on purpose.
   */
  readonly storeName: string | null;
  readonly storeCity: string | null;
  /**
   * How this price row was matched to a product. 'gtin' is a barcode match
   * (782 rows); 'name' is a text match (14 rows, all walmart.ca), and a text
   * match can attach a price to the WRONG product. The gate that decides
   * whether a store name is shown is a CONJUNCTION of this field and
   * `storeName`, not either alone (see `storeClauseFor`): requiring
   * `storeName !== null` alone would still be wrong once a name-joined row
   * gets a resolved store, because the join itself, not just the name's
   * presence, is what cannot be trusted. Today that second half of the
   * conjunction never fires against an actual row, because zero of the 14
   * name-joined rows carry a store name; it stays in the gate anyway because
   * walmart.ca is exactly the seller that could gain one later, and dropping
   * the check would silently start showing a store beside a price that might
   * be on the wrong product.
   */
  readonly joinMethod: 'gtin' | 'name';
}

/** How a price is fetched. Injected so this file needs no feed of its own. */
export interface PriceLookup {
  (codes: readonly string[]): Promise<Map<string, PricedProduct>>;
}

/**
 * What "cheaper" was measured on.
 *
 * `unit` is cents per 100 g or 100 ml and is the honest comparison. `ticket` is
 * the price on the tag, used when one of the two products has no size recorded,
 * which is 82% of the catalogue. A ticket comparison is weaker and the row says
 * so in its own sentence rather than being hidden.
 */
export type SavingBasis = 'unit' | 'ticket';

export interface Alternative {
  readonly product: Candidate;
  readonly price: PricedProduct;
  readonly basis: SavingBasis;
  /** Cents per 100 g or 100 ml. Null when the comparison fell back to the ticket price. */
  readonly unitCents: number | null;
  /** How much cheaper per unit than the thing being compared, as a fraction. */
  readonly cheaperBy: number;
  /**
   * Allergen tags this alternative has that the original did not.
   * Printed on the row. Never used to hide it. Empty when `allergenNote` is
   * 'not-recorded': with no tags on one side there is nothing to compare, so
   * this is an absence of a comparison, not a comparison that found zero.
   */
  readonly addedAllergens: readonly string[];
  /** Allergen tags the original had that this one does not. Same emptiness rule as above. */
  readonly removedAllergens: readonly string[];
  /**
   * Whether an allergen comparison could be made at all. Open Food Facts has
   * no way to say "checked, contains none" (`prepare_rows.py:243` collapses a
   * missing tag list to `[]` the same as a checked-and-empty one would look),
   * so an empty array is ambiguous and only a NON-empty array is ever treated
   * as known. 'not-recorded' means one side's array was empty and no
   * conclusion, positive or negative, is drawn from that emptiness.
   */
  readonly allergenNote: 'compared' | 'not-recorded';
  /**
   * WHICH RING THIS SWAP CAME FROM, ADDED 2026-09-13.
   *
   * 'leaf' is the same kind of thing: another Gala apple, another creamy peanut
   * butter, and "cheaper" means "instead of this" without qualification.
   * 'parent' is one step wider -- a Honeycrisp offered because the store has no
   * other Gala -- and it is a LOOSER claim that has to be labelled as one.
   *
   * THIS FIELD IS THE SIGNAL AND THE CLIENT IS THE VOICE (ruled 2026-09-13).
   * `line` says nothing about the level, deliberately: the badge per row and the
   * sentence over an all-parent list are rendered from this field in both
   * locales in app/public/js/ui-strings.js. Anything reading a swap must decide
   * from `ring`, never by pattern-matching `line`.
   */
  readonly ring: RingLevel;
  /** The category tag this swap was drawn from. See chooseRingTag. */
  readonly ringTag: string;
  /** The exact sentence to show. Written here so no screen can improvise one. */
  readonly line: string;
  /**
   * THE SAME SENTENCE AS FACTS, ADDED FOR D-097. Codes plus raw values, so a
   * client can write it in the reader's language instead of printing the
   * English above under a French badge.
   *
   * `line` stays byte-for-byte what it was and is still the fallback: this
   * field is additive and nothing was taken away. The two cannot drift,
   * because `test/alternatives.test.ts` renders this field back into English
   * with its own renderer and asserts the result EQUALS `line`, for every
   * alternative every scenario in that file produces.
   *
   * Money in here is cents and is never formatted. A fact that arrives as
   * "$5.99" round-trips into English perfectly and is useless to every other
   * locale, which is exactly the bug being fixed.
   */
  readonly structuredLine: AlternativeStructuredText;
  /**
   * ITEM 18. Which of the two modes this list was built for. 'validation' keeps
   * evidence a shopper would not switch to (a bulk pack, a farm) and marks it;
   * 'switching' drops it. See alternative-modes.ts.
   */
  readonly mode: AlternativeMode;
  /** ITEM 18. The constraint marks on this row, empty when none applied. */
  readonly labels: readonly ConstraintLabel[];
  /**
   * ITEM 19. The currency this row's prices are in: the price's own when it stated
   * one, else the market's. Null only when neither is known (the legacy no-market
   * call). Never the result of a conversion.
   */
  readonly currency: string | null;
  /**
   * ITEM 19. False when the market could not be checked against this row: the
   * caller gave no market, or the price stated no currency. The row is still
   * offered (an answer with a mark beats none) and the caller marks it.
   */
  readonly marketVerified: boolean;
  /**
   * ITEM 20. The pack size exactly as the catalogue holds it. The unit price above
   * is in Shin's comparison unit; this is the original, kept beside it.
   */
  readonly originalSize: { readonly value: number; readonly unit: string } | null;
}

/** Sizes must be within this ratio to be a fair swap. A 2 kg sack is not an alternative to a 200 g box. */
const SIZE_RATIO = 4;
/** Below this there is no saving worth interrupting anyone for. */
const MIN_SAVING = 0.05;

const MAX_CONSIDERED = 60;

/**
 * ITEM 18 and 19. What a caller may say about the request. Every field is
 * optional so the existing four-argument call keeps compiling and behaving.
 *
 * `mode` omitted is 'validation', which is the legacy behaviour (name everything
 * cheaper, drop nothing for being a bulk pack). The scan screen that offers a
 * swap the user would really take passes 'switching'.
 *
 * `market` omitted is the UNKNOWN market: no country filter, no currency check,
 * every row marked `marketVerified: false`. It is deliberately not Canada.
 */
export interface AlternativesOptions {
  readonly mode?: AlternativeMode;
  readonly market?: Market;
  readonly user?: UserConstraintPrefs;
  /**
   * The category taxonomy the ring steps up through (`loadRingTaxonomy()`). `null` means the load
   * failed and was already logged. Left out, alternativesFor logs
   * [category-fault] taxonomy_unavailable once and runs the old position rule.
   */
  readonly taxonomy?: Taxonomy | null;
}

/**
 * The catalogue's own per-country facts. It records ONE country: `sold_in_canada`,
 * set from Open Food Facts' country tags. A market with no column here is not
 * filtered by country (the catalogue cannot say where else a product is sold), and
 * its rows are only ever offered on a price that states the market's currency.
 * Adding a column for another country is one entry here.
 */
const MARKET_COLUMN: Readonly<Record<string, string>> = { CA: 'sold_in_canada' };

function marketFilterSql(market: Market, alias: string): string {
  const col = market.country === null ? undefined : MARKET_COLUMN[market.country];
  return col ? `AND ${alias}.${col} = 1` : '';
}

function marketVouchedByCatalogue(market: Market): boolean {
  return market.country !== null && MARKET_COLUMN[market.country] !== undefined;
}

/**
 * Whether a price may be set against the user's own price. Never converts.
 * Stated currency must equal the market's; an unstated currency counts only where
 * the catalogue's own flag vouches for the market; an unknown market checks
 * nothing (and the row is then marked unverified by the caller).
 */
function priceUsableIn(price: PricedProduct, market: Market): boolean {
  if (market.currency === null) return true;
  if (price.currency) return samePriceBasis(price.currency, market.currency);
  return marketVouchedByCatalogue(market);
}

function subjectOf(c: { sizeValue: number | null; sizeUnit: string | null; source: string }): AlternativeSubject {
  const kind = kindOfSource(c.source);
  return {
    kind,
    condition: 'unknown',
    storeType: 'unknown',
    // Tech's weight is never a comparison basis, so it is never a bulk signal either.
    size: comparesOnUnitPrice(kind) ? toComparison(c.sizeValue, c.sizeUnit) : null,
    membershipRequired: null,
    distanceKm: null,
    attributes: null,
    relation: null,
  };
}

/*
 * `labelForTag` is IMPORTED from search.ts above rather than copied here.
 * This file used to carry a byte-identical private copy, under a comment
 * saying it "must match search.ts's labelForTag exactly, or the same tag
 * renders two different ways on one screen". A comment is not a mechanism:
 * the two copies had already been edited once each, and D-097 needs the tag
 * label to be the same string in the English heading and in the structured
 * heading's `label` fact. One function, one answer.
 */

/**
 * An allergen name as it reads mid-sentence ("Adds milk, tree nuts."), not as
 * a heading. No capitalisation: unlike labelForTag this is never the first
 * word shown to the shopper, "Adds" and "Removes" are.
 */
function allergenName(tag: string): string {
  return tag.toLowerCase().replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
}

/** Item 19: money prints in the currency it is in, never assumed to be dollars. */
function formatCents(cents: number, currency: string | null = null): string {
  return formatMoney(cents, currency);
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * "28 August 2025", the way a person reading a shelf tag would say the date,
 * not "2025-08-28". Parsed by splitting the string rather than `new Date(...)`
 * or `toLocaleDateString`: a bare calendar date parses as UTC midnight, and a
 * local-timezone formatter can print the day before or after depending on
 * where the process runs. Splitting keeps the calendar date the price was
 * actually observed on, no matter what machine renders the row.
 */
function formatSeenDate(observedAt: string): string {
  const [year, month, day] = observedAt.slice(0, 10).split('-').map(Number);
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * The "at ..." clause naming where the price came from. Three cases, in
 * order:
 *
 * 1. A barcode-joined price with a resolved store: name the store. Both
 *    halves of this check are load-bearing, for different reasons, and
 *    neither substitutes for the other. `storeName !== null` alone is not
 *    enough because presence of a name says nothing about whether the join
 *    that attached it can be trusted. `joinMethod === 'gtin'` alone is not
 *    enough because 82 of 782 barcode-joined rows resolved no store at all,
 *    and printing null would be worse than the honest fallback below. City
 *    follows the name when we have one.
 * 2. The seller is a place a shopper can actually go. Shown as-is. This is
 *    also where every current name-joined row lands: all 14 are walmart.ca,
 *    and none of them has a store name today, so case 1 has never actually
 *    fired against a name-joined row. It stays a conjunction anyway, because
 *    walmart.ca is exactly the seller that could gain a resolved store name
 *    later, and a join method that can attach to the wrong product should
 *    never be allowed to grow a store name just because one shows up.
 * 3. Everything else: the honest fallback, naming only what is actually
 *    known, which is that somebody reported this price and we cannot say
 *    where.
 *
 * CASE 2 IS AN ALLOWLIST AND MUST STAY ONE. The first version of this
 * function asked `seller !== 'openprices'` instead, which is the same
 * sentence written as a denylist of one, and it is wrong in a way that is
 * invisible until it costs something. The whole defect being fixed here is
 * that "openprices", the name of the database a price was donated to, was
 * being printed as though a shopper could walk into it. A denylist fixes
 * that one string and silently re-creates the bug for the next feed added:
 * the day a second donated source lands, its name prints as a shop on the
 * first run, and nothing fails, and no test covers a seller that did not
 * exist when the test was written.
 *
 * Inverted, the failure lands the safe way round. A new seller prints the
 * fallback until somebody adds it here, so the cost of forgetting is a
 * vaguer sentence rather than a false one, and adding a real shop is a
 * deliberate act by someone who has checked that it IS one.
 */
const SELLERS_A_SHOPPER_CAN_VISIT: ReadonlySet<string> = new Set(['walmart.ca']);

function storeClauseFor(price: PricedProduct): string {
  if (price.joinMethod === 'gtin' && price.storeName !== null) {
    return price.storeCity ? `${price.storeName}, ${price.storeCity}` : price.storeName;
  }
  if (SELLERS_A_SHOPPER_CAN_VISIT.has(price.seller)) {
    return price.seller;
  }
  return 'a store that reported this price';
}

/**
 * The same three cases as `storeClauseFor`, as facts instead of English.
 *
 * The fallback case is the reason this exists at all: "a store that reported
 * this price" is a whole English clause sitting in the middle of the sentence,
 * so a structured line that carried the clause as a string would be exactly as
 * untranslatable as `line` is. What the client gets instead is the KIND of
 * place plus the names, and it writes its own clause.
 *
 * The gate is `storeClauseFor`'s, deliberately duplicated rather than derived:
 * both halves of the conjunction are load-bearing for the reasons written
 * above it, and the round-trip test asserts the two agree on every row it
 * produces, which is a stronger guarantee than sharing a line of code would be.
 */
function placeFactFor(price: PricedProduct): AlternativeFact {
  if (price.joinMethod === 'gtin' && price.storeName !== null) {
    return { kind: 'store', name: price.storeName, city: price.storeCity };
  }
  if (SELLERS_A_SHOPPER_CAN_VISIT.has(price.seller)) {
    return { kind: 'seller', seller: price.seller };
  }
  return { kind: 'unknown' };
}

/*
 * Not every "allergen tag" is the name of an allergen.
 *
 * Open Food Facts allergen tags are contributor-entered, and a slice of them
 * are whole sentences off the back of a package rather than a name: warnings,
 * cautions, ingredient prose, and in at least one case a French allergen
 * declaration complete with a newline in the middle of it. Rendered into this
 * screen's sentence they came out as, verbatim from a live run:
 *
 *   "Adds gluten, milk, soybeans, always read the label carefully because not
 *    all our products are manufactured in a peanut free facility."
 *
 * which is incoherent, and worse, buries three real allergens inside a run-on
 * that reads like a rendering fault rather than a warning.
 *
 * A readable allergen name is short. Measured over the whole catalogue, 39,533
 * tag occurrences across 512 distinct tags: at a 48-character cut, 51
 * occurrences fall outside it, which is 0.13%. That cut keeps every genuine
 * name in the data including the long chemical ones, "sulphur dioxide and
 * sulphites" at 29 characters and "hydroxyisohexyl 3 cyclohexene
 * carboxaldehyde" at 44, and drops the paragraphs, which start at 100-plus.
 *
 * WHAT HAPPENS TO A PRODUCT THAT HAS ONE. Its whole side becomes not-recorded,
 * rather than being compared on the tags that survived the filter. Silently
 * dropping something unreadable and then comparing what is left claims a
 * complete comparison over a list we edited, which is the one thing the
 * allergen wording exists to avoid. We could not read it, so we do not know,
 * and the sentence says we do not know. The cost is small and lands the safe
 * way round: a handful of products get "check the packaging" instead of a
 * comparison, and none get a comparison drawn over data nobody could read.
 */
const MAX_ALLERGEN_NAME = 48;

function isReadableAllergen(tag: string): boolean {
  return allergenName(tag).length <= MAX_ALLERGEN_NAME;
}

function readableAllergens(tags: readonly string[]): string[] {
  return tags.filter(isReadableAllergen);
}

function allAllergensReadable(tags: readonly string[]): boolean {
  return tags.every(isReadableAllergen);
}

/**
 * The allergen sentence. Two states only, per decision 40's printed-not-
 * filtered rule and the coverage limit above `allergenNote`:
 *
 * - 'not-recorded': one side's tag list is empty, which this data cannot
 *   tell apart from "never checked". The sentence says exactly that and
 *   sends the shopper to the one source that can actually answer: the
 *   package.
 * - 'compared': both sides have at least one tag. Says only what changed.
 *   When nothing changed between two recorded lists this still is NOT "same
 *   allergens recorded" -- that phrasing claims the two products were
 *   checked and found clean, which OFF's data can never support (a tag list
 *   is a list of what was found, not a certificate of what is absent) -- so
 *   the wording stays about what was recorded, not about safety.
 */
function allergenSentence(
  note: 'compared' | 'not-recorded',
  added: readonly string[],
  removed: readonly string[],
): string {
  if (note === 'not-recorded') {
    return 'Allergens not recorded for one of these. Check the packaging.';
  }
  const parts: string[] = [];
  if (added.length > 0) parts.push(`Adds ${added.map(allergenName).join(', ')}.`);
  if (removed.length > 0) parts.push(`Removes ${removed.map(allergenName).join(', ')}.`);
  if (parts.length === 0) return 'No difference in the allergens recorded.';
  return parts.join(' ');
}

/**
 * `allergenSentence` as fragments. Same four states, same order, and the tags
 * go across RAW.
 *
 * Raw tags, not the names `allergenName` produces, because "en:tree-nuts" is
 * the identity and "tree nuts" is one locale's rendering of it. A French
 * screen needs "fruits a coque", which it can only reach from the tag. The
 * English renderer in the test applies `allergenName` itself, which is what
 * proves the tag carries everything the sentence needed.
 *
 * The added and removed fragments are two fragments rather than one with both
 * lists, because the original joins them with a space only when both are
 * present, which is precisely what the `sentences` shape means.
 */
function structuredAllergens(
  note: 'compared' | 'not-recorded',
  added: readonly string[],
  removed: readonly string[],
): AlternativeFragment[] {
  if (note === 'not-recorded') return [fragment('alt_allergens_not_recorded')];
  const parts: AlternativeFragment[] = [];
  if (added.length > 0) parts.push(fragment('alt_allergens_added', { added: [...added] }));
  if (removed.length > 0) parts.push(fragment('alt_allergens_removed', { removed: [...removed] }));
  if (parts.length === 0) return [fragment('alt_allergens_no_difference')];
  return parts;
}

/**
 * Finds up to three cheaper same-category products with a real price.
 *
 * REWRITTEN 2026-09-05. The old version refused outright unless the product had
 * a recorded size, and 82% of the catalogue has none, so it returned nothing
 * for four products in five. It also refused unless the size units matched
 * exactly, which drops every gram against millilitre pairing.
 *
 * It now always looks. When both sizes are known it compares unit prices, which
 * is the honest comparison and is preferred. When either size is missing it
 * compares the price on the tag and labels the row as such, because "this other
 * jar is two dollars less" is useful to somebody in an aisle even when nobody
 * recorded how big either jar is, and silence is not.
 */
export async function alternativesFor(
  db: DatabaseSync,
  original: Candidate,
  originalPriceCents: number,
  lookup: PriceLookup,
  options: AlternativesOptions = {},
): Promise<Alternative[]> {
  const mode: AlternativeMode = options.mode ?? 'validation';
  const market: Market = options.market ?? UNKNOWN_MARKET;
  const userPrefs: UserConstraintPrefs = options.user ?? {};
  const marketSql = (alias: string) => marketFilterSql(market, alias);
  const path = original.categoryPath;
  if (options.taxonomy === undefined) logTaxonomyUnavailableOnce('no taxonomy was passed to alternativesFor');
  /*
   * THE SAME WALK THE NEIGHBOUR RING USES, WHICH CLOSES THE OTHER HALF OF D-036.
   *
   * D-068 gave this path MAX_RING_TAG so a shelf-sized tag returns nothing, and
   * deliberately stopped there: what counts as a substitute was a product call
   * and it needed the founder. It has him now (2026-09-13) and the rule is
   * chooseRingTag's -- leaf first, ONE step up to the parent if the leaf is
   * empty, never further, with the cap applying at both levels.
   *
   * What this buys the shopper is the thing that was asked for: other Gala
   * apples when there are other Gala apples, and a Honeycrisp only when there
   * are not, carrying `ring: 'parent'` so the client can say so. What it forecloses
   * is D-036 -- `en:whole-grains` is nobody's leaf and nobody's parent-of-a-leaf
   * for tortilla chips, so it can no longer pair them with ginger oat cookies
   * however many priced rows it holds.
   *
   * Both probes go through product_category, counted the way the ring counts
   * and bounded at MAX_RING_TAG + 1 so a huge tag costs a bounded scan rather
   * than a true count. Casing is chooseRingTag's job, once, for both probes and
   * the SELECT below -- see its comment on why splitting that is a bug.
   */
  const chosen = chooseRingTag(path, {
    size: (t) =>
      (db
        .prepare(
          `SELECT count(*) AS n FROM (SELECT 1 FROM product_category WHERE tag = ? LIMIT ${MAX_RING_TAG + 1})`,
        )
        .get(t) as { n: number }).n,
    /*
     * A neighbour here has to be one this query could actually offer, not just
     * any row carrying the tag: same source (item 19a, pet food is not a swap
     * for human food) and sold in the user's market (item 19: the catalogue's own
     * country flag where it has one, no filter where it does not), which are the
     * two filters the SELECT below applies anyway. Probing without them would let a leaf that holds
     * only unreachable rows claim the ring and swallow the parent step, which
     * is the "no gala apples" case failing silently rather than widening.
     */
    hasNeighbour: (t) =>
      db
        .prepare(
          `SELECT 1 AS found
             FROM product_category pc
             JOIN product p ON p.rowid = pc.rowid_ref
            WHERE pc.tag = ? AND p.code <> ? ${marketSql('p')} AND p.source = ?
            LIMIT 1`,
        )
        .get(t, original.code, original.source) !== undefined,
  }, options.taxonomy ?? null);
  if (!chosen) return [];
  const tag = chosen.tag;

  /*
   * ITEM 20. The size is converted to Shin's comparison unit (grams, millilitres,
   * items) once, here, by the same table the verdict reads (units.ts). Before
   * this, the size window and the "same unit" test both compared RAW numbers with
   * raw unit strings, so 2 kg and 500 g were "different units", and a kg row
   * priced "per 100 g" was a thousand times over.
   *
   * TECH IS NEVER COMPARED BY WEIGHT (Jamin: "tech products have weight specs but
   * cannot be compared based on that"): a tech original has no unit-price basis
   * whatever its recorded size, so its rows fall to the ticket comparison.
   */
  const originalKind = kindOfSource(original.source);
  const originalQty = comparesOnUnitPrice(originalKind)
    ? toComparison(original.sizeValue, original.sizeUnit)
    : null;
  const sized = originalQty !== null;
  const minSize = sized ? originalQty.baseValue / SIZE_RATIO : 0;
  const maxSize = sized ? originalQty.baseValue * SIZE_RATIO : 0;
  const originalSubject = subjectOf(original);

  /*
   * When the original has a size, prefer same-unit comparable-size rows but do
   * not require them: they sort first and the rest follow, so a category with
   * only differently sized neighbours still returns something.
   */
  const rows = db
    .prepare(
      `SELECT p.code, p.name, p.name_en, p.name_fr, p.brands, p.quantity,
              p.size_value, p.size_unit, p.category_path, p.leaf_category,
              p.allergens, p.sold_in_canada, p.source,
              p.generic_name, p.nutriscore_grade, p.nova_group, p.additives_n,
              p.ingredients_text,
              CASE WHEN ?1 = 1
                     AND ${sqlFamily('p.size_unit')} = ?4
                     AND ${sqlBaseValue('p.size_value', 'p.size_unit')} BETWEEN ?5 AND ?6
                   THEN 0 ELSE 1 END AS rank_bucket
       FROM product_category pc
       JOIN product p ON p.rowid = pc.rowid_ref
       WHERE pc.tag = ?2
         AND p.code <> ?3
         ${marketSql('p')}
         /*
          * ITEM 19a. A category tag is Open Food Facts' own taxonomy, shared
          * across the sibling projects with no wall between them: pet food and
          * human food both carry "en:snacks", "en:biscuits", "en:beverages",
          * "en:pate". Without this, a cheaper cat treat priced at a store gets
          * offered as the cheaper option beside a human snack sharing the tag,
          * which is a cheaper alternative of the wrong kind, not a cheaper
          * alternative. Same source as the original is the narrowest rule that
          * actually stops it: it also keeps electronics off a grocery original
          * and vice versa, at the cost that a genuinely comparable product filed
          * under a different sibling project (rare; the sources are close to
          * disjoint by design) is missed rather than shown wrong.
          */
         AND p.source = ?8
       ORDER BY rank_bucket, p.name
       LIMIT ?7`,
    ).all(
    sized ? 1 : 0,
    tag,
    original.code,
    originalQty?.family ?? null,
    minSize,
    maxSize,
    MAX_CONSIDERED,
    original.source,
  ) as unknown as {
    code: string;
    name: string;
    name_en: string | null;
    name_fr: string | null;
    brands: string | null;
    quantity: string | null;
    size_value: number;
    size_unit: string;
    category_path: string;
    leaf_category: string | null;
    allergens: string;
    sold_in_canada: number;
    generic_name: string | null;
    nutriscore_grade: string | null;
    nova_group: number | null;
    additives_n: number | null;
    ingredients_text: string | null;
    source: string;
  }[];

  if (rows.length === 0) return [];

  const prices = await lookup(rows.map((r) => r.code));
  if (prices.size === 0) return [];

  const originalPer = originalQty
    ? unitPriceCents(originalPriceCents, original.sizeValue, original.sizeUnit)
    : null;
  const originalUnit = originalPer?.unitCents ?? null;
  const originalAllergens = new Set(readableAllergens(original.allergens));
  const originalAllergensReadable = allAllergensReadable(original.allergens);

  const out: Alternative[] = [];
  for (const r of rows) {
    const price = prices.get(r.code);
    if (!price) continue;

    /*
     * ITEM 19. A price is compared only with a price in the user's own currency,
     * and nothing is ever converted. A row whose price cannot be checked against
     * the market is dropped when the market is known, kept and marked when it is
     * not (an answer with a mark beats none).
     */
    if (!priceUsableIn(price, market)) continue;
    const rowCurrency = price.currency ?? market.currency ?? null;
    const marketVerified =
      market.currency !== null &&
      (price.currency ? samePriceBasis(price.currency, market.currency) : marketVouchedByCatalogue(market));

    /*
     * Unit price when both sides have a size in the same family (grams with
     * kilograms, millilitres with litres, ounces with grams), ticket price
     * otherwise. Both are converted to Shin's comparison unit first (item 20).
     * The fallback is where four products in five now get an answer instead of
     * nothing.
     */
    const rowQty = comparesOnUnitPrice(originalKind)
      ? toComparison(r.size_value, r.size_unit)
      : null;
    const rowPer = rowQty ? unitPriceCents(price.amountCents, r.size_value, r.size_unit) : null;
    const comparable = originalPer !== null && rowPer !== null && sameFamily(originalQty, rowQty);

    const basis: SavingBasis = comparable ? 'unit' : 'ticket';
    const unitCents = comparable ? rowPer!.unitCents : null;
    const cheaperBy = comparable
      ? (originalUnit! - unitCents!) / originalUnit!
      : (originalPriceCents - price.amountCents) / originalPriceCents;
    if (cheaperBy < MIN_SAVING) continue;

    /*
     * ITEM 18. The same constraint set the Gemini path uses, run over this row.
     * The catalogue knows a pack size and a source, not a store type or a
     * condition, so in practice only the bulk constraint can speak here; the rest
     * see unknowns and allow. In 'switching' an excluded row is not offered; in
     * 'validation' it is kept and carries its labels.
     */
    const constraintResult = evaluateConstraints({
      mode,
      original: originalSubject,
      candidate: subjectOf({ sizeValue: r.size_value, sizeUnit: r.size_unit, source: r.source }),
      user: userPrefs,
    });
    if (!constraintResult.allowed) continue;

    const storedAllergens: string[] = JSON.parse(r.allergens) as string[];
    const theirAllergens = readableAllergens(storedAllergens);
    /*
     * A comparison needs two tag lists to compare, and both of them have to be
     * readable. An empty list here is not "confirmed no allergens", it is
     * "nothing recorded" (Open Food Facts has no way to say the former, see
     * prepare_rows.py:243), so an empty side on either product means no
     * comparison is drawn at all rather than one drawn against a false zero.
     * A side carrying a tag we had to discard as unreadable is the same case
     * for the same reason: we do not know what it said.
     */
    const allergenNote: 'compared' | 'not-recorded' =
      originalAllergens.size > 0
      && theirAllergens.length > 0
      && originalAllergensReadable
      && storedAllergens.length === theirAllergens.length
        ? 'compared'
        : 'not-recorded';
    const added =
      allergenNote === 'compared' ? theirAllergens.filter((a) => !originalAllergens.has(a)) : [];
    const removed =
      allergenNote === 'compared'
        ? [...originalAllergens].filter((a) => !theirAllergens.includes(a))
        : [];

    // Shin's comparison unit for this row's family: "100 g", "100 ml" or "each".
    const per = rowPer ? rowPer.label : '100 g';
    const product: Candidate = {
      code: r.code,
      name: r.name,
      nameEn: r.name_en,
      nameFr: r.name_fr,
      brands: r.brands,
      quantity: r.quantity,
      sizeValue: r.size_value,
      sizeUnit: r.size_unit,
      leafCategory: r.leaf_category,
      categoryPath: JSON.parse(r.category_path) as string[],
      allergens: theirAllergens,
      soldInCanada: r.sold_in_canada === 1,
      source: r.source,
      genericName: r.generic_name,
      nutriscoreGrade: r.nutriscore_grade,
      novaGroup: r.nova_group,
      additivesN: r.additives_n,
      ingredientsText: r.ingredients_text,
      signals: {
        textRank: null, vectorRank: null, bm25: null, similarity: null,
        rrf: 0, brandAgrees: null, sizeAgrees: null,
      },
    };

    /*
     * The store clause. Every row gets one, whatever shape it takes: a real
     * store, a real seller, or the honest "somebody reported this, we do not
     * know where". A list where one row names a store and the other two say
     * nothing would read as those two being UNSOURCED rather than sourced
     * differently, which is false, so no row is ever left without one.
     */
    const storeClause = storeClauseFor(price);
    const seenClause = `Seen ${formatSeenDate(price.observedAt)}.`;

    out.push({
      product,
      price,
      basis,
      unitCents,
      cheaperBy,
      addedAllergens: added,
      removedAllergens: removed,
      allergenNote,
      ring: chosen.level,
      ringTag: tag,
      // The sentence, written once, here. A measurement and a source, and
      // nothing about how it tastes. The weaker comparison says it is weaker
      // in the sentence itself rather than being dropped. The date is not
      // decoration: it is what stops a price observed in 2024 reading as
      // today's.
      // The sentence, written once, here. A measurement and a source, and
      // nothing about how it tastes. The weaker comparison says it is weaker
      // in the sentence itself rather than being dropped. The date is not
      // decoration: it is what stops a price observed in 2024 reading as
      // today's.
      //
      // NO LOOSER/PARENT WORDING LIVES HERE, RULED 2026-09-13. A parent-ring
      // swap is announced by the CLIENT, from `ring` below, in both locales
      // (app/public/js/ui-strings.js). A sentence here as well would say it
      // twice, and English-only server prose is what this repo moved away from
      // the same day: the server emits facts, the client renders words.
      line: comparable
        ? `${formatCents(unitCents!, rowCurrency)} per ${per} at ${storeClause}, ` +
          `against ${formatCents(originalUnit!, rowCurrency)}. ${seenClause} ` +
          allergenSentence(allergenNote, added, removed)
        : `${formatCents(price.amountCents, rowCurrency)} at ${storeClause}, ` +
          `against ${formatCents(originalPriceCents, rowCurrency)}. Sizes may differ. ${seenClause} ` +
          allergenSentence(allergenNote, added, removed),
      /*
       * THE SAME SENTENCE AS FACTS. D-097. Built from the same locals the
       * string above is built from, in the same order, so the two say one
       * thing by construction and the round-trip test keeps them saying it.
       *
       * `shape` is `sentences`, not `single`. The line is two or three or four
       * sentences joined by one space, and `sentences` is the spine's existing
       * name for exactly that. A `single` shape would have forced one code per
       * whole line, which is two bases times four allergen states, and the
       * client would have to write eight near-identical French sentences that
       * cannot be reused anywhere. Splitting at the full stop is what makes
       * "seen on this date" and "adds these allergens" translatable ONCE.
       *
       * `unitCents` and `originalUnitCents` can be fractional: they are a
       * division, and the English renderer's `(cents / 100).toFixed(2)` is
       * where the rounding happens. They are still cents, and still raw. A
       * locale rounds at its own formatter, never here.
       */
      structuredLine: {
        shape: 'sentences',
        fragments: comparable
          ? [
              fragment('alt_unit_price_cheaper', {
                unitCents: unitCents!,
                originalUnitCents: originalUnit!,
                perQuantity: rowPer!.perQuantity,
                perUnit: rowPer!.baseUnit,
                currency: rowCurrency,
                place: placeFactFor(price),
              }),
              fragment('alt_seen_on', { observedAt: price.observedAt }),
              ...structuredAllergens(allergenNote, added, removed),
            ]
          : [
              fragment('alt_ticket_price_cheaper', {
                amountCents: price.amountCents,
                originalAmountCents: originalPriceCents,
                currency: rowCurrency,
                place: placeFactFor(price),
              }),
              fragment('alt_sizes_may_differ'),
              fragment('alt_seen_on', { observedAt: price.observedAt }),
              ...structuredAllergens(allergenNote, added, removed),
            ],
      },
      mode,
      labels: constraintResult.labels,
      currency: rowCurrency,
      marketVerified,
      originalSize: rowQty ? rowQty.original : r.size_value !== null && r.size_unit ? { value: r.size_value, unit: r.size_unit } : null,
    });
  }

  return out
    .sort((a, b) => b.cheaperBy - a.cheaperBy)
    .slice(0, 3);
}

/**
 * The heading above the alternatives.
 *
 * Names the category the swap is drawn from, for the same reason the neighbour
 * ring names its own level: "cheaper peanut butters" is a claim a shopper can
 * check, and "cheaper alternatives" is one they cannot.
 *
 * IT NAMES THE ORIGINAL'S OWN LEAF, AND DOES NOT KNOW ABOUT PARENT RINGS. That
 * was tried on 2026-09-13 as a third argument and ruled out the same day: the
 * client already handles the all-looser case itself, from `ring` on the rows,
 * in both locales. Two authorities on one heading is how they drift apart.
 */
export function alternativesHeading(original: Candidate, count: number): string {
  if (count === 0) return 'No cheaper option we can price';
  const tag = original.categoryPath[original.categoryPath.length - 1];
  return `Cheaper ${tag ? labelForTag(tag) : 'options'}`;
}

/**
 * The same heading as facts. D-097.
 *
 * A SECOND FUNCTION, NOT A SECOND RETURN FIELD. `app/server.ts` passes
 * `alternativesHeading(...)`'s result straight into `alternativesPayload`,
 * whose `heading` parameter is a `string`; widening the return to an object
 * would break that call site, and this lane does not own that file. Adding an
 * export beside it costs the app one extra call when it is ready for it and
 * costs it nothing until then.
 *
 * `label` is carried BESIDE `tag` even though it is derived from it. The tag is
 * the identity and is what a French dictionary would be keyed on; the label is
 * the English fallback for a locale that has no word for this tag yet, which is
 * every locale on day one. A client with no entry for "en:peanut-butters"
 * prints the label rather than the raw tag, and a shopper sees "peanut butters"
 * rather than "en:peanut-butters".
 *
 * `label` is null exactly when `tag` is, which is the empty-category-path case
 * the English above spells "options". The client decides its own word for that
 * rather than being handed one.
 */
export function alternativesHeadingStructured(
  original: Candidate,
  count: number,
): AlternativeStructuredText {
  if (count === 0) return say('alternatives_none_priced');
  const tag = original.categoryPath[original.categoryPath.length - 1];
  return say('alternatives_cheaper_in_leaf', {
    tag: tag ?? null,
    label: tag ? labelForTag(tag) : null,
    count,
  });
}
