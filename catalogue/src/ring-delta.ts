/**
 * Evidence for the category-tag case fold: what merging case-variant tags
 * (schema.ts, rebuildCategories) actually changes about which neighbour ring
 * a product resolves to (search.ts, ring()), and by how much.
 *
 * WHY THIS FILE EXISTS. Folding tag case at write time is not free: it makes
 * some tags bigger, and search.ts refuses to draw a ring at a tag bigger than
 * MAX_RING_TAG members because three arbitrary rows from a shelf of the whole
 * shop is not "here are other ones like it". Merging case variants can push a
 * tag that was safely under that cap over it. That is a live change to what
 * `/api/search` returns, not an invisible cleanup, and this is the script
 * that shows exactly which products it touches and how.
 *
 * SIMULATION, NOT A MEASUREMENT OF THE POST-REBUILD DATABASE. rebuildCategories
 * has not been run against this database yet when this script is first
 * written -- it deletes and reinserts 17.2 million rows, takes roughly two
 * minutes, and another terminal has this file open, so the conductor runs it,
 * not this script. "After" is therefore computed by grouping the CURRENT
 * product_category table by lower(tag) here, in memory, which is exactly the
 * membership rebuildCategories's `INSERT OR IGNORE` on (rowid_ref, tag) would
 * produce once the tag it inserts is lower-cased. The conductor re-runs this
 * same script after the real rebuild to confirm the simulation was right; if
 * the two runs disagree, the simulation was wrong somewhere and that is a
 * finding, not something this file gets to quietly paper over.
 *
 * READ ONLY, SAFE NEXT TO A LIVE WRITER. Opens with openCatalogueReadOnly
 * (schema.ts): a read-only file handle, no DDL, no PRAGMA. WAL allows any
 * number of readers alongside one writer, and a connection that never writes
 * can never contend for the lock rebuildCategories will eventually take.
 *
 * Run: node --experimental-strip-types catalogue/src/ring-delta.ts
 * (from the repo root or from catalogue/ -- the db path is resolved relative
 * to this file's own location, not the working directory, so either works).
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openCatalogueReadOnly } from './schema.ts';
import { MAX_RING_TAG } from './search.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.SHIN_CATALOGUE ?? join(HERE, '..', 'data', 'catalogue.db');

/**
 * The numbers handed down with this task, measured once by someone else.
 * Printed beside what this script measures on its own so a disagreement is
 * visible rather than silently overwritten by whichever number was typed
 * last.
 */
const CLAIMED = {
  distinctTagsStored: 20_043,
  distinctTagsAfterFold: 19_512,
  crossingForward: 20,
  crossingBackward: 0,
  affectedProducts: 648,
};

interface ExactTagCount {
  readonly tag: string;
  readonly n: number;
}

interface LowerGroup {
  readonly lower: string;
  /** Every exact-cased spelling that folds into this group, with its own count. */
  readonly exact: ExactTagCount[];
  /** Sum of the exact counts. An upper bound on the true size, not the true size:
   *  it double-counts any product that carries more than one cased spelling of
   *  the same tag in its OWN path, which INSERT OR IGNORE's (rowid_ref, tag)
   *  key would collapse to one row. Used only to shortlist candidates cheaply;
   *  every candidate is re-checked with a real DISTINCT query before it is
   *  reported as a finding. */
  readonly naiveSum: number;
}

interface Crossing {
  readonly tag: string;
  readonly before: number;
  readonly after: number;
}

interface ProductRow {
  readonly rowid: number;
  readonly code: string;
  readonly name: string;
  readonly category_path: string;
}

interface Resolution {
  readonly i: number | null;
  readonly tag: string | null;
  readonly size: number | null;
}

/** One row per distinct tag exactly as stored, with how many products carry it. */
function loadExactTagCounts(db: DatabaseSync): ExactTagCount[] {
  return db
    .prepare('SELECT tag, COUNT(*) AS n FROM product_category GROUP BY tag')
    .all() as unknown as ExactTagCount[];
}

