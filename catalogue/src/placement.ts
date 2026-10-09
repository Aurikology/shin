/**
 * The placement layer: every catalogue item has exactly ONE path through one
 * hierarchy, and the database enforces it (price-category requirement 1.1;
 * docs/decisions.md, "One path per item: unplaced items sit in an explicit
 * "unplaced" node", 2026-10-09).
 *
 *   node src/placement.ts --db <catalogue.db> [--taxonomy <path>] [--no-taxonomy]
 *
 * THE SHAPE. A node is one (department, tag). Three kinds:
 *   department  the top of a department, tag '@department', no parent, depth 0
 *   unplaced    tag '@unplaced', the department node its parent (depth 1); the one
 *               node for rows whose department is unknown ('@none') has no parent
 *   category    a category tag from the stored paths, one parent in its own department
 * An item sits on exactly one node (item_placement, one row per product code), and
 * its path is that node's chain of single parents up to the department.
 *
 * THE DEPARTMENT comes from what the row records: its `source`
 * (DEPARTMENT_OF_SOURCE). A source not listed there has no department, and its
 * rows sit in the top-level unplaced node even when they carry tags, because a
 * path cannot be hung under a department nobody named.
 *
 * THE WRITTEN PARENT RULE (one parent per node). A category node's parent is
 * decided ONCE, when the node is first created, and never changes afterwards
 * (the database refuses an update). Among the tags seen immediately before the
 * node's tag in the department's stored paths (its candidates):
 *   1. in the food department, when a taxonomy is loaded, a candidate that is a
 *      taxonomy ancestor of the tag ranks above one that is not;
 *   2. then the candidate seen immediately before it in more items;
 *   3. then the alphabetically first.
 * A candidate whose own chain already reaches the tag (choosing it would make a
 * cycle) is skipped. A tag with no usable candidate (it is first in every path it
 * appears in, or every candidate was skipped) hangs off the department node.
 * Tags are decided in order of the earliest position they hold in any path, then
 * alphabetically, so the outcome does not depend on row order.
 *
 * AN ITEM'S LEAF is the last tag of its stored path, in its own department. An
 * item with no tags stays in its department's "unplaced" node. Because a node has
 * one parent, an item whose stored path took a different route to the same tag
 * still has one path: the tree's. The count of such items is reported.
 *
 * WHAT THE DATABASE ENFORCES (ensurePlacementSchema installs the triggers):
 *   - one row per item (primary key): a second path is refused;
 *   - a NOT NULL leaf, a delete refused while the product exists, and a new product
 *     given its department's unplaced node by a trigger: zero paths cannot arise;
 *   - a leaf must exist and be in the item's own department;
 *   - a node never changes and is never deleted; a category node needs an existing
 *     parent in its department one level up (so no cycle and no second parent);
 *     nothing hangs under an unplaced node;
 *   - '@' tags are reserved: the product columns range readers read
 *     (category_path, leaf_category) refuse them, so "unplaced" can never be read
 *     there as a category;
 *   - every placement is appended to placement_log (append-only), which is what
 *     lets a past answer be replayed against the placement it used (1.7).
 *
 * "UNPLACED" IS NEVER A CATEGORY. It is a fault count Stage 3 drives down, never
 * read as placed: `assertPlacedCategory` throws on it, `categoryInputFor` gives a
 * range reader no category for it, and the price layer (price-layer.ts) feeds no
 * group from it.
 *
 * FAILS LOUDLY (RULINGS.md, "Errors never go unnoticed"). A stored path that is not
 * a JSON array of strings, or that holds a reserved '@' tag, stops the build. After
 * a build the paths are counted and any item with 0 or 2+ paths, or a chain that
 * does not reach the top, stops it. Every count is printed every run.
 *
 * PLACEMENT CALLS ARE COUNTED. Every item placed by code goes through
 * `recordPlacementCall` (a process counter and an optional hook), so the price
 * layer's rebuild can prove it placed nothing (1.6).
 */

import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_ALIASES_PATH, DEFAULT_TAXONOMY_PATH, foldTag, loadTaxonomy } from './category-taxonomy.ts';
import type { Taxonomy } from './category-taxonomy.ts';

export const UNPLACED_TAG = '@unplaced';
export const DEPARTMENT_TAG = '@department';
/** The department of a row whose source names none. */
export const NO_DEPARTMENT = '@none';

/** What each source's rows are. The department is read from the row's own `source`. */
export const DEPARTMENT_OF_SOURCE: Readonly<Record<string, string>> = {
  openfoodfacts: 'food',
  usda: 'food',
  metro: 'food',
  openbeautyfacts: 'beauty',
  openpetfoodfacts: 'pet',
  openproductsfacts: 'general',
  icecat: 'electronics',
  returnit: 'drinks',
  consignaction: 'drinks',
};

