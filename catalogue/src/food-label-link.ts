/**
 * Linking the USDA flat labels into the one Open Food Facts food tree (price-category
 * plan 1.1; docs/decisions.md, "The Stage 2 parent rule"; measured 2026-10-13).
 *
 * THE PROBLEM. The food department holds two vocabularies that never met. USDA rows
 * carry one flat label ("Sport Drinks", "Chocolate"); Open Food Facts rows carry a
 * chain of en: nodes. The placement build hung every USDA label straight off the food
 * top, so an item's neighbours voted for nodes with no path to the en: tree, and the
 * text route scored 5 of 54 on the food answer key (40 of 49 misses were USDA-label
 * placements).
 *
 * THE LINK. A versioned data file (catalogue/food-label-map.json) says, for every USDA
 * label, which en: node the label hangs under. `buildPlacement` reads it (placement.ts
 * `foodLabelMap`): the label's node becomes a CHILD of the mapped node, so every USDA
 * item's one path runs through en: nodes and ends on its label. The file records which
 * method set each label, in this order:
 *
 *   1 barcode   products present in both USDA and Open Food Facts: the deepest en: node
 *               carried by at least MIN_SHARE of the label's overlapping barcodes, with
 *               at least MIN_BARCODES of them. MIN_SHARE is the parent rule's own
 *               CONTAINMENT (0.8), so "the mapped node contains the label" means what
 *               the Stage 2 parent rule means by it, not a second threshold.
 *   2 meaning   a label with too few overlapping barcodes: the en: node whose name is
 *               nearest in meaning (label-classifier.ts / embed.ts), abstaining below a
 *               similarity threshold chosen on the TRAINING half of the overlap.
 *   3 fallback  everything else: the deepest en: node that EVERY one of the label's
 *               overlapping barcodes carries (at least MIN_AGREE_BARCODES of them), and
 *               with no such evidence the food top (node null). Never an invented node.
 *
 * HELD OUT. The overlapping barcodes are split in two by a hash of the barcode
 * (`holdoutSide`): the mapping is built on one half and scored on the other, per method.
 * A mapped node is RIGHT for a held-out barcode when the barcode's own chain in the
 * food tree passes through it (the node contains the item). Containment alone is cheap
 * (the food top contains everything), so the scorer also reports how specific the nodes
 * are (mean depth, and the share of barcodes whose leaf IS the node).
 *
 * Everything here is pure: no database, no model, no file except `loadFoodLabelMap`.
 * `build-food-label-map.ts` is the command that reads the data and writes the file.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { foldTag, type Taxonomy } from './category-taxonomy.ts';

export const FOOD_LABEL_MAP_VERSION = 1;
export const FOOD_LABEL_MAP_PATH = fileURLToPath(new URL('../food-label-map.json', import.meta.url));
/** Overlapping barcodes a label needs before the barcode method may map it. */
export const MIN_BARCODES = 5;
/** The share of those barcodes that must carry the node: the parent rule's CONTAINMENT. */
export const MIN_SHARE = 0.8;
/** Overlapping barcodes the fallback needs before it trusts their common ancestor. */
export const MIN_AGREE_BARCODES = 2;

export type LabelMethod = 'barcode' | 'meaning' | 'fallback';
export const LABEL_METHODS: readonly LabelMethod[] = ['barcode', 'meaning', 'fallback'];

export interface LabelLink {
  /** The en: node the label hangs under; null is the food top. */
  readonly node: string | null;
  readonly method: LabelMethod;
  /** Overlapping barcodes the decision read (0 when none). */
  readonly barcodes: number;
  /** Share of those barcodes carrying the node (barcode and fallback), else null. */
  readonly share: number | null;
  /** Cosine similarity of label and node names (meaning only). */
  readonly similarity?: number;
  /** Why the fallback chose what it chose. */
  readonly basis?: 'common-ancestor' | 'no-evidence';
}

/* ----------------------------------------------------------- the data file */

export interface FoodLabelMap {
  readonly version: number;
  /** sha256 of the file's bytes. */
  readonly sha256: string;
  readonly labels: ReadonlyMap<string, LabelLink>;
  readonly parameters: Readonly<Record<string, unknown>>;
  /**
   * The tag a USDA label hangs under, or `undefined` when the label is not in the file.
   * `available(tag)` says whether the catalogue has that node. A mapped node the
   * catalogue lacks is NEVER created: the nearest taxonomy ancestor it has is used, and
   * with none, the food top (`null`).
   */
  parentFor(label: string, available: (tag: string) => boolean, taxonomy?: Taxonomy | null): string | null | undefined;
}

