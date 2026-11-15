/**
 * Pexi is a grocery price checker, so a typed name is only ever answered with what a supermarket sells.
 *
 * The catalogue holds millions of rows that are not that (Open Icecat's 4.97 M electronics, of which
 * `en:computers-peripherals` alone is 3.9 M, plus toys, tools and books in Open Products Facts), and a typed
 * number or a common word reaches them: live, "3110" offered a Dell laptop and a Grundig dictaphone.
 *
 * THE RULE, built on the verdicts category-map.ts already holds (so the two cannot disagree about what is
 * grocery) and applied to the row's source and category path:
 *   - Kept: Open Food Facts, Open Pet Food Facts and Open Beauty Facts rows (food, drink, pet, personal care);
 *     any row with a household cleaning tag (dish soap, detergents, cat litter) or a baby, cleaning, laundry,
 *     paper or hygiene tag; the Open Icecat sections for health and beauty, food and drink, and pet care;
 *     loose produce; and rows from the shop and USDA loaders (a source this file has no reason to doubt).
 *   - Dropped: any row category-map.ts calls tech or furniture; every other Open Icecat section (toys, building,
 *     lighting, appliances and the rest); and Open Products Facts rows that carry no grocery tag.
 *   - A row with no source and no category is kept: it cannot be shown to be anything else.
 *
 * This narrows typed-name answers and their pick list only. A scanned or picked barcode is never filtered: a
 * scanned barcode is what it is.
 */

import { categoryFor } from './category-map.ts';

/** A tag, anywhere on the path, that says a thing is bought in a supermarket or drugstore aisle. */
const GROCERY_TAG =
  /(^|:)(baby|babies|infant|diapers?|nappies|cleaning|cleaners?|household|laundry|detergents?|paper-towels?|toilet-paper|tissues?|soaps?|hygiene|toothpastes?|shampoos?|food|foods|beverages?|drinks?|snacks?|dairies|groceries|pet-food)(-|$)/;

export interface ScopeRow {
  readonly source?: string | null;
  readonly categoryPath?: readonly string[] | null;
  readonly leafCategory?: string | null;
}

export function isGroceryRow(row: ScopeRow): boolean {
  const source = typeof row.source === 'string' ? row.source : '';
  const path = Array.isArray(row.categoryPath) ? row.categoryPath.filter((t): t is string => typeof t === 'string') : [];
  const leaf = typeof row.leafCategory === 'string' ? row.leafCategory : null;
  const verdict = categoryFor({ source, categoryPath: path, leafCategory: leaf });
  if (verdict.category === 'grocery' || verdict.category === 'produce') return true;
  if (verdict.category === 'tech' || verdict.category === 'furniture') return false;
  // Unclassified by category-map.ts: judged by source, then by any grocery-aisle tag.
  const tags = [...path, ...(leaf ? [leaf] : [])].map((t) => t.toLowerCase());
  if (tags.some((t) => GROCERY_TAG.test(t))) return true;
  if (source === 'icecat' || source === 'openproductsfacts') return false;
  return true;
}
