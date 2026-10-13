/**
 * Splitting a price group by attribute (price-category requirements 1.2 to 1.5;
 * docs/price-category-plan-2026-10-02.md, Part 6, "1. Categories"). Pure functions:
 * no database, no clock, no randomness that is not seeded from the data, so a
 * rebuild on the same prices makes the same tree and the same hash.
 *
 * THE RULES, in the order they act on one wide group:
 *
 * 1.2  A group with `minItems` (20) or more priced items whose middle 80% is wider
 *      than `target` (1.5x, p90 / p10) is split toward the target on log price.
 *      Every group's middle 80% carries a bootstrap interval (items resampled with
 *      replacement, seeded from the group's key); a group still over the target
 *      with 20+ items after all splits is flagged 'wide'.
 * 1.5  The screen: every attribute (SPLIT_ATTRIBUTES) is tried on the group and its
 *      narrowing recorded, in-sample and held-out, even when it helped nothing
 *      ('none_helped' is a recorded result, not silence).
 * 1.3  Each attribute is fitted on one half of the items (a seeded hash of the item
 *      code, two different salts, both directions: four folds) and judged on the
 *      other half. Attributes are ranked by narrowing on the half they were FITTED
 *      on; the first that narrows the held-out half in every fold, and by at least
 *      `minNarrowing` on average, is used. A split that widens the held-out ranges
 *      in any fold flipped under a different half and is dropped as noise. If none
 *      passes the group is kept whole.
 * 1.4  A level becomes a subgroup only with `minItems` DISTINCT ITEMS (the caller
 *      passes one price per item code, so one item in 5 stores is 1). Undersized
 *      levels merge into the parent: the items left over form a 'rest' subgroup only
 *      if they number `minItems`; otherwise they stay with the parent, and an item
 *      that lands in no subgroup is answered with the parent's whole range, flagged.
 *
 * "Narrowing" of a split on a set of items is 1 - Wc / Wp, where Wp is the middle-80%
 * width (in log price) of the items' deviations from the parent's median, and Wc the
 * same width of their deviations from the median of their subgroup. Both medians are
 * fitted on the fitted half only; a subgroup the fitted half never saw falls back to
 * the parent's median. 1 is a perfect split, 0 changes nothing, below 0 widens.
 *
 * WHAT THIS DOES NOT PROVE. The thresholds (10% narrowing, 4 folds) were set before
 * the synthetic tests were written, and the tests show the rules separate synthetic
 * noise from synthetic signal. The real catalogue has about 17 priced products, each
 * alone in its category, so nothing here has been validated on real prices.
 */

import { createHash } from 'node:crypto';

export const SPLIT_ATTRIBUTES = ['size_unit', 'pack_size', 'brand', 'nutriscore_grade', 'nova_group'] as const;
export type SplitAttribute = (typeof SPLIT_ATTRIBUTES)[number];
export type Attrs = Record<SplitAttribute, string | null>;

export const TARGET_WIDTH = 1.5;
export const BOOTSTRAP_RESAMPLES = 400;
export const MIN_NARROWING = 0.1;
export const FOLD_SALTS = 2;
export const MAX_SPLIT_DEPTH = 3;
/** A half with fewer items than this cannot judge a split. */
const MIN_HALF = 10;

export interface ProductAttrRow {
  brands: string | null;
  size_value: number | null;
  size_unit: string | null;
  nutriscore_grade: string | null;
  nova_group: number | null;
}

function clean(s: string | null | undefined): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim().toLowerCase().replace(/\s+/g, ' ');
  return t === '' ? null : t;
}

/** The attributes a catalogue row carries, normalised. A missing value is null, never a guess. */
export function attributesOf(row: ProductAttrRow | undefined): Attrs {
  const unit = clean(row?.size_unit);
  const size = row?.size_value;
  const brand = clean(row?.brands?.split(',')[0]);
  const nutri = clean(row?.nutriscore_grade);
  const nova = row?.nova_group;
  return {
    size_unit: unit,
    pack_size: unit !== null && typeof size === 'number' && Number.isFinite(size) && size > 0 ? `${unit}:${Math.round(Math.log2(size))}` : null,
    brand,
    nutriscore_grade: nutri === null || nutri === 'unknown' || nutri === 'not-applicable' ? null : nutri,
    nova_group: typeof nova === 'number' && Number.isInteger(nova) ? String(nova) : null,
  };
}

export function nearestRank(sorted: readonly number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i]!;
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

