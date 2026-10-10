/**
 * Placing items: the cascade that moves every catalogue item out of "unplaced"
 * (price-category plan Stage 3; requirements 2.1 and 2.3,
 * docs/price-category-requirements-2026-10-01.md; methods in
 * research/price-category-methods-2026-10-01/methods-categories-and-placement.md).
 *
 *   node src/placement-cascade.ts --db <COPY of catalogue.db> [--vectors <name-index.db>]
 *        [--no-meaning] [--no-text] [--workers 8] [--bar 0.6] [--taxonomy <path>] [--no-taxonomy]
 *        [--scans <scans.db>] [--live]
 *
 * 2.1, THE CASCADE. For each item not placed from its own stored path, the routes
 * are tried in a fixed order and the first that is sure of a CATEGORY places it:
 *   barcode    another spelling of the item's own code (12/13/14-digit, UPC-E) is a
 *              catalogue item placed from its stored path: take its category;
 *   text       the catalogue's own word search (search.ts `Catalogue.search`, the
 *              index text-match.ts reads through) finds labelled items with the
 *              same words, same department; they vote;
 *   meaning    name-meaning neighbours (name-meaning.ts, 2.2): labelled items and
 *              shopper confirmations whose names MEAN the same thing vote;
 *   claude     Claude choosing from the department's fixed list of categories. An
 *              interface only (`ClaudeListChooser`): nothing here calls Claude. With
 *              no chooser the items that reach this slot are counted and fall through;
 *   top-level  the department's own node (level 0). Every item with a department
 *              ends here at worst, so none stays unplaced.
 * The route that placed an item is its `placed_by`. Every move goes through
 * placement.ts `placeOnNode` (append-only placement_log), never a raw update.
 *
 * 2.3, LEVEL AND CONFIDENCE. A route's neighbours vote for the leaves they sit on.
 * `climb` starts at the most-voted node and walks up its one chain until the share
 * of votes inside the subtree, W(subtree) / (W(all) + CONFIDENCE_PRIOR_WEIGHT),
 * clears PLACEMENT_CONFIDENCE_BAR. Reaching the department without clearing it is
 * an abstention: the next route is tried. The placement records that node's level
 * and that share as its confidence.
 *
 * THE BAR IS NOT CALIBRATED. Calibration needs hand-checked placements (2.2's
 * sheet, placement-audit.ts), and none are marked yet. PLACEMENT_CONFIDENCE_BAR is
 * a named setting and CONFIDENCE_BAR_CALIBRATED says false until that is done: a
 * confidence here is a vote share, not a measured hit rate.
 *
 * FAILS LOUDLY (RULINGS.md, "Errors never go unnoticed"). A route that throws stops
 * the run naming the item. A vote for a node of another department, an unplaced
 * node or a node that does not exist stops it. An item still unplaced at the end
 * (a source with no department) fails the run with the count. Items that carry a
 * stored path but were never placed from it (the Stage 2 build has not run) are
 * refused before anything moves. The live catalogue file is refused unless --live.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { DatabaseSync } from 'node:sqlite';
import { upcAOf, upcEOf } from './upc.ts';
import { Catalogue } from './search.ts';
import type { Embedder } from './embed.ts';
import { countPaths, DEPARTMENT_OF_SOURCE, departmentOfSource, ensurePlacementSchema, NO_DEPARTMENT, placeOnNode } from './placement.ts';

/** 2.3's bar. Named and NOT calibrated (no hand labels exist yet). */
export const PLACEMENT_CONFIDENCE_BAR = 0.6;
export const CONFIDENCE_BAR_CALIBRATED = false;
/** One neighbour's worth of doubt added to every vote total, so three of three is not certainty. */
export const CONFIDENCE_PRIOR_WEIGHT = 1;
/** 2.1's pass bar: no more than this share of items placed only at the top level. */
export const TOP_LEVEL_SHARE_BAR = 0.05;
/** Labelled neighbours a text or meaning route reads, and the fewest it will vote on. */
export const NEIGHBOUR_K = 10;
export const MIN_NEIGHBOUR_VOTES = 3;
/** The department's own node needs no evidence beyond the item's source: its confidence. */
export const TOP_LEVEL_CONFIDENCE = 1;

