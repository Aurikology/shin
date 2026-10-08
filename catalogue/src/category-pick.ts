/**
 * Which tag is a product's leaf, and the one chain of ancestors above it
 * (docs/category-safeguards-2026-10-08.md, B1; the canonical-path migration).
 *
 * Open Food Facts tags a product with several categories, and two of them can sit on
 * separate branches ("Cheddar" and "Chips"). Today the last tag is taken and nothing is
 * recorded. The written rule: among the product's deepest tags, the branch with more
 * PRICED products wins; every other deepest tag is returned in `rejected` so the load
 * can record it. Pure functions; the callers supply the counts.
 */

import { foldTag, type Taxonomy } from './category-taxonomy.ts';

export interface LeafPick {
  readonly leaf: string;
  /** The other deepest tags, in the order the rule ranks them. */
  readonly rejected: string[];
}

/**
 * Pick the leaf of a product's tags.
 *
 * `tags` are taxonomy keys (a label is resolved before this is called); a tag that is not
 * in the taxonomy is ignored. Ranking among the deepest tags: more priced products
 * (`pricedCount`), then more catalogue members (`memberCount`, default none), then deeper
 * in the taxonomy, then alphabetical. Throws when none of the tags is in the taxonomy:
 * there is nothing to pick from and the caller must have counted that row aside.
 */
export function pickLeaf(
  tags: readonly string[],
  tax: Taxonomy,
  pricedCount: (tag: string) => number,
  memberCount: (tag: string) => number = () => 0,
): LeafPick {
  const known = [...new Set(tags.map(foldTag))].filter((t) => tax.has(t));
  const deepest = known.filter((t) => !known.some((o) => o !== t && tax.isAncestor(t, o)));
  if (deepest.length === 0) throw new Error(`pickLeaf: none of ${JSON.stringify(tags)} is in the taxonomy`);
  const ranked = [...deepest].sort(
    (a, b) =>
      pricedCount(b) - pricedCount(a) ||
      memberCount(b) - memberCount(a) ||
      tax.depthOf(b) - tax.depthOf(a) ||
      (a < b ? -1 : a > b ? 1 : 0),
  );
  return { leaf: ranked[0]!, rejected: ranked.slice(1) };
}

/**
 * The chain from a root to `leaf`, one parent per node. At each node with several
 * taxonomy parents the choice is: a parent among the product's own tags first, then the
 * parent with more catalogue members, then alphabetical. Returned root first, leaf last.
 */
export function canonicalChain(
  leaf: string,
  ownTags: readonly string[],
  tax: Taxonomy,
  memberCount: (tag: string) => number = () => 0,
): string[] {
  const own = new Set(ownTags.map(foldTag));
  const chain: string[] = [foldTag(leaf)];
  const seen = new Set(chain);
  for (;;) {
    const node = chain[chain.length - 1]!;
    const parents = tax.parentsOf(node).filter((p) => !seen.has(p));
    if (parents.length === 0) break;
    const best = [...parents].sort(
      (a, b) =>
        Number(own.has(b)) - Number(own.has(a)) ||
        memberCount(b) - memberCount(a) ||
        (a < b ? -1 : a > b ? 1 : 0),
    )[0]!;
    chain.push(best);
    seen.add(best);
  }
  return chain.reverse();
}
