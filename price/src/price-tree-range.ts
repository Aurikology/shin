/**
 * The price tree read as a RANGE, for measuring only (NOT WIRED INTO LIVE ANSWERS, like price-tree.ts).
 *
 * price-tree.ts keeps one estimate per group: a typical log price (theta) and the spread of item log prices
 * inside the group (sigma), both at the reference chain's price level. A group's range here is
 * exp(theta -/+ 0.6745 * sigma): the middle half of the group's items, the same claim today's category range
 * makes (range.ts, 25th to 75th percentile), so the two sit side by side on one scale.
 *
 * INPUT. The tree works from the items' stored category paths and their prices directly. The price layer
 * (catalogue/src/price-layer.ts) is a different thing: it decides which placement nodes share a group from
 * item_placement, and the tree does not read it. Using it would add a second grouping rule on top of the
 * tree's own pooling, so it is left out.
 *
 * AN ITEM THE TREE HAS NOT SEEN is answered from its group: its category path plus its brand tier, walked up
 * (tier node, then each shorter path) to the deepest node holding at least TREE_MIN_ITEMS priced items. The
 * root is never an answer: no category data means no answer, and the caller falls through.
 *
 * STORE BRAND is read from the catalogue's `brands` text against a short list of the big Canadian and US
 * store labels. It is an approximation: a store brand missing from the list is read as a name brand.
 * Prices are compared as given (no size scaling), as price-tree.ts does.
 */
import type { DatabaseSync } from 'node:sqlite';
import { buildPriceTree, type PriceTree, type TreeItem, type TreePrice } from './price-tree.ts';

/** Fewest priced items a group needs before its range is an answer (today's category range uses 5 products). */
export const TREE_MIN_ITEMS = 5;
/** Standard normal 75th percentile: exp(theta -/+ this * sigma) is the middle half. */
export const TREE_Z50 = 0.6745;

const STORE_BRANDS = [
  'no name', 'presidents choice', 'pc', 'compliments', 'life brand', 'selection', 'irresistibles',
  'great value', 'equate', 'kirkland', 'signature select', 'simple truth', 'kroger', 'market pantry', 'good gather', 'good and gather',
  'up up', 'up and up', 'o organics', 'open nature', 'freshness guaranteed', 'sams choice', 'members mark', 'trader joes', '365',
  'our finest', 'western family', 'rooster',
];

/** True when the brands text names a known store label (whole words, apostrophes and punctuation ignored). */
export function isStoreBrand(brands: string | null | undefined): boolean {
  if (!brands) return false;
  const b = ` ${brands.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
  return STORE_BRANDS.some((s) => b.includes(` ${s} `));
}

export interface TreeCatalogueItem {
  readonly key: string;
  /** Broad to specific; items with an empty path are left out. */
  readonly path: readonly string[];
  readonly brands: string | null;
}

export interface TreePricedRow {
  readonly key: string;
  /** The chain (seller) the price was seen at. */
  readonly chain: string;
  readonly cents: number;
}

export interface TreeRange {
  readonly lowCents: number;
  readonly midCents: number;
  readonly highCents: number;
  /** Priced items in the group that answered. */
  readonly n: number;
  /** The group that answered, joined. */
  readonly group: string;
  /** Prices are at this chain's level. */
  readonly referenceChain: string;
}

export type TreeAnswer = ({ readonly ok: true } & TreeRange) | { readonly ok: false; readonly reason: 'no_tree' | 'no_category' | 'group_too_small' };

/**
 * Build a tree from catalogue items and priced rows. Only items that have a price and a category path enter,
 * so the tree is exactly as wide as the data it was given. Null when nothing qualifies.
 */
export function buildTreeFrom(items: ReadonlyMap<string, TreeCatalogueItem>, rows: readonly TreePricedRow[]): PriceTree | null {
  const treeItems: TreeItem[] = [];
  const treePrices: TreePrice[] = [];
  const have = new Set<string>();
  for (const r of rows) {
    const it = items.get(r.key);
    if (!it || it.path.length === 0 || !Number.isInteger(r.cents) || r.cents <= 0) continue;
    if (!have.has(r.key)) {
      have.add(r.key);
      treeItems.push({ code: r.key, name: r.key, brand: it.brands ?? '', storeBrand: isStoreBrand(it.brands), categoryPath: it.path });
    }
    treePrices.push({ code: r.key, chain: r.chain, cents: r.cents });
  }
  return treePrices.length === 0 ? null : buildPriceTree(treeItems, treePrices);
}

/** The range of the deepest group (brand tier, then shorter paths) with enough priced items; never the root. */
export function treeRangeFor(tree: PriceTree | null, path: readonly string[], brands: string | null): TreeAnswer {
  if (!tree || tree.referenceChain === null) return { ok: false, reason: 'no_tree' };
  if (path.length === 0) return { ok: false, reason: 'no_category' };
  const full = [...path, isStoreBrand(brands) ? 'store-brand' : 'name-brand'];
  for (let k = full.length; k >= 1; k--) {
    const nd = tree.node(full.slice(0, k));
    if (!nd || nd.n < TREE_MIN_ITEMS) continue;
    const low = Math.max(1, Math.round(Math.exp(nd.theta - TREE_Z50 * nd.sigma)));
    const high = Math.max(low, Math.round(Math.exp(nd.theta + TREE_Z50 * nd.sigma)));
    const mid = Math.min(high, Math.max(low, Math.round(Math.exp(nd.theta))));
    return { ok: true, lowCents: low, midCents: mid, highCents: high, n: nd.n, group: full.slice(0, k).join(' > '), referenceChain: tree.referenceChain };
  }
  return { ok: false, reason: 'group_too_small' };
}

/** Brands text for catalogue rows, by canonical key. Empty when the catalogue has no `brands` column. */
export function readBrands(db: DatabaseSync | null, spellingsOf: (key: string) => string[], keys: Iterable<string>): Map<string, string> {
  const out = new Map<string, string>();
  if (!db) return out;
  const cols = (db.prepare('PRAGMA table_info(product)').all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes('brands')) return out;
  const spell = new Map<string, string>();
  for (const k of keys) for (const s of spellingsOf(k)) spell.set(s, k);
  const all = [...spell.keys()];
  for (let i = 0; i < all.length; i += 500) {
    const chunk = all.slice(i, i + 500);
    const rows = db.prepare(`SELECT code, brands FROM product WHERE code IN (${chunk.map(() => '?').join(',')})`).all(...chunk) as { code: string; brands: string | null }[];
    for (const r of rows) {
      const k = spell.get(String(r.code));
      if (k && r.brands && !out.has(k)) out.set(k, r.brands);
    }
  }
  return out;
}
