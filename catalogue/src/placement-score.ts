/**
 * Scoring a category placer for depth as well as correctness
 * (docs/category-safeguards-2026-10-08.md, B8).
 *
 * A placer that always stops one level short ("Cheeses" for a cheddar) is never exactly
 * right and never wildly wrong, and a correctness-only score reads it as a plain miss.
 * This scorer reports how often the placement lands at or above the parent of the true
 * category, so a gate can refuse a placer that is safe but shallow. The gate is
 * `atOrAboveParent <= 0.10`.
 */

import type { Taxonomy } from './category-taxonomy.ts';
import { foldTag } from './category-taxonomy.ts';

export interface PlacementScore {
  /** Items scored. */
  readonly n: number;
  /** Share placed exactly at the true category. */
  readonly exact: number;
  /** Share placed at the parent of the true category or at any ancestor of that parent (a placer that stops short). */
  readonly atOrAboveParent: number;
  /** Share placed at a tag that is not in the taxonomy at all. */
  readonly placedUnknown: number;
  /** Share placed somewhere else: another branch, or below the true category. */
  readonly other: number;
}

/**
 * Throws when there is nothing to score, or when a TRUE category is not in the taxonomy:
 * a zero from a broken input is not a result.
 */
export function scorePlacement(items: readonly { truth: string; placed: string }[], tax: Taxonomy): PlacementScore {
  if (items.length === 0) throw new Error('scorePlacement: no items to score');
  let exact = 0;
  let short = 0;
  let unknown = 0;
  for (const item of items) {
    const truth = foldTag(item.truth);
    const placed = foldTag(item.placed);
    if (!tax.has(truth)) throw new Error(`scorePlacement: the true category ${item.truth} is not in the taxonomy`);
    if (placed === truth) exact += 1;
    else if (!tax.has(placed)) unknown += 1;
    else if (tax.parentsOf(truth).some((p) => p === placed || tax.isAncestor(placed, p))) short += 1;
  }
  const n = items.length;
  return {
    n,
    exact: exact / n,
    atOrAboveParent: short / n,
    placedUnknown: unknown / n,
    other: (n - exact - short - unknown) / n,
  };
}