export const CASCADE_ROUTES = ['barcode', 'text', 'meaning', 'claude', 'top-level'] as const;
export type CascadeRouteName = (typeof CASCADE_ROUTES)[number];
const CASCADE_PLACERS = new Set<string>(CASCADE_ROUTES);

/* ------------------------------------------------------------------ tree */

interface TreeNode {
  readonly id: number;
  readonly parent: number | null;
  readonly depth: number;
  readonly kind: string;
  readonly department: string;
  readonly tag: string;
}

/** The placement nodes, read once. Nodes never change once created, so a snapshot is exact. */
export class PlacementTree {
  readonly #nodes = new Map<number, TreeNode>();
  readonly #deptNode = new Map<string, number>();
  readonly #categories = new Map<string, TreeNode[]>();

  private constructor() {}

  static load(db: DatabaseSync): PlacementTree {
    const t = new PlacementTree();
    for (const r of db.prepare('SELECT node_id, parent_id, depth, kind, department, tag FROM placement_node').all() as unknown as {
      node_id: number;
      parent_id: number | null;
      depth: number;
      kind: string;
      department: string;
      tag: string;
    }[]) {
      const n: TreeNode = { id: r.node_id, parent: r.parent_id, depth: r.depth, kind: r.kind, department: r.department, tag: r.tag };
      t.#nodes.set(n.id, n);
      if (n.kind === 'department') t.#deptNode.set(n.department, n.id);
      if (n.kind === 'category') {
        let list = t.#categories.get(n.department);
        if (!list) t.#categories.set(n.department, (list = []));
        list.push(n);
      }
    }
    return t;
  }

  node(id: number): TreeNode {
    const n = this.#nodes.get(id);
    if (!n) throw new Error(`placement tree: no node ${id}`);
    return n;
  }

  departmentNode(department: string): number {
    const id = this.#deptNode.get(department);
    if (id === undefined) throw new Error(`placement tree: department ${department} has no department node`);
    return id;
  }

  /** The department's category nodes: the fixed list a list-chooser picks from. */
  categoriesOf(department: string): readonly TreeNode[] {
    return this.#categories.get(department) ?? [];
  }

  /** Tags from the top of the department down to the node. */
  pathOf(id: number): string[] {
    const out: string[] = [];
    for (let cur: number | null = id, guard = 0; cur !== null; guard++) {
      if (guard > 10000) throw new Error(`placement tree: chain of ${id} does not end`);
      const n = this.node(cur);
      if (n.kind === 'category') out.push(n.tag);
      cur = n.parent;
    }
    return out.reverse();
  }
}

/* ----------------------------------------------------------------- climb */

export type Votes = ReadonlyMap<number, number>;

export interface Climbed {
  readonly nodeId: number;
  readonly level: number;
  readonly confidence: number;
  /** True when no category level cleared the bar: the climb ended at the department. */
  readonly atTopLevel: boolean;
}