export function departmentOfSource(source: string): string {
  return DEPARTMENT_OF_SOURCE[source] ?? NO_DEPARTMENT;
}

/* ------------------------------------------------------------- the guard */

export class UnplacedCategoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnplacedCategoryError';
  }
}

/** True for the unplaced tag. */
export function isUnplacedTag(tag: string | null | undefined): boolean {
  return tag === UNPLACED_TAG;
}

/** True for any tag reserved by the placement layer ('@unplaced', '@department', ...). */
export function isReservedTag(tag: string | null | undefined): boolean {
  return typeof tag === 'string' && tag.trim().startsWith('@');
}

/**
 * The guard every range or group reader runs before treating a tag as a category:
 * returns the tag, or THROWS for "unplaced", a department marker, any '@' tag, or
 * no tag at all. An unplaced item is a fault count, never a category.
 */
export function assertPlacedCategory(tag: string | null | undefined): string {
  if (typeof tag !== 'string' || tag.trim() === '') throw new UnplacedCategoryError('no category: the item is not placed');
  if (isReservedTag(tag)) throw new UnplacedCategoryError(`"${tag}" is a placement-layer marker, never a category (an unplaced item feeds no range)`);
  return tag;
}

/* ------------------------------------------------------- placement calls */

let calls = 0;
let hook: ((code: string) => void) | null = null;

/** How many items code has placed in this process. */
export function placementCallCount(): number {
  return calls;
}

/** A function run on every placement call (a test can make it throw). null removes it. */
export function setPlacementCallHook(fn: ((code: string) => void) | null): void {
  hook = fn;
}

function recordPlacementCall(code: string): void {
  calls += 1;
  if (hook) hook(code);
}

/* ---------------------------------------------------------------- schema */

