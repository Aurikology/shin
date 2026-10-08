/**
 * The planned price tree (docs/price-category-plan-2026-10-02.md; pain points B4,
 * B5 and B7 of docs/category-safeguards-2026-10-08.md).
 *
 * NOT WIRED INTO LIVE ANSWERS. Nothing in app/ or in the verdict reads this
 * module. The accuracy gate of the plan (Part 5, rows 7.1 to 7.4, 7.8 and 1.8:
 * nothing ships above low confidence until it passes) has not been run on it, so
 * it is built and tested on fixtures only. Wiring it is a separate step that
 * waits for that gate.
 *
 * WHAT IT IS. A tree of groups over the items, and a verdict that reads it.
 *
 *   - THE PATH. Every item has exactly ONE path: the item's taxonomy chain (the
 *     stable "what it is" layer: the tags of its category path that are its leaf
 *     or an ancestor of it) and then its brand tier, `store-brand` or
 *     `name-brand`, as the last node. Store, region and season never split the
 *     tree (B4): splitting by them gives one item one path per chain and makes
 *     every group shrink as the data is cut, so they are a multiplier instead.
 *   - THE STORE MULTIPLIER. `storeAdjustment(a, b)` is chain a's price level over
 *     chain b's: the median, over the codes sold at BOTH chains, of the log ratio
 *     of the code's price at a to its price at b, exponentiated. Null when no
 *     code is sold at both. Every price is divided by its chain's multiplier to
 *     the reference chain (the chain with most rows) before it enters a group,
 *     chains linked only through a third chain are chained through it, and a
 *     chain that cannot be linked to the reference is listed in `unlinkedChains`
 *     and kept OUT of the groups, not guessed at.
 *   - PARTIAL POOLING, NOT HARD SPLITS (plan row 1.3, "shrinkage instead of hard
 *     splits"). Each node's typical log price is its priced items' mean pulled
 *     toward its parent's estimate, by the empirical-Bayes weight
 *         w = tau2 / (tau2 + sigma2 / n)
 *     where n is the node's own item count, sigma2 its own spread (itself pulled
 *     toward the parent's, so a node of one item still has a spread), and tau2 the
 *     between-sibling variance of the parent's children (DerSimonian-Laird,
 *     floored at MIN_TAU2). A small or spread-out node leans on its parent, a big
 *     tight one on itself. An item with its own prices is pooled the same way
 *     toward its node, its own noise being the within-item spread of the data, so
 *     it is its own prices that set its centre (B5: a rebuild on data that
 *     differs in 5% of the rows moves the verdict of items whose own prices did
 *     not change in under 5% of cases).
 *
 * UNITS. The items carry no sizes here, so a price is compared as given; the
 * live system would compare unit prices (range.ts).
 *
 * VERDICT. `judge` returns good, fair or bad. For an item with its own prices:
 * good at 20% under its centre or lower, bad at 20% over or higher (the default
 * lines of estimate.ts). For an item with none, whose answer stands on its group
 * alone: the stricter of that line and the group's 10th and 90th percentile
 * (B6), so a normal price is not called good or bad for being a cheap or dear
 * item of its group.
 *
 * FAULTS ARE LOUD (RULINGS.md, "Errors never go unnoticed"). A price for a code
 * that is no item, a price that is not a positive integer, a repeated item code,
 * and a verdict asked of an unknown code or of a tree with no usable prices all
 * throw `PriceTreeError`. The module has no catch block.
 */

import type { Taxonomy } from '../../catalogue/src/category-taxonomy.ts';
import { DEFAULT_THRESHOLDS, MIN_SIGMA, Z10 } from './estimate.ts';

export interface TreeItem {
  readonly code: string;
  readonly name: string;
  readonly brand: string;
  readonly storeBrand: boolean;
  /** Broad to specific, the catalogue's own order. */
  readonly categoryPath: readonly string[];
}

export interface TreePrice {
  readonly code: string;
  readonly chain: string;
  readonly cents: number;
}

export type TreeVerdict = 'good' | 'fair' | 'bad';

