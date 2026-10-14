/**
 * Builds catalogue/food-label-map.json: which Open Food Facts node each USDA food label
 * hangs under (food-label-link.ts explains the three methods and the hold-out).
 *
 *   node src/build-food-label-map.ts --stage tree|overlap|link|all --work <temp folder>
 *        --data-dir <folder holding off-categories.json>           (the food taxonomy)
 *        [--real file:C:/shin/catalogue/data/catalogue.db?mode=ro&immutable=1]
 *        [--feeds <folder holding rows-usda.jsonl and off.csv.gz>] (default: the --real db's folder)
 *        --model-dir <folder holding Xenova/multilingual-e5-small> (method 2)
 *        [--out <file>] [--exclude <answer-key.json>]
 *
 * READ-ONLY ON REAL DATA. The catalogue is opened by URI with mode=ro and immutable=1
 * (nothing is created beside it), the two feeds are only read, and everything this writes
 * is under --work and --out. Run it against a COPY-free setup: no real file is copied.
 *
 *   tree     reads every food row's category path from the catalogue and builds the food
 *            tree the placement build makes (without the map); saves the nodes, how many
 *            items carry each, and the USDA labels.
 *   overlap  streams rows-usda.jsonl and off.csv.gz once; keeps the barcodes in BOTH, with
 *            the USDA label and Open Food Facts' raw category tags.
 *   link     puts each overlapping barcode's Open Food Facts item on the tree (its chain),
 *            splits the barcodes in two by hash, builds the mapping on one half and scores
 *            it on the other (per method), then builds the shipped mapping on all barcodes.
 *            --exclude drops the codes of an answer key first (an evaluation map: the key
 *            items' own categories must not teach the mapping they are scored by).
 *
 * The meaning method's threshold and climb are CHOSEN ON THE TRAINING HALF ONLY and then
 * scored on the held-out half. With no --model-dir the method does not run, and the
 * report says so; a label it would have caught falls to the fallback.
 */

import { createReadStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openCatalogue } from './schema.ts';
import { DEFAULT_ALIASES_PATH, foldTag, loadTaxonomy, type Taxonomy } from './category-taxonomy.ts';
import { buildPlacement, DEPARTMENT_OF_SOURCE } from './placement.ts';
import { canonicalCode } from './barcode.ts';
import { embedSymmetric } from './embed.ts';
import { onnxE5Embedder } from './name-meaning.ts';
import { labelTextOf, loadLabelNames } from './label-classifier.ts';
import {
  assembleLinks,
  FOOD_LABEL_MAP_PATH,
  linkByBarcode,
  linkByCommonAncestor,
  linkByMeaning,
  MIN_AGREE_BARCODES,
  MIN_BARCODES,
  MIN_SHARE,
  scoreLinks,
  serializeFoodLabelMap,
  splitHoldout,
  type LabelLink,
  type LabelMethod,
  type NodeVector,
  type OverlapPair,
} from './food-label-link.ts';

const REAL_DEFAULT = 'file:C:/shin/catalogue/data/catalogue.db?mode=ro&immutable=1';

function arg(name: string, argv: readonly string[]): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function assertReadOnlyUri(real: string): void {
  if (!/^file:/.test(real) || !/[?&]mode=ro(&|$)/.test(real) || !/[?&]immutable=1(&|$)/.test(real)) {
    throw new Error(`build-food-label-map: --real must be a file: URI with mode=ro and immutable=1 (got ${real})`);
  }
}

/** The folder a `file:` URI's database sits in (for the default --feeds). */
function folderOfUri(real: string): string {
  const path = decodeURIComponent(real.replace(/^file:/, '').replace(/\?.*$/, ''));
  return dirname(path);
}

interface TreeFile {
  /** tag -> [parent tag or null for the food top, depth (1 under the food top)] */
  readonly nodes: Record<string, [string | null, number]>;
  /** Open Food Facts items carrying the tag in their one stored path. */
  readonly members: Record<string, number>;
  /** The distinct USDA labels, folded. */
  readonly usdaLabels: string[];
  readonly offRows: number;
  readonly usdaRows: number;
}

/* ----------------------------------------------------------------- tree */