const DDL = `
CREATE TABLE IF NOT EXISTS placement_department_source (
  source     TEXT PRIMARY KEY,
  department TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS placement_node (
  node_id    INTEGER PRIMARY KEY,
  department TEXT NOT NULL,
  tag        TEXT NOT NULL,
  parent_id  INTEGER REFERENCES placement_node(node_id),
  depth      INTEGER NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('department', 'unplaced', 'category')),
  UNIQUE (department, tag)
) STRICT;

CREATE TABLE IF NOT EXISTS item_placement (
  code      TEXT PRIMARY KEY,
  leaf_id   INTEGER NOT NULL REFERENCES placement_node(node_id),
  placed_by TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS item_placement_leaf ON item_placement(leaf_id);

CREATE TABLE IF NOT EXISTS placement_log (
  seq       INTEGER PRIMARY KEY AUTOINCREMENT,
  code      TEXT NOT NULL,
  leaf_id   INTEGER NOT NULL,
  placed_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS placement_log_code ON placement_log(code, seq);

CREATE TRIGGER IF NOT EXISTS placement_node_insert BEFORE INSERT ON placement_node
BEGIN
  SELECT RAISE(ABORT, 'placement_node: a department node has no parent, depth 0 and the tag @department')
   WHERE NEW.kind = 'department' AND (NEW.parent_id IS NOT NULL OR NEW.depth <> 0 OR NEW.tag <> '@department' OR NEW.department = '@none');
  SELECT RAISE(ABORT, 'placement_node: an unplaced node has the tag @unplaced and hangs off its own department node (with no department, off nothing)')
   WHERE NEW.kind = 'unplaced' AND (NEW.tag <> '@unplaced' OR NOT (
         (NEW.department = '@none' AND NEW.parent_id IS NULL AND NEW.depth = 0)
      OR (NEW.department <> '@none' AND NEW.depth = 1 AND EXISTS (
            SELECT 1 FROM placement_node p WHERE p.node_id = NEW.parent_id AND p.kind = 'department' AND p.department = NEW.department))));
  SELECT RAISE(ABORT, 'placement_node: tags beginning with @ are reserved and are never a category')
   WHERE NEW.kind = 'category' AND substr(trim(NEW.tag), 1, 1) = '@';
  SELECT RAISE(ABORT, 'placement_node: nothing hangs under an unplaced node')
   WHERE NEW.kind = 'category' AND EXISTS (SELECT 1 FROM placement_node p WHERE p.node_id = NEW.parent_id AND p.kind = 'unplaced');
  SELECT RAISE(ABORT, 'placement_node: a category node needs one existing parent in its own department, one level up')
   WHERE NEW.kind = 'category' AND NOT EXISTS (
     SELECT 1 FROM placement_node p WHERE p.node_id = NEW.parent_id AND p.department = NEW.department AND p.depth = NEW.depth - 1);
END;

CREATE TRIGGER IF NOT EXISTS placement_node_no_update BEFORE UPDATE ON placement_node
BEGIN
  SELECT RAISE(ABORT, 'placement_node: a node never changes once created (one parent, decided once)');
END;
CREATE TRIGGER IF NOT EXISTS placement_node_no_delete BEFORE DELETE ON placement_node
BEGIN
  SELECT RAISE(ABORT, 'placement_node: a node is never deleted');
END;

CREATE TRIGGER IF NOT EXISTS item_placement_insert BEFORE INSERT ON item_placement
BEGIN
  SELECT RAISE(ABORT, 'item_placement: the leaf node does not exist')
   WHERE NEW.leaf_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM placement_node WHERE node_id = NEW.leaf_id);
  SELECT RAISE(ABORT, 'item_placement: no such product')
   WHERE NOT EXISTS (SELECT 1 FROM product WHERE code = NEW.code);
  SELECT RAISE(ABORT, 'item_placement: the leaf is not in the item''s own department')
   WHERE NEW.leaf_id IS NOT NULL
     AND (SELECT department FROM placement_node WHERE node_id = NEW.leaf_id) IS NOT
         COALESCE((SELECT d.department FROM product p JOIN placement_department_source d ON d.source = p.source WHERE p.code = NEW.code), '@none');
END;

CREATE TRIGGER IF NOT EXISTS item_placement_update BEFORE UPDATE ON item_placement
BEGIN
  SELECT RAISE(ABORT, 'item_placement: the leaf node does not exist')
   WHERE NEW.leaf_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM placement_node WHERE node_id = NEW.leaf_id);
  SELECT RAISE(ABORT, 'item_placement: a code changes only when its product''s code changed')
   WHERE NEW.code IS NOT OLD.code
     AND (NOT EXISTS (SELECT 1 FROM product WHERE code = NEW.code) OR EXISTS (SELECT 1 FROM product WHERE code = OLD.code));
  SELECT RAISE(ABORT, 'item_placement: the leaf is not in the item''s own department')
   WHERE NEW.leaf_id IS NOT NULL
     AND (SELECT department FROM placement_node WHERE node_id = NEW.leaf_id) IS NOT
         COALESCE((SELECT d.department FROM product p JOIN placement_department_source d ON d.source = p.source WHERE p.code = NEW.code), '@none');
END;

CREATE TRIGGER IF NOT EXISTS item_placement_no_delete BEFORE DELETE ON item_placement
BEGIN
  SELECT RAISE(ABORT, 'item_placement: an item keeps exactly one path while its product exists')
   WHERE EXISTS (SELECT 1 FROM product WHERE code = OLD.code);
END;

CREATE TRIGGER IF NOT EXISTS item_placement_log_insert AFTER INSERT ON item_placement
BEGIN
  INSERT INTO placement_log (code, leaf_id, placed_by) VALUES (NEW.code, NEW.leaf_id, NEW.placed_by);
END;
CREATE TRIGGER IF NOT EXISTS item_placement_log_update AFTER UPDATE ON item_placement
WHEN OLD.leaf_id IS NOT NEW.leaf_id OR OLD.placed_by IS NOT NEW.placed_by OR OLD.code IS NOT NEW.code
BEGIN
  INSERT INTO placement_log (code, leaf_id, placed_by) VALUES (NEW.code, NEW.leaf_id, NEW.placed_by);
END;

CREATE TRIGGER IF NOT EXISTS placement_log_no_update BEFORE UPDATE ON placement_log
BEGIN
  SELECT RAISE(ABORT, 'placement_log: append-only, a row is never changed');
END;
CREATE TRIGGER IF NOT EXISTS placement_log_no_delete BEFORE DELETE ON placement_log
BEGIN
  SELECT RAISE(ABORT, 'placement_log: append-only, a row is never deleted');
END;

CREATE TRIGGER IF NOT EXISTS product_gets_one_path AFTER INSERT ON product
BEGIN
  INSERT OR IGNORE INTO item_placement (code, leaf_id, placed_by)
    SELECT NEW.code, n.node_id, 'unplaced' FROM placement_node n
     WHERE n.kind = 'unplaced'
       AND n.department = COALESCE((SELECT department FROM placement_department_source WHERE source = NEW.source), '@none');
  SELECT RAISE(ABORT, 'product: the new item could not be given a path (its department has no unplaced node)')
   WHERE NOT EXISTS (SELECT 1 FROM item_placement WHERE code = NEW.code);
END;

CREATE TRIGGER IF NOT EXISTS product_path_follows_code AFTER UPDATE OF code ON product
WHEN OLD.code IS NOT NEW.code
BEGIN
  UPDATE item_placement SET code = NEW.code WHERE code = OLD.code;
END;

CREATE TRIGGER IF NOT EXISTS product_department_fixed BEFORE UPDATE OF source ON product
WHEN COALESCE((SELECT department FROM placement_department_source WHERE source = OLD.source), '@none')
  IS NOT COALESCE((SELECT department FROM placement_department_source WHERE source = NEW.source), '@none')
BEGIN
  SELECT RAISE(ABORT, 'product: a source change that moves the item to another department is refused (re-place it explicitly)');
END;

CREATE TRIGGER IF NOT EXISTS product_path_goes_with_it AFTER DELETE ON product
BEGIN
  DELETE FROM item_placement WHERE code = OLD.code;
END;

CREATE TRIGGER IF NOT EXISTS product_no_reserved_tag_insert BEFORE INSERT ON product
WHEN NEW.leaf_category LIKE '@%' OR NEW.category_path LIKE '%"@%'
BEGIN
  SELECT RAISE(ABORT, 'product: tags beginning with @ are reserved for the placement layer and are never a category');
END;
CREATE TRIGGER IF NOT EXISTS product_no_reserved_tag_update BEFORE UPDATE OF category_path, leaf_category ON product
WHEN NEW.leaf_category LIKE '@%' OR NEW.category_path LIKE '%"@%'
BEGIN
  SELECT RAISE(ABORT, 'product: tags beginning with @ are reserved for the placement layer and are never a category');
END;
`;

