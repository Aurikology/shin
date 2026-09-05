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
import type { Candidate } from './search.ts';

export interface PricedProduct {
  readonly code: string;
  /** Cents. The number a shopper would pay at this seller today. */
  readonly amountCents: number;
  readonly seller: string;
  /** ISO date the price was observed. Decision 42: never presented as "now". */
  readonly observedAt: string;
}

/** How a price is fetched. Injected so this file needs no feed of its own. */
export interface PriceLookup {
  (codes: readonly string[]): Promise<Map<string, PricedProduct>>;
}

export interface Alternative {
  readonly product: Candidate;
  readonly price: PricedProduct;
  /** Cents per 100 g or 100 ml. The only fair comparison across pack sizes. */
  readonly unitCents: number;
  /** How much cheaper per unit than the thing being compared, as a fraction. */
  readonly cheaperBy: number;
  /**
   * Allergen tags this alternative has that the original did not.
   * Printed on the row. Never used to hide it.
   */
  readonly addedAllergens: readonly string[];
  /** Allergen tags the original had that this one does not. */
  readonly removedAllergens: readonly string[];
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

function labelForTag(tag: string): string {
  return tag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Finds up to three cheaper same-category products with a real price.
 *
 * Returns an empty list rather than widening the category or dropping the size
 * rule when it cannot find three. An alternative that is not really an
 * alternative is worse than none: the user walks to another aisle for it.
 */
export async function alternativesFor(
  db: DatabaseSync,
  original: Candidate,
  originalPriceCents: number,
  lookup: PriceLookup,
): Promise<Alternative[]> {
  if (original.sizeValue === null || original.sizeUnit === null) {
    // Decision 37's dependency. Without a size there is no unit price, and
    // without a unit price "cheaper" is a comparison between two different
    // amounts of product, which is the error this whole module avoids.
    return [];
  }

  const path = original.categoryPath;
  if (path.length === 0) return [];
  const tag = path[path.length - 1];

  const minSize = original.sizeValue / SIZE_RATIO;
  const maxSize = original.sizeValue * SIZE_RATIO;

  const rows = db
    .prepare(
      `SELECT p.code, p.name, p.name_en, p.name_fr, p.brands, p.quantity,
              p.size_value, p.size_unit, p.category_path, p.leaf_category,
              p.allergens, p.sold_in_canada
       FROM product_category pc
       JOIN product p ON p.rowid = pc.rowid_ref
       WHERE pc.tag = ?
         AND p.code <> ?
         AND p.size_unit = ?
         AND p.size_value BETWEEN ? AND ?
         AND p.sold_in_canada = 1
       ORDER BY p.name
       LIMIT ?`,
    ).all(tag, original.code, original.sizeUnit, minSize, maxSize, MAX_CONSIDERED) as unknown as {
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
  }[];

  if (rows.length === 0) return [];

  const prices = await lookup(rows.map((r) => r.code));
  if (prices.size === 0) return [];

  const originalUnit = unitCentsOf(originalPriceCents, original.sizeValue);
  const originalAllergens = new Set(original.allergens);

  const out: Alternative[] = [];
  for (const r of rows) {
    const price = prices.get(r.code);
    if (!price) continue;

    const unitCents = unitCentsOf(price.amountCents, r.size_value);
    const cheaperBy = (originalUnit - unitCents) / originalUnit;
    if (cheaperBy < MIN_SAVING) continue;

    const theirAllergens: string[] = JSON.parse(r.allergens) as string[];
    const added = theirAllergens.filter((a) => !originalAllergens.has(a));
    const removed = [...originalAllergens].filter((a) => !theirAllergens.includes(a));

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
      signals: {
        textRank: null, vectorRank: null, bm25: null, similarity: null,
        rrf: 0, brandAgrees: null, sizeAgrees: null,
      },
    };

    out.push({
      product,
      price,
      unitCents,
      cheaperBy,
      addedAllergens: added,
      removedAllergens: removed,
      // The sentence, written once, here. A measurement and a source, and
      // nothing about how it tastes.
      line:
        `${formatCents(unitCents)} per ${per} at ${price.seller}, ` +
        `against ${formatCents(originalUnit)}`,
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