/** 2.3: from the most-voted node, up its chain until the subtree's share clears the bar. */
export function climb(tree: PlacementTree, votes: Votes, department: string, bar = PLACEMENT_CONFIDENCE_BAR, prior = CONFIDENCE_PRIOR_WEIGHT): Climbed {
  if (votes.size === 0) throw new Error('climb: no votes to climb from');
  let total = 0;
  const subtree = new Map<number, number>();
  let best: TreeNode | null = null;
  let bestW = -1;
  for (const [id, w] of votes) {
    if (!(typeof w === 'number' && Number.isFinite(w) && w > 0)) throw new Error(`climb: vote weight ${w} on node ${id} is not a positive number`);
    const n = tree.node(id);
    if (n.kind === 'unplaced') throw new Error(`climb: a vote for node ${id}, an unplaced node, is never a category`);
    if (n.department !== department) throw new Error(`climb: a vote for node ${id} in department ${n.department}, the item is in ${department}`);
    total += w;
    if (w > bestW || (w === bestW && best !== null && (n.depth > best.depth || (n.depth === best.depth && n.id < best.id)))) {
      best = n;
      bestW = w;
    }
    for (let cur: number | null = id, guard = 0; cur !== null; guard++) {
      if (guard > 10000) throw new Error(`climb: chain of ${id} does not end`);
      subtree.set(cur, (subtree.get(cur) ?? 0) + w);
      cur = tree.node(cur).parent;
    }
  }
  const denom = total + prior;
  for (let cur: number | null = best!.id; cur !== null; ) {
    const n = tree.node(cur);
    const conf = (subtree.get(cur) ?? 0) / denom;
    if (n.kind === 'department') return { nodeId: n.id, level: 0, confidence: Math.min(1, conf), atTopLevel: true };
    if (conf >= bar) return { nodeId: n.id, level: n.depth, confidence: conf, atTopLevel: false };
    cur = n.parent;
  }
  throw new Error(`climb: the chain of node ${best!.id} never reached its department`);
}

/* ---------------------------------------------------------------- routes */

export interface CascadeItem {
  readonly code: string;
  readonly department: string;
}

export interface PlacementRoute {
  readonly name: 'barcode' | 'text' | 'meaning';
  /**
   * The doubt added to this route's vote total (default CONFIDENCE_PRIOR_WEIGHT).
   * The barcode route sets 0: a twin code is the same trade item, not a neighbour.
   */
  readonly prior?: number;
  /** Leaf votes for the item, or null to abstain. Throwing stops the run. */
  propose(item: CascadeItem): Votes | null;
}

/** 2.1's Claude slot. Never called by this package: there is no key and no network. */
export interface ClaudeListChooser {
  choose(
    item: CascadeItem & { readonly name: string },
    list: readonly { readonly nodeId: number; readonly path: readonly string[] }[],
  ): Promise<{ readonly nodeId: number; readonly confidence: number } | null>;
}

/** Items placed from their own stored path: the only labels a route learns from. code -> leaf node. */
export function labelledLeaves(db: DatabaseSync): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of db.prepare(`SELECT code, leaf_id FROM item_placement WHERE placed_by = 'path'`).iterate() as Iterable<{ code: string; leaf_id: number }>) {
    out.set(r.code, r.leaf_id);
  }
  return out;
}

/** Every other spelling of a barcode that names the same trade item. */
export function codeTwins(code: string): string[] {
  const d = code.trim();
  if (!/^\d{6,14}$/.test(d)) return [];
  const forms = new Set<string>();
  const bare = d.replace(/^0+/, '');
  for (const len of [8, 12, 13, 14]) if (bare.length <= len) forms.add(bare.padStart(len, '0'));
  forms.add(bare);
  const twelve = bare.length <= 12 ? bare.padStart(12, '0') : null;
  if (twelve) {
    const e = upcEOf(twelve);
    if (e) forms.add(e);
  }
  if (/^[01]\d{7}$/.test(d)) {
    const a = upcAOf(d);
    if (a) {
      forms.add(a);
      forms.add(a.padStart(13, '0'));
    }
  }
  forms.delete(d);
  return [...forms];
}