/** What the tree holds for one node. Logs are of cents at the reference chain's level. */
export interface NodeEstimate {
  readonly path: readonly string[];
  /** Priced items below the node. */
  readonly n: number;
  /** Their mean log price, null with none. */
  readonly raw: number | null;
  /** The pooled typical log price. */
  readonly theta: number;
  /** Weight of the node's own mean in `theta`: 1 is all its own, 0 is all its parent's. */
  readonly weight: number;
  /** The pooled spread of item log prices inside the node. */
  readonly sigma: number;
}

export interface PriceTree {
  /** Exactly one path for an item. (An array of paths to fit the planned interface.) */
  pathsOf(code: string): string[][];
  /** The item's group: its one path, joined. */
  groupOf(code: string): string;
  /** Chain a's price level over chain b's; null when no code is sold at both. */
  storeAdjustment(chainA: string, chainB: string): number | null;
  judge(code: string, shelfCents: number, chain?: string): TreeVerdict;
  /** The estimate of one node, by its path; null when the tree has no such node. */
  node(path: readonly string[]): NodeEstimate | null;
  /** The chain every price was brought to. Null when there are no prices. */
  readonly referenceChain: string | null;
  /** Chains that could not be linked to the reference and so were kept out of the groups. */
  readonly unlinkedChains: readonly string[];
  /** True when the paths were cut by a taxonomy; false when the stored paths were used as given. */
  readonly taxonomyChecked: boolean;
}

export class PriceTreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PriceTreeError';
  }
}

/* ----------------------------------------------------------- constants */

/** Floor on the between-sibling variance (log units squared): nodes may differ by at least about 5%. */
export const MIN_TAU2 = 0.05 * 0.05;
/** Pseudo-items of the parent's spread mixed into a node's own spread. */
export const SPREAD_PRIOR_ITEMS = 2;
/** The spread (log units) of a tree whose items cannot show one. */
export const FALLBACK_SIGMA = 1;
/** Floor on the within-item variance of the same item at different chains. */
export const MIN_OBS_VAR = 0.02 * 0.02;
/** Used when no item is priced at two chains, so the within-item noise cannot be measured. */
export const DEFAULT_OBS_VAR = 0.05 * 0.05;
/** Codes sold at both chains that a multiplier needs. The spec says none gives null; one is a thin estimate. */
export const MIN_OVERLAP = 1;

/* ------------------------------------------------------- pure helpers */

