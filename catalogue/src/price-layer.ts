/**
 * The price layer over the placement layer, and its versions (price-category
 * requirements 1.6 and 1.7; docs/price-category-plan-2026-10-02.md, Stage 2).
 *
 *   node src/price-layer.ts --db <catalogue.db> --prices <prices.db> [--min-items 20]
 *
 * TWO LAYERS (1.6). The placement layer (placement.ts) says what an item IS: item
 * -> one placement leaf. It is stable and changes only when a placer runs. This
 * layer says which placement nodes share a price range: placement node -> price
 * group. It is rebuilt from prices alone, with no hand edits, and a rebuild makes
 * ZERO placement calls: it only reads item_placement. That is proven three ways
 * every run, and any one failing stops the rebuild and writes nothing:
 *   - the process placement-call counter is the same before and after;
 *   - a TEMP trigger refuses any write to item_placement for the rebuild's duration;
 *   - item_placement's hash and placement_log's last sequence are the same after.
 *
 * THE GROUPING RULE (bottom-up, deterministic). Each priced, placed item counts at
 * its leaf. Nodes are taken deepest first: a category node whose items (its own
 * plus those its non-group children passed up) number at least `minItems` (20,
 * requirement 1.4) becomes a group; otherwise it passes them to its parent. The
 * department node is always a group and takes what reaches it, flagged 'thin'
 * under `minItems` and 'no_prices' at 0. Every node maps to its nearest
 * ancestor-or-self group. Items in an "unplaced" node feed NO group: their prices
 * are counted as ignored (the 2026-10-09 ruling, "an unplaced item must never feed
 * a price range"). Splits by attribute and the width test (1.2 to 1.5) come later;
 * this only groups by the placement tree.
 *
 * VERSIONS (1.7). Every rebuild appends one hierarchy_version with its numbers:
 * the group statistics (count, 10th/50th/90th percentile by nearest rank, width
 * p90/p10, flag), the node -> group map, the placement sequence it was built on,
 * and a sha256 over all of it. The tables are append-only (triggers refuse update
 * and delete). An answer (`lookupGroup`) names the version it used, and
 * `recordLookup` stores it in the append-only lookup_answer table. `replayLookup`
 * re-derives a stored answer from its version: the item's placement as of that
 * version's placement sequence (placement_log), the immutable node chain, and the
 * version's stored map and numbers, never today's prices. The version's hash is
 * checked first, so an edited version row is caught even with its trigger dropped.
 *
 * FAILS LOUDLY. A price that is not a positive finite number throws. A price for a
 * code that is no catalogue item is counted and named in the log. A lookup of a
 * version or answer that does not exist throws, as does a lookup of an item that
 * had no placement at that version.
 */

import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { ensurePlacementSchema, pathOfNode, placementCallCount, placementHash, DEPARTMENT_TAG } from './placement.ts';

export const MIN_GROUP_ITEMS = 20;
export const WIDE_RATIO = 1.5;
export const GROUPING_RULE = 'bottom-up over the placement tree, min distinct priced items per group; unplaced feeds none; v1';

export class PlacementDuringRebuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlacementDuringRebuildError';
  }
}

export class VersionTamperedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VersionTamperedError';
  }
}

const DDL = `
CREATE TABLE IF NOT EXISTS hierarchy_version (
  version_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  built_at       TEXT NOT NULL,
  placement_seq  INTEGER NOT NULL,
  min_items      INTEGER NOT NULL,
  rule           TEXT NOT NULL,
  priced_items   INTEGER NOT NULL,
  unplaced_prices_ignored INTEGER NOT NULL,
  unknown_prices INTEGER NOT NULL,
  group_count    INTEGER NOT NULL,
  node_count     INTEGER NOT NULL,
  content_hash   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hierarchy_version_group (
  version_id    INTEGER NOT NULL REFERENCES hierarchy_version(version_id),
  group_node_id INTEGER NOT NULL,
  n_items       INTEGER NOT NULL,
  p10           REAL,
  p50           REAL,
  p90           REAL,
  width         REAL,
  flag          TEXT NOT NULL,
  PRIMARY KEY (version_id, group_node_id)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS hierarchy_version_map (
  version_id    INTEGER NOT NULL REFERENCES hierarchy_version(version_id),
  node_id       INTEGER NOT NULL,
  group_node_id INTEGER NOT NULL,
  PRIMARY KEY (version_id, node_id)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS lookup_answer (
  answer_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id  INTEGER NOT NULL REFERENCES hierarchy_version(version_id),
  code        TEXT NOT NULL,
  answer_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
`;