export class FoodLabelMapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FoodLabelMapError';
  }
}

const EN_TAG = /^en:\S+$/;

/** Parses and validates the file's text. Throws FoodLabelMapError naming the first fault. */
export function parseFoodLabelMap(text: string, source = 'food-label-map'): FoodLabelMap {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new FoodLabelMapError(`${source}: not valid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new FoodLabelMapError(`${source}: not a JSON object`);
  const o = raw as Record<string, unknown>;
  if (o.version !== FOOD_LABEL_MAP_VERSION) throw new FoodLabelMapError(`${source}: version ${String(o.version)}, this code reads version ${FOOD_LABEL_MAP_VERSION}`);
  if (!o.labels || typeof o.labels !== 'object' || Array.isArray(o.labels)) throw new FoodLabelMapError(`${source}: "labels" is not an object`);
  const labels = new Map<string, LabelLink>();
  for (const [key, v] of Object.entries(o.labels as Record<string, unknown>)) {
    if (key !== foldTag(key) || key === '') throw new FoodLabelMapError(`${source}: label "${key}" is not in folded form (lower case, trimmed)`);
    if (/^[a-z]{2,3}(?:[-_][a-z0-9]+)?:/.test(key)) throw new FoodLabelMapError(`${source}: label "${key}" has a language prefix; only USDA flat labels are mapped`);
    if (!v || typeof v !== 'object') throw new FoodLabelMapError(`${source}: label "${key}" has no entry`);
    const e = v as Record<string, unknown>;
    if (e.node !== null && (typeof e.node !== 'string' || !EN_TAG.test(e.node))) {
      throw new FoodLabelMapError(`${source}: label "${key}" maps to ${JSON.stringify(e.node)}, which is neither an en: node nor null (the food top)`);
    }
    if (typeof e.method !== 'string' || !(LABEL_METHODS as readonly string[]).includes(e.method)) {
      throw new FoodLabelMapError(`${source}: label "${key}" records no valid method (${JSON.stringify(e.method)})`);
    }
    if (e.method === 'barcode' && e.node === null) throw new FoodLabelMapError(`${source}: label "${key}" is set by barcode overlap but maps to the food top`);
    if (typeof e.barcodes !== 'number' || !Number.isInteger(e.barcodes) || e.barcodes < 0) throw new FoodLabelMapError(`${source}: label "${key}" has no barcode count`);
    labels.set(key, {
      node: e.node as string | null,
      method: e.method as LabelMethod,
      barcodes: e.barcodes,
      share: typeof e.share === 'number' ? e.share : null,
      ...(typeof e.similarity === 'number' ? { similarity: e.similarity } : {}),
      ...(typeof e.basis === 'string' ? { basis: e.basis as 'common-ancestor' | 'no-evidence' } : {}),
    });
  }
  if (labels.size === 0) throw new FoodLabelMapError(`${source}: no labels`);
  const parameters = o.parameters && typeof o.parameters === 'object' && !Array.isArray(o.parameters) ? (o.parameters as Record<string, unknown>) : {};
  return {
    version: FOOD_LABEL_MAP_VERSION,
    sha256: createHash('sha256').update(text).digest('hex'),
    labels,
    parameters,
    parentFor(label, available, taxonomy) {
      const link = labels.get(foldTag(label));
      if (!link) return undefined;
      if (link.node === null) return null;
      if (available(link.node)) return link.node;
      // The catalogue has no such node: the nearest ancestor it does have, else the top. Nothing is made up.
      if (taxonomy) {
        const near = [...taxonomy.ancestorsOf(link.node)]
          .filter((a) => available(a))
          .sort((a, b) => taxonomy.depthOf(b) - taxonomy.depthOf(a) || (a < b ? -1 : a > b ? 1 : 0));
        if (near.length > 0) return near[0]!;
      }
      return null;
    },
  };
}

/** Reads the data file. A missing or malformed file throws; it never reads as an empty map. */
export function loadFoodLabelMap(path: string = FOOD_LABEL_MAP_PATH): FoodLabelMap {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    throw new FoodLabelMapError(`food-label-map: cannot read ${path} (${err instanceof Error ? err.message : String(err)}); build it with "node src/build-food-label-map.ts" or pass --no-food-label-map`);
  }
  return parseFoodLabelMap(text, path);
}

/* ---------------------------------------------------------------- overlap */

/** One product present in both feeds: its USDA label and its chain in the food tree (root to leaf, en: tags). */
export interface OverlapPair {
  readonly code: string;
  readonly label: string;
  readonly chain: readonly string[];
}

/** 'train' or 'test': a stable half of the barcodes, decided by the barcode alone. */
export function holdoutSide(code: string): 'train' | 'test' {
  return createHash('sha256').update(code).digest()[0]! % 2 === 0 ? 'train' : 'test';
}

export function splitHoldout(pairs: readonly OverlapPair[]): { train: OverlapPair[]; test: OverlapPair[] } {
  const train: OverlapPair[] = [];
  const test: OverlapPair[] = [];
  for (const p of pairs) (holdoutSide(p.code) === 'train' ? train : test).push(p);
  return { train, test };
}

function byLabel(pairs: readonly OverlapPair[]): Map<string, OverlapPair[]> {
  const m = new Map<string, OverlapPair[]>();
  for (const p of pairs) {
    const k = foldTag(p.label);
    const a = m.get(k);
    if (a) a.push(p);
    else m.set(k, [p]);
  }
  return m;
}

/** Method 1. The deepest node carried by >= minShare of a label's barcodes, for labels with >= minBarcodes. */
export function linkByBarcode(
  pairs: readonly OverlapPair[],
  depthOf: (tag: string) => number,
  opts: { readonly minBarcodes?: number; readonly minShare?: number } = {},
): Map<string, LabelLink> {
  const minBarcodes = opts.minBarcodes ?? MIN_BARCODES;
  const minShare = opts.minShare ?? MIN_SHARE;
  const out = new Map<string, LabelLink>();
  for (const [label, ps] of byLabel(pairs)) {
    const withChain = ps.filter((p) => p.chain.length > 0);
    if (withChain.length < minBarcodes) continue;
    const count = new Map<string, number>();
    for (const p of withChain) for (const t of new Set(p.chain)) count.set(t, (count.get(t) ?? 0) + 1);
    const ranked = [...count.entries()]
      .filter(([, n]) => n / withChain.length >= minShare)
      .sort((a, b) => depthOf(b[0]) - depthOf(a[0]) || b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const best = ranked[0];
    if (!best) continue; // no node holds the share: the label spans several branches
    out.set(label, { node: best[0], method: 'barcode', barcodes: withChain.length, share: best[1] / withChain.length });
  }
  return out;
}

/** Method 3's evidence. The deepest node carried by EVERY barcode of a label with >= minAgree of them. */
export function linkByCommonAncestor(
  pairs: readonly OverlapPair[],
  depthOf: (tag: string) => number,
  opts: { readonly minAgree?: number } = {},
): Map<string, LabelLink> {
  const minAgree = opts.minAgree ?? MIN_AGREE_BARCODES;
  const out = new Map<string, LabelLink>();
  for (const [label, ps] of byLabel(pairs)) {
    const withChain = ps.filter((p) => p.chain.length > 0);
    if (withChain.length < minAgree) continue;
    let common = new Set<string>(withChain[0]!.chain);
    for (const p of withChain) {
      const s = new Set(p.chain);
      common = new Set([...common].filter((t) => s.has(t)));
    }
    const best = [...common].sort((a, b) => depthOf(b) - depthOf(a) || (a < b ? -1 : a > b ? 1 : 0))[0];
    if (best) out.set(label, { node: best, method: 'fallback', barcodes: withChain.length, share: 1, basis: 'common-ancestor' });
  }
  return out;
}

/* ---------------------------------------------------------------- meaning */

export interface NodeVector {
  readonly tag: string;
  readonly vec: Float32Array;
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/** The node whose name vector is nearest the label's (vectors L2-normalised, so the dot is the cosine). */
export function nearestNode(label: Float32Array, nodes: readonly NodeVector[]): { tag: string; similarity: number } | null {
  let best: { tag: string; similarity: number } | null = null;
  for (const n of nodes) {
    const s = dot(label, n.vec);
    if (best === null || s > best.similarity || (s === best.similarity && n.tag < best.tag)) best = { tag: n.tag, similarity: s };
  }
  return best;
}

/**
 * Method 2. Each label's nearest node by name meaning; below `threshold` the method abstains.
 * `climb` walks that many steps up the node's one chain first (a name match is often
 * more specific than the label), `parentOf` giving the tree's parent (null at the top).
 */
export function linkByMeaning(
  labels: ReadonlyMap<string, Float32Array>,
  nodes: readonly NodeVector[],
  threshold: number,
  opts: { readonly climb?: number; readonly parentOf?: (tag: string) => string | null } = {},
): Map<string, LabelLink> {
  const out = new Map<string, LabelLink>();
  for (const [label, vec] of labels) {
    const near = nearestNode(vec, nodes);
    if (!near || near.similarity < threshold) continue;
    let node: string | null = near.tag;
    for (let i = 0; i < (opts.climb ?? 0) && node !== null; i++) node = opts.parentOf?.(node) ?? null;
    if (node === null) continue; // climbed to the top: that is the fallback's answer, not a meaning match
    out.set(label, { node, method: 'meaning', barcodes: 0, share: null, similarity: near.similarity });
  }
  return out;
}

/* ---------------------------------------------------------------- assemble */

/**
 * The order of the three methods: a label takes the first method that maps it. Every
 * label in `allLabels` ends up with a link; the fallback with no evidence is the food top.
 */
export function assembleLinks(
  allLabels: readonly string[],
  barcode: ReadonlyMap<string, LabelLink>,
  meaning: ReadonlyMap<string, LabelLink>,
  fallback: ReadonlyMap<string, LabelLink>,
  barcodeCounts: ReadonlyMap<string, number> = new Map(),
): Map<string, LabelLink> {
  const out = new Map<string, LabelLink>();
  for (const raw of [...allLabels].map(foldTag).sort()) {
    const l =
      barcode.get(raw) ??
      meaning.get(raw) ??
      fallback.get(raw) ??
      ({ node: null, method: 'fallback', barcodes: barcodeCounts.get(raw) ?? 0, share: null, basis: 'no-evidence' } as LabelLink);
    out.set(raw, l);
  }
  return out;
}

/* ---------------------------------------------------------------- scoring */

export interface LinkScore {
  /** Held-out barcodes of labels the method mapped. */
  readonly barcodes: number;
  readonly labels: number;
  /** Barcodes whose own chain passes through the mapped node (null node: the food top contains all). */
  readonly contained: number;
  /** Barcodes whose leaf IS the mapped node. */
  readonly exact: number;
  /** Mean depth of the mapped node over those barcodes (the food top is 0). */
  readonly meanDepth: number;
}

/** Scores a mapping on held-out pairs, per method. A pair with an empty chain cannot be judged and is left out. */
export function scoreLinks(
  links: ReadonlyMap<string, LabelLink>,
  heldOut: readonly OverlapPair[],
  depthOf: (tag: string) => number,
): Record<LabelMethod, LinkScore> {
  const acc: Record<LabelMethod, { barcodes: number; labels: Set<string>; contained: number; exact: number; depth: number }> = {
    barcode: { barcodes: 0, labels: new Set(), contained: 0, exact: 0, depth: 0 },
    meaning: { barcodes: 0, labels: new Set(), contained: 0, exact: 0, depth: 0 },
    fallback: { barcodes: 0, labels: new Set(), contained: 0, exact: 0, depth: 0 },
  };
  for (const p of heldOut) {
    if (p.chain.length === 0) continue;
    const label = foldTag(p.label);
    const l = links.get(label);
    if (!l) continue;
    const a = acc[l.method];
    a.barcodes += 1;
    a.labels.add(label);
    if (l.node === null || p.chain.includes(l.node)) a.contained += 1;
    if (l.node !== null && p.chain[p.chain.length - 1] === l.node) a.exact += 1;
    a.depth += l.node === null ? 0 : depthOf(l.node);
  }
  const fin = (a: (typeof acc)[LabelMethod]): LinkScore => ({
    barcodes: a.barcodes,
    labels: a.labels.size,
    contained: a.contained,
    exact: a.exact,
    meanDepth: a.barcodes === 0 ? 0 : a.depth / a.barcodes,
  });
  return { barcode: fin(acc.barcode), meaning: fin(acc.meaning), fallback: fin(acc.fallback) };
}

/** The file's text for a set of links, labels in sorted order so the same links give the same bytes. */
export function serializeFoodLabelMap(links: ReadonlyMap<string, LabelLink>, parameters: Record<string, unknown>): string {
  const labels: Record<string, unknown> = {};
  for (const k of [...links.keys()].sort()) {
    const l = links.get(k)!;
    labels[k] = {
      node: l.node,
      method: l.method,
      barcodes: l.barcodes,
      share: l.share === null ? null : Math.round(l.share * 1000) / 1000,
      ...(l.similarity !== undefined ? { similarity: Math.round(l.similarity * 1000) / 1000 } : {}),
      ...(l.basis ? { basis: l.basis } : {}),
    };
  }
  return JSON.stringify({ version: FOOD_LABEL_MAP_VERSION, parameters, labels }, null, 1) + '\n';
}