function seedOf(key: string): number {
  return createHash('sha256').update(key).digest().readUInt32LE(0);
}

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Stat {
  readonly n: number;
  readonly p10: number | null;
  readonly p50: number | null;
  readonly p90: number | null;
  readonly width: number | null;
  readonly widthLo: number | null;
  readonly widthHi: number | null;
  readonly flag: string;
}

export interface StatOptions {
  readonly minItems: number;
  readonly target?: number;
  readonly resamples?: number;
}

/**
 * Middle 80% by nearest rank, its width, a 95% bootstrap interval for that width
 * (null under 2 items: one item has no spread to interval), and the flag.
 */
export function groupStat(values: readonly number[], key: string, o: StatOptions): Stat {
  const target = o.target ?? TARGET_WIDTH;
  const n = values.length;
  if (n === 0) return { n, p10: null, p50: null, p90: null, width: null, widthLo: null, widthHi: null, flag: 'no_prices' };
  const vs = [...values].sort((a, b) => a - b);
  const p10 = nearestRank(vs, 10);
  const p50 = nearestRank(vs, 50);
  const p90 = nearestRank(vs, 90);
  const width = round4(p90 / p10);
  let widthLo: number | null = null;
  let widthHi: number | null = null;
  if (n >= 2) {
    const B = o.resamples ?? BOOTSTRAP_RESAMPLES;
    const rand = mulberry(seedOf(`bootstrap|${key}`));
    const k10 = Math.min(n - 1, Math.max(0, Math.ceil(0.1 * n) - 1));
    const k90 = Math.min(n - 1, Math.max(0, Math.ceil(0.9 * n) - 1));
    const idx = new Int32Array(n);
    const widths: number[] = [];
    for (let b = 0; b < B; b++) {
      for (let i = 0; i < n; i++) idx[i] = Math.floor(rand() * n);
      idx.sort();
      widths.push(vs[idx[k90]!]! / vs[idx[k10]!]!);
    }
    widths.sort((a, c) => a - c);
    widthLo = round4(nearestRank(widths, 2.5));
    widthHi = round4(nearestRank(widths, 97.5));
  }
  const flag = n < o.minItems ? 'thin' : width > target ? 'wide' : 'ok';
  return { n, p10, p50, p90, width, widthLo, widthHi, flag };
}

/* ------------------------------------------------------------------ tree */

export interface SplitItem {
  readonly code: string;
  /** The price as given (the layer compares prices as given). */
  readonly v: number;
  readonly attrs: Attrs;
}

export interface SplitOptions {
  readonly minItems: number;
  readonly target?: number;
  readonly resamples?: number;
  readonly maxDepth?: number;
  readonly minNarrowing?: number;
  readonly salts?: number;
  /** Test control only: judge on the fitted half (no held-out check). Never set in a real rebuild. */
  readonly unsafeNoHeldOut?: boolean;
}

export interface TreeNode {
  readonly key: string;
  readonly parentKey: string;
  readonly depth: number;
  readonly attribute: string;
  /** JSON of the level, or 'null' for the 'rest' subgroup. */
  readonly levelJson: string;
  readonly stat: Stat;
}

export interface SplitRule {
  readonly parentKey: string;
  readonly attribute: string;
  readonly levelJson: string;
  readonly childKey: string;
}

export type Verdict = 'used' | 'tried_not_used' | 'tried_not_helped' | 'not_testable' | 'none_helped' | 'not_tried';

export interface ScreenRecord {
  readonly key: string;
  readonly attribute: string;
  readonly levels: number;
  readonly items: number;
  readonly folds: number;
  readonly insample: number | null;
  readonly heldout: number | null;
  readonly minFold: number | null;
  readonly verdict: Verdict;
  readonly reason: string;
}

export interface GrowResult {
  readonly nodes: readonly TreeNode[];
  readonly rules: readonly SplitRule[];
  readonly screen: readonly ScreenRecord[];
}

export const NONE_ATTRIBUTE = '(none)';
export const REST_LEVEL_JSON = 'null';

function widthLn(resid: readonly number[]): number {
  const s = [...resid].sort((a, b) => a - b);
  return nearestRank(s, 90) - nearestRank(s, 10);
}

function median(ys: readonly number[]): number {
  return nearestRank([...ys].sort((a, b) => a - b), 50);
}

function halfOf(code: string, salt: number): number {
  return createHash('sha256').update(`${salt}|${code}`).digest()[0]! & 1;
}