const APPEND_ONLY = ['hierarchy_version', 'hierarchy_version_group', 'hierarchy_version_map', 'lookup_answer'];

/** Installs the placement layer (if missing) and the version tables with their append-only triggers. Idempotent. */
export function ensurePriceLayerSchema(db: DatabaseSync): void {
  ensurePlacementSchema(db);
  db.exec(DDL);
  for (const t of APPEND_ONLY) {
    db.exec(`CREATE TRIGGER IF NOT EXISTS ${t}_no_update BEFORE UPDATE ON ${t} BEGIN SELECT RAISE(ABORT, '${t}: append-only, a row is never changed'); END;`);
    db.exec(`CREATE TRIGGER IF NOT EXISTS ${t}_no_delete BEFORE DELETE ON ${t} BEGIN SELECT RAISE(ABORT, '${t}: append-only, a row is never deleted'); END;`);
  }
}

/* --------------------------------------------------------------- rebuild */

export interface RebuildOptions {
  /** One price per item code (cents, or a unit price: the layer compares them as given). */
  readonly prices: ReadonlyMap<string, number>;
  /** ISO timestamp recorded on the version. */
  readonly builtAt: string;
  readonly minItems?: number;
  readonly log?: (line: string) => void;
  /** Test seam: work run inside the rebuild's guarded window. */
  readonly duringRebuildForTests?: () => void;
}

export interface RebuildResult {
  readonly versionId: number;
  readonly placementCalls: number;
  readonly placementWrites: number;
  readonly placementHashBefore: string;
  readonly placementHashAfter: string;
  readonly pricedItems: number;
  readonly unplacedPricesIgnored: number;
  readonly pricesForUnknownItems: number;
  readonly groups: number;
  readonly groupsByFlag: Readonly<Record<string, number>>;
  readonly nodes: number;
  readonly contentHash: string;
}

interface NodeRow {
  node_id: number;
  parent_id: number | null;
  depth: number;
  kind: string;
  department: string;
  tag: string;
}

interface GroupStat {
  group_node_id: number;
  n_items: number;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  width: number | null;
  flag: string;
}

interface Header {
  built_at: string;
  placement_seq: number;
  min_items: number;
  rule: string;
}

function nearestRank(sorted: readonly number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i]!;
}

function canonicalHash(h: Header, groups: readonly GroupStat[], map: readonly (readonly [number, number])[]): string {
  const g = [...groups].sort((a, b) => a.group_node_id - b.group_node_id).map((x) => [x.group_node_id, x.n_items, x.p10, x.p50, x.p90, x.width, x.flag]);
  const m = [...map].sort((a, b) => a[0] - b[0]);
  return createHash('sha256').update(JSON.stringify([h.built_at, h.placement_seq, h.min_items, h.rule, g, m])).digest('hex');
}

function lastPlacementSeq(db: DatabaseSync): number {
  return (db.prepare('SELECT coalesce(max(seq), 0) AS s FROM placement_log').get() as { s: number }).s;
}