function tx<T>(db: DatabaseSync, work: () => T): T {
  db.exec('SAVEPOINT placement');
  try {
    const out = work();
    db.exec('RELEASE placement');
    return out;
  } catch (err) {
    try {
      db.exec('ROLLBACK TO placement');
      db.exec('RELEASE placement');
    } catch (rollbackErr) {
      console.error(`placement: ROLLBACK also failed: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`);
    }
    throw err;
  }
}

function nodeId(db: DatabaseSync, department: string, tag: string): number | null {
  const r = db.prepare('SELECT node_id FROM placement_node WHERE department = ? AND tag = ?').get(department, tag) as { node_id: number } | undefined;
  return r ? r.node_id : null;
}

export interface EnsureResult {
  /** Products that had no path and were given their department's unplaced node. */
  readonly backfilled: number;
}

/**
 * Installs the placement layer (tables, triggers, department and unplaced nodes)
 * and gives every product without a path its department's unplaced node.
 * Idempotent. A recorded source whose department differs from DEPARTMENT_OF_SOURCE
 * throws: departments do not move silently.
 */
export function ensurePlacementSchema(db: DatabaseSync): EnsureResult {
  return tx(db, () => {
    db.exec(DDL);
    const getSrc = db.prepare('SELECT department FROM placement_department_source WHERE source = ?');
    const putSrc = db.prepare('INSERT INTO placement_department_source (source, department) VALUES (?, ?)');
    for (const [source, department] of Object.entries(DEPARTMENT_OF_SOURCE)) {
      const have = getSrc.get(source) as { department: string } | undefined;
      if (!have) putSrc.run(source, department);
      else if (have.department !== department) {
        throw new Error(`placement: source ${source} is recorded in department ${have.department}, the code says ${department}; departments do not move silently`);
      }
    }
    const addNode = db.prepare('INSERT INTO placement_node (department, tag, parent_id, depth, kind) VALUES (?,?,?,?,?)');
    for (const department of [...new Set(Object.values(DEPARTMENT_OF_SOURCE))].sort()) {
      let dep = nodeId(db, department, DEPARTMENT_TAG);
      if (dep === null) dep = Number(addNode.run(department, DEPARTMENT_TAG, null, 0, 'department').lastInsertRowid);
      if (nodeId(db, department, UNPLACED_TAG) === null) addNode.run(department, UNPLACED_TAG, dep, 1, 'unplaced');
    }
    if (nodeId(db, NO_DEPARTMENT, UNPLACED_TAG) === null) addNode.run(NO_DEPARTMENT, UNPLACED_TAG, null, 0, 'unplaced');
    const r = db
      .prepare(
        `INSERT INTO item_placement (code, leaf_id, placed_by)
         SELECT p.code, n.node_id, 'unplaced' FROM product p
           JOIN placement_node n ON n.kind = 'unplaced'
            AND n.department = COALESCE((SELECT department FROM placement_department_source WHERE source = p.source), '@none')
          WHERE NOT EXISTS (SELECT 1 FROM item_placement ip WHERE ip.code = p.code)`,
      )
      .run();
    return { backfilled: Number(r.changes) };
  });
}

/* ---------------------------------------------------------------- counts */

export interface PathCounts {
  readonly products: number;
  readonly withExactlyOnePath: number;
  readonly withNoPath: number;
  readonly withTwoOrMorePaths: number;
  /** Placements whose leaf chain does not reach a department node (or the top-level unplaced node). */
  readonly brokenChains: number;
  /** Placement rows with no product. */
  readonly orphanPlacements: number;
  /** Items in an unplaced node, by department ('@none' for the top-level node). */
  readonly unplacedByDepartment: Readonly<Record<string, number>>;
  /** Items placed (not unplaced), by department. */
  readonly placedByDepartment: Readonly<Record<string, number>>;
  readonly topLevelUnplaced: number;
  /** Items placed on a department node itself (top level only). */
  readonly placedAtTopOnly: number;
}

