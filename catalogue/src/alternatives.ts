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
import { MAX_RING_TAG } from './search.ts';
import type { Candidate } from './search.ts';

export interface PricedProduct {
  readonly code: string;
  /** Cents. The number a shopper would pay at this seller today. */
  readonly amountCents: number;
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
  /** The exact sentence to show. Written here so no screen can improvise one. */
  readonly line: string;
}

/** Sizes must be within this ratio to be a fair swap. A 2 kg sack is not an alternative to a 200 g box. */
const SIZE_RATIO = 4;
/** Below this there is no saving worth interrupting anyone for. */
const MIN_SAVING = 0.05;

const MAX_CONSIDERED = 60;

function unitCentsOf(amountCents: number, sizeValue: number): number {
  // Per 100 base units, matching how Canadian shelf tags print unit prices.
  return (amountCents / sizeValue) * 100;
}

/**
 * Must match search.ts's labelForTag exactly, or the same tag renders two
 * different ways on one screen. Lower-cased FIRST: the prefix regex only
 * recognises a lower-case prefix, so a tag stored "En:cosmetic-products"
 * never had its prefix stripped under the old order. Only the first letter
 * is capitalised, never every word, per search.ts's own comment on this.
 */
function labelForTag(tag: string): string {
  const label = tag.toLowerCase().replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * An allergen name as it reads mid-sentence ("Adds milk, tree nuts."), not as
 * a heading. No capitalisation: unlike labelForTag this is never the first
 * word shown to the shopper, "Adds" and "Removes" are.
 */
function allergenName(tag: string): string {
  return tag.toLowerCase().replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
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
): Promise<Alternative[]> {
  const path = original.categoryPath;
  if (path.length === 0) return [];
  // Lower-cased: product_category.tag is written lower-case (schema.ts,
  // rebuildCategories), and category_path on the row is not. Without this the
  // WHERE pc.tag = ?2 probe below silently matches less than it should
  // whenever the original product's own path carries any stray capital.
  const tag = path[path.length - 1].toLowerCase();
  /*
   * THE SAME CAP THE RING OBEYS, WHICH THIS PATH SKIPPED. `search.ts` refuses
   * to draw a neighbour ring from a tag over MAX_RING_TAG members, and says
   * why: a tag that big is not a kind of thing, it is a shelf of the whole
   * shop. The alternatives query read `product_category` directly and never
   * asked. That is the mechanism under D-036 -- the one populated result the
   * store could produce offered ginger oat cookies as a cheaper swap for
   * tortilla chips, both `en:whole-grains`, a tag broad enough to pair
   * anything with anything. The word "cheaper" implies "instead of this",
   * and over a shelf-sized tag it lies.
   *
   * Counted the way the ring counts, capped at MAX_RING_TAG + 1 so a huge tag
   * costs a bounded scan rather than a true count. An empty list is the
   * answer, not a narrower tag: walking inward is a product decision about
   * what counts as a substitute, and it is still the founder's (D-036).
   */
  const members = db
    .prepare(`SELECT count(*) AS n FROM (SELECT 1 FROM product_category WHERE tag = ? LIMIT ${MAX_RING_TAG + 1})`)
    .get(tag) as { n: number };
  if (members.n > MAX_RING_TAG) return [];

  const sized = original.sizeValue !== null && original.sizeUnit !== null;
  const minSize = sized ? original.sizeValue! / SIZE_RATIO : 0;
  const maxSize = sized ? original.sizeValue! * SIZE_RATIO : 0;

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
              CASE WHEN ?1 = 1
                     AND p.size_unit = ?4
                     AND p.size_value BETWEEN ?5 AND ?6
                   THEN 0 ELSE 1 END AS rank_bucket
       FROM product_category pc
       JOIN product p ON p.rowid = pc.rowid_ref
       WHERE pc.tag = ?2
         AND p.code <> ?3
         AND p.sold_in_canada = 1
       ORDER BY rank_bucket, p.name
       LIMIT ?7`,
    ).all(
    sized ? 1 : 0,
    tag,
    original.code,
    original.sizeUnit,
    minSize,
    maxSize,
    MAX_CONSIDERED,
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
    source: string;
  }[];

  if (rows.length === 0) return [];

  const prices = await lookup(rows.map((r) => r.code));
  if (prices.size === 0) return [];

  const originalUnit =
    original.sizeValue !== null ? unitCentsOf(originalPriceCents, original.sizeValue) : null;
  const originalAllergens = new Set(readableAllergens(original.allergens));
  const originalAllergensReadable = allAllergensReadable(original.allergens);

  const out: Alternative[] = [];
  for (const r of rows) {
    const price = prices.get(r.code);
    if (!price) continue;

    /*
     * Unit price when both sides have a size and the same unit, ticket price
     * otherwise. The fallback is where four products in five now get an answer
     * instead of nothing.
     */
    const comparable =
      originalUnit !== null &&
      r.size_value !== null &&
      r.size_value > 0 &&
      r.size_unit === original.sizeUnit;

    const basis: SavingBasis = comparable ? 'unit' : 'ticket';
    const unitCents = comparable ? unitCentsOf(price.amountCents, r.size_value) : null;
    const cheaperBy = comparable
      ? (originalUnit! - unitCents!) / originalUnit!
      : (originalPriceCents - price.amountCents) / originalPriceCents;
    if (cheaperBy < MIN_SAVING) continue;

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

    const per = r.size_unit === 'ml' ? '100 ml' : '100 g';
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
      // The sentence, written once, here. A measurement and a source, and
      // nothing about how it tastes. The weaker comparison says it is weaker
      // in the sentence itself rather than being dropped. The date is not
      // decoration: it is what stops a price observed in 2024 reading as
      // today's.
      line: comparable
        ? `${formatCents(unitCents!)} per ${per} at ${storeClause}, ` +
          `against ${formatCents(originalUnit!)}. ${seenClause} ` +
          allergenSentence(allergenNote, added, removed)
        : `${formatCents(price.amountCents)} at ${storeClause}, ` +
          `against ${formatCents(originalPriceCents)}. Sizes may differ. ${seenClause} ` +
          allergenSentence(allergenNote, added, removed),
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
 */
export function alternativesHeading(original: Candidate, count: number): string {
  if (count === 0) return 'No cheaper option we can price';
  const tag = original.categoryPath[original.categoryPath.length - 1];
  return `Cheaper ${tag ? labelForTag(tag) : 'options'}`;
}