function stageTree(work: string, real: string, dataDir: string, log: (l: string) => void): void {
  assertReadOnlyUri(real);
  const foodSources = Object.entries(DEPARTMENT_OF_SOURCE).filter(([, d]) => d === 'food').map(([s]) => s);
  const src = new DatabaseSync(real, { readOnly: true });
  const mem = openCatalogue(':memory:');
  const ins = mem.prepare(`INSERT INTO product (code, name, category_path, leaf_category, allergens, sold_in_canada, source) VALUES (?,?,?,?,?,?,?)`);
  const members: Record<string, number> = {};
  const usda = new Set<string>();
  let offRows = 0;
  let usdaRows = 0;
  mem.exec('BEGIN');
  for (const r of src
    .prepare(`SELECT code, source, category_path FROM product WHERE source IN (${foodSources.map(() => '?').join(',')})`)
    .iterate(...foodSources) as Iterable<{ code: string; source: string; category_path: string }>) {
    const path = JSON.parse(r.category_path) as string[];
    if (path.length === 0) continue;
    ins.run(r.code, 'x', r.category_path, path.at(-1) ?? null, '[]', 1, r.source);
    if (r.source === 'usda') {
      usdaRows += 1;
      for (const t of path) usda.add(foldTag(t));
    } else if (r.source === 'openfoodfacts') {
      offRows += 1;
      for (const t of new Set(path.map(foldTag))) members[t] = (members[t] ?? 0) + 1;
    }
  }
  mem.exec('COMMIT');
  src.close();
  const tax = loadTaxonomy(join(dataDir, 'off-categories.json'), { aliasesPath: DEFAULT_ALIASES_PATH });
  buildPlacement(mem, { taxonomy: tax, departmentTaxonomies: null, foodLabelMap: null, log });
  const nodes: Record<string, [string | null, number]> = {};
  for (const n of mem
    .prepare(
      `SELECT n.tag, p.tag AS ptag, n.depth FROM placement_node n LEFT JOIN placement_node p ON p.node_id = n.parent_id WHERE n.department = 'food' AND n.kind = 'category'`,
    )
    .all() as unknown as { tag: string; ptag: string | null; depth: number }[]) {
    nodes[n.tag] = [n.ptag === '@department' ? null : n.ptag, n.depth];
  }
  mem.close();
  const file: TreeFile = { nodes, members, usdaLabels: [...usda].sort(), offRows, usdaRows };
  writeFileSync(join(work, 'food-tree.json'), JSON.stringify(file));
  log(`tree: ${Object.keys(nodes).length} food nodes from ${offRows} Open Food Facts and ${usdaRows} USDA labelled rows; ${file.usdaLabels.length} USDA labels`);
}

/* -------------------------------------------------------------- overlap */

