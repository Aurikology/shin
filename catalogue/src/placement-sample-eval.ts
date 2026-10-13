/**
 * Measuring the label classifier (price-category plan 2.1 "Next") on a SAMPLE of the
 * real catalogue, without touching it.
 *
 *   node src/placement-sample-eval.ts --stage scan|sample|embed|run|tune|report
 *        --work <temp folder> --model-dir <folder holding Xenova/multilingual-e5-small>
 *        [--real file:C:/shin/catalogue/data/catalogue.db?mode=ro&immutable=1] [--seed 20261013]
 *
 * READ-ONLY ON THE REAL DATABASE. It is opened by URI with mode=ro and immutable=1,
 * so no -shm or -wal file is created and nothing is written; everything this script
 * writes is under --work (which the caller deletes). Refuses a --real that is not
 * such a URI.
 *
 *   scan    reads (rowid, code, source, category_path) of the four open-facts departments
 *           (food, beauty, general, pet), builds the FULL placement tree from every
 *           labelled row (the tree the production build would make), saves the nodes.
 *   sample  draws a seeded random sample per department, copies those rows into a temp
 *           catalogue with the full tree, and HIDES the category of two held-out sets
 *           drawn from items that carry an Open Facts category: a tuning set (to choose
 *           the label route's threshold) and the answer key (200 per department, the
 *           plan's 190/200 bar). The truth is kept in answer-key.json, never in the db.
 *   embed   embeds the sample's names and every category label (multilingual-e5-small).
 *   run     runs placement-run.ts on two copies: without the label route, and with it.
 *   tune    standalone accuracy and coverage of the label route over thresholds, on the
 *           tuning set only; prints the lowest threshold per department reaching 95%.
 *   report  before/after top-level-only share and the answer-key scores.
 *
 * WHAT THE SAMPLE CANNOT SHOW. The sample's labelled examples are a fraction of the
 * catalogue's, so the text and meaning routes have fewer neighbours here than they
 * will in production: the "before" top-level share is higher than the real one.
 */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openCatalogue, rebuildFts } from './schema.ts';
import { DEFAULT_ALIASES_PATH, DEFAULT_TAXONOMY_PATH, loadDepartmentTaxonomies, loadTaxonomy } from './category-taxonomy.ts';
import { buildPlacement, DEPARTMENT_OF_SOURCE, departmentOfSource, ensurePlacementSchema } from './placement.ts';
import { climb, PlacementTree, PLACEMENT_CONFIDENCE_BAR } from './placement-cascade.ts';
import { embedNames, onnxE5Embedder, openNameIndex } from './name-meaning.ts';
import { embedLabels, labelCandidates, labelRoute, loadLabelNames } from './label-classifier.ts';
import { main as placementRun } from './placement-run.ts';

export const DEPARTMENTS = ['food', 'beauty', 'general', 'pet'] as const;
/** Items per department in the sample (pet is smaller than this and is taken whole). */
export const SAMPLE_SIZE: Readonly<Record<string, number>> = { food: 25000, beauty: 10000, general: 10000, pet: 10000 };
export const TUNE_PER_DEPARTMENT = 600;
export const KEY_PER_DEPARTMENT = 200;
/** The sources whose rows carry an Open Facts category: the answer key is drawn from them. */
const OPEN_FACTS_SOURCES = new Set(['openfoodfacts', 'openbeautyfacts', 'openproductsfacts', 'openpetfoodfacts']);