/** 2.1 step 1: an exact catalogue match by barcode that carries a category. */
export function barcodeRoute(db: DatabaseSync): PlacementRoute {
  const leaves = db.prepare(`SELECT ip.leaf_id FROM item_placement ip WHERE ip.code = ? AND ip.placed_by = 'path'`);
  const nodeDept = db.prepare('SELECT department FROM placement_node WHERE node_id = ?');
  return {
    name: 'barcode',
    prior: 0,
    propose(item) {
      const votes = new Map<number, number>();
      for (const twin of codeTwins(item.code)) {
        const r = leaves.get(twin) as { leaf_id: number } | undefined;
        if (!r) continue;
        const d = (nodeDept.get(r.leaf_id) as { department: string }).department;
        if (d !== item.department) continue; // the same barcode in another department's source is another kind of record
        votes.set(r.leaf_id, (votes.get(r.leaf_id) ?? 0) + 1);
      }
      return votes.size > 0 ? votes : null;
    },
  };
}

/**
 * A route that votes with an item's labelled neighbours (text or meaning). The
 * table maps a code to its neighbours' keys, best first; `labelOf` turns a key into
 * a leaf node, or null when that neighbour is not a labelled example.
 */
export function neighbourRoute(
  name: 'text' | 'meaning',
  table: ReadonlyMap<string, readonly string[]>,
  labelOf: (key: string) => number | null,
  opts: { readonly k?: number; readonly minVotes?: number } = {},
): PlacementRoute {
  const k = opts.k ?? NEIGHBOUR_K;
  const minVotes = opts.minVotes ?? MIN_NEIGHBOUR_VOTES;
  return {
    name,
    propose(item) {
      const list = table.get(item.code);
      if (!list) return null;
      const votes = new Map<number, number>();
      let used = 0;
      for (const key of list) {
        if (used >= k) break;
        if (key === item.code || key === `p:${item.code}`) continue;
        const leaf = labelOf(key);
        if (leaf === null) continue;
        votes.set(leaf, (votes.get(leaf) ?? 0) + 1);
        used += 1;
      }
      return used >= minVotes ? votes : null;
    },
  };
}

/* ------------------------------------------------------ text neighbours */

export interface TextQuery {
  readonly code: string;
  readonly department: string;
  readonly text: string;
}

/** The sources of each department, for the word search's `sources` filter. */
export function sourcesOf(department: string): string[] {
  return Object.entries(DEPARTMENT_OF_SOURCE)
    .filter(([, d]) => d === department)
    .map(([s]) => s)
    .sort();
}

/** An embedder for a Catalogue that must never embed (the vector arm is off). */
export const NO_EMBEDDER: Embedder = {
  id: 'none',
  dim: 384,
  embedPassages() {
    throw new Error('placement text route: the vector arm was called, and it is switched off here');
  },
  embedQuery() {
    throw new Error('placement text route: the vector arm was called, and it is switched off here');
  },
};

/** How many hits the word search is asked for per item (labelled ones are kept from these). */
export const TEXT_SEARCH_LIMIT = 30;

/** Runs the word search for a batch of queries on one open catalogue. Exported for the worker. */
export async function searchBatch(db: DatabaseSync, queries: readonly TextQuery[]): Promise<[string, string[]][]> {
  const cat = new Catalogue(db, NO_EMBEDDER, null);
  const out: [string, string[]][] = [];
  for (const q of queries) {
    const res = await cat.search({ text: q.text, vectors: false, limit: TEXT_SEARCH_LIMIT, recordMiss: false, sources: sourcesOf(q.department) });
    out.push([q.code, res.candidates.map((c) => c.code).filter((c) => c !== q.code)]);
  }
  return out;
}

/**
 * 2.1 step 2's neighbours: each item's name through the catalogue's own word search
 * (search.ts), restricted to its department's sources, the item itself left out.
 * With workers > 0 the searches run in worker threads on read-only connections to
 * `dbPath` (a word search is synchronous and a hundred thousand of them in one
 * thread take an hour).
 */