/** The median, the mean of the two middle values on an even count. */
export function median(xs: readonly number[]): number {
  if (xs.length === 0) throw new PriceTreeError('median of nothing');
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * The empirical-Bayes weight on a node's own mean: tau2 / (tau2 + sigma2 / n).
 * `n` is the node's own count, `sigma2` its own spread, `tau2` how far apart
 * siblings are. n = 0 gives 0 (all parent); a big n or a big tau2 pushes it to 1;
 * a big sigma2 pulls it to 0.
 */
export function shrinkWeight(n: number, sigma2: number, tau2: number): number {
  if (!(n > 0)) return 0;
  if (!(tau2 > 0)) return 0;
  if (!(sigma2 > 0)) return 1;
  return tau2 / (tau2 + sigma2 / n);
}

/** A node's mean pulled toward its parent's estimate. */
export function shrinkMean(ownMean: number, n: number, sigma2: number, tau2: number, parentTheta: number): number {
  const w = shrinkWeight(n, sigma2, tau2);
  return w * ownMean + (1 - w) * parentTheta;
}

/**
 * Between-sibling variance of child means (DerSimonian-Laird), each child given
 * as its mean, count and own spread. Floored at MIN_TAU2; fewer than two
 * children with data give the floor.
 */
export function betweenVariance(children: readonly { mean: number; n: number; sigma2: number }[]): number {
  const kids = children.filter((c) => c.n > 0 && c.sigma2 > 0);
  if (kids.length < 2) return MIN_TAU2;
  const w = kids.map((c) => c.n / c.sigma2);
  const sw = w.reduce((a, b) => a + b, 0);
  const sw2 = w.reduce((a, b) => a + b * b, 0);
  const grand = kids.reduce((a, c, i) => a + w[i]! * c.mean, 0) / sw;
  const q = kids.reduce((a, c, i) => a + w[i]! * (c.mean - grand) ** 2, 0);
  const tau2 = (q - (kids.length - 1)) / (sw - sw2 / sw);
  return Number.isFinite(tau2) ? Math.max(MIN_TAU2, tau2) : MIN_TAU2;
}

/* --------------------------------------------------------------- build */

const NAME_BRAND = 'name-brand';
const STORE_BRAND = 'store-brand';
const SEP = '\u0001';

interface Node {
  readonly path: string[];
  readonly parent: string | null;
  readonly children: string[];
  /** Every item below, by code. */
  readonly items: string[];
}

export interface BuildOptions {
  /** Cut each item's stored path to its leaf and the tags that are its ancestors. Absent: the stored path as given. */
  readonly taxonomy?: Taxonomy | null;
}

function chainOf(path: readonly string[], taxonomy: Taxonomy | null): string[] {
  if (!taxonomy || path.length === 0) return [...path];
  const leaf = path[path.length - 1]!;
  return path.filter((t, i) => i === path.length - 1 || (t !== leaf && taxonomy.isAncestor(t, leaf)));
}

export function buildPriceTree(items: readonly TreeItem[], prices: readonly TreePrice[], opts: BuildOptions = {}): PriceTree {
  const taxonomy = opts.taxonomy ?? null;

  /* ---- faults */
  const byCode = new Map<string, TreeItem>();
  for (const it of items) {
    if (byCode.has(it.code)) throw new PriceTreeError(`item code repeated: ${it.code}`);
    byCode.set(it.code, it);
  }
  for (const p of prices) {
    if (!byCode.has(p.code)) throw new PriceTreeError(`a price for a code that is no item: ${p.code}`);
    if (!Number.isInteger(p.cents) || p.cents <= 0) throw new PriceTreeError(`a price is not a positive whole number of cents: ${p.code} at ${p.chain}: ${String(p.cents)}`);
  }

  /* ---- paths: the taxonomy chain, then the brand tier. One per item. */
  const pathOf = new Map<string, string[]>();
  for (const it of items) pathOf.set(it.code, [...chainOf(it.categoryPath, taxonomy), it.storeBrand ? STORE_BRAND : NAME_BRAND]);

  /* ---- each item's price at each chain: the median of its rows there */
  const chainPrice = new Map<string, Map<string, number>>();
  {
    const rows = new Map<string, Map<string, number[]>>();
    for (const p of prices) {
      const perChain = rows.get(p.code) ?? rows.set(p.code, new Map()).get(p.code)!;
      (perChain.get(p.chain) ?? perChain.set(p.chain, []).get(p.chain)!).push(p.cents);
    }
    for (const [code, perChain] of rows) {
      const m = new Map<string, number>();
      for (const [chain, cents] of perChain) m.set(chain, median(cents));
      chainPrice.set(code, m);
    }
  }

  /* ---- the store multiplier */
  const ratioCache = new Map<string, number | null>();
  const logRatio = (a: string, b: string): number | null => {
    if (a === b) return 0;
    const key = `${a}${SEP}${b}`;
    if (ratioCache.has(key)) return ratioCache.get(key)!;
    const logs: number[] = [];
    for (const m of chainPrice.values()) {
      const pa = m.get(a);
      const pb = m.get(b);
      if (pa !== undefined && pb !== undefined) logs.push(Math.log(pa / pb));
    }
    const out = logs.length >= MIN_OVERLAP ? median(logs) : null;
    ratioCache.set(key, out);
    return out;
  };

  const rowsPerChain = new Map<string, number>();
  for (const p of prices) rowsPerChain.set(p.chain, (rowsPerChain.get(p.chain) ?? 0) + 1);
  const chains = [...rowsPerChain.keys()].sort();
  const referenceChain = chains.length === 0 ? null : chains.reduce((best, c) => (rowsPerChain.get(c)! > rowsPerChain.get(best)! ? c : best), chains[0]!);

  /** log level of each chain over the reference, linked through shared codes (breadth first from the reference). */
  const level = new Map<string, number>();
  if (referenceChain !== null) {
    level.set(referenceChain, 0);
    const queue = [referenceChain];
    while (queue.length > 0) {
      const from = queue.shift()!;
      for (const c of chains) {
        if (level.has(c)) continue;
        const r = logRatio(c, from);
        if (r === null) continue;
        level.set(c, level.get(from)! + r);
        queue.push(c);
      }
    }
  }
  const unlinkedChains = chains.filter((c) => !level.has(c));

  /* ---- each item's own level, at the reference chain */
  const adjusted = new Map<string, number[]>();
  for (const [code, m] of chainPrice) {
    const logs: number[] = [];
    for (const [chain, cents] of m) {
      const l = level.get(chain);
      if (l !== undefined) logs.push(Math.log(cents) - l);
    }
    if (logs.length > 0) adjusted.set(code, logs);
  }
  const ownLevel = new Map<string, number>();
  for (const [code, logs] of adjusted) ownLevel.set(code, median(logs));

  /** Within-item variance of the same item at different chains, pooled. */
  let obsVar = DEFAULT_OBS_VAR;
  {
    let ss = 0;
    let df = 0;
    for (const logs of adjusted.values()) {
      if (logs.length < 2) continue;
      const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
      ss += logs.reduce((a, l) => a + (l - mean) ** 2, 0);
      df += logs.length - 1;
    }
    if (df > 0) obsVar = Math.max(MIN_OBS_VAR, ss / df);
  }

  /* ---- the nodes */
  const nodes = new Map<string, Node>();
  const keyOf = (path: readonly string[]) => path.join(SEP);
  const ensure = (path: string[]): Node => {
    const key = keyOf(path);
    let n = nodes.get(key);
    if (!n) {
      const parentKey = path.length === 0 ? null : keyOf(path.slice(0, -1));
      n = { path, parent: parentKey, children: [], items: [] };
      nodes.set(key, n);
      if (parentKey !== null) ensure(path.slice(0, -1)).children.push(key);
    }
    return n;
  };
  ensure([]);
  for (const it of items) {
    const path = pathOf.get(it.code)!;
    for (let k = 0; k <= path.length; k++) ensure(path.slice(0, k)).items.push(it.code);
  }

  const estimates = new Map<string, NodeEstimate>();
  const sigma2Of = new Map<string, number>();
  const stats = (n: Node): { n: number; mean: number | null; s2: number | null } => {
    const ys = n.items.map((c) => ownLevel.get(c)).filter((y): y is number => y !== undefined);
    if (ys.length === 0) return { n: 0, mean: null, s2: null };
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    const s2 = ys.length > 1 ? ys.reduce((a, y) => a + (y - mean) ** 2, 0) / (ys.length - 1) : null;
    return { n: ys.length, mean, s2 };
  };
  const spread2 = (s: ReturnType<typeof stats>, parentSigma2: number): number => {
    const own = s.n > 1 && s.s2 !== null ? ((s.n - 1) * s.s2 + SPREAD_PRIOR_ITEMS * parentSigma2) / (s.n - 1 + SPREAD_PRIOR_ITEMS) : parentSigma2;
    return Math.max(own, MIN_SIGMA * MIN_SIGMA);
  };

  // The root: its mean is the grand mean, its spread the items' own.
  {
    const root = nodes.get('')!;
    const s = stats(root);
    const sigma2 = Math.max(s.n > 1 && s.s2 !== null ? s.s2 : FALLBACK_SIGMA * FALLBACK_SIGMA, MIN_SIGMA * MIN_SIGMA);
    sigma2Of.set('', sigma2);
    estimates.set('', { path: [], n: s.n, raw: s.mean, theta: s.mean ?? 0, weight: s.mean === null ? 0 : 1, sigma: Math.sqrt(sigma2) });
  }
  const queue = ['']; // parents whose children are not yet estimated
  while (queue.length > 0) {
    const pk = queue.shift()!;
    const parent = nodes.get(pk)!;
    const pe = estimates.get(pk)!;
    // An only child holds exactly its parent's items: it has nothing of its own to pool, so it is its parent's estimate.
    if (parent.children.length === 1) {
      const only = parent.children[0]!;
      sigma2Of.set(only, sigma2Of.get(pk)!);
      estimates.set(only, { ...pe, path: nodes.get(only)!.path });
      queue.push(only);
      continue;
    }
    const kids = parent.children.map((k) => {
      const s = stats(nodes.get(k)!);
      return { key: k, s, sigma2: spread2(s, sigma2Of.get(pk)!) };
    });
    const tau2 = betweenVariance(kids.filter((k) => k.s.mean !== null).map((k) => ({ mean: k.s.mean!, n: k.s.n, sigma2: k.sigma2 })));
    for (const k of kids) {
      const w = k.s.mean === null ? 0 : shrinkWeight(k.s.n, k.sigma2, tau2);
      sigma2Of.set(k.key, k.sigma2);
      estimates.set(k.key, {
        path: nodes.get(k.key)!.path,
        n: k.s.n,
        raw: k.s.mean,
        theta: k.s.mean === null ? pe.theta : shrinkMean(k.s.mean, k.s.n, k.sigma2, tau2, pe.theta),
        weight: w,
        sigma: Math.sqrt(k.sigma2),
      });
      queue.push(k.key);
    }
  }

  /* ---- an item's centre: its own level pooled toward its group */
  const centreOf = (code: string): { theta: number; own: boolean; sigma: number } => {
    const path = pathOf.get(code)!;
    const tier = estimates.get(keyOf(path))!;
    const y = ownLevel.get(code);
    if (y === undefined) return { theta: tier.theta, own: false, sigma: tier.sigma };
    const nChains = adjusted.get(code)!.length;
    const tau2 = Math.max(MIN_TAU2, tier.sigma * tier.sigma - obsVar);
    const w = shrinkWeight(nChains, obsVar, tau2);
    return { theta: w * y + (1 - w) * tier.theta, own: true, sigma: tier.sigma };
  };

  return {
    pathsOf(code) {
      const p = pathOf.get(code);
      if (!p) throw new PriceTreeError(`pathsOf: no such item: ${code}`);
      return [[...p]];
    },
    groupOf(code) {
      const p = pathOf.get(code);
      if (!p) throw new PriceTreeError(`groupOf: no such item: ${code}`);
      return p.join(' > ');
    },
    storeAdjustment(a, b) {
      const r = logRatio(a, b);
      return r === null ? null : Math.exp(r);
    },
    judge(code, shelfCents, chain) {
      if (!pathOf.has(code)) throw new PriceTreeError(`judge: no such item: ${code}`);
      if (referenceChain === null || estimates.get('')!.raw === null) throw new PriceTreeError('judge: the tree has no usable prices');
      if (!Number.isFinite(shelfCents) || shelfCents <= 0) throw new PriceTreeError(`judge: the shelf price is not positive: ${String(shelfCents)}`);
      const c = centreOf(code);
      const centre = Math.exp(c.theta);
      let lvl = 0;
      if (chain !== undefined) {
        const l = level.get(chain);
        if (l === undefined) throw new PriceTreeError(`judge: chain ${chain} has no price level linked to the reference chain ${referenceChain}`);
        lvl = l;
      }
      const x = shelfCents / Math.exp(lvl);
      let goodCut = centre * (1 - DEFAULT_THRESHOLDS.goodPct / 100);
      let badCut = centre * (1 + DEFAULT_THRESHOLDS.badPct / 100);
      if (!c.own) {
        goodCut = Math.min(goodCut, Math.exp(c.theta - Z10 * c.sigma));
        badCut = Math.max(badCut, Math.exp(c.theta + Z10 * c.sigma));
      }
      return x <= goodCut ? 'good' : x >= badCut ? 'bad' : 'fair';
    },
    node(path) {
      return estimates.get(keyOf(path)) ?? null;
    },
    referenceChain,
    unlinkedChains,
    taxonomyChecked: taxonomy !== null,
  };
}