function arg(name: string, argv: readonly string[]): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** mulberry32: a small seeded generator, so the same seed draws the same sample. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(xs: readonly T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

interface ScanRow {
  rowid: number;
  code: string;
  source: string;
  path: string[];
}

interface NodeRow {
  department: string;
  tag: string;
  parentTag: string | null;
  depth: number;
}

interface KeyEntry {
  code: string;
  department: string;
  truth: string;
  split: 'tune' | 'key';
}

function assertReadOnlyUri(real: string): void {
  if (!/^file:/.test(real) || !/[?&]mode=ro(&|$)/.test(real) || !/[?&]immutable=1(&|$)/.test(real)) {
    throw new Error(`placement-sample-eval: --real must be a file: URI with mode=ro and immutable=1 (got ${real})`);
  }
}

const REAL_DEFAULT = 'file:C:/shin/catalogue/data/catalogue.db?mode=ro&immutable=1';

/* ----------------------------------------------------------------- scan */

function stageScan(work: string, real: string, log: (l: string) => void): void {
  assertReadOnlyUri(real);
  const sources = Object.entries(DEPARTMENT_OF_SOURCE).filter(([, d]) => (DEPARTMENTS as readonly string[]).includes(d)).map(([s]) => s);
  const src = new DatabaseSync(real, { readOnly: true });
  const rows: ScanRow[] = [];
  const t0 = Date.now();
  const stmt = src.prepare(`SELECT rowid, code, source, category_path FROM product WHERE source IN (${sources.map(() => '?').join(',')})`);
  for (const r of stmt.iterate(...sources) as Iterable<{ rowid: number; code: string; source: string; category_path: string }>) {
    rows.push({ rowid: r.rowid, code: r.code, source: r.source, path: JSON.parse(r.category_path) as string[] });
  }
  src.close();
  log(`scan: ${rows.length} rows of ${sources.join(', ')} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  writeFileSync(join(work, 'scan.json'), JSON.stringify(rows));

  // The full tree, as the production build makes it: from every labelled row.
  const treeDb = openCatalogue(':memory:');
  const ins = treeDb.prepare(`INSERT INTO product (code, name, category_path, leaf_category, allergens, sold_in_canada, source) VALUES (?,?,?,?,?,?,?)`);
  treeDb.exec('BEGIN');
  let n = 0;
  for (const r of rows) {
    if (r.path.length === 0) continue;
    ins.run(r.code, 'x', JSON.stringify(r.path), r.path.at(-1) ?? null, '[]', 1, r.source);
    n += 1;
  }
  treeDb.exec('COMMIT');
  const food = loadTaxonomy(DEFAULT_TAXONOMY_PATH, { aliasesPath: DEFAULT_ALIASES_PATH });
  const built = buildPlacement(treeDb, { taxonomy: food, departmentTaxonomies: loadDepartmentTaxonomies(), log });
  const nodes = treeDb
    .prepare(
      `SELECT n.department, n.tag, p.tag AS parentTag, n.depth FROM placement_node n LEFT JOIN placement_node p ON p.node_id = n.parent_id WHERE n.kind = 'category' ORDER BY n.depth, n.node_id`,
    )
    .all() as unknown as { department: string; tag: string; parentTag: string | null; depth: number }[];
  treeDb.close();
  const out: NodeRow[] = nodes.map((x) => ({ department: x.department, tag: x.tag, parentTag: x.parentTag === '@department' ? null : x.parentTag, depth: x.depth }));
  writeFileSync(join(work, 'tree.json'), JSON.stringify(out));
  const per: Record<string, number> = {};
  for (const x of out) per[x.department] = (per[x.department] ?? 0) + 1;
  log(`scan: tree from ${n} labelled rows: ${out.length} category nodes ${JSON.stringify(per)}; build placed ${built.placed}`);
}

/* --------------------------------------------------------------- sample */

function stageSample(work: string, real: string, seed: number, log: (l: string) => void): void {
  assertReadOnlyUri(real);
  const rows = JSON.parse(readFileSync(join(work, 'scan.json'), 'utf8')) as ScanRow[];
  const nodes = JSON.parse(readFileSync(join(work, 'tree.json'), 'utf8')) as NodeRow[];
  const rand = rng(seed);
  // A hidden item's category must also be carried by another row of the full catalogue: a category only it carries would not be in a tree built without it.
  const tagRows = new Map<string, number>();
  for (const r of rows) {
    const d = departmentOfSource(r.source);
    const t = r.path.at(-1);
    if (t !== undefined) tagRows.set(`${d}\u0000${t}`, (tagRows.get(`${d}\u0000${t}`) ?? 0) + 1);
  }
  const chosen: ScanRow[] = [];
  const key: KeyEntry[] = [];
  const hidden = new Set<string>();
  for (const department of DEPARTMENTS) {
    const pool = rows.filter((r) => departmentOfSource(r.source) === department).sort((a, b) => a.rowid - b.rowid);
    const take = shuffled(pool, rand).slice(0, SAMPLE_SIZE[department]!);
    chosen.push(...take);
    const eligible = shuffled(take.filter((r) => r.path.length > 0 && OPEN_FACTS_SOURCES.has(r.source) && (tagRows.get(`${department}\u0000${r.path.at(-1)}`) ?? 0) >= 2), rand);
    const keyItems = eligible.slice(0, KEY_PER_DEPARTMENT);
    const tuneItems = eligible.slice(KEY_PER_DEPARTMENT, KEY_PER_DEPARTMENT + TUNE_PER_DEPARTMENT);
    for (const r of keyItems) key.push({ code: r.code, department, truth: r.path.at(-1)!, split: 'key' });
    for (const r of tuneItems) key.push({ code: r.code, department, truth: r.path.at(-1)!, split: 'tune' });
    for (const r of [...keyItems, ...tuneItems]) hidden.add(r.code);
    const labelled = take.filter((r) => r.path.length > 0).length;
    log(`sample: ${department}: ${take.length} items of ${pool.length} (${labelled} labelled), hidden ${keyItems.length} key + ${tuneItems.length} tuning from ${eligible.length} eligible`);
  }
  writeFileSync(join(work, 'answer-key.json'), JSON.stringify(key));

  const src = new DatabaseSync(real, { readOnly: true });
  const get = src.prepare(
    `SELECT code, name, name_en, name_fr, brands, quantity, size_value, size_unit, category_path, leaf_category, allergens, sold_in_canada, source, generic_name FROM product WHERE rowid = ?`,
  );
  const dbPath = join(work, 'sample.db');
  const db = openCatalogue(dbPath);
  const ins = db.prepare(
    `INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value, size_unit, category_path, leaf_category, allergens, sold_in_canada, source, generic_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  db.exec('BEGIN');
  for (const r of chosen) {
    const p = get.get(r.rowid) as Record<string, string | number | null> | undefined;
    if (!p) throw new Error(`sample: rowid ${r.rowid} vanished from the real db`);
    const hide = hidden.has(String(p.code));
    ins.run(p.code!, p.name!, p.name_en!, p.name_fr!, p.brands!, p.quantity!, p.size_value!, p.size_unit!, hide ? '[]' : p.category_path!, hide ? null : p.leaf_category!, p.allergens!, p.sold_in_canada!, p.source!, p.generic_name!);
  }
  db.exec('COMMIT');
  src.close();
  rebuildFts(db);

  // The full tree first (existing nodes are never changed by the build), then the sample's items placed on it.
  ensurePlacementSchema(db);
  const deptNode = new Map<string, number>(
    (db.prepare(`SELECT department, node_id FROM placement_node WHERE kind = 'department'`).all() as unknown as { department: string; node_id: number }[]).map((r) => [r.department, r.node_id]),
  );
  const idOf = new Map<string, { id: number; depth: number }>();
  const addNode = db.prepare('INSERT INTO placement_node (department, tag, parent_id, depth, kind) VALUES (?,?,?,?,?)');
  db.exec('BEGIN');
  for (const n of nodes) {
    const parent = n.parentTag === null ? { id: deptNode.get(n.department)!, depth: 0 } : idOf.get(`${n.department}\u0000${n.parentTag}`);
    if (!parent) throw new Error(`sample: node ${n.department} ${n.tag} comes before its parent ${n.parentTag}`);
    const id = Number(addNode.run(n.department, n.tag, parent.id, parent.depth + 1, 'category').lastInsertRowid);
    idOf.set(`${n.department}\u0000${n.tag}`, { id, depth: parent.depth + 1 });
  }
  db.exec('COMMIT');
  const food = loadTaxonomy(DEFAULT_TAXONOMY_PATH, { aliasesPath: DEFAULT_ALIASES_PATH });
  const built = buildPlacement(db, { taxonomy: food, departmentTaxonomies: loadDepartmentTaxonomies(), log });
  log(`sample: ${chosen.length} items in sample.db; the build created ${built.nodesCreated} extra nodes (0 expected), placed ${built.placed}`);
  if (built.nodesCreated !== 0) throw new Error(`sample: the sample's own build created ${built.nodesCreated} nodes the full tree did not have`);
  db.close();
}

/* ---------------------------------------------------------------- embed */

async function stageEmbed(work: string, modelDir: string, threads: number, log: (l: string) => void): Promise<void> {
  const db = new DatabaseSync(join(work, 'sample.db'), { readOnly: true });
  const index = openNameIndex(join(work, 'names.db'));
  const embedder = await onnxE5Embedder(modelDir, { threads });
  const tree = PlacementTree.load(db);
  for (const department of DEPARTMENTS) {
    const t0 = Date.now();
    const r = await embedNames(index, db, embedder, { department, batch: 64, log });
    log(`embed: ${department}: names ${JSON.stringify(r)} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    const l = await embedLabels(index, tree, embedder, { department, names: loadLabelNames(department), log });
    log(`embed: ${department}: labels ${JSON.stringify(l)}`);
  }
  db.close();
  index.close();
}

/* ------------------------------------------------------------------ run */

async function stageRun(work: string, modelDir: string, threshold: number, log: (l: string) => void): Promise<void> {
  for (const variant of ['before', 'after'] as const) {
    const copy = join(work, `placed-${variant}.db`);
    copyFileSync(join(work, 'sample.db'), copy);
    const args = ['--db', copy, '--vectors', join(work, 'names.db'), '--workers', '4'];
    if (variant === 'after') args.push('--label-threshold', String(threshold), '--model-dir', modelDir);
    log(`run: ${variant}: placement-run ${args.join(' ')}`);
    const code = await placementRun(args);
    log(`run: ${variant}: exit ${code} (0 = every item placed and top-level share within 5%, 3 = share over 5%)`);
  }
}

/* ------------------------------------------------------------- scoring */

interface Truth {
  readonly tree: PlacementTree;
  readonly nodeOf: Map<string, number>; // `${department}\0${tag}`
}

function loadTruth(db: DatabaseSync): Truth {
  const tree = PlacementTree.load(db);
  const nodeOf = new Map<string, number>();
  for (const d of DEPARTMENTS) for (const n of tree.categoriesOf(d)) nodeOf.set(`${d}\u0000${n.tag}`, n.id);
  return { tree, nodeOf };
}

/** exact: the true category; parent: its direct parent; above: any other category ancestor. */
function judge(t: Truth, department: string, truthTag: string, placedNode: number): 'exact' | 'parent' | 'above' | 'top' | 'wrong' {
  const trueId = t.nodeOf.get(`${department}\u0000${truthTag.trim().toLowerCase()}`);
  if (trueId === undefined) throw new Error(`the true category ${truthTag} is not a node of ${department}`);
  const placed = t.tree.node(placedNode);
  if (placed.kind === 'department') return 'top';
  if (placedNode === trueId) return 'exact';
  const trueNode = t.tree.node(trueId);
  if (trueNode.parent === placedNode) return 'parent';
  for (let cur = trueNode.parent, g = 0; cur !== null && g < 1000; g++) {
    if (cur === placedNode) return 'above';
    cur = t.tree.node(cur).parent;
  }
  return 'wrong';
}

const THRESHOLDS = [0.7, 0.75, 0.78, 0.8, 0.82, 0.84, 0.85, 0.86, 0.87, 0.88, 0.89, 0.9, 0.91, 0.92, 0.93, 0.94, 0.95, 0.96, 0.97, 0.98];

/** Standalone accuracy of the label route over thresholds: each hidden item through the route alone. */
async function stageTune(work: string, modelDir: string, log: (l: string) => void): Promise<Record<string, number>> {
  void modelDir;
  const db = new DatabaseSync(join(work, 'sample.db'), { readOnly: true });
  const index = openNameIndex(join(work, 'names.db'));
  const truth = loadTruth(db);
  const key = JSON.parse(readFileSync(join(work, 'answer-key.json'), 'utf8')) as KeyEntry[];
  const chosen: Record<string, number> = {};
  for (const department of DEPARTMENTS) {
    const cands = await labelCandidates(index, db, truth.tree, { department, names: loadLabelNames(department), k: 8, workers: 4, log });
    const tune = key.filter((k) => k.department === department && k.split === 'tune');
    log(`tune: ${department}: ${tune.length} tuning items, ${cands.labels} labels`);
    let pick: number | null = null;
    for (const th of THRESHOLDS) {
      const route = labelRoute(cands.candidates, { threshold: th });
      let placed = 0;
      let right = 0;
      let exact = 0;
      let top = 0;
      let above = 0;
      let wrong = 0;
      for (const k of tune) {
        const votes = route.propose({ code: k.code, department });
        if (!votes) continue;
        const c = climb(truth.tree, votes, department, PLACEMENT_CONFIDENCE_BAR, 0);
        if (c.atTopLevel) {
          top += 1;
          continue;
        }
        placed += 1;
        const j = judge(truth, department, k.truth, c.nodeId);
        if (j === 'exact') exact += 1;
        if (j === 'above') above += 1;
        if (j === 'wrong' || j === 'top') wrong += 1;
        if (j === 'exact' || j === 'parent') right += 1;
      }
      const acc = placed === 0 ? NaN : right / placed;
      log(`tune: ${department} threshold ${th.toFixed(2)}: placed ${placed}/${tune.length} (${((placed / tune.length) * 100).toFixed(1)}%), top-level-after-climb ${top}, right at category-or-parent ${right} (${(acc * 100).toFixed(1)}%), exact ${exact}, shallow-but-same-branch ${above}, wrong branch ${wrong}`);
      if (pick === null && placed >= 30 && acc >= 0.95) pick = th;
    }
    log(`tune: ${department}: lowest threshold reaching 95% on the tuning split with 30+ placed: ${pick ?? 'NONE in the grid'}`);
    if (pick !== null) chosen[department] = pick;
  }
  db.close();
  index.close();
  return chosen;
}

/* --------------------------------------------------------------- report */

function stageReport(work: string, log: (l: string) => void): void {
  const key = JSON.parse(readFileSync(join(work, 'answer-key.json'), 'utf8')) as KeyEntry[];
  const hiddenCodes = new Set(key.map((k) => k.code));
  for (const variant of ['before', 'after'] as const) {
    const db = new DatabaseSync(join(work, `placed-${variant}.db`), { readOnly: true });
    const truth = loadTruth(db);
    log(`report: ${variant}`);
    const share = db.prepare(
      `SELECT p.code, p.source, p.category_path, ip.placed_by, n.kind FROM product p JOIN item_placement ip ON ip.code = p.code JOIN placement_node n ON n.node_id = ip.leaf_id`,
    );
    const agg: Record<string, { all: number; unlabelled: number; topUnlabelled: number; topAll: number; byRoute: Record<string, number> }> = {};
    for (const r of share.iterate() as Iterable<{ code: string; source: string; category_path: string; placed_by: string; kind: string }>) {
      const d = departmentOfSource(r.source);
      const a = (agg[d] ??= { all: 0, unlabelled: 0, topUnlabelled: 0, topAll: 0, byRoute: {} });
      a.all += 1;
      const wasUnlabelled = r.category_path === '[]' && !hiddenCodes.has(r.code);
      if (wasUnlabelled) {
        a.unlabelled += 1;
        a.byRoute[r.placed_by] = (a.byRoute[r.placed_by] ?? 0) + 1;
        if (r.kind === 'department') a.topUnlabelled += 1;
      }
    }
    for (const d of DEPARTMENTS) {
      const a = agg[d]!;
      log(
        `report: ${variant} ${d}: items ${a.all}, genuinely unlabelled ${a.unlabelled}, top-level only ${a.topUnlabelled} = ${((a.topUnlabelled / a.all) * 100).toFixed(2)}% of all items, ${((a.topUnlabelled / a.unlabelled) * 100).toFixed(1)}% of the unlabelled; by route ${JSON.stringify(a.byRoute)}`,
      );
    }
    // Answer key (the 200 per department), then the tuning split too.
    const place = db.prepare(`SELECT ip.leaf_id, ip.placed_by FROM item_placement ip WHERE ip.code = ?`);
    for (const split of ['key', 'tune'] as const) {
      for (const d of DEPARTMENTS) {
        const items = key.filter((k) => k.department === d && k.split === split);
        const tally: Record<string, number> = { exact: 0, parent: 0, above: 0, top: 0, wrong: 0 };
        const byRoute: Record<string, { n: number; right: number }> = {};
        for (const k of items) {
          const p = place.get(k.code) as { leaf_id: number; placed_by: string };
          const j = judge(truth, d, k.truth, p.leaf_id);
          tally[j] = (tally[j] ?? 0) + 1;
          const br = (byRoute[p.placed_by] ??= { n: 0, right: 0 });
          br.n += 1;
          if (j === 'exact' || j === 'parent') br.right += 1;
        }
        const right = (tally.exact ?? 0) + (tally.parent ?? 0);
        log(
          `report: ${variant} ${split} ${d}: ${items.length} items: right at category-or-parent ${right}/${items.length} (exact ${tally.exact}, parent ${tally.parent}); above-parent ${tally.above}, top-level ${tally.top}, wrong ${tally.wrong}; by route ${JSON.stringify(byRoute)}`,
        );
      }
    }
    db.close();
  }
}

/* ------------------------------------------------------------------ main */

export async function main(argv: readonly string[]): Promise<number> {
  const stage = arg('--stage', argv);
  const work = arg('--work', argv);
  if (!stage || !work) {
    console.error('placement-sample-eval FAILED: --stage and --work are required');
    return 2;
  }
  mkdirSync(work, { recursive: true });
  const t0 = Date.now();
  const log = (l: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${l}`);
  const real = arg('--real', argv) ?? REAL_DEFAULT;
  const modelDir = arg('--model-dir', argv) ?? '';
  try {
    if (stage === 'scan') stageScan(work, real, log);
    else if (stage === 'sample') stageSample(work, real, Number(arg('--seed', argv) ?? 20261013), log);
    else if (stage === 'embed') await stageEmbed(work, modelDir, Number(arg('--threads', argv) ?? 8), log);
    else if (stage === 'run') await stageRun(work, modelDir, Number(arg('--threshold', argv) ?? 0.8), log);
    else if (stage === 'tune') log(`tune: chosen ${JSON.stringify(await stageTune(work, modelDir, log))}`);
    else if (stage === 'report') stageReport(work, log);
    else throw new Error(`unknown stage ${stage}`);
    return 0;
  } catch (err) {
    console.error(`placement-sample-eval FAILED: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
