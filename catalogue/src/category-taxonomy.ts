/**
 * The Open Food Facts category taxonomy as a reference the category safeguards
 * check against (docs/category-safeguards-2026-10-08.md, Part A).
 *
 * The file is `categories.json` from static.openfoodfacts.org/data/taxonomies/:
 * a JSON object whose keys are tags ("en:cheeses") and whose values carry
 * `parents` (the direct parents) and `children`. Fetched to
 * catalogue/data/off-categories.json by `fetch-categories.ts`; its sha256 is
 * recorded in category-baseline.json so a changed file is noticed.
 *
 * Everything here is pure and read-only. A missing or unreadable file THROWS
 * (`TaxonomyError`): a check that cannot run must say so, never read as zero.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export class TaxonomyError extends Error {
  readonly reason: 'missing' | 'unreadable' | 'empty';
  constructor(reason: 'missing' | 'unreadable' | 'empty', message: string) {
    super(message);
    this.name = 'TaxonomyError';
    this.reason = reason;
  }
}

export interface Taxonomy {
  /** sha256 of the file's bytes, hex. */
  readonly sha256: string;
  /** How many entries the file holds. */
  readonly size: number;
  /** True when the tag is an entry of the taxonomy (case folded). */
  has(tag: string): boolean;
  /** The direct parents of a tag, empty for a root or an unknown tag. */
  parentsOf(tag: string): readonly string[];
  /** True when `ancestor` is a STRICT ancestor of `descendant` (a tag is not its own ancestor). */
  isAncestor(ancestor: string, descendant: string): boolean;
}

/** Tags are compared lower-cased and trimmed, the way product_category stores them. */
export function foldTag(tag: string): string {
  return tag.trim().toLowerCase();
}

/** Build a taxonomy from parsed JSON. `sha256` is passed in so the same bytes give the same hash. */
export function taxonomyFromObject(obj: unknown, sha256: string): Taxonomy {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new TaxonomyError('unreadable', 'the taxonomy is not a JSON object of tag -> entry');
  }
  const parents = new Map<string, readonly string[]>();
  for (const [key, entry] of Object.entries(obj as Record<string, unknown>)) {
    const p = (entry as { parents?: unknown } | null)?.parents;
    parents.set(foldTag(key), Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string').map(foldTag) : []);
  }
  if (parents.size === 0) throw new TaxonomyError('empty', 'the taxonomy has no entries');

  const memo = new Map<string, ReadonlySet<string>>();
  const ancestorsOf = (tag: string): ReadonlySet<string> => {
    const hit = memo.get(tag);
    if (hit) return hit;
    const seen = new Set<string>();
    const stack = [...(parents.get(tag) ?? [])];
    while (stack.length > 0) {
      const t = stack.pop()!;
      if (seen.has(t)) continue; // also guards a cycle in the data
      seen.add(t);
      for (const up of parents.get(t) ?? []) stack.push(up);
    }
    memo.set(tag, seen);
    return seen;
  };

  return {
    sha256,
    size: parents.size,
    has: (tag) => parents.has(foldTag(tag)),
    parentsOf: (tag) => parents.get(foldTag(tag)) ?? [],
    isAncestor: (ancestor, descendant) => ancestorsOf(foldTag(descendant)).has(foldTag(ancestor)),
  };
}

/** Read the taxonomy from a local path. Throws `TaxonomyError` when it is missing, unreadable or empty. */
export function loadTaxonomy(path: string): Taxonomy {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    throw new TaxonomyError(code === 'ENOENT' ? 'missing' : 'unreadable', `taxonomy file ${code === 'ENOENT' ? 'is missing' : 'cannot be read'}: ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new TaxonomyError('unreadable', `taxonomy file is not valid JSON: ${path}`);
  }
  return taxonomyFromObject(parsed, createHash('sha256').update(bytes).digest('hex'));
}

/* ----------------------------------------------------------------- faults */

/** The category faults a product's own tags can show (Part A, A1 to A4). */
export type PathFault = 'two_branches' | 'parent_not_ancestor' | 'unknown_tag' | 'leaf_is_ancestor';

/**
 * The deepest tags of a product: the tags that are in the taxonomy and are not
 * an ancestor of any other of the product's tags. Two or more of them sit on
 * separate branches.
 */
export function deepestTags(tags: readonly string[], tax: Taxonomy): string[] {
  const known = [...new Set(tags.map(foldTag))].filter((t) => tax.has(t));
  return known.filter((t) => !known.some((o) => o !== t && tax.isAncestor(t, o)));
}

/**
 * Which faults one product's tag list shows. `tags` is the stored category
 * path, broad to specific, exactly as the range ladder and the ring read it:
 * the leaf is the LAST tag and the "parent" is the tag before it.
 *
 *   two_branches        A1  two or more deepest tags (a pick was made with no record)
 *   parent_not_ancestor A2  the tag before the last is not an ancestor of the last
 *   unknown_tag         A3  a tag that is not an entry in the taxonomy
 *   leaf_is_ancestor    A4  the last tag is an ancestor of another of the product's tags
 *
 * A path with no tags shows none: there is nothing to check, and the caller
 * counts such rows separately.
 */
export function faultsOfPath(tags: readonly string[], tax: Taxonomy): PathFault[] {
  if (tags.length === 0) return [];
  const out: PathFault[] = [];
  const folded = tags.map(foldTag);
  if (deepestTags(folded, tax).length >= 2) out.push('two_branches');
  if (folded.length >= 2 && !tax.isAncestor(folded[folded.length - 2]!, folded[folded.length - 1]!)) out.push('parent_not_ancestor');
  if (folded.some((t) => !tax.has(t))) out.push('unknown_tag');
  const leaf = folded[folded.length - 1]!;
  if (folded.some((t) => t !== leaf && tax.isAncestor(leaf, t))) out.push('leaf_is_ancestor');
  return out;
}

/**
 * Serve time: a parent rung was used, so the tag called "parent" must be an
 * ancestor of the leaf in the taxonomy. Returns the fault kind or null.
 */
export function parentRungFault(leaf: string, parent: string, tax: Taxonomy): 'parent_not_ancestor' | null {
  return tax.isAncestor(parent, leaf) ? null : 'parent_not_ancestor';
}