async function stageOverlap(work: string, feeds: string, log: (l: string) => void): Promise<void> {
  const usda = new Map<string, string>();
  {
    const rl = createInterface({ input: createReadStream(join(feeds, 'rows-usda.jsonl')), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const r = JSON.parse(line) as { code: string; category_path?: string[] };
      if (Array.isArray(r.category_path) && r.category_path.length > 0) usda.set(canonicalCode(r.code), foldTag(r.category_path.at(-1)!));
    }
  }
  log(`overlap: ${usda.size} USDA rows with a label`);
  const rl = createInterface({ input: createReadStream(join(feeds, 'off.csv.gz')).pipe(createGunzip()), crlfDelay: Infinity });
  const out: { code: string; label: string; tags: string[] }[] = [];
  let n = 0;
  let header: string[] | null = null;
  let codeCol = 0;
  let tagsCol = -1;
  for await (const line of rl) {
    n += 1;
    if (header === null) {
      header = line.split('\t');
      codeCol = header.indexOf('code');
      tagsCol = header.indexOf('categories_tags');
      if (codeCol < 0 || tagsCol < 0) throw new Error(`overlap: off.csv.gz has no code/categories_tags column (header: ${header.slice(0, 5).join(',')}...)`);
      continue;
    }
    const tab = line.indexOf('\t');
    const label = usda.get(canonicalCode(line.slice(0, tab)));
    if (label === undefined) continue;
    const cols = line.split('\t');
    const tags = (cols[tagsCol] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    out.push({ code: canonicalCode(cols[codeCol]!), label, tags });
  }
  writeFileSync(join(work, 'overlap.json'), JSON.stringify(out));
  log(`overlap: ${n - 1} Open Food Facts rows read; ${out.length} barcodes in both feeds, ${out.filter((o) => o.tags.length > 0).length} with Open Food Facts categories`);
}

/* ---------------------------------------------------------------- chains */

class Tree {
  readonly parent = new Map<string, string | null>();
  readonly depth = new Map<string, number>();
  readonly file: TreeFile;
  constructor(file: TreeFile) {
    this.file = file;
    for (const [t, [p, d]] of Object.entries(file.nodes)) {
      this.parent.set(t, p);
      this.depth.set(t, d);
    }
  }
  has(tag: string): boolean {
    return this.parent.has(tag);
  }
  depthOf = (tag: string): number => this.depth.get(tag) ?? 0;
  parentOf = (tag: string): string | null => this.parent.get(tag) ?? null;
  chain(tag: string): string[] {
    const out: string[] = [];
    for (let cur: string | null = tag, g = 0; cur !== null && g < 1000; g++) {
      out.push(cur);
      cur = this.parent.get(cur) ?? null;
    }
    return out.reverse();
  }
}

/**
 * An Open Food Facts item's chain on the tree: its raw tags resolved against the taxonomy,
 * each moved to the nearest of itself or its ancestors the tree has, the deepest of those
 * (more members, then deeper, then alphabetical) taken as the leaf. Empty when no tag resolves.
 */
function chainOf(tags: readonly string[], tax: Taxonomy, tree: Tree): string[] {
  const keys = new Set<string>();
  for (const raw of tags) {
    const k = tax.resolveLabel(raw);
    if (k === null) continue;
    if (tree.has(k)) keys.add(k);
    else {
      const near = [...tax.ancestorsOf(k)].filter((a) => tree.has(a)).sort((a, b) => tree.depthOf(b) - tree.depthOf(a) || (a < b ? -1 : 1))[0];
      if (near) keys.add(near);
    }
  }
  const all = [...keys];
  const deepest = all.filter((t) => !all.some((o) => o !== t && tree.chain(o).includes(t)));
  if (deepest.length === 0) return [];
  deepest.sort((a, b) => (tree.file.members[b] ?? 0) - (tree.file.members[a] ?? 0) || tree.depthOf(b) - tree.depthOf(a) || (a < b ? -1 : 1));
  return tree.chain(deepest[0]!);
}

/* ------------------------------------------------------------------ link */

const THRESHOLDS = [0.7, 0.75, 0.78, 0.8, 0.82, 0.84, 0.85, 0.86, 0.87, 0.88, 0.89, 0.9, 0.92, 0.94];
const CLIMBS = [0, 1, 2, 3, 4];

interface Chosen {
  readonly threshold: number | null;
  readonly climb: number;
  readonly why: string;
}

async function stageLink(work: string, dataDir: string, modelDir: string, out: string, excludePath: string | undefined, log: (l: string) => void): Promise<void> {
  const file = JSON.parse(readFileSync(join(work, 'food-tree.json'), 'utf8')) as TreeFile;
  const tree = new Tree(file);
  const tax = loadTaxonomy(join(dataDir, 'off-categories.json'), { aliasesPath: DEFAULT_ALIASES_PATH });
  const raw = JSON.parse(readFileSync(join(work, 'overlap.json'), 'utf8')) as { code: string; label: string; tags: string[] }[];
  const excluded = new Set<string>(excludePath ? (JSON.parse(readFileSync(excludePath, 'utf8')) as { code: string }[]).map((k) => canonicalCode(k.code)) : []);
  const labels = file.usdaLabels;
  const labelSet = new Set(labels);

  const all: OverlapPair[] = [];
  let noLabel = 0;
  let dropped = 0;
  for (const r of raw) {
    if (excluded.has(r.code)) {
      dropped += 1;
      continue;
    }
    if (!labelSet.has(r.label)) {
      noLabel += 1; // a USDA label the catalogue's USDA rows do not carry (cannot occur from the same feed; counted anyway)
      continue;
    }
    all.push({ code: r.code, label: r.label, chain: chainOf(r.tags, tax, tree) });
  }
  const judged = all.filter((p) => p.chain.length > 0);
  log(`link: ${raw.length} overlapping barcodes, ${dropped} excluded (answer key), ${noLabel} with a label the catalogue lacks, ${judged.length} with an Open Food Facts chain on the tree`);

  const { train, test } = splitHoldout(all);
  log(`link: hold-out split: ${train.length} train / ${test.length} test barcodes (${train.filter((p) => p.chain.length).length} / ${test.filter((p) => p.chain.length).length} with a chain)`);

  // Method 1 on the training half, scored on the other.
  const trainBarcode = linkByBarcode(train, tree.depthOf);
  const trainFallback = linkByCommonAncestor(train, tree.depthOf);
  const trainCounts = new Map<string, number>();
  for (const p of train) if (p.chain.length) trainCounts.set(p.label, (trainCounts.get(p.label) ?? 0) + 1);

  // Method 2: embed the labels and the nodes once.
  let nodeVecs: NodeVector[] = [];
  const labelVecs = new Map<string, Float32Array>();
  let meaningRan = false;
  if (modelDir) {
    const embedder = await onnxE5Embedder(modelDir, { threads: 8 });
    const names = loadLabelNames('food', { foodPath: join(dataDir, 'off-categories.json') });
    const nodeTags = Object.keys(file.nodes).filter((t) => /^en:/.test(t)).sort();
    const nodeTexts = nodeTags.map((t) => labelTextOf(t, names));
    const t0 = Date.now();
    const nv: Float32Array[] = [];
    for (let i = 0; i < nodeTexts.length; i += 64) nv.push(...(await embedSymmetric(embedder, nodeTexts.slice(i, i + 64))));
    nodeVecs = nodeTags.map((tag, i) => ({ tag, vec: nv[i]! }));
    const lv = await embedSymmetric(embedder, labels.map((l) => l));
    labels.forEach((l, i) => labelVecs.set(l, lv[i]!));
    meaningRan = true;
    log(`link: embedded ${nodeTags.length} en: node names and ${labels.length} USDA labels in ${((Date.now() - t0) / 1000).toFixed(0)}s (${embedder.id})`);
  } else {
    log('link: NO --model-dir: method 2 (meaning) did not run; its labels fall to the fallback');
  }

  // Choose the meaning threshold and climb ON THE TRAINING HALF: over labels the barcode method mapped
  // there (a known answer), how often does the meaning node contain their TRAINING barcodes?
  let chosen: Chosen = { threshold: null, climb: 0, why: meaningRan ? 'no setting reached the share on the training half' : 'no model' };
  const grid: string[] = [];
  if (meaningRan) {
    const known = new Map([...trainBarcode].map(([l, v]) => [l, v]));
    const trainByLabel = new Map<string, OverlapPair[]>();
    for (const p of train) if (p.chain.length && known.has(p.label)) (trainByLabel.get(p.label) ?? trainByLabel.set(p.label, []).get(p.label)!).push(p);
    let best: { threshold: number; climb: number; score: number } | null = null;
    for (const climb of CLIMBS) {
      for (const th of THRESHOLDS) {
        const m = linkByMeaning(labelVecs, nodeVecs, th, { climb, parentOf: tree.parentOf });
        let n = 0;
        let ok = 0;
        let nl = 0;
        for (const [l, link] of m) {
          const ps = trainByLabel.get(l);
          if (!ps) continue;
          nl += 1;
          for (const p of ps) {
            n += 1;
            if (p.chain.includes(link.node!)) ok += 1;
          }
        }
        const share = n === 0 ? NaN : ok / n;
        grid.push(`climb ${climb} threshold ${th.toFixed(2)}: ${nl} known labels covered, containment ${(share * 100).toFixed(1)}% of ${n} training barcodes`);
        if (nl >= 20 && share >= MIN_SHARE && (best === null || climb < best.climb || (climb === best.climb && th < best.threshold))) best = { threshold: th, climb, score: share };
      }
    }
    if (best) chosen = { threshold: best.threshold, climb: best.climb, why: `lowest climb, then lowest threshold, whose containment on the training half is ${(best.score * 100).toFixed(1)}% (>= ${MIN_SHARE * 100}%) over 20+ known labels` };
    for (const g of grid) log(`link: grid ${g}`);
    log(`link: meaning setting chosen on the training half: ${JSON.stringify(chosen)}`);
  }
  const meaningWith = (th: number | null, climb: number): Map<string, LabelLink> => (th === null || !meaningRan ? new Map() : linkByMeaning(labelVecs, nodeVecs, th, { climb, parentOf: tree.parentOf }));

  const trainLinks = assembleLinks(labels, trainBarcode, meaningWith(chosen.threshold, chosen.climb), trainFallback, trainCounts);
  const score = scoreLinks(trainLinks, test, tree.depthOf);
  const methodCounts = (links: ReadonlyMap<string, LabelLink>) => {
    const c: Record<string, number> = { barcode: 0, meaning: 0, fallback: 0, fallbackTop: 0 };
    for (const l of links.values()) {
      c[l.method]! += 1;
      if (l.method === 'fallback' && l.node === null) c.fallbackTop! += 1;
    }
    return c;
  };
  log(`link: TRAIN-half mapping labels per method ${JSON.stringify(methodCounts(trainLinks))}`);
  const lines: Record<string, unknown> = {};
  for (const m of ['barcode', 'meaning', 'fallback'] as LabelMethod[]) {
    const s = score[m];
    lines[m] = { ...s, containedShare: s.barcodes ? +(s.contained / s.barcodes).toFixed(4) : null, exactShare: s.barcodes ? +(s.exact / s.barcodes).toFixed(4) : null, meanDepth: +s.meanDepth.toFixed(2) };
    log(`link: HELD-OUT ${m}: ${s.labels} labels, ${s.barcodes} barcodes: contained ${s.contained} (${s.barcodes ? ((s.contained / s.barcodes) * 100).toFixed(1) : 'n/a'}%), exact ${s.exact}, mean depth ${s.meanDepth.toFixed(2)}`);
  }
  // The same held-out barcodes against the "everything under the food top" mapping the old build made.
  const topOnly = new Map([...trainLinks].map(([l]) => [l, { node: null, method: 'fallback' as const, barcodes: 0, share: null }]));
  const topScore = scoreLinks(topOnly, test, tree.depthOf).fallback;
  log(`link: HELD-OUT control, every label under the food top (the old build): contained ${topScore.contained} of ${topScore.barcodes}, mean depth 0`);

  // The shipped mapping: all barcodes.
  const allBarcode = linkByBarcode(all, tree.depthOf);
  const allFallback = linkByCommonAncestor(all, tree.depthOf);
  const allCounts = new Map<string, number>();
  for (const p of all) if (p.chain.length) allCounts.set(p.label, (allCounts.get(p.label) ?? 0) + 1);
  const finalLinks = assembleLinks(labels, allBarcode, meaningWith(chosen.threshold, chosen.climb), allFallback, allCounts);
  const parameters = {
    built: new Date().toISOString().slice(0, 10),
    minBarcodes: MIN_BARCODES,
    minShare: MIN_SHARE,
    minAgreeBarcodes: MIN_AGREE_BARCODES,
    meaning: { model: meaningRan ? 'Xenova/multilingual-e5-small' : null, threshold: chosen.threshold, climb: chosen.climb, chosenBy: chosen.why },
    overlapBarcodes: all.length,
    overlapWithChain: judged.length,
    excludedBarcodes: dropped,
    heldOut: lines,
    labelsPerMethod: methodCounts(finalLinks),
    taxonomySha256: tax.sha256,
    note: 'Mapped node = the node the label hangs under in the placement tree. barcode: deepest en: node carried by >= minShare of the label\'s barcodes present in both USDA and Open Food Facts. meaning: nearest en: node by name meaning. fallback: deepest node every overlapping barcode carries, else the food top (null).',
  };
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, serializeFoodLabelMap(finalLinks, parameters));
  const fc = methodCounts(finalLinks);
  log(`link: wrote ${out}: ${finalLinks.size} labels; per method ${JSON.stringify(fc)}`);
  writeFileSync(join(work, 'link-report.json'), JSON.stringify({ parameters, trainLinkCounts: methodCounts(trainLinks), heldOut: lines, control: topScore, grid }, null, 1));
}

/* ------------------------------------------------------------------ main */

export async function main(argv: readonly string[]): Promise<number> {
  const stage = arg('--stage', argv) ?? 'all';
  const work = arg('--work', argv);
  const dataDir = arg('--data-dir', argv);
  if (!work || !dataDir) {
    console.error('build-food-label-map FAILED: --work and --data-dir are required');
    return 2;
  }
  mkdirSync(work, { recursive: true });
  const t0 = Date.now();
  const log = (l: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${l}`);
  const real = arg('--real', argv) ?? REAL_DEFAULT;
  try {
    const stages = stage === 'all' ? ['tree', 'overlap', 'link'] : [stage];
    for (const s of stages) {
      if (s === 'tree') stageTree(work, real, dataDir, log);
      else if (s === 'overlap') await stageOverlap(work, arg('--feeds', argv) ?? folderOfUri(real), log);
      else if (s === 'link') await stageLink(work, dataDir, arg('--model-dir', argv) ?? '', arg('--out', argv) ?? FOOD_LABEL_MAP_PATH, arg('--exclude', argv), log);
      else throw new Error(`unknown stage ${s}`);
    }
    return 0;
  } catch (err) {
    console.error(`build-food-label-map FAILED: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}