/** Counts the paths per item from the database itself. Read only. */
export function countPaths(db: DatabaseSync): PathCounts {
  const one = <T>(sql: string): T => db.prepare(sql).get() as T;
  const products = one<{ n: number }>('SELECT count(*) AS n FROM product').n;
  const withNoPath = one<{ n: number }>('SELECT count(*) AS n FROM product p WHERE NOT EXISTS (SELECT 1 FROM item_placement ip WHERE ip.code = p.code)').n;
  const withTwoOrMorePaths = one<{ n: number }>('SELECT count(*) AS n FROM (SELECT code FROM item_placement GROUP BY code HAVING count(*) > 1)').n;
  const orphanPlacements = one<{ n: number }>('SELECT count(*) AS n FROM item_placement ip WHERE NOT EXISTS (SELECT 1 FROM product p WHERE p.code = ip.code)').n;
  // A chain is good when walking parents reaches a node with no parent that is a department or the top-level unplaced node.
  const brokenChains = one<{ n: number }>(
    `WITH RECURSIVE up(start, node, parent, kind, department, steps) AS (
       SELECT n.node_id, n.node_id, n.parent_id, n.kind, n.department, 0 FROM placement_node n
        WHERE n.node_id IN (SELECT DISTINCT leaf_id FROM item_placement)
       UNION ALL
       SELECT up.start, p.node_id, p.parent_id, p.kind, p.department, up.steps + 1
         FROM up JOIN placement_node p ON p.node_id = up.parent WHERE up.steps < 1000
     ),
     good AS (SELECT DISTINCT start FROM up WHERE parent IS NULL AND (kind = 'department' OR (kind = 'unplaced' AND department = '@none')))
     SELECT count(*) AS n FROM item_placement ip WHERE ip.leaf_id NOT IN (SELECT start FROM good)`,
  ).n;
  const unplacedByDepartment: Record<string, number> = {};
  const placedByDepartment: Record<string, number> = {};
  let placedAtTopOnly = 0;
  for (const r of db
    .prepare(
      `SELECT n.department, n.kind, count(*) AS n FROM item_placement ip JOIN placement_node n ON n.node_id = ip.leaf_id
        GROUP BY n.department, n.kind ORDER BY n.department`,
    )
    .all() as unknown as { department: string; kind: string; n: number }[]) {
    if (r.kind === 'unplaced') unplacedByDepartment[r.department] = r.n;
    else {
      placedByDepartment[r.department] = (placedByDepartment[r.department] ?? 0) + r.n;
      if (r.kind === 'department') placedAtTopOnly += r.n;
    }
  }
  return {
    products,
    withExactlyOnePath: products - withNoPath - withTwoOrMorePaths,
    withNoPath,
    withTwoOrMorePaths,
    brokenChains,
    orphanPlacements,
    unplacedByDepartment,
    placedByDepartment,
    topLevelUnplaced: unplacedByDepartment[NO_DEPARTMENT] ?? 0,
    placedAtTopOnly,
  };
}

/* ----------------------------------------------------------------- build */

export interface BuildPlacementOptions {
  /** Ranks a taxonomy ancestor first among a food tag's candidate parents (rule step 1). */
  readonly taxonomy?: Taxonomy | null;
  readonly log?: (line: string) => void;
  readonly pageSize?: number;
}

export interface BuildPlacementResult {
  readonly nodesCreated: number;
  /** Items moved to a new leaf by this build (each one a counted placement call). */
  readonly placed: number;
  readonly unchanged: number;
  /** Items placed by another placer (Stage 3), left where they are. */
  readonly keptOtherPlacer: number;
  /** Items whose stored path reaches their leaf by a different route than the tree's one path. */
  readonly storedRouteDiffers: number;
  /** Items with tags whose source names no department: in the top-level unplaced node. */
  readonly taggedWithNoDepartment: number;
  readonly taxonomyUsed: boolean;
  readonly counts: PathCounts;
}

interface ItemRow {
  rowid: number;
  code: string;
  source: string;
  category_path: string;
}