function buildLowerGroups(exact: readonly ExactTagCount[]): Map<string, LowerGroup> {
  const map = new Map<string, { lower: string; exact: ExactTagCount[]; naiveSum: number }>();
  for (const e of exact) {
    const lower = e.tag.toLowerCase();
    let g = map.get(lower);
    if (!g) {
      g = { lower, exact: [], naiveSum: 0 };
      map.set(lower, g);
    }
    g.exact.push(e);
    g.naiveSum += e.n;
  }
  return map;
}

/**
 * The TRUE post-fold size of one lower-cased group: the count of distinct
 * products holding any of its cased spellings, not the sum of their counts.
 * Only worth asking the database for the handful of groups the naive sum
 * flags as candidates -- this is a targeted query against a small IN list,
 * which the product_category_tag index serves directly, not a scan of the
 * 17.2 million row table.
 */
function preciseGroupSize(db: DatabaseSync, tags: readonly string[]): number {
  const placeholders = tags.map(() => '?').join(',');
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM (SELECT DISTINCT rowid_ref FROM product_category WHERE tag IN (${placeholders}))`,
    )
    .get(...tags) as { n: number };
  return row.n;
}

/**
 * Exact-cased tags that sit at or under MAX_RING_TAG today, on their own, but
 * whose lower-cased group is over it once every spelling is counted together.
 *
 * A group with only one spelling can never cross: folding a tag with itself
 * changes nothing, so it is skipped before touching the database at all.
 */
function findCrossings(
  db: DatabaseSync,
  groups: Map<string, LowerGroup>,
): { crossings: Crossing[]; preciseByLower: Map<string, number> } {
  const crossings: Crossing[] = [];
  const preciseByLower = new Map<string, number>();
  for (const g of groups.values()) {
    if (g.exact.length < 2) continue;
    if (g.naiveSum <= MAX_RING_TAG) continue;
    const after = preciseGroupSize(db, g.exact.map((e) => e.tag));
    preciseByLower.set(g.lower, after);
    if (after <= MAX_RING_TAG) continue; // the naive sum over-counted a real collision away
    for (const e of g.exact) {
      if (e.n <= MAX_RING_TAG) crossings.push({ tag: e.tag, before: e.n, after });
    }
  }
  return { crossings, preciseByLower };
}

/** After-size for every group: the precise value where measured, the naive sum elsewhere. */
function buildAfterSizeMap(
  groups: Map<string, LowerGroup>,
  preciseByLower: Map<string, number>,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of groups.values()) m.set(g.lower, preciseByLower.get(g.lower) ?? g.naiveSum);
  return m;
}

function loadAffectedProducts(db: DatabaseSync, crossingTags: readonly string[]): ProductRow[] {
  if (crossingTags.length === 0) return [];
  const tagPlaceholders = crossingTags.map(() => '?').join(',');
  const rowidRows = db
    .prepare(`SELECT DISTINCT rowid_ref FROM product_category WHERE tag IN (${tagPlaceholders})`)
    .all(...crossingTags) as unknown as { rowid_ref: number | bigint }[];
  const rowids = rowidRows.map((r) => Number(r.rowid_ref));
  if (rowids.length === 0) return [];
  const idPlaceholders = rowids.map(() => '?').join(',');
  return db
    .prepare(`SELECT rowid, code, name, category_path FROM product WHERE rowid IN (${idPlaceholders})`)
    .all(...rowids) as unknown as ProductRow[];
}

/**
 * Walks a product's own category path from leaf outward exactly as ring()
 * did BEFORE the fold: exact-cased tag, exact-cased membership. Mirrors
 * search.ts#ring() and #tagSize() -- the size check is `> MAX_RING_TAG`, and
 * a level only counts as a ring if at least one OTHER product shares the
 * exact tag once this product's own row is excluded.
 *
 * A NOTE ON WHAT "MOVING" CAN MEAN HERE, so a real result is not mistaken for
 * a bug. Merging case variants only ever grows a tag's member count, so the
 * size check (`> MAX_RING_TAG`) is monotone: a level that failed it before
 * still fails it after. The PEER check ("at least one OTHER member") is not
 * monotone in the same direction -- it can only go from failing to passing,
 * never the reverse, because merging can only ADD members, never remove one.
 * A product whose own exact-cased tag was an isolated spelling (0 other
 * members, so this level was skipped) can gain real peers once the common
 * spelling folds in, and stop RIGHT THERE instead of continuing to widen.
 * That moves the resolved ring to a MORE SPECIFIC level than before, not a
 * wider one -- the opposite direction from the cap crossings this file is
 * mainly about, but the same underlying cause: an obscure capitalisation was
 * hiding a product from peers that existed all along under the usual
 * spelling. Confirmed against the live data, not assumed: CURRY-BRATWURST
 * (code 20324414) resolved before to the broad "en:Meats" (2 members, one
 * level out) because its own leaf tag "en:Prepared-meats" was an isolated
 * capitalised spelling with no peers; after the fold that same leaf position
 * reads as "en:prepared-meats" with 833 members and the walk stops there
 * instead of widening.
 */
function resolveBefore(path: readonly string[], byExact: ReadonlyMap<string, number>): Resolution {
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const tag = path[i];
    const size = byExact.get(tag) ?? 0;
    if (size > MAX_RING_TAG) continue;
    const others = size > 0 ? size - 1 : 0;
    if (others >= 1) return { i, tag, size };
  }
  return { i: null, tag: null, size: null };
}

/** Same walk, AFTER the fold: both probes read lower(path[i]) against the merged sizes. */
function resolveAfter(path: readonly string[], byLower: ReadonlyMap<string, number>): Resolution {
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const tag = path[i].toLowerCase();
    const size = byLower.get(tag) ?? 0;
    if (size > MAX_RING_TAG) continue;
    const others = size > 0 ? size - 1 : 0;
    if (others >= 1) return { i, tag, size };
  }
  return { i: null, tag: null, size: null };
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function main(): void {
  const db = openCatalogueReadOnly(DB_PATH);

  console.log('');
  console.log('Ring delta: what the category-tag case fold changes on the CURRENT database.');
  console.log(`db: ${DB_PATH}`);
  console.log('');

  const t0 = Date.now();
  const exact = loadExactTagCounts(db);
  const t1 = Date.now();
  console.log(`read ${fmt(exact.length)} distinct stored tags from product_category in ${((t1 - t0) / 1000).toFixed(1)} s`);

  const groups = buildLowerGroups(exact);
  const distinctTagsStored = exact.length;
  const distinctTagsAfterFold = groups.size;

  const { crossings, preciseByLower } = findCrossings(db, groups);
  const t2 = Date.now();
  console.log(`checked ${fmt([...groups.values()].filter((g) => g.exact.length > 1).length)} multi-spelling groups for crossings in ${((t2 - t1) / 1000).toFixed(1)} s`);

  crossings.sort((a, b) => a.tag.localeCompare(b.tag));
  const crossingTags = crossings.map((c) => c.tag);

  // "0 the other way" is not measured, it is proven: a group's true post-fold
  // size counts every distinct product holding ANY of its spellings, and a
  // product counted under one exact spelling is, by definition, one of those
  // products. So a group's size can only be greater than or equal to any one
  // of its own exact-tag members' counts, never less. A tag already over
  // MAX_RING_TAG before the fold cannot land at or under it after. That holds
  // for every group regardless of collisions, so no query can find a
  // counterexample and none is run for it.
  const crossingBackward = 0;

  const affected = loadAffectedProducts(db, crossingTags);
  const t3 = Date.now();
  console.log(`found ${fmt(affected.length)} products holding a crossing tag in ${((t3 - t2) / 1000).toFixed(1)} s`);
  console.log('');

  console.log('Recomputed vs claimed:');
  const compare = (label: string, mine: number, claimed: number) => {
    const mark = mine === claimed ? 'MATCH' : `DISAGREES by ${mine - claimed > 0 ? '+' : ''}${mine - claimed}`;
    console.log(`  ${label.padEnd(38)} mine ${fmt(mine).padStart(8)}   claimed ${fmt(claimed).padStart(8)}   ${mark}`);
  };
  compare('distinct tags as stored', distinctTagsStored, CLAIMED.distinctTagsStored);
  compare('distinct tags after lower-casing', distinctTagsAfterFold, CLAIMED.distinctTagsAfterFold);
  compare('tags crossing the cap forward', crossings.length, CLAIMED.crossingForward);
  compare('tags crossing the cap backward', crossingBackward, CLAIMED.crossingBackward);
  compare('products holding a crossing tag', affected.length, CLAIMED.affectedProducts);
  console.log('');

  console.log(`The ${fmt(crossings.length)} crossing tags, before -> after member count:`);
  for (const c of crossings) {
    console.log(`  ${c.tag.padEnd(34)} ${fmt(c.before).padStart(6)}  ->  ${fmt(c.after).padStart(6)}`);
  }
  console.log('');

  const byExact = new Map(exact.map((e) => [e.tag, e.n] as const));
  const byLower = buildAfterSizeMap(groups, preciseByLower);

  let same = 0;
  let outward = 0;
  let lostRing = 0;
  let gainedRing = 0;
  let bothNone = 0;
  let inward = 0;
  const rows: { code: string; name: string; before: Resolution; after: Resolution }[] = [];
  let parseFailures = 0;

  for (const p of affected) {
    let path: string[];
    try {
      path = JSON.parse(p.category_path) as string[];
    } catch {
      parseFailures += 1;
      continue;
    }
    const before = resolveBefore(path, byExact);
    const after = resolveAfter(path, byLower);
    rows.push({ code: p.code, name: p.name, before, after });

    // Wider (outward) is the expected direction, from a tag crossing the cap.
    // Narrower (inward) is real too, from a rescued peer count -- see the
    // long comment on resolveBefore/resolveAfter. Neither is a bug; both are
    // counted and shown rather than one being assumed away.
    if (before.i === null && after.i === null) bothNone += 1;
    else if (before.i === null && after.i !== null) gainedRing += 1;
    else if (before.i !== null && after.i === null) lostRing += 1;
    else if (before.i === after.i) same += 1;
    else if (after.i! < before.i!) outward += 1;
    else inward += 1;
  }

  console.log(`Ring resolution for the ${fmt(affected.length)} affected products (before the fold vs simulated after):`);
  console.log(`  same ring                           ${fmt(same)}`);
  console.log(`  moved outward to a wider ring       ${fmt(outward)}`);
  console.log(`  lost its ring entirely              ${fmt(lostRing)}`);
  if (inward > 0) {
    console.log(`  moved inward to a more specific ring ${fmt(inward)}  <- a real fourth outcome, not asked for: a peer count that was 0 before`);
    console.log('    (an isolated capitalised spelling) can only grow once merged, never shrink,');
    console.log('    so a level that failed the "has another member" check can start passing --');
    console.log('    see the long comment above resolveBefore/resolveAfter for a worked example.');
  }
  if (gainedRing > 0) {
    console.log(`  gained a ring it did not have        ${fmt(gainedRing)}   <- also a real fourth outcome, same mechanism, from no ring to one`);
  }
  if (bothNone > 0) {
    console.log(`  had no ring before or after          ${fmt(bothNone)}`);
  }
  if (parseFailures > 0) {
    console.log(`  category_path failed to parse        ${fmt(parseFailures)}   (skipped, not counted above)`);
  }
  console.log('');

  const label = (r: Resolution): string => (r.tag === null ? 'NONE' : `${r.tag} (${fmt(r.size!)})`);
  console.log('First 20 affected products, old ring -> new ring:');
  for (const r of rows.slice(0, 20)) {
    console.log(`  ${r.code}  ${r.name.slice(0, 32).padEnd(32)}  ${label(r.before).padEnd(28)} -> ${label(r.after)}`);
  }
  console.log('');

  db.close();
}

main();