export async function textNeighbours(
  db: DatabaseSync,
  queries: readonly TextQuery[],
  opts: { readonly workers?: number; readonly dbPath?: string; readonly log?: (l: string) => void } = {},
): Promise<Map<string, string[]>> {
  const workers = opts.workers ?? 0;
  const out = new Map<string, string[]>();
  const usable = queries.filter((q) => q.text.trim() !== '');
  if (workers <= 0) {
    for (const [code, list] of await searchBatch(db, usable)) out.set(code, list);
    return out;
  }
  if (!opts.dbPath) throw new Error('textNeighbours: workers need a dbPath to open read-only');
  const chunks: TextQuery[][] = Array.from({ length: workers }, () => []);
  usable.forEach((q, i) => chunks[i % workers]!.push(q));
  const url = new URL('./placement-text-worker.ts', import.meta.url);
  const results = await Promise.all(
    chunks.map(
      (chunk, i) =>
        new Promise<[string, string[]][]>((res, rej) => {
          if (chunk.length === 0) return res([]);
          const w = new Worker(url, { workerData: { dbPath: opts.dbPath, queries: chunk } });
          w.once('message', (m: { ok: boolean; result?: [string, string[]][]; error?: string }) => {
            if (m.ok) res(m.result!);
            else rej(new Error(`text worker ${i}: ${m.error}`));
          });
          w.once('error', (e) => rej(new Error(`text worker ${i}: ${e instanceof Error ? e.message : String(e)}`)));
          w.once('exit', (c) => {
            if (c !== 0) rej(new Error(`text worker ${i} exited with code ${c}`));
          });
        }),
    ),
  );
  for (const r of results) for (const [code, list] of r) out.set(code, list);
  opts.log?.(`placement-cascade: text neighbours for ${out.size} items (${queries.length - usable.length} with no text)`);
  return out;
}

/* --------------------------------------------------------------- cascade */

export interface CascadeOptions {
  readonly routes: readonly PlacementRoute[];
  readonly claude?: ClaudeListChooser | null;
  readonly bar?: number;
  readonly log?: (line: string) => void;
}

export interface TopLevelShare {
  readonly items: number;
  readonly of: number;
  readonly share: number;
  readonly meetsBar: boolean;
}

export interface CascadeSummary {
  /** Items the cascade looked at (every item not placed from its stored path). */
  readonly considered: number;
  readonly moved: number;
  readonly unchanged: number;
  /** department -> route -> items placed by it (after this run). */
  readonly byRoute: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** department -> items that reached the Claude slot with no chooser wired. */
  readonly claudeSlotReached: Readonly<Record<string, number>>;
  /** department -> items left unplaced (2.1 needs none). */
  readonly unplacedRemaining: Readonly<Record<string, number>>;
  readonly topLevelOnly: TopLevelShare & { readonly perDepartment: Readonly<Record<string, TopLevelShare>> };
  readonly bar: number;
  readonly barCalibrated: boolean;
}

interface ItemRow {
  rowid: number;
  code: string;
  source: string;
  name: string;
  category_path: string;
  leaf_id: number;
  placed_by: string;
  confidence: number | null;
}

function share(items: number, of: number): TopLevelShare {
  const s = of === 0 ? 0 : items / of;
  return { items, of, share: s, meetsBar: s <= TOP_LEVEL_SHARE_BAR };
}