function parseStoredPath(code: string, text: string): string[] {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (err) {
    throw new Error(`placement: category_path of ${code} is not valid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!Array.isArray(v) || !v.every((t) => typeof t === 'string')) throw new Error(`placement: category_path of ${code} is not a JSON array of strings`);
  const tags: string[] = [];
  for (const raw of v as string[]) {
    const t = foldTag(raw);
    if (t === '') continue;
    if (isReservedTag(t)) throw new Error(`placement: category_path of ${code} holds "${raw}", a reserved "@" tag; the build stops`);
    if (tags[tags.length - 1] !== t) tags.push(t);
  }
  return tags;
}

function* items(db: DatabaseSync, page: number): Generator<ItemRow> {
  const stmt = db.prepare('SELECT rowid, code, source, category_path FROM product WHERE rowid > ? ORDER BY rowid LIMIT ?');
  let last = 0;
  for (;;) {
    const rows = stmt.all(last, page) as unknown as ItemRow[];
    if (rows.length === 0) return;
    yield* rows;
    last = rows[rows.length - 1]!.rowid;
  }
}

/**
 * Builds the placement layer from the stored category paths: creates the nodes
 * the written rule gives (existing nodes are never changed) and places every
 * item on its leaf. Installs the schema first. Throws on any fault.
 */
export function buildPlacement(db: DatabaseSync, options: BuildPlacementOptions = {}): BuildPlacementResult {
  const log = options.log ?? ((l: string) => console.log(l));
  const tax = options.taxonomy ?? null;
  const page = options.pageSize ?? 50000;
  ensurePlacementSchema(db);

  // Pass 1: for each department, each tag's earliest position and its predecessor counts.
  interface TagInfo { minPos: number; before: Map<string, number> }
  const byDept = new Map<string, Map<string, TagInfo>>();
  let taggedWithNoDepartment = 0;
  for (const r of items(db, page)) {
    const dept = departmentOfSource(r.source);
    const tags = parseStoredPath(r.code, r.category_path);
    if (tags.length === 0) continue;
    if (dept === NO_DEPARTMENT) {
      taggedWithNoDepartment += 1;
      continue;
    }
    let m = byDept.get(dept);
    if (!m) byDept.set(dept, (m = new Map()));
    tags.forEach((t, i) => {
      let info = m!.get(t);
      if (!info) m!.set(t, (info = { minPos: i, before: new Map() }));
      info.minPos = Math.min(info.minPos, i);
      if (i > 0) info.before.set(tags[i - 1]!, (info.before.get(tags[i - 1]!) ?? 0) + 1);
    });
  }

  // Decide parents (rule), with existing nodes fixed.
  const existing = new Map<string, { id: number; parentTag: string | null; depth: number }>();
  for (const n of db
    .prepare(`SELECT n.node_id, n.department, n.tag, n.depth, p.tag AS ptag FROM placement_node n LEFT JOIN placement_node p ON p.node_id = n.parent_id WHERE n.kind = 'category'`)
    .all() as unknown as { node_id: number; department: string; tag: string; depth: number; ptag: string | null }[]) {
    existing.set(`${n.department}\u0000${n.tag}`, { id: n.node_id, parentTag: n.ptag === DEPARTMENT_TAG ? null : n.ptag, depth: n.depth });
  }
  let nodesCreated = 0;
  const addNode = db.prepare('INSERT INTO placement_node (department, tag, parent_id, depth, kind) VALUES (?,?,?,?,?)');

  tx(db, () => {
    for (const [dept, tags] of [...byDept.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const parent = new Map<string, string | null>(); // tag -> parent tag (null = department)
      for (const [k, v] of existing) {
        const [d, t] = k.split('\u0000') as [string, string];
        if (d === dept) parent.set(t, v.parentTag);
      }
      const reaches = (from: string, target: string): boolean => {
        let cur: string | null | undefined = from;
        for (let guard = 0; cur != null && guard < 100000; guard++) {
          if (cur === target) return true;
          cur = parent.get(cur);
        }
        return false;
      };
      const order = [...tags.entries()].filter(([t]) => !parent.has(t)).sort((a, b) => a[1].minPos - b[1].minPos || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      for (const [tag, info] of order) {
        const cands = [...info.before.entries()].sort((a, b) => {
          if (tax && dept === 'food') {
            const d = Number(tax.isAncestor(b[0], tag)) - Number(tax.isAncestor(a[0], tag));
            if (d !== 0) return d;
          }
          return b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
        });
        let chosen: string | null = null;
        for (const [c] of cands) {
          if (c === tag || reaches(c, tag)) continue;
          chosen = c;
          break;
        }
        parent.set(tag, chosen);
      }
      // Insert new nodes parents first.
      const depId = nodeId(db, dept, DEPARTMENT_TAG);
      if (depId === null) throw new Error(`placement: department ${dept} has no department node`);
      const ids = new Map<string, { id: number; depth: number }>();
      for (const [k, v] of existing) {
        const [d, t] = k.split('\u0000') as [string, string];
        if (d === dept) ids.set(t, { id: v.id, depth: v.depth });
      }
      const create = (tag: string, trail: Set<string>): { id: number; depth: number } => {
        const have = ids.get(tag);
        if (have) return have;
        if (trail.has(tag)) throw new Error(`placement: a cycle at ${dept} ${tag}; the rule should have prevented it`);
        trail.add(tag);
        const p = parent.get(tag) ?? null;
        const up = p === null ? { id: depId, depth: 0 } : create(p, trail);
        const id = Number(addNode.run(dept, tag, up.id, up.depth + 1, 'category').lastInsertRowid);
        nodesCreated += 1;
        const made = { id, depth: up.depth + 1 };
        ids.set(tag, made);
        return made;
      };
      for (const [tag] of order) create(tag, new Set());
    }
  });

  // Pass 2: place every item on its leaf.
  const leafOf = db.prepare('SELECT node_id FROM placement_node WHERE department = ? AND tag = ?');
  const current = db.prepare('SELECT leaf_id, placed_by FROM item_placement WHERE code = ?');
  const move = db.prepare('UPDATE item_placement SET leaf_id = ?, placed_by = ? WHERE code = ?');
  const unplacedId = new Map<string, number>();
  for (const r of db.prepare(`SELECT department, node_id FROM placement_node WHERE kind = 'unplaced'`).all() as unknown as { department: string; node_id: number }[]) {
    unplacedId.set(r.department, r.node_id);
  }
  // The tree's one chain of a node, for the route-differs count.
  const chainMemo = new Map<number, string[]>();
  const nodeRow = db.prepare('SELECT tag, parent_id, kind FROM placement_node WHERE node_id = ?');
  const chainOf = (id: number): string[] => {
    const hit = chainMemo.get(id);
    if (hit) return hit;
    const n = nodeRow.get(id) as { tag: string; parent_id: number | null; kind: string };
    const out = n.kind === 'category' && n.parent_id !== null ? [...chainOf(n.parent_id), n.tag] : [];
    chainMemo.set(id, out);
    return out;
  };
  let placed = 0;
  let unchanged = 0;
  let keptOtherPlacer = 0;
  let storedRouteDiffers = 0;
  let batch: ItemRow[] = [];
  const flush = () => {
    if (batch.length === 0) return;
    const rows = batch;
    batch = [];
    tx(db, () => {
      for (const r of rows) {
        const dept = departmentOfSource(r.source);
        const tags = parseStoredPath(r.code, r.category_path);
        const cur = current.get(r.code) as { leaf_id: number; placed_by: string } | undefined;
        if (!cur) throw new Error(`placement: ${r.code} has no path after the schema was installed`);
        let target: number;
        let by: string;
        if (tags.length === 0 || dept === NO_DEPARTMENT) {
          target = unplacedId.get(dept)!;
          by = 'unplaced';
        } else {
          const leaf = leafOf.get(dept, tags[tags.length - 1]!) as { node_id: number } | undefined;
          if (!leaf) throw new Error(`placement: no node for ${dept} ${tags[tags.length - 1]} (${r.code})`);
          target = leaf.node_id;
          by = 'path';
          if (chainOf(target).join('\u0000') !== tags.join('\u0000')) storedRouteDiffers += 1;
        }
        if (cur.placed_by !== 'unplaced' && cur.placed_by !== 'path') {
          keptOtherPlacer += 1;
          continue;
        }
        if (cur.leaf_id === target && cur.placed_by === by) {
          unchanged += 1;
          continue;
        }
        if (by === 'path') recordPlacementCall(r.code);
        move.run(target, by, r.code);
        placed += 1;
      }
    });
  };
  for (const r of items(db, page)) {
    batch.push(r);
    if (batch.length >= 5000) flush();
  }
  flush();

  const counts = countPaths(db);
  const summary = {
    nodesCreated,
    placed,
    unchanged,
    keptOtherPlacer,
    storedRouteDiffers,
    taggedWithNoDepartment,
    taxonomyUsed: tax !== null,
  };
  log(`placement: ${JSON.stringify(summary)}`);
  log(
    `placement: ${counts.products} products, ${counts.withExactlyOnePath} with exactly one path, ${counts.withNoPath} with none, ` +
      `${counts.withTwoOrMorePaths} with two or more, ${counts.brokenChains} broken chains, ${counts.placedAtTopOnly} at the top level only`,
  );
  log(`placement: unplaced by department ${JSON.stringify(counts.unplacedByDepartment)}; placed by department ${JSON.stringify(counts.placedByDepartment)}`);
  const faults: string[] = [];
  if (counts.withNoPath > 0) faults.push(`${counts.withNoPath} items with no path`);
  if (counts.withTwoOrMorePaths > 0) faults.push(`${counts.withTwoOrMorePaths} items with two or more paths`);
  if (counts.brokenChains > 0) faults.push(`${counts.brokenChains} items whose chain does not reach the top`);
  if (counts.orphanPlacements > 0) faults.push(`${counts.orphanPlacements} placements with no product`);
  if (faults.length > 0) throw new Error(`placement FAILED: ${faults.join('; ')}`);
  return { ...summary, counts };
}

/**
 * Places one item on an existing category node of its own department (Stage 3's
 * door out of "unplaced"). Counted as a placement call. Throws for a reserved tag,
 * an unknown item, or a node that does not exist.
 */
export function placeItem(db: DatabaseSync, code: string, tag: string, placedBy: string): void {
  assertPlacedCategory(tag);
  if (placedBy === 'unplaced' || placedBy === 'path') throw new Error(`placeItem: "${placedBy}" is reserved for the build`);
  const p = db.prepare('SELECT source FROM product WHERE code = ?').get(code) as { source: string } | undefined;
  if (!p) throw new Error(`placeItem: no product ${code}`);
  const dept = departmentOfSource(p.source);
  const id = nodeId(db, dept, foldTag(tag));
  if (id === null) throw new Error(`placeItem: no node ${dept} ${tag}`);
  recordPlacementCall(code);
  db.prepare('UPDATE item_placement SET leaf_id = ?, placed_by = ? WHERE code = ?').run(id, placedBy, code);
}

/* --------------------------------------------------------------- reading */

export type CategoryInput =
  | {
      readonly placed: true;
      readonly department: string;
      readonly leafCategory: string;
      /** Root to leaf, department marker left out. */
      readonly categoryPath: readonly string[];
      /** Spread into a range reader's input (price/src/range.ts RangeInput). */
      readonly rangeInput: { readonly leafCategory: string; readonly categoryPath: readonly string[] };
    }
  | {
      readonly placed: false;
      readonly department: string;
      readonly leafCategory: null;
      readonly categoryPath: null;
      readonly rangeInput: Record<string, never>;
    };

/**
 * The one path of an item, in the form a range reader takes. An unplaced item, or
 * an item on a department node only, gives NO category: "unplaced" never reaches
 * a reader as a tag. Throws for an item with no placement row.
 */
export function categoryInputFor(db: DatabaseSync, code: string): CategoryInput {
  const r = db
    .prepare('SELECT n.node_id, n.department, n.kind FROM item_placement ip JOIN placement_node n ON n.node_id = ip.leaf_id WHERE ip.code = ?')
    .get(code) as { node_id: number; department: string; kind: string } | undefined;
  if (!r) throw new Error(`categoryInputFor: ${code} has no placement (is the placement layer installed?)`);
  if (r.kind !== 'category') return { placed: false, department: r.department, leafCategory: null, categoryPath: null, rangeInput: {} };
  const path = pathOfNode(db, r.node_id);
  const leaf = assertPlacedCategory(path[path.length - 1]);
  return { placed: true, department: r.department, leafCategory: leaf, categoryPath: path, rangeInput: { leafCategory: leaf, categoryPath: path } };
}

/** Category tags from the top of the department down to the node (department and unplaced markers left out). */
export function pathOfNode(db: DatabaseSync, id: number): string[] {
  const stmt = db.prepare('SELECT tag, parent_id, kind FROM placement_node WHERE node_id = ?');
  const out: string[] = [];
  let cur: number | null = id;
  for (let guard = 0; cur !== null; guard++) {
    if (guard > 10000) throw new Error(`pathOfNode: the chain of node ${id} does not end`);
    const n = stmt.get(cur) as { tag: string; parent_id: number | null; kind: string } | undefined;
    if (!n) throw new Error(`pathOfNode: node ${cur} does not exist`);
    if (n.kind === 'category') out.push(n.tag);
    cur = n.parent_id;
  }
  return out.reverse();
}

/** sha256 of every (code, leaf, placed_by), in code order: two equal hashes mean no placement changed. */
export function placementHash(db: DatabaseSync): string {
  const h = createHash('sha256');
  for (const r of db.prepare('SELECT code, leaf_id, placed_by FROM item_placement ORDER BY code').iterate() as Iterable<{ code: string; leaf_id: number; placed_by: string }>) {
    h.update(`${r.code}\u0000${r.leaf_id}\u0000${r.placed_by}\n`);
  }
  return h.digest('hex');
}

/* ------------------------------------------------------------------- CLI */

function arg(name: string, argv: readonly string[]): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function main(argv: readonly string[]): number {
  const dbPath = arg('--db', argv);
  if (!dbPath) {
    console.error('placement FAILED: --db <catalogue.db> is required');
    return 2;
  }
  let tax: Taxonomy | null = null;
  if (!argv.includes('--no-taxonomy')) {
    try {
      tax = loadTaxonomy(arg('--taxonomy', argv) ?? DEFAULT_TAXONOMY_PATH, { aliasesPath: DEFAULT_ALIASES_PATH });
    } catch (err) {
      console.error(`placement FAILED before touching anything: ${err instanceof Error ? err.message : String(err)} (pass --no-taxonomy to build without rule step 1)`);
      return 1;
    }
  }
  const db = new DatabaseSync(dbPath);
  try {
    buildPlacement(db, { taxonomy: tax });
    return 0;
  } catch (err) {
    console.error(`placement FAILED: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    db.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