/** Rebuilds the price layer as a new version. Reads placements, never writes them. Throws on any fault. */
export function rebuildPriceLayer(db: DatabaseSync, options: RebuildOptions): RebuildResult {
  const log = options.log ?? ((l: string) => console.log(l));
  const minItems = options.minItems ?? MIN_GROUP_ITEMS;
  if (!Number.isInteger(minItems) || minItems < 1) throw new Error(`rebuildPriceLayer: minItems must be a positive integer, got ${minItems}`);
  for (const [code, v] of options.prices) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new Error(`rebuildPriceLayer: the price of ${code} is ${v}, not a positive number; the rebuild stops`);
  }
  ensurePriceLayerSchema(db);

  const callsBefore = placementCallCount();
  const seqBefore = lastPlacementSeq(db);
  const hashBefore = placementHash(db);

  db.exec('SAVEPOINT price_layer');
  db.exec(`CREATE TEMP TRIGGER price_layer_no_place_ins BEFORE INSERT ON main.item_placement BEGIN SELECT RAISE(ABORT, 'a placement write during a price-layer rebuild is refused'); END`);
  db.exec(`CREATE TEMP TRIGGER price_layer_no_place_upd BEFORE UPDATE ON main.item_placement BEGIN SELECT RAISE(ABORT, 'a placement write during a price-layer rebuild is refused'); END`);
  db.exec(`CREATE TEMP TRIGGER price_layer_no_place_del BEFORE DELETE ON main.item_placement BEGIN SELECT RAISE(ABORT, 'a placement write during a price-layer rebuild is refused'); END`);
  let result: RebuildResult;
  try {
    const nodes = db.prepare('SELECT node_id, parent_id, depth, kind, department, tag FROM placement_node').all() as unknown as NodeRow[];
    const byId = new Map(nodes.map((n) => [n.node_id, n]));
    const leafOf = db.prepare('SELECT ip.leaf_id FROM item_placement ip WHERE ip.code = ?');
    const values = new Map<number, number[]>();
    let priced = 0;
    let unplacedIgnored = 0;
    const unknown: string[] = [];
    for (const [code, v] of options.prices) {
      const r = leafOf.get(code) as { leaf_id: number } | undefined;
      if (!r) {
        unknown.push(code);
        continue;
      }
      const node = byId.get(r.leaf_id)!;
      if (node.kind === 'unplaced') {
        unplacedIgnored += 1;
        continue;
      }
      priced += 1;
      const list = values.get(node.node_id);
      if (list) list.push(v);
      else values.set(node.node_id, [v]);
    }
    options.duringRebuildForTests?.();

    // Bottom-up: deepest first.
    const tree = nodes.filter((n) => n.kind !== 'unplaced').sort((a, b) => b.depth - a.depth || a.node_id - b.node_id);
    const carried = new Map<number, number[]>();
    const isGroup = new Set<number>();
    const groupValues = new Map<number, number[]>();
    for (const n of tree) {
      const mine = [...(values.get(n.node_id) ?? []), ...(carried.get(n.node_id) ?? [])];
      if (n.kind === 'department' || mine.length >= minItems) {
        isGroup.add(n.node_id);
        groupValues.set(n.node_id, mine);
      } else {
        if (n.parent_id === null) throw new Error(`rebuildPriceLayer: category node ${n.node_id} has no parent`);
        const up = carried.get(n.parent_id);
        if (up) up.push(...mine);
        else carried.set(n.parent_id, mine);
      }
    }
    // Top-down: nearest ancestor-or-self group.
    const groupOf = new Map<number, number>();
    for (const n of [...tree].sort((a, b) => a.depth - b.depth || a.node_id - b.node_id)) {
      if (isGroup.has(n.node_id)) groupOf.set(n.node_id, n.node_id);
      else {
        const g = n.parent_id === null ? undefined : groupOf.get(n.parent_id);
        if (g === undefined) throw new Error(`rebuildPriceLayer: node ${n.node_id} reaches no group`);
        groupOf.set(n.node_id, g);
      }
    }
    const groups: GroupStat[] = [];
    const byFlag: Record<string, number> = {};
    for (const id of [...isGroup].sort((a, b) => a - b)) {
      const vs = [...groupValues.get(id)!].sort((a, b) => a - b);
      const n = vs.length;
      const p10 = n ? nearestRank(vs, 10) : null;
      const p50 = n ? nearestRank(vs, 50) : null;
      const p90 = n ? nearestRank(vs, 90) : null;
      const width = p10 !== null && p90 !== null ? Math.round((p90 / p10) * 10000) / 10000 : null;
      const flag = n === 0 ? 'no_prices' : n < minItems ? 'thin' : width !== null && width > WIDE_RATIO ? 'wide' : 'ok';
      byFlag[flag] = (byFlag[flag] ?? 0) + 1;
      groups.push({ group_node_id: id, n_items: n, p10, p50, p90, width, flag });
    }
    const map = [...groupOf.entries()].map(([a, b]) => [a, b] as const);
    const header: Header = { built_at: options.builtAt, placement_seq: lastPlacementSeq(db), min_items: minItems, rule: GROUPING_RULE };
    const contentHash = canonicalHash(header, groups, map);

    const v = db
      .prepare(
        `INSERT INTO hierarchy_version (built_at, placement_seq, min_items, rule, priced_items, unplaced_prices_ignored, unknown_prices, group_count, node_count, content_hash)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(header.built_at, header.placement_seq, minItems, GROUPING_RULE, priced, unplacedIgnored, unknown.length, groups.length, map.length, contentHash);
    const versionId = Number(v.lastInsertRowid);
    const insG = db.prepare('INSERT INTO hierarchy_version_group (version_id, group_node_id, n_items, p10, p50, p90, width, flag) VALUES (?,?,?,?,?,?,?,?)');
    for (const g of groups) insG.run(versionId, g.group_node_id, g.n_items, g.p10, g.p50, g.p90, g.width, g.flag);
    const insM = db.prepare('INSERT INTO hierarchy_version_map (version_id, node_id, group_node_id) VALUES (?,?,?)');
    for (const [a, b] of map) insM.run(versionId, a, b);

    // The proof: nothing placed.
    const calls = placementCallCount() - callsBefore;
    const writes = lastPlacementSeq(db) - seqBefore;
    const hashAfter = placementHash(db);
    if (calls !== 0 || writes !== 0 || hashAfter !== hashBefore) {
      throw new PlacementDuringRebuildError(
        `rebuildPriceLayer: ${calls} placement calls and ${writes} placement writes happened during the rebuild (hash ${hashBefore === hashAfter ? 'same' : 'changed'}); nothing is written`,
      );
    }
    result = {
      versionId,
      placementCalls: calls,
      placementWrites: writes,
      placementHashBefore: hashBefore,
      placementHashAfter: hashAfter,
      pricedItems: priced,
      unplacedPricesIgnored: unplacedIgnored,
      pricesForUnknownItems: unknown.length,
      groups: groups.length,
      groupsByFlag: byFlag,
      nodes: map.length,
      contentHash,
    };
    if (unknown.length > 0) log(`price-layer: ${unknown.length} prices are for codes that are no catalogue item, e.g. ${unknown.slice(0, 10).join(', ')}`);
  } catch (err) {
    db.exec('ROLLBACK TO price_layer');
    dropGuards(db);
    db.exec('RELEASE price_layer');
    if (err instanceof Error && /placement write during a price-layer rebuild/.test(err.message) && !(err instanceof PlacementDuringRebuildError)) {
      throw new PlacementDuringRebuildError(`rebuildPriceLayer: ${err.message}; nothing is written`);
    }
    throw err;
  }
  dropGuards(db);
  db.exec('RELEASE price_layer');
  log(`price-layer: ${JSON.stringify({ ...result, placementHashBefore: undefined, placementHashAfter: undefined, placementHashSame: result.placementHashBefore === result.placementHashAfter })}`);
  return result;
}

function dropGuards(db: DatabaseSync): void {
  for (const t of ['ins', 'upd', 'del']) db.exec(`DROP TRIGGER IF EXISTS temp.price_layer_no_place_${t}`);
}

/* ---------------------------------------------------------------- lookup */

export interface GroupAnswer {
  readonly versionId: number;
  readonly code: string;
  readonly department: string;
  readonly placed: true;
  /** Root to leaf; empty when the item sits on the department node itself. */
  readonly path: readonly string[];
  readonly group: {
    readonly nodeId: number;
    /** The group node's tag; '@department' for a department-level group (a marker, never a category). */
    readonly tag: string;
    readonly nItems: number;
    readonly p10: number | null;
    readonly p50: number | null;
    readonly p90: number | null;
    readonly width: number | null;
    readonly flag: string;
  };
}

export interface UnplacedAnswer {
  readonly versionId: number;
  readonly code: string;
  readonly department: string;
  readonly placed: false;
}

export type LookupAnswer = GroupAnswer | UnplacedAnswer;

interface VersionRow extends Header {
  version_id: number;
  content_hash: string;
}

function versionRow(db: DatabaseSync, versionId?: number): VersionRow {
  ensurePriceLayerSchema(db);
  const r = (
    versionId === undefined
      ? db.prepare('SELECT * FROM hierarchy_version ORDER BY version_id DESC LIMIT 1').get()
      : db.prepare('SELECT * FROM hierarchy_version WHERE version_id = ?').get(versionId)
  ) as VersionRow | undefined;
  if (!r) throw new Error(versionId === undefined ? 'lookupGroup: there is no hierarchy version yet (run the price-layer rebuild)' : `lookupGroup: there is no hierarchy version ${versionId}`);
  return r;
}

/**
 * The price group of an item at a version (the latest when none is named). The
 * answer names the version it used. An unplaced item gets no group.
 */
export function lookupGroup(db: DatabaseSync, code: string, versionId?: number): LookupAnswer {
  const v = versionRow(db, versionId);
  const p = db.prepare('SELECT leaf_id FROM placement_log WHERE code = ? AND seq <= ? ORDER BY seq DESC LIMIT 1').get(code, v.placement_seq) as { leaf_id: number } | undefined;
  if (!p) throw new Error(`lookupGroup: ${code} had no placement at version ${v.version_id}`);
  const node = db.prepare('SELECT node_id, kind, department FROM placement_node WHERE node_id = ?').get(p.leaf_id) as { node_id: number; kind: string; department: string } | undefined;
  if (!node) throw new Error(`lookupGroup: placement node ${p.leaf_id} does not exist`);
  if (node.kind === 'unplaced') return { versionId: v.version_id, code, department: node.department, placed: false };
  const m = db.prepare('SELECT group_node_id FROM hierarchy_version_map WHERE version_id = ? AND node_id = ?').get(v.version_id, node.node_id) as { group_node_id: number } | undefined;
  if (!m) throw new Error(`lookupGroup: node ${node.node_id} is not in version ${v.version_id}'s map`);
  const g = db.prepare('SELECT * FROM hierarchy_version_group WHERE version_id = ? AND group_node_id = ?').get(v.version_id, m.group_node_id) as unknown as GroupStat | undefined;
  if (!g) throw new Error(`lookupGroup: group ${m.group_node_id} is missing from version ${v.version_id}`);
  const gNode = db.prepare('SELECT tag FROM placement_node WHERE node_id = ?').get(m.group_node_id) as { tag: string };
  return {
    versionId: v.version_id,
    code,
    department: node.department,
    placed: true,
    path: pathOfNode(db, node.node_id),
    group: {
      nodeId: m.group_node_id,
      tag: gNode.tag === DEPARTMENT_TAG ? DEPARTMENT_TAG : gNode.tag,
      nItems: g.n_items,
      p10: g.p10,
      p50: g.p50,
      p90: g.p90,
      width: g.width,
      flag: g.flag,
    },
  };
}

/** Stores an answer with the version it used. Returns its id. */
export function recordLookup(db: DatabaseSync, answer: LookupAnswer, recordedAt: string): number {
  ensurePriceLayerSchema(db);
  const r = db
    .prepare('INSERT INTO lookup_answer (version_id, code, answer_json, recorded_at) VALUES (?,?,?,?)')
    .run(answer.versionId, answer.code, JSON.stringify(answer), recordedAt);
  return Number(r.lastInsertRowid);
}

/** Recomputes a version's hash from its stored rows; throws VersionTamperedError on a mismatch. */
export function verifyVersion(db: DatabaseSync, versionId: number): void {
  const v = versionRow(db, versionId);
  const groups = db
    .prepare('SELECT group_node_id, n_items, p10, p50, p90, width, flag FROM hierarchy_version_group WHERE version_id = ?')
    .all(versionId) as unknown as GroupStat[];
  const map = (db.prepare('SELECT node_id, group_node_id FROM hierarchy_version_map WHERE version_id = ?').all(versionId) as unknown as { node_id: number; group_node_id: number }[]).map(
    (r) => [r.node_id, r.group_node_id] as const,
  );
  const h = canonicalHash(v, groups.map((g) => ({ ...g })), map);
  if (h !== v.content_hash) throw new VersionTamperedError(`hierarchy version ${versionId} does not match its recorded hash: a stored row was changed`);
}

export interface Replay {
  readonly answerId: number;
  readonly code: string;
  readonly versionId: number;
  readonly recorded: string;
  readonly replayed: string;
  readonly same: boolean;
}

/** Re-derives a recorded answer from the version it used, after checking that version is unedited. */
export function replayLookup(db: DatabaseSync, answerId: number): Replay {
  ensurePriceLayerSchema(db);
  const a = db.prepare('SELECT version_id, code, answer_json FROM lookup_answer WHERE answer_id = ?').get(answerId) as
    | { version_id: number; code: string; answer_json: string }
    | undefined;
  if (!a) throw new Error(`replayLookup: there is no recorded answer ${answerId}`);
  verifyVersion(db, a.version_id);
  const replayed = JSON.stringify(lookupGroup(db, a.code, a.version_id));
  return { answerId, code: a.code, versionId: a.version_id, recorded: a.answer_json, replayed, same: replayed === a.answer_json };
}

/* ------------------------------------------------------------------- CLI */

function arg(name: string, argv: readonly string[]): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** Per code, the middle regular CAD price (lower middle on an even count) from a price database's observation table. */
export function pricesFromObservations(prices: DatabaseSync): Map<string, number> {
  const per = new Map<string, number[]>();
  for (const r of prices.prepare(`SELECT code, price_cents FROM observation WHERE code IS NOT NULL AND kind = 'regular' AND currency = 'CAD'`).iterate() as Iterable<{ code: string; price_cents: unknown }>) {
    if (typeof r.price_cents !== 'number' || !Number.isInteger(r.price_cents) || r.price_cents <= 0) {
      throw new Error(`price-layer: observation for ${r.code} has price_cents ${String(r.price_cents)}, not a positive integer`);
    }
    const l = per.get(r.code);
    if (l) l.push(r.price_cents);
    else per.set(r.code, [r.price_cents]);
  }
  const out = new Map<string, number>();
  for (const [c, l] of per) {
    l.sort((a, b) => a - b);
    out.set(c, l[Math.floor((l.length - 1) / 2)]!);
  }
  return out;
}

function main(argv: readonly string[]): number {
  const dbPath = arg('--db', argv);
  const pricesPath = arg('--prices', argv);
  if (!dbPath || !pricesPath) {
    console.error('price-layer FAILED: --db <catalogue.db> and --prices <prices.db> are required');
    return 2;
  }
  const db = new DatabaseSync(dbPath);
  const prices = new DatabaseSync(pricesPath, { readOnly: true });
  try {
    const min = arg('--min-items', argv);
    const r = rebuildPriceLayer(db, { prices: pricesFromObservations(prices), builtAt: new Date().toISOString(), ...(min ? { minItems: Number(min) } : {}) });
    console.log(`price-layer: version ${r.versionId}, ${r.placementCalls} placement calls, ${r.placementWrites} placement writes, placement hash ${r.placementHashBefore === r.placementHashAfter ? 'unchanged' : 'CHANGED'}`);
    return 0;
  } catch (err) {
    console.error(`price-layer FAILED: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    prices.close();
    db.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