/** Places every item not placed from its stored path. Throws on any fault. */
export async function runCascade(db: DatabaseSync, opts: CascadeOptions): Promise<CascadeSummary> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const bar = opts.bar ?? PLACEMENT_CONFIDENCE_BAR;
  if (!(bar > 0 && bar <= 1)) throw new Error(`runCascade: bar ${bar} is not in (0, 1]`);
  ensurePlacementSchema(db);
  const notBuilt = (db.prepare(
    `SELECT count(*) AS n FROM product p JOIN item_placement ip ON ip.code = p.code WHERE ip.placed_by = 'unplaced' AND p.category_path <> '[]'`,
  ).get() as { n: number }).n;
  if (notBuilt > 0) {
    throw new Error(`runCascade: ${notBuilt} items carry a stored path but sit unplaced: run the Stage 2 build (placement.ts) first, nothing was moved`);
  }
  const tree = PlacementTree.load(db);
  const seen = new Set<string>();
  for (const r of opts.routes) {
    if (!['barcode', 'text', 'meaning'].includes(r.name)) throw new Error(`runCascade: unknown route ${r.name}`);
    if (seen.has(r.name)) throw new Error(`runCascade: route ${r.name} given twice`);
    seen.add(r.name);
  }
  const routes = [...opts.routes].sort((a, b) => CASCADE_ROUTES.indexOf(a.name) - CASCADE_ROUTES.indexOf(b.name));

  const select = db.prepare(
    `SELECT p.rowid, p.code, p.source, p.name, p.category_path, ip.leaf_id, ip.placed_by, ip.confidence
       FROM product p JOIN item_placement ip ON ip.code = p.code
      WHERE p.rowid > ? AND ip.placed_by <> 'path' ORDER BY p.rowid LIMIT 5000`,
  );
  let considered = 0;
  let moved = 0;
  let unchanged = 0;
  const claudeSlotReached: Record<string, number> = {};
  let last = 0;
  for (;;) {
    const rows = select.all(last) as unknown as ItemRow[];
    if (rows.length === 0) break;
    last = rows[rows.length - 1]!.rowid;
    const decisions: { code: string; node: number; by: string; confidence: number }[] = [];
    for (const r of rows) {
      const department = departmentOfSource(r.source);
      if (department === NO_DEPARTMENT) continue; // counted as unplaced below; fails the run
      if (r.placed_by !== 'unplaced' && !CASCADE_PLACERS.has(r.placed_by)) continue; // another placer's (a test, a hand fix): not ours to move
      considered += 1;
      const item: CascadeItem = { code: r.code, department };
      let decided: { node: number; by: string; confidence: number } | null = null;
      for (const route of routes) {
        let votes: Votes | null;
        try {
          votes = route.propose(item);
        } catch (err) {
          throw new Error(`placement cascade: route ${route.name} failed on item ${r.code}: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (votes === null) continue;
        const c = climb(tree, votes, department, bar, route.prior ?? CONFIDENCE_PRIOR_WEIGHT);
        if (!c.atTopLevel) {
          decided = { node: c.nodeId, by: route.name, confidence: c.confidence };
          break;
        }
      }
      if (!decided) {
        if (opts.claude) {
          const list = tree.categoriesOf(department).map((n) => ({ nodeId: n.id, path: tree.pathOf(n.id) }));
          const pick = await opts.claude.choose({ ...item, name: r.name }, list);
          if (pick !== null) {
            if (!list.some((c) => c.nodeId === pick.nodeId)) throw new Error(`placement cascade: the Claude chooser picked node ${pick.nodeId} for ${r.code}, which is not on the list it was given`);
            if (pick.confidence >= bar) decided = { node: pick.nodeId, by: 'claude', confidence: pick.confidence };
          }
        } else {
          claudeSlotReached[department] = (claudeSlotReached[department] ?? 0) + 1;
        }
      }
      if (!decided) decided = { node: tree.departmentNode(department), by: 'top-level', confidence: TOP_LEVEL_CONFIDENCE };
      if (r.leaf_id === decided.node && r.placed_by === decided.by && r.confidence === decided.confidence) {
        unchanged += 1;
        continue;
      }
      decisions.push({ code: r.code, ...decided });
    }
    db.exec('SAVEPOINT cascade');
    try {
      for (const d of decisions) placeOnNode(db, d.code, d.node, d.by, d.confidence);
      db.exec('RELEASE cascade');
    } catch (err) {
      db.exec('ROLLBACK TO cascade');
      db.exec('RELEASE cascade');
      throw err;
    }
    moved += decisions.length;
  }

  const byRoute: Record<string, Record<string, number>> = {};
  for (const r of db
    .prepare(`SELECT n.department, ip.placed_by, count(*) AS n FROM item_placement ip JOIN placement_node n ON n.node_id = ip.leaf_id GROUP BY 1, 2 ORDER BY 1, 2`)
    .all() as unknown as { department: string; placed_by: string; n: number }[]) {
    if (r.placed_by === 'unplaced') continue;
    (byRoute[r.department] ??= {})[r.placed_by] = r.n;
  }
  const counts = countPaths(db);
  const perDepartment: Record<string, TopLevelShare> = {};
  let top = 0;
  let all = 0;
  for (const r of db
    .prepare(`SELECT n.department, sum(n.kind = 'department') AS top, count(*) AS n FROM item_placement ip JOIN placement_node n ON n.node_id = ip.leaf_id GROUP BY 1 ORDER BY 1`)
    .all() as unknown as { department: string; top: number; n: number }[]) {
    perDepartment[r.department] = share(r.top, r.n);
    top += r.top;
    all += r.n;
  }
  const summary: CascadeSummary = {
    considered,
    moved,
    unchanged,
    byRoute,
    claudeSlotReached,
    unplacedRemaining: counts.unplacedByDepartment,
    topLevelOnly: { ...share(top, all), perDepartment },
    bar,
    barCalibrated: CONFIDENCE_BAR_CALIBRATED,
  };
  log(`placement-cascade: considered ${considered}, moved ${moved}, unchanged ${unchanged}; bar ${bar} (UNCALIBRATED: no hand labels yet)`);
  log(`placement-cascade: placed by route per department ${JSON.stringify(byRoute)}`);
  log(`placement-cascade: reached the Claude slot with no chooser wired ${JSON.stringify(claudeSlotReached)}`);
  log(
    `placement-cascade: top level only ${top} of ${all} (${(summary.topLevelOnly.share * 100).toFixed(2)}%), bar ${TOP_LEVEL_SHARE_BAR * 100}%: ${summary.topLevelOnly.meetsBar ? 'meets' : 'FAILS'}; per department ${JSON.stringify(
      Object.fromEntries(Object.entries(perDepartment).map(([d, s]) => [d, `${s.items}/${s.of}`])),
    )}`,
  );
  log(`placement-cascade: unplaced remaining ${JSON.stringify(counts.unplacedByDepartment)}`);
  const faults: string[] = [];
  const left = Object.values(counts.unplacedByDepartment).reduce((a, b) => a + b, 0);
  if (left > 0) faults.push(`${left} item${left === 1 ? '' : 's'} still unplaced ${JSON.stringify(counts.unplacedByDepartment)}`);
  if (counts.withNoPath + counts.withTwoOrMorePaths + counts.brokenChains > 0) faults.push(`path faults ${JSON.stringify({ none: counts.withNoPath, twoOrMore: counts.withTwoOrMorePaths, broken: counts.brokenChains })}`);
  if (counts.placedWithoutLevelOrConfidence > 0) faults.push(`${counts.placedWithoutLevelOrConfidence} placements without level or confidence`);
  if (faults.length > 0) throw new Error(`2.1 FAILED: ${faults.join('; ')}`);
  return summary;
}

/* ------------------------------------------------------------ live guard */

export const LIVE_CATALOGUE_PATH = resolve(fileURLToPath(new URL('../data/catalogue.db', import.meta.url)));

/** Refuses the live catalogue file (this package's data/catalogue.db) unless `live` is set. */
export function assertNotLiveCatalogue(path: string, opts: { readonly live?: boolean } = {}): void {
  if (opts.live) return;
  if (resolve(path).toLowerCase() === LIVE_CATALOGUE_PATH.toLowerCase()) {
    throw new Error(`placement-cascade: ${path} is the live catalogue; run on a copy, or pass --live on purpose`);
  }
}