interface Partition {
  readonly attribute: SplitAttribute;
  /** child id per item code; absent = answered by the parent */
  readonly childOf: ReadonlyMap<string, string>;
  /** child ids in a fixed order; 'null' is the rest subgroup */
  readonly children: readonly string[];
  readonly levels: number;
}

function partitionOn(items: readonly SplitItem[], attr: SplitAttribute, minItems: number): Partition | { why: string } {
  const counts = new Map<string, number>();
  for (const it of items) {
    const l = it.attrs[attr];
    if (l !== null) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  if (counts.size === 0) return { why: 'no item carries a value for it' };
  const eligible = [...counts].filter(([, c]) => c >= minItems).map(([l]) => l).sort();
  const childOf = new Map<string, string>();
  let rest = 0;
  for (const it of items) {
    const l = it.attrs[attr];
    if (l !== null && eligible.includes(l)) childOf.set(it.code, JSON.stringify(l));
    else rest += 1;
  }
  const children = eligible.map((l) => JSON.stringify(l));
  if (rest >= minItems) {
    children.push(REST_LEVEL_JSON);
    for (const it of items) if (!childOf.has(it.code)) childOf.set(it.code, REST_LEVEL_JSON);
  }
  if (children.length < 2) {
    return { why: `${eligible.length} level(s) with ${minItems}+ items and ${rest} left over: fewer than two subgroups of ${minItems}` };
  }
  return { attribute: attr, childOf, children, levels: children.length };
}

interface FoldScore {
  readonly inSample: number;
  readonly heldOut: number;
}

function narrowing(parentCenter: number, centers: ReadonlyMap<string, number>, childOf: ReadonlyMap<string, string>, set: readonly { code: string; y: number }[]): number {
  const rp = set.map((s) => s.y - parentCenter);
  const rc = set.map((s) => {
    const c = childOf.get(s.code);
    return s.y - (c === undefined ? parentCenter : (centers.get(c) ?? parentCenter));
  });
  const wp = widthLn(rp);
  if (wp <= 1e-9) return 0;
  return 1 - widthLn(rc) / wp;
}

function foldScores(ys: readonly { code: string; y: number }[], part: Partition, salts: number): FoldScore[] {
  const out: FoldScore[] = [];
  for (let salt = 0; salt < salts; salt++) {
    for (const fit of [0, 1]) {
      const sel = ys.filter((s) => halfOf(s.code, salt) === fit);
      const hold = ys.filter((s) => halfOf(s.code, salt) !== fit);
      if (sel.length < MIN_HALF || hold.length < MIN_HALF) continue;
      const parentCenter = median(sel.map((s) => s.y));
      const byChild = new Map<string, number[]>();
      for (const s of sel) {
        const c = part.childOf.get(s.code);
        if (c !== undefined) {
          const l = byChild.get(c);
          if (l) l.push(s.y);
          else byChild.set(c, [s.y]);
        }
      }
      const centers = new Map([...byChild].map(([c, l]) => [c, median(l)] as const));
      out.push({ inSample: narrowing(parentCenter, centers, part.childOf, sel), heldOut: narrowing(parentCenter, centers, part.childOf, hold) });
    }
  }
  return out;
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Grows the split tree under one wide group. `rootKey` names the group, `rootStat`
 * is its stat, `items` are its distinct priced items. Returns the subgroup nodes
 * (every level of the tree), the rules to route an item to one, and the screen
 * record of everything tried.
 */
export function growSplits(rootKey: string, items: readonly SplitItem[], rootStat: Stat, o: SplitOptions): GrowResult {
  const nodes: TreeNode[] = [];
  const rules: SplitRule[] = [];
  const screen: ScreenRecord[] = [];
  const target = o.target ?? TARGET_WIDTH;
  const maxDepth = o.maxDepth ?? MAX_SPLIT_DEPTH;
  const minNarrowing = o.minNarrowing ?? MIN_NARROWING;
  const salts = o.salts ?? FOLD_SALTS;
  const statOpts = { minItems: o.minItems, target, ...(o.resamples !== undefined ? { resamples: o.resamples } : {}) };

  const grow = (key: string, set: readonly SplitItem[], stat: Stat, depth: number, used: readonly SplitAttribute[]): void => {
    if (stat.flag !== 'wide') return;
    const none = (verdict: Verdict, reason: string): void => {
      screen.push({ key, attribute: NONE_ATTRIBUTE, levels: 0, items: set.length, folds: 0, insample: null, heldout: null, minFold: null, verdict, reason });
    };
    if (set.length < 2 * o.minItems) return none('not_tried', `${set.length} items: two subgroups of ${o.minItems} need ${2 * o.minItems}`);
    if (depth >= maxDepth) return none('not_tried', `depth limit ${maxDepth} reached`);

    const ys = set.map((s) => ({ code: s.code, y: Math.log(s.v) }));
    interface Tried {
      attr: SplitAttribute;
      part: Partition;
      folds: number;
      inSample: number;
      heldOut: number;
      minFold: number;
    }
    const tried: Tried[] = [];
    const attrs = SPLIT_ATTRIBUTES.filter((a) => !used.includes(a));
    for (const attr of attrs) {
      const part = partitionOn(set, attr, o.minItems);
      if ('why' in part) {
        screen.push({ key, attribute: attr, levels: 0, items: set.length, folds: 0, insample: null, heldout: null, minFold: null, verdict: 'not_testable', reason: part.why });
        continue;
      }
      const folds = foldScores(ys, part, salts);
      if (folds.length === 0) {
        screen.push({ key, attribute: attr, levels: part.levels, items: set.length, folds: 0, insample: null, heldout: null, minFold: null, verdict: 'not_testable', reason: `no fold has ${MIN_HALF}+ items on both halves` });
        continue;
      }
      tried.push({ attr, part, folds: folds.length, inSample: mean(folds.map((f) => f.inSample)), heldOut: mean(folds.map((f) => f.heldOut)), minFold: Math.min(...folds.map((f) => f.heldOut)) });
    }
    // Ranked by the half each attribute was fitted on; the held-out half only accepts or rejects.
    tried.sort((a, b) => b.inSample - a.inSample || SPLIT_ATTRIBUTES.indexOf(a.attr) - SPLIT_ATTRIBUTES.indexOf(b.attr));
    const passes = (t: Tried): boolean => (o.unsafeNoHeldOut ? t.inSample > 0 : t.minFold > 0 && t.heldOut >= minNarrowing);
    const winner = tried.find(passes);
    for (const t of tried) {
      let verdict: Verdict;
      let reason: string;
      if (t === winner) {
        verdict = 'used';
        reason = o.unsafeNoHeldOut ? 'UNSAFE control: kept on the fitted half alone' : `narrowed the held-out half in all ${t.folds} folds, by ${round4(t.heldOut)} on average`;
      } else if (passes(t)) {
        verdict = 'tried_not_used';
        reason = `also passed, but explained less on the fitted half than ${winner?.attr ?? 'the winner'}`;
      } else {
        verdict = 'tried_not_helped';
        reason = t.minFold <= 0 ? `flipped: held-out range widened or stayed in a fold (worst fold ${round4(t.minFold)})` : `held-out narrowing ${round4(t.heldOut)} is under the ${minNarrowing} bar`;
      }
      screen.push({ key, attribute: t.attr, levels: t.part.levels, items: set.length, folds: t.folds, insample: round4(t.inSample), heldout: round4(t.heldOut), minFold: round4(t.minFold), verdict, reason });
    }
    if (!winner) return none('none_helped', `none of ${attrs.length} attributes narrowed held-out ranges (${attrs.join(', ')})`);

    const childItems = new Map<string, SplitItem[]>();
    for (const it of set) {
      const c = winner.part.childOf.get(it.code);
      if (c === undefined) continue; // stays with the parent
      const l = childItems.get(c);
      if (l) l.push(it);
      else childItems.set(c, [it]);
    }
    for (const c of winner.part.children) {
      const childKey = `${key}/${winner.attr}=${c === REST_LEVEL_JSON ? '~' : c}`;
      const its = childItems.get(c) ?? [];
      const cs = groupStat(its.map((i) => i.v), childKey, statOpts);
      rules.push({ parentKey: key, attribute: winner.attr, levelJson: c, childKey });
      nodes.push({ key: childKey, parentKey: key, depth: depth + 1, attribute: winner.attr, levelJson: c, stat: cs });
      grow(childKey, its, cs, depth + 1, [...used, winner.attr]);
    }
  };

  grow(rootKey, items, rootStat, 0, []);
  // A node that was split is flagged 'split'; the others keep their own flag.
  const splitParents = new Set(rules.map((r) => r.parentKey));
  const final = nodes.map((n) => (splitParents.has(n.key) ? { ...n, stat: { ...n.stat, flag: 'split' } } : n));
  return { nodes: final, rules, screen };
}
